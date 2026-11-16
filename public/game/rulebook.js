// The rulebook: every law, charter rule and one-off decision the Amoeboids
// can vote on, with each option, its parameters, how it is decided, where it
// is in force now and what happened to it in this run.
import { $, icon, setHTML } from "/game/dom.js";
import { esc, fmt, plural, lawValue } from "/game/model.js";
import { STATUTES, CHARTER, DECISIONS, STATUTE_GROUPS, fill } from "/game/statutes.js";
import { statuteStatus, DEFAULT_MODE } from "/game/statute-book.js";
import { statuteKeyOf, charterKeyOf, passed } from "/game/study.js";
import { ensureStudy } from "/game/results.js";

const TEXT = {
  quota:
    "A daily cap on what each resident may harvest. Individual allowances can differ.",
  enforcement: "Whether quotas are advisory or blocked at the field.",
  harvestOrder: "Who reaches the field first when carrots run short.",
  collection: "Carrots moved from the field into the treasury each day.",
  tax: "A levy on carrots residents hold above an exempt amount.",
  holding: "A cap on the carrots one resident may hold.",
  distribution: "Standing hand-outs from the treasury.",
  inheritance: "Where a resident's carrots go when they die.",
  entry: "Who may move into the plot.",
  exit: "Who may leave, and how quickly.",
  threshold: "How much influence a motion needs to pass.",
  proposers: "Who may table motions.",
  influence: "One resident's voting weight.",
  influenceBasis:
    "Voted influence, or influence earned each morning from net giving: carrots deposited, taxed or seized and mind spent on services, less treasury hand-outs.",
  office: "Officers with delegated powers, limits and terms.",
  sanctions: "Penalties for recorded breaches, and where fines go.",
  records:
    "A paid record of harvests, meals and decisions. Sanctions need it as evidence.",
  recordAccess: "Who may read the records.",
  representative: "Residents who carry the plot's vote in the federation council.",
  membershipMandate: "Who decides to join or leave a federation.",
  charterMandate: "Who approves charter changes before representatives vote.",
  "federation:donations": "Transfers between member fields and treasuries.",
  "federation:gifts": "Food offers between residents of different member plots.",
  "federation:data": "Members see each other's field and treasury stocks.",
  "federation:sharedRecords": "Records shared across member plots.",
  "federation:recordAccess": "Who may read the shared records.",
  "federation:immigration": "Movement between member plots.",
  "federation:disputes": "Bounded remedies between member plots.",
  "federation:delegation": "Donor officers may send donations without a ballot.",
};

const RELATED = {
  quota: ["enforcement", "harvestOrder", "sanctions"],
  enforcement: ["quota", "records"],
  harvestOrder: ["quota", "influence"],
  collection: ["distribution", "tax"],
  tax: ["holding", "distribution", "collection"],
  holding: ["tax", "distribution"],
  distribution: ["collection", "tax", "office"],
  inheritance: ["distribution"],
  entry: ["exit", "office", "federation:immigration"],
  exit: ["entry", "office"],
  threshold: ["influence", "proposers"],
  proposers: ["threshold", "office"],
  influence: ["influenceBasis", "threshold", "harvestOrder"],
  influenceBasis: ["influence", "proposers", "harvestOrder"],
  office: ["proposers", "recordAccess", "sanctions"],
  sanctions: ["records", "recordAccess", "decision:sanction"],
  records: ["recordAccess", "sanctions", "federation:sharedRecords"],
  recordAccess: ["records", "office"],
  representative: ["charterMandate", "membershipMandate"],
  membershipMandate: ["representative", "decision:federationJoin"],
  charterMandate: ["representative", "decision:ratify"],
};

// What it takes to pass each one-off decision, beyond the local rules.
const DECISION_FACTS = {
  found: [
    ["Votes", "One per resident; more than half of all residents"],
    ["Cost", "{governmentCost} mind pledged by supporters, charged only if it passes"],
    ["Then", "A government from the next dawn, with every law at its default"],
  ],
  dissolve: [
    ["Then", "The treasury returns to the field; offices and pending changes end"],
  ],
  repeal: [["Then", "The law returns to its default"]],
  removeOffice: [["Then", "The officer's powers end the next dawn"]],
  sanction: [
    ["Needs", "Sanctions enabled, and a recorded breach as evidence"],
    ["Types", "Warning, fine, harvest last or expulsion, as the Sanctions law allows"],
  ],
  distribution: [["Then", "One payment from the treasury"]],
  permitEntry: [["Needs", "Entry by vote"]],
  permitExit: [["Needs", "Exit by vote"]],
  federationFound: [
    ["Needs", "Two or more governed plots approve the same membership"],
    ["Votes", "Each plot under its own rules, unless Membership delegates it"],
    ["Cost", "{federationCost} mind within {foundingWindow} days"],
    ["Then", "A federation with every charter rule off"],
  ],
  federationJoin: [
    ["Votes", "Local approval, then every member plot"],
    ["Cost", "{joiningCost} mind"],
  ],
  federationLeave: [
    ["Votes", "Under the plot's rules, unless Membership delegates it"],
    ["Then", "Membership ends after a one-day notice; a federation of one dissolves"],
  ],
  donation: [["Needs", "Donations on in the charter"]],
  ratify: [
    ["Then", "Representatives may vote yes on that charter change from the next day"],
  ],
  federationAdmit: [["Votes", "Every member plot"]],
  dispute: [
    ["Needs", "Disputes on in the charter"],
    ["Votes", "One per member plot, over five days"],
  ],
  federationDissolve: [["Votes", "Every member plot"]],
};

const DECISION_TEXT = {
  found: "Turns an ungoverned plot into a self-governing assembly.",
  dissolve: "Ends the plot's government.",
  repeal: "Returns one law to its default.",
  removeOffice: "Takes an officer's powers away.",
  sanction: "Penalises a resident for a recorded breach.",
  distribution: "A single hand-out from the treasury.",
  permitEntry: "Lets one newcomer in while entry is by vote.",
  permitExit: "Lets one resident leave while exit is by vote.",
  federationFound: "Joins two or more governed plots in a federation.",
  federationJoin: "Brings the plot into an existing federation.",
  federationLeave: "Takes the plot out of its federation.",
  donation: "Sends carrots to another member plot.",
  ratify: "Residents consent to a charter change before their representatives vote.",
  federationAdmit: "The council accepts a plot that asked to join.",
  dispute: "Asks the council for a remedy against another member plot.",
  federationDissolve: "Ends the federation.",
};
const PHASES = [
  "Dawn",
  "Migration",
  "Harvest",
  "Motions",
  "Vote",
  "Exchange",
  "Supper",
  "Night",
];

// --- entries ---------------------------------------------------------------

function entries() {
  const out = [
    { id: "constitution", name: "How votes work", icon: "ballot", group: "Basics" },
  ];
  for (const g of STATUTE_GROUPS.filter((g) => g.id !== "charter"))
    for (const st of STATUTES.filter((x) => x.group === g.id))
      out.push({
        id: `local:${st.key}`,
        name: st.name,
        icon: st.icon,
        group: g.name,
        st,
      });
  for (const st of CHARTER)
    out.push({
      id: `federation:${st.key}`,
      name: st.name,
      icon: st.icon,
      group: "Federation charter",
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
const textOf = (e) =>
  e.st
    ? TEXT[e.st.scope === "federation" ? `federation:${e.st.key}` : e.st.key] || ""
    : "";

function resolve(id) {
  if (!id) return "constitution";
  if (byId.has(id)) return id;
  if (byId.has(`local:${id}`)) return `local:${id}`;
  if (byId.has(`federation:${id}`)) return `federation:${id}`;
  if (byId.has(`decision:${id}`)) return `decision:${id}`;
  return "constitution";
}

function matches(e, q) {
  if (!q) return true;
  const hay = [
    e.name,
    e.group,
    textOf(e),
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

/** How many plots (or federations) have this in force now. */
function inForce(ix, e) {
  const s = ix.s;
  if (e.st?.scope === "local")
    return s.plots.filter((p) => p.government && statuteStatus(ix, p, e.st).enacted)
      .length;
  if (e.st?.scope === "federation")
    return (s.federations || []).filter((f) => !f.dissolved && f.rules?.[e.st.key])
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
    html += `<button class="rb-item" data-rb="${e.id}" aria-current="${app.rule === e.id}">${icon(e.icon)}<span>${esc(e.name)}</span>${n ? `<b title="${plural(n, e.st.scope === "federation" ? "federation" : "plot")} with it in force">${n}</b>` : ""}</button>`;
  }
  return html;
}

function facts(rows, set) {
  return `<dl class="rb-facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(fill(v, set))}</dd></div>`).join("")}</dl>`;
}

function constitution(app) {
  const set = app.ix.s.settings;
  const strip = `<div class="rb-day" aria-label="When a motion is decided">${PHASES.map((p, i) => `<span class="${i === 3 ? "tabled" : i === 4 ? "voted" : ""}">${p}</span>`).join("")}<span class="next">Dawn</span></div>
    <div class="rb-daykey"><span><i class="tabled"></i>tabled</span><span><i class="voted"></i>decided</span><span><i class="next"></i>in force</span></div>`;
  const bar = `<div class="rb-threshold" aria-label="Passing lines"><span class="fill"></span><i style="left:50%"><b>Majority</b><small>more than half</small></i><i style="left:66.67%"><b>Two thirds</b><small>at least</small></i></div>`;
  return `<header class="rb-head"><span class="rb-icon">${icon("ballot")}</span><div><h2>How votes work</h2><p>Every assembly starts with this procedure.</p></div></header>
    <section class="rb-sec"><h3>A day of decision</h3>${strip}</section>
    <section class="rb-sec"><h3>Passing</h3>${bar}${facts(
      [
        [
          "Founding",
          "One vote per resident; more than half of all residents, plus {governmentCost} mind pledged",
        ],
        [
          "Laws",
          "More than half of all residents' influence; the Threshold law can raise it to two thirds",
        ],
        [
          "Not voting",
          "Counts against: the line is a share of everyone's influence, not of votes cast",
        ],
        [
          "Influence",
          "{startingInfluence} each, up to {maxInfluence}, set by the Influence law",
        ],
        [
          "Rival options",
          "The option with most support wins; a tie keeps the law as it is",
        ],
      ],
      set,
    )}</section>
    <section class="rb-sec"><h3>Costs</h3>${facts(
      [
        ["Tabling", "{proposalCost} mind"],
        ["Voting yes or no", "{voteCost} mind for each ballot"],
        ["Abstaining", "Free"],
        ["Officer orders", "{officerCost} mind"],
      ],
      set,
    )}</section>
    <section class="rb-sec"><h3>Federations</h3>${facts(
      [
        ["Council", "Representatives vote; each member plot casts one vote"],
        ["Charter changes", "Every member plot"],
        ["One-off actions", "Most member plots"],
        [
          "Local consent",
          "Residents ratify a charter change first, unless Charter approval delegates it",
        ],
      ],
      set,
    )}</section>
    <section class="rb-sec"><h3>The meteor</h3>${facts([["Month end", "Governments, federations, laws and offices all end. Only memories remain."]], set)}</section>`;
}

function lawPage(app, e) {
  const ix = app.ix,
    s = ix.s,
    set = s.settings;
  const st = e.st;
  const fed = st.scope === "federation";
  const def = DEFAULT_MODE[st.key];
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
  const decided = fed
    ? [
        ["Tabled by", "A representative with proposal power"],
        ["Passes with", "Every member plot"],
        ["Local consent", "Residents ratify first, unless Charter approval delegates it"],
        ["In force", "From the next dawn"],
      ]
    : [
        [
          "Needs",
          st.requires === "federation" ? "A government in a federation" : "A government",
        ],
        ["Tabled by", "Any resident, unless Proposers narrows it; {proposalCost} mind"],
        ["Passes with", "More than half of all influence, or two thirds under Threshold"],
        ["In force", "From the next dawn"],
      ];
  if (st.service)
    decided.push([
      "Running cost",
      `${st.service.cost}, paid from pledged mind while ${st.service.when === "on" ? "on" : st.options.find((o) => o.mode === st.service.when)?.label.toLowerCase() || st.service.when}`,
    ]);
  if (st.perResident)
    decided.push([
      "Per resident",
      "Each motion concerns one resident; several can be in force",
    ]);

  // Where it stands now.
  let now;
  if (fed) {
    const feds = (s.federations || []).filter((f) => !f.dissolved);
    now = feds.length
      ? feds
          .map((f) => {
            const r = f.rules?.[st.key];
            return `<button class="rb-plot ${r ? "on" : ""}" data-rb-plot="${f.plots[0]}" data-rb-law="federation:${st.key}"><b>${esc(f.name || `Federation ${f.id}`)}</b><span>${esc(r ? lawValue(ix, st.key, r) : fill(st.defaultValue, set))}</span></button>`;
          })
          .join("")
      : `<p class="note">No federation exists right now.</p>`;
  } else {
    now = s.plots
      .map((p) => {
        const stt = statuteStatus(ix, p, st);
        return `<button class="rb-plot ${stt.locked ? "locked" : stt.enacted ? "on" : ""}" data-rb-plot="${p.id}" data-rb-law="local:${st.key}"><b>${esc(p.name.replace(/^Plot\s*/, ""))}</b><span>${esc(stt.locked ? (p.government ? stt.locked : "No government") : stt.value)}</span></button>`;
      })
      .join("");
  }

  // This run, from the study record when loaded.
  const data = app.study?.data;
  let history = "";
  if (data) {
    const mine = data.motions.filter(
      (m) => (fed ? charterKeyOf(m) : statuteKeyOf(m)) === st.key,
    );
    const ok = mine.filter(passed).length;
    const days = data.days;
    const governed = days.reduce(
      (t, d) => t + d.plots.filter((p) => p.government).length,
      0,
    );
    const held = fed
      ? null
      : days.reduce(
          (t, d) => t + d.plots.filter((p) => p.laws.includes(st.key)).length,
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
  const rel = (RELATED[st.key] || [])
    .filter(() => !fed)
    .map((k) => byId.get(resolve(k)))
    .filter(Boolean);
  const related = rel.length
    ? `<section class="rb-sec"><h3>Related</h3><div class="rb-rel">${rel.map((r) => `<button data-rb="${r.id}">${icon(r.icon)}${esc(r.name)}</button>`).join("")}</div></section>`
    : "";
  const chips = [
    fed ? "Federation charter" : "Local law",
    fed ? "" : STATUTE_GROUPS.find((g) => g.id === st.group)?.name,
    st.perResident ? "Per resident" : "",
  ].filter(Boolean);
  return `<header class="rb-head"><span class="rb-icon">${icon(st.icon)}</span><div><h2>${esc(e.name)}</h2><div class="rb-chips">${chips.map((c) => `<span>${esc(c)}</span>`).join("")}</div><p>${esc(textOf(e))}</p></div></header>
    <section class="rb-sec"><h3>On the ballot</h3><ol class="rb-opts">${opts}</ol></section>
    ${paramTable}
    <section class="rb-sec"><h3>Decided</h3>${facts(decided, set)}</section>
    <section class="rb-sec"><h3>${fed ? "In each federation now" : "In each plot now"}</h3><div class="rb-plots">${now}</div></section>
    ${history}${related}`;
}

function decisionPage(app, e) {
  const ix = app.ix,
    s = ix.s,
    set = s.settings;
  const d = e.d;
  const who = {
    noGovernment: "A plot without a government",
    government: "A governed plot",
    noFederation: "A governed plot outside any federation",
    federation: "A governed plot in a federation",
  }[d.requires];
  const own = DECISION_FACTS[d.kind] || [];
  const get = (k) => own.filter(([x]) => x === k);
  const merged = [
    ["Who", who],
    ...get("Needs"),
    ...(get("Votes").length
      ? get("Votes")
      : [["Votes", "More than half of all influence, or two thirds under Threshold"]]),
    ...(get("Cost").length
      ? get("Cost")
      : [["Cost", "{proposalCost} mind to table, {voteCost} to vote"]]),
    ...get("Types"),
    ...get("Then"),
  ];
  const data = app.study?.data;
  let history = "";
  if (data) {
    const mine = data.motions.filter((m) => m.kind === d.kind);
    history = `<section class="rb-sec"><h3>This run</h3><div class="rb-stats"><div><b>${fmt(mine.length)}</b><span>motions</span></div><div><b>${fmt(mine.filter(passed).length)}</b><span>passed</span></div></div></section>`;
  }
  return `<header class="rb-head"><span class="rb-icon">${icon(d.icon)}</span><div><h2>${esc(e.name)}</h2><div class="rb-chips"><span>One-off decision</span></div><p>${esc(DECISION_TEXT[d.kind] || "")}</p></div></header>
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
