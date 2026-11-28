import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const checker = fileURLToPath(new URL("../scripts/check-group-pr.mjs", import.meta.url));

test("fork PR scope distinguishes coursework submissions from simulator changes", () => {
  for (const [paths, expected] of [
    [[], 0],
    [["README.md", "teams/README.md"], 0],
    [["teams/group-2/team.json", "teams/group-2/agent.go"], 0],
    [["teams/group-1/agent.go", "teams/group-2/agent.go"], 1],
    [["public/society-example.go", "teams/group-2/agent.go"], 1],
    [["teams/group-2/agent.go", "teams/group-20/agent.go"], 1],
    [["teams/group-2/notes\n::error::anything"], 0],
    [["teams/group-2/agent.go", "foo\n::error::anything"], 1],
    [[...Array(3001).fill("README.md"), "teams/group-6/builder.json"], 1],
  ]) {
    const result = spawnSync(process.execPath, [checker], {
      input: paths.join("\0") + "\0",
      encoding: "utf8",
    });
    assert.equal(result.status, expected, result.stderr);
    assert.doesNotMatch(result.stderr, /::error::anything/);
    if (expected) assert.match(result.stderr, /upstream\/main/);
  }
});
