import crypto from "node:crypto";
import {
  CATALOG_SCHEMA_VERSION,
  CATALOG_SECTION_KEYS,
  createEmptyCatalog
} from "../shared/catalog-contract.js";
import {
  canonicalJsonStringify,
  deepCloneJson,
  normalizeCanonicalId,
  normalizeReferenceList,
  normalizeTagList,
  normalizeTagQuery
} from "../shared/node-contract.js";

function safeString(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function contentHashFor(value) {
  return "sha256:" + crypto.createHash("sha256").update(canonicalJsonStringify(value)).digest("hex");
}

function clone(value) {
  return deepCloneJson(value);
}

function nodeMapForGraph(graph) {
  return new Map((Array.isArray(graph?.nodes) ? graph.nodes : []).map(function (node) {
    return [node.id, node];
  }));
}

function directIncomingEdges(graph, outputNode, portName) {
  return (Array.isArray(graph?.edges) ? graph.edges : []).filter(function (edge) {
    return edge.toNodeId === outputNode.id && edge.toPort === portName;
  });
}

function firstNodeOfType(graph, parentId, type) {
  return (Array.isArray(graph?.nodes) ? graph.nodes : []).find(function (node) {
    return node.parentId === parentId && node.type === type;
  }) || null;
}

function uniqueNodes(nodes) {
  const map = new Map();
  for (const node of nodes || []) {
    if (node?.id) map.set(node.id, node);
  }
  return Array.from(map.values());
}

function createResolutionState() {
  return { stack: [], keyIndex: new Map() };
}

function resolutionKey(kind, node, portName) {
  return kind + ":" + node.id + ":" + portName + ":" + (node.parentId || "root");
}

function enterResolution(state, kind, node, portName) {
  const key = resolutionKey(kind, node, portName);
  if (state.keyIndex.has(key)) {
    const error = new Error("Group connection cycle detected while compiling catalog.");
    error.status = 400;
    throw error;
  }
  const frame = { key, nodeId: node.id, portName };
  state.keyIndex.set(key, state.stack.length);
  state.stack.push(frame);
  return frame;
}

function leaveResolution(state, frame) {
  const index = state.stack.lastIndexOf(frame);
  if (index !== -1) state.stack.splice(index, 1);
  state.keyIndex.delete(frame.key);
}

function resolveInputSources(graph, targetNode, portName, nodeMap, state = createResolutionState()) {
  const frame = enterResolution(state, "input", targetNode, portName);
  try {
    const resolved = [];
    for (const edge of directIncomingEdges(graph, targetNode, portName)) {
      const source = nodeMap.get(edge.fromNodeId);
      if (!source) continue;
      resolved.push.apply(resolved, resolveOutputSources(graph, source, edge.fromPort, nodeMap, state));
    }
    return uniqueNodes(resolved);
  } finally {
    leaveResolution(state, frame);
  }
}

function resolveOutputSources(graph, sourceNode, portName, nodeMap, state = createResolutionState()) {
  const frame = enterResolution(state, "output", sourceNode, portName);
  try {
    if (sourceNode.type === "group") {
      const outputNode = firstNodeOfType(graph, sourceNode.id, "group_output");
      if (!outputNode) return [];
      return resolveInputSources(graph, outputNode, portName, nodeMap, state);
    }
    if (sourceNode.type === "group_input") {
      const parent = nodeMap.get(sourceNode.parentId);
      if (!parent) return [];
      return resolveInputSources(graph, parent, portName, nodeMap, state);
    }
    if (sourceNode.type === "group_output") return [];
    return [sourceNode];
  } finally {
    leaveResolution(state, frame);
  }
}

function firstIncomingNode(graph, outputNode, portName, nodeMap) {
  return resolveInputSources(graph, outputNode, portName, nodeMap)[0] || null;
}

function incomingNodes(graph, outputNode, portName, nodeMap) {
  return resolveInputSources(graph, outputNode, portName, nodeMap);
}

function values(node) {
  return clone(node?.values || {});
}

function baseDefinition(node, idField) {
  const raw = values(node);
  const id = normalizeCanonicalId(raw[idField], "");
  const def = Object.assign({}, raw, {
    id,
    nodeId: node.id,
    nodeType: node.type,
    displayName: safeString(raw.displayName || raw.label || raw[idField] || id),
    internalLabel: safeString(raw.internalLabel || ""),
    definitionVersion: Math.max(1, Math.floor(safeNumber(raw.definitionVersion, 1))),
    tags: normalizeTagList(raw.tags),
    enabled: raw.enabled !== false
  });
  def.contentHash = contentHashFor(Object.assign({}, def, {
    nodeId: undefined,
    nodeType: undefined,
    contentHash: undefined
  }));
  return def;
}

function connectedRef(graph, node, portName, nodeMap, idField) {
  const source = firstIncomingNode(graph, node, portName, nodeMap);
  return normalizeCanonicalId(source?.values?.[idField], "") || null;
}

function connectedRefs(graph, node, portName, nodeMap, idField) {
  return incomingNodes(graph, node, portName, nodeMap).map(function (source) {
    return normalizeCanonicalId(source?.values?.[idField], "");
  }).filter(Boolean);
}

function connectedRecords(graph, node, portName, nodeMap) {
  return incomingNodes(graph, node, portName, nodeMap).map(function (source) {
    return Object.assign({ nodeId: source.id, nodeType: source.type }, values(source));
  });
}

function normalizeGrantList(list, refKey, amountKey) {
  return (Array.isArray(list) ? list : []).map(function (entry) {
    const ref = normalizeCanonicalId(entry?.[refKey], "");
    const amount = Math.max(0, Math.floor(safeNumber(entry?.[amountKey], 0)));
    return ref && amount > 0 ? Object.assign({}, entry, { [refKey]: ref, [amountKey]: amount }) : null;
  }).filter(Boolean);
}

const DEFINITION_SPECS = {
  playable_character_definition: { section: "playableCharacters", idField: "characterId" },
  item_definition: { section: "items", idField: "itemId" },
  item_modifier_definition: { section: "itemModifiers", idField: "modifierId" },
  resource_definition: { section: "resources", idField: "resourceId" },
  recipe_definition: { section: "recipes", idField: "recipeId" },
  vendor_catalog: { section: "vendorCatalogs", idField: "vendorCatalogId" },
  currency_definition: { section: "currencies", idField: "currencyId" },
  equipment_slot_definition: { section: "equipmentSlots", idField: "slotId" },
  stat_definition: { section: "stats", idField: "statId" },
  stat_block: { section: "statBlocks", idField: "statBlockId" },
  stat_curve: { section: "statCurves", idField: "curveId" },
  ability_definition: { section: "abilities", idField: "abilityId" },
  ability_rank: { section: "abilityRanks", idField: "abilityRankId" },
  status_effect_definition: { section: "statusEffects", idField: "statusEffectId" },
  damage_type_definition: { section: "damageTypes", idField: "damageTypeId" },
  combat_profile: { section: "combatProfiles", idField: "combatProfileId" },
  enemy_archetype: { section: "enemies", idField: "enemyId" },
  npc_archetype: { section: "npcs", idField: "npcId" },
  entity_variant: { section: "variants", idField: "variantId" },
  ai_behavior_profile: { section: "aiProfiles", idField: "aiProfileId" },
  path_behavior_profile: { section: "pathBehaviors", idField: "pathBehaviorId" },
  animation_set: { section: "animationSets", idField: "animationSetId" },
  loot_table: { section: "lootTables", idField: "lootTableId" },
  faction_definition: { section: "factions", idField: "factionId" },
  reputation_track: { section: "reputationTracks", idField: "reputationId" },
  music_track: { section: "musicTracks", idField: "musicTrackId" },
  music_playlist: { section: "musicPlaylists", idField: "musicPlaylistId" },
  audio_event: { section: "audioEvents", idField: "audioEventId" },
  vfx_definition: { section: "vfx", idField: "vfxId" },
  difficulty_profile: { section: "difficultyProfiles", idField: "difficultyId" },
  respawn_policy_definition: { section: "respawnPolicies", idField: "respawnPolicyId" }
};

function buildDefinition(graph, node, nodeMap) {
  const spec = DEFINITION_SPECS[node.type];
  if (!spec) return null;
  const def = baseDefinition(node, spec.idField);
  if (!def.id) return null;
  if (node.type === "playable_character_definition") {
    def.statBlockRef = def.statBlockRef || connectedRef(graph, node, "statBlock", nodeMap, "statBlockId");
    def.animationSetRef = def.animationSetRef || connectedRef(graph, node, "animationSet", nodeMap, "animationSetId");
    def.combatProfileRef = def.combatProfileRef || connectedRef(graph, node, "combatProfile", nodeMap, "combatProfileId");
    def.equipmentPolicyRef = def.equipmentPolicyRef || connectedRef(graph, node, "equipmentPolicy", nodeMap, "rulesId");
    def.startingAbilityRefs = normalizeReferenceList(def.startingAbilityRefs);
    def.startingItemGrants = normalizeGrantList(def.startingItemGrants, "itemRef", "amount");
    def.startingCurrencyGrants = normalizeGrantList(def.startingCurrencyGrants, "currencyRef", "amountMinor");
  } else if (node.type === "stat_block") {
    def.entries = (Array.isArray(def.entries) ? def.entries : []).map(function (entry) {
      return Object.assign({}, entry, {
        statRef: normalizeCanonicalId(entry?.statRef, ""),
        baseValue: safeNumber(entry?.baseValue, 0)
      });
    }).filter(function (entry) { return Boolean(entry.statRef); });
  } else if (node.type === "ability_definition") {
    def.rankRefs = connectedRefs(graph, node, "rankDefinitions", nodeMap, "abilityRankId");
    def.statusEffectRefs = Array.from(new Set(normalizeReferenceList(def.statusEffectRefs).concat(connectedRefs(graph, node, "statusEffects", nodeMap, "statusEffectId"))));
  } else if (node.type === "enemy_archetype") {
    def.statBlockRef = def.statBlockRef || connectedRef(graph, node, "statBlock", nodeMap, "statBlockId");
    def.combatProfileRef = def.combatProfileRef || connectedRef(graph, node, "combatProfile", nodeMap, "combatProfileId");
    def.aiProfileRef = def.aiProfileRef || connectedRef(graph, node, "aiProfile", nodeMap, "aiProfileId");
    def.animationSetRef = def.animationSetRef || connectedRef(graph, node, "animationSet", nodeMap, "animationSetId");
    def.lootTableRef = def.lootTableRef || connectedRef(graph, node, "lootTable", nodeMap, "lootTableId");
    def.factionRef = def.factionRef || connectedRef(graph, node, "faction", nodeMap, "factionId");
    def.difficultyRef = def.difficultyRef || connectedRef(graph, node, "difficulty", nodeMap, "difficultyId");
  } else if (node.type === "loot_table") {
    def.entries = connectedRecords(graph, node, "entries", nodeMap).map(function (entry) {
      const out = Object.assign({}, entry);
      if (out.itemRef) out.itemRef = normalizeCanonicalId(out.itemRef, "");
      if (out.currencyRef) out.currencyRef = normalizeCanonicalId(out.currencyRef, "");
      if (out.lootTableRef) out.lootTableRef = normalizeCanonicalId(out.lootTableRef, "");
      return out;
    });
  } else if (node.type === "recipe_definition") {
    def.stationType = normalizeCanonicalId(def.stationType, "crafting.station");
    def.ingredients = connectedRecords(graph, node, "ingredients", nodeMap).map(function (entry) {
      const out = Object.assign({}, entry);
      if (out.itemRef) out.itemRef = normalizeCanonicalId(out.itemRef, "");
      if (out.currencyRef) out.currencyRef = normalizeCanonicalId(out.currencyRef, "");
      out.itemTagQuery = normalizeTagQuery(out.itemTagQuery);
      out.amount = Math.max(1, Math.floor(safeNumber(out.amount, 1)));
      out.consume = out.consume !== false;
      return out;
    });
    def.outputActions = connectedRecords(graph, node, "outputActions", nodeMap).map(function (entry) {
      const out = Object.assign({}, entry);
      if (out.itemRef) out.itemRef = normalizeCanonicalId(out.itemRef, "");
      if (out.currencyRef) out.currencyRef = normalizeCanonicalId(out.currencyRef, "");
      if (out.abilityRef) out.abilityRef = normalizeCanonicalId(out.abilityRef, "");
      out.amount = Math.max(0, Math.floor(safeNumber(out.amount || out.amountMinor, 0)));
      out.amountMinor = Math.max(0, Math.floor(safeNumber(out.amountMinor || out.amount, 0)));
      return out;
    });
    def.outputItems = normalizeGrantList(def.outputItems, "itemRef", "amount");
    def.outputCurrencies = normalizeGrantList(def.outputCurrencies, "currencyRef", "amountMinor");
  } else if (node.type === "vendor_catalog") {
    def.offers = connectedRecords(graph, node, "offers", nodeMap).map(function (entry) {
      const out = Object.assign({}, entry);
      if (out.itemRef) out.itemRef = normalizeCanonicalId(out.itemRef, "");
      if (out.sellCurrencyRef) out.sellCurrencyRef = normalizeCanonicalId(out.sellCurrencyRef, "");
      if (out.buyCurrencyRef) out.buyCurrencyRef = normalizeCanonicalId(out.buyCurrencyRef, "");
      out.sellPriceMinor = Math.max(0, Math.floor(safeNumber(out.sellPriceMinor, 0)));
      out.buyPriceMinor = Math.max(0, Math.floor(safeNumber(out.buyPriceMinor, 0)));
      out.initialStock = Math.max(0, Math.floor(safeNumber(out.initialStock, 0)));
      return out;
    });
  } else if (node.type === "music_playlist") {
    def.trackRefs = connectedRefs(graph, node, "tracks", nodeMap, "musicTrackId");
  } else if (node.type === "equipment_slot_definition") {
    def.allowedItemTags = normalizeTagQuery(def.allowedItemTags);
  } else if (node.type === "entity_variant") {
    def.tagAdds = normalizeTagList(def.tagAdds);
    def.tagRemoves = normalizeTagList(def.tagRemoves);
  }
  def.contentHash = contentHashFor(Object.assign({}, def, {
    nodeId: undefined,
    nodeType: undefined,
    contentHash: undefined
  }));
  return def;
}

function catalogOutputNodesForRegistry(graph, catalogRegistryNode, nodeMap) {
  const outputs = [];
  for (const edge of directIncomingEdges(graph, catalogRegistryNode, "catalogPackage")) {
    const source = nodeMap.get(edge.fromNodeId);
    if (!source) continue;
    outputs.push.apply(outputs, resolveOutputSources(graph, source, edge.fromPort, nodeMap));
  }
  return uniqueNodes(outputs).filter(function (node) { return node.type === "catalog_output"; });
}

function definitionsForCatalogOutput(graph, catalogOutputNode, nodeMap) {
  return incomingNodes(graph, catalogOutputNode, "definitions", nodeMap).filter(function (node) {
    return Boolean(DEFINITION_SPECS[node.type]);
  });
}

function sortedObject(source) {
  const output = {};
  for (const key of Object.keys(source || {}).sort()) output[key] = source[key];
  return output;
}

function addDefinition(catalog, definition, section, errors) {
  if (!CATALOG_SECTION_KEYS.includes(section) && section !== "playableCharacters") return;
  if (!catalog[section]) catalog[section] = {};
  if (catalog[section][definition.id]) {
    errors.push({
      code: "CATALOG_DEFINITION_DUPLICATE",
      severity: "error",
      message: "Dubbele catalog definition: " + definition.id + ".",
      nodeId: definition.nodeId,
      referenceId: definition.id
    });
    return;
  }
  catalog[section][definition.id] = definition;
}

export function compileCatalogRegistry(graph, catalogRegistryNode, options = {}) {
  const nodeMap = options.nodeMap || nodeMapForGraph(graph);
  const catalog = createEmptyCatalog();
  catalog.playableCharacters = {};
  const errors = [];
  const warnings = [];
  const packages = [];
  const outputNodes = catalogRegistryNode
    ? catalogOutputNodesForRegistry(graph, catalogRegistryNode, nodeMap)
    : (Array.isArray(graph?.nodes) ? graph.nodes.filter(function (node) { return node.type === "catalog_output"; }) : []);
  for (const outputNode of outputNodes) {
    const definitions = [];
    for (const node of definitionsForCatalogOutput(graph, outputNode, nodeMap)) {
      const spec = DEFINITION_SPECS[node.type];
      const definition = buildDefinition(graph, node, nodeMap);
      if (!spec || !definition) continue;
      addDefinition(catalog, definition, spec.section, errors);
      definitions.push({ id: definition.id, section: spec.section, nodeId: node.id, contentHash: definition.contentHash });
    }
    packages.push({
      id: normalizeCanonicalId(outputNode.values?.catalogId, "") || outputNode.id,
      catalogVersion: safeString(outputNode.values?.catalogVersion || "0.1.0"),
      namespaceOwnership: Array.isArray(outputNode.values?.namespaceOwnership) ? outputNode.values.namespaceOwnership.slice() : [],
      definitions: definitions.sort(function (left, right) { return left.id.localeCompare(right.id); })
    });
  }
  for (const key of Object.keys(catalog)) {
    catalog[key] = sortedObject(catalog[key]);
  }
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    registryId: normalizeCanonicalId(catalogRegistryNode?.values?.registryId, "") || "catalog_registry.main",
    packages: packages.sort(function (left, right) { return left.id.localeCompare(right.id); }),
    packageCount: packages.length,
    definitionCount: Object.values(catalog).reduce(function (total, section) {
      return total + Object.keys(section || {}).length;
    }, 0),
    catalog,
    errors,
    warnings
  };
}

export function compileCatalogsFromGraph(graph, options = {}) {
  const nodeMap = options.nodeMap || nodeMapForGraph(graph);
  const registryNode = options.registryNode
    || (Array.isArray(graph?.nodes) ? graph.nodes.find(function (node) { return node.type === "catalog_registry"; }) : null);
  return compileCatalogRegistry(graph, registryNode, Object.assign({}, options, { nodeMap }));
}
