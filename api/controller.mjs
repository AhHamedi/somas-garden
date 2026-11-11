import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { expandReplay } from "../public/replay.js";
import { createCloudStore } from "../lib/storage-cloud.mjs";
import { startAgent, validateSource, sourceVersion } from "../lib/runner.mjs";

import { uuid, builtins, agentName, readRun } from "../lib/roster.mjs";

const safeEqual = (a, b) =>
  timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
async function body(req) {
  if (req.body !== undefined) {
    if (Buffer.byteLength(JSON.stringify(req.body)) > 30000)
      throw new Error("Upload is too large.");
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  }
  let size = 0,
    parts = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 30000) throw new Error("Upload is too large.");
    parts.push(chunk);
  }
  return JSON.parse(Buffer.concat(parts).toString() || "{}");
}
function reply(status, data) {
  return { status, data };
}
export function createHandler({
  store = createCloudStore(),
  engineOrigin,
  engineSecret,
  adminPassword,
  goUploads = store.mode === "hosted",
} = {}) {
  async function engine(operation, input) {
    const origin =
      engineOrigin ||
      process.env.SELFORG_ENGINE_ORIGIN ||
      `https://${process.env.VERCEL_URL}`;
    const response = await fetch(
      origin + "/api/engine" + (operation ? "?operation=" + operation : ""),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${engineSecret ?? process.env.SELFORG_ENGINE_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(operation ? 10000 : 75000),
      },
    );
    if (!response.ok) {
      if (response.status === 503 || response.status === 504) {
        const error = new Error("The garden was interrupted. Please run it again.");
        error.status = 503;
        throw error;
      }
      const detail =
        response.status === 400 ? (await response.text()).trim().slice(0, 300) : "";
      throw new Error(detail || "The garden could not finish. Please try again.");
    }
    return response.json();
  }

  async function claim(req, kind) {
    const ip = String(
      req.headers["x-vercel-forwarded-for"] ||
        req.headers["x-forwarded-for"] ||
        req.socket?.remoteAddress ||
        "unknown",
    ).split(",")[0];
    const client = createHmac("sha256", engineSecret ?? process.env.SELFORG_ENGINE_SECRET)
      .update(ip)
      .digest("hex");
    return store.claim(kind, client);
  }

  return async function handler(req, res) {
    const url = new URL(req.url, "https://garden.invalid");
    const route = url.searchParams.get("route") || req.query?.route;
    const id = url.searchParams.get("id") || req.query?.id;
    const publicReplay = (trace) =>
      req.headers["x-somas-replay"] === "compact" ? trace : expandReplay(trace);
    let lease;
    const result = await (async () => {
      try {
        if (route === "capabilities" && req.method === "GET")
          return reply(200, { storage: store.mode, goUploads });
        if (route === "agents" && req.method === "GET") {
          const agents = await store.listAgents();
          return reply(200, { agents });
        }
        if (route === "source" && req.method === "GET") {
          if (!uuid.test(id || "")) throw new Error("Unknown agent.");
          const [record] = await store.getAgents([id]);
          if (!record) return reply(404, { error: "Agent not found." });
          const { name, source, kind, builder, api_version } = record;
          return reply(200, { name, source, kind, builder, api_version });
        }
        if (route === "builder" && req.method === "POST") {
          const input = await body(req);
          return reply(
            200,
            await engine("builder", {
              builder: input.builder,
              view: input.view,
              memory: input.memory,
            }),
          );
        }
        if (route === "agents" && req.method === "POST") {
          const input = await body(req);
          const name = agentName(input.name);
          let record;
          if (input.builder !== undefined) {
            if (input.source !== undefined)
              throw new Error("Publish either a builder strategy or a Go file.");
            const { source } = await engine("builder", {
              builder: input.builder,
            });
            record = {
              kind: "builder",
              api_version: 2,
              builder: input.builder,
              source,
            };
            lease = await claim(req, "compile");
          } else {
            if (!goUploads)
              throw new Error(
                "Go uploads require hosted mode. Use a builder strategy locally.",
              );
            validateSource(input.source);
            const version = sourceVersion(input.source);
            lease = await claim(req, "compile");
            await startAgent(input.source, { probe: true, version });
            record = { kind: "go", api_version: version, source: input.source };
          }
          const agent = await store.saveAgent({
            name,
            ...record,
            source_hash: createHash("sha256").update(record.source).digest("hex"),
          });
          return reply(201, {
            agent: {
              id: agent.id,
              name,
              kind: agent.kind,
              mode: agent.builder?.mode,
              created_at: agent.created_at,
            },
          });
        }
        if (route === "runs" && req.method === "POST") {
          const { seed, seats, settings } = readRun(await body(req));
          const templates = seats.map(({ strategy, ...seat }) => ({
            ...seat,
            name: seat.name || builtins[strategy] || "Uploaded agent",
            ...(seat.builder
              ? {}
              : {
                  policy: Object.hasOwn(builtins, strategy) ? strategy : "cooperate",
                }),
          }));
          if (settings) await engine("validate", { seed, settings, slots: templates });
          lease = await claim(req, "run");
          const running = [];
          try {
            const publicIds = [
              ...new Set(
                seats.map((s) => s.strategy).filter((id) => uuid.test(id || "")),
              ),
            ];
            const records = await store.getAgents(publicIds);
            if (!goUploads && records.some((record) => record.kind !== "builder"))
              throw new Error(
                "Go uploads require hosted mode. Choose a builder strategy locally.",
              );
            const byId = new Map(records.map((record) => [record.id, record]));
            if (byId.size !== publicIds.length)
              throw new Error(
                "One of the selected agents is no longer available. Choose another strategy.",
              );
            // Each uploaded Go seat gets an isolated instance, including duplicate selections.
            const prepared = await Promise.allSettled(
              seats.map(async ({ strategy }, index) => {
                const record = byId.get(strategy);
                if (!record) return templates[index];
                const { policy, ...seat } = templates[index];
                if (settings) seat.publicStrategyName = record.name;
                if (!settings) {
                  seat.id = record.id;
                  seat.name = record.name;
                }
                if (record.kind === "builder")
                  return { ...seat, builder: record.builder };
                try {
                  const agent = await startAgent(record.source, {
                    version: record.api_version,
                  });
                  running.push(agent);
                  return { ...seat, url: agent.url, token: agent.token };
                } catch (e) {
                  return {
                    ...seat,
                    policy: "failed",
                    error: String(e.message).slice(0, 200),
                  };
                }
              }),
            );
            const slots = prepared.map((p) => {
              if (p.status === "rejected") throw p.reason;
              return p.value;
            });
            const trace = await engine("", { seed, settings, slots });
            const runId = randomUUID();
            await store.saveRun({ id: runId, seed, trace });
            return reply(200, { id: runId, ...publicReplay(trace) });
          } finally {
            await Promise.allSettled(running.map((r) => r.stop()));
          }
        }
        if (route === "replay" && req.method === "GET") {
          if (!uuid.test(id || "")) throw new Error("Unknown game.");
          const run = await store.getRun(id);
          return run
            ? reply(200, { id: run.id, ...publicReplay(run.trace) })
            : reply(404, { error: "Game not found." });
        }
        if (route === "moderate" && req.method === "POST") {
          const configured =
            adminPassword ??
            (store.mode === "hosted" ? process.env.SELFORG_ADMIN_PASSWORD : undefined);
          if (
            !configured ||
            !safeEqual(String(req.headers.authorization || ""), "Bearer " + configured)
          )
            return reply(401, { error: "Incorrect password." });
          const input = await body(req);
          if (input.action === "list")
            return reply(200, {
              agents: await store.listAgents(true),
            });
          if (input.action !== "hide" || !uuid.test(input.id || ""))
            throw new Error("Invalid action.");
          await store.hideAgent(input.id);
          return reply(200, { ok: true });
        }
        return reply(405, { error: "Unsupported request." });
      } catch (e) {
        const message = String(e.message || "Something went wrong.").slice(0, 6000);
        const busy = /busy|rate limit|daily limit|limit reached|wait before/i.test(
          message,
        );
        return reply(e.status === 503 ? 503 : busy ? 429 : 400, { error: message });
      } finally {
        if (lease) await store.release(lease).catch(() => {});
      }
    })();
    res.statusCode = result.status;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(result.data));
  };
}

export default createHandler();
