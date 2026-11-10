// Fundament zonder nodes (doelbeeld): de spelwereld wordt gebouwd uit één build (de kaarten) en de vaste
// systemen in deze code. Er is geen node-graph en geen oude gepubliceerde wereld als onderlaag.
//
//   build (server.json) ──► baseRuntimeWorld()  : wereld, grond, startplek, speler, camera, licht, catalogus
//                       └─► buildRuntimeWorld() : + items, pickups, vlakken, obstakels uit dezelfde build
//
// De uitkomst heeft precies het formaat dat de game (world-runtime.js) en de spelserver (mmo/node03) al lezen.
import { CANONICAL_KINDS } from "../../shared/authoring/kinds.js";
import { applyCanonicalBuild, EDITOR_DOC_PREFIX } from "./runtime-overlay.js";
import { sha256, stableStringify } from "./stable-json.js";
import { OBJECTIVE_KINDS } from "../../../apps/web/public/shared/quest-graph.js";
import { settingsValues } from "./game-compiler.js";
import { partyValues } from "../../shared/authoring/kinds/party.js";
import { chatValues } from "../../shared/authoring/kinds/chat.js";
import { areaBoundsMm } from "../../../apps/web/public/shared/spatial.js";
import { heightfieldForWorld } from "../../../apps/web/public/shared/movement-kernel.js";
import { normalizeTerrainWater, terrainHeightAt, terrainSlopeDegAt, terrainUnderWater, TERRAIN_CHUNK_METERS } from "../../../apps/web/public/shared/terrain.js";

export const WORLD_FORMAT_VERSION = "gk-game-project-v3";
export const WORLD_ID = "world.main";
export const WORLD_ZONE_ID = "zone.world";
export const WORLD_SPAWN_ID = "spawn.world.start";
export const WORLD_SOURCE = "authoring-build";

// Vaste keuzes (systeem in code) die de Werkbank laat kiezen: pickup "Terugkomen" en item "Uitrusting".
export const RESPAWN_POLICIES = Object.freeze([
  { id: "respawn_policy.fast", displayName: "Snel (30 s - 1 min)", minDelayMs: 30000, maxDelayMs: 60000 },
  { id: "respawn_policy.standard", displayName: "Gewoon (1 - 2 min)", minDelayMs: 60000, maxDelayMs: 120000 },
  { id: "respawn_policy.slow", displayName: "Langzaam (5 - 10 min)", minDelayMs: 300000, maxDelayMs: 600000 },
  { id: "respawn_policy.rare", displayName: "Zeldzaam (30 - 60 min)", minDelayMs: 1800000, maxDelayMs: 3600000 }
]);
export const EQUIPMENT_SLOTS = Object.freeze([
  { id: "equipment_slot.head", displayName: "Hoofd" },
  { id: "equipment_slot.chest", displayName: "Borst" },
  { id: "equipment_slot.hands", displayName: "Handen" },
  { id: "equipment_slot.legs", displayName: "Benen" },
  { id: "equipment_slot.feet", displayName: "Voeten" },
  { id: "equipment_slot.main_hand", displayName: "Wapenhand" },
  { id: "equipment_slot.off_hand", displayName: "Andere hand" },
  { id: "equipment_slot.neck", displayName: "Ketting" },
  { id: "equipment_slot.ring", displayName: "Ring" }
]);

// Lege catalogusdelen die de spelserver verwacht (worden per ombouwstap gevuld vanuit kaarten).
const CATALOG_SECTIONS = ["definitions", "tags", "values", "textTemplates", "localization", "items", "itemModifiers", "resources",
  "currencies", "equipmentSlots", "stats", "statBlocks", "statCurves", "abilities", "abilityRanks", "statusEffects", "damageTypes",
  "combatProfiles", "enemies", "npcs", "variants", "aiProfiles", "pathBehaviors", "animationSets", "lootTables", "recipes",
  "vendorCatalogs", "factions", "reputationTracks", "musicTracks", "musicPlaylists", "audioEvents", "vfx", "difficultyProfiles",
  "respawnPolicies", "playableCharacters"];

const SHADOW_BASE = { preset: "middel_schaduw", enabled: true, cameraNear: 1, bias: -0.0003, normalBias: 0.04, type: "pcf_soft",
  updateMode: "stable_snapped", snapWorldUnits: 10, staticPropsReceive: true, scatterCast: true, scatterReceive: true,
  groundReceives: true, terrainReceives: true };
const PERFORMANCE = {
  editor: { preset: "middel_schaduw", pixelRatioCap: 2, antialias: true, fogEnabled: false, maxFps: 60, debugHelpersVisible: true,
    debugWarningsVisible: true, debugChunkOverlayVisible: false, chunkGridVisible: true, chunkLabelsVisible: false, streamingDebugVisible: false,
    shadow: Object.assign({}, SHADOW_BASE, { mapSize: 1024, cameraSize: 100, cameraFar: 450, focusMode: "editor_world_center_or_selected",
      staticPropsCast: true, shadowResidentMarginChunks: 1 }) },
  game: { preset: "middel_schaduw", pixelRatioMin: 0.5, pixelRatioCap: 1, antialias: false, fogEnabled: true, maxFps: 60, debugHelpersVisible: false,
    debugWarningsVisible: false, debugChunkOverlayVisible: false, chunkGridVisible: false, chunkLabelsVisible: false, streamingDebugVisible: false,
    shadow: Object.assign({}, SHADOW_BASE, { mapSize: 512, cameraSize: 70, cameraFar: 300, focusMode: "player_or_spawn",
      staticPropsCast: false, shadowResidentMarginChunks: 0 }) },
  compatibility: { usedLegacyWorldSettingsPerformanceFields: false, legacyShadowFieldsMigrated: false }
};
const CHUNK_GRID = { id: "chunk_grid.main", chunkWidth: 14, chunkDepth: 14, tileSize: 1, maxLoadedChunks: 81, edgeMode: "clip_to_zone_bounds" };
const CHUNK_COMMON = { enabled: true, chunkGridId: CHUNK_GRID.id, chunkWidth: 14, chunkDepth: 14, tileSize: 1, preloadMarginChunks: 1, maxLoadedChunks: 81,
  residentEntityBudget: 200, residentObjectBudget: 300, residentScatterInstanceBudget: 500, residentChunkBuildBudgetPerFrame: 2, groundChunkingEnabled: true };
const CHUNK_LOADING = {
  editor: Object.assign({ id: "chunks.editor", type: "editor", chunkProfileId: "editor_chunks" }, CHUNK_COMMON, { unloadMarginChunks: 2, debugOverlay: true,
    pathWaterSurfaceChunkingEnabled: false, terrainVisualChunkingEnabled: false, editorViewRadiusChunks: 2, keepSelectedChunkLoaded: true,
    showChunkGrid: true, showChunkLabels: false }),
  game: Object.assign({ id: "chunks.game", type: "game", chunkProfileId: "game_chunks" }, CHUNK_COMMON, { unloadMarginChunks: 1, debugOverlay: false,
    pathWaterSurfaceChunkingEnabled: true, terrainVisualChunkingEnabled: true, cameraOnly: true, gameViewRadiusChunks: 3, cameraOffsetZChunks: -1,
    fixedCameraPaddingTiles: 0, strictUnloadOutsideCamera: true, loadBudgetPerFrame: 2 })
};
const EMPTY_LIST = () => ({ byId: {}, all: [] });

const clone = (value) => JSON.parse(JSON.stringify(value));

// De waarden van de kaart "Wereld", aangevuld met de standaard uit het schema (zonder kaart: alleen standaard).
export function worldSettingsValues(body = null) {
  const values = {};
  for (const [key, field] of Object.entries(CANONICAL_KINDS.world_settings.fields)) {
    const value = body ? body[key] : undefined;
    values[key] = value === undefined || value === null || value === "" ? field.default : value;
  }
  return values;
}

// Wereld tekenen (ronde 1): de kaart "Terrein" met standaardwaarden.
export function terrainSettingsValues(body = null) {
  const values = {};
  for (const [key, field] of Object.entries(CANONICAL_KINDS.terrain_settings.fields)) {
    const value = body ? body[key] : undefined;
    values[key] = value === undefined || value === null || value === "" ? field.default : value;
  }
  return values;
}

// Ronde 2: verf en rots. textures = { doc-sleutel: { assetId, size, url } }; de url komt uit de assetlijst.
function terrainPaintConfig(data, values) {
  const textures = {};
  for (const texture of Array.isArray(data?.terrainTextures) ? data.terrainTextures : []) {
    const color = /^#[0-9a-fA-F]{6}$/.test(String(texture?.color || "")) ? texture.color : null;
    if (!texture || texture.archived || (!texture.textureAssetId && !color)) continue;
    const docKey = texture.docKey || "terrain_texture:" + texture.textureId;
    textures[docKey] = { assetId: texture.textureAssetId || null, color, size: Number(texture.tileSize) || 4, url: null, name: texture.displayName || "" };
  }
  const paint = values.paint && typeof values.paint === "object" && !Array.isArray(values.paint) ? values.paint : {};
  const rock = values.rockTextureRef && textures[values.rockTextureRef] ? { texture: values.rockTextureRef, slopeDeg: Number(values.rockSlopeDeg) } : null;
  return { chunks: JSON.parse(JSON.stringify(paint)), textures, rock };
}

function terrainHeightfieldConfig(data) {
  const values = terrainSettingsValues(data?.terrain || null);
  const chunks = values.chunks && typeof values.chunks === "object" && !Array.isArray(values.chunks) ? values.chunks : {};
  return { chunkSize: TERRAIN_CHUNK_METERS, baseUrl: "/assets/terrain/", chunks: Object.assign({}, chunks),
    maxSlopeDeg: Number(values.maxSlopeDeg), triBudget: Number(values.triBudget), chunkTriBudget: Number(values.chunkTriBudget),
    scatterSlopeDeg: Number(values.scatterSlopeDeg), paint: terrainPaintConfig(data, values) };
}

// Ronde 3: watervlakken uit de kaarten "Water" (los, plat vlak met één hoogte).
function terrainWaterList(data) {
  return (Array.isArray(data?.terrainWater) ? data.terrainWater : [])
    .map((doc) => normalizeTerrainWater(Object.assign({}, doc, { id: doc?.waterId })))
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
}

// Ronde 3: begroeiing (bomen, stenen, gras) niet op te steile hellingen en niet onder water. Kopie, niets aangepast.
export function dropScatterOffTerrain(world, heightfield) {
  const waters = world?.terrain?.water || [];
  const maxSlope = Number(world?.terrain?.heightfield?.scatterSlopeDeg);
  const hasHeights = Boolean(heightfield && heightfield.chunks && heightfield.chunks.size);
  if (!waters.length && !hasHeights) return world;
  const entities = world.entities || [];
  const kept = entities.filter((entity) => {
    if (entity?.type !== "scatter") return true;
    const position = entity.transform?.position || {};
    const x = Number(position.x) || 0;
    const z = Number(position.z) || 0;
    if (waters.length && terrainUnderWater(heightfield, waters, x, z)) return false;
    return !(hasHeights && Number.isFinite(maxSlope) && terrainSlopeDegAt(heightfield, x, z) > maxSlope);
  });
  return kept.length === entities.length ? world : Object.assign({}, world, { entities: kept });
}

// Alles wat in de kaarten op de grond staat (y = hoogte boven de grond) komt op de hoogte van het terrein.
// Kopieën, niets wordt aangepast: de builddata blijft zoals hij is.
export function liftWorldOntoTerrain(world, heightfield) {
  if (!heightfield || !heightfield.chunks || heightfield.chunks.size === 0) return world;
  const groundY = Number(world?.ground?.y) || 0;
  const lift = (x, z) => terrainHeightAt(heightfield, Number(x) || 0, Number(z) || 0);
  const liftPoint = (point) => (point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.z))
    ? Object.assign({}, point, { y: (Number(point.y) || 0) + lift(point.x, point.z) }) : point);
  const liftEntity = (entity) => {
    const position = entity?.transform?.position;
    if (!position) return entity;
    return Object.assign({}, entity, { transform: Object.assign({}, entity.transform, { position: liftPoint(position) }) });
  };
  const liftTarget = (target) => {
    const next = liftPoint(target);
    if (next && next.linkedEntity) next.linkedEntity = liftPoint(next.linkedEntity);
    return next;
  };
  const liftController = (controller) => Object.assign({}, controller, {
    spawnSets: (controller?.spawnSets || []).map((set) => Object.assign({}, set, { spawns: (set.spawns || []).map(liftPoint) }))
  });
  const memo = new Map();
  const liftPackage = (pkg) => {
    if (!pkg || typeof pkg !== "object") return pkg;
    if (memo.has(pkg)) return memo.get(pkg);
    const next = Object.assign({}, pkg);
    if (Array.isArray(pkg.spawns)) next.spawns = pkg.spawns.map(liftPoint);
    if (Array.isArray(pkg.entities)) next.entities = pkg.entities.map(liftPoint);
    if (Array.isArray(pkg.questTargets)) next.questTargets = pkg.questTargets.map(liftTarget);
    if (Array.isArray(pkg.spawnControllers)) next.spawnControllers = pkg.spawnControllers.map(liftController);
    memo.set(pkg, next);
    return next;
  };
  const liftZones = (zones) => (zones ? Object.assign({}, zones, {
    packages: (zones.packages || []).map(liftPackage),
    byId: Object.fromEntries(Object.entries(zones.byId || {}).map(([id, pkg]) => [id, liftPackage(pkg)]))
  }) : zones);
  const zones = liftZones(world.zones);
  const projectZones = world.gameProject?.zones === world.zones ? zones : liftZones(world.gameProject?.zones);
  const spawn = world.spawn ? Object.assign({}, world.spawn, { y: groundY + lift(world.spawn.x, world.spawn.z) }) : world.spawn;
  return Object.assign({}, world, {
    entities: (world.entities || []).map(liftEntity),
    interactables: (world.interactables || []).map(liftPoint),
    portals: Array.isArray(world.portals) ? world.portals.map(liftPoint) : world.portals,
    spawn,
    zones,
    zonePackage: liftPackage(world.zonePackage),
    gameProject: world.gameProject ? Object.assign({}, world.gameProject, { zones: projectZones }) : world.gameProject
  });
}

function catalogs() {
  const result = Object.fromEntries(CATALOG_SECTIONS.map((section) => [section, {}]));
  for (const policy of RESPAWN_POLICIES) {
    result.respawnPolicies[policy.id] = Object.assign({ respawnPolicyId: policy.id, internalLabel: "", description: "", definitionVersion: 1, tags: [], enabled: true, jitterMode: "uniform",
      maxAliveDefault: 1, corpseDurationMs: 15000, despawnDistance: 120, resetEncounterOnWipe: true, oneTimeSpawn: false, persistentDefeatFlagRef: null }, policy);
  }
  EQUIPMENT_SLOTS.forEach((slot, index) => {
    result.equipmentSlots[slot.id] = Object.assign({ slotId: slot.id, internalLabel: "", description: "", definitionVersion: 1, tags: [], enabled: true,
      allowedItemTags: { all: [], any: [], none: [] }, maxItems: 1, conflictingSlotRefs: [], uiOrder: index }, slot);
  });
  return result;
}

function campaigns() {
  return { schemaVersion: "gk-quest-v1", registryId: "campaign_registry.main", packages: [], packageCount: 0,
    campaigns: EMPTY_LIST(), chapters: EMPTY_LIST(), quests: EMPTY_LIST(), dialogues: EMPTY_LIST(), markerRules: EMPTY_LIST(), rewards: EMPTY_LIST(),
    questCount: 0, dialogueCount: 0, errors: [], warnings: [] };
}

// De basis van de wereld uit de build. data = server.json van de build (of {} als er nog geen build is).
export function baseRuntimeWorld(data = {}, options = {}) {
  const settings = worldSettingsValues(data?.worldSettings || null);
  const gameName = data?.project?.gameName || "GK";
  const size = Number(settings.groundSize);
  const half = size / 2;
  const sky = settings.skyColor;
  const cameraDistance = Number(settings.cameraDistance);
  const cameraLimits = { minDistance: Math.min(10, cameraDistance), maxDistance: Math.max(48, cameraDistance * 2) };

  const ground = {
    id: "world_ground", width: size, depth: size, y: 0, materialColor: settings.groundColor, textureAssetId: settings.groundTextureAssetId || null,
    textureRepeat: 8, textureWorldSizeX: Number(settings.groundTextureSize), textureWorldSizeZ: Number(settings.groundTextureSize), edgeFadeWidth: 0,
    textureRepeatMode: "world", boundsMode: "centerSize", minX: -half, maxX: half, minZ: -half, maxZ: half
  };
  const spawnPoint = { nodeType: "spawn_point", spawnId: WORLD_SPAWN_ID, role: "zone_default", zoneRef: WORLD_ZONE_ID, label: "Startplek",
    x: Number(settings.startX), y: 0, z: Number(settings.startZ), facing: Number(settings.startFacing), safeRadius: 1.25,
    snapToGround: true, validateCollision: true, activationConditionRef: null, priority: 0 };
  const camera = { id: "main_camera", cameraId: "main_camera", pitch: Number(settings.cameraPitch), yaw: 0, startDistance: cameraDistance,
    distance: cameraDistance, ...cameraLimits, fov: 50, targetHeightOffset: 1.6, follow: true, rotateSpeed: 90 };
  const bounds = { originX: -half, originY: 0, originZ: -half, width: size, depth: size, minX: -half, minZ: -half, maxX: half, maxZ: half, minY: -100, maxY: 500 };
  const zonePackage = {
    id: WORLD_ZONE_ID + ".package", zoneId: WORLD_ZONE_ID, packageVersion: 1, includeEditorOnlyData: false,
    zone: { id: WORLD_ZONE_ID, zoneId: WORLD_ZONE_ID, displayName: gameName, zoneType: "outdoor_normal", originX: -half, originY: 0, originZ: -half,
      width: size, depth: size, minY: -100, maxY: 500, recommendedLevelMin: 1, recommendedLevelMax: 60, biomeTags: [], zoneTags: [],
      allowFastTravel: true, allowRespawn: true, activeByDefault: true, bounds },
    environment: { id: "environment.world", environmentId: "environment.world", backgroundColor: sky, fogColor: sky, fogDensity: 0, smoothShading: true,
      timeOfDayOffset: 0, weatherProfileRef: null, musicPlaylistRef: null, ambienceRef: null, cameraOverrideRef: null, shadowPresetOverride: "inherit" },
    rules: null,
    ground: Object.assign({ groundId: ground.id }, ground, { textureRepeatMode: undefined }),
    terrain: [], collision: [], player: null, areas: [], entities: [], entityComponents: [],
    spawns: [spawnPoint],
    checkpoints: [], links: [], discoveries: [], questTargets: [], markers: [], minimaps: [], audioAssignments: [], paths: [],
    encounterAreas: [], spawnControllers: [], encounters: []
  };
  const zones = { id: "zone_registry.main", packages: [zonePackage], byId: { [WORLD_ZONE_ID]: zonePackage }, zoneCount: 1 };
  const project = { id: "gk.project", gameName, defaultLanguage: "nl", contentVersion: "0.1.0", startZoneRef: WORLD_ZONE_ID, startSpawnRef: WORLD_SPAWN_ID };
  if (data?.project?.motd) project.motd = data.project.motd;

  const heightfield = terrainHeightfieldConfig(data);
  const paintTextures = Object.values(heightfield.paint.textures);
  const assetIds = Array.from(new Set([settings.groundTextureAssetId, settings.playerModelAssetId].concat(paintTextures.map((texture) => texture.assetId)).filter(Boolean)));
  const assets = options.assetService && assetIds.length ? options.assetService.manifestForIds(assetIds) : [];
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  for (const texture of paintTextures) texture.url = assetsById.get(texture.assetId)?.sourcePath || null;

  const world = {
    schemaVersion: WORLD_FORMAT_VERSION,
    source: WORLD_SOURCE,
    world: { id: WORLD_ID, displayName: gameName, backgroundColor: sky, fogColor: sky, fogDensity: 0,
      performance: Object.assign(clone(PERFORMANCE), { shared: { worldId: WORLD_ID, displayName: gameName, backgroundColor: sky, fogColor: sky, fogDensity: 0, smoothShading: true } }) },
    ground,
    camera: Object.assign({ mode: "top-down" }, camera),
    player: { id: "player", modelAssetId: settings.playerModelAssetId || null, moveSpeed: Number(settings.playerSpeed), sprintMultiplier: 1.6,
      turnSpeed: 540, collisionRadius: 0.5, scale: Number(settings.playerScale), showNameplate: true },
    spawn: { spawnId: WORLD_SPAWN_ID, role: "zone_default", zoneRef: WORLD_ZONE_ID, x: spawnPoint.x, y: 0, z: spawnPoint.z, facing: spawnPoint.facing },
    lights: [
      { id: "ambient_light", type: "ambient", color: "#ffffff", intensity: Number(settings.lightStrength) },
      { id: "sun_light", type: "directional", color: "#ffffff", intensity: Number(settings.sunStrength), position: { x: 12, y: 20, z: 8 } }
    ],
    entities: [], interactables: [], keybinds: [], ui: [],
    minimap: options.editor ? { bakes: [], game: null, editor: null } : { bakes: [], game: null },
    mmo: { network: null },
    // Wereld tekenen: heightfield = de hoogte van de grond (vakken in assets/terrain); de game en de editor
    // tekenen de grond hiermee (ook als hij nog plat is).
    terrain: { layers: [], surfaces: [], heightfield, water: terrainWaterList(data) },
    collision: { blockers: [], walkableSurfaces: [] },
    scatterAreas: [],
    chunkLoading: clone(CHUNK_LOADING),
    assets,
    buildId: options.buildId || null,
    gameProject: {
      schemaVersion: WORLD_FORMAT_VERSION, project, chunkGrid: clone(CHUNK_GRID), camera: clone(camera), catalogs: catalogs(), zones,
      campaigns: campaigns(), playerRules: { id: "player_rules.main", policies: [], byType: {} },
      ui: { id: "ui.main", ui: [], modules: [], minimap: [], layouts: [] }, runtime: { activeZoneId: WORLD_ZONE_ID, startSpawnId: WORLD_SPAWN_ID }
    },
    activeZoneId: WORLD_ZONE_ID,
    zonePackage,
    zones,
    zoneGrounds: [Object.assign({}, ground, { zoneRef: WORLD_ZONE_ID })],
    publishedAt: options.publishedAt || undefined,
    readModelVersion: { interactableAssembly: 2 }
  };
  if (options.editor) {
    world.editorCamera = { id: "editor_camera", cameraId: "editor_camera", target: { x: spawnPoint.x, y: 0, z: spawnPoint.z }, pitch: Number(settings.cameraPitch),
      yaw: 0, distance: cameraDistance, ...cameraLimits, fov: 50, rotateSpeed: 90 };
  }
  return world;
}

// De complete spelwereld: basis + items, pickups, vlakken en obstakels uit dezelfde build,
// plus speler, valuta, NPC's, quests, winkels, crafting, losse modellen en het game-scherm (sectie "game").
// Eén wereld: elke pickup ligt in de wereldzone, wat er vroeger ook als zone stond.
export function buildRuntimeWorld(data = {}, options = {}) {
  const source = data || {};
  const base = baseRuntimeWorld(source, options);
  const pickups = (source.pickups || []).map((pickup) => {
    const next = Object.assign({}, pickup, { zoneRef: WORLD_ZONE_ID });
    delete next.legacyZoneId;
    return next;
  });
  const world = applyCanonicalBuild(base, { buildId: options.buildId || null, data: Object.assign({}, source, { pickups, removedLegacyPickups: [] }) }, options);
  const full = withGame(world, source, options);
  // Wereld tekenen: zonder assetService (tests) of zonder vakken blijft alles op y zoals in de kaarten.
  const assetService = options.assetService;
  const heightfield = assetService && typeof assetService.readTerrainChunk === "function"
    ? heightfieldForWorld(full, { readTerrainChunk: (sha1) => assetService.readTerrainChunk(sha1) })
    : null;
  return liftWorldOntoTerrain(dropScatterOffTerrain(full, heightfield), heightfield);
}

// ---------------------------------------------------------------------------------------------------------
// Terugbouw zonder nodes: de vaste spelsystemen (node03/04/05) lezen catalogus, campagnes, zone-entiteiten
// en HUD-modules. Die worden hier gemaakt uit de kaarten; zonder kaarten gelden de standaardwaarden.

export const PLAYER_CHARACTER_ID = "player.default";
export const PLAYER_STAT_BLOCK_ID = "stat_block.player";
export const PLAYER_XP_CURVE_ID = "stat_curve.player_xp";
export const CRAFTING_STATION_TYPE = "crafting.station";
const NPC_TALK_RANGE = 2.5;
const FOG_CELL_M = 8;

// Ronde 10: namen van deelgebieden op de kaarten, midden in het gebied (meters).
function areaLabels(section) {
  const labels = [];
  for (const area of Array.isArray(section?.areas) ? section.areas : []) {
    const name = String(area?.displayName || "").trim();
    if (!name) continue;
    try {
      const box = areaBoundsMm(area);
      if (![box.minXMm, box.maxXMm, box.minZMm, box.maxZMm].every(Number.isFinite)) continue;
      labels.push({ id: area.areaId || name, name: name.slice(0, 40), x: (box.minXMm + box.maxXMm) / 2000, z: (box.minZMm + box.maxZMm) / 2000 });
    } catch { /* kapotte vorm: geen naam */ }
  }
  return labels;
}
// Getal uit Game-scherm (0 is ook een geldige keuze), anders de standaard; begrensd tot 0..max.
function fogPercent(value, fallback, max = 100) {
  const number = value === "" || value === null || value === undefined ? NaN : Number(value);
  return Math.max(0, Math.min(max, Number.isFinite(number) ? number : fallback));
}
const talkRangeOf = (npc) => (Number(npc?.talkRange) > 0 ? Number(npc.talkRange) : NPC_TALK_RANGE);
const STAT_IDS = { health: "stat.health", attackPower: "stat.attack_power", armor: "stat.armor", healPower: "stat.heal_power", mana: "stat.mana" };

const npcEntityId = (npcId, editor) => (editor ? EDITOR_DOC_PREFIX + "npc:" + npcId : "npc_entity." + npcId);
const npcTargetId = (npcId) => "target.npc." + npcId;
const npcDialogueId = (npcId) => "dialogue.npc." + npcId;
const scaleFromBp = (bp) => Math.max(0.01, (Number(bp) || 10000) / 10000);

function modelEntity({ id, label, modelAssetId, x, y, z, rotationX = 0, rotationY = 0, rotationZ = 0, scale = 1, solid = false, collisionRadius = 1, idleClip = null, flagId = null, flagOn = true }) {
  return Object.assign({
    id, nodeId: id, entityId: id, label, type: "model", modelAssetId: modelAssetId || null,
    animationClip: idleClip || null, idleAnimation: idleClip || null, walkAnimation: null, runAnimation: null,
    solid, walkable: false, collisionRadius,
    transform: { position: { x: Number(x) || 0, y: Number(y) || 0, z: Number(z) || 0 }, rotation: { x: Number(rotationX) || 0, y: Number(rotationY) || 0, z: Number(rotationZ) || 0 }, scale: { x: scale, y: scale, z: scale } }
  // Stap 9: alleen als een vlag aan (of uit) staat; de server laat hem per speler weg (zien, botsen, praten).
  }, flagId ? { flag: { id: flagId, on: flagOn !== false } } : {});
}

// Vaste HUD-modules (zelfde velden als de oude HUD-nodes), aan/uit via de kaart Game-scherm.
function hudModules(hud, { currencyIds, hasVendor, hasStation }) {
  const mod = (nodeType, values) => Object.assign({ nodeType, nodeId: "hud." + nodeType }, values);
  const modules = [];
  if (hud.showHealth) modules.push(mod("hud_bar", { moduleId: "hud.health", sourceStatRef: STAT_IDS.health, maxStatRef: null, label: "Levens", anchor: "top-center",
    widthPx: 220, heightPx: 18, showNumbers: true, showPercent: false, showCombatSummary: false, frameAssetId: null, fillAssetId: null }));
  if (hud.showHotbar) modules.push(mod("hotbar_hud", { moduleId: "hud.hotbar", loadoutId: "loadout.main", slotCount: 8, anchor: "bottom-center",
    showKeybinds: true, showCooldown: true, showCosts: true, mobileTouchEnabled: true }));
  if (hud.showXp) modules.push(mod("xp_hud", { moduleId: "hud.xp", anchor: "bottom-center", showLevel: true, showCurrentXp: true, showRequiredXp: true,
    showPercent: false, barFrameAssetId: null, barFillAssetId: null, levelLabel: "Level @{player.level}", xpLabel: "", compact: true }));
  if (hud.showBag) modules.push(mod("inventory_hud", { moduleId: "hud.inventory", anchor: "bottom-right", layout: "grid", columns: 5, showWeight: true,
    showFilters: true, allowStackSplit: false, allowDestroy: true }));
  if (hud.showEquipment) modules.push(mod("equipment_hud", { moduleId: "hud.equipment", anchor: "bottom-right" }));
  if (hud.showWallet) modules.push(mod("wallet_hud", { moduleId: "hud.wallet", title: "Geld", currencyRefs: currencyIds.slice(), itemRefs: [], maxEntries: 5, anchor: "top-right" }));
  // Zonder dit venster kan een verslagen speler niet terugkomen: altijd aan.
  modules.push(mod("death_respawn_hud", { moduleId: "hud.death_respawn", anchor: "center", showCountdown: true, showDestination: true }));
  if (hud.showEffects !== false) modules.push(mod("effects_hud", { moduleId: "hud.effects", anchor: "top-left" }));
  if (hud.showFloatNumbers !== false) modules.push(mod("float_numbers_hud", { moduleId: "hud.float_numbers", anchor: "center" }));
  if (hud.showInteractions) modules.push(mod("interaction_hud", { moduleId: "hud.interactions", title: "In de buurt", anchor: "center-right", layout: "panel",
    targetKinds: ["enemy", "resource", "pickup", "zone_link"], maxTargets: 8, rangeMode: "ability_range", showDistance: true, showHealth: true,
    showLootPreview: true, allowDemoReset: false }));
  if (hud.showQuests) {
    modules.push(mod("quest_tracker_hud", { moduleId: "hud.quest_tracker", anchor: "center-right", maxQuests: 3, showCompleted: true, showMarkers: true, allowQuestReset: false }));
    modules.push(mod("dialogue_hud", { moduleId: "hud.dialogue", anchor: "center", widthPx: 520, showSpeaker: true }));
    modules.push(mod("notification_hud", { moduleId: "hud.notifications", anchor: "top-center", maxVisible: 3, durationMs: 4500 }));
  }
  if (hud.showShop && hasVendor) modules.push(mod("vendor_hud", { moduleId: "hud.vendor", anchor: "center-right", maxOffers: 8, showSellTab: true }));
  if (hud.showShop && hasStation) modules.push(mod("crafting_hud", { moduleId: "hud.crafting", anchor: "center-right", maxRecipes: 8, showJobs: true }));
  return modules;
}

// Quest Builder stap 1: een quest is een netwerk van stappen (doelen, overgangen, eindes).
// De snelle Quest-kaart is al omgezet naar 1 stap + einde (game-compiler). version = vingerafdruk van de inhoud:
// een speler maakt een lopende quest af op de versie waarmee hij begon (quest-motor, tabel quest_versions).
function questObjective(objective, names, spawns = new Map()) {
  const spec = OBJECTIVE_KINDS[objective.type] || {};
  const record = { id: objective.objectiveId, objectiveType: objective.type, role: objective.role || "required",
    share: spec.event && objective.share === "team" ? "team" : "personal", requiredAmount: spec.amount ? Math.max(1, objective.amount || 1) : 1 };
  if (objective.type === "defeat") {
    record.actorRef = objective.targetId;
    // Stap 2: alleen opslaan als het afwijkt van de standaard (wie meevocht + groep in de buurt), zo blijft de versie gelijk.
    if (record.share === "personal" && (objective.credit === "fighters" || objective.credit === "nearby")) record.credit = objective.credit;
  } else if (objective.type === "gather") record.resourceRef = objective.targetId;
  else if (spec.refKind === "item_definition") record.itemRef = objective.targetId;
  // Stap 8: begeleiden heeft geen praat-doel; de NPC loopt mee (zie hieronder).
  const npcId = spec.npc ? objective.npcId : spec.refKind === "npc" && !spec.escort ? objective.targetId : null;
  if (npcId) {
    record.targetRef = npcTargetId(npcId);
    record.zoneRef = WORLD_ZONE_ID;
    record.radius = talkRangeOf(names.npcs.get(npcId));
  }
  // Stap 3: gebieden. Ga naar / verlaat = het gebied zelf; Alleen in gebied = een gebeurtenis telt alleen daar.
  if (spec.refKind === "area") record.areaRef = objective.targetId;
  if (spec.event && objective.areaId) record.inAreaRef = objective.areaId;
  // Kevin 5-11: ⭐ op de kaart (alleen als het aan staat, zo blijft de versie van bestaande quests gelijk).
  if (spec.mark && objective.mark === "star") record.mark = "star";
  // Stap 5: alleen de vijanden van deze verschijning tellen (alleen als gekozen, zo blijft de versie gelijk).
  const spawn = objective.type === "defeat" && objective.spawnId ? spawns.get(objective.spawnId) : null;
  if (spawn) record.spawnRef = spawn.spawnId;
  const what = spawn ? spawn.name || names.actor(objective.targetId) : objective.type === "defeat" ? names.actor(objective.targetId)
    : objective.type === "gather" ? names.resource(objective.targetId)
      : spec.refKind === "npc" ? names.npc(objective.targetId) : spec.refKind === "area" ? names.area(objective.targetId) : names.item(objective.targetId);
  const amount = spec.amount && record.requiredAmount > 1 ? record.requiredAmount + "× " : "";
  record.displayName = (spec.label || objective.type) + " " + amount + what + (spec.npc ? " naar " + names.npc(objective.npcId) : "")
    + (spec.escort && objective.areaId ? " naar " + names.area(objective.areaId) : "") + (record.inAreaRef ? " in " + names.area(record.inAreaRef) : "");
  // Stap 8: wie, waarheen, hoe, levens, wat hij zegt en wat er gebeurt als hij doodgaat (afwijkingen van de standaard alleen als gezet).
  if (spec.escort) {
    record.npcRef = objective.targetId;
    record.npcName = names.npc(objective.targetId);
    record.areaRef = objective.areaId || null;
    record.health = Math.max(1, objective.health || 100);
    if (objective.walk === "lead") record.walk = "lead";
    if (objective.say) record.say = objective.say;
    if (objective.death === "fail" || objective.death === "step") record.death = objective.death;
    if (objective.death === "step") record.deathTo = objective.deathTo || null;
    // Vecht mee (alleen als aan): schade per klap.
    if (objective.fight === true) { record.fight = true; record.power = Math.max(1, objective.power || 5); }
  }
  // Stap 7: de vraag, de antwoorden en wie kiest (ieder zelf staat er niet bij, dat is de standaard).
  if (objective.type === "choose") {
    record.question = objective.question || "";
    record.options = (objective.options || []).map((option) => ({ id: option.optionId, label: option.label || option.optionId, to: option.to }));
    if (objective.decide === "leader" || objective.decide === "vote") record.decide = objective.decide;
  }
  return record;
}

// XP + items/geld -> beloningsacties voor de quest-motor.
function rewardActions(xp, grants) {
  const rewards = [];
  if (xp > 0) rewards.push({ actionKind: "xp", amount: xp });
  for (const grant of grants) {
    if (grant.currencyId) rewards.push({ actionKind: "currency", currencyRef: grant.currencyId, amountMinor: grant.amount });
    else if (grant.abilityId) rewards.push({ actionKind: "ability", abilityRef: grant.abilityId });
    else rewards.push({ actionKind: "item", itemRef: grant.itemId, amount: grant.amount });
  }
  return rewards;
}

const REPEAT_MODES = { once: "once_per_character", always: "repeatable", daily: "daily", weekly: "weekly", cooldown: "cooldown" };

function questRecord(quest, names) {
  const spawns = new Map((Array.isArray(quest.spawns) ? quest.spawns : []).filter((spawn) => spawn.actorId).map((spawn) => [spawn.spawnId, spawn]));
  const steps = quest.steps.map((step) => {
    const objectives = step.kind === "step" ? step.objectives.map((objective) => questObjective(objective, names, spawns)) : [];
    const summary = objectives.filter((objective) => objective.role !== "hidden").map((objective) => objective.displayName).join(", ");
    const record = { id: step.stepId, kind: step.kind, displayName: step.title || summary || step.stepId, instruction: step.text || summary || step.title || "",
      match: step.match, objectives, next: step.kind === "step" ? step.next.map((to) => ({ to })) : [], conditions: [], rewards: [] };
    // Stap 3: alleen als er een gebied gekozen is (zo blijft de versie van bestaande quests gelijk).
    if (step.kind === "step" && step.mapAreaId) record.map = { areaRef: step.mapAreaId, show: step.mapShow || "area" };
    // Stap 5: Als → Dan (alleen als er regels zijn).
    if (step.kind === "step" && Array.isArray(step.rules) && step.rules.length) {
      record.rules = step.rules.map((rule) => Object.assign({ id: rule.ruleId, when: rule.when, objectiveRef: rule.objectiveId || null, amount: Math.max(1, rule.amount || 1),
        then: rule.then, spawnRef: rule.spawnId || null, text: rule.text || "" }, rule.then === "flag" ? { flagRef: rule.flagId || null, on: rule.on !== false } : {}));
    }
    // Stap 6: de klok (alleen als er een is).
    if (step.kind === "step" && step.timer) record.timer = Object.assign({}, step.timer);
    // Stap 7: de beloning van dit einde (bovenop die van de quest); rewardPick = de speler kiest 1 item/geld.
    if (step.kind === "end" && (step.xp > 0 || (Array.isArray(step.rewards) && step.rewards.length))) {
      record.rewards = rewardActions(step.xp, step.rewards || []);
      if (step.pick === true && (step.rewards || []).length >= 2) record.rewardPick = true;
    }
    // Stap 9: de wereld verandert bij dit einde (alleen als er vlaggen zijn).
    if (step.kind === "end" && Array.isArray(step.flags) && step.flags.length) record.flags = step.flags.map((flag) => ({ flagRef: flag.flagId, on: flag.on !== false }));
    return record;
  });
  const first = steps[0] || null;
  const giverTarget = quest.giverNpcId ? npcTargetId(quest.giverNpcId) : null;
  const rewards = rewardActions(quest.rewardXp, quest.rewards);
  const record = {
    id: quest.questId, graph: true, displayName: quest.displayName, description: quest.description || first?.instruction || "", summary: first?.instruction || "",
    steps, stepsById: Object.fromEntries(steps.map((step) => [step.id, step])), startStepRef: first?.id || null, rewards, conditions: [],
    startDialogueRef: quest.giverNpcId ? npcDialogueId(quest.giverNpcId) : null, turnInTargetRef: giverTarget,
    prerequisiteQuestRefs: quest.previousQuestId ? [quest.previousQuestId] : [], nextQuestRefs: [],
    autoTrack: true, repeatMode: REPEAT_MODES[quest.repeat] || (quest.repeatable ? "repeatable" : "once_per_character")
  };
  // Stap 6: elke dag/week vanaf een vast uur, of na een wachttijd (alleen dan, zo blijft de versie van andere quests gelijk).
  if (quest.repeat === "daily" || quest.repeat === "weekly") record.repeatHour = quest.repeatHour;
  if (quest.repeat === "cooldown") record.repeatMinutes = quest.repeatMinutes;
  if (quest.partyLeave === "wait" || quest.partyLeave === "fail") record.partyLeave = quest.partyLeave;
  // 5-11: plaatje in het startvenster (alleen als gekozen, zo blijft de versie gelijk).
  if (quest.imageAssetId) record.imageAssetId = quest.imageAssetId;
  // Stap 5: wat de quest laat verschijnen (alleen als er iets is).
  if (spawns.size) {
    record.spawns = Array.from(spawns.values()).map((spawn) => ({ id: spawn.spawnId, name: spawn.name || names.actor(spawn.actorId), actorRef: spawn.actorId,
      count: Math.max(1, Math.min(10, spawn.count || 1)), areaRef: spawn.areaId || null, audience: spawn.audience || "group", despawn: spawn.despawn || "quest" }));
  }
  // Stap 4: alleen als het afwijkt van de standaard (bij een NPC, geen voorwaarden), zo blijft de versie gelijk.
  if (quest.startMode === "item" || quest.startMode === "area" || quest.startMode === "auto" || quest.startMode === "world") {
    record.startMode = quest.startMode;
    if (quest.startMode === "item") record.startItemRef = quest.startItemId;
    if (quest.startMode === "area" || quest.startMode === "world") record.startAreaRef = quest.startAreaId;
    // Stap 9: wereld-event: elke zoveel minuten, zo lang; iedere keer is een nieuwe run.
    if (quest.startMode === "world") { record.eventEvery = quest.eventEvery; record.eventLasts = quest.eventLasts; record.repeatMode = "repeatable"; }
  }
  const rules = Array.isArray(quest.requirements?.rules) ? quest.requirements.rules : [];
  if (rules.length) {
    record.requirements = { match: quest.requirements.match === "any" ? "any" : "all", rules: rules.map((rule) => (rule.type === "level" ? { type: "level", min: rule.min }
      : rule.type === "item" ? { type: "item", itemRef: rule.id, amount: rule.amount || 1 }
        : rule.type === "quest" ? { type: "quest", questRef: rule.id }
          : rule.type === "flag" ? { type: "flag", flagRef: rule.id, on: rule.on !== false } : { type: "class", classRef: rule.id })) };
  }
  record.version = sha256(stableStringify(record)).slice(0, 16);
  return record;
}

// Eén gesprek per NPC: begroeting, dan per quest de keuze om hem aan te nemen (voorwaarde quest_available).
// Praten en inleveren voor een queststap zet de quest-motor er zelf bij (per speler en per questversie).
function npcDialogue(npc, quests, records) {
  const start = { id: "entry.start", entryType: "line", speakerName: npc.displayName, text: npc.greeting || "Hallo!", choices: [] };
  const entries = [start];
  let order = 0;
  for (const quest of quests) {
    if (quest.giverNpcId === npc.npcId) {
      const offerId = "entry.offer." + quest.questId;
      const ask = records.get(quest.questId)?.summary || "";
      start.choices.push({ id: "choice.ask." + quest.questId, label: "📜 " + quest.displayName, order: order++, action: "none", nextEntryRef: offerId,
        conditions: [{ conditionType: "quest_available", questRef: quest.questId }] });
      entries.push({ id: offerId, entryType: "line", speakerName: npc.displayName, text: quest.description || ask || quest.displayName, choices: [
        { id: "choice.accept." + quest.questId, label: "Ja, ik doe het!", order: 0, action: "accept_quest", questRef: quest.questId, closeAfterSelect: true, conditions: [] },
        { id: "choice.later." + quest.questId, label: "Nu niet", order: 1, action: "close", closeAfterSelect: true, conditions: [] }
      ] });
    }
  }
  start.choices.push({ id: "choice.bye", label: "Tot ziens", order: order++, action: "close", closeAfterSelect: true, conditions: [] });
  return { id: npcDialogueId(npc.npcId), displayName: npc.displayName, targetRef: npcTargetId(npc.npcId), entries,
    entriesById: Object.fromEntries(entries.map((entry) => [entry.id, entry])), startEntryRef: start.id };
}

const listOf = (records) => ({ byId: Object.fromEntries(records.map((record) => [record.id, record])), all: records });

function withGame(world, source, options) {
  const game = source.game || null;
  const editor = options.editor === true;
  const gameProject = world.gameProject;
  const catalogs = Object.assign({}, gameProject.catalogs);
  const items = catalogs.items || {};
  const itemName = (itemId) => items[itemId]?.displayName || itemId;
  const player = game?.player || (() => {
    const values = settingsValues("player_class", null);
    const project = settingsValues("project_settings", null);
    return { healthMax: values.healthMax, attackPower: values.attackPower, armor: values.armor, healPower: values.healPower, manaMax: values.manaMax,
      healthRegenBp: values.healthRegenBp, manaRegenBp: values.manaRegenBp,
      xpPerLevel: project.xpPerLevel, maxLevel: project.maxLevel, startGrants: [], models: [] };
  })();
  // Ook bij een oudere gepubliceerde game zonder nieuwere HUD-velden blijven de
  // schema-standaarden gelden.
  const hud = Object.assign(settingsValues("hud_settings", null), settingsValues("minimap_settings", null), game?.hud || {}, game?.minimap || {});
  const combat = game?.combat || settingsValues("combat_settings", null);
  const npcs = game?.npcs || [];
  const quests = game?.quests || [];
  const recipes = game?.recipes || [];

  // Speler: levens, kracht, pantser, XP-curve en start-spullen.
  catalogs.stats = {
    [STAT_IDS.health]: { id: STAT_IDS.health, statId: STAT_IDS.health, displayName: "Levens" },
    [STAT_IDS.attackPower]: { id: STAT_IDS.attackPower, statId: STAT_IDS.attackPower, displayName: "Kracht" },
    [STAT_IDS.armor]: { id: STAT_IDS.armor, statId: STAT_IDS.armor, displayName: "Pantser" },
    [STAT_IDS.healPower]: { id: STAT_IDS.healPower, statId: STAT_IDS.healPower, displayName: "Heal-kracht" },
    [STAT_IDS.mana]: { id: STAT_IDS.mana, statId: STAT_IDS.mana, displayName: "Mana" }
  };
  const statBlock = (id, values) => ({ id, entries: [
    { statRef: STAT_IDS.health, baseValue: values.healthMax },
    { statRef: STAT_IDS.attackPower, baseValue: values.attackPower },
    { statRef: STAT_IDS.armor, baseValue: values.armor },
    { statRef: STAT_IDS.healPower, baseValue: Number.isFinite(values.healPower) ? values.healPower : 5 },
    { statRef: STAT_IDS.mana, baseValue: Number.isFinite(values.manaMax) ? values.manaMax : 50 }
  ] });
  // Healing (2-11): regeneratie per klasse in basispunten per seconde (100 = 1 %/s), buiten gevecht.
  const regenBp = (value, fallback) => (Number.isInteger(value) && value >= 0 ? value : fallback);
  const character = (id, displayName, statBlockRef, values, extra = {}) => Object.assign({
    id, displayName, statBlockRef, startingAbilityRefs: [], defaultLoadoutId: "loadout.main",
    healthRegenBp: regenBp(values.healthRegenBp, 0), manaRegenBp: regenBp(values.manaRegenBp, 0),
    startingItemGrants: values.startGrants.filter((grant) => grant.itemId).map((grant) => ({ itemRef: grant.itemId, amount: grant.amount })),
    startingCurrencyGrants: values.startGrants.filter((grant) => grant.currencyId).map((grant) => ({ currencyRef: grant.currencyId, amountMinor: grant.amount }))
  }, extra);
  catalogs.statBlocks = { [PLAYER_STAT_BLOCK_ID]: statBlock(PLAYER_STAT_BLOCK_ID, player) };
  catalogs.statCurves = { [PLAYER_XP_CURVE_ID]: { id: PLAYER_XP_CURVE_ID, points: [{ x: 1, y: 0 }, { x: 2, y: player.xpPerLevel }] } };
  // Klassen: elke klasse een eigen character (elk account heeft er per klasse één); zonder klassen één standaardspeler.
  const classes = Array.isArray(player.classes) ? player.classes : [];
  if (classes.length) {
    catalogs.playableCharacters = {};
    for (const [index, entry] of classes.entries()) {
      const blockId = PLAYER_STAT_BLOCK_ID + "." + entry.classId;
      catalogs.statBlocks[blockId] = statBlock(blockId, entry);
      catalogs.playableCharacters[entry.classId] = character(entry.classId, entry.displayName, blockId, entry,
        { classChoice: true, description: entry.description || "", sortOrder: index, modelAssetIds: (entry.models || []).slice() });
    }
  } else {
    catalogs.playableCharacters = { [PLAYER_CHARACTER_ID]: character(PLAYER_CHARACTER_ID, "Speler", PLAYER_STAT_BLOCK_ID, player) };
  }
  // Valuta, recepten en winkels.
  const currencyList = Object.values(game?.currencies || {});
  catalogs.currencies = Object.fromEntries(currencyList.map((currency, index) => [currency.currencyId, {
    id: currency.currencyId, displayName: currency.displayName, iconAssetId: currency.iconAssetId || null, showInPrimaryWallet: true, sortOrder: index, enabled: true
  }]));
  catalogs.recipes = Object.fromEntries(recipes.map((recipe) => [recipe.recipeId, {
    id: recipe.recipeId, displayName: recipe.displayName, stationType: CRAFTING_STATION_TYPE, craftDurationMs: recipe.craftSeconds * 1000,
    unlockMode: "default_available", enabled: true, outputCurrencies: [],
    ingredients: recipe.ingredients.map((entry) => ({ kind: "item", itemRef: entry.itemId, amount: entry.amount, consume: true })),
    outputItems: [{ itemRef: recipe.outputItemId, amount: recipe.outputAmount }]
  }]));
  catalogs.vendorCatalogs = Object.fromEntries(npcs.filter((npc) => npc.shopOffers.length).map((npc) => ["vendor_catalog." + npc.npcId, {
    id: "vendor_catalog." + npc.npcId, displayName: npc.displayName,
    offers: npc.shopOffers.map((offer) => ({
      offerId: "offer." + npc.npcId + "." + offer.itemId, itemRef: offer.itemId, mode: offer.buyBack > 0 ? "both" : "sell_to_player",
      sellCurrencyRef: npc.shopCurrencyId, sellPriceMinor: offer.price, buyCurrencyRef: npc.shopCurrencyId, buyPriceMinor: offer.buyBack, stockMode: "infinite"
    }))
  }]));

  // NPC's: een model in de wereld, met praten, winkel en/of crafting.
  const zoneEntities = [];
  const questTargets = [];
  const entities = [];
  // Stap 9: NPC's en modellen die er alleen zijn als een vlag aan (of uit) staat.
  const flagGates = [];
  for (const npc of npcs) {
    const id = npcEntityId(npc.npcId, editor);
    const scale = scaleFromBp(npc.modelScaleBp);
    entities.push(modelEntity({ id, label: npc.displayName, modelAssetId: npc.modelAssetId, x: npc.x, y: npc.y, z: npc.z, rotationY: npc.rotationY,
      scale, solid: true, collisionRadius: 0.6, idleClip: npc.idleClip, flagId: editor ? null : npc.flagId, flagOn: npc.flagOn }));
    if (!editor && npc.flagId) flagGates.push({ entityId: id, npcId: npc.npcId, flagId: npc.flagId, on: npc.flagOn !== false });
    const components = [{ nodeType: "npc_component", componentId: "npc." + npc.npcId, npcRef: npc.npcId, linkedEntityId: id }];
    if (npc.shopOffers.length) components.push({ nodeType: "vendor_component", componentId: "vendor." + npc.npcId, linkedEntityId: id, vendorId: "vendor." + npc.npcId,
      vendorCatalogRef: "vendor_catalog." + npc.npcId, interactionPrompt: "Handelen", range: talkRangeOf(npc) + 0.5 });
    if (npc.crafting) components.push({ nodeType: "crafting_station_component", componentId: "station." + npc.npcId, linkedEntityId: id, stationId: "station." + npc.npcId,
      stationType: CRAFTING_STATION_TYPE, recipeRefs: [], range: talkRangeOf(npc) + 0.5, interactionPrompt: "Maken" });
    zoneEntities.push({ nodeType: "model_entity", nodeId: id, entityId: id, label: npc.displayName, modelAssetId: npc.modelAssetId || null,
      x: npc.x, y: npc.y, z: npc.z, rotationY: npc.rotationY, scaleX: scale, scaleY: scale, scaleZ: scale, components });
    questTargets.push({ nodeType: "quest_target", targetId: npcTargetId(npc.npcId), label: npc.displayName, targetKind: "npc", zoneRef: WORLD_ZONE_ID,
      entityRef: id, x: npc.x, y: npc.y, z: npc.z, radius: talkRangeOf(npc), clickRadius: 1.2, visibleInGame: true, prompt: "Praten",
      linkedEntity: { entityId: id, nodeId: id, label: npc.displayName, x: npc.x, y: npc.y, z: npc.z } });
  }
  // Losse modellen.
  for (const model of game?.placedModels || []) {
    entities.push(modelEntity({ id: editor ? EDITOR_DOC_PREFIX + "placed_model:" + model.placedModelId : "placed." + model.placedModelId, label: model.displayName,
      modelAssetId: model.modelAssetId, x: model.x, y: model.y, z: model.z, rotationX: model.rotationX, rotationY: model.rotationY, rotationZ: model.rotationZ, scale: model.scale,
      solid: model.solid, collisionRadius: model.collisionRadius, idleClip: model.idleClip, flagId: editor ? null : model.flagId, flagOn: model.flagOn }));
    if (!editor && model.flagId) flagGates.push({ entityId: "placed." + model.placedModelId, npcId: null, flagId: model.flagId, on: model.flagOn !== false });
  }
  // Portals (8-11): een model in de wereld; de server onthoudt per speler welke vrij zijn (zie runtime/portal-runtime.js).
  const portals = [];
  for (const portal of game?.portals || []) {
    const entityId = editor ? EDITOR_DOC_PREFIX + "portal:" + portal.portalId : "portal_entity." + portal.portalId;
    entities.push(modelEntity({ id: entityId, label: portal.displayName, modelAssetId: portal.modelAssetId, x: portal.x, y: portal.y, z: portal.z,
      rotationY: portal.rotationY, scale: portal.scale, flagId: editor ? null : portal.flagId, flagOn: portal.flagOn }));
    if (!editor && portal.flagId) flagGates.push({ entityId, npcId: null, flagId: portal.flagId, on: portal.flagOn !== false });
    portals.push(Object.assign({ id: portal.portalId, displayName: portal.displayName, x: Number(portal.x) || 0, y: Number(portal.y) || 0, z: Number(portal.z) || 0,
      rotationY: portal.rotationY, unlockMeters: portal.unlockMeters, arriveMeters: portal.arriveMeters, startUnlocked: portal.startUnlocked === true,
      respawnHere: portal.respawnHere !== false }, portal.flagId ? { flag: { id: portal.flagId, on: portal.flagOn !== false } } : {}));
  }
  // In de editor: vijand- en grondstofplekken als model (de game toont ze via de vijandenserver).
  if (editor && source.actors) {
    for (const spawn of source.actors.spawns || []) {
      const def = source.actors.archetypes?.[spawn.actorId] || {};
      entities.push(modelEntity({ id: EDITOR_DOC_PREFIX + "actor_spawn:" + spawn.spawnId, label: def.displayName || spawn.actorId, modelAssetId: def.modelAssetId,
        x: spawn.xMm / 1000, z: spawn.zMm / 1000, rotationY: spawn.rotationY, scale: scaleFromBp(def.modelScaleBp), idleClip: def.idleClip || null }));
    }
    for (const spawn of source.actors.resourceSpawns || []) {
      const def = source.actors.resources?.[spawn.resourceId] || {};
      entities.push(modelEntity({ id: EDITOR_DOC_PREFIX + "resource_spawn:" + spawn.resourceSpawnId, label: def.displayName || spawn.resourceId, modelAssetId: def.modelAssetId,
        x: spawn.xMm / 1000, z: spawn.zMm / 1000, rotationX: spawn.rotationX, rotationY: spawn.rotationY, rotationZ: spawn.rotationZ, scale: scaleFromBp(def.modelScaleBp) }));
    }
  }

  // Quests en gesprekken.
  const npcsById = new Map(npcs.map((npc) => [npc.npcId, npc]));
  // Stap 3: Questgebieden (punten in meters + midden en straal voor de kaart).
  const questAreas = (Array.isArray(game?.questAreas) ? game.questAreas : []).map((area) => {
    const points = Array.isArray(area.points) ? area.points.map((point) => ({ x: Number(point.x), z: Number(point.z) })) : [];
    const cx = points.length ? points.reduce((sum, point) => sum + point.x, 0) / points.length : 0;
    const cz = points.length ? points.reduce((sum, point) => sum + point.z, 0) / points.length : 0;
    const radius = points.length ? Math.max(...points.map((point) => Math.hypot(point.x - cx, point.z - cz))) : 0;
    return { id: area.areaId, displayName: area.displayName || area.areaId, points, center: { x: cx, z: cz }, radius };
  });
  const areasById = new Map(questAreas.map((area) => [area.id, area]));
  const names = { npcs: npcsById, npc: (id) => npcsById.get(id)?.displayName || id, item: itemName, area: (id) => areasById.get(id)?.displayName || id,
    actor: (id) => source.actors?.archetypes?.[id]?.displayName || id, resource: (id) => source.actors?.resources?.[id]?.displayName || id };
  // Oudere builds hebben nog geen stappen in de sectie: die quests worden 1 stap + einde zoals vroeger.
  const legacySteps = (quest) => (quest.goal === "visit"
    ? [{ stepId: "step.visit", kind: "step", title: "", text: "", match: "all", next: ["end"], objectives: [{ objectiveId: "objective.visit", type: "talk", targetId: quest.targetNpcId, npcId: null, amount: 1, role: "required" }] }]
    : [{ stepId: "step.deliver", kind: "step", title: "", text: "", match: "all", next: ["end"], objectives: [{ objectiveId: "objective.deliver", type: "deliver", targetId: quest.itemId, npcId: quest.targetNpcId || quest.giverNpcId, amount: quest.amount || 1, role: "required" }] }])
    .concat([{ stepId: "end", kind: "end", title: "Klaar", text: "", match: "all", next: [], objectives: [] }]);
  // Stap 4: een quest die niet bij een NPC start (item lezen, gebied, vanzelf) heeft geen NPC nodig.
  const questRecords = quests.filter((quest) => (quest.startMode && quest.startMode !== "npc") || npcsById.has(quest.giverNpcId))
    .map((quest) => questRecord(Array.isArray(quest.steps) ? quest : Object.assign({}, quest, { steps: legacySteps(quest) }), names));
  const recordsById = new Map(questRecords.map((record) => [record.id, record]));
  const usable = quests.filter((quest) => recordsById.has(quest.questId));
  const dialogues = npcs.map((npc) => npcDialogue(npc, usable, recordsById));
  const campaigns = Object.assign({}, gameProject.campaigns, { quests: listOf(questRecords), dialogues: listOf(dialogues), questAreas: listOf(questAreas),
    questCount: questRecords.length, dialogueCount: dialogues.length });
  // Stap 9: vlaggen (voor wie) en wat er alleen met een vlag staat. Alleen als er vlaggen zijn.
  const flagList = Array.isArray(game?.flags) ? game.flags : [];
  if (flagList.length || flagGates.length) {
    campaigns.flags = { byId: Object.fromEntries(flagList.map((flag) => [flag.flagId, { id: flag.flagId, displayName: flag.displayName, scope: flag.scope }])), gates: flagGates };
  }

  const playerRules = { id: "player_rules.main", policies: [], byType: {
    player_progression_rules: [{ id: "rules.progression", maxLevel: player.maxLevel, xpCurveRef: PLAYER_XP_CURVE_ID, baseStatBlockRef: PLAYER_STAT_BLOCK_ID }],
    // Healing (2-11): met hoeveel levens/mana je terugkomt en de regels voor regeneratie en effecten.
    death_respawn_rules: [{ id: "rules.respawn", healthRestorePercent: (Number(combat.respawnHealthPct) || 100) / 100,
      manaRestorePercent: (Number.isFinite(Number(combat.respawnManaPct)) ? Number(combat.respawnManaPct) : 100) / 100, staminaRestorePercent: 1 }],
    combat_rules: [{ id: "rules.combat", regenDelayMs: Math.max(0, Number(combat.regenDelayS) || 0) * 1000, effectStacking: combat.effectStacking || "refresh",
      maxEffects: Number(combat.maxEffects) || 8, clearBuffsOnDeath: combat.clearBuffsOnDeath !== false, levelUpRestore: combat.levelUpRestore !== false,
      shieldAutoPct: Number.isFinite(Number(combat.shieldAutoPct)) ? Number(combat.shieldAutoPct) : 25, shieldBackMs: Math.max(1, Number(combat.shieldBackS) || 15) * 1000 }],
    // Groep (MMO) (3-11): Instellingen > Groep. Zonder kaart de standaard; server en game lezen dit.
    party_rules: [Object.assign({ id: "rules.party" }, game?.party || partyValues(null))],
    chat_rules: [Object.assign({ id: "rules.chat" }, game?.chat || chatValues(null))]
  } };
  const modules = hudModules(hud, { currencyIds: currencyList.map((currency) => currency.currencyId),
    hasVendor: npcs.some((npc) => npc.shopOffers.length), hasStation: npcs.some((npc) => npc.crafting) });

  const patchZone = (pkg) => (pkg && pkg.zoneId === WORLD_ZONE_ID
    ? Object.assign({}, pkg, { entities: (pkg.entities || []).concat(zoneEntities), questTargets: (pkg.questTargets || []).concat(questTargets) })
    : pkg);
  const zones = gameProject.zones || {};
  const nextZones = Object.assign({}, zones, {
    packages: (zones.packages || []).map(patchZone),
    byId: Object.fromEntries(Object.entries(zones.byId || {}).map(([id, pkg]) => [id, patchZone(pkg)]))
  });
  // Algemene presentatie van interactieve doelen. De runtime meet per doel de echte mesh
  // en telt alleen deze ingestelde marge op; interactieafstand is dus geen klikvlak meer.
  const targetPresentation = {
    hitboxMarginPercent: Math.max(0, Math.min(200, Number(hud.clickAreaExtraPercent) || 0)),
    hitboxMarginMeters: Math.max(0, Math.min(10, Number(hud.clickAreaExtraMeters) || 0)),
    ringsVisible: hud.showWorldRings !== false,
    labelOffsetMeters: Math.max(0, Math.min(10, Number(hud.worldNameOffsetMeters) || 0)),
    labelFontSizePx: Math.max(8, Math.min(48, Number(hud.worldNameFontSizePx) || 13))
  };
  const mapNumber = (value, fallback, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : fallback));
  const mapColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback;
  const mapShapes = new Set(["dot", "diamond", "square", "triangle", "star", "pin", "portal", "cross", "ring", "arrow"]);
  const mapStyle = (key, fallback) => {
    const shape = String(hud["map" + key + "Icon"] || fallback.shape);
    return {
      label: String(hud["map" + key + "Label"] || fallback.label).slice(0, 40),
      color: mapColor(hud["map" + key + "Color"], fallback.color),
      shape: mapShapes.has(shape) ? shape : fallback.shape,
      showMini: hud["map" + key + "ShowMini"] !== false,
      showBig: hud["map" + key + "ShowBig"] !== false,
      // Kevin 8-11: eigen grootte per icoon (1 = normaal).
      size: mapNumber(hud["map" + key + "SizePct"], 100, 30, 300) / 100,
      // Kevin 8-11: namen naast de iconen per soort (de oude schakelaar "alle namen" blijft ook werken).
      namesMini: hud["map" + key + "NamesMini"] === true,
      namesBig: hud["map" + key + "NamesBig"] === true
    };
  };
  const mapStyles = {
    self: mapStyle("Self", { label: "Jij", color: "#ffffff", shape: "arrow" }),
    npc: mapStyle("Npc", { label: "NPC's", color: "#ffd34d", shape: "diamond" }),
    enemy: mapStyle("Enemy", { label: "Vijanden", color: "#ff4b4b", shape: "dot" }),
    resource: mapStyle("Resource", { label: "Grondstoffen", color: "#63d65f", shape: "dot" }),
    pickup: mapStyle("Pickup", { label: "Oppakken", color: "#8fe3ff", shape: "dot" }),
    player: mapStyle("Player", { label: "Spelers", color: "#4da3ff", shape: "dot" }),
    party: mapStyle("Party", { label: "Groepsleden", color: "#5ee07a", shape: "dot" }),
    portal: mapStyle("Portal", { label: "Portals", color: "#c77dff", shape: "portal" }),
    portal_locked: mapStyle("PortalLocked", { label: "Portal: nog niet vrij", color: "#8a7d99", shape: "portal" }),
    questgiver_available: mapStyle("QuestgiverAvailable", { label: "Questgever: quest te halen", color: "#ffe08a", shape: "star" }),
    questgiver: mapStyle("Questgiver", { label: "Questgever: geen nieuwe quest", color: "#d4a84a", shape: "star" }),
    quest: mapStyle("Quest", { label: "Quest-doel", color: "#ffb020", shape: "star" }),
    pin: mapStyle("Pin", { label: "Jouw pin", color: "#ff4fd8", shape: "pin" })
  };
  const mapDefaultZoom = { near: 0, normal: 1, far: 2 }[hud.mapMiniDefaultZoom] ?? 1;
  const mapPresentation = {
    minimapVisible: hud.mapMinimapVisible !== false,
    largeStartOpen: hud.mapLargeStartOpen === true,
    shape: hud.mapShape === "square" ? "square" : "round",
    rotate: hud.mapRotate === true,
    allowPin: hud.mapAllowPin !== false,
    clickToMove: hud.mapMiniClickToMove !== false,
    miniShowRegionName: hud.mapMiniShowRegionName !== false,
    bigShowRegionName: hud.mapBigShowRegionName !== false,
    bigShowScale: hud.mapBigShowScale !== false,
    bigShowCoordinates: hud.mapBigShowCoordinates !== false,
    miniSizePx: mapNumber(hud.mapMiniSizePx, 120, 64, 320),
    miniViewportPercent: mapNumber(hud.mapMiniViewportPercent, 22, 10, 40),
    zoomLevels: [
      mapNumber(hud.mapMiniZoomNearMeters, 30, 10, 1000),
      mapNumber(hud.mapMiniZoomNormalMeters, 60, 10, 2000),
      mapNumber(hud.mapMiniZoomFarMeters, 120, 10, 4000)
    ],
    defaultZoomIndex: mapDefaultZoom,
    bigSpanMeters: mapNumber(hud.mapBigSpanMeters, 160, 30, 10000),
    miniIconScale: mapNumber(hud.mapMiniIconScalePct, 100, 40, 250) / 100,
    bigIconScale: mapNumber(hud.mapBigIconScalePct, 80, 40, 250) / 100,
    miniFixedIconSize: hud.mapMiniFixedIconSize !== false,
    bigFixedIconSize: hud.mapBigFixedIconSize !== false,
    miniAreaTextScale: mapNumber(hud.mapMiniAreaTextScalePct, 100, 40, 250) / 100,
    bigAreaTextScale: mapNumber(hud.mapBigAreaTextScalePct, 100, 40, 250) / 100,
    miniShowMarkerNames: hud.mapMiniShowMarkerNames === true,
    bigShowMarkerNames: hud.mapBigShowMarkerNames === true,
    miniMarkerNameSizePx: mapNumber(hud.mapMiniMarkerNameSizePx, 10, 6, 32),
    bigMarkerNameSizePx: mapNumber(hud.mapBigMarkerNameSizePx, 12, 6, 40),
    backgroundColor: mapColor(hud.mapBackgroundColor, "#0b1220"),
    borderColor: mapColor(hud.mapBorderColor, "#b99446"),
    borderWidthPx: mapNumber(hud.mapBorderWidthPx, 3, 0, 12),
    area: {
      label: String(hud.mapAreaLabel || "Gebiedsnamen").slice(0, 40),
      color: mapColor(hud.mapAreaColor, "#f3e2b3"),
      showMini: hud.mapAreaShowMini !== false,
      showBig: hud.mapAreaShowBig !== false
    },
    markerNameColor: mapColor(hud.mapMarkerNameColor, "#ffffff"),
    fogColor: mapColor(hud.mapFogColor, "#05070a"),
    styles: mapStyles
  };
  const ui = Object.assign({}, gameProject.ui, { modules, targetPresentation });
  const nextProject = Object.assign({}, gameProject, { catalogs, campaigns, playerRules, ui, zones: nextZones });

  // Itemmeshes zijn zelfstandige assetgebruikers. Een pickup mag niet afhankelijk zijn van
  // een toevallige placed_model-instantie met hetzelfde GLB; anders wordt hij een placeholder
  // zodra die losse wereldplaatsing verdwijnt.
  const modelIds = Array.from(new Set(entities.map((entity) => entity.modelAssetId)
    .concat(Object.values(items).map((item) => item?.worldModelAssetId))
    // Stap 4 (HUD): eigen iconen van items en valuta (plaatjes in de tas).
    .concat(Object.values(items).map((item) => item?.iconAssetId))
    // Healing (2-11): icoontjes van effecten (items en aanvallen) in de HUD.
    .concat(Object.values(items).map((item) => item?.effectIconAssetId))
    .concat(Object.values(source.actors?.abilities || {}).map((ability) => ability?.effectIconAssetId))
    .concat(currencyList.map((currency) => currency.iconAssetId))
    // 5-11: plaatjes in het startvenster van quests.
    .concat(quests.map((quest) => quest?.imageAssetId))
    .concat((player.classes || []).flatMap((entry) => entry.models || [])).filter(Boolean)));
  const known = new Map((world.assets || []).map((asset) => [asset.id, asset]));
  // Paden van thumbnails kunnen na een import/migratie wijzigen zonder dat de
  // game opnieuw gepubliceerd hoeft te worden. Ververs daarom alle gebruikte
  // assets uit de bibliotheek; de originele sourcePath blijft de renderbron.
  const usedAssetIds = Array.from(new Set(Array.from(known.keys()).concat(modelIds)));
  if (usedAssetIds.length && options.assetService) {
    for (const asset of options.assetService.manifestForIds(usedAssetIds)) known.set(asset.id, asset);
  }
  const worldMusic = source.worldMusic || null;
  return Object.assign({}, world, {
    gameProject: nextProject,
    zones: nextZones,
    zonePackage: patchZone(world.zonePackage),
    entities: (world.entities || []).concat(entities),
    assets: Array.from(known.values()),
    worldMusic: worldMusic && worldMusic.url ? { assetId: worldMusic.assetId, url: worldMusic.url } : null,
    // Portals (8-11): plekken en regels (Instellingen > Portals). Zonder portals: lege lijst en de standaardregels.
    portals,
    portalRules: game?.portalRules || null,
    // Verbinding (3-11): Instellingen > Verbinding (MMO). Zonder kaart: null = de standaard van game en server.
    mmo: Object.assign({}, world.mmo || {}, { network: game?.network || null }),
    // Water (lopen) (3-11): Instellingen > Water (lopen). Zonder kaart: null = de standaard van de loopregels.
    terrain: Object.assign({}, world.terrain || {}, { waterWalk: game?.waterWalk || null }),
    // Stap 4 (HUD): fog of war op de minimap. De server onthoudt per speler welke vakjes van 8 m ontdekt zijn.
    minimap: editor ? world.minimap : Object.assign({}, world.minimap || {}, { game: Object.assign({}, world.minimap?.game || {}, {
      enabled: true, sourceMinimapId: "world", areaLabels: areaLabels(source.world),
      clickToMove: hud.mapMiniClickToMove !== false,
      questArrowDistanceMeters: fogPercent(hud.questArrowDistanceMeters, 200, 2000),
      presentation: mapPresentation,
      fogOfWar: { enabled: hud.fogOfWar !== false, cellSize: FOG_CELL_M, revealRadius: Math.max(1, Math.min(64, Math.round((Number(hud.fogRevealMeters) || 40) / FOG_CELL_M))),
        fogColor: mapPresentation.fogColor, fogOpacity: fogPercent(hud.fogDarkness, 100) / 100, fogFeatherRadius: fogPercent(hud.fogFadeMeters, 8, 64) / FOG_CELL_M,
        revealShape: "circle", saveIntervalMs: 1000, movementThreshold: 1 }
    }) })
  });
}
