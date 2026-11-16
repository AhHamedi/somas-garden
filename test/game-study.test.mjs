import test from "node:test";
import assert from "node:assert/strict";
import { STATUTES } from "../public/game/statutes.js";
import * as S from "../public/game/study.js";

// A two-team, two-plot study of two days in month 1 (complete) and one day of
// month 2, shaped like /runs/:id/study.
const team = (o = {}) => ({
  alive: 2,
  wilds: 0,
  score: 0,
  thought: 0,
  politics: 0,
  harvested: 2,
  eaten: 2,
  held: 0,
  mind: 4,
  influence: 1,
  officers: 0,
  deaths: 0,
  moves: 0,
  ...o,
});
const plot = (o = {}) => ({
  residents: 2,
  stock: 10,
  capacity: 20,
  reserve: 0,
  government: false,
  federation: -1,
  laws: [],
  score: 0,
  weather: 0,
  teams: [1, 1],
  ...o,
});
const day = (month, d, o = {}) => ({
  frame: month * 100 + d,
  month,
  day: d,
  abs: (month - 1) * 2 + d,
  gini: 0.1,
  moves: 0,
  deaths: 0,
  harvest: 8,
  eaten: 8,
  field: 20,
  treasury: 0,
  held: 0,
  governments: 0,
  federations: 0,
  teams: [team(), team()],
  plots: [plot(), plot()],
  ...o,
});
const motion = (o = {}) => ({
  id: "m1-p1",
  month: 1,
  created: 1,
  abs: 1,
  plot: 0,
  federation: -1,
  kind: "policy",
  key: "quota",
  mode: "limited",
  status: "scheduled",
  yes: 3,
  no: 1,
  abstain: 0,
  total: 4,
  threshold: "majority",
  electorate: 4,
  author: 0,
  authorTeam: 0,
  teamYes: [2, 1],
  teamNo: [0, 1],
  teamAbstain: [0, 0],
  plotYes: 0,
  plotNo: 0,
  ...o,
});
const study = {
  agentTeams: [0, 0, 1, 1],
  agentNames: ["A1", "A2", "B1", "B2"],
  days: [
    day(1, 1, {
      plots: [
        plot({ government: true, laws: ["quota"], score: 10 }),
        plot({ government: true, score: 4 }),
      ],
    }),
    day(1, 2, {
      plots: [
        plot({ government: true, laws: ["quota"], score: 12, stock: 0 }),
        plot({ government: true, score: 6 }),
      ],
    }),
    day(2, 1),
  ],
  motions: [
    motion(),
    motion({
      id: "m1-p2",
      kind: "found",
      key: "",
      status: "failed",
      authorTeam: 1,
      teamYes: [0, 1],
      teamNo: [2, 1],
    }),
    motion({
      id: "m2-p1",
      month: 2,
      abs: 3,
      kind: "federationPolicy",
      key: "gifts",
      federation: 0,
    }),
  ],
  months: [
    {
      frame: 16,
      month: 1,
      day: 2,
      complete: true,
      score: [10, 20, 30, 40],
      thought: [5, 20, 10, 40],
      politics: [1, 0, 0, 0],
      eaten: [4, 4, 4, 4],
      harvested: [4, 4, 4, 4],
      deaths: [0, 1, 0, 0],
      active: [2, 1, 2, 2],
      alive: [true, false, true, true],
      influence: [1, 0, 1, 1],
      office: [true, false, false, false],
    },
    {
      frame: 24,
      month: 2,
      day: 1,
      complete: false,
      score: [1, 1, 1, 1],
      thought: [1, 1, 1, 1],
      politics: [0, 0, 0, 0],
      eaten: [2, 2, 2, 2],
      harvested: [2, 2, 2, 2],
      deaths: [0, 0, 0, 0],
      active: [1, 1, 1, 1],
      alive: [true, true, true, true],
      influence: [0, 0, 0, 0],
      office: [false, false, false, false],
    },
  ],
};

test("quantiles, Gini and the Lorenz curve", () => {
  assert.equal(S.quantile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(S.quantile([1, 2, 3, 4], 0.25), 1.75);
  assert.equal(S.gini([1, 1, 1]), 0);
  assert.ok(Math.abs(S.gini([0, 0, 1]) - 2 / 3) < 1e-12);
  const l = S.lorenz([1, 1, 2], 3);
  assert.deepEqual([l[0], l.at(-1)], [0, 1]);
  assert.ok(
    l.every((v, i) => i === 0 || v >= l[i - 1]),
    "Lorenz curve never falls",
  );
});

test("whole-run scope compares completed months only", () => {
  const all = S.scope(study, null);
  assert.deepEqual(
    all.months.map((m) => m.month),
    [1],
  );
  assert.equal(all.days.length, 3, "days are not cut");
  assert.deepEqual(
    S.scope(study, 2).months.map((m) => m.month),
    [2],
    "a month in progress can be chosen alone",
  );
  assert.deepEqual(S.monthsIn(study), [1, 2]);
});

test("team table and distributions follow the agents' teams", () => {
  const sc = S.scope(study, 1);
  const t = S.teamTable(study, sc, 2);
  assert.equal(t[0].score, 15);
  assert.equal(t[1].score, 35);
  assert.equal(t[0].thought, 12.5);
  assert.equal(t[0].food, 2.5, "food satisfaction is satisfaction less thought");
  assert.equal(t[0].deaths, 0.5);
  assert.equal(t[0].tabled, 0.5, "one motion by two members in one month");
  assert.equal(t[1].tabled, 0.5);
  assert.equal(t[1].yesShare, 2 / 4);
  const d = S.distributions(study, sc, 2);
  assert.deepEqual(
    d[1].rows.map((r) => r.score),
    [30, 40],
  );
  assert.equal(d[1].median, 35);
});

test("monthly team comparisons exclude unfinished months from every measure", () => {
  const data = structuredClone(study);
  Object.assign(data.days[0].teams[0], { moves: 1, officers: 1 });
  Object.assign(data.days[1].teams[0], { moves: 0, officers: 1 });
  Object.assign(data.days[2].teams[0], { moves: 2, officers: 2 });

  const all = S.teamTable(data, S.scope(data), 2);
  const completed = S.teamTable(data, S.scope(data, 1), 2);
  assert.deepEqual(all, completed, "numerators and membership cover the same months");
  assert.equal(all[0].tabled, 0.5);
  assert.equal(all[0].moves, 0.5);
  assert.equal(all[0].officerDays, 1);
  assert.equal(S.scope(data).days.length, 3, "daily charts retain the current month");

  const partial = S.teamTable(data, S.scope(data, 2), 2)[0];
  assert.equal(partial.score, 1);
  assert.equal(partial.tabled, 0.5, "selected month shows actual month-to-date totals");
  assert.equal(partial.moves, 1);
  assert.equal(partial.officerDays, 1);
  const firstMonth = { ...data, months: [data.months[1]] };
  assert.deepEqual(
    S.teamTable(firstMonth, S.scope(firstMonth), 2)[0],
    partial,
    "month-to-date totals also work before any month has completed",
  );

  data.months[1].complete = true;
  const both = S.teamTable(data, S.scope(data), 2)[0];
  assert.equal(both.tabled, 0.5, "completed months use both months' membership");
  assert.equal(both.moves, 0.75);
  assert.equal(both.officerDays, 1);
});

test("motions are sorted into subjects and charter changes are told apart", () => {
  assert.equal(S.subjectOf(study.motions[0]), "harvest");
  assert.equal(S.subjectOf(study.motions[1]), "government");
  assert.equal(S.subjectOf(study.motions[2]), "charter");
  assert.equal(S.statuteKeyOf(study.motions[2]), null);
  assert.equal(S.charterKeyOf(study.motions[2]), "gifts");
  assert.equal(S.statuteKeyOf({ kind: "office", key: "" }), "office");
  const v = S.votingMatrix(S.scope(study, 1), 2);
  assert.deepEqual(v[0].harvest, { yes: 2, no: 0, abstain: 0 });
  assert.deepEqual(v[1].government, { yes: 1, no: 1, abstain: 0 });
  const by = S.motionsBySubject(S.scope(study, null));
  assert.deepEqual(by.government, { tabled: 1, passed: 0, failed: 1 });
  assert.equal(S.turnout(study.motions[0]), 1);
});

test("law adoption compares governed plot-months at the same day", () => {
  const rows = S.lawAdoption(S.scope(study, 1), STATUTES);
  const quota = rows.find((r) => r.key === "quota");
  assert.equal(quota.share, 0.5, "in force on half the governed plot-days");
  assert.equal(quota.withMean, 12);
  assert.equal(quota.withoutMean, 6);
  assert.equal(quota.delta, 6);
  assert.equal(quota.tabled, 1);
  assert.equal(quota.passed, 1);
});

test("residence shares sum to one for each team", () => {
  const r = S.residence(S.scope(study, null), 2, 2);
  for (const row of r) assert.ok(Math.abs(row.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test("CSV exports quote safely and carry one row per record", () => {
  const teams = ['Team "one"', "Two, too"];
  const csv = S.csvTeamDays(study, teams).trim().split("\n");
  assert.equal(csv.length, 1 + study.days.length * 2);
  assert.ok(csv[1].includes('"Team ""one"""'), "quotes doubled");
  assert.ok(csv[2].includes('"Two, too"'), "commas quoted");
  assert.equal(
    S.csvMotions(study, ["Plot A", "Plot B"], teams).trim().split("\n").length,
    4,
  );
  assert.equal(S.csvAgents(study, teams).trim().split("\n").length, 1 + 8);
  assert.equal(
    S.csvPlotDays(study, ["Plot A", "Plot B"], teams).trim().split("\n").length,
    1 + 6,
  );
});
