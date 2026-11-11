import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createLocalStore } from "../lib/storage-local.mjs";
import { createCloudStore } from "../lib/storage-cloud.mjs";
import { createHandler } from "../api/controller.mjs";

async function local(t) {
  const directory = await mkdtemp(join(tmpdir(), "somas-storage-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, store: createLocalStore(directory) };
}
const builder = { mode: "simple", fallback: { food: 2, energy: 4 } };
const agentRecord = (name) => ({
  name,
  kind: "builder",
  api_version: 2,
  builder,
  source: "package main\n",
  source_hash: "test",
});
const packedTrace = () => ({
  rounds: 1,
  agents: [{ name: "Amoeboid 1", error: "Agent stopped" }],
  frames: [{ agents: [{}] }, { agents: [{}] }],
  errorStarts: [1],
});

async function request(handler, route, { body, id, headers = {} } = {}) {
  let data;
  const res = {
    setHeader() {},
    end(text) {
      data = JSON.parse(text);
    },
  };
  await handler(
    {
      url: "/api/" + route,
      query: { route, id },
      method: body ? "POST" : "GET",
      body,
      headers,
    },
    res,
  );
  return { status: res.statusCode, data };
}

test("local libraries and runs survive reopening, retain names and protect stored compact traces", async (t) => {
  const { directory, store } = await local(t);
  const agents = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      store.saveAgent(agentRecord("Seedling " + (i + 1))),
    ),
  );
  const id = randomUUID();
  await store.saveRun({ id, seed: 37, trace: packedTrace() });
  const reopened = createLocalStore(directory);
  assert.equal((await reopened.listAgents()).length, 12);
  assert.equal((await reopened.getAgents([agents[0].id]))[0].name, "Seedling 1");
  await Promise.all([store.hideAgent(agents[0].id), reopened.hideAgent(agents[0].id)]);
  assert.equal((await reopened.listAgents()).length, 11);
  assert.equal((await reopened.listAgents(true)).filter((a) => !a.visible).length, 1);
  assert.deepEqual(await reopened.getAgents([agents[0].id]), []);

  const handler = createHandler({ store: reopened });
  const expanded = await request(handler, "replay", { id });
  assert.equal(expanded.status, 200);
  assert.deepEqual(expanded.data.frames[1].agents, [{ error: "Agent stopped" }]);
  const compact = await request(handler, "replay", {
    id,
    headers: { "x-somas-replay": "compact" },
  });
  assert.deepEqual(compact.data.errorStarts, [1]);
  assert.deepEqual((await reopened.getRun(id)).trace, packedTrace());
  assert.deepEqual((await readdir(join(directory, "runs"))).sort(), [id + ".json"]);
});

test("conflicting run saves choose one whole record and unfinished writes stay out of the library", async (t) => {
  const { directory, store } = await local(t);
  const other = createLocalStore(directory);
  const id = randomUUID();
  const first = { id, seed: 1, trace: { complete: "first" } };
  const second = { id, seed: 2, trace: { complete: "second" } };
  const results = await Promise.allSettled([store.saveRun(first), other.saveRun(second)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.deepEqual(await store.getRun(id), first);
  const agent = await store.saveAgent(agentRecord("Fern"));
  await writeFile(
    join(directory, "agents", agent.id + ".json.crashed.tmp"),
    "{unfinished",
  );
  assert.equal((await store.listAgents()).length, 1);
  // Concurrent readers see complete JSON while repeated changes replace the file.
  await Promise.all([
    ...Array.from({ length: 16 }, () => store.hideAgent(agent.id)),
    ...Array.from({ length: 16 }, async () =>
      assert.equal(
        JSON.parse(await readFile(join(directory, "agents", agent.id + ".json"), "utf8"))
          .name,
        "Fern",
      ),
    ),
  ]);
  assert.equal((await store.listAgents(true))[0].visible, false);
});

test("storage failures surface and later writes recover without losing existing records", async (t) => {
  const { directory, store } = await local(t);
  await writeFile(join(directory, "agents"), "A file occupies the agents directory");
  await assert.rejects(
    store.saveAgent(agentRecord("Fern")),
    /Could not save the local agents data/,
  );
  await rm(join(directory, "agents"));
  const saved = await store.saveAgent(agentRecord("Fern"));
  assert.equal((await store.getAgents([saved.id]))[0].name, "Fern");
  assert.equal((await readdir(join(directory, "agents"))).length, 1);
  await writeFile(join(directory, "agents", saved.id + ".json"), "corrupt");
  await assert.rejects(store.listAgents(), /Could not read the local agents data/);
});

test("local leases enforce concurrency across handles and release cleanly", async (t) => {
  const { directory, store } = await local(t);
  const second = createLocalStore(directory);
  const run = await store.claim("run");
  await assert.rejects(second.claim("run"), /busy/);
  const compile = await Promise.all([store.claim("compile"), second.claim("compile")]);
  await assert.rejects(store.claim("compile"), /busy/);
  await second.release(run);
  const next = await store.claim("run");
  await store.release(next);
  await Promise.all(compile.map((lease) => second.release(lease)));
  assert.ok(await store.claim("compile"));
});

test("handler runs local builders and releases its lease after save failures or interrupted simulations", async (t) => {
  const { store } = await local(t);
  const published = await store.saveAgent(agentRecord("Library strategy"));
  let failSave = true;
  const adapted = {
    ...store,
    async saveRun(record) {
      if (failSave) throw new Error("Could not save this run.");
      return store.saveRun(record);
    },
  };
  const handler = createHandler({
    store: adapted,
    engineOrigin: "http://engine.invalid",
    engineSecret: "local-test",
    adminPassword: "local-admin",
  });
  const calls = [];
  let interrupted = false;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push(JSON.parse(options.body));
    assert.equal(options.headers.Authorization, "Bearer local-test");
    if (url.endsWith("?operation=validate")) return Response.json({});
    return interrupted
      ? new Response("interrupted", { status: 503 })
      : Response.json(packedTrace());
  });
  const input = {
    seed: 37,
    settings: { roundLimit: 1 },
    roster: [{ id: "a", name: "Amoeboid 1", strategy: published.id }],
  };
  const failed = await request(handler, "runs", { body: input });
  assert.equal(failed.status, 400);
  assert.match(failed.data.error, /Could not save/);
  failSave = false;
  interrupted = true;
  assert.equal((await request(handler, "runs", { body: input })).status, 503);
  interrupted = false;
  const saved = await request(handler, "runs", { body: input });
  assert.equal(saved.status, 200);
  assert.deepEqual((await store.getRun(saved.data.id)).trace, packedTrace());
  assert.deepEqual(calls.at(-1).slots[0].builder, builder);
  assert.equal(calls.at(-1).slots[0].publicStrategyName, "Library strategy");
  assert.deepEqual((await request(handler, "capabilities")).data, {
    storage: "local",
    goUploads: false,
  });
  const denied = await request(handler, "agents", {
    body: {
      name: "Uploaded",
      source: "package main\nfunc Decide(v View) Action {return Action{}}",
    },
  });
  assert.equal(denied.status, 400);
  assert.match(denied.data.error, /hosted mode/);
  const source = await request(handler, "source", { id: published.id });
  assert.equal(source.status, 200);
  assert.deepEqual(Object.keys(source.data).sort(), [
    "api_version",
    "builder",
    "kind",
    "name",
    "source",
  ]);
  assert.equal(
    (await request(handler, "moderate", { body: { action: "list" } })).status,
    401,
  );
  assert.equal(
    (
      await request(handler, "moderate", {
        body: { action: "hide", id: published.id },
        headers: { authorization: "Bearer local-admin" },
      })
    ).status,
    200,
  );
  assert.equal((await request(handler, "source", { id: published.id })).status, 404);
});

test("cloud storage retains environment isolation, limits and stored replay semantics", async (t) => {
  const old = { ...process.env };
  process.env.SUPABASE_URL = "https://storage.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.VERCEL_ENV = "production";
  t.after(() => {
    for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VERCEL_ENV"]) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  });
  const id = randomUUID(),
    requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({
      url,
      ...options,
      body: options.body ? JSON.parse(options.body) : undefined,
    });
    if (url.endsWith("/rpc/selforg_claim")) return Response.json("lease");
    return Response.json([{ id, trace: packedTrace() }]);
  });
  const store = createCloudStore();
  await store.listAgents();
  await store.listAgents(true);
  await store.getAgents([id]);
  await store.saveAgent(agentRecord("Fern"));
  await store.hideAgent(id);
  await store.saveRun({ id, seed: 37, trace: packedTrace() });
  assert.deepEqual((await store.getRun(id)).trace, packedTrace());
  assert.equal(await store.claim("run", "client-hash"), "lease");
  await store.release("lease");
  for (const request of requests) {
    assert.equal(request.headers.apikey, "test-key");
    if (request.method === "GET" || request.method === "PATCH")
      assert.ok(request.url.includes("environment=eq.production"));
    else assert.equal(request.body.environment ?? request.body.p_env, "production");
  }
  assert.match(requests[0].url, /visible=eq.true.*limit=200$/);
  assert.match(requests[1].url, /limit=300$/);
  assert.equal(requests[5].headers.Prefer, "return=minimal");
  assert.deepEqual(requests[7].body, {
    p_env: "production",
    p_kind: "run",
    p_client: "client-hash",
  });
  process.env.VERCEL_ENV = "preview";
  await store.listAgents();
  assert.match(requests.at(-1).url, /environment=eq.preview/);
});
