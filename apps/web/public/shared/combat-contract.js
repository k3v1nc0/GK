export const COMBAT_PROTOCOL_VERSION = 1;

export const COMBAT_ERROR_CODES = Object.freeze({
  ABILITY_NOT_UNLOCKED: "ABILITY_NOT_UNLOCKED",
  ABILITY_ON_COOLDOWN: "ABILITY_ON_COOLDOWN",
  ABILITY_RESOURCE_INSUFFICIENT: "ABILITY_RESOURCE_INSUFFICIENT",
  TARGET_INVALID: "TARGET_INVALID",
  TARGET_OUT_OF_RANGE: "TARGET_OUT_OF_RANGE",
  TARGET_LINE_OF_SIGHT_BLOCKED: "TARGET_LINE_OF_SIGHT_BLOCKED",
  ENTITY_DEAD: "ENTITY_DEAD",
  ABILITY_FORMULA_INVALID: "ABILITY_FORMULA_INVALID"
});

export const ENTITY_STATES = Object.freeze({
  ALIVE: "alive",
  DEAD: "dead",
  DESPAWNED: "despawned",
  DEPLETED: "depleted",
  AVAILABLE: "available"
});

export function clampDamage(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.round(number * 1000) / 1000);
}

export function distance2d(a, b) {
  const ax = Number(a?.x);
  const az = Number(a?.z);
  const bx = Number(b?.x);
  const bz = Number(b?.z);
  if (![ax, az, bx, bz].every(Number.isFinite)) return Infinity;
  return Math.hypot(ax - bx, az - bz);
}
