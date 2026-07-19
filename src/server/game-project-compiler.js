import crypto from "node:crypto";
import {
  GAME_PROJECT_SCHEMA_VERSION,
  canonicalJsonStringify,
  normalizeCanonicalId,
  normalizeReferenceList,
  normalizeTagList,
  normalizeTagQuery
} from "../shared/node-contract.js";
import { NODE_TYPES, defaultValuesForType, isContainer, resolveNodePort, resolveNodePorts } from "../shared/node-types.js";
import { validateFormulaExpression } from "../shared/token-contract.js";
import { buildSymbolIndex, serializeSymbolIndex, validateReferencesAgainstIndex } from "./symbol-index-service.js";
import { TokenResolver } from "./token-resolver.js";

function safeString(value) {
  return String(value === null || value === undefined ? "" : value);
}

function safeLower(value) {
  return safeString(value).trim().toLowerCase();
}

function clone(value) {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === "function") {
    try { return structuredClone(value); } catch {}
  }
  return JSON.parse(JSON.stringify(value));
}

function buildError(code, message, extra = {}) {
  return Object.assign({
    code,
    severity: "error",
    message
  }, extra);
}

function buildWarning(code, message, extra = {}) {
  return Object.assign({
    code,
    severity: "warning",
    message
  }, extra);
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

function createResolutionState() {
  return {
    stack: [],
    keyIndex: new Map()
  };
}

function resolutionKey(kind, node, portName) {
  return kind + ":" + node.id + ":" + portName + ":" + (node.parentId || "root");
}

function resolutionFrameLabel(node) {
  return safeString(node?.values?.title || node?.values?.label || node?.title || node?.id || node?.type || "Node");
}

function enterResolution(state, kind, node, portName) {
  const key = resolutionKey(kind, node, portName);
  const frame = {
    key,
    kind,
    nodeId: node.id,
    nodeLabel: resolutionFrameLabel(node)
  };
  if (state.keyIndex.has(key)) {
    const error = new Error("Group connection cycle detected around " + frame.nodeLabel + ".");
    error.status = 400;
    throw error;
  }
  state.keyIndex.set(key, state.stack.length);
  state.stack.push(frame);
  return frame;
}

function leaveResolution(state, frame) {
  const index = state.stack.lastIndexOf(frame);
  if (index !== -1) state.stack.splice(index, 1);
  state.keyIndex.delete(frame.key);
}

function uniqueNodes(nodes) {
  const map = new Map();
  for (const node of nodes || []) map.set(node.id, node);
  return Array.from(map.values());
}

function firstNodeOfType(graph, parentId, type) {
  return (Array.isArray(graph?.nodes) ? graph.nodes : []).find(function (node) {
    return node.parentId === parentId && node.type === type;
  }) || null;
}

function resolveInputSources(graph, targetNode, portName, nodeMap, state = createResolutionState()) {
  const frame = enterResolution(state, "input", targetNode, portName);
  try {
    const direct = directIncomingEdges(graph, targetNode, portName);
    const resolved = [];
    for (const edge of direct) {
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

function firstIncomingNode(graph, outputNode, portName, nodeMap, state = createResolutionState()) {
  return resolveInputSources(graph, outputNode, portName, nodeMap, state)[0] || null;
}

function firstGraphNodeOfType(graph, type) {
  return (Array.isArray(graph?.nodes) ? graph.nodes : []).find(function (node) {
    return node.type === type;
  }) || null;
}

function nodesOfType(graph, type) {
  return (Array.isArray(graph?.nodes) ? graph.nodes : []).filter(function (node) {
    return node.type === type;
  });
}

function sortPlainObjectByKey(source) {
  const output = {};
  for (const key of Object.keys(source || {}).sort()) {
    output[key] = source[key];
  }
  return output;
}

function sortedRecordMap(records) {
  const map = {};
  for (const record of (Array.isArray(records) ? records : []).slice().sort(function (left, right) {
    return String(left.id || "").localeCompare(String(right.id || ""));
  })) {
    map[record.id] = clone(record.value);
  }
  return map;
}

function collectRecordsByKind(index, kinds) {
  const set = new Set(Array.isArray(kinds) ? kinds : [kinds]);
  return (Array.isArray(index?.records) ? index.records : []).filter(function (record) {
    return set.has(record.kind);
  }).map(function (record) {
    return { id: record.id, value: record };
  });
}

function sectionFromKinds(index, kinds) {
  const records = (Array.isArray(index?.records) ? index.records : []).filter(function (record) {
    return Array.isArray(kinds) ? kinds.includes(record.kind) : record.kind === kinds;
  }).map(function (record) {
    return { id: record.id, value: record };
  });
  return sortedRecordMap(records);
}

function buildProjectPayload(node) {
  const values = node?.values || defaultValuesForType("game_project_settings");
  return {
    id: normalizeCanonicalId(values.projectId, "") || null,
    gameName: safeString(values.gameName || ""),
    defaultLanguage: safeString(values.defaultLanguage || ""),
    contentVersion: safeString(values.contentVersion || ""),
    startZoneRef: values.startZoneRef || null,
    startSpawnRef: values.startSpawnRef || null
  };
}

function buildChunkGridPayload(node) {
  const values = node?.values || defaultValuesForType("chunk_grid_definition");
  return {
    id: normalizeCanonicalId(values.gridId, "") || null,
    chunkWidth: Number(values.chunkWidth) || 0,
    chunkDepth: Number(values.chunkDepth) || 0,
    tileSize: Number(values.tileSize) || 0,
    maxLoadedChunks: Number(values.maxLoadedChunks) || 0,
    edgeMode: safeString(values.edgeMode || "")
  };
}

function readBoundsFromZone(zoneValues) {
  const originX = Number(zoneValues?.originX) || 0;
  const originY = Number(zoneValues?.originY) || 0;
  const originZ = Number(zoneValues?.originZ) || 0;
  const width = Number(zoneValues?.width) || 0;
  const depth = Number(zoneValues?.depth) || 0;
  return {
    originX,
    originY,
    originZ,
    width,
    depth,
    minX: originX,
    minZ: originZ,
    maxX: originX + width,
    maxZ: originZ + depth,
    minY: Number(zoneValues?.minY) || -100,
    maxY: Number(zoneValues?.maxY) || 500
  };
}

function isPointInsideBounds(x, z, bounds) {
  return Number(x) >= bounds.minX && Number(x) <= bounds.maxX && Number(z) >= bounds.minZ && Number(z) <= bounds.maxZ;
}

function valuePayload(node, idField) {
  if (!node) return null;
  return Object.assign({ id: node.values?.[idField] || null, nodeId: node.id }, clone(node.values || {}));
}

function recordsFromSources(graph, outputNode, portName, nodeMap) {
  return resolveInputSources(graph, outputNode, portName, nodeMap).map(function (node) {
    const values = clone(node.values || {});
    return Object.assign({ nodeId: node.id, nodeType: node.type }, values);
  });
}

function buildAreaPackage(graph, areaOutputNode, nodeMap) {
  const areaNode = firstIncomingNode(graph, areaOutputNode, "area", nodeMap);
  const area = valuePayload(areaNode, "areaId");
  return {
    id: areaOutputNode.values?.packageId || (area?.areaId ? area.areaId + ".package" : areaOutputNode.id),
    packageVersion: Number(areaOutputNode.values?.packageVersion) || 1,
    area,
    environmentOverrides: recordsFromSources(graph, areaOutputNode, "environmentOverrides", nodeMap),
    areaRules: recordsFromSources(graph, areaOutputNode, "areaRules", nodeMap),
    terrain: recordsFromSources(graph, areaOutputNode, "terrain", nodeMap),
    collision: recordsFromSources(graph, areaOutputNode, "collision", nodeMap),
    lights: recordsFromSources(graph, areaOutputNode, "lights", nodeMap),
    entities: recordsFromSources(graph, areaOutputNode, "entities", nodeMap),
    spawns: recordsFromSources(graph, areaOutputNode, "spawns", nodeMap),
    questTargets: recordsFromSources(graph, areaOutputNode, "questTargets", nodeMap),
    markers: recordsFromSources(graph, areaOutputNode, "markers", nodeMap),
    audioAssignments: recordsFromSources(graph, areaOutputNode, "audioAssignments", nodeMap),
    paths: recordsFromSources(graph, areaOutputNode, "paths", nodeMap),
    encounterAreas: recordsFromSources(graph, areaOutputNode, "encounterAreas", nodeMap)
  };
}

function buildZonePackage(graph, zoneOutputNode, nodeMap) {
  const zoneNode = firstIncomingNode(graph, zoneOutputNode, "zone", nodeMap);
  const zone = valuePayload(zoneNode, "zoneId");
  const zoneId = normalizeCanonicalId(zone?.zoneId, "") || null;
  const bounds = readBoundsFromZone(zone || {});
  const areaOutputs = resolveInputSources(graph, zoneOutputNode, "areas", nodeMap).filter(function (node) {
    return node.type === "area_output";
  });
  const minimaps = recordsFromSources(graph, zoneOutputNode, "minimap", nodeMap).map(function (minimap) {
    return Object.assign({}, minimap, {
      zoneRef: minimap.zoneRef || zoneId,
      bounds: minimap.bakedBounds || bounds,
      resolution: Number(minimap.resolution) || 2048,
      imageFormat: "webp"
    });
  });
  return {
    id: zoneOutputNode.values?.packageId || (zoneId ? zoneId + ".package" : zoneOutputNode.id),
    zoneId,
    packageVersion: Number(zoneOutputNode.values?.packageVersion) || 1,
    includeEditorOnlyData: zoneOutputNode.values?.includeEditorOnlyData === true,
    zone: Object.assign({}, zone || {}, { bounds }),
    environment: valuePayload(firstIncomingNode(graph, zoneOutputNode, "environment", nodeMap), "environmentId"),
    rules: valuePayload(firstIncomingNode(graph, zoneOutputNode, "rules", nodeMap), "rulesId"),
    ground: valuePayload(firstIncomingNode(graph, zoneOutputNode, "ground", nodeMap), "groundId"),
    terrain: recordsFromSources(graph, zoneOutputNode, "terrain", nodeMap),
    collision: recordsFromSources(graph, zoneOutputNode, "collision", nodeMap),
    lights: recordsFromSources(graph, zoneOutputNode, "lights", nodeMap),
    cameraOverrides: recordsFromSources(graph, zoneOutputNode, "cameraOverrides", nodeMap),
    areas: areaOutputs.map(function (areaOutput) { return buildAreaPackage(graph, areaOutput, nodeMap); }),
    entities: recordsFromSources(graph, zoneOutputNode, "entities", nodeMap),
    spawns: recordsFromSources(graph, zoneOutputNode, "spawns", nodeMap).map(function (spawn) {
      return Object.assign({}, spawn, { zoneRef: spawn.zoneRef || zoneId });
    }),
    checkpoints: recordsFromSources(graph, zoneOutputNode, "checkpoints", nodeMap),
    links: recordsFromSources(graph, zoneOutputNode, "links", nodeMap).map(function (link) {
      return Object.assign({}, link, { fromZoneRef: link.fromZoneRef || zoneId });
    }),
    discoveries: recordsFromSources(graph, zoneOutputNode, "discoveries", nodeMap),
    questTargets: recordsFromSources(graph, zoneOutputNode, "questTargets", nodeMap),
    markers: recordsFromSources(graph, zoneOutputNode, "markers", nodeMap),
    minimaps,
    audioAssignments: recordsFromSources(graph, zoneOutputNode, "audioAssignments", nodeMap),
    paths: recordsFromSources(graph, zoneOutputNode, "paths", nodeMap),
    encounterAreas: recordsFromSources(graph, zoneOutputNode, "encounterAreas", nodeMap)
  };
}

function buildZoneRegistryPayload(graph, zoneRegistryNode, nodeMap) {
  const zoneOutputs = resolveInputSources(graph, zoneRegistryNode, "zonePackage", nodeMap).filter(function (node) {
    return node.type === "zone_output";
  });
  const packages = zoneOutputs.map(function (zoneOutput) {
    return buildZonePackage(graph, zoneOutput, nodeMap);
  }).filter(function (pkg) {
    return Boolean(pkg.zoneId);
  }).sort(function (left, right) {
    return String(left.zoneId).localeCompare(String(right.zoneId));
  });
  const byId = {};
  for (const pkg of packages) byId[pkg.zoneId] = pkg;
  return {
    id: zoneRegistryNode?.values?.registryId || "zone_registry.main",
    packages,
    byId,
    zoneCount: packages.length
  };
}

function buildZonePackagesFromGraph(graph, worldAssemblyNode, nodeMap) {
  const zoneRegistryNode = worldAssemblyNode ? firstIncomingNode(graph, worldAssemblyNode, "zones", nodeMap) : firstGraphNodeOfType(graph, "zone_registry");
  if (!zoneRegistryNode) return { id: "zone_registry.main", packages: [], byId: {}, zoneCount: 0 };
  return buildZoneRegistryPayload(graph, zoneRegistryNode, nodeMap);
}

function firstZoneDefaultSpawn(zonePackage) {
  return (Array.isArray(zonePackage?.spawns) ? zonePackage.spawns : []).find(function (spawn) {
    return spawn.role === "zone_default";
  }) || null;
}

function buildRuntimeZoneProjection(projectPayload, zoneRegistry) {
  const packages = Array.isArray(zoneRegistry?.packages) ? zoneRegistry.packages : [];
  const startZoneId = normalizeCanonicalId(projectPayload?.startZoneRef, "") || packages[0]?.zoneId || null;
  const startZone = packages.find(function (pkg) { return pkg.zoneId === startZoneId; }) || packages[0] || null;
  const startSpawnId = normalizeCanonicalId(projectPayload?.startSpawnRef, "");
  const startSpawn = startZone
    ? ((Array.isArray(startZone.spawns) ? startZone.spawns : []).find(function (spawn) {
      return spawn.spawnId === startSpawnId;
    }) || firstZoneDefaultSpawn(startZone))
    : null;
  const minimap = startZone && Array.isArray(startZone.minimaps) ? startZone.minimaps.find(function (bake) {
    return bake.enabled !== false;
  }) || null : null;
  return {
    activeZoneId: startZone?.zoneId || null,
    startSpawnId: startSpawn?.spawnId || null,
    startSpawn,
    activeZone: startZone,
    activeMinimap: minimap
  };
}

function buildAssetManifest(assetService) {
  if (!assetService || typeof assetService.list !== "function") return [];
  return assetService.list().slice().sort(function (left, right) {
    return String(left.id || "").localeCompare(String(right.id || ""));
  }).map(function (asset) {
    return {
      id: asset.id,
      name: asset.name,
      category: asset.category,
      assetType: asset.assetType,
      mimeType: asset.mimeType,
      metadata: clone(asset.metadata || {})
    };
  });
}

function buildValidationContext(graph, symbolIndex, tokenResolver) {
  const nodeMap = nodeMapForGraph(graph);
  const errors = [];
  const warnings = [];
  const references = [];

  for (const node of Array.isArray(graph?.nodes) ? graph.nodes : []) {
    const definition = NODE_TYPES[node.type];
    if (!definition) {
      errors.push(buildError("SYMBOL_INVALID_ID", "Onbekend node-type: " + node.type + ".", { nodeId: node.id }));
      continue;
    }
    const nodeValues = node.values || {};
    for (const [fieldName, field] of Object.entries(definition.fields || {})) {
      const value = nodeValues[fieldName];
      if (field.type === "reference") {
        const referenceId = safeString(value).trim();
        if (referenceId) {
          references.push({
            id: referenceId,
            expectedKinds: field.referenceKinds || [],
            nodeId: node.id,
            field: fieldName
          });
        }
      } else if (field.type === "referenceList") {
        const items = Array.isArray(value) ? value : normalizeReferenceList(value);
        for (const item of items) {
          references.push({
            id: item,
            expectedKinds: field.referenceKinds || [],
            nodeId: node.id,
            field: fieldName
          });
        }
      } else if (field.type === "tagList") {
        normalizeTagList(value);
      } else if (field.type === "tagQuery") {
        normalizeTagQuery(value);
      } else if (field.type === "formula") {
        const validation = validateFormulaExpression(value, {});
        for (const issue of validation.errors || []) {
          errors.push(buildError(issue.code || "FORMULA_TYPE_MISMATCH", issue.message, {
            nodeId: node.id,
            field: fieldName
          }));
        }
      } else if (field.type === "tokenText") {
        const preview = tokenResolver.preview(graph, value || "", {
          staticContextOnly: true,
          symbolIndex
        });
        for (const issue of preview.errors || []) {
          errors.push(buildError(issue.code || "TOKEN_PARSE_ERROR", issue.message, {
            nodeId: node.id,
            field: fieldName,
            raw: issue.raw || null
          }));
        }
        for (const issue of preview.warnings || []) {
          warnings.push(buildWarning(issue.code || "TOKEN_RUNTIME_UNRESOLVED_PREVIEW", issue.message, {
            nodeId: node.id,
            field: fieldName,
            raw: issue.raw || null
          }));
        }
      } else if (field.type === "localizedText" && value && typeof value === "object" && value.key) {
        references.push({
          id: value.key,
          expectedKinds: ["localization"],
          nodeId: node.id,
          field: fieldName
        });
      }
    }
  }

  for (const result of validateReferencesAgainstIndex(symbolIndex, references).errors || []) {
    errors.push(result);
  }

  const gameOutput = firstGraphNodeOfType(graph, "game_output");
  const gameProjectSource = gameOutput ? firstIncomingNode(graph, gameOutput, "gameProject", nodeMap) : null;
  const directLegacyInputs = gameOutput
    ? Object.keys(resolveNodePorts(gameOutput, nodeMap).inputs || {}).filter(function (portName) {
      return portName !== "gameProject" && directIncomingEdges(graph, gameOutput, portName).length > 0;
    })
    : [];

  if (gameProjectSource && directLegacyInputs.length) {
    warnings.push(buildWarning("GAME_OUTPUT_LEGACY_IGNORED", "Legacy direct Game Output inputs worden genegeerd zodra gameProject verbonden is.", {
      nodeId: gameOutput.id,
      port: directLegacyInputs.join(", ")
    }));
  }

  const projectNode = gameProjectSource ? firstIncomingNode(graph, gameProjectSource, "projectSettings", nodeMap) || firstGraphNodeOfType(graph, "game_project_settings") : firstGraphNodeOfType(graph, "game_project_settings");
  const chunkGridNode = gameProjectSource ? firstIncomingNode(graph, gameProjectSource, "chunkGrid", nodeMap) || firstGraphNodeOfType(graph, "chunk_grid_definition") : firstGraphNodeOfType(graph, "chunk_grid_definition");
  const worldAssemblyNode = gameProjectSource || firstGraphNodeOfType(graph, "world_assembly");

  if (!worldAssemblyNode) {
    errors.push(buildError("FOUNDATION_WORLD_ASSEMBLY_MISSING", "World Assembly node ontbreekt."));
  }
  if (gameProjectSource && !projectNode) {
    errors.push(buildError("FOUNDATION_PROJECT_SETTINGS_MISSING", "Game Project Settings node ontbreekt."));
  }
  if (gameProjectSource && !chunkGridNode) {
    errors.push(buildError("FOUNDATION_CHUNK_GRID_MISSING", "Chunk Grid Definition node ontbreekt."));
  }
  if (chunkGridNode) {
    const width = Number(chunkGridNode.values?.chunkWidth);
    const depth = Number(chunkGridNode.values?.chunkDepth);
    const maxLoadedChunks = Number(chunkGridNode.values?.maxLoadedChunks);
    if (width !== 14 || depth !== 14 || maxLoadedChunks !== 81) {
      errors.push(buildError("FOUNDATION_CHUNK_GRID_INVALID", "Chunk Grid Definition moet exact 14 × 14 en maxLoadedChunks 81 zijn.", {
        nodeId: chunkGridNode.id
      }));
    }
  }

  const zoneDefinitions = nodesOfType(graph, "zone_definition");
  const zoneIds = new Map();
  for (const zoneNode of zoneDefinitions) {
    const zoneId = normalizeCanonicalId(zoneNode.values?.zoneId, "");
    if (!zoneId) continue;
    if (zoneIds.has(zoneId)) {
      errors.push(buildError("ZONE_DEFINITION_DUPLICATE", "Dubbele zoneId: " + zoneId + ".", { nodeId: zoneNode.id, referenceId: zoneId }));
      continue;
    }
    zoneIds.set(zoneId, zoneNode);
    const zoneType = safeString(zoneNode.values?.zoneType || "outdoor_normal");
    const width = Number(zoneNode.values?.width);
    const depth = Number(zoneNode.values?.depth);
    if (zoneType === "outdoor_normal" && (width !== 500 || depth !== 500)) {
      errors.push(buildError("ZONE_BOUNDS_INVALID", "Outdoor zone " + zoneId + " moet exact 500 x 500 zijn.", { nodeId: zoneNode.id, referenceId: zoneId }));
    } else if (zoneType !== "outdoor_normal" && (!(width >= 1 && width <= 5000) || !(depth >= 1 && depth <= 5000))) {
      errors.push(buildError("ZONE_BOUNDS_INVALID", "Zone " + zoneId + " heeft ongeldige bounds.", { nodeId: zoneNode.id, referenceId: zoneId }));
    }
  }

  const zoneOutputs = nodesOfType(graph, "zone_output");
  for (const zoneOutput of zoneOutputs) {
    const zoneNode = firstIncomingNode(graph, zoneOutput, "zone", nodeMap);
    const zoneId = normalizeCanonicalId(zoneNode?.values?.zoneId, "");
    if (!zoneNode || !zoneId) {
      errors.push(buildError("ZONE_DEFINITION_MISSING", "Zone Output mist een geldige Zone Definition.", { nodeId: zoneOutput.id }));
      continue;
    }
    const zoneValues = zoneNode.values || {};
    const bounds = readBoundsFromZone(zoneValues);
    const spawns = recordsFromSources(graph, zoneOutput, "spawns", nodeMap);
    const defaultSpawns = spawns.filter(function (spawn) {
      return spawn.role === "zone_default";
    });
    if (defaultSpawns.length === 0) {
      errors.push(buildError("ZONE_DEFAULT_SPAWN_MISSING", "Zone " + zoneId + " mist exact één zone_default spawn.", { nodeId: zoneOutput.id, referenceId: zoneId }));
    }
    if (defaultSpawns.length > 1) {
      errors.push(buildError("ZONE_DEFAULT_SPAWN_DUPLICATE", "Zone " + zoneId + " heeft meerdere zone_default spawns.", { nodeId: zoneOutput.id, referenceId: zoneId }));
    }
    for (const spawn of spawns) {
      if (!isPointInsideBounds(spawn.x, spawn.z, bounds)) {
        errors.push(buildError("ZONE_SPAWN_OUT_OF_BOUNDS", "Spawn " + (spawn.spawnId || spawn.nodeId) + " ligt buiten zone " + zoneId + ".", { nodeId: spawn.nodeId, referenceId: spawn.spawnId || null }));
      }
      if (Number(spawn.safeRadius) <= 0.5) {
        warnings.push(buildWarning("ZONE_SPAWN_OUT_OF_BOUNDS", "Spawn " + (spawn.spawnId || spawn.nodeId) + " heeft een kleine safeRadius.", { nodeId: spawn.nodeId, referenceId: spawn.spawnId || null }));
      }
    }
    const minimaps = recordsFromSources(graph, zoneOutput, "minimap", nodeMap).filter(function (bake) {
      return bake.enabled !== false;
    });
    if (["outdoor_normal", "hub"].includes(safeString(zoneValues.zoneType || "outdoor_normal")) && minimaps.length === 0) {
      warnings.push(buildWarning("MINIMAP_ZONE_BAKE_MISSING", "Zone " + zoneId + " heeft nog geen enabled Minimap Bake.", { nodeId: zoneOutput.id, referenceId: zoneId }));
    }
  }

  for (const groupNode of nodesOfType(graph, "group")) {
    if (safeLower(groupNode.values?.groupKind) === "area") {
      const parent = nodeMap.get(groupNode.parentId);
      if (!parent || safeLower(parent.values?.groupKind) !== "zone") {
        errors.push(buildError("AREA_GROUP_INVALID", "Area Group moet child zijn van een Zone Group.", { nodeId: groupNode.id }));
      }
    }
  }

  return {
    errors,
    warnings,
    references,
    gameOutput,
    gameProjectSource,
    projectNode,
    chunkGridNode,
    worldAssemblyNode
  };
}

function buildSymbolSections(index) {
  const byKind = new Map();
  for (const record of Array.isArray(index?.records) ? index.records : []) {
    if (!byKind.has(record.kind)) byKind.set(record.kind, []);
    byKind.get(record.kind).push(record);
  }
  const asPlain = function (kinds) {
    const records = [];
    for (const kind of kinds) {
      for (const record of byKind.get(kind) || []) {
        records.push({ id: record.id, value: record });
      }
    }
    return sortedRecordMap(records);
  };
  return {
    definitions: asPlain(["globalValue", "tagDefinition", "textTemplate", "localizedText", "value", "valueFormula"]),
    tags: asPlain(["tagDefinition"]),
    values: asPlain(["globalValue", "value"]),
    textTemplates: asPlain(["textTemplate"]),
    localization: asPlain(["localizedText"])
  };
}

function buildSectionObject(index, kinds) {
  return sectionFromKinds(index, kinds);
}

function buildDiagnostics(validation, index, dependencySummary) {
  return {
    warnings: validation.warnings.slice(),
    counts: {
      nodes: Array.isArray(dependencySummary?.nodes) ? dependencySummary.nodes : 0,
      symbols: Array.isArray(index?.records) ? index.records.length : 0,
      errors: validation.errors.length,
      warnings: validation.warnings.length,
      references: Array.isArray(dependencySummary?.references) ? dependencySummary.references : 0
    }
  };
}

function buildContentHash(manifestCore) {
  const digest = crypto.createHash("sha256").update(canonicalJsonStringify(manifestCore)).digest("hex");
  return {
    digest,
    contentHash: "sha256:" + digest,
    buildId: "gk-" + digest.slice(0, 12)
  };
}

function buildDependencySummary(graph, symbolIndex, validation) {
  return {
    nodes: Array.isArray(graph?.nodes) ? graph.nodes.length : 0,
    edges: Array.isArray(graph?.edges) ? graph.edges.length : 0,
    symbols: Array.isArray(symbolIndex?.records) ? symbolIndex.records.length : 0,
    references: validation?.references?.length || 0,
    errors: validation?.errors?.length || 0,
    warnings: validation?.warnings?.length || 0
  };
}

export class GameProjectCompiler {
  constructor(services = {}) {
    this.services = services;
  }

  compile(graph, options = {}) {
    const symbolIndex = options.symbolIndex || (this.services.symbolIndexService ? this.services.symbolIndexService.getIndex(graph) : buildSymbolIndex(graph));
    const tokenResolver = options.tokenResolver || this.services.tokenResolver || new TokenResolver({ symbolIndexService: this.services.symbolIndexService });
    const validation = buildValidationContext(graph, symbolIndex, tokenResolver);
    const dependencySummary = buildDependencySummary(graph, symbolIndex, validation);
    const gameOutput = validation.gameOutput;
    const gameProjectSource = validation.gameProjectSource;
    const connected = Boolean(gameProjectSource);
    const legacyWorld = typeof options.legacyWorldBuilder === "function"
      ? options.legacyWorldBuilder(graph, options.services || this.services, options.legacyWorldOptions || {})
      : (typeof this.services.legacyWorldBuilder === "function" ? this.services.legacyWorldBuilder(graph, this.services, options.legacyWorldOptions || {}) : null);

    if (!connected) {
      return {
        connected: false,
        validation: {
          ok: validation.errors.length === 0,
          errors: validation.errors,
          warnings: validation.warnings
        },
        buildId: null,
        contentHash: null,
        manifest: null,
        dependencySummary,
        symbolIndex: serializeSymbolIndex(symbolIndex),
        legacyWorld
      };
    }

    const projectNode = validation.projectNode || firstIncomingNode(graph, gameProjectSource, "projectSettings", nodeMapForGraph(graph));
    const chunkGridNode = validation.chunkGridNode || firstIncomingNode(graph, gameProjectSource, "chunkGrid", nodeMapForGraph(graph));
    const nodeMap = nodeMapForGraph(graph);
    const worldAssemblyNode = validation.worldAssemblyNode || firstIncomingNode(graph, gameOutput, "gameProject", nodeMap);
    const projectPayload = buildProjectPayload(projectNode);
    const chunkGridPayload = buildChunkGridPayload(chunkGridNode);
    const zoneRegistry = buildZonePackagesFromGraph(graph, worldAssemblyNode, nodeMap);
    const runtimeZones = buildRuntimeZoneProjection(projectPayload, zoneRegistry);
    const manifestCore = {
      schemaVersion: GAME_PROJECT_SCHEMA_VERSION,
      project: projectPayload,
      chunkGrid: chunkGridPayload,
      catalogs: buildSymbolSections(symbolIndex),
      zones: zoneRegistry,
      campaigns: buildSectionObject(symbolIndex, ["campaignRegistry"]),
      playerRules: buildSectionObject(symbolIndex, ["playerRules"]),
      ui: buildSectionObject(symbolIndex, ["uiPackage"]),
      runtime: {
        activeZoneId: runtimeZones.activeZoneId,
        startSpawnId: runtimeZones.startSpawnId
      },
      symbols: serializeSymbolIndex(symbolIndex),
      assetManifest: buildAssetManifest(this.services.assetService || options.assetService || null),
      legacyWorld: legacyWorld || {},
      diagnostics: buildDiagnostics(validation, symbolIndex, dependencySummary)
    };
    const hash = buildContentHash(manifestCore);
    const manifest = Object.assign({}, manifestCore, {
      buildId: hash.buildId,
      contentHash: hash.contentHash
    });
    return {
      connected: true,
      validation: {
        ok: validation.errors.length === 0,
        errors: validation.errors,
        warnings: validation.warnings
      },
      buildId: hash.buildId,
      contentHash: hash.contentHash,
      manifest,
      dependencySummary,
      symbolIndex: serializeSymbolIndex(symbolIndex),
      legacyWorld
    };
  }

  preview(graph, options = {}) {
    return this.compile(graph, options);
  }
}

export {
  buildContentHash,
  buildDependencySummary
};
