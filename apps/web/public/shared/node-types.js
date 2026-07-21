// Shared node schema. Engine knows capabilities; concrete game content lives in node values.
// No content is seeded here except one technical Game Output node.
//
// Each field has a "default" used when a node is first created. These are EDITABLE
// starting values, not seeded content: a fresh database still has no world and the
// game stays 404 until you publish. Change any default below to taste.

export const GAME_ACTIONS = [
  "move_forward",
  "move_back",
  "move_left",
  "move_right",
  "sprint",
  "interact",
  "rotate_cam_left",
  "rotate_cam_right",
  "zoom_in",
  "zoom_out",
  "cancel"
];

export const DATA_TYPE_COLORS = {
  world: "#38bdf8",
  editorWorldSettings: "#0ea5e9",
  gameWorldSettings: "#f97316",
  ground: "#84cc16",
  terrain: "#22c55e",
  collision: "#ef4444",
  camera: "#6366f1",
  light: "#facc15",
  player: "#14b8a6",
  spawn: "#a3e635",
  entity: "#b000ff",
  interactable: "#ec4899",
  chunkLoading: "#06b6d4",
  keybind: "#f43f5e",
  ui: "#f8fafc",
  minimap: "#00ff66",
  zoneDef: "#1d4ed8",
  environment: "#2dd4bf",
  zoneRules: "#ea580c",
  area: "#a855f7",
  areaPackage: "#7e22ce",
  environmentOverride: "#0f766e",
  anchor: "#94a3b8",
  spawnPoint: "#bef264",
  checkpoint: "#4d7c0f",
  zoneLink: "#0e7490",
  discoveryDef: "#22d3ee",
  areaRule: "#fdba74",
  markerDef: "#e879f9",
  markerRule: "#be123c",
  audioAssignment: "#c084fc",
  path: "#fde047",
  encounterArea: "#dc2626",
  cameraOverride: "#818cf8",
  entityBase: "#c026d3",
  entityComponent: "#f472b6",
  questTarget: "#10b981",
  action: "#fb7185",
  zonePackageRef: "#075985",
  group: "#64748b"
};

export const DATA_TYPE_OPTIONS = Object.keys(DATA_TYPE_COLORS).filter(function (dataType) {
  return dataType !== "group";
});

function cloneDefaultValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === "function") {
    try { return structuredClone(value); } catch {}
  }
  return JSON.parse(JSON.stringify(value));
}

export function dataTypeColor(dataType) {
  return DATA_TYPE_COLORS[dataType] || "#6b7d8d";
}

export function isMultiValueDataType(dataType) {
  const output = NODE_TYPES?.game_output?.inputs?.[dataType];
  return Boolean(output?.multiple);
}

export function slugifyGroupPortName(value, fallback = "") {
  const raw = String(value || fallback || "").trim().toLowerCase();
  const slug = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || String(fallback || "").trim().toLowerCase() || "";
}

export function groupInterfaceDefault() {
  return {
    inputs: [
      {
        id: "input_keybinds",
        name: "keybinds_in",
        label: "Keybinds In",
        dataType: "keybind",
        multiple: true
      }
    ],
    outputs: [
      {
        id: "output_keybinds",
        name: "keybinds_out",
        label: "Keybinds",
        dataType: "keybind",
        multiple: true
      }
    ]
  };
}

const GAME_CAMERA_FIELDS = {
  cameraId: { label: "Camera id", type: "text", default: "main_camera", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
  pitch: { label: "Pitch (deg)", type: "number", default: 55, min: 20, max: 89, step: 1, required: true },
  yaw: { label: "Yaw (deg)", type: "number", default: 0, min: -360, max: 360, step: 1, required: true },
  startDistance: { label: "Start zoom", type: "number", default: 24, min: 2, max: 400, step: 0.5, required: true },
  distance: { label: "Legacy distance", type: "number", default: 24, min: 2, max: 400, step: 0.5, required: true, hidden: true },
  minDistance: { label: "Min zoom", type: "number", default: 10, min: 1, max: 400, step: 0.5, required: true },
  maxDistance: { label: "Max zoom", type: "number", default: 48, min: 2, max: 400, step: 0.5, required: true },
  fov: { label: "FOV", type: "number", default: 50, min: 20, max: 110, step: 1, required: true },
  targetHeightOffset: { label: "Target height offset", type: "number", default: 1.6, min: -10, max: 20, step: 0.05, required: true },
  follow: { label: "Follow player", type: "boolean", default: true, required: false },
  rotateSpeed: { label: "Rotate speed", type: "number", default: 90, min: 0, max: 360, step: 1, required: true }
};

const EDITOR_CAMERA_FIELDS = {
  cameraId: { label: "Camera id", type: "text", default: "editor_camera", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
  targetX: { label: "Target X", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
  targetY: { label: "Target Y", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
  targetZ: { label: "Target Z", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
  pitch: { label: "Pitch (deg)", type: "number", default: 55, min: 20, max: 89, step: 1, required: true },
  yaw: { label: "Yaw (deg)", type: "number", default: 0, min: -360, max: 360, step: 1, required: true },
  distance: { label: "Distance", type: "number", default: 24, min: 2, max: 400, step: 0.5, required: true },
  minDistance: { label: "Min zoom", type: "number", default: 10, min: 1, max: 400, step: 0.5, required: true },
  maxDistance: { label: "Max zoom", type: "number", default: 48, min: 2, max: 400, step: 0.5, required: true },
  fov: { label: "FOV", type: "number", default: 50, min: 20, max: 110, step: 1, required: true },
  rotateSpeed: { label: "Rotate speed", type: "number", default: 90, min: 0, max: 360, step: 1, required: true }
};

const WORLD_SETTINGS_SHARED_FIELDS = {
  worldId: { section: "Shared World", label: "World id", type: "text", default: "main_world", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
  displayName: { section: "Shared World", label: "Display name", type: "text", default: "My World", required: false, maxLength: 96 },
  backgroundColor: { section: "Shared World", label: "Background color", type: "color", default: "#101a26", required: false },
  fogColor: { section: "Shared World", label: "Fog color", type: "color", default: "#101a26", required: false },
  fogDensity: { section: "Shared World", label: "Fog density", type: "number", default: 0, min: 0, max: 1, step: 0.001, required: false },
  smoothShading: { section: "Shared World", label: "Smooth shading", type: "boolean", default: true, required: true }
};

export const WORLD_SHADOW_PRESET_NAMES = ["geen_schaduw", "lichte_schaduw", "middel_schaduw", "hoog_schaduw", "extreem_schaduw"];
export const WORLD_SETTINGS_PRESET_NAMES = WORLD_SHADOW_PRESET_NAMES;
export const WORLD_SHADOW_PRESET_OPTIONS = [
  { value: "geen_schaduw", label: "Geen schaduw" },
  { value: "lichte_schaduw", label: "Lichte schaduw" },
  { value: "middel_schaduw", label: "Middel schaduw" },
  { value: "hoog_schaduw", label: "Hoog schaduw" },
  { value: "extreem_schaduw", label: "Extreem schaduw" }
];

const WORLD_SHADOW_PRESET_ALIASES = {
  off: "geen_schaduw",
  potato: "geen_schaduw",
  low: "lichte_schaduw",
  laptop: "lichte_schaduw",
  balanced: "middel_schaduw",
  medium: "middel_schaduw",
  quality: "hoog_schaduw",
  high: "hoog_schaduw",
  extreem: "extreem_schaduw",
  extreme: "extreem_schaduw"
};

export function normalizeWorldSettingsPreset(value, fallback = "middel_schaduw") {
  const normalized = String(value || "").trim().toLowerCase();
  if (WORLD_SHADOW_PRESET_ALIASES[normalized]) return WORLD_SHADOW_PRESET_ALIASES[normalized];
  if (WORLD_SHADOW_PRESET_NAMES.includes(normalized)) return normalized;
  const normalizedFallback = String(fallback || "middel_schaduw").trim().toLowerCase();
  if (WORLD_SHADOW_PRESET_ALIASES[normalizedFallback]) return WORLD_SHADOW_PRESET_ALIASES[normalizedFallback];
  if (WORLD_SHADOW_PRESET_NAMES.includes(normalizedFallback)) return normalizedFallback;
  return "middel_schaduw";
}

function clonePresetValues(values) {
  return Object.fromEntries(Object.entries(values || {}).map(function ([key, value]) {
    return [key, cloneDefaultValue(value)];
  }));
}

function shadowLegacyQualityForMapSize(mapSize) {
  const size = Number(mapSize) || 0;
  if (size <= 0) return "off";
  if (size <= 512) return "low";
  if (size <= 1024) return "medium";
  return "high";
}

function buildShadowPreset(mode, preset, config) {
  const normalizedPreset = normalizeWorldSettingsPreset(preset, "middel_schaduw");
  const focusMode = mode === "editor" ? "editor_world_center_or_selected" : "player_or_spawn";
  const enabled = config.enabled !== false;
  const mapSize = Math.max(0, Math.floor(Number(config.mapSize) || 0));
  const cameraSize = Math.max(0, Number(config.cameraSize) || 0);
  const cameraFar = Math.max(0, Number(config.cameraFar) || 0);
  const bias = Number.isFinite(Number(config.bias)) ? Number(config.bias) : -0.0003;
  const normalBias = Number.isFinite(Number(config.normalBias)) ? Number(config.normalBias) : 0.04;
  const type = String(config.type || "pcf_soft").trim() || "pcf_soft";
  const updateMode = String(config.updateMode || "stable_snapped").trim() || "stable_snapped";
  const snapWorldUnits = Math.max(1, Math.floor(Number(config.snapWorldUnits) || 10));
  const shadowResidentMarginChunks = Math.max(0, Math.floor(Number(config.shadowResidentMarginChunks) || 0));
  const staticPropsCast = config.staticPropsCast !== false;
  const staticPropsReceive = config.staticPropsReceive !== false;
  const scatterCast = config.scatterCast === true;
  const scatterReceive = config.scatterReceive !== false;
  const groundReceives = config.groundReceives !== false;
  const terrainReceives = config.terrainReceives !== false;
  const legacyShadowQuality = shadowLegacyQualityForMapSize(mapSize);
  const legacyType = type === "pcf_soft" ? "pcfSoft" : (type === "pcf" ? "pcf" : "basic");
  return {
    preset: normalizedPreset,
    enabled: enabled,
    mapSize: mapSize,
    cameraSize: cameraSize,
    cameraNear: Math.max(0, Number(config.cameraNear) || 1),
    cameraFar: cameraFar,
    bias: bias,
    normalBias: normalBias,
    type: type,
    updateMode: updateMode,
    snapWorldUnits: snapWorldUnits,
    focusMode: focusMode,
    staticPropsCast: staticPropsCast,
    staticPropsReceive: staticPropsReceive,
    scatterCast: scatterCast,
    scatterReceive: scatterReceive,
    groundReceives: groundReceives,
    terrainReceives: terrainReceives,
    shadowResidentMarginChunks: shadowResidentMarginChunks,
    shadowsEnabled: enabled,
    shadowQuality: legacyShadowQuality,
    shadowMapSize: mapSize,
    shadowCameraSize: cameraSize,
    shadowCameraFar: cameraFar,
    shadowBias: bias,
    shadowNormalBias: normalBias,
    shadowType: legacyType,
    staticPropCastShadows: staticPropsCast,
    staticPropReceiveShadows: staticPropsReceive,
    scatterCastShadows: scatterCast,
    scatterReceiveShadows: scatterReceive,
    groundReceiveShadows: groundReceives,
    terrainReceiveShadows: terrainReceives
  };
}

export const EDITOR_WORLD_SETTINGS_PRESETS = {
  geen_schaduw: buildShadowPreset("editor", "geen_schaduw", {
    enabled: false,
    mapSize: 0,
    cameraSize: 0,
    cameraFar: 0,
    bias: 0,
    normalBias: 0,
    staticPropsCast: false,
    staticPropsReceive: false,
    scatterCast: false,
    scatterReceive: false,
    groundReceives: false,
    terrainReceives: false,
    shadowResidentMarginChunks: 0
  }),
  lichte_schaduw: buildShadowPreset("editor", "lichte_schaduw", {
    enabled: true,
    mapSize: 512,
    cameraSize: 90,
    cameraFar: 350,
    bias: -0.0003,
    normalBias: 0.04,
    staticPropsCast: true,
    staticPropsReceive: true,
    scatterCast: false,
    scatterReceive: true,
    groundReceives: true,
    terrainReceives: true,
    shadowResidentMarginChunks: 0
  }),
  middel_schaduw: buildShadowPreset("editor", "middel_schaduw", {
    enabled: true,
    mapSize: 1024,
    cameraSize: 100,
    cameraFar: 450,
    bias: -0.0003,
    normalBias: 0.04,
    staticPropsCast: true,
    staticPropsReceive: true,
    scatterCast: true,
    scatterReceive: true,
    groundReceives: true,
    terrainReceives: true,
    shadowResidentMarginChunks: 1
  }),
  hoog_schaduw: buildShadowPreset("editor", "hoog_schaduw", {
    enabled: true,
    mapSize: 2048,
    cameraSize: 120,
    cameraFar: 600,
    bias: -0.0003,
    normalBias: 0.04,
    staticPropsCast: true,
    staticPropsReceive: true,
    scatterCast: true,
    scatterReceive: true,
    groundReceives: true,
    terrainReceives: true,
    shadowResidentMarginChunks: 1
  }),
  extreem_schaduw: buildShadowPreset("editor", "extreem_schaduw", {
    enabled: true,
    mapSize: 4096,
    cameraSize: 140,
    cameraFar: 800,
    bias: -0.0003,
    normalBias: 0.04,
    staticPropsCast: true,
    staticPropsReceive: true,
    scatterCast: true,
    scatterReceive: true,
    groundReceives: true,
    terrainReceives: true,
    shadowResidentMarginChunks: 2
  })
};

export const GAME_WORLD_SETTINGS_PRESETS = {
  geen_schaduw: buildShadowPreset("game", "geen_schaduw", {
    enabled: false,
    mapSize: 0,
    cameraSize: 0,
    cameraFar: 0,
    bias: 0,
    normalBias: 0,
    staticPropsCast: false,
    staticPropsReceive: false,
    scatterCast: false,
    scatterReceive: false,
    groundReceives: false,
    terrainReceives: false,
    shadowResidentMarginChunks: 0
  }),
  lichte_schaduw: buildShadowPreset("game", "lichte_schaduw", {
    enabled: true,
    mapSize: 512,
    cameraSize: 75,
    cameraFar: 350,
    bias: -0.0003,
    normalBias: 0.04,
    staticPropsCast: true,
    staticPropsReceive: true,
    scatterCast: false,
    scatterReceive: true,
    groundReceives: true,
    terrainReceives: true,
    shadowResidentMarginChunks: 0
  }),
  middel_schaduw: buildShadowPreset("game", "middel_schaduw", {
    enabled: true,
    mapSize: 1024,
    cameraSize: 85,
    cameraFar: 450,
    bias: -0.0003,
    normalBias: 0.04,
    staticPropsCast: true,
    staticPropsReceive: true,
    scatterCast: true,
    scatterReceive: true,
    groundReceives: true,
    terrainReceives: true,
    shadowResidentMarginChunks: 1
  }),
  hoog_schaduw: buildShadowPreset("game", "hoog_schaduw", {
    enabled: true,
    mapSize: 2048,
    cameraSize: 100,
    cameraFar: 600,
    bias: -0.0003,
    normalBias: 0.04,
    staticPropsCast: true,
    staticPropsReceive: true,
    scatterCast: true,
    scatterReceive: true,
    groundReceives: true,
    terrainReceives: true,
    shadowResidentMarginChunks: 1
  }),
  extreem_schaduw: buildShadowPreset("game", "extreem_schaduw", {
    enabled: true,
    mapSize: 4096,
    cameraSize: 120,
    cameraFar: 800,
    bias: -0.0003,
    normalBias: 0.04,
    staticPropsCast: true,
    staticPropsReceive: true,
    scatterCast: true,
    scatterReceive: true,
    groundReceives: true,
    terrainReceives: true,
    shadowResidentMarginChunks: 2
  })
};

function modeFieldName(mode, key) {
  const prefix = mode === "editor" ? "editor" : "game";
  return prefix + key.charAt(0).toUpperCase() + key.slice(1);
}

function presetTableForMode(mode) {
  return mode === "editor" ? EDITOR_WORLD_SETTINGS_PRESETS : GAME_WORLD_SETTINGS_PRESETS;
}

export function worldSettingsPresetValues(mode, preset) {
  const normalized = normalizeWorldSettingsPreset(preset, "");
  if (!normalized) return null;
  const table = presetTableForMode(mode);
  return table[normalized] ? clonePresetValues(table[normalized]) : null;
}

export function worldSettingsPresetNodePatch(mode, preset) {
  const normalized = normalizeWorldSettingsPreset(preset, "middel_schaduw");
  const prefix = mode === "editor" ? "editor" : "game";
  return { [prefix + "Preset"]: normalized };
}

function worldSettingsModeHelpText(modeLabel, key) {
  const modeLower = modeLabel.toLowerCase();
  switch (key) {
    case "Preset":
    case "Shadow preset":
      return "Kies één shadow preset voor de " + modeLower + ". De engine vult daar de shadow-instellingen uit en toont geen losse shadow-tuners meer.";
    case "Pixel ratio cap":
      return "Beperkt de renderer naar deze maximale pixel ratio. Lager is sneller, hoger is scherper. Aanbevolen voor " + modeLower + ": hoger voor kwaliteit, lager voor laptop/mobiel.";
    case "Antialias":
      return "Schakelt antialiasing aan of uit. Aan is mooier maar iets zwaarder; uit is sneller en kan op laptop/mobiel beter zijn.";
    case "Fog":
      return "Schakelt fog aan of uit. Aan geeft meer diepte; uit is iets sneller en laat de wereld scherper zien.";
    case "Max FPS":
      return "Cap de renderloop. Lager is rustiger voor CPU/batterij; hoger voelt vloeiender. Aanbevolen voor editor en game: 60, lager voor laptop/potato.";
    case "Debug helpers":
      return "Toont selectie- en transform-hulplijnen. Uit is rustiger en iets lichter; aan is aanbevolen tijdens bouwen. Dit is alleen visueel; console warnings zijn een aparte toggle.";
    case "Debug warnings":
      return "Toont console warnings van three.js en de runtime. Uit is rustiger en voorkomt logspam in de gewone game; aan gebruik je tijdens debuggen.";
    case "Debug chunk overlay":
      return "Toont de chunk/terrain debug-overlay. Uit is standaard; aan gebruik je alleen om culling en streaming te inspecteren.";
    case "Chunk grid visible":
      return "Toont de chunk grid. Uit is rustiger; aan helpt bij culling en chunk-grenzen controleren.";
    case "Chunk labels visible":
      return "Toont chunk-labels. Uit is rustiger; aan helpt bij streaming- en debugcontrole.";
    case "Streaming debug visible":
      return "Toont extra streaming/debug-signalen. Uit is normaal gebruik; aan is alleen voor debuggen van chunk load/unload gedrag.";
    default:
      return "";
  }
}

function buildWorldSettingsModeFields(mode, defaults = {}, hidden = false) {
  const modeLabel = mode === "editor" ? "Editor" : "Game";
  const prefix = mode === "editor" ? "editor" : "game";
  const hide = hidden === true;
  const field = function (fieldName, fieldDef) {
    return hide ? Object.assign({ hidden: true }, fieldDef) : fieldDef;
  };
  const fields = {
    [prefix + "Preset"]: field("Preset", {
      section: "Preset",
      label: "Shadow preset",
      type: "select",
      options: WORLD_SHADOW_PRESET_OPTIONS,
      default: defaults.preset || "middel_schaduw",
      required: true,
      help: worldSettingsModeHelpText(modeLabel, "Shadow preset")
    }),
    [prefix + "PixelRatioCap"]: field("Pixel ratio cap", {
      section: "Render",
      label: "Pixel ratio cap",
      type: "number",
      default: defaults.pixelRatioCap,
      min: 0.5,
      max: 2,
      step: 0.05,
      required: true,
      help: worldSettingsModeHelpText(modeLabel, "Pixel ratio cap")
    }),
    [prefix + "Antialias"]: field("Antialias", {
      section: "Render",
      label: "Antialias",
      type: "boolean",
      default: defaults.antialias,
      required: true,
      help: worldSettingsModeHelpText(modeLabel, "Antialias")
    }),
    [prefix + "FogEnabled"]: field("Fog", {
      section: "Render",
      label: "Fog",
      type: "boolean",
      default: defaults.fogEnabled,
      required: true,
      help: worldSettingsModeHelpText(modeLabel, "Fog")
    }),
    [prefix + "MaxFps"]: field("Max FPS", {
      section: "Render",
      label: "Max FPS",
      type: "number",
      default: defaults.maxFps,
      min: 1,
      max: 240,
      step: 1,
      required: true,
      help: worldSettingsModeHelpText(modeLabel, "Max FPS")
    }),
    [prefix + "DebugHelpersVisible"]: field("Debug helpers", {
      section: "Render",
      label: "Debug helpers",
      type: "boolean",
      default: defaults.debugHelpersVisible,
      required: true,
      help: worldSettingsModeHelpText(modeLabel, "Debug helpers")
    }),
    [prefix + "DebugWarningsVisible"]: field("Debug warnings", {
      section: "Render",
      label: "Debug warnings",
      type: "boolean",
      default: defaults.debugWarningsVisible,
      required: true,
      help: worldSettingsModeHelpText(modeLabel, "Debug warnings")
    }),
    [prefix + "DebugChunkOverlayVisible"]: field("Debug chunk overlay", {
      section: "Render",
      label: "Debug chunk overlay",
      type: "boolean",
      default: defaults.debugChunkOverlayVisible,
      required: true,
      help: worldSettingsModeHelpText(modeLabel, "Debug chunk overlay")
    }),
    [prefix + "ChunkGridVisible"]: field("Chunk grid visible", {
      section: "Chunk/debug",
      label: "Chunk grid visible",
      type: "boolean",
      default: defaults.chunkGridVisible,
      required: true,
      help: worldSettingsModeHelpText(modeLabel, "Chunk grid visible")
    }),
    [prefix + "ChunkLabelsVisible"]: field("Chunk labels visible", {
      section: "Chunk/debug",
      label: "Chunk labels visible",
      type: "boolean",
      default: defaults.chunkLabelsVisible,
      required: true,
      help: worldSettingsModeHelpText(modeLabel, "Chunk labels visible")
    }),
    [prefix + "StreamingDebugVisible"]: field("Streaming debug visible", {
      section: "Chunk/debug",
      label: "Streaming debug visible",
      type: "boolean",
      default: defaults.streamingDebugVisible,
      required: true,
      help: worldSettingsModeHelpText(modeLabel, "Streaming debug visible")
    })
  };
  return fields;
}

const WORLD_SETTINGS_EDITOR_FIELDS = buildWorldSettingsModeFields("editor", {
  preset: "middel_schaduw",
  pixelRatioCap: 2,
  antialias: true,
  fogEnabled: false,
  maxFps: 60,
  debugHelpersVisible: true,
  debugWarningsVisible: true,
  debugChunkOverlayVisible: false,
  chunkGridVisible: true,
  chunkLabelsVisible: false,
  streamingDebugVisible: false
});

const WORLD_SETTINGS_GAME_FIELDS = buildWorldSettingsModeFields("game", {
  preset: "middel_schaduw",
  pixelRatioCap: 1,
  antialias: true,
  fogEnabled: true,
  maxFps: 60,
  debugHelpersVisible: false,
  debugWarningsVisible: false,
  debugChunkOverlayVisible: false,
  chunkGridVisible: false,
  chunkLabelsVisible: false,
  streamingDebugVisible: false
});

function chunkLoadingSharedFields(defaults = {}) {
  const {
    chunkProfileId = "editor_chunks",
    unloadMarginChunks = 2,
    unloadMarginMax = 50,
    maxLoadedChunks = 49,
    debugOverlay = true,
    terrainVisualChunkingEnabled = false,
    groundChunkingEnabled = true,
    pathWaterSurfaceChunkingEnabled = false,
    residentEntityBudget = 200,
    residentObjectBudget = 300,
    residentScatterInstanceBudget = 500,
    residentChunkBuildBudgetPerFrame = 2
  } = defaults;
  return {
    chunkProfileId: { label: "Chunk profile id", type: "text", default: chunkProfileId, required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
    enabled: { label: "Enabled", type: "boolean", default: true, required: true },
    chunkWidth: { label: "Chunk width", type: "number", default: 100, min: 1, max: 10000, step: 1, required: true },
    chunkDepth: { label: "Chunk depth", type: "number", default: 100, min: 1, max: 10000, step: 1, required: true },
    tileSize: { label: "Tile size", type: "number", default: 1, min: 0.01, max: 1000, step: 0.01, required: true },
    preloadMarginChunks: { label: "Preload margin", type: "number", default: 1, min: 0, max: 20, step: 1, required: true },
    unloadMarginChunks: { label: "Unload margin", type: "number", default: unloadMarginChunks, min: 0, max: unloadMarginMax, step: 1, required: true },
    maxLoadedChunks: { label: "Max loaded chunks", type: "number", default: maxLoadedChunks, min: 1, max: 10000, step: 1, required: true },
    debugOverlay: { label: "Debug overlay", type: "boolean", default: debugOverlay, required: true },
    residentEntityBudget: { label: "Resident entity budget", type: "number", default: residentEntityBudget, min: 0, max: 100000, step: 1, required: true },
    residentObjectBudget: { label: "Resident object budget", type: "number", default: residentObjectBudget, min: 0, max: 100000, step: 1, required: true },
    residentScatterInstanceBudget: { label: "Resident scatter budget", type: "number", default: residentScatterInstanceBudget, min: 0, max: 100000, step: 1, required: true },
    residentChunkBuildBudgetPerFrame: { label: "Resident build budget/frame", type: "number", default: residentChunkBuildBudgetPerFrame, min: 1, max: 1000, step: 1, required: true },
    groundChunkingEnabled: {
      label: "Ground chunking",
      type: "boolean",
      default: groundChunkingEnabled,
      required: true,
      help: "Schakelt de grote Ground Surface over naar chunk tiles. Uit betekent de oude full-ground route."
    },
    pathWaterSurfaceChunkingEnabled: {
      label: "Path/water/surface chunking",
      type: "boolean",
      default: pathWaterSurfaceChunkingEnabled,
      required: true,
      help: "Laat path, water en surface ook chunked renderen. Standaard uit om de seam-safe route intact te laten."
    },
    terrainVisualChunkingEnabled: {
      label: "Terrain visual chunking",
      type: "boolean",
      default: terrainVisualChunkingEnabled,
      required: true,
      help: "Chunk-aware terrain layer visuals. Dit staat los van ground chunking."
    }
  };
}

const EDITOR_CHUNK_LOADING_FIELDS = {
  ...chunkLoadingSharedFields({ chunkProfileId: "editor_chunks", unloadMarginChunks: 2, unloadMarginMax: 50, maxLoadedChunks: 49, debugOverlay: true, terrainVisualChunkingEnabled: false, groundChunkingEnabled: true, pathWaterSurfaceChunkingEnabled: false }),
  editorViewRadiusChunks: { label: "Editor view radius", type: "number", default: 2, min: 0, max: 50, step: 1, required: true },
  keepSelectedChunkLoaded: { label: "Keep selected chunk loaded", type: "boolean", default: true, required: true },
  showChunkGrid: { label: "Show chunk grid", type: "boolean", default: true, required: true },
  showChunkLabels: { label: "Show chunk labels", type: "boolean", default: false, required: true }
};

const GAME_CHUNK_LOADING_FIELDS = {
  ...chunkLoadingSharedFields({
    chunkProfileId: "game_chunks",
    unloadMarginChunks: 1,
    unloadMarginMax: 20,
    maxLoadedChunks: 81,
    debugOverlay: false,
    terrainVisualChunkingEnabled: true,
    groundChunkingEnabled: true,
    pathWaterSurfaceChunkingEnabled: true,
    residentEntityBudget: 200,
    residentObjectBudget: 300,
    residentScatterInstanceBudget: 500,
    residentChunkBuildBudgetPerFrame: 2
  }),
  chunkWidth: {
    label: "Chunk width",
    type: "number",
    default: 14,
    min: 1,
    max: 10000,
    step: 1,
    required: true,
    help: "Samen met Chunk depth en Tile size bepaalt dit de echte chunkgrootte. Kleine chunks geven scherpere streaming, maar maken maxLoadedChunks belangrijker."
  },
  chunkDepth: {
    label: "Chunk depth",
    type: "number",
    default: 14,
    min: 1,
    max: 10000,
    step: 1,
    required: true,
    help: "Samen met Chunk width en Tile size bepaalt dit de echte chunkgrootte. Houd dit gelijk aan Chunk width voor vierkante streaming."
  },
  tileSize: {
    label: "Tile size",
    type: "number",
    default: 0.5,
    min: 0.01,
    max: 1000,
    step: 0.01,
    required: true,
    help: "De wereldgrootte van één tile. Chunk width x depth x tile size bepaalt hoeveel world units een chunk inneemt."
  },
  cameraOnly: {
    label: "Camera only",
    type: "boolean",
    default: true,
    required: true,
    help: "Laat de game-chunk focus aan de camera vastplakken. Voor runtime streaming is dit meestal de snelste en meest stabiele stand."
  },
  gameViewRadiusChunks: {
    label: "Game view radius",
    type: "number",
    default: 3,
    min: 0,
    max: 20,
    step: 1,
    required: true,
    help: "De actieve radius rond de game camera in hele chunks. Dit is de belangrijkste snelheidsknop: verlaag hem tot de camera-frustum net past."
  },
  cameraOffsetZChunks: {
    label: "Camera Z offset (chunks)",
    type: "number",
    default: -1,
    min: -20,
    max: 20,
    step: 1,
    required: true,
    help: "Verplaatst het chunk-load center over de Z-as. Negatief = achter, positief = voor."
  },
  fixedCameraPaddingTiles: {
    label: "Camera padding tiles",
    type: "number",
    default: 0,
    min: 0,
    max: 10000,
    step: 1,
    required: true,
    help: "Extra marge buiten de camera in tiles. Pas zodra je minstens één hele chunk vult, telt dit mee als extra chunk. Kleine waarden onder één chunk hebben dus geen effect."
  },
  strictUnloadOutsideCamera: {
    label: "Strict unload outside camera",
    type: "boolean",
    default: true,
    required: true,
    help: "Houdt het resident window strak tegen de camera aan. Aan laat sneller opruimen buiten beeld; uit geeft meer speelruimte, maar ook meer resident chunks."
  },
  loadBudgetPerFrame: {
    label: "Load budget per frame",
    type: "number",
    default: 2,
    min: 1,
    max: 1000,
    step: 1,
    required: true,
    help: "Hoeveel nieuwe chunk-loads per frame mogen starten. Verhoog dit alleen als chunks te traag opbouwen; een hogere waarde kan kortere pieken geven."
  },
  maxLoadedChunks: {
    label: "Max loaded chunks",
    type: "number",
    default: 81,
    min: 1,
    max: 10000,
    step: 1,
    required: true,
    help: "Hard budget voor resident chunks. Zet dit minimaal op de volledige actieve vierkant; lager dan de actieve window veroorzaakt clipping en pop-in."
  },
  residentEntityBudget: {
    label: "Resident entity budget",
    type: "number",
    default: 200,
    min: 0,
    max: 100000,
    step: 1,
    required: true,
    help: "Soft cap voor entities in resident chunks. 0 is een harde throttle en kan preload-chunks met entities laten hangen tot ze direct zichtbaar worden."
  },
  residentObjectBudget: {
    label: "Resident object budget",
    type: "number",
    default: 300,
    min: 0,
    max: 100000,
    step: 1,
    required: true,
    help: "Soft cap voor objecten in resident chunks. Houd dit ruim genoeg om chunks vóór de camera te kunnen opbouwen."
  },
  residentScatterInstanceBudget: {
    label: "Resident scatter budget",
    type: "number",
    default: 500,
    min: 0,
    max: 100000,
    step: 1,
    required: true,
    help: "Soft cap voor scatter-instances in resident chunks. 0 houdt preload van scatter-heavy chunks effectief tegen."
  },
  residentChunkBuildBudgetPerFrame: {
    label: "Resident build budget/frame",
    type: "number",
    default: 2,
    min: 1,
    max: 1000,
    step: 1,
    required: true,
    help: "Hoeveel resident chunks per frame gebouwd mogen worden. Hogere waarden laden sneller in, lagere waarden geven rustiger frame-tijden."
  },
  terrainVisualChunkingEnabled: {
    label: "Terrain visual chunking",
    type: "boolean",
    default: true,
    required: true,
    help: "Chunk-aware terrain visuals. Aan is meestal sneller voor deze small-chunk setup, omdat de runtime minder hoeft te dragen aan één groot vlak."
  },
  groundChunkingEnabled: {
    label: "Ground chunking",
    type: "boolean",
    default: true,
    required: true,
    help: "Laat de Ground Surface in chunks renderen. Voor een snelle streaming-setup hoort dit doorgaans aan te staan."
  },
  pathWaterSurfaceChunkingEnabled: {
    label: "Path/water/surface chunking",
    type: "boolean",
    default: true,
    required: true,
    help: "Chunk-aware path, water en surface. Gebruik dit alleen als deze lagen echt chunky moeten mee lopen; anders is uitzetten lichter."
  }
};

function coerceGroupPort(port, fallbackName) {
  if (!port || typeof port !== "object") return null;
  const rawName = typeof port.name === "string" && port.name.trim()
    ? port.name.trim()
    : typeof port.id === "string" && port.id.trim()
      ? port.id.trim()
      : typeof fallbackName === "string" && fallbackName.trim()
        ? fallbackName.trim()
        : "";
  const name = slugifyGroupPortName(rawName, fallbackName);
  const dataType = typeof port.dataType === "string" && port.dataType.trim()
    ? port.dataType.trim()
    : typeof port.type === "string" && port.type.trim()
      ? port.type.trim()
      : "";
  if (!name || !dataType) return null;
  return {
    id: typeof port.id === "string" && port.id.trim() ? port.id.trim() : name,
    name: name,
    label: typeof port.label === "string" && port.label.trim() ? port.label.trim() : name,
    dataType: dataType,
    multiple: port.multiple === undefined ? isMultiValueDataType(dataType) : Boolean(port.multiple)
  };
}

export function normalizeGroupInterface(value) {
  const raw = value && typeof value === "object" ? value : {};
  const shouldUseDefault = Object.keys(raw).length === 0 && !Array.isArray(raw.inputs) && !Array.isArray(raw.outputs);
  if (shouldUseDefault) return groupInterfaceDefault();
  const inputs = Array.isArray(raw.inputs) ? raw.inputs : [];
  const outputs = Array.isArray(raw.outputs) ? raw.outputs : [];
  return {
    inputs: inputs.map(function (port, index) { return coerceGroupPort(port, "input_" + (index + 1)); }).filter(Boolean),
    outputs: outputs.map(function (port, index) { return coerceGroupPort(port, "output_" + (index + 1)); }).filter(Boolean)
  };
}

export function groupInterfaceForNode(node) {
  return normalizeGroupInterface(node?.values?.groupInterface);
}

export function portMapFromInterface(entries) {
  const map = {};
  for (const port of entries || []) {
    if (!port || typeof port !== "object") continue;
    if (typeof port.name !== "string" || !port.name.trim()) continue;
    const name = port.name.trim();
    const dataType = typeof port.dataType === "string" && port.dataType.trim()
      ? port.dataType.trim()
      : typeof port.type === "string" && port.type.trim()
        ? port.type.trim()
        : "";
    if (!dataType) continue;
    map[name] = {
      id: typeof port.id === "string" && port.id.trim() ? port.id.trim() : name,
      label: typeof port.label === "string" && port.label.trim() ? port.label.trim() : name,
      dataType: dataType,
      required: Boolean(port.required),
      multiple: port.multiple === undefined ? isMultiValueDataType(dataType) : Boolean(port.multiple)
    };
  }
  return map;
}

function portMapFromEntries(entries) {
  const map = {};
  for (const [portName, port] of Object.entries(entries || {})) {
    map[portName] = {
      label: port.label || portName,
      dataType: port.dataType,
      required: Boolean(port.required),
      multiple: port.multiple === undefined ? isMultiValueDataType(port.dataType) : Boolean(port.multiple),
      hidden: Boolean(port.hidden),
      internal: Boolean(port.internal),
      deprecated: Boolean(port.deprecated),
      help: port.help || ""
    };
  }
  return map;
}

function definePortAliases(map, aliases) {
  Object.defineProperty(map, "__aliases", {
    value: aliases,
    enumerable: false,
    configurable: true
  });
  return map;
}

export function resolveNodePorts(node, nodeMap) {
  const definition = NODE_TYPES[node?.type];
  if (!definition) return { inputs: {}, outputs: {} };
  if (node.type === "group") {
    const groupInterface = groupInterfaceForNode(node);
    const inputs = portMapFromInterface(groupInterface.inputs);
    const outputs = portMapFromInterface(groupInterface.outputs);
    return {
      inputs: definePortAliases(inputs, groupInterface.inputs),
      outputs: definePortAliases(outputs, groupInterface.outputs)
    };
  }
  if (node.type === "group_input") {
    const parent = nodeMap?.get(node.parentId);
    const groupInterface = parent ? groupInterfaceForNode(parent) : groupInterfaceDefault();
    const outputs = portMapFromInterface(groupInterface.inputs);
    return {
      inputs: {},
      outputs: definePortAliases(outputs, groupInterface.inputs)
    };
  }
  if (node.type === "group_output") {
    const parent = nodeMap?.get(node.parentId);
    const groupInterface = parent ? groupInterfaceForNode(parent) : groupInterfaceDefault();
    const inputs = portMapFromInterface(groupInterface.outputs);
    return {
      inputs: definePortAliases(inputs, groupInterface.outputs),
      outputs: {}
    };
  }
  return {
    inputs: portMapFromEntries(definition.inputs),
    outputs: portMapFromEntries(definition.outputs)
  };
}

export function resolveNodePort(node, portName, direction, nodeMap) {
  const ports = resolveNodePorts(node, nodeMap);
  const direct = direction === "input" ? (ports.inputs || {})[portName] || null : (ports.outputs || {})[portName] || null;
  if (direct) return direct;
  const aliases = direction === "input" ? ports.inputs?.__aliases : ports.outputs?.__aliases;
  if (!aliases) return null;
  const aliasMatch = aliases.find(function (port) {
    const aliasName = slugifyGroupPortName(port?.label, port?.name || "");
    return port?.id === portName || aliasName === portName || port?.name === portName;
  });
  if (!aliasMatch) return null;
  return {
    label: aliasMatch.label || aliasMatch.name || portName,
    dataType: aliasMatch.dataType,
    required: Boolean(aliasMatch.required),
    multiple: aliasMatch.multiple === undefined ? isMultiValueDataType(aliasMatch.dataType) : Boolean(aliasMatch.multiple)
  };
}

export const NODE_TYPES = {
  game_output: {
    label: "Game Output",
    group: "Output",
    accent: "#ffb454",
    description: "The only publish target for the runtime game.",
    inputs: {
      world: { label: "World", dataType: "world", required: true, multiple: false },
      editorWorldSettings: { label: "Editor World Settings", dataType: "editorWorldSettings", required: false, multiple: false },
      gameWorldSettings: { label: "Game World Settings", dataType: "gameWorldSettings", required: false, multiple: false },
      ground: { label: "Ground", dataType: "ground", required: true, multiple: false },
      camera: { label: "Camera", dataType: "camera", required: true, multiple: true },
      lights: { label: "Lights", dataType: "light", required: true, multiple: true },
      player: { label: "Player", dataType: "player", required: true, multiple: false },
      spawn: { label: "Spawn", dataType: "spawn", required: true, multiple: false },
      entities: { label: "Entities", dataType: "entity", required: false, multiple: true },
      interactables: { label: "Interactables", dataType: "interactable", required: false, multiple: true },
      chunkLoading: { label: "Chunk Loading", dataType: "chunkLoading", required: false, multiple: true },
      keybinds: { label: "Keybinds", dataType: "keybind", required: false, multiple: true },
      ui: { label: "UI", dataType: "ui", required: false, multiple: true },
      minimap: { label: "Minimap", dataType: "minimap", required: false, multiple: true },
      terrain: { label: "Terrain Layers", dataType: "terrain", required: false, multiple: true },
      collision: { label: "Collision", dataType: "collision", required: false, multiple: true }
    },
    outputs: {},
    fields: {
      publishTarget: { label: "Publish target", type: "text", default: "runtime_world", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" }
    }
  },

  world_settings: {
    label: "World Settings",
    group: "World",
    accent: "#7bd4ff",
    description: "Shared world identity and scene defaults. Editor/game performance lives in separate nodes.",
    inputs: {},
    outputs: { world: { label: "World", dataType: "world" } },
    fields: WORLD_SETTINGS_SHARED_FIELDS
  },

  editor_world_settings: {
    label: "Editor World Settings",
    group: "World",
    accent: "#8fd5ff",
    description: "Editor-only performance with one shadow preset dropdown plus debug settings.",
    inputs: {},
    outputs: { editorWorldSettings: { label: "Editor World Settings", dataType: "editorWorldSettings" } },
    fields: WORLD_SETTINGS_EDITOR_FIELDS
  },

  game_world_settings: {
    label: "Game World Settings",
    group: "World",
    accent: "#ffb454",
    description: "Game-only performance with one shadow preset dropdown plus debug settings.",
    inputs: {},
    outputs: { gameWorldSettings: { label: "Game World Settings", dataType: "gameWorldSettings" } },
    fields: WORLD_SETTINGS_GAME_FIELDS
  },

  editor_chunk_loading: {
    label: "Editor Chunk Loading",
    group: "World",
    accent: "#67d8c4",
    description: "Editor loading policy for showing more world chunks around the editor camera while authoring.",
    inputs: {},
    outputs: { chunkLoading: { label: "Chunk Loading", dataType: "chunkLoading" } },
    fields: EDITOR_CHUNK_LOADING_FIELDS
  },

  game_chunk_loading: {
    label: "Game Chunk Loading",
    group: "World",
    accent: "#67d8c4",
    description: "Game loading policy for keeping runtime chunks just outside the game camera. Tune the active chunk square to stay inside the frustum without clipping maxLoadedChunks.",
    inputs: {},
    outputs: { chunkLoading: { label: "Chunk Loading", dataType: "chunkLoading" } },
    fields: GAME_CHUNK_LOADING_FIELDS
  },

  ground_surface: {
    label: "Ground Surface",
    group: "World",
    accent: "#7bd4ff",
    description: "Runtime ground mesh and play-area bounds.",
    inputs: {},
    outputs: { ground: { label: "Ground", dataType: "ground" } },
    fields: {
      groundId: { label: "Ground id", type: "text", default: "main_ground", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      width: { label: "Width", type: "number", default: 60, min: 1, max: 10000, step: 1, required: true },
      depth: { label: "Depth", type: "number", default: 60, min: 1, max: 10000, step: 1, required: true },
      y: { label: "Y height", type: "number", default: 0, min: -1000, max: 1000, step: 0.01, required: true },
      boundsMode: {
        label: "Bounds mode",
        type: "select",
        options: ["centerSize", "explicitBounds"],
        default: "centerSize",
        required: true,
        help: "centerSize houdt de oude symmetrische grond; explicitBounds laat min/max per zijde toe."
      },
      minX: { label: "Min X", type: "number", default: -30, min: -10000, max: 10000, step: 0.01, required: false },
      maxX: { label: "Max X", type: "number", default: 30, min: -10000, max: 10000, step: 0.01, required: false },
      minZ: { label: "Min Z", type: "number", default: -30, min: -10000, max: 10000, step: 0.01, required: false },
      maxZ: { label: "Max Z", type: "number", default: 30, min: -10000, max: 10000, step: 0.01, required: false },
      materialColor: { label: "Material color", type: "color", default: "#3f6b3f", required: false },
      textureAssetId: { label: "Texture asset", type: "asset", assetTypes: ["texture", "image"], default: null, required: false },
      textureWorldSizeX: { label: "Texture world size X", type: "number", default: 10, min: 0.01, max: 10000, step: 0.01, required: false },
      textureWorldSizeZ: { label: "Texture world size Z", type: "number", default: 10, min: 0.01, max: 10000, step: 0.01, required: false },
      textureRepeat: { label: "Texture repeat", type: "number", default: 8, min: 1, max: 512, step: 1, required: false }
    }
  },

  terrain_layer: {
    label: "Terrain Layer",
    group: "Terrain",
    accent: "#7fcf68",
    description: "Basis materiaalgebieden zoals gras, zand, modder, steen, bloemen en dorpspleinen.",
    inputs: {},
    outputs: { terrain: { label: "Terrain", dataType: "terrain" } },
    fields: {
      layerId: { label: "Layer id", type: "text", default: "terrain_layer", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      label: { label: "Label", type: "text", default: "Village Grass", required: true, maxLength: 96 },
      material: { label: "Material", type: "select", options: ["grass", "sand", "stone", "mud", "flowers", "village_square"], default: "grass", required: true },
      priority: { label: "Priority", type: "number", default: 0, step: 1, required: true },
      opacity: { label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, required: true },
      color: { label: "Color", type: "color", default: "#6faa4f", required: true },
      textureAssetId: { label: "Texture asset", type: "asset", assetTypes: ["texture", "image"], default: null, required: false },
      shapeType: { label: "Shape type", type: "select", options: ["full", "polygon"], default: "full", required: true },
      points: { label: "Points", type: "json", default: [], required: false }
    }
  },

  surface_layer: {
    label: "Surface Layer",
    group: "Terrain",
    accent: "#8fbf6a",
    description: "Texture-first terrain surface voor paden, wegen, rivieren, modder, lava en sneeuw.",
    inputs: {},
    outputs: { terrain: { label: "Terrain", dataType: "terrain" } },
    fields: {
      surfaceId: { label: "Surface id", type: "text", default: "surface_main", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      label: { label: "Label", type: "text", default: "Surface", required: true, maxLength: 96 },
      surfaceKind: { label: "Surface kind", type: "select", options: ["path", "road", "water", "river", "mud", "lava", "snow", "custom"], default: "path", required: true },
      fallbackColor: { label: "Fallback color", type: "color", default: "#8a6f45", required: true },
      width: { label: "Width", type: "number", default: 3, min: 0.1, max: 10000, step: 0.1, required: true },
      yOffset: { label: "Y offset", type: "number", default: 0.02, min: -1000, max: 1000, step: 0.01, required: true },
      textureAssetId: { label: "Texture asset", type: "asset", assetTypes: ["texture", "image"], default: null, required: false },
      textureScaleX: { label: "Texture scale X", type: "number", default: 1, min: -1000, max: 1000, step: 0.01, required: true },
      textureScaleY: { label: "Texture scale Y", type: "number", default: 1, min: -1000, max: 1000, step: 0.01, required: true },
      textureScale: { label: "Texture scale (legacy)", type: "number", default: 4, min: 0.1, max: 200, step: 0.1, required: true },
      secondaryTextureAssetId: { label: "Secondary texture", type: "asset", assetTypes: ["texture", "image"], default: null, required: false },
      secondaryTextureScaleX: { label: "Secondary scale X", type: "number", default: 1, min: -1000, max: 1000, step: 0.01, required: true },
      secondaryTextureScaleY: { label: "Secondary scale Y", type: "number", default: 1, min: -1000, max: 1000, step: 0.01, required: true },
      secondaryTextureScale: { label: "Secondary scale (legacy)", type: "number", default: 8, min: 0.1, max: 200, step: 0.1, required: true },
      secondaryTextureStrength: { label: "Secondary strength", type: "number", default: 0.25, min: 0, max: 1, step: 0.01, required: true },
      edgeFadeWidth: { label: "Edge fade width", type: "number", default: 0.8, min: 0, max: 20, step: 0.05, required: true },
      edgeFadeNoiseAssetId: { label: "Edge noise asset", type: "asset", assetTypes: ["texture", "image"], default: null, required: false },
      edgeFadeNoiseScaleX: { label: "Edge noise scale X", type: "number", default: 1, min: -1000, max: 1000, step: 0.01, required: true },
      edgeFadeNoiseScaleY: { label: "Edge noise scale Y", type: "number", default: 1, min: -1000, max: 1000, step: 0.01, required: true },
      edgeFadeNoiseScale: { label: "Edge noise scale (legacy)", type: "number", default: 5, min: 0.1, max: 200, step: 0.1, required: true },
      edgeFadeNoiseStrength: { label: "Edge noise strength", type: "number", default: 0.35, min: 0, max: 1, step: 0.01, required: true },
      opacity: { label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, required: true },
      animated: { label: "Animated", type: "boolean", default: false, required: false },
      flowSpeed: { label: "Flow speed", type: "number", default: 0, min: -100, max: 100, step: 0.01, required: true },
      flowDirection: { label: "Flow direction", type: "number", default: 0, min: -360, max: 360, step: 1, required: true },
      flowTextureLayer: { label: "Flow texture layer", type: "select", options: ["main", "secondary", "both"], default: "main", required: true },
      blocksPlayer: { label: "Blocks player", type: "boolean", default: false, required: false },
      points: { label: "Points", type: "json", default: [], required: false }
    }
  },

  blocker_area: {
    label: "Blocker Area",
    group: "Collision",
    accent: "#f0b35a",
    description: "Berg, gat, muurgebied, diepe rand of verboden gebied.",
    inputs: {},
    outputs: { collision: { label: "Collision", dataType: "collision" } },
    fields: {
      blockerId: { label: "Blocker id", type: "text", default: "mountain_blocker_01", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      label: { label: "Label", type: "text", default: "Mountain Blocker", required: true, maxLength: 96 },
      shapeType: { label: "Shape type", type: "select", options: ["polygon", "box", "circle"], default: "polygon", required: true },
      x: { label: "X", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      z: { label: "Z", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      width: { label: "Width", type: "number", default: 4, min: 0.01, max: 10000, step: 0.01, required: true },
      depth: { label: "Depth", type: "number", default: 4, min: 0.01, max: 10000, step: 0.01, required: true },
      radius: { label: "Radius", type: "number", default: 2, min: 0.01, max: 10000, step: 0.01, required: true },
      points: { label: "Points", type: "json", default: [], required: false },
      reason: { label: "Reason", type: "select", options: ["mountain", "gap", "wall", "cliff", "forbidden"], default: "mountain", required: true }
    }
  },

  walkable_surface: {
    label: "Walkable Surface",
    group: "Collision",
    accent: "#f0b35a",
    description: "Bruggen, platforms en loopvlakken die op hoogte mogen lopen.",
    inputs: {},
    outputs: { collision: { label: "Collision", dataType: "collision" } },
    fields: {
      surfaceId: { label: "Surface id", type: "text", default: "bridge_walk_01", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      label: { label: "Label", type: "text", default: "Bridge Walk Surface", required: true, maxLength: 96 },
      x: { label: "X", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      y: { label: "Default Height (Y)", type: "number", default: 0.35, min: -10000, max: 10000, step: 0.01, required: true },
      z: { label: "Z", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      width: { label: "Width", type: "number", default: 6, min: 0.01, max: 10000, step: 0.01, required: true },
      depth: { label: "Depth", type: "number", default: 2.5, min: 0.01, max: 10000, step: 0.01, required: true },
      rotationY: { label: "Rotation Y", type: "number", default: 0, min: -360, max: 360, step: 0.1, required: true },
      priority: { label: "Priority", type: "number", default: 10, step: 1, required: true },
      points: { label: "Points", type: "json", default: [], required: false, hidden: true }
    }
  },

  game_camera: {
    label: "Game Camera",
    group: "World",
    accent: "#7bd4ff",
    description: "Follow camera tuned for a top-down game. Published to /game/.",
    inputs: {},
    outputs: { camera: { label: "Camera", dataType: "camera" } },
    fields: GAME_CAMERA_FIELDS
  },

  editor_camera: {
    label: "Editor Camera",
    group: "World",
    accent: "#7bd4ff",
    description: "Editor-only camera state. Never published to /game/.",
    inputs: {},
    outputs: { camera: { label: "Camera", dataType: "camera" } },
    fields: EDITOR_CAMERA_FIELDS
  },

  top_down_camera: {
    label: "Top-Down Camera",
    group: "World",
    accent: "#7bd4ff",
    description: "Legacy alias for Game Camera.",
    hidden: true,
    inputs: {},
    outputs: { camera: { label: "Camera", dataType: "camera" } },
    fields: GAME_CAMERA_FIELDS
  },

  ambient_light: {
    label: "Ambient Light",
    group: "World",
    accent: "#7bd4ff",
    description: "Scene-wide light.",
    inputs: {},
    outputs: { light: { label: "Light", dataType: "light" } },
    fields: {
      lightId: { label: "Light id", type: "text", default: "ambient_light", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      color: { label: "Color", type: "color", default: "#ffffff", required: true },
      intensity: { label: "Intensity", type: "number", default: 0.6, min: 0, max: 20, step: 0.01, required: true }
    }
  },

  directional_light: {
    label: "Directional Light",
    group: "World",
    accent: "#7bd4ff",
    description: "Directional light and shadow source.",
    inputs: {},
    outputs: { light: { label: "Light", dataType: "light" } },
    fields: {
      lightId: { label: "Light id", type: "text", default: "sun_light", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      color: { label: "Color", type: "color", default: "#ffffff", required: true },
      intensity: { label: "Intensity", type: "number", default: 1.4, min: 0, max: 20, step: 0.01, required: true },
      x: { label: "X", type: "number", default: 12, min: -1000, max: 1000, step: 0.01, required: true },
      y: { label: "Y", type: "number", default: 20, min: -1000, max: 1000, step: 0.01, required: true },
      z: { label: "Z", type: "number", default: 8, min: -1000, max: 1000, step: 0.01, required: true }
    }
  },

  player_character: {
    label: "Player Character",
    group: "Gameplay",
    accent: "#9be870",
    description: "The controllable player. Spawned at the connected Player Spawn.",
    inputs: {},
    outputs: { player: { label: "Player", dataType: "player" } },
    fields: {
      playerId: { label: "Player id", type: "text", default: "player", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      modelAssetId: { label: "Model asset", type: "asset", assetTypes: ["model"], default: null, required: true },
      animationClip: { label: "Animation clip", type: "select", options: [], dynamicOptions: "assetAnimations", default: null, required: false },
      idleAnimation: { label: "Idle animation", type: "select", options: [], dynamicOptions: "assetAnimations", default: null, required: false },
      walkAnimation: { label: "Walk animation", type: "select", options: [], dynamicOptions: "assetAnimations", default: null, required: false },
      runAnimation: { label: "Run animation", type: "select", options: [], dynamicOptions: "assetAnimations", default: null, required: false },
      moveSpeed: { label: "Move speed", type: "number", default: 6, min: 0.1, max: 100, step: 0.1, required: true },
      sprintMultiplier: { label: "Sprint x", type: "number", default: 1.6, min: 1, max: 2.5, step: 0.1, required: true },
      turnSpeed: { label: "Turn speed", type: "number", default: 540, min: 1, max: 4000, step: 1, required: true },
      collisionRadius: { label: "Collision radius", type: "number", default: 0.5, min: 0.05, max: 50, step: 0.05, required: true },
      scale: { label: "Model scale", type: "number", default: 1, min: 0.001, max: 1000, step: 0.01, required: true },
      showNameplate: { section: "Display", label: "Show name above character", type: "boolean", default: true, required: true, help: "Toont de naam van de ingelogde speler boven de character in de game." }
    }
  },

  player_spawn: {
    label: "Player Spawn",
    group: "Gameplay",
    accent: "#9be870",
    description: "Where the player starts.",
    inputs: {},
    outputs: { spawn: { label: "Spawn", dataType: "spawn" } },
    fields: {
      spawnId: { label: "Spawn id", type: "text", default: "main_spawn", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      x: { label: "X", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      z: { label: "Z", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      facing: { label: "Facing (deg)", type: "number", default: 0, min: -360, max: 360, step: 1, required: true }
    }
  },

  model_entity: {
    label: "Model Entity",
    group: "Entities",
    accent: "#d59bff",
    description: "A GLB-backed scene object. Drop a model asset in the viewport to create one.",
    inputs: {},
    outputs: { entity: { label: "Entity", dataType: "entity" } },
    fields: {
      entityId: { label: "Entity id", type: "text", default: "entity", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      label: { label: "Label", type: "text", default: "Entity", required: false, maxLength: 96 },
      modelAssetId: { label: "Model asset", type: "asset", assetTypes: ["model"], default: null, required: true },
      animationClip: { label: "Animation clip", type: "select", options: [], dynamicOptions: "assetAnimations", default: null, required: false },
      idleAnimation: { label: "Idle animation", type: "select", options: [], dynamicOptions: "assetAnimations", default: null, required: false },
      walkAnimation: { label: "Walk animation", type: "select", options: [], dynamicOptions: "assetAnimations", default: null, required: false },
      runAnimation: { label: "Run animation", type: "select", options: [], dynamicOptions: "assetAnimations", default: null, required: false },
      x: { label: "X", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      y: { label: "Y", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      z: { label: "Z", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      rotationX: { label: "Rotation X", type: "number", default: 0, min: -360, max: 360, step: 0.1, required: true },
      rotationY: { label: "Rotation Y", type: "number", default: 0, min: -360, max: 360, step: 0.1, required: true },
      rotationZ: { label: "Rotation Z", type: "number", default: 0, min: -360, max: 360, step: 0.1, required: true },
      scaleX: { label: "Scale X", type: "number", default: 1, min: 0.001, max: 1000, step: 0.01, required: true },
      scaleY: { label: "Scale Y", type: "number", default: 1, min: 0.001, max: 1000, step: 0.01, required: true },
      scaleZ: { label: "Scale Z", type: "number", default: 1, min: 0.001, max: 1000, step: 0.01, required: true },
      solid: { label: "Solid (blocks player)", type: "boolean", default: false, required: false },
      walkable: { label: "Walkable", type: "boolean", default: false, required: false },
      collisionRadius: { label: "Collision radius", type: "number", default: 1, min: 0.05, max: 100, step: 0.05, required: false }
    }
  },

  bounded_area_scatter: {
    label: "Bounded Area Scatter",
    group: "Entities",
    accent: "#d59bff",
    description: "Scatters selected model assets inside a bounded polygon or rectangle.",
    inputs: {},
    outputs: { entity: { label: "Entities", dataType: "entity", multiple: true } },
    fields: {
      scatterId: { label: "Scatter id", type: "text", default: "scatter", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      enabled: { label: "Enabled", type: "boolean", default: true, required: true },
      areaCenterX: { label: "Area center X", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      areaCenterZ: { label: "Area center Z", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      areaWidth: { label: "Area width", type: "number", default: 12, min: 0.01, max: 10000, step: 0.01, required: true },
      areaDepth: { label: "Area depth", type: "number", default: 12, min: 0.01, max: 10000, step: 0.01, required: true },
      areaRotationY: { label: "Area rotation Y", type: "number", default: 0, min: -360, max: 360, step: 0.1, required: true },
      count: { label: "Count", type: "number", default: 10, min: 0, max: 100000, step: 1, required: true },
      sourceAssetIds: { label: "Source assets", type: "json", default: [], required: true },
      sourceScaleMultipliers: { label: "Source scale multipliers", type: "json", default: {}, required: true, hidden: true },
      sourceNodeIds: { label: "Source meshes (legacy)", type: "json", default: [], required: true, hidden: true },
      randomObjectSelection: { label: "Random object selection", type: "boolean", default: false, required: true },
      boundaryBlocksPlayer: { label: "Boundary blocks player", type: "boolean", default: false, required: true },
      minSpacing: {
        section: "Placement",
        label: "Min spacing",
        type: "number",
        default: 0,
        min: 0,
        max: 1000,
        step: 0.05,
        required: true,
        help: "Minimale afstand tussen scatter instances. 0 houdt het oude gedrag."
      },
      edgeSpacing: {
        section: "Placement",
        label: "Edge spacing",
        type: "number",
        default: 0,
        min: 0,
        max: 1000,
        step: 0.05,
        required: true,
        help: "Minimale afstand tussen bomen op de rand. 0 gebruikt min spacing."
      },
      spacingStrength: {
        section: "Placement",
        label: "Spacing strength",
        type: "number",
        default: 0,
        min: 0,
        max: 100,
        step: 1,
        required: true,
        editorControl: "range",
        help: "0% houdt het oude scattergedrag. 100% probeert overlap zo hard mogelijk te voorkomen."
      },
      edgeJitter: {
        section: "Placement",
        label: "Edge jitter",
        type: "number",
        default: 20,
        min: 0,
        max: 100,
        step: 1,
        required: true,
        editorControl: "range",
        help: "Maakt de rand natuurlijker door randbomen licht naar binnen en langs de rand te variëren."
      },
      distributionMode: {
        section: "Placement",
        label: "Distribution mode",
        type: "select",
        options: [
          { value: "random", label: "Random" },
          { value: "blue_noise", label: "Blue noise" },
          { value: "dense_fill", label: "Dense fill" }
        ],
        default: "random",
        required: true,
        help: "Random houdt oud gedrag. Blue noise vermindert overlap. Dense fill probeert zichtbare gaten te beperken."
      },
      edgeDensity: {
        section: "Placement",
        label: "Edge density",
        type: "number",
        default: 0,
        min: 0,
        max: 100,
        step: 1,
        required: true,
        editorControl: "range",
        help: "0% houdt het huidige willekeurige binnenpunt-gedrag aan. 100% zet elke boom op de rand. Tussenin verschuift de scatter deterministisch naar de boundary."
      },
      seed: { label: "Seed", type: "text", default: "scatter_seed", required: true, maxLength: 128 },
      scaleMin: { label: "Scale min", type: "number", default: 1, min: 0.001, max: 1000, step: 0.01, required: true },
      scaleMax: { label: "Scale max", type: "number", default: 1, min: 0.001, max: 1000, step: 0.01, required: true },
      sizeInwardInfluence: {
        section: "Size",
        label: "Size inward influence",
        type: "number",
        default: 0,
        min: 0,
        max: 100,
        step: 1,
        required: true,
        editorControl: "range",
        help: "0% houdt de huidige random schaal tussen scale min en max. 100% laat schaal volledig afhangen van afstand tot de rand."
      },
      sizeCurve: {
        section: "Size",
        label: "Size curve",
        type: "select",
        options: [
          { value: "linear", label: "Linear" },
          { value: "smooth", label: "Smooth" },
          { value: "steep", label: "Steep" },
          { value: "instant", label: "Instant" }
        ],
        default: "linear",
        required: true,
        help: "Bepaalt hoe snel bomen van klein aan de rand naar groot richting het midden groeien."
      },
      rotationYMin: { label: "Rotation Y min", type: "number", default: 0, min: -360, max: 360, step: 0.1, required: true },
      rotationYMax: { label: "Rotation Y max", type: "number", default: 0, min: -360, max: 360, step: 0.1, required: true },
      points: { label: "Boundary points", type: "json", default: [], required: false, hidden: true }
    }
  },

  interactable: {
    label: "Interactable",
    group: "Gameplay",
    accent: "#9be870",
    description: "A point the player can interact with. Optionally backed by a model.",
    inputs: {},
    outputs: { interactable: { label: "Interactable", dataType: "interactable" } },
    fields: {
      interactableId: { label: "Interactable id", type: "text", default: "interactable", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      prompt: { label: "Prompt text", type: "text", default: "Press to interact", required: true, maxLength: 120 },
      x: { label: "X", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      z: { label: "Z", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      radius: { label: "Trigger radius", type: "number", default: 2, min: 0.1, max: 100, step: 0.1, required: true },
      modelAssetId: { label: "Model asset", type: "asset", assetTypes: ["model"], default: null, required: false },
      actionType: { label: "Action", type: "select", options: ["message", "teleport"], default: "message", required: true },
      message: { label: "Message", type: "text", default: "You found something!", required: false, maxLength: 240 },
      teleportX: { label: "Teleport X", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: false },
      teleportZ: { label: "Teleport Z", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: false }
    }
  },

  keybind: {
    label: "Keybind",
    group: "Input",
    accent: "#ff8da3",
    description: "Binds a keyboard key to a game action. The engine has no built-in controls.",
    inputs: {},
    outputs: { keybind: { label: "Keybind", dataType: "keybind" } },
    fields: {
      bindingId: { label: "Binding id", type: "text", default: "key_binding", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      action: { label: "Action", type: "select", options: GAME_ACTIONS, default: "move_forward", required: true },
      keyCode: { label: "Key code", type: "keycode", default: "KeyW", required: true, maxLength: 32 }
    }
  },

  ui_hud_text: {
    label: "HUD Text",
    group: "UI",
    accent: "#c9d4dc",
    description: "A data-driven HUD label rendered by the runtime.",
    inputs: {},
    outputs: { ui: { label: "UI", dataType: "ui" } },
    fields: {
      moduleId: { label: "Module id", type: "text", default: "hud_label", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-right", "bottom-left", "bottom-right", "center"], default: "top-left", required: true },
      text: { label: "Text", type: "text", default: "Label", required: true, maxLength: 200 },
      fontSize: { label: "Font size", type: "number", default: 18, min: 8, max: 96, step: 1, required: true },
      color: { label: "Color", type: "color", default: "#ffffff", required: true }
    }
  },

  debug_performance_hud: {
    label: "Performance HUD",
    group: "UI",
    accent: "#e0b15a",
    description: "A diagnostic HUD that reports runtime and selected game-loop cost for the published game world.",
    inputs: {},
    outputs: { ui: { label: "UI", dataType: "ui" } },
    fields: {
      hudId: { label: "HUD id", type: "text", default: "perf_hud", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      label: { label: "Label", type: "text", default: "Performance HUD", required: true, maxLength: 96 },
      enabled: { label: "Enabled", type: "boolean", default: true, required: true },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-right", "bottom-left", "bottom-right"], default: "top-right", required: true },
      compact: { label: "Compact layout", type: "boolean", default: true, required: true },
      updateIntervalMs: { label: "Update interval (ms)", type: "number", default: 500, min: 250, max: 5000, step: 50, required: true },
      showFps: { label: "Show FPS", type: "boolean", default: true, required: true },
      showFrameMs: { label: "Show frame ms", type: "boolean", default: true, required: true },
      showRenderer: { label: "Show renderer", type: "boolean", default: true, required: true },
      showDrawCalls: { label: "Show draw calls", type: "boolean", default: true, required: true },
      showTriangles: { label: "Show triangles", type: "boolean", default: true, required: true },
      showGeometries: { label: "Show geometries", type: "boolean", default: true, required: true },
      showTextures: { label: "Show textures", type: "boolean", default: true, required: true },
      showSceneObjects: { label: "Show scene objects", type: "boolean", default: true, required: true },
      showEntities: { label: "Show entities", type: "boolean", default: true, required: true },
      showScatterInstances: { label: "Show scatter instances", type: "boolean", default: true, required: true },
      showTerrainVisuals: { label: "Show terrain visuals", type: "boolean", default: true, required: true },
      showCollisionShapes: { label: "Show collision shapes", type: "boolean", default: true, required: true },
      showWorldSize: { label: "Show world size", type: "boolean", default: false, required: true },
      showChunkCulling: { label: "Show chunk culling", type: "boolean", default: false, required: true },
      showRemoteSyncMs: { section: "Game loop", label: "Show remote sync", type: "boolean", default: true, required: true, help: "Tonen hoeveel tijd de remote player sync per update kost." },
      showMovementStepMs: { section: "Game loop", label: "Show movement step", type: "boolean", default: true, required: true, help: "Tonen hoeveel tijd de lokale movement-step per update kost." },
      showMinimapDrawMs: { section: "Game loop", label: "Show minimap draw", type: "boolean", default: true, required: true, help: "Tonen hoeveel tijd het bijwerken van de minimap per draw kost." },
      fpsTarget: { label: "FPS target", type: "number", default: 60, min: 1, max: 240, step: 1, required: true },
      fpsWarn: { label: "FPS warning", type: "number", default: 45, min: 1, max: 240, step: 1, required: true },
      fpsDanger: { label: "FPS danger", type: "number", default: 30, min: 1, max: 240, step: 1, required: true },
      frameMsTarget: { label: "Frame ms target", type: "number", default: 16.7, min: 1, max: 100, step: 0.1, required: true },
      frameMsWarn: { label: "Frame ms warning", type: "number", default: 22, min: 1, max: 100, step: 0.1, required: true },
      frameMsDanger: { label: "Frame ms danger", type: "number", default: 33, min: 1, max: 100, step: 0.1, required: true },
      drawCallsWarn: { label: "Draw calls warning", type: "number", default: 80, min: 1, max: 10000, step: 1, required: true },
      drawCallsDanger: { label: "Draw calls danger", type: "number", default: 140, min: 1, max: 10000, step: 1, required: true },
      trianglesWarn: { label: "Triangles warning", type: "number", default: 100000, min: 1, max: 100000000, step: 1000, required: true },
      trianglesDanger: { label: "Triangles danger", type: "number", default: 250000, min: 1, max: 100000000, step: 1000, required: true },
      meshesWarn: { label: "Meshes warning", type: "number", default: 50, min: 1, max: 10000, step: 1, required: true },
      meshesDanger: { label: "Meshes danger", type: "number", default: 100, min: 1, max: 10000, step: 1, required: true },
      texturesWarn: { label: "Textures warning", type: "number", default: 24, min: 1, max: 10000, step: 1, required: true },
      texturesDanger: { label: "Textures danger", type: "number", default: 40, min: 1, max: 10000, step: 1, required: true },
      terrainVisualsWarn: { label: "Terrain visuals warning", type: "number", default: 40, min: 1, max: 10000, step: 1, required: true },
      terrainVisualsDanger: { label: "Terrain visuals danger", type: "number", default: 100, min: 1, max: 10000, step: 1, required: true },
      collisionShapesWarn: { label: "Collision shapes warning", type: "number", default: 50, min: 1, max: 10000, step: 1, required: true },
      collisionShapesDanger: { label: "Collision shapes danger", type: "number", default: 150, min: 1, max: 10000, step: 1, required: true }
    }
  },

  debug_mmo_hud: {
    label: "Debug MMO HUD",
    group: "UI",
    accent: "#7bd4ff",
    description: "A collapsible MMO diagnostics panel (WS status, session, position, revision, seq/ack, controller). Only visible in-game when connected to Game Output.",
    inputs: {},
    outputs: { ui: { label: "UI", dataType: "ui" } },
    fields: {
      hudId: { label: "HUD id", type: "text", default: "mmo_debug_hud", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      enabled: { label: "Enabled", type: "boolean", default: true, required: true },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-right", "bottom-left", "bottom-right"], default: "top-left", required: true },
      compact: { label: "Compact layout", type: "boolean", default: true, required: true },
      startCollapsed: { label: "Start collapsed", type: "boolean", default: true, required: true },
      showWsStatus: { label: "Show WS status", type: "boolean", default: true, required: true },
      showUser: { label: "Show user", type: "boolean", default: true, required: true },
      showPlayer: { label: "Show player", type: "boolean", default: true, required: true },
      showSession: { label: "Show session", type: "boolean", default: true, required: true },
      showPosition: { label: "Show position", type: "boolean", default: true, required: true },
      showRevision: { label: "Show revision", type: "boolean", default: true, required: true },
      showSessions: { label: "Show sessions", type: "boolean", default: true, required: true },
      showLastSent: { label: "Show last sent", type: "boolean", default: true, required: true },
      showLastSentSeq: { label: "Show last sent seq", type: "boolean", default: true, required: true },
      showLastAckedSeq: { label: "Show last acked seq", type: "boolean", default: true, required: true },
      showPendingInputs: { label: "Show pending inputs", type: "boolean", default: true, required: true },
      showController: { label: "Show controller", type: "boolean", default: true, required: true },
      showLastTransport: { label: "Show transport", type: "boolean", default: true, required: true },
      showLastIgnored: { label: "Show last ignored", type: "boolean", default: true, required: true },
      showServerSeq: { label: "Show server seq", type: "boolean", default: true, required: true },
      showLastReceived: { label: "Show last received", type: "boolean", default: true, required: true },
      showLastSource: { label: "Show last source", type: "boolean", default: true, required: true },
      showLastError: { label: "Show last error", type: "boolean", default: true, required: true },
      showWsRawState: { label: "Show WS raw", type: "boolean", default: true, required: true },
      showWsVisibleState: { label: "Show WS visible", type: "boolean", default: true, required: true },
      showReconnectAttempt: { label: "Show reconnect attempt", type: "boolean", default: true, required: true },
      showReconnectSuppressedCount: { label: "Show reconnect suppression", type: "boolean", default: true, required: true },
      showLastClose: { label: "Show last close", type: "boolean", default: true, required: true },
      showLastConnected: { label: "Show last connected", type: "boolean", default: true, required: true },
      showLastDisconnected: { label: "Show last disconnected", type: "boolean", default: true, required: true },
      showPing: { label: "Show ping", type: "boolean", default: true, required: true },
      showAvgPing: { label: "Show avg ping", type: "boolean", default: true, required: true },
      showJitter: { label: "Show jitter", type: "boolean", default: true, required: true },
      showLastPongAge: { label: "Show last pong age", type: "boolean", default: true, required: true },
      showPacketAge: { label: "Show packet age", type: "boolean", default: true, required: true },
      showRemoteBufferSizes: { label: "Show remote buffer sizes", type: "boolean", default: true, required: true },
      showRemoteHardSnapCount: { label: "Show remote hard snaps", type: "boolean", default: true, required: true },
      showRemoteSmoothFrameCount: { label: "Show remote smooth frames", type: "boolean", default: true, required: true },
      showLastRemoteEventType: { label: "Show last remote event", type: "boolean", default: true, required: true }
    }
  },

  minimap_bake: {
    label: "Minimap Bake",
    group: "UI",
    accent: "#ffcf5c",
    description: "Bakt een top-down minimap image vanuit de editor viewport/world.",
    inputs: {},
    outputs: { minimap: { label: "Minimap", dataType: "minimap" } },
    fields: {
      minimapId: { label: "Minimap id", type: "text", default: "main_minimap", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      label: { label: "Label", type: "text", default: "Main Minimap", required: true, maxLength: 96 },
      enabled: { label: "Enabled", type: "boolean", default: true, required: true },
      resolution: { label: "Resolution", type: "select", options: ["512", "768", "1024", "1536", "2048", "4096", "8192"], default: "2048", required: true, help: "De bake gebruikt altijd de hele Ground Surface, vierkant (1:1). Hoger = scherper bij inzoomen maar zwaarder om te bakken. 8192 is het maximum; 16k wordt door de meeste GPU's/browsers niet ondersteund." },
      imageQuality: { label: "Image quality", type: "number", default: 0.78, min: 0.1, max: 1, step: 0.01, required: true },
      includeStaticModels: { label: "Include static models", type: "boolean", default: true, required: true },
      includeInteractables: { label: "Include interactables", type: "boolean", default: false, required: true },
      hideEditorHelpers: { label: "Hide editor helpers", type: "boolean", default: true, required: true, help: "Verbergt transform controls, selection outlines, chunk debug grid en labels tijdens de bake. Echte wereldcontent (ground, terrain, modellen, licht, schaduw) blijft altijd zichtbaar." },
      bakedImageUrl: { label: "Baked image url", type: "text", default: "", required: false, maxLength: 300, hidden: true },
      bakedImageWidth: { label: "Baked image width", type: "number", default: 0, min: 0, max: 8192, step: 1, required: false, hidden: true },
      bakedImageHeight: { label: "Baked image height", type: "number", default: 0, min: 0, max: 8192, step: 1, required: false, hidden: true },
      bakedAt: { label: "Baked at", type: "text", default: "", required: false, maxLength: 64, hidden: true },
      bakedWorldHash: { label: "Baked world hash", type: "text", default: "", required: false, maxLength: 128, hidden: true },
      bakedBounds: { label: "Baked bounds", type: "json", default: null, required: false, hidden: true }
    }
  },

  game_minimap_hud: {
    label: "Game Minimap HUD",
    group: "UI",
    accent: "#8de0c0",
    description: "Toont de gebakken minimap in de game HUD met live 2D markers.",
    inputs: {},
    outputs: { minimap: { label: "Minimap", dataType: "minimap" } },
    fields: {
      hudId: { label: "HUD id", type: "text", default: "game_minimap", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      sourceMinimapId: { label: "Source minimap id", type: "text", default: "main_minimap", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      enabled: { label: "Enabled", type: "boolean", default: true, required: true },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-right", "bottom-left", "bottom-right"], default: "top-right", required: true },
      sizePx: { label: "Size (px)", type: "number", default: 180, min: 64, max: 512, step: 1, required: true },
      marginPx: { label: "Margin (px)", type: "number", default: 12, min: 0, max: 80, step: 1, required: true },
      borderRadiusPx: { label: "Border radius (px)", type: "number", default: 14, min: 0, max: 64, step: 1, required: true },
      backgroundOpacity: { label: "Background opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, required: true },
      markerUpdateMs: { label: "Marker update (ms)", type: "number", default: 100, min: 33, max: 1000, step: 1, required: true, help: "Begrenst hoe vaak de canvas markers herrekend worden." },
      debugMode: { label: "Debug mode", type: "boolean", default: false, required: true, help: "Aan: extra markers, labels en viewport cone tekenen. Uit: alleen de snelle minimap en je eigen speler." },
      liteMode: { label: "Legacy lite mode", type: "boolean", default: true, required: true, hidden: true },
      rotationMode: {
        label: "Rotation mode",
        type: "select",
        options: ["north_up", "player_facing", "camera_yaw"],
        default: "north_up",
        required: true,
        help: "In MMO-03 is alleen north_up volledig gegarandeerd; overige modi vallen veilig terug op north_up."
      },
      startDistance: { label: "Start character zoom distance", type: "number", default: 120, min: 5, max: 10000, step: 1, required: true, help: "Hoeveel world-units de minimap rond de character toont bij het openen/starten." },
      minDistance: { label: "Min zoom distance", type: "number", default: 20, min: 1, max: 10000, step: 1, required: true },
      maxDistance: { label: "Max zoom distance", type: "number", default: 1000, min: 1, max: 100000, step: 1, required: true },
      followPlayer: { label: "Follow player", type: "boolean", default: true, required: true, help: "Zolang de gebruiker niet handmatig pant/zoomt, volgt de minimap de character." },
      clickToMove: { label: "Click to move", type: "boolean", default: true, required: true, help: "Klik/tap op de minimap stuurt een move-intent naar de bestaande server-authoritative movement." },
      allowZoom: { label: "Allow zoom", type: "boolean", default: true, required: true },
      allowPan: { label: "Allow pan", type: "boolean", default: true, required: true },
      allowPinchZoom: { label: "Allow pinch zoom", type: "boolean", default: true, required: true },
      showLocalPlayer: { label: "Show local player", type: "boolean", default: true, required: true },
      showRemotePlayers: { label: "Show remote players", type: "boolean", default: true, required: true },
      showRemotePlayerNames: { label: "Show remote player names", type: "boolean", default: true, required: true },
      showPlayerName: { label: "Show local player name", type: "boolean", default: true, required: true },
      showSpawn: { label: "Show spawn", type: "boolean", default: false, required: true },
      showNpcEntities: { label: "Show NPC/model entities", type: "boolean", default: true, required: true },
      showInteractables: { label: "Show interactables", type: "boolean", default: false, required: true },
      showQuestMarkers: { label: "Show quest markers", type: "boolean", default: false, required: true },
      showEnemies: { label: "Show enemies", type: "boolean", default: false, required: true },
      showViewportCone: { label: "Show viewport cone", type: "boolean", default: true, required: true },
      clampOutsideMarkers: { label: "Clamp outside markers", type: "boolean", default: true, required: true },
      iconSizePx: { label: "Icon size (px)", type: "number", default: 9, min: 3, max: 48, step: 1, required: true },
      fontSizePx: { label: "Font size (px)", type: "number", default: 10, min: 6, max: 24, step: 1, required: true },
      nameMaxLength: { label: "Name max length", type: "number", default: 14, min: 3, max: 48, step: 1, required: true },
      zIndex: { label: "Z-index", type: "number", default: 20, min: 0, max: 999, step: 1, required: true }
    }
  },

  editor_minimap_hud: {
    label: "Editor Minimap",
    group: "UI",
    accent: "#c9a0ff",
    description: "Editor-only minimap overlay voor authoring. Wordt nooit als game-HUD gedrag gepubliceerd.",
    inputs: {},
    outputs: { minimap: { label: "Minimap", dataType: "minimap" } },
    fields: {
      hudId: { label: "HUD id", type: "text", default: "editor_minimap", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      sourceMinimapId: { label: "Source minimap id", type: "text", default: "main_minimap", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      enabled: { label: "Enabled", type: "boolean", default: true, required: true },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-right", "bottom-left", "bottom-right"], default: "bottom-right", required: true },
      sizePx: { label: "Size (px)", type: "number", default: 180, min: 64, max: 512, step: 1, required: true },
      expandedSizePx: { label: "Expanded size (px)", type: "number", default: 320, min: 128, max: 720, step: 1, required: true },
      startExpanded: { label: "Start expanded", type: "boolean", default: false, required: true },
      startDistance: { label: "Start editor camera zoom distance", type: "number", default: 120, min: 5, max: 10000, step: 1, required: true, help: "Hoeveel world-units de minimap rond de editor camera/viewport target toont bij openen." },
      minDistance: { label: "Min zoom distance", type: "number", default: 20, min: 1, max: 10000, step: 1, required: true },
      maxDistance: { label: "Max zoom distance", type: "number", default: 1000, min: 1, max: 100000, step: 1, required: true },
      followEditorCamera: { label: "Follow editor camera", type: "boolean", default: true, required: true, help: "Zolang de gebruiker niet handmatig pant/zoomt, volgt de minimap het editor camera target." },
      showEditorCamera: { label: "Show editor camera", type: "boolean", default: true, required: true },
      showEditorCameraViewBounds: { label: "Show editor camera view bounds", type: "boolean", default: true, required: true },
      showSelectedObject: { label: "Show selected object", type: "boolean", default: true, required: true },
      showPlayerSpawn: { label: "Show player spawn", type: "boolean", default: true, required: true },
      showModelEntities: { label: "Show model entities", type: "boolean", default: true, required: true },
      showEntityNames: { label: "Show entity names", type: "boolean", default: true, required: true },
      showInteractables: { label: "Show interactables", type: "boolean", default: true, required: true },
      showChunkGrid: { label: "Show chunk grid", type: "boolean", default: false, required: true },
      showBakeBounds: { label: "Show bake bounds", type: "boolean", default: true, required: true },
      clickToFocus: {
        label: "Click to focus",
        type: "boolean",
        default: true,
        required: true,
        help: "Wanneer aan: klik op de minimap zet de editor camera target naar world x/z, zonder node values te wijzigen."
      },
      allowZoom: { label: "Allow zoom", type: "boolean", default: true, required: true },
      allowPan: { label: "Allow pan", type: "boolean", default: true, required: true },
      allowPinchZoom: { label: "Allow pinch zoom", type: "boolean", default: true, required: true }
    }
  },

  group: {
    label: "Group",
    group: "Organize",
    accent: "#8a97a3",
    description: "A typed container with Group Input and Group Output proxies.",
    inputs: {},
    outputs: {},
    container: true,
    fields: {
      groupId: { label: "Group id", type: "text", default: "group", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      title: { label: "Title", type: "text", default: "New Group", required: true, maxLength: 96 },
      groupInterface: { label: "Group interface", type: "json", default: groupInterfaceDefault(), required: true }
    }
  },

  group_input: {
    label: "Group Input",
    group: "Organize",
    accent: "#8be0a8",
    description: "Locked system node that exposes the parent group inputs to the inside of the group.",
    inputs: {},
    outputs: {},
    system: true,
    locked: true,
    hidden: true,
    fields: {}
  },

  group_output: {
    label: "Group Output",
    group: "Organize",
    accent: "#8be0a8",
    description: "Locked system node that collects the internal outputs of the group.",
    inputs: {},
    outputs: {},
    system: true,
    locked: true,
    hidden: true,
    fields: {}
  }
};

export const STARTER_NODES = [
  { id: "node_output", type: "game_output", title: "Game Output", x: 1180, y: 320, parentId: null, values: { publishTarget: "runtime_world" } }
];

export const STARTER_EDGES = [];

export function defaultValuesForType(type) {
  const nodeType = NODE_TYPES[type];
  if (!nodeType || !nodeType.fields) return {};
  return Object.fromEntries(Object.entries(nodeType.fields).map(function (entry) {
    return [entry[0], cloneDefaultValue(entry[1].default === undefined ? null : entry[1].default)];
  }));
}

export function isContainer(type) {
  return Boolean(NODE_TYPES[type] && NODE_TYPES[type].container);
}

const FOUNDATION_REFERENCE_KINDS = [
  "project",
  "item",
  "ability",
  "currency",
  "zone",
  "quest",
  "target",
  "enemy",
  "npc",
  "audio",
  "vfx",
  "policy",
  "spawn",
  "tag"
];

const EXTRA_DATA_TYPE_COLORS = {
  value: "#8b5cf6",
  policy: "#00f0ff",
  projectSettings: "#2563eb",
  chunkGrid: "#0891b2",
  chunkPolicy: "#ff006e",
  legacyWorldPackage: "#78716c",
  globalValueDef: "#9333ea",
  tagDef: "#db2777",
  textTemplate: "#7c3aed",
  localizedTextDef: "#be185d",
  catalogDefinition: "#65a30d",
  catalogPackage: "#16a34a",
  catalogRegistry: "#15803d",
  zonePackage: "#0284c7",
  zoneRegistry: "#0369a1",
  campaignPackage: "#d97706",
  campaignRegistry: "#b45309",
  playerRules: "#0d9488",
  uiPackage: "#e11d48",
  gameProject: "#f59e0b"
};

Object.assign(DATA_TYPE_COLORS, EXTRA_DATA_TYPE_COLORS);
for (const dataType of Object.keys(EXTRA_DATA_TYPE_COLORS)) {
  if (!DATA_TYPE_OPTIONS.includes(dataType)) DATA_TYPE_OPTIONS.push(dataType);
}

export function normalizeGroupKind(value) {
  const kind = String(value || "generic").trim().toLowerCase();
  return ["generic", "catalog", "zone", "area", "campaign", "quest", "dialogue", "player_rules", "ui"].includes(kind) ? kind : "generic";
}

export function groupInterfacePresetForKind(groupKind) {
  const kind = normalizeGroupKind(groupKind);
  if (kind === "catalog") {
    return { inputs: [], outputs: [{ id: "catalog_package", name: "catalogPackage", label: "Catalog Package", dataType: "catalogPackage", multiple: false }] };
  }
  if (kind === "zone") {
    return { inputs: [], outputs: [{ id: "zone_package", name: "zonePackage", label: "Zone Package", dataType: "zonePackage", multiple: false }] };
  }
  if (kind === "area") {
    return { inputs: [], outputs: [{ id: "area_package", name: "areaPackage", label: "Area Package", dataType: "areaPackage", multiple: false }] };
  }
  if (kind === "campaign") {
    return { inputs: [], outputs: [{ id: "campaign_package", name: "campaignPackage", label: "Campaign Package", dataType: "campaignPackage", multiple: false }] };
  }
  if (kind === "player_rules") {
    return { inputs: [], outputs: [{ id: "player_rules", name: "playerRules", label: "Player Rules", dataType: "playerRules", multiple: false }] };
  }
  if (kind === "ui") {
    return { inputs: [], outputs: [{ id: "ui_package", name: "uiPackage", label: "UI Package", dataType: "uiPackage", multiple: false }] };
  }
  return groupInterfaceDefault();
}

const GAME_OUTPUT_BASE = NODE_TYPES.game_output;
const FOUNDATION_NODE_DEFS = {
  game_project_settings: {
    label: "Game Project Settings",
    group: "Project",
    accent: "#8fd5ff",
    description: "Root project settings for the published game project.",
    inputs: {},
    outputs: { projectSettings: { label: "Project Settings", dataType: "projectSettings" } },
    fields: {
      projectId: { label: "Project id", type: "identity", default: "gk.project", required: true, maxLength: 160, pattern: "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$" },
      gameName: { label: "Game name", type: "text", default: "GK Game", required: true, maxLength: 120 },
      defaultLanguage: { label: "Default language", type: "identity", default: "nl", required: true, maxLength: 16, pattern: "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$" },
      contentVersion: { label: "Content version", type: "text", default: "0.1.0", required: true, maxLength: 32 },
      startZoneRef: { label: "Start zone", type: "reference", referenceKinds: ["zone"], allowNull: true, default: null, required: false, maxLength: 160 },
      startSpawnRef: { label: "Start spawn", type: "reference", referenceKinds: ["spawn"], allowNull: true, default: null, required: false, maxLength: 160 },
      allowLegacyWorld: { label: "Allow legacy world", type: "boolean", default: true, required: true, hidden: true }
    }
  },
  chunk_grid_definition: {
    label: "Chunk Grid Definition",
    group: "Project",
    accent: "#67d8c4",
    description: "Global chunk grid definition for the published project.",
    inputs: {},
    outputs: { chunkGrid: { label: "Chunk Grid", dataType: "chunkGrid" } },
    fields: {
      gridId: { label: "Grid id", type: "identity", default: "chunk_grid.main", required: true, maxLength: 160, pattern: "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$" },
      chunkWidth: { label: "Chunk width", type: "number", default: 14, min: 14, max: 14, step: 1, required: true, locked: true },
      chunkDepth: { label: "Chunk depth", type: "number", default: 14, min: 14, max: 14, step: 1, required: true, locked: true },
      tileSize: { label: "Tile size", type: "number", default: 1, min: 0.01, max: 1000, step: 0.01, required: true },
      maxLoadedChunks: { label: "Max loaded chunks", type: "number", default: 81, min: 81, max: 81, step: 1, required: true, locked: true },
      maxWindowWidth: { label: "Max window width", type: "number", default: 9, min: 9, max: 9, step: 1, required: true, locked: true, hidden: true },
      maxWindowDepth: { label: "Max window depth", type: "number", default: 9, min: 9, max: 9, step: 1, required: true, locked: true, hidden: true },
      originX: { label: "Origin X", type: "number", default: 0, min: -100000, max: 100000, step: 1, required: true },
      originZ: { label: "Origin Z", type: "number", default: 0, min: -100000, max: 100000, step: 1, required: true },
      edgeMode: { label: "Edge mode", type: "select", options: ["clip_to_zone_bounds"], default: "clip_to_zone_bounds", required: true, locked: true }
    }
  },
  constant_value: {
    label: "Constant Value",
    group: "Values",
    accent: "#d59bff",
    description: "A typed constant value that can be reused by catalog content.",
    inputs: {},
    outputs: { value: { label: "Value", dataType: "value" } },
    fields: {
      valueId: { label: "Value id", type: "identity", default: "value.constant_01", required: true, maxLength: 160, pattern: "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$" },
      valueType: { label: "Value type", type: "select", options: ["text", "number", "boolean", "color", "vector2", "vector3", "reference"], default: "text", required: true },
      textValue: { label: "Text value", type: "text", default: "", required: false, maxLength: 240 },
      numberValue: { label: "Number value", type: "number", default: 0, required: false },
      booleanValue: { label: "Boolean value", type: "boolean", default: false, required: false },
      colorValue: { label: "Color value", type: "color", default: "#ffffff", required: false },
      jsonValue: { label: "JSON value", type: "json", default: null, required: false },
      referenceKind: { label: "Reference kind", type: "select", options: FOUNDATION_REFERENCE_KINDS, default: "", required: false, allowBlank: true },
      referenceValue: { label: "Reference value", type: "reference", referenceKinds: FOUNDATION_REFERENCE_KINDS, allowNull: true, default: null, required: false }
    }
  },
  global_value_definition: {
    label: "Global Value Definition",
    group: "Values",
    accent: "#d59bff",
    description: "Defines a global value and its token-safe metadata.",
    inputs: {},
    outputs: {
      globalValueDef: { label: "Global Value", dataType: "globalValueDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: {
      valueId: { label: "Value id", type: "identity", default: "global.game_name", required: true, maxLength: 160, pattern: "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$" },
      valueType: { label: "Value type", type: "select", options: ["text", "number", "boolean", "color", "reference"], default: "text", required: true },
      textValue: { label: "Text value", type: "text", default: "", required: false, maxLength: 240 },
      numberValue: { label: "Number value", type: "number", default: 0, required: false },
      booleanValue: { label: "Boolean value", type: "boolean", default: false, required: false },
      colorValue: { label: "Color value", type: "color", default: "#ffffff", required: false },
      referenceKind: { label: "Reference kind", type: "select", options: FOUNDATION_REFERENCE_KINDS, default: "", required: false, allowBlank: true },
      referenceValue: { label: "Reference value", type: "reference", referenceKinds: FOUNDATION_REFERENCE_KINDS, allowNull: true, default: null, required: false },
      format: { label: "Format", type: "select", options: ["raw", "integer", "decimal", "percent", "currency", "duration"], default: "raw", required: true },
      label: { label: "Label", type: "text", default: "Game Name", required: true, maxLength: 96 },
      description: { label: "Description", type: "tokenText", default: "", required: false, maxLength: 500 },
      tags: { label: "Tags", type: "tagList", default: [], required: false }
    }
  },
  tag_definition: {
    label: "Tag Definition",
    group: "Values",
    accent: "#e0a6ff",
    description: "Defines a canonical tag and optional restrictions.",
    inputs: {},
    outputs: {
      tagDef: { label: "Tag Definition", dataType: "tagDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: {
      tagId: { label: "Tag id", type: "identity", default: "global.project", required: true, maxLength: 160, pattern: "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$" },
      label: { label: "Label", type: "text", default: "Project", required: true, maxLength: 96 },
      description: { label: "Description", type: "text", default: "", required: false, maxLength: 500 },
      parentTagRef: { label: "Parent tag", type: "reference", referenceKinds: ["tag"], allowNull: true, default: null, required: false },
      allowedKinds: { label: "Allowed kinds", type: "referenceList", referenceKinds: FOUNDATION_REFERENCE_KINDS, default: [], required: false },
      restricted: { label: "Restricted", type: "boolean", default: false, required: true },
      owner: { label: "Owner", type: "text", default: "", required: false, maxLength: 96 }
    }
  },
  text_template: {
    label: "Text Template",
    group: "Values",
    accent: "#d59bff",
    description: "A tokenized text template for UI and catalog content.",
    inputs: {},
    outputs: {
      textTemplate: { label: "Text Template", dataType: "textTemplate" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: {
      templateId: { label: "Template id", type: "identity", default: "text.template_01", required: true, maxLength: 160, pattern: "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$" },
      label: { label: "Label", type: "text", default: "Template", required: true, maxLength: 96 },
      text: { label: "Text", type: "tokenText", default: "Welkom in @{global.game_name}", required: true, maxLength: 1000 },
      contextKinds: { label: "Context kinds", type: "tagList", default: ["global"], required: false },
      fallbackText: { label: "Fallback text", type: "text", default: "", required: false, maxLength: 500 },
      maxRenderedLength: { label: "Max rendered length", type: "number", default: 240, min: 1, max: 100000, step: 1, required: true }
    }
  },
  localization_entry: {
    label: "Localization Entry",
    group: "Values",
    accent: "#d59bff",
    description: "A single localized text entry.",
    inputs: {},
    outputs: {
      localizedTextDef: { label: "Localized Text", dataType: "localizedTextDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: {
      localizationId: { label: "Localization id", type: "identity", default: "localization.nl.game_name", required: true, maxLength: 160, pattern: "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$" },
      language: { label: "Language", type: "identity", default: "nl", required: true, maxLength: 16, pattern: "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$" },
      text: { label: "Text", type: "tokenText", default: "", required: true, maxLength: 1000 },
      fallbackText: { label: "Fallback text", type: "text", default: "", required: false, maxLength: 500 }
    }
  },
  value_formula: {
    label: "Value Formula",
    group: "Values",
    accent: "#d59bff",
    description: "A safe declarative formula that outputs a typed value.",
    inputs: { value: { label: "Value", dataType: "value", required: false, multiple: true } },
    outputs: { value: { label: "Value", dataType: "value" } },
    fields: {
      formulaId: { label: "Formula id", type: "identity", default: "value.formula_01", required: true, maxLength: 160, pattern: "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$" },
      resultType: { label: "Result type", type: "select", options: ["number", "boolean"], default: "number", required: true },
      expressionJson: { label: "Expression", type: "formula", default: { operator: "add", operands: [] }, required: true },
      roundMode: { label: "Round mode", type: "select", options: ["none", "floor", "ceil", "round"], default: "none", required: true },
      clampMin: { label: "Clamp min", type: "number", default: null, required: false },
      clampMax: { label: "Clamp max", type: "number", default: null, required: false }
    }
  },
  curve_lookup: {
    label: "Curve Lookup",
    group: "Values",
    accent: "#d59bff",
    description: "Generic curve lookup placeholder for future stats.",
    inputs: {
      curve: { label: "Curve", dataType: "value", required: false, multiple: false },
      input: { label: "Input", dataType: "value", required: true, multiple: false }
    },
    outputs: { value: { label: "Value", dataType: "value" } },
    fields: {
      lookupId: { label: "Lookup id", type: "identity", default: "curve.lookup_01", required: true, maxLength: 160, pattern: "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$" }
    }
  },
  catalog_output: {
    label: "Catalog Output",
    group: "Catalog",
    accent: "#7fcf68",
    description: "Bundles catalog definitions into a catalog package.",
    inputs: {},
    outputs: { catalogPackage: { label: "Catalog Package", dataType: "catalogPackage" } },
    fields: {
      catalogId: { label: "Catalog id", type: "identity", default: "catalog_registry.main", required: true, maxLength: 160, pattern: "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$" },
      catalogVersion: { label: "Catalog version", type: "text", default: "0.1.0", required: true, maxLength: 32 },
      namespaceOwnership: { label: "Namespace ownership", type: "json", default: ["global"], required: false }
    }
  },
  catalog_registry: {
    label: "Catalog Registry",
    group: "Catalog",
    accent: "#6ac16a",
    description: "Aggregates catalog packages into a registry.",
    inputs: { catalogPackage: { label: "Catalog Package", dataType: "catalogPackage", required: false, multiple: true } },
    outputs: { catalogRegistry: { label: "Catalog Registry", dataType: "catalogRegistry" } },
    fields: {
      registryId: { label: "Registry id", type: "identity", default: "catalog_registry.main", required: true, maxLength: 160, pattern: "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$" },
      duplicatePolicy: { label: "Duplicate policy", type: "select", options: ["error", "ignore", "replace"], default: "error", required: true },
      missingOptionalPolicy: { label: "Missing optional policy", type: "select", options: ["warning", "ignore", "error"], default: "warning", required: true }
    }
  },
  zone_registry: {
    label: "Zone Registry",
    group: "Zones",
    accent: "#7bd4ff",
    description: "Aggregates zone packages into a registry.",
    inputs: { zonePackage: { label: "Zone Package", dataType: "zonePackage", required: false, multiple: true } },
    outputs: { zoneRegistry: { label: "Zone Registry", dataType: "zoneRegistry" } },
    fields: {
      registryId: { label: "Registry id", type: "identity", default: "zone_registry.main", required: true, maxLength: 160, pattern: "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$" }
    }
  },
  campaign_registry: {
    label: "Campaign Registry",
    group: "Campaigns",
    accent: "#f0b35a",
    description: "Aggregates campaign packages into a registry.",
    inputs: { campaignPackage: { label: "Campaign Package", dataType: "campaignPackage", required: false, multiple: true } },
    outputs: { campaignRegistry: { label: "Campaign Registry", dataType: "campaignRegistry" } },
    fields: {
      registryId: { label: "Registry id", type: "identity", default: "campaign_registry.main", required: true, maxLength: 160, pattern: "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$" }
    }
  },
  player_rules_output: {
    label: "Player Rules Output",
    group: "Player Rules",
    accent: "#67d8c4",
    description: "Publishes player rules.",
    inputs: { policy: { label: "Policy", dataType: "policy", required: false, multiple: true } },
    outputs: { playerRules: { label: "Player Rules", dataType: "playerRules" } },
    fields: {
      rulesId: { label: "Rules id", type: "identity", default: "player_rules.main", required: true, maxLength: 160, pattern: "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$" }
    }
  },
  ui_output: {
    label: "UI Output",
    group: "UI",
    accent: "#ff8da3",
    description: "Publishes HUD and UI packages.",
    inputs: {
      ui: { label: "UI", dataType: "ui", required: false, multiple: true },
      minimap: { label: "Minimap", dataType: "minimap", required: false, multiple: true },
      uiLayout: { label: "UI Layout", dataType: "uiPackage", required: false, multiple: true }
    },
    outputs: { uiPackage: { label: "UI Package", dataType: "uiPackage" } },
    fields: {
      uiId: { label: "UI id", type: "identity", default: "ui.main", required: true, maxLength: 160, pattern: "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$" }
    }
  },
  legacy_world_adapter: {
    label: "Legacy World Adapter",
    group: "Legacy",
    accent: "#b0bec5",
    description: "Wraps the legacy direct Game Output chain for compatibility.",
    hidden: true,
    system: true,
    internal: true,
    inputs: {
      world: { label: "World", dataType: "world", required: true, multiple: false },
      editorWorldSettings: { label: "Editor World Settings", dataType: "editorWorldSettings", required: false, multiple: false },
      gameWorldSettings: { label: "Game World Settings", dataType: "gameWorldSettings", required: false, multiple: false },
      ground: { label: "Ground", dataType: "ground", required: true, multiple: false },
      camera: { label: "Camera", dataType: "camera", required: true, multiple: true },
      lights: { label: "Lights", dataType: "light", required: true, multiple: true },
      player: { label: "Player", dataType: "player", required: true, multiple: false },
      spawn: { label: "Spawn", dataType: "spawn", required: true, multiple: false },
      entities: { label: "Entities", dataType: "entity", required: false, multiple: true },
      interactables: { label: "Interactables", dataType: "interactable", required: false, multiple: true },
      chunkLoading: { label: "Chunk Loading", dataType: "chunkLoading", required: false, multiple: true },
      keybinds: { label: "Keybinds", dataType: "keybind", required: false, multiple: true },
      ui: { label: "UI", dataType: "ui", required: false, multiple: true },
      minimap: { label: "Minimap", dataType: "minimap", required: false, multiple: true },
      terrain: { label: "Terrain Layers", dataType: "terrain", required: false, multiple: true },
      collision: { label: "Collision", dataType: "collision", required: false, multiple: true }
    },
    outputs: { legacyWorldPackage: { label: "Legacy World Package", dataType: "legacyWorldPackage" } },
    fields: {
      adapterId: { label: "Adapter id", type: "identity", default: "legacy_world.main", required: true, maxLength: 160, pattern: "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$" }
    }
  },
  world_assembly: {
    label: "World Assembly",
    group: "Project",
    accent: "#ffb454",
    description: "Assembles the final game project manifest.",
    inputs: {
      projectSettings: { label: "Project Settings", dataType: "projectSettings", required: true, multiple: false },
      chunkGrid: { label: "Chunk Grid", dataType: "chunkGrid", required: true, multiple: false },
      editorWorldSettings: { label: "Editor World Settings", dataType: "editorWorldSettings", required: false, multiple: false },
      gameWorldSettings: { label: "Game World Settings", dataType: "gameWorldSettings", required: false, multiple: false },
      camera: { label: "Camera", dataType: "camera", required: false, multiple: true },
      chunkPolicies: { label: "Chunk Policies", dataType: "chunkPolicy", required: false, multiple: true },
      catalogs: { label: "Catalogs", dataType: "catalogRegistry", required: false, multiple: false },
      zones: { label: "Zones", dataType: "zoneRegistry", required: false, multiple: false },
      campaigns: { label: "Campaigns", dataType: "campaignRegistry", required: false, multiple: false },
      playerRules: { label: "Player Rules", dataType: "playerRules", required: false, multiple: false },
      ui: { label: "UI", dataType: "uiPackage", required: false, multiple: false },
      legacyWorld: {
        label: "Legacy World",
        dataType: "legacyWorldPackage",
        required: false,
        multiple: false,
        hidden: true,
        internal: true,
        deprecated: true,
        help: "Internal migration compatibility only. Normal authoring uses specialized packages into World Assembly and Game Output.gameProject."
      }
    },
    outputs: { gameProject: { label: "Game Project", dataType: "gameProject" } },
    fields: {
      assemblyId: { label: "Assembly id", type: "identity", default: "world_assembly.main", required: true, maxLength: 160, pattern: "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$" },
      schemaVersion: { label: "Schema version", type: "text", default: "gk-game-project-v3", required: true, maxLength: 64, locked: true },
      validationMode: { label: "Validation mode", type: "select", options: ["strict", "warn"], default: "strict", required: true },
      includeEditorDiagnostics: { label: "Include editor diagnostics", type: "boolean", default: false, required: true }
    }
  }
};

const CANONICAL_FIELD_PATTERN = "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$";
const ZONE_NODE_DEFS = {
  zone_definition: {
    label: "Zone Definition",
    group: "Zones",
    accent: "#0ea5e9",
    description: "Defines one playable zone and its fixed physical bounds.",
    inputs: {},
    outputs: { zone: { label: "Zone", dataType: "zoneDef" } },
    fields: {
      zoneId: { label: "Zone id", type: "identity", default: "zone.new_zone", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      displayName: { label: "Display name", type: "text", default: "New Zone", required: true, maxLength: 120 },
      zoneType: { label: "Zone type", type: "select", options: ["outdoor_normal", "interior", "dungeon", "instance", "hub", "custom"], default: "outdoor_normal", required: true },
      originX: { label: "Origin X", type: "number", default: 0, min: -100000, max: 100000, step: 1, required: true },
      originY: { label: "Origin Y", type: "number", default: 0, min: -100000, max: 100000, step: 1, required: true },
      originZ: { label: "Origin Z", type: "number", default: 0, min: -100000, max: 100000, step: 1, required: true },
      width: { label: "Width", type: "number", default: 500, min: 1, max: 5000, step: 1, required: true },
      depth: { label: "Depth", type: "number", default: 500, min: 1, max: 5000, step: 1, required: true },
      minY: { label: "Min Y", type: "number", default: -100, min: -10000, max: 10000, step: 1, required: true },
      maxY: { label: "Max Y", type: "number", default: 500, min: -10000, max: 10000, step: 1, required: true },
      recommendedLevelMin: { label: "Recommended min level", type: "number", default: 1, min: 1, max: 999, step: 1, required: true },
      recommendedLevelMax: { label: "Recommended max level", type: "number", default: 10, min: 1, max: 999, step: 1, required: true },
      biomeTags: { label: "Biome tags", type: "tagList", default: [], required: false },
      zoneTags: { label: "Zone tags", type: "tagList", default: [], required: false },
      allowFastTravel: { label: "Allow fast travel", type: "boolean", default: true, required: true },
      allowRespawn: { label: "Allow respawn", type: "boolean", default: true, required: true },
      activeByDefault: { label: "Active by default", type: "boolean", default: true, required: true }
    }
  },
  zone_environment_settings: {
    label: "Zone Environment Settings",
    group: "Zones",
    accent: "#14b8a6",
    description: "Per-zone render, audio and atmosphere settings.",
    inputs: {},
    outputs: { environment: { label: "Environment", dataType: "environment" } },
    fields: {
      environmentId: { label: "Environment id", type: "identity", default: "environment.new_zone", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      backgroundColor: { label: "Background color", type: "color", default: "#101a26", required: false },
      fogColor: { label: "Fog color", type: "color", default: "#101a26", required: false },
      fogDensity: { label: "Fog density", type: "number", default: 0, min: 0, max: 1, step: 0.001, required: false },
      smoothShading: { label: "Smooth shading", type: "boolean", default: true, required: true },
      timeOfDayOffset: { label: "Time of day offset", type: "number", default: 0, min: -24, max: 24, step: 0.25, required: true },
      weatherProfileRef: { label: "Weather profile", type: "reference", referenceKinds: ["policy"], allowNull: true, default: null, required: false },
      musicPlaylistRef: { label: "Music playlist", type: "reference", referenceKinds: ["audio"], allowNull: true, default: null, required: false },
      ambienceRef: { label: "Ambience", type: "reference", referenceKinds: ["audio"], allowNull: true, default: null, required: false },
      cameraOverrideRef: { label: "Camera override", type: "reference", referenceKinds: ["policy"], allowNull: true, default: null, required: false },
      shadowPresetOverride: { label: "Shadow preset override", type: "select", options: ["inherit", "geen", "licht", "middel", "hoog", "extreem"], default: "inherit", required: true }
    }
  },
  zone_gameplay_rules: {
    label: "Zone Gameplay Rules",
    group: "Zones",
    accent: "#f59e0b",
    description: "Zone-local gameplay multipliers and permissions.",
    inputs: {},
    outputs: { rules: { label: "Rules", dataType: "zoneRules" } },
    fields: {
      rulesId: { label: "Rules id", type: "identity", default: "zone_rules.new_zone", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      pveEnabled: { label: "PvE enabled", type: "boolean", default: true, required: true },
      pvpMode: { label: "PvP mode", type: "select", options: ["disabled", "duel_only", "open", "faction"], default: "disabled", required: true },
      levelScalingMode: { label: "Level scaling", type: "select", options: ["fixed_range", "clamp_to_range", "party_average", "custom"], default: "fixed_range", required: true },
      resourceYieldMultiplier: { label: "Resource yield x", type: "number", default: 1, min: 0, max: 100, step: 0.01, required: true },
      enemyHealthMultiplier: { label: "Enemy health x", type: "number", default: 1, min: 0, max: 100, step: 0.01, required: true },
      enemyDamageMultiplier: { label: "Enemy damage x", type: "number", default: 1, min: 0, max: 100, step: 0.01, required: true },
      lootMultiplier: { label: "Loot x", type: "number", default: 1, min: 0, max: 100, step: 0.01, required: true },
      xpMultiplier: { label: "XP x", type: "number", default: 1, min: 0, max: 100, step: 0.01, required: true },
      respawnPolicyRef: { label: "Respawn policy", type: "reference", referenceKinds: ["policy"], allowNull: true, default: null, required: false },
      networkInterestProfileRef: { label: "Network interest profile", type: "reference", referenceKinds: ["policy"], allowNull: true, default: null, required: false },
      allowTrade: { label: "Allow trade", type: "boolean", default: true, required: true },
      allowMarketAccess: { label: "Allow market access", type: "boolean", default: false, required: true },
      allowUnstuck: { label: "Allow unstuck", type: "boolean", default: true, required: true }
    }
  },
  area_definition: {
    label: "Area Definition",
    group: "Zones",
    accent: "#a855f7",
    description: "Defines a named area inside its owning zone.",
    inputs: {},
    outputs: { area: { label: "Area", dataType: "area" } },
    fields: {
      areaId: { label: "Area id", type: "identity", default: "area.new_area", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      zoneRef: { label: "Owning zone", type: "reference", referenceKinds: ["zone"], allowNull: true, default: null, required: false },
      label: { label: "Label", type: "text", default: "New Area", required: true, maxLength: 120 },
      shapeType: { label: "Shape", type: "select", options: ["polygon", "box", "circle"], default: "box", required: true },
      x: { label: "X", type: "number", default: 0, min: -100000, max: 100000, step: 0.01, required: true },
      y: { label: "Y", type: "number", default: 0, min: -100000, max: 100000, step: 0.01, required: true },
      z: { label: "Z", type: "number", default: 0, min: -100000, max: 100000, step: 0.01, required: true },
      width: { label: "Width", type: "number", default: 50, min: 0, max: 5000, step: 0.1, required: true },
      depth: { label: "Depth", type: "number", default: 50, min: 0, max: 5000, step: 0.1, required: true },
      radius: { label: "Radius", type: "number", default: 25, min: 0, max: 5000, step: 0.1, required: true },
      points: { label: "Points", type: "json", default: [], required: false },
      priority: { label: "Priority", type: "number", default: 0, min: -100000, max: 100000, step: 1, required: true },
      recommendedLevelMin: { label: "Recommended min level", type: "number", default: 1, min: 1, max: 999, step: 1, required: true },
      recommendedLevelMax: { label: "Recommended max level", type: "number", default: 10, min: 1, max: 999, step: 1, required: true },
      areaTags: { label: "Area tags", type: "tagList", default: [], required: false },
      mapRevealMode: { label: "Map reveal", type: "select", options: ["hidden", "outline", "full"], default: "outline", required: true }
    }
  },
  area_environment_override: {
    label: "Area Environment Override",
    group: "Zones",
    accent: "#0f766e",
    description: "Optional area-level environment overrides.",
    inputs: { area: { label: "Area", dataType: "area", required: true, multiple: false }, conditions: { label: "Conditions", dataType: "policy", required: false, multiple: true } },
    outputs: { environmentOverride: { label: "Environment Override", dataType: "environmentOverride" } },
    fields: {
      overrideId: { label: "Override id", type: "identity", default: "environment_override.new_area", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      fogMode: { label: "Fog mode", type: "select", options: ["inherit", "set", "clear"], default: "inherit", required: true },
      fogColor: { label: "Fog color", type: "color", default: "#101a26", required: false },
      fogDensity: { label: "Fog density", type: "number", default: 0, min: 0, max: 1, step: 0.001, required: false },
      backgroundMode: { label: "Background mode", type: "select", options: ["inherit", "set", "clear"], default: "inherit", required: true },
      backgroundColor: { label: "Background color", type: "color", default: "#101a26", required: false },
      musicMode: { label: "Music mode", type: "select", options: ["inherit", "set", "clear"], default: "inherit", required: true },
      musicPlaylistRef: { label: "Music playlist", type: "reference", referenceKinds: ["audio"], allowNull: true, default: null, required: false },
      ambienceMode: { label: "Ambience mode", type: "select", options: ["inherit", "set", "clear"], default: "inherit", required: true },
      ambienceRef: { label: "Ambience", type: "reference", referenceKinds: ["audio"], allowNull: true, default: null, required: false },
      weatherMode: { label: "Weather mode", type: "select", options: ["inherit", "set", "clear"], default: "inherit", required: true },
      weatherProfileRef: { label: "Weather profile", type: "reference", referenceKinds: ["policy"], allowNull: true, default: null, required: false },
      lightIntensityMultiplier: { label: "Light intensity x", type: "number", default: 1, min: 0, max: 100, step: 0.01, required: true }
    }
  },
  area_output: {
    label: "Area Output",
    group: "Zones",
    accent: "#7e22ce",
    description: "Bundles area content into one area package.",
    inputs: {
      area: { label: "Area", dataType: "area", required: true, multiple: false },
      environmentOverrides: { label: "Environment Overrides", dataType: "environmentOverride", required: false, multiple: true },
      areaRules: { label: "Area Rules", dataType: "areaRule", required: false, multiple: true },
      terrain: { label: "Terrain", dataType: "terrain", required: false, multiple: true },
      collision: { label: "Collision", dataType: "collision", required: false, multiple: true },
      lights: { label: "Lights", dataType: "light", required: false, multiple: true },
      entities: { label: "Entities", dataType: "entity", required: false, multiple: true },
      spawns: { label: "Spawns", dataType: "spawnPoint", required: false, multiple: true },
      questTargets: { label: "Quest Targets", dataType: "questTarget", required: false, multiple: true },
      markers: { label: "Markers", dataType: "markerDef", required: false, multiple: true },
      audioAssignments: { label: "Audio Assignments", dataType: "audioAssignment", required: false, multiple: true },
      paths: { label: "Paths", dataType: "path", required: false, multiple: true },
      encounterAreas: { label: "Encounter Areas", dataType: "encounterArea", required: false, multiple: true }
    },
    outputs: { areaPackage: { label: "Area Package", dataType: "areaPackage" } },
    fields: {
      packageId: { label: "Package id", type: "identity", default: "area.new_area.package", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      packageVersion: { label: "Package version", type: "number", default: 1, min: 1, max: 1000000, step: 1, required: true }
    }
  },
  location_anchor: {
    label: "Location Anchor",
    group: "Zones",
    accent: "#64748b",
    description: "Meshless selectable location helper.",
    inputs: {},
    outputs: {
      anchor: { label: "Anchor", dataType: "anchor" },
      entityBase: { label: "Entity Base", dataType: "entityBase" }
    },
    fields: {
      anchorId: { label: "Anchor id", type: "identity", default: "anchor.new_anchor", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      label: { label: "Label", type: "text", default: "Anchor", required: true, maxLength: 120 },
      x: { label: "X", type: "number", default: 0, min: -100000, max: 100000, step: 0.01, required: true },
      y: { label: "Y", type: "number", default: 0, min: -100000, max: 100000, step: 0.01, required: true },
      z: { label: "Z", type: "number", default: 0, min: -100000, max: 100000, step: 0.01, required: true },
      rotationY: { label: "Rotation Y", type: "number", default: 0, min: -360, max: 360, step: 0.1, required: true },
      shapeType: { label: "Shape", type: "select", options: ["point", "polygon", "circle", "box"], default: "point", required: true },
      radius: { label: "Radius", type: "number", default: 1, min: 0, max: 5000, step: 0.1, required: true },
      width: { label: "Width", type: "number", default: 1, min: 0, max: 5000, step: 0.1, required: true },
      depth: { label: "Depth", type: "number", default: 1, min: 0, max: 5000, step: 0.1, required: true },
      points: { label: "Points", type: "json", default: [], required: false },
      visibleInEditor: { label: "Visible in editor", type: "boolean", default: true, required: true },
      visibleInGame: { label: "Visible in game", type: "boolean", default: false, required: true },
      editorIcon: { label: "Editor icon", type: "select", options: ["anchor", "spawn", "target", "portal", "custom"], default: "anchor", required: true },
      anchorTags: { label: "Anchor tags", type: "tagList", default: [], required: false }
    }
  },
  spawn_point: {
    label: "Spawn Point",
    group: "Zones",
    accent: "#a3e635",
    description: "A zone-local player spawn, checkpoint target or travel arrival.",
    inputs: { anchor: { label: "Anchor", dataType: "anchor", required: false, multiple: false } },
    outputs: { spawnPoint: { label: "Spawn Point", dataType: "spawnPoint" } },
    fields: {
      spawnId: { label: "Spawn id", type: "identity", default: "spawn.zone_default", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      role: { label: "Role", type: "select", options: ["zone_default", "entry", "checkpoint", "respawn", "bind", "instance", "fast_travel_arrival"], default: "zone_default", required: true },
      zoneRef: { label: "Zone", type: "reference", referenceKinds: ["zone"], allowNull: true, default: null, required: false },
      label: { label: "Label", type: "text", default: "Zone Default", required: true, maxLength: 120 },
      x: { label: "X", type: "number", default: 0, min: -100000, max: 100000, step: 0.01, required: true },
      y: { label: "Y", type: "number", default: 0, min: -100000, max: 100000, step: 0.01, required: true },
      z: { label: "Z", type: "number", default: 0, min: -100000, max: 100000, step: 0.01, required: true },
      facing: { label: "Facing", type: "number", default: 0, min: -360, max: 360, step: 1, required: true },
      safeRadius: { label: "Safe radius", type: "number", default: 1.25, min: 0.1, max: 100, step: 0.05, required: true },
      snapToGround: { label: "Snap to ground", type: "boolean", default: true, required: true },
      validateCollision: { label: "Validate collision", type: "boolean", default: true, required: true },
      activationConditionRef: { label: "Activation condition", type: "reference", referenceKinds: ["policy"], allowNull: true, default: null, required: false },
      priority: { label: "Priority", type: "number", default: 0, min: -100000, max: 100000, step: 1, required: true }
    }
  },
  checkpoint: {
    label: "Checkpoint",
    group: "Zones",
    accent: "#84cc16",
    description: "Activatable checkpoint backed by a spawn point.",
    inputs: {
      spawnPoint: { label: "Spawn Point", dataType: "spawnPoint", required: true, multiple: false },
      activationConditions: { label: "Activation Conditions", dataType: "policy", required: false, multiple: true },
      onActivateActions: { label: "On Activate Actions", dataType: "action", required: false, multiple: true },
      marker: { label: "Marker", dataType: "markerDef", required: false, multiple: false }
    },
    outputs: { checkpoint: { label: "Checkpoint", dataType: "checkpoint" } },
    fields: {
      checkpointId: { label: "Checkpoint id", type: "identity", default: "checkpoint.new_checkpoint", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      label: { label: "Label", type: "text", default: "Checkpoint", required: true, maxLength: 120 },
      activationMode: { label: "Activation mode", type: "select", options: ["proximity", "interact", "quest_action", "automatic_entry"], default: "proximity", required: true },
      saveScope: { label: "Save scope", type: "select", options: ["character", "party", "instance"], default: "character", required: true },
      respawnEligible: { label: "Respawn eligible", type: "boolean", default: true, required: true },
      fastTravelEligible: { label: "Fast travel eligible", type: "boolean", default: false, required: true },
      healPolicy: { label: "Heal policy", type: "select", options: ["none", "full", "percent", "fixed"], default: "none", required: true },
      healAmount: { label: "Heal amount", type: "number", default: 0, min: 0, max: 1000000, step: 1, required: true },
      manaPolicy: { label: "Mana policy", type: "select", options: ["none", "full", "percent", "fixed"], default: "none", required: true },
      staminaPolicy: { label: "Stamina policy", type: "select", options: ["none", "full", "percent", "fixed"], default: "none", required: true },
      activationRadius: { label: "Activation radius", type: "number", default: 2.5, min: 0.1, max: 100, step: 0.1, required: true },
      oneTimeMessage: { label: "One-time message", type: "tokenText", default: "", required: false, maxLength: 500 }
    }
  },
  zone_link: {
    label: "Zone Link",
    group: "Zones",
    accent: "#06b6d4",
    description: "Server-authoritative travel from one zone to another.",
    inputs: {
      fromAnchor: { label: "From Anchor", dataType: "anchor", required: false, multiple: false },
      fromSpawn: { label: "From Spawn", dataType: "spawnPoint", required: false, multiple: false },
      conditions: { label: "Conditions", dataType: "policy", required: false, multiple: true }
    },
    outputs: { zoneLink: { label: "Zone Link", dataType: "zoneLink" } },
    fields: {
      linkId: { label: "Link id", type: "identity", default: "zone_link.new_link", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      fromZoneRef: { label: "From zone", type: "reference", referenceKinds: ["zone"], allowNull: true, default: null, required: false },
      fromTargetRef: { label: "From target", type: "reference", referenceKinds: ["spawn", "target"], allowNull: true, default: null, required: false },
      toZoneRef: { label: "To zone", type: "reference", referenceKinds: ["zone"], allowNull: true, default: null, required: true },
      toSpawnRef: { label: "To spawn", type: "reference", referenceKinds: ["spawn"], allowNull: true, default: null, required: true },
      mode: { label: "Mode", type: "select", options: ["door", "portal", "teleport", "fast_travel", "seamless_boundary", "scripted_transport"], default: "portal", required: true },
      bidirectional: { label: "Bidirectional", type: "boolean", default: false, required: true },
      reverseLinkRef: { label: "Reverse link", type: "reference", referenceKinds: ["zone_link"], allowNull: true, default: null, required: false },
      transitionVisual: { label: "Transition visual", type: "select", options: ["none", "fade", "loading_screen"], default: "fade", required: true },
      loadingText: { label: "Loading text", type: "tokenText", default: "Reizen naar @{zone.name}", required: false, maxLength: 240 },
      preloadDistance: { label: "Preload distance", type: "number", default: 30, min: 0, max: 500, step: 1, required: true },
      interactionRequired: { label: "Interaction required", type: "boolean", default: true, required: true },
      prompt: { label: "Prompt", type: "tokenText", default: "Gebruik doorgang", required: false, maxLength: 240 },
      oneWayReason: { label: "One-way reason", type: "tokenText", default: "", required: false, maxLength: 240 }
    }
  },
  discovery_area: {
    label: "Discovery Area",
    group: "Zones",
    accent: "#22d3ee",
    description: "Unlocks minimap/world-map discovery state.",
    inputs: {
      area: { label: "Area", dataType: "area", required: false, multiple: false },
      anchor: { label: "Anchor", dataType: "anchor", required: false, multiple: false }
    },
    outputs: { discovery: { label: "Discovery", dataType: "discoveryDef" } },
    fields: {
      discoveryId: { label: "Discovery id", type: "identity", default: "discovery.new_area", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      label: { label: "Label", type: "text", default: "Discovery", required: true, maxLength: 120 },
      revealZoneMap: { label: "Reveal zone map", type: "boolean", default: true, required: true },
      revealAreaMap: { label: "Reveal area map", type: "boolean", default: true, required: true },
      unlockFastTravelRef: { label: "Unlock fast travel", type: "reference", referenceKinds: ["zone_link"], allowNull: true, default: null, required: false },
      xpRewardFormula: { label: "XP reward", type: "formula", default: { operator: "add", operands: [] }, required: false },
      notificationTemplate: { label: "Notification", type: "tokenText", default: "", required: false, maxLength: 500 },
      oneTimePerCharacter: { label: "One time per character", type: "boolean", default: true, required: true }
    }
  },
  safe_rule_area: {
    label: "Safe Rule Area",
    group: "Zones",
    accent: "#f97316",
    description: "Area-level safe/combat/trade permissions.",
    inputs: { area: { label: "Area", dataType: "area", required: true, multiple: false } },
    outputs: { areaRule: { label: "Area Rule", dataType: "areaRule" } },
    fields: {
      ruleId: { label: "Rule id", type: "identity", default: "area_rule.safe_zone", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      safeZone: { label: "Safe zone", type: "boolean", default: true, required: true },
      combatAllowed: { label: "Combat allowed", type: "boolean", default: false, required: true },
      pvpAllowed: { label: "PvP allowed", type: "boolean", default: false, required: true },
      tradeAllowed: { label: "Trade allowed", type: "boolean", default: true, required: true },
      marketAllowed: { label: "Market allowed", type: "boolean", default: false, required: true },
      unstuckAllowed: { label: "Unstuck allowed", type: "boolean", default: true, required: true },
      mountAllowed: { label: "Mount allowed", type: "boolean", default: false, required: true },
      respawnAllowed: { label: "Respawn allowed", type: "boolean", default: true, required: true },
      priority: { label: "Priority", type: "number", default: 0, min: -100000, max: 100000, step: 1, required: true }
    }
  },
  map_marker_definition: {
    label: "Map Marker Definition",
    group: "Zones",
    accent: "#f43f5e",
    description: "Marker for minimap, world map and compass.",
    inputs: {
      entity: { label: "Entity", dataType: "entity", required: false, multiple: false },
      anchor: { label: "Anchor", dataType: "anchor", required: false, multiple: false },
      area: { label: "Area", dataType: "area", required: false, multiple: false },
      questTarget: { label: "Quest Target", dataType: "questTarget", required: false, multiple: false },
      spawnPoint: { label: "Spawn Point", dataType: "spawnPoint", required: false, multiple: false },
      checkpoint: { label: "Checkpoint", dataType: "checkpoint", required: false, multiple: false },
      zoneLink: { label: "Zone Link", dataType: "zoneLink", required: false, multiple: false }
    },
    outputs: { marker: { label: "Marker", dataType: "markerDef" } },
    fields: {
      markerId: { label: "Marker id", type: "identity", default: "marker.new_marker", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      label: { label: "Label", type: "tokenText", default: "Marker", required: true, maxLength: 240 },
      iconAssetId: { label: "Icon asset", type: "asset", assetTypes: ["image"], default: null, required: false },
      markerType: { label: "Marker type", type: "select", options: ["npc", "enemy", "quest", "resource", "portal", "checkpoint", "vendor", "market", "crafting", "custom"], default: "custom", required: true },
      showOnMinimap: { label: "Show on minimap", type: "boolean", default: true, required: true },
      showOnWorldMap: { label: "Show on world map", type: "boolean", default: true, required: true },
      showOnCompass: { label: "Show on compass", type: "boolean", default: false, required: true },
      priority: { label: "Priority", type: "number", default: 0, min: -100000, max: 100000, step: 1, required: true },
      clampOutside: { label: "Clamp outside", type: "boolean", default: true, required: true },
      minDistance: { label: "Min distance", type: "number", default: 0, min: 0, max: 100000, step: 1, required: true },
      maxDistance: { label: "Max distance", type: "number", default: 100000, min: 0, max: 100000, step: 1, required: true },
      iconSizePx: { label: "Icon size", type: "number", default: 18, min: 4, max: 128, step: 1, required: true },
      labelVisibility: { label: "Label visibility", type: "select", options: ["never", "hover", "always", "near"], default: "hover", required: true }
    }
  },
  marker_visibility_rule: {
    label: "Marker Visibility Rule",
    group: "Zones",
    accent: "#e11d48",
    description: "Visibility rule for map markers.",
    inputs: { conditions: { label: "Conditions", dataType: "policy", required: false, multiple: true } },
    outputs: { markerRule: { label: "Marker Rule", dataType: "markerRule" } },
    fields: {
      ruleId: { label: "Rule id", type: "identity", default: "marker_rule.always", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      visibilityMode: { label: "Visibility mode", type: "select", options: ["always", "discovered", "not_discovered"], default: "always", required: true },
      defaultVisible: { label: "Default visible", type: "boolean", default: true, required: true },
      hideWhenTargetUnloaded: { label: "Hide when target unloaded", type: "boolean", default: false, required: true },
      fallbackToZoneEntry: { label: "Fallback to zone entry", type: "boolean", default: true, required: true }
    }
  },
  entity_assembly: {
    label: "Entity Assembly",
    group: "Entities",
    accent: "#b000ff",
    description: "Composes one entity from a mesh/base and behavior components.",
    inputs: {
      base: { label: "Base", dataType: "entityBase", required: false, multiple: false },
      model: { label: "Model Entity", dataType: "entity", required: false, multiple: false },
      components: { label: "Components", dataType: "entityComponent", required: false, multiple: true },
      anchor: { label: "Anchor", dataType: "anchor", required: false, multiple: false }
    },
    outputs: { entity: { label: "Entity", dataType: "entity" } },
    fields: {
      entityId: { label: "Entity id", type: "identity", default: "entity.new_entity", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      label: { label: "Label", type: "text", default: "Entity", required: true, maxLength: 120 },
      entityTags: { label: "Entity tags", type: "tagList", default: [], required: false }
    }
  },
  interaction_component: {
    label: "Interaction Component",
    group: "Entities",
    accent: "#db2777",
    description: "Behavior component that replaces standalone interactable ownership.",
    inputs: {},
    outputs: { component: { label: "Entity Component", dataType: "entityComponent" } },
    fields: {
      componentId: { label: "Component id", type: "identity", default: "component.interaction", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      interactionType: { label: "Interaction type", type: "select", options: ["inspect", "talk", "loot", "open", "craft", "custom"], default: "inspect", required: true },
      prompt: { label: "Prompt", type: "tokenText", default: "Gebruik", required: false, maxLength: 240 },
      radius: { label: "Radius", type: "number", default: 2, min: 0.1, max: 100, step: 0.1, required: true },
      enabled: { label: "Enabled", type: "boolean", default: true, required: true }
    }
  },
  quest_target_binding: {
    label: "Quest Target Binding",
    group: "Zones",
    accent: "#10b981",
    description: "Stable target binding id for future quest phases.",
    inputs: {
      entity: { label: "Entity", dataType: "entity", required: false, multiple: false },
      anchor: { label: "Anchor", dataType: "anchor", required: false, multiple: false },
      area: { label: "Area", dataType: "area", required: false, multiple: false }
    },
    outputs: { questTarget: { label: "Quest Target", dataType: "questTarget" } },
    fields: {
      targetId: { label: "Target id", type: "identity", default: "target.new_target", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      label: { label: "Label", type: "text", default: "Quest Target", required: true, maxLength: 120 },
      targetTags: { label: "Target tags", type: "tagList", default: [], required: false }
    }
  },
  zone_output: {
    label: "Zone Output",
    group: "Zones",
    accent: "#0284c7",
    description: "Bundles zone content into one Zone Package.",
    inputs: {
      zone: { label: "Zone", dataType: "zoneDef", required: true, multiple: false },
      environment: { label: "Environment", dataType: "environment", required: true, multiple: false },
      rules: { label: "Rules", dataType: "zoneRules", required: false, multiple: false },
      ground: { label: "Ground", dataType: "ground", required: false, multiple: false },
      terrain: { label: "Terrain", dataType: "terrain", required: false, multiple: true },
      collision: { label: "Collision", dataType: "collision", required: false, multiple: true },
      lights: { label: "Lights", dataType: "light", required: false, multiple: true },
      camera: { label: "Camera", dataType: "camera", required: false, multiple: false },
      player: { label: "Player", dataType: "player", required: false, multiple: false },
      cameraOverrides: { label: "Camera Overrides", dataType: "cameraOverride", required: false, multiple: true },
      areas: { label: "Areas", dataType: "areaPackage", required: false, multiple: true },
      entities: { label: "Entities", dataType: "entity", required: false, multiple: true },
      spawns: { label: "Spawns", dataType: "spawnPoint", required: false, multiple: true },
      checkpoints: { label: "Checkpoints", dataType: "checkpoint", required: false, multiple: true },
      links: { label: "Links", dataType: "zoneLink", required: false, multiple: true },
      discoveries: { label: "Discoveries", dataType: "discoveryDef", required: false, multiple: true },
      questTargets: { label: "Quest Targets", dataType: "questTarget", required: false, multiple: true },
      markers: { label: "Markers", dataType: "markerDef", required: false, multiple: true },
      minimap: { label: "Minimap", dataType: "minimap", required: false, multiple: true },
      audioAssignments: { label: "Audio Assignments", dataType: "audioAssignment", required: false, multiple: true },
      paths: { label: "Paths", dataType: "path", required: false, multiple: true },
      encounterAreas: { label: "Encounter Areas", dataType: "encounterArea", required: false, multiple: true }
    },
    outputs: { zonePackage: { label: "Zone Package", dataType: "zonePackage" } },
    fields: {
      packageId: { label: "Package id", type: "identity", default: "zone.new_zone.package", required: false, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      packageVersion: { label: "Package version", type: "number", default: 1, min: 1, max: 1000000, step: 1, required: true },
      includeEditorOnlyData: { label: "Include editor-only data", type: "boolean", default: false, required: true }
    }
  }
};

Object.assign(NODE_TYPES, FOUNDATION_NODE_DEFS, ZONE_NODE_DEFS);
NODE_TYPES.minimap_bake.inputs = Object.assign({}, NODE_TYPES.minimap_bake.inputs || {}, {
  zone: { label: "Zone", dataType: "zoneDef", required: false, multiple: false },
  ground: { label: "Ground", dataType: "ground", required: false, multiple: false }
});
NODE_TYPES.minimap_bake.fields = Object.assign({}, NODE_TYPES.minimap_bake.fields, {
  zoneRef: { label: "Zone", type: "reference", referenceKinds: ["zone"], allowNull: true, default: null, required: false, maxLength: 160 },
  sourceMode: { label: "Bake source mode", type: "select", options: ["zone_bounds", "legacy_ground"], default: "zone_bounds", required: true }
});
NODE_TYPES.game_minimap_hud.fields = Object.assign({}, NODE_TYPES.game_minimap_hud.fields, {
  sourceMode: { label: "Source mode", type: "select", options: ["active_zone_registry", "fixed_legacy"], default: "active_zone_registry", required: true },
  fallbackMinimapRef: { label: "Fallback minimap", type: "reference", referenceKinds: ["minimap"], allowNull: true, default: null, required: false },
  transitionMode: { label: "Transition mode", type: "select", options: ["instant", "fade"], default: "instant", required: true }
});
NODE_TYPES.model_entity.outputs = Object.assign({}, NODE_TYPES.model_entity.outputs || {}, {
  entityBase: { label: "Entity Base", dataType: "entityBase" }
});
NODE_TYPES.game_output = Object.assign({}, GAME_OUTPUT_BASE, {
  inputs: Object.assign({}, Object.fromEntries(Object.entries(GAME_OUTPUT_BASE?.inputs || {}).map(function ([portName, port]) {
    return [portName, Object.assign({}, port, {
      hidden: true,
      internal: true,
      deprecated: true,
      required: false,
      help: "Legacy direct Game Output input. Use World Assembly.gameProject -> Game Output.gameProject."
    })];
  })), {
    gameProject: { label: "Game Project", dataType: "gameProject", required: false, multiple: false }
  })
});
NODE_TYPES.ui_hud_text.fields.text.type = "tokenText";
NODE_TYPES.group.fields.groupKind = { label: "Group kind", type: "select", options: ["generic", "catalog", "zone", "area", "campaign", "quest", "dialogue", "player_rules", "ui"], default: "generic", required: true };
NODE_TYPES.group.fields.interfacePresetVersion = { label: "Interface preset version", type: "number", default: 1, min: 1, max: 1000, step: 1, required: true };
NODE_TYPES.group.fields.collapsedSummary = { label: "Collapsed summary", type: "boolean", default: false, required: true };
