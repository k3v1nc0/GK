// F3-E3-T04: projectinstellingen als gewoon formulier (geen raw JSON).
import { command, el, friendlyError } from "./canonical-api.js";

export function mountProjectSettingsView(host, ctx, signal) {
  const doc = ctx.docs("project_settings")[0] || null;
  const fields = ctx.workspace.kinds.project_settings.fields;
  const name = el("input", { type: "text", "data-cw": "game-name", maxlength: fields.gameName.maxLength, required: true });
  const motd = el("input", { type: "text", maxlength: fields.motd.maxLength });
  name.value = doc?.body.gameName || "";
  motd.value = doc?.body.motd || "";
  const save = el("button", { type: "submit", "data-cw": "save-project", text: "Opslaan", disabled: true });
  const info = el("p", { class: "cwHint", text: doc ? "Revisie " + doc.revision + " · laatst gewijzigd " + new Date(doc.updatedAt).toLocaleString() : "Nog geen projectinstellingen. Vul ze in en sla op." });
  const form = el("form", { class: "cwForm" }, [
    el("h2", { text: "Projectinstellingen" }),
    el("label", {}, [el("span", { text: fields.gameName.label }), name]),
    el("label", {}, [el("span", { text: fields.motd.label + " (optioneel)" }), motd]),
    el("div", { class: "cwRow" }, [save]),
    info
  ]);
  host.append(form);

  const markDirty = () => { save.disabled = false; ctx.setStatus("Niet opgeslagen wijzigingen.", "dirty"); };
  name.addEventListener("input", markDirty, { signal });
  motd.addEventListener("input", markDirty, { signal });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = { gameName: name.value.trim() };
    if (motd.value.trim()) body.motd = motd.value.trim();
    save.disabled = true;
    try {
      const result = doc
        ? await command({ command: "update", docKey: doc.docKey, body }, doc.revision)
        : await command({ command: "create", kind: "project_settings", body });
      ctx.setStatus("Opgeslagen (revisie " + result.revision + "). Publiceer om het in de game te zien.", "ok");
      await ctx.refresh();
      host.replaceChildren();
      if (!signal.aborted) mountProjectSettingsView(host, ctx, signal);
    } catch (error) {
      save.disabled = false;
      ctx.setStatus(friendlyError(error), "error");
    }
  }, { signal });
}
