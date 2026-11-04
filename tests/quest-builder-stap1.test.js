// Quest Builder stap 1 (4-11): stappen en doelen. Quest-check bij de build, en op de server:
// dubbele gebeurtenis telt 1x, meevechters krijgen allebei de kill, verversen houdt voortgang,
// beloning 1x per run, een lopende quest blijft op zijn eigen versie, oude quests werken nog.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { compileCanonical } from "../src/server/authoring/build-service.js";
import { buildRuntimeWorld, WORLD_ZONE_ID } from "../src/server/authoring/world-builder.js";
import { Node03RuntimeService } from "../src/server/node03-runtime-service.js";
import { Node04QuestRuntimeService } from "../src/server/node04-quest-runtime-service.js";
import { questGraphIssues } from "../apps/web/public/shared/quest-graph.js";

const doc = (kind, key, body) => ({ docKey: key, kind, body, archived: false, revision: 1, legacyRef: null });

function wolvenSteps(wolves = 2, share = null) {
  return [
    { stepId: "step.jacht", kind: "step", title: "Op jacht", match: "all", next: [{ to: "step.terug" }], objectives: [
      Object.assign({ objectiveId: "obj.wolf", type: "defeat", ref: "actor_archetype:wolf", amount: wolves, role: "required" }, typeof share === "string" ? { share } : share || {}),
      { objectiveId: "obj.struik", type: "gather", ref: "resource_definition:bush", amount: 1, role: "bonus" }
    ] },
    { stepId: "step.terug", kind: "step", title: "", match: "all", next: [{ to: "end" }], objectives: [
      { objectiveId: "obj.vacht", type: "deliver", ref: "item_definition:pelt", npcRef: "npc:npc.boer", amount: 2 }
    ] },
    { stepId: "end", kind: "end", title: "Klaar" }
  ];
}

function docs(wolves = 2, extra = [], share = null, questExtra = {}) {
  return [
    doc("project_settings", "project_settings", { gameName: "GK" }),
    doc("player_class", "player_class:class.held", { classId: "class.held", displayName: "Held", abilityRef: "ability:player.hit" }),
    doc("item_definition", "item_definition:pelt", { itemId: "pelt", displayName: "Vacht", category: "material", rarity: "common", stackable: true, stackLimit: 99 }),
    doc("region", "region:r1", { regionId: "r1", displayName: "Vlakte", minXMm: 0, maxXMm: 64000, minZMm: 0, maxZMm: 64000 }),
    doc("ability", "ability:player.hit", { abilityId: "player.hit", displayName: "Slag", baseDamage: 16, powerScalingBp: 5000, armorFactorBp: 3500, rangeMm: 2800, cooldownMs: 250 }),
    doc("ability", "ability:wolf.bite", { abilityId: "wolf.bite", displayName: "Beet", baseDamage: 8, powerScalingBp: 3500, armorFactorBp: 2500, rangeMm: 1500, cooldownMs: 1000 }),
    doc("loot_table", "loot_table:wolf", { lootTableId: "wolf", displayName: "Wolf", entries: [{ itemRef: "item_definition:pelt", chanceBp: 10000, minQty: 1, maxQty: 2 }] }),
    doc("actor_archetype", "actor_archetype:wolf", { actorId: "wolf", displayName: "Wolf", healthMax: 30, attackPower: 10, armor: 0, abilityRef: "ability:wolf.bite",
      behavior: "aggressive", aggroRangeMm: 8000, leashRangeMm: 30000, moveSpeedMmPerS: 4000, radiusMm: 500, lootTableRef: "loot_table:wolf", xpReward: 20, respawnMs: 5000 }),
    doc("actor_spawn", "actor_spawn:w1", { spawnId: "w1", archetypeRef: "actor_archetype:wolf", regionRef: "region:r1", xMm: 10000, zMm: 10000 }),
    doc("resource_definition", "resource_definition:bush", { resourceId: "bush", displayName: "Struik", lootTableRef: "loot_table:wolf", gatherRangeMm: 2000, radiusMm: 600, respawnMs: 10000 }),
    doc("resource_spawn", "resource_spawn:b1", { resourceSpawnId: "b1", resourceRef: "resource_definition:bush", regionRef: "region:r1", xMm: 20000, zMm: 20000 }),
    doc("npc", "npc:npc.boer", { npcId: "npc.boer", displayName: "Boer", x: -4, y: 0, z: 4 }),
    doc("npc", "npc:npc.smid", { npcId: "npc.smid", displayName: "Smid", x: 4, y: 0, z: 4 }),
    doc("quest", "quest:quest.wolven", { questId: "quest.wolven", displayName: "Wolven", giverRef: "npc:npc.boer", rewardXp: 50,
      rewards: [{ ref: "item_definition:pelt", amount: 1 }], steps: wolvenSteps(wolves, share), ...questExtra }),
    doc("quest", "quest:quest.smid", { questId: "quest.smid", displayName: "Naar de smid", giverRef: "npc:npc.boer", goal: "visit", targetNpcRef: "npc:npc.smid", rewardXp: 10 })
  ].concat(extra);
}

function world(wolves = 2, share = null, questExtra = {}) {
  const compiled = compileCanonical(docs(wolves, [], share, questExtra), {});
  assert.deepEqual(compiled.errors, []);
  return buildRuntimeWorld(JSON.parse(compiled.files["server.json"].text)).gameProject;
}

function setup() {
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort()) db.exec(fs.readFileSync("db/migrations/" + file, "utf8"));
  const stamp = new Date().toISOString();
  for (const id of ["1", "2"]) {
    db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES (?, ?, 'x', 'x', 'player', ?, ?)").run("u" + id, "speler" + id, stamp, stamp);
    db.prepare("INSERT INTO player_profiles (id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at) VALUES (?, ?, ?, NULL, 'world.main', ?, ?)").run("p" + id, "u" + id, "speler" + id, stamp, stamp);
    db.prepare("INSERT INTO player_progression (player_id, level, xp, skill_points, revision, updated_at) VALUES (?, 1, 0, 0, 1, ?)").run("p" + id, stamp);
  }
  const node03 = Object.create(Node03RuntimeService.prototype);
  node03.db = db;
  const service = () => new Node04QuestRuntimeService(db, null, null, node03);
  let project = world();
  const ctx = (playerId, position = { x: -4, z: 4 }) => ({ profile: { id: playerId }, worldId: "world.main", zoneId: WORLD_ZONE_ID, project, catalogs: project.catalogs, position });
  const row = (playerId, questId) => db.prepare("SELECT * FROM player_quest_states WHERE player_id = ? AND quest_id = ?").get(playerId, questId);
  const xp = (playerId) => db.prepare("SELECT xp FROM player_progression WHERE player_id = ?").get(playerId).xp;
  const give = (playerId, itemId, quantity) => db.prepare("INSERT INTO player_inventory_stacks (stack_id, player_id, item_id, bind_state, quantity, created_at, updated_at) VALUES (?, ?, ?, 'none', ?, ?, ?)")
    .run("s_" + playerId + itemId + quantity + Math.random(), playerId, itemId, quantity, stamp, stamp);
  return { db, node03, service, ctx, row, xp, give, setProject: (next) => { project = next; } };
}

test("quest-check: kapotte stappen houden SAVE TO GAME tegen", () => {
  const broken = wolvenSteps().map((step) => step.stepId === "step.jacht" ? Object.assign({}, step, { next: [{ to: "step.weg" }] }) : step);
  const compiled = compileCanonical(docs(2, [doc("quest", "quest:quest.kapot", { questId: "quest.kapot", displayName: "Kapot", giverRef: "npc:npc.boer", steps: broken })]), {});
  assert.ok(compiled.errors.some((error) => error.code === "QUEST_CHECK" && /Kapot, stap 'Op jacht'/.test(error.message)), JSON.stringify(compiled.errors));
  const found = questGraphIssues([{ stepId: "a", kind: "step", objectives: [{ objectiveId: "o", type: "talk", ref: null }], next: [{ to: "a" }] }]).map((issue) => issue.message).join(" | ");
  assert.match(found, /einde/i);
});

test("build: stappen, doelen met namen en een versie per quest", () => {
  const quest = world().campaigns.quests.byId["quest.wolven"];
  assert.deepEqual(quest.steps.map((step) => step.id), ["step.jacht", "step.terug", "end"]);
  assert.equal(quest.steps[0].objectives[0].actorRef, "wolf");
  assert.equal(quest.steps[0].objectives[0].displayName, "Versla 2× Wolf");
  assert.equal(quest.steps[1].objectives[0].targetRef, "target.npc.npc.boer");
  assert.notEqual(world(3).campaigns.quests.byId["quest.wolven"].version, quest.version, "andere inhoud = andere versie");
});

test("server: dubbele kill telt 1x, meevechters tellen allebei, verversen houdt voortgang", () => {
  const { node03, service, ctx, row } = setup();
  const n4 = service();
  n4.ensureAvailableQuests(ctx("p1"));
  n4.ensureAvailableQuests(ctx("p2"));
  n4.acceptQuest(ctx("p1"), "quest.wolven", "op1");
  n4.acceptQuest(ctx("p2"), "quest.wolven", "op2");
  const kill = (key, ids) => node03.questEvents(ctx("p1"), ids, { type: "defeat", refId: "wolf", eventKey: key, operationId: "op_" + key });
  kill("defeat:w1:1", ["p1", "p2"]);
  kill("defeat:w1:1", ["p1", "p2"]);
  const count = (playerId) => n4.buildQuestSummary(ctx(playerId), ctx(playerId).project.campaigns.quests.byId["quest.wolven"], row(playerId, "quest.wolven"));
  assert.equal(count("p1").activeStep.objectives[0].currentValue, 1, "zelfde kill twee keer = 1");
  assert.equal(count("p2").activeStep.objectives[0].currentValue, 1, "meevechter telt ook");
  node03.questEvents(ctx("p1"), ["p1"], { type: "gather", refId: "bush", eventKey: "gather:b1:1", operationId: "op_g" });
  kill("defeat:w1:2", ["p1"]);
  assert.equal(row("p1", "quest.wolven").active_step_id, "step.terug", "bonus is niet nodig");
  assert.equal(row("p2", "quest.wolven").active_step_id, "step.jacht");
  const fresh = service();
  const summary = fresh.buildQuestSummary(ctx("p2"), ctx("p2").project.campaigns.quests.byId["quest.wolven"], row("p2", "quest.wolven"));
  assert.equal(summary.activeStep.objectives[0].currentValue, 1, "na verversen nog steeds 1/2");
});

test("server: inleveren in het gesprek, beloning 1x per run", () => {
  const { service, ctx, row, xp, give } = setup();
  const n4 = service();
  n4.acceptQuest(ctx("p1"), "quest.wolven", "op1");
  n4.devSetStep(ctx("p1"), "quest.wolven", "step.terug", "op2");
  give("p1", "pelt", 2);
  n4.syncAutoProgress(ctx("p1"));
  assert.equal(row("p1", "quest.wolven").status, "active", "spullen hebben is nog niet inleveren");
  const dialogue = ctx("p1").project.campaigns.dialogues.byId["dialogue.npc.npc.boer"];
  const choice = n4.buildDialogueRuntime(ctx("p1"), dialogue, null).choices.find((item) => item.label.startsWith("📦"));
  assert.ok(choice, "inleverkeuze staat in het gesprek");
  assert.throws(() => n4.chooseDialogue(ctx("p1", { x: 40, z: 40 }), { dialogueId: dialogue.id, choiceId: choice.choiceId }, "op3"), /te ver/);
  const done = n4.chooseDialogue(ctx("p1"), { dialogueId: dialogue.id, choiceId: choice.choiceId }, "op4");
  assert.match(done.message, /Quest voltooid/);
  assert.equal(row("p1", "quest.wolven").status, "completed");
  assert.equal(xp("p1"), 50);
  assert.throws(() => n4.chooseDialogue(ctx("p1"), { dialogueId: dialogue.id, choiceId: choice.choiceId }, "op5"), /niet meer geldig/);
  const quest = ctx("p1").project.campaigns.quests.byId["quest.wolven"];
  const again = n4.completeQuestRun(ctx("p1"), quest, row("p1", "quest.wolven"), quest.stepsById.end, "op6");
  assert.deepEqual(again.grants, [], "zelfde run: geen tweede beloning");
  assert.equal(xp("p1"), 50);
  const once = n4.buildQuestSummary(ctx("p1"), quest, row("p1", "quest.wolven"));
  assert.equal(once.status, "completed", "1x per personage: naar het Archief");
  assert.equal(once.doneBefore, true);
  const repeat = n4.buildQuestSummary(ctx("p1"), Object.assign({}, quest, { repeatMode: "repeatable" }), row("p1", "quest.wolven"));
  assert.equal(repeat.status, "available", "herhaalbaar: weer te doen");
  assert.equal(repeat.doneBefore, true, "grijs met ↻, niet onder Te halen");
  assert.equal(repeat.giverTargetId, "node04:" + dialogue.targetRef.replace(/^.*:/, "") + ":dialogue", "↻ Ga loopt naar de Quest giver");
});

test("server: lopende quest blijft op zijn eigen versie na een aanpassing", () => {
  const { node03, service, ctx, row, setProject } = setup();
  const n4 = service();
  n4.acceptQuest(ctx("p1"), "quest.wolven", "op1");
  setProject(world(3));
  node03.questEvents(ctx("p1"), ["p1"], { type: "defeat", refId: "wolf", eventKey: "defeat:w1:1", operationId: "a" });
  node03.questEvents(ctx("p1"), ["p1"], { type: "defeat", refId: "wolf", eventKey: "defeat:w1:2", operationId: "b" });
  assert.equal(row("p1", "quest.wolven").active_step_id, "step.terug", "oude versie: 2 wolven was genoeg");
  n4.acceptQuest(ctx("p2"), "quest.wolven", "op2");
  const summary = n4.buildQuestSummary(ctx("p2"), ctx("p2").project.campaigns.quests.byId["quest.wolven"], row("p2", "quest.wolven"));
  assert.equal(summary.activeStep.objectives[0].requiredValue, 3, "nieuwe speler krijgt de nieuwe versie");
});

test("server: questgever blijft op de kaart, alleen beschikbare quests laten hem gloeien", () => {
  const { db, node03, service, ctx, row } = setup();
  // De kaartstatus hangt alleen van quests af, niet van de rest van de gevechtsnapshot.
  node03.buildSnapshot = () => ({});
  const n4 = service();
  const context = ctx("p1");
  const quests = context.project.campaigns.quests.byId;
  quests["quest.locked"] = Object.assign({}, quests["quest.smid"], {
    id: "quest.locked", startDialogueRef: "dialogue.npc.npc.smid",
    prerequisiteQuestRefs: ["quest.missing"]
  });
  const markers = () => n4.buildSnapshot(context).questGivers;
  const farmer = () => markers().find((giver) => giver.targetId === "target.npc.npc.boer");
  n4.ensureAvailableQuests(context);
  assert.equal(markers().length, 1, "twee quests bij dezelfde gever delen één ster");
  assert.equal(farmer().hasAvailableQuest, true, "vanaf het begin zichtbaar");
  assert.deepEqual([farmer().instanceId, farmer().displayName, farmer().x, farmer().z, farmer().zoneRef],
    ["node04:target.npc.npc.boer:dialogue", "Boer", -4, 4, WORLD_ZONE_ID]);
  assert.equal(markers().some((giver) => giver.targetId === "target.npc.npc.smid"), false, "gesloten vervolgquest toont nog geen ster");

  n4.acceptQuest(context, "quest.wolven", "map_accept1");
  assert.equal(farmer().hasAvailableQuest, true, "de tweede beschikbare quest houdt de ster groot");
  n4.acceptQuest(context, "quest.smid", "map_accept2");
  assert.equal(farmer().hasAvailableQuest, false, "alles aangenomen: gever blijft als kleine ster");
  n4.abandonQuest(context, "quest.wolven", "map_abandon");
  assert.equal(farmer().hasAvailableQuest, true, "verlaten quest is weer te halen");
  n4.acceptQuest(context, "quest.wolven", "map_accept3");
  for (const questId of ["quest.wolven", "quest.smid"]) {
    n4.completeQuestRun(context, quests[questId], row("p1", questId), quests[questId].stepsById.end, "map_end_" + questId);
    assert.equal(row("p1", questId).status, "completed");
  }
  assert.equal(farmer().hasAvailableQuest, false, "voltooide gever verdwijnt niet");
  quests["quest.wolven"].repeatMode = "repeatable";
  assert.equal(farmer().hasAvailableQuest, true, "herhaalbare quest maakt de ster opnieuw groot");

  // Ook een oude available-rij mag nieuwe, niet-gehaalde voorwaarden niet omzeilen.
  n4.insertQuestState(context, "quest.locked", "available", null, 0, "test");
  assert.equal(markers().find((giver) => giver.targetId === "target.npc.npc.smid").hasAvailableQuest, false);
  assert.deepEqual(n4.buildQuestGivers(Object.assign({}, context, { zoneId: "zone.elsewhere" }), []), [], "alleen gevers in de huidige zone");
  db.close();
});

test("server: oude build (stap deliver) zonder versie werkt nog via de oude knop", () => {
  const { db, service, ctx, row, xp, give, setProject } = setup();
  const project = world();
  const legacy = { id: "quest.oud", displayName: "Oud", steps: [{ id: "step.deliver", sequenceIndex: 0, stepType: "deliver", targetRef: "target.npc.npc.boer",
    objectives: [{ id: "objective.deliver", objectiveType: "deliver", itemRef: "pelt", requiredAmount: 1, targetRef: "target.npc.npc.boer" }] }],
  startStepRef: "step.deliver", rewards: [{ actionKind: "xp", amount: 5 }], prerequisiteQuestRefs: [], nextQuestRefs: [] };
  project.campaigns.quests.byId["quest.oud"] = legacy;
  setProject(project);
  const stamp = new Date().toISOString();
  db.prepare("INSERT INTO player_quest_states (player_id, quest_id, status, active_step_id, tracked, accepted_at, revision, state_json, updated_at) VALUES ('p1', 'quest.oud', 'ready_to_turn_in', 'step.deliver', 1, ?, 1, '{}', ?)").run(stamp, stamp);
  give("p1", "pelt", 1);
  const n4 = service();
  n4.ensureAvailableQuests(ctx("p1"));
  assert.ok(JSON.parse(row("p1", "quest.oud").state_json).version, "lopende quest vastgezet op een versie");
  n4.turnInQuest(ctx("p1"), "quest.oud", "op1");
  assert.equal(row("p1", "quest.oud").status, "completed");
  assert.equal(xp("p1"), 5);
});

test("server: quest verlaten en opnieuw aannemen; een stap die niet meer past wordt gemeld", () => {
  const { db, node03, service, ctx, row } = setup();
  const n4 = service();
  const quest = () => ctx("p1").project.campaigns.quests.byId["quest.wolven"];
  n4.acceptQuest(ctx("p1"), "quest.wolven", "op1");
  node03.questEvents(ctx("p1"), ["p1"], { type: "defeat", refId: "wolf", eventKey: "defeat:w1:1", operationId: "a" });
  n4.abandonQuest(ctx("p1"), "quest.wolven", "op2");
  assert.equal(row("p1", "quest.wolven").status, "abandoned");
  assert.equal(n4.buildQuestSummary(ctx("p1"), quest(), row("p1", "quest.wolven")).status, "available", "weer te halen");
  assert.equal(n4.buildQuestSummary(ctx("p1"), quest(), row("p1", "quest.wolven")).abandoned, true, "verlaten: niet in het questboek");
  n4.acceptQuest(ctx("p1"), "quest.wolven", "op3");
  assert.equal(n4.buildQuestSummary(ctx("p1"), quest(), row("p1", "quest.wolven")).activeStep.objectives[0].currentValue, 0, "nieuwe run begint bij 0");
  db.prepare("UPDATE player_quest_states SET active_step_id = 'weg' WHERE player_id = 'p1'").run();
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(n4.buildQuestSummary(ctx("p1"), quest(), row("p1", "quest.wolven")).activeStep.broken, true);
  } finally { console.warn = warn; }
});

test("stap 2: Team samen = één teller, doel × teamleden, één kill telt 1x, groep verlaten houdt je eigen bijdrage", () => {
  const { db, node03, service, ctx, row, setProject } = setup();
  setProject(world(2, "team"));
  const stamp = new Date().toISOString();
  db.prepare("INSERT INTO parties (id, leader_player_id, loot_policy_id, revision, created_at, updated_at) VALUES ('party1', 'p1', 'loot.free', 1, ?, ?)").run(stamp, stamp);
  for (const id of ["p1", "p2"]) db.prepare("INSERT INTO party_members (party_id, player_id, role, joined_at) VALUES ('party1', ?, ?, ?)").run(id, id === "p1" ? "leader" : "member", stamp);
  const n4 = service();
  n4.acceptQuest(ctx("p1"), "quest.wolven", "op1");
  n4.acceptQuest(ctx("p2"), "quest.wolven", "op2");
  const goal = (playerId) => n4.buildQuestSummary(ctx(playerId), ctx(playerId).project.campaigns.quests.byId["quest.wolven"], row(playerId, "quest.wolven")).activeStep.objectives[0];
  assert.deepEqual([goal("p1").currentValue, goal("p1").requiredValue, goal("p1").team.size], [0, 4, 2], "2 wolven × 2 teamleden");
  assert.equal(goal("p1").team.memberIds, undefined, "ID's van teamleden gaan niet naar de speler");
  const kill = (key, ids, by = "p1") => node03.questEvents(ctx(by), ids, { type: "defeat", refId: "wolf", eventKey: key, operationId: "op_" + key });
  kill("defeat:w1:1", ["p1", "p2"]);
  assert.equal(goal("p2").currentValue, 1, "samen geslagen = 1 voor het team, niet 2");
  kill("defeat:w1:2", ["p1"]);
  kill("defeat:w1:3", ["p1"]);
  assert.equal(goal("p2").currentValue, 3, "p1 mag alles voor het team doen");
  db.prepare("UPDATE party_members SET left_at = ? WHERE player_id = 'p2'").run(stamp);
  assert.deepEqual([goal("p2").currentValue, goal("p2").requiredValue], [0, 2], "p2 alleen: eigen bijdrage (0) van 2");
  n4.syncAutoProgress(ctx("p1"));
  assert.equal(row("p1", "quest.wolven").active_step_id, "step.terug", "p1 alleen: 3 van 2 = klaar");
  db.prepare("UPDATE party_members SET left_at = NULL WHERE player_id = 'p2'").run();
  kill("defeat:w1:4", ["p2"], "p2");
  n4.syncAutoProgress(ctx("p2"));
  assert.equal(row("p2", "quest.wolven").active_step_id, "step.jacht", "p1 zit niet meer op die stap: p2 telt alleen voor zichzelf (1 van 2)");
  kill("defeat:w1:5", ["p2"], "p2");
  assert.equal(row("p2", "quest.wolven").active_step_id, "step.terug");
});

test("stap 2: Team samen klaar = beide teamleden tegelijk door", () => {
  const { db, node03, service, ctx, row, setProject } = setup();
  setProject(world(1, "team"));
  const stamp = new Date().toISOString();
  db.prepare("INSERT INTO parties (id, leader_player_id, loot_policy_id, revision, created_at, updated_at) VALUES ('party1', 'p1', 'loot.free', 1, ?, ?)").run(stamp, stamp);
  for (const id of ["p1", "p2"]) db.prepare("INSERT INTO party_members (party_id, player_id, role, joined_at) VALUES ('party1', ?, ?, ?)").run(id, id === "p1" ? "leader" : "member", stamp);
  const n4 = service();
  n4.acceptQuest(ctx("p1"), "quest.wolven", "op1");
  n4.acceptQuest(ctx("p2"), "quest.wolven", "op2");
  node03.questEvents(ctx("p1"), ["p1"], { type: "defeat", refId: "wolf", eventKey: "a", operationId: "a" });
  node03.questEvents(ctx("p1"), ["p1"], { type: "defeat", refId: "wolf", eventKey: "b", operationId: "b" });
  assert.equal(row("p1", "quest.wolven").active_step_id, "step.terug");
  assert.equal(row("p2", "quest.wolven").active_step_id, "step.terug", "p2 gaat mee door zonder zelf te slaan");
});


// ---- Stap 2 (rest): groep in de buurt, delen, regel bij groep verlaten ----
function party(db, ids) {
  const stamp = new Date().toISOString();
  db.prepare("INSERT INTO parties (id, leader_player_id, loot_policy_id, revision, created_at, updated_at) VALUES ('party1', ?, 'loot.free', 1, ?, ?)").run(ids[0], stamp, stamp);
  for (const id of ids) db.prepare("INSERT INTO party_members (party_id, player_id, role, joined_at) VALUES ('party1', ?, ?, ?)").run(id, id === ids[0] ? "leader" : "member", stamp);
}
function addPlayer(db, n) {
  const stamp = new Date().toISOString();
  db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES (?, ?, 'x', 'x', 'player', ?, ?)").run("u" + n, "speler" + n, stamp, stamp);
  db.prepare("INSERT INTO player_profiles (id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at) VALUES (?, ?, ?, NULL, 'world.main', ?, ?)").run("p" + n, "u" + n, "speler" + n, stamp, stamp);
}
// Nep-MMO: posities (meters) van wie online is, en wat de server naar spelers stuurt.
function mmo(positions) {
  const sent = [];
  return { sent, getWorldPlayerStates: () => Object.entries(positions).map(([player_id, x]) => ({ player_id, x, z: 0 })),
    getConnectionForPlayer: (id) => (id in positions ? {} : null), sendToPlayer: (id, payload) => sent.push([id, payload.type]), partyRuntime: { notice: (ids, text) => sent.push([ids.join(","), text]) } };
}

test("stap 2: een kill telt ook voor de groep in de buurt; ver weg of buiten de groep niet", () => {
  const { db, node03, ctx, row, setProject } = setup();
  setProject(world(5));
  addPlayer(db, 3);
  party(db, ["p1", "p2"]);
  const n4 = new Node04QuestRuntimeService(db, null, mmo({ p1: 0, p2: 10, p3: 5 }), node03);
  for (const id of ["p1", "p2", "p3"]) n4.acceptQuest(ctx(id), "quest.wolven", "acc" + id);
  const count = (id) => n4.buildQuestSummary(ctx(id), ctx(id).project.campaigns.quests.byId["quest.wolven"], row(id, "quest.wolven")).activeStep.objectives[0].currentValue;
  node03.questEvents(ctx("p1"), ["p1"], { type: "defeat", refId: "wolf", eventKey: "defeat:w1:1", operationId: "a" });
  assert.deepEqual([count("p1"), count("p2"), count("p3")], [1, 1, 0], "groepsgenoot op 10 m telt mee, vreemde niet");
  const far = new Node04QuestRuntimeService(db, null, mmo({ p1: 0, p2: 80 }), node03);
  node03.questEvents(ctx("p1"), ["p1"], { type: "defeat", refId: "wolf", eventKey: "defeat:w1:2", operationId: "b" });
  assert.deepEqual([count("p1"), count("p2")], [2, 1], "groepsgenoot op 80 m telt niet mee");
  assert.ok(far);
  // Iedereen in de buurt / alleen wie meevocht
  const { db: db2, node03: n03b, ctx: ctx2, row: row2 } = (() => { const t = setup(); t.setProject(world(5, { credit: "nearby" })); return t; })();
  addPlayer(db2, 3);
  party(db2, ["p1", "p2"]);
  const nb = new Node04QuestRuntimeService(db2, null, mmo({ p1: 0, p2: 10, p3: 5 }), n03b);
  for (const id of ["p1", "p2", "p3"]) nb.acceptQuest(ctx2(id), "quest.wolven", "acc" + id);
  n03b.questEvents(ctx2("p1"), ["p1"], { type: "defeat", refId: "wolf", eventKey: "defeat:w1:1", operationId: "a" });
  const count2 = (id) => nb.buildQuestSummary(ctx2(id), ctx2(id).project.campaigns.quests.byId["quest.wolven"], row2(id, "quest.wolven")).activeStep.objectives[0].currentValue;
  assert.deepEqual([count2("p1"), count2("p2"), count2("p3")], [1, 1, 1], "iedereen in de buurt met deze stap");
  const t3 = setup();
  t3.setProject(world(5, { credit: "fighters" }));
  party(t3.db, ["p1", "p2"]);
  const nf = new Node04QuestRuntimeService(t3.db, null, mmo({ p1: 0, p2: 10 }), t3.node03);
  for (const id of ["p1", "p2"]) nf.acceptQuest(t3.ctx(id), "quest.wolven", "acc" + id);
  t3.node03.questEvents(t3.ctx("p1"), ["p1"], { type: "defeat", refId: "wolf", eventKey: "defeat:w1:1", operationId: "a" });
  const p2 = nf.buildQuestSummary(t3.ctx("p2"), t3.ctx("p2").project.campaigns.quests.byId["quest.wolven"], t3.row("p2", "quest.wolven")).activeStep.objectives[0].currentValue;
  assert.equal(p2, 0, "alleen wie meevocht");
});

test("stap 2: quest delen met je groep (Aannemen / Nee), 1x per aanbod", () => {
  const { db, node03, ctx, row } = setup();
  party(db, ["p1", "p2"]);
  const fake = mmo({ p1: 0, p2: 10 });
  const n4 = new Node04QuestRuntimeService(db, null, fake, node03);
  assert.throws(() => n4.shareQuest(ctx("p1"), "quest.wolven"), /zelf doet/);
  n4.acceptQuest(ctx("p1"), "quest.wolven", "op1");
  assert.match(n4.shareQuest(ctx("p1"), "quest.wolven").message, /1 groepslid/);
  assert.equal(n4.shareOffersFor("p2").length, 1);
  assert.ok(fake.sent.some(([id, text]) => id === "p2" && /deelt de quest/.test(text)), "melding voor p2");
  n4.acceptSharedQuest(ctx("p2"), "quest.wolven", "op2");
  assert.equal(row("p2", "quest.wolven").status, "active");
  assert.throws(() => n4.acceptSharedQuest(ctx("p2"), "quest.wolven", "op3"), /verlopen/);
  assert.match(n4.shareQuest(ctx("p1"), "quest.wolven").message, /Niemand/, "heeft hem al");
});

test("stap 2: regel bij groep verlaten: wachten (alleen telt niet) en mislukt (alleen voor wie vertrekt)", () => {
  const wait = setup();
  wait.setProject(world(1, "team", { partyLeave: "wait" }));
  const n4 = new Node04QuestRuntimeService(wait.db, null, null, wait.node03);
  n4.acceptQuest(wait.ctx("p1"), "quest.wolven", "op1");
  wait.node03.questEvents(wait.ctx("p1"), ["p1"], { type: "defeat", refId: "wolf", eventKey: "defeat:w1:1", operationId: "a" });
  const goal = n4.buildQuestSummary(wait.ctx("p1"), wait.ctx("p1").project.campaigns.quests.byId["quest.wolven"], wait.row("p1", "quest.wolven")).activeStep.objectives[0];
  assert.equal(goal.currentValue, 0, "alleen telt een team-doel niet");
  assert.equal(goal.team.waiting, true);
  party(wait.db, ["p1", "p2"]);
  n4.acceptQuest(wait.ctx("p2"), "quest.wolven", "op2");
  wait.node03.questEvents(wait.ctx("p1"), ["p1"], { type: "defeat", refId: "wolf", eventKey: "defeat:w1:2", operationId: "b" });
  wait.node03.questEvents(wait.ctx("p2"), ["p2"], { type: "defeat", refId: "wolf", eventKey: "defeat:w1:3", operationId: "c" });
  assert.equal(wait.row("p1", "quest.wolven").active_step_id, "step.terug", "in de groep wel: samen 2/2");

  const fail = setup();
  fail.setProject(world(2, "team", { partyLeave: "fail" }));
  party(fail.db, ["p1", "p2"]);
  const nf = new Node04QuestRuntimeService(fail.db, null, null, fail.node03);
  for (const id of ["p1", "p2"]) nf.acceptQuest(fail.ctx(id), "quest.wolven", "acc" + id);
  fail.node03.questEvents(fail.ctx("p1"), ["p1"], { type: "defeat", refId: "wolf", eventKey: "defeat:w1:1", operationId: "a" });
  assert.deepEqual(fail.node03.questPartyLeaving(fail.ctx("p1"), "p1"), ["Wolven"]);
  assert.equal(fail.row("p1", "quest.wolven").status, "abandoned", "wie vertrekt: mislukt");
  assert.equal(fail.row("p2", "quest.wolven").status, "active", "wie blijft: gewoon verder");
  const keep = setup();
  keep.setProject(world(2, "team"));
  party(keep.db, ["p1", "p2"]);
  const nk = new Node04QuestRuntimeService(keep.db, null, null, keep.node03);
  for (const id of ["p1", "p2"]) nk.acceptQuest(keep.ctx(id), "quest.wolven", "acc" + id);
  assert.deepEqual(keep.node03.questPartyLeaving(keep.ctx("p1"), "p1"), [], "meenemen (standaard): niets mislukt");
});

test("stap 2: quest-check voor Telt voor en Bij groep verlaten", () => {
  const steps = wolvenSteps(2);
  const messages = (list, options) => questGraphIssues(list, options).map((issue) => issue.message).join(" | ");
  assert.match(messages(steps, { partyLeave: "wait" }), /Bij groep verlaten doet niets/);
  assert.doesNotMatch(messages(wolvenSteps(2, "team"), { partyLeave: "wait" }), /Bij groep verlaten/);
  const wrong = steps.map((step) => step.stepId === "step.terug" ? Object.assign({}, step, { objectives: [Object.assign({}, step.objectives[0], { credit: "nearby" })] }) : step);
  assert.match(messages(wrong), /Telt voor kan alleen bij Versla/);
  const quest = world(2, { credit: "fighters" }, { partyLeave: "fail" }).campaigns.quests.byId["quest.wolven"];
  assert.equal(quest.steps[0].objectives[0].credit, "fighters");
  assert.equal(quest.partyLeave, "fail", "alleen een melding in de Quest Builder, SAVE TO GAME gaat door");
  assert.equal(world().campaigns.quests.byId["quest.wolven"].partyLeave, undefined, "standaard: niets extra in de quest (versie blijft gelijk)");
});
