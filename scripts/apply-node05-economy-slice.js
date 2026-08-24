import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NODE_TYPES } from "../src/shared/node-types.js";
import { cleanValuesForType } from "../src/server/field-validation.js";
import { openDatabase, resolveDatabasePath } from "../src/server/db.js";
import { AssetService } from "../src/server/asset-service.js";
import { GraphRepository } from "../src/server/graph-repository.js";
import { GameProjectCompiler } from "../src/server/game-project-compiler.js";
import { PublishService } from "../src/server/publish-service.js";
import { SymbolIndexService } from "../src/server/symbol-index-service.js";
import { TokenResolver } from "../src/server/token-resolver.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = resolveDatabasePath(rootDir);
const db = openDatabase(rootDir);

const IDS = Object.freeze({
  startGroup: "node_group_96a070e2",
  startZone: "node_zone_definition_872d5230",
  startOutput: "node_zone_output_b438151a",
  desertGroup: "node_zone_canvas_55fbbba0",
  desertZone: "node_zone_definition_eb02ee73",
  desertOutput: "node_zone_output_5fdf926d",
  desertSpawnSet: "node03_demo_spawn_set",
  catalogRegistry: "foundation.catalog_registry",
  playerRulesOutput: "foundation.player_rules_output",
  uiOutput: "foundation.ui_output",
  projectSettings: "foundation.game_project_settings"
});

const GROUPS = Object.freeze({
  catalog: "node05_economy_catalog_group",
  rules: "node05_economy_rules_group",
  ui: "node05_economy_ui_group"
});

const ASSETS = Object.freeze({
  blacksmith: "asset_74948957-7106-4c24-835e-4d817ddfdc76",
  forge: "asset_ac271a8c-da70-471e-8a72-3d7ece0b40a3",
  tree: "asset_3e5cc4d3-927c-4715-b2e5-bc2b03171c41",
  alchemyLab: "asset_c5211e52-119b-4b14-a3f1-4f6f3e855ebd",
  tavern: "asset_3278d92b-54da-41c4-9d9d-02078dcfa0a3"
});

function now() {
  return new Date().toISOString();
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function sqlString(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function groupInputId(groupId) {
  return "group_input__" + groupId;
}

function groupOutputId(groupId) {
  return "group_output__" + groupId;
}

function groupInterface(outputs) {
  return { inputs: [], outputs };
}

function outputPort(name, label, dataType, multiple = false) {
  return { id: name, name, label, dataType, multiple };
}

function requireNode(id, label) {
  const row = db.prepare("SELECT id FROM editor_nodes WHERE id = ? LIMIT 1").get(id);
  if (!row) throw new Error("Missing required " + label + " node: " + id);
}

function ensureBackup() {
  const backupPath = path.join(path.dirname(dbPath), "gk-real-node-editor.sqlite.node05-economy-before.sqlite");
  if (fs.existsSync(backupPath)) return backupPath;
  db.exec("VACUUM INTO " + sqlString(backupPath));
  return backupPath;
}

function normalizeCoordinate(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

const selectNode = db.prepare("SELECT * FROM editor_nodes WHERE id = ? LIMIT 1");
const insertNode = db.prepare(`
  INSERT INTO editor_nodes (id, type, title, x, y, parent_id, values_json, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const updateNode = db.prepare(`
  UPDATE editor_nodes
  SET type = ?, title = ?, x = ?, y = ?, parent_id = ?, values_json = ?, updated_at = ?
  WHERE id = ?
`);
const selectEdgeByKey = db.prepare(`
  SELECT id FROM editor_node_edges
  WHERE from_node_id = ? AND from_port = ? AND to_node_id = ? AND to_port = ?
  LIMIT 1
`);
const selectEdgeById = db.prepare("SELECT from_node_id, from_port, to_node_id, to_port FROM editor_node_edges WHERE id = ? LIMIT 1");
const deleteEdgeById = db.prepare("DELETE FROM editor_node_edges WHERE id = ?");
const insertEdge = db.prepare(`
  INSERT INTO editor_node_edges (id, from_node_id, from_port, to_node_id, to_port, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

function upsertNode(node) {
  const definition = NODE_TYPES[node.type];
  if (!definition) throw new Error("Unknown node type for NODE-05: " + node.type);
  const existing = selectNode.get(node.id);
  const previousValues = existing ? parseJson(existing.values_json, {}) : {};
  const cleanValues = cleanValuesForType(node.type, node.values || {}, previousValues, NODE_TYPES);
  const stamp = now();
  const title = node.title || existing?.title || definition.label || node.type;
  const x = normalizeCoordinate(node.x ?? existing?.x, 0);
  const y = normalizeCoordinate(node.y ?? existing?.y, 0);
  const parentId = Object.prototype.hasOwnProperty.call(node, "parentId")
    ? (node.parentId || null)
    : (existing?.parent_id || null);
  if (existing) {
    updateNode.run(node.type, title, x, y, parentId, JSON.stringify(cleanValues), stamp, node.id);
  } else {
    insertNode.run(node.id, node.type, title, x, y, parentId, JSON.stringify(cleanValues), stamp, stamp);
  }
}

function mergeExistingNodeValues(id, values) {
  const existing = selectNode.get(id);
  if (!existing) throw new Error("Missing node for merge: " + id);
  upsertNode({
    id,
    type: existing.type,
    title: existing.title,
    x: existing.x,
    y: existing.y,
    parentId: existing.parent_id,
    values: Object.assign({}, parseJson(existing.values_json, {}), values)
  });
}

function upsertEdge(id, fromNodeId, fromPort, toNodeId, toPort) {
  const existingById = selectEdgeById.get(id);
  if (existingById) {
    const sameEdge = existingById.from_node_id === fromNodeId
      && existingById.from_port === fromPort
      && existingById.to_node_id === toNodeId
      && existingById.to_port === toPort;
    if (sameEdge) return;
    deleteEdgeById.run(id);
  }
  const existing = selectEdgeByKey.get(fromNodeId, fromPort, toNodeId, toPort);
  if (existing) return;
  insertEdge.run(id, fromNodeId, fromPort, toNodeId, toPort, now());
}

function node(id, type, title, x, y, values, parentId = null) {
  return { id, type, title, x, y, parentId, values };
}

function edge(id, fromNodeId, fromPort, toNodeId, toPort) {
  return { id, fromNodeId, fromPort, toNodeId, toPort };
}

function tagUnion(existing, extra) {
  return Array.from(new Set([].concat(Array.isArray(existing) ? existing : [], extra || []).filter(Boolean)));
}

function touchGraphRevision() {
  db.prepare(`
    INSERT INTO editor_graph_meta (id, graph_revision, content_schema_version, last_mutation_at)
    VALUES (1, 1, 'gk-node-content-v1', ?)
    ON CONFLICT(id) DO UPDATE SET
      graph_revision = graph_revision + 1,
      content_schema_version = excluded.content_schema_version,
      last_mutation_at = excluded.last_mutation_at
  `).run(now());
}

const groupNodes = [
  node(GROUPS.catalog, "group", "NODE-05 Economy Catalog", -1960, -1660, {
    groupId: "node05_economy_catalog",
    title: "NODE-05 Economy Catalog",
    groupKind: "catalog",
    zoneCanvas: false,
    groupInterface: groupInterface([outputPort("catalogpackage", "Catalog Package", "catalogPackage")]),
    interfacePresetVersion: 1,
    collapsedSummary: false
  }),
  node(groupInputId(GROUPS.catalog), "group_input", "Group Input", -1320, -1430, {}, GROUPS.catalog),
  node(groupOutputId(GROUPS.catalog), "group_output", "Group Output", 1180, -1090, {}, GROUPS.catalog),
  node(GROUPS.rules, "group", "NODE-05 Economy Rules", -1540, -1660, {
    groupId: "node05_economy_rules",
    title: "NODE-05 Economy Rules",
    groupKind: "player_rules",
    zoneCanvas: false,
    groupInterface: groupInterface([outputPort("policy", "Policy", "policy", true)]),
    interfacePresetVersion: 1,
    collapsedSummary: false
  }),
  node(groupInputId(GROUPS.rules), "group_input", "Group Input", -1120, -470, {}, GROUPS.rules),
  node(groupOutputId(GROUPS.rules), "group_output", "Group Output", 1040, -160, {}, GROUPS.rules),
  node(GROUPS.ui, "group", "NODE-05 Economy UI", -1120, -1660, {
    groupId: "node05_economy_ui",
    title: "NODE-05 Economy UI",
    groupKind: "ui",
    zoneCanvas: false,
    groupInterface: groupInterface([
      outputPort("uimodules", "UI Modules", "uiModule", true),
      outputPort("uilayout", "UI Layout", "uiPackage", true)
    ]),
    interfacePresetVersion: 1,
    collapsedSummary: false
  }),
  node(groupInputId(GROUPS.ui), "group_input", "Group Input", -820, 350, {}, GROUPS.ui),
  node(groupOutputId(GROUPS.ui), "group_output", "Group Output", 960, 640, {}, GROUPS.ui)
];

const catalogNodes = [
  node("node05_catalog_output", "catalog_output", "NODE-05 Economy Catalog Output", 880, -1090, {
    catalogId: "catalog.node05.economy",
    catalogVersion: "0.5.0",
    namespaceOwnership: ["node05", "economy", "crafting", "vendor", "market"]
  }, GROUPS.catalog),
  node("node05_item_iron_ore", "item_definition", "NODE-05 Iron Ore", -1280, -1340, {
    itemId: "item.iron_ore",
    displayName: "Iron Ore",
    internalLabel: "NODE-05 crafting material",
    definitionVersion: 1,
    tags: ["item", "material", "ore", "node05"],
    category: "material",
    rarity: "common",
    stackable: true,
    stackLimit: 99,
    weight: 0.4,
    vendorBaseValueMinor: 3,
    vendorCurrencyRef: "currency.gold",
    bindPolicy: "unbound",
    tradable: true,
    droppable: true,
    destroyable: true,
    marketEligible: true,
    questItem: false,
    inventoryTags: ["material", "ore", "crafting", "market"]
  }, GROUPS.catalog),
  node("node05_item_repair_kit", "item_definition", "NODE-05 Desert Repair Kit", -1280, -1210, {
    itemId: "item.desert_repair_kit",
    displayName: "Desert Repair Kit",
    internalLabel: "NODE-05 crafted test item",
    definitionVersion: 1,
    tags: ["item", "crafted", "utility", "node05"],
    category: "consumable",
    rarity: "uncommon",
    stackable: true,
    stackLimit: 20,
    weight: 0.8,
    vendorBaseValueMinor: 12,
    vendorCurrencyRef: "currency.gold",
    bindPolicy: "unbound",
    tradable: true,
    droppable: true,
    destroyable: true,
    marketEligible: true,
    questItem: false,
    inventoryTags: ["crafted", "utility", "market"]
  }, GROUPS.catalog),
  node("node05_item_water_flask", "item_definition", "NODE-05 Water Flask", -1280, -1080, {
    itemId: "item.water_flask",
    displayName: "Water Flask",
    internalLabel: "NODE-05 vendor consumable",
    definitionVersion: 1,
    tags: ["item", "consumable", "vendor", "node05"],
    category: "consumable",
    rarity: "common",
    stackable: true,
    stackLimit: 20,
    weight: 0.3,
    vendorBaseValueMinor: 2,
    vendorCurrencyRef: "currency.gold",
    bindPolicy: "unbound",
    tradable: true,
    droppable: true,
    destroyable: true,
    marketEligible: true,
    questItem: false,
    inventoryTags: ["consumable", "vendor"]
  }, GROUPS.catalog),
  node("node05_loot_entry_iron_ore", "loot_item_entry", "NODE-05 Iron Ore Loot Entry", -980, -1340, {
    entryId: "loot_entry.node05.iron_ore",
    itemRef: "item.iron_ore",
    chance: 1,
    weight: 1,
    minQuantity: 1,
    maxQuantity: 2,
    guaranteed: true,
    qualityMode: "definition",
    qualityValue: "",
    modifierPoolRefs: [],
    conditionTagQuery: { all: [], any: [], none: [] }
  }, GROUPS.catalog),
  node("node05_loot_table_iron_ore", "loot_table", "NODE-05 Iron Ore Loot Table", -700, -1340, {
    lootTableId: "loot_table.node05.iron_ore",
    displayName: "Iron Ore Yield",
    internalLabel: "NODE-05 ore gather yield",
    definitionVersion: 1,
    tags: ["loot", "ore", "node05"],
    rollMode: "all",
    rollCount: 1,
    allowDuplicates: true,
    ownershipMode: "personal",
    partyLootPolicyRef: "policy.party_loot.node05.personal",
    pityPolicy: "none",
    pityCount: 0
  }, GROUPS.catalog),
  node("node05_resource_iron_ore", "resource_definition", "NODE-05 Iron Ore Resource", -420, -1340, {
    resourceId: "resource.node05.iron_ore",
    displayName: "Iron Ore",
    internalLabel: "NODE-05 craft resource",
    definitionVersion: 1,
    tags: ["resource", "ore", "crafting", "node05"],
    worldModelAssetId: ASSETS.forge,
    iconAssetId: null,
    yieldLootTableRef: "loot_table.node05.iron_ore",
    yieldItemRefs: ["item.iron_ore"],
    requiredToolTagQuery: { all: [], any: [], none: [] },
    requiredAbilityRef: "ability.gather_sun_crystal",
    requiredSkillStatRef: null,
    requiredSkillValue: 0,
    harvestDurationMs: 1000,
    depletionMode: "disappear",
    respawnPolicyRef: "respawn_policy.node03_quick",
    scope: "per_player",
    ownershipClaimMs: 0,
    harvestAnimationRole: "gather",
    gatherAudioRef: "audio.gather.node03",
    gatherVfxRef: "vfx.gather.node03",
    depletedModelAssetId: null
  }, GROUPS.catalog),
  node("node05_recipe_ing_wood", "recipe_ingredient", "Recipe Input Wood", -980, -900, {
    ingredientId: "recipe_ingredient.node05.wood",
    kind: "item",
    itemRef: "item.wood",
    itemTagQuery: { all: [], any: [], none: [] },
    currencyRef: null,
    amount: 2,
    consume: true,
    alternativesGroup: "",
    selectionPolicy: "oldest_first"
  }, GROUPS.catalog),
  node("node05_recipe_ing_iron_ore", "recipe_ingredient", "Recipe Input Iron Ore", -980, -770, {
    ingredientId: "recipe_ingredient.node05.iron_ore",
    kind: "item",
    itemRef: "item.iron_ore",
    itemTagQuery: { all: [], any: [], none: [] },
    currencyRef: null,
    amount: 1,
    consume: true,
    alternativesGroup: "",
    selectionPolicy: "oldest_first"
  }, GROUPS.catalog),
  node("node05_recipe_repair_kit", "recipe_definition", "Recipe Desert Repair Kit", -620, -840, {
    recipeId: "recipe.node05.desert_repair_kit",
    displayName: "Desert Repair Kit",
    internalLabel: "NODE-05 test crafting recipe",
    definitionVersion: 1,
    tags: ["recipe", "crafting", "node05"],
    description: "Craft a repair kit from Wood and Iron Ore.",
    category: "utility",
    stationType: "crafting.forge",
    craftDurationMs: 0,
    batchAllowed: false,
    maxBatch: 1,
    consumeTiming: "start",
    cancelPolicy: "no_refund",
    unlockMode: "default_available",
    successPolicy: "guaranteed",
    outputItems: [{ itemRef: "item.desert_repair_kit", amount: 1 }],
    outputCurrencies: [],
    tradabilityOverride: "inherit_outputs",
    visibleWhenLocked: true,
    contentVersion: 1
  }, GROUPS.catalog),
  node("node05_vendor_offer_water", "vendor_offer", "Vendor Offer Water", -970, -500, {
    offerId: "vendor_offer.node05.water_flask",
    itemRef: "item.water_flask",
    mode: "sell_to_player",
    sellCurrencyRef: "currency.gold",
    sellPriceMinor: 5,
    buyCurrencyRef: "currency.gold",
    buyPriceMinor: 1,
    stockMode: "infinite",
    initialStock: 0,
    maxStock: 0,
    restockAmount: 0,
    restockSeconds: 0,
    bindOnPurchase: false
  }, GROUPS.catalog),
  node("node05_vendor_offer_sun_shard", "vendor_offer", "Vendor Offer Sun Shard", -970, -370, {
    offerId: "vendor_offer.node05.sun_shard",
    itemRef: "item.sun_shard",
    mode: "buy_from_player",
    sellCurrencyRef: "currency.gold",
    sellPriceMinor: 0,
    buyCurrencyRef: "currency.gold",
    buyPriceMinor: 3,
    stockMode: "infinite",
    initialStock: 0,
    maxStock: 0,
    restockAmount: 0,
    restockSeconds: 0,
    bindOnPurchase: false
  }, GROUPS.catalog),
  node("node05_vendor_offer_repair_kit", "vendor_offer", "Vendor Offer Repair Kit", -970, -240, {
    offerId: "vendor_offer.node05.repair_kit",
    itemRef: "item.desert_repair_kit",
    mode: "both",
    sellCurrencyRef: "currency.gold",
    sellPriceMinor: 35,
    buyCurrencyRef: "currency.gold",
    buyPriceMinor: 12,
    stockMode: "infinite",
    initialStock: 0,
    maxStock: 0,
    restockAmount: 0,
    restockSeconds: 0,
    bindOnPurchase: false
  }, GROUPS.catalog),
  node("node05_vendor_catalog_home", "vendor_catalog", "Home Base Vendor Catalog", -620, -370, {
    vendorCatalogId: "vendor_catalog.node05.home_base",
    displayName: "Home Base Supplies",
    internalLabel: "NODE-05 vendor test catalog",
    definitionVersion: 1,
    tags: ["vendor", "start", "node05"],
    refreshPolicy: "static",
    refreshIntervalSeconds: 0,
    buybackEnabled: true,
    buybackDurationSeconds: 3600,
    sellAllowed: true,
    stockScope: "infinite",
    contentVersion: 1
  }, GROUPS.catalog)
];

const ruleNodes = [
  node("node05_policy_crafting", "crafting_policy", "NODE-05 Crafting Policy", -880, -410, {
    policyId: "policy.crafting.node05",
    maxConcurrentJobs: 2,
    allowOfflineCompletion: true,
    inventoryOverflowPolicy: "mail",
    cancelAllowed: false,
    defaultRefundPercent: 0,
    stationDistance: 5,
    operationTimeoutMs: 10000
  }, GROUPS.rules),
  node("node05_policy_vendor", "vendor_policy", "NODE-05 Vendor Policy", -880, -280, {
    policyId: "policy.vendor.node05",
    enabled: true,
    defaultDistance: 5,
    allowSellFromInventory: true
  }, GROUPS.rules),
  node("node05_policy_party_loot", "party_loot_policy", "NODE-05 Party Loot Policy", -880, -150, {
    policyId: "policy.party_loot.node05.personal",
    mode: "personal",
    minimumContributionPercent: 0,
    lootDistance: 40,
    ownershipSeconds: 120,
    currencyMode: "personal"
  }, GROUPS.rules),
  node("node05_policy_party", "party_rules", "NODE-05 Party Rules", -600, -410, {
    policyId: "policy.party.node05",
    maxSize: 5,
    inviteTimeoutSeconds: 180,
    kickAllowed: true,
    sameWorldRequired: true,
    sameZoneForSharedCredit: true,
    questCreditPolicy: "individual",
    partyLootPolicyRef: "policy.party_loot.node05.personal"
  }, GROUPS.rules),
  node("node05_policy_trade", "trade_policy", "NODE-05 Trade Policy", -600, -280, {
    policyId: "policy.trade.node05",
    enabled: true,
    minimumLevel: 1,
    sameWorldRequired: true,
    maximumDistance: 20,
    allowCurrency: true,
    allowedCurrencyRefs: ["currency.gold"],
    maxItemSlotsPerSide: 8,
    confirmDelayMs: 1000,
    combatBlocked: true
  }, GROUPS.rules),
  node("node05_policy_market", "market_policy", "NODE-05 Market Policy", -320, -410, {
    policyId: "policy.market.node05",
    enabled: true,
    listingMode: "fixed_price",
    allowPartialFills: true,
    allowedCurrencyRefs: ["currency.gold"],
    defaultDurationSeconds: 86400,
    minimumPriceMinor: 1,
    maxActiveListingsPerCharacter: 20,
    cancelAllowed: true,
    saleTaxBasisPoints: 500,
    inventoryOverflowPolicy: "mail"
  }, GROUPS.rules),
  node("node05_policy_market_tax", "economy_tax_rule", "NODE-05 Market Tax", -320, -280, {
    policyId: "policy.economy_tax.node05.market_sale",
    operationKind: "sale",
    currencyRef: "currency.gold",
    basisPoints: 500,
    minimumFeeMinor: 0,
    maximumFeeMinor: 0,
    ledgerReason: "market_tax"
  }, GROUPS.rules),
  node("node05_policy_mail", "mail_policy", "NODE-05 Mail Policy", -320, -150, {
    policyId: "policy.mail.node05",
    maxMailboxMessages: 100,
    maxAttachmentsPerMessage: 8,
    expiryDays: 30,
    allowPlayerMail: false,
    systemDeliveryOnly: true,
    claimAllAllowed: true
  }, GROUPS.rules)
];

const uiNodes = [
  node("node05_hud_layout", "hud_layout", "NODE-05 HUD Layout", -540, 420, {
    layoutId: "ui_layout.node05.hud",
    uiScale: 1,
    safeArea: { top: 12, right: 12, bottom: 12, left: 12 },
    breakpoints: { mobile: 720, tablet: 1024 }
  }, GROUPS.ui),
  node("node05_party_hud", "party_hud", "NODE-05 Party HUD", -500, 600, {
    moduleId: "hud.node05.party",
    anchor: "center-left",
    showInvite: true,
    showMemberStats: true
  }, GROUPS.ui),
  node("node05_vendor_hud", "vendor_hud", "NODE-05 Vendor HUD", -260, 600, {
    moduleId: "hud.node05.vendor",
    anchor: "center-right",
    maxOffers: 6,
    showSellTab: true
  }, GROUPS.ui),
  node("node05_crafting_hud", "crafting_hud", "NODE-05 Crafting HUD", -20, 600, {
    moduleId: "hud.node05.crafting",
    anchor: "center-right",
    maxRecipes: 6,
    showJobs: true
  }, GROUPS.ui),
  node("node05_trade_hud", "trade_hud", "NODE-05 Trade HUD", 220, 600, {
    moduleId: "hud.node05.trade",
    anchor: "center",
    compactWhenIdle: true
  }, GROUPS.ui),
  node("node05_market_hud", "market_hud", "NODE-05 Market HUD", 460, 600, {
    moduleId: "hud.node05.market",
    anchor: "center-left",
    pageSize: 6,
    showMyOrders: true
  }, GROUPS.ui),
  node("node05_mail_hud", "mail_hud", "NODE-05 Mail HUD", 700, 600, {
    moduleId: "hud.node05.mail",
    anchor: "bottom-left",
    maxMessages: 5,
    showClaimAll: true
  }, GROUPS.ui)
];

const startZoneNodes = [
  node("node05_model_forge", "model_entity", "Start Forge", -980, 210, {
    entityId: "entity_node05_start_forge",
    label: "Start Forge",
    modelAssetId: ASSETS.forge,
    animationClip: null,
    idleAnimation: null,
    walkAnimation: null,
    runAnimation: null,
    x: 15,
    y: 0,
    z: -8,
    rotationX: 0,
    rotationY: 25,
    rotationZ: 0,
    scaleX: 0.85,
    scaleY: 0.85,
    scaleZ: 0.85,
    solid: false,
    walkable: false,
    collisionRadius: 1.2
  }, IDS.startGroup),
  node("node05_component_forge", "crafting_station_component", "Start Forge Crafting", -720, 210, {
    componentId: "component.node05.start_forge",
    linkedEntityId: "entity_node05_start_forge",
    stationId: "station.node05.start_forge",
    stationType: "crafting.forge",
    recipeRefs: ["recipe.node05.desert_repair_kit"],
    recipeTagQuery: { all: [], any: [], none: [] },
    craftingPolicyRef: "policy.crafting.node05",
    interactionPrompt: "Craft",
    range: 5
  }, IDS.startGroup),
  node("node05_model_vendor", "model_entity", "Home Base Vendor", -980, 360, {
    entityId: "entity_node05_home_vendor",
    label: "Mira Trader",
    modelAssetId: ASSETS.blacksmith,
    animationClip: null,
    idleAnimation: null,
    walkAnimation: null,
    runAnimation: null,
    x: 19,
    y: 0,
    z: -12,
    rotationX: 0,
    rotationY: 190,
    rotationZ: 0,
    scaleX: 1.05,
    scaleY: 1.05,
    scaleZ: 1.05,
    solid: false,
    walkable: false,
    collisionRadius: 1
  }, IDS.startGroup),
  node("node05_component_vendor", "vendor_component", "Home Base Vendor Component", -720, 360, {
    componentId: "component.node05.home_vendor",
    linkedEntityId: "entity_node05_home_vendor",
    vendorId: "vendor.node05.home_base",
    vendorCatalogRef: "vendor_catalog.node05.home_base",
    interactionPrompt: "Trade",
    range: 5
  }, IDS.startGroup),
  node("node05_model_market_board", "model_entity", "Market Board", -980, 510, {
    entityId: "entity_node05_market_board",
    label: "Market Board",
    modelAssetId: ASSETS.tavern,
    animationClip: null,
    idleAnimation: null,
    walkAnimation: null,
    runAnimation: null,
    x: 23,
    y: 0,
    z: -8,
    rotationX: 0,
    rotationY: 75,
    rotationZ: 0,
    scaleX: 0.45,
    scaleY: 0.45,
    scaleZ: 0.45,
    solid: false,
    walkable: false,
    collisionRadius: 1.4
  }, IDS.startGroup),
  node("node05_component_market", "marketplace_access_component", "Market Access Component", -720, 510, {
    componentId: "component.node05.market_board",
    linkedEntityId: "entity_node05_market_board",
    marketAccessId: "market.node05.home_board",
    marketPolicyRef: "policy.market.node05",
    interactionPrompt: "Market",
    remoteAccessAllowed: false,
    range: 5
  }, IDS.startGroup)
];

const desertZoneNodes = [
  node("node05_resource_spawn_iron_ore", "resource_spawn", "NODE-05 Iron Ore Spawn", -1380, 90, {
    spawnEntryId: "spawn.node05.iron_ore",
    resourceRef: "resource.node05.iron_ore",
    count: 4,
    x: 58,
    y: 0,
    z: 455,
    radius: 10,
    minimumSpacing: 3,
    distribution: "blue_noise",
    respawnOverrideRef: "respawn_policy.node03_quick",
    yieldMultiplier: 1,
    markerPolicyRef: null
  }, IDS.desertGroup),
  node("node05_model_iron_ore", "model_entity", "Iron Ore Outcrop", -1110, 90, {
    entityId: "entity_node05_iron_ore_outcrop",
    label: "Iron Ore",
    modelAssetId: ASSETS.alchemyLab,
    animationClip: null,
    idleAnimation: null,
    walkAnimation: null,
    runAnimation: null,
    x: 58,
    y: 0,
    z: 455,
    rotationX: 0,
    rotationY: 20,
    rotationZ: 0,
    scaleX: 0.42,
    scaleY: 0.42,
    scaleZ: 0.42,
    solid: false,
    walkable: false,
    collisionRadius: 1
  }, IDS.desertGroup)
];

const edges = [
  edge("edge_node05_catalog_group_to_registry", GROUPS.catalog, "catalogpackage", IDS.catalogRegistry, "catalogPackage"),
  edge("edge_node05_catalog_output_to_group", "node05_catalog_output", "catalogPackage", groupOutputId(GROUPS.catalog), "catalogpackage"),
  edge("edge_node05_loot_entry_ore_to_table", "node05_loot_entry_iron_ore", "lootEntry", "node05_loot_table_iron_ore", "entries"),
  edge("edge_node05_recipe_wood_to_recipe", "node05_recipe_ing_wood", "ingredient", "node05_recipe_repair_kit", "ingredients"),
  edge("edge_node05_recipe_ore_to_recipe", "node05_recipe_ing_iron_ore", "ingredient", "node05_recipe_repair_kit", "ingredients"),
  edge("edge_node05_vendor_water_to_catalog", "node05_vendor_offer_water", "vendorOffer", "node05_vendor_catalog_home", "offers"),
  edge("edge_node05_vendor_sun_to_catalog", "node05_vendor_offer_sun_shard", "vendorOffer", "node05_vendor_catalog_home", "offers"),
  edge("edge_node05_vendor_repair_to_catalog", "node05_vendor_offer_repair_kit", "vendorOffer", "node05_vendor_catalog_home", "offers"),
  ...catalogNodes.filter(function (entry) {
    return !["catalog_output", "loot_item_entry", "recipe_ingredient", "vendor_offer"].includes(entry.type);
  }).map(function (entry, index) {
    return edge("edge_node05_catalog_def_" + String(index).padStart(2, "0"), entry.id, "catalogDefinition", "node05_catalog_output", "definitions");
  }),
  edge("edge_node05_rules_group_to_output", GROUPS.rules, "policy", IDS.playerRulesOutput, "policy"),
  ...ruleNodes.map(function (entry, index) {
    return edge("edge_node05_policy_" + String(index).padStart(2, "0"), entry.id, "policy", groupOutputId(GROUPS.rules), "policy");
  }),
  edge("edge_node05_ui_group_modules_to_output", GROUPS.ui, "uimodules", IDS.uiOutput, "uiModules"),
  edge("edge_node05_ui_group_layout_to_output", GROUPS.ui, "uilayout", IDS.uiOutput, "uiLayout"),
  edge("edge_node05_hud_layout_to_group", "node05_hud_layout", "uiLayout", groupOutputId(GROUPS.ui), "uilayout"),
  ...uiNodes.filter(function (entry) { return entry.type !== "hud_layout"; }).map(function (entry, index) {
    return edge("edge_node05_ui_module_" + String(index).padStart(2, "0"), entry.id, "uiModule", groupOutputId(GROUPS.ui), "uimodules");
  }),
  ...uiNodes.filter(function (entry) { return entry.type !== "hud_layout"; }).map(function (entry, index) {
    return edge("edge_node05_ui_module_layout_" + String(index).padStart(2, "0"), entry.id, "uiModule", "node05_hud_layout", "modules");
  }),
  edge("edge_node05_forge_model_to_start", "node05_model_forge", "entity", IDS.startOutput, "entities"),
  edge("edge_node05_forge_component_to_start", "node05_component_forge", "component", IDS.startOutput, "entityComponents"),
  edge("edge_node05_vendor_model_to_start", "node05_model_vendor", "entity", IDS.startOutput, "entities"),
  edge("edge_node05_vendor_component_to_start", "node05_component_vendor", "component", IDS.startOutput, "entityComponents"),
  edge("edge_node05_market_model_to_start", "node05_model_market_board", "entity", IDS.startOutput, "entities"),
  edge("edge_node05_market_component_to_start", "node05_component_market", "component", IDS.startOutput, "entityComponents"),
  edge("edge_node05_ore_spawn_to_desert_set", "node05_resource_spawn_iron_ore", "spawnEntry", IDS.desertSpawnSet, "spawns"),
  edge("edge_node05_ore_model_to_desert", "node05_model_iron_ore", "entity", IDS.desertOutput, "entities")
];

for (const [id, label] of [
  [IDS.startGroup, "start zone group"],
  [IDS.startZone, "start zone definition"],
  [IDS.startOutput, "start zone output"],
  [IDS.desertGroup, "Desert group"],
  [IDS.desertZone, "Desert zone definition"],
  [IDS.desertOutput, "Desert zone output"],
  [IDS.desertSpawnSet, "Desert spawn set"],
  [IDS.catalogRegistry, "foundation catalog registry"],
  [IDS.playerRulesOutput, "foundation player rules output"],
  [IDS.uiOutput, "foundation UI output"],
  [IDS.projectSettings, "foundation project settings"]
]) {
  requireNode(id, label);
}

const backupPath = ensureBackup();
let appliedNodes = 0;
let appliedEdges = 0;

db.exec("BEGIN IMMEDIATE");
try {
  const startZoneValues = parseJson(selectNode.get(IDS.startZone)?.values_json, {});
  const desertZoneValues = parseJson(selectNode.get(IDS.desertZone)?.values_json, {});
  mergeExistingNodeValues(IDS.projectSettings, {
    startZoneRef: "zone.node02.live_demo",
    startSpawnRef: "spawn.node02.live_demo_default"
  });
  mergeExistingNodeValues(IDS.startZone, {
    displayName: "Start Zone",
    zoneTags: tagUnion(startZoneValues.zoneTags, ["start", "home_base", "node05", "economy", "crafting", "vendor", "market"])
  });
  mergeExistingNodeValues(IDS.desertZone, {
    displayName: "Desert",
    biomeTags: tagUnion(desertZoneValues.biomeTags, ["desert"]),
    zoneTags: tagUnion(desertZoneValues.zoneTags, ["desert", "road", "node03", "node04", "node05", "combat", "resources", "loot", "crafting_materials"])
  });

  for (const entry of groupNodes.concat(catalogNodes, ruleNodes, uiNodes, startZoneNodes, desertZoneNodes)) {
    upsertNode(entry);
    appliedNodes += 1;
  }
  for (const entry of edges) {
    upsertEdge(entry.id, entry.fromNodeId, entry.fromPort, entry.toNodeId, entry.toPort);
    appliedEdges += 1;
  }
  db.prepare("DELETE FROM draft_world_state").run();
  touchGraphRevision();
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

let publishedAt = null;
let validation = null;
try {
  const symbolIndexService = new SymbolIndexService();
  const assetService = new AssetService(db, rootDir);
  const tokenResolver = new TokenResolver({ symbolIndexService });
  const repository = new GraphRepository(db, { symbolIndexService });
  const gameProjectCompiler = new GameProjectCompiler({ symbolIndexService, tokenResolver, assetService });
  const publishService = new PublishService(repository, { assetService, symbolIndexService, tokenResolver, gameProjectCompiler });
  validation = publishService.validate();
  if (!validation.ok) {
    const error = new Error("NODE-05 graph validation failed.");
    error.details = validation;
    throw error;
  }
  const result = publishService.publish("codex-node05");
  publishedAt = result.world?.publishedAt || null;
} finally {
  db.close();
}

console.log(JSON.stringify({
  ok: true,
  backupPath,
  nodesUpserted: appliedNodes,
  edgesEnsured: appliedEdges,
  publishedAt,
  validation,
  startServices: {
    forge: "station.node05.start_forge",
    vendor: "vendor.node05.home_base",
    market: "market.node05.home_board"
  },
  desertResource: "resource.node05.iron_ore",
  recipe: "recipe.node05.desert_repair_kit"
}, null, 2));
