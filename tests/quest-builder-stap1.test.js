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
      Object.assign({ objectiveId: "obj.wolf", type: "defeat", ref: "actor_archetype:wolf", amount: wolves, role: "required" }, share ? { share } : {}),
      { objectiveId: "obj.struik", type: "gather", ref: "resource_definition:bush", amount: 1, role: "bonus" }
    ] },
    { stepId: "step.terug", kind: "step", title: "", match: "all", next: [{ to: "end" }], objectives: [
      { objectiveId: "obj.vacht", type: "deliver", ref: "item_definition:pelt", npcRef: "npc:npc.boer", amount: 2 }
    ] },
    { stepId: "end", kind: "end", title: "Klaar" }
  ];
}

function docs(wolves = 2, extra = [], share = null) {
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
      rewards: [{ ref: "item_definition:pelt", amount: 1 }], steps: wolvenSteps(wolves, share) }),
    doc("quest", "quest:quest.smid", { questId: "quest.smid", displayName: "Naar de smid", giverRef: "npc:npc.boer", goal: "visit", targetNpcRef: "npc:npc.smid", rewardXp: 10 })
  ].concat(extra);
}

function world(wolves = 2, share = null) {
  const compiled = compileCanonical(docs(wolves, [], share), {});
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

