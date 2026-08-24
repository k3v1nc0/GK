import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NODE_TYPES } from "../src/shared/node-types.js";
import { cleanValuesForType } from "../src/server/field-validation.js";
import { openDatabase, resolveDatabasePath } from "../src/server/db.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = resolveDatabasePath(rootDir);
const db = openDatabase(rootDir);

const IDS = Object.freeze({
  desertGroup: "node_zone_canvas_55fbbba0",
  desertZone: "node_zone_definition_eb02ee73",
  desertOutput: "node_zone_output_5fdf926d",
  desertGroupOutput: "group_output__node_zone_canvas_55fbbba0",
  startGroup: "node_group_96a070e2",
  startZone: "node_zone_definition_872d5230",
  startOutput: "node_zone_output_b438151a",
  startSpawn: "node_spawn_point_729d8266",
  adjacentZoneGroup: "node_zone_canvas_a9b6b432",
  adjacentZoneOutput: "node_zone_output_c9267136",
  catalogRegistry: "foundation.catalog_registry",
  playerRulesOutput: "foundation.player_rules_output",
  uiOutput: "foundation.ui_output",
  projectSettings: "foundation.game_project_settings",
  playerCharacter: "node_player_character_50886655"
});

const ASSETS = Object.freeze({
  wizard: "asset_855c702a-9edc-4ada-a7c1-f33d0000a928",
  blacksmith: "asset_74948957-7106-4c24-835e-4d817ddfdc76",
  forge: "asset_ac271a8c-da70-471e-8a72-3d7ece0b40a3",
  tree: "asset_3e5cc4d3-927c-4715-b2e5-bc2b03171c41",
  bridge: "asset_d03d9d8b-c47b-4e93-8655-feffe0a5397d",
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

function requireNode(id, label) {
  const row = db.prepare("SELECT id FROM editor_nodes WHERE id = ? LIMIT 1").get(id);
  if (!row) throw new Error("Missing required " + label + " node: " + id);
}

function ensureBackup() {
  const backupPath = path.join(path.dirname(dbPath), "gk-real-node-editor.sqlite.node03-desert-demo-before.sqlite");
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
  if (!definition) throw new Error("Unknown node type for demo: " + node.type);
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

function node(id, type, title, x, y, values, parentId = IDS.desertGroup) {
  return { id, type, title, x, y, parentId, values };
}

function edge(id, fromNodeId, fromPort, toNodeId, toPort) {
  return { id, fromNodeId, fromPort, toNodeId, toPort };
}

const catalogOutput = node(
  "node03_demo_catalog_output_desert",
  "catalog_output",
  "NODE-03 Desert Catalog Output",
  -1360,
  -980,
  {
    catalogId: "catalog.desert.node03",
    catalogVersion: "0.3.0",
    namespaceOwnership: ["desert", "node03", "combat", "resources", "loot"]
  }
);

const catalogNodes = [
  catalogOutput,
  node("node03_demo_currency_gold", "currency_definition", "NODE-03 Gold Currency", -1600, -850, {
    currencyId: "currency.gold",
    displayName: "Gold",
    internalLabel: "NODE-03 demo wallet currency",
    definitionVersion: 1,
    tags: ["currency", "wallet", "demo"],
    precision: 0,
    maxBalanceMinor: 1000000,
    tradable: false,
    marketAllowed: false,
    showInPrimaryWallet: true,
    sortOrder: 1,
    sourceTags: ["loot", "quest"],
    sinkTags: ["vendor", "repair"]
  }),
  node("node03_demo_equipment_main_hand", "equipment_slot_definition", "NODE-03 Main Hand Slot", -1600, -720, {
    slotId: "equipment_slot.main_hand",
    displayName: "Main Hand",
    internalLabel: "NODE-03 demo weapon slot",
    definitionVersion: 1,
    tags: ["equipment", "weapon"],
    allowedItemTags: { all: [], any: ["weapon"], none: [] },
    maxItems: 1,
    uiOrder: 10
  }),
  node("node03_demo_item_modifier_sun_touched", "item_modifier_definition", "NODE-03 Sun Touched Modifier", -1600, -590, {
    modifierId: "item_modifier.sun_touched",
    displayName: "Sun Touched",
    internalLabel: "NODE-03 demo item modifier",
    definitionVersion: 1,
    tags: ["modifier", "desert", "weapon"],
    applicableItemTagQuery: { all: [], any: ["weapon"], none: [] },
    statChanges: [{ statRef: "stat.attack_power", mode: "add", value: 4 }],
    rarityWeight: 1
  }),
  node("node03_demo_item_sun_shard", "item_definition", "NODE-03 Sun Shard Item", -1600, -460, {
    itemId: "item.sun_shard",
    displayName: "Sun Shard",
    internalLabel: "NODE-03 resource yield",
    definitionVersion: 1,
    tags: ["item", "resource", "desert"],
    category: "material",
    rarity: "uncommon",
    stackable: true,
    stackLimit: 99,
    weight: 0.1,
    vendorBaseValueMinor: 4,
    vendorCurrencyRef: "currency.gold",
    bindPolicy: "unbound",
    inventoryTags: ["material", "resource", "desert"]
  }),
  node("node03_demo_item_raider_token", "item_definition", "NODE-03 Raider Token Item", -1600, -330, {
    itemId: "item.raider_token",
    displayName: "Raider Token",
    internalLabel: "NODE-03 enemy loot item",
    definitionVersion: 1,
    tags: ["item", "loot", "desert"],
    category: "material",
    rarity: "common",
    stackable: true,
    stackLimit: 50,
    weight: 0.05,
    vendorBaseValueMinor: 2,
    vendorCurrencyRef: "currency.gold",
    bindPolicy: "unbound",
    inventoryTags: ["material", "loot", "desert"]
  }),
  node("node03_demo_item_desert_sword", "item_definition", "NODE-03 Desert Sword Item", -1600, -200, {
    itemId: "item.desert_sword",
    displayName: "Desert Sword",
    internalLabel: "NODE-03 equipment pickup",
    definitionVersion: 1,
    tags: ["item", "equipment", "weapon", "desert"],
    worldModelAssetId: ASSETS.forge,
    category: "equipment",
    subcategory: "sword",
    rarity: "rare",
    stackable: false,
    stackLimit: 1,
    weight: 3,
    vendorBaseValueMinor: 125,
    vendorCurrencyRef: "currency.gold",
    bindPolicy: "bind_on_equip",
    equipmentSlotRef: "equipment_slot.main_hand",
    durabilityMax: 100,
    statModifierRefs: ["item_modifier.sun_touched"],
    pickupAudioRef: "audio.pickup.node03",
    pickupVfxRef: "vfx.pickup.node03",
    inventoryTags: ["equipment", "weapon", "desert"]
  }),
  node("node03_demo_stat_health", "stat_definition", "NODE-03 Health Stat", -1290, -850, {
    statId: "stat.health",
    displayName: "Health",
    internalLabel: "NODE-03 health stat",
    definitionVersion: 1,
    tags: ["stat", "combat", "vital"],
    valueType: "integer",
    minimum: 0,
    maximum: 1000,
    defaultValue: 100,
    persistCurrentValue: true,
    replicateMode: "nearby",
    uiFormat: "number"
  }),
  node("node03_demo_stat_mana", "stat_definition", "NODE-03 Mana Stat", -1290, -720, {
    statId: "stat.mana",
    displayName: "Mana",
    internalLabel: "NODE-03 mana stat",
    definitionVersion: 1,
    tags: ["stat", "resource", "vital"],
    valueType: "integer",
    minimum: 0,
    maximum: 500,
    defaultValue: 60,
    persistCurrentValue: true,
    replicateMode: "owner",
    uiFormat: "number"
  }),
  node("node03_demo_stat_armor", "stat_definition", "NODE-03 Armor Stat", -1290, -590, {
    statId: "stat.armor",
    displayName: "Armor",
    internalLabel: "NODE-03 armor stat",
    definitionVersion: 1,
    tags: ["stat", "combat", "defense"],
    valueType: "integer",
    minimum: 0,
    maximum: 500,
    defaultValue: 0,
    persistCurrentValue: false,
    replicateMode: "nearby",
    uiFormat: "number"
  }),
  node("node03_demo_stat_attack_power", "stat_definition", "NODE-03 Attack Power Stat", -1290, -460, {
    statId: "stat.attack_power",
    displayName: "Attack Power",
    internalLabel: "NODE-03 attack stat",
    definitionVersion: 1,
    tags: ["stat", "combat", "offense"],
    valueType: "integer",
    minimum: 0,
    maximum: 500,
    defaultValue: 10,
    persistCurrentValue: false,
    replicateMode: "nearby",
    uiFormat: "number"
  }),
  node("node03_demo_stat_block_player", "stat_block", "NODE-03 Player Stat Block", -990, -850, {
    statBlockId: "stat_block.player.desert",
    displayName: "Desert Player Stats",
    internalLabel: "NODE-03 playable baseline",
    definitionVersion: 1,
    tags: ["stat_block", "player", "desert"],
    entries: [
      { statRef: "stat.health", baseValue: 140 },
      { statRef: "stat.mana", baseValue: 80 },
      { statRef: "stat.armor", baseValue: 8 },
      { statRef: "stat.attack_power", baseValue: 18 }
    ],
    overrideMode: "merge"
  }),
  node("node03_demo_stat_block_enemy", "stat_block", "NODE-03 Enemy Stat Block", -990, -720, {
    statBlockId: "stat_block.enemy.sand_raider",
    displayName: "Sand Raider Stats",
    internalLabel: "NODE-03 enemy baseline",
    definitionVersion: 1,
    tags: ["stat_block", "enemy", "desert"],
    entries: [
      { statRef: "stat.health", baseValue: 65 },
      { statRef: "stat.armor", baseValue: 3 },
      { statRef: "stat.attack_power", baseValue: 12 }
    ],
    overrideMode: "merge"
  }),
  node("node03_demo_stat_curve_xp", "stat_curve", "NODE-03 XP Curve", -990, -590, {
    curveId: "stat_curve.player_xp",
    displayName: "Player XP Curve",
    internalLabel: "NODE-03 level curve",
    definitionVersion: 1,
    tags: ["curve", "xp", "player"],
    inputKind: "level",
    interpolation: "linear",
    points: [{ x: 1, y: 0 }, { x: 2, y: 100 }, { x: 3, y: 240 }, { x: 4, y: 420 }],
    clampBefore: true,
    clampAfter: true
  }),
  node("node03_demo_damage_physical", "damage_type_definition", "NODE-03 Physical Damage", -680, -850, {
    damageTypeId: "damage_type.physical",
    displayName: "Physical",
    internalLabel: "NODE-03 physical damage",
    definitionVersion: 1,
    tags: ["damage", "physical"],
    resistanceStatRef: "stat.armor",
    color: "#f8fafc",
    hitVfxRef: "vfx.hit.node03",
    hitAudioRef: "audio.hit.node03"
  }),
  node("node03_demo_status_sun_scorch", "status_effect_definition", "NODE-03 Sun Scorch Status", -680, -720, {
    statusEffectId: "status_effect.sun_scorch",
    displayName: "Sun Scorch",
    internalLabel: "NODE-03 damage over time",
    definitionVersion: 1,
    tags: ["status", "damage", "desert"],
    durationMs: 4000,
    maxStacks: 3,
    stackMode: "refresh_duration",
    tickIntervalMs: 1000,
    damagePerTickFormula: { operator: "add", operands: [2] },
    damageTypeRef: "damage_type.physical",
    controlType: "none",
    applyVfxRef: "vfx.hit.node03"
  }),
  node("node03_demo_ability_basic_attack", "ability_definition", "NODE-03 Basic Attack Ability", -390, -850, {
    abilityId: "ability.basic_attack",
    displayName: "Basic Attack",
    internalLabel: "NODE-03 player attack",
    definitionVersion: 1,
    tags: ["ability", "combat", "weapon"],
    abilityType: "melee",
    cooldownMs: 800,
    castTimeMs: 0,
    globalCooldownMs: 500,
    range: 2.8,
    areaShape: "single",
    targetMode: "enemy",
    damageFormula: { operator: "add", operands: [16] },
    damageTypeRef: "damage_type.physical",
    statusEffectRefs: ["status_effect.sun_scorch"],
    animationRole: "basicAttack",
    impactAudioRef: "audio.hit.node03",
    impactVfxRef: "vfx.hit.node03"
  }),
  node("node03_demo_ability_gather_crystal", "ability_definition", "NODE-03 Gather Crystal Ability", -390, -720, {
    abilityId: "ability.gather_sun_crystal",
    displayName: "Gather Sun Crystal",
    internalLabel: "NODE-03 resource interaction",
    definitionVersion: 1,
    tags: ["ability", "gather", "resource"],
    abilityType: "gather",
    cooldownMs: 500,
    castTimeMs: 1200,
    range: 3,
    areaShape: "single",
    targetMode: "resource",
    damageFormula: null,
    damageTypeRef: null,
    animationRole: "gather",
    castAudioRef: "audio.gather.node03",
    impactVfxRef: "vfx.gather.node03"
  }),
  node("node03_demo_ability_wolf_bite", "ability_definition", "NODE-03 Raider Strike Ability", -390, -590, {
    abilityId: "ability.raider_strike",
    displayName: "Raider Strike",
    internalLabel: "NODE-03 enemy attack",
    definitionVersion: 1,
    tags: ["ability", "enemy", "combat"],
    abilityType: "melee",
    cooldownMs: 1200,
    range: 2.4,
    areaShape: "single",
    targetMode: "enemy",
    damageFormula: { operator: "add", operands: [10] },
    damageTypeRef: "damage_type.physical",
    animationRole: "basicAttack",
    impactAudioRef: "audio.hit.node03",
    impactVfxRef: "vfx.hit.node03"
  }),
  node("node03_demo_ability_rank_basic_attack_1", "ability_rank", "NODE-03 Basic Attack Rank 1", -390, -460, {
    abilityRankId: "ability_rank.basic_attack.1",
    displayName: "Basic Attack Rank 1",
    internalLabel: "NODE-03 starting rank",
    definitionVersion: 1,
    tags: ["ability_rank", "combat"],
    abilityRef: "ability.basic_attack",
    rank: 1,
    requiredPlayerLevel: 1,
    costMultiplier: 1,
    damageFormulaOverride: { operator: "add", operands: [18] }
  }),
  node("node03_demo_combat_profile_player", "combat_profile", "NODE-03 Player Combat Profile", -90, -850, {
    combatProfileId: "combat_profile.player.desert",
    displayName: "Desert Player Combat",
    internalLabel: "NODE-03 playable rotation",
    definitionVersion: 1,
    tags: ["combat_profile", "player"],
    basicAttackRef: "ability.basic_attack",
    abilityRefs: ["ability.basic_attack", "ability.gather_sun_crystal"],
    preferredRange: 2.8,
    aggroResponse: "defensive",
    abilitySelection: "priority",
    rotationEntries: [{ abilityRef: "ability.basic_attack", priority: 100 }],
    targetPriority: "nearest"
  }),
  node("node03_demo_combat_profile_enemy", "combat_profile", "NODE-03 Enemy Combat Profile", -90, -720, {
    combatProfileId: "combat_profile.enemy.sand_raider",
    displayName: "Sand Raider Combat",
    internalLabel: "NODE-03 enemy rotation",
    definitionVersion: 1,
    tags: ["combat_profile", "enemy"],
    basicAttackRef: "ability.raider_strike",
    abilityRefs: ["ability.raider_strike"],
    preferredRange: 2.4,
    aggroResponse: "aggressive",
    abilitySelection: "priority",
    rotationEntries: [{ abilityRef: "ability.raider_strike", priority: 100 }],
    targetPriority: "nearest"
  }),
  node("node03_demo_ai_sand_raider", "ai_behavior_profile", "NODE-03 Raider AI Profile", 220, -850, {
    aiProfileId: "ai_profile.sand_raider",
    displayName: "Sand Raider AI",
    internalLabel: "NODE-03 aggro profile",
    definitionVersion: 1,
    tags: ["ai", "enemy", "desert"],
    idleMode: "wander",
    sightRange: 28,
    hearingRange: 12,
    aggroRange: 18,
    assistRange: 10,
    leashDistance: 45,
    preferredRange: 2.4,
    chaseSpeedMultiplier: 1.15,
    callForHelp: true,
    wanderRadius: 16,
    thinkIntervalMs: 200
  }),
  node("node03_demo_path_desert_patrol", "path_behavior_profile", "NODE-03 Desert Patrol Path", 220, -720, {
    pathBehaviorId: "path_behavior.desert_patrol",
    displayName: "Desert Patrol",
    internalLabel: "NODE-03 patrol behavior",
    definitionVersion: 1,
    tags: ["path", "patrol", "desert"],
    mode: "loop",
    baseSpeed: 3.2,
    waitMinMs: 500,
    waitMaxMs: 1500,
    randomStart: true,
    stuckRecoveryMode: "next_point"
  }),
  node("node03_demo_animation_player", "animation_set", "NODE-03 Wizard Animation Set", 220, -590, {
    animationSetId: "animation_set.player.wizard",
    displayName: "Wizard Animation Set",
    internalLabel: "NODE-03 player animation",
    definitionVersion: 1,
    tags: ["animation", "player"],
    modelAssetId: ASSETS.wizard,
    idleClip: "Idle",
    walkClip: "Walk",
    runClip: "Run",
    basicAttackClip: "Idle",
    gatherClip: "Idle",
    blendDurationMs: 150
  }),
  node("node03_demo_animation_enemy", "animation_set", "NODE-03 Raider Animation Set", 220, -460, {
    animationSetId: "animation_set.enemy.sand_raider",
    displayName: "Raider Animation Set",
    internalLabel: "NODE-03 enemy animation",
    definitionVersion: 1,
    tags: ["animation", "enemy"],
    modelAssetId: ASSETS.blacksmith,
    idleClip: "Blacksmit Idle",
    walkClip: "Blacksmit Walk",
    runClip: "Blacksmit Run",
    basicAttackClip: "Blacksmit Idle",
    blendDurationMs: 150
  }),
  node("node03_demo_faction_beasts", "faction_definition", "NODE-03 Desert Raiders Faction", 530, -850, {
    factionId: "faction.desert_raiders",
    displayName: "Desert Raiders",
    internalLabel: "NODE-03 hostile faction",
    definitionVersion: 1,
    tags: ["faction", "enemy", "desert"],
    relations: [{ factionRef: "faction.desert_nomads", relation: "hostile" }],
    defaultPlayerRelation: "hostile"
  }),
  node("node03_demo_faction_nomads", "faction_definition", "NODE-03 Desert Nomads Faction", 530, -720, {
    factionId: "faction.desert_nomads",
    displayName: "Desert Nomads",
    internalLabel: "NODE-03 friendly faction",
    definitionVersion: 1,
    tags: ["faction", "npc", "desert"],
    relations: [{ factionRef: "faction.desert_raiders", relation: "hostile" }],
    defaultPlayerRelation: "friendly"
  }),
  node("node03_demo_difficulty_normal", "difficulty_profile", "NODE-03 Normal Difficulty", 530, -590, {
    difficultyId: "difficulty.normal",
    displayName: "Normal",
    internalLabel: "NODE-03 baseline difficulty",
    definitionVersion: 1,
    tags: ["difficulty", "demo"],
    healthMultiplier: 1,
    damageMultiplier: 1,
    armorMultiplier: 1,
    speedMultiplier: 1,
    xpMultiplier: 1,
    lootMultiplier: 1
  }),
  node("node03_demo_respawn_quick", "respawn_policy_definition", "NODE-03 Quick Respawn Policy", 530, -460, {
    respawnPolicyId: "respawn_policy.node03_quick",
    displayName: "NODE-03 Quick Demo Respawn",
    internalLabel: "NODE-03 demo respawn",
    definitionVersion: 1,
    tags: ["respawn", "demo"],
    minDelayMs: 5000,
    maxDelayMs: 9000,
    jitterMode: "uniform",
    maxAliveDefault: 4,
    corpseDurationMs: 6000,
    despawnDistance: 180,
    resetEncounterOnWipe: true,
    oneTimeSpawn: false
  }),
  node("node03_demo_loot_entry_raider_token", "loot_item_entry", "NODE-03 Raider Token Loot", 840, -850, {
    entryId: "loot_entry.raider_token",
    itemRef: "item.raider_token",
    chance: 0.85,
    weight: 10,
    minQuantity: 1,
    maxQuantity: 3,
    guaranteed: false,
    qualityMode: "definition"
  }),
  node("node03_demo_loot_entry_gold", "loot_currency_entry", "NODE-03 Gold Loot", 840, -720, {
    entryId: "loot_entry.gold.small",
    currencyRef: "currency.gold",
    chance: 1,
    weight: 8,
    minAmountMinor: 5,
    maxAmountMinor: 15,
    guaranteed: true
  }),
  node("node03_demo_loot_table_raider", "loot_table", "NODE-03 Raider Loot Table", 1130, -790, {
    lootTableId: "loot_table.sand_raider",
    displayName: "Sand Raider Loot",
    internalLabel: "NODE-03 enemy loot",
    definitionVersion: 1,
    tags: ["loot", "enemy", "desert"],
    rollMode: "independent",
    rollCount: 2,
    allowDuplicates: true,
    ownershipMode: "personal",
    pityPolicy: "none"
  }),
  node("node03_demo_loot_entry_sun_shard", "loot_item_entry", "NODE-03 Sun Shard Yield", 840, -560, {
    entryId: "loot_entry.sun_shard",
    itemRef: "item.sun_shard",
    chance: 1,
    weight: 1,
    minQuantity: 2,
    maxQuantity: 5,
    guaranteed: true,
    qualityMode: "definition"
  }),
  node("node03_demo_loot_table_resource", "loot_table", "NODE-03 Sun Crystal Loot Table", 1130, -560, {
    lootTableId: "loot_table.sun_crystal",
    displayName: "Sun Crystal Yield",
    internalLabel: "NODE-03 resource loot",
    definitionVersion: 1,
    tags: ["loot", "resource", "desert"],
    rollMode: "all",
    rollCount: 1,
    allowDuplicates: true,
    ownershipMode: "shared",
    pityPolicy: "none"
  }),
  node("node03_demo_resource_sun_crystal", "resource_definition", "NODE-03 Sun Crystal Resource", 1410, -560, {
    resourceId: "resource.sun_crystal",
    displayName: "Sun Crystal",
    internalLabel: "NODE-03 gatherable resource",
    definitionVersion: 1,
    tags: ["resource", "desert", "gather"],
    worldModelAssetId: ASSETS.alchemyLab,
    yieldLootTableRef: "loot_table.sun_crystal",
    yieldItemRefs: ["item.sun_shard"],
    requiredAbilityRef: "ability.gather_sun_crystal",
    harvestDurationMs: 1200,
    depletionMode: "disappear",
    respawnPolicyRef: "respawn_policy.node03_quick",
    scope: "shared_zone",
    ownershipClaimMs: 3000,
    harvestAnimationRole: "gather",
    gatherAudioRef: "audio.gather.node03",
    gatherVfxRef: "vfx.gather.node03"
  }),
  node("node03_demo_variant_elite_raider", "entity_variant", "NODE-03 Elite Raider Variant", 1410, -850, {
    variantId: "variant.elite_sand_raider",
    displayName: "Elite Sand Raider Variant",
    internalLabel: "NODE-03 enemy variant",
    definitionVersion: 1,
    tags: ["variant", "enemy", "elite"],
    baseKind: "enemy",
    baseRef: "enemy.sand_raider",
    displayNameOverride: "Elite Sand Raider",
    statMultipliers: { "stat.health": 1.6, "stat.attack_power": 1.25 },
    abilityAddRefs: ["ability.raider_strike"],
    lootOverrideRef: "loot_table.sand_raider",
    factionOverrideRef: "faction.desert_raiders",
    tagAdds: ["elite"],
    scaleMultiplier: 1.12
  }),
  node("node03_demo_enemy_sand_raider", "enemy_archetype", "NODE-03 Sand Raider Enemy", 1710, -850, {
    enemyId: "enemy.sand_raider",
    displayName: "Sand Raider",
    internalLabel: "NODE-03 hostile enemy archetype",
    definitionVersion: 1,
    tags: ["enemy", "desert", "combat"],
    species: "raider",
    role: "normal",
    modelAssetId: ASSETS.blacksmith,
    statBlockRef: "stat_block.enemy.sand_raider",
    combatProfileRef: "combat_profile.enemy.sand_raider",
    aiProfileRef: "ai_profile.sand_raider",
    animationSetRef: "animation_set.enemy.sand_raider",
    lootTableRef: "loot_table.sand_raider",
    factionRef: "faction.desert_raiders",
    difficultyRef: "difficulty.normal",
    baseLevel: 2,
    minimumLevel: 1,
    maximumLevel: 4,
    scale: 1,
    collisionRadius: 0.55,
    networkProfile: "normal",
    corpseDurationMs: 6000,
    defaultRespawnPolicyRef: "respawn_policy.node03_quick",
    nameplateMode: "near",
    bestiaryCategory: "Desert"
  }),
  node("node03_demo_npc_desert_guide", "npc_archetype", "NODE-03 Desert Guide NPC", 1710, -720, {
    npcId: "npc.desert_guide",
    displayName: "Desert Guide",
    internalLabel: "NODE-03 friendly NPC archetype",
    definitionVersion: 1,
    tags: ["npc", "guide", "desert"],
    role: "quest_giver",
    modelAssetId: ASSETS.blacksmith,
    factionRef: "faction.desert_nomads",
    animationSetRef: "animation_set.enemy.sand_raider"
  }),
  node("node03_demo_reputation_nomads", "reputation_track", "NODE-03 Nomads Reputation", 1710, -590, {
    reputationId: "reputation.desert_nomads",
    displayName: "Desert Nomads Reputation",
    internalLabel: "NODE-03 faction progression",
    definitionVersion: 1,
    tags: ["reputation", "desert"],
    factionRef: "faction.desert_nomads",
    minimumValue: -10000,
    maximumValue: 10000,
    startValue: 0,
    ranks: [
      { id: "neutral", min: 0, label: "Neutral" },
      { id: "trusted", min: 2500, label: "Trusted" }
    ],
    decayPolicy: "none",
    accountOrCharacterScope: "character"
  }),
  node("node03_demo_music_track_ambient", "music_track", "NODE-03 Desert Ambient Track", 2020, -850, {
    musicTrackId: "music_track.desert_ambient",
    displayName: "Desert Ambient",
    internalLabel: "NODE-03 ambient music placeholder",
    definitionVersion: 1,
    tags: ["music", "ambient", "desert"],
    loop: true,
    volume: 0.65,
    fadeInMs: 1200,
    fadeOutMs: 1200,
    moodTags: ["exploration", "desert"],
    priority: 10,
    preloadPolicy: "on_zone_preload"
  }),
  node("node03_demo_music_playlist_desert", "music_playlist", "NODE-03 Desert Playlist", 2320, -850, {
    musicPlaylistId: "music_playlist.desert",
    displayName: "Desert Playlist",
    internalLabel: "NODE-03 zone playlist",
    definitionVersion: 1,
    tags: ["music", "playlist", "desert"],
    playMode: "sequential",
    crossfadeMs: 1000,
    avoidImmediateRepeat: true,
    trackWeights: { "music_track.desert_ambient": 1 }
  }),
  node("node03_demo_audio_pickup", "audio_event", "NODE-03 Pickup Audio Event", 2020, -720, {
    audioEventId: "audio.pickup.node03",
    displayName: "Pickup Audio",
    internalLabel: "NODE-03 pickup audio placeholder",
    definitionVersion: 1,
    tags: ["audio", "pickup"],
    audioAssetIds: [],
    selectionMode: "random",
    volumeMin: 0.8,
    volumeMax: 1,
    pitchMin: 0.95,
    pitchMax: 1.05,
    spatial: true,
    minDistance: 1,
    maxDistance: 24,
    maxConcurrent: 8,
    scope: "local"
  }),
  node("node03_demo_audio_hit", "audio_event", "NODE-03 Hit Audio Event", 2020, -590, {
    audioEventId: "audio.hit.node03",
    displayName: "Hit Audio",
    internalLabel: "NODE-03 combat audio placeholder",
    definitionVersion: 1,
    tags: ["audio", "combat"],
    audioAssetIds: [],
    selectionMode: "random",
    volumeMin: 0.7,
    volumeMax: 1,
    pitchMin: 0.95,
    pitchMax: 1.05,
    spatial: true,
    minDistance: 1,
    maxDistance: 30,
    maxConcurrent: 12,
    scope: "zone"
  }),
  node("node03_demo_audio_gather", "audio_event", "NODE-03 Gather Audio Event", 2020, -460, {
    audioEventId: "audio.gather.node03",
    displayName: "Gather Audio",
    internalLabel: "NODE-03 gather audio placeholder",
    definitionVersion: 1,
    tags: ["audio", "resource"],
    audioAssetIds: [],
    selectionMode: "random",
    volumeMin: 0.6,
    volumeMax: 0.9,
    pitchMin: 0.9,
    pitchMax: 1.1,
    spatial: true,
    minDistance: 1,
    maxDistance: 26,
    maxConcurrent: 6,
    scope: "local"
  }),
  node("node03_demo_vfx_hit", "vfx_definition", "NODE-03 Hit VFX", 2320, -720, {
    vfxId: "vfx.hit.node03",
    displayName: "Hit VFX",
    internalLabel: "NODE-03 combat vfx placeholder",
    definitionVersion: 1,
    tags: ["vfx", "combat"],
    kind: "billboard",
    lifetimeMs: 450,
    loop: false,
    scale: 0.8,
    attachmentPoint: "target",
    followTarget: true,
    rotationMode: "face_camera",
    maxConcurrentPerSource: 8,
    priority: 20
  }),
  node("node03_demo_vfx_pickup", "vfx_definition", "NODE-03 Pickup VFX", 2320, -590, {
    vfxId: "vfx.pickup.node03",
    displayName: "Pickup VFX",
    internalLabel: "NODE-03 pickup vfx placeholder",
    definitionVersion: 1,
    tags: ["vfx", "pickup"],
    kind: "billboard",
    lifetimeMs: 700,
    loop: false,
    scale: 0.9,
    attachmentPoint: "ground",
    followTarget: false,
    rotationMode: "face_camera",
    maxConcurrentPerSource: 4,
    priority: 10
  }),
  node("node03_demo_vfx_gather", "vfx_definition", "NODE-03 Gather VFX", 2320, -460, {
    vfxId: "vfx.gather.node03",
    displayName: "Gather VFX",
    internalLabel: "NODE-03 resource vfx placeholder",
    definitionVersion: 1,
    tags: ["vfx", "resource"],
    kind: "mesh_effect",
    modelAssetId: ASSETS.alchemyLab,
    lifetimeMs: 900,
    loop: false,
    scale: 0.35,
    attachmentPoint: "ground",
    followTarget: false,
    rotationMode: "fixed",
    maxConcurrentPerSource: 4,
    priority: 10
  }),
  node("node03_demo_player_definition", "playable_character_definition", "NODE-03 Desert Guardian Player", 1710, -330, {
    characterId: "player.desert_guardian",
    displayName: "Desert Guardian",
    internalLabel: "NODE-03 playable definition",
    definitionVersion: 1,
    tags: ["player", "desert", "demo"],
    modelAssetId: ASSETS.wizard,
    classTags: ["guardian", "desert"],
    baseMoveSpeed: 7,
    sprintMultiplier: 1.8,
    turnSpeed: 540,
    collisionRadius: 0.5,
    scale: 1,
    startingAbilityRefs: ["ability.basic_attack", "ability.gather_sun_crystal"],
    startingItemGrants: [{ itemRef: "item.desert_sword", amount: 1 }, { itemRef: "item.sun_shard", amount: 3 }],
    startingCurrencyGrants: [{ currencyRef: "currency.gold", amountMinor: 25 }],
    defaultLoadoutId: "loadout.main"
  })
];

const policyNodes = [
  node("node03_demo_player_progression_rules", "player_progression_rules", "NODE-03 Player Progression Rules", -1360, 1020, {
    rulesId: "player_rules.progression.node03_desert",
    maxLevel: 10,
    xpCurveRef: "stat_curve.player_xp",
    baseStatBlockRef: "stat_block.player.desert",
    healthStatRef: "stat.health",
    manaStatRef: "stat.mana",
    armorStatRef: "stat.armor",
    levelUpHealPolicy: "full"
  }),
  node("node03_demo_xp_source_rule_raider", "xp_source_rule", "NODE-03 Raider XP Rule", -1360, 1150, {
    xpRuleId: "xp_rule.sand_raider_defeat",
    sourceTagQuery: { all: ["enemy"], any: ["desert"], none: [] },
    amountFormula: { operator: "add", operands: [35] },
    curveRef: "stat_curve.player_xp",
    dailyCap: 0,
    diminishingReturnsMode: "none"
  }),
  node("node03_demo_inventory_rules", "inventory_rules", "NODE-03 Inventory Rules", -1060, 1020, {
    rulesId: "player_rules.inventory.node03_desert",
    slotCapacity: 24,
    weightCapacity: 80,
    capacityMode: "both",
    stackMergePolicy: "exact_item_and_bind",
    pickupOverflow: "reject",
    allowDestroy: true,
    allowDrop: true
  }),
  node("node03_demo_equipment_rules", "equipment_rules", "NODE-03 Equipment Rules", -1060, 1150, {
    rulesId: "player_rules.equipment.node03_desert",
    slotRefs: ["equipment_slot.main_hand"],
    bindOnEquip: true,
    allowSwapInCombat: false,
    durabilityEnabled: true,
    deathDurabilityLossPercent: 0.05
  }),
  node("node03_demo_ability_loadout_rules", "ability_loadout_rules", "NODE-03 Ability Loadout Rules", -760, 1020, {
    rulesId: "player_rules.abilities.node03_desert",
    loadoutCount: 1,
    slotsPerLoadout: 6,
    allowedAbilityTagQuery: { all: [], any: ["combat", "gather"], none: [] },
    changeInCombat: false,
    changeCooldownMs: 1000
  }),
  node("node03_demo_death_respawn_rules", "death_respawn_rules", "NODE-03 Death Respawn Rules", -760, 1150, {
    rulesId: "player_rules.death_respawn.node03_desert",
    respawnDelayMs: 3000,
    respawnPriority: "zone_default",
    healthRestorePercent: 0.75,
    manaRestorePercent: 0.5,
    currencyLossRules: [{ currencyRef: "currency.gold", percent: 0.05 }],
    durabilityLossPercent: 0.05,
    dropItems: false
  }),
  node("node03_demo_unstuck_rules", "unstuck_rules", "NODE-03 Unstuck Rules", -460, 1020, {
    rulesId: "player_rules.unstuck.node03_desert",
    cooldownMs: 60000,
    castTimeMs: 2500,
    cancelOnMove: true,
    cancelOnDamage: true,
    allowInCombat: false,
    fallbackOrder: ["character_checkpoint", "zone_default", "project_start"],
    logThresholdPerHour: 5
  })
];

const uiNodes = [
  node("node03_demo_hud_health", "hud_bar", "NODE-03 Health HUD", -140, 1020, {
    moduleId: "hud.health.node03",
    sourceStatRef: "stat.health",
    maxStatRef: "stat.health",
    label: "Health",
    anchor: "top-left",
    widthPx: 220,
    heightPx: 18,
    showNumbers: true,
    showPercent: false
  }),
  node("node03_demo_hud_mana", "hud_bar", "NODE-03 Mana HUD", -140, 1150, {
    moduleId: "hud.mana.node03",
    sourceStatRef: "stat.mana",
    maxStatRef: "stat.mana",
    label: "Mana",
    anchor: "top-left",
    widthPx: 220,
    heightPx: 16,
    showNumbers: true,
    showPercent: false
  }),
  node("node03_demo_hotbar_hud", "hotbar_hud", "NODE-03 Hotbar HUD", 170, 1020, {
    moduleId: "hud.hotbar.node03",
    loadoutId: "loadout.main",
    slotCount: 6,
    anchor: "bottom-left",
    showKeybinds: true,
    showCooldown: true,
    showCosts: true,
    mobileTouchEnabled: true
  }),
  node("node03_demo_xp_hud", "xp_hud", "NODE-03 XP HUD", 170, 1150, {
    moduleId: "hud.xp.node03",
    anchor: "bottom-left",
    showLevel: true,
    showCurrentXp: true,
    showRequiredXp: true,
    showPercent: false,
    levelLabel: "Level",
    compact: true
  }),
  node("node03_demo_inventory_hud", "inventory_hud", "NODE-03 Inventory HUD", 480, 1020, {
    moduleId: "hud.inventory.node03",
    layout: "grid",
    columns: 6,
    showWeight: true,
    showFilters: true,
    allowStackSplit: true,
    allowDestroy: true
  }),
  node("node03_demo_equipment_hud", "equipment_hud", "NODE-03 Equipment HUD", 480, 1150, {
    moduleId: "hud.equipment.node03",
    anchor: "bottom-right"
  }),
  node("node03_demo_wallet_hud", "wallet_hud", "NODE-03 Wallet HUD", 790, 1020, {
    moduleId: "hud.wallet.node03",
    title: "Tracked",
    currencyRefs: ["currency.gold"],
    itemRefs: ["item.wood", "item.sun_shard", "item.raider_token"],
    maxEntries: 5,
    anchor: "top-right"
  }),
  node("node03_demo_death_hud", "death_respawn_hud", "NODE-03 Death Respawn HUD", 790, 1150, {
    moduleId: "hud.death_respawn.node03",
    anchor: "center",
    showCountdown: true,
    showDestination: true
  }),
  node("node03_demo_interaction_hud", "interaction_hud", "NODE-03 Interaction HUD", 1090, 1020, {
    moduleId: "hud.interactions.node03",
    title: "Targets",
    anchor: "top-right",
    layout: "panel",
    targetKinds: ["enemy", "resource", "pickup", "zone_link"],
    maxTargets: 12,
    rangeMode: "ability_range",
    showDistance: true,
    showHealth: true,
    showLootPreview: true,
    allowDemoReset: true
  })
];

const sceneNodes = [
  node("node03_demo_model_raider", "model_entity", "NODE-03 Raider 3D Marker", -250, 250, {
    entityId: "node03_desert_raider_marker",
    label: "Sand Raider Spawn Marker",
    modelAssetId: ASSETS.blacksmith,
    animationClip: "Blacksmit Idle",
    idleAnimation: "Blacksmit Idle",
    walkAnimation: "Blacksmit Walk",
    runAnimation: "Blacksmit Run",
    x: -82,
    y: 0,
    z: 430,
    rotationY: 25,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    solid: false,
    walkable: false,
    collisionRadius: 0.8
  }),
  node("node03_demo_model_resource", "model_entity", "NODE-03 Resource 3D Marker", -250, 390, {
    entityId: "node03_desert_sun_crystal_marker",
    label: "Sun Crystal Resource Marker",
    modelAssetId: ASSETS.alchemyLab,
    x: 65,
    y: 0,
    z: 455,
    rotationY: -20,
    scaleX: 0.8,
    scaleY: 0.8,
    scaleZ: 0.8,
    solid: true,
    walkable: false,
    collisionRadius: 2
  }),
  node("node03_demo_model_npc", "model_entity", "NODE-03 NPC 3D Marker", -250, 530, {
    entityId: "node03_desert_guide_marker",
    label: "Desert Guide NPC Marker",
    modelAssetId: ASSETS.blacksmith,
    animationClip: "Blacksmit Idle",
    idleAnimation: "Blacksmit Idle",
    walkAnimation: "Blacksmit Walk",
    runAnimation: "Blacksmit Run",
    x: 28,
    y: 0,
    z: 392,
    rotationY: -135,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    solid: false,
    walkable: false,
    collisionRadius: 0.8
  }),
  node("node03_demo_model_tavern", "model_entity", "NODE-03 Tavern 3D Prop", -250, 670, {
    entityId: "node03_desert_tavern_prop",
    label: "Desert Tavern Test Prop",
    modelAssetId: ASSETS.tavern,
    x: 42,
    y: 0,
    z: 370,
    rotationY: 180,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    solid: true,
    walkable: false,
    collisionRadius: 4
  }),
  node("node03_demo_model_forge", "model_entity", "NODE-03 Forge 3D Prop", -250, 810, {
    entityId: "node03_desert_forge_prop",
    label: "Desert Forge Loot Prop",
    modelAssetId: ASSETS.forge,
    x: -10,
    y: 0,
    z: 475,
    rotationY: 45,
    scaleX: 0.9,
    scaleY: 0.9,
    scaleZ: 0.9,
    solid: true,
    walkable: false,
    collisionRadius: 2.5
  }),
  node("node03_demo_model_bridge", "model_entity", "NODE-03 Bridge 3D Prop", -250, 950, {
    entityId: "node03_desert_bridge_prop",
    label: "Desert Bridge Test Prop",
    modelAssetId: ASSETS.bridge,
    x: -35,
    y: 0,
    z: 360,
    rotationY: 90,
    scaleX: 0.35,
    scaleY: 0.35,
    scaleZ: 0.35,
    solid: true,
    walkable: true,
    collisionRadius: 5
  }),
  node("node03_demo_model_tree", "model_entity", "NODE-03 Tree 3D Prop", -250, 1090, {
    entityId: "node03_desert_tree_prop",
    label: "Desert Edge Resource Prop",
    modelAssetId: ASSETS.tree,
    x: 92,
    y: 0,
    z: 505,
    rotationY: -12,
    scaleX: 1.3,
    scaleY: 1.3,
    scaleZ: 1.3,
    solid: true,
    walkable: false,
    collisionRadius: 1.5
  }),
  node("node03_demo_enemy_component", "enemy_component", "NODE-03 Enemy Component", 90, 250, {
    componentId: "component.enemy.node03_desert",
    enemyRef: "enemy.sand_raider",
    variantRef: "variant.elite_sand_raider",
    difficultyRef: "difficulty.normal",
    levelMode: "fixed",
    fixedLevel: 2,
    lootOverrideRef: "loot_table.sand_raider",
    respawnOverrideRef: "respawn_policy.node03_quick"
  }),
  node("node03_demo_combatant_component_enemy", "combatant_component", "NODE-03 Combatant Component", 90, 380, {
    componentId: "component.combatant.enemy.node03_desert",
    statBlockRef: "stat_block.enemy.sand_raider",
    combatProfileRef: "combat_profile.enemy.sand_raider",
    factionRef: "faction.desert_raiders",
    targetable: true,
    invulnerable: false,
    deathMode: "normal",
    creditMode: "personal"
  }),
  node("node03_demo_lootable_component_enemy", "lootable_component", "NODE-03 Lootable Component", 90, 510, {
    componentId: "component.lootable.enemy.node03_desert",
    lootTableRef: "loot_table.sand_raider",
    ownershipMode: "personal",
    oneTime: false,
    respawnPolicyRef: "respawn_policy.node03_quick",
    interactionPrompt: "Loot"
  }),
  node("node03_demo_faction_component_enemy", "faction_component", "NODE-03 Enemy Faction Component", 90, 640, {
    componentId: "component.faction.enemy.node03_desert",
    factionRef: "faction.desert_raiders",
    relationOverrides: []
  }),
  node("node03_demo_nameplate_component_enemy", "nameplate_component", "NODE-03 Enemy Nameplate Component", 90, 770, {
    componentId: "component.nameplate.enemy.node03_desert",
    nameTemplate: "Sand Raider",
    showLevel: true,
    showHealth: true,
    showFaction: false,
    showQuestIcon: false,
    visibility: "near"
  }),
  node("node03_demo_entity_raider", "entity_assembly", "NODE-03 Enemy Entity Assembly", 420, 380, {
    entityId: "entity.node03.desert.sand_raider",
    label: "Sand Raider Gameplay Entity",
    entityTags: ["enemy", "combat", "loot", "desert", "node03"]
  }),
  node("node03_demo_resource_component", "resource_component", "NODE-03 Resource Component", 90, 930, {
    componentId: "component.resource.node03_desert",
    resourceRef: "resource.sun_crystal",
    yieldMultiplier: 1,
    respawnPolicyOverrideRef: "respawn_policy.node03_quick",
    scopeOverride: "shared_zone"
  }),
  node("node03_demo_destructible_component_resource", "destructible_component", "NODE-03 Destructible Resource Component", 90, 1060, {
    componentId: "component.destructible.resource.node03_desert",
    statBlockRef: "stat_block.enemy.sand_raider",
    lootTableRef: "loot_table.sun_crystal",
    respawnPolicyRef: "respawn_policy.node03_quick",
    persistenceScope: "disposable"
  }),
  node("node03_demo_lootable_component_resource", "lootable_component", "NODE-03 Resource Lootable Component", 90, 1190, {
    componentId: "component.lootable.resource.node03_desert",
    lootTableRef: "loot_table.sun_crystal",
    ownershipMode: "shared",
    oneTime: false,
    respawnPolicyRef: "respawn_policy.node03_quick",
    interactionPrompt: "Gather"
  }),
  node("node03_demo_nameplate_component_resource", "nameplate_component", "NODE-03 Resource Nameplate Component", 90, 1320, {
    componentId: "component.nameplate.resource.node03_desert",
    nameTemplate: "Sun Crystal",
    showLevel: false,
    showHealth: false,
    showFaction: false,
    showQuestIcon: false,
    visibility: "near"
  }),
  node("node03_demo_entity_resource", "entity_assembly", "NODE-03 Resource Entity Assembly", 420, 1050, {
    entityId: "entity.node03.desert.sun_crystal",
    label: "Sun Crystal Gameplay Entity",
    entityTags: ["resource", "gather", "loot", "desert", "node03"]
  }),
  node("node03_demo_npc_component", "npc_component", "NODE-03 NPC Component", 760, 250, {
    componentId: "component.npc.node03_desert",
    npcRef: "npc.desert_guide",
    level: 1,
    persistenceScope: "zone"
  }),
  node("node03_demo_faction_component_npc", "faction_component", "NODE-03 NPC Faction Component", 760, 380, {
    componentId: "component.faction.npc.node03_desert",
    factionRef: "faction.desert_nomads",
    relationOverrides: []
  }),
  node("node03_demo_schedule_component_npc", "schedule_component", "NODE-03 NPC Schedule Component", 760, 510, {
    componentId: "component.schedule.npc.node03_desert",
    scheduleEntries: [{ start: "08:00", end: "20:00", behavior: "guide" }],
    defaultBehavior: "idle"
  }),
  node("node03_demo_nameplate_component_npc", "nameplate_component", "NODE-03 NPC Nameplate Component", 760, 640, {
    componentId: "component.nameplate.npc.node03_desert",
    nameTemplate: "Desert Guide",
    showLevel: false,
    showHealth: false,
    showFaction: true,
    showQuestIcon: true,
    visibility: "near"
  }),
  node("node03_demo_entity_npc", "entity_assembly", "NODE-03 NPC Entity Assembly", 1090, 380, {
    entityId: "entity.node03.desert.guide",
    label: "Desert Guide Gameplay Entity",
    entityTags: ["npc", "guide", "reputation", "desert", "node03"]
  })
];

const spawnNodes = [
  node("node03_demo_enemy_spawn_area", "enemy_spawn_area", "NODE-03 Enemy Spawn Area", 1420, 250, {
    spawnEntryId: "spawn.enemy_area.node03_desert_raiders",
    enemyRef: "enemy.sand_raider",
    variantRef: "variant.elite_sand_raider",
    difficultyRef: "difficulty.normal",
    countMin: 2,
    countMax: 3,
    distribution: "blue_noise",
    minimumSpacing: 6,
    x: -82,
    y: 0,
    z: 430,
    radius: 32,
    levelMode: "fixed",
    fixedLevel: 2,
    respawnPolicyRef: "respawn_policy.node03_quick",
    maxAlive: 3,
    activationRadius: 140,
    playerExclusionRadius: 8
  }),
  node("node03_demo_resource_spawn", "resource_spawn", "NODE-03 Resource Spawn", 1420, 380, {
    spawnEntryId: "spawn.resource.node03_sun_crystals",
    resourceRef: "resource.sun_crystal",
    count: 4,
    x: 65,
    y: 0,
    z: 455,
    radius: 24,
    minimumSpacing: 6,
    distribution: "blue_noise",
    respawnOverrideRef: "respawn_policy.node03_quick",
    yieldMultiplier: 1
  }),
  node("node03_demo_pickup_spawn_sword", "pickup_spawn", "NODE-03 Sword Pickup Spawn", 1420, 510, {
    spawnEntryId: "spawn.pickup.node03_desert_sword",
    pickupKind: "item",
    itemRef: "item.desert_sword",
    amount: 1,
    minAmount: 1,
    maxAmount: 1,
    x: -10,
    y: 0,
    z: 475,
    respawnPolicyRef: "respawn_policy.node03_quick",
    ownershipMode: "shared",
    pickupAudioRef: "audio.pickup.node03",
    pickupVfxRef: "vfx.pickup.node03"
  }),
  node("node03_demo_pickup_spawn_gold", "pickup_spawn", "NODE-03 Gold Pickup Spawn", 1420, 640, {
    spawnEntryId: "spawn.pickup.node03_gold_cache",
    pickupKind: "currency",
    currencyRef: "currency.gold",
    amount: 25,
    minAmount: 10,
    maxAmount: 35,
    x: 8,
    y: 0,
    z: 475,
    respawnPolicyRef: "respawn_policy.node03_quick",
    ownershipMode: "shared",
    pickupAudioRef: "audio.pickup.node03",
    pickupVfxRef: "vfx.pickup.node03"
  }),
  node("node03_demo_spawn_set", "spawn_set", "NODE-03 Desert Spawn Set", 1740, 380, {
    spawnSetId: "spawn_set.desert.node03",
    activationMode: "zone_loaded",
    maxAliveTotal: 12,
    randomSeedMode: "deterministic_build",
    sharedRespawnPolicyRef: "respawn_policy.node03_quick"
  }),
  node("node03_demo_spawn_controller", "spawn_controller", "NODE-03 Desert Spawn Controller", 2050, 380, {
    spawnControllerId: "spawn_controller.desert.node03",
    scope: "zone",
    sleepOutsideInterest: true,
    interestRadius: 160,
    preloadRadius: 220,
    buildBudgetPerTick: 4,
    maxActiveInstances: 80,
    persistenceScope: "zone"
  }),
  node("node03_demo_encounter_controller", "encounter_controller", "NODE-03 Desert Encounter", 2050, 560, {
    encounterId: "encounter.desert.node03_raider_cache",
    mode: "single_wave",
    waveDefinitions: [{ wave: 1, spawnSetRef: "spawn_set.desert.node03", completeWhenTagsDefeated: ["enemy", "desert"] }],
    resetPolicy: "out_of_combat",
    lockoutPolicy: "none",
    startMode: "proximity"
  })
];

const travelNodes = [
  node("node03_game_link_start_to_desert", "zone_link", "Start Zone to Desert", 920, 540, {
    linkId: "link.start_to_desert",
    fromZoneRef: "zone.node02.live_demo",
    fromTargetRef: "spawn.node02.live_demo_default",
    toZoneRef: "zone.canvas.x0.zm1",
    toSpawnRef: "spawn.canvas.x0.zm1",
    mode: "portal",
    bidirectional: false,
    reverseLinkRef: null,
    transitionVisual: "fade",
    loadingText: "Travel to Desert",
    preloadDistance: 30,
    interactionRequired: true,
    prompt: "Travel",
    oneWayReason: ""
  }, IDS.startGroup),
  node("node03_game_model_start_desert_portal", "model_entity", "Start Zone Desert Portal Prop", 920, 680, {
    entityId: "entity_portal_start_desert",
    label: "Desert Portal",
    modelAssetId: ASSETS.alchemyLab,
    x: 0,
    y: 0,
    z: 0,
    rotationY: 0,
    scaleX: 0.75,
    scaleY: 0.75,
    scaleZ: 0.75,
    solid: false,
    walkable: false,
    collisionRadius: 1.2
  }, IDS.startGroup),
  node("node03_game_marker_start_desert_portal", "map_marker_definition", "Start Zone Desert Portal Marker", 920, 820, {
    markerId: "marker.start_to_desert",
    label: "Desert Portal",
    markerType: "portal",
    showOnMinimap: true,
    showOnWorldMap: true,
    showOnCompass: false,
    priority: 20,
    clampOutside: true,
    minDistance: 0,
    maxDistance: 100000,
    iconSizePx: 18,
    labelVisibility: "near"
  }, IDS.startGroup),
  node("node03_game_link_desert_to_start", "zone_link", "Desert to Start Zone", 1740, 740, {
    linkId: "link.desert_to_start",
    fromZoneRef: "zone.canvas.x0.zm1",
    fromTargetRef: "spawn.canvas.x0.zm1",
    toZoneRef: "zone.node02.live_demo",
    toSpawnRef: "spawn.node02.live_demo_default",
    mode: "portal",
    bidirectional: false,
    reverseLinkRef: null,
    transitionVisual: "fade",
    loadingText: "Return to Start Zone",
    preloadDistance: 30,
    interactionRequired: true,
    prompt: "Return",
    oneWayReason: ""
  }),
  node("node03_game_model_desert_return_portal", "model_entity", "Desert Return Portal Prop", -250, 1230, {
    entityId: "entity_portal_desert_start",
    label: "Return Portal",
    modelAssetId: ASSETS.alchemyLab,
    x: -0.8,
    y: 0,
    z: 500.3,
    rotationY: 180,
    scaleX: 0.75,
    scaleY: 0.75,
    scaleZ: 0.75,
    solid: false,
    walkable: false,
    collisionRadius: 1.2
  }),
  node("node03_game_marker_desert_return_portal", "map_marker_definition", "Desert Return Portal Marker", -250, 1370, {
    markerId: "marker.desert_to_start",
    label: "Return Portal",
    markerType: "portal",
    showOnMinimap: true,
    showOnWorldMap: true,
    showOnCompass: false,
    priority: 20,
    clampOutside: true,
    minDistance: 0,
    maxDistance: 100000,
    iconSizePx: 18,
    labelVisibility: "near"
  })
];

const supportNodes = [
  node("node03_demo_adjacent_zone_minimap", "minimap_bake", "NODE-03 Adjacent Zone Minimap Bake", 760, 385, {
    minimapId: "minimap_zone_canvas_x0_zm1_2",
    label: "Zone 0, -1.2 Minimap",
    enabled: true,
    resolution: "2048",
    imageQuality: 0.78,
    includeStaticModels: true,
    includeInteractables: false,
    hideEditorHelpers: true,
    bakedImageUrl: "",
    bakedImageWidth: 0,
    bakedImageHeight: 0,
    bakedAt: "",
    bakedWorldHash: "",
    bakedBounds: null,
    zoneRef: "zone.canvas.x0.zm1.2",
    sourceMode: "zone_bounds"
  }, IDS.adjacentZoneGroup)
];

for (const entry of catalogNodes.concat(policyNodes, uiNodes)) {
  entry.parentId = null;
}

const nodes = [
  ...catalogNodes,
  ...policyNodes,
  ...uiNodes,
  ...sceneNodes,
  ...spawnNodes,
  ...travelNodes,
  ...supportNodes
];

const catalogDefinitionEdges = catalogNodes
  .filter(function (candidate) {
    return candidate.id !== catalogOutput.id && NODE_TYPES[candidate.type]?.outputs?.catalogDefinition;
  })
  .map(function (candidate, index) {
    return edge("edge_node03_catalog_def_" + String(index).padStart(2, "0"), candidate.id, "catalogDefinition", catalogOutput.id, "definitions");
  });

const edges = [
  edge("edge_node03_catalog_to_registry", catalogOutput.id, "catalogPackage", IDS.catalogRegistry, "catalogPackage"),
  ...catalogDefinitionEdges,
  edge("edge_node03_rank_basic_to_ability", "node03_demo_ability_rank_basic_attack_1", "abilityRankDef", "node03_demo_ability_basic_attack", "rankDefinitions"),
  edge("edge_node03_status_to_basic_attack", "node03_demo_status_sun_scorch", "statusEffectDef", "node03_demo_ability_basic_attack", "statusEffects"),
  edge("edge_node03_loot_token_to_raider_table", "node03_demo_loot_entry_raider_token", "lootEntry", "node03_demo_loot_table_raider", "entries"),
  edge("edge_node03_loot_gold_to_raider_table", "node03_demo_loot_entry_gold", "lootEntry", "node03_demo_loot_table_raider", "entries"),
  edge("edge_node03_loot_shard_to_resource_table", "node03_demo_loot_entry_sun_shard", "lootEntry", "node03_demo_loot_table_resource", "entries"),
  edge("edge_node03_track_to_playlist", "node03_demo_music_track_ambient", "musicTrackDef", "node03_demo_music_playlist_desert", "tracks"),
  edge("edge_node03_enemy_stats_to_enemy", "node03_demo_stat_block_enemy", "statBlock", "node03_demo_enemy_sand_raider", "statBlock"),
  edge("edge_node03_enemy_combat_to_enemy", "node03_demo_combat_profile_enemy", "combatProfile", "node03_demo_enemy_sand_raider", "combatProfile"),
  edge("edge_node03_enemy_ai_to_enemy", "node03_demo_ai_sand_raider", "aiProfile", "node03_demo_enemy_sand_raider", "aiProfile"),
  edge("edge_node03_enemy_anim_to_enemy", "node03_demo_animation_enemy", "animationSet", "node03_demo_enemy_sand_raider", "animationSet"),
  edge("edge_node03_enemy_loot_to_enemy", "node03_demo_loot_table_raider", "lootTable", "node03_demo_enemy_sand_raider", "lootTable"),
  edge("edge_node03_enemy_faction_to_enemy", "node03_demo_faction_beasts", "factionDef", "node03_demo_enemy_sand_raider", "faction"),
  edge("edge_node03_enemy_difficulty_to_enemy", "node03_demo_difficulty_normal", "difficultyDef", "node03_demo_enemy_sand_raider", "difficulty"),
  edge("edge_node03_player_stats_to_player_def", "node03_demo_stat_block_player", "statBlock", "node03_demo_player_definition", "statBlock"),
  edge("edge_node03_player_anim_to_player_def", "node03_demo_animation_player", "animationSet", "node03_demo_player_definition", "animationSet"),
  edge("edge_node03_player_combat_to_player_def", "node03_demo_combat_profile_player", "combatProfile", "node03_demo_player_definition", "combatProfile"),
  edge("edge_node03_equipment_policy_to_player_def", "node03_demo_equipment_rules", "equipmentPolicy", "node03_demo_player_definition", "equipmentPolicy"),
  edge("edge_node03_slot_to_equipment_policy", "node03_demo_equipment_main_hand", "equipmentSlotDef", "node03_demo_equipment_rules", "slots"),

  ...policyNodes.map(function (candidate, index) {
    return edge("edge_node03_policy_" + String(index).padStart(2, "0"), candidate.id, "policy", IDS.playerRulesOutput, "policy");
  }),
  ...uiNodes.map(function (candidate, index) {
    return edge("edge_node03_ui_module_" + String(index).padStart(2, "0"), candidate.id, "uiModule", IDS.uiOutput, "uiModules");
  }),

  edge("edge_node03_model_resource_to_zone", "node03_demo_model_resource", "entity", IDS.desertOutput, "entities"),
  edge("edge_node03_model_npc_to_zone", "node03_demo_model_npc", "entity", IDS.desertOutput, "entities"),
  edge("edge_node03_model_tavern_to_zone", "node03_demo_model_tavern", "entity", IDS.desertOutput, "entities"),
  edge("edge_node03_model_forge_to_zone", "node03_demo_model_forge", "entity", IDS.desertOutput, "entities"),
  edge("edge_node03_model_bridge_to_zone", "node03_demo_model_bridge", "entity", IDS.desertOutput, "entities"),
  edge("edge_node03_model_tree_to_zone", "node03_demo_model_tree", "entity", IDS.desertOutput, "entities"),
  edge("edge_node03_raider_model_to_assembly", "node03_demo_model_raider", "entity", "node03_demo_entity_raider", "model"),
  edge("edge_node03_enemy_component_to_assembly", "node03_demo_enemy_component", "component", "node03_demo_entity_raider", "components"),
  edge("edge_node03_combatant_component_to_assembly", "node03_demo_combatant_component_enemy", "component", "node03_demo_entity_raider", "components"),
  edge("edge_node03_lootable_enemy_to_assembly", "node03_demo_lootable_component_enemy", "component", "node03_demo_entity_raider", "components"),
  edge("edge_node03_faction_enemy_to_assembly", "node03_demo_faction_component_enemy", "component", "node03_demo_entity_raider", "components"),
  edge("edge_node03_nameplate_enemy_to_assembly", "node03_demo_nameplate_component_enemy", "component", "node03_demo_entity_raider", "components"),
  edge("edge_node03_entity_raider_to_zone", "node03_demo_entity_raider", "entity", IDS.desertOutput, "entities"),
  edge("edge_node03_resource_model_to_assembly", "node03_demo_model_resource", "entity", "node03_demo_entity_resource", "model"),
  edge("edge_node03_resource_component_to_assembly", "node03_demo_resource_component", "component", "node03_demo_entity_resource", "components"),
  edge("edge_node03_destructible_resource_to_assembly", "node03_demo_destructible_component_resource", "component", "node03_demo_entity_resource", "components"),
  edge("edge_node03_lootable_resource_to_assembly", "node03_demo_lootable_component_resource", "component", "node03_demo_entity_resource", "components"),
  edge("edge_node03_nameplate_resource_to_assembly", "node03_demo_nameplate_component_resource", "component", "node03_demo_entity_resource", "components"),
  edge("edge_node03_entity_resource_to_zone", "node03_demo_entity_resource", "entity", IDS.desertOutput, "entities"),
  edge("edge_node03_npc_model_to_assembly", "node03_demo_model_npc", "entity", "node03_demo_entity_npc", "model"),
  edge("edge_node03_npc_component_to_assembly", "node03_demo_npc_component", "component", "node03_demo_entity_npc", "components"),
  edge("edge_node03_faction_npc_to_assembly", "node03_demo_faction_component_npc", "component", "node03_demo_entity_npc", "components"),
  edge("edge_node03_schedule_npc_to_assembly", "node03_demo_schedule_component_npc", "component", "node03_demo_entity_npc", "components"),
  edge("edge_node03_nameplate_npc_to_assembly", "node03_demo_nameplate_component_npc", "component", "node03_demo_entity_npc", "components"),
  edge("edge_node03_entity_npc_to_zone", "node03_demo_entity_npc", "entity", IDS.desertOutput, "entities"),

  edge("edge_node03_enemy_spawn_to_set", "node03_demo_enemy_spawn_area", "spawnEntry", "node03_demo_spawn_set", "spawns"),
  edge("edge_node03_resource_spawn_to_set", "node03_demo_resource_spawn", "spawnEntry", "node03_demo_spawn_set", "spawns"),
  edge("edge_node03_pickup_sword_to_set", "node03_demo_pickup_spawn_sword", "spawnEntry", "node03_demo_spawn_set", "spawns"),
  edge("edge_node03_pickup_gold_to_set", "node03_demo_pickup_spawn_gold", "spawnEntry", "node03_demo_spawn_set", "spawns"),
  edge("edge_node03_spawn_set_to_controller", "node03_demo_spawn_set", "spawnSet", "node03_demo_spawn_controller", "spawnSets"),
  edge("edge_node03_spawn_controller_to_zone", "node03_demo_spawn_controller", "spawnController", IDS.desertOutput, "spawnControllers"),
  edge("edge_node03_spawn_controller_to_encounter", "node03_demo_spawn_controller", "spawnController", "node03_demo_encounter_controller", "spawnControllers"),
  edge("edge_node03_encounter_to_zone", "node03_demo_encounter_controller", "encounter", IDS.desertOutput, "encounters"),
  edge("edge_node03_link_start_to_desert_zone", "node03_game_link_start_to_desert", "zoneLink", IDS.startOutput, "links"),
  edge("edge_node03_model_start_desert_portal_to_zone", "node03_game_model_start_desert_portal", "entity", IDS.startOutput, "entities"),
  edge("edge_node03_link_start_to_desert_marker", "node03_game_link_start_to_desert", "zoneLink", "node03_game_marker_start_desert_portal", "zoneLink"),
  edge("edge_node03_marker_start_desert_portal_to_zone", "node03_game_marker_start_desert_portal", "marker", IDS.startOutput, "markers"),
  edge("edge_node03_link_desert_to_start_zone", "node03_game_link_desert_to_start", "zoneLink", IDS.desertOutput, "links"),
  edge("edge_node03_model_desert_return_portal_to_zone", "node03_game_model_desert_return_portal", "entity", IDS.desertOutput, "entities"),
  edge("edge_node03_link_desert_to_start_marker", "node03_game_link_desert_to_start", "zoneLink", "node03_game_marker_desert_return_portal", "zoneLink"),
  edge("edge_node03_marker_desert_return_portal_to_zone", "node03_game_marker_desert_return_portal", "marker", IDS.desertOutput, "markers"),
  edge("edge_node03_adjacent_minimap_to_zone", "node03_demo_adjacent_zone_minimap", "minimap", IDS.adjacentZoneOutput, "minimap")
];

function mergeExistingNodeValues(id, values) {
  const existing = selectNode.get(id);
  if (!existing) return;
  upsertNode({
    id,
    type: existing.type,
    title: existing.title,
    x: existing.x,
    y: existing.y,
    parentId: existing.parent_id,
    values
  });
}

function ensureDesertGroupOutputs() {
  const existing = selectNode.get(IDS.desertGroup);
  if (!existing) return;
  const values = parseJson(existing.values_json, {});
  const groupInterface = values.groupInterface && typeof values.groupInterface === "object"
    ? values.groupInterface
    : { inputs: [], outputs: [] };
  const demoOutputNames = new Set(["catalogpackage", "policy", "uimodule"]);
  const nextOutputs = (Array.isArray(groupInterface.outputs) ? groupInterface.outputs : []).map(function (port) {
    return Object.assign({}, port);
  }).filter(function (port) {
    const key = String(port?.name || port?.id || "").trim().toLowerCase();
    return !demoOutputNames.has(key);
  });
  mergeExistingNodeValues(IDS.desertGroup, {
    groupInterface: {
      inputs: Array.isArray(groupInterface.inputs) ? groupInterface.inputs : [],
      outputs: nextOutputs
    }
  });
}

function cleanupOldGlobalRoutingEdges() {
  db.prepare(`
    DELETE FROM editor_node_edges
    WHERE (to_node_id = ? AND lower(to_port) IN ('catalogpackage', 'policy', 'uimodule'))
       OR (from_node_id = ? AND lower(from_port) IN ('catalogpackage', 'policy', 'uimodule'))
  `).run(IDS.desertGroupOutput, IDS.desertGroup);
  for (const id of [
    "edge_node03_catalog_to_group_output",
    "edge_node03_policy_to_player_rules_output",
    "edge_node03_ui_to_ui_output",
    "edge_node03_model_raider_to_zone"
  ]) {
    deleteEdgeById.run(id);
  }
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

for (const [key, label] of [
  [IDS.desertGroup, "Desert group"],
  [IDS.desertGroupOutput, "Desert group output"],
  [IDS.desertZone, "Desert zone definition"],
  [IDS.desertOutput, "Desert zone output"],
  [IDS.startGroup, "start zone group"],
  [IDS.startZone, "start zone definition"],
  [IDS.startOutput, "start zone output"],
  [IDS.startSpawn, "start zone spawn"],
  [IDS.catalogRegistry, "foundation catalog registry"],
  [IDS.playerRulesOutput, "foundation player rules output"],
  [IDS.uiOutput, "foundation UI output"],
  [IDS.projectSettings, "foundation project settings"]
]) {
  requireNode(key, label);
}

const backupPath = ensureBackup();
let appliedNodes = 0;
let appliedEdges = 0;

db.exec("BEGIN IMMEDIATE");
try {
  mergeExistingNodeValues(IDS.desertZone, {
    displayName: "Desert",
    biomeTags: ["desert"],
    zoneTags: ["desert", "node03", "demo", "combat", "resources", "loot"]
  });
  mergeExistingNodeValues(IDS.playerCharacter, {
    playableCharacterRef: "player.desert_guardian",
    useDefinitionPresentation: true,
    useDefinitionMovement: true
  });
  mergeExistingNodeValues(IDS.projectSettings, {
    startZoneRef: "zone.node02.live_demo",
    startSpawnRef: "spawn.node02.live_demo_default"
  });
  ensureDesertGroupOutputs();
  cleanupOldGlobalRoutingEdges();
  for (const entry of nodes) {
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
} finally {
  db.close();
}

console.log(JSON.stringify({
  ok: true,
  backupPath,
  nodesUpserted: appliedNodes,
  edgesEnsured: appliedEdges,
  desertGroupId: IDS.desertGroup,
  desertZoneOutputId: IDS.desertOutput,
  catalogOutputId: catalogOutput.id,
  spawnControllerId: "node03_demo_spawn_controller"
}, null, 2));
