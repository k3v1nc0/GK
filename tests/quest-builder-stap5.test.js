// Quest Builder stap 5 (5-11): Als → Dan en verschijnen. Quest-check bij de build; op de server: de groep ziet dezelfde
// wolven, een speler buiten de groep niet (ook niet raken, niet aangevallen), trigger 2× geeft geen dubbele groep, wie de
// groep verlaat krijgt geen kopie (Kevins regel), herstart/reconnect houdt de wolven, en oogsten Ieder zijn eigen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { compileCanonical } from "../src/server/authoring/build-service.js";
import { compileActorSection } from "../src/server/authoring/actor-compiler.js";
import { buildRuntimeWorld, WORLD_ZONE_ID } from "../src/server/authoring/world-builder.js";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { ActorRuntime } from "../src/server/runtime/actor-runtime.js";
import { Node03RuntimeService } from "../src/server/node03-runtime-service.js";
import { Node04QuestRuntimeService } from "../src/server/node04-quest-runtime-service.js";

const doc = (kind, key, body) => ({ docKey: key, kind, body, archived: false, revision: 1, legacyRef: null });

const QUEST = {
  questId: "quest.hout", displayName: "Hout en wolven", giverRef: "npc:npc.boer", rewardXp: 10,
  spawns: [{ spawnId: "wolven", name: "Wolvengroep", actorRef: "actor_archetype:wolf", count: 3 }],
  steps: [
    { stepId: "hout", kind: "step", match: "all", objectives: [{ objectiveId: "o_hout", type: "gather", ref: "resource_definition:bush", amount: 10 }],
      rules: [{ ruleId: "r_start", when: "start", then: "message", text: "Verzamel 10 hout!" },
        { ruleId: "r_wolf", when: "count", objectiveId: "o_hout", amount: 5, then: "spawn", spawnId: "wolven" }],
      next: [{ to: "wolf" }] },
    { stepId: "wolf", kind: "step", match: "all", objectives: [{ objectiveId: "o_wolf", type: "defeat", ref: "actor_archetype:wolf", amount: 3, spawnId: "wolven" }], next: [{ to: "end" }] },
    { stepId: "end", kind: "end", title: "Klaar" }
  ]
};

function docs(extra = []) {
  return [
    doc("project_settings", "project_settings", { gameName: "GK", maxLevel: 50 }),
    doc("player_class", "player_class:class.held", { classId: "class.held", displayName: "Held", abilityRef: "ability:player.hit" }),
    doc("ability", "ability:player.hit", { abilityId: "player.hit", displayName: "Slag", baseDamage: 16, powerScalingBp: 5000, armorFactorBp: 3500, rangeMm: 2800, cooldownMs: 250 }),
    doc("ability", "ability:wolf.bite", { abilityId: "wolf.bite", displayName: "Beet", baseDamage: 8, powerScalingBp: 3500, armorFactorBp: 2500, rangeMm: 1500, cooldownMs: 1000 }),
    doc("item_definition", "item_definition:pelt", { itemId: "pelt", displayName: "Vacht", category: "material", rarity: "common", stackable: true, stackLimit: 99 }),
    doc("loot_table", "loot_table:wolf", { lootTableId: "wolf", displayName: "Wolf", entries: [{ itemRef: "item_definition:pelt", chanceBp: 10000, minQty: 1, maxQty: 1 }] }),
    doc("actor_archetype", "actor_archetype:wolf", { actorId: "wolf", displayName: "Wolf", healthMax: 30, attackPower: 10, armor: 0, abilityRef: "ability:wolf.bite", behavior: "aggressive",
      aggroRangeMm: 8000, leashRangeMm: 30000, moveSpeedMmPerS: 4000, radiusMm: 500, lootTableRef: "loot_table:wolf", xpReward: 20, respawnMs: 5000 }),
    doc("resource_definition", "resource_definition:bush", { resourceId: "bush", displayName: "Struik", lootTableRef: "loot_table:wolf", gatherRangeMm: 2000, radiusMm: 600, respawnMs: 10000, gatherMode: "personal" }),
    doc("npc", "npc:npc.boer", { npcId: "npc.boer", displayName: "Boer", x: -4, y: 0, z: 4 }),
    doc("quest", "quest:quest.hout", QUEST)
  ].concat(extra);
}

test("stap 5: quest-check zegt wat er mist (verschijning, regel, doel)", () => {
  const broken = doc("quest", "quest:quest.kapot", {
    questId: "quest.kapot", displayName: "Kapot", giverRef: "npc:npc.boer",
    spawns: [{ spawnId: "leeg", count: 2 }, { spawnId: "nooit", name: "Nooit", actorRef: "actor_archetype:wolf", despawn: "step" }],
    steps: [
      { stepId: "s1", kind: "step", match: "all", objectives: [{ objectiveId: "o1", type: "defeat", ref: "actor_archetype:wolf", amount: 2, spawnId: "nooit" },
        { objectiveId: "o2", type: "defeat", ref: "actor_archetype:wolf", spawnId: "weg" }],
        rules: [{ ruleId: "a", when: "count", then: "message", text: "" }, { ruleId: "b", when: "done", then: "spawn", spawnId: "leeg" }, { ruleId: "c", when: "start", then: "spawn", spawnId: "spook" }],
        next: [{ to: "end" }] },
      { stepId: "end", kind: "end" }
    ]
  });
  const messages = compileCanonical(docs([broken]), {}).errors.filter((error) => error.code === "QUEST_CHECK").map((error) => error.message).join(" | ");
  assert.match(messages, /👾 Nooit verschijnt nooit/);
  assert.match(messages, /Versla: de verschijning bestaat niet \(meer\)/);
  assert.match(messages, /Als → Dan: kies bij welk doel/);
  assert.match(messages, /Als → Dan: vul het bericht in/);
  assert.match(messages, /Als → Dan: die verschijning bestaat niet/);
  assert.match(messages, /kies welke vijand/);
  assert.ok(validateDocument("quest", Object.assign({}, QUEST, { spawns: [{ spawnId: "x", audience: "buren" }] })).issues.some((issue) => issue.code === "QUEST_SPAWNS"), "onbekend Voor wie");
  assert.ok(validateDocument("quest", QUEST).ok, JSON.stringify(validateDocument("quest", QUEST).issues));
});

test("stap 5: build zet verschijningen, regels en doel → verschijning alleen waar ze zijn", () => {
  const compiled = compileCanonical(docs(), {});
  assert.deepEqual(compiled.errors, []);
  const quest = buildRuntimeWorld(JSON.parse(compiled.files["server.json"].text)).gameProject.campaigns.quests.byId["quest.hout"];
  assert.deepEqual(quest.spawns, [{ id: "wolven", name: "Wolvengroep", actorRef: "wolf", count: 3, areaRef: null, audience: "group", despawn: "quest" }]);
  assert.equal(quest.stepsById.hout.rules[1].spawnRef, "wolven");
  assert.equal(quest.stepsById.hout.rules[1].objectiveRef, "o_hout");
  assert.equal(quest.stepsById.wolf.objectives[0].spawnRef, "wolven");
  assert.match(quest.stepsById.wolf.objectives[0].displayName, /Versla 3× Wolvengroep/);
  assert.equal("rules" in quest.stepsById.wolf, false, "geen regels = geen veld (versie blijft gelijk)");
});

// ---- vijandenserver: wie ziet de wolven ----

function harness(db = null) {
  const section = compileActorSection(docs().filter((item) => item.kind !== "quest" && item.kind !== "npc")).server;
  if (!db) {
    db = new DatabaseSync(":memory:");
    for (const file of fs.readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort()) db.exec(fs.readFileSync("db/migrations/" + file, "utf8"));
  }
  const players = ["p1", "p2", "p3", "p4"].map((id) => ({ player_id: id, world_id: "w", x: 60, z: 60, current_area_id: null }));
  const party = new Map([["p1", "party.a"], ["p2", "party.a"], ["p4", "party.a"]]);
  const online = new Set(["p1", "p2", "p3", "p4"]);
  const sent = [];
  const index = { ground: null, walkables: [], blockers: [], surfaceBlockers: [] };
  const runtime = new ActorRuntime({
    db,
    canonicalBuild: () => ({ buildId: "b_test", data: { actors: section } }),
    worldContext: () => ({ worldId: "w", walkabilityIndex: index, solidColliders: [] }),
    spatial: () => ({ index: null }),
    playerStates: () => players,
    isOnline: (id) => online.has(id),
    isDefeated: () => false,
    connections: () => Array.from(online).map((id) => ({ id: "c_" + id, player: { id } })),
    send: (connection, payload) => sent.push([connection.player.id, payload]),
    partyOf: (id) => party.get(id) || null
  });
  runtime.setCombatBridge({ applyActorHit: () => ({ damage: 1, remainingHealth: 99, defeated: false }) });
  runtime.ensureBuild(1000);
  const spawn = (playerId, extra = {}) => runtime.spawnQuestGroup(Object.assign({ worldId: "w", questId: "quest.hout", spawnId: "wolven", stepId: "hout", ruleId: "r_wolf",
    audience: "group", despawn: "quest", playerId, actorId: "wolf", count: 3, center: { x: 10, z: 10 } }, extra), 1000);
  const seen = (playerId) => {
    const ids = new Set();
    for (const [to, payload] of sent) if (to === playerId && payload.type === "actor:snapshot") for (const actor of payload.actors) ids.add(actor.id);
    return ids;
  };
  return { runtime, db, players, party, online, sent, spawn, seen };
}

test("stap 5: de groep ziet dezelfde wolven, een speler buiten de groep niet (ook niet raken of aangevallen worden)", () => {
  const { runtime, players, spawn, seen } = harness();
  const made = spawn("p1");
  assert.equal(made.created, true);
  assert.equal(made.group.actors.length, 3);
  for (const player of players) { player.x = 11; player.z = 10; }
  runtime.tick("w", 2000, 100);
  const wolves = made.group.actors.map((spec) => spec.key + ":1");
  for (const id of wolves) {
    assert.ok(seen("p1").has(id), "p1 ziet " + id);
    assert.ok(seen("p2").has(id), "groepsgenoot p2 ziet " + id);
    assert.ok(!seen("p3").has(id), "p3 (buiten de groep) ziet niets");
  }
  const target = made.group.actors[0];
  assert.throws(() => runtime.planPlayerAttack({ playerId: "p3", targetId: target.key + ":1", x: target.x, z: target.z, safe: false, attackPower: 10, nowMs: 3000, operationId: "op_p3" }), /Vijand niet gevonden/);
  const wolf = runtime.actors.get(target.key);
  assert.equal(runtime.eligibleTarget(wolf, { id: "p3", x: target.x, z: target.z }), false, "de wolf jaagt niet op p3");
  assert.equal(runtime.eligibleTarget(wolf, { id: "p2", x: target.x, z: target.z }), true);
  const hit = runtime.planPlayerAttack({ playerId: "p2", targetId: target.key + ":1", x: target.x, z: target.z, safe: false, attackPower: 10, nowMs: 3000, operationId: "op_p2" });
  assert.equal(hit.plan.questSpawn.spawnId, "wolven");
  assert.deepEqual(runtime.questSpawnPositions("quest.hout", "wolven", "p3"), [], "geen ster voor p3");
  assert.equal(runtime.questSpawnPositions("quest.hout", "wolven", "p2").length, 3);
});

test("stap 5: trigger 2× geeft geen dubbele groep; wie de groep verlaat krijgt geen kopie", () => {
  const { runtime, party, spawn } = harness();
  const first = spawn("p1");
  const again = spawn("p2");
  assert.equal(again.created, false, "p2 doet mee met dezelfde groep");
  assert.equal(again.group.id, first.group.id);
  assert.equal(spawn("p1").created, false);
  assert.equal(runtime.questGroups.size, 1);
  // p4 zit in de groep maar liet de regel niet gaan: weg uit de groep = ziet ze niet meer, en er komt niets bij.
  assert.equal(runtime.canSeeGroup(first.group, "p4"), true);
  party.delete("p4");
  assert.equal(runtime.canSeeGroup(first.group, "p4"), false);
  // p2 deed zelf mee (Meenemen): ziet dezelfde wolven nog, zonder kopie.
  party.delete("p2");
  assert.equal(runtime.canSeeGroup(first.group, "p2"), true);
  assert.equal(runtime.questGroups.size, 1, "niets gekopieerd");
  // Alleen voor de speler: een ander ziet ze niet, ook niet in dezelfde groep.
  const own = spawn("p1", { spawnId: "solo", audience: "player" });
  assert.equal(runtime.canSeeGroup(own.group, "p4"), false);
  party.set("p4", "party.a");
  assert.equal(runtime.canSeeGroup(own.group, "p4"), false);
  const everyone = spawn("p1", { spawnId: "wereld", audience: "all" });
  assert.equal(runtime.canSeeGroup(everyone.group, "p3"), true, "voor iedereen");
});

test("stap 5: herstart/reconnect houdt de wolven (dode blijven weg); weg als niemand ze nog nodig heeft of na uitloggen", () => {
  const first = harness();
  const made = first.spawn("p1").group;
  const dead = made.actors[0];
  const plan = first.runtime.planPlayerAttack({ playerId: "p1", targetId: dead.key + ":1", x: dead.x, z: dead.z, safe: false, attackPower: 100, nowMs: 3000, operationId: "op_kill" });
  assert.equal(plan.plan.killed, true);
  first.runtime.applyPending("op_kill", 3000);
  // Nieuwe vijandenserver op dezelfde database (= herstart).
  const second = harness(first.db);
  const loaded = second.runtime.questGroups.get(made.id);
  assert.ok(loaded, "groep terug uit de database");
  assert.equal(second.runtime.actors.has(dead.key), false, "verslagen wolf komt niet terug");
  assert.equal(second.runtime.actors.has(made.actors[1].key), true);
  assert.equal(second.runtime.canSeeGroup(loaded, "p2"), true, "groepsgenoot ziet ze nog");
  // Quest nog bezig: blijven. Niemand meer: weg.
  let need = ["p1"];
  second.runtime.questKeeper = () => ({ open: need, need });
  second.runtime.keepQuestGroups(10000);
  assert.ok(second.runtime.questGroups.has(made.id));
  need = [];
  second.runtime.keepQuestGroups(12000);
  assert.equal(second.runtime.questGroups.has(made.id), false);
  assert.equal(second.runtime.actors.has(made.actors[1].key), false);
  assert.equal(first.db.prepare("SELECT COUNT(*) AS n FROM quest_spawn_groups").get().n, 0);
  // Weg na uitloggen: even weg (reconnect) houdt ze, langer dan 1 minuut niet; de regel mag dan opnieuw.
  const third = harness();
  const logout = third.spawn("p1", { despawn: "logout" }).group;
  const released = [];
  third.runtime.questKeeper = () => ({ open: ["p1"], need: ["p1"] });
  third.runtime.questReleased = (group) => released.push(group.id);
  third.online.delete("p1");
  third.runtime.keepQuestGroups(30000);
  assert.ok(third.runtime.questGroups.has(logout.id), "reconnect binnen een minuut houdt ze");
  third.runtime.keepQuestGroups(70000);
  assert.equal(third.runtime.questGroups.has(logout.id), false);
  assert.deepEqual(released, [logout.id]);
});

test("stap 5: oogsten Ieder zijn eigen: voor jou weg, de ander ziet en oogst hem nog", () => {
  const { runtime, players, sent } = harness();
  const bushSection = runtime.section;
  bushSection.resourceSpawns = [{ resourceSpawnId: "b1", resourceId: "bush", xMm: 20000, zMm: 20000 }];
  runtime.buildId = null;
  runtime.ensureBuild(1000);
  for (const player of players) { player.x = 20; player.z = 20; }
  const gather = (playerId, op) => runtime.planGather({ playerId, targetId: "res:b1:1", x: 20, z: 20, nowMs: 2000, operationId: op });
  const mine = gather("p1", "g1");
  assert.equal(mine.plan.personal, true);
  runtime.applyPending("g1", 2000);
  assert.match(gather("p1", "g2").result.message, /al geoogst/);
  assert.ok(gather("p2", "g3").plan, "p2 kan hem nog oogsten");
  runtime.dropPending("g3");
  runtime.lastStepAtMs = 2000;
  runtime.sendSnapshots(2000);
  const state = (playerId) => sent.filter(([to, payload]) => to === playerId && payload.type === "actor:snapshot").flatMap(([, payload]) => payload.actors).filter((actor) => actor.id === "res:b1:1").pop()?.s;
  assert.equal(state("p1"), "d");
  assert.equal(state("p2"), "i");
});

// ---- quest-motor: Als → Dan ----

function questSetup() {
  const compiled = compileCanonical(docs(), {});
  assert.deepEqual(compiled.errors, []);
  const project = buildRuntimeWorld(JSON.parse(compiled.files["server.json"].text)).gameProject;
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort()) db.exec(fs.readFileSync("db/migrations/" + file, "utf8"));
  const stamp = new Date().toISOString();
  db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES ('u1', 'speler1', 'x', 'x', 'player', ?, ?)").run(stamp, stamp);
  db.prepare("INSERT INTO player_profiles (id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at) VALUES ('p1', 'u1', 'speler1', 'class.held', 'world.main', ?, ?)").run(stamp, stamp);
  db.prepare("INSERT INTO player_progression (player_id, level, xp, skill_points, revision, updated_at) VALUES ('p1', 1, 0, 0, 1, ?)").run(stamp);
  const node03 = Object.create(Node03RuntimeService.prototype);
  node03.db = db;
  const sent = [];
  const spawns = [];
  const actorRuntime = { spawnQuestGroup: (request) => { spawns.push(request); return { created: true }; } };
  const mmo = { sendToPlayer: (id, payload) => sent.push([id, payload]), partyRuntime: { notice: () => {} }, actorRuntime };
  const n4 = new Node04QuestRuntimeService(db, null, mmo, node03);
  const ctx = () => ({ profile: { id: "p1" }, worldId: "world.main", zoneId: WORLD_ZONE_ID, project, catalogs: project.catalogs, position: { x: 3, z: 4 } });
  const row = () => db.prepare("SELECT * FROM player_quest_states WHERE player_id = 'p1' AND quest_id = 'quest.hout'").get();
  return { db, n4, ctx, row, sent, spawns, actorRuntime };
}

test("stap 5: bij het 5e hout verschijnen de wolven 1×; bericht bij de start; alleen de wolven van de verschijning tellen", async () => {
  const { n4, ctx, row, sent, spawns, actorRuntime } = questSetup();
  assert.equal(typeof actorRuntime.questKeeper, "function", "de quest-motor bewaakt de quest-groepen");
  n4.acceptQuest(ctx(), "quest.hout", "op_accept");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.ok(sent.some(([id, payload]) => id === "p1" && payload.type === "quest:message" && payload.text === "Verzamel 10 hout!"), "bericht in beeld bij de start");
  const wood = (n) => n4.onQuestEvent(ctx(), ["p1"], { type: "gather", refId: "bush", eventKey: "gather:" + n, operationId: "op_g" + n, at: { x: 0, z: 0 } });
  for (let n = 1; n <= 4; n += 1) wood(n);
  assert.equal(spawns.length, 0);
  wood(5);
  assert.equal(spawns.length, 1, "bij het 5e hout");
  assert.equal(spawns[0].spawnId, "wolven");
  assert.equal(spawns[0].audience, "group");
  assert.deepEqual(spawns[0].center, { x: 3, z: 4 }, "rond de speler");
  wood(6);
  n4.syncAutoProgress(ctx());
  assert.equal(spawns.length, 1, "de regel gaat 1× per keer in de stap");
  for (let n = 7; n <= 10; n += 1) wood(n);
  assert.equal(row().active_step_id, "wolf");
  const kill = (n, spawn) => n4.onQuestEvent(ctx(), ["p1"], { type: "defeat", refId: "wolf", eventKey: "defeat:" + n, operationId: "op_k" + n, at: { x: 0, z: 0 }, spawn });
  kill(1, null);
  assert.equal(n4.loadObjectiveProgress("p1", "quest.hout", "wolf").get("o_wolf")?.current_value || 0, 0, "een gewone wolf telt niet");
  kill(2, { groupId: "g", questId: "quest.hout", spawnId: "wolven" });
  kill(3, { groupId: "g", questId: "andere.quest", spawnId: "wolven" });
  assert.equal(n4.loadObjectiveProgress("p1", "quest.hout", "wolf").get("o_wolf").current_value, 1, "alleen de wolvengroep van deze quest");
  kill(4, { groupId: "g", questId: "quest.hout", spawnId: "wolven" });
  kill(5, { groupId: "g", questId: "quest.hout", spawnId: "wolven" });
  assert.equal(row().status, "completed");
  // De bewaker: na de quest heeft niemand de groep nog nodig.
  assert.deepEqual(n4.questSpawnNeeds({ members: new Set(["p1"]), questId: "quest.hout", despawn: "quest", stepId: "hout" }), { open: [], need: [] });
});
