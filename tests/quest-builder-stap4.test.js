// Quest Builder stap 4 (5-11): start en voorwaarden. Quest-check bij de build, en op de server:
// level te laag, item ontbreekt, brief 2× lezen start 1×, EN/OF, klasse, vanzelf na een andere quest,
// starten in een gebied, en questitems (eigen vak, weg als de quest klaar is).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { compileCanonical } from "../src/server/authoring/build-service.js";
import { buildRuntimeWorld, WORLD_ZONE_ID } from "../src/server/authoring/world-builder.js";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { Node03RuntimeService } from "../src/server/node03-runtime-service.js";
import { Node04QuestRuntimeService } from "../src/server/node04-quest-runtime-service.js";
import { areaCirclePointsMm } from "../apps/web/public/shared/area-soorten.js";

const doc = (kind, key, body) => ({ docKey: key, kind, body, archived: false, revision: 1, legacyRef: null });
const talkSteps = (npc = "npc:npc.smid") => [
  { stepId: "praat", kind: "step", match: "all", objectives: [{ objectiveId: "o", type: "talk", ref: npc }], next: [{ to: "end" }] },
  { stepId: "end", kind: "end", title: "Klaar" }
];

function docs(extra = []) {
  return [
    doc("project_settings", "project_settings", { gameName: "GK", maxLevel: 50 }),
    doc("player_class", "player_class:class.held", { classId: "class.held", displayName: "Held", abilityRef: "ability:player.hit" }),
    doc("player_class", "player_class:class.magier", { classId: "class.magier", displayName: "Magier", abilityRef: "ability:player.hit" }),
    doc("ability", "ability:player.hit", { abilityId: "player.hit", displayName: "Slag", baseDamage: 16, powerScalingBp: 5000, armorFactorBp: 3500, rangeMm: 2800, cooldownMs: 250 }),
    doc("item_definition", "item_definition:brief", { itemId: "brief", displayName: "Brief", category: "quest", rarity: "quest", stackable: false, stackLimit: 1, questItem: true }),
    doc("item_definition", "item_definition:sleutel", { itemId: "sleutel", displayName: "Sleutel", category: "material", rarity: "common", stackable: true, stackLimit: 99 }),
    doc("npc", "npc:npc.boer", { npcId: "npc.boer", displayName: "Boer", x: -4, y: 0, z: 4 }),
    doc("npc", "npc:npc.smid", { npcId: "npc.smid", displayName: "Smid", x: 4, y: 0, z: 4 }),
    doc("area", "area:veld", { areaId: "veld", displayName: "Veld", soort: "questgebied", shape: "polygon", pointsMm: areaCirclePointsMm(20000, 20000, 5000) }),
    // Brief uit een kist: alleen vanaf level 10.
    doc("quest", "quest:quest.brief", { questId: "quest.brief", displayName: "De brief", rewardXp: 10, steps: talkSteps(),
      start: { mode: "item", itemRef: "item_definition:brief", rules: [{ type: "level", min: 10 }] } }),
    // Bij een NPC, maar alleen met een sleutel.
    doc("quest", "quest:quest.deur", { questId: "quest.deur", displayName: "De deur", giverRef: "npc:npc.boer", rewardXp: 5, steps: talkSteps(),
      start: { rules: [{ type: "item", ref: "item_definition:sleutel", amount: 1 }] } }),
    // OF: level 10 of klasse Held.
    doc("quest", "quest:quest.of", { questId: "quest.of", displayName: "Of of", giverRef: "npc:npc.boer", steps: talkSteps(),
      start: { match: "any", rules: [{ type: "level", min: 10 }, { type: "class", ref: "player_class:class.held" }] } }),
    // Vanzelf zodra De deur af is.
    doc("quest", "quest:quest.vervolg", { questId: "quest.vervolg", displayName: "Vervolg", steps: talkSteps(),
      start: { mode: "auto", rules: [{ type: "quest", ref: "quest:quest.deur" }] } }),
    // In het veld lopen.
    doc("quest", "quest:quest.veld", { questId: "quest.veld", displayName: "Het veld", steps: talkSteps(), start: { mode: "area", areaRef: "area:veld" } })
  ].concat(extra);
}

function world() {
  const compiled = compileCanonical(docs(), {});
  assert.deepEqual(compiled.errors, []);
  return buildRuntimeWorld(JSON.parse(compiled.files["server.json"].text)).gameProject;
}

function setup() {
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort()) db.exec(fs.readFileSync("db/migrations/" + file, "utf8"));
  const stamp = new Date().toISOString();
  db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES ('u1', 'speler1', 'x', 'x', 'player', ?, ?)").run(stamp, stamp);
  db.prepare("INSERT INTO player_profiles (id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at) VALUES ('p1', 'u1', 'speler1', 'class.magier', 'world.main', ?, ?)").run(stamp, stamp);
  db.prepare("INSERT INTO player_progression (player_id, level, xp, skill_points, revision, updated_at) VALUES ('p1', 1, 0, 0, 1, ?)").run(stamp);
  const node03 = Object.create(Node03RuntimeService.prototype);
  node03.db = db;
  const sent = [];
  const mmo = { sendToPlayer: (id, payload) => sent.push([id, payload.type]), partyRuntime: { notice: (ids, text) => sent.push([ids.join(","), text]) } };
  const n4 = new Node04QuestRuntimeService(db, null, mmo, node03);
  const project = world();
  const ctx = (position = { x: -4, z: 4 }) => ({ profile: { id: "p1" }, worldId: "world.main", zoneId: WORLD_ZONE_ID, project, catalogs: project.catalogs, position });
  const row = (questId) => db.prepare("SELECT * FROM player_quest_states WHERE player_id = 'p1' AND quest_id = ?").get(questId);
  const give = (itemId, quantity = 1) => db.prepare("INSERT INTO player_inventory_stacks (stack_id, player_id, item_id, bind_state, quantity, created_at, updated_at) VALUES (?, 'p1', ?, 'none', ?, ?, ?)")
    .run("s_" + itemId + Math.random(), itemId, quantity, stamp, stamp);
  const level = (value) => db.prepare("UPDATE player_progression SET level = ? WHERE player_id = 'p1'").run(value);
  const finish = (questId) => { const quest = project.campaigns.quests.byId[questId]; return n4.completeQuestRun(ctx(), quest, row(questId), quest.stepsById.end, "op_end_" + questId); };
  return { db, node03, n4, ctx, row, give, level, finish, sent, project };
}

test("stap 4: quest-check houdt een quest tegen die niemand kan beginnen", () => {
  const broken = [
    doc("quest", "quest:quest.geen", { questId: "quest.geen", displayName: "Geen gever", steps: talkSteps() }),
    doc("quest", "quest:quest.leeg", { questId: "quest.leeg", displayName: "Lege brief", steps: talkSteps(), start: { mode: "item" } }),
    doc("quest", "quest:quest.hoog", { questId: "quest.hoog", displayName: "Te hoog", giverRef: "npc:npc.boer", steps: talkSteps(), start: { rules: [{ type: "level", min: 60 }] } }),
    doc("quest", "quest:quest.zelf", { questId: "quest.zelf", displayName: "Zelf", giverRef: "npc:npc.boer", steps: talkSteps(), start: { rules: [{ type: "quest", ref: "quest:quest.zelf" }] } }),
    doc("quest", "quest:quest.weg", { questId: "quest.weg", displayName: "Weg", giverRef: "npc:npc.boer", steps: talkSteps(), start: { rules: [{ type: "item", ref: "item_definition:bestaatniet" }] } })
  ];
  const messages = compileCanonical(docs(broken), {}).errors.filter((error) => error.code === "QUEST_START").map((error) => error.message).join(" | ");
  assert.match(messages, /Geen gever: Start: kies wie de quest geeft/);
  assert.match(messages, /Lege brief: Start: kies welk item/);
  assert.match(messages, /Te hoog: Voorwaarde level 60: het hoogste level is 50/);
  assert.match(messages, /Zelf: Voorwaarde: een quest kan niet zichzelf nodig hebben/);
  assert.match(messages, /Weg: Voorwaarde: .*bestaat niet/);
  assert.ok(validateDocument("quest", { questId: "quest.x", displayName: "X", start: { mode: "kist" } }).issues.some((issue) => issue.code === "QUEST_START"), "onbekende start");
});

test("stap 4: build zet start en voorwaarden alleen op quests die ze hebben", () => {
  const quests = world().campaigns.quests.byId;
  assert.equal(quests["quest.brief"].startMode, "item");
  assert.equal(quests["quest.brief"].startItemRef, "brief");
  assert.equal(quests["quest.brief"].startDialogueRef, null, "geen NPC");
  assert.deepEqual(quests["quest.brief"].requirements, { match: "all", rules: [{ type: "level", min: 10 }] });
  assert.equal(quests["quest.veld"].startAreaRef, "veld");
  assert.deepEqual(quests["quest.of"].requirements.rules[1], { type: "class", classRef: "class.held" });
  assert.equal("startMode" in quests["quest.deur"], false, "bij een NPC = standaard, geen extra veld");
  const boer = world().campaigns.dialogues.byId["dialogue.npc.npc.boer"];
  assert.ok(!JSON.stringify(boer).includes("quest.brief"), "de boer biedt de brief-quest niet aan");
});

test("stap 4: brief lezen onder level 10 zegt waarom niet; vanaf 10 start hij, 2× lezen start 1×", () => {
  const { node03, n4, ctx, row, give, level, db } = setup();
  assert.throws(() => node03.useItem(ctx(), { itemId: "brief" }, "op0"), /geen Brief/);
  give("brief");
  assert.throws(() => node03.useItem(ctx(), { itemId: "brief" }, "op1"), /Nodig: level 10 \(jij bent level 1\)/);
  assert.notEqual(row("quest.brief")?.status, "active");
  level(10);
  const read = node03.useItem(ctx(), { itemId: "brief" }, "op2");
  assert.match(read.message, /Brief gelezen\. Nieuwe quest: De brief/);
  assert.equal(row("quest.brief").status, "active");
  assert.throws(() => node03.useItem(ctx(), { itemId: "brief" }, "op3"), /al bezig met "De brief"/);
  const starts = db.prepare("SELECT COUNT(*) AS n FROM quest_transition_audit WHERE player_id = 'p1' AND quest_id = 'quest.brief' AND to_status = 'active'").get().n;
  assert.equal(starts, 1, "2× lezen start 1×");
  assert.equal(node03.ownedItemCount("p1", "brief"), 1, "de brief blijft in je tas");
  assert.equal(node03.loadHudCatalog(ctx()).items.find((item) => item.itemId === "brief").readable, true, "knop Lezen in de tas");
});

test("stap 4: questitem blijft bij verlaten, gaat weg als de quest klaar is", () => {
  const { node03, n4, ctx, row, give, level, finish } = setup();
  give("brief");
  level(10);
  node03.useItem(ctx(), { itemId: "brief" }, "op1");
  const left = n4.abandonQuest(ctx(), "quest.brief", "op2");
  assert.match(left.message, /Lees Brief opnieuw/);
  assert.equal(node03.ownedItemCount("p1", "brief"), 1, "verlaten: brief blijft, dan kun je opnieuw beginnen");
  node03.useItem(ctx(), { itemId: "brief" }, "op3");
  finish("quest.brief");
  assert.equal(row("quest.brief").status, "completed");
  assert.equal(node03.ownedItemCount("p1", "brief"), 0, "klaar: de brief is weg");
});

test("stap 4: item ontbreekt, en EN/OF met klasse", () => {
  const { n4, ctx, give, level, db } = setup();
  n4.ensureAvailableQuests(ctx());
  assert.throws(() => n4.acceptQuest(ctx(), "quest.deur", "op1"), /Nodig: 1× Sleutel in je tas\./);
  const boer = ctx().project.campaigns.dialogues.byId["dialogue.npc.npc.boer"];
  assert.ok(n4.buildDialogueRuntime(ctx(), boer, null).choices.some((choice) => choice.label === "📜 De deur 🔒"), "slotje in het gesprek");
  give("sleutel");
  assert.match(n4.acceptQuest(ctx(), "quest.deur", "op2").message, /Quest aangenomen/);
  // OF: level 10 of klasse Held. Magier op level 1: geen van beide.
  assert.throws(() => n4.acceptQuest(ctx(), "quest.of", "op3"), /Nodig: level 10 \(jij bent level 1\) of klasse Held\./);
  db.prepare("UPDATE player_profiles SET selected_character_id = 'class.held' WHERE id = 'p1'").run();
  assert.match(n4.acceptQuest(ctx(), "quest.of", "op4").message, /Quest aangenomen/, "klasse Held is genoeg");
  level(10);
  db.prepare("UPDATE player_profiles SET selected_character_id = 'class.magier' WHERE id = 'p1'").run();
  n4.abandonQuest(ctx(), "quest.of", "op5");
  assert.match(n4.acceptQuest(ctx(), "quest.of", "op6").message, /Quest aangenomen/, "level 10 is ook genoeg");
});

test("stap 4: vanzelf na een andere quest; die kun je niet verlaten", () => {
  const { n4, ctx, row, give, finish, sent } = setup();
  n4.ensureAvailableQuests(ctx());
  n4.autoStartQuests(ctx());
  assert.notEqual(row("quest.vervolg")?.status, "active", "De deur is nog niet af");
  give("sleutel");
  n4.acceptQuest(ctx(), "quest.deur", "op1");
  finish("quest.deur");
  n4.ensureAvailableQuests(ctx());
  n4.autoStartQuests(ctx());
  assert.equal(row("quest.vervolg").status, "active", "start vanzelf");
  assert.ok(sent.some(([, text]) => text === "Nieuwe quest: Vervolg"));
  assert.throws(() => n4.abandonQuest(ctx(), "quest.vervolg", "op2"), /niet verlaten/);
  const summary = n4.buildQuestSummary(ctx(), ctx().project.campaigns.quests.byId["quest.vervolg"], row("quest.vervolg"));
  assert.equal(summary.canAbandon, false, "geen knop Verlaten");
});

test("stap 4: gebied binnenlopen start de quest; na verlaten pas weer na eruit en erin", () => {
  const { n4, ctx, row } = setup();
  n4.ensureAvailableQuests(ctx());
  n4.autoStartQuests(ctx({ x: 0, z: 0 }));
  assert.equal(row("quest.veld").status, "available", "buiten het veld: niets");
  assert.equal(n4.buildStartAreas(ctx(), new Map([["quest.veld", row("quest.veld")]]))[0].areaId, "veld", "de game let op het startgebied");
  n4.autoStartQuests(ctx({ x: 20, z: 20 }));
  assert.equal(row("quest.veld").status, "active", "erin gelopen: gestart");
  n4.abandonQuest(ctx({ x: 20, z: 20 }), "quest.veld", "op1");
  n4.autoStartQuests(ctx({ x: 20, z: 20 }));
  assert.equal(row("quest.veld").status, "abandoned", "blijft staan in het veld: niet meteen opnieuw");
  n4.autoStartQuests(ctx({ x: 0, z: 0 }));
  n4.autoStartQuests(ctx({ x: 21, z: 20 }));
  assert.equal(row("quest.veld").status, "active", "eruit en weer erin: opnieuw gestart");
});

test("stap 4: uniek item max 1, brief per speler 1× oppakken, niet nog eens als je de quest al doet", () => {
  const { db, node03, n4, ctx, level, project } = setup();
  const items = project.catalogs.items;
  items.brief.unique = true;
  node03.grantItem(ctx(), "brief", 3, "test", "test");
  node03.grantItem(ctx(), "brief", 1, "test", "test");
  assert.equal(node03.ownedItemCount("p1", "brief"), 1, "uniek: nooit meer dan 1");
  db.prepare("DELETE FROM player_inventory_stacks WHERE player_id = 'p1'").run();
  db.prepare("DELETE FROM player_item_instances WHERE player_id = 'p1'").run();
  // Een Pickup met de brief, Oppakken = Ieder 1×.
  const pickup = { instanceId: "kist1", entityKind: "pickup", pickupKind: "item", itemRef: "brief", displayName: "Brief", amount: 1, claimMode: "once", available: true, status: "available" };
  node03.getEntityState = () => ({ state: pickup });
  node03.assertInRange = () => {};
  node03.recordGameplayEvent = () => {};
  node03.saveEntityState = () => { throw new Error("de wereld-pickup hoort niet te veranderen"); };
  assert.match(node03.pickupTarget(ctx(), "kist1", "op1").message, /picked up/);
  assert.equal(node03.ownedItemCount("p1", "brief"), 1);
  assert.ok(node03.pickupClaim("p1", "kist1"), "voor deze speler weg");
  assert.equal(node03.pickupClaim("p2", "kist1"), null, "een ander kan hem nog pakken");
  assert.match(node03.pickupTarget(ctx(), "kist1", "op2").message, /al eens gepakt/);
  // Lezen start de quest; daarna geeft een tweede kist geen tweede brief.
  level(10);
  node03.useItem(ctx(), { itemId: "brief" }, "op3");
  pickup.instanceId = "kist2";
  db.prepare("DELETE FROM player_inventory_stacks WHERE player_id = 'p1'").run();
  db.prepare("DELETE FROM player_item_instances WHERE player_id = 'p1'").run();
  assert.match(node03.pickupTarget(ctx(), "kist2", "op4").message, /al bezig met "De brief"/);
  assert.equal(node03.ownedItemCount("p1", "brief"), 0);
  assert.equal(typeof n4.pickupBlockedReason, "function");
});

test("Kevin 5-11: ⭐ op de kaart volgt de levende vijand (dichtstbij eerst), alleen bij Versla en Verzamel", async () => {
  const { n4, ctx } = setup();
  n4.mmoService = { actorRuntime: { livePositions: (kind, id) => (kind === "actor" && id === "wolf" ? [{ id: "a:2", x: 50, z: 0 }, { id: "a:1", x: 5, z: 0 }] : []) } };
  const step = { objectives: [{ id: "o", objectiveType: "defeat", actorRef: "wolf", mark: "star" }, { id: "p", objectiveType: "defeat", actorRef: "wolf" }] };
  const marks = n4.liveMarks(ctx({ x: 0, z: 0 }), step, [{ objectiveId: "o", complete: false }, { objectiveId: "p", complete: false }]);
  assert.deepEqual(marks.map((mark) => mark.id), ["a:1", "a:2"], "alleen het doel met ster, dichtstbij eerst");
  assert.deepEqual(n4.liveMarks(ctx(), step, [{ objectiveId: "o", complete: true }]), [], "doel klaar = geen ster");
  const { questGraphIssues } = await import("../apps/web/public/shared/quest-graph.js");
  const issues = questGraphIssues([{ stepId: "a", kind: "step", objectives: [{ objectiveId: "o", type: "talk", ref: "npc:npc.smid", mark: "star" }], next: [{ to: "end" }] }, { stepId: "end", kind: "end" }]);
  assert.ok(issues.some((issue) => /Ster op kaart kan alleen bij Versla en Verzamel/.test(issue.message)));
});

test("Kevin 5-11: admin ziet per speler nog niet / bezig (stap) / gedaan; Opnieuw haalt quest, brief en pickup-claim weg", () => {
  const { node03, n4, ctx, row, give, level, db, sent } = setup();
  const stamp = new Date().toISOString();
  const status = () => Object.fromEntries(n4.questPlayersForAdmin("quest.brief").map((player) => [player.username, player.status + (player.stepId ? ":" + player.stepId : "")]));
  assert.deepEqual(status(), { speler1: "none" }, "nog niet");
  give("brief");
  level(10);
  node03.useItem(ctx(), { itemId: "brief" }, "op1");
  assert.deepEqual(status(), { speler1: "active:praat" }, "bezig op stap praat");
  // De brief kwam uit een kist met Oppakken = Ieder 1×.
  db.prepare("INSERT INTO world_entity_state (world_id, zone_id, instance_id, state_kind, state_json, revision, updated_at) VALUES ('world.main', ?, 'kist', 'node03_runtime', ?, 1, ?)")
    .run(WORLD_ZONE_ID, JSON.stringify({ instanceId: "kist", itemRef: "brief" }), stamp);
  db.prepare("INSERT INTO player_pickup_claims (player_id, instance_id, claimed_at, respawn_at) VALUES ('p1', 'kist', ?, NULL)").run(stamp);
  n4.node03RuntimeService.adminContextForPlayer = () => ctx();
  const result = n4.adminQuestAction({ action: "reset", playerId: "p1", questId: "quest.brief" });
  assert.match(result.message, /weg bij deze speler/);
  assert.equal(row("quest.brief"), undefined, "stand weg");
  assert.equal(node03.ownedItemCount("p1", "brief"), 0, "brief weg");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM player_pickup_claims WHERE player_id = 'p1'").get().n, 0, "kist weer te pakken");
  assert.deepEqual(status(), { speler1: "none" });
  n4.adminQuestAction({ action: "step", playerId: "p1", questId: "quest.brief", stepId: "praat" });
  assert.deepEqual(status(), { speler1: "active:praat" }, "Naar stap werkt zonder DEV_GAME_ACTIONS");
  assert.throws(() => n4.adminQuestAction({ action: "iets", playerId: "p1", questId: "quest.brief" }), /Onbekende actie/);
  return new Promise((resolve) => setTimeout(() => { assert.ok(sent.some(([id, type]) => id === "p1" && type === "quest:refresh"), "speler krijgt seintje"); resolve(); }, 60));
});

test("Kevin 5-11: startvenster: verhaal, plaatje en vorige quest in de stand; plaatje alleen in de build als gekozen", () => {
  const extra = [doc("quest", "quest:quest.na", { questId: "quest.na", displayName: "Bart roept", description: "Soldaat Bart heeft je nodig.", imageAssetId: "img.bart",
    steps: talkSteps(), start: { mode: "auto", rules: [{ type: "quest", ref: "quest:quest.deur" }] } })];
  const compiled = compileCanonical(docs(extra), {});
  assert.deepEqual(compiled.errors, []);
  const project = buildRuntimeWorld(JSON.parse(compiled.files["server.json"].text)).gameProject;
  assert.equal(project.campaigns.quests.byId["quest.na"].imageAssetId, "img.bart");
  assert.equal("imageAssetId" in project.campaigns.quests.byId["quest.deur"], false, "geen plaatje = geen veld (versie blijft gelijk)");
  const { n4, ctx, db } = setup();
  const stamp = new Date().toISOString();
  db.prepare("INSERT INTO player_quest_states (player_id, quest_id, status, active_step_id, tracked, accepted_at, revision, state_json, updated_at) VALUES ('p1', 'quest.na', 'active', 'praat', 1, ?, 1, '{}', ?)").run(stamp, stamp);
  const c = Object.assign(ctx(), { project, catalogs: project.catalogs });
  const summary = n4.buildQuestSummary(c, project.campaigns.quests.byId["quest.na"], n4.loadQuestState("p1", "quest.na"));
  assert.equal(summary.startMode, "auto");
  assert.equal(summary.imageAssetId, "img.bart");
  assert.equal(summary.afterQuest, "De deur");
  assert.equal(summary.description, "Soldaat Bart heeft je nodig.");
});
