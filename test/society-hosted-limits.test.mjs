import test from "node:test";
import assert from "node:assert/strict";
import { claimSocietySession } from "../lib/society-hosted-limits.mjs";

const sessionId = "a".repeat(64);
const clientKey = "b".repeat(64);
const input = { sessionId, clientKey, environment: "production" };

test("hosted allocation sends hashed identity and environment to the atomic RPC", async () => {
  const calls = [];
  const result = await claimSocietySession(input, {
    request: async (...args) => {
      calls.push(args);
      return { allowed: true, created: true };
    },
  });
  assert.equal(result.allowed, true);
  assert.equal(result.created, true);
  assert.deepEqual(calls, [
    [
      "rpc/selforg_claim_society_session",
      {
        method: "POST",
        body: {
          p_environment: "production",
          p_session: sessionId,
          p_client: clientKey,
        },
      },
    ],
  ]);
});

test("returning sessions are admitted without consuming a new allocation", async () => {
  const result = await claimSocietySession(
    { ...input, clientKey: "c".repeat(64) },
    { request: async () => ({ allowed: true, created: false }) },
  );
  assert.deepEqual(result, {
    allowed: true,
    created: false,
    retryAfter: 0,
    reason: "existing",
    message: "",
  });
});

test("allocation denials preserve a useful retry time and distinguish capacity from connection limits", async () => {
  for (const reason of ["client_limit", "global_limit"]) {
    const result = await claimSocietySession(input, {
      request: async () => ({
        allowed: false,
        created: false,
        reason,
        retry_after: 1234,
      }),
    });
    assert.equal(result.allowed, false);
    assert.equal(result.retryAfter, 1234);
    assert.equal(result.reason, reason);
    assert.match(result.message, /existing session|Existing sessions/);
    assert.match(result.message, /midnight UTC/);
  }
});

test("raw identities and unknown environments are rejected before any request", async () => {
  for (const patch of [
    { clientKey: "127.0.0.1" },
    { sessionId: "untrusted/path" },
    { sessionId: null },
    { environment: "development" },
  ]) {
    let called = false;
    await assert.rejects(
      claimSocietySession(
        { ...input, ...patch },
        {
          request: async () => {
            called = true;
          },
        },
      ),
      TypeError,
    );
    assert.equal(called, false);
  }
});

test("database failures and malformed responses never admit a new session", async () => {
  await assert.rejects(
    claimSocietySession(input, {
      request: async () => {
        throw new Error("database unavailable");
      },
    }),
    /database unavailable/,
  );
  for (const response of [
    null,
    [],
    { allowed: true },
    { allowed: "true", created: true },
    { allowed: false, created: false, reason: "global_limit", retry_after: -1 },
  ]) {
    await assert.rejects(
      claimSocietySession(input, { request: async () => response }),
      (error) => error.status === 503,
    );
  }
});
