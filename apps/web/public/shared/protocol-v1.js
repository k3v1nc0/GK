// F2-E2-T01: versiebeheerd WebSocket-protocol gk-mmo-v1 (gedeeld door browser en server).
//
// Verbinden:
// 1. POST /api/game/join-ticket (cookie + exacte Origin + CSRF) -> { ticket } (eenmalig, 5 s geldig).
// 2. new WebSocket("/ws/game", "gk-mmo-v1") (same-origin; de server controleert Origin en cookie).
// 3. Eerste bericht binnen 5 s: { type: "auth", v: 1, ticket }.
// 4. Daarna dezelfde berichten als de legacyroute /api/game/live (die blijft tot F6 bestaan).

export const PROTOCOL_NAME = "gk-mmo-v1";
export const PROTOCOL_VERSION = 1;
export const WS_PATH = "/ws/game";
export const JOIN_TICKET_PATH = "/api/game/join-ticket";
export const JOIN_TICKET_TTL_MS = 5000;
export const AUTH_TIMEOUT_MS = 5000;
export const MAX_MESSAGE_BYTES = 64 * 1024;

// Gedocumenteerde sluitcodes.
export const CLOSE_CODES = Object.freeze({
  MESSAGE_TOO_BIG: 1009, // door de ws-bibliotheek bij > 64 KiB
  BAD_MESSAGE: 4400,
  UNAUTHORIZED: 4401,
  FORBIDDEN_ORIGIN: 4403,
  UNSUPPORTED_VERSION: 4406,
  RATE_LIMIT: 4408,
  AUTH_TIMEOUT: 4410,
  LEASE_FENCED: 4409
});

export const CLIENT_MESSAGE_TYPES = Object.freeze([
  "auth",
  "ping",
  "pong",
  "player:request_state",
  "player:move_intent",
  "player:position_intent",
  "player:input_state"
]);

const CLIENT_TYPE_SET = new Set(CLIENT_MESSAGE_TYPES);
const encoder = new TextEncoder();

function utf8Length(text) {
  return encoder.encode(text).length;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalNumber(value) {
  return value === undefined || value === null || isFiniteNumber(value);
}

function optionalPoint(value) {
  if (value === undefined || value === null) return true;
  return typeof value === "object" && isFiniteNumber(value.x) && isFiniteNumber(value.z);
}

// Schemacontrole van een clientbericht. Geeft { ok: true, message } of { ok: false, code, reason }.
export function validateClientMessage(raw) {
  const text = typeof raw === "string" ? raw : (raw && typeof raw.toString === "function" ? raw.toString("utf8") : "");
  if (utf8Length(text) > MAX_MESSAGE_BYTES) {
    return { ok: false, code: CLOSE_CODES.MESSAGE_TOO_BIG, reason: "message_too_big" };
  }
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return { ok: false, code: CLOSE_CODES.BAD_MESSAGE, reason: "invalid_json" };
  }
  if (!message || typeof message !== "object" || Array.isArray(message) || typeof message.type !== "string") {
    return { ok: false, code: CLOSE_CODES.BAD_MESSAGE, reason: "missing_type" };
  }
  if (!CLIENT_TYPE_SET.has(message.type)) {
    return { ok: false, code: CLOSE_CODES.BAD_MESSAGE, reason: "unknown_type" };
  }
  if (message.type === "auth") {
    if (message.v !== PROTOCOL_VERSION) return { ok: false, code: CLOSE_CODES.UNSUPPORTED_VERSION, reason: "unsupported_version" };
    if (typeof message.ticket !== "string" || message.ticket.length < 16 || message.ticket.length > 256) {
      return { ok: false, code: CLOSE_CODES.UNAUTHORIZED, reason: "invalid_ticket" };
    }
  }
  if (message.type === "player:input_state" || message.type === "player:move_intent") {
    const input = message.payload?.input || message.payload || {};
    if (!optionalNumber(input.moveX) || !optionalNumber(input.moveZ) || !optionalPoint(input.pointerTarget)) {
      return { ok: false, code: CLOSE_CODES.BAD_MESSAGE, reason: "invalid_input" };
    }
  }
  return { ok: true, message };
}

// Kiest het subprotocol bij de upgrade; null = weigeren.
export function selectProtocol(offered) {
  const list = Array.isArray(offered) ? offered : Array.from(offered || []);
  return list.includes(PROTOCOL_NAME) ? PROTOCOL_NAME : null;
}
