// F3-E2-T01/E3-T07: de actieve canonieke build wordt een laag over de gepubliceerde (legacy) wereld.
// Canonical wint per object-ID; de gepubliceerde wereld zelf wordt niet gewijzigd (we klonen wat we aanraken).
import { colliderToBlocker } from "./world-compiler.js";
import { areaShapeReadModels } from "../publish-service.js";
import { AREA_EDITOR_PREFIX, AREA_RUNTIME_ID_FIELD } from "../../shared/authoring/kinds/area.js";

export const CANONICAL_SPAWN_PREFIX = "canonical.";

function itemIdFromRef(ref) {
  const text = String(ref || "");
  return text.startsWith("item_definition:") ? text.slice("item_definition:".length) : text;
}

// Canonieke itemvelden en de runtime-key waar node03/04/05 ze lezen.
const ITEM_FIELD_TO_RUNTIME = {
  displayName: "displayName",
  category: "category",
  rarity: "rarity",
  stackable: "stackable",
  stackLimit: "stackLimit",
  bindPolicy: "bindPolicy",
  tradable: "tradable",
  questItem: "questItem",
  iconAssetId: "iconAssetId",
  worldModelAssetId: "worldModelAssetId",
  tags: "tags",
  vendorValue: "vendorBaseValueMinor"
};
export const CANONICAL_ITEM_RUNTIME_KEYS = ["id"].concat(Object.values(ITEM_FIELD_TO_RUNTIME));

// Zet een canoniek item om naar de vorm die node03 uit catalogs.items leest. Velden die Canoniek kent
// komen altijd uit Canoniek (leeg = weg). Legacy-velden die Canoniek niet kent blijven bevroren staan.
export function runtimeItemFromCanonical(item, legacy = null) {
  const runtime = Object.assign({}, legacy || {});
  for (const [field, key] of Object.entries(ITEM_FIELD_TO_RUNTIME)) {
    if (item[field] === undefined || item[field] === null || item[field] === "") delete runtime[key];
    else runtime[key] = Array.isArray(item[field]) ? item[field].slice() : item[field];
  }
  runtime.id = item.itemId;
  // Fase 05: uitrusting. Het slot alleen overschrijven als Canoniek er een zet (oude imports houden het legacy-slot).
  if (item.equipSlot) {
    runtime.equipmentSlotRef = item.equipSlot;
    // Uitrusting is altijd een los stuk (anders geen Uitrusten-knop in de tas).
    runtime.stackable = false;
    runtime.stackLimit = 1;
  }
  for (const field of ["attackPowerBonus", "armorBonus"]) {
    if (Number.isInteger(item[field]) && item[field] > 0) runtime[field] = item[field];
    else delete runtime[field];
  }
  // Alleen een helemaal nieuw item krijgt de basisvelden die de legacy-compiler altijd zette.
  if (!legacy) {
    runtime.enabled = true;
    if (!Array.isArray(runtime.tags)) runtime.tags = [];
    if (runtime.vendorBaseValueMinor === undefined) runtime.vendorBaseValueMinor = 0;
  }
  return runtime;
}

// Zet een canonieke pickup om naar een pickup_spawn zoals node03 die verwacht. Een overgenomen legacy-pickup
// houdt zijn spawnEntryId (en dus instance-ID en claimstatus) en zijn overige legacy-velden.
// Ombouw stap 1: in de editor-view wijst een pickup naar zijn document ("doc:<docKey>"), zodat klikken en G
// het document openen en verplaatsen in plaats van een node.
export const EDITOR_DOC_PREFIX = "doc:";

export function runtimeSpawnFromCanonical(pickup, legacySpawn = null, options = {}) {
  const spawn = Object.assign({}, legacySpawn || {}, {
    nodeType: "pickup_spawn",
    spawnEntryId: pickup.legacySpawnEntryId || (CANONICAL_SPAWN_PREFIX + pickup.pickupId),
    pickupKind: "item",
    itemRef: itemIdFromRef(pickup.itemRef),
    amount: pickup.amount,
    x: pickup.x,
    y: pickup.y,
    z: pickup.z,
    zoneRef: pickup.zoneRef
  });
  // Voor item-pickups telt alleen amount; min/max blijven bij een overgenomen pickup zoals ze waren.
  if (!legacySpawn) {
    spawn.minAmount = pickup.amount;
    spawn.maxAmount = pickup.amount;
  }
  if (!legacySpawn || !legacySpawn.zoneRef) delete spawn.zoneRef;
  if (pickup.respawnPolicyRef) spawn.respawnPolicyRef = pickup.respawnPolicyRef;
  else delete spawn.respawnPolicyRef;
  if (options.editor) spawn.nodeId = EDITOR_DOC_PREFIX + "pickup:" + pickup.pickupId;
  return spawn;
}

// Overgenomen legacy-pickups worden op hun eigen plek vervangen (zelfde controller, set en instance-ID).
// Verwijderde (gearchiveerde) overgenomen pickups verdwijnen. Nieuwe pickups komen in een eigen controller.
function withCanonicalPickups(zonePackage, pickups, removedLegacy, options = {}) {
  const zoneId = zonePackage?.zoneId;
  const replaceById = new Map(pickups.filter((pickup) => pickup.legacyZoneId === zoneId && pickup.zoneRef === zoneId && pickup.legacySpawnEntryId)
    .map((pickup) => [pickup.legacySpawnEntryId, pickup]));
  const removeIds = new Set(pickups.filter((pickup) => pickup.legacyZoneId === zoneId && pickup.zoneRef !== zoneId).map((pickup) => pickup.legacySpawnEntryId)
    .concat(removedLegacy.filter((entry) => entry.zoneId === zoneId).map((entry) => entry.spawnEntryId)));
  const added = pickups.filter((pickup) => pickup.zoneRef === zoneId && !replaceById.has(pickup.legacySpawnEntryId));
  if (!replaceById.size && !removeIds.size && !added.length) return zonePackage;
  const controllers = (Array.isArray(zonePackage.spawnControllers) ? zonePackage.spawnControllers : []).map((controller) => {
    if (!replaceById.size && !removeIds.size) return controller;
    return Object.assign({}, controller, {
      spawnSets: (controller.spawnSets || []).map((set) => Object.assign({}, set, {
        spawns: (set.spawns || []).flatMap((spawn) => {
          if (spawn?.nodeType !== "pickup_spawn") return [spawn];
          if (removeIds.has(spawn.spawnEntryId)) return [];
          const replacement = replaceById.get(spawn.spawnEntryId);
          return [replacement ? runtimeSpawnFromCanonical(replacement, spawn, options) : spawn];
        })
      }))
    });
  });
  if (!added.length) return Object.assign({}, zonePackage, { spawnControllers: controllers });
  return Object.assign({}, zonePackage, {
    spawnControllers: controllers.concat([{
      spawnControllerId: "canonical.pickups",
      nodeType: "spawn_controller",
      spawnSets: [{ spawnSetId: "canonical.pickups." + zoneId, spawns: added.map((pickup) => runtimeSpawnFromCanonical(pickup, null, options)) }]
    }])
  });
}

export function applyCanonicalBuild(world, serverBuild, options = {}) {
  if (!world || !serverBuild || !world.gameProject) return world;
  const gameProject = world.gameProject;
  const data = serverBuild.data || serverBuild;
  const legacyItems = gameProject.catalogs?.items || {};
  const items = Object.assign({}, legacyItems);
  for (const item of data.items || []) items[item.itemId] = runtimeItemFromCanonical(item, legacyItems[item.itemId]);
  const pickups = data.pickups || [];
  const zones = gameProject.zones || {};
  const removedLegacy = data.removedLegacyPickups || [];
  const packages = Array.isArray(zones.packages) ? zones.packages.map((pkg) => withCanonicalPickups(pkg, pickups, removedLegacy, options)) : zones.packages;
  const byId = {};
  for (const [zoneId, pkg] of Object.entries(zones.byId || {})) byId[zoneId] = withCanonicalPickups(pkg, pickups, removedLegacy, options);
  const project = data.project
    ? Object.assign({}, gameProject.project || {}, { gameName: data.project.gameName, motd: data.project.motd || "" })
    : gameProject.project;
  const nextProject = Object.assign({}, gameProject, {
    project,
    catalogs: Object.assign({}, gameProject.catalogs || {}, { items }),
    zones: Object.assign({}, zones, { packages, byId }),
    canonicalBuildId: serverBuild.buildId || null
  });
  const next = Object.assign({}, world, { gameProject: nextProject });
  // Fase 04: canonieke obstakels komen bij de gewone blockers. Server-movement en de game (prediction) bouwen hun
  // walkability-index uit precies deze lijst, dus beide botsen op dezelfde plek.
  const colliders = Array.isArray(data.world?.colliders) ? data.world.colliders : [];
  if (colliders.length) {
    const collision = world.collision || {};
    next.collision = Object.assign({}, collision, {
      blockers: (Array.isArray(collision.blockers) ? collision.blockers : []).concat(colliders.map(colliderToBlocker))
    });
  }
  if (world.zonePackage?.zoneId) next.zonePackage = withCanonicalPickups(world.zonePackage, pickups, removedLegacy, options);
  withAreaShapes(next, data, options);
  return next;
}

function uniqueById(list) {
  const seen = new Set();
  return list.filter((entry) => {
    const id = entry?.id;
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// Ombouw stap 2: vlakken uit de Area tool komen in de wereld met hetzelfde tekenwerk als de oude nodes.
// Een verhuisd vlak vervangt zijn oude node-versie; een gearchiveerd verhuisd vlak haalt hem weg.
// In de editor heten ze "doc:area:<areaId>", zodat klikken en het puntengereedschap het document bewerken.
// options.assetService: voor de modellen van begroeiing (zonder: geen objecten, wel het vlak).
function withAreaShapes(next, data, options) {
  const shapes = Array.isArray(data.areaShapes) ? data.areaShapes : [];
  const removed = Array.isArray(data.removedLegacyAreas) ? data.removedLegacyAreas : [];
  if (!shapes.length && !removed.length) return;
  const drop = new Set(removed.concat(shapes.map((shape) => shape.legacy).filter(Boolean)).map((ref) => ref.nodeType + "|" + ref.runtimeId));
  const gone = (nodeType, id) => drop.has(nodeType + "|" + String(id || ""));
  const records = shapes.map((shape) => {
    const id = options.editor ? AREA_EDITOR_PREFIX + shape.areaId : shape.runtimeId;
    return { id, nodeType: shape.nodeType, values: Object.assign({}, shape.values, { [AREA_RUNTIME_ID_FIELD[shape.soort]]: id }) };
  });
  const models = areaShapeReadModels(records, { assetService: options.assetService || null, groundY: Number(next.ground?.y) || 0 });
  const terrain = next.terrain || {};
  const collision = next.collision || {};
  const scatterOf = (id) => String(id || "").split("::")[0];
  next.terrain = Object.assign({}, terrain, {
    surfaces: uniqueById(models.surfaces.concat((terrain.surfaces || []).filter((surface) => !gone("surface_layer", surface.id))))
  });
  next.collision = Object.assign({}, collision, {
    blockers: uniqueById(models.blockers.concat((collision.blockers || []).filter((blocker) => !gone("blocker_area", blocker.id)
      && !(String(blocker.id || "").endsWith("::boundary") && gone("bounded_area_scatter", scatterOf(blocker.id)))))),
    walkableSurfaces: uniqueById(models.walkableSurfaces.concat((collision.walkableSurfaces || []).filter((surface) => !gone("walkable_surface", surface.id))))
  });
  next.scatterAreas = uniqueById(models.scatterAreas.concat((next.scatterAreas || []).filter((area) => !gone("bounded_area_scatter", area.id))));
  next.entities = uniqueById(models.entities.concat((next.entities || []).filter((entity) => !(entity?.type === "scatter" && gone("bounded_area_scatter", scatterOf(entity.id))))));
  if (models.assets.length) next.assets = uniqueById((next.assets || []).concat(models.assets));
}

export function knownZoneIds(world) {
  const zones = world?.gameProject?.zones || {};
  const ids = new Set(Object.keys(zones.byId || {}));
  for (const pkg of Array.isArray(zones.packages) ? zones.packages : []) if (pkg?.zoneId) ids.add(pkg.zoneId);
  return Array.from(ids);
}

// Zones voor de pickupkiezer in de Werkbank (alleen ID, naam en grenzen).
export function zoneSummaries(world) {
  const zones = world?.gameProject?.zones || {};
  const list = Array.isArray(zones.packages) && zones.packages.length ? zones.packages : Object.values(zones.byId || {});
  return list.filter((pkg) => pkg?.zoneId).map((pkg) => ({
    zoneId: pkg.zoneId,
    label: pkg.zone?.displayName || pkg.zone?.label || pkg.zoneId,
    bounds: pkg.zone?.bounds || null
  }));
}

export function respawnPolicySummaries(world) {
  const policies = world?.gameProject?.catalogs?.respawnPolicies || {};
  return Object.entries(policies).map(([id, policy]) => ({ id, label: policy?.displayName || id })).sort((a, b) => a.id.localeCompare(b.id));
}

// Fase 05: uitrustingsslots uit de gepubliceerde catalogus (de editor kiest er een; publish controleert).
export function equipmentSlotSummaries(world) {
  const slots = world?.gameProject?.catalogs?.equipmentSlots || {};
  return Object.entries(slots).map(([id, slot]) => ({ id, label: slot?.displayName || id })).sort((a, b) => a.id.localeCompare(b.id));
}

export function knownEquipmentSlotIds(world) {
  return Object.keys(world?.gameProject?.catalogs?.equipmentSlots || {});
}

export function knownRespawnPolicyIds(world) {
  return Object.keys(world?.gameProject?.catalogs?.respawnPolicies || {});
}

// "pickups:<zoneId>:<spawnEntryId>" -> { zoneId, spawnEntryId }
export function parsePickupLegacyRef(legacyRef) {
  const text = String(legacyRef || "");
  if (!text.startsWith("pickups:")) return null;
  const rest = text.slice("pickups:".length);
  const index = rest.indexOf(":");
  if (index <= 0) return null;
  return { zoneId: rest.slice(0, index), spawnEntryId: rest.slice(index + 1) };
}
