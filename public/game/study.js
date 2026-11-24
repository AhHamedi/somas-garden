// Pure analysis of the study data served by /runs/:id/study. No DOM here, so
// every figure on the Results page can be checked in tests.

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
        exclusions: (m.exclusions || m.deaths)?.[id] ?? 0,
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
    roleDays: 0,
    held: 0,
    mind: 0,
    votingWeight: 0,
    votingTokens: 0,
    living: 0,
  }));
  const size = new Array(teamCount).fill(0);
  study.agentTeams.forEach((t) => size[t]++);
  for (const d of sc.days.filter((d) => months.has(d.month))) {
    d.teams.forEach((t, i) => {
      const x = dayTotals[i];
      x.roleDays += t.officers ?? 0;
      x.held += t.held * t.alive;
      x.mind += t.mind * t.alive;
      x.votingWeight += (t.votingWeight ?? t.influence ?? 0) * t.alive;
      x.votingTokens += (t.votingTokens ?? 0) * t.alive;
      x.living += t.alive;
      memberDays[i] += size[i];
    });
  }
  const authored = new Array(teamCount).fill(0);
  const yes = new Array(teamCount).fill(0),
    no = new Array(teamCount).fill(0),
    abstain = new Array(teamCount).fill(0);
  for (const m of sc.motions.filter((m) => months.has(m.month))) {
    if (m.sponsors?.length) {
      for (const id of m.sponsors) authored[study.agentTeams[id]]++;
    } else if (m.authorTeam >= 0) authored[m.authorTeam]++;
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
      exclusions: per("exclusions"),
      activeShare: memberDays[i] ? x.living / memberDays[i] : null,
      roleDays: perMonth(x.roleDays),
      held: x.living ? x.held / x.living : null,
      mind: x.living ? x.mind / x.living : null,
      votingWeight: x.living ? x.votingWeight / x.living : null,
      votingTokens: x.living ? x.votingTokens / x.living : null,
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

export const SUBJECTS = [
  { id: "government", name: "Government" },
  { id: "harvest", name: "Harvest" },
  { id: "voting", name: "Voting rules" },
  { id: "departments", name: "Department roles" },
];

export function subjectOf(m) {
  if (m.kind === "elect" || m.kind === "revoke") return "departments";
  if (["quota", "harvestOrder"].includes(m.key)) return "harvest";
  if (["threshold", "tokenAllocation"].includes(m.key)) return "voting";
  return "government";
}

/** The local rule a motion would change, if any. */
export function statuteKeyOf(m) {
  return m.kind === "policy" || m.kind === "repeal" ? m.key || null : null;
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
  const grid = Array.from({ length: teamCount }, () => new Array(plotCount).fill(0));
  for (const d of sc.days) {
    d.plots.forEach((p, j) => p.teams.forEach((n, t) => (grid[t][j] += n)));
  }
  return grid.map((row) => {
    const total = sum(row);
    return row.map((v) => (total ? v / total : 0));
  });
}

/** A failed field stays failed until reset. Count the initial failure only. */
export function cropEvents(days) {
  const counts = { rescued: 0, failed: 0, bumper: 0 };
  let previous;
  for (const day of days) {
    day.plots.forEach((plot, index) => {
      if (plot.cropEvent === "failed") {
        if (
          previous?.month !== day.month ||
          previous.plots[index]?.cropEvent !== "failed"
        )
          counts.failed++;
      } else if (plot.cropEvent === "rescued") counts.rescued++;
      else if (plot.cropEvent === "bumper") counts.bumper++;
    });
    previous = day;
  }
  return counts;
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
    "active_residents",
    "satisfaction_mean",
    "thought_mean",
    "politics_mind_mean",
    "harvested_mean",
    "eaten_mean",
    "carrots_held_mean",
    "mind_mean",
    "voting_weight_mean",
    "voting_tokens_remaining_mean",
    "department_holders",
    "exclusions",
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
        t.score,
        t.thought,
        t.politics,
        t.harvested,
        t.eaten,
        t.held,
        t.mind,
        t.votingWeight ?? t.influence,
        t.votingTokens,
        t.officers,
        t.exclusions ?? t.deaths,
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
    "crop_event",
    "aid_needed",
    "government",
    "trade_representative_id",
    "justice_representative_id",
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
        p.cropEvent || "",
        p.aidNeeded || 0,
        p.government ? 1 : 0,
        p.roles?.trade,
        p.roles?.justice,
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
    "kind",
    "law",
    "mode",
    "subject",
    "status",
    "passed",
    "yes_tally",
    "no_tally",
    "abstain_tally",
    "total_tally",
    "tally_basis",
    "threshold_fraction",
    "eligible_residents",
    "author",
    "author_team",
    "sponsor_ids",
    ...teamNames.flatMap((n) => [
      `${n}_residents_yes`,
      `${n}_residents_no`,
      `${n}_residents_abstain`,
    ]),
  ];
  const rows = [head];
  for (const m of study.motions)
    rows.push([
      m.id,
      m.month,
      m.created,
      m.abs,
      plotNames[m.plot] || m.plot,
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
      m.tallyBasis ?? m.threshold,
      m.fraction,
      m.electorate,
      study.agentNames?.[m.author] ?? m.author,
      teamNames[m.authorTeam] ?? "",
      (m.sponsors || [m.author]).join(" "),
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
    "exclusions",
    "active_days",
    "active_at_end",
    "voting_weight_at_end",
    "voting_tokens_remaining_at_end",
    "holds_role_at_end",
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
        (m.exclusions || m.deaths)?.[id],
        m.active[id],
        m.alive[id] ? 1 : 0,
        (m.votingWeight || m.influence)?.[id],
        m.votingTokens?.[id],
        m.office?.[id] ? 1 : 0,
      ]),
    );
  return csv(rows);
}
