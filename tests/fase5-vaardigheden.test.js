// Fase 5 (vaardigheden en gevecht): klasse-vaardigheden, vak 2/3, vergrendeling, wachttijd, schild van een sterkere
// vijand, zichtlijn en de migratie van de oude genees-spreuk.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Node03RuntimeService } from "../src/server/node03-runtime-service.js";
import { ActorRuntime } from "../src/server/runtime/actor-runtime.js";
import { classSkillIdsFromSection, compileActorSection } from "../src/server/authoring/actor-compiler.js";
import { sanitizeCombatIntent } from "../src/server/runtime/combat-adapter.js";
import { lineOfSightBlocked } from "../src/server/runtime/line-of-sight.js";

function migratedDb() {
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort()) db.exec(fs.readFileSync("db/migrations/" + file, "utf8"));
  return db;
}

const doc = (kind, docKey, body) => ({ kind, docKey, body, archived: false });
const ability = (id, extra = {}) => doc("ability", "ability:" + id, Object.assign({ abilityId: id, displayName: id, baseDamage: 5, powerScalingBp: 10000, armorFactorBp: 10000, rangeMm: 2000, cooldownMs: 1500 }, extra));

test("compiler: klasse-vaardigheden, vergrendeling en welke quest hem geeft", () => {
  const section = compileActorSection([
    ability("klap"),
    ability("vuur", { displayName: "Vuurbal", unlockLevel: 3, animStyle: "shot", icon: "fire-ray" }),
    ability("geheim", { displayName: "Geheim", unlockQuest: true }),
    doc("player_class", "player_class:magier", { classId: "magier", displayName: "Magier", abilityRef: "ability:klap", skills: [{ ref: "ability:vuur" }, { ref: "ability:geheim" }] }),
    doc("quest", "quest:oud", { questId: "oud", displayName: "Het oude boek", rewards: [{ ref: "ability:geheim", amount: 1 }] })
  ]);
  assert.deepEqual(section.server.classSkills.magier, ["vuur", "geheim"]);
  assert.equal(section.server.classAbilityIds.magier, "klap", "vak 1 = auto-aanval");
  assert.equal(section.client.abilities.vuur.animStyle, "shot");
  assert.equal(section.server.abilities.vuur.unlockLevel, 3);
  assert.deepEqual(section.server.abilities.geheim.fromQuests, ["Het oude boek"], "de server kan zeggen welke quest");
  assert.deepEqual(section.client.abilities.geheim.fromQuests, ["Het oude boek"]);
  // Oude build: alleen een losse genees-spreuk per klasse; die telt als eerste vaardigheid.
  assert.deepEqual(classSkillIdsFromSection({ classHealAbilityIds: { healer: "heal" }, abilities: { heal: {} } }, "healer"), ["heal"]);
});

test("migratie 028: oude genees-spreuk van een klasse wordt de eerste vaardigheid", () => {
  const db = new DatabaseSync(":memory:");
  const files = fs.readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort();
  for (const file of files.filter((name) => name < "028")) db.exec(fs.readFileSync("db/migrations/" + file, "utf8"));
  const columns = db.prepare("PRAGMA table_info(authoring_documents)").all();
  const values = {};
  for (const column of columns) {
    if (!column.notnull || column.dflt_value !== null || column.pk) continue;
    values[column.name] = column.type.toUpperCase().includes("INT") ? 1 : "x";
  }
  const insert = (docKey, body) => {
    const row = Object.assign({}, values, { kind: "player_class", body_json: JSON.stringify(body) });
    if ("doc_key" in values || columns.some((column) => column.name === "doc_key")) row.doc_key = docKey;
    if (columns.some((column) => column.name === "id")) row.id = docKey;
    const keys = Object.keys(row);
    db.prepare("INSERT INTO authoring_documents (" + keys.join(", ") + ") VALUES (" + keys.map(() => "?").join(", ") + ")").run(...keys.map((key) => row[key]));
  };
  insert("player_class:healer", { classId: "healer", healAbilityRef: "ability:heal" });
  insert("player_class:tank", { classId: "tank", abilityRef: "ability:klap" });
  db.exec(fs.readFileSync("db/migrations/028_klasse_vaardigheden.sql", "utf8"));
  const bodies = db.prepare("SELECT body_json FROM authoring_documents WHERE kind = 'player_class' ORDER BY body_json").all().map((row) => JSON.parse(row.body_json));
  const healer = bodies.find((body) => body.classId === "healer");
  const tank = bodies.find((body) => body.classId === "tank");
  assert.deepEqual(healer.skills, [{ ref: "ability:heal" }]);
  assert.equal(healer.healAbilityRef, undefined);
  assert.equal(tank.skills, undefined, "zonder genees-spreuk verandert er niets");
});

function setupSkills({ level = 1, role = "player" } = {}) {
  const db = migratedDb();
  const stamp = new Date().toISOString();
  db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES ('u1', 'anna', 'x', 'x', ?, ?, ?)").run(role, stamp, stamp);
  db.prepare("INSERT INTO player_profiles (id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at) VALUES ('p1', 'u1', 'anna', 'magier', 'world.main', ?, ?)").run(stamp, stamp);
  db.prepare("INSERT INTO player_progression (player_id, level, xp, updated_at) VALUES ('p1', ?, 0, ?)").run(level, stamp);
  const section = {
    classAbilityIds: { magier: "klap" },
    classSkills: { magier: ["vuur", "ijs", "geheim"] },
    abilities: {
      klap: { displayName: "Klap", rangeMm: 2000, cooldownMs: 1500 },
      vuur: { displayName: "Vuurbal", rangeMm: 10000, cooldownMs: 4000, unlockLevel: 1 },
      ijs: { displayName: "IJs", rangeMm: 10000, cooldownMs: 4000, unlockLevel: 3 },
      geheim: { displayName: "Geheim", rangeMm: 10000, cooldownMs: 4000, unlockQuest: true, fromQuests: ["Het oude boek"] }
    }
  };
  const attacks = [];
  const svc = Object.create(Node03RuntimeService.prototype);
  svc.db = db;
  svc.mmoService = { actorRuntime: { ensureBuild: () => section, nearestEnemy: () => "actor:wolf:1" } };
  // De echte aanval is elders getest; hier alleen: welke vaardigheid op welk doel.
  svc.attackActor = (ctx, targetId, operationId, skill) => { attacks.push({ targetId, abilityId: skill?.abilityId }); return { action: "skill", targetId, performed: true, message: "raak" }; };
  const ctx = { profile: { id: "p1", selected_character_id: "magier" }, worldId: "world.main", position: { x: 0, z: 0 }, sessionContext: { user: { role } } };
  return { db, svc, ctx, attacks };
}

test("vak 2 krijgt vanzelf de eerste vrije vaardigheid; vergrendeld (level/quest) staat in het boek met reden", () => {
  const { svc, ctx } = setupSkills();
  const hud = svc.skillsForHud(ctx);
  assert.equal(hud.slots[2], "vuur");
  assert.equal(hud.slots[3], null);
  assert.equal(hud.auto.displayName, "Klap");
  const byId = Object.fromEntries(hud.list.map((entry) => [entry.abilityId, entry]));
  assert.equal(byId.vuur.unlocked, true);
  assert.equal(byId.ijs.lockText, "vanaf level 3");
  assert.equal(byId.geheim.lockText, "na quest “Het oude boek”");
});

test("indelen: alleen eigen klasse en vrij; wisselen tussen vak 2 en 3; leeg blijft leeg", () => {
  const { svc, ctx, db } = setupSkills({ level: 3 });
  assert.throws(() => svc.setLoadoutSlot(ctx, { slot: 3, abilityId: "geheim" }), (error) => error.code === "SKILL_LOCKED" && /Het oude boek/.test(error.message));
  assert.throws(() => svc.setLoadoutSlot(ctx, { slot: 3, abilityId: "andermans" }), (error) => error.code === "SKILL_NOT_IN_CLASS");
  assert.throws(() => svc.setLoadoutSlot(ctx, { slot: 4, abilityId: "vuur" }), (error) => error.code === "SLOT_INVALID");
  svc.setLoadoutSlot(ctx, { slot: 3, abilityId: "ijs" });
  assert.deepEqual(svc.skillsForHud(ctx).slots, { 2: "vuur", 3: "ijs" });
  svc.setLoadoutSlot(ctx, { slot: 2, abilityId: "ijs" });
  assert.deepEqual(svc.skillsForHud(ctx).slots, { 2: "ijs", 3: "vuur" }, "wisselen");
  svc.setLoadoutSlot(ctx, { slot: 2, abilityId: null });
  assert.equal(svc.skillsForHud(ctx).slots[2], null, "bewust leeg: niet vanzelf weer gevuld");
  // Na de quest: geleerd en dan wel in te delen.
  db.prepare("INSERT INTO player_abilities (player_id, ability_id, rank, unlock_source, unlocked_at, revision) VALUES ('p1', 'geheim', 1, 'quest:oud', 'x', 1)").run();
  svc.setLoadoutSlot(ctx, { slot: 2, abilityId: "geheim" });
  assert.equal(svc.skillsForHud(ctx).slots[2], "geheim");
});

test("vaardigheid gebruiken: leeg vak, wachttijd per vaardigheid, doel kiest de server als je niets koos", () => {
  const { svc, ctx, attacks } = setupSkills();
  assert.throws(() => svc.useSkill(ctx, { slot: 3 }, "op0"), (error) => error.code === "SLOT_EMPTY");
  const first = svc.useSkill(ctx, { slot: 2 }, "op1");
  assert.equal(first.performed, true);
  assert.deepEqual(attacks[0], { targetId: "actor:wolf:1", abilityId: "vuur" });
  const again = svc.useSkill(ctx, { slot: 2, targetId: "actor:wolf:1" }, "op2");
  assert.equal(again.message, "Nog even wachten.");
  assert.ok(again.cooldownMs > 0 && again.cooldownMs <= 4000);
  assert.equal(attacks.length, 1, "te vroeg = geen tweede klap");
  assert.ok(svc.skillsForHud(ctx).list.find((entry) => entry.abilityId === "vuur").readyInMs > 0, "het boek weet de wachttijd (na herladen)");
});

test("maker-knoppen alleen voor een admin", () => {
  const { svc, ctx } = setupSkills();
  assert.throws(() => svc.makerSetLevel(ctx, { level: 5 }, "op1"), (error) => error.status === 403 && error.code === "MAKER_ONLY");
  assert.throws(() => svc.makerGiveXp(ctx, { xp: 100 }, "op2"), (error) => error.code === "MAKER_ONLY");
});

test("combat-adapter: vak 2/3 verplicht, doel mag leeg, niets voorschrijven", () => {
  assert.deepEqual(sanitizeCombatIntent("skill", { slot: 2 }), { action: "skill", slot: 2, targetId: null });
  assert.throws(() => sanitizeCombatIntent("skill", { slot: 1 }), (error) => error.code === "SLOT_INVALID");
  assert.throws(() => sanitizeCombatIntent("skill", { slot: 2, damage: 999 }), (error) => error.code === "CLIENT_AUTHORITY_FIELD");
});

test("zichtlijn: huis ertussen blokkeert, ernaast of erin staan niet, rand van een loopvlak wel", () => {
  const world = { solidColliders: [{ x: 5, z: 0, radius: 1 }], walkabilityIndex: { walls: [{ minX: 9, maxX: 9, minZ: -5, maxZ: 5, ax: 9, az: -5, bx: 9, bz: 5, ay: 0, by: 0 }] } };
  assert.equal(lineOfSightBlocked(world, 0, 0, 8, 0), true, "huis op de lijn");
  assert.equal(lineOfSightBlocked(world, 0, 3, 8, 3), false, "lijn langs het huis");
  assert.equal(lineOfSightBlocked(world, 5, 0.5, 8, 0), false, "aanvaller staat tegen/in de botsrand");
  assert.equal(lineOfSightBlocked(world, 7, 0, 12, 0, 0), true, "rand van een loopvlak");
  assert.equal(lineOfSightBlocked(world, 7, 0, 12, 0, 10), false, "rand ver onder je telt niet");
  assert.equal(lineOfSightBlocked(null, 0, 0, 8, 0), false, "geen wereld = vrij");
});

function shieldRuntime() {
  const runtime = new ActorRuntime({ db: null, canonicalBuild: () => null, worldContext: () => null, spatial: () => null, playerStates: () => [], isOnline: () => false,
    isDefeated: () => false, connections: () => [], send: () => {} });
  runtime.emitEvent = () => {};
  runtime.section = { abilities: {}, lootTables: {} };
  runtime.combatSettings = { shieldAutoPct: 25, shieldBackS: 15 };
  const def = { actorId: "wolf", displayName: "Wolf", healthMax: 100, armor: 0, radiusMm: 500, respawnMs: 30000, xpReward: 10 };
  const actor = { kind: "actor", id: "actor:wolf:1", spawnKey: "actor:wolf", occurrence: 1, def, spawn: { eliteChancePct: 100, eliteStrengthPct: 200 },
    state: "engage", hp: 0, hpMax: 0, x: 1, z: 0, ry: 0, rev: 1, path: [], contributors: new Set(), anim: "idle" };
  runtime.rollElite(actor);
  actor.hp = actor.hpMax;
  runtime.actors.set(actor.spawnKey, actor);
  return { runtime, actor };
}

test("sterkere vijand: dubbele levens en een schild; vak 1 doet een kwart, een vaardigheid breekt het schild even", () => {
  const { runtime, actor } = shieldRuntime();
  assert.equal(actor.elite, true);
  assert.equal(actor.hpMax, 200);
  assert.equal(runtime.labelOf(actor), "Sterke Wolf");
  const base = { playerId: "p1", classId: null, targetId: actor.id, x: 0, z: 0, attackPower: 0, safe: false };
  const auto = runtime.planPlayerAttack(Object.assign({}, base, { nowMs: 1000, operationId: "a1" })).plan;
  const skill = { abilityId: "breker", baseDamage: 40, powerScalingBp: 0, armorFactorBp: 0, rangeMm: 2000, cooldownMs: 4000 };
  const hit = runtime.planPlayerAttack(Object.assign({}, base, { nowMs: 1000, operationId: "s1", ability: skill })).plan;
  assert.equal(auto.shieldUp, true);
  assert.equal(auto.shieldBreak, false);
  assert.equal(hit.shieldBreak, true);
  assert.equal(hit.damage, 40, "een vaardigheid doet volle schade");
  assert.ok(auto.damage >= 1 && auto.damage < hit.damage, "vak 1 tegen een schild doet maar een deel");
  runtime.dropPending("a1");
  runtime.applyPending("s1", 1000);
  assert.equal(runtime.shieldUp(actor, 2000), false, "schild is even weg");
  assert.equal(runtime.shieldUp(actor, 1000 + 15000), true, "na 15 s terug");
});

test("sterkere vijand na respawn opnieuw gegooid; quest-vijand nooit sterker", () => {
  const { runtime, actor } = shieldRuntime();
  actor.spawn.eliteChancePct = 0;
  runtime.rollElite(actor);
  assert.equal(actor.elite, false);
  assert.equal(actor.hpMax, 100);
  actor.spawn.eliteChancePct = 100;
  actor.group = { id: "g1" };
  runtime.rollElite(actor);
  assert.equal(actor.elite, false, "quest-vijand blijft gewoon");
});
