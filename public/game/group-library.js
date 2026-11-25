// Six shared submissions. Importing pins the selected revision in a world's own roster.
import { esc, teamColor } from "./model.js";
import { $, icon } from "./dom.js";

const MAX_SOURCE_BYTES = 64 * 1024;
const kindName = (kind) => (kind === "builder" ? "Visual builder" : "Go");
const byteLength = (value) => new TextEncoder().encode(value).length;

export function takeGroupLink(address, replace) {
  const url = new URL(address);
  if (!url.searchParams.has("groups")) return null;
  const group = Number(url.searchParams.get("groups"));
  const fragment = new URLSearchParams(url.hash.slice(1));
  const key = fragment.get("key") || "";
  if (fragment.has("key")) {
    fragment.delete("key");
    url.hash = fragment.toString();
    replace(url.pathname + url.search + url.hash);
  }
  return {
    group: Number.isInteger(group) && group >= 1 && group <= 6 ? group : null,
    key,
  };
}

function namedTeam(result) {
  if (result.id) return { name: result.name, policy: "custom", strategyId: result.id };
  if (result.builder)
    return {
      name: result.name,
      policy: result.policy || "builder",
      builder: result.builder,
    };
  throw new Error("This group has no saved behaviour to use.");
}

export class GroupLibrary {
  constructor(setup) {
    this.setup = setup;
    this.api = setup.app.api;
    this.entries = null;
    this.status = "";
    this.error = "";
    this.using = false;
    this.origins = new WeakMap();
    this.listRequest = 0;
  }

  visible() {
    return this.setup.tab === "groups" && $("setup-dialog").open;
  }

  redraw() {
    if (this.visible()) this.setup.drawBody();
  }

  async load(link) {
    const request = ++this.listRequest;
    this.error = "";
    this.status = "Loading groups…";
    this.redraw();
    try {
      const { groups } = await this.api("/groups");
      if (request !== this.listRequest) return;
      this.entries = groups;
      this.status = "";
      this.redraw();
      if (link?.group && this.visible()) {
        const entry = groups.find((g) => g.group === link.group);
        if (entry) this.edit(entry, link.key);
      }
    } catch (e) {
      if (request !== this.listRequest) return;
      this.status = "";
      this.error = e.message;
      this.redraw();
    }
  }

  html() {
    const groups = this.entries || [];
    const ready = groups.filter((g) => g.revision > 0).length;
    const busy = this.using || !!this.status;
    const cards = groups
      .map((g) => {
        const saved = g.revision > 0;
        const when = new Date(g.updatedAt);
        const date =
          saved && !Number.isNaN(when.valueOf())
            ? new Intl.DateTimeFormat(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              }).format(when)
            : "";
        const loaded = this.setup.draft.teams.some((t) => {
          const origin = this.origins.get(t);
          return origin?.group === g.group && origin.revision === g.revision;
        });
        return `<li class="group-card" data-group-slot="${g.group}">
        <div class="group-label"><span class="avatar" aria-hidden="true" style="background:${teamColor(g.group - 1)}"></span>Group ${g.group}</div>
        <h4>${saved ? esc(g.name) : "No submission yet"}</h4>
        ${saved ? `<p>${kindName(g.kind)} · Revision ${g.revision}${date ? ` · ${esc(date)}` : ""}</p>` : ""}
        <div class="group-card-actions">
          ${saved ? `<button type="button" class="btn" data-group-use="${g.group}" ${busy || loaded ? "disabled" : ""}>${loaded ? "In roster" : "Add to roster"}</button>` : ""}
          <button type="button" class="btn" data-group-edit="${g.group}" ${busy ? "disabled" : ""}>${saved ? "Manage" : "Upload behaviour"}<span class="visually-hidden"> for Group ${g.group}</span></button>
        </div></li>`;
      })
      .join("");
    return `<section class="group-library"><header class="group-heading"><div><h3>Group library</h3><p>Teams publish their behaviour here for everyone to use in a world.</p></div>
      <button class="btn" type="button" data-reload-groups ${busy ? "disabled" : ""}>Refresh</button></header>
      ${this.error ? `<p class="group-error" role="alert">${esc(this.error)}</p>` : ""}
      <div role="status" class="group-status">${esc(this.status)}</div>
      ${groups.length ? `<div class="group-match"><div><strong>${ready} of 6 groups ready</strong><p>The six-group roster replaces the teams in this world setup.</p></div><button class="btn primary" type="button" data-use-six ${ready !== 6 || busy ? "disabled" : ""}>Use six-group roster</button></div><ol class="group-grid">${cards}</ol>` : ""}
    </section>`;
  }

  bind() {
    const body = $("cfg-body");
    body.querySelector("[data-reload-groups]").onclick = () => this.load();
    for (const b of body.querySelectorAll("[data-group-edit]"))
      b.onclick = () =>
        this.edit(this.entries.find((g) => g.group === Number(b.dataset.groupEdit)));
    for (const b of body.querySelectorAll("[data-group-use]"))
      b.onclick = () =>
        this.use([this.entries.find((g) => g.group === Number(b.dataset.groupUse))]);
    const all = body.querySelector("[data-use-six]");
    if (all) all.onclick = () => this.use(this.entries);
    // Keep setup navigation and submission consistent while group imports are running.
    if (this.using) {
      $("setup-dialog")
        .querySelectorAll("[data-stab],[data-defaults],button[type=submit]")
        .forEach((b) => (b.disabled = true));
    }
  }

  async use(groups) {
    if (this.using) return;
    const draft = this.setup.draft;
    const all = groups.length === 6;
    const oldIndex = !all
      ? draft.teams.findIndex((t) => this.origins.get(t)?.group === groups[0].group)
      : -1;
    this.error = "";
    if (!all && oldIndex < 0 && draft.teams.length >= 24) {
      this.error = "Remove a team from the roster before adding another.";
      this.redraw();
      return;
    }
    this.using = true;
    const teams = [];
    try {
      for (const g of groups) {
        this.status = `Preparing Group ${g.group}…`;
        this.redraw();
        const result = await this.api(`/groups/${g.group}/use`, { revision: g.revision });
        const team = namedTeam(result);
        this.origins.set(team, { group: g.group, revision: g.revision });
        teams.push(team);
      }
      if (this.setup.draft !== draft || !this.visible()) return;
      if (all) draft.teams = teams;
      else if (oldIndex >= 0) {
        const previous = draft.teams[oldIndex];
        if (previous.copies) teams[0].copies = previous.copies;
        draft.teams[oldIndex] = teams[0];
      } else draft.teams.push(teams[0]);
    } catch (e) {
      this.error =
        e.status === 409
          ? "A group published a newer revision. Refresh the library and try again."
          : e.message;
    } finally {
      this.status = "";
      this.using = false;
      $("setup-dialog")
        .querySelectorAll("[data-stab],[data-defaults]")
        .forEach((b) => (b.disabled = false));
      this.redraw();
    }
    if (!this.error && this.setup.draft === draft && this.visible()) {
      const tab = $("setup-dialog").querySelector('[data-stab="teams"]');
      tab.click();
      tab.focus();
    }
  }

  edit(entry, initialKey = "") {
    const dlg = $("group-dialog");
    const group = entry.group;
    dlg.innerHTML = `<form id="group-unlock"><div class="dlg-head"><h2 id="group-title">Group ${group}</h2><button type="button" class="icon-button" data-close aria-label="Close">${icon("close")}</button></div>
      <div class="dlg-body"><label class="field"><span>Group edit code</span><input id="group-key" type="password" required autocomplete="off" autocapitalize="none" spellcheck="false"/><small>Use the private code your organiser gave your group.</small></label>
      <p class="group-error" role="alert"></p></div><div class="dlg-foot"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Unlock group</button></div></form>`;
    const form = $("group-unlock");
    const keyField = $("group-key");
    keyField.value = initialKey;
    dlg.onclose = () => {
      if (!dlg.open) dlg.replaceChildren();
    };
    form.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => dlg.close()));
    form.onsubmit = async (e) => {
      e.preventDefault();
      const button = form.querySelector('[type="submit"]');
      const key = keyField.value.trim();
      button.disabled = true;
      button.textContent = "Unlocking…";
      const status = form.querySelector('[role="alert"]');
      status.textContent = "";
      try {
        const current = await this.api(`/groups/${group}/edit`, { key });
        if (dlg.open && form.isConnected) this.editor(current, key);
      } catch (error) {
        status.textContent = error.message;
        keyField.focus();
      } finally {
        button.disabled = false;
        button.textContent = "Unlock group";
      }
    };
    dlg.showModal();
    if (initialKey) form.requestSubmit();
  }

  editor(entry, key) {
    const dlg = $("group-dialog");
    const group = entry.group;
    const stored = entry.revision > 0;
    const initialKind = entry.kind || "go";
    const choices = this.setup.draft.teams
      .map((t, i) =>
        t.builder || t.strategyId ? `<option value="${i}">${esc(t.name)}</option>` : "",
      )
      .join("");
    dlg.innerHTML = `<form id="group-form"><div class="dlg-head"><h2 id="group-title">Group ${group}</h2><button type="button" class="icon-button" data-close aria-label="Close">${icon("close")}</button></div>
      <div class="dlg-body group-editor">
        <label class="field"><span>Team name</span><input id="group-name" maxlength="80" required value="${esc(entry.name)}" /></label>
        <div class="group-load"><label class="field"><span>Behaviour format</span><select id="group-kind"><option value="go">Go</option><option value="builder">Visual builder</option></select></label>
        ${choices ? `<label class="field"><span>Copy from this world setup</span><select id="group-copy"><option value="">Choose a team…</option>${choices}</select></label>` : ""}
        </div>
        <div class="group-file-line"><label class="field"><span>Upload a file</span><input type="file" id="group-file"/></label><a class="link" href="/society-example.go" download data-example>Go example</a></div>
        <div data-builder-tools><button type="button" class="btn" data-design-builder>Open visual editor</button></div>
        <label class="field"><span id="group-source-label"></span><textarea id="group-source" class="code" spellcheck="false" required></textarea></label>
        <p class="note">Anyone can import a copy of your published behaviour and inspect it in their workspace. Your group’s code is needed to publish changes.</p>
        <p class="group-error" role="alert"></p><p class="group-status" role="status"></p></div>
        <div class="dlg-foot"><span>${stored ? `Current revision ${entry.revision}` : "First submission"}</span><button type="submit" class="btn primary">${stored ? "Publish update" : "Publish behaviour"}</button></div></form>`;
    const form = $("group-form"),
      kind = $("group-kind"),
      area = $("group-source"),
      file = $("group-file");
    const status = form.querySelector('[role="status"]'),
      error = form.querySelector('[role="alert"]');
    const drafts = {
      go: entry.source || "",
      builder: entry.builder ? JSON.stringify(entry.builder, null, 2) : "",
    };
    let mode = initialKind;
    let loading = false;
    let builderPolicy = entry.policy || "builder";
    const update = (next) => {
      mode = kind.value = next;
      area.value = drafts[mode];
      file.value = "";
      file.accept = mode === "go" ? ".go,text/plain" : ".json,application/json";
      form.querySelector("#group-source-label").textContent =
        mode === "go" ? "Go source" : "Visual builder JSON";
      area.placeholder =
        mode === "go"
          ? "Upload a .go file or paste its source."
          : "Use the visual editor, upload a .json file or paste your settings.";
      form.querySelector("[data-example]").hidden = mode !== "go";
      form.querySelector("[data-builder-tools]").hidden = mode !== "builder";
    };
    const readBuilder = () => {
      const builder = JSON.parse(area.value);
      if (!builder || Array.isArray(builder) || typeof builder !== "object")
        throw new Error("A visual behaviour must be a JSON object.");
      return builder;
    };
    form.querySelector("[data-design-builder]").onclick = () => {
      try {
        const builder = area.value.trim() ? readBuilder() : null;
        this.setup.openGroupBuilder(
          form.querySelector("#group-name").value || `Group ${group}`,
          builder,
          (result) => {
            area.value = drafts.builder = JSON.stringify(result, null, 2);
            error.textContent = "";
          },
        );
      } catch (e) {
        error.textContent = e.message;
      }
    };
    const busy = (value) => {
      loading = value;
      form
        .querySelectorAll(
          "input,select,textarea,[data-design-builder],button[type=submit]",
        )
        .forEach((el) => (el.disabled = value));
    };
    update(mode);
    kind.onchange = () => {
      drafts[mode] = area.value;
      update(kind.value);
      status.textContent = error.textContent = "";
    };
    form.querySelector("[data-close]").onclick = () => dlg.close();
    file.onchange = async () => {
      const f = file.files[0];
      if (!f || loading) return;
      error.textContent = "";
      if (f.size > MAX_SOURCE_BYTES) {
        error.textContent = "Choose a file of 64 KiB or less.";
        return;
      }
      busy(true);
      try {
        area.value = drafts[mode] = await f.text();
      } catch (e) {
        error.textContent = e.message;
      } finally {
        busy(false);
      }
    };
    const copyTeam = $("group-copy");
    if (copyTeam)
      copyTeam.onchange = async () => {
        if (copyTeam.value === "" || loading) return;
        const t = this.setup.draft.teams[Number(copyTeam.value)];
        busy(true);
        error.textContent = "";
        try {
          drafts[mode] = area.value;
          if (t.strategyId) {
            const item = await this.api(`/strategies/${t.strategyId}`);
            drafts.go = item.source;
            update("go");
          } else {
            drafts.builder = JSON.stringify(t.builder, null, 2);
            builderPolicy = t.policy || "builder";
            update("builder");
          }
          copyTeam.value = "";
        } catch (e) {
          error.textContent = e.message;
        } finally {
          busy(false);
        }
      };
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (loading) return;
      error.textContent = "";
      const name = $("group-name").value.trim();
      const value = area.value;
      if (!name || byteLength(name) > 80) {
        error.textContent = "Enter a team name of 1 to 80 UTF-8 bytes.";
        return;
      }
      if (!value.trim() || byteLength(value) > MAX_SOURCE_BYTES) {
        error.textContent = "Enter a behaviour of up to 64 KiB.";
        return;
      }
      let payload;
      try {
        if (mode === "go") payload = { source: value };
        else payload = { builder: readBuilder(), policy: builderPolicy };
      } catch (e) {
        error.textContent = e.message;
        return;
      }
      busy(true);
      status.textContent = mode === "go" ? "Compiling and publishing…" : "Publishing…";
      try {
        const saved = await this.api(`/groups/${group}`, {
          name,
          key,
          expectedRevision: entry.revision,
          ...payload,
        });
        this.entries = this.entries.map((g) => (g.group === group ? saved : g));
        if (dlg.open && form.isConnected) dlg.close();
        this.error = "";
        this.status = "";
        this.redraw();
        if (this.visible()) {
          $("cfg-body").querySelector(".group-status").textContent =
            `Published ${saved.name}, revision ${saved.revision}.`;
          $("cfg-body").querySelector(`[data-group-edit="${group}"]`)?.focus();
        }
      } catch (e) {
        status.textContent = "";
        error.textContent =
          e.status === 409
            ? "Another submission was published. Copy your changes, then reopen the group to see its latest revision."
            : e.message;
      } finally {
        busy(false);
      }
    };
    $("group-name").focus();
  }
}
