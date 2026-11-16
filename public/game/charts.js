// SVG charts for the Results page. Each chart is a spec registered under an
// id; figures are drawn at their real width (so text stays 11–12px) and
// redrawn on resize. Hover and keyboard read-outs use one shared tooltip, and
// every chart can be swapped for a table of the same numbers.
import { esc, fmt } from "/game/model.js";

const specs = new Map();

export function niceTicks(min, max, count = 4) {
  if (!(max > min)) max = min + 1;
  const raw = (max - min) / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  const step = (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  const out = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.999; v += step)
    out.push(Number(v.toFixed(10)));
  return out;
}

export const compact = (v, digits = 1) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  const a = Math.abs(v);
  if (a >= 1e6) return `${fmt(v / 1e6, 1)}M`;
  if (a >= 1e4) return `${fmt(v / 1e3, a >= 1e5 ? 0 : 1)}K`;
  return fmt(v, a >= 100 ? 0 : digits);
};
export const pct = (v, digits = 0) =>
  v === null || v === undefined ? "–" : `${fmt(v * 100, digits)}%`;

/** Registers a chart and returns its placeholder. */
export function figure(id, spec) {
  specs.set(id, spec);
  const label = spec.label ? ` aria-label="${esc(spec.label)}"` : "";
  return `<figure class="viz viz-${spec.type}" data-viz="${id}" tabindex="${spec.type === "line" || spec.type === "strip" || spec.type === "timeline" ? 0 : -1}" role="img"${label} style="min-height:${spec.height || 200}px"></figure>`;
}

/** Draws every figure in root at its width, or as a table where chosen. */
export function drawFigures(root, tables = new Set()) {
  root.querySelectorAll("figure.viz").forEach((f) => {
    const id = f.dataset.viz;
    const spec = specs.get(id);
    const w = Math.round(f.clientWidth);
    if (!spec || !w) return;
    const asTable = tables.has(id);
    const key = `${w}:${asTable}`;
    if (f.__spec === spec && f.__key === key) return;
    f.__spec = spec;
    f.__key = key;
    f.innerHTML = asTable ? tableOf(spec) : RENDER[spec.type](spec, w);
    f.style.minHeight = asTable ? "0" : `${spec.height || 200}px`;
  });
}

// --- shared geometry -------------------------------------------------------

function yAxis(ticks, y, x0, x1, format) {
  return ticks
    .map(
      (t) =>
        `<line class="grid" x1="${x0}" x2="${x1}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="tick" x="${x0 - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${esc(format(t))}</text>`,
    )
    .join("");
}

const rowKey = (color) => `<i style="background:${color}"></i>`;

// --- line ---------------------------------------------------------------

function renderLine(spec, W) {
  const H = spec.height || 220;
  const fmtY = spec.format || ((v) => compact(v));
  const all = spec.series
    .flatMap((s) => s.values)
    .filter((v) => v !== null && v !== undefined);
  const lo = spec.yMin ?? Math.min(0, ...all);
  const hi = spec.yMax ?? Math.max(...all, lo + 1e-9);
  const ticks = niceTicks(lo, hi, spec.yTicks || 4);
  const top = ticks.at(-1),
    bottom = ticks[0];
  const padL = 12 + Math.max(...ticks.map((t) => fmtY(t).length)) * 7,
    padR = 14,
    padT = 10,
    padB = 26;
  const n = Math.max(...spec.series.map((s) => s.values.length));
  const x = (i) =>
    padL + (n <= 1 ? (W - padL - padR) / 2 : (i / (n - 1)) * (W - padL - padR));
  const y = (v) => padT + (1 - (v - bottom) / (top - bottom || 1)) * (H - padT - padB);
  const breaks = new Set(spec.breaks || []);
  // Contiguous runs of values; a break or a missing value starts a new run.
  const runs = (values) => {
    const out = [];
    let run = null;
    values.forEach((v, i) => {
      if (v === null || v === undefined || breaks.has(i)) run = null;
      if (v === null || v === undefined) return;
      if (!run) out.push((run = []));
      run.push([x(i), y(v)]);
    });
    return out;
  };
  const path = (values) =>
    runs(values)
      .map((r) =>
        r.map(([a, b], k) => `${k ? "L" : "M"}${a.toFixed(1)},${b.toFixed(1)}`).join(""),
      )
      .join("");
  const bands = (spec.bands || [])
    .map(
      (b) =>
        `<rect x="${x(b.from).toFixed(1)}" y="${padT}" width="${Math.max(1, x(b.to) - x(b.from)).toFixed(1)}" height="${H - padT - padB}" fill="${b.color}" opacity="${b.opacity ?? 0.12}"/>`,
    )
    .join("");
  const dividers = (spec.dividers || [])
    .map(([i, label]) => {
      const at = Math.max(padL, x(i - 0.5));
      return `${i > 0 ? `<line class="divider" x1="${at.toFixed(1)}" x2="${at.toFixed(1)}" y1="${padT}" y2="${H - padB}"/>` : ""}${label ? `<text class="tick" x="${(at + 5).toFixed(1)}" y="${H - 7}">${esc(label)}</text>` : ""}`;
    })
    .join("");
  const xt = (spec.xTicks || [])
    .map(
      ([i, label], k, arr) =>
        `<text class="tick" x="${x(i).toFixed(1)}" y="${H - 7}" text-anchor="${k === 0 && arr.length > 1 ? "start" : k === arr.length - 1 && arr.length > 1 ? "end" : "middle"}">${esc(label)}</text>`,
    )
    .join("");
  const lines = spec.series
    .map((s) => {
      const d = path(s.values);
      const base = y(Math.max(bottom, Math.min(0, top))).toFixed(1);
      const area =
        spec.area && spec.series.length === 1
          ? runs(s.values)
              .map(
                (r) =>
                  `<path d="M${r[0][0].toFixed(1)},${base}${r.map(([a, b]) => `L${a.toFixed(1)},${b.toFixed(1)}`).join("")}L${r.at(-1)[0].toFixed(1)},${base}Z" fill="${s.color}" opacity="0.1"/>`,
              )
              .join("")
          : "";
      return `${area}<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""} opacity="${s.muted ? 0.35 : 1}"/>`;
    })
    .join("");
  const ref = spec.reference
    ? `<path d="${path(spec.reference.values)}" fill="none" stroke="var(--ink-3)" stroke-width="1" opacity="0.7"/>`
    : "";
  spec._g = { x, y, n, padL, padR, padT, padB, W, H };
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bands}${yAxis(ticks, y, padL, W - padR, fmtY)}${dividers}${ref}${lines}${xt}<line class="xhair" y1="${padT}" y2="${H - padB}" visibility="hidden"/>${spec.series.map((s) => `<circle class="hdot" r="4" fill="${s.color}" visibility="hidden"/>`).join("")}</svg>`;
}

function lineTip(spec, i) {
  const rows = spec.series
    .map((s) => [s, s.values[i]])
    .filter(([, v]) => v !== null && v !== undefined)
    .sort((a, b) => b[1] - a[1]);
  const fmtV = spec.tipFormat || spec.format || ((v) => fmt(v, 2));
  return {
    title: spec.x?.[i] ?? String(i + 1),
    rows: rows.map(([s, v]) => ({ color: s.color, name: s.name, value: fmtV(v) })),
    extra: spec.tipExtra?.(i),
  };
}

function moveLine(f, spec, i) {
  const g = spec._g;
  if (!g) return;
  const svg = f.querySelector("svg");
  const xh = svg.querySelector(".xhair");
  const xi = g.x(i);
  xh.setAttribute("x1", xi);
  xh.setAttribute("x2", xi);
  xh.setAttribute("visibility", "visible");
  svg.querySelectorAll(".hdot").forEach((c, k) => {
    const v = spec.series[k].values[i];
    if (v === null || v === undefined) return c.setAttribute("visibility", "hidden");
    c.setAttribute("cx", xi);
    c.setAttribute("cy", g.y(v));
    c.setAttribute("visibility", "visible");
  });
}

// --- strip: one row per group, every value a dot, with quartiles ----------

function renderStrip(spec, W) {
  const rowH = 38,
    padT = 6,
    padB = 26,
    label = 118,
    right = 64;
  const H = padT + padB + spec.rows.length * rowH;
  spec.height = H;
  const all = spec.rows.flatMap((r) => r.values.map((v) => v.value));
  const ticks = niceTicks(Math.min(0, ...all), Math.max(...all, 1), 5);
  const x0 = label,
    x1 = W - right;
  const x = (v) => x0 + ((v - ticks[0]) / (ticks.at(-1) - ticks[0] || 1)) * (x1 - x0);
  const grid = ticks
    .map(
      (t) =>
        `<line class="grid" x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="${padT}" y2="${H - padB}"/><text class="tick" x="${x(t).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(compact(t))}</text>`,
    )
    .join("");
  const rows = spec.rows
    .map((r, k) => {
      const cy = padT + k * rowH + rowH / 2;
      const dots = r.values
        .map(
          (v) =>
            `<circle cx="${x(v.value).toFixed(1)}" cy="${(cy + v.jitter * 10).toFixed(1)}" r="2.6" fill="${r.color}" opacity="0.5"/>`,
        )
        .join("");
      const box =
        r.q1 === null
          ? ""
          : `<rect class="iqr" x="${x(r.q1).toFixed(1)}" y="${cy - 9}" width="${Math.max(2, x(r.q3) - x(r.q1)).toFixed(1)}" height="18" rx="4"/><line class="median" x1="${x(r.median).toFixed(1)}" x2="${x(r.median).toFixed(1)}" y1="${cy - 11}" y2="${cy + 11}"/><path class="meanmark" d="M${x(r.mean).toFixed(1)},${cy - 5}l5,5l-5,5l-5,-5z"/>`;
      return `<text class="rowlabel" x="0" y="${cy + 4}">${esc(r.label)}</text><circle cx="${label - 12}" cy="${cy}" r="4" fill="${r.color}"/>${dots}${box}<text class="rowvalue" x="${W}" y="${cy + 4}" text-anchor="end">${esc(r.display)}</text>`;
    })
    .join("");
  spec._g = { x, x0, x1, padT, rowH, label };
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${grid}${rows}<circle class="hring" r="5" visibility="hidden"/></svg>`;
}

function stripHit(spec, px, py) {
  const g = spec._g;
  const k = Math.floor((py - g.padT) / g.rowH);
  const r = spec.rows[k];
  if (!r || !r.values.length || px < g.label - 20) return null;
  // Values are sorted: binary search for the nearest along the axis.
  let lo = 0,
    hi = r.values.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (g.x(r.values[mid].value) < px) lo = mid + 1;
    else hi = mid;
  }
  let best = lo;
  if (
    lo > 0 &&
    Math.abs(g.x(r.values[lo - 1].value) - px) < Math.abs(g.x(r.values[lo].value) - px)
  )
    best = lo - 1;
  return { k, i: best };
}

// --- bars (horizontal), stacked or single -----------------------------------

function renderBars(spec, W) {
  const rowH = spec.rowHeight || 30,
    thick = Math.min(16, rowH - 12),
    label = spec.labelWidth || 118,
    right = spec.valueWidth || 70;
  const H = 4 + spec.rows.length * rowH + (spec.axis ? 22 : 0);
  spec.height = H;
  const totals = spec.rows.map((r) =>
    r.parts.reduce((t, p) => t + Math.max(0, p.value || 0), 0),
  );
  const max = spec.max ?? Math.max(...totals, 1e-9);
  const x0 = label,
    x1 = W - right;
  const sx = (v) => (v / max) * (x1 - x0);
  const rows = spec.rows
    .map((r, k) => {
      const cy = 2 + k * rowH + rowH / 2;
      let at = x0;
      const parts = r.parts
        .map((p, j) => {
          const w = sx(Math.max(0, p.value || 0));
          if (w <= 0) return "";
          const last =
            j === r.parts.length - 1 || r.parts.slice(j + 1).every((q) => !q.value);
          const gap = last ? 0 : 2;
          const seg = `<path data-tip="${esc(`${p.display ?? fmt(p.value, 1)}\n${r.label}: ${p.name}`)}" d="${barPath(at, cy - thick / 2, Math.max(1, w - gap), thick, last ? 4 : 0)}" fill="${p.color}"${p.opacity ? ` opacity="${p.opacity}"` : ""}/>`;
          at += w;
          return seg;
        })
        .join("");
      return `<text class="rowlabel" x="0" y="${cy + 4}">${esc(r.label)}</text>${r.color ? `<circle cx="${label - 12}" cy="${cy}" r="4" fill="${r.color}"/>` : ""}<rect class="track" x="${x0}" y="${cy - thick / 2}" width="${x1 - x0}" height="${thick}" rx="4"/>${parts}<text class="rowvalue" x="${W}" y="${cy + 4}" text-anchor="end">${esc(r.display ?? "")}</text>`;
    })
    .join("");
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${rows}</svg>`;
}

/** A bar square at the baseline with a rounded data end. */
function barPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  return `M${x.toFixed(1)},${y.toFixed(1)}h${(w - r).toFixed(1)}${r ? `a${r},${r} 0 0 1 ${r},${r}v${(h - 2 * r).toFixed(1)}a${r},${r} 0 0 1 -${r},${r}` : `v${h}`}h-${(w - r).toFixed(1)}z`;
}

// --- heatmap ---------------------------------------------------------------

function renderHeat(spec, W) {
  const label = spec.labelWidth || 118,
    head = 26,
    rowH = spec.rowHeight || 30;
  const cols = spec.cols.length;
  const cw = (W - label) / cols;
  const H = head + spec.rows.length * rowH;
  spec.height = H;
  const header = spec.cols
    .map(
      (c, j) =>
        `<text class="tick" x="${(label + cw * j + cw / 2).toFixed(1)}" y="16" text-anchor="middle">${esc(cw < 64 && c.short ? c.short : c.name)}</text>`,
    )
    .join("");
  const cells = spec.rows
    .map((r, k) => {
      const y = head + k * rowH;
      return `<text class="rowlabel" x="0" y="${y + rowH / 2 + 4}">${esc(r.label)}</text>${r.color ? `<circle cx="${label - 12}" cy="${y + rowH / 2}" r="4" fill="${r.color}"/>` : ""}${r.cells
        .map((c, j) => {
          const x = label + cw * j;
          const fill = c.value === null ? "rgba(255,255,255,0.03)" : spec.color(c.value);
          return `<rect data-tip="${esc(c.tip || "")}" x="${(x + 1).toFixed(1)}" y="${y + 1}" width="${(cw - 2).toFixed(1)}" height="${rowH - 2}" rx="4" fill="${fill}"/>${c.text && cw > 40 ? `<text class="cell${spec.inkOn?.(c.value) === "dark" ? " dark" : ""}" x="${(x + cw / 2).toFixed(1)}" y="${y + rowH / 2 + 4}" text-anchor="middle">${esc(c.text)}</text>` : ""}`;
        })
        .join("")}`;
    })
    .join("");
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${header}${cells}</svg>`;
}

// --- timeline: rows of states over days -------------------------------------

function renderTimeline(spec, W) {
  const label = spec.labelWidth || 70,
    rowH = 22,
    padT = 4,
    padB = 24;
  const n = spec.length;
  const H = padT + padB + spec.rows.length * rowH;
  spec.height = H;
  const x = (i) => label + (i / Math.max(1, n)) * (W - label - 4);
  const rows = spec.rows
    .map((r, k) => {
      const y = padT + k * rowH;
      let out = `<text class="rowlabel" x="0" y="${y + rowH / 2 + 4}">${esc(r.label)}</text><rect class="track" x="${label}" y="${y + 4}" width="${W - label - 4}" height="${rowH - 8}" rx="3"/>`;
      let start = 0;
      for (let i = 1; i <= n; i++) {
        if (
          i === n ||
          r.states[i] !== r.states[start] ||
          (spec.breaks || []).includes(i)
        ) {
          const st = spec.states[r.states[start]];
          if (st?.color)
            out += `<rect x="${(x(start) + 0.5).toFixed(1)}" y="${y + 4}" width="${Math.max(1, x(i) - x(start) - 1).toFixed(1)}" height="${rowH - 8}" rx="3" fill="${st.color}"/>`;
          start = i;
        }
      }
      for (const m of r.marks || [])
        out += `<circle cx="${(x(m.i) + (x(1) - x(0)) / 2).toFixed(1)}" cy="${y + rowH / 2}" r="2.5" class="tmark ${m.kind}"/>`;
      return out;
    })
    .join("");
  const dividers = (spec.dividers || [])
    .map(
      ([i, l]) =>
        `<line class="divider" x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${padT}" y2="${H - padB}"/><text class="tick" x="${(x(i) + 4).toFixed(1)}" y="${H - 8}">${esc(l)}</text>`,
    )
    .join("");
  spec._g = { x, label, rowH, padT, n };
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${rows}${dividers}<line class="xhair" y1="${padT}" y2="${H - padB}" visibility="hidden"/></svg>`;
}

const RENDER = {
  line: renderLine,
  strip: renderStrip,
  bars: renderBars,
  heat: renderHeat,
  timeline: renderTimeline,
};

// --- tables ---------------------------------------------------------------

function tableOf(spec) {
  if (spec.table) return `<div class="viz-table">${spec.table()}</div>`;
  if (spec.type === "line") {
    const head = `<tr><th>${esc(spec.xName || "")}</th>${spec.series.map((s) => `<th>${esc(s.name)}</th>`).join("")}</tr>`;
    const n = Math.max(...spec.series.map((s) => s.values.length));
    const f = spec.tipFormat || spec.format || ((v) => fmt(v, 2));
    const body = Array.from(
      { length: n },
      (_, i) =>
        `<tr><td>${esc(spec.x?.[i] ?? i + 1)}</td>${spec.series.map((s) => `<td>${s.values[i] === null || s.values[i] === undefined ? "" : esc(f(s.values[i]))}</td>`).join("")}</tr>`,
    ).join("");
    return `<div class="viz-table"><table class="table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }
  if (spec.type === "bars")
    return `<div class="viz-table"><table class="table"><thead><tr><th></th>${spec.rows[0]?.parts.map((p) => `<th>${esc(p.name)}</th>`).join("") || ""}</tr></thead><tbody>${spec.rows.map((r) => `<tr><td>${esc(r.label)}</td>${r.parts.map((p) => `<td>${esc(p.display ?? fmt(p.value, 2))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  if (spec.type === "heat")
    return `<div class="viz-table"><table class="table"><thead><tr><th></th>${spec.cols.map((c) => `<th>${esc(c.name)}</th>`).join("")}</tr></thead><tbody>${spec.rows.map((r) => `<tr><td>${esc(r.label)}</td>${r.cells.map((c) => `<td>${esc(c.text ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  if (spec.type === "strip")
    return `<div class="viz-table"><table class="table"><thead><tr><th></th><th>n</th><th>Mean</th><th>Min</th><th>Q1</th><th>Median</th><th>Q3</th><th>Max</th></tr></thead><tbody>${spec.rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${r.values.length}</td>${[r.mean, r.min, r.q1, r.median, r.q3, r.max].map((v) => `<td>${v === null ? "" : fmt(v, 1)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  return "";
}

// --- interaction ------------------------------------------------------------

let tipEl = null;
function showTip(html, cx, cy) {
  tipEl ||= document.getElementById("tooltip");
  if (!tipEl) return;
  tipEl.innerHTML = html;
  tipEl.hidden = false;
  tipEl.classList.add("viz-tip");
  const r = tipEl.getBoundingClientRect();
  let left = cx + 14,
    top = cy + 14;
  if (left + r.width > innerWidth - 8) left = cx - r.width - 14;
  if (top + r.height > innerHeight - 8) top = cy - r.height - 14;
  tipEl.style.left = `${Math.max(8, left)}px`;
  tipEl.style.top = `${Math.max(8, top)}px`;
}
export function hideTip() {
  if (tipEl) {
    tipEl.hidden = true;
    tipEl.classList.remove("viz-tip");
  }
}
function tipHTML({ title, rows = [], extra }) {
  return `<div class="vt-title">${esc(title)}</div>${rows.map((r) => `<div class="vt-row">${r.color ? rowKey(r.color) : ""}<b>${esc(r.value)}</b><span>${esc(r.name)}</span></div>`).join("")}${extra ? `<div class="vt-extra">${esc(extra)}</div>` : ""}`;
}

function local(f, e) {
  const svg = f.querySelector("svg");
  if (!svg) return null;
  const b = svg.getBoundingClientRect();
  return { px: e.clientX - b.left, py: e.clientY - b.top, b };
}

function pointLine(f, spec, e) {
  const p = local(f, e);
  const g = spec._g;
  if (!p || !g) return;
  const i = Math.max(
    0,
    Math.min(
      g.n - 1,
      Math.round(((p.px - g.padL) / (g.W - g.padL - g.padR)) * (g.n - 1)),
    ),
  );
  f.__i = i;
  moveLine(f, spec, i);
  showTip(tipHTML(lineTip(spec, i)), e.clientX, e.clientY);
}

function pointStrip(f, spec, e) {
  const p = local(f, e);
  if (!p) return;
  const hit = stripHit(spec, p.px, p.py);
  const ring = f.querySelector(".hring");
  if (!hit) {
    ring?.setAttribute("visibility", "hidden");
    return hideTip();
  }
  const r = spec.rows[hit.k],
    v = r.values[hit.i];
  const g = spec._g;
  ring.setAttribute("cx", g.x(v.value));
  ring.setAttribute("cy", g.padT + hit.k * g.rowH + g.rowH / 2 + v.jitter * 10);
  ring.setAttribute("visibility", "visible");
  showTip(
    tipHTML({
      title: v.title,
      rows: [
        {
          color: r.color,
          name: r.label,
          value: spec.format ? spec.format(v.value) : fmt(v.value, 1),
        },
      ],
      extra: v.extra,
    }),
    e.clientX,
    e.clientY,
  );
}

function pointTimeline(f, spec, e) {
  const p = local(f, e);
  const g = spec._g;
  if (!p || !g) return;
  const k = Math.floor((p.py - g.padT) / g.rowH);
  const i = Math.floor(((p.px - g.label) / (p.b.width - g.label - 4)) * g.n);
  if (!spec.rows[k] || i < 0 || i >= g.n) return hideTip();
  const xh = f.querySelector(".xhair");
  xh.setAttribute("x1", g.x(i + 0.5));
  xh.setAttribute("x2", g.x(i + 0.5));
  xh.setAttribute("visibility", "visible");
  showTip(tipHTML(spec.tip(k, i)), e.clientX, e.clientY);
}

/** Binds hover, focus and keys for every chart inside root, once. */
export function bindCharts(root) {
  if (root.__charts) return;
  root.__charts = true;
  root.addEventListener("pointermove", (e) => {
    const mark = e.target.closest?.("[data-tip]");
    if (mark && mark.dataset.tip) {
      const [value, ...rest] = mark.dataset.tip.split("\n");
      root.querySelectorAll(".lift").forEach((m) => m.classList.remove("lift"));
      mark.classList.add("lift");
      return showTip(
        `<div class="vt-row"><b>${esc(value)}</b></div>${rest.length ? `<div class="vt-extra">${esc(rest.join(" "))}</div>` : ""}`,
        e.clientX,
        e.clientY,
      );
    }
    const f = e.target.closest?.("figure.viz");
    const spec = f && specs.get(f.dataset.viz);
    if (!spec || f.querySelector(".viz-table")) return hideTip();
    if (spec.type === "line") pointLine(f, spec, e);
    else if (spec.type === "strip") pointStrip(f, spec, e);
    else if (spec.type === "timeline") pointTimeline(f, spec, e);
    else hideTip();
  });
  root.addEventListener("pointerout", (e) => {
    const to = e.relatedTarget;
    const from = e.target.closest?.("figure.viz");
    if (!to || !root.contains(to) || (from && to.closest?.("figure.viz") !== from))
      clear(root);
  });
  root.addEventListener("keydown", (e) => {
    const f = e.target.closest?.("figure.viz");
    const spec = f && specs.get(f.dataset.viz);
    if (!spec || spec.type !== "line" || !spec._g) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    e.stopPropagation();
    const i = Math.max(
      0,
      Math.min(
        spec._g.n - 1,
        (f.__i ?? spec._g.n - 1) + (e.key === "ArrowRight" ? 1 : -1),
      ),
    );
    f.__i = i;
    moveLine(f, spec, i);
    const b = f.getBoundingClientRect();
    showTip(tipHTML(lineTip(spec, i)), b.left + spec._g.x(i), b.top + 20);
  });
  root.addEventListener("focusout", () => clear(root));
}

function clear(root) {
  hideTip();
  root
    .querySelectorAll(".xhair, .hdot, .hring")
    .forEach((n) => n.setAttribute("visibility", "hidden"));
  root.querySelectorAll(".lift").forEach((m) => m.classList.remove("lift"));
}
