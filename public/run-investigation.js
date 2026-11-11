// All perspectives come from the saved run, including the roster's original seat order.
import { summarizeRun } from "./results-data.js";

const amount = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : null);
const difference = (after, before) =>
  amount(after) !== null && amount(before) !== null ? amount(after - before) : null;

function total(values) {
  return values.length && values.every((value) => value !== null)
    ? values.reduce((sum, value) => sum + value, 0)
    : null;
}

function turns(frames, phase) {
  return new Map(
    frames
      .filter((frame) => frame.phase === phase)
      .map((frame, index) => [frame.actor, { frame, order: index + 1 }]),
  );
}

function seatDay(seat, day, source, trace) {
  const { index } = seat;
  const harvest = source.harvests.get(index);
  const planting = source.plantings.get(index);
  const meal = source.meals.get(index);
  const decision = source.decisions.get(index) ?? null;
  const morning = source.start?.agents?.[index];
  const settled = source.settled?.[index];
  const collected = harvest?.frame.agents?.[index];
  const planted = planting?.frame.agents?.[index];
  const beforeHarvest = source.previous.get(harvest?.frame);
  const beforePlant = source.previous.get(planting?.frame);
  const died = source.deaths.has(index) || seat.diedRound === day.round;
  const alreadyDead =
    morning?.dead === true || (seat.diedRound !== null && seat.diedRound < day.round);
  const tookPart = Boolean(harvest || planting || meal || decision);
  const active = alreadyDead
    ? false
    : morning?.dead === false || tookPart || died
      ? true
      : null;
  const lived =
    settled?.dead === false ||
    meal?.fed === true ||
    (seat.diedRound !== null && seat.diedRound > day.round);
  const status = alreadyDead
    ? "inactive"
    : died
      ? "died"
      : lived
        ? "survived"
        : "unknown";

  const afterHarvest = amount(harvest?.frame.food);
  const afterPlant = amount(planting?.frame.food);
  const energyGiven =
    amount(planted?.given) ?? difference(planting?.frame.energy, beforePlant?.energy);
  const harvested =
    amount(collected?.food) ?? difference(beforeHarvest?.food, afterHarvest);
  const deposits =
    planting?.frame.deposits ??
    (planting && trace.version >= 4 && energyGiven === 0 ? [] : null);
  // A completion belongs to the shared converter. This seat might only supply
  // the last unit of energy for a carrot partly funded earlier in the run.
  const grownOnTurn = deposits
    ? deposits.filter((deposit) => deposit.created).length
    : difference(planting?.frame.created, beforePlant?.created);

  // A legacy grow frame precedes supper. The next dawn or final roster
  // records the settled pantry even for versions that omitted meal events.
  const eaten =
    active === false
      ? null
      : (amount(meal?.eaten) ?? difference(settled?.totalEaten, morning?.totalEaten));
  const pantryBeforeSupper =
    active === false
      ? null
      : (amount(meal?.before) ?? amount(source.grow?.agents?.[index]?.pantry));
  const pantryEnd =
    active === false ? null : (amount(meal?.after) ?? amount(settled?.pantry));
  const pantryDiscarded =
    eaten === null ? null : difference(difference(pantryBeforeSupper, eaten), pantryEnd);
  const succeeded = decision?.status === "ok";
  return {
    round: day.round,
    index,
    active,
    status,
    error: morning?.error || planted?.error || collected?.error || "",
    decision,
    harvestRequested: succeeded ? (decision.foodRequested ?? null) : null,
    energyRequested: succeeded ? (decision.energyOffered ?? null) : null,
    harvestOrder: harvest?.order ?? null,
    plantOrder: planting?.order ?? null,
    fieldBeforeHarvest: amount(beforeHarvest?.food),
    fieldAfterHarvest: afterHarvest,
    fieldBeforePlant: amount(beforePlant?.food),
    fieldAfterPlant: afterPlant,
    harvested,
    energyGiven,
    deposits,
    grownOnTurn,
    pendingBeforePlant: amount(beforePlant?.pending),
    pendingAfterPlant: amount(planting?.frame.pending),
    sunlight: active === false ? null : amount(morning?.sunlight),
    quotedPrice: active === false ? null : amount(morning?.price),
    energyAvailable:
      active === false
        ? null
        : (amount(morning?.energyLeft) ??
          amount(beforePlant?.agents?.[index]?.energyLeft)),
    energyAfterPlant: amount(planted?.energyLeft),
    pantryStart: active === false ? null : amount(morning?.pantry),
    pantryBeforeSupper,
    need: active === false ? null : amount(trace.settings?.dailyFood),
    eaten,
    pantryEnd,
    pantryDiscarded,
    fed: typeof meal?.fed === "boolean" ? meal.fed : null,
  };
}

function compare(day) {
  const participants = day.seats.filter((row) => row.active === true);
  for (const row of day.seats) {
    const peers = participants.filter((other) => other !== row);
    row.peers = { count: peers.length };
    for (const metric of ["harvested", "energyGiven", "eaten", "pantryEnd"]) {
      const combined = total(peers.map((peer) => peer[metric]));
      row.peers[metric] = combined === null ? null : combined / peers.length;
    }
    row.harvestShare =
      day.harvested > 0 && row.harvested !== null ? row.harvested / day.harvested : null;
    row.energyShare =
      day.energyGiven > 0 && row.energyGiven !== null
        ? row.energyGiven / day.energyGiven
        : null;
  }
}

// Keep the energy's owners until the locked carrot is complete. A planting
// turn and even a day can end with several amoeboids' energy still in the pool.
function traceFunding(days, version) {
  const pool = [];
  let previousDay = 0;
  for (const day of days) {
    if (previousDay + 1 !== day.round) pool.length = 0;
    previousDay = day.round;
    day.fundedGrown = null;
    day.sharedGrown = null;
    day.fundingGroups = null;
    for (const row of day.seats) {
      row.sharedCompletions = null;
      row.coFunders = null;
    }
    if (!(version >= 4)) continue;
    const groups = new Map();
    let funded = 0,
      shared = 0;
    const planting = day.seats
      .filter((row) => row.plantOrder !== null)
      .sort((a, b) => a.plantOrder - b.plantOrder);
    for (const row of planting) {
      if (!row.deposits) {
        pool.length = 0;
        continue;
      }
      if (row.pendingBeforePlant === 0) pool.length = 0;
      const partners = new Map();
      let complete = true,
        joint = 0;
      for (const deposit of row.deposits) {
        pool.push({
          actor: row.index,
          round: day.round,
          energy: deposit.energy,
        });
        if (!deposit.created) continue;
        const fullyTraced = total(pool.map((part) => part.energy)) === deposit.price;
        if (!fullyTraced) {
          // A partial trace can start with energy whose owner was never seen.
          complete = false;
          pool.length = 0;
          continue;
        }
        funded++;
        const actors = [...new Set(pool.map((part) => part.actor))].sort((a, b) => a - b);
        const key = actors.join(",");
        if (!groups.has(key)) {
          const daysByActor = Object.fromEntries(actors.map((actor) => [actor, []]));
          groups.set(key, { actors, carrots: 0, daysByActor });
        }
        const group = groups.get(key);
        group.carrots++;
        // Deposits arrive chronologically; several carrots can use the same
        // seat's energy from one day. Keep one link per actual contribution day.
        for (const part of pool) {
          const rounds = group.daysByActor[part.actor];
          if (rounds.at(-1) !== part.round) rounds.push(part.round);
        }
        if (actors.length > 1) {
          joint++;
          shared++;
          for (const part of pool) {
            if (part.actor === row.index) continue;
            if (!partners.has(part.actor)) partners.set(part.actor, new Map());
            const byDay = partners.get(part.actor);
            byDay.set(part.round, (byDay.get(part.round) ?? 0) + part.energy);
          }
        }
        pool.length = 0;
      }
      if (complete) {
        row.sharedCompletions = joint;
        row.coFunders = [...partners].map(([index, byDay]) => ({
          index,
          energy: total([...byDay.values()]),
          deposits: [...byDay].map(([round, energy]) => ({ round, energy })),
        }));
      }
    }
    day.fundedGrown = funded;
    day.sharedGrown = funded === day.grown ? shared : null;
    day.fundingGroups = [...groups.values()].sort(
      (a, b) =>
        b.carrots - a.carrots || a.actors.join(",").localeCompare(b.actors.join(",")),
    );
  }
}

export function investigateRun(trace) {
  const report = summarizeRun(trace);
  const seats = report.seats.map((seat, index) => ({
    index,
    name: seat.name,
    appearance: seat.appearance,
    dead: seat.dead,
    diedRound: seat.diedRound,
    error: seat.error,
    strategy: trace.strategies?.[index] ?? null,
    lifetime: {
      harvested: seat.harvested,
      eaten: seat.eaten,
      energyGiven: seat.energy,
    },
    days: [],
  }));
  const groups = new Map();
  for (const frame of trace.frames ?? []) {
    if (!frame.round) continue;
    if (!groups.has(frame.round)) groups.set(frame.round, []);
    groups.get(frame.round).push(frame);
  }
  const days = report.history.map((record) => {
    const frames = groups.get(record.round);
    const start = frames.find((frame) => frame.phase === "start");
    const grow = frames.find((frame) => frame.phase === "grow");
    const supper = frames.find((frame) => frame.phase === "supper");
    const closing = frames.at(-1);
    const nextStart = groups
      .get(record.round + 1)
      ?.find((frame) => frame.phase === "start");
    const settled =
      supper?.agents ??
      nextStart?.agents ??
      (record.round === report.rounds ? trace.agents : null);
    const day = {
      ...record,
      opening: amount(start?.food) ?? (record.round === 1 ? report.opening : null),
      pendingAtClose: amount(closing?.pending),
      lockedPriceAtClose: amount(closing?.lockedPrice),
      harvested: null,
      energyGiven: null,
      eaten: null,
      aliveAtStart: null,
      aliveAtEnd: null,
    };
    const source = {
      start,
      grow,
      settled,
      harvests: turns(frames, "harvest"),
      plantings: turns(frames, "contribute"),
      deaths: turns(frames, "death"),
      meals: new Map((supper?.meals ?? []).map((meal) => [meal.actor, meal])),
      decisions: new Map(
        (start?.decisions ?? []).map((decision) => [decision.actor, decision]),
      ),
      previous: new Map(frames.slice(1).map((frame, i) => [frame, frames[i]])),
    };
    day.seats = seats.map((seat) => {
      const row = seatDay(seat, day, source, trace);
      seat.days.push(row);
      return row;
    });
    const eligible = day.seats.filter((row) => row.active !== false);
    day.harvested =
      difference(day.opening, day.afterHarvest) ??
      total(eligible.map((row) => row.harvested));
    day.energyGiven =
      amount(grow?.energy) ??
      amount(closing?.energy) ??
      total(eligible.map((row) => row.energyGiven));
    day.eaten = total(eligible.map((row) => row.eaten));
    // Taking a turn establishes participation; the earliest formats did not
    // track survival, so retain unknown population values for those runs.
    if (day.seats.length && day.seats.every((row) => row.status !== "unknown")) {
      day.aliveAtStart = day.seats.filter((row) => row.active === true).length;
      day.aliveAtEnd = day.seats.filter((row) => row.status === "survived").length;
    }
    compare(day);
    return day;
  });
  traceFunding(days, trace.version);
  return { days, seats };
}
