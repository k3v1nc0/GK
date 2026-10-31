// Wereld tekenen (ronde 1): de hoogte van de grond, in vakken van 64 x 64 meter.
// Eén bestand voor editor, game en server, zodat alle drie precies dezelfde hoogte zien (hoogteOp).
//
// Een vak heeft 65 x 65 hoogtepunten (1 per meter); de rand is dubbel met het buurvak, zodat elk vak los
// een gesloten stuk grond is. Opslag: Int16 in centimeters (little-endian) = 8450 bytes per vak.
// Een vak dat er niet is, is plat (hoogte 0). Sleutel "cx:cz" met cx = floor(x / 64).
// Geen DOM en geen Three.js: de server gebruikt dit ook.

export const TERRAIN_CHUNK_METERS = 64;
export const TERRAIN_CHUNK_VERTS = TERRAIN_CHUNK_METERS + 1;
export const TERRAIN_CHUNK_BYTES = TERRAIN_CHUNK_VERTS * TERRAIN_CHUNK_VERTS * 2;
export const TERRAIN_MAX_SLOPE_DEG = 50;
export const TERRAIN_LOD_NEAR_ERROR = 0.05;
export const TERRAIN_LOD_FAR_ERROR = 0.5;
export const TERRAIN_TRI_BUDGET = 60000;
export const TERRAIN_CHUNK_TRI_BUDGET = 4000;
const SIZE = TERRAIN_CHUNK_METERS;
const VERTS = TERRAIN_CHUNK_VERTS;
const CM_MIN = -32768;
const CM_MAX = 32767;
const KEY_PATTERN = /^(-?\d{1,5}):(-?\d{1,5})$/;
export const TERRAIN_CHUNK_SHA_PATTERN = /^[0-9a-f]{40}$/;

export function terrainChunkKey(cx, cz) {
  return cx + ":" + cz;
}

export function parseTerrainChunkKey(key) {
  const match = KEY_PATTERN.exec(String(key || ""));
  return match ? { cx: Number(match[1]), cz: Number(match[2]) } : null;
}

export function terrainChunkIndex(meters) {
  return Math.floor(meters / SIZE);
}

// De hoogtekaart: losse vakken (Int16Array in cm). revision telt op bij elke wijziging (voor caches).
export function createHeightfield(chunks = null) {
  const map = new Map();
  if (chunks instanceof Map) for (const [key, data] of chunks) map.set(key, data);
  else if (chunks && typeof chunks === "object") for (const [key, data] of Object.entries(chunks)) map.set(key, data);
  return { chunks: map, revision: 0 };
}

export function decodeTerrainChunk(bytes) {
  if (!bytes) return null;
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  if (!(view.byteLength === TERRAIN_CHUNK_BYTES)) return null;
  const data = new DataView(view.buffer, view.byteOffset, view.byteLength);
  const out = new Int16Array(VERTS * VERTS);
  for (let i = 0; i < out.length; i += 1) out[i] = data.getInt16(i * 2, true);
  return out;
}

export function encodeTerrainChunk(chunk) {
  const out = new Uint8Array(TERRAIN_CHUNK_BYTES);
  const data = new DataView(out.buffer);
  for (let i = 0; i < VERTS * VERTS; i += 1) data.setInt16(i * 2, chunk[i] || 0, true);
  return out;
}

export function terrainChunkIsFlat(chunk) {
  if (!chunk) return true;
  for (let i = 0; i < chunk.length; i += 1) if (chunk[i] !== 0) return false;
  return true;
}

// Hoogte (cm) van één hoogtepunt op hele meters ix, iz.
export function terrainVertexCm(hf, ix, iz) {
  const cx = Math.floor(ix / SIZE);
  const cz = Math.floor(iz / SIZE);
  const chunk = hf?.chunks?.get(cx + ":" + cz);
  if (!chunk) return 0;
  return chunk[(iz - cz * SIZE) * VERTS + (ix - cx * SIZE)];
}

// hoogteOp: de hoogte van de grond (meter) op x, z. Tussen de punten lineair (bilineair) verlopen.
export function terrainHeightAt(hf, x, z) {
  if (!hf || !hf.chunks || hf.chunks.size === 0) return 0;
  const px = Number(x);
  const pz = Number(z);
  if (!Number.isFinite(px) || !Number.isFinite(pz)) return 0;
  const fx = Math.floor(px);
  const fz = Math.floor(pz);
  const cx = Math.floor(fx / SIZE);
  const cz = Math.floor(fz / SIZE);
  const chunk = hf.chunks.get(cx + ":" + cz);
  if (!chunk) return 0;
  const lx = fx - cx * SIZE;
  const lz = fz - cz * SIZE;
  const tx = px - fx;
  const tz = pz - fz;
  const i = lz * VERTS + lx;
  const h00 = chunk[i];
  const h10 = chunk[i + 1];
  const h01 = chunk[i + VERTS];
  const h11 = chunk[i + VERTS + 1];
  const top = h00 + (h10 - h00) * tx;
  const bottom = h01 + (h11 - h01) * tx;
  return (top + (bottom - top) * tz) / 100;
}

// Schrijft één hoogtepunt in alle vakken die het delen (rand = dubbel). touched: Set van vakken die in deze
// streek al een "voor"-kopie hebben; beforeTouch(key, chunkOfNull) wordt per vak één keer aangeroepen.
function writeVertexCm(hf, ix, iz, cm, ctx) {
  const value = Math.max(CM_MIN, Math.min(CM_MAX, Math.round(cm)));
  const cx0 = Math.floor(ix / SIZE);
  const cz0 = Math.floor(iz / SIZE);
  const lx0 = ix - cx0 * SIZE;
  const lz0 = iz - cz0 * SIZE;
  for (let a = 0; a < (lx0 === 0 ? 2 : 1); a += 1) {
    const cx = a === 0 ? cx0 : cx0 - 1;
    const lx = a === 0 ? lx0 : SIZE;
    for (let b = 0; b < (lz0 === 0 ? 2 : 1); b += 1) {
      const cz = b === 0 ? cz0 : cz0 - 1;
      const lz = b === 0 ? lz0 : SIZE;
      const key = cx + ":" + cz;
      let chunk = hf.chunks.get(key);
      if (ctx.touched && !ctx.touched.has(key)) {
        ctx.touched.add(key);
        if (typeof ctx.beforeTouch === "function") ctx.beforeTouch(key, chunk || null);
      }
      if (!chunk) {
        if (value === 0) continue;
        chunk = new Int16Array(VERTS * VERTS);
        hf.chunks.set(key, chunk);
      }
      const index = lz * VERTS + lx;
      if (chunk[index] !== value) {
        chunk[index] = value;
        ctx.changed.add(key);
      }
    }
  }
}

function dither(ix, iz, seed) {
  const value = Math.sin(ix * 12.9898 + iz * 78.233 + (seed % 9973) * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

export function terrainBrushWeight(distance, radius, softness) {
  if (distance >= radius) return 0;
  const hard = radius * (1 - Math.max(0, Math.min(1, softness)));
  if (distance <= hard) return 1;
  const t = (distance - hard) / Math.max(0.000001, radius - hard);
  return 0.5 + 0.5 * Math.cos(Math.PI * t);
}

// Penseel: mode "raise" | "lower" | "smooth" | "flatten" | "edge". strength 0..1, softness 0..1 (zachte rand),
// dt in seconden. Verhogen/verlagen: maximaal 6 m per seconde in het midden. Gladstrijken: trekt naar het
// gemiddelde van de buren. Afvlakken (ronde 2): trekt naar target (meter). Scherpe rand: zet alles binnen de
// cirkel snel op target, zonder zachte rand (een harde stap van 1 m breed).
// Geeft de Set van vakken terug die echt veranderd zijn (om opnieuw te tekenen).
export const TERRAIN_BRUSH_SPEED = 6;
const BRUSH_MODES = new Set(["raise", "lower", "smooth", "flatten", "edge"]);
export function applyTerrainBrush(hf, brush = {}) {
  const changed = new Set();
  const mode = BRUSH_MODES.has(brush.mode) ? brush.mode : "raise";
  const targetCm = Math.round(Number(brush.target) * 100);
  if ((mode === "flatten" || mode === "edge") && !Number.isFinite(targetCm)) return changed;
  const x = Number(brush.x);
  const z = Number(brush.z);
  const radius = Math.max(0.5, Math.min(128, Number(brush.radius) || 8));
  const strength = Math.max(0, Math.min(1, Number(brush.strength)));
  const softness = Math.max(0, Math.min(1, Number(brush.softness)));
  const dt = Math.max(0, Math.min(0.25, Number(brush.dt) || 0));
  if (!hf || !Number.isFinite(x) || !Number.isFinite(z) || strength <= 0 || dt <= 0) return changed;
  const bounds = brush.bounds || null;
  let x0 = Math.ceil(x - radius);
  let x1 = Math.floor(x + radius);
  let z0 = Math.ceil(z - radius);
  let z1 = Math.floor(z + radius);
  if (bounds) {
    x0 = Math.max(x0, Math.floor(bounds.minX));
    x1 = Math.min(x1, Math.ceil(bounds.maxX));
    z0 = Math.max(z0, Math.floor(bounds.minZ));
    z1 = Math.min(z1, Math.ceil(bounds.maxZ));
  }
  if (x1 < x0 || z1 < z0) return changed;
  const ctx = { touched: brush.touched || null, beforeTouch: brush.beforeTouch || null, changed };
  const width = x1 - x0 + 1;
  const writes = new Float64Array(width * (z1 - z0 + 1));
  const has = new Uint8Array(writes.length);
  const step = TERRAIN_BRUSH_SPEED * strength * dt * 100;
  for (let iz = z0; iz <= z1; iz += 1) {
    for (let ix = x0; ix <= x1; ix += 1) {
      const distance = Math.hypot(ix - x, iz - z);
      const weight = mode === "edge" ? (distance < radius ? 1 : 0) : terrainBrushWeight(distance, radius, softness);
      if (weight <= 0) continue;
      const current = terrainVertexCm(hf, ix, iz);
      let next = current;
      if (mode === "raise") next = current + step * weight;
      else if (mode === "lower") next = current - step * weight;
      else if (mode === "flatten") next = current + (targetCm - current) * Math.min(1, weight * strength * dt * 8);
      else if (mode === "edge") next = current + (targetCm - current) * Math.min(1, strength * dt * 20);
      else {
        let sum = 0;
        for (let dz = -1; dz <= 1; dz += 1) for (let dx = -1; dx <= 1; dx += 1) sum += terrainVertexCm(hf, ix + dx, iz + dz);
        const pull = Math.min(1, weight * strength * dt * 12);
        next = current + (sum / 9 - current) * pull;
      }
      const slot = (iz - z0) * width + (ix - x0);
      // Afronden op hele cm met een beetje ruis: anders worden kleine stapjes per frame trapjes (terrassen).
      writes[slot] = Math.floor(next + dither(ix, iz, hf.revision));
      has[slot] = 1;
    }
  }
  // Pas na het rekenen schrijven: gladstrijken leest zo overal de oude buren (geen voorkeursrichting).
  for (let iz = z0; iz <= z1; iz += 1) {
    for (let ix = x0; ix <= x1; ix += 1) {
      const slot = (iz - z0) * width + (ix - x0);
      if (has[slot]) writeVertexCm(hf, ix, iz, writes[slot], ctx);
    }
  }
  if (changed.size) hf.revision += 1;
  return changed;
}

// ---------- stempels (ronde 2) ----------

function sampleStampImage(image, s, t) {
  const fx = Math.max(0, Math.min(1, s)) * (image.width - 1);
  const fy = Math.max(0, Math.min(1, t)) * (image.height - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(image.width - 1, x0 + 1);
  const y1 = Math.min(image.height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const row0 = y0 * image.width;
  const row1 = y1 * image.width;
  const top = image.data[row0 + x0] + (image.data[row0 + x1] - image.data[row0 + x0]) * tx;
  const bottom = image.data[row1 + x0] + (image.data[row1 + x1] - image.data[row1 + x0]) * tx;
  return top + (bottom - top) * ty;
}

// Waar een stempel ligt: rechthoek size x (size * hoogte/breedte van het plaatje), gedraaid om het midden.
export function terrainStampFootprint(stamp = {}) {
  const image = stamp.image || { width: 1, height: 1 };
  const size = Math.max(1, Math.min(4096, Number(stamp.size) || 64));
  const depth = size * (image.height / Math.max(1, image.width));
  const rotation = ((Number(stamp.rotation) || 0) * Math.PI) / 180;
  return { x: Number(stamp.x) || 0, z: Number(stamp.z) || 0, width: size, depth, rotation };
}

// Stempel: een hoogteplaatje (image.data 0..1, wit = hoog) op x, z. height in meter (negatief = kuil).
// blend: "add" (optellen), "max" (hoogste houden) of "replace" (vervangen). edge 0..0.5 = zachte rand.
// Geeft de Set van veranderde vakken terug.
export function applyTerrainStamp(hf, stamp = {}) {
  const changed = new Set();
  const image = stamp.image;
  if (!hf || !image || !(image.width > 1) || !(image.height > 1) || !image.data) return changed;
  const foot = terrainStampFootprint(stamp);
  const heightCm = (Number(stamp.height) || 0) * 100;
  const blend = stamp.blend === "max" || stamp.blend === "replace" ? stamp.blend : "add";
  const edge = Math.max(0, Math.min(0.5, stamp.edge === undefined ? 0.15 : Number(stamp.edge) || 0));
  if (!Number.isFinite(foot.x) || !Number.isFinite(foot.z)) return changed;
  const cos = Math.cos(foot.rotation);
  const sin = Math.sin(foot.rotation);
  const halfX = (Math.abs(cos) * foot.width + Math.abs(sin) * foot.depth) / 2;
  const halfZ = (Math.abs(sin) * foot.width + Math.abs(cos) * foot.depth) / 2;
  let x0 = Math.ceil(foot.x - halfX);
  let x1 = Math.floor(foot.x + halfX);
  let z0 = Math.ceil(foot.z - halfZ);
  let z1 = Math.floor(foot.z + halfZ);
  const bounds = stamp.bounds || null;
  if (bounds) {
    x0 = Math.max(x0, Math.floor(bounds.minX));
    x1 = Math.min(x1, Math.ceil(bounds.maxX));
    z0 = Math.max(z0, Math.floor(bounds.minZ));
    z1 = Math.min(z1, Math.ceil(bounds.maxZ));
  }
  if (x1 < x0 || z1 < z0) return changed;
  const ctx = { touched: stamp.touched || null, beforeTouch: stamp.beforeTouch || null, changed };
  for (let iz = z0; iz <= z1; iz += 1) {
    for (let ix = x0; ix <= x1; ix += 1) {
      const dx = ix - foot.x;
      const dz = iz - foot.z;
      const s = (dx * cos + dz * sin) / foot.width + 0.5;
      const t = (-dx * sin + dz * cos) / foot.depth + 0.5;
      if (s < 0 || s > 1 || t < 0 || t > 1) continue;
      let fade = 1;
      if (edge > 0) {
        const e = Math.min(1, Math.min(s, 1 - s, t, 1 - t) / edge);
        fade = e * e * (3 - 2 * e);
      }
      if (fade <= 0) continue;
      const target = sampleStampImage(image, s, t) * heightCm;
      const current = terrainVertexCm(hf, ix, iz);
      const next = blend === "add" ? current + target * fade
        : blend === "max" ? current + (Math.max(current, target) - current) * fade
          : current + (target - current) * fade;
      writeVertexCm(hf, ix, iz, Math.floor(next + dither(ix, iz, hf.revision)), ctx);
    }
  }
  if (changed.size) hf.revision += 1;
  return changed;
}

// "Opslaan als stempel": de hoogtes (meter) in een rechthoek, 1 punt per meter.
export function sampleTerrainRegion(hf, ax, az, bx, bz) {
  const x0 = Math.ceil(Math.min(Number(ax), Number(bx)));
  const x1 = Math.floor(Math.max(Number(ax), Number(bx)));
  const z0 = Math.ceil(Math.min(Number(az), Number(bz)));
  const z1 = Math.floor(Math.max(Number(az), Number(bz)));
  if (!Number.isFinite(x0 + x1 + z0 + z1) || x1 - x0 < 2 || z1 - z0 < 2 || x1 - x0 > 2048 || z1 - z0 > 2048) return null;
  const width = x1 - x0 + 1;
  const depth = z1 - z0 + 1;
  const data = new Float32Array(width * depth);
  let min = Infinity;
  let max = -Infinity;
  for (let iz = z0; iz <= z1; iz += 1) {
    for (let ix = x0; ix <= x1; ix += 1) {
      const value = terrainVertexCm(hf, ix, iz) / 100;
      data[(iz - z0) * width + (ix - x0)] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  return { x0, z0, x1, z1, width, depth, data, min, max };
}

// ---------- verf (ronde 2) ----------
// Per vak een gewichtsplaatje van 129 x 129 punten (0,5 m), RGB = de 3 eigen texturen van dat vak.
// De grondtextuur (basis) is wat overblijft: 1 - (r + g + b). Dus maximaal 4 texturen per vak.
// Net als de hoogte is de rand dubbel met het buurvak (geen naad). Opslag: PNG (RGB, 8-bit).

export const TERRAIN_PAINT_CELLS = 128;
export const TERRAIN_PAINT_VERTS = TERRAIN_PAINT_CELLS + 1;
export const TERRAIN_PAINT_LAYERS = 3;
export const TERRAIN_PAINT_BYTES = TERRAIN_PAINT_VERTS * TERRAIN_PAINT_VERTS * 3;
export const TERRAIN_PAINT_SPEED = 3;
const PAINT_STEP = SIZE / TERRAIN_PAINT_CELLS;
const PAINT_VERTS = TERRAIN_PAINT_VERTS;

export function createPaintfield() {
  return { chunks: new Map(), revision: 0 };
}

export function createPaintChunk(layers = []) {
  return { layers: [0, 1, 2].map((slot) => String(layers[slot] || "")), data: new Uint8Array(TERRAIN_PAINT_BYTES) };
}

export function clonePaintChunk(chunk) {
  return chunk ? { layers: chunk.layers.slice(), data: chunk.data.slice() } : null;
}

export function terrainPaintIsEmpty(chunk) {
  if (!chunk) return true;
  for (let i = 0; i < chunk.data.length; i += 1) if (chunk.data[i] !== 0) return false;
  return true;
}

function paintSlotIsEmpty(chunk, slot) {
  for (let i = slot; i < chunk.data.length; i += 3) if (chunk.data[i] !== 0) return false;
  return true;
}

// Lege plekken (geen gewicht meer) vrijgeven, zodat het vak weer een andere textuur kan krijgen.
export function tidyPaintChunk(chunk) {
  if (!chunk) return chunk;
  for (let slot = 0; slot < TERRAIN_PAINT_LAYERS; slot += 1) if (chunk.layers[slot] && paintSlotIsEmpty(chunk, slot)) chunk.layers[slot] = "";
  return chunk;
}

// Welke plek (0 = basis, 1..3) een textuur in dit vak heeft. assign = een vrije plek geven. -1 = vak vol.
export function terrainPaintSlot(chunk, texture, assign = false) {
  const key = String(texture || "");
  if (!key) return 0;
  const index = chunk.layers.indexOf(key);
  if (index >= 0) return index + 1;
  if (!assign) return -1;
  for (let slot = 0; slot < TERRAIN_PAINT_LAYERS; slot += 1) {
    if (!chunk.layers[slot] || paintSlotIsEmpty(chunk, slot)) {
      for (let i = slot; i < chunk.data.length; i += 3) chunk.data[i] = 0;
      chunk.layers[slot] = key;
      return slot + 1;
    }
  }
  return -1;
}

// Gewicht per textuur op het dichtstbijzijnde verfpunt: { "": basis, docKey: gewicht }.
export function terrainPaintAt(pf, x, z) {
  const ix = Math.round(Number(x) / PAINT_STEP);
  const iz = Math.round(Number(z) / PAINT_STEP);
  const cx = Math.floor(ix / TERRAIN_PAINT_CELLS);
  const cz = Math.floor(iz / TERRAIN_PAINT_CELLS);
  const chunk = pf?.chunks?.get(cx + ":" + cz);
  if (!chunk) return { "": 1 };
  const index = ((iz - cz * TERRAIN_PAINT_CELLS) * PAINT_VERTS + (ix - cx * TERRAIN_PAINT_CELLS)) * 3;
  const out = {};
  let rest = 1;
  for (let slot = 0; slot < TERRAIN_PAINT_LAYERS; slot += 1) {
    const weight = chunk.data[index + slot] / 255;
    if (chunk.layers[slot] && weight > 0) out[chunk.layers[slot]] = (out[chunk.layers[slot]] || 0) + weight;
    rest -= weight;
  }
  out[""] = Math.max(0, rest);
  return out;
}

// Verf op de punten ix0..ix1 x iz0..iz1 (verfraster, 0,5 m). amountAt(ix, iz) = hoeveel (0..1) van de textuur erbij;
// erase = alle verf weg waar amountAt > 0. Gedeeld door het penseel en "pad in de verf".
function paintRaster(pf, { texture, erase, ix0, ix1, iz0, iz1, bounds, touched, beforeTouch }, amountAt) {
  const changed = new Set();
  const full = new Set();
  if (bounds) {
    ix0 = Math.max(ix0, Math.floor(bounds.minX / PAINT_STEP));
    ix1 = Math.min(ix1, Math.ceil(bounds.maxX / PAINT_STEP));
    iz0 = Math.max(iz0, Math.floor(bounds.minZ / PAINT_STEP));
    iz1 = Math.min(iz1, Math.ceil(bounds.maxZ / PAINT_STEP));
  }
  const slots = new Map();
  for (let iz = iz0; iz <= iz1; iz += 1) {
    for (let ix = ix0; ix <= ix1; ix += 1) {
      const amount = Math.min(1, amountAt(ix, iz));
      if (!(amount > 0)) continue;
      const noise = dither(ix, iz, pf.revision);
      const cx0 = Math.floor(ix / TERRAIN_PAINT_CELLS);
      const cz0 = Math.floor(iz / TERRAIN_PAINT_CELLS);
      const lx0 = ix - cx0 * TERRAIN_PAINT_CELLS;
      const lz0 = iz - cz0 * TERRAIN_PAINT_CELLS;
      for (let a = 0; a < (lx0 === 0 ? 2 : 1); a += 1) {
        const cx = a === 0 ? cx0 : cx0 - 1;
        const lx = a === 0 ? lx0 : TERRAIN_PAINT_CELLS;
        for (let b = 0; b < (lz0 === 0 ? 2 : 1); b += 1) {
          const cz = b === 0 ? cz0 : cz0 - 1;
          const lz = b === 0 ? lz0 : TERRAIN_PAINT_CELLS;
          const key = cx + ":" + cz;
          let chunk = pf.chunks.get(key) || null;
          if (!chunk && (erase || !texture)) continue;
          if (touched && !touched.has(key)) {
            touched.add(key);
            if (typeof beforeTouch === "function") beforeTouch(key, clonePaintChunk(chunk));
          }
          if (!chunk) {
            chunk = createPaintChunk();
            pf.chunks.set(key, chunk);
          }
          const index = (lz * PAINT_VERTS + lx) * 3;
          if (erase) {
            for (let s = 0; s < TERRAIN_PAINT_LAYERS; s += 1) {
              if (chunk.data[index + s] !== 0) {
                chunk.data[index + s] = 0;
                changed.add(key);
              }
            }
            continue;
          }
          let slot = slots.get(key);
          if (slot === undefined) {
            slot = terrainPaintSlot(chunk, texture, true);
            slots.set(key, slot);
          }
          if (slot < 0) {
            full.add(key);
            continue;
          }
          for (let s = 0; s < TERRAIN_PAINT_LAYERS; s += 1) {
            const value = chunk.data[index + s] / 255;
            const next = s === slot - 1 ? value + (1 - value) * amount : value * (1 - amount);
            const out = Math.max(0, Math.min(255, Math.floor(next * 255 + noise)));
            if (out !== chunk.data[index + s]) {
              chunk.data[index + s] = out;
              changed.add(key);
            }
          }
        }
      }
    }
  }
  if (changed.size) pf.revision += 1;
  return { changed, full };
}

// Verfpenseel: texture = doc-sleutel van een terreintextuur ("" = de grond zelf, gum). Zelfde radius, sterkte
// en zachte rand als het hoogtepenseel. Geeft { changed, full } terug: full = vakken die al 4 texturen hebben.
export function applyTerrainPaint(pf, brush = {}) {
  const texture = String(brush.texture || "");
  const x = Number(brush.x);
  const z = Number(brush.z);
  const radius = Math.max(0.5, Math.min(128, Number(brush.radius) || 8));
  const strength = Math.max(0, Math.min(1, Number(brush.strength)));
  const softness = Math.max(0, Math.min(1, Number(brush.softness)));
  const dt = Math.max(0, Math.min(0.25, Number(brush.dt) || 0));
  // erase: echte gum, alle verf binnen de cirkel is in één keer weg (zachte rand en kracht tellen niet).
  const erase = brush.erase === true;
  if (!pf || !Number.isFinite(x) || !Number.isFinite(z) || (!erase && (strength <= 0 || dt <= 0))) return { changed: new Set(), full: new Set() };
  const rate = TERRAIN_PAINT_SPEED * strength * dt;
  return paintRaster(pf, {
    texture, erase, bounds: brush.bounds || null, touched: brush.touched || null, beforeTouch: brush.beforeTouch,
    ix0: Math.ceil((x - radius) / PAINT_STEP), ix1: Math.floor((x + radius) / PAINT_STEP),
    iz0: Math.ceil((z - radius) / PAINT_STEP), iz1: Math.floor((z + radius) / PAINT_STEP)
  }, function (ix, iz) {
    const distance = Math.hypot(ix * PAINT_STEP - x, iz * PAINT_STEP - z);
    if (erase) return distance <= radius ? 1 : 0;
    return terrainBrushWeight(distance, radius, softness) * rate;
  });
}

function distanceToPolyline(px, pz, points) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    const ax = points[i].x;
    const az = points[i].z;
    const dx = points[i + 1].x - ax;
    const dz = points[i + 1].z - az;
    const length = dx * dx + dz * dz;
    const t = length > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / length)) : 0;
    best = Math.min(best, Math.hypot(px - (ax + dx * t), pz - (az + dz * t)));
  }
  return best;
}

// Ronde 3: een pad (lijn van punten in meters, al glad gemaakt) in één keer in de verf. width = breedte in meters,
// fade = zachte rand in meters aan elke kant. Zelfde { changed, full } als het penseel.
export function applyTerrainPaintPath(pf, path = {}) {
  const texture = String(path.texture || "");
  const points = (Array.isArray(path.points) ? path.points : [])
    .map((point) => ({ x: Number(point?.x), z: Number(point?.z) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z));
  const half = Math.max(0.25, Math.min(64, (Number(path.width) || 3) / 2));
  const fade = Math.max(0, Math.min(half, Number(path.fade) || 0));
  if (!pf || !texture || points.length < 2) return { changed: new Set(), full: new Set() };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  return paintRaster(pf, {
    texture, erase: false, bounds: path.bounds || null, touched: path.touched || null, beforeTouch: path.beforeTouch,
    ix0: Math.floor((minX - half) / PAINT_STEP), ix1: Math.ceil((maxX + half) / PAINT_STEP),
    iz0: Math.floor((minZ - half) / PAINT_STEP), iz1: Math.ceil((maxZ + half) / PAINT_STEP)
  }, function (ix, iz) {
    const distance = distanceToPolyline(ix * PAINT_STEP, iz * PAINT_STEP, points);
    if (distance > half) return 0;
    if (fade <= 0 || distance <= half - fade) return 1;
    return (half - distance) / fade;
  });
}

// ---------- Ronde 3: water (los, plat vlak) en helling ----------
// Een watervlak: midden x/z, breedte (x) en diepte (z) in meters, draaiing in graden (zelfde draairichting als de
// loopvlakken in de movement-kernel), height = hoogte van het wateroppervlak boven de basisgrond.
// behavior: "block" = Niet in (diep water houdt je tegen), "wade" = Doorheen (je loopt over de bodem),
// "ice" = IJs (je loopt bovenop).
export const WATER_BEHAVIORS = Object.freeze(["block", "wade", "ice"]);
// Bij "Niet in" houdt het water je tegen zodra een stuk van de speler dieper dan dit in het water komt
// (vrijwel bij de waterlijn; een klein beetje speling zodat golfjes op de rand je niet stilzetten).
export const WATER_BLOCK_DEPTH = 0.02;

export function normalizeTerrainWater(entry) {
  if (!entry || typeof entry !== "object") return null;
  const x = Number(entry.x);
  const z = Number(entry.z);
  const width = Number(entry.width);
  const depth = Number(entry.depth);
  if (![x, z, width, depth].every(Number.isFinite) || width <= 0 || depth <= 0) return null;
  const behavior = WATER_BEHAVIORS.includes(entry.behavior) ? entry.behavior : "block";
  return {
    id: String(entry.id || entry.waterId || ""), x, z, width, depth,
    rotation: Number(entry.rotation) || 0, height: Number(entry.height) || 0, behavior,
    color: typeof entry.color === "string" && /^#[0-9a-fA-F]{6}$/.test(entry.color) ? entry.color : "#2f6f9f",
    opacity: Math.max(0.1, Math.min(1, Number.isFinite(Number(entry.opacity)) ? Number(entry.opacity) : 0.7)),
    waves: entry.waves !== false
  };
}

// Ligt x, z in het watervlak? (rechthoek met draaiing, zelfde rekensom als pointInRotatedRectangle)
export function waterContains(water, x, z, inflate = 0) {
  if (!water) return false;
  const angle = -(Number(water.rotation) || 0) * Math.PI / 180;
  const dx = x - water.x;
  const dz = z - water.z;
  const localX = dx * Math.cos(angle) - dz * Math.sin(angle);
  const localZ = dx * Math.sin(angle) + dz * Math.cos(angle);
  return Math.abs(localX) <= water.width / 2 + inflate && Math.abs(localZ) <= water.depth / 2 + inflate;
}

// De vier hoeken (meters), voor tekenen en slepen in de editor.
export function waterCorners(water) {
  const angle = (Number(water?.rotation) || 0) * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
    const lx = (u * water.width) / 2;
    const lz = (v * water.depth) / 2;
    return { x: water.x + lx * cos - lz * sin, z: water.z + lx * sin + lz * cos };
  });
}

// Het hoogste watervlak op x, z (of null).
export function terrainWaterAt(waters, x, z) {
  let best = null;
  for (const water of Array.isArray(waters) ? waters : []) {
    if (water && waterContains(water, x, z) && (!best || water.height > best.height)) best = water;
  }
  return best;
}

// Ligt dit punt onder water? (terreinhoogte onder het wateroppervlak)
export function terrainUnderWater(hf, waters, x, z, margin = 0) {
  const water = terrainWaterAt(waters, x, z);
  return Boolean(water && terrainHeightAt(hf, x, z) < water.height - margin);
}

// Helling in graden op x, z (verschil over 1 m in beide richtingen).
export function terrainSlopeDegAt(hf, x, z) {
  const dx = (terrainHeightAt(hf, x + 1, z) - terrainHeightAt(hf, x - 1, z)) / 2;
  const dz = (terrainHeightAt(hf, x, z + 1) - terrainHeightAt(hf, x, z - 1)) / 2;
  return Math.atan(Math.hypot(dx, dz)) * 180 / Math.PI;
}

// Een gelezen PNG (zie png.js) als verf van één vak: RGB, 129 x 129, 8-bit. null = past niet.
export function terrainPaintFromPng(png) {
  if (!png || png.width !== PAINT_VERTS || png.height !== PAINT_VERTS || png.bitDepth !== 8 || png.channels < 3) return null;
  if (png.channels === 3) return png.data;
  const out = new Uint8Array(TERRAIN_PAINT_BYTES);
  for (let i = 0; i < PAINT_VERTS * PAINT_VERTS; i += 1) {
    out[i * 3] = png.data[i * png.channels];
    out[i * 3 + 1] = png.data[i * png.channels + 1];
    out[i * 3 + 2] = png.data[i * png.channels + 2];
  }
  return out;
}

// ---------- slimme mesh (RTIN): veel driehoeken waar het hobbelig is, weinig waar het vlak is ----------
// Rechthoekige driehoeken die steeds in tweeën gaan; per punt de grootste fout als je het weglaat.
// Een vak van 65 x 65 punten heeft 2 x 64 x 64 kleinste driehoeken.

const TILE = SIZE;
const TRIANGLE_COUNT = TILE * TILE * 2 - 2;
const PARENT_COUNT = TRIANGLE_COUNT - TILE * TILE;
let triangleCoords = null;

function rtinCoords() {
  if (triangleCoords) return triangleCoords;
  triangleCoords = new Uint16Array(TRIANGLE_COUNT * 4);
  for (let i = 0; i < TRIANGLE_COUNT; i += 1) {
    let id = i + 2;
    let ax = 0; let ay = 0; let bx = 0; let by = 0; let cx = 0; let cy = 0;
    if (id & 1) { bx = TILE; by = TILE; cx = TILE; }
    else { ax = TILE; ay = TILE; cy = TILE; }
    while ((id >>= 1) > 1) {
      const mx = (ax + bx) >> 1;
      const my = (ay + by) >> 1;
      if (id & 1) { bx = ax; by = ay; ax = cx; ay = cy; }
      else { ax = bx; ay = by; bx = cx; by = cy; }
      cx = mx; cy = my;
    }
    triangleCoords[i * 4] = ax;
    triangleCoords[i * 4 + 1] = ay;
    triangleCoords[i * 4 + 2] = bx;
    triangleCoords[i * 4 + 3] = by;
  }
  return triangleCoords;
}

// Fout per punt (cm) voor één vak; één keer per wijziging van het vak.
export function terrainChunkErrors(chunk) {
  const errors = new Float32Array(VERTS * VERTS);
  if (!chunk) return errors;
  const coords = rtinCoords();
  for (let i = TRIANGLE_COUNT - 1; i >= 0; i -= 1) {
    const k = i * 4;
    const ax = coords[k]; const ay = coords[k + 1]; const bx = coords[k + 2]; const by = coords[k + 3];
    const mx = (ax + bx) >> 1;
    const my = (ay + by) >> 1;
    const cx = mx + my - ay;
    const cy = my + ax - mx;
    const middle = my * VERTS + mx;
    const guess = (chunk[ay * VERTS + ax] + chunk[by * VERTS + bx]) / 2;
    let error = Math.abs(guess - chunk[middle]);
    if (error > errors[middle]) errors[middle] = error;
    if (i < PARENT_COUNT) {
      const left = ((ay + cy) >> 1) * VERTS + ((ax + cx) >> 1);
      const right = ((by + cy) >> 1) * VERTS + ((bx + cx) >> 1);
      error = Math.max(errors[middle], errors[left], errors[right]);
      errors[middle] = error;
    }
  }
  return errors;
}

// Mesh van één vak bij een toegestane fout (meter). Posities zijn lokaal (0..64) met de hoogte in meter;
// rok (skirt) = een randje naar beneden langs de buitenkant, zodat er geen kiertjes zijn tussen vakken met
// een ander detailniveau. Normalen komen uit de hoogtekaart (ook over de rand heen, dus naadloos licht).
export function buildTerrainChunkMesh(hf, cx, cz, options = {}) {
  const key = cx + ":" + cz;
  const chunk = hf?.chunks?.get(key) || null;
  const maxErrorCm = Math.max(0, Number(options.maxError) || 0) * 100;
  const errors = chunk ? (options.errors || terrainChunkErrors(chunk)) : null;
  const slot = new Int32Array(VERTS * VERTS);
  const order = [];
  const tris = [];
  const split = function (ax, ay, bx, by, cxp, cyp) {
    const mx = (ax + bx) >> 1;
    const my = (ay + by) >> 1;
    return Math.abs(ax - cxp) + Math.abs(ay - cyp) > 1 && errors && errors[my * VERTS + mx] > maxErrorCm;
  };
  const vertex = function (x, y) {
    const index = y * VERTS + x;
    if (!slot[index]) { order.push(index); slot[index] = order.length; }
    return slot[index] - 1;
  };
  const walk = function (ax, ay, bx, by, cxp, cyp) {
    if (split(ax, ay, bx, by, cxp, cyp)) {
      const mx = (ax + bx) >> 1;
      const my = (ay + by) >> 1;
      walk(cxp, cyp, ax, ay, mx, my);
      walk(bx, by, cxp, cyp, mx, my);
    } else {
      tris.push(vertex(ax, ay), vertex(bx, by), vertex(cxp, cyp));
    }
  };
  walk(0, 0, TILE, TILE, TILE, 0);
  walk(TILE, TILE, 0, 0, 0, TILE);
  const topCount = order.length;
  const topTris = tris.length / 3;
  // Rok: elke driehoekzijde die op de buitenrand ligt, krijgt een strookje naar beneden.
  const skirtDepth = Math.max(1, (Number(options.maxError) || 0) * 4);
  const skirt = [];
  const onEdge = function (a, b) {
    const ax = order[a] % VERTS; const ay = (order[a] / VERTS) | 0;
    const bx = order[b] % VERTS; const by = (order[b] / VERTS) | 0;
    return (ax === bx && (ax === 0 || ax === TILE)) || (ay === by && (ay === 0 || ay === TILE));
  };
  for (let t = 0; t < topTris; t += 1) {
    const a = tris[t * 3]; const b = tris[t * 3 + 1]; const c = tris[t * 3 + 2];
    if (onEdge(a, b)) skirt.push(a, b);
    if (onEdge(b, c)) skirt.push(b, c);
    if (onEdge(c, a)) skirt.push(c, a);
  }
  const vertexCount = topCount + skirt.length;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const baseX = cx * SIZE;
  const baseZ = cz * SIZE;
  for (let v = 0; v < topCount; v += 1) {
    const index = order[v];
    const lx = index % VERTS;
    const lz = (index / VERTS) | 0;
    const h = chunk ? chunk[index] / 100 : 0;
    positions[v * 3] = lx;
    positions[v * 3 + 1] = h;
    positions[v * 3 + 2] = lz;
    const ix = baseX + lx;
    const iz = baseZ + lz;
    const dx = (terrainVertexCm(hf, ix + 1, iz) - terrainVertexCm(hf, ix - 1, iz)) / 200;
    const dz = (terrainVertexCm(hf, ix, iz + 1) - terrainVertexCm(hf, ix, iz - 1)) / 200;
    const length = Math.hypot(dx, 1, dz);
    normals[v * 3] = -dx / length;
    normals[v * 3 + 1] = 1 / length;
    normals[v * 3 + 2] = -dz / length;
  }
  const indexCount = tris.length + (skirt.length / 2) * 6;
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  indices.set(tris, 0);
  let cursor = tris.length;
  for (let s = 0; s < skirt.length; s += 2) {
    const a = skirt[s];
    const b = skirt[s + 1];
    const a2 = topCount + s;
    const b2 = topCount + s + 1;
    for (const [from, to] of [[a, a2], [b, b2]]) {
      positions[to * 3] = positions[from * 3];
      positions[to * 3 + 1] = positions[from * 3 + 1] - skirtDepth;
      positions[to * 3 + 2] = positions[from * 3 + 2];
      normals[to * 3] = normals[from * 3];
      normals[to * 3 + 1] = normals[from * 3 + 1];
      normals[to * 3 + 2] = normals[from * 3 + 2];
    }
    indices[cursor++] = a; indices[cursor++] = a2; indices[cursor++] = b;
    indices[cursor++] = b; indices[cursor++] = a2; indices[cursor++] = b2;
  }
  return { positions, normals, indices, triangles: indexCount / 3, topTriangles: topTris };
}

// Telt alleen de driehoeken (zonder rok) bij een toegestane fout; voor de teller "per vak".
export function countTerrainChunkTriangles(errors, maxError) {
  if (!errors) return 2;
  const maxErrorCm = Math.max(0, Number(maxError) || 0) * 100;
  let count = 0;
  const walk = function (ax, ay, bx, by, cx, cy) {
    const mx = (ax + bx) >> 1;
    const my = (ay + by) >> 1;
    if (Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && errors[my * VERTS + mx] > maxErrorCm) {
      walk(cx, cy, ax, ay, mx, my);
      walk(bx, by, cx, cy, mx, my);
    } else {
      count += 1;
    }
  };
  walk(0, 0, TILE, TILE, TILE, 0);
  walk(TILE, TILE, 0, 0, 0, TILE);
  return count;
}

// Raakt een straal (oorsprong + richting) de grond? Stapt langs de straal en verfijnt het raakpunt.
// groundY = de basishoogte van de grond (world.ground.y). Geeft { x, y, z } (y = echte hoogte) of null.
export function raycastTerrain(hf, origin, direction, options = {}) {
  const groundY = Number(options.groundY) || 0;
  const maxDistance = Math.max(1, Number(options.maxDistance) || 4000);
  const step = Math.max(0.1, Number(options.step) || 0.5);
  const above = (t) => origin.y + direction.y * t - (groundY + terrainHeightAt(hf, origin.x + direction.x * t, origin.z + direction.z * t));
  let previous = 0;
  if (above(0) < 0) return null;
  for (let t = step; t <= maxDistance; t += step) {
    const gap = above(t);
    if (gap <= 0) {
      let low = previous;
      let high = t;
      for (let i = 0; i < 12; i += 1) {
        const mid = (low + high) / 2;
        if (above(mid) > 0) low = mid; else high = mid;
      }
      const hit = (low + high) / 2;
      const x = origin.x + direction.x * hit;
      const z = origin.z + direction.z * hit;
      return { x, y: groundY + terrainHeightAt(hf, x, z), z, distance: hit };
    }
    previous = t;
  }
  return null;
}
