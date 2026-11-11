// Fase 6 (groei, schaling en samen vechten): XP-grafiek, groei per level, level = sterkte bij vijanden, uitrusting vanaf een
// level, schaling zoals ESO (schade en genezing omrekenen), en de groepsbaas met zijn rode cirkel.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Node03RuntimeService } from "../src/server/node03-runtime-service.js";
import { ActorRuntime } from "../src/server/runtime/actor-runtime.js";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { runtimeItemFromCanonical } from "../src/server/authoring/runtime-overlay.js";
import { cleanXpCurve, equipBonusAt, levelEdgePct, statAtLevel, toRealPool, xpCostAt, xpTotals } from "../apps/web/public/shared/level-math.js";

function migratedDb() {
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort()) db.exec(fs.readFileSync("db/migrations/" + file, "utf8"));
  return db;
}

test("XP-grafiek: rechte lijn tussen de punten, totaal per level, en zonder punten overal hetzelfde", () => {
  const clean = cleanXpCurve([[10, 600], [1, 100], [10, 500]], 50);
  assert.deepEqual(clean, [[1, 100], [10, 500]], "oplopend, één punt per level (het laatste wint)");
  assert.equal(xpCostAt(clean, 1), 100);
  assert.equal(xpCostAt(clean, 10), 500);
  assert.equal(xpCostAt(clean, 30), 500, "na het laatste punt blijft de lijn vlak");
  assert.ok(xpCostAt(clean, 5) > 250 && xpCostAt(clean, 5) < 300, "ertussen recht");
  const totals = xpTotals([[1, 100], [3, 300]], 4, 100);
  assert.deepEqual(totals.slice(1), [0, 100, 300, 600, 900], "level 2 na 100, level 3 na 300, level 4 na 600");
  assert.deepEqual(xpTotals(null, 3, 100).slice(1), [0, 100, 200, 300], "geen punten = XP per level");
  const bad = validateDocument("project_settings", { gameName: "GK", xpCurve: [[1, 100], [1, 200]] });
  assert.ok(bad.issues.some((entry) => entry.code === "XP_CURVE_DOUBLE"));
  assert.equal(validateDocument("project_settings", { gameName: "GK", xpCurve: [[1, 100], [20, 900]] }).ok, true);
});

test("level-wiskunde: groei, schuifje Verschil per level (met maximum), uitrusting naar verhouding, omrekenen naar de echte balk", () => {
  assert.equal(statAtLevel(100, 10, 1), 100);
  assert.equal(statAtLevel(100, 10, 5), 140);
  assert.equal(levelEdgePct(4, 1, 3, 20), 9);
  assert.equal(levelEdgePct(15, 1, 3, 20), 20, "hooguit het maximum");
  assert.equal(levelEdgePct(1, 5, 3, 20), -12, "lager level = evenveel nadeel");
  assert.equal(levelEdgePct(15, 1, 0, 20), 0, "schuifje op 0 = iedereen even hard");
  assert.equal(equipBonusAt(30, 10, 5), 15, "zwaard vanaf level 10 telt tegen een level-5 vijand voor de helft");
  assert.equal(equipBonusAt(30, 10, 12), 30);
  assert.equal(toRealPool(10, 240, 100), 24, "zelfde deel van de balk");
  assert.equal(toRealPool(10, 100, 100), 10);
  assert.equal(runtimeItemFromCanonical({ itemId: "zwaard", displayName: "Zwaard", equipSlot: "slot.hand", requiredLevel: 10 }).requiredLevel, 10);
  assert.equal(runtimeItemFromCanonical({ itemId: "stok", displayName: "Stok", requiredLevel: 1 }).requiredLevel, undefined);
});

// Een service met twee characters (p1 = DPS, p2 = Healer), klassen met groei per level en een XP-tabel van 100 per level.
function setupWorld({ scaling = true, diffPct = 3, maxPct = 20 } = {}) {
  const db = migratedDb();
  const stamp = new Date().toISOString();
  const block = (id, health, attack, armor, heal) => ({ id, entries: [
    { statRef: "stat.health", baseValue: health, perLevel: 10 }, { statRef: "stat.attack_power", baseValue: attack, perLevel: 2 },
    { statRef: "stat.armor", baseValue: armor, perLevel: 0 }, { statRef: "stat.heal_power", baseValue: heal, perLevel: 1 }, { statRef: "stat.mana", baseValue: 50, perLevel: 5 }] });
  const catalogs = {
    statBlocks: { "block.dps": block("block.dps", 100, 10, 0, 5), "block.healer": block("block.healer", 80, 5, 0, 10) },
    statCurves: { "curve.xp": { id: "curve.xp", points: xpTotals(null, 20, 100).map((total, level) => ({ x: level, y: total })).slice(1) } },
    playableCharacters: { dps: { id: "dps", statBlockRef: "block.dps" }, healer: { id: "healer", statBlockRef: "block.healer" } },
    items: { zwaard: { id: "zwaard", displayName: "Zwaard", equipmentSlotRef: "slot.hand", attackPowerBonus: 30, requiredLevel: 10 } },
    equipmentSlots: { "slot.hand": { id: "slot.hand" } }
  };
  const project = { catalogs, playerRules: { byType: {
    player_progression_rules: [{ maxLevel: 20, xpCurveRef: "curve.xp", baseStatBlockRef: "block.dps" }],
    combat_rules: [{ levelScaling: scaling, levelDiffPct: diffPct, levelDiffMaxPct: maxPct, levelUpRestore: true }] } } };
  db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES ('u1', 'anna', 'x', 'x', 'admin', ?, ?)").run(stamp, stamp);
  db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES ('u2', 'bo', 'x', 'x', 'player', ?, ?)").run(stamp, stamp);
  db.prepare("INSERT INTO player_profiles (id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at) VALUES ('p1', 'u1', 'anna', 'dps', 'world.main', ?, ?)").run(stamp, stamp);
  db.prepare("INSERT INTO player_profiles (id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at) VALUES ('p2', 'u2', 'bo', 'healer', 'world.main', ?, ?)").run(stamp, stamp);
  const fx = [];
  const svc = Object.create(Node03RuntimeService.prototype);
  svc.db = db;
  svc.mmoService = { getPublishedWorldContext: () => ({ world: { gameProject: project } }), broadcastToWorld: (worldId, payload) => fx.push(payload) };
  const ctxOf = (id, classId, role = "player") => ({ profile: { id, selected_character_id: classId }, worldId: "world.main", catalogs, project, position: { x: 0, z: 0 }, sessionContext: { user: { role } } });
  const p1 = ctxOf("p1", "dps", "admin");
  const p2 = ctxOf("p2", "healer");
  for (const ctx of [p1, p2]) { svc.ensureProgression(ctx); svc.ensureStats(ctx, catalogs.playableCharacters[ctx.profile.selected_character_id]); }
  const setLevel = (ctx, level) => {
    db.prepare("UPDATE player_progression SET level = ?, xp = ? WHERE player_id = ?").run(level, (level - 1) * 100, ctx.profile.id);
    svc.ensureProgression(ctx);
    svc.ensureStats(ctx, catalogs.playableCharacters[ctx.profile.selected_character_id]);
  };
  const stat = (id, statId) => db.prepare("SELECT base_value, earned_value, current_value FROM player_stats WHERE player_id = ? AND stat_id = ?").get(id, statId);
  return { db, svc, p1, p2, catalogs, project, fx, setLevel, stat };
}

test("level telt: stats groeien per level, level omhoog = vol en zichtbaar, en het level volgt de XP als de grafiek verandert", () => {
  const { db, svc, p1, fx, stat, catalogs } = setupWorld();
  assert.deepEqual({ ...stat("p1", "stat.health") }, { base_value: 100, earned_value: 0, current_value: 100 });
  db.prepare("UPDATE player_stats SET current_value = 40 WHERE player_id = 'p1' AND stat_id = 'stat.health'").run();
  const grant = svc.grantXpAmount(p1, 250, "test", "bron", "op1");
  assert.equal(grant.afterLevel, 3);
  assert.deepEqual({ ...stat("p1", "stat.health") }, { base_value: 100, earned_value: 20, current_value: 120 }, "level 3: +20 levens en weer vol");
  assert.deepEqual({ ...stat("p1", "stat.attack_power") }, { base_value: 10, earned_value: 4, current_value: 14 }, "kracht staat altijd op zijn maximum");
  assert.deepEqual(fx.filter((entry) => entry.tone === "levelup").map((entry) => [entry.target, entry.level]), [["p1", 3]], "iedereen in de buurt ziet het");
  const progression = svc.loadProgression(p1);
  assert.equal(progression.perLevel.health, 10);
  assert.equal(progression.maxLevel, 20);
  // De maker zet zijn level terug: de stats gaan mee omlaag (en nooit boven het nieuwe maximum).
  svc.makerSetLevel(p1, { level: 1 }, "op2");
  assert.deepEqual({ ...stat("p1", "stat.health") }, { base_value: 100, earned_value: 0, current_value: 100 });
  // De grafiek wordt duurder (200 per level): characters houden hun XP, het level past zich aan.
  db.prepare("UPDATE player_progression SET level = 5, xp = 400 WHERE player_id = 'p1'").run();
  catalogs.statCurves["curve.xp"] = { id: "curve.xp", points: xpTotals(null, 20, 200).map((total, level) => ({ x: level, y: total })).slice(1) };
  svc.ensureProgression(p1);
  const row = db.prepare("SELECT level, xp FROM player_progression WHERE player_id = 'p1'").get();
  assert.deepEqual({ ...row }, { level: 3, xp: 400 });
});

test("uitrusting vanaf een level: onder het level kun je het niet aandoen", () => {
  const { db, svc, p1, setLevel } = setupWorld();
  const stamp = new Date().toISOString();
  const columns = db.prepare("PRAGMA table_info(player_item_instances)").all();
  const row = { id: "i1", player_id: "p1", item_id: "zwaard", location_type: "inventory" };
  for (const column of columns) {
    if (column.name in row || !column.notnull || column.dflt_value !== null) continue;
    row[column.name] = column.type.toUpperCase().includes("INT") ? 1 : column.name.endsWith("_at") ? stamp : "x";
  }
  const keys = Object.keys(row);
  db.prepare("INSERT INTO player_item_instances (" + keys.join(", ") + ") VALUES (" + keys.map(() => "?").join(", ") + ")").run(...keys.map((key) => row[key]));
  svc.recordGameplayEvent = () => {};
  assert.throws(() => svc.equipItem(p1, { itemInstanceId: "i1" }, "op1"), (error) => error.code === "LEVEL_TOO_LOW" && /vanaf level 10/.test(error.message));
  setLevel(p1, 10);
  assert.equal(svc.equipItem(p1, { itemInstanceId: "i1" }, "op2").action, "equip");
  // Schaling: tegen een level-5 vijand telt het zwaard (vanaf level 10) voor de helft.
  assert.equal(svc.equipmentBonusesForPlayer("p1", p1.catalogs, 5).attackPower, 15);
  assert.equal(svc.equipmentBonusesForPlayer("p1", p1.catalogs, null).attackPower, 30);
});

test("schaling zoals ESO: je telt als het level van de vijand; het schuifje geeft een hoger level een beetje voordeel", () => {
  const { svc, p1, setLevel } = setupWorld();
  setLevel(p1, 15);
  const stats = svc.loadPlayerStats("p1");
  const low = svc.fightProfile(p1, "p1", stats, 1, Date.now());
  assert.equal(low.attackPower, 10, "tegen een level-1 vijand: kracht van level 1");
  assert.equal(low.edgePct, 20, "14 levels verschil x 3 % = hooguit 20 %");
  assert.equal(low.healthMax, 100);
  assert.equal(low.realHealthMax, 240);
  const same = svc.fightProfile(p1, "p1", stats, 15, Date.now());
  assert.equal(same.attackPower, 38);
  assert.equal(same.edgePct, 0);
  // Een klap van een level-1 vijand: 10 schade op level 1, min 20 % voordeel = 8, en dan hetzelfde deel van de echte balk (240).
  svc.recordGameplayEvent = () => {};
  const ability = { abilityId: "beet", baseDamage: 10, powerScalingBp: 0, armorFactorBp: 0 };
  const hit = svc.applyActorHit({ worldId: "world.main", playerId: "p1", actorId: "actor:wolf:1", label: "Wolf", ability, attackPower: 0, level: 1 });
  assert.equal(hit.damage, 19, "8 van 100 = 19 van 240: de balk zakt even ver");
  assert.equal(hit.remainingHealth, 221);
});

test("schaling uit: je echte level telt (een hoog level slaat een oude vijand om); schuifje op 0 = iedereen even hard", () => {
  const off = setupWorld({ scaling: false });
  off.setLevel(off.p1, 15);
  const real = off.svc.fightProfile(off.p1, "p1", off.svc.loadPlayerStats("p1"), 1, Date.now());
  assert.equal(real.attackPower, 38);
  assert.equal(real.edgePct, 0);
  assert.equal(real.scaled, false);
  const zero = setupWorld({ diffPct: 0 });
  zero.setLevel(zero.p1, 15);
  const flat = zero.svc.fightProfile(zero.p1, "p1", zero.svc.loadPlayerStats("p1"), 1, Date.now());
  assert.equal(flat.attackPower, 10);
  assert.equal(flat.edgePct, 0);
});

test("genezen over levels heen: hetzelfde deel van de balk, en wie een vechtende speler geneest doet zelf mee", () => {
  const { db, svc, p1, p2, setLevel, stat } = setupWorld();
  setLevel(p1, 15); // 240 levens
  db.prepare("UPDATE player_stats SET current_value = 100 WHERE player_id = 'p1' AND stat_id = 'stat.health'").run();
  const credited = [];
  svc.mmoService.actorRuntime = { creditHelper: (helper, target) => credited.push([helper, target]), lineBlocked: () => false };
  svc.mmoService.getWorldPlayerStates = () => [{ player_id: "p1", x: 1, z: 0 }, { player_id: "p2", x: 0, z: 0 }];
  svc.recordGameplayEvent = () => {};
  const spell = { abilityId: "heling", displayName: "Heling", abilityKind: "heal", baseHeal: 20, rangeMm: 10000, cooldownMs: 1000 };
  const result = svc.healTarget(p2, { targetId: "player:p1" }, "op1", spell);
  assert.equal(result.targetId, "p1");
  // De Healer (level 1, heal-kracht 10) geneest 30: bij een level-1 DPS (100 levens) is dat 30 %. Van 240 levens is dat 72.
  assert.equal(stat("p1", "stat.health").current_value, 172);
  assert.deepEqual(credited, [["p2", "p1"]]);
});

function bossRuntime(defExtra = {}) {
  const players = [{ player_id: "p1", x: 1, z: 0 }, { player_id: "p2", x: 3, z: 0 }];
  const runtime = new ActorRuntime({ db: null, canonicalBuild: () => null, worldContext: () => null, spatial: () => null, playerStates: () => players, isOnline: () => true,
    isDefeated: () => false, connections: () => [], send: () => {} });
  const events = [];
  runtime.emitEvent = (event) => events.push(event);
  runtime.section = { abilities: { beuk: { abilityId: "beuk", baseDamage: 5, powerScalingBp: 10000, armorFactorBp: 0, rangeMm: 3000, cooldownMs: 1000 } }, lootTables: {} };
  const def = Object.assign({ actorId: "reus", displayName: "Reus", healthMax: 100, attackPower: 10, armor: 0, radiusMm: 500, respawnMs: 30000, xpReward: 10, abilityId: "beuk",
    behavior: "aggressive", aggroRangeMm: 8000, leashRangeMm: 30000, moveSpeedMmPerS: 0 }, defExtra);
  const actor = { kind: "actor", id: "actor:reus:1", spawnKey: "actor:reus", occurrence: 1, def, spawn: {}, home: { x: 0, z: 0 }, patrol: [],
    state: "idle", hp: 0, hpMax: 0, x: 0, z: 0, ry: 0, rev: 1, path: [], contributors: new Set(), anim: "idle", nextAttackAtMs: 0 };
  runtime.rollElite(actor);
  actor.hp = actor.hpMax;
  runtime.actors.set(actor.spawnKey, actor);
  const hits = [];
  runtime.setCombatBridge({ applyActorHit: (input) => { hits.push(input); return { damage: 7, remainingHealth: 50, defeated: false }; } });
  return { runtime, actor, events, hits, players };
}

test("level = sterkte: level 3 is 300 % levens, kracht en XP; een sterkere van een plek telt er bovenop", () => {
  const { runtime, actor } = bossRuntime({ level: 3 });
  assert.equal(actor.hpMax, 300);
  assert.equal(runtime.levelOf(actor), 3);
  assert.equal(runtime.encode(actor).st, 300, "het cijfer voor de naam: 300 % = 3");
  const seen = [];
  const plan = runtime.planPlayerAttack({ playerId: "p1", classId: null, targetId: actor.id, x: 1, z: 0, safe: false, nowMs: 1000, operationId: "a1",
    fight: (level) => { seen.push(level); return { attackPower: 20, edgePct: 10 }; },
    ability: { abilityId: "klap", baseDamage: 280, powerScalingBp: 10000, armorFactorBp: 0, rangeMm: 3000, cooldownMs: 1000 } }).plan;
  assert.deepEqual(seen, [3], "de speler telt als het level van deze vijand");
  assert.equal(plan.damage, 330, "(280 + 20) + 10 % voordeel");
  assert.equal(plan.killed, true);
  assert.equal(plan.rewards[0].xp, 30, "XP x level");
  actor.elite = true;
  actor.spawn = { eliteStrengthPct: 200 };
  runtime.setStrength(actor);
  assert.equal(runtime.levelOf(actor), 6, "level 3 x 200 %");
  assert.equal(actor.hpMax, 600);
});

test("groepsbaas: extra leven, rode cirkel als waarschuwing, en alleen wie er op het raakmoment in staat krijgt de klap", () => {
  const { runtime, actor, events, hits, players } = bossRuntime({ groupBoss: true, bossHealthPct: 300, slamEveryS: 5, slamWarnS: 2, slamRadiusMm: 2000, slamPowerPct: 300 });
  assert.equal(actor.hpMax, 300, "drie keer zoveel leven, het level blijft 1");
  assert.equal(runtime.levelOf(actor), 1);
  actor.contributors.add("p2");
  let now = 1000;
  runtime.step(now); // ziet p1 (dichtstbij) en valt aan
  assert.equal(actor.state, "engage");
  assert.equal(actor.targetPlayerId, "p1");
  for (now = 1100; now <= 6300 && !actor.slam; now += 100) runtime.step(now);
  assert.ok(actor.slam, "na 5 s komt de waarschuwing");
  const warn = events.find((event) => event.e === "slam");
  assert.deepEqual([warn.x, warn.z, warn.r, warn.ms], [1, 0, 2, 2000], "de cirkel ligt op de plek van zijn doelwit");
  assert.deepEqual(runtime.encode(actor).sl.slice(0, 3), [1, 0, 2], "ook wie nu (opnieuw) verbindt ziet de cirkel");
  // p1 stapt eruit, p2 loopt erin.
  players[0].x = 6;
  players[1].x = 1.5;
  hits.length = 0;
  const landAt = actor.slam.atMs;
  for (; now <= landAt + 200; now += 100) runtime.step(now);
  assert.equal(actor.slam, null);
  assert.ok(events.some((event) => event.e === "slamhit"));
  const slamHits = hits.filter((hit) => hit.attackPower === 30);
  assert.deepEqual(slamHits.map((hit) => hit.playerId), ["p2"], "p1 stapte eruit en krijgt niets; p2 stond erin: 300 % kracht");
  assert.equal(slamHits[0].level, 1, "node03 weet het level van de baas voor de schaling");
  assert.ok(events.some((event) => event.e === "attack" && event.target === "p2" && event.sl === 1));
});

test("samen vechten: genezen telt als meedoen, en valt het doelwit weg dan pakt de vijand een ander die meevocht", () => {
  const { runtime, actor, players } = bossRuntime();
  runtime.step(1000);
  assert.equal(actor.targetPlayerId, "p1");
  assert.equal(runtime.creditHelper("p2", "p1"), 1, "p2 geneest p1 die met de vijand vecht");
  assert.ok(actor.contributors.has("p2"));
  assert.equal(runtime.creditHelper("p2", "p1"), 0, "niet dubbel");
  // p1 is verslagen: de vijand loopt niet terug (en wordt niet weer heel) maar gaat door met p2.
  runtime.host.isDefeated = (id) => id === "p1";
  runtime.step(1100);
  assert.equal(actor.state, "engage");
  assert.equal(actor.targetPlayerId, "p2");
  // Beloning: iedereen die meedeed, elk één keer (eigen claim per speler).
  actor.contributors.add("p1");
  const plan = runtime.planPlayerAttack({ playerId: "p2", classId: null, targetId: actor.id, x: 1, z: 0, safe: false, nowMs: 2000, operationId: "k1", attackPower: 0,
    ability: { abilityId: "klap", baseDamage: 500, powerScalingBp: 0, armorFactorBp: 0, rangeMm: 5000, cooldownMs: 1000 } }).plan;
  assert.deepEqual(plan.rewards.map((reward) => reward.claimKey), ["actor:reus:1|p1", "actor:reus:1|p2"]);
  players.length = 0;
});

test("van kaart naar build: de XP-grafiek wordt de XP-tabel, de klasse groeit per level en de schaling-schuifjes komen mee", async () => {
  const { compileCanonical } = await import("../src/server/authoring/build-service.js");
  const { buildRuntimeWorld } = await import("../src/server/authoring/world-builder.js");
  const doc = (kind, docKey, body) => ({ docKey, kind, body, archived: false, revision: 1 });
  const compiled = compileCanonical([
    doc("project_settings", "project_settings", { gameName: "GK", xpPerLevel: 100, maxLevel: 4, xpCurve: [[1, 100], [3, 300]] }),
    doc("player_class", "player_class:tank", { classId: "tank", displayName: "Tank", healthMax: 120, healthPerLevel: 15, armorPerLevel: 1 }),
    doc("combat_settings", "combat_settings", { levelScaling: true, levelDiffPct: 5, levelDiffMaxPct: 30 })
  ], {});
  assert.deepEqual(compiled.errors, []);
  const world = buildRuntimeWorld(JSON.parse(compiled.files["server.json"].text));
  const catalogs = world.gameProject.catalogs;
  const curve = Object.values(catalogs.statCurves)[0];
  assert.deepEqual(curve.points.map((point) => [point.x, point.y]), [[1, 0], [2, 100], [3, 300], [4, 600], [5, 900]]);
  const block = catalogs.statBlocks[catalogs.playableCharacters.tank.statBlockRef];
  const health = block.entries.find((entry) => entry.statRef === "stat.health");
  assert.deepEqual([health.baseValue, health.perLevel], [120, 15]);
  assert.equal(block.entries.find((entry) => entry.statRef === "stat.attack_power").perLevel, 1, "standaard: 1 kracht per level");
  const rules = world.gameProject.playerRules.byType.combat_rules[0];
  assert.deepEqual([rules.levelScaling, rules.levelDiffPct, rules.levelDiffMaxPct], [true, 5, 30]);
});
