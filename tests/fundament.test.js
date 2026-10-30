// Fundament zonder nodes (doelbeeld): kaarten -> build -> spelwereld. Geen node-graph, geen oude gepubliceerde wereld.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { compileCanonical } from "../src/server/authoring/build-service.js";
import { baseRuntimeWorld, buildRuntimeWorld, WORLD_ID, WORLD_SPAWN_ID, WORLD_ZONE_ID } from "../src/server/authoring/world-builder.js";
import { MmoService } from "../src/server/mmo-service.js";
import { Node03RuntimeService } from "../src/server/node03-runtime-service.js";
import { buildWalkabilityIndex, resolveMovement } from "../apps/web/public/shared/movement-kernel.js";

const doc = (kind, key, body) => ({ docKey: key, kind, body, archived: false, revision: 1 });
const serverData = (docs) => {
  const compiled = compileCanonical(docs, {});
  assert.deepEqual(compiled.errors, []);
  return JSON.parse(compiled.files["server.json"].text);
};
// Een repository die faalt zodra iemand de oude node-wereld of de graph leest.
const noNodes = new Proxy({}, { get: (target, name) => () => { throw new Error("nodes of oude wereld gelezen: " + String(name)); } });

test("zonder kaarten is er toch een speelbare basiswereld", () => {
  const world = buildRuntimeWorld({});
  assert.equal(world.world.id, WORLD_ID);
  assert.equal(world.activeZoneId, WORLD_ZONE_ID);
  assert.equal(world.spawn.spawnId, WORLD_SPAWN_ID);
  assert.ok(world.ground.maxX > 0 && world.ground.minX < 0, "grond rond het midden");
  assert.ok(world.player.moveSpeed > 0);
  assert.equal(world.gameProject.zones.byId[WORLD_ZONE_ID].spawns[0].spawnId, WORLD_SPAWN_ID);
  assert.ok(world.gameProject.catalogs.respawnPolicies["respawn_policy.standard"]);
  assert.ok(world.gameProject.catalogs.equipmentSlots["equipment_slot.main_hand"]);
  assert.equal(JSON.stringify(world).includes("node_output"), false, "geen spoor van de node-graph");
});

test("de kaart Wereld stuurt grond, startplek, speler, camera en lucht", () => {
  const settings = { groundSize: 300, groundColor: "#224422", startX: 12, startZ: -8, playerSpeed: 9, cameraDistance: 30, skyColor: "#102030" };
  assert.equal(validateDocument("world_settings", settings).ok, true);
  assert.equal(validateDocument("world_settings", { skyColor: "blauw" }).ok, false, "kleur moet #rrggbb zijn");
  const world = buildRuntimeWorld(serverData([doc("world_settings", "world_settings", settings), doc("project_settings", "project_settings", { gameName: "Testwereld" })]));
  assert.equal(world.ground.maxX, 150);
  assert.equal(world.ground.materialColor, "#224422");
  assert.deepEqual([world.spawn.x, world.spawn.z], [12, -8]);
  assert.equal(world.player.moveSpeed, 9);
  assert.equal(world.camera.distance, 30);
  assert.equal(world.world.backgroundColor, "#102030");
  assert.equal(world.gameProject.project.gameName, "Testwereld");
});

test("items en pickups uit kaarten staan in de ene wereld, ook met een oude zone", () => {
  const data = serverData([
    doc("item_definition", "item_definition:item.steen", { itemId: "item.steen", displayName: "Steen", category: "material", rarity: "common", stackable: true, stackLimit: 99 }),
    doc("pickup", "pickup:pickup.steen", { pickupId: "pickup.steen", itemRef: "item_definition:item.steen", zoneRef: "zone.oude_weide", x: 1, y: 0, z: 2, amount: 3, respawnPolicyRef: "respawn_policy.fast" })
  ]);
  const world = buildRuntimeWorld(data);
  assert.equal(world.gameProject.catalogs.items["item.steen"].displayName, "Steen");
  const pkg = world.gameProject.zones.packages[0];
  const spawns = pkg.spawnControllers.flatMap((controller) => controller.spawnSets.flatMap((set) => set.spawns.map((spawn) => ({ controller, set, spawn }))));
  assert.equal(spawns.length, 1);
  const state = Node03RuntimeService.prototype.desiredPickupForSpawn.call({}, { zoneId: pkg.zoneId, catalogs: world.gameProject.catalogs }, spawns[0].controller, spawns[0].set, spawns[0].spawn);
  assert.equal(state.zoneId, WORLD_ZONE_ID);
  assert.equal(state.itemRef, "item.steen");
  assert.equal(state.amount, 3);
});

test("onbekende terugkom-keuze wordt bij publiceren tegengehouden, de vaste keuzes niet", () => {
  const base = baseRuntimeWorld({});
  const options = { knownRespawnPolicyIds: Object.keys(base.gameProject.catalogs.respawnPolicies) };
  const item = doc("item_definition", "item_definition:item.steen", { itemId: "item.steen", displayName: "Steen", category: "material", rarity: "common", stackable: true, stackLimit: 99 });
  const pickup = (policy) => doc("pickup", "pickup:p", { pickupId: "p", itemRef: "item_definition:item.steen", zoneRef: "zone.x", x: 0, y: 0, z: 0, amount: 1, respawnPolicyRef: policy });
  assert.deepEqual(compileCanonical([item, pickup("respawn_policy.slow")], options).errors, []);
  assert.equal(compileCanonical([item, pickup("respawn_policy.weg")], options).errors[0].code, "REF_UNRESOLVED");
});

test("de spelserver leest alleen de actieve build, nooit nodes of de oude gepubliceerde wereld", () => {
  const db = new DatabaseSync(":memory:");
  const mmo = new MmoService(db, { currentSession: () => null }, noNodes);
  try {
    const empty = mmo.getPublishedWorldContext();
    assert.equal(empty.worldId, WORLD_ID, "zonder build draait de basiswereld");
    let active = { buildId: "b_test", data: serverData([doc("world_settings", "world_settings", { startX: 5, startZ: 5 })]) };
    mmo.setCanonicalBuildProvider(() => active);
    const first = mmo.getPublishedWorldContext();
    assert.equal(first.world.spawn.x, 5);
    assert.equal(mmo.getPublishedWorldContext(), first, "zelfde build = zelfde wereld (geen werk per tick)");
    active = { buildId: "b_test2", data: serverData([doc("world_settings", "world_settings", { startX: -5, startZ: 5 })]) };
    assert.equal(mmo.getPublishedWorldContext().world.spawn.x, -5, "nieuwe build = nieuwe wereld");
    assert.notEqual(mmo.getPublishedWorldContext().publishedAt, first.publishedAt, "de game ziet dat er iets nieuws is");
  } finally {
    mmo.shutdown();
  }
});

test("lopen: vrij over de grond, niet door een blokkade en niet van de wereld af", () => {
  const blokkade = { areaId: "blok.muur", displayName: "Muur", soort: "blokkade", pointsMm: [[3000, -5000], [5000, -5000], [5000, 5000], [3000, 5000]] };
  assert.equal(validateDocument("area", blokkade).ok, true);
  const world = buildRuntimeWorld(serverData([doc("area", "area:blok.muur", blokkade)]));
  const index = buildWalkabilityIndex(world);
  const walk = (from, to) => resolveMovement(from, to, { index, radius: 0.5 });
  const free = walk({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -2 });
  assert.ok(Math.abs(free.z + 2) < 0.01, "vrij lopen op de grond (" + JSON.stringify(free) + ")");
  const blocked = walk({ x: 1, y: 0, z: 0 }, { x: 4, y: 0, z: 0 });
  assert.ok(blocked.x < 3, "de blokkade houdt je tegen (" + JSON.stringify(blocked) + ")");
  const edge = walk({ x: 0, y: 0, z: 249 }, { x: 0, y: 0, z: 260 });
  assert.ok(edge.z <= 250, "niet van de rand van de wereld af (" + JSON.stringify(edge) + ")");
});
