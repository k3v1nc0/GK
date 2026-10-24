import crypto from "node:crypto";

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (key === "operationId" || key === "operation_id") continue;
    result[key] = normalize(value[key]);
  }
  return result;
}

export function normalizedActionPayloadHash(action, payload) {
  const canonical = normalize(Object.assign({}, payload || {}, { action: String(action || "").trim().toLowerCase() }));
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function assertIdempotencyMatch(existing, requestHash) {
  if (!existing) return;
  if (existing.request_hash !== requestHash) {
    const error = new Error("Operation-ID is al gebruikt met een andere payload.");
    error.status = 409;
    error.code = "OPERATION_PAYLOAD_MISMATCH";
    throw error;
  }
}

// Debug- en resetacties: alleen voor een admin-account én met DEV_GAME_ACTIONS=1 op de server (Fase 01).
export function developerActionsAllowed(ctx) {
  return ctx?.sessionContext?.user?.role === "admin" && process.env.DEV_GAME_ACTIONS === "1";
}

export function assertDeveloperActionAllowed(ctx) {
  if (developerActionsAllowed(ctx)) return true;
  const error = new Error("Debug- en resetacties zijn niet beschikbaar (alleen voor een admin-account, met DEV_GAME_ACTIONS=1 op de server).");
  error.status = 403;
  error.code = "DEBUG_ACTION_FORBIDDEN";
  throw error;
}

export class ActionCooldowns {
  constructor(clock = () => Date.now()) {
    this.clock = clock;
    this.lastAcceptedAt = new Map();
  }

  consume(key, cooldownMs) {
    const now = Number(this.clock());
    const interval = Math.max(0, Number(cooldownMs) || 0);
    const previous = this.lastAcceptedAt.get(key);
    if (interval > 0 && Number.isFinite(previous) && now - previous < interval) {
      const error = new Error("Actie is nog in cooldown.");
      error.status = 429;
      error.code = "ACTION_COOLDOWN";
      error.retryAfterMs = Math.max(1, interval - (now - previous));
      throw error;
    }
    this.lastAcceptedAt.set(key, now);
    return true;
  }
}
