import {
  actionText,
  describe,
  esc,
  facts,
  modes,
  operators,
  options,
  template,
} from "./setup-model.js";

const input = (label, key, value, min, max) =>
  `<label class="gs-input">${esc(label)}<input type="number" name="${esc(key)}" value="${esc(value)}" min="${min}" max="${max}" required></label>`;
const select = (label, key, items, value) =>
  `<label class="gs-input">${esc(label)}<select name="${esc(key)}">${options(items, value)}</select></label>`;
const listings = {
  simple: "Make the same request and offer every day.",
  adaptive: "Check conditions in order. The first match decides the action.",
  memory: "Use past outcomes and a value your amoeboid carries into tomorrow.",
};
function actionPanel(action, key, spec) {
  const foods = {
    ...Object.fromEntries(
      Array.from({ length: 11 }, (_, i) => [i, `${i} carrot${i === 1 ? "" : "s"}`]),
    ),
    supper: "Enough for supper",
    all: "As much as possible",
  };
  const energies = {
    ...Object.fromEntries(Array.from({ length: 25 }, (_, i) => [i, `${i} energy`])),
    all: "All available energy",
  };
  return `<div class="gs-grid">${select("Request", `${key}.food`, foods, action.food)}${select("Offer", `${key}.energy`, energies, action.energy)}</div>${spec.mode !== "memory" ? "" : `<div class="gs-memory-action">${select("After deciding", `${key}.memoryOp`, { keep: "Keep stored value", set: "Set stored value to", add: "Add to stored value" }, action.memory?.op ?? "keep")}<div data-memory-amount ${action.memory ? "" : "hidden"}>${input("Amount", `${key}.memoryValue`, action.memory?.value ?? 1, -10000, 10000)}</div></div>`}`;
}
const fieldForFact = {
  field: "PatchFood",
  perAgent: "PatchFood",
  pantry: "Pantry",
  energy: "Energy",
  price: "Price",
  day: "Round",
  lastFood: "LastFood",
  lastEnergy: "LastEnergy",
  lastEaten: "LastEaten",
  totalFood: "TotalFood",
  totalEnergy: "TotalEnergy",
  totalEaten: "TotalEaten",
  memory: "memory",
};
export function agentBuilder({
  draft,
  useOnSave,
  settings,
  seatCount,
  shell,
  onBack,
  onSave,
  api,
}) {
  const days = settings.roundLimit;
  const previewFields = {
    Round: ["Day", 1, days],
    PatchFood: ["Field carrots", 0, 120],
    AgentCount: ["Living amoeboids", 1, 6],
    Energy: ["Available energy", 0, 24],
    Pantry: ["Pantry carrots", 0, 60 + days * 10],
    DailyFood: ["Daily food needed", 0, 10],
    Price: ["Quoted price", 1, 12],
    LastFood: ["Previous harvest", 0, 10],
    LastEnergy: ["Previous contribution", 0, 24],
    LastEaten: ["Previous supper", 0, 10],
    TotalFood: ["Total harvest", 0, days * 10],
    TotalEnergy: ["Total contribution", 0, days * 24],
    TotalEaten: ["Total eaten", 0, days * 10],
    memory: ["Stored value", -1000000, 1000000],
  };
  const starting = draft?.builder ? structuredClone(draft.builder) : template("simple");
  let mode = starting.mode,
    name = draft?.name || "",
    tabSpecs = { [mode]: starting },
    incarnation = 0;
  let previewOpen = false,
    lastPreview = "";
  const sample = {
    Round: 1,
    PatchFood: settings.startingField,
    AgentCount: seatCount,
    Energy: Math.min(
      settings.energyCapacity,
      settings.sunlight.mode === "random"
        ? settings.sunlight.min
        : settings.sunlight.value,
    ),
    Price:
      settings.price.mode === "random"
        ? settings.price.min
        : settings.price.mode === "fixed"
          ? settings.price.value
          : Math.round(
              settings.price.empty +
                ((settings.price.full - settings.price.empty) * settings.startingField) /
                  settings.fieldCapacity,
            ),
    Pantry: settings.startingPantry,
    DailyFood: settings.dailyFood,
    LastFood: 0,
    LastEnergy: 0,
    LastEaten: 0,
    TotalFood: 0,
    TotalEnergy: 0,
    TotalEaten: 0,
    memory: 0,
  };
  function render(focusName) {
    const epoch = ++incarnation,
      spec = tabSpecs[mode];
    const { main, foot, status, isCurrent } = shell(
      "Agent creator",
      "builder",
      onBack,
      epoch === 1,
    );
    const allowedFacts = Object.fromEntries(
      Object.entries(facts)
        .filter(
          ([key]) =>
            mode === "memory" ||
            ["field", "perAgent", "pantry", "energy", "price", "day"].includes(key),
        )
        .map(([key, label]) => [
          key,
          key === "memory" ? spec.memoryName || label : label,
        ]),
    );
    const checks = spec.rules || [];
    const ruleCards = checks
      .map(
        (rule, i) =>
          `<section class="gs-rule-card"><header><h4>Rule ${i + 1}</h4><div class="gs-order"><button type="button" data-shift="${i}:-1" ${!i ? "disabled" : ""} aria-label="Move rule ${i + 1} up">↑</button><button type="button" data-shift="${i}:1" ${i === checks.length - 1 ? "disabled" : ""} aria-label="Move rule ${i + 1} down">↓</button><button type="button" data-remove="${i}" aria-label="Remove rule ${i + 1}">×</button></div></header><div class="gs-condition">${select("When", `rule.${i}.fact`, allowedFacts, rule.fact)}${select("Comparison", `rule.${i}.op`, operators, rule.op)}${input("Value", `rule.${i}.value`, rule.value, -1000000, 1000000)}</div>${actionPanel(rule.action, `rule.${i}.action`, spec)}</section>`,
      )
      .join("");
    const previewKeys = new Set([
      "Round",
      "PatchFood",
      "AgentCount",
      "Energy",
      "Pantry",
      "DailyFood",
    ]);
    for (const { fact } of checks) previewKeys.add(fieldForFact[fact]);
    if (mode === "memory") previewKeys.add("memory");
    main.innerHTML = `<form id="gs-builder"><label class="gs-input">Agent name<input required maxlength="40" name="name" placeholder="e.g. Clover keeper" value="${esc(name)}" autocomplete="off"></label>
      <div class="gs-mode" role="group" aria-label="Strategy mode">${Object.entries(modes)
        .map(
          ([key, label]) =>
            `<button type="button" data-mode="${key}" aria-pressed="${key === mode}">${label}</button>`,
        )
        .join("")}</div>
      <p class="gs-note gs-mode-note">${listings[mode]}</p>
      ${mode === "memory" ? `<label class="gs-input">Memory name<input name="memoryName" maxlength="40" value="${esc(spec.memoryName)}"><small>Starts at zero for each amoeboid in a new garden.</small></label>` : ""}
      <div class="gs-rules-list">${ruleCards}</div>
      ${mode !== "simple" ? `<button type="button" class="gs-line" data-add ${checks.length >= 4 ? "disabled" : ""}>＋ Add a rule${checks.length >= 4 ? " · 4 of 4" : ""}</button>` : ""}
      <section class="gs-action-card"><h4>${mode === "simple" ? "Each day" : "Otherwise"}</h4>${actionPanel(spec.fallback, "fallback", spec)}</section>
      <p class="gs-description"></p></form>
      <details class="gs-try" ${previewOpen ? "open" : ""}><summary>Try a day</summary><form class="gs-preview-form"><p class="gs-note">Give your amoeboid a sample morning to see its decision.</p><div class="gs-sample-fields">${Object.keys(
        previewFields,
      )
        .filter((k) => previewKeys.has(k))
        .map((k) => {
          const [label, min, max] = previewFields[k];
          return input(label, k, sample[k], min, max);
        })
        .join(
          "",
        )}</div><button class="secondary" type="submit">Test decision</button><output class="gs-test-result" aria-live="polite">${esc(lastPreview)}</output></form></details>`;
    foot.innerHTML = `<button type="button" class="gs-text" data-export>Download Go</button><button type="submit" form="gs-builder" class="primary">${useOnSave ? "Save & use strategy" : "Save private agent"}</button>`;
    const form = main.querySelector("#gs-builder"),
      details = main.querySelector("details"),
      preview = main.querySelector(".gs-preview-form");
    const val = (key) => form.elements.namedItem(key).value,
      numOrText = (raw) => (/^\d+$/.test(raw) ? Number(raw) : raw);
    function readAction(key) {
      const action = {
        food: numOrText(val(`${key}.food`)),
        energy: numOrText(val(`${key}.energy`)),
      };
      if (mode === "memory") {
        const op = val(`${key}.memoryOp`),
          amount = form.elements.namedItem(`${key}.memoryValue`);
        amount.disabled = op === "keep";
        amount.closest("[data-memory-amount]").hidden = amount.disabled;
        if (op !== "keep")
          action.memory = {
            op,
            value: amount.value === "" ? "" : Number(amount.value),
          };
      }
      return action;
    }
    function sync() {
      name = val("name");
      if (mode === "memory") spec.memoryName = val("memoryName");
      for (const [i, rule] of checks.entries()) {
        rule.fact = val(`rule.${i}.fact`);
        rule.op = val(`rule.${i}.op`);
        const v = val(`rule.${i}.value`);
        rule.value = v === "" ? "" : Number(v);
        rule.action = readAction(`rule.${i}.action`);
      }
      spec.fallback = readAction("fallback");
      form.querySelector(".gs-description").textContent = describe(spec);
    }
    function readSample() {
      previewOpen = details.open;
      for (const field of preview.elements)
        if (field.name) sample[field.name] = field.valueAsNumber;
    }
    function resetResult() {
      lastPreview = "";
      preview.querySelector("output").textContent = "";
    }
    form.oninput = (e) => {
      sync();
      if (e.target.name === "memoryName") {
        for (const option of form.querySelectorAll('option[value="memory"]'))
          option.textContent = spec.memoryName || "Stored value";
      }
      resetResult();
    };
    form.onchange = (e) => {
      if (e.target.name.endsWith(".fact")) {
        readSample();
        render(e.target.name);
      }
    };
    preview.oninput = () => {
      readSample();
      resetResult();
    };
    function rerender(focusTarget) {
      readSample();
      resetResult();
      render(focusTarget);
    }
    for (const button of main.querySelectorAll("[data-mode]"))
      button.onclick = () => {
        if (button.dataset.mode === mode) return;
        mode = button.dataset.mode;
        tabSpecs[mode] ??= template(mode);
        rerender(`[data-mode="${mode}"]`);
      };
    for (const button of main.querySelectorAll("[data-shift]"))
      button.onclick = () => {
        const [i, delta] = button.dataset.shift.split(":").map(Number),
          to = i + delta;
        [checks[i], checks[to]] = [checks[to], checks[i]];
        rerender(`rule.${to}.fact`);
      };
    for (const button of main.querySelectorAll("[data-remove]"))
      button.onclick = () => {
        checks.splice(Number(button.dataset.remove), 1);
        rerender("[data-add]");
      };
    const add = main.querySelector("[data-add]");
    if (add)
      add.onclick = () => {
        checks.push({
          fact: "field",
          op: "lt",
          value: 10,
          action: { food: 1, energy: "all" },
        });
        rerender(`rule.${checks.length - 1}.fact`);
      };
    const validSpec = () =>
      [...form.elements]
        .filter((x) => x.name && x.name !== "name" && !x.disabled)
        .every((x) => x.reportValidity());
    async function tool(button, includeSample, work) {
      if (!validSpec()) return;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      const old = button.textContent;
      button.textContent = "Working…";
      const requestSpec = JSON.stringify(spec),
        requestSample = JSON.stringify(sample);
      try {
        const { memory, ...view } = sample;
        const data = await api(
          "builder",
          includeSample
            ? {
                builder: spec,
                view: {
                  ...view,
                  FieldCapacity: settings.fieldCapacity,
                  EnergyCapacity: settings.energyCapacity,
                },
                memory,
              }
            : { builder: spec },
        );
        if (
          isCurrent() &&
          epoch === incarnation &&
          requestSpec === JSON.stringify(spec) &&
          (!includeSample || requestSample === JSON.stringify(sample))
        )
          work(data);
      } catch (err) {
        if (isCurrent()) status(err.message, true);
      } finally {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        button.textContent = old;
      }
    }
    preview.onsubmit = (e) => {
      e.preventDefault();
      readSample();
      tool(preview.querySelector("button"), true, (result) => {
        const { Food, Energy } = result.action;
        const matched =
          result.matchedRule >= 0
            ? `Rule ${result.matchedRule + 1}`
            : mode === "simple"
              ? "Daily action"
              : "Otherwise";
        const memory =
          mode === "memory"
            ? ` ${spec.memoryName || "Stored value"} tomorrow: ${result.memory}.`
            : "";
        lastPreview = `${matched} · ${actionText({ food: Food, energy: Energy })}${memory}`;
        const output = preview.querySelector("output");
        output.textContent = lastPreview;
        output.scrollIntoView({ block: "nearest", behavior: "instant" });
      });
    };
    const download = foot.querySelector("[data-export]");
    download.onclick = () =>
      tool(download, false, (result) => {
        const url = URL.createObjectURL(
            new Blob([result.source], { type: "text/plain" }),
          ),
          a = document.createElement("a");
        a.href = url;
        a.download =
          (name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, "-")
            .replace(/^-+|-+$/g, "") || "garden-agent") + ".go";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        status("Go file ready.");
      });
    form.onsubmit = (e) => {
      e.preventDefault();
      sync();
      if (!name.trim()) {
        form.elements.name.setCustomValidity("Give your agent a name.");
        form.elements.name.reportValidity();
        form.elements.name.setCustomValidity("");
        return;
      }
      onSave(name.trim(), structuredClone(spec));
    };
    sync();
    if (focusName)
      (focusName.startsWith("[")
        ? main.querySelector(focusName)
        : form.elements.namedItem(focusName)
      )?.focus();
  }
  render();
}
