// New world, team behaviours, saved worlds and the guide.

import { esc, fmt, plural, teamColor, PHASES, migrateTeams } from "/game/model.js";
import { hasTokenOnlyVoting, usesLegacyRules } from "/game/statutes.js";
import { $, icon, toast } from "/game/dom.js";
import { GroupLibrary, courseworkSource, teamGuide } from "/game/group-library.js";

const copy = (v) => structuredClone(v);
const defaultBuilder = () => ({
  harvest: 3,
  eat: 3,
  think: -1,
  keepMind: 1,
  pledge: 1,
  government: true,
  vote: "yes",
  voteTokens: 1,
  harvestRanking: [],
  rules: [],
  proposals: [],
});
const spell = (p) =>
  p >= 1
    ? "Weather never changes"
    : `Weather lasts ${fmt(1 / (1 - p), 1)} days on average`;

// Control definitions: slider range for comfortable tuning; the number box
// accepts anything the engine accepts.
const CTL = {
  copies: ["Default team size", 1, 100, 1, 500],
  plots: ["Plots", 1, 24, 1, 48],
  months: ["Months", 1, 24, 1, 24],
  days: ["Days a month", 1, 60, 1, 365],
  dailyFood: ["Daily need", 0, 10, 1, 1000, "carrots"],
  bodyCapacity: ["Body capacity", 1, 10, 1, 100],
  personalCapacity: ["Private store", 1, 60, 1, 10000, "carrots"],
  capacityPerAgent: ["Field per Amoeboid", 1, 50, 1, 1000, "carrots"],
  startingStock: ["Starting stock", 0, 1, 0.05, 1, "%", 100],
  dailyGrowthPercent: ["Daily growth", 0, 100, 1, 100, "%"],
  overeatingReward: ["Each extra carrot", 0, 10, 0.1, 100, "points"],
  thinkingReward: ["Each mind spent thinking", 0, 10, 0.1, 100, "points"],
  representativeCapacity: ["Trade representative’s store", 2, 150, 1, 100000, "carrots"],
  blightChance: ["Blight chance", 0, 1, 0.01, 1, "%", 100],
  bumperChance: ["Chance of extra carrots", 0, 1, 0.01, 1, "%", 100],
  votingTokens: ["Daily tokens per resident", 1, 50, 1, 10000],
  ruleFraction: ["Required share", 0.01, 1, 0.01, 1, "%", 100],
  mindCapacity: ["Mind capacity", 1, 40, 1, 100],
  startingMind: ["Starting mind", 0, 40, 1, 100],
  "weatherRates.0": ["Sunny", 0, 40, 1, 10000, "mind"],
  "weatherRates.1": ["Cloudy", 0, 40, 1, 10000, "mind"],
  "weatherRates.2": ["Dark", 0, 40, 1, 10000, "mind"],
  weatherPersistence: ["Persistence", 0, 1, 0.05, 1, "%", 100],
  voteCost: ["Cast a Yes or No ballot", 0, 5, 0.1, 100000, "mind"],
  proposalCost: ["Table a motion", 0, 5, 0.1, 100, "mind"],
  justiceCost: ["Justice order", 0, 2, 0.01, 100, "mind"],
  governmentCost: ["Found a government", 0, 100, 1, 1000, "mind"],
  decisionMs: ["Decision time", 1, 1000, 1, 10000, "ms"],
  memoryBytes: ["Memory", 1024, 4194304, 1024, 16777216, "bytes"],
};

const SECTIONS = [
  ["world", "World", "world"],
  ["teams", "Amoeboids", "people"],
  ["groups", "Coursework teams", "book"],
  ["food", "Food", "carrot"],
  ["mind", "Mind and weather", "sun"],
  ["politics", "Politics", "hall"],
  ["agents", "Runtime limits", "mind"],
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
  const top = set.overeatingReward * Math.max(1, max - need) || 1;
  const bars = [];
  for (let e = 0; e <= max; e++) {
    const x = L + e * step + (step - bw) / 2;
    if (e < need) {
      const loss = need - e;
      const excluded = loss >= set.bodyCapacity;
      const label = excluded
        ? need - (e + 1) < set.bodyCapacity
          ? "excluded"
          : ""
        : `−${fmt(loss, 2)}`;
      const h = excluded ? 40 : Math.max(4, (loss / set.bodyCapacity) * 40);
      bars.push(
        `<rect x="${x}" y="${base}" width="${bw}" height="${h}" rx="3" fill="var(--body)" opacity="${excluded ? 1 : 0.55}"/>${label ? `<text x="${x + bw / 2}" y="${base + h + 13}" text-anchor="middle" class="cv">${label}</text>` : ""}`,
      );
    } else {
      const v = set.overeatingReward * (e - need);
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

function growthExample(set) {
  const extra = (10 * set.dailyGrowthPercent) / 100;
  return `<p class="note">At dawn, 10 carrots left in an occupied field grow ${fmt(extra, 1)} more if there is room. Fractions carry over. Leaving zero carrots means zero ordinary growth.</p>`;
}

function rewardExample(set) {
  const food = 3 * set.overeatingReward;
  const thought = 3 * set.thinkingReward;
  return `<p class="note">Eating 3 above the daily need earns ${fmt(food, 2)} points. Thinking with 3 mind earns ${fmt(thought, 2)}.</p>`;
}

function weatherChart(set, W) {
  const items = [
    ["Sunny", set.weatherRates[0], "#ffd36e"],
    ["Cloudy", set.weatherRates[1], "#c9d6e6"],
    ["Dark", set.weatherRates[2], "#7f8fb0"],
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
    this.groups = new GroupLibrary(this);
  }
  get(key) {
    if (key === "seed") return this.draft.seed;
    return key.split(".").reduce((v, k) => v?.[k], this.draft.settings);
  }
  set(key, value) {
    if (key === "seed") return void (this.draft.seed = value);
    const [a, b] = key.split(".");
    if (b === undefined) this.draft.settings[a] = value;
    else this.draft.settings[a][Number(b)] = value;
  }
  open(tab = "world") {
    const s = this.app.ix?.s;
    let saved = null;
    try {
      saved = JSON.parse(
        localStorage.getItem("amoeboids.setup.v2") ||
          localStorage.getItem("amoeboids.society.setup.v1"),
      );
    } catch {}
    const defaults = this.app.config.settings;
    const previous = saved || s || {};
    this.draft = {
      settings: Object.fromEntries(
        Object.entries(defaults).map(([key, value]) => [
          key,
          copy(
            previous.settings?.[key] ??
              (key === "justiceCost" ? previous.settings?.officerCost : undefined) ??
              value,
          ),
        ]),
      ),
      teams: migrateTeams(
        copy(previous.teams || this.app.config.teams),
        this.app.config.teams,
      ),
      seed: saved?.version >= 5 || (saved && saved.seed !== 42) ? saved.seed : undefined,
    };
    // A new world always uses tokens, including when reusing an older saved setup.
    this.draft.settings.ruleThreshold = "tokens";
    this.tab = tab;
    this.picking = null;
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
    if (tab === "groups") this.groups.load();
  }
  population() {
    return this.draft.teams.reduce(
      (total, team) => total + (team.copies || this.draft.settings.copies),
      0,
    );
  }
  summary() {
    const d = this.draft.settings;
    return `<span><b>${fmt(this.population())}</b> Amoeboids</span><span><b>${fmt(d.plots)}</b> plots</span><span><b>${fmt(d.months * d.days)}</b> days</span>`;
  }
  ctl(key) {
    const [label, min, max, step, hardMax, unit = "", scale = 1] = CTL[key];
    const v = this.get(key) ?? 0;
    const shown = Math.round(v * scale * 1000) / 1000;
    return `<label class="ctl"><span class="ctl-l">${esc(label)}</span><input type="range" data-k="${key}" data-scale="1" min="${min}" max="${max}" step="${step}" value="${Math.min(max, v)}" aria-label="${esc(label)}"/><span class="ctl-v"><input type="number" data-k="${key}" data-scale="${scale}" min="${min * scale}" max="${hardMax * scale}" step="${step * scale}" value="${shown}" aria-label="${esc(label)}"/>${unit ? `<small>${esc(unit)}</small>` : ""}</span></label>`;
  }
  num(key) {
    const [label, min, , step, hardMax, unit = ""] = CTL[key];
    return `<label class="num"><span>${esc(label)}</span><span class="ctl-v"><input type="number" data-k="${key}" data-scale="1" min="${min}" max="${hardMax}" step="${step}" value="${this.get(key)}" aria-label="${esc(label)}"/>${unit ? `<small>${esc(unit)}</small>` : ""}</span></label>`;
  }
  charts() {
    const set = this.draft.settings;
    const pop = this.population();
    const W = this.chartWidth || 640;
    return {
      plots: () => plotsChart(set, pop, W),
      meal: () => mealChart(set, W),
      growth: () => growthExample(set),
      rewards: () => rewardExample(set),
      weather: () => weatherChart(set, W),
    };
  }
  rosterHTML() {
    const teams = this.draft.teams;
    const presets = this.app.config.presets;
    if (this.picking !== null) {
      const team = teams[this.picking];
      const title = team
        ? `Swap behaviour for ${esc(team.name)}`
        : "Choose a team to add";
      return `<div class="team-list"><div class="roster-head"><h3 tabindex="-1" data-picker-title>${title}</h3><button type="button" class="btn" data-back-roster>Back to teams</button></div>
        <div class="preset-grid">${presets
          .map((p) => {
            const current =
              team && !team.builder && !team.strategyId && p.policy === team.policy;
            return `<button type="button" class="preset-choice" data-preset="${esc(p.policy)}" ${current ? 'aria-current="true"' : ""}><strong>${esc(p.name)}</strong>${current ? "<em>Current</em>" : ""}<small>${esc(p.summary)}.</small></button>`;
          })
          .join("")}</div></div>`;
    }
    const rows = teams
      .map((team, i) => {
        const preset = presets.find((p) => p.policy === team.policy);
        const behaviour = team.strategyId
          ? "Imported Go behaviour"
          : team.builder
            ? "Custom behaviour"
            : preset?.name || team.policy;
        const summary = team.strategyId
          ? "Runs this team’s Go strategy."
          : team.builder
            ? "Uses the everyday choices and rules you set."
            : `${preset?.summary || ""}.`;
        return `<li class="roster-row"><div class="roster-identity"><span class="avatar" style="background:${teamColor(i)}"></span>
        <label class="field"><span>Team name</span><input data-team-name="${i}" value="${esc(team.name)}" maxlength="40" aria-label="Team ${i + 1} name"/></label>
        <label class="field roster-size"><span>Size</span><input type="number" data-team-size="${i}" min="1" max="500" step="1" value="${team.copies || ""}" placeholder="${this.draft.settings.copies}" aria-label="Team ${i + 1} size"/></label></div>
        <p><strong data-team-behaviour="${i}">${esc(behaviour)}</strong> · ${esc(summary)}</p>
        ${team.coursework ? `<p class="coursework-origin">Group ${esc(team.coursework.group)} · ${courseworkSource(team.coursework)}</p>` : ""}
        <div class="roster-actions"><button type="button" class="btn" data-swap-team="${i}">Swap preset</button><button type="button" class="btn" data-edit-team="${i}">Edit behaviour</button>
        <button type="button" class="icon-button" data-remove-team="${i}" aria-label="Remove team ${i + 1}" title="Remove team" ${teams.length === 1 ? "disabled" : ""}>${icon("close")}</button></div></li>`;
      })
      .join("");
    return `<div class="team-list"><div class="roster-head"><h3>${plural(teams.length, "team")} in this world</h3><button type="button" class="btn primary" data-add-team ${teams.length >= 24 ? "disabled" : ""}>${icon("plus")}Add team</button></div>
      ${this.ctl("copies")}<p class="note roster-hint">Leave a team’s size blank to use the default.</p><ol class="roster-list">${rows}</ol></div>`;
  }
  choosePreset(policy) {
    const preset = this.app.config.presets.find((p) => p.policy === policy);
    const index = this.picking;
    const teams = this.draft.teams;
    const team = teams[index];
    const previous = this.app.config.presets.find((p) => p.policy === team?.policy);
    const customName = team?.name && team.name !== previous?.name;
    // Keep a user-given name and size when swapping. Give duplicate additions distinct names.
    let name = customName ? team.name : preset.name;
    if (!customName) {
      let number = 2;
      while (teams.some((t, i) => i !== index && t.name === name))
        name = `${preset.name} ${number++}`;
    }
    teams[index] = {
      name,
      policy,
      ...(team?.copies ? { copies: team.copies } : {}),
      ...(team?.color ? { color: team.color } : {}),
    };
    this.picking = null;
    this.drawBody();
    $("cfg-body").querySelector(`[data-swap-team="${index}"]`).focus();
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
        return `<div class="cfg-grid">
          ${card("Population", `<div class="cfg-big"><b data-live="pop">${fmt(this.population())}</b><span>${plural(this.draft.teams.length, "team")}</span></div>${this.ctl("copies")}<button type="button" class="btn" data-open-roster>Choose Amoeboids</button>`)}
          ${card("Time", `${this.ctl("months")}${this.ctl("days")}`)}
          ${card("Land", this.ctl("plots"), c.plots)}
          ${card("Satisfaction", `${this.ctl("overeatingReward")}${this.ctl("thinkingReward")}${c.rewards}`)}
          ${card("Seed", `<div class="seed-row"><input type="number" data-k="seed" data-scale="1" min="0" max="2147483647" value="${this.draft.seed ?? ""}" placeholder="Random each run" aria-label="Random seed"/><button type="button" class="btn" data-dice>${icon("spark")}Auto</button></div>`)}
        </div>`;
      }
      case "teams":
        return this.rosterHTML();
      case "groups":
        return this.groups.html();
      case "food":
        return `<div class="cfg-grid">
          ${card("One meal", `${this.ctl("dailyFood")}${this.ctl("bodyCapacity")}`, `${c.meal}<p class="cfg-key"><i style="background:var(--joy)"></i>satisfaction<i style="background:var(--body)"></i>body lost</p>`)}
          ${card("Carrot growth", `${this.ctl("dailyGrowthPercent")}${c.growth}${this.ctl("capacityPerAgent")}${this.ctl("startingStock")}`)}
          ${card("Personal stores", `${this.ctl("personalCapacity")}${this.ctl("representativeCapacity")}`)}
          ${card("Crop events", `${this.ctl("blightChance")}${this.ctl("bumperChance")}<p class="cfg-key">Each occupied plot draws once per day from day four. The field can gain up to one daily meal per resident, in extra carrots, limited by field space. The combined chance must be at most 100%. A blighted plot needs one donated carrot per resident from other plots before nightfall.</p>`)}
        </div>`;
      case "mind":
        return `<div class="cfg-grid">
          ${card("Mind a day", `${this.ctl("weatherRates.0")}${this.ctl("weatherRates.1")}${this.ctl("weatherRates.2")}`, c.weather)}
          ${card("Mind", `${this.ctl("mindCapacity")}${this.ctl("startingMind")}`)}
          ${card("Weather", `${this.ctl("weatherPersistence")}<p class="cfg-key" data-live="spell">${spell(set.weatherPersistence)}</p>`)}
        </div>`;
      case "politics":
        return `<div class="cfg-grid">
          ${card("Mind costs", `${["proposalCost", "voteCost", "justiceCost", "governmentCost"].map((k) => this.num(k)).join("")}<p class="cfg-key">Mind spent on each Yes ballot counts once toward founding, however many tokens the voter spends. Pledges can cover the rest.</p>`)}
          ${card("Voting weight", `${this.ctl("votingTokens")}<p class="cfg-key">Residents can vote to change how their plot allocates its daily tokens.</p>`)}
          ${card("Rule ballots", `${this.ctl("ruleFraction")}<p class="cfg-key">Only tokens cast for Yes or No count. Rule changes need more than the chosen share of Yes tokens, or all tokens at 100%. Founding, dissolution and role decisions need more Yes tokens than No tokens.</p>`)}
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
    dlg.querySelector('button[type="submit"]').disabled = this.picking !== null;
    this.wire(dlg);
    if (this.tab === "groups") this.groups.bind();
  }
  refresh() {
    const set = this.draft.settings;
    for (const [k, draw] of Object.entries(this.charts())) {
      const el = $("setup-dialog").querySelector(`[data-chart="${k}"]`);
      if (el) el.innerHTML = draw();
    }
    for (const field of $("cfg-body").querySelectorAll("[data-team-size]"))
      field.placeholder = set.copies;
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
          this.picking = null;
          dlg
            .querySelectorAll("[data-stab]")
            .forEach((n) => n.setAttribute("aria-current", n === b ? "page" : "false"));
          this.drawBody();
          $("cfg-body").scrollTop = 0;
          if (this.tab === "groups") this.groups.load();
        }),
    );
    dlg.querySelector("[data-defaults]").onclick = () => {
      this.draft.settings = copy(this.app.config.settings);
      this.draft.teams = copy(this.app.config.teams);
      this.picking = null;
      this.drawBody();
    };
    dlg.querySelectorAll("input[data-k]").forEach(
      (el) =>
        (el.oninput = () => {
          const key = el.dataset.k;
          if (el.value === "") {
            if (key === "seed") this.draft.seed = undefined;
            return;
          }
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
    dlg.querySelector("[data-dice]")?.addEventListener("click", () => {
      this.draft.seed = undefined;
      this.drawBody();
    });
    dlg.querySelectorAll("[data-team-name]").forEach(
      (el) =>
        (el.oninput = () => {
          const team = this.draft.teams[Number(el.dataset.teamName)];
          if (el.value !== team.name) {
            delete team.coursework;
            el.closest(".roster-row").querySelector(".coursework-origin")?.remove();
            team.name = el.value;
          }
        }),
    );
    dlg.querySelector("[data-open-roster]")?.addEventListener("click", () => {
      const tab = dlg.querySelector('[data-stab="teams"]');
      tab.click();
      tab.focus();
    });
    dlg.querySelectorAll("[data-team-size]").forEach((el) => {
      el.oninput = () => {
        const team = this.draft.teams[Number(el.dataset.teamSize)];
        if (el.value === "") delete team.copies;
        else team.copies = Number(el.value);
        this.refresh();
      };
    });
    const pick = (index) => {
      this.picking = index;
      this.drawBody();
      dlg.querySelector("[data-picker-title]").focus();
    };
    dlg
      .querySelector("[data-add-team]")
      ?.addEventListener("click", () => pick(this.draft.teams.length));
    dlg
      .querySelectorAll("[data-swap-team]")
      .forEach((b) => (b.onclick = () => pick(Number(b.dataset.swapTeam))));
    dlg.querySelector("[data-back-roster]")?.addEventListener("click", () => {
      const index = this.picking;
      this.picking = null;
      this.drawBody();
      (
        dlg.querySelector(`[data-swap-team="${index}"]`) ||
        dlg.querySelector("[data-add-team]")
      ).focus();
    });
    dlg
      .querySelectorAll("[data-preset]")
      .forEach((b) => (b.onclick = () => this.choosePreset(b.dataset.preset)));
    dlg.querySelectorAll("[data-remove-team]").forEach(
      (b) =>
        (b.onclick = () => {
          const i = Number(b.dataset.removeTeam);
          this.draft.teams.splice(i, 1);
          this.drawBody();
          dlg
            .querySelector(
              `[data-swap-team="${Math.min(i, this.draft.teams.length - 1)}"]`,
            )
            .focus();
        }),
    );
    dlg
      .querySelectorAll("[data-edit-team]")
      .forEach((b) => (b.onclick = () => this.openStrategy(Number(b.dataset.editTeam))));
    $("setup-form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        localStorage.setItem(
          "amoeboids.setup.v2",
          JSON.stringify({ ...this.draft, version: 5 }),
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
    this.strategy = copy(t.builder || defaultBuilder());
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
      body = `<p class="note" style="margin-bottom:14px">Set this team’s everyday choices here. Use phase rules for exceptions.</p><div class="field-grid">${[
        [
          "harvest",
          "Harvest request",
          0,
          null,
          1,
          "The field stock and your remaining storage determine how much you collect.",
        ],
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
        [
          "voteTokens",
          "Tokens per ballot",
          1,
          null,
          1,
          "Tokens to spend on each Yes or No vote.",
        ],
        [
          "pledge",
          "Mind to pledge",
          0,
          100,
          0.1,
          "Extra mind to cover the founding cost if Yes ballots leave a shortfall.",
        ],
      ]
        .map(
          ([k, label, min, max, step, help]) =>
            `<label class="field"><span>${label}</span><input type="number" data-b="${k}" value="${esc(b[k] ?? (k === "voteTokens" ? 1 : 0))}" min="${min}" ${max === null ? "" : `max="${max}"`} step="${step}"/><small>${help}</small></label>`,
        )
        .join("")}
        <label class="field"><span>Default vote</span><select data-b="vote">${["yes", "no", "abstain"].map((v) => `<option ${b.vote === v ? "selected" : ""}>${v}</option>`).join("")}</select><small>Each Yes or No costs tokens and ${fmt(this.draft.settings.voteCost, 2)} mind. Abstaining is free.</small></label>
        <label class="field"><span>Found a government</span><select data-b="government"><option value="true" ${b.government ? "selected" : ""}>Propose when possible</option><option value="false" ${!b.government ? "selected" : ""}>Never propose</option></select></label>
        <label class="field"><span>Harvest ranking</span><input id="harvest-ranking" value="${esc((b.harvestRanking || []).join(", "))}" placeholder="e.g. 2, 0, 1"/><small>List every active resident of the plot in preferred order. Leave blank to abstain.</small></label></div>`;
    if (this.mode === "rules")
      body = `<p class="note" style="margin-bottom:14px">Checked in order during their phase. The first match returns its action; otherwise everyday choices apply. Actions use the same fields as Go agents.</p><div id="rule-list">${(
        b.rules || []
      )
        .map(
          (
            r,
            i,
          ) => `<div class="rule-card" data-rule="${i}"><header>Rule ${i + 1}<button type="button" class="icon-button" data-del="${i}" aria-label="Delete rule ${i + 1}">${icon("close")}</button></header><div class="field-grid">
          <label class="field"><span>During</span><select data-r="phase">${[["placement", "Choose a plot at reset"], ...PHASES.filter((p) => p.id !== "environment").map((p) => [p.id, p.name]), ["pledges", "Mind pledges"], ["records", "Read public records"], ["record_pages", "Read next page"], ["month_end", "Month ends"]].map(([k, n]) => `<option value="${k}" ${r.phase === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
          <label class="field"><span>When</span><select data-r="field">${["food", "body", "mind", "score", "votingWeight", "votingTokens", "day", "month", "stock", "population", "government", "plot", "exclusions"].map((k) => `<option ${r.field === k ? "selected" : ""}>${k}</option>`).join("")}</select></label>
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
          <label class="field"><span>Value</span><input type="number" data-r="value" value="${esc(r.value)}" step="any"/></label>
          <label class="field wide"><span>Action</span><textarea class="code" data-r="action" spellcheck="false">${esc(JSON.stringify(r.action || {}, null, 2))}</textarea></label></div></div>`,
        )
        .join(
          "",
        )}</div><button type="button" class="btn" id="add-rule">${icon("plus")}Add a rule</button>
        <label class="field wide" style="margin-top:18px"><span>Standing proposals</span><textarea class="code" id="standing" style="min-height:110px" spellcheck="false">${esc(JSON.stringify(b.proposals || [], null, 2))}</textarea><small>Proposal inputs submitted in the Motions phase, using the policy catalogue's keys.</small></label>`;
    if (this.mode === "go")
      body = `<p class="note" style="margin-bottom:12px">Import your team’s Go file into this workspace. For a shared match, follow the <a class="link" href="${teamGuide}" target="_blank" rel="noopener noreferrer">GitHub submission guide</a>. Each of the ${fmt(t.copies || this.draft.settings.copies)} copies keeps independent memory.</p><div style="display:flex;gap:10px;align-items:center;margin-bottom:12px"><label class="btn">Choose a .go file<input type="file" id="go-file" accept=".go,text/plain" class="visually-hidden"/></label><a class="link" style="color:var(--focus)" href="/society-example.go" download>Download the example</a></div><textarea class="code" id="go-source" spellcheck="false" placeholder="Paste Go source here">${esc(b._source || "")}</textarea><p class="note" id="go-status" style="margin-top:8px">Used only once it compiles.</p>`;
    dlg.innerHTML = `<div class="dlg-head"><h2 id="strategy-title">${esc(t.name)}</h2><button class="icon-button" data-close aria-label="Close">${icon("close")}</button></div>
      <div class="dlg-tabs">${modes.map(([id, n]) => `<button data-mode="${id}" class="${this.mode === id ? "active" : ""}">${n}</button>`).join("")}</div>
      <div class="dlg-body">${body}</div>
      <div class="dlg-foot"><p>${t.coursework ? "Saving makes a personal copy of this group’s behaviour." : "Applies to the next world you create."}</p><button class="btn primary" id="save-strategy">Save behaviour</button></div>`;
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
          b[k] =
            k === "government"
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
      if (this.mode === "simple") {
        const ranking = $("harvest-ranking").value.trim();
        const ids = ranking ? ranking.split(",").map((id) => id.trim()) : [];
        if (ids.some((id) => !/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))))
          throw new Error(
            "Use comma-separated numeric resident IDs for the harvest ranking.",
          );
        this.strategy.harvestRanking = ids.map(Number);
        if (new Set(this.strategy.harvestRanking).size !== ids.length)
          throw new Error("List each resident once in the harvest ranking.");
      }
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
      delete team.coursework;
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
    const s = this.app.ix?.s;
    const earlierRules = usesLegacyRules(s);
    dlg.innerHTML = `<div class="dlg-head"><h2 id="guide-title">How to watch</h2><button class="icon-button" data-close aria-label="Close">${icon("close")}</button></div><div class="dlg-body guide">
      <p>You are the observer. ${earlierRules ? "Amoeboids choose plots simultaneously at the start of each month." : "At the start of each month, Amoeboids choose plots in a shuffled order. Each sees the residents who have already settled on every plot."} Each resident decides how much to harvest and eat, which rules to propose and where to spend its voting tokens.</p>
      <h3>Controls</h3><dl>
        <dt><kbd>Space</kbd></dt><dd>Play or pause. Play continues until you stop it.</dd>
        <dt><kbd>→</kbd></dt><dd>Advance one phase.</dd>
        <dt><kbd>Shift</kbd> + <kbd>→</kbd></dt><dd>Skip to nightfall.</dd>
        <dt><kbd>1</kbd>–<kbd>9</kbd></dt><dd>Select a plot. <kbd>Esc</kbd> closes the inspector.</dd>
        <dt><kbd>[</kbd> and <kbd>]</kbd></dt><dd>Slower or faster.</dd>
        <dt>Drag and scroll</dt><dd>Move around the island and zoom in to pick out individual Amoeboids.</dd></dl>
      <h3>Reading the island</h3>
      <p>Select a plot to inspect its residents, harvest order and crop conditions. Each resident stays on that plot for the month. A blight puts the plot at risk. Its Trade representative receives donations from other plots and can send carrots to residents. The Extra carrots event adds up to one daily meal per resident, if the field has room.</p>
      <h3>Rules of the world</h3>
      <p>Residents can submit their preferred order for the whole harvest queue. Every active resident may propose rules, elect a representative for Trade or Justice, and vote to revoke either role. Justice handles sanctions. ${hasTokenOnlyVoting(s) ? "Every decision, including whether to form a government, counts only the tokens cast for Yes or No. Abstaining or skipping the vote has no effect on the count." : "Rule ballots count either residents or tokens, as the plot’s threshold specifies."}</p>
      <p>Eating meets a resident’s daily need. ${earlierRules ? "Extra food earns diminishing satisfaction in this saved world." : "Each carrot above that need earns the configured satisfaction reward."} Set the rewards for extra food and thinking under New world → World → Satisfaction. An excluded resident’s carrots disappear. The meteor resets plots and roles each month, and residents keep their private memories.</p>
      <p><a class="link" style="color:var(--focus)" href="/society-example.go" download>Download the Go agent example</a></p></div>`;
    dlg.querySelector("[data-close]").onclick = () => dlg.close();
    dlg.showModal();
  }
}
