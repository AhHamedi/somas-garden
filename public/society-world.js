/* The world is an observer of the simulation. Geometry, decoration and motion
 * never feed decisions or consume the engine's random stream. */
const CELL = 194;
const DEFAULT_COLORS = ["#8ca956", "#66a9b1", "#cb934e", "#a497cb", "#c57d67", "#b3b75f"];
const LAND = ["#637647", "#667c4b", "#6c8050", "#607746", "#74834e", "#657b4e"];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const noise = (n) => {
  let x = Math.imul(n ^ 0x6d2b79f5, 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295;
};
const iso = (x, y, z = 0) => ({ x: x - y, y: (x + y) * 0.5 - z });
const mix = (hex, amount) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  return `rgb(${[v >> 16, (v >> 8) & 255, v & 255].map((n) => Math.round(clamp(n + amount, 0, 255))).join(",")})`;
};
const polygon = (ctx, points, fill, stroke, width = 1) => {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
};
const rect = (ctx, x, y, w, h, z, fill, stroke, width) =>
  polygon(
    ctx,
    [iso(x, y, z), iso(x + w, y, z), iso(x + w, y + h, z), iso(x, y + h, z)],
    fill,
    stroke,
    width,
  );
const line = (ctx, a, b, color, width = 1) => {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
};
const ellipse = (ctx, x, y, rx, ry, fill) => {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
};
const inside = (p, poly) => {
  let yes = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      yes = !yes;
  }
  return yes;
};

export class SocietyWorld {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.callbacks = callbacks;
    this.snapshot = null;
    this.selection = { plot: null, agent: null };
    this.cells = [];
    this.positions = new Map();
    this.previous = new Map();
    this.hitAgents = [];
    this.hitPlots = [];
    this.camera = { x: 0, y: 0, scale: 1 };
    this.width = 1;
    this.height = 1;
    this.baseScale = 1;
    this.frame = 0;
    this.motionUntil = 0;
    this.transitionStart = 0;
    this.hover = null;
    this.pointer = null;
    this.pointers = new Map();
    this.destroyed = false;
    this.moved = false;
    this.mq = matchMedia("(prefers-reduced-motion: reduce)");
    this.reduced = this.mq.matches;
    this.canvas.style.touchAction = "none";
    this.canvas.style.cursor = "grab";
    this.bound = {
      down: (e) => this.pointerDown(e),
      move: (e) => this.pointerMove(e),
      up: (e) => this.pointerUp(e),
      leave: () => this.clearHover(),
      wheel: (e) => this.wheel(e),
      motion: () => {
        this.reduced = this.mq.matches;
        this.invalidate();
      },
    };
    canvas.addEventListener("pointerdown", this.bound.down);
    canvas.addEventListener("pointermove", this.bound.move);
    canvas.addEventListener("pointerup", this.bound.up);
    canvas.addEventListener("pointercancel", this.bound.up);
    canvas.addEventListener("pointerleave", this.bound.leave);
    canvas.addEventListener("wheel", this.bound.wheel, { passive: false });
    this.mq.addEventListener?.("change", this.bound.motion);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, r.width),
      h = Math.max(1, r.height);
    const changed = Math.abs(w - this.width) > 1 || Math.abs(h - this.height) > 1;
    this.width = w;
    this.height = h;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    if (changed && this.cells.length) {
      this.fit();
      if (this.width <= 700 && this.selection.plot !== null)
        this.focus(this.selection.plot);
    } else this.invalidate();
  }
  update(snapshot, options = {}) {
    if (!snapshot) return;
    const old = this.snapshot,
      oldPlot = this.selection.plot;
    this.snapshot = snapshot;
    this.selection = { plot: options.plot ?? null, agent: options.agent ?? null };
    this.colors = options.colors || DEFAULT_COLORS;
    const signature = (snapshot.plots || [])
      .map((p) => `${p.id}:${p.capacity}`)
      .join("|");
    const changed = signature !== this.layoutSignature;
    if (changed) {
      this.layoutSignature = signature;
      this.layout();
    }
    for (const c of this.cells)
      c.plot = snapshot.plots.find((p) => p.id === c.id) || c.plot;
    this.previous = new Map(this.positions);
    this.placeAgents();
    this.transitionStart = performance.now();
    this.motionUntil = this.reduced ? 0 : this.transitionStart + 650;
    if (!old || changed) {
      this.fit();
      if (this.width <= 700) {
        if (this.selection.plot !== null) this.focus(this.selection.plot);
        else this.zoomAt(1.65, this.width * 0.5, this.height * 0.44);
      }
    } else if (this.selection.plot !== oldPlot) {
      if (this.selection.plot !== null) this.focus(this.selection.plot);
      else this.fit();
    }
    this.invalidate();
  }
  layout() {
    const plots = this.snapshot.plots || [],
      n = plots.length;
    this.cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.3)));
    this.rows = Math.ceil(n / this.cols);
    // A row is a land strip: width and height are apportioned so every
    // territory's ground area is exactly proportional to its field capacity.
    const mean = plots.reduce((sum, p) => sum + p.capacity, 0) / Math.max(1, n);
    const boardWidth = this.cols * CELL;
    this.cells = [];
    let y = 0;
    for (let row = 0; row < this.rows; row++) {
      const group = plots.slice(row * this.cols, (row + 1) * this.cols);
      const total = group.reduce((sum, p) => sum + p.capacity, 0);
      const h = ((total / mean) * CELL) / this.cols;
      let x = 0;
      group.forEach((plot, col) => {
        const w = (plot.capacity / total) * boardWidth;
        this.cells.push({ id: plot.id, col, row, x, y, w, h, plot });
        x += w;
      });
      y += h;
    }
    this.commons = {
      id: -1,
      col: -1,
      row: this.rows - 1,
      x: -120,
      y: y - 110,
      w: 120,
      h: 110,
    };
    const all = [...this.cells, this.commons];
    const points = all.flatMap((c) => [
      iso(c.x, c.y, 55),
      iso(c.x + c.w, c.y, 55),
      iso(c.x + c.w, c.y + c.h, -42),
      iso(c.x, c.y + c.h, -42),
    ]);
    this.bounds = {
      minX: Math.min(...points.map((p) => p.x)) - 25,
      maxX: Math.max(...points.map((p) => p.x)) + 25,
      minY: Math.min(...points.map((p) => p.y)) - 55,
      maxY: Math.max(...points.map((p) => p.y)) + 45,
    };
    this.terrain = document.createElement("canvas");
    const b = this.bounds;
    this.terrain.width = Math.ceil((b.maxX - b.minX) * 2);
    this.terrain.height = Math.ceil((b.maxY - b.minY) * 2);
    const t = this.terrain.getContext("2d");
    t.scale(2, 2);
    t.translate(-b.minX, -b.minY);
    this.drawTerrain(t);
  }
  fit() {
    if (!this.bounds) return;
    const b = this.bounds;
    const right =
      this.width > 920 && (this.selection.plot !== null || this.selection.agent !== null)
        ? 330
        : 0;
    const aw = this.width - right;
    const top = this.height < 500 ? 55 : 92,
      bottom = this.height < 500 ? 55 : 115;
    this.baseScale = Math.min(
      (aw - 70) / (b.maxX - b.minX),
      (this.height - top - bottom) / (b.maxY - b.minY),
    );
    this.baseScale = clamp(this.baseScale, 0.2, 1.65);
    this.camera.scale = this.baseScale;
    this.camera.x = aw / 2 - ((b.minX + b.maxX) / 2) * this.baseScale;
    this.camera.y =
      (top + this.height - bottom) / 2 - ((b.minY + b.maxY) / 2) * this.baseScale;
    this.invalidate();
  }
  focus(id) {
    const c = this.cells.find((p) => p.id === id);
    if (!c) return;
    const point = iso(c.x + c.w / 2, c.y + c.h / 2);
    const right = this.width > 920 ? 340 : 0;
    const scale = clamp(
      Math.max(this.camera.scale, this.baseScale * (this.width <= 700 ? 2.1 : 1.25)),
      this.baseScale,
      this.baseScale * 3,
    );
    this.camera.scale = scale;
    this.camera.x = (this.width - right) * 0.52 - point.x * scale;
    this.camera.y = this.height * (this.width <= 700 ? 0.25 : 0.47) - point.y * scale;
    this.invalidate();
  }
  zoom(delta) {
    this.zoomAt(Math.exp(delta * 0.18), this.width * 0.48, this.height * 0.48);
  }
  zoomAt(factor, x, y) {
    const old = this.camera.scale;
    const next = clamp(
      old * factor,
      this.baseScale * 0.65,
      Math.max(this.baseScale * 5, 2.5),
    );
    const p = this.toWorld(x, y);
    this.camera.scale = next;
    this.camera.x = x - p.x * next;
    this.camera.y = y - p.y * next;
    this.invalidate();
  }
  wheel(e) {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    this.zoomAt(
      Math.exp(-clamp(e.deltaY, -160, 160) * 0.002),
      e.clientX - r.left,
      e.clientY - r.top,
    );
  }
  toWorld(x, y) {
    return {
      x: (x - this.camera.x) / this.camera.scale,
      y: (y - this.camera.y) / this.camera.scale,
    };
  }
  color(team) {
    let c =
      typeof this.colors === "function"
        ? this.colors(team)
        : this.snapshot?.teams?.[team]?.color || this.colors[team % this.colors.length];
    return /^#[0-9a-f]{3,8}$/i.test(c || "")
      ? c
      : DEFAULT_COLORS[team % DEFAULT_COLORS.length];
  }
  placeAgents() {
    this.positions = new Map();
    const groups = new Map();
    for (const a of this.snapshot.agents || []) {
      if (!a.alive) continue;
      const p = Number.isInteger(a.plot) ? a.plot : -1;
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p).push(a);
    }
    for (const [id, agents] of groups) {
      const c = id < 0 ? this.commons : this.cells.find((p) => p.id === id);
      if (!c) continue;
      agents.sort((a, b) => a.id - b.id);
      const n = agents.length;
      const size = (n > 150 ? 3.1 : n > 90 ? 3.7 : 5.1) * (id < 0 ? 0.65 : 1);
      const grid = Math.ceil(Math.sqrt(n));
      agents.forEach((a, index) => {
        let u, v;
        if (id < 0) {
          u = 19 + (((index % grid) + 0.35 + noise(a.id + 121) * 0.25) * 150) / grid;
          v =
            24 +
            ((Math.floor(index / grid) + 0.3 + noise(a.id + 915) * 0.3) * 145) / grid;
        } else {
          // A deterministic stratified distribution keeps every resident visible.
          const shuffled = (index * coprime(n)) % n;
          u = 18 + (((shuffled % grid) + 0.3 + noise(a.id * 19 + 51) * 0.3) * 152) / grid;
          v =
            28 +
            ((Math.floor(shuffled / grid) + 0.3 + noise(a.id * 13 + 77) * 0.3) * 145) /
              grid;
          // Keep the council hall footprint clear without hiding any residents.
          if (c.plot.government && u > 123 && v > 119) {
            u -= 43;
          }
        }
        u = (u / CELL) * c.w;
        v = (v / CELL) * c.h;
        const p = iso(c.x + u, c.y + v, 2);
        this.positions.set(a.id, { ...p, u: c.x + u, v: c.y + v, size, agent: a });
      });
    }
  }
  pointerDown(e) {
    if (e.button !== 0 && e.pointerType !== "touch") return;
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const ps = [...this.pointers.values()];
      this.pinch = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      this.moved = true;
      return;
    }
    this.pointer = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      cx: this.camera.x,
      cy: this.camera.y,
    };
    this.moved = false;
    this.canvas.style.cursor = "grabbing";
  }
  pointerMove(e) {
    if (this.pointers.has(e.pointerId))
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const ps = [...this.pointers.values()];
      const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      if (this.pinch > 0) {
        const r = this.canvas.getBoundingClientRect();
        this.zoomAt(
          d / this.pinch,
          (ps[0].x + ps[1].x) / 2 - r.left,
          (ps[0].y + ps[1].y) / 2 - r.top,
        );
      }
      this.pinch = d;
      return;
    }
    if (this.pointer && this.pointer.id === e.pointerId) {
      const dx = e.clientX - this.pointer.x,
        dy = e.clientY - this.pointer.y;
      if (Math.hypot(dx, dy) > 5) this.moved = true;
      if (this.moved) {
        this.camera.x = this.pointer.cx + dx;
        this.camera.y = this.pointer.cy + dy;
        this.clearHover();
        this.invalidate();
      }
      return;
    }
    const r = this.canvas.getBoundingClientRect(),
      x = e.clientX - r.left,
      y = e.clientY - r.top;
    const hit = this.hit(x, y);
    const key = hit ? `${hit.agent ?? ""}/${hit.plot ?? ""}` : "";
    if (key !== this.hoverKey) {
      this.hoverKey = key;
      this.hover = hit;
      this.canvas.style.cursor = hit ? "pointer" : "grab";
      this.invalidate();
    }
    this.callbacks.onHover?.(hit ? { ...hit, x: e.clientX, y: e.clientY } : null);
  }
  pointerUp(e) {
    const wasMulti = this.pointers.size > 1;
    this.pointers.delete(e.pointerId);
    if (wasMulti) {
      this.pointer = null;
      this.pinch = 0;
      this.moved = true;
    }
    if (this.pointer?.id === e.pointerId) {
      if (!this.moved && e.type !== "pointercancel") {
        const r = this.canvas.getBoundingClientRect();
        const hit = this.hit(e.clientX - r.left, e.clientY - r.top);
        if (hit?.agent !== undefined) this.callbacks.onSelectAgent?.(hit.agent);
        else if (hit?.plot !== undefined && hit.plot >= 0)
          this.callbacks.onSelectPlot?.(hit.plot);
        else this.callbacks.onClear?.();
      }
      this.pointer = null;
    }
    this.canvas.style.cursor = "grab";
  }
  clearHover() {
    if (this.hover) {
      this.hover = null;
      this.hoverKey = "";
      this.callbacks.onHover?.(null);
      this.invalidate();
    }
  }
  hit(x, y) {
    const p = this.toWorld(x, y);
    for (let i = this.hitAgents.length - 1; i >= 0; i--) {
      const a = this.hitAgents[i];
      if (Math.hypot(p.x - a.x, (p.y - a.y) * 1.1) < Math.max(a.r, 5 / this.camera.scale))
        return { agent: a.id, plot: a.plot, label: a.label };
    }
    for (let i = this.hitPlots.length - 1; i >= 0; i--) {
      const c = this.hitPlots[i];
      if (inside(p, c.points)) return { plot: c.id, label: c.label };
    }
    return null;
  }
  invalidate() {
    if (!this.frame && !this.destroyed)
      this.frame = requestAnimationFrame((t) => {
        this.frame = 0;
        this.draw(t);
        if (t < this.motionUntil && !this.reduced) this.invalidate();
      });
  }
  draw(time = performance.now()) {
    if (this.destroyed) return;
    const ctx = this.ctx,
      d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    const bg = ctx.createRadialGradient(
      this.width * 0.45,
      this.height * 0.42,
      20,
      this.width * 0.5,
      this.height * 0.5,
      Math.max(this.width, this.height) * 0.7,
    );
    bg.addColorStop(0, "#36594f");
    bg.addColorStop(0.5, "#24473f");
    bg.addColorStop(1, "#102e2d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);
    // The water is deliberately still when nothing in the world is changing.
    ctx.lineCap = "round";
    for (let i = 0; i < 160; i++) {
      const x = noise(i * 31 + 5) * this.width,
        y = noise(i * 71 + 13) * this.height;
      line(
        ctx,
        { x, y },
        { x: x + 6 + noise(i * 9) * 19, y: y - 2 },
        i % 3 === 0 ? "#42625833" : "#6b82741b",
        1,
      );
    }
    if (!this.snapshot) {
      this.empty(ctx);
      return;
    }
    ctx.save();
    ctx.translate(this.camera.x, this.camera.y);
    ctx.scale(this.camera.scale, this.camera.scale);
    const b = this.bounds;
    ctx.drawImage(
      this.terrain,
      0,
      0,
      this.terrain.width,
      this.terrain.height,
      b.minX,
      b.minY,
      b.maxX - b.minX,
      b.maxY - b.minY,
    );
    this.hitPlots = [];
    const ordered = [...this.cells].sort((a, b) => a.x + a.y - b.x - b.y || a.x - b.x);
    for (const c of ordered) {
      c.plot = this.snapshot.plots.find((p) => p.id === c.id) || c.plot;
      this.drawDistrict(ctx, c);
    }
    this.drawCommons(ctx);
    const objects = [];
    for (const c of ordered) {
      if (c.plot.government)
        objects.push({
          depth: c.x + c.y + c.w * 0.77 + c.h * 0.77,
          draw: () => this.hall(ctx, c),
        });
    }
    const t = this.reduced ? 1 : clamp((time - this.transitionStart) / 480, 0, 1),
      ease = 1 - Math.pow(1 - t, 3);
    this.hitAgents = [];
    for (const [id, a] of this.positions) {
      const before = this.previous.get(id);
      const p = before
        ? {
            ...a,
            x: before.x + (a.x - before.x) * ease,
            y: before.y + (a.y - before.y) * ease,
          }
        : a;
      objects.push({ depth: p.u + p.v, draw: () => this.creature(ctx, p, time) });
    }
    objects.sort((a, b) => a.depth - b.depth);
    for (const o of objects) o.draw();
    for (const c of ordered) this.label(ctx, c);
    this.effects(ctx, time);
    ctx.restore();
    // Gentle lens vignette gives the board depth without obscuring any controls.
    const shade = ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.48,
      this.height * 0.3,
      this.width * 0.5,
      this.height * 0.5,
      Math.max(this.width, this.height) * 0.8,
    );
    shade.addColorStop(0, "#031b1a00");
    shade.addColorStop(1, "#031b1a70");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, this.width, this.height);
  }
  empty(ctx) {
    ctx.fillStyle = "#b8c8ac";
    ctx.textAlign = "center";
    ctx.font = "500 15px system-ui";
    ctx.fillText("Preparing the world…", this.width / 2, this.height / 2);
  }
  drawTerrain(ctx) {
    const cells = [...this.cells, this.commons];
    ctx.save();
    ctx.shadowColor = "#051e1cc0";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 25;
    for (const c of cells) rect(ctx, c.x - 3, c.y - 3, c.w + 6, c.h + 6, -24, "#142d26");
    ctx.restore();
    const ordered = cells.sort((a, b) => a.x + a.y - b.x - b.y);
    for (const c of ordered) {
      const { x, y, w, h } = c;
      const rowCells = this.cells.filter((q) => q.row === c.row);
      if (c.id >= 0 && c.col === rowCells.length - 1)
        this.cliff(ctx, x + w, y, x + w, y + h, c.col * 37 + c.row);
      if (c.row === this.rows - 1 || c.id === -1)
        this.cliff(ctx, x, y + h, x + w, y + h, c.col * 13 + c.row + 93);
      const poly =
        c.id < 0
          ? [
              iso(x + 20, y),
              iso(x + w, y),
              iso(x + w, y + h),
              iso(x + 17, y + h),
              iso(x, y + h - 22),
              iso(x + 4, y + 24),
            ]
          : [iso(x, y), iso(x + w, y), iso(x + w, y + h), iso(x, y + h)];
      polygon(ctx, poly, LAND[Math.abs(c.id) % LAND.length]);
      ctx.save();
      polygon(ctx, poly);
      ctx.clip();
      for (let i = 0; i < Math.round((w * h) / 85); i++) {
        const u = x + noise(i * 19 + c.id * 379 + 991) * w,
          v = y + noise(i * 53 + c.id * 197 + 227) * h,
          p = iso(u, v);
        const palette = ["#94a26655", "#3f593e55", "#b9ba7440", "#50663c60"];
        ctx.fillStyle = palette[i % 4];
        ctx.fillRect(p.x, p.y, 1.5 + noise(i + 2) * 2.3, 0.8);
        if (i % 19 === 0) {
          line(ctx, { x: p.x, y: p.y }, { x: p.x - 1, y: p.y - 3 }, "#a9ad6a66", 0.8);
          line(ctx, { x: p.x, y: p.y }, { x: p.x + 2, y: p.y - 2 }, "#354f3877", 0.8);
        }
      }
      ctx.restore();
      if (c.id < 0) {
        for (const [u, v] of [
          [0.16, 0.14],
          [0.14, 0.36],
          [0.14, 0.63],
          [0.2, 0.83],
          [0.42, 0.92],
          [0.76, 0.94],
        ]) {
          const q = iso(x + w * u, y + h * v);
          this.rock(ctx, q.x, q.y, 5 + noise(u * 10) * 3, 0.7);
          this.shrub(ctx, q.x + 5, q.y - 3, 5);
        }
        rect(ctx, x + w - 9, y + 9, 9, h - 18, 1, "#a39360");
        continue;
      }
      rect(ctx, x, y, 10, h, 1, "#a39360");
      rect(ctx, x, y, w, 10, 1, "#ad9b67");
      rect(ctx, x + 10, y + 10, 2, h - 10, 1, "#42573955");
      rect(ctx, x + 10, y + 10, w - 10, 2, 1, "#42573955");
      if (c.col === rowCells.length - 1) rect(ctx, x + w - 8, y, 8, h, 1, "#9a9060");
      if (c.row === this.rows - 1) rect(ctx, x, y + h - 8, w, 8, 1, "#9a9060");
      for (let i = 0; i < 17; i++) {
        const k = (12 + i * 10.6) / CELL;
        const p = iso(x + 5, y + k * h, 1);
        ellipse(ctx, p.x, p.y, 2.4, 1.1, "#c8bc8c55");
        const q = iso(x + k * w, y + 4, 1);
        ellipse(ctx, q.x, q.y, 2, 1, "#7f78565e");
      }
      for (const [u, v] of [
        [15, 16],
        [178, 17],
        [18, 178],
        [178, 179],
      ]) {
        const p = iso(x + (u / CELL) * w, y + (v / CELL) * h);
        this.rock(ctx, p.x, p.y, 3.5, noise(u * 5 + v + c.id));
      }
      if (c.row === this.rows - 1) {
        for (let i = 0; i < 7; i++) {
          const q = iso(x + (w * (i + 0.5)) / 7, y + h + 3);
          this.rock(ctx, q.x, q.y + 12, 3 + noise(i + c.id * 13) * 4, 0.7);
        }
      }
      if (c.row === 0) {
        for (let i = 0; i < 4; i++) {
          const p = iso(x + w * (0.12 + i * 0.23), y + 15);
          this.shrub(ctx, p.x, p.y, 6 + noise(i + c.id) * 3);
        }
      }
      if (c.col === 0 && c.row < this.rows - 1) {
        for (let i = 0; i < 3; i++) {
          const p = iso(x + 13, y + h * (0.18 + i * 0.28));
          this.tree(ctx, p.x, p.y, 13 + noise(i + c.id) * 5);
        }
      }
    }
  }
  cliff(ctx, x1, y1, x2, y2, seed) {
    const a = iso(x1, y1),
      b = iso(x2, y2),
      ad = { x: a.x, y: a.y + 29 },
      bd = { x: b.x, y: b.y + 29 };
    polygon(ctx, [a, b, bd, ad], x2 === x1 ? "#65634a" : "#4e5640");
    const n = 14;
    for (let i = 0; i < n; i++) {
      const t = i / n,
        u = (i + 1) / n;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        q = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      const depth = 22 + noise(i * 17 + seed) * 13;
      polygon(
        ctx,
        [
          p,
          q,
          { x: q.x + noise(i + 42) * 3, y: q.y + depth },
          { x: p.x - 2, y: p.y + depth + 2 },
        ],
        i % 3 === 0 ? "#77745a" : i % 3 === 1 ? "#5b624a" : "#4d5742",
        "#3c4d3a55",
        0.5,
      );
      line(ctx, { x: p.x + 1, y: p.y + 8 }, { x: q.x - 1, y: q.y + 9 }, "#a3996f40", 1);
    }
    line(ctx, a, b, "#afac7466", 2);
    line(ctx, { x: ad.x, y: ad.y + 5 }, { x: bd.x, y: bd.y + 5 }, "#88a69735", 3);
    line(ctx, { x: ad.x, y: ad.y + 11 }, { x: bd.x, y: bd.y + 11 }, "#547a6b50", 2);
  }
  drawDistrict(ctx, c) {
    const p = c.plot,
      { x, y, w, h } = c;
    const corners = [
      iso(x + 12, y + 12, 1),
      iso(x + w - 12, y + 12, 1),
      iso(x + w - 12, y + h - 12, 1),
      iso(x + 12, y + h - 12, 1),
    ];
    this.hitPlots.push({
      id: p.id,
      points: [iso(x, y), iso(x + w, y), iso(x + w, y + h), iso(x, y + h)],
      label: `${p.name || `Plot ${p.id + 1}`} · ${p.stock} carrots · ${(p.residents || []).length} residents`,
    });
    const selected = this.selection.plot === p.id,
      hovered = this.hover?.plot === p.id,
      border = p.federation >= 0 ? "#c9ae65" : LAND[(p.id + 2) % LAND.length];
    polygon(
      ctx,
      corners,
      null,
      selected ? "#f3d68b" : hovered ? "#d4cf8b" : border,
      selected ? 2.8 : hovered ? 1.8 : 1,
    );
    if (selected) {
      ctx.save();
      ctx.shadowColor = "#f6d17b70";
      ctx.shadowBlur = 9;
      polygon(ctx, corners, null, "#ffe3a257", 1);
      ctx.restore();
    }
    const fx = x + w * 0.15,
      fy = y + h * 0.175,
      fw = w * 0.63,
      fh = h * 0.578;
    rect(ctx, fx, fy, fw, fh, 1, "#514c31", "#9d8d5366", 0.7);
    const rows = Math.max(6, Math.round(fh / 8)),
      cols = Math.max(8, Math.round(fw / 8));
    for (let row = 0; row < rows; row++) {
      rect(ctx, fx + 2, fy + 3 + (row * fh) / rows, fw - 4, 2.8, 1, "#3b3d2b");
      line(
        ctx,
        iso(fx + 2, fy + 6 + (row * fh) / rows, 1),
        iso(fx + fw - 2, fy + 6 + (row * fh) / rows, 1),
        "#7c704044",
        0.8,
      );
    }
    const count = cols * rows,
      grown = Math.round(count * clamp(p.stock / Math.max(1, p.capacity), 0, 1)),
      mult = coprime(count);
    for (let i = 0; i < grown; i++) {
      const slot = (i * mult) % count,
        row = Math.floor(slot / cols),
        col = slot % cols,
        q = iso(fx + 4 + (col * (fw - 8)) / cols, fy + 5 + (row * (fh - 5)) / rows, 1);
      this.carrot(ctx, q.x, q.y, 1 + noise(i + p.id * 41) * 0.2);
    }
    const weather = iso(x + w * 0.84, y + 23, 25);
    if (p.weather === 1) {
      polygon(ctx, corners, "#29484417");
      this.cloud(ctx, weather.x, weather.y, 0.65, "#c1c9ba");
    } else if (p.weather === 2) {
      polygon(ctx, corners, "#17384330");
      this.cloud(ctx, weather.x, weather.y, 0.68, "#81978f");
      ellipse(ctx, weather.x + 13, weather.y - 13, 3, 3, "#cfcea0");
    } else {
      ctx.save();
      ctx.shadowColor = "#d7bb6260";
      ctx.shadowBlur = 15;
      ellipse(ctx, weather.x, weather.y + 5, 5, 5, "#e6c574");
      ctx.restore();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        line(
          ctx,
          { x: weather.x + Math.cos(a) * 8, y: weather.y + 5 + Math.sin(a) * 8 },
          { x: weather.x + Math.cos(a) * 10, y: weather.y + 5 + Math.sin(a) * 10 },
          "#d3b968aa",
          1,
        );
      }
    }
    if (!p.government) {
      const q = iso(x + w * 0.77, y + h * 0.81, 1);
      ellipse(ctx, q.x, q.y, 10, 4, "#48513c99");
      for (let i = 0; i < 5; i++)
        this.rock(
          ctx,
          q.x + Math.cos(i * 1.25) * 7,
          q.y + Math.sin(i * 1.25) * 3,
          2,
          0.4,
        );
    }
  }
  drawCommons(ctx) {
    const c = this.commons;
    if (!c) return;
    const q = iso(c.x + c.w * 0.5, c.y + c.h * 0.58);
    ellipse(ctx, q.x, q.y, 35, 16, "#a2925b20");
    const sign = iso(c.x + c.w * 0.4, c.y + 18, 6);
    ctx.font = "600 10px system-ui";
    ctx.letterSpacing = ".8px";
    ctx.textAlign = "center";
    ctx.fillStyle = "#e0d8ae";
    ctx.fillText("Outside", sign.x, sign.y);
    ctx.letterSpacing = "0px";
  }
  carrot(ctx, x, y, s) {
    ellipse(ctx, x, y + 1, 2 * s, 0.8 * s, "#27352760");
    polygon(
      ctx,
      [
        { x: x - 1.3 * s, y: y - 0.8 * s },
        { x: x + 1.2 * s, y: y - 0.7 * s },
        { x: x + 0.2 * s, y: y + 2.2 * s },
      ],
      "#d99348",
    );
    line(
      ctx,
      { x, y: y - 0.5 * s },
      { x: x - 2 * s, y: y - 3.8 * s },
      "#a8b765",
      1.3 * s,
    );
    line(
      ctx,
      { x, y: y - 1 * s },
      { x: x + 0.4 * s, y: y - 4.5 * s },
      "#7f9c4b",
      1.4 * s,
    );
    line(
      ctx,
      { x, y: y - 1 * s },
      { x: x + 2.4 * s, y: y - 3.2 * s },
      "#b1bc6c",
      1.1 * s,
    );
  }
  rock(ctx, x, y, s, n) {
    ellipse(ctx, x + 1, y + 1, s + 1, s * 0.45, "#243c2d44");
    polygon(
      ctx,
      [
        { x: x - s, y },
        { x: x - s * 0.5, y: y - s * 0.7 },
        { x: x + s * 0.45, y: y - s },
        { x: x + s, y: y - s * 0.2 },
        { x: x + s * 0.6, y: y + s * 0.3 },
      ],
      n > 0.5 ? "#999b76" : "#7f876b",
    );
    line(
      ctx,
      { x: x - s * 0.5, y: y - s * 0.7 },
      { x: x + s * 0.45, y: y - s },
      "#c0bd8a66",
      1,
    );
  }
  shrub(ctx, x, y, s) {
    ellipse(ctx, x + 2, y + 2, s, s * 0.4, "#24372d55");
    ellipse(ctx, x, y - s * 0.4, s * 0.7, s * 0.56, "#3c583d");
    ellipse(ctx, x - 3, y - s * 0.6, s * 0.5, s * 0.48, "#647b47");
    ellipse(ctx, x + 2, y - s * 0.8, s * 0.45, s * 0.4, "#809052");
    for (let i = 0; i < 3; i++)
      ellipse(ctx, x - 4 + i * 4, y - s * 0.6, 1, 1, "#b7af6355");
  }
  tree(ctx, x, y, s) {
    ellipse(ctx, x + 6, y + 3, s * 0.8, s * 0.32, "#273a2b66");
    line(ctx, { x, y }, { x, y: y - s * 0.85 }, "#73694a", 3);
    polygon(
      ctx,
      [
        { x: x - s * 0.65, y: y - s * 0.4 },
        { x, y: y - s * 1.9 },
        { x: x + s * 0.75, y: y - s * 0.45 },
      ],
      "#405b3c",
    );
    polygon(
      ctx,
      [
        { x: x - s * 0.65, y: y - s * 0.4 },
        { x, y: y - s * 1.9 },
        { x: x + 0.1 * s, y: y - s * 0.5 },
      ],
      "#69804b",
    );
    polygon(
      ctx,
      [
        { x: x - s * 0.5, y: y - s * 0.9 },
        { x, y: y - s * 2.1 },
        { x: x + s * 0.5, y: y - s * 0.9 },
      ],
      "#829255",
    );
  }
  cloud(ctx, x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ellipse(ctx, 0, 3, 18, 4, "#28463a33");
    ellipse(ctx, -8, 0, 7, 5, color);
    ellipse(ctx, 0, -4, 9, 7, color);
    ellipse(ctx, 9, 0, 7, 5, color);
    ctx.restore();
  }
  hall(ctx, c) {
    const x = c.x + Math.min(c.w * 0.68, c.w - 45),
      y = c.y + Math.min(c.h * 0.675, c.h - 38),
      w = 31,
      d = 27,
      z = 19,
      p = c.plot;
    rect(ctx, x - 3, y - 3, w + 10, d + 10, 1, "#a19261", "#4e593e", 0.8);
    rect(ctx, x + 3, y + 9, w + 12, d + 7, 1, "#283c2c44");
    polygon(
      ctx,
      [iso(x, y + d), iso(x + w, y + d), iso(x + w, y + d, z), iso(x, y + d, z)],
      "#a88653",
      "#514a33",
      0.6,
    );
    polygon(
      ctx,
      [iso(x + w, y), iso(x + w, y + d), iso(x + w, y + d, z), iso(x + w, y, z)],
      "#78623f",
      "#514a33",
      0.6,
    );
    for (let i = 1; i < 5; i++) {
      line(ctx, iso(x, y + d, i * 3.6), iso(x + w, y + d, i * 3.6), "#63573c70", 0.7);
      line(ctx, iso(x + w, y, i * 3.6), iso(x + w, y + d, i * 3.6), "#4c493570", 0.7);
    }
    const ridgeA = iso(x - 3, y + d / 2, 33),
      ridgeB = iso(x + w + 3, y + d / 2, 33);
    polygon(
      ctx,
      [iso(x - 4, y - 3, z), iso(x + w + 4, y - 3, z), ridgeB, ridgeA],
      "#716044",
      "#403e30",
      1,
    );
    polygon(
      ctx,
      [ridgeA, ridgeB, iso(x + w + 4, y + d + 3, z), iso(x - 4, y + d + 3, z)],
      "#9f7b45",
      "#51462f",
      1,
    );
    for (let i = 0; i < 8; i++)
      line(
        ctx,
        iso(x + i * 4.4, y + d / 2, 32),
        iso(x + i * 4.4, y + d + 3, z),
        "#bc98554d",
        1,
      );
    line(ctx, ridgeA, ridgeB, "#d0ac67", 1.2);
    const door = [
      iso(x + 12, y + d + 0.1),
      iso(x + 20, y + d + 0.1),
      iso(x + 20, y + d + 0.1, 12),
      iso(x + 12, y + d + 0.1, 12),
    ];
    polygon(ctx, door, "#3c4430", "#c9a66b", 0.8);
    polygon(
      ctx,
      [
        iso(x + 3, y + d + 0.3, 8),
        iso(x + 8, y + d + 0.3, 8),
        iso(x + 8, y + d + 0.3, 13),
        iso(x + 3, y + d + 0.3, 13),
      ],
      "#d4bf76",
      "#655234",
      0.7,
    );
    const pole = iso(x + w + 6, y + 4, 1);
    line(ctx, pole, { x: pole.x, y: pole.y - 39 }, "#bdab76", 1.5);
    polygon(
      ctx,
      [
        { x: pole.x + 1, y: pole.y - 38 },
        { x: pole.x + 13, y: pole.y - 34 },
        { x: pole.x + 11, y: pole.y - 25 },
        { x: pole.x + 1, y: pole.y - 29 },
      ],
      p.federation >= 0 ? "#d5b868" : "#d3d1ac",
      "#544f35",
      0.6,
    );
    ellipse(
      ctx,
      pole.x + 5,
      pole.y - 32,
      1.6,
      1.6,
      p.federation >= 0 ? "#486a56" : "#6a8158",
    );
    const crates = Math.min(
      9,
      Math.ceil(((p.reserve || 0) / Math.max(1, p.reserveCapacity)) * 9),
    );
    for (let i = 0; i < crates; i++) {
      const u = x - 10 - (i % 3) * 7,
        v = y + d - 7 - Math.floor(i / 3) * 7;
      rect(ctx, u, v, 6, 6, 5, "#b18e4f", "#5b5538", 0.7);
      polygon(
        ctx,
        [iso(u, v + 6), iso(u + 6, v + 6), iso(u + 6, v + 6, 5), iso(u, v + 6, 5)],
        "#8c703d",
      );
    }
  }
  creature(ctx, p, time) {
    const a = p.agent,
      r = p.size,
      color = this.color(a.team),
      selected = this.selection.agent === a.id,
      hovered = this.hover?.agent === a.id;
    const x = p.x,
      y = p.y;
    ellipse(ctx, x + 1.6, y + 1.7, r * 1.13, r * 0.48, "#1c332c70");
    if (selected || hovered) {
      ctx.beginPath();
      ctx.ellipse(x, y + 1, r + 4, (r + 4) * 0.5, 0, 0, Math.PI * 2);
      ctx.strokeStyle = selected ? "#ffe3a0" : "#dfd8b1";
      ctx.lineWidth = selected ? 1.8 : 1;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x - r * 0.88, y);
    ctx.bezierCurveTo(
      x - r * 1.08,
      y - r * 0.9,
      x - r * 0.62,
      y - r * 1.75,
      x + 0.2 * r,
      y - r * 1.75,
    );
    ctx.bezierCurveTo(
      x + r * 0.94,
      y - r * 1.73,
      x + r * 1.07,
      y - r * 0.77,
      x + r * 0.83,
      y - 0.1 * r,
    );
    ctx.bezierCurveTo(
      x + r * 0.4,
      y + r * 0.4,
      x - r * 0.37,
      y + r * 0.4,
      x - r * 0.88,
      y,
    );
    ctx.closePath();
    ctx.fillStyle = mix(color, -13);
    ctx.fill();
    ctx.strokeStyle = "#233b2c88";
    ctx.lineWidth = 0.65;
    ctx.stroke();
    ellipse(ctx, x - r * 0.2, y - r * 0.95, r * 0.63, r * 0.66, color);
    ellipse(ctx, x - r * 0.37, y - r * 1.27, r * 0.22, r * 0.13, "#ffffff3b");
    // Eyes remain crisp at normal zoom; every visible creature is one actual agent.
    if (r * this.camera.scale > 2.2) {
      ellipse(ctx, x + r * 0.1, y - r * 0.91, 0.72, 0.98, "#f1ecd2");
      ellipse(ctx, x + r * 0.53, y - r * 0.92, 0.72, 0.98, "#f1ecd2");
      ellipse(ctx, x + r * 0.2, y - r * 0.86, 0.34, 0.52, "#243b2d");
      ellipse(ctx, x + r * 0.62, y - r * 0.87, 0.34, 0.52, "#243b2d");
    }
    if (a.food > 0 && r * this.camera.scale > 4) {
      const bx = x - r * 0.95,
        by = y - r * 0.2;
      ellipse(ctx, bx, by, 1.9, 1.6, "#bc8846");
      line(ctx, { x: bx, y: by - 1 }, { x: bx - 1, y: by - 3 }, "#a4b469", 1);
    }
    if (selected) {
      const head = y - r * 2.5;
      polygon(
        ctx,
        [
          { x: x - 3, y: head - 5 },
          { x: x + 3, y: head - 5 },
          { x, y: head },
        ],
        "#ffe3a0",
      );
    }
    this.hitAgents.push({
      id: a.id,
      plot: a.plot,
      x,
      y: y - r * 0.6,
      r: r + 1.3,
      label: `${a.name} · ${a.food} carrots · ${Number(a.mind || 0).toFixed(1)} mind`,
    });
  }
  label(ctx, c) {
    const p = c.plot,
      q = iso(c.x + c.w * 0.43, c.y + 16, 5);
    const selected = this.selection.plot === p.id;
    ctx.textAlign = "center";
    ctx.font = "700 10px 'Inter', system-ui, sans-serif";
    ctx.letterSpacing = "1.3px";
    ctx.shadowColor = "#203828";
    ctx.shadowBlur = 3;
    ctx.fillStyle = selected ? "#ffe4a0" : "#ece8cc";
    ctx.fillText(p.name || `Plot ${p.id + 1}`, q.x, q.y);
    ctx.shadowBlur = 0;
    ctx.letterSpacing = "0px";
  }
  effects(ctx, time) {
    if (this.reduced) return;
    const elapsed = time - this.transitionStart;
    if (elapsed > 650) return;
    const alpha = 1 - elapsed / 650;
    ctx.save();
    ctx.globalAlpha = alpha;
    const events = this.snapshot.events || [];
    let shown = 0;
    for (const e of events) {
      if (shown >= 18) break;
      if (!["harvest", "growth", "death", "move", "tax", "distribution"].includes(e.kind))
        continue;
      const p = this.positions.get(e.actor);
      if (!p) continue;
      if (e.kind === "harvest" && e.amount > 0 && shown % 3 === 0) {
        this.carrot(ctx, p.x + 7, p.y - 13 - elapsed * 0.018, 1.4);
      } else if (e.kind === "distribution") {
        ctx.fillStyle = "#e8d28e";
        ctx.font = "bold 10px system-ui";
        ctx.fillText(`+${e.amount}`, p.x, p.y - 17 - elapsed * 0.018);
      }
      shown++;
    }
    if (this.snapshot.meteor) {
      const b = this.bounds,
        cx = (b.minX + b.maxX) / 2,
        cy = (b.minY + b.maxY) / 2;
      const x = cx - 260 + elapsed * 0.6,
        y = cy - 300 + elapsed * 0.5;
      line(ctx, { x: x - 85, y: y - 75 }, { x, y }, "#ffd691", 5);
      ellipse(ctx, x, y, 6, 6, "#fff0bc");
    }
    ctx.restore();
  }
  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.bound.down);
    c.removeEventListener("pointermove", this.bound.move);
    c.removeEventListener("pointerup", this.bound.up);
    c.removeEventListener("pointercancel", this.bound.up);
    c.removeEventListener("pointerleave", this.bound.leave);
    c.removeEventListener("wheel", this.bound.wheel);
    this.mq.removeEventListener?.("change", this.bound.motion);
  }
}
function coprime(n) {
  if (n <= 1) return 1;
  let k = 17;
  const gcd = (a, b) => {
    while (b) {
      [a, b] = [b, a % b];
    }
    return a;
  };
  while (gcd(k, n) !== 1) k--;
  return k;
}
