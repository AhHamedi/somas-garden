import test from "node:test";
import assert from "node:assert/strict";
import { summarizeRun } from "../public/results-data.js";

const seat = (name, extra = {}) => ({
  name,
  totalFood: 0,
  totalEnergy: 0,
  ...extra,
});
const f = (round, phase, food, extra = {}) => ({
  round,
  phase,
  food,
  ...extra,
});
test("one-day extinction takes precedence over the limit and counts a partial supper", () => {
  const report = summarizeRun({
    settings: { roundLimit: 1, fieldCapacity: 40 },
    rounds: 1,
    food: 4,
    agents: [
      seat("Fern", {
        appearance: 2,
        dead: true,
        diedRound: 1,
        totalFood: 3,
        totalEnergy: 2,
      }),
    ],
    frames: [
      f(0, "ready", 6),
      f(1, "start", 6),
      f(1, "harvest", 3),
      f(1, "contribute", 4, { created: 1 }),
      f(1, "grow", 4, { created: 1 }),
      f(1, "supper", 4, {
        created: 1,
        meals: [{ actor: 0, eaten: 3, fed: false }],
      }),
      f(1, "death", 4, { created: 1 }),
    ],
  });
  assert.equal(report.outcome, "extinction");
  assert.equal(report.title, "The amoeboid has died.");
  assert.deepEqual(report.history, [{ round: 1, afterHarvest: 3, closing: 4, grown: 1 }]);
  assert.deepEqual(report.totals, {
    harvested: 3,
    grown: 1,
    eaten: 3,
    energy: 2,
  });
  assert.equal(
    report.opening + report.totals.grown - report.totals.harvested,
    report.closing,
  );
});
test("the chart distinguishes morning from evening when the field closes full each day", () => {
  const rounds = 50,
    frames = [f(0, "ready", 60)];
  for (let i = 1; i <= rounds; i++)
    frames.push(
      f(i, "start", 60),
      f(i, "harvest", 59),
      f(i, "harvest", 58),
      f(i, "contribute", 59, { created: 1 }),
      f(i, "contribute", 60, { created: 2 }),
      f(i, "grow", 60, { created: 2 }),
      f(i, "supper", 60, { created: 2, meals: [] }),
    );
  const report = summarizeRun({
    version: 4,
    settings: { roundLimit: rounds },
    rounds,
    food: 60,
    agents: [
      seat("Mint", {
        dead: false,
        totalFood: 100,
        totalEnergy: 200,
        totalEaten: 0,
      }),
      seat("Moss", {
        dead: true,
        diedRound: 1,
        totalEaten: 0,
        error: "agent stopped",
      }),
    ],
    frames,
  });
  assert.equal(report.title, "The garden reached day 50.");
  assert.equal(report.survivors, 1);
  assert.equal(report.totals.grown, 100);
  assert.equal(report.totals.eaten, 0);
  assert.deepEqual(
    report.seats.map((s) => s.name),
    ["Mint", "Moss"],
  );
  assert.equal(report.seats[1].error, "agent stopped");
  assert.equal(report.history.length, 50);
  assert.ok(report.history.every((d) => d.afterHarvest === 58 && d.closing === 60));
});
test("old replays use actual growth and omit unavailable meal and mortality data", () => {
  const report = summarizeRun({
    rounds: 30,
    food: 9,
    agents: [seat("Ada", { totalFood: 4, totalEnergy: 3 })],
    frames: [
      f(0, "ready", 10),
      f(1, "start", 10),
      f(1, "harvest", 6),
      f(1, "contribute", 6),
      f(1, "grow", 9, { regrew: true }),
    ],
  });
  assert.equal(report.outcome, "complete");
  assert.equal(report.survivors, null);
  assert.equal(report.totals.eaten, null);
  assert.equal(report.totals.grown, 3);
  assert.equal(report.limit, 30);
  const recordedDeaths = summarizeRun({
    version: 3,
    rounds: 2,
    food: 0,
    agents: [
      seat("A", { dead: true, diedRound: 2 }),
      seat("B", { dead: true, diedRound: 1 }),
    ],
    frames: [],
  });
  assert.equal(recordedDeaths.title, "All the amoeboids have died.");
  assert.equal(recordedDeaths.totals.eaten, null);
});
