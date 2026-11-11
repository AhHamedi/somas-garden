// Each silhouette is drawn from the same artwork in portraits and on the stage.
const cast = [
  {
    color: "#de7064",
    light: "#ffc2a0",
    shade: "#b54050",
    foot: "#914a45",
    body: "M0-25C15-29 29-18 29-1C30 15 19 21 8 26Q1 29-1 34Q-4 29-9 27C-23 23-30 12-29-1C-29-16-17-27 0-25Z",
    crown: "radish",
  },
  {
    color: "#7299d1",
    light: "#c0deef",
    shade: "#5569ad",
    foot: "#4e638d",
    body: "M-1-28C8-27 15-22 22-12C31 1 28 18 18 24C11 30-12 30-21 22C-32 12-27-1-22-10C-16-21-8-25-1-28Z",
    crown: "cornflower",
  },
  {
    color: "#94b866",
    light: "#d7eba6",
    shade: "#658d56",
    foot: "#526d46",
    body: "M-6-27C8-31 18-22 20-11C22-4 29-3 30 9C31 22 16 31-3 28C-19 28-30 16-26 1C-23-12-21-22-6-27Z",
    crown: "pea",
  },
  {
    color: "#e6b755",
    light: "#ffdfa0",
    shade: "#cb8547",
    foot: "#9c7341",
    body: "M-3-26C12-27 21-17 23-4C27 5 32 8 27 17C19 30-18 31-25 18C-31 7-25 3-23-7C-21-17-14-25-3-26Z",
    crown: "daisy",
  },
  {
    color: "#71b7a9",
    light: "#c3ead5",
    shade: "#418b85",
    foot: "#467a69",
    body: "M-1-23C13-26 28-19 29-2C33 12 23 26 9 28C-3 30-21 28-28 17C-37-1-22-22-1-23Z",
    crown: "clover",
  },
  {
    color: "#b18ac8",
    light: "#e6c4e8",
    shade: "#8e6aa9",
    foot: "#795783",
    body: "M-3-29C8-30 20-21 22-8C23 0 29 8 24 17C18 30-15 32-24 19C-30 9-26 1-23-9C-20-20-13-27-3-29Z",
    crown: "lavender",
  },
];
export const colors = cast.map((plant) => plant.color);
const ink = "#263d35";
const leaf = (x, y, rotation, scale = 1, green = "#60966d") =>
  `<g transform="translate(${x} ${y}) rotate(${rotation}) scale(${scale})"><path d="M0 0C-10-1-15-10-14-20C-3-20 4-12 0 0Z" fill="${green}"/><path d="M-.2-1Q-5-10-11-16" fill="none" stroke="#e1ebb5" stroke-opacity=".56" stroke-width="1.1" stroke-linecap="round"/></g>`;
function flower(x, y, petals, radius, color, middle, pointy = false) {
  const petalsSvg = Array.from(
    { length: petals },
    (_, j) =>
      `<g transform="rotate(${(j * 360) / petals})">${
        pointy
          ? '<path d="M0 1Q-5-3-4-10L-1-9 1-13 2-9 5-10Q5-3 0 1Z" fill="' + color + '"/>'
          : '<ellipse cy="-6" rx="4.3" ry="7" fill="' + color + '"/>'
      }</g>`,
  ).join("");
  return `<g transform="translate(${x} ${y}) scale(${radius / 13})">${petalsSvg}<circle r="4" fill="${middle}"/><circle cx="-1" cy="-1" r="1.3" fill="#ffedaa"/></g>`;
}
function sprig(type) {
  const stem = (d) =>
    `<path d="${d}" fill="none" stroke="#557854" stroke-width="3" stroke-linecap="round"/>`;
  switch (type) {
    case "radish":
      return (
        stem("M-2-23Q-1-33 3-39") +
        leaf(0, -30, -14, 0.83, "#6b924f") +
        leaf(1, -33, 74, 1.12, "#739f55") +
        leaf(0, -29, 38, 0.84, "#91b561")
      );
    case "cornflower":
      return (
        stem("M0-26Q-3-38 6-44") +
        leaf(0, -34, -14, 0.59) +
        flower(7, -48, 7, 14, "#7795cc", "#efa746", true)
      );
    case "pea":
      return (
        stem("M-3-24Q-8-38 1-45Q11-54 12-47Q12-42 8-44") +
        leaf(-4, -32, 2, 1.02, "#799f51") +
        leaf(-5, -34, 83, 0.9, "#98b95f")
      );
    case "daisy":
      return (
        stem("M0-24Q5-35-2-42") +
        leaf(2, -32, 77, 0.7) +
        flower(-2, -45, 8, 14, "#fff9db", "#dfab49")
      );
    case "clover":
      return (
        stem("M1-22Q10-37 6-43") +
        [0, 120, 240]
          .map(
            (a) =>
              `<path transform="translate(6 -42) rotate(${a})" d="M0 0C-2-3-11-5-9-12Q-6-18-1-13Q3-19 7-14C11-9 4-3 0 0Z" fill="#71a370" stroke="#568867" stroke-width=".7"/>`,
          )
          .join("")
      );
    default:
      return (
        stem("M-1-27Q3-40 11-56") +
        leaf(1, -35, -8, 0.65, "#82a177") +
        leaf(3, -38, 84, 0.55, "#82a177") +
        [
          [6, -43, -48],
          [12, -46, 40],
          [8, -49, -44],
          [14, -52, 36],
          [11, -55, 12],
        ]
          .map(
            ([x, y, a], i) =>
              `<ellipse cx="${x}" cy="${y}" rx="3.3" ry="5.3" transform="rotate(${a} ${x} ${y})" fill="${i % 2 ? "#9676aa" : "#b197c5"}"/>`,
          )
          .join("")
      );
  }
}
function face(expression) {
  const smiling = expression === "catch";
  const eyes = [-1, 1]
    .map((side) => {
      const x = side * 9.5;
      if (smiling || expression === "blink")
        return `<path d="M${x - 3.4} 2Q${x} -2 ${x + 3.4} 2" fill="none" stroke="${ink}" stroke-width="2.7" stroke-linecap="round"/>`;
      return `<ellipse cx="${x}" cy=".2" rx="3.6" ry="4.9" fill="${ink}"/><circle cx="${x - 0.9}" cy="-1.4" r="1.3" fill="#fffdf1"/>`;
    })
    .join("");
  return (
    `<g fill="#df8175" opacity=".48"><ellipse cx="-17" cy="6" rx="4.4" ry="2.5"/><ellipse cx="17" cy="6" rx="4.4" ry="2.5"/></g>${eyes}` +
    (smiling
      ? '<path d="M-4 8Q0 10 4 8Q3 15 0 15Q-3 15-4 8Z" fill="#613d36"/><path d="M-2 13Q0 11 2 13Q0 16-2 13Z" fill="#e7a088"/>'
      : '<path d="M-3.6 9Q0 13 3.6 9" fill="none" stroke="#435440" stroke-width="1.7" stroke-linecap="round"/>')
  );
}
function torso(plant, expression, id) {
  return `<defs><radialGradient id="${id}" cx=".31" cy=".22" r=".84"><stop stop-color="${plant.light}"/><stop offset=".54" stop-color="${plant.color}"/><stop offset="1" stop-color="${plant.shade}"/></radialGradient></defs>
  <g fill="${plant.foot}"><path d="M-16 22Q-19 26-22 29Q-23 33-15 33Q-7 33-6 28L-7 23Z"/><path d="M16 22Q19 26 22 29Q23 33 15 33Q7 33 6 28L7 23Z"/></g>
  <g fill="${plant.shade}"><path d="M-23-2Q-34 1-34 10Q-33 15-28 12L-20 6Z"/><path d="M23-2Q34 1 34 10Q33 15 28 12L20 6Z"/></g>
  <path d="${plant.body}" fill="url(#${id})" stroke="${plant.shade}" stroke-width="1.1"/>
  <path d="M-18-9Q-16-16-9-18" fill="none" stroke="#fffdeb" stroke-width="2.2" opacity=".47" stroke-linecap="round"/><circle cx="-19.1" cy="-5.6" r="1.25" fill="#fffdeb" opacity=".57"/>
  <g fill="${plant.shade}" opacity=".28"><circle cx="-17" cy="17" r="1.4"/><circle cx="-13.5" cy="19" r=".85"/><circle cx="18" cy="13" r="1.1"/></g>${face(expression)}`;
}
const ghostPath =
  "M0-43C5-29 12-21 19-14C28-2 23 15 11 20Q6 23 10 32L0 27Q-3 31-7 32L-8 23C-26 16-26-1-16-13Q-4-25 0-43Z";
function spirit(plant) {
  return `<path d="${ghostPath}" fill="${plant.light}" stroke="${plant.shade}" stroke-width="2"/><ellipse cx="-7" cy="0" rx="3" ry="5" fill="${ink}"/><ellipse cx="7" cy="0" rx="3" ry="5" fill="${ink}"/><ellipse cy="10" rx="2.5" ry="3.5" fill="${ink}"/>`;
}
let portraitId = 0;
export function portrait(index, dead = false) {
  const plant = cast[index] || cast[0];
  const art = dead
    ? spirit(plant)
    : torso(plant, "rest", "garden-bud-" + ++portraitId) + sprig(plant.crown);
  return `<svg viewBox="-42 -64 84 103" aria-hidden="true" focusable="false">${art}</svg>`;
}
const sprites = new Map();
function sprite(index, layer) {
  const key = index + ":" + layer;
  if (sprites.has(key)) return sprites.get(key);
  const plant = cast[index];
  const art =
    layer === "crown"
      ? sprig(plant.crown)
      : layer === "ghost"
        ? spirit(plant)
        : torso(plant, layer, "cap");
  const image = new Image();
  image.src =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="288" height="330" viewBox="-48 -69 96 110">${art}</svg>`,
    );
  sprites.set(key, image);
  return image;
}
// Decode each pose as soon as the scene opens. Cold devices can still paint
// a complete character synchronously while the browser prepares the SVGs.
export function prepareCharacterSprites() {
  for (let index = 0; index < cast.length; index++) {
    for (const layer of ["rest", "crown", "catch", "blink", "ghost"]) {
      const image = sprite(index, layer);
      image.decode?.().catch(() => {});
    }
  }
}
function paintFallback(c, index, layer) {
  const plant = cast[index];
  c.save();
  if (layer === "crown") {
    c.fillStyle = "#72975e";
    c.fill(new Path2D("M-2-23Q-5-33-12-38Q-1-41 1-31Q8-45 16-42Q15-32 2-29L1-23Z"));
  } else {
    const ghost = layer === "ghost";
    const gradient = c.createRadialGradient(-10, -13, 0, 0, 2, 35);
    gradient.addColorStop(0, plant.light);
    gradient.addColorStop(0.58, plant.color);
    gradient.addColorStop(1, plant.shade);
    if (!ghost) {
      c.fillStyle = plant.foot;
      c.fill(new Path2D("M-16 22Q-25 32-16 33Q-8 33-6 26ZM16 22Q25 32 16 33Q8 33 6 26Z"));
    }
    c.fillStyle = ghost ? plant.light : gradient;
    c.strokeStyle = plant.shade;
    c.lineWidth = 1;
    const outline = new Path2D(ghost ? ghostPath : plant.body);
    c.fill(outline);
    c.stroke(outline);
    c.fillStyle = ink;
    c.strokeStyle = ink;
    c.lineCap = "round";
    c.lineWidth = 2.5;
    for (const x of [-9.5, 9.5]) {
      c.beginPath();
      if (layer === "catch" || layer === "blink") {
        c.moveTo(x - 3, 2);
        c.quadraticCurveTo(x, -2, x + 3, 2);
        c.stroke();
      } else {
        c.ellipse(x, 0, 3.5, 4.8, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.lineWidth = 1.7;
    c.beginPath();
    c.moveTo(-3, 9);
    c.quadraticCurveTo(0, 13, 3, 9);
    c.stroke();
  }
  c.restore();
}
function paintSprite(c, index, layer) {
  const image = sprite(index, layer);
  if (image.complete && image.naturalWidth) {
    c.drawImage(image, -48, -69, 96, 110);
    return;
  }
  if (layer === "catch" || layer === "blink") {
    const rest = sprite(index, "rest");
    if (rest.complete && rest.naturalWidth) {
      c.drawImage(rest, -48, -69, 96, 110);
      return;
    }
  }
  paintFallback(c, index, layer);
}
export function drawGhost(c, x, y, index, scale, alpha) {
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  c.globalAlpha = alpha;
  paintSprite(c, index, "ghost");
  c.restore();
}
function mealGesture(c, plant, meal) {
  const { side, grasp, approach, bitten, chew } = meal;
  // Touch the food with the near hand and give the cheek two diminishing
  // chews. The ordinary pose underneath also works before images decode.
  if (!bitten && approach > 0.38) {
    const gape = meal.reduced ? 1 : smoothOpen(approach);
    c.fillStyle = "#6e4340";
    c.beginPath();
    c.ellipse(0, 10, 4.5, 2 + 3.2 * gape, 0, 0, 2 * Math.PI);
    c.fill();
    c.fillStyle = "#e9a08d";
    c.beginPath();
    c.ellipse(0.35, 11.4 + gape * 1.2, 2.3, 1, 0, 0, 2 * Math.PI);
    c.fill();
  }
  if (chew > 0) {
    c.fillStyle = plant.light + "88";
    c.beginPath();
    c.ellipse(
      side * 16,
      9,
      4.5 + 3.2 * chew,
      2.8 + 2.2 * chew,
      side * 0.12,
      0,
      2 * Math.PI,
    );
    c.fill();
    c.strokeStyle = plant.shade;
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(side * 17, 14.5);
    c.quadraticCurveTo(side * (21 + chew * 3), 14, side * (22 + chew), 10.5);
    c.stroke();
  }
  if (grasp > 0) {
    const tipX = side * (29 - 13.5 * grasp),
      tipY = 10 - 1.4 * grasp;
    c.lineCap = "round";
    c.lineWidth = 6.8;
    c.strokeStyle = plant.shade;
    c.beginPath();
    c.moveTo(side * 29, 9);
    c.quadraticCurveTo(side * 26, 16 + 2 * grasp, tipX, tipY);
    c.stroke();
    c.fillStyle = plant.color;
    c.beginPath();
    c.ellipse(tipX, tipY, 4, 3.1, side * 0.3, 0, 2 * Math.PI);
    c.fill();
  }
}
function smoothOpen(t) {
  const value = Math.max(0, Math.min(1, (t - 0.38) / 0.55));
  return value * value * (3 - 2 * value);
}
export function drawSeedling(c, x, y, index, time, pose = {}) {
  const { size = 1, lift = 0, impact = 0, lean = 0, reduced = false, meal = null } = pose;
  const breathe = reduced ? 0 : Math.sin(time * 1.8 + index) * 0.75;
  const blink = !reduced && (time + index * 0.77) % 4.1 > 3.97;
  c.save();
  c.translate(x, y);
  c.scale(size, size);
  c.fillStyle = "#3c553423";
  c.beginPath();
  c.ellipse(2, 33, 24 - lift * 0.28, 5.2, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#344c3420";
  c.beginPath();
  c.ellipse(1, 33, 16, 3, 0, 0, Math.PI * 2);
  c.fill();
  c.translate(0, 30 - lift);
  const chew = meal && !reduced ? meal.chew : 0;
  c.scale(1 + impact * 0.045 + chew * 0.032, 1 - impact * 0.055 - chew * 0.042);
  c.rotate(lean);
  c.translate(0, -30 + breathe);
  const restingLayer = impact > 0.43 ? "catch" : blink ? "blink" : "rest";
  const layer = meal?.bitten ? (meal.chew > 0.15 ? "blink" : "catch") : restingLayer;
  paintSprite(c, index, layer);
  if (meal) mealGesture(c, cast[index], meal);
  c.translate(0, -25);
  c.rotate(
    reduced ? 0 : Math.sin(time * 1.9 + index) * 0.026 - lean * 0.55 + impact * 0.1,
  );
  c.translate(0, 25);
  paintSprite(c, index, "crown");
  c.restore();
}
