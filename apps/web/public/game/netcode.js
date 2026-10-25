import { resolveMovement } from "../shared/movement-kernel.js";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clonePoint(value) {
  if (!value || typeof value !== "object") return null;
  return { x: finite(value.x), z: finite(value.z) };
}

function clonePosition(value) {
  if (!value || typeof value !== "object") return null;
  return {
    x: finite(value.x),
    y: finite(value.y),
    z: finite(value.z),
    rotationY: finite(value.rotationY)
  };
}

export function normalizeBufferedInput(entry) {
  const seq = Math.max(0, Math.floor(finite(entry?.seq)));
  if (!seq) return null;
  return {
    seq,
    position: clonePosition(entry.position),
    input: entry.input && typeof entry.input === "object" ? {
      moveX: Math.max(-1, Math.min(1, finite(entry.input.moveX))),
      moveZ: Math.max(-1, Math.min(1, finite(entry.input.moveZ))),
      sprint: entry.input.sprint === true,
      pointerTarget: clonePoint(entry.input.pointerTarget),
      pathPoint: clonePoint(entry.input.pathPoint),
      settle: entry.input.settle === true,
      stop: entry.input.stop === true
    } : null,
    moving: entry.moving === true,
    animationState: String(entry.animationState || "idle"),
    sentAt: finite(entry.sentAt, Date.now()),
    controllerEpoch: Math.max(0, Math.floor(finite(entry.controllerEpoch))),
    clientSessionId: entry.clientSessionId || null,
    clientIntentId: entry.clientIntentId || null
  };
}

export function appendBufferedInput(buffer, entry, options = {}) {
  const normalized = normalizeBufferedInput(entry);
  const now = finite(options.now, Date.now());
  const ttlMs = Math.max(100, finite(options.ttlMs, 2000));
  const limit = Math.max(1, Math.floor(finite(options.limit, 60)));
  const next = (Array.isArray(buffer) ? buffer : []).filter(function (item) {
    return item && finite(item.seq) > 0 && finite(item.sentAt) >= now - ttlMs;
  });
  if (normalized) next.push(normalized);
  next.sort(function (left, right) { return left.seq - right.seq; });
  return next.slice(-limit);
}

export function acknowledgeBufferedInputs(buffer, lastProcessedInputSeq) {
  const ack = Math.max(0, Math.floor(finite(lastProcessedInputSeq)));
  if (!ack) return Array.isArray(buffer) ? buffer.slice() : [];
  return (Array.isArray(buffer) ? buffer : []).filter(function (entry) {
    return finite(entry?.seq) > ack;
  });
}

// Replay the unacknowledged part of the local route from the authoritative ACK.
// Recorded position deltas preserve turns and fixed client steps; every delta is
// resolved by the shared movement kernel (or the runtime wrapper around that same kernel).
export function replayBufferedInputs(authoritative, ackedInput, pendingInputs, options = {}) {
  let replayed = clonePosition(authoritative);
  const ackedPosition = clonePosition(ackedInput?.position);
  if (!replayed || !ackedPosition) return replayed;
  let previousRecorded = ackedPosition;
  const resolve = typeof options.resolve === "function"
    ? options.resolve
    : function (start, desired) { return resolveMovement(start, desired, options.movementOptions || {}); };
  const ordered = (Array.isArray(pendingInputs) ? pendingInputs : []).slice().sort(function (left, right) {
    return finite(left?.seq) - finite(right?.seq);
  });
  for (const entry of ordered) {
    const recorded = clonePosition(entry?.position);
    if (!recorded) continue;
    const desired = {
      x: replayed.x + (recorded.x - previousRecorded.x),
      y: replayed.y + (recorded.y - previousRecorded.y),
      z: replayed.z + (recorded.z - previousRecorded.z)
    };
    const resolved = resolve(replayed, desired, options.movementOptions || {});
    replayed = Object.assign({}, replayed, clonePosition(resolved) || desired, { rotationY: recorded.rotationY });
    previousRecorded = recorded;
  }
  return replayed;
}

export function boundRemoteInterpolationSamples(samples, options = {}) {
  const nowEpoch = finite(options.nowEpoch, Date.now());
  const ttlMs = Math.max(100, finite(options.ttlMs, 2000));
  const limit = Math.max(2, Math.floor(finite(options.limit, 32)));
  const timeline = typeof options.timeline === "function"
    ? options.timeline
    : function (sample) { return finite(sample?.serverTimeMs || sample?.receivedAtEpoch); };
  const ordered = (Array.isArray(samples) ? samples : []).filter(function (sample) {
    return sample && sample.position;
  }).sort(function (left, right) { return timeline(left) - timeline(right); });
  if (!ordered.length) return [];
  const recent = ordered.filter(function (sample, index) {
    return index === ordered.length - 1 || timeline(sample) >= nowEpoch - ttlMs;
  });
  return recent.slice(-limit);
}
