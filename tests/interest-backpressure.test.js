// F2-E2-T03: AOI per cel, frequentie per tier, begrensde wachtrij en privacy.
import test from "node:test";
import assert from "node:assert/strict";
import {
  createInterestIndex, createOutboundQueue, publicActorState, selectForViewer, shouldDisconnect, TIER, MAX_BUFFERED_BYTES
} from "../src/server/runtime/interest.js";

test("tiers: self, near (zelfde/aangrenzende cel), far, en daarbuiten niets", function () {
  const index = createInterestIndex({ cellSize: 64, farCells: 2 });
  index.update("me", 10, 10);
  index.update("near", 70, 10);
  index.update("far", 150, 10);
  index.update("out", 400, 400);
  assert.equal(index.tierBetween("me", "me"), TIER.SELF);
  assert.equal(index.tierBetween("me", "near"), TIER.NEAR);
  assert.equal(index.tierBetween("me", "far"), TIER.FAR);
  assert.equal(index.tierBetween("me", "out"), TIER.NONE);
  assert.ok(!index.actorsAround("me").includes("out"));
});

test("buiten AOI geen payload; near 10 Hz en far 2 Hz", function () {
  const index = createInterestIndex();
  index.update("me", 0, 0);
  index.update("near", 10, 0);
  index.update("far", 140, 0);
  index.update("out", 999, 999);
  const states = ["me", "near", "far", "out"].map((id) => ({ player_id: id }));
  const sentAt = new Map();
  const counts = { me: 0, near: 0, far: 0, out: 0 };
  for (let t = 0; t < 1000; t += 50) {
    for (const state of selectForViewer(index, "me", states, t, sentAt)) counts[state.player_id] += 1;
  }
  assert.equal(counts.out, 0);
  assert.equal(counts.me, 20);
  assert.equal(counts.near, 10);
  assert.equal(counts.far, 2);
});

test("wachtrij voegt beweging samen en verliest geen spawn/despawn", function () {
  const queue = createOutboundQueue({ maxMovementActors: 4 });
  queue.pushCritical({ type: "spawn", id: "a" });
  for (let i = 0; i < 100; i++) queue.pushMovement("a", { x: i });
  queue.pushCritical({ type: "despawn", id: "b" });
  const out = queue.drain();
  assert.deepEqual(out.critical.map((e) => e.type), ["spawn", "despawn"]);
  assert.deepEqual(out.movement, [{ x: 99 }]);
  assert.equal(queue.size(), 0);
});

test("langzame socket boven 512 KiB of overvolle wachtrij moet dicht", function () {
  assert.equal(shouldDisconnect(MAX_BUFFERED_BYTES), false);
  assert.equal(shouldDisconnect(MAX_BUFFERED_BYTES + 1), true);
  const queue = createOutboundQueue({ maxMovementActors: 1 });
  queue.pushMovement("a", {});
  queue.pushMovement("b", {});
  assert.equal(shouldDisconnect(0, queue), true);
});

test("privacyvelden ontbreken in de publieke state", function () {
  const state = publicActorState({ player_id: "p", x: 1, user_id: "u", client_session_id: "s", source_device: "laptop" });
  assert.deepEqual(state, { player_id: "p", x: 1 });
});
