// Pure movementkernel: walkability, botsing en resolveMovement zonder DOM of Three.js.
// Gedeeld door de server (src/server/mmo-service.js) en de browser (via world-runtime.js).
// Fase 02 (F2-E1-T01): uit world-runtime.js gehaald; gedrag is ongewijzigd (zie tests/movement-parity.test.js).
import earcut from "./earcut.js";
import { createHeightfield, decodeTerrainChunk, normalizeTerrainWater, terrainHeightAt, terrainWaterAt, TERRAIN_MAX_SLOPE_DEG, WATER_BLOCK_DEPTH } from "./terrain.js";

// Zelfde stappen als THREE.ShapeUtils.triangulateShape(contour, []): dubbel eindpunt weg, dan earcut.
function triangulateContourXZ(points) {
  const contour = points.slice();
  const last = contour[contour.length - 1];
  if (contour.length > 2 && last.x === contour[0].x && last.z === contour[0].z) contour.pop();
  const vertices = [];
  for (const point of contour) vertices.push(point.x, point.z);
  const flat = earcut(vertices, []);
  const faces = [];
  for (let i = 0; i < flat.length; i += 3) faces.push(flat.slice(i, i + 3));
  return faces;
}

const DEG_TO_RAD = Math.PI / 180;

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}


function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}


export function effectiveGroundBounds(ground) {
  if (!ground) return null;
  const boundsMode = String(ground?.boundsMode || "centerSize").trim() === "explicitBounds" ? "explicitBounds" : "centerSize";
  if (boundsMode === "explicitBounds") {
    const rawMinX = Number(ground?.minX);
    const rawMaxX = Number(ground?.maxX);
    const rawMinZ = Number(ground?.minZ);
    const rawMaxZ = Number(ground?.maxZ);
    if (Number.isFinite(rawMinX) && Number.isFinite(rawMaxX) && Number.isFinite(rawMinZ) && Number.isFinite(rawMaxZ)) {
      const minX = Math.min(rawMinX, rawMaxX);
      const maxX = Math.max(rawMinX, rawMaxX);
      const minZ = Math.min(rawMinZ, rawMaxZ);
      const maxZ = Math.max(rawMinZ, rawMaxZ);
      if (maxX > minX && maxZ > minZ) {
        return {
          boundsMode: "explicitBounds",
          minX: minX,
          maxX: maxX,
          minZ: minZ,
          maxZ: maxZ,
          width: maxX - minX,
          depth: maxZ - minZ
        };
      }
    }
  }
  const width = Math.max(0, num(ground?.width, 0));
  const depth = Math.max(0, num(ground?.depth, 0));
  if (width <= 0 || depth <= 0) return null;
  return {
    boundsMode: "centerSize",
    minX: -width / 2,
    maxX: width / 2,
    minZ: -depth / 2,
    maxZ: depth / 2,
    width: width,
    depth: depth
  };
}


export function effectiveWorldGroundBounds(worldData) {
  const boundsList = [];
  const mainBounds = effectiveGroundBounds(worldData?.ground || null);
  if (mainBounds) boundsList.push(mainBounds);
  const zoneGrounds = Array.isArray(worldData?.zoneGrounds) ? worldData.zoneGrounds : [];
  for (const ground of zoneGrounds) {
    const bounds = effectiveGroundBounds(ground);
    if (bounds) boundsList.push(bounds);
  }
  if (!boundsList.length) return null;
  let minX = boundsList[0].minX;
  let maxX = boundsList[0].maxX;
  let minZ = boundsList[0].minZ;
  let maxZ = boundsList[0].maxZ;
  for (const bounds of boundsList.slice(1)) {
    minX = Math.min(minX, bounds.minX);
    maxX = Math.max(maxX, bounds.maxX);
    minZ = Math.min(minZ, bounds.minZ);
    maxZ = Math.max(maxZ, bounds.maxZ);
  }
  return {
    boundsMode: "explicitBounds",
    minX: minX,
    maxX: maxX,
    minZ: minZ,
    maxZ: maxZ,
    width: maxX - minX,
    depth: maxZ - minZ
  };
}


export function worldGroundForCollision(worldData) {
  const bounds = effectiveWorldGroundBounds(worldData);
  if (!bounds) return null;
  return Object.assign({}, bounds, {
    boundsMode: "explicitBounds",
    y: num(worldData?.ground?.y, 0)
  });
}


export const COLLISION_EPSILON = 0.000001;


export function normalizeWorldPointList(points) {
  const normalized = [];
  for (const point of Array.isArray(points) ? points : []) {
    const x = Number(point?.x);
    const z = Number(point?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    if (normalized.length) {
      const previous = normalized[normalized.length - 1];
      if (Math.abs(previous.x - x) < 0.000001 && Math.abs(previous.z - z) < 0.000001) continue;
    }
    normalized.push({ x: x, z: z });
  }
  return normalized;
}


export function catmullRomKnotDelta(a, b) {
  // Centripetal parameterization (sqrt of chord length). Unlike uniform Catmull-Rom,
  // this provably never loops/self-intersects between control points, even when a
  // dragged point creates unevenly spaced or sharply folded segments.
  return Math.max(0.0001, Math.sqrt(Math.hypot(b.x - a.x, b.z - a.z)));
}


export function catmullRomBlend(pa, pb, ta, tb, t) {
  const denom = tb - ta;
  if (Math.abs(denom) < 0.0001) return { x: pa.x, z: pa.z };
  const wa = (tb - t) / denom;
  const wb = (t - ta) / denom;
  return { x: (pa.x * wa) + (pb.x * wb), z: (pa.z * wa) + (pb.z * wb) };
}


export function smoothPolyline(points, samplesPerSegment) {
  if (!Array.isArray(points) || points.length < 3) return points;
  const samples = Math.max(2, Math.min(12, num(samplesPerSegment, 8)));
  const result = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const t0 = 0;
    const t1 = t0 + catmullRomKnotDelta(p0, p1);
    const t2 = t1 + catmullRomKnotDelta(p1, p2);
    const t3 = t2 + catmullRomKnotDelta(p2, p3);

    for (let s = 0; s < samples; s += 1) {
      const t = t1 + ((t2 - t1) * (s / samples));
      const a1 = catmullRomBlend(p0, p1, t0, t1, t);
      const a2 = catmullRomBlend(p1, p2, t1, t2, t);
      const a3 = catmullRomBlend(p2, p3, t2, t3, t);
      const b1 = catmullRomBlend(a1, a2, t0, t2, t);
      const b2 = catmullRomBlend(a2, a3, t1, t3, t);
      const c = catmullRomBlend(b1, b2, t1, t2, t);
      result.push({ x: c.x, z: c.z });
    }
  }
  result.push(points[points.length - 1]);
  return result;
}


export function createEmptyWalkabilityIndex() {
  return {
    ground: null,
    surfaceBlockers: [],
    blockers: [],
    walkables: [],
    // Wereld tekenen (ronde 1): hoogte van de grond (terrain.js) en hoe steil je nog omhoog mag lopen.
    heightfield: null,
    maxSlopeTan: Math.tan(TERRAIN_MAX_SLOPE_DEG * DEG_TO_RAD),
    // Ronde 3: watervlakken (Niet in / Doorheen / IJs), zie terrain.js.
    waters: [],
    // Dichte randen van loopvlakken (onzichtbare muren), zie walkableWallBlocks.
    walls: []
  };
}

// Een dichte rand werkt alleen voor wie ongeveer op die hoogte loopt (niet voor wie ver onder de brug loopt).
const WALL_HEIGHT_REACH = 2;

function closestOnWall(wall, x, z) {
  const dx = wall.bx - wall.ax;
  const dz = wall.bz - wall.az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0 ? clamp(((x - wall.ax) * dx + (z - wall.az) * dz) / lengthSq, 0, 1) : 0;
  const ox = x - (wall.ax + dx * t);
  const oz = z - (wall.az + dz * t);
  return { distSq: ox * ox + oz * oz, t };
}

function segmentsCross(ax, az, bx, bz, cx, cz, dx, dz) {
  const d1 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx);
  const d2 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  const d3 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  const d4 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// Loopvlak met dichte randen: je kunt er niet overheen en komt er niet dichter dan je straal bij.
// Weglopen of erlangs glijden mag altijd (zo raak je nooit vast).
export function walkableWallBlocks(index, startX, startY, startZ, x, z, radius) {
  const walls = index?.walls;
  if (!walls || !walls.length) return false;
  const r = Math.max(0.05, num(radius, 0));
  const minX = Math.min(startX, x) - r;
  const maxX = Math.max(startX, x) + r;
  const minZ = Math.min(startZ, z) - r;
  const maxZ = Math.max(startZ, z) + r;
  for (const wall of walls) {
    if (maxX < wall.minX || minX > wall.maxX || maxZ < wall.minZ || minZ > wall.maxZ) continue;
    const to = closestOnWall(wall, x, z);
    if (Math.abs(num(startY, 0) - (wall.ay + (wall.by - wall.ay) * to.t)) > WALL_HEIGHT_REACH) continue;
    if (segmentsCross(startX, startZ, x, z, wall.ax, wall.az, wall.bx, wall.bz)) return true;
    if (to.distSq < r * r && to.distSq < closestOnWall(wall, startX, startZ).distSq - 1e-9) return true;
  }
  return false;
}

// Ronde 3: water op x, z. Geeft { water, bottom } of null; bottom = terreinhoogte (zonder ground.y).
function waterUnder(index, x, z) {
  if (!index?.waters?.length) return null;
  const water = terrainWaterAt(index.waters, x, z);
  if (!water) return null;
  return { water, bottom: index.heightfield ? terrainHeightAt(index.heightfield, x, z) : 0 };
}

// Water "Niet in": hoe diep sta je erin? Kijkt naar het midden en 8 punten op een cirkel om de speler (radius),
// zodat je al bij de waterlijn wordt tegengehouden en soepel langs een ronde oever glijdt. 0 = droog,
// anders { center } = diepte onder het midden van de speler.
const WATER_RING = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)]);
function blockWaterDepth(index, x, z, radius) {
  if (!index?.waters?.length) return 0;
  let deepest = 0;
  let deepestWater = null;
  const r = Math.max(0, num(radius, 0));
  for (let i = -1; i < WATER_RING.length; i += 1) {
    const px = i < 0 ? x : x + WATER_RING[i][0] * r;
    const pz = i < 0 ? z : z + WATER_RING[i][1] * r;
    const wet = waterUnder(index, px, pz);
    if (!wet || wet.water.behavior !== "block") continue;
    const depth = wet.water.height - wet.bottom;
    if (depth > deepest) { deepest = depth; deepestWater = wet.water; }
  }
  if (deepest <= WATER_BLOCK_DEPTH) return 0;
  // Wat telt bij eruit lopen: hoe diep het midden van de speler staat (kan negatief zijn: midden al droog).
  const bottom = index.heightfield ? terrainHeightAt(index.heightfield, x, z) : 0;
  return { center: deepestWater.height - bottom };
}

export function terrainSlopeTan(degrees) {
  const value = Number(degrees);
  const safe = Number.isFinite(value) ? clamp(value, 1, 89) : TERRAIN_MAX_SLOPE_DEG;
  return Math.tan(safe * DEG_TO_RAD);
}

// De hoogtekaart voor een wereld. options.heightfield = een kant-en-klare (browser); anders leest
// options.readTerrainChunk(sha1) de vakken (server, uit de assets). Zonder vakken: null (plat).
export function heightfieldForWorld(worldData, options = {}) {
  if (options.heightfield) return options.heightfield;
  const config = worldData?.terrain?.heightfield || null;
  const refs = config?.chunks && typeof config.chunks === "object" ? config.chunks : null;
  if (!refs || typeof options.readTerrainChunk !== "function") return null;
  const chunks = new Map();
  for (const [key, sha1] of Object.entries(refs)) {
    const data = options.readTerrainChunk(sha1);
    const chunk = data instanceof Int16Array ? data : decodeTerrainChunk(data);
    if (chunk) chunks.set(key, chunk);
  }
  return chunks.size ? createHeightfield(chunks) : null;
}

// Hoogte van de grond op x, z: basis (ground.y) + terrein. Loopvlakken (bruggen) gaan voor.
export function groundHeightAt(source, x, z, fallbackY = 0, inflate = 0) {
  const index = resolveWalkabilitySource(source);
  const base = num(index?.ground?.y, fallbackY);
  const walkableY = walkableSurfaceHeightAt(index, x, z, base, inflate);
  if (walkableY !== null) return walkableY;
  const ground = base + (index?.heightfield ? terrainHeightAt(index.heightfield, x, z) : 0);
  const wet = waterUnder(index, x, z);
  if (wet && wet.water.behavior === "ice") return Math.max(ground, base + wet.water.height);
  return ground;
}


export function normalizeCollisionPointList(points) {
  const normalized = normalizeWorldPointList(points);
  if (normalized.length >= 2) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if (Math.abs(first.x - last.x) < COLLISION_EPSILON && Math.abs(first.z - last.z) < COLLISION_EPSILON) {
      normalized.pop();
    }
  }
  return normalized;
}


export function normalizeWalkableCollisionPointList(points, fallbackY = 0) {
  const normalized = [];
  const defaultY = num(fallbackY, 0);
  for (const point of Array.isArray(points) ? points : []) {
    const x = Number(point?.x);
    const z = Number(point?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const y = Number.isFinite(Number(point?.y)) ? Number(point.y) : defaultY;
    if (normalized.length) {
      const previous = normalized[normalized.length - 1];
      if (Math.abs(previous.x - x) < COLLISION_EPSILON && Math.abs(previous.z - z) < COLLISION_EPSILON) continue;
    }
    normalized.push({ x: x, y: y, z: z });
  }
  if (normalized.length >= 2) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if (Math.abs(first.x - last.x) < COLLISION_EPSILON && Math.abs(first.z - last.z) < COLLISION_EPSILON) {
      normalized.pop();
    }
  }
  return normalized;
}


export function makeCollisionTriangle(a, b, c) {
  if (!a || !b || !c) return null;
  return {
    a: a,
    b: b,
    c: c,
    minX: Math.min(a.x, b.x, c.x),
    maxX: Math.max(a.x, b.x, c.x),
    minZ: Math.min(a.z, b.z, c.z),
    maxZ: Math.max(a.z, b.z, c.z)
  };
}

// Walkable surfaces are authored by walking down one edge and back along the other
// (extrude-point-by-point, closed loop) - so for an even point count, point i on one
// rail always pairs with point (n-1-i) on the return rail at the same "rung" across the
// surface. Triangulating rung-to-rung (like a quad strip) matches that authored shape.
// Generic boundary ear-clipping (triangulateShape) instead picks diagonals purely from
// the flattened outline with no notion of "which points belong to the same rung", so it
// can connect a low point on one rail to a high point on a distant rung - producing
// triangles that don't correspond to any real part of the ramp/bridge and interpolate a
// bogus up-down-up-down height profile along an otherwise smooth, single-arc surface.

// Walkable surfaces are authored by walking down one edge and back along the other
// (extrude-point-by-point, closed loop) - so for an even point count, point i on one
// rail always pairs with point (n-1-i) on the return rail at the same "rung" across the
// surface. Triangulating rung-to-rung (like a quad strip) matches that authored shape.
// Generic boundary ear-clipping (triangulateShape) instead picks diagonals purely from
// the flattened outline with no notion of "which points belong to the same rung", so it
// can connect a low point on one rail to a high point on a distant rung - producing
// triangles that don't correspond to any real part of the ramp/bridge and interpolate a
// bogus up-down-up-down height profile along an otherwise smooth, single-arc surface.
export function triangulateWalkableSurfaceLadder(points) {
  const n = points.length;
  if (n < 4 || n % 2 !== 0) return null;
  const half = n / 2;
  const triangles = [];
  for (let i = 0; i < half - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const c = points[n - 2 - i];
    const d = points[n - 1 - i];
    const t1 = makeCollisionTriangle(a, b, c);
    const t2 = makeCollisionTriangle(a, c, d);
    if (!t1 || !t2) return null;
    triangles.push(t1, t2);
  }
  return triangles;
}


export function triangulateWalkableSurfaceEarClip(points) {
  let rawTriangles = [];
  try {
    rawTriangles = triangulateContourXZ(points);
  } catch {
    rawTriangles = [];
  }
  if (!rawTriangles.length && points.length === 3) rawTriangles = [[0, 1, 2]];
  const triangles = [];
  for (const triangle of rawTriangles) {
    if (!Array.isArray(triangle) || triangle.length < 3) continue;
    const ai = Number(triangle[0]);
    const bi = Number(triangle[1]);
    const ci = Number(triangle[2]);
    if (!Number.isInteger(ai) || !Number.isInteger(bi) || !Number.isInteger(ci)) continue;
    const t = makeCollisionTriangle(points[ai], points[bi], points[ci]);
    if (t) triangles.push(t);
  }
  return triangles;
}


export function triangulateWalkableSurface(points) {
  if (!Array.isArray(points) || points.length < 3) return [];
  const ladder = triangulateWalkableSurfaceLadder(points);
  if (ladder) return ladder;
  return triangulateWalkableSurfaceEarClip(points);
}


export function barycentricHeightAtXZ(px, pz, triangle) {
  if (!triangle?.a || !triangle?.b || !triangle?.c) return null;
  const { a, b, c } = triangle;
  const denominator = ((b.z - c.z) * (a.x - c.x)) + ((c.x - b.x) * (a.z - c.z));
  if (Math.abs(denominator) <= COLLISION_EPSILON) return null;
  const wa = (((b.z - c.z) * (px - c.x)) + ((c.x - b.x) * (pz - c.z))) / denominator;
  const wb = (((c.z - a.z) * (px - c.x)) + ((a.x - c.x) * (pz - c.z))) / denominator;
  const wc = 1 - wa - wb;
  if (wa < -COLLISION_EPSILON || wb < -COLLISION_EPSILON || wc < -COLLISION_EPSILON) return null;
  return (a.y * wa) + (b.y * wb) + (c.y * wc);
}

// Membership must match walkableSurfaceHeightSample's triangle loop exactly, so a point
// with real triangulated geometry under it is never rejected by the separate contour
// (even-odd) test below - those two can disagree once a hand-authored polygon is
// non-simple (self-intersecting), which is normal for complex walkable shapes like
// bridges with points on both rails.

// Membership must match walkableSurfaceHeightSample's triangle loop exactly, so a point
// with real triangulated geometry under it is never rejected by the separate contour
// (even-odd) test below - those two can disagree once a hand-authored polygon is
// non-simple (self-intersecting), which is normal for complex walkable shapes like
// bridges with points on both rails.
export function pointInAnyTriangle(px, pz, triangles) {
  if (!Array.isArray(triangles)) return false;
  for (const triangle of triangles) {
    if (px < triangle.minX - COLLISION_EPSILON || px > triangle.maxX + COLLISION_EPSILON) continue;
    if (pz < triangle.minZ - COLLISION_EPSILON || pz > triangle.maxZ + COLLISION_EPSILON) continue;
    if (barycentricHeightAtXZ(px, pz, triangle) !== null) return true;
  }
  return false;
}


export function pointOnSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const abLengthSq = abx * abx + abz * abz;
  if (abLengthSq <= COLLISION_EPSILON) return Math.hypot(px - ax, pz - az) <= COLLISION_EPSILON;
  const apx = px - ax;
  const apz = pz - az;
  const t = clamp((apx * abx + apz * abz) / abLengthSq, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  return Math.hypot(px - cx, pz - cz) <= COLLISION_EPSILON;
}


export function pointInPolygon2D(px, pz, points) {
  if (!Array.isArray(points) || points.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const current = points[index];
    const prior = points[previous];
    if (pointOnSegment(px, pz, prior.x, prior.z, current.x, current.z)) return true;
    const intersects = ((current.z > pz) !== (prior.z > pz))
      && (px < ((prior.x - current.x) * (pz - current.z)) / ((prior.z - current.z) || COLLISION_EPSILON) + current.x);
    if (intersects) inside = !inside;
  }
  return inside;
}


export function distanceSquaredToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz;
  if (lengthSq <= COLLISION_EPSILON) {
    const dx = px - ax;
    const dz = pz - az;
    return dx * dx + dz * dz;
  }
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / lengthSq, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return dx * dx + dz * dz;
}


export function distanceSquaredToPolyline(px, pz, points) {
  if (!Array.isArray(points) || points.length < 2) return Infinity;
  let best = Infinity;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const distanceSq = distanceSquaredToSegment(px, pz, previous.x, previous.z, current.x, current.z);
    if (distanceSq < best) best = distanceSq;
  }
  return best;
}


export function closestPointOnSegment2D(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz;
  if (lengthSq <= COLLISION_EPSILON) {
    const dx = px - ax;
    const dz = pz - az;
    return {
      x: ax,
      z: az,
      t: 0,
      distanceSq: dx * dx + dz * dz
    };
  }
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / lengthSq, 0, 1);
  const x = ax + abx * t;
  const z = az + abz * t;
  const dx = px - x;
  const dz = pz - z;
  return {
    x: x,
    z: z,
    t: t,
    distanceSq: dx * dx + dz * dz
  };
}


export function closestPointOnPolygonBoundary(px, pz, points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  let best = null;
  for (let index = 0, previousIndex = points.length - 1; index < points.length; previousIndex = index, index += 1) {
    const start = points[previousIndex];
    const end = points[index];
    const candidate = closestPointOnSegment2D(px, pz, start.x, start.z, end.x, end.z);
    if (!best || candidate.distanceSq < best.distanceSq) {
      best = {
        x: candidate.x,
        z: candidate.z,
        t: candidate.t,
        distanceSq: candidate.distanceSq,
        start: start,
        end: end
      };
    }
  }
  return best;
}


export function sampleWalkableBoundaryHeight(boundary, fallbackY = 0) {
  if (!boundary?.start || !boundary?.end) return num(fallbackY, 0);
  const startY = num(boundary.start.y, fallbackY);
  const endY = num(boundary.end.y, fallbackY);
  return startY + ((endY - startY) * clamp(num(boundary.t, 0), 0, 1));
}


export function pointInAxisAlignedRectangle(px, pz, rect, inflate = 0) {
  const halfWidth = Math.max(0, num(rect?.width, 0)) / 2 + Math.max(0, num(inflate, 0));
  const halfDepth = Math.max(0, num(rect?.depth, 0)) / 2 + Math.max(0, num(inflate, 0));
  if (halfWidth <= 0 || halfDepth <= 0) return false;
  const centerX = num(rect?.x, 0);
  const centerZ = num(rect?.z, 0);
  return Math.abs(px - centerX) <= halfWidth + COLLISION_EPSILON
    && Math.abs(pz - centerZ) <= halfDepth + COLLISION_EPSILON;
}


export function pointInRotatedRectangle(px, pz, rect, inflate = 0) {
  const halfWidth = Math.max(0, num(rect?.width, 0)) / 2 + Math.max(0, num(inflate, 0));
  const halfDepth = Math.max(0, num(rect?.depth, 0)) / 2 + Math.max(0, num(inflate, 0));
  if (halfWidth <= 0 || halfDepth <= 0) return false;
  const rotation = -num(rect?.rotationY, 0) * DEG_TO_RAD;
  const centerX = num(rect?.x, 0);
  const centerZ = num(rect?.z, 0);
  const dx = px - centerX;
  const dz = pz - centerZ;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.abs(localX) <= halfWidth + COLLISION_EPSILON && Math.abs(localZ) <= halfDepth + COLLISION_EPSILON;
}


export function createWalkabilityIndex(worldData, options = {}) {
  const index = createEmptyWalkabilityIndex();
  index.ground = worldGroundForCollision(worldData);
  index.heightfield = heightfieldForWorld(worldData, options);
  index.maxSlopeTan = terrainSlopeTan(worldData?.terrain?.heightfield?.maxSlopeDeg);
  index.waters = (Array.isArray(worldData?.terrain?.water) ? worldData.terrain.water : []).map(normalizeTerrainWater).filter(Boolean);

  const terrain = worldData?.terrain || {};
  const collision = worldData?.collision || {};
  const surfaces = Array.isArray(terrain.surfaces) ? terrain.surfaces : [];
  const blockers = Array.isArray(collision.blockers) ? collision.blockers : [];
  const walkables = Array.isArray(collision.walkableSurfaces) ? collision.walkableSurfaces : [];

  for (const surface of surfaces) {
    if (surface?.blocksPlayer !== true) continue;
    const width = Math.max(0, num(surface?.width, 0));
    const rawPoints = normalizeCollisionPointList(surface?.points);
    // Mirror the render path (see the surface_layer mesh builder), which runs the raw
    // path through the same Catmull-Rom smoothing before turning it into a strip -
    // otherwise the blocker follows the straight point-to-point line while the mesh
    // the player actually sees follows the curve, and the two disagree on every bend.
    const points = rawPoints.length >= 3 ? smoothPolyline(rawPoints, 8) : rawPoints;
    if (width <= 0 || points.length < 2) continue;
    index.surfaceBlockers.push({
      id: surface?.id || surface?.surfaceId || null,
      surfaceKind: String(surface?.surfaceKind || "custom").trim().toLowerCase(),
      width: width,
      points: points,
      mode: "ribbon"
    });
  }

  for (const blocker of blockers) {
    const shapeType = String(blocker?.shapeType || "polygon").trim().toLowerCase();
    const points = normalizeCollisionPointList(blocker?.points);
    const width = Math.max(0, num(blocker?.width, 0));
    const depth = Math.max(0, num(blocker?.depth, 0));
    const radius = Math.max(0, num(blocker?.radius, 0));
    if (shapeType === "polygon") {
      if (points.length < 3) continue;
    } else if (shapeType === "box") {
      if (width <= 0 || depth <= 0) continue;
    } else if (shapeType === "circle") {
      if (radius <= 0) continue;
    } else {
      continue;
    }
    index.blockers.push({
      id: blocker?.id || null,
      shapeType: shapeType,
      x: num(blocker?.x, 0),
      z: num(blocker?.z, 0),
      width: width,
      depth: depth,
      radius: radius,
      points: points,
      reason: blocker?.reason || null
    });
  }

  for (const walkable of walkables) {
    const width = Math.max(0, num(walkable?.width, 0));
    const depth = Math.max(0, num(walkable?.depth, 0));
    const y = num(walkable?.y, 0);
    const points = normalizeWalkableCollisionPointList(walkable?.points, y);
    const mode = points.length >= 3 ? "polygon" : "rectangle";
    if (mode === "rectangle" && (width <= 0 || depth <= 0)) continue;
    index.walkables.push({
      id: walkable?.id || null,
      x: num(walkable?.x, 0),
      y: y,
      z: num(walkable?.z, 0),
      width: width,
      depth: depth,
      rotationY: num(walkable?.rotationY, 0),
      priority: num(walkable?.priority, 0),
      points: points,
      mode: mode,
      triangles: mode === "polygon" ? triangulateWalkableSurface(points) : []
    });
    // Dichte randen: rand i loopt van punt i naar punt i+1 (de laatste terug naar het eerste).
    if (mode === "polygon" && Array.isArray(walkable?.closedEdges)) {
      for (const edge of walkable.closedEdges) {
        if (!Number.isInteger(edge) || edge < 0 || edge >= points.length) continue;
        const a = points[edge];
        const b = points[(edge + 1) % points.length];
        index.walls.push({
          ax: a.x, az: a.z, ay: num(a.y, y), bx: b.x, bz: b.z, by: num(b.y, y),
          minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z)
        });
      }
    }
  }

  index.walkables.sort(function (left, right) {
    const priorityDelta = num(right?.priority, 0) - num(left?.priority, 0);
    if (priorityDelta !== 0) return priorityDelta;
    return String(left?.id || "").localeCompare(String(right?.id || ""));
  });

  return index;
}


let activeWalkabilityIndex = createEmptyWalkabilityIndex();


export function resolveWalkabilitySource(source) {
  if (!source) return activeWalkabilityIndex;
  if (Array.isArray(source.walkables) && Array.isArray(source.blockers) && Array.isArray(source.surfaceBlockers)) return source;
  return activeWalkabilityIndex;
}


export function findWalkableSurfaceEntry(index, x, z, inflate = 0) {
  const walkables = Array.isArray(index?.walkables) ? index.walkables : [];
  const extraRadius = Math.max(0, num(inflate, 0));
  for (const walkable of walkables) {
    if (walkable?.mode === "polygon") {
      if (pointInAnyTriangle(x, z, walkable.triangles)) return walkable;
      if (extraRadius > COLLISION_EPSILON ? isPolygonBlockedAtRadius(walkable.points, x, z, extraRadius) : pointInPolygon2D(x, z, walkable.points)) {
        return walkable;
      }
    } else if (pointInRotatedRectangle(x, z, walkable, extraRadius)) {
      return walkable;
    }
  }
  return null;
}


export function walkableSurfaceHeightSample(walkable, x, z, fallbackY = 0) {
  if (!walkable) return null;
  if (walkable.mode === "polygon") {
    for (const triangle of Array.isArray(walkable.triangles) ? walkable.triangles : []) {
      if (x < triangle.minX - COLLISION_EPSILON || x > triangle.maxX + COLLISION_EPSILON) continue;
      if (z < triangle.minZ - COLLISION_EPSILON || z > triangle.maxZ + COLLISION_EPSILON) continue;
      const height = barycentricHeightAtXZ(x, z, triangle);
      if (height !== null) return height;
    }
    return null;
  }
  return num(walkable.y, fallbackY);
}


export function walkableSurfaceHeightAt(index, x, z, fallbackY = 0, inflate = 0) {
  const walkable = findWalkableSurfaceEntry(index, x, z, inflate);
  if (!walkable) return null;
  const height = walkableSurfaceHeightSample(walkable, x, z, fallbackY);
  if (height !== null) return height;
  const extraRadius = Math.max(0, num(inflate, 0));
  if (walkable.mode === "polygon" && extraRadius > COLLISION_EPSILON) {
    const boundary = closestPointOnPolygonBoundary(x, z, walkable.points);
    if (boundary && boundary.distanceSq <= extraRadius * extraRadius + COLLISION_EPSILON) {
      return sampleWalkableBoundaryHeight(boundary, fallbackY);
    }
  }
  return num(walkable.y, fallbackY);
}

// Obstakels (solid entiteiten, ook scatter-items met "items blokkeren speler") voor beweging. Gedeeld door
// server (autoritatieve simulatie) en client (voorspelling), zodat beide precies dezelfde lijst gebruiken.
// Kevin-handtest 2026-10-24: de client botste alleen tegen obstakels in actieve render-chunks
// (residentiebudget), de server tegen alle; de client liep door een bos waar de server vastliep.
// Oorspronkelijke toelichting: keep the authoritative simulation on the same collision set as the browser.
// Static model entities are registered as circular `activeSolids` by the world
// runtime, but the server previously passed no solids to resolveMovement. That
// let the server walk straight through tents, signs and other solid props while
// the local player remained blocked against them. On key-up the next snapshot
// could consequently move the player hundreds of units away.

// Obstakels (solid entiteiten, ook scatter-items met "items blokkeren speler") voor beweging. Gedeeld door
// server (autoritatieve simulatie) en client (voorspelling), zodat beide precies dezelfde lijst gebruiken.
// Kevin-handtest 2026-10-24: de client botste alleen tegen obstakels in actieve render-chunks
// (residentiebudget), de server tegen alle; de client liep door een bos waar de server vastliep.
// Oorspronkelijke toelichting: keep the authoritative simulation on the same collision set as the browser.
// Static model entities are registered as circular `activeSolids` by the world
// runtime, but the server previously passed no solids to resolveMovement. That
// let the server walk straight through tents, signs and other solid props while
// the local player remained blocked against them. On key-up the next snapshot
// could consequently move the player hundreds of units away.
export function solidCollisionEntriesForWorld(world) {
  const entries = [];
  for (const entity of Array.isArray(world?.entities) ? world.entities : []) {
    if (!entity || entity.solid !== true || entity.walkable === true) continue;
    const position = entity.transform?.position || {};
    const x = Number(position.x);
    const z = Number(position.z);
    const radius = Number(entity.collisionRadius);
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius) || radius <= 0) continue;
    entries.push({
      id: String(entity.id || entity.entityId || entity.nodeId || "entity") + "::solid",
      entityId: entity.id || entity.entityId || entity.nodeId || null,
      x: x,
      z: z,
      radius: radius,
      enabled: true
    });
  }
  return entries;
}


export function buildWalkabilityIndex(worldData, options = {}) {
  activeWalkabilityIndex = createWalkabilityIndex(worldData, options);
  return activeWalkabilityIndex;
}


export function clearWalkabilityIndex() {
  activeWalkabilityIndex = createEmptyWalkabilityIndex();
  return activeWalkabilityIndex;
}


export function isPointOnWalkableSurface(source, x, z, radius = 0) {
  const index = resolveWalkabilitySource(source);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  return Boolean(findWalkableSurfaceEntry(index, x, z, radius));
}


export function isPolygonBlockedAtRadius(points, x, z, radius) {
  if (pointInPolygon2D(x, z, points)) return true;
  const sampleRadius = Math.max(0, num(radius, 0));
  if (sampleRadius <= COLLISION_EPSILON) return false;
  const boundary = closestPointOnPolygonBoundary(x, z, points);
  return Boolean(boundary && boundary.distanceSq <= sampleRadius * sampleRadius + COLLISION_EPSILON);
}


export function isPointBlockedByBlocker(source, x, z, radius = 0) {
  const index = resolveWalkabilitySource(source);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  for (const blocker of index.blockers) {
    if (blocker.shapeType === "polygon") {
      if (isPolygonBlockedAtRadius(blocker.points, x, z, radius)) return true;
    } else if (blocker.shapeType === "box") {
      if (pointInAxisAlignedRectangle(x, z, blocker, radius)) return true;
    } else if (blocker.shapeType === "circle") {
      const dx = x - blocker.x;
      const dz = z - blocker.z;
      const limit = blocker.radius + Math.max(0, num(radius, 0));
      if (dx * dx + dz * dz <= limit * limit + COLLISION_EPSILON) return true;
    }
  }
  return false;
}


export function isPointBlockedBySurfaceEntry(surface, x, z, radius) {
  const halfWidth = (surface.width / 2) + Math.max(0, num(radius, 0));
  if (halfWidth <= 0) return false;
  const distanceSq = distanceSquaredToPolyline(x, z, surface.points);
  return distanceSq <= halfWidth * halfWidth + COLLISION_EPSILON;
}


export function isPointBlockedBySurface(source, x, z, radius = 0) {
  const index = resolveWalkabilitySource(source);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const surfaceBlockers = Array.isArray(index.surfaceBlockers) ? index.surfaceBlockers : [];
  for (const surface of surfaceBlockers) {
    if (isPointBlockedBySurfaceEntry(surface, x, z, radius)) return true;
  }
  return false;
}


export function isPointBlockedByTerrain(source, x, z, radius = 0) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const index = resolveWalkabilitySource(source);
  if (isPointOnWalkableSurface(index, x, z, radius)) return false;
  return isPointBlockedByBlocker(index, x, z, radius)
    || isPointBlockedBySurface(index, x, z, radius);
}


export function clampPointToGround(point, ground, radius) {
  if (!ground) return point;
  const bounds = effectiveGroundBounds(ground);
  if (bounds) {
    const minX = bounds.minX + radius;
    const maxX = bounds.maxX - radius;
    const minZ = bounds.minZ + radius;
    const maxZ = bounds.maxZ - radius;
    if (Number.isFinite(minX) && Number.isFinite(maxX) && minX <= maxX) point.x = Math.min(maxX, Math.max(minX, point.x));
    if (Number.isFinite(minZ) && Number.isFinite(maxZ) && minZ <= maxZ) point.z = Math.min(maxZ, Math.max(minZ, point.z));
  }
  if (Number.isFinite(ground.y)) point.y = ground.y;
  return point;
}


export function pushAwayFromSolids(point, radius, solids) {
  if (!Array.isArray(solids) || !solids.length) return point;
  for (const solid of solids) {
    if (solid?.enabled === false) continue;
    const solidRadius = Math.max(0, num(solid?.radius, 0));
    if (solidRadius <= 0) continue;
    const dx = point.x - num(solid?.x, 0);
    const dz = point.z - num(solid?.z, 0);
    const minDist = radius + solidRadius;
    const dist = Math.hypot(dx, dz);
    if (dist > 0 && dist < minDist) {
      const push = (minDist - dist) / dist;
      point.x += dx * push;
      point.z += dz * push;
    }
  }
  return point;
}


export function hasMovedXZ(startX, startZ, x, z) {
  return Math.hypot(x - startX, z - startZ) > COLLISION_EPSILON;
}


export function resolveMovementCandidateInto(output, startX, startY, startZ, candidateX, candidateY, candidateZ, index, ground, solids, radius) {
  output.x = Number.isFinite(candidateX) ? candidateX : startX;
  output.y = Number.isFinite(candidateY) ? candidateY : startY;
  output.z = Number.isFinite(candidateZ) ? candidateZ : startZ;
  clampPointToGround(output, ground, radius);
  if (isPointBlockedByTerrain(index, output.x, output.z, radius)) return false;
  pushAwayFromSolids(output, radius, solids);
  clampPointToGround(output, ground, radius);
  if (isPointBlockedByTerrain(index, output.x, output.z, radius)) return false;
  if (walkableWallBlocks(index, startX, startY, startZ, output.x, output.z, radius)) return false;
  const walkableY = walkableSurfaceHeightAt(index, output.x, output.z, num(ground?.y, startY), radius);
  if (walkableY !== null) {
    output.y = walkableY;
    return true;
  }
  // Water: "Niet in" houdt je al bij de waterlijn tegen (cirkel om de speler); op "IJs" loop je bovenop;
  // "Doorheen" = gewoon de bodem. Wie toch in het water staat, mag altijd naar ondieper (ook een steile oever op).
  const wetTo = blockWaterDepth(index, output.x, output.z, radius);
  if (wetTo) {
    const wetFrom = blockWaterDepth(index, startX, startZ, radius);
    if (!(wetFrom && wetTo.center < wetFrom.center)) return false;
  }
  const wet = waterUnder(index, output.x, output.z);
  if (wet && wet.water.behavior === "ice") {
    output.y = num(ground?.y, 0) + Math.max(wet.bottom, wet.water.height);
    return true;
  }
  // Terrein: op de hoogte van de grond lopen; te steil omhoog = een muur (omlaag mag altijd).
  const heightfield = index?.heightfield || null;
  if (heightfield) {
    const baseY = num(ground?.y, 0);
    const endHeight = terrainHeightAt(heightfield, output.x, output.z);
    const distance = Math.hypot(output.x - startX, output.z - startZ);
    if (distance > COLLISION_EPSILON) {
      const rise = endHeight - terrainHeightAt(heightfield, startX, startZ);
      // Vlak bij "Niet in"-water (binnen 1 m) mag je een steile oever op: omlaag mag altijd, dus anders zit je
      // aan de waterkant vast.
      if (rise > 0 && rise / distance > num(index.maxSlopeTan, 1.19) && !blockWaterDepth(index, startX, startZ, radius + 1)) return false;
    }
    output.y = baseY + endHeight;
  }
  return true;
}


export function resolveMovementStepInto(output, startX, startY, startZ, desiredX, desiredY, desiredZ, index, ground, solids, radius) {
  if (resolveMovementCandidateInto(output, startX, startY, startZ, desiredX, desiredY, desiredZ, index, ground, solids, radius)) return output;
  if (resolveMovementCandidateInto(output, startX, startY, startZ, desiredX, desiredY, startZ, index, ground, solids, radius) && hasMovedXZ(startX, startZ, output.x, output.z)) return output;
  if (resolveMovementCandidateInto(output, startX, startY, startZ, startX, desiredY, desiredZ, index, ground, solids, radius) && hasMovedXZ(startX, startZ, output.x, output.z)) return output;
  output.x = startX;
  output.y = startY;
  output.z = startZ;
  return output;
}


export function movementSubstepCount(startX, startZ, desiredX, desiredZ, radius) {
  const distance = Math.hypot(desiredX - startX, desiredZ - startZ);
  if (distance <= COLLISION_EPSILON) return 1;
  const stepSize = Math.max(Math.max(0, num(radius, 0)) * 0.45, 0.12);
  return clamp(Math.ceil(distance / stepSize), 1, 8);
}


export function resolveMovementInto(output, start, desired, options = {}) {
  const index = resolveWalkabilitySource(options.index);
  const radius = Math.max(0, num(options.radius, 0.5));
  const ground = options.ground || index.ground || null;
  const solids = Array.isArray(options.solids) ? options.solids : [];
  const startX = num(start?.x, 0);
  const startY = num(start?.y, 0);
  const startZ = num(start?.z, 0);
  const desiredX = num(desired?.x, startX);
  const desiredY = num(desired?.y, startY);
  const desiredZ = num(desired?.z, startZ);
  const substeps = movementSubstepCount(startX, startZ, desiredX, desiredZ, radius);
  let currentX = startX;
  let currentY = startY;
  let currentZ = startZ;
  output.x = startX;
  output.y = startY;
  output.z = startZ;
  for (let stepIndex = 1; stepIndex <= substeps; stepIndex += 1) {
    const t = stepIndex / substeps;
    const candidateX = startX + ((desiredX - startX) * t);
    const candidateY = startY + ((desiredY - startY) * t);
    const candidateZ = startZ + ((desiredZ - startZ) * t);
    resolveMovementStepInto(output, currentX, currentY, currentZ, candidateX, candidateY, candidateZ, index, ground, solids, radius);
    if (!hasMovedXZ(currentX, currentZ, output.x, output.z) && hasMovedXZ(currentX, currentZ, candidateX, candidateZ)) {
      output.x = currentX;
      output.y = currentY;
      output.z = currentZ;
      return output;
    }
    currentX = output.x;
    currentY = output.y;
    currentZ = output.z;
  }
  return output;
}


export function resolveMovement(start, desired, options = {}) {
  const result = {
    x: num(start?.x, 0),
    y: num(start?.y, 0),
    z: num(start?.z, 0)
  };
  return resolveMovementInto(result, start, desired, options);
}

