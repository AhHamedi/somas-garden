import test from "node:test";
import assert from "node:assert/strict";
import { Playback, phaseWeight, SPEEDS } from "../public/game/playback.js";

const PHASES = [
  "environment",
  "movement",
  "harvest",
  "proposals",
  "voting",
  "transfers",
  "eating",
  "close",
];

/** A stand-in engine: every step appends one phase frame. */
function fakeEngine({ readOnly = false, lastDay = 99 } = {}) {
  const frames = [
    { month: 1, day: 1, phase: "ready", events: [], proposals: [], stats: { alive: 1 } },
  ];
  const calls = [];
  const index = (s, i) => ({
    index: i,
    month: s.month,
    day: s.day,
    phase: s.phase,
    meteor: !!s.meteor,
    stats: s.stats,
  });
  const next = () => {
    const last = frames.at(-1);
    const p =
      last.phase === "ready" || last.phase === "close"
        ? 0
        : PHASES.indexOf(last.phase) + 1;
    const day = last.phase === "close" ? last.day + 1 : last.day;
    frames.push({
      month: 1,
      day,
      phase: PHASES[p],
      events: [],
      proposals: [],
      stats: { alive: 1 },
      done: day === lastDay && PHASES[p] === "close",
    });
  };
  const api = async (path, body) => {
    calls.push([path, body]);
    if (path.endsWith("/history")) return { frames: frames.map(index), months: [] };
    const frame = path.match(/\/frames\/(\d+)$/);
    if (frame) return { snapshot: frames[Number(frame[1])], index: Number(frame[1]) };
    if (path.endsWith("/step")) {
      if (readOnly) {
        const error = new Error("this saved replay is read-only");
        error.status = 409;
        throw error;
      }
      for (let i = 0; i < (body?.count || 1) && !frames.at(-1).done; i++) next();
      return {
        snapshot: frames.at(-1),
        index: frames.length - 1,
        status: frames.at(-1).done ? "complete" : "paused",
      };
    }
    return {
      snapshot: frames.at(-1),
      index: frames.length - 1,
      status: readOnly ? "archived" : "paused",
    };
  };
  return { api, frames, calls, next };
}

test("opening shows the newest frame as live", async () => {
  const engine = fakeEngine();
  engine.next();
  engine.next();
  const pb = new Playback(engine.api);
  const shown = [];
  pb.addEventListener("frame", (e) => shown.push(e.detail));
  await pb.open("run");
  assert.equal(pb.cur, 2);
  assert.equal(shown.at(-1).progress, 1, "opening does not animate");
  assert.equal(pb.atEdge, true);
});

test("advancing steps the engine only past the newest frame, one phase at a time", async () => {
  const engine = fakeEngine();
  const pb = new Playback(engine.api);
  await pb.open("run");
  assert.equal(await pb.advance(), true);
  assert.equal(pb.snapshot.phase, "environment");
  assert.deepEqual(
    engine.calls.filter(([p]) => p.endsWith("/step")).map(([, b]) => b.count),
    [1],
  );
  await pb.seek(0);
  assert.equal(pb.atEdge, false, "seeking back is replay");
  const steps = engine.calls.filter(([p]) => p.endsWith("/step")).length;
  assert.equal(await pb.advance(), true);
  assert.equal(
    engine.calls.filter(([p]) => p.endsWith("/step")).length,
    steps,
    "recorded frames are replayed, not re-simulated",
  );
  assert.equal(pb.atEdge, true);
});

test("playing keeps a few phases simulated ahead without moving the live marker", async () => {
  const engine = fakeEngine();
  const pb = new Playback(engine.api);
  await pb.open("run");
  pb.play();
  await pb.prefetch();
  assert.ok(pb.max - pb.cur >= 3, "frames are buffered ahead of the cursor");
  assert.equal(pb.atEdge, true, "buffered frames are not reported as replay");
  pb.pause();
});

test("fast forward stops at the requested phase and respects the estimate", async () => {
  const engine = fakeEngine();
  const pb = new Playback(engine.api);
  await pb.open("run");
  await pb.fastForward((f) => f.phase === "close", undefined, 8);
  assert.equal(pb.snapshot.phase, "close");
  assert.equal(pb.snapshot.day, 1);
  assert.ok(engine.frames.length <= 10, "the engine did not run days ahead");
});

test("a read-only replay stops at its last frame", async () => {
  const engine = fakeEngine({ readOnly: true });
  engine.frames.push({
    month: 1,
    day: 1,
    phase: "environment",
    events: [],
    proposals: [],
  });
  const pb = new Playback(engine.api);
  const errors = [];
  pb.addEventListener("error", (e) => errors.push(e.detail));
  await pb.open("run");
  assert.equal(pb.readOnly, true);
  assert.equal(pb.canAdvance, false);
  assert.equal(await pb.advance(), false);
  assert.equal(errors.length, 0, "no request is made past the end of a read-only replay");
});

test("quiet phases pass faster than busy ones", () => {
  const quiet = phaseWeight({ phase: "voting", proposals: [], events: [] });
  const busy = phaseWeight({
    phase: "voting",
    absoluteDay: 3,
    proposals: [{ closes: 3 }],
    events: [],
  });
  assert.ok(busy > quiet * 2);
  assert.deepEqual(
    SPEEDS.map((s) => s.ms),
    [...SPEEDS.map((s) => s.ms)].sort((a, b) => b - a),
  );
});
