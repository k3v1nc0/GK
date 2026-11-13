// Werkbank Fase 9: beroepen en uitrusting.
// 9a: een Beroep-kaart, en per grondstof het beroep, het niveau en de beroeps-XP.
// 9b: per recept het beroep, het niveau en hoe je het leert; een werkplek hoort bij een NPC of model; de server
//     controleert materiaal, niveau, werkplek en geld in één keer en een weigering laat alles staan; Balans.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { CANONICAL_KINDS, validateDocument } from "../src/shared/authoring/kinds.js";
import { economyValues } from "../src/shared/authoring/kinds/economy.js";
import { professionProgress } from "../src/shared/authoring/kinds/profession.js";
import { compileGameSection } from "../src/server/authoring/game-compiler.js";
import { buildRuntimeWorld, itemSourcesFor } from "../src/server/authoring/world-builder.js";
import { balanceReport } from "../src/server/authoring/balance-report.js";
import { Node03RuntimeService } from "../src/server/node03-runtime-service.js";
import { Node05EconomyRuntimeService } from "../src/server/node05-economy-runtime-service.js";
import { runOperation } from "../src/server/persistence/operation-contract.js";
import { node05ActionBody } from "../apps/web/public/game/node05-request.js";

const doc = (kind, body, key) => ({ docKey: (key || kind + ":" + kind), kind, archived: false, body });

test("de kaart Beroep en de nieuwe velden: standaarden en grenzen", () => {
  const spec = CANONICAL_KINDS.profession;
  assert.equal(spec.place, "werkbank");
  assert.equal(spec.fields.maxLevel.default, 10);
  assert.equal(spec.fields.xpPerLevel.default, 100);
  for (const kind of ["resource_definition", "recipe"]) {
    for (const key of ["professionRef", "professionLevel", "professionXp"]) assert.ok(CANONICAL_KINDS[kind].fields[key], kind + "." + key);
  }
  assert.deepEqual(CANONICAL_KINDS.recipe.fields.learn.options, ["start", "buy", "quest", "level"]);
  assert.ok(CANONICAL_KINDS.npc.fields.craftProfessionRef, "werkplek bij een NPC");
  assert.ok(CANONICAL_KINDS.placed_model.fields.crafting && CANONICAL_KINDS.placed_model.fields.craftProfessionRef, "werkplek bij een model");
  assert.ok(CANONICAL_KINDS.quest.fields.rewards.refKinds.includes("recipe"), "een quest kan een recept geven");
  // Keuze van Kevin 13-11: een schuifje, standaard alle (0).
  assert.equal(economyValues(null).professionLimit, 0);
  assert.equal(economyValues({ professionLimit: 2 }).professionLimit, 2);
  assert.equal(validateDocument("profession", { professionId: "prof.smeden", displayName: "Smeden", maxLevel: 10 }).ok, true);
  // Niveau uit XP: elk niveau evenveel, nooit voorbij het hoogste.
  assert.equal(professionProgress({ maxLevel: 10, xpPerLevel: 100 }, 0).level, 1);
  assert.equal(professionProgress({ maxLevel: 10, xpPerLevel: 100 }, 250).level, 3);
  assert.equal(professionProgress({ maxLevel: 10, xpPerLevel: 100 }, 250).into, 50);
  assert.equal(professionProgress({ maxLevel: 3, xpPerLevel: 100 }, 99999).level, 3);
});

test("kaart naar build: recept en werkplek horen bij een beroep, een model kan een werkplek zijn", () => {
  const docs = [
    doc("profession", { professionId: "prof.smeden", displayName: "Smeden", maxLevel: 10, xpPerLevel: 100 }, "profession:prof.smeden"),
    doc("item_definition", { itemId: "item.ore", displayName: "Kopererts" }, "item_definition:item.ore"),
    doc("item_definition", { itemId: "item.sword", displayName: "Zwaard" }, "item_definition:item.sword"),
    doc("npc", { npcId: "npc.smid", displayName: "Smid", crafting: true, craftProfessionRef: "profession:prof.smeden", x: 0, z: 0 }, "npc:npc.smid"),
    doc("npc", { npcId: "npc.kok", displayName: "Kok", crafting: true, x: 5, z: 0 }, "npc:npc.kok"),
    doc("placed_model", { placedModelId: "model.aambeeld", displayName: "Aambeeld", modelAssetId: "asset.anvil", crafting: true, craftProfessionRef: "profession:prof.smeden", x: 10, z: 0, collisionRadius: 1 }, "placed_model:model.aambeeld"),
    doc("recipe", { recipeId: "recipe.sword", displayName: "Zwaard", ingredients: [{ ref: "item_definition:item.ore", amount: 2 }], outputItemRef: "item_definition:item.sword",
      professionRef: "profession:prof.smeden", professionLevel: 2, professionXp: 20, learn: "start" }, "recipe:recipe.sword"),
    doc("recipe", { recipeId: "recipe.book", displayName: "Boek", ingredients: [{ ref: "item_definition:item.ore", amount: 1 }], outputItemRef: "item_definition:item.sword",
      learn: "buy", learnPrice: 30 }, "recipe:recipe.book"),
    doc("quest", { questId: "quest.leer", displayName: "Leer", giverRef: "npc:npc.smid", goal: "visit", targetNpcRef: "npc:npc.kok", rewards: [{ ref: "recipe:recipe.book", amount: 1 }] }, "quest:quest.leer")
  ];
  const section = compileGameSection(docs, {});
  assert.deepEqual(section.errors, []);
  assert.equal(section.server.professions[0].professionId, "prof.smeden");
  const world = buildRuntimeWorld({ game: section.server });
  const catalogs = world.gameProject.catalogs;
  assert.equal(catalogs.professions["prof.smeden"].maxLevel, 10);
  assert.equal(catalogs.recipes["recipe.sword"].stationType, "profession.prof.smeden");
  assert.equal(catalogs.recipes["recipe.sword"].professionLevel, 2);
  assert.equal(catalogs.recipes["recipe.book"].stationType, "crafting.station", "zonder beroep: een werkplek zonder beroep");
  assert.equal(catalogs.recipes["recipe.book"].learn, "buy");
  assert.equal(catalogs.recipes["recipe.book"].learnPrice, 30);
  const pkg = world.gameProject.zones.packages.find((entry) => (entry.entities || []).some((entity) => entity.entityId === "placed.model.aambeeld"));
  const components = pkg.entities.flatMap((entity) => entity.components || []).filter((component) => component.nodeType === "crafting_station_component");
  const byId = Object.fromEntries(components.map((component) => [component.stationId, component]));
  assert.equal(byId["station.npc.smid"].stationType, "profession.prof.smeden");
  assert.equal(byId["station.npc.kok"].stationType, "crafting.station");
  assert.equal(byId["station.model.model.aambeeld"].stationType, "profession.prof.smeden", "een model als werkplek");
  assert.ok(byId["station.model.model.aambeeld"].clickRadius > 0.4, "het model is aan te klikken");
  // Een recept als questbeloning: de quest-motor leert het je.
  const quest = world.gameProject.campaigns.quests.byId?.["quest.leer"] || world.gameProject.campaigns.quests.items?.find?.((entry) => entry.id === "quest.leer")
    || Object.values(world.gameProject.campaigns.quests).flat().find((entry) => entry && entry.id === "quest.leer");
  const actions = JSON.stringify(quest || {});
  assert.match(actions, /"actionKind":"recipe","recipeRef":"recipe.book"/);
  // Een verkeerde verwijzing naar een beroep houdt de build tegen.
  const broken = compileGameSection([doc("recipe", { recipeId: "recipe.x", displayName: "X", ingredients: [{ ref: "item_definition:item.ore", amount: 1 }], outputItemRef: "item_definition:item.sword",
    professionRef: "profession:bestaat.niet" }, "recipe:recipe.x"), docs[1], docs[2]], {});
  assert.ok(broken.errors.some((error) => error.code === "REF_UNRESOLVED"));
});

test("waar komt een item vandaan: grondstof (met plekken), vijand, winkel, recept en quest", () => {
  const actors = {
    lootTables: { "loot.ore": { entries: [{ itemId: "item.ore", chanceBp: 10000, minQty: 1, maxQty: 1 }] }, "loot.wolf": { entries: [{ lootTableId: "loot.ore" }] } },
    resources: { "resource.copper": { displayName: "Koperader", lootTableId: "loot.ore" } },
    resourceSpawns: [{ resourceId: "resource.copper", xMm: 30000, zMm: 40000 }],
    archetypes: { "actor.wolf": { displayName: "Wolf", lootTableId: "loot.wolf" }, "actor.ghost": { displayName: "Spook", lootTableId: "loot.wolf" } },
    spawns: [{ actorId: "actor.wolf" }]
  };
  const sources = itemSourcesFor(actors, [{ npcId: "npc.smid", displayName: "Smid", shopOffers: [{ itemId: "item.ore" }] }],
    [{ recipeId: "recipe.ore", displayName: "Erts maken", outputItemId: "item.ore" }], [{ questId: "quest.q", displayName: "Q", rewards: [{ itemId: "item.ore" }], steps: [] }]);
  const kinds = sources["item.ore"].map((entry) => entry.kind);
  assert.deepEqual(kinds, ["resource", "enemy", "shop", "recipe", "quest"]);
  assert.deepEqual(sources["item.ore"][0].points, [{ x: 30, z: 40 }]);
  assert.ok(!sources["item.ore"].some((entry) => entry.id === "actor.ghost"), "een vijand die nergens staat telt niet");
});

// ---- de server: maken, leren en verzamelen ----

function setup(options = {}) {
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort()) db.exec(fs.readFileSync("db/migrations/" + file, "utf8"));
  const stamp = new Date().toISOString();
  db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES ('up1', 'anna', 'x', 'x', 'player', ?, ?)").run(stamp, stamp);
  db.prepare("INSERT INTO player_profiles (id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at) VALUES ('p1', 'up1', 'anna', 'class.healer', 'world.main', ?, ?)").run(stamp, stamp);
  const catalogs = {
    items: {
      "item.ore": { id: "item.ore", displayName: "Kopererts", stackable: true, tradable: true, vendorBaseValueMinor: 2, vendorCurrencyRef: "currency.gold" },
      "item.sword": { id: "item.sword", displayName: "Zwaard", stackable: true, tradable: true, vendorBaseValueMinor: 0 }
    },
    currencies: { "currency.gold": { id: "currency.gold", displayName: "Goud" } },
    professions: {
      "prof.smeden": { id: "prof.smeden", displayName: "Smeden", maxLevel: 10, xpPerLevel: 100, sortOrder: 0 },
      "prof.koken": { id: "prof.koken", displayName: "Koken", maxLevel: 10, xpPerLevel: 100, sortOrder: 1 }
    },
    recipes: {
      "recipe.sword": { id: "recipe.sword", displayName: "Zwaard", stationType: "profession.prof.smeden", enabled: true, craftDurationMs: 0,
        ingredients: [{ kind: "item", itemRef: "item.ore", amount: 2, consume: true }], outputItems: [{ itemRef: "item.sword", amount: 1 }], outputCurrencies: [],
        professionId: "prof.smeden", professionLevel: 2, professionXp: 20, learn: "start", learnPrice: 0 },
      "recipe.secret": { id: "recipe.secret", displayName: "Geheim", stationType: "profession.prof.smeden", enabled: true, craftDurationMs: 0,
        ingredients: [{ kind: "item", itemRef: "item.ore", amount: 1, consume: true }], outputItems: [{ itemRef: "item.sword", amount: 1 }], outputCurrencies: [],
        professionId: "prof.smeden", professionLevel: 1, professionXp: 5, learn: "quest", learnPrice: 0 },
      "recipe.book": { id: "recipe.book", displayName: "Boek", stationType: "profession.prof.smeden", enabled: true, craftDurationMs: 0,
        ingredients: [{ kind: "item", itemRef: "item.ore", amount: 1, consume: true }], outputItems: [{ itemRef: "item.sword", amount: 1 }], outputCurrencies: [],
        professionId: "prof.smeden", professionLevel: 1, professionXp: 5, learn: "buy", learnPrice: 30 },
      "recipe.soup": { id: "recipe.soup", displayName: "Soep", stationType: "profession.prof.koken", enabled: true, craftDurationMs: 0,
        ingredients: [{ kind: "item", itemRef: "item.ore", amount: 1, consume: true }], outputItems: [{ itemRef: "item.sword", amount: 1 }], outputCurrencies: [],
        professionId: "prof.koken", professionLevel: 1, professionXp: 5, learn: "start", learnPrice: 0 }
    },
    itemSources: { "item.ore": [{ kind: "resource", id: "resource.copper", name: "Koperader", points: [{ x: 30, z: 40 }] }, { kind: "shop", id: "npc.smid", name: "Smid" }] }
  };
  const project = { catalogs, playerRules: { byType: { economy_rules: [Object.assign({ id: "rules.economy" }, economyValues(Object.assign({ craftCostPct: 0 }, options.money || {})))] } } };
  const node03 = Object.create(Node03RuntimeService.prototype);
  node03.db = db;
  const svc = Object.create(Node05EconomyRuntimeService.prototype);
  svc.db = db;
  svc.node03RuntimeService = node03;
  svc.mmoService = { getConnectionForPlayer: () => null };
  const zonePackage = { entities: [], entityComponents: [
    { nodeType: "crafting_station_component", stationId: "station.npc.smid", stationType: "profession.prof.smeden", professionId: "prof.smeden", recipeRefs: [], range: 1000, x: 0, z: 0 },
    { nodeType: "crafting_station_component", stationId: "station.npc.kok", stationType: "profession.prof.koken", professionId: "prof.koken", recipeRefs: [], range: 1000, x: 0, z: 0 },
    { nodeType: "crafting_station_component", stationId: "station.npc.tafel", stationType: "crafting.station", professionId: null, recipeRefs: [], range: 1000, x: 0, z: 0 }
  ] };
  const ctx = () => ({ profile: { id: "p1" }, worldId: "world.main", zoneId: "zone.start", project, catalogs, zonePackage, position: { x: 0, y: 0, z: 0 } });
  let counter = 0;
  const act = (action, payload = {}) => {
    const opId = "op_" + (counter += 1);
    return runOperation(db, { operationId: opId, playerId: "p1", operationType: action, requestHash: JSON.stringify([action, payload, counter]),
      perform: () => svc.performAction(ctx(), action, payload, opId), buildResponse: (result) => Object.assign({ ok: true, operationId: opId }, result) });
  };
  const give = (itemId, quantity) => node03.grantItem(ctx(), itemId, quantity, "test", null, "op_seed_" + (counter += 1));
  const giveMoney = (amount) => node03.grantCurrency(ctx(), "currency.gold", amount, "test", null, "op_seed_" + (counter += 1));
  const ore = () => node03.ownedItemCount("p1", "item.ore");
  const swords = () => node03.ownedItemCount("p1", "item.sword");
  const money = () => svc.currencyAmount("p1", "currency.gold");
  const station = (id) => svc.buildCraftingSnapshot(ctx()).stations.find((entry) => entry.stationId === id);
  return { db, svc, node03, ctx, act, give, giveMoney, ore, swords, money, station };
}

test("maken: de server weigert verkeerde werkplek, te laag niveau en te weinig materiaal, en er verdwijnt niets", () => {
  const w = setup({ money: { craftCostPct: 0 } });
  w.give("item.ore", 1);
  w.giveMoney(100);
  const before = { ore: w.ore(), money: w.money() };
  // Verkeerde NPC: de kok maakt geen smeedrecepten; een werkplek die niet bestaat valt niet terug op een andere.
  assert.throws(() => w.act("craft", { stationId: "station.npc.kok", recipeId: "recipe.sword" }), /ga naar een werkplek voor Smeden/);
  assert.throws(() => w.act("craft", { stationId: "station.bestaat.niet", recipeId: "recipe.sword" }), /Werkplek niet gevonden/);
  // Te laag niveau (Smeden 1, nodig 2).
  assert.throws(() => w.act("craft", { stationId: "station.npc.smid", recipeId: "recipe.sword" }), /Smeden niveau 2 nodig \(jij: 1\)/);
  assert.deepEqual({ ore: w.ore(), money: w.money() }, before, "na een weigering is alles er nog");
  // Een grijs recept zegt waarom en waar de grondstof ligt (50 m: 30, 40 vanaf 0, 0).
  const grey = w.station("station.npc.smid").recipes.find((recipe) => recipe.recipeId === "recipe.sword");
  assert.equal(grey.canCraft, false);
  assert.match(grey.reasons.join(" "), /Smeden niveau 2 nodig/);
  assert.match(grey.reasons.join(" "), /Nog 1× Kopererts nodig: verzamel Koperader \(50 m hier vandaan\) of te koop bij Smid/);
  // Niveau 2 halen (100 XP), maar nog te weinig erts.
  w.node03.grantProfessionXp(w.ctx(), "prof.smeden", 100, "test");
  assert.throws(() => w.act("craft", { stationId: "station.npc.smid", recipeId: "recipe.sword" }), /Niet genoeg Kopererts \(1\/2\)/);
  assert.equal(w.ore(), 1);
  // Na verzamelen wordt het wit, en maken lukt: erts op, zwaard erbij, beroeps-XP erbij (geen gewone XP).
  w.give("item.ore", 1);
  assert.equal(w.station("station.npc.smid").recipes.find((recipe) => recipe.recipeId === "recipe.sword").canCraft, true);
  const made = w.act("craft", { stationId: "station.npc.smid", recipeId: "recipe.sword" });
  assert.match(made.message, /Zwaard gemaakt\. \+20 Smeden-XP/);
  assert.equal(w.ore(), 0);
  assert.equal(w.swords(), 1);
  assert.equal(w.node03.professionXpOf("p1").get("prof.smeden"), 120);
  assert.equal(w.station("station.npc.smid").profession.level, 2);
});

test("leren: alleen bekende recepten in beeld, kopen bij de werkplek, of van een quest", () => {
  const w = setup();
  const list = () => w.station("station.npc.smid").recipes.map((recipe) => recipe.recipeId).sort();
  // Quest-recept zie je niet; het koop-recept wel, met de knop Leren.
  assert.deepEqual(list(), ["recipe.book", "recipe.sword"]);
  const book = w.station("station.npc.smid").recipes.find((recipe) => recipe.recipeId === "recipe.book");
  assert.equal(book.learnable, true);
  assert.equal(book.learnPrice.amount, 30);
  w.give("item.ore", 5);
  assert.throws(() => w.act("craft", { stationId: "station.npc.smid", recipeId: "recipe.book" }), /Leer dit recept eerst/);
  assert.throws(() => w.act("recipe_learn", { stationId: "station.npc.smid", recipeId: "recipe.book" }), /Te weinig Goud \(0\/30\)/);
  assert.throws(() => w.act("recipe_learn", { stationId: "station.npc.smid", recipeId: "recipe.secret" }), /niet kopen/);
  w.giveMoney(50);
  const learned = w.act("recipe_learn", { stationId: "station.npc.smid", recipeId: "recipe.book" });
  assert.match(learned.message, /Je kent nu Boek/);
  assert.equal(w.money(), 20, "leren kost 30 goud en dat verdwijnt");
  assert.throws(() => w.act("recipe_learn", { stationId: "station.npc.smid", recipeId: "recipe.book" }), /ken je al/);
  w.act("craft", { stationId: "station.npc.smid", recipeId: "recipe.book" });
  // Een quest geeft het geheime recept: dan staat het erbij.
  w.node03.unlockRecipe(w.ctx(), "recipe.secret", "quest");
  assert.deepEqual(list(), ["recipe.book", "recipe.secret", "recipe.sword"]);
  // De HUD stuurt stationId en recipeId mee bij leren.
  const body = node05ActionBody("recipe_learn", { stationId: "station.npc.smid", recipeId: "recipe.book" }, "op");
  assert.equal(body.stationId, "station.npc.smid");
  assert.equal(body.recipeId, "recipe.book");
});

test("beroepen per character: met een grens kun je geen nieuw beroep beginnen, vergeten maakt weer plaats", () => {
  const w = setup({ money: { professionLimit: 1 } });
  w.give("item.ore", 5);
  w.node03.grantProfessionXp(w.ctx(), "prof.smeden", 0, "test");
  assert.throws(() => w.act("craft", { stationId: "station.npc.kok", recipeId: "recipe.soup" }), /Je hebt al 1 beroep \(hooguit 1\)/);
  assert.equal(w.ore(), 5);
  const forgot = w.node03.forgetProfession(w.ctx(), { professionId: "prof.smeden" });
  assert.match(forgot.message, /Je bent Smeden vergeten/);
  const soup = w.act("craft", { stationId: "station.npc.kok", recipeId: "recipe.soup" });
  assert.match(soup.message, /Soep gemaakt\. \+5 Koken-XP/);
  const hud = w.node03.professionsForHud(w.ctx());
  assert.equal(hud.limit, 1);
  assert.equal(hud.learnedCount, 1);
  assert.deepEqual(hud.list.map((entry) => [entry.professionId, entry.learned]), [["prof.smeden", false], ["prof.koken", true]]);
  // Zonder grens (standaard) mag alles.
  const free = setup();
  free.give("item.ore", 5);
  free.node03.grantProfessionXp(free.ctx(), "prof.smeden", 0, "test");
  assert.match(free.act("craft", { stationId: "station.npc.kok", recipeId: "recipe.soup" }).message, /Soep gemaakt/);
});

test("verzamelen: te laag niveau = geweigerd zonder dat de grondstof weg is; daarna beroeps-XP", () => {
  const w = setup();
  let level = 3;
  w.node03.actorRuntime = () => ({
    planGather: ({ operationId }) => ({ plan: { kind: "gather", instanceId: "res.copper.1", resourceId: "resource.copper", x: 0, z: 0, spawnKey: "spawn.copper", occurrence: 1,
      playerId: "p1", claimKey: "res.copper.1|" + operationId, items: [], respawnAtMs: Date.now() + 1000, buildId: null, label: "Koperader", personal: true, eventKey: "res.copper.1:" + operationId,
      profession: { id: "prof.smeden", level, xp: 15 } }, result: null })
  });
  w.node03.questEvents = null;
  assert.throws(() => w.node03.gatherResource(w.ctx(), "res.copper.1", "op_g1"), /Smeden niveau 3 nodig \(jij: 1\)/);
  assert.equal(w.db.prepare("SELECT COUNT(*) AS n FROM actor_loot_claims").get().n, 0, "niets geclaimd");
  level = 1;
  const result = w.node03.gatherResource(w.ctx(), "res.copper.1", "op_g2");
  assert.match(result.message, /Koperader verzameld\. \+15 Smeden-XP/);
  assert.equal(result.profession.learned, true, "de eerste keer leer je het beroep");
  assert.equal(w.node03.professionXpOf("p1").get("prof.smeden"), 15);
});

test("Balans: recepten die nooit te halen zijn, grondstofbronnen, geldlus via een recept en uitrusting per level", () => {
  const docs = [
    doc("project_settings", { maxLevel: 10 }, "project_settings:project"),
    doc("currency", { currencyId: "currency.gold", displayName: "Goud" }, "currency:currency.gold"),
    doc("profession", { professionId: "prof.smeden", displayName: "Smeden", maxLevel: 10 }, "profession:prof.smeden"),
    doc("profession", { professionId: "prof.koken", displayName: "Koken", maxLevel: 5 }, "profession:prof.koken"),
    doc("item_definition", { itemId: "item.ore", displayName: "Kopererts", vendorValue: 1 }, "item_definition:item.ore"),
    doc("item_definition", { itemId: "item.ghost", displayName: "Spookstof" }, "item_definition:item.ghost"),
    doc("item_definition", { itemId: "item.sword", displayName: "Zwaard", vendorValue: 100, equipSlot: "slot.main_hand", requiredLevel: 1 }, "item_definition:item.sword"),
    doc("loot_table", { lootTableId: "loot.ore", displayName: "Erts", entries: [{ itemRef: "item_definition:item.ore", chanceBp: 10000, minQty: 1, maxQty: 1 }] }, "loot_table:loot.ore"),
    doc("resource_definition", { resourceId: "resource.copper", displayName: "Koperader", lootTableRef: "loot_table:loot.ore", professionRef: "profession:prof.smeden", professionLevel: 1, professionXp: 10 }, "resource_definition:resource.copper"),
    doc("npc", { npcId: "npc.smid", displayName: "Smid", crafting: true, craftProfessionRef: "profession:prof.smeden", shopCurrencyRef: "currency:currency.gold",
      shopOffers: [{ ref: "item_definition:item.ore", price: 1, buyBack: 0 }, { ref: "item_definition:item.sword", price: 0, buyBack: 0 }] }, "npc:npc.smid"),
    // Goed recept, maar alles kopen + maken kost 2 + 10 (10 % van 100) en het zwaard levert 100 op: geldlus.
    doc("recipe", { recipeId: "recipe.sword", displayName: "Zwaard", ingredients: [{ ref: "item_definition:item.ore", amount: 2 }], outputItemRef: "item_definition:item.sword",
      professionRef: "profession:prof.smeden", professionLevel: 3, professionXp: 10 }, "recipe:recipe.sword"),
    doc("recipe", { recipeId: "recipe.high", displayName: "Te hoog", ingredients: [{ ref: "item_definition:item.ore", amount: 1 }], outputItemRef: "item_definition:item.ore",
      professionRef: "profession:prof.smeden", professionLevel: 12 }, "recipe:recipe.high"),
    doc("recipe", { recipeId: "recipe.soup", displayName: "Soep", ingredients: [{ ref: "item_definition:item.ghost", amount: 1 }], outputItemRef: "item_definition:item.ore",
      professionRef: "profession:prof.koken", professionLevel: 2, professionXp: 0, learn: "quest" }, "recipe:recipe.soup")
  ];
  const report = balanceReport(docs);
  const codes = (code) => report.findings.filter((finding) => finding.code === code).map((finding) => finding.docKey);
  assert.deepEqual(codes("RECIPE_LEVEL"), ["recipe:recipe.high"]);
  assert.deepEqual(codes("RECIPE_NO_STATION"), ["recipe:recipe.soup"], "Koken heeft geen werkplek");
  assert.deepEqual(codes("RECIPE_NO_QUEST"), ["recipe:recipe.soup"]);
  assert.deepEqual(codes("RECIPE_NO_SOURCE"), ["recipe:recipe.soup"], "Spookstof krijg je nergens");
  assert.deepEqual(codes("PROFESSION_NO_XP"), ["recipe:recipe.soup"], "niemand krijgt Koken-XP");
  assert.ok(codes("MONEY_LOOP").includes("recipe:recipe.sword"), "geldlus via een recept");
  const ore = report.ingredientSources.find((entry) => entry.docKey === "item_definition:item.ore");
  assert.deepEqual(ore.sources, ["🪨 Koperader", "🛒 Smid", "🔨 Te hoog", "🔨 Soep"]);
  const smeden = report.professions.find((entry) => entry.name === "Smeden");
  assert.deepEqual(smeden.stations, ["Smid"]);
  assert.equal(smeden.reachable, 10);
  // Uitrusting per level (stappen van 5 bij hoogste level 10): 1-5 heeft het zwaard (te koop én te maken), 6-10 niets.
  assert.deepEqual(report.gearByLevel.map((range) => [range.from, range.to, range.findCount, range.makeCount]), [[1, 5, 1, 1], [6, 10, 0, 0]]);
  assert.ok(report.findings.some((finding) => finding.code === "GEAR_GAP" && /Level 6-10/.test(finding.message)));
});

test("HUD en editor: grijze recepten met reden, Leren, beroepen bij Uitrusting, Balans-blokken", () => {
  const hud = fs.readFileSync("apps/web/public/game/hud/gk-hud.js", "utf8");
  assert.match(hud, /case "learn-recipe": if \(ui\.craft\) api\.run05\("recipe_learn"/);
  assert.match(hud, /gkCraftWhy/);
  assert.match(hud, /function professionBlock/);
  assert.match(hud, /case "prof-forget": if \(confirmTwice\("prof:" \+ id\)\) api\.run03\("profession_forget"/);
  const game = fs.readFileSync("apps/web/public/game/game.js", "utf8");
  assert.match(game, /professionId: extra\.professionId \|\| null/);
  const editor = fs.readFileSync("apps/web/public/editor/werkbank-docs.js", "utf8");
  assert.match(editor, /"recipe", "profession", "world_flag"/, "Beroep staat in de Bibliotheek");
  assert.match(editor, /Grondstofbronnen/);
  assert.match(editor, /Uitrusting per level/);
});
