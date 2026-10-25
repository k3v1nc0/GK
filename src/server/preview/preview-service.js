// Fase 04 (F4-E3-T01, eerste stuk): 2D-preview van de draft. Compileert de huidige documenten in het geheugen
// (dezelfde compiler als publish) en laat zien welke Region/Area de server voor een punt kiest.
// Schrijft niets: geen build op schijf, geen releasepointer, geen player-, quest- of economy-rij.
// De volledige 3D-PlayPreview (eigen server-instance met default-deny persistence) volgt later.
import { compileCanonical } from "../authoring/build-service.js";
import { createSpatialIndex, metersToMm, resolveMembership } from "../../../apps/web/public/shared/spatial.js";

const MAX_POINTS = 64;

function cleanPoint(point) {
  const x = Number(point?.x);
  const z = Number(point?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 100000 || Math.abs(z) > 100000) return null;
  return { x, z };
}

// points: [{ x, z }] in meters (zoals de game). previous: { regionId, areaId } van de vorige stap (hysteresis).
export function previewMembership(documents, points, options = {}) {
  const list = Array.isArray(points) ? points.slice(0, MAX_POINTS).map(cleanPoint) : [];
  if (!list.length || list.some((point) => !point)) {
    const error = new Error("Geef 1 tot " + MAX_POINTS + " punten met x en z (meters).");
    error.status = 400;
    error.code = "PREVIEW_POINTS_INVALID";
    throw error;
  }
  const compiled = compileCanonical(documents, options);
  const world = JSON.parse(compiled.files["server.json"].text).world || null;
  const index = world ? createSpatialIndex(world) : null;
  let previous = options.previous && typeof options.previous === "object"
    ? { regionId: options.previous.regionId || null, areaId: options.previous.areaId || null }
    : null;
  const results = list.map((point) => {
    if (!index) return { x: point.x, z: point.z, regionId: null, areaId: null, cellKey: null };
    const membership = resolveMembership(index, metersToMm(point.x), metersToMm(point.z), previous);
    previous = membership;
    const region = membership.regionId ? index.regions.get(membership.regionId) : null;
    const area = membership.areaId ? index.areas.get(membership.areaId) : null;
    const musicAssetId = area?.musicAssetId || region?.musicAssetId || null;
    return {
      x: point.x, z: point.z, cellKey: membership.cellKey,
      regionId: membership.regionId, regionName: region?.displayName || null,
      areaId: membership.areaId, areaName: area?.displayName || null,
      musicAssetId, musicUrl: musicAssetId ? (world.audio?.[musicAssetId] || null) : null
    };
  });
  return { ok: true, draft: true, draftBuildId: compiled.buildId, errors: compiled.errors, results };
}
