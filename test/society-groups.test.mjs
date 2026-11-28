import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  createGroupService,
  deploymentProvenance,
  readGroupCatalog,
} from "../lib/society-groups.mjs";

const source = "package main\nfunc Decide(v View) Action { return Action{} }\n";

async function checkout(t) {
  const dir = await mkdtemp(join(tmpdir(), "somas-teams-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (let n = 1; n <= 6; n++) {
    await mkdir(join(dir, `group-${n}`));
    await writeFile(
      join(dir, `group-${n}`, "team.json"),
      JSON.stringify({ name: `Group ${n}` }),
    );
  }
  return dir;
}

test("six ordered slots, exact source pins, and workspace imports", async (t) => {
  const dir = await checkout(t);
  const loaded = [];
  const provenance = { commit: "a".repeat(40), repository: "team/fork" };
  const route = createGroupService({
    getCatalog: () => readGroupCatalog(dir, provenance),
    compile: async (behaviour) => {
      loaded.push(behaviour);
      return { name: behaviour.name, id: "a".repeat(32) };
    },
  });
  const list = async () => (await route({ method: "GET", path: "groups" })).groups;
  const use = (group, revision) =>
    route({
      method: "POST",
      path: `groups/${group}/use`,
      body: Buffer.from(JSON.stringify({ revision })),
    });
  const empty = await list();
  assert.deepEqual(
    empty.map((entry) => entry.group),
    [1, 2, 3, 4, 5, 6],
  );
  assert.ok(empty.every((entry) => entry.revision === null && entry.kind === null));
  assert.equal(empty[4].path, "teams/group-5");
  await writeFile(join(dir, "group-2", "agent.go"), source);
  await writeFile(join(dir, "group-4", "builder.json"), '{"harvest":3}\n');
  const [go, visual] = (await list()).filter((entry) => entry.kind);
  assert.equal(
    go.revision,
    createHash("sha256")
      .update(JSON.stringify(["Group 2", "go", source]))
      .digest("hex"),
  );
  assert.equal(go.payload, undefined);
  await writeFile(join(dir, "group-2", "README.md"), "How our agent decides.\n");
  assert.equal((await list())[1].revision, go.revision);
  const imported = await use(2, go.revision);
  assert.deepEqual(loaded, [{ name: go.name, source }]);
  assert.deepEqual(imported, {
    name: "Group 2",
    id: "a".repeat(32),
    coursework: {
      group: 2,
      path: "teams/group-2/agent.go",
      revision: go.revision,
      ...provenance,
    },
  });
  assert.deepEqual(await use(4, visual.revision), {
    name: "Group 4",
    policy: "builder",
    builder: { harvest: 3 },
    coursework: {
      group: 4,
      path: "teams/group-4/builder.json",
      revision: visual.revision,
      ...provenance,
    },
  });
  // A withdrawn or modified submission cannot silently replace the chosen one.
  await writeFile(join(dir, "group-2", "agent.go"), source + "\n");
  await assert.rejects(use(2, go.revision), { status: 409 });
  await rm(join(dir, "group-4", "builder.json"));
  await assert.rejects(use(4, visual.revision), { status: 409 });
  await writeFile(join(dir, "group-2", "agent.go"), source);
  await writeFile(join(dir, "group-2", "team.json"), '{"name":"New name"}');
  await assert.rejects(use(2, go.revision), { status: 409 });
  await assert.rejects(use(2, null), { status: 400 });
  assert.equal(loaded.length, 1);
});

test("invalid checkout entries fail with actionable paths", async (t) => {
  const dir = await checkout(t);
  const slot = join(dir, "group-1");
  const check = (pattern) => assert.rejects(() => readGroupCatalog(dir), pattern);
  await writeFile(join(slot, "extra.go"), source);
  await check(/group-1\/extra.go/);
  await rm(join(slot, "extra.go"));
  for (const name of [" ", " name", "é".repeat(41)]) {
    await writeFile(join(slot, "team.json"), JSON.stringify({ name }));
    await check(/group-1\/team.json/);
  }
  await writeFile(join(slot, "team.json"), '{"name":"Test"}');
  await writeFile(join(slot, "agent.go"), "\n");
  await check(/agent.go is empty/);
  await writeFile(join(slot, "agent.go"), "x".repeat(65537));
  await check(/64 KiB/);
  await writeFile(join(slot, "agent.go"), Buffer.from([0xff]));
  await check(/UTF-8/);
  await writeFile(join(slot, "builder.json"), "[]");
  await check(/either agent.go or builder.json/);
  await rm(join(slot, "agent.go"));
  await check(/group-1\/builder.json must contain a JSON object/);
  await mkdir(join(dir, "group-7"));
  await check(/teams\/group-7/);
  await rm(join(dir, "group-7"), { recursive: true });
  await rm(join(dir, "group-6"), { recursive: true });
  await check(/Missing team directories: group-6/);
});

test(
  "symlinks cannot provide a group or its source",
  {
    skip:
      process.platform === "win32" &&
      "creating symlinks can require elevated Windows permissions",
  },
  async (t) => {
    const dir = await checkout(t);
    const behaviour = join(dir, "group-1", "agent.go");
    await symlink(join(dir, "group-1", "team.json"), behaviour);
    await assert.rejects(() => readGroupCatalog(dir), /group-1\/agent.go/);
    await rm(behaviour);
    await rm(join(dir, "group-6"), { recursive: true });
    await symlink(join(dir, "group-5"), join(dir, "group-6"), "dir");
    await assert.rejects(() => readGroupCatalog(dir), /teams\/group-6/);
  },
);

test("only verified-form GitHub build metadata creates a source permalink", () => {
  const env = {
    VERCEL_GIT_PROVIDER: "github",
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
    VERCEL_GIT_REPO_OWNER: "Example",
    VERCEL_GIT_REPO_SLUG: "group.4",
  };
  assert.deepEqual(deploymentProvenance(env), {
    repository: "Example/group.4",
    commit: env.VERCEL_GIT_COMMIT_SHA,
  });
  assert.deepEqual(deploymentProvenance({}), {});
  for (const patch of [
    { VERCEL_GIT_COMMIT_SHA: "main" },
    { VERCEL_GIT_PROVIDER: "gitlab" },
    { VERCEL_GIT_REPO_OWNER: undefined },
    { VERCEL_GIT_REPO_SLUG: "other/repo" },
  ])
    assert.deepEqual(deploymentProvenance({ ...env, ...patch }), {});
});
