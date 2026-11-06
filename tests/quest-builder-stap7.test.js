// Quest Builder stap 7 (6-11): gesprekken, keuzes, eindes. Quest-check bij de build; op de server: een NPC stelt de vraag,
// het antwoord stuurt je naar een eigen stap of einde en ligt daarna vast; in een groep kiest ieder zelf, de leider of de meerderheid
// (gelijk = de leider); een einde geeft een eigen beloning (1× per speler), eventueel kiest de speler er 1.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { compileCanonical } from "../src/server/authoring/build-service.js";
import { buildRuntimeWorld, WORLD_ZONE_ID } from "../src/server/authoring/world-builder.js";
import { Node03RuntimeService } from "../src/server/node03-runtime-service.js";
import { Node04QuestRuntimeService } from "../src/server/node04-quest-runtime-service.js";

const doc = (kind, key, body) => ({ docKey: key, kind, body, archived: false, revision: 1, legacyRef: null });
const quest = (id, steps) => doc("quest", "quest:" + id, { questId: id, displayName: id, giverRef: "npc:npc.boer", steps });
// Kies bij de Boer: Ja = hout zoeken (einde met 2 hout + 10 XP), Nee = einde waar je 1 beloning kiest (hout of steen).
const choiceSteps = (decide) => [
  { stepId: "s1", kind: "step", objectives: [{ objectiveId: "o1", type: "choose", ref: "npc:npc.boer", text: "Help je mij?", ...(decide ? { decide } : {}),
    options: [{ optionId: "ja", label: "Ja", to: "s2" }, { optionId: "nee", label: "Nee", to: "einde_nee" }] }] },
  { stepId: "s2", kind: "step", objectives: [{ objectiveId: "o2", type: "gather", ref: "resource_definition:bush", amount: 1 }], next: [{ to: "end" }] },
  { stepId: "end", kind: "end", title: "Geholpen", rewards: [{ ref: "item_definition:wood", amount: 2 }], xp: 10 },
  { stepId: "einde_nee", kind: "end", title: "Niet geholpen", rewards: [{ ref: "item_definition:wood", amount: 1 }, { ref: "item_definition:stone", amount: 1 }], pick: true }
];
const QUESTS = [quest("quest.keus", choiceSteps(null)), quest("quest.leider", choiceSteps("leader")), quest("quest.stem", choiceSteps("vote"))];

function docs(extra = []) {
  return [
    doc("project_settings", "project_settings", { gameName: "GK", maxLevel: 50 }),
    doc("item_definition", "item_definition:wood", { itemId: "wood", displayName: "Hout", category: "material", rarity: "common", stackable: true, stackLimit: 99 }),
    doc("item_definition", "item_definition:stone", { itemId: "stone", displayName: "Steen", category: "material", rarity: "common", stackable: true, stackLimit: 99 }),
    doc("loot_table", "loot_table:wood", { lootTableId: "wood", displayName: "Hout", entries: [{ itemRef: "item_definition:wood", chanceBp: 10000, minQty: 1, maxQty: 1 }] }),
    doc("resource_definition", "resource_definition:bush", { resourceId: "bush", displayName: "Struik", lootTableRef: "loot_table:wood", gatherRangeMm: 2000, radiusMm: 600, respawnMs: 10000 }),
    doc("npc", "npc:npc.boer", { npcId: "npc.boer", displayName: "Boer", x: -4, y: 0, z: 4 })
  ].concat(QUESTS, extra);
}

test("stap 7: quest-check: elk antwoord gaat ergens heen, elk einde is bereikbaar, kiest 1 = minstens 2", () => {
  const broken = quest("quest.kapot", [
    { stepId: "s1", kind: "step", objectives: [{ objectiveId: "o1", type: "choose", ref: "npc:npc.boer", options: [{ optionId: "a", label: "Ja" }] }] },
    { stepId: "end", kind: "end", rewards: [{ ref: "item_definition:wood", amount: 1 }], pick: true },
    { stepId: "los", kind: "end" }]);
  const messages = compileCanonical(docs([broken]), {}).errors.filter((error) => error.code === "QUEST_CHECK").map((error) => error.message).join(" | ");
  assert.match(messages, /geef minstens 2 antwoorden/);
  assert.match(messages, /Antwoord 1 \(Ja\): kies waar het heen gaat/);
  assert.match(messages, /Speler kiest 1: zet minstens 2 beloningen/);
  assert.match(messages, /nooit bereikt|niet bereikt|kom je nooit/i, messages);
  assert.deepEqual(compileCanonical(docs(), {}).errors, [], "een keuze zonder Daarna is goed");
});

test("stap 7: build zet vraag, antwoorden, wie kiest en de beloning van elk einde", () => {
  const compiled = compileCanonical(docs(), {});
  const quests = buildRuntimeWorld(JSON.parse(compiled.files["server.json"].text)).gameProject.campaigns.quests.byId;
  const choose = quests["quest.leider"].stepsById.s1.objectives[0];
  assert.equal(choose.question, "Help je mij?");
  assert.deepEqual(choose.options, [{ id: "ja", label: "Ja", to: "s2" }, { id: "nee", label: "Nee", to: "einde_nee" }]);
  assert.equal(choose.decide, "leader");
  assert.equal("decide" in quests["quest.keus"].stepsById.s1.objectives[0], false, "ieder zelf = standaard, niet opgeslagen");
  assert.deepEqual(quests["quest.keus"].stepsById.end.rewards, [{ actionKind: "xp", amount: 10 }, { actionKind: "item", itemRef: "wood", amount: 2 }]);
  assert.equal(quests["quest.keus"].stepsById.einde_nee.rewardPick, true);
  assert.equal("rewardPick" in quests["quest.keus"].stepsById.end, false);
});

function setup() {
  const compiled = compileCanonical(docs(), {});
  assert.deepEqual(compiled.errors, []);
  const project = buildRuntimeWorld(JSON.parse(compiled.files["server.json"].text)).gameProject;
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort()) db.exec(fs.readFileSync("db/migrations/" + file, "utf8"));
  const stamp = new Date().toISOString();
  for (const n of [1, 2]) {
    db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES (?, ?, 'x', 'x', 'player', ?, ?)").run("u" + n, "speler" + n, stamp, stamp);
    db.prepare("INSERT INTO player_profiles (id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at) VALUES (?, ?, ?, 'class.held', 'world.main', ?, ?)").run("p" + n, "u" + n, "speler" + n, stamp, stamp);
    db.prepare("INSERT INTO player_progression (player_id, level, xp, skill_points, revision, updated_at) VALUES (?, 1, 0, 0, 1, ?)").run("p" + n, stamp);
  }
  const node03 = Object.create(Node03RuntimeService.prototype);
  node03.db = db;
  const ctx = (id = "p1") => ({ profile: { id }, worldId: "world.main", zoneId: WORLD_ZONE_ID, project, catalogs: project.catalogs, position: { x: -4, z: 4 } });
  node03.adminContextForPlayer = (id) => Object.assign(ctx(id), { position: null });
  const sent = [];
  const mmo = { sendToPlayer: (id, payload) => sent.push([id, payload]), partyRuntime: { notice: () => {} }, getConnectionForPlayer: () => null };
  const n4 = new Node04QuestRuntimeService(db, null, mmo, node03);
  clearInterval(n4.timerTick);
  const row = (questId, id = "p1") => db.prepare("SELECT * FROM player_quest_states WHERE player_id = ? AND quest_id = ?").get(id, questId);
  const dialogue = project.campaigns.dialogues.byId["dialogue.npc.npc.boer"];
  // In het gesprek met de Boer: de vraag van de quest openen, en een antwoord kiezen.
  const ask = (questId, id = "p1") => {
    const open = n4.buildDialogueRuntime(ctx(id), dialogue, null).choices.find((choice) => choice.choiceId.startsWith("quest.ask|" + questId + "|"));
    assert.ok(open, "de NPC stelt de vraag");
    return n4.chooseDialogue(ctx(id), { dialogueId: dialogue.id, choiceId: open.choiceId }, "op_ask").dialogue;
  };
  const pick = (questId, optionId, id = "p1") => n4.chooseDialogue(ctx(id), { dialogueId: dialogue.id, choiceId: "quest.pick|" + questId + "|s1|o1|" + optionId }, "op_pick_" + id + optionId);
  const owned = (itemId, id = "p1") => Number(db.prepare("SELECT COALESCE(SUM(quantity), 0) AS n FROM player_inventory_stacks WHERE player_id = ? AND item_id = ?").get(id, itemId).n);
  const xp = (id = "p1") => db.prepare("SELECT xp FROM player_progression WHERE player_id = ?").get(id).xp;
  let event = 0;
  const wood = (id) => { event += 1; n4.onQuestEvent(ctx(id), [id], { type: "gather", refId: "bush", eventKey: "gather:" + event, operationId: "op_g" + event, at: { x: 0, z: 0 } }); };
  const party = () => {
    db.prepare("INSERT INTO parties (id, leader_player_id, loot_policy_id, revision, created_at, updated_at) VALUES ('party1', 'p1', 'loot.free', 1, ?, ?)").run(stamp, stamp);
    for (const id of ["p1", "p2"]) db.prepare("INSERT INTO party_members (party_id, player_id, role, joined_at) VALUES ('party1', ?, 'member', ?)").run(id, stamp);
  };
  return { db, n4, ctx, row, ask, pick, owned, xp, wood, party, sent, project };
}

test("stap 7: ieder kiest zelf; het antwoord stuurt je naar zijn eigen stap en ligt daarna vast", () => {
  const t = setup();
  t.n4.acceptQuest(t.ctx("p1"), "quest.keus", "op_a1");
  const view = t.ask("quest.keus");
  assert.match(view.text, /Help je mij\?/);
  assert.deepEqual(view.choices.map((choice) => choice.label), ["Ja", "Nee", "Later"]);
  const done = t.pick("quest.keus", "ja");
  assert.match(done.message, /Je koos: Ja/);
  assert.equal(t.row("quest.keus").active_step_id, "s2", "Ja = naar stap s2");
  assert.equal(JSON.parse(t.row("quest.keus").state_json).vars["s1.o1"], "ja", "de keuze staat als questvariabele");
  assert.throws(() => t.pick("quest.keus", "nee"), /niet meer geldig/, "nog een keer kiezen kan niet");
  // Komt hij later weer op deze stap (zelfde run), dan kan hij alleen hetzelfde antwoord geven.
  t.db.prepare("UPDATE player_quest_states SET active_step_id = 's1' WHERE player_id = 'p1' AND quest_id = 'quest.keus'").run();
  t.db.prepare("DELETE FROM player_objective_progress WHERE player_id = 'p1' AND quest_id = 'quest.keus'").run();
  assert.deepEqual(t.ask("quest.keus").choices.map((choice) => choice.label), ["Ja", "Later"]);
  assert.throws(() => t.pick("quest.keus", "nee"), /al gekozen: Ja/);
});

test("stap 7: einde met Speler kiest 1: hij kiest in zijn questboek, de beloning komt 1× per speler", () => {
  const t = setup();
  t.n4.acceptQuest(t.ctx("p1"), "quest.keus", "op_a1");
  t.ask("quest.keus");
  t.pick("quest.keus", "nee");
  assert.equal(t.row("quest.keus").status, "ready_to_turn_in", "wacht op de keuze van de beloning");
  assert.equal(t.row("quest.keus").active_step_id, "einde_nee");
  const definition = t.project.campaigns.quests.byId["quest.keus"];
  const summary = t.n4.buildQuestSummary(t.ctx("p1"), definition, t.row("quest.keus"));
  assert.deepEqual(summary.activeStep.rewardChoice.map((reward) => reward.displayName + " " + reward.index), ["Hout 0", "Steen 1"]);
  t.n4.syncAutoProgress(t.ctx("p1"));
  assert.equal(t.row("quest.keus").status, "ready_to_turn_in", "verversen kiest niet zelf");
  const result = t.n4.chooseReward(t.ctx("p1"), "quest.keus", "1", "op_r1");
  assert.equal(result.completed, true);
  assert.equal(t.row("quest.keus").status, "completed");
  assert.equal(t.owned("stone"), 1);
  assert.equal(t.owned("wood"), 0, "alleen wat hij koos");
  assert.throws(() => t.n4.chooseReward(t.ctx("p1"), "quest.keus", "0", "op_r2"), /geen beloning te kiezen/);
});

test("stap 7: de leider kiest voor de hele groep; een groepslid kan niet kiezen", async () => {
  const t = setup();
  t.party();
  t.n4.acceptQuest(t.ctx("p1"), "quest.leider", "op_a1");
  t.n4.acceptQuest(t.ctx("p2"), "quest.leider", "op_a2");
  const member = t.ask("quest.leider", "p2");
  assert.match(member.text, /De leider van je groep kiest/);
  assert.deepEqual(member.choices.map((choice) => choice.label), ["Later"]);
  assert.throws(() => t.pick("quest.leider", "nee", "p2"), /leider/);
  assert.match(t.ask("quest.leider", "p1").text, /Jij kiest voor de hele groep/);
  assert.match(t.pick("quest.leider", "ja", "p1").message, /Je koos voor de groep: Ja/);
  assert.equal(t.row("quest.leider", "p1").active_step_id, "s2");
  assert.equal(t.row("quest.leider", "p2").active_step_id, "s2", "de keuze geldt ook voor p2");
  assert.equal(JSON.parse(t.row("quest.leider", "p2").state_json).vars["s1.o1"], "ja");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.ok(t.sent.some(([id, payload]) => id === "p2" && payload.type === "quest:message" && /De leider koos: Ja/.test(payload.text)));
  // Eindbeloning: ieder 1× (2 hout + 10 XP), ook als het einde nog eens wordt afgehandeld.
  t.wood("p1");
  t.wood("p2");
  for (const id of ["p1", "p2"]) {
    assert.equal(t.row("quest.leider", id).status, "completed");
    assert.equal(t.owned("wood", id), 2, "2 hout van het einde");
    assert.equal(t.xp(id), 10);
  }
  const definition = t.n4.questDefinition(t.ctx("p1"), "quest.leider", t.row("quest.leider"));
  t.n4.completeQuestRun(t.ctx("p1"), definition, t.row("quest.leider"), definition.stepsById.end, "op_again");
  assert.equal(t.owned("wood", "p1"), 2, "geen tweede beloning");
  // Feestelijke melding "Quest voltooid!": 1× per speler, met het einde en wat je kreeg.
  await new Promise((resolve) => setTimeout(resolve, 60));
  const done = t.sent.filter(([, payload]) => payload.type === "quest:completed");
  assert.deepEqual(done.map(([id]) => id).sort(), ["p1", "p2"]);
  assert.equal(done[0][1].ending, "Geholpen");
  assert.deepEqual(done[0][1].rewards, ["+10 XP", "+2× Hout"]);
});

test("stap 7: de meerderheid kiest; gelijk = de stem van de leider", () => {
  const t = setup();
  t.party();
  t.n4.acceptQuest(t.ctx("p1"), "quest.stem", "op_a1");
  t.n4.acceptQuest(t.ctx("p2"), "quest.stem", "op_a2");
  const first = t.pick("quest.stem", "nee", "p2");
  assert.match(first.message, /Je stem telt: Nee/);
  assert.match(first.dialogue.text, /1 van 2 gestemd/);
  assert.equal(t.row("quest.stem", "p2").active_step_id, "s1", "nog geen meerderheid");
  t.pick("quest.stem", "ja", "p1");
  for (const id of ["p1", "p2"]) {
    assert.equal(t.row("quest.stem", id).active_step_id, "s2", "1-1: de leider (p1) stemde Ja");
    assert.equal(JSON.parse(t.row("quest.stem", id).state_json).votes, undefined, "stemmen opgeruimd");
  }
});
