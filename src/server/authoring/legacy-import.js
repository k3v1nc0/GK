// F3-E3-T01 + F3-E2-T01: overzetten per domein van Nodes (legacy) naar Canoniek.
//
// 1. inventory  - wat staat er in de huidige graphwereld per domein.
// 2. plan       - dry-run: welke documenten er komen, wat blokkeert, en een parityrapport. Schrijft niets.
// 3. finalize   - in één transactie: graphrevision controleren, documenten aanmaken, domein op 'canonical'.
//
// Parity is een golden-master vergelijking per consumer: de runtimevorm die node03 uit de legacy-wereld
// haalt moet gelijk zijn aan die uit (legacy-wereld + canonieke laag). Afwijkingen blokkeren, tenzij Kevin
// ze expliciet accepteert; dat besluit wordt bewaard.
import { docKeyFor, validateDocument } from "../../shared/authoring/kinds.js";
import { Node03RuntimeService } from "../node03-runtime-service.js";
import { compileCanonical } from "./build-service.js";
import { applyCanonicalBuild, CANONICAL_ITEM_RUNTIME_KEYS } from "./runtime-overlay.js";
import { authoringError, stableStringify } from "./stable-json.js";
import { AREA_SETTING_SPECS, AREA_SOORTEN, areaPointsMm } from "../../shared/authoring/kinds/area.js";

export const CUTOVER_DOMAINS = ["project", "items", "pickups", "areas"];
const DOMAIN_KIND = { project: "project_settings", items: "item_definition", pickups: "pickup", areas: "area" };

// Ombouw stap 2: welke oude nodes de Area tool overneemt, en welk veld hun ID in de wereld is.
const AREA_NODE_SOORT = { bounded_area_scatter: "begroeiing", surface_layer: "pad", blocker_area: "blokkade", walkable_surface: "loopvlak" };
export const AREA_NODE_TYPES = Object.keys(AREA_NODE_SOORT);
const areaRuntimeIdOf = (node) => String(node.type === "bounded_area_scatter" ? node.id : (node.type === "blocker_area" ? node.values?.blockerId : node.values?.surfaceId) || node.id);

function canonicalId(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9_.]+/g, "_").replace(/\.{2,}/g, ".").replace(/^[^a-z]+/, "").replace(/[._]+$/, "").slice(0, 120);
}

function zonePackages(world) {
  const zones = world?.gameProject?.zones || {};
  const list = Array.isArray(zones.packages) && zones.packages.length ? zones.packages : Object.values(zones.byId || {});
  return list.filter((pkg) => pkg?.zoneId);
}

function forEachPickupSpawn(world, callback) {
  for (const pkg of zonePackages(world)) {
    for (const controller of pkg.spawnControllers || []) {
      for (const set of controller?.spawnSets || []) {
        for (const spawn of set?.spawns || []) {
          if (spawn?.nodeType === "pickup_spawn") callback({ pkg, controller, set, spawn });
        }
      }
    }
  }
}

export function legacyInventory(world) {
  const counts = { itemPickups: 0, currencyPickups: 0, pickupComponents: 0 };
  forEachPickupSpawn(world, ({ spawn }) => {
    if ((spawn.pickupKind || "item") === "item") counts.itemPickups += 1; else counts.currencyPickups += 1;
  });
  for (const pkg of zonePackages(world)) {
    for (const entity of pkg.entities || []) {
      if ((entity?.components || []).some((component) => component?.nodeType === "pickup_component")) counts.pickupComponents += 1;
    }
  }
  return {
    project: { gameName: world?.gameProject?.project?.gameName || null },
    items: Object.keys(world?.gameProject?.catalogs?.items || {}).length,
    pickups: counts,
    areas: (world?.terrain?.surfaces || []).length + (world?.collision?.walkableSurfaces || []).length + (world?.scatterAreas || []).length
      + (world?.collision?.blockers || []).filter((blocker) => !String(blocker?.id || "").includes("::") && blocker?.reason !== "canonical_collider").length
  };
}

// Een rechthoek (midden, maat, draaiing in graden) als 4 punten.
function rectanglePoints(x, z, width, depth, rotationDeg, y) {
  const rad = (Number(rotationDeg) || 0) * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
    const ox = sx * (Number(width) || 0) / 2;
    const oz = sz * (Number(depth) || 0) / 2;
    const point = { x: (Number(x) || 0) + ox * cos - oz * sin, z: (Number(z) || 0) + ox * sin + oz * cos };
    if (y !== undefined) point.y = y;
    return point;
  });
}

// De punten van een oude node; zonder punten de vorm die de node zelf beschreef.
function legacyAreaPoints(node) {
  const values = node.values || {};
  const points = (Array.isArray(values.points) ? values.points : []).filter((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.z)));
  const soort = AREA_NODE_SOORT[node.type];
  if (points.length >= AREA_SOORTEN[soort].minPoints) return points;
  if (node.type === "bounded_area_scatter") return rectanglePoints(values.areaCenterX, values.areaCenterZ, values.areaWidth, values.areaDepth, values.areaRotationY);
  if (node.type === "walkable_surface") return rectanglePoints(values.x, values.z, values.width, values.depth, values.rotationY, Number(values.y) || 0);
  if (node.type === "blocker_area" && values.shapeType === "circle") {
    const radius = Number(values.radius) || 1;
    return Array.from({ length: 16 }, (_, index) => ({ x: (Number(values.x) || 0) + radius * Math.cos(index * Math.PI / 8), z: (Number(values.z) || 0) + radius * Math.sin(index * Math.PI / 8) }));
  }
  if (node.type === "blocker_area") return rectanglePoints(values.x, values.z, values.width, values.depth, 0);
  return points;
}

// Alleen instellingen die afwijken van de standaard gaan mee (de build vult de standaard zelf aan).
function legacyAreaSettings(soort, values) {
  const specs = AREA_SETTING_SPECS[soort].fields;
  const settings = {};
  for (const [key, spec] of Object.entries(specs)) {
    const value = values?.[key];
    if (value === undefined || value === null) continue;
    if (stableStringify(value) === stableStringify(spec.default)) continue;
    settings[key] = JSON.parse(JSON.stringify(value));
  }
  return Object.keys(settings).length ? settings : undefined;
}

function worldAreaIds(world) {
  return {
    surface_layer: new Set((world?.terrain?.surfaces || []).map((entry) => String(entry.id))),
    blocker_area: new Set((world?.collision?.blockers || []).map((entry) => String(entry.id))),
    walkable_surface: new Set((world?.collision?.walkableSurfaces || []).map((entry) => String(entry.id))),
    bounded_area_scatter: new Set((world?.scatterAreas || []).map((entry) => String(entry.id)))
  };
}

// Elke oude vlak-node wordt een document. Wat niet in de wereld staat (niet aangesloten) komt gearchiveerd mee,
// zodat er niets verloren gaat.
function plannedAreaDocuments(world, graph, blocking) {
  const docs = [];
  const inWorld = worldAreaIds(world);
  const usedIds = new Set();
  const usedRefs = new Set();
  for (const node of (graph?.nodes || []).filter((entry) => AREA_NODE_SOORT[entry.type]).sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const soort = AREA_NODE_SOORT[node.type];
    const runtimeId = areaRuntimeIdOf(node);
    const legacyRef = "areas:" + node.type + ":" + runtimeId;
    let areaId = canonicalId(soort + "." + runtimeId) || soort + ".vlak";
    while (usedIds.has(areaId)) areaId += "_2";
    usedIds.add(areaId);
    const points = legacyAreaPoints(node);
    const body = {
      areaId,
      displayName: String(node.values?.label || node.values?.scatterId || node.title || runtimeId).slice(0, 80) || areaId,
      soort,
      shape: "polygon",
      pointsMm: areaPointsMm(points, soort === "loopvlak")
    };
    const settings = legacyAreaSettings(soort, node.values);
    if (settings) body.settings = settings;
    const validation = validateDocument("area", body);
    if (!validation.ok) { blocking.push({ legacyRef, reason: (body.displayName) + ": " + validation.issues.map((entry) => entry.message).join(" ") }); continue; }
    // Twee nodes met dezelfde ID: de wereld toont alleen de eerste; de tweede komt gearchiveerd mee.
    const archived = !inWorld[node.type].has(runtimeId) || usedRefs.has(legacyRef);
    usedRefs.add(legacyRef);
    docs.push({ kind: "area", legacyRef, body, archived });
  }
  return docs;
}

function itemBodyFromLegacy(itemId, legacy) {
  const body = {
    itemId,
    displayName: String(legacy.displayName || itemId).slice(0, 80),
    category: legacy.category,
    rarity: legacy.rarity,
    stackable: legacy.stackable !== false,
    stackLimit: Number.isInteger(legacy.stackLimit) && legacy.stackLimit >= 1 ? legacy.stackLimit : 1
  };
  if (legacy.bindPolicy) body.bindPolicy = legacy.bindPolicy;
  if (typeof legacy.tradable === "boolean") body.tradable = legacy.tradable;
  if (typeof legacy.questItem === "boolean") body.questItem = legacy.questItem;
  if (legacy.iconAssetId) body.iconAssetId = String(legacy.iconAssetId);
  if (legacy.worldModelAssetId) body.worldModelAssetId = String(legacy.worldModelAssetId);
  if (Array.isArray(legacy.tags)) body.tags = legacy.tags.slice();
  if (Number.isInteger(legacy.vendorBaseValueMinor) && legacy.vendorBaseValueMinor >= 0) body.vendorValue = legacy.vendorBaseValueMinor;
  // Fase 05: een legacy-uitrustingsslot gaat mee (alleen voor niet-stapelbare items, zoals de regel vraagt).
  if (legacy.stackable === false && typeof legacy.equipmentSlotRef === "string" && /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/.test(legacy.equipmentSlotRef)) body.equipSlot = legacy.equipmentSlotRef;
  return body;
}

function plannedDocuments(world, domain, blocking, context = {}) {
  const docs = [];
  if (domain === "areas") docs.push(...plannedAreaDocuments(world, context.graph, blocking));
  if (domain === "project") {
    const project = world?.gameProject?.project || {};
    if (!project.gameName) blocking.push({ legacyRef: "project", reason: "De graph heeft geen gameName om over te nemen." });
    else docs.push({ kind: "project_settings", legacyRef: "project:" + (project.id || "default"), body: { gameName: String(project.gameName).slice(0, 80) } });
  }
  if (domain === "items") {
    const items = world?.gameProject?.catalogs?.items || {};
    for (const itemId of Object.keys(items).sort()) {
      const legacyRef = "items:" + itemId;
      if (canonicalId(itemId) !== itemId) { blocking.push({ legacyRef, reason: "Item-ID '" + itemId + "' past niet in het canonieke ID-formaat (a-z, 0-9, _ en .)." }); continue; }
      const body = itemBodyFromLegacy(itemId, items[itemId] || {});
      const validation = validateDocument("item_definition", body);
      if (!validation.ok) { blocking.push({ legacyRef, reason: validation.issues.map((entry) => entry.message).join(" ") }); continue; }
      docs.push({ kind: "item_definition", legacyRef, body });
    }
  }
  if (domain === "pickups") {
    const usedIds = new Set();
    forEachPickupSpawn(world, ({ pkg, spawn }) => {
      if ((spawn.pickupKind || "item") !== "item") return;
      const spawnEntryId = String(spawn.spawnEntryId || spawn.nodeId || "");
      const legacyRef = "pickups:" + pkg.zoneId + ":" + spawnEntryId;
      if (!spawnEntryId) { blocking.push({ legacyRef, reason: "Pickup zonder spawnEntryId kan niet worden overgenomen." }); return; }
      let pickupId = canonicalId("legacy." + spawnEntryId) || "legacy.pickup";
      while (usedIds.has(pickupId)) pickupId += "_2";
      usedIds.add(pickupId);
      const body = {
        pickupId,
        itemRef: "item_definition:" + String(spawn.itemRef || ""),
        zoneRef: pkg.zoneId,
        x: Number(spawn.x) || 0,
        y: Number(spawn.y) || 0,
        z: Number(spawn.z) || 0,
        amount: Math.max(1, Math.floor(Number(spawn.amount || spawn.minAmount) || 1))
      };
      if (spawn.respawnPolicyRef) body.respawnPolicyRef = String(spawn.respawnPolicyRef);
      const validation = validateDocument("pickup", body);
      if (!spawn.itemRef) blocking.push({ legacyRef, reason: "Pickup zonder item." });
      else if (!validation.ok) blocking.push({ legacyRef, reason: validation.issues.map((entry) => entry.message).join(" ") });
      else docs.push({ kind: "pickup", legacyRef, body });
    });
  }
  return docs.map((doc) => Object.assign(doc, { docKey: docKeyFor(doc.kind, doc.body) }));
}

function diffObjects(legacy, canonical, ignore = []) {
  const keys = Array.from(new Set(Object.keys(legacy || {}).concat(Object.keys(canonical || {})))).filter((key) => !ignore.includes(key)).sort();
  return keys.filter((key) => stableStringify(legacy?.[key] ?? null) !== stableStringify(canonical?.[key] ?? null))
    .map((key) => ({ key, legacy: legacy?.[key] ?? null, canonical: canonical?.[key] ?? null }));
}

// Runtimevorm van alle pickup_spawns zoals node03 ze uitrekent, per instance-ID.
function pickupRuntimeStates(world) {
  const states = new Map();
  const catalogs = world?.gameProject?.catalogs || {};
  forEachPickupSpawn(world, ({ pkg, controller, set, spawn }) => {
    const state = Node03RuntimeService.prototype.desiredPickupForSpawn.call({}, { zoneId: pkg.zoneId, catalogs }, controller, set, spawn);
    delete state.updatedAt;
    states.set(state.instanceId, state);
  });
  return states;
}

// Afronden op 1 mm: een verhuisd vlak bewaart zijn punten in hele mm.
function roundedForParity(value) {
  if (typeof value === "number") return Math.round(value * 1000) / 1000;
  if (Array.isArray(value)) return value.map(roundedForParity);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, roundedForParity(entry)]));
  return value;
}

// Verschil tussen oude en nieuwe vorm van een vlak, zonder wat niets uitmaakt in de game:
// - getallen tot 1 cm (punten worden in hele mm bewaard; midden/maat schuiven dan een fractie);
// - scatterId/reason zijn alleen namen (labels), geen gedrag;
// - radius doet niets bij een vorm uit punten.
const AREA_PARITY_TOLERANCE = 0.01;
function sameForParity(left, right) {
  if (typeof left === "number" && typeof right === "number") return Math.abs(left - right) <= AREA_PARITY_TOLERANCE;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((entry, index) => sameForParity(entry, right[index]));
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = new Set(Object.keys(left).concat(Object.keys(right)));
    return Array.from(keys).every((key) => sameForParity(left[key] ?? null, right[key] ?? null));
  }
  return stableStringify(left ?? null) === stableStringify(right ?? null);
}

function areaDiffs(legacy, canonical) {
  const ignore = new Set(["scatterId", "reason"]);
  if (legacy.shapeType === "polygon" && canonical.shapeType === "polygon") ignore.add("radius");
  const keys = Array.from(new Set(Object.keys(legacy).concat(Object.keys(canonical)))).filter((key) => !ignore.has(key)).sort();
  return keys.filter((key) => !sameForParity(legacy[key] ?? null, canonical[key] ?? null))
    .map((key) => ({ key, legacy: legacy[key] ?? null, canonical: canonical[key] ?? null }));
}

function areaWorldEntries(world) {
  const entries = new Map();
  const add = (group, list) => { for (const entry of list || []) if (entry?.id) entries.set(group + ":" + entry.id, roundedForParity(entry)); };
  add("surface", world?.terrain?.surfaces);
  add("blocker", (world?.collision?.blockers || []).filter((blocker) => blocker?.reason !== "canonical_collider"));
  add("walkable", world?.collision?.walkableSurfaces);
  add("scatter", world?.scatterAreas);
  add("scatterEntity", (world?.entities || []).filter((entity) => entity?.type === "scatter"));
  return entries;
}

function parityReport(world, domain, finalDocs, context = {}) {
  const compiled = compileCanonical(finalDocs);
  const overlaid = applyCanonicalBuild(world, { buildId: "parity", data: JSON.parse(compiled.files["server.json"].text) }, { assetService: context.assetService || null });
  const parity = [];
  if (domain === "project") {
    const before = world?.gameProject?.project || {};
    const after = overlaid.gameProject.project || {};
    parity.push({ legacyRef: "project", diffs: diffObjects({ gameName: before.gameName }, { gameName: after.gameName }) });
  }
  if (domain === "items") {
    const before = world?.gameProject?.catalogs?.items || {};
    const after = overlaid.gameProject.catalogs.items || {};
    for (const itemId of Object.keys(before).sort()) {
      parity.push({
        legacyRef: "items:" + itemId,
        // Ronde 10: de grootte op de grond is bewust nieuw (100 % i.p.v. de oude vaste 45 %), dus geen afwijking.
        diffs: diffObjects(before[itemId], after[itemId], ["worldModelScale"]),
        frozenLegacyKeys: Object.keys(before[itemId] || {}).filter((key) => !CANONICAL_ITEM_RUNTIME_KEYS.includes(key)).sort()
      });
    }
  }
  if (domain === "pickups") {
    const before = pickupRuntimeStates(world);
    const after = pickupRuntimeStates(overlaid);
    for (const [instanceId, state] of before) {
      if (state.pickupKind !== "item") continue;
      parity.push({ legacyRef: "pickups:" + state.zoneId + ":" + state.spawnEntryId, instanceId, diffs: after.has(instanceId) ? diffObjects(state, after.get(instanceId), ["modelScale"]) : [{ key: "instance", legacy: instanceId, canonical: null }] });
    }
    for (const [instanceId, state] of after) {
      if (!before.has(instanceId) && String(state.spawnEntryId || "").startsWith("canonical.legacy.")) parity.push({ legacyRef: instanceId, instanceId, diffs: [{ key: "instance", legacy: null, canonical: instanceId }] });
    }
  }
  if (domain === "areas") {
    const before = areaWorldEntries(world);
    const after = areaWorldEntries(overlaid);
    for (const key of Array.from(new Set(Array.from(before.keys()).concat(Array.from(after.keys())))).sort()) {
      const legacy = before.get(key) ?? null;
      const canonical = after.get(key) ?? null;
      if (key.startsWith("scatterEntity:") && legacy && canonical && !areaDiffs(legacy, canonical).length) continue;
      parity.push({ legacyRef: key, diffs: legacy && canonical ? areaDiffs(legacy, canonical) : [{ key: "object", legacy: legacy ? key : null, canonical: canonical ? key : null }] });
    }
  }
  return compiled.errors.length
    ? parity.concat(compiled.errors.map((error) => ({ legacyRef: error.docKey, diffs: [{ key: error.code, legacy: null, canonical: error.message }] })))
    : parity;
}

// Dry-run. existingDocs = alle canonieke documenten die er nu al zijn.
export function planDomain(world, domain, existingDocs, cutoverRows = {}, context = {}) {
  if (!CUTOVER_DOMAINS.includes(domain)) throw authoringError(400, "DOMAIN_UNKNOWN", "Onbekend domein: " + domain);
  const blocking = [];
  if (!world?.gameProject) blocking.push({ legacyRef: domain, reason: "De graph heeft geen gecompileerd gameProject. Los eerst de validatiefouten in Nodes op." });
  if (domain === "pickups" && cutoverRows.items?.writer !== "canonical") blocking.push({ legacyRef: "pickups", reason: "Zet eerst Items over: pickups verwijzen naar canonieke items." });
  if (domain === "areas" && !context.graph) blocking.push({ legacyRef: "areas", reason: "De graph is niet leesbaar; vlakken kunnen niet verhuizen." });
  const planned = world?.gameProject ? plannedDocuments(world, domain, blocking, context) : [];
  const existing = new Map(existingDocs.map((doc) => [doc.docKey, doc]));
  const create = [];
  const keep = [];
  for (const doc of planned) {
    const current = existing.get(doc.docKey);
    if (!current) { create.push(doc); continue; }
    if (current.legacyRef && current.legacyRef !== doc.legacyRef) blocking.push({ legacyRef: doc.legacyRef, reason: doc.docKey + " bestaat al voor " + current.legacyRef + "." });
    keep.push({ docKey: doc.docKey, legacyRef: doc.legacyRef, note: "bestaat al in Canoniek; de canonieke versie blijft leidend" });
  }
  if (domain === "pickups") {
    const itemKeys = new Set(existingDocs.filter((doc) => doc.kind === "item_definition" && !doc.archived).map((doc) => doc.docKey));
    for (const doc of create) if (!itemKeys.has(doc.body.itemRef)) blocking.push({ legacyRef: doc.legacyRef, reason: "Item " + doc.body.itemRef + " bestaat niet (actief) in Canoniek." });
  }
  const finalDocs = existingDocs.concat(create.map((doc) => ({ docKey: doc.docKey, kind: doc.kind, body: doc.body, legacyRef: doc.legacyRef, archived: doc.archived === true, revision: 1 })));
  const parity = world?.gameProject && !blocking.length ? parityReport(world, domain, finalDocs, context) : [];
  const diffCount = parity.filter((entry) => entry.diffs.length > 0).length;
  return {
    domain,
    kind: DOMAIN_KIND[domain],
    writer: cutoverRows[domain]?.writer || "legacy",
    ok: blocking.length === 0 && diffCount === 0,
    create: create.map((doc) => ({ docKey: doc.docKey, legacyRef: doc.legacyRef, body: doc.body, archived: doc.archived === true })),
    keep,
    blocking,
    parity,
    comparedObjects: parity.length,
    diffCount
  };
}

export function cutoverRows(db) {
  const rows = {};
  for (const row of db.prepare("SELECT * FROM authoring_cutover").all()) {
    rows[row.domain] = { domain: row.domain, writer: row.writer, graphRevision: row.graph_revision, decidedBy: row.decided_by, decidedAt: row.decided_at };
  }
  return rows;
}

// Finaliseert een domein. world moet gebouwd zijn uit de graph op expectedGraphRevision.
export function finalizeDomain(db, { world, domain, expectedGraphRevision, worldGraphRevision, acceptDiffs = false, existingDocs, actor, context = {} }) {
  const rows = cutoverRows(db);
  if (rows[domain]?.writer === "canonical") throw authoringError(409, "ALREADY_CANONICAL", "Dit domein is al overgezet.");
  if (!Number.isInteger(expectedGraphRevision)) throw authoringError(428, "IF_MATCH_REQUIRED", "If-Match (graphrevisie) is verplicht.");
  if (worldGraphRevision !== expectedGraphRevision) throw authoringError(409, "GRAPH_REVISION_CHANGED", "De graph is intussen gewijzigd. Bekijk het rapport opnieuw.");
  const plan = planDomain(world, domain, existingDocs, rows, context);
  if (plan.blocking.length) throw authoringError(409, "CUTOVER_BLOCKED", plan.blocking[0].reason, { blocking: plan.blocking });
  if (plan.diffCount > 0 && acceptDiffs !== true) throw authoringError(409, "PARITY_DIFF", plan.diffCount + " objecten wijken af. Bekijk het rapport en accepteer expliciet, of los het op in Nodes.", { diffCount: plan.diffCount });
  const stamp = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const meta = db.prepare("SELECT graph_revision FROM editor_graph_meta WHERE id = 1").get();
    if (Number(meta?.graph_revision || 0) !== expectedGraphRevision) throw authoringError(409, "GRAPH_REVISION_CHANGED", "De graph is intussen gewijzigd. Bekijk het rapport opnieuw.");
    const insert = db.prepare(`
      INSERT INTO authoring_documents (doc_key, kind, revision, body_json, archived, legacy_ref, created_at, updated_at, updated_by)
      VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
    `);
    const insertRef = db.prepare("INSERT OR IGNORE INTO authoring_refs (from_doc_key, to_doc_key) VALUES (?, ?)");
    for (const doc of plan.create) {
      insert.run(doc.docKey, plan.kind, JSON.stringify(doc.body), doc.archived ? 1 : 0, doc.legacyRef, stamp, stamp, actor || null);
      for (const ref of validateDocument(plan.kind, doc.body).refs) insertRef.run(doc.docKey, ref);
    }
    const report = { createdCount: plan.create.length, kept: plan.keep, comparedObjects: plan.comparedObjects, diffCount: plan.diffCount, acceptedDiffs: plan.diffCount > 0, parity: plan.parity.filter((entry) => entry.diffs.length) };
    db.prepare(`
      INSERT INTO authoring_cutover (domain, writer, graph_revision, decided_by, decided_at, report_json)
      VALUES (?, 'canonical', ?, ?, ?, ?)
      ON CONFLICT(domain) DO UPDATE SET writer = 'canonical', graph_revision = excluded.graph_revision,
        decided_by = excluded.decided_by, decided_at = excluded.decided_at, report_json = excluded.report_json
    `).run(domain, expectedGraphRevision, actor || null, stamp, JSON.stringify(report));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { ok: true, domain, created: plan.create.map((doc) => doc.docKey), comparedObjects: plan.comparedObjects, acceptedDiffs: plan.diffCount };
}
