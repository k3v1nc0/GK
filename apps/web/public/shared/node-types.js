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
  group: "#64748b"
};

export const DATA_TYPE_OPTIONS = Object.keys(DATA_TYPE_COLORS).filter(function (dataType) {
  return dataType !== "group";
});

const MULTI_VALUE_TYPES = new Set(["light", "entity", "interactable", "chunkLoading", "keybind", "ui", "minimap", "terrain", "collision"]);

const WORLD_SHADOW_PRESET_NAMES = ["geen_schaduw", "lichte_schaduw", "middel_schaduw", "hoog_schaduw", "extreem_schaduw"];
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

function clonePresetValues(values) {
  return Object.fromEntries(Object.entries(values || {}).map(function ([key, value]) {
    if (value === null || value === undefined) return [key, value];
    if (typeof structuredClone === "function") {
      try { return [key, structuredClone(value)]; } catch {}
    }
    return [key, JSON.parse(JSON.stringify(value))];
  }));
}

export function normalizeWorldSettingsPreset(value, fallback = "middel_schaduw") {
  const normalized = String(value || "").trim().toLowerCase();
  if (WORLD_SHADOW_PRESET_ALIASES[normalized]) return WORLD_SHADOW_PRESET_ALIASES[normalized];
  if (WORLD_SHADOW_PRESET_NAMES.includes(normalized)) return normalized;
  const normalizedFallback = String(fallback || "middel_schaduw").trim().toLowerCase();
  if (WORLD_SHADOW_PRESET_ALIASES[normalizedFallback]) return WORLD_SHADOW_PRESET_ALIASES[normalizedFallback];
  if (WORLD_SHADOW_PRESET_NAMES.includes(normalizedFallback)) return normalizedFallback;
  return "middel_schaduw";
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

export function dataTypeColor(dataType) {
  return DATA_TYPE_COLORS[dataType] || "#6b7d8d";
}

export function isMultiValueDataType(dataType) {
  return MULTI_VALUE_TYPES.has(dataType);
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
for (const type of ["catalogPackage", "zonePackage", "campaignPackage", "uiPackage"]) {
  MULTI_VALUE_TYPES.add(type);
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
