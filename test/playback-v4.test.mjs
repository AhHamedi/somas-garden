import test from "node:test";
import assert from "node:assert/strict";
import {
  sequenceFor,
  timelineEvents,
  projectFrame,
  MEAL_BITE,
  CONTACT,
} from "../public/animation.js";
import { actionReadout, converterPrice } from "../public/action-readout.js";
import { gardenLayout } from "../public/garden-layout.js";
import { dayStageFor } from "../public/day-stage.js";

const state = (changes = {}) => ({
  name: "Fern",
  pantry: 0,
  energyLeft: 0,
  food: 0,
  given: 0,
  totalFood: 0,
  totalEnergy: 0,
  eaten: 0,
  totalEaten: 0,
  dead: false,
  ...changes,
});
const frame = (phase, agents, changes = {}) => ({
  phase,
  round: 1,
  actor: -1,
  food: 4,
  energy: 0,
  pending: 0,
  lockedPrice: 0,
  created: 0,
  agents,
  ...changes,
});

test("one to six seats fit both stages and every bed capacity has distinct plots", () => {
  for (const compact of [true, false]) {
    for (let n = 1; n <= 6; n++) {
      for (const cap of [1, 2, 7, 59, 60, 80, 120]) {
        const l = gardenLayout(compact, n, {
          fieldCapacity: cap,
          energyCapacity: 24,
        });
        assert.equal(l.homes.length, n);
        for (const [x, y] of l.homes) {
          const [wx, wy] = l.wallet(x, y);
          assert.ok(wx >= 35 && wx <= l.w - 35 && wy >= 8 && wy <= l.h - 8);
        }
        const coords = Array.from({ length: cap }, (_, i) => l.plot(i));
        assert.equal(new Set(coords.map((p) => String(p))).size, cap);
        assert.ok(
          coords.every(
            ([x, y]) =>
              x > l.bed.x &&
              x < l.bed.x + l.bed.width &&
              y > l.bed.y &&
              y < l.bed.y + l.bed.height,
          ),
        );
      }
    }
  }
});

test("large and uneven refills bundle flights and account for every unit", () => {
  const prev = frame("supper", [
    state({ energyLeft: 9 }),
    state(),
    state({ dead: true }),
  ]);
  const start = frame(
    "start",
    [
      state({ energyLeft: 22, sunlight: 13 }),
      state({ energyLeft: 24, sunlight: 24 }),
      prev.agents[2],
    ],
    { round: 2 },
  );
  const steps = sequenceFor(start, prev, 4);
  const charge = steps.find((s) => s.kind === "sun_charge");
  assert.ok(charge.tokens.length <= 12);
  const events = timelineEvents(steps).filter((e) => e.kind === "sun_land");
  assert.equal(events.length, 37);
  assert.equal(new Set(events.map((e) => e.id)).size, 37);
  const balances = [9, 0, 0];
  for (const at of new Set(events.map((e) => e.atMs))) {
    for (const e of events.filter((e) => e.atMs === at)) balances[e.actor]++;
    assert.deepEqual(
      projectFrame(start, prev, steps, at).agents.map((a) => a.energyLeft),
      balances,
    );
  }
  assert.deepEqual(balances, [22, 24, 0]);
});

test("changing deposits complete an earlier carrot at its lock and start a new price", () => {
  const prev = frame("harvest", [state({ energyLeft: 9 })], {
    pending: 3,
    lockedPrice: 5,
    actor: 0,
  });
  const next = frame("contribute", [state({ energyLeft: 2, totalEnergy: 7, given: 7 })], {
    actor: 0,
    food: 6,
    energy: 7,
    pending: 2,
    lockedPrice: 4,
    created: 2,
    deposits: [
      { price: 5, energy: 2, created: true },
      { price: 3, energy: 3, created: true },
      { price: 4, energy: 2, created: false },
    ],
  });
  const steps = sequenceFor(next, prev, 4);
  assert.deepEqual(
    steps.filter((s) => s.kind === "convert").map((s) => s.price),
    [5, 3],
  );
  let age = 0,
    grew = 0;
  for (const s of steps) {
    if (s.kind === "energy" || s.kind === "convert") {
      const at = projectFrame(next, prev, steps, age + s.ms * CONTACT + 0.001);
      if (s.kind === "convert") grew++;
      assert.equal(at.food, prev.food + grew);
      assert.equal(at.pending, s.kind === "convert" ? 0 : s.pending + 1);
      assert.equal(at.lockedPrice, at.pending ? s.price : 0);
      assert.equal(converterPrice(at, { price: { mode: "random" } }, 4), s.price);
    }
    age += s.ms;
  }
  const end = projectFrame(next, prev, steps, age);
  for (const key of ["agents", "food", "pending", "lockedPrice", "created", "energy"])
    assert.deepEqual(end[key], next[key]);
  assert.ok(!steps.some((s) => s.kind === "farming_shuffle"));
});

test("pantry changes on arrival and supper changes at a single audible bite", () => {
  const prev = frame("start", [state({ pantry: 2 }), state({ pantry: 4 }), state()]);
  const harvest = frame(
    "harvest",
    [state({ pantry: 4, food: 2, totalFood: 2 }), ...prev.agents.slice(1)],
    { actor: 0, food: 2 },
  );
  const picks = sequenceFor(harvest, prev, 4);
  assert.equal(projectFrame(harvest, prev, picks, 75).agents[0].pantry, 2);
  assert.equal(projectFrame(harvest, prev, picks, 76).agents[0].pantry, 3);
  const grow = frame("grow", [state({ pantry: 4 }), state({ pantry: 1 }), state()]);
  const supper = frame(
    "supper",
    [
      state({ pantry: 1, eaten: 3, totalEaten: 3 }),
      state({ eaten: 1, totalEaten: 1 }),
      state(),
    ],
    {
      meals: [
        { actor: 0, before: 4, eaten: 3, after: 1, fed: true },
        { actor: 1, before: 1, eaten: 1, after: 0, fed: false },
        { actor: 2, before: 0, eaten: 0, after: 0, fed: false },
      ],
    },
  );
  assert.equal(dayStageFor(grow, 4), "afternoon");
  assert.equal(dayStageFor(supper, 4), "evening");
  assert.ok(sequenceFor(grow, grow, 4).every((s) => s.kind !== "supper"));
  const steps = sequenceFor(supper, grow, 4),
    hit = steps[0].ms * MEAL_BITE;
  assert.deepEqual(steps[0].eaters, [0, 1]);
  const events = timelineEvents(steps);
  assert.deepEqual(
    events.map((e) => [e.kind, e.atMs]),
    [["bite", hit]],
  );
  assert.deepEqual(projectFrame(supper, grow, steps, hit - 1).agents, grow.agents);
  const bitten = projectFrame(supper, grow, steps, hit);
  assert.deepEqual(bitten.agents, supper.agents);
  const readout = actionReadout(bitten, { dailyFood: 3 }, 4);
  assert.equal(readout.amount, "1/3 fed");
  assert.match(readout.caption, /4 carrots eaten/);
  const legacy = sequenceFor({ ...grow, agents: [state({ food: 1 })] }, grow, 3);
  assert.equal(timelineEvents(legacy).filter((e) => e.kind === "bite").length, 1);
  for (const dailyFood of [0, 4]) {
    const noMeal = {
      ...supper,
      meals: supper.meals.map((m) => ({
        ...m,
        eaten: 0,
        fed: dailyFood === 0,
      })),
    };
    const silent = sequenceFor(noMeal, grow, 4);
    assert.deepEqual(timelineEvents(silent), []);
    assert.equal(
      actionReadout(projectFrame(noMeal, grow, silent, 1000), { dailyFood }, 4).amount,
      dailyFood ? "0/3 fed" : "No meal due",
    );
  }
});
