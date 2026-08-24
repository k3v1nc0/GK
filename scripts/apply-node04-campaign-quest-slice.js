import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NODE_TYPES, groupInterfacePresetForKind } from "../src/shared/node-types.js";
import { cleanValuesForType } from "../src/server/field-validation.js";
import { openDatabase, resolveDatabasePath } from "../src/server/db.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = resolveDatabasePath(rootDir);
const db = openDatabase(rootDir);

const IDS = Object.freeze({
  startGroup: "node_group_96a070e2",
  startZone: "node_zone_definition_872d5230",
  startOutput: "node_zone_output_b438151a",
  startSpawn: "node_spawn_point_729d8266",
  desertGroup: "node_zone_canvas_55fbbba0",
  desertZone: "node_zone_definition_eb02ee73",
  desertOutput: "node_zone_output_5fdf926d",
  desertSpawn: "node_zone_spawn_9ed8006e",
  desertSpawnSet: "node03_demo_spawn_set",
  adjacentGroup: "node_zone_canvas_a9b6b432",
  adjacentZone: "node_zone_definition_6a0fa2b1",
  adjacentOutput: "node_zone_output_c9267136",
  adjacentSpawn: "node_zone_spawn_181f60de",
  catalogRegistry: "foundation.catalog_registry",
  campaignRegistry: "foundation.campaign_registry",
  uiOutput: "foundation.ui_output",
  projectSettings: "foundation.game_project_settings"
});

const ASSETS = Object.freeze({
  blacksmith: "asset_74948957-7106-4c24-835e-4d817ddfdc76",
  tree: "asset_3e5cc4d3-927c-4715-b2e5-bc2b03171c41",
  alchemyLab: "asset_c5211e52-119b-4b14-a3f1-4f6f3e855ebd"
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
  const backupPath = path.join(path.dirname(dbPath), "gk-real-node-editor.sqlite.node04-campaign-before.sqlite");
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
  if (!definition) throw new Error("Unknown node type for NODE-04: " + node.type);
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
    values
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

const groupInterface = groupInterfacePresetForKind("campaign");

const catalogNodes = [
  node("node04_catalog_output_global", "catalog_output", "NODE-04 Global Catalog Output", -1360, -1320, {
    catalogId: "catalog.node04.campaign",
    catalogVersion: "0.4.0",
    namespaceOwnership: ["node04", "quest", "campaign"]
  }),
  node("node04_item_wood", "item_definition", "NODE-04 Wood Item", -1620, -1240, {
    itemId: "item.wood",
    displayName: "Wood",
    internalLabel: "NODE-04 quest material",
    definitionVersion: 1,
    tags: ["item", "material", "wood", "quest"],
    category: "material",
    rarity: "common",
    stackable: true,
    stackLimit: 99,
    weight: 0.2,
    vendorBaseValueMinor: 1,
    vendorCurrencyRef: "currency.gold",
    bindPolicy: "unbound",
    inventoryTags: ["material", "wood", "quest"]
  }),
  node("node04_loot_entry_wood", "loot_item_entry", "NODE-04 Wood Loot Entry", -1620, -1110, {
    entryId: "loot_entry.node04.wood",
    itemRef: "item.wood",
    chance: 1,
    weight: 1,
    minQuantity: 2,
    maxQuantity: 3,
    guaranteed: true,
    qualityMode: "definition",
    qualityValue: "",
    modifierPoolRefs: [],
    conditionTagQuery: { all: [], any: [], none: [] }
  }),
  node("node04_loot_table_wood", "loot_table", "NODE-04 Wood Loot Table", -1360, -1110, {
    lootTableId: "loot_table.node04.wood",
    displayName: "Wood Yield",
    internalLabel: "NODE-04 wood gather yield",
    definitionVersion: 1,
    tags: ["loot", "wood", "quest"],
    rollMode: "all",
    rollCount: 1,
    allowDuplicates: true,
    ownershipMode: "personal",
    partyLootPolicyRef: null,
    pityPolicy: "none",
    pityCount: 0
  }),
  node("node04_resource_wood", "resource_definition", "NODE-04 Wood Resource", -1100, -1110, {
    resourceId: "resource.node04.wood",
    displayName: "Wood",
    internalLabel: "NODE-04 Road wood resource",
    definitionVersion: 1,
    tags: ["resource", "wood", "quest"],
    worldModelAssetId: ASSETS.tree,
    iconAssetId: null,
    yieldLootTableRef: "loot_table.node04.wood",
    yieldItemRefs: ["item.wood"],
    requiredToolTagQuery: { all: [], any: [], none: [] },
    requiredAbilityRef: "ability.gather_sun_crystal",
    requiredSkillStatRef: null,
    requiredSkillValue: 0,
    harvestDurationMs: 1200,
    depletionMode: "disappear",
    respawnPolicyRef: "respawn_policy.node03_quick",
    scope: "per_player",
    ownershipClaimMs: 0,
    harvestAnimationRole: "gather",
    gatherAudioRef: "audio.gather.node03",
    gatherVfxRef: "vfx.gather.node03",
    depletedModelAssetId: null
  }),
  node("node04_ability_attack_1", "ability_definition", "NODE-04 Attack 1 Ability", -1620, -960, {
    abilityId: "ability.attack_1",
    displayName: "Attack 1",
    internalLabel: "NODE-04 quest unlock attack",
    definitionVersion: 1,
    tags: ["ability", "combat", "weapon", "quest_reward"],
    description: "Quest reward attack.",
    enabled: true,
    iconAssetId: null,
    abilityType: "melee",
    resourceCostStatRef: null,
    resourceCostFormula: null,
    cooldownMs: 750,
    castTimeMs: 0,
    globalCooldownMs: 500,
    range: 3,
    minimumRange: 0,
    areaShape: "single",
    areaRadius: 0,
    coneAngle: 0,
    targetMode: "enemy",
    requiresLineOfSight: false,
    requiresWeaponTagQuery: { all: [], any: [], none: [] },
    damageFormula: { operator: "add", operands: [24] },
    healFormula: null,
    damageTypeRef: "damage_type.physical",
    statusEffectRefs: [],
    animationRole: "basicAttack",
    castAudioRef: null,
    impactAudioRef: "audio.hit.node03",
    castVfxRef: null,
    impactVfxRef: "vfx.hit.node03",
    interruptible: true,
    movementAllowedDuringCast: false,
    serverPredictionMode: "local_animation_only"
  }),
  node("node04_ability_rank_attack_1", "ability_rank", "NODE-04 Attack 1 Rank", -1360, -960, {
    abilityRankId: "ability_rank.attack_1.1",
    displayName: "Attack 1 Rank 1",
    internalLabel: "NODE-04 quest reward rank",
    definitionVersion: 1,
    tags: ["ability_rank", "combat", "quest_reward"],
    abilityRef: "ability.attack_1",
    rank: 1,
    requiredPlayerLevel: 3,
    costMultiplier: 1,
    damageFormulaOverride: { operator: "add", operands: [24] },
    healFormulaOverride: null,
    cooldownOverrideMs: 0,
    statusEffectOverrides: []
  })
];

const campaignNodes = [
  node("node04_global_campaign_group", "group", "NODE-04 Campaigns", 420, -1180, {
    groupId: "node04_campaigns",
    title: "NODE-04 Campaigns",
    groupKind: "campaign",
    zoneCanvas: false,
    groupInterface,
    interfacePresetVersion: 1,
    collapsedSummary: false
  }),
  node("group_output__node04_global_campaign_group", "group_output", "Group Output", 1020, -520, {}, "node04_global_campaign_group"),
  node("node04_campaign_output", "campaign_output", "NODE-04 Campaign Output", 760, -520, {
    packageId: "campaign_package.node04.main",
    packageVersion: "0.4.0",
    namespaceOwnership: ["node04", "main", "quest"]
  }, "node04_global_campaign_group"),
  node("node04_campaign_main", "campaign_definition", "NODE-04 Main Campaign", 500, -720, {
    campaignId: "campaign.node04.main",
    displayName: "Main Campaign",
    summary: "Startzone naar Desert/Road en Peaks.",
    startQuestRef: "quest.node04.road_to_peaks",
    priority: 10,
    tags: ["main", "node04"]
  }, "node04_global_campaign_group"),
  node("node04_chapter_road", "chapter_definition", "NODE-04 Road Chapter", 250, -720, {
    chapterId: "chapter.node04.road",
    displayName: "Road to Peaks",
    campaignRef: "campaign.node04.main",
    order: 1,
    startQuestRef: "quest.node04.road_to_peaks",
    tags: ["main", "node04"]
  }, "node04_global_campaign_group"),
  node("node04_quest_road_to_peaks", "quest_definition", "Quest Road to Peaks", -60, -860, {
    questId: "quest.node04.road_to_peaks",
    displayName: "Road to Peaks",
    summary: "Help Bram met hout en verdien toegang tot de Peaks route.",
    description: "Praat met Bram, verzamel Wood in de Desert road, bereik level 3 en lever exact 10 Wood in.",
    questType: "main",
    startStepRef: "quest_step.node04.collect_wood",
    turnInTargetRef: "target.node04.bram",
    recommendedZoneRef: "zone.canvas.x0.zm1",
    prerequisiteQuestRefs: [],
    nextQuestRefs: ["quest.node04.into_the_peaks"],
    autoTrack: true,
    abandonable: false,
    repeatMode: "once_per_character",
    minimumLevel: 1,
    tags: ["main", "node04", "wood"]
  }, "node04_global_campaign_group"),
  node("node04_quest_into_peaks", "quest_definition", "Quest Into the Peaks", -60, -470, {
    questId: "quest.node04.into_the_peaks",
    displayName: "Into the Peaks",
    summary: "Reis door naar Peaks.",
    description: "Gebruik de route vanuit Desert en bevestig aankomst bij het Peaks target.",
    questType: "main",
    startStepRef: "quest_step.node04.reach_peaks",
    turnInTargetRef: "target.node04.peaks_arrival",
    recommendedZoneRef: "zone.canvas.x0.zm1.2",
    prerequisiteQuestRefs: ["quest.node04.road_to_peaks"],
    nextQuestRefs: [],
    autoTrack: true,
    abandonable: false,
    repeatMode: "once_per_character",
    minimumLevel: 1,
    tags: ["main", "node04", "peaks"]
  }, "node04_global_campaign_group"),
  node("node04_step_collect_wood", "quest_step", "Collect Wood Step", -390, -900, {
    stepId: "quest_step.node04.collect_wood",
    displayName: "Collect Wood",
    instruction: "Gather 10 Wood in Desert.",
    stepType: "collect",
    sequenceIndex: 1,
    targetRef: "target.node04.road_wood",
    zoneRef: "zone.canvas.x0.zm1",
    nextStepRef: "quest_step.node04.deliver_wood",
    autoAdvance: true,
    optional: false
  }, "node04_global_campaign_group"),
  node("node04_step_deliver_wood", "quest_step", "Deliver Wood Step", -390, -720, {
    stepId: "quest_step.node04.deliver_wood",
    displayName: "Deliver to Bram",
    instruction: "Reach Level 3 and deliver 10 Wood to Bram.",
    stepType: "deliver",
    sequenceIndex: 2,
    targetRef: "target.node04.bram",
    zoneRef: "zone.node02.live_demo",
    nextStepRef: null,
    autoAdvance: false,
    optional: false
  }, "node04_global_campaign_group"),
  node("node04_step_reach_peaks", "quest_step", "Reach Peaks Step", -390, -470, {
    stepId: "quest_step.node04.reach_peaks",
    displayName: "Reach Peaks",
    instruction: "Travel to Peaks and confirm arrival.",
    stepType: "reach",
    sequenceIndex: 1,
    targetRef: "target.node04.peaks_arrival",
    zoneRef: "zone.canvas.x0.zm1.2",
    nextStepRef: null,
    autoAdvance: false,
    optional: false
  }, "node04_global_campaign_group"),
  node("node04_obj_collect_wood", "objective_collect", "Collect 10 Wood", -710, -900, {
    objectiveId: "objective.node04.collect_wood",
    instruction: "Wood",
    itemRef: "item.wood",
    requiredAmount: 10,
    targetRef: "target.node04.road_wood",
    zoneRef: "zone.canvas.x0.zm1"
  }, "node04_global_campaign_group"),
  node("node04_obj_deliver_wood", "objective_deliver", "Deliver 10 Wood", -710, -720, {
    objectiveId: "objective.node04.deliver_wood",
    instruction: "Deliver Wood",
    targetRef: "target.node04.bram",
    itemRef: "item.wood",
    requiredAmount: 10,
    zoneRef: "zone.node02.live_demo"
  }, "node04_global_campaign_group"),
  node("node04_obj_reach_peaks", "objective_reach", "Reach Peaks Objective", -710, -470, {
    objectiveId: "objective.node04.reach_peaks",
    instruction: "Reach Peaks",
    targetRef: "target.node04.peaks_arrival",
    zoneRef: "zone.canvas.x0.zm1.2",
    radius: 5
  }, "node04_global_campaign_group"),
  node("node04_condition_level_3", "condition_player_level", "Level 3 Required", -710, -580, {
    conditionId: "condition.node04.player_level_3",
    comparison: ">=",
    level: 3,
    failureText: "Level 3 nodig voordat Bram de levering accepteert."
  }, "node04_global_campaign_group"),
  node("node04_action_remove_wood", "action_remove_item", "Consume 10 Wood", -710, -250, {
    actionId: "action.node04.remove_wood_10",
    itemRef: "item.wood",
    amount: 10,
    reason: "quest_turn_in"
  }, "node04_global_campaign_group"),
  node("node04_reward_gold", "action_give_currency", "Reward Gold", -500, -250, {
    actionId: "action.node04.reward_gold",
    currencyRef: "currency.gold",
    amountMinor: 75,
    reason: "quest_reward"
  }, "node04_global_campaign_group"),
  node("node04_reward_xp", "action_give_xp", "Reward XP", -290, -250, {
    actionId: "action.node04.reward_xp",
    amount: 160,
    reason: "quest_reward"
  }, "node04_global_campaign_group"),
  node("node04_reward_attack_1", "action_unlock_ability", "Reward Attack 1", -80, -250, {
    actionId: "action.node04.reward_attack_1",
    abilityRef: "ability.attack_1",
    rank: 1,
    loadoutId: "loadout.main",
    preferredSlotIndex: 2,
    reason: "quest_reward"
  }, "node04_global_campaign_group"),
  node("node04_marker_collect_wood", "quest_marker_rule", "Marker Wood", -930, -900, {
    markerRuleId: "marker_rule.node04.collect_wood",
    targetRef: "target.node04.road_wood",
    label: "Gather Wood",
    icon: "collect",
    color: "#84cc16",
    radius: 5
  }, "node04_global_campaign_group"),
  node("node04_marker_deliver_bram", "quest_marker_rule", "Marker Bram", -930, -720, {
    markerRuleId: "marker_rule.node04.deliver_bram",
    targetRef: "target.node04.bram",
    label: "Return to Bram",
    icon: "turn_in",
    color: "#facc15",
    radius: 4
  }, "node04_global_campaign_group"),
  node("node04_marker_reach_peaks", "quest_marker_rule", "Marker Peaks", -930, -470, {
    markerRuleId: "marker_rule.node04.reach_peaks",
    targetRef: "target.node04.peaks_arrival",
    label: "Peaks",
    icon: "travel",
    color: "#22d3ee",
    radius: 5
  }, "node04_global_campaign_group"),
  node("node04_dialogue_bram", "dialogue_definition", "Bram Dialogue", -60, -1160, {
    dialogueId: "dialogue.node04.bram",
    displayName: "Bram",
    targetRef: "target.node04.bram",
    startEntryRef: "dialogue_entry.node04.bram.start",
    tags: ["node04", "quest", "bram"]
  }, "node04_global_campaign_group"),
  node("node04_dialogue_entry_bram_start", "dialogue_entry", "Bram Start Line", -390, -1160, {
    entryId: "dialogue_entry.node04.bram.start",
    speakerName: "Bram",
    text: "The road to Peaks needs repairs. Bring me 10 Wood from the Desert road, then come back when you are level 3.",
    nextEntryRef: null,
    closeAfterLine: false
  }, "node04_global_campaign_group"),
  node("node04_dialogue_choice_accept", "dialogue_choice", "Accept Choice", -710, -1200, {
    choiceId: "dialogue_choice.node04.bram.accept",
    label: "Accept",
    action: "accept_quest",
    questRef: "quest.node04.road_to_peaks",
    nextEntryRef: null,
    closeAfterSelect: true,
    order: 1
  }, "node04_global_campaign_group"),
  node("node04_dialogue_choice_later", "dialogue_choice", "Later Choice", -710, -1080, {
    choiceId: "dialogue_choice.node04.bram.later",
    label: "Later",
    action: "close",
    questRef: null,
    nextEntryRef: null,
    closeAfterSelect: true,
    order: 2
  }, "node04_global_campaign_group")
];

const uiNodes = [
  node("node04_quest_tracker_hud", "quest_tracker_hud", "NODE-04 Quest Tracker HUD", 1400, -980, {
    moduleId: "hud.node04.quest_tracker",
    anchor: "top-right",
    maxQuests: 3,
    showCompleted: true,
    showMarkers: true
  }),
  node("node04_dialogue_hud", "dialogue_hud", "NODE-04 Dialogue HUD", 1400, -850, {
    moduleId: "hud.node04.dialogue",
    anchor: "center",
    widthPx: 520,
    showSpeaker: true
  }),
  node("node04_notification_hud", "notification_hud", "NODE-04 Notification HUD", 1400, -720, {
    moduleId: "hud.node04.notifications",
    anchor: "top-left",
    maxVisible: 3,
    durationMs: 4500
  })
];

const startZoneNodes = [
  node("node04_model_bram", "model_entity", "Bram Quest NPC", -930, -360, {
    entityId: "entity_node04_bram",
    label: "Bram",
    modelAssetId: ASSETS.blacksmith,
    animationClip: null,
    idleAnimation: null,
    walkAnimation: null,
    runAnimation: null,
    x: 9,
    y: 0,
    z: -12,
    rotationX: 0,
    rotationY: 180,
    rotationZ: 0,
    scaleX: 1.15,
    scaleY: 1.15,
    scaleZ: 1.15,
    solid: false,
    walkable: false,
    collisionRadius: 1
  }, IDS.startGroup),
  node("node04_target_bram", "quest_target_binding", "Bram Quest Target", -690, -360, {
    targetId: "target.node04.bram",
    label: "Bram",
    targetTags: ["quest", "dialogue", "bram", "node04"],
    targetKind: "npc",
    zoneRef: "zone.node02.live_demo",
    entityRef: null,
    action: "node04:start_dialogue",
    prompt: "Talk",
    x: 9,
    y: 0,
    z: -12,
    radius: 4,
    visibleInGame: true
  }, IDS.startGroup)
];

const desertZoneNodes = [
  node("node04_resource_spawn_wood", "resource_spawn", "NODE-04 Wood Resource Spawn", -1410, -80, {
    spawnEntryId: "spawn.node04.wood",
    resourceRef: "resource.node04.wood",
    count: 5,
    x: 42,
    y: 0,
    z: 468,
    radius: 14,
    minimumSpacing: 3,
    distribution: "blue_noise",
    respawnOverrideRef: "respawn_policy.node03_quick",
    yieldMultiplier: 1,
    markerPolicyRef: null
  }, IDS.desertGroup),
  node("node04_model_wood_01", "model_entity", "Road Wood Stand", -1110, -120, {
    entityId: "entity_node04_road_wood_stand",
    label: "Road Wood Stand",
    modelAssetId: ASSETS.tree,
    animationClip: null,
    idleAnimation: null,
    walkAnimation: null,
    runAnimation: null,
    x: 42,
    y: 0,
    z: 468,
    rotationX: 0,
    rotationY: 18,
    rotationZ: 0,
    scaleX: 1.5,
    scaleY: 1.5,
    scaleZ: 1.5,
    solid: false,
    walkable: false,
    collisionRadius: 1.2
  }, IDS.desertGroup),
  node("node04_target_road_wood", "quest_target_binding", "Road Wood Quest Target", -870, -120, {
    targetId: "target.node04.road_wood",
    label: "Road Wood",
    targetTags: ["quest", "resource", "wood", "node04"],
    targetKind: "resource",
    zoneRef: "zone.canvas.x0.zm1",
    entityRef: null,
    action: "node04:move_marker",
    prompt: "Gather Wood",
    x: 42,
    y: 0,
    z: 468,
    radius: 6,
    visibleInGame: true
  }, IDS.desertGroup),
  node("node04_link_desert_to_peaks", "zone_link", "Desert to Peaks Link", -1120, 40, {
    linkId: "link.desert_to_peaks",
    fromZoneRef: "zone.canvas.x0.zm1",
    fromTargetRef: "spawn.canvas.x0.zm1",
    toZoneRef: "zone.canvas.x0.zm1.2",
    toSpawnRef: "spawn.canvas.x0.zm1.2",
    mode: "portal",
    bidirectional: false,
    reverseLinkRef: null,
    transitionVisual: "fade",
    loadingText: "Travel to Peaks",
    preloadDistance: 30,
    interactionRequired: true,
    prompt: "Naar Peaks",
    oneWayReason: ""
  }, IDS.desertGroup),
  node("node04_model_desert_peaks_gate", "model_entity", "Peaks Gate", -870, 40, {
    entityId: "entity_node04_desert_peaks_gate",
    label: "Peaks Gate",
    modelAssetId: ASSETS.alchemyLab,
    animationClip: null,
    idleAnimation: null,
    walkAnimation: null,
    runAnimation: null,
    x: -245,
    y: 0,
    z: 500,
    rotationX: 0,
    rotationY: 90,
    rotationZ: 0,
    scaleX: 0.7,
    scaleY: 0.7,
    scaleZ: 0.7,
    solid: false,
    walkable: false,
    collisionRadius: 1.2
  }, IDS.desertGroup)
];

const peaksZoneNodes = [
  node("node04_link_peaks_to_desert", "zone_link", "Peaks to Desert Link", -1120, 40, {
    linkId: "link.peaks_to_desert",
    fromZoneRef: "zone.canvas.x0.zm1.2",
    fromTargetRef: "spawn.canvas.x0.zm1.2",
    toZoneRef: "zone.canvas.x0.zm1",
    toSpawnRef: "spawn.canvas.x0.zm1",
    mode: "portal",
    bidirectional: false,
    reverseLinkRef: null,
    transitionVisual: "fade",
    loadingText: "Travel to Desert",
    preloadDistance: 30,
    interactionRequired: true,
    prompt: "Terug naar Desert",
    oneWayReason: ""
  }, IDS.adjacentGroup),
  node("node04_model_peaks_arrival", "model_entity", "Peaks Arrival Marker", -870, 40, {
    entityId: "entity_node04_peaks_arrival",
    label: "Peaks Arrival",
    modelAssetId: ASSETS.alchemyLab,
    animationClip: null,
    idleAnimation: null,
    walkAnimation: null,
    runAnimation: null,
    x: -500,
    y: 0,
    z: 500,
    rotationX: 0,
    rotationY: -90,
    rotationZ: 0,
    scaleX: 0.75,
    scaleY: 0.75,
    scaleZ: 0.75,
    solid: false,
    walkable: false,
    collisionRadius: 1.2
  }, IDS.adjacentGroup),
  node("node04_target_peaks_arrival", "quest_target_binding", "Peaks Arrival Quest Target", -620, 40, {
    targetId: "target.node04.peaks_arrival",
    label: "Peaks Arrival",
    targetTags: ["quest", "travel", "peaks", "node04"],
    targetKind: "marker",
    zoneRef: "zone.canvas.x0.zm1.2",
    entityRef: null,
    action: "node04:reach",
    prompt: "Complete",
    x: -500,
    y: 0,
    z: 500,
    radius: 5,
    visibleInGame: true
  }, IDS.adjacentGroup)
];

const edges = [
  edge("edge_node04_catalog_to_registry", "node04_catalog_output_global", "catalogPackage", IDS.catalogRegistry, "catalogPackage"),
  edge("edge_node04_loot_entry_wood_to_table", "node04_loot_entry_wood", "lootEntry", "node04_loot_table_wood", "entries"),
  edge("edge_node04_ability_rank_to_attack_1", "node04_ability_rank_attack_1", "abilityRankDef", "node04_ability_attack_1", "rankDefinitions"),
  ...catalogNodes.filter(function (entry) { return entry.type !== "catalog_output" && entry.type !== "loot_item_entry"; }).map(function (entry, index) {
    return edge("edge_node04_catalog_def_" + String(index).padStart(2, "0"), entry.id, "catalogDefinition", "node04_catalog_output_global", "definitions");
  }),
  edge("edge_node04_campaign_group_to_registry", "node04_global_campaign_group", "campaignpackage", IDS.campaignRegistry, "campaignPackage"),
  edge("edge_node04_campaign_output_to_group", "node04_campaign_output", "campaignPackage", "group_output__node04_global_campaign_group", "campaignpackage"),
  edge("edge_node04_campaign_to_output", "node04_campaign_main", "campaignDef", "node04_campaign_output", "campaigns"),
  edge("edge_node04_dialogue_to_output", "node04_dialogue_bram", "dialogueDef", "node04_campaign_output", "dialogues"),
  edge("edge_node04_chapter_to_campaign", "node04_chapter_road", "chapterDef", "node04_campaign_main", "chapters"),
  edge("edge_node04_quest_road_to_chapter", "node04_quest_road_to_peaks", "questDef", "node04_chapter_road", "quests"),
  edge("edge_node04_quest_peaks_to_chapter", "node04_quest_into_peaks", "questDef", "node04_chapter_road", "quests"),
  edge("edge_node04_dialogue_to_quest", "node04_dialogue_bram", "dialogueDef", "node04_quest_road_to_peaks", "startDialogue"),
  edge("edge_node04_step_collect_to_quest", "node04_step_collect_wood", "questStep", "node04_quest_road_to_peaks", "steps"),
  edge("edge_node04_step_deliver_to_quest", "node04_step_deliver_wood", "questStep", "node04_quest_road_to_peaks", "steps"),
  edge("edge_node04_step_reach_to_quest", "node04_step_reach_peaks", "questStep", "node04_quest_into_peaks", "steps"),
  edge("edge_node04_obj_collect_to_step", "node04_obj_collect_wood", "objective", "node04_step_collect_wood", "objectives"),
  edge("edge_node04_obj_deliver_to_step", "node04_obj_deliver_wood", "objective", "node04_step_deliver_wood", "objectives"),
  edge("edge_node04_obj_reach_to_step", "node04_obj_reach_peaks", "objective", "node04_step_reach_peaks", "objectives"),
  edge("edge_node04_condition_level_to_deliver", "node04_condition_level_3", "condition", "node04_step_deliver_wood", "conditions"),
  edge("edge_node04_remove_wood_to_deliver", "node04_action_remove_wood", "rewardEntry", "node04_step_deliver_wood", "rewards"),
  edge("edge_node04_reward_gold_to_quest", "node04_reward_gold", "rewardEntry", "node04_quest_road_to_peaks", "rewards"),
  edge("edge_node04_reward_xp_to_quest", "node04_reward_xp", "rewardEntry", "node04_quest_road_to_peaks", "rewards"),
  edge("edge_node04_reward_attack_to_quest", "node04_reward_attack_1", "rewardEntry", "node04_quest_road_to_peaks", "rewards"),
  edge("edge_node04_marker_collect_to_step", "node04_marker_collect_wood", "markerRule", "node04_step_collect_wood", "markerRule"),
  edge("edge_node04_marker_deliver_to_step", "node04_marker_deliver_bram", "markerRule", "node04_step_deliver_wood", "markerRule"),
  edge("edge_node04_marker_reach_to_step", "node04_marker_reach_peaks", "markerRule", "node04_step_reach_peaks", "markerRule"),
  edge("edge_node04_entry_bram_to_dialogue", "node04_dialogue_entry_bram_start", "dialogueEntry", "node04_dialogue_bram", "entries"),
  edge("edge_node04_choice_accept_to_entry", "node04_dialogue_choice_accept", "dialogueChoice", "node04_dialogue_entry_bram_start", "choices"),
  edge("edge_node04_choice_later_to_entry", "node04_dialogue_choice_later", "dialogueChoice", "node04_dialogue_entry_bram_start", "choices"),
  edge("edge_node04_ui_tracker_to_output", "node04_quest_tracker_hud", "uiModule", IDS.uiOutput, "uiModules"),
  edge("edge_node04_ui_dialogue_to_output", "node04_dialogue_hud", "uiModule", IDS.uiOutput, "uiModules"),
  edge("edge_node04_ui_notifications_to_output", "node04_notification_hud", "uiModule", IDS.uiOutput, "uiModules"),
  edge("edge_node04_bram_model_to_start_zone", "node04_model_bram", "entity", IDS.startOutput, "entities"),
  edge("edge_node04_bram_model_to_target", "node04_model_bram", "entity", "node04_target_bram", "entity"),
  edge("edge_node04_bram_target_to_start_zone", "node04_target_bram", "questTarget", IDS.startOutput, "questTargets"),
  edge("edge_node04_wood_spawn_to_desert_set", "node04_resource_spawn_wood", "spawnEntry", IDS.desertSpawnSet, "spawns"),
  edge("edge_node04_wood_model_to_desert_zone", "node04_model_wood_01", "entity", IDS.desertOutput, "entities"),
  edge("edge_node04_wood_model_to_target", "node04_model_wood_01", "entity", "node04_target_road_wood", "entity"),
  edge("edge_node04_wood_target_to_desert_zone", "node04_target_road_wood", "questTarget", IDS.desertOutput, "questTargets"),
  edge("edge_node04_desert_to_peaks_link_to_zone", "node04_link_desert_to_peaks", "zoneLink", IDS.desertOutput, "links"),
  edge("edge_node04_desert_peaks_gate_to_zone", "node04_model_desert_peaks_gate", "entity", IDS.desertOutput, "entities"),
  edge("edge_node04_peaks_to_desert_link_to_zone", "node04_link_peaks_to_desert", "zoneLink", IDS.adjacentOutput, "links"),
  edge("edge_node04_peaks_arrival_model_to_zone", "node04_model_peaks_arrival", "entity", IDS.adjacentOutput, "entities"),
  edge("edge_node04_peaks_arrival_model_to_target", "node04_model_peaks_arrival", "entity", "node04_target_peaks_arrival", "entity"),
  edge("edge_node04_peaks_target_to_zone", "node04_target_peaks_arrival", "questTarget", IDS.adjacentOutput, "questTargets")
];

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
  [IDS.startGroup, "start zone group"],
  [IDS.startZone, "start zone definition"],
  [IDS.startOutput, "start zone output"],
  [IDS.startSpawn, "start spawn"],
  [IDS.desertGroup, "Desert group"],
  [IDS.desertZone, "Desert zone definition"],
  [IDS.desertOutput, "Desert zone output"],
  [IDS.desertSpawn, "Desert spawn"],
  [IDS.desertSpawnSet, "Desert spawn set"],
  [IDS.adjacentGroup, "Peaks group"],
  [IDS.adjacentZone, "Peaks zone definition"],
  [IDS.adjacentOutput, "Peaks zone output"],
  [IDS.adjacentSpawn, "Peaks spawn"],
  [IDS.catalogRegistry, "foundation catalog registry"],
  [IDS.campaignRegistry, "foundation campaign registry"],
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
  mergeExistingNodeValues(IDS.projectSettings, {
    startZoneRef: "zone.node02.live_demo",
    startSpawnRef: "spawn.node02.live_demo_default"
  });
  mergeExistingNodeValues(IDS.startZone, {
    displayName: "Start Zone",
    zoneTags: ["start", "home_base", "node02", "node04"]
  });
  mergeExistingNodeValues(IDS.desertZone, {
    displayName: "Desert",
    biomeTags: ["desert"],
    zoneTags: ["desert", "road", "node03", "node04", "combat", "resources", "loot"]
  });
  mergeExistingNodeValues(IDS.adjacentGroup, {
    title: "Peaks"
  });
  mergeExistingNodeValues(IDS.adjacentZone, {
    displayName: "Peaks",
    biomeTags: ["peaks"],
    zoneTags: ["peaks", "node04", "travel"]
  });
  for (const entry of catalogNodes.concat(campaignNodes, uiNodes, startZoneNodes, desertZoneNodes, peaksZoneNodes)) {
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
  campaignPackageId: "campaign_package.node04.main",
  startTarget: "target.node04.bram",
  woodTarget: "target.node04.road_wood",
  peaksTarget: "target.node04.peaks_arrival"
}, null, 2));
