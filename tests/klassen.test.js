// Klassen: geen kaart Speler meer; elke klasse heeft eigen levens, kracht, pantser, heal-kracht, aanval,
// start-spullen en uiterlijk. Elk account heeft per klasse een eigen character (migratie 017).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { compileCanonical } from "../src/server/authoring/build-service.js";
import { compileActorSection, playerAbilityFromSection } from "../src/server/authoring/actor-compiler.js";
import { buildRuntimeWorld, PLAYER_CHARACTER_ID } from "../src/server/authoring/world-builder.js";
import { characterModelFor } from "../src/server/mmo-service.js";
import { UserAdminService } from "../src/server/user-admin-service.js";

const doc = (kind, key, body) => {
  const check = validateDocument(kind, body);
  assert.equal(check.ok, true, kind + " " + key + ": " + JSON.stringify(check.issues || check));
  return { docKey: key, kind, body, archived: false, revision: 1 };
};

function world(docs) {
  const compiled = compileCanonical(docs, {});
  assert.deepEqual(compiled.errors, []);
  return buildRuntimeWorld(JSON.parse(compiled.files["server.json"].text));
}

const base = () => [
  doc("project_settings", "project_settings", { gameName: "GK", xpPerLevel: 300, maxLevel: 30 }),
  doc("item_definition", "item_definition:item.zwaard", { itemId: "item.zwaard", displayName: "Zwaard", category: "equipment", rarity: "common", stackable: false, stackLimit: 1, equipSlot: "equipment_slot.main_hand" }),
  doc("currency", "currency:currency.goud", { currencyId: "currency.goud", displayName: "Goud" })
];
const klasse = (id, name, values) => doc("player_class", "player_class:" + id, Object.assign({ classId: id, displayName: name }, values));
const drie = () => [
  klasse("class.dps", "DPS", { healthMax: 80, attackPower: 10, armor: 0, healPower: 5, startItems: [{ ref: "item_definition:item.zwaard", amount: 1 }], models: ["asset.wizard_1", "asset.wizard_2"] }),
  klasse("class.healer", "Healer", { healthMax: 60, attackPower: 5, armor: 0, healPower: 10, models: ["asset.elf_1"] }),
  klasse("class.tank", "Tank", { healthMax: 100, attackPower: 5, armor: 10, healPower: 5, startItems: [{ ref: "currency:currency.goud", amount: 30 }] })
];

test("zonder klassen: één standaardspeler; levelregels komen van de kaart Project", () => {
  const project = world(base()).gameProject;
  assert.deepEqual(Object.keys(project.catalogs.playableCharacters), [PLAYER_CHARACTER_ID]);
  assert.equal(project.playerRules.byType.player_progression_rules[0].maxLevel, 30);
  assert.equal(project.catalogs.statCurves[project.playerRules.byType.player_progression_rules[0].xpCurveRef].points[1].y, 300);
});

test("DPS, Healer en Tank: eigen levens, kracht, pantser, heal-kracht, start-spullen en uiterlijk", () => {
  const built = world(base().concat(drie()));
  const catalogs = built.gameProject.catalogs;
  const characters = catalogs.playableCharacters;
  assert.deepEqual(Object.keys(characters), ["class.dps", "class.healer", "class.tank"], "op naam");
  const stats = (id) => catalogs.statBlocks[characters[id].statBlockRef].entries.map((entry) => entry.baseValue);
  assert.deepEqual(stats("class.dps"), [80, 10, 0, 5, 50]);
  assert.deepEqual(stats("class.healer"), [60, 5, 0, 10, 50]);
  assert.deepEqual(stats("class.tank"), [100, 5, 10, 5, 50]);
  assert.equal(catalogs.stats["stat.heal_power"].displayName, "Heal-kracht");
  assert.deepEqual(characters["class.dps"].startingItemGrants, [{ itemRef: "item.zwaard", amount: 1 }]);
  assert.deepEqual(characters["class.tank"].startingCurrencyGrants, [{ currencyRef: "currency.goud", amountMinor: 30 }]);
  assert.deepEqual(characters["class.dps"].modelAssetIds, ["asset.wizard_1", "asset.wizard_2"]);
  // Uiterlijk: alleen een model uit de lijst van de klasse; anders het eerste.
  assert.equal(characterModelFor(built, { selected_character_id: "class.dps", model_asset_id: "asset.wizard_2" }), "asset.wizard_2");
  assert.equal(characterModelFor(built, { selected_character_id: "class.dps", model_asset_id: "asset.elf_1" }), "asset.wizard_1");
  assert.equal(characterModelFor(built, { selected_character_id: "class.tank", model_asset_id: null }), null, "Tank zonder modellen: standaard-spelermodel");
});

test("aanval per klasse; zonder klasse-aanval de ingebouwde standaardklap", () => {
  const ability = (id, damage) => doc("ability", "ability:" + id, { abilityId: id, displayName: id, baseDamage: damage, powerScalingBp: 5000, armorFactorBp: 3500, rangeMm: 2800, cooldownMs: 250 });
  const docs = [
    doc("project_settings", "project_settings", { gameName: "GK" }),
    ability("hit.dps", 30),
    klasse("class.dps", "DPS", { abilityRef: "ability:hit.dps" }), klasse("class.tank", "Tank", {})
  ];
  const section = compileActorSection(docs);
  assert.deepEqual(section.errors, []);
  assert.equal(playerAbilityFromSection(section.server, "class.dps").baseDamage, 30);
  assert.equal(playerAbilityFromSection(section.server, "class.tank").baseDamage, playerAbilityFromSection(section.server, null).baseDamage, "Tank zonder aanval: standaardklap");
  assert.equal(section.client.classAbilityIds["class.dps"], "hit.dps");
});

test("een klasse met een verdwenen start-item houdt publiceren tegen", () => {
  const docs = base().concat([klasse("class.x", "X", { startItems: [{ ref: "item_definition:item.weg", amount: 1 }] })]);
  assert.ok(compileCanonical(docs, {}).errors.some((error) => error.code === "REF_UNRESOLVED"));
});

test("migratie 017: meerdere characters per account; reset wist ze allemaal", () => {
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort()) db.exec(fs.readFileSync("db/migrations/" + file, "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  const stamp = new Date().toISOString();
  db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES ('u1', 'anna', 'x', 'x', 'player', ?, ?)").run(stamp, stamp);
  for (const [id, cls, level] of [["p_dps", "class.dps", 4], ["p_tank", "class.tank", 2]]) {
    db.prepare("INSERT INTO player_profiles (id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at) VALUES (?, 'u1', 'anna', ?, 'world.main', ?, ?)").run(id, cls, stamp, stamp);
    db.prepare("INSERT INTO player_progression (player_id, level, xp, skill_points, revision, updated_at) VALUES (?, ?, 0, 0, 1, ?)").run(id, level, stamp);
  }
  db.prepare("UPDATE users SET active_profile_id = 'p_tank' WHERE id = 'u1'").run();
  const admin = new UserAdminService(db, {});
  const anna = admin.list().find((user) => user.username === "anna");
  assert.equal(anna.level, 2, "level van het character waarmee je speelt");
  assert.equal(anna.characters, 2);
  admin.resetProgress("u1");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM player_progression").get().n, 0, "beide characters beginnen opnieuw");
});
