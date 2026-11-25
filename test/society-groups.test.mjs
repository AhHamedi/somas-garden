import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCloudGroupStore,
  createGroupService,
  createLocalGroupStore,
  groupEditKey,
  localGroupSecret,
} from "../lib/society-groups.mjs";

const scope = "preview";
const source = "package main\nfunc Decide(v View) Action { return Action{Harvest: 3} }";
const edit = (route, group, body) =>
  route({ method: "POST", path: `groups/${group}`, body });
const use = (route, group, revision) =>
  route({ method: "POST", path: `groups/${group}/use`, body: { revision } });
const list = async (route) => (await route({ method: "GET", path: "groups" })).groups;

async function library(t) {
  const directory = await mkdtemp(join(tmpdir(), "society-groups-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const secret = await localGroupSecret(directory);
  const key = groupEditKey(secret, scope, 1);
  const draft = { name: "FRED", source, expectedRevision: 0, key };
  const makeRoute = (compile) =>
    createGroupService({
      store: createLocalGroupStore(directory),
      secret,
      scope,
      compile,
    });
  return { directory, secret, draft, makeRoute };
}

test("simultaneous first readers get one persistent local group secret", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "society-group-keys-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const reads = await Promise.all(
    Array.from({ length: 6 }, () => localGroupSecret(directory)),
  );
  assert.equal(new Set(reads).size, 1);
  assert.ok(reads[0].length >= 32);
  assert.equal(await localGroupSecret(directory), reads[0]);
});

test("cloud group lists read metadata and revisions are inserted once in their own environment", async () => {
  for (const environment of ["preview", "production"]) {
    const calls = [];
    const saved = {
      group: 6,
      revision: 2,
      kind: "go",
      name: "Forager",
      updatedAt: "2026-11-25T21:23:00Z",
    };
    const record = { ...saved, payload: { source } };
    const store = createCloudGroupStore(environment, async (path, options = {}) => {
      const url = new URL(path, "https://db.invalid/");
      calls.push({ url, options });
      return url.searchParams.get("select").split(",").includes("payload")
        ? [record]
        : [saved];
    });
    assert.deepEqual(await store.list(), [saved]);
    assert.deepEqual(await store.get(6, 2), record);
    assert.deepEqual(await store.insert(record), saved);
    const [listing, read, write] = calls;
    assert.equal(calls.length, 3);
    assert.equal(listing.url.pathname, "/selforg_society_group_heads");
    assert.equal(listing.url.searchParams.get("environment"), `eq.${environment}`);
    assert.doesNotMatch(listing.url.searchParams.get("select"), /\*|payload|source|key/i);
    assert.equal(read.url.searchParams.get("environment"), `eq.${environment}`);
    assert.equal(read.url.searchParams.get("group_no"), "eq.6");
    assert.equal(read.url.searchParams.get("revision"), "eq.2");
    assert.equal(write.url.pathname, "/selforg_society_group_behaviours");
    assert.equal(write.options.method, "POST");
    assert.deepEqual(write.options.body, {
      environment,
      group_no: 6,
      revision: 2,
      kind: "go",
      name: "Forager",
      payload: { source },
    });
    assert.doesNotMatch(write.url.searchParams.get("select"), /\*|payload|source|key/i);
  }
});

test("hosted edit codes are verified for one group without disclosing the code or requiring a local secret", async () => {
  const key = Buffer.alloc(18, 19).toString("base64url");
  const wrong = Buffer.alloc(18, 31).toString("base64url");
  const keyHash = createHash("sha256").update(key).digest("hex");
  const requests = [];
  const store = createCloudGroupStore("production", async (path) => {
    requests.push(path);
    const url = new URL(path, "https://db.invalid/");
    if (url.pathname === "/selforg_society_group_keys") {
      assert.equal(url.searchParams.get("select"), "key_hash");
      assert.equal(url.searchParams.get("environment"), "eq.production");
      assert.equal(url.searchParams.get("limit"), "1");
      return url.searchParams.get("group_no") === "eq.1" ? [{ key_hash: keyHash }] : [];
    }
    assert.equal(url.pathname, "/selforg_society_group_behaviours");
    return [];
  });
  assert.equal(await store.verifyKey(1, key), true);
  assert.equal(await store.verifyKey(1, wrong), false);
  assert.equal(await store.verifyKey(1, undefined), false);
  await assert.rejects(store.verifyKey(2, key), (error) => error.status === 503);
  const route = createGroupService({ store, scope: "production", compile: assert.fail });
  assert.equal(
    (await route({ method: "POST", path: "groups/1/edit", body: { key } })).group,
    1,
  );
  await assert.rejects(
    edit(route, 1, { key: wrong, name: "FRED", source, expectedRevision: 0 }),
    (error) => error.status === 403,
  );
  assert.ok(requests.every((path) => !path.includes(key) && !path.includes(keyHash)));
});

test("six group slots persist across browsers and revisions are independently usable", async (t) => {
  const { directory, secret, draft, makeRoute } = await library(t);
  const used = [];
  const route = makeRoute(async ({ name }) => ({ name, id: "a".repeat(32) }));
  const reader = makeRoute(async (behaviour) => {
    used.push(behaviour);
    return { name: behaviour.name, id: "b".repeat(32) };
  });
  const empty = await list(route);
  assert.deepEqual(
    empty.map((slot) => slot.group),
    [1, 2, 3, 4, 5, 6],
  );
  assert.ok(empty.every((slot) => slot.revision === 0));
  assert.ok(empty.every((slot) => slot.kind === null));

  const first = await edit(route, 1, draft);
  const secondSource = draft.source.replace("Harvest: 3", "Harvest: 1");
  const changed = { ...draft, expectedRevision: 1, source: secondSource };
  const second = await edit(route, 1, changed);
  assert.equal(first.revision, 1);
  assert.equal(second.revision, 2);
  assert.equal((await edit(route, 1, changed)).revision, 2);
  const editable = await route({
    method: "POST",
    path: "groups/1/edit",
    body: { key: draft.key },
  });
  assert.equal(editable.revision, 2);
  assert.equal(editable.source, secondSource);
  assert.ok(!("key" in editable));
  const visible = await list(reader);
  assert.equal(visible[0].name, draft.name);
  assert.equal(visible[0].revision, 2);
  assert.equal(visible[0].kind, "go");
  for (const metadata of [first, second, ...visible]) {
    for (const field of ["source", "key", "builder", "editKey"])
      assert.ok(!(field in metadata));
  }
  assert.equal((await use(reader, 1, 1)).id, "b".repeat(32));
  assert.equal((await use(reader, 1, 2)).id, "b".repeat(32));
  assert.deepEqual(
    used.map((record) => record.source),
    [draft.source, secondSource],
  );
  assert.equal(await localGroupSecret(directory), secret);
});

test("only the assigned edit code can publish, and a failed compile preserves the previous revision", async (t) => {
  const { secret, draft, makeRoute } = await library(t);
  let builds = 0;
  const route = makeRoute(async ({ name, source }) => {
    builds++;
    if (source === "bad Go")
      throw Object.assign(new Error("compile failed"), { status: 400 });
    return { name, id: "a".repeat(32) };
  });
  for (const key of [
    "wrong",
    groupEditKey(secret, scope, 2),
    groupEditKey(secret, "production", 1),
  ]) {
    await assert.rejects(edit(route, 1, { ...draft, key }), (error) =>
      [401, 403].includes(error.status),
    );
    await assert.rejects(
      route({ method: "POST", path: "groups/1/edit", body: { key } }),
      (error) => [401, 403].includes(error.status),
    );
  }
  assert.equal(builds, 0);
  await edit(route, 1, draft);
  await assert.rejects(
    edit(route, 1, { ...draft, expectedRevision: 1, source: "bad Go" }),
    /compile failed/,
  );
  assert.equal((await list(route))[0].revision, 1);
  await assert.rejects(use(route, 1, 2), (error) => error.status === 404);
  await assert.rejects(use(route, 6, 1), (error) => error.status === 404);
});

test("a saved visual behaviour can be used by another browser and reopened by its group", async (t) => {
  const { draft, makeRoute } = await library(t);
  const builder = { harvest: 3, eat: 2, vote: "yes" };
  const route = makeRoute(async ({ name, policy, builder }) => ({
    name,
    policy,
    builder,
  }));
  const record = {
    name: draft.name,
    key: draft.key,
    expectedRevision: 0,
    builder,
    policy: "warden",
  };
  await edit(route, 1, record);
  assert.equal((await list(route))[0].kind, "builder");
  const used = await use(route, 1, 1);
  assert.equal(used.name, draft.name);
  assert.deepEqual(used.builder, builder);
  assert.equal(used.policy, "warden");
  const editable = await route({
    method: "POST",
    path: "groups/1/edit",
    body: { key: draft.key },
  });
  assert.deepEqual(editable.builder, builder);
  assert.ok(!("source" in editable));
});

test("two editors with the same revision cannot silently replace each other's upload", async (t) => {
  const { draft, makeRoute } = await library(t);
  const compile = async ({ name }) => ({ name, id: "a".repeat(32) });
  const a = makeRoute(compile);
  const b = makeRoute(compile);
  const changes = await Promise.allSettled([
    edit(a, 1, draft),
    edit(b, 1, { ...draft, name: "Different behaviour" }),
  ]);
  assert.equal(changes.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(changes.find((x) => x.status === "rejected").reason.status, 409);
  assert.equal((await list(a))[0].revision, 1);
});

test("publishing rejects empty and oversized behaviours before calling the compiler", async (t) => {
  const { draft, makeRoute } = await library(t);
  const route = makeRoute(async () => assert.fail("invalid upload reached the compiler"));
  for (const patch of [
    { name: " " },
    { source: "" },
    { source: "x".repeat(65537) },
    { expectedRevision: -1 },
  ])
    await assert.rejects(edit(route, 1, { ...draft, ...patch }), (error) =>
      [400, 413].includes(error.status),
    );
  assert.equal((await list(route))[0].revision, 0);
});
