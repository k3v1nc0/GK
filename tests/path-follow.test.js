import assert from "node:assert/strict";
import test from "node:test";
import { MmoService } from "../src/server/mmo-service.js";

// Kevin-handtest 2026-10-24: de server nam "korte routes" (bochten afsnijden naar richting of eindpunt) en liep
// zo tegen bomen waar de speler omheen liep; bij stilstaan werd je daar teruggezet. Nu stuurt de client zijn
// route als tussenpunten en loopt de server die punten af: zelfde route, normale snelheid, met botsingen.
function fakeService() {
  const service = {
    pathQueueByPlayerId: new Map(),
    pointerStallTicksByPlayerId: new Map(),
    stoppedPlayers: [],
    // Zoals de server: na deze aanroep is de laatste input een stop (zie het onbereikbare-punt-test).
    writeStoppedLatestInput(playerId) { service.stoppedPlayers.push(playerId); },
    updatePlayerStateFromTick(previous, next) { return next; }
  };
  service.updatePathQueue = MmoService.prototype.updatePathQueue.bind(service);
  service.clearPathQueue = MmoService.prototype.clearPathQueue.bind(service);
  // Fase 04: de tick zet ook Region/Area op de state (de echte code; zonder build blijft dat null).
  service.spatialIndex = MmoService.prototype.spatialIndex.bind(service);
  service.assignSpatialMembership = MmoService.prototype.assignSpatialMembership.bind(service);
  return service;
}

function worldContext(solids = []) {
  return {
    world: { player: { moveSpeed: 10, collisionRadius: 0.5 }, gameProject: { zones: { packages: [] } } },
    walkabilityIndex: null,
    solidColliders: solids
  };
}

function startState(id) {
  return { player_id: id, world_id: "w1", x: 0, y: 0, z: 0, revision: 1, moving: false, animation_state: "idle" };
}

function tick(service, state, input, context) {
  return MmoService.prototype.simulatePlayerTick.call(service, state, { input }, context, 33, {});
}

function distanceToPolyline(point, polyline) {
  let best = Infinity;
  for (let index = 1; index < polyline.length; index += 1) {
    const a = polyline[index - 1];
    const b = polyline[index];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const length = abx * abx + abz * abz || 1;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * abx + (point.z - a.z) * abz) / length));
    best = Math.min(best, Math.hypot(point.x - (a.x + abx * t), point.z - (a.z + abz * t)));
  }
  return best;
}

// Zoals de client: elke tick een nieuw tussenpunt van zijn route, tot het eind, dan een stoppunt.
function walkPath(service, state, path, context, extraTicks = 60) {
  const trail = [];
  for (const point of path) {
    service.updatePathQueue(state.player_id, { moveX: 1, moveZ: 0, pathPoint: point });
    state = tick(service, state, { moveX: 1, moveZ: 0, pathPoint: point }, context);
    trail.push({ x: state.x, z: state.z });
  }
  const last = path[path.length - 1];
  service.updatePathQueue(state.player_id, { pointerTarget: last, settle: true, pathPoint: last });
  for (let index = 0; index < extraTicks; index += 1) {
    state = tick(service, state, { pointerTarget: last, settle: true }, context);
    trail.push({ x: state.x, z: state.z });
  }
  return { state, trail };
}

function sampledPath(points, spacing = 0.33) {
  const result = [];
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / spacing));
    for (let step = 1; step <= steps; step += 1) result.push({ x: a.x + (b.x - a.x) * (step / steps), z: a.z + (b.z - a.z) * (step / steps) });
  }
  return result;
}

test("L-vormige route: server volgt de route zonder de bocht af te snijden", function () {
  const service = fakeService();
  const corners = [{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 8 }];
  const { state, trail } = walkPath(service, startState("p1"), sampledPath(corners), worldContext());
  const worst = Math.max.apply(null, trail.map(function (point) { return distanceToPolyline(point, corners); }));
  assert.ok(worst < 0.1, "server bleef op de route (grootste afwijking " + worst.toFixed(3) + ")");
  assert.ok(Math.hypot(state.x - 8, state.z - 8) <= 0.06, "eindigt op het stoppunt (" + state.x + ", " + state.z + ")");
  assert.equal(state.moving, false);
});

test("route om een boom: server komt aan waar een rechte lijn vastloopt", function () {
  const tree = { id: "tree", x: 5, z: 0, radius: 1.5, enabled: true };
  const context = worldContext([tree]);
  const around = sampledPath([{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 3 }, { x: 7, z: 3 }, { x: 7, z: 0 }, { x: 10, z: 0 }]);
  const { state } = walkPath(fakeService(), startState("p2"), around, context);
  assert.ok(Math.hypot(state.x - 10, state.z) <= 0.06, "aangekomen achter de boom (" + state.x + ", " + state.z + ")");
});

test("snelheid blijft begrensd, ook als de client punten ver weg stuurt", function () {
  const service = fakeService();
  let state = startState("p3");
  service.updatePathQueue("p3", { moveX: 1, moveZ: 0, pathPoint: { x: 100, z: 0 } });
  state = tick(service, state, { moveX: 1, moveZ: 0, pathPoint: { x: 100, z: 0 } }, worldContext());
  assert.ok(state.x <= 10 * 0.033 + 0.0001, "hooguit één tick loopafstand (" + state.x + ")");
});

test("een stop maakt de rij leeg en de server staat stil", function () {
  const service = fakeService();
  let state = startState("p4");
  for (const point of sampledPath([{ x: 0, z: 0 }, { x: 5, z: 0 }])) service.updatePathQueue("p4", { moveX: 1, moveZ: 0, pathPoint: point });
  service.updatePathQueue("p4", { stop: true });
  state = tick(service, state, { stop: true }, worldContext());
  assert.equal(service.pathQueueByPlayerId.has("p4"), false, "rij is leeg");
  assert.equal(state.x, 0);
  assert.equal(state.moving, false);
});

test("onbereikbaar tussenpunt wordt na een paar ticks overgeslagen", function () {
  const service = fakeService();
  const wall = { id: "rock", x: 2, z: 0, radius: 1.5, enabled: true };
  let state = startState("p5");
  service.updatePathQueue("p5", { pointerTarget: { x: 2, z: 0 }, settle: true, pathPoint: { x: 2, z: 0 } });
  for (let index = 0; index < 30; index += 1) {
    const input = service.stoppedPlayers.includes("p5") ? { stop: true } : { pointerTarget: { x: 2, z: 0 }, settle: true };
    state = tick(service, state, input, worldContext([wall]));
  }
  assert.equal(service.pathQueueByPlayerId.has("p5"), false, "onbereikbaar punt overgeslagen, rij leeg");
  assert.equal(state.moving, false, "staat stil tegen het obstakel");
});
