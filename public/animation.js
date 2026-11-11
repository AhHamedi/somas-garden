// Presentation only: actions end at the Go snapshot; ready waits for sunlight.
export const LAUNCH = 0.12;
export const CONTACT = 0.76;
export const MEAL_BITE = 0.58;
const sunPan = [-0.54, 0, 0.54, 0.48, 0, -0.48];

function openingEnergy(frame, previous, actor) {
  return frame.round === 1 ? 0 : (previous.agents[actor]?.energyLeft ?? 0);
}

function sunlightTokens(frame, previous, duration) {
  // Large wallets travel in up to six bundles per amoeboid. Each energy
  // unit keeps its own impact event and lands with its bundle.
  const wallets = frame.agents.map((agent, actor) => {
    if (agent.dead) return [];
    const first = openingEnergy(frame, previous, actor);
    const last = agent.energyLeft ?? 6;
    const stride = last > 8 ? Math.ceil((last - first) / 6) : 1;
    const wallet = [];
    for (let pip = first; pip < last; pip += stride)
      wallet.push({ actor, pip, amount: Math.min(stride, last - pip) });
    return wallet;
  });
  const tokens = wallets
    .flat()
    .sort((a, b) => a.pip - b.pip || ((a.actor + 4) % 6) - ((b.actor + 4) % 6));
  return tokens.map((token, index) => {
    // Fractions are shared with the drawing code. Use whole millisecond
    // impacts so accounting and event crossings agree at exact boundaries.
    const landMs = Math.round(
      duration * (0.2 + (0.75 * index) / Math.max(1, tokens.length - 1)),
    );
    const flightMs = 148 + ((token.actor + token.pip) % 3) * 12;
    return {
      ...token,
      launch: (landMs - flightMs) / duration,
      land: landMs / duration,
    };
  });
}

function addEvents(frame, previous, steps) {
  function contact(kind, actor = frame.actor, progress = 0, item = 0, pip = -1) {
    return { kind, actor, progress, item, pip, pan: sunPan[actor] || 0 };
  }
  for (const [index, step] of steps.entries()) {
    let events = [];
    switch (step.kind) {
      case "shuffle":
      case "farming_shuffle":
        events = [contact("shuffle", -1)];
        break;
      case "sun_charge":
        step.tokens = sunlightTokens(frame, previous, step.ms);
        if (step.tokens.length) {
          events = [
            contact("sun_launch", -1),
            ...step.tokens.flatMap((token, i) =>
              Array.from({ length: token.amount }, (_, offset) =>
                contact("sun_land", token.actor, token.land, i, token.pip + offset),
              ),
            ),
          ];
        }
        break;
      case "sun_full":
        if (steps[index - 1].tokens.length) events = [contact("sun_full", -1)];
        break;
      case "pick":
        events = [contact("harvest_land", frame.actor, CONTACT, step.n)];
        break;
      case "energy":
        events = [contact("energy_land", frame.actor, CONTACT, step.n, step.pending)];
        break;
      case "convert":
        events = [contact("convert_land", frame.actor, CONTACT, step.made)];
        break;
      case "supper":
        if (step.eaters.length) events = [contact("bite", -1, MEAL_BITE, frame.round)];
        break;
      case "harvest_done":
      case "death":
        events = [contact(step.kind)];
        break;
      case "grow":
        if (frame.regrew) events = [contact("grow", -1)];
        break;
      case "contribute":
        // Legacy traces hold only a total, without the two converter slots.
        if (frame.agents[frame.actor]?.given > 0) events = [contact("energy_land")];
        break;
    }
    step.events = events.map((event, ordinal) => ({
      ...event,
      atMs:
        event.kind === "sun_land"
          ? Math.round(event.progress * step.ms)
          : event.progress * step.ms,
      id: [frame.round, frame.phase, frame.actor, index, ordinal].join(":"),
    }));
  }
  return steps;
}

export function timelineEvents(steps) {
  let offset = 0;
  const events = [];
  for (const step of steps) {
    for (const event of step.events) events.push({ ...event, atMs: offset + event.atMs });
    offset += step.ms;
  }
  return events;
}

export function crossedEvents(events, fromMs, toMs) {
  return events.filter((event) => event.atMs > fromMs && event.atMs <= toMs);
}

export function sequenceFor(frame, previous = frame, version = 3) {
  const actor = frame.agents?.[frame.actor],
    steps = [];
  const shuffleTurns = version < 4 || frame.agents.filter((a) => !a.dead).length > 1;
  if (shuffleTurns && frame.phase === "contribute" && previous.phase === "harvest") {
    steps.push({ kind: "farming_shuffle", cue: "shuffle", ms: 720 });
  }
  if (frame.phase === "start") {
    if (shuffleTurns) steps.push({ kind: "shuffle", cue: "shuffle", ms: 720 });
    const charging = version < 4 || frame.agents.some((a) => a.sunlight > 0);
    steps.push({
      kind: "sun_charge",
      cue: "sun_charge",
      ms: charging ? 880 : 110,
    });
    steps.push({ kind: "sun_full", cue: "sun_full", ms: 220 });
  } else if (frame.phase === "harvest" && actor?.food > 0) {
    for (let n = 1; n <= actor.food; n++)
      steps.push({ kind: "pick", cue: "pop", n, ms: 100 });
    steps.push({ kind: "harvest_done", cue: "harvest_done", ms: 170 });
  } else if (
    frame.phase === "contribute" &&
    actor?.given > 0 &&
    typeof frame.pending === "number"
  ) {
    let pending = previous.pending || 0,
      made = 0,
      n = 0;
    const addEnergy = (price, ms) => {
      steps.push({
        kind: "energy",
        cue: "energy",
        n: ++n,
        pending,
        made,
        price,
        ms,
      });
      pending++;
    };
    const addCarrot = (price, ms) => {
      steps.push({
        kind: "convert",
        cue: "convert",
        n,
        pending,
        made,
        price,
        ms,
      });
      made++;
      pending = 0;
    };
    if (version >= 4) {
      // The first contributor fixes a carrot's price even across days. Use
      // the recorded transactions, including prices that change mid-turn.
      const segments = frame.deposits || [];
      const completions = segments.filter((d) => d.created).length;
      const pace = Math.min(1, 1800 / (actor.given * 105 + completions * 140));
      for (const deposit of segments) {
        for (let i = 0; i < deposit.energy; i++)
          addEnergy(deposit.price, Math.round(105 * pace));
        if (deposit.created) addCarrot(deposit.price, Math.round(140 * pace));
      }
    } else {
      for (let i = 0; i < actor.given; i++) {
        addEnergy(2, 105);
        if (pending === 2) addCarrot(2, 140);
      }
    }
    steps.push({
      kind: "farming_done",
      n: actor.given,
      pending: frame.pending,
      made,
      ms: 130,
    });
  } else if (frame.phase === "supper" && version >= 4) {
    const eaters = (frame.meals || [])
      .filter((meal) => meal.eaten > 0)
      .map((meal) => meal.actor);
    steps.push({ kind: "supper", eaters, ms: eaters.length ? 840 : 560 });
  } else
    steps.push({
      kind: frame.phase,
      cue: frame.phase === "death" ? "death" : undefined,
      ms: frame.phase === "death" ? 1300 : 230,
    });
  // Version 3 records daily harvest per agent. Supper illustrates the day's
  // survival check using those carrots, which already left the shared plot.
  if (frame.phase === "grow" && version === 3) {
    const eaters = frame.agents.flatMap((agent, index) =>
      !agent.dead && agent.food > 0 ? [index] : [],
    );
    steps.push({ kind: "supper", eaters, ms: eaters.length ? 840 : 560 });
  }
  return addEvents(frame, previous, steps);
}
export function durationFor(frame, previous, version = 3) {
  return sequenceFor(frame, previous, version).reduce((sum, s) => sum + s.ms, 0);
}
export function projectFrame(frame, previous, steps, age) {
  let elapsed = age,
    stepIndex = 0;
  while (stepIndex < steps.length - 1 && elapsed >= steps[stepIndex].ms) {
    elapsed -= steps[stepIndex].ms;
    stepIndex++;
  }
  const step = steps[stepIndex],
    progress = Math.max(0, Math.min(1, elapsed / step.ms));
  const view = {
    ...frame,
    agents: frame.agents.map((a) => ({ ...a })),
    motion: {
      ...step,
      progress,
      index: stepIndex,
      age,
      target: frame.agents[frame.actor]?.food || 0,
    },
  };
  const actor = view.agents[view.actor],
    before = previous?.agents?.[view.actor];
  if (step.kind === "farming_shuffle") {
    return {
      ...view,
      actor: -1,
      food: previous.food,
      energy: previous.energy,
      pending: previous.pending,
      lockedPrice: previous.lockedPrice,
      created: previous.created,
      agents: previous.agents.map((a) => ({ ...a })),
    };
  }
  if (step.kind === "ready")
    view.agents.forEach((a) => {
      a.energyLeft = 0;
    });
  if (step.kind === "sun_charge" || step.kind === "shuffle") {
    const tokens = step.tokens || [];
    const landed = tokens.filter((token) => Math.round(token.land * step.ms) <= elapsed);
    view.motion.charge = tokens.length ? landed.length / tokens.length : 0;
    view.agents.forEach((agent, i) => {
      agent.energyLeft = agent.dead ? 0 : openingEnergy(frame, previous, i);
    });
    for (const token of landed) view.agents[token.actor].energyLeft += token.amount;
  }
  if (step.kind === "pick" && actor && before) {
    const landed = step.n - 1 + (elapsed >= step.ms * CONTACT ? 1 : 0);
    view.food = previous.food - step.n + (progress < LAUNCH ? 1 : 0);
    actor.food = landed;
    actor.totalFood = before.totalFood + landed;
    if (typeof before.pantry === "number") actor.pantry = before.pantry + landed;
  }
  if ((step.kind === "energy" || step.kind === "convert") && actor && before) {
    const arrived = step.kind === "convert" || elapsed >= step.ms * CONTACT;
    const paid = step.n - (arrived ? 0 : 1);
    actor.given = paid;
    actor.totalEnergy = before.totalEnergy + paid;
    actor.energyLeft =
      (before.energyLeft ?? Math.max(0, 6 - (before.given || 0))) -
      step.n +
      (step.kind === "energy" && progress < LAUNCH ? 1 : 0);
    view.energy = previous.energy + paid;
    const produced =
      step.made + (step.kind === "convert" && elapsed >= step.ms * CONTACT ? 1 : 0);
    view.food = previous.food + produced;
    view.created = (previous.created || 0) + produced;
    view.pending =
      step.kind === "energy"
        ? step.pending + (arrived ? 1 : 0)
        : elapsed >= step.ms * CONTACT
          ? 0
          : step.price;
    if (typeof frame.lockedPrice === "number")
      view.lockedPrice = view.pending ? step.price : 0;
  }
  if (step.kind === "supper" && frame.meals && progress < MEAL_BITE) {
    for (const meal of frame.meals) {
      view.agents[meal.actor] = {
        ...previous.agents[meal.actor],
        pantry: meal.before,
      };
    }
  }
  return view;
}
