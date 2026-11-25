import test from "node:test";
import assert from "node:assert/strict";
import {
  indexSnapshot,
  lawValue,
  motionTally,
  motionTitle,
  cropStatus,
  phaseStory,
  plotSummary,
  hemicycleSeats,
  PHASES,
} from "../public/game/model.js";

const plot = {
  id: 0,
  name: "Plot A",
  roles: { trade: 0, justice: 1 },
  stock: 20,
  capacity: 30,
  weather: 0,
  rules: {},
};
const residents = [0, 1, 2].map((id) => ({
  id,
  name: `Resident ${id}`,
  plot: 0,
  team: 0,
  alive: id !== 2,
  votingWeight: 6,
  votingTokens: id ? 3 : 6,
  body: 2,
  mind: 3,
  food: 0,
  score: 2,
}));
const snapshot = {
  month: 1,
  day: 4,
  absoluteDay: 4,
  agents: residents,
  plots: [plot],
  settings: { ruleThreshold: "tokens", ruleFraction: 0.5, bodyCapacity: 2 },
  events: [],
};
const ix = indexSnapshot(snapshot);

test("indexes department holders including resident zero and counts active residents", () => {
  assert.deepEqual(ix.roles.get(0), [{ kind: "trade", plot: 0 }]);
  assert.deepEqual(ix.roles.get(1), [{ kind: "justice", plot: 0 }]);
  assert.equal(plotSummary(ix, plot).population, 2);
  assert.equal(plotSummary(ix, plot).votingWeight, 6);
  assert.match(
    motionTitle(ix, { input: { kind: "elect", key: "trade", target: 0 } }),
    /Resident 0.*Trade/,
  );
});
test("rule and role votes display their actual counting basis and threshold", () => {
  for (const [basis, total, yes, no, abstain, unit] of [
    ["voters", 6, 2, 1, 3, "eligible voters"],
    ["tokens", 8, 6, 2, 0, "tokens cast"],
  ]) {
    const t = motionTally({
      input: { kind: "policy" },
      tallyBasis: basis,
      fraction: 0.5,
      total,
      yes,
      no,
      abstain,
    });
    assert.deepEqual(
      [t.yes, t.no, t.abstain, t.need, t.unit],
      [yes, no, abstain, Math.floor(total / 2) + 1, unit],
    );
  }
  assert.equal(motionTally({ fraction: 1, total: 5, tallyBasis: "voters" }).need, 5);
  assert.equal(motionTally({ fraction: 0.58, total: 50, tallyBasis: "tokens" }).need, 30);
  assert.match(
    lawValue(ix, "threshold", { mode: "tokens", amount: 0.6 }),
    /Over 60% of tokens cast/,
  );
  assert.match(
    lawValue(ix, "tokenAllocation", { mode: "alignment", amount: 4, limit: 3 }),
    /4 tokens.*3 aligned votes/,
  );
});
test("every new motion shows a token tally before its electorate is frozen", () => {
  const s = {
    ...snapshot,
    version: 8,
    settings: { ruleFraction: 0.6 },
    plots: [{ ...plot, rules: { threshold: { mode: "tokens", amount: 0.75 } } }],
  };
  for (const kind of ["found", "dissolve", "elect", "revoke", "policy", "repeal"]) {
    const p = { input: { kind }, status: "open", plot: 0, fraction: 0, tallyBasis: "" };
    const t = motionTally(p, s);
    assert.equal(t.unit, "tokens cast", kind);
    assert.equal(t.total, 0);
    if (kind === "policy" || kind === "repeal") {
      assert.equal(t.rule, "Over 75%");
      assert.equal(motionTally(p, { ...s, plots: [plot] }).rule, "Over 60%");
    } else {
      assert.equal(t.rule, "Over 50%");
    }
  }
});
test("replays keep the recorded numbers and units when voting rules change", () => {
  const p = { input: { kind: "found" }, yes: 1, no: 0, abstain: 3, total: 4 };
  for (const version of [6, 7, 8]) {
    const t = motionTally({ ...p, tallyBasis: "voters", fraction: 0.5 }, { version });
    assert.deepEqual(
      [t.unit, t.yes, t.no, t.abstain, t.need],
      ["eligible voters", 1, 0, 3, 3],
    );
  }
  assert.equal(
    motionTally({ input: { kind: "found" } }, { version: 7 }).unit,
    "eligible voters",
  );
  const legacy = motionTally(
    { input: { kind: "policy" }, threshold: "twoThirds", total: 3 },
    { version: 5 },
  );
  assert.deepEqual(
    [legacy.unit, legacy.rule, legacy.need],
    ["voting weight", "Two thirds", 2],
  );
});
test("ranking, crop events and relief have an observer readout", () => {
  assert.equal(PHASES[1].id, "harvest_order");
  assert.match(
    phaseStory(
      indexSnapshot({
        ...snapshot,
        phase: "harvest_order",
        events: [{ kind: "harvest_ranking" }],
      }),
    ).headline,
    /1 ranking/,
  );
  assert.match(cropStatus({ cropEvent: "blight", aidNeeded: 5 }), /5 carrots/);
  assert.match(cropStatus({ cropEvent: "rescued" }), /relieved/);
  assert.match(
    phaseStory(
      indexSnapshot({
        ...snapshot,
        phase: "transfers",
        events: [
          { kind: "donation", amount: 4 },
          { kind: "gift", amount: 2 },
        ],
      }),
    ).headline,
    /4 carrots donated.*2 carrots/,
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
