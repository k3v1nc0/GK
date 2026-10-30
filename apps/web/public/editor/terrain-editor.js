// Wereld tekenen (ronde 1): de knop Terrein in de editor. Penselen Verhogen, Verlagen en Gladstrijken op de
// 3D-view, met Radius, Sterkte en Zachte rand. Ctrl+Z / Ctrl+Y = ongedaan maken / opnieuw (per streek).
// Sluiten = opslaan: de veranderde vakken gaan als klein bestand naar de server (vingerafdruk = naam) en de
// kaart "Terrein" krijgt de nieuwe lijst. De penseelstreken zelf worden niet bewaard, alleen de uitkomst.
// Driehoekteller zoals Blender: oranje vanaf 80 % van het budget, rood erboven; te zware vakken kleuren rood.
import { applyTerrainBrush, encodeTerrainChunk, terrainChunkIsFlat } from "../shared/terrain.js";

const BRUSHES = [
  { id: "raise", icon: "⬆️", label: "Verhogen" },
  { id: "lower", icon: "⬇️", label: "Verlagen" },
  { id: "smooth", icon: "〰️", label: "Gladstrijken" }
];
const UNDO_LIMIT = 30;
const UPLOAD_BATCH = 64;
const STORE_KEY = "gk.terrein.penseel";

const settings = { brush: "raise", radius: 10, strength: 40, softness: 60, heavyTint: true };
try { Object.assign(settings, JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}")); } catch {}

let api = null;
let open = false;
let panel = null;
let stroke = null;
let lastPointer = null;
let suppressClickUntil = 0;
let counterTimer = null;
let busy = false;
const undoStack = [];
const redoStack = [];

function runtime() {
  const value = api?.getRuntime ? api.getRuntime() : null;
  return value && typeof value.terrainActive === "function" ? value : null;
}

function canvas() {
  return document.querySelector("#viewportCanvas");
}

function remember() {
  try { window.localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch {}
}

function status(text, kind = "") {
  if (api?.setStatus) api.setStatus(text, kind);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
    else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

function formatCount(value) {
  return Math.round(Number(value) || 0).toLocaleString("nl-NL");
}

// ---------- penseel ----------

function brushMode(event) {
  const mode = settings.brush;
  if (event?.shiftKey && mode === "raise") return "lower";
  if (event?.shiftKey && mode === "lower") return "raise";
  return mode;
}

function startStroke(event) {
  const rt = runtime();
  if (!rt || !rt.terrainActive()) {
    status("Terrein is nog niet klaar: wacht tot de 3D-view geladen is.", "error");
    return;
  }
  const before = new Map();
  stroke = {
    pointerId: event.pointerId,
    touched: new Set(),
    before,
    beforeTouch: function (key, chunk) { before.set(key, chunk ? chunk.slice() : null); },
    lastTime: performance.now(),
    shift: event.shiftKey,
    raf: 0
  };
  lastPointer = { x: event.clientX, y: event.clientY };
  rt.terrainBeginEdit();
  paintStep();
}

function paintStep() {
  if (!stroke) return;
  const rt = runtime();
  if (!rt) { stroke = null; return; }
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0.001, (now - stroke.lastTime) / 1000 || 0.016));
  stroke.lastTime = now;
  const hit = lastPointer ? rt.terrainRaycastScreen(lastPointer.x, lastPointer.y) : null;
  if (hit) {
    const changed = applyTerrainBrush(rt.terrainHeightfield(), {
      mode: brushMode({ shiftKey: stroke.shift }),
      x: hit.x,
      z: hit.z,
      radius: settings.radius,
      strength: settings.strength / 100,
      softness: settings.softness / 100,
      dt,
      bounds: rt.terrainBounds(),
      touched: stroke.touched,
      beforeTouch: stroke.beforeTouch
    });
    if (changed.size) rt.terrainChanged(changed);
    lastPointer.worldX = hit.x;
    lastPointer.worldZ = hit.z;
    rt.terrainSetCursor({ x: hit.x, z: hit.z, radius: settings.radius, softness: settings.softness / 100, color: "#ffd34d" });
  }
  stroke.raf = requestAnimationFrame(paintStep);
}

function endStroke() {
  if (!stroke) return;
  cancelAnimationFrame(stroke.raf);
  const rt = runtime();
  const done = stroke;
  stroke = null;
  suppressClickUntil = Date.now() + 400;
  if (!rt || !done.touched.size) return;
  const after = new Map();
  for (const key of done.touched) {
    const chunk = rt.terrainHeightfield().chunks.get(key);
    after.set(key, chunk ? chunk.slice() : null);
  }
  undoStack.push({ before: done.before, after });
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
  // Einde van de streek: ook de buurvakken opnieuw (licht over de rand).
  rt.terrainChanged(done.touched, { neighbors: true });
  renderPanelState();
}

function applySnapshot(map) {
  const rt = runtime();
  if (!rt) return;
  rt.terrainBeginEdit();
  const chunks = rt.terrainHeightfield().chunks;
  for (const [key, chunk] of map) {
    if (chunk) chunks.set(key, chunk.slice());
    else chunks.delete(key);
  }
  rt.terrainChanged(Array.from(map.keys()), { neighbors: true });
}

function undo() {
  const entry = undoStack.pop();
  if (!entry) { status("Niets meer om ongedaan te maken in Terrein.", ""); return; }
  applySnapshot(entry.before);
  redoStack.push(entry);
  status("Terrein: streek ongedaan gemaakt.", "");
  renderPanelState();
}

function redo() {
  const entry = redoStack.pop();
  if (!entry) return;
  applySnapshot(entry.after);
  undoStack.push(entry);
  status("Terrein: streek opnieuw gedaan.", "");
  renderPanelState();
}

function updateCursor(clientX, clientY) {
  const rt = runtime();
  if (!rt) return;
  const hit = rt.terrainRaycastScreen(clientX, clientY);
  if (!hit) { rt.terrainSetCursor(null); return; }
  rt.terrainSetCursor({ x: hit.x, z: hit.z, radius: settings.radius, softness: settings.softness / 100, color: "#ffffff" });
  lastPointer = { x: clientX, y: clientY, worldX: hit.x, worldZ: hit.z };
}

// Vóór editor.js (dit bestand wordt eerst geladen): in Terrein is de linkermuis het penseel.
// Rechtermuis en wiel blijven de camera.
window.addEventListener("pointerdown", function (event) {
  if (!open || busy || event.button !== 0 || event.target !== canvas()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  try { event.target.setPointerCapture(event.pointerId); } catch {}
  startStroke(event);
}, true);

window.addEventListener("pointermove", function (event) {
  if (!open) return;
  if (stroke && event.pointerId === stroke.pointerId) {
    lastPointer = { x: event.clientX, y: event.clientY };
    stroke.shift = event.shiftKey;
    event.stopImmediatePropagation();
    return;
  }
  if (event.target === canvas() && event.buttons === 0) updateCursor(event.clientX, event.clientY);
}, true);

for (const type of ["pointerup", "pointercancel"]) {
  window.addEventListener(type, function (event) {
    if (!stroke || event.pointerId !== stroke.pointerId) return;
    event.stopImmediatePropagation();
    try { canvas()?.releasePointerCapture(event.pointerId); } catch {}
    endStroke();
  }, true);
}

window.addEventListener("click", function (event) {
  if (!open || Date.now() > suppressClickUntil || event.target !== canvas()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

window.addEventListener("keydown", function (event) {
  if (!open) return;
  const target = event.target;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
  const key = String(event.key || "").toLowerCase();
  if ((event.ctrlKey || event.metaKey) && (key === "z" || key === "y")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (key === "y" || event.shiftKey) redo(); else undo();
  }
}, true);

// ---------- paneel ----------

function slider(key, label, min, max, unit, help) {
  const value = el("span", { class: "terreinValue", text: settings[key] + unit });
  const input = el("input", { type: "range", min, max, step: 1, value: settings[key], title: help });
  input.addEventListener("input", function () {
    settings[key] = Number(input.value);
    value.textContent = settings[key] + unit;
    remember();
    if (lastPointer?.worldX !== undefined) runtime()?.terrainSetCursor({ x: lastPointer.worldX, z: lastPointer.worldZ, radius: settings.radius, softness: settings.softness / 100, color: "#ffffff" });
  });
  return el("label", { class: "terreinSlider", title: help }, [el("span", { text: label }), input, value]);
}

function buildPanel() {
  const host = document.querySelector(".viewportWrap");
  if (!host) return null;
  const root = el("div", { class: "terreinPanel", role: "dialog", "aria-label": "Terrein" });
  const brushes = el("div", { class: "terreinBrushes" });
  for (const brush of BRUSHES) {
    const button = el("button", { type: "button", class: "terreinBrush", "data-brush": brush.id, title: brush.label }, [el("span", { text: brush.icon }), el("span", { text: brush.label })]);
    button.addEventListener("click", function () {
      settings.brush = brush.id;
      remember();
      renderPanelState();
    });
    brushes.append(button);
  }
  const undoButton = el("button", { type: "button", class: "terreinSmall", "data-act": "undo", title: "Ongedaan maken (Ctrl+Z)", text: "↶" });
  const redoButton = el("button", { type: "button", class: "terreinSmall", "data-act": "redo", title: "Opnieuw (Ctrl+Y)", text: "↷" });
  undoButton.addEventListener("click", undo);
  redoButton.addEventListener("click", redo);
  const tint = el("input", { type: "checkbox" });
  tint.checked = settings.heavyTint !== false;
  tint.addEventListener("change", function () {
    settings.heavyTint = tint.checked;
    remember();
    runtime()?.terrainSetHeavyTint(open && settings.heavyTint);
  });
  const save = el("button", { type: "button", class: "terreinSave", text: "💾 Sluiten en opslaan" });
  const cancel = el("button", { type: "button", class: "terreinCancel", text: "Annuleren" });
  save.addEventListener("click", function () { void saveAndClose(); });
  cancel.addEventListener("click", cancelAndClose);
  root.append(
    el("div", { class: "terreinHead" }, [el("strong", { text: "⛰️ Terrein" }), el("span", { class: "terreinUndo" }, [undoButton, redoButton])]),
    brushes,
    slider("radius", "Radius", 1, 64, " m", "Hoe groot het penseel is (meter)."),
    slider("strength", "Sterkte", 1, 100, " %", "Hoe snel het penseel werkt."),
    slider("softness", "Zachte rand", 0, 100, " %", "0 % = harde rand, 100 % = heel zacht aflopend."),
    el("div", { class: "terreinTip", text: "Linkermuis = tekenen. Shift = andersom. Rechtermuis en wiel = camera." }),
    el("div", { class: "terreinCounter", "data-part": "counter" }),
    el("label", { class: "terreinCheck" }, [tint, el("span", { text: "Te zware vakken rood kleuren" })]),
    el("div", { class: "terreinDirty", "data-part": "dirty" }),
    el("div", { class: "terreinActions" }, [save, cancel])
  );
  host.append(root);
  return root;
}

function renderPanelState() {
  if (!panel) return;
  for (const button of panel.querySelectorAll(".terreinBrush")) {
    const active = button.getAttribute("data-brush") === settings.brush;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
  const undoButton = panel.querySelector('[data-act="undo"]');
  const redoButton = panel.querySelector('[data-act="redo"]');
  if (undoButton) undoButton.disabled = undoStack.length === 0;
  if (redoButton) redoButton.disabled = redoStack.length === 0;
  renderCounter();
}

function level(value, budget) {
  const ratio = budget > 0 ? value / budget : 0;
  return ratio > 1 ? "red" : ratio >= 0.8 ? "orange" : "ok";
}

function renderCounter() {
  if (!panel) return;
  const rt = runtime();
  const box = panel.querySelector('[data-part="counter"]');
  const dirtyBox = panel.querySelector('[data-part="dirty"]');
  if (!rt || !box) return;
  const stats = rt.terrainStats();
  const info = rt.renderInfo ? rt.renderInfo() : { triangles: 0 };
  const here = lastPointer?.worldX !== undefined ? rt.terrainChunkInfoAt(lastPointer.worldX, lastPointer.worldZ) : null;
  box.replaceChildren(
    el("div", { class: "terreinRow terreinRow--" + level(stats.game, stats.budget), title: "Driehoeken van de grond die de game tekent als de speler hier (midden van de camera) staat." }, [
      el("span", { text: "🔺 Grond rond speler" }), el("b", { text: formatCount(stats.game) + " / " + formatCount(stats.budget) })
    ]),
    here ? el("div", { class: "terreinRow terreinRow--" + level(here.nearTris, here.budget), title: "Driehoeken van het vak onder de muis, dichtbij (fijnste niveau)." }, [
      el("span", { text: "▦ Dit vak (" + here.key + ")" }), el("b", { text: formatCount(here.nearTris) + " / " + formatCount(here.budget) })
    ]) : null,
    el("div", { class: "terreinRow terreinRow--" + (stats.heavy ? "red" : "ok") }, [
      el("span", { text: "🟥 Te zware vakken" }), el("b", { text: String(stats.heavy) })
    ]),
    el("div", { class: "terreinRow terreinRow--muted", title: "Grond die de editor nu tekent (de editor kijkt verder dan de game)." }, [
      el("span", { text: "Grond in de editor" }), el("b", { text: formatCount(stats.total) })
    ]),
    el("div", { class: "terreinRow terreinRow--muted", title: "Alles wat de editor nu tekent (grond, modellen, schaduw)." }, [
      el("span", { text: "Totaal in beeld" }), el("b", { text: formatCount(info.triangles) })
    ])
  );
  if (dirtyBox) {
    dirtyBox.textContent = stats.dirty ? "Niet opgeslagen: " + stats.dirty + " " + (stats.dirty === 1 ? "vak" : "vakken") + "." : (stats.loading ? "Hoogtes laden..." : "Alles opgeslagen.");
    dirtyBox.classList.toggle("terreinDirty--warn", stats.dirty > 0);
  }
}

// ---------- openen, opslaan, sluiten ----------

function setOpen(next) {
  open = next;
  document.body.classList.toggle("terreinMode", open);
  const button = document.querySelector("#terrainModeButton");
  if (button) {
    button.classList.toggle("active", open);
    button.setAttribute("aria-pressed", open ? "true" : "false");
  }
  if (open) {
    if (!panel) panel = buildPanel();
    if (panel) panel.hidden = false;
    renderPanelState();
    clearInterval(counterTimer);
    counterTimer = setInterval(renderCounter, 300);
    runtime()?.terrainSetHeavyTint(settings.heavyTint !== false);
  } else {
    if (stroke) endStroke();
    if (panel) panel.hidden = true;
    clearInterval(counterTimer);
    counterTimer = null;
    runtime()?.terrainSetCursor(null);
    runtime()?.terrainSetHeavyTint(false);
  }
}

async function uploadChunks(entries) {
  const names = {};
  for (let i = 0; i < entries.length; i += UPLOAD_BATCH) {
    const form = new FormData();
    for (const entry of entries.slice(i, i + UPLOAD_BATCH)) {
      form.append(entry.key, new Blob([encodeTerrainChunk(entry.data)], { type: "application/octet-stream" }), "vak.bin");
    }
    const response = await api.fetchApi("/api/editor/terrain-chunks", { method: "POST", body: form, timeoutMs: 120000 }, "POST");
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok || !data.ok) throw new Error(data.message || "upload mislukt");
    Object.assign(names, data.chunks || {});
  }
  return names;
}

// Bewaart de veranderde vakken en zet de nieuwe lijst in de kaart "Terrein". true = gelukt (of niets te doen).
async function saveIfDirty() {
  const rt = runtime();
  if (!rt || !rt.terrainIsDirty()) return true;
  if (busy) return false;
  busy = true;
  try {
    const dirty = rt.terrainDirtyChunks();
    status("Terrein opslaan: " + dirty.length + " " + (dirty.length === 1 ? "vak" : "vakken") + "...", "");
    const upload = dirty.filter(function (entry) { return entry.data && !terrainChunkIsFlat(entry.data); });
    const names = upload.length ? await uploadChunks(upload) : {};
    const doc = api.docBench.doc("terrain_settings");
    const body = Object.assign({}, doc?.body || {});
    const refs = Object.assign({}, body.chunks || {});
    for (const entry of dirty) if (!names[entry.key]) delete refs[entry.key];
    Object.assign(refs, names);
    body.chunks = refs;
    await api.docBench.saveDoc("terrain_settings", doc, body, "Terrein (" + dirty.length + " " + (dirty.length === 1 ? "vak" : "vakken") + ")");
    rt.terrainCommitSaved(refs, names);
    status("Terrein opgeslagen (" + dirty.length + " " + (dirty.length === 1 ? "vak" : "vakken") + "). Druk SAVE TO GAME om het in de game te zetten.", "success");
    renderPanelState();
    return true;
  } catch (error) {
    status("Terrein niet opgeslagen: " + (error?.message || error) + ".", "error");
    return false;
  } finally {
    busy = false;
  }
}

async function saveAndClose() {
  if (await saveIfDirty()) {
    undoStack.length = 0;
    redoStack.length = 0;
    setOpen(false);
  }
}

function cancelAndClose() {
  const rt = runtime();
  if (rt && rt.terrainIsDirty()) {
    if (!window.confirm("Alle niet opgeslagen penseelstreken weggooien?")) return;
    rt.terrainDiscardEdits();
    status("Terrein: niet opgeslagen streken weggegooid.", "");
  }
  undoStack.length = 0;
  redoStack.length = 0;
  setOpen(false);
}

// api: { getRuntime, fetchApi, docBench, setStatus, showViewport }
export function createTerrainEditor(options = {}) {
  api = options;
  return {
    open: function () {
      if (typeof api.showViewport === "function") api.showViewport();
      setOpen(true);
    },
    close: function () { if (open) setOpen(false); },
    toggle: function () { if (open) setOpen(false); else this.open(); },
    isOpen: function () { return open; },
    saveIfDirty
  };
}
