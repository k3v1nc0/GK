// F2-E1-T02: migratie 011 geeft elk profiel precies een character; lease fencet een oude sessie.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { CharacterService, characterIdForProfile } from "../src/server/character-service.js";

const migration = fs.readFileSync(new URL("../db/migrations/011_player_characters.sql", import.meta.url), "utf8");

function legacyDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE player_profiles (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      selected_character_id TEXT, current_world_id TEXT NOT NULL, current_zone_id TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE player_positions (player_id TEXT NOT NULL, world_id TEXT NOT NULL, x REAL, PRIMARY KEY (player_id, world_id));
  `);
  const insert = db.prepare("INSERT INTO player_profiles VALUES (?, ?, ?, ?, 'w', 'z', '2026-01-01', '2026-01-01')");
  insert.run("player_a", "user_a", "A", "node_player_character_1");
  insert.run("player_b", "user_b", "B", null);
  insert.run("player_c", "user_c", "C", "node_player_character_1");
  db.prepare("INSERT INTO player_positions VALUES ('player_a', 'w', 1), ('player_b', 'w', 2)").run();
  return db;
}

test("backfill: per profiel exact een character met legacy-mapping", function () {
  const db = legacyDb();
  db.exec(migration);
  const profiles = db.prepare("SELECT COUNT(*) n FROM player_profiles").get().n;
  const characters = db.prepare("SELECT * FROM player_characters ORDER BY profile_id").all();
  assert.equal(characters.length, profiles);
  for (const row of characters) {
    assert.equal(row.id, characterIdForProfile(row.profile_id));
    assert.equal(row.legacy_profile_id, row.profile_id);
  }
  assert.equal(characters[0].character_definition_id, "node_player_character_1");
  assert.equal(characters[1].character_definition_id, null);
  const orphanPositions = db.prepare("SELECT COUNT(*) n FROM player_positions p LEFT JOIN player_characters c ON c.profile_id = p.player_id WHERE c.id IS NULL").get().n;
  assert.equal(orphanPositions, 0, "elke player_*-rij heeft een character");
  const selected = db.prepare("SELECT selected_character_id FROM player_profiles WHERE id = 'player_a'").get().selected_character_id;
  assert.equal(selected, "node_player_character_1", "selected_character_id ongewijzigd");
});

test("migratie is idempotent op een kopie", function () {
  const db = legacyDb();
  db.exec(migration);
  db.exec(migration);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM player_characters").get().n, 3);
});

test("nieuw profiel na de migratie krijgt zijn character via de service", function () {
  const db = legacyDb();
  db.exec(migration);
  db.prepare("INSERT INTO player_profiles VALUES ('player_d', 'user_d', 'D', null, 'w', 'z', 'x', 'x')").run();
  const service = new CharacterService(db);
  const row = service.ensureCharacter({ id: "player_d" });
  assert.equal(row.id, "char_player_d");
  assert.equal(service.ensureCharacter({ id: "player_d" }).id, "char_player_d");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM player_characters").get().n, 4);
});

test("tweede login fencet de oude lease; reconnect van dezelfde sessie niet", function () {
  const db = legacyDb();
  db.exec(migration);
  const service = new CharacterService(db);
  const first = service.acquireLease("player_a", "session_1");
  const again = service.acquireLease("player_a", "session_1");
  assert.equal(again.epoch, first.epoch);
  assert.equal(service.isLeaseCurrent("player_a", first.epoch), true);
  const second = service.acquireLease("player_a", "session_2");
  assert.equal(second.takeover, true);
  assert.equal(second.previousSessionId, "session_1");
  assert.equal(second.epoch, first.epoch + 1);
  assert.equal(service.isLeaseCurrent("player_a", first.epoch), false);
  assert.throws(() => service.assertLeaseCurrent("player_a", first.epoch), { code: "CHARACTER_LEASE_FENCED" });
});
