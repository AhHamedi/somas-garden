import test from "node:test";
import assert from "node:assert/strict";
import {
  indexSnapshot,
  lawSentence,
  lawValue,
  plotLaws,
  motionTitle,
  motionChange,
  motionTally,
  motionThreshold,
  phaseStory,
  notableEvents,
  plotSummary,
  eventText,
  hemicycleSeats,
  statusOf,
  STATUS,
} from "../public/game/model.js";

const settings = {
  days: 30,
  months: 12,
  bodyCapacity: 2,
  mindCapacity: 12,
  personalCapacity: 12,
  maxInfluence: 5,
  startingMind: 6,
  harvestLimit: 4,
  governmentCost: 10,
  enforcementCost: 0.04,
  recordsCost: 0.04,
};
function agent(id, plot, extra = {}) {
  return {
    id,
    team: id % 3,
    name: `Agent ${id}`,
    plot,
    alive: true,
    body: 2,
    mind: 6,
    food: 1,
    score: 10,
    influence: 1,
    deaths: 0,
    ...extra,
  };
}
function world(extra = {}) {
  return {
    month: 1,
    day: 4,
    absoluteDay: 4,
    phase: "voting",
    settings,
    teams: [{ name: "Red" }, { name: "Blue" }, { name: "Green" }],
    agents: [
      agent(0, 0),
      agent(1, 0),
      agent(2, 0, { body: 1 }),
      agent(3, 1),
      agent(4, -1),
      { ...agent(5, -1), alive: false },
    ],
    plots: [
      {
        id: 0,
        name: "Plot A",
        capacity: 400,
        stock: 300,
        reserve: 20,
        reserveCapacity: 400,
        weather: 0,
        regeneration: 12,
        government: true,
        federation: 1,
        hardFunded: false,
        recordsFunded: true,
        rules: {
          quota: { mode: "limited", amount: 2 },
          enforcement: { mode: "hard" },
          "office:0": {
            mode: "appoint",
            powers: ["distribution", "federationVote"],
            limit: 6,
          },
        },
        officers: {
          0: { agent: 0, powers: ["distribution", "federationVote"], limit: 6 },
        },
      },
      {
        id: 1,
        name: "Plot B",
        capacity: 500,
        stock: 100,
        reserve: 0,
        reserveCapacity: 500,
        weather: 2,
        regeneration: 4,
        government: false,
        federation: -1,
        rules: {},
        officers: {},
      },
    ],
    federations: [
      {
        id: 1,
        name: "Federation 1",
        plots: [0, 1],
        rules: { gifts: { mode: "on", enabled: true } },
        funded: false,
        founded: 3,
      },
    ],
    proposals: [],
    events: [],
    ...extra,
  };
}

test("laws read as plain sentences with compact values", () => {
  const ix = indexSnapshot(world());
  assert.equal(
    lawSentence(ix, "quota", { mode: "limited", amount: 2 }),
    "Each resident may harvest at most 2 carrots a day.",
  );
  assert.equal(
    lawSentence(ix, "quota:3", { mode: "limited", amount: 1 }),
    "Agent 3 may harvest at most 1 carrot a day.",
  );
  assert.equal(
    lawSentence(ix, "tax", { mode: "percent", amount: 25, exempt: 4 }),
    "Residents pay 25% of stored carrots above 4 into the treasury daily.",
  );
  assert.equal(
    lawSentence(ix, "collection", { mode: "percentBefore", amount: 10 }),
    "The government takes 10% of the field into the treasury before residents harvest.",
  );
  assert.match(
    lawSentence(ix, "office:0", { powers: ["distribution", "federationVote"], limit: 6 }),
    /^Agent 0 may hand out reserves, up to 6 carrots a day\.$/,
  );
  assert.equal(
    lawValue(ix, "tax", { mode: "percent", amount: 25, exempt: 4 }),
    "25% above 4",
  );
  assert.equal(lawValue(ix, "quota", { mode: "unlimited" }), "No limit");
});

test("plot laws group local and charter rules and flag unfunded services", () => {
  const ix = indexSnapshot(world());
  const laws = plotLaws(ix, ix.plots.get(0));
  const enforcement = laws.find((l) => l.key === "enforcement");
  assert.equal(
    enforcement.state.tone,
    "warn",
    "an unfunded hard quota reads as soft today",
  );
  const gifts = laws.find((l) => l.key === "fed:gifts");
  assert.equal(gifts.scope, "federation");
  assert.equal(gifts.state.text, "Federation unfunded");
  assert.deepEqual(
    [...new Set(laws.map((l) => l.group))],
    ["harvest", "power", "federation"],
  );
});

test("roles come from offices and representative grants", () => {
  const ix = indexSnapshot(world());
  const kinds = ix.roles
    .get(0)
    .map((r) => r.kind)
    .sort();
  assert.deepEqual(kinds, ["officer", "representative"]);
  assert.equal(ix.roles.has(1), false);
});

test("motions are titled, explained and tallied in their own units", () => {
  const s = world();
  const ix = indexSnapshot(s);
  const quota = {
    id: "m1",
    author: 1,
    plot: 0,
    federation: -1,
    input: { kind: "policy", key: "quota", rule: { mode: "limited", amount: 3 } },
    status: "passed",
    yes: 13,
    no: 5,
    total: 20,
    threshold: "majority",
  };
  assert.equal(motionTitle(ix, quota), "Set a harvest quota of 3");
  const change = motionChange(ix, quota);
  assert.equal(change.before, "Each resident may harvest at most 2 carrots a day.");
  assert.equal(change.after, "Each resident may harvest at most 3 carrots a day.");
  assert.deepEqual(
    {
      need: motionTally(quota).need,
      unit: motionTally(quota).unit,
      abstain: motionTally(quota).abstain,
    },
    { need: 11, unit: "influence", abstain: 2 },
  );
  assert.equal(motionThreshold({ ...quota, threshold: "twoThirds", total: 30 }).need, 20);
  // Go omits a zero target, so an absent target is resident 0.
  assert.equal(
    motionTitle(ix, { plot: 0, input: { kind: "office", rule: {} } }),
    "Appoint Agent 0 as officer",
  );
  const found = {
    plot: 1,
    input: { kind: "found" },
    total: 1,
    yes: 1,
    threshold: "majority",
  };
  assert.equal(motionThreshold(found).unit, "residents");
  const fed = {
    plot: 0,
    federation: 1,
    input: { kind: "federationPolicy", key: "gifts", rule: { mode: "on" } },
    threshold: "unanimous",
    plotVotes: { 0: "yes", 1: "abstain" },
  };
  const t = motionTally(fed);
  assert.deepEqual([t.unit, t.need, t.yes, t.abstain], ["plots", 2, 1, 1]);
  assert.equal(
    motionTitle(ix, { plot: 0, input: { kind: "federationFound", members: [0, 1] } }),
    "Form a federation with B",
  );
});

test("every engine status has a label", () => {
  for (const status of [
    "open",
    "passed",
    "approved",
    "scheduled",
    "activated",
    "failed",
    "tied",
    "superseded",
    "cancelled",
  ])
    assert.ok(STATUS[status], status);
  assert.equal(statusOf({ status: "made-up" }).tone, "neutral");
});

test("phase stories report what the frame's events add up to", () => {
  const harvest = indexSnapshot(
    world({
      phase: "harvest",
      events: [
        { kind: "harvest", actor: 0, plot: 0, amount: 2 },
        { kind: "harvest", actor: 1, plot: 0, amount: 4 },
        { kind: "ration_breach", actor: 1, plot: 0, amount: 2 },
      ],
    }),
  );
  const story = phaseStory(harvest, null);
  assert.equal(
    story.headline,
    "2 residents harvested 6 carrots; 1 breach of soft quotas.",
  );
  assert.deepEqual(
    story.figures.map((f) => f.value),
    ["6", "1"],
  );

  const before = indexSnapshot(world({ phase: "transfers" }));
  const eating = indexSnapshot(
    world({
      phase: "eating",
      agents: world().agents.map((a) =>
        a.id === 2 ? { ...a, alive: false, plot: -1 } : a,
      ),
      events: [
        { kind: "eat", actor: 0, plot: 0, amount: 3 },
        { kind: "think", actor: 0, plot: 0, amount: 4.5 },
        { kind: "death", actor: 2, plot: -1 },
      ],
    }),
  );
  assert.match(phaseStory(eating, before).headline, /1 Amoeboid starved, 1 in Plot A\.$/);
});

test("notable events surface foundings and passed laws once", () => {
  const dawn = indexSnapshot(
    world({
      phase: "environment",
      events: [{ kind: "activated", plot: 1, message: "Found a government activated" }],
    }),
  );
  assert.deepEqual(
    notableEvents(dawn, null).map((n) => n.text),
    ["Plot B founded a government"],
  );
  const formed = indexSnapshot(world({ phase: "environment", absoluteDay: 3 }));
  assert.deepEqual(
    notableEvents(formed, null).map((n) => n.text),
    ["Federation 1 formed by A and B"],
  );
  const p = {
    id: "m2",
    author: 0,
    plot: 0,
    federation: -1,
    input: { kind: "policy", key: "records", rule: { mode: "on" } },
    status: "scheduled",
    closes: 4,
    created: 4,
  };
  const vote = indexSnapshot(world({ proposals: [p, { ...p, id: "m3" }] }));
  assert.deepEqual(
    notableEvents(vote, null).map((n) => n.text),
    ["A passed: keep public records"],
  );
});

test("plot summaries average only living residents", () => {
  const ix = indexSnapshot(world());
  const sum = plotSummary(ix, ix.plots.get(0));
  assert.equal(sum.population, 3);
  assert.equal(sum.hungry, 1);
  assert.equal(Math.round(sum.body * 100), 167);
});

test("engine messages are rewritten for the observer", () => {
  assert.equal(
    eventText({ kind: "eat", amount: 3, message: "Ate 3 carrots; 1.00 satisfaction" }),
    "Ate 3 carrots, earning 1 satisfaction",
  );
  assert.equal(
    eventText({ kind: "eat", amount: 2, message: "Ate 2 carrots; 0.00 satisfaction" }),
    "Ate 2 carrots",
  );
  assert.equal(
    eventText({ kind: "pledge", amount: 0.4, message: "Reserved mind for local" }),
    "Pledged 0.4 mind to the plot's shared costs",
  );
  assert.equal(
    eventText({ kind: "move", message: "Moved from outside to Plot E" }),
    "Moved from the wilds to Plot E",
  );
});

test("the hemicycle seats every voter inside the chamber, ordered left to right", () => {
  for (const n of [1, 2, 5, 36, 120, 300]) {
    const seats = hemicycleSeats(n, 600, 300);
    assert.equal(seats.length, n);
    for (const s of seats) {
      assert.ok(s.x >= 0 && s.x <= 600 && s.y >= 0 && s.y <= 300, `seat inside for ${n}`);
      assert.ok(s.r > 0);
    }
    for (let i = 1; i < seats.length; i++)
      assert.ok(seats[i - 1].angle >= seats[i].angle);
  }
  assert.deepEqual(hemicycleSeats(0), []);
});

test("saved team lists move to the current presets", async () => {
  const { migrateTeams } = await import("../public/game/model.js");
  const current = [{ name: "Wardens", policy: "warden" }];
  const old = [
    "Stewards:steward",
    "Thinkers:thinker",
    "Gatherers:gatherer",
    "Diplomats:diplomat",
    "Wanderers:wanderer",
    "Learners:learner",
  ].map((x) => {
    const [name, policy] = x.split(":");
    return { name, policy };
  });
  assert.deepEqual(
    migrateTeams(old, current),
    current,
    "the untouched old line-up becomes the new one",
  );
  const migratedOld = [
    { name: "Stewards", policy: "warden" },
    { name: "Thinkers", policy: "sunchaser" },
    { name: "Gatherers", policy: "locust" },
    { name: "Diplomats", policy: "envoy" },
    { name: "Wanderers", policy: "sunchaser" },
    { name: "Learners", policy: "tinkerer" },
  ];
  const edited = structuredClone(old);
  edited[0].policy = "gatherer";
  assert.deepEqual(
    migrateTeams(edited, current),
    [{ name: "Stewards", policy: "locust" }, ...migratedOld.slice(1)],
    "changing only a behaviour preserves the saved line-up",
  );
  assert.deepEqual(
    migrateTeams([...old].reverse(), current),
    [...migratedOld].reverse(),
    "reordering the earlier defaults preserves the saved team order",
  );
  const custom = [
    { name: "Red", policy: "gatherer" },
    { name: "Blue", policy: "builder", builder: { harvest: 2 } },
  ];
  assert.deepEqual(
    migrateTeams(custom, current),
    [{ name: "Red", policy: "locust" }, custom[1]],
    "custom teams keep their names",
  );
});
