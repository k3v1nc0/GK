// F3-E3-T02: shell voor de canonieke werkbank. Losse pagina naast de Nodes-editor; raakt editor.js niet.
// Elke view krijgt een AbortSignal; bij wisselen van tab wordt alles netjes afgebroken (geen lekkende listeners).
import { mountProjectSettingsView } from "./project-settings-view.js";
import { mountItemDefinitionView } from "./item-definition-view.js";
import { mountPickupPlacementView } from "./pickup-placement-view.js";
import { mountReleaseView } from "./release-view.js";

import { api, el, friendlyError } from "./canonical-api.js";

const VIEWS = {
  project: { label: "Project", mount: mountProjectSettingsView },
  items: { label: "Items", mount: mountItemDefinitionView },
  pickups: { label: "Pickups", mount: mountPickupPlacementView },
  release: { label: "Publiceren", mount: mountReleaseView }
};

export function createShell(root) {
  let current = null;
  const nav = el("nav", { class: "cwTabs" });
  const status = el("div", { class: "cwStatus", role: "status" });
  const host = el("main", { class: "cwView" });
  root.append(nav, status, host);

  const ctx = {
    workspace: null,
    setStatus(text, kind = "info") { status.textContent = text || ""; status.dataset.kind = kind; },
    async refresh() {
      ctx.workspace = await api("/api/authoring/workspace?archived=1");
      return ctx.workspace;
    },
    docs(kind) { return (ctx.workspace?.documents || []).filter((doc) => doc.kind === kind); }
  };

  async function show(name) {
    if (current) { current.abort(); current = null; }
    host.replaceChildren();
    for (const button of nav.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.view === name));
    const controller = new AbortController();
    current = controller;
    try {
      await ctx.refresh();
      if (controller.signal.aborted) return;
      await VIEWS[name].mount(host, ctx, controller.signal);
      ctx.setStatus("");
    } catch (error) {
      ctx.setStatus(friendlyError(error), "error");
    }
    try { window.localStorage.setItem("gk.canonical.view", name); } catch {}
  }

  for (const [name, view] of Object.entries(VIEWS)) {
    const button = el("button", { type: "button", "data-view": name, text: view.label });
    button.addEventListener("click", () => show(name));
    nav.append(button);
  }
  let start = "project";
  try { start = window.localStorage.getItem("gk.canonical.view") || "project"; } catch {}
  show(VIEWS[start] ? start : "project");
  return { show, unmount() { if (current) current.abort(); host.replaceChildren(); } };
}

const mountPoint = typeof document !== "undefined" ? document.getElementById("canonicalApp") : null;
if (mountPoint) createShell(mountPoint);
