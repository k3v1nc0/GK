// Vijanden gebruiken dezelfde brugroutes, water- en randcontroles als spelers.
// Eén navigator per wereld/straal; navtiles blijven beschikbaar voor inspectie.
import crypto from "node:crypto";
import { createPlayerNavigator } from "../../../apps/web/public/shared/player-navigation.js";

export const NAV_TILE_M = 0.5;
export const NAV_CELL_M = 64;
export const NAV_TILES_PER_CELL = 128;

export function createNavigator({ index, solids = [], radius = 0.5, maxCells = 96 } = {}) {
  const r = Math.max(0.1, Number(radius) || 0.5);
  const navigator = createPlayerNavigator({ index, solids, radius: r, maxCells: maxCells * 4 });
  const cells = new Map();
  const stats = { cellsBaked: 0, tilesEvaluated: 0, searches: 0, expanded: 0, checks: 0, failed: 0 };

  function cellRecord(cx, cz) {
    const key = cx + ":" + cz;
    if (!cells.has(key)) {
      if (cells.size >= maxCells) cells.delete(cells.keys().next().value);
      cells.set(key, new Uint8Array(NAV_TILES_PER_CELL ** 2));
      stats.cellsBaked += 1;
    }
    return cells.get(key);
  }

  function blocked(gx, gz) {
    const cx = Math.floor(gx / NAV_TILES_PER_CELL), cz = Math.floor(gz / NAV_TILES_PER_CELL);
    const grid = cellRecord(cx, cz);
    const offset = (gz - cz * NAV_TILES_PER_CELL) * NAV_TILES_PER_CELL + gx - cx * NAV_TILES_PER_CELL;
    if (!grid[offset]) {
      stats.tilesEvaluated += 1;
      grid[offset] = navigator.isFree((gx + 0.5) * NAV_TILE_M, (gz + 0.5) * NAV_TILE_M) ? 1 : 2;
    }
    return grid[offset] === 2;
  }

  function nearestFree(gx, gz, maxRing = 3) {
    if (!blocked(gx, gz)) return [gx, gz];
    for (let ring = 1; ring <= maxRing; ring += 1) {
      for (let dz = -ring; dz <= ring; dz += 1) for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) === ring && !blocked(gx + dx, gz + dz)) return [gx + dx, gz + dz];
      }
    }
    return null;
  }

  function bakeCell(cx, cz) {
    const startedAt = performance.now();
    for (let iz = 0; iz < NAV_TILES_PER_CELL; iz += 1) for (let ix = 0; ix < NAV_TILES_PER_CELL; ix += 1) {
      blocked(cx * NAV_TILES_PER_CELL + ix, cz * NAV_TILES_PER_CELL + iz);
    }
    const grid = cellRecord(cx, cz);
    const hash = crypto.createHash("sha256").update(cx + ":" + cz + ":" + r + ":").update(grid).digest("hex");
    return { cellKey: cx + ":" + cz, hash, blockedTiles: grid.reduce((sum, value) => sum + (value === 2 ? 1 : 0), 0), tiles: grid.length, ms: performance.now() - startedAt };
  }

  function findPath(start, goal, options = {}) {
    stats.searches += 1;
    const result = navigator.findPath(start, goal, { maxExpanded: 4000, maxChecks: 12000, ...options });
    stats.expanded += result.expanded;
    stats.checks += result.checks;
    if (!result.ok) stats.failed += 1;
    return result;
  }

  return { radius: r, findPath, blocked, bakeCell, nearestFree,
    lineClear: (ax, az, bx, bz) => navigator.lineClear({ x: ax, z: az }, { x: bx, z: bz }),
    stats: () => ({ ...stats, cells: cells.size }) };
}
