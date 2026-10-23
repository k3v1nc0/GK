import { normalizeCanonicalId, normalizeReferenceList } from "../shared/node-contract.js";

// Visual Content Workbench W3: one declarative content spec plus a light derived
// relation index. These helpers read an ordinary persistent graph and return
// plain data. They own no UI state, never write the graph and never infer a
// relation from a name, tag or id prefix: every relation is a typed schema field
// or a real child-node edge that the catalog compiler emits. A relation or field
// marked inactive is compiled but not read by a runtime service (audited against
// node03/node05 runtime, world-runtime and game.js for W2).

const SEP = "\u0000";

export const WORKBENCH_CATEGORIES = Object.freeze([
  { id: "all", label: "Alles" },
  { id: "npc", label: "NPC's", type: "npc_archetype" },
  { id: "enemy", label: "Enemies", type: "enemy_archetype" },
  { id: "resource", label: "Resources", type: "resource_definition" },
  { id: "item", label: "Items", type: "item_definition" },
  { id: "recipe", label: "Recipes", type: "recipe_definition" },
  { id: "vendor", label: "Vendor Catalogs", type: "vendor_catalog" },
  { id: "ability", label: "Abilities", type: "ability_definition" },
  { id: "stat", label: "Stats", types: ["stat_definition", "stat_block", "stat_curve"] },
  { id: "currency", label: "Currencies", type: "currency_definition" },
  { id: "loot", label: "Loot Tables", type: "loot_table" },
  { id: "quest", label: "Quests", type: "quest_definition" },
  { id: "dialogue", label: "Dialogen", type: "dialogue_definition" }
]);

export const ASSET_ROLE_LABELS = Object.freeze({
  iconAssetId: "Icoon",
  modelAssetId: "3D-model",
  worldModelAssetId: "Wereldmodel",
  previewModelAssetId: "Previewmodel",
  depletedModelAssetId: "Model na oogsten"
});

// Relation kinds. outLabel is shown on the target card when the owner is
// selected; inLabel on the owner card when the target is selected.
export const RELATION_KINDS = Object.freeze({
  enemy_loot: { outLabel: "loot", inLabel: "gebruikt deze loot", active: true },
  enemy_stats: { outLabel: "stat", inLabel: "heeft deze stat", active: true },
  enemy_ability: { outLabel: "ability", inLabel: "gebruikt deze ability", active: false },
  resource_yield: { outLabel: "opbrengst", inLabel: "levert dit op", active: true },
  resource_loot: { outLabel: "oogst-loot", inLabel: "oogst-loot van", active: true },
  resource_ability: { outLabel: "vereiste ability", inLabel: "vereist deze ability", active: true },
  resource_skill: { outLabel: "vereiste skill", inLabel: "vereist deze stat", active: false },
  item_currency: { outLabel: "vendorvaluta", inLabel: "vendorvaluta van", active: true },
  ability_cost: { outLabel: "kosten-stat", inLabel: "kost deze stat", active: false },
  recipe_ingredient: { outLabel: "ingrediënt", inLabel: "vraagt dit als ingrediënt", active: true },
  recipe_output: { outLabel: "output", inLabel: "maakt dit", active: true },
  vendor_offer: { outLabel: "aanbod", inLabel: "verhandelt dit", active: true },
  vendor_price: { outLabel: "prijs-currency", inLabel: "rekent in deze currency", active: true },
  loot_drop: { outLabel: "drop", inLabel: "dropt dit", active: true },
  loot_nested: { outLabel: "geneste tabel", inLabel: "bevat deze tabel", active: false },
  stat_block_stat: { outLabel: "statregel", inLabel: "gebruikt in Stat Block", active: true },
  quest_item: { outLabel: "questitem", inLabel: "gebruikt door quest", active: true },
  quest_currency: { outLabel: "currencyreward", inLabel: "reward van quest", active: true },
  quest_ability: { outLabel: "abilityreward", inLabel: "reward van quest", active: true },
  quest_dialogue: { outLabel: "startdialoog", inLabel: "start deze quest", active: true },
  quest_quest: { outLabel: "questrelatie", inLabel: "gerelateerde quest", active: true },
  dialogue_quest: { outLabel: "questactie", inLabel: "gekoppeld vanuit dialoog", active: true },
  quest_npc: { outLabel: "NPC / target", inLabel: "questrelatie", active: true },
  dialogue_npc: { outLabel: "spreker", inLabel: "heeft dialoog", active: true }
});

export const OPTION_LABELS = Object.freeze({
  "item_definition.category": { material: "Materiaal", consumable: "Verbruiksitem", equipment: "Uitrusting", quest: "Questitem", misc: "Overig", custom: "Eigen categorie" },
  "item_definition.rarity": { common: "Gewoon", uncommon: "Ongewoon", rare: "Zeldzaam", epic: "Episch", legendary: "Legendarisch", quest: "Quest", custom: "Eigen" },
  "npc_archetype.role": { civilian: "Burger", quest_giver: "Questgever", vendor: "Handelaar", trainer: "Trainer", guard: "Wacht", companion: "Metgezel", craftsman: "Ambachtsman", custom: "Eigen rol" },
  "enemy_archetype.role": { normal: "Normaal", ranged: "Afstand", healer: "Healer", tank: "Tank", elite: "Elite", boss: "Boss", ambient: "Omgeving" },
  "ability_definition.abilityType": { basic_attack: "Basisaanval", melee: "Melee", ranged: "Afstand", spell: "Spreuk", heal: "Heal", buff: "Buff", debuff: "Debuff", movement: "Beweging", passive: "Passief", gather: "Oogsten" },
  "stat_definition.valueType": { integer: "Geheel getal", decimal: "Decimaal", percent: "Percentage" },
  "quest_definition.questType": { main: "Hoofdquest", side: "Zijquest", tutorial: "Tutorial", daily: "Dagelijks", event: "Event" },
  "quest_definition.repeatMode": { once_per_character: "Eenmaal per personage", repeatable: "Herhaalbaar", daily: "Dagelijks", weekly: "Wekelijks", event_window: "Eventvenster" },
  "recipe_definition.unlockMode": { default_available: "Direct beschikbaar", player_unlock_required: "Speler moet ontgrendelen" },
  "recipe_ingredient.kind": { item: "Item", currency: "Currency", item_tag: "Item-tags" },
  "vendor_offer.mode": { sell_to_player: "Verkoopt aan speler", buy_from_player: "Koopt van speler", both: "Verkoopt en koopt" },
  "vendor_offer.stockMode": { inherit: "Overnemen", infinite: "Onbeperkt", limited: "Beperkt" }
});

// Proven runtime status per field. "active" = read by a runtime service,
// "inactive" = compiled/stored but not read. Fields not listed fall back to the
// existing semantic field-help status.
const ACTIVE_FIELDS = new Set([
  "npc_archetype.displayName",
  "enemy_archetype.displayName", "enemy_archetype.modelAssetId", "enemy_archetype.statBlockRef", "enemy_archetype.lootTableRef", "enemy_archetype.scale", "enemy_archetype.defaultRespawnPolicyRef",
  "resource_definition.displayName", "resource_definition.worldModelAssetId", "resource_definition.yieldLootTableRef", "resource_definition.yieldItemRefs", "resource_definition.requiredAbilityRef", "resource_definition.respawnPolicyRef",
  "item_definition.displayName", "item_definition.category", "item_definition.rarity", "item_definition.stackable", "item_definition.vendorBaseValueMinor", "item_definition.vendorCurrencyRef", "item_definition.tradable", "item_definition.marketEligible", "item_definition.bindPolicy", "item_definition.worldModelAssetId", "item_definition.durabilityMax", "item_definition.equipmentSlotRef",
  "currency_definition.displayName", "currency_definition.showInPrimaryWallet", "currency_definition.sortOrder",
  "recipe_definition.displayName", "recipe_definition.description", "recipe_definition.category", "recipe_definition.craftDurationMs", "recipe_definition.stationType", "recipe_definition.unlockMode", "recipe_definition.outputItems", "recipe_definition.outputCurrencies",
  "recipe_ingredient.kind", "recipe_ingredient.itemRef", "recipe_ingredient.currencyRef", "recipe_ingredient.amount", "recipe_ingredient.consume",
  "vendor_catalog.displayName",
  "vendor_offer.itemRef", "vendor_offer.mode", "vendor_offer.sellCurrencyRef", "vendor_offer.sellPriceMinor", "vendor_offer.buyCurrencyRef", "vendor_offer.buyPriceMinor", "vendor_offer.stockMode", "vendor_offer.initialStock",
  "loot_table.displayName",
  "loot_item_entry.itemRef", "loot_item_entry.chance", "loot_item_entry.guaranteed", "loot_item_entry.minQuantity", "loot_item_entry.maxQuantity",
  "loot_currency_entry.currencyRef", "loot_currency_entry.chance", "loot_currency_entry.guaranteed", "loot_currency_entry.minAmountMinor", "loot_currency_entry.maxAmountMinor",
  "ability_definition.displayName", "ability_definition.range", "ability_definition.damageFormula",
  "stat_definition.displayName",
  "stat_block.displayName", "stat_block.entries",
  "quest_definition.displayName", "quest_definition.summary", "quest_definition.description", "quest_definition.startStepRef", "quest_definition.turnInTargetRef", "quest_definition.prerequisiteQuestRefs", "quest_definition.nextQuestRefs", "quest_definition.autoTrack", "quest_definition.repeatMode",
  "dialogue_definition.displayName", "dialogue_definition.targetRef", "dialogue_definition.startEntryRef"
]);

const INACTIVE_FIELDS = new Set([
  "npc_archetype.role", "npc_archetype.modelAssetId", "npc_archetype.iconAssetId", "npc_archetype.factionRef", "npc_archetype.animationSetRef",
  "enemy_archetype.role", "enemy_archetype.species", "enemy_archetype.iconAssetId", "enemy_archetype.combatProfileRef",
  "resource_definition.iconAssetId", "resource_definition.depletedModelAssetId", "resource_definition.harvestDurationMs", "resource_definition.depletionMode", "resource_definition.scope", "resource_definition.ownershipClaimMs", "resource_definition.requiredSkillStatRef", "resource_definition.requiredSkillValue", "resource_definition.requiredToolTagQuery", "resource_definition.harvestAnimationRole", "resource_definition.gatherAudioRef", "resource_definition.gatherVfxRef",
  "item_definition.iconAssetId", "item_definition.stackLimit", "item_definition.weight", "item_definition.questItem", "item_definition.droppable", "item_definition.destroyable",
  "currency_definition.iconAssetId", "currency_definition.precision", "currency_definition.maxBalanceMinor", "currency_definition.tradable", "currency_definition.marketAllowed", "currency_definition.sourceTags", "currency_definition.sinkTags",
  "recipe_definition.iconAssetId", "recipe_definition.previewModelAssetId", "recipe_definition.batchAllowed", "recipe_definition.maxBatch", "recipe_definition.consumeTiming", "recipe_definition.cancelPolicy", "recipe_definition.successPolicy", "recipe_definition.tradabilityOverride", "recipe_definition.visibleWhenLocked",
  "recipe_ingredient.itemTagQuery", "recipe_ingredient.alternativesGroup", "recipe_ingredient.selectionPolicy",
  "vendor_catalog.refreshPolicy", "vendor_catalog.refreshIntervalSeconds", "vendor_catalog.buybackEnabled", "vendor_catalog.buybackDurationSeconds", "vendor_catalog.sellAllowed", "vendor_catalog.stockScope",
  "vendor_offer.maxStock", "vendor_offer.restockAmount", "vendor_offer.restockSeconds", "vendor_offer.bindOnPurchase",
  "loot_table.rollMode", "loot_table.rollCount", "loot_table.allowDuplicates", "loot_table.ownershipMode", "loot_table.partyLootPolicyRef", "loot_table.pityPolicy", "loot_table.pityCount",
  "loot_item_entry.weight", "loot_item_entry.qualityMode", "loot_item_entry.qualityValue", "loot_item_entry.modifierPoolRefs", "loot_item_entry.conditionTagQuery",
  "loot_currency_entry.weight",
  "loot_table_entry.lootTableRef", "loot_table_entry.chance", "loot_table_entry.weight", "loot_table_entry.repeatMin", "loot_table_entry.repeatMax",
  "ability_definition.iconAssetId", "ability_definition.minimapCategoryRef", "ability_definition.abilityType", "ability_definition.cooldownMs", "ability_definition.castTimeMs", "ability_definition.globalCooldownMs", "ability_definition.resourceCostStatRef", "ability_definition.resourceCostFormula", "ability_definition.minimumRange", "ability_definition.areaShape", "ability_definition.areaRadius", "ability_definition.coneAngle", "ability_definition.targetMode", "ability_definition.requiresLineOfSight", "ability_definition.requiresWeaponTagQuery", "ability_definition.healFormula", "ability_definition.damageTypeRef", "ability_definition.statusEffectRefs", "ability_definition.animationRole", "ability_definition.castAudioRef", "ability_definition.impactAudioRef", "ability_definition.castVfxRef", "ability_definition.impactVfxRef", "ability_definition.interruptible", "ability_definition.movementAllowedDuringCast", "ability_definition.serverPredictionMode",
  "stat_definition.valueType", "stat_definition.minimum", "stat_definition.maximum", "stat_definition.defaultValue", "stat_definition.persistCurrentValue", "stat_definition.replicateMode", "stat_definition.uiFormat",
  "stat_curve.displayName", "stat_curve.inputKind", "stat_curve.interpolation", "stat_curve.points", "stat_curve.clampBefore", "stat_curve.clampAfter",
  // Stored and compiled, but no quest/stat runtime consumer reads them yet.
  "stat_block.overrideMode",
  "quest_definition.questType", "quest_definition.recommendedZoneRef", "quest_definition.minimumLevel"
]);

export function fieldRuntimeStatus(type, key) {
  const id = type + "." + key;
  if (INACTIVE_FIELDS.has(id)) return "inactive";
  if (ACTIVE_FIELDS.has(id)) return "active";
  return "";
}

// One declarative spec per library type. relations[] are the only outgoing
// relations the Workbench draws; each one is a typed schema field or child edge.
export const CONTENT_TYPE_SPECS = Object.freeze({
  npc_archetype: {
    category: "npc", label: "NPC", badge: "NPC", color: "#c084fc",
    keyFields: ["displayName", "role"], createFields: ["role"],
    thumbAssets: ["iconAssetId", "modelAssetId"], duplicate: true,
    relations: []
  },
  enemy_archetype: {
    category: "enemy", label: "Enemy", badge: "EN", color: "#ef4444",
    keyFields: ["displayName", "statBlockRef", "lootTableRef", "scale"], createFields: [],
    thumbAssets: ["iconAssetId", "modelAssetId"], duplicate: true,
    relations: [
      { kind: "enemy_loot", field: "lootTableRef", port: "lootTable", target: "loot_table" },
      { kind: "enemy_stats", field: "statBlockRef", port: "statBlock", through: "stat_block" },
      { kind: "enemy_ability", field: "combatProfileRef", port: "combatProfile", through: "combat_profile" }
    ]
  },
  resource_definition: {
    category: "resource", label: "Resource", badge: "RES", color: "#22c55e",
    keyFields: ["displayName", "yieldItemRefs", "yieldLootTableRef", "requiredAbilityRef"], createFields: [],
    thumbAssets: ["iconAssetId", "worldModelAssetId"], duplicate: true,
    relations: [
      { kind: "resource_yield", listField: "yieldItemRefs", target: "item_definition" },
      { kind: "resource_loot", field: "yieldLootTableRef", target: "loot_table" },
      { kind: "resource_ability", field: "requiredAbilityRef", target: "ability_definition" },
      { kind: "resource_skill", field: "requiredSkillStatRef", target: "stat_definition" }
    ]
  },
  item_definition: {
    category: "item", label: "Item", badge: "ITEM", color: "#84cc16",
    keyFields: ["displayName", "category", "stackable", "rarity"], createFields: ["category", "stackable"],
    thumbAssets: ["iconAssetId", "worldModelAssetId"], duplicate: true,
    relations: [
      { kind: "item_currency", field: "vendorCurrencyRef", target: "currency_definition" }
    ]
  },
  recipe_definition: {
    category: "recipe", label: "Recipe", badge: "REC", color: "#ca8a04",
    keyFields: ["displayName", "craftDurationMs", "category", "unlockMode"], createFields: ["craftDurationMs"],
    thumbAssets: ["iconAssetId", "previewModelAssetId"], duplicate: false,
    children: { port: "ingredients", types: ["recipe_ingredient"] },
    dedicatedFields: ["outputItems", "outputCurrencies", "stationType"],
    relations: [
      { kind: "recipe_ingredient", children: true },
      { kind: "recipe_output", json: "outputItems", refKey: "itemRef", amountKey: "amount", target: "item_definition" },
      { kind: "recipe_output", json: "outputCurrencies", refKey: "currencyRef", amountKey: "amountMinor", target: "currency_definition" }
    ]
  },
  vendor_catalog: {
    category: "vendor", label: "Vendor Catalog", badge: "VEN", color: "#f97316",
    keyFields: ["displayName"], createFields: [],
    thumbAssets: [], duplicate: false,
    children: { port: "offers", types: ["vendor_offer"] },
    relations: [{ kind: "vendor_offer", children: true }]
  },
  ability_definition: {
    category: "ability", label: "Ability", badge: "ABI", color: "#f43f5e",
    keyFields: ["displayName", "abilityType", "range", "cooldownMs"], createFields: ["abilityType", "range"],
    thumbAssets: ["iconAssetId"], duplicate: true,
    relations: [
      { kind: "ability_cost", field: "resourceCostStatRef", target: "stat_definition" }
    ]
  },
  stat_definition: {
    category: "stat", label: "Stat", badge: "STAT", color: "#14b8a6",
    keyFields: ["displayName", "valueType", "minimum", "maximum", "defaultValue"], createFields: [],
    thumbAssets: [], duplicate: true,
    relations: []
  },
  stat_block: {
    category: "stat", label: "Stat Block", badge: "BLOCK", color: "#0d9488",
    keyFields: ["displayName", "overrideMode"], createFields: ["overrideMode"],
    thumbAssets: [], duplicate: false, dedicatedFields: ["entries"],
    relations: [{ kind: "stat_block_stat", json: "entries", refKey: "statRef", amountKey: "baseValue", target: "stat_definition", rawValue: true, rowLabel: "Statregel" }]
  },
  stat_curve: {
    category: "stat", label: "Stat Curve", badge: "CURVE", color: "#2dd4bf",
    keyFields: ["displayName", "inputKind", "interpolation"], createFields: [],
    thumbAssets: [], duplicate: false, relations: []
  },
  currency_definition: {
    category: "currency", label: "Currency", badge: "CUR", color: "#facc15",
    keyFields: ["displayName", "showInPrimaryWallet", "sortOrder"], createFields: [],
    thumbAssets: ["iconAssetId"], duplicate: true,
    relations: []
  },
  loot_table: {
    category: "loot", label: "Loot Table", badge: "LOOT", color: "#d97706",
    keyFields: ["displayName"], createFields: [],
    thumbAssets: [], duplicate: false,
    children: { port: "entries", types: ["loot_item_entry", "loot_currency_entry", "loot_table_entry"] },
    relations: [{ kind: "loot_drop", children: true }]
  },
  quest_definition: {
    category: "quest", label: "Quest", badge: "QUEST", color: "#fbbf24",
    keyFields: ["displayName", "summary", "questType", "minimumLevel", "turnInTargetRef", "recommendedZoneRef", "autoTrack", "repeatMode"],
    createFields: ["summary", "questType", "minimumLevel"], thumbAssets: [], duplicate: false,
    children: { port: "steps", types: ["quest_step"] }, relations: []
  },
  dialogue_definition: {
    category: "dialogue", label: "Dialoog", badge: "DIA", color: "#c084fc",
    keyFields: ["displayName", "targetRef", "startEntryRef"], createFields: [],
    thumbAssets: [], duplicate: false,
    children: { port: "entries", types: ["dialogue_entry", "dialogue_terminal"] }, relations: []
  }
});

// Child rows are never library items; they are owned lines under their parent.
export const CHILD_ROW_SPECS = Object.freeze({
  recipe_ingredient: { label: "Ingrediënt", targets: [
    { field: "itemRef", kind: "recipe_ingredient", target: "item_definition", whenKind: ["item", ""] },
    { field: "currencyRef", kind: "recipe_ingredient", target: "currency_definition", whenKind: ["currency"] }
  ] },
  vendor_offer: { label: "Offer", targets: [
    { field: "itemRef", kind: "vendor_offer", target: "item_definition" },
    { field: "sellCurrencyRef", kind: "vendor_price", target: "currency_definition", whenMode: ["sell_to_player", "both"] },
    { field: "buyCurrencyRef", kind: "vendor_price", target: "currency_definition", whenMode: ["buy_from_player", "both"] }
  ] },
  loot_item_entry: { label: "Itemdrop", targets: [{ field: "itemRef", kind: "loot_drop", target: "item_definition" }] },
  loot_currency_entry: { label: "Currencydrop", targets: [{ field: "currencyRef", kind: "loot_drop", target: "currency_definition" }] },
  loot_table_entry: { label: "Geneste Loot Table", targets: [{ field: "lootTableRef", kind: "loot_nested", target: "loot_table" }] },
  quest_step: { label: "Queststap", targets: [] },
  dialogue_entry: { label: "Dialoogregel", targets: [] },
  dialogue_terminal: { label: "Dialoogeinde", targets: [] }
});

// Proven JSON-embedded references (compiler-normalized and runtime-consumed),
// which the editor's generic reference usage scan cannot see.
const JSON_REFERENCE_FIELDS = Object.freeze([
  { type: "recipe_definition", field: "outputItems", refKey: "itemRef", label: "Output items" },
  { type: "recipe_definition", field: "outputCurrencies", refKey: "currencyRef", label: "Output currencies" },
  { type: "stat_block", field: "entries", refKey: "statRef", label: "Stat Block-regel" },
  { type: "playable_character_definition", field: "startingItemGrants", refKey: "itemRef", label: "Startitems" },
  { type: "playable_character_definition", field: "startingCurrencyGrants", refKey: "currencyRef", label: "Startcurrency" }
]);

export const OVERVIEW_BANDS = Object.freeze([
  { id: "economy", label: "Economie", columns: [
    { id: "resources", label: "Resources", types: ["resource_definition"] },
    { id: "items", label: "Items & Currencies", types: ["item_definition", "currency_definition"] },
    { id: "recipes", label: "Recipes", types: ["recipe_definition"] },
    { id: "vendors", label: "Vendors", types: ["vendor_catalog"] }
  ] },
  { id: "creatures", label: "Wezens en gevecht", columns: [
    { id: "creatures", label: "Enemies & NPC's", types: ["enemy_archetype", "npc_archetype"] },
    { id: "combat", label: "Abilities & Stats", types: ["ability_definition", "stat_definition", "stat_block", "stat_curve"] },
    { id: "loot", label: "Loot Tables", types: ["loot_table"] }
  ] },
  // Quest rewards (Items/Currencies/Abilities) are drawn to their cards in the
  // bands above: the overview links to one card per definition, so the story
  // band must not repeat those types.
  { id: "story", label: "Verhaal", columns: [
    { id: "npcs", label: "NPC's", types: ["npc_archetype"] },
    { id: "dialogues", label: "Dialogen", types: ["dialogue_definition"] },
    { id: "quests", label: "Quests", types: ["quest_definition"] }
  ] }
]);

function canonical(value) {
  return normalizeCanonicalId(value, "");
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function formatNumber(value) {
  const number = finite(value, 0);
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 100) / 100).replace(".", ",");
}

export function formatRange(min, max) {
  const low = finite(min, 0);
  const high = finite(max, low);
  return low === high ? formatNumber(low) : formatNumber(low) + "–" + formatNumber(high);
}

export function formatChance(value) {
  return Math.round(Math.max(0, Math.min(1, finite(value, 1))) * 100) + "%";
}

export function formatDuration(ms) {
  const value = Math.max(0, finite(ms, 0));
  if (value <= 0) return "Direct";
  if (value < 60000) return formatNumber(Math.round(value / 100) / 10) + " s";
  return formatNumber(Math.round(value / 6000) / 10) + " min";
}

export function optionLabel(type, key, value) {
  const labels = OPTION_LABELS[type + "." + key] || {};
  const raw = value === null || value === undefined ? "" : String(value);
  return labels[raw] || raw;
}

export function definitionName(node, nodeTypes) {
  const display = typeof node?.values?.displayName === "string" ? node.values.displayName.trim() : "";
  if (display) return display;
  const title = typeof node?.values?.title === "string" && node.values.title.trim() ? node.values.title.trim() : String(node?.title || "").trim();
  return title || nodeTypes?.[node?.type]?.label || node?.type || "Definitie";
}

function childRowDetail(child) {
  const values = child.values || {};
  if (child.type === "loot_item_entry") return formatRange(values.minQuantity ?? 1, values.maxQuantity ?? 1) + " · " + (values.guaranteed === true ? "altijd" : formatChance(values.chance ?? 1));
  if (child.type === "loot_currency_entry") return formatRange(values.minAmountMinor ?? 1, values.maxAmountMinor ?? 1) + " · " + (values.guaranteed === true ? "altijd" : formatChance(values.chance ?? 1));
  if (child.type === "loot_table_entry") return formatRange(values.repeatMin ?? 1, values.repeatMax ?? 1) + "× · " + formatChance(values.chance ?? 1);
  if (child.type === "recipe_ingredient") return "×" + formatNumber(Math.max(1, Math.floor(finite(values.amount, 1)))) + (values.consume === false ? " (blijft)" : "");
  if (child.type === "vendor_offer") return optionLabel("vendor_offer", "mode", values.mode || "both");
  return "";
}

function childTargetApplies(target, values) {
  if (target.whenKind) {
    const kind = String(values?.kind || "");
    if (!target.whenKind.includes(kind)) return false;
  }
  if (target.whenMode) {
    const mode = String(values?.mode || "both");
    if (!target.whenMode.includes(mode)) return false;
  }
  return true;
}

function usageArea(node, ownerId) {
  if (ownerId) return "definition";
  const type = String(node?.type || "");
  if (/^(quest_|objective_|condition_|reward_|dialogue_|action_)/.test(type)) return "quest";
  if (/_component$|_spawn$|_spawn_area$|_spawn_point$|^spawn_|^model_entity$/.test(type)) return "world";
  return "other";
}

/** Build the derived Workbench index. Cheap enough to rebuild once per graph
 * change; callers cache it by graph identity. Never a second source of truth. */
export function buildContentIndex(graph, nodeTypes) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const types = nodeTypes || {};
  const nodeById = new Map();
  for (const node of nodes) if (node?.id) nodeById.set(node.id, node);

  const identityCache = new Map();
  function identityField(type) {
    if (identityCache.has(type)) return identityCache.get(type);
    const entry = Object.entries(types[type]?.fields || {}).find(function ([, field]) { return field?.type === "identity"; });
    const key = entry ? entry[0] : "";
    identityCache.set(type, key);
    return key;
  }
  const refToNode = new Map();
  for (const node of nodes) {
    const key = identityField(node.type);
    if (!key) continue;
    const id = canonical(node.values?.[key]);
    if (id && !refToNode.has(id)) refToNode.set(id, node);
  }
  const aliases = new Map();
  for (const row of Array.isArray(graph?.contentAliases) ? graph.contentAliases : []) {
    const oldId = canonical(row?.old_id);
    const newId = canonical(row?.new_id);
    if (oldId && newId && oldId !== newId && !aliases.has(oldId)) aliases.set(oldId, newId);
  }
  function resolve(ref) {
    const id = canonical(ref);
    if (!id) return null;
    return refToNode.get(id) || (aliases.has(id) ? refToNode.get(aliases.get(id)) || null : null);
  }

  const incomingByPort = new Map();
  const assemblyOfComponent = new Map();
  const modelOfAssembly = new Map();
  const definitionEdgeSources = new Set();
  for (const edge of edges) {
    if (!edge) continue;
    const key = edge.toNodeId + SEP + edge.toPort;
    if (!incomingByPort.has(key)) incomingByPort.set(key, []);
    incomingByPort.get(key).push(edge);
    const toType = nodeById.get(edge.toNodeId)?.type;
    if (edge.fromPort === "component" && edge.toPort === "components" && toType === "entity_assembly") assemblyOfComponent.set(edge.fromNodeId, edge.toNodeId);
    if (edge.fromPort === "entity" && edge.toPort === "model" && toType === "entity_assembly" && nodeById.get(edge.fromNodeId)?.type === "model_entity") modelOfAssembly.set(edge.toNodeId, edge.fromNodeId);
    if (edge.fromPort === "catalogDefinition"
      || (edge.fromPort === "questDef" && edge.toPort === "quests")
      || (edge.fromPort === "dialogueDef" && edge.toPort === "dialogues")) definitionEdgeSources.add(edge.fromNodeId);
  }

  const definitions = [];
  const byNodeId = new Map();
  for (const node of nodes) {
    const spec = CONTENT_TYPE_SPECS[node.type];
    if (!spec) continue;
    const entry = {
      id: node.id,
      node,
      type: node.type,
      spec,
      ref: canonical(node.values?.[identityField(node.type)]),
      name: definitionName(node, types),
      groupId: node.parentId || null,
      packaged: definitionEdgeSources.has(node.id),
      children: [],
      out: [],
      in: [],
      usage: [],
      missing: [],
      vias: []
    };
    definitions.push(entry);
    byNodeId.set(node.id, entry);
  }

  const childParent = new Map();
  for (const entry of definitions) {
    const childSpec = entry.spec.children;
    if (!childSpec) continue;
    const seen = new Set();
    for (const edge of incomingByPort.get(entry.id + SEP + childSpec.port) || []) {
      const child = nodeById.get(edge.fromNodeId);
      if (!child || seen.has(child.id) || !childSpec.types.includes(child.type)) continue;
      seen.add(child.id);
      entry.children.push(child);
      if (!childParent.has(child.id)) childParent.set(child.id, entry.id);
    }
  }

  // Quest/dialogue nodes remain independently authorable definitions, while
  // their steps, objectives, actions, entries and choices are real owned graph
  // children. Resolve that ownership only from the compiler-facing child edges.
  const ownedPorts = new Set(["steps", "objectives", "conditions", "rewards", "entries", "choices"]);
  const definitionOwner = new Map(definitions.map(function (entry) { return [entry.id, entry.id]; }));
  let ownershipChanged = true;
  while (ownershipChanged) {
    ownershipChanged = false;
    for (const edge of edges) {
      if (!ownedPorts.has(edge.toPort) || definitionOwner.has(edge.fromNodeId)) continue;
      const ownerId = definitionOwner.get(edge.toNodeId);
      if (!ownerId) continue;
      definitionOwner.set(edge.fromNodeId, ownerId);
      if (!childParent.has(edge.fromNodeId)) childParent.set(edge.fromNodeId, ownerId);
      ownershipChanged = true;
    }
  }
  for (const [nodeId, ownerId] of definitionOwner.entries()) {
    if (nodeId === ownerId) continue;
    const owner = byNodeId.get(ownerId);
    const child = nodeById.get(nodeId);
    if (owner && child && !owner.children.some(function (row) { return row.id === nodeId; })) owner.children.push(child);
  }

  const relations = [];
  function addRelation(kind, from, toNode, options = {}) {
    const target = byNodeId.get(toNode.id);
    if (!target) return;
    const relation = {
      key: kind + SEP + from.id + SEP + toNode.id + SEP + (options.via || "") + SEP + (options.field || ""),
      kind,
      from: from.id,
      to: toNode.id,
      via: options.via || null,
      viaName: options.viaName || "",
      field: options.field || "",
      detail: options.detail || "",
      amount: options.amount === undefined ? null : options.amount,
      active: RELATION_KINDS[kind]?.active !== false && options.active !== false
    };
    relations.push(relation);
    from.out.push(relation);
    target.in.push(relation);
  }
  function addMissing(entry, field, ref, reason, label) {
    entry.missing.push({ field, ref, reason, label: label || field });
  }
  function referencedNode(entry, extractor) {
    let ref = canonical(entry.node.values?.[extractor.field]);
    if (!ref && extractor.port) {
      const edge = (incomingByPort.get(entry.id + SEP + extractor.port) || [])[0] || null;
      const source = edge ? nodeById.get(edge.fromNodeId) : null;
      if (source) ref = canonical(source.values?.[identityField(source.type)]);
    }
    return { ref, node: ref ? resolve(ref) : null };
  }

  for (const entry of definitions) {
    const values = entry.node.values || {};
    for (const extractor of entry.spec.relations || []) {
      if (extractor.children) {
        for (const child of entry.children) {
          const rowSpec = CHILD_ROW_SPECS[child.type];
          for (const target of rowSpec?.targets || []) {
            if (!childTargetApplies(target, child.values)) continue;
            const ref = canonical(child.values?.[target.field]);
            if (!ref) {
              if (target.kind !== "vendor_price") addMissing(entry, target.field, "", "empty", rowSpec.label);
              continue;
            }
            const node = resolve(ref);
            if (!node || node.type !== target.target) {
              addMissing(entry, target.field, ref, node ? "type" : "missing", rowSpec.label);
              continue;
            }
            let detail = childRowDetail(child);
            let amount;
            if (target.kind === "vendor_price") {
              const sell = target.field === "sellCurrencyRef";
              amount = Math.max(0, Math.floor(finite(sell ? child.values?.sellPriceMinor : child.values?.buyPriceMinor, 0)));
              detail = (sell ? "verkoop " : "inkoop ") + formatNumber(amount);
            }
            addRelation(target.kind, entry, node, { via: child.id, field: target.field, detail, amount });
          }
        }
        continue;
      }
      if (extractor.json) {
        const list = Array.isArray(values[extractor.json]) ? values[extractor.json] : [];
        const rowLabel = extractor.rowLabel || "Output";
        list.forEach(function (row, index) {
          const ref = canonical(row?.[extractor.refKey]);
          if (!ref) {
            addMissing(entry, extractor.json, "", "empty", rowLabel);
            return;
          }
          const node = resolve(ref);
          if (!node || node.type !== extractor.target) {
            addMissing(entry, extractor.json, ref, node ? "type" : "missing", rowLabel);
            return;
          }
          // Stat Block base values are real (possibly decimal/negative) values,
          // not quantities: show them exactly as the runtime reads them.
          const detail = extractor.rawValue
            ? formatNumber(finite(row?.[extractor.amountKey], 0))
            : "×" + formatNumber(Math.max(0, Math.floor(finite(row?.[extractor.amountKey], extractor.amountKey === "amount" ? 1 : 0))));
          addRelation(extractor.kind, entry, node, { field: extractor.json + "." + index, detail });
        });
        continue;
      }
      if (extractor.listField) {
        for (const ref of normalizeReferenceList(values[extractor.listField])) {
          const node = resolve(ref);
          if (!node || node.type !== extractor.target) {
            addMissing(entry, extractor.listField, ref, node ? "type" : "missing");
            continue;
          }
          addRelation(extractor.kind, entry, node, { field: extractor.listField });
        }
        continue;
      }
      const found = referencedNode(entry, extractor);
      if (!found.ref) continue;
      if (!found.node) {
        addMissing(entry, extractor.field, found.ref, "missing");
        continue;
      }
      if (extractor.through === "stat_block") {
        if (found.node.type !== "stat_block") {
          addMissing(entry, extractor.field, found.ref, "type");
          continue;
        }
        const viaName = definitionName(found.node, types);
        entry.vias.push({ field: extractor.field, nodeId: found.node.id, name: viaName, type: found.node.type, active: true });
        for (const row of Array.isArray(found.node.values?.entries) ? found.node.values.entries : []) {
          const statNode = resolve(row?.statRef);
          if (!statNode || statNode.type !== "stat_definition") continue;
          addRelation(extractor.kind, entry, statNode, { via: found.node.id, viaName, field: extractor.field, detail: formatNumber(finite(row?.baseValue, 0)) });
        }
        continue;
      }
      if (extractor.through === "combat_profile") {
        if (found.node.type !== "combat_profile") {
          addMissing(entry, extractor.field, found.ref, "type");
          continue;
        }
        const viaName = definitionName(found.node, types);
        entry.vias.push({ field: extractor.field, nodeId: found.node.id, name: viaName, type: found.node.type, active: false });
        const abilityRefs = [found.node.values?.basicAttackRef].concat(normalizeReferenceList(found.node.values?.abilityRefs));
        const seen = new Set();
        for (const ref of abilityRefs) {
          const abilityNode = resolve(ref);
          if (!abilityNode || abilityNode.type !== "ability_definition" || seen.has(abilityNode.id)) continue;
          seen.add(abilityNode.id);
          addRelation(extractor.kind, entry, abilityNode, { via: found.node.id, viaName, field: extractor.field });
        }
        continue;
      }
      if (found.node.type !== extractor.target) {
        addMissing(entry, extractor.field, found.ref, "type");
        continue;
      }
      addRelation(extractor.kind, entry, found.node, { field: extractor.field });
    }
  }

  const targetNpc = new Map();
  for (const binding of nodes.filter(function (node) { return node.type === "quest_target_binding"; })) {
    const targetRef = canonical(binding.values?.targetId);
    if (!targetRef) continue;
    const entityEdge = edges.find(function (edge) {
      return edge.toNodeId === binding.id && edge.toPort === "entity";
    });
    const assembly = entityEdge ? nodeById.get(entityEdge.fromNodeId) : null;
    if (assembly?.type !== "entity_assembly") continue;
    const npcEdge = edges.find(function (edge) {
      return edge.toNodeId === assembly.id && edge.toPort === "components" && nodeById.get(edge.fromNodeId)?.type === "npc_component";
    });
    const npcRef = npcEdge ? canonical(nodeById.get(npcEdge.fromNodeId)?.values?.npcRef) : "";
    const npc = npcRef ? resolve(npcRef) : null;
    if (npc?.type === "npc_archetype") targetNpc.set(targetRef, npc);
  }

  // Story relations follow typed references inside the owned campaign nodes.
  // This includes objective targets and concrete Item/Currency/Ability rewards.
  for (const node of nodes) {
    const ownerId = definitionOwner.get(node.id);
    const owner = ownerId ? byNodeId.get(ownerId) : null;
    if (!owner || !["quest_definition", "dialogue_definition"].includes(owner.type)) continue;
    const fields = types[node.type]?.fields || {};
    for (const [key, field] of Object.entries(fields)) {
      if (field?.type !== "reference" && field?.type !== "referenceList") continue;
      const refs = field.type === "referenceList" ? normalizeReferenceList(node.values?.[key]) : [canonical(node.values?.[key])].filter(Boolean);
      for (const ref of refs) {
        const target = resolve(ref);
        if (target && target.id !== owner.id) {
          let kind = "";
          if (target.type === "item_definition") kind = "quest_item";
          else if (target.type === "currency_definition") kind = "quest_currency";
          else if (target.type === "ability_definition") kind = "quest_ability";
          else if (target.type === "quest_definition") kind = owner.type === "dialogue_definition" ? "dialogue_quest" : "quest_quest";
          if (kind) addRelation(kind, owner, target, { via: node.id, field: key });
        }
        const npc = targetNpc.get(ref);
        if (npc) addRelation(owner.type === "dialogue_definition" ? "dialogue_npc" : "quest_npc", owner, npc, { via: node.id, field: key });
      }
    }
  }
  for (const edge of edges) {
    if (edge.toPort !== "startDialogue") continue;
    const quest = byNodeId.get(edge.toNodeId);
    const dialogue = byNodeId.get(edge.fromNodeId);
    if (quest?.type === "quest_definition" && dialogue?.type === "dialogue_definition") {
      addRelation("quest_dialogue", quest, dialogue.node, { field: "startDialogue" });
    }
  }

  // Generic "Waar gebruikt" scan: every typed reference to a library definition.
  const usageSeen = new Set();
  function pushUsage(targetNode, source, field, fieldLabel) {
    const target = byNodeId.get(targetNode.id);
    if (!target || targetNode.id === source.id) return;
    const ownerId = byNodeId.has(source.id) ? source.id : (childParent.get(source.id) || null);
    if (ownerId === target.id) return;
    const key = target.id + SEP + source.id + SEP + field;
    if (usageSeen.has(key)) return;
    usageSeen.add(key);
    const assemblyId = assemblyOfComponent.get(source.id) || null;
    target.usage.push({
      sourceId: source.id,
      sourceType: source.type,
      ownerId,
      field,
      fieldLabel,
      area: usageArea(source, ownerId),
      modelId: assemblyId ? (modelOfAssembly.get(assemblyId) || null) : (source.type === "model_entity" ? source.id : null)
    });
  }
  for (const node of nodes) {
    const fields = types[node.type]?.fields || {};
    for (const [key, field] of Object.entries(fields)) {
      if (!field || (field.type !== "reference" && field.type !== "referenceList")) continue;
      const refs = field.type === "referenceList"
        ? normalizeReferenceList(node.values?.[key])
        : [canonical(node.values?.[key])].filter(Boolean);
      for (const ref of refs) {
        const target = resolve(ref);
        if (target) pushUsage(target, node, key, field.label || key);
      }
    }
  }
  for (const spec of JSON_REFERENCE_FIELDS) {
    for (const node of nodes) {
      if (node.type !== spec.type) continue;
      const list = Array.isArray(node.values?.[spec.field]) ? node.values[spec.field] : [];
      for (const row of list) {
        const target = resolve(row?.[spec.refKey]);
        if (target) pushUsage(target, node, spec.field, spec.label);
      }
    }
  }
  const counts = { all: definitions.length };
  for (const category of WORKBENCH_CATEGORIES) if (category.type || category.types) counts[category.id] = 0;
  for (const entry of definitions) counts[entry.spec.category] = (counts[entry.spec.category] || 0) + 1;

  return { graph, definitions, byNodeId, relations, childParent, counts, resolve, nodeById };
}

export function definitionIsUsed(entry) {
  return Boolean(entry && (entry.usage.length || entry.in.length));
}

/** Related definition ids for the overview highlight, bounded. */
export function relationScope(index, nodeId, scope, options = {}) {
  const maxNodes = Math.max(4, Math.floor(Number(options.maxNodes) || 60));
  const maxRelations = Math.max(4, Math.floor(Number(options.maxRelations) || 40));
  const result = { related: new Map(), relations: [], truncated: false };
  const start = index?.byNodeId?.get(nodeId);
  if (!start) return result;
  function chipFor(relation, direction) {
    const meta = RELATION_KINDS[relation.kind] || {};
    const label = direction === "out" ? meta.outLabel : meta.inLabel;
    const via = relation.viaName ? " (" + relation.viaName + ")" : "";
    return { text: [label, relation.detail].filter(Boolean).join(" · ") + via, active: relation.active };
  }
  function addRelated(otherId, relation, direction, depth) {
    if (otherId === nodeId) return false;
    if (!result.related.has(otherId)) {
      if (result.related.size >= maxNodes) {
        result.truncated = true;
        return false;
      }
      result.related.set(otherId, { depth, chips: [] });
    }
    const info = result.related.get(otherId);
    if (info.chips.length < 3) info.chips.push(chipFor(relation, direction));
    if (result.relations.length < maxRelations) {
      if (!result.relations.some(function (candidate) { return candidate.key === relation.key; })) result.relations.push(relation);
    } else {
      result.truncated = true;
    }
    return true;
  }
  if (scope === "used") {
    for (const relation of start.in) addRelated(relation.from, relation, "in", 1);
    return result;
  }
  if (scope === "all") {
    const queue = [{ id: nodeId, depth: 0 }];
    const visited = new Set([nodeId]);
    while (queue.length) {
      const current = queue.shift();
      if (current.depth >= 3) continue;
      const entry = index.byNodeId.get(current.id);
      if (!entry) continue;
      const links = entry.out.map(function (relation) { return { relation, other: relation.to, direction: "out" }; })
        .concat(entry.in.map(function (relation) { return { relation, other: relation.from, direction: "in" }; }));
      for (const link of links) {
        if (link.other === nodeId) continue;
        if (current.id === nodeId || !visited.has(link.other)) {
          if (!addRelated(link.other, link.relation, link.direction, current.depth + 1)) continue;
        }
        if (!visited.has(link.other)) {
          visited.add(link.other);
          queue.push({ id: link.other, depth: current.depth + 1 });
        }
      }
    }
    return result;
  }
  for (const relation of start.out) addRelated(relation.to, relation, "out", 1);
  for (const relation of start.in) addRelated(relation.from, relation, "in", 1);
  return result;
}

function distinctOwners(relations, side) {
  return new Set(relations.map(function (relation) { return relation[side]; })).size;
}

function namesFor(index, relations, side, limit = 2) {
  const names = [];
  for (const relation of relations) {
    const entry = index.byNodeId.get(relation[side]);
    if (entry && !names.includes(entry.name)) names.push(entry.name);
  }
  if (!names.length) return "";
  return names.slice(0, limit).join(", ") + (names.length > limit ? " +" + (names.length - limit) : "");
}

/** Up to three human properties plus relation counts for a library card. */
export function definitionFacts(index, entry) {
  const values = entry.node.values || {};
  const props = [];
  const counts = [];
  const outOf = function (kind) { return entry.out.filter(function (relation) { return relation.kind === kind; }); };
  const inOf = function (...kinds) { return entry.in.filter(function (relation) { return kinds.includes(relation.kind); }); };
  const worldUses = entry.usage.filter(function (usage) { return usage.area === "world"; }).length;
  switch (entry.type) {
    case "npc_archetype":
      props.push(optionLabel(entry.type, "role", values.role || "civilian"));
      break;
    case "enemy_archetype": {
      const via = entry.vias.find(function (row) { return row.field === "statBlockRef"; });
      props.push(via ? "Stat Block: " + via.name : "Geen Stat Block");
      const loot = outOf("enemy_loot")[0];
      props.push(loot ? "Loot: " + (index.byNodeId.get(loot.to)?.name || "") : "Geen loot");
      break;
    }
    case "resource_definition": {
      const yields = outOf("resource_yield");
      props.push(yields.length ? "Opbrengst: " + namesFor(index, yields, "to") : "Geen opbrengst-items");
      const loot = outOf("resource_loot")[0];
      if (loot) props.push("Oogst-loot: " + (index.byNodeId.get(loot.to)?.name || ""));
      break;
    }
    case "item_definition":
      props.push(optionLabel(entry.type, "category", values.category || "misc"));
      props.push(values.stackable === false ? "Uniek (niet stapelbaar)" : "Stapelbaar");
      counts.push({ label: "Recipes", value: distinctOwners(inOf("recipe_ingredient", "recipe_output"), "from") });
      counts.push({ label: "Vendors", value: distinctOwners(inOf("vendor_offer"), "from") });
      counts.push({ label: "Loot", value: distinctOwners(inOf("loot_drop"), "from") });
      break;
    case "currency_definition":
      props.push(values.showInPrimaryWallet === false ? "Niet in wallet" : "Zichtbaar in wallet");
      counts.push({ label: "Vendors", value: distinctOwners(inOf("vendor_price"), "from") });
      counts.push({ label: "Recipes", value: distinctOwners(inOf("recipe_ingredient", "recipe_output"), "from") });
      counts.push({ label: "Loot", value: distinctOwners(inOf("loot_drop"), "from") });
      break;
    case "recipe_definition": {
      const ingredients = entry.children.length;
      const outputs = (Array.isArray(values.outputItems) ? values.outputItems.length : 0) + (Array.isArray(values.outputCurrencies) ? values.outputCurrencies.length : 0);
      props.push(ingredients + " ingrediënt" + (ingredients === 1 ? "" : "en") + " → " + outputs + " output" + (outputs === 1 ? "" : "s"));
      const made = outOf("recipe_output");
      if (made.length) props.push("Maakt: " + namesFor(index, made, "to"));
      props.push("Crafttijd: " + formatDuration(values.craftDurationMs));
      break;
    }
    case "vendor_catalog": {
      props.push(entry.children.length + " offer" + (entry.children.length === 1 ? "" : "s"));
      const offers = outOf("vendor_offer");
      if (offers.length) props.push("Producten: " + namesFor(index, offers, "to"));
      const sells = outOf("vendor_price").filter(function (relation) { return relation.field === "sellCurrencyRef"; });
      const prices = sells.length ? sells : outOf("vendor_price");
      if (prices.length) {
        const amounts = prices.map(function (relation) { return finite(relation.amount, 0); });
        props.push((sells.length ? "Prijs " : "Inkoop ") + formatRange(Math.min.apply(null, amounts), Math.max.apply(null, amounts)) + " " + namesFor(index, prices, "to", 1));
      }
      break;
    }
    case "ability_definition":
      props.push(optionLabel(entry.type, "abilityType", values.abilityType || "basic_attack"));
      props.push("Bereik " + formatNumber(values.range ?? 2.5));
      counts.push({ label: "Gebruikers", value: entry.usage.length });
      break;
    case "stat_definition": {
      props.push(optionLabel(entry.type, "valueType", values.valueType || "integer"));
      props.push(formatRange(values.minimum ?? 0, values.maximum ?? 100) + " · start " + formatNumber(values.defaultValue ?? 0));
      const blocks = entry.usage.filter(function (usage) { return usage.sourceType === "stat_block"; }).length;
      counts.push({ label: "Stat Blocks", value: blocks });
      break;
    }
    case "stat_block": {
      const stats = outOf("stat_block_stat");
      props.push(stats.length + " statregel" + (stats.length === 1 ? "" : "s"));
      if (stats.length) props.push(namesFor(index, stats, "to"));
      counts.push({ label: "Enemies", value: entry.usage.filter(function (usage) { return usage.sourceType === "enemy_archetype"; }).length });
      break;
    }
    case "stat_curve":
      props.push(optionLabel(entry.type, "inputKind", values.inputKind || "level"));
      props.push(optionLabel(entry.type, "interpolation", values.interpolation || "linear"));
      break;
    case "quest_definition": {
      props.push(optionLabel(entry.type, "questType", values.questType || "main"));
      const steps = entry.children.filter(function (child) { return child.type === "quest_step"; });
      props.push(steps.length + " stap" + (steps.length === 1 ? "" : "pen"));
      counts.push({ label: "Rewards", value: outOf("quest_currency").length + outOf("quest_ability").length });
      break;
    }
    case "dialogue_definition": {
      const entries = entry.children.filter(function (child) { return child.type === "dialogue_entry"; });
      props.push(entries.length + " regel" + (entries.length === 1 ? "" : "s"));
      counts.push({ label: "Quests", value: outOf("dialogue_quest").length + inOf("quest_dialogue").length });
      break;
    }
    case "loot_table": {
      const drops = outOf("loot_drop");
      props.push(entry.children.length + " drop" + (entry.children.length === 1 ? "" : "s"));
      if (drops.length) props.push(namesFor(index, drops, "to"));
      const first = drops[0];
      if (first) props.push((index.byNodeId.get(first.to)?.name || "") + " " + first.detail);
      counts.push({ label: "Bronnen", value: distinctOwners(inOf("enemy_loot", "resource_loot", "loot_nested"), "from") });
      break;
    }
    default:
      break;
  }
  if (worldUses && ["npc_archetype", "enemy_archetype", "resource_definition", "item_definition", "vendor_catalog", "recipe_definition"].includes(entry.type)) {
    counts.push({ label: "In wereld", value: worldUses });
  }
  return { props: props.filter(Boolean).slice(0, 3), counts };
}

/** Node ids whose asset thumbnail can stand in for a definition without assets
 * of its own (recipe outputs, vendor products, loot drops) — real relations only. */
export function thumbnailStandIns(entry) {
  const preferred = entry.type === "recipe_definition" ? ["recipe_output", "recipe_ingredient"]
    : entry.type === "vendor_catalog" ? ["vendor_offer"]
      : entry.type === "loot_table" ? ["loot_drop"]
        : entry.type === "quest_definition" ? ["quest_npc", "quest_item", "quest_currency", "quest_ability"]
          : entry.type === "dialogue_definition" ? ["dialogue_npc"] : [];
  const ids = [];
  for (const kind of preferred) {
    for (const relation of entry.out) {
      if (relation.kind === kind && !ids.includes(relation.to)) ids.push(relation.to);
    }
  }
  return ids.slice(0, 4);
}
