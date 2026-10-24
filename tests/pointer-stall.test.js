import assert from "node:assert/strict";
import test from "node:test";
import { MmoService } from "../src/server/mmo-service.js";

// De client stuurt bij stoppen zijn stopplek als laatste looppunt ("settle") en geen losse stop meer. Is dat
// punt onbereikbaar (obstakel), dan moet de server zelf stoppen in plaats van eindeloos tegen de muur te duwen.
function fakeService() {
  const stopped = [];
  return {
    stopped,
    service: {
      pointerStallTicksByPlayerId: new Map(),
      writeStoppedLatestInput(playerId) { stopped.push(playerId); },
      updatePlayerStateFromTick(previous, next) { return next; }
    }
  };
}

function worldContext(solids = []) {
  return {
    world: { player: { moveSpeed: 10, collisionRadius: 0.5 }, gameProject: { zones: { packages: [] } } },
    walkabilityIndex: null,
    solidColliders: solids
  };
}

function tick(fake, state, input, context) {
  return MmoService.prototype.simulatePlayerTick.call(fake.service, state, { input }, context, 33, {});
}

test("looppunt achter een obstakel: server stopt zelf na een paar ticks zonder voortgang", function () {
  const fake = fakeService();
  const wall = { id: "rock", x: 0, z: 2, radius: 1.5, enabled: true };
  const context = worldContext([wall]);
  let state = { player_id: "p1", world_id: "w1", x: 0, y: 0, z: 0, revision: 1, moving: false, animation_state: "idle" };
  const walkInput = { moveX: 0, moveZ: 0, pointerTarget: { x: 0, z: 5 }, settle: true };
  // Zoals de server: na writeStoppedLatestInput is de laatste input een stop.
  for (let index = 0; index < 20; index += 1) state = tick(fake, state, fake.stopped.length ? { stop: true } : walkInput, context);
  assert.equal(state.moving, false, "staat stil tegen het obstakel");
  assert.deepEqual(fake.stopped, ["p1"], "laatste input is op stop gezet");
});

test("vrij looppunt: server loopt erheen en stopt binnen 0,15", function () {
  const fake = fakeService();
  const context = worldContext([]);
  let state = { player_id: "p2", world_id: "w1", x: 0, y: 0, z: 0, revision: 1, moving: false, animation_state: "idle" };
  const input = { moveX: 0, moveZ: 0, pointerTarget: { x: 3, z: 0 } };
  for (let index = 0; index < 30; index += 1) state = tick(fake, state, input, context);
  assert.ok(Math.hypot(state.x - 3, state.z) <= 0.15, "aangekomen (" + state.x + ", " + state.z + ")");
  assert.equal(state.moving, false);
  assert.deepEqual(fake.stopped, [], "geen noodstop nodig");
});
