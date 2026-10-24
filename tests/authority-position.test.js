import assert from "node:assert/strict";
import { test } from "node:test";
import { assertClientMovementIntent, publicRemotePlayerSnapshot, publicRemoteStateChange } from "../src/server/mmo-service.js";

test("absolute HTTP/WS positie en teleport worden geweigerd", function () {
  for (const payload of [
    { teleport: true, x: 999, z: 999 },
    { position: { x: 999, z: 999 } },
    { absolute: { x: 999, z: 999 } },
    { input: { stop: true }, clientPredictedPosition: { x: 999, z: 999 } }
  ]) {
    assert.throws(() => assertClientMovementIntent(payload), { code: "INPUT_REJECTED" });
  }
  assert.equal(assertClientMovementIntent({ input: { moveX: 1, moveZ: 0, stop: false } }), true);
  assert.equal(assertClientMovementIntent({ input: { moveX: 0, moveZ: 0, stop: true } }), true);
});

test("remote snapshots bevatten geen account-, sessie- of device-identiteit", function () {
  const profile = { id: "player_public", user_id: "user_private", display_name: "Visible", selected_character_id: "private_catalog_id" };
  const position = {
    player_id: "player_public", world_id: "world", x: 1, y: 0, z: 2, rotation_y: 0,
    revision: 3, updated_at: "now", animation_state: "idle", moving: false,
    last_update_source_session_id: "session_private", active_controller_session_id: "session_private",
    client_sent_at: 123, server_received_at: 124
  };
  const snapshot = publicRemotePlayerSnapshot(profile, position, 1, "world");
  const changed = publicRemoteStateChange(position, { user_id: "user_private", device_label: "private device" }, "world");
  const serialized = JSON.stringify({ snapshot, changed });
  for (const secret of ["user_private", "session_private", "private_catalog_id", "private device"]) {
    assert.equal(serialized.includes(secret), false, secret + " lekt niet naar remote payload");
  }
  assert.equal(snapshot.playerId, "player_public");
  assert.equal(snapshot.displayName, "Visible");
});
