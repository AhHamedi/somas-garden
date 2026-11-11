import { colors, createScene } from "./scene.js";
import { createGardenSound } from "./sound.js";
import { actionReadout } from "./action-readout.js";
import { createGardenSetup } from "./setup.js";
import { createDayStage } from "./day-stage.js";
import { portrait } from "./characters.js";
import { resourceIcon } from "./icons.js";
import { createTurnQueue } from "./turn-queue.js";
import { createGuide } from "./guide.js";
import { expandReplay } from "./replay.js";
import { createResults } from "./results.js";
const $ = (s) => document.querySelector(s);
$(".resource-icon.carrot").innerHTML = resourceIcon("carrot");
$(".resource-icon.sun").innerHTML = resourceIcon("energy");
const sound = createGardenSound();
const updateDayStage = createDayStage($("#day-stage"));
const turnQueue = createTurnQueue($("#turn-queue"));
const scene = createScene($("#garden"), {
  onPresent: renderFrame,
  onEvents: (events, rate) => sound.playEvents(events, rate),
  onMotion: (frame) => turnQueue.present(frame, trace?.frames),
});
const classic = {
  fieldCapacity: 60,
  startingField: 60,
  energyCapacity: 6,
  price: { mode: "fixed", value: 2 },
  roundLimit: 30,
};
let setup,
  draft,
  readySeats,
  trace = null,
  index = 0,
  playing = false,
  savedAwaitingReplay = false,
  finished = false,
  resumeOnVisible = false,
  timer = null,
  busy = false;
let runIntent = 0;
let capabilities = { storage: "hosted", goUploads: false };
const shareLabel = (report = false) =>
  capabilities.storage === "local"
    ? "Copy local link"
    : report
      ? "Copy results link"
      : "Copy replay link ↗";
const playbackRate = () => Number($("#speed").value) / 2;
function renderSound() {
  if (!sound.supported) {
    $("#sound").disabled = true;
    $("#sound").setAttribute("aria-pressed", "false");
    $("#sound").setAttribute("aria-label", "Sound unavailable in this browser");
    $("#sound-label").textContent = "Sound unavailable";
    return;
  }
  $("#sound").setAttribute("aria-pressed", String(sound.enabled));
  $("#sound").setAttribute("aria-label", sound.enabled ? "Mute sound" : "Enable sound");
  $("#sound-label").textContent = sound.enabled ? "Sound on" : "Sound off";
}
$("#sound").onclick = () => {
  sound.toggle();
  renderSound();
};
renderSound();
async function api(path, body) {
  const replayRequest = path === "runs" || path.startsWith("runs/");
  const headers = body ? { "Content-Type": "application/json" } : {};
  if (replayRequest) headers["X-Somas-Replay"] = "compact";
  const r = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({
    error: "The garden could not connect. Please try again.",
  }));
  if (!r.ok) throw new Error(data.error);
  return replayRequest ? expandReplay(data) : data;
}
function notice(text, tone = "info") {
  $("#notice").dataset.tone = tone;
  $("#notice").textContent = text;
  $("#notice").hidden = !text;
}
function syncDraft() {
  if (!setup) return;
  draft = setup.getRunInput();
  readySeats = setup.getSeats();
  if (!trace && !busy) show(idleFrame());
}
function openUpload() {
  if (!capabilities.goUploads) return;
  $("#upload-error").textContent = "";
  $("#upload-dialog").showModal();
}
// Each slot keeps its DOM identity through item arrivals, including focused controls.
const slotViews = Array.from({ length: 6 }, (_, i) => {
  const row = document.createElement("div");
  row.className = "slot";
  row.style.setProperty("--c", colors[i]);
  row.innerHTML = `
    <span class="creature-dot" aria-hidden="true"></span>
    <div class="slot-info">
      <span class="slot-heading">
        <span class="slot-name"></span>
        <span class="slot-budget">${resourceIcon("energy")}<span></span></span>
      </span>
      <span class="slot-stats"></span>
      <details class="seedling-ledger" hidden><summary>Day details</summary><span></span></details>
      <details class="seedling-error" hidden><summary>Agent error</summary><span></span></details>
    </div>
    <button type="button" class="slot-edit"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.5"><path d="M3.2 11.8 12 3a1.7 1.7 0 0 1 2.5 2.4l-8.8 8.8-3.3.8zM10.2 4.8l2.8 2.8"/></svg></button>`;
  $("#slots").append(row);
  const edit = row.querySelector(".slot-edit");
  edit.onclick = () => setup.openSeat(readySeats[i].id);
  return {
    row,
    edit,
    avatar: row.querySelector(".creature-dot"),
    name: row.querySelector(".slot-name"),
    budget: row.querySelector(".slot-budget"),
    count: row.querySelector(".slot-budget span"),
    stats: row.querySelector(".slot-stats"),
    ledger: row.querySelector(".seedling-ledger"),
    ledgerText: row.querySelector(".seedling-ledger span"),
    error: row.querySelector(".seedling-error"),
    errorText: row.querySelector(".seedling-error span"),
  };
});

function setText(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

function renderSlots(states, active, settings) {
  setText(
    $("#seat-count"),
    states.length === 1 ? "1 amoeboid" : states.length + " amoeboids",
  );
  slotViews.forEach((slot, i) => {
    const agent = states[i];
    slot.row.hidden = !agent;
    if (!agent) return;
    const dead = Boolean(agent.dead);
    const appearance = agent.appearance ?? i;
    const capacity = settings.energyCapacity;
    const available =
      agent.energyLeft ?? (dead ? 0 : Math.max(0, capacity - (agent.given || 0)));
    const key = appearance + ":" + dead;
    if (slot.key !== key) {
      slot.key = key;
      slot.row.style.setProperty("--c", colors[appearance]);
      slot.avatar.innerHTML = portrait(appearance, dead);
    }
    slot.row.classList.toggle("active", i === active);
    slot.row.classList.toggle("dead", dead);
    setText(slot.name, agent.name);
    setText(slot.count, `${available}/${capacity}`);
    slot.budget.setAttribute(
      "aria-label",
      `${available} of ${capacity} energy available`,
    );
    let detail = !trace
      ? readySeats[i].strategyName
      : replayVersion() < 4 || agent.pantry === undefined
        ? `${agent.totalFood} harvested · ${agent.totalEnergy} energy given`
        : `${agent.pantry} in pantry · ${agent.totalFood} harvested`;
    if (!trace && agent.pantry) detail += ` · ${agent.pantry} in pantry`;
    if (dead) detail += ` · died day ${agent.diedRound}`;
    setText(slot.stats, agent.error ? "Agent stopped · see error" : detail);
    slot.stats.classList.toggle("error", Boolean(agent.error));
    slot.ledger.hidden = !trace || replayVersion() < 4 || agent.pantry === undefined;
    if (slot.agentId !== agent.id) {
      slot.ledger.open = false;
      slot.error.open = false;
      slot.agentId = agent.id;
    }
    if (!slot.ledger.hidden) {
      const quote = agent.price ? ` · ${agent.price} energy per carrot at dawn` : "";
      setText(
        slot.ledgerText,
        `+${agent.sunlight || 0} sunlight${quote}. ${agent.totalEaten || 0} eaten · ${agent.totalEnergy || 0} energy given in this game.`,
      );
    }
    slot.error.hidden = !agent.error;
    if (!agent.error) slot.error.open = false;
    setText(slot.errorText, agent.error || "");
    slot.edit.hidden = Boolean(trace);
    slot.edit.disabled = busy;
    slot.edit.setAttribute("aria-label", "Edit " + agent.name);
  });
}
function idleFrame() {
  return {
    round: 0,
    food: draft.settings.startingField,
    energy: 0,
    pending: 0,
    created: 0,
    phase: "ready",
    actor: -1,
    agents: readySeats.map((seat) => ({
      id: seat.id,
      name: seat.name,
      appearance: seat.appearance,
      pantry: seat.startingPantry ?? draft.settings.startingPantry,
      totalFood: 0,
      totalEnergy: 0,
      energyLeft: 0,
    })),
  };
}
function replayVersion() {
  return trace ? (trace.version ?? 1) : 4;
}
function settingsNow() {
  return trace ? trace.settings || classic : draft.settings;
}
function show(f) {
  const previous = trace && index > 0 ? trace.frames[index - 1] : f;
  const view = scene.set(f, previous, replayVersion(), settingsNow());
  scene.playback(playing, playbackRate());
  renderFrame(view);
}
const turnAnnouncement = document.createElement("span");
turnAnnouncement.className = "visually-hidden";
turnAnnouncement.setAttribute("role", "status");
$("#turn-box").after(turnAnnouncement);
let portraitKey = "";
function renderFrame(f) {
  const settings = settingsNow(),
    version = replayVersion();
  const stage = updateDayStage(f, version);
  const readout = actionReadout(f, settings, version);
  setText($("#round"), String(f.round).padStart(2, "0"));
  setText($("#round-limit"), String(settings.roundLimit ?? 30));
  setText($("#food"), String(f.food));
  setText($("#energy"), String(f.energy));
  setText($("#food-capacity"), " / " + settings.fieldCapacity);
  const price = settings.price;
  const priceText = f.lockedPrice
    ? ` · ${f.lockedPrice} locked`
    : price.mode === "fixed"
      ? ` · ${price.value} per carrot`
      : price.mode === "random"
        ? ` · ${price.min}–${price.max} per carrot`
        : " · field pricing";
  setText($("#energy-price"), priceText);
  $("#food-meter").style.width = (f.food / settings.fieldCapacity) * 100 + "%";
  const budget = f.agents.reduce(
    (sum, a) => sum + (a.dead ? 0 : (a.energyLeft ?? 0) + (a.given ?? 0)),
    0,
  );
  $("#energy-meter").style.width =
    (budget ? Math.min(100, (100 * f.energy) / budget) : 0) + "%";
  renderSlots(f.agents, f.actor, settings);
  const actor = f.agents[f.actor];
  setText($("#scene-caption"), readout.caption);
  setText($("#turn-label"), readout.label);
  setText($("#turn-name"), readout.name);
  setText($("#turn-amount"), readout.amount);
  const appearance = actor?.appearance ?? (f.actor >= 0 ? f.actor : 2);
  $("#turn-avatar").style.setProperty("--c", actor ? colors[appearance] : "#c4d5b1");
  const key = readout.icon || `${appearance}:${f.phase === "death"}`;
  if (key !== portraitKey) {
    portraitKey = key;
    $("#turn-avatar").innerHTML = readout.icon
      ? resourceIcon(readout.icon)
      : portrait(appearance, f.phase === "death");
  }
  $("#garden").setAttribute("aria-label", readout.canvasLabel);
  $("#garden").dataset.activeActor = ["harvest", "contribute"].includes(f.phase)
    ? f.actor
    : -1;
  $("#turn-box").classList.toggle("is-death", f.phase === "death");
  setText(
    turnAnnouncement,
    readout.announcement ||
      (stage === "ready"
        ? "Garden ready."
        : `Day ${f.round}, ${stage}. ${f.phase}. ${actor?.name || "Garden"}.`),
  );
  let status = "Ready";
  if (savedAwaitingReplay) status = "Saved garden · press replay";
  else if (finished) status = "Game complete";
  else if (playing) status = "Running";
  else if (trace) status = "Garden paused";
  setText($("#game-state"), status);
}
const liveGarden = $("#live-garden");
const resultsPanel = $("#run-results");
const results = createResults(resultsPanel, {
  onReplay: replayFromStart,
  onSetup: () => setup.open(),
  onReturn: () => {
    leaveResults();
    show(trace.frames[index]);
    $("#view-results").focus();
  },
  onShare: (event) => copyLink(event.currentTarget, true),
  shareLabel: () => shareLabel(true),
  onSelection: () => history.replaceState({}, "", runUrl(true)),
});

function runUrl(report) {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set("run", trace.id);
  if (report) {
    url.searchParams.set("view", "results");
    const { seat, round, metric } = results.selection();
    if (seat !== null) url.searchParams.set("seat", seat + 1);
    if (round > 1) url.searchParams.set("day", round);
    if (seat !== null && metric !== "harvested") url.searchParams.set("metric", metric);
  }
  return url;
}

async function copyLink(button, report) {
  const url = runUrl(report).href;
  try {
    await navigator.clipboard.writeText(url);
    const label = button.querySelector("span") || button;
    const original = label.textContent;
    if (original !== "Link copied ✓") {
      label.textContent = "Link copied ✓";
      button.classList.add("link-copied");
      setText(
        $("#results-link-status"),
        capabilities.storage === "local"
          ? "Local link copied. Open it on this computer."
          : report
            ? "Results link copied."
            : "Replay link copied.",
      );
      setTimeout(() => {
        label.textContent = original;
        button.classList.remove("link-copied");
        setText($("#results-link-status"), "");
      }, 1700);
    }
    sound.playUi("confirm");
  } catch {
    notice(url);
  }
}

// When playback ends under a focused control, keep that control in the tab
// order until the user leaves it. All other live controls give way to results.
function retainFinalFocus(active) {
  if (!liveGarden.contains(active)) {
    liveGarden.hidden = true;
    return;
  }
  for (let node = active; node !== liveGarden; node = node.parentElement) {
    node.dataset.focusPath = "";
  }
  liveGarden.classList.add("ending-focus");
}
function clearFinalFocus() {
  liveGarden.classList.remove("ending-focus");
  for (const node of liveGarden.querySelectorAll("[data-focus-path]"))
    delete node.dataset.focusPath;
}
liveGarden.addEventListener("focusout", (event) => {
  if (!liveGarden.classList.contains("ending-focus")) return;
  if (!liveGarden.contains(event.relatedTarget)) {
    liveGarden.hidden = true;
    clearFinalFocus();
  }
});

function showResults(origin) {
  if (!trace || busy) return;
  const natural = origin === "end";
  const active = document.activeElement;
  stop();
  scene.visible(false);
  if (natural) {
    finished = true;
    $("#game-state").textContent = "Game complete";
    if (active === $("#pause")) $("#pause").textContent = "Replay";
    else $("#pause").disabled = true;
    retainFinalFocus(active);
  } else {
    liveGarden.hidden = true;
  }
  notice("");
  resultsPanel.hidden = false;
  const params = new URLSearchParams(location.search);
  const getNumber = (key) => {
    const value = params.get(key);
    return origin === "link" && /^\d{1,2}$/.test(value ?? "") ? Number(value) : null;
  };
  const linkedSeat = getNumber("seat");
  const summary = results.show(trace, {
    selectedSeat: linkedSeat === null ? null : linkedSeat - 1,
    selectedMetric: origin === "link" ? params.get("metric") : null,
    day: origin === "button" ? trace.frames[index]?.round : getNumber("day"),
    canReturn: origin === "button" && !finished,
    focus: origin === "button",
  });
  history.replaceState({}, "", runUrl(true));
  if (origin === "button")
    resultsPanel.scrollIntoView({ block: "start", behavior: "instant" });
  if (natural) {
    setText($("#outcome-announcement"), summary.title + " " + summary.subtitle);
    if (summary.outcome === "survival" && !document.hidden) sound.playUi("complete");
  }
}

function leaveResults() {
  clearFinalFocus();
  liveGarden.hidden = false;
  resultsPanel.hidden = true;
  scene.visible(true);
  setText($("#outcome-announcement"), "");
  history.replaceState({}, "", runUrl(false));
}

function replayFromStart() {
  if (!trace || busy) return;
  stop();
  const fromResults = !resultsPanel.hidden;
  leaveResults();
  scene.reset();
  index = 0;
  play();
  if (fromResults) $("#pause").focus();
}

function stop() {
  resumeOnVisible = false;
  playing = false;
  sound.silence();
  scene.playback(false, playbackRate());
  clearTimeout(timer);
  $("#pause").disabled = !trace;
  $("#pause").textContent = "Resume";
}

function tick() {
  if (!playing || !trace) return;
  const frame = trace.frames[index];
  show(frame);
  const final = index === trace.frames.length - 1;
  function remaining() {
    const tail = final && frame.phase === "death" ? 1900 - scene.age() : 0;
    return Math.max(0, scene.remaining(), tail);
  }
  function advance() {
    if (!playing) return;
    const delay = remaining();
    if (delay > 0) {
      timer = setTimeout(advance, Math.max(12, delay / playbackRate()));
      return;
    }
    if (final) {
      showResults("end");
      return;
    }
    index++;
    tick();
  }
  advance();
}
function play() {
  if (!trace) return;
  if (document.hidden) {
    resumeOnVisible = true;
    return;
  }
  savedAwaitingReplay = false;
  finished = false;
  void sound.unlock();
  playing = true;
  $("#pause").disabled = false;
  $("#pause").textContent = "Pause";
  tick();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    const wasPlaying = playing;
    if (playing) {
      stop();
      $("#game-state").textContent = "Garden paused";
    } else sound.silence();
    resumeOnVisible = wasPlaying;
  } else if (resumeOnVisible) {
    resumeOnVisible = false;
    play();
  }
});
async function refresh() {
  try {
    setup.setLibrary((await api("agents")).agents);
  } catch (e) {
    notice(e.message, "error");
  }
}
async function viewSource(agent) {
  let source;
  if (["cooperate", "greedy", "random"].includes(agent.id))
    source =
      agent.id === "cooperate"
        ? "package main\n\nfunc Decide(v View) Action {\n    return Action{Food: 2, Energy: 4}\n}"
        : agent.id === "greedy"
          ? "package main\n\nfunc Decide(v View) Action {\n    return Action{Food: 10, Energy: 0}\n}"
          : 'package main\n\nimport "math/rand"\n\nfunc Decide(v View) Action {\n    r := rand.New(rand.NewSource(v.Seed))\n    return Action{Food: r.Intn(11), Energy: r.Intn(7)}\n}';
  else
    try {
      source = (await api("agents/" + agent.id + "/source")).source;
    } catch (e) {
      return notice(e.message, "error");
    }
  $("#source-title").textContent = agent.name;
  $("#source-code").textContent = source;
  $("#download-source").download =
    (agent.name
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "agent") + ".go";
  $("#download-source").href = URL.createObjectURL(
    new Blob([source], { type: "text/plain" }),
  );
  $("#source-dialog").showModal();
}
$("#source-dialog").addEventListener("close", () => {
  URL.revokeObjectURL($("#download-source").href);
  $("#download-source").removeAttribute("href");
});
$("#run").onclick = async () => {
  if (busy) return;
  runIntent++;
  stop();
  void sound.unlock().then(() => {
    if (busy && !document.hidden) sound.playUi("start");
  });
  busy = true;
  setup.setBusy(true);
  $("#mobile-setup").disabled = true;
  $("#create-agent").disabled = true;
  $("#replay").disabled = true;
  $("#view-results").disabled = true;
  notice("");
  $("#run").disabled = true;
  $("#run").setAttribute("aria-busy", "true");
  $("#run").textContent = "Preparing garden…";
  $("#pause").disabled = true;
  const fromReport = !resultsPanel.hidden;
  if (fromReport) {
    resultsPanel.inert = true;
    resultsPanel.setAttribute("aria-busy", "true");
    notice("Preparing your next garden…");
  }
  const input = setup.getRunInput();
  if (!trace) renderSlots(idleFrame().agents, -1, draft.settings);
  try {
    trace = await api("runs", input);
    leaveResults();
    finished = false;
    savedAwaitingReplay = false;
    index = 0;
    scene.reset();
    $("#replay").disabled = false;
    $("#share").hidden = false;
    $("#share").textContent = shareLabel();
    notice("");
    play();
    if (fromReport) $("#pause").focus();
    const errors = trace.agents.filter((a) => a.error);
    if (errors.length)
      notice(errors.map((a) => a.name + ": " + a.error).join("\n"), "error");
  } catch (e) {
    notice(e.message, "error");
  } finally {
    busy = false;
    resultsPanel.inert = false;
    resultsPanel.removeAttribute("aria-busy");
    setup.setBusy(false);
    $("#mobile-setup").disabled = false;
    $("#create-agent").disabled = false;
    $("#replay").disabled = !trace;
    $("#view-results").hidden = !trace;
    $("#view-results").disabled = !trace;
    $("#run").disabled = false;
    $("#run").removeAttribute("aria-busy");
    $("#run").innerHTML = trace
      ? '<span aria-hidden="true">▶</span> New game'
      : '<span aria-hidden="true">▶</span> Run garden';
    if (!trace) show(idleFrame());
    else if (!playing && !finished) $("#pause").disabled = false;
  }
};
$("#pause").onclick = () => {
  if (finished) return replayFromStart();
  if (playing) {
    stop();
    $("#game-state").textContent = "Garden paused";
  } else play();
};
$("#replay").onclick = replayFromStart;
$("#view-results").onclick = () => showResults("button");
$("#speed").onchange = () => {
  sound.silence();
  if (playing) {
    clearTimeout(timer);
    tick();
  }
};
$("#share").onclick = (event) => copyLink(event.currentTarget, false);
setup = createGardenSetup({
  button: $("#garden-setup"),
  api,
  onChange: syncDraft,
  onRun: () => $("#run").click(),
  onUpload: openUpload,
  onSource: viewSource,
  onPublished: refresh,
  capabilities,
});
$("#mobile-setup").onclick = () => setup.open();
$("#create-agent").onclick = () => setup.openBuilder();
const guide = createGuide($("#help-dialog"), $("#upload-dialog"));
guide.setGoUploads(capabilities.goUploads);
$("#open-help").onclick = () => guide.open();
$("#upload-go-guide").onclick = () => guide.open();
document
  .querySelectorAll("#source-dialog .close, #upload-dialog .close, #help-dialog .close")
  .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
document.querySelectorAll("#source-dialog, #upload-dialog, #help-dialog").forEach((d) =>
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
$("#upload-form").onsubmit = async (e) => {
  e.preventDefault();
  if (!capabilities.goUploads) return;
  const form = e.target,
    file = form.elements.file.files[0],
    button = $("#submit-upload");
  if (!file?.name.endsWith(".go") || file.size > 20480) {
    $("#upload-error").textContent = "Choose a .go file smaller than 20 KB.";
    return;
  }
  button.disabled = true;
  button.textContent = "Compiling & checking…";
  $("#upload-error").textContent = "";
  try {
    const { agent } = await api("agents", {
      name: form.elements.name.value,
      source: await file.text(),
    });
    await refresh();
    $("#upload-dialog").close();
    setup.useUploaded(agent);
    form.reset();
    notice(agent.name + " is in the public library and ready to play.", "success");
    if (!document.hidden) sound.playUi("confirm");
  } catch (e) {
    $("#upload-error").textContent = e.message;
  } finally {
    button.disabled = false;
    button.textContent = "Upload & check Go";
  }
};
syncDraft();
if (new URLSearchParams(location.search).has("guide")) guide.open();
const replay = new URLSearchParams(location.search).get("run");
async function loadSaved(id) {
  const intent = runIntent;
  try {
    const saved = await api("runs/" + id);
    if (intent !== runIntent) return;
    trace = saved;
    savedAwaitingReplay = true;
    index = 0;
    scene.reset();
    $("#replay").disabled = false;
    $("#share").hidden = false;
    $("#view-results").hidden = false;
    show(trace.frames[0]);
    if (new URLSearchParams(location.search).get("view") === "results")
      showResults("link");
    if (resultsPanel.hidden && replayVersion() < 4)
      notice("Saved with the original garden rules. Your next garden uses your setup.");
  } catch (e) {
    if (intent === runIntent) notice(e.message, "error");
  }
}
async function initialize() {
  try {
    const configured = await api("capabilities");
    capabilities = {
      storage: configured.storage === "local" ? "local" : "hosted",
      goUploads: configured.goUploads === true,
    };
  } catch (error) {
    notice(error.message, "error");
  }
  setup.setCapabilities(capabilities);
  guide.setGoUploads(capabilities.goUploads);
  $("#share").textContent = shareLabel();
  await refresh();
  if (replay) await loadSaved(replay);
}
void initialize();
