import crypto from "node:crypto";
import { buildWalkabilityIndex, resolveMovement } from "../../apps/web/public/shared/world-runtime.js";

const HEARTBEAT_INTERVAL_MS = Math.max(1000, Number(process.env.GAME_WS_HEARTBEAT_INTERVAL_MS || 15000));
const HEARTBEAT_TIMEOUT_MS = Math.max(5000, Number(process.env.GAME_WS_HEARTBEAT_TIMEOUT_MS || 30000));
const PERSIST_DEBOUNCE_MS = Math.max(250, Number(process.env.GAME_POSITION_PERSIST_DEBOUNCE_MS || 750));
// FIX: terwijl een speler beweegt werd de debounce-timer elke tick gereset,
// waardoor er soms minutenlang niets werd weggeschreven. Deze cap forceert
// periodiek een write zonder de event loop per tick te belasten.
const PERSIST_MAX_INTERVAL_MS = Math.max(1000, Number(process.env.GAME_POSITION_PERSIST_MAX_INTERVAL_MS || 5000));
const RATE_LIMIT_PER_SECOND = Math.max(1, Number(process.env.GAME_WS_RATE_LIMIT_PER_SECOND || 120));
const WORLD_TICK_HZ = Math.max(1, Number(process.env.GAME_WORLD_TICK_HZ || 50));
const WORLD_TICK_MS = Math.max(10, Math.round(1000 / WORLD_TICK_HZ));
// FIX: input blijft geldig zolang de verbinding van de speler leeft.
// 0 = geen time-out (aanbevolen; closeConnection stopt beweging al bij disconnect).
// > 0 = extra vangnet: stop toch na zoveel ms zonder nieuw input-bericht.
const INPUT_HOLD_MS = Math.max(0, Number(process.env.GAME_INPUT_HOLD_MS || 0));
// FIX: recordEvent deed een synchrone INSERT per input-bericht (20-60x/sec per
// speler) en blokkeerde daarmee de event loop steeds zwaarder. Nu gethrottled.
const EVENT_LOG_THROTTLE_MS = Math.max(0, Number(process.env.GAME_EVENT_LOG_THROTTLE_MS || 10000));
const ANIMATION_STATES = new Set(["idle", "walk", "run"]);
const PROTOCOL_VERSION = 3;

function normalizeAnimationState(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ANIMATION_STATES.has(normalized) ? normalized : null;
}

function now() {
  return new Date().toISOString();
}

function nowMs() {
  return Date.now();
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeInputSeq(value) {
  const seq = Math.floor(Number(value));
  return Number.isFinite(seq) && seq >= 1 ? seq : 0;
}

function normalizeControllerEpoch(value) {
  const epoch = Math.floor(Number(value));
  return Number.isFinite(epoch) && epoch >= 0 ? epoch : 0;
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

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function send(ws, payload) {
  if (!ws || ws.readyState !== 1) return false;
  ws.send(JSON.stringify(payload));
  return true;
}

// FIX: variant die een vooraf geserialiseerde string verstuurt, zodat
// broadcasts niet per verbinding opnieuw JSON.stringify hoeven te doen.
function sendText(ws, text) {
  if (!ws || ws.readyState !== 1) return false;
  ws.send(text);
  return true;
}

function closeSocket(ws, code, reason) {
  if (!ws || ws.readyState === 3) return;
  try {
    ws.close(code, reason);
  } catch {
    try {
      ws.terminate();
    } catch {}
  }
}

function worldIdFor(world) {
  return String(world?.world?.id || world?.world?.worldId || "main_world").trim() || "main_world";
}

function worldGroundY(world) {
  return num(world?.ground?.y, 0);
}

function spawnFromWorld(world) {
  const hasSpawn = world && world.spawn && Number.isFinite(Number(world.spawn.x)) && Number.isFinite(Number(world.spawn.z));
  const groundY = worldGroundY(world);
  return {
    x: hasSpawn ? num(world.spawn.x, 0) : 0,
    y: groundY,
    z: hasSpawn ? num(world.spawn.z, 0) : 0,
    rotationY: hasSpawn ? num(world.spawn.facing, 0) : 0,
    source: hasSpawn ? "published_spawn" : "fallback_default"
  };
}

function positionKey(playerId, worldId) {
  return playerId + "::" + worldId;
}

function publicSession(session) {
  if (!session) return null;
  return {
    id: session.id,
    deviceLabel: session.device_label || null,
    createdAt: session.created_at,
    expiresAt: session.expires_at,
    lastSeenAt: session.last_seen_at || session.created_at
  };
}

function publicPlayer(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    userId: profile.user_id,
    displayName: profile.display_name,
    selectedCharacterId: profile.selected_character_id || null,
    currentWorldId: profile.current_world_id,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at
  };
}

function publicRemotePlayerSnapshot(profile, position, connectedSessionCount, worldId) {
  if (!profile || !position) return null;
  return {
    playerId: profile.id,
    userId: profile.user_id,
    displayName: profile.display_name,
    selectedCharacterId: profile.selected_character_id || null,
    position: {
      x: round(position.x),
      y: round(position.y),
      z: round(position.z),
      rotationY: round(position.rotation_y)
    },
    revision: Number(position.revision) || 0,
    updatedAt: position.updated_at,
    animationState: normalizeAnimationState(position.animation_state) || "idle",
    moving: position.moving === true,
    connectedSessionCount: Number(connectedSessionCount) || 0,
    isSelfAccount: false,
    worldId: worldId || position.world_id || null,
    serverReceivedAt: position.server_received_at || position.serverReceivedAt || null,
    serverSentAtMs: position.server_sent_at_ms || position.serverSentAtMs || null,
    serverTimeMs: position.server_time_ms || position.serverTimeMs || null,
    serverSeq: Number(position.server_seq || position.serverSeq || 0) || 0,
    clientSentAt: position.client_sent_at || position.clientSentAt || null,
    lastProcessedInputSeq: Number(position.last_processed_input_seq || position.lastProcessedInputSeq || position.client_input_seq || position.clientInputSeq || 0) || 0,
    activeControllerSessionId: position.active_controller_session_id || position.activeControllerSessionId || null,
    controllerEpoch: Number(position.controller_epoch || position.controllerEpoch || 0) || 0,
    teleport: position.teleport === true
  };
}

function publicRemotePlayerJoined(profile, position, connectedSessionCount, worldId) {
  const snapshot = publicRemotePlayerSnapshot(profile, position, connectedSessionCount, worldId);
  if (!snapshot) return null;
  return snapshot;
}

function publicRemotePlayerLeft(profile, worldId) {
  if (!profile) return null;
  return {
    playerId: profile.id,
    userId: profile.user_id,
    worldId: worldId || profile.current_world_id || null,
    connectedSessionCount: 0,
    isSelfAccount: false
  };
}

function publicPosition(position, session, worldId) {
  if (!position) return null;
  const sourceDevice = session?.device_label || null;
  return {
    playerId: position.player_id,
    worldId: position.world_id || worldId,
    x: round(position.x),
    y: round(position.y),
    z: round(position.z),
    rotationY: round(position.rotation_y),
    revision: Number(position.revision) || 0,
    updatedAt: position.updated_at,
    sourceSessionId: position.last_update_source_session_id || null,
    lastUpdateSourceSessionId: position.last_update_source_session_id || null,
    sourceDevice: sourceDevice,
    animationState: normalizeAnimationState(position.animation_state) || "idle",
    moving: position.moving === true,
    lastProcessedInputSeq: Number(position.last_processed_input_seq || position.client_input_seq || 0) || 0,
    activeControllerSessionId: position.active_controller_session_id || null,
    controllerEpoch: Number(position.controller_epoch || 0) || 0,
    velocityX: round(position.velocity_x || 0),
    velocityZ: round(position.velocity_z || 0),
    teleport: position.teleport === true
  };
}

function publicRemoteStateChange(position, session, worldId, sourceDeviceOverride = null) {
  const sourceDevice = sourceDeviceOverride || session?.device_label || null;
  return {
    playerId: position.player_id,
    userId: session?.user_id || null,
    worldId: position.world_id || worldId,
    position: {
      x: round(position.x),
      y: round(position.y),
      z: round(position.z),
      rotationY: round(position.rotation_y)
    },
    revision: Number(position.revision) || 0,
    updatedAt: position.updated_at,
    animationState: normalizeAnimationState(position.animation_state) || "idle",
    moving: position.moving === true,
    sourceSessionId: position.last_update_source_session_id || null,
    sourceDevice: sourceDevice,
    clientSentAt: position.client_sent_at || position.clientSentAt || null,
    serverReceivedAt: position.server_received_at || position.serverReceivedAt || null,
    serverSentAtMs: position.server_sent_at_ms || position.serverSentAtMs || null,
    serverTimeMs: position.server_time_ms || position.serverTimeMs || null,
    serverSeq: Number(position.server_seq || position.serverSeq || 0) || 0,
    lastProcessedInputSeq: Number(position.last_processed_input_seq || position.client_input_seq || 0) || 0,
    activeControllerSessionId: position.active_controller_session_id || null,
    controllerEpoch: Number(position.controller_epoch || 0) || 0,
    teleport: position.teleport === true
  };
}

function extractInputState(payload) {
  const raw = payload && typeof payload === "object" ? payload : {};
  const clientSessionIdRaw = raw.clientSessionId || raw.client_session_id || null;
  const clientSentAtRaw = raw.clientSentAt ?? raw.client_sent_at ?? null;
  const controllerEpochRaw = raw.controllerEpoch ?? raw.controller_epoch ?? null;
  const inputRaw = raw.input && typeof raw.input === "object" ? raw.input : raw;
  const clientSessionId = typeof clientSessionIdRaw === "string" && clientSessionIdRaw.trim()
    ? clientSessionIdRaw.trim().slice(0, 128)
    : null;
  const inputSeqRaw = raw.inputSeq ?? raw.input_seq ?? raw.clientInputSeq ?? raw.client_input_seq ?? null;
  const inputSeq = Number.isInteger(Number(inputSeqRaw)) && Number(inputSeqRaw) >= 1
    ? Math.floor(Number(inputSeqRaw))
    : 0;
  const clientSentAt = Number.isFinite(Number(clientSentAtRaw)) ? num(clientSentAtRaw, 0) : null;
  const controllerEpoch = Number.isInteger(Number(controllerEpochRaw)) && Number(controllerEpochRaw) >= 0
    ? Math.floor(Number(controllerEpochRaw))
    : 0;
  const moveX = clamp(num(inputRaw.moveX ?? inputRaw.move_x ?? 0, 0), -1, 1);
  const moveZ = clamp(num(inputRaw.moveZ ?? inputRaw.move_z ?? 0, 0), -1, 1);
  const pointerTarget = normalizePointerTarget(inputRaw.pointerTarget ?? inputRaw.pointer_target ?? null);
  const sprint = inputRaw.sprint === true || inputRaw.run === true;
  const stop = inputRaw.stop === true;
  return {
    input: {
      moveX: moveX,
      moveZ: moveZ,
      sprint: sprint,
      pointerTarget: pointerTarget,
      stop: stop
    },
    sourceDevice: typeof raw.sourceDevice === "string" && raw.sourceDevice.trim() ? raw.sourceDevice.trim().slice(0, 120) : null,
    teleport: raw.teleport === true,
    clientSessionId: clientSessionId,
    inputSeq: inputSeq,
    clientSentAt: clientSentAt,
    controllerEpoch: controllerEpoch
  };
}

function buildClientIntentId(clientSessionId, clientInputSeq) {
  return String(clientSessionId || "client") + ":" + String(Math.max(1, Number(clientInputSeq) || 1));
}

function eventMessage(type, payload = {}, meta = {}) {
  return Object.assign({ type: type }, payload, meta);
}

export class MmoService {
  constructor(db, authService, repository) {
    this.db = db;
    this.authService = authService;
    this.repository = repository;
    this.wss = null;
    this.worldCache = null;
    this.connectionsById = new Map();
    this.connectionsBySessionId = new Map();
    this.connectionsByUserId = new Map();
    this.connectionsByWorldId = new Map();
    this.connectionsByPlayerId = new Map();
    this.connectedSessionIdsByUserId = new Map();
    this.playerStateCache = new Map();
    this.playerIdsByWorldId = new Map();
    this.primaryPresenceByPlayerId = new Map();
    this.persistTimers = new Map();
    this.lastPersistAtMsByKey = new Map();
    this.latestInputByPlayerId = new Map();
    this.dirtyPlayerIdsByWorldId = new Map();
    this.lastInputSeqByClientSessionId = new Map();
    this.lastControllerEpochByClientSessionId = new Map();
    this.lastControllerByUserId = new Map();
    this.lastWorldBuildAt = 0;
    this.connectionSeq = 0;
    this.pendingRemoteBroadcastByPlayerId = new Map();
    this.remoteBroadcastTimer = null;
    this.remoteBroadcastFlushMs = WORLD_TICK_MS;
    this.serverTick = 0;
    this.snapshotSeq = 0;
    this.worldTickTimer = null;
    this.worldTickNextAtMs = nowMs() + WORLD_TICK_MS;
    this.startWorldTickLoop();
    this.serverSeq = 0;
    this.heartbeatTimer = setInterval(() => this.tickHeartbeats(), HEARTBEAT_INTERVAL_MS);
    if (typeof this.heartbeatTimer.unref === "function") this.heartbeatTimer.unref();
  }

  bindWebSocketServer(wss) {
    this.wss = wss;
    this.wss.on("connection", (ws, req) => {
      this.attachConnection(ws, req);
    });
  }

  shutdown() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.stopWorldTickLoop();
    if (this.remoteBroadcastTimer) clearTimeout(this.remoteBroadcastTimer);
    this.remoteBroadcastTimer = null;
    this.pendingRemoteBroadcastByPlayerId.clear();
    this.latestInputByPlayerId.clear();
    this.dirtyPlayerIdsByWorldId.clear();
    this.lastPersistAtMsByKey.clear();
    for (const connection of this.connectionsById.values()) {
      closeSocket(connection.ws, 1001, "Server shutdown");
    }
    this.connectionsById.clear();
    this.connectionsBySessionId.clear();
    this.connectionsByUserId.clear();
    this.connectionsByWorldId.clear();
    this.connectionsByPlayerId.clear();
    this.connectedSessionIdsByUserId.clear();
    this.playerIdsByWorldId.clear();
    this.primaryPresenceByPlayerId.clear();
  }

  startWorldTickLoop() {
    if (this.worldTickTimer) return;
    this.worldTickNextAtMs = nowMs() + WORLD_TICK_MS;
    this.worldTickTimer = setTimeout(() => this.runWorldTickLoop(), WORLD_TICK_MS);
    if (typeof this.worldTickTimer.unref === "function") this.worldTickTimer.unref();
  }

  stopWorldTickLoop() {
    if (!this.worldTickTimer) return;
    clearTimeout(this.worldTickTimer);
    this.worldTickTimer = null;
  }

  runWorldTickLoop() {
    this.stopWorldTickLoop();
    const currentAt = nowMs();
    if (!Number.isFinite(this.worldTickNextAtMs) || this.worldTickNextAtMs <= 0) {
      this.worldTickNextAtMs = currentAt + WORLD_TICK_MS;
    }
    let processedTicks = 0;
    const maxCatchUpTicks = Math.max(1, Math.ceil(1000 / WORLD_TICK_MS));
    while (this.worldTickNextAtMs <= currentAt && processedTicks < maxCatchUpTicks) {
      this.tickWorld(this.worldTickNextAtMs);
      this.worldTickNextAtMs += WORLD_TICK_MS;
      processedTicks += 1;
    }
    if (processedTicks === 0) {
      this.worldTickNextAtMs = currentAt + WORLD_TICK_MS;
    } else if (this.worldTickNextAtMs <= nowMs() - 1000) {
      // FIX: als de server meer dan 1s achterloopt (event loop was geblokkeerd),
      // niet eindeloos inhalen maar de klok resetten. Anders verschuift de
      // simulatie t.o.v. de echte tijd en lopen remote spelers steeds verder achter.
      this.worldTickNextAtMs = nowMs() + WORLD_TICK_MS;
    }
    const delayMs = Math.max(0, this.worldTickNextAtMs - nowMs());
    this.worldTickTimer = setTimeout(() => this.runWorldTickLoop(), delayMs);
    if (typeof this.worldTickTimer.unref === "function") this.worldTickTimer.unref();
  }

  getPublishedWorldContext() {
    const world = this.repository.getPublishedWorld();
    if (!world) {
      const error = new Error("Nog geen gepubliceerde wereld.");
      error.status = 404;
      throw error;
    }
    const publishedAt = world.publishedAt || "";
    if (this.worldCache && this.worldCache.publishedAt === publishedAt) return this.worldCache;
    const worldId = worldIdFor(world);
    const walkabilityIndex = buildWalkabilityIndex(world);
    this.worldCache = { world: world, worldId: worldId, publishedAt: publishedAt, walkabilityIndex: walkabilityIndex };
    this.lastWorldBuildAt = nowMs();
    return this.worldCache;
  }

  buildGameWorldResponse() {
    return this.getPublishedWorldContext().world;
  }

  getSessionContextFromRequest(req) {
    const current = this.authService.currentSession(req);
    if (!current) {
      const error = new Error("Niet ingelogd.");
      error.status = 401;
      throw error;
    }
    return current;
  }

  ensurePlayerProfile(user, worldContext) {
    const existing = this.db.prepare("SELECT * FROM player_profiles WHERE user_id = ? LIMIT 1").get(user.id);
    const currentWorldId = worldContext.worldId;
    const displayName = String(existing?.display_name || user.username || "player").trim() || "player";
    const selectedCharacterId = existing?.selected_character_id || null;
    const nowIso = now();
    if (existing) {
      if (existing.current_world_id !== currentWorldId || existing.display_name !== displayName) {
        this.db.prepare("UPDATE player_profiles SET display_name = ?, selected_character_id = ?, current_world_id = ?, updated_at = ? WHERE id = ?")
          .run(displayName, selectedCharacterId, currentWorldId, nowIso, existing.id);
        return this.db.prepare("SELECT * FROM player_profiles WHERE id = ?").get(existing.id);
      }
      return existing;
    }
    const profileId = "player_" + crypto.randomUUID();
    this.db.prepare("INSERT INTO player_profiles (id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(profileId, user.id, displayName, null, currentWorldId, nowIso, nowIso);
    return this.db.prepare("SELECT * FROM player_profiles WHERE id = ?").get(profileId);
  }

  // FIX: op het hot path (elk input-bericht, elke tick) geen SELECT meer doen.
  // Het profiel hangt al aan de verbinding; alleen bij een wereldwissel of
  // ontbrekend profiel valt dit terug op de databaseroute.
  resolveConnectionProfile(connection, worldContext) {
    const cached = connection?.player || null;
    if (cached && cached.current_world_id === worldContext.worldId) return cached;
    const profile = this.ensurePlayerProfile(connection.user, worldContext);
    if (connection) connection.player = profile;
    return profile;
  }

  ensurePlayerPosition(profile, worldContext, sessionContext) {
    const worldId = worldContext.worldId;
    const cacheKey = positionKey(profile.id, worldId);
    const cached = this.playerStateCache.get(cacheKey);
    if (cached) return cached;
    const existing = this.db.prepare("SELECT * FROM player_positions WHERE player_id = ? AND world_id = ? LIMIT 1")
      .get(profile.id, worldId);
    if (existing) {
      const normalized = this.normalizePositionRecord(existing, sessionContext, worldId);
      this.playerStateCache.set(cacheKey, normalized);
      return normalized;
    }
    const spawn = spawnFromWorld(worldContext.world);
    const createdAt = now();
    const record = {
      player_id: profile.id,
      world_id: worldId,
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      rotation_y: spawn.rotationY,
      revision: 1,
      last_update_source_session_id: sessionContext?.session?.id || null,
      updated_at: createdAt,
      updated_at_ms: nowMs(),
      velocity_x: 0,
      velocity_z: 0,
      animation_state: "idle",
      moving: false,
      last_processed_input_seq: 0,
      active_controller_session_id: sessionContext?.session?.id || null,
      controller_epoch: 0,
      client_session_id: null,
      client_input_seq: 0,
      last_input_received_at_ms: 0,
      teleport: false
    };
    this.db.prepare("INSERT INTO player_positions (player_id, world_id, x, y, z, rotation_y, revision, last_update_source_session_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(record.player_id, record.world_id, record.x, record.y, record.z, record.rotation_y, record.revision, record.last_update_source_session_id, record.updated_at);
    const normalized = this.normalizePositionRecord(record, sessionContext, worldId);
    this.playerStateCache.set(cacheKey, normalized);
    this.recordEvent("player_position_created", sessionContext?.user?.id || profile.user_id, profile.id, sessionContext?.session?.id || null);
    return normalized;
  }

  normalizePositionRecord(record, sessionContext, worldId) {
    const sourceSessionId = record.last_update_source_session_id || null;
    const sourceDevice = sessionContext?.session?.device_label || null;
    const updatedAtMs = Number.isFinite(Number(record.updated_at_ms)) ? Number(record.updated_at_ms) : Date.parse(record.updated_at || "") || nowMs();
    return {
      player_id: record.player_id,
      world_id: record.world_id || worldId,
      x: num(record.x, 0),
      y: num(record.y, 0),
      z: num(record.z, 0),
      rotation_y: num(record.rotation_y, 0),
      velocity_x: num(record.velocity_x, 0),
      velocity_z: num(record.velocity_z, 0),
      revision: Number(record.revision) || 0,
      last_update_source_session_id: sourceSessionId,
      updated_at: record.updated_at || now(),
      updated_at_ms: updatedAtMs,
      source_device: sourceDevice,
      animation_state: normalizeAnimationState(record.animation_state) || "idle",
      moving: record.moving === true,
      last_processed_input_seq: Number(record.last_processed_input_seq || record.client_input_seq || 0) || 0,
      active_controller_session_id: record.active_controller_session_id || sourceSessionId || null,
      controller_epoch: Number(record.controller_epoch || 0) || 0,
      client_session_id: record.client_session_id || null,
      client_input_seq: Number(record.client_input_seq || 0) || 0,
      client_intent_id: record.client_intent_id || null,
      client_sent_at: record.client_sent_at || null,
      server_received_at: record.server_received_at || null,
      last_input_received_at_ms: Number(record.last_input_received_at_ms || 0) || 0,
      teleport: record.teleport === true,
      last_processed_input_at_ms: Number(record.last_processed_input_at_ms || 0) || 0
    };
  }

  getPlayerSnapshot(req, options = {}) {
    const sessionContext = this.getSessionContextFromRequest(req);
    this.authService.touchSession(sessionContext.session.id, false);
    const worldContext = this.getPublishedWorldContext();
    const profile = this.ensurePlayerProfile(sessionContext.user, worldContext);
    const position = this.ensurePlayerPosition(profile, worldContext, sessionContext);
    const activeSessionCount = this.authService.countActiveSessions(sessionContext.user.id);
    const connectedSessionCount = this.countConnectedSessions(sessionContext.user.id);
    return {
      ok: true,
      user: this.authService.publicUser(sessionContext.user),
      session: publicSession(sessionContext.session),
      activeSessionCount: activeSessionCount,
      connectedSessionCount: connectedSessionCount,
      player: publicPlayer(profile),
      position: this.publicPositionForPlayer(position, sessionContext.session, worldContext.worldId),
      spawn: spawnFromWorld(worldContext.world),
      gameWorld: worldContext.world,
      worldId: worldContext.worldId,
      worldPublishedAt: worldContext.publishedAt,
      createdProfile: Boolean(options.createdProfile)
    };
  }

  publicPositionForPlayer(position, session, worldId) {
    const controller = this.lastControllerByUserId.get(session?.user_id || null) || null;
    return {
      playerId: position.player_id,
      worldId: position.world_id || worldId,
      x: round(position.x),
      y: round(position.y),
      z: round(position.z),
      rotationY: round(position.rotation_y),
      revision: Number(position.revision) || 0,
      updatedAt: position.updated_at,
      sourceSessionId: position.last_update_source_session_id || null,
      sourceDevice: session?.device_label || null,
      lastUpdateSourceSessionId: position.last_update_source_session_id || null,
      animationState: normalizeAnimationState(position.animation_state) || "idle",
      moving: position.moving === true,
      clientSessionId: position.client_session_id || controller?.clientSessionId || null,
      clientInputSeq: Number(position.client_input_seq) || 0,
      clientIntentId: position.client_intent_id || null,
      clientSentAt: position.client_sent_at || null,
      serverReceivedAt: position.server_received_at || null,
      lastProcessedInputSeq: Number(position.last_processed_input_seq || position.client_input_seq || 0) || 0,
      controllerEpoch: Number(position.controller_epoch) || 0,
      activeControllerSessionId: position.active_controller_session_id || controller?.sessionId || position.last_update_source_session_id || null,
      transport: position.transport || null,
      teleport: position.teleport === true,
      velocityX: round(position.velocity_x || 0),
      velocityZ: round(position.velocity_z || 0)
    };
  }

  publicStateChange(position, sessionContext, worldId, sourceDeviceOverride = null) {
    const sourceDevice = sourceDeviceOverride || sessionContext?.session?.device_label || null;
    const controller = this.lastControllerByUserId.get(sessionContext?.user?.id || sessionContext?.session?.user_id || null) || null;
    return {
      playerId: position.player_id,
      worldId: position.world_id || worldId,
      position: {
        x: round(position.x),
        y: round(position.y),
        z: round(position.z),
        rotationY: round(position.rotation_y)
      },
      revision: Number(position.revision) || 0,
      updatedAt: position.updated_at,
      sourceSessionId: position.last_update_source_session_id || null,
      sourceDevice: sourceDevice,
      animationState: normalizeAnimationState(position.animation_state) || "idle",
      moving: position.moving === true,
      clientSessionId: position.client_session_id || controller?.clientSessionId || null,
      clientInputSeq: Number(position.client_input_seq) || 0,
      clientIntentId: position.client_intent_id || null,
      clientSentAt: position.client_sent_at || null,
      serverReceivedAt: position.server_received_at || null,
      lastProcessedInputSeq: Number(position.last_processed_input_seq || position.client_input_seq || 0) || 0,
      controllerEpoch: Number(position.controller_epoch) || 0,
      activeControllerSessionId: position.active_controller_session_id || controller?.sessionId || position.last_update_source_session_id || null,
      transport: position.transport || null,
      teleport: position.teleport === true
    };
  }

  countConnectedSessions(userId) {
    return (this.connectedSessionIdsByUserId.get(userId) || new Set()).size;
  }

  countConnectedPlayerSessions(playerId) {
    return (this.connectionsByPlayerId.get(playerId) || new Set()).size;
  }

  getConnectionForPlayer(playerId, worldId = null) {
    const connectionIds = Array.from(this.connectionsByPlayerId.get(playerId) || []);
    for (const connectionId of connectionIds) {
      const connection = this.connectionsById.get(connectionId);
      if (!connection || connection.closed) continue;
      if (worldId && connection.worldId && connection.worldId !== worldId) continue;
      return connection;
    }
    return null;
  }

  updatePrimaryPresenceRecord(connection, position) {
    if (!connection || !connection.player || !position) return null;
    const playerId = connection.player.id;
    const profile = connection.player;
    const worldId = position.world_id || connection.worldId || null;
    const record = {
      playerId: playerId,
      userId: profile.user_id,
      displayName: profile.display_name,
      selectedCharacterId: profile.selected_character_id || null,
      worldId: worldId,
      position: {
        x: round(position.x),
        y: round(position.y),
        z: round(position.z),
        rotationY: round(position.rotation_y)
      },
      revision: Number(position.revision) || 0,
      updatedAt: position.updated_at || now(),
      animationState: normalizeAnimationState(position.animation_state) || "idle",
      moving: position.moving === true,
      connectedSessionCount: this.countConnectedPlayerSessions(playerId),
      lastSourceSessionId: position.last_update_source_session_id || connection.session?.id || null,
      lastSourceDevice: connection.sourceDevice || connection.session?.device_label || null,
      clientSentAt: position.client_sent_at || null,
      serverReceivedAt: position.server_received_at || null,
      lastProcessedInputSeq: Number(position.last_processed_input_seq || position.client_input_seq || 0) || 0,
      activeControllerSessionId: position.active_controller_session_id || connection.session?.id || null,
      controllerEpoch: Number(position.controller_epoch || 0) || 0,
      teleport: position.teleport === true
    };
    this.primaryPresenceByPlayerId.set(playerId, record);
    if (worldId) {
      this.ensureConnectionSet(this.playerIdsByWorldId, worldId).add(playerId);
    }
    return record;
  }

  removePrimaryPresenceRecord(playerId, worldId = null) {
    if (playerId) this.primaryPresenceByPlayerId.delete(playerId);
    if (!worldId) return;
    const playerSet = this.playerIdsByWorldId.get(worldId);
    if (playerSet) {
      if (playerId) playerSet.delete(playerId);
      if (playerSet.size === 0) this.playerIdsByWorldId.delete(worldId);
    }
  }

  getWorldPresenceSnapshot(worldId, excludePlayerId = null) {
    const playerIds = Array.from(this.playerIdsByWorldId.get(worldId) || []);
    const players = [];
    for (const playerId of playerIds) {
      if (!playerId || (excludePlayerId && playerId === excludePlayerId)) continue;
      const record = this.primaryPresenceByPlayerId.get(playerId) || null;
      if (record && record.worldId && worldId && record.worldId !== worldId) continue;
      const connection = this.getConnectionForPlayer(playerId, worldId);
      const profile = connection?.player || null;
      const position = record || (connection ? this.primaryPresenceByPlayerId.get(playerId) : null);
      if (!profile || !position) continue;
      players.push(publicRemotePlayerSnapshot(profile, {
        player_id: profile.id,
        world_id: worldId,
        x: position.position?.x ?? 0,
        y: position.position?.y ?? 0,
        z: position.position?.z ?? 0,
        rotation_y: position.position?.rotationY ?? 0,
        revision: position.revision || 0,
        updated_at: position.updatedAt || now(),
        animation_state: position.animationState || "idle",
        moving: position.moving === true,
        last_processed_input_seq: position.lastProcessedInputSeq || position.last_processed_input_seq || 0,
        active_controller_session_id: position.activeControllerSessionId || position.active_controller_session_id || null,
        controller_epoch: position.controllerEpoch || position.controller_epoch || 0,
        teleport: position.teleport === true,
        client_sent_at: position.clientSentAt || position.client_sent_at || null,
        server_received_at: position.serverReceivedAt || position.server_received_at || null
      }, this.countConnectedPlayerSessions(playerId), worldId));
    }
    return {
      ok: true,
      worldId: worldId,
      players: players,
      type: "world:presence_snapshot"
    };
  }

  // FIX: één JSON.stringify per broadcast in plaats van één per verbinding.
  broadcastToWorld(worldId, payload, options = {}) {
    const connectionIds = Array.from(this.connectionsByWorldId.get(worldId) || []);
    if (!connectionIds.length) return;
    const excludeUserId = options.excludeUserId || null;
    const excludeConnectionId = options.excludeConnectionId || null;
    const text = JSON.stringify(payload);
    for (const connectionId of connectionIds) {
      if (excludeConnectionId && connectionId === excludeConnectionId) continue;
      const connection = this.connectionsById.get(connectionId);
      if (!connection || connection.closed) continue;
      if (excludeUserId && connection.user?.id === excludeUserId) continue;
      sendText(connection.ws, text);
    }
  }

  scheduleRemoteBroadcastFlush() {
    if (this.remoteBroadcastTimer) return;
    this.remoteBroadcastTimer = setTimeout(() => {
      this.remoteBroadcastTimer = null;
      this.flushRemoteBroadcasts();
    }, this.remoteBroadcastFlushMs);
    if (typeof this.remoteBroadcastTimer.unref === "function") this.remoteBroadcastTimer.unref();
  }

  flushRemoteBroadcasts() {
    if (this.remoteBroadcastTimer) {
      clearTimeout(this.remoteBroadcastTimer);
      this.remoteBroadcastTimer = null;
    }
    if (!this.pendingRemoteBroadcastByPlayerId.size) return;
    const queued = Array.from(this.pendingRemoteBroadcastByPlayerId.values());
    this.pendingRemoteBroadcastByPlayerId.clear();
    for (const item of queued) {
      if (!item || !item.worldId || !item.payload) continue;
      const stamped = eventMessage(item.payload.type || "remote_player:state_changed", item.payload.payload || item.payload, this.stampServerPayload(item.worldId, item.payload.payload || item.payload));
      this.broadcastToWorld(item.worldId, stamped, {
        excludeUserId: item.excludeUserId || null
      });
    }
  }

  discardQueuedRemoteBroadcast(playerId) {
    const key = String(playerId || "").trim();
    if (!key) return;
    this.pendingRemoteBroadcastByPlayerId.delete(key);
  }

  broadcastRemotePlayerState(connection, position, sourceDeviceOverride = null) {
    if (!connection || !position || !connection.worldId) return;
    const remotePayload = publicRemoteStateChange(position, connection.session, connection.worldId, sourceDeviceOverride);
    this.pendingRemoteBroadcastByPlayerId.set(connection.player.id, {
      worldId: connection.worldId,
      excludeUserId: connection.user?.id || null,
      payload: {
        type: "remote_player:state_changed",
        payload: remotePayload
      }
    });
    this.scheduleRemoteBroadcastFlush();
  }

  broadcastPositionUpdate(connection, position, intent = {}) {
    if (!connection || !position) return;
    const sourceDevice = intent.sourceDevice || connection.sourceDevice || connection.session?.device_label || null;
    this.updatePrimaryPresenceRecord(connection, position);
    const ownPayload = this.publicStateChange(position, connection, connection.worldId, sourceDevice);
    this.broadcastToUser(connection.user.id, eventMessage("player:state_changed", ownPayload, this.stampServerPayload(connection.worldId, ownPayload)));
    this.broadcastRemotePlayerState(connection, position, sourceDevice);
  }

  sendWorldPresenceSnapshot(connection, position = null) {
    if (!connection || !connection.worldId) return;
    const snapshot = this.getWorldPresenceSnapshot(connection.worldId, connection.player?.id || null);
    if (position && connection.player) {
      const ownPlayer = publicRemotePlayerSnapshot(connection.player, position, this.countConnectedPlayerSessions(connection.player.id), connection.worldId);
      if (ownPlayer) {
        snapshot.players = snapshot.players.filter(function (entry) {
          return entry && entry.playerId !== ownPlayer.playerId;
        });
      }
    }
    send(connection.ws, eventMessage("world:presence_snapshot", snapshot, this.stampServerPayload(connection.worldId, snapshot)));
  }

  broadcastRemotePlayerJoined(connection, position) {
    if (!connection || !position || !connection.worldId || !connection.player) return;
    const connectedSessionCount = this.countConnectedPlayerSessions(connection.player.id);
    const payload = publicRemotePlayerJoined(connection.player, position, connectedSessionCount, connection.worldId);
    if (!payload) return;
    this.broadcastToWorld(connection.worldId, eventMessage("remote_player:joined", payload, this.stampServerPayload(connection.worldId, payload)), {
      excludeUserId: connection.user?.id || null
    });
  }

  broadcastRemotePlayerLeft(connection, presenceRecord = null) {
    if (!connection || !connection.worldId || !connection.player) return;
    const profile = connection.player;
    const payload = publicRemotePlayerLeft(profile, connection.worldId);
    if (!payload) return;
    this.removePrimaryPresenceRecord(profile.id, connection.worldId);
    this.broadcastToWorld(connection.worldId, eventMessage("remote_player:left", payload, this.stampServerPayload(connection.worldId, payload)), {
      excludeUserId: connection.user?.id || null
    });
  }

  markPlayerDirty(worldId, playerId) {
    if (!worldId || !playerId) return;
    this.ensureConnectionSet(this.dirtyPlayerIdsByWorldId, worldId).add(playerId);
  }

  clearWorldDirtyPlayers(worldId) {
    const dirty = this.dirtyPlayerIdsByWorldId.get(worldId);
    if (!dirty) return;
    dirty.clear();
  }

  snapshotPlayerStateRecord(state, options = {}) {
    if (!state) return null;
    return {
      playerId: state.player_id,
      x: round(state.x),
      y: round(state.y),
      z: round(state.z),
      rotationY: round(state.rotation_y),
      moving: state.moving === true,
      animationState: normalizeAnimationState(state.animation_state) || "idle",
      revision: Number(state.revision) || 0,
      lastProcessedInputSeq: Number(state.last_processed_input_seq || state.client_input_seq || 0) || 0,
      activeControllerSessionId: state.active_controller_session_id || null,
      controllerEpoch: Number(state.controller_epoch || 0) || 0,
      teleport: options.teleport === true || state.teleport === true
    };
  }

  getWorldPlayerStates(worldId, playerIds = null) {
    const entries = Array.from(this.playerStateCache.values()).filter((state) => state && state.world_id === worldId);
    const allowedIds = Array.isArray(playerIds) ? new Set(playerIds.map((id) => String(id || "").trim()).filter(Boolean)) : null;
    return allowedIds
      ? entries.filter((state) => allowedIds.has(String(state.player_id || "").trim()))
      : entries;
  }

  buildWorldSnapshotPayload(worldId, playerStates, options = {}) {
    const serverTimeMs = Number.isFinite(Number(options.serverTimeMs))
      ? Math.max(0, Math.floor(Number(options.serverTimeMs)))
      : nowMs();
    const snapshotSeq = ++this.snapshotSeq;
    const serverTick = Number.isFinite(Number(options.serverTick)) ? Math.max(0, Math.floor(Number(options.serverTick))) : this.serverTick;
    const players = Array.isArray(playerStates) ? playerStates.map((state) => this.snapshotPlayerStateRecord(state, options)).filter(Boolean) : [];
    return {
      ok: true,
      type: "mmo:snapshot",
      protocolVersion: PROTOCOL_VERSION,
      worldId: worldId || null,
      serverTick: serverTick,
      serverTimeMs: serverTimeMs,
      snapshotSeq: snapshotSeq,
      players: players
    };
  }

  broadcastWorldSnapshot(worldId, playerStates, options = {}) {
    if (!worldId) return null;
    const payload = this.buildWorldSnapshotPayload(worldId, playerStates, options);
    if (!Array.isArray(payload.players) || !payload.players.length) return payload;
    this.broadcastToWorld(worldId, eventMessage("mmo:snapshot", payload, this.stampServerPayload(worldId, payload)), {
      excludeUserId: options.excludeUserId || null
    });
    return payload;
  }

  sendWorldSnapshot(connection, playerStates = null, options = {}) {
    if (!connection || !connection.worldId) return null;
    const worldId = connection.worldId;
    const players = Array.isArray(playerStates) ? playerStates : this.getWorldPlayerStates(worldId);
    const payload = this.buildWorldSnapshotPayload(worldId, players, options);
    send(connection.ws, eventMessage("mmo:snapshot", payload, this.stampServerPayload(worldId, payload)));
    return payload;
  }

  sendInitialWorldSnapshot(connection, worldContext) {
    if (!connection || !connection.worldId) return null;
    const players = this.getWorldPlayerStates(connection.worldId);
    return this.sendWorldSnapshot(connection, players, {
      serverTick: this.serverTick,
      teleport: false
    });
  }

  normalizeInputStateForPlayer(connection, payload) {
    const intent = extractInputState(payload);
    const rawInput = intent.input || {};
    return {
      clientSessionId: intent.clientSessionId || connection.session?.id || connection.id || null,
      inputSeq: normalizeInputSeq(intent.inputSeq),
      controllerEpoch: normalizeControllerEpoch(intent.controllerEpoch),
      clientSentAt: intent.clientSentAt || null,
      sourceDevice: intent.sourceDevice || connection.sourceDevice || connection.session?.device_label || null,
      teleport: intent.teleport === true,
      input: {
        moveX: clamp(num(rawInput.moveX, 0), -1, 1),
        moveZ: clamp(num(rawInput.moveZ, 0), -1, 1),
        sprint: rawInput.sprint === true,
        pointerTarget: normalizePointerTarget(rawInput.pointerTarget || null),
        stop: rawInput.stop === true
      }
    };
  }

  getPlayerStateCacheKey(playerId, worldId) {
    return positionKey(playerId, worldId);
  }

  updatePlayerStateFromTick(state, nextState, connection, input, tickInfo = {}) {
    const previous = Object.assign({}, state);
    const changed = Boolean(
      previous.x !== nextState.x ||
      previous.y !== nextState.y ||
      previous.z !== nextState.z ||
      previous.rotation_y !== nextState.rotation_y ||
      previous.moving !== nextState.moving ||
      previous.animation_state !== nextState.animation_state ||
      Number(previous.last_processed_input_seq || 0) !== Number(nextState.last_processed_input_seq || 0) ||
      Number(previous.controller_epoch || 0) !== Number(nextState.controller_epoch || 0) ||
      previous.active_controller_session_id !== nextState.active_controller_session_id ||
      previous.client_session_id !== nextState.client_session_id
    );
    if (!changed) return false;
    Object.assign(state, nextState);
    state.updated_at = nextState.updated_at || state.updated_at || now();
    state.updated_at_ms = Number.isFinite(Number(nextState.updated_at_ms)) ? Number(nextState.updated_at_ms) : nowMs();
    state.transport = connection && connection.ws && connection.ws.readyState === 1 ? "ws" : "http";
    state.last_input_received_at_ms = Number(nextState.last_input_received_at_ms || state.last_input_received_at_ms || 0) || 0;
    state.source_device = nextState.source_device || state.source_device || null;
    state.teleport = nextState.teleport === true;
    state.last_processed_input_at_ms = Number(nextState.last_processed_input_at_ms || state.last_processed_input_at_ms || 0) || 0;
    this.playerStateCache.set(this.getPlayerStateCacheKey(state.player_id, state.world_id), state);
    this.updatePrimaryPresenceFromState(state, connection);
    this.markPlayerDirty(state.world_id, state.player_id);
    if (nextState.persist !== false) {
      this.schedulePersist(state, connection);
    }
    return true;
  }

  updatePrimaryPresenceFromState(state, connection = null) {
    if (!state) return null;
    const playerId = state.player_id;
    // FIX: geen SELECT per tick meer; val eerst terug op een al bekende
    // presence-record voordat de database wordt geraadpleegd.
    const profile = connection?.player
      || this.getConnectionForPlayer(playerId, state.world_id || null)?.player
      || null;
    const fallbackRecord = !profile ? this.primaryPresenceByPlayerId.get(playerId) || null : null;
    const dbProfile = !profile && !fallbackRecord
      ? this.db.prepare("SELECT * FROM player_profiles WHERE id = ? LIMIT 1").get(playerId) || null
      : null;
    const resolved = profile || dbProfile;
    if (!resolved && !fallbackRecord) return null;
    const worldId = state.world_id || connection?.worldId || null;
    const record = {
      playerId: playerId,
      userId: resolved ? resolved.user_id : fallbackRecord.userId,
      displayName: resolved ? resolved.display_name : fallbackRecord.displayName,
      selectedCharacterId: resolved ? (resolved.selected_character_id || null) : (fallbackRecord.selectedCharacterId || null),
      worldId: worldId,
      position: {
        x: round(state.x),
        y: round(state.y),
        z: round(state.z),
        rotationY: round(state.rotation_y)
      },
      revision: Number(state.revision) || 0,
      updatedAt: state.updated_at || now(),
      animationState: normalizeAnimationState(state.animation_state) || "idle",
      moving: state.moving === true,
      connectedSessionCount: this.countConnectedPlayerSessions(playerId),
      lastSourceSessionId: state.last_update_source_session_id || connection?.session?.id || state.active_controller_session_id || null,
      lastSourceDevice: state.source_device || connection?.sourceDevice || connection?.session?.device_label || null,
      clientSentAt: state.client_sent_at || null,
      serverReceivedAt: state.server_received_at || null,
      lastProcessedInputSeq: Number(state.last_processed_input_seq || 0) || 0,
      activeControllerSessionId: state.active_controller_session_id || null,
      controllerEpoch: Number(state.controller_epoch || 0) || 0,
      teleport: state.teleport === true
    };
    this.primaryPresenceByPlayerId.set(playerId, record);
    if (worldId) {
      this.ensureConnectionSet(this.playerIdsByWorldId, worldId).add(playerId);
    }
    return record;
  }

  applyTeleportState(connection, payload, options = {}) {
    const worldContext = this.getPublishedWorldContext();
    const profile = this.resolveConnectionProfile(connection, worldContext);
    const worldId = worldContext.worldId;
    const cacheKey = this.getPlayerStateCacheKey(profile.id, worldId);
    const current = this.playerStateCache.get(cacheKey) || this.ensurePlayerPosition(profile, worldContext, connection);
    const raw = payload && typeof payload === "object" ? payload : {};
    const position = raw.position && typeof raw.position === "object" ? raw.position : raw;
    const nextState = Object.assign({}, current, {
      player_id: profile.id,
      world_id: worldId,
      x: num(position.x, current.x),
      y: Number.isFinite(Number(position.y)) ? num(position.y, current.y) : current.y,
      z: num(position.z, current.z),
      rotation_y: Number.isFinite(Number(position.rotationY)) ? num(position.rotationY, current.rotation_y) : current.rotation_y,
      velocity_x: 0,
      velocity_z: 0,
      revision: (Number(current.revision) || 0) + 1,
      last_update_source_session_id: connection.session.id,
      updated_at: now(),
      updated_at_ms: nowMs(),
      moving: false,
      animation_state: normalizeAnimationState(raw.animationState) || "idle",
      last_processed_input_seq: normalizeInputSeq(raw.lastProcessedInputSeq || raw.clientInputSeq || raw.inputSeq || 0),
      active_controller_session_id: connection.session.id,
      controller_epoch: normalizeControllerEpoch(raw.controllerEpoch || current.controller_epoch || 0),
      client_session_id: raw.clientSessionId || current.client_session_id || null,
      client_input_seq: normalizeInputSeq(raw.clientInputSeq || raw.inputSeq || current.client_input_seq || 0),
      client_intent_id: raw.clientIntentId || current.client_intent_id || null,
      client_sent_at: raw.clientSentAt || current.client_sent_at || null,
      server_received_at: nowMs(),
      last_input_received_at_ms: nowMs(),
      teleport: true
    });
    this.playerStateCache.set(cacheKey, nextState);
    this.updatePrimaryPresenceFromState(nextState, connection);
    this.markPlayerDirty(worldId, profile.id);
    this.schedulePersist(nextState, connection);
    this.latestInputByPlayerId.set(profile.id, {
      playerId: profile.id,
      worldId: worldId,
      clientSessionId: nextState.client_session_id || connection.session.id,
      inputSeq: Number(nextState.client_input_seq || 0) || 0,
      controllerEpoch: Number(nextState.controller_epoch || 0) || 0,
      input: {
        moveX: 0,
        moveZ: 0,
        sprint: false,
        pointerTarget: null,
        stop: true
      },
      clientSentAt: nextState.client_sent_at || null,
      sourceDevice: nextState.source_device || null,
      receivedAtMs: nextState.last_input_received_at_ms || nowMs(),
      activeControllerSessionId: nextState.active_controller_session_id || connection.session.id,
      teleport: true
    });
    if (nextState.client_session_id) {
      this.lastInputSeqByClientSessionId.set(nextState.client_session_id, Number(nextState.client_input_seq || 0) || 0);
      this.lastControllerEpochByClientSessionId.set(nextState.client_session_id, Number(nextState.controller_epoch || 0) || 0);
    }
    this.broadcastRemotePlayerState(connection, nextState, connection.sourceDevice || null);
    return nextState;
  }

  simulatePlayerTick(state, inputState, worldContext, tickDeltaMs, tickInfo = {}) {
    const baseSpeed = Math.max(0.1, num(worldContext.world?.player?.moveSpeed, 6));
    const sprintMultiplier = Math.min(2.5, Math.max(1, num(worldContext.world?.player?.sprintMultiplier, 1.6)));
    const radius = Math.max(0.05, num(worldContext.world?.player?.collisionRadius, 0.5));
    const currentPosition = { x: num(state.x, 0), y: num(state.y, 0), z: num(state.z, 0) };
    const dtSeconds = clamp(Number(tickDeltaMs || WORLD_TICK_MS) / 1000, 0.01, 0.1);
    const input = inputState?.input || {};
    const moveX = clamp(num(input.moveX, 0), -1, 1);
    const moveZ = clamp(num(input.moveZ, 0), -1, 1);
    const pointerTarget = normalizePointerTarget(input.pointerTarget || null);
    let directionX = moveX;
    let directionZ = moveZ;
    let moving = !input.stop && (Math.hypot(directionX, directionZ) > 0.0001 || Boolean(pointerTarget));
    if (pointerTarget) {
      const deltaX = pointerTarget.x - currentPosition.x;
      const deltaZ = pointerTarget.z - currentPosition.z;
      const distance = Math.hypot(deltaX, deltaZ);
      if (distance <= 0.15) {
        directionX = 0;
        directionZ = 0;
        moving = false;
      } else if (distance > 0.0001) {
        directionX = deltaX / distance;
        directionZ = deltaZ / distance;
      }
    }
    const magnitude = Math.hypot(directionX, directionZ);
    if (magnitude > 1) {
      directionX /= magnitude;
      directionZ /= magnitude;
    }
    const speed = baseSpeed * (input?.sprint === true ? sprintMultiplier : 1);
    const desired = {
      x: currentPosition.x + (directionX * speed * dtSeconds),
      y: currentPosition.y,
      z: currentPosition.z + (directionZ * speed * dtSeconds)
    };
    const resolved = moving
      ? resolveMovement(currentPosition, desired, {
        radius: radius,
        ground: worldContext.world?.ground || null,
        index: worldContext.walkabilityIndex
      })
      : currentPosition;
    const deltaX = resolved.x - currentPosition.x;
    const deltaZ = resolved.z - currentPosition.z;
    const velocityX = dtSeconds > 0 ? deltaX / dtSeconds : 0;
    const velocityZ = dtSeconds > 0 ? deltaZ / dtSeconds : 0;
    const distance = Math.hypot(deltaX, deltaZ);
    const nextRotation = moving && Math.hypot(directionX, directionZ) > 0.0001
      ? Math.atan2(directionX, directionZ) * 180 / Math.PI
      : state.rotation_y;
    const nextRevision = (Number(state.revision) || 0) + (distance > 0.0001 || state.moving !== moving || state.animation_state !== (moving ? (input?.sprint === true ? "run" : "walk") : "idle") ? 1 : 0);
    const nextState = Object.assign({}, state, {
      x: round(resolved.x),
      y: round(resolved.y),
      z: round(resolved.z),
      rotation_y: round(nextRotation),
      velocity_x: round(velocityX),
      velocity_z: round(velocityZ),
      moving: moving,
      animation_state: moving ? (input.sprint === true ? "run" : "walk") : "idle",
      revision: nextRevision,
      last_processed_input_seq: Number.isFinite(Number(inputState?.inputSeq)) ? normalizeInputSeq(inputState.inputSeq) : Number(state.last_processed_input_seq || 0) || 0,
      updated_at: now(),
      updated_at_ms: nowMs(),
      teleport: false,
      client_session_id: inputState?.clientSessionId || state.client_session_id || null,
      client_input_seq: Number.isFinite(Number(inputState?.inputSeq)) ? normalizeInputSeq(inputState.inputSeq) : Number(state.client_input_seq || 0) || 0,
      client_sent_at: inputState?.clientSentAt || state.client_sent_at || null,
      server_received_at: tickInfo.serverReceivedAt || state.server_received_at || null,
      last_input_received_at_ms: state.last_input_received_at_ms || 0
    });
    return this.updatePlayerStateFromTick(state, nextState, tickInfo.connection || null, inputState || input, tickInfo);
  }

  applyInputState(connection, payload, transport = "ws") {
    if (!connection || !connection.player || !connection.worldId) return null;
    const worldContext = this.getPublishedWorldContext();
    // FIX: geen ensurePlayerProfile (DB SELECT) meer op elk input-bericht.
    const profile = this.resolveConnectionProfile(connection, worldContext);
    const worldId = worldContext.worldId;
    const cacheKey = this.getPlayerStateCacheKey(profile.id, worldId);
    const current = this.playerStateCache.get(cacheKey) || this.ensurePlayerPosition(profile, worldContext, connection);
    const inputState = this.normalizeInputStateForPlayer(connection, payload);
    const receivedAtMs = nowMs();
    const input = inputState.input || {};
    const inputSeq = normalizeInputSeq(inputState.inputSeq);
    const currentControllerEpoch = normalizeControllerEpoch(current.controller_epoch || 0);
    const currentControllerSessionId = current.active_controller_session_id || null;
    const clientSessionId = inputState.clientSessionId || connection.session.id;
    connection.sourceDevice = inputState.sourceDevice || connection.sourceDevice || connection.session?.device_label || null;
    const lastAcceptedSeq = Number(this.lastInputSeqByClientSessionId.get(clientSessionId) || 0);
    const isCurrentController = currentControllerSessionId && currentControllerSessionId === connection.session.id;
    const hasActiveInput = Boolean(!input.stop && (Math.hypot(num(input.moveX, 0), num(input.moveZ, 0)) > 0.0001 || Boolean(input.pointerTarget)));
    const inputEpoch = normalizeControllerEpoch(inputState.controllerEpoch || 0);
    const wantsTakeover = Boolean(hasActiveInput && (!currentControllerSessionId || currentControllerSessionId !== connection.session.id));
    const takeoverByDifferentSession = Boolean(wantsTakeover && currentControllerSessionId && currentControllerSessionId !== connection.session.id);
    let nextControllerEpoch = Math.max(currentControllerEpoch, inputEpoch);
    if (!currentControllerSessionId && hasActiveInput) {
      nextControllerEpoch = Math.max(nextControllerEpoch, inputEpoch, 1);
    } else if (takeoverByDifferentSession) {
      nextControllerEpoch = Math.max(currentControllerEpoch + 1, inputEpoch, 1);
    }

    if (!wantsTakeover && inputEpoch < currentControllerEpoch) {
      return Object.assign({}, current, {
        ignored: true,
        ignoreReason: "stale_controller_epoch",
        client_session_id: clientSessionId,
        input_seq: inputSeq,
        controller_epoch: currentControllerEpoch,
        active_controller_session_id: currentControllerSessionId,
        transport: transport
      });
    }

    if (currentControllerSessionId && !isCurrentController && !hasActiveInput) {
      return Object.assign({}, current, {
        ignored: true,
        ignoreReason: "inactive_controller_input",
        client_session_id: clientSessionId,
        input_seq: inputSeq,
        controller_epoch: currentControllerEpoch,
        active_controller_session_id: currentControllerSessionId,
        transport: transport
      });
    }

    if (inputSeq > 0 && isCurrentController && inputSeq <= lastAcceptedSeq) {
      return Object.assign({}, current, {
        ignored: true,
        ignoreReason: "stale_input_seq",
        client_session_id: clientSessionId,
        input_seq: inputSeq,
        controller_epoch: currentControllerEpoch,
        active_controller_session_id: currentControllerSessionId,
        transport: transport
      });
    }

    const nextState = Object.assign({}, current, {
      player_id: profile.id,
      world_id: worldId,
      last_update_source_session_id: connection.session.id,
      updated_at: current.updated_at || now(),
      updated_at_ms: current.updated_at_ms || receivedAtMs,
      moving: current.moving === true,
      animation_state: current.animation_state || "idle",
      client_session_id: clientSessionId,
      client_input_seq: inputSeq,
      client_sent_at: inputState.clientSentAt || null,
      server_received_at: receivedAtMs,
      last_input_received_at_ms: receivedAtMs,
      controller_epoch: nextControllerEpoch,
      active_controller_session_id: wantsTakeover ? connection.session.id : currentControllerSessionId || null,
      last_processed_input_seq: Number(current.last_processed_input_seq || 0) || 0,
      teleport: inputState.teleport === true,
      source_device: inputState.sourceDevice || current.source_device || null,
      transport: transport
    });

    if (inputState.teleport === true) {
      const teleported = this.applyTeleportState(connection, payload, { transport: transport });
      teleported.server_received_at = receivedAtMs;
      teleported.transport = transport;
      this.lastInputSeqByClientSessionId.set(clientSessionId, inputSeq || lastAcceptedSeq);
      this.lastControllerEpochByClientSessionId.set(clientSessionId, nextControllerEpoch);
      this.lastControllerByUserId.set(connection.user.id, {
        sessionId: teleported.active_controller_session_id || null,
        clientSessionId: clientSessionId,
        controllerEpoch: nextControllerEpoch,
        lastInputAt: receivedAtMs
      });
      this.latestInputByPlayerId.set(profile.id, {
        playerId: profile.id,
        worldId: worldId,
        clientSessionId: clientSessionId,
        inputSeq: inputSeq,
        controllerEpoch: nextControllerEpoch,
        input: {
          moveX: 0,
          moveZ: 0,
          sprint: false,
          pointerTarget: null,
          stop: true
        },
        clientSentAt: inputState.clientSentAt || null,
        sourceDevice: inputState.sourceDevice || null,
        receivedAtMs: receivedAtMs,
        activeControllerSessionId: teleported.active_controller_session_id || connection.session.id,
        teleport: true
      });
      return teleported;
    }

    if (inputSeq > 0) {
      this.lastInputSeqByClientSessionId.set(clientSessionId, inputSeq);
    }
    this.lastControllerEpochByClientSessionId.set(clientSessionId, nextControllerEpoch);
    this.lastControllerByUserId.set(connection.user.id, {
      sessionId: nextState.active_controller_session_id || null,
      clientSessionId: clientSessionId,
      controllerEpoch: nextControllerEpoch,
      lastInputAt: receivedAtMs
    });

    this.playerStateCache.set(cacheKey, nextState);
    this.updatePrimaryPresenceFromState(nextState, connection);
    this.latestInputByPlayerId.set(profile.id, {
      playerId: profile.id,
      worldId: worldId,
      clientSessionId: clientSessionId,
      inputSeq: inputSeq,
      controllerEpoch: nextControllerEpoch,
      input: {
        moveX: num(input.moveX, 0),
        moveZ: num(input.moveZ, 0),
        sprint: input.sprint === true,
        pointerTarget: normalizePointerTarget(input.pointerTarget || null),
        stop: input.stop === true
      },
      clientSentAt: inputState.clientSentAt || null,
      sourceDevice: inputState.sourceDevice || null,
      receivedAtMs: receivedAtMs,
      activeControllerSessionId: nextState.active_controller_session_id || null,
      teleport: false
    });
    this.markPlayerDirty(worldId, profile.id);
    return {
      ok: true,
      ignored: false,
      player_id: profile.id,
      world_id: worldId,
      client_session_id: clientSessionId,
      client_input_seq: inputSeq,
      client_sent_at: inputState.clientSentAt || null,
      server_received_at: receivedAtMs,
      controller_epoch: nextControllerEpoch,
      active_controller_session_id: nextState.active_controller_session_id || null,
      transport: transport,
      input: this.latestInputByPlayerId.get(profile.id)?.input || inputState.input,
      state: nextState
    };
  }

  tickWorld(tickStartedAtMs = nowMs()) {
    this.serverTick += 1;
    const tickDeltaMs = WORLD_TICK_MS;
    const worldIds = Array.from(new Set(Array.from(this.playerStateCache.values()).map((state) => state && state.world_id).filter(Boolean)));
    if (!worldIds.length) return;
    const nowMsValue = Number.isFinite(Number(tickStartedAtMs))
      ? Math.max(0, Math.floor(Number(tickStartedAtMs)))
      : nowMs();
    for (const worldId of worldIds) {
      const worldContext = this.getPublishedWorldContext();
      if (!worldContext || worldContext.worldId !== worldId) continue;
      const dirtyIds = new Set(Array.from(this.dirtyPlayerIdsByWorldId.get(worldId) || []));
      const knownStates = this.getWorldPlayerStates(worldId);
      const snapshotPlayers = [];
      for (const state of knownStates) {
        const playerId = state?.player_id || null;
        if (!playerId) continue;
        const cacheKey = this.getPlayerStateCacheKey(playerId, worldId);
        const inputState = this.latestInputByPlayerId.get(playerId) || null;
        const liveConnection = this.getConnectionForPlayer(playerId, worldId);
        // FIX (belangrijkste oorzaak van het haperen):
        // Voorheen werd input na 1500ms zonder nieuw bericht geforceerd op
        // "stop" gezet. Clients sturen input alleen bij verandering, dus een
        // speler die gewoon een toets ingedrukt hield, stopte serverzijdig na
        // 1,5s terwijl de client lokaal doorliep -> steeds grotere drift,
        // stilstaande remote spelers en uiteindelijk een snap/teleport.
        // Nu blijft de laatste input geldig zolang de verbinding leeft.
        // Bij disconnect stopt closeConnection de beweging al netjes.
        const lastInputAtMs = Number(state.last_input_received_at_ms || 0) || 0;
        const holdExpired = INPUT_HOLD_MS > 0 && lastInputAtMs > 0 && (nowMsValue - lastInputAtMs) > INPUT_HOLD_MS;
        const staleInput = !inputState || !liveConnection || holdExpired;
        const currentInput = staleInput ? {
          playerId: playerId,
          worldId: worldId,
          clientSessionId: state.client_session_id || null,
          inputSeq: Number(state.last_processed_input_seq || 0) || 0,
          controllerEpoch: Number(state.controller_epoch || 0) || 0,
          input: {
            moveX: 0,
            moveZ: 0,
            sprint: false,
            pointerTarget: null,
            stop: true
          },
          clientSentAt: state.client_sent_at || null,
          sourceDevice: state.source_device || null,
          receivedAtMs: lastInputAtMs || nowMsValue,
          activeControllerSessionId: state.active_controller_session_id || null,
          teleport: false
        } : inputState;
        const changed = this.simulatePlayerTick(state, currentInput, worldContext, tickDeltaMs, {
          serverTick: this.serverTick,
          serverReceivedAt: nowMsValue,
          connection: liveConnection
        });
        if (changed || dirtyIds.has(playerId)) {
          const updatedState = this.playerStateCache.get(cacheKey) || state;
          snapshotPlayers.push(updatedState);
        }
      }
      if (snapshotPlayers.length) {
        this.broadcastWorldSnapshot(worldId, snapshotPlayers, {
          serverTick: this.serverTick,
          serverTimeMs: nowMsValue,
          serverSentAtMs: nowMsValue
        });
      }
      this.clearWorldDirtyPlayers(worldId);
    }
  }

  closeSessionConnections(sessionId, code = 4001, reason = "logout") {
    const connectionIds = Array.from(this.connectionsBySessionId.get(sessionId) || []);
    for (const connectionId of connectionIds) {
      const connection = this.connectionsById.get(connectionId);
      if (!connection || connection.closed) continue;
      this.closeConnection(connection, code, reason);
    }
  }

  ensureConnectionSet(map, key) {
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    return set;
  }

  stampServerPayload(worldId, payload = {}) {
    const serverTimeMs = Number.isFinite(Number(payload.serverTimeMs))
      ? Math.max(0, Math.floor(Number(payload.serverTimeMs)))
      : nowMs();
    const serverSentAtMs = Number.isFinite(Number(payload.serverSentAtMs))
      ? Math.max(0, Math.floor(Number(payload.serverSentAtMs)))
      : serverTimeMs;
    return Object.assign({}, payload, {
      protocolVersion: PROTOCOL_VERSION,
      serverTimeMs: serverTimeMs,
      serverSentAtMs: serverSentAtMs,
      serverSeq: ++this.serverSeq,
      worldId: worldId || payload.worldId || null
    });
  }

  buildBootstrapPayload(connection, worldContext, position) {
    const worldId = worldContext.worldId;
    const presence = this.getWorldPresenceSnapshot(worldId, connection.player?.id || null);
    return {
      ok: true,
      connection: {
        connectionId: connection.id,
        sessionId: connection.session.id,
        userId: connection.user.id,
        playerId: connection.player.id,
        worldId: worldId
      },
      localPlayer: {
        player: publicPlayer(connection.player),
        position: this.publicPositionForPlayer(position, connection.session, worldId),
        connectedSessionCount: this.countConnectedPlayerSessions(connection.player.id),
        activeSessionCount: this.authService.countActiveSessions(connection.user.id)
      },
      presence: {
        worldId: presence.worldId || worldId,
        players: Array.isArray(presence.players) ? presence.players : []
      }
    };
  }
  attachConnection(ws, req) {
    let sessionContext = null;
    try {
      sessionContext = this.getSessionContextFromRequest(req);
    } catch (error) {
      const payload = { code: "unauthorized", message: error.message };
      send(ws, eventMessage("error", payload, this.stampServerPayload(null, payload)));
      closeSocket(ws, 4401, "Unauthorized");
      return;
    }
    const worldContext = this.getPublishedWorldContext();
    const profile = this.ensurePlayerProfile(sessionContext.user, worldContext);
    const position = this.ensurePlayerPosition(profile, worldContext, sessionContext);
    const playerWasPresent = this.countConnectedPlayerSessions(profile.id) > 0;
    const connectionId = "conn_" + (++this.connectionSeq);
    const connection = {
      id: connectionId,
      ws: ws,
      user: sessionContext.user,
      session: sessionContext.session,
      player: profile,
      worldId: worldContext.worldId,
      lastSeenAt: nowMs(),
      lastPongAt: nowMs(),
      lastPingAt: 0,
      tokens: RATE_LIMIT_PER_SECOND,
      tokenRefillAt: nowMs(),
      closed: false,
      pendingPositionKey: positionKey(profile.id, worldContext.worldId),
      sourceDevice: sessionContext.session.device_label || null,
      lastInputEventLogAtMs: 0,
      lastIgnoredEventLogAtMs: 0
    };
    this.connectionsById.set(connectionId, connection);
    this.ensureConnectionSet(this.connectionsByWorldId, worldContext.worldId).add(connectionId);
    this.ensureConnectionSet(this.connectionsByPlayerId, profile.id).add(connectionId);
    this.ensureConnectionSet(this.connectionsBySessionId, sessionContext.session.id).add(connectionId);
    this.ensureConnectionSet(this.connectionsByUserId, sessionContext.user.id).add(connectionId);
    this.ensureConnectionSet(this.connectedSessionIdsByUserId, sessionContext.user.id).add(sessionContext.session.id);
    this.updatePrimaryPresenceRecord(connection, position);
    this.recordEvent("ws_connected", sessionContext.user.id, profile.id, sessionContext.session.id);
    this.sendBootstrap(connection, worldContext, position);
    this.sendReady(connection, worldContext, position);
    this.sendWorldPresenceSnapshot(connection, position);
    this.sendInitialWorldSnapshot(connection, worldContext);
    if (!playerWasPresent) {
      this.broadcastRemotePlayerJoined(connection, position);
      this.recordEvent("player_presence_joined", sessionContext.user.id, profile.id, sessionContext.session.id);
    }
    this.broadcastPresence(sessionContext.user.id, sessionContext.session.id, true);

    ws.on("message", (data) => {
      this.handleMessage(connection, data);
    });
    ws.on("close", () => {
      this.closeConnection(connection, 1000, "closed");
    });
    ws.on("error", () => {
      this.closeConnection(connection, 1011, "socket_error");
    });
    ws.on("pong", () => {
      connection.lastPongAt = nowMs();
    });
  }

  sendReady(connection, worldContext, position) {
    const snapshot = {
      ok: true,
      connectionId: connection.id,
      userId: connection.user.id,
      sessionId: connection.session.id,
      playerId: connection.player.id,
      worldId: worldContext.worldId,
      activeSessionCount: this.authService.countActiveSessions(connection.user.id),
      connectedSessionCount: this.countConnectedSessions(connection.user.id),
      session: publicSession(connection.session),
      player: publicPlayer(connection.player),
      position: this.publicPositionForPlayer(position, connection.session, worldContext.worldId),
      spawn: spawnFromWorld(worldContext.world),
      type: "connection:ready"
    };
    send(connection.ws, eventMessage("connection:ready", snapshot, this.stampServerPayload(worldContext.worldId, snapshot)));
    const playerState = {
      ok: true,
      userId: connection.user.id,
      sessionId: connection.session.id,
      playerId: connection.player.id,
      worldId: worldContext.worldId,
      activeSessionCount: this.authService.countActiveSessions(connection.user.id),
      connectedSessionCount: this.countConnectedSessions(connection.user.id),
      player: publicPlayer(connection.player),
      position: this.publicPositionForPlayer(position, connection.session, worldContext.worldId),
      spawn: spawnFromWorld(worldContext.world),
      type: "player:state"
    };
    send(connection.ws, eventMessage("player:state", playerState, this.stampServerPayload(worldContext.worldId, playerState)));
    connection.lastSeenAt = nowMs();
  }

  sendBootstrap(connection, worldContext, position) {
    if (!connection || !worldContext) return;
    const snapshot = this.buildBootstrapPayload(connection, worldContext, position);
    const payload = Object.assign({
      type: "mmo:bootstrap",
      ok: true
    }, snapshot);
    send(connection.ws, eventMessage("mmo:bootstrap", payload, this.stampServerPayload(worldContext.worldId, payload)));
  }

  broadcastPresence(userId, sessionId, connected) {
    const base = {
      ok: true,
      userId: userId,
      sessionId: sessionId,
      connected: connected === true,
      connectedSessionCount: this.countConnectedSessions(userId),
      activeSessionCount: this.authService.countActiveSessions(userId),
      type: "player:presence"
    };
    const payload = eventMessage("player:presence", base, this.stampServerPayload(this.worldCache?.worldId || null, base));
    this.broadcastToUser(userId, payload);
  }

  // FIX: één JSON.stringify per broadcast in plaats van één per verbinding.
  broadcastToUser(userId, payload) {
    const connectionIds = Array.from(this.connectionsByUserId.get(userId) || []);
    if (!connectionIds.length) return;
    const text = JSON.stringify(payload);
    for (const connectionId of connectionIds) {
      const connection = this.connectionsById.get(connectionId);
      if (!connection || connection.closed) continue;
      sendText(connection.ws, text);
    }
  }

  recordEvent(eventType, userId, playerId, sessionId) {
    try {
      this.db.prepare("INSERT INTO player_connection_events (id, user_id, player_id, session_id, event_type, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run("event_" + crypto.randomUUID(), userId, playerId || null, sessionId || null, eventType, now());
    } catch {}
  }

  normalizeRateLimit(connection) {
    const current = nowMs();
    const elapsed = Math.max(0, current - connection.tokenRefillAt);
    const refill = (elapsed / 1000) * RATE_LIMIT_PER_SECOND;
    connection.tokens = Math.min(RATE_LIMIT_PER_SECOND, connection.tokens + refill);
    connection.tokenRefillAt = current;
    if (connection.tokens < 1) return false;
    connection.tokens -= 1;
    return true;
  }

  handleMessage(connection, rawData) {
    if (!connection || connection.closed) return;
    if (!this.normalizeRateLimit(connection)) {
      const payload = { code: "rate_limited", message: "Te veel WebSocket berichten per seconde." };
      send(connection.ws, eventMessage("error", payload, this.stampServerPayload(connection.worldId, payload)));
      this.recordEvent("ws_rate_limited", connection.user.id, connection.player.id, connection.session.id);
      closeSocket(connection.ws, 4408, "Rate limit");
      return;
    }
    connection.lastSeenAt = nowMs();
    this.authService.touchSession(connection.session.id, false, 10000);
    const text = typeof rawData === "string" ? rawData : Buffer.isBuffer(rawData) ? rawData.toString("utf8") : String(rawData || "");
    const message = safeJsonParse(text);
    if (!message || typeof message.type !== "string") {
      const payload = { code: "invalid_message", message: "Ongeldig WebSocket bericht." };
      send(connection.ws, eventMessage("error", payload, this.stampServerPayload(connection.worldId, payload)));
      return;
    }
    if (message.type === "ping") {
      connection.lastPongAt = nowMs();
      const payload = {
        ok: true,
        serverTime: now(),
        type: "pong",
        clientSentAt: Number.isFinite(Number(message.clientSentAt)) ? num(message.clientSentAt, 0) : null,
        clientPingSeq: Number.isFinite(Number(message.clientPingSeq)) ? Math.floor(Number(message.clientPingSeq)) : null
      };
      send(connection.ws, eventMessage("pong", payload, this.stampServerPayload(connection.worldId, payload)));
      return;
    }
    if (message.type === "pong") {
      connection.lastPongAt = nowMs();
      return;
    }
    if (message.type === "player:request_state") {
      const worldContext = this.getPublishedWorldContext();
      const position = this.ensurePlayerPosition(connection.player, worldContext, connection);
      this.sendBootstrap(connection, worldContext, position);
      this.sendReady(connection, worldContext, position);
      this.sendWorldPresenceSnapshot(connection, position);
      this.sendInitialWorldSnapshot(connection, worldContext);
      return;
    }
    if (message.type !== "player:move_intent" && message.type !== "player:position_intent" && message.type !== "player:input_state") {
      const payload = { code: "unknown_event", message: "Onbekend WebSocket event: " + message.type };
      send(connection.ws, eventMessage("error", payload, this.stampServerPayload(connection.worldId, payload)));
      return;
    }
    try {
      const inputPayload = message.payload || message;
      const updated = message.type === "player:input_state"
        ? this.applyInputState(connection, inputPayload, "ws")
        : this.applyPositionIntent(connection, inputPayload, "ws");
      if (updated && updated.ignored === true) {
        const payload = {
          ok: true,
          type: "player:input_ignored",
          reason: updated.ignoreReason || "stale_client_input_seq",
          clientSessionId: updated.client_session_id || inputPayload.clientSessionId || inputPayload.client_session_id || null,
          clientInputSeq: Number(updated.client_input_seq || inputPayload.inputSeq || inputPayload.clientInputSeq || 0) || 0,
          clientIntentId: inputPayload.clientIntentId || inputPayload.client_intent_id || null,
          controllerEpoch: Number(updated.controller_epoch) || 0,
          activeControllerSessionId: updated.active_controller_session_id || null,
          revision: Number(updated.revision) || 0,
          updatedAt: updated.updated_at || null,
          transport: updated.transport || (connection.ws && connection.ws.readyState === 1 ? "ws" : "http"),
          position: this.publicPositionForPlayer(updated, connection.session, connection.worldId)
        };
        send(connection.ws, eventMessage("player:input_ignored", payload, this.stampServerPayload(connection.worldId, payload)));
        // FIX: gethrottled loggen i.p.v. een DB INSERT per genegeerd bericht.
        if (EVENT_LOG_THROTTLE_MS === 0 || nowMs() - (connection.lastIgnoredEventLogAtMs || 0) >= EVENT_LOG_THROTTLE_MS) {
          connection.lastIgnoredEventLogAtMs = nowMs();
          this.recordEvent("player_input_ignored", connection.user.id, connection.player.id, connection.session.id);
        }
        return;
      }
      if (updated && updated.teleport === true) {
        this.recordEvent("player_teleport", connection.user.id, connection.player.id, connection.session.id);
      } else if (EVENT_LOG_THROTTLE_MS === 0 || nowMs() - (connection.lastInputEventLogAtMs || 0) >= EVENT_LOG_THROTTLE_MS) {
        // FIX: dit was een synchrone DB INSERT per input-bericht (tot 120/sec
        // per verbinding) en de grootste bron van oplopende serverlag.
        connection.lastInputEventLogAtMs = nowMs();
        this.recordEvent("player_input_state", connection.user.id, connection.player.id, connection.session.id);
      }
    } catch (error) {
      const payload = { code: "position_rejected", message: error.message || "Beweging geweigerd." };
      send(connection.ws, eventMessage("error", payload, this.stampServerPayload(connection.worldId, payload)));
    }
  }

  getPlayerSnapshotByConnection(connection) {
    const worldContext = this.getPublishedWorldContext();
    const profile = this.resolveConnectionProfile(connection, worldContext);
    const position = this.ensurePlayerPosition(profile, worldContext, connection);
    return {
      ok: true,
      userId: connection.user.id,
      sessionId: connection.session.id,
      playerId: connection.player.id,
      worldId: worldContext.worldId,
      activeSessionCount: this.authService.countActiveSessions(connection.user.id),
      connectedSessionCount: this.countConnectedSessions(connection.user.id),
      player: publicPlayer(profile),
      position: this.publicPositionForPlayer(position, connection.session, worldContext.worldId),
      spawn: spawnFromWorld(worldContext.world),
      type: "player:state"
    };
  }

  applyPositionIntent(connection, payload, transport = "ws") {
    const raw = payload && typeof payload === "object" ? payload : {};
    const positionLike = raw.position && typeof raw.position === "object" ? raw.position : raw.absolute && typeof raw.absolute === "object" ? raw.absolute : null;
    if (raw.teleport === true || positionLike) {
      const teleportPayload = {
        clientSessionId: raw.clientSessionId || raw.client_session_id || connection.session?.id || connection.id || null,
        inputSeq: raw.clientInputSeq || raw.inputSeq || raw.client_input_seq || 0,
        controllerEpoch: raw.controllerEpoch || raw.controller_epoch || 0,
        clientSentAt: raw.clientSentAt || raw.client_sent_at || null,
        clientIntentId: raw.clientIntentId || raw.client_intent_id || null,
        sourceDevice: raw.sourceDevice || raw.source_device || connection.sourceDevice || connection.session?.device_label || null,
        teleport: true,
        input: {
          moveX: 0,
          moveZ: 0,
          sprint: false,
          pointerTarget: null,
          stop: true
        }
      };
      return this.applyTeleportState(connection, Object.assign({}, teleportPayload, {
        position: positionLike || raw.position || raw.absolute || raw
      }), { transport: transport });
    }
    const inputPayload = {
      clientSessionId: raw.clientSessionId || raw.client_session_id || connection.session?.id || connection.id || null,
      inputSeq: raw.clientInputSeq || raw.inputSeq || raw.client_input_seq || 0,
      controllerEpoch: raw.controllerEpoch || raw.controller_epoch || 0,
      clientSentAt: raw.clientSentAt || raw.client_sent_at || null,
      clientIntentId: raw.clientIntentId || raw.client_intent_id || null,
      sourceDevice: raw.sourceDevice || raw.source_device || connection.sourceDevice || connection.session?.device_label || null,
      teleport: false,
      input: raw.input && typeof raw.input === "object" ? raw.input : {
        moveX: num(raw.moveX ?? raw.move_x ?? 0, 0),
        moveZ: num(raw.moveZ ?? raw.move_z ?? 0, 0),
        sprint: raw.sprint === true || raw.run === true,
        pointerTarget: normalizePointerTarget(raw.pointerTarget ?? raw.pointer_target ?? null),
        stop: raw.stop === true
      }
    };
    return this.applyInputState(connection, inputPayload, transport);
  }

  schedulePersist(positionRow, connection, immediate = false) {
    const key = positionKey(positionRow.player_id, positionRow.world_id);
    const existingTimer = this.persistTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.persistTimers.delete(key);
    }
    const flush = () => {
      this.persistTimers.delete(key);
      this.lastPersistAtMsByKey.set(key, nowMs());
      const current = this.playerStateCache.get(key) || positionRow;
      this.db.prepare(
        "INSERT INTO player_positions (player_id, world_id, x, y, z, rotation_y, revision, last_update_source_session_id, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(player_id, world_id) DO UPDATE SET x = excluded.x, y = excluded.y, z = excluded.z, rotation_y = excluded.rotation_y, revision = excluded.revision, last_update_source_session_id = excluded.last_update_source_session_id, updated_at = excluded.updated_at"
      ).run(current.player_id, current.world_id, current.x, current.y, current.z, current.rotation_y, current.revision, current.last_update_source_session_id, current.updated_at);
    };
    // FIX: tijdens continu bewegen werd de debounce-timer elke tick gereset
    // waardoor de positie pas na het stoppen werd opgeslagen. Nu schrijven we
    // sowieso elke PERSIST_MAX_INTERVAL_MS een keer weg.
    const lastPersistAt = Number(this.lastPersistAtMsByKey.get(key) || 0);
    if (lastPersistAt === 0) {
      this.lastPersistAtMsByKey.set(key, nowMs());
    }
    const overdue = lastPersistAt > 0 && (nowMs() - lastPersistAt) >= PERSIST_MAX_INTERVAL_MS;
    if (immediate || overdue) {
      flush();
      return;
    }
    const timer = setTimeout(flush, PERSIST_DEBOUNCE_MS);
    if (typeof timer.unref === "function") timer.unref();
    this.persistTimers.set(key, timer);
  }

  flushPlayerPosition(playerId, worldId) {
    const key = positionKey(playerId, worldId);
    const timer = this.persistTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.persistTimers.delete(key);
    }
    const state = this.playerStateCache.get(key);
    if (!state) return;
    this.schedulePersist(state, null, true);
  }

  closeConnection(connection, code = 1000, reason = "closed") {
    if (!connection || connection.closed) return;
    connection.closed = true;
    const ws = connection.ws;
    const userId = connection.user?.id || null;
    const sessionId = connection.session?.id || null;
    const playerId = connection.player?.id || null;
    const worldId = connection.worldId || null;
    const presenceRecord = playerId ? this.primaryPresenceByPlayerId.get(playerId) || null : null;
    if (playerId && worldId) {
      this.flushPlayerPosition(playerId, worldId);
    }
    if (worldId) {
      const worldSet = this.connectionsByWorldId.get(worldId);
      if (worldSet) {
        worldSet.delete(connection.id);
        if (worldSet.size === 0) this.connectionsByWorldId.delete(worldId);
      }
    }
    if (playerId) {
      const playerSet = this.connectionsByPlayerId.get(playerId);
      if (playerSet) {
        playerSet.delete(connection.id);
        if (playerSet.size === 0) this.connectionsByPlayerId.delete(playerId);
      }
    }
    if (sessionId) {
      const sessionSet = this.connectionsBySessionId.get(sessionId);
      if (sessionSet) {
        sessionSet.delete(connection.id);
        if (sessionSet.size === 0) this.connectionsBySessionId.delete(sessionId);
      }
    }
    if (userId) {
      const userSet = this.connectionsByUserId.get(userId);
      if (userSet) {
        userSet.delete(connection.id);
        if (userSet.size === 0) this.connectionsByUserId.delete(userId);
      }
    }
    const playerRemaining = playerId ? this.countConnectedPlayerSessions(playerId) : 0;
    if (playerId && worldId) {
      const currentState = this.playerStateCache.get(positionKey(playerId, worldId)) || null;
      const shouldStopMovement = Boolean(currentState && (playerRemaining === 0 || currentState.active_controller_session_id === sessionId));
      if (shouldStopMovement) {
        currentState.active_controller_session_id = null;
        currentState.moving = false;
        currentState.animation_state = "idle";
        currentState.velocity_x = 0;
        currentState.velocity_z = 0;
        currentState.updated_at = now();
        currentState.updated_at_ms = nowMs();
        this.playerStateCache.set(positionKey(playerId, worldId), currentState);
        this.updatePrimaryPresenceFromState(currentState, connection);
        this.markPlayerDirty(worldId, playerId);
        this.latestInputByPlayerId.set(playerId, {
          playerId: playerId,
          worldId: worldId,
          clientSessionId: sessionId || null,
          inputSeq: Number(currentState.last_processed_input_seq || 0) || 0,
          controllerEpoch: Number(currentState.controller_epoch || 0) || 0,
          input: {
            moveX: 0,
            moveZ: 0,
            sprint: false,
            pointerTarget: null,
            stop: true
          },
          clientSentAt: null,
          sourceDevice: null,
          receivedAtMs: nowMs(),
          activeControllerSessionId: null,
          teleport: false
        });
      }
      if (playerRemaining === 0) {
        this.discardQueuedRemoteBroadcast(playerId);
        this.broadcastRemotePlayerLeft(connection, presenceRecord);
        this.recordEvent("player_presence_left", userId || connection.session?.user_id || "", playerId, sessionId);
      } else if (presenceRecord) {
        this.primaryPresenceByPlayerId.set(playerId, Object.assign({}, presenceRecord, {
          connectedSessionCount: playerRemaining
        }));
      }
    }
    if (userId && sessionId) {
      const connectedSessions = this.connectedSessionIdsByUserId.get(userId);
      if (connectedSessions) {
        let hasSession = false;
        const sessionConnections = this.connectionsBySessionId.get(sessionId);
        if (sessionConnections && sessionConnections.size > 0) hasSession = true;
        if (!hasSession) {
          connectedSessions.delete(sessionId);
          if (connectedSessions.size === 0) this.connectedSessionIdsByUserId.delete(userId);
          this.broadcastPresence(userId, sessionId, false);
        }
      }
    }
    this.connectionsById.delete(connection.id);
    this.recordEvent("ws_disconnected", userId || connection.session?.user_id || "", playerId, sessionId);
    try {
      if (ws && ws.readyState === 1) ws.close(code, reason);
    } catch {}
  }

  tickHeartbeats() {
    const current = nowMs();
    for (const connection of this.connectionsById.values()) {
      if (connection.closed) continue;
      if (current - connection.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        const payload = { code: "heartbeat_timeout", message: "WebSocket heartbeat verlopen." };
        send(connection.ws, eventMessage("error", payload, this.stampServerPayload(connection.worldId, payload)));
        this.recordEvent("ws_heartbeat_timeout", connection.user.id, connection.player.id, connection.session.id);
        closeSocket(connection.ws, 4000, "Heartbeat timeout");
        this.closeConnection(connection, 4000, "heartbeat_timeout");
        continue;
      }
      if (current - connection.lastPingAt >= HEARTBEAT_INTERVAL_MS) {
        connection.lastPingAt = current;
        const payload = { ok: true, serverTime: now(), type: "ping" };
        send(connection.ws, eventMessage("ping", payload, this.stampServerPayload(connection.worldId, payload)));
      }
    }
  }

  handleUpgrade(req, socket, head) {
    let sessionContext = null;
    try {
      sessionContext = this.getSessionContextFromRequest(req);
    } catch (error) {
      const message = "HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n" + error.message;
      try {
        socket.write(message);
      } catch {}
      try {
        socket.destroy();
      } catch {}
      return;
    }
    req.gkSessionContext = sessionContext;
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      ws._gkSessionContext = sessionContext;
      this.wss.emit("connection", ws, req);
    });
  }

  getCurrentSessionState(req) {
    return this.getPlayerSnapshot(req, { createdProfile: false });
  }

  getPlayerSummary(req) {
    const snapshot = this.getPlayerSnapshot(req, { createdProfile: false });
    return {
      ok: true,
      user: snapshot.user,
      session: snapshot.session,
      player: snapshot.player,
      position: snapshot.position,
      activeSessionCount: snapshot.activeSessionCount,
      connectedSessionCount: snapshot.connectedSessionCount
    };
  }

  getAuthMeSnapshot(req) {
    const sessionContext = this.getSessionContextFromRequest(req);
    this.authService.touchSession(sessionContext.session.id, false);
    let profile = this.db.prepare("SELECT * FROM player_profiles WHERE user_id = ? LIMIT 1").get(sessionContext.user.id);
    let position = null;
    let worldId = null;
    let spawn = null;
    let gameWorld = null;
    try {
      const worldContext = this.getPublishedWorldContext();
      worldId = worldContext.worldId;
      spawn = spawnFromWorld(worldContext.world);
      gameWorld = worldContext.world;
      if (profile) {
        position = this.db.prepare("SELECT * FROM player_positions WHERE player_id = ? AND world_id = ? LIMIT 1")
          .get(profile.id, worldId);
        if (!position && profile.current_world_id && profile.current_world_id !== worldId) {
          position = this.db.prepare("SELECT * FROM player_positions WHERE player_id = ? AND world_id = ? LIMIT 1")
            .get(profile.id, profile.current_world_id);
        }
      }
    } catch {
      // No published world yet. me should still work and just omit player state.
    }
    return {
      ok: true,
      user: this.authService.publicUser(sessionContext.user),
      session: publicSession(sessionContext.session),
      activeSessionCount: this.authService.countActiveSessions(sessionContext.user.id),
      connectedSessionCount: this.countConnectedSessions(sessionContext.user.id),
      player: publicPlayer(profile),
      position: position ? this.publicPositionForPlayer(position, sessionContext.session, worldId || profile?.current_world_id || "main_world") : null,
      spawn: spawn,
      gameWorld: gameWorld,
      worldId: worldId || profile?.current_world_id || null
    };
  }
}
