// F2-E3-T01: attack, gather en pickup zijn intenties. De client zegt alleen WAT hij wil (actie + doel);
// de server beslist over bereik (live serverpositie), cooldown, damage, loot en XP (node03-runtime-service).
// Velden waarmee een client uitkomsten zou kunnen voorschrijven worden expliciet geweigerd.

// Fase 5: "skill" = een vaardigheid van vak 2 of 3 (doel mag leeg: de server kiest dan zelf).
export const COMBAT_INTENT_ACTIONS = new Set(["attack", "gather", "pickup", "skill"]);

// Velden die alleen de server mag bepalen.
const FORBIDDEN_INTENT_FIELDS = [
  "damage", "amount", "quantity", "healthCurrent", "health", "hp",
  "position", "x", "y", "z", "targetPosition", "playerPosition", "distance", "range",
  "loot", "grants", "items", "itemId", "xp", "currency", "currencyId", "gold",
  "questProgress", "progress", "critical", "killed", "dead"
];

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

export function isCombatIntent(action) {
  return COMBAT_INTENT_ACTIONS.has(String(action || "").trim().toLowerCase());
}

// Geeft de schone intentie terug ({ action, targetId, operationId }) of gooit 400 bij een vervalst veld.
export function sanitizeCombatIntent(action, payload = {}) {
  const normalizedAction = String(action || "").trim().toLowerCase();
  if (!COMBAT_INTENT_ACTIONS.has(normalizedAction)) {
    const error = new Error("Geen gevechtsintentie: " + normalizedAction);
    error.status = 400;
    error.code = "NOT_A_COMBAT_INTENT";
    throw error;
  }
  const forged = FORBIDDEN_INTENT_FIELDS.filter((key) => hasValue(payload?.[key]));
  if (forged.length) {
    const error = new Error("De server bepaalt dit zelf; niet meesturen: " + forged.join(", ") + ".");
    error.status = 400;
    error.code = "CLIENT_AUTHORITY_FIELD";
    error.details = { fields: forged };
    throw error;
  }
  const targetId = typeof payload?.targetId === "string" ? payload.targetId.trim() : "";
  if (normalizedAction === "skill") {
    const slot = Number(payload?.slot);
    if (slot !== 2 && slot !== 3) {
      const error = new Error("Kies vak 2 of 3.");
      error.status = 400;
      error.code = "SLOT_INVALID";
      throw error;
    }
    const intent = { action: normalizedAction, slot, targetId: targetId || null };
    const operationId = payload?.operationId || payload?.operation_id;
    if (hasValue(operationId)) intent.operationId = String(operationId);
    return intent;
  }
  if (!targetId) {
    const error = new Error("Doel ontbreekt.");
    error.status = 400;
    error.code = "TARGET_MISSING";
    throw error;
  }
  const intent = { action: normalizedAction, targetId };
  const operationId = payload?.operationId || payload?.operation_id;
  if (hasValue(operationId)) intent.operationId = String(operationId);
  return intent;
}
