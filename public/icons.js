// Shared vector paths for the live garden and interface. Frequent canvas draws
// use transparent sprites so a dense harvest stays inexpensive on phones.
const shapes = {
  carrot: [
    ["M16 15C10 14 5 11 4 5C10 4 15 7 16 13Z", "#598653"],
    ["M15 13C12 9 13 4 18 1Q23 7 17 14Z", "#82a855"],
    ["M17 13Q21 4 28 6Q26 13 18 15Z", "#689548"],
    [
      "M7 16C7 11 12 10 17 11C23 10 26 13 24 18C22 23 19 28 14 31C11 29 8 21 7 16Z",
      "#e8914b",
      "#b96e3f",
    ],
    ["M9 15Q11 12 16 13M10 17Q11 21 13 23", "none", "#ffd08b"],
    ["M19 16 23 15M17 22 20 21", "none", "#bf6d3c"],
  ],
  energy: [
    [
      "M16 1.4C24.3 1.4 30.5 7.6 30.5 16S24 30.5 16 30.5 1.5 24.3 1.5 16 7.7 1.4 16 1.4Z",
      "#e8b448",
      "#b98634",
    ],
    ["M4.3 15.2A11.9 11.9 0 0 1 16.2 3.9", "none", "#fff1b6"],
    ["M7 22A11.4 11.4 0 0 0 25.8 17", "none", "#ce9336"],
    [
      "M16 6.4Q18.1 13.6 25.8 16Q18.4 18.6 16 25.6Q13.6 18.6 6.2 16Q13.9 13.4 16 6.4Z",
      "#fff4cb",
    ],
    ["M16 6.4 16 16 6.2 16Q13.9 13.4 16 6.4Z", "#fffbea"],
  ],
};
export function resourceIcon(kind) {
  const paths = shapes[kind].map(
    ([d, fill, stroke]) =>
      `<path d="${d}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"` : ""}/>`,
  );
  return `<svg viewBox="0 0 32 32" aria-hidden="true" class="resource-symbol">${paths.join("")}</svg>`;
}
const resources = new Map();
function sprite(kind, filled) {
  const key = filled ? kind : "empty";
  if (resources.has(key)) return resources.get(key);
  const tile = document.createElement("canvas");
  tile.width = tile.height = 96;
  const p = tile.getContext("2d");
  p.scale(3, 3);
  p.lineJoin = "round";
  p.lineCap = "round";
  p.lineWidth = 1.2;
  if (filled) {
    for (const [d, fill, stroke] of shapes[kind]) {
      const outline = new Path2D(d);
      if (fill !== "none") {
        p.fillStyle = fill;
        p.fill(outline);
      }
      if (stroke) {
        p.strokeStyle = stroke;
        p.stroke(outline);
      }
    }
  } else {
    p.beginPath();
    p.arc(16, 16, 13.3, 0, 2 * Math.PI);
    p.fillStyle = "#e0e6cc";
    p.fill();
    p.strokeStyle = "#a8b890";
    p.lineWidth = 1.6;
    p.stroke();
  }
  resources.set(key, tile);
  return tile;
}
export function drawResource(c, kind, x, y, size = 24, filled = true) {
  c.drawImage(sprite(kind, filled), x - size / 2, y - size / 2, size, size);
}
const vegetables = new Map();
export function drawGrowingCarrot(c, x, y, size, index) {
  const variant = (index * 37 + Math.floor(index / 7)) % 5;
  if (!vegetables.has(variant)) {
    const tile = document.createElement("canvas");
    tile.width = tile.height = 96;
    const p = tile.getContext("2d");
    p.scale(3, 3);
    p.translate(16, 21);
    p.rotate((variant - 2) * 0.053);
    const parts = [
      ["M-.8-2Q-9-7-10-16Q-2-15 1-4Z", "#60834c"],
      ["M-.5-3Q-4-13 1-20Q7-13 1-2Z", "#91b95f"],
      ["M1-2Q4-16 13-15Q11-7 1-2Z", "#72a451"],
      ["M-7-3Q-6-7 .5-6Q7-7 8-2Q8 1 5.5 4Q0 6-4 4Q-6 2-7-3Z", "#eea45e"],
      ["M-6-2Q-5-6 1-5M-4 0Q-3 2-2 3", "none", "#ffd8a0"],
      ["M3-1 6-2", "none", "#cc8147"],
    ];
    p.lineCap = "round";
    p.lineWidth = 1.2;
    for (const [d, fill, stroke] of parts) {
      const path = new Path2D(d);
      if (fill !== "none") {
        p.fillStyle = fill;
        p.fill(path);
      }
      if (stroke) {
        p.strokeStyle = stroke;
        p.stroke(path);
      }
    }
    vegetables.set(variant, tile);
  }
  c.drawImage(vegetables.get(variant), x - size / 2, y - size / 2, size, size);
}
