import {
  colors,
  drawSeedling,
  drawGhost,
  prepareCharacterSprites,
} from "./characters.js";
import {
  sequenceFor,
  projectFrame,
  timelineEvents,
  crossedEvents,
  CONTACT,
  LAUNCH,
  MEAL_BITE,
} from "./animation.js";
import { drawResource, drawGrowingCarrot } from "./icons.js";
import { gardenLayout } from "./garden-layout.js";
import { converterPrice } from "./action-readout.js";
import { dayStageFor } from "./day-stage.js";
import { landscape, ellipse, box } from "./garden-landscape.js";
export { colors } from "./characters.js";

const clamp = (n) => Math.max(0, Math.min(1, n));
const smooth = (n) => n * n * (3 - 2 * n);

const daylight = {
  dawn: { wash: ["#ebb091ab", "#f7dca66e", "#eed5aa05"], sun: [-8, 11] },
  morning: { wash: ["#c4e4ee7a", "#f4f2d32f", "#e7efd508"], sun: [0, -9] },
  afternoon: { wash: ["#f2d58c94", "#eed29153", "#cda76b21"], sun: [9, -2] },
  evening: { wash: ["#9896b7db", "#ecc19bc2", "#b7a4af47"], sun: [14, 13] },
};
const timesOfDay = Object.keys(daylight);
function makeSkies() {
  return Object.fromEntries(
    timesOfDay.map((stage) => {
      // Only the broad colour wash is cached. Tiny textures scale smoothly to
      // both stage sizes without allocating a second full-resolution meadow.
      const image = document.createElement("canvas");
      image.width = 96;
      image.height = 128;
      const brush = image.getContext("2d");
      const sky = brush.createLinearGradient(0, 0, 12, 128);
      const [upper, horizon, ground] = daylight[stage].wash;
      sky.addColorStop(0, upper);
      sky.addColorStop(0.38, horizon);
      sky.addColorStop(1, ground);
      brush.fillStyle = sky;
      brush.fillRect(0, 0, 96, 128);
      return [stage, image];
    }),
  );
}
function paintSky(c, l, skies, weights) {
  let x = l.sun[0],
    y = l.sun[1];
  c.save();
  for (const stage of timesOfDay) {
    const strength = weights[stage] || 0;
    if (!strength) continue;
    // Tint the terrain while keeping the raised bed, paths and trees defined.
    c.globalCompositeOperation = "multiply";
    c.globalAlpha = strength * 0.66;
    c.drawImage(skies[stage], 0, 0, l.w, l.h);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = strength * 0.34;
    c.drawImage(skies[stage], 0, 0, l.w, l.h);
    const [dx, dy] = daylight[stage].sun;
    const drift = strength * (l.compact ? 0.48 : 1);
    x += drift * dx;
    y += drift * dy;
  }
  if (weights.evening > 0) {
    c.globalAlpha = weights.evening * 0.85;
    const stars = [
      [0.1, 0.075, 2.5],
      [0.18, 0.1, 1.25],
      [0.34, 0.035, 2.1],
      [0.66, 0.09, 2.8],
      [0.74, 0.047, 1.4],
      [0.94, 0.085, 1.8],
    ];
    for (const [sx, sy, r] of stars)
      spark(c, l.w * sx, l.h * sy, r * (l.compact ? 0.8 : 1), "#fff4d4");
  }
  c.restore();
  return [x, y];
}
function sun(c, layout, t, charge, position, dusk) {
  const [x, y] = position,
    size = layout.compact ? 0.73 : 0.97;
  c.save();
  c.translate(x, y);
  c.scale(size, size);
  const halo = c.createRadialGradient(0, 0, 18, 0, 0, 58);
  halo.addColorStop(0, charge ? "#ffe3a1b3" : "#fff1be88");
  halo.addColorStop(1, "#fff0bb00");
  ellipse(c, 0, 0, 58, 58, halo);
  c.save();
  c.rotate(t * 0.025);
  for (let i = 0; i < 12; i++) {
    c.rotate(Math.PI / 6);
    c.beginPath();
    c.moveTo(28, 0);
    c.lineTo(i % 2 ? 32 : 37, 0);
    c.strokeStyle = i % 2 ? "#dbb75a" : "#c99742";
    c.lineWidth = i % 2 ? 1.8 : 2.9;
    c.stroke();
  }
  c.restore();
  const skin = c.createLinearGradient(-14, -18, 15, 20);
  skin.addColorStop(0, "#fff3ba");
  skin.addColorStop(0.5, "#f7d573");
  skin.addColorStop(1, "#e8ae4c");
  ellipse(c, 0, 0, 21, 21, skin);
  if (dusk > 0) {
    c.save();
    c.globalAlpha = dusk * 0.66;
    ellipse(c, 0, 0, 20.7, 20.7, "#efa36e");
    c.restore();
  }
  c.strokeStyle = "#dbad52";
  c.lineWidth = 1;
  c.stroke();
  c.beginPath();
  c.arc(0, 0, 16, 3.53, 4.53);
  c.strokeStyle = "#fff8d3";
  c.lineWidth = 2;
  c.stroke();
  ellipse(c, -6, 1, 1.5, 2 - dusk * 1.25, "#85693f");
  ellipse(c, 6, 1, 1.5, 2 - dusk * 1.25, "#85693f");
  c.beginPath();
  c.moveTo(-2.7, 6);
  c.quadraticCurveTo(0, 8.6, 2.7, 6);
  c.strokeStyle = "#9d7441";
  c.lineWidth = 1.25;
  c.stroke();
  c.restore();
}
function flightPoint(from, to, p, height) {
  const q = smooth(clamp(p));
  return [
    from[0] + (to[0] - from[0]) * q,
    from[1] + (to[1] - from[1]) * q - 4 * q * (1 - q) * height,
  ];
}
function flight(c, kind, from, to, p, size, height) {
  if (p < 0 || p >= 1) return;
  const color = kind === "energy" ? "246,192,72" : "218,137,65";
  c.save();
  for (let j = 3; j > 0; j--) {
    const start = flightPoint(from, to, p - 0.037 * (j + 1), height),
      end = flightPoint(from, to, p - 0.037 * (j - 1), height);
    c.beginPath();
    c.moveTo(...start);
    c.lineTo(...end);
    c.lineWidth = ((4 - j * 0.62) * size) / 15;
    c.strokeStyle = "rgba(" + color + "," + (0.5 - j * 0.1) + ")";
    c.stroke();
  }
  const [x, y] = flightPoint(from, to, p, height);
  c.translate(x, y);
  if (kind === "carrot")
    c.rotate((to[0] > from[0] ? 1 : -1) * Math.sin(Math.PI * p) * 0.38);
  drawResource(c, kind, 0, 0, size * (1 + 0.13 * Math.sin(Math.PI * p)));
  c.restore();
}
// The mouth and the carrot tip share this pose, so the bite lands at the
// presentation event even when the stage changes size in the middle of it.
function supperPose(progress, reduced, side) {
  const after = clamp((progress - MEAL_BITE) / (1 - MEAL_BITE));
  const approach = smooth(clamp((progress - 0.09) / (MEAL_BITE - 0.09)));
  const grasp = reduced
    ? progress < MEAL_BITE
      ? 1
      : 0.65
    : smooth(clamp((progress - 0.14) / 0.27)) *
      (1 - smooth(clamp((progress - 0.73) / 0.24)));
  const chew =
    progress < MEAL_BITE
      ? 0
      : reduced
        ? 0.7
        : (1 - after) * (0.25 + 0.75 * Math.sin(after * Math.PI * 2.4) ** 2);
  return {
    side,
    grasp,
    chew,
    approach,
    bitten: progress >= MEAL_BITE,
    reduced,
  };
}
function supperCarrot(c, layout, x, y, progress, meal) {
  const { side, approach, bitten, reduced } = meal;
  const [badgeX, badgeY] = layout.counter(x, y);
  const scale = layout.size;
  // The artwork's tip is just inside its bottom edge. Anchor the path there
  // and tilt the leaves away from the face as the amoeboid lifts its carrot.
  const mouth = [x, y + 10 * scale];
  const source = [badgeX - 9 * (layout.compact ? 0.77 : 0.96), badgeY];
  const bitePiece = bitten ? smooth(clamp((progress - MEAL_BITE) / 0.16)) : 0;
  const emergence = reduced ? 1 : 0.5 + 0.5 * smooth(clamp(approach / 0.5));
  const size = (layout.compact ? 29 : 34) * (1 - bitePiece) * emergence;
  if (!bitten || (!reduced && size > 1)) {
    const angle = side * (0.2 + 1.03 * (reduced ? 1 : approach));
    const reach = (bitten ? 0.15 : 0.43) * size;
    const target = [
      mouth[0] + Math.sin(angle) * reach,
      mouth[1] - Math.cos(angle) * reach,
    ];
    const [cx, cy] = reduced
      ? target
      : flightPoint(source, target, approach, layout.compact ? 11 : 15);
    c.save();
    c.translate(cx, cy);
    c.rotate(angle);
    if (bitten) {
      // Three small scallops expose the first bite while the remaining piece
      // disappears into the mouth; the ledger continues to show today's haul.
      c.beginPath();
      c.moveTo(-size / 2, -size / 2);
      c.lineTo(size / 2, -size / 2);
      c.lineTo(size / 2, size * 0.1);
      for (let tooth = 2; tooth >= 0; tooth--) {
        const xx = -size / 2 + (tooth * size) / 3;
        c.quadraticCurveTo(xx + size / 6, -size * 0.04, xx, size * 0.1);
      }
      c.closePath();
      c.clip();
    }
    drawResource(c, "carrot", 0, 0, size);
    c.restore();
  }
  if (bitten && !reduced) {
    const p = clamp((progress - MEAL_BITE) / 0.25);
    if (p >= 1) return;
    c.save();
    c.globalAlpha = 1 - p;
    for (const [dx, dy, r, col] of [
      [18, -9, 2.1, "#db8950"],
      [25, 5, 1.8, "#f4b36a"],
      [15, 12, 1.35, "#a0b66c"],
    ]) {
      const px = mouth[0] + side * (4 + dx * p) * scale;
      const py = mouth[1] + (dy * p - 8 * Math.sin(Math.PI * p) + 5 * p * p) * scale;
      ellipse(c, px, py, r * scale, r * 0.75 * scale, col, p * 2);
    }
    c.restore();
  }
}
function spark(c, x, y, r, color) {
  c.beginPath();
  c.moveTo(x, y - r);
  c.quadraticCurveTo(x + 0.16 * r, y - 0.16 * r, x + r, y);
  c.quadraticCurveTo(x + 0.16 * r, y + 0.16 * r, x, y + r);
  c.quadraticCurveTo(x - 0.16 * r, y + 0.16 * r, x - r, y);
  c.quadraticCurveTo(x - 0.16 * r, y - 0.16 * r, x, y - r);
  c.fillStyle = color;
  c.fill();
}
function impactMark(c, x, y, age, color, compact) {
  const p = clamp(age / 105);
  if (p >= 1 || age < 0) return;
  c.save();
  c.globalAlpha = (1 - p) * 0.85;
  const radius = (compact ? 6 : 8) + p * (compact ? 9 : 12);
  c.beginPath();
  c.ellipse(x, y, radius, radius * 0.76, 0, 0, Math.PI * 2);
  c.lineWidth = 1.7 * (1 - p) + 0.5;
  c.strokeStyle = color;
  c.stroke();
  spark(c, x + radius * 0.82, y - radius * 0.76, 3 * (1 - p) + 0.6, color);
  c.restore();
}
function resourceBadge(c, layout, x, y, n, pulse, fed = false) {
  const scale = layout.compact ? 0.77 : 0.96;
  c.save();
  c.translate(x, y);
  c.scale(scale * (1 + pulse * 0.11), scale * (1 + pulse * 0.11));
  box(c, -23, -11, 46, 24, 11, "#53603d19");
  box(
    c,
    -23,
    -12,
    46,
    24,
    11,
    fed ? "#eef5d9" : "#fffbee",
    fed ? "#8ca47a" : "#beaf8a",
    1,
  );
  drawResource(c, "carrot", -9, 0, 17);
  c.font = '700 14px "DM Sans",sans-serif';
  c.fillStyle = "#464e36";
  c.textAlign = "center";
  if (fed) {
    c.strokeStyle = "#456c48";
    c.lineWidth = 2.6;
    c.beginPath();
    c.moveTo(3, 0);
    c.lineTo(7, 4.4);
    c.lineTo(14, -4.4);
    c.stroke();
  } else c.fillText(String(n), 8, 5);
  c.restore();
}
function converter(c, l, frame, price, range, pulse) {
  const [x, y] = l.converter,
    scale = l.compact ? 0.8 : 1;
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  box(c, -55, -13, 110, 32, 15, "#556c4933");
  box(c, -55, -16, 110, 32, 15, pulse > 0.15 ? "#fff1c7" : "#fff9e7", "#b8b993", 1.4);
  if (price === 1 || price === 2) {
    for (let i = 0; i < price; i++) {
      const slotX = (l.slot(i, price)[0] - x) / scale;
      drawResource(c, "energy", slotX, 0, 16, (frame.pending || 0) > i);
    }
  } else {
    drawResource(c, "energy", -38, 0, 15, (frame.pending || 0) > 0);
    c.font = '700 12px "DM Sans",sans-serif';
    c.textAlign = "center";
    c.fillStyle = "#565c3f";
    const tally = price ? (frame.pending || 0) + "/" + price : range;
    c.fillText(tally, -15, 4, 30);
  }
  c.beginPath();
  c.moveTo(3, 0);
  c.lineTo(16, 0);
  c.moveTo(12, -4);
  c.lineTo(16, 0);
  c.lineTo(12, 4);
  c.strokeStyle = "#939978";
  c.lineWidth = 1.8;
  c.stroke();
  drawResource(c, "carrot", 34, 0, 22);
  c.restore();
}
function paintCrop(c, l, frame, impact) {
  const n = frame.food;
  const normalSize = Math.min(
    l.compact ? 24 : 33,
    (l.bed.width - 22) / l.bed.columns,
    (1.13 * (l.bed.height - 13)) / l.bed.rows,
  );
  for (let i = 0; i < l.fieldCapacity; i++) {
    const [x, y] = l.plot(i);
    if (i >= n) {
      ellipse(c, x, y + 3, l.compact ? 2.2 : 3, 0.9, "#624d3970");
      continue;
    }
    const settle = i === n - 1 ? impact : 0;
    c.save();
    c.translate(x, y);
    c.rotate((((i * 47) % 7) - 3) * 0.054);
    ellipse(c, 0, 6, l.compact ? 4 : 5.5, 1.7, "#593e336e");
    drawGrowingCarrot(c, 0, 0, normalSize * (1 + settle * 0.2), i);
    c.restore();
  }
}
function wallet(c, l, x, y, n, contact, reduced, age, full) {
  const [wx, wy] = l.wallet(x, y),
    w = l.compact ? 67 : 85;
  box(c, wx - w / 2, wy - 7, w, 15, 7.5, full ? "#fff1c4" : "#f4f6e5", "#adbd9c", 1);
  if (l.energyCapacity > 8) {
    const [px, py] = l.pip(x, y, 0);
    drawResource(c, "energy", px, py, l.compact ? 12 : 15, n > 0);
    c.font = '700 12px "DM Sans",sans-serif';
    c.fillStyle = "#51583b";
    c.textAlign = "center";
    c.fillText(n + "/" + l.energyCapacity, wx + 6, wy + 4);
    if (contact && !reduced)
      impactMark(c, px, py, age - contact.atMs, "#d9a544", l.compact);
    return;
  }
  if (l.energyCapacity === 0) {
    c.fillStyle = "#616b53";
    c.font = '600 11px "DM Sans",sans-serif';
    c.textAlign = "center";
    c.fillText("0/0", wx, wy + 4);
  }
  for (let p = 0; p < l.energyCapacity; p++) {
    const [px, py] = l.pip(x, y, p),
      landed = contact?.pip === p ? 1 - clamp((age - contact.atMs) / 85) : 0;
    drawResource(
      c,
      "energy",
      px,
      py,
      (l.compact ? 8 : 10) * (1 + (reduced ? 0 : 0.4) * landed),
      p < n,
    );
    if (landed && !reduced)
      impactMark(c, px, py, age - contact.atMs, "#d9a544", l.compact);
  }
}

export function createScene(
  canvas,
  { onPresent = () => {}, onMotion = () => {}, onEvents = () => {} } = {},
) {
  prepareCharacterSprites();
  const c = canvas.getContext("2d"),
    motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  let layout,
    backdrop,
    scale,
    playing = false,
    speed = 1,
    lastTime = null,
    age = 0,
    delivered = -1,
    viewKey = "";
  let source = { food: 60, phase: "ready", actor: -1, agents: [] },
    before = source,
    steps = [],
    events = [],
    duration = 0,
    version = 3,
    settings = {};
  let lifeTime = 0;
  let hasSunlight = false;
  const ghosts = new Map();
  const skies = makeSkies();
  let skyTarget = null,
    skyFrom = {},
    skyWeights = {},
    transitionAge = 0;
  function advanceSky(frame, delta, reduced) {
    let stage = dayStageFor(frame, version);
    if (stage === "ready") stage = "morning";
    if (stage !== skyTarget) {
      skyFrom = { ...skyWeights };
      transitionAge = skyTarget === null || !playing ? 145 : 0;
      skyTarget = stage;
    }
    transitionAge = reduced ? 145 : Math.min(145, transitionAge + delta);
    const mix = smooth(transitionAge / 145);
    for (const name of timesOfDay) {
      skyWeights[name] = (skyFrom[name] || 0) * (1 - mix) + (name === stage ? mix : 0);
    }
  }
  function resize() {
    const width = canvas.clientWidth || 800;
    layout = gardenLayout(width <= 520, source.agents.length, settings);
    scale = Math.max(
      0.5,
      Math.min(2, ((window.devicePixelRatio || 1) * width) / layout.w),
    );
    canvas.style.aspectRatio = layout.w + " / " + layout.h;
    canvas.width = Math.round(layout.w * scale);
    canvas.height = Math.round(layout.h * scale);
    backdrop = landscape(layout, scale);
  }
  resize();
  let measured = canvas.clientWidth;
  let drawing = true,
    nextFrame;
  new ResizeObserver(() => {
    if (canvas.clientWidth > 0 && canvas.clientWidth !== measured) {
      measured = canvas.clientWidth;
      resize();
    }
  }).observe(canvas);
  function configure(f, prev, replayVersion, rules) {
    const layoutChanged =
      layout.homes.length !== f.agents.length ||
      layout.fieldCapacity !== (rules?.fieldCapacity ?? 60) ||
      layout.energyCapacity !== (rules?.energyCapacity ?? 6);
    settings = rules ?? {};
    version = replayVersion;
    if (f.phase === "ready") ghosts.clear();
    for (let i = 0; i < f.agents.length; i++) {
      if (f.agents[i].dead && !source.agents[i]?.dead) ghosts.set(i, 0);
      if (!f.agents[i].dead) ghosts.delete(i);
    }
    source = f;
    if (layoutChanged) resize();
    before = prev;
    steps = sequenceFor(f, prev, version);
    events = timelineEvents(steps);
    hasSunlight = events.some((event) => event.kind === "sun_land");
    duration = steps.reduce((sum, s) => sum + s.ms, 0);
    age = 0;
    delivered = -1;
    viewKey = "";
    lastTime = null;
  }
  configure(source, source, version);
  document.addEventListener("visibilitychange", () => {
    lastTime = null;
  });
  function draw(ms) {
    const visible = !document.hidden,
      reduced = motionQuery.matches;
    const dt = lastTime === null ? 0 : Math.max(0, ms - lastTime);
    lastTime = visible ? ms : null;
    if (visible && (playing || source.phase === "ready"))
      lifeTime += dt * (playing ? speed : 1);
    if (playing && visible) {
      const delta = dt * speed;
      age += delta;
      for (const [i, a] of ghosts) ghosts.set(i, a + delta);
    }
    const frame = projectFrame(source, before, steps, age),
      m = frame.motion;
    const { compact } = layout;
    onMotion(frame);
    const key = [
      m.index,
      m.kind === "supper" && m.progress >= MEAL_BITE,
      frame.food,
      frame.energy,
      frame.pending,
      frame.agents[frame.actor]?.food,
      frame.agents[frame.actor]?.given,
      ...frame.agents.map((a) => a.energyLeft),
    ].join(":");
    if (key !== viewKey) {
      viewKey = key;
      onPresent(frame);
    }
    const recent = events.filter((e) => e.atMs <= age && e.atMs >= age - 170);
    const contacts = (kind, actor) =>
      recent.findLast((e) => e.kind === kind && (actor == null || e.actor === actor));
    const hitStrength = (e) => (e ? 1 - clamp((age - e.atMs) / 95) : 0);
    const grow = contacts("convert_land");
    const t = reduced ? 0 : lifeTime / 1000;
    c.setTransform(canvas.width / layout.w, 0, 0, canvas.height / layout.h, 0, 0);
    c.lineCap = "round";
    c.lineJoin = "round";
    c.imageSmoothingQuality = "high";
    c.clearRect(0, 0, layout.w, layout.h);
    c.drawImage(backdrop, 0, 0, layout.w, layout.h);
    advanceSky(frame, playing && visible ? dt * speed : 0, reduced);
    const sunPosition = paintSky(c, layout, skies, skyWeights);
    paintCrop(c, layout, frame, reduced ? 0 : hitStrength(grow));
    sun(
      c,
      layout,
      t,
      hasSunlight && (m.kind === "sun_charge" || m.kind === "sun_full"),
      sunPosition,
      skyWeights.evening,
    );
    const priceRange =
      settings.price?.mode === "random"
        ? `${settings.price.min}–${settings.price.max}`
        : "·";
    converter(
      c,
      layout,
      frame,
      converterPrice(frame, settings, version),
      priceRange,
      hitStrength(contacts("energy_land")),
    );
    const positions = layout.homes.map(([hx, hy], i) => {
      // The pick leans into the patch; both endpoints follow the same anchor.
      if (reduced || i !== frame.actor || source.phase !== "harvest") return [hx, hy];
      const reach =
        m.kind === "harvest_done" ? 1 - smooth(m.progress) : smooth(clamp(age / 105));
      return [
        hx + (layout.w * 0.5 - hx) * 0.035 * reach,
        hy + (layout.h * 0.5 - hy) * 0.035 * reach,
      ];
    });
    for (let i = 0; i < positions.length; i++) {
      const [x, y] = positions[i],
        a = frame.agents[i],
        appearance = a.appearance ?? i,
        active = frame.actor === i;
      if (a?.dead) {
        const g = ghosts.get(i) ?? 1800,
          p = clamp(g / 1800);
        if (p < 1)
          drawGhost(
            c,
            x + (reduced ? 0 : Math.sin(p * 6) * 7),
            y - (reduced ? 11 : p * 84),
            appearance,
            layout.size * 0.88,
            Math.min(1, (1 - p) * 2.2),
          );
        if (!compact) {
          c.font = '500 12px "DM Sans",sans-serif';
          c.fillStyle = "#687a60";
          c.textAlign = "center";
          c.fillText("Died · round " + a.diedRound, x, y + 48);
        }
        continue;
      }
      const eating = m.kind === "supper" && m.eaters.includes(i);
      const meal = eating
        ? supperPose(m.progress, reduced, layout.counter(x, y)[0] < x ? -1 : 1)
        : null;
      const landed = contacts("sun_land", i),
        harvest = contacts("harvest_land", i),
        give = contacts("energy_land", i);
      const impulse = Math.max(
        hitStrength(landed),
        hitStrength(harvest),
        hitStrength(give),
      );
      const finish =
        active && m.kind === "harvest_done" ? Math.sin(m.progress * Math.PI) : 0;
      if (active) {
        ellipse(
          c,
          x,
          y + layout.size * 31,
          layout.size * 40,
          layout.size * 9,
          "#fff8ddc9",
        );
        c.lineWidth = 2.2;
        c.strokeStyle = colors[appearance];
        c.stroke();
      }
      const anticipate =
        active && m.kind === "pick" && m.progress < LAUNCH
          ? Math.sin((Math.PI * m.progress) / LAUNCH)
          : 0;
      drawSeedling(c, x, y, appearance, t, {
        size: layout.size,
        meal,
        lift: reduced ? 0 : finish * 5.5 + impulse * 2.8,
        impact: reduced ? 0 : impulse,
        lean: reduced
          ? 0
          : (layout.w * 0.5 > x ? 1 : -1) *
            (anticipate * 0.065 + hitStrength(give) * 0.045),
        reduced,
      });
      if (!compact) {
        const name = a?.name || "Amoeboid " + (i + 1);
        c.font = '600 13px "DM Sans",sans-serif';
        c.textAlign = "center";
        c.fillStyle = "#3a563e";
        c.fillText(name.length > 16 ? name.slice(0, 15) + "…" : name, x, y + 49);
      }
      wallet(
        c,
        layout,
        x,
        y,
        a?.energyLeft ?? Math.max(0, 6 - (a?.given || 0)),
        landed,
        reduced,
        age,
        hasSunlight && m.kind === "sun_full",
      );
      const stock = version >= 4 ? (a.pantry ?? 0) : (a.food ?? 0);
      const fed =
        meal?.bitten &&
        (frame.meals?.find((outcome) => outcome.actor === i)?.fed ?? true);
      if (stock > 0 || meal || (active && source.phase === "harvest")) {
        const [bx, by] = layout.counter(x, y);
        resourceBadge(
          c,
          layout,
          bx,
          by,
          stock,
          reduced ? 0 : Math.max(hitStrength(harvest), finish),
          fed,
        );
      }
      if (meal) supperCarrot(c, layout, x, y, m.progress, meal);
      if (a?.error) {
        c.font = "bold 15px sans-serif";
        c.fillStyle = "#8e473c";
        c.fillText("!", x + 28, y - 19);
      }
    }
    if (!reduced) {
      if (m.kind === "sun_charge") {
        for (const token of m.tokens) {
          const p = (m.progress - token.launch) / (token.land - token.launch);
          if (p < 0 || p >= 1) continue;
          const [x, y] = positions[token.actor],
            dest = layout.pip(x, y, token.pip);
          const arc = Math.min(
            compact ? 44 : 73,
            Math.max(
              13,
              (Math.abs(dest[0] - sunPosition[0]) + Math.abs(dest[1] - sunPosition[1])) *
                0.14,
            ),
          );
          flight(c, "energy", sunPosition, dest, p, compact ? 12 : 16, arc);
        }
      }
      if (activeItem(m)) {
        const [x, y] = positions[frame.actor];
        const p = (m.progress - LAUNCH) / (CONTACT - LAUNCH);
        if (m.kind === "pick")
          flight(
            c,
            "carrot",
            layout.plot(before.food - m.n),
            layout.counter(x, y),
            p,
            compact ? 24 : 31,
            compact ? 28 : 44,
          );
        else if (m.kind === "energy") {
          const left = before.agents[frame.actor]?.energyLeft ?? 6;
          flight(
            c,
            "energy",
            layout.pip(x, y, left - m.n),
            layout.slot(m.pending, m.price),
            p,
            compact ? 16 : 20,
            compact ? 23 : 37,
          );
        } else
          flight(
            c,
            "carrot",
            layout.sprout(),
            layout.plot(before.food + m.made),
            p,
            compact ? 21 : 28,
            compact ? 18 : 29,
          );
      }
      if (grow) {
        const at = layout.plot(Math.max(0, frame.food - 1));
        impactMark(c, ...at, age - grow.atMs, "#e6d19c", compact);
      }
      if (hasSunlight && m.kind === "sun_full" && m.progress < 0.82) {
        c.save();
        c.globalAlpha = (1 - m.progress / 0.82) * 0.85;
        for (let i = 0; i < positions.length; i++) {
          if (frame.agents[i]?.dead) continue;
          const [x, y] = positions[i];
          spark(
            c,
            x + layout.size * (26 + 12 * m.progress),
            y - 9 - m.progress * 13,
            3.5 * (1 - m.progress),
            "#f5bd54",
          );
        }
        c.restore();
      }
    }
    if (playing && visible) {
      const batch = crossedEvents(events, delivered, age);
      delivered = age;
      if (batch.length) onEvents(batch, speed);
    }
    nextFrame = requestAnimationFrame(draw);
  }
  const activeItem = (m) =>
    ["pick", "energy", "convert"].includes(m.kind) && source.actor >= 0;
  nextFrame = requestAnimationFrame(draw);
  return {
    visible(show) {
      if (drawing === show) return;
      drawing = show;
      lastTime = null;
      if (show) nextFrame = requestAnimationFrame(draw);
      else cancelAnimationFrame(nextFrame);
    },
    set(f, previous = f, replayVersion = 3, rules) {
      if (f !== source || replayVersion !== version || (rules && rules !== settings))
        configure(f, previous, replayVersion, rules);
      return projectFrame(source, before, steps, age);
    },
    remaining: () => Math.max(0, duration - age),
    age: () => age,
    playback(isPlaying, playbackSpeed = 1) {
      if (isPlaying !== playing || speed !== playbackSpeed) lastTime = null;
      playing = isPlaying;
      speed = playbackSpeed;
    },
    reset() {
      lifeTime = 0;
      skyTarget = null;
      ghosts.clear();
      configure(source, before, version, settings);
    },
  };
}
