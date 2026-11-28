import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { verifyCourseworkRun } from "../lib/society-coursework-run.mjs";

const source = "package main\nfunc Decide(v View) Action { return Action{} }\n";
const builder = { harvest: 3, eat: 2, vote: "yes" };
const name = "Gardeners";
function fixture(group, kind) {
  const revision = createHash("sha256")
    .update(
      JSON.stringify([name, kind, kind === "go" ? source : JSON.stringify(builder)]),
    )
    .digest("hex");
  const coursework = {
    group,
    path: `teams/group-${group}/${kind === "go" ? "agent.go" : "builder.json"}`,
    revision,
    repository: "course/game",
    commit: "b".repeat(40),
  };
  const payload = kind === "go" ? { source } : { policy: "builder", builder };
  const team =
    kind === "go"
      ? {
          policy: "custom",
          strategyId: createHash("sha256")
            .update(name + "\0" + source)
            .digest("hex")
            .slice(0, 32),
        }
      : payload;
  return {
    entry: { ...coursework, kind, payload, name },
    team: { ...team, coursework, name },
  };
}
const one = fixture(1, "go"),
  two = fixture(2, "builder");
const entries = [one.entry, two.entry];
const verify = (...teams) =>
  verifyCourseworkRun(Buffer.from(JSON.stringify({ teams })), () => entries);

test("normal rosters avoid catalogue reads; all registered teams share one read", async () => {
  await verifyCourseworkRun(
    '{"teams":[{"name":"local","policy":"warden"}]}',
    assert.fail,
  );
  let reads = 0;
  await verifyCourseworkRun(
    JSON.stringify({ teams: [one.team, { ...two.team, copies: 24, color: "#123456" }] }),
    () => {
      reads++;
      return entries;
    },
  );
  assert.equal(reads, 1);
});

test("an attributed team must run the selected Go binary or builder under its registered name", async () => {
  for (const change of [
    { ...one.team, strategyId: "f".repeat(32) },
    { ...one.team, name: "Another group" },
    { ...one.team, builder },
    { ...two.team, policy: "warden" },
    { ...two.team, strategyId: one.team.strategyId },
    { ...two.team, builder: { ...builder, harvest: 4 } },
  ])
    await assert.rejects(verify(change), { status: 400 });
  await verify({ ...two.team, builder: { vote: "yes", eat: 2, harvest: 3 } });
});

test("stale drafts and altered source or deployment metadata require reselection", async () => {
  for (const patch of [
    { group: 6 },
    { path: two.team.coursework.path },
    { commit: "e".repeat(40) },
    { repository: "another/fork" },
    { revision: "3".repeat(64) },
  ]) {
    await assert.rejects(
      verify({ ...one.team, coursework: { ...one.team.coursework, ...patch } }),
      { status: 409 },
    );
  }
});

test("coursework verification requires unambiguous JSON and canonical roster fields", async () => {
  const roster = JSON.stringify({ teams: [one.team] });
  for (const body of [
    roster.replace('"teams"', '"Teams"'),
    roster.replace('"coursework"', '"Coursework"'),
    '{"teams":[{"coursework":{}}],"teams":[]}',
  ])
    await assert.rejects(verifyCourseworkRun(body, assert.fail), { status: 400 });
});
