// Wiring: the playback clock drives the map every animation frame; panels
// redraw only when a new phase arrives or the observer changes selection.

import { Playback, SPEEDS, phaseWeight } from "/game/playback.js";
import { World } from "/game/world.js";
import {
  indexSnapshot,
  phaseStory,
  notableEvents,
  PHASES,
  phaseIndex,
  esc,
  fmt,
} from "/game/model.js";
import * as UI from "/game/ui.js";
import { Council } from "/game/council.js";
import { renderChronicle, showMonthCard } from "/game/pages.js";
import { renderResults } from "/game/results.js";
import { renderRulebook } from "/game/rulebook.js";
import { Setup } from "/game/setup.js";
import { $, icon, toast } from "/game/dom.js";

async function api(path, body, method = body === undefined ? "GET" : "POST") {
  const response = await fetch(`/api/society${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data.error || `The simulation server answered ${response.status}.`,
    );
    error.status = response.status;
    throw error;
  }
  return data;
}

const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
};

function readJSON(key, fallback) {
  try {
    return JSON.parse(storage.get(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

const app = {
  api,
  config: null,
  pb: new Playback(api),
  ix: null,
  prevIx: null,
  story: { headline: "", figures: [] },
  sel: { plot: null, agent: null },
  backPlot: null,
  tab: "overview",
  res: { sort: "score", dir: -1, team: null },
  view: "world",
  progress: 1,
  speed: storage.get("amoeboids.speed") || "1",
  notables: new Map(),
  dayFrames: null,
  dayIndex: new Map(),
  meteorShown: "",
  assemblyMode: "laws",
  openLaw: null,
  collapsed: new Set(readJSON("amoeboids.folded", [])),
  wide: storage.get("amoeboids.wide") === "1",
};
const pb = app.pb;
// Exposed for browser checks and the curious observer's console.
window.amoeboids = app;
const council = new Council(app);
const setup = new Setup(app);
let world;

// ------------------------------------------------------------------ clock
const clock = { start: 0, duration: 2200, running: false };
function speedMs() {
  return (SPEEDS.find((s) => s.id === app.speed) || SPEEDS[1]).ms;
}
function startPhaseClock(snapshot) {
  clock.duration = speedMs() * phaseWeight(snapshot);
  clock.start = performance.now();
  clock.running = true;
  app.progress = 0;
}
function resumeClock() {
  clock.start = performance.now() - app.progress * clock.duration;
  clock.running = app.progress < 1;
}

function loop(now) {
  if (clock.running && app.ix) {
    app.progress = Math.min(1, (now - clock.start) / clock.duration);
    UI.renderProgress(app, app.progress);
    council.tick(app.progress);
    if (app.progress >= 1) {
      clock.running = false;
      if (app.ix.s.meteor) maybeMonthCard();
    } else if (app.ix.s.meteor && app.progress > 0.6) maybeMonthCard();
  } else if (pb.playing && !pb.waiting && app.progress >= 1) {
    pb.advance().then((ok) => {
      if (!ok && !pb.waiting && !pb.stepping) {
        if (pb.isFinished() || pb.readOnly) pb.pause();
      }
    });
  }
  world?.render(now, app.progress);
  requestAnimationFrame(loop);
}

function maybeMonthCard() {
  const s = app.ix.s;
  const key = `${s.month}:${s.absoluteDay}`;
  if (app.meteorShown === key) return;
  app.meteorShown = key;
  showMonthCard(app);
  const card = $("month-card");
  clearTimeout(app.monthTimer);
  app.monthTimer = setTimeout(() => {
    if (!card.matches(":hover")) card.hidden = true;
  }, 12000);
}

// ------------------------------------------------------------------ frames
pb.addEventListener("frame", (e) => {
  const { snapshot, prev, progress } = e.detail;
  app.prevIx = prev && prev.month === snapshot.month ? indexSnapshot(prev) : null;
  app.ix = indexSnapshot(snapshot);
  $("loading").hidden = true;
  world.setFrame(snapshot, prev, app.ix, app.prevIx);
  app.story = phaseStory(app.ix, app.prevIx);
  if (progress === 0 && snapshot.phase !== "ready") {
    startPhaseClock(snapshot);
    const notes = notableEvents(app.ix, app.prevIx);
    if (notes.length) {
      const key = `${snapshot.month}:${snapshot.day}`;
      const list = app.notables.get(key) || [];
      for (const n of notes) if (!list.some((x) => x.text === n.text)) list.push(n);
      app.notables.set(key, list);
      UI.pushTicker(app, notes);
    }
  } else {
    clock.running = false;
    app.progress = 1;
  }
  if (snapshot.phase === "environment" && snapshot.day === 1)
    $("month-card").hidden = true;
  if (app.sel.agent !== null && !app.ix.agents.get(app.sel.agent)) app.sel.agent = null;
  buildDayIndex();
  renderAll();
  loadDayFrames();
  if (pb.isFinished() && pb.atEdge && pb.playing) pb.pause();
});
pb.addEventListener("status", () => updateTransport());
pb.addEventListener("frames", () => {
  if (app.ix) {
    UI.renderEdge(app);
    UI.renderTimeline(app);
  }
});
pb.addEventListener("error", (e) => toast(e.detail.message, true));

function buildDayIndex() {
  app.dayIndex = new Map();
  const f = pb.frames[pb.cur];
  if (!f) return;
  for (
    let i = pb.cur;
    i >= 0 && pb.frames[i]?.month === f.month && pb.frames[i]?.day === f.day;
    i--
  )
    app.dayIndex.set(pb.frames[i].phase, i);
  for (
    let i = pb.cur + 1;
    i < pb.frames.length &&
    pb.frames[i]?.month === f.month &&
    pb.frames[i]?.day === f.day;
    i++
  )
    app.dayIndex.set(pb.frames[i].phase, i);
}

let dayToken = 0;
async function loadDayFrames() {
  const token = ++dayToken;
  const needed = app.sel.agent !== null || app.tab === "activity";
  if (!needed) {
    app.dayFrames = null;
    return;
  }
  try {
    const frames = await pb.dayFrames(pb.cur);
    if (token !== dayToken) return;
    app.dayFrames = frames;
    UI.renderInspector(app);
  } catch {}
}

function renderAll() {
  if (!app.ix) return;
  UI.renderVitals(app);
  UI.renderLedger(app);
  UI.renderConsole(app);
  UI.renderInspector(app);
  wireLedger();
  if (app.view === "council") council.render();
  if (app.view === "chronicle") renderChronicle(app);
  if (app.view === "results") renderResults(app);
  if (app.view === "rulebook") renderRulebook(app);
  $("menu-meta").textContent =
    `Seed ${app.ix.s.seed}, ${fmt(app.ix.s.agents.length)} Amoeboids`;
  updateTransport();
  updateInsets();
}
function wireLedger() {
  $("ledger")
    .querySelectorAll("[data-plot]")
    .forEach((b) => (b.onclick = () => app.actions.selectPlot(Number(b.dataset.plot))));
}

function updateTransport() {
  const play = $("play");
  const playing = pb.playing;
  play.classList.toggle("playing", playing);
  play.innerHTML = icon(playing ? "pause" : "play");
  play.setAttribute("aria-label", playing ? "Pause" : "Play");
  play.title = playing ? "Pause (Space)" : "Play (Space)";
  const can = pb.canAdvance;
  play.disabled = !playing && !can;
  $("step").disabled = !can;
  $("next-day").disabled = !can;
  if (app.ix) UI.renderEdge(app);
}

function updateInsets() {
  const ledgerVisible = getComputedStyle($("ledger")).display !== "none";
  const inspecting = !$("inspector").hidden;
  const narrow = innerWidth <= 760;
  world?.setInsets({
    top: $("stage").getBoundingClientRect().top + 60,
    left: ledgerVisible ? $("ledger").offsetWidth + 12 : 0,
    right: inspecting && !narrow ? $("inspector").offsetWidth + 12 : 0,
    bottom:
      $("console").offsetHeight + 12 + (inspecting && narrow ? innerHeight * 0.4 : 0),
  });
}

// ------------------------------------------------------------------ actions
app.actions = {
  refresh: () => UI.renderInspector(app),
  setTab(tab) {
    // "Laws" lives inside the Assembly tab.
    if (tab === "laws") {
      tab = "assembly";
      app.assemblyMode = "laws";
    }
    app.tab = tab;
    UI.renderInspector(app);
    if (tab === "activity") loadDayFrames();
  },
  selectPlot(id) {
    if (app.view !== "world") app.actions.setView("world");
    if (app.sel.plot !== id) app.res.team = null;
    if (app.sel.plot === null || (id === -1) !== (app.sel.plot === -1))
      app.tab = "overview";
    app.sel = { plot: id, agent: null };
    app.backPlot = null;
    world.setSelection({ plot: id, agent: null });
    UI.renderInspector(app);
    UI.renderLedger(app);
    wireLedger();
    updateInsets();
    world.focusPlot(id);
  },
  selectAgent(id) {
    const a = app.ix.agents.get(id);
    if (!a) return;
    if (app.view !== "world") app.actions.setView("world");
    app.backPlot = app.sel.plot ?? (a.alive ? a.plot : null);
    app.sel = { plot: app.sel.plot ?? (a.alive ? a.plot : null), agent: id };
    world.setSelection({ plot: app.sel.plot, agent: id });
    app.dayFrames = null;
    UI.renderInspector(app);
    updateInsets();
    loadDayFrames();
  },
  backToPlot() {
    app.sel.agent = null;
    world.setSelection({ agent: null });
    if (app.sel.plot === null && app.backPlot !== null) app.sel.plot = app.backPlot;
    UI.renderInspector(app);
  },
  clearSelection() {
    app.sel = { plot: null, agent: null };
    world.setSelection({ plot: null, agent: null });
    world.fit();
    UI.renderInspector(app);
    UI.renderLedger(app);
    wireLedger();
    updateInsets();
  },
  openMotion(id) {
    app.actions.setView("council");
    council.select(id);
  },
  /** Opens or folds a law card in place; from elsewhere, jumps to it first. */
  toggleLaw(key, force = false) {
    const elsewhere = app.tab !== "assembly" || app.assemblyMode !== "laws";
    app.tab = "assembly";
    app.assemblyMode = "laws";
    app.openLaw = !force && !elsewhere && app.openLaw === key ? null : key;
    UI.renderInspector(app);
    if (app.openLaw)
      requestAnimationFrame(() =>
        $("inspector")
          .querySelector("[data-open-law], .deccard.open")
          ?.scrollIntoView({
            block: "nearest",
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
          }),
      );
  },
  openLaw(scope, key, plot) {
    if (plot === null || plot === undefined || plot < 0) return;
    if (app.view !== "world") app.actions.setView("world");
    if (app.sel.plot !== plot || app.sel.agent !== null) app.actions.selectPlot(plot);
    app.actions.toggleLaw(`${scope}:${key}`, true);
  },
  toggleSection(id) {
    if (app.collapsed.has(id)) app.collapsed.delete(id);
    else app.collapsed.add(id);
    storage.set("amoeboids.folded", JSON.stringify([...app.collapsed]));
    UI.renderInspector(app);
  },
  toggleWide() {
    app.wide = !app.wide;
    storage.set("amoeboids.wide", app.wide ? "1" : "0");
    setInspectorWidth(app.wide ? wideWidth() : COMPACT_WIDTH, true);
  },
  showPlotOnMap(id) {
    app.actions.selectPlot(id);
    app.actions.setTab("assembly");
  },
  setView(view) {
    app.view = view;
    document.body.dataset.view = view;
    for (const v of ["council", "chronicle", "results", "rulebook"])
      $(`view-${v}`).hidden = v !== view;
    document.querySelectorAll(".view-tab").forEach((b) => {
      const on = b.dataset.view === view;
      b.classList.toggle("active", on);
      if (on) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    if (view === "council") council.render();
    if (view === "chronicle") renderChronicle(app);
    if (view === "results") renderResults(app);
    if (view === "rulebook") renderRulebook(app, true);
  },
  /** Opens the rulebook at one law, decision or the voting procedure. */
  openRule(key) {
    app.rule = key;
    app.actions.setView("rulebook");
  },
  toLatest() {
    pb.seek(Math.min(pb.max, pb.liveIndex ?? pb.max));
  },
  async watchDay(month, day) {
    const i = pb.frames.findIndex((f) => f && f.month === month && f.day === day);
    if (i < 0) return;
    app.actions.setView("world");
    await pb.seek(Math.max(0, i - 1));
    pb.play();
  },
  async nightOf(month, day) {
    const i = pb.frames.findIndex(
      (f) => f && f.month === month && f.day === day && f.phase === "close",
    );
    if (i < 0) return;
    app.actions.setView("world");
    await pb.seek(i);
  },
  async createWorld(input) {
    pb.pause();
    const result = await api("/runs", input);
    await openRunData(result.id, result);
  },
  async openRun(id) {
    pb.pause();
    await openRunData(id);
  },
};

async function openRunData(id, response) {
  app.notables = new Map();
  app.sel = { plot: null, agent: null };
  app.tab = "overview";
  app.meteorShown = "";
  $("month-card").hidden = true;
  $("ticker").innerHTML = "";
  world.setSelection({ plot: null, agent: null });
  world.layout = null;
  await pb.open(id, response);
  storage.set("amoeboids.society.active", id);
  try {
    const url = new URL(location.href);
    url.searchParams.set("run", id);
    history.replaceState(null, "", url);
  } catch {}
}

function togglePlay() {
  if (pb.playing) {
    pb.pause();
    clock.running = false;
  } else {
    if (!pb.canAdvance) return;
    pb.play();
    resumeClock();
  }
  updateTransport();
}
async function stepOnce() {
  pb.pause();
  await pb.advance();
}
async function skipToNight() {
  pb.pause();
  const toGo = Math.max(1, PHASES.length - 1 - phaseIndex(app.ix.s.phase));
  await fastForward((f, i) => f.phase === "close", toGo, false);
}
async function fastForward(until, estimate, dialog = true) {
  const dlg = $("progress-dialog");
  let shown = false;
  const timer = dialog
    ? setTimeout(() => {
        shown = true;
        dlg.innerHTML = `<div class="dlg-head"><h2 id="progress-title">Simulating</h2></div><div class="dlg-body"><p class="note" id="ff-label">Running the engine ahead…</p><div class="progress"><i id="ff-bar" style="width:0%"></i></div></div><div class="dlg-foot"><p>Every phase is still recorded for replay.</p><button class="btn" id="ff-cancel">Stop here</button></div>`;
        $("ff-cancel").onclick = () => pb.cancelFastForward();
        dlg.showModal();
      }, 250)
    : null;
  try {
    await pb.fastForward(
      until,
      (steps) => {
        if (!shown) return;
        const f = pb.frames.at(-1);
        $("ff-label").textContent = f ? `Month ${f.month}, day ${f.day}` : "";
        if (estimate)
          $("ff-bar").style.width = `${Math.min(100, (steps / estimate) * 100)}%`;
      },
      estimate,
    );
  } finally {
    clearTimeout(timer);
    if (dlg.open) dlg.close();
  }
}

// ------------------------------------------------------------------ setup
function buildSpeed() {
  $("speed").innerHTML = SPEEDS.map(
    (s) =>
      `<button role="radio" data-speed="${s.id}" aria-checked="${s.id === app.speed}" title="${s.label} speed">${s.label}</button>`,
  ).join("");
  $("speed")
    .querySelectorAll("button")
    .forEach((b) => (b.onclick = () => setSpeed(b.dataset.speed)));
}
function setSpeed(id) {
  if (!SPEEDS.some((s) => s.id === id)) return;
  const progress = app.progress;
  app.speed = id;
  storage.set("amoeboids.speed", id);
  if (app.ix) clock.duration = speedMs() * phaseWeight(app.ix.s);
  clock.start = performance.now() - progress * clock.duration;
  $("speed")
    .querySelectorAll("button")
    .forEach((b) => b.setAttribute("aria-checked", String(b.dataset.speed === id)));
}

// ------------------------------------------------------------------ inspector width
const COMPACT_WIDTH = 424;
const wideWidth = () => Math.round(Math.min(900, innerWidth * 0.6));
function maxWidth() {
  const ledger =
    getComputedStyle($("ledger")).display !== "none" ? $("ledger").offsetWidth + 24 : 0;
  return Math.max(COMPACT_WIDTH, innerWidth - ledger - 160);
}
function setInspectorWidth(px, refocus = false) {
  const w = Math.round(Math.max(340, Math.min(maxWidth(), px)));
  document.documentElement.style.setProperty("--inspector", `${w}px`);
  app.inspectorWidth = w;
  app.wide = w > COMPACT_WIDTH + 80;
  UI.renderInspector(app);
  updateInsets();
  if (refocus && app.sel.plot !== null) world.focusPlot(app.sel.plot);
}
function bindInspectorHandle() {
  const handle = $("insp-handle");
  let drag = null;
  handle.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, w: $("inspector").offsetWidth };
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing");
  });
  handle.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const w = Math.max(340, Math.min(maxWidth(), drag.w + (drag.x - e.clientX)));
    document.documentElement.style.setProperty("--inspector", `${w}px`);
  });
  handle.addEventListener("pointerup", (e) => {
    if (!drag) return;
    document.body.classList.remove("resizing");
    const w = drag.w + (drag.x - e.clientX);
    drag = null;
    setInspectorWidth(w, true);
    storage.set("amoeboids.inspector", String(app.inspectorWidth));
    storage.set("amoeboids.wide", app.wide ? "1" : "0");
  });
  handle.addEventListener("dblclick", () => app.actions.toggleWide());
  const saved = Number(storage.get("amoeboids.inspector"));
  if (app.wide) setInspectorWidth(saved > COMPACT_WIDTH + 80 ? saved : wideWidth());
}

function bind() {
  world = new World($("world"), $("plaques"), {
    onPlot: (id) => app.actions.selectPlot(id),
    onAgent: (id) => app.actions.selectAgent(id),
    onEmpty: () => {
      if (app.sel.plot !== null || app.sel.agent !== null) app.actions.clearSelection();
    },
    onHover: (hit, x, y) => {
      const t = $("tooltip");
      if (!hit || hit.agent === undefined) {
        t.hidden = true;
        return;
      }
      const a = app.ix?.agents.get(hit.agent);
      if (!a) return;
      t.innerHTML = `<b>${esc(a.name)}</b><br><span style="color:var(--ink-3)">Body ${fmt(a.body, 1)}, mind ${fmt(a.mind, 1)}, ${fmt(a.food)} carrots</span>`;
      t.style.left = `${Math.min(x + 14, innerWidth - 220)}px`;
      t.style.top = `${y - 46}px`;
      t.hidden = false;
    },
  });
  bindInspectorHandle();
  UI.buildRail(async (phase) => {
    const i = app.dayIndex.get(phase);
    if (i === undefined) return;
    pb.pause();
    await pb.seek(i);
  });
  buildSpeed();
  $("play").onclick = togglePlay;
  $("step").onclick = stepOnce;
  $("next-day").onclick = skipToNight;
  $("zoom-in").onclick = () => world.zoomBy(1);
  $("zoom-out").onclick = () => world.zoomBy(-1);
  $("zoom-fit").onclick = () => world.fit();
  document
    .querySelectorAll(".view-tab")
    .forEach((b) => (b.onclick = () => app.actions.setView(b.dataset.view)));
  // Timeline scrubbing.
  const track = $("track");
  const seekFromEvent = (e) => {
    const r = track.getBoundingClientRect();
    const k = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const range = app.trackRange;
    if (!range) return;
    const index = Math.min(range.end, range.start + Math.round(k * (range.total - 1)));
    pb.pause();
    pb.seek(index);
  };
  let scrubbing = false;
  track.addEventListener("pointerdown", (e) => {
    scrubbing = true;
    track.setPointerCapture(e.pointerId);
    seekFromEvent(e);
  });
  track.addEventListener("pointermove", (e) => scrubbing && seekFromEvent(e));
  track.addEventListener("pointerup", () => (scrubbing = false));
  // Menu.
  const menu = $("menu"),
    menuButton = $("menu-button");
  const closeMenu = () => {
    menu.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
  };
  menuButton.onclick = (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    menuButton.setAttribute("aria-expanded", String(!menu.hidden));
  };
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target)) closeMenu();
  });
  menu.querySelectorAll("[data-action]").forEach(
    (b) =>
      (b.onclick = () => {
        closeMenu();
        const a = b.dataset.action;
        if (a === "new-world") setup.open("world");
        if (a === "behaviours") setup.open("teams");
        if (a === "saved") setup.openSaved();
        if (a === "guide") setup.openGuide();
        if (a === "export" && pb.id) location.href = `/api/society/runs/${pb.id}/export`;
        if (a === "to-meteor")
          fastForward((f) => f.meteor, (app.ix.s.settings.days - app.ix.s.day + 1) * 8);
      }),
  );
  menu.insertAdjacentHTML(
    "afterbegin",
    `<button data-action="to-meteor">Skip to the end of the month</button>`,
  );
  menu.querySelector('[data-action="to-meteor"]').onclick = () => {
    closeMenu();
    fastForward((f) => f.meteor, (app.ix.s.settings.days - app.ix.s.day + 1) * 8);
  };
  // Keyboard.
  document.addEventListener("keydown", (e) => {
    if (document.querySelector("dialog[open]")) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
    const onButton = e.target.closest?.("button, a, summary");
    if (e.code === "Space" && !onButton) {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "ArrowRight" && !onButton?.closest?.('[role="tablist"]')) {
      e.preventDefault();
      if (e.shiftKey) skipToNight();
      else stepOnce();
    } else if (e.key === "ArrowLeft" && !onButton?.closest?.('[role="tablist"]')) {
      e.preventDefault();
      pb.pause();
      pb.seek(pb.cur - 1);
    } else if (
      e.key === "Escape" &&
      app.openLaw &&
      app.tab === "assembly" &&
      !$("inspector").hidden
    ) {
      app.openLaw = null;
      UI.renderInspector(app);
    } else if (e.key === "Escape") {
      if (!menu.hidden) closeMenu();
      else if (app.view !== "world") app.actions.setView("world");
      else if (app.sel.agent !== null && app.sel.plot !== null) app.actions.backToPlot();
      else app.actions.clearSelection();
    } else if (/^[0-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey && app.ix) {
      const n = Number(e.key);
      if (n === 0) app.actions.selectPlot(-1);
      else if (app.ix.s.plots[n - 1]) app.actions.selectPlot(app.ix.s.plots[n - 1].id);
    } else if (e.key === "]" || e.key === "[") {
      const i = SPEEDS.findIndex((s) => s.id === app.speed);
      setSpeed(
        SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + (e.key === "]" ? 1 : -1)))].id,
      );
    }
  });
  addEventListener("resize", () => updateInsets());
}

async function init() {
  bind();
  requestAnimationFrame(loop);
  try {
    app.config = await api("/config");
    let id = null;
    try {
      id =
        new URLSearchParams(location.search).get("run") ||
        storage.get("amoeboids.society.active");
    } catch {}
    if (id && id !== "null") {
      try {
        await openRunData(id);
        return;
      } catch (error) {
        if (error.status !== 404) throw error;
      }
    }
    // A passive page visit must not reserve a persistent server and Drive.
    $("loading").innerHTML =
      `<span class="brand-mark big" aria-hidden="true"><i></i><i></i></span><p>Create a world to begin.</p><button class="btn primary" id="start-world">New world</button>`;
    $("start-world").onclick = () => setup.open("world");
    setup.open("world");
  } catch (error) {
    $("loading").innerHTML =
      `<span class="brand-mark big" aria-hidden="true"><i></i><i></i></span><p>The world could not start: ${esc(error.message)}</p><button class="btn" id="retry">Try again</button>`;
    $("retry").onclick = () => location.reload();
  }
}

init();
