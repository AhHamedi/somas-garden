import test from "node:test";
import assert from "node:assert/strict";
import { expandReplay } from "../public/replay.js";

test("compact errors begin on their recorded frame and respect independent duplicate seats", () => {
  const trace = {
    errorStarts: [1, -1, 0],
    agents: [{ error: "slow" }, {}, { error: "compile error" }],
    frames: Array.from({ length: 3 }, () => ({ agents: [{}, {}, {}] })),
  };
  assert.equal(expandReplay(trace), trace);
  assert.equal(trace.errorStarts, undefined);
  assert.deepEqual(trace.frames[0].agents, [{}, {}, { error: "compile error" }]);
  assert.deepEqual(trace.frames[1].agents, trace.agents);
  assert.deepEqual(trace.frames[2].agents, trace.agents);
  assert.equal(expandReplay(trace), trace);
});

import handler from "../api/controller.mjs";

test("saved replays expand for existing callers and stay compact for opted-in viewers", async (t) => {
  const oldUrl = process.env.SUPABASE_URL,
    oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://example.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
  t.after(() => {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  });
  const id = "00000000-0000-4000-8000-000000000005";
  const packed = {
    errorStarts: [1],
    agents: [{ error: "stopped" }],
    frames: [{ agents: [{}] }, { agents: [{}] }],
  };
  t.mock.method(globalThis, "fetch", () =>
    Promise.resolve(Response.json([{ id, trace: packed }])),
  );
  for (const compact of [false, true]) {
    let json;
    const res = {
      setHeader() {},
      end(body) {
        json = JSON.parse(body);
      },
    };
    await handler(
      {
        url: "/api/runs/" + id,
        query: { id, route: "replay" },
        method: "GET",
        headers: compact ? { "x-somas-replay": "compact" } : {},
      },
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(json.id, id);
    assert.equal(Array.isArray(json.errorStarts), compact);
    assert.deepEqual(json.frames[0].agents, [{}]);
    assert.deepEqual(expandReplay(json).frames[1].agents, [{ error: "stopped" }]);
  }
});
