// A harvest turn allocates from a shared field. A conversion can span seats and days.
import { colors, portrait } from "./characters.js";

const format = new Intl.NumberFormat("en");
const value = (n) =>
  n == null ? "—" : format.format(typeof n === "string" ? BigInt(n) : n);

export function renderGardenDay(container, day, seats) {
  const harvest = container.querySelector("[data-queue-list]");
  const planting = container.querySelector("[data-pool-list]");
  const doc = container.ownerDocument;
  function el(tag, className, label) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (label !== undefined) node.textContent = label;
    return node;
  }
  function seatLink(index, art, round = day.round, label) {
    const seat = seats[index];
    const link = el("button", art ? "gr-queue-agent" : "gr-funder");
    link.type = "button";
    link.dataset.openSeat = index;
    link.dataset.openDay = round;
    link.setAttribute("aria-label", `Open ${seat.name}’s journal on day ${round}`);
    if (art) {
      const pot = el("span", "gr-queue-portrait");
      pot.innerHTML = portrait(seat.appearance, false);
      pot.setAttribute("aria-hidden", "true");
      link.append(pot);
    }
    link.append(el("span", "", label || seat.name));
    return link;
  }
  const turns = day.seats
    .filter((row) => row.harvestOrder !== null)
    .sort((a, b) => a.harvestOrder - b.harvestOrder);
  const hasRequests = turns.some((row) => row.decision);
  const table = container.querySelector(".gr-queue-table");
  table.querySelector("[data-asked]").hidden = !hasRequests;
  const rows = turns.map((turn) => {
    const row = el("tr");
    const identity = el("th");
    identity.scope = "row";
    const order = el("span", "gr-queue-order", value(turn.harvestOrder));
    order.setAttribute("aria-label", "Turn " + turn.harvestOrder);
    identity.append(order, seatLink(turn.index, true));
    row.append(identity);
    if (hasRequests) row.append(el("td", "gr-request", value(turn.harvestRequested)));
    const took = el("td", "gr-taken");
    const allocation = el("span", "", value(turn.harvested));
    if (
      turn.harvested !== null &&
      turn.harvestRequested !== null &&
      BigInt(turn.harvestRequested) > BigInt(turn.harvested)
    ) {
      allocation.className = "gr-shortfall";
      allocation.title = `${value(turn.harvested)} of ${value(turn.harvestRequested)} requested carrots received`;
    }
    took.append(allocation);
    row.append(took);
    const stock = el("td", "gr-remaining");
    stock.append(el("span", "", value(turn.fieldAfterHarvest)));
    if (day.opening > 0 && turn.fieldAfterHarvest !== null) {
      const track = el("i"),
        fill = el("i");
      track.setAttribute("aria-hidden", "true");
      fill.style.width =
        Math.min(100, (turn.fieldAfterHarvest * 100) / day.opening) + "%";
      track.append(fill);
      stock.append(track);
    }
    row.append(stock);
    return row;
  });
  harvest.replaceChildren(...rows);
  table.hidden = !turns.length;
  container.querySelector("[data-queue-note]").textContent = !turns.length
    ? "This replay has no individual harvest turns for this day."
    : day.opening === null
      ? "Amoeboids in the order they harvested."
      : `${value(day.opening)} ${day.opening === 1 ? "carrot" : "carrots"} in the field before the first turn.`;
  const groups = day.fundingGroups;
  const total = day.grown;
  const known = day.fundedGrown;
  const poolText = container.querySelector("[data-pool-note]");
  const count = container.querySelector("[data-pool-count]");
  const list = [];
  count.hidden = day.sharedGrown == null || !total;
  if (!count.hidden) {
    count.textContent = day.sharedGrown + " / " + total;
    poolText.textContent = `${total === 1 ? "new carrot" : "new carrots"} with energy from multiple amoeboids.`;
  } else {
    poolText.textContent =
      total === 0
        ? "No carrots grew on this day."
        : groups == null
          ? "This replay has no record of which amoeboids funded each carrot."
          : `The replay identifies all contributors for ${known} of ${total} new carrots.`;
  }
  for (const group of groups || []) {
    const row = el("li");
    const contributors = el("span", "gr-funders");
    for (const [i, actor] of group.actors.entries()) {
      if (i) contributors.append(el("span", "gr-plus", "+"));
      const dates = group.daysByActor[actor];
      for (const [j, round] of dates.entries()) {
        const withDate = dates.length > 1 || round !== day.round;
        const label = withDate
          ? `${j ? "" : seats[actor].name + " · "}day ${round}`
          : seats[actor].name;
        const link = seatLink(actor, false, round, label);
        if (j) link.classList.add("gr-extra-date");
        link.style.setProperty(
          "--funder-color",
          colors[seats[actor].appearance] ?? colors[0],
        );
        contributors.append(link);
      }
    }
    row.append(
      contributors,
      el(
        "span",
        "gr-group-count",
        `${value(group.carrots)} ${group.carrots === 1 ? "carrot" : "carrots"}`,
      ),
    );
    list.push(row);
  }
  planting.replaceChildren(...list);
  const pending = container.querySelector("[data-pool-pending]");
  pending.hidden = !(day.pendingAtClose > 0);
  if (!pending.hidden) {
    const cost = day.lockedPriceAtClose > 0 ? ` of ${value(day.lockedPriceAtClose)}` : "";
    pending.textContent = `${value(day.pendingAtClose)}${cost} energy banked for the next carrot at day’s end.`;
  }
}
