// Verbinding (3-11): Instellingen > Verbinding (MMO). Custom + 7 standaarden; de waarden komen in world.mmo.network
// (game en server lezen die). Zonder kaart blijft network null = de eigen standaard van game en server.
import test from "node:test";
import assert from "node:assert/strict";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { NETWORK_KINDS, NETWORK_PRESETS, NETWORK_PRESET_ORDER, NETWORK_PRESET_REASONS, networkValues } from "../src/shared/authoring/kinds/network.js";

test("Verbinding: Custom + 7 standaarden, elk met een reden en alleen bestaande schuiven", () => {
  assert.equal(NETWORK_PRESET_ORDER.length, 8);
  assert.equal(Object.keys(NETWORK_PRESETS).length, 7);
  const fields = NETWORK_KINDS.network_settings.fields;
  for (const id of NETWORK_PRESET_ORDER) assert.ok(NETWORK_PRESET_REASONS[id]?.length > 20, id + " heeft een reden");
  for (const [id, values] of Object.entries(NETWORK_PRESETS)) {
    for (const [key, value] of Object.entries(values)) {
      assert.ok(fields[key], id + ": onbekende schuif " + key);
      assert.ok(value >= fields[key].min && value <= fields[key].max, id + "." + key + " buiten min/max");
    }
    assert.equal(validateDocument("network_settings", Object.assign({ networkPreset: id }, values)).ok, true, id + " is geldig");
  }
});

test("Verbinding: standaard wint, Custom gebruikt de schuiven, input en updates nooit boven de server-ticks", () => {
  const smooth = networkValues({ networkPreset: "smooth_mmo", ownPredictionDeadzone: 0.1 });
  assert.equal(smooth.networkPreset, "smooth_mmo");
  assert.equal(smooth.ownPredictionDeadzone, 0.7, "de standaard wint");
  const custom = networkValues({ networkPreset: "custom", serverTickRateHz: 20, inputSendRateHz: 40, snapshotRateHz: 30, remoteInterpolationBaseDelayMs: 100 });
  assert.equal(custom.inputSendRateHz, 20);
  assert.equal(custom.snapshotRateHz, 20);
  assert.equal(custom.moveSendIntervalMs, 50);
  assert.equal(custom.remoteInterpolationMinDelayMs, 80);
  assert.equal(custom.remoteInterpolationMaxDelayMs, 140);
});

test("Verbinding: de kaart komt in world.mmo.network, zonder kaart blijft het null", async () => {
  const { compileCanonical } = await import("../src/server/authoring/build-service.js");
  const { buildRuntimeWorld } = await import("../src/server/authoring/world-builder.js");
  const docs = (network) => [{ docKey: "project_settings", kind: "project_settings", body: { gameName: "GK" }, archived: false, revision: 1 }]
    .concat(network ? [{ docKey: "network_settings", kind: "network_settings", body: network, archived: false, revision: 1 }] : []);
  const world = (network) => {
    const compiled = compileCanonical(docs(network), {});
    assert.deepEqual(compiled.errors, []);
    return buildRuntimeWorld(JSON.parse(compiled.files["server.json"].text));
  };
  assert.equal(world(null).mmo.network, null);
  const net = world({ networkPreset: "stable" }).mmo.network;
  assert.equal(net.networkPreset, "stable");
  assert.equal(net.snapshotRateHz, 15);
  assert.equal(net.enabled, true);
});
