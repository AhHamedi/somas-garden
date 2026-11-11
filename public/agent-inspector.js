import { colors, portrait } from "./characters.js";
import { esc, examples, modes } from "./setup-model.js";

const metrics = {
  harvested: { name: "Harvest", unit: "carrots" },
  energyGiven: { name: "Energy given", unit: "energy" },
  eaten: { name: "Supper eaten", unit: "carrots" },
  pantryEnd: { name: "Closing pantry", unit: "carrots" },
};

export function isJournalMetric(value) {
  return Object.hasOwn(metrics, value);
}

const arrows = {
  back: '<path d="m12 5-5 5 5 5"/>',
  next: '<path d="m8 5 5 5-5 5"/>',
  harvest:
    '<path d="M13 7C10 4 6.5 9.5 3 17c7-3.5 12.5-7 10-10Z M12 7l3-4m-2 5 4-1M8 10l2 2"/>',
  plant:
    '<path d="M10 17v-5M10 13C5 13 3 9 3 6c4 0 7 2 7 7Zm0-2c0-5 3-8 7-8 0 5-2 8-7 8Z"/>',
  supper:
    '<path d="M3 9h14c-.5 4-3 6-7 6s-6.5-2-7-6Zm4 8h6M8 6c-1.5-1 .7-2-.4-3m4 3c-1.5-1 .7-2-.4-3"/>',
};
const icon = (key) =>
  `<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${arrows[key]}</svg>`;

const numeric = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
function format(value) {
  if (typeof value === "number" && Number.isFinite(value)) return numeric.format(value);
  if (typeof value === "string" && /^-?\d+$/.test(value))
    return BigInt(value).toLocaleString("en");
  return "—";
}
const quantity = (n, unit) =>
  `${format(n)} ${unit === "carrots" && n === 1 ? "carrot" : unit}`;
const rows = (entries) =>
  entries
    .map(([name, value]) => `<div><dt>${name}</dt><dd>${format(value)}</dd></div>`)
    .join("");

function strategyLabel(strategy) {
  if (strategy?.kind === "builder" && modes[strategy.mode])
    return `${modes[strategy.mode]} builder`;
  if (strategy?.kind === "go") return "Uploaded Go agent";
  if (strategy?.kind === "builtin")
    return examples.find((item) => item.id === strategy.policy)?.name;
  return "";
}

function fate(seat) {
  if (seat.dead) return seat.diedRound ? `Died on day ${seat.diedRound}` : "Died";
  return seat.dead === false ? "Survived" : "";
}

function section(key, title, turn, facts) {
  return `<section class="aj-stage aj-${key}"><header>${icon(key)}<h4>${title}</h4>${turn ? `<span>Turn ${turn}</span>` : ""}</header><dl>${rows(facts)}</dl></section>`;
}

function builderChoice(record, seat) {
  const d = record.decision;
  if (d?.status !== "ok" || seat.strategy?.kind !== "builder") return "";
  let branch;
  if (seat.strategy.mode === "simple") branch = "Fixed action";
  else if (d.matchedRule === -1) branch = "Fallback action";
  else if (Number.isInteger(d.matchedRule)) branch = `Rule ${d.matchedRule + 1} matched`;
  const memory =
    d.memoryBefore != null && d.memoryAfter != null
      ? `<span>Stored memory <b>${format(d.memoryBefore)}</b> to <b>${format(d.memoryAfter)}</b></span>`
      : "";
  if (!branch && !memory) return "";
  return `<p class="aj-choice"><strong>Builder decision</strong>${branch ? `<span>${branch}</span>` : ""}${memory}</p>`;
}

function decisionEvidence(record) {
  const missing =
    !record.decision && record.harvestRequested == null && record.energyRequested == null;
  const facts = [
    ["Energy from sunlight", record.sunlight],
    ["Quoted energy per carrot at dawn", record.quotedPrice],
    ["Field before planting turn", record.fieldBeforePlant],
    ["Energy in pool before turn", record.pendingBeforePlant],
    ["Energy in pool after turn", record.pendingAfterPlant],
    ["Energy left after planting", record.energyAfterPlant],
    ["Pantry before supper", record.pantryBeforeSupper],
    ["Uneaten carrots discarded", record.pantryDiscarded],
  ].filter(([, value]) => value != null);
  if (!missing && !facts.length && !record.error) return "";
  return `<details class="aj-evidence"><summary>Decision &amp; turn details</summary><div>
    ${missing ? "<p>The original request and offer are unavailable for this day.</p>" : ""}
    ${facts.length ? `<dl>${rows(facts)}</dl>` : ""}
    ${record.error ? `<p class="aj-error"><strong>Agent error</strong> ${esc(record.error)}</p>` : ""}
  </div></details>`;
}

function sharedPlanting(record, seats) {
  if (record.sharedCompletions > 0) {
    const sources = record.coFunders.flatMap((funder) => {
      const partner = seats[funder.index];
      return funder.deposits.map(
        ({ round, energy }) =>
          `<button type="button" data-aj-funder="${funder.index}" data-aj-source-day="${round}" aria-label="Inspect ${esc(partner.name)}, day ${round}">${esc(partner.name)} · day ${round} <span aria-hidden="true">↗</span></button> (${format(energy)} energy)`,
      );
    });
    const carrots = quantity(record.sharedCompletions, "carrots");
    return `<div class="aj-pooling"><strong>Shared planting</strong><p>${carrots} completed on this turn used energy from ${sources.join(", ")}.</p></div>`;
  }
  if (record.sharedCompletions == null && record.grownOnTurn > 0)
    return '<p class="aj-note">A carrot completed on this turn can include energy from earlier turns.</p>';
  return "";
}

function dayRecord(seat, day, seats) {
  const record = day.seats[seat.index];
  if (
    !record ||
    (record.active == null &&
      record.harvested == null &&
      record.energyGiven == null &&
      record.eaten == null)
  )
    return '<p class="aj-empty">This replay has no turn record for this amoeboid on this day.</p>';
  if (record.active === false || record.status === "inactive") {
    return `<div class="aj-inactive"><span class="aj-spirit">${portrait(seat.appearance, true)}</span><div><strong>No turn on day ${day.round}</strong><p>${esc(seat.name)} died${seat.diedRound ? ` at supper on day ${seat.diedRound}` : " earlier in the run"}.</p>
      ${seat.diedRound ? `<button type="button" data-aj-last>Inspect day ${seat.diedRound}</button>` : ""}</div></div>`;
  }
  const dawn = [
    [day.opening, "field carrots"],
    [record.pantryStart, "pantry carrots"],
    [record.energyAvailable, "energy available"],
  ].filter(([value]) => value != null);
  const missingDecision =
    record.decision?.status === "failed" || record.decision?.status === "unavailable";
  const mealFacts = [
    ["Carrots needed", record.need],
    ["Carrots eaten", record.eaten],
    ["Pantry at close", record.pantryEnd],
  ];
  const hasSupper = mealFacts.some(([, amount]) => amount != null);
  let result = "";
  if (record.status === "died") result = "Died at supper";
  else if (record.need === 0 && record.fed) result = "No supper needed";
  else if (record.fed === true) result = "Supper covered";
  return `<div class="aj-dawn">${dawn.length ? `<b>At dawn</b> ${dawn.map(([value, label]) => `<span><strong>${format(value)}</strong> ${label}</span>`).join('<i aria-hidden="true">·</i>')}` : ""}
    ${result ? `<em class="${record.status === "died" ? "is-lost" : ""}">${result}</em>` : ""}</div>
    ${builderChoice(record, seat)}
    ${missingDecision ? `<p class="aj-error"><strong>${record.decision.status === "failed" ? "Decision failed." : "Agent unavailable."}</strong> The garden applied its zero-action fallback.</p>` : ""}
    <div class="aj-stages" style="--aj-stages:${hasSupper ? 3 : 2}">
      ${section("harvest", "Harvest", record.harvestOrder, [
        ["Field before turn", record.fieldBeforeHarvest],
        ["Carrots requested", record.harvestRequested],
        ["Carrots received", record.harvested],
      ])}
      ${section("plant", "Planting", record.plantOrder, [
        ["Energy offered", record.energyRequested],
        ["Energy accepted", record.energyGiven],
        ["Carrots completed on turn", record.grownOnTurn],
      ])}
      ${hasSupper ? section("supper", "Supper", null, mealFacts) : ""}
    </div>
    ${hasSupper ? "" : '<p class="aj-note">Meals were unrecorded on this day.</p>'}
    ${sharedPlanting(record, seats)}
    ${[record.harvestRequested, record.energyRequested, record.eaten, record.grownOnTurn].some((v) => v == null) ? '<p class="aj-note">A dash marks an unrecorded value.</p>' : ""}
    ${decisionEvidence(record)}`;
}

// A filled bar records the selected amoeboid's outcome. The line is the mean
// for the other active amoeboids that day. Unknown values break the line.
function activityPlot(days, seat, metric) {
  const samples = days.map((day) => {
    const record = day.seats[seat.index];
    return {
      value: record?.active === false ? null : record?.[metric],
      mean: record?.peers?.[metric],
      inactive: record?.active === false,
    };
  });
  const hasPeers = samples.some((s) => Number.isFinite(s.mean));
  const max = Math.max(
    1,
    ...days.flatMap((d) =>
      d.seats.map((r) => (r.active === false ? 0 : (r[metric] ?? 0))),
    ),
  );
  const height = 74,
    width = 600,
    cell = width / days.length;
  const x = (i) => (i + 0.5) * cell;
  const y = (n) => 3 + (height - 6) * (1 - n / max);
  const barWidth = Math.min(56, cell * 0.65);
  let comparison = "",
    previous = false;
  const points = [],
    bars = [];
  samples.forEach((s, i) => {
    if (Number.isFinite(s.value)) {
      const h = Math.max(1.8, y(0) - y(s.value));
      bars.push(
        `<rect data-aj-bar="${i}" x="${x(i) - barWidth / 2}" y="${y(0) - h}" width="${barWidth}" height="${h}" rx="${Math.min(2, h / 2)}"/>`,
      );
    } else if (s.inactive) {
      bars.push(
        `<rect class="aj-absent-day" x="${x(i) - cell / 2}" y="0" width="${cell}" height="${height}"/>`,
      );
    }
    const known = Number.isFinite(s.mean);
    if (known) {
      comparison += `${previous ? "L" : "M"}${x(i)},${y(s.mean)} `;
      if (!previous && !Number.isFinite(samples[i + 1]?.mean))
        points.push(`<circle cx="${x(i)}" cy="${y(s.mean)}" r="2"/>`);
    }
    previous = known;
  });
  return {
    max,
    hasPeers,
    samples,
    svg: `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
    <path class="aj-gridlines" d="M0 3h600 M0 37h600 M0 71h600"/>
    <g class="aj-bars">${bars.join("")}</g><path class="aj-peer-line" d="${comparison}"/><g class="aj-peer-points">${points.join("")}</g>
    </svg>`,
  };
}

export function createAgentInspector(
  container,
  investigation,
  {
    day,
    seat = 0,
    metric: startingMetric,
    onDayChange,
    onSeatChange,
    onMetricChange,
  } = {},
) {
  const { days, seats } = investigation;
  container.classList.add("agent-journal");
  if (!days.length || !seats.length) {
    container.innerHTML =
      '<p class="aj-empty">This replay has no individual turns to inspect.</p>';
    return { setDay() {}, setSeat() {}, setMetric() {}, getMetric: () => null };
  }
  let index = Math.max(
    0,
    days.findIndex((d) => d.round === day),
  );
  let seatIndex = seats[seat] ? seat : 0;
  const availableMetrics = Object.keys(metrics).filter((key) =>
    days.some((d) => d.seats.some((r) => r.active !== false && r[key] != null)),
  );
  const defaultMetric = availableMetrics[0] ?? "harvested";
  let metric =
    isJournalMetric(startingMetric) && availableMetrics.includes(startingMetric)
      ? startingMetric
      : defaultMetric;
  let plot;
  container.innerHTML = `<h2>Choose an amoeboid</h2>
    <div class="aj-roster" role="group" aria-label="Amoeboid to inspect">${seats
      .map(
        (s) => `
      <button type="button" data-aj-seat="${s.index}" title="${esc(s.name)}" aria-label="Seat ${s.index + 1}, ${esc(s.name)}">
      <span class="aj-thumbnail" style="--aj-plant:${colors[s.appearance] || colors[0]}">${portrait(s.appearance)}</span><span>${esc(s.name)}</span></button>`,
      )
      .join("")}</div>
    <div class="aj-sheet">
      <div class="aj-profile"></div>
      <section class="aj-activity" ${availableMetrics.length ? "" : "hidden"}>
        <header><h3>Activity across the run</h3><label><span class="visually-hidden">Activity to compare</span><select data-aj-metric>${availableMetrics
          .map((key) => `<option value="${key}">${metrics[key].name}</option>`)
          .join("")}</select></label></header>
        <div class="aj-legend"><b class="aj-day-value"></b><span class="aj-own"><b></b> <strong></strong></span><span class="aj-peers">Other active amoeboids’ mean <strong></strong></span></div>
        <div class="aj-chart"><div class="aj-axis-y" aria-hidden="true"><span></span><span>0</span></div><div class="aj-track" role="slider" tabindex="0" aria-label="Day on the amoeboid activity chart" aria-valuemin="${days[0].round}" aria-valuemax="${days.at(-1).round}">
          <div class="aj-series"></div><i class="aj-line" aria-hidden="true"></i></div></div>
        <div class="aj-axis-x" aria-hidden="true"><span>Day ${days[0].round}</span>${days.length === 1 ? "" : `<span>Day ${days.at(-1).round}</span>`}</div>
      </section>
      <section class="aj-day"><header><h3>The day’s decisions</h3><div class="aj-day-picker">
        <button type="button" data-aj-prev aria-label="Previous day">${icon("back")}</button>
        <select aria-label="Day to inspect in amoeboid journal" data-aj-day>${days.map((d) => `<option value="${d.round}">Day ${d.round}</option>`).join("")}</select>
        <button type="button" data-aj-next aria-label="Next day">${icon("next")}</button>
      </div></header><div class="aj-record"></div></section>
    </div><p class="visually-hidden" data-aj-announce aria-live="polite" aria-atomic="true"></p>`;
  const el = (selector) => container.querySelector(selector);
  const track = el(".aj-track"),
    daySelect = el("[data-aj-day]"),
    record = el(".aj-record");
  function profile() {
    const s = seats[seatIndex];
    const buttons = container.querySelectorAll("[data-aj-seat]");
    buttons.forEach((btn, i) =>
      btn.setAttribute("aria-pressed", String(seatIndex === i)),
    );
    const strategy = strategyLabel(s.strategy);
    const totals = [
      ["Carrots harvested", "harvested"],
      ["Energy given", "energyGiven"],
      ["Carrots eaten", "eaten"],
    ].filter(([, key]) => s.lifetime[key] != null);
    el(".aj-profile").innerHTML =
      `<div class="aj-identity"><span class="aj-avatar" style="--aj-plant:${colors[s.appearance] || colors[0]}">${portrait(s.appearance)}</span><div>
      <p class="aj-seat-number">Seat ${s.index + 1}${strategy ? ` · ${esc(strategy)}` : ""}${s.strategy?.name ? ` · ${esc(s.strategy.name)}` : ""}</p>
      <h3>${esc(s.name)}</h3><p class="aj-fate">${esc(fate(s))}</p></div></div>
      <dl class="aj-lifetime" style="--aj-totals:${totals.length}" ${totals.length ? "" : "hidden"}><dt>Run totals</dt>${totals
        .map(
          ([label, key]) =>
            `<dd><strong>${format(s.lifetime[key])}</strong><span>${label}</span></dd>`,
        )
        .join("")}</dl>`;
    el(".aj-own b").textContent = s.name;
  }
  function drawPlot() {
    el("[data-aj-metric]").value = metric;
    plot = activityPlot(days, seats[seatIndex], metric);
    el(".aj-series").innerHTML = plot.svg;
    el(".aj-axis-y span").textContent = plot.max;
    el(".aj-peers").hidden = !plot.hasPeers;
  }
  function updateDay(announce = false) {
    const d = days[index],
      s = seats[seatIndex],
      sample = plot.samples[index];
    el(".aj-line").style.left = `${(100 * (index + 0.5)) / days.length}%`;
    const unit = metrics[metric].unit;
    const ownValue = sample.inactive
      ? "Inactive"
      : sample.value != null
        ? quantity(sample.value, unit)
        : "Unrecorded";
    el(".aj-day-value").textContent = `Day ${d.round}`;
    el(".aj-bars .is-selected")?.classList.remove("is-selected");
    el(`[data-aj-bar="${index}"]`)?.classList.add("is-selected");
    el(".aj-own strong").textContent = ownValue;
    el(".aj-peers strong").textContent = Number.isFinite(sample.mean)
      ? quantity(sample.mean, unit)
      : "—";
    track.setAttribute("aria-valuenow", d.round);
    track.setAttribute(
      "aria-valuetext",
      `Day ${d.round}, ${s.name}, ${metrics[metric].name}, ${ownValue}`,
    );
    const detailsOpen = record.querySelector("details")?.open;
    record.innerHTML = dayRecord(s, d, seats);
    if (detailsOpen && record.querySelector("details"))
      record.querySelector("details").open = true;
    daySelect.value = String(d.round);
    el("[data-aj-prev]").disabled = index === 0;
    el("[data-aj-next]").disabled = index === days.length - 1;
    if (announce)
      el("[data-aj-announce]").textContent =
        `${s.name}, day ${d.round}. ${metrics[metric].name}, ${ownValue}.`;
  }
  function setDay(round, notify = false) {
    const n = days.findIndex((d) => d.round === round);
    if (n < 0 || n === index) return;
    index = n;
    updateDay(notify);
    if (notify) onDayChange?.(round);
  }
  function setSeat(n, notify = false) {
    if (!Number.isInteger(n) || !seats[n] || n === seatIndex) return;
    seatIndex = n;
    profile();
    drawPlot();
    updateDay(notify);
    if (notify) onSeatChange?.(n);
  }
  container.querySelector(".aj-roster").onclick = (event) => {
    const btn = event.target.closest("[data-aj-seat]");
    if (btn) setSeat(Number(btn.dataset.ajSeat), true);
  };
  record.onclick = (event) => {
    const source = event.target.closest("[data-aj-funder]");
    if (source) {
      const { ajFunder, ajSourceDay } = source.dataset;
      setSeat(Number(ajFunder), true);
      setDay(Number(ajSourceDay), true);
    } else if (event.target.closest("[data-aj-last]")) {
      setDay(seats[seatIndex].diedRound, true);
    } else return;
    daySelect.focus({ preventScroll: true });
  };
  daySelect.onchange = () => setDay(Number(daySelect.value), true);
  function setMetric(key, notify = false) {
    const next =
      isJournalMetric(key) && availableMetrics.includes(key) ? key : defaultMetric;
    if (next === metric) return;
    metric = next;
    drawPlot();
    updateDay(notify);
    if (notify) onMetricChange?.(metric);
  }
  el("[data-aj-metric]").onchange = (event) => setMetric(event.target.value, true);
  function step(amount) {
    const n = Math.min(days.length - 1, Math.max(0, index + amount));
    setDay(days[n].round, true);
  }
  el("[data-aj-prev]").onclick = () => step(-1);
  el("[data-aj-next]").onclick = () => step(1);
  track.onkeydown = (event) => {
    const byKey = {
      ArrowLeft: -1,
      ArrowDown: -1,
      ArrowRight: 1,
      ArrowUp: 1,
      PageDown: -5,
      PageUp: 5,
      Home: -days.length,
      End: days.length,
    };
    if (!Object.hasOwn(byKey, event.key)) return;
    event.preventDefault();
    step(byKey[event.key]);
  };
  function selectAtPointer(event) {
    const bounds = track.getBoundingClientRect();
    const n = Math.floor(((event.clientX - bounds.left) * days.length) / bounds.width);
    setDay(days[Math.max(0, Math.min(days.length - 1, n))].round, true);
  }
  track.onpointerdown = (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    track.setPointerCapture(event.pointerId);
    selectAtPointer(event);
  };
  track.onpointermove = (event) => {
    if (track.hasPointerCapture(event.pointerId)) selectAtPointer(event);
  };
  profile();
  drawPlot();
  updateDay();
  return { setDay, setSeat, setMetric, getMetric: () => metric };
}
