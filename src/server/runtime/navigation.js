// Fase 05 (F5-E1-T03): looppaden voor vijanden. Eigen raster ("navtiles") van 0,5 m per 64 m Cell, gemaakt uit
// precies dezelfde botsingsdata als de spelerbeweging (walkability-index + vaste obstakels + grondgrens).
// Geen nieuwe dependency (zie ADR-011). Tegels worden lui berekend en per Cell bewaard; A* met een budget.
import crypto from "node:crypto";
import { effectiveGroundBounds, isPointBlockedByTerrain } from "../../../apps/web/public/shared/movement-kernel.js";

export const NAV_TILE_M = 0.5;
export const NAV_CELL_M = 64;
export const NAV_TILES_PER_CELL = 128; // 64 / 0,5
const TILE_UNKNOWN = 0;
const TILE_FREE = 1;
const TILE_BLOCKED = 2;
const KEY_OFFSET = 1048576; // 2^20 tegels = 524 km: ruim boven MAX_WORLD_MM
const KEY_SCALE = 2097152; // 2^21
const SQRT2_COST = 14;
const STRAIGHT_COST = 10;

function tileKey(gx, gz) {
  return (gx + KEY_OFFSET) * KEY_SCALE + (gz + KEY_OFFSET);
}

function floorDivInt(a, b) {
  return Math.floor(a / b);
}

// Ruime begrenzing (meters) van een blocker/oppervlak/walkable; null = onbekend (dan altijd meenemen).
function entryBounds(entry) {
  const points = Array.isArray(entry?.points) ? entry.points : [];
  let pad = 0;
  if (entry?.mode === "ribbon") pad = Math.max(0, Number(entry.width) || 0) / 2;
  if (points.length) {
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (const point of points) {
      const x = Number(point?.x); const z = Number(point?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
  }
  const x = Number(entry?.x); const z = Number(entry?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (entry?.shapeType === "circle") {
    const r = Math.max(0, Number(entry.radius) || 0);
    return { minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r };
  }
  // box of (gedraaide) rechthoek: neem de omgeschreven cirkel.
  const half = Math.hypot(Math.max(0, Number(entry?.width) || 0), Math.max(0, Number(entry?.depth) || 0)) / 2;
  return { minX: x - half, maxX: x + half, minZ: z - half, maxZ: z + half };
}

function overlaps(bounds, rect) {
  return !bounds || (bounds.minX <= rect.maxX && bounds.maxX >= rect.minX && bounds.minZ <= rect.maxZ && bounds.maxZ >= rect.minZ);
}

// index: walkability-index (movement-kernel). solids: [{ x, z, radius, enabled }]. radius: straal van de vijand (m).
export function createNavigator({ index, solids = [], radius = 0.5, maxCells = 96 } = {}) {
  const r = Math.max(0.1, Number(radius) || 0.5);
  const ground = index?.ground ? effectiveGroundBounds(index.ground) : null;
  const staticSolids = (Array.isArray(solids) ? solids : []).filter((solid) => solid && solid.enabled !== false && Number(solid.radius) > 0)
    .map((solid) => ({ x: Number(solid.x), z: Number(solid.z), radius: Number(solid.radius) }));
  const cells = new Map(); // "cx:cz" -> { grid, sub, solids }
  const stats = { cellsBaked: 0, tilesEvaluated: 0, searches: 0, expanded: 0, failed: 0 };

  function cellRecord(cx, cz) {
    const key = cx + ":" + cz;
    let record = cells.get(key);
    if (record) return record;
    if (cells.size >= maxCells) cells.delete(cells.keys().next().value); // oudste weg: begrensd geheugen
    const pad = r + 1;
    const rect = { minX: cx * NAV_CELL_M - pad, maxX: (cx + 1) * NAV_CELL_M + pad, minZ: cz * NAV_CELL_M - pad, maxZ: (cz + 1) * NAV_CELL_M + pad };
    // Per Cell alleen de vormen die er (bijna) in liggen: zo blijft één tegelcheck goedkoop.
    const sub = {
      ground: index?.ground || null,
      walkables: (index?.walkables || []).filter((entry) => overlaps(entryBounds(entry), rect)),
      blockers: (index?.blockers || []).filter((entry) => overlaps(entryBounds(entry), rect)),
      surfaceBlockers: (index?.surfaceBlockers || []).filter((entry) => overlaps(entryBounds(entry), rect))
    };
    const cellSolids = staticSolids.filter((solid) => overlaps({ minX: solid.x - solid.radius, maxX: solid.x + solid.radius, minZ: solid.z - solid.radius, maxZ: solid.z + solid.radius }, rect));
    record = { grid: new Uint8Array(NAV_TILES_PER_CELL * NAV_TILES_PER_CELL), sub, solids: cellSolids };
    cells.set(key, record);
    stats.cellsBaked += 1;
    return record;
  }

  function evaluate(record, x, z) {
    stats.tilesEvaluated += 1;
    if (ground && (x - r < ground.minX || x + r > ground.maxX || z - r < ground.minZ || z + r > ground.maxZ)) return TILE_BLOCKED;
    if (isPointBlockedByTerrain(record.sub, x, z, r)) return TILE_BLOCKED;
    for (const solid of record.solids) {
      const dx = x - solid.x; const dz = z - solid.z; const limit = solid.radius + r;
      if (dx * dx + dz * dz < limit * limit) return TILE_BLOCKED;
    }
    return TILE_FREE;
  }

  function blocked(gx, gz) {
    const cx = floorDivInt(gx, NAV_TILES_PER_CELL);
    const cz = floorDivInt(gz, NAV_TILES_PER_CELL);
    const record = cellRecord(cx, cz);
    const local = (gz - cz * NAV_TILES_PER_CELL) * NAV_TILES_PER_CELL + (gx - cx * NAV_TILES_PER_CELL);
    let value = record.grid[local];
    if (value === TILE_UNKNOWN) {
      value = evaluate(record, (gx + 0.5) * NAV_TILE_M, (gz + 0.5) * NAV_TILE_M);
      record.grid[local] = value;
    }
    return value === TILE_BLOCKED;
  }

  const toTile = (meters) => Math.floor(meters / NAV_TILE_M);
  const tileCenter = (g) => (g + 0.5) * NAV_TILE_M;

  // Hele Cell in één keer (spike, test, hash). Zelfde tegelfunctie als de luie route.
  function bakeCell(cx, cz) {
    const startedAt = performance.now();
    for (let iz = 0; iz < NAV_TILES_PER_CELL; iz += 1) {
      for (let ix = 0; ix < NAV_TILES_PER_CELL; ix += 1) blocked(cx * NAV_TILES_PER_CELL + ix, cz * NAV_TILES_PER_CELL + iz);
    }
    const record = cellRecord(cx, cz);
    let blockedCount = 0;
    for (const value of record.grid) if (value === TILE_BLOCKED) blockedCount += 1;
    const hash = crypto.createHash("sha256").update(cx + ":" + cz + ":" + r + ":").update(record.grid).digest("hex");
    return { cellKey: cx + ":" + cz, hash, blockedTiles: blockedCount, tiles: record.grid.length, ms: performance.now() - startedAt };
  }

  // Vrije lijn tussen twee punten (meters)? Bemonsterd per kwart tegel.
  function lineClear(ax, az, bx, bz) {
    const length = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(length / (NAV_TILE_M / 2)));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      if (blocked(toTile(ax + (bx - ax) * t), toTile(az + (bz - az) * t))) return false;
    }
    return true;
  }

  function nearestFree(gx, gz, maxRing = 3) {
    if (!blocked(gx, gz)) return [gx, gz];
    for (let ring = 1; ring <= maxRing; ring += 1) {
      for (let dz = -ring; dz <= ring; dz += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          if (!blocked(gx + dx, gz + dz)) return [gx + dx, gz + dz];
        }
      }
    }
    return null;
  }

  // A* (8 richtingen, geen hoeken afsnijden). Geeft { ok, points: [{x,z}], expanded, reason }.
  function findPath(start, goal, options = {}) {
    stats.searches += 1;
    const maxExpanded = Math.max(64, Math.floor(Number(options.maxExpanded) || 4000));
    if (lineClear(start.x, start.z, goal.x, goal.z)) return { ok: true, points: [{ x: goal.x, z: goal.z }], expanded: 0, direct: true };
    const from = nearestFree(toTile(start.x), toTile(start.z));
    const to = nearestFree(toTile(goal.x), toTile(goal.z));
    if (!from || !to) { stats.failed += 1; return { ok: false, points: [], expanded: 0, reason: from ? "goal_blocked" : "start_blocked" }; }
    const goalKey = tileKey(to[0], to[1]);
    const heuristic = (gx, gz) => {
      const dx = Math.abs(gx - to[0]); const dz = Math.abs(gz - to[1]);
      return STRAIGHT_COST * (dx + dz) + (SQRT2_COST - 2 * STRAIGHT_COST) * Math.min(dx, dz);
    };
    const gScore = new Map();
    const parent = new Map();
    const closed = new Set();
    // Binaire heap van [f, h, gx, gz] (vaste volgorde bij gelijke f: lagere h, dan coördinaten).
    const heap = [];
    const less = (a, b) => a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] !== b[2] ? a[2] < b[2] : a[3] < b[3];
    const push = (node) => {
      heap.push(node);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!less(heap[i], heap[p])) break;
        [heap[i], heap[p]] = [heap[p], heap[i]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1; const rr = l + 1; let m = i;
          if (l < heap.length && less(heap[l], heap[m])) m = l;
          if (rr < heap.length && less(heap[rr], heap[m])) m = rr;
          if (m === i) break;
          [heap[i], heap[m]] = [heap[m], heap[i]];
          i = m;
        }
      }
      return top;
    };
    const startKey = tileKey(from[0], from[1]);
    gScore.set(startKey, 0);
    push([heuristic(from[0], from[1]), heuristic(from[0], from[1]), from[0], from[1]]);
    let expanded = 0;
    let found = false;
    while (heap.length) {
      const [, , gx, gz] = pop();
      const key = tileKey(gx, gz);
      if (closed.has(key)) continue;
      closed.add(key);
      if (key === goalKey) { found = true; break; }
      expanded += 1;
      if (expanded > maxExpanded) break;
      const g = gScore.get(key);
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dz) continue;
          const nx = gx + dx; const nz = gz + dz;
          if (blocked(nx, nz)) continue;
          if (dx && dz && (blocked(gx + dx, gz) || blocked(gx, gz + dz))) continue;
          const nKey = tileKey(nx, nz);
          if (closed.has(nKey)) continue;
          const ng = g + (dx && dz ? SQRT2_COST : STRAIGHT_COST);
          if (gScore.has(nKey) && gScore.get(nKey) <= ng) continue;
          gScore.set(nKey, ng);
          parent.set(nKey, key);
          const h = heuristic(nx, nz);
          push([ng + h, h, nx, nz]);
        }
      }
    }
    stats.expanded += expanded;
    if (!found) { stats.failed += 1; return { ok: false, points: [], expanded, reason: expanded > maxExpanded ? "budget" : "no_path" }; }
    const tiles = [];
    for (let key = goalKey; key !== undefined; key = parent.get(key)) {
      tiles.push([Math.floor(key / KEY_SCALE) - KEY_OFFSET, (key % KEY_SCALE) - KEY_OFFSET]);
      if (key === startKey) break;
    }
    tiles.reverse();
    // Inkorten: vanaf elk punt naar het verste punt met een vrije lijn.
    const raw = tiles.map(([gx, gz]) => ({ x: tileCenter(gx), z: tileCenter(gz) }));
    raw[raw.length - 1] = { x: goal.x, z: goal.z };
    const points = [];
    let anchor = { x: start.x, z: start.z };
    let i = 0;
    while (i < raw.length) {
      let furthest = i;
      for (let k = raw.length - 1; k > i; k -= 1) {
        if (lineClear(anchor.x, anchor.z, raw[k].x, raw[k].z)) { furthest = k; break; }
      }
      points.push(raw[furthest]);
      anchor = raw[furthest];
      i = furthest + 1;
    }
    return { ok: true, points, expanded };
  }

  return { radius: r, findPath, lineClear, blocked, bakeCell, nearestFree, stats: () => Object.assign({ cells: cells.size }, stats) };
}
