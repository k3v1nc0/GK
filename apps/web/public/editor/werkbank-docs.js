// Werkbank Fase 1 (bouwrecept §0b): de Werkbank en Instellingen tekenen zichzelf uit het schema (kinds.js).
// Geen scherm per functie: elk veld wordt vanzelf een slider, aan/uit, keuzeknoppen, sleep-vak of tekstvak,
// met icoon en Ⓘ-hulp. Alles schrijft naar documenten (/api/authoring/command), nooit naar de node-graph.
import { api, command, el, friendlyError, slug } from "./canonical-api.js";
import { createAssetPicker, createMiniPicker } from "./mini-asset-picker.js?v=20261028-picker1";
import { convertShape } from "./werkbank-world.js?v=20261030-terrein5";
import { renderUsers } from "./werkbank-users.js?v=20261028-users1";
import { computeDamage, rollLoot } from "../shared/combat-math.js";
import { areaSoort, convertAreaSoort } from "../shared/area-soorten.js?v=20261027-om2b";

const DOC_MIME = "application/x-gk-doc";

// Wat de Bibliotheek als filtertabs toont (volgorde = schema-volgorde van soorten met plek "werkbank").
// Plek-soorten (pickup, region, ...) zet je in de 3D-view (stuk 2), die staan niet als kaart in de Bibliotheek.
// Een placed_model is een losse wereldinstantie, geen herbruikbare Bibliotheek-kaart.
// De bron blijft de asset (of bij een pickup: het item); zo groeit de Werkbank niet
// uit tot een lijst met iedere boom/stoel/steen die ooit in de wereld is neergezet.
const LIBRARY_KINDS = ["item_definition", "currency", "ability", "loot_table", "resource_definition", "actor_archetype", "npc", "quest", "recipe"];
// Kaarten met een plek in de wereld: klik in de 3D-view, G = verplaatsen (R = draaien, S = groter/kleiner waar het kan).
export const PLACED_KINDS = Object.freeze({
  pickup: { move: true },
  npc: { move: true, rotate: true },
  placed_model: { move: true, rotate: true, scale: true },
  actor_spawn: { move: true },
  resource_spawn: { move: true }
});

function emptyValue(value) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function cleanBody(body) {
  const out = {};
  for (const [key, value] of Object.entries(body || {})) if (!emptyValue(value)) out[key] = value;
  return out;
}

function shownNumber(value, field) {
  const scale = field.ui?.scale || 1;
  const shown = Number(value) / scale;
  return Math.round(shown * 1000) / 1000;
}

function storedNumber(shown, field) {
  const scale = field.ui?.scale || 1;
  const raw = Number(shown) * scale;
  return field.type === "integer" ? Math.round(raw) : Math.round(raw * 1000) / 1000;
}

function fieldUnit(field) {
  return field.ui?.unit ? " " + field.ui.unit : "";
}

function helpText(field) {
  const help = field.help || {};
  return [help.waarvoor, help.goed ? "Goed: " + help.goed : "", help.probleem ? "Probleem → " + help.probleem : ""].filter(Boolean).join("\n");
}

export function createDocBench(options = {}) {
  const getAssets = options.getAssets || (() => []);
  const onUndoable = options.onUndoable || (() => {});
  const setStatus = options.setStatus || (() => {});
  const onChanged = options.onChanged || (() => {});
  const pendingSaves = new Set();

  const bench = {
    workspace: null,
    loading: null,
    selectedDocKey: null,
    newKind: null,
    settingsView: "project_settings",
    async load() {
      if (bench.loading) return bench.loading;
      bench.loading = api("/api/authoring/workspace?archived=1").then((workspace) => {
        bench.workspace = workspace;
        return workspace;
      }).finally(() => { bench.loading = null; });
      return bench.loading;
    },
    kinds() { return bench.workspace?.kinds || {}; },
    spec(kind) { return bench.kinds()[kind] || null; },
    docs(kind, includeArchived = false) {
      return (bench.workspace?.documents || []).filter((doc) => doc.kind === kind && (includeArchived || !doc.archived));
    },
    doc(docKey) { return (bench.workspace?.documents || []).find((doc) => doc.docKey === docKey) || null; },
    libraryKinds() { return LIBRARY_KINDS.filter((kind) => bench.spec(kind)); },
    settingsKinds() { return Object.keys(bench.kinds()).filter((kind) => bench.spec(kind).place === "instellingen"); },
    // §5.2/§10.7: hoeveel documenten zijn gewijzigd sinds de actieve build (de teller op SAVE TO GAME).
    pendingCount() {
      const ws = bench.workspace;
      if (!ws) return 0;
      // Een build is inhoud-gebaseerd: dezelfde inhoud geeft dezelfde build-ID. Daarom telt de laatste
      // publicatie (ook als die dezelfde build opnieuw actief zette), anders de aanmaaktijd van de actieve build.
      const active = (ws.builds || []).find((build) => build.buildId === ws.release?.activeBuildId);
      const last = (ws.audit || [])[0];
      const since = last && last.action === "publish" ? Date.parse(last.created_at) : (active ? Date.parse(active.createdAt) : 0);
      return (ws.documents || []).filter((doc) => Date.parse(doc.updatedAt) > since).length;
    },
    async flushPendingSaves() {
      while (pendingSaves.size) await Promise.all([...pendingSaves]);
    },
    async publish() {
      await bench.flushPendingSaves();
      // Altijd vers laden: een andere tab of eerdere publicatie kan de releaserevisie al verhoogd hebben.
      await bench.load();
      // Een expliciete SAVE TO GAME altijd uitvoeren; de teller is alleen een indicatie.
      let result;
      try {
        result = await api("/api/authoring/publish", { method: "POST", body: {}, revision: bench.workspace.release.revision });
      } catch (error) {
        if (error.code !== "STALE_RELEASE") throw error;
        await bench.load();
        result = await api("/api/authoring/publish", { method: "POST", body: {}, revision: bench.workspace.release.revision });
      }
      await bench.load();
      return result;
    }
  };

  function assetById(id) {
    return getAssets().find((asset) => asset.id === id) || null;
  }

  function docName(doc) {
    if (!doc) return "?";
    return doc.body?.displayName || doc.body?.gameName || doc.docKey.replace(/^[a-z_]+:/, "");
  }

  function docThumbAsset(doc) {
    const body = doc?.body || {};
    return assetById(body.worldModelAssetId || body.modelAssetId || body.iconAssetId || "");
  }

  function thumb(doc, kindIcon) {
    const box = el("div", { class: "wbdThumb" });
    const asset = docThumbAsset(doc);
    if (asset?.thumbnailPath) box.append(el("img", { src: asset.thumbnailPath, alt: "", loading: "lazy", draggable: "false" }));
    else box.append(el("span", { class: "wbdThumbIcon", text: kindIcon || "📄" }));
    return box;
  }

  // ---------- opslaan met Ctrl+Z ----------

  function saveDoc(kind, doc, body, label) {
    const saving = persistDoc(kind, doc, body, label);
    pendingSaves.add(saving);
    const done = () => pendingSaves.delete(saving);
    saving.then(done, done);
    return saving;
  }

  async function persistDoc(kind, doc, body, label) {
    const clean = cleanBody(body);
    try {
      let result;
      if (doc) {
        result = await command({ command: "update", docKey: doc.docKey, body: clean }, doc.revision);
        onUndoable({ label, docKey: doc.docKey, kind, before: clone(doc.body), after: clone(clean) });
      } else {
        result = await command({ command: "create", kind, body: clean });
        onUndoable({ label, docKey: result.docKey, kind, before: null, after: clone(clean) });
      }
      await bench.load();
      setStatus(label + " opgeslagen. Druk SAVE TO GAME om het in de game te zetten.", "success");
      onChanged();
      return result;
    } catch (error) {
      setStatus(friendlyError(error), "error");
      if (error.code === "STALE_REVISION") await bench.load();
      throw error;
    }
  }

  // Ombouw stap 2: weghalen (Del in de 3D-view) = archiveren, met Ctrl+Z terug.
  bench.archiveDoc = async function archiveDoc(docKey, label) {
    const doc = bench.doc(docKey);
    if (!doc || doc.archived) return false;
    try {
      await command({ command: "archive", docKey: doc.docKey }, doc.revision);
      onUndoable({ label: label || "Weggehaald", docKey: doc.docKey, kind: doc.kind, archive: true });
      await bench.load();
      setStatus((label || "Weggehaald") + ". ↶ zet het terug.", "success");
      onChanged();
      return true;
    } catch (error) {
      setStatus(friendlyError(error), "error");
      return false;
    }
  };

  // Werkbank Fase 1 stuk 2: de 3D-view bewaart verplaatsen/tekenen ook via deze weg (met Ctrl+Z).
  bench.saveDoc = saveDoc;
  bench.docName = docName;

  // Dezelfde Ctrl+Z als de Werkbank al had: editor.js zet dit item op zijn undo-stapel en roept dit terug.
  bench.applyHistory = async function applyHistory(entry, direction) {
    if (!bench.workspace) await bench.load();
    const current = bench.doc(entry.docKey);
    if (!current) throw new Error("Document niet gevonden: " + entry.docKey);
    if (entry.archive !== undefined) {
      const wantArchived = direction === "undo" ? !entry.archive : entry.archive;
      if (current.archived !== wantArchived) await command({ command: wantArchived ? "archive" : "restore", docKey: current.docKey }, current.revision);
      await bench.load();
      onChanged();
      return;
    }
    const target = direction === "undo" ? entry.before : entry.after;
    if (target === null) {
      await command({ command: "archive", docKey: current.docKey }, current.revision);
    } else {
      if (current.archived) {
        const restored = await command({ command: "restore", docKey: current.docKey }, current.revision);
        current.revision = restored.revision;
      }
      if (JSON.stringify(cleanBody(current.body)) !== JSON.stringify(cleanBody(target))) {
        await command({ command: "update", docKey: current.docKey, body: target }, current.revision);
      }
    }
    await bench.load();
    onChanged();
  };

  // ---------- velden ----------

  function infoButton(field, row) {
    const button = el("button", { type: "button", class: "wbdInfo", title: field.help?.waarvoor || "", "aria-label": "Uitleg", text: "i" });
    button.addEventListener("click", () => {
      const open = row.querySelector(".wbdHelp");
      if (open) { open.remove(); return; }
      const help = field.help || {};
      row.append(el("div", { class: "wbdHelp" }, [
        el("div", {}, [el("b", { text: "Waarvoor: " }), help.waarvoor || ""]),
        el("div", {}, [el("b", { text: "Goede waarden: " }), help.goed || ""]),
        el("div", {}, [el("b", { text: "Probleem → oplossing: " }), help.probleem || ""])
      ]));
    });
    return button;
  }

  function fieldRow(key, field, control, wide = false) {
    const row = el("div", { class: "wbdField" + (wide ? " wbdFieldWide" : ""), "data-field": key, title: helpText(field) });
    const label = el("div", { class: "wbdLabel" }, [el("span", { class: "wbdIcon", text: field.ui?.icon || "•" }), el("span", { text: field.label })]);
    row.append(label, el("div", { class: "wbdControl" }, control), infoButton(field, row));
    return row;
  }

  function sliderControl(field, value, onChange) {
    const range = field.ui?.range || [field.min, field.max];
    const step = field.ui?.step || 1;
    const lo = shownNumber(range[0], field);
    const hi = shownNumber(range[1], field);
    const stepShown = shownNumber(step, field);
    const start = emptyValue(value) ? (emptyValue(field.default) ? range[0] : field.default) : value;
    const slider = el("input", { type: "range", min: lo, max: hi, step: stepShown, class: "wbdSlider" });
    const box = el("input", { type: "number", min: shownNumber(field.min, field), max: shownNumber(field.max, field), step: stepShown, class: "wbdNumber" });
    slider.value = String(Math.min(hi, Math.max(lo, shownNumber(start, field))));
    box.value = emptyValue(value) ? "" : String(shownNumber(value, field));
    if (emptyValue(value)) box.placeholder = String(shownNumber(start, field));
    const paint = () => slider.style.setProperty("--wbd-fill", ((Number(slider.value) - lo) / Math.max(1e-9, hi - lo) * 100) + "%");
    paint();
    slider.addEventListener("input", () => { box.value = slider.value; paint(); });
    slider.addEventListener("change", () => onChange(storedNumber(slider.value, field)));
    box.addEventListener("change", () => {
      if (box.value === "") { onChange(null); return; }
      const stored = storedNumber(box.value, field);
      slider.value = String(Math.min(hi, Math.max(lo, shownNumber(stored, field)))); paint();
      onChange(stored);
    });
    return el("div", { class: "wbdSliderRow" }, [slider, el("label", { class: "wbdNumberWrap" }, [box, el("span", { class: "wbdUnit", text: fieldUnit(field).trim() })])]);
  }

  function toggleControl(field, value, onChange) {
    const input = el("input", { type: "checkbox", class: "wbdToggle" });
    input.checked = emptyValue(value) ? Boolean(field.default) : Boolean(value);
    input.addEventListener("change", () => onChange(input.checked));
    return input;
  }

  function dynamicOptions(field, body) {
    const from = field.ui?.optionsFrom || "";
    const ws = bench.workspace || {};
    if (from === "zones") return (ws.zones || []).map((zone) => ({ value: zone.zoneId || zone.id, label: zone.label || zone.name || zone.zoneId || zone.id }));
    if (from === "respawnPolicies") return (ws.respawnPolicies || []).map((policy) => ({ value: policy.id, label: policy.label || policy.name || policy.id }));
    if (from === "equipmentSlots") return (ws.equipmentSlots || []).map((slot) => ({ value: slot.id, label: slot.label || slot.name || slot.id }));
    if (from.startsWith("clips:")) {
      const modelId = body[from.slice(6)];
      const asset = (ws.assets || []).find((entry) => entry.id === modelId);
      return (asset?.animations || []).map((name) => ({ value: typeof name === "string" ? name : name.name, label: typeof name === "string" ? name : name.name }));
    }
    return [];
  }

  function selectControl(field, value, body, onChange) {
    const options = field.options
      ? field.options.map((option) => ({ value: option, label: field.optionLabels?.[option] || option, icon: field.optionIcons?.[option] || "" }))
      : dynamicOptions(field, body);
    const current = emptyValue(value) ? "" : value;
    // Kinderlijk simpel: weinig keuzes met icoon = grote knoppen; anders een keuzelijst.
    if (field.optionIcons && options.length <= 6) {
      const group = el("div", { class: "wbdChoices", role: "radiogroup" });
      for (const option of options) {
        const button = el("button", { type: "button", class: "wbdChoice" + (option.value === current ? " active" : ""), "aria-pressed": String(option.value === current), title: option.label },
          [el("span", { class: "wbdChoiceIcon", text: option.icon }), el("span", { text: option.label })]);
        button.addEventListener("click", () => onChange(option.value));
        group.append(button);
      }
      return group;
    }
    const select = el("select", { class: "wbdSelect" }, [el("option", { value: "", text: field.required ? "Kies..." : "(geen)" })]
      .concat(options.map((option) => el("option", { value: option.value, text: (option.icon ? option.icon + " " : "") + option.label }))));
    if (current && !options.some((option) => option.value === current)) select.append(el("option", { value: current, text: current }));
    select.value = current;
    select.addEventListener("change", () => onChange(select.value || null));
    return select;
  }

  function dropSlot({ value, filled, icon, name, thumbPath, accepts, onDrop, onClear, pickerOptions, onPick, emptyText }) {
    return createMiniPicker({
      value, label: emptyText || name || "Kiezen", placeholder: emptyText,
      selected: filled ? { label: name, thumbnailPath: thumbPath, icon } : null,
      accepts, onDrop, onClear, onChange: onPick,
      getOptions: () => (pickerOptions || []).map((option) => {
        const doc = bench.doc(option.value);
        const asset = doc ? docThumbAsset(doc) : assetById(option.value);
        return { ...option, thumbnailPath: asset?.thumbnailPath || "", icon: doc ? bench.spec(doc.kind)?.icon : icon };
      })
    });
  }

  function assetControl(field, value, onChange) {
    return createAssetPicker({ getAssets, value, assetTypes: [field.assetType], label: field.label,
      onChange, allowClear: !field.required, onError: (message) => setStatus(message, "error") });
  }

  function refControl(field, value, onChange) {
    const target = value ? bench.doc(value) : null;
    const refSpec = bench.spec(field.refKind);
    return dropSlot({
      value, filled: Boolean(value),
      icon: refSpec?.icon || field.ui?.icon || "🔗",
      name: target ? docName(target) : value,
      thumbPath: docThumbAsset(target)?.thumbnailPath || "",
      emptyText: "Sleep hier een " + (refSpec?.label || field.refKind).toLowerCase() + " op",
      accepts: (transfer) => Array.from(transfer.types || []).includes(DOC_MIME),
      onDrop: (transfer) => {
        const docKey = transfer.getData(DOC_MIME);
        if (!docKey.startsWith(field.refKind + ":")) { setStatus("Dit vak wil een " + (refSpec?.label || field.refKind).toLowerCase() + ".", "error"); return; }
        onChange(docKey);
      },
      onClear: field.required ? null : () => onChange(null),
      pickerOptions: bench.docs(field.refKind).map((doc) => ({ value: doc.docKey, label: docName(doc) })),
      onPick: (docKey) => onChange(docKey)
    });
  }

  // Terugbouw zonder nodes: een lijst regels { ref, getallen } (start-spullen, winkel, beloning, ingrediënten).
  // Slepen uit de Bibliotheek of kiezen uit de lijst; per regel de getallen uit field.columns.
  function refListControl(field, value, onChange) {
    const rows = Array.isArray(value) ? value.map((row) => Object.assign({}, row)) : [];
    const wrap = el("div", { class: "wbdLoot" });
    const commit = () => onChange(rows.length ? rows.map((row) => Object.assign({}, row)) : null);
    const kindOk = (docKey) => field.refKinds.some((kind) => String(docKey || "").startsWith(kind + ":"));
    const kindNames = field.refKinds.map((kind) => (bench.spec(kind)?.label || kind).toLowerCase()).join(" of ");
    const options = () => field.refKinds.flatMap((kind) => bench.docs(kind).map((doc) => ({ value: doc.docKey, label: (bench.spec(kind)?.icon || "") + " " + docName(doc) })));
    const taken = (docKey, except = -1) => rows.some((row, index) => index !== except && row.ref === docKey);
    const setRef = (index, docKey) => {
      if (!kindOk(docKey)) { setStatus("Dit vak wil een " + kindNames + ".", "error"); return; }
      if (taken(docKey, index)) { setStatus("Die staat er al in; pas het aantal aan.", "error"); return; }
      if (index < 0) rows.push(Object.assign({ ref: docKey }, Object.fromEntries(field.columns.map((column) => [column.key, column.default]))));
      else rows[index].ref = docKey;
      commit();
    };
    rows.forEach((row, index) => {
      const target = bench.doc(row.ref);
      const slot = dropSlot({
        value: row.ref, filled: Boolean(row.ref), icon: bench.spec(String(row.ref).split(":")[0])?.icon || "🔗",
        name: target ? docName(target) : row.ref, thumbPath: docThumbAsset(target)?.thumbnailPath || "", emptyText: "Sleep hier",
        accepts: (transfer) => Array.from(transfer.types || []).includes(DOC_MIME),
        onDrop: (transfer) => setRef(index, transfer.getData(DOC_MIME)),
        onClear: null, pickerOptions: options(), onPick: (docKey) => setRef(index, docKey)
      });
      const numbers = field.columns.map((column) => {
        const input = el("input", { type: "number", min: column.min, max: column.max, step: 1, class: "wbdQty", title: column.label });
        input.value = String(row[column.key] ?? column.default);
        input.addEventListener("change", () => {
          const next = Math.round(Number(input.value));
          row[column.key] = Number.isFinite(next) ? Math.min(column.max, Math.max(column.min, next)) : column.default;
          commit();
        });
        return el("label", { class: "wbdLootQty", title: column.label }, [column.icon + " " + column.label, input]);
      });
      const remove = el("button", { type: "button", class: "wbdMini", title: "Regel weg", text: "✕" });
      remove.addEventListener("click", () => { rows.splice(index, 1); commit(); });
      wrap.append(el("div", { class: "wbdLootRow" }, [slot].concat(numbers, [remove])));
    });
    if (rows.length < (field.maxItems || 24)) {
      const add = dropSlot({
        filled: false, icon: "➕", name: "", emptyText: "Sleep een " + kindNames + " hier (of kies)",
        accepts: (transfer) => Array.from(transfer.types || []).includes(DOC_MIME),
        onDrop: (transfer) => setRef(-1, transfer.getData(DOC_MIME)),
        pickerOptions: options(), onPick: (docKey) => setRef(-1, docKey)
      });
      add.classList.add("wbdSlotAdd");
      wrap.append(add);
    }
    return wrap;
  }

  // Klassen: een lijst modellen (uiterlijk). Elk vak is een gewone asset-kiezer; het lege vak onderaan voegt toe.
  // (Eigen naam: assetListControl bestaat al voor begroeiing.)
  function modelListControl(field, value, onChange) {
    const list = Array.isArray(value) ? value.slice() : [];
    const wrap = el("div", { class: "wbdLoot" });
    const commit = () => onChange(list.length ? list.slice() : null);
    list.forEach((assetId, index) => {
      const picker = createAssetPicker({ getAssets, value: assetId, assetTypes: [field.assetType], label: field.label + " " + (index + 1),
        allowClear: true, onError: (message) => setStatus(message, "error"),
        onChange: (next) => {
          if (!next) list.splice(index, 1);
          else if (list.includes(next) && next !== assetId) { setStatus("Dat model staat er al in.", "error"); return; }
          else list[index] = next;
          commit();
        } });
      wrap.append(el("div", { class: "wbdLootRow" }, [el("span", { class: "wbdMuted", text: index === 0 ? "⭐" : String(index + 1) }), picker]));
    });
    if (list.length < (field.maxItems || 40)) {
      const add = createAssetPicker({ getAssets, value: null, assetTypes: [field.assetType], label: "➕ " + field.label,
        allowClear: false, onError: (message) => setStatus(message, "error"),
        onChange: (next) => {
          if (!next) return;
          if (list.includes(next)) { setStatus("Dat model staat er al in.", "error"); return; }
          list.push(next);
          commit();
        } });
      wrap.append(el("div", { class: "wbdLootRow wbdSlotAdd" }, [el("span", { class: "wbdMuted", text: "➕" }), add]));
    }
    return wrap;
  }

  function lootControl(field, value, onChange) {
    const rows = Array.isArray(value) ? value.map((entry) => Object.assign({}, entry)) : [];
    const wrap = el("div", { class: "wbdLoot" });
    const commit = () => onChange(rows.length ? rows.map((entry) => Object.assign({}, entry)) : null);
    rows.forEach((entry, index) => {
      const ref = entry.itemRef || entry.tableRef || "";
      const target = bench.doc(ref);
      const slot = dropSlot({
        value: ref, filled: Boolean(ref), icon: entry.tableRef ? "🎁" : "🎒", name: target ? docName(target) : ref,
        thumbPath: docThumbAsset(target)?.thumbnailPath || "", emptyText: "Sleep item",
        accepts: (transfer) => Array.from(transfer.types || []).includes(DOC_MIME),
        onDrop: (transfer) => {
          const docKey = transfer.getData(DOC_MIME);
          delete entry.itemRef; delete entry.tableRef;
          if (docKey.startsWith("item_definition:")) entry.itemRef = docKey;
          else if (docKey.startsWith("loot_table:")) entry.tableRef = docKey;
          else { setStatus("Sleep een item of een loottabel.", "error"); return; }
          commit();
        },
        onClear: null,
        pickerOptions: bench.docs("item_definition").map((doc) => ({ value: doc.docKey, label: "🎒 " + docName(doc) }))
          .concat(bench.docs("loot_table").map((doc) => ({ value: doc.docKey, label: "🎁 " + docName(doc) }))),
        onPick: (docKey) => { delete entry.itemRef; delete entry.tableRef; if (docKey.startsWith("loot_table:")) entry.tableRef = docKey; else entry.itemRef = docKey; commit(); }
      });
      const chanceField = { type: "integer", min: 1, max: 10000, ui: { step: 100, unit: "%", scale: 100 } };
      const chance = sliderControl(chanceField, entry.chanceBp ?? 10000, (next) => { entry.chanceBp = Math.max(1, next || 1); commit(); });
      const qty = (key) => {
        const input = el("input", { type: "number", min: 1, max: 9999, step: 1, class: "wbdQty", title: key === "minQty" ? "Minimaal" : "Maximaal" });
        input.value = String(entry[key] ?? 1);
        input.addEventListener("change", () => { entry[key] = Math.max(1, Math.round(Number(input.value) || 1)); commit(); });
        return input;
      };
      const remove = el("button", { type: "button", class: "wbdMini", title: "Regel weg", text: "✕" });
      remove.addEventListener("click", () => { rows.splice(index, 1); commit(); });
      wrap.append(el("div", { class: "wbdLootRow" }, [slot, el("div", { class: "wbdLootChance", title: "Kans" }, ["🎲", chance]), el("div", { class: "wbdLootQty", title: "Aantal" }, ["🔢", qty("minQty"), "–", qty("maxQty")]), remove]));
    });
    const add = dropSlot({
      filled: false, icon: "➕", name: "", emptyText: "Sleep een item of loottabel hier om een regel toe te voegen",
      accepts: (transfer) => Array.from(transfer.types || []).includes(DOC_MIME),
      onDrop: (transfer) => {
        const docKey = transfer.getData(DOC_MIME);
        const entry = { chanceBp: 10000, minQty: 1, maxQty: 1 };
        if (docKey.startsWith("item_definition:")) entry.itemRef = docKey;
        else if (docKey.startsWith("loot_table:")) entry.tableRef = docKey;
        else { setStatus("Sleep een item of een loottabel.", "error"); return; }
        rows.push(entry); commit();
      },
      pickerOptions: bench.docs("item_definition").map((doc) => ({ value: doc.docKey, label: "🎒 " + docName(doc) })),
      onPick: (docKey) => { rows.push({ itemRef: docKey, chanceBp: 10000, minQty: 1, maxQty: 1 }); commit(); }
    });
    add.classList.add("wbdSlotAdd");
    wrap.append(add);
    return wrap;
  }

  // Ombouw stap 2: de instellingen van een vlak, per soort uit het schema (field.soorten).
  // Geeft gewone veldrijen terug (zelfde breedte en ⓘ-plek als de andere velden): main in beeld, extra onder ⚙️ meer.
  function areaSettingsRows(field, body, onChange) {
    const soort = areaSoort(body);
    const specs = field.soorten?.[soort]?.fields || {};
    const current = Object.assign({}, body.settings || {});
    const rows = { main: [], extra: [] };
    const set = (key, next) => {
      if (emptyValue(next)) delete current[key]; else current[key] = next;
      onChange(Object.keys(current).length ? Object.assign({}, current) : null);
    };
    for (const [key, spec] of Object.entries(specs)) {
      if (spec.type === "json") continue;
      const value = current[key];
      const asField = { type: spec.type, label: spec.label, min: spec.min, max: spec.max, default: spec.default, help: spec.help,
        ui: { icon: spec.icon, step: spec.step, range: spec.range } };
      let input;
      if (spec.type === "number") input = sliderControl(asField, value ?? spec.default, (next) => set(key, next));
      else if (spec.type === "boolean") input = toggleControl(asField, value, (next) => set(key, next === spec.default ? null : next));
      else if (spec.type === "select") {
        const choice = Object.assign({}, asField, { options: spec.options.map((option) => option.value),
          optionLabels: Object.fromEntries(spec.options.map((option) => [option.value, option.label])),
          optionIcons: spec.options.some((option) => option.icon) ? Object.fromEntries(spec.options.map((option) => [option.value, option.icon || "•"])) : undefined });
        input = selectControl(choice, value ?? spec.default, body, (next) => set(key, next));
      } else if (spec.type === "color") {
        input = el("input", { type: "color", class: "wbdColor" });
        input.value = value || spec.default || "#888888";
        input.addEventListener("change", () => set(key, input.value));
      } else if (spec.type === "asset") input = assetControl(Object.assign({}, asField, { assetType: "image" }), value, (next) => set(key, next));
      else if (spec.type === "assetList") {
        input = assetListControl(Array.isArray(value) ? value : [], current.sourceScaleMultipliers || {}, (next, scales) => {
          if (next.length) current[key] = next; else delete current[key];
          const kept = Object.fromEntries(Object.entries(scales || {}).filter(([id, scale]) => next.includes(id) && scale !== 1));
          if (Object.keys(kept).length) current.sourceScaleMultipliers = kept; else delete current.sourceScaleMultipliers;
          onChange(Object.keys(current).length ? Object.assign({}, current) : null);
        });
      }
      else {
        input = el("input", { type: "text", class: "wbdText", maxlength: spec.maxLength || 120 });
        input.value = emptyValue(value) ? "" : String(value);
        input.placeholder = emptyValue(spec.default) ? "" : String(spec.default);
        input.addEventListener("change", () => set(key, input.value.trim() || null));
      }
      (spec.more ? rows.extra : rows.main).push(fieldRow(key, asField, input, spec.type === "assetList"));
    }
    return rows;
  }

  // Meerdere modellen in één vak (begroeiing): slepen om toe te voegen, ✕ om weg te halen,
  // en per model een maat-slider (begint een model te groot, schuif hem kleiner).
  function assetListControl(ids, scales, onChange) {
    const list = ids.slice();
    const sizes = Object.assign({}, scales || {});
    const wrap = el("div", { class: "wbdAssetList" });
    const sizeField = { type: "number", min: 0.01, max: 100, ui: { step: 0.05, range: [0.05, 3] } };
    list.forEach((id, index) => {
      const slot = createAssetPicker({ getAssets: () => getAssets().filter((asset) => asset.id === id || !list.includes(asset.id)),
        value: id, assetTypes: ["model"], label: "Model voor begroeiing", onError: (message) => setStatus(message, "error"),
        onChange: (next) => {
          if (!next) list.splice(index, 1);
          else { list[index] = next; sizes[next] = sizes[id] ?? 1; }
          if (next !== id) delete sizes[id];
          onChange(list, sizes);
        } });
      const size = sliderControl(sizeField, sizes[id] ?? 1, (next) => { sizes[id] = next || 1; onChange(list, sizes); });
      wrap.append(el("div", { class: "wbdAssetListItem", title: "Maat van dit model (1 = normaal)" }, [slot, el("span", { class: "wbdNote", text: "📏 maat" }), size]));
    });
    const add = createAssetPicker({ getAssets: () => getAssets().filter((asset) => !list.includes(asset.id)), assetTypes: ["model"],
      label: "Model toevoegen", placeholder: "Kies of sleep een model…", allowClear: false,
      onError: (message) => setStatus(message, "error"), onChange: (id) => { if (id && !list.includes(id)) onChange(list.concat([id]), sizes); } });
    add.classList.add("wbdSlotAdd");
    wrap.append(add);
    return wrap;
  }

  function control(key, field, body, isNew, onChange) {
    const value = body[key];
    const type = field.ui?.control;
    if (type === "slider") return sliderControl(field, value, onChange);
    if (type === "toggle") return toggleControl(field, value, onChange);
    if (type === "select") return selectControl(field, value, body, onChange);
    if (type === "asset") return assetControl(field, value, onChange);
    if (type === "ref") return refControl(field, value, onChange);
    if (type === "loot") return lootControl(field, value, onChange);
    if (type === "refList") return refListControl(field, value, onChange);
    if (type === "assetList") return modelListControl(field, value, onChange);
    if (type === "color") {
      const input = el("input", { type: "color", class: "wbdColor" });
      input.value = emptyValue(value) ? (field.default || "#888888") : value;
      input.addEventListener("change", () => onChange(input.value));
      return input;
    }
    if (type === "tags") {
      const input = el("input", { type: "text", class: "wbdText", placeholder: "label, label" });
      input.value = Array.isArray(value) ? value.join(", ") : "";
      input.addEventListener("change", () => {
        const tags = Array.from(new Set(input.value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean)));
        onChange(tags.length ? tags : null);
      });
      return input;
    }
    if (type === "points") {
      const count = Array.isArray(value) ? value.length : 0;
      return el("span", { class: "wbdNote", text: count ? count + " punten (tekenen in de 3D-view)" : "Teken in de 3D-view" });
    }
    const input = el("input", { type: "text", class: "wbdText", maxlength: field.maxLength || 200 });
    input.value = emptyValue(value) ? "" : String(value);
    if (type === "id" && !isNew) input.disabled = true;
    input.addEventListener("change", () => onChange(input.value.trim() || null));
    return input;
  }

  // ---------- het paneel dat zichzelf tekent ----------

  // Tekent één document (of een nieuw document) uit het schema. Bestaande documenten slaan elke wijziging
  // meteen op (realtime, met Ctrl+Z); een nieuw document heeft een ✓ Maken-knop.
  bench.renderForm = function renderForm(host, { kind, docKey = null, title = null, onDone = null, place = null } = {}) {
    const spec = bench.spec(kind);
    host.replaceChildren();
    if (!spec) { host.append(el("div", { class: "wbdEmpty", text: "Onbekende soort." })); return; }
    const doc = docKey ? bench.doc(docKey) : (spec.singleton ? bench.docs(kind)[0] || null : null);
    const isNew = !doc;
    // Een nieuw document onthoudt zijn invoer in bench.draft tot ✓ Maken of ✕ Annuleren.
    if (isNew && (!bench.draft || bench.draft.kind !== kind)) {
      const start = {};
      for (const [key, field] of Object.entries(spec.fields)) if (!emptyValue(field.default)) start[key] = clone(field.default);
      bench.draft = { kind, body: start, idTouched: false };
    }
    const body = isNew ? bench.draft.body : clone(doc.body);
    const where = place || spec.place;
    const head = el("div", { class: "wbdHead" }, [
      el("span", { class: "wbdHeadIcon", text: kind === "area" ? (spec.fields.soort.optionIcons?.[areaSoort(body)] || spec.icon) : spec.icon }),
      el("div", { class: "wbdHeadText" }, [el("div", { class: "wbdHeadKind", text: isNew ? "Nieuw: " + spec.label : spec.label }), el("div", { class: "wbdHeadName", text: title || (isNew ? "" : docName(doc)) })])
    ]);
    if (doc?.archived) head.append(el("span", { class: "wbdBadge", text: "gearchiveerd" }));
    host.append(head);

    const visible = el("div", { class: "wbdFields" });
    const more = el("div", { class: "wbdFields wbdMore", hidden: true });
    const viewportOnly = [];
    for (const [key, field] of Object.entries(spec.fields)) {
      if (field.ui?.place === "viewport") { viewportOnly.push([key, field]); continue; }
      if (field.ui?.place !== where) continue;
      if (kind === "area" && field.ui?.soorten && !field.ui.soorten.includes(areaSoort(body))) continue;
      const onChange = async (next) => {
        // Ombouw stap 2: soort wisselen houdt de punten; de instellingen van de oude soort gaan weg.
        if (kind === "area" && key === "soort") {
          const converted = convertAreaSoort(body, next || "deelgebied");
          for (const old of Object.keys(body)) delete body[old];
          Object.assign(body, converted);
          if (isNew) { rerender(); return; }
          try { await saveDoc(kind, doc, body, "Vlak · soort " + (field.optionLabels?.[next] || next)); } catch {}
          rerender();
          return;
        }
        // Vorm wisselen (⬛/⚪/🔷): de nieuwe vorm komt op dezelfde plek, zonder half-ingevulde velden.
        if (key === "shape" && body.shape && next && next !== body.shape) {
          const converted = convertShape(body, next);
          for (const old of Object.keys(body)) delete body[old];
          Object.assign(body, converted);
        }
        if (emptyValue(next)) delete body[key]; else body[key] = next;
        if (isNew && key === spec.idField) bench.draft.idTouched = true;
        if (key === "displayName" && isNew && spec.idField && !bench.draft.idTouched) {
          const prefix = { item_definition: "item", ability: "ability", loot_table: "loot", resource_definition: "resource", actor_archetype: "actor",
            currency: "currency", npc: "npc", quest: "quest", recipe: "recipe", placed_model: "model", player_class: "class",
            terrain_texture: "tex", terrain_stamp: "stamp", terrain_water: "water" }[kind];
          if (prefix && next) body[spec.idField] = prefix + "." + slug(next);
        }
        if (isNew && !spec.singleton) { rerender(); return; }
        try { await saveDoc(kind, doc, body, spec.label + " · " + field.label); } catch {}
        rerender();
      };
      if (field.ui?.control === "areaSettings") {
        const rows = areaSettingsRows(field, body, onChange);
        visible.append(...rows.main);
        more.append(...rows.extra);
        continue;
      }
      const row = fieldRow(key, field, control(key, field, body, isNew, onChange), ["loot", "refList", "assetList"].includes(field.ui?.control));
      (field.ui?.more ? more : visible).append(row);
    }
    host.append(visible);
    if (more.childElementCount) {
      const toggle = el("button", { type: "button", class: "wbdMoreToggle", "aria-expanded": "false", text: "⚙️ meer (" + more.childElementCount + ")" });
      toggle.addEventListener("click", () => {
        more.hidden = !more.hidden;
        toggle.setAttribute("aria-expanded", String(!more.hidden));
        bench.moreOpen = !more.hidden;
      });
      if (bench.moreOpen) { more.hidden = false; toggle.setAttribute("aria-expanded", "true"); }
      host.append(toggle, more);
    }
    if (viewportOnly.length && !spec.singleton) {
      const summary = viewportOnly.filter(([key, field]) => !emptyValue(body[key]) && (Array.isArray(body[key]) || ["integer", "number"].includes(field.type)))
        .map(([key, field]) => field.ui.icon + " " + (Array.isArray(body[key]) ? body[key].length + " punten" : shownNumber(body[key], field) + fieldUnit(field))).join(" · ");
      const moves = PLACED_KINDS[kind];
      const how = moves ? "Verplaatsen: klik het in de 3D-view en druk G" + (moves.rotate ? ", R = draaien" : "") + (moves.scale ? ", S = groter/kleiner" : "") + "."
          + (kind === "npc" ? " Of sleep deze kaart uit de Bibliotheek op de wereld." : "")
        : kind === "area" ? "Vorm aanpassen in de 3D-view: punten slepen, G/R/T voor het hele vlak, F = punt erbij, Del = punt weg."
        : "Verplaatsen in de 3D-view komt in een volgende ombouwstap.";
      host.append(el("div", { class: "wbdNote", text: "📍 Plek in de wereld: " + (summary || "nog niet gezet") + ". " + how }));
    }
    const actions = el("div", { class: "wbdActions" });
    if (isNew) {
      const create = el("button", { type: "button", class: "wbdPrimary", text: "✓ Maken" });
      create.addEventListener("click", async () => {
        create.disabled = true;
        try {
          const result = await saveDoc(kind, null, body, spec.label + " gemaakt");
          bench.selectedDocKey = result.docKey;
          bench.newKind = null;
          bench.draft = null;
          if (onDone) onDone(result.docKey);
        } catch { create.disabled = false; }
      });
      const cancel = el("button", { type: "button", class: "wbdGhost", text: "✕ Annuleren" });
      cancel.addEventListener("click", () => { bench.newKind = null; bench.draft = null; if (onDone) onDone(null); });
      actions.append(create, cancel);
    } else if (!spec.singleton) {
      const archive = el("button", { type: "button", class: "wbdGhost", text: doc.archived ? "↩︎ Terugzetten"
        : (kind === "area" || kind === "placed_model" || kind === "pickup" ? "🗑️ Uit wereld halen (Del)" : "🗄️ Archiveren") });
      archive.addEventListener("click", async () => {
        try {
          const before = doc.archived;
          await command({ command: before ? "restore" : "archive", docKey: doc.docKey }, doc.revision);
          onUndoable({ label: spec.label + (before ? " teruggezet" : " gearchiveerd"), docKey: doc.docKey, kind, archive: !before });
          await bench.load();
          onChanged();
          rerender();
        } catch (error) { setStatus(friendlyError(error), "error"); }
      });
      actions.append(archive);
    }
    if (!isNew && kind === "actor_archetype") host.append(actorTrial(body));
    if (!isNew && kind === "loot_table") host.append(lootTrial(body));
    if (actions.childElementCount) host.append(actions);

    function rerender() {
      bench.renderForm(host, { kind, docKey: isNew ? null : doc.docKey, title, onDone, place });
    }
  };

  // ---------- Proef (rekent in de browser met dezelfde regels als de server, schrijft niets) ----------

  const idOf = (ref) => String(ref || "").replace(/^[a-z_]+:/, "");

  function trialBox(buttonText, run) {
    const out = el("div", { class: "wbdNote", "data-wbd": "trial-out", hidden: true });
    const button = el("button", { type: "button", class: "wbdGhost", "data-wbd": "trial", text: buttonText });
    button.addEventListener("click", () => { out.hidden = false; out.textContent = run(); });
    return el("div", { class: "wbdTrial" }, [button, out]);
  }

  function actorTrial(body) {
    return trialBox("🧪 Proef: hoeveel slagen?", () => {
      const enemyAbility = bench.doc(body.abilityRef)?.body;
      const project = bench.docs("project_settings")[0]?.body || {};
      const playerAbility = bench.doc(project.playerAbilityRef)?.body || { baseDamage: 16, powerScalingBp: 5000, armorFactorBp: 3500, cooldownMs: 250 };
      const playerHit = computeDamage(playerAbility, 10, body.armor || 0);
      const hits = Math.ceil((body.healthMax || 1) / Math.max(1, playerHit));
      const enemyHit = enemyAbility ? computeDamage(enemyAbility, body.attackPower || 0, 0) : null;
      return "⚔️ Speler (kracht 10) raakt voor " + playerHit + " → " + hits + " slagen (" + (hits * (playerAbility.cooldownMs || 250) / 1000).toFixed(1) + " s). "
        + (enemyHit === null ? "Sleep een aanval op de vijand." : "👹 Vijand raakt een speler zonder pantser voor " + enemyHit + " per " + ((enemyAbility.cooldownMs || 1000) / 1000) + " s.");
    });
  }

  function lootTrial(body) {
    return trialBox("🧪 Proef: 100 keer rollen", () => {
      const tables = {};
      for (const doc of bench.docs("loot_table")) tables[doc.body.lootTableId] = doc.body;
      tables[body.lootTableId] = body;
      const runtime = {};
      for (const [id, table] of Object.entries(tables)) {
        runtime[id] = { entries: (table.entries || []).map((entry) => Object.assign({ chanceBp: entry.chanceBp, minQty: entry.minQty, maxQty: entry.maxQty },
          entry.itemRef ? { itemId: idOf(entry.itemRef) } : { lootTableId: idOf(entry.tableRef) })) };
      }
      const totals = new Map();
      for (let i = 0; i < 100; i += 1) for (const drop of rollLoot(runtime, body.lootTableId, "proef|" + i)) totals.set(drop.itemId, (totals.get(drop.itemId) || 0) + drop.quantity);
      const names = new Map(bench.docs("item_definition").map((doc) => [doc.body.itemId, doc.body.displayName]));
      return totals.size ? "🎁 Gemiddeld per keer: " + Array.from(totals, ([id, total]) => (names.get(id) || id) + " " + (total / 100).toFixed(2)).join(", ") : "Niets gevallen in 100 keer.";
    });
  }

  // ---------- Bibliotheek: kaarten uit documenten ----------

  bench.renderLibraryTiles = function renderLibraryTiles(host, { kinds, query = "", onSelect, onNew }) {
    host.replaceChildren();
    const q = query.trim().toLowerCase();
    const grid = el("div", { class: "wbdTiles" });
    for (const kind of kinds) {
      const spec = bench.spec(kind);
      if (!spec) continue;
      for (const doc of bench.docs(kind)) {
        const name = docName(doc);
        if (q && !name.toLowerCase().includes(q)) continue;
        const tile = el("button", { type: "button", class: "wbdTile" + (bench.selectedDocKey === doc.docKey ? " active" : ""), draggable: "true", title: spec.label + ": " + name });
        tile.append(thumb(doc, spec.icon), el("span", { class: "wbdTileName", text: name }), el("span", { class: "wbdTileKind", text: spec.icon }));
        tile.addEventListener("dragstart", (event) => {
          event.dataTransfer.setData(DOC_MIME, doc.docKey);
          event.dataTransfer.setData("text/plain", name);
          event.dataTransfer.effectAllowed = "copyLink";
        });
        tile.addEventListener("click", () => onSelect(doc.docKey));
        grid.append(tile);
      }
    }
    if (kinds.length === 1 && onNew) {
      const spec = bench.spec(kinds[0]);
      const add = el("button", { type: "button", class: "wbdTile wbdTileNew", title: "Nieuw: " + spec.label }, [el("div", { class: "wbdThumb" }, el("span", { class: "wbdThumbIcon", text: "➕" })), el("span", { class: "wbdTileName", text: "Nieuw" })]);
      add.addEventListener("click", () => onNew(kinds[0]));
      grid.append(add);
    }
    if (!grid.childElementCount) host.append(el("div", { class: "wbdEmpty", text: q ? "Niets gevonden." : "Nog leeg." }));
    else host.append(grid);
  };

  // ---------- Instellingen ----------

  bench.settingsMenu = function settingsMenu() {
    return bench.settingsKinds().map((kind) => ({ id: kind, icon: bench.spec(kind).icon, label: bench.spec(kind).singleton ? bench.spec(kind).label : (bench.spec(kind).plural || bench.spec(kind).label) }))
      .concat([{ id: "builds", icon: "🚀", label: "Builds" }])
      .concat(bench.workspace?.user?.role === "admin" ? [{ id: "users", icon: "👥", label: "Gebruikers" }] : []);
  };

  bench.renderSettingsMenu = function renderSettingsMenu(host, onSelect) {
    host.replaceChildren();
    for (const item of bench.settingsMenu()) {
      const button = el("button", { type: "button", class: "wbdMenuItem" + (bench.settingsView === item.id ? " active" : "") }, [el("span", { class: "wbdMenuIcon", text: item.icon }), el("span", { text: item.label })]);
      button.addEventListener("click", () => { bench.settingsView = item.id; onSelect(item.id); });
      host.append(button);
    }
  };

  bench.renderSettingsCard = function renderSettingsCard(host, rerender) {
    if (bench.settingsView === "builds") return renderBuilds(host, rerender);
    if (bench.settingsView === "users") return renderUsers(host, { setStatus, rerender });
    // Instellingen met meerdere kaarten (bijv. Klassen): lijst + nieuw + bewerken op dezelfde plek.
    if (bench.spec(bench.settingsView) && !bench.spec(bench.settingsView).singleton) return renderChildKind(host, bench.settingsView);
    bench.renderForm(host, { kind: bench.settingsView, place: "instellingen" });
  };

  // Een lijst kaarten in Instellingen (Klassen): kiezen, nieuw maken en bewerken op dezelfde plek.
  bench.childDocKey = {};
  function renderChildKind(host, kind) {
    const spec = bench.spec(kind);
    const plural = spec.plural || spec.label;
    const docs = bench.docs(kind);
    host.replaceChildren(el("div", { class: "wbdHead" }, [el("span", { class: "wbdHeadIcon", text: spec.icon }),
      el("div", { class: "wbdHeadText" }, [el("div", { class: "wbdHeadKind", text: plural }), el("div", { class: "wbdHeadName", text: docs.length + " stuks" })])]));
    if (kind === "player_class") {
      host.append(el("div", { class: "wbdNote", text: docs.length
        ? "Elke speler heeft per klasse een eigen character met eigen tas en level, en wisselt in de game via 🧙 Characters. Nieuwe spelers beginnen met de eerste klasse."
        : "Nog geen klassen: iedereen speelt dan met 100 levens, 10 kracht en geen start-spullen. Maak bijvoorbeeld DPS, Healer en Tank." }));
    }
    const list = el("div", { class: "wbdChildList" });
    const selected = bench.childDocKey[kind] || null;
    for (const doc of docs) {
      const button = el("button", { type: "button", class: "wbdGhost" + (selected === doc.docKey ? " active" : ""), text: spec.icon + " " + docName(doc) });
      button.addEventListener("click", () => { bench.childDocKey[kind] = selected === doc.docKey ? null : doc.docKey; renderChildKind(host, kind); });
      list.append(button);
    }
    const add = el("button", { type: "button", class: "wbdGhost" + (selected === "new" ? " active" : ""), text: "＋ Nieuwe " + spec.label.toLowerCase() });
    add.addEventListener("click", () => { bench.childDocKey[kind] = "new"; bench.draft = null; renderChildKind(host, kind); });
    list.append(add);
    host.append(list);
    if (!selected) return;
    const form = el("div", { class: "wbdChildForm" });
    host.append(form);
    bench.renderForm(form, { kind, docKey: selected === "new" ? null : selected, place: "instellingen",
      onDone: (docKey) => { bench.childDocKey[kind] = docKey || null; renderChildKind(host, kind); } });
  }

  function renderBuilds(host, rerender) {
    host.replaceChildren();
    const ws = bench.workspace;
    const { release, builds = [], audit = [], user } = ws;
    const pending = bench.pendingCount();
    host.append(el("div", { class: "wbdHead" }, [el("span", { class: "wbdHeadIcon", text: "🚀" }), el("div", { class: "wbdHeadText" }, [el("div", { class: "wbdHeadKind", text: "Builds" }), el("div", { class: "wbdHeadName", text: release.activeBuildId ? "Actief: " + release.activeBuildId.slice(0, 10) : "Nog geen build" })])]));
    host.append(el("div", { class: "wbdNote", text: pending ? "🟠 " + pending + " wijziging(en) nog niet in de game. Druk SAVE TO GAME bovenin." : "🟢 Alles staat in de game." }));
    const list = el("div", { class: "wbdBuilds" });
    for (const build of builds) {
      const active = build.buildId === release.activeBuildId;
      const back = el("button", { type: "button", class: "wbdGhost", text: active ? "✓ actief" : "↩︎ terugzetten", disabled: active || user.role !== "admin", title: "Zet de game terug naar deze build" });
      back.addEventListener("click", async () => {
        const reason = window.prompt("Waarom terugzetten?", "Terug naar vorige versie");
        if (!reason) return;
        try {
          await api("/api/authoring/rollback", { method: "POST", body: { buildId: build.buildId, reason }, revision: release.revision });
          setStatus("Build " + build.buildId.slice(0, 10) + " staat weer in de game.", "success");
          await bench.load(); rerender();
        } catch (error) { setStatus(friendlyError(error), "error"); }
      });
      list.append(el("div", { class: "wbdBuild" + (active ? " active" : "") }, [
        el("span", { class: "wbdBuildIcon", text: active ? "🟢" : "⚪" }),
        el("div", { class: "wbdBuildText" }, [el("div", { text: new Date(build.createdAt).toLocaleString() }), el("div", { class: "wbdMuted", text: build.provenance.documents.length + " kaarten · " + build.buildId.slice(0, 10) })]),
        back
      ]));
    }
    host.append(list.childElementCount ? list : el("div", { class: "wbdEmpty", text: "Nog geen builds." }));
    if (audit.length) {
      host.append(el("details", { class: "wbdDetails" }, [el("summary", { text: "📒 Logboek" }),
        el("ul", {}, audit.map((row) => el("li", { text: new Date(row.created_at).toLocaleString() + " · " + (row.action === "publish" ? "🚀 gepubliceerd" : "↩︎ teruggezet") + (row.reason ? " · " + row.reason : "") })))]));
    }
    host.append(renderCutover(rerender));
    host.append(renderRegionCleanup(rerender));
  }

  // Ronde 3: de oude gebieden (zoals Sunny Meadow1) gaan weg. Deelgebieden, obstakels en vijand- of grondstofplekken
  // die erbij hoorden blijven gewoon staan, los in de wereld. Elke stap is een gewone opslag (↶ zet het terug).
  function renderRegionCleanup(rerender) {
    const regions = bench.docs("region");
    const box = el("details", { class: "wbdDetails" }, [el("summary", { text: "🗺️ Oude gebieden weghalen (" + regions.length + ")" })]);
    if (!regions.length) {
      box.append(el("div", { class: "wbdNote", text: "Er zijn geen oude gebieden meer. Deelgebieden staan los in de wereld." }));
      return box;
    }
    const keys = new Set(regions.map((doc) => doc.docKey));
    const linked = ["area", "collider", "actor_spawn", "resource_spawn"].flatMap((kind) => bench.docs(kind)).filter((doc) => keys.has(doc.body?.regionRef));
    const list = el("ul", {}, regions.map((doc) => el("li", { text: "🗺️ " + docName(doc) })));
    const go = el("button", { type: "button", class: "wbdPrimary", "data-wbd": "remove-regions",
      text: "Haal " + regions.length + " gebied(en) weg (" + linked.length + " kaart(en) blijven staan)" });
    go.addEventListener("click", async () => {
      go.disabled = true;
      const failed = [];
      for (const doc of linked) {
        const body = Object.assign({}, doc.body);
        delete body.regionRef;
        try { await saveDoc(doc.kind, bench.doc(doc.docKey) || doc, body, docName(doc) + " los van gebied"); }
        catch (error) { failed.push(docName(doc) + ": " + friendlyError(error)); }
      }
      for (const doc of regions) {
        if (!(await bench.archiveDoc(doc.docKey, "Gebied " + docName(doc) + " weggehaald"))) failed.push(docName(doc));
      }
      setStatus(failed.length ? "Niet alles gelukt: " + failed.join("; ") : "Oude gebieden weggehaald. Druk SAVE TO GAME.", failed.length ? "error" : "success");
      rerender();
    });
    box.append(el("div", { class: "wbdNote", text: "Een gebied was een onzichtbare doos om deelgebieden heen. Die is niet meer nodig: deelgebieden staan los in de wereld." }), list, go);
    return box;
  }

  // A6: verhuizen uit Nodes per domein (zelfde rapport en zelfde server-regels als in Canoniek).
  function renderCutover(rerender) {
    const labels = { project: "🎮 Projectnaam", items: "🎒 Items", pickups: "✨ Item-pickups", areas: "🧩 Vlakken en paden" };
    const box = el("details", { class: "wbdDetails" }, [el("summary", { text: "📦 Verhuizen uit Nodes" })]);
    const output = el("div");
    const load = el("button", { type: "button", class: "wbdGhost", text: "Bekijk verhuisrapport" });
    load.addEventListener("click", async () => {
      load.disabled = true;
      try {
        const report = await api("/api/authoring/cutover");
        output.replaceChildren(...report.plans.map((plan) => {
          const done = plan.writer === "canonical";
          const accept = el("input", { type: "checkbox" });
          const go = el("button", { type: "button", class: "wbdPrimary", text: "Verhuis", disabled: done || bench.workspace.user.role !== "admin" || plan.blocking.length > 0 });
          go.addEventListener("click", async () => {
            if (!window.confirm("Na verhuizen beheer je dit alleen nog in de Werkbank. In Nodes wordt het alleen-lezen. Doorgaan?")) return;
            go.disabled = true;
            try {
              const result = await api("/api/authoring/cutover/finalize", { method: "POST", body: { domain: plan.domain, acceptDiffs: accept.checked }, revision: report.graphRevision });
              setStatus(labels[plan.domain] + " verhuisd: " + result.created.length + " nieuw. Druk SAVE TO GAME.", "success");
              await bench.load(); rerender();
            } catch (error) { go.disabled = false; setStatus(friendlyError(error), "error"); }
          });
          const state = done ? "✅ verhuisd" : plan.ok ? "🟢 klaar om te verhuizen" : plan.blocking.length ? "⛔ blokkeert" : "🟠 " + plan.diffCount + " verschillen";
          const detail = el("pre", { class: "wbdReport" });
          detail.textContent = JSON.stringify({ blokkerend: plan.blocking, verschillen: plan.parity.filter((entry) => entry.diffs.length), nieuw: plan.create.length }, null, 2);
          return el("div", { class: "wbdCutover" }, [
            el("div", { class: "wbdCutoverHead" }, [el("b", { text: labels[plan.domain] || plan.domain }), el("span", { text: state })]),
            plan.diffCount > 0 && !done ? el("label", { class: "wbdCheck" }, [accept, el("span", { text: "Ik heb de verschillen bekeken" })]) : null,
            done ? null : go,
            el("details", {}, [el("summary", { text: "details" }), detail])
          ]);
        }));
      } catch (error) { setStatus(friendlyError(error), "error"); }
      finally { load.disabled = false; }
    });
    box.append(el("div", { class: "wbdNote", text: "Volgorde: Projectnaam, Items, daarna Item-pickups. Vlakken en paden (begroeiing, paden, blokkades, loopvlakken) mogen los. Het rapport schrijft niets." }), load, output);
    return box;
  }

  return bench;
}
