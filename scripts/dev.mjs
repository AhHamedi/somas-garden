import { config } from "dotenv";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { resolve, extname, dirname } from "node:path";
import { createHandler } from "../api/controller.mjs";
import { createLocalStore } from "../lib/storage-local.mjs";
import { createCloudStore } from "../lib/storage-cloud.mjs";
import { goBinary } from "./go.mjs";
import { createGroupService, readGroupCatalog } from "../lib/society-groups.mjs";
import { verifyCourseworkRun } from "../lib/society-coursework-run.mjs";
import {
  groupRoute,
  importGroupBehaviour,
  publicEngineRoute,
} from "../lib/society-group-runtime.mjs";

const hosted = process.argv.includes("--hosted");
if (hosted) {
  config({ path: ".env.local" });
  config({ path: ".local/runner.env" });
  for (const name of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SELFORG_ENGINE_SECRET",
  ])
    if (!process.env[name]) {
      console.error(`${name} is required for hosted development. See hosting/README.md.`);
      process.exit(1);
    }
}
function port(name, fallback) {
  const value = process.env[name] ?? String(fallback);
  if (!/^\d+$/.test(value) || Number(value) > 65535)
    throw new Error(`${name} must be a port from 0 to 65535.`);
  return Number(value);
}
const stateFile = resolve(process.env.DEV_SESSION_FILE || ".local/dev.json");
const publicRoot = resolve("public");
const engineSecret = hosted
  ? process.env.SELFORG_ENGINE_SECRET
  : randomBytes(32).toString("hex");
const adminPassword = hosted
  ? process.env.SELFORG_ADMIN_PASSWORD
  : randomBytes(24).toString("hex");
let engine,
  server,
  shuttingDown = false;

async function stop(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  let stopped = Promise.resolve();
  if (engine && engine.exitCode === null && engine.signalCode === null) {
    stopped = new Promise((done) => {
      const timeout = setTimeout(() => engine.kill("SIGKILL"), 3000);
      timeout.unref();
      engine.once("close", () => {
        clearTimeout(timeout);
        done();
      });
    });
    engine.kill();
  }
  if (server?.listening) {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
  try {
    const state = JSON.parse(await readFile(stateFile, "utf8"));
    if (state.pid === process.pid) await rm(stateFile, { force: true });
  } catch (error) {
    if (error.code !== "ENOENT")
      console.error("Could not remove the local session file.");
  }
  await stopped;
  process.exit(code);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
process.on("exit", () => engine?.kill());
if (process.env.DEV_CONTROL_STDIN === "1") {
  const input = createInterface({ input: process.stdin });
  input.on("line", (line) => {
    if (line.trim() === "stop") void stop();
  });
  input.on("close", () => void stop());
}

async function startEngine(binary, enginePort) {
  engine = spawn(binary, [], {
    env: {
      ...process.env,
      ENGINE_PORT: String(enginePort),
      SELFORG_ENGINE_SECRET: engineSecret,
      GO_BINARY: goBinary(),
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  return new Promise((done, fail) => {
    const timeout = setTimeout(
      () => fail(new Error("The simulation server did not start within 15 seconds.")),
      15000,
    );
    let buffer = "";
    engine.once("error", (error) => {
      clearTimeout(timeout);
      fail(error);
    });
    engine.once("exit", (code) => {
      clearTimeout(timeout);
      if (!shuttingDown) {
        fail(new Error(`The simulation server stopped (${code ?? "signal"}).`));
        if (server?.listening) void stop(1);
      }
    });
    engine.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/SOMAS_ENGINE_URL=(http:\/\/127\.0\.0\.1:\d+)\r?\n/);
      if (match) {
        clearTimeout(timeout);
        done(match[1]);
      }
    });
  });
}

function route(url) {
  const names = {
    "/api/capabilities": "capabilities",
    "/api/agents": "agents",
    "/api/builder": "builder",
    "/api/runs": "runs",
    "/api/moderate": "moderate",
  };
  if (names[url.pathname]) return { route: names[url.pathname] };
  const source = url.pathname.match(/^\/api\/agents\/([^/]+)\/source$/);
  if (source) return { route: "source", id: source[1] };
  const replay = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
  if (replay) return { route: "replay", id: replay[1] };
}

try {
  const httpPort = port("PORT", 8787),
    enginePort = port("ENGINE_PORT", 8802);
  await mkdir(dirname(stateFile), { recursive: true });
  const binary = resolve(
    dirname(stateFile),
    process.platform === "win32" ? "garden-engine.exe" : "garden-engine",
  );
  const built = spawnSync(goBinary(), ["build", "-o", binary, "./cmd/dev"], {
    stdio: "inherit",
  });
  if (built.error?.code === "ENOENT")
    throw new Error(
      "Go was not found. Install Go 1.23 or newer, or set GO_BINARY to its executable.",
    );
  if (built.error) throw built.error;
  if (built.status !== 0)
    throw new Error("The simulation server could not compile. See the Go error above.");
  const engineOrigin = await startEngine(binary, enginePort);
  const groupDirectory = resolve(process.env.SOCIETY_TEAMS_DIR || "teams");
  const getCatalog = () => readGroupCatalog(groupDirectory);
  const groups = createGroupService({
    getCatalog,
    compile: (behaviour) =>
      importGroupBehaviour({ origin: engineOrigin, token: engineSecret }, behaviour),
  });
  const store = hosted
    ? createCloudStore()
    : createLocalStore(resolve(process.env.LOCAL_DATA_DIR || ".local/data"));
  const handler = createHandler({
    store,
    engineOrigin,
    engineSecret,
    adminPassword,
    goUploads: hosted && Boolean(process.env.SELFORG_GO_SNAPSHOT),
  });
  server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname.startsWith("/api/society/")) {
        const path = url.pathname.slice("/api/society/".length);
        if (!groupRoute.test(path) && !publicEngineRoute.test(path)) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Game endpoint not found." }));
          return;
        }
        // Keep the internal service secret on the server. Local strategy uploads
        // and simulation mutations must originate from this same application.
        if (
          req.method !== "GET" &&
          req.headers.origin &&
          req.headers.origin !== `http://${req.headers.host}`
        ) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ error: "Use the simulation's own window for this action." }),
          );
          return;
        }
        const parts = [];
        let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 2 * 1024 * 1024) {
            res.writeHead(413, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Request is too large." }));
            return;
          }
          parts.push(chunk);
        }
        const body = Buffer.concat(parts);
        if (groupRoute.test(path)) {
          try {
            const reply = await groups({
              method: req.method,
              path,
              body,
            });
            res.writeHead(200, {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            });
            res.end(JSON.stringify(reply));
          } catch (error) {
            const status = error.status >= 400 && error.status < 500 ? error.status : 503;
            res.writeHead(status, {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            });
            res.end(
              JSON.stringify({
                error:
                  status === 503 ? "The group library is unavailable." : error.message,
              }),
            );
          }
          return;
        }
        if (path === "runs" && req.method === "POST")
          await verifyCourseworkRun(body, getCatalog);
        const upstream = await fetch(engineOrigin + url.pathname + url.search, {
          method: req.method,
          headers: {
            Authorization: `Bearer ${engineSecret}`,
            "Content-Type": "application/json",
          },
          ...(req.method === "GET" ? {} : { body }),
          signal: AbortSignal.timeout(120000),
        });
        res.writeHead(upstream.status, {
          "Content-Type": upstream.headers.get("content-type") || "application/json",
          "Cache-Control": "no-store",
          ...(upstream.headers.has("content-disposition")
            ? { "Content-Disposition": upstream.headers.get("content-disposition") }
            : {}),
        });
        for await (const chunk of upstream.body) {
          if (res.destroyed) break;
          if (!res.write(chunk)) await new Promise((done) => res.once("drain", done));
        }
        res.end();
        return;
      }
      req.query = route(url);
      if (req.query) return await handler(req, res);
      const pathname =
        url.pathname === "/"
          ? process.env.DEV_LEGACY_HOME === "1"
            ? "/index.html"
            : "/society.html"
          : url.pathname === "/legacy"
            ? "/index.html"
            : url.pathname === "/manage"
              ? "/manage.html"
              : decodeURIComponent(url.pathname);
      const path = resolve(publicRoot, "." + pathname);
      if (!path.startsWith(publicRoot + (process.platform === "win32" ? "\\" : "/"))) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      const contents = await readFile(path);
      const mime = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "text/javascript",
        ".go": "text/plain",
      };
      res.setHeader("Content-Type", mime[extname(path)] || "application/octet-stream");
      res.setHeader("Cache-Control", "no-store");
      res.end(contents);
    } catch (error) {
      if (error.status >= 400 && error.status < 500) {
        res.writeHead(error.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error.message }));
      } else {
        const missing = error.code === "ENOENT" || error.code === "EISDIR";
        res.writeHead(missing ? 404 : 500);
        res.end(missing ? "Not found" : "The request could not finish.");
      }
    }
  });
  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(httpPort, "127.0.0.1", done);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await mkdir(dirname(stateFile), { recursive: true });
  await writeFile(
    stateFile,
    JSON.stringify(
      {
        pid: process.pid,
        origin,
        engineOrigin,
        engineSecret,
        adminPassword,
        storage: store.mode,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(`SOMAS: ${origin} (${hosted ? "hosted services" : "local storage"})`);
} catch (error) {
  console.error(
    error.code === "EADDRINUSE"
      ? "The development port is already in use. Stop the other server or set PORT and ENGINE_PORT."
      : error.message,
  );
  await stop(1);
}
