import { esc, teamColor } from "./model.js";
import { $ } from "./dom.js";

export const teamGuide =
  "https://github.com/AhHamedi/somas-garden/blob/main/teams/README.md";

// Old bookmarks still open the team list. Discard retired credentials immediately.
export function takeGroupLink(address, replace) {
  const url = new URL(address);
  if (!url.searchParams.has("groups")) return false;
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (fragment.has("key")) {
    fragment.delete("key");
    url.hash = fragment.toString();
    replace(url.pathname + url.search + url.hash);
  }
  return true;
}

export function courseworkSource(source) {
  if (!source || !/^[1-6]$/.test(source.group) || !/^[0-9a-f]{64}$/.test(source.revision))
    return "";
  const { path, group, revision, repository, commit } = source;
  if (
    path !== `teams/group-${group}/agent.go` &&
    path !== `teams/group-${group}/builder.json`
  )
    return "";
  if (
    /^[0-9a-f]{40}$/.test(commit) &&
    /^[a-zA-Z0-9][a-zA-Z0-9-]*\/(?!\.{1,2}$)[a-zA-Z0-9_.-]+$/.test(repository)
  ) {
    return `<a class="link" href="https://github.com/${esc(repository)}/blob/${commit}/${path}" target="_blank" rel="noopener noreferrer">Source at <code>${commit.slice(0, 8)}</code></a>`;
  }
  return `<code>${path}</code> · SHA-256 <code title="${revision}">${revision.slice(0, 12)}</code>`;
}

function namedTeam(result) {
  const { name, coursework } = result;
  if (result.id) return { name, policy: "custom", strategyId: result.id, coursework };
  if (result.builder)
    return {
      name,
      policy: result.policy || "builder",
      builder: result.builder,
      coursework,
    };
  throw new Error("This group has no behaviour to use.");
}
export class GroupLibrary {
  constructor(setup) {
    this.setup = setup;
    this.api = setup.app.api;
    this.entries = null;
    this.status = "";
    this.error = "";
    this.using = false;
    this.listRequest = 0;
  }

  visible() {
    return this.setup.tab === "groups" && $("setup-dialog").open;
  }

  redraw() {
    if (this.visible()) this.setup.drawBody();
  }

  async load() {
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
    } catch (e) {
      if (request !== this.listRequest) return;
      this.status = "";
      this.error = e.message;
      this.redraw();
    }
  }

  html() {
    const groups = this.entries || [];
    const ready = groups.filter((g) => g.revision).length;
    const busy = this.using || !!this.status;
    const cards = groups
      .map((g) => {
        const saved = g.revision;
        const loaded = this.setup.draft.teams.some((t) => {
          const origin = t.coursework;
          return origin?.group === g.group && origin.revision === g.revision;
        });
        return `<li class="group-card" data-group-slot="${g.group}">
        <div class="group-label"><span class="avatar" aria-hidden="true" style="background:${teamColor(g.group - 1)}"></span>Group ${g.group}</div>
        <h4>${saved ? esc(g.name) : "No submission yet"}</h4>
        ${saved ? `<p>${g.kind === "go" ? "Go" : "Visual builder"} · ${courseworkSource(g)}</p>` : ""}
        <div class="group-card-actions">
          ${saved ? `<button type="button" class="btn" data-group-use="${g.group}" ${busy || loaded ? "disabled" : ""}>${loaded ? "In roster" : "Add to roster"}</button>` : ""}
          ${saved ? "" : `<code>${esc(g.path)}</code>`}
        </div></li>`;
      })
      .join("");
    return `<section class="group-library"><header class="group-heading"><div><h3>Coursework teams</h3><p>Fork the game, add your agent in your group’s folder, then open a pull request for the shared match. <a class="link" href="${teamGuide}" target="_blank" rel="noopener noreferrer">GitHub submission guide</a></p></div>
      <button class="btn" type="button" data-reload-groups ${busy ? "disabled" : ""}>Refresh</button></header>
      ${this.error ? `<p class="group-error" role="alert">${esc(this.error)}</p>` : ""}
      <div role="status" class="group-status">${esc(this.status)}</div>
      ${groups.length ? `<div class="group-match"><div><strong>${ready} of 6 groups ready</strong><p>The six-group roster replaces the teams in this world setup.</p></div><button class="btn primary" type="button" data-use-six ${ready !== 6 || busy ? "disabled" : ""}>Use six-group roster</button></div><ol class="group-grid">${cards}</ol>` : ""}
    </section>`;
  }

  bind() {
    const body = $("cfg-body");
    body.querySelector("[data-reload-groups]").onclick = () => this.load();
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
      ? draft.teams.findIndex((t) => t.coursework?.group === groups[0].group)
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
        if (this.setup.draft !== draft || !this.visible()) return;
        teams.push(namedTeam(result));
      }
      if (all) draft.teams = teams;
      else if (oldIndex >= 0) {
        const previous = draft.teams[oldIndex];
        if (previous.copies) teams[0].copies = previous.copies;
        draft.teams[oldIndex] = teams[0];
      } else draft.teams.push(teams[0]);
    } catch (e) {
      if (this.setup.draft !== draft || !this.visible()) return;
      this.error =
        e.status === 409
          ? "The group file has changed. Refresh the team list and try again."
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
}
