// F3-E3-T05: items maken, bewerken, archiveren. De ID wordt uit de naam gemaakt; Kevin typt nooit een ID.
// Icoon en model kies je uit de assetbibliotheek (menselijke refkiezer), niet door een ID te typen.
import { api, command, el, friendlyError, slug } from "./canonical-api.js";

let assetCache = null;
async function loadAssets() {
  if (!assetCache) {
    try { assetCache = (await api("/api/assets")).assets || []; } catch { assetCache = []; }
  }
  return assetCache;
}

function selectFrom(options, value, emptyLabel) {
  const node = el("select", {}, (emptyLabel ? [el("option", { value: "", text: emptyLabel })] : []).concat(options.map((option) => el("option", { value: option.value, text: option.label }))));
  node.value = value ?? "";
  return node;
}

function checkbox(checked) {
  const node = el("input", { type: "checkbox" });
  node.checked = Boolean(checked);
  return node;
}

async function itemForm(ctx, doc, signal, onDone) {
  const fields = ctx.workspace.kinds.item_definition.fields;
  const body = doc?.body || { category: "material", rarity: "common", stackable: true, stackLimit: 99, bindPolicy: "unbound", tradable: true, questItem: false };
  const assets = await loadAssets();
  const assetOptions = (types) => assets.filter((asset) => types.includes(asset.assetType)).map((asset) => ({ value: asset.id, label: asset.name || asset.id }));
  const options = (field) => fields[field].options.map((option) => ({ value: option, label: option }));

  const name = el("input", { type: "text", "data-cw": "item-name", maxlength: fields.displayName.maxLength, required: true });
  name.value = body.displayName || "";
  const category = selectFrom(options("category"), body.category);
  const rarity = selectFrom(options("rarity"), body.rarity);
  const stackable = checkbox(body.stackable !== false);
  const stack = el("input", { type: "number", min: 1, max: fields.stackLimit.max, step: 1, required: true });
  stack.value = body.stackLimit;
  const bind = selectFrom(options("bindPolicy"), body.bindPolicy || "", "(niet ingesteld)");
  const tradable = checkbox(body.tradable);
  const questItem = checkbox(body.questItem);
  const icon = selectFrom(assetOptions(["image", "texture"]), body.iconAssetId || "", "(geen icoon)");
  const model = selectFrom(assetOptions(["model"]), body.worldModelAssetId || "", "(geen model)");
  const tags = el("input", { type: "text", placeholder: "bijv. erts, materiaal" });
  tags.value = (body.tags || []).join(", ");
  const value = el("input", { type: "number", min: 0, step: 1 });
  value.value = body.vendorValue ?? "";
  // Fase 05: uitrusting (slot uit de gepubliceerde wereld) en bonussen.
  const slots = ctx.workspace.equipmentSlots || [];
  const equipSlot = selectFrom(slots.map((slot) => ({ value: slot.id, label: slot.label + " (" + slot.id + ")" })), body.equipSlot || "", "(geen uitrusting)");
  const attackBonus = el("input", { type: "number", min: 0, max: 1000000, step: 1 });
  attackBonus.value = body.attackPowerBonus ?? "";
  const armorBonus = el("input", { type: "number", min: 0, max: 1000000, step: 1 });
  armorBonus.value = body.armorBonus ?? "";
  const idPreview = el("p", { class: "cwHint" });
  const updatePreview = () => { idPreview.textContent = "ID: " + (doc ? body.itemId : "item." + slug(name.value)); };
  updatePreview();
  name.addEventListener("input", updatePreview, { signal });

  const save = el("button", { type: "submit", text: doc ? "Opslaan" : "Item maken" });
  const cancel = el("button", { type: "button", class: "ghost", text: "Annuleren" });
  const row = (label, input) => el("label", {}, [el("span", { text: label }), input]);
  const form = el("form", { class: "cwForm" }, [
    el("h3", { text: doc ? "Item bewerken" : "Nieuw item" }),
    row(fields.displayName.label, name),
    row(fields.category.label, category),
    row(fields.rarity.label, rarity),
    el("label", { class: "cwCheck" }, [stackable, el("span", { text: fields.stackable.label })]),
    row(fields.stackLimit.label, stack),
    row(fields.bindPolicy.label, bind),
    el("label", { class: "cwCheck" }, [tradable, el("span", { text: fields.tradable.label })]),
    el("label", { class: "cwCheck" }, [questItem, el("span", { text: fields.questItem.label })]),
    row(fields.iconAssetId.label, icon),
    row(fields.worldModelAssetId.label, model),
    row(fields.tags.label + " (komma's ertussen)", tags),
    row(fields.vendorValue.label + " (alleen server)", value),
    row(fields.equipSlot.label + " (zet Stapelbaar uit)", equipSlot),
    row(fields.attackPowerBonus.label, attackBonus),
    row(fields.armorBonus.label, armorBonus),
    idPreview,
    el("div", { class: "cwRow" }, [save, cancel])
  ]);
  cancel.addEventListener("click", () => onDone(false), { signal });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const next = {
      itemId: doc ? body.itemId : "item." + slug(name.value),
      displayName: name.value.trim(),
      category: category.value,
      rarity: rarity.value,
      stackable: stackable.checked,
      stackLimit: Number(stack.value),
      tradable: tradable.checked,
      questItem: questItem.checked
    };
    if (bind.value) next.bindPolicy = bind.value;
    if (icon.value) next.iconAssetId = icon.value;
    if (model.value) next.worldModelAssetId = model.value;
    const tagList = Array.from(new Set(tags.value.split(",")
      .map((tag) => tag.trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_").replace(/^[^a-z0-9]+|_+$/g, "").slice(0, 64))
      .filter(Boolean)));
    next.tags = tagList;
    if (value.value !== "") next.vendorValue = Number(value.value);
    if (equipSlot.value) next.equipSlot = equipSlot.value;
    if (attackBonus.value !== "" && Number(attackBonus.value) > 0) next.attackPowerBonus = Number(attackBonus.value);
    if (armorBonus.value !== "" && Number(armorBonus.value) > 0) next.armorBonus = Number(armorBonus.value);
    save.disabled = true;
    try {
      const result = doc
        ? await command({ command: "update", docKey: doc.docKey, body: next }, doc.revision)
        : await command({ command: "create", kind: "item_definition", body: next });
      ctx.setStatus("Item opgeslagen (revisie " + result.revision + "). Publiceer om het in de game te zien.", "ok");
      onDone(true);
    } catch (error) {
      save.disabled = false;
      ctx.setStatus(friendlyError(error), "error");
    }
  }, { signal });
  return form;
}

export function mountItemDefinitionView(host, ctx, signal) {
  const rerender = async (reload) => {
    if (signal.aborted) return;
    if (reload) await ctx.refresh();
    host.replaceChildren();
    mountItemDefinitionView(host, ctx, signal);
  };
  const openForm = async (doc) => {
    try { editorSlot.replaceChildren(await itemForm(ctx, doc, signal, (changed) => rerender(changed))); } catch (error) { ctx.setStatus(friendlyError(error), "error"); }
  };
  const filter = el("input", { type: "search", placeholder: "Zoek op naam of ID" });
  const items = ctx.docs("item_definition");
  const editorSlot = el("div");
  const tbody = el("tbody");
  const renderRows = () => {
    const query = filter.value.trim().toLowerCase();
    tbody.replaceChildren(...items.filter((doc) => !query || doc.body.displayName.toLowerCase().includes(query) || doc.body.itemId.includes(query)).map((doc) => {
      const edit = el("button", { type: "button", class: "ghost", text: "Bewerken", disabled: doc.archived });
      const toggle = el("button", { type: "button", class: "ghost", text: doc.archived ? "Terugzetten" : "Archiveren" });
      edit.addEventListener("click", () => openForm(doc), { signal });
      toggle.addEventListener("click", async () => {
        try {
          await command({ command: doc.archived ? "restore" : "archive", docKey: doc.docKey }, doc.revision);
          ctx.setStatus(doc.archived ? "Item teruggezet." : "Item gearchiveerd. Spelers die het hebben houden het.", "ok");
          rerender(true);
        } catch (error) {
          ctx.setStatus(friendlyError(error), "error");
        }
      }, { signal });
      return el("tr", { class: doc.archived ? "cwArchived" : "" }, [
        el("td", { text: doc.body.displayName }), el("td", { text: doc.body.itemId }),
        el("td", { text: doc.body.category }), el("td", { text: doc.body.rarity }),
        el("td", { text: (doc.archived ? "gearchiveerd" : "actief") + (doc.legacyRef ? " · uit Nodes" : "") }), el("td", {}, [edit, toggle])
      ]);
    }));
  };
  filter.addEventListener("input", renderRows, { signal });
  renderRows();
  const list = el("table", { class: "cwTable" }, [
    el("thead", {}, el("tr", {}, ["Naam", "ID", "Categorie", "Zeldzaamheid", "Status", ""].map((text) => el("th", { text })))),
    tbody
  ]);
  const add = el("button", { type: "button", "data-cw": "new-item", text: "+ Nieuw item" });
  add.addEventListener("click", () => openForm(null), { signal });
  host.append(
    el("h2", { text: "Items" }),
    el("div", { class: "cwRow" }, [add, filter]),
    editorSlot,
    items.length ? list : el("p", { class: "cwHint", text: "Nog geen items. Maak er een, of verhuis de items uit Nodes via Publiceren." })
  );
}
