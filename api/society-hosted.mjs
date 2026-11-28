import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  sessionIdentity,
  requestAllowed,
  clientIdentity,
} from "../lib/society-hosted-session.mjs";
import { hostedSandbox } from "../lib/society-hosted-sandbox.mjs";
import { claimSocietySession } from "../lib/society-hosted-limits.mjs";
import { createGroupService } from "../lib/society-groups.mjs";
import { verifyCourseworkRun } from "../lib/society-coursework-run.mjs";
import {
  groupRoute,
  importGroupBehaviour,
  publicEngineRoute,
} from "../lib/society-group-runtime.mjs";

// Configuration is a build asset: health checks and empty visits must not
// reserve a Drive or a whole server snapshot. Retry a failed asset read.
function jsonAsset(url) {
  let cached;
  return () =>
    (cached ||= readFile(url, "utf8")
      .then(JSON.parse)
      .catch((error) => {
        cached = undefined;
        throw error;
      }));
}
const hostedConfig = jsonAsset(new URL("../runner/society-config.json", import.meta.url));
const hostedGroups = jsonAsset(new URL("../runner/society-groups.json", import.meta.url));

const MAX_BODY = 2 * 1024 * 1024;
async function readBody(req) {
  if (req.body !== undefined) {
    const value = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body));
    if (value.length > MAX_BODY)
      throw Object.assign(new Error("Request is too large."), { status: 413 });
    return value;
  }
  const parts = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BODY)
      throw Object.assign(new Error("Request is too large."), { status: 413 });
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}

export function createSocietyProxy({
  getSandbox = hostedSandbox,
  claim = claimSocietySession,
  getConfig = hostedConfig,
  getCatalog = hostedGroups,
  env = process.env,
} = {}) {
  return async function societyProxy(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Cookie");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      if (!["GET", "POST"].includes(req.method))
        throw Object.assign(new Error("Unsupported request."), { status: 405 });
      const allowed = [
        "https://somas.sites.moonisolutions.net",
        "https://mooni-selforg.vercel.app",
        env.VERCEL_URL && `https://${env.VERCEL_URL}`,
        env.VERCEL_BRANCH_URL && `https://${env.VERCEL_BRANCH_URL}`,
      ].filter(Boolean);
      if (!requestAllowed(req, allowed))
        throw Object.assign(new Error("Open the game in its own window to continue."), {
          status: 403,
        });
      const url = new URL(req.url, "https://game.invalid");
      const path =
        url.searchParams.get("path") ??
        req.query?.path ??
        url.pathname.replace(/^\/api\/society\/?/, "");
      if (!publicEngineRoute.test(path) && !groupRoute.test(path))
        throw Object.assign(new Error("Game endpoint not found."), { status: 404 });
      const scope = env.VERCEL_ENV === "production" ? "production" : "preview";
      const body = req.method === "POST" ? await readBody(req) : undefined;
      const identity = sessionIdentity(
        req.headers.cookie,
        env.SELFORG_ENGINE_SECRET,
        scope,
      );
      res.setHeader("Set-Cookie", identity.cookie);
      if (path === "config" && req.method === "GET") {
        const config = await getConfig();
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 200;
        res.end(JSON.stringify(config));
        return;
      }
      async function openWorkspace(allowCreate) {
        const quota = await claim({
          sessionId: identity.id,
          clientKey: clientIdentity(req, env.SELFORG_ENGINE_SECRET),
          environment: scope,
        });
        if (!quota.allowed) {
          if (quota.retryAfter) res.setHeader("Retry-After", String(quota.retryAfter));
          throw Object.assign(
            new Error(
              quota.message || "New game sessions are busy. Please try again later.",
            ),
            { status: 429 },
          );
        }
        return getSandbox(identity, { allowCreate });
      }
      if (groupRoute.test(path)) {
        // Only importing a published Go behaviour needs a persistent workspace.
        const groups = createGroupService({
          getCatalog,
          compile: async (behaviour) =>
            importGroupBehaviour(await openWorkspace(true), behaviour),
        });
        const result = await groups({ method: req.method, path, body });
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }
      if (path === "runs" && req.method === "POST")
        await verifyCourseworkRun(body, getCatalog);
      const mayCreate = req.method === "POST" && ["runs", "strategies"].includes(path);
      const host = await openWorkspace(mayCreate);
      if (!host) {
        if (req.method === "GET" && ["runs", "strategies"].includes(path)) {
          res.setHeader("Content-Type", "application/json");
          res.statusCode = 200;
          res.end(JSON.stringify({ [path]: [] }));
          return;
        }
        throw Object.assign(
          new Error("This item is not in this browser’s saved workspace."),
          { status: 404 },
        );
      }
      url.searchParams.delete("path");
      const upstream = await fetch(`${host.origin}/api/society/${path}${url.search}`, {
        method: req.method,
        headers: {
          Authorization: `Bearer ${host.token}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(120000),
      });
      res.statusCode = upstream.status;
      res.setHeader(
        "Content-Type",
        upstream.headers.get("content-type") || "application/json",
      );
      if (upstream.headers.has("content-disposition"))
        res.setHeader("Content-Disposition", upstream.headers.get("content-disposition"));
      if (upstream.body) await pipeline(Readable.fromWeb(upstream.body), res);
      else res.end();
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const capacity =
        (error.status === 402 ||
          error.response?.status === 402 ||
          /Status code 402/.test(error.message || "")) &&
        /storage|Drive|snapshot/i.test(error.message || "");
      const status = error.status >= 400 && error.status < 500 ? error.status : 503;
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      if (status === 503)
        console.error(
          "Hosted society request failed:",
          error.name,
          error.code || "",
          error.message?.replace(/Bearer\s+\S+/g, "Bearer [redacted]").slice(0, 350),
        );
      res.end(
        JSON.stringify({
          error: capacity
            ? "The server has reached its storage capacity. Your saved worlds are safe, but a new workspace cannot start until space is freed."
            : status === 503
              ? "The game server could not start. Please try again shortly."
              : error.message,
        }),
      );
    }
  };
}

export default createSocietyProxy();
