// F2-E2-T03: cell-AOI en backpressure (pure logica, geen WebSocket-import).
//
// - Actors worden per cel van 64 m geindexeerd.
// - Tiers: self (20 Hz), near = zelfde of aangrenzende cel (10 Hz), far = binnen farCells (2 Hz),
//   daarbuiten: geen payload.
// - Per ontvanger een begrensde wachtrij: beweging wordt samengevoegd (laatste stand per actor wint),
//   kritieke events (spawn/despawn/loot/quest) gaan nooit verloren. Een socket die boven
//   maxBufferedBytes blijft, moet worden afgesloten (shouldDisconnect).
// - publicActorState laat privacyvelden weg.

export const DEFAULT_CELL_SIZE = 64;
export const TIER = Object.freeze({ SELF: "self", NEAR: "near", FAR: "far", NONE: "none" });
export const TIER_RATE_HZ = Object.freeze({ self: 20, near: 10, far: 2, none: 0 });
export const MAX_BUFFERED_BYTES = 512 * 1024;

const PRIVATE_FIELDS = new Set([
  "user_id", "userId", "session_id", "sessionId", "client_session_id", "clientSessionId",
  "active_controller_session_id", "activeControllerSessionId", "last_update_source_session_id",
  "source_device", "sourceDevice", "email", "ip", "device_label", "deviceLabel"
]);

export function cellFor(x, z, cellSize = DEFAULT_CELL_SIZE) {
  return { cx: Math.floor(Number(x) / cellSize), cz: Math.floor(Number(z) / cellSize) };
}

export function cellKey(cell) {
  return cell.cx + ":" + cell.cz;
}

export function createInterestIndex({ cellSize = DEFAULT_CELL_SIZE, farCells = 2 } = {}) {
  const cellByActor = new Map();
  const actorsByCell = new Map();

  function remove(actorId) {
    const key = cellByActor.get(actorId);
    if (!key) return;
    const set = actorsByCell.get(key);
    if (set) {
      set.delete(actorId);
      if (!set.size) actorsByCell.delete(key);
    }
    cellByActor.delete(actorId);
  }

  return {
    cellSize,
    farCells,
    update(actorId, x, z) {
      const key = cellKey(cellFor(x, z, cellSize));
      if (cellByActor.get(actorId) === key) return false;
      remove(actorId);
      cellByActor.set(actorId, key);
      if (!actorsByCell.has(key)) actorsByCell.set(key, new Set());
      actorsByCell.get(key).add(actorId);
      return true;
    },
    remove,
    cellOf(actorId) {
      return cellByActor.get(actorId) || null;
    },
    tierBetween(viewerId, actorId) {
      if (viewerId === actorId) return TIER.SELF;
      const a = cellByActor.get(viewerId);
      const b = cellByActor.get(actorId);
      if (!a || !b) return TIER.NONE;
      const [ax, az] = a.split(":").map(Number);
      const [bx, bz] = b.split(":").map(Number);
      const distance = Math.max(Math.abs(ax - bx), Math.abs(az - bz));
      if (distance <= 1) return TIER.NEAR;
      if (distance <= farCells) return TIER.FAR;
      return TIER.NONE;
    },
    // Alle actors binnen farCells rond de kijker (zonder de hele wereld te doorlopen).
    actorsAround(viewerId) {
      const key = cellByActor.get(viewerId);
      if (!key) return [];
      const [cx, cz] = key.split(":").map(Number);
      const out = [];
      for (let dx = -farCells; dx <= farCells; dx++) {
        for (let dz = -farCells; dz <= farCells; dz++) {
          const set = actorsByCell.get((cx + dx) + ":" + (cz + dz));
          if (set) for (const id of set) out.push(id);
        }
      }
      return out;
    },
    size() {
      return cellByActor.size;
    }
  };
}

// Mag een update voor deze tier nu naar deze kijker? lastSentAtMs per (kijker, actor) bijhouden.
export function dueForTier(tier, nowMs, lastSentAtMs) {
  const hz = TIER_RATE_HZ[tier] || 0;
  if (hz <= 0) return false;
  if (!Number.isFinite(lastSentAtMs)) return true;
  return nowMs - lastSentAtMs >= Math.floor(1000 / hz) - 1;
}

// Filtert een lijst actorstates per kijker op tier en frequentie. sentAt is een Map "viewer|actor" -> ms.
export function selectForViewer(index, viewerId, states, nowMs, sentAt) {
  const out = [];
  for (const state of states) {
    const actorId = state?.player_id || state?.playerId || state?.id;
    if (!actorId) continue;
    const tier = index.tierBetween(viewerId, actorId);
    if (tier === TIER.NONE) continue;
    const key = viewerId + "|" + actorId;
    if (!dueForTier(tier, nowMs, sentAt.get(key))) continue;
    sentAt.set(key, nowMs);
    out.push(state);
  }
  return out;
}

export function publicActorState(state) {
  if (!state || typeof state !== "object") return state;
  const out = {};
  for (const [key, value] of Object.entries(state)) if (!PRIVATE_FIELDS.has(key)) out[key] = value;
  return out;
}

// Begrensde wachtrij per ontvanger.
export function createOutboundQueue({ maxMovementActors = 512, maxCritical = 1024 } = {}) {
  const movement = new Map();
  const critical = [];
  let overflowed = false;
  return {
    pushMovement(actorId, state) {
      if (!movement.has(actorId) && movement.size >= maxMovementActors) {
        overflowed = true;
        return false;
      }
      movement.delete(actorId);
      movement.set(actorId, state);
      return true;
    },
    pushCritical(event) {
      if (critical.length >= maxCritical) {
        overflowed = true;
        return false;
      }
      critical.push(event);
      return true;
    },
    // Kritieke events eerst, in volgorde; daarna de laatste stand per actor.
    drain() {
      const out = { critical: critical.splice(0), movement: Array.from(movement.values()) };
      movement.clear();
      return out;
    },
    size() {
      return critical.length + movement.size;
    },
    overflowed() {
      return overflowed;
    }
  };
}

export function shouldDisconnect(bufferedAmount, queue = null, maxBufferedBytes = MAX_BUFFERED_BYTES) {
  return Number(bufferedAmount) > maxBufferedBytes || Boolean(queue && queue.overflowed());
}
