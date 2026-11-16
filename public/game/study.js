// Pure analysis of the study data served by /runs/:id/study. No DOM here, so
// every figure on the Results page can be checked in tests.
import { STATUTES, CHARTER } from "./statutes.js";

export const PASSED = ["passed", "approved", "scheduled", "activated"];
export const passed = (m) => PASSED.includes(m.status);

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs) => (xs.length ? sum(xs) / xs.length : null);

/** Quantile of sorted values with linear interpolation. */
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i),
    hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function gini(values) {
  const x = values.map((v) => Math.max(0, v)).sort((a, b) => a - b);
  const n = x.length,
    total = sum(x);
  if (!n || !total) return 0;
  const weighted = x.reduce((t, v, i) => t + (i + 1) * v, 0);
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

/** Lorenz curve: cumulative share of the total held by the poorest p. */
export function lorenz(values, steps = 50) {
  const x = values.map((v) => Math.max(0, v)).sort((a, b) => a - b);
  const total = sum(x);
  const out = [];
  for (let k = 0; k <= steps; k++) {
    const n = Math.round((k / steps) * x.length);
    out.push(total ? sum(x.slice(0, n)) / total : k / steps);
  }
  return out;
}

/**
 * The slice of the study the page shows. month = null is the whole run.
 * Distributions use completed months only, unless none has finished yet, so
 * a month in progress never sits beside full months.
 */
export function scope(study, month = null) {
  const inMonth = (x) => month === null || x.month === month;
  const days = study.days.filter(inMonth);
  const motions = study.motions.filter(inMonth);
  let months = study.months.filter(inMonth);
  if (month === null && months.some((m) => m.complete))
    months = months.filter((m) => m.complete);
  return { month, days, motions, months };
}

export function monthsIn(study) {
  return [...new Set(study.months.map((m) => m.month))].sort((a, b) => a - b);
}

/** Every Amoeboid-month in scope, as rows. */
export function agentMonths(study, sc) {
  const rows = [];
  for (const m of sc.months)
    m.score.forEach((score, id) =>
      rows.push({
        id,
        month: m.month,
        team: study.agentTeams[id],
        score,
        thought: m.thought[id],
        food: Math.max(0, score - m.thought[id]),
        politics: m.politics[id],
        eaten: m.eaten[id],
        harvested: m.harvested[id],
        deaths: m.deaths[id],
        active: m.active[id],
        days: m.day,
      }),
    );
  return rows;
}

/**
 * One row per team, using the same months for every measure. Completed months
 * are compared when available; a selected unfinished month is month-to-date.
 * Daily charts can still use all sc.days, including the month in progress.
 */
export function teamTable(study, sc, teamCount) {
  const rows = agentMonths(study, sc);
  const months = new Set(sc.months.map((m) => m.month));
  const memberDays = new Array(teamCount).fill(0);
  const dayTotals = Array.from({ length: teamCount }, () => ({
    wilds: 0,
    moves: 0,
    officers: 0,
    held: 0,
    mind: 0,
    influence: 0,
    living: 0,
  }));
  const size = new Array(teamCount).fill(0);
  study.agentTeams.forEach((t) => size[t]++);
  for (const d of sc.days.filter((d) => months.has(d.month)))
    d.teams.forEach((t, i) => {
      const x = dayTotals[i];
      x.wilds += t.wilds;
      x.moves += t.moves;
      x.officers += t.officers;
      x.held += t.held * t.alive;
      x.mind += t.mind * t.alive;
      x.influence += t.influence * t.alive;
      x.living += t.alive;
      memberDays[i] += size[i];
    });
  const authored = new Array(teamCount).fill(0);
  const yes = new Array(teamCount).fill(0),
    no = new Array(teamCount).fill(0),
    abstain = new Array(teamCount).fill(0);
  for (const m of sc.motions.filter((m) => months.has(m.month))) {
    if (m.authorTeam >= 0) authored[m.authorTeam]++;
    m.teamYes.forEach((v, i) => (yes[i] += v));
    m.teamNo.forEach((v, i) => (no[i] += v));
    m.teamAbstain.forEach((v, i) => (abstain[i] += v));
  }
  const memberMonths = new Array(teamCount).fill(0);
  for (const m of sc.months) for (const t of study.agentTeams) memberMonths[t]++;
  return Array.from({ length: teamCount }, (_, i) => {
    const mine = rows.filter((r) => r.team === i);
    const per = (k) => mean(mine.map((r) => r[k]));
    const x = dayTotals[i];
    const perMonth = (v) => (memberMonths[i] ? v / memberMonths[i] : null);
    return {
      team: i,
      n: mine.length,
      score: per("score"),
      food: per("food"),
      thought: per("thought"),
      politics: per("politics"),
      eaten: per("eaten"),
      harvested: per("harvested"),
      deaths: per("deaths"),
      survival: memberDays[i] ? x.living / memberDays[i] : null,
      wilds: x.living ? x.wilds / x.living : null,
      moves: perMonth(x.moves),
      officerDays: perMonth(x.officers),
      held: x.living ? x.held / x.living : null,
      mind: x.living ? x.mind / x.living : null,
      influence: x.living ? x.influence / x.living : null,
      tabled: perMonth(authored[i]),
      votes: perMonth(yes[i] + no[i] + abstain[i]),
      yesShare: yes[i] + no[i] ? yes[i] / (yes[i] + no[i]) : null,
    };
  });
}

/** Distribution of month satisfaction for each team. */
export function distributions(study, sc, teamCount) {
  const rows = agentMonths(study, sc);
  return Array.from({ length: teamCount }, (_, team) => {
    const mine = rows.filter((r) => r.team === team).sort((a, b) => a.score - b.score);
    const v = mine.map((r) => r.score);
    return {
      team,
      rows: mine,
      n: v.length,
      mean: mean(v),
      q1: quantile(v, 0.25),
      median: quantile(v, 0.5),
      q3: quantile(v, 0.75),
      min: v[0] ?? null,
      max: v.at(-1) ?? null,
    };
  });
}

// --- subjects of motions --------------------------------------------------

const LOCAL_GROUP = Object.fromEntries(STATUTES.map((s) => [s.key, s.group]));
const CHARTER_KEYS = new Set(CHARTER.map((c) => c.key));

export const SUBJECTS = [
  { id: "government", name: "Government" },
  { id: "harvest", name: "Harvest" },
  { id: "treasury", name: "Treasury" },
  { id: "borders", name: "Borders" },
  { id: "power", name: "Power" },
  { id: "federation", name: "Federation ties" },
  { id: "charter", name: "Charter" },
];

export function subjectOf(m) {
  switch (m.kind) {
    case "found":
    case "dissolve":
      return "government";
    case "office":
    case "removeOffice":
    case "sanction":
      return "power";
    case "permitEntry":
    case "permitExit":
      return "borders";
    case "distribution":
    case "donation":
      return "treasury";
    case "federationFound":
    case "federationJoin":
    case "federationLeave":
    case "federationAdmit":
    case "federationDissolve":
    case "ratify":
      return "federation";
    case "federationPolicy":
    case "federationRepeal":
    case "dispute":
      return "charter";
  }
  return LOCAL_GROUP[m.key] || "power";
}

/** The local law a motion would change, if any. */
export function statuteKeyOf(m) {
  if (m.kind === "office" || m.kind === "removeOffice") return "office";
  if (m.kind === "policy" || m.kind === "repeal") return m.key || null;
  return null;
}

/** The charter rule a federation motion would change, if any. */
export function charterKeyOf(m) {
  return (m.kind === "federationPolicy" || m.kind === "federationRepeal") &&
    CHARTER_KEYS.has(m.key)
    ? m.key
    : null;
}

/** Yes share of yes-or-no votes by team and subject, with the count behind it. */
export function votingMatrix(sc, teamCount) {
  const cell = () => ({ yes: 0, no: 0, abstain: 0 });
  const grid = Array.from({ length: teamCount }, () =>
    Object.fromEntries(SUBJECTS.map((s) => [s.id, cell()])),
  );
  for (const m of sc.motions) {
    const sub = subjectOf(m);
    for (let t = 0; t < teamCount; t++) {
      const c = grid[t][sub];
      c.yes += m.teamYes[t] || 0;
      c.no += m.teamNo[t] || 0;
      c.abstain += m.teamAbstain[t] || 0;
    }
  }
  return grid;
}

/** Motions by subject: tabled, passed and failed. */
export function motionsBySubject(sc) {
  const out = Object.fromEntries(
    SUBJECTS.map((s) => [s.id, { tabled: 0, passed: 0, failed: 0 }]),
  );
  for (const m of sc.motions) {
    const x = out[subjectOf(m)];
    x.tabled++;
    if (passed(m)) x.passed++;
    else if (m.status === "failed") x.failed++;
  }
  return out;
}

/** Turnout of a motion: share of the electorate that voted yes or no. */
export function turnout(m) {
  const cast = sum(m.teamYes) + sum(m.teamNo);
  return m.electorate ? cast / m.electorate : null;
}

/**
 * Laws across governed plot-months: how often each was in force and how
 * residents fared where it was compared with governed plots without it.
 * Satisfaction is the residents' month-to-date mean on the last day in scope
 * for that month, so plot-months are compared at the same point of a month.
 */
export function lawAdoption(sc, statutes) {
  const byPlotMonth = new Map();
  for (const d of sc.days)
    d.plots.forEach((p, i) => {
      const k = `${d.month}:${i}`;
      const x = byPlotMonth.get(k) || {
        month: d.month,
        plot: i,
        governed: 0,
        days: 0,
        laws: {},
        last: null,
        lastDay: 0,
      };
      x.days++;
      if (p.government) x.governed++;
      for (const l of p.laws) x.laws[l] = (x.laws[l] || 0) + 1;
      if (d.day >= x.lastDay) {
        x.last = p;
        x.lastDay = d.day;
      }
      byPlotMonth.set(k, x);
    });
  // Compare only plot-months that reached the same day, so month-to-date
  // satisfaction is like for like.
  const lastDay = Math.max(0, ...[...byPlotMonth.values()].map((x) => x.lastDay));
  const governed = [...byPlotMonth.values()].filter(
    (x) => x.governed > 0 && x.lastDay === lastDay && x.last?.residents > 0,
  );
  const plotDays = sc.days.length * (sc.days[0]?.plots.length || 0);
  const governedDays = sum(
    sc.days.map((d) => d.plots.filter((p) => p.government).length),
  );
  return statutes.map((st) => {
    const inForce = sum(
      sc.days.map((d) => d.plots.filter((p) => p.laws.includes(st.key)).length),
    );
    const withIt = governed
      .filter((x) => (x.laws[st.key] || 0) >= x.days / 2)
      .map((x) => x.last.score);
    const without = governed.filter((x) => !x.laws[st.key]).map((x) => x.last.score);
    const motions = sc.motions.filter((m) => statuteKeyOf(m) === st.key);
    return {
      key: st.key,
      share: governedDays ? inForce / governedDays : 0,
      plotDays: inForce,
      allPlotDays: plotDays,
      tabled: motions.length,
      passed: motions.filter(passed).length,
      withN: withIt.length,
      withoutN: without.length,
      withMean: mean(withIt),
      withoutMean: mean(without),
      delta: withIt.length && without.length ? mean(withIt) - mean(without) : null,
    };
  });
}

/** Share of resident-days each team spent on each plot (rows: teams). */
export function residence(sc, teamCount, plotCount) {
  const grid = Array.from({ length: teamCount }, () => new Array(plotCount + 1).fill(0));
  for (const d of sc.days) {
    d.plots.forEach((p, j) => p.teams.forEach((n, t) => (grid[t][j] += n)));
    d.teams.forEach((t, i) => (grid[i][plotCount] += t.wilds));
  }
  return grid.map((row) => {
    const total = sum(row);
    return row.map((v) => (total ? v / total : 0));
  });
}

// --- export -------------------------------------------------------------

function csv(rows) {
  const cell = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

export function csvTeamDays(study, teamNames) {
  const head = [
    "month",
    "day",
    "absolute_day",
    "team",
    "alive",
    "in_wilds",
    "satisfaction_mean",
    "thought_mean",
    "politics_mind_mean",
    "harvested_mean",
    "eaten_mean",
    "carrots_held_mean",
    "mind_mean",
    "influence_mean",
    "officers",
    "deaths",
    "moves",
  ];
  const rows = [head];
  for (const d of study.days)
    d.teams.forEach((t, i) =>
      rows.push([
        d.month,
        d.day,
        d.abs,
        teamNames[i],
        t.alive,
        t.wilds,
        t.score,
        t.thought,
        t.politics,
        t.harvested,
        t.eaten,
        t.held,
        t.mind,
        t.influence,
        t.officers,
        t.deaths,
        t.moves,
      ]),
    );
  return csv(rows);
}

export function csvPlotDays(study, plotNames, teamNames) {
  const head = [
    "month",
    "day",
    "absolute_day",
    "plot",
    "residents",
    "field",
    "capacity",
    "treasury",
    "government",
    "federation",
    "laws",
    "satisfaction_mean",
    "weather",
    ...teamNames.map((n) => `residents_${n}`),
  ];
  const rows = [head];
  for (const d of study.days)
    d.plots.forEach((p, i) =>
      rows.push([
        d.month,
        d.day,
        d.abs,
        plotNames[i] || `Plot ${i + 1}`,
        p.residents,
        p.stock,
        p.capacity,
        p.reserve,
        p.government ? 1 : 0,
        p.federation >= 0 ? p.federation : "",
        p.laws.join(" "),
        p.score,
        ["sunny", "cloudy", "dark"][p.weather] || p.weather,
        ...p.teams,
      ]),
    );
  return csv(rows);
}

export function csvMotions(study, plotNames, teamNames) {
  const head = [
    "id",
    "month",
    "tabled_day",
    "decided_day",
    "plot",
    "federation",
    "kind",
    "law",
    "mode",
    "subject",
    "status",
    "passed",
    "yes",
    "no",
    "abstain",
    "total",
    "threshold",
    "electorate",
    "author",
    "author_team",
    ...teamNames.flatMap((n) => [`${n}_yes`, `${n}_no`, `${n}_abstain`]),
  ];
  const rows = [head];
  for (const m of study.motions)
    rows.push([
      m.id,
      m.month,
      m.created,
      m.abs,
      plotNames[m.plot] || m.plot,
      m.federation >= 0 ? m.federation : "",
      m.kind,
      m.key || "",
      m.mode || "",
      subjectOf(m),
      m.status,
      passed(m) ? 1 : 0,
      m.yes,
      m.no,
      m.abstain,
      m.total,
      m.threshold,
      m.electorate,
      study.agentNames?.[m.author] ?? m.author,
      teamNames[m.authorTeam] ?? "",
      ...teamNames.flatMap((_, i) => [m.teamYes[i], m.teamNo[i], m.teamAbstain[i]]),
    ]);
  return csv(rows);
}

export function csvAgents(study, teamNames) {
  const head = [
    "month",
    "complete",
    "amoeboid",
    "team",
    "satisfaction",
    "food_satisfaction",
    "thought",
    "politics_mind",
    "eaten",
    "harvested",
    "deaths",
    "active_days",
    "alive_at_end",
    "influence_at_end",
    "officer_at_end",
  ];
  const rows = [head];
  for (const m of study.months)
    m.score.forEach((s, id) =>
      rows.push([
        m.month,
        m.complete ? 1 : 0,
        study.agentNames?.[id] ?? id,
        teamNames[study.agentTeams[id]],
        s,
        Math.round((s - m.thought[id]) * 1e4) / 1e4,
        m.thought[id],
        m.politics[id],
        m.eaten[id],
        m.harvested[id],
        m.deaths[id],
        m.active[id],
        m.alive[id] ? 1 : 0,
        m.influence[id],
        m.office[id] ? 1 : 0,
      ]),
    );
  return csv(rows);
}
