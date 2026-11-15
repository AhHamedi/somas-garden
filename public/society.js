const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const fmt = (value, decimals = 0) =>
  Number(value || 0).toLocaleString("en-GB", { maximumFractionDigits: decimals });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const copy = (value) => structuredClone(value);
const colors = ["#91ad70", "#7ca9bd", "#c7986c", "#a799ba", "#bc9292", "#b3ac6b"];
const weather = ["Sunny", "Cloudy", "Dark"];
const paths = {
  history: '<path d="M3 11a9 9 0 1 1 3 8M3 4v7h7m2-5v6l4 2"/>',
  play: '<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5v14m8-14v14" stroke-width="3"/>',
  step: '<path d="m6 5 10 7-10 7Z"/><path d="M19 5v14"/>',
  sliders:
    '<path d="M4 6h7m4 0h5M4 12h2m4 0h10M4 18h10m4 0h2"/><circle cx="13" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  agents:
    '<path d="M3 20v-2a5 5 0 0 1 10 0v2m3-8a4 4 0 0 1 5 4v3"/><circle cx="8" cy="7" r="3"/><path d="M15 4a3 3 0 1 1 0 6"/>',
  plots: '<path d="m3 8 9-5 9 5-9 5Zm0 5 9 5 9-5m-18 5 9 5 9-5"/>',
  government: '<path d="m3 8 9-5 9 5M3 9h18M5 10v8m5-8v8m4-8v8m5-8v8M3 19h18M2 22h20"/>',
  federation:
    '<circle cx="12" cy="5" r="3"/><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><path d="m10 8-3 7m7-7 3 7m-9 3h8"/>',
  carrot:
    '<path d="M16 7C9 2 4 12 3 21c9-1 19-6 13-14Z"/><path d="m14 5 3-4m1 6 5-2m-7 2 5-6M9 11l3 3m-6 1 2 2"/>',
  storage: '<path d="M4 8h16v12H4Zm-1-4h18v4H3Z"/><path d="M9 12h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  cloud: '<path d="M6 19a5 5 0 1 1 .7-9.9 6 6 0 0 1 11.6 1.7A4.2 4.2 0 1 1 18 19Z"/>',
  dark: '<path d="M18 14a7 7 0 0 1-8-10 8 8 0 1 0 8 10Z"/><path d="m18 3 .5 1.5L20 5l-1.5.5L18 7l-.5-1.5L16 5l1.5-.5Z"/>',
  brain:
    '<path d="M12 5a4 4 0 0 0-7-1 4 4 0 0 0-2 7 4 4 0 0 0 2 7 4 4 0 0 0 7 1m0-14a4 4 0 0 1 7-1 4 4 0 0 1 2 7 4 4 0 0 1-2 7 4 4 0 0 1-7 1V5Z"/><path d="M5 8c3 0 3 3 3 3m11-3c-3 0-3 3-3 3M5 16c3 0 3-3 3-3m11 3c-3 0-3-3-3-3"/>',
  heart: '<path d="M12 21S1 14 2 7a5 5 0 0 1 10-1 5 5 0 0 1 10 1c1 7-10 14-10 14Z"/>',
  star: '<path d="m12 2 3 6.3 7 .9-5.1 5 1.3 7-6.2-3.3L5.8 21l1.3-6.8L2 9.2l7-.9Z"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="17" rx="3"/><path d="M7 2v6m10-6v6M3 11h18m-14 4h3m4 0h3m-10 3h3"/>',
  tent: '<path d="m2 21 10-18 10 18Zm6 0 4-8 4 8M10 1l4 4M2 21h20"/>',
  move: '<path d="M4 8h15m-5-5 5 5-5 5M20 17H5m5-5-5 5 5 5"/>',
  proposal: '<path d="M5 3h10l4 4v14H5Zm10 0v5h4M8 12h8m-8 4h6"/>',
  vote: '<path d="m8 4 5-2 3 8-5 2Zm-2 8-3 4v5h18v-5l-3-4M3 16h18m-12-3h6"/>',
  transfer: '<path d="M3 7h16m-5-4 5 4-5 4M21 17H5m5-4-5 4 5 4"/>',
  eat: '<path d="M5 2v7m3-7v7m3-7v7M5 8a3 3 0 0 0 6 0M8 11v11M18 2v20m0-20c-4 4-4 10 0 10"/>',
  close: '<path d="m5 12 5 5L20 7"/>',
  download: '<path d="M12 2v13m-5-5 5 5 5-5M3 15v6h18v-6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v3"/>',
  shield: '<path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6Z"/><path d="m8 12 3 3 5-6"/>',
};
function icon(name, cls = "") {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.proposal}</svg>`;
}
const phases = [
  ["environment", "Environment", "sun", "Weather, mind and new growth."],
  ["movement", "Movement", "move", "Agents choose where to live."],
  ["harvest", "Harvest", "carrot", "A shared field, individual choices."],
  ["proposals", "Proposals", "proposal", "Spend mind to propose change."],
  ["voting", "Voting", "vote", "Every eligible voice can be heard."],
  ["transfers", "Transfers", "transfer", "Officers act. Food changes hands."],
  ["eating", "Eating", "eat", "Eat, survive and think."],
  ["close", "Nightfall", "dark", "A day of choices becomes history."],
];
const state = {
  config: null,
  id: null,
  snapshot: null,
  live: null,
  status: "paused",
  page: "world",
  plot: 0,
  agent: null,
  tab: "overview",
  govTab: "rules",
  federation: null,
  playing: false,
  busy: false,
  historical: false,
  index: 0,
  maxIndex: 0,
  history: [],
  events: new Map(),
  timer: null,
  poll: null,
  setupTab: "world",
  draft: null,
  editTeam: 0,
  strategyMode: "simple",
  strategyDraft: null,
  agentView: false,
  privateObservation: null,
  residentSearch: "",
  residentsPage: 0,
  eventSearch: "",
  eventKind: "all",
  eventPlot: "all",
  eventPage: 0,
  lastMeteor: "",
  noticeTimer: null,
};

async function api(path, body, method = body === undefined ? "GET" : "POST") {
  const response = await fetch(`/api/society${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data.error || data.message || `Request failed (${response.status}).`,
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
function notice(message, error = false) {
  clearTimeout(state.noticeTimer);
  const el = $("status-message");
  el.hidden = false;
  el.classList.toggle("error", error);
  el.innerHTML = `<span>${esc(message)}</span><button aria-label="Dismiss message">×</button>`;
  if (error) {
    const dialog = [...document.querySelectorAll("dialog[open]")].at(-1);
    if (dialog) {
      const content = dialog.querySelector(".dialog-scroll");
      let alert = content?.querySelector(".dialog-error");
      if (content && !alert) {
        alert = document.createElement("div");
        alert.className = "dialog-error";
        alert.setAttribute("role", "alert");
        content.prepend(alert);
      }
      if (alert) {
        alert.textContent = message;
        content.scrollTop = 0;
      }
    }
  }
  el.querySelector("button").onclick = () => {
    el.hidden = true;
  };
  if (!error)
    state.noticeTimer = setTimeout(() => {
      el.hidden = true;
    }, 7000);
}
function teamColor(team) {
  const color = state.snapshot?.teams?.[team]?.color || colors[team % colors.length];
  return /^#[\da-f]{3,8}$/i.test(color || "") ? color : colors[team % colors.length];
}
function teamName(team) {
  return state.snapshot?.teams?.[team]?.name || `Team ${Number(team) + 1}`;
}
function plotByID(id) {
  return state.snapshot?.plots?.find((p) => p.id === Number(id));
}
function agentByID(id) {
  return state.snapshot?.agents?.find((a) => a.id === Number(id));
}
function plotName(id) {
  return plotByID(id)?.name || (Number(id) < 0 ? "Outside" : `Plot ${Number(id) + 1}`);
}
function titleCase(v) {
  return String(v || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
function individualName(id) {
  return agentByID(id)?.name || `Individual ${Number(id) + 1}`;
}
const powerNames = {
  entry: "Approve entry",
  exit: "Approve departure",
  sanctions: "Decide sanctions",
  applySanction: "Apply authorised sanctions",
  records: "Read records",
  distribution: "Distribute reserves",
  collection: "Collect carrots",
  donation: "Send donations",
  federationPropose: "Propose to the council",
  federationVote: "Represent the plot in votes",
  membership: "Decide federation membership",
  charter: "Approve charter changes",
  warning: "Warning",
  fine: "Carrot fine",
  lastPlace: "Harvest last",
  expulsion: "Expulsion",
};
function policyName(key, scope = "local") {
  const [base, target] = String(key).split(":");
  const def = (state.config?.catalogue || []).find(
    (p) => p.key === base && p.scope === scope,
  );
  return `${def?.name || titleCase(base)}${target !== undefined ? ` · ${individualName(target)}` : ""}`;
}
function proposalName(p) {
  const input = p.input || p;
  if (["policy", "federationPolicy", "repeal", "federationRepeal"].includes(input.kind))
    return `${input.kind.includes("epeal") ? "Repeal " : ""}${policyName(input.key, p.federation >= 0 ? "federation" : "local")}`;
  if (input.kind === "office") return `Appoint ${individualName(input.target)}`;
  if (input.kind === "removeOffice")
    return `Remove ${individualName(input.target)} from office`;
  if (input.kind === "sanction")
    return `${powerNames[input.sanction] || titleCase(input.sanction)} · ${individualName(input.target)}`;
  return p.title || titleCase(input.kind || "Proposal");
}
function tag(text, kind = "") {
  return `<span class="tag ${kind}">${esc(text)}</span>`;
}
function pledgeTotal(a) {
  return Object.values(a?.pledges || {}).reduce((n, v) => n + Number(v || 0), 0);
}
function eligibleResidents(plot) {
  return (state.snapshot?.agents || []).filter((a) => a.alive && a.plot === plot);
}
function visibleAtSnapshot(e) {
  const s = state.snapshot;
  if (!s) return false;
  if (e.month !== s.month) return e.month < s.month;
  if (e.day !== s.day) return e.day < s.day;
  return (
    phases.findIndex((p) => p[0] === e.phase) <= phases.findIndex((p) => p[0] === s.phase)
  );
}
function logEvents(events = []) {
  for (const e of events) state.events.set(`${e.month}:${e.id}`, e);
}

function ingest(data, historical = false) {
  const snapshot = data.snapshot || data;
  if (!snapshot?.plots) return;
  const previous = state.snapshot;
  state.migrations = [];
  if (previous && previous.month === snapshot.month && snapshot.phase === "movement") {
    const before = new Map(previous.agents.map((a) => [a.id, a.plot]));
    const routes = new Map();
    for (const a of snapshot.agents) {
      const from = before.get(a.id);
      if (a.alive && from !== undefined && from !== a.plot) {
        const key = `${from}:${a.plot}`;
        const route = routes.get(key) || { from, to: a.plot, count: 0 };
        route.count++;
        routes.set(key, route);
      }
    }
    state.migrations = [...routes.values()];
  }
  state.snapshot = snapshot;
  if (!historical) {
    state.live = snapshot;
    state.status = data.status || (snapshot.done ? "complete" : "paused");
    state.id = data.id || state.id;
    state.index = data.index ?? data.frameIndex ?? data.progress?.index ?? state.index;
    state.maxIndex = Math.max(state.maxIndex, state.index);
    logEvents(snapshot.events || []);
    try {
      localStorage.setItem("amoeboids.society.active", state.id);
      const url = new URL(location.href);
      url.searchParams.set("run", state.id);
      history.replaceState(null, "", url);
    } catch {}
  }
  state.historical = historical;
  $("map-loading").hidden = true;
  if (!snapshot.plots.some((p) => p.id === state.plot) && state.plot >= 0)
    state.plot = snapshot.plots[0]?.id ?? 0;
  if (state.agent !== null && !agentByID(state.agent)) state.agent = null;
  render();
  const meteorKey = `${snapshot.month}:${snapshot.absoluteDay}`;
  if (snapshot.meteor && previous && meteorKey !== state.lastMeteor && !historical) {
    state.lastMeteor = meteorKey;
    $("meteor-overlay").querySelector("h2").textContent = snapshot.done
      ? "A world of experience."
      : "The world begins again.";
    $("meteor-overlay").querySelector("p").textContent = snapshot.done
      ? "The final month is complete. Explore what this world became."
      : "Everything is renewed. Their memories remain.";
    $("meteor-overlay").hidden = false;
    setTimeout(
      () => {
        $("meteor-overlay").hidden = true;
      },
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 800 : 2600,
    );
  }
}

async function createWorld(input) {
  pauseLocal();
  state.busy = true;
  updateTransport();
  try {
    if (state.status === "running" && state.id) await api(`/runs/${state.id}/pause`, {});
    const result = await api("/runs", input);
    state.events.clear();
    state.snapshot = null;
    state.history = [];
    state.index = 0;
    state.maxIndex = 0;
    state.agent = null;
    state.plot = 0;
    state.tab = "overview";
    state.lastMeteor = "";
    state.historical = false;
    state.privateObservation = null;
    ingest(result);
    await loadHistory();
    $("setup-dialog").close();
  } catch (error) {
    notice(error.message, true);
  } finally {
    state.busy = false;
    updateTransport();
  }
}
async function step(count = 1) {
  if (
    state.busy ||
    !state.id ||
    ["running", "archived"].includes(state.status) ||
    state.live?.done
  )
    return;
  if (state.historical) returnToLive();
  state.busy = true;
  updateTransport();
  try {
    ingest(await api(`/runs/${state.id}/step`, { count }));
    if (state.live?.done) pauseLocal();
  } catch (error) {
    pauseLocal();
    notice(error.message, true);
  } finally {
    state.busy = false;
    updateTransport();
  }
}
function pauseLocal() {
  state.playing = false;
  clearTimeout(state.timer);
  state.timer = null;
  updateTransport();
}
async function togglePlay() {
  if (state.status === "running") {
    await api(`/runs/${state.id}/pause`, {});
    state.status = "paused";
    stopPolling();
    ingest(await api(`/runs/${state.id}`));
    await loadHistory();
    return;
  }
  if (state.playing) {
    pauseLocal();
    await loadHistory();
    return;
  }
  if (state.live?.done || state.status === "archived") return;
  state.playing = true;
  updateTransport();
  const tick = async () => {
    if (!state.playing) return;
    await step();
    if (state.playing) state.timer = setTimeout(tick, Number($("speed-select").value));
  };
  await tick();
}
async function runUntil(until) {
  if (!state.id || state.busy || state.live?.done || state.status === "archived") return;
  pauseLocal();
  returnToLive();
  state.busy = true;
  updateTransport();
  try {
    ingest(await api(`/runs/${state.id}/run`, { until }));
    state.status = "running";
    updateTransport();
    startPolling();
  } catch (error) {
    notice(error.message, true);
  } finally {
    state.busy = false;
    updateTransport();
  }
}
function stopPolling() {
  clearTimeout(state.poll);
  state.poll = null;
}
function startPolling() {
  stopPolling();
  const poll = async () => {
    try {
      const result = await api(`/runs/${state.id}`);
      ingest(result);
      if (result.error) notice(result.error, true);
      if (state.status === "running") state.poll = setTimeout(poll, 650);
      else {
        await loadHistory();
        await loadEvents();
      }
    } catch (error) {
      state.status = "paused";
      notice(error.message, true);
      updateTransport();
    }
  };
  state.poll = setTimeout(poll, 300);
}
async function loadHistory() {
  if (!state.id) return;
  try {
    const data = await api(`/runs/${state.id}/history`);
    state.history = data.frames || [];
    state.maxIndex = state.history.at(-1)?.index ?? state.maxIndex;
    updateTransport();
    if (state.page === "results") renderResults();
  } catch {
    /* Snapshot playback remains usable if history is temporarily unavailable. */
  }
}
async function loadEvents() {
  if (!state.id) return;
  try {
    const data = await api(`/runs/${state.id}/events`);
    logEvents(data.events || []);
    if (state.page === "chronicle") renderChronicle();
  } catch {
    /* Current snapshot events remain available. */
  }
}
async function seek(index) {
  if (!state.id) return;
  pauseLocal();
  if (state.status === "running") return;
  try {
    const data = await api(`/runs/${state.id}/frames/${index}`);
    state.index = Number(index);
    ingest(data, true);
  } catch (error) {
    notice(error.message, true);
  }
}
function returnToLive() {
  if (!state.live) return;
  state.snapshot = state.live;
  state.historical = false;
  state.index = state.maxIndex;
  render();
}

function render() {
  const s = state.snapshot;
  if (!s) return;
  $("seed-label").textContent = `SEED ${s.seed}`;
  $("world-state").textContent = state.historical
    ? "EXPLORING THE PAST"
    : state.status === "archived"
      ? "A PRESERVED WORLD"
      : s.done
        ? "A YEAR OF EXPERIENCE"
        : state.status === "running" || state.playing
          ? "A WORLD IN MOTION"
          : s.phase === "ready"
            ? "READY TO BEGIN"
            : "PAUSED FOR A CLOSER LOOK";
  const titles = {
    world: [
      s.done ? "Every ending, a beginning." : "A world taking shape.",
      "Individual choices. Shared consequences.",
    ],
    chronicle: ["The story of this world.", "Follow the choices that shape a society."],
    results: [
      "Experience, over time.",
      `A record of outcomes. ${s.settings.months} chances to adapt.`,
    ],
  };
  $("page-title").textContent = titles[state.page][0];
  $("page-subtitle").textContent = titles[state.page][1];
  const stats = s.stats || {};
  const metrics = [
    [
      "agents",
      stats.alive ?? s.agents?.filter((a) => a.alive).length,
      "living amoeboids",
    ],
    ["plots", s.plots.length, "shared plots"],
    [
      "government",
      stats.governments ?? s.plots.filter((p) => p.government).length,
      "governments",
    ],
    [
      "federation",
      stats.federations ?? s.federations?.filter((f) => !f.dissolved).length ?? 0,
      "federations",
    ],
  ];
  $("world-metrics").innerHTML = metrics
    .map(
      ([i, n, label]) =>
        `<div class="world-metric"><strong>${icon(i)}${fmt(n)}</strong><span>${label}</span></div>`,
    )
    .join("");
  $("team-legend").innerHTML = s.teams
    .map(
      (t, i) =>
        `<span class="legend-item"><i class="color-dot" style="--team-color:${teamColor(i)}"></i>${esc(t.name)}</span>`,
    )
    .join("");
  $("outside-count").textContent = fmt(
    s.agents.filter((a) => a.alive && a.plot < 0).length,
  );
  if (state.page === "world") {
    renderMap();
    renderInspector();
  }
  if (state.page === "chronicle") renderChronicle();
  if (state.page === "results") renderResults();
  $("date-label").innerHTML = `Month ${s.month} <span>/ ${s.settings.months}</span>`;
  $("day-label").textContent = `Day ${s.day} of ${s.settings.days}`;
  const current = phases.findIndex((p) => p[0] === s.phase);
  $("phase-track").innerHTML = phases
    .map(
      ([id, name, symbol], i) =>
        `<div class="phase ${i === current ? "active" : i < current ? "done" : ""}" title="${esc(phases[i][3])}" ${i === current ? 'aria-current="step"' : ""}><span class="phase-icon">${icon(symbol)}</span><span>${name}</span></div>`,
    )
    .join("");
  $("phase-explainer").textContent = phases[current]?.[3] || "The world is ready.";
  $("footer-status").textContent = state.historical
    ? "Viewing a recorded moment. Agent decisions are unchanged."
    : state.status === "archived"
      ? "Saved replay. Create a new world to run another simulation."
      : s.done
        ? "Run complete. Explore the year in Results."
        : "A sandbox for collective behaviour.";
  updateTransport();
}

function updateTransport() {
  const active = state.playing || state.status === "running";
  $("play-button").innerHTML =
    `${icon(active ? "pause" : "play")}<span>${active ? "Pause" : "Play"}</span>`;
  $("play-button").disabled =
    !state.id ||
    (state.busy && !active) ||
    ((!!state.live?.done || state.status === "archived") && !active);
  for (const id of ["step-button", "day-button", "month-button", "year-button"])
    $(id).disabled =
      !state.id ||
      state.busy ||
      active ||
      !!state.live?.done ||
      state.status === "archived";
  $("export-button").disabled = !state.id || active;
  $("timeline").max = state.maxIndex;
  $("timeline").value = state.historical ? state.index : state.maxIndex;
  $("timeline").disabled = !state.maxIndex || active;
  $("timeline-label").textContent = state.historical ? `Frame ${state.index}` : "Live";
  $("live-button").hidden = !state.historical;
  const loader = $("atlas").querySelector(".running-progress");
  if (active && !loader)
    $("atlas").insertAdjacentHTML(
      "afterbegin",
      '<div class="running-progress" aria-label="Simulation running"></div>',
    );
  if (!active) loader?.remove();
}

function terrain(plot) {
  const residents = eligibleResidents(plot.id);
  const counts = state.snapshot.teams.map(
    (_, i) => residents.filter((a) => a.team === i).length,
  );
  const ratio = clamp(plot.stock / Math.max(1, plot.capacity), 0, 1);
  const palette =
    plot.weather === 2
      ? ["#c7ceba", "#b2bea0", "#9cae8a"]
      : plot.weather === 1
        ? ["#d0dabc", "#bdcfa7", "#a5bd8d"]
        : ["#dce3b9", "#c8d79e", "#afc68c"];
  const coords = [
    [48, 52],
    [72, 40],
    [100, 43],
    [128, 39],
    [152, 49],
    [166, 64],
    [139, 70],
    [114, 62],
    [87, 66],
    [63, 73],
    [100, 82],
    [133, 88],
    [75, 89],
    [157, 83],
    [45, 91],
    [118, 32],
    [181, 77],
    [92, 30],
  ];
  const carrots = coords
    .slice(0, Math.ceil(ratio * 15))
    .map(
      ([x, y], i) =>
        `<g transform="translate(${x} ${y}) rotate(${((i % 3) - 1) * 12})"><path d="M-2 1 0 8 3 1Z" fill="#cb9560"/><path d="M0 2q-5-6-4-7 4 0 4 5 0-6 4-7 2 4-3 8" fill="#819c5a"/></g>`,
    )
    .join("");
  let offset = 0;
  const creatures = counts
    .map((n, t) => {
      const visible = n
        ? Math.max(
            1,
            Math.round(
              (n / Math.max(1, residents.length)) * Math.min(13, residents.length),
            ),
          )
        : 0;
      return Array.from({ length: visible }, () => {
        const idx = offset++;
        const x = 47 + ((idx * 29 + t * 11) % 130),
          y = 86 + ((idx * 11) % 22);
        return `<g class="island-creature" transform="translate(${x} ${y})"><ellipse cx="0" cy="6" rx="6" ry="2" fill="#657343" opacity=".13"/><path d="M-6 0c-1-8 11-10 12-1 1 8-12 9-12 1" fill="${teamColor(t)}"/><circle cx="-2" cy="-1" r="1.2" fill="#fffef5"/><circle cx="2.5" cy="-1" r="1.2" fill="#fffef5"/><path d="M-1 3h2" stroke="#53654a" stroke-width=".6"/></g>`;
      }).join("");
    })
    .join("");
  const government = plot.government
    ? `<g transform="translate(166 52)"><path d="M-13 3h25v18h-25Z" fill="#eeeadd"/><path d="m-16 2 16-12L16 2Z" fill="#698368"/><path d="M-9 6v12m7-12v12m7-12v12m7-12v12" stroke="#c0c8b4" stroke-width="2"/><path d="M-15 22h31" stroke="#9cae8e" stroke-width="2"/><path d="M2-10v-13l11 3-11 4" stroke="#9ca688" fill="#e1bb72" stroke-width="1.2"/></g>`
    : '<g opacity=".5" transform="translate(165 58)"><ellipse rx="11" ry="6" cy="7" fill="#bac69e"/><path d="m-8 7 8-12L8 7" fill="#dce3ca" stroke="#aebd96" stroke-width="1"/></g>';
  return `<svg class="terrain-art" viewBox="0 0 230 140" aria-hidden="true"><ellipse class="island-halo" cx="115" cy="77" rx="107" ry="54"/><ellipse cx="115" cy="91" rx="98" ry="38" fill="#4e6638" opacity=".07"/><path d="M16 67c12-27 48-25 71-32s64-5 84 9 43 15 44 34-28 31-60 34-78 9-110-6S5 85 16 67Z" fill="#a5b58d"/><path d="M16 62c12-27 48-25 71-32s64-5 84 9 43 15 44 34-28 31-60 34-78 9-110-6S5 80 16 62Z" fill="${palette[0]}"/><path d="M22 68c18-19 36-14 62-17s51-18 76-3 39 15 37 26-27 18-52 21-60 5-84-4S11 82 22 68Z" fill="${palette[1]}"/><path d="M48 60c30-12 66-19 94-8 11 5 19 16 7 25-22 13-66 12-87 6S37 71 48 60Z" fill="#b7bd89" opacity=".45"/><path d="m60 56 70 14m-76-5 70 14m-76-5 62 12" stroke="#a4ae75" stroke-width=".65" opacity=".35"/>${carrots}<g fill="${palette[2]}" opacity=".8"><path d="m30 78-3-7 4 4 2-9 2 8 4-3-4 9"/><path d="m183 85-4-7 5 4 1-9 2 9 4-5-2 9"/><path d="m84 100-2-5 3 3 2-6 1 7"/></g>${government}${creatures}</svg>`;
}
function renderMap() {
  const plots = state.snapshot.plots;
  const rows = Math.ceil(plots.length / 3);
  const height = rows * 205 + 75;
  $("atlas").style.minHeight = plots.length > 6 ? `${height}px` : "";
  const layouts =
    plots.length === 1
      ? [[50, 46]]
      : plots.length === 2
        ? [
            [29, 44],
            [72, 48],
          ]
        : plots.length === 3
          ? [
              [18, 44],
              [50, 41],
              [81, 47],
            ]
          : plots.length <= 6
            ? [
                [18, 24],
                [50, 21],
                [81, 24],
                [19, 70],
                [51, 70],
                [82, 73],
              ]
            : null;
  $("plot-layer").innerHTML = plots
    .map((p, i) => {
      const pos = layouts?.[i] || [
        17 + (i % 3) * 33,
        ((110 + Math.floor(i / 3) * 205) / height) * 100,
      ];
      const n = eligibleResidents(p.id).length;
      return `<button class="plot ${state.plot === p.id && state.agent === null ? "selected" : ""}" data-plot="${p.id}" style="left:${pos[0]}%;top:${pos[1]}%;width:${24 * Math.sqrt(p.capacity / (plots.reduce((n, x) => n + x.capacity, 0) / plots.length))}%;max-width:260px;" aria-label="${esc(p.name)}, ${n} residents, ${p.stock} carrots, ${weather[p.weather] || "Sunny"}${p.government ? ", governed" : ", ungoverned"}" aria-pressed="${state.plot === p.id}"><div class="plot-label"><span class="weather-icon ${weather[p.weather]?.toLowerCase()}">${icon(["sun", "cloud", "dark"][p.weather] || "sun")}</span><span class="plot-name"><span class="plot-title">${esc(p.name)}</span><span class="plot-state">${p.government ? (p.federation >= 0 ? "Federated society" : "Governed society") : "Open commons"}</span></span></div><div class="plot-terrain">${terrain(p)}</div><div class="plot-values"><span>${icon("agents")}${n}</span><i></i><span class="field-value">${icon("carrot")}${p.stock}</span>${p.government ? `<i></i><span>${icon("storage")}${p.reserve}</span>` : ""}</div></button>`;
    })
    .join("");
  if (state.migrations?.length && plots.length <= 6) {
    const position = (id) =>
      id < 0 ? [10, 92] : layouts[plots.findIndex((p) => p.id === id)] || [50, 50];
    const lines = state.migrations
      .map((r) => {
        const [x1, y1] = position(r.from),
          [x2, y2] = position(r.to);
        return `<path d="M${x1 * 10} ${y1 * 6.5}Q${(x1 + x2) * 5 + 25} ${(y1 + y2) * 3.25 - 35} ${x2 * 10} ${y2 * 6.5}"/><text x="${(x1 + x2) * 5}" y="${(y1 + y2) * 3.25 - 18}" text-anchor="middle">${r.count} →</text>`;
      })
      .join("");
    $("plot-layer").insertAdjacentHTML(
      "afterbegin",
      `<svg class="migration-routes" viewBox="0 0 1000 650" preserveAspectRatio="none" aria-label="Recent migration routes">${lines}</svg>`,
    );
  }
  $("plot-layer")
    .querySelectorAll("[data-plot]")
    .forEach((el) =>
      el.addEventListener("click", () => selectPlot(Number(el.dataset.plot))),
    );
}
function selectPlot(id) {
  const restoreFocus = document.activeElement?.classList.contains("plot");
  state.plot = id;
  state.agent = null;
  state.federation = null;
  state.privateObservation = null;
  state.residentsPage = 0;
  state.residentSearch = "";
  renderMap();
  renderInspector();
  if (restoreFocus)
    $("plot-layer").querySelector(`[data-plot="${id}"]`)?.focus({ preventScroll: true });
}
function resource(name, symbol, amount, capacity, note, color = "") {
  return `<div class="resource-block"><div class="resource-row"><span class="resource-name">${icon(symbol)}${name}</span><strong>${fmt(amount, 1)} <small>/ ${fmt(capacity)}</small></strong></div><div class="meter ${color}"><span style="width:${clamp((amount / Math.max(capacity, 1)) * 100, 0, 100)}%"></span></div>${note ? `<p class="resource-note">${esc(note)}</p>` : ""}</div>`;
}
function renderInspector() {
  if (state.agent !== null) return renderAgent();
  if (state.federation !== null) return renderFederation();
  if (state.plot < 0) return renderOutside();
  const p = plotByID(state.plot);
  if (!p) return;
  const residents = eligibleResidents(p.id);
  const ruleCount = Object.keys(p.rules || {}).length;
  $("inspector").innerHTML =
    `<div class="inspector-header"><div class="inspector-kicker"><span class="eyebrow">PLOT ${String(p.id + 1).padStart(2, "0")}</span>${tag(p.government ? "Government formed" : "Ungoverned", p.government ? "green" : "")}</div><div class="inspector-title-row"><h2>${esc(p.name)}</h2><span class="weather-icon ${weather[p.weather]?.toLowerCase()}">${icon(["sun", "cloud", "dark"][p.weather] || "sun")}</span></div><p>${weather[p.weather] || "Sunny"} · ${fmt(p.regeneration, 1)} mind per resident each morning</p></div><div class="inspector-tabs" role="tablist">${[
      ["overview", "Overview"],
      ["residents", "Residents"],
      ["governance", "Governance"],
    ]
      .map(
        ([id, label]) =>
          `<button role="tab" aria-selected="${state.tab === id}" class="${state.tab === id ? "active" : ""}" data-inspector-tab="${id}">${label}${id === "residents" ? ` <span class="muted">${residents.length}</span>` : ""}</button>`,
      )
      .join(
        "",
      )}</div><div class="inspector-content" id="inspector-content"></div><div class="inspector-footer">${icon("eye")} Observer access · ${ruleCount} enacted ${ruleCount === 1 ? "rule" : "rules"}</div>`;
  $("inspector")
    .querySelectorAll("[data-inspector-tab]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          state.tab = b.dataset.inspectorTab;
          renderInspector();
        }),
    );
  if (state.tab === "overview") renderPlotOverview(p, residents);
  if (state.tab === "residents") renderResidents(residents);
  if (state.tab === "governance") renderGovernance(p);
}
function renderPlotOverview(p, residents) {
  const counts = state.snapshot.teams.map(
    (_, i) => residents.filter((a) => a.team === i).length,
  );
  const growth =
    (state.snapshot.settings.growth *
      Math.min(
        residents.length,
        p.capacity / state.snapshot.settings.productiveCapacity,
      ) *
      p.stock) /
    p.capacity;
  $("inspector-content").innerHTML =
    `<div class="section-label">Shared resources</div>${resource("Growing carrots", "carrot", p.stock, p.capacity, `${fmt(growth, 1)} projected growth at current stock and population`, "orange")}${resource("Government reserve", "storage", p.reserve, p.reserveCapacity, p.government ? "Stored carrots do not grow or spoil." : "Available when a government is formed.", "green")}<div class="divider"></div><div class="section-label">The residents</div><div class="resident-summary"><strong>${residents.length}</strong><span>${residents.length === 1 ? "individual" : "individuals"} sharing this plot</span></div><div class="population-strip">${counts.map((n, i) => (n ? `<span style="width:${(n / Math.max(1, residents.length)) * 100}%;--team-color:${teamColor(i)}" title="${esc(teamName(i))}: ${n}"></span>` : "")).join("")}</div><div class="team-mini-list">${counts.map((n, i) => `<div class="team-mini"><i class="color-dot" style="--team-color:${teamColor(i)}"></i>${esc(teamName(i))}<b>${n}</b></div>`).join("")}</div>${p.government ? `<div class="divider"></div><div class="section-label">Public services</div><div class="rule-row"><strong>Harvest enforcement</strong>${tag(p.hardFunded ? "Funded" : "Not funded", p.hardFunded ? "green" : "")}</div><div class="rule-row"><strong>Political records</strong>${tag(p.recordsFunded ? "Recording" : "Not recording", p.recordsFunded ? "green" : "")}</div>${p.federation >= 0 ? `<button class="subtle-link" data-fed="${p.federation}">${icon("federation")} Visit Federation Council →</button>` : ""}` : `<div class="empty-government">${icon("government")}<div><strong>No government. No imposed rules.</strong><p>Residents can spend mind to propose a government, then decide its powers together.</p></div></div>`}`;
  const recent = [...state.events.values()]
    .filter((e) => e.plot === p.id && visibleAtSnapshot(e))
    .slice(-5)
    .reverse();
  if (recent.length) {
    $("inspector-content").insertAdjacentHTML(
      "beforeend",
      `<div class="divider"></div><div class="section-label">Life on this plot</div>${recent.map(eventRecord).join("")}<button class="subtle-link" id="plot-chronicle">Follow this plot in the chronicle →</button>`,
    );
    $("plot-chronicle").onclick = () => {
      state.eventPlot = String(p.id);
      state.eventPage = 0;
      setPage("chronicle");
    };
  }
  $("inspector-content")
    .querySelector("[data-fed]")
    ?.addEventListener("click", (e) => {
      state.federation = Number(e.currentTarget.dataset.fed);
      renderInspector();
    });
}
function renderResidents(residents) {
  const matches = residents.filter((a) =>
    `${a.name} ${teamName(a.team)} ${a.id}`
      .toLowerCase()
      .includes(state.residentSearch.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(matches.length / 30));
  state.residentsPage = Math.min(state.residentsPage, pages - 1);
  $("inspector-content").innerHTML =
    `<input class="search-field" id="resident-search" type="search" value="${esc(state.residentSearch)}" placeholder="Find an individual or team…" aria-label="Search residents"/><div class="resident-list">${
      matches
        .slice(state.residentsPage * 30, (state.residentsPage + 1) * 30)
        .map(
          (a) =>
            `<button class="resident-row" data-agent="${a.id}"><span class="resident-avatar" style="--team-color:${teamColor(a.team)}"></span><span class="resident-info"><strong>${esc(a.name)}</strong><span>${esc(teamName(a.team))} · ${fmt(a.food)} carrots</span></span><span class="resident-score">${icon("star")}${fmt(a.score, 1)}</span></button>`,
        )
        .join("") ||
      `<div class="empty-state">${icon("agents")}<strong>${residents.length ? "No matching individuals" : "Room for a society"}</strong>${residents.length ? "Try another name or team." : "Amoeboids begin outside. They choose a plot during movement."}</div>`
    }</div>${matches.length > 30 ? `<div class="pagination"><button class="button secondary" id="res-prev" ${state.residentsPage === 0 ? "disabled" : ""}>←</button><span>${state.residentsPage + 1} / ${pages}</span><button class="button secondary" id="res-next" ${state.residentsPage === pages - 1 ? "disabled" : ""}>→</button></div>` : ""}`;
  $("resident-search").oninput = (e) => {
    const pos = e.target.selectionStart;
    state.residentSearch = e.target.value;
    state.residentsPage = 0;
    renderResidents(residents);
    $("resident-search").focus();
    $("resident-search").setSelectionRange(pos, pos);
  };
  $("inspector-content")
    .querySelectorAll("[data-agent]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          state.agent = Number(b.dataset.agent);
          state.agentView = false;
          renderAgent();
        }),
    );
  if ($("res-prev"))
    $("res-prev").onclick = () => {
      state.residentsPage--;
      renderResidents(residents);
    };
  if ($("res-next"))
    $("res-next").onclick = () => {
      state.residentsPage++;
      renderResidents(residents);
    };
}
function renderOutside() {
  const agents = state.snapshot.agents.filter((a) => a.alive && a.plot < 0);
  $("inspector").innerHTML =
    `<div class="inspector-header"><div class="inspector-kicker"><span class="eyebrow">BETWEEN SOCIETIES</span>${icon("tent")}</div><h2>Outside the plots</h2><p>${agents.length} individuals finding their place. Outside regeneration is ${state.snapshot.settings.outsideMind} mind per day.</p></div><div class="inspector-content" id="inspector-content"></div><div class="inspector-footer">${icon("move")} Everyone chooses their own destination.</div>`;
  renderResidents(agents);
}
function renderGovernance(p) {
  const proposals = (state.snapshot.proposals || []).filter(
    (pr) => (pr.plot ?? pr.plotId) === p.id && !(pr.federation >= 0),
  );
  const rules = Object.entries(p.rules || {});
  const pending = (state.snapshot.pending || []).filter((item) => item.plot === p.id);
  const tabs = [
    ["rules", "Rules"],
    ["votes", `Ballots ${proposals.length}`],
    ["powers", "Available powers"],
    ["officers", "Officers"],
    ["pending", `Scheduled ${pending.length}`],
  ];
  let html = `<div class="pill-nav">${tabs.map(([id, name]) => `<button data-gov-tab="${id}" class="${state.govTab === id ? "active" : ""}">${name}</button>`).join("")}</div>`;
  if (state.govTab === "rules")
    html += rules.length
      ? rules
          .map(
            ([key, value]) =>
              `<div class="rule-row"><strong>${esc(policyName(key))}</strong><span>${esc(ruleText(value, key))}</span></div>`,
          )
          .join("")
      : `<div class="empty-state">${icon("government")}<strong>${p.government ? "A government with a clean slate" : "The commons are open"}</strong>${p.government ? "Formation unlocks powers. Rules exist only after residents propose and approve them." : "Residents must first vote to form a government. There are no imposed political rules."}</div>`;
  if (state.govTab === "votes")
    html += proposals.length
      ? proposals.slice().reverse().map(proposalCard).join("")
      : `<div class="empty-state">${icon("vote")}<strong>No proposals yet</strong>Agents submit proposals during the governance phase. Passing decisions take effect next day.</div>`;
  if (state.govTab === "pending") {
    html += pending.length
      ? pending
          .map((item) => {
            const input = item.input || {};
            const label = proposalName({ input, federation: item.federation });
            const details =
              input.amount !== undefined
                ? `${fmt(input.amount)} carrots${input.target >= 0 ? ` → ${input.kind === "donation" ? plotName(input.target) : individualName(input.target)}` : ""}`
                : ruleText(input.rule || {}, input.key || "");
            return `<article class="proposal-card"><div class="proposal-head"><h4>${esc(label)}</h4>${tag("Scheduled", "green")}</div><p>${esc(details)}</p><div class="vote-counts"><span>${esc(individualName(item.actor))}${item.officer ? " · officer order" : " · approved vote"}</span><span>Applies cycle ${item.at}</span></div><p class="small muted">Authority and available resources are checked again when it executes.</p></article>`;
          })
          .join("")
      : '<p class="small muted">No approved operations are waiting for the next cycle.</p>';
  }
  if (state.govTab === "powers") {
    const catalogue = Array.isArray(state.config.catalogue)
      ? state.config.catalogue
      : Object.entries(state.config.catalogue || {}).map(([key, value]) => ({
          key,
          ...value,
        }));
    html +=
      `<div class="status-banner">${p.government ? "These powers are available to eligible agents. Every new policy needs a proposal and a vote." : "Forming a government unlocks these capabilities. Nothing is enabled automatically."}</div>` +
      catalogue
        .filter((c) => c.scope !== "federation")
        .map(
          (c) =>
            `<div class="policy-card">${icon(c.icon || "proposal")}<div><strong>${esc(c.name || c.label || titleCase(c.key || c.id))}</strong><p>${esc(c.description || c.summary || "Change this policy through a local vote.")}</p></div><span class="cost">${fmt(state.snapshot.settings.proposalCost, 1)} mind</span></div>`,
        )
        .join("");
  }
  if (state.govTab === "officers") {
    const offices = Object.entries(p.officers || {});
    html += offices.length
      ? offices
          .map(
            ([id, o]) =>
              `<button class="resident-row" data-agent="${id}"><span class="resident-avatar" style="--team-color:${teamColor(agentByID(id)?.team || 0)}"></span><span class="resident-info"><strong>${esc(agentByID(id)?.name || `Individual ${id}`)}</strong><span>${esc((o.powers || []).map((power) => powerNames[power] || titleCase(power)).join(", ") || "Scoped authority")}</span></span><span>↗</span></button>`,
          )
          .join("")
      : `<div class="empty-state">${icon("shield")}<strong>No officers appointed</strong>Residents can delegate powers and set their limits by vote.</div>`;
  }
  if (p.federation >= 0)
    html += `<button class="subtle-link" data-fed="${p.federation}">${icon("federation")} Visit Federation Council →</button>`;
  $("inspector-content").innerHTML = html;
  $("inspector-content")
    .querySelectorAll("[data-gov-tab]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          state.govTab = b.dataset.govTab;
          renderGovernance(p);
        }),
    );
  $("inspector-content")
    .querySelectorAll("[data-agent]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          state.agent = Number(b.dataset.agent);
          state.agentView = false;
          renderAgent();
        }),
    );
  $("inspector-content")
    .querySelector("[data-fed]")
    ?.addEventListener("click", (e) => {
      state.federation = Number(e.currentTarget.dataset.fed);
      renderInspector();
    });
}
function ruleText(r, key = "") {
  if (typeof r !== "object" || r === null) return String(r);
  const parts = [];
  const modeNames = {
    fixedBefore: "Fixed collection before harvest",
    fixedAfter: "Fixed collection after harvest",
    percentBefore: "Percentage before harvest",
    percentAfter: "Percentage after harvest",
    twoThirds: "At least two thirds",
    highestInfluence: "Highest influence first",
    lowestBody: "Lowest body first",
    named: "Named recipients",
    government: "Government reserve",
    collect: "Collect excess",
    appoint: "Appointed",
    remove: "Removed",
    on: "Enabled",
    off: "Disabled",
  };
  for (const [k, v] of Object.entries(r)) {
    if (
      v === null ||
      v === undefined ||
      v === false ||
      v === "" ||
      (Array.isArray(v) && !v.length)
    )
      continue;
    if (k === "mode") parts.push(modeNames[v] || titleCase(v));
    else if (k === "members") parts.push(`Scope: ${v.map(individualName).join(", ")}`);
    else if (k === "powers")
      parts.push(v.map((x) => powerNames[x] || titleCase(x)).join("; "));
    else if (k === "target") parts.push(`Recipient: ${individualName(v)}`);
    else if (k === "limit")
      parts.push(
        key === "entry" ? `Capacity: ${v} residents` : `Daily limit: ${v} carrots`,
      );
    else if (k === "expires") parts.push(`Until cycle ${v}`);
    else if (k === "exempt") parts.push(`First ${v} carrots exempt`);
    else if (k === "amount")
      parts.push(
        `${v}${String(r.mode).includes("percent") || r.mode === "percent" ? "%" : key === "exit" ? " cycles" : key.startsWith("influence") ? " influence" : " carrots"}`,
      );
    else if (k === "enabled") {
      if (key.startsWith("office")) parts.push("Self-payments permitted");
    } else if (k === "source" || k === "destination")
      parts.push(
        `${titleCase(k)}: ${v === "field" ? "growing field" : v === "reserve" ? "government reserve" : titleCase(v)}`,
      );
    else parts.push(`${titleCase(k)}: ${Array.isArray(v) ? v.join(", ") : v}`);
  }
  return parts.join(" · ") || "Enabled";
}

function proposalCard(p) {
  const input = p.input || p;
  const yes = p.yes ?? p.yesWeight ?? 0,
    no = p.no ?? p.noWeight ?? 0,
    total = p.total ?? p.totalInfluence ?? p.electorateWeight ?? yes + no;
  const status = p.status || "open";
  const awaitingElectorate = status === "open" && total === 0;
  const scheduled = ["open", "approved", "scheduled"].includes(status);
  const meteorWarning =
    scheduled && state.snapshot.day === state.snapshot.settings.days
      ? "The meteor arrives tonight. Decisions waiting for the next cycle will expire."
      : "";
  const activationLabel =
    status === "cancelled"
      ? "Cancelled"
      : meteorWarning && (p.activate || p.effectiveDay)
        ? "Expires at meteor"
        : p.activate || p.effectiveDay
          ? `Applies cycle ${p.activate || p.effectiveDay}`
          : awaitingElectorate
            ? "Electorate pending"
            : `${fmt(total)} eligible ${p.federation >= 0 ? "plots" : "influence"}`;
  const before = input.key
    ? p.federation >= 0
      ? state.snapshot.federations.find((f) => f.id === p.federation)?.rules?.[input.key]
      : plotByID(p.plot)?.rules?.[input.key]
    : null;
  const requirement = awaitingElectorate
    ? "Electorate and threshold are confirmed when voting opens."
    : p.threshold === "twoThirds"
      ? `At least ${Math.ceil((total * 2) / 3)} yes needed`
      : p.threshold === "unanimous"
        ? `All ${total} plots must support`
        : `More than ${fmt(total / 2, 1)} yes needed`;
  const positions = Object.entries(p.plotVotes || {})
    .map(
      ([id, v]) =>
        `<span>${esc(plotName(id))} ${tag(titleCase(v), v === "yes" ? "green" : v === "no" ? "red" : "")}</span>`,
    )
    .join("");
  return `<article class="proposal-card"><div class="proposal-head"><h4>${esc(proposalName(p))}</h4>${tag(titleCase(status), ["passed", "active", "activated", "scheduled"].includes(status) ? "green" : ["failed", "rejected"].includes(status) ? "red" : "")}</div><p>${input.key ? `<span class="proposal-before">Current: ${esc(before ? ruleText(before, input.key) : "No enacted rule")}</span><br>Proposed: ` : ""}${esc(input.kind === "found" ? "Unlocks governance without enacting any rules." : ruleText(input.rule || input.value || {}, input.key || ""))}${p.reason ? ` · ${esc(p.reason)}` : ""}</p><div class="vote-bar"><span class="yes" style="width:${clamp((yes / Math.max(1, total)) * 100, 0, 100)}%"></span><span class="no" style="width:${clamp((no / Math.max(1, total)) * 100, 0, 100)}%"></span></div><div class="vote-counts"><span>${awaitingElectorate ? "Awaiting voting phase" : `${fmt(yes)} yes · ${fmt(no)} no`}</span><span>${esc(activationLabel)}</span></div><div class="proposal-threshold">${esc(requirement)}</div>${meteorWarning ? `<p class="small">${esc(meteorWarning)}</p>` : ""}${positions ? `<div class="plot-votes">${positions}</div>` : ""}</article>`;
}
function renderFederation() {
  const f = (state.snapshot.federations || []).find((x) => x.id === state.federation);
  if (!f) {
    state.federation = null;
    return renderInspector();
  }
  const members = f.members || f.plots || [];
  const proposals = (state.snapshot.proposals || []).filter((p) => p.federation === f.id);
  $("inspector").innerHTML =
    `<div class="inspector-header"><button class="back-button" id="back-plot">← Back to ${esc(plotName(state.plot))}</button><div class="inspector-kicker"><span class="eyebrow">FEDERATION COUNCIL</span>${tag(f.funded ? "Funded" : "Services paused", f.funded ? "green" : "orange")}</div><h2>${esc(f.name || `Federation ${f.id + 1}`)}</h2><p>One plot, one voice. Representatives decide their plot's position.</p></div><div class="inspector-content"><div class="section-label">Member societies</div>${members.map((id) => `<button class="resident-row" data-plot="${id}">${icon("government")}<span class="resident-info"><strong>${esc(plotName(id))}</strong><span>${Object.values(plotByID(id)?.officers || {}).filter((o) => (o.powers || []).some((x) => x.includes("federation") || x.includes("represent"))).length} appointed representatives</span></span><span>↗</span></button>`).join("")}<div class="divider"></div><div class="section-label">Federation charter</div>${
      Object.entries(f.rules || {})
        .map(
          ([k, v]) =>
            `<div class="rule-row"><strong>${esc(policyName(k, "federation"))}</strong><span>${esc(ruleText(v, k))}</span></div>`,
        )
        .join("") || '<p class="small muted">No operational policies enacted.</p>'
    }<div class="divider"></div><div class="section-label">Available federation powers</div><p class="small muted">Only appointed representatives can propose here. Each member plot decides through its authorised representatives.</p>${(
      state.config.catalogue || []
    )
      .filter((c) => c.scope === "federation")
      .map(
        (c) =>
          `<details class="council-power"><summary>${esc(c.name)} <span class="muted">${fmt(state.snapshot.settings.proposalCost, 1)} mind</span></summary><p class="small muted">${esc(c.description)}</p></details>`,
      )
      .join(
        "",
      )}<div class="divider"></div><div class="section-label">Council ballots</div>${proposals.map(proposalCard).join("") || '<p class="small muted">No council proposals yet.</p>'}</div><div class="inspector-footer">${icon("federation")} Membership does not transfer local sovereignty.</div>`;
  $("back-plot").onclick = () => {
    state.federation = null;
    renderInspector();
  };
  $("inspector")
    .querySelectorAll("[data-plot]")
    .forEach((b) => (b.onclick = () => selectPlot(Number(b.dataset.plot))));
}
async function changeAgentView(value) {
  state.agentView = value;
  state.privateObservation = null;
  renderAgent();
  if (value && !state.historical && state.status !== "archived") {
    const requestAgent = state.agent,
      requestRun = state.id,
      requestToken = (state.privateRequestToken || 0) + 1;
    state.privateRequestToken = requestToken;
    try {
      const data = await api(`/runs/${state.id}/agents/${state.agent}?view=agent`);
      if (
        state.agent !== requestAgent ||
        state.id !== requestRun ||
        state.privateRequestToken !== requestToken ||
        state.historical ||
        !state.agentView
      )
        return;
      state.privateObservation = data.observation || data;
      renderAgent();
    } catch (error) {
      notice(error.message, true);
    }
  }
}
function renderAgent() {
  const a = agentByID(state.agent);
  if (!a) return;
  const events = [...state.events.values()]
    .filter(
      (e) => e.actor === a.id && e.month === state.snapshot.month && visibleAtSnapshot(e),
    )
    .slice(-12)
    .reverse();
  const s = state.snapshot.settings;
  const stats = `<div class="agent-stat-grid"><div class="agent-stat"><span>${icon("heart")} Body</span><strong>${fmt(a.body, 1)} <small>/ ${s.bodyCapacity}</small></strong></div><div class="agent-stat"><span>${icon("brain")} Mind</span><strong>${fmt(a.mind, 1)} <small>/ ${s.mindCapacity}</small></strong></div><div class="agent-stat"><span>${icon("carrot")} Stored carrots</span><strong>${fmt(a.food)} <small>/ ${s.personalCapacity}</small></strong></div><div class="agent-stat"><span>${icon("star")} Satisfaction</span><strong>${fmt(a.score, 1)}</strong></div></div><div class="rule-row"><strong>Mind pledged</strong><span>${fmt(pledgeTotal(a), 2)}</span></div><div class="rule-row"><strong>Political influence</strong><span>${a.influence}</span></div><div class="rule-row"><strong>Thought satisfaction</strong><span>${fmt(a.thought, 1)}</span></div><div class="rule-row"><strong>Mind spent organising</strong><span>${fmt(a.politicalMind, 1)}</span></div><div class="rule-row"><strong>Deaths this month</strong><span>${a.deaths}</span></div><div class="rule-row"><strong>Active days</strong><span>${a.activeDays}</span></div><div class="rule-row"><strong>Total carrots eaten</strong><span>${fmt(a.totalEaten)}</span></div><div class="rule-row"><strong>Total harvested</strong><span>${fmt(a.totalHarvested)}</span></div>`;
  const privateContent =
    state.historical || state.status === "archived"
      ? '<div class="status-banner">Private observations are available for the live world. Return to live to inspect what this individual can currently see.</div>'
      : state.privateObservation
        ? `<div class="status-banner">Observation from month ${state.privateObservation.month}, day ${state.privateObservation.day}, ${esc(titleCase(state.privateObservation.phase))}. Hidden state is excluded.<button class="subtle-link" id="refresh-observation">Refresh observation ↻</button></div><div class="section-label">Visible world</div>${(state.privateObservation.plots || []).map((p) => `<div class="rule-row"><strong>${esc(p.name)}</strong><span>${weather[p.weather]} · ${p.stock === undefined ? "Stock hidden" : `${p.stock} carrots`}</span></div>`).join("")}<div class="divider"></div><div class="section-label">Private memory</div><pre class="json-view">${esc(JSON.stringify(state.privateObservation.memory ?? {}, null, 2))}</pre><details><summary class="small muted">Complete permitted observation</summary><pre class="json-view">${esc(JSON.stringify(state.privateObservation, null, 2))}</pre></details>`
        : '<div class="empty-state">Reading the agent’s permitted observation…</div>';
  $("inspector").innerHTML =
    `<div class="inspector-header"><button class="back-button" id="back-residents">← Back to residents</button><div class="agent-top"><span class="resident-avatar" style="--team-color:${teamColor(a.team)}"></span><div><h2>${esc(a.name)}</h2><div class="muted">${esc(teamName(a.team))} · ${esc(plotName(a.plot))}</div></div></div><div class="view-toggle"><button id="observer-view" class="${!state.agentView ? "active" : ""}">Observer view</button><button id="private-view" class="${state.agentView ? "active" : ""}">Agent's own view</button></div></div><div class="inspector-content">${!a.alive ? `<div class="status-banner">This individual has died.${a.respawnAt > 0 ? ` It can return on cycle ${a.respawnAt}.` : ""} Its memory and monthly score remain.</div>` : ""}${state.agentView ? privateContent : `${stats}<div class="divider"></div><div class="section-label">Recent experience</div>${events.map(eventRecord).join("") || '<p class="small muted">No recorded actions yet.</p>'}${a.lastResult ? `<div class="status-banner">${esc(a.lastResult)}</div>` : ""}${a.error ? `<div class="status-banner">Decision error: ${esc(a.error)}</div>` : ""}`}</div><div class="inspector-footer">${icon(state.agentView ? "lock" : "eye")}${state.agentView ? "Only the information this individual receives." : "Observer access · private agent state is never shared."}</div>`;
  $("back-residents").onclick = () => {
    state.agent = null;
    state.tab = "residents";
    state.privateObservation = null;
    renderInspector();
  };
  $("observer-view").onclick = () => changeAgentView(false);
  $("private-view").onclick = () => changeAgentView(true);
  $("refresh-observation")?.addEventListener("click", () => changeAgentView(true));
}
function eventRecord(e) {
  return `<div class="record"><span class="event-dot"></span><div><time>Day ${e.day} · ${esc(titleCase(e.phase))}</time><p>${esc(e.message || titleCase(e.kind))}</p></div></div>`;
}

function setPage(page) {
  state.page = page;
  for (const id of ["world", "chronicle", "results"])
    $(id + "-page").hidden = id !== page;
  document.querySelectorAll("[data-page]").forEach((b) => {
    b.classList.toggle("active", b.dataset.page === page);
    if (b.dataset.page === page) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  render();
  if (page === "chronicle") loadEvents();
  if (page === "results") loadHistory();
}
function renderChronicle() {
  const all = [...state.events.values()].sort(
    (a, b) => b.absoluteDay - a.absoluteDay || b.id - a.id,
  );
  const kinds = [...new Set(all.map((e) => e.kind))].sort();
  const events = all.filter(
    (e) =>
      (state.eventKind === "all" || e.kind === state.eventKind) &&
      (state.eventPlot === "all" || e.plot === Number(state.eventPlot)) &&
      `${e.message} ${e.kind} ${agentByID(e.actor)?.name || ""}`
        .toLowerCase()
        .includes(state.eventSearch.toLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(events.length / 35));
  state.eventPage = Math.min(state.eventPage, pageCount - 1);
  $("chronicle-page").innerHTML =
    `<div class="section-header"><div><h2>The chronicle</h2><p>${fmt(events.length)} events · a trace of actual decisions and outcomes</p></div><div class="filters"><input id="event-search" type="search" placeholder="Find an event…" aria-label="Search events" value="${esc(state.eventSearch)}"/><select id="event-plot" aria-label="Filter events by plot"><option value="all">Every plot</option>${state.snapshot.plots.map((p) => `<option value="${p.id}" ${state.eventPlot === String(p.id) ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select><select id="event-kind" aria-label="Filter event types"><option value="all">Every event</option>${kinds.map((k) => `<option value="${esc(k)}" ${state.eventKind === k ? "selected" : ""}>${esc(titleCase(k))}</option>`).join("")}</select></div></div><table class="events-table"><thead><tr><th>When</th><th>Event</th><th>Where</th><th>What happened</th></tr></thead><tbody>${events
      .slice(state.eventPage * 35, (state.eventPage + 1) * 35)
      .map(
        (e) =>
          `<tr><td>Month ${e.month} · Day ${e.day}<br><span class="muted">${esc(titleCase(e.phase))}</span></td><td>${tag(titleCase(e.kind), /death|invalid|fail/.test(e.kind) ? "red" : /found|passed|growth/.test(e.kind) ? "green" : "")}</td><td>${esc(plotName(e.plot))}</td><td>${esc(e.message || titleCase(e.kind))}</td></tr>`,
      )
      .join(
        "",
      )}</tbody></table>${!events.length ? `<div class="empty-state">${icon("proposal")}<strong>The first page is still unwritten.</strong>Advance the world to see its decisions unfold here.</div>` : ""}<div class="pagination"><button class="button secondary" id="events-prev" ${state.eventPage === 0 ? "disabled" : ""}>← Previous</button><span>Page ${state.eventPage + 1} of ${pageCount}</span><button class="button secondary" id="events-next" ${state.eventPage === pageCount - 1 ? "disabled" : ""}>Next →</button></div>`;
  $("event-search").oninput = (e) => {
    const pos = e.target.selectionStart;
    state.eventSearch = e.target.value;
    state.eventPage = 0;
    renderChronicle();
    $("event-search").focus();
    $("event-search").setSelectionRange(pos, pos);
  };
  $("event-kind").onchange = (e) => {
    state.eventKind = e.target.value;
    state.eventPage = 0;
    renderChronicle();
  };
  $("event-plot").onchange = (e) => {
    state.eventPlot = e.target.value;
    state.eventPage = 0;
    renderChronicle();
  };
  $("events-prev").onclick = () => {
    state.eventPage--;
    renderChronicle();
  };
  $("events-next").onclick = () => {
    state.eventPage++;
    renderChronicle();
  };
}
function renderResults() {
  const s = state.snapshot,
    months = s.months || [];
  const current = s.teams.map((t, i) => {
    const agents = s.agents.filter((a) => a.team === i);
    return {
      team: i,
      name: t.name,
      score: agents.reduce((n, a) => n + a.score, 0),
      mean: agents.reduce((n, a) => n + a.score, 0) / Math.max(1, agents.length),
      deaths: agents.reduce((n, a) => n + a.deaths, 0),
    };
  });
  const ranked = current.slice().sort((a, b) => b.mean - a.mean);
  const maxMean = Math.max(1, ...ranked.map((t) => t.mean));
  const chartWidth = 560,
    chartHeight = 240,
    left = 34,
    right = 18,
    top = 15,
    bottom = 28;
  const chartMonths = months.length ? months : [{ month: s.month, teams: current }];
  const maxY = Math.max(
    10,
    ...chartMonths.flatMap((m) => (m.teams || []).map((t) => t.mean)),
  );
  const x = (m) =>
      left + ((m - 1) / Math.max(1, s.settings.months - 1)) * (chartWidth - left - right),
    y = (v) => chartHeight - bottom - (v / maxY) * (chartHeight - top - bottom);
  const chart = `<svg class="score-chart" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Average team satisfaction by month">${[0, 0.25, 0.5, 0.75, 1].map((v) => `<line x1="${left}" x2="${chartWidth - right}" y1="${y(v * maxY)}" y2="${y(v * maxY)}" stroke="#e6ebdd" stroke-dasharray="3 4"/><text x="${left - 8}" y="${y(v * maxY) + 3}" text-anchor="end">${fmt(v * maxY)}</text>`).join("")}${Array.from({ length: s.settings.months }, (_, i) => `<text x="${x(i + 1)}" y="${chartHeight - 6}" text-anchor="middle">${i + 1}</text>`).join("")}${s.teams
    .map((_, ti) => {
      const points = chartMonths.map((m) => ({
        m: m.month,
        v: (m.teams || []).find((t) => t.team === ti)?.mean || 0,
      }));
      return `<polyline points="${points.map((p) => `${x(p.m)},${y(p.v)}`).join(" ")}" fill="none" stroke="${teamColor(ti)}" stroke-width="2.2" stroke-linejoin="round"/>${points.map((p) => `<circle cx="${x(p.m)}" cy="${y(p.v)}" r="3" fill="${teamColor(ti)}"><title>${esc(teamName(ti))} · Month ${p.m}: ${fmt(p.v, 2)}</title></circle>`).join("")}`;
    })
    .join("")}</svg>`;
  $("results-page").innerHTML =
    `<div class="section-header"><div><h2>${s.settings.months === 12 ? "A year of experience" : `Experience across ${s.settings.months} ${s.settings.months === 1 ? "month" : "months"}`}</h2><p>${months.length} of ${s.settings.months} months complete · satisfaction resets, experience remains</p></div><button class="button secondary" id="results-export">${icon("download")} Download replay</button></div><div class="results-overview"><article class="chart-card"><h3>Average satisfaction per individual</h3><p class="chart-subtitle">${months.length ? "Completed monthly outcomes" : "Current month in progress"} · month along the horizontal axis</p>${chart}<div class="team-legend">${s.teams.map((t, i) => `<span class="legend-item"><i class="color-dot" style="--team-color:${teamColor(i)}"></i>${esc(t.name)}</span>`).join("")}</div></article><article class="score-card"><h3>Month ${s.month} · team comparison</h3><p class="chart-subtitle">Mean satisfaction, including individuals who died</p><div class="ranking-list">${ranked.map((t, i) => `<div class="ranking-item"><span class="rank-number">${String(i + 1).padStart(2, "0")}</span><div class="rank-team"><strong><i class="color-dot" style="--team-color:${teamColor(t.team)}"></i>${esc(t.name)}</strong><div class="rank-bar"><span style="width:${(t.mean / maxMean) * 100}%;--team-color:${teamColor(t.team)}"></span></div></div><b>${fmt(t.mean, 1)}</b></div>`).join("")}</div></article></div><div class="month-cards">${Array.from(
      { length: s.settings.months },
      (_, i) => {
        const month = months.find((m) => m.month === i + 1);
        const avg = month
          ? (month.teams || []).reduce((n, t) => n + t.mean, 0) /
            Math.max(1, month.teams?.length)
          : null;
        return `<button class="month-card" data-result-month="${i + 1}" ${month ? "" : "disabled"}><div class="eyebrow">MONTH ${String(i + 1).padStart(2, "0")}</div><strong>${avg === null ? "—" : fmt(avg, 1)}</strong><span>${month ? `${month.deaths} deaths · completed` : i + 1 === s.month ? "In progress" : "Yet to unfold"}</span></button>`;
      },
    ).join(
      "",
    )}</div><div class="diagnostic-section"><h3>Month ${s.month} · resources and participation</h3><div class="table-scroll"><table class="events-table"><thead><tr><th>Behaviour</th><th>Alive</th><th>Deaths</th><th>Carrots eaten</th><th>Mind organising</th><th>Mind thinking</th></tr></thead><tbody>${s.teams
      .map((t, i) => {
        const agents = s.agents.filter((a) => a.team === i);
        const sum = (k) => agents.reduce((n, a) => n + (a[k] || 0), 0);
        return `<tr><td><i class="color-dot" style="--team-color:${teamColor(i)}"></i> ${esc(t.name)}</td><td>${agents.filter((a) => a.alive).length}</td><td>${sum("deaths")}</td><td>${fmt(sum("totalEaten"))}</td><td>${fmt(sum("politicalMind"), 1)}</td><td>${fmt(sum("thought"), 1)}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table></div></div><p class="results-note">Memory retention makes adaptation possible; it does not prove learning. Compare the same behaviours with memory resets across multiple seeds before drawing conclusions about cooperation or improvement.</p>`;
  $("results-export").onclick = exportRun;
  $("results-page")
    .querySelectorAll("[data-result-month]")
    .forEach(
      (b) =>
        (b.onclick = async () => {
          const month = Number(b.dataset.resultMonth);
          await loadHistory();
          const frame =
            state.history
              .filter((f) => f.month === month && f.phase === "eating")
              .at(-1) || state.history.filter((f) => f.month === month).at(-1);
          if (frame) await seek(frame.index);
        }),
    );
}
function exportRun() {
  if (state.id) {
    const a = document.createElement("a");
    a.href = `/api/society/runs/${state.id}/export`;
    a.download = `amoeboids-${state.id}.json`;
    a.click();
  }
}

const settingDefs = {
  world: [
    [
      "Population and time",
      "The same behaviours can meet under different conditions.",
      [
        ["plots", "Shared plots", 1, 24, 1, "No plot belongs to a team."],
        ["copies", "Copies per team", 1, 100, 1, "Each copy has private memory."],
        ["months", "Months per run", 1, 24, 1, "A meteor resets each month."],
        ["days", "Days per month", 1, 100, 1, "One full cycle per day."],
        ["seed", "Random seed", 0, 2147483647, 1, "Repeat a seed for fair comparisons."],
      ],
    ],
    [
      "Food and survival",
      "Field stock grows. Stored food never spoils.",
      [
        ["personalCapacity", "Personal storage", 1, 1000, 1, "Carrots per individual."],
        ["harvestLimit", "Daily harvest limit", 0, 100, 1, "Before government quotas."],
        ["dailyFood", "Daily food need", 0, 100, 1, "Eating remains agent-chosen."],
        [
          "capacityPerAgent",
          "Field capacity per agent",
          1,
          1000,
          1,
          "Total capacity is divided among plots.",
        ],
        [
          "reservePerResident",
          "Government reserve scale",
          0,
          1000,
          1,
          "Per baseline resident equivalent.",
        ],
        [
          "startingStock",
          "Starting stock fraction",
          0,
          1,
          0.05,
          "0.8 means fields begin 80% full.",
        ],
      ],
    ],
    [
      "Weather and mind",
      "Weather belongs to a plot. Mind belongs to each individual.",
      [
        [
          "mindCapacity",
          "Mind capacity",
          1,
          100,
          1,
          "Pledged mind counts toward capacity.",
        ],
        [
          "startingMind",
          "Starting mind",
          0,
          100,
          1,
          "No extra sunlight on the first day.",
        ],
        [
          "outsideMind",
          "Outside regeneration",
          0,
          100,
          1,
          "Mind each day outside plots.",
        ],
        ["weatherRates.0", "Sunny regeneration", 0, 100, 1, "Per resident, per day."],
        ["weatherRates.1", "Cloudy regeneration", 0, 100, 1, "Per resident, per day."],
        ["weatherRates.2", "Dark regeneration", 0, 100, 1, "Per resident, per day."],
      ],
    ],
  ],
  advanced: [
    [
      "Ecology and recovery",
      "Physical rules remain fixed throughout the run.",
      [
        ["growth", "Growth coefficient", 0, 100, 0.1, "Carrots per productive resident."],
        [
          "productiveCapacity",
          "Capacity per productive resident",
          1,
          1000,
          1,
          "Additional residents eventually stop adding growth.",
        ],
        ["bodyCapacity", "Body capacity", 1, 100, 1, "Survival reserve."],
        [
          "respawnDelay",
          "Complete days missed after death",
          -1,
          100,
          1,
          "−1 disables ordinary respawning.",
        ],
        [
          "weatherPersistence",
          "Weather persistence",
          0,
          1,
          0.05,
          "Probability today's weather continues.",
        ],
      ],
    ],
    [
      "Individual political costs",
      "All costs are paid from each individual's own unpledged mind.",
      [
        ["proposalCost", "Proposal", 0.01, 100, 0.1, "Each accepted proposal."],
        ["voteCost", "Yes or no vote", 0, 100, 0.01, "Abstaining is free."],
        ["officerCost", "Officer order", 0, 100, 0.01, "Within a voted delegation."],
        ["readCost", "Read records", 0, 100, 0.01, "Each authorised query."],
        ["offerCost", "Food offer", 0, 100, 0.01, "Accepting or cancelling is free."],
      ],
    ],
    [
      "Institutions and services",
      "Shared costs draw proportionally from mind pledged by members.",
      [
        [
          "governmentCost",
          "Found government",
          0,
          1000,
          1,
          "One-off cost; no automatic policies.",
        ],
        ["federationCost", "Found federation", 0, 1000, 1, "Two or more governed plots."],
        ["joiningCost", "Join federation", 0, 1000, 1, "Charged to the joining plot."],
        [
          "enforcementCost",
          "Hard enforcement per resident",
          0,
          100,
          0.01,
          "Daily; unfunded quotas become soft.",
        ],
        [
          "recordsCost",
          "Records per resident",
          0,
          100,
          0.01,
          "Daily; existing records remain.",
        ],
        [
          "federationRunningCost",
          "Federation per member plot",
          0,
          100,
          0.1,
          "Only when an operational service is enabled.",
        ],
      ],
    ],
    [
      "Political boundaries",
      "These bounds apply to every institution.",
      [
        [
          "startingInfluence",
          "Starting influence",
          1,
          100,
          1,
          "New residents begin with this influence.",
        ],
        [
          "maxInfluence",
          "Maximum influence",
          1,
          100,
          1,
          "Governments may allocate up to this amount.",
        ],
        [
          "foundingWindow",
          "Federation founding window",
          1,
          100,
          1,
          "Days to collect matching approvals.",
        ],
        ["disputeWindow", "Dispute window", 1, 100, 1, "Days before the final ballot."],
        [
          "immigrationLookback",
          "Sanction lookback",
          1,
          100,
          1,
          "Days checked by immigration records.",
        ],
        ["decisionMs", "Decision time limit", 1, 10000, 1, "Milliseconds per callback."],
        [
          "memoryBytes",
          "Private memory limit",
          1024,
          16777216,
          1024,
          "Bytes per individual.",
        ],
      ],
    ],
  ],
};
function getSetting(key) {
  if (key === "seed") return state.draft.seed;
  return key.split(".").reduce((v, k) => v?.[k], state.draft.settings);
}
function setSetting(key, value) {
  if (key === "seed") {
    state.draft.seed = value;
    return;
  }
  const parts = key.split(".");
  if (parts.length === 1) state.draft.settings[key] = value;
  else state.draft.settings[parts[0]][Number(parts[1])] = value;
}
function openSetup() {
  state.draft = {
    settings: copy(state.snapshot?.settings || state.config.settings),
    teams: copy(state.snapshot?.teams || state.config.teams),
    seed: state.snapshot?.seed ?? 42,
  };
  state.setupTab = "world";
  renderSetup();
  $("setup-dialog")
    .querySelectorAll(".dialog-error")
    .forEach((el) => el.remove());
  $("setup-dialog").showModal();
}
function renderSetup() {
  document
    .querySelectorAll("[data-setup-tab]")
    .forEach((b) => b.classList.toggle("active", b.dataset.setupTab === state.setupTab));
  if (state.setupTab === "teams") {
    const policies =
      state.config.policies ||
      state.config.teams.map((t) => ({ id: t.policy, name: titleCase(t.policy) }));
    $("setup-content").innerHTML =
      `<section class="setting-section"><h3>Six behaviours. Independent lives.</h3><p class="setting-description">Choose an example, build a phased behaviour, or import a Go agent. Every copy has its own memory and makes its own decisions.</p>${state.draft.teams.map((t, i) => `<div class="team-editor"><span class="resident-avatar" style="--team-color:${/^#[\da-f]{3,8}$/i.test(t.color || "") ? t.color : colors[i % colors.length]}"></span><label><input data-team-name="${i}" value="${esc(t.name)}" maxlength="40" aria-label="Team ${i + 1} name"/><span>${t.strategyId ? "Imported Go agent" : t.builder ? "Custom visual behaviour" : esc(policyDescription(t.policy))}</span></label><select data-team-policy="${i}" aria-label="Team ${i + 1} behaviour">${policies.map((p) => `<option value="${esc(p.id || p.policy)}" ${t.policy === (p.id || p.policy) && !t.builder && !t.strategyId ? "selected" : ""}>${esc(p.name || titleCase(p.id || p.policy))}</option>`).join("")}${t.builder ? '<option value="custom" selected>Custom behaviour</option>' : ""}${t.strategyId ? '<option value="imported" selected>Imported Go agent</option>' : ""}</select><button type="button" class="button secondary" data-edit-team="${i}">Edit →</button></div>`).join("")}</section>`;
    $("setup-content")
      .querySelectorAll("[data-team-name]")
      .forEach(
        (el) =>
          (el.oninput = () => {
            state.draft.teams[Number(el.dataset.teamName)].name = el.value;
          }),
      );
    $("setup-content")
      .querySelectorAll("[data-team-policy]")
      .forEach(
        (el) =>
          (el.onchange = () => {
            if (["custom", "imported"].includes(el.value)) return;
            const t = state.draft.teams[Number(el.dataset.teamPolicy)];
            t.policy = el.value;
            delete t.builder;
            delete t.strategyId;
            renderSetup();
          }),
      );
    $("setup-content")
      .querySelectorAll("[data-edit-team]")
      .forEach((el) => (el.onclick = () => openStrategy(Number(el.dataset.editTeam))));
  } else {
    $("setup-content").innerHTML =
      settingDefs[state.setupTab]
        .map(
          ([title, desc, fields]) =>
            `<section class="setting-section"><h3>${title}</h3><p class="setting-description">${desc}</p><div class="setting-grid">${fields.map(([key, label, min, max, step, help]) => `<label class="setting-field"><span>${label}</span><input type="number" data-setting="${key}" value="${getSetting(key) ?? ""}" min="${min}" max="${max}" step="${step}" required/><small>${help}</small></label>`).join("")}</div></section>`,
        )
        .join("") +
      `<div class="setup-preview">${icon("plots")}<span>Settings define the world. Agents decide what happens in it. Creating a new world preserves the current run in your saved session history.</span></div>`;
    $("setup-content")
      .querySelectorAll("[data-setting]")
      .forEach(
        (el) =>
          (el.oninput = () => {
            if (el.value !== "") setSetting(el.dataset.setting, Number(el.value));
            updateSetupSummary();
          }),
      );
  }
  updateSetupSummary();
}
function updateSetupSummary() {
  if (!state.draft) return;
  $("setup-summary").textContent =
    `${state.draft.teams.length * state.draft.settings.copies} individuals · ${state.draft.settings.plots} plots · ${state.draft.settings.months * state.draft.settings.days} days`;
}
function policyDescription(policy) {
  const map = {
    steward: "Conserves resources and organises the commons.",
    gatherer: "Collects a private buffer of food.",
    diplomat: "Invests in institutions and cooperation.",
    wanderer: "Responds to weather and resource conditions.",
    learner: "Uses retained experience to adapt choices.",
    cooperate: "Balances food, thought and institutions.",
    cooperative: "Balances food, thought and institutions.",
    conservative: "Takes enough and protects future resources.",
    greedy: "Prioritises personal food and satisfaction.",
    thinker: "Conserves food and spends mind thinking.",
    organiser: "Invests mind in institutions and rules.",
    organizer: "Invests mind in institutions and rules.",
    migrant: "Responds to weather and local resources.",
    adaptive: "Uses personal experience to adjust choices.",
    random: "Explores with varied decisions.",
  };
  return map[policy] || "A programmable example behaviour.";
}
async function openStrategy(team) {
  state.editTeam = team;
  const t = state.draft.teams[team];
  state.strategyDraft = copy(
    t.builder || {
      harvest: 3,
      eat: 3,
      think: -1,
      keepMind: 1,
      pledge: 1,
      government: true,
      vote: "yes",
      migrate: true,
      rules: [],
      proposals: [],
    },
  );
  state.strategyMode = t.strategyId ? "go" : "simple";
  $("strategy-title").textContent = `${t.name} · behaviour`;
  renderStrategy();
  $("strategy-dialog").showModal();
  if (t.strategyId) {
    try {
      const stored = await api(`/strategies/${t.strategyId}`);
      if (
        state.editTeam === team &&
        state.strategyMode === "go" &&
        !$("go-source")?.value
      ) {
        state.strategyDraft._source = stored.source || "";
        if ($("go-source")) $("go-source").value = state.strategyDraft._source;
      }
    } catch (e) {
      if ($("go-status"))
        $("go-status").textContent =
          "The assigned agent remains available. Paste source to replace its behaviour.";
    }
  }
}
function renderStrategy() {
  const b = state.strategyDraft;
  let html = `<div class="editor-tabs">${[
    ["simple", "Everyday choices"],
    ["rules", "Phase rules"],
    ["go", "Go agent"],
  ]
    .map(
      ([id, name]) =>
        `<button data-strategy-mode="${id}" class="${state.strategyMode === id ? "active" : ""}">${name}</button>`,
    )
    .join("")}</div>`;
  if (state.strategyMode === "simple")
    html += `<p class="setting-description">An explicit baseline for each phase. Conditional phase rules can override these choices.</p><div class="setting-grid">${[
      ["harvest", "Harvest request", 0, 100, 1],
      ["eat", "Carrots to eat", 0, 100, 1],
      ["think", "Mind to think with", -1, 100, 0.1],
      ["keepMind", "Keep mind in reserve", 0, 100, 0.1],
      ["pledge", "Mind to pledge", 0, 100, 0.1],
    ]
      .map(
        ([key, label, min, max, step]) =>
          `<label class="setting-field"><span>${label}</span><input data-builder="${key}" type="number" value="${b[key] ?? 0}" min="${min}" max="${max}" step="${step}"/><small>${key === "think" ? "−1 means all available mind after reserve." : key === "eat" ? "No meal is supplied automatically." : key === "pledge" ? "Each individual reserves this much mind for shared costs." : ""}</small></label>`,
      )
      .join(
        "",
      )}<label class="setting-field"><span>Default ballot choice</span><select data-builder="vote">${["yes", "no", "abstain"].map((v) => `<option ${b.vote === v ? "selected" : ""}>${v}</option>`).join("")}</select><small>Yes and no votes each cost mind.</small></label><label class="setting-field"><span>Propose a government</span><select data-builder="government"><option value="true" ${b.government ? "selected" : ""}>When possible</option><option value="false" ${!b.government ? "selected" : ""}>Do not propose</option></select></label><label class="setting-field"><span>Movement</span><select data-builder="migrate"><option value="true" ${b.migrate ? "selected" : ""}>Seek a suitable plot</option><option value="false" ${!b.migrate ? "selected" : ""}>Settle and remain</option></select></label></div><div class="guide-note"><strong>Survival is part of the strategy.</strong><p>Daily food need is ${state.draft.settings.dailyFood}. Eating less can drain the body; eating more gives diminishing satisfaction. Thinking stays linear.</p></div>`;
  if (state.strategyMode === "rules")
    html += `<p class="setting-description">Rules are checked in order for their phase. The first matching rule returns the specified action. Without a match, everyday choices apply. Action fields use the same contract as Go agents.</p><div id="builder-rule-list">${(b.rules || []).map((r, i) => ruleEditor(r, i)).join("")}</div><button class="builder-add" id="add-builder-rule">+ Add a conditional phase rule</button><label class="setting-field wide" style="margin-top:20px"><span>Standing proposals</span><textarea class="code-editor" style="min-height:100px" id="standing-proposals" spellcheck="false">${esc(JSON.stringify(b.proposals || [], null, 2))}</textarea><small>Proposal inputs evaluated in governance. Use the policy catalogue's keys and values. Empty [] submits no standing policy proposals.</small></label><details style="margin-top:15px"><summary class="small muted">Action examples and policy keys</summary><pre class="json-view">${esc(JSON.stringify({ harvest: 2, eat: 2, think: 5, proposals: [{ kind: "policy", key: "quota", rule: { mode: "limited", amount: 2 } }] }, null, 2))}</pre><p class="editor-note">Actions are phase-specific: move, harvest, pledge, proposals, votes, orders, read, offer, accept, deposit, eat, think, memory. Political actions still require valid authority.</p><div class="json-view">${esc((Array.isArray(state.config.catalogue) ? state.config.catalogue : []).map((c) => `${c.key || c.id}: ${c.description || c.name || ""}`).join("\n"))}</div></details>`;
  if (state.strategyMode === "go")
    html += `<p class="setting-description">Import a phase-aware Go behaviour. Its ${state.draft.settings.copies} copies keep independent memory. The server validates and compiles your source before it is assigned.</p><div style="display:flex;gap:12px;align-items:center;margin-bottom:15px"><label class="button secondary">Choose .go file<input type="file" id="go-file" accept=".go,text/plain" class="visually-hidden"/></label><a class="text-link" href="/society-example.go" download>Download example ↗</a></div><label class="setting-field wide"><span>Go source</span><textarea class="code-editor" id="go-source" spellcheck="false" placeholder="Paste the phase-aware Go example here…">${esc(b._source || "")}</textarea></label><p class="editor-note" id="go-status">The uploaded strategy is used only after it compiles successfully.</p>`;
  $("strategy-content").innerHTML = html;
  $("strategy-content")
    .querySelectorAll("[data-strategy-mode]")
    .forEach(
      (el) =>
        (el.onclick = () => {
          if (!captureStrategy()) return;
          state.strategyMode = el.dataset.strategyMode;
          renderStrategy();
        }),
    );
  $("strategy-content")
    .querySelectorAll("[data-builder]")
    .forEach(
      (el) =>
        (el.onchange = () => {
          const key = el.dataset.builder;
          b[key] = ["government", "migrate"].includes(key)
            ? el.value === "true"
            : key === "vote"
              ? el.value
              : Number(el.value);
        }),
    );
  $("add-builder-rule")?.addEventListener("click", () => {
    if (!captureStrategy()) return;
    b.rules = b.rules || [];
    b.rules.push({
      phase: "harvest",
      field: "food",
      op: "lt",
      value: 2,
      action: { harvest: 4 },
    });
    renderStrategy();
  });
  $("strategy-content")
    .querySelectorAll("[data-delete-rule]")
    .forEach(
      (el) =>
        (el.onclick = () => {
          if (!captureStrategy()) return;
          b.rules.splice(Number(el.dataset.deleteRule), 1);
          renderStrategy();
        }),
    );
  $("go-file")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) {
      $("go-source").value = await file.text();
      b._source = $("go-source").value;
    }
  });
}
function ruleEditor(r, i) {
  const fields = [
    "food",
    "body",
    "mind",
    "score",
    "day",
    "month",
    "stock",
    "population",
    "government",
    "plot",
    "deaths",
  ];
  return `<div class="builder-rule" data-rule-index="${i}"><div class="builder-rule-header"><strong>RULE ${String(i + 1).padStart(2, "0")}</strong><button class="button quiet compact" data-delete-rule="${i}" aria-label="Delete rule ${i + 1}">×</button></div><div class="setting-grid"><label class="setting-field"><span>During</span><select data-rule="phase">${[...phases, ["pledges", "Mind pledges"], ["records", "Read records"], ["accept", "Accept food"], ["month_end", "Month ends"]].map(([key, name]) => `<option value="${key}" ${r.phase === key ? "selected" : ""}>${name}</option>`).join("")}</select></label><label class="setting-field"><span>When</span><select data-rule="field">${fields.map((key) => `<option ${r.field === key ? "selected" : ""}>${key}</option>`).join("")}</select></label><label class="setting-field"><span>Comparison</span><select data-rule="op">${[
    ["lt", "is below"],
    ["lte", "is at most"],
    ["eq", "equals"],
    ["gte", "is at least"],
    ["gt", "is above"],
  ]
    .map(
      ([key, name]) =>
        `<option value="${key}" ${r.op === key ? "selected" : ""}>${name}</option>`,
    )
    .join(
      "",
    )}</select></label><label class="setting-field"><span>Value</span><input type="number" data-rule="value" value="${r.value}" step="any"/></label><label class="setting-field wide"><span>Return this action</span><textarea class="code-editor" data-rule="action" spellcheck="false">${esc(JSON.stringify(r.action || {}, null, 2))}</textarea></label></div></div>`;
}
function captureStrategy() {
  try {
    if (state.strategyMode === "rules") {
      state.strategyDraft.rules = [
        ...$("strategy-content").querySelectorAll("[data-rule-index]"),
      ].map((el) => ({
        phase: el.querySelector('[data-rule="phase"]').value,
        field: el.querySelector('[data-rule="field"]').value,
        op: el.querySelector('[data-rule="op"]').value,
        value: Number(el.querySelector('[data-rule="value"]').value),
        action: JSON.parse(el.querySelector('[data-rule="action"]').value),
      }));
      state.strategyDraft.proposals = JSON.parse($("standing-proposals").value);
      if (!Array.isArray(state.strategyDraft.proposals))
        throw new Error("Standing proposals must be a list, wrapped in [].");
    }
    if (state.strategyMode === "go") state.strategyDraft._source = $("go-source").value;
    return true;
  } catch (error) {
    notice(`Check the action format: ${error.message}`, true);
    return false;
  }
}
async function saveStrategy() {
  if (!captureStrategy()) return;
  const team = state.draft.teams[state.editTeam];
  const button = $("save-strategy");
  button.disabled = true;
  try {
    if (state.strategyMode === "go") {
      const source = state.strategyDraft._source?.trim();
      if (!source) throw new Error("Choose a Go file or paste its source first.");
      $("go-status").textContent = "Compiling your behaviour…";
      const result = await api("/strategies", { name: team.name, source });
      team.strategyId = result.id;
      delete team.builder;
      team.policy = "custom";
    } else {
      const b = copy(state.strategyDraft);
      delete b._source;
      team.builder = b;
      delete team.strategyId;
      team.policy = "builder";
    }
    $("strategy-dialog").close();
    renderSetup();
  } catch (error) {
    if ($("go-status")) $("go-status").textContent = error.message;
    notice(error.message, true);
  } finally {
    button.disabled = false;
  }
}

document
  .querySelectorAll(".icon-slot[data-icon]")
  .forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
document
  .querySelectorAll("[data-page]")
  .forEach((b) => (b.onclick = () => setPage(b.dataset.page)));
document
  .querySelectorAll(".dialog-close")
  .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
document.querySelectorAll("dialog").forEach((d) =>
  d.addEventListener("click", (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        d.close();
    }
  }),
);
$("setup-button").onclick = () => {
  if (state.config) openSetup();
};
$("guide-button").onclick = () => $("guide-dialog").showModal();
$("saved-button").onclick = openSaved;
$("outside-camp").onclick = () => {
  state.plot = -1;
  state.agent = null;
  state.residentsPage = 0;
  state.residentSearch = "";
  renderMap();
  renderInspector();
};
$("play-button").onclick = () => togglePlay().catch((e) => notice(e.message, true));
$("step-button").onclick = () => step();
$("day-button").onclick = () => runUntil("day");
$("month-button").onclick = () => runUntil("month");
$("year-button").onclick = () => runUntil("year");
$("timeline").onchange = (e) => seek(e.target.value);
$("live-button").onclick = returnToLive;
$("export-button").onclick = exportRun;
document.querySelectorAll("[data-setup-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      state.setupTab = b.dataset.setupTab;
      renderSetup();
    }),
);
$("setup-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    localStorage.setItem("amoeboids.society.setup.v1", JSON.stringify(state.draft));
  } catch {}
  await createWorld(state.draft);
};
$("save-strategy").onclick = saveStrategy;
document.addEventListener("keydown", (e) => {
  if (
    e.code === "Space" &&
    !document.querySelector("dialog[open]") &&
    !/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)
  ) {
    e.preventDefault();
    togglePlay().catch((err) => notice(err.message, true));
  }
});

async function openRun(id) {
  pauseLocal();
  stopPolling();
  const result = await api(`/runs/${id}`);
  state.events.clear();
  state.snapshot = null;
  state.history = [];
  state.id = id;
  state.index = 0;
  state.maxIndex = 0;
  state.agent = null;
  state.federation = null;
  state.plot = 0;
  state.tab = "overview";
  state.lastMeteor = "";
  state.privateObservation = null;
  ingest(result);
  await loadHistory();
  await loadEvents();
  if (state.status === "running") startPolling();
}
async function openSaved() {
  $("saved-content").innerHTML =
    '<div class="empty-state">Opening your saved worlds…</div>';
  $("saved-dialog").showModal();
  try {
    const data = await api("/runs");
    const runs = (data.runs || []).sort((a, b) =>
      String(b.created).localeCompare(String(a.created)),
    );
    $("saved-content").innerHTML = runs.length
      ? runs
          .map(
            (r) =>
              `<button class="saved-run resident-row" data-open-run="${esc(r.id)}">${icon("plots")}<span class="resident-info"><strong>${r.id === state.id ? "Current world" : "Amoeboids world"} · ${esc(new Date(r.created || Date.now()).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</strong><span>${fmt(r.frames)} recorded moments · ${esc(titleCase(r.status))}</span></span><span>↗</span></button>`,
          )
          .join("")
      : '<div class="empty-state">No saved worlds yet.</div>';
    $("saved-content")
      .querySelectorAll("[data-open-run]")
      .forEach(
        (b) =>
          (b.onclick = async () => {
            try {
              if (state.status === "running") await api(`/runs/${state.id}/pause`, {});
              await openRun(b.dataset.openRun);
              $("saved-dialog").close();
            } catch (e) {
              notice(e.message, true);
            }
          }),
      );
  } catch (error) {
    $("saved-content").innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
  }
}

async function init() {
  try {
    state.config = await api("/config");
    let input = {
      settings: copy(state.config.settings),
      teams: copy(state.config.teams),
      seed: 42,
    };
    try {
      const saved = JSON.parse(localStorage.getItem("amoeboids.society.setup.v1"));
      if (saved?.settings && Array.isArray(saved.teams) && saved.teams.length)
        input = { ...saved, settings: { ...input.settings, ...saved.settings } };
    } catch {}
    let active;
    try {
      active =
        new URLSearchParams(location.search).get("run") ||
        localStorage.getItem("amoeboids.society.active");
    } catch {}
    if (active && active !== "null") {
      try {
        await openRun(active);
        return;
      } catch (error) {
        if (error.status !== 404) throw error;
        try {
          localStorage.removeItem("amoeboids.society.active");
        } catch {}
      }
    }
    await createWorld(input);
  } catch (error) {
    $("map-loading").innerHTML =
      `${icon("plots")}<strong>The world could not start.</strong><span>${esc(error.message)}</span><button class="button secondary" id="retry-button">Try again</button>`;
    $("retry-button").onclick = init;
    notice(error.message, true);
  }
}
init();
