// Quest Builder stap 8 (7-11): begeleiden en beschermen. Quest-check en build van het doel 🛡️ Begeleid; op de server:
// de NPC volgt (en raakt niet kwijt), loopt zelf de weg en wacht, vijanden vallen hem aan, dood = de stap begint opnieuw
// (of de quest mislukt), uitloggen tijdens begeleiden, en aangekomen in het gebied = doel klaar.
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
import { areaCirclePointsMm } from "../apps/web/public/shared/area-soorten.js";

const doc = (kind, key, body) => ({ docKey: key, kind, body, archived: false, revision: 1, legacyRef: null });

const escortQuest = (questId, objective) => ({
  questId, displayName: "Breng de boer", giverRef: "npc:npc.boer", rewardXp: 10,
  steps: [
    { stepId: "begeleid", kind: "step", match: "all", objectives: [Object.assign({ objectiveId: "o_boer", type: "escort", ref: "npc:npc.boer", areaRef: "area:dorp", health: 30 }, objective)], next: [{ to: "end" }] },
    { stepId: "end", kind: "end", title: "Veilig" }
  ]
});

function docs(extra = []) {
  return [
    doc("project_settings", "project_settings", { gameName: "GK", maxLevel: 50 }),
    doc("player_class", "player_class:class.held", { classId: "class.held", displayName: "Held", abilityRef: "ability:player.hit" }),
    doc("ability", "ability:player.hit", { abilityId: "player.hit", displayName: "Slag", baseDamage: 16, powerScalingBp: 5000, armorFactorBp: 3500, rangeMm: 2800, cooldownMs: 250 }),
    doc("ability", "ability:wolf.bite", { abilityId: "wolf.bite", displayName: "Beet", baseDamage: 8, powerScalingBp: 3500, armorFactorBp: 2500, rangeMm: 1500, cooldownMs: 1000 }),
    doc("actor_archetype", "actor_archetype:wolf", { actorId: "wolf", displayName: "Wolf", healthMax: 30, attackPower: 10, armor: 0, abilityRef: "ability:wolf.bite", behavior: "aggressive",
      aggroRangeMm: 8000, leashRangeMm: 30000, moveSpeedMmPerS: 4000, radiusMm: 500, xpReward: 20, respawnMs: 5000 }),
    doc("npc", "npc:npc.boer", { npcId: "npc.boer", displayName: "Boer", x: -4, y: 0, z: 4, walkClip: "Walk" }),
    doc("area", "area:dorp", { areaId: "dorp", displayName: "Dorp", soort: "questgebied", shape: "polygon", pointsMm: areaCirclePointsMm(40000, 0, 5000) }),
    doc("quest", "quest:quest.boer", escortQuest("quest.boer", {})),
    doc("quest", "quest:quest.zwak", escortQuest("quest.zwak", { walk: "lead", death: "fail", text: "Ik loop voor!", health: 10 })),
    doc("quest", "quest:quest.vecht", escortQuest("quest.vecht", { fight: true, power: 50 })),
    doc("quest", "quest:quest.praat", (() => { const quest = escortQuest("quest.praat", {}); quest.steps[0].objectives.push({ objectiveId: "o_praat", type: "talk", ref: "npc:npc.boer" }); return quest; })())
  ].concat(extra);
}

test("stap 8: quest-check zegt wat er mist bij begeleiden", () => {
  const broken = doc("quest", "quest:quest.kapot", {
    questId: "quest.kapot", displayName: "Kapot", giverRef: "npc:npc.boer",
    steps: [
      { stepId: "s1", kind: "step", match: "all", objectives: [{ objectiveId: "o1", type: "escort", ref: "npc:npc.boer", death: "step" },
        { objectiveId: "o2", type: "escort", ref: "npc:npc.boer", areaRef: "area:dorp", death: "step", deathTo: "weg" }], next: [{ to: "end" }] },
      { stepId: "end", kind: "end" }
    ]
  });
  const messages = compileCanonical(docs([broken]), {}).errors.filter((error) => error.code === "QUEST_CHECK").map((error) => error.message).join(" | ");
  assert.match(messages, /kies naar welk Questgebied/);
  assert.match(messages, /Als hij doodgaat: kies naar welke stap/);
  assert.match(messages, /Als hij doodgaat: gaat naar een stap die niet \(meer\) bestaat/);
  assert.match(messages, /Hooguit één NPC begeleiden per stap/);
  assert.ok(validateDocument("quest", escortQuest("quest.x", { walk: "rennen" })).issues.some((issue) => /Hoe gaat hij mee/.test(issue.message)), "onbekend Hoe");
  assert.ok(validateDocument("quest", escortQuest("quest.x", {})).ok);
  assert.ok(validateDocument("quest", escortQuest("quest.x", { fight: "ja" })).issues.length > 0, "Vecht mee is ja of nee");
  assert.ok(validateDocument("quest", escortQuest("quest.x", { fight: true, power: 0 })).issues.length > 0, "schade minstens 1");
  assert.ok(validateDocument("npc", { npcId: "npc.a", displayName: "A", x: 0, z: 0, walkClip: "Walk" }).ok, "NPC heeft een loop-animatie");
});

test("stap 8: build zet wie, waarheen, hoe, levens, zin en dood (standaard niet opgeslagen); de game kent de NPC", () => {
  const compiled = compileCanonical(docs(), {});
  assert.deepEqual(compiled.errors, []);
  const quests = buildRuntimeWorld(JSON.parse(compiled.files["server.json"].text)).gameProject.campaigns.quests.byId;
  const plain = quests["quest.boer"].stepsById.begeleid.objectives[0];
  assert.equal(plain.objectiveType, "escort");
  assert.equal(plain.displayName, "Begeleid Boer naar Dorp");
  assert.equal(plain.npcRef, "npc.boer");
  assert.equal(plain.areaRef, "dorp");
  assert.equal(plain.health, 30);
  assert.equal("walk" in plain || "death" in plain || "say" in plain || "targetRef" in plain, false, "standaard = geen veld; geen praat-doel");
  const weak = quests["quest.zwak"].stepsById.begeleid.objectives[0];
  assert.deepEqual([weak.walk, weak.death, weak.say, weak.health], ["lead", "fail", "Ik loop voor!", 10]);
  assert.equal("fight" in plain || "power" in plain, false, "standaard vecht hij niet mee");
  const fighter = quests["quest.vecht"].stepsById.begeleid.objectives[0];
  assert.deepEqual([fighter.fight, fighter.power], [true, 50]);
  const client = compileActorSection(docs()).client;
  assert.deepEqual(client.npcs["npc.boer"], { displayName: "Boer", modelAssetId: null, modelScaleBp: 10000, idleClip: null, walkClip: "Walk" });
});

// ---- server: vijandenserver + quest-motor samen ----

// Een NPC staat op zijn vaste plek met een botsing (zoals in de game).
const NPC_SOLID = { x: -4, z: 4, radius: 0.6 };
const nearHome = (actor) => Math.hypot(actor.x - NPC_SOLID.x, actor.z - NPC_SOLID.z) < 2.5;

// friend = een groepsgenoot (p2) zonder de quest.
// solids = extra botsingen in de wereld (bijv. een rots op de weg).
function setup({ friend = null, solids = [] } = {}) {
  const compiled = compileCanonical(docs(), {});
  assert.deepEqual(compiled.errors, []);
  const project = buildRuntimeWorld(JSON.parse(compiled.files["server.json"].text)).gameProject;
  const section = compileActorSection(docs()).server;
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort()) db.exec(fs.readFileSync("db/migrations/" + file, "utf8"));
  const stamp = new Date().toISOString();
  db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES ('u1', 'speler1', 'x', 'x', 'player', ?, ?)").run(stamp, stamp);
  db.prepare("INSERT INTO player_profiles (id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at) VALUES ('p1', 'u1', 'speler1', 'class.held', 'world.main', ?, ?)").run(stamp, stamp);
  db.prepare("INSERT INTO player_progression (player_id, level, xp, skill_points, revision, updated_at) VALUES ('p1', 1, 0, 0, 1, ?)").run(stamp);
  const me = { player_id: "p1", world_id: "world.main", x: -2, z: 4, current_area_id: null };
  const mate = friend ? Object.assign({ player_id: "p2", world_id: "world.main", current_area_id: null }, friend) : null;
  const online = new Set(mate ? ["p1", "p2"] : ["p1"]);
  const sent = [];
  const index = { ground: null, walkables: [], blockers: [], surfaceBlockers: [] };
  const runtime = new ActorRuntime({
    db,
    canonicalBuild: () => ({ buildId: "b_test", data: { actors: section } }),
    worldContext: () => ({ worldId: "world.main", walkabilityIndex: index, solidColliders: [NPC_SOLID].concat(solids), world: { player: { moveSpeed: 6 } } }),
    spatial: () => ({ index: null }),
    playerStates: () => (mate ? [me, mate] : [me]),
    isOnline: (id) => online.has(id),
    isDefeated: () => false,
    connections: () => Array.from(online).map((id) => ({ id: "c_" + id, player: { id } })),
    send: (connection, payload) => sent.push([connection.player.id, payload]),
    partyOf: () => (mate ? "party1" : null)
  });
  runtime.setCombatBridge({ applyActorHit: () => ({ damage: 1, remainingHealth: 99, defeated: false }) });
  const node03 = Object.create(Node03RuntimeService.prototype);
  node03.db = db;
  const ctx = () => ({ profile: { id: "p1" }, worldId: "world.main", zoneId: WORLD_ZONE_ID, project, catalogs: project.catalogs, position: { x: me.x, z: me.z } });
  node03.adminContextForPlayer = () => Object.assign(ctx(), { position: null });
  const mmo = { sendToPlayer: (id, payload) => sent.push([id, payload]), partyRuntime: { notice: () => {} }, actorRuntime: runtime };
  const n4 = new Node04QuestRuntimeService(db, null, mmo, node03);
  let now = Date.now();
  runtime.ensureBuild(now);
  const tick = (times = 1) => { for (let n = 0; n < times; n += 1) { now += 100; runtime.tick("world.main", now, 100); } };
  const escort = (questId) => {
    const group = Array.from(runtime.questGroups.values()).find((entry) => entry.questId === questId && entry.escort && !entry.escort.dead);
    return group ? runtime.escortActor(group) : null;
  };
  const row = (questId) => db.prepare("SELECT * FROM player_quest_states WHERE player_id = 'p1' AND quest_id = ?").get(questId);
  // Een wolf van dezelfde quest (anders heeft niemand hem nodig en is hij meteen weg).
  const wolfAt = (x, z, questId) => {
    const made = runtime.spawnQuestGroup({ worldId: "world.main", questId, spawnId: "wolven", audience: "all", playerId: "p1", actorId: "wolf", count: 1, center: { x, z } }, now);
    const wolf = runtime.actors.get(made.group.actors[0].key);
    wolf.x = x; wolf.z = z; wolf.home = { x, z }; wolf.nextAttackAtMs = 0;
    return made.group;
  };
  return { runtime, n4, ctx, me, mate, online, sent, tick, escort, row, wolfAt, later: (ms) => { now += ms; }, now: () => now };
}

test("stap 8: de NPC volgt jou, raakt niet kwijt en alleen jij ziet hem; spelers kunnen hem niet raken", () => {
  const { runtime, n4, ctx, me, sent, tick, escort } = setup();
  n4.acceptQuest(ctx(), "quest.boer", "op_accept");
  const boer = escort("quest.boer");
  assert.ok(boer, "de boer gaat mee zodra de stap begint");
  assert.ok(nearHome(boer), "hij begint naast zijn eigen plek (niet in zijn eigen botsing)");
  assert.deepEqual([boer.hp, boer.hpMax], [30, 30], "met zijn levens");
  tick();
  const snapshot = sent.filter(([, payload]) => payload.type === "actor:snapshot").flatMap(([, payload]) => payload.actors).find((actor) => actor.id === boer.id);
  assert.equal(snapshot.k, "e");
  assert.equal(snapshot.d, "npc.boer");
  assert.throws(() => runtime.planPlayerAttack({ playerId: "p1", targetId: boer.id, x: boer.x, z: boer.z, safe: false, attackPower: 10, nowMs: Date.now(), operationId: "op_hit" }), /geen vijand/);
  // Volgen: hij gaat meteen mee (niet eerst stilstaan), en rent je achterna als je wegrent.
  me.x = 2; me.z = 4;
  tick(3);
  assert.ok(boer.x > -2.5, "hij loopt meteen mee (x " + boer.x.toFixed(1) + ")");
  me.x = 20; me.z = 4;
  tick(30);
  assert.ok(Math.hypot(me.x - boer.x, me.z - boer.z) < 4, "hij haalt je in (afstand " + Math.hypot(me.x - boer.x, me.z - boer.z).toFixed(1) + " m)");
  // Kwijt: je bent ineens ver weg (of hij zit vast); hij komt naast je staan.
  me.x = 60; me.z = -40;
  tick();
  assert.ok(Math.hypot(me.x - boer.x, me.z - boer.z) < 3, "hij staat weer naast je");
  assert.equal(escort("quest.boer"), boer, "dezelfde NPC (geen tweede)");
  n4.syncAutoProgress(ctx());
  assert.equal(runtime.questGroups.size, 1, "vaker de stand vragen geeft geen tweede NPC");
});

test("stap 8: vijanden vallen hem aan; dood = de stap begint opnieuw met de NPC bij het begin; aangekomen = doel klaar", async () => {
  const { runtime, n4, ctx, me, sent, tick, escort, row, wolfAt } = setup();
  n4.acceptQuest(ctx(), "quest.boer", "op_accept");
  const boer = escort("quest.boer");
  me.x = -2; me.z = 6; // vlakbij: hij blijft staan
  const wolves = wolfAt(-4, 1, "quest.boer");
  for (let n = 0; n < 80 && boer.state !== "dead"; n += 1) tick();
  assert.equal(boer.state, "dead", "de wolf heeft de boer verslagen");
  assert.ok(sent.some(([, payload]) => payload.type === "actor:event" && payload.e === "attack" && payload.target === boer.id), "de aanval op de boer gaat naar de game");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.ok(sent.some(([, payload]) => payload.type === "quest:message" && /Boer is gevallen\. De stap begint opnieuw/.test(payload.text)), "bericht in beeld");
  assert.equal(row("quest.boer").status, "active");
  assert.equal(row("quest.boer").active_step_id, "begeleid", "de stap begint opnieuw");
  const fresh = escort("quest.boer");
  assert.ok(fresh && fresh !== boer, "een nieuwe boer staat klaar");
  assert.ok(nearHome(fresh) && fresh.hp === 30, "bij het begin, met al zijn levens");
  runtime.removeQuestGroup(wolves, "done");
  // Naar het dorp: hij komt naast je staan (in het gebied) en is er dan.
  me.x = 40; me.z = 0;
  tick(3);
  assert.equal(row("quest.boer").status, "completed", "aangekomen: doel klaar en de quest is af");
  tick(25);
  runtime.keepQuestGroups(Date.now() + 60000);
  assert.equal(escort("quest.boer"), null, "na de quest is hij weg");
});

test("stap 8: zelf de weg lopen en wachten; dood met Quest mislukt", async () => {
  const { n4, ctx, me, sent, tick, escort, row, wolfAt } = setup();
  me.x = 30; me.z = 30; // te ver weg: hij wacht
  n4.acceptQuest(ctx(), "quest.zwak", "op_accept");
  const boer = escort("quest.zwak");
  const start = [boer.x, boer.z];
  tick();
  assert.ok(sent.some(([, payload]) => payload.type === "actor:event" && payload.e === "say" && payload.text === "Ik loop voor!"), "hij zegt zijn zin (ballon)");
  tick(10);
  assert.deepEqual([boer.x, boer.z], start, "hij wacht op je (ook als je heel ver weg bent: niet naar je toe springen)");
  me.x = -6; me.z = 4; // dichtbij (achter hem): hij loopt zelf richting het dorp, niet naar jou
  tick(20);
  assert.ok(boer.x > 0, "hij loopt de weg (x " + boer.x.toFixed(1) + ")");
  wolfAt(boer.x + 2, boer.z, "quest.zwak");
  for (let n = 0; n < 80 && boer.state !== "dead"; n += 1) { me.x = boer.x - 3; me.z = boer.z; tick(); }
  assert.equal(boer.state, "dead");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(row("quest.zwak").status, "failed", "de quest is mislukt");
  assert.ok(sent.some(([, payload]) => payload.type === "quest:message" && /De quest is mislukt/.test(payload.text)));
});

test("stap 8: uitloggen tijdens begeleiden: hij wacht 1 minuut, daarna weg; terug = hij staat weer op zijn plek", () => {
  const { runtime, n4, ctx, me, online, tick, escort, later } = setup();
  n4.acceptQuest(ctx(), "quest.boer", "op_accept");
  const boer = escort("quest.boer");
  me.x = 10; me.z = 4;
  tick(10);
  const spot = [boer.x, boer.z];
  online.delete("p1");
  tick(25);
  assert.deepEqual([boer.x, boer.z], spot, "hij wacht waar hij is");
  assert.ok(escort("quest.boer"), "binnen een minuut is hij er nog");
  later(61000);
  tick(25);
  assert.equal(escort("quest.boer"), null, "na een minuut weg");
  online.add("p1");
  n4.syncAutoProgress(ctx());
  const back = escort("quest.boer");
  assert.ok(back, "terug: hij staat weer klaar");
  assert.ok(nearHome(back), "op zijn eigen plek");
  assert.equal(runtime.questGroups.size, 1);
});

test("stap 8: vijanden gaan eerst op hem af; sla je ze, dan komen ze op jou af; Vecht mee laat de laatste klap aan jou", () => {
  const { runtime, n4, ctx, me, sent, tick, escort, wolfAt, now } = setup();
  n4.acceptQuest(ctx(), "quest.vecht", "op_accept");
  const boer = escort("quest.vecht");
  me.x = boer.x + 1; me.z = boer.z - 1; // jij staat dichter bij de wolf dan hij, toch kiest de wolf hem
  const wolf = runtime.actors.get(wolfAt(boer.x + 1, boer.z - 5, "quest.vecht").actors[0].key);
  tick();
  assert.equal(wolf.state, "engage");
  assert.equal(wolf.targetEscort, true, "de wolf valt de NPC aan");
  for (let n = 0; n < 40 && wolf.hp > 1; n += 1) tick();
  assert.equal(wolf.hp, 1, "hij vecht mee, maar de laatste klap is voor jou");
  assert.ok(sent.some(([, payload]) => payload.type === "actor:event" && payload.e === "hit" && payload.by === boer.id && payload.id === wolf.id), "zijn klap gaat naar de game");
  me.x = wolf.x + 1; me.z = wolf.z;
  wolf.hp = 30; // even weer vol, zodat jouw klap hem niet verslaat
  const hit = runtime.planPlayerAttack({ playerId: "p1", targetId: wolf.id, x: me.x, z: me.z, safe: false, attackPower: 1, nowMs: now(), operationId: "op_slag" });
  assert.ok(hit.plan && !hit.plan.killed);
  runtime.applyPending("op_slag", now());
  assert.deepEqual([wolf.targetEscort, wolf.targetPlayerId], [false, "p1"], "jij slaat hem: nu komt hij op jou af");
});

test("stap 8: in een groep volgt en wacht hij alleen bij wie de quest heeft", () => {
  const { n4, ctx, me, mate, tick, escort } = setup({ friend: { x: -2, z: 6 } });
  n4.acceptQuest(ctx(), "quest.boer", "op_accept");
  const boer = escort("quest.boer");
  me.x = 15; me.z = 4; // jij (met de quest) loopt weg, je groepsgenoot (zonder quest) blijft naast hem staan
  tick(30);
  assert.ok(Math.hypot(me.x - boer.x, me.z - boer.z) < 4, "hij gaat mee met jou, niet met " + mate.player_id);
});

test("stap 8: aangekomen en de stap heeft nog een doel (praat met hem): hij gaat weg en staat weer op zijn vaste plek", () => {
  const { runtime, n4, ctx, me, tick, escort, row, later } = setup();
  n4.acceptQuest(ctx(), "quest.praat", "op_accept");
  me.x = 40; me.z = 0;
  tick(3);
  assert.equal(row("quest.praat").active_step_id, "begeleid", "de stap wacht nog op praten");
  later(1000);
  runtime.keepQuestGroups(Date.now() + 60000);
  later(5000);
  tick();
  runtime.keepQuestGroups(Date.now() + 120000);
  assert.equal(escort("quest.praat"), null, "hij loopt niet meer mee: de gewone NPC (met naam en praten) is terug");
});

test("stap 8: Loopt zelf volgt een route om een rots heen (niet rechtdoor)", () => {
  const rock = { x: 18, z: 3, radius: 4 };
  const { n4, ctx, me, tick, escort } = setup({ solids: [rock] });
  n4.acceptQuest(ctx(), "quest.zwak", "op_accept");
  const boer = escort("quest.zwak");
  let around = false;
  for (let n = 0; n < 250 && boer.x < 30; n += 1) {
    me.x = boer.x - 3; me.z = boer.z; // jij loopt achter hem aan
    tick();
    if (n === 2) assert.deepEqual(boer.pathGoal, { x: 40, z: 0 }, "hij loopt over een route naar het gebied");
    assert.ok(Math.hypot(boer.x - rock.x, boer.z - rock.z) >= rock.radius, "niet door de rots");
    if (Math.abs(boer.x - rock.x) < 1 && Math.abs(boer.z - rock.z) > rock.radius) around = true;
  }
  assert.ok(around, "om de rots heen");
  assert.ok(boer.x >= 30, "voorbij de rots (x " + boer.x.toFixed(1) + ")");
});
