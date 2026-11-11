import { colors, portrait } from "./characters.js";

// Read the recorded action order, including zero actions and repeated uploads.
export function dailyOrders(frames = []) {
  const days = new Map();
  for (const f of frames) {
    if (f.phase !== "harvest" && f.phase !== "contribute") continue;
    if (!days.has(f.round)) days.set(f.round, { harvest: [], contribute: [] });
    days.get(f.round)[f.phase].push(f.actor);
  }
  return days;
}
export function queueFor(frame, days) {
  const farmingShuffle = frame.motion?.kind === "farming_shuffle";
  const opening = frame.phase === "start" || frame.phase === "ready" || farmingShuffle;
  const phase =
    !farmingShuffle && (opening || frame.phase === "harvest") ? "harvest" : "contribute";
  const order =
    days.get(frame.round)?.[phase] ?? frame.agents.flatMap((a, i) => (a.dead ? [] : [i]));
  const active =
    !opening && (frame.phase === "harvest" || frame.phase === "contribute")
      ? frame.actor
      : -1;
  const cursor =
    active >= 0 ? Math.max(0, order.indexOf(active)) : opening ? 0 : order.length;
  return {
    phase,
    order,
    active,
    done: new Set(order.slice(0, cursor)),
    display: [...order.slice(cursor), ...order.slice(0, cursor)],
  };
}
const ease = (t) => 1 - (1 - t) ** 3;
export function createTurnQueue(root) {
  const list = root.querySelector("ol"),
    label = root.querySelector(".queue-phase");
  const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = matchMedia("(max-width: 730px)");
  let framesRef,
    days = new Map(),
    key = "",
    began = 0,
    width = list.clientWidth,
    lastPoseKey = "";
  let origins = new Map(),
    poses = new Map();
  const cards = Array.from({ length: 6 }, (_, i) => {
    const el = document.createElement("li");
    el.className = "queue-card";
    el.dataset.actor = i;
    el.style.setProperty("--seedling-color", colors[i]);
    const avatar = document.createElement("span");
    avatar.className = "queue-avatar";
    const name = document.createElement("span");
    name.className = "queue-name";
    const status = document.createElement("span");
    status.className = "queue-status";
    el.append(avatar, name, status);
    list.append(el);
    return { el, avatar, name, status, identity: "" };
  });
  new ResizeObserver((entries) => {
    width = entries[0].contentRect.width;
  }).observe(list);
  return {
    present(frame, frames) {
      if (frames !== framesRef) {
        framesRef = frames;
        days = dailyOrders(frames);
        key = "";
        poses.clear();
      }
      const m = frame.motion;
      const reduced = motionPreference.matches;
      // Once the queue settles, item animation no longer needs to touch its DOM.
      const moving = m.kind === "shuffle" || m.kind === "farming_shuffle";
      const poseTime = moving ? m.progress : Math.min(250, Math.max(0, m.age - began));
      const poseKey = [
        frame.round,
        frame.phase,
        frame.actor,
        m.kind,
        reduced ? 0 : poseTime,
        width,
        mobile.matches,
        reduced,
        ...frame.agents.map((a) => a.name + a.dead + a.appearance),
      ].join("|");
      if (key && poseKey === lastPoseKey) return;
      lastPoseKey = poseKey;
      const model = queueFor(frame, days);
      const shuffling = m.kind === "shuffle" || m.kind === "farming_shuffle";
      const nextKey = `${frame.round}:${frame.phase}:${frame.actor}:${shuffling}:${model.order.join(",")}`;
      if (nextKey !== key) {
        key = nextKey;
        began = m.age;
        origins = new Map(poses);
        list.append(...model.display.map((i) => cards[i].el));
        root.dataset.phase = model.phase;
        root.dataset.shuffling = String(shuffling);
        label.textContent = shuffling
          ? "Shuffling"
          : frame.phase === "ready"
            ? "Next day"
            : model.active < 0 && frame.phase !== "start"
              ? "Turns complete"
              : model.phase === "harvest"
                ? "Harvest"
                : "Farming";
        list.style.setProperty("--queue-rows", model.order.length);
        root.setAttribute(
          "aria-label",
          `Day ${frame.round || 1}: ${label.textContent} turn order`,
        );
      }
      const u = reduced ? 1 : Math.min(1, Math.max(0, (m.age - began) / 250));
      const target = new Map(model.display.map((i, pos) => [i, pos]));
      const n = model.order.length;
      const rotated = [
        ...model.order.slice(n > 2 ? 2 : 1),
        ...model.order.slice(0, n > 2 ? 2 : 1),
      ];
      const layouts = [
        origins,
        new Map(rotated.map((i, p) => [i, p])),
        new Map([...model.order].reverse().map((i, p) => [i, p])),
        target,
      ];
      for (let i = 0; i < cards.length; i++) {
        const { el, avatar, name, status } = cards[i],
          a = frame.agents[i];
        const shown = target.has(i) && !!a;
        el.hidden = !shown;
        if (!shown) continue;
        const appearance = a.appearance ?? i;
        const tight = mobile.matches && width / n < 58;
        const identity = `${a.name}:${a.dead}:${appearance}:${tight}`;
        if (cards[i].identity !== identity) {
          cards[i].identity = identity;
          avatar.innerHTML = portrait(appearance, a.dead);
          el.style.setProperty("--seedling-color", colors[appearance]);
          name.textContent = tight
            ? a.name.replace(/^(?:Seedling|Amoeboid) (\d+)$/, "No. $1")
            : a.name;
          el.title = a.name;
        }
        let position,
          bend = 0,
          scale = 1;
        if (shuffling && n > 1 && !reduced) {
          const leg = Math.min(2, Math.floor(m.progress * 3));
          const p = Math.min(1, m.progress * 3 - leg),
            q = ease(p);
          const start = layouts[leg].get(i) ?? target.get(i),
            end = layouts[leg + 1].get(i);
          position = start + (end - start) * q;
          bend = Math.sin(p * Math.PI) * (i % 2 ? 9 : -9);
          scale += Math.sin(p * Math.PI) * 0.035;
        } else {
          const start = origins.get(i) ?? target.get(i);
          position = start + (target.get(i) - start) * ease(u);
          if (model.done.has(i)) bend = Math.sin(u * Math.PI) * 12;
          if (i === model.active) scale += Math.sin(u * Math.PI) * 0.07;
        }
        poses.set(i, position);
        const x = mobile.matches ? (position * width) / Math.max(1, n) : bend;
        const y = mobile.matches ? bend : position * 54;
        el.style.transform = `translate3d(${x}px,${y}px,0) scale(${scale})`;
        el.style.zIndex = i === model.active ? 9 : String(6 - Math.round(position));
        const state = a.dead
          ? "dead"
          : i === model.active
            ? "active"
            : model.done.has(i)
              ? "done"
              : "waiting";
        if (el.dataset.state !== state) {
          el.dataset.state = state;
          el.setAttribute("aria-current", i === model.active ? "step" : "false");
          status.textContent =
            state === "active" ? "NOW" : state === "done" || state === "dead" ? "✓" : "";
        }
        el.setAttribute(
          "aria-label",
          `${a.name}: ${state === "active" ? "taking a turn" : state === "done" || state === "dead" ? "finished" : "waiting"}`,
        );
        el.setAttribute("aria-posinset", target.get(i) + 1);
        el.setAttribute("aria-setsize", n);
      }
    },
  };
}
