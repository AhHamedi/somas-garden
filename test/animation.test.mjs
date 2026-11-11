import test from "node:test";
import assert from "node:assert/strict";
import { sequenceFor, durationFor, projectFrame } from "../public/animation.js";
const state = () => ({
  id: "a",
  name: "Seedling",
  food: 0,
  given: 0,
  totalFood: 0,
  totalEnergy: 0,
  energyLeft: 6,
});
test("sunlight restores the recorded budgets of living amoeboids", () => {
  const previous = {
    phase: "grow",
    round: 1,
    actor: -1,
    food: 42,
    energy: 24,
    agents: [
      { ...state(), energyLeft: 2 },
      { ...state(), energyLeft: 2 },
      { ...state(), energyLeft: 0, dead: true },
    ],
  };
  const frame = {
    ...previous,
    round: 2,
    phase: "start",
    energy: 0,
    agents: previous.agents.map((a) => ({ ...a, energyLeft: a.dead ? 0 : 6 })),
  };
  const steps = sequenceFor(frame, previous);
  assert.deepEqual(
    projectFrame(frame, previous, steps, 0).agents.map((a) => a.energyLeft),
    [2, 2, 0],
  );
  const shuffleTime = steps.find((s) => s.kind === "shuffle").ms;
  assert.deepEqual(
    projectFrame(frame, previous, steps, shuffleTime / 2).agents.map((a) => a.energyLeft),
    [2, 2, 0],
  );
  const middle = projectFrame(frame, previous, steps, shuffleTime + 500);
  assert.deepEqual(
    middle.agents.map((a) => a.energyLeft),
    [4, 4, 0],
  );
  assert.equal(middle.food, frame.food);
  assert.deepEqual(
    projectFrame(frame, previous, steps, durationFor(frame, previous)).agents,
    frame.agents,
  );
  assert.deepEqual(
    previous.agents.map((a) => a.energyLeft),
    [2, 2, 0],
  );
  const firstRound = { ...frame, round: 1 };
  const ready = { ...firstRound, round: 0, phase: "ready" };
  assert.deepEqual(
    projectFrame(ready, ready, sequenceFor(ready), 0).agents.map((a) => a.energyLeft),
    [0, 0, 0],
  );
  assert.deepEqual(
    projectFrame(firstRound, firstRound, sequenceFor(firstRound), 0).agents.map(
      (a) => a.energyLeft,
    ),
    [0, 0, 0],
  );
});
test("harvest projects one carrot at a time and finishes at the recorded totals", () => {
  const before = {
    phase: "start",
    food: 60,
    energy: 0,
    pending: 0,
    created: 0,
    actor: 0,
    agents: [state()],
  };
  const after = {
    ...before,
    phase: "harvest",
    food: 57,
    agents: [{ ...state(), food: 3, totalFood: 3 }],
  };
  const steps = sequenceFor(after, before);
  assert.deepEqual(
    steps.map((s) => s.kind),
    ["pick", "pick", "pick", "harvest_done"],
  );
  assert.equal(projectFrame(after, before, steps, 80).agents[0].food, 1);
  assert.equal(projectFrame(after, before, steps, 180).agents[0].food, 2);
  assert.equal(projectFrame(after, before, steps, 280).agents[0].food, 3);
  const end = projectFrame(after, before, steps, durationFor(after, before));
  assert.equal(end.food, 57);
  assert.deepEqual(end.agents, after.agents);
});
test("energy fills pairs and each full pair produces exactly one carrot", () => {
  const before = {
    phase: "harvest",
    food: 57,
    energy: 0,
    pending: 1,
    created: 0,
    actor: 0,
    agents: [state()],
  };
  const after = {
    ...before,
    phase: "contribute",
    food: 60,
    energy: 5,
    pending: 0,
    created: 3,
    agents: [{ ...state(), given: 5, totalEnergy: 5, energyLeft: 1 }],
  };
  const steps = sequenceFor(after, before);
  assert.equal(steps.filter((s) => s.kind === "energy").length, 5);
  assert.equal(steps.filter((s) => s.kind === "convert").length, 3);
  const shuffleTime = steps.find((s) => s.kind === "farming_shuffle").ms;
  const shuffled = projectFrame(after, before, steps, shuffleTime / 2);
  assert.equal(shuffled.actor, -1);
  assert.equal(shuffled.food, before.food);
  assert.equal(shuffled.energy, before.energy);
  assert.deepEqual(shuffled.agents, before.agents);
  const fullPair = projectFrame(after, before, steps, shuffleTime + 110);
  assert.equal(fullPair.pending, 2);
  assert.equal(fullPair.food, 57);
  const made = projectFrame(after, before, steps, shuffleTime + 225);
  assert.equal(made.food, 58);
  assert.equal(made.pending, 0);
  const end = projectFrame(after, before, steps, durationFor(after, before));
  assert.equal(end.food, 60);
  assert.equal(end.pending, 0);
  assert.deepEqual(end.agents, after.agents);
  const nextGiver = sequenceFor(after, { ...before, phase: "contribute" });
  assert.ok(
    !nextGiver.some((s) => s.kind === "farming_shuffle"),
    "Only shuffle before the first contribution",
  );
});

test("every missing wallet pip lands once on the same crossing as its sound", async () => {
  const { timelineEvents, crossedEvents } = await import("../public/animation.js");
  const budgets = [6, 2, 0, 4, 3, 0];
  const previous = {
    phase: "grow",
    round: 1,
    actor: -1,
    agents: budgets.map((energyLeft, i) => ({
      ...state(),
      dead: i === 5,
      energyLeft,
    })),
  };
  const frame = {
    ...previous,
    phase: "start",
    round: 2,
    agents: previous.agents.map((a) => ({ ...a, energyLeft: a.dead ? 0 : 6 })),
  };
  const steps = sequenceFor(frame, previous);
  const events = timelineEvents(steps);
  const contacts = events.filter((e) => e.kind === "sun_land");
  assert.equal(contacts.length, 15);
  assert.equal(new Set(events.map((e) => e.id)).size, events.length);
  const totals = budgets.slice();
  for (const contact of contacts) {
    const { actor, pip, atMs } = contact;
    assert.equal(pip, totals[actor]);
    const before = projectFrame(frame, previous, steps, atMs - 0.001);
    assert.deepEqual(
      before.agents.map((a) => a.energyLeft),
      totals,
    );
    totals[actor]++;
    const after = projectFrame(frame, previous, steps, atMs);
    assert.deepEqual(
      after.agents.map((a) => a.energyLeft),
      totals,
    );
  }
  assert.deepEqual(totals, [6, 6, 6, 6, 6, 0]);
  // Include a skipped animation frame, a paused interval, and a speed change.
  const clock = [-1, 0, 85, 720, 721, 1150, 1150, 1150, 1166, 1535, 2280];
  const delivered = clock
    .slice(1)
    .flatMap((now, i) => crossedEvents(events, clock[i], now));
  assert.deepEqual(delivered, events);
  assert.deepEqual(crossedEvents(events, -1, 2280), events);
});

test("full wallets and dead amoeboids receive a silent refill", async () => {
  const { timelineEvents } = await import("../public/animation.js");
  const frame = {
    phase: "start",
    round: 2,
    actor: -1,
    agents: [state(), { ...state(), dead: true, energyLeft: 0 }],
  };
  const events = timelineEvents(sequenceFor(frame, { ...frame, phase: "grow" }));
  assert.deepEqual(
    events.map((e) => e.kind),
    ["shuffle"],
  );
});

test("supper uses today's actual harvest once per living amoeboid", () => {
  const grow = {
    round: 30,
    phase: "grow",
    actor: -1,
    food: 58,
    pending: 1,
    agents: [
      { ...state(), food: 4, totalFood: 68 },
      { ...state(), food: 0, totalFood: 49 },
      { ...state(), dead: true, food: 1, totalFood: 20 },
      { ...state(), food: 1, totalFood: 17 },
    ],
  };
  const steps = sequenceFor(grow, grow, 3);
  assert.deepEqual(
    steps.map((step) => step.kind),
    ["grow", "supper"],
  );
  assert.deepEqual(steps[1].eaters, [0, 3]);
  for (const age of [steps[0].ms, durationFor(grow, grow, 3)]) {
    const view = projectFrame(grow, grow, steps, age);
    assert.equal(view.food, grow.food);
    assert.equal(view.pending, grow.pending);
    assert.deepEqual(view.agents, grow.agents);
  }
  assert.deepEqual(
    sequenceFor(grow, grow, 2).map((step) => step.kind),
    ["grow"],
  );
  const hungry = { ...grow, agents: grow.agents.map((a) => ({ ...a, food: 0 })) };
  assert.deepEqual(sequenceFor(hungry)[1].eaters, []);
  assert.ok(
    sequenceFor({ ...grow, phase: "death", actor: 1 }).every(
      (step) => step.kind !== "supper",
    ),
  );
});
