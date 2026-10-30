// Fase 05: gevechtsrekenregels, loot, actor-compiler en vijand-AI zonder server (alleen geheugen).
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { computeDamage, LEGACY_ENEMY_RETALIATION, LEGACY_PLAYER_ATTACK, lootSeed, rollLoot } from "../apps/web/public/shared/combat-math.js";
import { compileActorSection, lootGraphIssues } from "../src/server/authoring/actor-compiler.js";
import { compileCanonical } from "../src/server/authoring/build-service.js";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { ActorRuntime } from "../src/server/runtime/actor-runtime.js";
import { createNavigator } from "../src/server/runtime/navigation.js";

test("schade: exact gelijk aan de oude NODE-03 formules (golden vectors)", function () {
  for (let ap = 0; ap <= 120; ap += 3) {
    for (let armor = 0; armor <= 120; armor += 3) {
      assert.equal(computeDamage(LEGACY_PLAYER_ATTACK, ap, armor), Math.max(1, Math.round(16 + ap * 0.5 - armor * 0.35)));
      assert.equal(computeDamage(LEGACY_ENEMY_RETALIATION, ap, armor), Math.max(1, Math.round(8 + ap * 0.35 - armor * 0.25)));
    }
  }
  assert.equal(computeDamage({ baseDamage: 10, powerScalingBp: 0, armorFactorBp: 10000 }, 0, 50), 1, "minimaal 1");
  assert.equal(computeDamage({ baseDamage: 5, powerScalingBp: 5000, armorFactorBp: 0 }, 3, 0), 7, "6,5 rondt naar 7");
});

test("loot: zelfde seed = zelfde buit; geneste tabel; kans 0 nooit", function () {
  const tables = {
    wolf: { entries: [{ itemId: "pelt", chanceBp: 10000, minQty: 1, maxQty: 3 }, { lootTableId: "rare", chanceBp: 10000, minQty: 1, maxQty: 1 }] },
    rare: { entries: [{ itemId: "fang", chanceBp: 5000, minQty: 1, maxQty: 1 }] }
  };
  const seed = lootSeed("b_x", "actor:w1:1", "p1");
  assert.deepEqual(rollLoot(tables, "wolf", seed), rollLoot(tables, "wolf", seed));
  const pelts = rollLoot(tables, "wolf", seed).find((entry) => entry.itemId === "pelt");
  assert.ok(pelts.quantity >= 1 && pelts.quantity <= 3);
  let fangs = 0;
  for (let i = 0; i < 400; i += 1) if (rollLoot(tables, "wolf", "s" + i).some((entry) => entry.itemId === "fang")) fangs += 1;
  assert.ok(fangs > 150 && fangs < 250, "ongeveer de helft: " + fangs);
});

function doc(kind, body, docKey) {
  return { kind, body, docKey, archived: false, revision: 1, legacyRef: null };
}

function demoDocs() {
  return [
    doc("project_settings", { gameName: "GK" }, "project_settings"),
    doc("player_class", { classId: "class.held", displayName: "Held", abilityRef: "ability:player.hit" }, "player_class:class.held"),
    doc("item_definition", { itemId: "pelt", displayName: "Vacht", category: "material", rarity: "common", stackable: true, stackLimit: 99 }, "item_definition:pelt"),
    doc("region", { regionId: "r1", displayName: "Vlakte", minXMm: 0, maxXMm: 64000, minZMm: 0, maxZMm: 64000 }, "region:r1"),
    doc("ability", { abilityId: "player.hit", displayName: "Slag", baseDamage: 16, powerScalingBp: 5000, armorFactorBp: 3500, rangeMm: 2800, cooldownMs: 250 }, "ability:player.hit"),
    doc("ability", { abilityId: "wolf.bite", displayName: "Beet", baseDamage: 8, powerScalingBp: 3500, armorFactorBp: 2500, rangeMm: 1500, cooldownMs: 1000 }, "ability:wolf.bite"),
    doc("loot_table", { lootTableId: "wolf", displayName: "Wolf", entries: [{ itemRef: "item_definition:pelt", chanceBp: 10000, minQty: 1, maxQty: 2 }] }, "loot_table:wolf"),
    doc("actor_archetype", {
      actorId: "wolf", displayName: "Wolf", healthMax: 30, attackPower: 10, armor: 0, abilityRef: "ability:wolf.bite", behavior: "aggressive",
      aggroRangeMm: 8000, leashRangeMm: 30000, moveSpeedMmPerS: 4000, radiusMm: 500, lootTableRef: "loot_table:wolf", xpReward: 20, respawnMs: 5000
    }, "actor_archetype:wolf"),
    doc("actor_spawn", { spawnId: "w1", archetypeRef: "actor_archetype:wolf", regionRef: "region:r1", xMm: 10000, zMm: 10000 }, "actor_spawn:w1"),
    doc("resource_definition", { resourceId: "bush", displayName: "Struik", lootTableRef: "loot_table:wolf", gatherRangeMm: 2000, radiusMm: 600, respawnMs: 10000 }, "resource_definition:bush"),
    doc("resource_spawn", { resourceSpawnId: "b1", resourceRef: "resource_definition:bush", regionRef: "region:r1", xMm: 20000, zMm: 20000 }, "resource_spawn:b1")
  ];
}

test("kinds: alle demo-documenten zijn geldig", function () {
  for (const item of demoDocs()) assert.equal(validateDocument(item.kind, item.body).ok, true, item.docKey + ": " + JSON.stringify(validateDocument(item.kind, item.body).issues));
});

test("actor-compiler: sectie, fouten en bytegelijk zonder actor-documenten", function () {
  const section = compileActorSection(demoDocs());
  assert.deepEqual(section.errors, []);
  assert.equal(section.server.classAbilityIds["class.held"], "player.hit");
  assert.equal(section.server.archetypes.wolf.abilityId, "wolf.bite");
  assert.equal(section.server.lootTables.wolf.entries[0].itemId, "pelt");
  assert.equal(section.client.archetypes.wolf.attackPower, undefined, "aanvalskracht blijft op de server");
  const outside = demoDocs().map((item) => item.docKey === "actor_spawn:w1" ? doc("actor_spawn", Object.assign({}, item.body, { xMm: 90000 }), item.docKey) : item);
  assert.ok(compileActorSection(outside).errors.some((error) => error.code === "SPAWN_OUTSIDE_REGION"));
  const cycle = new Map([
    ["loot_table:a", doc("loot_table", { lootTableId: "a", displayName: "A", entries: [{ tableRef: "loot_table:b", chanceBp: 1, minQty: 1, maxQty: 1 }] }, "loot_table:a")],
    ["loot_table:b", doc("loot_table", { lootTableId: "b", displayName: "B", entries: [{ tableRef: "loot_table:a", chanceBp: 1, minQty: 1, maxQty: 1 }] }, "loot_table:b")]
  ]);
  assert.ok(lootGraphIssues(cycle).some((issue) => issue.code === "LOOT_CYCLE"));
  const base = demoDocs().filter((item) => ["project_settings", "item_definition"].includes(item.kind));
  base[0] = doc("project_settings", { gameName: "GK" }, "project_settings");
  const compiled = compileCanonical(base);
  assert.equal(JSON.parse(compiled.files["server.json"].text).actors, undefined, "geen actors-sleutel zonder vijanden");
});

function runtimeHarness() {
  const section = compileActorSection(demoDocs()).server;
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(new URL("../db/migrations/015_actor_runtime_state.sql", import.meta.url), "utf8").split("-- Verhuizen")[0]);
  const players = [{ player_id: "p1", world_id: "w", x: 30, z: 30, current_area_id: null }];
  const sent = [];
  const hits = [];
  const index = { ground: null, walkables: [], blockers: [], surfaceBlockers: [] };
  const worldContext = { worldId: "w", walkabilityIndex: index, solidColliders: [] };
  const runtime = new ActorRuntime({
    db,
    canonicalBuild: () => ({ buildId: "b_test", data: { actors: section } }),
    worldContext: () => worldContext,
    spatial: () => ({ index: null }),
    playerStates: () => players,
    isOnline: () => true,
    isDefeated: () => false,
    connections: () => [{ id: "c1", player: { id: "p1" } }],
    send: (connection, payload) => sent.push(payload)
  });
  runtime.setCombatBridge({ applyActorHit: (input) => { hits.push(input); return { damage: 3, remainingHealth: 97, defeated: false }; } });
  return { runtime, players, sent, hits, db };
}

test("vijand: slaapt ver weg, ziet je dichtbij, loopt naar je toe en slaat", function () {
  const { runtime, players, sent, hits } = runtimeHarness();
  let now = 1000000;
  runtime.tick("w", now, 100);
  const wolf = runtime.actors.get("actor:w1");
  assert.equal(wolf.state, "idle");
  players[0].x = 15; players[0].z = 10; // 5 m van de wolf
  for (let i = 0; i < 30; i += 1) { now += 100; runtime.tick("w", now, 100); }
  assert.equal(wolf.state, "engage");
  assert.ok(hits.length >= 1, "de wolf heeft aangevallen");
  assert.equal(hits[0].ability.baseDamage, 8);
  assert.ok(sent.some((message) => message.type === "actor:snapshot" && message.actors.some((actor) => actor.id === "actor:w1:1")));
  players[0].x = 60; players[0].z = 60; // ver weg, buiten de lijn van 30 m
  for (let i = 0; i < 200; i += 1) { now += 100; runtime.tick("w", now, 100); }
  assert.equal(wolf.state, "idle", "terug naar huis");
  assert.equal(wolf.hp, wolf.hpMax);
});

test("spelersaanval: plan schrijft niets, pas na apply; dood -> loot-plan en respawn", function () {
  const { runtime, players, db } = runtimeHarness();
  const now = 2000000;
  runtime.tick("w", now, 100);
  players[0].x = 11; players[0].z = 10;
  const far = () => runtime.planPlayerAttack({ playerId: "p1", targetId: "actor:w1:1", x: 30, z: 30, safe: false, attackPower: 10, nowMs: now, operationId: "op0" });
  assert.throws(far, /te ver weg/);
  const first = runtime.planPlayerAttack({ playerId: "p1", targetId: "actor:w1:1", x: 11, z: 10, safe: false, attackPower: 10, nowMs: now, operationId: "op1" });
  assert.equal(first.plan.damage, 21);
  assert.equal(runtime.actors.get("actor:w1").hp, 30, "nog niets veranderd voor COMMIT");
  runtime.applyPending("op1", now);
  assert.equal(runtime.actors.get("actor:w1").hp, 9);
  const second = runtime.planPlayerAttack({ playerId: "p1", targetId: "actor:w1:1", x: 11, z: 10, safe: false, attackPower: 10, nowMs: now + 300, operationId: "op2" });
  assert.equal(second.plan.killed, true);
  assert.equal(second.plan.rewards[0].items[0].itemId, "pelt");
  runtime.applyPending("op2", now + 300);
  assert.equal(runtime.actors.get("actor:w1").state, "dead");
  assert.throws(() => runtime.planPlayerAttack({ playerId: "p1", targetId: "actor:x:1", x: 0, z: 0, safe: false, attackPower: 1, nowMs: now, operationId: "op3" }), /niet gevonden/);
  runtime.tick("w", now + 6000, 100);
  runtime.tick("w", now + 6100, 100);
  assert.equal(runtime.actors.get("actor:w1").id, "actor:w1:2", "terug met een nieuw leven");
  assert.equal(db.prepare("SELECT occurrence FROM actor_spawn_state WHERE spawn_key = 'actor:w1'").get().occurrence, 2);
});

test("navigatie: zelfde tegel twee keer = zelfde hash; route om een muur", function () {
  const index = { ground: null, walkables: [], surfaceBlockers: [], blockers: [{ shapeType: "box", x: 5, z: 0, width: 1, depth: 10, radius: 0, points: [] }] };
  const a = createNavigator({ index, radius: 0.5 }).bakeCell(0, 0);
  const b = createNavigator({ index, radius: 0.5 }).bakeCell(0, 0);
  assert.equal(a.hash, b.hash);
  const path = createNavigator({ index, radius: 0.5 }).findPath({ x: 0, z: 0 }, { x: 10, z: 0 });
  assert.equal(path.ok, true);
  assert.ok(path.points.length >= 2 && path.points.some((point) => Math.abs(point.z) > 5), "loopt om de muur heen");
});
