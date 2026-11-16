// The hosted engine is a private deployment asset, never a public download.
import { spawnSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { goBinary } from "./go.mjs";

const result = spawnSync(
  goBinary(),
  ["build", "-trimpath", "-ldflags=-s -w", "-o", "runner/society-engine", "./cmd/hosted"],
  {
    stdio: "inherit",
    env: { ...process.env, CGO_ENABLED: "0", GOOS: "linux", GOARCH: "amd64" },
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
const files = [{ path: "go.mod", content: "module selforg-garden\n\ngo 1.23\n" }];
for (const name of (await readdir("pkg/society")).sort()) {
  if (name.endsWith(".go") && !name.endsWith("_test.go")) {
    const path = `pkg/society/${name}`;
    files.push({ path, content: await readFile(path, "utf8") });
  }
}
await writeFile("runner/society-source.json", JSON.stringify({ files }));
console.log("Hosted society engine built for Linux.");
