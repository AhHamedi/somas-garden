import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createSocietyProxy } from "../api/society-hosted.mjs";
import { sessionIdentity, SESSION_COOKIE } from "../lib/society-hosted-session.mjs";

const secret = "test-only-hosted-session-signing-secret";
const publicOrigin = "https://somas.sites.moonisolutions.net";
const run = "a".repeat(32);
const cookieValue = (response) => response.headers.get("set-cookie").split(";", 1)[0];

async function listen(t, handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function fixture(t, { claim, upstream, scope = "production" } = {}) {
  const requests = [],
    identities = [],
    allocations = [];
  const target = await listen(t, async (req, res) => {
    const parts = [];
    for await (const chunk of req) parts.push(chunk);
    requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: Buffer.concat(parts).toString(),
    });
    if (upstream) return upstream(req, res);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  });
  const handler = createSocietyProxy({
    env: {
      SELFORG_ENGINE_SECRET: secret,
      VERCEL_ENV: scope,
      VERCEL_URL: "verified-deployment.vercel.app",
    },
    async claim(value) {
      allocations.push(value);
      return claim ? claim(value) : { allowed: true };
    },
    async getSandbox(identity) {
      identities.push(identity);
      return { origin: target, token: identity.token };
    },
  });
  return {
    origin: await listen(t, handler),
    requests,
    identities,
    allocations,
  };
}

test("hosted sessions persist with signed cookies and isolate browsers and environments", async (t) => {
  const f = await fixture(t);
  const first = await fetch(`${f.origin}/api/society/config`);
  assert.equal(first.status, 200);
  await first.json();
  const cookie = cookieValue(first);
  assert.match(first.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Lax/);
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=[a-f0-9]{32}\\.[a-f0-9]{64}$`));

  await (await fetch(`${f.origin}/api/society/runs`, { headers: { cookie } })).json();
  await (await fetch(`${f.origin}/api/society/config`)).json();
  assert.equal(f.identities[0].id, f.identities[1].id);
  assert.equal(f.identities[0].token, f.identities[1].token);
  assert.notEqual(f.identities[0].id, f.identities[2].id);
  assert.notEqual(f.identities[0].token, f.identities[2].token);
  assert.equal(f.allocations[0].environment, "production");
  assert.match(f.allocations[0].clientKey, /^[a-f0-9]{64}$/);
  assert.equal(f.allocations[0].clientKey.includes("127.0.0.1"), false);

  const preview = sessionIdentity(cookie, secret, "preview");
  assert.equal(preview.fresh, true, "production cookies cannot select preview sessions");
  assert.notEqual(preview.id, f.identities[0].id);
  assert.notEqual(preview.token, f.identities[0].token);
});

test("a tampered session cookie cannot select another browser's engine", async (t) => {
  const f = await fixture(t);
  const valid = sessionIdentity(null, secret);
  const cookie = valid.cookie.split(";", 1)[0];
  const changedID =
    valid.id[0] === "a" ? `b${valid.id.slice(1)}` : `a${valid.id.slice(1)}`;
  const response = await fetch(`${f.origin}/api/society/runs`, {
    headers: { cookie: cookie.replace(valid.id, changedID) },
  });
  assert.equal(response.status, 200);
  await response.json();
  assert.equal(f.identities[0].fresh, true);
  assert.notEqual(f.identities[0].id, valid.id);
  assert.notEqual(f.identities[0].id, changedID);
  assert.notEqual(f.identities[0].token, valid.token);
});

test("wrong-origin, cross-site and unsupported requests are rejected before allocation", async (t) => {
  const f = await fixture(t);
  for (const headers of [
    { origin: "https://attacker.invalid" },
    { origin: publicOrigin, "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "cross-site" },
  ]) {
    const response = await fetch(`${f.origin}/api/society/runs`, {
      method: "POST",
      headers,
      body: "{}",
    });
    assert.equal(response.status, 403);
    await response.json();
  }
  const method = await fetch(`${f.origin}/api/society/runs`, { method: "DELETE" });
  assert.equal(method.status, 405);
  await method.json();
  assert.equal(f.allocations.length, 0);
  assert.equal(f.identities.length, 0);
});

test("the hosted proxy accepts only society routes and strips its routing parameter", async (t) => {
  const f = await fixture(t);
  for (const path of [
    "../health",
    "health",
    `runs/${run}/state`,
    "strategies/../../env",
    "runs/not-an-id",
  ]) {
    const response = await fetch(
      `${f.origin}/api/society-hosted?path=${encodeURIComponent(path)}`,
    );
    assert.equal(response.status, 404);
    await response.json();
  }
  assert.equal(f.allocations.length, 0);
  const response = await fetch(
    `${f.origin}/api/society-hosted?path=runs%2F${run}%2Fstudy&frame=13`,
    {
      headers: { origin: "https://verified-deployment.vercel.app" },
    },
  );
  assert.equal(response.status, 200);
  await response.json();
  assert.equal(f.requests[0].url, `/api/society/runs/${run}/study?frame=13`);
});

test("quota denial returns retry guidance without booting an engine", async (t) => {
  const f = await fixture(t, {
    claim: () => ({ allowed: false, retryAfter: 60, message: "Try again later." }),
  });
  const response = await fetch(`${f.origin}/api/society/config`);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.deepEqual(await response.json(), { error: "Try again later." });
  assert.equal(f.identities.length, 0);
  assert.equal(f.requests.length, 0);
});

test("oversized request bodies are rejected without booting an engine", async (t) => {
  const f = await fixture(t);
  const response = await fetch(`${f.origin}/api/society/runs`, {
    method: "POST",
    headers: { origin: publicOrigin, "Content-Type": "application/json" },
    body: "x".repeat(2 * 1024 * 1024 + 1),
  });
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "Request is too large." });
  assert.equal(f.identities.length, 0);
  assert.equal(f.requests.length, 0);
});

test("forwarding preserves exact mutations and streams exports without exposing server headers", async (t) => {
  let finish;
  const tail = new Promise((resolve) => {
    finish = resolve;
  });
  t.after(() => finish());
  const f = await fixture(t, {
    async upstream(req, res) {
      res.statusCode = 206;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", 'attachment; filename="world.json"');
      res.setHeader("Authorization", "Bearer upstream-secret");
      res.setHeader("Set-Cookie", "upstream-internal=secret");
      res.write('{"frames":[');
      await tail;
      res.end("1,2]}");
    },
  });
  const body = '{"count":2}';
  const response = await fetch(`${f.origin}/api/society/runs/${run}/step`, {
    method: "POST",
    headers: {
      origin: publicOrigin,
      "Content-Type": "application/json",
      authorization: "Bearer attacker",
      cookie: "irrelevant=user-cookie",
    },
    body,
  });
  assert.equal(response.status, 206);
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="world.json"',
  );
  assert.equal(response.headers.get("authorization"), null);
  assert.equal(response.headers.get("set-cookie").includes("upstream-internal"), false);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.equal(new TextDecoder().decode(first.value), '{"frames":[');
  assert.equal(first.done, false, "first bytes arrive before the upstream finishes");
  finish();
  let remainder = "";
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    remainder += new TextDecoder().decode(next.value);
  }
  assert.equal(remainder, "1,2]}");
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].body, body);
  assert.equal(f.requests[0].headers.authorization, `Bearer ${f.identities[0].token}`);
  assert.equal(f.requests[0].headers.cookie, undefined);
  assert.equal(f.requests[0].headers.origin, undefined);
  assert.equal(response.headers.get("set-cookie").includes(f.identities[0].token), false);
});

test("an interrupted mutation is never retried and returns a generic failure", async (t) => {
  t.mock.method(console, "error", () => {});
  const f = await fixture(t, {
    upstream(req) {
      req.socket.destroy();
    },
  });
  const response = await fetch(`${f.origin}/api/society/runs/${run}/step`, {
    method: "POST",
    headers: { origin: publicOrigin },
    body: '{"count":1}',
  });
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.match(data.error, /try again/i);
  assert.equal(JSON.stringify(data).includes(f.identities[0].token), false);
  assert.equal(JSON.stringify(data).includes(secret), false);
  assert.equal(f.requests.length, 1, "the server may already have applied the mutation");
  assert.equal(f.identities.length, 1);
});
