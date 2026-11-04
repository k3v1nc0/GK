// Fase 04 (F4-E1-T01, ADR-006): gedeeld ruimtecontract voor server, editor en game.
// - Authoring bewaart integer millimeters (mm). De legacy-wereld rekent in meters (1 unit = 1 m, zie LEGACY_UNITS_PER_METER).
// - Cells zijn een afgeleid, globaal grid van 64 m. Een Cell-key is "<x>_<z>" met x/z = floor(mm / 64000), ook voor negatief.
// - Grenzen zijn half-open: [min, max). Een punt op een gedeelde rand hoort bij precies één Region.
// Puur: geen DOM, geen DB, geen Node-API's.

export const MM_PER_METER = 1000;
export const CELL_SIZE_MM = 64000;
// Gemeten aanname: de legacy-wereld gebruikt 1 unit = 1 meter. De CLI-proef op de echte wereld bevestigt dit;
// bij een andere schaal blokkeert convertLegacyPoint (geen stille omrekening).
export const LEGACY_UNITS_PER_METER = 1;
export const MAX_WORLD_MM = 100000000; // 100 km vanaf de oorsprong
export const MAX_CELLS_PER_SHAPE = 4096;
export const DEFAULT_HYSTERESIS_MM = 500;
export const AREA_SHAPES = Object.freeze(["box", "cylinder", "polygon"]);

export function metersToMm(meters) {
  const value = Number(meters);
  if (!Number.isFinite(value)) return NaN;
  return Math.round(value * MM_PER_METER);
}

export function mmToMeters(mm) {
  return Number(mm) / MM_PER_METER;
}

// Legacy-positie (units) -> world-mm. unitsPerMeter moet expliciet bekend zijn.
export function convertLegacyPoint(point, unitsPerMeter = LEGACY_UNITS_PER_METER) {
  const scale = Number(unitsPerMeter);
  if (!Number.isFinite(scale) || scale <= 0) {
    const error = new Error("Onbekende legacy-schaal: conversie geblokkeerd.");
    error.code = "SCALE_UNKNOWN";
    throw error;
  }
  return { xMm: metersToMm(Number(point?.x) / scale), zMm: metersToMm(Number(point?.z) / scale) };
}

export function cellIndex(mm) {
  return Math.floor(Number(mm) / CELL_SIZE_MM);
}

export function cellKey(cx, cz) {
  return cx + "_" + cz;
}

export function cellKeyForPointMm(xMm, zMm) {
  return cellKey(cellIndex(xMm), cellIndex(zMm));
}

export function parseCellKey(key) {
  const match = /^(-?\d+)_(-?\d+)$/.exec(String(key || ""));
  return match ? { cx: Number(match[1]), cz: Number(match[2]) } : null;
}

// Rect = { minXMm, maxXMm, minZMm, maxZMm }, half-open.
export function rectContains(rect, xMm, zMm) {
  return xMm >= rect.minXMm && xMm < rect.maxXMm && zMm >= rect.minZMm && zMm < rect.maxZMm;
}

export function rectsOverlap(a, b) {
  return a.minXMm < b.maxXMm && b.minXMm < a.maxXMm && a.minZMm < b.maxZMm && b.minZMm < a.maxZMm;
}

export function rectInside(inner, outer) {
  return inner.minXMm >= outer.minXMm && inner.maxXMm <= outer.maxXMm && inner.minZMm >= outer.minZMm && inner.maxZMm <= outer.maxZMm;
}

export function expandRect(rect, mm) {
  return { minXMm: rect.minXMm - mm, maxXMm: rect.maxXMm + mm, minZMm: rect.minZMm - mm, maxZMm: rect.maxZMm + mm };
}

function pointInPolygon(points, x, z) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, zi] = points[i];
    const [xj, zj] = points[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToSegmentSq(x, z, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSq)) : 0;
  const px = ax + t * dx - x;
  const pz = az + t * dz - z;
  return px * px + pz * pz;
}

// Bounding rect van een Area (half-open max). Voor inside-checks en de Cell-index.
export function areaBoundsMm(area) {
  if (area.shape === "box") return { minXMm: area.minXMm, maxXMm: area.maxXMm, minZMm: area.minZMm, maxZMm: area.maxZMm };
  if (area.shape === "cylinder") {
    return { minXMm: area.centerXMm - area.radiusMm, maxXMm: area.centerXMm + area.radiusMm, minZMm: area.centerZMm - area.radiusMm, maxZMm: area.centerZMm + area.radiusMm };
  }
  const xs = area.pointsMm.map((point) => point[0]);
  const zs = area.pointsMm.map((point) => point[1]);
  return { minXMm: Math.min(...xs), maxXMm: Math.max(...xs), minZMm: Math.min(...zs), maxZMm: Math.max(...zs) };
}

// paddingMm > 0 = hysteresis: het punt telt nog als binnen als het hooguit paddingMm buiten de vorm ligt.
export function areaContains(area, xMm, zMm, paddingMm = 0) {
  if (area.shape === "box") return rectContains(paddingMm > 0 ? expandRect(area, paddingMm) : area, xMm, zMm);
  if (area.shape === "cylinder") {
    const dx = xMm - area.centerXMm;
    const dz = zMm - area.centerZMm;
    const radius = area.radiusMm + Math.max(0, paddingMm);
    return dx * dx + dz * dz < radius * radius;
  }
  const points = area.pointsMm;
  if (pointInPolygon(points, xMm, zMm)) return true;
  if (paddingMm <= 0) return false;
  const limit = paddingMm * paddingMm;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    if (distanceToSegmentSq(xMm, zMm, points[j][0], points[j][1], points[i][0], points[i][1]) <= limit) return true;
  }
  return false;
}

function segmentsCross(a, b, c, d) {
  const orient = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const o1 = orient(a, b, c); const o2 = orient(a, b, d); const o3 = orient(c, d, a); const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

// Geeft een foutcode of null. Een polygoon mag zichzelf niet snijden en moet oppervlakte hebben.
export function polygonProblem(points) {
  if (!Array.isArray(points) || points.length < 3) return "POLYGON_TOO_FEW_POINTS";
  let twiceArea = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    if (points[i][0] === points[j][0] && points[i][1] === points[j][1]) return "POLYGON_DUPLICATE_POINT";
    twiceArea += points[j][0] * points[i][1] - points[i][0] * points[j][1];
  }
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    for (let k = i + 1; k < n; k += 1) {
      if (Math.abs(i - k) <= 1 || (i === 0 && k === n - 1)) continue;
      if (segmentsCross(points[i], points[(i + 1) % n], points[k], points[(k + 1) % n])) return "POLYGON_SELF_INTERSECTS";
    }
  }
  if (twiceArea === 0) return "POLYGON_NO_AREA";
  return null;
}

// Alle Cell-keys die een half-open rect raakt. Geeft null als het er meer dan maxCells zijn.
export function cellKeysForRect(rect, maxCells = MAX_CELLS_PER_SHAPE) {
  const minX = cellIndex(rect.minXMm);
  const maxX = cellIndex(rect.maxXMm - 1);
  const minZ = cellIndex(rect.minZMm);
  const maxZ = cellIndex(rect.maxZMm - 1);
  const count = (maxX - minX + 1) * (maxZ - minZ + 1);
  if (!Number.isFinite(count) || count <= 0 || count > maxCells) return null;
  const keys = [];
  for (let cz = minZ; cz <= maxZ; cz += 1) for (let cx = minX; cx <= maxX; cx += 1) keys.push(cellKey(cx, cz));
  return keys;
}

// Bouwt de opzoekstructuur voor een gecompileerde wereldsectie ({ regions, areas, cells }).
export function createSpatialIndex(world) {
  const regions = new Map((world?.regions || []).map((region) => [region.regionId, region]));
  const areas = new Map((world?.areas || []).map((area) => [area.areaId, area]));
  return { regions, areas, cells: world?.cells || {} };
}

function areaRank(area) {
  const bounds = areaBoundsMm(area);
  return { priority: Number(area.priority) || 0, size: (bounds.maxXMm - bounds.minXMm) * (bounds.maxZMm - bounds.minZMm) };
}

// Kiest de Area met de hoogste prioriteit; bij gelijk de kleinste, daarna op ID (vaste volgorde, geen toeval).
function betterArea(a, b) {
  if (!b) return true;
  const ra = areaRank(a);
  const rb = areaRank(b);
  if (ra.priority !== rb.priority) return ra.priority > rb.priority;
  if (ra.size !== rb.size) return ra.size < rb.size;
  return a.areaId < b.areaId;
}

// Server-side membership met hysteresis. previous = { regionId, areaId } of null.
// Geeft { regionId, areaId, cellKey } terug (null waar niets is).
// Ronde 3: een deelgebied zonder gebied (regionId leeg) geldt overal in de wereld; een deelgebied met gebied
// alleen binnen dat gebied (oude data).
export function resolveMembership(index, xMm, zMm, previous = null, hysteresisMm = DEFAULT_HYSTERESIS_MM) {
  const key = cellKeyForPointMm(xMm, zMm);
  const cell = index.cells[key] || null;
  let region = null;
  const previousRegion = previous?.regionId ? index.regions.get(previous.regionId) : null;
  if (previousRegion && rectContains(expandRect(previousRegion, hysteresisMm), xMm, zMm)) region = previousRegion;
  if (!region && cell) {
    for (const regionId of cell.regions || []) {
      const candidate = index.regions.get(regionId);
      if (candidate && rectContains(candidate, xMm, zMm)) { region = candidate; break; }
    }
  }
  const regionId = region ? region.regionId : null;
  const fits = (candidate) => !candidate.regionId || candidate.regionId === regionId;
  let best = null;
  for (const areaId of cell?.areas || []) {
    const candidate = index.areas.get(areaId);
    if (candidate && fits(candidate) && areaContains(candidate, xMm, zMm) && betterArea(candidate, best)) best = candidate;
  }
  const previousArea = previous?.areaId ? index.areas.get(previous.areaId) : null;
  if (previousArea && fits(previousArea) && previousArea !== best && areaContains(previousArea, xMm, zMm, hysteresisMm)) {
    // Blijf in de vorige Area zolang die nog (bijna) geldt en er geen Area met hogere prioriteit is.
    if (!best || areaRank(best).priority <= areaRank(previousArea).priority) best = previousArea;
  }
  return { regionId, areaId: best ? best.areaId : null, cellKey: key };
}
