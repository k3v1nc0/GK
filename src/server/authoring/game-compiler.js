// Terugbouw zonder nodes: Valuta, Speler, Game-scherm, NPC, Quest, Recept en Model -> buildsectie "game".
// Pure functie: zelfde kaarten -> zelfde sectie. Zonder zulke kaarten geen sectie (oudere builds blijven bytegelijk).
// De wereldbouwer (world-builder.js) maakt hier de catalogus, NPC's, quests, winkels en de HUD van.
import { CANONICAL_KINDS } from "../../shared/authoring/kinds.js";

export const GAME_SECTION_VERSION = "gk-game-1";
export const GAME_DOC_KINDS = Object.freeze(["currency", "player_class", "hud_settings", "npc", "quest", "recipe", "placed_model"]);

const idFromRef = (ref) => String(ref || "").replace(/^[a-z_]+:/, "");
const kindOfRef = (ref) => String(ref || "").split(":")[0];

// Waarden van een instellingenkaart, aangevuld met de schema-standaard (ook zonder kaart).
export function settingsValues(kind, body = null) {
  const values = {};
  for (const [key, field] of Object.entries(CANONICAL_KINDS[kind].fields)) {
    const value = body ? body[key] : undefined;
    values[key] = value === undefined || value === null || value === "" ? field.default : value;
  }
  return values;
}

// Regels { ref, amount } -> { itemId | currencyId, amount }.
function grants(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => (kindOfRef(row.ref) === "currency"
    ? { currencyId: idFromRef(row.ref), amount: row.amount }
    : { itemId: idFromRef(row.ref), amount: row.amount }));
}

// options.assetInfo: Map assetId -> { assetType } (zonder: geen assetcontrole).
export function compileGameSection(documents, options = {}) {
  const active = documents.filter((doc) => !doc.archived);
  const gameDocs = active.filter((doc) => GAME_DOC_KINDS.includes(doc.kind)).sort((a, b) => a.docKey.localeCompare(b.docKey));
  if (!gameDocs.length) return null;
  const errors = [];
  const byKey = new Map(active.map((doc) => [doc.docKey, doc]));
  const of = (kind) => gameDocs.filter((doc) => doc.kind === kind);
  const fail = (doc, code, message) => errors.push({ code, docKey: doc.docKey, message });
  const needRef = (doc, ref, label) => {
    if (!ref) return;
    const target = byKey.get(ref);
    if (!target || target.kind !== kindOfRef(ref)) fail(doc, "REF_UNRESOLVED", label + " wijst naar " + ref + ", maar die bestaat niet (meer).");
  };
  const needRows = (doc, rows, label) => { for (const row of Array.isArray(rows) ? rows : []) needRef(doc, row.ref, label); };
  const assetInfo = options.assetInfo || null;
  const needAsset = (doc, assetId, types, label) => {
    if (!assetId || !assetInfo) return;
    const info = assetInfo.get(assetId);
    if (!info) fail(doc, "ASSET_UNKNOWN", label + " gebruikt onbekend asset " + assetId);
    else if (!types.includes(info.assetType)) fail(doc, "ASSET_TYPE", label + ": " + assetId + " is geen " + types.join("/"));
  };

  const currencies = {};
  for (const doc of of("currency")) {
    needAsset(doc, doc.body.iconAssetId, ["image", "texture"], "Valuta " + doc.body.displayName);
    currencies[doc.body.currencyId] = { currencyId: doc.body.currencyId, displayName: doc.body.displayName, iconAssetId: doc.body.iconAssetId || null };
  }

  // Klassen: elke klasse een eigen character. De levelregels staan op de kaart Project en gelden voor alle klassen.
  const projectValues = settingsValues("project_settings", active.find((doc) => doc.kind === "project_settings")?.body || null);
  const classValues = (body) => {
    const values = settingsValues("player_class", body);
    return { classId: values.classId, displayName: values.displayName, description: values.description || "",
      healthMax: values.healthMax, attackPower: values.attackPower, armor: values.armor, healPower: values.healPower, manaMax: values.manaMax,
      startGrants: grants(values.startItems), models: Array.isArray(values.models) ? values.models.slice() : [] };
  };
  const classDocs = of("player_class").slice().sort((a, b) => String(a.body.displayName).localeCompare(String(b.body.displayName)) || a.docKey.localeCompare(b.docKey));
  const classes = classDocs.map((doc) => {
    const label = "Klasse " + doc.body.displayName;
    needRows(doc, doc.body.startItems, label + " (start-spullen)");
    for (const assetId of Array.isArray(doc.body.models) ? doc.body.models : []) needAsset(doc, assetId, ["model"], label + " (uiterlijk)");
    return classValues(doc.body);
  });
  const player = Object.assign(classValues(null), { xpPerLevel: projectValues.xpPerLevel, maxLevel: projectValues.maxLevel });
  if (classes.length) player.classes = classes;

  const hud = settingsValues("hud_settings", of("hud_settings")[0]?.body || null);

  const npcs = of("npc").map((doc) => {
    const label = "NPC " + doc.body.displayName;
    needAsset(doc, doc.body.modelAssetId, ["model"], label);
    needRows(doc, doc.body.shopOffers, label + " (winkel)");
    needRef(doc, doc.body.shopCurrencyRef, label + " (betalen met)");
    const offers = Array.isArray(doc.body.shopOffers) ? doc.body.shopOffers : [];
    if (offers.length && !doc.body.shopCurrencyRef) fail(doc, "SHOP_CURRENCY", label + " verkoopt iets maar heeft geen valuta: sleep er een op 'Betalen met'.");
    return {
      npcId: doc.body.npcId, displayName: doc.body.displayName, modelAssetId: doc.body.modelAssetId || null,
      modelScaleBp: doc.body.modelScaleBp || 10000, idleClip: doc.body.idleClip || null, greeting: doc.body.greeting || "",
      x: doc.body.x, y: Number(doc.body.y) || 0, z: doc.body.z, rotationY: Number(doc.body.rotationY) || 0,
      crafting: doc.body.crafting === true, talkRange: Number(doc.body.talkRange) > 0 ? Number(doc.body.talkRange) : 2.5,
      shopCurrencyId: doc.body.shopCurrencyRef ? idFromRef(doc.body.shopCurrencyRef) : null,
      shopOffers: offers.map((row) => ({ itemId: idFromRef(row.ref), price: row.price, buyBack: row.buyBack }))
    };
  });

  const questDocs = of("quest");
  for (const doc of questDocs) {
    const label = "Quest " + doc.body.displayName;
    for (const field of ["giverRef", "targetNpcRef", "itemRef", "previousQuestRef"]) needRef(doc, doc.body[field], label);
    needRows(doc, doc.body.rewards, label + " (beloning)");
    const goal = doc.body.goal || "deliver";
    if (goal === "deliver" && !doc.body.itemRef) fail(doc, "QUEST_ITEM", label + ": kies welk item de speler moet brengen.");
    if (goal === "visit" && !doc.body.targetNpcRef) fail(doc, "QUEST_TARGET", label + ": kies onder ⚙️ meer naar welke NPC de speler moet gaan (Inleveren bij).");
    if (goal === "visit" && doc.body.targetNpcRef && doc.body.targetNpcRef === doc.body.giverRef) fail(doc, "QUEST_SAME_NPC", label + ": 'Ga naar iemand' moet een andere NPC zijn dan wie de quest geeft.");
  }
  // Een kring van "Pas na quest" maakt quests onbereikbaar.
  const previous = new Map(questDocs.map((doc) => [doc.docKey, doc.body.previousQuestRef || null]));
  for (const doc of questDocs) {
    const seen = new Set([doc.docKey]);
    for (let ref = previous.get(doc.docKey); ref; ref = previous.get(ref)) {
      if (seen.has(ref)) { fail(doc, "QUEST_CYCLE", "Quest " + doc.body.displayName + ": 'Pas na quest' maakt een kring; deze quest komt dan nooit."); break; }
      seen.add(ref);
    }
  }
  const quests = questDocs.map((doc) => ({
    questId: doc.body.questId, displayName: doc.body.displayName, description: doc.body.description || "",
    goal: doc.body.goal || "deliver", giverNpcId: idFromRef(doc.body.giverRef),
    targetNpcId: doc.body.targetNpcRef ? idFromRef(doc.body.targetNpcRef) : null,
    itemId: doc.body.itemRef ? idFromRef(doc.body.itemRef) : null, amount: doc.body.amount || 1,
    rewards: grants(doc.body.rewards), rewardXp: Number.isInteger(doc.body.rewardXp) ? doc.body.rewardXp : 0,
    previousQuestId: doc.body.previousQuestRef ? idFromRef(doc.body.previousQuestRef) : null,
    repeatable: doc.body.repeatable === true
  }));

  const recipes = of("recipe").map((doc) => {
    const label = "Recept " + doc.body.displayName;
    needRows(doc, doc.body.ingredients, label);
    needRef(doc, doc.body.outputItemRef, label);
    return {
      recipeId: doc.body.recipeId, displayName: doc.body.displayName,
      ingredients: grants(doc.body.ingredients), outputItemId: idFromRef(doc.body.outputItemRef),
      outputAmount: doc.body.outputAmount || 1, craftSeconds: doc.body.craftSeconds || 0
    };
  });
  const placedModels = of("placed_model").map((doc) => {
    needAsset(doc, doc.body.modelAssetId, ["model"], "Model " + doc.body.displayName);
    return {
      placedModelId: doc.body.placedModelId, displayName: doc.body.displayName, modelAssetId: doc.body.modelAssetId,
      scale: Number(doc.body.scale) || 1, rotationY: Number(doc.body.rotationY) || 0, solid: doc.body.solid === true,
      collisionRadius: Number(doc.body.collisionRadius) || 1, idleClip: doc.body.idleClip || null,
      x: doc.body.x, y: Number(doc.body.y) || 0, z: doc.body.z
    };
  });

  return {
    server: { schema: GAME_SECTION_VERSION, currencies, player, hud, npcs, quests, recipes, placedModels },
    errors
  };
}
