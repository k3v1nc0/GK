// MMO stap 1 (3-11): groep uitnodigen, meedoen, nee, verlaten, en de groep live naar de leden.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { CANONICAL_KINDS, validateDocument } from "../src/shared/authoring/kinds.js";
import { partyValues } from "../src/shared/authoring/kinds/party.js";
import { compileGameSection } from "../src/server/authoring/game-compiler.js";
import { Node05EconomyRuntimeService } from "../src/server/node05-economy-runtime-service.js";
import { PartyRuntime, partyRulesFromProject } from "../src/server/runtime/party-runtime.js";

test("Instellingen > Groep: standaard, grenzen en compileren", () => {
  assert.equal(CANONICAL_KINDS.party_settings.place, "instellingen");
  assert.deepEqual(partyValues(null), { maxMembers: 5, whoCanInvite: "all", inviteTimeoutS: 60, holdMs: 500, farMeters: 60 });
  assert.deepEqual(partyValues({ maxMembers: 99, whoCanInvite: "iedereen", holdMs: 10 }), { maxMembers: 40, whoCanInvite: "all", inviteTimeoutS: 60, holdMs: 250, farMeters: 60 });
  assert.equal(validateDocument("party_settings", { maxMembers: 1 }).ok, false, "minder dan 2 kan niet");
  const doc = { docKey: "party_settings:party_settings", kind: "party_settings", archived: false, body: { maxMembers: 8, whoCanInvite: "leader" } };
  const section = compileGameSection([doc], {});
  assert.equal(section.server.party.maxMembers, 8);
  assert.equal(section.server.party.whoCanInvite, "leader");
  assert.equal(partyRulesFromProject({ playerRules: { byType: { party_rules: [{ id: "rules.party", maxMembers: 3 }] } } }).maxMembers, 3);
  assert.equal(partyRulesFromProject({}).maxMembers, 5, "zonder regels de standaard");
});

function setup(rules = {}) {
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort()) db.exec(fs.readFileSync("db/migrations/" + file, "utf8"));
  const stamp = new Date().toISOString();
  const players = [["p1", "anna"], ["p2", "bob"], ["p3", "cees"], ["p4", "dirk"]];
  for (const [id, name] of players) {
    db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES (?, ?, 'x', 'x', 'player', ?, ?)").run("u" + id, name, stamp, stamp);
    db.prepare("INSERT INTO player_profiles (id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at) VALUES (?, ?, ?, 'class.healer', 'world.main', ?, ?)").run(id, "u" + id, name, stamp, stamp);
    db.prepare("INSERT INTO player_stats (player_id, stat_id, base_value, earned_value, current_value, updated_at) VALUES (?, 'stat.health', 100, 0, 80, ?)").run(id, stamp);
    db.prepare("INSERT INTO player_stats (player_id, stat_id, base_value, earned_value, current_value, updated_at) VALUES (?, 'stat.mana', 50, 0, 50, ?)").run(id, stamp);
  }
  const project = {
    catalogs: { playableCharacters: { "class.healer": { id: "class.healer", displayName: "Healer", classChoice: true } } },
    playerRules: { byType: { party_rules: [Object.assign({ id: "rules.party" }, partyValues(rules))] } }
  };
  const online = new Set(["p1", "p2", "p3"]);
  const sent = [];
  const runtime = new PartyRuntime({
    db, project: () => project,
    playerStates: () => Array.from(online).map((id) => ({ player_id: id })),
    connectionFor: (playerId) => (online.has(playerId) ? { playerId } : null),
    sendToPlayer: (playerId, payload) => { sent.push(Object.assign({ to: playerId }, payload)); return online.has(playerId); },
    defer: (fn) => fn()
  });
  const mmoService = {
    partyRuntime: runtime,
    getConnectionForPlayer: (playerId) => (online.has(playerId) ? {} : null),
    countConnectedPlayerSessions: (playerId) => (online.has(playerId) ? 1 : 0)
  };
  const svc = Object.create(Node05EconomyRuntimeService.prototype);
  svc.db = db;
  svc.mmoService = mmoService;
  svc.node03RuntimeService = { recordGameplayEvent: () => {} };
  const ctx = (id) => ({ profile: { id }, worldId: "world.main", zoneId: "zone.start", project, catalogs: project.catalogs, position: { x: 0, z: 0 } });
  const act = (id, action, payload = {}) => svc.performAction(ctx(id), action, payload, "op_" + Math.random());
  const lastTo = (to, type) => sent.filter((entry) => entry.to === to && entry.type === type).pop() || null;
  return { db, svc, runtime, online, sent, ctx, act, lastTo };
}

test("uitnodigen en meedoen: groep met leider, live stand naar beide leden", () => {
  const { act, lastTo, db } = setup();
  const invited = act("p1", "party_invite", { targetPlayerId: "p2" });
  assert.match(invited.message, /bob/);
  const invite = lastTo("p2", "party:invite");
  assert.equal(invite.invite.fromName, "anna");
  assert.ok(invite.invite.leftMs > 50000 && invite.invite.leftMs <= 60000, "60 s geldig");
  assert.equal(db.prepare("SELECT party_id FROM party_invites WHERE id = ?").get(invite.invite.inviteId).party_id, null, "nog geen groep tot iemand ja zegt");
  act("p2", "party_accept", { inviteId: invite.invite.inviteId });
  const state = lastTo("p2", "party:state").party;
  assert.equal(state.leaderId, "p1");
  assert.deepEqual(state.members.map((m) => [m.id, m.name, m.leader, m.level, m.hp, m.hpMax, m.mp, m.className]),
    [["p1", "anna", true, 1, 80, 100, 50, "Healer"], ["p2", "bob", false, 1, 80, 100, 50, "Healer"]]);
  assert.equal(lastTo("p1", "party:state").party.members.length, 2);
  assert.match(lastTo("p1", "party:notice").text, /bob doet mee/);
});

test("niet online, al in een groep, vol, alleen de leider", () => {
  const { act, lastTo } = setup({ maxMembers: 2, whoCanInvite: "leader" });
  assert.throws(() => act("p1", "party_invite", { targetPlayerId: "p4" }), (error) => error.status === 409 && /niet online/.test(error.message));
  act("p1", "party_invite", { targetPlayerId: "p2" });
  act("p2", "party_accept", { inviteId: lastTo("p2", "party:invite").invite.inviteId });
  assert.throws(() => act("p3", "party_invite", { targetPlayerId: "p2" }), (error) => error.status === 409 && /al in een groep/.test(error.message));
  assert.throws(() => act("p2", "party_invite", { targetPlayerId: "p3" }), (error) => error.status === 403 && /leider/.test(error.message));
  assert.throws(() => act("p1", "party_invite", { targetPlayerId: "p3" }), (error) => error.status === 409 && /vol/.test(error.message));
});

test("nee zeggen: melding naar wie uitnodigde, uitnodiging is weg", () => {
  const { act, lastTo } = setup();
  act("p1", "party_invite", { targetPlayerId: "p3" });
  const inviteId = lastTo("p3", "party:invite").invite.inviteId;
  act("p3", "party_decline", { inviteId });
  assert.match(lastTo("p1", "party:notice").text, /cees doet nu niet mee/);
  assert.throws(() => act("p3", "party_accept", { inviteId }), (error) => error.status === 404);
});

test("verlaten: leider gaat door, opnieuw meedoen kan, laatste lid = groep opgeheven", () => {
  const { act, lastTo, db } = setup();
  act("p1", "party_invite", { targetPlayerId: "p2" });
  act("p2", "party_accept", { inviteId: lastTo("p2", "party:invite").invite.inviteId });
  act("p1", "party_invite", { targetPlayerId: "p3" });
  act("p3", "party_accept", { inviteId: lastTo("p3", "party:invite").invite.inviteId });
  // cees deed eerder mee dan bob straks opnieuw (in de test kan dat in dezelfde milliseconde vallen).
  db.prepare("UPDATE party_members SET joined_at = '2000-01-01T00:00:00.000Z' WHERE player_id = 'p3'").run();
  act("p2", "party_leave");
  assert.equal(lastTo("p2", "party:state").party, null, "wie weggaat krijgt 'geen groep'");
  assert.equal(lastTo("p1", "party:state").party.members.length, 2);
  // Opnieuw in dezelfde groep (zelfde speler + groep stond al in de tabel).
  act("p1", "party_invite", { targetPlayerId: "p2" });
  act("p2", "party_accept", { inviteId: lastTo("p2", "party:invite").invite.inviteId });
  assert.equal(lastTo("p2", "party:state").party.members.length, 3);
  act("p1", "party_leave");
  const after = lastTo("p3", "party:state").party;
  assert.equal(after.leaderId, "p3", "wie het langst in de groep zit wordt leider");
  assert.match(lastTo("p3", "party:notice").text, /cees is nu de leider/);
  act("p2", "party_leave");
  assert.equal(lastTo("p3", "party:state").party, null, "alleen over = groep opgeheven");
  assert.match(lastTo("p3", "party:notice").text, /opgeheven/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM parties WHERE disbanded_at IS NULL").get().n, 0);
});

test("live: elke seconde alleen versturen als er iets veranderde", () => {
  const { act, lastTo, runtime, sent, db, online } = setup();
  act("p1", "party_invite", { targetPlayerId: "p2" });
  act("p2", "party_accept", { inviteId: lastTo("p2", "party:invite").invite.inviteId });
  sent.length = 0;
  runtime.tick("world.main", 10000);
  runtime.tick("world.main", 11000);
  assert.equal(sent.filter((entry) => entry.type === "party:state").length, 0, "niets veranderd = niets versturen");
  db.prepare("UPDATE player_stats SET current_value = 40 WHERE player_id = 'p2' AND stat_id = 'stat.health'").run();
  runtime.tick("world.main", 11500);
  assert.equal(sent.length, 0, "binnen een seconde nog niet");
  runtime.tick("world.main", 12000);
  assert.deepEqual(sent.filter((entry) => entry.type === "party:state").map((entry) => entry.to).sort(), ["p1", "p2"]);
  assert.equal(lastTo("p1", "party:state").party.members.find((m) => m.id === "p2").hp, 40);
  sent.length = 0;
  online.delete("p2");
  runtime.tick("world.main", 13000);
  assert.equal(lastTo("p1", "party:state").party.members.find((m) => m.id === "p2").online, false, "offline is te zien");
});

test("lichte route: antwoord is alleen de groep, zelfde operationId = niets dubbel", () => {
  const { svc, ctx, lastTo } = setup();
  svc.getRequestContext = (req) => ctx(req.player);
  svc.performAction(ctx("p1"), "party_invite", { targetPlayerId: "p2" }, "op_a");
  const inviteId = lastTo("p2", "party:invite").invite.inviteId;
  const result = svc.partyActionForRequest({ player: "p2" }, { action: "accept", inviteId, operationId: "op_accept_1" });
  assert.equal(result.ok, true);
  assert.equal(result.party.members.length, 2);
  assert.equal(result.snapshot, undefined, "geen hele handels-snapshot");
  const again = svc.partyActionForRequest({ player: "p2" }, { action: "accept", inviteId, operationId: "op_accept_1" });
  assert.equal(again.idempotent, true);
  assert.throws(() => svc.partyActionForRequest({ player: "p2" }, { action: "dansen" }), (error) => error.status === 400);
});

test("leider: iemand uit de groep zetten en uitnodigen voor leden aan/uit", () => {
  const { act, lastTo, db, online } = setup({ whoCanInvite: "all" });
  act("p1", "party_invite", { targetPlayerId: "p2" });
  act("p2", "party_accept", { inviteId: lastTo("p2", "party:invite").invite.inviteId });
  act("p2", "party_invite", { targetPlayerId: "p3" });
  act("p3", "party_accept", { inviteId: lastTo("p3", "party:invite").invite.inviteId });
  assert.throws(() => act("p2", "party_kick", { targetPlayerId: "p3" }), (error) => error.status === 403, "alleen de leider zet iemand eruit");
  assert.throws(() => act("p2", "party_invite_rule", { rule: "leader" }), (error) => error.status === 403);
  // Leider zet uitnodigen voor leden uit: bob mag niet meer, de groep ziet het.
  assert.match(act("p1", "party_invite_rule", { rule: "leader" }).message, /Alleen de leider/);
  assert.equal(lastTo("p2", "party:state").party.whoCanInvite, "leader");
  assert.match(lastTo("p2", "party:notice").text, /Alleen de leider mag nu uitnodigen/);
  online.add("p4");
  assert.throws(() => act("p2", "party_invite", { targetPlayerId: "p4" }), (error) => error.status === 403 && /leider/.test(error.message));
  act("p1", "party_invite_rule", { rule: "all" });
  assert.equal(lastTo("p3", "party:state").party.whoCanInvite, "all");
  // Eruit zetten: cees krijgt "geen groep" en een melding, de rest ziet 2 leden.
  assert.match(act("p1", "party_kick", { targetPlayerId: "p3" }).message, /cees is uit de groep gezet/);
  assert.equal(lastTo("p3", "party:state").party, null);
  assert.match(lastTo("p3", "party:notice").text, /anna heeft je uit de groep gezet/);
  assert.equal(lastTo("p2", "party:state").party.members.length, 2);
  assert.throws(() => act("p1", "party_kick", { targetPlayerId: "p3" }), (error) => error.status === 404);
  // Laatste lid eruit = groep opgeheven.
  act("p1", "party_kick", { targetPlayerId: "p2" });
  assert.equal(lastTo("p1", "party:state").party, null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM parties WHERE disbanded_at IS NULL").get().n, 0);
});
