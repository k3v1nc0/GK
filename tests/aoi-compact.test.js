// 100 spelers (Kevin 20-11): alleen spelers in de buurt, kleine spelersupdate, en een stilstaande speler blijft zichtbaar.
import assert from "node:assert/strict";
import test from "node:test";
import { MmoService } from "../src/server/mmo-service.js";
import { createInterestIndex } from "../src/server/runtime/interest.js";

function fakeWs() {
  return { readyState: 1, bufferedAmount: 0, sent: [], send(text) { this.sent.push(JSON.parse(text)); } };
}

function fakeService(states) {
  const service = Object.create(MmoService.prototype);
  Object.assign(service, {
    interestIndex: createInterestIndex({ cellSize: 64, farCells: 2 }),
    aoiPendingByConnectionId: new Map(),
    aoiSentAtByKey: new Map(),
    aoiVisibleByConnectionId: new Map(),
    aoiStaticByConnectionId: new Map(),
    primaryPresenceByPlayerId: new Map(),
    connectionsByWorldId: new Map([["w1", new Set()]]),
    connectionsById: new Map(),
    serverSeq: 0,
    snapshotSeq: 0,
    serverTick: 0
  });
  service.serverHealthPayload = () => ({ serverTps: 30 });
  service.countConnectedPlayerSessions = () => 1;
  service.getWorldPlayerStates = () => Array.from(states.values());
  for (const id of states.keys()) {
    const connection = { id: "c_" + id, player: { id }, user: { id: "u_" + id }, ws: fakeWs() };
    service.connectionsById.set(connection.id, connection);
    service.connectionsByWorldId.get("w1").add(connection.id);
    service.primaryPresenceByPlayerId.set(id, { displayName: "Speler " + id, modelAssetId: "model_" + id });
  }
  return service;
}

function state(id, x, z) {
  return { player_id: id, world_id: "w1", x, y: 0, z, rotation_y: 0, moving: true, animation_state: "walk", revision: 1, last_processed_input_seq: 1 };
}

function messagesFor(service, id, type) {
  return service.connectionsById.get("c_" + id).ws.sent.filter((message) => message.type === type);
}

test("AOI: buur verschijnt, verre speler niet, en daarna gaan kleine updates", function () {
  const states = new Map([["a", state("a", 0, 0)], ["b", state("b", 10, 0)], ["c", state("c", 500, 500)]]);
  const service = fakeService(states);
  service.broadcastWorldSnapshotWithInterest("w1", Array.from(states.values()), { serverTimeMs: 1000 });
  assert.deepEqual(messagesFor(service, "a", "remote_player:spawn").map((m) => m.playerId), ["b"], "a ziet b verschijnen, c niet");
  const first = messagesFor(service, "a", "mmo:snapshot").pop();
  assert.equal(first.players[0].playerId, "a", "eigen eerste update is volledig");
  // 100 ms later lopen a en b allebei.
  states.get("a").x = 1; states.get("a").revision = 2;
  states.get("b").x = 11; states.get("b").revision = 2;
  service.broadcastWorldSnapshotWithInterest("w1", [states.get("a"), states.get("b")], { serverTimeMs: 1100 });
  const second = messagesFor(service, "a", "mmo:snapshot").pop();
  assert.equal(second.players.length, 2);
  for (const record of second.players) {
    assert.equal(record.playerId, undefined, "klein: geen lange id");
    assert.ok(Number.isFinite(record.i) && record.i > 0, "klein: kort nummer");
    assert.ok(JSON.stringify(record).length < 90, "klein: " + JSON.stringify(record));
  }
  assert.equal(messagesFor(service, "a", "remote_player:spawn").length, 1, "geen dubbele spawn");
  assert.equal(service.connectionsById.get("c_c").ws.sent.some((m) => m.type === "mmo:snapshot" && m.players.some((p) => p.playerId === "a" || p.i === service.netIdFor("a"))), false, "c krijgt niets over a");
});

test("AOI: een speler die stilstaat verdwijnt niet, en wie dichtbij komt verschijnt", function () {
  const states = new Map([["a", state("a", 0, 0)], ["b", state("b", 10, 0)], ["c", state("c", 500, 500)]]);
  const service = fakeService(states);
  service.broadcastWorldSnapshotWithInterest("w1", Array.from(states.values()), { serverTimeMs: 1000 });
  // Alleen a beweegt (b staat stil): b mag niet gedespawned worden.
  for (let t = 1100; t <= 1500; t += 50) {
    states.get("a").x += 0.3;
    service.broadcastWorldSnapshotWithInterest("w1", [states.get("a")], { serverTimeMs: t });
  }
  assert.equal(messagesFor(service, "a", "remote_player:despawn").length, 0, "stilstaande b blijft in beeld");
  // c loopt naar a toe.
  states.get("c").x = 20; states.get("c").z = 0;
  service.broadcastWorldSnapshotWithInterest("w1", [states.get("c")], { serverTimeMs: 1600 });
  assert.ok(messagesFor(service, "a", "remote_player:spawn").some((m) => m.playerId === "c"), "c verschijnt bij a");
  // c loopt weer ver weg.
  states.get("c").x = 900; states.get("c").z = 900;
  service.broadcastWorldSnapshotWithInterest("w1", [states.get("c")], { serverTimeMs: 1700 });
  assert.ok(messagesFor(service, "a", "remote_player:despawn").some((m) => m.playerId === "c"), "c verdwijnt bij a");
});

test("AOI: in een drukte krijgen alleen de dichtstbijzijnden 10 updates per seconde, de rest 4", function () {
  const states = new Map([["me", state("me", 0, 0)]]);
  for (let index = 0; index < 60; index += 1) states.set("p" + index, state("p" + index, 1 + index * 0.5, 0));
  const service = fakeService(states);
  for (let t = 1000; t < 2000; t += 50) {
    for (const value of states.values()) { value.revision += 1; value.x += 0.01; }
    service.broadcastWorldSnapshotWithInterest("w1", Array.from(states.values()), { serverTimeMs: t });
  }
  const counts = new Map();
  for (const message of messagesFor(service, "me", "mmo:snapshot")) {
    for (const record of message.players) counts.set(record.i || record.n, (counts.get(record.i || record.n) || 0) + 1);
  }
  const closest = counts.get(service.netIdFor("p0")) || 0;
  const farthest = counts.get(service.netIdFor("p59")) || 0;
  assert.ok(closest >= 8, "dichtbij ~10/s (" + closest + ")");
  assert.ok(farthest <= 5, "verderop in de drukte ~4/s (" + farthest + ")");
});
