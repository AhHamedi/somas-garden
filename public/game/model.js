import { STATUTES, STATUTE_GROUPS, statute } from "./statutes.js";

// Plain-language reading of observer snapshots. Pure functions only: the world
// renderer and every panel take their words and derived numbers from here, so
// the same rule is never described two different ways.

export const PHASES = [
  { id: "environment", name: "Dawn", verb: "Weather and growth" },
  { id: "harvest_order", name: "Ranking", verb: "Set the harvest order" },
  { id: "harvest", name: "Harvest", verb: "Gathering carrots" },
  { id: "proposals", name: "Motions", verb: "Tabling proposals" },
  { id: "voting", name: "Vote", verb: "Assemblies vote" },
  { id: "transfers", name: "Exchange", verb: "Trade and Justice" },
  { id: "eating", name: "Supper", verb: "Eating and thinking" },
  { id: "close", name: "Night", verb: "The day closes" },
];
export const WEATHER = ["Sunny", "Cloudy", "Dark"];
export const TEAM_COLORS = [
  "#62c3a0",
  "#9d8ff0",
  "#f2a65a",
  "#58b6e6",
  "#ef7c9c",
  "#d4cf58",
];

export const phaseIndex = (phase) => PHASES.findIndex((p) => p.id === phase);
export const fmt = (value, decimals = 0) =>
  Number(value || 0).toLocaleString("en-GB", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  });
export const lcFirst = (t) => String(t).replace(/^./, (c) => c.toLowerCase());
export const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

export function teamColor(team) {
  return TEAM_COLORS[
    ((team % TEAM_COLORS.length) + TEAM_COLORS.length) % TEAM_COLORS.length
  ];
}

/** Indexes a snapshot once so panels never search 300 agents repeatedly. */
export function indexSnapshot(s) {
  const agents = new Map(s.agents.map((a) => [a.id, a]));
  const plots = new Map(s.plots.map((p) => [p.id, p]));
  const residents = new Map(s.plots.map((p) => [p.id, []]));
  residents.set(-1, []);
  for (const a of s.agents)
    if (a.alive) (residents.get(a.plot) || residents.get(-1)).push(a);
  const roles = new Map();
  for (const p of s.plots) {
    for (const [kind, id] of Object.entries(p.roles || {})) {
      if (!["trade", "justice"].includes(kind) || !agents.has(id)) continue;
      const held = roles.get(id) || [];
      held.push({ kind, plot: p.id });
      roles.set(id, held);
    }
  }
  return { s, agents, plots, residents, roles };
}

export function agentName(ix, id) {
  id ??= 0; // Go omits zero-valued targets
  return ix.agents.get(Number(id))?.name || `Resident ${Number(id) + 1}`;
}
export function plotName(ix, id) {
  if (Number(id) < 0) return "outside the plots";
  return ix.plots.get(Number(id))?.name || `Plot ${String.fromCharCode(65 + Number(id))}`;
}
export function plotLetter(p) {
  return String(p.name || "").replace(/^Plot\s*/i, "") || String.fromCharCode(65 + p.id);
}
export function dayLabel(s, absoluteDay) {
  const days = s.settings.days;
  const month = Math.floor((absoluteDay - 1) / days) + 1;
  const day = ((absoluteDay - 1) % days) + 1;
  return month === s.month ? `day ${day}` : `month ${month}, day ${day}`;
}
export const absoluteToday = (s) => s.absoluteDay;

// ---------------------------------------------------------------------------
// Laws

export const roleName = (kind) => (kind === "trade" ? "Trade representative" : "Justice");
export function cropStatus(p) {
  return (
    {
      blight: `Blight · ${plural(p.aidNeeded || 0, "carrot")} of outside aid needed`,
      bumper: "Extra carrots",
      rescued: "Blight relieved",
      failed: "Plot failed",
    }[p.cropEvent] || ""
  );
}
export function humanise(v) {
  return String(v || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .toLowerCase();
}
const listText = (items) =>
  items.length <= 1
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

export const LAW_GROUPS = STATUTE_GROUPS;
export const lawName = (key) => statute(key)?.name || humanise(key);
export function lawValue(ix, key, rule = {}) {
  const mode = rule.mode;
  if (key === "threshold") {
    const fraction = rule.amount ?? ix.s.settings.ruleFraction;
    return `${fraction === 1 ? "All" : `Over ${fmt(fraction * 100, 2)}%`} of ${mode === "tokens" ? "tokens cast" : "eligible voters"}`;
  }
  if (key === "quota" && mode === "limited")
    return `${plural(rule.amount || 0, "carrot")} per resident (advisory)`;
  if (key === "tokenAllocation") {
    const grant = plural(rule.amount || 0, "token");
    if (mode === "restraint")
      return `${grant} + ${fmt(rule.limit)} divided by yesterday’s harvest (minimum divisor 1), rounded down`;
    if (mode === "participation")
      return `${grant} + 1 per ${plural(rule.limit, "Yes or No ballot")} cast yesterday`;
    if (mode === "productivity")
      return `${grant} + 1 per ${plural(rule.limit || 1, "carrot")} harvested`;
    if (mode === "alignment")
      return `${grant} + 1 per ${plural(rule.limit || 1, "aligned vote")}`;
    return `${grant} per resident`;
  }
  return (
    statute(key)?.options.find((o) => o.mode === mode)?.label || humanise(mode || key)
  );
}
export function plotLaws(ix, plot) {
  return Object.entries(plot.rules || {}).map(([key, rule]) => ({
    key,
    base: key,
    scope: "local",
    group: statute(key)?.group,
    name: lawName(key),
    value: lawValue(ix, key, rule),
    sentence: statute(key)?.description || "",
  }));
}

export const STATUS = {
  open: { label: "On the floor", tone: "open" },
  passed: { label: "Passed", tone: "yes" },
  approved: { label: "Approved locally", tone: "yes" },
  scheduled: { label: "Passed, starts tomorrow", tone: "yes" },
  activated: { label: "In force", tone: "yes" },
  failed: { label: "Rejected", tone: "no" },
  tied: { label: "Tied with a rival", tone: "neutral" },
  superseded: { label: "Beaten by a rival", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  invalid: { label: "Invalid", tone: "neutral" },
  lapsed: { label: "Lapsed", tone: "neutral" },
};
export const statusOf = (p) =>
  STATUS[p.status] || { label: humanise(p.status), tone: "neutral" };
export const passedStatus = (p) =>
  ["passed", "approved", "scheduled", "activated"].includes(p.status);

/** A short, specific title for a motion. */
export function motionTitle(ix, p) {
  const i = p.input || {};
  switch (i.kind) {
    case "elect":
      return `Elect ${agentName(ix, i.target)} to the Department of ${i.key === "trade" ? "Trade" : "Justice"}`;
    case "revoke":
      return `Remove ${agentName(ix, i.target)} from ${i.key === "trade" ? "Trade" : "Justice"}`;
    case "policy":
      return `${lawName(i.key)} · ${lawValue(ix, i.key, i.rule)}`;
    case "repeal":
      return `Repeal ${lawName(i.key)}`;
    case "found":
      return "Found a government";
    case "dissolve":
      return "Dissolve the government";
    default:
      return p.title || humanise(i.kind);
  }
}
export function motionChange(ix, p) {
  const i = p.input || {};
  const current = ix.plots.get(p.plot)?.rules?.[i.key];
  if (i.kind === "policy" || i.kind === "repeal") {
    const def = statute(i.key)?.defaultValue || "Default";
    const before =
      p.status === "activated" ? null : current ? lawValue(ix, i.key, current) : def;
    return { before, after: i.kind === "repeal" ? def : lawValue(ix, i.key, i.rule) };
  }
  return { before: null, after: motionTitle(ix, p) };
}
export function motionThreshold(p) {
  const total = p.total || 0;
  const fraction = p.fraction || (p.threshold === "twoThirds" ? 2 / 3 : 0.5);
  let need = Math.floor(total * fraction);
  if (fraction !== 1) {
    // Compare the ratio as the engine does. For example, 50 * 0.58 rounds below 29.
    while (need < total && need / total <= fraction) need++;
  }
  if (!p.tallyBasis && p.threshold === "twoThirds") need = Math.ceil((total * 2) / 3);
  return {
    unit:
      p.tallyBasis === "tokens"
        ? "tokens cast"
        : p.tallyBasis === "voters" || p.input?.kind === "found"
          ? "eligible voters"
          : "voting weight",
    total,
    need,
    rule:
      fraction === 1
        ? "Unanimity"
        : !p.tallyBasis && p.threshold === "twoThirds"
          ? "Two thirds"
          : `Over ${fmt(fraction * 100, 2)}%`,
  };
}
export function motionTally(p) {
  const t = motionThreshold(p);
  return {
    ...t,
    yes: p.yes || 0,
    no: p.no || 0,
    abstain: p.abstain ?? Math.max(0, t.total - (p.yes || 0) - (p.no || 0)),
  };
}

/** Motions relevant to a plot on a given absolute day (tabled or decided). */
export function motionsFor(s, plotId, absoluteDay = s.absoluteDay) {
  return (s.proposals || []).filter(
    (p) =>
      (plotId === undefined || p.plot === plotId) &&
      (p.created === absoluteDay || p.closes === absoluteDay),
  );
}

// ---------------------------------------------------------------------------
// Plot and population summaries

export function plotSummary(ix, plot) {
  const residents = ix.residents.get(plot.id) || [];
  const n = residents.length;
  const sum = (f) => residents.reduce((t, a) => t + f(a), 0);
  const teams = new Map();
  for (const a of residents) teams.set(a.team, (teams.get(a.team) || 0) + 1);
  const laws = Object.keys(plot.rules || {}).length;
  const open = (ix.s.proposals || []).filter(
    (p) => p.plot === plot.id && p.status === "open",
  ).length;
  const today = motionsFor(ix.s, plot.id).length;
  return {
    population: n,
    teams: [...teams.entries()].sort((a, b) => b[1] - a[1]),
    satisfaction: n ? sum((a) => a.score) / n : 0,
    body: n ? sum((a) => a.body) / n : 0,
    mind: n ? sum((a) => a.mind) / n : 0,
    votingWeight: n ? sum((a) => a.votingWeight ?? a.influence ?? 0) / n : 0,
    food: sum((a) => a.food),
    hungry: residents.filter((a) => a.body < (ix.s.settings.bodyCapacity || 2)).length,
    fieldShare: plot.capacity ? plot.stock / plot.capacity : 0,
    laws,
    open,
    today,
  };
}

export function worldSummary(ix) {
  const s = ix.s;
  const alive = s.agents.filter((a) => a.alive);
  return {
    alive: alive.length,
    population: s.agents.length,
    field: s.plots.reduce((t, p) => t + p.stock, 0),
    capacity: s.plots.reduce((t, p) => t + p.capacity, 0),

    held: alive.reduce((t, a) => t + a.food, 0),
    satisfaction: alive.length
      ? alive.reduce((t, a) => t + a.score, 0) / alive.length
      : 0,
    governments: s.plots.filter((p) => p.government).length,

    outside: (ix.residents.get(-1) || []).length,
    awaiting: s.agents.filter((a) => !a.alive).length,
  };
}

// ---------------------------------------------------------------------------
// What happened in a phase

function sumBy(events, kind, field = "amount") {
  let t = 0;
  for (const e of events) if (e.kind === kind) t += Number(e[field] || 0);
  return t;
}
function countBy(events, kind) {
  let t = 0;
  for (const e of events) if (e.kind === kind) t++;
  return t;
}

/**
 * Headline and figures for the phase a snapshot has just completed. `prev` is
 * the frame before it, when available, so migration can be described.
 */
export function phaseStory(ix, prev) {
  const s = ix.s;
  const ev = s.events || [];
  const figures = [];
  let headline = "";
  const weatherLine = () => {
    const by = [[], [], []];
    for (const p of s.plots) by[p.weather].push(plotLetter(p));
    return by
      .map((letters, w) =>
        letters.length
          ? `${["sun", "cloud", "dark skies"][w]} over ${listText(letters)}`
          : null,
      )
      .filter(Boolean)
      .join(", ");
  };
  switch (s.phase) {
    case "ready":
      headline = `${fmt(s.agents.length)} Amoeboids are ready to choose their plots. Press play to begin day 1.`;
      break;
    case "environment": {
      const grown = sumBy(ev, "growth");
      const back = countBy(ev, "respawn");
      const activated = countBy(ev, "activated");
      headline =
        s.day === 1 && s.month >= 1
          ? `Month ${s.month} dawns. Residents choose plots for the month with ${fmt(s.settings.startingMind)} mind and no food.`
          : `Dawn: ${weatherLine()}. ${grown ? `${fmt(grown)} carrots grew.` : "Nothing grew."}`;
      if (grown)
        figures.push({
          icon: "sprout",
          value: `+${fmt(grown)}`,
          label: "grown",
          tone: "carrot",
        });
      if (activated)
        figures.push({
          icon: "scroll",
          value: fmt(activated),
          label: activated === 1 ? "decision takes effect" : "decisions take effect",
          tone: "yes",
        });
      if (back)
        figures.push({
          icon: "spark",
          value: fmt(back),
          label: "rejoined",
          tone: "mind",
        });
      const sanctions = countBy(ev, "sanction_applied");
      if (sanctions) headline += ` Justice applied ${plural(sanctions, "sanction")}.`;
      const crops = s.plots.filter(
        (p) => p.cropEvent === "blight" || p.cropEvent === "bumper",
      );
      if (crops.length)
        headline +=
          " " + crops.map((p) => `${p.name}: ${cropStatus(p)}`).join(". ") + ".";
      break;
    }
    case "harvest_order": {
      const ballots = countBy(ev, "harvest_ranking");
      headline = `Harvest order set. ${plural(ballots, "ranking")} submitted across the plots.`;
      break;
    }
    case "movement":
      headline = "Archived movement phase.";
      break;
    case "harvest": {
      const got = sumBy(ev, "harvest");
      const who = countBy(ev, "harvest");
      const breaches = countBy(ev, "ration_breach");

      headline = got
        ? `${plural(who, "resident")} harvested ${plural(got, "carrot")}${breaches ? `; ${plural(breaches, "breach", "breaches")} of soft quotas` : ""}.`
        : "No carrots were harvested.";
      if (got)
        figures.push({
          icon: "carrot",
          value: fmt(got),
          label: "harvested",
          tone: "carrot",
        });
      if (breaches)
        figures.push({
          icon: "alert",
          value: fmt(breaches),
          label: "quota breaches",
          tone: "no",
        });
      break;
    }
    case "proposals": {
      const tabled = (s.proposals || []).filter((p) => p.created === s.absoluteDay);
      const rejected = countBy(ev, "proposal_rejected");
      const titles = [...new Set(tabled.map((p) => motionTitle(ix, p)))];
      headline = tabled.length
        ? `${plural(tabled.length, "motion")} tabled: ${titles.slice(0, 2).map(lcFirst).join("; ")}${titles.length > 2 ? ` and ${titles.length - 2} more` : ""}.`
        : "No motions were tabled today.";
      if (tabled.length)
        figures.push({
          icon: "scroll",
          value: fmt(tabled.length),
          label: "tabled",
          tone: "influence",
        });
      if (rejected)
        figures.push({
          icon: "alert",
          value: fmt(rejected),
          label: "refused as invalid",
          tone: "no",
        });
      const pledged = sumBy(ev, "pledge");
      if (pledged)
        figures.push({
          icon: "mind",
          value: fmt(pledged, 1),
          label: "mind pledged",
          tone: "mind",
        });
      break;
    }
    case "voting": {
      const decided = (s.proposals || []).filter(
        (p) => p.closes === s.absoluteDay && p.status !== "open",
      );
      const passed = decided.filter(passedStatus);
      headline = decided.length
        ? `${plural(decided.length, "motion")} decided: ${fmt(passed.length)} passed${passed[0] ? `, including ${lcFirst(motionTitle(ix, passed[0]))} in ${plotName(ix, passed[0].plot)}` : ""}.`
        : "No motions came to a vote.";
      if (decided.length)
        figures.push({
          icon: "ballot",
          value: `${fmt(passed.length)} / ${fmt(decided.length)}`,
          label: "passed",
          tone: "yes",
        });
      break;
    }
    case "transfers": {
      const given = sumBy(ev, "gift");
      const donated = sumBy(ev, "donation");
      headline =
        given || donated
          ? `${plural(donated, "carrot")} donated to Trade. Representatives gave ${plural(given, "carrot")}.`
          : "No carrots changed hands.";
      const sanctions = countBy(ev, "justice_order");
      if (sanctions) headline += ` Justice scheduled ${plural(sanctions, "sanction")}.`;
      for (const e of ev.filter((e) =>
        ["blight_rescued", "plot_failed"].includes(e.kind),
      )) {
        const detail =
          e.kind === "plot_failed" ? "failed after blight" : "received enough relief";
        headline += ` ${plotName(ix, e.plot)} ${detail}.`;
      }
      break;
    }
    case "eating": {
      const eaten = sumBy(ev, "eat");
      const thought = sumBy(ev, "think");
      const deaths = ev.filter((e) => ["excluded", "death"].includes(e.kind));
      const where = new Map();
      for (const d of deaths) {
        const plot = prev?.agents?.get(d.actor)?.plot ?? d.plot;
        where.set(plot, (where.get(plot) || 0) + 1);
      }
      const worst = [...where.entries()].sort((a, b) => b[1] - a[1])[0];
      headline = `${plural(eaten, "carrot")} eaten and ${fmt(thought, 0)} mind spent thinking.${deaths.length ? ` ${plural(deaths.length, "Amoeboid")} excluded${worst && worst[0] >= 0 ? `, ${worst[1]} in ${plotName(ix, worst[0])}` : ""}.` : ""}`;
      figures.push({ icon: "bowl", value: fmt(eaten), label: "eaten", tone: "carrot" });
      if (thought)
        figures.push({
          icon: "mind",
          value: fmt(thought),
          label: "thought",
          tone: "joy",
        });
      if (deaths.length)
        figures.push({
          icon: "excluded",
          value: fmt(deaths.length),
          label: "excluded",
          tone: "no",
        });
      break;
    }
    case "close": {
      const w = worldSummary(ix);
      headline = s.meteor
        ? s.done
          ? "The final meteor falls. The year is over."
          : `A meteor ends month ${s.month}. Only memories survive.`
        : `Night falls on day ${s.day}. ${fmt(w.alive)} active, average satisfaction ${fmt(w.satisfaction, 1)} this month.`;
      figures.push({
        icon: "people",
        value: fmt(w.alive),
        label: "active",
        tone: "mind",
      });
      figures.push({
        icon: "joy",
        value: fmt(w.satisfaction, 1),
        label: "avg satisfaction",
        tone: "joy",
      });
      break;
    }
  }
  return { headline, figures };
}

/** Events worth surfacing as a toast and in the chronicle. */
export function notableEvents(ix, prev) {
  const s = ix.s;
  const out = [];
  const ev = s.events || [];
  if (s.phase === "environment") {
    for (const e of ev) {
      if (e.kind !== "activated") continue;
      if (/^Found a government/.test(e.message))
        out.push({
          tone: "yes",
          icon: "hall",
          plot: e.plot,
          text: `${plotName(ix, e.plot)} founded a government`,
        });
    }
    for (const p of s.plots)
      if (["blight", "bumper"].includes(p.cropEvent))
        out.push({
          tone: p.cropEvent === "blight" ? "no" : "yes",
          icon: p.cropEvent === "blight" ? "alert" : "sprout",
          plot: p.id,
          text: `${p.name} · ${cropStatus(p)}`,
        });
  }
  for (const e of ev.filter((e) => ["blight_rescued", "plot_failed"].includes(e.kind))) {
    const failure = e.kind === "plot_failed";
    out.push({
      tone: failure ? "no" : "yes",
      icon: failure ? "alert" : "sprout",
      plot: e.plot,
      text: `${plotName(ix, e.plot)} ${failure ? "failed after blight" : "received enough relief"}`,
    });
  }
  if (s.phase === "environment")
    for (const e of ev)
      if (e.kind === "dissolution")
        out.push({
          tone: "no",
          icon: "hall",
          plot: e.plot,
          text: `${plotName(ix, e.plot)}'s government dissolved`,
        });
  if (s.phase === "voting") {
    // The same decision taken in several plots is announced once.
    const decided = (s.proposals || []).filter(
      (p) => p.closes === s.absoluteDay && passedStatus(p) && p.input?.kind !== "found",
    );
    const groups = new Map();
    for (const p of decided) {
      const i = p.input || {};
      const key = JSON.stringify([i.kind, i.key, i.target, i.rule]);
      const g = groups.get(key) || { p, plots: [] };
      if (!g.plots.includes(p.plot)) g.plots.push(p.plot);
      groups.set(key, g);
    }
    for (const { p, plots } of groups.values()) {
      const letters = plots
        .sort((a, b) => a - b)
        .map((id) => plotLetter(ix.plots.get(id) || { id }));
      const who =
        letters.length > 1 && letters.length === s.plots.length
          ? "Every plot"
          : listText(letters);
      const what = `passed ${lcFirst(motionTitle(ix, p))}`;
      out.push({
        tone: "yes",
        icon: "ballot",
        plot: p.plot,
        proposal: p.id,
        text: `${who} ${what}`,
      });
    }
  }
  if (s.phase === "eating") {
    const where = new Map();
    for (const e of ev)
      if (["excluded", "death"].includes(e.kind)) {
        const plot = prev?.agents?.get(e.actor)?.plot ?? e.plot;
        where.set(plot, (where.get(plot) || 0) + 1);
      }
    for (const [plot, n] of where)
      if (n >= 3)
        out.push({
          tone: "no",
          icon: "excluded",
          plot,
          text: `${plural(n, "Amoeboid")} excluded in ${plotName(ix, plot)}`,
        });
  }
  return out;
}

/** An engine event in the observer's words. */
export function eventText(e, ix) {
  switch (e.kind) {
    case "pledge":
      return `Pledged ${fmt(e.amount, 2)} mind to the plot’s founding cost`;
    case "eat": {
      const m = /([\d.]+) satisfaction/.exec(e.message || "");
      const sat = m ? Number(m[1]) : 0;
      return `Ate ${plural(e.amount || 0, "carrot")}${sat > 0 ? `, earning ${fmt(sat, 2)} satisfaction` : ""}`;
    }
    case "think":
      return `Thought with ${fmt(e.amount, 2)} mind, earning ${fmt(e.amount * (ix?.s?.settings?.thinkingReward ?? 1), 2)} satisfaction`;
    case "harvest_ranking":
      return ix
        ? `Ranked ${(e.members || []).map((id) => agentName(ix, id)).join(" → ")}`
        : e.message;
    case "placement":
      return e.message;
    case "respawn":
      return "Rejoined the plot";
    case "proposal":
      return `Tabled ${lcFirst(e.message)}`;
    case "death":
      return "Excluded";
    default:
      return e.message;
  }
}

/** What one resident did today, newest last, from frames' events. */
export function agentDay(events, id) {
  const ignored = new Set(["funding"]);
  return events.filter((e) => e.actor === id && !ignored.has(e.kind));
}

export const scoreHelp = ({ settings: set, version }) =>
  `Each mind spent thinking earns ${fmt(set?.thinkingReward ?? 1, 2)} points. Each meal earns ${fmt(set?.overeatingReward ?? 1, 2)} × ${version < 7 ? "log₂(1 + extra carrots)" : "extra carrots"}. The meteor resets satisfaction.`;

// ---------------------------------------------------------------------------
// Chamber geometry

/**
 * Seat centres for a parliament-style hemicycle. Rows are added until the
 * arcs can hold every voter at an even spacing; seats are then ordered by
 * angle so each side of the vote forms a wedge from left to right.
 */
export function hemicycleSeats(n, width = 600, height = 300) {
  if (!n) return [];
  const outer = Math.min(width / 2, height) - 8;
  const inner = outer * 0.38;
  let rows = 1,
    s,
    radii,
    caps;
  for (;;) {
    s = (outer - inner) / rows;
    radii = Array.from({ length: rows }, (_, i) => inner + s * (i + 0.5));
    caps = radii.map((r) => Math.floor((Math.PI * r) / s) + 1);
    if (caps.reduce((t, c) => t + c, 0) >= n || rows >= 12) break;
    rows++;
  }
  const capacity = caps.reduce((t, c) => t + c, 0);
  const counts = caps.map((c) => Math.floor((c * n) / capacity));
  let left = n - counts.reduce((t, c) => t + c, 0);
  for (let i = rows - 1; left > 0; i = (i - 1 + rows) % rows) {
    if (counts[i] < caps[i]) {
      counts[i]++;
      left--;
    }
  }
  const seats = [];
  radii.forEach((r, i) => {
    const c = counts[i];
    for (let j = 0; j < c; j++) {
      const angle = c === 1 ? Math.PI / 2 : Math.PI - (j / (c - 1)) * Math.PI;
      seats.push({
        x: width / 2 + Math.cos(angle) * r,
        y: height - Math.sin(angle) * r,
        angle,
        row: i,
      });
    }
  });
  seats.sort((a, b) => b.angle - a.angle || a.row - b.row);
  const radius = Math.min(16, s * 0.36);
  return seats.map((p) => ({ ...p, r: radius }));
}

// The presets before November 2026, by behaviour: their nearest current
// preset and their default team name.
const RETIRED = {
  steward: ["warden", "Stewards"],
  thinker: ["sunchaser", "Thinkers"],
  gatherer: ["locust", "Gatherers"],
  diplomat: ["envoy", "Diplomats"],
  wanderer: ["sunchaser", "Wanderers"],
  learner: ["tinkerer", "Learners"],
};

/**
 * Updates a saved team list. The untouched old default line-up becomes the
 * current one; otherwise a retired behaviour maps to its nearest preset and
 * the team keeps its name.
 */
export function migrateTeams(teams, defaults) {
  if (!Array.isArray(teams)) return teams;
  const oldDefaults = Object.entries(RETIRED);
  const untouched =
    teams.length === oldDefaults.length &&
    teams.every(
      (t, i) =>
        !t.builder &&
        !t.strategyId &&
        t.policy === oldDefaults[i][0] &&
        t.name === oldDefaults[i][1][1],
    );
  if (untouched) return structuredClone(defaults);
  return teams.map((t) => {
    if (t.builder) {
      const builder = structuredClone(t.builder);
      delete builder.migrate;
      if (builder.rules)
        builder.rules = builder.rules.map((rule) => {
          const field =
            { influence: "votingWeight", deaths: "exclusions" }[rule.field] || rule.field;
          if (
            rule.phase === "movement" &&
            Number.isInteger(rule.action?.move) &&
            rule.action.move >= 0
          )
            return {
              ...rule,
              field,
              phase: "placement",
              action: { plotChoice: rule.action.move },
            };
          return { ...rule, field };
        });
      return { ...t, builder };
    }
    return RETIRED[t.policy] && !t.strategyId
      ? { ...t, policy: RETIRED[t.policy][0] }
      : t;
  });
}
