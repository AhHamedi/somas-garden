// The statute book: every law a plot could have, as cards (bright when in
// force, faded at their default, greyed when locked). Selecting a card opens
// it in place with every option on the ballot and its parameter ranges.

import {
  esc,
  fmt,
  plural,
  agentName,
  lawValue,
  motionTally,
  passedStatus,
  dayLabel,
} from "/game/model.js";
import { icon, avatar } from "/game/dom.js";
import {
  STATUTES,
  CHARTER,
  DECISIONS,
  STATUTE_GROUPS,
  fill,
  statuteOfMotion,
} from "/game/statutes.js";

export const DEFAULT_MODE = {
  quota: "unlimited",
  enforcement: "soft",
  harvestOrder: "random",
  entry: "open",
  exit: "free",
  threshold: "majority",
  proposers: "all",
  influenceBasis: "voted",
  records: "off",
  recordAccess: "all",
  inheritance: "delete",
  membershipMandate: "residents",
  charterMandate: "residents",
  donations: "off",
  gifts: "off",
  data: "off",
  sharedRecords: "off",
  immigration: "restricted",
  disputes: "off",
  delegation: "off",
};
const NOUN = { office: "officer", representative: "representative", influence: "set" };

function motionsAbout(s, plot, st) {
  return (s.proposals || []).filter((q) => {
    if (statuteOfMotion(q) !== st) return false;
    if (st.scope === "federation")
      return plot.federation >= 0 && q.federation === plot.federation;
    return q.plot === plot.id && q.federation < 0;
  });
}

/** Everything a card needs to know about one law in one plot. */
export function statuteStatus(ix, plot, st) {
  const s = ix.s;
  const fed = plot.federation >= 0 ? ix.federations.get(plot.federation) : null;
  const rules = st.scope === "federation" ? fed?.rules || {} : plot.rules || {};
  let locked = null;
  if (st.scope === "federation") {
    if (!fed) locked = "Needs a federation";
  } else if (!plot.government) locked = "Needs a government";
  else if (st.requires === "federation" && !fed) locked = "Needs a federation";
  else if (
    st.key === "influence" &&
    String(plot.rules?.influenceBasis?.mode || "").startsWith("contribution")
  )
    locked = "Earned by contribution";
  const general = rules[st.key];
  const instances = Object.entries(rules)
    .filter(([k]) => k.startsWith(`${st.key}:`))
    .map(([k, rule]) => ({ key: k, id: Number(k.split(":")[1]), rule }));
  const enacted = !!general || instances.length > 0;
  const motions = motionsAbout(s, plot, st);
  const today = motions.filter(
    (q) => q.created === s.absoluteDay || q.closes === s.absoluteDay,
  );
  const pending = motions.filter((q) => q.status === "scheduled");
  const since = motions
    .filter((q) => q.status === "activated" && q.input?.key === st.key)
    .sort((a, b) => b.activate - a.activate)[0];
  let value;
  if (locked === "Earned by contribution") value = "Earned";
  else if (st.perResident && st.key !== "quota")
    value = instances.length
      ? plural(instances.length, NOUN[st.key], NOUN[st.key] === "set" ? "set" : undefined)
      : null;
  else {
    value = general ? lawValue(ix, st.key, general) : null;
    if (st.key === "quota" && instances.length)
      value = `${value || fill(st.defaultValue, s.settings)} +${instances.length}`;
  }
  let funded = null;
  if (st.service && general && general.mode === st.service.when)
    funded = !!plot[st.service.funded];
  if (
    st.scope === "federation" &&
    fed &&
    general &&
    (general.mode === "on" ||
      general.enabled ||
      (st.key === "immigration" && general.mode !== "restricted"))
  )
    funded = !!fed.funded;
  return {
    locked,
    enacted,
    general,
    instances,
    value: value || fill(st.defaultValue, s.settings),
    motions,
    today,
    pending,
    since,
    funded,
  };
}

function decisionStatus(ix, plot, d) {
  const s = ix.s;
  const fed = plot.federation >= 0;
  const locked = {
    noGovernment: plot.government ? "Governed" : null,
    government: plot.government ? null : "Needs a government",
    noFederation: !plot.government
      ? "Needs a government"
      : fed
        ? "In a federation"
        : null,
    federation: fed ? null : "Needs a federation",
  }[d.requires];
  const motions = (s.proposals || []).filter(
    (q) => q.plot === plot.id && q.input?.kind === d.kind,
  );
  const today = motions.filter(
    (q) => q.created === s.absoluteDay || q.closes === s.absoluteDay,
  );
  return { locked, motions, today };
}

/** Proposal and passing numbers for the plot's assembly right now. */
export function assemblyRules(ix, plot) {
  const residents = ix.residents.get(plot.id) || [];
  const total = residents.reduce((t, a) => t + a.influence, 0);
  const two = plot.rules?.threshold?.mode === "twoThirds";
  const need = two ? Math.ceil((total * 2) / 3) : Math.floor(total / 2) + 1;
  const pr = plot.rules?.proposers?.mode;
  const who =
    pr === "positive"
      ? `Influential (${residents.filter((a) => a.influence > 0).length})`
      : pr === "officers"
        ? `Officers (${Object.keys(plot.officers || {}).length})`
        : `Anyone (${residents.length})`;
  return { residents: residents.length, total, need, two, who };
}

function badges(ix, stt) {
  return [
    stt.today.length
      ? `<span class="lc-badge vote" title="Motions today">${icon("ballot")}${stt.today.length}</span>`
      : "",
    stt.pending.length
      ? `<span class="lc-badge soon" title="Passed; takes effect ${esc(dayLabel(ix.s, stt.pending[0].activate))}">Tomorrow</span>`
      : "",
    stt.funded === false
      ? `<span class="lc-badge warn" title="Running cost not covered by pledges today">Unfunded</span>`
      : "",
  ].join("");
}

function card(ix, st, stt) {
  const cls = stt.locked ? "locked" : stt.enacted ? "force" : "off";
  const foot = stt.locked
    ? esc(stt.locked)
    : stt.enacted
      ? stt.since
        ? `Since ${esc(dayLabel(ix.s, stt.since.activate))}`
        : "In force"
      : "Default";
  return `<button class="lawcard ${cls}" data-law="${st.scope}:${st.key}" aria-expanded="false">
    <span class="lc-top">${icon(st.icon)}<span class="lc-name">${esc(st.name)}</span></span>
    <span class="lc-value">${esc(stt.value)}</span>
    <span class="lc-foot"><span class="lc-state"><i class="dot"></i>${foot}</span>${badges(ix, stt)}</span>
  </button>`;
}

function motionChip(ix, q) {
  const t = motionTally(q);
  const tone = q.status === "open" ? "open" : passedStatus(q) ? "yes" : "no";
  const day = dayLabel(ix.s, q.closes).replace(/^day /, "Day ");
  return `<button class="mchip ${tone}" data-motion="${esc(q.id)}" title="${esc(q.status)}">${icon(tone === "no" ? "close" : "ballot")}<span>${esc(day)}</span>${q.status === "open" ? "<b>today</b>" : `<b>${fmt(t.yes)}–${fmt(t.no)}</b>`}</button>`;
}

function expanded(ix, plot, st, stt) {
  const set = ix.s.settings;
  const current = stt.general?.mode;
  const opts = st.options
    .map((o) => {
      const isCurrent = !!stt.general && current === o.mode;
      const isDefault = !stt.general && DEFAULT_MODE[st.key] === o.mode;
      const detail = isCurrent
        ? lawValue(ix, st.key, stt.general)
        : fill(o.short || "", set);
      return `<div class="lx-opt ${isCurrent ? "current" : isDefault ? "default" : ""}"><b>${esc(o.label)}</b>${detail && detail !== o.label ? `<span>${esc(detail)}</span>` : ""}${isCurrent ? `<i>in force</i>` : isDefault ? `<i>default</i>` : ""}</div>`;
    })
    .join("");
  // When the default is no law at all, it is still something residents can return to.
  const base = st.options.some((o) => o.mode === DEFAULT_MODE[st.key])
    ? ""
    : `<div class="lx-opt base ${stt.enacted ? "" : "default"}"><b>${esc(st.defaultValue)}</b>${stt.enacted ? "" : "<i>default</i>"}</div>`;
  const params = Object.values(st.params || {});
  const holders = stt.instances.length
    ? `<div class="lx-holders">${stt.instances
        .map((i) => {
          const a = ix.agents.get(i.id);
          return `<button class="lx-holder" ${a ? `data-agent="${i.id}"` : ""}>${a ? avatar(a, ix.roles.get(i.id) || []) : ""}<b>${esc(agentName(ix, i.id))}</b><span>${esc(holderValue(st.key, i.rule))}</span></button>`;
        })
        .join("")}</div>`
    : "";
  const service = st.service
    ? `<p class="lx-line ${stt.funded === false ? "warn" : ""}">${icon("mind")}${esc(fill(st.service.cost, set))}${stt.funded === true ? ", funded today" : stt.funded === false ? ", unfunded today" : ""}</p>`
    : "";
  const history = stt.motions.length
    ? `<div class="lx-hist">${[...stt.motions]
        .sort((a, b) => b.closes - a.closes)
        .slice(0, 6)
        .map((q) => motionChip(ix, q))
        .join("")}</div>`
    : "";
  return `<div class="lawx ${stt.locked ? "locked" : ""}" data-open-law>
    <button class="lx-head" data-law="${st.scope}:${st.key}" aria-expanded="true">${icon(st.icon)}<span class="lx-name">${esc(st.name)}</span><span class="lx-val ${stt.enacted ? "" : "muted"}">${esc(stt.locked || stt.value)}</span>${badges(ix, stt)}${icon("minus", "lx-close")}</button>
    <div class="lx-opts">${base}${opts}</div>
    ${params.length ? `<div class="lx-params">${params.map(([n, r]) => `<span><b>${esc(n)}</b>${esc(fill(r, set))}</span>`).join("")}</div>` : ""}
    ${holders}${service}${history}
  </div>`;
}

function holderValue(key, r = {}) {
  if (key === "office") {
    const n = (r.powers || []).filter((x) => !x.startsWith("federation")).length;
    return `${plural(n, "power")}${r.limit ? `, ${fmt(r.limit)} a day` : ""}`;
  }
  if (key === "representative") {
    const p = r.powers || [];
    return (
      [
        p.includes("federationPropose") && "propose",
        p.includes("federationVote") && "vote",
      ]
        .filter(Boolean)
        .join(", ") || "no powers"
    );
  }
  if (key === "influence") return fmt(r.amount);
  if (key === "quota")
    return r.mode === "unlimited" ? "no limit" : `${fmt(r.amount)} a day`;
  return r.mode || "";
}

function decisionRow(ix, plot, d, open) {
  const dst = decisionStatus(ix, plot, d);
  const state = dst.today.length
    ? `<span class="lc-badge vote">${icon("ballot")}${dst.today.length}</span>`
    : dst.locked
      ? `<span class="dc-state">${esc(dst.locked)}</span>`
      : "";
  const body = open
    ? `<div class="dc-more">${d.short ? `<span>${esc(fill(d.short, ix.s.settings))}</span>` : ""}${
        dst.motions.length
          ? `<div class="lx-hist">${[...dst.motions]
              .sort((a, b) => b.closes - a.closes)
              .slice(0, 6)
              .map((q) => motionChip(ix, q))
              .join("")}</div>`
          : ""
      }</div>`
    : "";
  return `<div class="deccard ${dst.locked ? "locked" : ""} ${open ? "open" : ""}"><button class="dc-row" data-decision="${d.kind}" aria-expanded="${open}">${icon(d.icon)}<span class="dc-name">${esc(d.name)}</span>${state}</button>${body}</div>`;
}

/** The Laws view of the Assembly tab. */
export function statuteBook(app, plot) {
  const ix = app.ix,
    s = ix.s;
  const open = app.openLaw;
  const ar = assemblyRules(ix, plot);
  const strip = plot.government
    ? `<div class="decides"><div><span>Proposes</span><b>${esc(ar.who)}</b></div><div><span>Passes at</span><b>${fmt(ar.need)} / ${fmt(ar.total)}</b></div><div><span>Propose + vote</span><b>${fmt(s.settings.proposalCost, 2)} + ${fmt(s.settings.voteCost, 2)} mind</b></div></div>`
    : `<div class="decides"><div><span>No government</span><b>Founding: ${fmt(Math.floor(ar.residents / 2) + 1)} of ${fmt(ar.residents)} votes, ${fmt(s.settings.governmentCost)} mind</b></div></div>`;
  const group = (g, items) => {
    const statuses = items.map((st) => [st, statuteStatus(ix, plot, st)]);
    const n = statuses.filter(([, x]) => x.enacted).length;
    return `<div class="lc-group"><h4>${icon(g.icon)}${esc(g.name)}<span>${n}/${items.length}</span></h4><div class="lc-grid">${statuses
      .map(([st, stt]) =>
        open === `${st.scope}:${st.key}`
          ? expanded(ix, plot, st, stt)
          : card(ix, st, stt),
      )
      .join("")}</div></div>`;
  };
  const local = STATUTE_GROUPS.filter((g) => g.id !== "charter").map((g) =>
    group(
      g,
      STATUTES.filter((st) => st.group === g.id),
    ),
  );
  const charter =
    plot.federation >= 0
      ? group(
          {
            ...STATUTE_GROUPS.at(-1),
            name: `${ix.federations.get(plot.federation)?.name || "Federation"} charter`,
          },
          CHARTER,
        )
      : "";
  const decisions = `<div class="lc-group"><h4>${icon("scroll")}One-off decisions</h4><div class="dc-grid">${DECISIONS.map((d) => decisionRow(ix, plot, d, open === `decision:${d.kind}`)).join("")}</div></div>`;
  return `${strip}${local.join("")}${charter}${decisions}`;
}
