import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { nextPlayerRouteWaypoint } from "../apps/web/public/shared/player-path-client.js";

const source = fs.readFileSync(new URL("../apps/web/public/game/game.js", import.meta.url), "utf8");
function setup() {
  let finishRoute;
  let requests = 0;
  const sent = [];
  const state = {
    node03: { autoAttack: { targetId: "boar", following: true, followAt: 0 } },
    runtimeWorldKey: "world",
    predictedPosition: { x: 0, y: 0, z: 0 },
    pointer: { active: true, mode: "click_to_move", target: { x: 10, z: 0 }, route: [{ x: 7, z: 0 }], routeWorldKey: "world", routeRequestId: 0, routePending: false },
    runtime: { findPlayerMovementPath() { requests++; return new Promise(resolve => { finishRoute = resolve; }); } }
  };
  const context = vm.createContext({
    performance: { now: () => 1000 }, sprintActive: () => false,
    state, target: { x: 12, z: 0, distance: 12, range: 2.8, radius: 0.5, inRange: false },
    num: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    nextPlayerRouteWaypoint, currentCollisionRadius: () => 0.5,
    clickMoveArrivalRadius: () => 0.15, isPointerHoldActive: () => false,
    hasKeyboardMovementInput: () => false, isNode03Defeated: () => false,
    sendInputState: options => sent.push(options),
    clearMovementInput() { state.pointer.active = false; state.pointer.routeRequestId++; },
    localStopPointForServer: () => state.predictedPosition,
    stopAutoAttack() { throw new Error("unexpected stop"); },
    startClickToMoveTarget() { throw new Error("active chase must not restart"); }
  });
  vm.runInContext("function autoAttackTarget() { return target; }", context);
  for (const name of ["targetArrivalRadius", "prepareClickMoveRoute", "clickMoveWaypoint", "updateAutoAttackFollow", "currentSpeed", "currentMoveVector"]) {
    const start = source.indexOf("function " + name + "(");
    vm.runInContext(source.slice(start, source.indexOf("\nfunction ", start + 1)), context);
  }
  return { state, context, sent, requests: () => requests, finish: route => finishRoute(route) };
}

test("achtervolgen blijft lopen tijdens routeberekening zonder stop of herstart", async () => {
  const { state, context, sent, requests, finish } = setup();
  const oldRoute = state.pointer.route;
  context.updateAutoAttackFollow(1000);
  assert.equal(state.pointer.route, oldRoute);
  assert.equal(context.clickMoveWaypoint().x, 7);
  assert.equal(state.pointer.routePending, true);
  assert.ok(state.pointer.routeArrivalRadius < 2.8 + 0.5 - 0.5);
  context.updateAutoAttackFollow(1200);
  assert.equal(requests(), 1, "geen herberekening terwijl de vorige nog loopt");
  assert.equal(sent.length, 0, "geen stop naar server");
  finish({ ok: true, points: [{ x: 9.45, z: 0 }] });
  await Promise.resolve();
  assert.equal(context.clickMoveWaypoint().x, 9.45);
  assert.equal(state.pointer.routePending, false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].stop, undefined);
});

test("volgen stopt pas ruim binnen bereik en negeert late route na annuleren", async () => {
  const { state, context, finish } = setup();
  context.updateAutoAttackFollow(1000);
  context.target.distance = 3;
  context.target.inRange = true;
  context.updateAutoAttackFollow(1200);
  assert.equal(state.pointer.active, true, "loopt door vanaf de uiterste aanvalsrand");
  context.target.distance = 2.5;
  context.updateAutoAttackFollow(1400);
  assert.equal(state.pointer.active, false);
  const oldRoute = state.pointer.route;
  finish({ ok: true, points: [{ x: 20, z: 0 }] });
  await Promise.resolve();
  assert.equal(state.pointer.route, oldRoute, "late route start het lopen niet opnieuw");
});

test("bewegend dier blijft gevolgd binnen aanvalsbereik; stilstaan stopt het volgen", async () => {
  const { state, context, finish } = setup();
  context.updateAutoAttackFollow(1000);
  finish({ ok: true, points: [{ x: 9.45, z: 0 }] });
  await Promise.resolve();
  context.target.x += 0.3;
  context.target.distance = 2.5;
  context.target.inRange = true;
  context.updateAutoAttackFollow(1200);
  assert.equal(state.pointer.active, true, "niet stoppen zodra een bewegend doel binnen bereik is");
  assert.equal(state.node03.autoAttack.following, true);
  assert.equal(state.pointer.routeArrivalRadius, 1.15, "volgen houdt ruimte tussen beide lichamen");
  finish({ ok: true, points: [{ x: 11.15, z: 0 }] });
  await Promise.resolve();
  context.updateAutoAttackFollow(1600);
  assert.equal(state.pointer.active, false, "stilstaand doel binnen bereik hoeft niet gevolgd te worden");
});

test("veraf eigen snelheid, dichtbij diersnelheid en geleidelijk afstand corrigeren", () => {
  const { state, context } = setup();
  Object.assign(state.node03.autoAttack, { matchingSpeed: true, matchDistance: 2.55, targetSpeed: 2 });
  assert.equal(context.currentSpeed(), 6, "veraf normale charactersnelheid");
  state.predictedPosition.x = context.target.x - 2.55;
  assert.ok(Math.abs(context.currentSpeed() - 2) < 0.00001, "op volgafstand exact de diersnelheid");
  state.predictedPosition.x -= 0.2;
  assert.ok(Math.abs(context.currentSpeed() - 2.5) < 0.00001, "klein afstandsverschil geleidelijk inlopen");
  state.node03.autoAttack.targetSpeed = 20;
  assert.equal(context.currentSpeed(), 6, "nooit sneller dan eigen maximale snelheid");
  state.node03.autoAttack.targetSpeed = 2;
  state.predictedPosition.x = context.target.x - 1;
  assert.equal(context.currentSpeed(), 0, "afremmen zonder achteruit te lopen bij te weinig ruimte");
});

test("geannuleerde route wordt opnieuw gezocht, ook als het dier op dezelfde plek staat", async () => {
  const { context, finish, requests } = setup();
  context.updateAutoAttackFollow(1000);
  finish({ ok: false, points: [], reason: "cancelled" });
  await Promise.resolve();
  context.updateAutoAttackFollow(1200);
  assert.equal(requests(), 2);
});

test("vastgelopen routeverzoek blokkeert de achtervolging niet blijvend", () => {
  const { context, requests } = setup();
  context.updateAutoAttackFollow(1000);
  context.updateAutoAttackFollow(2600);
  assert.equal(requests(), 2, "na timeout opnieuw proberen");
});

test("aankomst op oud routepunt houdt de achtervolging actief", () => {
  const { state, context } = setup();
  state.pointer.moved = true;
  state.predictedPosition.x = 7;
  state.pointer.routeGoal = { x: 10, z: 0 };
  const vector = context.currentMoveVector();
  assert.equal(vector.x, 0);
  assert.equal(state.pointer.active, true);
  assert.equal(state.pointer.routeGoal, null, "nieuwe route nodig, geen definitieve stop");
});
