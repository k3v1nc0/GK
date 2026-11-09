// Quest Builder stap 6 (6-11): tijd en herhalen. Quest-check bij de build; op de server met een nep-klok: aflopen = mislukt
// (↻ Opnieuw kan), groepsklok gelijk voor alle leden, pauze bij uitloggen, opnieuw of naar een stap bij te laat,
// regels starten/stoppen de klok, en herhalen (elke dag/week vanaf een vast uur, of na een wachttijd).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { compileCanonical } from "../src/server/authoring/build-service.js";
import { buildRuntimeWorld, WORLD_ZONE_ID } from "../src/server/authoring/world-builder.js";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { Node03RuntimeService } from "../src/server/node03-runtime-service.js";
import { Node04QuestRuntimeService } from "../src/server/node04-quest-runtime-service.js";

const doc = (kind, key, body) => ({ docKey: key, kind, body, archived: false, revision: 1, legacyRef: null });
const gather = (id, amount) => ({ objectiveId: id, type: "gather", ref: "resource_definition:bush", amount });
const quest = (id, steps, extra = {}) => doc("quest", "quest:" + id, Object.assign({ questId: id, displayName: id, giverRef: "npc:npc.boer", steps }, extra));

const QUESTS = [
  // Eén klok voor de groep, te laat = mislukt.
  quest("quest.klok", [
    { stepId: "s1", kind: "step", objectives: [gather("o1", 3)], timer: { seconds: 120, share: "group" }, next: [{ to: "end" }] },
    { stepId: "end", kind: "end" }]),
  // Eigen klok die stilstaat bij uitloggen; te laat = de stap begint opnieuw.
  quest("quest.pauze", [
    { stepId: "s1", kind: "step", objectives: [gather("o1", 3)], timer: { seconds: 60, logout: "pause", late: "restart" },
      rules: [{ ruleId: "r1", when: "start", then: "message", text: "Snel!" }], next: [{ to: "end" }] },
    { stepId: "end", kind: "end" }]),
  // Een regel start de klok (bij 2 hout) en stopt hem (bij 4 hout); te laat = naar stap s2.
  quest("quest.regel", [
    { stepId: "s1", kind: "step", objectives: [gather("o1", 5)], timer: { seconds: 30, start: "rule", late: "step", lateTo: "s2" },
      rules: [{ ruleId: "r1", when: "count", objectiveId: "o1", amount: 2, then: "timer_start" },
        { ruleId: "r2", when: "count", objectiveId: "o1", amount: 4, then: "timer_stop" }], next: [{ to: "end" }] },
    { stepId: "s2", kind: "step", objectives: [gather("o2", 1)], next: [{ to: "end" }] },
    { stepId: "end", kind: "end" }]),
  quest("quest.dag", [{ stepId: "s1", kind: "step", objectives: [gather("o1", 1)], next: [{ to: "end" }] }, { stepId: "end", kind: "end" }], { repeat: "daily", repeatHour: 6 }),
  quest("quest.week", [{ stepId: "s1", kind: "step", objectives: [gather("o1", 1)], next: [{ to: "end" }] }, { stepId: "end", kind: "end" }], { repeat: "weekly", repeatHour: 6 }),
  quest("quest.wacht", [{ stepId: "s1", kind: "step", objectives: [gather("o1", 1)], next: [{ to: "end" }] }, { stepId: "end", kind: "end" }], { repeat: "cooldown", repeatMinutes: 30 }),
  quest("quest.oud", [{ stepId: "s1", kind: "step", objectives: [gather("o1", 1)], next: [{ to: "end" }] }, { stepId: "end", kind: "end" }], { repeatable: true })
];

function docs(extra = []) {
  return [
    doc("project_settings", "project_settings", { gameName: "GK", maxLevel: 50 }),
    doc("item_definition", "item_definition:wood", { itemId: "wood", displayName: "Hout", category: "material", rarity: "common", stackable: true, stackLimit: 99 }),
    doc("loot_table", "loot_table:wood", { lootTableId: "wood", displayName: "Hout", entries: [{ itemRef: "item_definition:wood", chanceBp: 10000, minQty: 1, maxQty: 1 }] }),
    doc("resource_definition", "resource_definition:bush", { resourceId: "bush", displayName: "Struik", lootTableRef: "loot_table:wood", gatherRangeMm: 2000, radiusMm: 600, respawnMs: 10000 }),
    doc("npc", "npc:npc.boer", { npcId: "npc.boer", displayName: "Boer", x: -4, y: 0, z: 4 })
  ].concat(QUESTS, extra);
}

test("stap 6: quest-check zegt wat er mist bij de klok", () => {
  const broken = quest("quest.kapot", [
    { stepId: "s1", kind: "step", objectives: [gather("o1", 1)], timer: { start: "rule", late: "step" },
      rules: [{ ruleId: "r1", when: "start", then: "message", text: "Hoi" }], next: [{ to: "end" }] },
    { stepId: "s2", kind: "step", objectives: [gather("o1", 1)], rules: [{ ruleId: "r1", when: "start", then: "timer_stop" }], next: [{ to: "end" }] },
    { stepId: "end", kind: "end" }]);
  const messages = compileCanonical(docs([broken]), {}).errors.filter((error) => error.code === "QUEST_CHECK").map((error) => error.message).join(" | ");
  assert.match(messages, /vul in binnen hoeveel tijd/);
  assert.match(messages, /de klok start nooit/);
  assert.match(messages, /kies naar welke stap/);
  assert.match(messages, /deze stap heeft geen klok/);
  assert.match(messages, /nooit bereikt/, "s2 is alleen via te laat te halen, maar hier staat geen stap gekozen");
  // Een stap die je alleen haalt als je te laat bent, is wel bereikbaar.
  assert.deepEqual(compileCanonical(docs(), {}).errors, []);
  assert.ok(validateDocument("quest", { questId: "q.a", displayName: "A", steps: [{ stepId: "s1", kind: "step", timer: { seconds: 2 } }] }).issues.some((issue) => /tijd moet tussen/.test(issue.message)));
});

test("stap 6: build zet de klok en hoe vaak (oude quests houden hun versie)", () => {
  const compiled = compileCanonical(docs(), {});
  const quests = buildRuntimeWorld(JSON.parse(compiled.files["server.json"].text)).gameProject.campaigns.quests.byId;
  assert.deepEqual(quests["quest.klok"].stepsById.s1.timer, { seconds: 120, start: "step", share: "group", late: "fail", lateTo: null, logout: "run" });
  assert.equal(quests["quest.regel"].stepsById.s1.timer.lateTo, "s2");
  assert.equal(quests["quest.regel"].stepsById.s1.rules[0].then, "timer_start");
  assert.equal("timer" in quests["quest.regel"].stepsById.s2, false);
  assert.equal(quests["quest.dag"].repeatMode, "daily");
  assert.equal(quests["quest.dag"].repeatHour, 6);
  assert.equal(quests["quest.wacht"].repeatMode, "cooldown");
  assert.equal(quests["quest.wacht"].repeatMinutes, 30);
  assert.equal(quests["quest.oud"].repeatMode, "repeatable", "oud: Herhaalbaar aan = zo vaak als hij wil");
  assert.equal("repeatHour" in quests["quest.oud"], false);
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
  const ctx = (id = "p1") => ({ profile: { id }, worldId: "world.main", zoneId: WORLD_ZONE_ID, project, catalogs: project.catalogs, position: { x: 3, z: 4 } });
  node03.adminContextForPlayer = (id) => Object.assign(ctx(id), { position: null });
  const sent = [];
  const online = new Set(["p1", "p2"]);
  const mmo = { sendToPlayer: (id, payload) => sent.push([id, payload]), partyRuntime: { notice: () => {} }, getConnectionForPlayer: (id) => (online.has(id) ? { id } : null) };
  const n4 = new Node04QuestRuntimeService(db, null, mmo, node03);
  clearInterval(n4.timerTick);
  let clock = Date.UTC(2026, 10, 6, 12, 0, 0);
  n4.clock = () => clock;
  const tick = (ms) => { clock += ms; n4.tickTimers(); };
  const row = (questId, id = "p1") => db.prepare("SELECT * FROM player_quest_states WHERE player_id = ? AND quest_id = ?").get(id, questId);
  const timer = (questId, id = "p1") => JSON.parse(row(questId, id)?.state_json || "{}").timer || null;
  let event = 0;
  const wood = (id = "p1") => { event += 1; n4.onQuestEvent(ctx(id), [id], { type: "gather", refId: "bush", eventKey: "gather:" + event, operationId: "op_g" + event, at: { x: 0, z: 0 } }); };
  const party = () => {
    db.prepare("INSERT INTO parties (id, leader_player_id, loot_policy_id, revision, created_at, updated_at) VALUES ('party1', 'p1', 'loot.free', 1, ?, ?)").run(stamp, stamp);
    for (const id of ["p1", "p2"]) db.prepare("INSERT INTO party_members (party_id, player_id, role, joined_at) VALUES ('party1', ?, 'member', ?)").run(id, stamp);
  };
  return { db, n4, ctx, row, timer, tick, wood, party, online, sent, now: () => clock, setClock: (ms) => { clock = ms; } };
}

test("stap 6: de groepsklok loopt bij jou en je groepsgenoot gelijk; aflopen = mislukt, ↻ Opnieuw = nieuwe poging", async () => {
  const t = setup();
  t.party();
  t.n4.acceptQuest(t.ctx("p1"), "quest.klok", "op_a1");
  const endsAt = t.timer("quest.klok").endsAt;
  assert.equal(endsAt, t.now() + 120000);
  t.tick(30000);
  t.n4.acceptQuest(t.ctx("p2"), "quest.klok", "op_a2");
  assert.equal(t.timer("quest.klok", "p2").endsAt, endsAt, "p2 komt later in de stap en krijgt dezelfde eindtijd");
  const view = t.n4.timerView(t.row("quest.klok"), t.n4.questDefinition(t.ctx(), "quest.klok", t.row("quest.klok")).stepsById.s1);
  assert.equal(view.leftMs, 90000);
  assert.equal(view.share, "group");
  t.wood("p1");
  t.tick(89000);
  assert.equal(t.row("quest.klok").status, "active");
  t.tick(1000);
  assert.equal(t.row("quest.klok").status, "failed");
  assert.equal(t.row("quest.klok", "p2").status, "failed", "dezelfde klok: allebei te laat");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.ok(t.sent.some(([id, payload]) => id === "p2" && payload.type === "quest:message" && /Te laat! De quest is mislukt/.test(payload.text)), "bericht in beeld");
  assert.equal(t.n4.loadObjectiveProgress("p1", "quest.klok", "s1").size, 0, "voortgang weg");
  // ↻ Opnieuw: een nieuwe run met een nieuwe klok.
  t.n4.acceptQuest(t.ctx("p1"), "quest.klok", "op_again");
  assert.equal(t.row("quest.klok").status, "active");
  assert.equal(t.timer("quest.klok").endsAt, t.now() + 120000);
});

test("stap 6: eigen klok staat stil bij uitloggen en loopt verder als je terug bent; te laat = de stap begint opnieuw", async () => {
  const t = setup();
  t.n4.acceptQuest(t.ctx("p1"), "quest.pauze", "op_a");
  const first = t.timer("quest.pauze").endsAt;
  t.wood("p1");
  t.tick(10000);
  t.online.delete("p1");
  t.tick(1000);
  assert.ok(t.timer("quest.pauze").pausedAt, "uitgelogd: de klok staat stil");
  t.tick(600000);
  assert.equal(t.row("quest.pauze").status, "active", "10 minuten weg: niet te laat");
  t.online.add("p1");
  t.tick(1000);
  const resumed = t.timer("quest.pauze");
  assert.equal(resumed.pausedAt, undefined);
  assert.equal(resumed.endsAt, first + 601000, "de klok loopt verder waar hij was");
  t.setClock(resumed.endsAt);
  t.n4.tickTimers();
  assert.equal(t.row("quest.pauze").status, "active");
  assert.equal(t.row("quest.pauze").active_step_id, "s1");
  assert.equal(t.n4.loadObjectiveProgress("p1", "quest.pauze", "s1").get("o1")?.current_value || 0, 0, "de stap begint leeg");
  assert.equal(t.timer("quest.pauze").endsAt, t.now() + 60000, "nieuwe klok");
  await new Promise((resolve) => setTimeout(resolve, 60));
  const texts = t.sent.filter(([id, payload]) => id === "p1" && payload.type === "quest:message").map(([, payload]) => payload.text);
  assert.equal(texts.filter((text) => text === "Snel!").length, 2, "de regels van de stap gaan opnieuw");
  assert.ok(texts.includes("⏱️ Te laat! De stap begint opnieuw."));
});

test("stap 6: een regel start en stopt de klok; te laat gaat naar een andere stap", () => {
  const t = setup();
  t.n4.acceptQuest(t.ctx("p1"), "quest.regel", "op_a");
  assert.equal(t.timer("quest.regel"), null, "start pas door de regel");
  t.wood("p1");
  t.wood("p1");
  assert.equal(t.timer("quest.regel").endsAt, t.now() + 30000, "bij 2 hout start de klok");
  t.wood("p1");
  t.wood("p1");
  assert.equal(t.timer("quest.regel").stopped, true, "bij 4 hout gestopt (gehaald)");
  t.tick(60000);
  assert.equal(t.row("quest.regel").active_step_id, "s1", "gestopte klok: niet te laat");
  // Nieuwe poging waarin je te laat bent: naar s2.
  const t2 = setup();
  t2.n4.acceptQuest(t2.ctx("p1"), "quest.regel", "op_b");
  t2.wood("p1");
  t2.wood("p1");
  t2.tick(30000);
  assert.equal(t2.row("quest.regel").active_step_id, "s2");
  assert.equal(t2.timer("quest.regel"), null);
  t2.wood("p1");
  assert.equal(t2.row("quest.regel").status, "completed");
});

test("stap 6: herhalen elke dag of week vanaf 06:00, of na een wachttijd", () => {
  const t = setup();
  const done = (questId, at) => {
    t.n4.acceptQuest(t.ctx(), questId, "op_" + questId + at);
    t.wood();
    assert.equal(t.row(questId).status, "completed");
    t.db.prepare("UPDATE player_quest_states SET completed_at = ? WHERE player_id = 'p1' AND quest_id = ?").run(new Date(at).toISOString(), questId);
  };
  const local = (day, hour, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();
  // Vrijdag 6-11 10:00 gedaan: zaterdag 05:59 nog niet, 06:00 wel.
  done("quest.dag", local(6, 10));
  t.setClock(local(7, 5, 59));
  assert.match(t.n4.acceptQuest(t.ctx(), "quest.dag", "op_d1").message, /weer doen vanaf/);
  t.setClock(local(7, 6));
  assert.match(t.n4.acceptQuest(t.ctx(), "quest.dag", "op_d2").message, /Quest aangenomen/);
  // Wekelijks: pas maandag 9-11 06:00.
  done("quest.week", local(6, 10));
  t.setClock(local(8, 23));
  assert.match(t.n4.acceptQuest(t.ctx(), "quest.week", "op_w1").message, /weer doen vanaf/);
  t.setClock(local(9, 6));
  assert.match(t.n4.acceptQuest(t.ctx(), "quest.week", "op_w2").message, /Quest aangenomen/);
  // Wachttijd 30 minuten.
  done("quest.wacht", local(6, 10));
  t.setClock(local(6, 10, 29));
  assert.match(t.n4.acceptQuest(t.ctx(), "quest.wacht", "op_c1").message, /weer doen vanaf/);
  const summary = t.n4.buildQuestSummary(t.ctx(), t.ctx().project.campaigns.quests.byId["quest.wacht"], t.row("quest.wacht"));
  assert.equal(Date.parse(summary.repeatAt), local(6, 10, 30));
  t.setClock(local(6, 10, 30));
  assert.match(t.n4.acceptQuest(t.ctx(), "quest.wacht", "op_c2").message, /Quest aangenomen/);
});
