// The living map. A painted isometric island whose light follows the phase of
// the day, with every Amoeboid drawn and choreographed from the events of the
// frame being shown. Presentation only: nothing here feeds back into the engine.

import { teamColor, plotLetter, cropStatus, esc } from "/game/model.js";

const TW = 32; // tile width in pixels at zoom 1
const TH = 16;
const WILDS_W = 7.5;
const BASE_SIDE = 12.5;
const GAP = 3.2;

const C = {
  waterTop: "#2a6a72",
  waterDeep: "#173f4a",
  ripple: "rgba(190,240,235,0.10)",
  cliff: "#8f6a46",
  cliffDark: "#6e4f34",
  cliffLine: "rgba(255,230,190,0.10)",
  meadow: "#86b86a",
  meadowDark: "#77a95c",
  plot: "#97c878",
  plotEdge: "#e4d5a4",
  commons: "#cbd99a",
  soil: "#a86f45",
  furrow: "#8b5836",
  leaf: "#4f8f3b",
  leafLight: "#79b84a",
  carrot: "#f3913d",
  wall: "#f2e8d2",
  wallShade: "#d8c9a8",
  roof: "#3d6a74",
  roofShade: "#2f555e",
  trunk: "#6b4a33",
  canopy: "#4c8b48",
  canopyLight: "#69a85b",
  tent: "#efe1c2",
  tentStripe: "#d9915c",
};

// Ambient light across a day: [multiply tint, strength].
const LIGHT = {
  ready: ["#ffe9d0", 0.1],
  environment: ["#ffc9a8", 0.26],
  harvest_order: ["#fff3dd", 0.08],
  harvest: ["#ffffff", 0],
  proposals: ["#fff1d6", 0.08],
  voting: ["#ffd79a", 0.2],
  transfers: ["#ffc07e", 0.3],
  eating: ["#a99ad6", 0.48],
  close: ["#4a5d9a", 0.72],
};

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const span = (p, a, b) => clamp((p - a) / (b - a));
function hash(n, salt = 0) {
  let x = (n * 374761393 + salt * 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177;
  x = x ^ (x >>> 16);
  return (x >>> 0) / 4294967295;
}
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  const x = hexToRgb(a),
    y = hexToRgb(b);
  return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], t))).join(",")})`;
}
function shade(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  const f = (v) => Math.round(clamp(v + amount * 255, 0, 255));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function computeLayout(plots) {
  const n = plots.length;
  const cols =
    n <= 3 ? n : n === 4 ? 2 : n <= 6 ? 3 : n <= 8 ? 4 : Math.ceil(Math.sqrt(n * 1.6));
  const rows = Math.ceil(n / cols);
  const mean = plots.reduce((t, p) => t + p.capacity, 0) / Math.max(1, n);
  const sides = plots.map(
    (p) => BASE_SIDE * Math.sqrt(Math.max(1, p.capacity) / Math.max(1, mean)),
  );
  const cell = Math.max(...sides, 1) + GAP;
  const rects = new Map();
  plots.forEach((p, i) => {
    const col = i % cols,
      row = Math.floor(i / cols),
      side = sides[i];
    rects.set(p.id, {
      id: p.id,
      side,
      x: WILDS_W + col * cell + (cell - side) / 2,
      y: row * cell + (cell - side) / 2,
    });
  });
  const width = WILDS_W + cols * cell;
  const height = Math.max(rows * cell, 10);
  return {
    rects,
    width,
    height,
    wilds: { x: 0.9, y: 0.9, w: WILDS_W - 2.2, h: height - 1.8 },
    cols,
    rows,
  };
}

export class World {
  constructor(canvas, plaqueLayer, handlers = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.plaqueLayer = plaqueLayer;
    this.handlers = handlers;
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.target = null;
    this.insets = { left: 0, right: 0, top: 0, bottom: 0 };
    this.selection = { plot: null, agent: null };
    this.hover = null;
    this.progress = 1;
    this.layout = null;
    this.plan = null;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.agentScreen = [];
    this.plaques = new Map();
    this.lastLight = LIGHT.ready;
    this.bindInput();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
  }

  // ---------------------------------------------------------------- camera
  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    if (this.layout && !this.userMoved) this.fit(true);
  }
  setInsets(insets) {
    const next = { ...this.insets, ...insets };
    const changed = ["left", "right", "top", "bottom"].some(
      (k) => Math.abs((next[k] || 0) - (this.insets[k] || 0)) > 2,
    );
    this.insets = next;
    if (changed && this.layout && !this.userMoved) this.fit();
  }
  project(x, y, z = 0) {
    const c = this.camera;
    return [
      this.w / 2 + ((x - y) * (TW / 2) - c.x) * c.zoom,
      this.h / 2 + ((x + y) * (TH / 2) - z - c.y) * c.zoom,
    ];
  }
  unproject(sx, sy) {
    const c = this.camera;
    const X = (sx - this.w / 2) / c.zoom + c.x;
    const Y = (sy - this.h / 2) / c.zoom + c.y;
    return [(X / (TW / 2) + Y / (TH / 2)) / 2, (Y / (TH / 2) - X / (TW / 2)) / 2];
  }
  boundsOf(x, y, w, h) {
    const pts = [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ].map(([a, b]) => [(a - b) * (TW / 2), (a + b) * (TH / 2)]);
    const xs = pts.map((p) => p[0]),
      ys = pts.map((p) => p[1]);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys) - 40,
      maxY: Math.max(...ys) + 40,
    };
  }
  frameBounds(b, immediate = false, maxZoom = 2.4) {
    const i = this.insets;
    const availW = Math.max(200, this.w - i.left - i.right - 40);
    const availH = Math.max(160, this.h - i.top - i.bottom - 30);
    const zoom = clamp(
      Math.min(availW / (b.maxX - b.minX), availH / (b.maxY - b.minY)),
      0.35,
      maxZoom,
    );
    const cx = (b.minX + b.maxX) / 2 - (i.left - i.right) / 2 / zoom;
    const cy = (b.minY + b.maxY) / 2 - (i.top - i.bottom) / 2 / zoom;
    this.target = { x: cx, y: cy, zoom };
    if (immediate || this.reduced) {
      Object.assign(this.camera, this.target);
      this.target = null;
    }
  }
  fit(immediate = false) {
    if (!this.layout) return;
    this.userMoved = false;
    const L = this.layout;
    this.frameBounds(
      this.boundsOf(-0.5, -0.5, L.width + 1, L.height + 1),
      immediate,
      1.6,
    );
  }
  focusPlot(id) {
    if (!this.layout) return;
    if (id === -1) {
      const w = this.layout.wilds;
      this.frameBounds(this.boundsOf(w.x - 1, w.y, w.w + 2, w.h), false, 2.2);
      return;
    }
    const r = this.layout.rects.get(id);
    if (!r) return;
    this.userMoved = true;
    this.frameBounds(
      this.boundsOf(r.x - 1.2, r.y - 1.2, r.side + 2.4, r.side + 2.4),
      false,
      2.2,
    );
  }
  zoomBy(dir, at = [this.w / 2, this.h / 2]) {
    const before = this.unproject(...at);
    const c = this.camera;
    c.zoom = clamp(c.zoom * (dir > 0 ? 1.18 : 1 / 1.18), 0.3, 4);
    const after = this.unproject(...at);
    c.x += ((before[0] - before[1] - (after[0] - after[1])) * TW) / 2;
    c.y += ((before[0] + before[1] - (after[0] + after[1])) * TH) / 2;
    this.target = null;
    this.userMoved = true;
  }

  bindInput() {
    const el = this.canvas;
    let drag = null;
    el.addEventListener("pointerdown", (e) => {
      drag = {
        x: e.clientX,
        y: e.clientY,
        cx: this.camera.x,
        cy: this.camera.y,
        moved: false,
      };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left,
        sy = e.clientY - r.top;
      if (drag) {
        const dx = e.clientX - drag.x,
          dy = e.clientY - drag.y;
        if (Math.hypot(dx, dy) > 4) drag.moved = true;
        if (drag.moved) {
          this.camera.x = drag.cx - dx / this.camera.zoom;
          this.camera.y = drag.cy - dy / this.camera.zoom;
          this.target = null;
          this.userMoved = true;
          el.style.cursor = "grabbing";
        }
        return;
      }
      const hit = this.hit(sx, sy);
      this.hover = hit;
      el.style.cursor = hit ? "pointer" : "grab";
      this.handlers.onHover?.(hit, e.clientX, e.clientY);
    });
    el.addEventListener("pointerup", (e) => {
      const r = el.getBoundingClientRect();
      if (drag && !drag.moved) {
        const hit = this.hit(e.clientX - r.left, e.clientY - r.top);
        if (hit?.agent !== undefined) this.handlers.onAgent?.(hit.agent);
        else if (hit?.plot !== undefined) this.handlers.onPlot?.(hit.plot);
        else this.handlers.onEmpty?.();
      }
      drag = null;
      el.style.cursor = "grab";
    });
    el.addEventListener("pointerleave", () => {
      this.hover = null;
      this.handlers.onHover?.(null);
    });
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const r = el.getBoundingClientRect();
        this.zoomBy(e.deltaY < 0 ? 1 : -1, [e.clientX - r.left, e.clientY - r.top]);
      },
      { passive: false },
    );
  }

  hit(sx, sy) {
    if (!this.layout) return null;
    if (this.camera.zoom > 0.75) {
      let best = null,
        bestD = 9 * this.camera.zoom;
      for (const a of this.agentScreen) {
        const d = Math.hypot(a.x - sx, a.y - sy + 3 * this.camera.zoom);
        if (d < bestD) {
          best = a;
          bestD = d;
        }
      }
      if (best) return { agent: best.id, label: best.label };
    }
    const [x, y] = this.unproject(sx, sy);
    for (const r of this.layout.rects.values())
      if (x >= r.x && x <= r.x + r.side && y >= r.y && y <= r.y + r.side)
        return { plot: r.id };
    return null;
  }

  setSelection(sel) {
    this.selection = { ...this.selection, ...sel };
  }

  // ---------------------------------------------------------------- frames
  /**
   * Prepares the choreography for one phase: where each Amoeboid starts and
   * ends, what it does in between, and the particles that explain the change.
   */
  setFrame(s, prev, ix, prevIx) {
    const firstLayout = !this.layout || this.layout.rects.size !== s.plots.length;
    if (firstLayout) {
      this.layout = computeLayout(s.plots);
      this.buildPlaques(s);
      this.fit(true);
    }
    this.s = s;
    this.prev = prev && prev.month === s.month ? prev : null;
    this.ix = ix;
    this.prevIx = this.prev ? prevIx : null;
    this.lightFrom = LIGHT[prev?.phase] || LIGHT[s.phase] || LIGHT.ready;
    this.lightTo = s.meteor ? ["#6b4b8a", 0.6] : LIGHT[s.phase] || LIGHT.ready;
    this.plan = this.choreograph();
    this.updatePlaques();
  }

  home(a) {
    const L = this.layout;
    if (a.plot < 0) {
      const w = L.wilds;
      return [
        w.x + 0.4 + hash(a.id, 1) * (w.w - 0.8),
        w.y + 0.5 + hash(a.id, 2) * (w.h - 1),
      ];
    }
    const r = L.rects.get(a.plot);
    if (!r) return [0, 0];
    const u = 0.08 + hash(a.id, 3 + a.plot) * 0.6;
    const v = 0.62 + hash(a.id, 9 + a.plot) * 0.31;
    return [r.x + u * r.side, r.y + v * r.side];
  }
  plotPoint(id, u, v) {
    const r = this.layout.rects.get(id);
    return r ? [r.x + u * r.side, r.y + v * r.side] : [0, 0];
  }
  fieldSlots(r) {
    if (r.slots) return r.slots;
    const rows = Math.max(3, Math.round((r.side * 0.42) / 0.95));
    const perRow = Math.max(6, Math.round((r.side * 0.8) / 0.7));
    const slots = [];
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < perRow; j++)
        slots.push({
          u: 0.12 + (j + 0.5) * (0.76 / perRow),
          v: 0.12 + (i + 0.5) * (0.38 / rows),
          k: hash(r.id * 997 + i * 31 + j, 5),
        });
    // Harvest takes the front of the field first, so depletion reads as a sweep.
    const order = [...slots].sort((a, b) => a.v + a.k * 0.08 - (b.v + b.k * 0.08));
    r.slots = order;
    return order;
  }

  choreograph() {
    const s = this.s,
      prev = this.prev;
    const events = s.events || [];
    const byActor = new Map();
    for (const e of events) {
      if (e.actor < 0) continue;
      const list = byActor.get(e.actor) || [];
      list.push(e);
      byActor.set(e.actor, list);
    }
    const prevAgents = prev ? new Map(prev.agents.map((a) => [a.id, a])) : null;
    const actors = [];
    const particles = [];
    const texts = [];
    const ballotsToday = (s.proposals || []).filter(
      (p) => p.closes === s.absoluteDay && p.status !== "open",
    );
    const assemblyPlots = new Set(ballotsToday.map((p) => p.plot));
    const proposers = new Set(
      (s.proposals || [])
        .filter((p) => p.created === s.absoluteDay)
        .flatMap((p) => p.sponsors || [p.author]),
    );
    const seatCounters = new Map();

    for (const a of s.agents) {
      const before = prevAgents?.get(a.id);
      const evs = byActor.get(a.id) || [];
      if (!a.alive) {
        if (before?.alive)
          actors.push({
            a: before,
            from: this.home(before),
            to: this.home(before),
            act: "excluded",
            delay: hash(a.id, 7) * 0.4,
          });
        continue;
      }
      const to = this.home(a);
      const from = before?.alive && before.plot === a.plot ? this.home(before) : to;
      const actor = { a, from, to, act: null, delay: hash(a.id, 11) * 0.3 };
      if (!before?.alive && prev) actor.act = "spawn";
      else if (s.phase === "movement" && before && before.plot !== a.plot)
        actor.act = "move";
      else if (s.phase === "harvest") {
        const h = evs.find((e) => e.kind === "harvest");
        if (h && h.amount > 0 && a.plot >= 0) {
          const r = this.layout.rects.get(a.plot);
          const slots = this.fieldSlots(r);
          const slot = slots[Math.floor(hash(a.id, 13) * slots.length)];
          actor.act = "harvest";
          actor.slot = [r.x + slot.u * r.side, r.y + slot.v * r.side];
          actor.amount = h.amount;
        }
      } else if (s.phase === "proposals" && proposers.has(a.id) && a.plot >= 0) {
        actor.act = "propose";
        actor.slot = this.plotPoint(
          a.plot,
          0.7 + hash(a.id, 4) * 0.05,
          0.86 + hash(a.id, 6) * 0.06,
        );
      } else if (s.phase === "voting" && assemblyPlots.has(a.plot)) {
        const n = seatCounters.get(a.plot) || 0;
        seatCounters.set(a.plot, n + 1);
        actor.act = "vote";
        actor.seatIndex = n;
        const motion = ballotsToday.find((p) => p.plot === a.plot && p.votes?.[a.id]);
        actor.choice = motion?.votes?.[a.id] || "abstain";
      } else if (s.phase === "eating") {
        const eat = evs.find((e) => e.kind === "eat");
        const think = evs.find((e) => e.kind === "think");
        actor.act = "eat";
        actor.ate = eat?.amount || 0;
        actor.thought = think?.amount || 0;
      } else if (s.phase === "close") actor.act = "sleep";
      else if (s.phase === "environment") actor.act = "wake";
      actors.push(actor);
    }
    // Assembly seats: concentric arcs facing the hall.
    for (const actor of actors) {
      if (actor.act !== "vote") continue;
      const r = this.layout.rects.get(actor.a.plot);
      const total = seatCounters.get(actor.a.plot);
      const perRing = Math.max(10, Math.ceil(Math.sqrt(total) * 3.2));
      const ring = Math.floor(actor.seatIndex / perRing);
      const inRing = actor.seatIndex % perRing;
      const count = Math.min(perRing, total - ring * perRing);
      const radius = r.side * (0.16 + ring * 0.065);
      const angle = Math.PI * (0.5 + (count > 1 ? inRing / (count - 1) : 0.5)) + 0.15;
      const [hx, hy] = this.plotPoint(actor.a.plot, 0.83, 0.79);
      actor.slot = [hx + Math.cos(angle) * radius, hy + Math.sin(angle) * radius * 0.92];
      actor.delay = 0.28 + hash(actor.a.id, 15) * 0.38;
    }

    const fieldFrom = new Map(
      s.plots.map((p) => [
        p.id,
        prev?.plots.find((old) => old.id === p.id)?.stock ?? p.stock,
      ]),
    );
    for (const e of events) {
      if (e.kind === "growth" && e.amount > 0) {
        const [x, y] = this.plotPoint(e.plot, 0.5, 0.3);
        texts.push({
          x,
          y,
          z: 30,
          text: `+${Math.round(e.amount)}`,
          color: "#ffe2b8",
          t0: 0.15,
          t1: 0.85,
        });
      }
      if ((e.kind === "gift" || e.kind === "donation") && e.amount > 0) {
        const from = this.ix.agents.get(e.actor);
        const to = this.ix.agents.get(e.target);
        if (from && to)
          particles.push({
            kind: "carrot",
            from: this.home(from),
            to: this.home(to),
            z: 25,
            t0: 0.25,
            t1: 0.85,
          });
      }
    }
    const harvested = new Map();
    for (const e of events)
      if (e.kind === "harvest")
        harvested.set(e.plot, (harvested.get(e.plot) || 0) + e.amount);
    for (const [plot, amount] of harvested) {
      if (plot < 0 || !amount) continue;
      const [x, y] = this.plotPoint(plot, 0.5, 0.3);
      texts.push({
        x,
        y,
        z: 30,
        text: `−${Math.round(amount)}`,
        color: "#ffd0a0",
        t0: 0.45,
        t1: 1,
      });
    }
    if (actors.some((a) => a.act === "excluded")) {
      const deaths = new Map();
      for (const actor of actors)
        if (actor.act === "excluded")
          deaths.set(actor.a.plot, (deaths.get(actor.a.plot) || 0) + 1);
      for (const [plot, n] of deaths) {
        const [x, y] =
          plot >= 0
            ? this.plotPoint(plot, 0.38, 0.76)
            : [this.layout.wilds.x + this.layout.wilds.w / 2, this.layout.wilds.y + 2];
        texts.push({
          x,
          y,
          z: 40,
          text: `${n} excluded`,
          color: "#ffb3b6",
          t0: 0.35,
          t1: 1,
        });
      }
    }
    // Animate the hall when the government forms or dissolves.
    const built = new Map();
    for (const p of s.plots) {
      const old = prev?.plots.find((q) => q.id === p.id);
      if (p.government && old && !old.government) built.set(p.id, "rise");
      if (!p.government && old?.government) built.set(p.id, "fall");
    }
    return {
      actors,
      particles,
      texts,
      fieldFrom,
      built,
      assemblyPlots,
      ballotsToday,
    };
  }

  // ---------------------------------------------------------------- plaques
  buildPlaques(s) {
    this.plaqueLayer.innerHTML = "";
    this.plaques.clear();
    for (const p of s.plots) {
      const b = document.createElement("button");
      b.className = "plaque";
      b.dataset.plot = p.id;
      b.type = "button";
      b.onclick = () => this.handlers.onPlot?.(p.id);
      this.plaqueLayer.append(b);
      this.plaques.set(p.id, b);
    }
  }
  updatePlaques() {
    const s = this.s,
      ix = this.ix;
    for (const p of s.plots) {
      const b = this.plaques.get(p.id);
      if (!b) continue;
      const n = (ix.residents.get(p.id) || []).length;
      const weather = ["sun", "cloud", "rain"][p.weather];
      const crop = cropStatus(p);
      const motions = (s.proposals || []).filter(
        (q) =>
          q.plot === p.id && (q.created === s.absoluteDay || q.closes === s.absoluteDay),
      ).length;
      const html = `<span class="plaque-letter">${plotLetter(p)}</span><span class="plaque-body"><span class="plaque-row"><svg class="i"><use href="#i-${weather}"/></svg><b>${n}</b>${p.government ? `<svg class="i civic" aria-label="Governed"><use href="#i-hall"/></svg>` : ""}${crop ? `<span title="${esc(crop)}"><svg class="i"><use href="#i-${p.cropEvent === "bumper" ? "sprout" : "alert"}"/></svg></span>` : ""}${motions ? `<span class="plaque-motions" title="${motions} ${motions === 1 ? "motion" : "motions"} before the assembly today"><svg class="i"><use href="#i-ballot"/></svg>${motions}</span>` : ""}</span><span class="plaque-meter"><i style="width:${Math.round(clamp(p.stock / Math.max(1, p.capacity)) * 100)}%"></i></span></span>`;
      if (b.dataset.html !== html) {
        b.innerHTML = html;
        b.dataset.html = html;
      }
      b.setAttribute(
        "aria-label",
        `${p.name}: ${n} residents, ${p.stock} of ${p.capacity} field carrots, ${["sunny", "cloudy", "dark"][p.weather]}${p.government ? ", governed" : ""}${crop ? ", " + crop : ""}${motions ? `, ${motions} motions today` : ""}`,
      );
    }
  }
  positionPlaques() {
    if (!this.layout) return;
    const z = this.camera.zoom;
    for (const [id, b] of this.plaques) {
      let x, y;
      if (id === -1) {
        const w = this.layout.wilds;
        [x, y] = this.project(w.x + w.w / 2, w.y, 0);
      } else {
        const r = this.layout.rects.get(id);
        if (!r) continue;
        [x, y] = this.project(r.x + 0.05 * r.side, r.y + 0.05 * r.side, 4);
      }
      b.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y - 14 - 10 * z)}px, 0) translate(-50%, -100%)`;
      b.classList.toggle("selected", this.selection.plot === id);
      b.classList.toggle("hovered", this.hover?.plot === id);
    }
  }

  // ---------------------------------------------------------------- render
  render(time, progress) {
    if (!this.s || !this.layout) return;
    this.time = time;
    this.glows = [];
    this.progress = this.reduced ? 1 : progress;
    if (this.target) {
      const c = this.camera,
        t = this.target,
        k = 0.14;
      c.x = lerp(c.x, t.x, k);
      c.y = lerp(c.y, t.y, k);
      c.zoom = lerp(c.zoom, t.zoom, k);
      if (
        Math.abs(c.x - t.x) < 0.3 &&
        Math.abs(c.y - t.y) < 0.3 &&
        Math.abs(c.zoom - t.zoom) < 0.002
      )
        this.target = null;
    }
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawWater(ctx);
    this.drawIsland(ctx);
    for (const r of this.layout.rects.values()) this.drawPlotGround(ctx, r);
    this.drawWildsGround(ctx);
    const sprites = [];
    this.collectScenery(sprites);
    for (const r of this.layout.rects.values()) this.collectPlot(sprites, r);
    this.collectAgents(sprites);
    sprites.sort((a, b) => a.depth - b.depth);
    this.drawShadows(ctx);
    for (const sp of sprites) sp.draw(ctx);
    this.drawParticles(ctx);
    this.drawWeather(ctx);
    this.drawLight(ctx);
    this.drawGlows(ctx);
    this.drawTexts(ctx);
    this.drawSelection(ctx);
    if (this.s.meteor) this.drawMeteor(ctx);
    this.positionPlaques();
  }

  drawWater(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, C.waterTop);
    g.addColorStop(1, C.waterDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    const t = this.reduced ? 0 : this.time / 1000;
    ctx.strokeStyle = C.ripple;
    ctx.lineWidth = 1;
    const z = this.camera.zoom;
    for (let i = 0; i < 46; i++) {
      const x =
        ((hash(i, 1) * 1.6 - 0.3) * this.w + t * 6 * (0.5 + hash(i, 2))) % (this.w + 120);
      const y = hash(i, 3) * this.h;
      const len = (18 + hash(i, 4) * 40) * Math.max(0.6, z);
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 0.7 + i);
      ctx.beginPath();
      ctx.moveTo(x - 60, y);
      ctx.quadraticCurveTo(x - 60 + len / 2, y - 2, x - 60 + len, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  poly(ctx, pts, fill, stroke) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }
  quad(x, y, w, h, z = 0) {
    return [
      this.project(x, y, z),
      this.project(x + w, y, z),
      this.project(x + w, y + h, z),
      this.project(x, y + h, z),
    ];
  }

  drawIsland(ctx) {
    const L = this.layout;
    const x0 = -0.6,
      y0 = -0.6,
      w = L.width + 1.2,
      h = L.height + 1.2;
    const depth = 46;
    const top = this.quad(x0, y0, w, h, 0);
    const down = (p) => [p[0], p[1] + depth * this.camera.zoom];
    // Two visible cliff faces with a soft shoreline foam.
    ctx.save();
    ctx.shadowColor = "rgba(5,25,30,0.45)";
    ctx.shadowBlur = 40 * this.camera.zoom;
    ctx.shadowOffsetY = 20 * this.camera.zoom;
    this.poly(ctx, [top[3], top[2], down(top[2]), down(top[3])], C.cliffDark);
    ctx.restore();
    this.poly(ctx, [top[1], top[2], down(top[2]), down(top[1])], C.cliff);
    this.poly(ctx, [top[3], top[2], down(top[2]), down(top[3])], C.cliffDark);
    ctx.strokeStyle = C.cliffLine;
    ctx.lineWidth = Math.max(1, this.camera.zoom);
    for (const f of [0.35, 0.68]) {
      ctx.beginPath();
      const a = [top[3][0], top[3][1] + depth * f * this.camera.zoom],
        b = [top[2][0], top[2][1] + depth * f * this.camera.zoom],
        c = [top[1][0], top[1][1] + depth * f * this.camera.zoom];
      ctx.moveTo(...a);
      ctx.lineTo(...b);
      ctx.lineTo(...c);
      ctx.stroke();
    }
    this.poly(ctx, top, C.meadow);
    // Meadow texture: soft darker patches.
    ctx.fillStyle = C.meadowDark;
    for (let i = 0; i < 60; i++) {
      const [px, py] = this.project(x0 + hash(i, 21) * w, y0 + hash(i, 22) * h);
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.ellipse(
        px,
        py,
        (8 + hash(i, 23) * 18) * this.camera.zoom,
        (4 + hash(i, 24) * 8) * this.camera.zoom,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawWildsGround(ctx) {
    const w = this.layout.wilds;
    const z = this.camera.zoom;
    const sel = this.selection.plot === -1;
    const pts = this.quad(w.x, w.y, w.w, w.h, 0.5);
    this.poly(ctx, pts, "rgba(214,201,150,0.38)");
    if (sel || this.hover?.plot === -1) {
      ctx.lineWidth = 2 * z;
      this.poly(ctx, pts, null, sel ? "rgba(255,248,220,0.9)" : "rgba(255,248,220,0.45)");
    }
    // Campfire at the centre of the wilds.
    const [fx, fy] = this.project(w.x + w.w / 2, w.y + w.h / 2);
    ctx.fillStyle = "#8a8174";
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(
        fx + Math.cos(a) * 7 * z,
        fy + Math.sin(a) * 3.5 * z,
        2.2 * z,
        1.4 * z,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }

  drawPlotGround(ctx, r) {
    const z = this.camera.zoom;
    const p = this.s.plots.find((q) => q.id === r.id);
    const lift = 3;
    const edge = this.quad(r.x, r.y, r.side, r.side, 0);
    const top = this.quad(r.x, r.y, r.side, r.side, lift);
    this.poly(ctx, [edge[1], edge[2], top[2], top[1]], shade(C.plotEdge, -0.12));
    this.poly(ctx, [edge[3], edge[2], top[2], top[3]], shade(C.plotEdge, -0.2));
    this.poly(ctx, top, C.plotEdge);
    const inset = 0.035 * r.side;
    this.poly(
      ctx,
      this.quad(r.x + inset, r.y + inset, r.side - inset * 2, r.side - inset * 2, lift),
      C.plot,
    );
    // Trodden commons where residents gather.
    this.poly(
      ctx,
      this.quad(
        r.x + 0.06 * r.side,
        r.y + 0.58 * r.side,
        0.66 * r.side,
        0.37 * r.side,
        lift,
      ),
      C.commons,
    );
    // Field soil and furrows.
    const fx = r.x + 0.1 * r.side,
      fy = r.y + 0.1 * r.side,
      fw = 0.8 * r.side,
      fh = 0.42 * r.side;
    this.poly(ctx, this.quad(fx, fy, fw, fh, lift), C.soil);
    ctx.strokeStyle = C.furrow;
    ctx.lineWidth = Math.max(0.6, 1.4 * z);
    const rows = Math.max(3, Math.round((r.side * 0.42) / 0.95));
    for (let i = 0; i <= rows * 2; i++) {
      const v = fy + (i / (rows * 2)) * fh;
      ctx.beginPath();
      ctx.moveTo(...this.project(fx + 0.1, v, lift));
      ctx.lineTo(...this.project(fx + fw - 0.1, v, lift));
      ctx.stroke();
    }
    // Paths from the commons to the hall and field.
    if (p?.government) {
      ctx.strokeStyle = "rgba(240,226,184,0.9)";
      ctx.lineWidth = 3 * z;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(...this.project(r.x + 0.4 * r.side, r.y + 0.78 * r.side, lift));
      ctx.quadraticCurveTo(
        ...this.project(r.x + 0.7 * r.side, r.y + 0.9 * r.side, lift),
        ...this.project(r.x + 0.83 * r.side, r.y + 0.84 * r.side, lift),
      );
      ctx.stroke();
    }
    const selected = this.selection.plot === r.id;
    if (selected || this.hover?.plot === r.id) {
      ctx.lineWidth = (selected ? 2.5 : 1.5) * z;
      this.poly(
        ctx,
        top,
        null,
        selected ? "rgba(255,250,225,0.95)" : "rgba(255,250,225,0.5)",
      );
    }
  }

  collectScenery(list) {
    const L = this.layout;
    const z = this.camera.zoom;
    // Trees around the rim and in the wilds, placed deterministically.
    const trees = [];
    for (let i = 0; i < 14; i++)
      trees.push([
        L.wilds.x + hash(i, 41) * L.wilds.w,
        -0.2 + (hash(i, 42) > 0.5 ? 0 : L.height + 0.2),
      ]);
    for (let i = 0; i < 10; i++)
      trees.push([
        L.wilds.x - 0.3 + hash(i, 43) * 0.6,
        L.wilds.y + hash(i, 44) * L.wilds.h,
      ]);
    for (let i = 0; i < 8; i++)
      trees.push([WILDS_W + hash(i, 45) * (L.width - WILDS_W), L.height + 0.2]);
    for (let i = 0; i < 6; i++) trees.push([L.width + 0.2, hash(i, 46) * L.height]);
    trees.forEach(([x, y], i) => {
      const s = 0.7 + hash(i, 47) * 0.6;
      list.push({ depth: x + y, draw: (ctx) => this.drawTree(ctx, x, y, s * z, i) });
    });
    // Tents in the wilds.
    for (let i = 0; i < 5; i++) {
      const x = L.wilds.x + 0.8 + hash(i, 51) * (L.wilds.w - 1.6);
      const y = L.wilds.y + 1 + (i / 5) * (L.wilds.h - 2);
      list.push({ depth: x + y, draw: (ctx) => this.drawTent(ctx, x, y, z) });
    }
    const w = L.wilds;
    list.push({
      depth: w.x + w.w / 2 + w.y + w.h / 2,
      draw: (ctx) => this.drawFire(ctx, w.x + w.w / 2, w.y + w.h / 2, z, 1),
    });
  }
  drawTree(ctx, x, y, s, i) {
    const [px, py] = this.project(x, y);
    const sway = this.reduced ? 0 : Math.sin(this.time / 1300 + i) * 1.2 * s;
    ctx.fillStyle = "rgba(20,50,30,0.22)";
    ctx.beginPath();
    ctx.ellipse(px, py, 9 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.trunk;
    ctx.fillRect(px - 1.4 * s, py - 12 * s, 2.8 * s, 12 * s);
    ctx.fillStyle = C.canopy;
    ctx.beginPath();
    ctx.ellipse(px + sway, py - 18 * s, 9 * s, 10 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.canopyLight;
    ctx.beginPath();
    ctx.ellipse(px - 2.5 * s + sway, py - 21 * s, 5 * s, 5.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  drawTent(ctx, x, y, z) {
    const [px, py] = this.project(x, y);
    ctx.fillStyle = "rgba(30,40,30,0.2)";
    ctx.beginPath();
    ctx.ellipse(px, py + 1 * z, 10 * z, 4 * z, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.tent;
    ctx.beginPath();
    ctx.moveTo(px - 9 * z, py);
    ctx.lineTo(px, py - 13 * z);
    ctx.lineTo(px + 9 * z, py);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.tentStripe;
    ctx.beginPath();
    ctx.moveTo(px - 2.5 * z, py);
    ctx.lineTo(px, py - 13 * z);
    ctx.lineTo(px + 2.5 * z, py);
    ctx.closePath();
    ctx.fill();
  }
  drawFire(ctx, x, y, z, lit) {
    const [px, py] = this.project(x, y);
    const t = this.time / 1000;
    const night = this.nightAmount();
    if (!lit) return;
    for (let k = 0; k < 3; k++) {
      const flick = this.reduced ? 1 : 0.8 + 0.2 * Math.sin(t * 9 + k * 2);
      ctx.fillStyle = ["#ffcf5c", "#ff9a3c", "#ff6b3c"][k];
      ctx.beginPath();
      ctx.ellipse(
        px + (k - 1) * 2 * z,
        py - (4 + 3 * flick) * z,
        (2.6 - k * 0.5) * z,
        (5 * flick - k) * z,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    this.glows.push({
      x: px,
      y: py - 4 * z,
      r: (16 + night * 26) * z,
      a: 0.2 + night * 0.45,
    });
  }

  collectPlot(list, r) {
    const z = this.camera.zoom;
    const p = this.s.plots.find((q) => q.id === r.id);
    if (!p) return;
    const lift = 3;
    const plan = this.plan;
    // Crops: the number of standing plants follows the field stock.
    const slots = this.fieldSlots(r);
    const from = plan.fieldFrom.get(p.id) ?? p.stock;
    const pr = this.progress;
    const tween =
      this.s.phase === "harvest"
        ? ease(span(pr, 0.3, 0.75))
        : this.s.phase === "environment"
          ? ease(span(pr, 0.1, 0.7))
          : ease(span(pr, 0.2, 0.8));
    const stock = lerp(from, p.stock, tween);
    const shown = Math.round(clamp(stock / Math.max(1, p.capacity)) * slots.length);
    for (let i = 0; i < shown; i++) {
      const sl = slots[slots.length - 1 - i];
      const x = r.x + sl.u * r.side,
        y = r.y + sl.v * r.side;
      list.push({
        depth: x + y,
        draw: (ctx) => this.drawPlant(ctx, x, y, lift, z, sl.k),
      });
    }
    // A hall marks a governed plot. Other plots gather around a fire.
    const [hx, hy] = this.plotPoint(p.id, 0.83, 0.79);
    const build = plan.built.get(p.id);
    if (p.government || build === "fall") {
      const rise =
        build === "rise"
          ? ease(span(pr, 0.05, 0.6))
          : build === "fall"
            ? 1 - ease(span(pr, 0.05, 0.6))
            : 1;
      const size = r.side * 0.075;
      list.push({
        depth: hx + hy + size,
        draw: (ctx) => this.drawHall(ctx, hx, hy, size, rise, p),
      });
    } else {
      list.push({
        depth: hx + hy,
        draw: (ctx) =>
          this.drawFire(
            ctx,
            hx,
            hy,
            z,
            this.nightAmount() > 0.2 || this.s.phase === "voting",
          ),
      });
      list.push({
        depth: hx + hy - 0.5,
        draw: (ctx) => {
          const [px, py] = this.project(hx, hy, lift);
          ctx.fillStyle = "#8a8174";
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            ctx.beginPath();
            ctx.ellipse(
              px + Math.cos(a) * 7 * z,
              py + Math.sin(a) * 3.5 * z,
              2.2 * z,
              1.4 * z,
              0,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
        },
      });
    }
  }
  plantSprite(z, frame) {
    const { step, z: zs } = this.zoomStep(z);
    const s = zs;
    const w = 9 * s,
      h = 10 * s;
    return this.sprite(`p|${step}|${frame}`, w, h, (g) => {
      const px = w / 2,
        py = h - 1.5 * s;
      const sway = (frame - 2) * 0.45 * s;
      g.fillStyle = C.carrot;
      g.beginPath();
      g.ellipse(px, py - 0.6 * s, 1.8 * s, 1.1 * s, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = C.leaf;
      g.lineWidth = 1.3 * s;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(px, py - 1 * s);
      g.lineTo(px - 2.2 * s + sway, py - 6 * s);
      g.moveTo(px, py - 1 * s);
      g.lineTo(px + sway * 0.5, py - 7.5 * s);
      g.moveTo(px, py - 1 * s);
      g.lineTo(px + 2.2 * s + sway, py - 5.5 * s);
      g.stroke();
      g.strokeStyle = C.leafLight;
      g.lineWidth = 0.9 * s;
      g.beginPath();
      g.moveTo(px, py - 1.5 * s);
      g.lineTo(px + sway * 0.5, py - 7 * s);
      g.stroke();
    });
  }
  drawPlant(ctx, x, y, lift, z, k) {
    const [px, py] = this.project(x, y, lift);
    const s = z * (0.8 + k * 0.4);
    if (z < 0.55) {
      ctx.fillStyle = C.leafLight;
      ctx.fillRect(px - 1.2 * s, py - 3 * s, 2.4 * s, 3 * s);
      return;
    }
    const frame = this.reduced
      ? 2
      : Math.round(2 + 2 * Math.sin(this.time / 900 + k * 12));
    const sp = this.plantSprite(s, frame);
    const scale = s / this.zoomStep(s).z;
    const w = sp.cssW * scale,
      h = sp.cssH * scale;
    ctx.drawImage(sp, px - w / 2, py - h + 1.5 * s, w, h);
  }
  drawHall(ctx, x, y, size, rise, p) {
    const z = this.camera.zoom;
    const h = 26 * rise;
    const s = size;
    const lift = 3;
    const base = this.quad(x - s, y - s, s * 2, s * 2, lift);
    const up = (pt, dz) => [pt[0], pt[1] - dz * z];
    ctx.fillStyle = "rgba(20,40,30,0.25)";
    this.poly(
      ctx,
      this.quad(x - s * 1.2, y - s * 0.9, s * 2.6, s * 2.6, lift),
      "rgba(20,40,30,0.18)",
    );
    if (rise <= 0) return;
    // Walls (two visible faces).
    this.poly(ctx, [base[1], base[2], up(base[2], h), up(base[1], h)], C.wallShade);
    this.poly(ctx, [base[3], base[2], up(base[2], h), up(base[3], h)], C.wall);
    const night = this.nightAmount();
    // Door and windows.
    const door = this.project(x - s * 0.1, y + s, lift);
    ctx.fillStyle = "#6b4a33";
    ctx.fillRect(door[0] - 3 * z, door[1] - 10 * z * rise, 6 * z, 10 * z * rise);
    const win = night > 0.25 || this.s.phase === "voting" ? "#ffd37a" : "#4b5d64";
    for (const f of [0.35, 0.75]) {
      const [wx, wy] = this.project(x - s + f * s * 2, y + s, lift);
      ctx.fillStyle = win;
      ctx.fillRect(wx - 2 * z, wy - 17 * z * rise, 3.5 * z, 4.5 * z * rise);
      if (win === "#ffd37a")
        this.glows.push({
          x: wx,
          y: wy - 15 * z,
          r: 22 * z,
          a: 0.35 * Math.max(night, 0.4),
        });
    }
    // Roof.
    const ridgeA = up(this.project(x - s, y, lift), h + 14 * rise);
    const ridgeB = up(this.project(x + s, y, lift), h + 14 * rise);
    const roof = C.roof;
    this.poly(ctx, [up(base[3], h), up(base[2], h), ridgeB, ridgeA], roof);
    this.poly(ctx, [up(base[1], h), up(base[2], h), ridgeB], shade(roof, -0.08));
    // A violet flag marks an occupied Trade role.
    const [fx, fy] = up(this.project(x + s * 0.9, y - s * 0.9, lift), 0);
    ctx.strokeStyle = "#5c4a3a";
    ctx.lineWidth = 1.2 * z;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx, fy - (h + 26) * z);
    ctx.stroke();
    const wave = this.reduced ? 0 : Math.sin(this.time / 300 + p.id) * 1.5 * z;
    ctx.fillStyle = p.roles?.trade != null ? "#c9a8ff" : "#f6efe0";
    ctx.beginPath();
    ctx.moveTo(fx, fy - (h + 26) * z);
    ctx.quadraticCurveTo(
      fx + 6 * z,
      fy - (h + 25) * z + wave,
      fx + 12 * z,
      fy - (h + 22) * z,
    );
    ctx.lineTo(fx, fy - (h + 17) * z);
    ctx.closePath();
    ctx.fill();
    if (rise < 1 && this.plan.built.get(p.id) === "rise") {
      ctx.fillStyle = `rgba(240,230,200,${0.5 * (1 - rise)})`;
      ctx.beginPath();
      ctx.ellipse(door[0], door[1], 30 * z, 10 * z, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  agentPosition(actor, p) {
    const { from, to } = actor;
    switch (actor.act) {
      case "move": {
        const t = ease(span(p, 0.08 + actor.delay * 0.6, 0.62 + actor.delay));
        const x = lerp(from[0], to[0], t),
          y = lerp(from[1], to[1], t);
        return {
          x,
          y,
          z:
            Math.sin(Math.PI * t) * 26 +
            Math.abs(Math.sin(t * 14)) * 4 * (t > 0 && t < 1),
          walking: t > 0 && t < 1,
        };
      }
      case "harvest":
      case "propose":
      case "vote": {
        const go =
          actor.act === "vote"
            ? [0.02, 0.28]
            : [0.02 + actor.delay * 0.3, 0.32 + actor.delay * 0.3];
        const back = actor.act === "vote" ? [0.84, 0.98] : [0.66, 0.92];
        const out = ease(span(p, go[0], go[1]));
        const ret = ease(span(p, back[0], back[1]));
        const t = out * (1 - ret);
        const x = lerp(to[0], actor.slot[0], t),
          y = lerp(to[1], actor.slot[1], t);
        const walking = (p > go[0] && p < go[1]) || (p > back[0] && p < back[1]);
        return {
          x,
          y,
          z: walking ? Math.abs(Math.sin(p * 60)) * 2.5 : 0,
          walking,
          there: out >= 1 && ret <= 0,
          carrying: actor.act === "harvest" && ret > 0 && ret < 1,
        };
      }
      case "spawn": {
        return {
          x: to[0],
          y: to[1],
          z: 0,
          pop: ease(span(p, actor.delay, actor.delay + 0.3)),
        };
      }
      default:
        return { x: to[0], y: to[1], z: 0 };
    }
  }

  collectAgents(list) {
    const z = this.camera.zoom;
    const p = this.progress;
    const t = this.reduced ? 0 : this.time / 1000;
    const night = this.nightAmount();
    this.agentScreen = [];
    this.shadows = [];
    const roles = this.ix.roles;
    for (const actor of this.plan.actors) {
      const a = actor.a;
      const pos = this.agentPosition(actor, p);
      // Idle wander around the home spot.
      const idle = actor.act === "move" || pos.there || this.reduced ? 0 : 1;
      const wx = idle * Math.sin(t * 0.35 + a.id * 1.7) * 0.22;
      const wy = idle * Math.cos(t * 0.3 + a.id * 2.3) * 0.18;
      const x = pos.x + wx,
        y = pos.y + wy;
      const r = roles.get(a.id) || [];
      const sel = this.selection.agent === a.id;
      if (actor.act !== "excluded" || p < actor.delay + 0.3) {
        const [gx, gy] = this.project(x, y, 3);
        this.shadows.push({
          x: gx,
          y: gy,
          k: actor.act === "spawn" ? Math.max(0.01, pos.pop ?? 1) : 1,
        });
      }
      list.push({
        depth: x + y + 0.01,
        draw: (ctx) => {
          const [sx, sy] = this.project(x, y, 3 + pos.z);
          const [, gy] = this.project(x, y, 3);
          this.agentScreen.push({ id: a.id, x: sx, y: sy, label: a.name });
          let alpha = 1,
            scale = 1,
            tint = null;
          if (actor.act === "excluded") {
            const d = span(p, actor.delay, actor.delay + 0.45);
            alpha = 1 - span(p, actor.delay + 0.3, actor.delay + 0.6);
            tint = d;
            if (alpha <= 0) return;
          }
          if (actor.act === "spawn") scale = Math.max(0.01, pos.pop ?? 1);
          const asleep = actor.act === "sleep" && night > 0.4;
          this.drawAmoeboid(ctx, sx, sy, gy, z * scale, teamColor(a.team), {
            id: a.id,
            alpha,
            grey: tint,
            asleep,
            walking: pos.walking,
            weak: a.body < (this.s.settings.bodyCapacity || 2),
            officer: r.some((x) => x.kind === "justice"),
            representative: r.some((x) => x.kind === "trade"),
            selected: sel,
          });
          // Activity props.
          if (actor.act === "harvest" && (pos.there || pos.carrying))
            this.drawCarrotProp(ctx, sx, sy - 13 * z, z);
          if (actor.act === "propose" && pos.there)
            this.drawBubble(ctx, sx, sy - 16 * z, z, "scroll");
          if (actor.act === "vote") {
            const shown = p >= actor.delay && p < 0.9;
            if (shown)
              this.drawBubble(
                ctx,
                sx,
                sy - 15 * z,
                z,
                actor.choice,
                ease(span(p, actor.delay, actor.delay + 0.06)),
              );
          }
          if (actor.act === "eat" && actor.ate > 0) {
            const m = span(p, 0.1 + actor.delay * 0.5, 0.55 + actor.delay * 0.5);
            if (m > 0 && m < 1 && !this.reduced) this.drawCrumbs(ctx, sx, sy, z, m, a.id);
          }
          if (actor.act === "eat" && actor.thought > 0.5) {
            const m = span(p, 0.55 + actor.delay * 0.3, 0.95);
            if (m > 0 && m < 1)
              this.drawThought(ctx, sx, sy - 10 * z - m * 22 * z, z, 1 - m);
          }
          if (actor.act === "excluded")
            this.drawWisp(ctx, sx, sy, z, span(p, actor.delay + 0.1, actor.delay + 0.8));
          if (asleep && !this.reduced && hash(a.id, 61) < 0.35) {
            const k = (t * 0.5 + hash(a.id, 62)) % 1;
            ctx.globalAlpha = (1 - k) * 0.8;
            ctx.fillStyle = "#dfe6ff";
            ctx.font = `600 ${Math.round(7 * z + 4 * k * z)}px "Instrument Sans", sans-serif`;
            ctx.fillText("z", sx + 4 * z + k * 6 * z, sy - 10 * z - k * 16 * z);
            ctx.globalAlpha = 1;
          }
          if (actor.act === "wake" && this.s.phase === "environment") {
            const plot = this.s.plots.find((q) => q.id === a.plot);
            const rate = plot ? 3 - plot.weather : 1;
            const m = span(p, 0.2 + hash(a.id, 63) * 0.4, 0.95);
            if (m > 0 && m < 1 && hash(a.id, 64) < rate * 0.12 && !this.reduced) {
              ctx.globalAlpha = 1 - m;
              ctx.fillStyle = "#a8c8ff";
              ctx.beginPath();
              ctx.arc(
                sx + (hash(a.id, 65) - 0.5) * 8 * z,
                sy - 8 * z - m * 20 * z,
                1.6 * z,
                0,
                Math.PI * 2,
              );
              ctx.fill();
              ctx.globalAlpha = 1;
            }
          }
        },
      });
    }
  }

  // Sprites: bodies and plants are painted once per colour, variant and zoom
  // step, then stamped. 300 Amoeboids cost a few hundred drawImage calls.
  sprite(key, w, h, paint) {
    let c = this.sprites?.get(key);
    if (c) return c;
    if (!this.sprites || this.sprites.size > 400) this.sprites = new Map();
    c = document.createElement("canvas");
    const k = this.dpr;
    c.width = Math.max(1, Math.ceil(w * k));
    c.height = Math.max(1, Math.ceil(h * k));
    const g = c.getContext("2d");
    g.scale(k, k);
    paint(g);
    c.cssW = w;
    c.cssH = h;
    this.sprites.set(key, c);
    // Bitmaps stamp faster than canvases; swap one in once it is ready.
    if (typeof createImageBitmap === "function")
      createImageBitmap(c).then(
        (bm) => {
          if (this.sprites.get(key) !== c) return;
          bm.cssW = w;
          bm.cssH = h;
          this.sprites.set(key, bm);
        },
        () => {},
      );
    return c;
  }
  zoomStep(z) {
    const step = Math.round(Math.log(z) / Math.log(1.1));
    return { step, z: Math.pow(1.1, step) };
  }
  bodySprite(color, variant, z) {
    const { step, z: zs } = this.zoomStep(z);
    const r = 4.2 * zs;
    const w = r * 2.8,
      h = r * 2.8;
    return this.sprite(`b|${color}|${variant}|${step}`, w, h, (g) => {
      const x = w / 2,
        cy = h / 2;
      const fill = variant.startsWith("grey")
        ? mix(color, "#9aa3a8", 0.85)
        : variant.startsWith("weak")
          ? mix(color, "#c8c3b5", 0.35)
          : color;
      g.fillStyle = fill;
      g.beginPath();
      const lumps = 7;
      for (let i = 0; i <= lumps; i++) {
        const a = (i / lumps) * Math.PI * 2;
        const k = 1 + Math.sin(i * 2.1) * 0.05;
        const px = x + Math.cos(a) * r * k,
          py = cy + Math.sin(a) * r * k * 0.92;
        if (i === 0) g.moveTo(px, py);
        else {
          const pa = ((i - 0.5) / lumps) * Math.PI * 2;
          g.quadraticCurveTo(
            x + Math.cos(pa) * r * 1.12,
            cy + Math.sin(pa) * r * 1.04,
            px,
            py,
          );
        }
      }
      g.closePath();
      g.fill();
      g.strokeStyle = "rgba(25,45,45,0.5)";
      g.lineWidth = Math.max(0.6, 0.9 * zs);
      g.stroke();
      if (zs <= 0.6) return;
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.beginPath();
      g.ellipse(x - r * 0.35, cy - r * 0.4, r * 0.38, r * 0.24, -0.5, 0, Math.PI * 2);
      g.fill();
      const ey = cy - r * 0.05;
      if (variant.endsWith("z")) {
        g.strokeStyle = "#1e2b2b";
        g.lineWidth = 0.8 * zs;
        for (const dx of [-1.4, 1.4]) {
          g.beginPath();
          g.moveTo(x + (dx - 0.8) * zs, ey);
          g.lineTo(x + (dx + 0.8) * zs, ey);
          g.stroke();
        }
      } else {
        for (const dx of [-1.5, 1.5]) {
          g.fillStyle = "#fff";
          g.beginPath();
          g.arc(x + dx * zs, ey, 1.25 * zs, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#1e2b2b";
          g.beginPath();
          g.arc(x + dx * zs + 0.3 * zs, ey + 0.2 * zs, 0.65 * zs, 0, Math.PI * 2);
          g.fill();
        }
      }
    });
  }
  shadowSprite(z) {
    const { step, z: zs } = this.zoomStep(z);
    const r = 4.2 * zs;
    return this.sprite(`s|${step}`, r * 2.4, r, (g) => {
      g.fillStyle = "rgba(15,35,25,0.28)";
      g.beginPath();
      g.ellipse(r * 1.2, r * 0.5, r * 1.05, r * 0.42, 0, 0, Math.PI * 2);
      g.fill();
    });
  }

  /** Every Amoeboid's ground shadow in a single fill. */
  drawShadows(ctx) {
    const z = this.camera.zoom;
    const r = 4.2 * z;
    ctx.fillStyle = "rgba(15,35,25,0.28)";
    ctx.beginPath();
    for (const sh of this.shadows) {
      ctx.moveTo(sh.x + r * 1.05, sh.y);
      ctx.ellipse(sh.x, sh.y, r * 1.05 * sh.k, r * 0.42 * sh.k, 0, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  drawAmoeboid(ctx, x, y, groundY, z, color, o) {
    const t = this.reduced ? 0 : this.time / 1000;
    const r = 4.2 * z;
    const wob = this.reduced
      ? 0
      : Math.sin(t * (o.walking ? 12 : 2.4) + o.id) * (o.walking ? 0.12 : 0.05);
    ctx.globalAlpha = o.alpha;
    if (o.selected) {
      ctx.strokeStyle = "#fffbe6";
      ctx.lineWidth = 2 * z;
      ctx.beginPath();
      ctx.ellipse(x, groundY, r * 1.9, r * 0.85, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const cy = y - r * 0.95;
    const base = o.weak ? "weak" : "base";
    const eyes = o.asleep ? "z" : "";
    const draw = (variant, alpha) => {
      const sp = this.bodySprite(color, variant + eyes, z);
      const k = z / this.zoomStep(z).z;
      const w = sp.cssW * k * (1 + wob),
        h = sp.cssH * k * (1 - wob);
      ctx.globalAlpha = alpha;
      ctx.drawImage(sp, x - w / 2, cy - h / 2, w, h);
    };
    if (o.grey) {
      draw(base, o.alpha * (1 - clamp(o.grey)));
      draw("grey", o.alpha * clamp(o.grey));
    } else draw(base, o.alpha);
    ctx.globalAlpha = o.alpha;
    // Role marks: a crown for officers, a violet pennant for representatives.
    if (o.officer) {
      const top = cy - r - 1.5 * z;
      ctx.fillStyle = "#f4cf54";
      ctx.strokeStyle = "rgba(90,60,10,0.6)";
      ctx.lineWidth = 0.6 * z;
      ctx.beginPath();
      ctx.moveTo(x - 3 * z, top);
      ctx.lineTo(x - 3 * z, top - 3 * z);
      ctx.lineTo(x - 1.5 * z, top - 1.6 * z);
      ctx.lineTo(x, top - 3.6 * z);
      ctx.lineTo(x + 1.5 * z, top - 1.6 * z);
      ctx.lineTo(x + 3 * z, top - 3 * z);
      ctx.lineTo(x + 3 * z, top);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    if (o.representative) {
      const px = x + r * 0.9,
        py = cy - r * 0.6;
      ctx.strokeStyle = "#5b4a7a";
      ctx.lineWidth = 0.8 * z;
      ctx.beginPath();
      ctx.moveTo(px, py + 3 * z);
      ctx.lineTo(px, py - 6 * z);
      ctx.stroke();
      ctx.fillStyle = "#c9a8ff";
      ctx.beginPath();
      ctx.moveTo(px, py - 6 * z);
      ctx.lineTo(px + 5 * z, py - 4.5 * z);
      ctx.lineTo(px, py - 3 * z);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  drawCarrotProp(ctx, x, y, z) {
    ctx.fillStyle = C.carrot;
    ctx.beginPath();
    ctx.moveTo(x - 2.4 * z, y);
    ctx.lineTo(x + 2.4 * z, y);
    ctx.lineTo(x, y + 6 * z);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.leafLight;
    ctx.lineWidth = 1.1 * z;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 1.5 * z, y - 3 * z);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 1.5 * z, y - 3 * z);
    ctx.stroke();
  }
  drawBubble(ctx, x, y, z, kind, grow = 1) {
    const r = 4.6 * z * grow;
    if (r <= 0.2) return;
    const fill =
      { yes: "#58d69b", no: "#f2696e", abstain: "#9fb1ad", scroll: "#f6ecd2" }[kind] ||
      "#9fb1ad";
    ctx.fillStyle = fill;
    ctx.strokeStyle = "rgba(20,35,35,0.55)";
    ctx.lineWidth = 0.8 * z;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = kind === "scroll" ? "#8a6a3a" : "#13261f";
    ctx.lineWidth = 1.2 * z * grow;
    ctx.lineCap = "round";
    ctx.beginPath();
    if (kind === "yes") {
      ctx.moveTo(x - 2 * z, y);
      ctx.lineTo(x - 0.5 * z, y + 1.6 * z);
      ctx.lineTo(x + 2.2 * z, y - 1.6 * z);
    } else if (kind === "no") {
      ctx.moveTo(x - 1.7 * z, y - 1.7 * z);
      ctx.lineTo(x + 1.7 * z, y + 1.7 * z);
      ctx.moveTo(x + 1.7 * z, y - 1.7 * z);
      ctx.lineTo(x - 1.7 * z, y + 1.7 * z);
    } else if (kind === "scroll") {
      ctx.moveTo(x - 2 * z, y - 1.2 * z);
      ctx.lineTo(x + 2 * z, y - 1.2 * z);
      ctx.moveTo(x - 2 * z, y + 1.2 * z);
      ctx.lineTo(x + 1 * z, y + 1.2 * z);
    } else {
      ctx.moveTo(x - 1.8 * z, y);
      ctx.lineTo(x + 1.8 * z, y);
    }
    ctx.stroke();
  }
  drawCrumbs(ctx, x, y, z, m, id) {
    ctx.fillStyle = C.carrot;
    for (let i = 0; i < 3; i++) {
      const a = hash(id, 70 + i) * Math.PI * 2;
      const d = m * 6 * z;
      ctx.globalAlpha = 1 - m;
      ctx.fillRect(
        x + Math.cos(a) * d,
        y - 6 * z + Math.sin(a) * d * 0.6 - m * 3 * z,
        1.4 * z,
        1.4 * z,
      );
    }
    ctx.globalAlpha = 1;
  }
  drawThought(ctx, x, y, z, a) {
    ctx.globalAlpha = a;
    ctx.fillStyle = "#f4d35e";
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const rr = (i % 2 ? 1.1 : 2.6) * z;
      ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  drawWisp(ctx, x, y, z, m) {
    if (m <= 0 || m >= 1) return;
    ctx.globalAlpha = (1 - m) * 0.8;
    ctx.fillStyle = "#e9f0ff";
    ctx.beginPath();
    ctx.ellipse(
      x + Math.sin(m * 8) * 3 * z,
      y - 10 * z - m * 34 * z,
      3 * z,
      4 * z,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- effects
  drawParticles(ctx) {
    const p = this.progress;
    const z = this.camera.zoom;
    for (const q of this.plan.particles) {
      const k = span(p, q.t0, q.t1);
      if (k <= 0 || k >= 1) continue;
      const e = ease(k);
      const x = lerp(q.from[0], q.to[0], e),
        y = lerp(q.from[1], q.to[1], e);
      const [sx, sy] = this.project(x, y, 3 + Math.sin(Math.PI * k) * q.z);
      this.drawCarrotProp(ctx, sx, sy, z * 0.9);
    }
  }
  drawTexts(ctx) {
    const p = this.progress;
    const z = this.camera.zoom;
    if (z < 0.45) return;
    ctx.textAlign = "center";
    ctx.font = `700 ${Math.round(clamp(12 * z, 10, 20))}px "Bricolage Grotesque", "Instrument Sans", sans-serif`;
    for (const q of this.plan.texts) {
      const k = span(p, q.t0, q.t1);
      if (k <= 0 || (k >= 1 && p < 1)) continue;
      const a = p >= 1 ? 0 : k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
      if (a <= 0) continue;
      const [sx, sy] = this.project(q.x, q.y, q.z + k * 18);
      ctx.globalAlpha = a;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "rgba(20,30,30,0.7)";
      ctx.strokeText(q.text, sx, sy);
      ctx.fillStyle = q.color;
      ctx.fillText(q.text, sx, sy);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "start";
  }
  drawWeather(ctx) {
    const z = this.camera.zoom;
    const t = this.reduced ? 0 : this.time / 1000;
    for (const p of this.s.plots) {
      const r = this.layout.rects.get(p.id);
      if (!r) continue;
      if (p.weather === 0) {
        // Sun: warm shimmer.
        const [cx, cy] = this.project(r.x + r.side / 2, r.y + r.side / 2);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r.side * 14 * z);
        g.addColorStop(0, `rgba(255,236,170,${0.16 * (1 - this.nightAmount())})`);
        g.addColorStop(1, "rgba(255,236,170,0)");
        ctx.fillStyle = g;
        ctx.fillRect(
          cx - r.side * 14 * z,
          cy - r.side * 8 * z,
          r.side * 28 * z,
          r.side * 16 * z,
        );
      } else {
        // Clouds drift across; dark skies also rain.
        const count = p.weather === 1 ? 2 : 3;
        for (let i = 0; i < count; i++) {
          const drift = ((t * 0.08 + hash(p.id * 7 + i, 81)) % 1) * r.side;
          const cx = r.x + drift,
            cy = r.y + (0.2 + 0.3 * i) * r.side;
          const [gx, gy] = this.project(cx, cy, 3);
          ctx.fillStyle = `rgba(20,35,40,${p.weather === 2 ? 0.2 : 0.1})`;
          ctx.beginPath();
          ctx.ellipse(gx, gy, 34 * z, 13 * z, 0, 0, Math.PI * 2);
          ctx.fill();
          const [sx, sy] = this.project(cx, cy, 95);
          const col =
            p.weather === 2 ? "rgba(122,134,150,0.92)" : "rgba(246,248,250,0.9)";
          ctx.fillStyle = col;
          for (const [dx, dy, rr] of [
            [-14, 2, 11],
            [0, -4, 14],
            [15, 1, 10],
            [6, 5, 10],
          ]) {
            ctx.beginPath();
            ctx.arc(sx + dx * z, sy + dy * z, rr * z, 0, Math.PI * 2);
            ctx.fill();
          }
          if (p.weather === 2 && !this.reduced) {
            ctx.strokeStyle = "rgba(190,210,235,0.5)";
            ctx.lineWidth = 1 * z;
            ctx.beginPath();
            for (let k = 0; k < 9; k++) {
              const ox = (hash(k, i + p.id * 5) - 0.5) * 50 * z;
              const fall = ((t * 1.4 + hash(k, 90 + i)) % 1) * (gy - sy - 10);
              ctx.moveTo(sx + ox, sy + 10 * z + fall);
              ctx.lineTo(sx + ox - 2 * z, sy + 10 * z + fall + 7 * z);
            }
            ctx.stroke();
          }
        }
        if (p.weather === 2) {
          this.poly(ctx, this.quad(r.x, r.y, r.side, r.side, 3), "rgba(30,40,70,0.16)");
        }
      }
    }
  }
  nightAmount() {
    const to = this.s?.phase;
    const from = this.prev?.phase;
    const val = (ph) => ({ eating: 0.45, close: 1, environment: 0.15 })[ph] || 0;
    const k = ease(span(this.progress, 0, 0.4));
    return lerp(val(from), val(to), from ? k : 1);
  }
  drawLight(ctx) {
    const k = ease(span(this.progress, 0, 0.45));
    const [ca, sa] = this.lightFrom;
    const [cb, sb] = this.lightTo;
    const strength = lerp(sa, sb, k);
    if (strength <= 0.005) return;
    const color = mix(ca, cb, k);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = strength;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  }
  drawGlows(ctx) {
    const night = this.nightAmount();
    if (this.glows?.length) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const g of this.glows) {
        const gr = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
        gr.addColorStop(0, `rgba(255,200,110,${g.a})`);
        gr.addColorStop(1, "rgba(255,200,110,0)");
        ctx.fillStyle = gr;
        ctx.fillRect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
      }
      ctx.restore();
    }
    this.glows = [];
    if (night > 0.6 && !this.reduced) {
      // Stars reflected on the water at night.
      ctx.fillStyle = `rgba(230,240,255,${(night - 0.6) * 1.6})`;
      for (let i = 0; i < 70; i++) {
        const tw = 0.5 + 0.5 * Math.sin(this.time / 600 + i * 3);
        ctx.globalAlpha = tw * (night - 0.6) * 2;
        ctx.fillRect(hash(i, 101) * this.w, hash(i, 102) * this.h, 1.5, 1.5);
      }
      ctx.globalAlpha = 1;
    }
  }
  drawSelection(ctx) {
    const id = this.selection.agent;
    if (id === null || id === undefined) return;
    const a = this.agentScreen.find((x) => x.id === id);
    if (!a) return;
    const z = this.camera.zoom;
    ctx.font = `600 ${Math.round(clamp(11 * z, 11, 15))}px "Instrument Sans", sans-serif`;
    const w = ctx.measureText(a.label).width + 14;
    const x = a.x - w / 2,
      y = a.y - 30 * z - 16;
    ctx.fillStyle = "rgba(14,30,34,0.92)";
    ctx.beginPath();
    ctx.roundRect(x, y, w, 20, 10);
    ctx.fill();
    ctx.fillStyle = "#eaf2ee";
    ctx.fillText(a.label, x + 7, y + 14);
  }
  drawMeteor(ctx) {
    const p = this.progress;
    if (this.reduced) return;
    const k = span(p, 0.05, 0.5);
    const [tx, ty] = this.project(this.layout.width / 2, this.layout.height / 2);
    if (k > 0 && k < 1) {
      const sx = lerp(this.w + 100, tx, k),
        sy = lerp(-100, ty, k);
      const g = ctx.createLinearGradient(sx, sy, sx + 160, sy - 160);
      g.addColorStop(0, "rgba(255,240,200,1)");
      g.addColorStop(1, "rgba(255,120,60,0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 160, sy - 160);
      ctx.stroke();
      ctx.fillStyle = "#fff6dc";
      ctx.beginPath();
      ctx.arc(sx, sy, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    const flash = span(p, 0.48, 0.56) * (1 - span(p, 0.56, 0.95));
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,248,230,${flash * 0.95})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }
}
