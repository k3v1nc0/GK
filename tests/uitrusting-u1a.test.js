// Uitrusting U1a (25-11): bevestigpunten per uiterlijk (Klasse) en het blok 👕 Aan het lichaam op een item.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import {
  attachPointForItem, attachToBone, boneNameMatches, bodyModelForItem, cleanPointEntry, findAttachBone, itemBodyOffset, itemOffsetFields, setAttachOffsets
} from "../apps/web/public/shared/equipment-attach.js";

const ownIssues = (kind, body, field) => validateDocument(kind, body).issues.filter((entry) => entry.field === field);

test("item: het blok Aan het lichaam is geldig, oude items zonder blok ook", () => {
  const item = { itemId: "item.bijl", displayName: "Bijl", equipSlot: "equipment_slot.main_hand", bodyPoint: "auto", bodyX: 0.02, bodyY: -0.1, bodyZ: 0,
    bodyRotX: 90, bodyRotY: 0, bodyRotZ: 180.5, bodyScaleBp: 8000, bodyModelAssetId: "asset.bijl" };
  for (const field of Object.keys(item)) assert.deepEqual(ownIssues("item_definition", item, field), [], field);
  assert.equal(ownIssues("item_definition", { itemId: "item.oud", displayName: "Oud" }, "bodyPoint").length, 0);
  assert.equal(ownIssues("item_definition", { bodyPoint: "voet" }, "bodyPoint").length, 1);
  assert.equal(ownIssues("item_definition", { bodyX: 3 }, "bodyX").length, 1);
});

test("klasse: bevestigpunten per uiterlijk worden gecontroleerd", () => {
  const good = { attachPoints: { "asset.archer": { right_hand: { bone: "mixamorigRightHand", x: 0.01, rz: 90 }, back: {} } } };
  assert.deepEqual(ownIssues("player_class", good, "attachPoints"), []);
  assert.equal(ownIssues("player_class", { attachPoints: { "asset.archer": { voet: {} } } }, "attachPoints").length, 1);
  assert.equal(ownIssues("player_class", { attachPoints: { "asset.archer": { left_hand: { x: 5 } } } }, "attachPoints").length, 1);
  assert.equal(ownIssues("player_class", { attachPoints: { "asset.archer": { left_hand: { kleur: "rood" } } } }, "attachPoints").length, 1);
});

test("punt en model van een item: vanzelf uit de plek", () => {
  assert.equal(attachPointForItem({ equipSlot: "equipment_slot.main_hand" }), "right_hand");
  assert.equal(attachPointForItem({ equipSlot: "equipment_slot.off_hand" }), "left_hand");
  assert.equal(attachPointForItem({ equipSlot: "equipment_slot.chest" }), null);
  assert.equal(attachPointForItem({ equipSlot: "equipment_slot.main_hand", bodyPoint: "back" }), "back");
  assert.equal(bodyModelForItem({ worldModelAssetId: "asset.grond" }), "asset.grond");
  assert.equal(bodyModelForItem({ worldModelAssetId: "asset.grond", bodyModelAssetId: "asset.hand" }), "asset.hand");
});

test("botnamen: Mixamo-namen passen, vingers niet", () => {
  assert.ok(boneNameMatches("mixamorigRightHand", "RightHand"));
  assert.ok(boneNameMatches("mixamorig:RightHand", "RightHand"));
  assert.ok(boneNameMatches("RightHand", "RightHand"));
  assert.ok(!boneNameMatches("mixamorigRightHandIndex1", "RightHand"));
  assert.ok(!boneNameMatches("mixamorigSpine1", "Spine"));
});

test("aan het bot: verschuiving in meters, ook als het skelet in centimeters is", () => {
  const root = new THREE.Group();
  root.scale.setScalar(1.2);
  const armature = new THREE.Group();
  armature.scale.setScalar(0.01);
  root.add(armature);
  const hips = new THREE.Bone(); hips.name = "mixamorigHips";
  const hand = new THREE.Bone(); hand.name = "mixamorigRightHand"; hand.position.set(50, 120, 0);
  const finger = new THREE.Bone(); finger.name = "mixamorigRightHandIndex1";
  armature.add(hips); hips.add(hand); hand.add(finger);
  assert.equal(findAttachBone(root, "right_hand"), hand);
  assert.equal(findAttachBone(root, "back"), null);
  assert.equal(findAttachBone(root, "right_hand", "mixamorigHips"), hips);
  const model = new THREE.Object3D();
  const attach = attachToBone(THREE, root, hand, model, { x: 0 }, itemBodyOffset({ bodyY: 0.1, bodyScaleBp: 5000 }));
  root.updateMatrixWorld(true);
  const scale = new THREE.Vector3();
  model.getWorldScale(scale);
  assert.ok(Math.abs(scale.x - 0.6) < 1e-9, "grootte = character × item: " + scale.x);
  const handPos = new THREE.Vector3(); hand.getWorldPosition(handPos);
  const modelPos = new THREE.Vector3(); model.getWorldPosition(modelPos);
  assert.ok(Math.abs(modelPos.distanceTo(handPos) - 0.12) < 1e-9, "10 cm × 1,2: " + modelPos.distanceTo(handPos));
  setAttachOffsets(attach, { x: 0 }, itemBodyOffset({}));
  model.getWorldPosition(modelPos);
  assert.ok(modelPos.distanceTo(handPos) < 1e-9);
});

test("opslaan: netjes afgerond, nullen weg", () => {
  assert.deepEqual(cleanPointEntry({ x: 0.01234, y: 0, z: -0.0004, rx: 359.96, ry: -90, rz: 0 }, "mixamorigRightHand"), { bone: "mixamorigRightHand", x: 0.012, ry: 270 });
  assert.deepEqual(itemOffsetFields({ x: 0.1, y: 0, z: 0, rx: 450, ry: 0, rz: 0, s: 0.5 }),
    { bodyX: 0.1, bodyY: 0, bodyZ: 0, bodyRotX: 90, bodyRotY: 0, bodyRotZ: 0, bodyScaleBp: 5000 });
});
