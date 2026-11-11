import { readdir, copyFile, mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", (error) =>
      reject(new Error(`Cannot run ${command}: ${error.message}`)),
    );
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)),
    );
  });
}
const group = process.argv[2] || "all";
if (!["all", "js", "go"].includes(group)) throw new Error("Choose js, go, or all.");
if (group !== "go") {
  const files = (await readdir("test"))
    .filter((file) => file.endsWith(".test.mjs"))
    .sort();
  await run(process.execPath, ["--test", ...files.map((file) => join("test", file))]);
}
if (group !== "js") {
  const configuredGo = process.env.GO_BINARY || "go";
  const go = /[\\/]/.test(configuredGo) ? resolve(configuredGo) : configuredGo;
  await run(go, ["test", ...(process.argv.includes("--race") ? ["-race"] : []), "./..."]);
  // The downloaded fragment is built with the same supplied types as an upload.
  const directory = await mkdtemp(join(tmpdir(), "somas-example-"));
  try {
    for (const [source, target] of [
      ["public/example.go", "agent.go"],
      ["runner/wrapper.go", "wrapper.go"],
      ["runner/view1.go", "view.go"],
    ]) {
      await copyFile(source, join(directory, target));
    }
    await run(
      go,
      [
        "build",
        "-o",
        join(directory, process.platform === "win32" ? "agent.exe" : "agent"),
        "agent.go",
        "wrapper.go",
        "view.go",
      ],
      { cwd: directory },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
