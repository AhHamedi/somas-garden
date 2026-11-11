import { defaults, esc, MAX_DAYS, options } from "./setup-model.js";
import { resourceIcon } from "./icons.js";

function number(label, key, value, min, max, help = "") {
  return `<label class="gs-input">${esc(label)}<input type="number" name="${key}" min="${min}" max="${max}" value="${esc(value)}" required step="1">${help ? `<small>${help}</small>` : ""}</label>`;
}
function chooser(key, value, isPrice) {
  const modes = isPrice
    ? { fixed: "Fixed", random: "Random range", density: "Field density" }
    : { fixed: "Fixed", random: "Random range" };
  const min = isPrice ? 1 : 0,
    max = isPrice ? 12 : 24;
  return `<label class="gs-input">${isPrice ? "Energy price" : "Daily sunlight"}<select name="${key}.mode">${options(modes, value.mode)}</select></label>
    <fieldset data-when="${key}.fixed">${number(isPrice ? "Energy per carrot" : "Energy at dawn", `${key}.value`, value.value, min, max)}</fieldset>
    <fieldset data-when="${key}.random"><div class="gs-grid">${number("Minimum", `${key}.min`, value.min, min, max)}${number("Maximum", `${key}.max`, value.max, min, max)}</div>
    <label class="gs-check"><input type="checkbox" name="${key}.perAgent" ${value.perAgent ? "checked" : ""}><span>Randomise per agent<small>Switch off to share one draw each day.</small></span></label></fieldset>
    ${isPrice ? `<fieldset data-when="price.density"><div class="gs-grid">${number("Cost when empty", "price.empty", value.empty, 1, 12)}${number("Cost when full", "price.full", value.full, 1, 12)}</div><figure class="gs-price-chart"><svg aria-hidden="true" viewBox="0 0 180 32" preserveAspectRatio="none"><path d="M2 28H178" stroke="#ced9c2"/><path data-price-curve fill="none" stroke="#658452" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" vector-effect="non-scaling-stroke"/></svg><figcaption><output class="gs-price-preview"></output></figcaption></figure></fieldset>` : ""}`;
}
export function gardenRules(settings, { apply, shell }) {
  const s = structuredClone(settings);
  function draw() {
    const { main, foot } = shell("Garden rules", "setup");
    main.innerHTML = `<form id="gs-rules-form">
      <div class="gs-duration">
        <label for="gs-days">Days to play</label>
        <input id="gs-days" name="roundLimit" type="number" min="1" max="${MAX_DAYS}" step="1" value="${esc(s.roundLimit)}" aria-describedby="gs-days-note" required>
        <p class="gs-note" id="gs-days-note">Choose 1–${MAX_DAYS} days. The garden ends early if every amoeboid dies.</p>
      </div>
      <section class="gs-rule-section"><div class="gs-section-title"><span class="gs-resource">${resourceIcon("energy")}</span><h3>Sunlight</h3></div>
      <div class="gs-rule-columns"><div>${chooser("sunlight", s.sunlight, false)}</div>${number("Energy capacity per amoeboid", "energyCapacity", s.energyCapacity, 0, 24, "Unused energy stays in the pouch. Sunlight tops it up at dawn.")}</div></section>
      <section class="gs-rule-section"><div class="gs-section-title"><span class="gs-resource">${resourceIcon("carrot")}</span><h3>Food & supper</h3></div>
      <div class="gs-grid">${number("Carrots needed each day", "dailyFood", s.dailyFood, 0, 10, "Set to 0 to turn off hunger.")}${number("Starting carrots per amoeboid", "startingPantry", s.startingPantry, 0, 60, "Individual amoeboids can have their own amount.")}</div>
      <label class="gs-check"><input type="checkbox" name="carryFood" ${s.carryFood ? "checked" : ""}><span>Carry leftovers into tomorrow<small>With this off, leftover pantry carrots expire after supper.</small></span></label></section>
      <section class="gs-rule-section"><div class="gs-section-title"><span class="gs-field-mark" aria-hidden="true">❧</span><h3>Field & planting</h3></div>
      <div class="gs-grid">${number("Field capacity", "fieldCapacity", s.fieldCapacity, 1, 120)}${number("Starting carrots in field", "startingField", s.startingField, 0, 120)}</div>
      ${number("Minimum carrots for planting", "plantingMinimum", s.plantingMinimum, 0, 120, "Below this stock, amoeboids can harvest but cannot plant.")}
      ${chooser("price", s.price, true)}<p class="gs-note">The first energy given locks the price of that carrot until it grows.</p></section></form>`;
    foot.innerHTML =
      '<button type="button" class="gs-text" data-reset>Use default rules</button><button type="submit" form="gs-rules-form" class="primary">Save rules</button>';
    const form = main.querySelector("form"),
      fields = form.elements;
    function update() {
      for (const set of form.querySelectorAll("[data-when]")) {
        const [kind, mode] = set.dataset.when.split(".");
        set.hidden = set.disabled = fields.namedItem(`${kind}.mode`).value !== mode;
      }
      const capacity = fields.fieldCapacity.valueAsNumber;
      fields.startingField.max = fields.plantingMinimum.max = Number.isFinite(capacity)
        ? capacity
        : 120;
      const empty = fields.namedItem("price.empty").valueAsNumber,
        full = fields.namedItem("price.full").valueAsNumber;
      const chart = form.querySelector(".gs-price-chart");
      chart.hidden =
        !Number.isInteger(capacity) ||
        capacity < 1 ||
        capacity > 120 ||
        ![empty, full].every((n) => Number.isInteger(n) && n >= 1 && n <= 12);
      if (!chart.hidden) {
        const priceAt = (stock) =>
          Math.round((empty * (capacity - stock) + full * stock) / capacity);
        const low = Math.min(empty, full),
          span = Math.abs(full - empty);
        const y = (stock) => (span ? 26 - (21 * (priceAt(stock) - low)) / span : 15);
        let line = `M2 ${y(0)}`;
        for (let stock = 1; stock <= capacity; stock++) {
          line += `H${2 + (stock / capacity) * 176}V${y(stock)}`;
        }
        chart.querySelector("[data-price-curve]").setAttribute("d", line);
        const halfway = Math.round(capacity / 2);
        chart.querySelector("output").textContent =
          `With ${halfway} of ${capacity} carrots in the field, planting costs ${priceAt(halfway)} energy.`;
      }
      for (const key of ["sunlight", "price"]) {
        const low = fields.namedItem(`${key}.min`),
          high = fields.namedItem(`${key}.max`);
        high.setCustomValidity(
          low.valueAsNumber > high.valueAsNumber
            ? "Choose a maximum at least as high as the minimum."
            : "",
        );
      }
    }
    form.addEventListener("input", update);
    update();
    foot.querySelector("[data-reset]").onclick = () => {
      Object.assign(s, structuredClone(defaults));
      draw();
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      const result = structuredClone(s);
      for (const field of form.querySelectorAll("[name]")) {
        if (field.matches(":disabled")) continue;
        const parts = field.name.split("."),
          target = parts.length === 1 ? result : result[parts[0]];
        target[parts.at(-1)] =
          field.type === "checkbox"
            ? field.checked
            : field.type === "number"
              ? field.valueAsNumber
              : field.value;
      }
      apply(result);
    };
  }
  draw();
}
