import test from "node:test";
import assert from "node:assert/strict";
import { acknowledgeBufferedInputs, appendBufferedInput, boundRemoteInterpolationSamples, replayBufferedInputs } from "../apps/web/public/game/netcode.js";

test("inputseq-buffer bewaart pathPoint/settle en verwijdert alleen geackte inputs", function () {
  let buffer = [];
  buffer = appendBufferedInput(buffer, {
    seq: 1,
    position: { x: 1, y: 0, z: 0 },
    input: { moveX: 1, moveZ: 0, pathPoint: { x: 1, z: 0 }, settle: false },
    sentAt: 1000
  }, { now: 1000 });
  buffer = appendBufferedInput(buffer, {
    seq: 2,
    position: { x: 1, y: 0, z: 1 },
    input: { moveX: 0, moveZ: 1, pointerTarget: { x: 1, z: 2 }, pathPoint: { x: 1, z: 1 }, settle: true },
    sentAt: 1033
  }, { now: 1033 });
  assert.deepEqual(buffer[1].input.pathPoint, { x: 1, z: 1 });
  assert.equal(buffer[1].input.settle, true);
  buffer = acknowledgeBufferedInputs(buffer, 1);
  assert.deepEqual(buffer.map(function (entry) { return entry.seq; }), [2]);
});

test("reconcile replayt de resterende L-route vanaf de serverack via de movementkernel", function () {
  const acked = { seq: 1, position: { x: 1, y: 0, z: 0 } };
  const pending = [
    { seq: 2, position: { x: 2, y: 0, z: 0 }, input: { pathPoint: { x: 2, z: 0 } } },
    { seq: 3, position: { x: 2, y: 0, z: 1 }, input: { pathPoint: { x: 2, z: 1 }, settle: true } }
  ];
  const replayed = replayBufferedInputs({ x: 0.8, y: 0, z: 0 }, acked, pending, { movementOptions: { radius: 0.5 } });
  assert.ok(Math.abs(replayed.x - 1.8) < 0.001);
  assert.ok(Math.abs(replayed.z - 1) < 0.001);
});

test("remote interpolatiebuffer is op TTL en aantal begrensd en bewaart altijd de nieuwste sample", function () {
  const samples = Array.from({ length: 40 }, function (_, index) {
    return { position: { x: index, y: 0, z: 0 }, receivedAtEpoch: 1000 + (index * 100) };
  });
  const bounded = boundRemoteInterpolationSamples(samples, { nowEpoch: 4900, ttlMs: 1000, limit: 8 });
  assert.equal(bounded.length, 8);
  assert.equal(bounded[bounded.length - 1].position.x, 39);
  assert.ok(bounded[0].receivedAtEpoch >= 3900);
});
