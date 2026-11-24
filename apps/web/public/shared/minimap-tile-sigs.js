// Kevin 24-11: per kaarttegel een vingerafdruk van wat erop staat (grond, verf, modellen, begroeiing, muren, ...).
// BAKE maakt dan alleen de tegels opnieuw waarvan de vingerafdruk anders is dan bij de vorige bake.
// tiles = [{ key: "laag:tx:tz", minX, maxX, minZ, maxZ }] -> { key: "16 hex" }.
// heightChunks / paintChunks = de terreinvakken zoals de editor ze nu heeft (Map "cx:cz" -> gegevens), ook nog niet opgeslagen.
import { TERRAIN_CHUNK_METERS } from "./terrain.js";

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function minimapTileSignatures({ world = null, heightChunks = null, paintChunks = null, tiles = [] } = {}) {
  const lane = function () { return [0x811c9dc5 | 0, 0x01000193 ^ 0x5bd1e995]; };
  const addText = function (state, text) {
    let a = state[0], b = state[1];
    for (let i = 0; i < text.length; i += 1) { const c = text.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 0x5bd1e995); b ^= b >>> 15; }
    state[0] = a; state[1] = b;
  };
  const addBytes = function (state, view) {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    let a = state[0], b = state[1];
    for (let i = 0; i < bytes.length; i += 1) { const c = bytes[i]; a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 0x5bd1e995); b ^= b >>> 15; }
    state[0] = a; state[1] = b;
  };
  const hex = function (state) { return (state[0] >>> 0).toString(16).padStart(8, "0") + (state[1] >>> 0).toString(16).padStart(8, "0"); };
  const safeJson = function (value) {
    try {
      return JSON.stringify(value, function (key, entry) {
        if (typeof entry === "function" || (key && key.charAt(0) === "_")) return undefined;
        if (entry && typeof entry === "object" && (entry.isObject3D || entry.isMaterial || entry.isTexture || entry.isBufferGeometry)) return undefined;
        return entry;
      }) || "";
    } catch { return ""; }
  };
  const textHash = function (text) { const state = lane(); addText(state, text); return hex(state); };
  const pointsBox = function (list, pad) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of Array.isArray(list) ? list : []) {
      const x = Array.isArray(p) ? num(p[0], NaN) : num(p?.x, NaN);
      const z = Array.isArray(p) ? num(p[1], NaN) : num(p?.z, NaN);
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    return Number.isFinite(minX) ? { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad } : null;
  };
  const items = [];
  const globalParts = [];
  const addItem = function (box, sig) { if (box && sig) items.push({ box, sig }); else if (sig) globalParts.push(sig); };
  const w = world || {};
  const heightConfig = Object.assign({}, w.terrain?.heightfield || {}, { chunks: null, paint: Object.assign({}, w.terrain?.heightfield?.paint || {}, { chunks: null }) });
  // Wat overal te zien is: grond, lucht, licht, beeld, verf-texturen, water. Verandert dit, dan alles opnieuw.
  globalParts.push(safeJson({ ground: w.ground || null, sky: w.sky || null, render: w.render || null, dayNight: w.dayNight || null, lights: w.lights || null,
    background: w.world?.backgroundColor || null, zoneGrounds: w.zoneGrounds || null, terrainConfig: heightConfig, layers: w.terrain?.layers || null,
    water: w.terrain?.water || null }));
  for (const entity of Array.isArray(w.entities) ? w.entities : []) {
    const position = entity?.transform?.position;
    const scale = Math.max(1, num(entity?.transform?.scale?.x, 1), num(entity?.transform?.scale?.z, 1), num(entity?.transform?.scale?.y, 1));
    // Met een mesh-grens: die vorm; anders ruim om de plek (bladeren, schaduw).
    const box = Array.isArray(entity?.collisionPoints) && entity.collisionPoints.length >= 3
      ? pointsBox(entity.collisionPoints, 8)
      : position ? pointsBox([{ x: position.x, z: position.z }], Math.max(6, num(entity.collisionRadius, 1) * 2) * scale + 6) : null;
    addItem(box, textHash(safeJson(entity)));
  }
  for (const area of Array.isArray(w.scatterAreas) ? w.scatterAreas : []) addItem(pointsBox(area?.points || area?.polygon || area?.outline, 6), textHash(safeJson(area)));
  for (const wall of Array.isArray(w.walls) ? w.walls : []) addItem(pointsBox(wall?.points, 3), textHash(safeJson(wall)));
  for (const floor of Array.isArray(w.indoorFloors) ? w.indoorFloors : []) addItem(pointsBox(floor?.outline, 2), textHash(safeJson(floor)));
  for (const surface of Array.isArray(w.terrain?.surfaces) ? w.terrain.surfaces : []) addItem(pointsBox(surface?.points || surface?.outline, 3), textHash(safeJson(surface)));
  // Terrein (hoogte en verf) per vak van 64 m, zoals de editor het nu heeft (ook nog niet opgeslagen).
  const chunkBox = function (key) {
    const parts = String(key).split(":");
    const cx = Number(parts[0]), cz = Number(parts[1]);
    return Number.isFinite(cx) && Number.isFinite(cz) ? { minX: cx * TERRAIN_CHUNK_METERS - 1, maxX: (cx + 1) * TERRAIN_CHUNK_METERS + 1, minZ: cz * TERRAIN_CHUNK_METERS - 1, maxZ: (cz + 1) * TERRAIN_CHUNK_METERS + 1 } : null;
  };
  {
    for (const [key, chunk] of heightChunks || []) {
      if (!chunk || !ArrayBuffer.isView(chunk)) continue;
      const state = lane(); addText(state, "h" + key); addBytes(state, chunk);
      addItem(chunkBox(key), hex(state));
    }
    for (const [key, chunk] of paintChunks || []) {
      if (!chunk || !ArrayBuffer.isView(chunk.data)) continue;
      const state = lane(); addText(state, "p" + key + (chunk.layers || []).join("|")); addBytes(state, chunk.data);
      addItem(chunkBox(key), hex(state));
    }
  }
  const globalSig = textHash(globalParts.join("\n"));
  // Per laag: welke dingen liggen in welke tegel (in de volgorde van de wereld).
  const buckets = new Map();
  const levels = new Map();
  for (const tile of tiles || []) {
    const level = Number(String(tile.key).split(":")[0]);
    const size = num(tile.maxX) - num(tile.minX);
    if (Number.isFinite(level) && size > 0) levels.set(level, size);
  }
  items.forEach(function (item, index) {
    for (const [level, size] of levels) {
      for (let tz = Math.floor(item.box.minZ / size); tz <= Math.floor(item.box.maxZ / size); tz += 1) {
        for (let tx = Math.floor(item.box.minX / size); tx <= Math.floor(item.box.maxX / size); tx += 1) {
          const key = level + ":" + tx + ":" + tz;
          let list = buckets.get(key);
          if (!list) { list = []; buckets.set(key, list); }
          list.push(index);
        }
      }
    }
  });
  const out = {};
  for (const tile of tiles || []) {
    const state = lane();
    addText(state, globalSig);
    for (const index of buckets.get(tile.key) || []) addText(state, items[index].sig);
    out[tile.key] = hex(state);
  }
  return out;
}
