// A single cached painting per responsive layout. Moving items and inhabitants
// stay on the live canvas while the scenery is painted only on resize.
function shape(c, d, color, stroke, width = 1) {
  const p = new Path2D(d);
  if (color) {
    c.fillStyle = color;
    c.fill(p);
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = width;
    c.stroke(p);
  }
}
export function ellipse(c, x, y, rx, ry, color, angle = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
}
export function box(c, x, y, w, h, r, color, stroke, width = 1) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  if (color) {
    c.fillStyle = color;
    c.fill();
  }
  if (stroke) {
    c.lineWidth = width;
    c.strokeStyle = stroke;
    c.stroke();
  }
}
function smooth(c, coords) {
  c.beginPath();
  c.moveTo((coords[0][0] + coords.at(-1)[0]) / 2, (coords[0][1] + coords.at(-1)[1]) / 2);
  coords.forEach(([x, y], i) => {
    const next = coords[(i + 1) % coords.length];
    c.quadraticCurveTo(x, y, (x + next[0]) / 2, (y + next[1]) / 2);
  });
  c.closePath();
}
function pool(c, compact) {
  const [x, y, s] = compact ? [466, 262, 0.45] : [888, 332, 0.77];
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  const rim =
    "M-68 4C-70-15-45-28-19-24C5-25 12-40 38-32C58-27 64-7 50 5C34 19 40 28 10 30C-13 34-62 28-68 4Z";
  shape(c, rim, "#b1bf9a");
  c.translate(0, -4);
  c.scale(0.94, 0.92);
  const water = c.createLinearGradient(0, -29, 0, 40);
  water.addColorStop(0, "#78a99a");
  water.addColorStop(0.58, "#99c5ae");
  water.addColorStop(1, "#bcd8ba");
  shape(c, rim, water, "#d1dbc0", 3);
  shape(
    c,
    "M-37-9Q-21-15-8-10M-38 17Q-21 21-12 18M-15 5Q-4 2 5 4M31-19L38-20",
    null,
    "#e5ead1",
    2,
  );
  for (const [lx, ly, r] of [
    [23, 4, 9],
    [35, -4, 6],
    [-38, 4, 5],
  ]) {
    c.beginPath();
    c.ellipse(lx, ly, r, r * 0.53, -0.16, 0.24, 6.14);
    c.lineTo(lx, ly);
    c.closePath();
    c.fillStyle = "#739a6b";
    c.fill();
  }
  shape(
    c,
    "M-46-12Q-49-27-44-40M-46-15Q-57-30-59-32M-41-16Q-36-28-35-37",
    null,
    "#78905f",
    2,
  );
  c.restore();
}
function tree(c, x, y, s, variant) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  ellipse(c, 8, 4, 29, 7, "#738a5723", -0.04);
  shape(c, "M-5 0Q-3-22-9-48L-3-48-1-29 8-49 12-47Q3-29 4 0Z", "#a58f69");
  if (variant === 1) {
    const canopy =
      "M-2-118C-12-112-14-102-19-91C-29-78-25-64-20-58C-29-46-19-37-9-36Q0-30 12-37C25-39 27-52 20-64C29-80 14-92 12-102Q8-116-2-118Z";
    const g = c.createLinearGradient(-26, -95, 26, -55);
    g.addColorStop(0, "#adc59a");
    g.addColorStop(1, "#7eab87");
    shape(c, canopy, g);
    shape(
      c,
      "M-1-102Q-9-92-11-79M-4-81Q-10-68-9-58M5-65Q8-71 8-76",
      null,
      "#c8d6ae",
      2.4,
    );
  } else {
    const foliage =
      "M-41-53C-52-69-42-89-24-92C-21-110 2-115 16-102C29-108 44-96 43-82C62-69 51-47 37-44C23-29-5-32-14-38C-29-35-40-41-41-53Z";
    const g = c.createLinearGradient(-36, -103, 37, -35);
    g.addColorStop(0, "#c6d19d");
    g.addColorStop(0.6, "#a6c092");
    g.addColorStop(1, "#81a480");
    shape(c, foliage, g);
    shape(
      c,
      "M-33-74Q-28-88-17-88M-11-95Q-1-104 8-99M19-78Q26-85 32-82",
      null,
      "#d9deaf",
      3,
    );
    for (let i = 0; i < 8; i++)
      ellipse(
        c,
        -28 + ((i * 37) % 64),
        -79 + ((i * 17) % 33),
        2,
        1.15,
        "#648c6a55",
        -0.4,
      );
  }
  c.restore();
}
function flower(c, x, y, s, peach = false) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  shape(c, "M0 0Q1-9-2-19", null, "#6b8960", 1.8);
  shape(c, "M0-6Q-11-7-10-14Q-1-14 0-6M0-8Q7-16 10-14Q9-7 0-8", "#8bab74");
  for (let j = 0; j < 5; j++) {
    const a = (j * 2 * Math.PI) / 5;
    ellipse(
      c,
      -2 + Math.cos(a) * 3,
      -20 + Math.sin(a) * 3,
      2.8,
      2.4,
      peach ? "#edb48c" : "#fff5cc",
      a,
    );
  }
  ellipse(c, -2, -20, 2, 1.8, "#dab85c");
  c.restore();
}
function grass(c, x, y, s) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  shape(c, "M-4 0Q-6-4-6-7M0-1Q0-7 2-10M3 0Q6-4 7-5", null, "#8fa77b", 1.3);
  c.restore();
}
function paintBed(c, l) {
  const { x, y, width: w, height: h, columns, rows } = l.bed;
  box(c, x - 9, y - 7, w + 18, h + 24, 21, "#69805d28");
  const wood = c.createLinearGradient(0, y, 0, y + h + 10);
  wood.addColorStop(0, "#ad8860");
  wood.addColorStop(0.78, "#ad8056");
  wood.addColorStop(1, "#89694e");
  box(c, x - 6, y - 7, w + 12, h + 20, 18, wood, "#826f51", 1.3);
  box(c, x - 6, y - 9, w + 12, h + 17, 18, "#dfbd8c", "#a58b66", 1.4);
  box(c, x - 3, y - 7, w + 6, h + 10, 16, "#ebcca0", "#efdab4", 1);
  const soil = c.createLinearGradient(0, y, 0, y + h);
  soil.addColorStop(0, "#795842");
  soil.addColorStop(0.38, "#986e4f");
  soil.addColorStop(1, "#ae815b");
  box(c, x, y, w, h, 13, soil, "#99714f", 1);
  for (let r = 0; r < rows; r++) {
    const gy = l.plot(r * columns)[1] + 3;
    box(c, x + 5, gy - 3, w - 10, 8, 4, "#674c3b3d");
    shape(
      c,
      `M${x + 13} ${gy + 6}Q${x + w * 0.43} ${gy + 7} ${x + w - 15} ${gy + 5}`,
      null,
      "#d0a07470",
      1.5,
    );
  }
  for (let i = 0; i < 100; i++) {
    const gx = x + 8 + (((i * 577) % 997) / 997) * (w - 16),
      gy = y + 4 + (((i * 179) % 991) / 991) * (h - 8);
    ellipse(c, gx, gy, 1.1, 0.6, i % 3 ? "#674b3730" : "#d6ac8255");
  }
  for (const xx of [x + 3, x + w - 3])
    for (const yy of [y - 2, y + h + 4]) ellipse(c, xx, yy, 1.2, 1.2, "#977b56");
}
function wateringCan(c, x, y, scale) {
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  c.rotate(-0.1);
  ellipse(c, 0, 10, 15, 3.5, "#63764b2a");
  shape(c, "M5-7Q24-18 21-2Q18 3 11 2", null, "#55796b", 3.1);
  shape(c, "M-8-2-23-8-26-4-11 6Z", "#749b89", "#587e6c", 1);
  shape(c, "M-24-11Q-29-11-29-6L-24-3-21-7Z", "#a9bfa4", "#739584", 1);
  shape(c, "M-11-9Q0-14 10-8L13 7Q2 14-11 8Z", "#8baf98", "#668975", 1.2);
  ellipse(c, -1, -8.6, 10, 3, "#b7ccb0");
  ellipse(c, -1, -9, 6.2, 1.7, "#6b8b75");
  shape(c, "M-6-4-6 4M-3-4-3 4", null, "#c1d0b3", 1.3);
  c.restore();
}
function foregroundSprig(c, x, y, rotation, scale) {
  c.save();
  c.translate(x, y);
  c.rotate(rotation);
  c.scale(scale, scale);
  shape(c, "M0 0Q-4-24 3-56", null, "#849e74", 1.8);
  for (const [dx, dy, angle, size] of [
    [-1, -7, -0.85, 1.05],
    [-1, -15, 0.78, 1],
    [-1, -26, -0.68, 0.86],
    [0, -32, 0.78, 0.82],
    [1, -44, -0.48, 0.64],
    [2, -50, 0.28, 0.61],
  ]) {
    c.save();
    c.translate(dx, dy);
    c.rotate(angle);
    c.scale(size, size);
    shape(c, "M0 1Q-10-5-6-19Q7-15 0 1Z", "#a1b78a");
    shape(c, "M0-1Q-1-10-5-16", null, "#c5d1a7", 0.9);
    c.restore();
  }
  c.restore();
}
export function landscape(l, pixelScale) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(l.w * pixelScale);
  canvas.height = Math.ceil(l.h * pixelScale);
  const c = canvas.getContext("2d");
  c.scale(pixelScale, pixelScale);
  c.lineJoin = "round";
  c.lineCap = "round";
  const { w, h, compact } = l;
  const meadow = c.createLinearGradient(0, 0, w * 0.4, h);
  meadow.addColorStop(0, "#e8efdb");
  meadow.addColorStop(0.42, "#eff1d9");
  meadow.addColorStop(1, "#d5e3c4");
  c.fillStyle = meadow;
  c.fillRect(0, 0, w, h);
  const sunwash = c.createRadialGradient(
    w * 0.82,
    h * 0.13,
    0,
    w * 0.82,
    h * 0.13,
    w * 0.5,
  );
  sunwash.addColorStop(0, "#fff1b866");
  sunwash.addColorStop(1, "#fff7cc00");
  c.fillStyle = sunwash;
  c.fillRect(0, 0, w, h);
  // Mown meadow, a footpath through the plot and a small orchard fence.
  c.save();
  c.scale(w / 1000, h / 590);
  smooth(c, [
    [-43, 319],
    [38, 169],
    [178, 109],
    [337, 116],
    [475, 80],
    [599, 73],
    [738, 111],
    [930, 155],
    [1018, 256],
    [1026, 420],
    [884, 472],
    [731, 464],
    [598, 550],
    [413, 538],
    [262, 492],
    [66, 506],
    [-16, 436],
  ]);
  c.fillStyle = "#dbe6c9";
  c.fill();
  smooth(c, [
    [-59, 349],
    [78, 218],
    [181, 153],
    [333, 149],
    [490, 123],
    [652, 126],
    [807, 175],
    [951, 195],
    [1031, 285],
    [1003, 399],
    [869, 430],
    [704, 437],
    [556, 498],
    [416, 483],
    [265, 448],
    [121, 462],
    [21, 425],
  ]);
  c.fillStyle = "#d1e0bd";
  c.fill();
  const path =
    "M-35 328C94 304 129 328 237 314C327 302 336 253 423 246C630 219 682 299 786 303C881 307 912 237 1048 230";

  const turn =
    "M235 314C285 363 267 414 338 440C440 475 596 450 669 453C831 462 837 510 1020 498";
  shape(c, path, null, "#c3cfae", 31);
  shape(c, turn, null, "#c3cfae", 24);
  shape(c, path, null, "#ebe3c6", 27);
  shape(c, turn, null, "#ebe3c6", 21);
  c.restore();
  if (!compact) {
    for (const [x, y] of [
      [117, 109],
      [146, 104],
      [176, 101],
      [205, 100],
      [749, 119],
      [779, 124],
      [809, 130],
      [839, 139],
    ]) {
      shape(c, `M${x} ${y - 7}l28 3m-28 2l28 3`, null, "#a6a886", 2.8);
      box(c, x - 2, y - 13, 4, 19, 1.8, "#b2ad89");
      ellipse(c, x, y - 12, 2, 1, "#d5c9a0");
    }
    const stones = [
      [103, 314, 10],
      [128, 313, 8],
      [152, 313, 11],
      [279, 383, 7],
      [286, 401, 8],
      [299, 415, 7],
      [911, 272, 10],
      [931, 258, 8],
    ];
    for (const [x, y, r] of stones) {
      ellipse(c, x, y, r, 3.4, "#b6b9a096", -0.08);
      ellipse(c, x - 1, y - 0.9, r - 1, 2.9, "#d5d4b8", -0.08);
    }
  }
  const trees = compact
    ? [
        [8, 93, 0.5, 0],
        [29, 111, 0.35, 1],
        [-4, 360, 0.45, 1],
        [486, 151, 0.43, 1],
        [467, 166, 0.31, 0],
        [482, 409, 0.38, 0],
      ]
    : [
        [41, 156, 0.82, 0],
        [104, 149, 0.65, 1],
        [75, 179, 0.44, 0],
        [919, 192, 0.66, 1],
        [963, 215, 0.85, 0],
        [902, 226, 0.4, 0],
        [26, 416, 0.52, 1],
        [74, 426, 0.38, 0],
        [953, 470, 0.4, 1],
      ];
  trees.forEach((args) => tree(c, ...args));
  pool(c, compact);
  for (let i = 0; i < 60; i++) {
    const x = (((i * 793 + 31) % 997) / 997) * w,
      y = (((i * 137 + 58) % 577) / 577) * h;
    if (x > w * 0.19 && x < w * 0.81 && y > h * 0.12 && y < h * 0.87) continue;
    if (i % 3 === 0) grass(c, x, y, compact ? 0.57 : 0.72);
    else ellipse(c, x, y, 1.6, 1.05, i % 2 ? "#adc18f" : "#f5ecc9");
  }
  const clumps = compact
    ? [
        [32, 286, 0.6],
        [44, 298, 0.49],
        [54, 289, 0.42],
        [440, 435, 0.67],
        [451, 430, 0.48],
        [459, 444, 0.64],
        [31, 430, 0.45],
      ]
    : [
        [77, 488, 0.91],
        [94, 496, 0.65],
        [108, 485, 0.7],
        [59, 481, 0.69],
        [821, 538, 0.89],
        [837, 548, 0.7],
        [855, 533, 0.86],
        [873, 539, 0.61],
        [288, 99, 0.57],
        [307, 101, 0.44],
        [927, 279, 0.58],
      ];
  clumps.forEach(([x, y, s], i) => flower(c, x, y, s, i % 4 === 0));
  paintBed(c, l);
  if (!compact) wateringCan(c, l.bed.x - 27, l.bed.y + l.bed.height - 6, 0.95);
  const edgeScale = compact ? 0.53 : 0.95;
  foregroundSprig(c, 10, h + 7, 0.43, edgeScale);
  foregroundSprig(c, 24, h + 10, 0.83, edgeScale * 0.91);
  foregroundSprig(c, w - 9, h + 8, -0.69, edgeScale);
  foregroundSprig(c, w - 25, h + 9, -0.29, edgeScale * 0.77);
  return canvas;
}
