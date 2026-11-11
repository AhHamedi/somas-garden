import { colors, portrait } from "./characters.js";
import { gardenLayout } from "./garden-layout.js";
import { landscape } from "./garden-landscape.js";
import { drawGrowingCarrot } from "./icons.js";
import { summarizeRun } from "./results-data.js";
import { investigateRun } from "./run-investigation.js";
import { createAgentInspector, isJournalMetric } from "./agent-inspector.js";
import { renderGardenDay } from "./garden-day-report.js";
export { summarizeRun };

const esc = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[s],
  );
const display = (n) => (n === null ? "—" : n.toLocaleString("en"));
const icons = {
  overview: '<path d="M2 15h16M3 12l4-4 4 2 5-6"/><circle cx="16" cy="4" r="1"/>',
  journal:
    '<path d="M3 3.5c2.7-.7 5-.3 7 1.3 2-1.6 4.3-2 7-1.3v12c-2.7-.6-5-.2-7 1.5-2-1.7-4.3-2.1-7-1.5zM10 5v12"/>',
  replay: '<path d="M3 8a7 7 0 1 1-.4 5M3 3v5h5"/>',
  setup:
    '<path d="M2 6h4m5 0h7M2 14h9m5 0h2"/><circle cx="8.5" cy="6" r="2.5"/><circle cx="13.5" cy="14" r="2.5"/>',
  share: '<path d="m7 12 6-6m-5-1 2-2a4 4 0 0 1 6 6l-2 2m-2 4-2 2a4 4 0 0 1-6-6l2-2"/>',
  back: '<path d="m8 4-6 6 6 6m-5-6h15"/>',
  sun: '<circle cx="10" cy="10" r="3.5"/><path d="M10 1v2m0 14v2M1 10h2m14 0h2M3.6 3.6l1.5 1.5m9.8 9.8 1.5 1.5m0-12.8-1.5 1.5m-9.8 9.8-1.5 1.5"/>',
  moon: '<path d="M15.9 12.9A7.1 7.1 0 0 1 7.1 4.1a7 7 0 1 0 8.8 8.8Z"/>',
};
const icon = (name) =>
  `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;

function gardenIllustration(element, summary) {
  const canvas = element.querySelector("canvas");
  const c = canvas.getContext("2d");
  if (!c) return;
  const w = 430,
    h = 190;
  const scale = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = w * scale;
  canvas.height = h * scale;
  c.scale(scale, scale);
  const dusk = summary.outcome === "extinction";
  const sky = c.createLinearGradient(0, 0, 0, 118);
  sky.addColorStop(0, dusk ? "#526272" : "#dce9df");
  sky.addColorStop(1, dusk ? "#c4b4a0" : "#ffe8ab");
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);

  const light = c.createRadialGradient(325, 34, 6, 325, 34, dusk ? 42 : 112);
  light.addColorStop(0, dusk ? "#f5ebcc50" : "#ffefaecc");
  light.addColorStop(1, "#ffefbd00");
  c.fillStyle = light;
  c.fillRect(0, 0, w, 142);
  c.fillStyle = dusk ? "#f6ecd0" : "#fff1c1";
  c.beginPath();
  c.arc(325, 34, dusk ? 12 : 17, 0, Math.PI * 2);
  c.fill();
  if (dusk) {
    c.fillStyle = "#fff0c9";
    for (const [x, y, r] of [
      [24, 27, 1],
      [78, 43, 1],
      [138, 15, 1.3],
      [223, 27, 1],
      [284, 10, 0.7],
      [387, 39, 1.2],
      [412, 16, 0.7],
    ]) {
      c.beginPath();
      c.arc(x, y, r, 0, 2 * Math.PI);
      c.fill();
    }
  }
  const hill = new Path2D("M0 72Q52 41 110 58T237 68Q302 44 346 51T430 64V190H0Z");
  c.fillStyle = dusk ? "#85948b" : "#b1c6a0";
  c.fill(hill);
  c.fillStyle = dusk ? "#73887b" : "#a2ba8e";
  c.fill(new Path2D("M0 76Q68 55 135 76T270 74Q366 51 430 67V190H0Z"));

  const layout = gardenLayout(false, Math.max(1, summary.seats.length), {
    fieldCapacity: summary.capacity,
  });
  const garden = landscape(layout, 0.85);
  c.save();
  c.clip(new Path2D("M0 86Q83 62 158 81Q242 97 321 78Q378 62 430 76V190H0Z"));
  c.drawImage(garden, 0, 68, w, 122);
  c.save();
  c.translate(0, 68);
  c.scale(w / layout.w, 122 / layout.h);
  const cropSize = Math.min(
    33,
    (layout.bed.width - 22) / layout.bed.columns,
    (1.13 * (layout.bed.height - 13)) / layout.bed.rows,
  );
  for (let i = 0; i < (summary.closing ?? 0); i++)
    drawGrowingCarrot(c, ...layout.plot(i), cropSize, i);
  c.restore();
  const wash = c.createLinearGradient(0, 65, 0, 190);
  wash.addColorStop(0, dusk ? "#314b609a" : "#fae8b633");
  wash.addColorStop(1, dusk ? "#324e52b3" : "#907a3c19");
  c.fillStyle = wash;
  c.fillRect(0, 60, w, 130);
  c.restore();

  // Portrait SVGs stay crisp on a cold first render of a shared results link.
  if (summary.outcome === "complete") return;
  summary.seats.forEach((seat, i) => {
    const [x, y] = layout.homes[i];
    const plant = document.createElement("span");
    plant.className = "gr-hero-plant" + (seat.dead ? " is-spirit" : "");
    plant.style.left = (100 * x) / layout.w + "%";
    const baseline = 68 + (y * 122) / layout.h + (seat.dead ? -1 : 9);
    plant.style.top = (100 * baseline) / h + "%";
    plant.style.width = (seat.dead ? 8.5 : 12) + "%";
    plant.innerHTML = portrait(seat.appearance, seat.dead);
    element.append(plant);
  });
}

function fieldAxis(values) {
  const highest = Math.max(1, ...values);
  const step = highest <= 10 ? 1 : highest <= 40 ? 5 : 10;
  return Math.ceil(highest / step) * step;
}

function recordedSettings(trace) {
  const s = trace.settings;
  if (!s) return "";
  function range(rule) {
    if (rule?.mode === "fixed") return rule.value;
    if (rule?.mode === "random")
      return `${rule.min}–${rule.max} · ${rule.perAgent ? "per amoeboid" : "per day"}`;
    if (rule?.mode === "density")
      return `${rule.empty} when empty, ${rule.full} when full`;
    return null;
  }
  const ready = trace.frames?.find((f) => f.phase === "ready");
  const pantries = ready?.agents?.map((a) => a.pantry);
  const start =
    pantries?.length && pantries.every(Number.isInteger)
      ? [...new Set(pantries)].length === 1
        ? pantries[0] + " each"
        : pantries.map((n, i) => `${ready.agents[i].name} ${n}`).join(" · ")
      : null;
  const rules = [
    ["Days to play", s.roundLimit ?? 30],
    ["Carrots per supper", s.dailyFood],
    [
      "Uneaten carrots",
      typeof s.carryFood === "boolean"
        ? s.carryFood
          ? "Carry over"
          : "Discard after supper"
        : null,
    ],
    ["Starting pantries", start],
    ["Starting field", s.startingField],
    ["Field capacity", s.fieldCapacity],
    ["Daily sunlight", range(s.sunlight)],
    ["Energy capacity per amoeboid", s.energyCapacity],
    ["Energy per carrot", range(s.price)],
    ["Minimum field to plant", s.plantingMinimum],
    ["Random seed", Number.isSafeInteger(trace.seed) ? trace.seed : null],
  ];
  return `<details class="gr-settings"><summary>Recorded garden rules</summary><dl>${rules
    .filter(([, v]) => v != null)
    .map(([label, v]) => `<div><dt>${label}</dt><dd>${esc(v)}</dd></div>`)
    .join("")}</dl></details>`;
}

function supplyChart(run) {
  const days = run.history.filter(
    (day) => day.afterHarvest !== null && day.closing !== null,
  );
  const title = '<h2 id="results-field-title">Field stock</h2>';
  if (days.length === 1) {
    const day = days[0];
    return (
      title +
      `<p class="gr-field-caption">Carrots in the field on day ${day.round}</p>
      <dl class="gr-one-day">${[
        ["Start", run.opening],
        ["After harvest", day.afterHarvest],
        ["End", day.closing],
      ]
        .map(
          ([label, n]) =>
            `<div><dt>${label}</dt><dd>${display(n)}</dd><i style="--filled:${((n ?? 0) / fieldAxis([run.opening, day.afterHarvest, day.closing])) * 100}%" aria-hidden="true"></i></div>`,
        )
        .join("")}</dl>`
    );
  }
  const caption = `<p class="gr-field-caption"><strong>${display(run.opening)}</strong> carrots at the start <span aria-hidden="true">·</span> <strong>${display(run.closing)}</strong> at the end</p>`;
  if (!days.length) return title + caption;
  const upper = fieldAxis(days.flatMap((day) => [day.afterHarvest, day.closing]));
  const x = (i) => 3 + (594 * i) / (days.length - 1);
  const y = (n) => 112 - (108 * n) / upper;
  const points = (key) =>
    days.map((d, i) => `${x(i).toFixed(2)},${y(d[key]).toFixed(2)}`).join(" ");
  const close = points("closing"),
    harvest = points("afterHarvest");
  return (
    title +
    caption +
    `<div class="gr-chart-controls"><div class="gr-key"><span>After harvest <b data-gr-harvest></b></span><span>Day’s end <b data-gr-close></b></span></div>
    <span class="gr-chart-day" data-chart-day></span></div>
    <div class="gr-plot" role="img" aria-label="Field stock, days ${days[0].round} to ${days.at(-1).round}. Daily values follow.">
      <div class="gr-axis-y" aria-hidden="true"><span>${upper}</span><span>0</span></div>
      <div class="gr-lines"><div class="gr-line-area"><svg aria-hidden="true" viewBox="0 0 600 116" preserveAspectRatio="none">
        <path class="gr-gridline" d="M0 4h600 M0 58h600 M0 112h600"/>
        <polygon fill="#e1ead749" points="3,112 ${close} 597,112"/>
        <polyline class="gr-close-line" points="${close}"/><polyline class="gr-harvest-line" points="${harvest}"/>
      </svg><span class="gr-cursor"><i></i><i></i></span></div><div class="gr-axis-x"><span>Day ${days[0].round}</span><span>Day ${days.at(-1).round}</span></div></div>
    </div>
    <details class="gr-values"><summary>Daily values</summary><div class="gr-values-scroll" tabindex="0" role="region" aria-label="Daily field stock">
      <table><caption class="visually-hidden">Carrots remaining after harvest and at day’s end</caption><thead><tr><th scope="col">Day</th><th scope="col">After harvest</th><th scope="col">Day’s end</th></tr></thead>
      <tbody>${days.map((day) => `<tr><th scope="row">${day.round}</th><td>${day.afterHarvest}</td><td>${day.closing}</td></tr>`).join("")}</tbody></table></div></details>`
  );
}

function enableChart(container, run, onDay) {
  const chart = container.querySelector(".gr-line-area");
  if (!chart) return () => {};
  const days = run.history.filter(
    (day) => day.afterHarvest !== null && day.closing !== null,
  );
  const cursor = chart.querySelector(".gr-cursor");
  const upper = fieldAxis(days.flatMap((day) => [day.afterHarvest, day.closing]));
  const harvest = container.querySelector("[data-gr-harvest]");
  const close = container.querySelector("[data-gr-close]");
  function selectDay(round) {
    const index = days.findIndex((d) => d.round === round);
    if (index < 0) return;
    const day = days[index];
    container.querySelector("[data-chart-day]").textContent = "Day " + round;
    harvest.textContent = day.afterHarvest;
    close.textContent = day.closing;
    cursor.style.left = 0.5 + (99 * index) / (days.length - 1) + "%";
    cursor.firstElementChild.style.top =
      ((112 - (108 * day.afterHarvest) / upper) / 116) * 100 + "%";
    cursor.lastElementChild.style.top =
      ((112 - (108 * day.closing) / upper) / 116) * 100 + "%";
  }
  function inspect(event) {
    const box = chart.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
    onDay(days[Math.round(position * (days.length - 1))].round);
  }
  chart.onpointerdown = (event) => {
    if (event.button !== 0) return;
    chart.setPointerCapture(event.pointerId);
    inspect(event);
  };
  chart.onpointermove = (event) => {
    if (chart.hasPointerCapture(event.pointerId)) inspect(event);
  };
  return selectDay;
}

const metrics = [
  ["harvested", "Carrots harvested", "Harvested"],
  ["grown", "Carrots grown", "Grown"],
  ["eaten", "Carrots eaten", "Eaten"],
  ["energy", "Energy given", "Energy given"],
];
function ledgers(run) {
  const columns = metrics.filter(
    ([key]) => key !== "grown" && run.seats.some((seat) => seat[key] !== null),
  );
  const rows = run.seats
    .map((seat, index) => {
      const status =
        seat.dead === null
          ? ""
          : seat.dead
            ? seat.diedRound
              ? "Died on day " + seat.diedRound
              : "Died"
            : "Survived";
      const tone = seat.dead === true ? "lost" : "living";
      return `<tr><th scope="row"><div class="gr-identity"><span class="gr-pot" style="--plant-color:${colors[seat.appearance] ?? colors[0]}">${portrait(seat.appearance, seat.dead === true)}</span><div>
        <button class="gr-name gr-seat-link" type="button" data-open-seat="${index}" aria-label="Open ${esc(seat.name)}’s journal">${esc(seat.name)} <span aria-hidden="true">↗</span></button>${status ? `<span class="gr-fate ${tone}">${status}</span>` : ""}
        ${seat.error ? `<details class="gr-agent-error"><summary>Agent error</summary><p>${esc(seat.error)}</p></details>` : ""}
      </div></div></th>${columns.map(([key, , label]) => `<td><span class="gr-mobile-label" aria-hidden="true">${label}</span>${display(seat[key])}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<table class="gr-seats" role="table" style="--column-count:${Math.max(1, columns.length)}"><caption class="visually-hidden">Amoeboid outcomes and lifetime totals in seat order</caption>
    <thead><tr><th scope="col">Amoeboid</th>${columns.map(([, label, short]) => `<th scope="col"><span aria-hidden="true">${short}</span><span class="visually-hidden">${label}</span></th>`).join("")}</tr></thead>
    <tbody>${rows}</tbody></table>`;
}

export function createResults(
  container,
  {
    onReplay,
    onSetup,
    onShare,
    onReturn,
    onSelection,
    shareLabel = () => "Copy results link",
  },
) {
  let current, run, research, inspector, selectChartDay;
  let round = 1,
    seat = 0,
    journal = false,
    metric = "harvested";
  const find = (selector) => container.querySelector(selector);

  function selectDay(next) {
    const index = research.days.findIndex((d) => d.round === next);
    if (index < 0) return;
    round = next;
    const picker = find("[data-gr-day]");
    picker.value = String(index);
    find("[data-prev-day]").disabled = index === 0;
    find("[data-next-day]").disabled = index === research.days.length - 1;
    find("[data-garden-day-title]").textContent = `Inside day ${round}`;
    selectChartDay(round);
    renderGardenDay(find("[data-day-detail]"), research.days[index], research.seats);
    inspector?.setDay(round);
  }
  function publishDay(next) {
    if (next !== round) {
      selectDay(next);
      onSelection();
    }
  }
  function showPanel(isJournal, focus = false) {
    journal = isJournal && research.seats.length > 0 && research.days.length > 0;
    const selected = journal ? "journal" : "overview";
    for (const tab of container.querySelectorAll("[role=tab][data-report-tab]")) {
      const active = tab.dataset.reportTab === selected;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      find("#" + tab.getAttribute("aria-controls")).hidden = !active;
    }
    if (journal && !inspector) {
      inspector = createAgentInspector(find("#report-journal"), research, {
        seat,
        day: round,
        metric,
        onDayChange: publishDay,
        onMetricChange(next) {
          metric = next;
          onSelection();
        },
        onSeatChange(next) {
          seat = next;
          onSelection();
        },
      });
    }
    if (focus) find(`[data-report-tab="${selected}"]`).focus();
  }
  function openSeat(index, fundingDay) {
    if (Number.isInteger(fundingDay) && fundingDay !== round) selectDay(fundingDay);
    seat = index;
    inspector?.setSeat(index);
    showPanel(true, true);
    find(".gr-toolbar").scrollIntoView({ block: "start", behavior: "instant" });
    onSelection();
  }
  function mount(trace) {
    current = trace;
    run = summarizeRun(trace);
    research = investigateRun(trace);
    inspector = null;
    const dusk = run.outcome === "extinction";
    const hasDays = research.days.length > 0;
    container.classList.add("garden-results");
    container.dataset.outcome = run.outcome;
    container.innerHTML = `<div class="gr-header">
      <div class="gr-heading"><p class="gr-day">${icon(dusk ? "moon" : "sun")} Day ${run.rounds} of ${run.limit}</p><h1 id="results-title" tabindex="-1">${esc(run.title)}</h1><p class="gr-subtitle">${esc(run.subtitle)}</p></div>
      <div class="gr-scenery" aria-hidden="true"><canvas></canvas></div>
    </div>
    <div class="gr-toolbar">
      <div class="gr-tabs" role="tablist" aria-label="Results perspective">
        <button type="button" id="tab-overview" role="tab" data-report-tab="overview" aria-controls="report-overview">${icon("overview")} Garden overview</button>
        <button type="button" id="tab-journal" role="tab" data-report-tab="journal" aria-controls="report-journal" ${!hasDays || !research.seats.length ? "disabled" : ""}>${icon("journal")} Amoeboid journal</button>
      </div>
      <button data-result="share" type="button" class="gr-action-link" aria-label="${shareLabel()}">${icon("share")}<span>${shareLabel()}</span></button>
    </div>
    <div class="gr-body">
      <section id="report-overview" role="tabpanel" aria-labelledby="tab-overview" tabindex="0">
        <div class="gr-overview">
          <section class="gr-field" aria-labelledby="results-field-title">${supplyChart(run)}</section>
          <section class="gr-totals"><h2>Run totals</h2><dl>${metrics
            .filter(([key]) => run.totals[key] !== null)
            .map(
              ([key, label]) =>
                `<div><dt>${label}</dt><dd>${display(run.totals[key])}</dd></div>`,
            )
            .join("")}</dl>${recordedSettings(trace)}</section>
        </div>
        <section class="gr-day-detail" data-day-detail ${hasDays ? "" : "hidden"}>
          <div class="gr-section-top">
            <h2 data-garden-day-title>Inside the day</h2>
            <div class="gr-day-picker" ${research.days.length < 2 ? "hidden" : ""}>
              <button type="button" data-prev-day aria-label="Previous garden day">‹</button>
              <select data-gr-day aria-label="Garden day to inspect">${research.days.map((day, i) => `<option value="${i}">Day ${day.round}</option>`).join("")}</select>
              <button type="button" data-next-day aria-label="Next garden day">›</button>
            </div>
          </div>
          <div class="gr-daily-grid">
            <section class="gr-harvest"><h3>Harvest order</h3><p class="gr-detail-desc" data-queue-note></p>
              <table class="gr-queue-table"><caption class="visually-hidden">Carrot requests, allocations and field stock after each turn. Amoeboid names open their journals.</caption><thead><tr><th scope="col">Amoeboid</th><th scope="col" data-asked>Asked</th><th scope="col">Took</th><th scope="col" title="Carrots remaining in the field">Field left</th></tr></thead><tbody data-queue-list></tbody></table>
            </section>
            <section class="gr-pooling"><h3>Shared planting</h3><p class="gr-pool-reading"><strong data-pool-count></strong><span data-pool-note></span></p>
              <ul data-pool-list aria-label="Contributors to carrots completed this day"></ul><p class="gr-pending" data-pool-pending hidden></p>
            </section>
          </div>
        </section>
        <section class="gr-roster"><h2>Lifetime totals by amoeboid</h2>${ledgers(run)}</section>
      </section>
      <section id="report-journal" role="tabpanel" aria-labelledby="tab-journal" hidden></section>
    </div>
    <nav class="gr-actions" aria-label="Run results actions">
      <button data-result="replay" type="button" class="primary">${icon("replay")} Replay</button>
      <button data-result="setup" type="button" class="secondary">${icon("setup")} Garden setup</button>
      <button data-result="return" type="button" class="gr-action-link">${icon("back")} Back to playback</button>
    </nav>`;
    const handlers = {
      replay: onReplay,
      setup: onSetup,
      share: onShare,
      return: onReturn,
    };
    container
      .querySelectorAll("[data-result]")
      .forEach((button) => (button.onclick = handlers[button.dataset.result]));
    const tablist = find(".gr-tabs");
    tablist.onclick = (event) => {
      const tab = event.target.closest("[data-report-tab]");
      if (tab) {
        showPanel(tab.dataset.reportTab === "journal");
        onSelection();
      }
    };
    tablist.onkeydown = (event) => {
      if (
        !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) ||
        find("#tab-journal").disabled
      )
        return;
      event.preventDefault();
      showPanel(
        event.key === "Home" ? false : event.key === "End" ? true : !journal,
        true,
      );
      onSelection();
    };
    find("#report-overview").onclick = (event) => {
      const link = event.target.closest("[data-open-seat]");
      if (link) openSeat(Number(link.dataset.openSeat), Number(link.dataset.openDay));
    };
    const picker = find("[data-gr-day]");
    picker.onchange = () => publishDay(research.days[Number(picker.value)].round);
    find("[data-prev-day]").onclick = () =>
      publishDay(research.days[Number(picker.value) - 1].round);
    find("[data-next-day]").onclick = () =>
      publishDay(research.days[Number(picker.value) + 1].round);
    selectChartDay = enableChart(container, run, publishDay);
    gardenIllustration(find(".gr-scenery"), run);
  }
  return {
    selection() {
      return {
        round,
        seat: journal ? seat : null,
        metric: inspector?.getMetric() || "harvested",
      };
    },
    show(
      trace,
      { canReturn = false, focus = false, day, selectedSeat, selectedMetric } = {},
    ) {
      if (current !== trace) mount(trace);
      seat =
        Number.isInteger(selectedSeat) && research.seats[selectedSeat] ? selectedSeat : 0;
      metric = isJournalMetric(selectedMetric) ? selectedMetric : "harvested";
      inspector?.setMetric(metric);
      inspector?.setSeat(seat);
      selectDay(
        research.days.some((d) => d.round === day) ? day : research.days[0]?.round,
      );
      showPanel(selectedSeat === seat);
      find('[data-result="return"]').hidden = !canReturn;
      if (focus) find("#results-title").focus({ preventScroll: true });
      return run;
    },
  };
}
