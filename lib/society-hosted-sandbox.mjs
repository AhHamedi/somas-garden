import { workspaceDrive, storageFull, freeIdleVolume } from "./society-volumes.mjs";
import { Sandbox } from "@vercel/sandbox";
import { readFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";

const PORT = 8802;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let engineAsset;
async function engine() {
  return (engineAsset ||= Promise.all([
    readFile(new URL("../runner/society-engine", import.meta.url)),
    readFile(new URL("../runner/society-source.json", import.meta.url), "utf8"),
  ]).then(([bytes, source]) => ({
    bytes,
    files: JSON.parse(source).files,
    version: createHash("sha256").update(bytes).digest("hex").slice(0, 20),
  })));
}

// Publications live in the shared database. Checking one uses a disposable
// compiler with no persistent Drive, open port, group code or workspace secret.
export async function validateHostedGroup(
  behaviour,
  {
    snapshotId = process.env.SELFORG_GO_SNAPSHOT,
    create = (opts) => Sandbox.create(opts),
    getEngine = engine,
  } = {},
) {
  if (!snapshotId) throw new Error("The group validator is not configured.");
  const asset = await getEngine();
  const signal = AbortSignal.timeout(105000);
  const vm = await create({
    source: { type: "snapshot", snapshotId },
    region: "lhr1",
    resources: { vcpus: 1 },
    timeout: 120000,
    persistent: false,
    networkPolicy: "deny-all",
    signal,
  });
  const directory = "/vercel/sandbox/publication";
  try {
    await vm.writeFiles(
      [
        { path: `${directory}/engine`, content: asset.bytes, mode: 0o755 },
        {
          path: `${directory}/behaviour.json`,
          content: Buffer.from(JSON.stringify(behaviour)),
        },
        ...asset.files.map((file) => ({
          path: `${directory}/${file.path}`,
          content: Buffer.from(file.content),
        })),
      ],
      { signal },
    );
    const result = await vm.runCommand({
      cmd: `${directory}/engine`,
      args: ["--validate-group", "behaviour.json"],
      cwd: directory,
      env: {
        SOCIETY_DATA_DIR: "/tmp/group-validation",
        GO_BINARY: "/vercel/go/bin/go",
        GOCACHE: "/vercel/gocache",
        GOPATH: "/vercel/gopath",
        GOTOOLCHAIN: "local",
        GOPROXY: "off",
        CGO_ENABLED: "0",
        GOMAXPROCS: "1",
        GOMEMLIMIT: "768MiB",
      },
      timeoutMs: 45000,
      signal,
    });
    if (result.exitCode === 2)
      throw Object.assign(
        new Error(
          (await result.stderr({ signal })).slice(0, 4096).trim() ||
            "The behaviour is invalid.",
        ),
        { status: 400 },
      );
    if (result.exitCode !== 0) throw new Error("The group validator could not finish.");
  } finally {
    await vm.stop({ signal: AbortSignal.timeout(10000) });
  }
}

async function health(sandbox, identity) {
  try {
    const response = await fetch(`${sandbox.domain(PORT)}/health`, {
      headers: { Authorization: `Bearer ${identity.token}` },
      signal: AbortSignal.timeout(2500),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function start(sandbox, identity) {
  const asset = await engine();
  if ((await health(sandbox, identity))?.version === asset.version) return;
  const binary = `/vercel/sandbox/amoeboids-${asset.version}`;
  const suffix = randomBytes(8).toString("hex");
  const incoming = `/vercel/sandbox/upload-${suffix}`;
  const script = `/vercel/sandbox/start-${suffix}.sh`;
  const module = `/vercel/sandbox/module-${asset.version}`;
  const moduleIncoming = `/vercel/sandbox/module-upload-${suffix}`;
  const boot = `#!/bin/bash
set -eu
trap 'rm -f ${incoming} ${script}; rm -rf ${moduleIncoming}' EXIT
if [ ! -x ${binary} ]; then mv ${incoming} ${binary}; fi
if [ ! -d ${module} ]; then mv ${moduleIncoming} ${module}; fi
pid=$(cat /vercel/sandbox/engine.pid 2>/dev/null || true)
exe=$(readlink /proc/$pid/exe 2>/dev/null || true)
case "$exe" in
  /vercel/sandbox/amoeboids-*)
    if [ "$exe" = "${binary}" ]; then exit 0; fi
    kill -TERM "$pid"
    for i in {1..100}; do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
    if kill -0 "$pid" 2>/dev/null; then exit 1; fi
    ;;
esac
cd ${module}
nohup ${binary} > /vercel/sandbox/engine.log 2>&1 < /dev/null &
echo $! > /vercel/sandbox/engine.pid
`;
  await sandbox.writeFiles([
    { path: incoming, content: asset.bytes, mode: 0o755 },
    { path: script, content: Buffer.from(boot), mode: 0o755 },
    ...asset.files.map((file) => ({
      path: `${moduleIncoming}/${file.path}`,
      content: Buffer.from(file.content),
    })),
  ]);
  // The lock prevents concurrent cold requests from starting two writers.
  // Only trusted deployment values enter this command; strategy text never does.
  const launched = await sandbox.runCommand({
    cmd: "flock",
    args: ["--close", "--wait", "35", "/data/boot.lock", "bash", script],
    env: {
      ENGINE_PORT: String(PORT),
      SELFORG_ENGINE_SECRET: identity.token,
      SOCIETY_DATA_DIR: "/data/society",
      SOCIETY_ENGINE_VERSION: asset.version,
      GO_BINARY: "/vercel/go/bin/go",
      GOCACHE: "/vercel/gocache",
      GOPATH: "/vercel/gopath",
      GOTOOLCHAIN: "local",
      GOPROXY: "off",
      CGO_ENABLED: "0",
      GOMAXPROCS: "1",
      GOMEMLIMIT: "768MiB",
    },
  });
  if (launched.exitCode !== 0) throw new Error("The game server could not restart.");
  for (let i = 0; i < 40; i++) {
    if ((await health(sandbox, identity))?.version === asset.version) return;
    await sleep(250);
  }
  throw new Error("Your game server could not start. Please try again.");
}

export async function hostedSandbox(
  identity,
  { allowCreate = true } = {},
  renewed = false,
) {
  const snapshotId = process.env.SELFORG_GO_SNAPSHOT;
  if (!snapshotId) throw new Error("The hosted game is not configured.");
  const drive = await workspaceDrive(identity.name, allowCreate);
  if (!drive) return null;
  let sandbox;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      sandbox = await Sandbox.getOrCreate({
        name: identity.name,
        region: "lhr1",
        source: { type: "snapshot", snapshotId },
        mounts: { "/data": drive },
        ports: [PORT],
        resources: { vcpus: 1 },
        timeout: 300000,
        persistent: true,
        resume: true,
        networkPolicy: "deny-all",
        keepLastSnapshots: { count: 1 },
        snapshotExpiration: 0,
        onCreate: (s) => start(s, identity),
        onResume: (s) => start(s, identity),
      });
      break;
    } catch (error) {
      if (attempt === 0 && storageFull(error) && (await freeIdleVolume(identity.name)))
        continue;
      if (attempt === 3 || (error.status !== 409 && error.response?.status !== 409))
        throw error;
      await sleep(500 * (attempt + 1));
    }
  }
  // The timeout is absolute. Traffic renews it; idle sessions sleep in minutes.
  if (!sandbox.expiresAt || sandbox.expiresAt.getTime() - Date.now() < 150000) {
    try {
      await sandbox.extendTimeout(300000);
    } catch (error) {
      // A session at the plan's maximum lifetime cannot be extended. Drain the
      // engine before replacing its VM, and only then forward the new request.
      // Never retry a simulation mutation whose response might have been lost.
      if (renewed || error.response?.status !== 400) throw error;
      await sandbox.runCommand({
        cmd: "bash",
        args: [
          "-c",
          'pid=$(cat /vercel/sandbox/engine.pid 2>/dev/null || true); exe=$(readlink /proc/$pid/exe 2>/dev/null || true); case "$exe" in /vercel/sandbox/amoeboids-*) kill -TERM "$pid"; for i in {1..120}; do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done;; esac',
        ],
      });
      await sandbox.stop();
      return hostedSandbox(identity, { allowCreate }, true);
    }
  }
  await start(sandbox, identity);
  return { sandbox, origin: sandbox.domain(PORT), token: identity.token };
}
