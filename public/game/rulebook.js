// The rulebook covers every rule and decision the Amoeboids
// can vote on, with each option, its parameters, how it is decided, where it
// is in force now and what happened to it in this run.
import { $, icon, setHTML } from "/game/dom.js";
import { esc, fmt, plural, PHASES } from "/game/model.js";
import { STATUTES, DECISIONS, STATUTE_GROUPS, fill } from "/game/statutes.js";
import { statuteStatus, DEFAULT_MODE } from "/game/statute-book.js";
import { statuteKeyOf, passed } from "/game/study.js";
import { ensureStudy } from "/game/results.js";

function entries() {
  const out = [
    { id: "constitution", name: "How votes work", icon: "ballot", group: "Basics" },
  ];
  for (const g of STATUTE_GROUPS)
    for (const st of STATUTES.filter((x) => x.group === g.id))
      out.push({
        id: `local:${st.key}`,
        name: st.name,
        icon: st.icon,
        group: g.name,
        st,
      });
  for (const d of DECISIONS)
    out.push({
      id: `decision:${d.kind}`,
      name: d.name,
      icon: d.icon,
      group: "One-off decisions",
      d,
    });
  return out;
}
const ENTRIES = entries();
const byId = new Map(ENTRIES.map((e) => [e.id, e]));
const textOf = (e) => e.st?.description || e.d?.short || "";
function resolve(id) {
  if (!id) return "constitution";
  if (byId.has(id)) return id;
  if (byId.has(`local:${id}`)) return `local:${id}`;
  if (byId.has(`decision:${id}`)) return `decision:${id}`;
  return "constitution";
}

function matches(e, q) {
  if (!q) return true;
  const hay = [
    e.name,
    e.group,
    textOf(e),
    ...(e.st?.points?.earn || []).map((r) => r[0]),
    ...(e.st?.options || []).map((o) => `${o.label} ${o.short || ""}`),
    e.d?.short || "",
  ]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

/** How many plots have this rule in force. */
function inForce(ix, e) {
  const s = ix.s;
  if (e.st?.scope === "local")
    return s.plots.filter((p) => p.government && statuteStatus(ix, p, e.st).enacted)
      .length;
  return null;
}

// --- rendering -----------------------------------------------------------

function indexHTML(app) {
  const q = app.ruleQuery || "";
  const ix = app.ix;
  const shown = ENTRIES.filter((e) => matches(e, q));
  if (!shown.length) return `<p class="note rb-none">No rule matches “${esc(q)}”.</p>`;
  let group = "";
  let html = "";
  for (const e of shown) {
    if (e.group !== group) {
      group = e.group;
      html += `<h4>${esc(group)}</h4>`;
    }
    const n = inForce(ix, e);
    html += `<button class="rb-item" data-rb="${e.id}" aria-current="${app.rule === e.id}">${icon(e.icon)}<span>${esc(e.name)}</span>${n ? `<b title="${plural(n, "plot")} with it in force">${n}</b>` : ""}</button>`;
  }
  return html;
}

function facts(rows, set) {
  return `<dl class="rb-facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(fill(v, set))}</dd></div>`).join("")}</dl>`;
}

function constitution(app) {
  const set = app.ix.s.settings;
  const strip = PHASES.map(
    (p) =>
      `<span class="${p.id === "proposals" ? "tabled" : p.id === "voting" ? "voted" : ""}">${p.name}</span>`,
  ).join("");
  return `<header class="rb-head"><span class="rb-icon">${icon("ballot")}</span><div><h2>How votes work</h2><p>Any active resident may table a motion in their plot.</p></div></header>
    <section class="rb-sec"><h3>Daily sequence</h3><div class="rb-day">${strip}<span class="next">Dawn</span></div></section>
    <section class="rb-sec"><h3>Rules and elections</h3>${facts(
      [
        [
          "Rule changes",
          "The plot chooses the support fraction and whether to count eligible voters or tokens cast.",
        ],
        [
          "Eligible voters",
          "Each resident can cast one yes or no for one token. Abstentions remain in the denominator.",
        ],
        [
          "Tokens cast",
          "Residents allocate tokens across motions. Only tokens spent on yes and no count toward the threshold.",
        ],
        [
          "Founding, dissolution and roles",
          "More than half of eligible residents must support the decision. Each cast vote costs one token.",
        ],
        [
          "Timing",
          "A decision that passes takes effect the next morning. Tied rival options preserve the current rule.",
        ],
      ],
      set,
    )}</section>
    <section class="rb-sec"><h3>Harvest and relief</h3>${facts(
      [
        [
          "Rankings",
          "Each resident can rank every resident in their plot, including themselves. Highest total rank points harvests first.",
        ],
        [
          "Trade",
          "The elected representative receives donations, holds a larger personal store and can send carrots to another representative or gift them locally.",
        ],
        [
          "Blight",
          "Incoming gifts are planted first. The affected Trade representative must receive enough outside carrots by nightfall. An unresolved blight excludes the plot’s residents.",
        ],
        ["Bumper crop", "A random favourable event increases the field’s yield."],
        [
          "Justice",
          "The elected holder decides sanctions for public breaches. Residents can vote to revoke either role.",
        ],
        [
          "Exclusion",
          "The resident loses their stored carrots and role. A monthly reset gives everyone a fresh plot choice.",
        ],
      ],
      set,
    )}</section>`;
}

function lawPage(app, e) {
  const ix = app.ix,
    s = ix.s,
    set = s.settings;
  const st = e.st;
  const def = st.key === "threshold" ? set.ruleThreshold : DEFAULT_MODE[st.key];
  const defaultIsOption = st.options.some((o) => o.mode === def);
  const opts = [
    defaultIsOption
      ? ""
      : `<li class="rb-opt base"><span class="rb-mark" aria-hidden="true"></span><b>${esc(fill(st.defaultValue, set))}</b><span>no law</span><em>default</em></li>`,
    ...st.options.map(
      (o) =>
        `<li class="rb-opt ${o.mode === def ? "base" : ""}"><span class="rb-mark" aria-hidden="true"></span><b>${esc(o.label)}</b><span>${esc(fill(o.short || "", set))}</span>${o.params?.length ? `<code>${o.params.map((p) => esc(st.params[p]?.[0] || p)).join(", ")}</code>` : ""}${o.mode === def ? "<em>default</em>" : ""}</li>`,
    ),
  ].join("");
  const params = Object.values(st.params || {});
  const paramTable = params.length
    ? `<section class="rb-sec"><h3>Parameters</h3>${facts(
        params.map(([n, r]) => [n, r]),
        set,
      )}</section>`
    : "";
  const decided = [
    ["Tabled by", "Any active resident in a governed plot"],
    ["Passes with", "The plot’s current rule threshold"],
    ["In force", "From the next dawn"],
  ];
  const now = s.plots
    .map((p) => {
      const stt = statuteStatus(ix, p, st);
      return `<button class="rb-plot ${stt.locked ? "locked" : stt.enacted ? "on" : ""}" data-rb-plot="${p.id}" data-rb-law="local:${st.key}"><b>${esc(p.name.replace(/^Plot\s*/, ""))}</b><span>${esc(stt.locked ? (p.government ? stt.locked : "No government") : stt.value)}</span></button>`;
    })
    .join("");

  const data = app.study?.data;
  let history = "";
  if (data) {
    const mine = data.motions.filter((m) => statuteKeyOf(m) === st.key);
    const ok = mine.filter(passed).length;
    const days = data.days;
    const governed = days.reduce(
      (t, d) => t + d.plots.filter((p) => p.government).length,
      0,
    );
    const held = days.reduce(
      (t, d) => t + d.plots.filter((p) => p.laws?.includes(st.key)).length,
      0,
    );
    const modes = {};
    for (const m of mine) {
      const label =
        st.options.find((o) => o.mode === m.mode)?.label ||
        (m.kind.endsWith("epeal") ? "Repeal" : m.mode || "Change");
      const x = (modes[label] ||= { tabled: 0, passed: 0 });
      x.tabled++;
      if (passed(m)) x.passed++;
    }
    const modeRows = Object.entries(modes)
      .sort((a, b) => b[1].tabled - a[1].tabled)
      .map(
        ([label, x]) =>
          `<div class="rb-mode"><span>${esc(label)}</span><span class="rb-mbar"><i class="t" style="width:${(x.tabled / Math.max(...Object.values(modes).map((y) => y.tabled))) * 100}%"></i><i class="p" style="width:${(x.passed / Math.max(...Object.values(modes).map((y) => y.tabled))) * 100}%"></i></span><b>${fmt(x.passed)} / ${fmt(x.tabled)}</b></div>`,
      )
      .join("");
    history = `<section class="rb-sec"><h3>This run</h3><div class="rb-stats"><div><b>${fmt(mine.length)}</b><span>motions</span></div><div><b>${fmt(ok)}</b><span>passed</span></div>${held === null ? "" : `<div><b>${governed ? `${fmt((held / governed) * 100)}%` : "–"}</b><span>of governed plot-days in force</span></div>`}</div>${modeRows ? `<div class="rb-modes">${modeRows}</div><p class="rb-daykey"><span><i class="tabled"></i>tabled</span><span><i class="passed"></i>passed</span></p>` : ""}</section>`;
  }
  const chips = [
    "Local rule",
    STATUTE_GROUPS.find((g) => g.id === st.group)?.name,
  ].filter(Boolean);
  return `<header class="rb-head"><span class="rb-icon">${icon(st.icon)}</span><div><h2>${esc(e.name)}</h2><div class="rb-chips">${chips.map((c) => `<span>${esc(c)}</span>`).join("")}</div><p>${esc(textOf(e))}</p></div></header>
    <section class="rb-sec"><h3>On the ballot</h3><ol class="rb-opts">${opts}</ol></section>
    ${paramTable}
    <section class="rb-sec"><h3>Decided</h3>${facts(decided, set)}</section>
    <section class="rb-sec"><h3>In each plot now</h3><div class="rb-plots">${now}</div></section>
    ${history}`;
}

function decisionPage(app, e) {
  const ix = app.ix,
    s = ix.s,
    set = s.settings;
  const d = e.d;
  const merged = [
    ["Needs", d.requires === "noGovernment" ? "An ungoverned plot" : "A governed plot"],
    [
      "Passes with",
      d.kind === "repeal"
        ? "The current rule threshold"
        : "More than half of eligible residents",
    ],
    ["Takes effect", "The following dawn"],
  ];
  const data = app.study?.data;
  let history = "";
  if (data) {
    const mine = data.motions.filter((m) => m.kind === d.kind);
    history = `<section class="rb-sec"><h3>This run</h3><div class="rb-stats"><div><b>${fmt(mine.length)}</b><span>motions</span></div><div><b>${fmt(mine.filter(passed).length)}</b><span>passed</span></div></div></section>`;
  }
  return `<header class="rb-head"><span class="rb-icon">${icon(d.icon)}</span><div><h2>${esc(e.name)}</h2><div class="rb-chips"><span>One-off decision</span></div><p>${esc(d.short || "")}</p></div></header>
    <section class="rb-sec"><h3>Decided</h3>${facts(merged, set)}</section>${history}`;
}

// --- page --------------------------------------------------------------------

function bind(app, el) {
  if (el.__bound) return;
  el.__bound = true;
  el.innerHTML = `<div class="page-head"><div><h1>Rulebook</h1></div><label class="rb-search">${icon("search")}<input type="search" id="rb-q" placeholder="Search laws and options" aria-label="Search the rulebook" autocomplete="off"/></label></div>
    <div class="rb"><nav class="rb-index" id="rb-index" aria-label="Rules"></nav><article class="rb-page" id="rb-page" tabindex="-1"></article></div>`;
  $("rb-q").addEventListener("input", (e) => {
    app.ruleQuery = e.target.value;
    const first = ENTRIES.find((x) => matches(x, app.ruleQuery));
    if (first && !matches(byId.get(app.rule), app.ruleQuery)) app.rule = first.id;
    renderRulebook(app, true);
  });
  $("rb-q").addEventListener("keydown", (e) => {
    if (e.key === "Enter")
      $("rb-index").querySelector(`[data-rb="${app.rule}"]`)?.focus();
  });
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.rb) {
      app.rule = b.dataset.rb;
      renderRulebook(app, true);
      $("rb-page").scrollTop = 0;
      if (b.closest(".rb-page")) $("rb-page").focus({ preventScroll: true });
    } else if (b.dataset.rbPlot !== undefined) {
      const [scope, key] = b.dataset.rbLaw.split(":");
      app.actions.openLaw(scope, key, Number(b.dataset.rbPlot));
    }
  });
  el.addEventListener("keydown", (e) => {
    const b = e.target.closest?.(".rb-item");
    if (!b || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    e.preventDefault();
    e.stopPropagation();
    const items = [...el.querySelectorAll(".rb-item")];
    const next = items[items.indexOf(b) + (e.key === "ArrowDown" ? 1 : -1)];
    if (next) {
      next.focus();
      next.click();
    }
  });
}

export function renderRulebook(app, force = false) {
  const el = $("view-rulebook");
  if (!el || el.hidden) return;
  bind(app, el);
  app.rule = resolve(app.rule);
  ensureStudy(app);
  const e = byId.get(app.rule);
  const key = [app.rule, app.ruleQuery, app.pb.cur, app.study?.key].join("|");
  if (!force && el.__key === key) return;
  el.__key = key;
  setHTML($("rb-index"), indexHTML(app));
  setHTML(
    $("rb-page"),
    e.id === "constitution"
      ? constitution(app)
      : e.st
        ? lawPage(app, e)
        : decisionPage(app, e),
  );
  const cur = $("rb-index").querySelector('[aria-current="true"]');
  if (force && cur) cur.scrollIntoView({ block: "nearest" });
}
