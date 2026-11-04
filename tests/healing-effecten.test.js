// Healing (2-11): regeneratie, tijdelijke effecten, wachttijd per item, genees-spreuk en vijand-healer.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { computeHeal, describeEffect, effectFromSource, regenStep } from "../apps/web/public/shared/effect-math.js";
import { Node03RuntimeService } from "../src/server/node03-runtime-service.js";
import { VitalsRuntime } from "../src/server/runtime/vitals-runtime.js";
import { ActorRuntime } from "../src/server/runtime/actor-runtime.js";
import { compileActorSection, playerHealAbilityFromSection } from "../src/server/authoring/actor-compiler.js";
import { runtimeItemFromCanonical } from "../src/server/authoring/runtime-overlay.js";

test("rekenregels: effect, genezing en regeneratie", () => {
  assert.equal(effectFromSource({ effectDurationS: 0, effectAttackPower: 5 }), null, "geen duur = geen effect");
  assert.equal(effectFromSource({ effectDurationS: 60 }), null, "alles 0 = geen effect");
  const broodje = effectFromSource({ effectDurationS: 300, effectAttackPower: 5 }, "Broodje");
  assert.equal(broodje.durationMs, 300000);
  assert.equal(broodje.name, "Broodje");
  assert.deepEqual(describeEffect(effectFromSource({ effectDurationS: 10, effectHealthPctBp: -200, effectTickS: 2 })), ["-2 % levens om de 2 s (gif)"]);
  assert.deepEqual(describeEffect(effectFromSource({ effectDurationS: 300, effectHealthPctBp: 100, effectTickS: 1 })), ["+1 % levens om de 1 s"]);
  assert.equal(computeHeal({ baseHeal: 20, healScalingBp: 10000 }, 10), 30);
  assert.equal(computeHeal({ baseHeal: 20, healScalingBp: 5000 }, 10), 25);
  let carry = 0;
  let total = 0;
  for (let second = 0; second < 10; second += 1) {
    const step = regenStep(60, 100, carry); // 1 %/s van 60 = 0,6 per seconde
    total += step.amount;
    carry = step.carry;
  }
  assert.equal(total, 6, "0,6 per seconde telt in 10 seconden op tot 6");
  assert.equal(regenStep(100, 0).amount, 0, "0 % = niets");
});

test("item-effectvelden gaan mee naar de runtime (ook min)", () => {
  const runtime = runtimeItemFromCanonical({ itemId: "item.vies", displayName: "Vies drankje", effectDurationS: 60, effectArmor: -2, effectHealthPctBp: 150, effectTickS: 5, useCooldownS: 30, effectName: "Bah" });
  assert.equal(runtime.effectArmor, -2);
  assert.equal(runtime.effectHealthPctBp, 150);
  assert.equal(runtime.effectTickS, 5);
  assert.equal(runtime.useCooldownS, 30);
  assert.equal(runtime.effectName, "Bah");
});

function setup({ health = 100, mana = 50 } = {}) {
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort()) db.exec(fs.readFileSync("db/migrations/" + file, "utf8"));
  const stamp = new Date().toISOString();
  db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES ('u1', 'anna', 'x', 'x', 'player', ?, ?)").run(stamp, stamp);
  db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES ('u2', 'bob', 'x', 'x', 'player', ?, ?)").run(stamp, stamp);
  for (const [id, user, name] of [["p1", "u1", "anna"], ["p2", "u2", "bob"]]) {
    db.prepare("INSERT INTO player_profiles (id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at) VALUES (?, ?, ?, 'class.healer', 'world.main', ?, ?)").run(id, user, name, stamp, stamp);
    db.prepare("INSERT INTO player_stats (player_id, stat_id, base_value, earned_value, current_value, updated_at) VALUES (?, 'stat.health', 100, 0, ?, ?)").run(id, health, stamp);
    db.prepare("INSERT INTO player_stats (player_id, stat_id, base_value, earned_value, current_value, updated_at) VALUES (?, 'stat.mana', 50, 0, ?, ?)").run(id, mana, stamp);
    db.prepare("INSERT INTO player_stats (player_id, stat_id, base_value, earned_value, current_value, updated_at) VALUES (?, 'stat.heal_power', 10, 0, 10, ?)").run(id, stamp);
  }
  db.prepare("INSERT INTO player_inventory_stacks (stack_id, player_id, item_id, bind_state, quantity, created_at, updated_at) VALUES ('s1', 'p1', 'item.broodje', 'none', 3, ?, ?)").run(stamp, stamp);
  db.prepare("INSERT INTO player_inventory_stacks (stack_id, player_id, item_id, bind_state, quantity, created_at, updated_at) VALUES ('s2', 'p1', 'item.drankje', 'none', 3, ?, ?)").run(stamp, stamp);
  const project = {
    catalogs: {
      items: {
        "item.broodje": { id: "item.broodje", displayName: "Broodje", effectDurationS: 300, effectAttackPower: 5 },
        "item.drankje": { id: "item.drankje", displayName: "Drankje", healAmount: 20, useCooldownS: 30 }
      },
      playableCharacters: { "class.healer": { id: "class.healer", healthRegenBp: 100, manaRegenBp: 200 } }
    },
    playerRules: { byType: { combat_rules: [{ regenDelayMs: 5000, effectStacking: "block", maxEffects: 8, clearBuffsOnDeath: true, levelUpRestore: true }] } }
  };
  const positions = [{ player_id: "p1", x: 0, z: 0 }, { player_id: "p2", x: 3, z: 0 }];
  const sent = [];
  const vitals = new VitalsRuntime({
    db, project: () => project, playerStates: () => positions, isOnline: () => true,
    connectionFor: (playerId) => ({ playerId }), send: (connection, payload) => sent.push(Object.assign({ to: connection.playerId }, payload)), onDefeat: () => {}
  });
  const healSection = {
    classHealAbilityIds: { "class.healer": "ability.heal" },
    abilities: { "ability.heal": { abilityId: "ability.heal", displayName: "Genees", abilityKind: "heal", baseHeal: 20, healScalingBp: 10000, manaCost: 10, rangeMm: 10000, cooldownMs: 1500 } }
  };
  const mmoService = {
    vitalsRuntime: vitals,
    actorRuntime: { ensureBuild: () => healSection },
    getWorldPlayerStates: () => positions,
    getConnectionForPlayer: () => ({}),
    broadcastToWorld: (worldId, payload) => sent.push(payload)
  };
  const svc = Object.create(Node03RuntimeService.prototype);
  svc.db = db;
  svc.mmoService = mmoService;
  const ctx = { profile: { id: "p1", selected_character_id: "class.healer" }, worldId: "world.main", zoneId: "zone.start", project, catalogs: project.catalogs, position: { x: 0, z: 0 } };
  const stat = (playerId, statId) => db.prepare("SELECT current_value FROM player_stats WHERE player_id = ? AND stat_id = ?").get(playerId, statId).current_value;
  const qty = (itemId) => db.prepare("SELECT quantity FROM player_inventory_stacks WHERE player_id = 'p1' AND item_id = ?").get(itemId)?.quantity || 0;
  return { db, svc, ctx, vitals, sent, stat, qty };
}

test("broodje met volle levens: effect start, item gaat eraf; nog eens = item blijft (Niet nog eens)", () => {
  const { svc, ctx, qty } = setup();
  const result = svc.useItem(ctx, { itemId: "item.broodje" }, "op1");
  assert.match(result.message, /\+5 kracht/);
  assert.equal(qty("item.broodje"), 2);
  assert.throws(() => svc.useItem(ctx, { itemId: "item.broodje" }, "op2"), (error) => error.status === 409 && /werkt nog/.test(error.message));
  assert.equal(qty("item.broodje"), 2, "mislukt = item blijft in de tas");
  const snapshotEffects = svc.db.prepare("SELECT effect_key FROM player_effects WHERE player_id = 'p1'").all();
  assert.deepEqual(snapshotEffects.map((row) => row.effect_key), ["item:item.broodje"]);
});

test("drankje: wachttijd per item, en met volle levens blijft het in de tas", () => {
  const { svc, ctx, qty, stat } = setup({ health: 50 });
  svc.useItem(ctx, { itemId: "item.drankje" }, "op1");
  assert.equal(stat("p1", "stat.health"), 70);
  assert.throws(() => svc.useItem(ctx, { itemId: "item.drankje" }, "op2"), (error) => error.status === 409 && /wachten/.test(error.message));
  assert.equal(qty("item.drankje"), 2);
  svc.db.prepare("UPDATE player_item_cooldowns SET ready_at_ms = 0").run();
  svc.db.prepare("UPDATE player_stats SET current_value = 100 WHERE stat_id = 'stat.health'").run();
  assert.throws(() => svc.useItem(ctx, { itemId: "item.drankje" }, "op3"), (error) => error.status === 409 && /al vol/.test(error.message));
  assert.equal(qty("item.drankje"), 2);
});

test("regeneratie buiten gevecht, niet tijdens; gif doet schade", () => {
  const { vitals, stat, sent, db } = setup({ health: 50, mana: 10 });
  vitals.markCombat("p1", 10000);
  vitals.tick("world.main", 12000);
  assert.equal(stat("p1", "stat.health"), 50, "p1 vecht nog: geen regeneratie");
  assert.equal(stat("p2", "stat.health"), 51, "p2 vecht niet: 1 %/s van 100");
  assert.equal(stat("p2", "stat.mana"), 11, "2 %/s van 50");
  vitals.tick("world.main", 15000);
  assert.equal(stat("p1", "stat.health"), 53, "5 s na de laatste klap komt regeneratie op gang (3 s ingehaald)");
  db.prepare("INSERT INTO player_effects (player_id, effect_key, source_kind, source_id, good, effect_json, started_at_ms, ends_at_ms, updated_at) VALUES ('p2', 'ability:gif', 'ability', 'gif', 0, ?, 0, 99999999999999, 'x')")
    .run(JSON.stringify({ name: "Gif", durationMs: 10000, healthPerS: -4 }));
  vitals.markCombat("p2", 15000);
  vitals.tick("world.main", 16000);
  assert.equal(stat("p2", "stat.health"), 50, "gif: -4 per seconde (54 -> 50), geen regeneratie in gevecht");
  const last = sent.filter((entry) => entry.type === "vitals" && entry.to === "p2").pop();
  assert.equal(last.effects[0].name, "Gif");
  assert.equal(last.effects[0].good, false);
});

test("broodje: 1 % levens om de 1 s, ook in gevecht; gif -2 % om de 2 s", () => {
  const { vitals, stat, db } = setup({ health: 50 });
  const insert = db.prepare("INSERT INTO player_effects (player_id, effect_key, source_kind, source_id, good, effect_json, started_at_ms, ends_at_ms, updated_at) VALUES (?, ?, 'item', 'x', ?, ?, ?, ?, 'x')");
  insert.run("p1", "item:broodje", 1, JSON.stringify({ name: "Broodje", durationMs: 300000, healthPctBp: 100, tickMs: 1000 }), 10000, 310000);
  insert.run("p2", "ability:gif", 0, JSON.stringify({ name: "Gif", durationMs: 20000, healthPctBp: -200, tickMs: 2000 }), 10000, 30000);
  vitals.markCombat("p1", 10000);
  vitals.markCombat("p2", 10000);
  vitals.tick("world.main", 11000);
  assert.equal(stat("p1", "stat.health"), 51, "1 % van 100 na 1 s, ondanks gevecht");
  assert.equal(stat("p2", "stat.health"), 50, "gif gaat pas na 2 s af");
  vitals.tick("world.main", 12000);
  assert.equal(stat("p1", "stat.health"), 52);
  assert.equal(stat("p2", "stat.health"), 48, "-2 % van 100");
});

test("genees-spreuk: kiest de meest gewonde speler in de buurt en kost mana", () => {
  const { svc, ctx, stat, db } = setup();
  db.prepare("UPDATE player_stats SET current_value = 40 WHERE player_id = 'p2' AND stat_id = 'stat.health'").run();
  db.prepare("UPDATE player_stats SET current_value = 90 WHERE player_id = 'p1' AND stat_id = 'stat.health'").run();
  const result = svc.healTarget(ctx, {}, "op1");
  assert.equal(result.targetId, "p2");
  assert.equal(stat("p2", "stat.health"), 70, "20 + heal-kracht 10");
  assert.equal(stat("p1", "stat.mana"), 40);
  const again = svc.healTarget(ctx, {}, "op2");
  assert.equal(again.message, "Nog even wachten.");
  svc.healReadyAt.clear();
  db.prepare("UPDATE player_stats SET current_value = 5 WHERE player_id = 'p1' AND stat_id = 'stat.mana'").run();
  assert.throws(() => svc.healTarget(ctx, {}, "op3"), (error) => error.status === 409 && /mana/.test(error.message));
});

test("MMO (3-11): gekozen teamlid te ver weg = melding, niet stilletjes iemand anders genezen", () => {
  const { svc, ctx, stat } = setup({ health: 50 });
  svc.healReadyAt = new Map();
  svc.mmoService.getWorldPlayerStates = () => [{ player_id: "p1", x: 0, z: 0 }, { player_id: "p2", x: 50, z: 0 }];
  assert.throws(() => svc.healTarget(ctx, { targetId: "player:p2" }, "op_far"), (error) => error.status === 409 && /bob is te ver weg/.test(error.message));
  assert.equal(stat("p1", "stat.health"), 50, "jezelf ook niet");
  svc.mmoService.getWorldPlayerStates = () => [{ player_id: "p1", x: 0, z: 0 }, { player_id: "p2", x: 3, z: 0 }];
  assert.equal(svc.healTarget(ctx, { targetId: "player:p2" }, "op_near").targetId, "p2");
});

test("compiler: genees-spreuk van klasse en vijand moet soort Genezen hebben", () => {
  const doc = (kind, docKey, body) => ({ kind, docKey, body, archived: false });
  const docs = [
    doc("ability", "ability:heal", { abilityId: "heal", displayName: "Genees", abilityKind: "heal", baseDamage: 0, powerScalingBp: 0, armorFactorBp: 0, rangeMm: 8000, cooldownMs: 3000, baseHeal: 15 }),
    doc("ability", "ability:klap", { abilityId: "klap", displayName: "Klap", baseDamage: 5, powerScalingBp: 10000, armorFactorBp: 10000, rangeMm: 2000, cooldownMs: 1500 }),
    doc("actor_archetype", "actor_archetype:sjamaan", { actorId: "sjamaan", displayName: "Sjamaan", healthMax: 40, attackPower: 2, armor: 0, abilityRef: "ability:klap", healAbilityRef: "ability:heal",
      behavior: "aggressive", aggroRangeMm: 8000, leashRangeMm: 20000, moveSpeedMmPerS: 3000, radiusMm: 600, respawnMs: 30000, regenEnabled: true, regenBp: 100 }),
    doc("actor_archetype", "actor_archetype:fout", { actorId: "fout", displayName: "Fout", healthMax: 40, attackPower: 2, armor: 0, abilityRef: "ability:klap", healAbilityRef: "ability:klap",
      behavior: "aggressive", aggroRangeMm: 8000, leashRangeMm: 20000, moveSpeedMmPerS: 3000, radiusMm: 600, respawnMs: 30000 }),
    doc("player_class", "player_class:healer", { classId: "healer", displayName: "Healer", abilityRef: "ability:klap", healAbilityRef: "ability:heal" })
  ];
  const section = compileActorSection(docs);
  assert.equal(section.server.archetypes.sjamaan.healAbilityId, "heal");
  assert.equal(section.server.archetypes.sjamaan.regenEnabled, true);
  assert.ok(section.errors.some((error) => error.code === "HEAL_ABILITY_KIND" && /fout/.test(error.message)));
  assert.equal(playerHealAbilityFromSection(section.server, "healer").abilityId, "heal");
  assert.equal(playerHealAbilityFromSection(section.server, "andere"), null);
});

test("vijand-healer geneest een gewonde vechtende vijand; regeneratie telt op", () => {
  const runtime = new ActorRuntime({ db: null, canonicalBuild: () => null, worldContext: () => null, spatial: () => null, playerStates: () => [], isOnline: () => false,
    isDefeated: () => false, connections: () => [], send: () => {} });
  const events = [];
  runtime.emitEvent = (event) => events.push(event);
  runtime.section = { abilities: { heal: { abilityKind: "heal", baseHeal: 15, rangeMm: 8000, cooldownMs: 3000 } } };
  const actor = (id, extra) => Object.assign({ id, spawnKey: id, state: "engage", hp: 40, hpMax: 40, x: 0, z: 0, ry: 0, rev: 1, path: [], nextAttackAtMs: 0, anim: "idle",
    def: { radiusMm: 600, regenEnabled: false, regenBp: 0 } }, extra);
  const healer = actor("actor:s:1", { def: { radiusMm: 600, healAbilityId: "heal" } });
  const hurt = actor("actor:w:1", { hp: 10, x: 3 });
  runtime.actors = new Map([[healer.id, healer], [hurt.id, hurt]]);
  assert.equal(runtime.tryHeal(healer, 1000), true);
  assert.equal(hurt.hp, 25);
  assert.equal(events[0].e, "heal");
  assert.equal(runtime.tryHeal(healer, 2000), false, "wachttijd van de spreuk");
  const troll = actor("actor:t:1", { hp: 50, hpMax: 100, def: { radiusMm: 600, regenEnabled: true, regenBp: 200 } });
  runtime.actors = new Map([[troll.id, troll]]);
  runtime.regenActors();
  assert.equal(troll.hp, 52, "2 %/s van 100, ook in gevecht");
});
