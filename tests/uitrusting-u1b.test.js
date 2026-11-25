// Uitrusting U1b (25-11): je eigen wapen en schild in de game. De build geeft de velden van 👕 Aan het lichaam door,
// en de game maakt van de item-ID's (server-snapshot) een lijst van wat aan welk bot hangt.
import test from "node:test";
import assert from "node:assert/strict";
import { runtimeItemFromCanonical } from "../src/server/authoring/runtime-overlay.js";
import { gearFromItems } from "../apps/web/public/shared/equipment-attach.js";

test("build: alleen wat afwijkt gaat mee naar het item in de game", () => {
  const full = runtimeItemFromCanonical({ itemId: "item.bijl", displayName: "Bijl", equipSlot: "equipment_slot.main_hand", worldModelAssetId: "asset.bijl",
    bodyPoint: "auto", bodyX: 0.02, bodyY: 0, bodyRotZ: 90, bodyScaleBp: 10000, bodyModelAssetId: "asset.bijl_hand" });
  assert.equal(full.bodyX, 0.02);
  assert.equal(full.bodyRotZ, 90);
  assert.equal(full.bodyModelAssetId, "asset.bijl_hand");
  assert.ok(!("bodyY" in full) && !("bodyPoint" in full) && !("bodyScaleBp" in full));
  const cleared = runtimeItemFromCanonical({ itemId: "item.bijl", displayName: "Bijl", equipSlot: "equipment_slot.main_hand" }, full);
  assert.ok(!("bodyX" in cleared) && !("bodyModelAssetId" in cleared) && !("bodyRotZ" in cleared));
  assert.equal(runtimeItemFromCanonical({ itemId: "item.schild", displayName: "Schild", bodyPoint: "back", bodyScaleBp: 8000 }).bodyPoint, "back");
});

test("game: wapenhand en andere hand hangen aan de handen, de rest (nog) niet", () => {
  const items = {
    "item.bijl": { id: "item.bijl", equipmentSlotRef: "equipment_slot.main_hand", worldModelAssetId: "asset.bijl", bodyRotZ: 90 },
    "item.schild": { id: "item.schild", equipmentSlotRef: "equipment_slot.off_hand", worldModelAssetId: "asset.schild" },
    "item.borst": { id: "item.borst", equipmentSlotRef: "equipment_slot.chest", worldModelAssetId: "asset.borst" },
    "item.ring": { id: "item.ring", equipmentSlotRef: "equipment_slot.main_hand" }
  };
  const gear = gearFromItems(["item.schild", "item.borst", "item.bijl", "item.ring", "item.weg"], items, { right_hand: { bone: "mixamorigRightHand", x: 0.01 } });
  assert.deepEqual(gear.map((entry) => [entry.itemId, entry.pointKey, entry.assetId, entry.boneName]),
    [["item.schild", "left_hand", "asset.schild", ""], ["item.bijl", "right_hand", "asset.bijl", "mixamorigRightHand"]]);
  assert.equal(gear[1].point.x, 0.01);
  assert.equal(gear[1].item.rz, 90);
  assert.deepEqual(gearFromItems(["item.bijl", "item.schild"], items), gearFromItems(["item.schild", "item.bijl"], items));
  assert.deepEqual(gearFromItems([], items), []);
});
