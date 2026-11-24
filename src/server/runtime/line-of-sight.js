// Fase 5: gaat een aanval of vaardigheid door een muur? De server kijkt dit alleen op het moment van gebruik.
// Telt mee: dichte modellen (botsstraal), blokkades en dichte randen van loopvlakken. Heuvels tellen niet mee.
// Licht gehouden: eerst een snelle rechthoek-test per obstakel, daarna pas de echte controle.
import { isPointBlockedByTerrain } from "../../../apps/web/public/shared/movement-kernel.js";

const END_MARGIN_M = 0.6; // vlak bij jou of het doel telt niet (je staat er tegenaan of het doel staat erin)
const SAMPLE_M = 0.5;
const WALL_HEIGHT_REACH = 2;

function crosses(ax, az, bx, bz, cx, cz, dx, dz) {
  const d1 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx);
  const d2 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  const d3 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  const d4 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// Afstand² van punt (px, pz) tot het lijnstuk a-b.
function distSqToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq)) : 0;
  const ox = px - (ax + dx * t);
  const oz = pz - (az + dz * t);
  return ox * ox + oz * oz;
}

// worldContext: { solidColliders: [{ x, z, radius }], walkabilityIndex: { blockers, surfaceBlockers, walls } }.
export function lineOfSightBlocked(worldContext, ax, az, bx, bz, ay = null) {
  if (!worldContext) return false;
  const length = Math.hypot(bx - ax, bz - az);
  if (!(length > END_MARGIN_M * 2)) return false;
  const minX = Math.min(ax, bx); const maxX = Math.max(ax, bx);
  const minZ = Math.min(az, bz); const maxZ = Math.max(az, bz);
  // 1. Dichte modellen (huizen, rotsen, bomen): de lijn snijdt de botscirkel. Staat jij of het doel erin, dan telt hij niet.
  const solids = Array.isArray(worldContext.solidColliders) ? worldContext.solidColliders : [];
  for (const solid of solids) {
    if (!solid || solid.enabled === false || solid.flag) continue;
    const r = Number(solid.radius) || 0;
    if (r <= 0 || solid.x + r < minX || solid.x - r > maxX || solid.z + r < minZ || solid.z - r > maxZ) continue;
    const r2 = r * r;
    if ((solid.x - ax) ** 2 + (solid.z - az) ** 2 <= r2 || (solid.x - bx) ** 2 + (solid.z - bz) ** 2 <= r2) continue;
    if (distSqToSegment(solid.x, solid.z, ax, az, bx, bz) < r2) return true;
  }
  const index = worldContext.walkabilityIndex || null;
  if (!index) return false;
  // 2. Dichte randen van loopvlakken (alleen op ongeveer jouw hoogte).
  for (const wall of Array.isArray(index.walls) ? index.walls : []) {
    if (maxX < wall.minX || minX > wall.maxX || maxZ < wall.minZ || minZ > wall.maxZ) continue;
    if (ay !== null && Math.abs(ay - (Number(wall.ay) + Number(wall.by)) / 2) > WALL_HEIGHT_REACH) continue;
    if (crosses(ax, az, bx, bz, wall.ax, wall.az, wall.bx, wall.bz)) return true;
  }
  // Kevin 24-11: muren (Area soort muur) zijn dun (±30 cm); de stapjes van 50 cm hieronder kunnen daar tussendoor.
  // Daarom eerst precies: snijdt de lijn een rand van een muurstuk?
  for (const blocker of Array.isArray(index.blockers) ? index.blockers : []) {
    if (blocker?.reason !== "wall" || !Array.isArray(blocker.points) || blocker.points.length < 3) continue;
    const pts = blocker.points;
    let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    for (const p of pts) { bx0 = Math.min(bx0, p.x); bx1 = Math.max(bx1, p.x); bz0 = Math.min(bz0, p.z); bz1 = Math.max(bz1, p.z); }
    if (maxX < bx0 || minX > bx1 || maxZ < bz0 || minZ > bz1) continue;
    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i]; const q = pts[(i + 1) % pts.length];
      if (crosses(ax, az, bx, bz, p.x, p.z, q.x, q.z)) return true;
    }
  }
  // 3. Blokkades (muren uit de Area tool): stapjes langs de lijn, niet vlak bij jou of het doel.
  const hasBlockers = (Array.isArray(index.blockers) && index.blockers.length) || (Array.isArray(index.surfaceBlockers) && index.surfaceBlockers.length);
  if (!hasBlockers) return false;
  const steps = Math.ceil((length - END_MARGIN_M * 2) / SAMPLE_M);
  for (let i = 0; i <= steps; i += 1) {
    const t = (END_MARGIN_M + Math.min(length - END_MARGIN_M * 2, i * SAMPLE_M)) / length;
    if (isPointBlockedByTerrain(index, ax + (bx - ax) * t, az + (bz - az) * t, 0)) return true;
  }
  return false;
}
