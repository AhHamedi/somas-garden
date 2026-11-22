// Chronicle (the month told day by day), Results (how the teams are doing)
// and the month-end card shown when the meteor falls.

import {
  esc,
  fmt,
  plural,
  teamColor,
  plotLetter,
  plotName,
  motionTitle,
  passedStatus,
  lcFirst,
} from "/game/model.js";
import { $, icon, setHTML } from "/game/dom.js";

/** The last recorded frame of each day this month, never beyond the cursor. */
function closeFrames(pb, month) {
  const byDay = new Map();
  pb.frames.forEach((f, i) => {
    if (f && f.month === month && i <= pb.cur) byDay.set(f.day, f);
  });
  return byDay;
}

export function renderChronicle(app) {
  const el = $("view-chronicle");
  if (el.hidden) return;
  const ix = app.ix,
    s = ix.s,
    pb = app.pb;
  const last = closeFrames(pb, s.month);
  const days = [...last.keys()].sort((a, b) => b - a);
  const proposals = s.proposals || [];
  const cards = days
    .map((d) => {
      const abs = (s.month - 1) * s.settings.days + d;
      const f = last.get(d);
      const before = last.get(d - 1) || pb.frames.find((x) => x && x.month === s.month);
      const deaths =
        f?.stats && before?.stats && d > 1
          ? (f.stats.exclusions ?? f.stats.deaths ?? 0) -
            (before.stats.exclusions ?? before.stats.deaths ?? 0)
          : (f?.stats?.exclusions ?? f?.stats?.deaths ?? 0);
      const decided = proposals.filter((q) => q.closes === abs && q.status !== "open");
      const passed = decided.filter(passedStatus);
      const failed = decided.filter((q) => !passedStatus(q));
      const founded = passed.filter((q) => q.input?.kind === "found");
      const notes = app.notables.get(`${s.month}:${d}`) || [];
      const items = [];
      for (const q of founded)
        items.push([
          "hall",
          "civic",
          `${plotName(ix, q.plot)} voted to found a government`,
        ]);
      // The same decision taken by several plots reads as one line.
      const same = new Map();
      for (const q of passed.filter((x) => x.input?.kind !== "found")) {
        const i = q.input || {};
        const key = JSON.stringify([i.kind, i.key, i.rule, i.target]);
        const g = same.get(key) || { q, plots: new Set() };
        g.plots.add(q.plot);
        same.set(key, g);
      }
      for (const { q, plots } of same.values()) {
        const letters = [...plots]
          .sort((a, b) => a - b)
          .map((p) => plotLetter(ix.plots.get(p) || { id: p }));
        const who =
          letters.length === s.plots.length && letters.length > 1
            ? "Every plot"
            : letters.length > 1
              ? `${letters.slice(0, -1).join(", ")} and ${letters.at(-1)}`
              : letters[0];
        const title = `passed ${lcFirst(motionTitle(ix, q))}`;
        items.push(["ballot", "yes", `${who} ${title}`]);
      }
      if (failed.length)
        items.push(["close", "no", `${plural(failed.length, "motion")} failed`]);
      for (const n of notes.filter((x) =>
        ["alert", "sprout", "excluded"].includes(x.icon),
      ))
        items.push([n.icon, n.tone, n.text]);
      if (deaths && !notes.some((x) => x.icon === "excluded"))
        items.push(["excluded", "no", `${plural(deaths, "Amoeboid")} excluded`]);
      if (f?.stats)
        items.push([
          "carrot",
          "carrot",
          `${fmt(f.stats.food)} field carrots, ${fmt(f.stats.alive)} active`,
        ]);
      const headline = founded.length
        ? `${founded.map((q) => plotLetter(ix.plots.get(q.plot) || { id: q.plot })).join(", ")} ${founded.length === 1 ? "founds a government" : "found governments"}`
        : passed.length
          ? `${plural(passed.length, "decision")} passed`
          : deaths >= 10
            ? "A hungry day"
            : d === 1
              ? "The settling"
              : "A quiet day";
      const isCurrent = d === s.day;
      const shown = items.slice(0, 7);
      return `<article class="day-card ${isCurrent ? "current" : ""}"><div class="day-num">Day ${d}<small>${isCurrent ? (s.phase === "close" ? "Today" : "In progress") : ""}</small></div><div><h3>${esc(headline)}</h3><ul>${shown.map(([i, tone, t]) => `<li>${icon(i, tone)}<span>${esc(t)}</span></li>`).join("")}</ul><div class="day-actions"><button class="btn" data-watch="${d}">${icon("play")}Watch</button><button class="btn" data-night="${d}">${icon("night")}Nightfall</button></div></div></article>`;
    })
    .join("");
  const monthProposals = proposals;
  const passedAll = monthProposals.filter(passedStatus).length;
  const govs = s.plots.filter((p) => p.government).length;
  const months = pb.months || s.months || [];
  const html = `<div class="page-head"><div><h1>Chronicle</h1><p>Month ${s.month}</p></div></div>
    <div class="chron"><div class="days">${cards || `<p class="note">Nothing yet</p>`}</div>
    <aside><div class="aside-card"><h3>Month ${s.month} so far</h3><dl class="kv"><div><dt>Governments now</dt><dd>${govs}</dd></div><div><dt>Motions tabled</dt><dd>${monthProposals.length}</dd></div><div><dt>Motions passed</dt><dd>${passedAll}</dd></div><div><dt>Exclusions</dt><dd>${fmt(s.stats?.exclusions ?? s.stats?.deaths ?? 0)}</dd></div><div><dt>Active</dt><dd>${fmt(s.stats?.alive || 0)}</dd></div></dl></div>
    ${
      months.length
        ? `<div class="aside-card"><h3>Earlier months</h3><table class="table"><thead><tr><th>Month</th><th>Best team</th><th>Exclusions</th></tr></thead><tbody>${months
            .map((m) => {
              const best = [...m.teams].sort((a, b) => b.mean - a.mean)[0];
              return `<tr><td>${m.month}</td><td>${esc(best?.name || "")} ${best ? fmt(best.mean, 1) : ""}</td><td>${fmt(m.exclusions ?? m.deaths)}</td></tr>`;
            })
            .join("")}</tbody></table></div>`
        : ""
    }</aside></div>`;
  if (setHTML(el, html)) {
    el.querySelectorAll("[data-watch]").forEach(
      (b) => (b.onclick = () => app.actions.watchDay(s.month, Number(b.dataset.watch))),
    );
    el.querySelectorAll("[data-night]").forEach(
      (b) => (b.onclick = () => app.actions.nightOf(s.month, Number(b.dataset.night))),
    );
  }
}

export function showMonthCard(app) {
  const s = app.ix.s;
  const el = $("month-card");
  const teams = s.teams
    .map((t, i) => {
      const members = s.agents.filter((a) => a.team === i);
      return {
        i,
        name: t.name,
        mean: members.reduce((x, a) => x + a.score, 0) / Math.max(1, members.length),
      };
    })
    .sort((a, b) => b.mean - a.mean);
  const max = Math.max(...teams.map((t) => t.mean), 1);
  el.innerHTML = `<h2>${icon("meteor")}${s.done ? "The year is over" : `Month ${s.month} ends`}</h2>
    <p>Everything resets. Memories remain.</p>
    <div class="bars">${teams.map((t) => `<div class="bar-row"><span class="name"><i style="background:${teamColor(t.i)}"></i>${esc(t.name)}</span><span class="track2"><i style="width:${(t.mean / max) * 100}%;background:${teamColor(t.i)}"></i></span><span class="v">${fmt(t.mean, 1)}</span></div>`).join("")}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="month-results">See results</button><button class="btn primary" id="month-continue">${s.done ? "Close" : "Continue"}</button></div>`;
  el.hidden = false;
  $("month-continue").onclick = () => {
    el.hidden = true;
    $("play").focus();
  };
  $("month-results").onclick = () => {
    el.hidden = true;
    app.actions.setView("results");
  };
}
