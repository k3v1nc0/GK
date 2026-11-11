// Fase 7 (balans en maker-controle): het Balans-rapport (meldingen rood/oranje, XP per gebied, sterkte per level),
// de knoppen XP-tempo en Terugkomen die de server echt toepast, pickups zonder zone, en terugkomtijden en
// uitrustingsvakken uit Instellingen in plaats van uit de code.
import test from "node:test";
import assert from "node:assert/strict";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { balanceReport, legacyNodeCounts } from "../src/server/authoring/balance-report.js";
import { balanceValues, equipmentSlotsFrom, respawnPoliciesFrom } from "../src/shared/authoring/kinds/balance.js";
import { combatRulesFromProject, scaledRespawnMs, scaledXp } from "../src/server/runtime/player-effects.js";
import { buildRuntimeWorld } from "../src/server/authoring/world-builder.js";
import { compileGameSection } from "../src/server/authoring/game-compiler.js";

const doc = (kind, docKey, body) => ({ docKey, kind, body, archived: false, revision: 1, updatedAt: "2026-11-11T00:00:00.000Z" });
const codes = (report) => report.findings.map((finding) => finding.code);
const find = (report, code) => report.findings.find((finding) => finding.code === code) || null;

// Een kleine wereld: een klasse met een aanval, een vijand op een plek in een gebied, en een item.
function world(extra = []) {
  return [
    doc("project_settings", "project_settings:project", { gameName: "GK", maxLevel: 10, xpPerLevel: 100 }),
    doc("ability", "ability:ability.slaan", { abilityId: "ability.slaan", displayName: "Slaan", abilityKind: "damage", baseDamage: 10, powerScalingBp: 10000, armorFactorBp: 10000, cooldownMs: 1000, unlockLevel: 1 }),
    doc("player_class", "player_class:class.dps", { classId: "class.dps", displayName: "DPS", abilityRef: "ability:ability.slaan", healthMax: 100, attackPower: 10, armor: 0, healPower: 5, healthPerLevel: 10, attackPerLevel: 1, armorPerLevel: 0, manaPerLevel: 5, healPerLevel: 1, manaMax: 50 }),
    doc("region", "region:region.weide", { regionId: "region.weide", displayName: "Weide", minXMm: -50000, maxXMm: 50000, minZMm: -50000, maxZMm: 50000 }),
    doc("loot_table", "loot_table:loot.wolf", { lootTableId: "loot.wolf", displayName: "Wolf-buit", entries: [{ itemRef: "item_definition:item.vacht", chanceBp: 10000, minQty: 1, maxQty: 1 }] }),
    doc("item_definition", "item_definition:item.vacht", { itemId: "item.vacht", displayName: "Vacht", vendorValue: 3 }),
    doc("actor_archetype", "actor_archetype:actor.wolf", { actorId: "actor.wolf", displayName: "Wolf", healthMax: 50, attackPower: 5, armor: 0, level: 1, abilityRef: "ability:ability.slaan", lootTableRef: "loot_table:loot.wolf", xpReward: 10, respawnMs: 60000, behavior: "aggressive", aggroRangeMm: 8000, leashRangeMm: 20000, moveSpeedMmPerS: 3000, radiusMm: 600 }),
    doc("actor_spawn", "actor_spawn:spawn.wolf", { spawnId: "spawn.wolf", archetypeRef: "actor_archetype:actor.wolf", regionRef: "region:region.weide", xMm: 1000, zMm: 1000, eliteChancePct: 0, eliteStrengthPct: 200 }),
    ...extra
  ];
}

test("melding rood: een vak wijst naar een kaart die niet bestaat", () => {
  const docs = world([doc("actor_spawn", "actor_spawn:spawn.weg", { spawnId: "spawn.weg", archetypeRef: "actor_archetype:actor.weg", regionRef: "region:region.weide", xMm: 0, zMm: 0 })]);
  const report = balanceReport(docs);
  const finding = find(report, "REF_MISSING");
  assert.ok(finding, "ontbrekende verwijzing geeft een melding");
  assert.equal(finding.severity, "red");
  assert.equal(finding.docKey, "actor_spawn:spawn.weg", "doorklik naar de kaart met het lege vak");
  assert.match(finding.message, /actor\.weg/);
  // Zonder die kaart is er niets kapot.
  assert.equal(codes(balanceReport(world())).includes("REF_MISSING"), false);
});

test("melding rood: een vaardigheid die nooit te halen is (level te hoog of geen quest die hem geeft)", () => {
  const hoog = doc("ability", "ability:ability.hoog", { abilityId: "ability.hoog", displayName: "Donderslag", abilityKind: "damage", baseDamage: 30, unlockLevel: 50 });
  const questOnly = doc("ability", "ability:ability.quest", { abilityId: "ability.quest", displayName: "Schildbreker", abilityKind: "damage", baseDamage: 20, unlockLevel: 2, unlockQuest: true });
  const klasse = doc("player_class", "player_class:class.dps", { classId: "class.dps", displayName: "DPS", abilityRef: "ability:ability.slaan", skills: [{ ref: "ability:ability.hoog" }, { ref: "ability:ability.quest" }], healthMax: 100, attackPower: 10, armor: 0, healPower: 5, healthPerLevel: 10, attackPerLevel: 1, armorPerLevel: 0, manaPerLevel: 5, healPerLevel: 1, manaMax: 50 });
  const docs = world([hoog, questOnly]).filter((entry) => entry.docKey !== "player_class:class.dps").concat([klasse]);
  const report = balanceReport(docs);
  assert.equal(find(report, "ABILITY_LEVEL").severity, "red");
  assert.match(find(report, "ABILITY_LEVEL").message, /hoogste level is 10/);
  assert.equal(find(report, "ABILITY_NO_QUEST").severity, "red");
  // Een quest die hem geeft haalt de melding weg.
  const quest = doc("quest", "quest:quest.les", { questId: "quest.les", displayName: "De les", goal: "visit", rewards: [{ ref: "ability:ability.quest" }], rewardXp: 50 });
  assert.equal(codes(balanceReport(docs.concat([quest]))).includes("ABILITY_NO_QUEST"), false);
});

test("melding oranje: te ruime farmbron, met de grens uit Balans", () => {
  // Een wolf die 60 XP geeft en elke 10 s terugkomt: veel meer dan 20 levels per uur (100 XP per level).
  const wolf = doc("actor_archetype", "actor_archetype:actor.wolf", { actorId: "actor.wolf", displayName: "Wolf", healthMax: 50, attackPower: 5, armor: 0, level: 1, abilityRef: "ability:ability.slaan", lootTableRef: "loot_table:loot.wolf", xpReward: 60, respawnMs: 10000, behavior: "aggressive", aggroRangeMm: 8000, leashRangeMm: 20000, moveSpeedMmPerS: 3000, radiusMm: 600 });
  const docs = world().filter((entry) => entry.docKey !== "actor_archetype:actor.wolf").concat([wolf]);
  const report = balanceReport(docs);
  const farm = find(report, "FARM_WIDE");
  assert.ok(farm, "te ruime farmbron geeft een melding");
  assert.equal(farm.severity, "orange");
  assert.equal(farm.docKey, "actor_archetype:actor.wolf", "doorklik naar de grootste bron");
  // De grens staat in Instellingen > Balans: hoger = geen melding.
  const ruim = docs.concat([doc("balance_settings", "balance_settings:balance", { xpRatePct: 100, respawnRatePct: 100, farmLevelsPerHour: 500 })]);
  assert.equal(codes(balanceReport(ruim)).includes("FARM_WIDE"), false);
  // XP-tempo 200 % verdubbelt het tempo in het rapport.
  const area = (list) => balanceReport(list).xpByArea.find((entry) => entry.name === "Weide");
  const snel = docs.concat([doc("balance_settings", "balance_settings:balance", { xpRatePct: 200, respawnRatePct: 100, farmLevelsPerHour: 500 })]);
  assert.equal(area(snel).hourXp, area(ruim).hourXp * 2);
});

test("meldingen oranje: baas zonder schild, niets voor vak 2/3, en een beloning die nergens voor dient", () => {
  const baas = doc("actor_archetype", "actor_archetype:actor.baas", { actorId: "actor.baas", displayName: "Oude Baas", healthMax: 300, attackPower: 10, armor: 0, level: 3, groupBoss: true, bossHealthPct: 300, abilityRef: "ability:ability.slaan", lootTableRef: "loot_table:loot.wolf", xpReward: 50, respawnMs: 300000, behavior: "aggressive", aggroRangeMm: 8000, leashRangeMm: 20000, moveSpeedMmPerS: 3000, radiusMm: 600 });
  const report = balanceReport(world([baas]));
  assert.equal(find(report, "BOSS_AUTO").severity, "orange");
  assert.match(find(report, "BOSS_AUTO").message, [/Oude Baas/][0]);
  // Een vijand met een schild terwijl de klasse nog geen aanval voor vak 2 of 3 heeft.
  const schild = Object.assign({}, baas, { docKey: "actor_archetype:actor.schild", body: Object.assign({}, baas.body, { actorId: "actor.schild", displayName: "Harde Wolf", groupBoss: false, shieldAlways: true }) });
  const plek = doc("actor_spawn", "actor_spawn:spawn.schild", { spawnId: "spawn.schild", archetypeRef: "actor_archetype:actor.schild", regionRef: "region:region.weide", xMm: 2000, zMm: 2000 });
  assert.equal(find(balanceReport(world([schild, plek])), "SHIELD_NO_SKILL").severity, "orange");
  // Een questbeloning die je niet kunt dragen, gebruiken, verkopen of inleveren.
  const prul = doc("item_definition", "item_definition:item.prul", { itemId: "item.prul", displayName: "Prul", vendorValue: 0 });
  const quest = doc("quest", "quest:quest.prul", { questId: "quest.prul", displayName: "Prul halen", goal: "visit", rewards: [{ ref: "item_definition:item.prul" }], rewardXp: 10 });
  const nutteloos = find(balanceReport(world([prul, quest])), "REWARD_USELESS");
  assert.equal(nutteloos.severity, "orange");
  assert.equal(nutteloos.docKey, "item_definition:item.prul");
});

test("XP per gebied en sterkte per level", () => {
  const quest = doc("quest", "quest:quest.eerste", { questId: "quest.eerste", displayName: "Eerste stap", goal: "visit", rewardXp: 250, repeatable: false });
  const report = balanceReport(world([quest]));
  const weide = report.xpByArea.find((entry) => entry.name === "Weide");
  assert.ok(weide, "de wolf hoort bij het gebied waar zijn plek in ligt");
  // 10 XP per wolf, elke 60 s terug = 600 XP per uur = 6 levels per uur (100 XP per level).
  assert.equal(weide.hourXp, 600);
  assert.equal(weide.hourLevels, 6);
  const buiten = report.xpByArea.find((entry) => entry.key === null);
  assert.equal(buiten.onceXp, 250, "een quest die je 1× doet is een budget");
  assert.equal(buiten.onceLevels, 2.5);
  const wolf = report.strength.find((entry) => entry.name === "Wolf");
  assert.equal(wolf.level, 1);
  assert.equal(wolf.health, 50);
  assert.equal(wolf.classes[0].hitsNeeded, 3, "DPS (kracht 10, slag 20) heeft 3 klappen nodig");
  assert.equal(wolf.classes[0].hitsSurvive, 7, "en overleeft 7 klappen van de wolf");
  assert.equal(report.assumption.includes("Aanname"), true, "de aanname staat erbij");
});

test("knoppen: XP-tempo en Terugkomen rekenen mee", () => {
  assert.equal(scaledXp(50, 200), 100);
  assert.equal(scaledXp(50, 50), 25);
  assert.equal(scaledXp(1, 10), 1, "er blijft altijd minstens 1 XP over");
  assert.equal(scaledXp(0, 200), 0);
  assert.equal(scaledRespawnMs(60000, 200), 30000, "twee keer zo snel terug");
  assert.equal(scaledRespawnMs(60000, 50), 120000);
  assert.equal(scaledRespawnMs(60000, 100), 60000);
  assert.equal(scaledRespawnMs(0, 200), 0);
  // De waarden komen uit de wereld (Instellingen > Balans), met 100 % als standaard.
  const rules = combatRulesFromProject({ playerRules: { byType: { combat_rules: [{ xpRatePct: 200, respawnRatePct: 300 }] } } });
  assert.equal(rules.xpRatePct, 200);
  assert.equal(rules.respawnRatePct, 300);
  assert.equal(combatRulesFromProject(null).xpRatePct, 100);
  assert.deepEqual(balanceValues(null), { xpRatePct: 100, respawnRatePct: 100, farmLevelsPerHour: 20 });
});

test("kaart naar build: Balans, Terugkomtijden en Uitrustingsvakken komen in de wereld", () => {
  const docs = [
    doc("project_settings", "project_settings:project", { gameName: "GK", maxLevel: 10, xpPerLevel: 100 }),
    doc("balance_settings", "balance_settings:balance", { xpRatePct: 200, respawnRatePct: 150, farmLevelsPerHour: 30 }),
    doc("respawn_settings", "respawn_settings:respawn", { fastS: 10, standardS: 90, slowS: 450, rareS: 2700 }),
    doc("equipment_settings", "equipment_settings:equipment", { on_ring: false, name_head: "Helm" })
  ];
  const game = compileGameSection(docs, {});
  assert.equal(game.errors.length, 0);
  assert.equal(game.server.balance.xpRatePct, 200);
  assert.equal(game.server.respawn.fastS, 10);
  const built = buildRuntimeWorld({ project: docs[0].body, game: game.server });
  const rules = built.gameProject.playerRules.byType.combat_rules[0];
  assert.equal(rules.xpRatePct, 200);
  assert.equal(rules.respawnRatePct, 150);
  assert.equal(built.gameProject.catalogs.respawnPolicies["respawn_policy.fast"].minDelayMs, 10000, "de tijd komt uit Instellingen");
  assert.match(built.gameProject.catalogs.respawnPolicies["respawn_policy.fast"].displayName, /10 s/);
  assert.equal(built.gameProject.catalogs.equipmentSlots["equipment_slot.head"].displayName, "Helm");
  assert.equal(built.gameProject.catalogs.equipmentSlots["equipment_slot.ring"], undefined, "een vak dat uit staat zit niet in de wereld");
  // Zonder kaarten: de standaarden uit het schema.
  const plain = buildRuntimeWorld({});
  assert.equal(plain.gameProject.playerRules.byType.combat_rules[0].xpRatePct, 100);
  assert.equal(Object.keys(plain.gameProject.catalogs.equipmentSlots).length, 9);
  assert.equal(respawnPoliciesFrom(null).length, 4);
  assert.equal(equipmentSlotsFrom({ on_ring: false }).length, 8);
});

test("een item in een vak dat uit staat kan niemand dragen (rood), en een pickup heeft geen zone meer nodig", () => {
  const item = doc("item_definition", "item_definition:item.ring", { itemId: "item.ring", displayName: "Ring", equipSlot: "equipment_slot.ring", vendorValue: 5 });
  const uit = doc("equipment_settings", "equipment_settings:equipment", { on_ring: false });
  assert.equal(find(balanceReport(world([item, uit])), "EQUIP_SLOT_OFF").severity, "red");
  assert.equal(codes(balanceReport(world([item]))).includes("EQUIP_SLOT_OFF"), false);
  // Pickup: zonder zone opslaan mag (één wereld).
  const body = { pickupId: "pickup.vacht", itemRef: "item_definition:item.vacht", x: 1, y: 0, z: 2, amount: 1 };
  assert.equal(validateDocument("pickup", body).ok, true);
  assert.equal(validateDocument("pickup", Object.assign({}, body, { zoneRef: "zone.world" })).ok, true, "een oude pickup met zone blijft geldig");
});

test("lijst per soort van wat nog aan de oude route (nodes) hangt", () => {
  const rows = legacyNodeCounts({ nodes: [{ type: "item_definition" }, { type: "item_definition" }, { type: "zone_definition" }] }, (type) => (type === "item_definition" ? "Item Definition" : type));
  assert.deepEqual(rows, [{ type: "item_definition", label: "Item Definition", count: 2 }, { type: "zone_definition", label: "zone_definition", count: 1 }]);
  assert.deepEqual(legacyNodeCounts(null), []);
});

// De route die de editor gebruikt: GET /api/authoring/balance (alleen lezen).
test("route: /api/authoring/balance geeft het rapport en de lijst oude route; de keuzes komen uit Instellingen", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { AuthoringRoutes } = await import("../src/server/authoring/routes.js");
  const { authoringDb } = await import("./authoring-helpers.js");
  const user = { id: "u-admin", username: "kevin", role: "admin" };
  const graph = { nodes: [{ id: "n1", type: "item_definition" }], edges: [] };
  const routes = new AuthoringRoutes({
    db: authoringDb(),
    authService: { currentUser: () => user, requireEditor: () => user, csrfTokenForRequest: () => "csrf" },
    repository: { getPublishedWorld: () => null, setWriteGuard: () => {}, getGraph: () => graph, getGraphRevision: () => 1 },
    mmoService: { setCanonicalBuildProvider: () => {} },
    buildsRoot: fs.default.mkdtempSync(path.default.join(os.default.tmpdir(), "gk-fase7-")),
    sendJson: (res, status, data) => Object.assign(res, { status, data }),
    readJson: async (req) => req.body || {}
  });
  const call = async (method, pathname, body) => {
    const res = {};
    await routes.handle({ method, headers: {}, user, body }, res, new URL("http://localhost" + pathname));
    return res;
  };
  let seq = 0;
  const save = (kind, body) => call("POST", "/api/authoring/command", { requestId: "req-f7-" + String(seq++).padStart(3, "0"), command: "create", kind, body });
  await save("project_settings", { gameName: "GK", maxLevel: 10, xpPerLevel: 100 });
  const item = await save("item_definition", { itemId: "item.ring", displayName: "Ring", category: "material", rarity: "common", stackable: false, stackLimit: 1, equipSlot: "equipment_slot.ring" });
  assert.equal(item.status, 201, JSON.stringify(item.data));
  await save("equipment_settings", { on_ring: false, name_head: "Helm" });
  await save("respawn_settings", { fastS: 20 });
  const balance = await call("GET", "/api/authoring/balance");
  assert.equal(balance.status, 200);
  assert.ok(balance.data.report.findings.some((finding) => finding.code === "EQUIP_SLOT_OFF" && finding.severity === "red"), "item in een vak dat uit staat");
  assert.deepEqual(balance.data.legacy, [{ type: "item_definition", label: "Item Definition", count: 1 }]);
  const workspace = await call("GET", "/api/authoring/workspace");
  assert.equal(workspace.data.equipmentSlots.some((slot) => slot.id === "equipment_slot.ring"), false, "een vak dat uit staat is geen keuze meer");
  assert.equal(workspace.data.equipmentSlots.find((slot) => slot.id === "equipment_slot.head").label, "Helm");
  assert.match(workspace.data.respawnPolicies.find((policy) => policy.id === "respawn_policy.fast").label, /20 s/);
});
