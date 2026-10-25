// Fase 04 (F4-E1-T02 + F4-E2-T01): ruimteregels voor Regions/Areas en de compile naar een wereldsectie met Cells.
// Dezelfde regels draaien bij elk command (blokkeert meteen) en bij publish (vangnet voor oude data).
import {
  CELL_SIZE_MM, areaBoundsMm, cellKeysForRect, rectInside, rectsOverlap
} from "../../../apps/web/public/shared/spatial.js";
import { splitByAudience } from "../../shared/authoring/kinds.js";

export const WORLD_SECTION_VERSION = "gk-world-1";

const regionIdFromRef = (ref) => String(ref || "").replace(/^region:/, "");

// docs: actieve documenten (alle kinds mogen erin zitten). Geeft een lijst { code, docKey, otherDocKey?, message }.
export function spatialIssues(docs) {
  const regions = docs.filter((doc) => doc.kind === "region" && !doc.archived);
  // Areas en obstakels (colliders) moeten allebei helemaal binnen hun Region liggen.
  const areas = docs.filter((doc) => (doc.kind === "area" || doc.kind === "collider") && !doc.archived);
  const issues = [];
  for (let i = 0; i < regions.length; i += 1) {
    for (let k = i + 1; k < regions.length; k += 1) {
      if (rectsOverlap(regions[i].body, regions[k].body)) {
        issues.push({
          code: "REGION_OVERLAP", docKey: regions[i].docKey, otherDocKey: regions[k].docKey,
          message: "Region " + regions[i].body.displayName + " overlapt met " + regions[k].body.displayName + ". Regions mogen elkaar alleen raken."
        });
      }
    }
  }
  const regionByKey = new Map(regions.map((doc) => [doc.docKey, doc]));
  for (const area of areas) {
    const region = regionByKey.get(area.body.regionRef);
    if (!region) {
      issues.push({ code: "AREA_REGION_MISSING", docKey: area.docKey, otherDocKey: area.body.regionRef, message: (area.kind === "collider" ? "Obstakel " : "Area ") + area.body.displayName + " hoort bij een Region die niet (meer) bestaat." });
      continue;
    }
    if (!rectInside(areaBoundsMm(area.body), region.body)) {
      issues.push({ code: "AREA_OUTSIDE_REGION", docKey: area.docKey, otherDocKey: region.docKey, message: (area.kind === "collider" ? "Obstakel " : "Area ") + area.body.displayName + " valt (deels) buiten Region " + region.body.displayName + "." });
    }
  }
  return issues;
}

// Issues die over één document gaan (als dat document zelf of als "other").
export function spatialIssuesFor(docKey, docs) {
  return spatialIssues(docs).filter((issue) => issue.docKey === docKey || issue.otherDocKey === docKey);
}

function sortedUnique(list) {
  return Array.from(new Set(list)).sort();
}

// Pure compile. options.assetTypes: Map id -> type; options.assetPaths: Map id -> URL (voor muziek).
// Geeft { client, server, errors } of null als er geen Regions/Areas zijn (dan blijft een F3-build bytegelijk).
// Obstakel (mm, build) -> blocker zoals movement-kernel.js hem leest (meters). Eén functie voor server en game.
export function colliderToBlocker(collider) {
  const meters = (mm) => mm / 1000;
  const base = { id: "canonical." + collider.colliderId, reason: "canonical_collider" };
  if (collider.shape === "box") {
    return Object.assign(base, {
      shapeType: "box",
      x: meters((collider.minXMm + collider.maxXMm) / 2), z: meters((collider.minZMm + collider.maxZMm) / 2),
      width: meters(collider.maxXMm - collider.minXMm), depth: meters(collider.maxZMm - collider.minZMm)
    });
  }
  if (collider.shape === "cylinder") {
    return Object.assign(base, { shapeType: "circle", x: meters(collider.centerXMm), z: meters(collider.centerZMm), radius: meters(collider.radiusMm) });
  }
  return Object.assign(base, { shapeType: "polygon", points: collider.pointsMm.map((point) => ({ x: meters(point[0]), z: meters(point[1]) })) });
}

export function compileWorldSection(documents, options = {}) {
  const active = documents.filter((doc) => !doc.archived && (doc.kind === "region" || doc.kind === "area" || doc.kind === "collider"))
    .sort((a, b) => a.docKey.localeCompare(b.docKey));
  if (!active.length) return null;
  const errors = spatialIssues(active).map((issue) => ({ code: issue.code, docKey: issue.docKey, message: issue.message }));
  const assetTypes = options.assetTypes || null;
  const assetPaths = options.assetPaths || null;
  const audio = {};
  for (const doc of active) {
    const assetId = doc.body.musicAssetId;
    if (!assetId) continue;
    if (assetTypes && !assetTypes.has(assetId)) errors.push({ code: "ASSET_UNKNOWN", docKey: doc.docKey, message: doc.body.displayName + " gebruikt onbekend muziekasset " + assetId });
    else if (assetTypes && assetTypes.get(assetId) !== "audio") errors.push({ code: "ASSET_TYPE", docKey: doc.docKey, message: doc.body.displayName + ": " + assetId + " is geen audio" });
    else if (assetPaths && assetPaths.has(assetId)) audio[assetId] = assetPaths.get(assetId);
  }
  const cells = {};
  const addToCells = (rect, listName, id, docKey) => {
    const keys = cellKeysForRect(rect);
    if (!keys) { errors.push({ code: "SHAPE_TOO_LARGE", docKey, message: "Vorm " + id + " beslaat te veel Cells (max 4096 = 16 km x 16 km)." }); return; }
    for (const key of keys) {
      if (!cells[key]) cells[key] = { regions: [], areas: [], colliders: [] };
      cells[key][listName].push(id);
    }
  };
  const regions = { client: [], server: [] };
  const areas = { client: [], server: [] };
  const colliders = { client: [], server: [] };
  for (const doc of active) {
    const split = splitByAudience(doc.kind, doc.body);
    if (doc.kind === "region") {
      regions.client.push(split.client);
      regions.server.push(split.server);
      addToCells(doc.body, "regions", doc.body.regionId, doc.docKey);
    } else {
      const regionId = regionIdFromRef(doc.body.regionRef);
      const toRuntime = (data) => { const next = Object.assign({}, data, { regionId }); delete next.regionRef; return next; };
      const target = doc.kind === "collider" ? colliders : areas;
      target.client.push(toRuntime(split.client));
      target.server.push(toRuntime(split.server));
      addToCells(areaBoundsMm(doc.body), doc.kind === "collider" ? "colliders" : "areas", doc.body.colliderId || doc.body.areaId, doc.docKey);
    }
  }
  const sortedCells = {};
  for (const key of Object.keys(cells).sort()) {
    const cell = { regions: sortedUnique(cells[key].regions), areas: sortedUnique(cells[key].areas) };
    // Alleen een colliders-lijst als er obstakels zijn, zodat builds zonder obstakels gelijk blijven.
    if (cells[key].colliders.length) cell.colliders = sortedUnique(cells[key].colliders);
    sortedCells[key] = cell;
  }
  const base = { schema: WORLD_SECTION_VERSION, unit: "mm", cellSizeMm: CELL_SIZE_MM, cells: sortedCells, audio };
  return {
    client: Object.assign({}, base, { regions: regions.client, areas: areas.client }, colliders.client.length ? { colliders: colliders.client } : {}),
    server: Object.assign({}, base, { regions: regions.server, areas: areas.server }, colliders.server.length ? { colliders: colliders.server } : {}),
    errors
  };
}
