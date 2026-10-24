// F2-E2-T06: contract voor kritieke operaties (loot, quest, economie).
//
// Regels:
// - Een operationId hoort bij precies een speler en een genormaliseerde payload (request_hash).
// - Gelijke ID + gelijke payload + zelfde speler: hetzelfde receipt terug, niets opnieuw uitgevoerd.
// - Gelijke ID met andere payload of andere speler: 409, niets uitgevoerd.
// - Het werk, de receipt en de status 'completed' staan in een SQLite-transactie (BEGIN IMMEDIATE).
//   Een ACK (de response) bestaat pas na COMMIT. Bij een fout: ROLLBACK, dus nul receipts.
// - Synchroon (DatabaseSync): geen async en geen worker nodig.
//
// Bestaande tabel: operation_idempotency (migratie 006).

export const OPERATION_ERROR = Object.freeze({
  PAYLOAD_MISMATCH: "OPERATION_PAYLOAD_MISMATCH",
  OTHER_PLAYER: "OPERATION_OTHER_PLAYER",
  IN_PROGRESS: "OPERATION_IN_PROGRESS",
  MISSING_ID: "OPERATION_ID_MISSING"
});

// F2-E2-T04: optionele meetput (label, duur in ms) voor schrijfkosten per operatie.
let metricsSink = null;
export function setOperationMetricsSink(fn) {
  metricsSink = typeof fn === "function" ? fn : null;
}

function isoNow() {
  return new Date().toISOString();
}

function conflict(message, code) {
  const error = new Error(message);
  error.status = 409;
  error.code = code;
  return error;
}

function parseResult(text, fallback) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function findOperationReceipt(db, operationId) {
  return db.prepare("SELECT * FROM operation_idempotency WHERE operation_id = ? LIMIT 1").get(operationId) || null;
}

// Geeft een eerder receipt terug (met idempotent: true), of null als de operatie nog niet bestaat.
export function replayOperation(db, { operationId, playerId, requestHash, label = "Deze actie" }) {
  if (!operationId) throw conflict("Operation-ID ontbreekt.", OPERATION_ERROR.MISSING_ID);
  const existing = findOperationReceipt(db, operationId);
  if (!existing) return null;
  if (existing.player_id && playerId && existing.player_id !== playerId) {
    throw conflict("Operation-ID hoort bij een andere speler.", OPERATION_ERROR.OTHER_PLAYER);
  }
  if (existing.request_hash !== requestHash) {
    throw conflict("Operation-ID is al gebruikt met een andere payload.", OPERATION_ERROR.PAYLOAD_MISMATCH);
  }
  if (existing.status === "completed") {
    return Object.assign({ idempotent: true }, parseResult(existing.result_json, { ok: true, operationId }));
  }
  throw conflict(label + " is al in verwerking.", OPERATION_ERROR.IN_PROGRESS);
}

// Voert perform() uit in een transactie samen met de receipt. buildResponse(result) maakt de ACK.
// faultHook(stage) is alleen voor tests: "after_perform" (voor COMMIT) en "after_commit".
export function commitOperation(db, { operationId, playerId, operationType, requestHash, perform, buildResponse, faultHook = null }) {
  if (!operationId) throw conflict("Operation-ID ontbreekt.", OPERATION_ERROR.MISSING_ID);
  const startedAt = performance.now();
  db.exec("BEGIN IMMEDIATE");
  let committed = false;
  try {
    db.prepare(`
      INSERT INTO operation_idempotency (operation_id, player_id, operation_type, request_hash, status, created_at)
      VALUES (?, ?, ?, ?, 'started', ?)
    `).run(operationId, playerId || null, operationType || "unknown", requestHash, isoNow());
    const result = perform();
    const response = typeof buildResponse === "function"
      ? buildResponse(result)
      : Object.assign({ ok: true, operationId }, result);
    db.prepare(`
      UPDATE operation_idempotency
      SET status = 'completed', result_json = ?, completed_at = ?
      WHERE operation_id = ?
    `).run(JSON.stringify(response), isoNow(), operationId);
    if (faultHook) faultHook("after_perform");
    db.exec("COMMIT");
    committed = true;
    if (metricsSink) {
      try { metricsSink("operation:" + (operationType || "unknown"), performance.now() - startedAt); } catch {}
    }
    if (faultHook) faultHook("after_commit");
    return response;
  } catch (error) {
    if (!committed) {
      try { db.exec("ROLLBACK"); } catch {}
    }
    throw error;
  }
}

// Replay of uitvoeren in een aanroep. beforeCommit() draait na de replaycheck en voor de transactie
// (bijv. een cooldown), zodat een herhaalde operatie geen cooldown verbruikt.
export function runOperation(db, options) {
  const replay = replayOperation(db, options);
  if (replay) return replay;
  if (typeof options.beforeCommit === "function") options.beforeCommit();
  return commitOperation(db, options);
}
