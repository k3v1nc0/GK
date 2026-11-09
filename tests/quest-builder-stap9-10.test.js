// Quest Builder stap 9 (wereldstatus) en stap 10 (afronding), 8-11.
// Stap 9: vlaggen per speler, groep of server; een quest zet ze (regel of einde); NPC's met "Alleen als vlag" zie/spreek/bots
// je alleen als de vlag klopt; startvoorwaarde Vlag; wereld-event (elke zoveel minuten, iedereen in het gebied, één teller).
// Stap 10: spelers van een oude versie overzetten (geen dubbele beloning), waarom vast, logboek.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { compileCanonical } from "../src/server/authoring/build-service.js";
import { buildRuntimeWorld, WORLD_ZONE_ID } from "../src/server/authoring/world-builder.js";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { Node03RuntimeService } from "../src/server/node03-runtime-service.js";
import { Node04QuestRuntimeService } from "../src/server/node04-quest-runtime-service.js";
import { MmoService, solidCollisionEntriesForWorld } from "../src/server/mmo-service.js";
import { createWalkabilityIndex } from "../apps/web/public/shared/movement-kernel.js";
import { areaCirclePointsMm } from "../apps/web/public/shared/area-soorten.js";
import { worldEventWindow } from "../apps/web/public/shared/quest-graph.js";

const doc = (kind, key, body) => ({ docKey: key, kind, body, archived: false, revision: 1, legacyRef: null });
const gather = (id, amount) => ({ objectiveId: id, type: "gather", ref: "resource_definition:bush", amount });
const quest = (id, steps, extra = {}) => doc("quest", "quest:" + id, Object.assign({ questId: id, displayName: id, giverRef: "npc:npc.boer", steps, rewardXp: 10 }, extra));
const flag = (id, scope) => doc("world_flag", "world_flag:" + id, { flagId: id, displayName: id, scope });

const BASE = [
  doc("project_settings", "project_settings", { gameName: "GK", maxLevel: 50 }),
  doc("item_definition", "item_definition:wood", { itemId: "wood", displayName: "Hout", category: "material", rarity: "common", stackable: true, stackLimit: 99 }),
  doc("loot_table", "loot_table:wood", { lootTableId: "wood", displayName: "Hout", entries: [{ itemRef: "item_definition:wood", chanceBp: 10000, minQty: 1, maxQty: 1 }] }),
  doc("resource_definition", "resource_definition:bush", { resourceId: "bush", displayName: "Struik", lootTableRef: "loot_table:wood", gatherRangeMm: 2000, radiusMm: 600, respawnMs: 10000 }),
  doc("npc", "npc:npc.boer", { npcId: "npc.boer", displayName: "Boer", x: -4, y: 0, z: 4 }),
  doc("area", "area:veld", { areaId: "veld", displayName: "Veld", soort: "questgebied", shape: "polygon", pointsMm: areaCirclePointsMm(0, 0, 40000) })
];

function docs(extra = []) {
  return BASE.concat([
    flag("flag.eigen", "player"), flag("flag.brug", "group"), flag("flag.server", "server"),
    // De smid staat er pas als de brug gemaakt is.
    doc("npc", "npc:npc.smid", { npcId: "npc.smid", displayName: "Smid", x: 10, y: 0, z: 0, flagRef: "world_flag:flag.brug", flagOn: "on" }),
    quest("quest.brug", [
      { stepId: "s1", kind: "step", objectives: [gather("o1", 1)], rules: [{ ruleId: "r1", when: "start", then: "flag", flagRef: "world_flag:flag.eigen", on: true }], next: [{ to: "end" }] },
      { stepId: "end", kind: "end", flags: [{ ref: "world_flag:flag.brug", on: true }, { ref: "world_flag:flag.server", on: true }] }]),
    quest("quest.na", [{ stepId: "s1", kind: "step", objectives: [gather("o1", 1)], next: [{ to: "end" }] }, { stepId: "end", kind: "end" }],
      { start: { rules: [{ type: "flag", ref: "world_flag:flag.brug", on: true }] } }),
    (() => {
      const made = quest("quest.event", [{ stepId: "s1", kind: "step", objectives: [gather("o1", 3)], next: [{ to: "end" }] }, { stepId: "end", kind: "end" }],
        { start: { mode: "world", areaRef: "area:veld", every: 30, lasts: 10 } });
      delete made.body.giverRef;
      return made;
    })()
  ], extra);
}

function build(list) {
  const compiled = compileCanonical(list, {});
  assert.deepEqual(compiled.errors, []);
  return buildRuntimeWorld(JSON.parse(compiled.files["server.json"].text));
}

function setup(list = docs()) {
  let world = build(list);
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort()) db.exec(fs.readFileSync("db/migrations/" + file, "utf8"));
  const stamp = new Date().toISOString();
  for (const n of [1, 2, 3]) {
    db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES (?, ?, 'x', 'x', 'player', ?, ?)").run("u" + n, "speler" + n, stamp, stamp);
    db.prepare("INSERT INTO player_profiles (id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at) VALUES (?, ?, ?, 'class.held', 'world.main', ?, ?)").run("p" + n, "u" + n, "speler" + n, stamp, stamp);
    db.prepare("INSERT INTO player_progression (player_id, level, xp, skill_points, revision, updated_at) VALUES (?, 1, 0, 0, 1, ?)").run("p" + n, stamp);
  }
  const node03 = Object.create(Node03RuntimeService.prototype);
  node03.db = db;
  const ctx = (id = "p1", position = { x: 0, z: 0 }) => ({ profile: { id }, worldId: "world.main", zoneId: WORLD_ZONE_ID, project: world.gameProject, catalogs: world.gameProject.catalogs, position,
    campaigns: world.gameProject.campaigns });
  node03.adminContextForPlayer = (id) => Object.assign(ctx(id), { position: null });
  const sent = [];
  const notices = [];
  const mmo = { sendToPlayer: (id, payload) => sent.push([id, payload]), partyRuntime: { notice: (ids, text) => notices.push([ids, text]) },
    connectionsByPlayerId: new Map([["p1", new Set(["c1"])], ["p2", new Set(["c2"])], ["p3", new Set(["c3"])]]),
    getPublishedWorldContext: () => ({ world }) };
  const n4 = new Node04QuestRuntimeService(db, null, mmo, node03);
  clearInterval(n4.timerTick);
  let clock = Date.UTC(2026, 10, 8, 12, 0, 5);
  n4.clock = () => clock;
  const row = (questId, id = "p1") => db.prepare("SELECT * FROM player_quest_states WHERE player_id = ? AND quest_id = ?").get(id, questId);
  let event = 0;
  const wood = (id = "p1") => { event += 1; n4.onQuestEvent(ctx(id), [id], { type: "gather", refId: "bush", eventKey: "gather:" + event, operationId: "op_g" + event, at: { x: 0, z: 0 } }); };
  const party = () => {
    db.prepare("INSERT INTO parties (id, leader_player_id, loot_policy_id, revision, created_at, updated_at) VALUES ('party1', 'p1', 'loot.free', 1, ?, ?)").run(stamp, stamp);
    for (const id of ["p1", "p2"]) db.prepare("INSERT INTO party_members (party_id, player_id, role, joined_at) VALUES ('party1', ?, 'member', ?)").run(id, stamp);
  };
  const xp = (id = "p1") => db.prepare("SELECT xp FROM player_progression WHERE player_id = ?").get(id).xp;
  return { db, n4, mmo, ctx, row, wood, party, xp, sent, notices, project: () => world.gameProject, rebuild: (next) => { world = build(next); },
    setClock: (ms) => { clock = ms; }, now: () => clock };
}

test("stap 9: quest-check en build (vlaggen, alleen als vlag, regel, einde, voorwaarde, wereld-event)", () => {
  // Een vlag die iets laat verschijnen maar die geen quest zet, doet nooit iets.
  const never = compileCanonical(docs([flag("flag.nooit", "group"), doc("npc", "npc:npc.geest", { npcId: "npc.geest", displayName: "Geest", x: 0, y: 0, z: 9, flagRef: "world_flag:flag.nooit" })]), {});
  assert.ok(never.errors.some((error) => error.code === "FLAG_NEVER_SET" && /Geest/.test(error.message)), "FLAG_NEVER_SET");
  const broken = quest("quest.kapot", [{ stepId: "s1", kind: "step", objectives: [gather("o1", 1)], rules: [{ ruleId: "r1", when: "start", then: "flag" }], next: [{ to: "end" }] },
    { stepId: "end", kind: "end" }], { start: { mode: "world", every: 10, lasts: 20 } });
  const messages = compileCanonical(docs([broken]), {}).errors.map((error) => error.message).join(" | ");
  assert.match(messages, /kies welke vlag/);
  assert.match(messages, /Wereld-event: kies het Questgebied/);
  assert.match(messages, /korter duren/);
  assert.ok(validateDocument("world_flag", { flagId: "flag.a", displayName: "A", scope: "server" }).ok);

  const world = build(docs());
  const campaigns = world.gameProject.campaigns;
  assert.deepEqual(campaigns.flags.byId["flag.brug"], { id: "flag.brug", displayName: "flag.brug", scope: "group" });
  assert.deepEqual(campaigns.flags.gates, [{ entityId: "npc_entity.npc.smid", npcId: "npc.smid", flagId: "flag.brug", on: true }]);
  const brug = campaigns.quests.byId["quest.brug"];
  assert.deepEqual([brug.stepsById.s1.rules[0].flagRef, brug.stepsById.s1.rules[0].on], ["flag.eigen", true]);
  assert.deepEqual(brug.stepsById.end.flags, [{ flagRef: "flag.brug", on: true }, { flagRef: "flag.server", on: true }]);
  assert.deepEqual(campaigns.quests.byId["quest.na"].requirements.rules, [{ type: "flag", flagRef: "flag.brug", on: true }]);
  const event = campaigns.quests.byId["quest.event"];
  assert.deepEqual([event.startMode, event.startAreaRef, event.eventEvery, event.eventLasts, event.repeatMode], ["world", "veld", 30, 10, "repeatable"]);
  const smid = solidCollisionEntriesForWorld(world).find((solid) => solid.entityId === "npc_entity.npc.smid");
  assert.deepEqual(smid.flag, { id: "flag.brug", on: true }, "de botsing weet van de vlag");
  assert.equal(solidCollisionEntriesForWorld(world).find((solid) => solid.entityId === "npc_entity.npc.boer").flag, undefined);
  // Zonder vlaggen blijft een quest gelijk (zelfde versie als vroeger).
  assert.equal("flags" in build(BASE.concat([quest("quest.x", [{ stepId: "s1", kind: "step", objectives: [gather("o1", 1)], next: [{ to: "end" }] }, { stepId: "end", kind: "end" }])])).gameProject.campaigns, false);
});

test("stap 9: speler-vlag alleen voor hem, groep-vlag voor de groep, server-vlag voor iedereen; NPC zien, praten en botsen", () => {
  const t = setup();
  t.party(); // p1 + p2 samen, p3 alleen
  t.n4.acceptQuest(t.ctx("p1"), "quest.brug", "op_a");
  assert.equal(t.n4.flags.isOn("p1", "flag.eigen"), true, "regel bij de start zette de speler-vlag");
  assert.equal(t.n4.flags.isOn("p2", "flag.eigen"), false, "een speler-vlag raakt een ander niet");
  assert.ok(t.n4.flagHidden(t.ctx("p1")).has("npc_entity.npc.smid"), "smid nog weg");
  assert.notEqual(t.n4.questStartIssue(t.ctx("p2"), t.project().campaigns.quests.byId["quest.na"]), "", "voorwaarde nog niet");
  t.wood("p1");
  assert.equal(t.row("quest.brug").status, "completed");
  for (const id of ["p1", "p2"]) assert.equal(t.n4.flags.isOn(id, "flag.brug"), true, "groep-vlag voor " + id);
  assert.equal(t.n4.flags.isOn("p3", "flag.brug"), false, "niet voor wie niet in de groep zit");
  for (const id of ["p1", "p2", "p3"]) assert.equal(t.n4.flags.isOn(id, "flag.server"), true, "server-vlag voor " + id);
  // Zien en praten.
  assert.equal(t.n4.flagHidden(t.ctx("p2")).has("npc_entity.npc.smid"), false);
  assert.ok(t.n4.flagHidden(t.ctx("p3")).has("npc_entity.npc.smid"));
  const dialogue = Object.values(t.project().campaigns.dialogues.byId).find((entry) => /smid/.test(entry.id));
  assert.equal(t.n4.dialogueHidden(t.ctx("p2"), dialogue), false);
  assert.equal(t.n4.dialogueHidden(t.ctx("p3"), dialogue), true, "p3 kan de smid niet spreken");
  assert.equal(t.n4.questStartIssue(t.ctx("p2"), t.project().campaigns.quests.byId["quest.na"]), "", "voorwaarde Vlag klopt voor de groep");
  assert.match(t.n4.questStartIssue(t.ctx("p3"), t.project().campaigns.quests.byId["quest.na"]), /flag\.brug/);
  // Botsen per speler (zelfde lijst, de smid eruit voor p3).
  const worldContext = { solidColliders: solidCollisionEntriesForWorld(t.mmo.getPublishedWorldContext().world) };
  const mover = { worldFlags: t.n4.flags };
  const ids = (id) => MmoService.prototype.solidsForPlayer.call(mover, worldContext, id).map((solid) => solid.entityId);
  assert.ok(ids("p2").includes("npc_entity.npc.smid"));
  assert.equal(ids("p3").includes("npc_entity.npc.smid"), false, "p3 loopt door de smid heen (hij is er niet)");
  assert.ok(ids("p3").includes("npc_entity.npc.boer"));
  // Iedereen die het raakt krijgt een seintje (server-vlag: iedereen online).
  return new Promise((resolve) => setTimeout(() => {
    assert.ok(t.sent.some(([id, payload]) => id === "p3" && payload.type === "quest:refresh"));
    resolve();
  }, 60));
});

test("stap 9: wereld-event: geen toast, iedereen in het gebied doet mee met één teller, al gewonnen, voorbij = mislukt", async () => {
  const t = setup();
  assert.deepEqual(worldEventWindow(30, 10, Date.UTC(2026, 10, 8, 12, 9, 0)).active, true);
  assert.deepEqual(worldEventWindow(30, 10, Date.UTC(2026, 10, 8, 12, 11, 0)).active, false);
  t.n4.tickTimers();
  assert.equal(t.notices.length, 0, "Kevin 8-11: geen losse melding meer (de game toont het event linksonder)");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(["p1", "p2", "p3"].map((id) => t.sent.some(([to, payload]) => to === id && payload.type === "quest:refresh")), [true, true, true], "iedereen haalt de stand op");
  // De game krijgt het event (elke/duurt, gebied) en de klok van de server.
  const view = t.n4.worldEventsView(t.ctx("p1"), new Map());
  assert.deepEqual([view[0].questId, view[0].every, view[0].lasts, view[0].area.id, view[0].joined], ["quest.event", 30, 10, "veld", false]);
  const enter = (id, position) => { const ctx = t.ctx(id, position); t.n4.ensureAvailableQuests(ctx); t.n4.autoStartQuests(ctx); };
  enter("p1", { x: 1, z: 1 });
  enter("p3", { x: -2, z: 3 });
  const byQuest = new Map([["quest.event", t.row("quest.event", "p1")]]);
  assert.equal(t.n4.worldEventsView(t.ctx("p1"), byQuest)[0].joined, true, "de game weet dat p1 meedoet");
  enter("p2", { x: 90, z: 0 });
  assert.equal(t.row("quest.event", "p1").status, "active");
  assert.equal(t.row("quest.event", "p3").status, "active");
  assert.equal(t.row("quest.event", "p2").status, "available", "buiten het gebied doet niet mee");
  t.wood("p1");
  t.wood("p1");
  const progress = (id) => {
    const definition = t.n4.questDefinition(t.ctx(id), "quest.event", t.row("quest.event", id));
    return t.n4.evaluateStepProgress(t.ctx(id), definition, definition.stepsById.s1);
  };
  const goal = progress("p3").objectives[0];
  assert.deepEqual([goal.currentValue, goal.requiredValue, goal.team.size, goal.team.event], [2, 3, 2, true], "p3 ziet de teller van iedereen; het doel blijft 3");
  t.wood("p3");
  assert.equal(t.row("quest.event", "p1").status, "completed");
  assert.equal(t.row("quest.event", "p3").status, "completed", "samen gehaald");
  assert.equal(t.xp("p1"), 10);
  assert.equal(t.xp("p3"), 10);
  enter("p2", { x: 0, z: 0 });
  assert.equal(t.row("quest.event", "p2").status, "available", "al gewonnen: wachten op het volgende event");
  // Volgende event: p1 doet weer mee, maar haalt het niet op tijd.
  t.setClock(Date.UTC(2026, 10, 8, 12, 30, 2));
  t.n4.tickTimers();
  enter("p1", { x: 0, z: 0 });
  assert.equal(t.row("quest.event", "p1").status, "active", "nieuw event = nieuwe run");
  t.wood("p1");
  t.setClock(Date.UTC(2026, 10, 8, 12, 40, 1));
  t.n4.tickTimers();
  assert.equal(t.row("quest.event", "p1").status, "failed", "event voorbij: mislukt");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.ok(t.sent.some(([id, payload]) => id === "p1" && payload.type === "quest:message" && /is voorbij/.test(payload.text)), "questmelding (geen toast)");
  enter("p1", { x: 0, z: 0 });
  assert.equal(t.row("quest.event", "p1").status, "failed", "tussen twee events gebeurt niets");
});

test("stap 10: oude versie overzetten (elke oude stap moet een nieuwe hebben, geen dubbele beloning), waarom vast, logboek", () => {
  const v1 = (extraStep) => BASE.concat([quest("quest.v", [
    { stepId: "s1", kind: "step", objectives: [gather("o1", 1)], next: [{ to: extraStep }] },
    { stepId: extraStep, kind: "step", objectives: [gather("o2", 5)], next: [{ to: "end" }] },
    { stepId: "end", kind: "end" }])]);
  const t = setup(v1("s2"));
  t.party();
  t.n4.acceptQuest(t.ctx("p1"), "quest.v", "op_1");
  t.wood("p1");
  assert.equal(t.row("quest.v", "p1").active_step_id, "s2");
  t.n4.acceptQuest(t.ctx("p2"), "quest.v", "op_2");
  const runId = JSON.parse(t.row("quest.v", "p1").state_json).runId;
  // Nieuwe versie: s2 heet nu s3.
  t.rebuild(v1("s3"));
  const view = t.n4.questVersionsForAdmin("quest.v");
  assert.equal(view.versions.length, 1);
  assert.deepEqual(view.versions[0].steps.filter((step) => step.players).map((step) => [step.id, step.players]).sort(), [["s1", 1], ["s2", 1]]);
  assert.deepEqual(view.current.steps.map((step) => step.id), ["s1", "s3", "end"]);
  const players = t.n4.questPlayersForAdmin("quest.v");
  const p1 = players.find((player) => player.playerId === "p1");
  assert.equal(p1.oldVersion, true);
  assert.equal(p1.partyId, "party1");
  assert.match(players.find((player) => player.playerId === "p2").why, /^Nog: /, "waarom vast: het open doel");
  assert.throws(() => t.n4.migrateQuestVersion("quest.v", view.versions[0].version, { s1: "s1" }), /elke oude stap/);
  // Een beloning die al gegeven is (zelfde run) komt er niet nog eens: p1 gaat direct naar het einde.
  t.n4.claimOnce("p1", "quest.v", "reward:" + runId, "quest_reward");
  const result = t.n4.migrateQuestVersion("quest.v", view.versions[0].version, { s1: "s1", s2: "end" });
  assert.equal(result.moved, 2);
  assert.equal(t.row("quest.v", "p1").status, "completed");
  assert.equal(t.xp("p1"), 0, "geen dubbele beloning");
  const p2 = JSON.parse(t.row("quest.v", "p2").state_json);
  assert.equal(p2.version, t.project().campaigns.quests.byId["quest.v"].version, "p2 loopt nu de nieuwste versie");
  assert.equal(t.row("quest.v", "p2").active_step_id, "s1");
  assert.equal(JSON.parse(t.row("quest.v", "p1").state_json).runId, runId, "zelfde run");
  assert.deepEqual(t.n4.questVersionsForAdmin("quest.v").versions, [], "niemand meer op de oude versie");
  t.wood("p2");
  assert.equal(t.row("quest.v", "p2").active_step_id, "s3", "verder op de nieuwe versie");
  const log = t.n4.questLogForAdmin("quest.v").log;
  assert.ok(log.some((entry) => entry.reason === "migrate" && entry.playerId === "p1" && entry.fromStepId === "s2"));
  assert.ok(t.n4.questLogForAdmin("quest.v", "p2").log.every((entry) => entry.playerId === "p2"));
});

test("Kevin 8-11: quest opnieuw zet ook zijn vlaggen terug; een loopvlak met een vlag is er per speler wel of niet", () => {
  const bridge = doc("area", "area:brug", { areaId: "brug", displayName: "Brug", soort: "loopvlak", pointsMm: [[20000, -2000, 500], [30000, -2000, 500], [30000, 2000, 500], [20000, 2000, 500]],
    flagRef: "world_flag:flag.brug", flagOn: "on" });
  assert.ok(validateDocument("area", bridge.body).ok, "loopvlak met vlag is geldig");
  const t = setup(docs([bridge]));
  t.party();
  t.n4.acceptQuest(t.ctx("p1"), "quest.brug", "op_a");
  t.wood("p1");
  // De brug: alleen p1 en p2 (groep) lopen erover.
  const world = t.mmo.getPublishedWorldContext().world;
  const surface = world.collision.walkableSurfaces.find((entry) => entry.id === "area.brug");
  assert.deepEqual(surface.flag, { id: "flag.brug", on: true });
  const index = createWalkabilityIndex(world);
  const mover = { worldFlags: t.n4.flags };
  const has = (id) => MmoService.prototype.movementIndexFor.call(mover, { walkabilityIndex: index, world }, { player_id: id }, null).walkables.some((entry) => entry.id === "area.brug");
  assert.deepEqual([has("p1"), has("p2"), has("p3")], [true, true, false], "p3 loopt niet over de brug die er voor hem niet is");
  assert.equal(MmoService.prototype.movementIndexFor.call(mover, { walkabilityIndex: index, world }, { player_id: "p1" }, null), index, "geen kopie als alles er is");
  // ↺ Opnieuw (Testen): de vlaggen van die quest door p1 gaan weg (bij hem, zijn groep en op de server).
  t.n4.adminQuestAction({ action: "reset", playerId: "p1", questId: "quest.brug" });
  for (const id of ["p1", "p2", "p3"]) {
    assert.equal(t.n4.flags.isOn(id, "flag.brug"), false, "groep-vlag weg voor " + id);
    assert.equal(t.n4.flags.isOn(id, "flag.server"), false, "server-vlag weg voor " + id);
  }
  assert.equal(t.n4.flags.isOn("p1", "flag.eigen"), false);
  assert.equal(has("p1"), false, "na opnieuw is de brug ook voor p1 weer weg");
  // Een vlag op een loopvlak die geen quest zet: de build zegt het.
  const lonely = doc("area", "area:plank", { areaId: "plank", displayName: "Plank", soort: "loopvlak", pointsMm: [[0, 0, 0], [1000, 0, 0], [1000, 1000, 0]], flagRef: "world_flag:flag.nooit" });
  assert.ok(compileCanonical(docs([flag("flag.nooit", "group"), lonely]), {}).errors.some((error) => error.code === "FLAG_NEVER_SET" && /Plank/.test(error.message)));
});
