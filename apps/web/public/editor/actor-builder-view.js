// Fase 05 (F5-E3-T02): tab "Vijanden" in de canonieke werkbank. Aanvallen, loottabellen, grondstoffen en
// vijanden als gewone formulieren (uit het schema), en plaatsen op een licht 2D-bovenaanzicht.
// Kevin ziet meters, seconden en procenten; opgeslagen wordt in mm, ms en basispunten (hele getallen).
// "Proef" rekent in de browser met dezelfde rekenregels als de server en schrijft niets.
import { command, el, friendlyError, slug } from "./canonical-api.js";
import { computeDamage, rollLoot } from "../shared/combat-math.js";
import { metersToMm, mmToMeters, rectContains } from "../shared/spatial.js";

const SECTIONS = {
  actor_archetype: "Vijanden",
  ability: "Aanvallen",
  loot_table: "Loot",
  resource_definition: "Grondstoffen",
  place: "Plaatsen"
};
const WIDTH = 880;
const HEIGHT = 560;
const VIEW_KEY = "gk.canonical.actorView";

// Eenheid per veldnaam: wat Kevin ziet <-> wat opgeslagen wordt.
function unitFor(key) {
  if (/MmPerS$/.test(key)) return { label: "m/s", toUi: (v) => v / 1000, toDoc: (v) => Math.round(v * 1000) };
  if (/Mm$/.test(key)) return { label: "m", toUi: (v) => v / 1000, toDoc: (v) => Math.round(v * 1000) };
  if (/Ms$/.test(key)) return { label: "s", toUi: (v) => v / 1000, toDoc: (v) => Math.round(v * 1000) };
  if (/Bp$/.test(key)) return { label: "%", toUi: (v) => v / 100, toDoc: (v) => Math.round(v * 100) };
  return { label: "", toUi: (v) => v, toDoc: (v) => Math.round(v) };
}

const idOf = (ref) => String(ref || "").replace(/^[a-z_]+:/, "");
const activeDocs = (ctx, kind) => ctx.docs(kind).filter((doc) => !doc.archived);

function refSelect(ctx, refKind, value, emptyLabel) {
  const options = activeDocs(ctx, refKind).map((doc) => el("option", { value: doc.docKey, text: doc.body.displayName || idOf(doc.docKey) }));
  const node = el("select", {}, (emptyLabel ? [el("option", { value: "", text: emptyLabel })] : []).concat(options));
  node.value = value || "";
  return node;
}

function lootEntriesEditor(ctx, entries) {
  const rows = el("div", { class: "cwForm" });
  const list = (entries || []).map((entry) => Object.assign({}, entry));
  const render = () => {
    rows.replaceChildren(...list.map((entry, index) => {
      const target = el("select", { "data-cw": "loot-target" }, [el("optgroup", { label: "Items" }, activeDocs(ctx, "item_definition").map((doc) => el("option", { value: doc.docKey, text: doc.body.displayName })))]
        .concat([el("optgroup", { label: "Andere loottabel" }, activeDocs(ctx, "loot_table").map((doc) => el("option", { value: doc.docKey, text: "Tabel: " + doc.body.displayName })))]));
      target.value = entry.itemRef || entry.tableRef || "";
      const chance = el("input", { type: "number", min: 0.01, max: 100, step: 0.01, title: "Kans in %", "data-cw": "loot-chance" });
      chance.value = (entry.chanceBp ?? 10000) / 100;
      const min = el("input", { type: "number", min: 1, max: 9999, step: 1 }); min.value = entry.minQty ?? 1;
      const max = el("input", { type: "number", min: 1, max: 9999, step: 1 }); max.value = entry.maxQty ?? 1;
      const remove = el("button", { type: "button", class: "ghost", text: "Weg" });
      const sync = () => {
        const ref = target.value;
        list[index] = { chanceBp: Math.round(Number(chance.value) * 100), minQty: Math.round(Number(min.value)), maxQty: Math.round(Number(max.value)) };
        if (ref.startsWith("loot_table:")) list[index].tableRef = ref; else list[index].itemRef = ref;
      };
      for (const input of [target, chance, min, max]) input.addEventListener("change", sync);
      remove.addEventListener("click", () => { list.splice(index, 1); render(); });
      sync();
      return el("div", { class: "cwRow" }, [
        el("label", {}, [el("span", { text: "Wat" }), target]), el("label", {}, [el("span", { text: "Kans %" }), chance]),
        el("label", {}, [el("span", { text: "Min" }), min]), el("label", {}, [el("span", { text: "Max" }), max]), remove
      ]);
    }));
    const add = el("button", { type: "button", class: "ghost", text: "+ Regel", "data-cw": "loot-add" });
    add.addEventListener("click", () => { list.push({ chanceBp: 10000, minQty: 1, maxQty: 1 }); render(); });
    rows.append(add);
  };
  render();
  return { node: rows, value: () => list.filter((entry) => entry.itemRef || entry.tableRef) };
}

// Formulier uit het schema. extra(fields, inputs) mag een proef-blok teruggeven.
function docForm(ctx, kind, doc, signal, onDone, options = {}) {
  const spec = ctx.workspace.kinds[kind];
  const body = Object.assign({}, options.defaults || {}, doc?.body || {});
  const inputs = {};
  const rows = [];
  const assets = ctx.workspace.assets || [];
  let clipList = null;
  for (const [key, field] of Object.entries(spec.fields)) {
    if (key === spec.idField || field.type === "pointList" || (options.skip || []).includes(key)) continue;
    let input;
    let label = field.label;
    if (field.type === "integer") {
      const unit = unitFor(key);
      input = el("input", { type: "number", step: "any" });
      input.value = body[key] === undefined ? "" : unit.toUi(body[key]);
      if (unit.label) label = label.replace(/ \((mm|ms|mm\/s)\)$/, "").replace(/ \(10000 = 1x\)$/, "") + " (" + unit.label + ")";
      input.dataset.unitKey = key;
    } else if (field.type === "select") {
      input = el("select", {}, field.options.map((option) => el("option", { value: option, text: { aggressive: "Valt aan als je dichtbij komt", defensive: "Vecht alleen terug" }[option] || option })));
      input.value = body[key] || field.options[0];
    } else if (field.type === "ref") {
      input = refSelect(ctx, field.refKind, body[key], field.required ? null : "(geen)");
    } else if (field.type === "asset") {
      input = el("select", {}, [el("option", { value: "", text: field.assetType === "model" ? "(geen model: simpele vorm)" : "(geen geluid)" })]
        .concat(assets.filter((asset) => asset.assetType === field.assetType).map((asset) => el("option", { value: asset.id, text: asset.id }))));
      input.value = body[key] || "";
    } else if (field.type === "boolean") {
      input = el("input", { type: "checkbox" });
      input.checked = body[key] === true;
    } else if (field.type === "lootEntries") {
      const editor = lootEntriesEditor(ctx, body[key]);
      inputs[key] = { lootEditor: editor };
      rows.push(el("div", {}, [el("span", { class: "cwHint", text: field.label + " (elke regel rolt apart)" }), editor.node]));
      continue;
    } else {
      input = el("input", { type: "text", maxlength: field.maxLength || 120 });
      input.value = body[key] || "";
      if (/Clip$/.test(key)) {
        if (!clipList) clipList = el("datalist", { id: "cwClips-" + Math.random().toString(36).slice(2) });
        input.setAttribute("list", clipList.id);
      }
    }
    inputs[key] = input;
    input.setAttribute("data-cw", "f-" + key);
    rows.push(field.type === "boolean"
      ? el("label", { class: "cwCheck" }, [input, el("span", { text: label })])
      : el("label", {}, [el("span", { text: label + (field.required ? "" : " (optioneel)") }), input]));
  }
  if (clipList && inputs.modelAssetId) {
    const fillClips = () => {
      const asset = assets.find((item) => item.id === inputs.modelAssetId.value);
      clipList.replaceChildren(...(asset?.animations || []).map((name) => el("option", { value: name })));
    };
    inputs.modelAssetId.addEventListener("change", fillClips, { signal });
    fillClips();
    rows.push(clipList, el("p", { class: "cwHint", text: "Animatienamen: kies uit de lijst van het model (leeg = automatisch)." }));
  }
  const collect = () => {
    const next = {};
    if (doc) next[spec.idField] = body[spec.idField];
    else next[spec.idField] = options.newId ? options.newId(inputs) : slug(inputs.displayName?.value);
    for (const [key, input] of Object.entries(inputs)) {
      const field = spec.fields[key];
      if (input.lootEditor) { next[key] = input.lootEditor.value(); continue; }
      if (field.type === "boolean") { if (input.checked) next[key] = true; continue; }
      if (field.type === "integer") {
        if (input.value === "") continue;
        next[key] = unitFor(key).toDoc(Number(input.value));
        continue;
      }
      const value = String(input.value || "").trim();
      if (value) next[key] = value;
    }
    for (const [key, value] of Object.entries(options.keep ? options.keep(body) : {})) if (value !== undefined) next[key] = value;
    return next;
  };
  const save = el("button", { type: "submit", text: doc ? "Opslaan" : "Maken", "data-cw": "save-" + kind });
  const cancel = el("button", { type: "button", class: "ghost", text: "Annuleren" });
  const extra = options.extra ? options.extra(collect) : null;
  const form = el("form", { class: "cwForm" }, [
    el("h3", { text: (doc ? "Bewerken: " : "Nieuw: ") + spec.label }),
    doc ? el("p", { class: "cwHint", text: "ID " + body[spec.idField] + " · revisie " + doc.revision }) : null,
    ...rows,
    extra,
    el("div", { class: "cwRow" }, [save, cancel])
  ]);
  cancel.addEventListener("click", () => onDone(false), { signal });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      const next = collect();
      const result = doc
        ? await command({ command: "update", docKey: doc.docKey, body: next }, doc.revision)
        : await command({ command: "create", kind, body: next });
      ctx.setStatus(spec.label + " opgeslagen (revisie " + result.revision + "). Publiceer om het in de game te zien.", "ok");
      onDone(true);
    } catch (error) {
      save.disabled = false;
      ctx.setStatus(friendlyError(error), "error");
    }
  }, { signal });
  return form;
}

// Proef in de browser: zelfde rekenregel als de server. Schrijft niets.
function archetypeTrial(ctx) {
  const out = el("p", { class: "cwHint", "data-cw": "actor-trial" });
  const button = el("button", { type: "button", class: "ghost", text: "Proef: hoeveel slagen?" });
  return (collect) => {
    button.onclick = () => {
      const body = collect();
      const enemyAbility = activeDocs(ctx, "ability").find((doc) => doc.docKey === body.abilityRef)?.body;
      const project = ctx.docs("project_settings")[0]?.body || {};
      const playerAbility = activeDocs(ctx, "ability").find((doc) => doc.docKey === project.playerAbilityRef)?.body
        || { baseDamage: 16, powerScalingBp: 5000, armorFactorBp: 3500, cooldownMs: 250 };
      const playerHit = computeDamage(playerAbility, 10, body.armor || 0);
      const hits = Math.ceil((body.healthMax || 1) / playerHit);
      const enemyHit = enemyAbility ? computeDamage(enemyAbility, body.attackPower || 0, 0) : null;
      out.textContent = "Speler (aanvalskracht 10) raakt voor " + playerHit + " → " + hits + " slagen (" + (hits * (playerAbility.cooldownMs || 250) / 1000).toFixed(1) + " s). "
        + (enemyHit === null ? "Kies een aanval voor de vijand." : "Vijand raakt een speler zonder pantser voor " + enemyHit + " per " + ((enemyAbility.cooldownMs || 1000) / 1000) + " s.");
    };
    return el("div", {}, [button, out]);
  };
}

function lootTrial(ctx) {
  const out = el("p", { class: "cwHint" });
  const button = el("button", { type: "button", class: "ghost", text: "Proef: 100 keer rollen" });
  return (collect) => {
    button.onclick = () => {
      const current = collect();
      const tables = {};
      for (const doc of activeDocs(ctx, "loot_table")) tables[doc.body.lootTableId] = doc.body;
      tables[current.lootTableId] = current;
      const runtime = {};
      for (const [id, table] of Object.entries(tables)) {
        runtime[id] = { entries: (table.entries || []).map((entry) => Object.assign({ chanceBp: entry.chanceBp, minQty: entry.minQty, maxQty: entry.maxQty },
          entry.itemRef ? { itemId: idOf(entry.itemRef) } : { lootTableId: idOf(entry.tableRef) })) };
      }
      const totals = new Map();
      for (let i = 0; i < 100; i += 1) for (const drop of rollLoot(runtime, current.lootTableId, "proef|" + i)) totals.set(drop.itemId, (totals.get(drop.itemId) || 0) + drop.quantity);
      const names = new Map(activeDocs(ctx, "item_definition").map((doc) => [doc.body.itemId, doc.body.displayName]));
      out.textContent = totals.size ? "Gemiddeld per keer: " + Array.from(totals, ([id, total]) => (names.get(id) || id) + " " + (total / 100).toFixed(2)).join(", ") : "Niets gevallen in 100 keer.";
    };
    return el("div", {}, [button, out]);
  };
}

const FORM_OPTIONS = {
  ability: { defaults: { baseDamage: 10, powerScalingBp: 5000, armorFactorBp: 3500, rangeMm: 2500, cooldownMs: 1500 } },
  loot_table: { defaults: { entries: [] }, extra: null },
  resource_definition: { defaults: { gatherRangeMm: 2500, radiusMm: 700, respawnMs: 30000 } },
  actor_archetype: { defaults: { healthMax: 50, attackPower: 10, armor: 0, behavior: "aggressive", aggroRangeMm: 8000, leashRangeMm: 30000, moveSpeedMmPerS: 3500, radiusMm: 500, respawnMs: 30000, xpReward: 20 } }
};

function mountList(host, ctx, signal, kind, rerender) {
  const spec = ctx.workspace.kinds[kind];
  const slot = el("div");
  const options = Object.assign({}, FORM_OPTIONS[kind] || {});
  if (kind === "actor_archetype") options.extra = archetypeTrial(ctx);
  if (kind === "loot_table") options.extra = lootTrial(ctx);
  const open = (doc) => slot.replaceChildren(docForm(ctx, kind, doc, signal, (changed) => changed ? rerender(true) : slot.replaceChildren(), options));
  const add = el("button", { type: "button", "data-cw": "new-" + kind, text: "+ " + spec.label });
  add.addEventListener("click", () => open(null), { signal });
  const docs = ctx.docs(kind);
  const rows = docs.map((doc) => {
    const edit = el("button", { type: "button", class: "ghost", text: "Bewerken", disabled: doc.archived });
    const toggle = el("button", { type: "button", class: "ghost", text: doc.archived ? "Terugzetten" : "Archiveren" });
    edit.addEventListener("click", () => open(doc), { signal });
    toggle.addEventListener("click", async () => {
      try {
        await command({ command: doc.archived ? "restore" : "archive", docKey: doc.docKey }, doc.revision);
        rerender(true);
      } catch (error) { ctx.setStatus(friendlyError(error), "error"); }
    }, { signal });
    return el("tr", { class: doc.archived ? "cwArchived" : "" }, [
      el("td", { text: doc.body.displayName }), el("td", { text: doc.body[spec.idField] }),
      el("td", { text: doc.archived ? "gearchiveerd" : "actief" }), el("td", {}, [edit, toggle])
    ]);
  });
  host.append(
    el("div", { class: "cwRow" }, [add]),
    slot,
    docs.length ? el("table", { class: "cwTable" }, [el("thead", {}, el("tr", {}, ["Naam", "ID", "Status", ""].map((text) => el("th", { text })))), el("tbody", {}, rows)])
      : el("p", { class: "cwHint", text: "Nog niets. " + ({ actor_archetype: "Maak eerst een Aanval, dan een Vijand.", ability: "Een aanval is schade + bereik + snelheid.", loot_table: "Een loottabel bepaalt wat een vijand of grondstof geeft.", resource_definition: "Een grondstof is iets om te verzamelen (struik, erts)." }[kind] || "") })
  );
}

// ---- plaatsen op de kaart ----
function mountPlacement(host, ctx, signal, rerender) {
  const regions = activeDocs(ctx, "region");
  const colliders = activeDocs(ctx, "collider");
  const spawns = activeDocs(ctx, "actor_spawn").concat(activeDocs(ctx, "resource_spawn"));
  let saved = null;
  try { saved = JSON.parse(window.localStorage.getItem(VIEW_KEY) || "null"); } catch {}
  const view = { cx: saved?.cx ?? 0, cz: saved?.cz ?? 0, scale: saved?.scale > 0 ? saved.scale : 2, selected: null, patrolDraw: false };
  const what = el("select", { "data-cw": "place-what" }, [el("option", { value: "", text: "(kies wat je plaatst)" })]
    .concat(activeDocs(ctx, "actor_archetype").map((doc) => el("option", { value: doc.docKey, text: "Vijand: " + doc.body.displayName })))
    .concat(activeDocs(ctx, "resource_definition").map((doc) => el("option", { value: doc.docKey, text: "Grondstof: " + doc.body.displayName }))));
  const canvas = el("canvas", { width: WIDTH, height: HEIGHT, "data-cw": "actor-map" });
  canvas.style.cssText = "width:100%;max-width:" + WIDTH + "px;border:1px solid var(--line);border-radius:6px;touch-action:none;cursor:crosshair;display:block";
  const detail = el("div");
  const fit = el("button", { type: "button", class: "ghost", text: "Alles in beeld" });
  host.append(
    el("p", { class: "cwHint", text: "Kies wat je plaatst en klik op de kaart (binnen een Region). Klik op een stip om hem te kiezen. Scrollen = zoomen, rechts slepen = schuiven." }),
    el("div", { class: "cwRow" }, [el("label", {}, [el("span", { text: "Plaatsen" }), what]), fit]),
    canvas, detail
  );
  const toCanvas = (x, z) => [(x - view.cx) * view.scale + WIDTH / 2, (z - view.cz) * view.scale + HEIGHT / 2];
  const toWorld = (px, py) => [(px - WIDTH / 2) / view.scale + view.cx, (py - HEIGHT / 2) / view.scale + view.cz];
  const pointer = (event) => { const rect = canvas.getBoundingClientRect(); return [(event.clientX - rect.left) * WIDTH / rect.width, (event.clientY - rect.top) * HEIGHT / rect.height]; };
  const persist = () => { try { window.localStorage.setItem(VIEW_KEY, JSON.stringify({ cx: view.cx, cz: view.cz, scale: view.scale })); } catch {} };
  const fitAll = () => {
    if (!regions.length) return;
    const minX = Math.min(...regions.map((d) => mmToMeters(d.body.minXMm))); const maxX = Math.max(...regions.map((d) => mmToMeters(d.body.maxXMm)));
    const minZ = Math.min(...regions.map((d) => mmToMeters(d.body.minZMm))); const maxZ = Math.max(...regions.map((d) => mmToMeters(d.body.maxZMm)));
    view.cx = (minX + maxX) / 2; view.cz = (minZ + maxZ) / 2;
    view.scale = Math.max(0.02, Math.min(40, 0.9 * Math.min(WIDTH / Math.max(1, maxX - minX), HEIGHT / Math.max(1, maxZ - minZ))));
  };
  if (!saved) fitAll();
  let patrol = null;

  function draw() {
    const g = canvas.getContext("2d");
    g.fillStyle = "#0b1324"; g.fillRect(0, 0, WIDTH, HEIGHT);
    g.font = "600 12px system-ui";
    for (const doc of regions) {
      const [x0, y0] = toCanvas(mmToMeters(doc.body.minXMm), mmToMeters(doc.body.minZMm));
      const [x1, y1] = toCanvas(mmToMeters(doc.body.maxXMm), mmToMeters(doc.body.maxZMm));
      g.fillStyle = "rgba(56,189,248,.08)"; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.strokeStyle = "#38bdf8"; g.lineWidth = 1; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      g.fillStyle = "#e2e8f0"; g.fillText(doc.body.displayName, x0 + 5, y0 + 15);
    }
    g.fillStyle = "rgba(148,163,184,.45)";
    for (const doc of colliders) {
      const b = doc.body;
      g.beginPath();
      if (b.shape === "cylinder") { const [x, y] = toCanvas(mmToMeters(b.centerXMm), mmToMeters(b.centerZMm)); g.arc(x, y, mmToMeters(b.radiusMm) * view.scale, 0, Math.PI * 2); }
      else if (b.shape === "box") { const [x0, y0] = toCanvas(mmToMeters(b.minXMm), mmToMeters(b.minZMm)); const [x1, y1] = toCanvas(mmToMeters(b.maxXMm), mmToMeters(b.maxZMm)); g.rect(x0, y0, x1 - x0, y1 - y0); }
      else b.pointsMm.forEach((p, i) => { const [x, y] = toCanvas(mmToMeters(p[0]), mmToMeters(p[1])); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.fill();
    }
    for (const doc of spawns) {
      const isActor = doc.kind === "actor_spawn";
      const points = (doc.docKey === view.selected && patrol ? patrol : doc.body.patrolPointsMm) || [];
      if (points.length) {
        g.strokeStyle = "rgba(250,204,21,.7)"; g.setLineDash([5, 4]); g.beginPath();
        points.forEach((p, i) => { const [x, y] = toCanvas(mmToMeters(p[0]), mmToMeters(p[1])); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        g.closePath(); g.stroke(); g.setLineDash([]);
      }
      const [x, y] = toCanvas(mmToMeters(doc.body.xMm), mmToMeters(doc.body.zMm));
      g.beginPath(); g.arc(x, y, doc.docKey === view.selected ? 8 : 6, 0, Math.PI * 2);
      g.fillStyle = isActor ? "#f87171" : "#22c55e"; g.fill();
      if (doc.docKey === view.selected) { g.strokeStyle = "#facc15"; g.lineWidth = 2; g.stroke(); }
      const def = ctx.docs(isActor ? "actor_archetype" : "resource_definition").find((item) => item.docKey === (doc.body.archetypeRef || doc.body.resourceRef));
      g.fillStyle = "#f8fafc"; g.font = "11px system-ui"; g.fillText(def?.body.displayName || "?", x + 9, y + 4);
    }
  }

  function regionAt(xMm, zMm) {
    return regions.find((doc) => rectContains(doc.body, xMm, zMm)) || null;
  }

  function renderDetail() {
    const doc = spawns.find((item) => item.docKey === view.selected);
    if (!doc) { detail.replaceChildren(); return; }
    const isActor = doc.kind === "actor_spawn";
    const x = el("input", { type: "number", step: 0.5 }); x.value = mmToMeters(doc.body.xMm);
    const z = el("input", { type: "number", step: 0.5 }); z.value = mmToMeters(doc.body.zMm);
    const save = el("button", { type: "button", text: "Opslaan" });
    const remove = el("button", { type: "button", class: "ghost", text: "Verwijderen" });
    const draw2 = el("button", { type: "button", class: "ghost", text: view.patrolDraw ? "Klaar met patrouille" : "Patrouille tekenen" });
    const clear = el("button", { type: "button", class: "ghost", text: "Patrouille wissen" });
    const info = el("p", { class: "cwHint", text: isActor ? "Patrouille: " + ((patrol || doc.body.patrolPointsMm || []).length) + " punten (minstens 2; klik op de kaart tijdens tekenen)." : "" });
    save.addEventListener("click", async () => {
      const body = Object.assign({}, doc.body, { xMm: metersToMm(Number(x.value)), zMm: metersToMm(Number(z.value)) });
      const region = regionAt(body.xMm, body.zMm);
      if (region) body.regionRef = region.docKey;
      if (isActor) {
        const points = patrol || doc.body.patrolPointsMm || [];
        if (points.length >= 2) body.patrolPointsMm = points; else delete body.patrolPointsMm;
      }
      try {
        await command({ command: "update", docKey: doc.docKey, body }, doc.revision);
        ctx.setStatus("Plek opgeslagen. Publiceer om het in de game te zien.", "ok");
        rerender(true, doc.docKey);
      } catch (error) { ctx.setStatus(friendlyError(error), "error"); }
    }, { signal });
    remove.addEventListener("click", async () => {
      try { await command({ command: "archive", docKey: doc.docKey }, doc.revision); rerender(true); } catch (error) { ctx.setStatus(friendlyError(error), "error"); }
    }, { signal });
    draw2.addEventListener("click", () => { view.patrolDraw = !view.patrolDraw; if (view.patrolDraw && !patrol) patrol = []; renderDetail(); }, { signal });
    clear.addEventListener("click", () => { patrol = []; draw(); renderDetail(); }, { signal });
    detail.replaceChildren(el("div", { class: "cwForm" }, [
      el("h3", { text: (isActor ? "Vijand-plek " + doc.body.spawnId : "Grondstof-plek " + doc.body.resourceSpawnId) }),
      el("div", { class: "cwRow" }, [el("label", {}, [el("span", { text: "X (m)" }), x]), el("label", {}, [el("span", { text: "Z (m)" }), z])]),
      isActor ? el("div", { class: "cwRow" }, [draw2, clear]) : null,
      info,
      el("div", { class: "cwRow" }, [save, remove])
    ]));
  }

  async function place(xMm, zMm) {
    const ref = what.value;
    if (!ref) { ctx.setStatus("Kies eerst wat je plaatst.", "error"); return; }
    const region = regionAt(xMm, zMm);
    if (!region) { ctx.setStatus("Klik binnen een Region (teken die eerst in de tab Wereld).", "error"); return; }
    const isActor = ref.startsWith("actor_archetype:");
    const kind = isActor ? "actor_spawn" : "resource_spawn";
    const base = slug(idOf(ref)) + "_";
    const taken = new Set(ctx.docs(kind).map((doc) => doc.body.spawnId || doc.body.resourceSpawnId));
    let n = 1;
    while (taken.has(base + n)) n += 1;
    const body = isActor
      ? { spawnId: base + n, archetypeRef: ref, regionRef: region.docKey, xMm, zMm }
      : { resourceSpawnId: base + n, resourceRef: ref, regionRef: region.docKey, xMm, zMm };
    try {
      await command({ command: "create", kind, body });
      ctx.setStatus("Geplaatst. Publiceer om het in de game te zien.", "ok");
      rerender(true, kind + ":" + (body.spawnId || body.resourceSpawnId));
    } catch (error) { ctx.setStatus(friendlyError(error), "error"); }
  }

  let drag = null;
  canvas.addEventListener("contextmenu", (event) => event.preventDefault(), { signal });
  canvas.addEventListener("pointerdown", (event) => {
    const [px, py] = pointer(event);
    if (event.button === 2 || event.button === 1) { drag = { px, py, cx: view.cx, cz: view.cz }; canvas.setPointerCapture(event.pointerId); return; }
    const [wx, wz] = toWorld(px, py);
    const xMm = metersToMm(Math.round(wx * 2) / 2); const zMm = metersToMm(Math.round(wz * 2) / 2);
    if (view.patrolDraw && view.selected) { patrol = (patrol || []).concat([[xMm, zMm]]).slice(0, 16); draw(); renderDetail(); return; }
    const hit = spawns.find((doc) => { const [x, y] = toCanvas(mmToMeters(doc.body.xMm), mmToMeters(doc.body.zMm)); return Math.hypot(x - px, y - py) <= 9; });
    if (hit) { view.selected = hit.docKey; patrol = null; view.patrolDraw = false; draw(); renderDetail(); return; }
    place(xMm, zMm);
  }, { signal });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const [px, py] = pointer(event);
    view.cx = drag.cx - (px - drag.px) / view.scale; view.cz = drag.cz - (py - drag.py) / view.scale; draw();
  }, { signal });
  canvas.addEventListener("pointerup", () => { if (drag) { drag = null; persist(); } }, { signal });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const [px, py] = pointer(event);
    const before = toWorld(px, py);
    view.scale = Math.max(0.02, Math.min(40, view.scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2)));
    const after = toWorld(px, py);
    view.cx += before[0] - after[0]; view.cz += before[1] - after[1];
    persist(); draw();
  }, { signal, passive: false });
  fit.addEventListener("click", () => { fitAll(); persist(); draw(); }, { signal });
  return {
    select(docKey) { view.selected = docKey || null; draw(); renderDetail(); },
    draw
  };
}

export function mountActorBuilderView(host, ctx, signal, state = {}) {
  let remembered = null;
  try { remembered = window.localStorage.getItem("gk.canonical.actorSection"); } catch {}
  const section = SECTIONS[state.section] ? state.section : (remembered || "actor_archetype");
  const current = SECTIONS[section] ? section : "actor_archetype";
  const rerender = async (reload, selectKey) => {
    if (signal.aborted) return;
    if (reload) await ctx.refresh();
    host.replaceChildren();
    mountActorBuilderView(host, ctx, signal, { section: current, selectKey });
  };
  const tabs = el("div", { class: "cwRow" }, Object.entries(SECTIONS).map(([name, label]) => {
    const button = el("button", { type: "button", class: name === current ? "" : "ghost", "data-cw": "actor-section-" + name, text: label });
    button.addEventListener("click", () => {
      try { window.localStorage.setItem("gk.canonical.actorSection", name); } catch {}
      host.replaceChildren();
      mountActorBuilderView(host, ctx, signal, { section: name });
    }, { signal });
    return button;
  }));
  host.append(el("h2", { text: "Vijanden, aanvallen, loot en grondstoffen" }), tabs);
  if (current === "place") {
    const placement = mountPlacement(host, ctx, signal, rerender);
    placement.draw();
    if (state.selectKey) placement.select(state.selectKey);
    return;
  }
  mountList(host, ctx, signal, current, rerender);
}
