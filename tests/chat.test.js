// MMO stap 2 (3-11): chat (Buurt, Groep, Fluisteren), spam-rem, woorden wegsterren en blokkeren.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { CANONICAL_KINDS } from "../src/shared/authoring/kinds.js";
import { chatBadWords, chatQuickList, chatValues } from "../src/shared/authoring/kinds/chat.js";
import { compileGameSection } from "../src/server/authoring/game-compiler.js";
import { ChatRuntime, cleanChatText, starWords, wordPatterns } from "../src/server/runtime/chat-runtime.js";
import { PartyRuntime } from "../src/server/runtime/party-runtime.js";
import { Node05EconomyRuntimeService } from "../src/server/node05-economy-runtime-service.js";
import { validateClientMessage } from "../apps/web/public/shared/protocol-v1.js";

test("Instellingen > Chat: standaard, grenzen, snelle berichten en woordenlijst", () => {
  assert.equal(CANONICAL_KINDS.chat_settings.place, "instellingen");
  const values = chatValues(null);
  assert.equal(values.nearMeters, 40);
  assert.equal(values.perTenSeconds, 5);
  assert.deepEqual(chatQuickList(values), ["👋 Hoi!", "Help!", "Bedankt!", "Kom hier!", "Volg mij!"]);
  assert.equal(chatValues({ nearMeters: 9999, maxLength: 1 }).nearMeters, 300);
  assert.equal(chatValues({ maxLength: 1 }).maxLength, 20);
  assert.deepEqual(chatBadWords({ badWords: "Rot, sukkel;  rot \n x" }), ["rot", "sukkel"], "dubbel en te kort eruit");
  const section = compileGameSection([{ docKey: "chat_settings:chat_settings", kind: "chat_settings", archived: false, body: { nearMeters: 25 } }], {});
  assert.equal(section.server.chat.nearMeters, 25);
});

test("tekst schoonmaken en woorden wegsterren (hele woorden, * = ook langer)", () => {
  assert.equal(cleanChatText("  hoi\u0000\n\n  daar  ", 160), "hoi daar");
  assert.equal(cleanChatText("😀😀😀😀", 3), "😀😀😀", "emoji telt als één teken");
  const patterns = wordPatterns(["sukkel", "rot*"]);
  assert.equal(starWords("Jij SUKKEL!", patterns), "Jij ******!");
  assert.equal(starWords("sukkels en rotzak", patterns), "sukkels en ******", "sukkels is een ander woord, rot* vangt rotzak");
  assert.equal(starWords("parot", patterns), "parot", "niet midden in een woord");
});

function setup(rules = {}) {
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort()) db.exec(fs.readFileSync("db/migrations/" + file, "utf8"));
  const stamp = new Date().toISOString();
  for (const [id, name] of [["p1", "anna"], ["p2", "Bob"], ["p3", "cees"], ["p4", "dirk"]]) {
    db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES (?, ?, 'x', 'x', 'player', ?, ?)").run("u" + id, name, stamp, stamp);
    db.prepare("INSERT INTO player_profiles (id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at) VALUES (?, ?, ?, 'class.healer', 'world.main', ?, ?)").run(id, "u" + id, name, stamp, stamp);
  }
  const project = { catalogs: { playableCharacters: {} }, playerRules: { byType: { chat_rules: [Object.assign({ id: "rules.chat" }, chatValues(rules))] } } };
  const online = new Set(["p1", "p2", "p3"]);
  const states = [
    { player_id: "p1", world_id: "world.main", current_zone_id: "zone.a", x: 0, z: 0 },
    { player_id: "p2", world_id: "world.main", current_zone_id: "zone.a", x: 10, z: 0 },
    { player_id: "p3", world_id: "world.main", current_zone_id: "zone.a", x: 100, z: 0 },
    { player_id: "p4", world_id: "world.main", current_zone_id: "zone.a", x: 1, z: 0 }
  ];
  const sent = [];
  const sendToPlayer = (to, payload) => { sent.push(Object.assign({ to }, payload)); return online.has(to); };
  const party = new PartyRuntime({ db, project: () => project, playerStates: () => states, connectionFor: (id) => (online.has(id) ? {} : null), sendToPlayer, defer: (fn) => fn() });
  const chat = new ChatRuntime({ db, project: () => project, playerStates: () => states, connectionFor: (id) => (online.has(id) ? {} : null), sendToPlayer,
    partyMemberIds: (id) => party.memberIds(id) });
  const say = (id, payload) => chat.handle({ player: { id, display_name: id === "p2" ? "Bob" : id }, worldId: "world.main" }, { type: "chat:send", payload });
  const block = (id, playerId, on = true) => chat.handle({ player: { id }, worldId: "world.main" }, { type: "chat:block", payload: { playerId, on } });
  const got = (to) => sent.filter((entry) => entry.to === to && entry.type === "chat:message").map((entry) => entry.message.text);
  const lastError = (to) => sent.filter((entry) => entry.to === to && entry.type === "chat:error").pop()?.text || "";
  return { db, chat, party, online, states, sent, say, block, got, lastError, project };
}

test("Buurt: alleen online spelers dichtbij in dezelfde zone; jij ziet hoeveel het hoorden", () => {
  const { say, got, sent, states } = setup();
  assert.equal(say("p1", { channel: "near", text: "hallo" }).ok, true);
  assert.deepEqual(got("p2"), ["hallo"], "Bob staat op 10 m");
  assert.deepEqual(got("p3"), [], "cees staat op 100 m");
  assert.deepEqual(got("p4"), [], "dirk is offline");
  assert.equal(sent.filter((entry) => entry.to === "p1" && entry.type === "chat:message").pop().heard, 1);
  states[1].current_zone_id = "zone.b";
  say("p1", { channel: "near", text: "nog eens" });
  assert.deepEqual(got("p2"), ["hallo"], "andere zone hoort niets");
});

test("Groep en Fluisteren: alleen de groep, of één speler (naam zonder hoofdletters)", () => {
  const { say, got, lastError, db, party } = setup();
  say("p1", { channel: "party", text: "groep?" });
  assert.match(lastError("p1"), /niet in een groep/);
  const stamp = new Date().toISOString();
  db.prepare("INSERT INTO parties (id, leader_player_id, loot_policy_id, revision, created_at, updated_at) VALUES ('party1', 'p1', 'loot.free', 1, ?, ?)").run(stamp, stamp);
  for (const id of ["p1", "p3"]) db.prepare("INSERT INTO party_members (party_id, player_id, role, joined_at) VALUES ('party1', ?, 'member', ?)").run(id, stamp);
  party.partyOf.clear(); // (in de game doet de groepsactie dit zelf)
  say("p1", { channel: "party", text: "wij samen" });
  assert.deepEqual(got("p3"), ["wij samen"], "groepslid ver weg krijgt het toch");
  assert.deepEqual(got("p2"), []);
  say("p1", { channel: "whisper", toName: "bob", text: "psst" });
  assert.deepEqual(got("p2"), ["psst"]);
  assert.deepEqual(got("p3"), ["wij samen"], "fluisteren is privé");
  say("p1", { channel: "whisper", toName: "dirk", text: "hoi" });
  assert.match(lastError("p1"), /dirk is niet online/);
  say("p1", { channel: "whisper", toName: "anna", text: "ik" });
  assert.match(lastError("p1"), /naar jezelf/);
  say("p1", { channel: "whisper", toName: "niemand", text: "hoi" });
  assert.match(lastError("p1"), /niet gevonden/);
});

test("spam-rem: hooguit N per 10 s en niet meteen hetzelfde bericht", () => {
  const { say, lastError } = setup({ perTenSeconds: 2 });
  assert.equal(say("p1", { channel: "near", text: "een" }).ok, true);
  assert.equal(say("p1", { channel: "near", text: "een" }).ok, false);
  assert.match(lastError("p1"), /net al/);
  assert.equal(say("p1", { channel: "near", text: "twee" }).ok, true);
  assert.equal(say("p1", { channel: "near", text: "drie" }).ok, false);
  assert.match(lastError("p1"), /Rustig aan/);
  assert.equal(say("p1", { channel: "near", text: "   " }).ok, false);
});

test("blokkeren: geen berichten, geen fluisteren, geen uitnodiging; blijft bewaard; deblokkeren", () => {
  const { say, block, got, lastError, sent, db, chat, online, project } = setup();
  block("p2", "p1");
  assert.deepEqual(sent.filter((entry) => entry.to === "p2" && entry.type === "chat:blocks").pop().blocks, [{ id: "p1", name: "anna" }]);
  say("p1", { channel: "near", text: "hoor je mij" });
  assert.deepEqual(got("p2"), [], "Bob blokkeerde anna");
  say("p1", { channel: "whisper", toName: "Bob", text: "hallo" });
  assert.match(lastError("p1"), /wil geen berichten/);
  say("p2", { channel: "whisper", toName: "anna", text: "hallo" });
  assert.match(lastError("p2"), /geblokkeerd/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM player_blocks").get().n, 1, "blijft bewaard");
  // Uitnodigen voor een groep kan ook niet.
  const svc = Object.create(Node05EconomyRuntimeService.prototype);
  svc.db = db;
  svc.mmoService = { chatRuntime: chat, partyRuntime: null, getConnectionForPlayer: (id) => (online.has(id) ? {} : null), countConnectedPlayerSessions: (id) => (online.has(id) ? 1 : 0) };
  svc.node03RuntimeService = { recordGameplayEvent: () => {} };
  const ctx = { profile: { id: "p1" }, worldId: "world.main", zoneId: "zone.a", project, catalogs: project.catalogs, position: { x: 0, z: 0 } };
  assert.throws(() => svc.performAction(ctx, "party_invite", { targetPlayerId: "p2" }, "op_block"), (error) => error.status === 403 && /uitnodigingen/.test(error.message));
  block("p2", "p1", false);
  say("p1", { channel: "near", text: "en nu?" });
  assert.deepEqual(got("p2"), ["en nu?"]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM player_blocks").get().n, 0);
});

test("verbinding: chat-berichten worden gecontroleerd voordat de server ze leest", () => {
  assert.equal(validateClientMessage(JSON.stringify({ type: "chat:send", payload: { channel: "near", text: "hoi" } })).ok, true);
  assert.equal(validateClientMessage(JSON.stringify({ type: "chat:send", payload: { text: 5 } })).ok, false);
  assert.equal(validateClientMessage(JSON.stringify({ type: "chat:send", payload: { text: "x".repeat(2001) } })).ok, false);
  assert.equal(validateClientMessage(JSON.stringify({ type: "chat:block", payload: { playerId: "p1", on: true } })).ok, true);
  assert.equal(validateClientMessage(JSON.stringify({ type: "chat:block", payload: {} })).ok, false);
});
