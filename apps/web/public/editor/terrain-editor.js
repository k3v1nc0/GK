// Wereld tekenen: de editor-tab Terrein. Alles van de grond op één plek:
// - links: Hoogte (Verhogen, Verlagen, Gladstrijken, Afvlakken, Scherpe rand), Stempel, Verf en Grond (instellingen);
// - midden: de 3D-view (linkermuis = gereedschap, rechtermuis en wiel = camera);
// - rechts: de Bibliotheek met stempels en terreintexturen.
// Ctrl+Z / Ctrl+Y werken zolang je in Terrein bent. Opslaan = de veranderde vakken (hoogte .bin, verf .png) naar de
// server en de kaart "Terrein" bijwerken; de tab verlaten slaat ook op. De streken zelf worden niet bewaard.
import {
  applyTerrainBrush, applyTerrainPaint, applyTerrainPaintPath, applyTerrainStamp, clonePaintChunk, encodeTerrainChunk, normalizeTerrainWater,
  sampleTerrainRegion, terrainChunkIsFlat, terrainPaintIsEmpty, terrainStampFootprint, tidyPaintChunk, waterContains, waterCorners, TERRAIN_PAINT_VERTS
} from "../shared/terrain.js";
import { smoothPolyline } from "../shared/movement-kernel.js";
import { areaNodeValues, areaSoort } from "../shared/area-soorten.js?v=20261027-om2b";
import { decodePng, encodePng, pngToHeights } from "../shared/png.js";
import { slug } from "./canonical-api.js";

const BRUSHES = [
  { id: "raise", icon: "⬆️", label: "Verhogen" },
  { id: "lower", icon: "⬇️", label: "Verlagen" },
  { id: "smooth", icon: "〰️", label: "Gladstrijken" },
  { id: "flatten", icon: "▬", label: "Afvlakken" },
  { id: "edge", icon: "▟", label: "Scherpe rand" }
];
const TOOLS = [
  { id: "height", icon: "⛰️", label: "Hoogte" },
  { id: "stamp", icon: "🗻", label: "Stempel" },
  { id: "paint", icon: "🖌️", label: "Verf" },
  { id: "water", icon: "🌊", label: "Water" },
  { id: "ground", icon: "🌍", label: "Grond" }
];
const BLENDS = [
  { id: "add", label: "Optellen" },
  { id: "max", label: "Hoogste" },
  { id: "replace", label: "Vervangen" }
];
// Gum: "hard" = alles binnen de cirkel in één keer weg (standaard), "soft" = langzaam terug naar de grond.
const ERASE_MODES = [
  { id: "hard", label: "Gum: helemaal weg" },
  { id: "soft", label: "Gum: zacht" }
];
const UNDO_LIMIT = 30;
const UPLOAD_BATCH = 64;
const PAINT_BATCH = 32;
const STORE_KEY = "gk.terrein.penseel";
const WORKBENCH_KEYS = new Set(["g", "r", "t", "f", "x", "delete", "backspace"]);

const settings = {
  tool: "height", brush: "raise", radius: 10, strength: 40, softness: 60, heavyTint: true,
  flattenFixed: false, flattenHeight: 0, edgeStep: 3,
  stamp: "", stampSize: 64, stampHeight: 20, stampRotation: 0, stampBlend: "add", stampEdge: 15,
  paintTexture: "", eraseMode: "hard"
};
try { Object.assign(settings, JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}")); } catch {}
if (!TOOLS.some(function (tool) { return tool.id === settings.tool; })) settings.tool = "height";
if (settings.eraseMode !== "soft") settings.eraseMode = "hard";
if (!BRUSHES.some(function (brush) { return brush.id === settings.brush; })) settings.brush = "raise";

let api = null;
let open = false;
let stroke = null;
let cutting = null;
let lastPointer = null;
let shiftDown = false;
let suppressClickUntil = 0;
let counterTimer = null;
let busy = false;
let tintRuntime = null;
let libraryDetail = null;
// Ronde 3: water. selectedWater = doc-sleutel van het gekozen water; waterDrag = trekken, verslepen of een hoek.
let selectedWater = null;
let waterDrag = null;
const undoStack = [];
const redoStack = [];
const stampImages = new Map();
const stampResolved = new Map();

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

function bench() {
  return api?.docBench || null;
}

function assets() {
  return typeof api?.getAssets === "function" ? api.getAssets() || [] : [];
}

function assetById(id) {
  return id ? assets().find(function (asset) { return asset.id === id; }) || null : null;
}

function docsOf(kind) {
  return bench()?.workspace ? bench().docs(kind) : [];
}

function docName(doc) {
  return doc?.body?.displayName || String(doc?.docKey || "").replace(/^[a-z_]+:/, "");
}

// ---------- terreintexturen en stempels (Bibliotheek) ----------

function textureInfo(docKey) {
  const doc = docKey ? bench()?.doc(docKey) : null;
  const asset = doc ? assetById(doc.body?.textureAssetId) : null;
  return asset?.sourcePath ? { url: asset.sourcePath, size: Number(doc.body.tileSize) || 4 } : null;
}

// De 3D-view moet een net gekozen textuur kennen, ook als de wereld nog niet opnieuw geladen is.
function defineTextures() {
  const rt = runtime();
  if (!rt || typeof rt.terrainDefinePaintTexture !== "function") return;
  for (const doc of docsOf("terrain_texture")) {
    const info = textureInfo(doc.docKey);
    if (info) rt.terrainDefinePaintTexture(doc.docKey, info);
  }
}

function selectedStampDoc() {
  const doc = settings.stamp ? bench()?.doc(settings.stamp) : null;
  return doc && !doc.archived ? doc : null;
}

async function decodeViaCanvas(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(2, Math.round(image.naturalWidth * scale));
  const height = Math.max(2, Math.round(image.naturalHeight * scale));
  const board = document.createElement("canvas");
  board.width = width;
  board.height = height;
  const context = board.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i += 1) data[i] = (pixels[i * 4] + pixels[i * 4 + 1] + pixels[i * 4 + 2]) / 765;
  return { width, height, data };
}

// Het hoogteplaatje van een stempel (0..1). 16-bit PNG blijft 16-bit; andere plaatjes via het canvas (8-bit).
function stampImageFor(doc) {
  const asset = assetById(doc?.body?.imageAssetId);
  const url = asset?.sourcePath || "";
  if (!url) return Promise.resolve(null);
  if (stampImages.has(url)) return stampImages.get(url);
  const promise = fetch(url, { credentials: "same-origin" })
    .then(function (response) { return response.ok ? response.arrayBuffer() : Promise.reject(new Error("niet gevonden")); })
    .then(function (buffer) { return decodePng(new Uint8Array(buffer)).then(pngToHeights); })
    .catch(function () { return decodeViaCanvas(url).catch(function () { return null; }); })
    .then(function (image) {
      if (!image) {
        stampImages.delete(url);
        return null;
      }
      // Stempels gebruiken hooguit 512 punten per kant (meer detail dan 1 m per punt heeft geen zin).
      const step = Math.max(1, Math.ceil(Math.max(image.width, image.height) / 512));
      const result = step > 1 ? shrinkImage(image, step) : image;
      stampResolved.set(url, result);
      return result;
    });
  stampImages.set(url, promise);
  return promise;
}

function shrinkImage(image, step) {
  const width = Math.floor(image.width / step);
  const height = Math.floor(image.height / step);
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let dy = 0; dy < step; dy += 1) for (let dx = 0; dx < step; dx += 1) sum += image.data[(y * step + dy) * image.width + x * step + dx];
      data[y * width + x] = sum / (step * step);
    }
  }
  return { width, height, data };
}

function uniqueId(prefix, name, kind) {
  const base = prefix + "." + (slug(name) || "nieuw");
  const taken = new Set(docsOf(kind).map(function (doc) { return doc.docKey; }).concat(bench()?.docs(kind, true).map(function (doc) { return doc.docKey; }) || []));
  let id = base;
  for (let n = 2; taken.has(kind + ":" + id); n += 1) id = base + "_" + n;
  return id;
}

async function uploadImage(bytes, name) {
  if (typeof api?.importAsset !== "function") throw new Error("uploaden kan hier niet");
  const file = new File([bytes], (slug(name) || "stempel") + ".png", { type: "image/png" });
  return api.importAsset(file, { name, assetType: "image", category: "Terrein" });
}

async function createStamp({ name, bytes, size, height, id = null }) {
  const asset = await uploadImage(bytes, "Stempel " + name);
  if (!asset?.id) throw new Error("het plaatje is niet opgeslagen");
  const body = { stampId: id || uniqueId("stamp", name, "terrain_stamp"), displayName: name, imageAssetId: asset.id,
    size: Math.max(2, Math.min(2000, Math.round(size))), height: Math.max(-300, Math.min(300, Math.round(height * 10) / 10)) };
  const result = await bench().saveDoc("terrain_stamp", null, body, "Stempel " + name);
  return result?.docKey || "terrain_stamp:" + body.stampId;
}

function selectStamp(docKey) {
  const doc = bench()?.doc(docKey);
  if (!doc) return;
  settings.stamp = docKey;
  settings.tool = "stamp";
  if (Number.isFinite(Number(doc.body.size))) settings.stampSize = Number(doc.body.size);
  if (Number.isFinite(Number(doc.body.height))) settings.stampHeight = Number(doc.body.height);
  libraryDetail = docKey;
  remember();
  void stampImageFor(doc);
  renderAll();
}

function selectTexture(docKey) {
  settings.paintTexture = docKey || "";
  settings.tool = "paint";
  libraryDetail = docKey || null;
  remember();
  defineTextures();
  renderAll();
}

// PNG's uit de verkenner of gesleept op de Bibliotheek: elk wordt een stempel.
async function importStampFiles(files) {
  const list = Array.from(files || []).filter(function (file) { return /\.png$/i.test(file.name) || file.type === "image/png"; });
  if (!list.length) { status("Sleep een grijs PNG-hoogteplaatje (wit = hoog).", "error"); return; }
  let last = null;
  for (const file of list) {
    const name = file.name.replace(/\.png$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 60) || "Stempel";
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const png = await decodePng(bytes).catch(function () { return null; });
      status("Stempel " + name + " importeren...", "");
      last = await createStamp({ name, bytes, size: 64, height: 20 });
      if (png && png.bitDepth !== 16) status("Stempel " + name + " geïmporteerd (8-bit: bij hoge bergen kunnen kleine trapjes ontstaan).", "success");
      else status("Stempel " + name + " geïmporteerd.", "success");
    } catch (error) {
      status("Stempel " + name + " niet geïmporteerd: " + (error?.message || error) + ".", "error");
    }
  }
  if (last) selectStamp(last);
}

// Startset: een paar basisstempels als gewone Bibliotheek-items (houden of archiveren mag).
function hash2(x, y) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function valueNoise(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const top = hash2(x0, y0) + (hash2(x0 + 1, y0) - hash2(x0, y0)) * sx;
  const bottom = hash2(x0, y0 + 1) + (hash2(x0 + 1, y0 + 1) - hash2(x0, y0 + 1)) * sx;
  return top + (bottom - top) * sy;
}

function fbm(x, y) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let octave = 0; octave < 4; octave += 1) {
    sum += amp * valueNoise(x * freq, y * freq);
    amp *= 0.5;
    freq *= 2;
  }
  return sum / 0.9375;
}

function smooth(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const STARTSET = [
  { id: "heuvel", name: "Heuvel", size: 48, height: 8,
    shape: function (x, y) { const r = Math.hypot(x, y) * 2; return r >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * r); } },
  { id: "berg", name: "Berg", size: 140, height: 45,
    shape: function (x, y) { const r = Math.hypot(x, y) * 2; return r >= 1 ? 0 : Math.pow(1 - r, 1.5) * (0.62 + 0.38 * fbm(x * 6 + 3, y * 6 + 7)); } },
  { id: "krater", name: "Krater", size: 80, height: 10,
    shape: function (x, y) {
      const r = Math.hypot(x, y) * 2;
      const rim = Math.exp(-Math.pow((r - 0.62) / 0.14, 2));
      const floor = 0.22 * (1 - smooth(0.42, 0.6, r));
      return Math.max(rim, floor) * (1 - smooth(0.85, 1, r));
    } },
  { id: "plateau", name: "Plateau", size: 64, height: 8,
    shape: function (x, y) { return 1 - smooth(0.55, 0.72, Math.hypot(x, y) * 2); } },
  { id: "dal", name: "Dal", size: 120, height: -6,
    shape: function (x, y) { return Math.exp(-Math.pow(Math.abs(y) * 2 / 0.35, 2)) * (1 - smooth(0.7, 1, Math.abs(x) * 2)); } }
];

async function makeStartset() {
  if (busy) return;
  busy = true;
  let made = 0;
  let last = null;
  try {
    for (const item of STARTSET) {
      if (bench().doc("terrain_stamp:stamp." + item.id)) continue;
      status("Startset: " + item.name + " maken...", "");
      const side = 128;
      const data = new Uint16Array(side * side);
      for (let y = 0; y < side; y += 1) {
        for (let x = 0; x < side; x += 1) {
          const value = Math.max(0, Math.min(1, item.shape(x / (side - 1) - 0.5, y / (side - 1) - 0.5)));
          data[y * side + x] = Math.round(value * 65535);
        }
      }
      const bytes = await encodePng({ width: side, height: side, channels: 1, bitDepth: 16, data });
      last = await createStamp({ name: item.name, bytes, size: item.size, height: item.height, id: "stamp." + item.id });
      made += 1;
    }
    status(made ? "Startset klaar: " + made + " stempels in de Bibliotheek." : "De startset staat al in de Bibliotheek.", "success");
  } catch (error) {
    status("Startset niet gemaakt: " + (error?.message || error) + ".", "error");
  } finally {
    busy = false;
  }
  if (last) selectStamp(last);
  else renderAll();
}

// ---------- gereedschap op de 3D-view ----------

function brushMode(shift) {
  const mode = settings.brush;
  if (shift && mode === "raise") return "lower";
  if (shift && mode === "lower") return "raise";
  return mode;
}

// Gummen = Shift ingedrukt, of de kaart "Grond (gum)" gekozen.
function paintErasing(shift) {
  return shift === true || !settings.paintTexture;
}

function cursorFor(hit, color) {
  const rt = runtime();
  if (!rt) return;
  if (!hit) { rt.terrainSetCursor(null); return; }
  if (cutting) {
    rt.terrainSetCursor({ x: hit.x, z: hit.z, radius: 1, softness: 0, color: "#7fd3ff" });
    return;
  }
  if (settings.tool === "stamp") {
    const doc = selectedStampDoc();
    const image = doc ? stampResolved.get(assetById(doc.body.imageAssetId)?.sourcePath || "") || null : null;
    const foot = terrainStampFootprint({ image, x: hit.x, z: hit.z, size: settings.stampSize, rotation: settings.stampRotation });
    rt.terrainSetCursor({ shape: "rect", x: hit.x, z: hit.z, width: foot.width, depth: foot.depth, rotation: settings.stampRotation, color: color || "#ffffff" });
    return;
  }
  if (settings.tool === "ground") { rt.terrainSetCursor(null); return; }
  if (settings.tool === "water") {
    const water = waterDrag?.water || waterDrag?.base || waterOf(selectedWater);
    if (water) rt.terrainSetCursor({ shape: "rect", x: water.x, z: water.z, width: water.width, depth: water.depth, rotation: water.rotation, color: "#4fd1ff" });
    else rt.terrainSetCursor({ x: hit.x, z: hit.z, radius: 1, softness: 0, color: "#4fd1ff" });
    return;
  }
  const hard = (settings.brush === "edge" && settings.tool === "height")
    || (settings.tool === "paint" && settings.eraseMode === "hard" && paintErasing(stroke ? stroke.shift : shiftDown));
  rt.terrainSetCursor({ x: hit.x, z: hit.z, radius: settings.radius, softness: hard ? 0 : settings.softness / 100, color: color || "#ffffff" });
}

function startStroke(event) {
  const rt = runtime();
  if (!rt || !rt.terrainActive()) {
    status("Terrein is nog niet klaar: wacht tot de 3D-view geladen is.", "error");
    return;
  }
  const hit = rt.terrainRaycastScreen(event.clientX, event.clientY);
  const kind = settings.tool === "paint" ? "paint" : "height";
  let target = null;
  if (kind === "height" && (settings.brush === "flatten" || settings.brush === "edge")) {
    if (!hit) return;
    const start = rt.terrainHeightAt(hit.x, hit.z);
    target = settings.brush === "flatten"
      ? (settings.flattenFixed ? Number(settings.flattenHeight) || 0 : start)
      : start + (event.shiftKey ? -1 : 1) * (Number(settings.edgeStep) || 3);
  }
  const before = new Map();
  stroke = {
    kind,
    pointerId: event.pointerId,
    touched: new Set(),
    before,
    beforeTouch: function (key, chunk) { before.set(key, kind === "paint" ? chunk : (chunk ? chunk.slice() : null)); },
    lastTime: performance.now(),
    shift: event.shiftKey,
    target,
    full: new Set(),
    raf: 0
  };
  lastPointer = { x: event.clientX, y: event.clientY };
  if (kind === "height") rt.terrainBeginEdit();
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
    const common = { x: hit.x, z: hit.z, radius: settings.radius, strength: settings.strength / 100, softness: settings.softness / 100,
      dt, bounds: rt.terrainBounds(), touched: stroke.touched, beforeTouch: stroke.beforeTouch };
    if (stroke.kind === "paint") {
      const erasing = paintErasing(stroke.shift);
      const result = applyTerrainPaint(rt.terrainPaintfield(), Object.assign(common, { texture: erasing ? "" : settings.paintTexture,
        erase: erasing && settings.eraseMode === "hard" }));
      if (result.changed.size) rt.terrainPaintChanged(result.changed);
      for (const key of result.full) stroke.full.add(key);
    } else {
      const changed = applyTerrainBrush(rt.terrainHeightfield(), Object.assign(common, { mode: brushMode(stroke.shift), target: stroke.target }));
      if (changed.size) rt.terrainChanged(changed);
    }
    lastPointer.worldX = hit.x;
    lastPointer.worldZ = hit.z;
    cursorFor(hit, "#ffd34d");
  }
  stroke.raf = requestAnimationFrame(paintStep);
}

function snapshotAfter(kind, keys) {
  const rt = runtime();
  const after = new Map();
  for (const key of keys) {
    if (kind === "paint") after.set(key, clonePaintChunk(rt.terrainPaintfield().chunks.get(key)));
    else {
      const chunk = rt.terrainHeightfield().chunks.get(key);
      after.set(key, chunk ? chunk.slice() : null);
    }
  }
  return after;
}

function pushUndo(entry) {
  undoStack.push(entry);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
}

function endStroke() {
  if (!stroke) return;
  cancelAnimationFrame(stroke.raf);
  const rt = runtime();
  const done = stroke;
  stroke = null;
  suppressClickUntil = Date.now() + 400;
  if (!rt || !done.touched.size) return;
  pushUndo({ kind: done.kind, before: done.before, after: snapshotAfter(done.kind, done.touched) });
  // Einde van de streek: ook de buurvakken opnieuw (licht over de rand).
  if (done.kind === "height") rt.terrainChanged(done.touched, { neighbors: true });
  if (done.full.size) status("Verf: " + done.full.size + " " + (done.full.size === 1 ? "vak heeft" : "vakken hebben") + " al 4 texturen; daar kwam geen verf. Gum eerst een textuur weg (Shift + verven).", "error");
  renderLive();
}

async function placeStamp(event) {
  const rt = runtime();
  if (!rt || !rt.terrainActive()) return;
  const doc = selectedStampDoc();
  if (!doc) { status("Kies eerst een stempel rechts in de Bibliotheek.", "error"); return; }
  const hit = rt.terrainRaycastScreen(event.clientX, event.clientY);
  if (!hit) return;
  const image = await stampImageFor(doc);
  if (!image) { status("Het plaatje van stempel " + docName(doc) + " kan niet gelezen worden.", "error"); return; }
  const before = new Map();
  const touched = new Set();
  rt.terrainBeginEdit();
  const changed = applyTerrainStamp(rt.terrainHeightfield(), {
    image, x: hit.x, z: hit.z, size: settings.stampSize, height: settings.stampHeight * (event.shiftKey ? -1 : 1),
    rotation: settings.stampRotation, blend: settings.stampBlend, edge: settings.stampEdge / 100, bounds: rt.terrainBounds(),
    touched, beforeTouch: function (key, chunk) { before.set(key, chunk ? chunk.slice() : null); }
  });
  if (!touched.size) return;
  rt.terrainChanged(changed.size ? changed : touched, { neighbors: true });
  pushUndo({ kind: "height", before, after: snapshotAfter("height", touched) });
  status("Stempel " + docName(doc) + " neergezet. Ctrl+Z = terug.", "success");
  renderLive();
}

function startCut() {
  cutting = { start: null, end: null };
  settings.tool = "stamp";
  renderAll();
  status("Trek met de linkermuis een vak om je heuvel of berg. Esc = stoppen.", "");
}

async function finishCut() {
  const rt = runtime();
  const cut = cutting;
  cutting = null;
  rt?.terrainSetCursor(null);
  renderAll();
  if (!rt || !cut?.start || !cut?.end) return;
  const region = sampleTerrainRegion(rt.terrainHeightfield(), cut.start.x, cut.start.z, cut.end.x, cut.end.z);
  if (!region) { status("Dat vak is te klein (minstens 3 x 3 meter).", "error"); return; }
  const range = region.max - region.min;
  if (range < 0.05) { status("Daar is de grond vlak: maak eerst een heuvel of berg en trek er dan een vak omheen.", "error"); return; }
  const name = (window.prompt("Naam van de nieuwe stempel?", "Mijn heuvel") || "").trim().slice(0, 60);
  if (!name) return;
  const data = new Uint16Array(region.width * region.depth);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.round(((region.data[i] - region.min) / range) * 65535);
  try {
    status("Stempel " + name + " opslaan...", "");
    const bytes = await encodePng({ width: region.width, height: region.depth, channels: 1, bitDepth: 16, data });
    const docKey = await createStamp({ name, bytes, size: region.width - 1, height: range });
    status("Stempel " + name + " staat in de Bibliotheek.", "success");
    selectStamp(docKey);
  } catch (error) {
    status("Stempel niet opgeslagen: " + (error?.message || error) + ".", "error");
  }
}

function applySnapshot(entry, which) {
  const rt = runtime();
  if (!rt) return;
  if (entry.kind === "group") {
    const parts = which === "after" ? entry.parts : entry.parts.slice().reverse();
    for (const part of parts) applySnapshot(part, which);
    return;
  }
  if (entry.kind === "doc") {
    // Water en paden zijn kaarten: terugzetten gaat via dezelfde weg als Ctrl+Z in de Werkbank.
    void bench()?.applyHistory(entry.history, which === "after" ? "redo" : "undo").catch(function (error) {
      status("Terugzetten mislukt: " + (error?.message || error) + ".", "error");
    });
    return;
  }
  const map = which === "after" ? entry.after : entry.before;
  if (entry.kind === "paint") {
    const chunks = rt.terrainPaintfield().chunks;
    for (const [key, chunk] of map) {
      if (chunk) chunks.set(key, clonePaintChunk(chunk));
      else chunks.delete(key);
    }
    rt.terrainPaintChanged(Array.from(map.keys()));
    return;
  }
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
  applySnapshot(entry, "before");
  redoStack.push(entry);
  status("Terrein: ongedaan gemaakt.", "");
  renderLive();
}

function redo() {
  const entry = redoStack.pop();
  if (!entry) return;
  applySnapshot(entry, "after");
  undoStack.push(entry);
  status("Terrein: opnieuw gedaan.", "");
  renderLive();
}

function hover(clientX, clientY) {
  const rt = runtime();
  if (!rt) return;
  const hit = rt.terrainRaycastScreen(clientX, clientY);
  if (hit) lastPointer = { x: clientX, y: clientY, worldX: hit.x, worldZ: hit.z };
  cursorFor(hit, "#ffffff");
}

// Vóór editor.js (dit bestand wordt eerst geladen): in Terrein is de linkermuis het gereedschap.
// Rechtermuis en wiel blijven de camera.
window.addEventListener("pointerdown", function (event) {
  if (!open || busy || event.button !== 0 || event.target !== canvas()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (settings.tool === "ground" && !cutting) return;
  try { event.target.setPointerCapture(event.pointerId); } catch {}
  if (cutting) {
    const hit = runtime()?.terrainRaycastScreen(event.clientX, event.clientY);
    if (hit) cutting = { pointerId: event.pointerId, start: hit, end: hit };
    return;
  }
  if (settings.tool === "stamp") {
    suppressClickUntil = Date.now() + 400;
    void placeStamp(event);
    return;
  }
  if (settings.tool === "water") {
    startWaterDrag(event);
    return;
  }
  startStroke(event);
}, true);

window.addEventListener("pointermove", function (event) {
  if (!open) return;
  shiftDown = event.shiftKey;
  if (stroke && event.pointerId === stroke.pointerId) {
    lastPointer = { x: event.clientX, y: event.clientY };
    stroke.shift = event.shiftKey;
    event.stopImmediatePropagation();
    return;
  }
  if (waterDrag && event.pointerId === waterDrag.pointerId) {
    event.stopImmediatePropagation();
    moveWaterDrag(event);
    return;
  }
  if (cutting?.start && event.pointerId === cutting.pointerId) {
    event.stopImmediatePropagation();
    const hit = runtime()?.terrainRaycastScreen(event.clientX, event.clientY);
    if (!hit) return;
    cutting.end = hit;
    runtime()?.terrainSetCursor({ shape: "rect", x: (cutting.start.x + hit.x) / 2, z: (cutting.start.z + hit.z) / 2,
      width: Math.abs(hit.x - cutting.start.x), depth: Math.abs(hit.z - cutting.start.z), rotation: 0, color: "#7fd3ff" });
    return;
  }
  if (event.target === canvas() && event.buttons === 0) hover(event.clientX, event.clientY);
}, true);

for (const type of ["pointerup", "pointercancel"]) {
  window.addEventListener(type, function (event) {
    if (waterDrag && event.pointerId === waterDrag.pointerId) {
      event.stopImmediatePropagation();
      try { canvas()?.releasePointerCapture(event.pointerId); } catch {}
      suppressClickUntil = Date.now() + 400;
      void endWaterDrag(type === "pointerup");
      return;
    }
    if (cutting?.start && event.pointerId === cutting.pointerId) {
      event.stopImmediatePropagation();
      try { canvas()?.releasePointerCapture(event.pointerId); } catch {}
      suppressClickUntil = Date.now() + 400;
      if (type === "pointerup") void finishCut();
      else { cutting = null; renderAll(); }
      return;
    }
    if (!stroke || event.pointerId !== stroke.pointerId) return;
    event.stopImmediatePropagation();
    try { canvas()?.releasePointerCapture(event.pointerId); } catch {}
    endStroke();
  }, true);
}

window.addEventListener("click", function (event) {
  if (!open || event.target !== canvas()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

window.addEventListener("dblclick", function (event) {
  if (!open || event.target !== canvas()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

window.addEventListener("keydown", function (event) {
  if (!open) return;
  const target = event.target;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
  const key = String(event.key || "").toLowerCase();
  if ((event.ctrlKey || event.metaKey) && (key === "z" || key === "y")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (key === "y" || event.shiftKey) redo(); else undo();
    return;
  }
  if (key === "escape" && cutting) {
    event.preventDefault();
    event.stopImmediatePropagation();
    cutting = null;
    runtime()?.terrainSetCursor(null);
    renderAll();
    status("Opslaan als stempel gestopt.", "");
    return;
  }
  if (settings.tool === "stamp" && (key === "[" || key === "]")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    settings.stampRotation = (settings.stampRotation + (key === "]" ? 15 : 345)) % 360;
    remember();
    renderTools();
    if (lastPointer) hover(lastPointer.x, lastPointer.y);
    return;
  }
  if (settings.tool === "water" && selectedWater && (key === "delete" || key === "backspace")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void removeSelectedWater();
    return;
  }
  // In Terrein doen de sneltoetsen van de Werkbank (G, R, T, F, X, Del) niets. WASD/QE blijft de camera.
  if (!event.ctrlKey && !event.metaKey && !event.altKey && WORKBENCH_KEYS.has(key)) event.stopImmediatePropagation();
}, true);

// ---------- Ronde 3: water (los, plat vlak) ----------

function waterOf(docKey) {
  const doc = docKey ? bench()?.doc(docKey) : null;
  return doc && !doc.archived && doc.kind === "terrain_water" ? normalizeTerrainWater(Object.assign({}, doc.body, { id: doc.docKey })) : null;
}

// De 3D-view toont de waterkaarten meteen (en tijdens slepen de nieuwe vorm), ook vóór SAVE TO GAME.
function pushWater(preview = null) {
  const rt = runtime();
  if (!rt || typeof rt.terrainSetWater !== "function" || !bench()?.workspace) return;
  const list = docsOf("terrain_water").map(function (doc) { return preview && doc.docKey === preview.id ? preview : waterOf(doc.docKey); }).filter(Boolean);
  if (preview && !preview.id) list.push(preview);
  rt.terrainSetWater(list);
}

function waterAt(x, z) {
  let best = null;
  for (const doc of docsOf("terrain_water")) {
    const water = waterOf(doc.docKey);
    if (water && waterContains(water, x, z) && (!best || water.height > best.height)) best = water;
  }
  return best;
}

// Welke hoek van het gekozen water onder de muis ligt (-1 = geen).
function waterCornerAt(water, x, z) {
  const reach = Math.max(1.2, Math.min(water.width, water.depth) * 0.15);
  return waterCorners(water).findIndex(function (corner) { return Math.hypot(corner.x - x, corner.z - z) <= reach; });
}

function round(value, step) {
  return Math.round(value / step) * step;
}

function waterDocBody(water) {
  const out = Object.assign({}, water);
  delete out.id;
  return {
    behavior: out.behavior, height: round(out.height, 0.1), x: round(out.x, 0.5), z: round(out.z, 0.5),
    width: Math.max(0.5, round(out.width, 0.5)), depth: Math.max(0.5, round(out.depth, 0.5)), rotation: Math.round(out.rotation) % 360,
    color: out.color, opacity: out.opacity, waves: out.waves
  };
}

function startWaterDrag(event) {
  const rt = runtime();
  const hit = rt?.terrainRaycastScreen(event.clientX, event.clientY);
  if (!hit) return;
  try { event.target.setPointerCapture(event.pointerId); } catch {}
  const chosen = waterOf(selectedWater);
  const corner = chosen ? waterCornerAt(chosen, hit.x, hit.z) : -1;
  if (chosen && corner >= 0) {
    const anchor = waterCorners(chosen)[(corner + 2) % 4];
    waterDrag = { pointerId: event.pointerId, mode: "resize", base: chosen, water: null, anchor };
    return;
  }
  const under = waterAt(hit.x, hit.z);
  if (under) {
    selectedWater = under.id;
    waterDrag = { pointerId: event.pointerId, mode: "move", base: under, water: null, dx: under.x - hit.x, dz: under.z - hit.z };
    renderTools();
    return;
  }
  // Nieuw water: net onder de grond waar je begint, zodat vlakke grond in het vak droog blijft.
  selectedWater = null;
  waterDrag = { pointerId: event.pointerId, mode: "new", start: hit, height: rt.terrainHeightAt(hit.x, hit.z) - 0.2, water: null };
  renderTools();
}

function moveWaterDrag(event) {
  const hit = runtime()?.terrainRaycastScreen(event.clientX, event.clientY);
  if (!hit || !waterDrag) return;
  const drag = waterDrag;
  if (drag.mode === "new") {
    drag.water = normalizeTerrainWater({ id: "", x: (drag.start.x + hit.x) / 2, z: (drag.start.z + hit.z) / 2,
      width: Math.max(0.5, Math.abs(hit.x - drag.start.x)), depth: Math.max(0.5, Math.abs(hit.z - drag.start.z)), height: drag.height });
  } else if (drag.mode === "move") {
    drag.water = Object.assign({}, drag.base, { x: hit.x + drag.dx, z: hit.z + drag.dz });
  } else {
    // Hoek slepen: de overkant blijft staan; breedte en lengte in de richting van het water.
    const angle = -drag.base.rotation * Math.PI / 180;
    const dx = hit.x - drag.anchor.x;
    const dz = hit.z - drag.anchor.z;
    const localX = dx * Math.cos(angle) - dz * Math.sin(angle);
    const localZ = dx * Math.sin(angle) + dz * Math.cos(angle);
    drag.water = Object.assign({}, drag.base, { x: (drag.anchor.x + hit.x) / 2, z: (drag.anchor.z + hit.z) / 2,
      width: Math.max(1, Math.abs(localX)), depth: Math.max(1, Math.abs(localZ)) });
  }
  pushWater(drag.water);
  cursorFor(hit, "#4fd1ff");
}

async function endWaterDrag(commit) {
  const drag = waterDrag;
  waterDrag = null;
  const b = bench();
  if (!drag || !b) return;
  if (!commit || !drag.water) { pushWater(); renderTools(); return; }
  try {
    if (drag.mode === "new") {
      if (drag.water.width < 1 || drag.water.depth < 1) {
        pushWater();
        status("Trek een groter vak voor water (minstens 1 x 1 m).", "error");
        return;
      }
      const name = "Water " + (b.docs("terrain_water", true).length + 1);
      const body = Object.assign({ waterId: uniqueId("water", name, "terrain_water"), displayName: name }, waterDocBody(drag.water));
      const result = await b.saveDoc("terrain_water", null, body, "Water gemaakt");
      selectedWater = result?.docKey || "terrain_water:" + body.waterId;
      pushUndo({ kind: "doc", history: { docKey: selectedWater, before: null, after: body } });
      status("Water gemaakt. Kies links Niet in, Doorheen of IJs en schuif de hoogte.", "success");
    } else {
      const doc = b.doc(drag.base.id);
      if (!doc) return;
      const body = Object.assign({}, doc.body, waterDocBody(drag.water));
      if (JSON.stringify(body) === JSON.stringify(doc.body)) { pushWater(); return; }
      const before = JSON.parse(JSON.stringify(doc.body));
      await b.saveDoc("terrain_water", doc, body, drag.mode === "move" ? "Water verplaatst" : "Water groter of kleiner");
      pushUndo({ kind: "doc", history: { docKey: doc.docKey, before, after: body } });
    }
  } catch (error) {
    pushWater();
    status("Water niet opgeslagen: " + (error?.message || error) + ".", "error");
  }
  renderAll();
}

async function removeSelectedWater() {
  const docKey = selectedWater;
  const doc = docKey ? bench()?.doc(docKey) : null;
  if (!doc) return;
  if (await bench().archiveDoc(docKey, "Water " + docName(doc) + " weggehaald")) {
    pushUndo({ kind: "doc", history: { docKey, archive: true } });
    selectedWater = null;
    renderAll();
  }
}

function waterBody() {
  const b = bench();
  if (!b?.workspace) return [el("div", { class: "terreinTip", text: "Laden..." })];
  const labels = { block: "Niet in", wade: "Doorheen", ice: "IJs" };
  const list = el("div", { class: "terreinWaterList" });
  for (const doc of docsOf("terrain_water")) {
    const water = waterOf(doc.docKey);
    if (!water) continue;
    const button = el("button", { type: "button", class: "terreinBrush" + (doc.docKey === selectedWater ? " active" : "") },
      [el("span", { text: "🌊" }), el("span", { text: docName(doc) + " · " + Math.round(water.width) + " x " + Math.round(water.depth) + " m · " + labels[water.behavior] })]);
    button.addEventListener("click", function () { selectedWater = doc.docKey; renderTools(); if (lastPointer?.x !== undefined) hover(lastPointer.x, lastPointer.y); });
    list.append(button);
  }
  const parts = [
    el("div", { class: "terreinTip", text: "Trek met de linkermuis een vak op de grond = nieuw water. Klik op water = kiezen, slepen = verplaatsen, een hoek slepen = groter of kleiner. Del = weghalen." }),
    list.childElementCount ? list : el("div", { class: "terreinTip", text: "Nog geen water. Graaf eerst een kuil (Hoogte > Verlagen) en trek er dan een vak overheen." })
  ];
  const chosen = selectedWater ? b.doc(selectedWater) : null;
  if (chosen && !chosen.archived) {
    const form = el("div", { class: "terreinForm" });
    b.renderForm(form, { kind: "terrain_water", docKey: chosen.docKey, place: "terrein", title: "🌊 " + docName(chosen) });
    const remove = el("button", { type: "button", class: "terreinWide", text: "🗑️ Dit water weghalen" });
    remove.addEventListener("click", function () { void removeSelectedWater(); });
    parts.push(form, remove);
  } else {
    selectedWater = null;
  }
  return parts;
}

// ---------- Ronde 3: paden in de verf ----------

// Paden uit de Area tool (geen water/lava, niet blokkerend) worden verf op de grond: één systeem, het pad volgt
// heuvels vanzelf. De losse padkaart gaat daarna weg; ↶ zet verf en pad samen terug.
function bakeablePaths() {
  return docsOf("area").filter(function (doc) {
    if (areaSoort(doc.body) !== "pad") return false;
    const values = areaNodeValues(doc.body, doc.docKey);
    return Boolean(values.textureAssetId) && values.animated !== true && values.blocksPlayer !== true && (values.points || []).length >= 2;
  });
}

function pathsButton() {
  const count = bench()?.workspace ? bakeablePaths().length : 0;
  const button = el("button", { type: "button", class: "terreinWide", disabled: !count || busy,
    text: count ? "🛤️ " + count + " pad(en) in de verf zetten" : "🛤️ Geen paden om te verven",
    title: "Paden met een textuur worden verf op de grond. Paden met water of lava, of die blokkeren, blijven een pad." });
  button.addEventListener("click", function () { void bakePaths(); });
  return button;
}

async function textureForAsset(assetId, label, width) {
  const existing = docsOf("terrain_texture").find(function (doc) { return doc.body.textureAssetId === assetId; });
  if (existing) return existing.docKey;
  const name = ("Pad " + label).slice(0, 60);
  const body = { textureId: uniqueId("tex", name, "terrain_texture"), displayName: name, textureAssetId: assetId,
    tileSize: Math.max(1, Math.min(30, Math.round(Number(width) || 4))) };
  const result = await bench().saveDoc("terrain_texture", null, body, "Terreintextuur " + name);
  return result?.docKey || "terrain_texture:" + body.textureId;
}

async function bakePaths() {
  const rt = runtime();
  const paths = bakeablePaths();
  if (!rt || !paths.length || busy) return;
  if (!window.confirm(paths.length + " pad(en) worden verf op de grond. De losse paden gaan daarna weg (↶ zet alles terug). Doorgaan?")) return;
  busy = true;
  const touched = new Set();
  const before = new Map();
  const full = new Set();
  const docParts = [];
  try {
    for (const doc of paths) {
      const values = areaNodeValues(doc.body, doc.docKey);
      const asset = assetById(values.textureAssetId);
      const texture = await textureForAsset(values.textureAssetId, asset?.name || docName(doc), values.width);
      defineTextures();
      const raw = (values.points || []).map(function (point) { return { x: Number(point.x), z: Number(point.z) }; });
      const points = raw.length >= 3 ? smoothPolyline(raw, 8) : raw;
      const result = applyTerrainPaintPath(rt.terrainPaintfield(), { texture, points, width: values.width, fade: values.edgeFadeWidth,
        bounds: rt.terrainBounds(), touched, beforeTouch: function (key, chunk) { before.set(key, chunk); } });
      if (result.changed.size) rt.terrainPaintChanged(result.changed);
      for (const key of result.full) full.add(key);
    }
    const paint = { kind: "paint", before, after: snapshotAfter("paint", touched) };
    for (const doc of paths) {
      if (await bench().archiveDoc(doc.docKey, "Pad " + docName(doc) + " is verf geworden")) docParts.push({ kind: "doc", history: { docKey: doc.docKey, archive: true } });
    }
    if (touched.size || docParts.length) pushUndo({ kind: "group", parts: [paint].concat(docParts) });
    status(paths.length + " pad(en) zijn verf geworden. Druk 💾 Opslaan (of verlaat Terrein) om de verf te bewaren."
      + (full.size ? " Let op: " + full.size + " vak(ken) hadden al 4 texturen; daar kwam geen verf." : ""), full.size ? "error" : "success");
  } catch (error) {
    status("Paden verven mislukt: " + (error?.message || error) + ".", "error");
  } finally {
    busy = false;
    renderAll();
  }
}

// ---------- paneel links ----------

function slider(key, label, min, max, unit, help, step = 1, onInput = null) {
  const value = el("span", { class: "terreinValue", text: settings[key] + unit });
  const input = el("input", { type: "range", min, max, step, value: settings[key], title: help });
  input.addEventListener("input", function () {
    settings[key] = Number(input.value);
    value.textContent = settings[key] + unit;
    remember();
    if (onInput) onInput();
    if (lastPointer?.x !== undefined) hover(lastPointer.x, lastPointer.y);
  });
  return el("label", { class: "terreinSlider", title: help }, [el("span", { text: label }), input, value]);
}

function choiceRow(items, current, onPick, extraClass = "") {
  const row = el("div", { class: "terreinBrushes " + extraClass });
  for (const item of items) {
    const button = el("button", { type: "button", class: "terreinBrush" + (item.id === current ? " active" : ""), "aria-pressed": item.id === current ? "true" : "false", title: item.label },
      [item.icon ? el("span", { text: item.icon }) : null, el("span", { text: item.label })]);
    button.addEventListener("click", function () { onPick(item.id); });
    row.append(button);
  }
  return row;
}

function brushSliders() {
  return [
    slider("radius", "Radius", 1, 64, " m", "Hoe groot het penseel is (meter)."),
    slider("strength", "Sterkte", 1, 100, " %", "Hoe snel het penseel werkt."),
    slider("softness", "Zachte rand", 0, 100, " %", "0 % = harde rand, 100 % = heel zacht aflopend.")
  ];
}

function heightBody() {
  const parts = [choiceRow(BRUSHES, settings.brush, function (id) { settings.brush = id; remember(); renderTools(); })];
  parts.push(...brushSliders());
  if (settings.brush === "flatten") {
    const fixed = el("input", { type: "checkbox" });
    fixed.checked = settings.flattenFixed === true;
    const amount = el("input", { type: "number", class: "terreinNumber", step: "0.5", value: settings.flattenHeight, disabled: !settings.flattenFixed });
    fixed.addEventListener("change", function () { settings.flattenFixed = fixed.checked; amount.disabled = !fixed.checked; remember(); });
    amount.addEventListener("change", function () { settings.flattenHeight = Number(amount.value) || 0; remember(); });
    parts.push(el("label", { class: "terreinCheck" }, [fixed, el("span", { text: "Vaste hoogte" }), amount, el("span", { text: "m" })]),
      el("div", { class: "terreinTip", text: settings.flattenFixed ? "Alles onder het penseel gaat naar deze hoogte." : "Alles onder het penseel gaat naar de hoogte waar je begint te tekenen." }));
  } else if (settings.brush === "edge") {
    parts.push(slider("edgeStep", "Stap", 0.5, 20, " m", "Hoeveel hoger (of met Shift lager) dan waar je begint.", 0.5),
      el("div", { class: "terreinTip", text: "Maakt een harde stap: alles in de cirkel gaat naar beginhoogte + stap. Shift = stap omlaag." }));
  } else {
    parts.push(el("div", { class: "terreinTip", text: "Linkermuis = tekenen. Shift = andersom. Rechtermuis en wiel = camera." }));
  }
  return parts;
}

function stampBody() {
  const doc = selectedStampDoc();
  const asset = doc ? assetById(doc.body.imageAssetId) : null;
  const chosen = el("div", { class: "terreinChosen" }, [
    asset?.thumbnailPath ? el("img", { src: asset.thumbnailPath, alt: "" }) : el("span", { class: "terreinChosenIcon", text: "🗻" }),
    el("span", { text: doc ? docName(doc) : "Kies een stempel rechts in de Bibliotheek." })
  ]);
  const cut = el("button", { type: "button", class: "terreinWide" + (cutting ? " active" : ""), text: cutting ? "▭ Trek nu een vak in de 3D-view (Esc = stop)" : "▭ Opslaan als stempel" });
  cut.addEventListener("click", function () {
    if (cutting) { cutting = null; runtime()?.terrainSetCursor(null); renderAll(); return; }
    startCut();
  });
  return [
    chosen,
    slider("stampSize", "Grootte", 2, 512, " m", "Hoe breed de stempel op de grond komt."),
    slider("stampHeight", "Hoogte", -100, 150, " m", "Hoe hoog wit wordt (negatief = kuil).", 0.5),
    slider("stampRotation", "Draaien", 0, 359, "°", "Draai de stempel. Sneltoets: [ en ]."),
    slider("stampEdge", "Zachte rand", 0, 50, " %", "Hoe zacht de rand van de stempel overloopt in de grond."),
    choiceRow(BLENDS, settings.stampBlend, function (id) { settings.stampBlend = id; remember(); renderTools(); }, "terreinBlends"),
    el("div", { class: "terreinTip", text: "Klik op de grond = neerzetten. Shift + klik = andersom (kuil). Optellen = heuvel op heuvel, Hoogste = alleen waar hij boven uitkomt, Vervangen = precies deze vorm." }),
    cut,
    el("div", { class: "terreinTip", text: "Opslaan als stempel: boetseer een heuvel of berg, klik deze knop en trek er een vak omheen." })
  ];
}

function paintBody() {
  const doc = settings.paintTexture ? bench()?.doc(settings.paintTexture) : null;
  const asset = doc ? assetById(doc.body.textureAssetId) : null;
  const chosen = el("div", { class: "terreinChosen" }, [
    asset?.thumbnailPath ? el("img", { src: asset.thumbnailPath, alt: "" }) : el("span", { class: "terreinChosenIcon", text: "🧽" }),
    el("span", { text: doc ? docName(doc) : "Grond (gum): haalt verf weg" })
  ]);
  return [
    chosen,
    ...brushSliders(),
    choiceRow(ERASE_MODES, settings.eraseMode, function (id) { settings.eraseMode = id; remember(); renderTools(); }, "terreinBlends"),
    el("div", { class: "terreinTip", text: "Kies rechts een textuur. Linkermuis = verven, Shift = gummen. Gum helemaal weg = alle verf binnen de cirkel is in één keer weg; zacht = langzaam terug naar de grond. Per vak van 64 m passen 4 texturen: de grond + 3 eigen." }),
    pathsButton()
  ];
}

function groundBody() {
  const parts = [];
  const b = bench();
  if (!b?.workspace) return [el("div", { class: "terreinTip", text: "Laden..." })];
  const worldHost = el("div", { class: "terreinForm" });
  const terrainHost = el("div", { class: "terreinForm" });
  b.renderForm(worldHost, { kind: "world_settings", place: "terrein", title: "Grond" });
  b.renderForm(terrainHost, { kind: "terrain_settings", place: "terrein", title: "Hoogte, rots en budget" });
  parts.push(worldHost, terrainHost);
  return parts;
}

function renderTools() {
  const host = api?.toolsHost;
  if (!host) return;
  const undoButton = el("button", { type: "button", class: "terreinSmall", title: "Ongedaan maken (Ctrl+Z)", text: "↶", disabled: undoStack.length === 0 });
  const redoButton = el("button", { type: "button", class: "terreinSmall", title: "Opnieuw (Ctrl+Y)", text: "↷", disabled: redoStack.length === 0 });
  undoButton.addEventListener("click", undo);
  redoButton.addEventListener("click", redo);
  const tabs = el("div", { class: "terreinTabs", role: "tablist" });
  for (const tool of TOOLS) {
    const button = el("button", { type: "button", role: "tab", class: "terreinTab" + (settings.tool === tool.id ? " active" : ""), "aria-selected": settings.tool === tool.id ? "true" : "false" },
      [el("span", { text: tool.icon }), el("span", { text: tool.label })]);
    button.addEventListener("click", function () {
      settings.tool = tool.id;
      if (cutting && tool.id !== "stamp") cutting = null;
      remember();
      renderTools();
      if (lastPointer?.x !== undefined) hover(lastPointer.x, lastPointer.y);
    });
    tabs.append(button);
  }
  const body = el("div", { class: "terreinBody" });
  const parts = settings.tool === "stamp" ? stampBody() : settings.tool === "paint" ? paintBody() : settings.tool === "ground" ? groundBody()
    : settings.tool === "water" ? waterBody() : heightBody();
  body.append(...parts);
  const tint = el("input", { type: "checkbox" });
  tint.checked = settings.heavyTint !== false;
  tint.addEventListener("change", function () {
    settings.heavyTint = tint.checked;
    remember();
    runtime()?.terrainSetHeavyTint(open && settings.heavyTint);
  });
  const save = el("button", { type: "button", class: "terreinSave", text: "💾 Opslaan" });
  const cancel = el("button", { type: "button", class: "terreinCancel", text: "Weggooien" , title: "Alles wat nog niet is opgeslagen terugzetten" });
  save.addEventListener("click", function () { void saveIfDirty().then(function (ok) { if (ok) renderLive(); }); });
  cancel.addEventListener("click", discard);
  host.replaceChildren(
    el("div", { class: "terreinHead" }, [el("strong", { text: "⛰️ Terrein" }), el("span", { class: "terreinUndo" }, [undoButton, redoButton])]),
    tabs,
    body,
    el("div", { class: "terreinFoot" }, [
      el("div", { class: "terreinCounter", "data-part": "counter" }),
      el("label", { class: "terreinCheck" }, [tint, el("span", { text: "Te zware vakken rood kleuren" })]),
      el("div", { class: "terreinMouse", "data-part": "mouse" }),
      el("div", { class: "terreinDirty", "data-part": "dirty" }),
      el("div", { class: "terreinActions" }, [save, cancel])
    ])
  );
  renderLive();
}

function level(value, budget) {
  const ratio = budget > 0 ? value / budget : 0;
  return ratio > 1 ? "red" : ratio >= 0.8 ? "orange" : "ok";
}

// Elke 300 ms: teller, muis en "niet opgeslagen" (zonder het hele paneel opnieuw te tekenen).
function renderLive() {
  const host = api?.toolsHost;
  const rt = runtime();
  if (!host || !rt) return;
  if (open && tintRuntime !== rt) {
    tintRuntime = rt;
    rt.terrainSetHeavyTint(settings.heavyTint !== false);
    defineTextures();
  }
  const box = host.querySelector('[data-part="counter"]');
  const mouse = host.querySelector('[data-part="mouse"]');
  const dirtyBox = host.querySelector('[data-part="dirty"]');
  for (const button of host.querySelectorAll(".terreinHead .terreinSmall")) {
    button.disabled = button.textContent === "↶" ? undoStack.length === 0 : redoStack.length === 0;
  }
  const stats = rt.terrainStats();
  if (box) {
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
      el("div", { class: "terreinRow terreinRow--muted", title: "Vakken met eigen verf (elk vak = 1 extra plaatje)." }, [
        el("span", { text: "🖌️ Geverfde vakken" }), el("b", { text: String(stats.painted || 0) })
      ]),
      el("div", { class: "terreinRow terreinRow--muted", title: "Alles wat de editor nu tekent (grond, modellen, schaduw)." }, [
        el("span", { text: "Totaal in beeld" }), el("b", { text: formatCount(info.triangles) })
      ])
    );
  }
  if (mouse) {
    mouse.textContent = lastPointer?.worldX !== undefined
      ? "📍 X " + lastPointer.worldX.toFixed(1) + " · Z " + lastPointer.worldZ.toFixed(1) + " · hoogte " + rt.terrainHeightAt(lastPointer.worldX, lastPointer.worldZ).toFixed(2) + " m"
      : "📍 Beweeg de muis over de grond.";
  }
  if (dirtyBox) {
    dirtyBox.textContent = stats.dirty ? "Niet opgeslagen: " + stats.dirty + " " + (stats.dirty === 1 ? "vak" : "vakken") + "." : (stats.loading ? "Grond laden..." : "Alles opgeslagen.");
    dirtyBox.classList.toggle("terreinDirty--warn", stats.dirty > 0);
  }
}

// ---------- Bibliotheek rechts ----------

function card({ thumb, icon, name, active, onClick, title }) {
  const button = el("button", { type: "button", class: "terreinCard" + (active ? " active" : ""), title: title || name }, [
    thumb ? el("img", { src: thumb, alt: "", loading: "lazy", draggable: "false" }) : el("span", { class: "terreinCardIcon", text: icon || "📄" }),
    el("span", { class: "terreinCardName", text: name })
  ]);
  button.addEventListener("click", onClick);
  return button;
}

function renderLibrary() {
  const host = api?.libraryHost;
  if (!host) return;
  const b = bench();
  if (!b?.workspace) {
    host.replaceChildren(el("div", { class: "terreinTip", text: "Bibliotheek laden..." }));
    return;
  }
  const fileInput = el("input", { type: "file", accept: "image/png,.png", multiple: true, hidden: true });
  fileInput.addEventListener("change", function () { void importStampFiles(fileInput.files); fileInput.value = ""; });
  const importButton = el("button", { type: "button", class: "terreinSmallText", text: "📥 PNG", title: "Een grijs hoogteplaatje importeren (wit = hoog). Je kunt PNG's ook op de Bibliotheek slepen." });
  importButton.addEventListener("click", function () { fileInput.click(); });
  const startButton = el("button", { type: "button", class: "terreinSmallText", text: "✨ Startset", title: "Heuvel, Berg, Krater, Plateau en Dal maken (houden of archiveren mag)." });
  startButton.addEventListener("click", function () { void makeStartset(); });
  const stamps = el("div", { class: "terreinGrid" });
  for (const doc of docsOf("terrain_stamp")) {
    const asset = assetById(doc.body.imageAssetId);
    stamps.append(card({ thumb: asset?.thumbnailPath || "", icon: "🗻", name: docName(doc), active: settings.stamp === doc.docKey,
      onClick: function () { selectStamp(doc.docKey); } }));
  }
  if (!stamps.childElementCount) stamps.append(el("div", { class: "terreinTip", text: "Nog geen stempels. Klik ✨ Startset of 📥 PNG." }));

  const addTexture = el("button", { type: "button", class: "terreinSmallText", text: "＋ Textuur", title: "Een nieuwe terreintextuur (plaatje + maat in meters)." });
  addTexture.addEventListener("click", function () { libraryDetail = "new:terrain_texture"; b.draft = null; renderLibrary(); });
  const textures = el("div", { class: "terreinGrid" });
  const worldDoc = b.docs("world_settings")[0] || null;
  const groundAsset = assetById(worldDoc?.body?.groundTextureAssetId);
  textures.append(card({ thumb: groundAsset?.thumbnailPath || "", icon: "🧽", name: "Grond (gum)", active: settings.tool === "paint" && !settings.paintTexture,
    title: "De grondtextuur zelf: verven hiermee haalt de andere verf weg.", onClick: function () { selectTexture(""); } }));
  for (const doc of docsOf("terrain_texture")) {
    const asset = assetById(doc.body.textureAssetId);
    textures.append(card({ thumb: asset?.thumbnailPath || "", icon: "🖌️", name: docName(doc), active: settings.paintTexture === doc.docKey,
      onClick: function () { selectTexture(doc.docKey); } }));
  }

  const detail = el("div", { class: "terreinDetail" });
  if (libraryDetail === "new:terrain_texture") {
    b.renderForm(detail, { kind: "terrain_texture", place: "terrein", onDone: function (docKey) {
      libraryDetail = docKey || null;
      if (docKey) selectTexture(docKey); else renderLibrary();
    } });
  } else if (libraryDetail && b.doc(libraryDetail) && !b.doc(libraryDetail).archived) {
    const doc = b.doc(libraryDetail);
    b.renderForm(detail, { kind: doc.kind, docKey: doc.docKey, place: "terrein" });
  }

  host.replaceChildren(
    el("div", { class: "terreinLibHead" }, [el("strong", { text: "🗻 Stempels" }), el("span", { class: "terreinLibActions" }, [importButton, startButton])]),
    stamps,
    el("div", { class: "terreinLibHead" }, [el("strong", { text: "🖌️ Texturen" }), el("span", { class: "terreinLibActions" }, [addTexture])]),
    textures,
    detail,
    fileInput
  );
}

function setupDrop(host) {
  if (!host || host.dataset.terreinDrop) return;
  host.dataset.terreinDrop = "1";
  host.addEventListener("dragover", function (event) {
    if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
    event.preventDefault();
    host.classList.add("terreinDropping");
  });
  host.addEventListener("dragleave", function () { host.classList.remove("terreinDropping"); });
  host.addEventListener("drop", function (event) {
    host.classList.remove("terreinDropping");
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    void importStampFiles(event.dataTransfer.files);
  });
}

function renderAll() {
  if (!api) return;
  if (!waterDrag) pushWater();
  renderTools();
  renderLibrary();
}

// ---------- opslaan ----------

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

async function uploadPaint(items) {
  const names = {};
  for (let i = 0; i < items.length; i += PAINT_BATCH) {
    const form = new FormData();
    for (const item of items.slice(i, i + PAINT_BATCH)) {
      const png = await encodePng({ width: TERRAIN_PAINT_VERTS, height: TERRAIN_PAINT_VERTS, channels: 3, bitDepth: 8, data: item.chunk.data });
      form.append(item.key, new Blob([png], { type: "image/png" }), "verf.png");
    }
    const response = await api.fetchApi("/api/editor/terrain-paint", { method: "POST", body: form, timeoutMs: 120000 }, "POST");
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok || !data.ok) throw new Error(data.message || "upload mislukt");
    Object.assign(names, data.paint || {});
  }
  return names;
}

// Bewaart de veranderde vakken (hoogte en verf) in de kaart "Terrein". true = gelukt (of niets te doen).
async function saveIfDirty() {
  const rt = runtime();
  if (!rt || !rt.terrainIsDirty()) return true;
  if (busy) return false;
  busy = true;
  try {
    const dirty = rt.terrainDirtyChunks();
    const paintDirty = typeof rt.terrainPaintDirtyChunks === "function" ? rt.terrainPaintDirtyChunks() : [];
    const count = new Set(dirty.map(function (entry) { return entry.key; }).concat(paintDirty.map(function (entry) { return entry.key; }))).size;
    const label = count + " " + (count === 1 ? "vak" : "vakken");
    status("Terrein opslaan: " + label + "...", "");
    const upload = dirty.filter(function (entry) { return entry.data && !terrainChunkIsFlat(entry.data); });
    const names = upload.length ? await uploadChunks(upload) : {};
    const paintfield = rt.terrainPaintfield();
    const paintItems = [];
    const emptied = [];
    for (const entry of paintDirty) {
      const chunk = paintfield.chunks.get(entry.key);
      if (chunk) tidyPaintChunk(chunk);
      if (chunk && !terrainPaintIsEmpty(chunk)) paintItems.push({ key: entry.key, chunk });
      else if (chunk) emptied.push(entry.key);
    }
    for (const key of emptied) paintfield.chunks.delete(key);
    if (emptied.length) rt.terrainPaintChanged(emptied, { edit: false });
    const paintNames = paintItems.length ? await uploadPaint(paintItems) : {};
    const doc = bench().doc("terrain_settings");
    const body = Object.assign({}, doc?.body || {});
    const refs = Object.assign({}, body.chunks || {});
    for (const entry of dirty) if (!names[entry.key]) delete refs[entry.key];
    Object.assign(refs, names);
    const paintRefs = Object.assign({}, body.paint || {});
    for (const entry of paintDirty) if (!paintNames[entry.key]) delete paintRefs[entry.key];
    const savedPaint = {};
    for (const item of paintItems) {
      paintRefs[item.key] = { file: paintNames[item.key], layers: item.chunk.layers.slice() };
      savedPaint[item.key] = paintRefs[item.key];
    }
    body.chunks = refs;
    body.paint = paintRefs;
    await bench().saveDoc("terrain_settings", doc, body, "Terrein (" + label + ")");
    rt.terrainCommitSaved(refs, names, paintRefs, savedPaint);
    status("Terrein opgeslagen (" + label + "). Druk SAVE TO GAME om het in de game te zetten.", "success");
    renderLive();
    return true;
  } catch (error) {
    status("Terrein niet opgeslagen: " + (error?.message || error) + ".", "error");
    return false;
  } finally {
    busy = false;
  }
}

function discard() {
  const rt = runtime();
  if (!rt || !rt.terrainIsDirty()) { status("Er is niets om weg te gooien: alles is opgeslagen.", ""); return; }
  if (!window.confirm("Alles wat in Terrein nog niet is opgeslagen weggooien?")) return;
  rt.terrainDiscardEdits();
  undoStack.length = 0;
  redoStack.length = 0;
  status("Terrein: niet opgeslagen werk weggegooid.", "");
  renderAll();
}

// ---------- tab openen en sluiten ----------

function activate() {
  if (!api) return;
  setupDrop(api.libraryHost);
  if (!open) {
    open = true;
    tintRuntime = null;
    document.body.classList.add("terreinMode");
    clearInterval(counterTimer);
    counterTimer = setInterval(renderLive, 300);
    if (!bench()?.workspace && bench()?.load) bench().load().then(renderAll).catch(function () {});
  }
  renderAll();
}

// De tab verlaten = opslaan (net als Sluiten in ronde 1). Ctrl+Z van Terrein vervalt dan.
function deactivate() {
  if (!open) return;
  if (stroke) endStroke();
  cutting = null;
  waterDrag = null;
  open = false;
  document.body.classList.remove("terreinMode");
  clearInterval(counterTimer);
  counterTimer = null;
  const rt = runtime();
  rt?.terrainSetCursor(null);
  rt?.terrainSetHeavyTint(false);
  tintRuntime = null;
  undoStack.length = 0;
  redoStack.length = 0;
  if (rt?.terrainIsDirty()) void saveIfDirty();
}

// api: { getRuntime, fetchApi, docBench, setStatus, getAssets, importAsset, toolsHost, libraryHost }
export function createTerrainEditor(options = {}) {
  api = options;
  return {
    activate,
    deactivate,
    isOpen: function () { return open; },
    // Na een documentwijziging (Bibliotheek, Grond): panelen opnieuw tekenen.
    render: function () {
      if (!open) return;
      defineTextures();
      renderAll();
    },
    saveIfDirty
  };
}
