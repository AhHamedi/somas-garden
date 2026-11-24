// Panels around the map: top-bar vitals, plot ledger, the day console, the
// event ticker and the selection inspector. Each renderer reads the current
// indexed snapshot and writes only when its markup changes.

import {
  PHASES,
  WEATHER,
  esc,
  fmt,
  plural,
  teamColor,
  plotLetter,
  plotName,
  agentName,
  phaseIndex,
  plotSummary,
  worldSummary,
  plotLaws,
  motionTitle,
  motionTally,
  statusOf,
  passedStatus,
  roleName,
  cropStatus,
  dayLabel,
  scoreHelp,
  agentDay,
  eventText,
} from "/game/model.js";
import { $, icon, setHTML, avatar, meter, chip } from "/game/dom.js";
import { statuteBook } from "/game/statute-book.js";

const PHASE_ICONS = [
  "sun",
  "ballot",
  "carrot",
  "scroll",
  "ballot",
  "gift",
  "bowl",
  "night",
];
const WEATHER_ICONS = ["sun", "cloud", "rain"];
// ------------------------------------------------------------------ top bar
export function renderVitals(app) {
  const w = worldSummary(app.ix);
  setHTML(
    $("vitals"),
    `<div class="vital people" title="Active Amoeboids out of the whole population">${icon("people")}<b>${fmt(w.alive)}</b><small>of ${fmt(w.population)} active</small></div>
     <div class="vital food" title="Carrots standing in every field">${icon("carrot")}<b>${fmt(w.field)}</b><small>in the fields</small></div>
     <div class="vital food optional" title="Carrots in personal stores">${icon("granary")}<b>${fmt(w.held)}</b><small>held by residents</small></div>
     <div class="vital joy" title="${esc(scoreHelp(app.ix.s))}">${icon("joy")}<b>${fmt(w.satisfaction, 1)}</b><small>avg satisfaction</small></div>
     <div class="vital civic" title="Plots with a government">${icon("hall")}<b>${fmt(w.governments)}</b><small>${w.governments === 1 ? "government" : "governments"}</small></div>`,
  );
  const open = (app.ix.s.proposals || []).filter(
    (p) => p.closes === app.ix.s.absoluteDay || p.created === app.ix.s.absoluteDay,
  ).length;
  const count = $("council-count");
  count.hidden = !open;
  count.textContent = open;
}

// ------------------------------------------------------------------ ledger
export function renderLedger(app) {
  const ix = app.ix,
    s = ix.s;
  const rows = s.plots
    .map((p) => {
      const sum = plotSummary(ix, p);
      const sel = app.sel.plot === p.id;
      return `<button class="plot-row ${sel ? "selected" : ""} ${p.government ? "governed" : ""}" data-plot="${p.id}" aria-pressed="${sel}">
        <span class="letter">${esc(plotLetter(p))}</span>
        <span class="name">${esc(p.name)} ${icon(WEATHER_ICONS[p.weather])}${p.cropEvent ? `<span title="${esc(cropStatus(p))}">${icon(p.cropEvent === "bumper" ? "sprout" : "alert")}</span>` : ""}</span>
        <span class="pop">${icon("people")}${fmt(sum.population)}</span>
        <span class="sub">${meter(sum.fieldShare)}<span>${fmt(p.stock)}</span>${sum.today ? `<span class="badge-dot" title="Motions before the assembly today">${sum.today}</span>` : ""}</span>
      </button>`;
    })
    .join("");
  const waiting = s.agents.filter((a) => !a.alive).length;
  setHTML(
    $("ledger"),
    `<div class="ledger-head"><h2>Plots</h2><span>${fmt(s.plots.filter((p) => p.government).length)} governed</span></div>
     ${rows}
     ${waiting ? `<button class="plot-row" data-plot="-1"><span class="letter">${icon("people")}</span><span class="name">Excluded residents</span><span class="pop">${fmt(waiting)}</span></button>` : ""}
     <div class="ledger-legend">
       <div class="team-legend">${s.teams.map((t, i) => `<span class="legend-row"><svg width="12" height="11" viewBox="0 0 12 11"><ellipse cx="6" cy="5.5" rx="5.5" ry="5" fill="${teamColor(i)}"/></svg>${esc(t.name)}</span>`).join("")}</div>
       <span class="legend-row">${icon("crown")}<span>Justice</span>${icon("flag")}<span>Trade</span></span>
     </div>`,
  );
}

// ------------------------------------------------------------------ console
export function buildRail(onPhase) {
  $("rail").innerHTML = PHASES.map(
    (p, i) =>
      `<li data-i="${i}"><button data-phase="${p.id}" title="${esc(p.verb)}">${icon(PHASE_ICONS[i])}<span>${esc(p.name)}</span></button><span class="bar"><i></i></span></li>`,
  ).join("");
  $("rail")
    .querySelectorAll("button")
    .forEach((b) => (b.onclick = () => onPhase(b.dataset.phase)));
}
export function renderConsole(app) {
  const s = app.ix.s;
  $("date-day").innerHTML =
    s.phase === "ready"
      ? "Day 1"
      : `Day ${s.day}<small style="font:500 13px var(--ui);color:var(--ink-3);margin-left:6px">of ${s.settings.days}</small>`;
  $("date-sub").textContent = `Month ${s.month} of ${s.settings.months}`;
  const archived = s.version > 0 && s.version < 6;
  const secondPhase = $("rail").querySelector('li[data-i="1"] button');
  const secondId = archived ? "movement" : PHASES[1].id;
  if (secondPhase.dataset.phase !== secondId) {
    secondPhase.dataset.phase = secondId;
    secondPhase.title = archived ? "Archived migration phase" : PHASES[1].verb;
    secondPhase.querySelector("span").textContent = archived
      ? "Migration"
      : PHASES[1].name;
  }
  const cur = s.phase === "movement" ? 1 : phaseIndex(s.phase);
  $("rail")
    .querySelectorAll("li")
    .forEach((li, i) => {
      li.classList.toggle("done", cur >= 0 && i < cur);
      li.classList.toggle("current", i === cur);
      if (i !== cur)
        li.querySelector(".bar i").style.transform = i < cur ? "" : "scaleX(0)";
      const b = li.querySelector("button");
      const available = app.dayIndex?.has(b.dataset.phase);
      b.disabled = !available;
      if (i === cur) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
    });
  const story = app.story;
  const h = $("headline");
  if (h.textContent !== story.headline) {
    h.textContent = story.headline;
    h.classList.remove("fresh");
    void h.offsetWidth;
    h.classList.add("fresh");
  }
  setHTML(
    $("figures"),
    story.figures
      .slice(0, 3)
      .map(
        (f) =>
          `<span class="fig ${f.tone}">${icon(f.icon)}<b>${esc(f.value)}</b><small>${esc(f.label)}</small></span>`,
      )
      .join(""),
  );
  renderEdge(app);
  renderTimeline(app);
}
export function renderProgress(app, progress) {
  const li = $("rail").querySelector("li.current .bar i");
  if (li) li.style.transform = `scaleX(${progress.toFixed(3)})`;
}
export function renderEdge(app) {
  const pb = app.pb;
  let html;
  if (pb.isFinished() && pb.atEdge)
    html = `<span class="live">${icon("meteor")}Year complete</span>`;
  else if (pb.readOnly && pb.atEdge) html = `<span>Saved replay, read only</span>`;
  else if (pb.atEdge) html = `<span class="live">${icon("live")}Live</span>`;
  else
    html = `<span>Replaying, ${plural(Math.min(pb.max, pb.liveIndex ?? pb.max) - pb.cur, "phase")} behind</span><button id="to-live">${icon("skip")}Back to latest</button>`;
  if (setHTML($("edge"), html))
    $("to-live")?.addEventListener("click", () => app.actions.toLatest());
}
export function renderTimeline(app) {
  const pb = app.pb,
    s = app.ix.s;
  const frames = pb.frames;
  const f = frames[pb.cur];
  if (!f) return;
  let start = pb.cur,
    end = pb.cur;
  while (start > 0 && frames[start - 1]?.month === f.month) start--;
  while (end < frames.length - 1 && frames[end + 1]?.month === f.month) end++;
  const total = s.settings.days * PHASES.length + 1;
  const pos = (i) => ((i - start) / Math.max(1, total - 1)) * 100;
  $("track-fill").style.width = `${pos(Math.min(end, pb.liveIndex ?? end))}%`;
  $("track-head").style.left = `${pos(pb.cur)}%`;
  const key = `${f.month}:${s.settings.days}:${end}`;
  if ($("track-marks").dataset.key !== key) {
    $("track-marks").dataset.key = key;
    const marks = [];
    for (let d = 1; d <= s.settings.days; d++)
      marks.push(
        `<i style="left:${((d - 1) * PHASES.length * 100) / (total - 1)}%"></i>`,
      );
    // Mark founding days and days with multiple exclusions.
    let prev = null;
    for (let i = start; i <= end; i++) {
      const fr = frames[i];
      if (prev && fr.stats && prev.stats) {
        if (fr.stats.governments > prev.stats.governments)
          marks.push(
            `<i class="gov" style="left:${pos(i)}%" title="Government founded"></i>`,
          );
        if (
          (fr.stats.exclusions ?? fr.stats.deaths) -
            (prev.stats.exclusions ?? prev.stats.deaths) >=
          5
        )
          marks.push(
            `<i class="loss" style="left:${pos(i)}%" title="${(fr.stats.exclusions ?? fr.stats.deaths) - (prev.stats.exclusions ?? prev.stats.deaths)} exclusions"></i>`,
          );
      }
      prev = fr;
    }
    $("track-marks").innerHTML = marks.join("");
  }
  const watched = frames[Math.min(end, pb.liveIndex ?? end)];
  $("track-label").textContent =
    watched && watched.month === f.month ? `Watched to day ${watched.day}` : "";
  $("track").setAttribute("aria-label", `Month ${f.month} timeline`);
  app.trackRange = { start, end, total };
}

// ------------------------------------------------------------------ ticker
export function pushTicker(app, items) {
  const box = $("ticker");
  for (const item of items.slice(0, 3)) {
    const el = document.createElement("button");
    el.className = `tick ${item.tone}`;
    el.innerHTML = `${icon(item.icon)}<span>${esc(item.text)}</span>`;
    el.onclick = () => {
      if (item.proposal) app.actions.openMotion(item.proposal);
      else if (item.plot !== undefined) app.actions.selectPlot(item.plot);
    };
    box.append(el);
    setTimeout(() => {
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 450);
    }, 5200);
  }
  while (box.children.length > 4) box.firstElementChild.remove();
}

// ------------------------------------------------------------------ inspector
export function renderInspector(app) {
  const el = $("inspector");
  const { plot, agent } = app.sel;
  const show = plot !== null || agent !== null;
  el.hidden = !show;
  document.body.classList.toggle("inspecting", show);
  if (!show) return;
  if (agent !== null) return renderAgent(app, el);
  if (plot === -1) return renderExcluded(app, el);
  const p = app.ix.plots.get(plot);
  if (!p) return;
  renderPlot(app, el, p);
}

function inspectorShell(app, el, head, tabs, body) {
  const html = `${head}${tabs ? `<div class="tabs" role="tablist">${tabs}</div>` : ""}<div class="insp-body" id="insp-body">${body}</div>`;
  const scroller = $("insp-body");
  const keep = scroller ? scroller.scrollTop : 0;
  const sameView = el.dataset.view === app.inspectorKey;
  if (setHTML(el, html)) {
    el.dataset.view = app.inspectorKey;
    if (sameView) $("insp-body").scrollTop = keep;
    wireInspector(app, el);
  }
}
function wireInspector(app, el) {
  el.querySelectorAll("[data-tab]").forEach(
    (b) => (b.onclick = () => app.actions.setTab(b.dataset.tab)),
  );
  el.querySelectorAll("[data-agent]").forEach(
    (b) => (b.onclick = () => app.actions.selectAgent(Number(b.dataset.agent))),
  );
  el.querySelectorAll("[data-plot-link]").forEach(
    (b) => (b.onclick = () => app.actions.selectPlot(Number(b.dataset.plotLink))),
  );
  el.querySelectorAll("[data-motion]").forEach(
    (b) => (b.onclick = () => app.actions.openMotion(b.dataset.motion)),
  );
  el.querySelectorAll("[data-sort]").forEach(
    (b) =>
      (b.onclick = () => {
        const key = b.dataset.sort;
        app.res.dir = app.res.sort === key ? -app.res.dir : key === "name" ? 1 : -1;
        app.res.sort = key;
        app.actions.refresh();
      }),
  );
  el.querySelectorAll("[data-team]").forEach(
    (b) =>
      (b.onclick = () => {
        const t = Number(b.dataset.team);
        app.res.team = app.res.team === t ? null : t;
        app.actions.refresh();
      }),
  );
  el.querySelector("[data-close]")?.addEventListener("click", () =>
    app.actions.clearSelection(),
  );
  el.querySelector("[data-back]")?.addEventListener("click", () =>
    app.actions.backToPlot(),
  );
  el.querySelectorAll("[data-law]").forEach(
    (b) => (b.onclick = () => app.actions.toggleLaw(b.dataset.law)),
  );
  el.querySelectorAll("[data-decision]").forEach(
    (b) => (b.onclick = () => app.actions.toggleLaw(`decision:${b.dataset.decision}`)),
  );
  el.querySelectorAll("[data-collapse]").forEach(
    (b) => (b.onclick = () => app.actions.toggleSection(b.dataset.collapse)),
  );
  el.querySelector("[data-expand]")?.addEventListener("click", () =>
    app.actions.toggleWide(),
  );
  el.querySelectorAll("[data-amode]").forEach(
    (b) =>
      (b.onclick = () => {
        app.assemblyMode = b.dataset.amode;
        app.actions.refresh();
      }),
  );
  el.querySelectorAll("tr[data-row]").forEach(
    (tr) => (tr.onclick = () => app.actions.selectAgent(Number(tr.dataset.row))),
  );
}

function closeButton(app) {
  const wide = !!app?.wide;
  return `<div class="insp-btns"><button class="icon-button" data-expand aria-label="${wide ? "Narrow the panel" : "Widen the panel"}" title="${wide ? "Narrow" : "Widen"}; drag the edge for any width">${icon(wide ? "narrow" : "widen")}</button><button class="icon-button" data-close aria-label="Close">${icon("close")}</button></div>`;
}

/** A section the observer can fold away; folded sections stay folded. */
function section(app, id, title, body, extra = "") {
  const folded = app.collapsed.has(id);
  return `<section class="section fold ${folded ? "folded" : ""}"><div class="section-head"><button class="fold-toggle" data-collapse="${id}" aria-expanded="${!folded}">${icon("chevron")}<h3>${title}</h3></button>${extra}</div>${folded ? "" : body}</section>`;
}

function tabsFor(app, p, sum) {
  const motions = (app.ix.s.proposals || []).filter(
    (q) =>
      q.plot === p.id &&
      (q.created === app.ix.s.absoluteDay || q.closes === app.ix.s.absoluteDay),
  );
  const list = [
    ["overview", "Overview", ""],
    ["residents", "Residents", sum.population],
    ["assembly", "Assembly", motions.length],
    ["activity", "Today", ""],
  ];
  return list
    .map(
      ([id, name, count]) =>
        `<button class="tab" role="tab" data-tab="${id}" aria-selected="${app.tab === id}">${name}${count !== "" && count ? `<span class="count ${id === "assembly" ? "hot" : ""}">${count}</span>` : ""}</button>`,
    )
    .join("");
}

function renderPlot(app, el, p) {
  const ix = app.ix,
    s = ix.s;
  const sum = plotSummary(ix, p);
  const govSince = (s.proposals || []).find(
    (q) => q.plot === p.id && q.input?.kind === "found" && q.status === "activated",
  );
  const chips = [
    p.government
      ? chip(
          govSince ? `Governed since ${dayLabel(s, govSince.activate)}` : "Governed",
          "civic",
          "hall",
        )
      : chip("No government", "neutral"),
    p.cropEvent
      ? chip(
          cropStatus(p),
          p.cropEvent === "blight" || p.cropEvent === "failed" ? "no" : "yes",
          "sprout",
        )
      : "",
  ].join("");
  const head = `<div class="insp-head"><span class="insp-mark ${p.government ? "governed" : ""}">${esc(plotLetter(p))}</span>
    <div class="insp-title"><h2>${esc(p.name)}</h2><p>${icon(WEATHER_ICONS[p.weather])}${WEATHER[p.weather]}, +${fmt(p.regeneration)} mind a day</p><div class="chips">${chips}</div></div>${closeButton(app)}</div>`;
  app.inspectorKey = `plot:${p.id}:${app.tab}:${app.assemblyMode}`;
  let body = "";
  if (app.tab === "overview") body = plotOverview(app, p, sum);
  if (app.tab === "residents") body = residentsView(app, ix.residents.get(p.id) || []);
  if (app.tab === "assembly") body = assemblyView(app, p);
  if (app.tab === "activity") body = activityView(app, p.id);
  inspectorShell(app, el, head, tabsFor(app, p, sum), body);
}

function localStory(app, plotId) {
  const s = app.ix.s;
  const ev = (s.events || []).filter((e) => e.plot === plotId);
  const sumOf = (k) =>
    ev.filter((e) => e.kind === k).reduce((t, e) => t + (e.amount || 0), 0);
  const count = (k) => ev.filter((e) => e.kind === k).length;
  const p = app.ix.plots.get(plotId);
  switch (s.phase) {
    case "environment": {
      if (!p) return "";
      const sanctions = count("sanction_applied");
      const weather =
        s.day === 1
          ? `Residents chose this plot for the month with ${fmt(s.settings.startingMind)} starting mind.`
          : `Residents regain up to ${fmt(p.regeneration)} mind under ${WEATHER[p.weather].toLowerCase()} skies.`;
      return `${fmt(sumOf("growth"))} carrots grew. ${weather}${sanctions ? ` Justice applied ${plural(sanctions, "sanction")}.` : ""}`;
    }
    case "harvest_order":
      return p?.harvestOrder?.length
        ? `${plural(p.harvestOrder.length, "resident")} in today's harvest queue.`
        : "The field has no harvest queue.";
    case "harvest": {
      const n = count("harvest");
      return n
        ? `${plural(n, "resident")} harvested ${plural(sumOf("harvest"), "carrot")} here.${count("ration_breach") ? ` ${count("ration_breach")} broke the soft quota.` : ""}`
        : "Nobody harvested here.";
    }
    case "proposals": {
      const tabled = (s.proposals || []).filter(
        (q) => q.plot === plotId && q.created === s.absoluteDay,
      );
      return tabled.length
        ? `${plural(tabled.length, "motion")} tabled for today's vote.`
        : "No motions tabled here.";
    }
    case "voting": {
      const decided = (s.proposals || []).filter(
        (q) => q.plot === plotId && q.closes === s.absoluteDay && q.status !== "open",
      );
      if (!decided.length) return "No vote here today.";
      const passed = decided.filter(passedStatus).length;
      return `The assembly decided ${plural(decided.length, "motion")}: ${passed} passed.`;
    }
    case "transfers": {
      const incoming = ev
        .filter(
          (e) => e.kind === "received" && app.ix.agents.get(e.target)?.plot !== plotId,
        )
        .reduce((n, e) => n + e.amount, 0);
      const actions = [];
      if (incoming)
        actions.push(`${plural(incoming, "carrot")} received from other plots`);
      if (sumOf("donation"))
        actions.push(`${plural(sumOf("donation"), "carrot")} donated locally`);
      if (sumOf("gift"))
        actions.push(`${plural(sumOf("gift"), "carrot")} gifted by Trade`);
      if (count("justice_order"))
        actions.push(`Justice scheduled ${plural(count("justice_order"), "sanction")}`);
      if (count("blight_rescued") || count("plot_failed")) actions.push(cropStatus(p));
      return actions.length
        ? actions.join(". ") + "."
        : "No department actions or donations.";
    }
    case "eating": {
      const deaths = (s.agents || []).filter(
        (a) =>
          !a.alive &&
          app.prevIx?.agents.get(a.id)?.alive &&
          app.prevIx.agents.get(a.id).plot === plotId,
      ).length;
      return `Residents ate ${plural(sumOf("eat"), "carrot")}${deaths ? `; ${plural(deaths, "resident")} excluded` : ""}.`;
    }
    case "close":
      return "Night. Residents sleep until dawn.";
    default:
      return "";
  }
}

function plotOverview(app, p, sum) {
  const ix = app.ix,
    s = ix.s;
  const teamBar = sum.teams
    .map(
      ([t, n]) =>
        `<i style="width:${(n / Math.max(1, sum.population)) * 100}%;background:${teamColor(t)}" title="${esc(s.teams[t]?.name)}: ${n}"></i>`,
    )
    .join("");
  const now = localStory(app, p.id);
  const holders = [];
  for (const [id, r] of ix.roles) {
    const here = r.filter((role) => role.plot === p.id);
    const a = ix.agents.get(id);
    if (!here.length || !a) continue;
    const title = here.map((r) => roleName(r.kind)).join(" and ");
    holders.push(
      `<button class="person" data-agent="${id}">${avatar(a, here)}<span><strong>${esc(a.name)}</strong><span class="what">${title}</span></span>${icon("chevron")}</button>`,
    );
  }
  const laws = plotLaws(ix, p).filter((l) => l.scope === "local");
  const motions = (s.proposals || []).filter(
    (q) => q.plot === p.id && (q.created === s.absoluteDay || q.closes === s.absoluteDay),
  );
  const vitals = `<div class="vit-grid">
      <div class="vit food"><span class="vit-label">${icon("carrot")}Field</span><span class="vit-value">${fmt(p.stock)}<small>/ ${fmt(p.capacity)}</small></span>${meter(sum.fieldShare)}</div>
      <div class="vit"><span class="vit-label">${icon("gift")}Trade store</span><span class="vit-value">${p.roles?.trade != null ? fmt(ix.agents.get(p.roles.trade)?.food) : "Vacant"}<small>${p.roles?.trade != null ? esc(agentName(ix, p.roles.trade)) : ""}</small></span></div>
      <div class="vit people"><span class="vit-label">${icon("people")}Residents</span><span class="vit-value">${fmt(sum.population)}<small>${fmt(sum.food)} carrots held</small></span><span class="teambar">${teamBar}</span></div>
      <div class="vit joy" title="${esc(scoreHelp(app.ix.s))}"><span class="vit-label">${icon("joy")}Satisfaction</span><span class="vit-value">${fmt(sum.satisfaction, 1)}<small>avg</small></span>${sum.hungry ? `<span class="vit-foot warn">${fmt(sum.hungry)} hungry</span>` : ""}</div>
    </div>
    <div class="mini-stats">
      <span title="Average mind">${icon("mind")}<b>${fmt(sum.mind, 1)}</b> mind</span>
      <span title="Average body">${icon("body")}<b>${fmt(sum.body, 1)}</b> body</span>
      <span title="Average daily voting weight">${icon("ballot")}<b>${fmt(sum.votingWeight, 1)}</b> voting weight</span>
    </div>`;
  const lawList = laws.length
    ? `<div class="law-rows">${laws
        .map(
          (l) =>
            `<button class="law-row" data-law="local:${esc(l.base)}" title="${esc(l.sentence)}"><span>${esc(l.name)}</span><b>${esc(l.value)}</b>${l.state?.tone === "warn" ? `<i class="warn-dot" title="${esc(l.state.text)}"></i>` : ""}</button>`,
        )
        .join("")}</div>`
    : `<p class="note">None yet</p>`;
  return `
    ${now ? `<div class="now-line">${icon(PHASE_ICONS[Math.max(0, phaseIndex(s.phase))])}<span>${esc(now)}</span></div>` : ""}
    <div class="ov-cols">
    ${section(app, "vitals", "Plot", vitals)}
    ${
      p.government
        ? section(
            app,
            "laws",
            "Laws",
            lawList,
            `<button class="link" data-tab="laws">All</button>`,
          ) +
          section(
            app,
            "leaders",
            "Leadership",
            holders.length
              ? `<div class="person-list">${holders.join("")}</div>`
              : `<p class="note">Both roles are vacant</p>`,
          )
        : section(
            app,
            "laws",
            "Government",
            `<p class="note">None. Founding needs ${fmt(Math.floor(sum.population / 2) + 1)} of ${fmt(sum.population)} votes and ${fmt(s.settings.governmentCost)} pledged mind.</p>`,
          )
    }
    ${p.harvestOrder?.length ? section(app, "harvestQueue", "Harvest order", `<details><summary>${plural(p.harvestOrder.length, "resident")} · first up ${esc(agentName(ix, p.harvestOrder[0]))}</summary><ol>${p.harvestOrder.map((id) => `<li><button class="link" data-agent="${id}">${esc(agentName(ix, id))}</button></li>`).join("")}</ol></details>`) : ""}
    ${motions.length ? section(app, "motions", "Motions today", motions.map((q) => motionCard(app, q)).join(""), `<button class="link" data-tab="assembly">Open</button>`) : ""}
    </div>`;
}

export function motionCard(app, q) {
  const ix = app.ix;
  const t = motionTally(q);
  const st = statusOf(q);
  const open = q.status === "open";
  const yesPct = t.total ? (t.yes / t.total) * 100 : 0;
  const noPct = t.total ? (t.no / t.total) * 100 : 0;
  const mark = t.total ? (t.need / t.total) * 100 : 50;
  return `<button class="motion" data-motion="${esc(q.id)}" title="Tabled by ${esc((q.sponsors || [q.author]).map((id) => agentName(ix, id)).join(", "))}">
    <div class="motion-top"><span class="motion-title">${esc(motionTitle(ix, q))}</span>${chip(st.label, st.tone)}</div>
    ${open ? "" : `<span class="tally"><i class="y" style="width:${yesPct}%"></i><i class="n" style="width:${noPct}%"></i><span class="mark" style="left:${mark}%"></span></span><span class="tally-legend"><span><b>${fmt(t.yes)}</b>–<b>${fmt(t.no)}</b></span><span>${fmt(t.need)} needed</span></span>`}
  </button>`;
}

function assemblyView(app, p) {
  const s = app.ix.s;
  const today = (s.proposals || []).filter(
    (q) => q.plot === p.id && (q.created === s.absoluteDay || q.closes === s.absoluteDay),
  );
  const earlier = (s.proposals || [])
    .filter((q) => q.plot === p.id && !today.includes(q) && q.status !== "open")
    .sort((a, b) => b.closes - a.closes)
    .slice(0, 24);
  const mode = app.assemblyMode === "motions" ? "motions" : "laws";
  const seg = `<div class="amode seg" role="group" aria-label="Assembly view"><button data-amode="laws" aria-pressed="${mode === "laws"}">${icon("scroll")}Laws</button><button data-amode="motions" aria-pressed="${mode === "motions"}">${icon("ballot")}Motions${today.length ? `<span class="count hot">${today.length}</span>` : ""}</button></div>`;
  if (mode === "laws") return seg + statuteBook(app, p);
  return `${seg}<div class="section"><div class="section-head"><h3>Today</h3>${today[0] || earlier[0] ? `<button class="link" data-motion="${today[0]?.id || earlier[0]?.id}">Council</button>` : ""}</div>${today.length ? today.map((q) => motionCard(app, q)).join("") : `<p class="note">None</p>`}</div>
    <div class="section"><div class="section-head"><h3>This month</h3></div>${earlier.length ? earlier.map((q) => motionCard(app, q)).join("") : `<p class="note">None</p>`}</div>`;
}

const PHASE_NAME = Object.fromEntries(PHASES.map((p) => [p.id, p.name]));

function activityView(app, plotId) {
  const frames = app.dayFrames || [];
  if (!frames.length) return `<p class="note">Loading today's record…</p>`;
  const ix = app.ix;
  const rows = [];
  for (const f of frames) {
    const ev = (f.events || []).filter(
      (e) => e.plot === plotId && e.kind !== "funding" && e.kind !== "pledge",
    );
    if (!ev.length) continue;
    const groups = new Map();
    for (const e of ev) {
      const g = groups.get(e.kind) || [];
      g.push(e);
      groups.set(e.kind, g);
    }
    const lines = [];
    for (const [kind, list] of groups) {
      if (kind === "harvest_ranking") {
        const ballots = list
          .map(
            (e) =>
              `<li><b>${esc(agentName(ix, e.actor))}</b> · ${esc((e.members || []).map((id) => agentName(ix, id)).join(" → "))}</li>`,
          )
          .join("");
        lines.push(
          `<li><details><summary>${plural(list.length, "public ranking")}</summary><ol>${ballots}</ol></details></li>`,
        );
        continue;
      }
      const amount = list.reduce((t, e) => t + (e.amount || 0), 0);
      const names = list.filter((e) => e.actor >= 0).map((e) => agentName(ix, e.actor));
      const who = names.length
        ? `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""}`
        : "";
      const text =
        {
          harvest: `${plural(list.length, "resident")} harvested ${plural(amount, "carrot")}`,
          eat: `${plural(list.length, "resident")} ate ${plural(amount, "carrot")}`,
          think: `${plural(list.length, "resident")} thought with ${fmt(amount)} mind`,
          excluded: `${who} excluded`,
          received: `${who} received ${plural(amount, "carrot")}`,
          donation: `${plural(amount, "carrot")} donated to Trade`,
          gift: `${plural(amount, "carrot")} gifted by Trade`,
          harvest_order: list[0].message,
          blight: list[0].message,
          bumper: list[0].message,
          plot_failed: list[0].message,
          blight_rescued: list[0].message,
          proposal: `${who} tabled ${list
            .map((e) => e.message.toLowerCase())
            .slice(0, 2)
            .join("; ")}`,
          ballot: list
            .map((e) => e.message)
            .slice(0, 3)
            .join("; "),
          growth: `${fmt(amount)} carrots grew`,
          ration_breach: `${who} broke the quota`,
          justice_order: list.map((e) => e.message).join(". "),
          sanction_applied: list.map((e) => e.message).join(". "),
          activated: list
            .map((e) => e.message)
            .slice(0, 3)
            .join("; "),
          cancelled: list
            .map((e) => e.message)
            .slice(0, 2)
            .join("; "),
          dissolution: list[0].message,
          proposal_rejected: `${plural(list.length, "motion")} refused: ${list[0].message}`,
        }[kind] || `${list.length} ${kind.replace(/_/g, " ")}`;
      lines.push(
        `<li><span class="ph">${esc(PHASE_NAME[f.phase] || f.phase)}</span><span class="${kind === "excluded" ? "fail" : ""}">${esc(text)}</span></li>`,
      );
    }
    rows.push(lines.join(""));
  }
  return rows.length
    ? `<ul class="timeline-list">${rows.join("")}</ul>`
    : `<p class="note">Nothing yet</p>`;
}

function residentsView(app, residents) {
  const ix = app.ix,
    s = ix.s;
  const teams = new Map();
  for (const a of residents) teams.set(a.team, (teams.get(a.team) || 0) + 1);
  const filt = app.res.team;
  let list = filt === null ? residents : residents.filter((a) => a.team === filt);
  const key = app.res.sort,
    dir = app.res.dir;
  list = [...list].sort(
    (a, b) =>
      (key === "name"
        ? a.name.localeCompare(b.name)
        : (a[key] ?? 0) - (b[key] ?? 0) || a.id - b.id) * dir,
  );
  const th = (k, label, cls = "") =>
    `<th class="sortable ${cls} ${key === k ? "active" : ""}" data-sort="${k}" aria-sort="${key === k ? (dir > 0 ? "ascending" : "descending") : "none"}">${label}${key === k ? (dir > 0 ? " ↑" : " ↓") : ""}</th>`;
  const rows = list
    .map((a) => {
      const roles = ix.roles.get(a.id) || [];
      return `<tr data-row="${a.id}"><td><button data-agent="${a.id}">${avatar(a, roles)}${esc(a.name)}</button></td><td>${fmt(a.votingWeight ?? a.influence)}</td><td>${fmt(a.votingTokens)}</td><td><span class="minibar" title="Body ${fmt(a.body, 1)}"><i style="width:${(a.body / (s.settings.bodyCapacity || 2)) * 100}%;background:var(--body)"></i></span></td><td><span class="minibar" title="Mind ${fmt(a.mind, 1)}"><i style="width:${(a.mind / (s.settings.mindCapacity || 12)) * 100}%;background:var(--mind)"></i></span></td><td>${fmt(a.food)}</td><td class="w">${fmt(a.totalHarvested)}</td><td class="w">${fmt(a.totalEaten)}</td><td class="w">${fmt(a.thought, 1)}</td><td class="w">${fmt(a.politicalMind, 1)}</td><td class="w">${fmt(a.exclusions ?? a.deaths)}</td><td>${fmt(a.score, 1)}</td></tr>`;
    })
    .join("");
  return `<div class="team-chips" aria-label="Filter by team">${[...teams.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(
      ([t, n]) =>
        `<button class="team-chip ${filt !== null && filt !== t ? "dim" : ""}" data-team="${t}" aria-pressed="${filt === t}"><i style="background:${teamColor(t)}"></i>${esc(s.teams[t]?.name || `Team ${t + 1}`)} ${n}</button>`,
    )
    .join("")}</div>
    ${list.length ? `<table class="res-table"><thead><tr>${th("name", "Resident")}${th("votingWeight", "Voting weight")}${th("votingTokens", "Tokens")}${th("body", "Body")}${th("mind", "Mind")}${th("food", "Food")}${th("totalHarvested", "Harvested", "w")}${th("totalEaten", "Eaten", "w")}${th("thought", "Thought", "w")}${th("politicalMind", "Politics", "w")}${th("exclusions", "Exclusions", "w")}${th("score", "Satisf.")}</tr></thead><tbody>${rows}</tbody></table>` : `<p class="note" style="margin-top:12px">Empty</p>`}`;
}

function renderExcluded(app, el) {
  const ix = app.ix,
    s = ix.s;
  const excluded = s.agents.filter((a) => !a.alive);
  app.inspectorKey = "excluded";
  const head = `<div class="insp-head"><div class="insp-title"><h2>Excluded residents</h2><p>${fmt(excluded.length)} currently excluded</p></div>${closeButton(app)}</div>`;
  inspectorShell(app, el, head, "", residentsView(app, excluded));
}
function renderAgent(app, el) {
  const ix = app.ix,
    s = ix.s;
  const a = ix.agents.get(app.sel.agent);
  if (!a) return;
  const roles = ix.roles.get(a.id) || [];
  const set = s.settings;
  const pledged = Object.values(a.pledges || {}).reduce((t, v) => t + Number(v || 0), 0);
  app.inspectorKey = `agent:${a.id}`;
  const where = a.alive
    ? a.plot >= 0
      ? `lives in ${plotName(ix, a.plot)}`
      : "awaiting plot placement"
    : "excluded";
  const roleChips = roles
    .map((r) => chip(roleName(r.kind), "civic", r.kind === "trade" ? "flag" : "crown"))
    .join("");
  const capacity = roles.some((r) => r.kind === "trade")
    ? set.representativeCapacity
    : set.personalCapacity;
  const backTo = app.backPlot ?? (a.plot >= 0 || a.plot === -1 ? a.plot : null);
  const head = `<div class="insp-head" style="grid-template-columns:1fr auto"><div>${backTo !== null && backTo !== undefined ? `<button class="back" data-back>${icon("back")}${backTo === -1 ? "Excluded residents" : esc(plotName(ix, backTo))}</button>` : ""}<div class="agent-head">${avatar(a, roles, "lg")}<div><h2>${esc(a.name)}</h2><p>${esc(s.teams[a.team]?.name || "")} team, ${esc(where)}</p>${roleChips ? `<div class="chips">${roleChips}</div>` : ""}</div></div></div>${closeButton(app)}</div>`;
  const today = agentDay(
    (app.dayFrames || []).flatMap((f) => f.events || []),
    a.id,
  );
  const votes = (s.proposals || []).filter(
    (q) => q.closes === s.absoluteDay && q.votes?.[a.id],
  );
  const body = `
    <div class="stat-rows">
      <div class="stat-row"><span class="lbl">${icon("body")}Body</span>${meter(a.body / (set.bodyCapacity || 2), "body")}<span class="val">${fmt(a.body, 1)} <small>/ ${fmt(set.bodyCapacity)}</small></span></div>
      <div class="stat-row"><span class="lbl">${icon("mind")}Mind</span>${meter(a.mind / (set.mindCapacity || 12), "mind", pledged ? `<i class="pledged" style="left:${((a.mind - pledged) / (set.mindCapacity || 12)) * 100}%;width:${(pledged / (set.mindCapacity || 12)) * 100}%"></i>` : "")}<span class="val" title="${pledged ? `${fmt(pledged, 2)} pledged` : ""}">${fmt(a.mind, 1)} <small>/ ${fmt(set.mindCapacity)}</small></span></div>
      <div class="stat-row"><span class="lbl">${icon("carrot")}Carrots</span>${meter(a.food / (capacity || 1))}<span class="val">${fmt(a.food)} <small>/ ${fmt(capacity)}</small></span></div>
      <div class="stat-row"><span class="lbl">${icon("ballot")}Voting weight</span><span>daily grant</span><span class="val">${fmt(a.votingWeight ?? a.influence)}</span></div>
      <div class="stat-row"><span class="lbl">${icon("ballot")}Voting tokens</span><span>available</span><span class="val">${fmt(a.votingTokens)}</span></div>
      <div class="stat-row" title="${esc(scoreHelp(app.ix.s))}"><span class="lbl">${icon("joy")}Satisfaction</span><span></span><span class="val" style="color:var(--joy)">${fmt(a.score, 1)}</span></div>
    </div>
    ${votes.length ? `<div class="section"><div class="section-head"><h3>Votes today</h3></div><div class="law-list">${votes.map((q) => `<button class="law" data-motion="${esc(q.id)}" style="text-align:left">${icon(q.votes[a.id] === "yes" ? "ballot" : "close")}<div><div class="law-top"><span class="law-name">${esc(motionTitle(ix, q))}</span><span class="law-value" style="color:var(--${q.votes[a.id] === "yes" ? "yes" : q.votes[a.id] === "no" ? "no" : "ink-3"})">${esc(q.votes[a.id])} · ${plural(q.tokenSpends?.[a.id] || 0, "token")}</span></div></div></button>`).join("")}</div></div>` : ""}
    <div class="agent-cols"><div class="section"><div class="section-head"><h3>Today</h3></div>${today.length ? `<ul class="timeline-list">${today.map((e) => `<li><span class="ph">${esc(PHASE_NAME[e.phase] || e.phase)}</span><span class="${e.kind === "excluded" || e.kind.includes("reject") ? "fail" : ""}">${esc(eventText(e, ix))}</span></li>`).join("")}</ul>` : `<p class="note">${app.dayFrames ? "Nothing yet" : "Loading…"}</p>`}</div>
    <div class="section"><div class="section-head"><h3>This month</h3></div><dl class="kv">
      <div><dt>Harvested</dt><dd>${fmt(a.totalHarvested)}</dd></div><div><dt>Eaten</dt><dd>${fmt(a.totalEaten)}</dd></div>
      <div><dt>Thought</dt><dd>${fmt(a.thought, 1)}</dd></div><div><dt>Politics</dt><dd>${fmt(a.politicalMind, 1)}</dd></div>
      <div><dt>Active days</dt><dd>${fmt(a.activeDays)}</dd></div><div><dt>Exclusions</dt><dd>${fmt(a.exclusions ?? a.deaths)}</dd></div>
    </dl></div></div>
    ${a.error ? `<div class="section"><p class="note fail">${esc(a.error)}</p></div>` : ""}`;
  inspectorShell(app, el, head, "", body);
}
