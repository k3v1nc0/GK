import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionCooldowns, assertDeveloperActionAllowed, assertIdempotencyMatch, normalizedActionPayloadHash } from "../src/server/action-security.js";

test("debug/reset vereist admin en expliciete dev-flag", function () {
  const previous = process.env.DEV_GAME_ACTIONS;
  try {
    delete process.env.DEV_GAME_ACTIONS;
    assert.throws(() => assertDeveloperActionAllowed({ sessionContext: { user: { role: "player" } } }), { code: "DEBUG_ACTION_FORBIDDEN" });
    assert.throws(() => assertDeveloperActionAllowed({ sessionContext: { user: { role: "admin" } } }), { code: "DEBUG_ACTION_FORBIDDEN" });
    process.env.DEV_GAME_ACTIONS = "1";
    assert.equal(assertDeveloperActionAllowed({ sessionContext: { user: { role: "admin" } } }), true);
  } finally {
    if (previous === undefined) delete process.env.DEV_GAME_ACTIONS;
    else process.env.DEV_GAME_ACTIONS = previous;
  }
});

test("dezelfde operation-ID met andere volledige payload geeft 409", function () {
  const first = normalizedActionPayloadHash("debug_currency_add", { operationId: "same", currencyId: "gold", amount: 10, nested: { b: 2, a: 1 } });
  const reordered = normalizedActionPayloadHash("debug_currency_add", { nested: { a: 1, b: 2 }, amount: 10, operation_id: "same", currencyId: "gold" });
  const changed = normalizedActionPayloadHash("debug_currency_add", { operationId: "same", currencyId: "gold", amount: 11, nested: { a: 1, b: 2 } });
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
  assert.throws(() => assertIdempotencyMatch({ request_hash: first }, changed), { code: "OPERATION_PAYLOAD_MISMATCH" });
});

test("tien aanvallen in een seconde blijven binnen servercooldown", function () {
  let now = 0;
  const cooldowns = new ActionCooldowns(() => now);
  let accepted = 0;
  for (let index = 0; index < 10; index += 1) {
    now = index * 100;
    try {
      cooldowns.consume("player:attack", 250);
      accepted += 1;
    } catch (error) {
      assert.equal(error.code, "ACTION_COOLDOWN");
    }
  }
  assert.equal(accepted, 4);
});
