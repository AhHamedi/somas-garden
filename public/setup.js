import { colors, portrait } from "./characters.js";
import {
  MAX_SEATS,
  describe,
  esc,
  examples,
  loadState,
  modes,
  newId,
  newSeat,
  runInput,
  storeState,
} from "./setup-model.js";
import { gardenRules } from "./garden-rules.js";
import { agentBuilder } from "./agent-builder.js";

const icons = {
  back: '<path d="m12 4-6 6 6 6"/>',
  next: '<path d="m8 4 6 6-6 6"/>',
  tune: '<path d="M2 5h5m4 0h7M2 15h9m4 0h3"/><circle cx="9" cy="5" r="2"/><circle cx="13" cy="15" r="2"/>',
  leaf: '<path d="M5 13c-1-6 4-10 12-10 0 8-3 13-9 12m-5 3 9-10"/>',
  close: '<path d="m5 5 10 10M15 5 5 15"/>',
  plus: '<path d="M10 3v14M3 10h14"/>',
};
const icon = (key) =>
  `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icons[key]}</svg>`;
const pot = (seat) =>
  `<span class="gs-portrait" style="--pot:${colors[seat.appearance]}">${portrait(seat.appearance)}</span>`;
const quantity = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export function createGardenSetup({
  button,
  api,
  onChange,
  onRun,
  onUpload,
  onSource,
  onPublished,
  capabilities = { storage: "hosted", goUploads: true },
}) {
  const state = loadState();
  const isLocal = () => capabilities.storage === "local";
  const libraryLabel = () => (isLocal() ? "Local library" : "Public library");
  const saveLabel = () => (isLocal() ? "Save to local library" : "Publish a copy");
  let library = [],
    busy = false,
    page = "",
    serial = 0,
    editing = null,
    uploadTarget = null,
    tab = "examples",
    highlighted = null;
  const modal = document.createElement("dialog");
  modal.id = "garden-setup-dialog";
  modal.className = "gs-modal";
  modal.setAttribute("aria-labelledby", "gs-title");
  modal.innerHTML = `<header class="gs-head"><div class="gs-brand"><span class="gs-seal">${icon("leaf")}</span>Garden studio</div><button type="button" class="gs-close" aria-label="Close garden setup">${icon("close")}</button></header>
    <div class="gs-body"><div class="gs-titlebar"><button class="gs-back" aria-label="Back" type="button">${icon("back")}</button><h2 id="gs-title" tabindex="-1"></h2></div><nav class="gs-nav" aria-label="Garden setup sections"></nav><div class="gs-main"></div></div>
    <p class="gs-status" role="status" hidden></p><footer class="gs-foot"></footer>`;
  document.body.append(modal);
  const main = modal.querySelector(".gs-main"),
    foot = modal.querySelector(".gs-foot"),
    title = modal.querySelector("h2"),
    nav = modal.querySelector("nav"),
    back = modal.querySelector(".gs-back"),
    scroll = modal.querySelector(".gs-body"),
    note = modal.querySelector(".gs-status");
  function status(text = "", error = false) {
    note.textContent = text;
    note.hidden = !text;
    note.classList.toggle("gs-error", error);
  }
  function shell(label, screen, previous, focusTitle = true) {
    const token = ++serial,
      offset = scroll.scrollTop,
      preserveScroll = !focusTitle && page === screen;
    page = screen;
    title.textContent = label;
    back.hidden = !previous;
    back.onclick = previous || null;
    nav.hidden = true;
    status();
    main.replaceChildren();
    foot.replaceChildren();
    scroll.scrollTop = preserveScroll ? offset : 0;
    if (!modal.open) modal.showModal();
    if (focusTitle) title.focus({ preventScroll: true });
    return {
      main,
      foot,
      status,
      isCurrent: () => serial === token && modal.open,
    };
  }
  modal.querySelector(".gs-close").onclick = () => modal.close();
  modal.addEventListener("close", () => {
    serial++;
    editing = null;
    uploadTarget = null;
  });
  function changed() {
    const stored = storeState(state);
    onChange?.();
    if (!stored)
      status(
        "This browser could not save your changes for next time. They are available in this tab.",
        true,
      );
    return stored;
  }
  function findStrategy(id) {
    return (
      state.drafts.find((a) => a.id === id) ||
      examples.find((a) => a.id === id) ||
      library.find((a) => a.id === id)
    );
  }
  const strategyName = (seat) =>
    findStrategy(seat.strategy)?.name || seat.strategyName || "Public agent";
  function tabs(active) {
    nav.hidden = false;
    nav.innerHTML = `<button type="button" aria-current="${active === "seats" ? "page" : "false"}" data-seats>${icon("leaf")}Amoeboids</button><button type="button" aria-current="${active === "rules" ? "page" : "false"}" data-rules>${icon("tune")}Garden rules</button>`;
    nav.querySelector("[data-seats]").onclick = roster;
    nav.querySelector("[data-rules]").onclick = rules;
  }
  function runButton() {
    return `<button type="button" class="primary" data-run ${busy ? "disabled" : ""}>Run this setup <span aria-hidden="true">→</span></button>`;
  }
  function roster() {
    editing = null;
    const { isCurrent } = shell("Garden setup", "roster");
    tabs("seats");
    main.innerHTML = `<div class="gs-population"><label for="gs-pop">Garden size</label><select id="gs-pop" aria-label="Number of amoeboids">${Array.from({ length: MAX_SEATS }, (_, i) => `<option value="${i + 1}" ${i + 1 === state.roster.length ? "selected" : ""}>${quantity(i + 1, "amoeboid")}</option>`).join("")}</select></div>
      <div class="gs-seats">${state.roster.map((s) => `<button type="button" class="gs-seat" data-seat="${esc(s.id)}">${pot(s)}<span><strong>${esc(s.name)}</strong><small>${esc(strategyName(s))}${Object.hasOwn(s, "startingPantry") ? ` · ${quantity(s.startingPantry, "starting carrot")}` : ""}</small></span>${icon("next")}</button>`).join("")}</div>
      <div class="gs-roster-actions"><button class="gs-line" data-create>${icon("plus")}Create an agent</button><button class="gs-text" data-library>Browse strategies</button></div>`;
    for (const el of main.querySelectorAll("[data-seat]"))
      el.onclick = () => openSeat(el.dataset.seat);
    main.querySelector("[data-create]").onclick = () => builder();
    main.querySelector("[data-library]").onclick = () => {
      tab = "examples";
      picker();
    };
    main.querySelector("#gs-pop").onchange = (e) => {
      const next = Number(e.target.value),
        removed = state.roster.splice(next);
      while (state.roster.length < next) state.roster.push(newSeat(state.roster));
      roster();
      const stored = changed();
      if (removed.length && stored) {
        status(`Removed ${removed.map((s) => s.name).join(", ")}. `);
        const undo = document.createElement("button");
        undo.type = "button";
        undo.className = "gs-text";
        undo.textContent = "Undo";
        note.append(undo);
        undo.onclick = () => {
          state.roster.push(...removed);
          roster();
          changed();
          main.querySelector("#gs-pop").focus();
        };
      }
      main.querySelector("#gs-pop").focus({ preventScroll: true });
    };
    foot.innerHTML = `<span class="gs-note">For your next game</span>${runButton()}`;
    foot.querySelector("[data-run]").onclick = () => {
      if (busy || !isCurrent()) return;
      modal.close();
      onRun?.();
    };
  }
  function rules() {
    gardenRules(state.settings, {
      shell: () => {
        const parts = shell("Garden setup", "rules");
        tabs("rules");
        return parts;
      },
      apply: (settings) => {
        state.settings = settings;
        roster();
        if (changed()) status("Garden rules saved for your next game.");
      },
    });
  }
  function openSeat(id) {
    const seat = state.roster.find((s) => s.id === id);
    if (!seat) return roster();
    editing = structuredClone(seat);
    seatEditor();
  }
  function updateSeat() {
    Object.assign(
      state.roster.find((s) => s.id === editing.id),
      editing,
    );
    const current = state.roster.find((s) => s.id === editing.id);
    if (!Object.hasOwn(editing, "startingPantry")) delete current.startingPantry;
  }
  function seatEditor() {
    shell("Edit amoeboid", "seat", roster);
    const remaining = MAX_SEATS - state.roster.length;
    main.innerHTML = `<form id="gs-seat-form"><div class="gs-seat-name">${pot(editing)}<label class="gs-input">Amoeboid name<input name="seatName" maxlength="40" required value="${esc(editing.name)}"></label></div>
      <div class="gs-field-label">Strategy</div><button type="button" class="gs-choice" data-change><span><strong>${esc(strategyName(editing))}</strong><small>Change strategy</small></span>${icon("next")}</button>
      <label class="gs-input">Starting pantry<input type="number" name="pantry" min="0" max="60" placeholder="Garden default · ${state.settings.startingPantry}" value="${editing.startingPantry ?? ""}"><small>Leave blank to use the garden’s starting carrots.</small></label></form>
      ${remaining ? `<div class="gs-copy"><label class="gs-input">Copies to add<select name="copies">${Array.from({ length: remaining }, (_, i) => `<option>${i + 1}</option>`).join("")}</select></label><button type="button" class="secondary" data-copy>Duplicate amoeboid</button></div>` : ""}`;
    foot.innerHTML = `<button type="button" class="gs-text gs-danger" data-remove ${state.roster.length === 1 ? "disabled" : ""}>Remove amoeboid</button><button type="submit" form="gs-seat-form" class="primary">Save amoeboid</button>`;
    const form = main.querySelector("form");
    function readSeat() {
      const name = form.elements.seatName;
      name.setCustomValidity(name.value.trim() ? "" : "Give your amoeboid a name.");
      if (!form.reportValidity()) return false;
      editing.name = name.value.trim();
      if (form.elements.pantry.value === "") delete editing.startingPantry;
      else editing.startingPantry = form.elements.pantry.valueAsNumber;
      return true;
    }
    form.oninput = () => form.elements.seatName.setCustomValidity("");
    form.onsubmit = (e) => {
      e.preventDefault();
      if (readSeat()) {
        updateSeat();
        roster();
        if (changed()) status("Amoeboid saved.");
      }
    };
    main.querySelector("[data-change]").onclick = () => {
      if (readSeat()) {
        tab = state.drafts.some((d) => d.id === editing.strategy)
          ? "mine"
          : examples.some((d) => d.id === editing.strategy)
            ? "examples"
            : "public";
        picker(editing.strategy);
      }
    };
    const duplicate = main.querySelector("[data-copy]");
    if (duplicate)
      duplicate.onclick = () => {
        if (!readSeat()) return;
        updateSeat();
        const n = Number(main.querySelector('[name="copies"]').value);
        for (let i = 0; i < n; i++) {
          const created = newSeat(state.roster);
          let number = 2,
            base = editing.name.slice(0, 36);
          while (state.roster.some((s) => s.name === `${base} ${number}`)) number++;
          state.roster.push({
            ...structuredClone(editing),
            id: created.id,
            appearance: created.appearance,
            name: `${base} ${number}`,
          });
        }
        roster();
        if (changed()) status(n === 1 ? "Added one copy." : `Added ${n} copies.`);
      };
    foot.querySelector("[data-remove]").onclick = () => {
      state.roster = state.roster.filter((s) => s.id !== editing.id);
      roster();
      changed();
    };
  }
  function applyChoice(agent) {
    if (!editing) return assign(agent);
    editing.strategy = agent.id;
    editing.strategyName = agent.name;
    const recipient = editing.name;
    updateSeat();
    roster();
    if (changed()) status(`${recipient} will use ${agent.name}.`);
  }
  function assign(agent) {
    shell("Choose an amoeboid", "assign", () => picker(agent.id));
    main.innerHTML = `<p class="gs-intro">Use <strong>${esc(agent.name)}</strong> in the next game.</p><div class="gs-seats">${state.roster.map((s) => `<button type="button" class="gs-seat" data-assign="${esc(s.id)}">${pot(s)}<span><strong>${esc(s.name)}</strong><small>Replace ${esc(strategyName(s))}</small></span>${icon("next")}</button>`).join("")}</div>`;
    for (const el of main.querySelectorAll("[data-assign]"))
      el.onclick = () => {
        editing = structuredClone(state.roster.find((s) => s.id === el.dataset.assign));
        applyChoice(agent);
      };
    foot.innerHTML =
      state.roster.length < MAX_SEATS
        ? '<button type="button" class="primary" data-plant>Add as a new amoeboid</button>'
        : '<span class="gs-note">Choose whose strategy to replace.</span>';
    const plant = foot.querySelector("[data-plant]");
    if (plant)
      plant.onclick = () => {
        const s = newSeat(state.roster);
        state.roster.push(s);
        editing = structuredClone(s);
        applyChoice(agent);
      };
  }
  function builder(draft = null, remix = false) {
    const agent = remix
      ? { name: `${draft.name.slice(0, 34)} remix`, builder: draft.builder }
      : draft;
    agentBuilder({
      draft: agent,
      useOnSave: Boolean(editing),
      settings: state.settings,
      seatCount: state.roster.length,
      api,
      shell,
      onBack: () => picker(draft?.id),
      onSave: (name, spec) => {
        const old = !remix && draft && state.drafts.find((d) => d.id === draft.id),
          d = { id: old?.id || newId(), name, builder: spec };
        if (old) Object.assign(old, d);
        else state.drafts.unshift(d);
        if (editing) applyChoice(d);
        else {
          tab = "mine";
          picker(d.id);
          if (changed()) status("Private agent saved in this browser.");
        }
      },
    });
  }
  function picker(id) {
    const { isCurrent } = shell(
      "Strategy library",
      "picker",
      editing ? seatEditor : roster,
    );
    const lists = { examples, mine: state.drafts, public: library },
      list = lists[tab];
    const chosen = list.find((a) => a.id === id) || list[0];
    highlighted = chosen?.id;
    nav.hidden = false;
    nav.innerHTML = Object.entries({
      examples: "Examples",
      mine: "My agents",
      public: libraryLabel(),
    })
      .map(
        ([key, label]) =>
          `<button type="button" data-tab="${key}" aria-current="${tab === key ? "page" : "false"}">${label}</button>`,
      )
      .join("");
    for (const b of nav.querySelectorAll("[data-tab]"))
      b.onclick = () => {
        tab = b.dataset.tab;
        picker();
        nav.querySelector(`[data-tab="${tab}"]`).focus({ preventScroll: true });
      };
    const emptyMessage =
      tab === "mine"
        ? "Your saved agents will appear here."
        : isLocal()
          ? "No agents are saved in this library."
          : "No published agents are listed.";
    const refreshButton =
      tab === "public"
        ? `<div class="gs-public-tools"><button type="button" class="gs-text" data-refresh>Refresh ${libraryLabel().toLowerCase()}</button></div>`
        : "";
    const strategyButtons = list
      .map((agent) => {
        const kind =
          tab === "examples"
            ? "Example"
            : modes[agent.builder?.mode || agent.mode] || "Go";
        return `<button type="button" data-agent="${esc(agent.id)}" aria-pressed="${chosen?.id === agent.id}"><strong>${esc(agent.name)}</strong><span>${esc(kind)}</span></button>`;
      })
      .join("");
    const uploadDisabled = capabilities.goUploads
      ? ""
      : 'disabled aria-describedby="gs-upload-note"';
    const uploadNote = capabilities.goUploads
      ? ""
      : '<p class="gs-note" id="gs-upload-note">Go uploads require hosted mode with an isolated runner. You can create and export agents with the builder here.</p>';
    main.innerHTML = `${refreshButton}
      <div class="gs-picker-list" role="group" aria-label="Strategies">${strategyButtons}</div>
      <section class="gs-strategy-detail"></section>
      ${list.length ? "" : `<p class="gs-empty">${emptyMessage}</p>`}
      <div class="gs-roster-actions"><button type="button" class="gs-line" data-create>${icon("plus")}Create an agent</button><button type="button" class="gs-text" data-upload ${uploadDisabled}>Upload Go</button></div>
      ${uploadNote}`;
    const refresh = main.querySelector("[data-refresh]");
    if (refresh)
      refresh.onclick = async () => {
        refresh.disabled = true;
        refresh.textContent = "Refreshing…";
        try {
          const response = await api("agents");
          library = response.agents;
          if (isCurrent()) {
            picker(highlighted);
            main.querySelector("[data-refresh]").focus();
            status("Library refreshed.");
          }
        } catch (error) {
          if (isCurrent()) {
            status(error.message, true);
            refresh.disabled = false;
            refresh.textContent = "Refresh " + libraryLabel().toLowerCase();
          }
        }
      };
    main.querySelector("[data-create]").onclick = () => builder();
    main.querySelector("[data-upload]").onclick = () => {
      uploadTarget = editing?.id ?? null;
      onUpload?.();
    };
    for (const button of main.querySelectorAll("[data-agent]"))
      button.onclick = () => {
        picker(button.dataset.agent);
        [...main.querySelectorAll("[data-agent]")]
          .find((el) => el.dataset.agent === button.dataset.agent)
          ?.focus({ preventScroll: true });
      };
    if (!chosen) {
      foot.innerHTML = '<span class="gs-note">Choose or create a strategy.</span>';
      return;
    }
    const box = main.querySelector(".gs-strategy-detail");
    function detail(info) {
      const spec = info.builder;
      box.innerHTML = `<h3>${esc(chosen.name)}</h3><p>${esc(spec ? describe(spec) : chosen.description || "A Go strategy. Open its source to see how it decides.")}</p><div class="gs-detail-actions"></div>`;
      const actions = box.querySelector(".gs-detail-actions");
      function add(label, click) {
        const b = document.createElement("button");
        b.className = "gs-text";
        b.type = "button";
        b.textContent = label;
        b.onclick = () => click(b);
        actions.append(b);
      }
      if (tab === "mine") {
        add("Edit agent", () => builder(chosen));
        add(saveLabel(), (b) => publish(chosen, b, isCurrent));
      } else {
        if (spec)
          add("Remix privately", () => builder({ ...chosen, builder: spec }, true));
        add("View Go", () => onSource?.({ ...chosen, example: tab === "examples" }));
      }
    }
    detail(chosen);
    if (tab === "public" && chosen.kind === "builder" && !chosen.builder) {
      box.querySelector("p").textContent = "Loading strategy…";
      api("agents/" + encodeURIComponent(chosen.id) + "/source")
        .then((info) => {
          if (isCurrent()) detail(info);
        })
        .catch((err) => {
          if (isCurrent()) {
            box.querySelector("p").textContent = "Strategy details unavailable.";
            status(err.message, true);
          }
        });
    }
    foot.innerHTML = `<span class="gs-note">${editing ? `For ${esc(editing.name)}` : "For your next game"}</span><button type="button" class="primary" data-use>Use strategy</button>`;
    foot.querySelector("[data-use]").onclick = () => applyChoice(chosen);
  }
  async function publish(chosen, b, isCurrent) {
    b.disabled = true;
    b.textContent = isLocal() ? "Saving…" : "Publishing…";
    try {
      const { agent } = await api("agents", {
        name: chosen.name,
        builder: chosen.builder,
      });
      library = [
        { ...agent, builder: structuredClone(chosen.builder) },
        ...library.filter((a) => a.id !== agent.id),
      ];
      if (isCurrent()) {
        tab = "public";
        picker(agent.id);
        status(
          isLocal()
            ? "Saved to the local library."
            : "Published a copy to the public library.",
        );
      }
      void onPublished?.();
    } catch (err) {
      if (isCurrent()) {
        status(err.message, true);
        b.disabled = false;
        b.textContent = saveLabel();
      }
    }
  }
  button?.addEventListener("click", roster);
  return {
    open: roster,
    openSeat,
    openBuilder: () => {
      editing = null;
      tab = "mine";
      builder();
    },
    getRunInput: () => runInput(state),
    getSeats: () => state.roster.map((s) => ({ ...s, strategyName: strategyName(s) })),
    setBusy(value) {
      busy = value;
      const run = foot.querySelector("[data-run]");
      if (run) run.disabled = value;
    },
    setCapabilities(value) {
      capabilities = value;
      if (modal.open && page === "picker") picker(highlighted);
    },
    setLibrary(agents) {
      library = agents;
      if (modal.open && page === "picker" && tab === "public") picker(highlighted);
    },
    useUploaded(agent) {
      library = [agent, ...library.filter((a) => a.id !== agent.id)];
      tab = "public";
      if (uploadTarget && editing?.id === uploadTarget) applyChoice(agent);
      else {
        editing = null;
        picker(agent.id);
      }
      uploadTarget = null;
    },
  };
}
