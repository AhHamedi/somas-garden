export const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const builtins = {
  cooperate: "Friendly",
  greedy: "Greedy",
  random: "Random",
};
const strategyId = (id) =>
  typeof id === "string" && (uuid.test(id) || Object.hasOwn(builtins, id));
const object = (value) => value && typeof value === "object" && !Array.isArray(value);

export function agentName(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 40)
    throw new Error("Give your agent a name (up to 40 characters).");
  return value.trim();
}

// Only these seat fields may cross from a browser into the trusted engine.
export function readRun(input) {
  if (!object(input)) throw new Error("Choose a garden setup.");
  if (
    input.seed !== undefined &&
    (!Number.isSafeInteger(input.seed) || input.seed < 0 || input.seed > 1000000)
  )
    throw new Error("Choose a seed from 0 to 1,000,000.");
  const seed = input.seed ?? Math.floor(Math.random() * 1000000);
  if (input.roster === undefined && input.settings === undefined) {
    if (
      !Array.isArray(input.agents) ||
      input.agents.length > 6 ||
      !input.agents.every(strategyId)
    )
      throw new Error("Choose up to six agents.");
    return {
      seed,
      seats: input.agents.map((strategy, i) => ({
        id: strategy + "-" + i,
        strategy,
      })),
    };
  }
  if (
    !Array.isArray(input.roster) ||
    input.roster.length < 1 ||
    input.roster.length > 6 ||
    !object(input.settings)
  )
    throw new Error("Choose between one and six amoeboids and their garden settings.");
  const ids = new Set();
  const seats = input.roster.map((seat) => {
    if (
      !object(seat) ||
      typeof seat.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(seat.id) ||
      ids.has(seat.id)
    )
      throw new Error("Each amoeboid needs a distinct seat.");
    ids.add(seat.id);
    const result = { id: seat.id, name: agentName(seat.name) };
    if (seat.startingPantry !== undefined) {
      if (
        !Number.isInteger(seat.startingPantry) ||
        seat.startingPantry < 0 ||
        seat.startingPantry > 60
      )
        throw new Error("Starting carrots must be between 0 and 60.");
      result.startingPantry = seat.startingPantry;
    }
    if (seat.appearance !== undefined) {
      if (
        !Number.isInteger(seat.appearance) ||
        seat.appearance < 0 ||
        seat.appearance > 5
      )
        throw new Error("Choose a garden portrait.");
      result.appearance = seat.appearance;
    }
    if (seat.builder !== undefined && seat.strategy === undefined && object(seat.builder))
      return { ...result, builder: seat.builder };
    if (seat.builder === undefined && strategyId(seat.strategy))
      return { ...result, strategy: seat.strategy };
    throw new Error("Choose one strategy for each amoeboid.");
  });
  return { seed, settings: input.settings, seats };
}
