// Results: a study of the run up to the phase on screen. Four sections share
// one month filter; every chart can be read as a table and every series can be
// exported as CSV for analysis elsewhere.
import { $, icon, setHTML, toast } from "/game/dom.js";
import { esc, fmt, teamColor } from "/game/model.js";
import { STATUTES } from "/game/statutes.js";
import { figure, drawFigures, bindCharts, hideTip, compact, pct } from "/game/charts.js";
import * as S from "/game/study.js";

const SECTIONS = [
  ["outcomes", "Outcomes"],
  ["behaviour", "Behaviour"],
  ["commons", "Commons"],
  ["institutions", "Institutions"],
];
const HABITS = [
  ["harvested", "Harvested", (t) => t.harvested, "carrots a day"],
  ["eaten", "Eaten", (t) => t.eaten, "carrots a day"],
  ["held", "Carrots held", (t) => t.held, "carrots"],
  ["mind", "Mind", (t) => t.mind, "mind"],
  ["influence", "Influence", (t) => t.influence, "influence"],
  ["politics", "Mind on politics", (t) => t.politics, "mind this month"],
  ["wilds", "In the wilds", (t) => (t.alive ? t.wilds / t.alive : null), "share"],
];
const GOV_STATES = [
  { name: "No government", color: "" },
  { name: "Government", color: "rgba(196,163,255,0.5)" },
  { name: "Government in a federation", color: "rgba(196,163,255,0.95)" },
];

// --- data loading ----------------------------------------------------------

function studyKey(pb) {
  // Month-to-date agent totals can change in every phase, including eating.
  return `${pb.id}:${pb.cur}`;
}

export function ensureStudy(app) {
  const st = (app.study ||= { key: "", data: null, loading: false, error: "" });
  const key = studyKey(app.pb);
  if (st.key === key) return;
  // Never display or export a different frame while its replacement loads.
  st.key = "";
  st.data = null;
  st.error = "";
  if (st.loading) return;
  st.loading = true;
  const want = key;
  return app
    .api(`/runs/${app.pb.id}/study?frame=${app.pb.cur}`)
    .then((data) => {
      if (studyKey(app.pb) !== want) return;
      st.data = data;
      st.key = want;
      st.error = "";
    })
    .catch((e) => {
      if (studyKey(app.pb) !== want) return;
      st.key = want;
      st.error = e.message;
    })
    .finally(() => {
      st.loading = false;
      if (app.view === "results") renderResults(app);
      else if (app.view === "rulebook") app.actions.setView("rulebook");
    });
}

// --- small builders ----------------------------------------------------------

const teamName = (app, i) => app.ix.s.teams[i]?.name || `Team ${i + 1}`;
const plotLabel = (app, i) =>
  app.ix.s.plots[i]?.name?.replace(/^Plot\s*/, "") || String.fromCharCode(65 + i);

function card(
  app,
  id,
  title,
  body,
  { sub = "", span = "", table = true, tools = "" } = {},
) {
  const on = app.resultsTables.has(id);
  const toggle = table
    ? `<button class="icon-button small" data-table-toggle="${id}" aria-pressed="${on}" title="${on ? "Show chart" : "Show table"}" aria-label="${on ? "Show chart" : "Show as table"}">${icon(on ? "chart" : "table")}</button>`
    : "";
  return `<section class="rcard ${span}"><header><div><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ""}</div><div class="rcard-tools">${tools}${toggle}</div></header>${body}</section>`;
}

function stat(label, value, note = "", tone = "") {
  return `<div class="rstat ${tone}"><span>${esc(label)}</span><b>${esc(value)}</b>${note ? `<small>${esc(note)}</small>` : ""}</div>`;
}

function legend(app, teams) {
  return `<div class="chart-legend">${teams.map((i) => `<span><i style="background:${teamColor(i)}"></i>${esc(teamName(app, i))}</span>`).join("")}</div>`;
}

const seqTeal = (v) =>
  `rgba(141,227,211,${(0.06 + 0.84 * Math.max(0, Math.min(1, v))).toFixed(3)})`;
const diverge = (v) =>
  v >= 0.5
    ? `rgba(88,214,155,${(0.08 + (v - 0.5) * 2 * 0.82).toFixed(3)})`
    : `rgba(242,105,110,${(0.08 + (0.5 - v) * 2 * 0.82).toFixed(3)})`;

/** Deterministic vertical jitter for a dot, in [-1, 1]. */
const jitter = (a, b) => {
  const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return (h - Math.floor(h)) * 2 - 1;
};

// --- sections ------------------------------------------------------------

function outcomes(app, data, sc, teams) {
  const s = app.ix.s;
  const rows = S.agentMonths(data, sc);
  const scores = rows.map((r) => r.score);
  const partial = sc.months.length && !sc.months.some((m) => m.complete);
  const plotDays = sc.days.reduce((t, d) => t + d.plots.length, 0);
  const governed = sc.days.reduce(
    (t, d) => t + d.plots.filter((p) => p.government).length,
    0,
  );
  const decided = sc.motions.length;
  const passedN = sc.motions.filter(S.passed).length;
  const deaths = rows.reduce((t, r) => t + r.deaths, 0);
  const kpis = `<div class="rstats">
    ${stat("Satisfaction", fmt(S.mean(scores) ?? 0, 1), partial ? `per Amoeboid, month to date` : "per Amoeboid per month")}
    ${stat("Inequality", fmt(S.gini(scores), 2), "Gini, 0 is equal")}
    ${stat("Deaths", fmt(deaths), `${pct(rows.length ? rows.filter((r) => r.deaths > 0).length / rows.length : 0)} of Amoeboid-months`)}
    ${stat("Governed", pct(plotDays ? governed / plotDays : 0), "of plot-days")}
    ${stat("Motions passed", decided ? pct(passedN / decided) : "–", `of ${fmt(decided)} decided`)}
  </div>`;

  // Distribution of satisfaction by team.
  const dist = S.distributions(data, sc, s.teams.length).filter(
    (d) => teams.includes(d.team) && d.n,
  );
  dist.sort((a, b) => b.mean - a.mean);
  const strip = figure("r-dist", {
    type: "strip",
    label: "Satisfaction of every Amoeboid-month by team",
    rows: dist.map((d) => ({
      label: teamName(app, d.team),
      color: teamColor(d.team),
      display: fmt(d.mean, 1),
      mean: d.mean,
      median: d.median,
      q1: d.q1,
      q3: d.q3,
      min: d.min,
      max: d.max,
      values: d.rows.map((r) => ({
        value: r.score,
        jitter: jitter(r.id, r.month),
        title: `${data.agentNames?.[r.id] ?? `#${r.id}`}, month ${r.month}`,
        extra: `food ${fmt(r.food, 1)}, thought ${fmt(r.thought, 1)}${r.deaths ? `, died ${r.deaths}×` : ""}`,
      })),
    })),
    height: 40 + dist.length * 38,
  });
  const key = `<p class="strip-key"><span><i class="k-dot"></i>one Amoeboid-month</span><span><i class="k-box"></i>middle half</span><span><i class="k-med"></i>median</span><span><i class="k-mean"></i>mean</span></p>`;

  // Food versus thought.
  const table = S.teamTable(data, sc, s.teams.length).filter((t) =>
    teams.includes(t.team),
  );
  const madeOf = figure("r-made", {
    type: "bars",
    label: "Satisfaction from food and from thought by team",
    rows: [...table]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .map((t) => ({
        label: teamName(app, t.team),
        color: teamColor(t.team),
        display: fmt(t.score ?? 0, 1),
        parts: [
          {
            name: "Food",
            value: t.food ?? 0,
            color: "var(--joy)",
            display: fmt(t.food ?? 0, 1),
          },
          {
            name: "Thought",
            value: t.thought ?? 0,
            color: "var(--mind)",
            display: fmt(t.thought ?? 0, 1),
          },
        ],
      })),
  });

  // Through time: months when several are in scope, days otherwise.
  const monthsInScope = [...new Set(sc.months.map((m) => m.month))];
  let trend;
  if (monthsInScope.length > 1) {
    const byMonth = monthsInScope.map((mo) =>
      S.teamTable(
        data,
        {
          ...sc,
          months: sc.months.filter((m) => m.month === mo),
          days: sc.days.filter((d) => d.month === mo),
          motions: [],
        },
        s.teams.length,
      ),
    );
    trend = figure("r-trend", {
      type: "line",
      label: "Mean satisfaction by month and team",
      height: 240,
      x: monthsInScope.map((m) => `Month ${m}`),
      xName: "Month",
      xTicks: monthsInScope
        .map((m, i) => [i, `Month ${m}`])
        .filter((_, i, a) => a.length <= 12 || i % 2 === 0),
      series: teams.map((t) => ({
        name: teamName(app, t),
        color: teamColor(t),
        values: byMonth.map((rows) => rows[t].score),
      })),
      format: (v) => compact(v),
    });
  } else {
    const days = sc.days;
    trend = figure("r-trend", {
      type: "line",
      label: "Mean satisfaction so far this month by day and team",
      height: 240,
      x: days.map((d) => `Month ${d.month}, day ${d.day}`),
      xName: "Day",
      breaks: monthBreaks(days),
      dividers: monthDividers(days),
      xTicks: edgeTicks(days),
      series: teams.map((t) => ({
        name: teamName(app, t),
        color: teamColor(t),
        values: days.map((d) => d.teams[t].score),
      })),
    });
  }

  const giniLine = figure("r-gini", {
    type: "line",
    label: "Inequality of satisfaction by day",
    height: 180,
    area: true,
    yMin: 0,
    x: sc.days.map((d) => `Month ${d.month}, day ${d.day}`),
    xName: "Day",
    breaks: monthBreaks(sc.days),
    dividers: monthDividers(sc.days),
    xTicks: edgeTicks(sc.days),
    series: [
      { name: "Gini", color: "var(--influence)", values: sc.days.map((d) => d.gini) },
    ],
    format: (v) => fmt(v, 2),
  });
  const lor = S.lorenz(scores, 40);
  const lorenzFig = figure("r-lorenz", {
    type: "line",
    label: "Lorenz curve of satisfaction",
    height: 180,
    yMin: 0,
    yMax: 1,
    x: lor.map((_, i) => `Least satisfied ${Math.round((i / 40) * 100)}%`),
    xName: "Share of Amoeboid-months",
    xTicks: [
      [0, "0%"],
      [20, "50%"],
      [40, "100%"],
    ],
    reference: { values: lor.map((_, i) => i / 40) },
    series: [{ name: "Share of all satisfaction", color: "var(--joy)", values: lor }],
    format: (v) => pct(v),
  });

  return `${kpis}<div class="rgrid">
    ${card(app, "r-dist", "Satisfaction by team", `${strip}${key}`, { span: "w2", sub: scopeNote(sc) })}
    ${card(app, "r-made", "Food and thought", `${madeOf}<p class="strip-key"><span><i style="background:var(--joy)"></i>food</span><span><i style="background:var(--mind)"></i>thought</span></p>`, { sub: "Mean satisfaction per Amoeboid" })}
    ${card(app, "r-trend", monthsInScope.length > 1 ? "Month by month" : "Through the month", `${trend}${legend(app, teams)}`, { span: "w3", sub: monthsInScope.length > 1 ? "Mean satisfaction per Amoeboid" : "Mean satisfaction so far this month" })}
    ${card(app, "r-gini", "Inequality over time", giniLine, { span: "w15", sub: "Gini of month-to-date satisfaction" })}
    ${card(app, "r-lorenz", "Lorenz curve", lorenzFig, { span: "w15", sub: "Grey line: perfect equality" })}
  </div>`;
}

function behaviour(app, data, sc, teams) {
  const s = app.ix.s;
  const table = S.teamTable(data, sc, s.teams.length).filter((t) =>
    teams.includes(t.team),
  );
  const cols = [
    ["score", "Satisfaction", (v) => fmt(v, 1)],
    ["food", "from food", (v) => fmt(v, 1)],
    ["thought", "from thought", (v) => fmt(v, 1)],
    ["survival", "Alive", (v) => pct(v)],
    ["harvested", "Harvested", (v) => fmt(v, 0)],
    ["eaten", "Eaten", (v) => fmt(v, 0)],
    ["held", "Held", (v) => fmt(v, 1)],
    ["politics", "Mind on politics", (v) => fmt(v, 1)],
    ["tabled", "Motions", (v) => fmt(v, 2)],
    ["votes", "Votes", (v) => fmt(v, 1)],
    ["yesShare", "Yes", (v) => pct(v)],
    ["officerDays", "Officer days", (v) => fmt(v, 1)],
    ["influence", "Influence", (v) => fmt(v, 2)],
    ["wilds", "In wilds", (v) => pct(v)],
    ["moves", "Moves", (v) => fmt(v, 1)],
    ["deaths", "Deaths", (v) => fmt(v, 2)],
  ];
  const sortKey = app.resultsSort || "score";
  const sorted = [...table].sort(
    (a, b) => (b[sortKey] ?? -Infinity) - (a[sortKey] ?? -Infinity),
  );
  // The highest value in each column is picked out, where the column varies.
  const top = Object.fromEntries(
    cols.map(([k]) => {
      const v = table.map((t) => t[k]).filter((x) => x !== null && x !== undefined);
      const hi = Math.max(...v);
      return [k, v.length > 1 && hi - Math.min(...v) > Math.abs(hi) * 0.01 ? hi : null];
    }),
  );
  const groups = `<tr class="grp"><th></th><th colspan="4">Outcome</th><th colspan="3">Food</th><th colspan="6">Politics</th><th colspan="3">Movement and death</th></tr>`;
  const hints = {
    survival: "Share of member-days alive",
    wilds: "Share of living days spent in the wilds",
    held: "Mean carrots held at nightfall",
    influence: "Mean influence of the living",
    yesShare: "Yes share of yes-or-no votes",
  };
  const head = `<tr><th>Team</th>${cols.map(([k, n]) => `<th><button class="th-sort" data-rsort="${k}" aria-pressed="${sortKey === k}"${hints[k] ? ` title="${esc(hints[k])}"` : ""}>${esc(n)}</button></th>`).join("")}</tr>`;
  const body = sorted
    .map(
      (t) =>
        `<tr><td><span class="legend-row"><i class="sw" style="background:${teamColor(t.team)}"></i>${esc(teamName(app, t.team))}</span></td>${cols
          .map(([k, , f]) => {
            const v = t[k];
            return `<td class="${top[k] !== null && v === top[k] ? "top" : ""}">${v === null ? "–" : esc(f(v))}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");
  const teamTable = `<div class="rtable-wrap"><table class="table rtable">${`<thead>${groups}${head}</thead>`}<tbody>${body}</tbody></table></div>`;

  const habit = HABITS.find((h) => h[0] === app.resultsHabit) || HABITS[0];
  const habits = figure("r-habit", {
    type: "line",
    label: `${habit[1]} by day and team`,
    height: 240,
    x: sc.days.map((d) => `Month ${d.month}, day ${d.day}`),
    xName: "Day",
    breaks: monthBreaks(sc.days),
    dividers: monthDividers(sc.days),
    xTicks: edgeTicks(sc.days),
    yMin: 0,
    series: teams.map((t) => ({
      name: teamName(app, t),
      color: teamColor(t),
      values: sc.days.map((d) => habit[2](d.teams[t])),
    })),
    format: habit[3] === "share" ? (v) => pct(v) : (v) => compact(v),
  });
  const habitTools = `<select class="rselect" data-habit aria-label="Measure">${HABITS.map((h) => `<option value="${h[0]}" ${h[0] === habit[0] ? "selected" : ""}>${esc(h[1])}</option>`).join("")}</select>`;

  const plots = s.plots.length;
  const res = S.residence(sc, s.teams.length, plots);
  const cols2 = [
    ...s.plots.map((p, j) => ({ name: p.name, short: plotLabel(app, j) })),
    { name: "Wilds", short: "Wilds" },
  ];
  const heat = figure("r-where", {
    type: "heat",
    label: "Share of each team's days spent on each plot",
    cols: cols2,
    rows: teams.map((t) => ({
      label: teamName(app, t),
      color: teamColor(t),
      cells: res[t].map((v, j) => ({
        value: v,
        text: v >= 0.005 ? pct(v) : "",
        tip: `${pct(v, 1)}\n${teamName(app, t)} on ${cols2[j].name}`,
      })),
    })),
    color: seqTeal,
    inkOn: (v) => (v > 0.55 ? "dark" : "light"),
  });

  return `<div class="rgrid">
    ${card(app, "r-teams", "Teams", teamTable, { span: "w3", table: false, sub: `${monthlyNote(sc)}; select a heading to sort` })}
    ${card(app, "r-habit", habit[1], `${habits}${legend(app, teams)}`, { span: "w3", sub: `${habit[3] === "share" ? "Share of living members" : `Mean per member, ${habit[3]}`}`, tools: habitTools })}
    ${card(app, "r-where", "Where teams live", heat, { span: "w3", sub: "Share of each team's living days" })}
  </div>`;
}

function commons(app, data, sc) {
  const s = app.ix.s;
  const last = sc.days.at(-1);
  const capacity = last ? last.plots.reduce((t, p) => t + p.capacity, 0) : 0;
  const lows = sc.days.map(
    (d) =>
      d.field /
      Math.max(
        1,
        d.plots.reduce((t, p) => t + p.capacity, 0),
      ),
  );
  const need = s.settings.dailyFood;
  const plotDays = sc.days.reduce((t, d) => t + d.plots.length, 0);
  const emptyDays = sc.days.reduce(
    (t, d) => t + d.plots.filter((p) => p.stock === 0).length,
    0,
  );
  const dry = s.plots.filter((_, j) =>
    sc.days.some((d) => d.plots[j]?.stock === 0),
  ).length;
  const kpis = `<div class="rstats">
    ${stat("Field", last ? pct(last.field / Math.max(1, capacity)) : "–", last ? `${fmt(last.field)} of ${fmt(capacity)} carrots` : "")}
    ${stat("Lowest field", lows.length ? pct(Math.min(...lows)) : "–", "of capacity, any night")}
    ${stat("Harvest", sc.days.length ? fmt(S.mean(sc.days.map((d) => d.harvest)), 0) : "–", "carrots a day")}
    ${stat("Empty fields", pct(emptyDays / Math.max(1, plotDays)), `of plot-days; ${fmt(dry)} of ${fmt(s.plots.length)} plots ran dry`)}
    ${stat("Treasuries", last ? fmt(last.treasury) : "–", "carrots, last night")}
  </div>`;
  const panels = s.plots
    .map((p, j) => {
      const id = `r-field-${j}`;
      const days = sc.days;
      const govBands = bandsOf(days.map((d) => d.plots[j]?.government));
      return `<div class="mini"><div class="mini-head"><b>${esc(p.name)}</b><span>${days.length ? `${pct(days.at(-1).plots[j].stock / Math.max(1, days.at(-1).plots[j].capacity))} full` : ""}</span></div>${figure(
        id,
        {
          type: "line",
          label: `${p.name} field stock`,
          height: 130,
          yMin: 0,
          yMax: 1,
          yTicks: 2,
          area: true,
          x: days.map((d) => `Month ${d.month}, day ${d.day}`),
          xName: "Day",
          breaks: monthBreaks(days),
          bands: govBands.map((b) => ({
            ...b,
            color: "var(--influence)",
            opacity: 0.12,
          })),
          series: [
            {
              name: "Field",
              color: "var(--carrot)",
              values: days.map(
                (d) => d.plots[j].stock / Math.max(1, d.plots[j].capacity),
              ),
            },
          ],
          format: (v) => pct(v),
          tipExtra: (i) => {
            const q = days[i]?.plots[j];
            return q
              ? `${fmt(q.stock)} of ${fmt(q.capacity)} carrots, ${fmt(q.residents)} residents${q.government ? ", governed" : ""}`
              : "";
          },
        },
      )}</div>`;
    })
    .join("");
  const flows = figure("r-flows", {
    type: "line",
    label: "Carrots harvested, eaten and needed each day",
    height: 220,
    yMin: 0,
    x: sc.days.map((d) => `Month ${d.month}, day ${d.day}`),
    xName: "Day",
    dividers: monthDividers(sc.days),
    xTicks: edgeTicks(sc.days),
    series: [
      {
        name: "Needed",
        color: "var(--ink-3)",
        values: sc.days.map((d) => need * d.teams.reduce((t, x) => t + x.alive, 0)),
        dash: "4 4",
        width: 1.5,
      },
      {
        name: "Harvested",
        color: "var(--carrot)",
        values: sc.days.map((d) => d.harvest),
      },
      { name: "Eaten", color: "var(--joy)", values: sc.days.map((d) => d.eaten) },
    ],
  });
  const maxRes = Math.max(1, ...sc.days.flatMap((d) => d.plots.map((p) => p.residents)));
  const people = figure("r-people", {
    type: "heat",
    label: "Residents of each plot by day",
    rowHeight: 24,
    labelWidth: 70,
    cols: sc.days.map((d) => ({ name: "" })),
    rows: s.plots.map((p, j) => ({
      label: p.name,
      cells: sc.days.map((d) => ({
        value: d.plots[j].residents / maxRes,
        tip: `${fmt(d.plots[j].residents)} residents\n${p.name}, month ${d.month}, day ${d.day}`,
      })),
    })),
    color: seqTeal,
    table: () =>
      `<table class="table"><thead><tr><th>Day</th>${s.plots.map((p) => `<th>${esc(p.name)}</th>`).join("")}</tr></thead><tbody>${sc.days.map((d) => `<tr><td>Month ${d.month}, day ${d.day}</td>${d.plots.map((p) => `<td>${p.residents}</td>`).join("")}</tr>`).join("")}</tbody></table>`,
  });
  return `${kpis}<div class="rgrid">
    ${card(app, "r-fields", "Fields", `<div class="minis">${panels}</div><p class="strip-key"><span><i style="background:var(--carrot)"></i>field stock, share of capacity</span><span><i style="background:rgba(196,163,255,0.35)"></i>governed</span></p>`, { span: "w3", table: false })}
    ${card(app, "r-flows", "Harvest and meals", `${flows}<p class="strip-key"><span><i style="background:var(--carrot)"></i>harvested</span><span><i style="background:var(--joy)"></i>eaten</span><span><i class="k-dash"></i>needed by the living</span></p>`, { span: "w3", sub: "Carrots a day" })}
    ${card(app, "r-people", "Residents", people, { span: "w3", sub: `Darker is more, up to ${fmt(maxRes)}` })}
  </div>`;
}

function institutions(app, data, sc, teams) {
  const s = app.ix.s;
  const decided = sc.motions;
  const passedN = decided.filter(S.passed).length;
  const turnouts = decided.map(S.turnout).filter((v) => v !== null);
  const founded = decided.filter((m) => m.kind === "found" && S.passed(m)).length;
  const feds = decided.filter((m) => m.kind === "federationFound" && S.passed(m)).length;
  const kpis = `<div class="rstats">
    ${stat("Motions", fmt(decided.length), "decided")}
    ${stat("Passed", decided.length ? pct(passedN / decided.length) : "–", `${fmt(passedN)} motions`)}
    ${stat("Turnout", turnouts.length ? pct(S.mean(turnouts)) : "–", "yes or no, of the electorate")}
    ${stat("Governments", fmt(founded), "founded")}
    ${stat("Federations", fmt(feds), "formed")}
  </div>`;

  // Governance timeline.
  const days = sc.days;
  const passedDays = new Map();
  for (const m of decided)
    if (S.passed(m)) {
      const k = `${m.plot}:${m.abs}`;
      passedDays.set(k, (passedDays.get(k) || []).concat(m));
    }
  const timeline = figure("r-gov", {
    type: "timeline",
    label: "Government and federation membership of each plot by day",
    length: days.length,
    breaks: monthBreaks(days),
    dividers: monthDividers(days).filter(([i]) => i > 0),
    states: GOV_STATES,
    rows: s.plots.map((p, j) => ({
      label: p.name,
      states: days.map((d) =>
        d.plots[j].government ? (d.plots[j].federation >= 0 ? 2 : 1) : 0,
      ),
      marks: days.flatMap((d, i) =>
        passedDays.has(`${j}:${d.abs}`) ? [{ i, kind: "pass" }] : [],
      ),
    })),
    tip: (k, i) => {
      const d = days[i],
        q = d.plots[k];
      const laws = q.laws.map((key) => STATUTES.find((x) => x.key === key)?.name || key);
      const mine = passedDays.get(`${k}:${d.abs}`) || [];
      return {
        title: `${s.plots[k].name}, month ${d.month}, day ${d.day}`,
        rows: [
          {
            name: GOV_STATES[q.government ? (q.federation >= 0 ? 2 : 1) : 0].name,
            value: `${fmt(q.residents)} residents`,
          },
        ],
        extra: [
          laws.length
            ? `Laws: ${laws.join(", ")}`
            : q.government
              ? "No laws beyond the defaults"
              : "",
          mine.length ? `Passed today: ${mine.length}` : "",
        ]
          .filter(Boolean)
          .join(". "),
      };
    },
    table: () =>
      `<table class="table"><thead><tr><th>Day</th>${s.plots.map((p) => `<th>${esc(p.name)}</th>`).join("")}</tr></thead><tbody>${days.map((d) => `<tr><td>Month ${d.month}, day ${d.day}</td>${d.plots.map((p) => `<td>${p.government ? (p.federation >= 0 ? "Federation" : "Government") : ""}${p.laws.length ? ` (${p.laws.length} laws)` : ""}</td>`).join("")}</tr>`).join("")}</tbody></table>`,
  });
  const govKey = `<p class="strip-key"><span><i style="background:${GOV_STATES[1].color}"></i>government</span><span><i style="background:${GOV_STATES[2].color}"></i>in a federation</span><span><i class="k-pass"></i>a motion passed</span></p>`;

  // Laws: adoption and residents' satisfaction with and without.
  const adoption = S.lawAdoption(sc, STATUTES).filter((r) => r.plotDays || r.tabled);
  adoption.sort((a, b) => b.share - a.share || b.tabled - a.tabled);
  const maxDelta = Math.max(1, ...adoption.map((r) => Math.abs(r.delta ?? 0)));
  const lawRows = adoption
    .map((r) => {
      const st = STATUTES.find((x) => x.key === r.key);
      const thin = r.withN < 3 || r.withoutN < 3;
      const d = r.delta;
      const bar =
        d === null
          ? `<span class="dbar none"></span>`
          : `<span class="dbar ${d >= 0 ? "pos" : "neg"} ${thin ? "thin" : ""}" style="--w:${(Math.abs(d) / maxDelta).toFixed(3)}"></span>`;
      return `<tr><td><button class="link" data-rule="${esc(r.key)}">${icon(st?.icon || "scroll")}${esc(st?.name || r.key)}</button></td><td><span class="cellbar" style="--w:${r.share.toFixed(3)}"></span>${pct(r.share)}</td><td>${fmt(r.tabled)}</td><td>${fmt(r.passed)}</td><td>${r.withMean === null ? "–" : `${fmt(r.withMean, 1)} <small>n=${r.withN}</small>`}</td><td>${r.withoutMean === null ? "–" : `${fmt(r.withoutMean, 1)} <small>n=${r.withoutN}</small>`}</td><td class="dcell">${bar}<span class="${thin ? "muted" : ""}">${d === null ? "–" : `${d >= 0 ? "+" : "−"}${fmt(Math.abs(d), 1)}`}</span></td></tr>`;
    })
    .join("");
  const lawTable = adoption.length
    ? `<div class="rtable-wrap"><table class="table rtable laws"><thead><tr><th>Law</th><th>In force</th><th>Tabled</th><th>Passed</th><th>With it</th><th>Without</th><th>Difference</th></tr></thead><tbody>${lawRows}</tbody></table></div><p class="rfoot">In force: share of governed plot-days. With and without: residents' mean satisfaction in governed plot-months that reached the same day, with the law in force at least half the month or never. Faded: fewer than 3 plot-months on a side.</p>`
    : `<p class="note">No laws yet.</p>`;

  // How teams vote, by subject.
  const grid = S.votingMatrix(sc, s.teams.length);
  const vote = figure("r-votes", {
    type: "heat",
    label: "Share of yes among yes and no votes, by team and subject",
    cols: S.SUBJECTS.map((x) => ({ name: x.name, short: x.name.split(" ")[0] })),
    rows: teams.map((t) => ({
      label: teamName(app, t),
      color: teamColor(t),
      cells: S.SUBJECTS.map((x) => {
        const c = grid[t][x.id];
        const n = c.yes + c.no;
        const v = n ? c.yes / n : null;
        return {
          value: v,
          text: v === null ? "" : pct(v),
          tip: `${v === null ? "No votes" : `${pct(v)} yes`}\n${teamName(app, t)} on ${x.name.toLowerCase()}: ${fmt(c.yes)} yes, ${fmt(c.no)} no, ${fmt(c.abstain)} abstained`,
        };
      }),
    })),
    color: diverge,
    inkOn: (v) => (Math.abs(v - 0.5) > 0.32 ? "dark" : "light"),
  });
  const voteKey = `<p class="strip-key"><span><i style="background:${diverge(0)}"></i>mostly no</span><span><i style="background:${diverge(0.5)}"></i>split</span><span><i style="background:${diverge(1)}"></i>mostly yes</span></p>`;

  const bySub = S.motionsBySubject(sc);
  const subjects = figure("r-subjects", {
    type: "bars",
    label: "Motions by subject",
    rows: S.SUBJECTS.filter((x) => bySub[x.id].tabled).map((x) => ({
      label: x.name,
      display: `${fmt(bySub[x.id].passed)} / ${fmt(bySub[x.id].tabled)}`,
      parts: [
        { name: "Passed", value: bySub[x.id].passed, color: "var(--yes)" },
        { name: "Rejected", value: bySub[x.id].failed, color: "var(--no)" },
        {
          name: "Other",
          value: bySub[x.id].tabled - bySub[x.id].passed - bySub[x.id].failed,
          color: "var(--abstain)",
        },
      ],
    })),
  });
  const table = S.teamTable(data, sc, s.teams.length);
  const authors = figure("r-authors", {
    type: "bars",
    label: `Motions tabled by team. ${monthlyNote(sc)}`,
    rows: teams
      .map((t) => table[t])
      .sort((a, b) => (b.tabled ?? 0) - (a.tabled ?? 0))
      .map((t) => ({
        label: teamName(app, t.team),
        color: teamColor(t.team),
        display: fmt(t.tabled ?? 0, 2),
        parts: [
          {
            name: "Motions tabled",
            value: t.tabled ?? 0,
            color: teamColor(t.team),
            display: fmt(t.tabled ?? 0, 2),
          },
        ],
      })),
  });

  const perDay = new Map();
  for (const m of decided) {
    const x = perDay.get(m.abs) || { decided: 0, passed: 0 };
    x.decided++;
    if (S.passed(m)) x.passed++;
    perDay.set(m.abs, x);
  }
  const daily = figure("r-daily", {
    type: "line",
    label: "Motions decided and passed each day",
    height: 190,
    yMin: 0,
    x: days.map((d) => `Month ${d.month}, day ${d.day}`),
    xName: "Day",
    dividers: monthDividers(days),
    xTicks: edgeTicks(days),
    series: [
      {
        name: "Decided",
        color: "var(--ink-3)",
        values: days.map((d) => perDay.get(d.abs)?.decided ?? 0),
      },
      {
        name: "Passed",
        color: "var(--yes)",
        values: days.map((d) => perDay.get(d.abs)?.passed ?? 0),
      },
    ],
    format: (v) => fmt(v),
  });

  return `${kpis}<div class="rgrid">
    ${card(app, "r-gov", "Governance", `${timeline}${govKey}`, { span: "w3" })}
    ${card(app, "r-laws", "Laws", lawTable, { span: "w3", table: false })}
    ${card(app, "r-votes", "How teams vote", `${vote}${voteKey}`, { span: "w2", sub: "Yes share of yes-or-no votes" })}
    ${card(app, "r-subjects", "Motions by subject", `${subjects}<p class="strip-key"><span><i style="background:var(--yes)"></i>passed</span><span><i style="background:var(--no)"></i>rejected</span><span><i style="background:var(--abstain)"></i>beaten, tied or cancelled</span></p>`, { sub: "Passed of decided" })}
    ${card(app, "r-daily", "Motions each day", `${daily}<p class="strip-key"><span><i style="background:var(--ink-3)"></i>decided</span><span><i style="background:var(--yes)"></i>passed</span></p>`, { span: "w15" })}
    ${card(app, "r-authors", "Who tables motions", authors, { span: "w15", sub: monthlyNote(sc) })}
  </div>`;
}

// --- helpers for day axes -------------------------------------------------

function monthBreaks(days) {
  return days.flatMap((d, i) => (i > 0 && d.month !== days[i - 1].month ? [i] : []));
}
function monthDividers(days) {
  const months = new Set(days.map((d) => d.month));
  if (months.size < 2) return [];
  return days.flatMap((d, i) =>
    i === 0 || d.month !== days[i - 1].month ? [[i, `Month ${d.month}`]] : [],
  );
}
function edgeTicks(days) {
  if (!days.length) return [];
  const months = new Set(days.map((d) => d.month));
  if (months.size > 1) return [];
  return [
    [0, `Day ${days[0].day}`],
    [days.length - 1, `Day ${days.at(-1).day}`],
  ];
}
function bandsOf(flags) {
  const out = [];
  let start = -1;
  flags.forEach((f, i) => {
    if (f && start < 0) start = i;
    if ((!f || i === flags.length - 1) && start >= 0) {
      out.push({ from: start - 0.5, to: (f ? i : i - 1) + 0.5 });
      start = -1;
    }
  });
  return out;
}
function scopeNote(sc) {
  const ms = [...new Set(sc.months.map((m) => m.month))];
  const partial = sc.months.find((m) => !m.complete);
  const n = sc.months.reduce((t, m) => t + m.score.length, 0);
  const span =
    ms.length > 1
      ? `Months ${ms[0]} to ${ms.at(-1)}`
      : ms.length
        ? `Month ${ms[0]}${partial ? `, to day ${partial.day}` : ""}`
        : "";
  return `${span}, ${fmt(n)} Amoeboid-months`;
}

function monthlyNote(sc) {
  return sc.months.some((m) => !m.complete)
    ? "Per Amoeboid, month to date"
    : "Per Amoeboid per completed month";
}

// --- export -----------------------------------------------------------------

function download(name, text, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportData(app, kind) {
  const data = app.study?.data;
  const s = app.ix.s;
  if (!data) return;
  const teams = s.teams.map((t) => t.name);
  const plots = s.plots.map((p) => p.name);
  const base = `amoeboids-${app.pb.id.slice(0, 8)}`;
  if (kind === "teams") download(`${base}-teams-by-day.csv`, S.csvTeamDays(data, teams));
  if (kind === "plots")
    download(`${base}-plots-by-day.csv`, S.csvPlotDays(data, plots, teams));
  if (kind === "motions")
    download(`${base}-motions.csv`, S.csvMotions(data, plots, teams));
  if (kind === "agents")
    download(`${base}-amoeboids-by-month.csv`, S.csvAgents(data, teams));
  if (kind === "replay") location.href = `/api/society/runs/${app.pb.id}/export`;
  toast("Download started");
}

// --- page -------------------------------------------------------------------

function bind(app, el) {
  if (el.__bound) return;
  el.__bound = true;
  bindCharts(el);
  el.addEventListener("click", (e) => {
    const t = e.target.closest("button, [data-export]");
    if (!t) {
      if (!e.target.closest(".export-menu"))
        el.querySelector(".export-menu")?.removeAttribute("open");
      return;
    }
    if (t.dataset.rsec) app.resultsSection = t.dataset.rsec;
    else if (t.dataset.rscope !== undefined)
      app.resultsMonth = t.dataset.rscope === "" ? null : Number(t.dataset.rscope);
    else if (t.dataset.tableToggle) {
      const id = t.dataset.tableToggle;
      app.resultsTables.has(id)
        ? app.resultsTables.delete(id)
        : app.resultsTables.add(id);
    } else if (t.dataset.rteam !== undefined) {
      const i = Number(t.dataset.rteam);
      app.resultsHidden.has(i) ? app.resultsHidden.delete(i) : app.resultsHidden.add(i);
      if (app.resultsHidden.size >= app.ix.s.teams.length) app.resultsHidden.delete(i);
    } else if (t.dataset.rsort) app.resultsSort = t.dataset.rsort;
    else if (t.dataset.export) {
      el.querySelector(".export-menu")?.removeAttribute("open");
      return exportData(app, t.dataset.export);
    } else if (t.dataset.rule) return app.actions.openRule(t.dataset.rule);
    else return;
    hideTip();
    renderResults(app);
  });
  el.addEventListener("change", (e) => {
    if (e.target.matches("[data-habit]")) {
      app.resultsHabit = e.target.value;
      renderResults(app);
    }
    if (e.target.matches("[data-rscope-select]")) {
      app.resultsMonth = e.target.value === "" ? null : Number(e.target.value);
      renderResults(app);
    }
  });
  new ResizeObserver(() => drawFigures(el, app.resultsTables)).observe(el);
}

export function renderResults(app) {
  const el = $("view-results");
  if (el.hidden) return;
  app.resultsSection ||= "outcomes";
  app.resultsTables ||= new Set();
  app.resultsHidden ||= new Set();
  bind(app, el);
  ensureStudy(app);
  const st = app.study;
  const data = st?.data;
  if (!data || data.days === undefined) {
    el.__memo = null;
    setHTML(
      el,
      `<div class="page-head"><div><h1>Results</h1></div></div><p class="note">${st?.error ? esc(st.error) : "Gathering the record…"}</p>`,
    );
    return;
  }
  const s = app.ix.s;
  const months = S.monthsIn(data);
  if (
    app.resultsMonth !== null &&
    app.resultsMonth !== undefined &&
    !months.includes(app.resultsMonth)
  )
    app.resultsMonth = null;
  const month = app.resultsMonth ?? null;
  const sc = S.scope(data, month);
  const teams = s.teams.map((_, i) => i).filter((i) => !app.resultsHidden.has(i));
  const memo = [
    st.key,
    month,
    app.resultsSection,
    [...app.resultsTables].join(","),
    teams.join(","),
    app.resultsHabit,
    app.resultsSort,
    el.clientWidth > 0,
  ].join("|");
  if (el.__memo === memo) return drawFigures(el, app.resultsTables);
  el.__memo = memo;

  const scopeCtl =
    months.length > 8
      ? `<select class="rselect" data-rscope-select aria-label="Months"><option value="">All months</option>${months.map((m) => `<option value="${m}" ${month === m ? "selected" : ""}>Month ${m}</option>`).join("")}</select>`
      : `<div class="seg" role="radiogroup" aria-label="Months"><button data-rscope="" role="radio" aria-checked="${month === null}" aria-pressed="${month === null}">All months</button>${months.map((m) => `<button data-rscope="${m}" role="radio" aria-checked="${month === m}" aria-pressed="${month === m}">Month ${m}</button>`).join("")}</div>`;
  const teamCtl = `<div class="rteams" role="group" aria-label="Teams shown">${s.teams.map((t, i) => `<button data-rteam="${i}" aria-pressed="${!app.resultsHidden.has(i)}"><i style="background:${teamColor(i)}"></i>${esc(t.name)}</button>`).join("")}</div>`;
  const exportMenu = `<details class="export-menu"><summary class="btn">${icon("download")}Export</summary><div class="export-list">
      <button data-export="teams">Teams by day<small>CSV</small></button>
      <button data-export="plots">Plots by day<small>CSV</small></button>
      <button data-export="motions">Motions and votes<small>CSV</small></button>
      <button data-export="agents">Amoeboids by month<small>CSV</small></button>
      <button data-export="replay">Full replay<small>JSON</small></button>
    </div></details>`;
  const tabs = `<div class="rtabs" role="tablist">${SECTIONS.map(([id, n]) => `<button role="tab" data-rsec="${id}" aria-selected="${app.resultsSection === id}">${n}</button>`).join("")}</div>`;
  const body = !sc.days.length
    ? `<p class="note">The first night has not fallen yet.</p>`
    : app.resultsSection === "behaviour"
      ? behaviour(app, data, sc, teams)
      : app.resultsSection === "commons"
        ? commons(app, data, sc)
        : app.resultsSection === "institutions"
          ? institutions(app, data, sc, teams)
          : outcomes(app, data, sc, teams);
  const html = `<div class="page-head rhead"><div><h1>Results</h1></div>${exportMenu}</div>
    <div class="rbar">${tabs}<div class="rfilters">${scopeCtl}</div></div>
    ${app.resultsSection === "commons" ? "" : teamCtl}
    <div class="rbody">${body}</div>`;
  setHTML(el, html);
  drawFigures(el, app.resultsTables);
}
