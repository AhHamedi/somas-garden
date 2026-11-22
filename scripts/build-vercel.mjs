// Build every private engine asset from the same source as the web interface.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goBinary } from "./go.mjs";

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed with status ${result.status}`);
}

let toolchain;
try {
  let go = goBinary();
  if (process.env.VERCEL === "1") {
    if (process.platform !== "linux" || process.arch !== "x64")
      throw new Error("The hosted build requires Linux x64.");
    toolchain = await mkdtemp(join(tmpdir(), "selforg-go-"));
    const response = await fetch("https://go.dev/dl/go1.27.3.linux-amd64.tar.gz", {
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`Go download failed: ${response.status}`);
    const archive = Buffer.from(await response.arrayBuffer());
    const digest = createHash("sha256").update(archive).digest("hex");
    if (digest !== "65efbc80fdc1fa2cd2631cad5b481777a68e8725f34e89f50fc6ac714e379b40")
      throw new Error("Go download checksum does not match.");
    const filename = join(toolchain, "go.tar.gz");
    await writeFile(filename, archive);
    run("tar", ["-xzf", filename, "-C", toolchain]);
    go = join(toolchain, "go", "bin", "go");
  }
  // Vercel removes .git before building. Deployment metadata records the commit.
  const env = {
    ...process.env,
    GO_BINARY: go,
    GOFLAGS: `${process.env.GOFLAGS || ""} -buildvcs=false`.trim(),
  };
  run(process.execPath, ["scripts/build-hosted.mjs"], env);
  run(process.execPath, ["scripts/build-hosted-static.mjs"], env);
} finally {
  if (toolchain) await rm(toolchain, { recursive: true, force: true });
}
