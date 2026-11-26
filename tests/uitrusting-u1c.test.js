// Uitrusting U1c (25-11): andere spelers (en bots) zien jouw wapen en schild. De server stuurt de item-ID's die je
// draagt in de volledige spelersrecord; een wissel maakt de vaste gegevens anders, dus kijkers krijgen één volledige.
import test from "node:test";
import assert from "node:assert/strict";
import { MmoService, publicRemotePlayerSnapshot } from "../src/server/mmo-service.js";

test("server: een andere speler krijgt mee wat jij draagt", () => {
  const snap = publicRemotePlayerSnapshot({ id: "p1", display_name: "Kevin", selected_character_id: "class.krijger" },
    { x: 1, y: 0, z: 2, rotationY: 0 }, 1, "world.main", "asset.held", ["item.bijl", "item.schild"]);
  assert.deepEqual(snap.gear, ["item.bijl", "item.schild"]);
  assert.deepEqual(publicRemotePlayerSnapshot({ id: "p2", display_name: "B" }, { x: 0, y: 0, z: 0 }, 1, "world.main").gear, []);
});

test("server: wisselen maakt een volledige record nodig, de kleine update blijft klein", () => {
  const sign = MmoService.prototype.snapshotStaticSignature;
  const base = { displayName: "Kevin", modelAssetId: "asset.held", worldId: "world.main", gear: ["item.bijl"] };
  assert.notEqual(sign(base), sign(Object.assign({}, base, { gear: ["item.zwaard"] })));
  assert.equal(sign(base), sign(Object.assign({}, base, { gear: ["item.bijl"] })));
  const compact = MmoService.prototype.compactSnapshotRecord.call({}, Object.assign({ n: 3, x: 1, y: 0, z: 2 }, base));
  assert.ok(!("gear" in compact));
});

test("server: aan- of uittrekken leest de lijst opnieuw en zet de speler in de volgende update", () => {
  let rows = [{ item_id: "item.bijl" }];
  const dirty = [];
  const fake = {
    gearByPlayerId: new Map(),
    primaryPresenceByPlayerId: new Map([["p1", { worldId: "world.main", gear: [] }]]),
    db: { prepare: () => ({ all: () => rows }) },
    markPlayerDirty: (worldId, playerId) => dirty.push(worldId + ":" + playerId),
    playerGear: MmoService.prototype.playerGear
  };
  assert.deepEqual(fake.playerGear("p1"), ["item.bijl"]);
  rows = [{ item_id: "item.bijl" }, { item_id: "item.schild" }];
  assert.deepEqual(fake.playerGear("p1"), ["item.bijl"], "zonder wissel uit het geheugen");
  MmoService.prototype.refreshPlayerGear.call(fake, "p1");
  assert.deepEqual(fake.primaryPresenceByPlayerId.get("p1").gear, ["item.bijl", "item.schild"]);
  assert.deepEqual(dirty, ["world.main:p1"]);
});
