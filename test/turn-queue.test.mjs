import test from "node:test";
import assert from "node:assert/strict";
import { dailyOrders, queueFor } from "../public/turn-queue.js";
test("the queue follows recorded harvest and farming orders, including zero actions", () => {
  const agents = Array.from({ length: 3 }, (_, i) => ({
    name: `Seedling ${i}`,
    dead: false,
  }));
  const frames = [
    ...[2, 0, 1].map((actor) => ({
      round: 1,
      phase: "harvest",
      actor,
      food: 0,
    })),
    ...[1, 2, 0].map((actor) => ({ round: 1, phase: "contribute", actor })),
    ...[1, 2].map((actor) => ({ round: 2, phase: "harvest", actor })),
  ];
  const days = dailyOrders(frames);
  const frame = { round: 1, phase: "start", actor: -1, agents };
  assert.deepEqual(queueFor(frame, days).display, [2, 0, 1]);
  const next = queueFor({ ...frame, phase: "harvest", actor: 0 }, days);
  assert.deepEqual(next.display, [0, 1, 2]);
  assert.deepEqual([...next.done], [2]);
  assert.equal(next.active, 0);
  const shuffled = queueFor(
    {
      ...frame,
      phase: "contribute",
      actor: -1,
      motion: { kind: "farming_shuffle" },
    },
    days,
  );
  assert.deepEqual(shuffled.display, [1, 2, 0]);
  assert.equal(shuffled.active, -1);
  assert.equal(shuffled.done.size, 0);
  const farming = queueFor({ ...frame, phase: "contribute", actor: 1 }, days);
  assert.deepEqual(farming.display, [1, 2, 0]);
  assert.equal(farming.done.size, 0);
  agents[0].dead = true;
  assert.deepEqual(queueFor({ ...frame, round: 2 }, days).display, [1, 2]);
  assert.equal(queueFor({ ...frame, phase: "grow" }, days).done.size, 3);
});
