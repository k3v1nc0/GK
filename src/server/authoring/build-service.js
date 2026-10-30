// F3-E2-T02/T03: canonieke documenten -> immutable buildmap op schijf -> atomische releasepointer in de DB.
import { compileAreaShapes } from "./area-compiler.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { kindSpec, splitByAudience } from "../../shared/authoring/kinds.js";
import { parsePickupLegacyRef } from "./runtime-overlay.js";
import { DocumentRepository } from "./document-repository.js";
import { compileWorldSection } from "./world-compiler.js";
import { compileActorSection } from "./actor-compiler.js";
import { compileGameSection } from "./game-compiler.js";
import { authoringError, sha256, stableStringify } from "./stable-json.js";

export const AUTHORING_COMPILER_VERSION = "gk-canonical-compiler-1";
const BUILD_FILES = { "client.json": "client", "server.json": "server" };
const BUILD_ID_PATTERN = /^b_[0-9a-f]{24}$/;

function nowIso() {
  return new Date().toISOString();
}

function writeFileSynced(filePath, text) {
  const fd = fs.openSync(filePath, "w");
  try {
    fs.writeSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function fsyncDir(dirPath) {
  try {
    const fd = fs.openSync(dirPath, "r");
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  } catch {
    // Niet elk platform staat fsync op een map toe; de rename blijft atomisch.
  }
}

// Pure compile: zelfde documenten -> zelfde bestanden. Geeft { files, errors }.
export function compileCanonical(documents, options = {}) {
  const errors = [];
  const knownZoneIds = options.knownZoneIds ? new Set(options.knownZoneIds) : null;
  const known = documents.filter((doc) => kindSpec(doc.kind)).sort((a, b) => a.docKey.localeCompare(b.docKey));
  const active = known.filter((doc) => !doc.archived);
  const byKind = (kind) => active.filter((doc) => doc.kind === kind);
  const project = byKind("project_settings")[0] || null;
  // Gearchiveerde items blijven in de runtimecatalogus (spelers kunnen ze nog hebben), gemarkeerd als archived.
  const items = known.filter((doc) => doc.kind === "item_definition");
  const pickups = byKind("pickup");
  const removedLegacyPickups = known.filter((doc) => doc.kind === "pickup" && doc.archived && doc.legacyRef)
    .map((doc) => parsePickupLegacyRef(doc.legacyRef)).filter(Boolean);
  const knownRespawn = options.knownRespawnPolicyIds ? new Set(options.knownRespawnPolicyIds) : null;
  const assetTypes = options.assetTypes || null;
  const itemKeys = new Set(items.filter((doc) => !doc.archived).map((doc) => doc.docKey));
  // Fase 05: een uitrustingsslot moet in de gepubliceerde wereld bestaan (anders kan niemand het item dragen).
  const knownSlots = options.knownEquipmentSlotIds ? new Set(options.knownEquipmentSlotIds) : null;
  for (const item of items) {
    if (item.archived || !item.body.equipSlot || !knownSlots || knownSlots.has(item.body.equipSlot)) continue;
    errors.push({ code: "EQUIP_SLOT_UNKNOWN", docKey: item.docKey, message: "Item " + item.body.itemId + " gebruikt onbekend uitrustingsslot " + item.body.equipSlot });
  }
  for (const item of items) {
    if (item.archived) continue;
    for (const [field, expected] of [["iconAssetId", ["image", "texture"]], ["worldModelAssetId", ["model"]]]) {
      const assetId = item.body[field];
      if (!assetId || !assetTypes) continue;
      if (!assetTypes.has(assetId)) errors.push({ code: "ASSET_UNKNOWN", docKey: item.docKey, message: "Item " + item.body.itemId + " gebruikt onbekend asset " + assetId });
      else if (!expected.includes(assetTypes.get(assetId))) errors.push({ code: "ASSET_TYPE", docKey: item.docKey, message: "Item " + item.body.itemId + ": " + assetId + " is geen " + expected.join("/") });
    }
  }
  const legacySpawnKeys = new Set();
  for (const pickup of pickups) {
    if (!itemKeys.has(pickup.body.itemRef)) errors.push({ code: "REF_UNRESOLVED", docKey: pickup.docKey, message: "Pickup " + pickup.body.pickupId + " wijst naar onbekend item " + pickup.body.itemRef });
    if (knownZoneIds && !knownZoneIds.has(pickup.body.zoneRef)) errors.push({ code: "ZONE_UNKNOWN", docKey: pickup.docKey, message: "Pickup " + pickup.body.pickupId + " staat in onbekende zone " + pickup.body.zoneRef });
    if (knownRespawn && pickup.body.respawnPolicyRef && !knownRespawn.has(pickup.body.respawnPolicyRef)) errors.push({ code: "REF_UNRESOLVED", docKey: pickup.docKey, message: "Pickup " + pickup.body.pickupId + " gebruikt onbekend respawnbeleid " + pickup.body.respawnPolicyRef });
    if (pickup.legacyRef) {
      const legacy = parsePickupLegacyRef(pickup.legacyRef);
      if (!legacy) errors.push({ code: "LEGACY_REF_INVALID", docKey: pickup.docKey, message: "Onleesbare legacyRef " + pickup.legacyRef });
      else if (legacySpawnKeys.has(pickup.legacyRef)) errors.push({ code: "LEGACY_REF_DUPLICATE", docKey: pickup.docKey, message: "Twee pickups wijzen naar dezelfde legacy-pickup " + pickup.legacyRef });
      legacySpawnKeys.add(pickup.legacyRef);
    }
  }
  const split = (doc) => splitByAudience(doc.kind, doc.body);
  const withArchived = (doc, data) => (doc.archived ? Object.assign(data, { archived: true }) : data);
  const serverPickup = (doc) => {
    const data = split(doc).server;
    const legacy = parsePickupLegacyRef(doc.legacyRef);
    if (legacy) Object.assign(data, { legacyZoneId: legacy.zoneId, legacySpawnEntryId: legacy.spawnEntryId });
    return data;
  };
  const client = {
    schema: AUTHORING_COMPILER_VERSION,
    project: project ? split(project).client : null,
    items: items.map((doc) => withArchived(doc, split(doc).client)),
    pickups: pickups.map((doc) => split(doc).client)
  };
  const server = {
    schema: AUTHORING_COMPILER_VERSION,
    project: project ? split(project).server : null,
    items: items.map((doc) => withArchived(doc, split(doc).server)),
    pickups: pickups.map(serverPickup),
    removedLegacyPickups
  };
  // Fase 04: Regions/Areas/Cells. Zonder wereld-documenten ontbreekt de sleutel, zodat F3-builds bytegelijk blijven.
  const world = compileWorldSection(known, options);
  if (world) {
    errors.push(...world.errors);
    client.world = world.client;
    server.world = world.server;
  }
  // Fase 05: vijanden, aanvallen, loot en grondstoffen. Zonder zulke documenten ontbreekt de sleutel (bytegelijk).
  const actors = compileActorSection(known, options);
  if (actors) {
    errors.push(...actors.errors);
    client.actors = actors.client;
    server.actors = actors.server;
  }
  // Fundament zonder nodes: de kaart "Wereld" (grond, startplek, speler, camera, licht). Zonder kaart ontbreekt de
  // sleutel en gebruikt de wereldbouwer de standaardwaarden.
  const worldSettings = byKind("world_settings")[0] || null;
  if (worldSettings) {
    client.worldSettings = split(worldSettings).client;
    server.worldSettings = split(worldSettings).server;
  }
  // Wereld tekenen (ronde 1): de kaart "Terrein" (hoogte van de grond per vak + helling + budget).
  const terrainSettings = byKind("terrain_settings")[0] || null;
  if (terrainSettings) {
    client.terrain = split(terrainSettings).client;
    server.terrain = split(terrainSettings).server;
  }
  // Ronde 2: terreintexturen (verf en rots). De wereldbouwer zet er de plaatjes bij.
  const terrainTextures = byKind("terrain_texture");
  if (terrainTextures.length) {
    client.terrainTextures = terrainTextures.map((doc) => Object.assign({ docKey: doc.docKey }, split(doc).client));
    server.terrainTextures = terrainTextures.map((doc) => Object.assign({ docKey: doc.docKey }, split(doc).server));
  }
  // Ronde 3: watervlakken (los, plat). De wereldbouwer zet ze in world.terrain.water (tekenen en lopen).
  const terrainWater = byKind("terrain_water");
  if (terrainWater.length) {
    client.terrainWater = terrainWater.map((doc) => split(doc).client);
    server.terrainWater = terrainWater.map((doc) => split(doc).server);
  }
  // Ombouw stap 2: vlakken uit de Area tool. Alleen de server leest ze (de game krijgt ze via de wereld).
  const areaShapes = compileAreaShapes(known, options);
  if (areaShapes) {
    errors.push(...areaShapes.errors);
    Object.assign(server, areaShapes.server);
  }
  // Terugbouw zonder nodes: valuta, speler, game-scherm, NPC's, quests, recepten en losse modellen.
  const game = compileGameSection(known, options);
  if (game) {
    errors.push(...game.errors);
    server.game = game.server;
  }
  // Muziek voor de hele wereld (kaart Wereld). De URL komt mee, zodat de game de assetlijst niet hoeft te kennen.
  const worldMusicId = worldSettings?.body?.musicAssetId || null;
  if (worldMusicId) {
    const info = options.assetInfo ? options.assetInfo.get(worldMusicId) : null;
    if (options.assetInfo && !info) errors.push({ code: "ASSET_UNKNOWN", docKey: worldSettings.docKey, message: "Wereld: onbekende muziek " + worldMusicId });
    else if (info && info.assetType !== "audio") errors.push({ code: "ASSET_TYPE", docKey: worldSettings.docKey, message: "Wereld: " + worldMusicId + " is geen muziek (audio)." });
    const url = options.assetPaths?.get(worldMusicId) || info?.sourcePath || null;
    server.worldMusic = { assetId: worldMusicId, url };
  }
  const texts = { "client.json": stableStringify(client), "server.json": stableStringify(server) };
  const files = {};
  for (const [name, text] of Object.entries(texts)) {
    files[name] = { audience: BUILD_FILES[name], sha256: sha256(text), bytes: Buffer.byteLength(text), text };
  }
  const rootSha256 = sha256(stableStringify({
    compiler: AUTHORING_COMPILER_VERSION,
    files: Object.fromEntries(Object.entries(files).map(([name, file]) => [name, file.sha256]))
  }));
  const provenance = {
    documents: known.map((doc) => ({ docKey: doc.docKey, revision: doc.revision, archived: doc.archived, legacyRef: doc.legacyRef || null })),
    inputSha256: sha256(stableStringify(known.map((doc) => ({ docKey: doc.docKey, archived: doc.archived, legacyRef: doc.legacyRef || null, body: doc.body })))),
    legacyPublishedAt: options.legacyPublishedAt || null
  };
  return { files, rootSha256, buildId: "b_" + rootSha256.slice(0, 24), provenance, errors };
}

export class BuildService {
  constructor(db, options = {}) {
    this.db = db;
    this.buildsRoot = options.buildsRoot;
    this.documents = options.documents || new DocumentRepository(db);
    this.onRelease = typeof options.onRelease === "function" ? options.onRelease : null;
    this.cache = new Map();
    if (!this.buildsRoot) throw new Error("BuildService vereist buildsRoot.");
  }

  release() {
    const row = this.db.prepare("SELECT * FROM authoring_release WHERE id = 1").get();
    return { activeBuildId: row?.active_build_id || null, revision: Number(row?.revision || 0), updatedAt: row?.updated_at || null, updatedBy: row?.updated_by || null };
  }

  buildRow(buildId) {
    const row = this.db.prepare("SELECT * FROM authoring_builds WHERE build_id = ?").get(buildId);
    if (!row) return null;
    return { buildId: row.build_id, rootSha256: row.root_sha256, compilerVersion: row.compiler_version, files: JSON.parse(row.files_json), provenance: JSON.parse(row.provenance_json), createdAt: row.created_at, createdBy: row.created_by };
  }

  listBuilds(limit = 20) {
    return this.db.prepare("SELECT build_id FROM authoring_builds ORDER BY created_at DESC, build_id LIMIT ?")
      .all(Math.max(1, Math.min(100, Number(limit) || 20)))
      .map((row) => this.buildRow(row.build_id));
  }

  audit(limit = 20) {
    return this.db.prepare("SELECT * FROM authoring_release_audit ORDER BY id DESC LIMIT ?").all(Math.max(1, Math.min(100, Number(limit) || 20)));
  }

  buildDir(buildId) {
    if (!BUILD_ID_PATTERN.test(String(buildId))) throw authoringError(400, "BUILD_ID_INVALID", "Ongeldige build-ID.");
    return path.join(this.buildsRoot, buildId);
  }

  // Leest een buildbestand en controleert de hash. Een gewijzigd bestand wordt nooit geserveerd.
  readFile(buildId, fileName) {
    const build = this.buildRow(buildId);
    if (!build || !build.files[fileName]) throw authoringError(404, "BUILD_FILE_NOT_FOUND", "Buildbestand niet gevonden.");
    const cacheKey = buildId + "/" + fileName;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
    const text = fs.readFileSync(path.join(this.buildDir(buildId), fileName), "utf8");
    if (sha256(text) !== build.files[fileName].sha256) throw authoringError(500, "BUILD_HASH_MISMATCH", "Buildbestand klopt niet met zijn hash: " + fileName);
    const data = JSON.parse(text);
    this.cache.set(cacheKey, data);
    return data;
  }

  readClient(buildId) {
    return this.readFile(buildId, "client.json");
  }

  activeServerBuild() {
    const { activeBuildId } = this.release();
    if (!activeBuildId) return null;
    return { buildId: activeBuildId, data: this.readFile(activeBuildId, "server.json") };
  }

  verifyBuild(buildId) {
    const build = this.buildRow(buildId);
    if (!build) throw authoringError(404, "BUILD_NOT_FOUND", "Build niet gevonden.");
    if (build.compilerVersion !== AUTHORING_COMPILER_VERSION) throw authoringError(409, "BUILD_INCOMPATIBLE", "Build is met een andere compiler gemaakt.");
    for (const [name, meta] of Object.entries(build.files)) {
      let text;
      try { text = fs.readFileSync(path.join(this.buildDir(buildId), name), "utf8"); } catch {
        throw authoringError(409, "BUILD_FILE_MISSING", "Buildbestand ontbreekt: " + name);
      }
      if (sha256(text) !== meta.sha256) throw authoringError(409, "BUILD_HASH_MISMATCH", "Buildbestand klopt niet met zijn hash: " + name);
    }
    return build;
  }

  // Schrijft bestanden naar een tijdelijke map, fsync, rename. Bestaat de build al, dan wordt die hergebruikt.
  writeBuildFiles(compiled) {
    fs.mkdirSync(this.buildsRoot, { recursive: true });
    const finalDir = this.buildDir(compiled.buildId);
    if (fs.existsSync(finalDir)) return finalDir;
    const tmpDir = path.join(this.buildsRoot, ".tmp-" + compiled.buildId + "-" + crypto.randomBytes(4).toString("hex"));
    fs.mkdirSync(tmpDir);
    try {
      for (const [name, file] of Object.entries(compiled.files)) writeFileSynced(path.join(tmpDir, name), file.text);
      writeFileSynced(path.join(tmpDir, "manifest.json"), stableStringify({
        buildId: compiled.buildId,
        rootSha256: compiled.rootSha256,
        compiler: AUTHORING_COMPILER_VERSION,
        files: Object.fromEntries(Object.entries(compiled.files).map(([name, file]) => [name, { audience: file.audience, sha256: file.sha256, bytes: file.bytes }])),
        provenance: compiled.provenance
      }) + "\n");
      fsyncDir(tmpDir);
      fs.renameSync(tmpDir, finalDir);
      fsyncDir(this.buildsRoot);
    } catch (error) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      throw error;
    }
    return finalDir;
  }

  // options.fault = "after_files" simuleert een crash na het schrijven en voor de pointerwissel.
  publish(actor, options = {}) {
    const compiled = compileCanonical(this.documents.allDocuments(), options);
    if (compiled.errors.length) throw authoringError(422, "BUILD_BLOCKED", compiled.errors[0].message, { errors: compiled.errors });
    if (compiled.provenance.documents.length === 0) throw authoringError(422, "BUILD_EMPTY", "Er is nog niets om te publiceren.");
    this.writeBuildFiles(compiled);
    if (options.fault === "after_files") throw authoringError(500, "FAULT_INJECTED", "Geforceerde fout voor de pointerwissel.");
    const before = this.release();
    if (options.expectedReleaseRevision !== undefined && options.expectedReleaseRevision !== null && Number(options.expectedReleaseRevision) !== before.revision) {
      throw authoringError(409, "STALE_RELEASE", "De release is intussen gewijzigd.", { currentRevision: before.revision });
    }
    const stamp = nowIso();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO authoring_builds (build_id, root_sha256, compiler_version, files_json, provenance_json, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        compiled.buildId, compiled.rootSha256, AUTHORING_COMPILER_VERSION,
        JSON.stringify(Object.fromEntries(Object.entries(compiled.files).map(([name, file]) => [name, { audience: file.audience, sha256: file.sha256, bytes: file.bytes }]))),
        JSON.stringify(compiled.provenance), actor || null, stamp
      );
      const changed = this.db.prepare("UPDATE authoring_release SET active_build_id = ?, revision = revision + 1, updated_by = ?, updated_at = ? WHERE id = 1 AND revision = ?")
        .run(compiled.buildId, actor || null, stamp, before.revision);
      if (Number(changed.changes) !== 1) throw authoringError(409, "STALE_RELEASE", "De release is intussen gewijzigd.");
      this.db.prepare("INSERT INTO authoring_release_audit (action, from_build_id, to_build_id, reason, actor_user_id, created_at) VALUES ('publish', ?, ?, NULL, ?, ?)")
        .run(before.activeBuildId, compiled.buildId, actor || null, stamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    if (this.onRelease) this.onRelease(compiled.buildId);
    return { ok: true, buildId: compiled.buildId, rootSha256: compiled.rootSha256, previousBuildId: before.activeBuildId, release: this.release() };
  }

  // F3-E2-T03: rollback zonder SQL. Raakt geen characterstate; oude builds blijven ongewijzigd staan.
  rollback(targetBuildId, expectedReleaseRevision, reason, actor) {
    if (!Number.isInteger(Number(expectedReleaseRevision))) throw authoringError(428, "IF_MATCH_REQUIRED", "If-Match (releaserevision) is verplicht.");
    const cleanReason = String(reason || "").trim().slice(0, 200);
    if (!cleanReason) throw authoringError(422, "REASON_REQUIRED", "Geef een reden voor de rollback.");
    this.verifyBuild(targetBuildId);
    const before = this.release();
    if (Number(expectedReleaseRevision) !== before.revision) throw authoringError(409, "STALE_RELEASE", "De release is intussen gewijzigd.", { currentRevision: before.revision });
    if (before.activeBuildId === targetBuildId) throw authoringError(409, "ALREADY_ACTIVE", "Deze build is al actief.");
    const stamp = nowIso();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const changed = this.db.prepare("UPDATE authoring_release SET active_build_id = ?, revision = revision + 1, updated_by = ?, updated_at = ? WHERE id = 1 AND revision = ?")
        .run(targetBuildId, actor || null, stamp, before.revision);
      if (Number(changed.changes) !== 1) throw authoringError(409, "STALE_RELEASE", "De release is intussen gewijzigd.");
      this.db.prepare("INSERT INTO authoring_release_audit (action, from_build_id, to_build_id, reason, actor_user_id, created_at) VALUES ('rollback', ?, ?, ?, ?, ?)")
        .run(before.activeBuildId, targetBuildId, cleanReason, actor || null, stamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    if (this.onRelease) this.onRelease(targetBuildId);
    return { ok: true, buildId: targetBuildId, previousBuildId: before.activeBuildId, release: this.release() };
  }
}
