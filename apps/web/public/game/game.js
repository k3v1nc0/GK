import { createGkWorldRuntime } from "../shared/world-runtime.js?v=20260714-mmo11-camera-target-height";
import { normalizeWorldSettingsPreset, worldSettingsPresetValues } from "../shared/node-types.js?v=20260714-mmo11-camera-target-height";
import { shouldApplyServerPosition as shouldApplyServerRevision } from "../shared/revision-guard.js?v=20260708-mmo02-fix3";
import {
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
  minimapImageSourceRect,
  attachMinimapInteractions
} from "../shared/minimap-utils.js?v=20260714-mmo11-camera-target-height";

const canvas = document.querySelector("#gameCanvas");
const hud = document.querySelector("#hud");
const gameRoot = document.querySelector("#gameRoot");
const overlay = document.querySelector("#gameOverlay");
const overlayText = document.querySelector("#overlayText");

// FIX-5 authoritative movement / rubberband prevention. See README/fases/MMO-01-FIX-5-*.md.
const OWN_SMALL_CORRECTION_THRESHOLD = 0.75;
const OWN_HARD_CORRECTION_THRESHOLD = 3.0;
// FIX-10: reconciliation van de eigen speler. Afwijkingen kleiner dan de
// deadzone worden genegeerd; grotere afwijkingen worden als correctievector
// opgeslagen en per movement-tick geleidelijk weggesmeerd i.p.v. gesnapt.
const OWN_PREDICTION_DEADZONE = 0.25;
const OWN_CORRECTION_BLEND_RATE = 0.3;
const REMOTE_HARD_CORRECTION_THRESHOLD = 5.0;
const OWN_RECONCILE_MS = 120;
const REMOTE_RECONCILE_MS = 100;
const REMOTE_TELEPORT_DISTANCE = 5.0;
const REMOTE_INTERPOLATION_BASE_DELAY_MS = 90;
const REMOTE_INTERPOLATION_MIN_DELAY_MS = 60;
const REMOTE_INTERPOLATION_MAX_DELAY_MS = 140;
const REMOTE_INTERPOLATION_BUFFER_LIMIT = 32;
const REMOTE_INTERPOLATION_SAMPLE_TTL_MS = 2000;
const REMOTE_INTERPOLATION_MAX_EXTRAPOLATION_MS = 60;
const WS_STATUS_HYSTERESIS_MS = 800;
const MMO_READY_TIMEOUT_MS = 8000;
const CLIENT_PING_INTERVAL_MS = 2000;
const PING_SAMPLE_WINDOW_SIZE = 20;
const MOVE_SEND_INTERVAL_MS = 33; // Throttle input/network sync to ~30 Hz.
const CLICK_MOVE_START_RADIUS = 0.04;
const CLICK_MOVE_ARRIVAL_RADIUS = 0.06;
const POINTER_HOLD_RELEASE_THRESHOLD_MS = 180;
const POINTER_DRAG_THRESHOLD_PX = 6;
const CLIENT_NET_STORAGE_KEY = "gk:mmo01:movement-net";
const ANIMATION_STATES = new Set(["idle", "walk", "run"]);

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
    moved: false,
    dragged: false
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
  state.mmoReady.timeoutAt = performance.now() + MMO_READY_TIMEOUT_MS;
  state.mmoReady.timeoutId = window.setTimeout(function () {
    if (state.mmoReady.onlineReady) return;
    const blocker = getMmoReadinessBlocker();
    state.mmoReady.lastBlocker = blocker;
    state.mmoReady.lastErrorAt = performance.now();
    state.debug.lastError = "MMO readiness timeout: " + blocker;
    showOverlay("MMO verbinden mislukt: " + blocker);
    updateHud();
  }, MMO_READY_TIMEOUT_MS);
}

function getMmoReadinessBlocker() {
  if (!state.mmoReady.httpSnapshotLoaded) return "waiting_for_http_snapshot";
  if (!state.mmoReady.runtimeReady) return "waiting_for_runtime";
  if (!state.mmoReady.socketOpen || state.wsStateVisible !== "connected") return "waiting_for_socket";
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
  const prefix = elapsed >= MMO_READY_TIMEOUT_MS ? "MMO verbinden mislukt: " : "MMO verbinden... ";
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
    const extraMs = clamp(renderTimelineMs - lastTimeline, 0, REMOTE_INTERPOLATION_MAX_EXTRAPOLATION_MS);
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
  const renderDelay = clamp(Number(state.remote.interpolationDelayMs) || REMOTE_INTERPOLATION_BASE_DELAY_MS, REMOTE_INTERPOLATION_MIN_DELAY_MS, REMOTE_INTERPOLATION_MAX_DELAY_MS);
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
  const pingStats = summarizePingSamples(state.netPing.samples);
  const jitter = Number.isFinite(pingStats.jitterMs) ? pingStats.jitterMs : 0;
  const targetDelay = clamp(REMOTE_INTERPOLATION_BASE_DELAY_MS + (jitter * 2), REMOTE_INTERPOLATION_MIN_DELAY_MS, REMOTE_INTERPOLATION_MAX_DELAY_MS);
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
      scheduleWsVisibleStatus(state.wsConnectedOnce ? "reconnecting" : "connecting", state.wsConnectedOnce ? "reconnecting" : "connecting", options.delayMs || WS_STATUS_HYSTERESIS_MS, options.attemptId || state.wsConnectionAttemptId);
    }
    updateHud();
    return;
  }
  if (nextKind === "connecting") {
    if (state.wsConnectedOnce && options.immediate !== true) {
      scheduleWsVisibleStatus("reconnecting", "reconnecting", options.delayMs || WS_STATUS_HYSTERESIS_MS, options.attemptId || state.wsConnectionAttemptId);
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
      scheduleWsVisibleStatus("reconnecting", nextText, options.delayMs || WS_STATUS_HYSTERESIS_MS, options.attemptId || state.wsConnectionAttemptId);
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
  }, CLIENT_PING_INTERVAL_MS);
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
  const shouldKeepPrediction = options.keepPrediction === true && localInputActive;

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
    const referencePosition = ackedPendingEntry && ackedPendingEntry.position
      ? ackedPendingEntry.position
      : previousPosition;
    if (clientInputSeq > 0 && isLocalControllerSnapshot) removeAckedInputs(clientInputSeq);
    state.authoritativePosition = clonePosition(nextPosition);
    state.position = clonePosition(nextPosition);
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

    if (shouldKeepPrediction) {
      state.net.lastIgnoredReason = "silent_resync_kept_prediction";
      syncNetDebugState();
      return nextPosition;
    }

    const animationState = incomingAnimationState || deriveRemoteAnimationState(nextPosition, distance);
    const predictionError = referencePosition
      ? Math.hypot(referencePosition.x - nextPosition.x, referencePosition.z - nextPosition.z)
      : distance;

    if (nextPosition.teleport === true || predictionError > OWN_HARD_CORRECTION_THRESHOLD) {
      // Echte teleport of grote desync: dit is de enige plek waar we snappen.
      state.ownCorrection = null;
      state.lastAnimationState = animationState;
      state.predictedPosition = clonePosition(nextPosition);
      applyRuntimePosition(nextPosition, { immediate: true, animationState: animationState });
    } else if (localInputActive) {
      // FIX-10: tijdens actief bewegen raken we predictedPosition en de
      // runtime NOOIT direct aan. Een afwijking boven de deadzone wordt als
      // correctievector opgeslagen en in stepMovement per tick weggesmeerd.
      if (predictionError > OWN_PREDICTION_DEADZONE) {
        state.ownCorrection = {
          x: nextPosition.x - referencePosition.x,
          z: nextPosition.z - referencePosition.z
        };
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
      if (distance <= OWN_PREDICTION_DEADZONE) {
        // Positie laten staan; de animatie is hierboven al gesynct.
      } else if (distance > OWN_SMALL_CORRECTION_THRESHOLD) {
        state.predictedPosition = clonePosition(nextPosition);
        applyRuntimePosition(nextPosition, { immediate: false, reconcile: true, reconcileDurationMs: OWN_RECONCILE_MS, animationState: animationState });
      } else {
        state.predictedPosition = clonePosition(nextPosition);
        applyRuntimePosition(nextPosition, { immediate: true, animationState: animationState });
      }
    }
    syncNetDebugState();
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
    anchor: "top-left",
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
      lastRemoteEventType: true
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
    anchor: config.anchor,
    compact: config.compact !== false,
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
  const root = document.createElement("section");
  root.className = "status-panel anchor-" + (config.anchor || "top-left") + (config.compact === false ? "" : " status-panel--compact");
  root.dataset.hudId = config.id || "mmo_debug_hud";

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
  const editorLink = document.createElement("a");
  editorLink.className = "primary-link";
  editorLink.href = "/editor/";
  editorLink.textContent = "Editor";
  actions.append(refreshButton, logoutButton, editorLink);
  body.appendChild(actions);

  const hint = document.createElement("p");
  hint.className = "movement-hint";
  hint.textContent = "WASD/pijltjes of klik/touch op de grond om te lopen.";
  body.appendChild(hint);

  root.appendChild(body);
  toggle.addEventListener("click", function () {
    setMmoDebugExpanded(Boolean(body.hidden));
  });

  return elements;
}

function removeMmoDebugHud() {
  if (state.debugHud.elements && state.debugHud.elements.root) {
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
  gameRoot.appendChild(elements.root);
  state.debugHud.elements = elements;
  state.debugHud.signature = signature;
  const expanded = wasExpanded !== null ? wasExpanded : (isMmoDebugForced() || config.startCollapsed === false);
  setMmoDebugExpanded(expanded);
  commitWsVisibleStatus(state.wsStateVisible || state.wsState || "disconnected", state.wsStateVisibleText || state.wsStateVisible || state.wsState || "disconnected");
  updateHud();
}

function resolveGameMinimapConfig() {
  const config = state.gameWorld?.minimap?.game;
  return config && config.enabled !== false ? config : null;
}

function resolveGameMinimapBake(config) {
  if (!config) return null;
  const bakes = Array.isArray(state.gameWorld?.minimap?.bakes) ? state.gameWorld.minimap.bakes : [];
  return bakes.find(function (bake) { return bake.minimapId === config.sourceMinimapId; }) || null;
}

function computeGameMinimapSignature(config, bake) {
  return JSON.stringify({
    hudId: config.hudId,
    anchor: config.anchor,
    sizePx: config.sizePx,
    marginPx: config.marginPx,
    borderRadiusPx: config.borderRadiusPx,
    backgroundOpacity: config.backgroundOpacity,
    zIndex: config.zIndex,
    bakedImageUrl: bake ? bake.bakedImageUrl : null,
    bounds: bake ? bake.bounds : null
  });
}

function removeGameMinimapHud() {
  if (state.minimapHud.refreshTimerId) {
    window.clearTimeout(state.minimapHud.refreshTimerId);
    state.minimapHud.refreshTimerId = 0;
  }
  if (state.minimapHud.interactions) {
    state.minimapHud.interactions.destroy();
    state.minimapHud.interactions = null;
  }
  if (state.minimapHud.elements && state.minimapHud.elements.root) {
    state.minimapHud.elements.root.remove();
  }
  state.minimapHud.elements = null;
  state.minimapHud.signature = null;
  state.minimapHud.image = null;
  state.minimapHud.lastDrawKey = null;
  state.minimapHud.lastDrawDurationMs = 0;
  state.minimapHud.drawDurationEmaMs = 0;
  state.minimapHud.performanceMode = null;
  state.minimapHud.performanceModeUntil = 0;
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
    ? 500
    : performanceMode === "lite"
      ? 250
      : 120;
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
  const liteMode = performanceMode !== "full";
  const positionQuantum = performanceMode === "ultra" ? 6 : liteMode ? 2 : 0.1;
  const viewQuantum = performanceMode === "ultra" ? 6 : liteMode ? 2 : 0.1;
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
  return [
    liteMode ? "lite" : "debug",
    bake?.bakedImageUrl || "",
    bake?.bakedImageWidth || 0,
    bake?.bakedImageHeight || 0,
    viewKey,
    localKey,
    remoteKey
  ].join("|");
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
    hudState.view = bake?.bounds ? clampMinimapView(nextView, bake.bounds) : nextView;
  }
  hudState.userOverride = false;
  hudState.dirty = true;
  drawGameMinimapIfDue(performance.now());
}

function buildGameMinimapDom(config, bake) {
  const size = Math.max(64, Number(config.sizePx) || 180);
  const root = document.createElement("section");
  root.className = "gameMinimapRoot anchor-" + (config.anchor || "top-right");
  root.dataset.hudId = config.hudId || "game_minimap";
  root.style.width = size + "px";
  root.style.height = size + "px";
  root.style.margin = Math.max(0, Number(config.marginPx) || 12) + "px";
  root.style.borderRadius = Math.max(0, Number(config.borderRadiusPx) || 14) + "px";
  root.style.zIndex = String(Math.max(0, Number(config.zIndex) || 20));
  const canvas = document.createElement("canvas");
  canvas.className = "gameMinimapCanvas";
  root.appendChild(canvas);
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
  const elements = { root: root, canvas: canvas, ctx: canvas.getContext("2d"), recenterBtn: recenterBtn };
  let image = null;
  if (bake && bake.bakedImageUrl) {
    image = new Image();
    image.addEventListener("load", function () { state.minimapHud.dirty = true; });
    image.src = bake.bakedImageUrl;
  }
  state.minimapHud.image = image;
  state.minimapHud.interactions = attachMinimapInteractions(canvas, {
    getView: function () { return state.minimapHud.view; },
    setView: function (view) {
      state.minimapHud.view = view;
      state.minimapHud.userOverride = true;
      state.minimapHud.dirty = true;
    },
    getGroundBounds: function () {
      const liveConfig = resolveGameMinimapConfig();
      return liveConfig ? (resolveGameMinimapBake(liveConfig)?.bounds || null) : null;
    },
    getCanvasSize: function () { return Math.max(64, Number(resolveGameMinimapConfig()?.sizePx) || 180); },
    getMinDistance: function () { return resolveGameMinimapConfig()?.minDistance || 20; },
    getMaxDistance: function () { return resolveGameMinimapConfig()?.maxDistance || 1000; },
    allowZoom: function () { return resolveGameMinimapConfig()?.allowZoom !== false; },
    allowPan: function () { return resolveGameMinimapConfig()?.allowPan !== false; },
    allowPinchZoom: function () { return resolveGameMinimapConfig()?.allowPinchZoom !== false; },
    onClick: function (worldX, worldZ) {
      const clickConfig = resolveGameMinimapConfig();
      if (!clickConfig || clickConfig.clickToMove === false || !isMmoGameplayReady()) return;
      const clickBounds = resolveGameMinimapBake(clickConfig)?.bounds || null;
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
  hud.appendChild(elements.root);
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

function drawGameMinimap(config, bake, view, performanceMode) {
  const elements = state.minimapHud.elements;
  if (!elements) return;
  const liteMode = performanceMode !== "full";
  const ultraLiteMode = performanceMode === "ultra";
  const size = Math.max(64, Number(config.sizePx) || 180);
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
  const bounds = bake?.bounds || null;
  if (!bounds) {
    ctx.globalAlpha = 1;
    return;
  }
  const activeView = view || ensureGameMinimapView(config, bounds);
  const image = state.minimapHud.image;
  if (image && image.complete && image.naturalWidth) {
    const rect = minimapImageSourceRect(bounds, activeView, bake.bakedImageWidth || image.naturalWidth, bake.bakedImageHeight || image.naturalHeight);
    if (rect) ctx.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, size, size);
  }
  ctx.globalAlpha = 1;
  const viewBounds = minimapViewBounds(activeView);
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
      if (performanceMode === "full" && config.showRemotePlayerNames !== false) {
        const fontSize = Math.max(6, Number(config.fontSizePx) || 10);
        const nameMaxLength = Math.max(3, Number(config.nameMaxLength) || 14);
        drawMarkerLabel(ctx, entry.displayName || entry.playerId, point.x, point.y, fontSize, nameMaxLength);
      }
    }
  }
  if (liteMode) return;

  if (config.showNpcEntities !== false && Array.isArray(state.gameWorld?.entities)) {
    for (const entity of state.gameWorld.entities) {
      const position = entity?.transform?.position;
      if (!position) continue;
      const point = resolveMinimapPoint(position.x, position.z, viewBounds, size, size, clampOutside);
      if (!point) continue;
      drawDiamondMarker(ctx, point.x, point.y, iconSize, { fill: "#d59bff", stroke: "rgba(0,0,0,0.6)" });
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
  if (!hudState.dirty && now - hudState.lastDrawAt < intervalMs) {
    return;
  }
  const bake = resolveGameMinimapBake(config);
  const bounds = bake?.bounds || null;
  const view = bounds ? ensureGameMinimapView(config, bounds) : null;
  const drawKey = performanceMode === "full" ? null : buildGameMinimapDrawKey(bake, view, performanceMode);
  if (!hudState.dirty && performanceMode !== "full" && hudState.lastDrawKey === drawKey) {
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
  if (els.hudLastSentSeq) els.hudLastSentSeq.textContent = state.net.lastSentInputSeq ? String(state.net.lastSentInputSeq) : "-";
  if (els.hudLastAckedSeq) els.hudLastAckedSeq.textContent = state.net.lastAckedInputSeq ? String(state.net.lastAckedInputSeq) : "-";
  if (els.hudPendingInputs) els.hudPendingInputs.textContent = String(state.net.pendingInputs.length || 0);
  if (els.hudController) {
    const controllerSession = state.control.activeControllerSessionId || state.net.lastRemoteControllerSessionId || "-";
    const controllerLabel = state.control.isLocalController ? "local" : "passive";
    els.hudController.textContent = controllerLabel + " · " + String(controllerSession || "-").slice(0, 8);
  }
  if (els.hudLastTransport) els.hudLastTransport.textContent = state.net.lastTransport || "-";
  if (els.hudLastIgnored) els.hudLastIgnored.textContent = state.net.lastIgnoredReason || "-";
  if (els.hudServerSeq) els.hudServerSeq.textContent = state.net.lastServerSeq ? String(state.net.lastServerSeq) : "-";
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
  state.pointer.moved = true;
  state.pointer.dragged = false;
  state.pointer.lastHoldVector = null;
  state.pointer.target = { x: Number(worldX) || 0, z: Number(worldZ) || 0 };
  if (pointerTargetDistance() <= CLICK_MOVE_START_RADIUS) {
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
      if (length <= CLICK_MOVE_ARRIVAL_RADIUS) {
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
    const nextWorldKey = String(snapshot.worldPublishedAt || state.worldId || "");
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
  clearMovementInput("ws-close");
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
    delayMs: WS_STATUS_HYSTERESIS_MS
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
  const nextWorldKey = String(snapshot.worldPublishedAt || snapshot.worldId || "");
  const worldChanged = !state.runtimeWorldKey || state.runtimeWorldKey !== nextWorldKey;
  state.lastPublishedAt = snapshot.worldPublishedAt || state.lastPublishedAt;
  primeHttpSnapshotState(snapshot);
  primeConnectedSocketReadiness();
  if (!state.ws || state.ws.readyState === WebSocket.CLOSED || state.ws.readyState === WebSocket.CLOSING) {
    openWebSocket();
  } else if (state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: "player:request_state" }));
  }
  applySnapshotToRuntime(snapshot, { forceWorld: worldChanged, keepPrediction: Boolean(options.keepPrediction) });
  maybeMarkMmoOnlineReady("http_snapshot");
  return true;
}

async function refreshState() {
  try {
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
      : state.pointer.target
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
    sentAt: nowWall,
    controllerEpoch: controllerEpoch,
    clientSessionId: clientSessionId,
    clientIntentId: clientIntentId
  });
  syncNetDebugState();
  const inputStatePayload = {
    clientSessionId: clientSessionId,
    inputSeq: seq,
    clientSentAt: nowWall,
    controllerEpoch: controllerEpoch,
    input: {
      moveX: input.moveX,
      moveZ: input.moveZ,
      sprint: input.sprint === true,
      pointerTarget: input.pointerTarget ? { x: input.pointerTarget.x, z: input.pointerTarget.z } : null,
      stop: input.stop === true
    },
    sourceDevice: sourceDevice
  };
  const canSendNow = options.force === true || nowPerf - state.lastSendAt >= MOVE_SEND_INTERVAL_MS;
  if (!canSendNow) {
    state.net.lastTransport = state.net.lastTransport || "queued";
    syncNetDebugState();
    updateHud();
    return inputStatePayload;
  }
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.lastSendAt = nowPerf;
    state.net.lastTransport = "ws";
    syncNetDebugState();
    state.ws.send(JSON.stringify({ type: "player:input_state", payload: inputStatePayload }));
    updateHud();
    return inputStatePayload;
  }
  if (shouldUseHttpFallback()) {
    state.lastSendAt = nowPerf;
    state.net.lastTransport = "http";
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
function clearMovementInput(reason) {
  state.ownCorrection = null;
  state.input.move_forward = false;
  state.input.move_back = false;
  state.input.move_left = false;
  state.input.move_right = false;
  state.input.sprint = false;
  state.net.localControllerActive = false;
  state.control.passiveSince = 0;
  clearPointerTarget(false);
  setMovementAnimationState("idle");
  if (shouldSendLocalFinalIntent(reason)) {
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

  if (!hasMovementInput()) {
    if (state.lastAnimationState !== "idle") {
      clearMovementInput("movement-settled");
    }
    return;
  }
  if (!state.control.isLocalController) {
    return;
  }

// FIX-10: openstaande servercorrectie geleidelijk toepassen (15% per update).
  // Zo convergeert de prediction onzichtbaar naar de serverpositie zonder
  // ooit te snappen of terug te trekken.
  const stepStartedAt = performance.now();
  try {
  if (state.ownCorrection && state.predictedPosition) {
    const correctionBlend = clamp(1 - Math.pow(1 - OWN_CORRECTION_BLEND_RATE, dt / 0.05), 0, 1);
    const blendX = state.ownCorrection.x * correctionBlend;
    const blendZ = state.ownCorrection.z * correctionBlend;
    state.predictedPosition.x += blendX;
    state.predictedPosition.z += blendZ;
    state.ownCorrection.x -= blendX;
    state.ownCorrection.z -= blendZ;
    if (Math.hypot(state.ownCorrection.x, state.ownCorrection.z) < 0.01) {
      state.ownCorrection = null;
    }
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
  state.predictedPosition = clonePosition(nextPosition);
  setMovementAnimationState(state.input.sprint ? "run" : "walk");
  applyRuntimePosition(nextPosition, { immediate: true, animationState: state.lastAnimationState });
  if (now - state.lastSendAt >= MOVE_SEND_INTERVAL_MS) {
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
    noteLocalControlStart(true, "pointer");
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
    state.pointer.moved = pointerTargetDistance() > CLICK_MOVE_START_RADIUS;
    if (hasMovementInput()) {
      sendInputState({ force: true });
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
  clearMovementInput(reason);
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
  stopMovementFrameLoop();
  stopRemoteFrameLoop();
  clearMovementInput("logout");
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
    if (data.publishedAt && data.publishedAt !== state.lastPublishedAt) {
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
