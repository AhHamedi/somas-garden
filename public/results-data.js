// Results use the recorded run. The next garden's draft can change independently.
const amount = (value) => (Number.isInteger(value) && value >= 0 ? value : null);

function sum(values) {
  return values.length && values.every((value) => value !== null)
    ? values.reduce((total, value) => total + value, 0)
    : null;
}

export function summarizeRun(trace) {
  const frames = trace.frames || [];
  const finalFrame = frames.at(-1);
  const agents = trace.agents || finalFrame?.agents || [];
  const opening =
    amount(frames.find((frame) => frame.phase === "ready")?.food) ??
    amount(trace.settings?.startingField);
  const closing = amount(trace.food) ?? amount(finalFrame?.food);
  const days = new Map();
  const meals = new Array(agents.length).fill(0);
  let daysWithMeals = 0;

  for (const frame of frames) {
    if (!frame.round) continue;
    let day = days.get(frame.round);
    if (!day) {
      day = {
        round: frame.round,
        afterHarvest: null,
        closing: null,
        grown: null,
      };
      days.set(frame.round, day);
    }
    if (frame.phase === "harvest") day.afterHarvest = amount(frame.food);
    day.closing = amount(frame.food);
    if (frame.phase === "grow") day.grown = amount(frame.created);
    if (frame.phase === "supper" && Array.isArray(frame.meals)) {
      daysWithMeals++;
      for (const meal of frame.meals) {
        if (meal.actor >= 0 && meal.actor < meals.length) meals[meal.actor] += meal.eaten;
      }
    }
  }
  const history = [...days.values()];
  for (const day of history) {
    // Earlier games grow the field in one final step. All farming follows harvest.
    if (day.grown === null && day.closing !== null && day.afterHarvest !== null)
      day.grown = amount(day.closing - day.afterHarvest);
  }
  const rounds = amount(trace.rounds) ?? history.at(-1)?.round ?? 0;
  const limit = amount(trace.settings?.roundLimit) ?? 30;
  const seats = agents.map((agent, index) => ({
    name: agent.name || `Amoeboid ${index + 1}`,
    appearance: Number.isInteger(agent.appearance) ? agent.appearance : index,
    dead: typeof agent.dead === "boolean" ? agent.dead : null,
    diedRound: amount(agent.diedRound),
    harvested: amount(agent.totalFood),
    eaten:
      amount(agent.totalEaten) ??
      (daysWithMeals === rounds && rounds > 0 ? meals[index] : null),
    energy: amount(agent.totalEnergy),
    error: agent.error || "",
  }));
  const population = seats.length;
  const survivors =
    population > 0 && seats.every((seat) => seat.dead !== null)
      ? seats.filter((seat) => !seat.dead).length
      : null;
  const outcome =
    survivors === 0
      ? "extinction"
      : survivors !== null && rounds === limit
        ? "survival"
        : "complete";
  const noun = population === 1 ? "amoeboid" : "amoeboids";
  let title, subtitle;
  if (outcome === "extinction") {
    title = population === 1 ? "The amoeboid has died." : "All the amoeboids have died.";
    subtitle =
      population === 1
        ? `Your only amoeboid died at supper on day ${rounds}.`
        : `Your garden began with ${population} amoeboids. The last died at supper on day ${rounds}.`;
    const meal = frames.findLast((frame) => frame.phase === "supper")?.meals?.[0];
    const need = amount(trace.settings?.dailyFood);
    if (population === 1 && meal && need > 0)
      subtitle =
        need === 1
          ? `${seats[0].name} had no carrot to eat at the final supper.`
          : `${seats[0].name} ate ${meal.eaten} of the ${need} carrots needed at the final supper.`;
  } else if (outcome === "survival") {
    title = `The garden reached day ${limit}.`;
    const subject =
      population === 1 ? "Your amoeboid" : `${survivors} of ${population} amoeboids`;
    subtitle =
      trace.settings?.dailyFood === 0
        ? `${subject} survived the final day. This garden required no supper.`
        : `${subject} survived the final supper.`;
  } else {
    title = "Garden complete.";
    subtitle = `${population} ${noun} took part in this garden.`;
  }
  const harvested = sum(seats.map((seat) => seat.harvested));
  const grown =
    sum(history.map((day) => day.grown)) ??
    (opening !== null && closing !== null && harvested !== null
      ? amount(closing - opening + harvested)
      : null);
  return {
    title,
    subtitle,
    outcome,
    rounds,
    limit,
    survivors,
    seats,
    opening,
    closing,
    history,
    capacity: amount(trace.settings?.fieldCapacity) ?? 60,
    totals: {
      harvested,
      grown,
      eaten: sum(seats.map((seat) => seat.eaten)),
      energy: sum(seats.map((seat) => seat.energy)),
    },
  };
}
