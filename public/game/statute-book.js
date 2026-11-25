// The statute book: every law a plot could have, as cards (bright when in
// force, faded at their default, greyed when locked). Selecting a card opens
// it in place with every option on the ballot and its parameter ranges.

import {
  esc,
  fmt,
  foundingRequirement,
  lawValue,
  motionTally,
  passedStatus,
  dayLabel,
} from "/game/model.js";
import { icon } from "/game/dom.js";
import {
  STATUTES,
  DECISIONS,
  STATUTE_GROUPS,
  fill,
  defaultTallyBasis,
  statuteOfMotion,
  statuteForVersion,
} from "/game/statutes.js";

export const DEFAULT_MODE = {
  harvestOrder: "ranked",
  quota: "unlimited",
  tokenAllocation: "equal",
};
function defaultRule(ix, key) {
  const set = ix.s.settings;
  if (key === "threshold")
    return { mode: defaultTallyBasis(ix.s), amount: set.ruleFraction || 0.5 };
  if (key === "tokenAllocation") return { mode: "equal", amount: set.votingTokens };
  return { mode: DEFAULT_MODE[key] };
}
function motionsAbout(s, plot, st) {
  return (s.proposals || []).filter(
    (q) => q.plot === plot.id && statuteOfMotion(q)?.key === st.key,
  );
}
export function statuteStatus(ix, plot, st) {
  const s = ix.s;
  const locked = plot.government ? null : "Needs a government";
  const general = plot.rules?.[st.key];
  const enacted = !!general;
  const motions = motionsAbout(s, plot, st);
  const today = motions.filter(
    (q) => q.created === s.absoluteDay || q.closes === s.absoluteDay,
  );
  const pending = motions.filter((q) => q.status === "scheduled");
  const since = motions
    .filter((q) => q.status === "activated" && q.input?.key === st.key)
    .sort((a, b) => b.activate - a.activate)[0];
  return {
    locked,
    enacted,
    general,
    defaultMode: defaultRule(ix, st.key).mode,
    value: lawValue(ix, st.key, general ?? defaultRule(ix, st.key)),
    motions,
    today,
    pending,
    since,
  };
}

function decisionStatus(ix, plot, d) {
  const s = ix.s;
  const locked =
    d.requires === "noGovernment"
      ? plot.government
        ? "Governed"
        : null
      : plot.government
        ? null
        : "Needs a government";
  const motions = (s.proposals || []).filter(
    (q) => q.plot === plot.id && q.input?.kind === d.kind,
  );
  const today = motions.filter(
    (q) => q.created === s.absoluteDay || q.closes === s.absoluteDay,
  );
  return { locked, motions, today };
}

function badges(ix, stt) {
  return [
    stt.today.length
      ? `<span class="lc-badge vote" title="Motions today">${icon("ballot")}${stt.today.length}</span>`
      : "",
    stt.pending.length
      ? `<span class="lc-badge soon" title="Passed; takes effect ${esc(dayLabel(ix.s, stt.pending[0].activate))}">Tomorrow</span>`
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
  const t = motionTally(q, ix.s);
  const tone = q.status === "open" ? "open" : passedStatus(q) ? "yes" : "no";
  const day = dayLabel(ix.s, q.closes).replace(/^day /, "Day ");
  return `<button class="mchip ${tone}" data-motion="${esc(q.id)}" title="${esc(q.status)}">${icon(tone === "no" ? "close" : "ballot")}<span>${esc(day)}</span>${q.status === "open" ? "<b>today</b>" : `<b>${fmt(t.yes)}–${fmt(t.no)}</b>`}</button>`;
}

function expanded(ix, plot, currentStatute, stt) {
  const st = statuteForVersion(currentStatute, ix.s);
  const set = ix.s.settings;
  const current = stt.general?.mode;
  const opts = st.options
    .map((o) => {
      const isCurrent = !!stt.general && current === o.mode;
      const isDefault = !stt.general && stt.defaultMode === o.mode;
      const detail = isCurrent
        ? lawValue(ix, st.key, stt.general)
        : fill(o.short || "", set);
      return `<div class="lx-opt ${isCurrent ? "current" : isDefault ? "default" : ""}"><b>${esc(o.label)}</b>${detail && detail !== o.label ? `<span>${esc(detail)}</span>` : ""}${isCurrent ? `<i>in force</i>` : isDefault ? `<i>default</i>` : ""}</div>`;
    })
    .join("");
  // When the default is no law at all, it is still something residents can return to.
  const base = st.options.some((o) => o.mode === stt.defaultMode)
    ? ""
    : `<div class="lx-opt base ${stt.enacted ? "" : "default"}"><b>${esc(st.defaultValue)}</b>${stt.enacted ? "" : "<i>default</i>"}</div>`;
  const params = Object.values(st.params || {});
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
    ${history}
  </div>`;
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
  const residents = (ix.residents.get(plot.id) || []).length;
  const threshold = plot.rules?.threshold || defaultRule(ix, "threshold");
  const strip = plot.government
    ? `<div class="decides"><div><span>Rule threshold</span><b>${esc(lawValue(ix, "threshold", threshold))}</b></div><div><span>Table a motion</span><b>${fmt(s.settings.proposalCost, 2)} mind</b></div></div>`
    : `<div class="decides"><div><span>No government</span><b>${esc(foundingRequirement(s, residents))}</b></div></div>`;
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
  const local = STATUTE_GROUPS.map((g) =>
    group(
      g,
      STATUTES.filter((st) => st.group === g.id),
    ),
  );
  const decisions = `<div class="lc-group"><h4>${icon("scroll")}One-off decisions</h4><div class="dc-grid">${DECISIONS.map((d) => decisionRow(ix, plot, d, open === `decision:${d.kind}`)).join("")}</div></div>`;
  return `${strip}${local.join("")}${decisions}`;
}
