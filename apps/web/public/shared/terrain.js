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

// Penseel: mode "raise" | "lower" | "smooth". strength 0..1, softness 0..1 (zachte rand), dt in seconden.
// Verhogen/verlagen: maximaal 6 m per seconde in het midden. Gladstrijken: trekt naar het gemiddelde van de buren.
// Geeft de Set van vakken terug die echt veranderd zijn (om opnieuw te tekenen).
export const TERRAIN_BRUSH_SPEED = 6;
export function applyTerrainBrush(hf, brush = {}) {
  const changed = new Set();
  const mode = brush.mode === "lower" || brush.mode === "smooth" ? brush.mode : "raise";
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
      const weight = terrainBrushWeight(Math.hypot(ix - x, iz - z), radius, softness);
      if (weight <= 0) continue;
      const current = terrainVertexCm(hf, ix, iz);
      let next = current;
      if (mode === "raise") next = current + step * weight;
      else if (mode === "lower") next = current - step * weight;
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
