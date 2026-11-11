import { MEAL_BITE } from "./animation.js";
import { dayStageFor } from "./day-stage.js";

const quantity = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// A random price belongs to its amoeboid; a partially planted carrot belongs
// to everyone. An empty converter needn't advertise a price it cannot know.
export function converterPrice(frame, settings = {}, version = 3) {
  if (version < 4) return 2;
  if (frame.motion?.price || frame.lockedPrice)
    return frame.motion?.price || frame.lockedPrice;
  const rule = settings.price;
  if (!rule || rule.mode === "fixed") return rule?.value ?? 2;
  if (rule.mode === "density") {
    const capacity = settings.fieldCapacity ?? 60;
    return Math.round(
      (rule.empty * (capacity - frame.food) + rule.full * frame.food) / capacity,
    );
  }
  const quoted = rule.perAgent
    ? frame.phase === "contribute" && frame.agents[frame.actor]?.price
    : frame.agents.find((a) => !a.dead)?.price;
  return quoted || null;
}

export function supperReadout(frame, settings = {}) {
  const living = frame.agents.filter((agent) => !agent.dead).length;
  const bitten = frame.motion.progress >= MEAL_BITE;
  const eaters = frame.motion.eaters.length;
  const meals = frame.meals;
  const need = meals ? (settings.dailyFood ?? 1) : 1;
  const fed = meals ? meals.filter((m) => m.fed).length : eaters;
  const hungry = living - fed;
  const expired = meals?.reduce((sum, m) => sum + m.before - m.eaten - m.after, 0) ?? 0;
  const eaten = meals ? meals.reduce((sum, m) => sum + m.eaten, 0) : eaters;
  let caption, amount;
  if (need === 0) {
    caption = "The amoeboids need no supper in this garden.";
    amount = "No meal due";
  } else if (bitten || !eaters) {
    const short = hungry ? ` ${hungry} went hungry.` : "";
    caption = eaten
      ? `${quantity(eaten, "carrot")} eaten.${short}`
      : meals
        ? "Every pantry was empty at supper."
        : "No one gathered a carrot to eat today.";
    amount = `${fed}/${living} fed`;
  } else {
    caption = meals
      ? "The amoeboids take supper from their pantries."
      : "Each meal uses one carrot from today’s harvest.";
    amount = quantity(need, "carrot") + " each";
  }
  if (expired && bitten) caption += ` ${quantity(expired, "uneaten carrot")} expired.`;
  return {
    caption,
    amount,
    announcement: `Day ${frame.round}, evening supper. ${caption} ${amount}.`,
  };
}

export function actionReadout(frame, settings = {}, version = 3) {
  const m = frame.motion || { kind: frame.phase };
  const actor = frame.agents[frame.actor];
  const living = frame.agents.filter((a) => !a.dead);
  const capacity = settings.energyCapacity ?? 6;
  const fieldCapacity = settings.fieldCapacity ?? 60;
  const price = converterPrice(frame, settings, version);
  const remaining = actor?.energyLeft ?? Math.max(0, capacity - (actor?.given || 0));
  let label,
    caption,
    amount,
    announcement,
    icon = null;
  let name = actor?.name || "Garden";
  switch (m.kind) {
    case "ready":
      label = "READY";
      caption = "The garden is ready to grow.";
      amount = quantity(living.length, "amoeboid");
      break;
    case "shuffle":
    case "farming_shuffle":
      label = "SHUFFLING";
      name = m.kind === "shuffle" ? "Day " + frame.round : "Farming order";
      caption =
        m.kind === "shuffle"
          ? "Choosing today’s harvest order."
          : "Choosing today’s farming order.";
      amount = quantity(living.length, "amoeboid");
      break;
    case "sun_full":
    case "sun_charge": {
      const complete = m.kind === "sun_full";
      const received = living.reduce((sum, a) => sum + (a.sunlight || 0), 0);
      const full = living.every((a) => a.energyLeft === capacity);
      label = "SUNLIGHT";
      icon = "energy";
      name = living.length === 1 ? living[0].name : "All amoeboids";
      if (version >= 4 && !received) {
        caption = "The wallets received no new energy today.";
        amount = "+0 energy";
      } else {
        caption =
          version >= 4
            ? `Sunlight ${complete ? "added" : "is delivering"} ${received} energy across the garden.`
            : complete
              ? "Energy refilled."
              : "Sunlight refills every living amoeboid.";
        amount = complete
          ? full
            ? `${capacity}/${capacity} energy`
            : `+${received} energy`
          : "Recharging";
      }
      break;
    }
    case "pick":
    case "harvest_done":
    case "harvest": {
      const target = m.target ?? actor?.food ?? 0;
      label = m.kind === "harvest_done" ? "HARVEST COMPLETE" : "HARVEST";
      caption =
        m.kind === "pick"
          ? `Carrot ${m.n} of ${target}.`
          : `Collected ${quantity(target, "carrot")}.`;
      amount =
        m.kind === "pick" ? `${actor.food}/${target}` : "+" + quantity(target, "carrot");
      break;
    }
    case "energy":
      label = "CONTRIBUTING";
      caption = "Energy moving into the converter.";
      amount = `${frame.pending}/${m.price} slots`;
      break;
    case "convert":
      label = "CONVERTING";
      caption = `${m.price} energy → 1 carrot`;
      amount = "+1 carrot";
      break;
    case "contribute":
    case "farming_done":
      label = m.kind === "farming_done" ? "CONTRIBUTION COMPLETE" : "FARMING";
      amount = `${remaining}/${capacity} left`;
      if (frame.food === fieldCapacity && !actor?.given)
        caption = "Garden full. Energy stays in the pouch.";
      else if (frame.food < (settings.plantingMinimum ?? 0))
        caption = `Planting needs at least ${quantity(settings.plantingMinimum, "carrot")} in the field.`;
      else caption = `Contributed ${actor?.given || 0} energy.`;
      break;
    case "grow":
      label = "DAY’S GROWTH";
      caption =
        typeof frame.created === "number"
          ? `Produced ${quantity(frame.created, "carrot")} today.`
          : frame.regrew
            ? "Vegetables regrew."
            : "No regrowth this round.";
      amount =
        typeof frame.created === "number"
          ? "+" + quantity(frame.created, "carrot")
          : frame.regrew
            ? "Regrowth"
            : "No growth";
      break;
    case "supper":
      label = "SUPPER";
      icon = "carrot";
      name = "Day " + frame.round;
      ({ caption, amount, announcement } = supperReadout(frame, settings));
      break;
    case "death":
      label = "STARVATION";
      caption =
        version >= 4
          ? `Died after eating ${actor?.eaten ?? 0} of ${quantity(settings.dailyFood ?? 1, "carrot")} needed.`
          : "Died after collecting no food.";
      amount = version >= 4 ? "Too little food" : "No food";
      break;
    default:
      label = "GARDEN";
      caption = "The amoeboids decide how much to harvest and contribute.";
      amount = quantity(living.length, "amoeboid");
  }
  const stage = dayStageFor(frame, version);
  const parts = [quantity(frame.food, "carrot") + " in the garden."];
  if (typeof frame.pending === "number" && version >= 3)
    parts.push(
      price
        ? `${frame.pending} of ${price} energy in the converter.`
        : "The converter is empty.",
    );
  if (actor)
    parts.push(
      `${actor.name} has ${remaining} energy${typeof actor.pantry === "number" ? " and " + quantity(actor.pantry, "carrot") + " in the pantry" : ""}.`,
    );
  return {
    name,
    label,
    caption,
    amount,
    icon,
    canvasLabel: parts.join(" "),
    announcement:
      announcement ||
      (stage === "ready"
        ? "Garden ready."
        : `Day ${frame.round}, ${stage}. ${frame.phase}. ${name}.`),
  };
}
