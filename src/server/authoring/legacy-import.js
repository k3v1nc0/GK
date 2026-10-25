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

export const CUTOVER_DOMAINS = ["project", "items", "pickups"];
const DOMAIN_KIND = { project: "project_settings", items: "item_definition", pickups: "pickup" };

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
    pickups: counts
  };
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

function plannedDocuments(world, domain, blocking) {
  const docs = [];
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

function parityReport(world, domain, finalDocs) {
  const compiled = compileCanonical(finalDocs);
  const overlaid = applyCanonicalBuild(world, { buildId: "parity", data: JSON.parse(compiled.files["server.json"].text) });
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
        diffs: diffObjects(before[itemId], after[itemId]),
        frozenLegacyKeys: Object.keys(before[itemId] || {}).filter((key) => !CANONICAL_ITEM_RUNTIME_KEYS.includes(key)).sort()
      });
    }
  }
  if (domain === "pickups") {
    const before = pickupRuntimeStates(world);
    const after = pickupRuntimeStates(overlaid);
    for (const [instanceId, state] of before) {
      if (state.pickupKind !== "item") continue;
      parity.push({ legacyRef: "pickups:" + state.zoneId + ":" + state.spawnEntryId, instanceId, diffs: after.has(instanceId) ? diffObjects(state, after.get(instanceId)) : [{ key: "instance", legacy: instanceId, canonical: null }] });
    }
    for (const [instanceId, state] of after) {
      if (!before.has(instanceId) && String(state.spawnEntryId || "").startsWith("canonical.legacy.")) parity.push({ legacyRef: instanceId, instanceId, diffs: [{ key: "instance", legacy: null, canonical: instanceId }] });
    }
  }
  return compiled.errors.length
    ? parity.concat(compiled.errors.map((error) => ({ legacyRef: error.docKey, diffs: [{ key: error.code, legacy: null, canonical: error.message }] })))
    : parity;
}

// Dry-run. existingDocs = alle canonieke documenten die er nu al zijn.
export function planDomain(world, domain, existingDocs, cutoverRows = {}) {
  if (!CUTOVER_DOMAINS.includes(domain)) throw authoringError(400, "DOMAIN_UNKNOWN", "Onbekend domein: " + domain);
  const blocking = [];
  if (!world?.gameProject) blocking.push({ legacyRef: domain, reason: "De graph heeft geen gecompileerd gameProject. Los eerst de validatiefouten in Nodes op." });
  if (domain === "pickups" && cutoverRows.items?.writer !== "canonical") blocking.push({ legacyRef: "pickups", reason: "Zet eerst Items over: pickups verwijzen naar canonieke items." });
  const planned = world?.gameProject ? plannedDocuments(world, domain, blocking) : [];
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
  const finalDocs = existingDocs.concat(create.map((doc) => ({ docKey: doc.docKey, kind: doc.kind, body: doc.body, legacyRef: doc.legacyRef, archived: false, revision: 1 })));
  const parity = world?.gameProject && !blocking.length ? parityReport(world, domain, finalDocs) : [];
  const diffCount = parity.filter((entry) => entry.diffs.length > 0).length;
  return {
    domain,
    kind: DOMAIN_KIND[domain],
    writer: cutoverRows[domain]?.writer || "legacy",
    ok: blocking.length === 0 && diffCount === 0,
    create: create.map((doc) => ({ docKey: doc.docKey, legacyRef: doc.legacyRef, body: doc.body })),
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
export function finalizeDomain(db, { world, domain, expectedGraphRevision, worldGraphRevision, acceptDiffs = false, existingDocs, actor }) {
  const rows = cutoverRows(db);
  if (rows[domain]?.writer === "canonical") throw authoringError(409, "ALREADY_CANONICAL", "Dit domein is al overgezet.");
  if (!Number.isInteger(expectedGraphRevision)) throw authoringError(428, "IF_MATCH_REQUIRED", "If-Match (graphrevisie) is verplicht.");
  if (worldGraphRevision !== expectedGraphRevision) throw authoringError(409, "GRAPH_REVISION_CHANGED", "De graph is intussen gewijzigd. Bekijk het rapport opnieuw.");
  const plan = planDomain(world, domain, existingDocs, rows);
  if (plan.blocking.length) throw authoringError(409, "CUTOVER_BLOCKED", plan.blocking[0].reason, { blocking: plan.blocking });
  if (plan.diffCount > 0 && acceptDiffs !== true) throw authoringError(409, "PARITY_DIFF", plan.diffCount + " objecten wijken af. Bekijk het rapport en accepteer expliciet, of los het op in Nodes.", { diffCount: plan.diffCount });
  const stamp = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const meta = db.prepare("SELECT graph_revision FROM editor_graph_meta WHERE id = 1").get();
    if (Number(meta?.graph_revision || 0) !== expectedGraphRevision) throw authoringError(409, "GRAPH_REVISION_CHANGED", "De graph is intussen gewijzigd. Bekijk het rapport opnieuw.");
    const insert = db.prepare(`
      INSERT INTO authoring_documents (doc_key, kind, revision, body_json, archived, legacy_ref, created_at, updated_at, updated_by)
      VALUES (?, ?, 1, ?, 0, ?, ?, ?, ?)
    `);
    const insertRef = db.prepare("INSERT OR IGNORE INTO authoring_refs (from_doc_key, to_doc_key) VALUES (?, ?)");
    for (const doc of plan.create) {
      insert.run(doc.docKey, plan.kind, JSON.stringify(doc.body), doc.legacyRef, stamp, stamp, actor || null);
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
