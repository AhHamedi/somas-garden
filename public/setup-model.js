export const MAX_DAYS = 50;
export const defaults = {
  roundLimit: 30,
  sunlight: { mode: "fixed", value: 6, min: 0, max: 6, perAgent: false },
  energyCapacity: 6,
  dailyFood: 1,
  carryFood: false,
  startingPantry: 0,
  fieldCapacity: 60,
  startingField: 60,
  plantingMinimum: 0,
  price: {
    mode: "fixed",
    value: 2,
    min: 1,
    max: 3,
    perAgent: false,
    empty: 3,
    full: 1,
  },
};
export const examples = [
  {
    id: "cooperate",
    name: "Friendly",
    description: "Asks for 2 carrots and offers 4 energy each day.",
  },
  {
    id: "greedy",
    name: "Greedy",
    description: "Asks for 10 carrots and keeps its energy.",
  },
  {
    id: "random",
    name: "Random",
    description: "Draws a new harvest request and energy offer each day.",
  },
];
export const modes = {
  simple: "Simple",
  adaptive: "Adaptive",
  memory: "Memory",
};
export const facts = {
  field: "Carrots in the field",
  perAgent: "Carrots per living amoeboid",
  pantry: "Carrots in my pantry",
  energy: "My energy",
  price: "Price of a new carrot",
  day: "Day number",
  lastFood: "My previous harvest",
  lastEnergy: "My previous contribution",
  lastEaten: "My previous supper",
  totalFood: "My total harvest",
  totalEnergy: "My total contribution",
  totalEaten: "My total eaten",
  memory: "Stored value",
};
export const operators = {
  lt: "is below",
  lte: "is at most",
  eq: "equals",
  gte: "is at least",
  gt: "is above",
};
export const MAX_SEATS = 6;
export const newId = () => crypto.randomUUID();
const copy = (value) => structuredClone(value);
export function newSeat(roster) {
  let n = 1;
  while (roster.some((seat) => seat.name === `Amoeboid ${n}`)) n++;
  const appearance = Array.from({ length: MAX_SEATS }, (_, i) => i).find(
    (i) => !roster.some((seat) => seat.appearance === i),
  );
  return {
    id: newId(),
    name: `Amoeboid ${n}`,
    strategy: "cooperate",
    appearance,
  };
}
export function template(mode) {
  const fallback = { food: 2, energy: 4 };
  if (mode === "simple") return { mode, fallback };
  if (mode === "adaptive")
    return {
      mode,
      rules: [
        {
          fact: "perAgent",
          op: "lt",
          value: 2,
          action: { food: 1, energy: "all" },
        },
      ],
      fallback: { food: 2, energy: "all" },
    };
  return {
    mode,
    memoryName: "Harvest tally",
    rules: [
      {
        fact: "totalFood",
        op: "gte",
        value: 10,
        action: { food: 2, energy: 6 },
      },
    ],
    fallback,
  };
}
export function actionText(action) {
  const food =
    action.food === "supper"
      ? "enough carrots for supper"
      : action.food === "all"
        ? "up to 10 carrots"
        : `${action.food} carrot${action.food === 1 ? "" : "s"}`;
  return `Ask for ${food} and offer ${action.energy === "all" ? "all available energy" : `${action.energy} energy`}.`;
}
export function describe(builder) {
  if (!builder.rules?.length) return actionText(builder.fallback);
  const rule = builder.rules[0];
  const fact =
    rule.fact === "memory" ? builder.memoryName || "Stored value" : facts[rule.fact];
  const first = `When ${fact.toLowerCase()} ${operators[rule.op]} ${rule.value}, ${actionText(rule.action).replace(/^Ask/, "ask")}`;
  return builder.rules.length === 1
    ? `${first} Otherwise, ${actionText(builder.fallback).replace(/^Ask/, "ask")}`
    : `${first} Otherwise, checks ${builder.rules.length - 1} more ${builder.rules.length === 2 ? "rule" : "rules"}.`;
}
export const esc = (val) =>
  String(val ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
export const options = (entries, value) =>
  Object.entries(entries)
    .map(
      ([key, label]) =>
        `<option value="${esc(key)}"${String(value) === key ? " selected" : ""}>${esc(label)}</option>`,
    )
    .join("");
export function freshState() {
  const roster = [];
  while (roster.length < MAX_SEATS) roster.push(newSeat(roster));
  return { version: 1, roster, settings: copy(defaults), drafts: [] };
}
const storageKey = "somas.garden.setup.v1";
export function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(storageKey));
    if (
      s?.version === 1 &&
      Array.isArray(s.roster) &&
      s.roster.length >= 1 &&
      s.roster.length <= MAX_SEATS &&
      s.roster.every(
        (x) =>
          x &&
          typeof x.id === "string" &&
          typeof x.name === "string" &&
          typeof x.strategy === "string",
      ) &&
      Array.isArray(s.drafts) &&
      s.drafts.every(
        (d) =>
          d &&
          d.id &&
          typeof d.name === "string" &&
          d.builder?.mode in modes &&
          d.builder?.fallback,
      ) &&
      s.settings?.sunlight &&
      s.settings?.price
    ) {
      if (
        !Number.isInteger(s.settings.roundLimit) ||
        s.settings.roundLimit < 1 ||
        s.settings.roundLimit > MAX_DAYS
      )
        s.settings.roundLimit = defaults.roundLimit;
      return s;
    }
  } catch {
    /* A fresh garden is usable with storage disabled. */
  }
  return freshState();
}
export function storeState(s) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
export function runInput(state) {
  return {
    settings: copy(state.settings),
    roster: state.roster.map(({ strategy, strategyName, ...seat }) => {
      const draft = state.drafts.find((d) => d.id === strategy);
      return draft ? { ...seat, builder: copy(draft.builder) } : { ...seat, strategy };
    }),
  };
}
