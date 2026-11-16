// New world, team behaviours, saved worlds and the guide.

import { esc, fmt, plural, teamColor, PHASES, migrateTeams } from "/game/model.js";
import { $, icon, toast } from "/game/dom.js";

const copy = (v) => structuredClone(v);
const spell = (p) =>
  p >= 1
    ? "Weather never changes"
    : `Weather lasts ${fmt(1 / (1 - p), 1)} days on average`;

// Control definitions: slider range for comfortable tuning; the number box
// accepts anything the engine accepts.
const CTL = {
  copies: ["Amoeboids per team", 1, 100, 1, 500],
  plots: ["Plots", 1, 24, 1, 48],
  months: ["Months", 1, 24, 1, 24],
  days: ["Days a month", 1, 60, 1, 365],
  dailyFood: ["Daily need", 0, 10, 1, 1000, "carrots"],
  bodyCapacity: ["Body capacity", 1, 10, 1, 100],
  harvestLimit: ["Harvest limit", 0, 20, 1, 1000, "a day"],
  personalCapacity: ["Private store", 1, 60, 1, 10000, "carrots"],
  capacityPerAgent: ["Field per Amoeboid", 1, 50, 1, 1000, "carrots"],
  startingStock: ["Starting stock", 0, 1, 0.05, 1, "%", 100],
  growth: ["Growth coefficient", 0, 20, 0.1, 100],
  productiveCapacity: ["Carrots per worker", 1, 50, 1, 1000],
  reservePerResident: ["Treasury per resident", 0, 100, 1, 10000],
  mindCapacity: ["Mind capacity", 1, 40, 1, 100],
  startingMind: ["Starting mind", 0, 40, 1, 100],
  "weatherRates.0": ["Sunny", 0, 40, 1, 10000, "mind"],
  "weatherRates.1": ["Cloudy", 0, 40, 1, 10000, "mind"],
  "weatherRates.2": ["Dark", 0, 40, 1, 10000, "mind"],
  outsideMind: ["Wilds", 0, 40, 1, 100, "mind"],
  weatherPersistence: ["Persistence", 0, 1, 0.05, 1, "%", 100],
  respawnDays: ["Days missed", 0, 30, 1, 365, "days"],
  proposalCost: ["Table a motion", 0, 5, 0.1, 100, "mind"],
  voteCost: ["Vote yes or no", 0, 2, 0.01, 100, "mind"],
  officerCost: ["Officer order", 0, 2, 0.01, 100, "mind"],
  readCost: ["Read records", 0, 2, 0.01, 100, "mind"],
  offerCost: ["Offer food", 0, 2, 0.01, 100, "mind"],
  governmentCost: ["Found a government", 0, 100, 1, 1000, "mind"],
  federationCost: ["Found a federation", 0, 200, 1, 1000, "mind"],
  joiningCost: ["Join a federation", 0, 100, 1, 1000, "mind"],
  enforcementCost: ["Hard quota", 0, 1, 0.01, 100, "mind per resident"],
  recordsCost: ["Records", 0, 1, 0.01, 100, "mind per resident"],
  federationRunningCost: ["Federation services", 0, 5, 0.1, 100, "mind per plot"],
  startingInfluence: ["Starting influence", 1, 10, 1, 100],
  maxInfluence: ["Maximum influence", 1, 10, 1, 100],
  foundingWindow: ["Federation window", 1, 30, 1, 100, "days"],
  disputeWindow: ["Dispute window", 1, 30, 1, 100, "days"],
  immigrationLookback: ["Sanction lookback", 0, 60, 1, 100, "days"],
  decisionMs: ["Decision time", 1, 1000, 1, 10000, "ms"],
  memoryBytes: ["Memory", 1024, 4194304, 1024, 16777216, "bytes"],
};

const SECTIONS = [
  ["world", "World", "world"],
  ["teams", "Teams", "people"],
  ["food", "Food", "carrot"],
  ["mind", "Mind and weather", "sun"],
  ["politics", "Politics", "hall"],
  ["agents", "Agents", "mind"],
];

/** Field capacities exactly as the engine assigns them. */
export function plotCapacities(plots, total) {
  const weights = Array.from({ length: plots }, (_, i) => [0.8, 1, 1.2][i % 3]);
  const sum = weights.reduce((t, w) => t + w, 0);
  const raw = weights.map((w) => (total * w) / sum);
  const caps = raw.map(Math.floor);
  let left = total - caps.reduce((t, c) => t + c, 0);
  const order = raw
    .map((r, i) => [r - Math.floor(r), i])
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) caps[order[k][1]]++;
  return caps;
}

function svgFrame(w, h, inner, label) {
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="cfg-chart" role="img" aria-label="${esc(label)}">${inner}</svg>`;
}

/** A meal's outcome for each number of carrots eaten, from a full body. */
function mealChart(set, W) {
  const need = set.dailyFood;
  const max = Math.min(16, Math.max(set.personalCapacity, need + 6));
  const H = 196,
    base = 118,
    L = 8,
    step = (W - L - 8) / (max + 1),
    bw = Math.min(30, step - 6);
  const top = Math.log2(1 + Math.max(1, max - need));
  const bars = [];
  for (let e = 0; e <= max; e++) {
    const x = L + e * step + (step - bw) / 2;
    if (e < need) {
      const loss = need - e;
      const dies = loss >= set.bodyCapacity;
      // Only the hungriest survivable meal and the first fatal one are labelled.
      const label = dies
        ? need - (e + 1) < set.bodyCapacity
          ? "dies"
          : ""
        : `−${fmt(loss, 2)}`;
      const h = dies ? 40 : Math.max(4, (loss / set.bodyCapacity) * 40);
      bars.push(
        `<rect x="${x}" y="${base}" width="${bw}" height="${h}" rx="3" fill="var(--body)" opacity="${dies ? 1 : 0.55}"/>${label ? `<text x="${x + bw / 2}" y="${base + h + 13}" text-anchor="middle" class="cv">${label}</text>` : ""}`,
      );
    } else {
      const v = Math.log2(1 + e - need);
      const h = (v / top) * 92;
      bars.push(
        `<rect x="${x}" y="${base - Math.max(2, h)}" width="${bw}" height="${Math.max(2, h)}" rx="3" fill="var(--joy)" opacity="${v ? 1 : 0.4}"/>${v ? `<text x="${x + bw / 2}" y="${base - h - 5}" text-anchor="middle" class="cv">${fmt(v, 1)}</text>` : ""}`,
      );
    }
    bars.push(
      `<text x="${x + bw / 2}" y="${H - 3}" text-anchor="middle" class="cx">${e}</text>`,
    );
  }
  const nx = L + need * step - 0.5;
  return svgFrame(
    W,
    H,
    `<line x1="${L}" x2="${W - 8}" y1="${base}" y2="${base}" class="axis"/><line x1="${nx}" x2="${nx}" y1="14" y2="${base + 44}" class="need"/><text x="${nx + 6}" y="22" class="cl">need ${fmt(need)}</text>${bars.join("")}`,
    "Satisfaction and body loss by carrots eaten",
  );
}

/** Daily regrowth of an average plot by stock, against what its residents need. */
function growthChart(set, population, W) {
  const plots = Math.max(1, set.plots);
  const K = (set.capacityPerAgent * population) / plots;
  const n = population / plots;
  const g = set.growth * Math.min(n, K / Math.max(1e-9, set.productiveCapacity));
  const need = n * set.dailyFood;
  const grow = (f) => Math.max(0, Math.min(g * f, K * (1 - f)));
  const peakAt = g + K > 0 ? K / (g + K) : 0;
  const peak = grow(peakAt);
  const H = 190,
    L = 8,
    B = 160,
    T = 22;
  const ymax = Math.max(peak, need) * 1.12 || 1;
  const x = (f) => L + f * (W - L - 12);
  const y = (v) => B - (v / ymax) * (B - T);
  const pts = [];
  for (let i = 0; i <= 80; i++)
    pts.push(`${x(i / 80).toFixed(1)},${y(grow(i / 80)).toFixed(1)}`);
  const start = set.startingStock;
  return svgFrame(
    W,
    H,
    `<polygon points="${x(0)},${B} ${pts.join(" ")} ${x(1)},${B}" fill="var(--carrot)" opacity="0.16"/>
     <polyline points="${pts.join(" ")}" fill="none" stroke="var(--carrot)" stroke-width="3" stroke-linejoin="round"/>
     <line x1="${L}" x2="${x(1)}" y1="${B}" y2="${B}" class="axis"/>
     <line x1="${L}" x2="${x(1)}" y1="${y(need)}" y2="${y(need)}" class="need"/>
     <text x="${L}" y="${y(need) - 6}" class="cl"${peak < need ? ' style="fill:var(--body)"' : ""}>residents eat ${fmt(need, need < 10 ? 1 : 0)} a day</text>
     <text x="${x(peakAt)}" y="${y(peak) - 8 > y(need) + 4 || y(peak) - 8 < y(need) - 16 ? y(peak) - 8 : y(peak) + 20}" text-anchor="middle" class="cl" style="fill:var(--carrot)">grows up to ${fmt(peak, peak < 10 ? 1 : 0)} a day</text>
     <circle cx="${x(start)}" cy="${y(grow(start))}" r="5" fill="var(--carrot)" stroke="var(--panel-solid)" stroke-width="2"/>
     <text x="${x(start)}" y="${B + 14}" text-anchor="middle" class="cv">start ${Math.round(start * 100)}%</text>
     ${start > 0.08 ? `<text x="${L}" y="${B + 14}" class="cx">empty</text>` : ""}${start < 0.9 ? `<text x="${x(1)}" y="${B + 14}" text-anchor="end" class="cx">full ${fmt(Math.round(K))}</text>` : ""}`,
    "Daily regrowth by field stock",
  );
}

function weatherChart(set, W) {
  const items = [
    ["Sunny", set.weatherRates[0], "#ffd36e"],
    ["Cloudy", set.weatherRates[1], "#c9d6e6"],
    ["Dark", set.weatherRates[2], "#7f8fb0"],
    ["Wilds", set.outsideMind, "#c9b88d"],
  ];
  const H = 176,
    B = 146,
    T = 22;
  const max = Math.max(set.mindCapacity, ...items.map((i) => i[1]), 1);
  const y = (v) => B - (Math.min(v, max) / max) * (B - T);
  const step = (W - 16) / items.length;
  const bw = Math.min(90, step - 24);
  const bars = items
    .map(([n, v, c], i) => {
      const x = 8 + i * step + (step - bw) / 2;
      return `<rect x="${x}" y="${y(v)}" width="${bw}" height="${Math.max(2, B - y(v))}" rx="6" fill="${c}" opacity="0.9"/><text x="${x + bw / 2}" y="${y(v) - 6}" text-anchor="middle" class="cv">${fmt(v, 2)}</text><text x="${x + bw / 2}" y="${B + 18}" text-anchor="middle" class="cx">${n}</text>`;
    })
    .join("");
  const cy = y(set.mindCapacity);
  return svgFrame(
    W,
    H,
    `<line x1="8" x2="${W - 8}" y1="${cy}" y2="${cy}" class="need"/><text x="${W - 8}" y="${cy - 6}" text-anchor="end" class="cl">capacity ${fmt(set.mindCapacity, 2)}</text>${bars}<line x1="8" x2="${W - 8}" y1="${B}" y2="${B}" class="axis"/>`,
    "Mind gained a day by weather",
  );
}

function plotsChart(set, population, W) {
  const caps = plotCapacities(set.plots, set.capacityPerAgent * population);
  const max = Math.max(...caps, 1);
  const H = 70;
  const step = (W - 8) / caps.length;
  const bw = Math.min(64, step - 6);
  return svgFrame(
    W,
    H,
    caps
      .map((c, i) => {
        const h = Math.max(4, (c / max) * 38);
        const x = 4 + i * step + (step - bw) / 2;
        return `<rect x="${x}" y="${44 - h}" width="${bw}" height="${h}" rx="4" fill="var(--carrot)" opacity="0.8"/>${step > 34 ? `<text x="${x + bw / 2}" y="62" text-anchor="middle" class="cx">${caps.length <= 26 ? String.fromCharCode(65 + i) + " " : ""}${fmt(c)}</text>` : ""}`;
      })
      .join(""),
    "Field capacity of each plot",
  );
}

export class Setup {
  constructor(app) {
    this.app = app;
    this.tab = "world";
    this.draft = null;
  }
  get(key) {
    if (key === "seed") return this.draft.seed;
    if (key === "respawnDays") return Math.max(0, this.draft.settings.respawnDelay);
    return key.split(".").reduce((v, k) => v?.[k], this.draft.settings);
  }
  set(key, value) {
    if (key === "seed") return void (this.draft.seed = value);
    if (key === "respawnDays") return void (this.draft.settings.respawnDelay = value);
    const [a, b] = key.split(".");
    if (b === undefined) this.draft.settings[a] = value;
    else this.draft.settings[a][Number(b)] = value;
  }
  open(tab = "world") {
    const s = this.app.ix?.s;
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem("amoeboids.setup.v2"));
    } catch {}
    const defaults = this.app.config.settings;
    this.draft = saved?.settings
      ? {
          settings: { ...defaults, ...saved.settings },
          teams: migrateTeams(saved.teams, this.app.config.teams),
          seed: saved.seed ?? 42,
        }
      : {
          settings: copy(s?.settings || defaults),
          teams: migrateTeams(
            copy(s?.teams || this.app.config.teams),
            this.app.config.teams,
          ),
          seed: s?.seed ?? 42,
        };
    // Drafts saved before death lasted until the meteor kept the old one-day default.
    if (!saved?.version && this.draft.settings.respawnDelay === 1)
      this.draft.settings.respawnDelay = defaults.respawnDelay;
    this.tab = tab;
    this.render();
    $("setup-dialog").showModal();
    this.drawBody();
    if (!this.observer && "ResizeObserver" in window) {
      let last = 0;
      this.observer = new ResizeObserver(([entry]) => {
        const w = Math.round(entry.contentRect.width);
        if (!$("setup-dialog").open || Math.abs(w - last) < 8) return;
        last = w;
        this.chartWidth = Math.max(260, w - 34);
        this.refresh();
      });
    }
    this.observer?.observe($("cfg-body"));
  }
  population() {
    return this.draft.teams.length * this.draft.settings.copies;
  }
  summary() {
    const d = this.draft.settings;
    return `<span><b>${fmt(this.population())}</b> Amoeboids</span><span><b>${fmt(d.plots)}</b> plots</span><span><b>${fmt(d.months * d.days)}</b> days</span>`;
  }
  ctl(key) {
    const [label, min, max, step, hardMax, unit = "", scale = 1] = CTL[key];
    const v = this.get(key) ?? 0;
    const shown = Math.round(v * scale * 1000) / 1000;
    return `<label class="ctl"><span class="ctl-l">${esc(label)}</span><input type="range" data-k="${key}" data-scale="${scale}" min="${min}" max="${max}" step="${step}" value="${Math.min(max, v)}" aria-label="${esc(label)}"/><span class="ctl-v"><input type="number" data-k="${key}" data-scale="${scale}" min="${min * scale}" max="${hardMax * scale}" step="${step * scale}" value="${shown}" aria-label="${esc(label)}"/>${unit ? `<small>${esc(unit)}</small>` : ""}</span></label>`;
  }
  num(key) {
    const [label, min, , step, hardMax, unit = ""] = CTL[key];
    return `<label class="num"><span>${esc(label)}</span><span class="ctl-v"><input type="number" data-k="${key}" data-scale="1" min="${min}" max="${hardMax}" step="${step}" value="${this.get(key)}"/>${unit ? `<small>${esc(unit)}</small>` : ""}</span></label>`;
  }
  charts() {
    const set = this.draft.settings;
    const pop = this.population();
    const W = this.chartWidth || 640;
    return {
      plots: () => plotsChart(set, pop, W),
      meal: () => mealChart(set, W),
      growth: () => growthChart(set, pop, W),
      weather: () => weatherChart(set, W),
    };
  }
  sectionHTML() {
    const set = this.draft.settings;
    const c = Object.fromEntries(
      Object.entries(this.charts()).map(([k, f]) => [
        k,
        `<div data-chart="${k}">${f()}</div>`,
      ]),
    );
    const card = (title, body, chart = "") =>
      `<section class="cfg-card"><h3>${title}</h3>${chart}${body}</section>`;
    switch (this.tab) {
      case "world": {
        const meteor = set.respawnDelay < 0;
        return `<div class="cfg-grid">
          ${card("Population", `<div class="cfg-big"><b data-live="pop">${fmt(this.population())}</b><span>${plural(this.draft.teams.length, "team")}</span></div>${this.ctl("copies")}`)}
          ${card("Time", `${this.ctl("months")}${this.ctl("days")}`)}
          ${card("Land", this.ctl("plots"), c.plots)}
          ${card("Death", `<div class="seg wide" role="radiogroup" aria-label="Respawn"><button type="button" role="radio" data-respawn="meteor" aria-pressed="${meteor}" aria-checked="${meteor}">Back at the meteor</button><button type="button" role="radio" data-respawn="days" aria-pressed="${!meteor}" aria-checked="${!meteor}">Back after days</button></div>${meteor ? "" : this.ctl("respawnDays")}`)}
          ${card("Seed", `<div class="seed-row"><input type="number" data-k="seed" data-scale="1" min="0" max="2147483647" value="${this.draft.seed}" aria-label="Random seed"/><button type="button" class="btn" data-dice>${icon("spark")}Random</button></div>`)}
        </div>`;
      }
      case "teams":
        return `<div class="team-list">${this.draft.teams
          .map(
            (t, i) =>
              `<div class="team-edit"><span class="avatar" style="background:${teamColor(i)}"></span><label><input data-team-name="${i}" value="${esc(t.name)}" maxlength="40" aria-label="Team ${i + 1} name"/><small>${t.strategyId ? "Imported Go" : t.builder ? "Custom" : esc(this.app.config.presets?.find((x) => x.policy === t.policy)?.summary || "")}</small></label><select data-team-policy="${i}" aria-label="Team ${i + 1} behaviour">${this.app.config.teams.map((p) => `<option value="${esc(p.policy)}" ${t.policy === p.policy && !t.builder && !t.strategyId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}${t.builder ? '<option value="custom" selected>Custom</option>' : ""}${t.strategyId ? '<option value="imported" selected>Imported Go</option>' : ""}</select><button type="button" class="btn" data-edit-team="${i}">Edit</button><button type="button" class="icon-button" data-remove-team="${i}" aria-label="Remove ${esc(t.name)}" ${this.draft.teams.length < 2 ? "disabled" : ""}>${icon("close")}</button></div>`,
          )
          .join(
            "",
          )}${this.draft.teams.length < 24 ? `<button type="button" class="btn add-team" data-add-team>${icon("plus")}Add team</button>` : ""}</div>`;
      case "food":
        return `<div class="cfg-grid">
          ${card("One meal", `${this.ctl("dailyFood")}${this.ctl("bodyCapacity")}`, `${c.meal}<p class="cfg-key"><i style="background:var(--joy)"></i>satisfaction<i style="background:var(--body)"></i>body lost</p>`)}
          ${card("An average field", `${this.ctl("capacityPerAgent")}${this.ctl("startingStock")}${this.ctl("growth")}${this.ctl("productiveCapacity")}`, c.growth)}
          ${card("Stores", `${this.ctl("harvestLimit")}${this.ctl("personalCapacity")}${this.ctl("reservePerResident")}`)}
        </div>`;
      case "mind":
        return `<div class="cfg-grid">
          ${card("Mind a day", `${this.ctl("weatherRates.0")}${this.ctl("weatherRates.1")}${this.ctl("weatherRates.2")}${this.ctl("outsideMind")}`, c.weather)}
          ${card("Mind", `${this.ctl("mindCapacity")}${this.ctl("startingMind")}`)}
          ${card("Weather", `${this.ctl("weatherPersistence")}<p class="cfg-key" data-live="spell">${spell(set.weatherPersistence)}</p>`)}
        </div>`;
      case "politics":
        return `<div class="cfg-grid">
          ${card("Paid by each Amoeboid", ["proposalCost", "voteCost", "officerCost", "readCost", "offerCost"].map((k) => this.num(k)).join(""))}
          ${card("Paid from pledged mind", ["governmentCost", "federationCost", "joiningCost", "enforcementCost", "recordsCost", "federationRunningCost"].map((k) => this.num(k)).join(""))}
          ${card("Influence", `${this.ctl("startingInfluence")}${this.ctl("maxInfluence")}`)}
          ${card("Windows", ["foundingWindow", "disputeWindow", "immigrationLookback"].map((k) => this.num(k)).join(""))}
        </div>`;
      default:
        return `<div class="cfg-grid">${card("Limits", `${this.num("decisionMs")}${this.num("memoryBytes")}`)}</div>`;
    }
  }
  render() {
    const dlg = $("setup-dialog");
    dlg.innerHTML = `<form method="dialog" id="setup-form" class="cfg"><div class="dlg-head"><h2 id="setup-title">New world</h2><button type="button" class="icon-button" data-close aria-label="Close">${icon("close")}</button></div>
      <div class="cfg-main"><nav class="cfg-nav" aria-label="Settings">${SECTIONS.map(([id, n, i]) => `<button type="button" data-stab="${id}" aria-current="${this.tab === id ? "page" : "false"}">${icon(i)}${n}</button>`).join("")}</nav>
      <div class="cfg-body" id="cfg-body"></div></div>
      <div class="dlg-foot"><p class="cfg-sum" id="setup-summary">${this.summary()}</p><div style="display:flex;gap:8px"><button type="button" class="btn" data-defaults>Defaults</button><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn primary">Create world</button></div></div></form>`;
    this.drawBody();
  }
  drawBody() {
    const dlg = $("setup-dialog");
    const body = $("cfg-body");
    // Charts are drawn at their real width so their text stays legible.
    const cs = getComputedStyle(body);
    const inner =
      body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (inner > 0) this.chartWidth = Math.max(260, Math.round(inner - 34));
    body.innerHTML = this.sectionHTML();
    $("setup-summary").innerHTML = this.summary();
    this.wire(dlg);
  }
  refresh() {
    const set = this.draft.settings;
    for (const [k, draw] of Object.entries(this.charts())) {
      const el = $("setup-dialog").querySelector(`[data-chart="${k}"]`);
      if (el) el.innerHTML = draw();
    }
    const pop = $("setup-dialog").querySelector('[data-live="pop"]');
    if (pop) pop.textContent = fmt(this.population());
    const sp = $("setup-dialog").querySelector('[data-live="spell"]');
    if (sp) sp.textContent = spell(set.weatherPersistence);
    $("setup-summary").innerHTML = this.summary();
  }
  wire(dlg) {
    dlg.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => dlg.close()));
    dlg.querySelectorAll("[data-stab]").forEach(
      (b) =>
        (b.onclick = () => {
          this.tab = b.dataset.stab;
          dlg
            .querySelectorAll("[data-stab]")
            .forEach((n) => n.setAttribute("aria-current", n === b ? "page" : "false"));
          this.drawBody();
          $("cfg-body").scrollTop = 0;
        }),
    );
    dlg.querySelector("[data-defaults]").onclick = () => {
      this.draft.settings = copy(this.app.config.settings);
      this.drawBody();
    };
    dlg.querySelectorAll("input[data-k]").forEach(
      (el) =>
        (el.oninput = () => {
          if (el.value === "") return;
          const key = el.dataset.k;
          const value = Number(el.value) / Number(el.dataset.scale || 1);
          this.set(key, value);
          // Keep the slider and its number box together.
          dlg.querySelectorAll(`input[data-k="${CSS.escape(key)}"]`).forEach((other) => {
            if (other === el) return;
            other.value =
              other.type === "range"
                ? Math.min(Number(other.max), value)
                : Math.round(value * Number(other.dataset.scale || 1) * 1000) / 1000;
          });
          this.refresh();
        }),
    );
    dlg.querySelectorAll("[data-respawn]").forEach(
      (b) =>
        (b.onclick = () => {
          this.draft.settings.respawnDelay =
            b.dataset.respawn === "meteor"
              ? -1
              : Math.max(1, this.draft.settings.respawnDelay);
          this.drawBody();
        }),
    );
    dlg.querySelector("[data-dice]")?.addEventListener("click", () => {
      this.draft.seed = Math.floor(Math.random() * 1e6);
      this.drawBody();
    });
    dlg
      .querySelectorAll("[data-team-name]")
      .forEach(
        (el) =>
          (el.oninput = () =>
            (this.draft.teams[Number(el.dataset.teamName)].name = el.value)),
      );
    dlg.querySelectorAll("[data-team-policy]").forEach(
      (el) =>
        (el.onchange = () => {
          if (["custom", "imported"].includes(el.value)) return;
          const t = this.draft.teams[Number(el.dataset.teamPolicy)];
          t.policy = el.value;
          delete t.builder;
          delete t.strategyId;
          this.drawBody();
        }),
    );
    dlg.querySelectorAll("[data-remove-team]").forEach(
      (b) =>
        (b.onclick = () => {
          this.draft.teams.splice(Number(b.dataset.removeTeam), 1);
          this.drawBody();
        }),
    );
    dlg.querySelector("[data-add-team]")?.addEventListener("click", () => {
      const base =
        this.app.config.teams[this.draft.teams.length % this.app.config.teams.length];
      this.draft.teams.push({
        name: `${base.name} ${Math.floor(this.draft.teams.length / this.app.config.teams.length) + 1}`,
        policy: base.policy,
      });
      this.drawBody();
    });
    dlg
      .querySelectorAll("[data-edit-team]")
      .forEach((b) => (b.onclick = () => this.openStrategy(Number(b.dataset.editTeam))));
    $("setup-form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        localStorage.setItem(
          "amoeboids.setup.v2",
          JSON.stringify({ ...this.draft, version: 3 }),
        );
      } catch {}
      const button = dlg.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = "Creating…";
      try {
        await this.app.actions.createWorld(this.draft);
        dlg.close();
      } catch (error) {
        toast(error.message, true);
      } finally {
        button.disabled = false;
        button.textContent = "Create world";
      }
    };
  }

  // ---------------------------------------------------------------- behaviours
  async openStrategy(team) {
    this.team = team;
    const t = this.draft.teams[team];
    this.strategy = copy(
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
    this.mode = t.strategyId ? "go" : "simple";
    this.renderStrategy();
    $("strategy-dialog").showModal();
    if (t.strategyId) {
      try {
        const stored = await this.app.api(`/strategies/${t.strategyId}`);
        this.strategy._source = stored.source || "";
        const area = $("go-source");
        if (area && !area.value) area.value = this.strategy._source;
      } catch {}
    }
  }
  renderStrategy() {
    const dlg = $("strategy-dialog");
    const b = this.strategy;
    const t = this.draft.teams[this.team];
    const modes = [
      ["simple", "Everyday choices"],
      ["rules", "Phase rules"],
      ["go", "Go code"],
    ];
    let body = "";
    if (this.mode === "simple")
      body = `<p class="note" style="margin-bottom:14px">A baseline for every phase. Phase rules can override it.</p><div class="field-grid">${[
        ["harvest", "Harvest request", 0, 100, 1, ""],
        ["eat", "Carrots to eat", 0, 100, 1, "No meal is supplied automatically."],
        [
          "think",
          "Mind to think with",
          -1,
          100,
          0.1,
          "−1 thinks with everything above the reserve.",
        ],
        ["keepMind", "Mind kept in reserve", 0, 100, 0.1, ""],
        ["pledge", "Mind to pledge", 0, 100, 0.1, "Funds shared costs such as founding."],
      ]
        .map(
          ([k, label, min, max, step, help]) =>
            `<label class="field"><span>${label}</span><input type="number" data-b="${k}" value="${b[k] ?? 0}" min="${min}" max="${max}" step="${step}"/><small>${help}</small></label>`,
        )
        .join("")}
        <label class="field"><span>Default vote</span><select data-b="vote">${["yes", "no", "abstain"].map((v) => `<option ${b.vote === v ? "selected" : ""}>${v}</option>`).join("")}</select><small>Yes and no cost mind; abstaining is free.</small></label>
        <label class="field"><span>Found a government</span><select data-b="government"><option value="true" ${b.government ? "selected" : ""}>Propose when possible</option><option value="false" ${!b.government ? "selected" : ""}>Never propose</option></select></label>
        <label class="field"><span>Movement</span><select data-b="migrate"><option value="true" ${b.migrate ? "selected" : ""}>Seek a better plot</option><option value="false" ${!b.migrate ? "selected" : ""}>Settle and stay</option></select></label></div>`;
    if (this.mode === "rules")
      body = `<p class="note" style="margin-bottom:14px">Checked in order during their phase. The first match returns its action; otherwise everyday choices apply. Actions use the same fields as Go agents.</p><div id="rule-list">${(
        b.rules || []
      )
        .map(
          (
            r,
            i,
          ) => `<div class="rule-card" data-rule="${i}"><header>Rule ${i + 1}<button type="button" class="icon-button" data-del="${i}" aria-label="Delete rule ${i + 1}">${icon("close")}</button></header><div class="field-grid">
          <label class="field"><span>During</span><select data-r="phase">${[...PHASES.map((p) => [p.id, p.name]), ["pledges", "Mind pledges"], ["records", "Read records"], ["accept", "Accept food"], ["month_end", "Month ends"]].map(([k, n]) => `<option value="${k}" ${r.phase === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
          <label class="field"><span>When</span><select data-r="field">${["food", "body", "mind", "score", "influence", "day", "month", "stock", "population", "government", "plot", "deaths"].map((k) => `<option ${r.field === k ? "selected" : ""}>${k}</option>`).join("")}</select></label>
          <label class="field"><span>Is</span><select data-r="op">${[
            ["lt", "below"],
            ["lte", "at most"],
            ["eq", "equal to"],
            ["gte", "at least"],
            ["gt", "above"],
          ]
            .map(
              ([k, n]) =>
                `<option value="${k}" ${r.op === k ? "selected" : ""}>${n}</option>`,
            )
            .join("")}</select></label>
          <label class="field"><span>Value</span><input type="number" data-r="value" value="${r.value}" step="any"/></label>
          <label class="field wide"><span>Action</span><textarea class="code" data-r="action" spellcheck="false">${esc(JSON.stringify(r.action || {}, null, 2))}</textarea></label></div></div>`,
        )
        .join(
          "",
        )}</div><button type="button" class="btn" id="add-rule">${icon("plus")}Add a rule</button>
        <label class="field wide" style="margin-top:18px"><span>Standing proposals</span><textarea class="code" id="standing" style="min-height:110px" spellcheck="false">${esc(JSON.stringify(b.proposals || [], null, 2))}</textarea><small>Proposal inputs submitted in the Motions phase, using the policy catalogue's keys.</small></label>`;
    if (this.mode === "go")
      body = `<p class="note" style="margin-bottom:12px">Import a phase-aware Go behaviour. The server checks and compiles it before it is used; each of the ${fmt(this.draft.settings.copies)} copies keeps independent memory.</p><div style="display:flex;gap:10px;align-items:center;margin-bottom:12px"><label class="btn">Choose a .go file<input type="file" id="go-file" accept=".go,text/plain" class="visually-hidden"/></label><a class="link" style="color:var(--focus)" href="/society-example.go" download>Download the example</a></div><textarea class="code" id="go-source" spellcheck="false" placeholder="Paste Go source here">${esc(b._source || "")}</textarea><p class="note" id="go-status" style="margin-top:8px">Used only once it compiles.</p>`;
    dlg.innerHTML = `<div class="dlg-head"><h2 id="strategy-title">${esc(t.name)}</h2><button class="icon-button" data-close aria-label="Close">${icon("close")}</button></div>
      <div class="dlg-tabs">${modes.map(([id, n]) => `<button data-mode="${id}" class="${this.mode === id ? "active" : ""}">${n}</button>`).join("")}</div>
      <div class="dlg-body">${body}</div>
      <div class="dlg-foot"><p>Applies to the next world you create.</p><button class="btn primary" id="save-strategy">Save behaviour</button></div>`;
    dlg.querySelector("[data-close]").onclick = () => dlg.close();
    dlg.querySelectorAll("[data-mode]").forEach(
      (el) =>
        (el.onclick = () => {
          if (!this.capture()) return;
          this.mode = el.dataset.mode;
          this.renderStrategy();
        }),
    );
    dlg.querySelectorAll("[data-b]").forEach(
      (el) =>
        (el.onchange = () => {
          const k = el.dataset.b;
          b[k] = ["government", "migrate"].includes(k)
            ? el.value === "true"
            : k === "vote"
              ? el.value
              : Number(el.value);
        }),
    );
    $("add-rule")?.addEventListener("click", () => {
      if (!this.capture()) return;
      (b.rules ||= []).push({
        phase: "harvest",
        field: "food",
        op: "lt",
        value: 2,
        action: { harvest: 4 },
      });
      this.renderStrategy();
    });
    dlg.querySelectorAll("[data-del]").forEach(
      (el) =>
        (el.onclick = () => {
          if (!this.capture()) return;
          b.rules.splice(Number(el.dataset.del), 1);
          this.renderStrategy();
        }),
    );
    $("go-file")?.addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (f) $("go-source").value = b._source = await f.text();
    });
    $("save-strategy").onclick = () => this.saveStrategy();
  }
  capture() {
    try {
      if (this.mode === "rules") {
        this.strategy.rules = [
          ...$("strategy-dialog").querySelectorAll("[data-rule]"),
        ].map((el) => ({
          phase: el.querySelector('[data-r="phase"]').value,
          field: el.querySelector('[data-r="field"]').value,
          op: el.querySelector('[data-r="op"]').value,
          value: Number(el.querySelector('[data-r="value"]').value),
          action: JSON.parse(el.querySelector('[data-r="action"]').value),
        }));
        this.strategy.proposals = JSON.parse($("standing").value);
        if (!Array.isArray(this.strategy.proposals))
          throw new Error("Standing proposals must be a list in [ ].");
      }
      if (this.mode === "go") this.strategy._source = $("go-source").value;
      return true;
    } catch (error) {
      toast(`Check the action format: ${error.message}`, true);
      return false;
    }
  }
  async saveStrategy() {
    if (!this.capture()) return;
    const team = this.draft.teams[this.team];
    const button = $("save-strategy");
    button.disabled = true;
    try {
      if (this.mode === "go") {
        const source = this.strategy._source?.trim();
        if (!source) throw new Error("Choose a Go file or paste its source first.");
        $("go-status").textContent = "Compiling…";
        const result = await this.app.api("/strategies", { name: team.name, source });
        team.strategyId = result.id;
        delete team.builder;
        team.policy = "custom";
      } else {
        const b = copy(this.strategy);
        delete b._source;
        team.builder = b;
        delete team.strategyId;
        team.policy = "builder";
      }
      $("strategy-dialog").close();
      this.drawBody();
    } catch (error) {
      if ($("go-status")) $("go-status").textContent = error.message;
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  // ---------------------------------------------------------------- saved worlds
  async openSaved() {
    const dlg = $("saved-dialog");
    dlg.innerHTML = `<div class="dlg-head"><h2 id="saved-title">Saved worlds</h2><button class="icon-button" data-close aria-label="Close">${icon("close")}</button></div><div class="dlg-body"><p class="note">Private to this browser. Opening a world keeps its saved progress.</p><label class="field saved-search"><span>Find a world</span><input type="search" id="saved-search" placeholder="Date, month, day or status"/></label><div id="saved-body" aria-live="polite"><p class="note">Loading…</p></div></div><div class="dlg-foot"><p id="saved-count"></p><button class="btn primary" id="saved-new">New world</button></div>`;
    dlg.querySelector("[data-close]").onclick = () => dlg.close();
    $("saved-new").onclick = () => {
      dlg.close();
      this.open();
    };
    dlg.showModal();
    try {
      const data = await this.app.api("/runs");
      const runs = (data.runs || []).sort(
        (a, b) =>
          Number(b.id === this.app.pb.id) - Number(a.id === this.app.pb.id) ||
          String(b.created).localeCompare(String(a.created)),
      );
      $("saved-count").textContent = plural(runs.length, "saved world");
      const render = () => {
        const query = $("saved-search").value.trim().toLowerCase();
        const rows = runs
          .map((r) => {
            const date = r.created
              ? new Date(r.created).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Earlier world";
            const current = r.id === this.app.pb.id;
            const latest = r.latest;
            const phase =
              PHASES.find((p) => p.id === latest?.phase)?.name ||
              (latest?.phase === "ready" ? "Ready" : "");
            const progress = latest
              ? `Month ${latest.month} · Day ${latest.day}${phase ? " · " + phase : ""}`
              : `${fmt(Math.max(0, r.frames - 1))} phases recorded`;
            const status =
              {
                archived: "Read-only archive",
                complete: "Completed",
                running: "Running",
                paused: "Paused",
                ready: "Ready",
                error: "Stopped",
              }[r.status] || r.status;
            if (
              !`${date} ${progress} ${status} ${current ? "current" : ""}`
                .toLowerCase()
                .includes(query)
            )
              return "";
            return `<button class="saved-row ${current ? "saved-current" : ""}" data-run="${esc(r.id)}"><span><strong>${current ? "Current world" : esc(date)}</strong><span class="saved-progress">${esc(progress)}</span><span>${esc(status)}${current ? " · " + esc(date) : ""}</span></span><span class="saved-action">${r.status === "archived" || r.status === "complete" ? "Review" : "Open"} ${icon("chevron")}</span></button>`;
          })
          .filter(Boolean);
        $("saved-body").innerHTML =
          rows.join("") ||
          `<p class="note">${runs.length ? "No worlds match your search." : "No saved worlds yet. Create one to begin."}</p>`;
        $("saved-body")
          .querySelectorAll("[data-run]")
          .forEach((b) => {
            b.onclick = async () => {
              b.disabled = true;
              try {
                await this.app.actions.openRun(b.dataset.run);
                dlg.close();
              } catch (error) {
                b.disabled = false;
                toast(error.message, true);
              }
            };
          });
      };
      $("saved-search").oninput = render;
      render();
    } catch (error) {
      $("saved-body").innerHTML = `<p class="note fail">${esc(error.message)}</p>`;
    }
  }

  openGuide() {
    const dlg = $("guide-dialog");
    dlg.innerHTML = `<div class="dlg-head"><h2 id="guide-title">How to watch</h2><button class="icon-button" data-close aria-label="Close">${icon("close")}</button></div><div class="dlg-body guide">
      <p>You are the observer. Six teams of Amoeboids, each running its own code, decide where to live, how much to harvest and eat, and whether to build institutions. Nothing you click changes what they do.</p>
      <h3>Controls</h3><dl>
        <dt><kbd>Space</kbd></dt><dd>Play or pause. Play continues until you stop it.</dd>
        <dt><kbd>→</kbd></dt><dd>Advance one phase.</dd>
        <dt><kbd>Shift</kbd> + <kbd>→</kbd></dt><dd>Skip to nightfall.</dd>
        <dt><kbd>1</kbd>–<kbd>9</kbd></dt><dd>Select a plot. <kbd>0</kbd> selects the wilds; <kbd>Esc</kbd> closes.</dd>
        <dt><kbd>[</kbd> and <kbd>]</kbd></dt><dd>Slower or faster.</dd>
        <dt>Drag and scroll</dt><dd>Move around the island and zoom in to pick out individual Amoeboids.</dd></dl>
      <h3>Reading the island</h3>
      <p>The light follows the day: dawn brings weather and growth, noon the harvest, golden hour the assemblies, dusk supper and night sleep. Standing carrots show each field's stock. A hall appears only once residents found a government; its granary fills with the treasury. Violet ribbons and flags mark federations. A crown marks an officer and a violet pennant a representative.</p>
      <h3>Rules of the world</h3>
      <p>Eating is chosen by each agent; going a day without food can kill. Extra food gives diminishing satisfaction and thinking gives one point per mind. Governments begin with no laws: every quota, tax and officer needs its own vote, and passed decisions take effect the next morning. A meteor ends each month, keeping only private memories.</p>
      <p><a class="link" style="color:var(--focus)" href="/society-example.go" download>Download the Go agent example</a></p></div>`;
    dlg.querySelector("[data-close]").onclick = () => dlg.close();
    dlg.showModal();
  }
}
