// Terugbouw zonder nodes: Valuta, Speler, Game-scherm, NPC (winkel/crafting), Quest, Recept en Model
// -> build -> spelwereld. Bewijst dat de spelregels uit kaarten komen en dat foute kaarten publiceren tegenhouden.
import test from "node:test";
import assert from "node:assert/strict";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { compileCanonical } from "../src/server/authoring/build-service.js";
import { buildRuntimeWorld, PLAYER_CHARACTER_ID, PLAYER_STAT_BLOCK_ID, WORLD_ZONE_ID } from "../src/server/authoring/world-builder.js";

const doc = (kind, key, body) => {
  const check = validateDocument(kind, body);
  assert.equal(check.ok, true, kind + " " + key + ": " + JSON.stringify(check.issues || check));
  return { docKey: key, kind, body, archived: false, revision: 1 };
};
const item = (id, name, extra = {}) => doc("item_definition", "item_definition:" + id, Object.assign({ itemId: id, displayName: name, category: "material", rarity: "common", stackable: true, stackLimit: 99 }, extra));

function gameDocs() {
  return [
    item("item.hout", "Hout"),
    item("item.plank", "Plank"),
    item("item.zwaard", "Zwaard", { category: "equipment", stackable: false, stackLimit: 1, equipSlot: "equipment_slot.main_hand", attackPowerBonus: 5 }),
    doc("currency", "currency:currency.goud", { currencyId: "currency.goud", displayName: "Goud" }),
    doc("project_settings", "project_settings", { gameName: "GK", xpPerLevel: 200, maxLevel: 20 }),
    doc("player_class", "player_class:class.held", { classId: "class.held", displayName: "Held", healthMax: 150, attackPower: 12, armor: 3,
      startItems: [{ ref: "currency:currency.goud", amount: 25 }, { ref: "item_definition:item.hout", amount: 2 }] }),
    doc("hud_settings", "hud_settings", { showBag: false }),
    doc("npc", "npc:npc.smid", { npcId: "npc.smid", displayName: "Smid", greeting: "Welkom!", x: 4, y: 0, z: 4, rotationY: 90,
      shopOffers: [{ ref: "item_definition:item.zwaard", price: 10, buyBack: 0 }, { ref: "item_definition:item.hout", price: 1, buyBack: 1 }],
      shopCurrencyRef: "currency:currency.goud", crafting: true }),
    doc("npc", "npc:npc.boer", { npcId: "npc.boer", displayName: "Boer", x: -4, y: 0, z: 4 }),
    doc("quest", "quest:quest.hout", { questId: "quest.hout", displayName: "Hout halen", giverRef: "npc:npc.boer", goal: "deliver",
      itemRef: "item_definition:item.hout", amount: 2, rewards: [{ ref: "currency:currency.goud", amount: 5 }, { ref: "item_definition:item.plank", amount: 1 }], rewardXp: 40 }),
    doc("quest", "quest:quest.smid", { questId: "quest.smid", displayName: "Naar de smid", giverRef: "npc:npc.boer", goal: "visit",
      targetNpcRef: "npc:npc.smid", previousQuestRef: "quest:quest.hout", rewardXp: 10 }),
    doc("recipe", "recipe:recipe.plank", { recipeId: "recipe.plank", displayName: "Plank zagen", ingredients: [{ ref: "item_definition:item.hout", amount: 2 }],
      outputItemRef: "item_definition:item.plank", outputAmount: 1, craftSeconds: 0 }),
    doc("placed_model", "placed_model:model.boom_1", { placedModelId: "model.boom_1", displayName: "Boom", modelAssetId: "asset.boom", x: 1, y: 0, z: -3, scale: 2, rotationY: 45, solid: true })
  ];
}

function compile(docs) {
  const compiled = compileCanonical(docs, {});
  return { compiled, data: compiled.files?.["server.json"] ? JSON.parse(compiled.files["server.json"].text) : null };
}

test("spelregels uit kaarten: speler, valuta, winkel, crafting, quests, HUD en modellen", () => {
  const { compiled, data } = compile(gameDocs());
  assert.deepEqual(compiled.errors, []);
  const world = buildRuntimeWorld(data);
  const catalogs = world.gameProject.catalogs;

  // Speler: levens, kracht, pantser, XP per level en start-spullen.
  const character = catalogs.playableCharacters["class.held"];
  const block = catalogs.statBlocks[character.statBlockRef].entries.map((entry) => entry.baseValue);
  assert.deepEqual(block, [150, 12, 3, 5], "levens, kracht, pantser en heal-kracht (standaard 5)");
  assert.deepEqual(character.startingCurrencyGrants, [{ currencyRef: "currency.goud", amountMinor: 25 }]);
  assert.deepEqual(character.startingItemGrants, [{ itemRef: "item.hout", amount: 2 }]);
  const rules = world.gameProject.playerRules.byType.player_progression_rules[0];
  assert.equal(rules.maxLevel, 20);
  assert.equal(catalogs.statCurves[rules.xpCurveRef].points[1].y, 200);

  // Valuta en winkel.
  assert.equal(catalogs.currencies["currency.goud"].displayName, "Goud");
  const offers = catalogs.vendorCatalogs["vendor_catalog.npc.smid"].offers;
  assert.deepEqual(offers.map((offer) => [offer.itemRef, offer.mode, offer.sellPriceMinor]), [["item.zwaard", "sell_to_player", 10], ["item.hout", "both", 1]]);
  assert.equal(catalogs.vendorCatalogs["vendor_catalog.npc.boer"], undefined, "geen winkel zonder aanbod");

  // Crafting.
  const recipe = catalogs.recipes["recipe.plank"];
  assert.deepEqual(recipe.ingredients, [{ kind: "item", itemRef: "item.hout", amount: 2, consume: true }]);
  assert.deepEqual(recipe.outputItems, [{ itemRef: "item.plank", amount: 1 }]);

  // NPC's staan in de ene wereld met praten, winkel en/of werkbank.
  const zone = world.gameProject.zones.byId[WORLD_ZONE_ID];
  const smid = zone.entities.find((entity) => entity.entityId === "npc_entity.npc.smid");
  assert.deepEqual(smid.components.map((component) => component.nodeType), ["npc_component", "vendor_component", "crafting_station_component"]);
  assert.equal(zone.questTargets.find((target) => target.targetId.endsWith("npc.smid")).linkedEntity.entityId, "npc_entity.npc.smid");
  assert.ok(world.entities.some((entity) => entity.id === "placed.model.boom_1"), "los model staat in de wereld");

  // Quests: inleveren met item- en geldbeloning; de tweede komt pas na de eerste.
  const quests = world.gameProject.campaigns.quests.byId;
  assert.equal(quests["quest.hout"].steps[0].stepType, "deliver");
  assert.deepEqual(quests["quest.hout"].rewards.map((reward) => reward.actionKind), ["xp", "currency", "item"]);
  assert.equal(quests["quest.smid"].steps[0].stepType, "reach");
  assert.deepEqual(quests["quest.smid"].prerequisiteQuestRefs, ["quest.hout"]);
  const boerGesprek = world.gameProject.campaigns.dialogues.byId["dialogue.npc.npc.boer"];
  assert.ok(boerGesprek.entriesById[boerGesprek.startEntryRef].choices.some((choice) => choice.nextEntryRef === "entry.offer.quest.hout"));
  const smidGesprek = world.gameProject.campaigns.dialogues.byId["dialogue.npc.npc.smid"];
  assert.ok(smidGesprek.entriesById[smidGesprek.startEntryRef].choices.some((choice) => choice.action === "complete_quest" && choice.questRef === "quest.smid"));

  // Game-scherm: tas uit, winkel en werkbank-venster aan (er is een smid), terugkomen altijd aan.
  const hud = world.gameProject.ui.modules.map((module) => module.nodeType);
  assert.equal(hud.includes("inventory_hud"), false);
  for (const type of ["hud_bar", "xp_hud", "wallet_hud", "vendor_hud", "crafting_hud", "death_respawn_hud", "dialogue_hud"]) assert.ok(hud.includes(type), type + " staat aan");
});

test("in de editor-view hebben NPC's en modellen een kaart-ID (klikken = kaart open)", () => {
  const { data } = compile(gameDocs());
  const world = buildRuntimeWorld(data, { editor: true });
  const ids = world.entities.map((entity) => entity.id);
  assert.ok(ids.includes("doc:npc:npc.smid"));
  assert.ok(ids.includes("doc:placed_model:model.boom_1"));
});

test("foute kaarten houden publiceren tegen met een duidelijke melding", () => {
  const base = gameDocs();
  const without = (key) => base.filter((entry) => entry.docKey !== key);
  const swap = (key, patch) => base.map((entry) => (entry.docKey === key ? Object.assign({}, entry, { body: Object.assign({}, entry.body, patch) }) : entry));
  const codes = (docs) => compile(docs).compiled.errors.map((error) => error.code);
  assert.ok(codes(without("currency:currency.goud")).includes("REF_UNRESOLVED"), "winkel/beloning naar weggehaalde valuta");
  assert.ok(codes(swap("npc:npc.smid", { shopCurrencyRef: null })).includes("SHOP_CURRENCY"));
  assert.ok(codes(swap("quest:quest.hout", { itemRef: null })).includes("QUEST_ITEM"));
  assert.ok(codes(swap("quest:quest.smid", { targetNpcRef: null })).includes("QUEST_TARGET"));
  assert.ok(codes(swap("quest:quest.smid", { targetNpcRef: "npc:npc.boer" })).includes("QUEST_SAME_NPC"));
  assert.ok(codes(swap("quest:quest.hout", { previousQuestRef: "quest:quest.smid" })).includes("QUEST_CYCLE"));
});

test("zonder spelkaarten blijft de wereld speelbaar (standaard speler en HUD)", () => {
  const world = buildRuntimeWorld({});
  const catalogs = world.gameProject.catalogs;
  assert.ok(catalogs.statBlocks[PLAYER_STAT_BLOCK_ID].entries[0].baseValue > 0);
  assert.ok(world.gameProject.ui.modules.some((module) => module.nodeType === "death_respawn_hud"));
  assert.equal(world.gameProject.ui.modules.some((module) => module.nodeType === "vendor_hud"), false, "geen winkelvenster zonder winkel");
});

test("praat-afstand komt uit de NPC-kaart; het klikvlak blijft klein", () => {
  const docs = gameDocs().map((entry) => (entry.docKey === "npc:npc.boer" ? Object.assign({}, entry, { body: Object.assign({}, entry.body, { talkRange: 4 }) }) : entry));
  const { data } = compile(docs);
  const zone = buildRuntimeWorld(data).gameProject.zones.byId[WORLD_ZONE_ID];
  const target = (npcId) => zone.questTargets.find((entry) => entry.targetId === "target.npc." + npcId);
  assert.equal(target("npc.boer").radius, 4);
  assert.equal(target("npc.smid").radius, 2.5, "standaard 2,5 m");
  assert.equal(target("npc.smid").clickRadius, 1.2);
  const smid = zone.entities.find((entity) => entity.entityId === "npc_entity.npc.smid");
  assert.equal(smid.components.find((component) => component.nodeType === "vendor_component").range, 3);
});
