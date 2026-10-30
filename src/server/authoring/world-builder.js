// Fundament zonder nodes (doelbeeld): de spelwereld wordt gebouwd uit één build (de kaarten) en de vaste
// systemen in deze code. Er is geen node-graph en geen oude gepubliceerde wereld als onderlaag.
//
//   build (server.json) ──► baseRuntimeWorld()  : wereld, grond, startplek, speler, camera, licht, catalogus
//                       └─► buildRuntimeWorld() : + items, pickups, vlakken, obstakels uit dezelfde build
//
// De uitkomst heeft precies het formaat dat de game (world-runtime.js) en de spelserver (mmo/node03) al lezen.
import { CANONICAL_KINDS } from "../../shared/authoring/kinds.js";
import { applyCanonicalBuild, EDITOR_DOC_PREFIX } from "./runtime-overlay.js";
import { settingsValues } from "./game-compiler.js";
import { areaBoundsMm } from "../../../apps/web/public/shared/spatial.js";
import { heightfieldForWorld } from "../../../apps/web/public/shared/movement-kernel.js";
import { terrainHeightAt, TERRAIN_CHUNK_METERS } from "../../../apps/web/public/shared/terrain.js";

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
    if (!texture || texture.archived || !texture.textureAssetId) continue;
    const docKey = texture.docKey || "terrain_texture:" + texture.textureId;
    textures[docKey] = { assetId: texture.textureAssetId, size: Number(texture.tileSize) || 4, url: null, name: texture.displayName || "" };
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
    paint: terrainPaintConfig(data, values) };
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
    terrain: { layers: [], surfaces: [], heightfield },
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
  return liftWorldOntoTerrain(full, heightfield);
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

function modelEntity({ id, label, modelAssetId, x, y, z, rotationY = 0, scale = 1, solid = false, collisionRadius = 1, idleClip = null }) {
  return {
    id, nodeId: id, entityId: id, label, type: "model", modelAssetId: modelAssetId || null,
    animationClip: idleClip || null, idleAnimation: idleClip || null, walkAnimation: null, runAnimation: null,
    solid, walkable: false, collisionRadius,
    transform: { position: { x: Number(x) || 0, y: Number(y) || 0, z: Number(z) || 0 }, rotation: { x: 0, y: Number(rotationY) || 0, z: 0 }, scale: { x: scale, y: scale, z: scale } }
  };
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

function questRecord(quest, npcsById, itemName) {
  const turnInNpcId = quest.targetNpcId || quest.giverNpcId;
  const target = npcTargetId(turnInNpcId);
  const targetName = npcsById.get(turnInNpcId)?.displayName || turnInNpcId;
  const step = quest.goal === "visit"
    ? { id: "step.visit", sequenceIndex: 0, displayName: "Ga naar " + targetName, instruction: "Ga naar " + targetName + ".", stepType: "reach",
      targetRef: target, zoneRef: WORLD_ZONE_ID, autoAdvance: true, conditions: [], rewards: [],
      objectives: [{ id: "objective.visit", objectiveType: "reach", targetRef: target, zoneRef: WORLD_ZONE_ID, radius: talkRangeOf(npcsById.get(turnInNpcId)) }] }
    : { id: "step.deliver", sequenceIndex: 0, displayName: "Breng " + quest.amount + "× " + itemName(quest.itemId) + " naar " + targetName,
      instruction: "Breng " + quest.amount + "× " + itemName(quest.itemId) + " naar " + targetName + ".", stepType: "deliver",
      targetRef: target, autoAdvance: true, conditions: [], rewards: [],
      objectives: [{ id: "objective.deliver", objectiveType: "deliver", itemRef: quest.itemId, requiredAmount: quest.amount, targetRef: target }] };
  const rewards = [];
  if (quest.rewardXp > 0) rewards.push({ actionKind: "xp", amount: quest.rewardXp });
  for (const grant of quest.rewards) {
    if (grant.currencyId) rewards.push({ actionKind: "currency", currencyRef: grant.currencyId, amountMinor: grant.amount });
    else rewards.push({ actionKind: "item", itemRef: grant.itemId, amount: grant.amount });
  }
  return {
    id: quest.questId, displayName: quest.displayName, description: quest.description || step.instruction, summary: step.instruction,
    steps: [step], stepsById: { [step.id]: step }, startStepRef: step.id, rewards, conditions: [],
    startDialogueRef: npcDialogueId(quest.giverNpcId), turnInTargetRef: target,
    prerequisiteQuestRefs: quest.previousQuestId ? [quest.previousQuestId] : [], nextQuestRefs: [],
    autoTrack: true, repeatMode: quest.repeatable ? "repeatable" : "once_per_character"
  };
}

// Eén gesprek per NPC: begroeting, dan per quest een keuze (aanbieden, inleveren of klaar melden).
// De keuzes verschijnen alleen als ze kunnen (voorwaarden quest_available / quest_turn_in / quest_reach_ready).
function npcDialogue(npc, quests, itemName) {
  const start = { id: "entry.start", entryType: "line", speakerName: npc.displayName, text: npc.greeting || "Hallo!", choices: [] };
  const entries = [start];
  let order = 0;
  for (const quest of quests) {
    if (quest.giverNpcId === npc.npcId) {
      const offerId = "entry.offer." + quest.questId;
      const ask = quest.goal === "visit" ? "" : "Breng " + quest.amount + "× " + itemName(quest.itemId) + ".";
      start.choices.push({ id: "choice.ask." + quest.questId, label: "📜 " + quest.displayName, order: order++, action: "none", nextEntryRef: offerId,
        conditions: [{ conditionType: "quest_available", questRef: quest.questId }] });
      entries.push({ id: offerId, entryType: "line", speakerName: npc.displayName, text: quest.description || ask || quest.displayName, choices: [
        { id: "choice.accept." + quest.questId, label: "Ja, ik doe het!", order: 0, action: "accept_quest", questRef: quest.questId, closeAfterSelect: true, conditions: [] },
        { id: "choice.later." + quest.questId, label: "Nu niet", order: 1, action: "close", closeAfterSelect: true, conditions: [] }
      ] });
    }
    if ((quest.targetNpcId || quest.giverNpcId) === npc.npcId) {
      const visit = quest.goal === "visit";
      start.choices.push({ id: "choice.done." + quest.questId, label: "✅ " + (visit ? "Klaar: " : "Inleveren: ") + quest.displayName, order: order++,
        action: visit ? "complete_quest" : "turn_in_quest", questRef: quest.questId, closeAfterSelect: true,
        conditions: [{ conditionType: visit ? "quest_reach_ready" : "quest_turn_in", questRef: quest.questId }] });
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
      xpPerLevel: project.xpPerLevel, maxLevel: project.maxLevel, startGrants: [], models: [] };
  })();
  const hud = game?.hud || settingsValues("hud_settings", null);
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
  const character = (id, displayName, statBlockRef, values, extra = {}) => Object.assign({
    id, displayName, statBlockRef, startingAbilityRefs: [], defaultLoadoutId: "loadout.main",
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
  for (const npc of npcs) {
    const id = npcEntityId(npc.npcId, editor);
    const scale = scaleFromBp(npc.modelScaleBp);
    entities.push(modelEntity({ id, label: npc.displayName, modelAssetId: npc.modelAssetId, x: npc.x, y: npc.y, z: npc.z, rotationY: npc.rotationY,
      scale, solid: true, collisionRadius: 0.6, idleClip: npc.idleClip }));
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
      modelAssetId: model.modelAssetId, x: model.x, y: model.y, z: model.z, rotationY: model.rotationY, scale: model.scale,
      solid: model.solid, collisionRadius: model.collisionRadius, idleClip: model.idleClip }));
  }
  // In de editor: vijand- en grondstofplekken als model (de game toont ze via de vijandenserver).
  if (editor && source.actors) {
    for (const spawn of source.actors.spawns || []) {
      const def = source.actors.archetypes?.[spawn.actorId] || {};
      entities.push(modelEntity({ id: EDITOR_DOC_PREFIX + "actor_spawn:" + spawn.spawnId, label: def.displayName || spawn.actorId, modelAssetId: def.modelAssetId,
        x: spawn.xMm / 1000, z: spawn.zMm / 1000, scale: scaleFromBp(def.modelScaleBp), idleClip: def.idleClip || null }));
    }
    for (const spawn of source.actors.resourceSpawns || []) {
      const def = source.actors.resources?.[spawn.resourceId] || {};
      entities.push(modelEntity({ id: EDITOR_DOC_PREFIX + "resource_spawn:" + spawn.resourceSpawnId, label: def.displayName || spawn.resourceId, modelAssetId: def.modelAssetId,
        x: spawn.xMm / 1000, z: spawn.zMm / 1000, scale: scaleFromBp(def.modelScaleBp) }));
    }
  }

  // Quests en gesprekken.
  const npcsById = new Map(npcs.map((npc) => [npc.npcId, npc]));
  const questRecords = quests.filter((quest) => npcsById.has(quest.giverNpcId) && npcsById.has(quest.targetNpcId || quest.giverNpcId))
    .map((quest) => questRecord(quest, npcsById, itemName));
  const usable = quests.filter((quest) => questRecords.some((record) => record.id === quest.questId));
  const dialogues = npcs.map((npc) => npcDialogue(npc, usable, itemName));
  const campaigns = Object.assign({}, gameProject.campaigns, { quests: listOf(questRecords), dialogues: listOf(dialogues),
    questCount: questRecords.length, dialogueCount: dialogues.length });

  const playerRules = { id: "player_rules.main", policies: [], byType: {
    player_progression_rules: [{ id: "rules.progression", maxLevel: player.maxLevel, xpCurveRef: PLAYER_XP_CURVE_ID, baseStatBlockRef: PLAYER_STAT_BLOCK_ID }]
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
  const ui = Object.assign({}, gameProject.ui, { modules });
  const nextProject = Object.assign({}, gameProject, { catalogs, campaigns, playerRules, ui, zones: nextZones });

  // Itemmeshes zijn zelfstandige assetgebruikers. Een pickup mag niet afhankelijk zijn van
  // een toevallige placed_model-instantie met hetzelfde GLB; anders wordt hij een placeholder
  // zodra die losse wereldplaatsing verdwijnt.
  const modelIds = Array.from(new Set(entities.map((entity) => entity.modelAssetId)
    .concat(Object.values(items).map((item) => item?.worldModelAssetId))
    // Stap 4 (HUD): eigen iconen van items en valuta (plaatjes in de tas).
    .concat(Object.values(items).map((item) => item?.iconAssetId))
    .concat(currencyList.map((currency) => currency.iconAssetId))
    .concat((player.classes || []).flatMap((entry) => entry.models || [])).filter(Boolean)));
  const known = new Map((world.assets || []).map((asset) => [asset.id, asset]));
  const missing = modelIds.filter((id) => !known.has(id));
  if (missing.length && options.assetService) for (const asset of options.assetService.manifestForIds(missing)) known.set(asset.id, asset);
  const worldMusic = source.worldMusic || null;
  return Object.assign({}, world, {
    gameProject: nextProject,
    zones: nextZones,
    zonePackage: patchZone(world.zonePackage),
    entities: (world.entities || []).concat(entities),
    assets: Array.from(known.values()),
    worldMusic: worldMusic && worldMusic.url ? { assetId: worldMusic.assetId, url: worldMusic.url } : null,
    // Stap 4 (HUD): fog of war op de minimap. De server onthoudt per speler welke vakjes van 8 m ontdekt zijn.
    minimap: editor ? world.minimap : Object.assign({}, world.minimap || {}, { game: Object.assign({}, world.minimap?.game || {}, {
      enabled: true, sourceMinimapId: "world", areaLabels: areaLabels(source.world),
      fogOfWar: { enabled: hud.fogOfWar !== false, cellSize: FOG_CELL_M, revealRadius: Math.max(1, Math.min(64, Math.round((Number(hud.fogRevealMeters) || 40) / FOG_CELL_M))),
        fogColor: "#05070a", fogOpacity: fogPercent(hud.fogDarkness, 100) / 100, fogFeatherRadius: fogPercent(hud.fogFadeMeters, 8, 64) / FOG_CELL_M,
        revealShape: "circle", saveIntervalMs: 1000, movementThreshold: 1 }
    }) })
  });
}
