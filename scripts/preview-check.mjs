import { requireHostedWrites } from "./support/browser.mjs";
import { config } from "dotenv";
import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
config({ path: ".env.local" });
requireHostedWrites();
const origin = process.env.TEST_ORIGIN;
if (!origin) throw Error("Set TEST_ORIGIN");
const evidence = [];
async function api(path, body, admin = false) {
  const r = await fetch(origin + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(admin ? { Authorization: "Bearer " + process.env.SELFORG_ADMIN_PASSWORD } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  return { status: r.status, ...data };
}
async function upload(name, source) {
  const r = await api("agents", { name, source });
  assert.equal(r.status, 201, JSON.stringify(r));
  return r.agent;
}
const created = [];
try {
  const list = await api("agents");
  assert.equal(list.status, 200, JSON.stringify(list));
  const good = await upload("QA · Friendly", await readFile("public/example.go", "utf8"));
  created.push(good.id);
  const greedy = await upload(
    "QA · Greedy",
    "package main\nfunc Decide(v View) Action{return Action{Food:10,Energy:0}}",
  );
  created.push(greedy.id);
  assert.ok((await api("agents")).agents.some((a) => a.id === good.id));
  assert.match((await api("agents/" + good.id + "/source")).source, /Food: 2/);
  const a = await api("runs", { agents: [good.id], seed: 7 });
  assert.equal(a.status, 200, JSON.stringify(a));
  assert.equal(a.food, 60);
  assert.equal(a.agents[0].totalEnergy, 120);
  assert.equal(a.frames.length, 421);
  const b = await api("runs", { agents: [greedy.id], seed: 7 });
  assert.equal(b.status, 200, JSON.stringify(b));
  assert.notEqual(b.food, a.food);
  assert.equal(b.agents[0].totalEnergy, 0);
  assert.ok(!b.agents[0].error, JSON.stringify(b.agents[0]));
  const replay = await api("runs/" + a.id);
  assert.deepEqual(replay.frames, a.frames);
  evidence.push({
    actualGoChangesOutcomes: true,
    friendlyFinalFood: a.food,
    greedyFinalFood: b.food,
    savedReplay: a.id,
    sharedLibraryPersistence: true,
  });
  const malformed = await api("agents", { name: "Bad", source: "not Go" });
  assert.equal(malformed.status, 400);
  assert.match(malformed.error, /Decide/);
  const compile = await api("agents", {
    name: "Bad",
    source: 'package main\nfunc Decide(v View) Action{return Action{Food:"carrot"}}',
  });
  assert.equal(compile.status, 400);
  assert.match(compile.error, /compile/);
  const unauthorized = await api("moderate", { action: "list" });
  assert.equal(unauthorized.status, 401);
  evidence.push({
    invalidScriptAndCompileErrors: true,
    moderationRequiresPassword: true,
  });
  for (const id of created) {
    assert.equal((await api("moderate", { action: "hide", id }, true)).status, 200);
  }
  assert.ok(!(await api("agents")).agents.some((a) => created.includes(a.id)));
  evidence.push({ hideRemovesAgents: true });
  await writeFile(
    ".local/preview-check.json",
    JSON.stringify({ origin, evidence }, null, 2),
  );
  console.log(JSON.stringify(evidence));
} finally {
  for (const id of created)
    await api("moderate", { action: "hide", id }, true).catch(() => {});
}
