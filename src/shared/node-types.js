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
  mmoNetwork: "#22c55e",
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

export const MMO_NETWORK_PRESET_NAMES = ["custom", "extreme_low_bandwidth", "low_bandwidth", "stable", "balanced", "responsive", "fast", "lan_debug", "smooth_mmo"];
export const MMO_NETWORK_PRESET_OPTIONS = [
  { value: "custom", label: "Custom" },
  { value: "extreme_low_bandwidth", label: "0 Extreme low bandwidth" },
  { value: "low_bandwidth", label: "1 Low bandwidth" },
  { value: "stable", label: "2 Stable" },
  { value: "balanced", label: "3 Balanced 30/20/30" },
  { value: "responsive", label: "4 Responsive" },
  { value: "fast", label: "5 Fast" },
  { value: "lan_debug", label: "6 LAN debug" },
  { value: "smooth_mmo", label: "7 Smooth MMO no rubberband" }
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

const MMO_NETWORK_PRESET_ALIASES = {
  "0": "extreme_low_bandwidth",
  extreme: "extreme_low_bandwidth",
  extreem: "extreme_low_bandwidth",
  extream: "extreme_low_bandwidth",
  extreme_low: "extreme_low_bandwidth",
  low: "low_bandwidth",
  "1": "low_bandwidth",
  bandwidth: "low_bandwidth",
  "2": "stable",
  safe: "stable",
  "3": "balanced",
  medium: "balanced",
  default: "balanced",
  recommended: "balanced",
  "4": "responsive",
  high: "responsive",
  "5": "fast",
  ultra: "fast",
  "6": "lan_debug",
  lan: "lan_debug",
  debug: "lan_debug",
  "7": "smooth_mmo",
  smooth: "smooth_mmo",
  no_rubberband: "smooth_mmo",
  norubberband: "smooth_mmo",
  mmo_smooth: "smooth_mmo"
};

function clampPlainNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function roundTo(value, step = 1) {
  const safeStep = Number(step) > 0 ? Number(step) : 1;
  return Math.round(Number(value) / safeStep) * safeStep;
}

export function normalizeMmoNetworkPreset(value, fallback = "custom") {
  const normalized = String(value || "").trim().toLowerCase();
  if (MMO_NETWORK_PRESET_ALIASES[normalized]) return MMO_NETWORK_PRESET_ALIASES[normalized];
  if (MMO_NETWORK_PRESET_NAMES.includes(normalized)) return normalized;
  const normalizedFallback = String(fallback || "custom").trim().toLowerCase();
  if (MMO_NETWORK_PRESET_ALIASES[normalizedFallback]) return MMO_NETWORK_PRESET_ALIASES[normalizedFallback];
  if (MMO_NETWORK_PRESET_NAMES.includes(normalizedFallback)) return normalizedFallback;
  return "custom";
}

export function mmoNetworkIntervalMsForRate(inputSendRateHz) {
  const rate = clampPlainNumber(inputSendRateHz, 10, 60, 30);
  return Math.max(16, Math.min(120, Math.round(1000 / rate)));
}

export function mmoNetworkCorrectionBlendRateForMs(correctionBlendMs) {
  const durationMs = clampPlainNumber(correctionBlendMs, 50, 1000, 300);
  return Math.round((1 - Math.pow(0.05, 50 / durationMs)) * 1000) / 1000;
}

function mmoNetworkInterpolationWindow(baseDelayMs) {
  const base = clampPlainNumber(baseDelayMs, 0, 300, 200);
  return {
    remoteInterpolationMinDelayMs: Math.max(0, Math.round(base * 0.8)),
    remoteInterpolationMaxDelayMs: Math.min(500, Math.round(base * 1.4))
  };
}

function buildMmoNetworkPreset(values) {
  const baseDelay = clampPlainNumber(values.remoteInterpolationBaseDelayMs, 0, 300, 200);
  const correctionBlendMs = clampPlainNumber(values.ownCorrectionBlendMs, 50, 1000, 300);
  const inputSendRateHz = clampPlainNumber(values.inputSendRateHz, 10, 60, 30);
  return Object.assign({
    enabled: true,
    serverTickRateHz: clampPlainNumber(values.serverTickRateHz, 10, 60, 30),
    snapshotRateHz: clampPlainNumber(values.snapshotRateHz, 5, 30, 20),
    inputSendRateHz: inputSendRateHz,
    moveSendIntervalMs: mmoNetworkIntervalMsForRate(inputSendRateHz),
    remoteInterpolationBaseDelayMs: baseDelay,
    remoteMaxExtrapolationMs: clampPlainNumber(values.remoteMaxExtrapolationMs, 0, 250, 80),
    predictionEnabled: values.predictionEnabled !== false,
    reconciliationEnabled: values.reconciliationEnabled !== false,
    ownPredictionDeadzone: clampPlainNumber(values.ownPredictionDeadzone, 0, 2, 0.35),
    ownSmallCorrectionThreshold: clampPlainNumber(values.ownSmallCorrectionThreshold, 0, 5, 1),
    ownHardCorrectionThreshold: clampPlainNumber(values.ownHardCorrectionThreshold, 0.5, 20, 3),
    ownCorrectionBlendMs: correctionBlendMs,
    ownCorrectionBlendRate: mmoNetworkCorrectionBlendRateForMs(correctionBlendMs),
    ownKeepPredictionDuringInput: values.ownKeepPredictionDuringInput !== false,
    ownActiveCorrectionMaxUnits: clampPlainNumber(values.ownActiveCorrectionMaxUnits, 0, 2, 0.08),
    ownCorrectionMergeFactor: clampPlainNumber(values.ownCorrectionMergeFactor, 0, 1, 0.35),
    ownPostInputHoldMs: clampPlainNumber(values.ownPostInputHoldMs, 0, 2000, 650),
    ownStopResyncMaxUnits: clampPlainNumber(values.ownStopResyncMaxUnits, 0, 200, 40),
    readyTimeoutMs: 12000,
    wsStatusHysteresisMs: 250,
    clientPingIntervalMs: 2000
  }, mmoNetworkInterpolationWindow(baseDelay));
}

const MMO_NETWORK_PRESETS = {
  extreme_low_bandwidth: buildMmoNetworkPreset({
    serverTickRateHz: 15,
    snapshotRateHz: 5,
    inputSendRateHz: 15,
    remoteInterpolationBaseDelayMs: 300,
    remoteMaxExtrapolationMs: 160,
    ownPredictionDeadzone: 0.8,
    ownSmallCorrectionThreshold: 1.8,
    ownHardCorrectionThreshold: 5,
    ownCorrectionBlendMs: 700,
    ownActiveCorrectionMaxUnits: 0.02,
    ownCorrectionMergeFactor: 0.2,
    ownPostInputHoldMs: 1200,
    ownStopResyncMaxUnits: 100
  }),
  low_bandwidth: buildMmoNetworkPreset({
    serverTickRateHz: 20,
    snapshotRateHz: 10,
    inputSendRateHz: 20,
    remoteInterpolationBaseDelayMs: 260,
    remoteMaxExtrapolationMs: 120,
    ownPredictionDeadzone: 0.65,
    ownSmallCorrectionThreshold: 1.6,
    ownHardCorrectionThreshold: 4.5,
    ownCorrectionBlendMs: 600,
    ownActiveCorrectionMaxUnits: 0.03,
    ownCorrectionMergeFactor: 0.25,
    ownPostInputHoldMs: 1000,
    ownStopResyncMaxUnits: 80
  }),
  stable: buildMmoNetworkPreset({
    serverTickRateHz: 30,
    snapshotRateHz: 15,
    inputSendRateHz: 30,
    remoteInterpolationBaseDelayMs: 230,
    remoteMaxExtrapolationMs: 100,
    ownPredictionDeadzone: 0.55,
    ownSmallCorrectionThreshold: 1.4,
    ownHardCorrectionThreshold: 4,
    ownCorrectionBlendMs: 500,
    ownActiveCorrectionMaxUnits: 0.04,
    ownCorrectionMergeFactor: 0.3,
    ownPostInputHoldMs: 850,
    ownStopResyncMaxUnits: 70
  }),
  balanced: buildMmoNetworkPreset({
    serverTickRateHz: 30,
    snapshotRateHz: 20,
    inputSendRateHz: 30,
    remoteInterpolationBaseDelayMs: 200,
    remoteMaxExtrapolationMs: 80,
    ownPredictionDeadzone: 0.5,
    ownSmallCorrectionThreshold: 1.3,
    ownHardCorrectionThreshold: 4,
    ownCorrectionBlendMs: 450,
    ownActiveCorrectionMaxUnits: 0.05,
    ownCorrectionMergeFactor: 0.35,
    ownPostInputHoldMs: 700,
    ownStopResyncMaxUnits: 60
  }),
  responsive: buildMmoNetworkPreset({
    serverTickRateHz: 40,
    snapshotRateHz: 20,
    inputSendRateHz: 40,
    remoteInterpolationBaseDelayMs: 160,
    remoteMaxExtrapolationMs: 70,
    ownPredictionDeadzone: 0.4,
    ownSmallCorrectionThreshold: 1.1,
    ownHardCorrectionThreshold: 3.5,
    ownCorrectionBlendMs: 375,
    ownActiveCorrectionMaxUnits: 0.07,
    ownCorrectionMergeFactor: 0.45,
    ownPostInputHoldMs: 550,
    ownStopResyncMaxUnits: 45
  }),
  fast: buildMmoNetworkPreset({
    serverTickRateHz: 50,
    snapshotRateHz: 25,
    inputSendRateHz: 50,
    remoteInterpolationBaseDelayMs: 130,
    remoteMaxExtrapolationMs: 60,
    ownPredictionDeadzone: 0.35,
    ownSmallCorrectionThreshold: 1,
    ownHardCorrectionThreshold: 3.25,
    ownCorrectionBlendMs: 325,
    ownActiveCorrectionMaxUnits: 0.1,
    ownCorrectionMergeFactor: 0.6,
    ownPostInputHoldMs: 450,
    ownStopResyncMaxUnits: 35
  }),
  lan_debug: buildMmoNetworkPreset({
    serverTickRateHz: 60,
    snapshotRateHz: 30,
    inputSendRateHz: 60,
    remoteInterpolationBaseDelayMs: 90,
    remoteMaxExtrapolationMs: 40,
    ownPredictionDeadzone: 0.25,
    ownSmallCorrectionThreshold: 0.85,
    ownHardCorrectionThreshold: 3,
    ownCorrectionBlendMs: 250,
    ownActiveCorrectionMaxUnits: 0.14,
    ownCorrectionMergeFactor: 0.75,
    ownPostInputHoldMs: 300,
    ownStopResyncMaxUnits: 25
  }),
  smooth_mmo: buildMmoNetworkPreset({
    serverTickRateHz: 30,
    snapshotRateHz: 20,
    inputSendRateHz: 30,
    remoteInterpolationBaseDelayMs: 220,
    remoteMaxExtrapolationMs: 80,
    ownPredictionDeadzone: 0.7,
    ownSmallCorrectionThreshold: 1.7,
    ownHardCorrectionThreshold: 5,
    ownCorrectionBlendMs: 650,
    ownActiveCorrectionMaxUnits: 0.02,
    ownCorrectionMergeFactor: 0.2,
    ownPostInputHoldMs: 1200,
    ownStopResyncMaxUnits: 100
  })
};

export function mmoNetworkPresetValues(preset) {
  const normalized = normalizeMmoNetworkPreset(preset, "");
  if (!normalized || normalized === "custom") return null;
  return MMO_NETWORK_PRESETS[normalized] ? clonePresetValues(MMO_NETWORK_PRESETS[normalized]) : null;
}

export function mmoNetworkPresetNodePatch(preset) {
  const normalized = normalizeMmoNetworkPreset(preset, "custom");
  const values = mmoNetworkPresetValues(normalized);
  return values ? Object.assign({ networkPreset: normalized }, values) : { networkPreset: "custom" };
}

export function mmoNetworkFieldNodePatch(key, value, currentValues = {}) {
  const patch = { [key]: cloneDefaultValue(value) };
  const linkedFields = new Set([
    "serverTickRateHz",
    "snapshotRateHz",
    "inputSendRateHz",
    "remoteInterpolationBaseDelayMs",
    "remoteInterpolationMinDelayMs",
    "remoteInterpolationMaxDelayMs",
    "ownHardCorrectionThreshold",
    "ownCorrectionBlendMs",
    "ownActiveCorrectionMaxUnits",
    "ownCorrectionMergeFactor",
    "ownKeepPredictionDuringInput",
    "ownPostInputHoldMs",
    "ownStopResyncMaxUnits",
    "predictionEnabled",
    "reconciliationEnabled"
  ]);
  if (key === "networkPreset") return mmoNetworkPresetNodePatch(value);
  if (!linkedFields.has(key)) return patch;

  patch.networkPreset = "custom";
  if (key === "serverTickRateHz") {
    const serverRate = clampPlainNumber(value, 10, 60, 30);
    const snapshotRate = clampPlainNumber(currentValues.snapshotRateHz, 5, 30, 20);
    const inputRate = clampPlainNumber(currentValues.inputSendRateHz, 10, 60, 30);
    patch.serverTickRateHz = serverRate;
    if (snapshotRate > serverRate) patch.snapshotRateHz = serverRate;
    if (inputRate > serverRate) {
      patch.inputSendRateHz = serverRate;
      patch.moveSendIntervalMs = mmoNetworkIntervalMsForRate(serverRate);
    }
  } else if (key === "snapshotRateHz") {
    const snapshotRate = clampPlainNumber(value, 5, 30, 20);
    const serverRate = clampPlainNumber(currentValues.serverTickRateHz, 10, 60, 30);
    patch.snapshotRateHz = snapshotRate;
    if (serverRate < snapshotRate) patch.serverTickRateHz = snapshotRate;
    const baseDelay = snapshotRate <= 10 ? 260 : (snapshotRate <= 15 ? 230 : (snapshotRate <= 20 ? 200 : (snapshotRate <= 25 ? 160 : 130)));
    patch.remoteInterpolationBaseDelayMs = baseDelay;
    Object.assign(patch, mmoNetworkInterpolationWindow(baseDelay));
  } else if (key === "inputSendRateHz") {
    const inputRate = clampPlainNumber(value, 10, 60, 30);
    const serverRate = clampPlainNumber(currentValues.serverTickRateHz, 10, 60, 30);
    patch.inputSendRateHz = inputRate;
    patch.moveSendIntervalMs = mmoNetworkIntervalMsForRate(inputRate);
    if (serverRate < inputRate) patch.serverTickRateHz = inputRate;
  } else if (key === "remoteInterpolationBaseDelayMs") {
    Object.assign(patch, mmoNetworkInterpolationWindow(value));
  } else if (key === "remoteInterpolationMinDelayMs") {
    const minDelay = clampPlainNumber(value, 0, 300, 0);
    const baseDelay = clampPlainNumber(currentValues.remoteInterpolationBaseDelayMs, 0, 300, 200);
    const maxDelay = clampPlainNumber(currentValues.remoteInterpolationMaxDelayMs, 0, 500, 280);
    if (baseDelay < minDelay) patch.remoteInterpolationBaseDelayMs = minDelay;
    if (maxDelay < minDelay) patch.remoteInterpolationMaxDelayMs = minDelay;
  } else if (key === "remoteInterpolationMaxDelayMs") {
    const maxDelay = clampPlainNumber(value, 0, 500, 280);
    const minDelay = clampPlainNumber(currentValues.remoteInterpolationMinDelayMs, 0, 300, 160);
    const baseDelay = clampPlainNumber(currentValues.remoteInterpolationBaseDelayMs, 0, 300, 200);
    if (baseDelay > maxDelay) patch.remoteInterpolationBaseDelayMs = maxDelay;
    if (minDelay > maxDelay) patch.remoteInterpolationMinDelayMs = maxDelay;
  } else if (key === "ownHardCorrectionThreshold") {
    const snapDistance = clampPlainNumber(value, 0.5, 20, 3);
    patch.ownSmallCorrectionThreshold = Math.min(5, Math.max(0, roundTo(snapDistance * 0.35, 0.05)));
  } else if (key === "ownCorrectionBlendMs") {
    patch.ownCorrectionBlendRate = mmoNetworkCorrectionBlendRateForMs(value);
  } else if (key === "predictionEnabled") {
    if (value === false) patch.reconciliationEnabled = false;
    if (value === true && currentValues.reconciliationEnabled === false) patch.reconciliationEnabled = true;
  } else if (key === "reconciliationEnabled") {
    if (value === true) patch.predictionEnabled = true;
  }
  return patch;
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
    scatterCast: true,
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
    cameraSize: 70,
    cameraFar: 300,
    bias: -0.0003,
    normalBias: 0.04,
    staticPropsCast: false,
    staticPropsReceive: true,
    scatterCast: true,
    scatterReceive: true,
    groundReceives: true,
    terrainReceives: true,
    shadowResidentMarginChunks: 0
  }),
  middel_schaduw: buildShadowPreset("game", "middel_schaduw", {
    enabled: true,
    mapSize: 512,
    cameraSize: 70,
    cameraFar: 300,
    bias: -0.0003,
    normalBias: 0.04,
    staticPropsCast: false,
    staticPropsReceive: true,
    scatterCast: true,
    scatterReceive: true,
    groundReceives: true,
    terrainReceives: true,
    shadowResidentMarginChunks: 0
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

function shadowFocusModeOptions(mode) {
  if (mode === "game") {
    return [
      { value: "", label: "Preset/default" },
      { value: "player_or_spawn", label: "Player/spawn" },
      { value: "camera_target", label: "Game camera target" },
      { value: "world_center", label: "World/content center" }
    ];
  }
  return [
    { value: "", label: "Preset/default" },
    { value: "editor_world_center_or_selected", label: "Selected/world center" },
    { value: "editor_camera_target", label: "Editor camera target" },
    { value: "editor_world_center", label: "World/content center" },
    { value: "spawn", label: "Spawn" }
  ];
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
    }),
    [prefix + "ShadowMapSize"]: field("Shadow map size", {
      section: "Shadow camera",
      label: "Shadow map size",
      type: "number",
      default: 0,
      min: 0,
      max: 4096,
      step: 1,
      required: false,
      help: "0 gebruikt de preset. Positieve overrides worden minimaal 256; hoger is scherper maar zwaarder."
    }),
    [prefix + "ShadowCameraSize"]: field("Shadow camera size", {
      section: "Shadow camera",
      label: "Shadow camera size",
      type: "number",
      default: 0,
      min: 0,
      max: 1000,
      step: 1,
      required: false,
      help: "Orthographic half-size van de shadow-camera. 0 gebruikt de preset. Groter dekt meer editor/game wereld af, maar maakt schaduw grover."
    }),
    [prefix + "ShadowCameraNear"]: field("Shadow camera near", {
      section: "Shadow camera",
      label: "Shadow camera near",
      type: "number",
      default: 0,
      min: 0,
      max: 1000,
      step: 0.1,
      required: false,
      help: "0 gebruikt de preset. Alleen aanpassen als shadows dichtbij de zoncamera clippen."
    }),
    [prefix + "ShadowCameraFar"]: field("Shadow camera far", {
      section: "Shadow camera",
      label: "Shadow camera far",
      type: "number",
      default: 0,
      min: 0,
      max: 5000,
      step: 1,
      required: false,
      help: "0 gebruikt de preset. Verhoog dit als lange/hoog geplaatste directional lights clippen."
    }),
    [prefix + "ShadowSnapWorldUnits"]: field("Shadow refresh distance", {
      section: "Shadow camera",
      label: "Shadow refresh distance",
      type: "number",
      default: 0,
      min: 0,
      max: 100,
      step: 1,
      required: false,
      help: "0 gebruikt de preset. 1 vernieuwt het vaakst en geeft de kleinste stappen; hoger is lichter maar kan kale stukken geven tijdens pan/chunkverplaatsing."
    }),
    [prefix + "ShadowFocusMode"]: field("Shadow focus mode", {
      section: "Shadow camera",
      label: "Shadow focus mode",
      type: "select",
      options: shadowFocusModeOptions(mode),
      default: "",
      required: false,
      help: "Leeg gebruikt de preset. Editor camera target laat de shadow-box meebewegen met hetzelfde focusconcept als de game-camera target."
    }),
    [prefix + "ShadowResidentMarginChunks"]: field("Shadow chunk margin", {
      section: "Shadow camera",
      label: "Shadow chunk margin",
      type: "number",
      default: -1,
      min: -1,
      max: 20,
      step: 1,
      required: false,
      help: "-1 gebruikt de preset. 0 is lichter; hoger houdt extra chunk-marge voor stabielere shadows."
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
  antialias: false,
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
  function normalizePorts(ports, direction) {
    const seen = new Set();
    const normalized = [];
    for (const [index, port] of ports.entries()) {
      const clean = coerceGroupPort(port, direction + "_" + (index + 1));
      if (!clean || seen.has(clean.name)) continue;
      seen.add(clean.name);
      normalized.push(clean);
    }
    return normalized;
  }
  return {
    inputs: normalizePorts(inputs, "input"),
    outputs: normalizePorts(outputs, "output")
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
      mmoNetwork: { label: "MMO Network", dataType: "mmoNetwork", required: false, multiple: false },
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
    inputs: { chunkGrid: { label: "Chunk Grid", dataType: "chunkGrid", required: false, multiple: false } },
    outputs: { chunkLoading: { label: "Chunk Loading", dataType: "chunkLoading" } },
    fields: EDITOR_CHUNK_LOADING_FIELDS
  },

  game_chunk_loading: {
    label: "Game Chunk Loading",
    group: "World",
    accent: "#67d8c4",
    description: "Game loading policy for keeping runtime chunks just outside the game camera. Tune the active chunk square to stay inside the frustum without clipping maxLoadedChunks.",
    inputs: { chunkGrid: { label: "Chunk Grid", dataType: "chunkGrid", required: false, multiple: false } },
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
      edgeFadeWidth: { section: "Zone Blend", label: "Zone edge fader", type: "number", default: 0, min: 0, max: 120, step: 1, required: false, editorControl: "range" },
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
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "top-left", required: true },
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
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "top-right", required: true },
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
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "top-left", required: true },
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
      showLastRemoteEventType: { label: "Show last remote event", type: "boolean", default: true, required: true },
      showMmoSettings: { label: "Show MMO settings", type: "boolean", default: true, required: true },
      showMmoHealth: { label: "Show MMO health", type: "boolean", default: true, required: true },
      showMinimapFog: { label: "Show minimap fog", type: "boolean", default: true, required: true }
    }
  },

	  mmo_network_settings: {
	    label: "MMO Network Settings",
	    group: "Project",
	    accent: "#22c55e",
	    description: "Client-side MMO smoothing and connection tuning for testing movement jitter without code changes.",
	    inputs: {},
	    outputs: { mmoNetwork: { label: "MMO Network", dataType: "mmoNetwork" } },
	    fields: {
	      settingsId: { section: "Identity", label: "Settings id (settingsId)", type: "text", default: "mmo_network", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
	      enabled: { section: "Identity", label: "Enabled (enabled)", type: "boolean", default: true, required: true },
	      networkPreset: { section: "Preset", label: "Netcode preset (networkPreset)", type: "select", options: MMO_NETWORK_PRESET_OPTIONS, default: "custom", required: true, help: "Custom bewaart jouw eigen waarden. Presets 0-7 zetten de gekoppelde hardcode velden tegelijk. 0 is meeste smoothing/laagste bandwidth; 7 is de rustigste no-rubberband MMO preset." },
	      serverTickRateHz: { section: "Rates", label: "Fixed timestep Hz (serverTickRateHz)", type: "number", default: 30, min: 10, max: 60, step: 1, required: true, help: "Gangbare game-dev naam: fixed timestep of simulation tick. Houd state replication en client input rate niet hoger dan deze waarde. 30 Hz is de normale MMO-keuze." },
	      snapshotRateHz: { section: "Rates", label: "State replication Hz (snapshotRateHz)", type: "number", default: 20, min: 5, max: 30, step: 1, required: true, help: "Gangbare game-dev naam: snapshot rate, replication rate of state sync rate. Best practice: 15-20 Hz voor MMO movement. Bij aanpassen volgt de interpolation buffer mee." },
	      inputSendRateHz: { section: "Rates", label: "Client input rate Hz (inputSendRateHz)", type: "number", default: 30, min: 10, max: 60, step: 1, required: true, help: "Gangbare game-dev naam: input command rate of client input rate. Meestal gelijk aan fixed timestep. Dit schrijft ook de oude hardcode fallback moveSendIntervalMs mee." },
	      moveSendIntervalMs: { section: "Rates", label: "Move send interval ms (moveSendIntervalMs)", type: "number", default: 33, min: 16, max: 120, step: 1, required: true, hidden: true, help: "Legacy hardcode waarde. Wordt automatisch berekend uit inputSendRateHz." },
	      remoteInterpolationBaseDelayMs: { section: "Remote interpolation", label: "Interpolation buffer ms (remoteInterpolationBaseDelayMs)", type: "number", default: 200, min: 0, max: 300, step: 1, required: true, help: "Gangbare game-dev naam: interpolation buffer delay. Best practice: rond 200 ms bij 20 Hz snapshots. Bij aanpassen volgen min/max mee zodat remote spelers minder jitteren." },
	      remoteInterpolationMinDelayMs: { section: "Remote interpolation", label: "Interpolation buffer min ms (remoteInterpolationMinDelayMs)", type: "number", default: 160, min: 0, max: 300, step: 1, required: true, help: "Ondergrens voor dynamic interpolation buffer. Hoort onder remoteInterpolationBaseDelayMs te blijven." },
	      remoteInterpolationMaxDelayMs: { section: "Remote interpolation", label: "Interpolation buffer max ms (remoteInterpolationMaxDelayMs)", type: "number", default: 280, min: 0, max: 500, step: 1, required: true, help: "Bovengrens voor jitter buffer. Hoort boven remoteInterpolationBaseDelayMs te blijven." },
	      remoteMaxExtrapolationMs: { section: "Remote interpolation", label: "Extrapolation limit ms (remoteMaxExtrapolationMs)", type: "number", default: 80, min: 0, max: 250, step: 1, required: true, help: "Gangbare game-dev naam: extrapolation limit. Hoe lang remote spelers mogen doorlopen als een snapshot te laat is." },
	      predictionEnabled: { section: "Prediction and reconciliation", label: "Client-side prediction (predictionEnabled)", type: "boolean", default: true, required: true, help: "Best practice: aan. De client beweegt direct lokaal en wacht niet op de server." },
	      reconciliationEnabled: { section: "Prediction and reconciliation", label: "Server reconciliation (reconciliationEnabled)", type: "boolean", default: true, required: true, help: "Best practice: aan samen met client-side prediction. Servercorrecties worden verwerkt zonder zichtbare terugtrek." },
	      ownHardCorrectionThreshold: { section: "Prediction and reconciliation", label: "Snap threshold units (ownHardCorrectionThreshold)", type: "number", default: 3, min: 0.5, max: 20, step: 0.1, required: true, help: "Gangbare game-dev naam: snap threshold of teleport threshold. Afstand waarna de eigen speler hard naar de serverpositie snapt. Best practice: 2.5 tot 4." },
	      ownCorrectionBlendMs: { section: "Prediction and reconciliation", label: "Correction smoothing ms (ownCorrectionBlendMs)", type: "number", default: 300, min: 50, max: 1000, step: 10, required: true, help: "Gangbare game-dev naam: correction smoothing of reconciliation smoothing. Best practice: 250-350 ms. Schrijft ownCorrectionBlendRate automatisch mee." },
	      ownCorrectionBlendRate: { section: "Prediction and reconciliation", label: "Own correction blend rate (ownCorrectionBlendRate)", type: "number", default: 0.393, min: 0, max: 1, step: 0.001, required: true, hidden: true, help: "Legacy hardcode waarde. Wordt automatisch berekend uit ownCorrectionBlendMs." },
	      ownPredictionDeadzone: { section: "Prediction and reconciliation", label: "Prediction error tolerance (ownPredictionDeadzone)", type: "number", default: 0.35, min: 0, max: 2, step: 0.01, required: true, help: "Gangbare game-dev naam: prediction error tolerance of deadzone. Serverafwijkingen hieronder worden genegeerd tijdens bewegen." },
	      ownSmallCorrectionThreshold: { section: "Prediction and reconciliation", label: "Soft correction threshold (ownSmallCorrectionThreshold)", type: "number", default: 1.0, min: 0, max: 5, step: 0.05, required: true, help: "Grens tussen kleine directe correctie en smooth reconcile bij stilstand. Wordt mee gezet bij snap threshold." },
	      ownKeepPredictionDuringInput: { section: "Prediction and reconciliation", label: "Hold prediction while moving (ownKeepPredictionDuringInput)", type: "boolean", default: true, required: true, help: "Laat server snapshots tijdens actieve input alleen ack/debug bijwerken. Dit voorkomt de zichtbare tik/rubberband door late servercoordinaten." },
	      ownActiveCorrectionMaxUnits: { section: "Prediction and reconciliation", label: "Active correction cap units (ownActiveCorrectionMaxUnits)", type: "number", default: 0.08, min: 0, max: 2, step: 0.01, required: true, help: "Maximale correctie die per server-ack tijdens actieve input mag worden opgebouwd als hold prediction uit staat. 0 schakelt actieve correctie uit." },
	      ownCorrectionMergeFactor: { section: "Prediction and reconciliation", label: "Correction merge factor (ownCorrectionMergeFactor)", type: "number", default: 0.35, min: 0, max: 1, step: 0.01, required: true, help: "Hoe sterk een nieuwe servercorrectie de vorige openstaande correctie vervangt. Lager is rustiger, hoger volgt sneller." },
	      ownPostInputHoldMs: { section: "Prediction and reconciliation", label: "Post-input hold ms (ownPostInputHoldMs)", type: "number", default: 650, min: 0, max: 2000, step: 10, required: true, help: "Na loslaten blijft de client prediction kort vasthouden zodat de server zijn vertraagde beweging kan inhalen voordat een stop-snapshot mag corrigeren." },
	      ownStopResyncMaxUnits: { section: "Prediction and reconciliation", label: "Stop resync max units (ownStopResyncMaxUnits)", type: "number", default: 40, min: 0, max: 200, step: 1, required: true, help: "Maximale afstand waarbij de server bij loslaten de laatste client-prediction mag overnemen. Dit voorkomt meters terugvallen na lang lopen." },
	      readyTimeoutMs: { section: "Connection", label: "Ready timeout ms (readyTimeoutMs)", type: "number", default: 12000, min: 1000, max: 30000, step: 100, required: true },
	      wsStatusHysteresisMs: { section: "Connection", label: "WS status delay ms (wsStatusHysteresisMs)", type: "number", default: 250, min: 0, max: 2000, step: 10, required: true },
	      clientPingIntervalMs: { section: "Connection", label: "Client ping interval ms (clientPingIntervalMs)", type: "number", default: 2000, min: 500, max: 10000, step: 100, required: true }
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
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "top-right", required: true },
      sizePx: { label: "Size (px)", type: "number", default: 180, min: 64, max: 512, step: 1, required: true },
      marginPx: { label: "Margin (px)", type: "number", default: 12, min: 0, max: 80, step: 1, required: true },
      borderRadiusPx: { label: "Border radius (px)", type: "number", default: 14, min: 0, max: 64, step: 1, required: true },
      backgroundOpacity: { label: "Background opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, required: true },
      markerUpdateMs: { label: "Marker update (ms)", type: "number", default: 100, min: 33, max: 1000, step: 1, required: true, help: "Begrenst hoe vaak de canvas markers herrekend worden." },
      fogOfWarEnabled: { section: "Minimap Fog of War", label: "Enabled", type: "boolean", default: true, required: true },
      fogColor: { section: "Minimap Fog of War", label: "Fog color", type: "color", default: "#05070a", required: false },
      fogOpacity: { section: "Minimap Fog of War", label: "Fog opacity", type: "number", default: 0.72, min: 0, max: 1, step: 0.01, required: true },
      fogChunkSize: { section: "Minimap Fog of War", label: "Cell size", type: "number", default: 24, min: 1, max: 1000, step: 1, required: true },
      revealRadius: { section: "Minimap Fog of War", label: "Reveal radius", type: "number", default: 3, min: 0, max: 64, step: 1, required: true },
      saveIntervalMs: { section: "Minimap Fog of War", label: "Save interval ms", type: "number", default: 1500, min: 250, max: 60000, step: 50, required: true },
      movementThreshold: { section: "Minimap Fog of War", label: "Movement threshold cells", type: "number", default: 1, min: 1, max: 64, step: 1, required: true },
      smoothFog: { section: "Minimap Fog of War", label: "Smooth fog", type: "boolean", default: true, required: true },
      fogFeatherRadius: { section: "Minimap Fog of War", label: "Fog feather radius cells", type: "number", default: 1.5, min: 0, max: 8, step: 0.25, required: true },
      revealShape: { section: "Minimap Fog of War", label: "Reveal shape", type: "select", options: ["circle", "roundedCells", "hardCells"], default: "circle", required: true },
      debugOverlay: { section: "Minimap Fog of War", label: "Debug overlay", type: "boolean", default: false, required: true },
      revealHeight: { section: "Minimap Fog of War", label: "Reveal height metadata", type: "number", default: 0, min: -100000, max: 100000, step: 1, required: false, help: "Metadata voor latere hoogte/occlusion-regels; NODE-02.5 gebruikt dit nog niet voor 3D visibility." },
      debugMode: { label: "Debug mode", type: "boolean", default: false, required: true, help: "Aan: extra markers, labels en viewport cone tekenen. Uit: snelle minimap met speler en quest markers." },
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
      showNpcEntityNames: { label: "Show NPC/model names", type: "boolean", default: true, required: true },
      showScatterInstances: { label: "Show scatter instances", type: "boolean", default: false, required: true },
      showScatterNames: { label: "Show scatter names", type: "boolean", default: false, required: true },
      showInteractables: { label: "Show interactables", type: "boolean", default: false, required: true },
      showQuestMarkers: { label: "Show quest markers", type: "boolean", default: true, required: true },
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
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "bottom-right", required: true },
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
      showScatterInstances: { label: "Show scatter instances", type: "boolean", default: false, required: true },
      showScatterNames: { label: "Show scatter names", type: "boolean", default: false, required: true },
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
      groupKind: { label: "Group kind", type: "select", options: ["generic", "catalog", "zone", "area", "campaign", "quest", "dialogue", "player_rules", "ui"], default: "generic", required: true },
      zoneCanvas: { label: "Zone canvas", type: "boolean", default: false, required: false, hidden: true },
      zoneGridX: { label: "Zone grid X", type: "number", default: 0, min: -100000, max: 100000, step: 1, required: false, hidden: true },
      zoneGridZ: { label: "Zone grid Z", type: "number", default: 0, min: -100000, max: 100000, step: 1, required: false, hidden: true },
      zoneCanvasRootId: { label: "Zone canvas root id", type: "text", default: "", required: false, maxLength: 120, hidden: true },
      zoneCanvasParentZoneId: { label: "Zone canvas parent zone id", type: "text", default: "", required: false, maxLength: 120, hidden: true },
      zoneCanvasParentSide: { label: "Zone canvas parent side", type: "text", default: "", required: false, maxLength: 24, hidden: true },
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
  "campaign",
  "chapter",
  "quest",
  "quest_step",
  "objective",
  "condition",
  "action",
  "reward",
  "dialogue",
  "dialogue_entry",
  "dialogue_choice",
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
  playableCharacterDef: "#0f766e",
  itemDef: "#84cc16",
  itemModifierDef: "#a3e635",
  resourceDef: "#22c55e",
  currencyDef: "#facc15",
  equipmentSlotDef: "#38bdf8",
  statDef: "#14b8a6",
  statBlock: "#0d9488",
  statCurve: "#2dd4bf",
  abilityDef: "#f43f5e",
  abilityRankDef: "#fb7185",
  statusEffectDef: "#e879f9",
  damageTypeDef: "#ef4444",
  combatProfile: "#dc2626",
  enemyDef: "#b91c1c",
  npcDef: "#c084fc",
  variantDef: "#f97316",
  aiProfile: "#f59e0b",
  pathBehaviorDef: "#fde047",
  animationSet: "#818cf8",
  lootEntry: "#fbbf24",
  lootTable: "#d97706",
  recipeDef: "#a16207",
  factionDef: "#7c3aed",
  reputationDef: "#a855f7",
  musicTrackDef: "#60a5fa",
  musicPlaylistDef: "#2563eb",
  audioEventDef: "#0ea5e9",
  vfxDef: "#06b6d4",
  difficultyDef: "#be123c",
  respawnPolicy: "#4d7c0f",
  spawnEntry: "#bef264",
  spawnSet: "#65a30d",
  spawnController: "#3f6212",
  encounter: "#991b1b",
  playerPolicy: "#0f766e",
  inventoryPolicy: "#15803d",
  equipmentPolicy: "#0369a1",
  abilityPolicy: "#be123c",
  xpRule: "#7c2d12",
  deathPolicy: "#64748b",
  unstuckPolicy: "#94a3b8",
  uiModule: "#e11d48",
  zonePackage: "#0284c7",
  zoneRegistry: "#0369a1",
  campaignDef: "#d97706",
  chapterDef: "#f59e0b",
  questDef: "#fbbf24",
  questStepDef: "#fde68a",
  objective: "#84cc16",
  objectiveGroup: "#65a30d",
  condition: "#38bdf8",
  conditionGroup: "#0284c7",
  action: "#fb7185",
  actionList: "#e11d48",
  rewardEntry: "#facc15",
  rewardBundle: "#eab308",
  recipeIngredient: "#ca8a04",
  vendorCatalogDef: "#f97316",
  vendorOffer: "#fb923c",
  craftingPolicy: "#a16207",
  vendorPolicy: "#ea580c",
  partyLootPolicy: "#7c3aed",
  partyPolicy: "#8b5cf6",
  tradePolicy: "#0891b2",
  marketPolicy: "#059669",
  economyRule: "#16a34a",
  mailPolicy: "#475569",
  uiLayout: "#f43f5e",
  menuLayout: "#be123c",
  questTerminal: "#a3a3a3",
  eventTrigger: "#a78bfa",
  markerRule: "#22d3ee",
  dialogueDef: "#c084fc",
  dialogueEntry: "#d8b4fe",
  dialogueChoice: "#f0abfc",
  dialogueTerminal: "#a3a3a3",
  dialogueRouterDef: "#9333ea",
  questRuntimeRef: "#4ade80",
  dialogueRuntimeRef: "#f472b6",
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
    return { inputs: [], outputs: [{ id: "zonepkg", name: "zonepkg", label: "zonePkg", dataType: "zonePackage", multiple: false }] };
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
      mmoNetwork: { label: "MMO Network", dataType: "mmoNetwork", required: false, multiple: false },
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
      lights: { label: "Lights", dataType: "light", required: false, multiple: true },
      chunkPolicies: { label: "Chunk Policies", dataType: "chunkPolicy", required: false, multiple: true },
      chunkLoading: { label: "Chunk Loading", dataType: "chunkLoading", required: false, multiple: true },
      mmoNetwork: { label: "MMO Network", dataType: "mmoNetwork", required: false, multiple: false },
      catalogs: { label: "Catalogs", dataType: "catalogRegistry", required: false, multiple: false },
      zones: { label: "Zones", dataType: "zoneRegistry", required: false, multiple: false },
      campaigns: { label: "Campaigns", dataType: "campaignRegistry", required: false, multiple: false },
      playerRules: { label: "Player Rules", dataType: "playerRules", required: false, multiple: false },
      ui: { label: "UI", dataType: "uiPackage", required: false, multiple: false },
      keybinds: { label: "Keybinds", dataType: "keybind", required: false, multiple: true },
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
      mapRevealMode: { label: "Map reveal", type: "select", options: ["hidden", "outline", "full"], default: "outline", required: true },
      revealFogOnEnter: { section: "Fog of War", label: "Reveal fog when player enters area", type: "boolean", default: false, required: true },
      fogRevealPaddingCells: { section: "Fog of War", label: "Fog reveal padding cells", type: "number", default: 0, min: 0, max: 256, step: 1, required: true }
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
      targetTags: { label: "Target tags", type: "tagList", default: [], required: false },
      targetKind: { label: "Target kind", type: "select", options: ["npc", "area", "resource", "zone_link", "marker", "custom"], default: "marker", required: true },
      zoneRef: { label: "Zone", type: "reference", referenceKinds: ["zone"], allowNull: true, default: null, required: false },
      entityRef: { label: "Entity", type: "reference", referenceKinds: ["entity", "target"], allowNull: true, default: null, required: false },
      action: { label: "Action", type: "identity", default: "node04:marker", required: false, maxLength: 160, pattern: "^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$" },
      prompt: { label: "Prompt", type: "tokenText", default: "Gebruik", required: false, maxLength: 240 },
      x: { label: "X", type: "number", default: 0, min: -100000, max: 100000, step: 0.01, required: true },
      y: { label: "Y", type: "number", default: 0, min: -100000, max: 100000, step: 0.01, required: true },
      z: { label: "Z", type: "number", default: 0, min: -100000, max: 100000, step: 0.01, required: true },
      radius: { label: "Radius", type: "number", default: 2.5, min: 0.1, max: 1000, step: 0.1, required: true },
      visibleInGame: { label: "Visible in game", type: "boolean", default: true, required: true }
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

function definitionFields(idField, defaultId, displayName, extra = {}) {
  return Object.assign({
    [idField]: { label: "Id", type: "identity", default: defaultId, required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
    displayName: { label: "Display name", type: "text", default: displayName, required: true, maxLength: 160 },
    internalLabel: { label: "Internal label", type: "text", default: "", required: false, maxLength: 160 },
    definitionVersion: { label: "Definition version", type: "number", default: 1, min: 1, max: 1000000, step: 1, required: true },
    tags: { label: "Tags", type: "tagList", default: [], required: false },
    description: { label: "Description", type: "tokenText", default: "", required: false, maxLength: 1000 },
    enabled: { label: "Enabled", type: "boolean", default: true, required: true }
  }, extra);
}

function refField(label, kinds, required = false) {
  return { label, type: "reference", referenceKinds: kinds, allowNull: !required, default: null, required, maxLength: 160 };
}

function refListField(label, kinds) {
  return { label, type: "referenceList", referenceKinds: kinds, default: [], required: false };
}

function numberField(label, fallback, min = -1000000, max = 1000000, step = 1, required = true) {
  return { label, type: "number", default: fallback, min, max, step, required };
}

const NODE03_CATALOG_NODE_DEFS = {
  playable_character_definition: {
    label: "Playable Character Definition",
    group: "Catalog",
    accent: "#0f766e",
    description: "Reusable player character definition with movement, presentation and starting grants.",
    inputs: {
      statBlock: { label: "Stat Block", dataType: "statBlock", required: false, multiple: false },
      animationSet: { label: "Animation Set", dataType: "animationSet", required: false, multiple: false },
      combatProfile: { label: "Combat Profile", dataType: "combatProfile", required: false, multiple: false },
      equipmentPolicy: { label: "Equipment Policy", dataType: "equipmentPolicy", required: false, multiple: false }
    },
    outputs: {
      playableCharacterDef: { label: "Playable Character", dataType: "playableCharacterDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("characterId", "player.default", "Default Character", {
      modelAssetId: { label: "Model asset", type: "asset", assetTypes: ["model"], default: null, required: false },
      iconAssetId: { label: "Icon asset", type: "asset", assetTypes: ["image"], default: null, required: false },
      classTags: { label: "Class tags", type: "tagList", default: [], required: false },
      baseMoveSpeed: numberField("Base move speed", 6, 0.1, 100, 0.1),
      sprintMultiplier: numberField("Sprint x", 1.6, 1, 4, 0.1),
      turnSpeed: numberField("Turn speed", 540, 1, 4000, 1),
      collisionRadius: numberField("Collision radius", 0.5, 0.05, 50, 0.05),
      scale: numberField("Scale", 1, 0.001, 1000, 0.01),
      startingAbilityRefs: refListField("Starting abilities", ["ability"]),
      startingItemGrants: { label: "Starting item grants", type: "json", default: [], required: false },
      startingCurrencyGrants: { label: "Starting currency grants", type: "json", default: [], required: false },
      defaultLoadoutId: { label: "Default loadout id", type: "identity", default: "loadout.main", required: false, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN }
    })
  },
  item_definition: {
    label: "Item Definition",
    group: "Catalog",
    accent: "#84cc16",
    description: "Reusable item definition for stackable items and unique equipment.",
    inputs: {},
    outputs: {
      itemDef: { label: "Item", dataType: "itemDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("itemId", "item.new_item", "New Item", {
      iconAssetId: { label: "Icon asset", type: "asset", assetTypes: ["image"], default: null, required: false },
      worldModelAssetId: { label: "World model asset", type: "asset", assetTypes: ["model"], default: null, required: false },
      category: { label: "Category", type: "select", options: ["material", "consumable", "equipment", "quest", "misc", "custom"], default: "misc", required: true },
      subcategory: { label: "Subcategory", type: "text", default: "", required: false, maxLength: 96 },
      rarity: { label: "Rarity", type: "select", options: ["common", "uncommon", "rare", "epic", "legendary", "quest", "custom"], default: "common", required: true },
      stackable: { label: "Stackable", type: "boolean", default: true, required: true },
      stackLimit: numberField("Stack limit", 99, 1, 1000000, 1),
      weight: numberField("Weight", 0, 0, 1000000, 0.01),
      vendorBaseValueMinor: numberField("Vendor value minor", 0, 0, 100000000000, 1),
      vendorCurrencyRef: refField("Vendor currency", ["currency"]),
      bindPolicy: { label: "Bind policy", type: "select", options: ["unbound", "bind_on_pickup", "bind_on_equip", "character_bound", "account_bound", "quest_bound"], default: "unbound", required: true },
      tradable: { label: "Tradable", type: "boolean", default: true, required: true },
      droppable: { label: "Droppable", type: "boolean", default: true, required: true },
      destroyable: { label: "Destroyable", type: "boolean", default: true, required: true },
      marketEligible: { label: "Market eligible", type: "boolean", default: false, required: true },
      questItem: { label: "Quest item", type: "boolean", default: false, required: true },
      equipmentSlotRef: refField("Equipment slot", ["equipment_slot"]),
      durabilityMax: numberField("Durability max", 0, 0, 1000000, 1, false),
      useActionRefs: refListField("Use actions", ["policy"]),
      statModifierRefs: refListField("Stat modifiers", ["item_modifier"]),
      pickupAudioRef: refField("Pickup audio", ["audio"]),
      pickupVfxRef: refField("Pickup VFX", ["vfx"]),
      pickupAnimationRef: refField("Pickup animation", ["animation_set"]),
      inventoryTags: { label: "Inventory tags", type: "tagList", default: [], required: false }
    })
  },
  item_modifier_definition: {
    label: "Item Modifier Definition",
    group: "Catalog",
    accent: "#a3e635",
    description: "Reusable stat/status modifier pool entry for item instances.",
    inputs: {},
    outputs: {
      itemModifierDef: { label: "Item Modifier", dataType: "itemModifierDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("modifierId", "item_modifier.new_modifier", "New Modifier", {
      applicableItemTagQuery: { label: "Applicable item tags", type: "tagQuery", default: { all: [], any: [], none: [] }, required: false },
      statChanges: { label: "Stat changes", type: "json", default: [], required: false },
      statusEffectRefs: refListField("Status effects", ["status_effect"]),
      rarityWeight: numberField("Rarity weight", 1, 0, 1000000, 0.01),
      exclusiveGroup: { label: "Exclusive group", type: "identity", default: "", required: false, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN }
    })
  },
  currency_definition: {
    label: "Currency Definition",
    group: "Catalog",
    accent: "#facc15",
    description: "Wallet-backed currency stored in integer minor units.",
    inputs: {},
    outputs: {
      currencyDef: { label: "Currency", dataType: "currencyDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("currencyId", "currency.gold", "Gold", {
      iconAssetId: { label: "Icon asset", type: "asset", assetTypes: ["image"], default: null, required: false },
      precision: numberField("Precision", 0, 0, 4, 1),
      maxBalanceMinor: numberField("Max balance minor", 1000000000, 0, 9007199254740991, 1),
      tradable: { label: "Tradable", type: "boolean", default: false, required: true },
      marketAllowed: { label: "Market allowed", type: "boolean", default: false, required: true },
      showInPrimaryWallet: { label: "Show in primary wallet", type: "boolean", default: true, required: true },
      sortOrder: numberField("Sort order", 0, -1000000, 1000000, 1),
      sourceTags: { label: "Source tags", type: "tagList", default: [], required: false },
      sinkTags: { label: "Sink tags", type: "tagList", default: [], required: false }
    })
  },
  equipment_slot_definition: {
    label: "Equipment Slot Definition",
    group: "Catalog",
    accent: "#38bdf8",
    description: "Defines one equipment slot and compatible item tags.",
    inputs: {},
    outputs: {
      equipmentSlotDef: { label: "Equipment Slot", dataType: "equipmentSlotDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("slotId", "equipment_slot.main_hand", "Main Hand", {
      allowedItemTags: { label: "Allowed item tags", type: "tagQuery", default: { all: [], any: [], none: [] }, required: false },
      maxItems: numberField("Max items", 1, 1, 20, 1),
      conflictingSlotRefs: refListField("Conflicting slots", ["equipment_slot"]),
      uiOrder: numberField("UI order", 0, -1000000, 1000000, 1)
    })
  },
  stat_definition: {
    label: "Stat Definition",
    group: "Catalog",
    accent: "#14b8a6",
    description: "Defines a stat used by players, enemies, formulas and HUD.",
    inputs: {},
    outputs: {
      statDef: { label: "Stat", dataType: "statDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("statId", "stat.health", "Health", {
      valueType: { label: "Value type", type: "select", options: ["integer", "decimal", "percent"], default: "integer", required: true },
      minimum: numberField("Minimum", 0, -1000000000, 1000000000, 1),
      maximum: numberField("Maximum", 100, -1000000000, 1000000000, 1),
      defaultValue: numberField("Default value", 0, -1000000000, 1000000000, 1),
      persistCurrentValue: { label: "Persist current value", type: "boolean", default: true, required: true },
      replicateMode: { label: "Replicate mode", type: "select", options: ["owner", "nearby", "all", "none"], default: "owner", required: true },
      uiFormat: { label: "UI format", type: "text", default: "number", required: false, maxLength: 64 }
    })
  },
  stat_block: {
    label: "Stat Block",
    group: "Catalog",
    accent: "#0d9488",
    description: "Reusable stat values for players, enemies and destructibles.",
    inputs: { values: { label: "Values", dataType: "value", required: false, multiple: true } },
    outputs: {
      statBlock: { label: "Stat Block", dataType: "statBlock" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("statBlockId", "stat_block.new_block", "New Stat Block", {
      entries: { label: "Entries", type: "json", default: [{ statRef: "stat.health", baseValue: 100 }], required: false },
      overrideMode: { label: "Override mode", type: "select", options: ["merge", "replace"], default: "merge", required: true }
    })
  },
  stat_curve: {
    label: "Stat Curve",
    group: "Catalog",
    accent: "#2dd4bf",
    description: "Curve values for level, rank or custom formula inputs.",
    inputs: {},
    outputs: {
      statCurve: { label: "Stat Curve", dataType: "statCurve" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("curveId", "stat_curve.level_xp", "Level XP", {
      inputKind: { label: "Input kind", type: "select", options: ["level", "rank", "party_size", "custom"], default: "level", required: true },
      interpolation: { label: "Interpolation", type: "select", options: ["linear", "step", "smooth"], default: "linear", required: true },
      points: { label: "Points", type: "json", default: [{ x: 1, y: 0 }, { x: 2, y: 100 }], required: true },
      clampBefore: { label: "Clamp before", type: "boolean", default: true, required: true },
      clampAfter: { label: "Clamp after", type: "boolean", default: true, required: true }
    })
  },
  damage_type_definition: {
    label: "Damage Type Definition",
    group: "Combat",
    accent: "#ef4444",
    description: "Damage type with optional resistance, VFX and audio refs.",
    inputs: {},
    outputs: {
      damageTypeDef: { label: "Damage Type", dataType: "damageTypeDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("damageTypeId", "damage_type.physical", "Physical", {
      resistanceStatRef: refField("Resistance stat", ["stat"]),
      color: { label: "Color", type: "color", default: "#ffffff", required: false },
      hitVfxRef: refField("Hit VFX", ["vfx"]),
      hitAudioRef: refField("Hit audio", ["audio"])
    })
  },
  status_effect_definition: {
    label: "Status Effect Definition",
    group: "Combat",
    accent: "#e879f9",
    description: "Timed status effect with safe formulas and control flags.",
    inputs: {},
    outputs: {
      statusEffectDef: { label: "Status Effect", dataType: "statusEffectDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("statusEffectId", "status_effect.new_effect", "New Effect", {
      iconAssetId: { label: "Icon asset", type: "asset", assetTypes: ["image"], default: null, required: false },
      durationMs: numberField("Duration ms", 1000, 0, 86400000, 1),
      maxStacks: numberField("Max stacks", 1, 1, 1000, 1),
      stackMode: { label: "Stack mode", type: "select", options: ["refresh_duration", "add_duration", "independent", "replace_stronger"], default: "refresh_duration", required: true },
      tickIntervalMs: numberField("Tick interval ms", 0, 0, 86400000, 1, false),
      statModifierRefs: refListField("Stat modifiers", ["item_modifier"]),
      damagePerTickFormula: { label: "Damage per tick", type: "formula", default: null, required: false },
      healPerTickFormula: { label: "Heal per tick", type: "formula", default: null, required: false },
      damageTypeRef: refField("Damage type", ["damage_type"]),
      dispelTags: { label: "Dispel tags", type: "tagList", default: [], required: false },
      immunityTags: { label: "Immunity tags", type: "tagList", default: [], required: false },
      controlType: { label: "Control type", type: "select", options: ["none", "stun", "root", "slow", "silence", "fear", "knockback"], default: "none", required: true },
      controlStrength: numberField("Control strength", 0, 0, 1000000, 0.01),
      applyVfxRef: refField("Apply VFX", ["vfx"]),
      loopVfxRef: refField("Loop VFX", ["vfx"]),
      removeVfxRef: refField("Remove VFX", ["vfx"])
    })
  },
  ability_definition: {
    label: "Ability Definition",
    group: "Combat",
    accent: "#f43f5e",
    description: "Server-authoritative ability definition with safe formulas.",
    inputs: {
      rankDefinitions: { label: "Ranks", dataType: "abilityRankDef", required: false, multiple: true },
      statusEffects: { label: "Status Effects", dataType: "statusEffectDef", required: false, multiple: true }
    },
    outputs: {
      abilityDef: { label: "Ability", dataType: "abilityDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("abilityId", "ability.basic_attack", "Basic Attack", {
      iconAssetId: { label: "Icon asset", type: "asset", assetTypes: ["image"], default: null, required: false },
      abilityType: { label: "Ability type", type: "select", options: ["basic_attack", "melee", "ranged", "spell", "heal", "buff", "debuff", "movement", "passive", "gather"], default: "basic_attack", required: true },
      resourceCostStatRef: refField("Cost stat", ["stat"]),
      resourceCostFormula: { label: "Cost formula", type: "formula", default: null, required: false },
      cooldownMs: numberField("Cooldown ms", 1000, 0, 86400000, 1),
      castTimeMs: numberField("Cast time ms", 0, 0, 86400000, 1),
      globalCooldownMs: numberField("Global cooldown ms", 0, 0, 86400000, 1),
      range: numberField("Range", 2.5, 0, 10000, 0.1),
      minimumRange: numberField("Minimum range", 0, 0, 10000, 0.1),
      areaShape: { label: "Area shape", type: "select", options: ["single", "circle", "cone", "line", "self", "ground_target"], default: "single", required: true },
      areaRadius: numberField("Area radius", 0, 0, 10000, 0.1),
      coneAngle: numberField("Cone angle", 0, 0, 360, 1),
      targetMode: { label: "Target mode", type: "select", options: ["enemy", "ally", "self", "ground", "resource"], default: "enemy", required: true },
      requiresLineOfSight: { label: "Requires line of sight", type: "boolean", default: false, required: true },
      requiresWeaponTagQuery: { label: "Weapon tags", type: "tagQuery", default: { all: [], any: [], none: [] }, required: false },
      damageFormula: { label: "Damage formula", type: "formula", default: { operator: "add", operands: [10] }, required: false },
      healFormula: { label: "Heal formula", type: "formula", default: null, required: false },
      damageTypeRef: refField("Damage type", ["damage_type"]),
      statusEffectRefs: refListField("Status effects", ["status_effect"]),
      animationRole: { label: "Animation role", type: "text", default: "basicAttack", required: false, maxLength: 64 },
      castAudioRef: refField("Cast audio", ["audio"]),
      impactAudioRef: refField("Impact audio", ["audio"]),
      castVfxRef: refField("Cast VFX", ["vfx"]),
      impactVfxRef: refField("Impact VFX", ["vfx"]),
      interruptible: { label: "Interruptible", type: "boolean", default: true, required: true },
      movementAllowedDuringCast: { label: "Movement while casting", type: "boolean", default: false, required: true },
      serverPredictionMode: { label: "Prediction", type: "select", options: ["none", "local_animation_only"], default: "local_animation_only", required: true }
    })
  },
  ability_rank: {
    label: "Ability Rank",
    group: "Combat",
    accent: "#fb7185",
    description: "Optional rank override for an ability.",
    inputs: {},
    outputs: {
      abilityRankDef: { label: "Ability Rank", dataType: "abilityRankDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("abilityRankId", "ability_rank.basic_attack.1", "Basic Attack Rank 1", {
      abilityRef: refField("Ability", ["ability"], true),
      rank: numberField("Rank", 1, 1, 1000, 1),
      requiredPlayerLevel: numberField("Required level", 1, 1, 1000, 1),
      costMultiplier: numberField("Cost multiplier", 1, 0, 1000, 0.01),
      damageFormulaOverride: { label: "Damage override", type: "formula", default: null, required: false },
      healFormulaOverride: { label: "Heal override", type: "formula", default: null, required: false },
      cooldownOverrideMs: numberField("Cooldown override ms", 0, 0, 86400000, 1, false),
      statusEffectOverrides: { label: "Status effect overrides", type: "json", default: [], required: false }
    })
  },
  combat_profile: {
    label: "Combat Profile",
    group: "Combat",
    accent: "#dc2626",
    description: "Combat behavior profile for player/enemy rotations.",
    inputs: {},
    outputs: {
      combatProfile: { label: "Combat Profile", dataType: "combatProfile" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("combatProfileId", "combat_profile.basic", "Basic Combat", {
      basicAttackRef: refField("Basic attack", ["ability"]),
      abilityRefs: refListField("Abilities", ["ability"]),
      preferredRange: numberField("Preferred range", 2.5, 0, 10000, 0.1),
      aggroResponse: { label: "Aggro response", type: "select", options: ["passive", "defensive", "aggressive"], default: "defensive", required: true },
      abilitySelection: { label: "Ability selection", type: "select", options: ["sequential", "priority", "weighted", "conditions"], default: "priority", required: true },
      rotationEntries: { label: "Rotation entries", type: "json", default: [], required: false },
      targetPriority: { label: "Target priority", type: "select", options: ["nearest", "lowest_health", "highest_threat", "random"], default: "nearest", required: true },
      canFlee: { label: "Can flee", type: "boolean", default: false, required: true },
      fleeHealthPercent: numberField("Flee health %", 0, 0, 1, 0.01),
      enrageHealthPercent: numberField("Enrage health %", 0, 0, 1, 0.01, false),
      enrageStatusEffectRef: refField("Enrage effect", ["status_effect"])
    })
  },
  enemy_archetype: {
    label: "Enemy Archetype",
    group: "Combat",
    accent: "#b91c1c",
    description: "Reusable enemy definition referenced by many spawns.",
    inputs: {
      statBlock: { label: "Stat Block", dataType: "statBlock", required: false, multiple: false },
      combatProfile: { label: "Combat Profile", dataType: "combatProfile", required: false, multiple: false },
      aiProfile: { label: "AI Profile", dataType: "aiProfile", required: false, multiple: false },
      animationSet: { label: "Animation Set", dataType: "animationSet", required: false, multiple: false },
      lootTable: { label: "Loot Table", dataType: "lootTable", required: false, multiple: false },
      faction: { label: "Faction", dataType: "factionDef", required: false, multiple: false },
      difficulty: { label: "Difficulty", dataType: "difficultyDef", required: false, multiple: false }
    },
    outputs: {
      enemyDef: { label: "Enemy", dataType: "enemyDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("enemyId", "enemy.forest_wolf", "Forest Wolf", {
      species: { label: "Species", type: "text", default: "wolf", required: false, maxLength: 96 },
      role: { label: "Role", type: "select", options: ["normal", "ranged", "healer", "tank", "elite", "boss", "ambient"], default: "normal", required: true },
      modelAssetId: { label: "Model asset", type: "asset", assetTypes: ["model"], default: null, required: false },
      iconAssetId: { label: "Icon asset", type: "asset", assetTypes: ["image"], default: null, required: false },
      statBlockRef: refField("Stat block", ["stat_block"]),
      combatProfileRef: refField("Combat profile", ["combat_profile"]),
      aiProfileRef: refField("AI profile", ["ai_profile"]),
      animationSetRef: refField("Animation set", ["animation_set"]),
      lootTableRef: refField("Loot table", ["loot_table"]),
      factionRef: refField("Faction", ["faction"]),
      difficultyRef: refField("Difficulty", ["difficulty"]),
      baseLevel: numberField("Base level", 1, 1, 1000, 1),
      minimumLevel: numberField("Minimum level", 1, 1, 1000, 1),
      maximumLevel: numberField("Maximum level", 1, 1, 1000, 1),
      scale: numberField("Scale", 1, 0.001, 1000, 0.01),
      collisionRadius: numberField("Collision radius", 0.5, 0.05, 50, 0.05),
      networkProfile: { label: "Network profile", type: "select", options: ["low", "normal", "boss"], default: "normal", required: true },
      corpseDurationMs: numberField("Corpse duration ms", 15000, 0, 86400000, 1),
      defaultRespawnPolicyRef: refField("Default respawn policy", ["respawn_policy"]),
      nameplateMode: { label: "Nameplate", type: "select", options: ["none", "near", "targeted", "always"], default: "near", required: true },
      bestiaryCategory: { label: "Bestiary category", type: "text", default: "", required: false, maxLength: 96 }
    })
  },
  npc_archetype: {
    label: "NPC Archetype",
    group: "Catalog",
    accent: "#c084fc",
    description: "Reusable NPC archetype for non-enemy characters.",
    inputs: {},
    outputs: {
      npcDef: { label: "NPC", dataType: "npcDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("npcId", "npc.new_npc", "New NPC", {
      role: { label: "Role", type: "select", options: ["civilian", "quest_giver", "vendor", "trainer", "guard", "companion", "craftsman", "custom"], default: "civilian", required: true },
      modelAssetId: { label: "Model asset", type: "asset", assetTypes: ["model"], default: null, required: false },
      iconAssetId: { label: "Icon asset", type: "asset", assetTypes: ["image"], default: null, required: false },
      factionRef: refField("Faction", ["faction"]),
      animationSetRef: refField("Animation set", ["animation_set"])
    })
  },
  entity_variant: {
    label: "Entity Variant",
    group: "Catalog",
    accent: "#f97316",
    description: "Variant delta for enemy, NPC or item definitions.",
    inputs: {},
    outputs: {
      variantDef: { label: "Variant", dataType: "variantDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("variantId", "variant.young_wolf", "Young Wolf", {
      baseKind: { label: "Base kind", type: "select", options: ["enemy", "npc", "item"], default: "enemy", required: true },
      baseRef: refField("Base ref", ["enemy", "npc", "item"], true),
      displayNameOverride: { label: "Display name override", type: "text", default: "", required: false, maxLength: 160 },
      modelAssetOverride: { label: "Model override", type: "asset", assetTypes: ["model"], default: null, required: false },
      statBlockOverrideRef: refField("Stat block override", ["stat_block"]),
      statMultipliers: { label: "Stat multipliers", type: "json", default: {}, required: false },
      abilityAddRefs: refListField("Add abilities", ["ability"]),
      abilityRemoveRefs: refListField("Remove abilities", ["ability"]),
      lootOverrideRef: refField("Loot override", ["loot_table"]),
      factionOverrideRef: refField("Faction override", ["faction"]),
      tagAdds: { label: "Tag adds", type: "tagList", default: [], required: false },
      tagRemoves: { label: "Tag removes", type: "tagList", default: [], required: false },
      scaleMultiplier: numberField("Scale multiplier", 1, 0.001, 1000, 0.01)
    })
  },
  ai_behavior_profile: {
    label: "AI Behavior Profile",
    group: "Combat",
    accent: "#f59e0b",
    description: "Budgeted AI behavior profile for enemies.",
    inputs: {},
    outputs: {
      aiProfile: { label: "AI Profile", dataType: "aiProfile" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("aiProfileId", "ai_profile.basic", "Basic AI", {
      idleMode: { label: "Idle mode", type: "select", options: ["stand", "patrol", "wander", "sleep"], default: "stand", required: true },
      sightRange: numberField("Sight range", 20, 0, 10000, 0.1),
      hearingRange: numberField("Hearing range", 10, 0, 10000, 0.1),
      aggroRange: numberField("Aggro range", 12, 0, 10000, 0.1),
      assistRange: numberField("Assist range", 8, 0, 10000, 0.1),
      leashDistance: numberField("Leash distance", 30, 0, 10000, 0.1),
      returnHealPercentPerSecond: numberField("Return heal %/s", 0.1, 0, 1, 0.01),
      preferredRange: numberField("Preferred range", 2.5, 0, 10000, 0.1),
      chaseSpeedMultiplier: numberField("Chase speed x", 1, 0, 10, 0.01),
      fleeThresholdPercent: numberField("Flee threshold", 0, 0, 1, 0.01),
      callForHelp: { label: "Call for help", type: "boolean", default: false, required: true },
      callForHelpCooldownMs: numberField("Call cooldown ms", 5000, 0, 86400000, 1),
      lostTargetTimeoutMs: numberField("Lost target ms", 5000, 0, 86400000, 1),
      wanderRadius: numberField("Wander radius", 8, 0, 10000, 0.1),
      thinkIntervalMs: numberField("Think interval ms", 200, 50, 60000, 1),
      sleepOutsideInterest: { label: "Sleep outside interest", type: "boolean", default: true, required: true },
      stuckTimeoutMs: numberField("Stuck timeout ms", 3000, 0, 86400000, 1)
    })
  },
  path_behavior_profile: {
    label: "Path Behavior Profile",
    group: "Zones",
    accent: "#fde047",
    description: "Path movement behavior for spawned entities.",
    inputs: {},
    outputs: {
      pathBehaviorDef: { label: "Path Behavior", dataType: "pathBehaviorDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("pathBehaviorId", "path_behavior.loop", "Loop Path", {
      mode: { label: "Mode", type: "select", options: ["loop", "ping_pong", "one_way", "wander"], default: "loop", required: true },
      baseSpeed: numberField("Base speed", 3, 0, 100, 0.1),
      waitMinMs: numberField("Wait min ms", 0, 0, 86400000, 1),
      waitMaxMs: numberField("Wait max ms", 0, 0, 86400000, 1),
      randomStart: { label: "Random start", type: "boolean", default: false, required: true },
      stuckRecoveryMode: { label: "Stuck recovery", type: "select", options: ["return_home", "next_point", "despawn_respawn"], default: "return_home", required: true }
    })
  },
  animation_set: {
    label: "Animation Set",
    group: "Presentation",
    accent: "#818cf8",
    description: "Animation role mapping for a model asset.",
    inputs: {},
    outputs: {
      animationSet: { label: "Animation Set", dataType: "animationSet" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("animationSetId", "animation_set.default", "Default Animations", {
      modelAssetId: { label: "Model asset", type: "asset", assetTypes: ["model"], default: null, required: false },
      idleClip: { label: "Idle clip", type: "text", default: "", required: false, maxLength: 120 },
      walkClip: { label: "Walk clip", type: "text", default: "", required: false, maxLength: 120 },
      runClip: { label: "Run clip", type: "text", default: "", required: false, maxLength: 120 },
      basicAttackClip: { label: "Basic attack clip", type: "text", default: "", required: false, maxLength: 120 },
      abilityClipMap: { label: "Ability clip map", type: "json", default: {}, required: false },
      castClip: { label: "Cast clip", type: "text", default: "", required: false, maxLength: 120 },
      hitClip: { label: "Hit clip", type: "text", default: "", required: false, maxLength: 120 },
      deathClip: { label: "Death clip", type: "text", default: "", required: false, maxLength: 120 },
      spawnClip: { label: "Spawn clip", type: "text", default: "", required: false, maxLength: 120 },
      gatherClip: { label: "Gather clip", type: "text", default: "", required: false, maxLength: 120 },
      interactClip: { label: "Interact clip", type: "text", default: "", required: false, maxLength: 120 },
      emoteClipMap: { label: "Emote clip map", type: "json", default: {}, required: false },
      blendDurationMs: numberField("Blend duration ms", 150, 0, 10000, 1)
    })
  },
  faction_definition: {
    label: "Faction Definition",
    group: "Catalog",
    accent: "#7c3aed",
    description: "Faction relation definition.",
    inputs: {},
    outputs: {
      factionDef: { label: "Faction", dataType: "factionDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("factionId", "faction.neutral", "Neutral", {
      relations: { label: "Relations", type: "json", default: [], required: false },
      defaultPlayerRelation: { label: "Player relation", type: "select", options: ["hostile", "neutral", "friendly"], default: "neutral", required: true },
      pvpTags: { label: "PVP tags", type: "tagList", default: [], required: false }
    })
  },
  difficulty_profile: {
    label: "Difficulty Profile",
    group: "Combat",
    accent: "#be123c",
    description: "Difficulty multipliers for enemies and encounters.",
    inputs: {},
    outputs: {
      difficultyDef: { label: "Difficulty", dataType: "difficultyDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("difficultyId", "difficulty.normal", "Normal", {
      healthMultiplier: numberField("Health x", 1, 0, 1000, 0.01),
      damageMultiplier: numberField("Damage x", 1, 0, 1000, 0.01),
      armorMultiplier: numberField("Armor x", 1, 0, 1000, 0.01),
      speedMultiplier: numberField("Speed x", 1, 0, 1000, 0.01),
      xpMultiplier: numberField("XP x", 1, 0, 1000, 0.01),
      lootMultiplier: numberField("Loot x", 1, 0, 1000, 0.01),
      partyScalingCurveRef: refField("Party scaling curve", ["stat_curve"])
    })
  },
  respawn_policy_definition: {
    label: "Respawn Policy Definition",
    group: "Combat",
    accent: "#4d7c0f",
    description: "Reusable respawn policy for enemies, resources and pickups.",
    inputs: {},
    outputs: {
      respawnPolicy: { label: "Respawn Policy", dataType: "respawnPolicy" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("respawnPolicyId", "respawn_policy.standard", "Standard Respawn", {
      minDelayMs: numberField("Min delay ms", 30000, 0, 86400000, 1),
      maxDelayMs: numberField("Max delay ms", 60000, 0, 86400000, 1),
      jitterMode: { label: "Jitter", type: "select", options: ["uniform", "none"], default: "uniform", required: true },
      maxAliveDefault: numberField("Max alive default", 1, 0, 100000, 1),
      corpseDurationMs: numberField("Corpse duration ms", 15000, 0, 86400000, 1),
      despawnDistance: numberField("Despawn distance", 120, 0, 100000, 1),
      resetEncounterOnWipe: { label: "Reset encounter on wipe", type: "boolean", default: true, required: true },
      oneTimeSpawn: { label: "One time spawn", type: "boolean", default: false, required: true },
      persistentDefeatFlagRef: refField("Persistent defeat flag", ["policy"])
    })
  },
  reputation_track: {
    label: "Reputation Track",
    group: "Catalog",
    accent: "#a855f7",
    description: "Reputation definition for later conditions and rewards.",
    inputs: {},
    outputs: {
      reputationDef: { label: "Reputation", dataType: "reputationDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("reputationId", "reputation.new_track", "New Reputation", {
      factionRef: refField("Faction", ["faction"], true),
      minimumValue: numberField("Minimum", -10000, -1000000000, 1000000000, 1),
      maximumValue: numberField("Maximum", 10000, -1000000000, 1000000000, 1),
      startValue: numberField("Start value", 0, -1000000000, 1000000000, 1),
      ranks: { label: "Ranks", type: "json", default: [], required: false },
      decayPolicy: { label: "Decay policy", type: "select", options: ["none", "online_time", "calendar"], default: "none", required: true },
      accountOrCharacterScope: { label: "Scope", type: "select", options: ["character", "account"], default: "character", required: true },
      unlockActionRefs: refListField("Unlock actions", ["policy"]),
      vendorPriceModifierFormulaRef: refField("Vendor price formula", ["value"])
    })
  },
  music_track: {
    label: "Music Track",
    group: "Presentation",
    accent: "#60a5fa",
    description: "Audio asset-backed music track.",
    inputs: {},
    outputs: {
      musicTrackDef: { label: "Music Track", dataType: "musicTrackDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("musicTrackId", "music_track.new_track", "New Music Track", {
      audioAssetId: { label: "Audio asset", type: "asset", assetTypes: ["audio"], default: null, required: false },
      loop: { label: "Loop", type: "boolean", default: true, required: true },
      loopStartSeconds: numberField("Loop start seconds", 0, 0, 1000000, 0.01, false),
      loopEndSeconds: numberField("Loop end seconds", 0, 0, 1000000, 0.01, false),
      volume: numberField("Volume", 1, 0, 1, 0.01),
      fadeInMs: numberField("Fade in ms", 1000, 0, 60000, 1),
      fadeOutMs: numberField("Fade out ms", 1000, 0, 60000, 1),
      moodTags: { label: "Mood tags", type: "tagList", default: [], required: false },
      bpm: numberField("BPM", 0, 0, 1000, 1, false),
      priority: numberField("Priority", 0, -1000000, 1000000, 1),
      preloadPolicy: { label: "Preload", type: "select", options: ["on_zone_preload", "on_demand"], default: "on_demand", required: true }
    })
  },
  music_playlist: {
    label: "Music Playlist",
    group: "Presentation",
    accent: "#2563eb",
    description: "Playlist composed from music track definitions.",
    inputs: { tracks: { label: "Tracks", dataType: "musicTrackDef", required: false, multiple: true } },
    outputs: {
      musicPlaylistDef: { label: "Music Playlist", dataType: "musicPlaylistDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("musicPlaylistId", "music_playlist.zone", "Zone Playlist", {
      playMode: { label: "Play mode", type: "select", options: ["sequential", "shuffle", "weighted"], default: "shuffle", required: true },
      crossfadeMs: numberField("Crossfade ms", 1000, 0, 60000, 1),
      avoidImmediateRepeat: { label: "Avoid repeat", type: "boolean", default: true, required: true },
      combatPlaylistRef: refField("Combat playlist", ["music_playlist"]),
      dayPlaylistRef: refField("Day playlist", ["music_playlist"]),
      nightPlaylistRef: refField("Night playlist", ["music_playlist"]),
      trackWeights: { label: "Track weights", type: "json", default: {}, required: false }
    })
  },
  audio_event: {
    label: "Audio Event",
    group: "Presentation",
    accent: "#0ea5e9",
    description: "Reusable audio event for abilities, pickups, resources and UI.",
    inputs: {},
    outputs: {
      audioEventDef: { label: "Audio Event", dataType: "audioEventDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("audioEventId", "audio.pickup", "Pickup Audio", {
      audioAssetIds: { label: "Audio assets", type: "json", default: [], required: false },
      selectionMode: { label: "Selection", type: "select", options: ["random", "sequential", "weighted"], default: "random", required: true },
      weights: { label: "Weights", type: "json", default: [], required: false },
      volumeMin: numberField("Volume min", 1, 0, 1, 0.01),
      volumeMax: numberField("Volume max", 1, 0, 1, 0.01),
      pitchMin: numberField("Pitch min", 1, 0, 4, 0.01),
      pitchMax: numberField("Pitch max", 1, 0, 4, 0.01),
      spatial: { label: "Spatial", type: "boolean", default: true, required: true },
      minDistance: numberField("Min distance", 1, 0, 10000, 0.1),
      maxDistance: numberField("Max distance", 30, 0, 10000, 0.1),
      cooldownMs: numberField("Cooldown ms", 0, 0, 86400000, 1),
      maxConcurrent: numberField("Max concurrent", 8, 1, 1000, 1),
      scope: { label: "Scope", type: "select", options: ["local", "player", "party", "zone"], default: "local", required: true },
      loop: { label: "Loop", type: "boolean", default: false, required: true },
      priority: numberField("Priority", 0, -1000000, 1000000, 1)
    })
  },
  vfx_definition: {
    label: "VFX Definition",
    group: "Presentation",
    accent: "#06b6d4",
    description: "Lightweight VFX definition for pooled Three.js presentation.",
    inputs: {},
    outputs: {
      vfxDef: { label: "VFX", dataType: "vfxDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("vfxId", "vfx.hit", "Hit VFX", {
      kind: { label: "Kind", type: "select", options: ["sprite", "billboard", "model", "mesh_effect", "screen_overlay"], default: "billboard", required: true },
      textureAssetId: { label: "Texture asset", type: "asset", assetTypes: ["image", "texture"], default: null, required: false },
      modelAssetId: { label: "Model asset", type: "asset", assetTypes: ["model"], default: null, required: false },
      lifetimeMs: numberField("Lifetime ms", 800, 0, 86400000, 1),
      loop: { label: "Loop", type: "boolean", default: false, required: true },
      scale: numberField("Scale", 1, 0.001, 1000, 0.01),
      attachmentPoint: { label: "Attachment", type: "select", options: ["root", "hand_left", "hand_right", "weapon", "target", "ground", "custom"], default: "root", required: true },
      customAttachmentName: { label: "Custom attachment", type: "text", default: "", required: false, maxLength: 96 },
      followTarget: { label: "Follow target", type: "boolean", default: true, required: true },
      rotationMode: { label: "Rotation", type: "select", options: ["fixed", "face_camera", "align_surface"], default: "face_camera", required: true },
      lowPerformanceFallbackRef: refField("Low perf fallback", ["vfx"]),
      maxConcurrentPerSource: numberField("Max concurrent/source", 8, 1, 1000, 1),
      priority: numberField("Priority", 0, -1000000, 1000000, 1)
    })
  },
  loot_table: {
    label: "Loot Table",
    group: "Combat",
    accent: "#d97706",
    description: "Server-evaluated loot table.",
    inputs: { entries: { label: "Loot Entries", dataType: "lootEntry", required: false, multiple: true } },
    outputs: {
      lootTable: { label: "Loot Table", dataType: "lootTable" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("lootTableId", "loot_table.new_table", "New Loot Table", {
      rollMode: { label: "Roll mode", type: "select", options: ["independent", "weighted_pick", "all"], default: "independent", required: true },
      rollCount: numberField("Roll count", 1, 0, 1000, 1),
      allowDuplicates: { label: "Allow duplicates", type: "boolean", default: true, required: true },
      ownershipMode: { label: "Ownership", type: "select", options: ["personal", "shared", "party_policy"], default: "personal", required: true },
      partyLootPolicyRef: refField("Party loot policy", ["policy"]),
      pityPolicy: { label: "Pity policy", type: "select", options: ["none", "guaranteed_after_n"], default: "none", required: true },
      pityCount: numberField("Pity count", 0, 0, 1000000, 1, false)
    })
  },
  loot_item_entry: {
    label: "Loot Item Entry",
    group: "Combat",
    accent: "#fbbf24",
    description: "Item entry for a loot table.",
    inputs: {},
    outputs: { lootEntry: { label: "Loot Entry", dataType: "lootEntry" } },
    fields: {
      entryId: { label: "Entry id", type: "identity", default: "loot_entry.item", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      itemRef: refField("Item", ["item"], true),
      chance: numberField("Chance", 1, 0, 1, 0.01),
      weight: numberField("Weight", 1, 0, 1000000, 0.01),
      minQuantity: numberField("Min quantity", 1, 0, 1000000, 1),
      maxQuantity: numberField("Max quantity", 1, 0, 1000000, 1),
      guaranteed: { label: "Guaranteed", type: "boolean", default: false, required: true },
      qualityMode: { label: "Quality mode", type: "select", options: ["definition", "fixed", "weighted"], default: "definition", required: true },
      qualityValue: { label: "Quality value", type: "text", default: "", required: false, maxLength: 64 },
      modifierPoolRefs: refListField("Modifier pools", ["item_modifier"]),
      conditionTagQuery: { label: "Condition tags", type: "tagQuery", default: { all: [], any: [], none: [] }, required: false }
    }
  },
  loot_currency_entry: {
    label: "Loot Currency Entry",
    group: "Combat",
    accent: "#fbbf24",
    description: "Currency entry for a loot table.",
    inputs: {},
    outputs: { lootEntry: { label: "Loot Entry", dataType: "lootEntry" } },
    fields: {
      entryId: { label: "Entry id", type: "identity", default: "loot_entry.currency", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      currencyRef: refField("Currency", ["currency"], true),
      chance: numberField("Chance", 1, 0, 1, 0.01),
      weight: numberField("Weight", 1, 0, 1000000, 0.01),
      minAmountMinor: numberField("Min amount minor", 1, 0, 9007199254740991, 1),
      maxAmountMinor: numberField("Max amount minor", 1, 0, 9007199254740991, 1),
      guaranteed: { label: "Guaranteed", type: "boolean", default: false, required: true }
    }
  },
  loot_table_entry: {
    label: "Nested Loot Table Entry",
    group: "Combat",
    accent: "#fbbf24",
    description: "Nested table entry for a loot table.",
    inputs: {},
    outputs: { lootEntry: { label: "Loot Entry", dataType: "lootEntry" } },
    fields: {
      entryId: { label: "Entry id", type: "identity", default: "loot_entry.table", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      lootTableRef: refField("Loot table", ["loot_table"], true),
      chance: numberField("Chance", 1, 0, 1, 0.01),
      weight: numberField("Weight", 1, 0, 1000000, 0.01),
      repeatMin: numberField("Repeat min", 1, 0, 1000, 1),
      repeatMax: numberField("Repeat max", 1, 0, 1000, 1)
    }
  },
  resource_definition: {
    label: "Resource Definition",
    group: "Catalog",
    accent: "#22c55e",
    description: "Gatherable world resource definition.",
    inputs: {},
    outputs: {
      resourceDef: { label: "Resource", dataType: "resourceDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("resourceId", "resource.wood", "Wood", {
      worldModelAssetId: { label: "World model asset", type: "asset", assetTypes: ["model"], default: null, required: false },
      iconAssetId: { label: "Icon asset", type: "asset", assetTypes: ["image"], default: null, required: false },
      yieldLootTableRef: refField("Yield loot table", ["loot_table"]),
      yieldItemRefs: refListField("Yield items", ["item"]),
      requiredToolTagQuery: { label: "Required tool tags", type: "tagQuery", default: { all: [], any: [], none: [] }, required: false },
      requiredAbilityRef: refField("Required ability", ["ability"]),
      requiredSkillStatRef: refField("Required skill stat", ["stat"]),
      requiredSkillValue: numberField("Required skill value", 0, 0, 1000000, 1),
      harvestDurationMs: numberField("Harvest duration ms", 1500, 0, 86400000, 1),
      depletionMode: { label: "Depletion", type: "select", options: ["disappear", "stump", "disabled_model"], default: "disappear", required: true },
      respawnPolicyRef: refField("Respawn policy", ["respawn_policy"]),
      scope: { label: "Scope", type: "select", options: ["shared_zone", "per_player", "instance"], default: "shared_zone", required: true },
      ownershipClaimMs: numberField("Ownership claim ms", 0, 0, 86400000, 1),
      harvestAnimationRole: { label: "Harvest animation role", type: "text", default: "gather", required: false, maxLength: 64 },
      gatherAudioRef: refField("Gather audio", ["audio"]),
      gatherVfxRef: refField("Gather VFX", ["vfx"]),
      depletedModelAssetId: { label: "Depleted model asset", type: "asset", assetTypes: ["model"], default: null, required: false }
    })
  }
};

const NODE03_RUNTIME_NODE_DEFS = {
  resource_component: {
    label: "Resource Component",
    group: "Entities",
    accent: "#22c55e",
    description: "Adds gatherable resource behavior to an entity.",
    inputs: {},
    outputs: { component: { label: "Entity Component", dataType: "entityComponent" } },
    fields: {
      componentId: { label: "Component id", type: "identity", default: "component.resource", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      resourceRef: refField("Resource", ["resource"], true),
      yieldMultiplier: numberField("Yield x", 1, 0, 1000, 0.01),
      respawnPolicyOverrideRef: refField("Respawn override", ["respawn_policy"]),
      scopeOverride: { label: "Scope override", type: "select", options: ["", "shared_zone", "per_player", "instance"], default: "", required: false, allowBlank: true }
    }
  },
  lootable_component: {
    label: "Lootable Component",
    group: "Entities",
    accent: "#d97706",
    description: "Adds server-authoritative loot behavior to an entity.",
    inputs: {},
    outputs: { component: { label: "Entity Component", dataType: "entityComponent" } },
    fields: {
      componentId: { label: "Component id", type: "identity", default: "component.lootable", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      lootTableRef: refField("Loot table", ["loot_table"], true),
      ownershipMode: { label: "Ownership", type: "select", options: ["personal", "shared", "party_policy"], default: "personal", required: true },
      oneTime: { label: "One time", type: "boolean", default: true, required: true },
      respawnPolicyRef: refField("Respawn policy", ["respawn_policy"]),
      interactionPrompt: { label: "Prompt", type: "tokenText", default: "Loot", required: false, maxLength: 240 }
    }
  },
  destructible_component: {
    label: "Destructible Component",
    group: "Entities",
    accent: "#ef4444",
    description: "Adds destructible combat behavior to an entity.",
    inputs: {},
    outputs: { component: { label: "Entity Component", dataType: "entityComponent" } },
    fields: {
      componentId: { label: "Component id", type: "identity", default: "component.destructible", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      statBlockRef: refField("Stat block", ["stat_block"], true),
      allowedDamageTagQuery: { label: "Allowed damage tags", type: "tagQuery", default: { all: [], any: [], none: [] }, required: false },
      lootTableRef: refField("Loot table", ["loot_table"]),
      destroyedActionRefs: refListField("Destroyed actions", ["policy"]),
      respawnPolicyRef: refField("Respawn policy", ["respawn_policy"]),
      persistenceScope: { label: "Persistence", type: "select", options: ["disposable", "zone", "world"], default: "disposable", required: true }
    }
  },
  enemy_component: {
    label: "Enemy Component",
    group: "Combat",
    accent: "#b91c1c",
    description: "Places enemy behavior on an Entity Assembly.",
    inputs: {},
    outputs: { component: { label: "Entity Component", dataType: "entityComponent" } },
    fields: {
      componentId: { label: "Component id", type: "identity", default: "component.enemy", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      enemyRef: refField("Enemy", ["enemy"], true),
      variantRef: refField("Variant", ["variant"]),
      difficultyRef: refField("Difficulty", ["difficulty"]),
      levelMode: { label: "Level mode", type: "select", options: ["fixed", "zone_range", "area_range", "player_clamped", "party_clamped"], default: "fixed", required: true },
      fixedLevel: numberField("Fixed level", 1, 1, 1000, 1),
      minimumLevelOverride: numberField("Min level override", 0, 0, 1000, 1, false),
      maximumLevelOverride: numberField("Max level override", 0, 0, 1000, 1, false),
      statMultiplierOverrides: { label: "Stat multipliers", type: "json", default: {}, required: false },
      lootOverrideRef: refField("Loot override", ["loot_table"]),
      respawnOverrideRef: refField("Respawn override", ["respawn_policy"])
    }
  },
  npc_component: {
    label: "NPC Component",
    group: "Entities",
    accent: "#c084fc",
    description: "Places NPC behavior on an Entity Assembly.",
    inputs: {},
    outputs: { component: { label: "Entity Component", dataType: "entityComponent" } },
    fields: {
      componentId: { label: "Component id", type: "identity", default: "component.npc", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      npcRef: refField("NPC", ["npc"], true),
      variantRef: refField("Variant", ["variant"]),
      level: numberField("Level", 1, 1, 1000, 1),
      persistenceScope: { label: "Persistence", type: "select", options: ["disposable", "zone", "world"], default: "disposable", required: true }
    }
  },
  combatant_component: {
    label: "Combatant Component",
    group: "Combat",
    accent: "#dc2626",
    description: "Combat targeting, faction and death behavior for an entity.",
    inputs: {},
    outputs: { component: { label: "Entity Component", dataType: "entityComponent" } },
    fields: {
      componentId: { label: "Component id", type: "identity", default: "component.combatant", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      statBlockRef: refField("Stat block", ["stat_block"]),
      combatProfileRef: refField("Combat profile", ["combat_profile"]),
      factionRef: refField("Faction", ["faction"]),
      targetable: { label: "Targetable", type: "boolean", default: true, required: true },
      invulnerable: { label: "Invulnerable", type: "boolean", default: false, required: true },
      deathMode: { label: "Death mode", type: "select", options: ["normal", "knockout", "despawn"], default: "normal", required: true },
      creditMode: { label: "Credit mode", type: "select", options: ["personal", "party", "shared"], default: "personal", required: true }
    }
  },
  faction_component: {
    label: "Faction Component",
    group: "Entities",
    accent: "#7c3aed",
    description: "Entity-local faction overrides.",
    inputs: {},
    outputs: { component: { label: "Entity Component", dataType: "entityComponent" } },
    fields: {
      componentId: { label: "Component id", type: "identity", default: "component.faction", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      factionRef: refField("Faction", ["faction"], true),
      relationOverrides: { label: "Relation overrides", type: "json", default: [], required: false }
    }
  },
  schedule_component: {
    label: "Schedule Component",
    group: "Entities",
    accent: "#94a3b8",
    description: "Simple future-safe schedule data for NPC/entity behavior.",
    inputs: {},
    outputs: { component: { label: "Entity Component", dataType: "entityComponent" } },
    fields: {
      componentId: { label: "Component id", type: "identity", default: "component.schedule", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      scheduleEntries: { label: "Schedule entries", type: "json", default: [], required: false },
      defaultBehavior: { label: "Default behavior", type: "text", default: "idle", required: false, maxLength: 96 }
    }
  },
  nameplate_component: {
    label: "Nameplate Component",
    group: "Entities",
    accent: "#f8fafc",
    description: "Nameplate presentation policy for combat/resource entities.",
    inputs: {},
    outputs: { component: { label: "Entity Component", dataType: "entityComponent" } },
    fields: {
      componentId: { label: "Component id", type: "identity", default: "component.nameplate", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      nameTemplate: { label: "Name template", type: "tokenText", default: "@{enemy.display_name}", required: false, maxLength: 240, allowRuntimeTokens: true },
      showLevel: { label: "Show level", type: "boolean", default: true, required: true },
      showHealth: { label: "Show health", type: "boolean", default: true, required: true },
      showFaction: { label: "Show faction", type: "boolean", default: false, required: true },
      showQuestIcon: { label: "Show quest icon", type: "boolean", default: false, required: true },
      visibility: { label: "Visibility", type: "select", options: ["always", "near", "targeted", "combat"], default: "near", required: true }
    }
  },
  enemy_spawn_point: {
    label: "Enemy Spawn Point",
    group: "Spawns",
    accent: "#b91c1c",
    description: "Zone-local enemy spawn entry for one position.",
    inputs: { anchor: { label: "Anchor", dataType: "anchor", required: false, multiple: false } },
    outputs: { spawnEntry: { label: "Spawn Entry", dataType: "spawnEntry" } },
    fields: {
      spawnEntryId: { label: "Spawn entry id", type: "identity", default: "spawn.enemy_point", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      enemyRef: refField("Enemy", ["enemy"], true),
      variantRef: refField("Variant", ["variant"]),
      difficultyRef: refField("Difficulty", ["difficulty"]),
      levelMode: { label: "Level mode", type: "select", options: ["fixed", "zone_range", "area_range", "player_clamped", "party_clamped"], default: "fixed", required: true },
      fixedLevel: numberField("Fixed level", 1, 1, 1000, 1),
      x: numberField("X", 0, -100000, 100000, 0.01),
      y: numberField("Y", 0, -100000, 100000, 0.01),
      z: numberField("Z", 0, -100000, 100000, 0.01),
      pathRef: refField("Path", ["target"]),
      respawnPolicyRef: refField("Respawn policy", ["respawn_policy"]),
      maxAlive: numberField("Max alive", 1, 1, 100000, 1),
      activationRadius: numberField("Activation radius", 100, 0, 100000, 1),
      playerExclusionRadius: numberField("Player exclusion radius", 0, 0, 100000, 1),
      conditions: refListField("Conditions", ["policy"]),
      tags: { label: "Tags", type: "tagList", default: [], required: false }
    }
  },
  enemy_spawn_area: {
    label: "Enemy Spawn Area",
    group: "Spawns",
    accent: "#dc2626",
    description: "Zone-local enemy area spawn entry.",
    inputs: { area: { label: "Area", dataType: "area", required: false, multiple: false } },
    outputs: { spawnEntry: { label: "Spawn Entry", dataType: "spawnEntry" } },
    fields: {
      spawnEntryId: { label: "Spawn entry id", type: "identity", default: "spawn.enemy_area", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      areaRef: refField("Area", ["area"]),
      enemyRef: refField("Enemy", ["enemy"], true),
      variantRef: refField("Variant", ["variant"]),
      difficultyRef: refField("Difficulty", ["difficulty"]),
      countMin: numberField("Count min", 1, 0, 100000, 1),
      countMax: numberField("Count max", 3, 0, 100000, 1),
      distribution: { label: "Distribution", type: "select", options: ["random", "blue_noise", "edge", "patrol_points"], default: "random", required: true },
      minimumSpacing: numberField("Minimum spacing", 2, 0, 100000, 0.1),
      x: numberField("Center X", 0, -100000, 100000, 0.01),
      y: numberField("Center Y", 0, -100000, 100000, 0.01),
      z: numberField("Center Z", 0, -100000, 100000, 0.01),
      radius: numberField("Radius", 10, 0, 100000, 0.1),
      levelMode: { label: "Level mode", type: "select", options: ["fixed", "zone_range", "area_range", "player_clamped", "party_clamped"], default: "fixed", required: true },
      fixedLevel: numberField("Fixed level", 1, 1, 1000, 1),
      pathRef: refField("Path", ["target"]),
      respawnPolicyRef: refField("Respawn policy", ["respawn_policy"]),
      maxAlive: numberField("Max alive", 3, 1, 100000, 1),
      activationRadius: numberField("Activation radius", 100, 0, 100000, 1),
      playerExclusionRadius: numberField("Player exclusion radius", 0, 0, 100000, 1)
    }
  },
  resource_spawn: {
    label: "Resource Spawn",
    group: "Spawns",
    accent: "#22c55e",
    description: "Zone-local resource spawn entry.",
    inputs: {
      anchor: { label: "Anchor", dataType: "anchor", required: false, multiple: false },
      area: { label: "Area", dataType: "area", required: false, multiple: false }
    },
    outputs: { spawnEntry: { label: "Spawn Entry", dataType: "spawnEntry" } },
    fields: {
      spawnEntryId: { label: "Spawn entry id", type: "identity", default: "spawn.resource", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      resourceRef: refField("Resource", ["resource"], true),
      count: numberField("Count", 1, 1, 100000, 1),
      x: numberField("X", 0, -100000, 100000, 0.01),
      y: numberField("Y", 0, -100000, 100000, 0.01),
      z: numberField("Z", 0, -100000, 100000, 0.01),
      radius: numberField("Radius", 8, 0, 100000, 0.1),
      minimumSpacing: numberField("Minimum spacing", 2, 0, 100000, 0.1),
      distribution: { label: "Distribution", type: "select", options: ["random", "blue_noise", "edge", "patrol_points"], default: "random", required: true },
      respawnOverrideRef: refField("Respawn override", ["respawn_policy"]),
      yieldMultiplier: numberField("Yield x", 1, 0, 1000, 0.01),
      markerPolicyRef: refField("Marker policy", ["policy"])
    }
  },
  pickup_spawn: {
    label: "Pickup Spawn",
    group: "Spawns",
    accent: "#fbbf24",
    description: "Zone-local item/currency pickup spawn entry.",
    inputs: { anchor: { label: "Anchor", dataType: "anchor", required: false, multiple: false } },
    outputs: { spawnEntry: { label: "Spawn Entry", dataType: "spawnEntry" } },
    fields: {
      spawnEntryId: { label: "Spawn entry id", type: "identity", default: "spawn.pickup", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      pickupKind: { label: "Pickup kind", type: "select", options: ["item", "currency"], default: "item", required: true },
      itemRef: refField("Item", ["item"]),
      currencyRef: refField("Currency", ["currency"]),
      amount: numberField("Amount", 1, 0, 1000000, 1),
      minAmount: numberField("Min amount", 1, 0, 1000000, 1),
      maxAmount: numberField("Max amount", 1, 0, 1000000, 1),
      x: numberField("X", 0, -100000, 100000, 0.01),
      y: numberField("Y", 0, -100000, 100000, 0.01),
      z: numberField("Z", 0, -100000, 100000, 0.01),
      respawnPolicyRef: refField("Respawn policy", ["respawn_policy"]),
      ownershipMode: { label: "Ownership", type: "select", options: ["personal", "shared", "party_policy"], default: "shared", required: true },
      pickupAudioRef: refField("Pickup audio", ["audio"]),
      pickupVfxRef: refField("Pickup VFX", ["vfx"])
    }
  },
  spawn_set: {
    label: "Spawn Set",
    group: "Spawns",
    accent: "#65a30d",
    description: "Groups spawn entries for a zone or encounter.",
    inputs: {
      spawns: { label: "Spawn Entries", dataType: "spawnEntry", required: false, multiple: true },
      path: { label: "Path", dataType: "path", required: false, multiple: false },
      area: { label: "Area", dataType: "area", required: false, multiple: false }
    },
    outputs: { spawnSet: { label: "Spawn Set", dataType: "spawnSet" } },
    fields: {
      spawnSetId: { label: "Spawn set id", type: "identity", default: "spawn_set.zone", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      activationMode: { label: "Activation", type: "select", options: ["zone_loaded", "area_entered", "encounter", "always_resident"], default: "zone_loaded", required: true },
      maxAliveTotal: numberField("Max alive total", 20, 0, 100000, 1),
      randomSeedMode: { label: "Random seed", type: "select", options: ["deterministic_build", "runtime"], default: "deterministic_build", required: true },
      sharedRespawnPolicyRef: refField("Shared respawn policy", ["respawn_policy"])
    }
  },
  spawn_controller: {
    label: "Spawn Controller",
    group: "Spawns",
    accent: "#3f6212",
    description: "Budgeted zone runtime controller for spawn sets.",
    inputs: { spawnSets: { label: "Spawn Sets", dataType: "spawnSet", required: false, multiple: true } },
    outputs: { spawnController: { label: "Spawn Controller", dataType: "spawnController" } },
    fields: {
      spawnControllerId: { label: "Spawn controller id", type: "identity", default: "spawn_controller.zone", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      scope: { label: "Scope", type: "select", options: ["zone", "area", "instance"], default: "zone", required: true },
      sleepOutsideInterest: { label: "Sleep outside interest", type: "boolean", default: true, required: true },
      interestRadius: numberField("Interest radius", 120, 0, 100000, 1),
      preloadRadius: numberField("Preload radius", 160, 0, 100000, 1),
      buildBudgetPerTick: numberField("Build budget/tick", 4, 1, 10000, 1),
      maxActiveInstances: numberField("Max active instances", 200, 0, 100000, 1),
      persistenceScope: { label: "Persistence", type: "select", options: ["disposable", "zone", "world"], default: "disposable", required: true }
    }
  },
  encounter_controller: {
    label: "Encounter Controller",
    group: "Spawns",
    accent: "#991b1b",
    description: "Encounter controller for wave-based spawns.",
    inputs: {
      encounterArea: { label: "Encounter Area", dataType: "encounterArea", required: false, multiple: false },
      spawnControllers: { label: "Spawn Controllers", dataType: "spawnController", required: false, multiple: true },
      completionConditions: { label: "Completion Conditions", dataType: "policy", required: false, multiple: true }
    },
    outputs: { encounter: { label: "Encounter", dataType: "encounter" } },
    fields: {
      encounterId: { label: "Encounter id", type: "identity", default: "encounter.new_encounter", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      mode: { label: "Mode", type: "select", options: ["single_wave", "multi_wave", "boss"], default: "single_wave", required: true },
      waveDefinitions: { label: "Waves", type: "json", default: [], required: false },
      resetPolicy: { label: "Reset policy", type: "text", default: "out_of_combat", required: false, maxLength: 96 },
      lockoutPolicy: { label: "Lockout", type: "select", options: ["none", "character_daily", "party_instance", "world"], default: "none", required: true },
      startMode: { label: "Start mode", type: "select", options: ["proximity", "interaction", "event_future"], default: "proximity", required: true }
    }
  },
  player_progression_rules: {
    label: "Player Progression Rules",
    group: "Player Rules",
    accent: "#0f766e",
    description: "Global player level/XP/stat mapping rules.",
    inputs: {},
    outputs: {
      playerPolicy: { label: "Player Policy", dataType: "playerPolicy" },
      policy: { label: "Policy", dataType: "policy" }
    },
    fields: {
      rulesId: { label: "Rules id", type: "identity", default: "player_rules.progression", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      maxLevel: numberField("Max level", 50, 1, 1000, 1),
      xpCurveRef: refField("XP curve", ["stat_curve"]),
      baseStatBlockRef: refField("Base stat block", ["stat_block"]),
      healthStatRef: refField("Health stat", ["stat"], true),
      manaStatRef: refField("Mana stat", ["stat"]),
      staminaStatRef: refField("Stamina stat", ["stat"]),
      armorStatRef: refField("Armor stat", ["stat"]),
      levelUpHealPolicy: { label: "Level-up heal", type: "select", options: ["full", "percent", "none"], default: "full", required: true },
      levelUpNotificationTemplateRef: refField("Level-up notification", ["text_template"])
    }
  },
  xp_source_rule: {
    label: "XP Source Rule",
    group: "Player Rules",
    accent: "#7c2d12",
    description: "Defines XP grants for semantic gameplay events.",
    inputs: {},
    outputs: {
      xpRule: { label: "XP Rule", dataType: "xpRule" },
      policy: { label: "Policy", dataType: "policy" }
    },
    fields: {
      xpRuleId: { label: "XP rule id", type: "identity", default: "xp_rule.enemy_defeat", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      sourceTagQuery: { label: "Source tags", type: "tagQuery", default: { all: [], any: [], none: [] }, required: false },
      amountFormula: { label: "Amount formula", type: "formula", default: { operator: "add", operands: [0] }, required: false },
      curveRef: refField("Curve", ["stat_curve"]),
      dailyCap: numberField("Daily cap", 0, 0, 1000000000, 1, false),
      diminishingReturnsMode: { label: "Diminishing returns", type: "select", options: ["none", "same_source", "same_enemy"], default: "none", required: true }
    }
  },
  inventory_rules: {
    label: "Inventory Rules",
    group: "Player Rules",
    accent: "#15803d",
    description: "Inventory capacity and stack merge rules.",
    inputs: {},
    outputs: {
      inventoryPolicy: { label: "Inventory Policy", dataType: "inventoryPolicy" },
      policy: { label: "Policy", dataType: "policy" }
    },
    fields: {
      rulesId: { label: "Rules id", type: "identity", default: "player_rules.inventory", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      slotCapacity: numberField("Slot capacity", 40, 0, 100000, 1),
      weightCapacity: numberField("Weight capacity", 0, 0, 1000000, 0.01),
      capacityMode: { label: "Capacity mode", type: "select", options: ["slots", "weight", "both", "unlimited"], default: "slots", required: true },
      stackMergePolicy: { label: "Stack merge", type: "select", options: ["exact_item_and_bind"], default: "exact_item_and_bind", required: true },
      pickupOverflow: { label: "Pickup overflow", type: "select", options: ["reject", "mail_future", "drop"], default: "reject", required: true },
      allowDestroy: { label: "Allow destroy", type: "boolean", default: true, required: true },
      allowDrop: { label: "Allow drop", type: "boolean", default: true, required: true }
    }
  },
  equipment_rules: {
    label: "Equipment Rules",
    group: "Player Rules",
    accent: "#0369a1",
    description: "Equipment slot and durability rules.",
    inputs: { slots: { label: "Equipment Slots", dataType: "equipmentSlotDef", required: false, multiple: true } },
    outputs: {
      equipmentPolicy: { label: "Equipment Policy", dataType: "equipmentPolicy" },
      policy: { label: "Policy", dataType: "policy" }
    },
    fields: {
      rulesId: { label: "Rules id", type: "identity", default: "player_rules.equipment", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      slotRefs: refListField("Slots", ["equipment_slot"]),
      bindOnEquip: { label: "Bind on equip", type: "boolean", default: true, required: true },
      allowSwapInCombat: { label: "Allow swap in combat", type: "boolean", default: false, required: true },
      durabilityEnabled: { label: "Durability enabled", type: "boolean", default: false, required: true },
      deathDurabilityLossPercent: numberField("Death durability loss", 0, 0, 1, 0.01)
    }
  },
  ability_loadout_rules: {
    label: "Ability Loadout Rules",
    group: "Player Rules",
    accent: "#be123c",
    description: "Ability hotbar/loadout policy.",
    inputs: {},
    outputs: {
      abilityPolicy: { label: "Ability Policy", dataType: "abilityPolicy" },
      policy: { label: "Policy", dataType: "policy" }
    },
    fields: {
      rulesId: { label: "Rules id", type: "identity", default: "player_rules.abilities", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      loadoutCount: numberField("Loadout count", 1, 1, 20, 1),
      slotsPerLoadout: numberField("Slots per loadout", 8, 1, 64, 1),
      allowedAbilityTagQuery: { label: "Allowed ability tags", type: "tagQuery", default: { all: [], any: [], none: [] }, required: false },
      changeInCombat: { label: "Change in combat", type: "boolean", default: false, required: true },
      changeCooldownMs: numberField("Change cooldown ms", 1000, 0, 86400000, 1)
    }
  },
  death_respawn_rules: {
    label: "Death Respawn Rules",
    group: "Player Rules",
    accent: "#64748b",
    description: "Player death, penalty and respawn policy.",
    inputs: {},
    outputs: {
      deathPolicy: { label: "Death Policy", dataType: "deathPolicy" },
      policy: { label: "Policy", dataType: "policy" }
    },
    fields: {
      rulesId: { label: "Rules id", type: "identity", default: "player_rules.death_respawn", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      respawnDelayMs: numberField("Respawn delay ms", 5000, 0, 86400000, 1),
      respawnPriority: { label: "Respawn priority", type: "select", options: ["instance_checkpoint", "character_checkpoint", "zone_default", "project_start"], default: "character_checkpoint", required: true },
      healthRestorePercent: numberField("Health restore", 1, 0, 1, 0.01),
      manaRestorePercent: numberField("Mana restore", 1, 0, 1, 0.01),
      staminaRestorePercent: numberField("Stamina restore", 1, 0, 1, 0.01),
      currencyLossRules: { label: "Currency loss", type: "json", default: [], required: false },
      durabilityLossPercent: numberField("Durability loss", 0, 0, 1, 0.01),
      xpLossFormula: { label: "XP loss", type: "formula", default: null, required: false },
      dropItems: { label: "Drop items", type: "boolean", default: false, required: true }
    }
  },
  unstuck_rules: {
    label: "Unstuck Rules",
    group: "Player Rules",
    accent: "#94a3b8",
    description: "Server-authoritative unstuck policy replacing temporary defaults.",
    inputs: {},
    outputs: {
      unstuckPolicy: { label: "Unstuck Policy", dataType: "unstuckPolicy" },
      policy: { label: "Policy", dataType: "policy" }
    },
    fields: {
      rulesId: { label: "Rules id", type: "identity", default: "player_rules.unstuck", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      cooldownMs: numberField("Cooldown ms", 300000, 0, 86400000, 1),
      castTimeMs: numberField("Cast time ms", 5000, 0, 86400000, 1),
      cancelOnMove: { label: "Cancel on move", type: "boolean", default: true, required: true },
      cancelOnDamage: { label: "Cancel on damage", type: "boolean", default: true, required: true },
      allowInCombat: { label: "Allow in combat", type: "boolean", default: false, required: true },
      fallbackOrder: { label: "Fallback order", type: "json", default: ["character_checkpoint", "zone_default", "project_start"], required: false },
      logThresholdPerHour: numberField("Log threshold/hour", 5, 0, 100000, 1)
    }
  },
  hud_bar: {
    label: "HUD Bar",
    group: "UI",
    accent: "#e11d48",
    description: "Authoritative player stat bar module.",
    inputs: {},
    outputs: {
      uiModule: { label: "UI Module", dataType: "uiModule" },
      ui: { label: "UI", dataType: "ui" }
    },
    fields: {
      moduleId: { label: "Module id", type: "identity", default: "hud.health", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      sourceStatRef: refField("Source stat", ["stat"], true),
      maxStatRef: refField("Max stat", ["stat"]),
      label: { label: "Label", type: "tokenText", default: "Health", required: false, maxLength: 160 },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "top-center", required: true },
      widthPx: numberField("Width px", 220, 40, 1000, 1),
      heightPx: numberField("Height px", 18, 4, 120, 1),
      showNumbers: { label: "Show numbers", type: "boolean", default: true, required: true },
      showPercent: { label: "Show percent", type: "boolean", default: false, required: true },
      frameAssetId: { label: "Frame asset", type: "asset", assetTypes: ["image"], default: null, required: false },
      fillAssetId: { label: "Fill asset", type: "asset", assetTypes: ["image"], default: null, required: false }
    }
  },
  hotbar_hud: {
    label: "Hotbar HUD",
    group: "UI",
    accent: "#be123c",
    description: "Ability loadout hotbar module.",
    inputs: {},
    outputs: {
      uiModule: { label: "UI Module", dataType: "uiModule" },
      ui: { label: "UI", dataType: "ui" }
    },
    fields: {
      moduleId: { label: "Module id", type: "identity", default: "hud.hotbar", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      loadoutId: { label: "Loadout id", type: "identity", default: "loadout.main", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      slotCount: numberField("Slot count", 8, 1, 64, 1),
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "bottom-center", required: true },
      showKeybinds: { label: "Show keybinds", type: "boolean", default: true, required: true },
      showCooldown: { label: "Show cooldown", type: "boolean", default: true, required: true },
      showCosts: { label: "Show costs", type: "boolean", default: true, required: true },
      mobileTouchEnabled: { label: "Mobile touch", type: "boolean", default: true, required: true }
    }
  },
  interaction_hud: {
    label: "Interaction HUD",
    group: "UI",
    accent: "#0f766e",
    description: "Target interaction panel for enemies, resources and pickups.",
    inputs: {},
    outputs: {
      uiModule: { label: "UI Module", dataType: "uiModule" },
      ui: { label: "UI", dataType: "ui" }
    },
    fields: {
      moduleId: { label: "Module id", type: "identity", default: "hud.interactions", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      title: { label: "Title", type: "tokenText", default: "Interactions", required: false, maxLength: 160 },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "center-right", required: true },
      layout: { label: "Layout", type: "select", options: ["panel", "compact"], default: "panel", required: true },
      targetKinds: { label: "Target kinds", type: "json", default: ["enemy", "resource", "pickup", "zone_link"], required: false },
      maxTargets: numberField("Max targets", 8, 1, 40, 1),
      rangeMode: { label: "Range mode", type: "select", options: ["ability_range", "interaction_radius", "unrestricted"], default: "ability_range", required: true },
      showDistance: { label: "Show distance", type: "boolean", default: true, required: true },
      showHealth: { label: "Show health", type: "boolean", default: true, required: true },
      showLootPreview: { label: "Show loot preview", type: "boolean", default: true, required: true },
      allowDemoReset: { label: "Allow demo reset", type: "boolean", default: false, required: true }
    }
  },
  xp_hud: {
    label: "XP HUD",
    group: "UI",
    accent: "#7c2d12",
    description: "XP and level display module.",
    inputs: {},
    outputs: {
      uiModule: { label: "UI Module", dataType: "uiModule" },
      ui: { label: "UI", dataType: "ui" }
    },
    fields: {
      moduleId: { label: "Module id", type: "identity", default: "hud.xp", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "bottom-center", required: true },
      showLevel: { label: "Show level", type: "boolean", default: true, required: true },
      showCurrentXp: { label: "Show current XP", type: "boolean", default: true, required: true },
      showRequiredXp: { label: "Show required XP", type: "boolean", default: true, required: true },
      showPercent: { label: "Show percent", type: "boolean", default: false, required: true },
      barFrameAssetId: { label: "Frame asset", type: "asset", assetTypes: ["image"], default: null, required: false },
      barFillAssetId: { label: "Fill asset", type: "asset", assetTypes: ["image"], default: null, required: false },
      levelLabel: { label: "Level label", type: "tokenText", default: "Level @{player.level}", required: false, maxLength: 160, allowRuntimeTokens: true },
      xpLabel: { label: "XP label", type: "tokenText", default: "", required: false, maxLength: 160, allowRuntimeTokens: true },
      compact: { label: "Compact", type: "boolean", default: true, required: true }
    }
  },
  inventory_hud: {
    label: "Inventory HUD",
    group: "UI",
    accent: "#15803d",
    description: "Inventory display module.",
    inputs: {},
    outputs: {
      uiModule: { label: "UI Module", dataType: "uiModule" },
      ui: { label: "UI", dataType: "ui" }
    },
    fields: {
      moduleId: { label: "Module id", type: "identity", default: "hud.inventory", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "bottom-right", required: true },
      layout: { label: "Layout", type: "select", options: ["grid", "list"], default: "grid", required: true },
      columns: numberField("Columns", 5, 1, 20, 1),
      showWeight: { label: "Show weight", type: "boolean", default: true, required: true },
      showFilters: { label: "Show filters", type: "boolean", default: true, required: true },
      allowStackSplit: { label: "Allow stack split", type: "boolean", default: false, required: true },
      allowDestroy: { label: "Allow destroy", type: "boolean", default: true, required: true }
    }
  },
  equipment_hud: {
    label: "Equipment HUD",
    group: "UI",
    accent: "#0369a1",
    description: "Equipment slot display module.",
    inputs: {},
    outputs: {
      uiModule: { label: "UI Module", dataType: "uiModule" },
      ui: { label: "UI", dataType: "ui" }
    },
    fields: {
      moduleId: { label: "Module id", type: "identity", default: "hud.equipment", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "bottom-right", required: true }
    }
  },
  wallet_hud: {
    label: "Tracked Items HUD",
    group: "UI",
    accent: "#facc15",
    description: "Compact tracked currency/item display module.",
    inputs: {},
    outputs: {
      uiModule: { label: "UI Module", dataType: "uiModule" },
      ui: { label: "UI", dataType: "ui" }
    },
    fields: {
      moduleId: { label: "Module id", type: "identity", default: "hud.wallet", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      title: { label: "Title", type: "text", default: "Tracked", required: false, maxLength: 80 },
      currencyRefs: refListField("Currencies", ["currency"]),
      itemRefs: refListField("Items", ["item"]),
      maxEntries: numberField("Max entries", 5, 1, 12, 1),
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "top-right", required: true }
    }
  },
  death_respawn_hud: {
    label: "Death Respawn HUD",
    group: "UI",
    accent: "#64748b",
    description: "Death countdown and respawn module.",
    inputs: {},
    outputs: {
      uiModule: { label: "UI Module", dataType: "uiModule" },
      ui: { label: "UI", dataType: "ui" }
    },
    fields: {
      moduleId: { label: "Module id", type: "identity", default: "hud.death_respawn", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "center", required: true },
      showCountdown: { label: "Show countdown", type: "boolean", default: true, required: true },
      showDestination: { label: "Show destination", type: "boolean", default: true, required: true }
    }
  }
};

const QUEST_STATUS_OPTIONS = ["available", "active", "ready_to_turn_in", "completed", "abandoned", "failed"];
const QUEST_REPEAT_OPTIONS = ["once_per_character", "repeatable", "daily", "weekly"];
const CONDITION_COMPARISON_OPTIONS = [">=", ">", "==", "!=", "<=", "<"];

const NODE05_ECONOMY_NODE_DEFS = {
  recipe_ingredient: {
    label: "Recipe Ingredient",
    group: "Crafting",
    accent: "#ca8a04",
    description: "Item or currency requirement consumed by a recipe.",
    inputs: {},
    outputs: { ingredient: { label: "Ingredient", dataType: "recipeIngredient" } },
    fields: {
      ingredientId: { label: "Ingredient id", type: "identity", default: "recipe_ingredient.new", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      kind: { label: "Kind", type: "select", options: ["item", "item_tag", "currency"], default: "item", required: true },
      itemRef: refField("Item", ["item"]),
      itemTagQuery: { label: "Item tags", type: "tagQuery", default: { all: [], any: [], none: [] }, required: false },
      currencyRef: refField("Currency", ["currency"]),
      amount: numberField("Amount", 1, 1, 1000000, 1),
      consume: { label: "Consume", type: "boolean", default: true, required: true },
      alternativesGroup: { label: "Alternatives group", type: "identity", default: "", required: false, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      selectionPolicy: { label: "Selection", type: "select", options: ["exact", "oldest_first", "lowest_quality_first"], default: "oldest_first", required: true }
    }
  },
  recipe_definition: {
    label: "Recipe Definition",
    group: "Crafting",
    accent: "#a16207",
    description: "Server-authoritative craft recipe.",
    inputs: {
      ingredients: { label: "Ingredients", dataType: "recipeIngredient", required: false, multiple: true },
      outputActions: { label: "Output Rewards", dataType: "rewardEntry", required: false, multiple: true }
    },
    outputs: {
      recipeDef: { label: "Recipe", dataType: "recipeDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("recipeId", "recipe.new", "New Recipe", {
      description: { label: "Description", type: "tokenText", default: "", required: false, maxLength: 320 },
      category: { label: "Category", type: "text", default: "general", required: false, maxLength: 96 },
      stationType: { label: "Station type", type: "identity", default: "crafting.station", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      craftDurationMs: numberField("Duration ms", 0, 0, 86400000, 1),
      batchAllowed: { label: "Batch allowed", type: "boolean", default: false, required: true },
      maxBatch: numberField("Max batch", 1, 1, 1000, 1),
      consumeTiming: { label: "Consume timing", type: "select", options: ["start", "completion"], default: "start", required: true },
      cancelPolicy: { label: "Cancel policy", type: "select", options: ["no_refund", "full_refund", "partial_refund"], default: "no_refund", required: true },
      unlockMode: { label: "Unlock mode", type: "select", options: ["default_available", "player_unlock_required"], default: "default_available", required: true },
      successPolicy: { label: "Success", type: "select", options: ["guaranteed", "formula"], default: "guaranteed", required: true },
      outputItems: { label: "Output items", type: "json", default: [], required: false },
      outputCurrencies: { label: "Output currencies", type: "json", default: [], required: false },
      tradabilityOverride: { label: "Tradability", type: "select", options: ["inherit_outputs", "bind_outputs"], default: "inherit_outputs", required: true },
      visibleWhenLocked: { label: "Visible when locked", type: "boolean", default: true, required: true },
      contentVersion: numberField("Content version", 1, 1, 1000000, 1)
    })
  },
  crafting_policy: {
    label: "Crafting Policy",
    group: "Player Rules",
    accent: "#a16207",
    description: "Crafting runtime limits and overflow behavior.",
    inputs: {},
    outputs: {
      craftingPolicy: { label: "Crafting Policy", dataType: "craftingPolicy" },
      policy: { label: "Policy", dataType: "policy" }
    },
    fields: {
      policyId: { label: "Policy id", type: "identity", default: "policy.crafting.main", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      maxConcurrentJobs: numberField("Max jobs", 2, 1, 50, 1),
      allowOfflineCompletion: { label: "Offline completion", type: "boolean", default: true, required: true },
      inventoryOverflowPolicy: { label: "Overflow", type: "select", options: ["block", "mail"], default: "mail", required: true },
      cancelAllowed: { label: "Cancel allowed", type: "boolean", default: false, required: true },
      defaultRefundPercent: numberField("Refund %", 0, 0, 100, 1),
      stationDistance: numberField("Station distance", 5, 0, 1000, 0.1),
      operationTimeoutMs: numberField("Operation timeout ms", 10000, 1000, 120000, 100)
    }
  },
  crafting_station_component: {
    label: "Crafting Station Component",
    group: "Entities",
    accent: "#ca8a04",
    description: "Adds crafting access to a zone entity.",
    inputs: {},
    outputs: { component: { label: "Entity Component", dataType: "entityComponent" } },
    fields: {
      componentId: { label: "Component id", type: "identity", default: "component.crafting_station", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      linkedEntityId: { label: "Linked entity id", type: "text", default: "", required: false, maxLength: 96 },
      stationId: { label: "Station id", type: "identity", default: "station.crafting.main", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      stationType: { label: "Station type", type: "identity", default: "crafting.station", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      recipeRefs: refListField("Recipes", ["recipe"]),
      recipeTagQuery: { label: "Recipe tags", type: "tagQuery", default: { all: [], any: [], none: [] }, required: false },
      craftingPolicyRef: refField("Crafting policy", ["policy"]),
      interactionPrompt: { label: "Prompt", type: "tokenText", default: "Craft", required: false, maxLength: 160 },
      range: numberField("Range", 5, 1, 1000, 0.1)
    }
  },
  vendor_offer: {
    label: "Vendor Offer",
    group: "Vendors",
    accent: "#fb923c",
    description: "One vendor buy/sell offer.",
    inputs: {},
    outputs: { vendorOffer: { label: "Vendor Offer", dataType: "vendorOffer" } },
    fields: {
      offerId: { label: "Offer id", type: "identity", default: "vendor_offer.new", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      itemRef: refField("Item", ["item"], true),
      mode: { label: "Mode", type: "select", options: ["sell_to_player", "buy_from_player", "both"], default: "both", required: true },
      sellCurrencyRef: refField("Sell currency", ["currency"]),
      sellPriceMinor: numberField("Sell price", 10, 0, 100000000000, 1),
      buyCurrencyRef: refField("Buy currency", ["currency"]),
      buyPriceMinor: numberField("Buy price", 5, 0, 100000000000, 1),
      stockMode: { label: "Stock", type: "select", options: ["inherit", "infinite", "limited"], default: "infinite", required: true },
      initialStock: numberField("Initial stock", 0, 0, 1000000, 1),
      maxStock: numberField("Max stock", 0, 0, 1000000, 1),
      restockAmount: numberField("Restock amount", 0, 0, 1000000, 1),
      restockSeconds: numberField("Restock seconds", 0, 0, 31536000, 1),
      bindOnPurchase: { label: "Bind on purchase", type: "boolean", default: false, required: true }
    }
  },
  vendor_catalog: {
    label: "Vendor Catalog",
    group: "Vendors",
    accent: "#f97316",
    description: "A node-authored vendor stock and price list.",
    inputs: { offers: { label: "Offers", dataType: "vendorOffer", required: false, multiple: true } },
    outputs: {
      vendorCatalog: { label: "Vendor Catalog", dataType: "vendorCatalogDef" },
      catalogDefinition: { label: "Catalog Definition", dataType: "catalogDefinition" }
    },
    fields: definitionFields("vendorCatalogId", "vendor.catalog.main", "Vendor Catalog", {
      refreshPolicy: { label: "Refresh", type: "select", options: ["static", "interval", "daily", "event"], default: "static", required: true },
      refreshIntervalSeconds: numberField("Refresh seconds", 0, 0, 31536000, 1),
      buybackEnabled: { label: "Buyback", type: "boolean", default: true, required: true },
      buybackDurationSeconds: numberField("Buyback seconds", 3600, 0, 31536000, 1),
      sellAllowed: { label: "Sell allowed", type: "boolean", default: true, required: true },
      stockScope: { label: "Stock scope", type: "select", options: ["infinite", "global", "zone", "per_player"], default: "infinite", required: true },
      contentVersion: numberField("Content version", 1, 1, 1000000, 1)
    })
  },
  vendor_policy: {
    label: "Vendor Policy",
    group: "Player Rules",
    accent: "#ea580c",
    description: "Vendor transaction defaults.",
    inputs: {},
    outputs: { vendorPolicy: { label: "Vendor Policy", dataType: "vendorPolicy" }, policy: { label: "Policy", dataType: "policy" } },
    fields: {
      policyId: { label: "Policy id", type: "identity", default: "policy.vendor.main", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      enabled: { label: "Enabled", type: "boolean", default: true, required: true },
      defaultDistance: numberField("Default distance", 5, 0, 1000, 0.1),
      allowSellFromInventory: { label: "Sell from inventory", type: "boolean", default: true, required: true }
    }
  },
  vendor_component: {
    label: "Vendor Component",
    group: "Entities",
    accent: "#f97316",
    description: "Adds vendor access to a zone entity.",
    inputs: {},
    outputs: { component: { label: "Entity Component", dataType: "entityComponent" } },
    fields: {
      componentId: { label: "Component id", type: "identity", default: "component.vendor", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      linkedEntityId: { label: "Linked entity id", type: "text", default: "", required: false, maxLength: 96 },
      vendorId: { label: "Vendor id", type: "identity", default: "vendor.main", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      vendorCatalogRef: refField("Vendor catalog", ["vendor", "vendor_catalog"], true),
      interactionPrompt: { label: "Prompt", type: "tokenText", default: "Trade", required: false, maxLength: 160 },
      range: numberField("Range", 5, 1, 1000, 0.1)
    }
  },
  party_loot_policy: {
    label: "Party Loot Policy",
    group: "Player Rules",
    accent: "#7c3aed",
    description: "How party loot is assigned.",
    inputs: {},
    outputs: { partyLootPolicy: { label: "Party Loot Policy", dataType: "partyLootPolicy" }, policy: { label: "Policy", dataType: "policy" } },
    fields: {
      policyId: { label: "Policy id", type: "identity", default: "policy.party_loot.main", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      mode: { label: "Mode", type: "select", options: ["personal", "round_robin", "free_for_all", "need_greed_pass"], default: "personal", required: true },
      minimumContributionPercent: numberField("Min contribution %", 0, 0, 100, 1),
      lootDistance: numberField("Loot distance", 40, 0, 1000, 0.1),
      ownershipSeconds: numberField("Ownership seconds", 120, 0, 86400, 1),
      currencyMode: { label: "Currency mode", type: "select", options: ["personal", "split_evenly", "killer_only"], default: "personal", required: true }
    }
  },
  party_rules: {
    label: "Party Rules",
    group: "Player Rules",
    accent: "#8b5cf6",
    description: "Party membership and credit policy.",
    inputs: {},
    outputs: { partyPolicy: { label: "Party Policy", dataType: "partyPolicy" }, policy: { label: "Policy", dataType: "policy" } },
    fields: {
      policyId: { label: "Policy id", type: "identity", default: "policy.party.main", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      maxSize: numberField("Max size", 5, 2, 20, 1),
      inviteTimeoutSeconds: numberField("Invite timeout seconds", 120, 10, 3600, 1),
      kickAllowed: { label: "Kick allowed", type: "boolean", default: true, required: true },
      sameWorldRequired: { label: "Same world required", type: "boolean", default: true, required: true },
      sameZoneForSharedCredit: { label: "Same zone credit", type: "boolean", default: true, required: true },
      questCreditPolicy: { label: "Quest credit", type: "select", options: ["individual", "shared_if_near", "contribution"], default: "individual", required: true },
      partyLootPolicyRef: refField("Party loot policy", ["policy"])
    }
  },
  trade_policy: {
    label: "Trade Policy",
    group: "Player Rules",
    accent: "#0891b2",
    description: "Direct trade limits.",
    inputs: {},
    outputs: { tradePolicy: { label: "Trade Policy", dataType: "tradePolicy" }, policy: { label: "Policy", dataType: "policy" } },
    fields: {
      policyId: { label: "Policy id", type: "identity", default: "policy.trade.main", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      enabled: { label: "Enabled", type: "boolean", default: true, required: true },
      minimumLevel: numberField("Minimum level", 1, 1, 1000, 1),
      sameWorldRequired: { label: "Same world required", type: "boolean", default: true, required: true },
      maximumDistance: numberField("Max distance", 20, 0, 1000, 0.1),
      allowCurrency: { label: "Allow currency", type: "boolean", default: true, required: true },
      allowedCurrencyRefs: refListField("Currencies", ["currency"]),
      maxItemSlotsPerSide: numberField("Max item slots", 8, 1, 100, 1),
      confirmDelayMs: numberField("Confirm delay ms", 1000, 0, 60000, 100),
      combatBlocked: { label: "Blocked in combat", type: "boolean", default: true, required: true }
    }
  },
  market_policy: {
    label: "Market Policy",
    group: "Player Rules",
    accent: "#059669",
    description: "Fixed-price marketplace rules.",
    inputs: {},
    outputs: { marketPolicy: { label: "Market Policy", dataType: "marketPolicy" }, policy: { label: "Policy", dataType: "policy" } },
    fields: {
      policyId: { label: "Policy id", type: "identity", default: "policy.market.main", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      enabled: { label: "Enabled", type: "boolean", default: true, required: true },
      listingMode: { label: "Listing mode", type: "select", options: ["fixed_price"], default: "fixed_price", required: true },
      allowPartialFills: { label: "Partial fills", type: "boolean", default: true, required: true },
      allowedCurrencyRefs: refListField("Currencies", ["currency"]),
      defaultDurationSeconds: numberField("Default duration seconds", 86400, 60, 31536000, 1),
      minimumPriceMinor: numberField("Minimum price", 1, 1, 100000000000, 1),
      maxActiveListingsPerCharacter: numberField("Max active listings", 20, 1, 1000, 1),
      cancelAllowed: { label: "Cancel allowed", type: "boolean", default: true, required: true },
      saleTaxBasisPoints: numberField("Sale tax bps", 500, 0, 10000, 1),
      inventoryOverflowPolicy: { label: "Overflow", type: "select", options: ["mail"], default: "mail", required: true }
    }
  },
  economy_tax_rule: {
    label: "Economy Tax Rule",
    group: "Player Rules",
    accent: "#16a34a",
    description: "Tax/fee rule for economy operations.",
    inputs: {},
    outputs: { economyRule: { label: "Economy Rule", dataType: "economyRule" }, policy: { label: "Policy", dataType: "policy" } },
    fields: {
      policyId: { label: "Policy id", type: "identity", default: "policy.economy_tax.main", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      operationKind: { label: "Operation", type: "select", options: ["listing", "sale", "vendor", "trade", "transfer"], default: "sale", required: true },
      currencyRef: refField("Currency", ["currency"]),
      basisPoints: numberField("Basis points", 500, 0, 10000, 1),
      minimumFeeMinor: numberField("Minimum fee", 0, 0, 100000000000, 1),
      maximumFeeMinor: numberField("Maximum fee", 0, 0, 100000000000, 1),
      ledgerReason: { label: "Ledger reason", type: "identity", default: "market_tax", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN }
    }
  },
  marketplace_access_component: {
    label: "Marketplace Access Component",
    group: "Entities",
    accent: "#059669",
    description: "Adds marketplace access to a zone entity.",
    inputs: {},
    outputs: { component: { label: "Entity Component", dataType: "entityComponent" } },
    fields: {
      componentId: { label: "Component id", type: "identity", default: "component.marketplace_access", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      linkedEntityId: { label: "Linked entity id", type: "text", default: "", required: false, maxLength: 96 },
      marketAccessId: { label: "Market access id", type: "identity", default: "market.home", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      marketPolicyRef: refField("Market policy", ["policy"]),
      interactionPrompt: { label: "Prompt", type: "tokenText", default: "Market", required: false, maxLength: 160 },
      remoteAccessAllowed: { label: "Remote access", type: "boolean", default: false, required: true },
      range: numberField("Range", 5, 1, 1000, 0.1)
    }
  },
  mail_policy: {
    label: "Mail Policy",
    group: "Player Rules",
    accent: "#475569",
    description: "System mail and pending delivery rules.",
    inputs: {},
    outputs: { mailPolicy: { label: "Mail Policy", dataType: "mailPolicy" }, policy: { label: "Policy", dataType: "policy" } },
    fields: {
      policyId: { label: "Policy id", type: "identity", default: "policy.mail.main", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      maxMailboxMessages: numberField("Max messages", 100, 1, 10000, 1),
      maxAttachmentsPerMessage: numberField("Max attachments", 8, 1, 100, 1),
      expiryDays: numberField("Expiry days", 30, 1, 3650, 1),
      allowPlayerMail: { label: "Player mail", type: "boolean", default: false, required: true },
      systemDeliveryOnly: { label: "System only", type: "boolean", default: true, required: true },
      claimAllAllowed: { label: "Claim all", type: "boolean", default: true, required: true }
    }
  },
  hud_layout: {
    label: "HUD Layout",
    group: "UI",
    accent: "#f43f5e",
    description: "Groups HUD modules and default scaling.",
    inputs: { modules: { label: "Modules", dataType: "uiModule", required: false, multiple: true } },
    outputs: { uiLayout: { label: "UI Layout", dataType: "uiPackage" } },
    fields: {
      layoutId: { label: "Layout id", type: "identity", default: "ui_layout.hud.main", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      uiScale: numberField("UI scale", 1, 0.25, 3, 0.05),
      safeArea: { label: "Safe area", type: "json", default: { top: 12, right: 12, bottom: 12, left: 12 }, required: false },
      breakpoints: { label: "Breakpoints", type: "json", default: { mobile: 720, tablet: 1024 }, required: false }
    }
  },
  menu_layout: {
    label: "Menu Layout",
    group: "UI",
    accent: "#be123c",
    description: "Groups menu modules and modal behavior.",
    inputs: { modules: { label: "Modules", dataType: "uiModule", required: false, multiple: true } },
    outputs: { menuLayout: { label: "Menu Layout", dataType: "uiPackage" } },
    fields: {
      layoutId: { label: "Layout id", type: "identity", default: "ui_layout.menu.main", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      navigation: { label: "Navigation", type: "select", options: ["tabs", "stack"], default: "tabs", required: true },
      modalBehavior: { label: "Modal behavior", type: "select", options: ["single", "stack"], default: "single", required: true },
      keyboardClose: { label: "Keyboard close", type: "boolean", default: true, required: true }
    }
  },
  party_hud: {
    label: "Party HUD",
    group: "UI",
    accent: "#8b5cf6",
    description: "Party members and invite controls.",
    inputs: {},
    outputs: { uiModule: { label: "UI Module", dataType: "uiModule" }, ui: { label: "UI", dataType: "ui" } },
    fields: {
      moduleId: { label: "Module id", type: "identity", default: "hud.party", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "center-left", required: true },
      showInvite: { label: "Show invite", type: "boolean", default: true, required: true },
      showMemberStats: { label: "Show member stats", type: "boolean", default: true, required: true }
    }
  },
  vendor_hud: {
    label: "Vendor HUD",
    group: "UI",
    accent: "#f97316",
    description: "Vendor buy/sell runtime panel.",
    inputs: {},
    outputs: { uiModule: { label: "UI Module", dataType: "uiModule" }, ui: { label: "UI", dataType: "ui" } },
    fields: {
      moduleId: { label: "Module id", type: "identity", default: "hud.vendor", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "center-right", required: true },
      maxOffers: numberField("Max offers", 8, 1, 50, 1),
      showSellTab: { label: "Show sell tab", type: "boolean", default: true, required: true }
    }
  },
  crafting_hud: {
    label: "Crafting HUD",
    group: "UI",
    accent: "#ca8a04",
    description: "Recipe list and crafting jobs.",
    inputs: {},
    outputs: { uiModule: { label: "UI Module", dataType: "uiModule" }, ui: { label: "UI", dataType: "ui" } },
    fields: {
      moduleId: { label: "Module id", type: "identity", default: "hud.crafting", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "center-right", required: true },
      maxRecipes: numberField("Max recipes", 8, 1, 50, 1),
      showJobs: { label: "Show jobs", type: "boolean", default: true, required: true }
    }
  },
  trade_hud: {
    label: "Trade HUD",
    group: "UI",
    accent: "#0891b2",
    description: "Direct trade snapshot panel.",
    inputs: {},
    outputs: { uiModule: { label: "UI Module", dataType: "uiModule" }, ui: { label: "UI", dataType: "ui" } },
    fields: {
      moduleId: { label: "Module id", type: "identity", default: "hud.trade", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "center", required: true },
      compactWhenIdle: { label: "Compact idle", type: "boolean", default: true, required: true }
    }
  },
  market_hud: {
    label: "Market HUD",
    group: "UI",
    accent: "#059669",
    description: "Fixed price listings and my orders.",
    inputs: {},
    outputs: { uiModule: { label: "UI Module", dataType: "uiModule" }, ui: { label: "UI", dataType: "ui" } },
    fields: {
      moduleId: { label: "Module id", type: "identity", default: "hud.market", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "center-left", required: true },
      pageSize: numberField("Page size", 8, 1, 50, 1),
      showMyOrders: { label: "Show my orders", type: "boolean", default: true, required: true }
    }
  },
  mail_hud: {
    label: "Mail HUD",
    group: "UI",
    accent: "#475569",
    description: "System mail and pending deliveries.",
    inputs: {},
    outputs: { uiModule: { label: "UI Module", dataType: "uiModule" }, ui: { label: "UI", dataType: "ui" } },
    fields: {
      moduleId: { label: "Module id", type: "identity", default: "hud.mail", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "bottom-left", required: true },
      maxMessages: numberField("Max messages", 5, 1, 50, 1),
      showClaimAll: { label: "Show claim all", type: "boolean", default: true, required: true }
    }
  }
};

const NODE04_CAMPAIGN_NODE_DEFS = {
  campaign_output: {
    label: "Campaign Output",
    group: "Campaigns",
    accent: "#d97706",
    description: "Bundles campaign, quest, dialogue, marker and reward content.",
    inputs: {
      campaigns: { label: "Campaigns", dataType: "campaignDef", required: false, multiple: true },
      quests: { label: "Quests", dataType: "questDef", required: false, multiple: true },
      dialogues: { label: "Dialogues", dataType: "dialogueDef", required: false, multiple: true },
      markerRules: { label: "Marker Rules", dataType: "markerRule", required: false, multiple: true },
      rewards: { label: "Rewards", dataType: "rewardEntry", required: false, multiple: true }
    },
    outputs: { campaignPackage: { label: "Campaign Package", dataType: "campaignPackage" } },
    fields: {
      packageId: { label: "Package id", type: "identity", default: "campaign.main.package", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      packageVersion: { label: "Package version", type: "text", default: "0.4.0", required: true, maxLength: 32 },
      namespaceOwnership: { label: "Namespace ownership", type: "tagList", default: [], required: false }
    }
  },
  campaign_definition: {
    label: "Campaign Definition",
    group: "Campaigns",
    accent: "#d97706",
    description: "Top-level campaign containing chapters and main quest flow.",
    inputs: { chapters: { label: "Chapters", dataType: "chapterDef", required: false, multiple: true } },
    outputs: { campaignDef: { label: "Campaign", dataType: "campaignDef" } },
    fields: {
      campaignId: { label: "Campaign id", type: "identity", default: "campaign.main", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      displayName: { label: "Display name", type: "text", default: "Main Campaign", required: true, maxLength: 120 },
      summary: { label: "Summary", type: "tokenText", default: "", required: false, maxLength: 500 },
      startQuestRef: refField("Start quest", ["quest"]),
      priority: numberField("Priority", 0, -100000, 100000, 1),
      tags: { label: "Tags", type: "tagList", default: [], required: false }
    }
  },
  chapter_definition: {
    label: "Chapter Definition",
    group: "Campaigns",
    accent: "#f59e0b",
    description: "A campaign chapter that owns an ordered quest list.",
    inputs: { quests: { label: "Quests", dataType: "questDef", required: false, multiple: true } },
    outputs: { chapterDef: { label: "Chapter", dataType: "chapterDef" } },
    fields: {
      chapterId: { label: "Chapter id", type: "identity", default: "chapter.main.01", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      displayName: { label: "Display name", type: "text", default: "Chapter 1", required: true, maxLength: 120 },
      campaignRef: refField("Campaign", ["campaign"]),
      order: numberField("Order", 1, -100000, 100000, 1),
      startQuestRef: refField("Start quest", ["quest"]),
      tags: { label: "Tags", type: "tagList", default: [], required: false }
    }
  },
  quest_definition: {
    label: "Quest Definition",
    group: "Quests",
    accent: "#fbbf24",
    description: "Server-authoritative quest contract with steps, conditions and rewards.",
    inputs: {
      steps: { label: "Steps", dataType: "questStepDef", required: false, multiple: true },
      rewards: { label: "Completion Rewards", dataType: "rewardEntry", required: false, multiple: true },
      startDialogue: { label: "Start Dialogue", dataType: "dialogueDef", required: false, multiple: false },
      unlocks: { label: "Unlocks", dataType: "questDef", required: false, multiple: true },
      conditions: { label: "Conditions", dataType: "condition", required: false, multiple: true }
    },
    outputs: { questDef: { label: "Quest", dataType: "questDef" } },
    fields: {
      questId: { label: "Quest id", type: "identity", default: "quest.new", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      displayName: { label: "Display name", type: "text", default: "New Quest", required: true, maxLength: 120 },
      summary: { label: "Summary", type: "tokenText", default: "", required: false, maxLength: 500 },
      description: { label: "Description", type: "tokenText", default: "", required: false, maxLength: 1200 },
      questType: { label: "Quest type", type: "select", options: ["main", "side", "tutorial", "daily", "event"], default: "main", required: true },
      startStepRef: refField("Start step", ["quest_step"]),
      turnInTargetRef: refField("Turn-in target", ["target"]),
      recommendedZoneRef: refField("Recommended zone", ["zone"]),
      prerequisiteQuestRefs: refListField("Prerequisite quests", ["quest"]),
      nextQuestRefs: refListField("Next quests", ["quest"]),
      autoTrack: { label: "Auto track", type: "boolean", default: true, required: true },
      abandonable: { label: "Abandonable", type: "boolean", default: false, required: true },
      repeatMode: { label: "Repeat mode", type: "select", options: QUEST_REPEAT_OPTIONS, default: "once_per_character", required: true },
      minimumLevel: numberField("Minimum level", 1, 1, 1000, 1),
      tags: { label: "Tags", type: "tagList", default: [], required: false }
    }
  },
  quest_step: {
    label: "Quest Step",
    group: "Quests",
    accent: "#fde68a",
    description: "Ordered quest step with objectives and local conditions.",
    inputs: {
      objectives: { label: "Objectives", dataType: "objective", required: false, multiple: true },
      conditions: { label: "Conditions", dataType: "condition", required: false, multiple: true },
      rewards: { label: "Step Rewards", dataType: "rewardEntry", required: false, multiple: true },
      markerRule: { label: "Marker Rule", dataType: "markerRule", required: false, multiple: false }
    },
    outputs: { questStep: { label: "Quest Step", dataType: "questStepDef" } },
    fields: {
      stepId: { label: "Step id", type: "identity", default: "quest_step.new", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      displayName: { label: "Display name", type: "text", default: "New Step", required: true, maxLength: 120 },
      instruction: { label: "Instruction", type: "tokenText", default: "", required: false, maxLength: 500, allowRuntimeTokens: true },
      stepType: { label: "Step type", type: "select", options: ["talk", "collect", "deliver", "reach", "kill", "custom"], default: "collect", required: true },
      sequenceIndex: numberField("Sequence", 1, -100000, 100000, 1),
      targetRef: refField("Target", ["target"]),
      zoneRef: refField("Zone", ["zone"]),
      nextStepRef: refField("Next step", ["quest_step"]),
      autoAdvance: { label: "Auto advance", type: "boolean", default: true, required: true },
      optional: { label: "Optional", type: "boolean", default: false, required: true }
    }
  },
  objective_talk: {
    label: "Objective Talk",
    group: "Objectives",
    accent: "#84cc16",
    description: "Objective completed by talking to a quest target.",
    inputs: {},
    outputs: { objective: { label: "Objective", dataType: "objective" } },
    fields: {
      objectiveId: { label: "Objective id", type: "identity", default: "objective.talk", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      instruction: { label: "Instruction", type: "tokenText", default: "Talk", required: false, maxLength: 500, allowRuntimeTokens: true },
      targetRef: refField("Target", ["target"], true),
      zoneRef: refField("Zone", ["zone"]),
      requiredCount: numberField("Required count", 1, 1, 1000000, 1)
    }
  },
  objective_collect: {
    label: "Objective Collect",
    group: "Objectives",
    accent: "#65a30d",
    description: "Objective completed by having enough stackable item quantity.",
    inputs: {},
    outputs: { objective: { label: "Objective", dataType: "objective" } },
    fields: {
      objectiveId: { label: "Objective id", type: "identity", default: "objective.collect", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      instruction: { label: "Instruction", type: "tokenText", default: "Collect", required: false, maxLength: 500, allowRuntimeTokens: true },
      itemRef: refField("Item", ["item"], true),
      requiredAmount: numberField("Required amount", 1, 1, 1000000, 1),
      targetRef: refField("Target", ["target"]),
      zoneRef: refField("Zone", ["zone"])
    }
  },
  objective_deliver: {
    label: "Objective Deliver",
    group: "Objectives",
    accent: "#15803d",
    description: "Objective completed by delivering an item amount to a target.",
    inputs: {},
    outputs: { objective: { label: "Objective", dataType: "objective" } },
    fields: {
      objectiveId: { label: "Objective id", type: "identity", default: "objective.deliver", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      instruction: { label: "Instruction", type: "tokenText", default: "Deliver", required: false, maxLength: 500, allowRuntimeTokens: true },
      targetRef: refField("Target", ["target"], true),
      itemRef: refField("Item", ["item"], true),
      requiredAmount: numberField("Required amount", 1, 1, 1000000, 1),
      zoneRef: refField("Zone", ["zone"])
    }
  },
  objective_reach: {
    label: "Objective Reach",
    group: "Objectives",
    accent: "#22c55e",
    description: "Objective completed by reaching a zone target.",
    inputs: {},
    outputs: { objective: { label: "Objective", dataType: "objective" } },
    fields: {
      objectiveId: { label: "Objective id", type: "identity", default: "objective.reach", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      instruction: { label: "Instruction", type: "tokenText", default: "Reach", required: false, maxLength: 500, allowRuntimeTokens: true },
      targetRef: refField("Target", ["target"], true),
      zoneRef: refField("Zone", ["zone"], true),
      radius: numberField("Radius", 4, 0.1, 1000, 0.1)
    }
  },
  condition_player_level: {
    label: "Condition Player Level",
    group: "Conditions",
    accent: "#38bdf8",
    description: "Compares the player's current level.",
    inputs: {},
    outputs: { condition: { label: "Condition", dataType: "condition" } },
    fields: {
      conditionId: { label: "Condition id", type: "identity", default: "condition.player_level", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      comparison: { label: "Comparison", type: "select", options: CONDITION_COMPARISON_OPTIONS, default: ">=", required: true },
      level: numberField("Level", 1, 1, 1000, 1),
      failureText: { label: "Failure text", type: "tokenText", default: "Level requirement not met.", required: false, maxLength: 240 }
    }
  },
  condition_has_item: {
    label: "Condition Has Item",
    group: "Conditions",
    accent: "#0ea5e9",
    description: "Requires an item amount in inventory.",
    inputs: {},
    outputs: { condition: { label: "Condition", dataType: "condition" } },
    fields: {
      conditionId: { label: "Condition id", type: "identity", default: "condition.has_item", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      itemRef: refField("Item", ["item"], true),
      amount: numberField("Amount", 1, 1, 1000000, 1),
      failureText: { label: "Failure text", type: "tokenText", default: "Missing item.", required: false, maxLength: 240 }
    }
  },
  condition_group: {
    label: "Condition Group",
    group: "Conditions",
    accent: "#0284c7",
    description: "AND/OR group for quest and dialogue conditions.",
    inputs: { conditions: { label: "Conditions", dataType: "condition", required: false, multiple: true } },
    outputs: { condition: { label: "Condition Group", dataType: "condition" } },
    fields: {
      conditionId: { label: "Condition id", type: "identity", default: "condition.group", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      mode: { label: "Mode", type: "select", options: ["all", "any"], default: "all", required: true },
      failureText: { label: "Failure text", type: "tokenText", default: "", required: false, maxLength: 240 }
    }
  },
  action_give_currency: {
    label: "Action Give Currency",
    group: "Actions",
    accent: "#facc15",
    description: "Atomic quest reward for currency.",
    inputs: {},
    outputs: { action: { label: "Action", dataType: "action" }, rewardEntry: { label: "Reward", dataType: "rewardEntry" } },
    fields: {
      actionId: { label: "Action id", type: "identity", default: "action.give_currency", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      currencyRef: refField("Currency", ["currency"], true),
      amountMinor: numberField("Amount minor", 1, 0, 9007199254740991, 1),
      reason: { label: "Reason", type: "text", default: "quest_reward", required: false, maxLength: 96 }
    }
  },
  action_give_xp: {
    label: "Action Give XP",
    group: "Actions",
    accent: "#a16207",
    description: "Atomic quest reward for player XP.",
    inputs: {},
    outputs: { action: { label: "Action", dataType: "action" }, rewardEntry: { label: "Reward", dataType: "rewardEntry" } },
    fields: {
      actionId: { label: "Action id", type: "identity", default: "action.give_xp", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      amount: numberField("Amount", 25, 0, 1000000000, 1),
      reason: { label: "Reason", type: "text", default: "quest_reward", required: false, maxLength: 96 }
    }
  },
  action_unlock_ability: {
    label: "Action Unlock Ability",
    group: "Actions",
    accent: "#fb7185",
    description: "Atomic quest reward that unlocks an ability and optionally places it on the hotbar.",
    inputs: {},
    outputs: { action: { label: "Action", dataType: "action" }, rewardEntry: { label: "Reward", dataType: "rewardEntry" } },
    fields: {
      actionId: { label: "Action id", type: "identity", default: "action.unlock_ability", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      abilityRef: refField("Ability", ["ability"], true),
      rank: numberField("Rank", 1, 1, 1000, 1),
      loadoutId: { label: "Loadout id", type: "identity", default: "loadout.main", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      preferredSlotIndex: numberField("Preferred slot", 2, 0, 63, 1),
      reason: { label: "Reason", type: "text", default: "quest_reward", required: false, maxLength: 96 }
    }
  },
  action_remove_item: {
    label: "Action Remove Item",
    group: "Actions",
    accent: "#e11d48",
    description: "Atomic quest action that consumes an item amount.",
    inputs: {},
    outputs: { action: { label: "Action", dataType: "action" }, rewardEntry: { label: "Reward", dataType: "rewardEntry" } },
    fields: {
      actionId: { label: "Action id", type: "identity", default: "action.remove_item", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      itemRef: refField("Item", ["item"], true),
      amount: numberField("Amount", 1, 1, 1000000, 1),
      reason: { label: "Reason", type: "text", default: "quest_turn_in", required: false, maxLength: 96 }
    }
  },
  action_start_quest: {
    label: "Action Start Quest",
    group: "Actions",
    accent: "#4ade80",
    description: "Starts or unlocks another quest.",
    inputs: {},
    outputs: { action: { label: "Action", dataType: "action" }, rewardEntry: { label: "Reward", dataType: "rewardEntry" } },
    fields: {
      actionId: { label: "Action id", type: "identity", default: "action.start_quest", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      questRef: refField("Quest", ["quest"], true),
      mode: { label: "Mode", type: "select", options: ["activate", "unlock_available", "track_only"], default: "activate", required: true },
      reason: { label: "Reason", type: "text", default: "quest_unlock", required: false, maxLength: 96 }
    }
  },
  action_sequence: {
    label: "Action Sequence",
    group: "Actions",
    accent: "#e11d48",
    description: "Ordered list of actions/rewards.",
    inputs: { actions: { label: "Actions", dataType: "action", required: false, multiple: true } },
    outputs: { action: { label: "Action List", dataType: "actionList" }, rewardEntry: { label: "Reward Bundle", dataType: "rewardEntry" } },
    fields: {
      actionId: { label: "Action id", type: "identity", default: "action.sequence", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      stopOnFailure: { label: "Stop on failure", type: "boolean", default: true, required: true }
    }
  },
  reward_bundle: {
    label: "Reward Bundle",
    group: "Rewards",
    accent: "#eab308",
    description: "Named reward collection shown in quest UI.",
    inputs: { rewards: { label: "Rewards", dataType: "rewardEntry", required: false, multiple: true } },
    outputs: { rewardEntry: { label: "Reward Bundle", dataType: "rewardEntry" }, rewardBundle: { label: "Reward Bundle", dataType: "rewardBundle" } },
    fields: {
      rewardBundleId: { label: "Reward bundle id", type: "identity", default: "reward.quest", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      displayName: { label: "Display name", type: "text", default: "Quest Rewards", required: true, maxLength: 120 }
    }
  },
  quest_complete: {
    label: "Quest Complete",
    group: "Quests",
    accent: "#a3a3a3",
    description: "Terminal marker for quest completion routing.",
    inputs: { rewards: { label: "Rewards", dataType: "rewardEntry", required: false, multiple: true } },
    outputs: { questTerminal: { label: "Quest Terminal", dataType: "questTerminal" } },
    fields: {
      terminalId: { label: "Terminal id", type: "identity", default: "quest_terminal.complete", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      status: { label: "Status", type: "select", options: QUEST_STATUS_OPTIONS, default: "completed", required: true }
    }
  },
  event_trigger: {
    label: "Event Trigger",
    group: "Events",
    accent: "#a78bfa",
    description: "Semantic gameplay event hook for future quest automation.",
    inputs: {},
    outputs: { eventTrigger: { label: "Event Trigger", dataType: "eventTrigger" } },
    fields: {
      eventTriggerId: { label: "Event trigger id", type: "identity", default: "event.quest", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      eventType: { label: "Event type", type: "identity", default: "item_gathered", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      sourceTagQuery: { label: "Source tags", type: "tagQuery", default: { all: [], any: [], none: [] }, required: false }
    }
  },
  quest_marker_rule: {
    label: "Quest Marker Rule",
    group: "Quests",
    accent: "#22d3ee",
    description: "Runtime marker configuration for a quest step.",
    inputs: {},
    outputs: { markerRule: { label: "Marker Rule", dataType: "markerRule" } },
    fields: {
      markerRuleId: { label: "Marker rule id", type: "identity", default: "marker_rule.quest", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      targetRef: refField("Target", ["target"], true),
      label: { label: "Label", type: "tokenText", default: "Quest Target", required: false, maxLength: 160, allowRuntimeTokens: true },
      icon: { label: "Icon", type: "select", options: ["quest", "talk", "collect", "turn_in", "travel", "complete"], default: "quest", required: true },
      color: { label: "Color", type: "color", default: "#facc15", required: true },
      radius: numberField("Radius", 4, 0.1, 1000, 0.1)
    }
  },
  dialogue_definition: {
    label: "Dialogue Definition",
    group: "Dialogue",
    accent: "#c084fc",
    description: "Dialogue graph for an NPC or runtime target.",
    inputs: { entries: { label: "Entries", dataType: "dialogueEntry", required: false, multiple: true } },
    outputs: { dialogueDef: { label: "Dialogue", dataType: "dialogueDef" } },
    fields: {
      dialogueId: { label: "Dialogue id", type: "identity", default: "dialogue.new", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      displayName: { label: "Display name", type: "text", default: "New Dialogue", required: true, maxLength: 120 },
      targetRef: refField("Target", ["target"], true),
      startEntryRef: refField("Start entry", ["dialogue_entry"]),
      tags: { label: "Tags", type: "tagList", default: [], required: false }
    }
  },
  dialogue_entry: {
    label: "Dialogue Entry",
    group: "Dialogue",
    accent: "#d8b4fe",
    description: "NPC line with connected player choices.",
    inputs: { choices: { label: "Choices", dataType: "dialogueChoice", required: false, multiple: true } },
    outputs: { dialogueEntry: { label: "Dialogue Entry", dataType: "dialogueEntry" } },
    fields: {
      entryId: { label: "Entry id", type: "identity", default: "dialogue_entry.new", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      speakerName: { label: "Speaker", type: "tokenText", default: "", required: false, maxLength: 120, allowRuntimeTokens: true },
      text: { label: "Text", type: "tokenText", default: "", required: true, maxLength: 1200, allowRuntimeTokens: true },
      nextEntryRef: refField("Next entry", ["dialogue_entry"]),
      closeAfterLine: { label: "Close after line", type: "boolean", default: false, required: true }
    }
  },
  dialogue_choice: {
    label: "Dialogue Choice",
    group: "Dialogue",
    accent: "#f0abfc",
    description: "Player response with optional quest action.",
    inputs: { conditions: { label: "Conditions", dataType: "condition", required: false, multiple: true } },
    outputs: { dialogueChoice: { label: "Dialogue Choice", dataType: "dialogueChoice" } },
    fields: {
      choiceId: { label: "Choice id", type: "identity", default: "dialogue_choice.new", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      label: { label: "Label", type: "tokenText", default: "Continue", required: true, maxLength: 240, allowRuntimeTokens: true },
      action: { label: "Action", type: "select", options: ["none", "accept_quest", "turn_in_quest", "close"], default: "none", required: true },
      questRef: refField("Quest", ["quest"]),
      nextEntryRef: refField("Next entry", ["dialogue_entry"]),
      closeAfterSelect: { label: "Close after select", type: "boolean", default: false, required: true },
      order: numberField("Order", 1, -100000, 100000, 1)
    }
  },
  dialogue_action: {
    label: "Dialogue Action",
    group: "Dialogue",
    accent: "#f472b6",
    description: "Connects an action to a dialogue branch.",
    inputs: { action: { label: "Action", dataType: "action", required: true, multiple: false } },
    outputs: { dialogueRuntimeRef: { label: "Dialogue Action", dataType: "dialogueRuntimeRef" } },
    fields: {
      dialogueActionId: { label: "Dialogue action id", type: "identity", default: "dialogue_action.new", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN }
    }
  },
  dialogue_terminal: {
    label: "Dialogue Terminal",
    group: "Dialogue",
    accent: "#a3a3a3",
    description: "Terminal dialogue branch marker.",
    inputs: {},
    outputs: { dialogueEntry: { label: "Dialogue Terminal", dataType: "dialogueEntry" } },
    fields: {
      terminalId: { label: "Terminal id", type: "identity", default: "dialogue_terminal.close", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      closeMode: { label: "Close mode", type: "select", options: ["close", "return_to_start"], default: "close", required: true }
    }
  },
  dialogue_router: {
    label: "Dialogue Router",
    group: "Dialogue",
    accent: "#9333ea",
    description: "Future-safe dialogue router by conditions.",
    inputs: {
      conditions: { label: "Conditions", dataType: "condition", required: false, multiple: true },
      entries: { label: "Entries", dataType: "dialogueEntry", required: false, multiple: true }
    },
    outputs: { dialogueRouter: { label: "Dialogue Router", dataType: "dialogueRouterDef" } },
    fields: {
      routerId: { label: "Router id", type: "identity", default: "dialogue_router.new", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      fallbackEntryRef: refField("Fallback entry", ["dialogue_entry"])
    }
  },
  quest_tracker_hud: {
    label: "Quest Tracker HUD",
    group: "UI",
    accent: "#fbbf24",
    description: "Runtime quest tracker driven by active quest state.",
    inputs: {},
    outputs: { uiModule: { label: "UI Module", dataType: "uiModule" }, ui: { label: "UI", dataType: "ui" } },
    fields: {
      moduleId: { label: "Module id", type: "identity", default: "hud.quest_tracker", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "center-right", required: true },
      maxQuests: numberField("Max quests", 3, 1, 12, 1),
      showCompleted: { label: "Show completed", type: "boolean", default: true, required: true },
      showMarkers: { label: "Show markers", type: "boolean", default: true, required: true }
    }
  },
  dialogue_hud: {
    label: "Dialogue HUD",
    group: "UI",
    accent: "#c084fc",
    description: "Runtime dialogue panel for NPC conversations.",
    inputs: {},
    outputs: { uiModule: { label: "UI Module", dataType: "uiModule" }, ui: { label: "UI", dataType: "ui" } },
    fields: {
      moduleId: { label: "Module id", type: "identity", default: "hud.dialogue", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "center", required: true },
      widthPx: numberField("Width px", 520, 240, 1000, 1),
      showSpeaker: { label: "Show speaker", type: "boolean", default: true, required: true }
    }
  },
  notification_hud: {
    label: "Notification HUD",
    group: "UI",
    accent: "#38bdf8",
    description: "Runtime quest notification stack.",
    inputs: {},
    outputs: { uiModule: { label: "UI Module", dataType: "uiModule" }, ui: { label: "UI", dataType: "ui" } },
    fields: {
      moduleId: { label: "Module id", type: "identity", default: "hud.notifications", required: true, maxLength: 160, pattern: CANONICAL_FIELD_PATTERN },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"], default: "top-center", required: true },
      maxVisible: numberField("Max visible", 3, 1, 12, 1),
      durationMs: numberField("Duration ms", 4500, 1000, 60000, 1)
    }
  }
};

Object.assign(NODE_TYPES, FOUNDATION_NODE_DEFS, ZONE_NODE_DEFS, NODE03_CATALOG_NODE_DEFS, NODE03_RUNTIME_NODE_DEFS, NODE05_ECONOMY_NODE_DEFS, NODE04_CAMPAIGN_NODE_DEFS);
NODE_TYPES.minimap_bake.inputs = Object.assign({}, NODE_TYPES.minimap_bake.inputs || {}, {
  zone: { label: "Zone", dataType: "zoneDef", required: false, multiple: false },
  ground: { label: "Ground", dataType: "ground", required: false, multiple: false }
});
NODE_TYPES.minimap_bake.fields = Object.assign({}, NODE_TYPES.minimap_bake.fields, {
  zoneRef: { label: "Zone", type: "reference", referenceKinds: ["zone"], allowNull: true, default: null, required: false, maxLength: 160 },
  sourceMode: { label: "Bake source mode", type: "select", options: ["zone_bounds", "legacy_ground"], default: "zone_bounds", required: true }
});
NODE_TYPES.catalog_output.inputs = Object.assign({}, NODE_TYPES.catalog_output.inputs || {}, {
  definitions: { label: "Definitions", dataType: "catalogDefinition", required: false, multiple: true }
});
NODE_TYPES.zone_output.inputs = Object.assign({}, NODE_TYPES.zone_output.inputs || {}, {
  spawnControllers: { label: "Spawn Controllers", dataType: "spawnController", required: false, multiple: true },
  encounters: { label: "Encounters", dataType: "encounter", required: false, multiple: true },
  entityComponents: { label: "Entity Components", dataType: "entityComponent", required: false, multiple: true }
});
NODE_TYPES.ui_output.inputs = Object.assign({}, NODE_TYPES.ui_output.inputs || {}, {
  uiModules: { label: "UI Modules", dataType: "uiModule", required: false, multiple: true }
});
NODE_TYPES.game_minimap_hud.fields = Object.assign({}, NODE_TYPES.game_minimap_hud.fields, {
  sourceMode: { label: "Source mode", type: "select", options: ["active_zone_registry", "fixed_legacy"], default: "active_zone_registry", required: true },
  fallbackMinimapRef: { label: "Fallback minimap", type: "reference", referenceKinds: ["minimap"], allowNull: true, default: null, required: false },
  transitionMode: { label: "Transition mode", type: "select", options: ["instant", "fade"], default: "instant", required: true }
});
NODE_TYPES.model_entity.outputs = Object.assign({}, NODE_TYPES.model_entity.outputs || {}, {
  entityBase: { label: "Entity Base", dataType: "entityBase" }
});
NODE_TYPES.player_character.fields = Object.assign({}, NODE_TYPES.player_character.fields || {}, {
  playableCharacterRef: { label: "Playable character", type: "reference", referenceKinds: ["player"], allowNull: true, default: null, required: false, maxLength: 160 },
  useDefinitionPresentation: { label: "Use definition presentation", type: "boolean", default: true, required: true },
  useDefinitionMovement: { label: "Use definition movement", type: "boolean", default: true, required: true }
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
