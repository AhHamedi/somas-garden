import { readFileSync } from "node:fs";

// Git's NUL-delimited paths include both sides of a rename with --no-renames.
// The workflow runs this file from the upstream base commit.
const paths = readFileSync(0, "utf8").split("\0");
const groups = new Set();
let outsideGroup = false;
for (const path of paths) {
  if (!path) continue;
  const match = /^teams\/(group-[1-6])\//.exec(path);
  if (match) groups.add(match[1]);
  else outsideGroup = true;
}
if (groups.size > 1 || (groups.size === 1 && outsideGroup)) {
  console.error(
    "A coursework submission must change only one teams/group-N/ directory. " +
      "Start a clean branch from upstream/main and cherry-pick your agent commits. " +
      "Keep simulator changes in your fork or send them in a separate PR. See teams/README.md.",
  );
  process.exitCode = 1;
}
