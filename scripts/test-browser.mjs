import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";

const groups = {
  core: [
    "local-browser-check",
    "builder-browser-check",
    "results-browser-check",
    "investigation-browser-check",
    "guide-browser-check",
  ],
  playback: [
    "conversion-browser-check",
    "death-browser-check",
    "queue-browser-check",
    "sunlight-browser-check",
    "sound-turn-check",
    "juice-browser-check",
  ],
  audio: ["juice-audio-check"],
};
const group = process.argv[2] || "core";
if (!Object.hasOwn(groups, group)) throw new Error("Choose core, playback, or audio.");
if (process.env.TEST_ORIGIN)
  throw new Error(
    "This suite starts an isolated local server. Use the explicit test:hosted commands for a deployment.",
  );
const directory = await mkdtemp(join(tmpdir(), "somas-browser-"));
const stateFile = join(directory, "dev.json");
const env = {
  ...process.env,
  PORT: "0",
  ENGINE_PORT: "0",
  LOCAL_DATA_DIR: join(directory, "data"),
  DEV_SESSION_FILE: stateFile,
  DEV_CONTROL_STDIN: "1",
  TEST_STATE_FILE: join(directory, "saved-run.json"),
};
let server, serverExited;
async function start() {
  server = spawn(process.execPath, ["scripts/dev.mjs"], {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", (data) => {
    output += data;
  });
  server.stderr.on("data", (data) => {
    output += data;
  });
  serverExited = new Promise((resolve) => server.once("exit", resolve));
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error("Development server failed to start.\n" + output);
    try {
      const session = JSON.parse(await readFile(stateFile));
      const response = await fetch(session.origin + "/api/capabilities", {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        env.TEST_ORIGIN = session.origin;
        return;
      }
    } catch {
      /* Wait for the build and the server's session file. */
    }
    await delay(100);
  }
  throw new Error("Development server startup timed out.\n" + output);
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  server.stdin.end("stop\n");
  const timeout = setTimeout(() => server.kill(), 10000);
  try {
    await serverExited;
  } finally {
    clearTimeout(timeout);
  }
}
function check(name, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/" + name + ".mjs", ...args], {
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(name + " failed with code " + code)),
    );
  });
}
try {
  await start();
  for (const name of groups[group]) await check(name);
  if (group === "core") {
    await stop();
    await start();
    await check("local-browser-check", ["--reopen"]);
  }
} finally {
  await stop();
  await rm(directory, { recursive: true, force: true });
}
