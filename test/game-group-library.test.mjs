import assert from "node:assert/strict";
import test from "node:test";
import {
  GroupLibrary,
  courseworkSource,
  takeGroupLink,
} from "../public/game/group-library.js";
import { migrateTeams } from "../public/game/model.js";

test("group bookmarks open the roster and discard retired codes", () => {
  let address;
  const replace = (url) => {
    address = url;
  };
  assert.equal(takeGroupLink("https://game.test/?run=abc", replace), false);
  assert.equal(takeGroupLink("https://game.test/?groups", replace), true);
  assert.equal(
    takeGroupLink("https://game.test/?groups=2#key=expired&view=plot", replace),
    true,
  );
  assert.equal(address, "/?groups=2#view=plot");
});

const entries = Array.from({ length: 6 }, (_, i) => ({
  group: i + 1,
  path: `teams/group-${i + 1}/${i ? "builder.json" : "agent.go"}`,
  revision: String(i + 1).repeat(64),
}));

test("only repository builds link to the exact checked-out source", () => {
  const source = {
    ...entries[0],
    repository: "course/group-fork",
    commit: "a".repeat(40),
  };
  assert.ok(
    courseworkSource(source).includes(
      `https://github.com/course/group-fork/blob/${source.commit}/${source.path}`,
    ),
  );
  const file = courseworkSource(entries[0]);
  assert.ok(file.includes(entries[0].path));
  assert.ok(file.includes(`SHA-256 <code title="${entries[0].revision}">`));
  for (const patch of [
    { revision: "abc" },
    { commit: "main" },
    { repository: "bad/../tree/other" },
    { repository: "bad/.." },
    { path: "teams/group-2/agent.go" },
  ]) {
    assert.doesNotMatch(courseworkSource({ ...source, ...patch }), /href=/);
  }
});

test("reopening setup keeps the exact pinned repository builder", () => {
  const team = {
    name: "Farms",
    policy: "builder",
    builder: { rules: [{ phase: "harvest", action: { harvest: 3 } }] },
    coursework: entries[1],
  };
  assert.deepEqual(migrateTeams([team], []), [team]);
});
test("a failed six-group import leaves the current lineup intact and a retry pins all six revisions", async (t) => {
  const previous = globalThis.document;
  const tab = { click() {}, focus() {} };
  const dialog = { open: true, querySelectorAll: () => [], querySelector: () => tab };
  globalThis.document = { getElementById: () => dialog };
  t.after(() => {
    if (previous) globalThis.document = previous;
    else delete globalThis.document;
  });
  let fail = true;
  const calls = [];
  const setup = {
    tab: "groups",
    drawBody() {},
    draft: { teams: [{ name: "Original", policy: "minimalist" }] },
    app: {
      api: async (path, body) => {
        const group = Number(path.split("/")[2]);
        calls.push([group, body.revision]);
        if (fail && group === 4) throw new Error("Unable to import group four");
        const coursework = entries[group - 1];
        return group === 1
          ? { name: "Orchard", id: "go-revision-one", coursework }
          : {
              name: `Group ${group}`,
              builder: { harvest: group },
              policy: "builder",
              coursework,
            };
      },
    },
  };
  const lib = new GroupLibrary(setup);
  await lib.use(entries);
  assert.equal(lib.error, "Unable to import group four");
  assert.deepEqual(setup.draft.teams, [{ name: "Original", policy: "minimalist" }]);
  calls.length = 0;
  fail = false;
  await lib.use(entries);
  assert.deepEqual(
    calls,
    entries.map((g) => [g.group, g.revision]),
  );
  assert.equal(setup.draft.teams.length, 6);
  assert.deepEqual(setup.draft.teams[0], {
    name: "Orchard",
    policy: "custom",
    strategyId: "go-revision-one",
    coursework: entries[0],
  });
  setup.draft.teams[0].copies = 7;
  setup.draft = structuredClone(setup.draft);
  await lib.use([entries[0]]);
  assert.equal(setup.draft.teams[0].copies, 7);
  assert.equal(setup.draft.teams.length, 6);

  assert.deepEqual(setup.draft.teams[1], {
    name: "Group 2",
    policy: "builder",
    builder: { harvest: 2 },
    coursework: entries[1],
  });
});

test("closing setup cancels the remainder of a six-team import", async (t) => {
  const dialog = { open: true, querySelectorAll: () => [] };
  const previous = globalThis.document;
  globalThis.document = { getElementById: () => dialog };
  t.after(() => {
    if (previous) globalThis.document = previous;
    else delete globalThis.document;
  });
  let requests = 0;
  const setup = {
    tab: "groups",
    draft: { teams: [] },
    drawBody() {},
    app: {
      async api() {
        requests++;
        dialog.open = false;
        return { name: "Orchard", id: "go", coursework: entries[0] };
      },
    },
  };
  await new GroupLibrary(setup).use(entries);
  assert.equal(requests, 1);
  assert.deepEqual(setup.draft.teams, []);
});
