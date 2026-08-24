import { createGkWorldRuntime } from "../shared/world-runtime.js?v=20260822-node04-minimap";
import { normalizeWorldSettingsPreset, worldSettingsPresetValues, mmoNetworkPresetValues } from "../shared/node-types.js?v=20260730-stop-resync1";
import { shouldApplyServerPosition as shouldApplyServerRevision } from "../shared/revision-guard.js?v=20260708-mmo02-fix3";
import {
  worldToMinimapPoint,
  resolveMinimapPoint,
  drawTriangleMarker,
  drawDotMarker,
  drawDiamondMarker,
  drawSquareMarker,
  drawCrossMarker,
  drawMarkerLabel,
  drawViewportCone,
  worldHeadingToMinimapRotation,
  createMinimapView,
  clampMinimapView,
  minimapViewBounds,
  attachMinimapInteractions
} from "../shared/minimap-utils.js?v=20260729-zones-save-fix15";

const canvas = document.querySelector("#gameCanvas");
const hud = document.querySelector("#hud");
const gameRoot = document.querySelector("#gameRoot");
const overlay = document.querySelector("#gameOverlay");
const overlayText = document.querySelector("#overlayText");

// FIX-5 authoritative movement / rubberband prevention. See README/fases/MMO-01-FIX-5-*.md.
const OWN_SMALL_CORRECTION_THRESHOLD = 1.0;
const OWN_HARD_CORRECTION_THRESHOLD = 3.0;
// FIX-10: reconciliation van de eigen speler. Afwijkingen kleiner dan de
// deadzone worden genegeerd; grotere afwijkingen worden als correctievector
// opgeslagen en per movement-tick geleidelijk weggesmeerd i.p.v. gesnapt.
const OWN_PREDICTION_DEADZONE = 0.35;
const OWN_CORRECTION_BLEND_MS = 300;
const OWN_CORRECTION_BLEND_RATE = 0.393;
const OWN_KEEP_PREDICTION_DURING_INPUT = true;
const OWN_ACTIVE_CORRECTION_MAX_UNITS = 0.08;
const OWN_CORRECTION_MERGE_FACTOR = 0.35;
const OWN_POST_INPUT_HOLD_MS = 650;
const OWN_STOP_RESYNC_MAX_UNITS = 40;
const REMOTE_HARD_CORRECTION_THRESHOLD = 5.0;
const OWN_RECONCILE_MS = 120;
const REMOTE_RECONCILE_MS = 100;
const REMOTE_TELEPORT_DISTANCE = 5.0;
const SERVER_TICK_RATE_HZ = 30;
const SNAPSHOT_RATE_HZ = 20;
const INPUT_SEND_RATE_HZ = 30;
const REMOTE_INTERPOLATION_BASE_DELAY_MS = 200;
const REMOTE_INTERPOLATION_MIN_DELAY_MS = 160;
const REMOTE_INTERPOLATION_MAX_DELAY_MS = 280;
const REMOTE_INTERPOLATION_BUFFER_LIMIT = 32;
const REMOTE_INTERPOLATION_SAMPLE_TTL_MS = 2000;
const REMOTE_INTERPOLATION_MAX_EXTRAPOLATION_MS = 80;
const WS_STATUS_HYSTERESIS_MS = 250;
const MMO_READY_TIMEOUT_MS = 12000;
const CLIENT_PING_INTERVAL_MS = 2000;
const PING_SAMPLE_WINDOW_SIZE = 20;
const MOVE_SEND_INTERVAL_MS = 33; // Throttle input/network sync to ~30 Hz.
const DEFAULT_MMO_NETWORK_SETTINGS = {
  enabled: true,
  networkPreset: "custom",
  serverTickRateHz: SERVER_TICK_RATE_HZ,
  snapshotRateHz: SNAPSHOT_RATE_HZ,
  inputSendRateHz: INPUT_SEND_RATE_HZ,
  moveSendIntervalMs: MOVE_SEND_INTERVAL_MS,
  predictionEnabled: true,
  reconciliationEnabled: true,
  ownPredictionDeadzone: OWN_PREDICTION_DEADZONE,
  ownCorrectionBlendMs: OWN_CORRECTION_BLEND_MS,
  ownCorrectionBlendRate: OWN_CORRECTION_BLEND_RATE,
  ownSmallCorrectionThreshold: OWN_SMALL_CORRECTION_THRESHOLD,
  ownHardCorrectionThreshold: OWN_HARD_CORRECTION_THRESHOLD,
  ownKeepPredictionDuringInput: OWN_KEEP_PREDICTION_DURING_INPUT,
  ownActiveCorrectionMaxUnits: OWN_ACTIVE_CORRECTION_MAX_UNITS,
  ownCorrectionMergeFactor: OWN_CORRECTION_MERGE_FACTOR,
  ownPostInputHoldMs: OWN_POST_INPUT_HOLD_MS,
  ownStopResyncMaxUnits: OWN_STOP_RESYNC_MAX_UNITS,
  remoteInterpolationBaseDelayMs: REMOTE_INTERPOLATION_BASE_DELAY_MS,
  remoteInterpolationMinDelayMs: REMOTE_INTERPOLATION_MIN_DELAY_MS,
  remoteInterpolationMaxDelayMs: REMOTE_INTERPOLATION_MAX_DELAY_MS,
  remoteMaxExtrapolationMs: REMOTE_INTERPOLATION_MAX_EXTRAPOLATION_MS,
  readyTimeoutMs: MMO_READY_TIMEOUT_MS,
  wsStatusHysteresisMs: WS_STATUS_HYSTERESIS_MS,
  clientPingIntervalMs: CLIENT_PING_INTERVAL_MS
};
const CLICK_MOVE_START_RADIUS = 0.04;
const CLICK_MOVE_ARRIVAL_RADIUS = 0.06;
const CLICK_MOVE_SELF_RADIUS_MULTIPLIER = 1.35;
const CLICK_MOVE_BLOCKED_RADIUS = 0.015;
const CLICK_MOVE_BLOCKED_TIMEOUT_MS = 420;
const POINTER_HOLD_RELEASE_THRESHOLD_MS = 180;
const POINTER_DRAG_THRESHOLD_PX = 6;
const CLIENT_NET_STORAGE_KEY = "gk:mmo01:movement-net";
const ANIMATION_STATES = new Set(["idle", "walk", "run"]);
const NODE03_HUD_TYPES = new Set([
  "hud_bar",
  "hotbar_hud",
  "xp_hud",
  "inventory_hud",
  "equipment_hud",
  "wallet_hud",
  "death_respawn_hud",
  "interaction_hud"
]);
const NODE04_HUD_TYPES = new Set([
  "quest_tracker_hud",
  "dialogue_hud",
  "notification_hud"
]);
const NODE05_HUD_TYPES = new Set([
  "party_hud",
  "vendor_hud",
  "crafting_hud",
  "trade_hud",
  "market_hud",
  "mail_hud"
]);
// 5-zone HUD layout: "left" and "right" are full-height side columns; "top" and
// "bottom" float in the band between them (auto-height, own width insets); "center"
// fills whatever space is left. Replaces the old 9-cell (3x3) grid model.
const GAME_HUD_ANCHORS = ["left", "top", "center", "bottom", "right"];
const GAME_HUD_ANCHOR_SET = new Set(GAME_HUD_ANCHORS);
const NODE03_DEFAULT_HUD_ANCHORS = {
  hud_bar: "top",
  hotbar_hud: "bottom",
  xp_hud: "bottom",
  inventory_hud: "right",
  equipment_hud: "right",
  wallet_hud: "right",
  interaction_hud: "right",
  death_respawn_hud: "center"
};
const NODE04_DEFAULT_HUD_ANCHORS = {
  quest_tracker_hud: "right",
  dialogue_hud: "center",
  notification_hud: "top"
};
const NODE05_DEFAULT_HUD_ANCHORS = {
  party_hud: "left",
  vendor_hud: "right",
  crafting_hud: "right",
  trade_hud: "center",
  market_hud: "left",
  mail_hud: "left"
};
const GAME_HUD_STORAGE_VERSION = 2;
const GAME_HUD_MIN_PANEL_WIDTH_PCT = 6;
const GAME_HUD_MIN_PANEL_HEIGHT_PCT = 4;
const GAME_HUD_DEFAULT_FLOAT_WIDTH_PCT = 22;
const GAME_HUD_DEFAULT_FLOAT_HEIGHT_PCT = 12;
const GAME_HUD_PANEL_SCALE_STEP = 0.1;
const GAME_HUD_COL_MIN_PCT = 10;
const GAME_HUD_CENTER_MIN_PCT = 16;
const GAME_HUD_EDGE_MIN_HEIGHT_PX = 40;
const GAME_HUD_EDGE_MAX_INSET_PCT = 45;
const GAME_HUD_DOCK_STACK_MIN_PCT = 1;
const GAME_HUD_DEFAULT_GRID = Object.freeze({
  columns: { left: 22, right: 22 },
  edges: {
    top: { heightPx: null, insetLeft: 0, insetRight: 0 },
    bottom: { heightPx: null, insetLeft: 0, insetRight: 0 }
  },
  gap: 8,
  dockModes: { left: "tabs", right: "tabs" },
  dockTabs: {}
});

function createClientSessionId() {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
  } catch {}
  return "client_" + Math.random().toString(36).slice(2, 12);
}

function loadPersistedNetState() {
  const fallback = {
    clientSessionId: createClientSessionId(),
    nextInputSeq: 1,
    lastAckedInputSeq: 0,
    controllerEpoch: 0
  };
  try {
    const raw = window.sessionStorage.getItem(CLIENT_NET_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) || {};
    const clientSessionId = typeof parsed.clientSessionId === "string" && parsed.clientSessionId.trim()
      ? parsed.clientSessionId.trim().slice(0, 128)
      : fallback.clientSessionId;
    const nextInputSeq = Math.max(1, Math.floor(Number(parsed.nextInputSeq) || 0));
    const lastAckedInputSeq = Math.max(0, Math.floor(Number(parsed.lastAckedInputSeq) || 0));
    const controllerEpoch = Math.max(0, Math.floor(Number(parsed.controllerEpoch) || 0));
    return {
      clientSessionId: clientSessionId,
      nextInputSeq: nextInputSeq,
      lastAckedInputSeq: lastAckedInputSeq,
      controllerEpoch: controllerEpoch
    };
  } catch {
    return fallback;
  }
}

function persistNetState() {
  try {
    window.sessionStorage.setItem(CLIENT_NET_STORAGE_KEY, JSON.stringify({
      clientSessionId: state.net.clientSessionId,
      nextInputSeq: state.net.nextInputSeq,
      lastAckedInputSeq: state.net.lastAckedInputSeq,
      controllerEpoch: state.net.controllerEpoch
    }));
  } catch {}
}

const persistedNetState = loadPersistedNetState();

const state = {
  runtime: null,
  runtimeAntialias: null,
  runtimeWorldKey: "",
  lastPublishedAt: null,
  worldId: null,
  publishedAt: null,
  schemaVersion: null,
  buildId: null,
  contentHash: null,
  gameProject: null,
  gameWorld: null,
  user: null,
  session: null,
  player: null,
  position: null,
  spawn: null,
  activeSessionCount: 0,
  connectedSessionCount: 0,
  predictedPosition: null,
  authoritativePosition: null,
    // FIX-10: openstaande servercorrectie voor de eigen speler (x/z), wordt
  // geleidelijk toegepast in stepMovement zodat er nooit wordt gesnapt.
  ownCorrection: null,
  net: {
    clientSessionId: persistedNetState.clientSessionId,
    nextInputSeq: persistedNetState.nextInputSeq,
    lastSentInputSeq: 0,
    lastAckedInputSeq: persistedNetState.lastAckedInputSeq,
    lastAppliedServerRevision: 0,
    lastAppliedServerUpdatedAt: "",
    pendingInputs: [],
    lastLocalInputAt: 0,
    postInputPredictionHoldUntil: 0,
    localControllerActive: false,
    controllerEpoch: persistedNetState.controllerEpoch,
    lastRemoteControllerSessionId: null,
    lastServerPositionAt: 0,
    lastServerClientInputSeq: 0,
    lastServerControllerEpoch: 0,
    lastServerSeq: 0,
    lastServerPacketAt: 0,
    lastWsOpenAt: 0,
    clockOffsetMs: 0,
    lastTransport: null,
    lastIgnoredReason: null
  },
  control: {
    isLocalController: false,
    activeControllerSessionId: null,
    lastLocalControlAt: 0,
    passiveSince: 0,
    lastControlSource: null
  },
  remote: {
    players: new Map(),
    tombstones: new Map(),
    interpolationDelayMs: REMOTE_INTERPOLATION_BASE_DELAY_MS,
    remoteRenderDelayMs: REMOTE_INTERPOLATION_BASE_DELAY_MS,
    lastPacketAt: 0,
    lastPacketType: null,
    lastRemoteEventType: null,
    droppedStaleUpdates: 0,
    droppedRemoteSamples: 0,
    hardSnapCount: 0,
    smoothFrameCount: 0,
    remoteCatchupCount: 0,
    worldId: null,
    lastSnapshotAt: 0,
    lastSnapshotSeq: 0,
    lastSnapshotServerTimeMs: 0,
    lastSnapshotIntervals: [],
    avgSnapshotIntervalMs: 0,
    maxSnapshotIntervalMs: 0,
    maxVisualFreezeMs: 0,
    maxObserverLagMs: 0,
    maxRemoteJump: 0,
    normalMovementUsesSnapshot: false,
    lastSnapshotPlayerIds: [],
    remotePlayerIds: [],
    lastPacketAgeMs: 0,
    rafId: 0
  },
  sync: {
    inFlight: false,
    lastSilentSyncAt: 0
  },
  mmoReady: {
    httpSnapshotLoaded: false,
    runtimeReady: false,
    socketOpen: false,
    bootstrapReceived: false,
    connectionReadyReceived: false,
    playerStateReceived: false,
    presenceSnapshotReceived: false,
    onlineReady: false,
    readyAt: 0,
    startedAt: 0,
    timeoutAt: 0,
    timeoutId: null,
    lastBlocker: null,
    lastErrorAt: 0
  },
  ws: null,
  wsConnectionAttemptId: 0,
  wsStateRaw: "disconnected",
  wsStateRawText: "disconnected",
  wsStateRawAt: 0,
  wsStateVisible: "disconnected",
  wsStateVisibleText: "disconnected",
  wsStateVisibleAt: 0,
  wsVisibleTimer: null,
  wsVisibleTimerTarget: null,
  wsVisibleTimerAttemptId: 0,
  wsConnectedOnce: false,
  wsLastStatusReason: null,
  lastConnectedAt: 0,
  lastDisconnectedAt: 0,
  lastCloseCode: null,
  lastCloseReason: null,
  reconnectSuppressedCount: 0,
  wsState: "disconnected",
  wantReconnect: true,
  reconnectTimer: null,
  reconnectAttempt: 0,
  lastSendAt: 0,
  httpFallbackInFlight: false,
  input: {
    move_forward: false,
    move_back: false,
    move_left: false,
    move_right: false,
    sprint: false
  },
  pointer: {
    active: false,
    pointerId: null,
    target: null,
    lastHoldVector: null,
    mode: "none",
    downX: 0,
    downY: 0,
    screenX: 0,
    screenY: 0,
    downAt: 0,
    blockedSince: 0,
    lastDistanceToTarget: -1,
    moved: false,
    dragged: false,
    sprintPointerId: null
  },
  lastAnimationState: "idle",
  debug: {
    lastSentType: null,
    lastSentAt: null,
    lastSentSeq: 0,
    lastReceivedType: null,
    lastReceivedAt: null,
    lastPacketType: null,
    lastPacketAt: null,
    lastSourceSessionId: null,
    lastAckedSeq: 0,
    lastIgnoredReason: null,
    lastTransport: null,
    lastServerRevision: 0,
    lastServerClientInputSeq: 0,
    lastServerControllerEpoch: 0,
    lastServerSeq: 0,
    lastError: null,
    pingMs: null,
    avgPingMs: null,
    jitterMs: null,
    maxPingMs: null,
    lastPongAgeMs: null,
    packetAgeMs: null,
    remoteBufferDelayMs: null
  },
  netPing: {
    seq: 0,
    samples: [],
    lastSentAt: 0,
    lastPongAt: 0,
    lastRttMs: null,
    timerId: null
  },
  debugHud: {
    elements: null,
    signature: null
  },
  minimapHud: {
    elements: null,
    signature: null,
    image: null,
    images: new Map(),
    dirty: false,
    lastDrawAt: 0,
    lastDrawKey: null,
    lastDrawDurationMs: 0,
    drawDurationEmaMs: 0,
    performanceMode: null,
    performanceModeUntil: 0,
    refreshTimerId: 0,
    view: null,
    userOverride: false,
    configKey: "",
    interactions: null
  },
  minimapFog: {
    worldId: null,
    mapLayer: "overworld",
    configKey: "",
    discoveredCells: new Set(),
    loaded: false,
    loadInFlight: false,
    saveInFlight: false,
    lastLoadAttemptAt: 0,
    dirty: true,
    lastDrawKey: "",
    lastClientCellKey: null,
    lastClientCellX: null,
    lastClientCellZ: null,
    lastSaveAt: 0,
    pendingSaveTimerId: 0,
    lastDiscoveredCount: 0,
    suppressDiscoveryUntil: 0,
    maskCanvas: null,
    maskCtx: null
  },
  node03: {
    snapshot: null,
    elements: null,
    signature: "",
    loadInFlight: false,
    actionInFlight: false,
    pollTimerId: 0,
    lastLoadedAt: 0,
    lastActionMessage: "",
    lastError: "",
    selectedTargetId: "",
    lastRangeRenderAt: 0
  },
  node04: {
    snapshot: null,
    dialogue: null,
    elements: null,
    signature: "",
    loadInFlight: false,
    actionInFlight: false,
    pollTimerId: 0,
    lastLoadedAt: 0,
    lastActionMessage: "",
    lastError: "",
    lastRangeRenderAt: 0
  },
  node05: {
    snapshot: null,
    elements: null,
    signature: "",
    loadInFlight: false,
    actionInFlight: false,
    pollTimerId: 0,
    lastLoadedAt: 0,
    lastActionMessage: "",
    lastError: "",
    lastRangeRenderAt: 0
  },
  hudLayout: {
    elements: null,
    editMode: false,
    overrides: null,
    drag: null,
    resize: null,
    gridResize: null,
    stackResize: null,
    refreshQueued: false
  },
  gameLoopTimings: {
    remoteSyncMs: 0,
    remoteSyncAvgMs: 0,
    remoteSyncCalls: 0,
    remoteSyncLastAt: 0,
    movementStepMs: 0,
    movementStepAvgMs: 0,
    movementStepCalls: 0,
    movementStepLastAt: 0,
    minimapDrawMs: 0,
    minimapDrawAvgMs: 0,
    minimapDrawCalls: 0,
    minimapDrawLastAt: 0
  },
  lastFrameAt: 0,
  movementTimerId: null
};

syncNetDebugState();
window.__GK_GAME_CLIENT_DEBUG = {
  getState: function () {
    return buildClientDebugState();
  },
  getGameLoopTimings: function () {
    return Object.assign({}, state.gameLoopTimings);
  },
  sendInputState: function (options = {}) {
    return sendInputState(options);
  },
  clearMovement: function (reason = "debug-clear") {
    clearMovementInput(reason);
    return true;
  },
  closeSocket: function (code = 4006, reason = "debug-close") {
    if (!state.ws) return false;
    try {
      state.ws.close(code, reason);
      return true;
    } catch {
      return false;
    }
  }
};

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function updateTimingEma(currentAverage, durationMs, alpha = 0.2) {
  const duration = Math.max(0, Number(durationMs) || 0);
  const previous = Math.max(0, Number(currentAverage) || 0);
  return round(previous > 0 ? previous * (1 - alpha) + duration * alpha : duration);
}

function recordGameLoopTiming(name, durationMs, now = performance.now()) {
  const timings = state.gameLoopTimings;
  if (!timings || !name) return;
  const duration = Math.max(0, Number(durationMs) || 0);
  const key = String(name);
  const msKey = `${key}Ms`;
  const avgKey = `${key}AvgMs`;
  const callsKey = `${key}Calls`;
  const lastAtKey = `${key}LastAt`;
  timings[msKey] = round(duration);
  timings[avgKey] = updateTimingEma(timings[avgKey], duration);
  timings[callsKey] = (Number(timings[callsKey]) || 0) + 1;
  timings[lastAtKey] = round(now);
}

function epochNow(now = performance.now()) {
  const origin = Number(performance.timeOrigin || 0);
  return origin ? origin + Number(now || performance.now()) : Date.now();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mmoNetworkSettings() {
  const source = state.gameWorld?.mmo?.network;
  const enabled = source && source.enabled !== false;
  const values = enabled ? source : {};
  const presetValues = values && values.networkPreset ? (mmoNetworkPresetValues(values.networkPreset) || {}) : {};
  const hasValue = function (key) {
    return values && Object.prototype.hasOwnProperty.call(values, key);
  };
  const read = function (key, min, max) {
    const fallback = presetValues[key] ?? DEFAULT_MMO_NETWORK_SETTINGS[key];
    return clamp(num(values[key], fallback), min, max);
  };
  const correctionBlendRateForMs = function (durationMs) {
    const duration = clamp(num(durationMs, OWN_CORRECTION_BLEND_MS), 50, 1000);
    return clamp(1 - Math.pow(0.05, 50 / duration), 0, 1);
  };
  const minDelay = read("remoteInterpolationMinDelayMs", 0, 300);
  const maxDelay = Math.max(minDelay, read("remoteInterpolationMaxDelayMs", 0, 500));
  const baseDelay = clamp(read("remoteInterpolationBaseDelayMs", 0, 300), minDelay, maxDelay);
  const inputSendRateHz = hasValue("inputSendRateHz")
    ? read("inputSendRateHz", 10, 60)
    : clamp(1000 / read("moveSendIntervalMs", 16, 120), 10, 60);
  const correctionBlendMs = hasValue("ownCorrectionBlendMs")
    ? read("ownCorrectionBlendMs", 50, 1000)
    : null;
  return {
    enabled: enabled,
    networkPreset: String(values.networkPreset || DEFAULT_MMO_NETWORK_SETTINGS.networkPreset || "custom"),
    serverTickRateHz: read("serverTickRateHz", 10, 60),
    snapshotRateHz: read("snapshotRateHz", 5, 30),
    inputSendRateHz: inputSendRateHz,
    moveSendIntervalMs: Math.max(16, Math.min(120, Math.round(1000 / inputSendRateHz))),
    predictionEnabled: values.predictionEnabled !== false,
    reconciliationEnabled: values.reconciliationEnabled !== false,
    ownPredictionDeadzone: read("ownPredictionDeadzone", 0, 2),
    ownCorrectionBlendMs: correctionBlendMs || DEFAULT_MMO_NETWORK_SETTINGS.ownCorrectionBlendMs,
    ownCorrectionBlendRate: correctionBlendMs
      ? correctionBlendRateForMs(correctionBlendMs)
      : read("ownCorrectionBlendRate", 0, 1),
    ownSmallCorrectionThreshold: read("ownSmallCorrectionThreshold", 0, 5),
    ownHardCorrectionThreshold: read("ownHardCorrectionThreshold", 0.5, 20),
    ownKeepPredictionDuringInput: values.ownKeepPredictionDuringInput !== false,
    ownActiveCorrectionMaxUnits: read("ownActiveCorrectionMaxUnits", 0, 2),
    ownCorrectionMergeFactor: read("ownCorrectionMergeFactor", 0, 1),
    ownPostInputHoldMs: read("ownPostInputHoldMs", 0, 2000),
    ownStopResyncMaxUnits: read("ownStopResyncMaxUnits", 0, 200),
    remoteInterpolationBaseDelayMs: baseDelay,
    remoteInterpolationMinDelayMs: minDelay,
    remoteInterpolationMaxDelayMs: maxDelay,
    remoteMaxExtrapolationMs: read("remoteMaxExtrapolationMs", 0, 250),
    readyTimeoutMs: read("readyTimeoutMs", 1000, 30000),
    wsStatusHysteresisMs: read("wsStatusHysteresisMs", 0, 2000),
    clientPingIntervalMs: read("clientPingIntervalMs", 500, 10000)
  };
}

function normalizePointerTarget(value) {
  if (!value || typeof value !== "object") return null;
  const x = Number(value.x);
  const z = Number(value.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return {
    x: num(x, 0),
    z: num(z, 0)
  };
}

function requestedPerformanceProfile() {
  try {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("gamePerformanceProfile") || params.get("perfProfile") || "";
    return normalizeWorldSettingsPreset(requested, "");
  } catch {
    // Ignore malformed query strings and fall back to the published world profile.
  }
  return "";
}

function showOverlay(text) {
  overlayText.textContent = text;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
  overlayText.textContent = "";
}

function resetMmoReadiness(reason = "reset") {
  clearMmoReadyTimeout();
  state.mmoReady.httpSnapshotLoaded = false;
  state.mmoReady.runtimeReady = false;
  resetMmoConnectionReadiness(reason);
  state.mmoReady.onlineReady = false;
  state.mmoReady.readyAt = 0;
  state.mmoReady.lastBlocker = null;
  state.mmoReady.lastErrorAt = 0;
  state.mmoReady.startedAt = performance.now();
  showOverlay("MMO verbinden... waiting_for_http_snapshot");
  scheduleMmoReadyTimeout();
}

function resetMmoConnectionReadiness(reason = "reset") {
  state.mmoReady.socketOpen = false;
  state.mmoReady.bootstrapReceived = false;
  state.mmoReady.connectionReadyReceived = false;
  state.mmoReady.playerStateReceived = false;
  state.mmoReady.presenceSnapshotReceived = false;
  state.mmoReady.onlineReady = false;
  state.mmoReady.readyAt = 0;
  state.mmoReady.lastBlocker = null;
  if (reason !== "reset") {
    state.mmoReady.lastErrorAt = 0;
  }
  if (state.mmoReady.startedAt) {
    scheduleMmoReadyTimeout();
  }
  if (reason !== "reset") {
    updateMmoReadyOverlay();
  }
}

function primeConnectedSocketReadiness() {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return false;
  state.mmoReady.socketOpen = true;
  markWsConnected();
  return true;
}

function clearMmoReadyTimeout() {
  if (state.mmoReady.timeoutId) {
    clearTimeout(state.mmoReady.timeoutId);
    state.mmoReady.timeoutId = null;
  }
  state.mmoReady.timeoutAt = 0;
}

function scheduleMmoReadyTimeout() {
  clearMmoReadyTimeout();
  const timeoutMs = mmoNetworkSettings().readyTimeoutMs;
  state.mmoReady.timeoutAt = performance.now() + timeoutMs;
  state.mmoReady.timeoutId = window.setTimeout(function () {
    if (state.mmoReady.onlineReady) return;
    const blocker = getMmoReadinessBlocker();
    state.mmoReady.lastBlocker = blocker;
    state.mmoReady.lastErrorAt = performance.now();
    state.debug.lastError = "MMO readiness timeout: " + blocker;
    showOverlay("MMO verbinden mislukt: " + blocker);
    updateHud();
  }, timeoutMs);
}

function getMmoReadinessBlocker() {
  if (!state.mmoReady.httpSnapshotLoaded) return "waiting_for_http_snapshot";
  if (!state.mmoReady.runtimeReady) return "waiting_for_runtime";
  if (!state.mmoReady.socketOpen || !state.ws || state.ws.readyState !== WebSocket.OPEN) return "waiting_for_socket";
  if (!state.mmoReady.connectionReadyReceived) return "waiting_for_connection_ready";
  if (!state.mmoReady.playerStateReceived) return "waiting_for_player_state";
  if (!state.mmoReady.presenceSnapshotReceived) return "waiting_for_presence_snapshot";
  return null;
}

function updateMmoReadyOverlay() {
  if (state.mmoReady.onlineReady) return;
  const blocker = getMmoReadinessBlocker() || "waiting_for_unknown";
  state.mmoReady.lastBlocker = blocker;
  const elapsed = state.mmoReady.startedAt ? performance.now() - state.mmoReady.startedAt : 0;
  const prefix = elapsed >= mmoNetworkSettings().readyTimeoutMs ? "MMO verbinden mislukt: " : "MMO verbinden... ";
  showOverlay(prefix + blocker);
}

function maybeMarkMmoOnlineReady(reason = "progress") {
  if (state.mmoReady.onlineReady) return true;
  const blocker = getMmoReadinessBlocker();
  if (blocker) {
    updateMmoReadyOverlay();
    updateHud();
    return false;
  }
  state.mmoReady.onlineReady = true;
  state.mmoReady.readyAt = performance.now();
  state.mmoReady.lastBlocker = null;
  clearMmoReadyTimeout();
  hideOverlay();
  startRemoteFrameLoop();
  updateHud();
  return true;
}

function isMmoGameplayReady() {
  return state.mmoReady.onlineReady === true;
}

function buildGameWsUrl() {
  const url = new URL(window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/api/game/live";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function deviceLabel() {
  const label = String(window.navigator.userAgent || "").trim();
  return label ? label.slice(0, 120) : null;
}

function isEditableTarget(target) {
  const tag = String(target?.tagName || "").toUpperCase();
  return Boolean(target?.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT");
}

function normalizeGameHudAnchor(anchor, fallback = "left") {
  const value = String(anchor || "").trim();
  if (GAME_HUD_ANCHOR_SET.has(value)) return value;
  return GAME_HUD_ANCHOR_SET.has(fallback) ? fallback : "left";
}

function gameHudLayoutStorageKey() {
  const projectId = String(state.gameProject?.project?.id || state.gameProject?.id || "project").trim() || "project";
  const userId = String(state.user?.id || state.user?.username || state.player?.id || "anonymous").trim() || "anonymous";
  return "gk:game:hud-layout:" + projectId + ":" + userId;
}

function readGameHudLayoutOverrides() {
  if (state.hudLayout.overrides) {
    ensureGameHudGridOverrides(state.hudLayout.overrides);
    return state.hudLayout.overrides;
  }
  try {
    const raw = window.localStorage.getItem(gameHudLayoutStorageKey());
    const parsed = raw ? JSON.parse(raw) : null;
    // Older layout schemas (9-cell grid) can't be meaningfully converted to the
    // 5-zone model - a version mismatch just starts fresh instead of migrating.
    const usable = parsed && typeof parsed === "object" && parsed.version === GAME_HUD_STORAGE_VERSION ? parsed : {};
    state.hudLayout.overrides = usable;
    if (!state.hudLayout.overrides.modules || typeof state.hudLayout.overrides.modules !== "object") {
      state.hudLayout.overrides.modules = {};
    }
    ensureGameHudGridOverrides(state.hudLayout.overrides);
    return state.hudLayout.overrides;
  } catch {
    state.hudLayout.overrides = { version: GAME_HUD_STORAGE_VERSION, modules: {}, grid: cloneGameHudGridDefaults() };
    return state.hudLayout.overrides;
  }
}

function writeGameHudLayoutOverrides(overrides) {
  const next = overrides && typeof overrides === "object" ? overrides : {};
  next.version = GAME_HUD_STORAGE_VERSION;
  if (!next.modules || typeof next.modules !== "object") next.modules = {};
  ensureGameHudGridOverrides(next);
  state.hudLayout.overrides = next;
  try {
    window.localStorage.setItem(gameHudLayoutStorageKey(), JSON.stringify(next));
  } catch {}
}

function cloneGameHudGridDefaults() {
  return {
    columns: Object.assign({}, GAME_HUD_DEFAULT_GRID.columns),
    edges: {
      top: Object.assign({}, GAME_HUD_DEFAULT_GRID.edges.top),
      bottom: Object.assign({}, GAME_HUD_DEFAULT_GRID.edges.bottom)
    },
    gap: GAME_HUD_DEFAULT_GRID.gap,
    dockModes: Object.assign({}, GAME_HUD_DEFAULT_GRID.dockModes),
    dockTabs: {}
  };
}

// Left/right column widths are independent (not siblings in a 100%-summing triple
// like the old grid) - the center band simply absorbs whatever space is left.
function normalizeHudColumns(values, fallback) {
  const maxSide = 100 - GAME_HUD_COL_MIN_PCT - GAME_HUD_CENTER_MIN_PCT;
  const left = clamp(num(values?.left, fallback.left), GAME_HUD_COL_MIN_PCT, maxSide);
  const right = clamp(num(values?.right, fallback.right), GAME_HUD_COL_MIN_PCT, 100 - left - GAME_HUD_CENTER_MIN_PCT);
  return { left: Math.round(left * 100) / 100, right: Math.round(right * 100) / 100 };
}

// heightPx null = auto/content-fit (default, until the user drags the height splitter).
// insetLeft/insetRight shrink the dock in from the center band's edges independently.
function normalizeHudEdge(value, fallback) {
  const rawHeight = value?.heightPx;
  const heightPx = rawHeight === null || rawHeight === undefined
    ? null
    : Math.max(GAME_HUD_EDGE_MIN_HEIGHT_PX, num(rawHeight, GAME_HUD_EDGE_MIN_HEIGHT_PX));
  const insetLeft = clamp(num(value?.insetLeft, fallback.insetLeft), 0, GAME_HUD_EDGE_MAX_INSET_PCT);
  const insetRight = clamp(num(value?.insetRight, fallback.insetRight), 0, GAME_HUD_EDGE_MAX_INSET_PCT);
  return {
    heightPx,
    insetLeft: Math.round(insetLeft * 100) / 100,
    insetRight: Math.round(insetRight * 100) / 100
  };
}

function ensureGameHudGridOverrides(overrides) {
  if (!overrides.grid || typeof overrides.grid !== "object") overrides.grid = cloneGameHudGridDefaults();
  const grid = overrides.grid;
  grid.columns = normalizeHudColumns(grid.columns, GAME_HUD_DEFAULT_GRID.columns);
  if (!grid.edges || typeof grid.edges !== "object") grid.edges = {};
  grid.edges.top = normalizeHudEdge(grid.edges.top, GAME_HUD_DEFAULT_GRID.edges.top);
  grid.edges.bottom = normalizeHudEdge(grid.edges.bottom, GAME_HUD_DEFAULT_GRID.edges.bottom);
  grid.gap = clamp(num(grid.gap, GAME_HUD_DEFAULT_GRID.gap), 0, 24);
  if (!grid.dockModes || typeof grid.dockModes !== "object") grid.dockModes = {};
  if (!Object.keys(grid.dockModes).length) {
    grid.dockModes = Object.assign({}, GAME_HUD_DEFAULT_GRID.dockModes);
  }
  if (!grid.dockTabs || typeof grid.dockTabs !== "object") grid.dockTabs = {};
  return grid;
}

function gameHudGridOverrides() {
  return ensureGameHudGridOverrides(readGameHudLayoutOverrides());
}

function gameHudDockMode(anchor) {
  const key = normalizeGameHudAnchor(anchor, "left");
  const mode = gameHudGridOverrides().dockModes[key];
  return mode === "tabs" ? "tabs" : "stack";
}

function setGameHudDockMode(anchor, mode) {
  const key = normalizeGameHudAnchor(anchor, "left");
  const overrides = readGameHudLayoutOverrides();
  ensureGameHudGridOverrides(overrides);
  overrides.grid.dockModes[key] = mode === "tabs" ? "tabs" : "stack";
  writeGameHudLayoutOverrides(overrides);
  refreshGameHudDockStacks();
  notifyGameHudPanelSizesChanged();
}

function gameHudDockActiveTab(anchor) {
  const key = normalizeGameHudAnchor(anchor, "left");
  return String(gameHudGridOverrides().dockTabs[key] || "").trim();
}

function setGameHudDockActiveTab(anchor, moduleId) {
  const key = normalizeGameHudAnchor(anchor, "left");
  const overrides = readGameHudLayoutOverrides();
  ensureGameHudGridOverrides(overrides);
  overrides.grid.dockTabs[key] = String(moduleId || "").trim();
  writeGameHudLayoutOverrides(overrides);
  refreshGameHudDockStacks();
  notifyGameHudPanelSizesChanged();
}

// Applies one splitter drag to the stored grid state. `kind` identifies which single
// value moves - unlike the old grid, tracks are no longer paired/swapped in twos.
function setGameHudGridEdge(kind, value) {
  const overrides = readGameHudLayoutOverrides();
  const grid = ensureGameHudGridOverrides(overrides);
  if (kind === "col-left") {
    grid.columns.left = clamp(value, GAME_HUD_COL_MIN_PCT, 100 - grid.columns.right - GAME_HUD_CENTER_MIN_PCT);
  } else if (kind === "col-right") {
    grid.columns.right = clamp(value, GAME_HUD_COL_MIN_PCT, 100 - grid.columns.left - GAME_HUD_CENTER_MIN_PCT);
  } else if (kind === "top-height") {
    grid.edges.top.heightPx = Math.max(GAME_HUD_EDGE_MIN_HEIGHT_PX, value);
  } else if (kind === "bottom-height") {
    grid.edges.bottom.heightPx = Math.max(GAME_HUD_EDGE_MIN_HEIGHT_PX, value);
  } else if (kind === "top-inset-left") {
    grid.edges.top.insetLeft = clamp(value, 0, GAME_HUD_EDGE_MAX_INSET_PCT);
  } else if (kind === "top-inset-right") {
    grid.edges.top.insetRight = clamp(value, 0, GAME_HUD_EDGE_MAX_INSET_PCT);
  } else if (kind === "bottom-inset-left") {
    grid.edges.bottom.insetLeft = clamp(value, 0, GAME_HUD_EDGE_MAX_INSET_PCT);
  } else if (kind === "bottom-inset-right") {
    grid.edges.bottom.insetRight = clamp(value, 0, GAME_HUD_EDGE_MAX_INSET_PCT);
  } else {
    return;
  }
  writeGameHudLayoutOverrides(overrides);
  applyGameHudGridSettings();
  notifyGameHudPanelSizesChanged();
}

function setGameHudGridGap(value) {
  const overrides = readGameHudLayoutOverrides();
  const grid = ensureGameHudGridOverrides(overrides);
  grid.gap = clamp(num(value, grid.gap), 0, 24);
  writeGameHudLayoutOverrides(overrides);
  applyGameHudGridSettings();
  refreshGameHudDockStacks();
  notifyGameHudPanelSizesChanged();
}

function notifyGameHudPanelSizesChanged() {
  if (!state.minimapHud.elements) return;
  state.minimapHud.dirty = true;
  window.requestAnimationFrame(function () {
    drawGameMinimapIfDue(performance.now());
  });
}

function gameHudModuleOverride(moduleId) {
  const id = String(moduleId || "").trim();
  if (!id) return null;
  const overrides = readGameHudLayoutOverrides();
  return overrides.modules && typeof overrides.modules === "object" ? overrides.modules[id] || null : null;
}

function setGameHudModuleOverride(moduleId, patch) {
  const id = String(moduleId || "").trim();
  if (!id) return null;
  const overrides = readGameHudLayoutOverrides();
  const previous = overrides.modules[id] && typeof overrides.modules[id] === "object" ? overrides.modules[id] : {};
  const next = Object.assign({}, previous, patch || {});
  overrides.modules[id] = next;
  writeGameHudLayoutOverrides(overrides);
  return next;
}

function clearGameHudModuleOverride(moduleId) {
  const id = String(moduleId || "").trim();
  if (!id) return;
  const overrides = readGameHudLayoutOverrides();
  if (overrides.modules && Object.prototype.hasOwnProperty.call(overrides.modules, id)) {
    delete overrides.modules[id];
    writeGameHudLayoutOverrides(overrides);
  }
}

function resetGameHudLayoutOverrides() {
  writeGameHudLayoutOverrides({ version: GAME_HUD_STORAGE_VERSION, modules: {}, grid: cloneGameHudGridDefaults() });
}

function hudModuleIdentity(module) {
  return String(module?.moduleId || module?.nodeId || module?.hudId || module?.nodeType || "").trim();
}

function hudModuleAnchor(module, fallback) {
  const moduleId = hudModuleIdentity(module);
  const moduleOverride = gameHudModuleOverride(moduleId);
  return normalizeGameHudAnchor(moduleOverride?.anchor || module?.anchor, fallback);
}

function applyHudDockClass(node, family, anchor) {
  const key = normalizeGameHudAnchor(anchor, "left");
  node.className = family + "HudAnchor gameHudDock gameHudDock--" + key + " " + family + "HudAnchor--" + key;
  node.dataset.hudDock = key;
}

function gameHudViewportSize() {
  return {
    width: Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1),
    height: Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1)
  };
}

function gameHudAnchorFromPoint(x, y) {
  const elements = state.hudLayout.elements;
  if (!elements || !elements.anchors) return null;
  for (const [anchor, dock] of Object.entries(elements.anchors)) {
    const rect = dock.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return anchor;
  }
  return null;
}

function gameHudCssEscape(value) {
  const text = String(value || "");
  if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(text);
  return text.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function gameHudPanelTitle(module) {
  if (module?.nodeType === "wallet_hud") return String(module?.title || "Tracked");
  if (module?.nodeType === "debug_mmo_hud") return "Performance";
  const raw = module?.label || module?.title || module?.moduleId || module?.hudId || module?.nodeType || "HUD";
  return String(raw).replace(/^hud\./, "").replace(/[_:.]+/g, " ").trim() || "HUD";
}

// Every nodeType that can share a dock gets a UNIQUE order value. With the old 9-cell
// grid, ties (several types returning the same number) didn't matter because those
// types rarely landed in the same dock. Now that far fewer docks exist, panels from
// different node families (node03/04/05, minimap) constantly share one dock and get
// destroyed+recreated independently on their own poll cycles - a tie there falls back
// to DOM insertion order for sorting, which flips with every independent rebuild and
// looks like panels "swapping" places. Unique values make the order deterministic.
const GAME_HUD_PANEL_ORDER = {
  hud_bar: 10,
  xp_hud: 20,
  wallet_hud: 30,
  game_minimap: 40,
  hotbar_hud: 50,
  notification_hud: 60,
  quest_tracker_hud: 70,
  interaction_hud: 80,
  inventory_hud: 90,
  equipment_hud: 100,
  dialogue_hud: 110,
  party_hud: 120,
  vendor_hud: 130,
  crafting_hud: 140,
  trade_hud: 150,
  market_hud: 160,
  mail_hud: 170,
  death_respawn_hud: 180,
  debug_mmo_hud: 900
};

function gameHudPanelOrder(module) {
  const type = module?.nodeType || "";
  return Object.prototype.hasOwnProperty.call(GAME_HUD_PANEL_ORDER, type) ? GAME_HUD_PANEL_ORDER[type] : 500;
}

function resolveGameHudModuleLayout(module, fallbackAnchor) {
  const moduleId = hudModuleIdentity(module);
  const override = gameHudModuleOverride(moduleId);
  const anchor = normalizeGameHudAnchor(override?.anchor || module?.anchor, fallbackAnchor);
  // "center" is a hard float-only zone: panels routed there never stack/tab like the
  // other 4 docks - they always float (drag to move, handle to resize, chrome +/-
  // to scale), positioned in percentages. Default position centers the panel.
  //
  // notification_hud floats by DEFAULT only (not hard-locked like "center"): its
  // render function returns null while there's nothing to show, so left docked
  // alongside a persistent panel (e.g. a quest tracker sharing "top"), that sibling
  // visibly jumps every time a notification appears or clears - even while standing
  // still, since notifications aren't tied to movement. Floating by default avoids
  // that out of the box, but an explicit dock override (drag it onto a dock zone) is
  // still respected - it's the user's call to accept the jump-risk in exchange for
  // having it docked.
  const isNotification = module?.nodeType === "notification_hud";
  const mode = anchor === "center"
    ? "float"
    : (override?.mode === "dock" ? "dock" : (override?.mode === "float" || isNotification ? "float" : "dock"));
  const defaultWidthPct = GAME_HUD_DEFAULT_FLOAT_WIDTH_PCT;
  const defaultHeightPct = GAME_HUD_DEFAULT_FLOAT_HEIGHT_PCT;
  const defaultXPct = (anchor === "center" || isNotification) ? 50 - defaultWidthPct / 2 : 50;
  const defaultYPct = anchor === "center" ? 50 - defaultHeightPct / 2 : (isNotification ? 4 : 50);
  return {
    mode: mode,
    anchor: anchor,
    xPct: clamp(num(override?.xPct, defaultXPct), 0, 96),
    yPct: clamp(num(override?.yPct, defaultYPct), 0, 96),
    widthPct: clamp(num(override?.widthPct, defaultWidthPct), GAME_HUD_MIN_PANEL_WIDTH_PCT, 96),
    heightPct: clamp(num(override?.heightPct, defaultHeightPct), GAME_HUD_MIN_PANEL_HEIGHT_PCT, 92),
    scale: clamp(num(override?.scale, 1), 0.55, 1.8)
  };
}

function createGameHudDockTools(anchor) {
  const tools = document.createElement("div");
  tools.className = "gameHudDockTools";
  tools.dataset.gameHudDockTools = anchor;
  const label = document.createElement("strong");
  label.textContent = anchor.replace("-", " ");
  const tabs = document.createElement("button");
  tabs.type = "button";
  tabs.dataset.gameHudDockControl = "toggle-tabs";
  tabs.dataset.gameHudDockAnchor = anchor;
  tabs.textContent = gameHudDockMode(anchor) === "tabs" ? "Rows" : "Tabs";
  tools.append(label, tabs);
  return tools;
}

// kind: "col-left" | "col-right" | "top-height" | "bottom-height" |
// "top-inset-left" | "top-inset-right" | "bottom-inset-left" | "bottom-inset-right"
function createGameHudGridSplitter(kind) {
  const splitter = document.createElement("button");
  splitter.type = "button";
  const vertical = kind === "col-left" || kind === "col-right" || kind.indexOf("inset") !== -1;
  splitter.className = "gameHudGridSplitter gameHudGridSplitter--" + (vertical ? "column" : "row");
  splitter.dataset.gameHudGridSplitter = "1";
  splitter.dataset.gameHudGridKind = kind;
  splitter.setAttribute("aria-label", "HUD layout aanpassen (" + kind + ")");
  return splitter;
}

// Splitters are positioned from the live rendered rects of the left/top/center/
// bottom/right docks, not from precomputed percentages - top/bottom are content-fit
// by default so their true edges can only be known after layout.
function positionGameHudGridSplitters() {
  const elements = state.hudLayout.elements;
  if (!elements || !elements.root || !elements.anchors) return;
  const splitters = elements.gridSplitters || [];
  if (!splitters.length) return;
  const left = elements.anchors.left, right = elements.anchors.right;
  const top = elements.anchors.top, bottom = elements.anchors.bottom;
  if (!left || !right || !top || !bottom) return;
  const rootRect = elements.root.getBoundingClientRect();
  const leftRect = left.getBoundingClientRect();
  const rightRect = right.getBoundingClientRect();
  const topRect = top.getBoundingClientRect();
  const bottomRect = bottom.getBoundingClientRect();
  const gridRect = elements.dockGrid.getBoundingClientRect();
  const rx = rootRect.left, ry = rootRect.top;
  for (const splitter of splitters) {
    const kind = splitter.dataset.gameHudGridKind;
    if (kind === "col-left") {
      splitter.style.left = (leftRect.right - rx) + "px";
      splitter.style.top = (gridRect.top - ry) + "px";
      splitter.style.height = gridRect.height + "px";
      splitter.style.width = "";
    } else if (kind === "col-right") {
      splitter.style.left = (rightRect.left - rx) + "px";
      splitter.style.top = (gridRect.top - ry) + "px";
      splitter.style.height = gridRect.height + "px";
      splitter.style.width = "";
    } else if (kind === "top-height") {
      splitter.style.left = (topRect.left - rx) + "px";
      splitter.style.top = (topRect.bottom - ry) + "px";
      splitter.style.width = topRect.width + "px";
      splitter.style.height = "";
    } else if (kind === "bottom-height") {
      splitter.style.left = (bottomRect.left - rx) + "px";
      splitter.style.top = (bottomRect.top - ry) + "px";
      splitter.style.width = bottomRect.width + "px";
      splitter.style.height = "";
    } else if (kind === "top-inset-left") {
      splitter.style.left = (topRect.left - rx) + "px";
      splitter.style.top = (topRect.top - ry) + "px";
      splitter.style.height = topRect.height + "px";
      splitter.style.width = "";
    } else if (kind === "top-inset-right") {
      splitter.style.left = (topRect.right - rx) + "px";
      splitter.style.top = (topRect.top - ry) + "px";
      splitter.style.height = topRect.height + "px";
      splitter.style.width = "";
    } else if (kind === "bottom-inset-left") {
      splitter.style.left = (bottomRect.left - rx) + "px";
      splitter.style.top = (bottomRect.top - ry) + "px";
      splitter.style.height = bottomRect.height + "px";
      splitter.style.width = "";
    } else if (kind === "bottom-inset-right") {
      splitter.style.left = (bottomRect.right - rx) + "px";
      splitter.style.top = (bottomRect.top - ry) + "px";
      splitter.style.height = bottomRect.height + "px";
      splitter.style.width = "";
    }
  }
}

function applyGameHudGridSettings() {
  const elements = state.hudLayout.elements;
  if (!elements || !elements.root) return;
  const grid = gameHudGridOverrides();
  elements.root.style.setProperty("--hud-col-left", grid.columns.left + "%");
  elements.root.style.setProperty("--hud-col-right", grid.columns.right + "%");
  elements.root.style.setProperty("--hud-top-height", grid.edges.top.heightPx != null ? grid.edges.top.heightPx + "px" : "auto");
  elements.root.style.setProperty("--hud-bottom-height", grid.edges.bottom.heightPx != null ? grid.edges.bottom.heightPx + "px" : "auto");
  elements.root.style.setProperty("--hud-top-inset-left", grid.edges.top.insetLeft + "%");
  elements.root.style.setProperty("--hud-top-inset-right", grid.edges.top.insetRight + "%");
  elements.root.style.setProperty("--hud-bottom-inset-left", grid.edges.bottom.insetLeft + "%");
  elements.root.style.setProperty("--hud-bottom-inset-right", grid.edges.bottom.insetRight + "%");
  elements.root.style.setProperty("--hud-gap", grid.gap + "px");
  if (elements.gapInput) elements.gapInput.value = String(Math.round(grid.gap));
  positionGameHudGridSplitters();
  window.requestAnimationFrame(positionGameHudGridSplitters);
}

function createGameHudGapControl(value) {
  const label = document.createElement("label");
  label.className = "gameHudGapControl";
  const text = document.createElement("span");
  text.textContent = "Gap";
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "24";
  input.step = "1";
  input.value = String(Math.round(value));
  input.dataset.gameHudGap = "1";
  label.append(text, input);
  return { label, input };
}

function createGameHudGridSplitters() {
  return [
    createGameHudGridSplitter("col-left"),
    createGameHudGridSplitter("col-right"),
    createGameHudGridSplitter("top-height"),
    createGameHudGridSplitter("bottom-height"),
    createGameHudGridSplitter("top-inset-left"),
    createGameHudGridSplitter("top-inset-right"),
    createGameHudGridSplitter("bottom-inset-left"),
    createGameHudGridSplitter("bottom-inset-right")
  ];
}

function refreshGameHudGridSplitters() {
  const elements = state.hudLayout.elements;
  if (!elements || !elements.root) return;
  for (const splitter of elements.gridSplitters || []) {
    splitter.hidden = state.hudLayout.editMode !== true;
  }
  positionGameHudGridSplitters();
}

function ensureGameHudRuntimeRoot() {
  if (state.hudLayout.elements && state.hudLayout.elements.root) return state.hudLayout.elements;
  const root = document.createElement("section");
  root.className = "gameHudRuntimeRoot";
  root.dataset.hudId = "game_hud_runtime";
  const dockGrid = document.createElement("div");
  dockGrid.className = "gameHudDockGrid";
  root.appendChild(dockGrid);
  const anchors = {};
  function makeDock(anchor) {
    const node = document.createElement("div");
    node.className = "gameHudDock gameHudDock--" + anchor;
    node.dataset.hudDock = anchor;
    node.appendChild(createGameHudDockTools(anchor));
    anchors[anchor] = node;
    return node;
  }
  // left/right are full-height side columns; top/center/bottom stack inside the
  // center band that fills whatever width is left between them.
  const leftDock = makeDock("left");
  const centerBand = document.createElement("div");
  centerBand.className = "gameHudCenterBand";
  centerBand.append(makeDock("top"), makeDock("center"), makeDock("bottom"));
  const rightDock = makeDock("right");
  dockGrid.append(leftDock, centerBand, rightDock);
  const toolbar = document.createElement("div");
  toolbar.className = "gameHudToolbar";
  toolbar.innerHTML = '<button type="button" data-game-hud-control="toggle">HUD</button><button type="button" data-game-hud-control="reset-all">Reset</button>';
  const grid = gameHudGridOverrides();
  const gapControl = createGameHudGapControl(grid.gap);
  toolbar.appendChild(gapControl.label);
  const gridSplitters = createGameHudGridSplitters();
  for (const splitter of gridSplitters) root.appendChild(splitter);
  root.appendChild(toolbar);
  root.addEventListener("click", handleGameHudRuntimeClick);
  root.addEventListener("change", handleGameHudRuntimeChange);
  root.addEventListener("input", handleGameHudRuntimeChange);
  root.addEventListener("pointerdown", handleGameHudPointerDown);
  window.addEventListener("pointermove", handleGameHudPointerMove);
  window.addEventListener("pointerup", finishGameHudPointerEdit);
  window.addEventListener("pointercancel", finishGameHudPointerEdit);
  window.addEventListener("resize", positionGameHudGridSplitters);
  hud.appendChild(root);
  state.hudLayout.elements = { root: root, dockGrid: dockGrid, centerBand: centerBand, anchors: anchors, toolbar: toolbar, gapInput: gapControl.input, gridSplitters: gridSplitters };
  applyGameHudGridSettings();
  refreshGameHudEditState();
  return state.hudLayout.elements;
}

function refreshGameHudEditState() {
  const elements = state.hudLayout.elements;
  if (!elements || !elements.root) return;
  elements.root.classList.toggle("gameHudRuntimeRoot--editing", state.hudLayout.editMode === true);
  applyGameHudGridSettings();
  if (elements.toolbar) {
    elements.toolbar.classList.toggle("gameHudToolbar--editing", state.hudLayout.editMode === true);
    const toggle = elements.toolbar.querySelector('[data-game-hud-control="toggle"]');
    if (toggle) toggle.textContent = state.hudLayout.editMode ? "Klaar" : "HUD";
  }
  refreshGameHudGridSplitters();
  for (const dock of Object.values(elements.anchors || {})) {
    const button = dock.querySelector("[data-game-hud-dock-control='toggle-tabs']");
    if (button) button.textContent = gameHudDockMode(dock.dataset.hudDock) === "tabs" ? "Rows" : "Tabs";
  }
}

function setGameHudEditMode(enabled) {
  state.hudLayout.editMode = enabled === true;
  state.hudLayout.drag = null;
  state.hudLayout.resize = null;
  state.hudLayout.gridResize = null;
  state.hudLayout.stackResize = null;
  refreshGameHudEditState();
  refreshGameHudDockStacks();
}

function rerenderGameHudPanels() {
  renderNode03Hud();
  renderNode04Hud();
  renderNode05Hud();
  if (state.minimapHud.elements) state.minimapHud.signature = null;
  refreshGameMinimapHud();
  refreshGameHudDockStacks();
}

function scheduleGameHudDockRefresh() {
  if (state.hudLayout.refreshQueued) return;
  state.hudLayout.refreshQueued = true;
  window.requestAnimationFrame(function () {
    state.hudLayout.refreshQueued = false;
    refreshGameHudDockStacks();
  });
}

function gameHudDockFrames(dock) {
  return Array.from(dock.querySelectorAll(":scope > .gameHudPanelFrame")).filter(function (frame) {
    return frame.dataset.layoutMode !== "float";
  }).sort(function (left, right) {
    return num(left.style.order, 0) - num(right.style.order, 0);
  });
}

function normalizeDockFrameSizes(frames) {
  if (!frames.length) return [];
  const raw = frames.map(function (frame) {
    const override = gameHudModuleOverride(frame.dataset.moduleId || "") || {};
    return Math.max(0, num(override.sizePct, 0));
  });
  const hasCustom = raw.some(function (value) { return value > 0; });
  if (!hasCustom) return frames.map(function () { return 100 / frames.length; });
  const total = raw.reduce(function (sum, value) { return sum + value; }, 0);
  if (total <= 0) return frames.map(function () { return 100 / frames.length; });
  return raw.map(function (value) {
    return Math.max(GAME_HUD_DOCK_STACK_MIN_PCT, value / total * 100);
  });
}

function applyDockFrameSize(frame, sizePct) {
  const pct = clamp(sizePct, GAME_HUD_DOCK_STACK_MIN_PCT, 100);
  frame.style.setProperty("--hud-panel-basis", pct + "%");
}

function persistDockFrameSize(moduleId, sizePct) {
  if (!moduleId) return;
  setGameHudModuleOverride(moduleId, { sizePct: Math.round(clamp(sizePct, GAME_HUD_DOCK_STACK_MIN_PCT, 100) * 100) / 100 });
}

function createGameHudStackSlider(anchor, before, after) {
  const slider = document.createElement("button");
  slider.type = "button";
  slider.className = "gameHudStackSlider";
  slider.dataset.gameHudStackSlider = "1";
  slider.dataset.gameHudDockAnchor = anchor;
  slider.dataset.beforeModuleId = before.dataset.moduleId || "";
  slider.dataset.afterModuleId = after.dataset.moduleId || "";
  slider.style.order = String((num(before.style.order, 0) + num(after.style.order, 0)) / 2);
  slider.setAttribute("aria-label", "Resize dock panels");
  return slider;
}

function createGameHudTabBar(anchor, frames) {
  const bar = document.createElement("div");
  bar.className = "gameHudDockTabBar";
  bar.style.order = "0";
  const activeId = gameHudDockActiveTab(anchor);
  const activeFrame = frames.find(function (frame) { return frame.dataset.moduleId === activeId; }) || frames[0];
  const activeModuleId = activeFrame?.dataset.moduleId || "";
  for (const frame of frames) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.gameHudTabAnchor = anchor;
    button.dataset.gameHudTabModuleId = frame.dataset.moduleId || "";
    button.className = frame.dataset.moduleId === activeModuleId ? "gameHudDockTab gameHudDockTab--active" : "gameHudDockTab";
    button.textContent = frame.dataset.panelTitle || gameHudPanelTitle({ moduleId: frame.dataset.moduleId, nodeType: frame.dataset.nodeType });
    bar.appendChild(button);
    frame.classList.toggle("gameHudPanelFrame--tabHidden", frame.dataset.moduleId !== activeModuleId);
    applyDockFrameSize(frame, 100);
  }
  if (activeModuleId && activeModuleId !== activeId) {
    const overrides = readGameHudLayoutOverrides();
    ensureGameHudGridOverrides(overrides);
    overrides.grid.dockTabs[anchor] = activeModuleId;
    writeGameHudLayoutOverrides(overrides);
  }
  return bar;
}

function refreshGameHudDockStacks() {
  const elements = state.hudLayout.elements;
  if (!elements || !elements.root) return;
  applyGameHudGridSettings();
  for (const old of Array.from(elements.root.querySelectorAll(".gameHudStackSlider, .gameHudDockTabBar"))) old.remove();
  for (const dock of Object.values(elements.anchors || {})) {
    const anchor = normalizeGameHudAnchor(dock.dataset.hudDock, "left");
    const frames = gameHudDockFrames(dock);
    dock.classList.toggle("gameHudDock--empty", frames.length === 0);
    dock.classList.toggle("gameHudDock--tabs", gameHudDockMode(anchor) === "tabs" && frames.length > 1);
    dock.classList.toggle("gameHudDock--stackSized", gameHudDockMode(anchor) !== "tabs" && frames.length > 1);
    const modeButton = dock.querySelector("[data-game-hud-dock-control='toggle-tabs']");
    if (modeButton) modeButton.textContent = gameHudDockMode(anchor) === "tabs" ? "Rows" : "Tabs";
    for (const frame of frames) frame.classList.remove("gameHudPanelFrame--tabHidden");
    if (gameHudDockMode(anchor) === "tabs" && frames.length > 1) {
      const tools = dock.querySelector(".gameHudDockTools");
      const bar = createGameHudTabBar(anchor, frames);
      if (tools && tools.nextSibling) dock.insertBefore(bar, tools.nextSibling);
      else dock.insertBefore(bar, frames[0] || null);
      continue;
    }
    const sizes = normalizeDockFrameSizes(frames);
    // top/bottom are content-fit docks (CSS ignores --hud-panel-basis there, see
    // styles.css), so a slider to redistribute % height between two stacked panels
    // would just be dead UI - only offer it where the dock has a definite height.
    const stackSliderAllowed = anchor !== "top" && anchor !== "bottom";
    frames.forEach(function (frame, index) {
      applyDockFrameSize(frame, sizes[index] || (100 / frames.length));
      if (stackSliderAllowed && state.hudLayout.editMode === true && index < frames.length - 1) {
        const slider = createGameHudStackSlider(anchor, frame, frames[index + 1]);
        dock.insertBefore(slider, frames[index + 1]);
      }
    });
  }
}

function clearGameHudFamily(family) {
  const elements = ensureGameHudRuntimeRoot();
  const selector = '.gameHudPanelFrame[data-runtime-family="' + String(family || "").replace(/"/g, "") + '"]';
  for (const node of Array.from(elements.root.querySelectorAll(selector))) node.remove();
  scheduleGameHudDockRefresh();
}

function gameHudPanelFromEventTarget(target) {
  return target && typeof target.closest === "function" ? target.closest(".gameHudPanelFrame") : null;
}

function createGameHudPanelChrome(module, layout) {
  const chrome = document.createElement("div");
  chrome.className = "gameHudPanelChrome";
  chrome.dataset.gameHudDrag = "1";
  const smaller = document.createElement("button");
  smaller.type = "button";
  smaller.dataset.gameHudControl = "scale-panel";
  smaller.dataset.gameHudScale = "-1";
  smaller.textContent = "-";
  const larger = document.createElement("button");
  larger.type = "button";
  larger.dataset.gameHudControl = "scale-panel";
  larger.dataset.gameHudScale = "1";
  larger.textContent = "+";
  const reset = document.createElement("button");
  reset.type = "button";
  reset.dataset.gameHudControl = "reset-panel";
  reset.textContent = "Reset";
  chrome.append(smaller, larger, reset);
  return chrome;
}

function applyGameHudPanelLayout(frame, layout) {
  const elements = ensureGameHudRuntimeRoot();
  const anchor = normalizeGameHudAnchor(layout.anchor, "left");
  frame.dataset.hudDock = anchor;
  frame.dataset.layoutMode = layout.mode;
  frame.style.setProperty("--hud-panel-scale", String(layout.scale || 1));
  if (layout.mode === "float") {
    frame.classList.add("gameHudPanelFrame--floating");
    frame.style.left = clamp(num(layout.xPct, 40), 0, 96) + "%";
    frame.style.top = clamp(num(layout.yPct, 40), 0, 96) + "%";
    frame.style.width = clamp(num(layout.widthPct, GAME_HUD_DEFAULT_FLOAT_WIDTH_PCT), GAME_HUD_MIN_PANEL_WIDTH_PCT, 96) + "%";
    frame.style.height = clamp(num(layout.heightPct, GAME_HUD_DEFAULT_FLOAT_HEIGHT_PCT), GAME_HUD_MIN_PANEL_HEIGHT_PCT, 92) + "%";
    elements.root.appendChild(frame);
    return;
  }
  frame.classList.remove("gameHudPanelFrame--floating");
  frame.style.left = "";
  frame.style.top = "";
  frame.style.width = "";
  frame.style.height = "";
  const dock = elements.anchors[anchor] || elements.anchors["left"];
  dock.appendChild(frame);
  scheduleGameHudDockRefresh();
  notifyGameHudPanelSizesChanged();
}

function appendGameHudPanel(family, module, contentNode, fallbackAnchor) {
  if (!contentNode) return null;
  const elements = ensureGameHudRuntimeRoot();
  const moduleId = hudModuleIdentity(module) || family + ":" + Math.random().toString(36).slice(2);
  const layout = resolveGameHudModuleLayout(module, fallbackAnchor);
  const frame = document.createElement("section");
  frame.className = "gameHudPanelFrame";
  frame.dataset.runtimeFamily = family;
  frame.dataset.moduleId = moduleId;
  frame.dataset.nodeType = module?.nodeType || "";
  frame.dataset.panelTitle = gameHudPanelTitle(module);
  frame.dataset.defaultAnchor = normalizeGameHudAnchor(module?.anchor || fallbackAnchor, fallbackAnchor);
  frame.style.order = String(gameHudPanelOrder(module));
  const chrome = createGameHudPanelChrome(module, layout);
  const body = document.createElement("div");
  body.className = "gameHudPanelBody";
  body.appendChild(contentNode);
  const resize = document.createElement("button");
  resize.type = "button";
  resize.className = "gameHudResizeHandle";
  resize.dataset.gameHudResize = "1";
  resize.setAttribute("aria-label", "Resize HUD panel");
  frame.append(chrome, body, resize);
  elements.root.appendChild(frame);
  applyGameHudPanelLayout(frame, layout);
  scheduleGameHudDockRefresh();
  return frame;
}

function floatingLayoutFromPanelRect(panel, base = {}) {
  const viewport = gameHudViewportSize();
  const rect = panel.getBoundingClientRect();
  return Object.assign({}, base, {
    mode: "float",
    xPct: clamp(rect.left / viewport.width * 100, 0, 96),
    yPct: clamp(rect.top / viewport.height * 100, 0, 96),
    widthPct: clamp(rect.width / viewport.width * 100, GAME_HUD_MIN_PANEL_WIDTH_PCT, 96),
    heightPct: clamp(rect.height / viewport.height * 100, GAME_HUD_MIN_PANEL_HEIGHT_PCT, 92)
  });
}

function undockGameHudPanel(panel) {
  if (!panel) return null;
  const moduleId = panel.dataset.moduleId || "";
  const current = gameHudModuleOverride(moduleId) || {};
  const layout = floatingLayoutFromPanelRect(panel, {
    anchor: panel.dataset.hudDock || panel.dataset.defaultAnchor || "left",
    scale: clamp(num(current.scale, 1), 0.55, 1.8)
  });
  setGameHudModuleOverride(moduleId, layout);
  applyGameHudPanelLayout(panel, layout);
  const select = panel.querySelector("[data-game-hud-anchor-select]");
  if (select) select.value = layout.anchor;
  const button = panel.querySelector('[data-game-hud-control="float-panel"], [data-game-hud-control="dock-panel"]');
  if (button) {
    button.dataset.gameHudControl = "dock-panel";
    button.textContent = "Dock";
  }
  return layout;
}

function dockGameHudPanel(panel, anchor = null) {
  if (!panel) return;
  const moduleId = panel.dataset.moduleId || "";
  const nextAnchor = normalizeGameHudAnchor(anchor || panel.dataset.hudDock || panel.dataset.defaultAnchor, "left");
  setGameHudModuleOverride(moduleId, { mode: "dock", anchor: nextAnchor });
  rerenderGameHudPanels();
}

function handleGameHudRuntimeClick(event) {
  const dockControl = event.target && typeof event.target.closest === "function"
    ? event.target.closest("[data-game-hud-dock-control]")
    : null;
  if (dockControl) {
    event.preventDefault();
    event.stopPropagation();
    const anchor = normalizeGameHudAnchor(dockControl.dataset.gameHudDockAnchor, "left");
    setGameHudDockMode(anchor, gameHudDockMode(anchor) === "tabs" ? "stack" : "tabs");
    return;
  }
  const tabButton = event.target && typeof event.target.closest === "function"
    ? event.target.closest("[data-game-hud-tab-module-id]")
    : null;
  if (tabButton) {
    event.preventDefault();
    event.stopPropagation();
    setGameHudDockActiveTab(tabButton.dataset.gameHudTabAnchor, tabButton.dataset.gameHudTabModuleId);
    return;
  }
  const control = event.target && typeof event.target.closest === "function"
    ? event.target.closest("[data-game-hud-control]")
    : null;
  if (control) {
    event.preventDefault();
    event.stopPropagation();
    const command = control.dataset.gameHudControl;
    const panel = gameHudPanelFromEventTarget(control);
    if (command === "toggle") {
      setGameHudEditMode(!state.hudLayout.editMode);
      return;
    }
    if (command === "reset-all") {
      resetGameHudLayoutOverrides();
      rerenderGameHudPanels();
      return;
    }
    if (!panel) return;
    const moduleId = panel.dataset.moduleId || "";
    if (command === "reset-panel") {
      clearGameHudModuleOverride(moduleId);
      rerenderGameHudPanels();
      return;
    }
    if (command === "float-panel") {
      undockGameHudPanel(panel);
      return;
    }
    if (command === "dock-panel") {
      dockGameHudPanel(panel);
      return;
    }
    if (command === "scale-panel") {
      const current = gameHudModuleOverride(moduleId) || {};
      const delta = Number(control.dataset.gameHudScale) > 0 ? GAME_HUD_PANEL_SCALE_STEP : -GAME_HUD_PANEL_SCALE_STEP;
      const nextScale = clamp(num(current.scale, 1) + delta, 0.55, 1.8);
      setGameHudModuleOverride(moduleId, { scale: nextScale });
      panel.style.setProperty("--hud-panel-scale", String(nextScale));
      return;
    }
  }
  const node03Button = event.target && typeof event.target.closest === "function"
    ? event.target.closest("[data-node03-action]")
    : null;
  if (node03Button && !node03Button.disabled) {
    const node03Panel = node03Button.closest(".node03Module");
    const selectedItemId = node03Button.dataset.node03UseSelectedItem === "1"
      ? node03Panel?.querySelector("[data-node03-debug-item-select]")?.value || null
      : null;
    runNode03Action(node03Button.dataset.node03Action, node03Button.dataset.node03TargetId || null, {
      itemId: node03Button.dataset.node03ItemId || selectedItemId || null,
      currencyId: node03Button.dataset.node03CurrencyId || null,
      amount: node03Button.dataset.node03Amount || null
    });
    return;
  }
  const close = event.target && typeof event.target.closest === "function"
    ? event.target.closest("[data-node04-close]")
    : null;
  if (close) {
    state.node04.dialogue = null;
    renderNode04Hud();
    return;
  }
  const node04Button = event.target && typeof event.target.closest === "function"
    ? event.target.closest("[data-node04-action]")
    : null;
  if (node04Button && !node04Button.disabled) {
    runNode04Action(node04Button.dataset.node04Action, node04Button.dataset.node04TargetId || null, {
      questId: node04Button.dataset.node04QuestId || null,
      dialogueId: node04Button.dataset.node04DialogueId || null,
      entryId: node04Button.dataset.node04EntryId || null,
      choiceId: node04Button.dataset.node04ChoiceId || null
    });
    return;
  }
  const node05Button = event.target && typeof event.target.closest === "function"
    ? event.target.closest("[data-node05-action]")
    : null;
  if (node05Button && !node05Button.disabled) {
    runNode05Action(node05Button.dataset.node05Action, {
      targetId: node05Button.dataset.node05TargetId || null,
      stationId: node05Button.dataset.node05StationId || null,
      recipeId: node05Button.dataset.node05RecipeId || null,
      jobId: node05Button.dataset.node05JobId || null,
      vendorId: node05Button.dataset.node05VendorId || null,
      offerId: node05Button.dataset.node05OfferId || null,
      orderId: node05Button.dataset.node05OrderId || null,
      mailId: node05Button.dataset.node05MailId || null,
      inviteId: node05Button.dataset.node05InviteId || null,
      targetPlayerId: node05Button.dataset.node05TargetPlayerId || null,
      itemId: node05Button.dataset.node05ItemId || null,
      currencyId: node05Button.dataset.node05CurrencyId || null,
      quantity: node05Button.dataset.node05Quantity || null,
      unitPriceMinor: node05Button.dataset.node05UnitPriceMinor || null
    });
  }
}

function handleGameHudRuntimeChange(event) {
  const gapInput = event.target && typeof event.target.closest === "function"
    ? event.target.closest("[data-game-hud-gap]")
    : null;
  if (gapInput) {
    event.preventDefault();
    event.stopPropagation();
    setGameHudGridGap(gapInput.value);
    return;
  }
  const select = event.target && typeof event.target.closest === "function"
    ? event.target.closest("[data-game-hud-anchor-select]")
    : null;
  if (!select) return;
  event.preventDefault();
  event.stopPropagation();
  const panel = gameHudPanelFromEventTarget(select);
  if (!panel) return;
  dockGameHudPanel(panel, select.value);
}

function handleGameHudPointerDown(event) {
  if (state.hudLayout.editMode !== true) return;
  const gridSplitter = event.target && typeof event.target.closest === "function"
    ? event.target.closest("[data-game-hud-grid-splitter]")
    : null;
  if (gridSplitter) {
    event.preventDefault();
    event.stopPropagation();
    const kind = gridSplitter.dataset.gameHudGridKind;
    const elements = ensureGameHudRuntimeRoot();
    const grid = gameHudGridOverrides();
    const gridRect = elements.dockGrid.getBoundingClientRect();
    const bandRect = elements.centerBand.getBoundingClientRect();
    let startValue = 0;
    if (kind === "col-left") startValue = grid.columns.left;
    else if (kind === "col-right") startValue = grid.columns.right;
    else if (kind === "top-height") startValue = elements.anchors.top.getBoundingClientRect().height;
    else if (kind === "bottom-height") startValue = elements.anchors.bottom.getBoundingClientRect().height;
    else if (kind === "top-inset-left") startValue = grid.edges.top.insetLeft;
    else if (kind === "top-inset-right") startValue = grid.edges.top.insetRight;
    else if (kind === "bottom-inset-left") startValue = grid.edges.bottom.insetLeft;
    else if (kind === "bottom-inset-right") startValue = grid.edges.bottom.insetRight;
    state.hudLayout.gridResize = {
      pointerId: event.pointerId,
      kind,
      startX: event.clientX,
      startY: event.clientY,
      startValue,
      gridWidth: Math.max(1, gridRect.width),
      bandWidth: Math.max(1, bandRect.width)
    };
    return;
  }
  const stackSlider = event.target && typeof event.target.closest === "function"
    ? event.target.closest("[data-game-hud-stack-slider]")
    : null;
  if (stackSlider) {
    event.preventDefault();
    event.stopPropagation();
    const anchor = normalizeGameHudAnchor(stackSlider.dataset.gameHudDockAnchor, "left");
    const elements = ensureGameHudRuntimeRoot();
    const dock = elements.anchors[anchor];
    const before = dock?.querySelector('.gameHudPanelFrame[data-module-id="' + gameHudCssEscape(stackSlider.dataset.beforeModuleId || "") + '"]') || null;
    const after = dock?.querySelector('.gameHudPanelFrame[data-module-id="' + gameHudCssEscape(stackSlider.dataset.afterModuleId || "") + '"]') || null;
    if (!dock || !before || !after) return;
    const dockRect = dock.getBoundingClientRect();
    state.hudLayout.stackResize = {
      pointerId: event.pointerId,
      anchor,
      before,
      after,
      beforeId: before.dataset.moduleId || "",
      afterId: after.dataset.moduleId || "",
      startY: event.clientY,
      dockHeight: Math.max(1, dockRect.height),
      beforeSize: num((before.style.getPropertyValue("--hud-panel-basis") || "").replace("%", ""), 50),
      afterSize: num((after.style.getPropertyValue("--hud-panel-basis") || "").replace("%", ""), 50)
    };
    return;
  }
  const panel = gameHudPanelFromEventTarget(event.target);
  if (!panel) return;
  const resize = event.target && typeof event.target.closest === "function"
    ? event.target.closest("[data-game-hud-resize]")
    : null;
  const controlTarget = event.target && typeof event.target.closest === "function"
    ? event.target.closest("[data-game-hud-control], [data-game-hud-anchor-select], button, select, input")
    : null;
  const drag = event.target && typeof event.target.closest === "function"
    ? event.target.closest("[data-game-hud-drag]")
    : null;
  if (!resize && controlTarget) return;
  if (!resize && !drag) return;
  event.preventDefault();
  event.stopPropagation();
  if (typeof panel.setPointerCapture === "function") {
    try { panel.setPointerCapture(event.pointerId); } catch {}
  }
  const layout = panel.dataset.layoutMode === "float"
    ? resolveGameHudModuleLayout({ moduleId: panel.dataset.moduleId, anchor: panel.dataset.hudDock }, panel.dataset.defaultAnchor)
    : undockGameHudPanel(panel);
  const viewport = gameHudViewportSize();
  const start = {
    panel: panel,
    moduleId: panel.dataset.moduleId || "",
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    xPct: num(layout?.xPct, 0),
    yPct: num(layout?.yPct, 0),
    widthPct: num(layout?.widthPct, GAME_HUD_DEFAULT_FLOAT_WIDTH_PCT),
    heightPct: num(layout?.heightPct, GAME_HUD_DEFAULT_FLOAT_HEIGHT_PCT),
    anchor: layout?.anchor || panel.dataset.hudDock || panel.dataset.defaultAnchor || "left",
    scale: num(layout?.scale, 1)
  };
  if (resize) state.hudLayout.resize = start;
  else state.hudLayout.drag = start;
}

function handleGameHudPointerMove(event) {
  const gridResize = state.hudLayout.gridResize;
  if (gridResize && gridResize.pointerId === event.pointerId) {
    event.preventDefault();
    const kind = gridResize.kind;
    if (kind === "col-left") {
      setGameHudGridEdge("col-left", gridResize.startValue + (event.clientX - gridResize.startX) / gridResize.gridWidth * 100);
    } else if (kind === "col-right") {
      setGameHudGridEdge("col-right", gridResize.startValue + (gridResize.startX - event.clientX) / gridResize.gridWidth * 100);
    } else if (kind === "top-height") {
      setGameHudGridEdge("top-height", gridResize.startValue + (event.clientY - gridResize.startY));
    } else if (kind === "bottom-height") {
      setGameHudGridEdge("bottom-height", gridResize.startValue + (gridResize.startY - event.clientY));
    } else if (kind === "top-inset-left") {
      setGameHudGridEdge("top-inset-left", gridResize.startValue + (event.clientX - gridResize.startX) / gridResize.bandWidth * 100);
    } else if (kind === "top-inset-right") {
      setGameHudGridEdge("top-inset-right", gridResize.startValue + (gridResize.startX - event.clientX) / gridResize.bandWidth * 100);
    } else if (kind === "bottom-inset-left") {
      setGameHudGridEdge("bottom-inset-left", gridResize.startValue + (event.clientX - gridResize.startX) / gridResize.bandWidth * 100);
    } else if (kind === "bottom-inset-right") {
      setGameHudGridEdge("bottom-inset-right", gridResize.startValue + (gridResize.startX - event.clientX) / gridResize.bandWidth * 100);
    }
    return;
  }
  const stackResize = state.hudLayout.stackResize;
  if (stackResize && stackResize.pointerId === event.pointerId) {
    event.preventDefault();
    const total = stackResize.beforeSize + stackResize.afterSize;
    const delta = (event.clientY - stackResize.startY) / stackResize.dockHeight * 100;
    const before = clamp(stackResize.beforeSize + delta, GAME_HUD_DOCK_STACK_MIN_PCT, Math.max(GAME_HUD_DOCK_STACK_MIN_PCT, total - GAME_HUD_DOCK_STACK_MIN_PCT));
    const after = Math.max(GAME_HUD_DOCK_STACK_MIN_PCT, total - before);
    applyDockFrameSize(stackResize.before, before);
    applyDockFrameSize(stackResize.after, after);
    stackResize.nextBeforeSize = before;
    stackResize.nextAfterSize = after;
    return;
  }
  const active = state.hudLayout.drag || state.hudLayout.resize;
  if (!active || active.pointerId !== event.pointerId) return;
  event.preventDefault();
  const dxPct = (event.clientX - active.startX) / active.viewportWidth * 100;
  const dyPct = (event.clientY - active.startY) / active.viewportHeight * 100;
  const patch = state.hudLayout.resize ? {
    mode: "float",
    anchor: active.anchor,
    scale: active.scale,
    xPct: active.xPct,
    yPct: active.yPct,
    widthPct: clamp(active.widthPct + dxPct, GAME_HUD_MIN_PANEL_WIDTH_PCT, Math.max(GAME_HUD_MIN_PANEL_WIDTH_PCT, 96 - active.xPct)),
    heightPct: clamp(active.heightPct + dyPct, GAME_HUD_MIN_PANEL_HEIGHT_PCT, Math.max(GAME_HUD_MIN_PANEL_HEIGHT_PCT, 92 - active.yPct))
  } : {
    mode: "float",
    anchor: active.anchor,
    scale: active.scale,
    xPct: clamp(active.xPct + dxPct, 0, 96),
    yPct: clamp(active.yPct + dyPct, 0, 96),
    widthPct: active.widthPct,
    heightPct: active.heightPct
  };
  applyGameHudPanelLayout(active.panel, patch);
}

function finishGameHudPointerEdit(event) {
  const gridResize = state.hudLayout.gridResize;
  if (gridResize && event.pointerId === gridResize.pointerId) {
    state.hudLayout.gridResize = null;
    applyGameHudGridSettings();
    refreshGameHudDockStacks();
    return;
  }
  const stackResize = state.hudLayout.stackResize;
  if (stackResize && event.pointerId === stackResize.pointerId) {
    persistDockFrameSize(stackResize.beforeId, stackResize.nextBeforeSize || stackResize.beforeSize);
    persistDockFrameSize(stackResize.afterId, stackResize.nextAfterSize || stackResize.afterSize);
    state.hudLayout.stackResize = null;
    refreshGameHudDockStacks();
    notifyGameHudPanelSizesChanged();
    return;
  }
  const active = state.hudLayout.drag || state.hudLayout.resize;
  if (!active || event.pointerId !== active.pointerId) return;
  const panel = active.panel;
  if (state.hudLayout.drag) {
    const dockAnchor = gameHudAnchorFromPoint(event.clientX, event.clientY);
    if (dockAnchor && dockAnchor !== "center") {
      setGameHudModuleOverride(active.moduleId, {
        mode: "dock",
        anchor: dockAnchor,
        scale: active.scale
      });
      state.hudLayout.drag = null;
      state.hudLayout.resize = null;
      rerenderGameHudPanels();
      notifyGameHudPanelSizesChanged();
      return;
    }
    // "center" is float-only - fall through to the floating-position persist below,
    // just tagged with anchor "center" instead of wherever it was dragged from.
    if (dockAnchor === "center") active.anchor = "center";
  }
  const viewport = gameHudViewportSize();
  const rect = panel.getBoundingClientRect();
  setGameHudModuleOverride(active.moduleId, {
    mode: "float",
    anchor: active.anchor,
    scale: active.scale,
    xPct: clamp(rect.left / viewport.width * 100, 0, 96),
    yPct: clamp(rect.top / viewport.height * 100, 0, 96),
    widthPct: clamp(rect.width / viewport.width * 100, GAME_HUD_MIN_PANEL_WIDTH_PCT, 96),
    heightPct: clamp(rect.height / viewport.height * 100, GAME_HUD_MIN_PANEL_HEIGHT_PCT, 92)
  });
  state.hudLayout.drag = null;
  state.hudLayout.resize = null;
  notifyGameHudPanelSizesChanged();
}

function clonePosition(position) {
  if (!position) return null;
  return {
    playerId: position.playerId || position.player_id || null,
    x: num(position.x, 0),
    y: num(position.y, 0),
    z: num(position.z, 0),
    rotationY: Number.isFinite(Number(position.rotationY)) ? num(position.rotationY, 0) : 0,
    revision: Number(position.revision) || 0,
    updatedAt: position.updatedAt || position.updated_at || null,
    sourceSessionId: position.sourceSessionId || position.lastUpdateSourceSessionId || null,
    sourceDevice: position.sourceDevice || null,
    clientSessionId: position.clientSessionId || position.client_session_id || null,
    clientInputSeq: Number(position.clientInputSeq || position.client_input_seq || 0) || 0,
    clientIntentId: position.clientIntentId || position.client_intent_id || null,
    clientSentAt: Number.isFinite(Number(position.clientSentAt || position.client_sent_at)) ? num(position.clientSentAt || position.client_sent_at, 0) : null,
    serverReceivedAt: Number.isFinite(Number(position.serverReceivedAt || position.server_received_at)) ? num(position.serverReceivedAt || position.server_received_at, 0) : null,
    serverSentAtMs: Number.isFinite(Number(position.serverSentAtMs || position.server_sent_at_ms)) ? num(position.serverSentAtMs || position.server_sent_at_ms, 0) : null,
    serverTimeMs: Number.isFinite(Number(position.serverTimeMs || position.server_time_ms)) ? num(position.serverTimeMs || position.server_time_ms, 0) : null,
    serverSeq: Number.isFinite(Number(position.serverSeq || position.server_seq)) ? num(position.serverSeq || position.server_seq, 0) : 0,
    snapshotSeq: Number.isFinite(Number(position.snapshotSeq || position.snapshot_seq)) ? num(position.snapshotSeq || position.snapshot_seq, 0) : 0,
    serverTick: Number.isFinite(Number(position.serverTick || position.server_tick)) ? num(position.serverTick || position.server_tick, 0) : 0,
    lastProcessedInputSeq: Number(position.lastProcessedInputSeq || position.last_processed_input_seq || 0) || 0,
    controllerEpoch: Number(position.controllerEpoch || position.controller_epoch || 0) || 0,
    activeControllerSessionId: position.activeControllerSessionId || position.active_controller_session_id || null,
    transport: position.transport || null,
    animationState: ANIMATION_STATES.has(position.animationState) ? position.animationState : null,
    moving: typeof position.moving === "boolean" ? position.moving : null,
    teleport: position.teleport === true,
    velocityX: Number.isFinite(Number(position.velocityX || position.velocity_x)) ? num(position.velocityX || position.velocity_x, 0) : 0,
    velocityZ: Number.isFinite(Number(position.velocityZ || position.velocity_z)) ? num(position.velocityZ || position.velocity_z, 0) : 0
  };
}

function normalizeRemotePlayerPayload(payload) {
  const raw = payload && typeof payload === "object" ? payload : {};
  const positionSource = raw.position && typeof raw.position === "object" ? raw.position : raw;
  const playerId = typeof raw.playerId === "string" && raw.playerId.trim()
    ? raw.playerId.trim()
    : typeof raw.player_id === "string" && raw.player_id.trim()
      ? raw.player_id.trim()
      : null;
  const userId = typeof raw.userId === "string" && raw.userId.trim()
    ? raw.userId.trim()
    : typeof raw.user_id === "string" && raw.user_id.trim()
      ? raw.user_id.trim()
      : null;
  const worldId = typeof raw.worldId === "string" && raw.worldId.trim()
    ? raw.worldId.trim()
    : typeof raw.world_id === "string" && raw.world_id.trim()
      ? raw.world_id.trim()
      : state.worldId || null;
  const displayName = typeof raw.displayName === "string" && raw.displayName.trim()
    ? raw.displayName.trim()
    : typeof raw.display_name === "string" && raw.display_name.trim()
      ? raw.display_name.trim()
      : null;
  const selectedCharacterId = raw.selectedCharacterId !== undefined
    ? raw.selectedCharacterId
    : raw.selected_character_id !== undefined
      ? raw.selected_character_id
      : null;
  const position = clonePosition({
    playerId: raw.playerId ?? raw.player_id ?? positionSource.playerId ?? positionSource.player_id ?? null,
    x: positionSource.x,
    y: positionSource.y,
    z: positionSource.z,
    rotationY: positionSource.rotationY,
    revision: raw.revision ?? positionSource.revision,
    updatedAt: raw.updatedAt ?? raw.updated_at ?? positionSource.updatedAt ?? positionSource.updated_at ?? null,
    sourceSessionId: raw.sourceSessionId ?? raw.source_session_id ?? positionSource.sourceSessionId ?? positionSource.source_session_id ?? null,
    sourceDevice: raw.sourceDevice ?? raw.source_device ?? positionSource.sourceDevice ?? positionSource.source_device ?? null,
    serverReceivedAt: raw.serverReceivedAt ?? raw.server_received_at ?? positionSource.serverReceivedAt ?? positionSource.server_received_at ?? null,
    serverSentAtMs: raw.serverSentAtMs ?? raw.server_sent_at_ms ?? positionSource.serverSentAtMs ?? positionSource.server_sent_at_ms ?? null,
    serverTimeMs: raw.serverTimeMs ?? raw.server_time_ms ?? positionSource.serverTimeMs ?? positionSource.server_time_ms ?? null,
    serverSeq: raw.serverSeq ?? raw.server_seq ?? positionSource.serverSeq ?? positionSource.server_seq ?? 0,
    clientSentAt: raw.clientSentAt ?? raw.client_sent_at ?? positionSource.clientSentAt ?? positionSource.client_sent_at ?? null,
    animationState: raw.animationState ?? raw.animation_state ?? positionSource.animationState ?? positionSource.animation_state ?? null,
    moving: typeof raw.moving === "boolean" ? raw.moving : typeof positionSource.moving === "boolean" ? positionSource.moving : null,
    lastProcessedInputSeq: raw.lastProcessedInputSeq ?? raw.last_processed_input_seq ?? positionSource.lastProcessedInputSeq ?? positionSource.last_processed_input_seq ?? 0,
    snapshotSeq: raw.snapshotSeq ?? raw.snapshot_seq ?? positionSource.snapshotSeq ?? positionSource.snapshot_seq ?? 0,
    serverTick: raw.serverTick ?? raw.server_tick ?? positionSource.serverTick ?? positionSource.server_tick ?? 0,
    activeControllerSessionId: raw.activeControllerSessionId ?? raw.active_controller_session_id ?? positionSource.activeControllerSessionId ?? positionSource.active_controller_session_id ?? null,
    controllerEpoch: raw.controllerEpoch ?? raw.controller_epoch ?? positionSource.controllerEpoch ?? positionSource.controller_epoch ?? 0,
    teleport: raw.teleport === true || positionSource.teleport === true,
    velocityX: raw.velocityX ?? raw.velocity_x ?? positionSource.velocityX ?? positionSource.velocity_x ?? 0,
    velocityZ: raw.velocityZ ?? raw.velocity_z ?? positionSource.velocityZ ?? positionSource.velocity_z ?? 0
  });
  const revision = Math.max(0, Math.floor(Number(raw.revision ?? position.revision ?? 0)) || 0);
  const connectedSessionCount = Math.max(0, Math.floor(Number(raw.connectedSessionCount ?? raw.connected_session_count ?? 0)) || 0);
  const serverSeq = Math.max(0, Math.floor(Number(raw.serverSeq ?? raw.server_seq ?? position.serverSeq ?? 0)) || 0);
  const serverTimeMs = Number.isFinite(Number(raw.serverTimeMs ?? raw.server_time_ms ?? position.serverTimeMs ?? 0))
    ? num(raw.serverTimeMs ?? raw.server_time_ms ?? position.serverTimeMs ?? 0, 0)
    : null;
  const serverSentAtMs = Number.isFinite(Number(raw.serverSentAtMs ?? raw.server_sent_at_ms ?? position.serverSentAtMs ?? 0))
    ? num(raw.serverSentAtMs ?? raw.server_sent_at_ms ?? position.serverSentAtMs ?? 0, 0)
    : null;
  const serverReceivedAt = Number.isFinite(Number(raw.serverReceivedAt ?? raw.server_received_at ?? position.serverReceivedAt ?? 0))
    ? num(raw.serverReceivedAt ?? raw.server_received_at ?? position.serverReceivedAt ?? 0, 0)
    : null;
  const clientSentAt = Number.isFinite(Number(raw.clientSentAt ?? raw.client_sent_at ?? position.clientSentAt ?? 0))
    ? num(raw.clientSentAt ?? raw.client_sent_at ?? position.clientSentAt ?? 0, 0)
    : null;
  const animationState = ANIMATION_STATES.has(String(raw.animationState || raw.animation_state || position.animationState || "").trim())
    ? String(raw.animationState || raw.animation_state || position.animationState || "").trim()
    : null;
  const moving = typeof raw.moving === "boolean" ? raw.moving : typeof position.moving === "boolean" ? position.moving : null;
  return {
    playerId: playerId,
    userId: userId,
    worldId: worldId,
    displayName: displayName,
    selectedCharacterId: selectedCharacterId,
    position: position,
    revision: revision,
    updatedAt: raw.updatedAt || raw.updated_at || position.updatedAt || null,
    serverSeq: serverSeq,
    serverTimeMs: serverTimeMs,
    serverSentAtMs: serverSentAtMs,
    serverReceivedAt: serverReceivedAt,
    clientSentAt: clientSentAt,
    animationState: animationState,
    moving: moving,
    connectedSessionCount: connectedSessionCount,
    isSelfAccount: raw.isSelfAccount === true || raw.is_self_account === true,
    sourceSessionId: raw.sourceSessionId || raw.source_session_id || position.sourceSessionId || null,
    sourceDevice: raw.sourceDevice || raw.source_device || position.sourceDevice || null,
    activeControllerSessionId: raw.activeControllerSessionId ?? raw.active_controller_session_id ?? position.activeControllerSessionId ?? position.active_controller_session_id ?? null,
    controllerEpoch: Number(raw.controllerEpoch ?? raw.controller_epoch ?? position.controllerEpoch ?? position.controller_epoch ?? 0) || 0
  };
}

function interpolateRemoteAngle(start, end, t) {
  const from = num(start, 0);
  const to = num(end, from);
  let diff = ((to - from + 180) % 360) - 180;
  if (diff < -180) diff += 360;
  return from + diff * clamp(t, 0, 1);
}

function cloneRemotePosition(position) {
  if (!position) return null;
  return {
    x: num(position.x, 0),
    y: num(position.y, 0),
    z: num(position.z, 0),
    rotationY: num(position.rotationY, 0)
  };
}

function remoteSampleDistance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(num(a.x, 0) - num(b.x, 0), num(a.z, 0) - num(b.z, 0));
}

function remoteSampleTimelineMs(sample) {
  if (!sample) return 0;
  if (Number.isFinite(Number(sample.serverSentAtMs))) return num(sample.serverSentAtMs, 0);
  if (Number.isFinite(Number(sample.serverTimeMs))) return num(sample.serverTimeMs, 0);
  if (Number.isFinite(Number(sample.serverReceivedAt))) return num(sample.serverReceivedAt, 0);
  if (Number.isFinite(Number(sample.receivedAtEpoch))) return num(sample.receivedAtEpoch, 0);
  return Number.isFinite(Number(sample.receivedAt)) ? num(sample.receivedAt, 0) : 0;
}

function remoteSampleArrivalEpochMs(sample) {
  if (!sample) return 0;
  if (Number.isFinite(Number(sample.receivedAtEpoch))) return num(sample.receivedAtEpoch, 0);
  if (Number.isFinite(Number(sample.serverSentAtMs))) return num(sample.serverSentAtMs, 0);
  if (Number.isFinite(Number(sample.serverTimeMs))) return num(sample.serverTimeMs, 0);
  if (Number.isFinite(Number(sample.receivedAt))) return epochNow(sample.receivedAt);
  return 0;
}

function estimateServerEpochNow(now = performance.now()) {
  return epochNow(now) + Number(state.net.clockOffsetMs || 0);
}

function updateClockOffsetFromServerMessage(message, packetAt = performance.now()) {
  const serverTimeMs = Number(message?.serverTimeMs);
  if (!Number.isFinite(serverTimeMs)) return null;
  const sampleOffset = serverTimeMs - epochNow(packetAt);
  if (!Number.isFinite(sampleOffset)) return null;
  const current = Number(state.net.clockOffsetMs || 0);
  state.net.clockOffsetMs = current ? round((current * 0.9) + (sampleOffset * 0.1)) : round(sampleOffset);
  return state.net.clockOffsetMs;
}

function pushSnapshotInterval(intervalMs) {
  const value = Number(intervalMs);
  if (!Number.isFinite(value) || value < 0) return null;
  const rounded = round(value);
  state.remote.lastSnapshotIntervals.push(rounded);
  if (state.remote.lastSnapshotIntervals.length > 32) {
    state.remote.lastSnapshotIntervals = state.remote.lastSnapshotIntervals.slice(-32);
  }
  const values = state.remote.lastSnapshotIntervals;
  const average = values.length ? values.reduce(function (sum, item) { return sum + Number(item || 0); }, 0) / values.length : 0;
  state.remote.avgSnapshotIntervalMs = round(average);
  state.remote.maxSnapshotIntervalMs = values.length ? round(values.reduce(function (max, item) { return Math.max(max, Number(item) || 0); }, 0)) : 0;
  return rounded;
}

function recordRemoteVisualMetrics(entry, renderPosition, renderTime, serverNowEpoch) {
  if (!entry) return null;
  const previousRender = entry.renderState?.position || entry.position || null;
  const previousTime = Number(entry.lastRenderAt) || 0;
  const nextPosition = renderPosition ? cloneRemotePosition(renderPosition) : null;
  const delta = previousRender && nextPosition ? remoteSampleDistance(previousRender, nextPosition) : 0;
  const elapsedMs = previousTime > 0 ? Math.max(0, Number(performance.now()) - previousTime) : 0;
  const movedThisFrame = delta > 0.001;
  const visualFreezeMs = !movedThisFrame && entry.moving === true && previousTime > 0 ? elapsedMs : 0;
  const observerLagMs = Number.isFinite(Number(serverNowEpoch)) && Number.isFinite(Number(renderTime))
    ? Math.max(0, Number(serverNowEpoch) - Number(renderTime))
    : 0;
  const visualVelocity = elapsedMs > 0 ? (delta / elapsedMs) * 1000 : 0;
  entry.lastRenderAt = performance.now();
  entry.visualFreezeMs = visualFreezeMs;
  entry.observerLagMs = observerLagMs;
  entry.visualVelocity = visualVelocity;
  entry.maxRemoteJump = Math.max(Number(entry.maxRemoteJump) || 0, delta);
  entry.maxVisualFreezeMs = Math.max(Number(entry.maxVisualFreezeMs) || 0, visualFreezeMs);
  entry.maxObserverLagMs = Math.max(Number(entry.maxObserverLagMs) || 0, observerLagMs);
  state.remote.maxRemoteJump = Math.max(Number(state.remote.maxRemoteJump) || 0, delta);
  state.remote.maxVisualFreezeMs = Math.max(Number(state.remote.maxVisualFreezeMs) || 0, visualFreezeMs);
  state.remote.maxObserverLagMs = Math.max(Number(state.remote.maxObserverLagMs) || 0, observerLagMs);
  return {
    visualFreezeMs: visualFreezeMs,
    observerLagMs: observerLagMs,
    visualVelocity: visualVelocity,
    maxRemoteJump: Number(entry.maxRemoteJump) || 0
  };
}

function chooseRemoteAnimationState(entry, sampleA, sampleB, interpolatedPosition, renderTime) {
  const incomingBState = ANIMATION_STATES.has(String(sampleB?.animationState || "").trim()) ? String(sampleB.animationState).trim() : null;
  const incomingAState = ANIMATION_STATES.has(String(sampleA?.animationState || "").trim()) ? String(sampleA.animationState).trim() : null;
  const incomingMoving = typeof sampleB?.moving === "boolean" ? sampleB.moving : typeof sampleA?.moving === "boolean" ? sampleA.moving : null;
  if (incomingMoving === false) return "idle";
  if (incomingMoving === true && incomingBState === "run") return "run";
  if (incomingMoving === true && incomingBState === "idle") return "walk";
  if (incomingMoving === true) return incomingBState === "run" ? "run" : "walk";
  if (incomingAState === "run" || incomingBState === "run") return "run";
  if (incomingAState === "walk" || incomingBState === "walk") return "walk";
  if (sampleA && sampleB) {
    const dt = Math.max(1, remoteSampleTimelineMs(sampleB) - remoteSampleTimelineMs(sampleA));
    const distance = remoteSampleDistance(sampleA.position, sampleB.position);
    const speed = (distance / dt) * 1000;
    if (speed > 5.6) return "run";
    if (speed > 0.05) return "walk";
  }
  if (interpolatedPosition && entry?.position) {
    const delta = remoteSampleDistance(entry.position, interpolatedPosition);
    if (delta > 0.05) return "walk";
  }
  return "idle";
}

function remoteWorldMatches(worldId) {
  if (!worldId || !state.worldId) return true;
  return String(worldId) === String(state.worldId);
}

function pruneRemoteInterpolationBuffer(entry, now = performance.now()) {
  if (!entry) return [];
  const sourceBuffer = Array.isArray(entry.snapshots)
    ? entry.snapshots
    : Array.isArray(entry.interpolationBuffer)
      ? entry.interpolationBuffer
      : [];
  const buffer = sourceBuffer.filter(function (sample) {
    return sample && sample.position;
  }).sort(function (left, right) {
    return remoteSampleTimelineMs(left) - remoteSampleTimelineMs(right);
  });
  if (!buffer.length) {
    entry.snapshots = [];
    entry.interpolationBuffer = entry.snapshots;
    return entry.snapshots;
  }
  const cutoff = Math.max(0, epochNow(Number(now) || performance.now()) - REMOTE_INTERPOLATION_SAMPLE_TTL_MS);
  const next = [];
  for (let index = 0; index < buffer.length; index += 1) {
    const sample = buffer[index];
    const isLastSample = index === buffer.length - 1;
    const sampleAgeEpoch = remoteSampleArrivalEpochMs(sample);
    if (isLastSample || sampleAgeEpoch >= cutoff) {
      next.push(sample);
    }
  }
  const limited = next.length > REMOTE_INTERPOLATION_BUFFER_LIMIT
    ? next.slice(-REMOTE_INTERPOLATION_BUFFER_LIMIT)
    : next;
  const dropped = Math.max(0, buffer.length - limited.length);
  if (dropped > 0) {
    entry.droppedRemoteSamples = (entry.droppedRemoteSamples || 0) + dropped;
    state.remote.droppedRemoteSamples = (state.remote.droppedRemoteSamples || 0) + dropped;
  }
  entry.snapshots = limited;
  entry.interpolationBuffer = entry.snapshots;
  return limited;
}

function snapshotRemoteEntry(entry) {
  if (!entry) return null;
  const buffer = pruneRemoteInterpolationBuffer(entry);
  const latestSample = buffer.length ? buffer[buffer.length - 1] : null;
  const renderState = entry.renderState || null;
  const renderPosition = renderState?.position || entry.position || latestSample?.position || null;
  return {
    playerId: entry.playerId,
    userId: entry.userId,
    worldId: entry.worldId,
    displayName: entry.displayName,
    selectedCharacterId: entry.selectedCharacterId || null,
    position: renderPosition ? cloneRemotePosition(renderPosition) : null,
    previousPosition: renderState?.previousPosition ? cloneRemotePosition(renderState.previousPosition) : (entry.previousPosition ? cloneRemotePosition(entry.previousPosition) : null),
    targetPosition: renderState?.targetPosition ? cloneRemotePosition(renderState.targetPosition) : (entry.targetPosition ? cloneRemotePosition(entry.targetPosition) : null),
    renderState: renderState ? {
      position: renderState.position ? cloneRemotePosition(renderState.position) : null,
      previousPosition: renderState.previousPosition ? cloneRemotePosition(renderState.previousPosition) : null,
      targetPosition: renderState.targetPosition ? cloneRemotePosition(renderState.targetPosition) : null,
      revision: Number(renderState.revision) || 0,
      updatedAt: renderState.updatedAt || null,
      animationState: renderState.animationState || "idle",
      moving: renderState.moving === true,
      snapshotSeq: Number(renderState.snapshotSeq) || 0,
      lastSnapshotAt: Number(renderState.lastSnapshotAt) || 0,
      visualFreezeMs: Number(renderState.visualFreezeMs) || 0,
      observerLagMs: Number(renderState.observerLagMs) || 0,
      visualVelocity: Number(renderState.visualVelocity) || 0,
      maxRemoteJump: Number(renderState.maxRemoteJump || renderState.maxJumpMs || 0) || 0,
      maxJumpMs: Number(renderState.maxRemoteJump || renderState.maxJumpMs || 0) || 0,
      teleport: renderState.teleport === true
    } : null,
    latestSamplePosition: latestSample?.position ? cloneRemotePosition(latestSample.position) : null,
    serverSeq: Number(entry.serverSeq) || 0,
    serverTimeMs: Number(entry.serverTimeMs) || null,
    serverReceivedAt: Number(entry.serverReceivedAt) || null,
    serverSentAtMs: Number(entry.serverSentAtMs) || null,
    clientSentAt: Number(entry.clientSentAt) || null,
    revision: Number(entry.revision) || 0,
    updatedAt: entry.updatedAt || null,
    animationState: entry.animationState || "idle",
    moving: entry.moving === true,
    connectedSessionCount: Number(entry.connectedSessionCount) || 0,
    clockOffsetMs: Number(entry.clockOffsetMs) || 0,
    latestRemoteSampleAgeMs: Number.isFinite(Number(entry.latestRemoteSampleAgeMs)) ? Number(entry.latestRemoteSampleAgeMs) : null,
    interpolationBacklogMs: Number.isFinite(Number(entry.interpolationBacklogMs)) ? Number(entry.interpolationBacklogMs) : null,
    remoteRenderDelayMs: Number.isFinite(Number(entry.remoteRenderDelayMs)) ? Number(entry.remoteRenderDelayMs) : null,
    lastPacketAt: Number(entry.lastPacketAt) || 0,
    lastRenderAt: Number(entry.lastRenderAt) || 0,
    lastTeleportAt: Number(entry.lastTeleportAt) || 0,
    lastSnapshotSeq: Number(entry.lastSnapshotSeq || latestSample?.snapshotSeq || 0) || 0,
    lastSnapshotAt: Number(entry.lastSnapshotAt || 0) || 0,
    lastSnapshotServerTimeMs: Number(entry.lastSnapshotServerTimeMs || latestSample?.serverTimeMs || 0) || 0,
    activeControllerSessionId: entry.activeControllerSessionId || latestSample?.activeControllerSessionId || null,
    controllerEpoch: Math.max(Number(entry.controllerEpoch) || 0, Number(latestSample?.controllerEpoch || 0) || 0),
    lastProcessedInputSeq: Math.max(Number(entry.lastProcessedInputSeq) || 0, Number(latestSample?.lastProcessedInputSeq || 0) || 0),
    visualFreezeMs: Number(entry.visualFreezeMs) || 0,
    observerLagMs: Number(entry.observerLagMs) || 0,
    visualVelocity: Number(entry.visualVelocity) || 0,
    maxRemoteJump: Number(entry.maxRemoteJump || entry.maxJumpMs || 0) || 0,
    maxJumpMs: Number(entry.maxRemoteJump || entry.maxJumpMs || 0) || 0,
    snapshotIntervalMs: Number.isFinite(Number(entry.snapshotIntervalMs)) ? Number(entry.snapshotIntervalMs) : 0,
    maxSnapshotIntervalMs: Number.isFinite(Number(entry.maxSnapshotIntervalMs)) ? Number(entry.maxSnapshotIntervalMs) : 0,
    droppedStaleUpdates: Number(entry.droppedStaleUpdates) || 0,
    droppedRemoteSamples: Number(entry.droppedRemoteSamples) || 0,
    hardSnapCount: Number(entry.hardSnapCount) || 0,
    smoothFrameCount: Number(entry.smoothFrameCount) || 0,
    remoteCatchupCount: Number(entry.remoteCatchupCount) || 0,
    lastRemoteEventType: entry.lastRemoteEventType || null,
    bufferSize: buffer.length,
    snapshotsLength: buffer.length,
    interpolationBufferLength: buffer.length,
    snapshots: buffer.map(function (sample) {
      return {
        position: sample.position ? cloneRemotePosition(sample.position) : null,
        revision: Number(sample.revision) || 0,
        updatedAt: sample.updatedAt || null,
        animationState: sample.animationState || null,
        moving: sample.moving === true,
        receivedAt: Number(sample.receivedAt) || 0,
        receivedAtEpoch: Number(sample.receivedAtEpoch) || 0,
        snapshotSeq: Number(sample.snapshotSeq) || 0,
        serverTick: Number(sample.serverTick) || 0,
        serverSeq: Number(sample.serverSeq) || 0,
        serverTimeMs: Number(sample.serverTimeMs) || null,
        serverSentAtMs: Number(sample.serverSentAtMs) || null,
        serverReceivedAt: Number(sample.serverReceivedAt) || null,
        clientSentAt: Number(sample.clientSentAt) || null,
        lastProcessedInputSeq: Math.max(0, Number(sample.lastProcessedInputSeq) || 0),
        activeControllerSessionId: sample.activeControllerSessionId || null,
        controllerEpoch: Math.max(0, Number(sample.controllerEpoch) || 0),
        teleport: sample.teleport === true,
        velocityX: Number(sample.velocityX) || 0,
        velocityZ: Number(sample.velocityZ) || 0,
        sourceSessionId: sample.sourceSessionId || null,
        sourceDevice: sample.sourceDevice || null
      };
    }),
    interpolationBuffer: buffer.map(function (sample) {
      return {
        position: sample.position ? cloneRemotePosition(sample.position) : null,
        revision: Number(sample.revision) || 0,
        updatedAt: sample.updatedAt || null,
        animationState: sample.animationState || null,
        moving: sample.moving === true,
        receivedAt: Number(sample.receivedAt) || 0,
        receivedAtEpoch: Number(sample.receivedAtEpoch) || 0,
        snapshotSeq: Number(sample.snapshotSeq) || 0,
        serverTick: Number(sample.serverTick) || 0,
        serverSeq: Number(sample.serverSeq) || 0,
        serverTimeMs: Number(sample.serverTimeMs) || null,
        serverSentAtMs: Number(sample.serverSentAtMs) || null,
        serverReceivedAt: Number(sample.serverReceivedAt) || null,
        clientSentAt: Number(sample.clientSentAt) || null,
        lastProcessedInputSeq: Number(sample.lastProcessedInputSeq) || 0,
        activeControllerSessionId: sample.activeControllerSessionId || null,
        controllerEpoch: Number(sample.controllerEpoch) || 0,
        teleport: sample.teleport === true,
        velocityX: Number(sample.velocityX) || 0,
        velocityZ: Number(sample.velocityZ) || 0,
        sourceSessionId: sample.sourceSessionId || null,
        sourceDevice: sample.sourceDevice || null
      };
    }),
    object: entry.object || entry.root || null,
    root: entry.root || entry.object || null
  };
}

function removeRemoteEntryRuntime(entry) {
  if (!entry) return false;
  if (entry.root && typeof entry.root.parent?.remove === "function") {
    entry.root.parent.remove(entry.root);
  } else if (entry.object && typeof entry.object.parent?.remove === "function") {
    entry.object.parent.remove(entry.object);
  }
  if (state.runtime && typeof state.runtime.removeRemotePlayer === "function") {
    try { state.runtime.removeRemotePlayer(entry.playerId); } catch {}
  }
  return true;
}

function remoteSampleIsStale(entry, sample, options = {}) {
  if (!sample) return true;
  if (!remoteWorldMatches(sample.worldId)) return true;
  const tombstone = state.remote.tombstones.get(sample.playerId) || null;
  const canResetTombstone = options.reset === true || options.type === "world:presence_snapshot" || options.type === "remote_player:joined";
  if (tombstone && !canResetTombstone) return true;
  if (!entry) return false;
  if (options.reset === true) return false;
  const currentSnapshotSeq = Number(entry.lastSnapshotSeq || entry.serverSeq || 0) || 0;
  const nextSnapshotSeq = Number(sample.snapshotSeq || sample.serverSeq || 0) || 0;
  if (currentSnapshotSeq && nextSnapshotSeq) {
    if (nextSnapshotSeq < currentSnapshotSeq) return true;
    if (nextSnapshotSeq > currentSnapshotSeq) return false;
  }
  const currentRevision = Number(entry.revision) || 0;
  const nextRevision = Number(sample.revision) || 0;
  if (nextRevision < currentRevision) return true;
  if (nextRevision > currentRevision) return false;
  const currentServerTime = Number(entry.lastSnapshotServerTimeMs || entry.serverTimeMs || 0) || 0;
  const nextServerTime = Number(sample.serverTimeMs) || 0;
  if (currentServerTime && nextServerTime) {
    if (nextServerTime < currentServerTime) return true;
    if (nextServerTime > currentServerTime) return false;
  }
  const currentUpdatedAt = String(entry.updatedAt || "");
  const nextUpdatedAt = String(sample.updatedAt || "");
  if (currentUpdatedAt && nextUpdatedAt && nextUpdatedAt <= currentUpdatedAt) return true;
  return false;
}

function upsertRemotePlayerEntry(payload, options = {}) {
  const sample = normalizeRemotePlayerPayload(payload);
  if (!sample.playerId || !sample.worldId) return null;
  if (!remoteWorldMatches(sample.worldId)) {
    state.remote.droppedStaleUpdates += 1;
    return null;
  }
  const now = performance.now();
  const canResetTombstone = options.reset === true || options.type === "world:presence_snapshot" || options.type === "remote_player:joined";
  const tombstone = state.remote.tombstones.get(sample.playerId) || null;
  if (tombstone && !canResetTombstone) {
    state.remote.droppedStaleUpdates += 1;
    return null;
  }
  if (canResetTombstone && tombstone) {
    state.remote.tombstones.delete(sample.playerId);
  }
  let entry = state.remote.players.get(sample.playerId) || null;
  if (!entry) {
    entry = {
      playerId: sample.playerId,
      userId: sample.userId || null,
      worldId: sample.worldId,
      displayName: sample.displayName || sample.playerId,
      selectedCharacterId: sample.selectedCharacterId || null,
      position: null,
      previousPosition: null,
      targetPosition: null,
      latestSamplePosition: null,
      renderState: null,
      revision: 0,
      updatedAt: null,
      animationState: "idle",
      moving: false,
      connectedSessionCount: sample.connectedSessionCount || 0,
      serverSeq: Number(sample.serverSeq) || 0,
      snapshotSeq: Number(sample.snapshotSeq || sample.serverSeq || 0) || 0,
      serverTimeMs: Number(sample.serverTimeMs) || null,
      serverReceivedAt: Number(sample.serverReceivedAt) || null,
      serverSentAtMs: Number(sample.serverSentAtMs) || null,
      clientSentAt: Number(sample.clientSentAt) || null,
      lastPacketAt: now,
      lastRenderAt: 0,
      lastSnapshotAt: 0,
      lastSnapshotServerTimeMs: Number(sample.serverTimeMs) || null,
      lastSnapshotSeq: Number(sample.snapshotSeq || sample.serverSeq || 0) || 0,
      activeControllerSessionId: sample.activeControllerSessionId || null,
      controllerEpoch: Number(sample.controllerEpoch) || 0,
      lastProcessedInputSeq: Number(sample.lastProcessedInputSeq) || 0,
      snapshotIntervalMs: 0,
      visualFreezeMs: 0,
      maxVisualFreezeMs: 0,
      observerLagMs: 0,
      maxObserverLagMs: 0,
      visualVelocity: 0,
      maxRemoteJump: 0,
      maxSnapshotIntervalMs: 0,
      lastTeleportAt: 0,
      droppedStaleUpdates: 0,
      droppedRemoteSamples: 0,
      hardSnapCount: 0,
      smoothFrameCount: 0,
      remoteCatchupCount: 0,
      snapshots: [],
      interpolationBuffer: [],
      object: null,
      root: null,
      sourceSessionId: sample.sourceSessionId || null,
      sourceDevice: sample.sourceDevice || null,
      lastRemoteEventType: null,
      isSelfAccount: false
    };
    state.remote.players.set(sample.playerId, entry);
  }
  entry.userId = sample.userId || entry.userId || null;
  entry.worldId = sample.worldId || entry.worldId || state.worldId || null;
  entry.snapshots = Array.isArray(entry.snapshots)
    ? entry.snapshots
    : Array.isArray(entry.interpolationBuffer)
      ? entry.interpolationBuffer
      : [];
  entry.interpolationBuffer = entry.snapshots;
  if (typeof sample.displayName === "string" && sample.displayName.trim()) {
    entry.displayName = sample.displayName.trim();
  } else if (!entry.displayName) {
    entry.displayName = sample.playerId;
  }
  entry.selectedCharacterId = sample.selectedCharacterId !== undefined ? sample.selectedCharacterId : entry.selectedCharacterId || null;
  entry.connectedSessionCount = sample.connectedSessionCount || entry.connectedSessionCount || 0;
  entry.sourceSessionId = sample.sourceSessionId || entry.sourceSessionId || null;
  entry.sourceDevice = sample.sourceDevice || entry.sourceDevice || null;
  entry.isSelfAccount = false;
  if (remoteSampleIsStale(entry, sample, options) && options.reset !== true) {
    entry.droppedStaleUpdates += 1;
    state.remote.droppedStaleUpdates += 1;
    return entry;
  }
  const shouldResetBuffer = options.reset === true || !Array.isArray(entry.interpolationBuffer) || !entry.interpolationBuffer.length;
  const snapshotSeq = Number(sample.snapshotSeq || sample.serverSeq || 0) || 0;
  const serverTick = Number(sample.serverTick || 0) || 0;
  const serverTimeMs = Number.isFinite(Number(sample.serverTimeMs)) ? num(sample.serverTimeMs, 0) : null;
  const serverSentAtMs = Number.isFinite(Number(sample.serverSentAtMs)) ? num(sample.serverSentAtMs, 0) : null;
  const serverReceivedAt = Number.isFinite(Number(sample.serverReceivedAt)) ? num(sample.serverReceivedAt, 0) : null;
  const clientSentAt = Number.isFinite(Number(sample.clientSentAt)) ? num(sample.clientSentAt, 0) : null;
  const lastProcessedInputSeq = Number(sample.lastProcessedInputSeq || 0) || 0;
  entry.activeControllerSessionId = sample.activeControllerSessionId || entry.activeControllerSessionId || null;
  entry.controllerEpoch = Math.max(Number(entry.controllerEpoch) || 0, Number(sample.controllerEpoch) || 0);
  entry.lastProcessedInputSeq = Math.max(Number(entry.lastProcessedInputSeq) || 0, lastProcessedInputSeq || 0);
  const sampleEntry = {
    playerId: sample.playerId,
    worldId: sample.worldId,
    position: cloneRemotePosition(sample.position),
    revision: sample.revision || 0,
    updatedAt: sample.updatedAt || null,
    animationState: sample.animationState || null,
    moving: sample.moving,
    receivedAt: now,
    receivedAtEpoch: epochNow(now),
    serverSeq: Number(sample.serverSeq) || 0,
    serverTimeMs: serverTimeMs,
    serverReceivedAt: serverReceivedAt,
    serverSentAtMs: serverSentAtMs,
    clientSentAt: clientSentAt,
    snapshotSeq: snapshotSeq,
    serverTick: serverTick,
    lastProcessedInputSeq: lastProcessedInputSeq,
    activeControllerSessionId: sample.activeControllerSessionId || null,
    controllerEpoch: Number(sample.controllerEpoch) || 0,
    teleport: sample.teleport === true,
    velocityX: Number(sample.velocityX) || 0,
    velocityZ: Number(sample.velocityZ) || 0,
    sourceSessionId: sample.sourceSessionId || null,
    sourceDevice: sample.sourceDevice || null
  };
  const previousSample = Array.isArray(entry.interpolationBuffer) && entry.interpolationBuffer.length
    ? entry.interpolationBuffer[entry.interpolationBuffer.length - 1]
    : null;
  const previousPosition = previousSample?.position
    ? cloneRemotePosition(previousSample.position)
    : entry.position
      ? cloneRemotePosition(entry.position)
      : null;
  const distance = remoteSampleDistance(previousPosition, sample.position);
  const shouldSnap = shouldResetBuffer || !previousPosition || !previousSample || distance > REMOTE_TELEPORT_DISTANCE || !Number.isFinite(distance);
  const previousSnapshotAt = Number(entry.lastSnapshotAt) || 0;
  const nextSnapshotAt = now;
  const intervalMs = previousSnapshotAt > 0 ? Math.max(0, nextSnapshotAt - previousSnapshotAt) : 0;
  if (shouldSnap) {
    if (options.type === "world:presence_snapshot" || options.type === "remote_player:joined" || options.reset === true) {
      state.remote.tombstones.delete(sample.playerId);
    }
    entry.position = cloneRemotePosition(sample.position);
    entry.previousPosition = cloneRemotePosition(sample.position);
    entry.targetPosition = cloneRemotePosition(sample.position);
    entry.latestSamplePosition = cloneRemotePosition(sample.position);
    entry.revision = Number(sample.revision) || 0;
    entry.updatedAt = sample.updatedAt || null;
    entry.animationState = sample.animationState || (sample.moving === false ? "idle" : "walk");
    entry.moving = typeof sample.moving === "boolean" ? sample.moving : entry.moving;
    entry.serverSeq = Number(sample.serverSeq || entry.serverSeq || 0) || 0;
    entry.serverTimeMs = serverTimeMs || entry.serverTimeMs || null;
    entry.serverReceivedAt = serverReceivedAt || entry.serverReceivedAt || null;
    entry.serverSentAtMs = serverSentAtMs || entry.serverSentAtMs || null;
    entry.clientSentAt = clientSentAt || entry.clientSentAt || null;
    entry.lastSnapshotSeq = snapshotSeq || entry.lastSnapshotSeq || 0;
    entry.lastSnapshotAt = nextSnapshotAt;
    entry.lastSnapshotServerTimeMs = serverTimeMs || entry.lastSnapshotServerTimeMs || null;
    entry.snapshotIntervalMs = intervalMs ? round(intervalMs) : entry.snapshotIntervalMs || 0;
    entry.maxSnapshotIntervalMs = Math.max(Number(entry.maxSnapshotIntervalMs) || 0, intervalMs || 0);
    if (intervalMs > 0) pushSnapshotInterval(intervalMs);
    entry.lastPacketAt = now;
    entry.snapshots = [sampleEntry];
    entry.interpolationBuffer = entry.snapshots;
    entry.lastTeleportAt = now;
    entry.hardSnapCount = (entry.hardSnapCount || 0) + 1;
    state.remote.hardSnapCount = (state.remote.hardSnapCount || 0) + 1;
    state.remote.lastPacketAt = now;
    state.remote.lastPacketType = options.type || "remote_player:joined";
    state.remote.lastRemoteEventType = options.type || "remote_player:joined";
    if (options.type === "world:presence_snapshot") {
      state.remote.lastSnapshotAt = now;
      if (!Array.isArray(state.remote.lastSnapshotPlayerIds)) state.remote.lastSnapshotPlayerIds = [];
      state.remote.lastSnapshotPlayerIds.push(sample.playerId);
    }
    state.remote.remotePlayerIds = Array.from(state.remote.players.keys());
    return entry;
  }
  if (options.type === "world:presence_snapshot" || options.type === "remote_player:joined") {
    state.remote.tombstones.delete(sample.playerId);
  }
  entry.serverSeq = Number(sample.serverSeq || entry.serverSeq || 0) || 0;
  entry.serverTimeMs = serverTimeMs || entry.serverTimeMs || null;
  entry.serverReceivedAt = serverReceivedAt || entry.serverReceivedAt || null;
  entry.serverSentAtMs = serverSentAtMs || entry.serverSentAtMs || null;
  entry.clientSentAt = clientSentAt || entry.clientSentAt || null;
  entry.interpolationBuffer.push(sampleEntry);
  pruneRemoteInterpolationBuffer(entry, now);
  entry.latestSamplePosition = cloneRemotePosition(sample.position);
  if (!entry.position) entry.position = cloneRemotePosition(sample.position);
  if (!entry.previousPosition) entry.previousPosition = previousPosition ? cloneRemotePosition(previousPosition) : cloneRemotePosition(sample.position);
  entry.targetPosition = cloneRemotePosition(sample.position);
  entry.revision = Number(sample.revision) || entry.revision || 0;
  entry.updatedAt = sample.updatedAt || entry.updatedAt || null;
  entry.animationState = sample.animationState || entry.animationState || (sample.moving === false ? "idle" : "walk");
  entry.moving = typeof sample.moving === "boolean" ? sample.moving : entry.moving;
  entry.serverSeq = Number(sample.serverSeq || entry.serverSeq || 0) || 0;
  entry.lastSnapshotSeq = snapshotSeq || entry.lastSnapshotSeq || 0;
  entry.lastSnapshotAt = nextSnapshotAt;
  entry.lastSnapshotServerTimeMs = serverTimeMs || entry.lastSnapshotServerTimeMs || null;
  entry.snapshotIntervalMs = intervalMs ? round(intervalMs) : entry.snapshotIntervalMs || 0;
  entry.maxSnapshotIntervalMs = Math.max(Number(entry.maxSnapshotIntervalMs) || 0, intervalMs || 0);
  if (intervalMs > 0) pushSnapshotInterval(intervalMs);
  entry.lastPacketAt = now;
  state.remote.lastPacketAt = now;
  state.remote.lastPacketType = options.type || "remote_player:state_changed";
  state.remote.lastRemoteEventType = options.type || "remote_player:state_changed";
  state.remote.normalMovementUsesSnapshot = options.type === "mmo:snapshot" || state.remote.normalMovementUsesSnapshot === true;
  if (options.type === "world:presence_snapshot") {
    state.remote.lastSnapshotAt = now;
    if (!Array.isArray(state.remote.lastSnapshotPlayerIds)) state.remote.lastSnapshotPlayerIds = [];
    state.remote.lastSnapshotPlayerIds.push(sample.playerId);
  }
  state.remote.remotePlayerIds = Array.from(state.remote.players.keys());
  return entry;
}

function removeRemotePlayerEntry(playerId, reason = "left", payload = null) {
  const key = String(playerId || "").trim();
  if (!key) return false;
  state.remote.tombstones.set(key, {
    revision: Number(payload?.revision ?? 0) || 0,
    updatedAt: payload?.updatedAt || null,
    removedAt: performance.now(),
    reason: reason
  });
  const entry = state.remote.players.get(key) || null;
  if (!entry) {
    state.remote.remotePlayerIds = Array.from(state.remote.players.keys());
    state.remote.lastPacketAt = performance.now();
    state.remote.lastPacketType = reason;
    state.remote.lastRemoteEventType = reason;
    updateHud();
    return false;
  }
  removeRemoteEntryRuntime(entry);
  state.remote.players.delete(key);
  state.remote.tombstones.set(key, {
    revision: Number(payload?.revision ?? entry.revision ?? 0) || 0,
    updatedAt: payload?.updatedAt || entry.updatedAt || null,
    removedAt: performance.now(),
    reason: reason
  });
  state.remote.remotePlayerIds = Array.from(state.remote.players.keys());
  state.remote.lastPacketAt = performance.now();
  state.remote.lastPacketType = reason;
  state.remote.lastRemoteEventType = reason;
  updateHud();
  return true;
}

function clearRemotePlayers(reason = "clear") {
  for (const playerId of Array.from(state.remote.players.keys())) {
    removeRemotePlayerEntry(playerId, reason);
  }
  state.remote.players.clear();
  state.remote.remotePlayerIds = [];
  state.remote.lastSnapshotPlayerIds = [];
  state.remote.lastPacketAt = 0;
  state.remote.lastPacketType = reason;
  state.remote.lastRemoteEventType = reason;
  state.remote.lastSnapshotAt = 0;
  state.remote.lastSnapshotSeq = 0;
  state.remote.lastSnapshotServerTimeMs = 0;
  state.remote.lastSnapshotIntervals = [];
  state.remote.avgSnapshotIntervalMs = 0;
  state.remote.maxSnapshotIntervalMs = 0;
  state.remote.maxVisualFreezeMs = 0;
  state.remote.maxObserverLagMs = 0;
  state.remote.maxRemoteJump = 0;
  state.remote.normalMovementUsesSnapshot = false;
  state.remote.droppedStaleUpdates = 0;
  state.remote.droppedRemoteSamples = 0;
  state.remote.hardSnapCount = 0;
  state.remote.smoothFrameCount = 0;
  state.remote.remoteCatchupCount = 0;
  state.remote.remoteRenderDelayMs = REMOTE_INTERPOLATION_BASE_DELAY_MS;
  state.remote.tombstones.clear();
  if (state.runtime && typeof state.runtime.clearRemotePlayers === "function") {
    try { state.runtime.clearRemotePlayers(); } catch {}
  } else if (state.runtime && typeof state.runtime.removeRemotePlayer === "function") {
    for (const playerId of Array.from(state.remote.players.keys())) {
      try { state.runtime.removeRemotePlayer(playerId); } catch {}
    }
  }
}

function remoteSamplesForEntry(entry) {
  const buffer = pruneRemoteInterpolationBuffer(entry);
  return buffer.filter(function (sample) {
    return sample && sample.position;
  }).sort(function (left, right) {
    return remoteSampleTimelineMs(left) - remoteSampleTimelineMs(right);
  });
}

function interpolateRemoteEntry(entry, renderTimelineMs) {
  const samples = remoteSamplesForEntry(entry);
  if (!samples.length) return null;
  if (samples.length === 1) {
    const sample = samples[0];
    return {
      position: cloneRemotePosition(sample.position),
      previousPosition: cloneRemotePosition(sample.position),
      targetPosition: cloneRemotePosition(sample.position),
      animationState: sample.animationState || (sample.moving === false ? "idle" : "walk"),
      moving: typeof sample.moving === "boolean" ? sample.moving : sample.animationState !== "idle",
      revision: Number(sample.revision) || 0,
      updatedAt: sample.updatedAt || null,
      renderMode: "snap"
    };
  }
  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];
  const firstTimeline = remoteSampleTimelineMs(firstSample);
  const lastTimeline = remoteSampleTimelineMs(lastSample);
  if (renderTimelineMs <= firstTimeline) {
    return {
      position: cloneRemotePosition(firstSample.position),
      previousPosition: cloneRemotePosition(firstSample.position),
      targetPosition: cloneRemotePosition(firstSample.position),
      animationState: firstSample.animationState || (firstSample.moving === false ? "idle" : "walk"),
      moving: typeof firstSample.moving === "boolean" ? firstSample.moving : firstSample.animationState !== "idle",
      revision: Number(firstSample.revision) || 0,
      updatedAt: firstSample.updatedAt || null,
      renderMode: "hold"
    };
  }
  let left = firstSample;
  let right = lastSample;
  for (let index = 0; index < samples.length - 1; index += 1) {
    const current = samples[index];
    const next = samples[index + 1];
    const currentTimeline = remoteSampleTimelineMs(current);
    const nextTimeline = remoteSampleTimelineMs(next);
    if (renderTimelineMs >= currentTimeline && renderTimelineMs <= nextTimeline) {
      left = current;
      right = next;
      break;
    }
  }
  if (renderTimelineMs > lastTimeline) {
    const previous = samples[samples.length - 2] || lastSample;
    const previousPos = cloneRemotePosition(previous.position);
    const lastPos = cloneRemotePosition(lastSample.position);
    const extraMs = clamp(renderTimelineMs - lastTimeline, 0, mmoNetworkSettings().remoteMaxExtrapolationMs);
    if (extraMs <= 0 || lastSample.moving === false || remoteSampleDistance(previousPos, lastPos) <= 0.01) {
      return {
        position: cloneRemotePosition(lastPos),
        previousPosition: cloneRemotePosition(previousPos),
        targetPosition: cloneRemotePosition(lastPos),
        animationState: lastSample.animationState || (lastSample.moving === false ? "idle" : "walk"),
        moving: typeof lastSample.moving === "boolean" ? lastSample.moving : lastSample.animationState !== "idle",
        revision: Number(lastSample.revision) || 0,
        updatedAt: lastSample.updatedAt || null,
        renderMode: "hold"
      };
    }
    const gapMs = Math.max(1, remoteSampleTimelineMs(lastSample) - remoteSampleTimelineMs(previous));
    const velocityX = (lastPos.x - previousPos.x) / gapMs;
    const velocityY = (lastPos.y - previousPos.y) / gapMs;
    const velocityZ = (lastPos.z - previousPos.z) / gapMs;
    const position = {
      x: lastPos.x + velocityX * extraMs,
      y: lastPos.y + velocityY * extraMs,
      z: lastPos.z + velocityZ * extraMs,
      rotationY: lastPos.rotationY
    };
    return {
      position: position,
      previousPosition: cloneRemotePosition(lastPos),
      targetPosition: cloneRemotePosition(position),
      animationState: chooseRemoteAnimationState(entry, previous, lastSample, position, renderTimelineMs),
      moving: typeof lastSample.moving === "boolean" ? lastSample.moving : remoteSampleDistance(previousPos, position) > 0.02,
      revision: Number(lastSample.revision || previous.revision || entry.revision || 0) || 0,
      updatedAt: lastSample.updatedAt || previous.updatedAt || null,
      renderMode: "extrapolate"
    };
  }
  const leftTime = remoteSampleTimelineMs(left) || renderTimelineMs;
  const rightTime = remoteSampleTimelineMs(right) || leftTime;
  const span = Math.max(1, rightTime - leftTime);
  const factor = clamp((renderTimelineMs - leftTime) / span, 0, 1);
  const leftPos = cloneRemotePosition(left.position);
  const rightPos = cloneRemotePosition(right.position);
  const distance = remoteSampleDistance(leftPos, rightPos);
  const rightMoving = typeof right.moving === "boolean" ? right.moving : null;
  if (rightMoving === false && renderTimelineMs >= rightTime) {
    return {
      position: cloneRemotePosition(rightPos),
      previousPosition: cloneRemotePosition(leftPos),
      targetPosition: cloneRemotePosition(rightPos),
      animationState: right.animationState || "idle",
      moving: false,
      revision: Number(right.revision) || 0,
      updatedAt: right.updatedAt || null,
      renderMode: "hold"
    };
  }
  if (distance > REMOTE_TELEPORT_DISTANCE || !Number.isFinite(distance)) {
    return {
      position: cloneRemotePosition(rightPos),
      previousPosition: cloneRemotePosition(leftPos),
      targetPosition: cloneRemotePosition(rightPos),
      animationState: right.animationState || (right.moving === false ? "idle" : "walk"),
      moving: typeof right.moving === "boolean" ? right.moving : right.animationState !== "idle",
      revision: Number(right.revision) || 0,
      updatedAt: right.updatedAt || null,
      renderMode: "snap"
    };
  }
  const position = {
    x: leftPos.x + (rightPos.x - leftPos.x) * factor,
    y: leftPos.y + (rightPos.y - leftPos.y) * factor,
    z: leftPos.z + (rightPos.z - leftPos.z) * factor,
    rotationY: interpolateRemoteAngle(leftPos.rotationY, rightPos.rotationY, factor)
  };
  return {
    position: position,
    previousPosition: cloneRemotePosition(leftPos),
    targetPosition: cloneRemotePosition(rightPos),
    animationState: chooseRemoteAnimationState(entry, left, right, position, renderTimelineMs),
    moving: right.moving === true || left.moving === true || remoteSampleDistance(leftPos, rightPos) > 0.02,
    revision: Number(right.revision || left.revision || entry.revision || 0) || 0,
    updatedAt: right.updatedAt || left.updatedAt || null,
    renderMode: "interpolate"
  };
}

function syncRemotePlayers(now = performance.now()) {
  if (!state.runtime || (typeof state.runtime.setRemotePlayerVisualState !== "function" && typeof state.runtime.setRemotePlayerState !== "function")) return;
  const syncStartedAt = performance.now();
  try {
  const netSettings = mmoNetworkSettings();
  const renderDelay = clamp(Number(state.remote.interpolationDelayMs) || netSettings.remoteInterpolationBaseDelayMs, netSettings.remoteInterpolationMinDelayMs, netSettings.remoteInterpolationMaxDelayMs);
  const serverNowEpoch = estimateServerEpochNow(now);
  state.remote.remoteRenderDelayMs = round(renderDelay);
  for (const entry of state.remote.players.values()) {
    if (!entry || !entry.playerId || remoteWorldMatches(entry.worldId) === false) continue;
    const samples = remoteSamplesForEntry(entry);
    if (!samples.length) continue;
    const newestSample = samples[samples.length - 1];
    const newestTimeline = remoteSampleTimelineMs(newestSample);
    const latestRemoteSampleAgeMs = Number.isFinite(Number(entry.lastSnapshotAt))
      ? Math.max(0, now - Number(entry.lastSnapshotAt))
      : Math.max(0, serverNowEpoch - newestTimeline);
    const renderTimelineMs = serverNowEpoch - renderDelay;
    const interpolated = interpolateRemoteEntry(entry, renderTimelineMs);
    if (!interpolated) continue;
    const nextPosition = interpolated.position ? cloneRemotePosition(interpolated.position) : entry.position;
    const nextPreviousPosition = interpolated.previousPosition ? cloneRemotePosition(interpolated.previousPosition) : entry.previousPosition;
    const nextTargetPosition = interpolated.targetPosition ? cloneRemotePosition(interpolated.targetPosition) : entry.targetPosition;
    const renderMode = interpolated.renderMode || "hold";
    if (renderMode === "interpolate" || renderMode === "extrapolate") {
      entry.smoothFrameCount = (entry.smoothFrameCount || 0) + 1;
      state.remote.smoothFrameCount = (state.remote.smoothFrameCount || 0) + 1;
    }
    entry.previousPosition = nextPreviousPosition;
    entry.targetPosition = nextTargetPosition;
    if (nextPosition) entry.position = nextPosition;
    entry.animationState = interpolated.animationState || entry.animationState || "idle";
    entry.moving = interpolated.moving === true;
    entry.revision = Number(interpolated.revision || entry.revision || 0) || 0;
    entry.updatedAt = interpolated.updatedAt || entry.updatedAt || null;
    entry.lastRenderAt = now;
    entry.latestRemoteSampleAgeMs = round(latestRemoteSampleAgeMs);
    entry.interpolationBacklogMs = round(Math.max(0, latestRemoteSampleAgeMs - renderDelay));
    entry.remoteRenderDelayMs = round(renderDelay);
    entry.clockOffsetMs = round(Number(state.net.clockOffsetMs || 0));
    entry.serverSeq = Number(newestSample.serverSeq || entry.serverSeq || 0) || 0;
    entry.serverTimeMs = Number(newestSample.serverTimeMs || entry.serverTimeMs || 0) || null;
    entry.serverReceivedAt = Number(newestSample.serverReceivedAt || entry.serverReceivedAt || 0) || null;
    entry.serverSentAtMs = Number(newestSample.serverSentAtMs || entry.serverSentAtMs || 0) || null;
    entry.clientSentAt = Number(newestSample.clientSentAt || entry.clientSentAt || 0) || null;
    const renderMetrics = recordRemoteVisualMetrics(entry, nextPosition, renderTimelineMs, serverNowEpoch);
    const renderState = {
      position: nextPosition ? cloneRemotePosition(nextPosition) : null,
      previousPosition: nextPreviousPosition ? cloneRemotePosition(nextPreviousPosition) : null,
      targetPosition: nextTargetPosition ? cloneRemotePosition(nextTargetPosition) : null,
      revision: entry.revision,
      updatedAt: entry.updatedAt,
      animationState: entry.animationState,
      moving: entry.moving,
      snapshotSeq: Number(entry.lastSnapshotSeq || newestSample.snapshotSeq || newestSample.serverSeq || 0) || 0,
      lastSnapshotAt: Number(entry.lastSnapshotAt || 0) || now,
      visualFreezeMs: renderMetrics?.visualFreezeMs || 0,
      observerLagMs: renderMetrics?.observerLagMs || 0,
      visualVelocity: renderMetrics?.visualVelocity || 0,
      maxRemoteJump: renderMetrics?.maxRemoteJump || 0,
      teleport: interpolated.renderMode === "snap" || newestSample.teleport === true
    };
    entry.renderState = renderState;
    const runtimeSetRemotePlayer = typeof state.runtime.setRemotePlayerVisualState === "function"
      ? state.runtime.setRemotePlayerVisualState.bind(state.runtime)
      : state.runtime.setRemotePlayerState.bind(state.runtime);
    const runtimeEntry = runtimeSetRemotePlayer(entry.playerId, {
      x: entry.position?.x ?? 0,
      y: entry.position?.y ?? 0,
      z: entry.position?.z ?? 0,
      rotationY: entry.position?.rotationY ?? 0,
      revision: entry.revision,
      updatedAt: entry.updatedAt,
      animationState: entry.animationState,
      moving: entry.moving,
      worldId: entry.worldId,
      sourceSessionId: entry.sourceSessionId,
      sourceDevice: entry.sourceDevice,
      connectedSessionCount: entry.connectedSessionCount,
      lastPacketAt: entry.lastPacketAt,
      serverSeq: entry.serverSeq,
      serverTimeMs: entry.serverTimeMs,
      serverReceivedAt: entry.serverReceivedAt,
      serverSentAtMs: entry.serverSentAtMs,
      clientSentAt: entry.clientSentAt,
      snapshotSeq: Number(entry.lastSnapshotSeq || newestSample.snapshotSeq || newestSample.serverSeq || 0) || 0,
      lastSnapshotAt: Number(entry.lastSnapshotAt || 0) || now,
      activeControllerSessionId: entry.activeControllerSessionId || null,
      controllerEpoch: Math.max(Number(entry.controllerEpoch) || 0, Number(newestSample.controllerEpoch) || 0),
      lastProcessedInputSeq: Math.max(Number(entry.lastProcessedInputSeq) || 0, Number(newestSample.lastProcessedInputSeq) || 0),
      visualFreezeMs: renderState.visualFreezeMs,
      observerLagMs: renderState.observerLagMs,
      visualVelocity: renderState.visualVelocity,
      maxRemoteJump: renderState.maxRemoteJump,
      clockOffsetMs: entry.clockOffsetMs,
      latestRemoteSampleAgeMs: entry.latestRemoteSampleAgeMs,
      interpolationBacklogMs: entry.interpolationBacklogMs,
      remoteRenderDelayMs: entry.remoteRenderDelayMs,
      droppedRemoteSamples: entry.droppedRemoteSamples,
      remoteCatchupCount: entry.remoteCatchupCount,
      teleport: renderState.teleport
    }, {
        immediate: true,
        displayName: entry.displayName,
        worldId: entry.worldId,
        remotePlayer: entry
      });
    if (runtimeEntry) {
      entry.root = runtimeEntry.root || runtimeEntry.object || entry.root || null;
      entry.object = runtimeEntry.object || runtimeEntry.root || entry.object || null;
    }
  }
  state.remote.remotePlayerIds = Array.from(state.remote.players.keys());
  } finally {
    recordGameLoopTiming("remoteSync", performance.now() - syncStartedAt, now);
  }
  if (state.minimapHud.elements) {
    drawGameMinimapIfDue(now);
  }
}

function startRemoteFrameLoop() {
  if (state.remote.rafId) return;
  const tick = function (now) {
    if (!state.remote.rafId) return;
    state.remote.rafId = window.requestAnimationFrame(tick);
    syncRemotePlayers(now);
  };
  state.remote.rafId = window.requestAnimationFrame(tick);
}

function stopRemoteFrameLoop() {
  if (!state.remote.rafId) return;
  window.cancelAnimationFrame(state.remote.rafId);
  state.remote.rafId = 0;
}

function startMovementFrameLoop() {
  if (state.movementTimerId) return;
  const tick = function (now) {
    if (!state.movementTimerId) return;
    state.movementTimerId = window.requestAnimationFrame(tick);
    stepMovement(now);
  };
  state.movementTimerId = window.requestAnimationFrame(tick);
}

function stopMovementFrameLoop() {
  if (!state.movementTimerId) return;
  window.cancelAnimationFrame(state.movementTimerId);
  state.movementTimerId = null;
}

function formatPosition(position) {
  if (!position) return "-";
  const coords = [position.x, position.y, position.z].map((value) => round(value).toFixed(2)).join(", ");
  return coords + " | r " + round(position.rotationY).toFixed(1);
}

function formatDebugTimestamp(at) {
  if (!at) return "-";
  const deltaMs = performance.now() - at;
  if (deltaMs < 0) return "-";
  return (deltaMs / 1000).toFixed(1) + "s geleden";
}

function formatMetricMs(value) {
  if (!Number.isFinite(Number(value))) return "-";
  return Math.round(Number(value)) + " ms";
}

function summarizePingSamples(samples) {
  const values = Array.isArray(samples)
    ? samples.map(function (sample) { return Number(sample); }).filter(function (value) { return Number.isFinite(value) && value >= 0; })
    : [];
  if (!values.length) {
    return {
      pingMs: null,
      avgPingMs: null,
      jitterMs: null,
      maxPingMs: null
    };
  }
  const latest = values[values.length - 1];
  const total = values.reduce(function (sum, value) { return sum + value; }, 0);
  const avg = total / values.length;
  const jitter = values.reduce(function (sum, value) { return sum + Math.abs(value - avg); }, 0) / values.length;
  const max = values.reduce(function (highest, value) { return Math.max(highest, value); }, 0);
  return {
    pingMs: round(latest),
    avgPingMs: round(avg),
    jitterMs: round(jitter),
    maxPingMs: round(max)
  };
}

function updateRemoteInterpolationDelay() {
  const netSettings = mmoNetworkSettings();
  const pingStats = summarizePingSamples(state.netPing.samples);
  const jitter = Number.isFinite(pingStats.jitterMs) ? pingStats.jitterMs : 0;
  const targetDelay = clamp(netSettings.remoteInterpolationBaseDelayMs + (jitter * 2), netSettings.remoteInterpolationMinDelayMs, netSettings.remoteInterpolationMaxDelayMs);
  state.remote.interpolationDelayMs = round(targetDelay);
  state.remote.remoteRenderDelayMs = round(targetDelay);
  return pingStats;
}

function clearWsStatusVisibleTimer() {
  if (state.wsVisibleTimer) {
    clearTimeout(state.wsVisibleTimer);
    state.wsVisibleTimer = null;
  }
  state.wsVisibleTimerTarget = null;
  state.wsVisibleTimerAttemptId = 0;
}

function commitWsVisibleStatus(kind, text) {
  const nextKind = kind || "disconnected";
  const nextText = text || nextKind;
  if (state.wsStateVisible === nextKind && state.wsStateVisibleText === nextText) return false;
  state.wsStateVisible = nextKind;
  state.wsStateVisibleText = nextText;
  state.wsState = nextKind;
  state.wsLastStatusReason = nextText;
  state.wsStateVisibleAt = performance.now();
  const wsPill = state.debugHud.elements && state.debugHud.elements.wsPill;
  if (wsPill) {
    wsPill.className = "ws-pill ws-pill--" + nextKind;
    wsPill.textContent = nextText;
  }
  return true;
}

function scheduleWsVisibleStatus(kind, text, delayMs = WS_STATUS_HYSTERESIS_MS, attemptId = state.wsConnectionAttemptId) {
  const nextKind = kind || "disconnected";
  const nextText = text || nextKind;
  if (state.wsStateVisible === nextKind && state.wsStateVisibleText === nextText) return;
  if (state.wsVisibleTimer && state.wsVisibleTimerTarget && state.wsVisibleTimerTarget.kind === nextKind && state.wsVisibleTimerTarget.text === nextText && state.wsVisibleTimerAttemptId === attemptId) {
    return;
  }
  clearWsStatusVisibleTimer();
  state.wsVisibleTimerTarget = { kind: nextKind, text: nextText };
  state.wsVisibleTimerAttemptId = attemptId;
  state.wsVisibleTimer = window.setTimeout(function () {
    if (state.wsVisibleTimerAttemptId !== attemptId) return;
    if (attemptId !== state.wsConnectionAttemptId) return;
    state.wsVisibleTimer = null;
    const target = state.wsVisibleTimerTarget;
    state.wsVisibleTimerTarget = null;
    state.wsVisibleTimerAttemptId = 0;
    if (!target) return;
    commitWsVisibleStatus(target.kind, target.text);
    updateHud();
  }, Math.max(0, Math.floor(delayMs)));
}

function updateWsStatus(kind, text = kind, options = {}) {
  const nextKind = kind || "disconnected";
  const nextText = text || nextKind;
  const now = performance.now();
  state.wsRawState = nextKind;
  state.wsRawStateText = nextText;
  state.wsRawStateAt = now;
  state.wsLastStatusReason = nextText;
  if (nextKind === "connected") {
    state.wsConnectedOnce = true;
    state.lastConnectedAt = now;
    state.reconnectAttempt = 0;
    if (state.wsVisibleTimer) {
      const pendingTarget = state.wsVisibleTimerTarget;
      if (pendingTarget && pendingTarget.kind !== "connected") {
        state.reconnectSuppressedCount += 1;
      }
    }
    clearWsStatusVisibleTimer();
    commitWsVisibleStatus("connected", nextText);
    updateHud();
    return;
  }
  if (nextKind === "disconnected") {
    state.lastDisconnectedAt = now;
    if (options.immediate === true || options.final === true || state.wantReconnect === false) {
      clearWsStatusVisibleTimer();
      commitWsVisibleStatus("disconnected", nextText);
    } else {
      scheduleWsVisibleStatus(state.wsConnectedOnce ? "reconnecting" : "connecting", state.wsConnectedOnce ? "reconnecting" : "connecting", options.delayMs ?? mmoNetworkSettings().wsStatusHysteresisMs, options.attemptId || state.wsConnectionAttemptId);
    }
    updateHud();
    return;
  }
  if (nextKind === "connecting") {
    if (state.wsConnectedOnce && options.immediate !== true) {
      scheduleWsVisibleStatus("reconnecting", "reconnecting", options.delayMs ?? mmoNetworkSettings().wsStatusHysteresisMs, options.attemptId || state.wsConnectionAttemptId);
    } else {
      clearWsStatusVisibleTimer();
      commitWsVisibleStatus("connecting", nextText);
    }
    updateHud();
    return;
  }
  if (nextKind === "reconnecting") {
    if (options.immediate === true || state.wsConnectedOnce === false) {
      clearWsStatusVisibleTimer();
      commitWsVisibleStatus(state.wsConnectedOnce ? "reconnecting" : "connecting", state.wsConnectedOnce ? nextText : "connecting");
    } else {
      scheduleWsVisibleStatus("reconnecting", nextText, options.delayMs ?? mmoNetworkSettings().wsStatusHysteresisMs, options.attemptId || state.wsConnectionAttemptId);
    }
    updateHud();
    return;
  }
  clearWsStatusVisibleTimer();
  commitWsVisibleStatus(nextKind, nextText);
  updateHud();
}

function markWsConnected(text = "connected") {
  if (state.wsRawState !== "connected" || state.wsStateVisible !== "connected" || state.wsVisibleTimer) {
    updateWsStatus("connected", text);
  }
}

function recordPingSample(rttMs, serverTimeMs = null, clientSentAtMs = null) {
  if (!Number.isFinite(Number(rttMs)) || Number(rttMs) < 0) return null;
  state.netPing.lastPongAt = performance.now();
  state.netPing.lastRttMs = round(rttMs);
  state.netPing.seq = Math.max(0, state.netPing.seq || 0);
  state.netPing.samples.push(round(rttMs));
  if (state.netPing.samples.length > PING_SAMPLE_WINDOW_SIZE) {
    state.netPing.samples = state.netPing.samples.slice(-PING_SAMPLE_WINDOW_SIZE);
  }
  const pingStats = updateRemoteInterpolationDelay();
  if (Number.isFinite(Number(serverTimeMs)) && Number.isFinite(Number(clientSentAtMs))) {
    const sampleOffset = Number(serverTimeMs) - (Number(clientSentAtMs) + (Number(rttMs) / 2));
    if (Number.isFinite(sampleOffset)) {
      const current = Number(state.net.clockOffsetMs || 0);
      state.net.clockOffsetMs = current ? round((current * 0.85) + (sampleOffset * 0.15)) : round(sampleOffset);
    }
  }
  state.debug.pingMs = pingStats.pingMs;
  state.debug.avgPingMs = pingStats.avgPingMs;
  state.debug.jitterMs = pingStats.jitterMs;
  state.debug.maxPingMs = pingStats.maxPingMs;
  state.debug.lastPongAgeMs = 0;
  state.debug.remoteBufferDelayMs = state.remote.interpolationDelayMs;
  state.debug.remoteRenderDelayMs = state.remote.remoteRenderDelayMs || state.remote.interpolationDelayMs;
  state.debug.clockOffsetMs = round(state.net.clockOffsetMs || 0);
  state.net.lastPongAt = state.netPing.lastPongAt;
  updateHud();
  return pingStats;
}

function startPingLoop(socket, attemptId) {
  stopPingLoop();
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  state.netPing.seq = 0;
  state.netPing.lastSentAt = 0;
  state.netPing.lastPongAt = 0;
  state.netPing.lastRttMs = null;
  const sendPing = function () {
    if (!state.ws || state.ws !== socket || socket.readyState !== WebSocket.OPEN) return;
    const seq = Math.max(1, Math.floor(Number(state.netPing.seq) || 0) + 1);
    state.netPing.seq = seq;
    const sentAt = epochNow();
    state.netPing.lastSentAt = sentAt;
    try {
      socket.send(JSON.stringify({
        type: "ping",
        clientSentAt: sentAt,
        clientPingSeq: seq
      }));
    } catch {}
  };
  sendPing();
  state.netPing.timerId = window.setInterval(function () {
    if (attemptId !== state.wsConnectionAttemptId) {
      stopPingLoop();
      return;
    }
    sendPing();
  }, mmoNetworkSettings().clientPingIntervalMs);
}

function stopPingLoop() {
  if (state.netPing.timerId) {
    clearInterval(state.netPing.timerId);
    state.netPing.timerId = null;
  }
}

function buildClientDebugState() {
  const now = performance.now();
  const pingStats = summarizePingSamples(state.netPing.samples);
  const remoteBufferSizes = Array.from(state.remote.players.values()).map(function (entry) {
    const snapshots = Array.isArray(entry.snapshots) ? entry.snapshots.map(function (sample) {
      return {
        position: sample.position ? cloneRemotePosition(sample.position) : null,
        revision: Number(sample.revision) || 0,
        updatedAt: sample.updatedAt || null,
        animationState: sample.animationState || null,
        moving: sample.moving === true,
        receivedAt: Number(sample.receivedAt) || 0,
        receivedAtEpoch: Number(sample.receivedAtEpoch) || 0,
        snapshotSeq: Number(sample.snapshotSeq) || 0,
        serverTick: Number(sample.serverTick) || 0,
        serverSeq: Number(sample.serverSeq) || 0,
        serverTimeMs: Number(sample.serverTimeMs) || null,
        serverSentAtMs: Number(sample.serverSentAtMs) || null,
        serverReceivedAt: Number(sample.serverReceivedAt) || null,
        clientSentAt: Number(sample.clientSentAt) || null,
        lastProcessedInputSeq: Number(sample.lastProcessedInputSeq) || 0,
        activeControllerSessionId: sample.activeControllerSessionId || null,
        controllerEpoch: Number(sample.controllerEpoch) || 0,
        teleport: sample.teleport === true,
        velocityX: Number(sample.velocityX) || 0,
        velocityZ: Number(sample.velocityZ) || 0,
        sourceSessionId: sample.sourceSessionId || null,
        sourceDevice: sample.sourceDevice || null
      };
    }) : [];
      return {
        playerId: entry.playerId || null,
        bufferSize: Array.isArray(entry.interpolationBuffer) ? entry.interpolationBuffer.length : 0,
        snapshotsLength: Array.isArray(entry.snapshots) ? entry.snapshots.length : 0,
        snapshots: snapshots,
        interpolationBuffer: snapshots,
      lastPacketAt: Number(entry.lastPacketAt) || 0,
      packetAgeMs: Number(entry.lastPacketAt) ? round(Math.max(0, now - Number(entry.lastPacketAt))) : null,
      latestRemoteSampleAgeMs: Number(entry.latestRemoteSampleAgeMs) || null,
      interpolationBacklogMs: Number(entry.interpolationBacklogMs) || null,
      remoteRenderDelayMs: Number(entry.remoteRenderDelayMs) || null,
      snapshotIntervalMs: Number(entry.snapshotIntervalMs) || 0,
      maxSnapshotIntervalMs: Number(entry.maxSnapshotIntervalMs) || 0,
      visualFreezeMs: Number(entry.visualFreezeMs) || 0,
      maxVisualFreezeMs: Number(entry.maxVisualFreezeMs) || 0,
      observerLagMs: Number(entry.observerLagMs) || 0,
      maxObserverLagMs: Number(entry.maxObserverLagMs) || 0,
      visualVelocity: Number(entry.visualVelocity) || 0,
      maxRemoteJump: Number(entry.maxRemoteJump) || 0,
      droppedRemoteSamples: Number(entry.droppedRemoteSamples) || 0,
      remoteCatchupCount: Number(entry.remoteCatchupCount) || 0,
        lastSnapshotSeq: Number(entry.lastSnapshotSeq) || 0,
        lastSnapshotAt: Number(entry.lastSnapshotAt) || 0,
        lastSnapshotServerTimeMs: Number(entry.lastSnapshotServerTimeMs) || 0,
        activeControllerSessionId: entry.activeControllerSessionId || null,
        controllerEpoch: Math.max(0, Number(entry.controllerEpoch) || 0),
        lastProcessedInputSeq: Math.max(0, Number(entry.lastProcessedInputSeq) || 0),
        renderState: entry.renderState ? {
          position: entry.renderState.position ? cloneRemotePosition(entry.renderState.position) : null,
          previousPosition: entry.renderState.previousPosition ? cloneRemotePosition(entry.renderState.previousPosition) : null,
          targetPosition: entry.renderState.targetPosition ? cloneRemotePosition(entry.renderState.targetPosition) : null,
        revision: Number(entry.renderState.revision) || 0,
        updatedAt: entry.renderState.updatedAt || null,
        animationState: entry.renderState.animationState || "idle",
        moving: entry.renderState.moving === true,
        snapshotSeq: Number(entry.renderState.snapshotSeq) || 0,
        lastSnapshotAt: Number(entry.renderState.lastSnapshotAt) || 0,
        visualFreezeMs: Number(entry.renderState.visualFreezeMs) || 0,
        observerLagMs: Number(entry.renderState.observerLagMs) || 0,
        visualVelocity: Number(entry.renderState.visualVelocity) || 0,
        maxRemoteJump: Number(entry.renderState.maxRemoteJump) || 0,
        teleport: entry.renderState.teleport === true
      } : null
    };
  });
  const remoteMetrics = remoteBufferSizes.reduce(function (acc, item) {
    if (Number.isFinite(Number(item.latestRemoteSampleAgeMs))) acc.latestRemoteSampleAgeMs = Math.max(acc.latestRemoteSampleAgeMs, Number(item.latestRemoteSampleAgeMs));
    if (Number.isFinite(Number(item.interpolationBacklogMs))) acc.interpolationBacklogMs = Math.max(acc.interpolationBacklogMs, Number(item.interpolationBacklogMs));
    if (Number.isFinite(Number(item.remoteRenderDelayMs))) acc.remoteRenderDelayMs = Math.max(acc.remoteRenderDelayMs, Number(item.remoteRenderDelayMs));
    if (Number.isFinite(Number(item.maxVisualFreezeMs))) acc.maxVisualFreezeMs = Math.max(acc.maxVisualFreezeMs, Number(item.maxVisualFreezeMs));
    if (Number.isFinite(Number(item.maxObserverLagMs))) acc.maxObserverLagMs = Math.max(acc.maxObserverLagMs, Number(item.maxObserverLagMs));
    if (Number.isFinite(Number(item.maxRemoteJump))) acc.maxRemoteJump = Math.max(acc.maxRemoteJump, Number(item.maxRemoteJump));
    if (Number.isFinite(Number(item.maxSnapshotIntervalMs))) acc.maxSnapshotIntervalMs = Math.max(acc.maxSnapshotIntervalMs, Number(item.maxSnapshotIntervalMs));
    acc.droppedRemoteSamples += Number(item.droppedRemoteSamples || 0);
    acc.remoteCatchupCount += Number(item.remoteCatchupCount || 0);
    return acc;
  }, {
    latestRemoteSampleAgeMs: null,
    interpolationBacklogMs: null,
    remoteRenderDelayMs: state.remote.remoteRenderDelayMs || state.remote.interpolationDelayMs,
    maxVisualFreezeMs: state.remote.maxVisualFreezeMs || 0,
    maxObserverLagMs: state.remote.maxObserverLagMs || 0,
    maxRemoteJump: state.remote.maxRemoteJump || 0,
    maxSnapshotIntervalMs: state.remote.maxSnapshotIntervalMs || 0,
    droppedRemoteSamples: 0,
    remoteCatchupCount: 0
  });
  const maxSnapshotBufferSize = remoteBufferSizes.reduce(function (max, item) {
    return Math.max(max, Number(item.bufferSize || 0) || 0);
  }, 0);
  const snapshotBufferBounded = remoteBufferSizes.every(function (item) {
    return Number(item.bufferSize || 0) <= REMOTE_INTERPOLATION_BUFFER_LIMIT;
  });
  const snapshotIntervals = Array.isArray(state.remote.lastSnapshotIntervals)
    ? state.remote.lastSnapshotIntervals.map(function (value) { return Number(value); }).filter(function (value) { return Number.isFinite(value) && value >= 0; })
    : [];
  const avgSnapshotIntervalMs = snapshotIntervals.length
    ? round(snapshotIntervals.reduce(function (sum, value) { return sum + value; }, 0) / snapshotIntervals.length)
    : (Number.isFinite(Number(state.remote.avgSnapshotIntervalMs)) ? Number(state.remote.avgSnapshotIntervalMs) : 0);
  const maxSnapshotIntervalMs = snapshotIntervals.length
    ? round(snapshotIntervals.reduce(function (max, value) { return Math.max(max, value); }, 0))
    : (Number.isFinite(Number(state.remote.maxSnapshotIntervalMs)) ? Number(state.remote.maxSnapshotIntervalMs) : 0);
  const activeMmoNetworkSettings = mmoNetworkSettings();
  const minimapFogConfig = resolveMinimapFogConfig();
  const mmoReady = {
    httpSnapshotLoaded: state.mmoReady.httpSnapshotLoaded === true,
    runtimeReady: state.mmoReady.runtimeReady === true,
    socketOpen: state.mmoReady.socketOpen === true,
    bootstrapReceived: state.mmoReady.bootstrapReceived === true,
    connectionReadyReceived: state.mmoReady.connectionReadyReceived === true,
    playerStateReceived: state.mmoReady.playerStateReceived === true,
    presenceSnapshotReceived: state.mmoReady.presenceSnapshotReceived === true,
    onlineReady: state.mmoReady.onlineReady === true,
    readyAt: state.mmoReady.readyAt || 0,
    startedAt: state.mmoReady.startedAt || 0,
    timeoutAt: state.mmoReady.timeoutAt || 0,
    lastBlocker: state.mmoReady.lastBlocker || null,
    blocker: state.mmoReady.onlineReady ? null : (state.mmoReady.lastBlocker || getMmoReadinessBlocker() || "waiting_for_unknown")
  };
  return {
    wsRawState: state.wsRawState,
    wsStateRaw: state.wsRawState,
    wsRawStateText: state.wsStateRawText,
    wsVisibleState: state.wsStateVisible,
    wsStateVisible: state.wsStateVisible,
    wsVisibleStateText: state.wsStateVisibleText,
    reconnectAttempt: state.reconnectAttempt || 0,
    reconnectSuppressedCount: state.reconnectSuppressedCount || 0,
    lastCloseCode: state.lastCloseCode,
    lastCloseReason: state.lastCloseReason,
    lastConnectedAt: state.lastConnectedAt || null,
    lastConnectedAgeMs: state.lastConnectedAt ? round(Math.max(0, now - state.lastConnectedAt)) : null,
    lastDisconnectedAt: state.lastDisconnectedAt || null,
    lastDisconnectedAgeMs: state.lastDisconnectedAt ? round(Math.max(0, now - state.lastDisconnectedAt)) : null,
    pingMs: pingStats.pingMs,
    avgPingMs: pingStats.avgPingMs,
    jitterMs: pingStats.jitterMs,
    maxPingMs: pingStats.maxPingMs,
    lastPongAgeMs: state.netPing.lastPongAt ? round(Math.max(0, now - state.netPing.lastPongAt)) : null,
    packetAgeMs: state.net.lastServerPacketAt ? round(Math.max(0, now - state.net.lastServerPacketAt)) : null,
    mmoNetworkSettings: activeMmoNetworkSettings,
    remoteBufferDelayMs: state.remote.interpolationDelayMs,
    remoteRenderDelayMs: remoteMetrics.remoteRenderDelayMs,
    remotePlayerCount: state.remote.players.size || 0,
    remoteInterpolationDelayMs: state.remote.interpolationDelayMs,
    remotePacketAgeMs: state.remote.lastPacketAt ? round(Math.max(0, now - state.remote.lastPacketAt)) : null,
    movementProtocol: state.remote.normalMovementUsesSnapshot === true ? "mmo:snapshot" : (state.remote.lastPacketType || null),
    normalMovementUsesSnapshot: state.remote.normalMovementUsesSnapshot === true,
    snapshotProtocolVersion: 3,
    lastSnapshotSeq: state.remote.lastSnapshotSeq || 0,
    lastSnapshotAt: state.remote.lastSnapshotAt || 0,
    lastSnapshotServerTimeMs: state.remote.lastSnapshotServerTimeMs || 0,
    snapshotIntervalMs: avgSnapshotIntervalMs,
    avgSnapshotIntervalMs: avgSnapshotIntervalMs,
    maxSnapshotIntervalMs: maxSnapshotIntervalMs,
    maxSnapshotBufferSize: maxSnapshotBufferSize,
    snapshotBufferBounded: snapshotBufferBounded,
    maxVisualFreezeMs: remoteMetrics.maxVisualFreezeMs || state.remote.maxVisualFreezeMs || 0,
    maxObserverLagMs: remoteMetrics.maxObserverLagMs || state.remote.maxObserverLagMs || 0,
    maxRemoteJump: remoteMetrics.maxRemoteJump || state.remote.maxRemoteJump || 0,
    remoteBufferSizes: remoteBufferSizes,
    droppedStaleRemoteUpdates: state.remote.droppedStaleUpdates || 0,
    droppedRemoteSamples: state.remote.droppedRemoteSamples || remoteMetrics.droppedRemoteSamples || 0,
    remoteHardSnapCount: state.remote.hardSnapCount || 0,
    remoteSmoothFrameCount: state.remote.smoothFrameCount || 0,
    remoteCatchupCount: state.remote.remoteCatchupCount || remoteMetrics.remoteCatchupCount || 0,
    latestRemoteSampleAgeMs: remoteMetrics.latestRemoteSampleAgeMs,
    interpolationBacklogMs: remoteMetrics.interpolationBacklogMs,
    minimapFog: {
      enabled: minimapFogConfig.enabled === true,
      configSource: state.gameWorld?.minimap?.game?.fogOfWar ? "published" : (state.gameWorld?.minimap?.game ? "hud_defaults" : "none"),
      fogColor: minimapFogConfig.fogColor,
      fogOpacity: minimapFogConfig.fogOpacity,
      cellSize: minimapFogConfig.cellSize,
      revealRadius: minimapFogConfig.revealRadius,
      saveIntervalMs: minimapFogConfig.saveIntervalMs,
      movementThreshold: minimapFogConfig.movementThreshold,
      smoothFog: minimapFogConfig.smoothFog,
      fogFeatherRadius: minimapFogConfig.fogFeatherRadius,
      revealShape: minimapFogConfig.revealShape,
      loaded: state.minimapFog.loaded === true,
      worldId: state.minimapFog.worldId || null,
      mapLayer: state.minimapFog.mapLayer || "overworld",
      discoveredCount: state.minimapFog.discoveredCells.size || 0,
      lastClientCellKey: state.minimapFog.lastClientCellKey || null,
      saveInFlight: state.minimapFog.saveInFlight === true,
      loadInFlight: state.minimapFog.loadInFlight === true
    },
    clockOffsetMs: round(state.net.clockOffsetMs || 0),
    serverSeq: state.net.lastServerSeq || 0,
    gameLoopTimings: {
      remoteSyncMs: Number(state.gameLoopTimings.remoteSyncMs) || 0,
      remoteSyncAvgMs: Number(state.gameLoopTimings.remoteSyncAvgMs) || 0,
      remoteSyncCalls: Number(state.gameLoopTimings.remoteSyncCalls) || 0,
      remoteSyncLastAt: Number(state.gameLoopTimings.remoteSyncLastAt) || 0,
      movementStepMs: Number(state.gameLoopTimings.movementStepMs) || 0,
      movementStepAvgMs: Number(state.gameLoopTimings.movementStepAvgMs) || 0,
      movementStepCalls: Number(state.gameLoopTimings.movementStepCalls) || 0,
      movementStepLastAt: Number(state.gameLoopTimings.movementStepLastAt) || 0,
      minimapDrawMs: Number(state.gameLoopTimings.minimapDrawMs) || 0,
      minimapDrawAvgMs: Number(state.gameLoopTimings.minimapDrawAvgMs) || 0,
      minimapDrawCalls: Number(state.gameLoopTimings.minimapDrawCalls) || 0,
      minimapDrawLastAt: Number(state.gameLoopTimings.minimapDrawLastAt) || 0,
      minimapHudLastDrawMs: Number(state.minimapHud.lastDrawDurationMs) || 0,
      minimapHudDrawAvgMs: Number(state.minimapHud.drawDurationEmaMs) || 0,
      minimapHudPerformanceMode: state.minimapHud.performanceMode || null,
      minimapHudPerformanceModeUntil: Number(state.minimapHud.performanceModeUntil) || 0
    },
    mmoReady: mmoReady,
    lastRemoteEventType: state.remote.lastRemoteEventType || state.remote.lastPacketType || null
  };
}

function normalizeInputSeq(value) {
  const seq = Math.floor(Number(value));
  return Number.isFinite(seq) && seq >= 1 ? seq : 0;
}

function normalizeControllerEpoch(value) {
  const epoch = Math.floor(Number(value));
  return Number.isFinite(epoch) && epoch >= 0 ? epoch : 0;
}

function syncNetDebugState() {
  state.debug.lastSentSeq = state.net.lastSentInputSeq || 0;
  state.debug.lastAckedSeq = state.net.lastAckedInputSeq || 0;
  state.debug.lastIgnoredReason = state.net.lastIgnoredReason || null;
  state.debug.lastTransport = state.net.lastTransport || null;
  state.debug.lastServerRevision = state.net.lastAppliedServerRevision || 0;
  state.debug.lastServerClientInputSeq = state.net.lastServerClientInputSeq || 0;
  state.debug.lastServerControllerEpoch = state.net.lastServerControllerEpoch || 0;
  state.debug.lastServerSeq = state.net.lastServerSeq || 0;
  state.debug.lastPacketType = state.debug.lastReceivedType || state.remote.lastPacketType || null;
  state.debug.lastPacketAt = state.net.lastServerPacketAt || state.remote.lastPacketAt || null;
  const pingStats = summarizePingSamples(state.netPing.samples);
  state.debug.pingMs = pingStats.pingMs;
  state.debug.avgPingMs = pingStats.avgPingMs;
  state.debug.jitterMs = pingStats.jitterMs;
  state.debug.maxPingMs = pingStats.maxPingMs;
  state.debug.lastPongAgeMs = state.netPing.lastPongAt ? round(Math.max(0, performance.now() - state.netPing.lastPongAt)) : null;
  state.debug.packetAgeMs = state.net.lastServerPacketAt ? round(Math.max(0, performance.now() - state.net.lastServerPacketAt)) : null;
  state.debug.remoteBufferDelayMs = state.remote.interpolationDelayMs;
  state.debug.remoteRenderDelayMs = state.remote.remoteRenderDelayMs || state.remote.interpolationDelayMs;
  state.debug.clockOffsetMs = round(state.net.clockOffsetMs || 0);
  state.debug.latestRemoteSampleAgeMs = null;
  state.debug.interpolationBacklogMs = null;
  state.debug.droppedRemoteSamples = state.remote.droppedRemoteSamples || 0;
  state.debug.remoteCatchupCount = state.remote.remoteCatchupCount || 0;
}

function trimPendingInputs(now = Date.now()) {
  const cutoff = now - 2000;
  const next = [];
  for (const item of state.net.pendingInputs) {
    if (!item || !Number.isFinite(Number(item.seq)) || Number(item.seq) < 1) continue;
    if (Number(item.sentAt) < cutoff) continue;
    next.push(item);
  }
  if (next.length > 60) {
    state.net.pendingInputs = next.slice(-60);
  } else {
    state.net.pendingInputs = next;
  }
}

function queuePendingInput(entry) {
  state.net.pendingInputs.push({
    seq: normalizeInputSeq(entry.seq),
    position: clonePosition(entry.position),
    input: entry.input && typeof entry.input === "object" ? {
      moveX: clamp(num(entry.input.moveX, 0), -1, 1),
      moveZ: clamp(num(entry.input.moveZ, 0), -1, 1),
      sprint: entry.input.sprint === true,
      pointerTarget: entry.input.pointerTarget && Number.isFinite(Number(entry.input.pointerTarget.x)) && Number.isFinite(Number(entry.input.pointerTarget.z))
        ? { x: num(entry.input.pointerTarget.x, 0), z: num(entry.input.pointerTarget.z, 0) }
        : null,
      stop: entry.input.stop === true
    } : null,
    moving: Boolean(entry.moving),
    animationState: ANIMATION_STATES.has(entry.animationState) ? entry.animationState : "idle",
    sentAt: Number(entry.sentAt) || Date.now(),
    controllerEpoch: normalizeControllerEpoch(entry.controllerEpoch),
    clientSessionId: entry.clientSessionId || null,
    clientIntentId: entry.clientIntentId || null
  });
  trimPendingInputs();
  persistNetState();
}

function hasNewerPendingInputThanAck(clientInputSeq) {
  const ackSeq = normalizeInputSeq(clientInputSeq);
  if (!ackSeq) return false;
  return state.net.pendingInputs.some(function (item) {
    return Number(item.seq) > ackSeq;
  });
}

function removeAckedInputs(clientInputSeq) {
  const ackSeq = normalizeInputSeq(clientInputSeq);
  if (!ackSeq) return false;
  state.net.pendingInputs = state.net.pendingInputs.filter(function (item) {
    return Number(item.seq) > ackSeq;
  });
  state.net.lastAckedInputSeq = Math.max(state.net.lastAckedInputSeq || 0, ackSeq);
  syncNetDebugState();
  persistNetState();
  return true;
}

function queueOwnCorrection(deltaX, deltaZ, netSettings) {
  const rawX = Number(deltaX) || 0;
  const rawZ = Number(deltaZ) || 0;
  const maxUnits = clamp(num(netSettings?.ownActiveCorrectionMaxUnits, OWN_ACTIVE_CORRECTION_MAX_UNITS), 0, 2);
  if (maxUnits <= 0) return false;
  const distance = Math.hypot(rawX, rawZ);
  if (!Number.isFinite(distance) || distance <= 0.0001) return false;
  const scale = distance > maxUnits ? maxUnits / distance : 1;
  const nextX = rawX * scale;
  const nextZ = rawZ * scale;
  if (!state.ownCorrection) {
    state.ownCorrection = { x: nextX, z: nextZ };
    return true;
  }
  const merge = clamp(num(netSettings?.ownCorrectionMergeFactor, OWN_CORRECTION_MERGE_FACTOR), 0, 1);
  state.ownCorrection = {
    x: (state.ownCorrection.x * (1 - merge)) + (nextX * merge),
    z: (state.ownCorrection.z * (1 - merge)) + (nextZ * merge)
  };
  if (Math.hypot(state.ownCorrection.x, state.ownCorrection.z) < 0.01) state.ownCorrection = null;
  return true;
}

function postInputPredictionHoldActive(nowMsValue = Date.now()) {
  return Number(state.net.postInputPredictionHoldUntil || 0) > Number(nowMsValue || Date.now());
}

function startPostInputPredictionHold(reason = null) {
  const holdMs = clamp(num(mmoNetworkSettings().ownPostInputHoldMs, OWN_POST_INPUT_HOLD_MS), 0, 2000);
  if (holdMs <= 0) {
    state.net.postInputPredictionHoldUntil = 0;
    return false;
  }
  state.net.postInputPredictionHoldUntil = Date.now() + holdMs;
  state.net.lastIgnoredReason = reason ? "post_input_hold_" + reason : "post_input_hold";
  return true;
}

function noteLocalControlStart(forceEpoch = false, source = null) {
  if (!isMmoGameplayReady()) return false;
  const now = Date.now();
  const sourceChanged = Boolean(source && state.control.lastControlSource && state.control.lastControlSource !== source);
  if (forceEpoch || sourceChanged || !state.net.localControllerActive || !state.control.isLocalController) {
    state.net.controllerEpoch = normalizeControllerEpoch(state.net.controllerEpoch) + 1;
  }
  state.net.localControllerActive = true;
  state.control.isLocalController = true;
  state.control.lastControlSource = source || state.control.lastControlSource || null;
  state.control.activeControllerSessionId = state.session?.id || state.control.activeControllerSessionId;
  state.control.lastLocalControlAt = now;
  state.control.passiveSince = 0;
  state.net.lastLocalInputAt = now;
  state.net.lastIgnoredReason = null;
  state.net.lastRemoteControllerSessionId = state.control.activeControllerSessionId || state.net.lastRemoteControllerSessionId || null;
  syncNetDebugState();
  persistNetState();
  return true;
}

function notePassiveController(sessionId, reason = null) {
  state.net.localControllerActive = false;
  state.control.isLocalController = false;
  state.control.activeControllerSessionId = sessionId || state.control.activeControllerSessionId || null;
  state.control.passiveSince = Date.now();
  state.net.lastRemoteControllerSessionId = sessionId || state.net.lastRemoteControllerSessionId || null;
  state.net.lastIgnoredReason = reason && reason !== "remote_update" ? reason : null;
  syncNetDebugState();
}

function buildClientIntentId(clientSessionId, clientInputSeq) {
  return String(clientSessionId || "client") + ":" + String(normalizeInputSeq(clientInputSeq));
}

function shouldSendLocalFinalIntent(reason) {
  const recentLocal = state.control.lastLocalControlAt && (Date.now() - state.control.lastLocalControlAt < 1500);
  if (state.control.isLocalController || state.net.localControllerActive || recentLocal) return true;
  return reason === "user-stop";
}

function shouldUseHttpFallback() {
  if (!state.ws) return true;
  return state.ws.readyState === WebSocket.CLOSED || state.ws.readyState === WebSocket.CLOSING;
}

function normalizeIncomingServerPosition(payload, transport = null) {
  const raw = payload && typeof payload === "object" ? payload : {};
  const nested = raw.position && typeof raw.position === "object" ? raw.position : raw;
  return clonePosition({
    playerId: raw.playerId ?? raw.player_id ?? nested.playerId ?? nested.player_id ?? null,
    x: nested.x,
    y: nested.y,
    z: nested.z,
    rotationY: nested.rotationY,
    revision: raw.revision ?? nested.revision,
    updatedAt: raw.updatedAt ?? raw.updated_at ?? nested.updatedAt ?? nested.updated_at ?? null,
    sourceSessionId: raw.sourceSessionId ?? raw.lastUpdateSourceSessionId ?? nested.sourceSessionId ?? nested.lastUpdateSourceSessionId ?? null,
    sourceDevice: raw.sourceDevice ?? nested.sourceDevice ?? null,
    clientSessionId: raw.clientSessionId ?? raw.client_session_id ?? nested.clientSessionId ?? nested.client_session_id ?? null,
    clientInputSeq: raw.clientInputSeq ?? raw.client_input_seq ?? nested.clientInputSeq ?? nested.client_input_seq ?? 0,
    clientIntentId: raw.clientIntentId ?? raw.client_intent_id ?? nested.clientIntentId ?? nested.client_intent_id ?? null,
    clientSentAt: raw.clientSentAt ?? raw.client_sent_at ?? nested.clientSentAt ?? nested.client_sent_at ?? null,
    serverReceivedAt: raw.serverReceivedAt ?? raw.server_received_at ?? nested.serverReceivedAt ?? nested.server_received_at ?? null,
    serverTimeMs: raw.serverTimeMs ?? raw.server_time_ms ?? nested.serverTimeMs ?? nested.server_time_ms ?? null,
    serverSentAtMs: raw.serverSentAtMs ?? raw.server_sent_at_ms ?? nested.serverSentAtMs ?? nested.server_sent_at_ms ?? null,
    serverSeq: raw.serverSeq ?? raw.server_seq ?? nested.serverSeq ?? nested.server_seq ?? 0,
    snapshotSeq: raw.snapshotSeq ?? raw.snapshot_seq ?? nested.snapshotSeq ?? nested.snapshot_seq ?? 0,
    serverTick: raw.serverTick ?? raw.server_tick ?? nested.serverTick ?? nested.server_tick ?? 0,
    controllerEpoch: raw.controllerEpoch ?? raw.controller_epoch ?? nested.controllerEpoch ?? nested.controller_epoch ?? 0,
    activeControllerSessionId: raw.activeControllerSessionId ?? raw.active_controller_session_id ?? nested.activeControllerSessionId ?? nested.active_controller_session_id ?? null,
    lastProcessedInputSeq: raw.lastProcessedInputSeq ?? raw.last_processed_input_seq ?? nested.lastProcessedInputSeq ?? nested.last_processed_input_seq ?? 0,
    transport: transport || raw.transport || nested.transport || null,
    animationState: raw.animationState ?? nested.animationState ?? null,
    moving: typeof raw.moving === "boolean" ? raw.moving : typeof nested.moving === "boolean" ? nested.moving : null,
    teleport: raw.teleport === true || nested.teleport === true,
    velocityX: raw.velocityX ?? raw.velocity_x ?? nested.velocityX ?? nested.velocity_x ?? 0,
    velocityZ: raw.velocityZ ?? raw.velocity_z ?? nested.velocityZ ?? nested.velocity_z ?? 0
  });
}

function shouldApplyServerUpdate(currentRevision, currentUpdatedAt, nextRevision, nextUpdatedAt) {
  const currentRev = Number(currentRevision || 0);
  const nextRev = Number(nextRevision || 0);
  if (nextRev < currentRev) return false;
  if (nextRev > currentRev) return true;
  const currentTime = currentUpdatedAt ? String(currentUpdatedAt) : "";
  const nextTime = nextUpdatedAt ? String(nextUpdatedAt) : "";
  if (currentTime && nextTime && nextTime <= currentTime) return false;
  return true;
}

function deriveRemoteAnimationState(nextPosition, distance) {
  const incomingAnimationState = ANIMATION_STATES.has(nextPosition.animationState) ? nextPosition.animationState : null;
  const incomingMoving = typeof nextPosition.moving === "boolean" ? nextPosition.moving : null;
  if (incomingMoving === false) return "idle";
  if (incomingMoving === true) {
    if (incomingAnimationState === "run") return "run";
    return "walk";
  }
  const moving = distance > 0.02;
  if (!moving) return "idle";
  if (incomingAnimationState === "run") return "run";
  return "walk";
}

function applyAuthoritativeUpdate(update, options = {}) {
  const nextPosition = normalizeIncomingServerPosition(update, options.transport || update?.transport || null);
  if (!nextPosition) return null;
  if (!state.position) {
    state.net.lastAppliedServerRevision = Number(nextPosition.revision) || 0;
    state.net.lastAppliedServerUpdatedAt = nextPosition.updatedAt || "";
  } else if (!shouldApplyServerUpdate(state.net.lastAppliedServerRevision, state.net.lastAppliedServerUpdatedAt, nextPosition.revision, nextPosition.updatedAt)) {
    state.net.lastIgnoredReason = "stale_revision";
    syncNetDebugState();
    return null;
  }

  const localPlayerId = state.player?.id || null;
  const isLocalPlayer = Boolean(localPlayerId && nextPosition.playerId && String(nextPosition.playerId) === String(localPlayerId));
  const snapshotControllerSessionId = nextPosition.activeControllerSessionId || null;
  const isLocalControllerSnapshot = Boolean(state.session && snapshotControllerSessionId && snapshotControllerSessionId === state.session.id);
  const clientInputSeq = normalizeInputSeq(nextPosition.clientInputSeq || nextPosition.lastProcessedInputSeq);
  const controllerEpoch = normalizeControllerEpoch(nextPosition.controllerEpoch);
  const incomingAnimationState = ANIMATION_STATES.has(nextPosition.animationState) ? nextPosition.animationState : null;
  const incomingMoving = typeof nextPosition.moving === "boolean" ? nextPosition.moving : null;
  const authoritativeAnimation = incomingAnimationState || (incomingMoving === false ? "idle" : "walk");
  const previousPosition = state.predictedPosition ? clonePosition(state.predictedPosition) : clonePosition(state.position);
  const distance = previousPosition ? Math.hypot(previousPosition.x - nextPosition.x, previousPosition.z - nextPosition.z) : 0;
  const nextTransport = options.transport || nextPosition.transport || null;
  const localInputActive = hasMovementInput();
  const netSettings = mmoNetworkSettings();
  const postInputHoldActive = postInputPredictionHoldActive();
  const localPredictionHoldActive = localInputActive || postInputHoldActive;
  const shouldKeepPrediction = netSettings.predictionEnabled !== false
    && localPredictionHoldActive
    && nextPosition.teleport !== true
    && (options.keepPrediction === true || netSettings.ownKeepPredictionDuringInput !== false);

  state.net.lastAppliedServerRevision = Number(nextPosition.revision) || state.net.lastAppliedServerRevision || 0;
  state.net.lastAppliedServerUpdatedAt = nextPosition.updatedAt || state.net.lastAppliedServerUpdatedAt || "";
  state.net.lastServerPositionAt = Date.now();
  state.net.lastServerClientInputSeq = clientInputSeq;
  state.net.lastServerControllerEpoch = controllerEpoch;
  state.net.lastTransport = nextTransport;
  state.net.lastIgnoredReason = null;
  state.debug.lastSourceSessionId = nextPosition.sourceSessionId || snapshotControllerSessionId || state.debug.lastSourceSessionId;

  if (!state.predictedPosition) {
    state.predictedPosition = clonePosition(nextPosition);
    applyRuntimePosition(nextPosition, { immediate: true, animationState: authoritativeAnimation });
  }

  if (isLocalPlayer) {
    // FIX-10: vergelijk de serverpositie met de positie die WIJ hadden bij
    // dezelfde inputSeq (opgeslagen in pendingInputs), niet met waar we nu
    // zijn. De server loopt altijd ping+tick achter op de prediction, dus de
    // oude vergelijking gaf permanent een "afwijking" tijdens het lopen en
    // trok de speler 20x per seconde een stukje terug -> micro-hapering.
    const ackedPendingEntry = clientInputSeq > 0
      ? state.net.pendingInputs.find(function (item) { return Number(item.seq) === clientInputSeq; })
      : null;
    const hasAckedReferencePosition = Boolean(ackedPendingEntry && ackedPendingEntry.position);
    const referencePosition = hasAckedReferencePosition
      ? ackedPendingEntry.position
      : previousPosition;
    if (clientInputSeq > 0 && isLocalControllerSnapshot) removeAckedInputs(clientInputSeq);
    state.authoritativePosition = clonePosition(nextPosition);
    if (localPredictionHoldActive && state.predictedPosition) {
      state.position = Object.assign(clonePosition(nextPosition), {
        x: state.predictedPosition.x,
        y: state.predictedPosition.y,
        z: state.predictedPosition.z,
        rotationY: state.predictedPosition.rotationY
      });
    } else {
      state.position = clonePosition(nextPosition);
    }
    state.net.lastAckedInputSeq = isLocalControllerSnapshot
      ? Math.max(state.net.lastAckedInputSeq || 0, clientInputSeq || 0)
      : state.net.lastAckedInputSeq || 0;
    state.control.activeControllerSessionId = snapshotControllerSessionId || state.control.activeControllerSessionId || null;
    state.control.isLocalController = Boolean(isLocalControllerSnapshot || localInputActive);
    state.net.localControllerActive = Boolean(localInputActive || isLocalControllerSnapshot);
    state.net.lastRemoteControllerSessionId = snapshotControllerSessionId || state.net.lastRemoteControllerSessionId || null;
    if (!localInputActive || isLocalControllerSnapshot) {
      state.net.controllerEpoch = Math.max(state.net.controllerEpoch || 0, controllerEpoch || 0);
      persistNetState();
    }
    syncNetDebugState();

    const animationState = incomingAnimationState || deriveRemoteAnimationState(nextPosition, distance);
    if (netSettings.predictionEnabled === false || netSettings.reconciliationEnabled === false) {
      state.ownCorrection = null;
      state.lastAnimationState = animationState;
      state.position = clonePosition(nextPosition);
      state.predictedPosition = clonePosition(nextPosition);
      applyRuntimePosition(nextPosition, { immediate: true, animationState: animationState });
      syncNetDebugState();
      scheduleMinimapFogDiscovery(nextPosition.teleport === true ? "teleport" : "movement", { force: nextPosition.teleport === true });
      return nextPosition;
    }

    if (shouldKeepPrediction) {
      state.ownCorrection = null;
      state.net.lastIgnoredReason = postInputHoldActive ? "post_input_kept_prediction" : "active_input_kept_prediction";
      syncNetDebugState();
      scheduleMinimapFogDiscovery(nextPosition.teleport === true ? "teleport" : "movement", { force: nextPosition.teleport === true });
      return nextPosition;
    }

    const predictionError = referencePosition
      ? Math.hypot(referencePosition.x - nextPosition.x, referencePosition.z - nextPosition.z)
      : distance;

    if (nextPosition.teleport === true) {
      // Echte teleport: dit blijft de enige plek waar we tijdens actieve input snappen.
      state.ownCorrection = null;
      state.lastAnimationState = animationState;
      state.position = clonePosition(nextPosition);
      state.predictedPosition = clonePosition(nextPosition);
      applyRuntimePosition(nextPosition, { immediate: true, animationState: animationState });
    } else if (localInputActive) {
      // FIX-10: tijdens actief bewegen raken we predictedPosition en de
      // runtime NOOIT direct aan. Een afwijking boven de deadzone wordt als
      // correctievector opgeslagen en in stepMovement per tick weggesmeerd.
      // Als de ack niet meer in pendingInputs zit, vergelijken we niet met de
      // huidige prediction: dat is gewone netwerk-lag en gaf zichtbaar terugtrekken.
      if (hasAckedReferencePosition && predictionError > netSettings.ownPredictionDeadzone) {
        const queued = queueOwnCorrection(
          nextPosition.x - referencePosition.x,
          nextPosition.z - referencePosition.z,
          netSettings
        );
        state.net.lastIgnoredReason = queued ? "active_correction_capped" : "active_correction_disabled";
      }
    } else {
      // Speler staat stil: veilig om de serverpositie over te nemen, maar
      // met een deadzone zodat stilstaan niet jittert.
      state.ownCorrection = null;
      // FIX-11: animatie ALTIJD synchroniseren zodra we niet zelf bewegen,
      // óók als de positie binnen de deadzone valt. setMovementAnimationState
      // werkt state.lastAnimationState bij, zodat de movement-settled-vangrail
      // in stepMovement weer kan ingrijpen. Zonder dit kon een laat
      // "walk"-pakketje de animatie permanent op walk/run laten hangen: de
      // server stuurt daarna niets meer (er verandert niets), en de
      // boekhouding dacht al dat het idle was.
      setMovementAnimationState(animationState);
      if (distance <= netSettings.ownPredictionDeadzone) {
        // Positie laten staan; de animatie is hierboven al gesynct.
      } else if (distance > netSettings.ownSmallCorrectionThreshold) {
        state.predictedPosition = clonePosition(nextPosition);
        applyRuntimePosition(nextPosition, { immediate: false, reconcile: true, reconcileDurationMs: netSettings.ownCorrectionBlendMs || OWN_RECONCILE_MS, animationState: animationState });
      } else {
        state.predictedPosition = clonePosition(nextPosition);
        applyRuntimePosition(nextPosition, { immediate: true, animationState: animationState });
      }
    }
    syncNetDebugState();
    scheduleMinimapFogDiscovery(nextPosition.teleport === true ? "teleport" : "movement", { force: nextPosition.teleport === true });
    return nextPosition;
  }

  state.authoritativePosition = clonePosition(nextPosition);
  state.position = clonePosition(nextPosition);
  state.predictedPosition = clonePosition(nextPosition);
  state.control.isLocalController = Boolean(localInputActive);
  state.net.localControllerActive = Boolean(localInputActive);
  state.control.activeControllerSessionId = snapshotControllerSessionId || state.control.activeControllerSessionId || null;
  state.net.lastRemoteControllerSessionId = snapshotControllerSessionId || state.net.lastRemoteControllerSessionId || null;
  const animationState = deriveRemoteAnimationState(nextPosition, distance);
  applyRuntimePosition(nextPosition, { immediate: true, animationState: animationState });
  syncNetDebugState();
  scheduleMinimapFogDiscovery(nextPosition.teleport === true ? "teleport" : "movement", { force: nextPosition.teleport === true });
  return nextPosition;
}

function setWsStatus(kind, text) {
  updateWsStatus(kind, text);
}

// ---- Debug MMO HUD: fully node-driven (FIX-6/FIX-7), never hardcoded in index.html ----

function defaultMmoDebugConfig() {
  return {
    id: "mmo_debug_hud",
    enabled: true,
    anchor: "left",
    compact: true,
    startCollapsed: true,
    show: {
      wsStatus: true, user: true, player: true, session: true, position: true,
      revision: true, sessions: true, lastSent: true, lastSentSeq: true,
      lastAckedSeq: true, pendingInputs: true, controller: true,
      lastTransport: true, lastReceived: true, lastSource: true,
      lastIgnored: true, serverSeq: true, lastError: true,
      wsRawState: true, wsVisibleState: true, reconnectAttempt: true,
      reconnectSuppressedCount: true, lastClose: true, lastConnected: true,
      lastDisconnected: true, ping: true, avgPing: true, jitter: true,
      lastPongAge: true, packetAge: true, remoteBufferSizes: true,
      remoteHardSnapCount: true, remoteSmoothFrameCount: true,
      lastRemoteEventType: true, mmoSettings: true, mmoHealth: true,
      minimapFog: true
    }
  };
}

function isMmoDebugForced() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("debug") === "mmo";
  } catch {
    return false;
  }
}

function resolveMmoDebugConfig() {
  const nodes = Array.isArray(state.gameWorld?.ui) ? state.gameWorld.ui : [];
  const node = nodes.find(function (item) { return item && item.type === "debug_mmo_hud"; });
  if (node) return node;
  return isMmoDebugForced() ? defaultMmoDebugConfig() : null;
}

function computeMmoDebugSignature(config) {
  return JSON.stringify({
    id: config.id,
    enabled: config.enabled !== false,
    anchor: config.anchor,
    compact: config.compact !== false,
    startCollapsed: config.startCollapsed !== false,
    show: config.show || {}
  });
}

function createInfoRow(label, id, wide) {
  const row = document.createElement("div");
  if (wide) row.className = "status-grid-wide";
  const span = document.createElement("span");
  span.textContent = label;
  const strong = document.createElement("strong");
  strong.id = id;
  strong.textContent = "-";
  row.append(span, strong);
  return { row: row, strong: strong };
}

function setMmoDebugExpanded(expanded) {
  const els = state.debugHud.elements;
  if (!els || !els.body || !els.toggle) return;
  els.body.hidden = !expanded;
  els.toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  els.toggle.textContent = expanded ? "Verberg debug" : "Debug";
}

function buildMmoDebugHudDom(config) {
  const show = config.show || {};
  const anchor = normalizeGameHudAnchor(config.anchor, "left");
  const root = document.createElement("section");
  root.className = "status-panel status-panel--hud" + (config.compact === false ? "" : " status-panel--compact");
  root.dataset.hudId = config.id || "mmo_debug_hud";
  root.dataset.defaultAnchor = anchor;

  const elements = { root: root };

  const head = document.createElement("div");
  head.className = "status-head";
  const titleWrap = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "status-eyebrow";
  eyebrow.textContent = "MMO debug";
  titleWrap.appendChild(eyebrow);
  head.appendChild(titleWrap);
  if (show.wsStatus !== false) {
    const wsPill = document.createElement("div");
    wsPill.id = "wsPill";
    wsPill.className = "ws-pill ws-pill--disconnected";
    wsPill.textContent = "disconnected";
    head.appendChild(wsPill);
    elements.wsPill = wsPill;
  }
  root.appendChild(head);

  const summary = document.createElement("div");
  summary.className = "status-summary";
  if (show.position !== false) {
    const span = document.createElement("span");
    span.append("Pos ");
    const strong = document.createElement("strong");
    strong.id = "hudPosition";
    strong.textContent = "-";
    span.appendChild(strong);
    summary.appendChild(span);
    elements.hudPosition = strong;
  }
  if (show.revision !== false) {
    const span = document.createElement("span");
    span.append("Rev ");
    const strong = document.createElement("strong");
    strong.id = "hudRevision";
    strong.textContent = "-";
    span.appendChild(strong);
    summary.appendChild(span);
    elements.hudRevision = strong;
  }
  const toggle = document.createElement("button");
  toggle.id = "mmoDebugToggle";
  toggle.type = "button";
  toggle.className = "secondary-button secondary-button--small";
  toggle.setAttribute("aria-expanded", "false");
  toggle.textContent = "Debug";
  summary.appendChild(toggle);
  elements.toggle = toggle;
  root.appendChild(summary);

  const body = document.createElement("div");
  body.id = "mmoDebugBody";
  body.className = "status-body";
  body.hidden = true;
  elements.body = body;

  const grid = document.createElement("div");
  grid.className = "status-grid";
  if (show.user !== false) { const r = createInfoRow("User", "hudUser"); grid.appendChild(r.row); elements.hudUser = r.strong; }
  if (show.player !== false) { const r = createInfoRow("Player", "hudPlayer"); grid.appendChild(r.row); elements.hudPlayer = r.strong; }
  if (show.session !== false) { const r = createInfoRow("Session", "hudSession"); grid.appendChild(r.row); elements.hudSession = r.strong; }
  if (show.sessions !== false) { const r = createInfoRow("Sessions", "hudSessions"); grid.appendChild(r.row); elements.hudSessions = r.strong; }
  if (show.lastSource !== false) { const r = createInfoRow("Last source", "hudLastSource"); grid.appendChild(r.row); elements.hudLastSource = r.strong; }
  if (show.lastSent !== false) { const r = createInfoRow("Last sent", "hudLastSent", true); grid.appendChild(r.row); elements.hudLastSent = r.strong; }
  if (show.lastSentSeq !== false) { const r = createInfoRow("Sent seq", "hudLastSentSeq"); grid.appendChild(r.row); elements.hudLastSentSeq = r.strong; }
  if (show.lastAckedSeq !== false) { const r = createInfoRow("Ack seq", "hudLastAckedSeq"); grid.appendChild(r.row); elements.hudLastAckedSeq = r.strong; }
  if (show.pendingInputs !== false) { const r = createInfoRow("Pending", "hudPendingInputs"); grid.appendChild(r.row); elements.hudPendingInputs = r.strong; }
  if (show.controller !== false) { const r = createInfoRow("Controller", "hudController", true); grid.appendChild(r.row); elements.hudController = r.strong; }
  if (show.lastTransport !== false) { const r = createInfoRow("Transport", "hudLastTransport"); grid.appendChild(r.row); elements.hudLastTransport = r.strong; }
  if (show.lastIgnored !== false) { const r = createInfoRow("Ignored", "hudLastIgnored", true); grid.appendChild(r.row); elements.hudLastIgnored = r.strong; }
  if (show.serverSeq !== false) { const r = createInfoRow("Server seq", "hudServerSeq"); grid.appendChild(r.row); elements.hudServerSeq = r.strong; }
  if (show.lastReceived !== false) { const r = createInfoRow("Last received", "hudLastReceived", true); grid.appendChild(r.row); elements.hudLastReceived = r.strong; }
  if (show.lastError !== false) { const r = createInfoRow("Last error", "hudLastError", true); grid.appendChild(r.row); elements.hudLastError = r.strong; }
  if (show.wsRawState !== false) { const r = createInfoRow("WS raw", "hudWsRawState"); grid.appendChild(r.row); elements.hudWsRawState = r.strong; }
  if (show.wsVisibleState !== false) { const r = createInfoRow("WS visible", "hudWsVisibleState"); grid.appendChild(r.row); elements.hudWsVisibleState = r.strong; }
  if (show.reconnectAttempt !== false) { const r = createInfoRow("Reconnect", "hudReconnectAttempt"); grid.appendChild(r.row); elements.hudReconnectAttempt = r.strong; }
  if (show.reconnectSuppressedCount !== false) { const r = createInfoRow("Suppressed", "hudReconnectSuppressedCount"); grid.appendChild(r.row); elements.hudReconnectSuppressedCount = r.strong; }
  if (show.lastClose !== false) { const r = createInfoRow("Last close", "hudLastClose", true); grid.appendChild(r.row); elements.hudLastClose = r.strong; }
  if (show.lastConnected !== false) { const r = createInfoRow("Connected", "hudLastConnected"); grid.appendChild(r.row); elements.hudLastConnected = r.strong; }
  if (show.lastDisconnected !== false) { const r = createInfoRow("Disconnected", "hudLastDisconnected"); grid.appendChild(r.row); elements.hudLastDisconnected = r.strong; }
  if (show.ping !== false) { const r = createInfoRow("Ping", "hudPingMs"); grid.appendChild(r.row); elements.hudPingMs = r.strong; }
  if (show.avgPing !== false) { const r = createInfoRow("Avg ping", "hudAvgPingMs"); grid.appendChild(r.row); elements.hudAvgPingMs = r.strong; }
  if (show.jitter !== false) { const r = createInfoRow("Jitter", "hudJitterMs"); grid.appendChild(r.row); elements.hudJitterMs = r.strong; }
  if (show.lastPongAge !== false) { const r = createInfoRow("Last pong", "hudLastPongAgeMs"); grid.appendChild(r.row); elements.hudLastPongAgeMs = r.strong; }
  if (show.packetAge !== false) { const r = createInfoRow("Packet age", "hudPacketAgeMs"); grid.appendChild(r.row); elements.hudPacketAgeMs = r.strong; }
  if (show.worldId !== false) { const r = createInfoRow("World", "hudWorldId"); grid.appendChild(r.row); elements.hudWorldId = r.strong; }
  if (show.gameProject !== false) { const r = createInfoRow("Game project", "hudGameProject"); grid.appendChild(r.row); elements.hudGameProject = r.strong; }
  if (show.schemaVersion !== false) { const r = createInfoRow("Schema", "hudSchemaVersion"); grid.appendChild(r.row); elements.hudSchemaVersion = r.strong; }
  if (show.buildId !== false) { const r = createInfoRow("Build", "hudBuildId"); grid.appendChild(r.row); elements.hudBuildId = r.strong; }
  if (show.contentHash !== false) { const r = createInfoRow("Content hash", "hudContentHash", true); grid.appendChild(r.row); elements.hudContentHash = r.strong; }
  if (show.publishedAt !== false) { const r = createInfoRow("Published", "hudPublishedAt", true); grid.appendChild(r.row); elements.hudPublishedAt = r.strong; }
  if (show.localPlayerId !== false) { const r = createInfoRow("Local player", "hudLocalPlayerId", true); grid.appendChild(r.row); elements.hudLocalPlayerId = r.strong; }
  if (show.remoteCount !== false) { const r = createInfoRow("Remote", "hudRemotePlayers"); grid.appendChild(r.row); elements.hudRemotePlayers = r.strong; }
  if (show.worldPlayers !== false) { const r = createInfoRow("World players", "hudWorldPlayers"); grid.appendChild(r.row); elements.hudWorldPlayers = r.strong; }
  if (show.remoteAge !== false) { const r = createInfoRow("Remote age", "hudRemotePacketAge", true); grid.appendChild(r.row); elements.hudRemotePacketAge = r.strong; }
  if (show.remoteDelay !== false) { const r = createInfoRow("Interp delay", "hudRemoteDelay"); grid.appendChild(r.row); elements.hudRemoteDelay = r.strong; }
  if (show.remoteBufferSizes !== false) { const r = createInfoRow("Buffer sizes", "hudRemoteBufferSizes", true); grid.appendChild(r.row); elements.hudRemoteBufferSizes = r.strong; }
  if (show.remoteDropped !== false) { const r = createInfoRow("Remote drops", "hudRemoteDropped"); grid.appendChild(r.row); elements.hudRemoteDropped = r.strong; }
  if (show.remoteHardSnapCount !== false) { const r = createInfoRow("Hard snaps", "hudRemoteHardSnapCount"); grid.appendChild(r.row); elements.hudRemoteHardSnapCount = r.strong; }
  if (show.remoteSmoothFrameCount !== false) { const r = createInfoRow("Smooth frames", "hudRemoteSmoothFrameCount"); grid.appendChild(r.row); elements.hudRemoteSmoothFrameCount = r.strong; }
  if (show.lastRemoteEventType !== false) { const r = createInfoRow("Remote event", "hudLastRemoteEventType", true); grid.appendChild(r.row); elements.hudLastRemoteEventType = r.strong; }
  if (show.remoteIds !== false) { const r = createInfoRow("Remote ids", "hudRemoteIds", true); grid.appendChild(r.row); elements.hudRemoteIds = r.strong; }
  if (show.mmoSettings !== false) {
    const r = createInfoRow("MMO settings", "hudMmoSettings", true);
    grid.appendChild(r.row);
    elements.hudMmoSettings = r.strong;
  }
  if (show.mmoHealth !== false) {
    const r = createInfoRow("MMO health", "hudMmoHealth", true);
    grid.appendChild(r.row);
    elements.hudMmoHealth = r.strong;
  }
  if (show.minimapFog !== false) {
    const r = createInfoRow("Fog of war", "hudMinimapFog", true);
    grid.appendChild(r.row);
    elements.hudMinimapFog = r.strong;
  }
  body.appendChild(grid);

  const actions = document.createElement("div");
  actions.className = "status-actions";
  const refreshButton = document.createElement("button");
  refreshButton.id = "refreshButton";
  refreshButton.type = "button";
  refreshButton.className = "secondary-button";
  refreshButton.textContent = "Refresh state";
  refreshButton.addEventListener("click", function () { refreshState(); });
  const logoutButton = document.createElement("button");
  logoutButton.id = "logoutButton";
  logoutButton.type = "button";
  logoutButton.className = "secondary-button";
  logoutButton.textContent = "Logout";
  logoutButton.addEventListener("click", function () { logout(); });
  actions.append(refreshButton, logoutButton);
  body.appendChild(actions);

  root.appendChild(body);
  toggle.addEventListener("click", function () {
    setMmoDebugExpanded(Boolean(body.hidden));
  });

  return elements;
}

function removeMmoDebugHud() {
  if (state.debugHud.elements && state.debugHud.elements.frame) {
    state.debugHud.elements.frame.remove();
  } else if (state.debugHud.elements && state.debugHud.elements.root) {
    state.debugHud.elements.root.remove();
  }
  state.debugHud.elements = null;
  state.debugHud.signature = null;
}

function refreshMmoDebugHud() {
  const config = resolveMmoDebugConfig();
  if (!config || config.enabled === false) {
    removeMmoDebugHud();
    return;
  }
  const signature = computeMmoDebugSignature(config);
  if (state.debugHud.elements && state.debugHud.signature === signature) {
    updateHud();
    return;
  }
  const wasExpanded = state.debugHud.elements && state.debugHud.elements.body ? !state.debugHud.elements.body.hidden : null;
  removeMmoDebugHud();
  const elements = buildMmoDebugHudDom(config);
  elements.frame = appendGameHudPanel("debug", {
    moduleId: config.id || "mmo_debug_hud",
    nodeType: "debug_mmo_hud",
    label: "Performance",
    anchor: normalizeGameHudAnchor(config.anchor, "right")
  }, elements.root, normalizeGameHudAnchor(config.anchor, "right"));
  state.debugHud.elements = elements;
  state.debugHud.signature = signature;
  const expanded = wasExpanded !== null ? wasExpanded : (isMmoDebugForced() || config.startCollapsed === false);
  setMmoDebugExpanded(expanded);
  commitWsVisibleStatus(state.wsStateVisible || state.wsState || "disconnected", state.wsStateVisibleText || state.wsStateVisible || state.wsState || "disconnected");
  updateHud();
}

// ---- NODE-03 runtime HUD: rendered from published hud_* / interaction_hud nodes ----

function node03Modules() {
  const project = state.gameProject || state.gameWorld?.gameProject || null;
  const modules = Array.isArray(project?.ui?.modules) ? project.ui.modules : [];
  return modules.filter(function (module) {
    return module && NODE03_HUD_TYPES.has(module.nodeType);
  });
}

function node03ModuleSignature(modules) {
  return JSON.stringify(modules.map(function (module) {
    return {
      nodeType: module.nodeType,
      moduleId: module.moduleId,
      anchor: module.anchor,
      resolvedAnchor: hudModuleAnchor(module, defaultNode03Anchor(module.nodeType)),
      layout: module.layout,
      columns: module.columns,
      title: module.title,
      currencyRefs: module.currencyRefs,
      itemRefs: module.itemRefs,
      trackedRefs: module.trackedRefs,
      maxEntries: module.maxEntries,
      sourceStatRef: module.sourceStatRef,
      maxStatRef: module.maxStatRef,
      targetKinds: module.targetKinds,
      maxTargets: module.maxTargets,
      rangeMode: module.rangeMode,
      allowDemoReset: module.allowDemoReset
    };
  }));
}

function removeNode03Hud() {
  clearGameHudFamily("node03");
  state.node03.elements = null;
  state.node03.signature = "";
}

function defaultNode03Anchor(nodeType) {
  return NODE03_DEFAULT_HUD_ANCHORS[nodeType] || "top";
}

function createNode03Root(modules) {
  const root = document.createElement("section");
  root.className = "node03HudRoot";
  root.dataset.hudId = "node03_runtime";
  const anchors = {};
  function ensureAnchor(anchor) {
    const key = normalizeGameHudAnchor(anchor, "top");
    if (anchors[key]) return anchors[key];
    const node = document.createElement("div");
    applyHudDockClass(node, "node03", key);
    root.appendChild(node);
    anchors[key] = node;
    return node;
  }
  for (const module of modules) ensureAnchor(hudModuleAnchor(module, defaultNode03Anchor(module.nodeType)));
  root.addEventListener("click", function (event) {
    const button = event.target && typeof event.target.closest === "function"
      ? event.target.closest("[data-node03-action]")
      : null;
    if (!button || button.disabled) return;
    runNode03Action(button.dataset.node03Action, button.dataset.node03TargetId || null);
  });
  return { root: root, anchors: anchors };
}

function node03AnchorFor(elements, module) {
  const fallback = defaultNode03Anchor(module.nodeType);
  const anchor = hudModuleAnchor(module, fallback);
  return elements.anchors[anchor] || elements.anchors[fallback] || elements.root;
}

function clearNode03Anchors(elements) {
  for (const anchor of Object.values(elements.anchors || {})) anchor.replaceChildren();
}

function node03StatByRef(snapshot, statRef) {
  const byId = snapshot?.stats?.byId || {};
  const row = byId[statRef] || null;
  if (!row) return { current: 0, max: 0, percent: 0 };
  const max = num(row.baseValue, 0) + num(row.earnedValue, 0);
  const current = row.currentValue === null || row.currentValue === undefined ? max : num(row.currentValue, max);
  return { current: current, max: max, percent: max > 0 ? Math.max(0, Math.min(1, current / max)) : 0 };
}

function node03FormatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number)) : "-";
}

function node03ModuleCard(module, className) {
  const node = document.createElement("div");
  node.className = "node03Module " + className;
  node.dataset.moduleId = module.moduleId || module.nodeType || "";
  return node;
}

function renderNode03Bar(module, snapshot) {
  const stat = node03StatByRef(snapshot, module.sourceStatRef);
  const card = node03ModuleCard(module, "node03Module--bar");
  const label = document.createElement("div");
  label.className = "node03BarLabel";
  const name = document.createElement("span");
  name.textContent = module.label || module.sourceStatRef || "Stat";
  const value = document.createElement("strong");
  value.textContent = module.showNumbers === false
    ? (module.showPercent ? Math.round(stat.percent * 100) + "%" : "")
    : node03FormatNumber(stat.current) + " / " + node03FormatNumber(stat.max);
  label.append(name, value);
  const track = document.createElement("div");
  track.className = "node03BarTrack";
  track.style.width = Math.max(80, Math.min(420, num(module.widthPx, 220))) + "px";
  track.style.height = Math.max(8, Math.min(40, num(module.heightPx, 18))) + "px";
  const fill = document.createElement("div");
  fill.className = module.sourceStatRef === "stat.mana" ? "node03BarFill node03BarFill--mana" : "node03BarFill";
  fill.style.width = Math.round(stat.percent * 100) + "%";
  track.appendChild(fill);
  card.append(label, track);
  return card;
}

function renderNode03Xp(module, snapshot) {
  const progress = snapshot?.progression || {};
  const card = node03ModuleCard(module, "node03Module--xp" + (module.compact === false ? "" : " node03Module--compact"));
  const row = document.createElement("div");
  row.className = "node03XpRow";
  const label = document.createElement("span");
  label.textContent = module.showLevel === false ? "XP" : (module.levelLabel || "Level") + " " + (progress.level || 1);
  const value = document.createElement("strong");
  value.textContent = module.showCurrentXp === false
    ? ""
    : node03FormatNumber(progress.xp || 0) + (module.showRequiredXp === false ? "" : " / " + node03FormatNumber(progress.requiredXp || 0));
  row.append(label, value);
  const track = document.createElement("div");
  track.className = "node03BarTrack node03BarTrack--xp";
  const fill = document.createElement("div");
  fill.className = "node03BarFill node03BarFill--xp";
  fill.style.width = Math.round(num(progress.progressPercent, 0) * 100) + "%";
  track.appendChild(fill);
  card.append(row, track);
  return card;
}

function appendNode03DebugButton(parent, label, action, payload = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "node03AdjustButton";
  button.dataset.node03Action = action;
  if (payload.itemId) button.dataset.node03ItemId = payload.itemId;
  if (payload.currencyId) button.dataset.node03CurrencyId = payload.currencyId;
  button.dataset.node03Amount = String(Math.max(1, num(payload.amount, 1)));
  button.textContent = label;
  button.disabled = state.node03.actionInFlight;
  parent.appendChild(button);
  return button;
}

function node03CurrencyEntries(snapshot) {
  const owned = new Map((Array.isArray(snapshot?.currencies) ? snapshot.currencies : []).map(function (currency) {
    return [currency.currencyId, currency];
  }));
  const catalog = Array.isArray(snapshot?.catalog?.currencies) ? snapshot.catalog.currencies : [];
  const ids = new Set(catalog.map(function (currency) { return currency.currencyId; }).concat(Array.from(owned.keys())));
  if (!ids.size) ids.add("currency.gold");
  return Array.from(ids).map(function (currencyId) {
    const currency = owned.get(currencyId) || catalog.find(function (entry) { return entry.currencyId === currencyId; }) || {};
    return {
      kind: "currency",
      currencyId,
      displayName: currency.displayName || (currencyId === "currency.gold" ? "Gold" : currencyId),
      quantity: num(currency.amountMinor, 0),
      sortOrder: num(currency.sortOrder, currencyId === "currency.gold" ? 1 : 999)
    };
  }).sort(function (left, right) {
    return left.sortOrder - right.sortOrder || String(left.displayName).localeCompare(String(right.displayName));
  });
}

function node03OwnedItemEntries(snapshot) {
  const ownedItems = Array.isArray(snapshot?.inventory?.items) ? snapshot.inventory.items : [];
  const byItemId = new Map();
  for (const item of ownedItems) {
    const id = item.itemId || item.instanceId || item.stackId;
    if (!id) continue;
    const existing = byItemId.get(item.itemId);
    if (existing) {
      existing.quantity += num(item.quantity, 1);
      continue;
    }
    byItemId.set(item.itemId, Object.assign({}, item, { quantity: num(item.quantity, 1) }));
  }
  return Array.from(byItemId.values()).sort(function (left, right) {
    const leftOwned = num(left.quantity, 0) > 0 ? 0 : 1;
    const rightOwned = num(right.quantity, 0) > 0 ? 0 : 1;
    return leftOwned - rightOwned || String(left.displayName || left.itemId).localeCompare(String(right.displayName || right.itemId));
  });
}

function node03InventoryEntries(snapshot, limit) {
  return node03OwnedItemEntries(snapshot).slice(0, Math.max(1, limit || 16));
}

function node03TrackedRefs(module, snapshot) {
  const refs = [];
  if (Array.isArray(module.trackedRefs)) {
    for (const ref of module.trackedRefs) {
      const id = String(ref?.ref || ref || "").trim();
      if (id) refs.push(id);
    }
  }
  for (const currencyId of Array.isArray(module.currencyRefs) ? module.currencyRefs : []) {
    if (currencyId && !refs.includes(currencyId)) refs.push(currencyId);
  }
  for (const itemId of Array.isArray(module.itemRefs) ? module.itemRefs : []) {
    if (itemId && !refs.includes(itemId)) refs.push(itemId);
  }
  if (refs.length) return refs;
  refs.push("currency.gold");
  const owned = node03OwnedItemEntries(snapshot);
  if (!refs.includes("item.wood")) refs.push("item.wood");
  for (const item of owned) {
    if (refs.length >= Math.max(2, num(module.maxEntries, 5))) break;
    if (item.itemId && !refs.includes(item.itemId)) refs.push(item.itemId);
  }
  return refs;
}

function node03TrackedEntries(module, snapshot) {
  const currencies = new Map(node03CurrencyEntries(snapshot).map(function (currency) {
    return [currency.currencyId, currency];
  }));
  const catalogCurrencies = new Map((Array.isArray(snapshot?.catalog?.currencies) ? snapshot.catalog.currencies : []).map(function (currency) {
    return [currency.currencyId, currency];
  }));
  const ownedItems = new Map(node03OwnedItemEntries(snapshot).map(function (item) {
    return [item.itemId, item];
  }));
  const catalogItems = new Map((Array.isArray(snapshot?.catalog?.items) ? snapshot.catalog.items : []).map(function (item) {
    return [item.itemId, item];
  }));
  return node03TrackedRefs(module, snapshot).map(function (ref) {
    if (String(ref).startsWith("currency.")) {
      const currency = currencies.get(ref) || catalogCurrencies.get(ref) || {};
      return {
        kind: "currency",
        id: ref,
        displayName: currency.displayName || (ref === "currency.gold" ? "Gold" : ref),
        quantity: num(currency.quantity || currency.amountMinor, 0)
      };
    }
    const item = ownedItems.get(ref) || catalogItems.get(ref) || {};
    return {
      kind: "item",
      id: ref,
      displayName: item.displayName || ref,
      quantity: num(item.quantity, 0)
    };
  }).slice(0, Math.max(1, num(module.maxEntries, 5)));
}

function renderNode03Wallet(module, snapshot) {
  const card = node03ModuleCard(module, "node03Module--tracked");
  const title = document.createElement("div");
  title.className = "node03Title";
  title.textContent = module.title || "Tracked";
  card.appendChild(title);
  const list = document.createElement("div");
  list.className = "node03TrackedList";
  const entries = node03TrackedEntries(module, snapshot);
  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "node03TrackedItem";
    row.dataset.trackedKind = entry.kind;
    const label = document.createElement("span");
    label.textContent = entry.displayName || entry.id;
    const value = document.createElement("strong");
    value.textContent = node03FormatNumber(entry.quantity || 0);
    row.append(label, value);
    list.appendChild(row);
  }
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "node03Empty";
    empty.textContent = "No tracked items";
    card.appendChild(empty);
    return card;
  }
  card.appendChild(list);
  return card;
}

function renderNode03Inventory(module, snapshot) {
  const card = node03ModuleCard(module, "node03Module--inventory");
  const title = document.createElement("div");
  title.className = "node03Title";
  title.textContent = "Inventory";
  card.appendChild(title);
  const items = node03InventoryEntries(snapshot, num(module.maxItems, 18));
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "node03Empty";
    empty.textContent = "Empty";
    card.appendChild(empty);
    return card;
  }
  const list = document.createElement("div");
  list.className = module.layout === "list" ? "node03InventoryList" : "node03InventoryGrid";
  list.style.setProperty("--node03-columns", String(Math.max(1, Math.min(12, num(module.columns, 6)))));
  for (const item of items) {
    const cell = document.createElement("div");
    cell.className = "node03Item";
    cell.title = item.displayName || item.itemId;
    const name = document.createElement("span");
    name.textContent = item.displayName || item.itemId;
    const qty = document.createElement("strong");
    qty.textContent = item.quantity > 0 ? "x" + item.quantity : "0";
    cell.append(name, qty);
    list.appendChild(cell);
  }
  card.appendChild(list);
  return card;
}

function renderNode03Equipment(module, snapshot) {
  const card = node03ModuleCard(module, "node03Module--equipment");
  const title = document.createElement("div");
  title.className = "node03Title";
  title.textContent = "Equipment";
  card.appendChild(title);
  const rows = Array.isArray(snapshot?.equipment) ? snapshot.equipment : [];
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "node03Empty";
    empty.textContent = "No equipment";
    card.appendChild(empty);
    return card;
  }
  for (const item of rows) {
    const row = document.createElement("div");
    row.className = "node03Line";
    const slot = document.createElement("span");
    slot.textContent = item.slotName || item.slotId;
    const value = document.createElement("strong");
    value.textContent = item.displayName || item.itemId;
    row.append(slot, value);
    card.appendChild(row);
  }
  return card;
}

function node03TargetById(targetId) {
  const id = String(targetId || "").trim();
  if (!id) return null;
  const targets = Array.isArray(state.node03.snapshot?.interactionTargets) ? state.node03.snapshot.interactionTargets : [];
  return targets.find(function (target) { return String(target?.instanceId || "") === id; })
    || node03RuntimeTargetsForScene().find(function (target) { return String(target?.instanceId || "") === id; })
    || null;
}

function node03ClientDistance(target) {
  if (!target || !state.position) return null;
  if (!Number.isFinite(Number(target.x)) || !Number.isFinite(Number(target.z))) return null;
  return Math.hypot(num(state.position.x, 0) - num(target.x, 0), num(state.position.z, 0) - num(target.z, 0));
}

function node03TargetWithClientRange(target) {
  if (!target) return null;
  const distance = node03ClientDistance(target);
  if (distance === null) return target;
  const range = Math.max(0, num(target.range, 0));
  const radius = Math.max(0, num(target.radius, 0));
  return Object.assign({}, target, {
    distance: round(distance),
    inRange: distance <= range + radius
  });
}

function node03DecoratedInteractionTargets() {
  const targets = Array.isArray(state.node03.snapshot?.interactionTargets) ? state.node03.snapshot.interactionTargets : [];
  return targets.map(function (target) {
    const decorated = node03TargetWithClientRange(target);
    return Object.assign({}, decorated, {
      selected: String(decorated?.instanceId || "") === String(state.node03.selectedTargetId || "")
    });
  });
}

function node03RuntimeTargetsForScene() {
  const snapshot = state.node03.snapshot || {};
  const entities = Array.isArray(snapshot.entities?.all) ? snapshot.entities.all : [];
  const interactionTargets = Array.isArray(snapshot.interactionTargets) ? snapshot.interactionTargets : [];
  const byId = new Map();
  for (const entity of entities) {
    if (!entity || !entity.instanceId) continue;
    const action = entity?.interaction?.action || (entity.entityKind === "enemy" ? "attack" : entity.entityKind === "resource" ? "gather" : "pickup");
    byId.set(entity.instanceId, Object.assign({}, entity, {
      action,
      prompt: entity?.interaction?.prompt || action,
      range: num(entity?.interaction?.range, 3),
      available: entity.entityKind === "enemy"
        ? entity.alive !== false && entity.status !== "dead"
        : entity.available !== false && !["depleted", "claimed"].includes(entity.status)
    }));
  }
  for (const target of interactionTargets) {
    if (!target || !target.instanceId) continue;
    byId.set(target.instanceId, Object.assign({}, byId.get(target.instanceId) || {}, target));
  }
  return Array.from(byId.values()).map(function (target) {
    const decorated = node03TargetWithClientRange(target);
    return Object.assign({}, decorated, {
      selected: String(decorated?.instanceId || "") === String(state.node03.selectedTargetId || "")
    });
  });
}

function syncNode03RuntimeTargets() {
  syncRuntimeTargets();
}

function refreshNode03ClientRanges(now = performance.now()) {
  if (!state.node03.snapshot || !node03Modules().length) return;
  if (now - num(state.node03.lastRangeRenderAt, 0) < 200) return;
  state.node03.lastRangeRenderAt = now;
  syncNode03RuntimeTargets();
  updateNode03RangeDom();
}

function node03TargetMetaText(target, module = {}) {
  const parts = [target.status || target.entityKind];
  if (module.showDistance !== false && target.distance !== null) parts.push(node03FormatNumber(target.distance) + "m");
  if (module.showHealth !== false && target.healthMax) parts.push(node03FormatNumber(target.healthCurrent) + "/" + node03FormatNumber(target.healthMax));
  if (!target.inRange) parts.push("out of range");
  return parts.join(" · ");
}

function updateNode03RangeDom() {
  const elements = state.hudLayout.elements;
  if (!elements || !state.node03.snapshot) return;
  const targets = node03DecoratedInteractionTargets();
  const byId = new Map(targets.map(function (target) { return [String(target.instanceId || ""), target]; }));
  for (const row of Array.from(elements.root.querySelectorAll("[data-node03-target-row]"))) {
    const target = byId.get(String(row.dataset.node03TargetRow || ""));
    if (!target) continue;
    row.classList.toggle("node03Target--selected", target.selected === true);
    row.classList.toggle("node03Target--outOfRange", target.inRange === false);
    const meta = row.querySelector("[data-node03-target-meta]");
    if (meta) meta.textContent = node03TargetMetaText(target, { showDistance: row.dataset.node03ShowDistance !== "0", showHealth: row.dataset.node03ShowHealth !== "0" });
    const button = row.querySelector("[data-node03-action]");
    if (button) {
      button.dataset.node03Action = target.action;
      button.dataset.node03TargetId = target.instanceId;
      button.textContent = target.inRange === false ? "Move" : (target.prompt || target.action);
      button.disabled = state.node03.actionInFlight || !target.available;
    }
  }
  for (const button of Array.from(elements.root.querySelectorAll("[data-node03-hotbar-slot]"))) {
    const abilityId = button.dataset.node03AbilityId || "";
    const target = nearestNode03TargetForAbility(abilityId);
    button.classList.toggle("node03HotbarButton--outOfRange", target?.inRange === false);
    button.classList.toggle("node03HotbarButton--selected", target?.selected === true);
    if (target) {
      button.dataset.node03Action = target.action;
      button.dataset.node03TargetId = target.instanceId;
      button.disabled = state.node03.actionInFlight || !target.available;
      button.title = (button.dataset.node03AbilityLabel || target.prompt || target.action) + " - " + (target.displayName || target.instanceId) + (target.inRange === false ? " (move closer)" : "");
    } else {
      delete button.dataset.node03Action;
      delete button.dataset.node03TargetId;
      button.disabled = true;
    }
  }
}

function selectNode03Target(targetId) {
  state.node03.selectedTargetId = String(targetId || "").trim();
  syncNode03RuntimeTargets();
}

function node03TargetMatchesAbility(target, abilityId) {
  if (!target || target.available === false) return false;
  if (abilityId === "ability.basic_attack" || abilityId === "ability.attack_1") return target.action === "attack";
  if (abilityId === "ability.gather_sun_crystal") return target.action === "gather";
  return false;
}

function nearestNode03TargetForAbility(abilityId) {
  const targets = node03DecoratedInteractionTargets()
    .filter(function (target) { return node03TargetMatchesAbility(target, abilityId); })
    .sort(function (left, right) {
      if (left.inRange !== right.inRange) return left.inRange ? -1 : 1;
      return num(left.distance, 999999) - num(right.distance, 999999);
    });
  const selected = targets.find(function (target) {
    return String(target?.instanceId || "") === String(state.node03.selectedTargetId || "");
  });
  return selected || targets[0] || null;
}

function renderNode03Hotbar(module, snapshot) {
  const card = node03ModuleCard(module, "node03Module--hotbar");
  const slots = Array.isArray(snapshot?.abilities?.loadout) ? snapshot.abilities.loadout : [];
  const slotCount = Math.max(1, Math.min(12, num(module.slotCount, 6)));
  for (let index = 0; index < slotCount; index += 1) {
    const slot = slots.find(function (candidate) { return candidate.slotIndex === index; }) || null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "node03HotbarButton";
    button.title = slot?.displayName || "Empty";
    if (module.showKeybinds !== false) {
      const key = document.createElement("span");
      key.className = "node03HotbarKey";
      key.textContent = String(index + 1);
      button.appendChild(key);
    }
    const name = document.createElement("strong");
    name.textContent = slot?.displayName ? slot.displayName.slice(0, 2).toUpperCase() : "-";
    button.appendChild(name);
    button.dataset.node03HotbarSlot = String(index);
    if (slot?.abilityId) button.dataset.node03AbilityId = slot.abilityId;
    if (slot?.displayName) button.dataset.node03AbilityLabel = slot.displayName;
    const target = nearestNode03TargetForAbility(slot?.abilityId);
    if (target) {
      button.dataset.node03Action = target.action;
      button.dataset.node03TargetId = target.instanceId;
      if (target.inRange === false) button.classList.add("node03HotbarButton--outOfRange");
      if (target.selected === true) button.classList.add("node03HotbarButton--selected");
      button.title = (slot?.displayName || target.prompt || target.action) + " - " + (target.displayName || target.instanceId) + (target.inRange === false ? " (move closer)" : "");
      button.disabled = state.node03.actionInFlight || !target.available;
    } else {
      button.disabled = true;
    }
    card.appendChild(button);
  }
  return card;
}

function node03HotbarSlotIndexForKey(code) {
  const text = String(code || "");
  const digit = /^Digit([1-9])$/.exec(text) || /^Numpad([1-9])$/.exec(text);
  if (!digit) return -1;
  return Number(digit[1]) - 1;
}

function triggerNode03HotbarSlot(slotIndex) {
  if (state.node03.actionInFlight || !state.node03.snapshot) return false;
  const slots = Array.isArray(state.node03.snapshot?.abilities?.loadout) ? state.node03.snapshot.abilities.loadout : [];
  const slot = slots.find(function (candidate) { return candidate.slotIndex === slotIndex; }) || null;
  if (!slot?.abilityId) return false;
  const target = nearestNode03TargetForAbility(slot.abilityId);
  if (!target) return false;
  runNode03Action(target.action, target.instanceId);
  return true;
}

function renderNode03Interactions(module, snapshot) {
  const card = node03ModuleCard(module, "node03Module--interactions");
  const head = document.createElement("div");
  head.className = "node03TitleRow";
  const title = document.createElement("div");
  title.className = "node03Title";
  title.textContent = module.title || "Targets";
  head.appendChild(title);
  if (module.allowDemoReset === true) {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "node03MiniButton";
    reset.dataset.node03Action = "reset_demo";
    reset.textContent = "Reset";
    reset.disabled = state.node03.actionInFlight;
    head.appendChild(reset);
  }
  card.appendChild(head);
  const targets = node03DecoratedInteractionTargets();
  if (!targets.length) {
    const empty = document.createElement("p");
    empty.className = "node03Empty";
    empty.textContent = "No targets";
    card.appendChild(empty);
  }
  for (const target of targets) {
    const row = document.createElement("div");
    row.className = "node03Target";
    row.dataset.node03TargetRow = target.instanceId || "";
    row.dataset.node03ShowDistance = module.showDistance === false ? "0" : "1";
    row.dataset.node03ShowHealth = module.showHealth === false ? "0" : "1";
    if (target.selected === true) row.classList.add("node03Target--selected");
    if (target.inRange === false) row.classList.add("node03Target--outOfRange");
    const body = document.createElement("div");
    body.className = "node03TargetBody";
    const name = document.createElement("strong");
    name.textContent = target.displayName || target.instanceId;
    const meta = document.createElement("span");
    meta.dataset.node03TargetMeta = "1";
    meta.textContent = node03TargetMetaText(target, module);
    body.append(name, meta);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "node03ActionButton";
    button.dataset.node03Action = target.action;
    button.dataset.node03TargetId = target.instanceId;
    button.textContent = target.inRange === false ? "Move" : (target.prompt || target.action);
    button.disabled = state.node03.actionInFlight || !target.available;
    row.append(body, button);
    card.appendChild(row);
  }
  if (state.node03.lastActionMessage || state.node03.lastError) {
    const status = document.createElement("p");
    status.className = state.node03.lastError ? "node03Status node03Status--error" : "node03Status";
    status.textContent = state.node03.lastError || state.node03.lastActionMessage;
    card.appendChild(status);
  }
  return card;
}

function renderNode03Death(module, snapshot) {
  const health = snapshot?.stats?.health || {};
  if (num(health.current, 1) > 0) return null;
  const card = node03ModuleCard(module, "node03Module--death");
  const title = document.createElement("strong");
  title.textContent = "Defeated";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "node03ActionButton";
  button.dataset.node03Action = "reset_demo";
  button.textContent = "Respawn";
  button.disabled = state.node03.actionInFlight;
  card.append(title, button);
  return card;
}

function renderNode03Module(module, snapshot) {
  if (module.nodeType === "hud_bar") return renderNode03Bar(module, snapshot);
  if (module.nodeType === "xp_hud") return renderNode03Xp(module, snapshot);
  if (module.nodeType === "wallet_hud") return renderNode03Wallet(module, snapshot);
  if (module.nodeType === "inventory_hud") return renderNode03Inventory(module, snapshot);
  if (module.nodeType === "equipment_hud") return renderNode03Equipment(module, snapshot);
  if (module.nodeType === "hotbar_hud") return renderNode03Hotbar(module, snapshot);
  if (module.nodeType === "interaction_hud") return renderNode03Interactions(module, snapshot);
  if (module.nodeType === "death_respawn_hud") return renderNode03Death(module, snapshot);
  return null;
}

function renderNode03Hud() {
  const modules = node03Modules();
  const snapshot = state.node03.snapshot;
  if (!modules.length || !snapshot) {
    removeNode03Hud();
    return;
  }
  // Signature includes the live snapshot, not just the static module config, so a
  // poll that returns unchanged data is a true no-op. Without this, every poll
  // destroyed and recreated every panel regardless of whether anything changed -
  // shared docks (several node types stacked together) would visibly flash/reflow
  // on that cadence even when nothing to show actually differed.
  const signature = node03ModuleSignature(modules) + "|" + JSON.stringify(snapshot) + "|" + JSON.stringify({
    actionInFlight: state.node03.actionInFlight,
    selectedTargetId: state.node03.selectedTargetId,
    lastError: state.node03.lastError,
    lastActionMessage: state.node03.lastActionMessage
  });
  if (state.node03.elements && state.node03.signature === signature) return;
  state.node03.elements = ensureGameHudRuntimeRoot();
  state.node03.signature = signature;
  clearGameHudFamily("node03");
  for (const module of modules) {
    const node = renderNode03Module(module, snapshot);
    if (!node) continue;
    appendGameHudPanel("node03", module, node, defaultNode03Anchor(module.nodeType));
  }
}

function scheduleNode03Poll() {
  if (state.node03.pollTimerId) return;
  state.node03.pollTimerId = window.setTimeout(async function () {
    state.node03.pollTimerId = 0;
    await loadNode03State({ silent: true });
    if (node03Modules().length) scheduleNode03Poll();
  }, 2500);
}

async function loadNode03State(options = {}) {
  if (!node03Modules().length) {
    removeNode03Hud();
    syncNode03RuntimeTargets();
    return false;
  }
  if (state.node03.loadInFlight) return false;
  state.node03.loadInFlight = true;
  try {
    const response = await fetch("/api/game/node03/state", { headers: { Accept: "application/json" } });
    if (response.status === 401) {
      window.location.href = "/login/?next=%2Fgame%2F";
      return false;
    }
    const data = await response.json().catch(function () { return null; });
    if (!response.ok || !data || data.ok !== true) {
      state.node03.lastError = data?.message || "NODE-03 state niet beschikbaar.";
      if (!options.silent) showHudError(state.node03.lastError);
      renderNode03Hud();
      return false;
    }
    state.node03.snapshot = data;
    state.node03.lastLoadedAt = performance.now();
    state.node03.lastError = "";
    syncNode03RuntimeTargets();
    renderNode03Hud();
    scheduleNode03Poll();
    return true;
  } catch (error) {
    state.node03.lastError = String(error?.message || error || "NODE-03 state mislukt.");
    if (!options.silent) showHudError(state.node03.lastError);
    renderNode03Hud();
    return false;
  } finally {
    state.node03.loadInFlight = false;
  }
}

async function runNode03Action(action, targetId, extra = {}) {
  if (String(action || "").startsWith("node04:")) {
    await runNode04Action(action, targetId);
    return;
  }
  if (!action || state.node03.actionInFlight) return;
  const currentTarget = node03TargetWithClientRange(node03TargetById(targetId));
  if (currentTarget?.instanceId) {
    selectNode03Target(currentTarget.instanceId);
    if (currentTarget.available !== false && currentTarget.inRange === false && Number.isFinite(Number(currentTarget.x)) && Number.isFinite(Number(currentTarget.z))) {
      const started = startClickToMoveTarget(num(currentTarget.x, 0), num(currentTarget.z, 0), "node03-target");
      state.node03.lastActionMessage = started
        ? "Loop naar " + (currentTarget.displayName || "target") + "."
        : (currentTarget.displayName || "Target") + " is buiten range.";
      renderNode03Hud();
      return;
    }
  }
  state.node03.actionInFlight = true;
  state.node03.lastError = "";
  renderNode03Hud();
  try {
    const isTravel = action === "travel";
    const response = await fetch(isTravel ? "/api/game/travel/zone-link" : "/api/game/node03/action", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(isTravel ? {
        linkId: targetId || null
      } : {
        action: action,
        targetId: targetId || null,
        itemId: extra.itemId || null,
        currencyId: extra.currencyId || null,
        amount: extra.amount === null || extra.amount === undefined ? null : Number(extra.amount),
        operationId: "node03:" + state.net.clientSessionId + ":" + Date.now() + ":" + Math.random().toString(36).slice(2, 8)
      })
    });
    if (response.status === 401) {
      window.location.href = "/login/?next=%2Fgame%2F";
      return;
    }
    const data = await response.json().catch(function () { return null; });
    if (!response.ok || !data || data.ok !== true) {
      state.node03.lastError = data?.message || "NODE-03 actie mislukt.";
      showHudError(state.node03.lastError);
      return;
    }
    state.node03.lastActionMessage = data.message || (isTravel ? "Travel complete." : "");
    if (isTravel) {
      applyInstantTravelResponse(data);
      await loadSessionState({
        forceWorld: true,
        showLoading: false,
        keepPrediction: false,
        silent: true,
        reason: "zone-link"
      });
      return;
    }
    if (data.position) applyFallbackPosition({ ok: true, position: data.position });
    if (data.snapshot) {
      state.node03.snapshot = data.snapshot;
      syncNode03RuntimeTargets();
    }
    renderNode03Hud();
  } catch (error) {
    state.node03.lastError = String(error?.message || error || "NODE-03 actie mislukt.");
    showHudError(state.node03.lastError);
  } finally {
    state.node03.actionInFlight = false;
    await loadNode03State({ silent: true });
  }
}

// ---- NODE-04 quest/dialogue HUD: rendered from published quest_tracker/dialogue/notification nodes ----

function node04Modules() {
  const project = state.gameProject || state.gameWorld?.gameProject || null;
  const modules = Array.isArray(project?.ui?.modules) ? project.ui.modules : [];
  return modules.filter(function (module) {
    return module && NODE04_HUD_TYPES.has(module.nodeType);
  });
}

function node04ModuleSignature(modules) {
  return JSON.stringify(modules.map(function (module) {
    return {
      nodeType: module.nodeType,
      moduleId: module.moduleId,
      anchor: module.anchor,
      resolvedAnchor: hudModuleAnchor(module, defaultNode04Anchor(module.nodeType)),
      maxQuests: module.maxQuests,
      maxVisible: module.maxVisible,
      widthPx: module.widthPx
    };
  }));
}

function removeNode04Hud() {
  clearGameHudFamily("node04");
  state.node04.elements = null;
  state.node04.signature = "";
}

function defaultNode04Anchor(nodeType) {
  return NODE04_DEFAULT_HUD_ANCHORS[nodeType] || "right";
}

function createNode04Root(modules) {
  const root = document.createElement("section");
  root.className = "node04HudRoot";
  root.dataset.hudId = "node04_runtime";
  const anchors = {};
  function ensureAnchor(anchor) {
    const key = normalizeGameHudAnchor(anchor, "right");
    if (anchors[key]) return anchors[key];
    const node = document.createElement("div");
    applyHudDockClass(node, "node04", key);
    root.appendChild(node);
    anchors[key] = node;
    return node;
  }
  for (const module of modules) ensureAnchor(hudModuleAnchor(module, defaultNode04Anchor(module.nodeType)));
  root.addEventListener("click", function (event) {
    const close = event.target && typeof event.target.closest === "function"
      ? event.target.closest("[data-node04-close]")
      : null;
    if (close) {
      state.node04.dialogue = null;
      renderNode04Hud();
      return;
    }
    const button = event.target && typeof event.target.closest === "function"
      ? event.target.closest("[data-node04-action]")
      : null;
    if (!button || button.disabled) return;
    runNode04Action(button.dataset.node04Action, button.dataset.node04TargetId || null, {
      questId: button.dataset.node04QuestId || null,
      dialogueId: button.dataset.node04DialogueId || null,
      entryId: button.dataset.node04EntryId || null,
      choiceId: button.dataset.node04ChoiceId || null
    });
  });
  return { root: root, anchors: anchors };
}

function node04AnchorFor(elements, module) {
  const fallback = defaultNode04Anchor(module.nodeType);
  const anchor = hudModuleAnchor(module, fallback);
  return elements.anchors[anchor] || elements.anchors[fallback] || elements.root;
}

function clearNode04Anchors(elements) {
  for (const anchor of Object.values(elements.anchors || {})) anchor.replaceChildren();
}

function node04ModuleCard(module, className) {
  const node = document.createElement("div");
  node.className = "node04Module " + className;
  node.dataset.moduleId = module.moduleId || module.nodeType || "";
  return node;
}

function node04TargetById(targetId) {
  const id = String(targetId || "").trim();
  if (!id) return null;
  return node04RuntimeTargetsForScene().find(function (target) {
    return String(target?.instanceId || "") === id || String(target?.targetId || "") === id;
  }) || null;
}

function node04ClientDistance(target) {
  if (!target || !state.position) return null;
  if (!Number.isFinite(Number(target.x)) || !Number.isFinite(Number(target.z))) return null;
  return Math.hypot(num(state.position.x, 0) - num(target.x, 0), num(state.position.z, 0) - num(target.z, 0));
}

function node04TargetWithClientRange(target) {
  if (!target) return null;
  const distance = node04ClientDistance(target);
  if (distance === null) return target;
  const range = Math.max(0, num(target.range, 0));
  const radius = Math.max(0, num(target.radius, 0));
  return Object.assign({}, target, {
    distance: round(distance),
    inRange: distance <= range + radius
  });
}

function node04RuntimeTargetsForScene() {
  const snapshot = state.node04.snapshot || {};
  const byId = new Map();
  const add = function (target) {
    if (!target || !target.instanceId) return;
    const decorated = node04TargetWithClientRange(Object.assign({
      entityKind: "quest",
      targetKind: "quest",
      available: true,
      action: "node04:move_marker",
      prompt: "Move"
    }, target));
    byId.set(decorated.instanceId, decorated);
  };
  for (const target of Array.isArray(snapshot.questTargets) ? snapshot.questTargets : []) add(target);
  for (const target of Array.isArray(snapshot.dialogueTargets) ? snapshot.dialogueTargets : []) add(target);
  return Array.from(byId.values());
}

function syncRuntimeTargets() {
  if (!state.runtime || typeof state.runtime.setRuntimeTargets !== "function") return;
  const targets = [];
  if (state.node03.snapshot && node03Modules().length) targets.push.apply(targets, node03RuntimeTargetsForScene());
  if (state.node04.snapshot && node04Modules().length) targets.push.apply(targets, node04RuntimeTargetsForScene());
  if (state.node05.snapshot && node05Modules().length) targets.push.apply(targets, node05RuntimeTargetsForScene());
  if (!targets.length) {
    if (typeof state.runtime.clearRuntimeTargets === "function") state.runtime.clearRuntimeTargets();
    return;
  }
  const byId = new Map();
  for (const target of targets) byId.set(target.instanceId, target);
  state.runtime.setRuntimeTargets(Array.from(byId.values()));
}

function refreshNode04ClientRanges(now = performance.now()) {
  if (!state.node04.snapshot || !node04Modules().length) return;
  if (now - num(state.node04.lastRangeRenderAt, 0) < 250) return;
  state.node04.lastRangeRenderAt = now;
  syncRuntimeTargets();
}

function node04PrimaryTarget() {
  const targets = node04RuntimeTargetsForScene();
  return targets.sort(function (left, right) {
    if (left.inRange !== right.inRange) return left.inRange ? -1 : 1;
    return num(left.distance, 999999) - num(right.distance, 999999);
  })[0] || null;
}

function appendNode04ActionButton(parent, label, action, target, questId, extra = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "node04ActionButton";
  button.dataset.node04Action = action;
  if (target?.instanceId) button.dataset.node04TargetId = target.instanceId;
  if (questId) button.dataset.node04QuestId = questId;
  if (extra.dialogueId) button.dataset.node04DialogueId = extra.dialogueId;
  if (extra.entryId) button.dataset.node04EntryId = extra.entryId;
  if (extra.choiceId) button.dataset.node04ChoiceId = extra.choiceId;
  button.textContent = label;
  button.disabled = state.node04.actionInFlight;
  parent.appendChild(button);
  return button;
}

function renderNode04QuestTracker(module, snapshot) {
  const card = node04ModuleCard(module, "node04Module--tracker");
  const title = document.createElement("div");
  title.className = "node04Title";
  title.textContent = "Quest";
  card.appendChild(title);
  const quest = snapshot?.trackedQuest || null;
  if (!quest) {
    const empty = document.createElement("p");
    empty.className = "node04Empty";
    empty.textContent = "Geen quest";
    card.appendChild(empty);
    return card;
  }
  const name = document.createElement("strong");
  name.className = "node04QuestName";
  name.textContent = quest.displayName || quest.questId;
  card.appendChild(name);
  const step = quest.activeStep || null;
  if (step) {
    const instruction = document.createElement("p");
    instruction.className = "node04Instruction";
    instruction.textContent = step.instruction || step.displayName || "";
    card.appendChild(instruction);
    for (const objective of Array.isArray(step.objectives) ? step.objectives : []) {
      const row = document.createElement("div");
      row.className = objective.complete ? "node04Objective node04Objective--done" : "node04Objective";
      const label = document.createElement("span");
      label.textContent = objective.instruction || objective.displayName || objective.objectiveType || "Objective";
      const value = document.createElement("strong");
      value.textContent = node03FormatNumber(objective.currentValue || 0) + " / " + node03FormatNumber(objective.requiredValue || 1);
      row.append(label, value);
      card.appendChild(row);
    }
    for (const condition of Array.isArray(step.conditions) ? step.conditions : []) {
      const row = document.createElement("div");
      row.className = condition.met ? "node04Condition node04Condition--done" : "node04Condition";
      row.textContent = condition.met ? "Level OK" : (condition.message || step.blockedReason || "Condition nodig");
      card.appendChild(row);
    }
  } else if (quest.status === "available") {
    const available = document.createElement("p");
    available.className = "node04Instruction";
    available.textContent = quest.summary || "Praat met het quest target.";
    card.appendChild(available);
  }
  const target = node04PrimaryTarget();
  const actions = document.createElement("div");
  actions.className = "node04Actions";
  if (target) {
    const action = target.action || "node04:move_marker";
    const label = target.inRange === false ? "Move" : (target.prompt || (action === "travel" ? "Travel" : "Use"));
    appendNode04ActionButton(actions, label, action, target, target.questId || quest.questId, { dialogueId: target.dialogueId || null });
  }
  if (quest.status === "active" && step?.canTurnIn) {
    appendNode04ActionButton(actions, "Turn in", "node04:turn_in", null, quest.questId);
  }
  if (quest.status === "active" && step?.canReach) {
    appendNode04ActionButton(actions, "Complete", "node04:reach", null, quest.questId);
  }
  if (actions.children.length) card.appendChild(actions);
  if (state.node04.lastActionMessage || state.node04.lastError) {
    const status = document.createElement("p");
    status.className = state.node04.lastError ? "node04Status node04Status--error" : "node04Status";
    status.textContent = state.node04.lastError || state.node04.lastActionMessage;
    card.appendChild(status);
  }
  return card;
}

function renderNode04Dialogue(module) {
  const dialogue = state.node04.dialogue;
  if (!dialogue) return null;
  const card = node04ModuleCard(module, "node04Module--dialogue");
  card.style.width = Math.max(280, Math.min(900, num(module.widthPx, 520))) + "px";
  const head = document.createElement("div");
  head.className = "node04DialogueHead";
  if (module.showSpeaker !== false) {
    const speaker = document.createElement("strong");
    speaker.textContent = dialogue.speakerName || dialogue.displayName || "Dialogue";
    head.appendChild(speaker);
  }
  const close = document.createElement("button");
  close.type = "button";
  close.className = "node04CloseButton";
  close.dataset.node04Close = "1";
  close.textContent = "Close";
  head.appendChild(close);
  const text = document.createElement("p");
  text.className = "node04DialogueText";
  text.textContent = dialogue.text || "";
  const choices = document.createElement("div");
  choices.className = "node04Choices";
  for (const choice of Array.isArray(dialogue.choices) ? dialogue.choices : []) {
    appendNode04ActionButton(choices, choice.label || "Continue", "node04:choose_dialogue", null, choice.questRef || null, {
      dialogueId: dialogue.dialogueId,
      entryId: dialogue.entryId,
      choiceId: choice.choiceId
    });
  }
  card.append(head, text, choices);
  return card;
}

function renderNode04Notifications(module, snapshot) {
  const notifications = Array.isArray(snapshot?.notifications) ? snapshot.notifications.slice(0, Math.max(1, Math.min(12, num(module.maxVisible, 3)))) : [];
  if (!notifications.length && !state.node04.lastActionMessage) return null;
  const card = node04ModuleCard(module, "node04Module--notifications");
  const list = notifications.length ? notifications : [{ text: state.node04.lastActionMessage }];
  for (const item of list) {
    const row = document.createElement("div");
    row.className = "node04Notification";
    row.textContent = item.text || "";
    card.appendChild(row);
  }
  return card;
}

function renderNode04Module(module, snapshot) {
  if (module.nodeType === "quest_tracker_hud") return renderNode04QuestTracker(module, snapshot);
  if (module.nodeType === "dialogue_hud") return renderNode04Dialogue(module, snapshot);
  if (module.nodeType === "notification_hud") return renderNode04Notifications(module, snapshot);
  return null;
}

function renderNode04Hud() {
  const modules = node04Modules();
  const snapshot = state.node04.snapshot;
  if (!modules.length || !snapshot) {
    removeNode04Hud();
    syncRuntimeTargets();
    return;
  }
  // Signature includes the live snapshot (+ the bits of state.node04 the renderer
  // reads), not just the static module config, so a poll/action that returns
  // unchanged data is a true no-op. Without this, every call destroyed and
  // recreated every panel regardless of whether anything changed - with several
  // node types now sharing one dock, that made a persistent panel (e.g. the quest
  // tracker) visibly jump every poll as siblings got torn down and rebuilt around it.
  const signature = node04ModuleSignature(modules) + "|" + JSON.stringify(snapshot) + "|" + JSON.stringify({
    actionInFlight: state.node04.actionInFlight,
    lastError: state.node04.lastError,
    lastActionMessage: state.node04.lastActionMessage,
    dialogue: state.node04.dialogue
  });
  if (state.node04.elements && state.node04.signature === signature) return;
  state.node04.elements = ensureGameHudRuntimeRoot();
  state.node04.signature = signature;
  clearGameHudFamily("node04");
  for (const module of modules) {
    const node = renderNode04Module(module, snapshot);
    if (!node) continue;
    appendGameHudPanel("node04", module, node, defaultNode04Anchor(module.nodeType));
  }
}

function scheduleNode04Poll() {
  if (state.node04.pollTimerId) return;
  state.node04.pollTimerId = window.setTimeout(async function () {
    state.node04.pollTimerId = 0;
    await loadNode04State({ silent: true });
    if (node04Modules().length) scheduleNode04Poll();
  }, 2500);
}

async function loadNode04State(options = {}) {
  if (!node04Modules().length) {
    removeNode04Hud();
    syncRuntimeTargets();
    return false;
  }
  if (state.node04.loadInFlight) return false;
  state.node04.loadInFlight = true;
  try {
    const response = await fetch("/api/game/node04/state", { headers: { Accept: "application/json" } });
    if (response.status === 401) {
      window.location.href = "/login/?next=%2Fgame%2F";
      return false;
    }
    const data = await response.json().catch(function () { return null; });
    if (!response.ok || !data || data.ok !== true) {
      state.node04.lastError = data?.message || "NODE-04 state niet beschikbaar.";
      if (!options.silent) showHudError(state.node04.lastError);
      renderNode04Hud();
      return false;
    }
    state.node04.snapshot = data;
    if (data.node03) state.node03.snapshot = data.node03;
    state.node04.lastLoadedAt = performance.now();
    state.node04.lastError = "";
    if (state.minimapHud.elements) state.minimapHud.dirty = true;
    syncRuntimeTargets();
    renderNode03Hud();
    renderNode04Hud();
    scheduleNode04Poll();
    return true;
  } catch (error) {
    state.node04.lastError = String(error?.message || error || "NODE-04 state mislukt.");
    if (!options.silent) showHudError(state.node04.lastError);
    renderNode04Hud();
    return false;
  } finally {
    state.node04.loadInFlight = false;
  }
}

async function runNode04Action(action, targetId, extra = {}) {
  const normalized = String(action || "").replace(/^node04:/, "");
  if (!normalized || state.node04.actionInFlight) return;
  if (normalized === "close_dialogue") {
    state.node04.dialogue = null;
    renderNode04Hud();
    return;
  }
  if (action === "travel" || normalized === "travel") {
    await runNode03Action("travel", targetId);
    await loadNode04State({ silent: true });
    return;
  }
  const currentTarget = node04TargetWithClientRange(node04TargetById(targetId));
  if (currentTarget?.instanceId && currentTarget.available !== false && currentTarget.inRange === false && Number.isFinite(Number(currentTarget.x)) && Number.isFinite(Number(currentTarget.z))) {
    const started = startClickToMoveTarget(num(currentTarget.x, 0), num(currentTarget.z, 0), "node04-target");
    state.node04.lastActionMessage = started
      ? "Loop naar " + (currentTarget.displayName || "quest target") + "."
      : (currentTarget.displayName || "Quest target") + " is buiten range.";
    renderNode04Hud();
    return;
  }
  if (normalized === "move_marker") {
    if (currentTarget && Number.isFinite(Number(currentTarget.x)) && Number.isFinite(Number(currentTarget.z))) {
      startClickToMoveTarget(num(currentTarget.x, 0), num(currentTarget.z, 0), "node04-marker");
    }
    return;
  }
  state.node04.actionInFlight = true;
  state.node04.lastError = "";
  renderNode04Hud();
  try {
    const response = await fetch("/api/game/node04/action", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        action: normalized,
        targetId: currentTarget?.targetId || targetId || null,
        questId: extra.questId || currentTarget?.questId || state.node04.snapshot?.trackedQuest?.questId || null,
        dialogueId: extra.dialogueId || currentTarget?.dialogueId || null,
        entryId: extra.entryId || null,
        choiceId: extra.choiceId || null,
        operationId: "node04:" + state.net.clientSessionId + ":" + Date.now() + ":" + Math.random().toString(36).slice(2, 8)
      })
    });
    if (response.status === 401) {
      window.location.href = "/login/?next=%2Fgame%2F";
      return;
    }
    const data = await response.json().catch(function () { return null; });
    if (!response.ok || !data || data.ok !== true) {
      state.node04.lastError = data?.message || "NODE-04 actie mislukt.";
      showHudError(state.node04.lastError);
      return;
    }
    state.node04.lastActionMessage = data.message || "";
    if (Object.prototype.hasOwnProperty.call(data, "dialogue")) state.node04.dialogue = data.dialogue || null;
    if (data.snapshot) {
      state.node04.snapshot = data.snapshot;
      if (data.snapshot.node03) state.node03.snapshot = data.snapshot.node03;
      if (state.minimapHud.elements) state.minimapHud.dirty = true;
      syncRuntimeTargets();
    }
    renderNode03Hud();
    renderNode04Hud();
  } catch (error) {
    state.node04.lastError = String(error?.message || error || "NODE-04 actie mislukt.");
    showHudError(state.node04.lastError);
  } finally {
    state.node04.actionInFlight = false;
    await loadNode04State({ silent: true });
    await loadNode03State({ silent: true });
  }
}

// ---- NODE-05 runtime HUD: economy, crafting, party, market and mail ----

function node05Modules() {
  const snapshotModules = Array.isArray(state.node05.snapshot?.ui?.modules) ? state.node05.snapshot.ui.modules : null;
  const project = state.gameProject || state.gameWorld?.gameProject || null;
  const projectModules = Array.isArray(project?.ui?.modules) ? project.ui.modules : [];
  const modules = snapshotModules || projectModules;
  return modules.filter(function (module) {
    return module && NODE05_HUD_TYPES.has(module.nodeType);
  });
}

function node05ModuleSignature(modules) {
  return JSON.stringify(modules.map(function (module) {
    return {
      nodeType: module.nodeType,
      moduleId: module.moduleId,
      anchor: module.anchor,
      maxOffers: module.maxOffers,
      maxRecipes: module.maxRecipes,
      pageSize: module.pageSize,
      maxMessages: module.maxMessages,
      showInvite: module.showInvite,
      showJobs: module.showJobs,
      showMyOrders: module.showMyOrders,
      showClaimAll: module.showClaimAll
    };
  }));
}

function defaultNode05Anchor(nodeType) {
  return NODE05_DEFAULT_HUD_ANCHORS[nodeType] || "center";
}

function removeNode05Hud() {
  clearGameHudFamily("node05");
  state.node05.elements = null;
  state.node05.signature = "";
}

function node05ModuleCard(module, className) {
  const node = document.createElement("div");
  node.className = "node05Module " + className;
  node.dataset.moduleId = module.moduleId || module.nodeType || "";
  return node;
}

function appendNode05Title(card, title) {
  const node = document.createElement("div");
  node.className = "node05Title";
  node.textContent = title;
  card.appendChild(node);
  return node;
}

function appendNode05Empty(card, text) {
  const node = document.createElement("p");
  node.className = "node05Empty";
  node.textContent = text;
  card.appendChild(node);
  return node;
}

function appendNode05Status(card) {
  if (!state.node05.lastActionMessage && !state.node05.lastError) return;
  const status = document.createElement("p");
  status.className = state.node05.lastError ? "node05Status node05Status--error" : "node05Status";
  status.textContent = state.node05.lastError || state.node05.lastActionMessage;
  card.appendChild(status);
}

function node05CurrencyLabel(amount, currencyName) {
  return node03FormatNumber(amount || 0) + (currencyName ? " " + currencyName : "");
}

function node05DistanceLabel(target) {
  if (!target) return "";
  const parts = [];
  if (target.distance !== null && target.distance !== undefined) parts.push(node03FormatNumber(target.distance) + "m");
  parts.push(target.inRange === false ? "out of range" : "in range");
  return parts.join(" - ");
}

function node05ServiceInstanceId(target) {
  if (!target) return "";
  return "node05:" + String(target.kind || target.targetKind || "service") + ":" + String(target.id || target.targetId || "");
}

function node05ClientDistance(target) {
  if (!target || !state.position) return null;
  if (!Number.isFinite(Number(target.x)) || !Number.isFinite(Number(target.z))) return null;
  return Math.hypot(num(state.position.x, 0) - num(target.x, 0), num(state.position.z, 0) - num(target.z, 0));
}

function node05TargetWithClientRange(target) {
  if (!target) return null;
  const distance = node05ClientDistance(target);
  if (distance === null) return target;
  const range = Math.max(0, num(target.range, 0));
  const radius = Math.max(0, num(target.radius, 0));
  return Object.assign({}, target, {
    distance: round(distance),
    inRange: distance <= range + radius
  });
}

function node05CraftingStations() {
  const stations = Array.isArray(state.node05.snapshot?.crafting?.stations) ? state.node05.snapshot.crafting.stations : [];
  return stations.map(function (station) {
    return node05TargetWithClientRange(Object.assign({
      kind: "crafting",
      targetKind: "crafting",
      id: station.stationId,
      targetId: station.stationId,
      label: station.linkedEntity?.label || station.displayName || station.stationId,
      prompt: station.interactionPrompt || "Craft"
    }, station));
  }).filter(Boolean);
}

function node05Vendors() {
  const vendors = Array.isArray(state.node05.snapshot?.vendors?.vendors) ? state.node05.snapshot.vendors.vendors : [];
  return vendors.map(function (vendor) {
    return node05TargetWithClientRange(Object.assign({
      kind: "vendor",
      targetKind: "vendor",
      id: vendor.vendorId,
      targetId: vendor.vendorId,
      label: vendor.displayName || vendor.linkedEntity?.label || vendor.vendorId,
      prompt: vendor.interactionPrompt || "Trade"
    }, vendor));
  }).filter(Boolean);
}

function node05MarketAccesses() {
  const accesses = Array.isArray(state.node05.snapshot?.market?.accesses) ? state.node05.snapshot.market.accesses : [];
  return accesses.map(function (access) {
    return node05TargetWithClientRange(Object.assign({
      kind: "market",
      targetKind: "market",
      id: access.marketAccessId,
      targetId: access.marketAccessId,
      label: access.linkedEntity?.label || access.marketAccessId,
      prompt: access.interactionPrompt || "Market"
    }, access));
  }).filter(Boolean);
}

function node05Nearest(entries) {
  return entries.slice().sort(function (left, right) {
    if (left.inRange !== right.inRange) return left.inRange ? -1 : 1;
    return num(left.distance, 999999) - num(right.distance, 999999);
  })[0] || null;
}

function node05RuntimeTargetsForScene() {
  const targets = node05CraftingStations().concat(node05Vendors(), node05MarketAccesses());
  return targets.map(function (target) {
    return Object.assign({}, target, {
      instanceId: node05ServiceInstanceId(target),
      entityKind: "service",
      available: true,
      action: "node05:focus_service",
      displayName: target.label || target.id,
      prompt: target.inRange === false ? "Move" : (target.prompt || "Use"),
      radius: 0
    });
  });
}

function node05TargetById(targetId) {
  const id = String(targetId || "").trim();
  if (!id) return null;
  return node05RuntimeTargetsForScene().find(function (target) {
    return String(target.instanceId || "") === id || String(target.targetId || "") === id || String(target.id || "") === id;
  }) || null;
}

function appendNode05ActionButton(parent, label, action, payload = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "node05ActionButton";
  button.dataset.node05Action = action;
  const datasetMap = {
    targetId: "node05TargetId",
    stationId: "node05StationId",
    recipeId: "node05RecipeId",
    jobId: "node05JobId",
    vendorId: "node05VendorId",
    offerId: "node05OfferId",
    orderId: "node05OrderId",
    mailId: "node05MailId",
    inviteId: "node05InviteId",
    targetPlayerId: "node05TargetPlayerId",
    itemId: "node05ItemId",
    currencyId: "node05CurrencyId",
    quantity: "node05Quantity",
    unitPriceMinor: "node05UnitPriceMinor"
  };
  for (const [key, dataKey] of Object.entries(datasetMap)) {
    if (payload[key] !== null && payload[key] !== undefined && payload[key] !== "") button.dataset[dataKey] = String(payload[key]);
  }
  button.textContent = label;
  button.disabled = state.node05.actionInFlight || payload.disabled === true;
  parent.appendChild(button);
  return button;
}

function appendNode05MoveButton(parent, target, label = "Move") {
  if (!target) return null;
  return appendNode05ActionButton(parent, label, "node05:move_target", { targetId: node05ServiceInstanceId(target) });
}

function renderNode05Party(module, snapshot) {
  const card = node05ModuleCard(module, "node05Module--party");
  appendNode05Title(card, "Party");
  const partySnapshot = snapshot.party || {};
  const party = partySnapshot.party || null;
  const invites = Array.isArray(partySnapshot.invites) ? partySnapshot.invites : [];
  const onlinePlayers = Array.isArray(partySnapshot.onlinePlayers) ? partySnapshot.onlinePlayers : [];

  const actions = document.createElement("div");
  actions.className = "node05Actions";
  if (!party) {
    appendNode05Empty(card, "Geen party");
    appendNode05ActionButton(actions, "Create", "party_create");
  } else {
    const list = document.createElement("div");
    list.className = "node05List";
    for (const member of Array.isArray(party.members) ? party.members : []) {
      const row = document.createElement("div");
      row.className = "node05Row";
      const body = document.createElement("div");
      body.className = "node05RowBody";
      const name = document.createElement("strong");
      name.textContent = member.displayName || member.playerId;
      const meta = document.createElement("span");
      meta.textContent = (member.role || "member") + " - " + (member.online ? "online" : "offline");
      body.append(name, meta);
      row.appendChild(body);
      list.appendChild(row);
    }
    card.appendChild(list);
    appendNode05ActionButton(actions, "Leave", "party_leave");
  }
  if (actions.children.length) card.appendChild(actions);

  if (invites.length) {
    const title = document.createElement("div");
    title.className = "node05SubTitle";
    title.textContent = "Invites";
    card.appendChild(title);
    for (const invite of invites) {
      const row = document.createElement("div");
      row.className = "node05Row";
      const body = document.createElement("div");
      body.className = "node05RowBody";
      const name = document.createElement("strong");
      name.textContent = invite.inviterName || invite.inviterPlayerId;
      const meta = document.createElement("span");
      meta.textContent = "party invite";
      body.append(name, meta);
      const rowActions = document.createElement("div");
      rowActions.className = "node05InlineActions";
      appendNode05ActionButton(rowActions, "Accept", "party_accept", { mailId: null, targetId: null, orderId: null, jobId: null, inviteId: invite.inviteId });
      const button = rowActions.querySelector("[data-node05-action]");
      if (button) button.dataset.node05InviteId = invite.inviteId;
      row.append(body, rowActions);
      card.appendChild(row);
    }
  }

  if (module.showInvite !== false) {
    const title = document.createElement("div");
    title.className = "node05SubTitle";
    title.textContent = "Online";
    card.appendChild(title);
    if (!onlinePlayers.length) {
      appendNode05Empty(card, "Geen andere online spelers");
    }
    for (const player of onlinePlayers.slice(0, 5)) {
      const row = document.createElement("div");
      row.className = "node05Row";
      const body = document.createElement("div");
      body.className = "node05RowBody";
      const name = document.createElement("strong");
      name.textContent = player.displayName || player.playerId;
      const meta = document.createElement("span");
      meta.textContent = player.zoneId || "online";
      body.append(name, meta);
      const rowActions = document.createElement("div");
      rowActions.className = "node05InlineActions";
      appendNode05ActionButton(rowActions, "Invite", "party_invite", { targetPlayerId: player.playerId });
      row.append(body, rowActions);
      card.appendChild(row);
    }
  }
  appendNode05Status(card);
  return card;
}

function renderNode05Crafting(module, snapshot) {
  const card = node05ModuleCard(module, "node05Module--crafting");
  appendNode05Title(card, "Crafting");
  const station = node05Nearest(node05CraftingStations());
  if (!station) {
    appendNode05Empty(card, "Geen crafting station in deze zone");
    appendNode05Status(card);
    return card;
  }
  const stationLine = document.createElement("p");
  stationLine.className = "node05Meta";
  stationLine.textContent = (station.label || station.stationId) + " - " + node05DistanceLabel(station);
  card.appendChild(stationLine);
  if (station.inRange === false) {
    const actions = document.createElement("div");
    actions.className = "node05Actions";
    appendNode05MoveButton(actions, station);
    card.appendChild(actions);
  }
  const recipes = Array.isArray(station.recipes) ? station.recipes.slice(0, Math.max(1, Math.min(20, num(module.maxRecipes, 8)))) : [];
  if (!recipes.length) appendNode05Empty(card, "Geen recipes");
  for (const recipe of recipes) {
    const row = document.createElement("div");
    row.className = "node05Row node05Row--stack";
    const body = document.createElement("div");
    body.className = "node05RowBody";
    const name = document.createElement("strong");
    name.textContent = recipe.displayName || recipe.recipeId;
    const ingredients = document.createElement("span");
    ingredients.textContent = (Array.isArray(recipe.ingredients) ? recipe.ingredients : []).map(function (ingredient) {
      return (ingredient.displayName || ingredient.itemRef || ingredient.currencyRef || "Ingredient") + " " + node03FormatNumber(ingredient.owned || 0) + "/" + node03FormatNumber(ingredient.required || 1);
    }).join(", ") || "no inputs";
    const outputs = document.createElement("span");
    outputs.textContent = "-> " + ((Array.isArray(recipe.outputs) ? recipe.outputs : []).map(function (output) {
      return node03FormatNumber(output.amount || output.amountMinor || 0) + " " + (output.displayName || output.itemId || output.currencyId);
    }).join(", ") || "output");
    body.append(name, ingredients, outputs);
    const rowActions = document.createElement("div");
    rowActions.className = "node05InlineActions";
    if (station.inRange === false) {
      appendNode05MoveButton(rowActions, station);
    } else {
      appendNode05ActionButton(rowActions, "Craft", "craft", {
        stationId: station.stationId,
        recipeId: recipe.recipeId,
        disabled: !recipe.canCraft
      });
    }
    row.append(body, rowActions);
    card.appendChild(row);
  }
  if (module.showJobs !== false) {
    const jobs = Array.isArray(snapshot.crafting?.jobs) ? snapshot.crafting.jobs : [];
    if (jobs.length) {
      const title = document.createElement("div");
      title.className = "node05SubTitle";
      title.textContent = "Jobs";
      card.appendChild(title);
      for (const job of jobs.slice(0, 4)) {
        const row = document.createElement("div");
        row.className = "node05Row";
        const body = document.createElement("div");
        body.className = "node05RowBody";
        const name = document.createElement("strong");
        name.textContent = job.recipeId;
        const meta = document.createElement("span");
        meta.textContent = job.state + (job.canClaim ? " - ready" : "");
        body.append(name, meta);
        const rowActions = document.createElement("div");
        rowActions.className = "node05InlineActions";
        appendNode05ActionButton(rowActions, "Claim", "crafting:claim", { jobId: job.jobId, disabled: !job.canClaim });
        row.append(body, rowActions);
        card.appendChild(row);
      }
    }
  }
  appendNode05Status(card);
  return card;
}

function renderNode05Vendor(module) {
  const card = node05ModuleCard(module, "node05Module--vendor");
  appendNode05Title(card, "Vendor");
  const vendor = node05Nearest(node05Vendors());
  if (!vendor) {
    appendNode05Empty(card, "Geen vendor in deze zone");
    appendNode05Status(card);
    return card;
  }
  const meta = document.createElement("p");
  meta.className = "node05Meta";
  meta.textContent = (vendor.label || vendor.displayName || vendor.vendorId) + " - " + node05DistanceLabel(vendor);
  card.appendChild(meta);
  if (vendor.inRange === false) {
    const actions = document.createElement("div");
    actions.className = "node05Actions";
    appendNode05MoveButton(actions, vendor);
    card.appendChild(actions);
  }
  const offers = Array.isArray(vendor.offers) ? vendor.offers.slice(0, Math.max(1, Math.min(30, num(module.maxOffers, 8)))) : [];
  if (!offers.length) appendNode05Empty(card, "Geen offers");
  for (const offer of offers) {
    const row = document.createElement("div");
    row.className = "node05Row";
    const body = document.createElement("div");
    body.className = "node05RowBody";
    const name = document.createElement("strong");
    name.textContent = offer.displayName || offer.itemRef;
    const parts = [];
    if (["sell_to_player", "both"].includes(offer.mode)) parts.push("buy " + node05CurrencyLabel(offer.sellPriceMinor, offer.sellCurrencyRef));
    if (["buy_from_player", "both"].includes(offer.mode)) parts.push("sell " + node05CurrencyLabel(offer.buyPriceMinor, offer.buyCurrencyRef));
    if (offer.owned) parts.push("own " + node03FormatNumber(offer.owned));
    if (offer.stock !== null && offer.stock !== undefined) parts.push("stock " + node03FormatNumber(offer.stock));
    const detail = document.createElement("span");
    detail.textContent = parts.join(" - ") || offer.mode;
    body.append(name, detail);
    const rowActions = document.createElement("div");
    rowActions.className = "node05InlineActions";
    if (vendor.inRange === false) {
      appendNode05MoveButton(rowActions, vendor);
    } else {
      if (["sell_to_player", "both"].includes(offer.mode)) {
        appendNode05ActionButton(rowActions, "Buy", "vendor_buy", {
          vendorId: vendor.vendorId,
          offerId: offer.offerId,
          quantity: 1,
          disabled: !offer.canBuy
        });
      }
      if (module.showSellTab !== false && ["buy_from_player", "both"].includes(offer.mode)) {
        appendNode05ActionButton(rowActions, "Sell", "vendor_sell", {
          vendorId: vendor.vendorId,
          offerId: offer.offerId,
          quantity: 1,
          disabled: !offer.canSell
        });
      }
    }
    row.append(body, rowActions);
    card.appendChild(row);
  }
  appendNode05Status(card);
  return card;
}

function renderNode05Market(module, snapshot) {
  const card = node05ModuleCard(module, "node05Module--market");
  appendNode05Title(card, "Market");
  const access = node05Nearest(node05MarketAccesses());
  const hasRemoteAccess = access?.remoteAccessAllowed === true;
  const canAccess = !access || hasRemoteAccess || access.inRange !== false;
  if (access) {
    const meta = document.createElement("p");
    meta.className = "node05Meta";
    meta.textContent = (access.label || access.marketAccessId) + " - " + (hasRemoteAccess ? "remote" : node05DistanceLabel(access));
    card.appendChild(meta);
    if (!canAccess) {
      const actions = document.createElement("div");
      actions.className = "node05Actions";
      appendNode05MoveButton(actions, access);
      card.appendChild(actions);
    }
  } else {
    appendNode05Empty(card, "Geen market board in deze zone");
  }

  const sellable = Array.isArray(snapshot.market?.sellableItems) ? snapshot.market.sellableItems.slice(0, 4) : [];
  if (sellable.length) {
    const title = document.createElement("div");
    title.className = "node05SubTitle";
    title.textContent = "Sell";
    card.appendChild(title);
    for (const item of sellable) {
      const row = document.createElement("div");
      row.className = "node05Row";
      const body = document.createElement("div");
      body.className = "node05RowBody";
      const name = document.createElement("strong");
      name.textContent = item.displayName || item.itemId;
      const detail = document.createElement("span");
      detail.textContent = "own " + node03FormatNumber(item.quantity) + " - price " + node03FormatNumber(item.suggestedPriceMinor || 1);
      body.append(name, detail);
      const rowActions = document.createElement("div");
      rowActions.className = "node05InlineActions";
      appendNode05ActionButton(rowActions, "List", "market_list", {
        itemId: item.itemId,
        quantity: 1,
        unitPriceMinor: item.suggestedPriceMinor || 1,
        disabled: !canAccess
      });
      row.append(body, rowActions);
      card.appendChild(row);
    }
  }

  const orders = Array.isArray(snapshot.market?.orders) ? snapshot.market.orders.slice(0, Math.max(1, Math.min(30, num(module.pageSize, 8)))) : [];
  const visibleOrders = orders.filter(function (order) { return !order.mine; });
  if (visibleOrders.length) {
    const title = document.createElement("div");
    title.className = "node05SubTitle";
    title.textContent = "Buy";
    card.appendChild(title);
    for (const order of visibleOrders) {
      const row = document.createElement("div");
      row.className = "node05Row";
      const body = document.createElement("div");
      body.className = "node05RowBody";
      const name = document.createElement("strong");
      name.textContent = order.displayName || order.itemId;
      const detail = document.createElement("span");
      detail.textContent = node03FormatNumber(order.quantityRemaining) + "x - " + node05CurrencyLabel(order.unitPriceMinor, order.currencyName);
      body.append(name, detail);
      const rowActions = document.createElement("div");
      rowActions.className = "node05InlineActions";
      appendNode05ActionButton(rowActions, "Buy", "market_buy", {
        orderId: order.orderId,
        quantity: 1,
        disabled: !canAccess
      });
      row.append(body, rowActions);
      card.appendChild(row);
    }
  }

  if (module.showMyOrders !== false) {
    const mine = Array.isArray(snapshot.market?.myOrders) ? snapshot.market.myOrders : [];
    if (mine.length) {
      const title = document.createElement("div");
      title.className = "node05SubTitle";
      title.textContent = "My Orders";
      card.appendChild(title);
      for (const order of mine.slice(0, 4)) {
        const row = document.createElement("div");
        row.className = "node05Row";
        const body = document.createElement("div");
        body.className = "node05RowBody";
        const name = document.createElement("strong");
        name.textContent = order.displayName || order.itemId;
        const detail = document.createElement("span");
        detail.textContent = node03FormatNumber(order.quantityRemaining) + "x listed";
        body.append(name, detail);
        const rowActions = document.createElement("div");
        rowActions.className = "node05InlineActions";
        appendNode05ActionButton(rowActions, "Cancel", "market_cancel", { orderId: order.orderId });
        row.append(body, rowActions);
        card.appendChild(row);
      }
    }
  }
  if (!sellable.length && !visibleOrders.length) appendNode05Empty(card, "Geen market items");
  appendNode05Status(card);
  return card;
}

function renderNode05Mail(module, snapshot) {
  const card = node05ModuleCard(module, "node05Module--mail");
  appendNode05Title(card, "Mail");
  const messages = Array.isArray(snapshot.mail?.messages) ? snapshot.mail.messages.slice(0, Math.max(1, Math.min(30, num(module.maxMessages, 5)))) : [];
  const claimable = messages.some(function (message) { return message.canClaim; });
  if (module.showClaimAll !== false && claimable) {
    const actions = document.createElement("div");
    actions.className = "node05Actions";
    appendNode05ActionButton(actions, "Claim all", "mail_claim_all");
    card.appendChild(actions);
  }
  if (!messages.length) {
    appendNode05Empty(card, "Geen mail");
    appendNode05Status(card);
    return card;
  }
  for (const message of messages) {
    const row = document.createElement("div");
    row.className = "node05Row node05Row--stack";
    const body = document.createElement("div");
    body.className = "node05RowBody";
    const subject = document.createElement("strong");
    subject.textContent = message.subject || message.mailType || "Mail";
    const attachments = document.createElement("span");
    attachments.textContent = (Array.isArray(message.attachments) ? message.attachments : []).filter(function (attachment) {
      return attachment.state === "available";
    }).map(function (attachment) {
      return node03FormatNumber(attachment.quantityMinor || 0) + " " + (attachment.displayName || attachment.assetId);
    }).join(", ") || message.state;
    body.append(subject, attachments);
    const rowActions = document.createElement("div");
    rowActions.className = "node05InlineActions";
    appendNode05ActionButton(rowActions, "Claim", "mail_claim", { mailId: message.mailId, disabled: !message.canClaim });
    row.append(body, rowActions);
    card.appendChild(row);
  }
  appendNode05Status(card);
  return card;
}

function renderNode05Trade(module, snapshot) {
  const card = node05ModuleCard(module, "node05Module--trade");
  appendNode05Title(card, "Trade");
  const sessions = Array.isArray(snapshot.trade?.sessions) ? snapshot.trade.sessions : [];
  if (!sessions.length) {
    appendNode05Empty(card, snapshot.trade?.message || "Geen actieve trade");
    appendNode05Status(card);
    return card;
  }
  for (const session of sessions) {
    const row = document.createElement("div");
    row.className = "node05Row";
    const body = document.createElement("div");
    body.className = "node05RowBody";
    const name = document.createElement("strong");
    name.textContent = session.tradeId;
    const meta = document.createElement("span");
    meta.textContent = session.state;
    body.append(name, meta);
    row.appendChild(body);
    card.appendChild(row);
  }
  appendNode05Status(card);
  return card;
}

function renderNode05Module(module, snapshot) {
  if (module.nodeType === "party_hud") return renderNode05Party(module, snapshot);
  if (module.nodeType === "crafting_hud") return renderNode05Crafting(module, snapshot);
  if (module.nodeType === "vendor_hud") return renderNode05Vendor(module, snapshot);
  if (module.nodeType === "market_hud") return renderNode05Market(module, snapshot);
  if (module.nodeType === "mail_hud") return renderNode05Mail(module, snapshot);
  if (module.nodeType === "trade_hud") return renderNode05Trade(module, snapshot);
  return null;
}

function renderNode05Hud() {
  const modules = node05Modules();
  const snapshot = state.node05.snapshot;
  if (!modules.length || !snapshot) {
    removeNode05Hud();
    syncRuntimeTargets();
    return;
  }
  // See renderNode03Hud/renderNode04Hud: signature includes the live snapshot (+
  // the state.node05 bits the renderer reads), so an unchanged poll/action skips
  // the destroy+rebuild instead of always tearing down every panel.
  const signature = node05ModuleSignature(modules) + "|" + JSON.stringify(snapshot) + "|" + JSON.stringify({
    actionInFlight: state.node05.actionInFlight,
    lastError: state.node05.lastError,
    lastActionMessage: state.node05.lastActionMessage
  });
  if (!state.node05.elements || state.node05.signature !== signature) {
    state.node05.elements = ensureGameHudRuntimeRoot();
    state.node05.signature = signature;
    clearGameHudFamily("node05");
    for (const module of modules) {
      const node = renderNode05Module(module, snapshot);
      if (!node) continue;
      appendGameHudPanel("node05", module, node, defaultNode05Anchor(module.nodeType));
    }
  }
  syncRuntimeTargets();
}

function scheduleNode05Poll() {
  if (state.node05.pollTimerId) return;
  state.node05.pollTimerId = window.setTimeout(async function () {
    state.node05.pollTimerId = 0;
    await loadNode05State({ silent: true });
    if (node05Modules().length) scheduleNode05Poll();
  }, 3500);
}

async function loadNode05State(options = {}) {
  if (state.node05.loadInFlight) return false;
  state.node05.loadInFlight = true;
  try {
    const response = await fetch("/api/game/node05/state", { headers: { Accept: "application/json" } });
    if (response.status === 401) {
      window.location.href = "/login/?next=%2Fgame%2F";
      return false;
    }
    const data = await response.json().catch(function () { return null; });
    if (!response.ok || !data || data.ok !== true) {
      state.node05.lastError = data?.message || "NODE-05 state niet beschikbaar.";
      if (!options.silent) showHudError(state.node05.lastError);
      renderNode05Hud();
      return false;
    }
    state.node05.snapshot = data;
    if (data.node03) state.node03.snapshot = data.node03;
    state.node05.lastLoadedAt = performance.now();
    state.node05.lastError = "";
    if (state.minimapHud.elements) state.minimapHud.dirty = true;
    syncRuntimeTargets();
    renderNode03Hud();
    renderNode05Hud();
    if (node05Modules().length) scheduleNode05Poll();
    return true;
  } catch (error) {
    state.node05.lastError = String(error?.message || error || "NODE-05 state mislukt.");
    if (!options.silent) showHudError(state.node05.lastError);
    renderNode05Hud();
    return false;
  } finally {
    state.node05.loadInFlight = false;
  }
}

function refreshNode05ClientRanges(now = performance.now()) {
  if (!state.node05.snapshot || !node05Modules().length) return;
  if (now - num(state.node05.lastRangeRenderAt, 0) < 350) return;
  state.node05.lastRangeRenderAt = now;
  syncRuntimeTargets();
}

async function runNode05Action(action, payload = {}) {
  const normalized = String(action || "").replace(/^node05:/, "").toLowerCase();
  if (!normalized || state.node05.actionInFlight) return;
  const currentTarget = node05TargetWithClientRange(node05TargetById(payload.targetId));
  if (normalized === "focus_service" || normalized === "move_target") {
    if (currentTarget && Number.isFinite(Number(currentTarget.x)) && Number.isFinite(Number(currentTarget.z))) {
      const started = startClickToMoveTarget(num(currentTarget.x, 0), num(currentTarget.z, 0), "node05-target");
      state.node05.lastActionMessage = started
        ? "Loop naar " + (currentTarget.displayName || currentTarget.label || "service") + "."
        : (currentTarget.displayName || currentTarget.label || "Service") + " is al dichtbij.";
      renderNode05Hud();
    }
    return;
  }
  if (currentTarget?.instanceId && currentTarget.inRange === false && Number.isFinite(Number(currentTarget.x)) && Number.isFinite(Number(currentTarget.z))) {
    const started = startClickToMoveTarget(num(currentTarget.x, 0), num(currentTarget.z, 0), "node05-target");
    state.node05.lastActionMessage = started
      ? "Loop naar " + (currentTarget.displayName || currentTarget.label || "service") + "."
      : (currentTarget.displayName || currentTarget.label || "Service") + " is buiten range.";
    renderNode05Hud();
    return;
  }

  state.node05.actionInFlight = true;
  state.node05.lastError = "";
  renderNode05Hud();
  try {
    const response = await fetch("/api/game/node05/action", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        action: normalized,
        stationId: payload.stationId || null,
        recipeId: payload.recipeId || null,
        jobId: payload.jobId || null,
        vendorId: payload.vendorId || null,
        offerId: payload.offerId || null,
        orderId: payload.orderId || null,
        mailId: payload.mailId || null,
        inviteId: payload.inviteId || null,
        targetPlayerId: payload.targetPlayerId || null,
        itemId: payload.itemId || null,
        currencyId: payload.currencyId || null,
        quantity: payload.quantity === null || payload.quantity === undefined ? null : Number(payload.quantity),
        unitPriceMinor: payload.unitPriceMinor === null || payload.unitPriceMinor === undefined ? null : Number(payload.unitPriceMinor),
        operationId: "node05:" + state.net.clientSessionId + ":" + Date.now() + ":" + Math.random().toString(36).slice(2, 8)
      })
    });
    if (response.status === 401) {
      window.location.href = "/login/?next=%2Fgame%2F";
      return;
    }
    const data = await response.json().catch(function () { return null; });
    if (!response.ok || !data || data.ok !== true) {
      state.node05.lastError = data?.message || "NODE-05 actie mislukt.";
      showHudError(state.node05.lastError);
      return;
    }
    state.node05.lastActionMessage = data.message || "";
    if (data.snapshot) {
      state.node05.snapshot = data.snapshot;
      if (data.snapshot.node03) state.node03.snapshot = data.snapshot.node03;
      if (state.minimapHud.elements) state.minimapHud.dirty = true;
      syncRuntimeTargets();
    }
    renderNode03Hud();
    renderNode05Hud();
  } catch (error) {
    state.node05.lastError = String(error?.message || error || "NODE-05 actie mislukt.");
    showHudError(state.node05.lastError);
  } finally {
    state.node05.actionInFlight = false;
    await loadNode05State({ silent: true });
    await loadNode03State({ silent: true });
  }
}

function resetMmoDebugRuntimeState() {
  state.debug.lastSentType = null;
  state.debug.lastSentAt = null;
  state.debug.lastSentSeq = 0;
  state.debug.lastReceivedType = null;
  state.debug.lastReceivedAt = null;
  state.debug.lastPacketType = null;
  state.debug.lastPacketAt = null;
  state.debug.lastSourceSessionId = null;
  state.debug.lastAckedSeq = 0;
  state.debug.lastIgnoredReason = null;
  state.debug.lastTransport = null;
  state.debug.lastServerRevision = 0;
  state.debug.lastServerClientInputSeq = 0;
  state.debug.lastServerControllerEpoch = 0;
  state.debug.lastServerSeq = 0;
  state.debug.lastError = null;
  state.debug.pingMs = null;
  state.debug.avgPingMs = null;
  state.debug.jitterMs = null;
  state.debug.maxPingMs = null;
  state.debug.lastPongAgeMs = null;
  state.debug.packetAgeMs = null;
  state.debug.remoteBufferDelayMs = null;
  state.net.lastSentInputSeq = 0;
  state.net.lastAckedInputSeq = 0;
  state.net.lastAppliedServerRevision = 0;
  state.net.lastAppliedServerUpdatedAt = "";
  state.net.pendingInputs = [];
  state.net.lastLocalInputAt = 0;
  state.net.postInputPredictionHoldUntil = 0;
  state.net.lastServerPositionAt = 0;
  state.net.lastServerClientInputSeq = 0;
  state.net.lastServerControllerEpoch = 0;
  state.net.lastServerSeq = 0;
  state.net.lastServerPacketAt = 0;
  state.net.clockOffsetMs = 0;
  state.net.lastTransport = null;
  state.net.lastIgnoredReason = null;
  state.netPing.samples = [];
  state.netPing.lastSentAt = 0;
  state.netPing.lastPongAt = 0;
  state.netPing.lastRttMs = null;
  state.remote.players.clear();
  state.remote.tombstones.clear();
  state.remote.interpolationDelayMs = mmoNetworkSettings().remoteInterpolationBaseDelayMs;
  state.remote.remoteRenderDelayMs = mmoNetworkSettings().remoteInterpolationBaseDelayMs;
  state.remote.lastPacketAt = 0;
  state.remote.lastPacketType = null;
  state.remote.lastRemoteEventType = null;
  state.remote.droppedStaleUpdates = 0;
  state.remote.droppedRemoteSamples = 0;
  state.remote.hardSnapCount = 0;
  state.remote.smoothFrameCount = 0;
  state.remote.remoteCatchupCount = 0;
  state.remote.lastSnapshotAt = 0;
  state.remote.lastSnapshotSeq = 0;
  state.remote.lastSnapshotServerTimeMs = 0;
  state.remote.lastSnapshotIntervals = [];
  state.remote.avgSnapshotIntervalMs = 0;
  state.remote.maxSnapshotIntervalMs = 0;
  state.remote.maxVisualFreezeMs = 0;
  state.remote.maxObserverLagMs = 0;
  state.remote.maxRemoteJump = 0;
  state.remote.lastSnapshotPlayerIds = [];
  state.remote.remotePlayerIds = [];
  state.remote.lastPacketAgeMs = 0;
  resetMinimapFogState({ keepCells: false });
  state.minimapFog.suppressDiscoveryUntil = performance.now() + 1500;
  if (state.minimapHud.elements) state.minimapHud.dirty = true;
  updateHud();
}

async function resetPersistedMinimapFogDiscovery() {
  try {
    const response = await fetch("/api/game/fog/discovery", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ reset: true })
    });
    if (response.status === 401) {
      window.location.href = "/login/?next=%2Fgame%2F";
      return false;
    }
    return response.ok;
  } catch {
    state.debug.lastError = "Kon minimap fog discovery niet resetten.";
    updateHud();
    return false;
  }
}

function resolveMinimapFogConfig(config = resolveGameMinimapConfig()) {
  const raw = config?.fogOfWar && typeof config.fogOfWar === "object" ? config.fogOfWar : null;
  if (!config) {
    return {
      enabled: false,
      fogColor: "#05070a",
      fogOpacity: 0.72,
      cellSize: 24,
      fogChunkSize: 24,
      revealRadius: 3,
      saveIntervalMs: 1500,
      movementThreshold: 1,
      smoothFog: true,
      fogFeatherRadius: 1.5,
      revealShape: "circle",
      debugOverlay: false,
      mapLayer: minimapFogMapLayer(null, null, 24)
    };
  }
  if (!raw) {
    return {
      enabled: true,
      fogColor: "#05070a",
      fogOpacity: 0.72,
      cellSize: 24,
      fogChunkSize: 24,
      revealRadius: 3,
      saveIntervalMs: 1500,
      movementThreshold: 1,
      smoothFog: true,
      fogFeatherRadius: 1.5,
      revealShape: "circle",
      debugOverlay: false,
      mapLayer: minimapFogMapLayer(null, config.sourceMinimapId, 24)
    };
  }
  const cellSize = Math.max(1, Math.min(1000, Math.round(num(raw.cellSize ?? raw.fogChunkSize, 24))));
  return {
    enabled: raw.enabled !== false,
    fogColor: typeof raw.fogColor === "string" && raw.fogColor.trim() ? raw.fogColor.trim() : "#05070a",
    fogOpacity: clamp(num(raw.fogOpacity, 0.72), 0, 1),
    cellSize: cellSize,
    fogChunkSize: cellSize,
    revealRadius: Math.max(0, Math.min(64, Math.floor(num(raw.revealRadius, 3)))),
    saveIntervalMs: Math.max(250, Math.min(60000, Math.floor(num(raw.saveIntervalMs, 1500)))),
    movementThreshold: Math.max(1, Math.min(64, Math.floor(num(raw.movementThreshold, 1)))),
    smoothFog: raw.smoothFog !== false,
    fogFeatherRadius: clamp(num(raw.fogFeatherRadius, 1.5), 0, 8),
    revealShape: ["circle", "roundedCells", "hardCells"].includes(raw.revealShape) ? raw.revealShape : "circle",
    debugOverlay: raw.debugOverlay === true,
    mapLayer: minimapFogMapLayer(raw.mapLayer, config.sourceMinimapId, cellSize),
    heightThreshold: num(raw.heightThreshold ?? raw.revealHeight, 0)
  };
}

function minimapFogMapLayer(rawLayer, sourceMinimapId, cellSize) {
  const base = String(rawLayer || "overworld").trim() || "overworld";
  if (base.includes(":minimap:")) return base;
  const source = String(sourceMinimapId || "main_minimap").trim() || "main_minimap";
  const safeSource = source.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 64) || "main_minimap";
  const safeCellSize = Math.max(1, Math.min(1000, Math.round(num(cellSize, 24))));
  return base + ":minimap:" + safeSource + ":cell:" + safeCellSize;
}

function minimapFogConfigKey(config) {
  const fog = resolveMinimapFogConfig(config);
  return JSON.stringify({
    enabled: fog.enabled,
    fogColor: fog.fogColor,
    fogOpacity: fog.fogOpacity,
    cellSize: fog.cellSize,
    revealRadius: fog.revealRadius,
    saveIntervalMs: fog.saveIntervalMs,
    movementThreshold: fog.movementThreshold,
    smoothFog: fog.smoothFog,
    fogFeatherRadius: fog.fogFeatherRadius,
    revealShape: fog.revealShape,
    debugOverlay: fog.debugOverlay,
    mapLayer: fog.mapLayer,
    worldId: state.worldId || null
  });
}

function parseMinimapFogCellKey(cellKey) {
  const value = String(cellKey || "").trim();
  if (!/^-?\d+:-?\d+$/.test(value)) return null;
  const parts = value.split(":");
  return { x: Math.floor(Number(parts[0]) || 0), z: Math.floor(Number(parts[1]) || 0), key: value };
}

function minimapFogCellForPosition(position, fogConfig) {
  const cellSize = Math.max(1, num(fogConfig?.cellSize ?? fogConfig?.fogChunkSize, 24));
  return {
    x: Math.floor(num(position?.x, 0) / cellSize),
    z: Math.floor(num(position?.z, 0) / cellSize)
  };
}

function revealLocalMinimapFogCells(position, fogConfig) {
  if (!position || !fogConfig?.enabled) return false;
  const center = minimapFogCellForPosition(position, fogConfig);
  const radius = Math.max(0, Math.min(64, Math.floor(num(fogConfig.revealRadius, 3))));
  const shape = fogConfig.revealShape || "circle";
  let changed = false;
  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (shape === "circle" && (dx * dx + dz * dz) > ((radius + 0.35) * (radius + 0.35))) continue;
      const key = (center.x + dx) + ":" + (center.z + dz);
      if (state.minimapFog.discoveredCells.has(key)) continue;
      state.minimapFog.discoveredCells.add(key);
      changed = true;
    }
  }
  if (changed) {
    state.minimapFog.dirty = true;
    state.minimapFog.lastDiscoveredCount = state.minimapFog.discoveredCells.size;
    if (state.minimapHud.elements) state.minimapHud.dirty = true;
  }
  return changed;
}

function resetMinimapFogState(options = {}) {
  if (state.minimapFog.pendingSaveTimerId) {
    window.clearTimeout(state.minimapFog.pendingSaveTimerId);
    state.minimapFog.pendingSaveTimerId = 0;
  }
  if (options.keepCells !== true) state.minimapFog.discoveredCells = new Set();
  state.minimapFog.loaded = false;
  state.minimapFog.loadInFlight = false;
  state.minimapFog.saveInFlight = false;
  state.minimapFog.lastLoadAttemptAt = 0;
  state.minimapFog.dirty = true;
  state.minimapFog.lastDrawKey = "";
  state.minimapFog.lastClientCellKey = null;
  state.minimapFog.lastClientCellX = null;
  state.minimapFog.lastClientCellZ = null;
  state.minimapFog.lastSaveAt = 0;
  state.minimapFog.lastDiscoveredCount = state.minimapFog.discoveredCells.size;
}

function syncMinimapFogWorld(config = resolveGameMinimapConfig()) {
  const fog = resolveMinimapFogConfig(config);
  const worldId = state.worldId || null;
  const mapLayer = fog.mapLayer || "overworld";
  const configKey = minimapFogConfigKey(config);
  const worldChanged = state.minimapFog.worldId !== worldId || state.minimapFog.mapLayer !== mapLayer;
  if (worldChanged) {
    state.minimapFog.worldId = worldId;
    state.minimapFog.mapLayer = mapLayer;
    state.minimapFog.configKey = configKey;
    resetMinimapFogState({ keepCells: false });
    return fog;
  }
  if (state.minimapFog.configKey !== configKey) {
    state.minimapFog.configKey = configKey;
    state.minimapFog.dirty = true;
    if (state.minimapHud.elements) state.minimapHud.dirty = true;
  }
  if (!fog.enabled && state.minimapFog.pendingSaveTimerId) {
    window.clearTimeout(state.minimapFog.pendingSaveTimerId);
    state.minimapFog.pendingSaveTimerId = 0;
  }
  return fog;
}

function applyMinimapFogDiscoveryPayload(payload, options = {}) {
  if (!payload || typeof payload !== "object") return false;
  const worldId = payload.worldId || payload.world_id || state.worldId || null;
  if (worldId && state.worldId && String(worldId) !== String(state.worldId)) return false;
  const mapLayer = payload.mapLayer || payload.map_layer || state.minimapFog.mapLayer || "overworld";
  if (mapLayer && state.minimapFog.mapLayer && String(mapLayer) !== String(state.minimapFog.mapLayer)) return false;
  const replace = options.replace === true;
  const incoming = replace
    ? (Array.isArray(payload.discoveredCellKeys) ? payload.discoveredCellKeys : [])
    : (Array.isArray(payload.newlyDiscoveredCellKeys) ? payload.newlyDiscoveredCellKeys : []);
  if (replace) state.minimapFog.discoveredCells = new Set();
  let changed = replace;
  for (const key of incoming) {
    const parsed = parseMinimapFogCellKey(key);
    if (!parsed) continue;
    if (!state.minimapFog.discoveredCells.has(parsed.key)) {
      state.minimapFog.discoveredCells.add(parsed.key);
      changed = true;
    }
  }
  state.minimapFog.worldId = worldId || state.minimapFog.worldId || null;
  state.minimapFog.mapLayer = mapLayer || state.minimapFog.mapLayer || "overworld";
  state.minimapFog.loaded = true;
  state.minimapFog.lastDiscoveredCount = state.minimapFog.discoveredCells.size;
  if (changed) {
    state.minimapFog.dirty = true;
    if (state.minimapHud.elements) state.minimapHud.dirty = true;
    drawGameMinimapIfDue(performance.now());
  }
  return changed;
}

async function loadMinimapFogDiscovery(config = resolveGameMinimapConfig()) {
  const fog = syncMinimapFogWorld(config);
  if (performance.now() < Number(state.minimapFog.suppressDiscoveryUntil || 0)) return;
  if (!fog.enabled || state.minimapFog.loaded || state.minimapFog.loadInFlight || !state.worldId) return;
  const now = performance.now();
  if (state.minimapFog.lastLoadAttemptAt && now - state.minimapFog.lastLoadAttemptAt < 5000) return;
  state.minimapFog.lastLoadAttemptAt = now;
  state.minimapFog.loadInFlight = true;
  try {
    const response = await fetch("/api/game/fog/discovery", { headers: { Accept: "application/json" } });
    if (response.status === 401) {
      window.location.href = "/login/?next=%2Fgame%2F";
      return;
    }
    const payload = await response.json().catch(function () { return null; });
    if (response.ok && payload && payload.ok === true) {
      applyMinimapFogDiscoveryPayload(payload, { replace: true });
    }
  } catch {
    state.debug.lastError = "Kon minimap fog discovery niet laden.";
    updateHud();
  } finally {
    state.minimapFog.loadInFlight = false;
  }
}

async function flushMinimapFogDiscovery(reason = "movement", options = {}) {
  const config = resolveGameMinimapConfig();
  const fog = syncMinimapFogWorld(config);
  if (!fog.enabled || state.minimapFog.saveInFlight || !state.worldId || !state.player) return;
  state.minimapFog.saveInFlight = true;
  state.minimapFog.lastSaveAt = performance.now();
  try {
    const response = await fetch("/api/game/fog/discovery", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        reason: reason,
        force: options.force === true
      })
    });
    if (response.status === 401) {
      window.location.href = "/login/?next=%2Fgame%2F";
      return;
    }
    const payload = await response.json().catch(function () { return null; });
    if (response.ok && payload && payload.ok === true) {
      applyMinimapFogDiscoveryPayload(payload, { replace: false });
    }
  } catch {
    state.debug.lastError = "Kon minimap fog discovery niet opslaan.";
    updateHud();
  } finally {
    state.minimapFog.saveInFlight = false;
  }
}

function scheduleMinimapFogDiscovery(reason = "movement", options = {}) {
  const config = resolveGameMinimapConfig();
  const fog = syncMinimapFogWorld(config);
  if (!fog.enabled || !state.worldId || !state.player) return;
  const position = currentLocalPlayerPosition();
  if (!position) return;
  revealLocalMinimapFogCells(position, fog);
  if (performance.now() < Number(state.minimapFog.suppressDiscoveryUntil || 0)) return;
  const cell = minimapFogCellForPosition(position, fog);
  const cellKey = cell.x + ":" + cell.z;
  const previousCellKey = state.minimapFog.lastClientCellKey;
  const previousX = Number(state.minimapFog.lastClientCellX);
  const previousZ = Number(state.minimapFog.lastClientCellZ);
  const movedCells = previousCellKey
    ? Math.max(Math.abs(cell.x - previousX), Math.abs(cell.z - previousZ))
    : Infinity;
  if (options.force !== true && previousCellKey && movedCells < fog.movementThreshold) return;
  state.minimapFog.lastClientCellKey = cellKey;
  state.minimapFog.lastClientCellX = cell.x;
  state.minimapFog.lastClientCellZ = cell.z;
  const elapsed = performance.now() - Number(state.minimapFog.lastSaveAt || 0);
  const delay = options.force === true ? 0 : Math.max(0, fog.saveIntervalMs - elapsed);
  if (state.minimapFog.pendingSaveTimerId) {
    if (options.force !== true) return;
    window.clearTimeout(state.minimapFog.pendingSaveTimerId);
    state.minimapFog.pendingSaveTimerId = 0;
  }
  state.minimapFog.pendingSaveTimerId = window.setTimeout(function () {
    state.minimapFog.pendingSaveTimerId = 0;
    flushMinimapFogDiscovery(reason, options);
  }, delay);
}

function resolveGameMinimapConfig() {
  const config = state.gameWorld?.minimap?.game;
  return config && config.enabled !== false ? config : null;
}

function resolveGameMinimapBake(config) {
  if (!config) return null;
  const bakes = resolveGameMinimapBakes(config);
  const localPosition = currentLocalPlayerPosition();
  return bakes.find(function (bake) {
    const bounds = minimapBakeBounds(bake);
    return localPosition && boundsContainsPoint(bounds, localPosition.x, localPosition.z);
  })
    || bakes.find(function (bake) { return bake.minimapId === config.sourceMinimapId; })
    || bakes.find(function (bake) { return bake.enabled !== false && bake.bakedImageUrl; })
    || bakes.find(function (bake) { return bake.enabled !== false; })
    || null;
}

function minimapBakeBounds(bake) {
  return bake?.bounds || bake?.bakedBounds || null;
}

function resolveGameMinimapBakes(config) {
  if (!config) return [];
  const bakes = Array.isArray(state.gameWorld?.minimap?.bakes) ? state.gameWorld.minimap.bakes : [];
  const enabled = bakes.filter(function (bake) {
    return bake && bake.enabled !== false && minimapBakeBounds(bake);
  });
  const sourceId = String(config.sourceMinimapId || "").trim();
  if (!sourceId) return enabled;
  return enabled.slice().sort(function (left, right) {
    const leftMatch = String(left?.minimapId || "") === sourceId ? 0 : 1;
    const rightMatch = String(right?.minimapId || "") === sourceId ? 0 : 1;
    return leftMatch - rightMatch;
  });
}

function boundsContainsPoint(bounds, x, z) {
  if (!bounds) return false;
  const px = Number(x);
  const pz = Number(z);
  return Number.isFinite(px) && Number.isFinite(pz)
    && px >= Number(bounds.minX) && px <= Number(bounds.maxX)
    && pz >= Number(bounds.minZ) && pz <= Number(bounds.maxZ);
}

function unionMinimapBounds(boundsList) {
  const valid = boundsList.filter(function (bounds) {
    return bounds
      && Number.isFinite(Number(bounds.minX))
      && Number.isFinite(Number(bounds.maxX))
      && Number.isFinite(Number(bounds.minZ))
      && Number.isFinite(Number(bounds.maxZ))
      && Number(bounds.maxX) > Number(bounds.minX)
      && Number(bounds.maxZ) > Number(bounds.minZ);
  });
  if (!valid.length) return null;
  let minX = Number(valid[0].minX);
  let maxX = Number(valid[0].maxX);
  let minZ = Number(valid[0].minZ);
  let maxZ = Number(valid[0].maxZ);
  for (const bounds of valid.slice(1)) {
    minX = Math.min(minX, Number(bounds.minX));
    maxX = Math.max(maxX, Number(bounds.maxX));
    minZ = Math.min(minZ, Number(bounds.minZ));
    maxZ = Math.max(maxZ, Number(bounds.maxZ));
  }
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

function computeGameMinimapSignature(config, bake) {
  const bakes = resolveGameMinimapBakes(config).map(function (item) {
    return {
      minimapId: item.minimapId || item.id || null,
      bakedImageUrl: item.bakedImageUrl || null,
      bounds: minimapBakeBounds(item)
    };
  });
  return JSON.stringify({
    hudId: config.hudId,
    anchor: config.anchor,
    sizePx: config.sizePx,
    marginPx: config.marginPx,
    borderRadiusPx: config.borderRadiusPx,
    backgroundOpacity: config.backgroundOpacity,
    zIndex: config.zIndex,
    fogOfWar: config.fogOfWar || null,
    bakedImageUrl: bake ? bake.bakedImageUrl : null,
    bounds: resolveGameMinimapBakeBounds(bake),
    bakes: bakes
  });
}

function resolveGameMinimapBakeBounds(bake) {
  const config = resolveGameMinimapConfig();
  const unionBounds = unionMinimapBounds(resolveGameMinimapBakes(config).map(minimapBakeBounds));
  return unionBounds || minimapBakeBounds(bake);
}

function normalizeMinimapImageUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^(https?:)?\/\//i.test(value) || value.startsWith("/")) return value;
  return "/" + value;
}

function minimapImageForBake(bake) {
  const url = normalizeMinimapImageUrl(bake?.bakedImageUrl || "");
  if (!url) return null;
  if (!state.minimapHud.images) state.minimapHud.images = new Map();
  let image = state.minimapHud.images.get(url) || null;
  if (image) return image;
  image = new Image();
  image.addEventListener("load", function () {
    state.minimapHud.dirty = true;
    drawGameMinimapIfDue(performance.now());
  });
  image.addEventListener("error", function () {
    state.minimapHud.dirty = true;
    drawGameMinimapIfDue(performance.now());
  });
  image.src = url;
  state.minimapHud.images.set(url, image);
  return image;
}

function intersectMinimapBounds(a, b) {
  if (!a || !b) return null;
  const minX = Math.max(Number(a.minX), Number(b.minX));
  const maxX = Math.min(Number(a.maxX), Number(b.maxX));
  const minZ = Math.max(Number(a.minZ), Number(b.minZ));
  const maxZ = Math.min(Number(a.maxZ), Number(b.maxZ));
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite) || maxX <= minX || maxZ <= minZ) return null;
  return { minX, maxX, minZ, maxZ };
}

function drawMinimapBakeIntoView(ctx, image, bakeBounds, viewBounds, size) {
  if (!ctx || !image || !bakeBounds || !viewBounds || !image.complete || !image.naturalWidth) return false;
  const visibleBounds = intersectMinimapBounds(bakeBounds, viewBounds);
  if (!visibleBounds) return false;
  const imageWidth = image.naturalWidth || image.width || 1;
  const imageHeight = image.naturalHeight || image.height || 1;
  const sourceA = worldToMinimapPoint(visibleBounds.minX, visibleBounds.minZ, bakeBounds, imageWidth, imageHeight);
  const sourceB = worldToMinimapPoint(visibleBounds.maxX, visibleBounds.maxZ, bakeBounds, imageWidth, imageHeight);
  const destA = worldToMinimapPoint(visibleBounds.minX, visibleBounds.minZ, viewBounds, size, size);
  const destB = worldToMinimapPoint(visibleBounds.maxX, visibleBounds.maxZ, viewBounds, size, size);
  const sx = Math.min(sourceA.x, sourceB.x);
  const sy = Math.min(sourceA.y, sourceB.y);
  const sw = Math.abs(sourceB.x - sourceA.x);
  const sh = Math.abs(sourceB.y - sourceA.y);
  const dx = Math.min(destA.x, destB.x);
  const dy = Math.min(destA.y, destB.y);
  const dw = Math.abs(destB.x - destA.x);
  const dh = Math.abs(destB.y - destA.y);
  if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return false;
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
  return true;
}

function shouldShowRemotePlayerNames(config, performanceMode) {
  if (!config || config.showRemotePlayerNames === false) return false;
  return performanceMode !== "ultra";
}

function removeGameMinimapHud() {
  if (state.minimapHud.refreshTimerId) {
    window.clearTimeout(state.minimapHud.refreshTimerId);
    state.minimapHud.refreshTimerId = 0;
  }
  if (state.minimapFog.pendingSaveTimerId) {
    window.clearTimeout(state.minimapFog.pendingSaveTimerId);
    state.minimapFog.pendingSaveTimerId = 0;
  }
  if (state.minimapHud.interactions) {
    state.minimapHud.interactions.destroy();
    state.minimapHud.interactions = null;
  }
  if (state.minimapHud.elements && state.minimapHud.elements.frame) {
    state.minimapHud.elements.frame.remove();
  }
  if (state.minimapHud.elements && state.minimapHud.elements.root) {
    state.minimapHud.elements.root.remove();
  }
  clearGameHudFamily("minimap");
  state.minimapHud.elements = null;
  state.minimapHud.signature = null;
  state.minimapHud.image = null;
  if (state.minimapHud.images) state.minimapHud.images.clear();
  else state.minimapHud.images = new Map();
  state.minimapHud.lastDrawKey = null;
  state.minimapHud.lastDrawDurationMs = 0;
  state.minimapHud.drawDurationEmaMs = 0;
  state.minimapHud.performanceMode = null;
  state.minimapHud.performanceModeUntil = 0;
  state.minimapFog.dirty = true;
  state.minimapFog.lastDrawKey = "";
}

function currentLocalPlayerPosition() {
  return state.predictedPosition || state.position || state.authoritativePosition || null;
}

function gameMinimapRefreshInterval(config, performanceMode = null) {
  const configured = Number(config?.markerUpdateMs);
  const baseInterval = Number.isFinite(configured)
    ? configured
    : (isGameMinimapLite(config) ? 250 : 120);
  const floor = performanceMode === "ultra"
    ? 120
    : performanceMode === "lite"
      ? 50
      : 33;
  return Math.max(floor, baseInterval);
}

function isGameMinimapLite(config) {
  // `debugMode` is the visible checkbox; `liteMode` remains as a legacy fallback.
  if (config?.debugMode !== undefined) return config.debugMode !== true;
  return config?.liteMode !== false;
}

function resolveGameMinimapPerformanceMode(config, now = performance.now()) {
  const hudState = state.minimapHud;
  if (hudState.performanceMode && Number(hudState.performanceModeUntil) > now) {
    return hudState.performanceMode;
  }
  return isGameMinimapLite(config) ? "lite" : "full";
}

function noteGameMinimapPerformance(drawDurationMs, now = performance.now()) {
  const hudState = state.minimapHud;
  const duration = Math.max(0, Number(drawDurationMs) || 0);
  const previousEma = Number(hudState.drawDurationEmaMs) || 0;
  const nextEma = previousEma > 0 ? previousEma * 0.8 + duration * 0.2 : duration;
  hudState.lastDrawDurationMs = round(duration);
  hudState.drawDurationEmaMs = round(nextEma);

  // If the minimap draw starts eating frame budget, back off for a few seconds and draw a much
  // cheaper version. This keeps the HUD from repeatedly hitting a half-second stall on weaker
  // machines or on worlds that still have debug-heavy minimap settings.
  if (duration >= 80 || nextEma >= 50) {
    hudState.performanceMode = "ultra";
    hudState.performanceModeUntil = now + 8000;
    return;
  }
  if (duration >= 24 || nextEma >= 16) {
    hudState.performanceMode = "lite";
    hudState.performanceModeUntil = now + 5000;
    return;
  }
  if (hudState.performanceMode && now >= Number(hudState.performanceModeUntil) && nextEma < 12) {
    hudState.performanceMode = null;
    hudState.performanceModeUntil = 0;
  }
}

function buildGameMinimapDrawKey(bake, view, performanceMode) {
  const localPosition = currentLocalPlayerPosition();
  const config = resolveGameMinimapConfig();
  const liteMode = performanceMode !== "full";
  const positionQuantum = performanceMode === "ultra" ? 1.5 : liteMode ? 0.5 : 0.05;
  const viewQuantum = performanceMode === "ultra" ? 1.5 : liteMode ? 0.5 : 0.05;
  const viewKey = view
    ? [
        Math.round((Number(view.centerX) || 0) / viewQuantum),
        Math.round((Number(view.centerZ) || 0) / viewQuantum),
        Math.round((Number(view.worldDistance) || 0) / viewQuantum)
      ].join(",")
    : "noview";
  const localKey = localPosition
    ? [
        Math.round((Number(localPosition.x) || 0) / positionQuantum),
        Math.round((Number(localPosition.z) || 0) / positionQuantum)
      ].join(",")
    : "nolocal";
  // Remote players must factor into the key too - otherwise a standing-still local player with
  // moving remote players never redraws in lite mode and their dots go stale on the minimap.
  const remoteKey = state.remote.players.size
    ? Array.from(state.remote.players.entries())
        .map(function ([playerId, entry]) {
          const position = entry.renderState?.position || entry.position;
          if (!position) return playerId + ":none";
          return playerId + ":" + Math.round((Number(position.x) || 0) / positionQuantum) + "," + Math.round((Number(position.z) || 0) / positionQuantum);
        })
        .sort()
        .join(";")
    : "noremote";
  const bakesKey = resolveGameMinimapBakes(config).map(function (item) {
    const bounds = minimapBakeBounds(item) || {};
    return [
      item?.minimapId || item?.id || "",
      item?.bakedImageUrl || "",
      Math.round(Number(bounds.minX) || 0),
      Math.round(Number(bounds.maxX) || 0),
      Math.round(Number(bounds.minZ) || 0),
      Math.round(Number(bounds.maxZ) || 0)
    ].join(",");
  }).join(";");
  const questMarkerKey = config?.showQuestMarkers === true
    ? node04MinimapTargetSignature(positionQuantum)
    : "noquestmarkers";
  return [
    liteMode ? "lite" : "debug",
    bake?.bakedImageUrl || "",
    bake?.bakedImageWidth || 0,
    bake?.bakedImageHeight || 0,
    viewKey,
    localKey,
    remoteKey,
    bakesKey,
    questMarkerKey
  ].join("|");
}

function node04MinimapTargets() {
  if (!state.node04.snapshot || !node04Modules().length) return [];
  return node04RuntimeTargetsForScene().filter(function (target) {
    return target && Number.isFinite(Number(target.x)) && Number.isFinite(Number(target.z));
  });
}

function node04MinimapTargetSignature(quantum = 0.5) {
  const q = Math.max(0.05, Number(quantum) || 0.5);
  return node04MinimapTargets().map(function (target) {
    return [
      target.instanceId || target.targetId || "",
      target.action || "",
      target.displayName || "",
      Math.round((Number(target.x) || 0) / q),
      Math.round((Number(target.z) || 0) / q),
      target.available === false ? "0" : "1"
    ].join(",");
  }).sort().join(";");
}

function drawNode04MinimapMarkers(ctx, config, viewBounds, size, clampOutside, performanceMode) {
  if (config.showQuestMarkers !== true) return;
  const targets = node04MinimapTargets();
  if (!targets.length) return;
  const iconSize = Math.max(5, Number(config.iconSizePx) || 9);
  const fontSize = Math.max(6, Number(config.fontSizePx) || 10);
  const nameMaxLength = Math.max(3, Number(config.nameMaxLength) || 14);
  const showLabels = performanceMode !== "ultra";
  for (const target of targets) {
    const point = resolveMinimapPoint(target.x, target.z, viewBounds, size, size, clampOutside);
    if (!point) continue;
    const action = String(target.action || "");
    const fill = action.includes("start_dialogue")
      ? "#facc15"
      : action.includes("travel")
        ? "#22d3ee"
        : "#84cc16";
    if (action.includes("travel")) {
      drawDiamondMarker(ctx, point.x, point.y, iconSize + 2, { fill, stroke: "rgba(0,0,0,0.7)" });
    } else {
      drawDotMarker(ctx, point.x, point.y, iconSize + 2, { fill, stroke: "rgba(0,0,0,0.75)" });
    }
    if (showLabels) {
      drawMarkerLabel(ctx, target.displayName || target.prompt || "Quest", point.x, point.y, fontSize, nameMaxLength, iconSize + 5);
    }
  }
}

// Follows the local player until the user pans/zooms (userOverride), and resets whenever the
// active hud/source minimap identity changes. Never touches node values - purely client view state.
function ensureGameMinimapView(config, groundBounds) {
  const hudState = state.minimapHud;
  const configKey = (config.sourceMinimapId || "") + "|" + (config.hudId || "");
  if (!hudState.view || hudState.configKey !== configKey) {
    hudState.configKey = configKey;
    hudState.userOverride = false;
    const localPos = currentLocalPlayerPosition();
    hudState.view = createMinimapView(localPos ? localPos.x : 0, localPos ? localPos.z : 0, config.startDistance);
  }
  if (config.followPlayer !== false && !hudState.userOverride) {
    const localPos = currentLocalPlayerPosition();
    if (localPos) {
      hudState.view = { centerX: localPos.x, centerZ: localPos.z, worldDistance: hudState.view.worldDistance };
    }
  }
  hudState.view = clampMinimapView(hudState.view, groundBounds);
  updateGameMinimapRecenterVisibility(config);
  return hudState.view;
}

// Shows the "recenter on character" button only while the map is out of follow mode - i.e. the
// user panned/zoomed away (userOverride) on a minimap that would otherwise be following them.
function updateGameMinimapRecenterVisibility(config) {
  const hudState = state.minimapHud;
  const btn = hudState.elements?.recenterBtn;
  if (!btn) return;
  const visible = config.followPlayer !== false && hudState.userOverride === true;
  btn.classList.toggle("visible", visible);
}

function recenterGameMinimap() {
  const hudState = state.minimapHud;
  const localPos = currentLocalPlayerPosition();
  if (hudState.view && localPos) {
    const config = resolveGameMinimapConfig();
    const bake = config ? resolveGameMinimapBake(config) : null;
    const nextView = { centerX: localPos.x, centerZ: localPos.z, worldDistance: hudState.view.worldDistance };
    const bounds = resolveGameMinimapBakeBounds(bake);
    hudState.view = bounds ? clampMinimapView(nextView, bounds) : nextView;
  }
  hudState.userOverride = false;
  hudState.dirty = true;
  drawGameMinimapIfDue(performance.now());
}

function buildGameMinimapDom(config, bake) {
  const size = Math.max(64, Number(config.sizePx) || 180);
  const root = document.createElement("section");
  root.className = "gameMinimapRoot";
  root.dataset.hudId = config.hudId || "game_minimap";
  root.style.width = size + "px";
  root.style.height = size + "px";
  root.style.margin = Math.max(0, Number(config.marginPx) || 12) + "px";
  root.style.borderRadius = Math.max(0, Number(config.borderRadiusPx) || 14) + "px";
  const canvas = document.createElement("canvas");
  canvas.className = "gameMinimapCanvas";
  root.appendChild(canvas);
  const fogCanvas = document.createElement("canvas");
  fogCanvas.className = "gameMinimapFogCanvas";
  fogCanvas.setAttribute("aria-hidden", "true");
  root.appendChild(fogCanvas);
  const recenterBtn = document.createElement("button");
  recenterBtn.type = "button";
  recenterBtn.className = "gameMinimapRecenter";
  recenterBtn.title = "Centreer op personage";
  recenterBtn.setAttribute("aria-label", "Centreer minimap op personage");
  recenterBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  recenterBtn.addEventListener("click", function (event) {
    event.stopPropagation();
    recenterGameMinimap();
  });
  root.appendChild(recenterBtn);
  const elements = { root: root, canvas: canvas, ctx: canvas.getContext("2d"), fogCanvas: fogCanvas, fogCtx: fogCanvas.getContext("2d"), recenterBtn: recenterBtn };
  for (const item of resolveGameMinimapBakes(config)) minimapImageForBake(item);
  state.minimapHud.image = minimapImageForBake(bake);
  state.minimapHud.interactions = attachMinimapInteractions(canvas, {
    getView: function () { return state.minimapHud.view; },
    setView: function (view) {
      state.minimapHud.view = view;
      state.minimapHud.userOverride = true;
      state.minimapHud.dirty = true;
    },
    getGroundBounds: function () {
      const liveConfig = resolveGameMinimapConfig();
      return liveConfig ? resolveGameMinimapBakeBounds(resolveGameMinimapBake(liveConfig)) : null;
    },
    getCanvasSize: function () {
      return Math.max(64, Math.round(state.minimapHud.elements?.root?.clientWidth || Number(resolveGameMinimapConfig()?.sizePx) || 180));
    },
    getMinDistance: function () { return resolveGameMinimapConfig()?.minDistance || 20; },
    getMaxDistance: function () {
      const liveConfig = resolveGameMinimapConfig();
      const configuredMax = liveConfig?.maxDistance || 1000;
      const bounds = liveConfig ? resolveGameMinimapBakeBounds(resolveGameMinimapBake(liveConfig)) : null;
      const worldMax = bounds ? Math.max(Number(bounds.maxX) - Number(bounds.minX), Number(bounds.maxZ) - Number(bounds.minZ), 1) : 1;
      return Math.max(configuredMax, worldMax);
    },
    allowZoom: function () { return resolveGameMinimapConfig()?.allowZoom !== false; },
    allowPan: function () { return resolveGameMinimapConfig()?.allowPan !== false; },
    allowPinchZoom: function () { return resolveGameMinimapConfig()?.allowPinchZoom !== false; },
    onClick: function (worldX, worldZ) {
      const clickConfig = resolveGameMinimapConfig();
      if (!clickConfig || clickConfig.clickToMove === false || !isMmoGameplayReady()) return;
      const clickBounds = resolveGameMinimapBakeBounds(resolveGameMinimapBake(clickConfig));
      const clampedX = clickBounds ? Math.max(clickBounds.minX, Math.min(clickBounds.maxX, worldX)) : worldX;
      const clampedZ = clickBounds ? Math.max(clickBounds.minZ, Math.min(clickBounds.maxZ, worldZ)) : worldZ;
      if (!startClickToMoveTarget(clampedX, clampedZ, "minimap-click")) return;
      sendInputState({ force: true });
    }
  });
  return elements;
}

function refreshGameMinimapHud() {
  const config = resolveGameMinimapConfig();
  if (!config) {
    removeGameMinimapHud();
    return;
  }
  const bake = resolveGameMinimapBake(config);
  const signature = computeGameMinimapSignature(config, bake);
  if (state.minimapHud.elements && state.minimapHud.signature === signature) return;
  removeGameMinimapHud();
  const elements = buildGameMinimapDom(config, bake);
  const minimapModule = {
    moduleId: config.hudId || "game_minimap",
    nodeType: "game_minimap",
    label: "Minimap",
    anchor: config.anchor || "right"
  };
  elements.frame = appendGameHudPanel("minimap", minimapModule, elements.root, minimapModule.anchor);
  state.minimapHud.elements = elements;
  state.minimapHud.signature = signature;
  state.minimapHud.dirty = true;
  state.minimapHud.lastDrawAt = 0;
  state.minimapHud.lastDrawKey = null;
  state.minimapHud.lastDrawDurationMs = 0;
  state.minimapHud.drawDurationEmaMs = 0;
  state.minimapHud.performanceMode = null;
  state.minimapHud.performanceModeUntil = 0;
  drawGameMinimapIfDue(performance.now());
}

function scheduleGameMinimapRefresh() {
  const hudState = state.minimapHud;
  if (!hudState.elements) return;
  if (hudState.refreshTimerId) return;
  const config = resolveGameMinimapConfig();
  if (!config) return;
  hudState.refreshTimerId = window.setTimeout(function () {
    hudState.refreshTimerId = 0;
    if (!hudState.elements) return;
    drawGameMinimapIfDue(performance.now());
    scheduleGameMinimapRefresh();
  }, gameMinimapRefreshInterval(config));
}

function clearGameMinimapFogCanvas() {
  const elements = state.minimapHud.elements;
  if (!elements?.fogCanvas || !elements?.fogCtx) return;
  const canvas = elements.fogCanvas;
  const ctx = elements.fogCtx;
  const width = canvas.width || 0;
  const height = canvas.height || 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  state.minimapFog.dirty = false;
  state.minimapFog.lastDrawKey = "";
}

function ensureMinimapFogMask(size) {
  const maskSize = Math.max(1, Math.ceil(Number(size) || 1));
  let canvas = state.minimapFog.maskCanvas;
  let ctx = state.minimapFog.maskCtx;
  if (!canvas || !ctx) {
    canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d");
    state.minimapFog.maskCanvas = canvas;
    state.minimapFog.maskCtx = ctx;
  }
  if (canvas.width !== maskSize || canvas.height !== maskSize) {
    canvas.width = maskSize;
    canvas.height = maskSize;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, maskSize, maskSize);
  return { canvas: canvas, ctx: ctx, size: maskSize };
}

function drawMinimapFogDebug(ctx, fogConfig, viewBounds, size) {
  const cellSize = Math.max(1, num(fogConfig.cellSize, 24));
  const spanX = viewBounds.maxX - viewBounds.minX || 1;
  const spanZ = viewBounds.maxZ - viewBounds.minZ || 1;
  const minCellX = Math.floor(viewBounds.minX / cellSize);
  const maxCellX = Math.floor(viewBounds.maxX / cellSize);
  const minCellZ = Math.floor(viewBounds.minZ / cellSize);
  const maxCellZ = Math.floor(viewBounds.maxZ / cellSize);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "rgba(125, 211, 252, 0.32)";
  ctx.lineWidth = 1;
  ctx.font = "8px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (let z = minCellZ; z <= maxCellZ; z += 1) {
    for (let x = minCellX; x <= maxCellX; x += 1) {
      const px = ((x * cellSize) - viewBounds.minX) / spanX * size;
      const py = ((z * cellSize) - viewBounds.minZ) / spanZ * size;
      const pw = cellSize / spanX * size;
      const ph = cellSize / spanZ * size;
      if (px > size || py > size || px + pw < 0 || py + ph < 0) continue;
      ctx.strokeRect(px, py, pw, ph);
      if (pw >= 28 && ph >= 16) {
        const key = x + ":" + z;
        ctx.fillStyle = state.minimapFog.discoveredCells.has(key) ? "rgba(134, 239, 172, 0.88)" : "rgba(248, 250, 252, 0.62)";
        ctx.fillText(key, px + 2, py + 2);
      }
    }
  }
  ctx.restore();
}

function minimapFogCellRect(cell, fogConfig, viewBounds, size) {
  const cellSize = Math.max(1, num(fogConfig.cellSize, 24));
  const spanX = viewBounds.maxX - viewBounds.minX || 1;
  const spanZ = viewBounds.maxZ - viewBounds.minZ || 1;
  const minX = cell.x * cellSize;
  const minZ = cell.z * cellSize;
  const maxX = minX + cellSize;
  const maxZ = minZ + cellSize;
  if (maxX < viewBounds.minX || minX > viewBounds.maxX || maxZ < viewBounds.minZ || minZ > viewBounds.maxZ) return null;
  return {
    x: (minX - viewBounds.minX) / spanX * size,
    y: (minZ - viewBounds.minZ) / spanZ * size,
    w: cellSize / spanX * size,
    h: cellSize / spanZ * size
  };
}

function drawRoundedFogRect(ctx, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2));
  if (r <= 0.25) {
    ctx.fillRect(x, y, w, h);
    return;
  }
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.fill();
}

function drawSmoothMinimapFogCells(ctx, fogConfig, viewBounds, size) {
  const cellSize = Math.max(1, num(fogConfig.cellSize, 24));
  const spanX = viewBounds.maxX - viewBounds.minX || 1;
  const spanZ = viewBounds.maxZ - viewBounds.minZ || 1;
  const pxPerCellX = cellSize / spanX * size;
  const pxPerCellZ = cellSize / spanZ * size;
  const pxPerCell = Math.max(pxPerCellX, pxPerCellZ);
  const baseRadius = pxPerCell * 0.72;
  const featherPx = Math.max(0, num(fogConfig.fogFeatherRadius, 1.5)) * Math.max(pxPerCellX, pxPerCellZ);
  const shape = fogConfig.smoothFog === false ? "hardCells" : (fogConfig.revealShape || "circle");
  const mask = shape === "hardCells" || fogConfig.debugOverlay === true
    ? null
    : ensureMinimapFogMask(size);
  const targetCtx = mask ? mask.ctx : ctx;
  targetCtx.save();
  targetCtx.globalAlpha = 1;
  targetCtx.globalCompositeOperation = "source-over";
  targetCtx.fillStyle = "rgba(0,0,0,1)";

  const featherCells = shape === "hardCells" ? 0 : Math.ceil(Math.max(0, num(fogConfig.fogFeatherRadius, 1.5)));
  const minCellX = Math.floor(viewBounds.minX / cellSize) - featherCells - 1;
  const maxCellX = Math.floor(viewBounds.maxX / cellSize) + featherCells + 1;
  const minCellZ = Math.floor(viewBounds.minZ / cellSize) - featherCells - 1;
  const maxCellZ = Math.floor(viewBounds.maxZ / cellSize) + featherCells + 1;
  for (let z = minCellZ; z <= maxCellZ; z += 1) {
    for (let x = minCellX; x <= maxCellX; x += 1) {
      const cellKey = x + ":" + z;
      if (!state.minimapFog.discoveredCells.has(cellKey)) continue;
      const rect = minimapFogCellRect({ x: x, z: z }, fogConfig, viewBounds, size);
      if (!rect) continue;
      if (shape === "circle") {
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        if (pxPerCell < 3) {
          targetCtx.fillRect(rect.x - 0.5, rect.y - 0.5, rect.w + 1, rect.h + 1);
        } else {
          targetCtx.beginPath();
          targetCtx.arc(cx, cy, Math.max(0.5, baseRadius), 0, Math.PI * 2);
          targetCtx.fill();
        }
      } else if (shape === "roundedCells") {
        const expand = Math.min(featherPx * 0.15, pxPerCell * 0.35);
        drawRoundedFogRect(targetCtx, rect.x - expand, rect.y - expand, rect.w + expand * 2, rect.h + expand * 2, Math.max(1, Math.min(rect.w, rect.h) * 0.45 + expand));
      } else {
        targetCtx.fillRect(rect.x - 0.5, rect.y - 0.5, rect.w + 1, rect.h + 1);
      }
    }
  }
  targetCtx.restore();
  if (mask) {
    ctx.save();
    if (featherPx > 0.25 && typeof ctx.filter === "string") ctx.filter = "blur(" + Math.min(16, Math.round(featherPx * 10) / 10) + "px)";
    ctx.drawImage(mask.canvas, 0, 0, size, size);
    ctx.filter = "none";
    ctx.restore();
  }
}

function drawGameMinimapFogOverlay(config, activeView, size, dpr) {
  const elements = state.minimapHud.elements;
  if (!elements?.fogCanvas || !elements?.fogCtx) return;
  const fogConfig = syncMinimapFogWorld(config);
  const canvas = elements.fogCanvas;
  const ctx = elements.fogCtx;
  const backing = Math.round(size * dpr);
  if (canvas.width !== backing || canvas.height !== backing) {
    canvas.width = backing;
    canvas.height = backing;
    state.minimapFog.dirty = true;
  }
  if (!fogConfig.enabled || !activeView) {
    clearGameMinimapFogCanvas();
    return;
  }
  loadMinimapFogDiscovery(config);
  revealLocalMinimapFogCells(currentLocalPlayerPosition(), fogConfig);
  const viewBounds = minimapViewBounds(activeView);
  const drawKey = [
    state.worldId || "",
    fogConfig.mapLayer || "overworld",
    fogConfig.fogColor,
    Math.round(fogConfig.fogOpacity * 1000),
    fogConfig.cellSize,
    fogConfig.smoothFog ? "smooth" : "flat",
    Math.round(num(fogConfig.fogFeatherRadius, 0) * 100),
    fogConfig.revealShape || "circle",
    fogConfig.debugOverlay ? "debug" : "normal",
    state.minimapFog.discoveredCells.size,
    Math.round(viewBounds.minX * 100) / 100,
    Math.round(viewBounds.maxX * 100) / 100,
    Math.round(viewBounds.minZ * 100) / 100,
    Math.round(viewBounds.maxZ * 100) / 100,
    size,
    dpr
  ].join("|");
  if (!state.minimapFog.dirty && state.minimapFog.lastDrawKey === drawKey) return;
  state.minimapFog.lastDrawKey = drawKey;
  state.minimapFog.dirty = false;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = clamp(fogConfig.fogOpacity, 0, 1);
  ctx.fillStyle = fogConfig.fogColor || "#05070a";
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "destination-out";

  drawSmoothMinimapFogCells(ctx, fogConfig, viewBounds, size);
  ctx.globalCompositeOperation = "source-over";
  if (fogConfig.debugOverlay) drawMinimapFogDebug(ctx, fogConfig, viewBounds, size);
}

function drawGameMinimap(config, bake, view, performanceMode) {
  const elements = state.minimapHud.elements;
  if (!elements) return;
  const liteMode = performanceMode !== "full";
  const ultraLiteMode = performanceMode === "ultra";
  const size = Math.max(64, Math.round(elements.root?.clientWidth || Number(config.sizePx) || 180));
  const canvas = elements.canvas;
  // Backing store at devicePixelRatio, all drawing math in logical px: without this the canvas is
  // blurry on HiDPI screens no matter how high the bake resolution is.
  const dprCap = ultraLiteMode ? 1.5 : liteMode ? 2 : 3;
  const dpr = Math.max(1, Math.min(dprCap, Number(window.devicePixelRatio) || 1));
  const backing = Math.round(size * dpr);
  if (canvas.width !== backing || canvas.height !== backing) {
    canvas.width = backing;
    canvas.height = backing;
  }
  const ctx = elements.ctx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = liteMode ? "low" : "high";
  ctx.clearRect(0, 0, size, size);
  ctx.globalAlpha = Math.max(0, Math.min(1, config.backgroundOpacity === undefined || config.backgroundOpacity === null ? 1 : Number(config.backgroundOpacity)));
  ctx.fillStyle = "#0b131c";
  ctx.fillRect(0, 0, size, size);
  const bounds = resolveGameMinimapBakeBounds(bake);
  if (!bounds) {
    ctx.globalAlpha = 1;
    clearGameMinimapFogCanvas();
    return;
  }
  const activeView = view || ensureGameMinimapView(config, bounds);
  const viewBounds = minimapViewBounds(activeView);
  let drewBakeImage = false;
  for (const item of resolveGameMinimapBakes(config)) {
    if (!item?.bakedImageUrl) continue;
    const itemBounds = minimapBakeBounds(item);
    const image = minimapImageForBake(item);
    if (drawMinimapBakeIntoView(ctx, image, itemBounds, viewBounds, size)) drewBakeImage = true;
  }
  if (!drewBakeImage && bake?.bakedImageUrl) {
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Minimap laden", size / 2, size / 2);
  }
  ctx.globalAlpha = 1;
  drawGameMinimapFogOverlay(config, activeView, size, dpr);
  const clampOutside = config.clampOutsideMarkers !== false;
  const iconSize = Math.max(3, Number(config.iconSizePx) || 9);

  if (config.showLocalPlayer !== false) {
    const localPosition = currentLocalPlayerPosition();
    if (localPosition) {
      const point = resolveMinimapPoint(localPosition.x, localPosition.z, viewBounds, size, size, clampOutside);
      if (point) {
        const fontSize = Math.max(6, Number(config.fontSizePx) || 10);
        const nameMaxLength = Math.max(3, Number(config.nameMaxLength) || 14);
        if (liteMode) {
          drawDotMarker(ctx, point.x, point.y, Math.max(4, Math.min(8, iconSize)), { fill: "#ffe08a", stroke: "rgba(0,0,0,0.7)" });
        } else {
          const markerRotation = worldHeadingToMinimapRotation(num(localPosition.rotationY, 0));
          drawTriangleMarker(ctx, point.x, point.y, iconSize, markerRotation, { fill: "#ffe08a", stroke: "rgba(0,0,0,0.7)" });
          if (config.showViewportCone !== false) {
            drawViewportCone(ctx, point.x, point.y, markerRotation, Math.max(16, size * 0.22), 50, { fill: "#ffffff", alpha: 0.16 });
          }
        }
        // Local labels stay available in lite mode, but are dropped in ultra-lite fallback because
        // repeated text rendering is one of the first things that starts to bite frame time.
        if (config.showPlayerName !== false && !ultraLiteMode) {
          const name = state.player?.displayName || state.player?.id || "";
          drawMarkerLabel(ctx, name, point.x, point.y, fontSize, nameMaxLength);
        }
      }
    }
  }
  // Fellow players remain visible in every mode. Lite mode keeps the dots, but skips the more
  // expensive name labels so the HUD can stay responsive when the frame budget is tight.
  if (config.showRemotePlayers !== false) {
    for (const entry of state.remote.players.values()) {
      const position = entry.renderState?.position || entry.position;
      if (!position) continue;
      const point = resolveMinimapPoint(position.x, position.z, viewBounds, size, size, clampOutside);
      if (!point) continue;
      drawDotMarker(ctx, point.x, point.y, iconSize, { fill: "#7bd4ff", stroke: "rgba(0,0,0,0.6)" });
      if (shouldShowRemotePlayerNames(config, performanceMode)) {
        const fontSize = Math.max(6, Number(config.fontSizePx) || 10);
        const nameMaxLength = Math.max(3, Number(config.nameMaxLength) || 14);
        drawMarkerLabel(ctx, entry.displayName || entry.playerId, point.x, point.y, fontSize, nameMaxLength, iconSize + 3);
      }
    }
  }
  drawNode04MinimapMarkers(ctx, config, viewBounds, size, clampOutside, performanceMode);
  if (liteMode) return;

  if ((config.showNpcEntities !== false || config.showScatterInstances === true) && Array.isArray(state.gameWorld?.entities)) {
    for (const entity of state.gameWorld.entities) {
      const position = entity?.transform?.position;
      if (!position) continue;
      const isScatter = entity.kind === "scatter" || entity.type === "scatter" || Boolean(entity.scatterId);
      if (isScatter && config.showScatterInstances !== true) continue;
      if (!isScatter && config.showNpcEntities === false) continue;
      const point = resolveMinimapPoint(position.x, position.z, viewBounds, size, size, clampOutside);
      if (!point) continue;
      drawDiamondMarker(ctx, point.x, point.y, iconSize, { fill: isScatter ? "#7ccf6b" : "#d59bff", stroke: "rgba(0,0,0,0.6)" });
      const showName = isScatter ? config.showScatterNames === true : config.showNpcEntityNames === true;
      if (showName) {
        const fontSize = Math.max(6, Number(config.fontSizePx) || 10);
        const nameMaxLength = Math.max(3, Number(config.nameMaxLength) || 14);
        drawMarkerLabel(ctx, entity.label || entity.entityId || entity.id, point.x, point.y, fontSize, nameMaxLength);
      }
    }
  }
  if (config.showInteractables === true && Array.isArray(state.gameWorld?.interactables)) {
    for (const item of state.gameWorld.interactables) {
      const position = item?.position;
      if (!position) continue;
      const point = resolveMinimapPoint(position.x, position.z, viewBounds, size, size, clampOutside);
      if (!point) continue;
      drawSquareMarker(ctx, point.x, point.y, iconSize, { fill: "#9be870", stroke: "rgba(0,0,0,0.6)" });
    }
  }
  if (config.showSpawn === true && state.gameWorld?.spawn) {
    const spawn = state.gameWorld.spawn;
    const point = resolveMinimapPoint(spawn.x, spawn.z, viewBounds, size, size, clampOutside);
    if (point) drawCrossMarker(ctx, point.x, point.y, iconSize, { stroke: "#9be870" });
  }
}

function drawGameMinimapIfDue(now) {
  const hudState = state.minimapHud;
  if (!hudState.elements) return;

  const config = resolveGameMinimapConfig();
  if (!config) return;

  const performanceMode = resolveGameMinimapPerformanceMode(config, now);
  const intervalMs = gameMinimapRefreshInterval(config, performanceMode);
  const fogDirty = state.minimapFog.dirty === true;
  if (!hudState.dirty && !fogDirty && now - hudState.lastDrawAt < intervalMs) {
    return;
  }
  const bake = resolveGameMinimapBake(config);
  const bounds = resolveGameMinimapBakeBounds(bake);
  const view = bounds ? ensureGameMinimapView(config, bounds) : null;
  const drawKey = performanceMode === "full" ? null : buildGameMinimapDrawKey(bake, view, performanceMode);
  if (!hudState.dirty && !fogDirty && performanceMode !== "full" && hudState.lastDrawKey === drawKey) {
    return;
  }

  const drawStartedAt = performance.now();
  hudState.lastDrawAt = now;
  hudState.lastDrawKey = drawKey;
  hudState.dirty = false;

  drawGameMinimap(config, bake, view, performanceMode);
  const drawFinishedAt = performance.now();
  hudState.lastDrawAt = drawFinishedAt;
  noteGameMinimapPerformance(drawFinishedAt - drawStartedAt, drawFinishedAt);
  recordGameLoopTiming("minimapDraw", drawFinishedAt - drawStartedAt, drawFinishedAt);
}

function updateHud() {
  const els = state.debugHud.elements;
  if (!els) return;
  const debugState = buildClientDebugState();
  if (els.hudUser) els.hudUser.textContent = state.user ? (state.user.username || state.user.email || state.user.id) : "-";
  if (els.hudPlayer) els.hudPlayer.textContent = state.player ? ((state.player.displayName || state.player.id) + " · " + state.player.id.slice(0, 8)) : "-";
  if (els.hudSession) els.hudSession.textContent = state.session ? ((state.session.deviceLabel || "unknown device") + " · " + state.session.id.slice(0, 8)) : "-";
  if (els.hudPosition) els.hudPosition.textContent = state.position ? formatPosition(state.position) : "-";
  if (els.hudSessions) els.hudSessions.textContent = `${state.connectedSessionCount || 0} live / ${state.activeSessionCount || 0} total`;
  if (els.hudRevision) els.hudRevision.textContent = state.position ? String(state.position.revision) : "-";
  if (els.hudLastSent) els.hudLastSent.textContent = state.debug.lastSentType ? (state.debug.lastSentType + " · " + formatDebugTimestamp(state.debug.lastSentAt)) : "-";
  if (els.hudLastSentSeq) els.hudLastSentSeq.textContent = String(state.net.lastSentInputSeq || 0);
  if (els.hudLastAckedSeq) els.hudLastAckedSeq.textContent = String(state.net.lastAckedInputSeq || 0);
  if (els.hudPendingInputs) els.hudPendingInputs.textContent = String(state.net.pendingInputs.length || 0);
  if (els.hudController) {
    const controllerSession = state.control.activeControllerSessionId || state.net.lastRemoteControllerSessionId || "-";
    const controllerLabel = state.control.isLocalController ? "local" : "passive";
    els.hudController.textContent = controllerLabel + " · " + String(controllerSession || "-").slice(0, 8);
  }
  if (els.hudLastTransport) els.hudLastTransport.textContent = state.net.lastTransport || "-";
  if (els.hudLastIgnored) els.hudLastIgnored.textContent = state.net.lastIgnoredReason || "-";
  if (els.hudServerSeq) els.hudServerSeq.textContent = String(state.net.lastServerSeq || 0);
  if (els.hudLastReceived) els.hudLastReceived.textContent = state.debug.lastReceivedType ? (state.debug.lastReceivedType + " · " + formatDebugTimestamp(state.debug.lastReceivedAt)) : "-";
  if (els.hudLastSource) els.hudLastSource.textContent = state.debug.lastSourceSessionId ? state.debug.lastSourceSessionId.slice(0, 8) : "-";
  if (els.hudLastError) els.hudLastError.textContent = state.debug.lastError || "-";
  if (els.hudWsRawState) els.hudWsRawState.textContent = debugState.wsRawState || "-";
  if (els.hudWsVisibleState) els.hudWsVisibleState.textContent = debugState.wsVisibleState || "-";
  if (els.hudReconnectAttempt) els.hudReconnectAttempt.textContent = String(debugState.reconnectAttempt || 0);
  if (els.hudReconnectSuppressedCount) els.hudReconnectSuppressedCount.textContent = String(debugState.reconnectSuppressedCount || 0);
  if (els.hudLastClose) {
    const code = debugState.lastCloseCode !== null && debugState.lastCloseCode !== undefined ? String(debugState.lastCloseCode) : "-";
    const reason = debugState.lastCloseReason ? String(debugState.lastCloseReason).slice(0, 36) : "-";
    els.hudLastClose.textContent = code + " · " + reason;
  }
  if (els.hudLastConnected) els.hudLastConnected.textContent = formatMetricMs(debugState.lastConnectedAgeMs);
  if (els.hudLastDisconnected) els.hudLastDisconnected.textContent = formatMetricMs(debugState.lastDisconnectedAgeMs);
  if (els.hudPingMs) els.hudPingMs.textContent = formatMetricMs(debugState.pingMs);
  if (els.hudAvgPingMs) els.hudAvgPingMs.textContent = formatMetricMs(debugState.avgPingMs);
  if (els.hudJitterMs) els.hudJitterMs.textContent = formatMetricMs(debugState.jitterMs);
  if (els.hudLastPongAgeMs) els.hudLastPongAgeMs.textContent = formatMetricMs(debugState.lastPongAgeMs);
  if (els.hudPacketAgeMs) els.hudPacketAgeMs.textContent = formatMetricMs(debugState.packetAgeMs);
  if (els.hudWorldId) els.hudWorldId.textContent = state.worldId || "-";
  if (els.hudLocalPlayerId) els.hudLocalPlayerId.textContent = state.player?.id || "-";
  if (els.hudRemotePlayers) els.hudRemotePlayers.textContent = String(debugState.remotePlayerCount || 0);
  if (els.hudWorldPlayers) els.hudWorldPlayers.textContent = String((debugState.remotePlayerCount || 0) + (state.player ? 1 : 0));
  if (els.hudRemotePacketAge) els.hudRemotePacketAge.textContent = formatMetricMs(debugState.remotePacketAgeMs);
  if (els.hudRemoteDelay) els.hudRemoteDelay.textContent = formatMetricMs(debugState.remoteInterpolationDelayMs);
  if (els.hudGameProject) {
    const projectName = state.gameProject?.project?.gameName || state.gameProject?.project?.id || state.gameProject?.projectId || "-";
    const schema = state.gameProject?.schemaVersion || state.schemaVersion || "-";
    els.hudGameProject.textContent = projectName === "-" ? schema : projectName + " · " + schema;
  }
  if (els.hudSchemaVersion) els.hudSchemaVersion.textContent = state.schemaVersion || state.gameProject?.schemaVersion || "-";
  if (els.hudBuildId) els.hudBuildId.textContent = state.buildId || "-";
  if (els.hudContentHash) els.hudContentHash.textContent = state.contentHash || "-";
  if (els.hudPublishedAt) els.hudPublishedAt.textContent = state.publishedAt || state.lastPublishedAt || "-";
  if (els.hudRemoteBufferSizes) {
    const bufferSizes = Array.isArray(debugState.remoteBufferSizes) ? debugState.remoteBufferSizes : [];
    const display = bufferSizes.length
      ? bufferSizes.slice(0, 6).map(function (item) {
        const playerId = String(item.playerId || "").slice(0, 8) || "unknown";
        return playerId + ":" + String(item.bufferSize || 0);
      }).join(", ") + (bufferSizes.length > 6 ? " +" + (bufferSizes.length - 6) : "")
      : "-";
    els.hudRemoteBufferSizes.textContent = display;
  }
  if (els.hudRemoteDropped) els.hudRemoteDropped.textContent = String(debugState.droppedStaleRemoteUpdates || 0);
  if (els.hudRemoteHardSnapCount) els.hudRemoteHardSnapCount.textContent = String(debugState.remoteHardSnapCount || 0);
  if (els.hudRemoteSmoothFrameCount) els.hudRemoteSmoothFrameCount.textContent = String(debugState.remoteSmoothFrameCount || 0);
  if (els.hudLastRemoteEventType) els.hudLastRemoteEventType.textContent = debugState.lastRemoteEventType || "-";
  if (els.hudRemoteIds) {
    const ids = Array.from(state.remote.players.keys());
    const display = ids.length ? ids.slice(0, 6).join(", ") + (ids.length > 6 ? " +" + (ids.length - 6) : "") : "-";
    els.hudRemoteIds.textContent = display;
  }
  if (els.hudMmoSettings) {
    const settings = debugState.mmoNetworkSettings || {};
    els.hudMmoSettings.textContent = [
      "preset " + (settings.networkPreset || "custom"),
      "tick " + Math.round(num(settings.serverTickRateHz, 0)) + "hz",
      "snap " + Math.round(num(settings.snapshotRateHz, 0)) + "hz",
      "input " + Math.round(num(settings.inputSendRateHz, 0)) + "hz",
      "send " + Math.round(num(settings.moveSendIntervalMs, 0)) + "ms",
      "interp " + Math.round(num(settings.remoteInterpolationBaseDelayMs, 0)) + "ms (" + Math.round(num(settings.remoteInterpolationMinDelayMs, 0)) + "-" + Math.round(num(settings.remoteInterpolationMaxDelayMs, 0)) + ")",
      "extra " + Math.round(num(settings.remoteMaxExtrapolationMs, 0)) + "ms",
      "reconcile " + (settings.reconciliationEnabled !== false ? "aan" : "uit") + " / pred " + (settings.predictionEnabled !== false ? "aan" : "uit"),
      "hold " + (settings.ownKeepPredictionDuringInput !== false ? "aan" : "uit"),
      "post " + Math.round(num(settings.ownPostInputHoldMs, 0)) + "ms",
      "stop " + Math.round(num(settings.ownStopResyncMaxUnits, 0)),
      "cap " + num(settings.ownActiveCorrectionMaxUnits, 0).toFixed(2),
      "smooth " + Math.round(num(settings.ownCorrectionBlendMs, 0)) + "ms",
      "snap " + num(settings.ownHardCorrectionThreshold, 0).toFixed(1)
    ].join(" · ");
  }
  if (els.hudMmoHealth) {
    const ready = debugState.mmoReady || {};
    els.hudMmoHealth.textContent = [
      "ready " + (ready.onlineReady ? "ja" : "nee"),
      "blocker " + (ready.blocker || "geen"),
      "protocol " + (debugState.movementProtocol || "geen"),
      "snap avg " + Math.round(num(debugState.avgSnapshotIntervalMs, 0)) + "ms",
      "max " + Math.round(num(debugState.maxSnapshotIntervalMs, 0)) + "ms",
      "backlog " + formatMetricMs(debugState.interpolationBacklogMs),
      "lag " + formatMetricMs(debugState.maxObserverLagMs),
      "jump " + num(debugState.maxRemoteJump, 0).toFixed(2),
      "drops " + String(debugState.droppedRemoteSamples || 0)
    ].join(" · ");
  }
  if (els.hudMinimapFog) {
    const fog = debugState.minimapFog || {};
    els.hudMinimapFog.textContent = [
      fog.enabled ? "aan" : "uit",
      "bron " + (fog.configSource || "geen"),
      "cells " + String(fog.discoveredCount || 0),
      "loaded " + (fog.loaded ? "ja" : "nee"),
      "cell " + String(fog.cellSize || 0),
      "radius " + String(fog.revealRadius || 0),
      "save " + String(fog.saveIntervalMs || 0) + "ms",
      "layer " + (fog.mapLayer || "overworld")
    ].join(" · ");
  }
}

function ensureRuntime(world) {
  const desiredAntialias = world?.world?.performance?.game?.antialias !== false;
  if (state.runtime && state.runtimeAntialias !== desiredAntialias) {
    state.runtime.destroy();
    state.runtime = null;
    window.__GK_GAME_RUNTIME = null;
  }
  if (!state.runtime) {
    state.runtime = createGkWorldRuntime(canvas, {
      mode: "game",
      antialias: desiredAntialias,
      hud: hud,
      externalPlayerAuthority: true,
      localPlayerDisplayName: state.player?.displayName || state.player?.id || "",
      onLoadErrors: function (errors) {
        if (errors.length) showHudError(errors[0]);
      }
    });
    state.runtimeAntialias = desiredAntialias;
    window.__GK_GAME_RUNTIME = state.runtime;
  }
  return state.runtime;
}

function currentLocalPlayerDisplayName() {
  return state.player?.displayName || state.player?.id || "";
}

function syncLocalPlayerNameplate() {
  if (!state.runtime || typeof state.runtime.setLocalPlayerDisplayName !== "function") return;
  state.runtime.setLocalPlayerDisplayName(currentLocalPlayerDisplayName());
}

function showHudError(message) {
  const node = hud.querySelector(".hud-prompt");
  if (!node) return;
  node.textContent = "Asset kon niet laden: " + message;
  node.style.display = "block";
  window.clearTimeout(state.hudErrorTimer);
  state.hudErrorTimer = window.setTimeout(function () {
    node.style.display = "none";
  }, 2500);
}

function hasKeyboardMovementInput() {
  return state.input.move_forward || state.input.move_back || state.input.move_left || state.input.move_right;
}

function pointerTargetDistance() {
  if (!state.pointer.target || !state.predictedPosition) return -1;
  return Math.hypot(state.pointer.target.x - state.predictedPosition.x, state.pointer.target.z - state.predictedPosition.z);
}

function clickMoveSelfRadius() {
  return Math.max(CLICK_MOVE_START_RADIUS, currentCollisionRadius() * CLICK_MOVE_SELF_RADIUS_MULTIPLIER);
}

function clickMoveArrivalRadius() {
  return Math.max(CLICK_MOVE_ARRIVAL_RADIUS, currentCollisionRadius() * 0.9);
}

function hasMovementInput() {
  if (hasKeyboardMovementInput()) return true;
  return state.pointer.active && state.pointer.moved && (state.pointer.target || state.pointer.lastHoldVector);
}

function refreshPointerTargetFromScreenPosition(screenX, screenY) {
  if (!state.runtime || typeof state.runtime.screenToGround !== "function") return false;
  if (!Number.isFinite(Number(screenX)) || !Number.isFinite(Number(screenY))) return false;
  const ground = state.runtime.screenToGround(screenX, screenY);
  if (!ground) return false;
  state.pointer.target = { x: ground.x, z: ground.z };
  if (state.predictedPosition) {
    const dx = state.pointer.target.x - state.predictedPosition.x;
    const dz = state.pointer.target.z - state.predictedPosition.z;
    const length = Math.hypot(dx, dz);
    if (length > 0.0001) {
      state.pointer.lastHoldVector = { x: dx / length, z: dz / length };
    }
  }
  return true;
}

function isPointerHoldActive() {
  return state.pointer.active
    && state.pointer.pointerId !== null
    && state.pointer.pointerId !== -1
    && state.pointer.downAt > 0;
}

function refreshPointerTargetFromActivePointer(options = {}) {
  if (!state.pointer.active) return false;
  if (state.pointer.mode === "click_to_move" && options.allowClickToMove !== true) return false;
  return refreshPointerTargetFromScreenPosition(state.pointer.screenX, state.pointer.screenY);
}

function shouldSendPointerTargetToServer() {
  if (!state.pointer.target) return false;
  // While the mouse/finger is held down the client uses the pointer as a
  // direction hold. Sending the ground point would make the server walk to a
  // stale target and stop there while local prediction keeps moving.
  if (state.pointer.active && state.pointer.moved && isPointerHoldActive()) return false;
  return true;
}

function startClickToMoveTarget(worldX, worldZ, source = null) {
  if (!isMmoGameplayReady()) return false;
  clearPointerTarget(false);
  state.pointer.active = true;
  state.pointer.pointerId = null;
  state.pointer.mode = "click_to_move";
  state.pointer.downX = 0;
  state.pointer.downY = 0;
  state.pointer.screenX = 0;
  state.pointer.screenY = 0;
  state.pointer.downAt = performance.now();
  state.pointer.blockedSince = 0;
  state.pointer.lastDistanceToTarget = -1;
  state.pointer.moved = true;
  state.pointer.dragged = false;
  state.pointer.lastHoldVector = null;
  state.pointer.target = { x: Number(worldX) || 0, z: Number(worldZ) || 0 };
  if (pointerTargetDistance() <= clickMoveSelfRadius()) {
    clearPointerTarget(false);
    return false;
  }
  noteLocalControlStart(true, source || "click-to-move");
  return true;
}

function currentMoveVector() {
  const basis = state.runtime && typeof state.runtime.getCameraGroundBasis === "function"
    ? state.runtime.getCameraGroundBasis()
    : null;
  const forward = basis?.forward || { x: 0, z: -1 };
  const right = basis?.right || { x: -1, z: 0 };
  let x = 0;
  let z = 0;
  if (hasKeyboardMovementInput()) {
    if (state.input.move_forward) { x += forward.x; z += forward.z; }
    if (state.input.move_back) { x -= forward.x; z -= forward.z; }
    if (state.input.move_left) { x -= right.x; z -= right.z; }
    if (state.input.move_right) { x += right.x; z += right.z; }
    return { x, z };
  }
  if (state.pointer.active && state.pointer.moved) {
    const pointerHeld = isPointerHoldActive();
    if (pointerHeld && state.pointer.mode === "click_to_move") {
      refreshPointerTargetFromActivePointer({ allowClickToMove: true });
    }
    if (state.pointer.mode === "click_to_move") {
      if (!state.pointer.target || !state.predictedPosition) return { x: 0, z: 0 };
      x = state.pointer.target.x - state.predictedPosition.x;
      z = state.pointer.target.z - state.predictedPosition.z;
      const length = Math.hypot(x, z);
      if (length <= clickMoveArrivalRadius()) {
        if (pointerHeld && state.pointer.lastHoldVector) {
          return { x: state.pointer.lastHoldVector.x, z: state.pointer.lastHoldVector.z };
        }
        clearMovementInput("click-target-arrived");
        return { x: 0, z: 0 };
      }
      if (length > 0.0001) {
        state.pointer.lastHoldVector = { x: x / length, z: z / length };
      }
      return { x, z };
    }
    refreshPointerTargetFromActivePointer();
    if (state.pointer.target && state.predictedPosition) {
      x = state.pointer.target.x - state.predictedPosition.x;
      z = state.pointer.target.z - state.predictedPosition.z;
      const length = Math.hypot(x, z);
      if (length > 0.0001) {
        state.pointer.lastHoldVector = { x: x / length, z: z / length };
        return { x, z };
      }
    }
    if (state.pointer.lastHoldVector) {
      return { x: state.pointer.lastHoldVector.x, z: state.pointer.lastHoldVector.z };
    }
  }
  return { x, z };
}

function currentSpeed() {
  const player = state.gameWorld?.player || {};
  const moveSpeed = Math.max(0.1, num(player.moveSpeed, 6));
  const sprintMultiplier = Math.min(2.5, Math.max(1, num(player.sprintMultiplier, 1.6)));
  return moveSpeed * (state.input.sprint ? sprintMultiplier : 1);
}

function currentCollisionRadius() {
  return Math.max(0.05, num(state.gameWorld?.player?.collisionRadius, 0.5));
}

function snapshotWorldKey(snapshot) {
  const world = snapshot?.gameWorld || null;
  return String(
    snapshot?.worldPublishedAt
    || snapshot?.publishedAt
    || world?.publishedAt
    || snapshot?.contentHash
    || world?.contentHash
    || snapshot?.buildId
    || world?.buildId
    || snapshot?.worldId
    || ""
  );
}

function applyRuntimePosition(position, options = {}) {
  if (!state.runtime || !position) return;
  state.runtime.setPlayerState(position, {
    immediate: options.immediate !== false && options.reconcile !== true,
    reconcile: options.reconcile === true,
    animationState: options.animationState,
    reconcileDurationMs: options.reconcileDurationMs
  });
}

function primeHttpSnapshotState(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return;
  state.user = snapshot.user || state.user;
  state.session = snapshot.session || state.session;
  state.player = snapshot.player || state.player;
  state.spawn = clonePosition(snapshot.spawn || state.spawn);
  state.activeSessionCount = snapshot.activeSessionCount || 0;
  state.connectedSessionCount = snapshot.connectedSessionCount || 0;
  state.worldId = snapshot.worldId || state.worldId;
  state.gameWorld = snapshot.gameWorld || state.gameWorld;
  state.gameProject = snapshot.gameProject || state.gameWorld?.gameProject || state.gameProject;
  state.remote.interpolationDelayMs = mmoNetworkSettings().remoteInterpolationBaseDelayMs;
  state.remote.remoteRenderDelayMs = state.remote.interpolationDelayMs;
  state.schemaVersion = snapshot.schemaVersion || state.gameWorld?.schemaVersion || state.gameProject?.schemaVersion || state.schemaVersion;
  state.buildId = snapshot.buildId || state.gameWorld?.buildId || state.gameProject?.buildId || state.buildId;
  state.contentHash = snapshot.contentHash || state.gameWorld?.contentHash || state.gameProject?.contentHash || state.contentHash;
  state.publishedAt = snapshot.publishedAt || snapshot.worldPublishedAt || state.gameWorld?.publishedAt || state.publishedAt;
  state.remote.worldId = state.worldId;
  state.mmoReady.httpSnapshotLoaded = true;
}

// FIX-9: ignore anything older than what we already know, so a delayed WS frame or a stale
// HTTP fallback response can never rubber-band the player back to an earlier place.
function shouldApplyServerPosition(next) {
  return shouldApplyServerRevision(state.position?.revision, next?.revision);
}

function applySnapshotToRuntime(snapshot, options = {}) {
  primeHttpSnapshotState(snapshot);
  if (state.gameWorld) {
    const runtime = ensureRuntime(state.gameWorld);
    syncLocalPlayerNameplate();
    const nextWorldKey = snapshotWorldKey(snapshot);
    if (!state.runtimeWorldKey || state.runtimeWorldKey !== nextWorldKey || options.forceWorld === true) {
      clearRemotePlayers("world-reset");
      runtime.setWorld(state.gameWorld);
      state.runtimeWorldKey = nextWorldKey;
    }
    syncLocalPlayerNameplate();
  }
  state.mmoReady.runtimeReady = Boolean(state.runtime);
  const incomingPosition = normalizeIncomingServerPosition(snapshot.position || snapshot.spawn || state.position, "snapshot");
  if (incomingPosition) {
    applyAuthoritativeUpdate(incomingPosition, {
      transport: "snapshot",
      keepPrediction: options.keepPrediction === true
    });
  }
  refreshMmoDebugHud();
  refreshGameMinimapHud();
  loadMinimapFogDiscovery(resolveGameMinimapConfig());
  maybeMarkMmoOnlineReady("snapshot");
}

function applyMmoBootstrap(snapshot) {
  const payload = snapshot && typeof snapshot === "object" ? snapshot : {};
  const localPlayer = payload.localPlayer && typeof payload.localPlayer === "object" ? payload.localPlayer : null;
  const connection = payload.connection && typeof payload.connection === "object" ? payload.connection : null;
  const presence = payload.presence && typeof payload.presence === "object" ? payload.presence : null;
  state.mmoReady.bootstrapReceived = true;
  if (connection) {
    if (connection.worldId) state.worldId = connection.worldId;
  }
  if (localPlayer) {
    updateFromConnectionSnapshot({
      player: localPlayer.player || null,
      position: localPlayer.position || null,
      activeSessionCount: localPlayer.activeSessionCount,
      connectedSessionCount: localPlayer.connectedSessionCount
    });
  }
  if (presence) {
    applyRemotePresenceSnapshot(Object.assign({}, presence, {
      serverTimeMs: payload.serverTimeMs ?? presence.serverTimeMs ?? null,
      serverSeq: payload.serverSeq ?? presence.serverSeq ?? 0,
      serverSentAtMs: payload.serverSentAtMs ?? payload.serverTimeMs ?? presence.serverSentAtMs ?? null
    }));
  }
  state.mmoReady.connectionReadyReceived = true;
  state.mmoReady.playerStateReceived = true;
  maybeMarkMmoOnlineReady("bootstrap");
}

function updateServerPositionFromBroadcast(payload) {
  // player:state_changed nests only x/y/z/rotationY under `.position`; revision/updatedAt/
  // sourceSessionId/sourceDevice/animationState/moving are siblings at the top level.
  const nextPosition = normalizeIncomingServerPosition(payload, "ws");
  if (!nextPosition) return;
  const applied = applyAuthoritativeUpdate(nextPosition, { transport: "ws" });
  if (!applied) {
    updateHud();
    return;
  }
  updateHud();
}

function updateFromConnectionSnapshot(snapshot) {
  if (!snapshot) return;
  if (snapshot.user) state.user = snapshot.user;
  if (snapshot.session) state.session = snapshot.session;
  if (snapshot.player) state.player = snapshot.player;
  if (typeof snapshot.activeSessionCount === "number") state.activeSessionCount = snapshot.activeSessionCount;
  if (typeof snapshot.connectedSessionCount === "number") state.connectedSessionCount = snapshot.connectedSessionCount;
  if (snapshot.position || snapshot.spawn) {
    applyAuthoritativeUpdate(normalizeIncomingServerPosition(snapshot.position || snapshot.spawn, "ws-state"), {
      transport: "ws",
      keepPrediction: hasMovementInput()
    });
  }
  updateHud();
  syncLocalPlayerNameplate();
}

function applyRemotePresenceSnapshot(snapshot) {
  const payload = snapshot && typeof snapshot === "object" ? snapshot : {};
  const worldId = payload.worldId || payload.world_id || state.worldId || null;
  if (!remoteWorldMatches(worldId)) {
    state.remote.droppedStaleUpdates += 1;
    return;
  }
  const players = Array.isArray(payload.players) ? payload.players : [];
  const seen = new Set();
  state.remote.worldId = worldId || state.remote.worldId || null;
  state.remote.lastSnapshotAt = performance.now();
  state.remote.lastPacketAt = state.remote.lastSnapshotAt;
  state.remote.lastPacketType = "world:presence_snapshot";
  state.remote.lastRemoteEventType = "world:presence_snapshot";
  state.remote.lastSnapshotPlayerIds = [];
  for (const player of players) {
    if (!player || typeof player !== "object") continue;
    if (player.isSelfAccount === true) continue;
    if (!player.playerId || !remoteWorldMatches(player.worldId || worldId)) continue;
    seen.add(String(player.playerId));
    state.remote.lastSnapshotPlayerIds.push(String(player.playerId));
    upsertRemotePlayerEntry(Object.assign({}, player, {
      serverTimeMs: payload.serverTimeMs ?? player.serverTimeMs ?? null,
      serverSeq: payload.serverSeq ?? player.serverSeq ?? 0,
      serverSentAtMs: payload.serverSentAtMs ?? payload.serverTimeMs ?? player.serverSentAtMs ?? null
    }), { reset: true, type: "world:presence_snapshot" });
  }
  for (const existingId of Array.from(state.remote.players.keys())) {
    const entry = state.remote.players.get(existingId);
    if (!entry) continue;
    if (entry.worldId && worldId && entry.worldId !== worldId) continue;
    if (!seen.has(existingId)) {
      removeRemotePlayerEntry(existingId, "snapshot-prune", { revision: entry.revision, updatedAt: entry.updatedAt });
    }
  }
  state.remote.remotePlayerIds = Array.from(state.remote.players.keys());
  state.mmoReady.presenceSnapshotReceived = true;
  maybeMarkMmoOnlineReady("presence_snapshot");
  updateHud();
  syncRemotePlayers(performance.now());
}

function applyRemotePlayerJoined(payload) {
  const sample = normalizeRemotePlayerPayload(payload);
  if (!sample.playerId || !sample.worldId) return;
  if (!remoteWorldMatches(sample.worldId)) {
    state.remote.droppedStaleUpdates += 1;
    return;
  }
  state.remote.worldId = sample.worldId || state.remote.worldId || null;
  state.remote.lastPacketAt = performance.now();
  state.remote.lastPacketType = "remote_player:joined";
  state.remote.lastRemoteEventType = "remote_player:joined";
  upsertRemotePlayerEntry(payload, { reset: true, type: "remote_player:joined" });
  state.remote.remotePlayerIds = Array.from(state.remote.players.keys());
  updateHud();
  syncRemotePlayers(performance.now());
}

function applyRemotePlayerStateChanged(payload) {
  const sample = normalizeRemotePlayerPayload(payload);
  if (!sample.playerId || !sample.worldId) return;
  if (!remoteWorldMatches(sample.worldId)) {
    state.remote.droppedStaleUpdates += 1;
    return;
  }
  state.remote.worldId = sample.worldId || state.remote.worldId || null;
  state.remote.lastPacketAt = performance.now();
  state.remote.lastPacketType = "remote_player:state_changed";
  state.remote.lastRemoteEventType = "remote_player:state_changed";
  upsertRemotePlayerEntry(payload, { type: "remote_player:state_changed" });
  state.remote.remotePlayerIds = Array.from(state.remote.players.keys());
  updateHud();
}

function applyRemotePlayerLeft(payload) {
  const sample = normalizeRemotePlayerPayload(payload);
  if (!sample.playerId) return;
  if (!remoteWorldMatches(sample.worldId)) {
    state.remote.droppedStaleUpdates += 1;
    return;
  }
  state.remote.worldId = sample.worldId || state.remote.worldId || null;
  state.remote.lastPacketAt = performance.now();
  state.remote.lastPacketType = "remote_player:left";
  state.remote.lastRemoteEventType = "remote_player:left";
  removeRemotePlayerEntry(sample.playerId, "remote_player:left", sample);
  state.remote.remotePlayerIds = Array.from(state.remote.players.keys());
  updateHud();
}

function openWebSocket() {
  if (!state.session || !state.wantReconnect) return;
  if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) return;
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  resetMmoConnectionReadiness("open");
  const attemptId = state.wsConnectionAttemptId + 1;
  state.wsConnectionAttemptId = attemptId;
  const socket = new WebSocket(buildGameWsUrl());
  socket._gkConnectionAttemptId = attemptId;
  state.ws = socket;
  updateWsStatus(state.wsConnectedOnce ? "reconnecting" : "connecting", state.wsConnectedOnce ? "reconnecting" : "connecting", {
    attemptId: attemptId,
    immediate: state.wsConnectedOnce !== true
  });

  socket.addEventListener("open", function () {
    if (socket._gkConnectionAttemptId !== state.wsConnectionAttemptId) return;
    state.reconnectAttempt = 0;
    state.net.lastWsOpenAt = performance.now();
    state.mmoReady.socketOpen = true;
    markWsConnected();
    startPingLoop(socket, attemptId);
    try {
      socket.send(JSON.stringify({ type: "player:request_state" }));
    } catch (error) {
      state.debug.lastError = String(error?.message || error || "socket open send failed");
    }
    maybeMarkMmoOnlineReady("socket_open");
  });

  socket.addEventListener("message", function (event) {
    if (socket._gkConnectionAttemptId !== state.wsConnectionAttemptId) return;
    handleSocketMessage(event.data);
  });

  socket.addEventListener("close", function (event) {
    handleSocketClose(socket, event);
  });

  socket.addEventListener("error", function () {
    if (socket._gkConnectionAttemptId !== state.wsConnectionAttemptId) return;
    if (socket.readyState !== WebSocket.CLOSED) {
      updateWsStatus(state.wsConnectedOnce ? "reconnecting" : "connecting", state.wsConnectedOnce ? "reconnecting" : "connecting", {
        attemptId: attemptId
      });
    }
  });
}

function closeWebSocket(intentional = true) {
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  stopPingLoop();
  if (!state.ws) return;
  const socket = state.ws;
  socket._gkIntentionalClose = intentional;
  try {
    socket.close(1000, intentional ? "client-close" : "disconnect");
  } catch {
    try { socket.terminate(); } catch {}
  }
}

function handleSocketClose(socket, event) {
  if (!socket || socket._gkConnectionAttemptId !== state.wsConnectionAttemptId) return;
  if (state.ws === socket) state.ws = null;
  stopPingLoop();
  resetMmoConnectionReadiness("close");
  state.lastCloseCode = Number(event?.code) || null;
  state.lastCloseReason = String(event?.reason || "");
  state.debug.lastError = "WS close " + event.code + " " + (event.reason || "");
  clearMovementInput("ws-close", { resetSprint: true });
  if (socket._gkIntentionalClose) {
    updateWsStatus("disconnected", "disconnected", { immediate: true, final: true });
    return;
  }
  if (event.code === 4001) {
    state.wantReconnect = false;
    stopRemoteFrameLoop();
    clearRemotePlayers("session-ended");
    updateWsStatus("disconnected", "session ended", { immediate: true, final: true });
    window.location.href = "/login/?next=%2Fgame%2F";
    return;
  }
  if (event.code === 4408) {
    state.wantReconnect = false;
    stopRemoteFrameLoop();
    clearRemotePlayers("rate-limited");
    updateWsStatus("disconnected", "rate limited", { immediate: true, final: true });
    showOverlay("WebSocket rate limit overschreden. Herlaad de pagina om opnieuw te verbinden.");
    return;
  }
  updateWsStatus("reconnecting", "reconnecting", {
    attemptId: socket._gkConnectionAttemptId,
    delayMs: mmoNetworkSettings().wsStatusHysteresisMs
  });
  scheduleReconnect();
}

function scheduleReconnect() {
  if (!state.wantReconnect || !state.session) return;
  if (state.reconnectTimer) return;
  // FIX-12: zolang we nog nooit verbonden zijn geweest (eerste page load),
  // snel opnieuw proberen: 150ms, 300, 450... De trage backoff (tot 5s) is
  // alleen bedoeld voor verbroken verbindingen ná een geslaagde connectie,
  // om de server niet te hameren bij een echte storing.
  const delay = state.wsConnectedOnce
    ? Math.min(5000, 500 + (state.reconnectAttempt * 500))
    : Math.min(1000, 150 + (state.reconnectAttempt * 150));
  state.reconnectAttempt += 1;
  state.reconnectTimer = window.setTimeout(function () {
    state.reconnectTimer = null;
    openWebSocket();
  }, delay);
}

function handleSocketMessage(raw) {
  let message = null;
  try {
    message = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
  } catch {
    return;
  }
  if (!message || typeof message.type !== "string") return;

  const packetAt = performance.now();
  state.net.lastServerPacketAt = packetAt;
  if (Number.isFinite(Number(message.serverSeq))) {
    state.net.lastServerSeq = Math.max(Number(state.net.lastServerSeq || 0), Math.floor(Number(message.serverSeq)));
  }
  state.debug.lastPacketType = message.type;
  state.debug.lastPacketAt = packetAt;
  updateClockOffsetFromServerMessage(message, packetAt);

  if (message.type !== "ping" && message.type !== "pong") {
    state.debug.lastReceivedType = message.type;
    state.debug.lastReceivedAt = packetAt;
    if (message.sourceSessionId) state.debug.lastSourceSessionId = message.sourceSessionId;
  }

  if (message.type === "ping") {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      try {
        state.ws.send(JSON.stringify({ type: "pong", clientPingSeq: message.clientPingSeq || null, clientSentAt: message.clientSentAt || null }));
      } catch {}
    }
    return;
  }
  if (message.type === "pong") {
    const sentAt = Number(message.clientSentAt);
    if (Number.isFinite(sentAt) && sentAt > 0) {
      recordPingSample(epochNow(packetAt) - sentAt, message.serverTimeMs ?? null, sentAt);
    }
    markWsConnected();
    return;
  }
  if (message.type === "error") {
    state.debug.lastError = String(message.message || message.code || "onbekende fout");
    if (message.code === "unauthorized") {
      state.wantReconnect = false;
      stopRemoteFrameLoop();
      clearRemotePlayers("unauthorized");
      window.location.href = "/login/?next=%2Fgame%2F";
      return;
    }
    markWsConnected();
    return;
  }
  if (message.type === "connection:ready" || message.type === "player:state") {
    updateFromConnectionSnapshot(message);
    if (message.type === "connection:ready") state.mmoReady.connectionReadyReceived = true;
    if (message.type === "player:state") state.mmoReady.playerStateReceived = true;
    maybeMarkMmoOnlineReady(message.type);
    markWsConnected();
    return;
  }
  if (message.type === "mmo:bootstrap") {
    applyMmoBootstrap(message);
    markWsConnected();
    return;
  }
  if (message.type === "player:input_ignored") {
    state.net.lastIgnoredReason = message.reason || "input_ignored";
    if (typeof message.clientInputSeq === "number") state.net.lastServerClientInputSeq = message.clientInputSeq;
    if (typeof message.controllerEpoch === "number") state.net.lastServerControllerEpoch = message.controllerEpoch;
    if (typeof message.transport === "string") state.net.lastTransport = message.transport;
    if (typeof message.activeControllerSessionId === "string") state.control.activeControllerSessionId = message.activeControllerSessionId;
    if (typeof message.clientInputSeq === "number" && message.clientInputSeq > 0 && message.activeControllerSessionId === state.session?.id) {
      removeAckedInputs(message.clientInputSeq);
    }
    const localStillActive = Boolean(hasMovementInput() || (message.activeControllerSessionId && message.activeControllerSessionId === state.session?.id));
    state.net.localControllerActive = localStillActive;
    state.control.isLocalController = localStillActive;
    if (localStillActive) state.control.passiveSince = 0;
    syncNetDebugState();
    updateHud();
    return;
  }
  if (message.type === "fog:discovery") {
    applyMinimapFogDiscoveryPayload(message, { replace: false });
    markWsConnected();
    return;
  }
  if (message.type === "mmo:snapshot") {
    if (!remoteWorldMatches(message.worldId)) {
      state.remote.droppedStaleUpdates += 1;
      return;
    }
    const previousSnapshotAt = Number(state.remote.lastSnapshotAt || 0) || 0;
    const snapshotSeq = Math.max(0, Math.floor(Number(message.snapshotSeq || 0))) || 0;
    state.remote.worldId = message.worldId || state.remote.worldId || null;
    state.remote.lastPacketAt = packetAt;
    state.remote.lastPacketType = "mmo:snapshot";
    state.remote.lastRemoteEventType = "mmo:snapshot";
    state.remote.normalMovementUsesSnapshot = true;
    state.remote.lastSnapshotAt = packetAt;
    state.remote.lastSnapshotSeq = snapshotSeq || state.remote.lastSnapshotSeq || 0;
    state.remote.lastSnapshotServerTimeMs = Number.isFinite(Number(message.serverTimeMs)) ? num(message.serverTimeMs, 0) : state.remote.lastSnapshotServerTimeMs || 0;
    state.remote.lastSnapshotPlayerIds = [];
    if (previousSnapshotAt > 0) {
      pushSnapshotInterval(Math.max(0, packetAt - previousSnapshotAt));
    }
    const players = Array.isArray(message.players) ? message.players : [];
    for (const player of players) {
      if (!player || typeof player !== "object" || !player.playerId) continue;
      state.remote.lastSnapshotPlayerIds.push(String(player.playerId));
      const playerPacket = Object.assign({}, player, {
        worldId: message.worldId || player.worldId || state.worldId || null,
        snapshotSeq: snapshotSeq || player.snapshotSeq || player.serverSeq || 0,
        serverTick: message.serverTick || player.serverTick || 0,
        serverTimeMs: message.serverTimeMs ?? player.serverTimeMs ?? null,
        serverSentAtMs: message.serverSentAtMs ?? player.serverSentAtMs ?? null,
        serverReceivedAt: packetAt,
        transport: "ws"
      });
      if (state.player && String(player.playerId) === String(state.player.id)) {
        applyAuthoritativeUpdate(playerPacket, { transport: "ws" });
      } else {
        upsertRemotePlayerEntry(playerPacket, { type: "mmo:snapshot" });
      }
    }
    state.remote.remotePlayerIds = Array.from(state.remote.players.keys());
    syncNetDebugState();
    updateHud();
    maybeMarkMmoOnlineReady("mmo_snapshot");
    markWsConnected();
    return;
  }
  if (message.type === "player:state_changed") {
    if (!remoteWorldMatches(message.worldId)) {
      state.remote.droppedStaleUpdates += 1;
      return;
    }
    updateServerPositionFromBroadcast(message);
    markWsConnected();
    return;
  }
  if (message.type === "world:presence_snapshot") {
    applyRemotePresenceSnapshot(message);
    markWsConnected();
    return;
  }
  if (message.type === "remote_player:joined") {
    applyRemotePlayerJoined(message);
    markWsConnected();
    return;
  }
  if (message.type === "remote_player:state_changed") {
    applyRemotePlayerStateChanged(message);
    markWsConnected();
    return;
  }
  if (message.type === "remote_player:left") {
    applyRemotePlayerLeft(message);
    markWsConnected();
    return;
  }
  if (message.type === "player:presence") {
    if (typeof message.activeSessionCount === "number") state.activeSessionCount = message.activeSessionCount;
    if (typeof message.connectedSessionCount === "number") state.connectedSessionCount = message.connectedSessionCount;
    updateHud();
  }
}

async function loadSessionState(options = {}) {
  state.wantReconnect = true;
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  const showLoading = options.showLoading !== false;
  if (showLoading) {
    resetMmoReadiness(options.reason || (options.forceWorld ? "world-change" : "load"));
  }
  const response = await fetch("/api/game/player", { headers: { Accept: "application/json" } });
  if (response.status === 401) {
    clearMmoReadyTimeout();
    window.location.href = "/login/?next=%2Fgame%2F";
    return false;
  }
  if (response.status === 404) {
    if (showLoading) {
      clearMmoReadyTimeout();
      showOverlay("Er is nog geen wereld gepubliceerd. Bouw de wereld in de editor en publiceer opnieuw.");
    } else {
      state.debug.lastError = "Er is nog geen wereld gepubliceerd.";
      updateHud();
    }
    return false;
  }
  if (!response.ok) {
    if (showLoading) {
      clearMmoReadyTimeout();
      showOverlay("Kon de game state niet laden.");
    } else {
      state.debug.lastError = "Kon de game state niet laden.";
      updateHud();
    }
    return false;
  }
  const snapshot = await response.json();
  const nextWorldKey = snapshotWorldKey(snapshot);
  const worldChanged = !state.runtimeWorldKey || state.runtimeWorldKey !== nextWorldKey;
  state.lastPublishedAt = snapshot.worldPublishedAt || snapshot.publishedAt || snapshot.gameWorld?.publishedAt || state.lastPublishedAt;
  primeHttpSnapshotState(snapshot);
  primeConnectedSocketReadiness();
  if (!state.ws || state.ws.readyState === WebSocket.CLOSED || state.ws.readyState === WebSocket.CLOSING) {
    openWebSocket();
  } else if (state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: "player:request_state" }));
  }
  applySnapshotToRuntime(snapshot, { forceWorld: worldChanged, keepPrediction: Boolean(options.keepPrediction) });
  loadNode03State({ silent: true });
  loadNode04State({ silent: true });
  loadNode05State({ silent: true });
  maybeMarkMmoOnlineReady("http_snapshot");
  return true;
}

async function refreshState() {
  try {
    resetMmoDebugRuntimeState();
    await resetPersistedMinimapFogDiscovery();
    await loadSessionState({ forceWorld: false, showLoading: true });
  } catch {
    clearMmoReadyTimeout();
    showOverlay("Kon de server-state niet ophalen.");
  }
}

function applyFallbackPosition(response) {
  const payload = response && typeof response === "object" ? response : { position: response };
  const nextPosition = normalizeIncomingServerPosition(payload, "http");
  if (!nextPosition) return;
  if (response && response.ignored && response.reason) {
    state.net.lastIgnoredReason = response.reason;
    syncNetDebugState();
  }
  const applied = applyAuthoritativeUpdate(nextPosition, { transport: "http" });
  if (response && response.ignored && response.reason) {
    state.net.lastIgnoredReason = response.reason;
    syncNetDebugState();
  }
  if (!applied) {
    updateHud();
    return;
  }
  updateHud();
}

function clearLocalMovementForTeleport() {
  state.ownCorrection = null;
  state.net.pendingInputs = [];
  state.net.postInputPredictionHoldUntil = 0;
  state.input.move_forward = false;
  state.input.move_back = false;
  state.input.move_left = false;
  state.input.move_right = false;
  state.input.sprint = false;
  state.net.localControllerActive = false;
  state.control.isLocalController = false;
  state.control.passiveSince = 0;
  clearPointerTarget(false);
  setMovementAnimationState("idle");
  persistNetState();
  syncNetDebugState();
}

function applyInstantTravelResponse(response) {
  if (!response || !response.position) return false;
  const nextPosition = normalizeIncomingServerPosition({
    position: Object.assign({}, response.position, {
      teleport: true,
      moving: false,
      animationState: "idle",
      velocityX: 0,
      velocityZ: 0
    })
  }, "http-zone-link");
  if (!nextPosition) return false;
  clearLocalMovementForTeleport();
  if (response.gameWorld) {
    applySnapshotToRuntime({
      gameWorld: response.gameWorld,
      gameProject: response.gameWorld.gameProject || state.gameProject,
      position: nextPosition,
      worldPublishedAt: response.gameWorld.publishedAt || state.lastPublishedAt || state.publishedAt,
      publishedAt: response.gameWorld.publishedAt || state.publishedAt
    }, { forceWorld: true, keepPrediction: false });
  } else {
    applyAuthoritativeUpdate(nextPosition, { transport: "http-zone-link", keepPrediction: false });
  }
  state.position = clonePosition(nextPosition);
  state.predictedPosition = clonePosition(nextPosition);
  state.authoritativePosition = clonePosition(nextPosition);
  applyRuntimePosition(nextPosition, { immediate: true, animationState: "idle" });
  refreshGameMinimapHud();
  if (state.minimapHud.elements) state.minimapHud.dirty = true;
  updateHud();
  return true;
}

async function sendInputStateViaHttp(inputStatePayload) {
  if (state.httpFallbackInFlight) return;
  state.httpFallbackInFlight = true;
  try {
    const response = await fetch("/api/game/player/position", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inputStatePayload)
    });
    if (response.status === 401) {
      state.wantReconnect = false;
      window.location.href = "/login/?next=%2Fgame%2F";
      return;
    }
    const result = await response.json().catch(function () { return null; });
    if (!response.ok || !result || result.ok !== true) {
      state.debug.lastError = (result && result.message) || "HTTP input-state fallback mislukt.";
      updateHud();
      return;
    }
    state.debug.lastReceivedType = "player:input_state (http)";
    state.debug.lastReceivedAt = performance.now();
    applyFallbackPosition(result);
  } catch {
    state.debug.lastError = "HTTP input-state fallback mislukt (netwerkfout).";
    updateHud();
  } finally {
    state.httpFallbackInFlight = false;
  }
}

function buildCurrentInputState(options = {}) {
  const override = options.inputOverride && typeof options.inputOverride === "object" ? options.inputOverride : null;
  const stop = options.stop === true || override?.stop === true;
  const currentVector = override && Number.isFinite(Number(override.moveX)) && Number.isFinite(Number(override.moveZ))
    ? { x: num(override.moveX, 0), z: num(override.moveZ, 0) }
    : currentMoveVector();
  const sprint = override && typeof override.sprint === "boolean" ? override.sprint : state.input.sprint === true;
  const pointerTarget = stop
    ? null
    : override && override.pointerTarget !== undefined
      ? normalizePointerTarget(override.pointerTarget)
      : shouldSendPointerTargetToServer()
        ? normalizePointerTarget(state.pointer.target)
        : null;
  return {
    moveX: clamp(currentVector.x, -1, 1),
    moveZ: clamp(currentVector.z, -1, 1),
    sprint: sprint === true,
    pointerTarget: pointerTarget,
    stop: stop || (!hasMovementInput() && options.force !== true)
  };
}

function sendInputState(options = {}) {
  if (!state.session || !isMmoGameplayReady()) return null;
  const nowPerf = performance.now();
  const nowWall = Date.now();
  const seq = Math.max(1, normalizeInputSeq(state.net.nextInputSeq) || 1);
  state.net.nextInputSeq = seq + 1;
  const input = buildCurrentInputState(options);
  const moving = input.stop !== true;
  if (moving && (!state.net.localControllerActive || !state.control.isLocalController)) {
    noteLocalControlStart(false, "send-input");
  }
  const clientSessionId = state.net.clientSessionId || createClientSessionId();
  state.net.clientSessionId = clientSessionId;
  const clientIntentId = buildClientIntentId(clientSessionId, seq);
  const controllerEpoch = normalizeControllerEpoch(state.net.controllerEpoch);
  const sourceDevice = state.session.deviceLabel || deviceLabel();
  state.net.lastSentInputSeq = seq;
  state.net.lastLocalInputAt = nowWall;
  state.net.localControllerActive = moving;
  if (moving) {
    state.control.isLocalController = true;
    state.control.activeControllerSessionId = state.session.id || state.control.activeControllerSessionId;
    state.control.passiveSince = 0;
  }
  state.debug.lastSentType = "player:input_state";
  state.debug.lastSentAt = nowPerf;
  state.debug.lastSentSeq = seq;
  const inputStatePayload = {
    clientSessionId: clientSessionId,
    inputSeq: seq,
    clientSentAt: nowWall,
    controllerEpoch: controllerEpoch,
    clientPredictedPosition: input.stop === true && state.predictedPosition ? {
      x: state.predictedPosition.x,
      y: state.predictedPosition.y,
      z: state.predictedPosition.z,
      rotationY: state.predictedPosition.rotationY
    } : null,
    input: {
      moveX: input.moveX,
      moveZ: input.moveZ,
      sprint: input.sprint === true,
      pointerTarget: input.pointerTarget ? { x: input.pointerTarget.x, z: input.pointerTarget.z } : null,
      stop: input.stop === true
    },
    sourceDevice: sourceDevice
  };
  const queueSentInput = function (sentAt) {
    queuePendingInput({
      seq: seq,
      position: clonePosition(state.predictedPosition || state.position || state.authoritativePosition),
      input: {
        moveX: input.moveX,
        moveZ: input.moveZ,
        sprint: input.sprint === true,
        pointerTarget: input.pointerTarget ? { x: input.pointerTarget.x, z: input.pointerTarget.z } : null,
        stop: input.stop === true
      },
      moving: moving,
      animationState: moving ? (state.input.sprint ? "run" : "walk") : "idle",
      sentAt: sentAt || nowWall,
      controllerEpoch: controllerEpoch,
      clientSessionId: clientSessionId,
      clientIntentId: clientIntentId
    });
  };
  const canSendNow = options.force === true || nowPerf - state.lastSendAt >= mmoNetworkSettings().moveSendIntervalMs;
  if (!canSendNow) {
    state.net.lastTransport = state.net.lastTransport || "queued";
    syncNetDebugState();
    updateHud();
    return inputStatePayload;
  }
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.lastSendAt = nowPerf;
    state.net.lastTransport = "ws";
    queueSentInput(nowWall);
    syncNetDebugState();
    state.ws.send(JSON.stringify({ type: "player:input_state", payload: inputStatePayload }));
    updateHud();
    return inputStatePayload;
  }
  if (shouldUseHttpFallback()) {
    state.lastSendAt = nowPerf;
    state.net.lastTransport = "http";
    queueSentInput(nowWall);
    syncNetDebugState();
    sendInputStateViaHttp(inputStatePayload);
    updateHud();
    return inputStatePayload;
  }
  state.net.lastTransport = "queued";
  syncNetDebugState();
  updateHud();
  return inputStatePayload;
}

function sendMovementIntent(position, options = {}) {
  return sendInputState(options);
}

function setMovementAnimationState(nextState) {
  if (state.lastAnimationState === nextState) return;
  state.lastAnimationState = nextState;
  if (state.runtime && typeof state.runtime.setPlayerAnimationState === "function") {
    state.runtime.setPlayerAnimationState(nextState);
  } else if (state.predictedPosition) {
    applyRuntimePosition(state.predictedPosition, { immediate: true, animationState: nextState });
  }
}

// FIX-5: single choke point that clears every movement input source and notifies the server
// immediately, so nothing (alt-tab, pointer loss, ws drop, logout) can leave movement "stuck".
// Sprint is intentionally left alone here: it tracks the physical Shift key via its own
// keydown/keyup handlers, and this function also fires on routine "stopped moving for a
// moment" transitions (keyup, pointer arrival, a single idle frame between releasing one
// direction key and pressing the opposite one) - resetting sprint there dropped it even
// though Shift was still held. Only the true can't-trust-key-state resets (blur, ws drop,
// logout) opt back in via resetSprint.
function clearMovementInput(reason, options = {}) {
  const sendFinalIntent = shouldSendLocalFinalIntent(reason);
  if (sendFinalIntent && options.resetSprint !== true) startPostInputPredictionHold(reason);
  state.ownCorrection = null;
  state.input.move_forward = false;
  state.input.move_back = false;
  state.input.move_left = false;
  state.input.move_right = false;
  if (options.resetSprint) state.input.sprint = false;
  state.net.localControllerActive = false;
  state.control.passiveSince = 0;
  clearPointerTarget(false);
  setMovementAnimationState("idle");
  if (sendFinalIntent) {
    sendInputState({ force: true, stop: true, reason: reason });
  }
  syncNetDebugState();
  updateHud();
}

function stepMovement(now) {
  if (!isMmoGameplayReady() || !state.runtime || !state.session || !state.predictedPosition) {
    state.lastFrameAt = now;
    return;
  }
  if (!state.lastFrameAt) state.lastFrameAt = now;
  const dt = clamp((now - state.lastFrameAt) / 1000, 0, 0.05);
  state.lastFrameAt = now;
  const netSettings = mmoNetworkSettings();

  if (!hasMovementInput()) {
    if (state.lastAnimationState !== "idle") {
      clearMovementInput("movement-settled");
    }
    return;
  }
  if (!state.control.isLocalController) {
    if (state.pointer.active && !hasKeyboardMovementInput()) {
      clearMovementInput("controller-lost-with-pointer");
    }
    return;
  }

// FIX-10: openstaande servercorrectie geleidelijk toepassen (15% per update).
  // Zo convergeert de prediction onzichtbaar naar de serverpositie zonder
  // ooit te snappen of terug te trekken.
  const stepStartedAt = performance.now();
  try {
  if (state.ownCorrection && state.predictedPosition && netSettings.reconciliationEnabled !== false) {
    const correctionBlend = clamp(1 - Math.pow(1 - netSettings.ownCorrectionBlendRate, dt / 0.05), 0, 1);
    const blendX = state.ownCorrection.x * correctionBlend;
    const blendZ = state.ownCorrection.z * correctionBlend;
    state.predictedPosition.x += blendX;
    state.predictedPosition.z += blendZ;
    state.ownCorrection.x -= blendX;
    state.ownCorrection.z -= blendZ;
    if (Math.hypot(state.ownCorrection.x, state.ownCorrection.z) < 0.01) {
      state.ownCorrection = null;
    }
  } else if (state.ownCorrection && netSettings.reconciliationEnabled === false) {
    state.ownCorrection = null;
  }

  const vector = currentMoveVector();
  const length = Math.hypot(vector.x, vector.z);
  if (length < 0.0001) {
    setMovementAnimationState("idle");
    return;
  }
  const nx = vector.x / length;
  const nz = vector.z / length;
  const speed = currentSpeed();
  const desiredPosition = {
    x: state.predictedPosition.x + nx * speed * dt,
    y: state.predictedPosition.y,
    z: state.predictedPosition.z + nz * speed * dt
  };
  const resolved = state.runtime && typeof state.runtime.resolvePlayerMovementIntent === "function"
    ? state.runtime.resolvePlayerMovementIntent(state.predictedPosition, desiredPosition, { radius: currentCollisionRadius() })
    : desiredPosition;
  const nextPosition = {
    x: resolved.x,
    y: Number.isFinite(resolved.y) ? resolved.y : state.predictedPosition.y,
    z: resolved.z,
    rotationY: Math.atan2(nx, nz) * 180 / Math.PI
  };
  const movedDistance = Math.hypot(nextPosition.x - state.predictedPosition.x, nextPosition.z - state.predictedPosition.z);
  if (state.pointer.active && state.pointer.mode === "click_to_move" && state.pointer.target) {
    const remainingDistance = Math.hypot(state.pointer.target.x - nextPosition.x, state.pointer.target.z - nextPosition.z);
    const previousRemainingDistance = Number.isFinite(Number(state.pointer.lastDistanceToTarget))
      ? Number(state.pointer.lastDistanceToTarget)
      : remainingDistance;
    const madeProgress = movedDistance > CLICK_MOVE_BLOCKED_RADIUS || remainingDistance < previousRemainingDistance - CLICK_MOVE_BLOCKED_RADIUS;
    if (madeProgress) {
      state.pointer.blockedSince = 0;
    } else {
      state.pointer.blockedSince = state.pointer.blockedSince || now;
    }
    state.pointer.lastDistanceToTarget = remainingDistance;
    if (state.pointer.blockedSince && now - state.pointer.blockedSince >= CLICK_MOVE_BLOCKED_TIMEOUT_MS) {
      clearMovementInput("click-target-blocked");
      return;
    }
  }
  if (netSettings.predictionEnabled !== false) {
    state.predictedPosition = clonePosition(nextPosition);
  }
  scheduleMinimapFogDiscovery("movement");
  setMovementAnimationState(state.input.sprint ? "run" : "walk");
  if (netSettings.predictionEnabled !== false) {
    applyRuntimePosition(nextPosition, { immediate: true, animationState: state.lastAnimationState });
  }
  if (state.minimapHud.elements) {
    state.minimapHud.dirty = true;
    drawGameMinimapIfDue(now);
  }
  refreshNode03ClientRanges(now);
  refreshNode04ClientRanges(now);
  refreshNode05ClientRanges(now);
  if (now - state.lastSendAt >= netSettings.moveSendIntervalMs) {
    sendInputState({ force: true });
  }
  } finally {
    recordGameLoopTiming("movementStep", performance.now() - stepStartedAt, now);
  }
}

function setInput(action, pressed) {
  if (!(action in state.input)) return;
  state.input[action] = Boolean(pressed);
}

function bindKeyboardControls() {
  window.addEventListener("keydown", function (event) {
    if (isEditableTarget(event.target)) return;
    const hotbarSlot = node03HotbarSlotIndexForKey(event.code);
    if (hotbarSlot >= 0 && triggerNode03HotbarSlot(hotbarSlot)) {
      event.preventDefault();
      return;
    }
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      event.preventDefault();
      if (!isMmoGameplayReady()) return;
      state.input.sprint = true;
      if (hasMovementInput()) sendInputState({ force: true });
      return;
    }
    const movementKey = event.code === "KeyW" || event.code === "ArrowUp"
      || event.code === "KeyS" || event.code === "ArrowDown"
      || event.code === "KeyA" || event.code === "ArrowLeft"
      || event.code === "KeyD" || event.code === "ArrowRight";
    if (!movementKey) return;
    event.preventDefault();
    if (!isMmoGameplayReady()) return;
    if (!event.repeat && !hasKeyboardMovementInput()) {
      noteLocalControlStart(false, "keyboard");
    }
    if (event.code === "KeyW" || event.code === "ArrowUp") { setInput("move_forward", true); clearPointerTarget(false); }
    if (event.code === "KeyS" || event.code === "ArrowDown") { setInput("move_back", true); clearPointerTarget(false); }
    if (event.code === "KeyA" || event.code === "ArrowLeft") { setInput("move_left", true); clearPointerTarget(false); }
    if (event.code === "KeyD" || event.code === "ArrowRight") { setInput("move_right", true); clearPointerTarget(false); }
    if (hasMovementInput()) {
      sendInputState({ force: true });
    }
  });
  window.addEventListener("keyup", function (event) {
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      state.input.sprint = false;
      if (hasMovementInput()) sendInputState({ force: true });
      return;
    }
    let handled = true;
    if (event.code === "KeyW" || event.code === "ArrowUp") setInput("move_forward", false);
    else if (event.code === "KeyS" || event.code === "ArrowDown") setInput("move_back", false);
    else if (event.code === "KeyA" || event.code === "ArrowLeft") setInput("move_left", false);
    else if (event.code === "KeyD" || event.code === "ArrowRight") setInput("move_right", false);
    else handled = false;
    if (handled && !hasKeyboardMovementInput() && !state.pointer.active) {
      clearMovementInput("keyup");
    } else if (handled) {
      sendInputState({ force: true });
    }
  });
}

function clearPointerTarget(keepTarget = false) {
  state.pointer.active = false;
  state.pointer.pointerId = null;
  state.pointer.mode = "none";
  state.pointer.downX = 0;
  state.pointer.downY = 0;
  state.pointer.screenX = 0;
  state.pointer.screenY = 0;
  state.pointer.downAt = 0;
  state.pointer.blockedSince = 0;
  state.pointer.lastDistanceToTarget = -1;
  state.pointer.moved = false;
  state.pointer.dragged = false;
  state.pointer.lastHoldVector = null;
  if (!keepTarget) state.pointer.target = null;
}

function updatePointerTargetFromEvent(event) {
  state.pointer.screenX = Number(event?.clientX) || 0;
  state.pointer.screenY = Number(event?.clientY) || 0;
  refreshPointerTargetFromScreenPosition(state.pointer.screenX, state.pointer.screenY);
}

function bindPointerControls() {
  if (!canvas) return;
  canvas.addEventListener("pointerdown", function (event) {
    if (event.pointerType !== "touch" && event.button !== 0) return;
    event.preventDefault();
    if (!isMmoGameplayReady()) return;
    // Second finger while the first is already driving movement: hold-to-sprint, the
    // touch equivalent of holding Shift. Mirrors the keyboard sprint handler below rather
    // than restarting click-to-move tracking with this finger's position.
    if (event.pointerType === "touch" && state.pointer.active && event.pointerId !== state.pointer.pointerId) {
      state.pointer.sprintPointerId = event.pointerId;
      state.input.sprint = true;
      if (typeof canvas.setPointerCapture === "function") {
        try { canvas.setPointerCapture(event.pointerId); } catch {}
      }
      if (hasMovementInput()) sendInputState({ force: true });
      return;
    }
    const pickedNode03Target = state.runtime && typeof state.runtime.pickRuntimeTargetAt === "function"
      ? state.runtime.pickRuntimeTargetAt(event.clientX, event.clientY)
      : null;
    if (pickedNode03Target?.instanceId && pickedNode03Target?.action) {
      if (String(pickedNode03Target.action).startsWith("node04:")) {
        runNode04Action(pickedNode03Target.action, pickedNode03Target.instanceId, {
          questId: pickedNode03Target.questId || null,
          dialogueId: pickedNode03Target.dialogueId || null
        });
      } else if (String(pickedNode03Target.action).startsWith("node05:")) {
        runNode05Action(pickedNode03Target.action, {
          targetId: pickedNode03Target.instanceId
        });
      } else {
        selectNode03Target(pickedNode03Target.instanceId);
        runNode03Action(pickedNode03Target.action, pickedNode03Target.instanceId);
      }
      return;
    }
    state.input.move_forward = false;
    state.input.move_back = false;
    state.input.move_left = false;
    state.input.move_right = false;
    state.pointer.active = true;
    state.pointer.pointerId = event.pointerId;
    state.pointer.mode = "click_to_move";
    state.pointer.downX = event.clientX;
    state.pointer.downY = event.clientY;
    state.pointer.screenX = event.clientX;
    state.pointer.screenY = event.clientY;
    state.pointer.downAt = performance.now();
    state.pointer.moved = false;
    state.pointer.dragged = false;
    state.pointer.lastHoldVector = null;
    if (typeof canvas.setPointerCapture === "function") {
      try { canvas.setPointerCapture(event.pointerId); } catch {}
    }
    updatePointerTargetFromEvent(event);
    state.pointer.moved = pointerTargetDistance() > clickMoveSelfRadius();
    if (hasMovementInput()) {
      noteLocalControlStart(true, "pointer");
      sendInputState({ force: true });
    } else {
      clearPointerTarget(false);
    }
  });
  canvas.addEventListener("pointermove", function (event) {
    if (!state.pointer.active || event.pointerId !== state.pointer.pointerId) return;
    event.preventDefault();
    state.pointer.screenX = event.clientX;
    state.pointer.screenY = event.clientY;
    const deltaX = Math.abs(event.clientX - state.pointer.downX);
    const deltaY = Math.abs(event.clientY - state.pointer.downY);
    if (!state.pointer.dragged && (deltaX > POINTER_DRAG_THRESHOLD_PX || deltaY > POINTER_DRAG_THRESHOLD_PX)) {
      state.pointer.dragged = true;
      state.pointer.moved = true;
      state.pointer.mode = "drag_to_move";
    }
    updatePointerTargetFromEvent(event);
  });
  const releasePointer = function (event) {
    if (event && event.pointerId !== undefined && state.pointer.sprintPointerId !== null && event.pointerId === state.pointer.sprintPointerId) {
      event.preventDefault();
      state.pointer.sprintPointerId = null;
      state.input.sprint = false;
      if (hasMovementInput()) sendInputState({ force: true });
      return;
    }
    if (event && event.pointerId !== undefined && state.pointer.pointerId !== null && event.pointerId !== state.pointer.pointerId) return;
    if (event) event.preventDefault();
    const hadKeyboardMovement = hasKeyboardMovementInput();
    const heldMs = state.pointer.downAt ? performance.now() - state.pointer.downAt : Infinity;
    const keepClickMove = state.pointer.mode === "click_to_move" && state.pointer.moved && !state.pointer.dragged && heldMs < POINTER_HOLD_RELEASE_THRESHOLD_MS;
    if (keepClickMove) {
      // Sentinel zodat de opvolgende lostpointercapture van dezelfde klik dit niet nog eens loslaat.
      state.pointer.pointerId = -1;
      state.pointer.downX = 0;
      state.pointer.downY = 0;
      state.pointer.screenX = 0;
      state.pointer.screenY = 0;
      state.pointer.downAt = 0;
      state.pointer.lastHoldVector = null;
      return;
    }
    clearPointerTarget(false);
    if (hadKeyboardMovement) {
      sendInputState({ force: true });
    } else {
      clearMovementInput("pointer-release");
    }
  };
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);
  canvas.addEventListener("lostpointercapture", releasePointer);
}

// FIX-3: tab/blur/visibility recovery. requestAnimationFrame pauses in a background tab, so on
// return we must drop local prediction and resync from the server instead of dead-reckoning
// forward from a stale frame.
function handleInputCancel(reason) {
  if (
    window.__GK_ALLOW_BACKGROUND_MOVEMENT === true &&
    (reason === "window-blur" || reason === "visibility-hidden")
  ) {
    state.lastFrameAt = 0;
    return;
  }
  clearMovementInput(reason, { resetSprint: true });
  state.lastFrameAt = 0;
}

async function silentResync(reason) {
  if (state.sync.inFlight) return;
  const now = performance.now();
  if (now - state.sync.lastSilentSyncAt < 1000) return;
  state.sync.inFlight = true;
  state.sync.lastSilentSyncAt = now;
  try {
    await loadSessionState({
      forceWorld: false,
      showLoading: false,
      keepPrediction: hasMovementInput(),
      silent: true,
      reason: reason
    });
  } catch {
    clearMmoReadyTimeout();
    state.debug.lastError = "Kon de server-state niet stil opnieuw laden.";
    updateHud();
  } finally {
    state.sync.inFlight = false;
  }
}

function handleVisibilityChange() {
  if (document.hidden) {
    handleInputCancel("visibility-hidden");
    return;
  }
  state.lastFrameAt = 0;
  silentResync("visibility-visible");
}

function handleWindowFocus() {
  state.lastFrameAt = 0;
  silentResync("window-focus");
}

function handlePageShow() {
  state.lastFrameAt = 0;
  silentResync("pageshow");
}

async function logout() {
  state.wantReconnect = false;
  if (state.node03.pollTimerId) {
    clearTimeout(state.node03.pollTimerId);
    state.node03.pollTimerId = 0;
  }
  if (state.node04.pollTimerId) {
    clearTimeout(state.node04.pollTimerId);
    state.node04.pollTimerId = 0;
  }
  if (state.node05.pollTimerId) {
    clearTimeout(state.node05.pollTimerId);
    state.node05.pollTimerId = 0;
  }
  stopMovementFrameLoop();
  stopRemoteFrameLoop();
  clearMovementInput("logout", { resetSprint: true });
  closeWebSocket(true);
  clearRemotePlayers("logout");
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Logout blijft veilig: de cookie verdwijnt in de browser zodra de redirect volgt.
  }
  window.location.href = "/login/?next=%2Fgame%2F";
}

async function pollVersion() {
  try {
    const response = await fetch("/api/game/version", { headers: { Accept: "application/json" } });
    if (response.status === 404) {
      if (state.lastPublishedAt !== null) {
        state.lastPublishedAt = null;
        showOverlay("De gepubliceerde wereld is verwijderd.");
      }
      return;
    }
    if (!response.ok) return;
    const data = await response.json();
    if (data.publishedAt && data.publishedAt !== (state.publishedAt || state.lastPublishedAt)) {
      await loadSessionState({
        forceWorld: true,
        showLoading: false,
        keepPrediction: hasMovementInput(),
        silent: true,
        reason: "published-world-refresh"
      });
    }
  } catch {
    // Tijdelijke netwerkfouten worden genegeerd tijdens polling.
  }
}

async function start() {
  stepMovement(performance.now());
  startMovementFrameLoop();
  bindKeyboardControls();
  bindPointerControls();
  window.addEventListener("blur", function () { handleInputCancel("window-blur"); });
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("focus", handleWindowFocus);
  window.addEventListener("pageshow", handlePageShow);
  window.addEventListener("beforeunload", function () { clearMovementInput("beforeunload"); });
  window.addEventListener("pagehide", function () { clearMovementInput("pagehide"); });
  try {
    const loaded = await loadSessionState({ forceWorld: true, showLoading: true });
    if (loaded) startRemoteFrameLoop();
  } catch (error) {
    clearMmoReadyTimeout();
    state.debug.lastError = String(error?.message || error || "Kon de game state niet laden.");
    showOverlay("MMO verbinden mislukt: " + (getMmoReadinessBlocker() || "waiting_for_http_snapshot"));
    updateHud();
  }
  window.setInterval(pollVersion, 2500);
}

start();
