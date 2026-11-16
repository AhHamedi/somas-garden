import { esc, teamColor } from "/game/model.js";

export const $ = (id) => document.getElementById(id);
export const icon = (name, cls = "") =>
  `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/** Replaces markup only when it has changed, so focus and hover survive. */
export function setHTML(el, html) {
  if (!el) return false;
  if (el.__html === html) return false;
  el.__html = html;
  el.innerHTML = html;
  return true;
}

export function avatar(a, roles = [], cls = "") {
  const officer = roles.some((r) => r.kind === "officer");
  const rep = roles.some((r) => r.kind === "representative");
  const role = officer
    ? `<svg class="i role" aria-label="Officer"><use href="#i-crown"/></svg>`
    : rep
      ? `<svg class="i role rep" aria-label="Representative"><use href="#i-flag"/></svg>`
      : "";
  return `<span class="avatar ${cls} ${a.alive ? "" : "dead"}" style="background:${teamColor(a.team)}">${role}</span>`;
}

export function meter(share, kind = "", extra = "") {
  const pct = Math.round(Math.max(0, Math.min(1, share || 0)) * 1000) / 10;
  return `<span class="meter ${kind}"><i style="width:${pct}%"></i>${extra}</span>`;
}

export function chip(text, kind = "", iconName = "") {
  return `<span class="chip ${kind}">${iconName ? icon(iconName) : ""}${esc(text)}</span>`;
}

let toastTimer;
export function toast(message, error = false) {
  const el = $("toast");
  el.textContent = message;
  el.classList.toggle("error", error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), error ? 7000 : 3500);
}
