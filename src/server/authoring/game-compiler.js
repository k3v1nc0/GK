// Terugbouw zonder nodes: Valuta, Speler, Game-scherm, NPC, Quest, Recept en Model -> buildsectie "game".
// Pure functie: zelfde kaarten -> zelfde sectie. Zonder zulke kaarten geen sectie (oudere builds blijven bytegelijk).
// De wereldbouwer (world-builder.js) maakt hier de catalogus, NPC's, quests, winkels en de HUD van.
import { CANONICAL_KINDS } from "../../shared/authoring/kinds.js";
import { networkValues } from "../../shared/authoring/kinds/network.js";
import { waterWalkValues } from "../../shared/authoring/kinds/water-walk.js";
import { partyValues } from "../../shared/authoring/kinds/party.js";
import { chatValues } from "../../shared/authoring/kinds/chat.js";
import { hasOwnSteps, questGraphIssues, questStartIssues, questStartMode, questSteps } from "../../../apps/web/public/shared/quest-graph.js";
import { areaPointsMeters, areaSoort } from "../../shared/authoring/kinds/area.js";

export const GAME_SECTION_VERSION = "gk-game-1";
export const GAME_DOC_KINDS = Object.freeze(["currency", "player_class", "hud_settings", "combat_settings", "network_settings", "water_walk_settings", "party_settings", "chat_settings", "npc", "quest", "recipe", "placed_model"]);

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
      healthRegenBp: values.healthRegenBp, manaRegenBp: values.manaRegenBp,
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
  // Healing (2-11): regels voor regeneratie, effecten, respawn en level omhoog.
  const combat = settingsValues("combat_settings", of("combat_settings")[0]?.body || null);
  // Verbinding (3-11): alleen als de kaart er is; anders houden game en server hun eigen standaard.
  const networkDoc = of("network_settings")[0] || null;
  const network = networkDoc ? networkValues(networkDoc.body) : null;
  // Water (lopen) (3-11): alleen als de kaart er is; anders de standaard van de loopregels.
  const waterWalkDoc = of("water_walk_settings")[0] || null;
  const waterWalk = waterWalkDoc ? waterWalkValues(waterWalkDoc.body) : null;
  // Groep (MMO) (3-11): alleen als de kaart er is; anders de standaard (wereldbouwer).
  const partyDoc = of("party_settings")[0] || null;
  const party = partyDoc ? partyValues(partyDoc.body) : null;
  const chatDoc = of("chat_settings")[0] || null;
  const chat = chatDoc ? chatValues(chatDoc.body) : null;

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
  // Quest Builder stap 1: de quest-check (zelfde regels als in de Quest Builder) houdt een onspeelbare quest tegen.
  // Een gebied in een quest moet een Questgebied zijn (geen pad of bos).
  const refExists = (ref) => { const target = byKey.get(ref); return Boolean(target) && target.kind === kindOfRef(ref) && (target.kind !== "area" || areaSoort(target.body) === "questgebied"); };
  const refLabel = (ref) => { const target = byKey.get(ref); return target?.body?.displayName || ref; };
  for (const doc of questDocs) {
    const label = "Quest " + doc.body.displayName;
    // Stap 4: hoe start hij en kloppen de voorwaarden (de NPC alleen als de quest bij een NPC start).
    needRef(doc, doc.body.previousQuestRef, label);
    for (const found of questStartIssues(doc.body, { refExists, refLabel, selfRef: doc.docKey, maxLevel: projectValues.maxLevel })) {
      fail(doc, "QUEST_START", label + ": " + found.message);
    }
    needRows(doc, doc.body.rewards, label + " (beloning)");
    if (hasOwnSteps(doc.body)) {
      const titles = new Map(doc.body.steps.map((step, index) => [step.stepId, step.title || String(index + 1)]));
      for (const found of questGraphIssues(doc.body.steps, { refExists, refLabel })) {
        fail(doc, "QUEST_CHECK", label + (found.stepId ? ", stap '" + (titles.get(found.stepId) || found.stepId) + "'" : "") + ": " + found.message);
      }
      continue;
    }
    for (const field of ["targetNpcRef", "itemRef"]) needRef(doc, doc.body[field], label);
    const goal = doc.body.goal || "deliver";
    if (goal === "deliver" && !doc.body.itemRef) fail(doc, "QUEST_ITEM", label + ": kies welk item de speler moet brengen.");
    if (goal === "visit" && !doc.body.targetNpcRef) fail(doc, "QUEST_TARGET", label + ": kies in de Quest Builder (🪜 Stappen) bij 🏁 Inleveren bij naar welke NPC de speler moet gaan.");
    if (goal === "visit" && doc.body.targetNpcRef && doc.body.targetNpcRef === doc.body.giverRef) fail(doc, "QUEST_SAME_NPC", label + ": 'Ga naar iemand' moet een andere NPC zijn dan wie de quest geeft.");
    // Snelle quest die niet bij een NPC start: dan is er geen 'wie gaf hem' om in te leveren.
    if (goal === "deliver" && questStartMode(doc.body) !== "npc" && !doc.body.targetNpcRef) fail(doc, "QUEST_TARGET", label + ": kies in de Quest Builder (🪜 Stappen) bij 🏁 Inleveren bij wie de speler inlevert.");
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
  // Stap 4: start en voorwaarden met ID's. Een NPC geeft de quest alleen als hij bij een NPC start.
  const startOf = (body) => {
    const mode = questStartMode(body);
    const start = body.start || {};
    const rules = (Array.isArray(start.rules) ? start.rules : []).map((rule) => (rule.type === "level"
      ? { type: "level", min: Number.isInteger(rule.min) ? rule.min : 1 }
      : Object.assign({ type: rule.type, id: idFromRef(rule.ref) }, rule.type === "item" ? { amount: Number.isInteger(rule.amount) ? rule.amount : 1 } : {})));
    return { startMode: mode, startItemId: mode === "item" ? idFromRef(start.itemRef) : null, startAreaId: mode === "area" ? idFromRef(start.areaRef) : null,
      requirements: { match: start.match === "any" ? "any" : "all", rules } };
  };
  const quests = questDocs.map((doc) => Object.assign({
    questId: doc.body.questId, displayName: doc.body.displayName, description: doc.body.description || "",
    goal: doc.body.goal || "deliver", giverNpcId: questStartMode(doc.body) === "npc" && doc.body.giverRef ? idFromRef(doc.body.giverRef) : null,
    targetNpcId: doc.body.targetNpcRef ? idFromRef(doc.body.targetNpcRef) : null,
    itemId: doc.body.itemRef ? idFromRef(doc.body.itemRef) : null, amount: doc.body.amount || 1,
    rewards: grants(doc.body.rewards), rewardXp: Number.isInteger(doc.body.rewardXp) ? doc.body.rewardXp : 0,
    previousQuestId: doc.body.previousQuestRef ? idFromRef(doc.body.previousQuestRef) : null,
    repeatable: doc.body.repeatable === true,
    partyLeave: doc.body.partyLeave === "wait" || doc.body.partyLeave === "fail" ? doc.body.partyLeave : "keep",
    // Quest Builder stap 1: de stappen (of de snelle quest omgezet naar 1 stap + einde), met ID's in plaats van verwijzingen.
    steps: questSteps(doc.body).map((step) => ({
      stepId: step.stepId, kind: step.kind, title: step.title || "", text: step.text || "", match: step.match === "any" ? "any" : "all",
      next: (Array.isArray(step.next) ? step.next : []).map((link) => link.to),
      objectives: (Array.isArray(step.objectives) ? step.objectives : []).map((objective) => ({
        objectiveId: objective.objectiveId, type: objective.type, targetId: objective.ref ? idFromRef(objective.ref) : null,
        npcId: objective.npcRef ? idFromRef(objective.npcRef) : null, amount: Number.isInteger(objective.amount) ? objective.amount : 1,
        role: objective.role || "required", share: objective.share === "team" ? "team" : "personal",
        credit: objective.credit === "fighters" || objective.credit === "nearby" ? objective.credit : "group",
        ...(objective.areaRef ? { areaId: idFromRef(objective.areaRef) } : {}),
        // Kevin 5-11: ⭐ op de kaart waar de vijand (of grondstof) nu is.
        ...(objective.mark === "star" ? { mark: "star" } : {})
      })),
      // Stap 3: het gebied van deze stap op de kaart (zoekgebied, punt of verborgen).
      ...(step.mapRef ? { mapAreaId: idFromRef(step.mapRef), mapShow: ["point", "hidden"].includes(step.mapShow) ? step.mapShow : "area" } : {})
    }))
  }, startOf(doc.body)));
  // Stap 3: Questgebieden (Area tool) in meters, voor de quest-motor (ga naar, verlaat, alleen hier tellen, zoekgebied).
  const questAreas = active.filter((doc) => doc.kind === "area" && areaSoort(doc.body) === "questgebied")
    .sort((a, b) => a.docKey.localeCompare(b.docKey))
    .map((doc) => ({ areaId: doc.body.areaId, displayName: doc.body.displayName, points: areaPointsMeters(doc.body) }));

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
    server: Object.assign({ schema: GAME_SECTION_VERSION, currencies, player, hud, combat, network, waterWalk, party, chat, npcs, quests, recipes, placedModels },
      questAreas.length ? { questAreas } : {}),
    errors
  };
}
