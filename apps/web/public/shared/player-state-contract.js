export const PLAYER_STATE_SCHEMA_VERSION = "gk-player-state-v1";

export const INVENTORY_LOCATION_TYPES = Object.freeze(["inventory", "equipment", "escrow", "mail", "deleted"]);
export const BIND_STATES = Object.freeze(["unbound", "bound", "character_bound", "account_bound", "quest_bound"]);

export const MUTATION_ERROR_CODES = Object.freeze({
  OPERATION_ID_REUSED_DIFFERENT_REQUEST: "OPERATION_ID_REUSED_DIFFERENT_REQUEST",
  INVENTORY_FULL: "INVENTORY_FULL",
  ITEM_NOT_OWNED: "ITEM_NOT_OWNED",
  ITEM_BOUND: "ITEM_BOUND",
  ITEM_NOT_EQUIPPABLE: "ITEM_NOT_EQUIPPABLE",
  EQUIPMENT_SLOT_INVALID: "EQUIPMENT_SLOT_INVALID",
  CURRENCY_INSUFFICIENT: "CURRENCY_INSUFFICIENT",
  LOOT_NOT_OWNED: "LOOT_NOT_OWNED",
  LOOT_ALREADY_CLAIMED: "LOOT_ALREADY_CLAIMED",
  RESOURCE_UNAVAILABLE: "RESOURCE_UNAVAILABLE",
  RESOURCE_REQUIREMENT_MISSING: "RESOURCE_REQUIREMENT_MISSING"
});

export function normalizeMinorUnits(value, fallback = 0) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeQuantity(value, fallback = 1) {
  return Math.max(0, normalizeMinorUnits(value, fallback));
}

export function revisionBump(value) {
  return Math.max(1, Math.floor(Number(value) || 0) + 1);
}
