// Gedeelde bouwstenen voor testwerelden via de normale authoringroute (NODE-01/02).
//
// Gebruik vanuit smoke-, browser- en perf-scripts:
//   const world = createTestWorldApi(call);            // call(method, path, body) -> { status, json, text }
//   const foundation = await applyFoundation(world);    // World Assembly -> Game Output.gameProject
//   const zone = await createStartZone(world, foundation, { zoneId: "zone.demo", spawn: { x: 0, z: 0 } });
//   await world.add("ground_surface", { ... }, ROUTES.ground, foundation, zone);
//
// De route per soort node staat in ROUTES. Game Output accepteert sinds NODE-01 alleen gameProject.

export const ROUTES = Object.freeze({
  editorWorldSettings: { target: "assembly", fromPort: "editorWorldSettings", toPort: "editorWorldSettings" },
  gameWorldSettings: { target: "assembly", fromPort: "gameWorldSettings", toPort: "gameWorldSettings" },
  light: { target: "assembly", fromPort: "light", toPort: "lights" },
  keybind: { target: "assembly", fromPort: "keybind", toPort: "keybinds" },
  chunkLoading: { target: "assembly", fromPort: "chunkLoading", toPort: "chunkLoading" },
  ui: { target: "ui", fromPort: "ui", toPort: "ui" },
  minimapHud: { target: "ui", fromPort: "minimap", toPort: "minimap" },
  ground: { target: "zone", fromPort: "ground", toPort: "ground" },
  player: { target: "zone", fromPort: "player", toPort: "player" },
  entity: { target: "zone", fromPort: "entity", toPort: "entities" },
  terrain: { target: "zone", fromPort: "terrain", toPort: "terrain" },
  collision: { target: "zone", fromPort: "collision", toPort: "collision" },
  minimap: { target: "zone", fromPort: "minimap", toPort: "minimap" },
  spawnPoint: { target: "zone", fromPort: "spawnPoint", toPort: "spawns" },
  questTarget: { target: "zone", fromPort: "questTarget", toPort: "questTargets" },
  spawnController: { target: "zone", fromPort: "spawnController", toPort: "spawnControllers" }
});

export function createTestWorldApi(call) {
  async function request(method, pathname, body, expectedStatus, label) {
    const response = await call(method, pathname, body);
    if (response.status !== expectedStatus) {
      throw new Error(label + " mislukt: HTTP " + response.status + " " + String(response.text || "").slice(0, 300));
    }
    return response.json;
  }

  const api = {
    request,
    async graph() {
      return request("GET", "/api/editor/graph", null, 200, "graph ophalen");
    },
    async createNode(type, values, parentId = null) {
      const body = { type, values: values || {} };
      if (parentId) body.parentId = parentId;
      const json = await request("POST", "/api/editor/nodes", body, 201, "node " + type + " aanmaken");
      return { graph: json.graph || json, nodeId: json.nodeId || null };
    },
    async patchValues(nodeId, values) {
      return request("PATCH", "/api/editor/nodes/" + nodeId + "/values", { values }, 200, "node " + nodeId + " bijwerken");
    },
    async connect(fromNodeId, fromPort, toNodeId, toPort) {
      const json = await request("POST", "/api/editor/edges", { edge: { fromNodeId, fromPort, toNodeId, toPort } }, 201, "verbinding " + fromPort + " -> " + toPort);
      return json.graph || json;
    },
    // Maak een node en sluit hem aan volgens een ROUTES-regel. Geeft de nieuwe node-id terug.
    async add(type, values, route, foundation, zone) {
      const created = await api.createNode(type, values);
      const nodeId = created.nodeId;
      if (!nodeId) throw new Error("node " + type + " gaf geen nodeId terug");
      if (route) await api.wire(nodeId, route, foundation, zone);
      return nodeId;
    },
    async wire(nodeId, route, foundation, zone) {
      const targets = { assembly: foundation?.worldAssembly, ui: foundation?.uiOutput, zone: zone?.zoneOutput };
      const target = targets[route.target];
      if (!target) throw new Error("onbekend doel " + route.target + " voor route " + route.toPort);
      return api.connect(nodeId, route.fromPort, target.id, route.toPort);
    }
  };
  return api;
}

function requireNode(graph, type) {
  const node = (graph?.nodes || []).find(function (candidate) { return candidate.type === type; });
  if (!node) throw new Error("foundation mist node " + type);
  return node;
}

// Past de foundation-migratie toe op een verse database en geeft de belangrijkste nodes terug.
export async function applyFoundation(api) {
  const preview = await api.request("GET", "/api/editor/migrations/node-system-foundation-v1/preview", null, 200, "foundation preview");
  if (!preview || !preview.previewId) throw new Error("foundation preview gaf geen previewId");
  const before = await api.graph();
  await api.request("POST", "/api/editor/migrations/node-system-foundation-v1/apply", { previewId: preview.previewId, expectedGraphRevision: before.graphRevision }, 200, "foundation apply");
  const graph = await api.graph();
  return {
    graph,
    worldAssembly: requireNode(graph, "world_assembly"),
    zoneRegistry: requireNode(graph, "zone_registry"),
    uiOutput: requireNode(graph, "ui_output"),
    projectSettings: requireNode(graph, "game_project_settings"),
    gameCamera: requireNode(graph, "game_camera"),
    editorCamera: requireNode(graph, "editor_camera"),
    editorChunkLoading: requireNode(graph, "editor_chunk_loading"),
    gameChunkLoading: requireNode(graph, "game_chunk_loading"),
    catalogRegistry: requireNode(graph, "catalog_registry"),
    campaignRegistry: requireNode(graph, "campaign_registry"),
    playerRulesOutput: requireNode(graph, "player_rules_output")
  };
}

// Fase-02 golden path via uitsluitend de normale authoring-API:
// vijand -> gegarandeerd bewijsitem -> deliver/turn-in -> XP-beloning.
// Alle canonieke ids zijn van deze fixture; er wordt niets uit Kevins wereld verondersteld.
export async function addGoldenPathSlice(api, foundation, zone, options = {}) {
  const prefix = String(options.prefix || "f2_golden").replace(/[^a-z0-9_]+/gi, "_").toLowerCase();
  const canonical = prefix.replace(/_/g, ".");
  const itemId = "item." + canonical + ".proof";
  const pickupItemId = "item." + canonical + ".pickup";
  const lootTableId = "loot_table." + canonical + ".enemy";
  const enemyId = "enemy." + canonical + ".sentinel";
  const questId = "quest." + canonical + ".defeat";
  const questStepId = "quest_step." + canonical + ".turn_in";
  const targetId = "target." + canonical + ".turn_in";
  const abilityId = "ability.basic_attack";
  const playerStatBlockId = "stat_block." + canonical + ".player";
  const enemyStatBlockId = "stat_block." + canonical + ".enemy";
  const respawnPolicyId = "respawn_policy." + canonical + ".slow";
  const modelAssetId = options.modelAssetId || null;
  const enemyPosition = Object.assign({ x: 2, y: 0, z: 0 }, options.enemyPosition || {});
  const pickupPosition = Object.assign({ x: 0, y: 0, z: 2 }, options.pickupPosition || {});
  const turnInPosition = Object.assign({ x: 0, y: 0, z: 0 }, options.turnInPosition || {});

  async function addNode(type, values) {
    const created = await api.createNode(type, values);
    if (!created.nodeId) throw new Error("golden-path node " + type + " gaf geen nodeId terug");
    return created.nodeId;
  }

  const catalogOutput = await addNode("catalog_output", {
    catalogId: "catalog." + canonical,
    catalogVersion: "1.0.0",
    namespaceOwnership: [prefix, "f2", "test"]
  });
  await api.connect(catalogOutput, "catalogPackage", foundation.catalogRegistry.id, "catalogPackage");

  const catalogDefinitions = [];
  async function addCatalog(type, values) {
    const id = await addNode(type, values);
    catalogDefinitions.push(id);
    return id;
  }

  const healthStat = await addCatalog("stat_definition", {
    statId: "stat.health", displayName: "Health", definitionVersion: 1, tags: ["stat", "vital"],
    valueType: "integer", minimum: 0, maximum: 1000, defaultValue: 100,
    persistCurrentValue: true, replicateMode: "nearby", uiFormat: "number"
  });
  const armorStat = await addCatalog("stat_definition", {
    statId: "stat.armor", displayName: "Armor", definitionVersion: 1, tags: ["stat", "defense"],
    valueType: "integer", minimum: 0, maximum: 500, defaultValue: 0,
    persistCurrentValue: false, replicateMode: "nearby", uiFormat: "number"
  });
  const attackStat = await addCatalog("stat_definition", {
    statId: "stat.attack_power", displayName: "Attack Power", definitionVersion: 1, tags: ["stat", "offense"],
    valueType: "integer", minimum: 0, maximum: 500, defaultValue: 20,
    persistCurrentValue: false, replicateMode: "nearby", uiFormat: "number"
  });
  const playerStats = await addCatalog("stat_block", {
    statBlockId: playerStatBlockId, displayName: "Golden Player Stats", definitionVersion: 1,
    tags: ["stat_block", "player", prefix],
    entries: [
      { statRef: "stat.health", baseValue: 120 },
      { statRef: "stat.armor", baseValue: 4 },
      { statRef: "stat.attack_power", baseValue: 40 }
    ],
    overrideMode: "merge"
  });
  const enemyStats = await addCatalog("stat_block", {
    statBlockId: enemyStatBlockId, displayName: "Golden Enemy Stats", definitionVersion: 1,
    tags: ["stat_block", "enemy", prefix],
    entries: [
      { statRef: "stat.health", baseValue: 100 },
      { statRef: "stat.armor", baseValue: 0 },
      { statRef: "stat.attack_power", baseValue: 1 }
    ],
    overrideMode: "merge"
  });
  const ability = await addCatalog("ability_definition", {
    abilityId, displayName: "Basic Attack", definitionVersion: 1, tags: ["ability", "combat"],
    abilityType: "melee", cooldownMs: 50, castTimeMs: 0, globalCooldownMs: 0, range: 4,
    minimumRange: 0, areaShape: "single", areaRadius: 0, coneAngle: 0, targetMode: "enemy",
    requiresLineOfSight: false, requiresWeaponTagQuery: { all: [], any: [], none: [] },
    damageFormula: { operator: "add", operands: [30] }, damageTypeRef: null, statusEffectRefs: [],
    animationRole: "basicAttack", interruptible: true, movementAllowedDuringCast: false,
    serverPredictionMode: "local_animation_only"
  });
  const proofItem = await addCatalog("item_definition", {
    itemId, displayName: "Sentinel Proof", definitionVersion: 1,
    tags: ["item", "loot", "quest", prefix], category: "quest", rarity: "quest",
    stackable: true, stackLimit: 99, weight: 0, vendorBaseValueMinor: 0,
    bindPolicy: "quest_bound", questItem: true, inventoryTags: ["quest", prefix],
    worldModelAssetId: modelAssetId
  });
  await addCatalog("item_definition", {
    itemId: pickupItemId, displayName: "Golden Pickup", definitionVersion: 1,
    tags: ["item", "pickup", prefix], category: "material", rarity: "common",
    stackable: true, stackLimit: 99, weight: 0, vendorBaseValueMinor: 0,
    bindPolicy: "unbound", questItem: false, inventoryTags: ["pickup", prefix],
    worldModelAssetId: modelAssetId
  });
  const lootEntry = await addNode("loot_item_entry", {
    entryId: "loot_entry." + canonical + ".proof", itemRef: itemId, chance: 1, weight: 1,
    minQuantity: 1, maxQuantity: 1, guaranteed: true, qualityMode: "definition",
    modifierPoolRefs: [], conditionTagQuery: { all: [], any: [], none: [] }
  });
  const lootTable = await addCatalog("loot_table", {
    lootTableId, displayName: "Sentinel Proof Loot", definitionVersion: 1,
    tags: ["loot", "enemy", "quest", prefix], rollMode: "all", rollCount: 1,
    allowDuplicates: false, ownershipMode: "personal", pityPolicy: "none", pityCount: 0
  });
  await api.connect(lootEntry, "lootEntry", lootTable, "entries");
  const respawnPolicy = await addCatalog("respawn_policy_definition", {
    respawnPolicyId, displayName: "Golden Slow Respawn", definitionVersion: 1,
    tags: ["respawn", prefix], minDelayMs: 3600000, maxDelayMs: 3600000,
    jitterMode: "none", maxAliveDefault: 1, corpseDurationMs: 0,
    despawnDistance: 500, resetEncounterOnWipe: false, oneTimeSpawn: false
  });
  const enemy = await addCatalog("enemy_archetype", {
    enemyId, displayName: "Golden Sentinel", definitionVersion: 1,
    tags: ["enemy", "combat", prefix], species: "sentinel", role: "normal",
    modelAssetId, statBlockRef: enemyStatBlockId, lootTableRef: lootTableId,
    baseLevel: 1, minimumLevel: 1, maximumLevel: 1, scale: 1, collisionRadius: 0.55,
    networkProfile: "normal", corpseDurationMs: 0, defaultRespawnPolicyRef: respawnPolicyId,
    nameplateMode: "always", bestiaryCategory: "Test"
  });
  const playable = await addCatalog("playable_character_definition", {
    characterId: "player." + canonical, displayName: "Golden Tester", definitionVersion: 1,
    tags: ["player", prefix], modelAssetId, classTags: ["tester"], baseMoveSpeed: 7,
    sprintMultiplier: 1.6, turnSpeed: 540, collisionRadius: 0.5, scale: 1,
    statBlockRef: playerStatBlockId, startingAbilityRefs: [abilityId],
    startingItemGrants: [], startingCurrencyGrants: [], defaultLoadoutId: "loadout.main"
  });
  for (const definition of catalogDefinitions) {
    await api.connect(definition, "catalogDefinition", catalogOutput, "definitions");
  }
  await api.connect(enemyStats, "statBlock", enemy, "statBlock");
  await api.connect(lootTable, "lootTable", enemy, "lootTable");
  await api.connect(playerStats, "statBlock", playable, "statBlock");

  const progressionPolicy = await addNode("player_progression_rules", {
    rulesId: "player_rules.progression." + canonical, maxLevel: 10,
    baseStatBlockRef: playerStatBlockId, healthStatRef: "stat.health",
    armorStatRef: "stat.armor", levelUpHealPolicy: "full"
  });
  const inventoryPolicy = await addNode("inventory_rules", {
    rulesId: "player_rules.inventory." + canonical, slotCapacity: 24, weightCapacity: 100,
    capacityMode: "both", stackMergePolicy: "exact_item_and_bind", pickupOverflow: "reject",
    allowDestroy: true, allowDrop: true
  });
  await api.connect(progressionPolicy, "policy", foundation.playerRulesOutput.id, "policy");
  await api.connect(inventoryPolicy, "policy", foundation.playerRulesOutput.id, "policy");

  const enemySpawn = await addNode("enemy_spawn_area", {
    spawnEntryId: "spawn." + canonical + ".enemy", enemyRef: enemyId,
    countMin: 1, countMax: 1, distribution: "random", minimumSpacing: 0,
    levelMode: "fixed", fixedLevel: 1, x: enemyPosition.x, y: enemyPosition.y, z: enemyPosition.z,
    radius: 0, respawnPolicyRef: respawnPolicyId, maxAlive: 1, activationRadius: 100,
    playerExclusionRadius: 0
  });
  const pickupSpawn = await addNode("pickup_spawn", {
    spawnEntryId: "spawn." + canonical + ".pickup", pickupKind: "item", itemRef: pickupItemId,
    amount: 1, minAmount: 1, maxAmount: 1,
    x: pickupPosition.x, y: pickupPosition.y, z: pickupPosition.z,
    respawnPolicyRef: respawnPolicyId, ownershipMode: "shared"
  });
  const spawnSet = await addNode("spawn_set", {
    spawnSetId: "spawn_set." + canonical, activationMode: "zone_loaded", maxAliveTotal: 2,
    randomSeedMode: "deterministic_build", sharedRespawnPolicyRef: respawnPolicyId
  });
  const spawnController = await addNode("spawn_controller", {
    spawnControllerId: "spawn_controller." + canonical, scope: "zone",
    sleepOutsideInterest: false, interestRadius: 120, preloadRadius: 160,
    buildBudgetPerTick: 4, maxActiveInstances: 10, persistenceScope: "zone"
  });
  await api.connect(enemySpawn, "spawnEntry", spawnSet, "spawns");
  await api.connect(pickupSpawn, "spawnEntry", spawnSet, "spawns");
  await api.connect(spawnSet, "spawnSet", spawnController, "spawnSets");
  await api.wire(spawnController, ROUTES.spawnController, foundation, zone);

  const questTarget = await addNode("quest_target_binding", {
    targetId, label: "Golden Turn-in", targetTags: ["quest", prefix], targetKind: "marker",
    zoneRef: zone.zoneId, entityRef: null, action: "node04:turn_in", prompt: "Turn in",
    x: turnInPosition.x, y: turnInPosition.y, z: turnInPosition.z, radius: 5, visibleInGame: true
  });
  await api.wire(questTarget, ROUTES.questTarget, foundation, zone);

  const campaignOutput = await addNode("campaign_output", {
    packageId: "campaign_package." + canonical, packageVersion: "1.0.0",
    namespaceOwnership: [prefix, "f2", "test"]
  });
  const campaign = await addNode("campaign_definition", {
    campaignId: "campaign." + canonical, displayName: "Golden Campaign",
    summary: "Fase 02 golden path", startQuestRef: questId, priority: 1, tags: [prefix]
  });
  const chapter = await addNode("chapter_definition", {
    chapterId: "chapter." + canonical, displayName: "Golden Chapter",
    campaignRef: "campaign." + canonical, order: 1, startQuestRef: questId, tags: [prefix]
  });
  const quest = await addNode("quest_definition", {
    questId, displayName: "Defeat the Golden Sentinel",
    summary: "Defeat the enemy and turn in its proof.",
    description: "Defeat the Golden Sentinel, collect its proof, and turn it in.",
    questType: "main", startStepRef: questStepId, turnInTargetRef: targetId,
    recommendedZoneRef: zone.zoneId, prerequisiteQuestRefs: [], nextQuestRefs: [],
    autoTrack: true, abandonable: false, repeatMode: "once_per_character",
    resetOnContentChange: false, minimumLevel: 1, tags: [prefix, "enemy", "turn_in"]
  });
  const questStep = await addNode("quest_step", {
    stepId: questStepId, displayName: "Defeat and return",
    instruction: "Defeat the Golden Sentinel and turn in its proof.",
    stepType: "deliver", sequenceIndex: 1, targetRef: targetId, zoneRef: zone.zoneId,
    nextStepRef: null, autoAdvance: false, optional: false
  });
  const objective = await addNode("objective_deliver", {
    objectiveId: "objective." + canonical + ".proof", instruction: "Sentinel Proof",
    targetRef: targetId, itemRef: itemId, requiredAmount: 1, zoneRef: zone.zoneId
  });
  const rewardXp = await addNode("action_give_xp", {
    actionId: "action." + canonical + ".reward_xp", amount: 75, reason: "quest_reward"
  });
  await api.connect(campaignOutput, "campaignPackage", foundation.campaignRegistry.id, "campaignPackage");
  await api.connect(campaign, "campaignDef", campaignOutput, "campaigns");
  await api.connect(chapter, "chapterDef", campaign, "chapters");
  await api.connect(quest, "questDef", chapter, "quests");
  await api.connect(questStep, "questStep", quest, "steps");
  await api.connect(objective, "objective", questStep, "objectives");
  await api.connect(rewardXp, "rewardEntry", quest, "rewards");

  const healthHud = await addNode("hud_bar", {
    moduleId: "hud." + canonical + ".health", anchor: "bottom-left",
    sourceStatRef: "stat.health", label: "Health", widthPx: 220, heightPx: 18,
    showNumbers: true, showPercent: false, showCombatSummary: true
  });
  const interactionHud = await addNode("interaction_hud", {
    moduleId: "hud." + canonical + ".target", anchor: "bottom-center", layout: "compact",
    targetKinds: ["enemy", "pickup"], maxTargets: 4, showDistance: true, showHealth: true,
    showLootPreview: true, allowDemoReset: false, rangeMode: "ability_range",
    runtimeTargetScope: "current_zone"
  });
  const inventoryHud = await addNode("inventory_hud", {
    moduleId: "hud." + canonical + ".loot", anchor: "bottom-right",
    columns: 4, layout: "grid", showWeight: false, showFilters: false,
    allowStackSplit: false, allowDestroy: false
  });
  const questHud = await addNode("quest_tracker_hud", {
    moduleId: "hud." + canonical + ".quest", anchor: "top-right", maxQuests: 1,
    showCompleted: true, showMarkers: true, allowQuestReset: false
  });
  for (const hud of [healthHud, interactionHud, inventoryHud, questHud]) {
    await api.connect(hud, "uiModule", foundation.uiOutput.id, "uiModules");
  }

  return {
    prefix, itemId, pickupItemId, lootTableId, enemyId, questId, targetId, abilityId,
    enemySpawnId: "spawn." + canonical + ".enemy",
    pickupSpawnId: "spawn." + canonical + ".pickup",
    enemyPosition, pickupPosition, turnInPosition
  };
}

// Maakt de startzone (outdoor zones zijn verplicht 500 x 500) rond het midden van de wereld,
// met omgeving, Zone Output en een zone-default spawn, en zet de start-refs in de projectinstellingen.
export async function createStartZone(api, foundation, options = {}) {
  const zoneId = options.zoneId || "zone.test";
  const spawn = Object.assign({ spawnId: zoneId.replace(/^zone\./, "spawn.") + ".default", x: 0, y: 0, z: 0, facing: 0 }, options.spawn || {});
  const zoneDefinitionId = (await api.createNode("zone_definition", Object.assign({
    zoneId,
    displayName: options.displayName || "Test Zone",
    zoneType: "outdoor_normal",
    originX: -250,
    originY: 0,
    originZ: -250,
    width: 500,
    depth: 500,
    minY: -100,
    maxY: 500,
    recommendedLevelMin: 1,
    recommendedLevelMax: 10,
    biomeTags: [],
    zoneTags: [],
    allowFastTravel: true,
    allowRespawn: true,
    activeByDefault: true
  }, options.zone || {}))).nodeId;
  const zoneEnvironmentId = (await api.createNode("zone_environment_settings", Object.assign({
    environmentId: zoneId.replace(/^zone\./, "environment."),
    backgroundColor: "#0b1622",
    fogColor: "#0b1622",
    fogDensity: 0,
    smoothShading: true,
    timeOfDayOffset: 0,
    shadowPresetOverride: "inherit"
  }, options.environment || {}))).nodeId;
  const zoneOutputId = (await api.createNode("zone_output", { packageId: zoneId + ".package", packageVersion: 1, includeEditorOnlyData: false })).nodeId;
  const spawnPointId = (await api.createNode("spawn_point", {
    spawnId: spawn.spawnId,
    role: "zone_default",
    zoneRef: zoneId,
    label: options.displayName ? options.displayName + " spawn" : "Spawn",
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    facing: spawn.facing,
    safeRadius: 1.25,
    snapToGround: true,
    validateCollision: true,
    activationConditionRef: null,
    priority: 0
  })).nodeId;
  await api.connect(zoneDefinitionId, "zone", zoneOutputId, "zone");
  await api.connect(zoneEnvironmentId, "environment", zoneOutputId, "environment");
  await api.connect(spawnPointId, "spawnPoint", zoneOutputId, "spawns");
  await api.connect(zoneOutputId, "zonePackage", foundation.zoneRegistry.id, "zonePackage");
  await api.patchValues(foundation.projectSettings.id, { startZoneRef: zoneId, startSpawnRef: spawn.spawnId });
  return {
    zoneId,
    spawnId: spawn.spawnId,
    zoneDefinition: { id: zoneDefinitionId },
    zoneEnvironment: { id: zoneEnvironmentId },
    zoneOutput: { id: zoneOutputId },
    spawnPoint: { id: spawnPointId }
  };
}

// Tweede zone met aankomst-spawn plus een Zone Link en een (niet-blokkerend) portal in de startzone.
// options: { modelAssetId (verplicht), portal: {x, z}, linkId, targetZoneId, arrival: {x, z} }
export async function addZoneLinkPortal(api, foundation, zone, options = {}) {
  if (!options.modelAssetId) throw new Error("addZoneLinkPortal vereist een modelAssetId voor het portal");
  const targetZoneId = options.targetZoneId || zone.zoneId + "_two";
  const linkId = options.linkId || "zone_link." + zone.zoneId.replace(/^zone\./, "") + "_to_two";
  const arrival = Object.assign({ x: 300, z: 0 }, options.arrival || {});
  const portal = Object.assign({ x: 6, z: -6 }, options.portal || {});
  const arrivalSpawnId = targetZoneId.replace(/^zone\./, "spawn.") + ".arrival";
  const secondZoneDefinitionId = (await api.createNode("zone_definition", {
    zoneId: targetZoneId, displayName: "Second Zone", zoneType: "outdoor_normal",
    originX: 250, originY: 0, originZ: -250, width: 500, depth: 500, minY: -100, maxY: 500,
    recommendedLevelMin: 1, recommendedLevelMax: 10, biomeTags: [], zoneTags: [],
    allowFastTravel: true, allowRespawn: true, activeByDefault: true
  })).nodeId;
  const secondZoneOutputId = (await api.createNode("zone_output", { packageId: targetZoneId + ".package", packageVersion: 1, includeEditorOnlyData: false })).nodeId;
  const arrivalSpawnPointId = (await api.createNode("spawn_point", {
    spawnId: arrivalSpawnId, role: "zone_default", zoneRef: targetZoneId, label: "Arrival",
    x: arrival.x, y: 0, z: arrival.z, facing: 90, safeRadius: 1.25, snapToGround: true,
    validateCollision: true, activationConditionRef: null, priority: 0
  })).nodeId;
  await api.connect(secondZoneDefinitionId, "zone", secondZoneOutputId, "zone");
  await api.connect(arrivalSpawnPointId, "spawnPoint", secondZoneOutputId, "spawns");
  await api.connect(secondZoneOutputId, "zonePackage", foundation.zoneRegistry.id, "zonePackage");
  const zoneLinkId = (await api.createNode("zone_link", {
    linkId, fromZoneRef: zone.zoneId, toZoneRef: targetZoneId, toSpawnRef: arrivalSpawnId,
    mode: "portal", bidirectional: false, transitionVisual: "fade", preloadDistance: 30, interactionRequired: true
  })).nodeId;
  await api.connect(zoneLinkId, "zoneLink", zone.zoneOutput.id, "links");
  const portalModelId = (await api.createNode("model_entity", {
    entityId: "entity.test_portal_model", label: "Test Portal Model", modelAssetId: options.modelAssetId,
    x: portal.x, y: 0, z: portal.z, solid: false, collisionRadius: 1
  })).nodeId;
  const portalComponentId = (await api.createNode("portal_component", { componentId: "portal.test_portal", zoneLinkRef: linkId, range: 4, autoActivate: false })).nodeId;
  const portalAssemblyId = (await api.createNode("entity_assembly", { entityId: "entity.test_portal", label: "Test Portal" })).nodeId;
  await api.connect(portalModelId, "entity", portalAssemblyId, "model");
  await api.connect(portalComponentId, "component", portalAssemblyId, "components");
  await api.connect(portalAssemblyId, "entity", zone.zoneOutput.id, "entities");
  return { linkId, targetZoneId, arrivalSpawnId, portal, arrival };
}
