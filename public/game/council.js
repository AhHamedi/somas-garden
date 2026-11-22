// The council chamber: every motion before an assembly, seated as a
// hemicycle. Seats are voters, filled by their choice and ringed in their
// team's colour; during a live vote they fill in as the map's assembly votes.

import {
  esc,
  fmt,
  plural,
  teamColor,
  plotLetter,
  plotName,
  agentName,
  motionTitle,
  motionChange,
  motionTally,
  statusOf,
  passedStatus,
  dayLabel,
  hemicycleSeats,
} from "/game/model.js";
import { $, icon, setHTML, chip } from "/game/dom.js";
import { statuteOfMotion } from "/game/statutes.js";

const ORDER = { yes: 0, abstain: 1, none: 2, no: 3 };

function voters(q, ix) {
  const list = Object.entries(q.electorate || {}).map(([id, weight]) => {
    const a = ix.agents.get(Number(id));
    const vote = q.status === "open" ? "none" : q.votes?.[id] || "abstain";
    return {
      id: Number(id),
      weight:
        q.tallyBasis === "tokens"
          ? q.tokenSpends?.[id] || 0
          : q.tallyBasis === "voters"
            ? 1
            : weight,
      spent: q.tokenSpends?.[id] || 0,
      team: a?.team ?? 0,
      name: a?.name || `Resident ${Number(id) + 1}`,
      vote,
    };
  });
  list.sort((a, b) => ORDER[a.vote] - ORDER[b.vote] || a.team - b.team || a.id - b.id);
  return list;
}

export class Council {
  constructor(app) {
    this.app = app;
    this.el = $("view-council");
    this.selected = null;
    this.scope = "today";
    this.plot = "all";
    this.revealed = -1;
  }
  motions() {
    const s = this.app.ix.s;
    let list = s.proposals || [];
    // With nothing on today's agenda, show the month unless the observer chose otherwise.
    if (!this.scopeChosen)
      this.scope =
        list.some((q) => q.created === s.absoluteDay || q.closes === s.absoluteDay) ||
        !list.length
          ? "today"
          : "month";
    if (this.scope === "today")
      list = list.filter(
        (q) => q.created === s.absoluteDay || q.closes === s.absoluteDay,
      );
    if (this.plot !== "all") list = list.filter((q) => q.plot === Number(this.plot));
    return list;
  }
  select(id) {
    this.selected = id;
    const s = this.app.ix.s;
    const q = (s.proposals || []).find((x) => x.id === id);
    if (q && !(q.created === s.absoluteDay || q.closes === s.absoluteDay)) {
      this.scope = "month";
      this.scopeChosen = true;
    }
    this.render();
  }
  render() {
    if (this.el.hidden) return;
    const ix = this.app.ix,
      s = ix.s;
    const list = this.motions();
    if (!list.find((q) => q.id === this.selected))
      this.selected =
        (list.find((q) => q.closes === s.absoluteDay) || list[0])?.id ?? null;
    const q = list.find((x) => x.id === this.selected);
    const groups = [];
    const open = list.filter((x) => x.status === "open");
    const today = list.filter((x) => x.status !== "open" && x.closes === s.absoluteDay);
    const earlier = list
      .filter((x) => x.status !== "open" && x.closes !== s.absoluteDay)
      .sort((a, b) => b.closes - a.closes);
    if (open.length) groups.push(["On the floor", open]);
    if (today.length) groups.push(["Decided today", today]);
    if (earlier.length) groups.push(["Earlier this month", earlier]);
    const item = (x) => {
      const st = statusOf(x);
      const t = motionTally(x);
      const sub =
        x.status === "open"
          ? "Vote at today's assembly"
          : `${st.label}${t.total ? `, ${fmt(t.yes)}–${fmt(t.no)}` : ""}`;
      return `<button class="q-item ${st.tone} ${x.id === this.selected ? "selected" : ""}" data-q="${esc(x.id)}"><span class="q-plot">${esc(plotLetter(ix.plots.get(x.plot) || { id: x.plot }))}</span><span><span class="q-title">${esc(motionTitle(ix, x))}</span><span class="q-sub" style="display:block">${esc(sub)}${x.closes !== s.absoluteDay ? `, ${dayLabel(s, x.closes)}` : ""}</span></span></button>`;
    };
    const plots = s.plots.filter((p) => (s.proposals || []).some((x) => x.plot === p.id));
    const queue = `<div class="queue" role="listbox" aria-label="Motions">
      <div class="queue-filter"><span class="seg" role="group" aria-label="When"><button data-scope="today" aria-pressed="${this.scope === "today"}">Today</button><button data-scope="month" aria-pressed="${this.scope === "month"}">This month</button></span></div>
      <div class="queue-filter"><span class="seg" role="group" aria-label="Plot"><button data-plotf="all" aria-pressed="${this.plot === "all"}">All</button>${plots.map((p) => `<button data-plotf="${p.id}" aria-pressed="${this.plot === String(p.id)}">${esc(plotLetter(p))}</button>`).join("")}</span></div>
      ${groups.length ? groups.map(([name, xs]) => `<h4>${name}</h4>${xs.map(item).join("")}`).join("") : `<p class="note" style="padding:8px">None</p>`}
    </div>`;
    const html = `<div class="page-head"><div><h1>Council</h1></div></div>
      <div class="council">${queue}<div class="chamber" id="chamber">${q ? this.chamber(q) : this.emptyChamber()}</div></div>`;
    if (setHTML(this.el, html)) this.wire();
    this.revealed = -1;
    this.tick(this.app.progress ?? 1);
  }
  emptyChamber() {
    return `<div class="chamber-stage" style="padding:40px;text-align:center;grid-column:1/-1"><div class="empty" style="background:none">${icon("council")}<h4>No motions</h4></div></div>`;
  }
  chamber(q) {
    const ix = this.app.ix,
      s = ix.s;
    const st = statusOf(q);
    const t = motionTally(q);
    const vs = voters(q, ix);
    const W = 600,
      H = 300;

    // Before the vote the electorate is not fixed; residents are shown as empty seats.
    const ghosts =
      !vs.length && q.status === "open" ? (ix.residents.get(q.plot) || []).length : 0;
    const seats = hemicycleSeats(vs.length || ghosts, W, H);
    const empty = seats
      .slice(0, ghosts)
      .map(
        (p) =>
          `<circle class="ghost-seat" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r.toFixed(1)}"/>`,
      )
      .join("");
    const circles = vs
      .map((v, i) => {
        const p = seats[i];
        return `<circle class="seat" data-i="${i}" data-vote="${v.vote}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r.toFixed(1)}" stroke="${teamColor(v.team)}" stroke-width="${Math.max(1.5, p.r * 0.32).toFixed(1)}"><title>${esc(v.name)}: ${v.vote === "none" ? "not yet voted" : v.vote}${v.spent ? `, ${plural(v.spent, "token")} spent` : ""}</title></circle>`;
      })
      .join("");
    const centre =
      q.status === "open"
        ? `<text class="hemi-center" x="${W / 2}" y="${H - 34}" text-anchor="middle">Awaiting vote</text><text class="hemi-sub" x="${W / 2}" y="${H - 10}" text-anchor="middle">${vs.length ? `${plural(vs.length, "voter")} seated` : ghosts ? `${plural(ghosts, "resident")}` : ""}</text>`
        : `<text class="hemi-center" x="${W / 2}" y="${H - 34}" text-anchor="middle" id="hemi-score">${fmt(t.yes)} – ${fmt(t.no)}</text><text class="hemi-sub" x="${W / 2}" y="${H - 10}" text-anchor="middle">yes – no, ${t.unit}</text>`;
    const yesPct = t.total ? (t.yes / t.total) * 100 : 0;
    const noPct = t.total ? (t.no / t.total) * 100 : 0;
    const mark = t.total ? (t.need / t.total) * 100 : 50;
    const change = motionChange(ix, q);
    const passed = passedStatus(q);
    // Weighted support by team.
    const sides = { yes: new Map(), no: new Map(), abstain: new Map() };
    for (const v of vs) {
      const k = v.vote === "yes" ? "yes" : v.vote === "no" ? "no" : "abstain";
      sides[k].set(v.team, (sides[k].get(v.team) || 0) + (v.weight || 0));
    }
    const sideBox = (k, title) => {
      const entries = [...sides[k].entries()].sort((a, b) => b[1] - a[1]);
      const total = entries.reduce((x, [, n]) => x + n, 0);
      return `<div class="side-box ${k}"><h4>${title}<b>${fmt(total)}</b></h4>${entries.length ? entries.map(([team, n]) => `<div class="side-team"><i style="background:${teamColor(team)}"></i><span>${esc(s.teams[team]?.name || `Team ${team + 1}`)}</span><b>${fmt(n)}</b></div>`).join("") : `<p class="note">Nobody</p>`}</div>`;
    };
    const verdictTone =
      q.status === "open" ? "open" : passed ? "yes" : st.tone === "no" ? "no" : "neutral";
    const law = statuteOfMotion(q);
    const when =
      q.status === "scheduled"
        ? `Takes effect ${dayLabel(s, q.activate)}`
        : q.status === "activated"
          ? `In force since ${dayLabel(s, q.activate)}`
          : q.reason
            ? q.reason
            : "";
    return `<div class="chamber-stage">
        <div class="chamber-title"><div><h2>${esc(motionTitle(ix, q))}</h2><p>${esc(`${plotName(ix, q.plot)} assembly`)}</p></div><span class="verdict ${verdictTone}">${icon(q.status === "open" ? "scroll" : passed ? "ballot" : "close")}${esc(st.label)}</span></div>
        <svg class="hemicycle" viewBox="-22 -22 ${W + 44} ${H + 44}" role="img" aria-label="${esc(`${vs.length} eligible residents. ${t.yes} yes and ${t.no} no, counted in ${t.unit}.`)}">${empty}${circles}${centre}</svg>
        <div class="vote-bar">
          <div class="vote-nums"><span class="side yes"><b>${fmt(t.yes)}</b><small>yes</small></span><span class="need">${t.total ? `${esc(t.rule)}: <b>${fmt(t.need)}</b> of ${fmt(t.total)} ${t.unit} needed` : esc(t.rule)}</span><span class="side no"><b>${fmt(t.no)}</b><small>no</small></span></div>
          <span class="tally"><i class="y" style="width:${yesPct}%"></i><i class="n" style="width:${noPct}%"></i><span class="mark" style="left:${mark}%" title="Passing line"></span></span>
        </div>
      </div>
      <div class="chamber-detail">
        <div class="change">${change.before ? `<div><span class="lbl">${passed && q.status !== "open" ? "Before" : "Now"}</span><p>${esc(change.before)}</p></div>` : ""}<div class="after"><span class="lbl">${q.status === "open" ? "If passed" : passed ? "After" : "Would have been"}</span><p>${esc(change.after)}</p></div></div>
        ${q.status !== "open" ? `<div class="sides">${sideBox("yes", "For")}${sideBox("no", "Against")}${sideBox("abstain", "Abstained")}</div>` : ""}
        <div class="facts"><span>Tabled by <b>${esc(agentName(ix, q.author))}</b> ${esc(dayLabel(s, q.created))}</span>${vs.length ? `<span><b>${plural(vs.length, "voter")}</b> in the electorate</span>` : ""}${when ? `<span>${esc(when)}</span>` : ""}</div>
        <div class="chamber-actions">${law ? `<button class="btn" data-law-sheet="${law.scope}:${law.key}" data-law-plot="${q.plot}">${icon("scroll")}${esc(law.name)} options</button>` : ""}<button class="btn" data-goto-plot="${q.plot}">${icon("world")}Show ${esc(plotName(ix, q.plot))} on the map</button></div>
      </div>`;
  }
  wire() {
    this.el
      .querySelectorAll("[data-q]")
      .forEach((b) => (b.onclick = () => this.select(b.dataset.q)));
    this.el
      .querySelectorAll("[data-scope]")
      .forEach(
        (b) =>
          (b.onclick = () => (
            (this.scope = b.dataset.scope),
            (this.scopeChosen = true),
            this.render()
          )),
      );
    this.el
      .querySelectorAll("[data-plotf]")
      .forEach((b) => (b.onclick = () => ((this.plot = b.dataset.plotf), this.render())));
    this.el.querySelector("[data-law-sheet]")?.addEventListener("click", (e) => {
      const [scope, key] = e.currentTarget.dataset.lawSheet.split(":");
      this.app.actions.openLaw(scope, key, Number(e.currentTarget.dataset.lawPlot));
    });
    this.el
      .querySelector("[data-goto-plot]")
      ?.addEventListener("click", (e) =>
        this.app.actions.showPlotOnMap(Number(e.currentTarget.dataset.gotoPlot)),
      );
  }
  /** Fills seats in sync with the map while today's vote is being counted. */
  tick(progress) {
    if (this.el.hidden) return;
    const s = this.app.ix.s;
    const q = (s.proposals || []).find((x) => x.id === this.selected);
    const seats = this.el.querySelectorAll(".seat");
    if (!q || !seats.length) return;
    const live = s.phase === "voting" && q.closes === s.absoluteDay && progress < 1;
    const n = seats.length;
    const count = live
      ? Math.floor(Math.max(0, Math.min(1, (progress - 0.25) / 0.5)) * n)
      : n;
    if (count === this.revealed) return;
    this.revealed = count;
    seats.forEach((c, i) => {
      // Votes arrive in a scattered order rather than sweeping across rows.
      const rank = (i * 7919 + 13) % n;
      const v = rank < count ? c.dataset.vote : "none";
      c.setAttribute(
        "fill",
        v === "yes"
          ? "var(--yes)"
          : v === "no"
            ? "var(--no)"
            : v === "abstain"
              ? "#4d625f"
              : "rgba(255,255,255,0.06)",
      );
    });
    const score = this.el.querySelector("#hemi-score");
    if (score) score.style.opacity = count === n ? 1 : 0.35;
  }
}
