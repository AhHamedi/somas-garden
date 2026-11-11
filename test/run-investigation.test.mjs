import test from "node:test";
import assert from "node:assert/strict";
import { investigateRun } from "../public/run-investigation.js";

const frame = (round, phase, food, data = {}) => ({
  round,
  phase,
  food,
  ...data,
});
const seat = (name, data = {}) => ({ name, dead: false, ...data });

test("a decision on the morning field is distinct from a later harvest, offer and meal", () => {
  const fern = seat("Fern", {
    pantry: 1,
    energyLeft: 5,
    price: 3,
    sunlight: 4,
  });
  const mint = seat("Mint", {
    pantry: 0,
    energyLeft: 5,
    price: 3,
    sunlight: 5,
  });
  const choice = {
    actor: 0,
    status: "ok",
    foodRequested: 8,
    energyOffered: "9223372036854775807",
    matchedRule: -1,
    memoryBefore: -1,
    memoryAfter: 0,
  };
  const strategy = { kind: "builder", mode: "memory" };
  const decisions = [
    choice,
    { actor: 1, status: "ok", foodRequested: 2, energyOffered: 1 },
  ];
  const trace = {
    version: 4,
    rounds: 1,
    settings: { dailyFood: 2, carryFood: false },
    strategies: [strategy, { kind: "builtin", policy: "cooperate" }],
    agents: [
      { ...fern, totalFood: 1, totalEaten: 2, totalEnergy: 5 },
      { ...mint, totalFood: 2, totalEaten: 2, totalEnergy: 1 },
    ],
    frames: [
      frame(0, "ready", 3),
      frame(1, "start", 3, { agents: [fern, mint], decisions }),
      frame(1, "harvest", 1, {
        actor: 1,
        agents: [fern, { ...mint, food: 2 }],
      }),
      frame(1, "harvest", 0, {
        actor: 0,
        agents: [{ ...fern, food: 1 }, mint],
        pending: 0,
      }),
      frame(1, "contribute", 0, {
        actor: 1,
        pending: 1,
        deposits: [{ price: 3, energy: 1, created: false }],
        agents: [fern, { ...mint, given: 1, energyLeft: 4 }],
      }),
      frame(1, "contribute", 2, {
        actor: 0,
        pending: 0,
        deposits: [
          { price: 3, energy: 2, created: true },
          { price: 3, energy: 3, created: true },
        ],
        agents: [{ ...fern, given: 5, energyLeft: 0 }, mint],
      }),
      frame(1, "grow", 2, { created: 2, energy: 6 }),
      frame(1, "supper", 2, {
        meals: [
          { actor: 0, before: 2, eaten: 2, after: 0, fed: true },
          { actor: 1, before: 2, eaten: 2, after: 0, fed: true },
        ],
      }),
    ],
  };
  const {
    days: [d],
    seats: [agent],
  } = investigateRun(trace);
  const [row] = d.seats;
  assert.equal(row, agent.days[0]);
  assert.deepEqual(agent.lifetime, { harvested: 1, energyGiven: 5, eaten: 2 });
  assert.deepEqual(agent.strategy, strategy);
  assert.deepEqual(row.decision, choice);
  assert.deepEqual(
    [
      row.harvestRequested,
      row.harvestOrder,
      row.fieldBeforeHarvest,
      row.harvested,
      row.fieldAfterHarvest,
    ],
    [8, 2, 1, 1, 0],
  );
  assert.deepEqual(
    [
      row.energyRequested,
      row.energyAvailable,
      row.plantOrder,
      row.energyGiven,
      row.energyAfterPlant,
    ],
    ["9223372036854775807", 5, 2, 5, 0],
  );
  assert.deepEqual(
    [
      row.sunlight,
      row.quotedPrice,
      row.pendingBeforePlant,
      row.pendingAfterPlant,
      row.grownOnTurn,
    ],
    [4, 3, 1, 0, 2],
  );
  assert.deepEqual(
    [
      row.pantryStart,
      row.pantryBeforeSupper,
      row.need,
      row.eaten,
      row.pantryEnd,
      row.status,
    ],
    [1, 2, 2, 2, 0, "survived"],
  );
  assert.deepEqual(row.peers, {
    count: 1,
    harvested: 2,
    energyGiven: 1,
    eaten: 2,
    pantryEnd: 0,
  });
  assert.equal(row.energyShare, 5 / 6);
  assert.equal(row.harvestShare, 1 / 3);
  assert.deepEqual(
    [d.opening, d.afterHarvest, d.closing, d.harvested, d.grown, d.energyGiven, d.eaten],
    [3, 0, 2, 3, 2, 6, 4],
  );
  assert.deepEqual([d.aliveAtStart, d.aliveAtEnd], [2, 2]);
  assert.equal(d.sharedGrown, 1);
  assert.equal(d.fundedGrown, 2);
  assert.deepEqual(d.fundingGroups, [
    { actors: [0], carrots: 1, daysByActor: { 0: [1] } },
    { actors: [0, 1], carrots: 1, daysByActor: { 0: [1], 1: [1] } },
  ]);
  assert.equal(row.sharedCompletions, 1);
  assert.deepEqual(row.coFunders, [
    { index: 1, energy: 1, deposits: [{ round: 1, energy: 1 }] },
  ]);
});

test("funding follows energy across days and preserves unknown owners in partial records", () => {
  const agents = [seat("Fern"), seat("Mint")];
  const day = (round, actor, stock, oldPending, deposits, created, pending) => [
    frame(round, "start", stock, { agents }),
    frame(round, "harvest", stock, { actor, pending: oldPending }),
    frame(round, "contribute", stock + created, { actor, deposits, pending }),
    frame(round, "grow", stock + created, { created }),
  ];
  const frames = [
    ...day(1, 0, 0, 0, [{ price: 4, energy: 2, created: false }], 0, 2),
    ...day(
      2,
      1,
      0,
      2,
      [
        { price: 4, energy: 2, created: true },
        { price: 1, energy: 1, created: true },
      ],
      2,
      0,
    ),
  ];
  const trace = { version: 4, rounds: 2, agents, frames };
  const {
    days: [first, last],
  } = investigateRun(trace);
  assert.equal(first.sharedGrown, 0);
  assert.equal(last.sharedGrown, 1);
  assert.deepEqual(last.seats[1].coFunders, [
    { index: 0, energy: 2, deposits: [{ round: 1, energy: 2 }] },
  ]);
  assert.deepEqual(last.fundingGroups, [
    { actors: [0, 1], carrots: 1, daysByActor: { 0: [1], 1: [2] } },
    { actors: [1], carrots: 1, daysByActor: { 1: [2] } },
  ]);
  const clipped = investigateRun({ ...trace, frames: frames.slice(4) }).days[0];
  assert.equal(clipped.fundedGrown, 1);
  assert.equal(clipped.sharedGrown, null);
  assert.equal(clipped.seats[1].coFunders, null);
  assert.deepEqual(clipped.fundingGroups, [
    { actors: [1], carrots: 1, daysByActor: { 1: [2] } },
  ]);
});

test("funding links keep each contributor's dates, including a amoeboid that died before completion", () => {
  const agents = [seat("Fern", { dead: true, diedRound: 2 }), seat("Mint")];
  const trace = {
    version: 4,
    rounds: 3,
    agents,
    frames: [
      frame(1, "start", 0),
      frame(1, "contribute", 0, {
        actor: 0,
        deposits: [{ price: 6, energy: 1, created: false }],
        pending: 1,
      }),
      frame(1, "grow", 0, { created: 0, pending: 1 }),
      frame(2, "start", 0, { pending: 1 }),
      frame(2, "contribute", 0, {
        actor: 0,
        deposits: [{ price: 6, energy: 1, created: false }],
        pending: 2,
      }),
      frame(2, "grow", 0, { created: 0, pending: 2 }),
      frame(2, "death", 0, { actor: 0, pending: 2 }),
      frame(3, "start", 0, { pending: 2 }),
      frame(3, "contribute", 3, {
        actor: 1,
        deposits: [
          { price: 6, energy: 4, created: true },
          { price: 1, energy: 1, created: true },
          { price: 1, energy: 1, created: true },
        ],
        pending: 0,
      }),
      frame(3, "grow", 3, { created: 3 }),
    ],
  };
  const day = investigateRun(trace).days[2];
  assert.equal(day.seats[0].status, "inactive");
  assert.deepEqual(day.fundingGroups, [
    { actors: [1], carrots: 2, daysByActor: { 1: [3] } },
    { actors: [0, 1], carrots: 1, daysByActor: { 0: [1, 2], 1: [3] } },
  ]);
});

test("failed and skipped decisions are distinct from asking for zero and previously dead seats", () => {
  const fern = seat("Fern");
  const mint = seat("Mint", { error: "Agent could not start" });
  const dead = { ...fern, dead: true, diedRound: 1 };
  const start = [
    { actor: 0, status: "ok", foodRequested: 0, energyOffered: 0 },
    { actor: 1, status: "failed" },
  ];
  const trace = {
    version: 4,
    rounds: 2,
    settings: { dailyFood: 2 },
    agents: [dead, mint],
    frames: [
      frame(1, "start", 0, { agents: [fern, mint], decisions: start }),
      frame(1, "harvest", 0, { actor: 0 }),
      frame(1, "harvest", 0, { actor: 1 }),
      frame(1, "supper", 0, {
        meals: [
          { actor: 0, before: 1, eaten: 1, after: 0, fed: false },
          { actor: 1, before: 5, eaten: 2, after: 3, fed: true },
        ],
      }),
      frame(1, "death", 0, { actor: 0 }),
      frame(2, "start", 0, {
        agents: [dead, mint],
        decisions: [{ actor: 1, status: "unavailable" }],
      }),
      frame(2, "harvest", 0, { actor: 1 }),
      frame(2, "supper", 0, {
        meals: [{ actor: 1, before: 3, eaten: 2, after: 1, fed: true }],
      }),
    ],
  };
  const {
    days: [first, second],
  } = investigateRun(trace);
  assert.deepEqual(
    [
      first.seats[0].harvestRequested,
      first.seats[0].energyRequested,
      first.seats[0].status,
    ],
    [0, 0, "died"],
  );
  assert.deepEqual(
    [
      first.seats[1].harvestRequested,
      first.seats[1].harvested,
      first.seats[1].decision.status,
    ],
    [null, 0, "failed"],
  );
  assert.equal(first.seats[1].error, mint.error);
  assert.equal(first.eaten, 3);
  assert.equal(first.seats[1].peers.eaten, 1);
  assert.equal(second.seats[1].decision.status, "unavailable");
  assert.deepEqual(
    [second.seats[0].status, second.seats[0].need, second.seats[0].eaten],
    ["inactive", null, null],
  );
  assert.deepEqual(second.seats[1].peers, {
    count: 0,
    harvested: null,
    energyGiven: null,
    eaten: null,
    pantryEnd: null,
  });
  assert.equal(second.seats[1].harvestShare, null);
  assert.deepEqual([second.aliveAtStart, second.aliveAtEnd, second.eaten], [1, 1, 2]);
});

test("older replays never manufacture meals, policies, requests or converter partners", () => {
  const agents = [{ name: "Solo", totalFood: 2, totalEnergy: 5 }];
  const trace = {
    rounds: 1,
    agents,
    frames: [
      frame(1, "start", 12, { agents }),
      frame(1, "harvest", 10, { actor: 0, agents }),
      frame(1, "contribute", 10, { actor: 0, agents: [{ given: 5 }] }),
      frame(1, "grow", 13),
    ],
  };
  const {
    days: [day],
    seats,
  } = investigateRun(trace);
  assert.equal(seats[0].strategy, null);
  assert.deepEqual(
    [day.afterHarvest, day.closing, day.grown, day.harvested, day.energyGiven],
    [10, 13, 3, 2, 5],
  );
  const row = day.seats[0];
  assert.equal(row.status, "unknown");
  assert.equal(row.active, true);
  assert.deepEqual([row.energyGiven, row.harvested], [5, 2]);
  for (const missing of [
    row.eaten,
    row.need,
    row.pantryEnd,
    row.grownOnTurn,
    row.coFunders,
    row.harvestRequested,
    row.energyRequested,
    day.sharedGrown,
    day.aliveAtEnd,
    seats[0].lifetime.eaten,
  ])
    assert.equal(missing, null);
});

test("configured zero hunger, expired food, and later legacy accounting are interpreted exactly", () => {
  const agents = [seat("Solo", { pantry: 0, totalEaten: 0 })];
  const trace = {
    version: 4,
    rounds: 1,
    settings: { dailyFood: 0 },
    agents,
    frames: [
      frame(1, "start", 1, {
        agents: [seat("Solo", { pantry: 2, totalEaten: 0 })],
      }),
      frame(1, "supper", 1, {
        meals: [{ actor: 0, before: 2, eaten: 0, after: 0, fed: true }],
      }),
    ],
  };
  const row = investigateRun(trace).days[0].seats[0];
  assert.deepEqual([row.eaten, row.fed, row.need, row.pantryDiscarded], [0, true, 0, 2]);

  const legacy = {
    version: 3,
    rounds: 2,
    agents: [seat("Solo", { totalEaten: 2, pantry: 0 })],
    frames: [
      frame(1, "start", 1, { agents }),
      frame(1, "grow", 1, { agents: [seat("Solo", { pantry: 4 })] }),
      frame(2, "start", 1, {
        agents: [seat("Solo", { totalEaten: 1, pantry: 0 })],
      }),
      frame(2, "grow", 1, { agents: [seat("Solo", { pantry: 2 })] }),
    ],
  };
  const { days } = investigateRun(legacy);
  assert.deepEqual(
    days.map((day) => day.eaten),
    [1, 1],
  );
  assert.deepEqual(
    days.map((day) => day.seats[0].pantryDiscarded),
    [3, 1],
  );
});
