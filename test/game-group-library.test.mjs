import assert from "node:assert/strict";
import test from "node:test";
import { GroupLibrary, takeGroupLink } from "../public/game/group-library.js";

test("private group links hand the editor its code and remove it from browser history", () => {
  let address;
  const replace = (url) => {
    address = url;
  };
  assert.equal(takeGroupLink("https://game.test/?run=abc", replace), null);
  assert.deepEqual(takeGroupLink("https://game.test/?groups", replace), {
    group: null,
    key: "",
  });
  assert.deepEqual(takeGroupLink("https://game.test/?groups=2#key=example", replace), {
    group: 2,
    key: "example",
  });
  assert.equal(address, "/?groups=2");
  assert.deepEqual(
    takeGroupLink("https://game.test/?groups=99#key=unusable", replace).group,
    null,
  );
  assert.equal(address, "/?groups=99");
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
        return group === 1
          ? { name: "Orchard", id: "go-revision-one" }
          : { name: `Group ${group}`, builder: { harvest: group }, policy: "builder" };
      },
    },
  };
  const lib = new GroupLibrary(setup);
  const entries = Array.from({ length: 6 }, (_, i) => ({
    group: i + 1,
    revision: i + 2,
  }));
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
  });
  assert.deepEqual(setup.draft.teams[1], {
    name: "Group 2",
    policy: "builder",
    builder: { harvest: 2 },
  });
});
