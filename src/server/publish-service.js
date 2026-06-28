import {
  NODE_TYPES,
  GAME_ACTIONS,
  resolveNodePort,
  resolveNodePorts,
  isContainer
} from "../shared/node-types.js";
import { validateNodeValues } from "./field-validation.js";

function graphError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function directIncomingEdges(graph, outputNode, portName) {
  return graph.edges.filter(function (edge) {
    return edge.toNodeId === outputNode.id && edge.toPort === portName;
  });
}

function nodeMapForGraph(graph) {
  return new Map(graph.nodes.map(function (node) { return [node.id, node]; }));
}

function firstNodeOfType(graph, parentId, type) {
  return graph.nodes.find(function (node) {
    return node.parentId === parentId && node.type === type;
  }) || null;
}

function uniqueNodes(nodes) {
  const map = new Map();
  for (const node of nodes) map.set(node.id, node);
  return Array.from(map.values());
}

function nodeDisplayName(node) {
  return node?.values?.title || node?.title || node?.id || "Group";
}

function portDisplayName(node, portName, direction, nodeMap) {
  const port = resolveNodePort(node, portName, direction, nodeMap);
  return port?.label || portName;
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

function compressTrail(frames) {
  const labels = [];
  for (const frame of frames) {
    const label = frame.groupLabel || frame.nodeLabel;
    if (!label) continue;
    if (labels[labels.length - 1] !== label) labels.push(label);
  }
  return labels;
}

function cycleError(state, frame) {
  const startIndex = state.keyIndex.get(frame.key);
  const trail = startIndex === undefined ? state.stack.slice() : state.stack.slice(startIndex);
  trail.push(frame);
  const labels = compressTrail(trail);
  const path = labels.length ? labels.join(" -> ") : trail.map(function (entry) { return entry.nodeLabel || entry.nodeId; }).join(" -> ");
  return graphError("Group connection cycle detected: " + path + ".");
}

function enterResolution(state, kind, node, portName, nodeMap) {
  const key = resolutionKey(kind, node, portName);
  const frame = {
    key: key,
    kind: kind,
    nodeId: node.id,
    nodeLabel: nodeDisplayName(node),
    groupLabel: node.type === "group"
      ? nodeDisplayName(node)
      : node.parentId && nodeMap?.get(node.parentId)
        ? nodeDisplayName(nodeMap.get(node.parentId))
        : ""
  };
  if (state.keyIndex.has(key)) throw cycleError(state, frame);
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
  const frame = enterResolution(state, "input", targetNode, portName, nodeMap);
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
  const frame = enterResolution(state, "output", sourceNode, portName, nodeMap);
  try {
    if (sourceNode.type === "group") {
      const outputNode = firstNodeOfType(graph, sourceNode.id, "group_output");
      if (!outputNode) {
        throw graphError("Group '" + nodeDisplayName(sourceNode) + "' is missing a Group Output node.");
      }
      const resolved = resolveInputSources(graph, outputNode, portName, nodeMap, state);
      if (!resolved.length) {
        throw graphError("Group output '" + portDisplayName(sourceNode, portName, "output", nodeMap) + "' is not connected inside group '" + nodeDisplayName(sourceNode) + "'.");
      }
      return resolved;
    }
    if (sourceNode.type === "group_input") {
      const parent = nodeMap.get(sourceNode.parentId);
      if (!parent) {
        throw graphError("Group input '" + portDisplayName(sourceNode, portName, "output", nodeMap) + "' is not connected for group '" + nodeDisplayName(sourceNode) + "'.");
      }
      const resolved = resolveInputSources(graph, parent, portName, nodeMap, state);
      if (!resolved.length) {
        throw graphError("Group input '" + portDisplayName(sourceNode, portName, "output", nodeMap) + "' is not connected for group '" + nodeDisplayName(parent) + "'.");
      }
      return resolved;
    }
    if (sourceNode.type === "group_output") {
      throw graphError("Group output nodes cannot be used as sources.");
    }
    return [sourceNode];
  } finally {
    leaveResolution(state, frame);
  }
}

function incomingNodes(graph, outputNode, portName, nodeMap, state) {
  return resolveInputSources(graph, outputNode, portName, nodeMap || nodeMapForGraph(graph), state || createResolutionState());
}

function firstIncomingNode(graph, outputNode, portName, nodeMap, state) {
  return incomingNodes(graph, outputNode, portName, nodeMap, state)[0] || null;
}

function collectResolutionError(errors, resolver) {
  try {
    return resolver();
  } catch (error) {
    if (error && error.status === 400) {
      errors.push(error.message);
      return null;
    }
    throw error;
  }
}

function validateGroupDependencyCycles(graph, nodeMap, errors) {
  const adjacency = new Map();
  for (const edge of graph.edges) {
    const from = nodeMap.get(edge.fromNodeId);
    const to = nodeMap.get(edge.toNodeId);
    if (!from || !to) continue;
    if (from.type !== "group" || to.type !== "group") continue;
    if ((from.parentId || null) !== (to.parentId || null)) continue;
    if (!adjacency.has(from.id)) adjacency.set(from.id, new Set());
    adjacency.get(from.id).add(to.id);
  }
  const visiting = new Set();
  const visited = new Set();
  const path = [];
  function visit(nodeId) {
    if (visited.has(nodeId)) return;
    if (visiting.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      const cycleIds = cycleStart >= 0 ? path.slice(cycleStart).concat(nodeId) : path.concat(nodeId);
      const cycleLabels = cycleIds.map(function (id) {
        return nodeDisplayName(nodeMap.get(id) || { id: id });
      });
      errors.push("Group connection cycle detected: " + cycleLabels.join(" -> ") + ".");
      return;
    }
    visiting.add(nodeId);
    path.push(nodeId);
    for (const nextId of adjacency.get(nodeId) || []) visit(nextId);
    path.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  }
  for (const node of graph.nodes) {
    if (node.type === "group") visit(node.id);
  }
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nodeLabel(node) {
  return String(node?.values?.label || node?.title || node?.id || node?.type || "Node");
}

function pointList(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePoint(point) {
  return {
    x: numberOrNull(point?.x),
    z: numberOrNull(point?.z)
  };
}

function normalizePointList(value) {
  return pointList(value).map(function (point) {
    return normalizePoint(point);
  });
}

function validatePointList(errors, node, minPoints, messageSuffix = "heeft een ongeldige points-array.") {
  const points = node?.values?.points;
  if (!Array.isArray(points)) {
    errors.push(nodeLabel(node) + " " + messageSuffix);
    return [];
  }
  if (points.length < minPoints) {
    errors.push(nodeLabel(node) + " heeft minstens " + minPoints + " punten nodig.");
  }
  return points;
}

function requireAsset(assetService, id, type, label, errors) {
  if (!id) return null;
  const asset = assetService.get(id);
  if (!asset) {
    errors.push(label + " verwijst naar onbekende asset " + id + ".");
    return null;
  }
  if (Array.isArray(type) ? !type.includes(asset.assetType) : asset.assetType !== type) {
    errors.push(label + " verwacht asset type " + type + " maar kreeg " + asset.assetType + ".");
  }
  return asset;
}

function emptyTerrainReadModel() {
  return { layers: [], paths: [], waters: [], surfaces: [] };
}

function emptyCollisionReadModel() {
  return { blockers: [], walkableSurfaces: [] };
}

function buildTerrainLayerReadModel(node) {
  return {
    id: node.values.layerId,
    label: node.values.label,
    material: node.values.material,
    priority: numberOrNull(node.values.priority),
    opacity: numberOrNull(node.values.opacity),
    color: node.values.color,
    textureAssetId: node.values.textureAssetId || null,
    shapeType: node.values.shapeType,
    points: normalizePointList(node.values.points)
  };
}

function buildPathLayerReadModel(node) {
  return {
    id: node.values.pathId,
    label: node.values.label,
    pathType: node.values.pathType,
    materialMode: node.values.materialMode || "preset",
    textureAssetId: node.values.textureAssetId || null,
    textureScale: numberOrNull(node.values.textureScale) ?? 4,
    opacity: numberOrNull(node.values.opacity) ?? 1,
    width: numberOrNull(node.values.width),
    edgeBlend: numberOrNull(node.values.edgeBlend),
    yOffset: numberOrNull(node.values.yOffset),
    slightlySunken: node.values.slightlySunken !== false,
    speedMultiplier: numberOrNull(node.values.speedMultiplier),
    points: normalizePointList(node.values.points)
  };
}

function buildWaterLayerReadModel(node) {
  return {
    id: node.values.waterId,
    label: node.values.label,
    waterType: node.values.waterType,
    materialMode: node.values.materialMode || "preset",
    textureAssetId: node.values.textureAssetId || null,
    textureScale: numberOrNull(node.values.textureScale) ?? 6,
    opacity: numberOrNull(node.values.opacity) ?? 1,
    width: numberOrNull(node.values.width),
    y: numberOrNull(node.values.y),
    color: node.values.color,
    flowSpeed: numberOrNull(node.values.flowSpeed),
    blocksPlayer: node.values.blocksPlayer !== false,
    points: normalizePointList(node.values.points)
  };
}

function scalePairOrLegacy(node, primaryKeyX, primaryKeyY, legacyKey, legacyDefault) {
  const legacy = numberOrNull(node.values[legacyKey]);
  const fallback = legacy !== null ? legacy : legacyDefault;
  return {
    x: numberOrNull(node.values[primaryKeyX]) ?? fallback,
    y: numberOrNull(node.values[primaryKeyY]) ?? fallback
  };
}

function buildSurfaceLayerReadModel(node) {
  const mainScale = scalePairOrLegacy(node, "textureScaleX", "textureScaleY", "textureScale", 1);
  const secondaryScale = scalePairOrLegacy(node, "secondaryTextureScaleX", "secondaryTextureScaleY", "secondaryTextureScale", 1);
  const edgeNoiseScale = scalePairOrLegacy(node, "edgeFadeNoiseScaleX", "edgeFadeNoiseScaleY", "edgeFadeNoiseScale", 1);
  return {
    id: node.values.surfaceId,
    label: node.values.label,
    surfaceKind: node.values.surfaceKind,
    fallbackColor: node.values.fallbackColor || "#8a6f45",
    width: numberOrNull(node.values.width),
    yOffset: numberOrNull(node.values.yOffset),
    textureAssetId: node.values.textureAssetId || null,
    textureScale: numberOrNull(node.values.textureScale) ?? 4,
    textureScaleX: mainScale.x,
    textureScaleY: mainScale.y,
    secondaryTextureAssetId: node.values.secondaryTextureAssetId || null,
    secondaryTextureScale: numberOrNull(node.values.secondaryTextureScale) ?? 8,
    secondaryTextureScaleX: secondaryScale.x,
    secondaryTextureScaleY: secondaryScale.y,
    secondaryTextureStrength: numberOrNull(node.values.secondaryTextureStrength) ?? 0.25,
    edgeFadeWidth: numberOrNull(node.values.edgeFadeWidth) ?? 0.8,
    edgeFadeNoiseAssetId: node.values.edgeFadeNoiseAssetId || null,
    edgeFadeNoiseScale: numberOrNull(node.values.edgeFadeNoiseScale) ?? 5,
    edgeFadeNoiseScaleX: edgeNoiseScale.x,
    edgeFadeNoiseScaleY: edgeNoiseScale.y,
    edgeFadeNoiseStrength: numberOrNull(node.values.edgeFadeNoiseStrength) ?? 0.35,
    opacity: numberOrNull(node.values.opacity) ?? 1,
    animated: node.values.animated === true,
    flowSpeed: numberOrNull(node.values.flowSpeed) ?? 0,
    flowDirection: numberOrNull(node.values.flowDirection) ?? 0,
    flowTextureLayer: node.values.flowTextureLayer || "main",
    blocksPlayer: node.values.blocksPlayer === true,
    points: normalizePointList(node.values.points)
  };
}

function buildBlockerAreaReadModel(node) {
  return {
    id: node.values.blockerId,
    label: node.values.label,
    shapeType: node.values.shapeType,
    x: numberOrNull(node.values.x),
    z: numberOrNull(node.values.z),
    width: numberOrNull(node.values.width),
    depth: numberOrNull(node.values.depth),
    radius: numberOrNull(node.values.radius),
    points: normalizePointList(node.values.points),
    reason: node.values.reason
  };
}

function buildWalkableSurfaceReadModel(node) {
  return {
    id: node.values.surfaceId,
    label: node.values.label,
    x: numberOrNull(node.values.x),
    y: numberOrNull(node.values.y),
    z: numberOrNull(node.values.z),
    width: numberOrNull(node.values.width),
    depth: numberOrNull(node.values.depth),
    rotationY: numberOrNull(node.values.rotationY),
    priority: numberOrNull(node.values.priority)
  };
}

function buildHudTextReadModel(node) {
  return {
    id: node.values.moduleId,
    type: "hud_text",
    anchor: node.values.anchor,
    text: node.values.text,
    fontSize: numberOrNull(node.values.fontSize),
    color: node.values.color
  };
}

function buildPerformanceHudReadModel(node) {
  return {
    id: node.values.hudId,
    type: "debug_performance_hud",
    label: node.values.label,
    enabled: node.values.enabled !== false,
    anchor: node.values.anchor,
    compact: node.values.compact !== false,
    updateIntervalMs: numberOrNull(node.values.updateIntervalMs),
    metrics: {
      showFps: node.values.showFps !== false,
      showFrameMs: node.values.showFrameMs !== false,
      showRenderer: node.values.showRenderer !== false,
      showDrawCalls: node.values.showDrawCalls !== false,
      showTriangles: node.values.showTriangles !== false,
      showGeometries: node.values.showGeometries !== false,
      showTextures: node.values.showTextures !== false,
      showSceneObjects: node.values.showSceneObjects !== false,
      showEntities: node.values.showEntities !== false,
      showTerrainVisuals: node.values.showTerrainVisuals !== false,
      showCollisionShapes: node.values.showCollisionShapes !== false,
      showWorldSize: node.values.showWorldSize === true
    },
    thresholds: {
      fpsTarget: numberOrNull(node.values.fpsTarget),
      fpsWarn: numberOrNull(node.values.fpsWarn),
      fpsDanger: numberOrNull(node.values.fpsDanger),
      frameMsTarget: numberOrNull(node.values.frameMsTarget),
      frameMsWarn: numberOrNull(node.values.frameMsWarn),
      frameMsDanger: numberOrNull(node.values.frameMsDanger),
      drawCallsWarn: numberOrNull(node.values.drawCallsWarn),
      drawCallsDanger: numberOrNull(node.values.drawCallsDanger),
      trianglesWarn: numberOrNull(node.values.trianglesWarn),
      trianglesDanger: numberOrNull(node.values.trianglesDanger),
      meshesWarn: numberOrNull(node.values.meshesWarn),
      meshesDanger: numberOrNull(node.values.meshesDanger),
      texturesWarn: numberOrNull(node.values.texturesWarn),
      texturesDanger: numberOrNull(node.values.texturesDanger),
      terrainVisualsWarn: numberOrNull(node.values.terrainVisualsWarn),
      terrainVisualsDanger: numberOrNull(node.values.terrainVisualsDanger),
      collisionShapesWarn: numberOrNull(node.values.collisionShapesWarn),
      collisionShapesDanger: numberOrNull(node.values.collisionShapesDanger)
    }
  };
}

function buildUiReadModel(node) {
  if (node.type === "debug_performance_hud") return buildPerformanceHudReadModel(node);
  return buildHudTextReadModel(node);
}

function collectTerrainReadModel(nodes) {
  const terrain = emptyTerrainReadModel();
  for (const node of nodes || []) {
    if (node.type === "terrain_layer") terrain.layers.push(buildTerrainLayerReadModel(node));
    else if (node.type === "path_layer") terrain.paths.push(buildPathLayerReadModel(node));
    else if (node.type === "water_layer") terrain.waters.push(buildWaterLayerReadModel(node));
    else if (node.type === "surface_layer") terrain.surfaces.push(buildSurfaceLayerReadModel(node));
  }
  return terrain;
}

function collectCollisionReadModel(nodes) {
  const collision = emptyCollisionReadModel();
  for (const node of nodes || []) {
    if (node.type === "blocker_area") collision.blockers.push(buildBlockerAreaReadModel(node));
    else if (node.type === "walkable_surface") collision.walkableSurfaces.push(buildWalkableSurfaceReadModel(node));
  }
  return collision;
}

function validateParentGraph(graph, nodeMap, errors) {
  const visiting = new Set();
  const visited = new Set();
  function visit(node) {
    if (visited.has(node.id)) return;
    if (visiting.has(node.id)) {
      errors.push("Parent-relaties bevatten een cyclus rond node " + node.id + ".");
      return;
    }
    visiting.add(node.id);
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId);
      if (!parent) {
        errors.push("Node " + node.id + " verwijst naar een onbekende parent.");
      } else if (!isContainer(parent.type)) {
        errors.push("Node " + node.id + " heeft een parent die geen group is.");
      } else {
        visit(parent);
      }
    }
    visiting.delete(node.id);
    visited.add(node.id);
  }
  for (const node of graph.nodes) visit(node);
}

export function validateGraphForPublish(graph, services = {}) {
  const errors = [];
  const warnings = [];
  const nodeMap = nodeMapForGraph(graph);
  validateParentGraph(graph, nodeMap, errors);
  validateGroupDependencyCycles(graph, nodeMap, errors);
  for (const node of graph.nodes) {
    const definition = NODE_TYPES[node.type];
    if (!definition) {
      errors.push("Node " + node.id + " heeft onbekend type " + node.type + ".");
      continue;
    }
    const result = validateNodeValues(node.type, node.values, NODE_TYPES);
    errors.push.apply(errors, result.errors);
    if (node.type === "group") {
      const inputNodes = graph.nodes.filter(function (candidate) {
        return candidate.parentId === node.id && candidate.type === "group_input";
      });
      const outputNodes = graph.nodes.filter(function (candidate) {
        return candidate.parentId === node.id && candidate.type === "group_output";
      });
      if (inputNodes.length !== 1) errors.push("Group " + node.id + " moet exact één Group Input node hebben.");
      if (outputNodes.length !== 1) errors.push("Group " + node.id + " moet exact één Group Output node hebben.");
      if (outputNodes.length === 1) {
        const groupPorts = resolveNodePorts(node, nodeMap).outputs;
        for (const [portName, port] of Object.entries(groupPorts)) {
          const internalSources = directIncomingEdges(graph, outputNodes[0], portName);
          if (!internalSources.length) {
            errors.push("Group output '" + (port.label || portName) + "' is not connected inside the group.");
            continue;
          }
          collectResolutionError(errors, function () {
            return resolveInputSources(graph, outputNodes[0], portName, nodeMap, createResolutionState());
          });
        }
      }
    }
  }
  for (const edge of graph.edges) {
    const from = nodeMap.get(edge.fromNodeId);
    const to = nodeMap.get(edge.toNodeId);
    if (!from) errors.push("Edge " + edge.id + " heeft onbekende from node.");
    if (!to) errors.push("Edge " + edge.id + " heeft onbekende to node.");
    if (!from || !to) continue;
    if ((from.parentId || null) !== (to.parentId || null)) {
      errors.push("Edge " + edge.id + " overschrijdt een group-grens. Verbind via de group interface.");
      continue;
    }
    const fromPort = resolveNodePort(from, edge.fromPort, "output", nodeMap);
    const toPort = resolveNodePort(to, edge.toPort, "input", nodeMap);
    if (!fromPort) errors.push("Edge " + edge.id + " gebruikt onbekende outputpoort " + edge.fromPort + ".");
    if (!toPort) errors.push("Edge " + edge.id + " gebruikt onbekende inputpoort " + edge.toPort + ".");
    if (fromPort && toPort && fromPort.dataType !== toPort.dataType) errors.push("Edge " + edge.id + " verbindt " + fromPort.dataType + " met " + toPort.dataType + ".");
  }
  const outputs = graph.nodes.filter(function (node) { return node.type === "game_output"; });
  if (!outputs.length) errors.push("Game Output node ontbreekt.");
  if (outputs.length > 1) warnings.push("Er zijn meerdere Game Output nodes. De eerste wordt gebruikt.");
  const output = outputs[0];
  if (output) {
    const outputPorts = resolveNodePorts(output, nodeMap).inputs;
    for (const [portName, port] of Object.entries(outputPorts)) {
      const incoming = directIncomingEdges(graph, output, portName);
      if (port.required && incoming.length === 0) errors.push("Game Output mist verplichte input: " + portName + ".");
      if (!port.multiple && incoming.length > 1) errors.push("Game Output input " + portName + " accepteert maar een verbinding.");
      if (incoming.length) {
        collectResolutionError(errors, function () {
          return incomingNodes(graph, output, portName, nodeMap, createResolutionState());
        });
      }
    }
    const ground = collectResolutionError(errors, function () {
      return firstIncomingNode(graph, output, "ground", nodeMap);
    });
    if (ground && !ground.values.materialColor && !ground.values.textureAssetId) errors.push("Ground Surface heeft een materialColor of textureAssetId nodig.");
    if (ground?.values.textureAssetId) requireAsset(services.assetService, ground.values.textureAssetId, ["texture", "image"], "Ground Surface texture", errors);

    const camera = collectResolutionError(errors, function () {
      return firstIncomingNode(graph, output, "camera", nodeMap);
    });
    if (camera) {
      const minD = numberOrNull(camera.values.minDistance);
      const maxD = numberOrNull(camera.values.maxDistance);
      if (minD !== null && maxD !== null && minD > maxD) errors.push("Top-Down Camera min zoom is groter dan max zoom.");
    }

    const player = collectResolutionError(errors, function () {
      return firstIncomingNode(graph, output, "player", nodeMap);
    });
    if (player) requireAsset(services.assetService, player.values.modelAssetId, "model", "Player Character model", errors);

    for (const entity of collectResolutionError(errors, function () {
      return incomingNodes(graph, output, "entities", nodeMap);
    }) || []) {
      if (entity.type === "model_entity") requireAsset(services.assetService, entity.values.modelAssetId, "model", "Model Entity " + entity.id, errors);
    }
    for (const inter of collectResolutionError(errors, function () {
      return incomingNodes(graph, output, "interactables", nodeMap);
    }) || []) {
      if (inter.values.modelAssetId) requireAsset(services.assetService, inter.values.modelAssetId, "model", "Interactable " + inter.id, errors);
      if (inter.values.actionType === "teleport" && (numberOrNull(inter.values.teleportX) === null || numberOrNull(inter.values.teleportZ) === null)) {
        errors.push("Interactable " + inter.id + " met teleport-actie heeft teleportX en teleportZ nodig.");
      }
      if (inter.values.actionType === "message" && !inter.values.message) {
        errors.push("Interactable " + inter.id + " met message-actie heeft een Message nodig.");
      }
    }

    const keybinds = collectResolutionError(errors, function () {
      return incomingNodes(graph, output, "keybinds", nodeMap);
    }) || [];
    const boundActions = new Set(keybinds.map(function (node) { return node.values.action; }));
    const movementActions = ["move_forward", "move_back", "move_left", "move_right"];
    if (!movementActions.some(function (action) { return boundActions.has(action); })) {
      warnings.push("Geen bewegings-keybinds. De speler kan alleen via klik-naar-lopen bewegen.");
    }
    if (!boundActions.has("interact")) {
      warnings.push("Geen interact-keybind. Interactie werkt alleen via klikken op het object.");
    }

    const terrainNodes = collectResolutionError(errors, function () {
      return incomingNodes(graph, output, "terrain", nodeMap);
    }) || [];
    for (const node of terrainNodes) {
      if (node.type === "path_layer") {
        validatePointList(errors, node, 2);
        if (node.values.materialMode === "texture" && !node.values.textureAssetId) {
          warnings.push("Path layer '" + (node.values.label || node.id) + "' staat op texture mode maar heeft geen Texture asset gekozen.");
        }
        if (node.values.textureAssetId) requireAsset(services.assetService, node.values.textureAssetId, ["texture", "image"], "Path layer '" + (node.values.label || node.id) + "' texture", errors);
      } else if (node.type === "water_layer") {
        if (node.values.waterType === "river") validatePointList(errors, node, 2);
        if (node.values.materialMode === "texture" && !node.values.textureAssetId) {
          warnings.push("Water layer '" + (node.values.label || node.id) + "' staat op texture mode maar heeft geen Texture asset gekozen.");
        }
        if (node.values.textureAssetId) requireAsset(services.assetService, node.values.textureAssetId, ["texture", "image"], "Water layer '" + (node.values.label || node.id) + "' texture", errors);
      } else if (node.type === "surface_layer") {
        validatePointList(errors, node, 2);
        if (node.values.textureAssetId) requireAsset(services.assetService, node.values.textureAssetId, ["texture", "image"], "Surface layer '" + (node.values.label || node.id) + "' texture", errors);
        if (node.values.secondaryTextureAssetId) requireAsset(services.assetService, node.values.secondaryTextureAssetId, ["texture", "image"], "Surface layer '" + (node.values.label || node.id) + "' secondary texture", errors);
        if (node.values.edgeFadeNoiseAssetId) requireAsset(services.assetService, node.values.edgeFadeNoiseAssetId, ["texture", "image"], "Surface layer '" + (node.values.label || node.id) + "' edge noise", errors);
        if (!node.values.textureAssetId) {
          warnings.push("Surface layer '" + (node.values.label || node.id) + "' heeft geen Texture asset gekozen.");
        }
        if ((node.values.surfaceKind === "water" || node.values.surfaceKind === "river") && !node.values.animated) {
          warnings.push("Surface layer '" + (node.values.label || node.id) + "' is water/river maar heeft animated niet aan.");
        }
      } else if (node.type === "terrain_layer" && node.values.shapeType === "polygon") {
        validatePointList(errors, node, 3);
      }
    }

    const collisionNodes = collectResolutionError(errors, function () {
      return incomingNodes(graph, output, "collision", nodeMap);
    }) || [];
    for (const node of collisionNodes) {
      if (node.type === "blocker_area" && node.values.shapeType === "polygon") {
        validatePointList(errors, node, 3);
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function buildWorldFromGraph(graph, services = {}) {
  const outputNode = graph.nodes.find(function (node) { return node.type === "game_output"; });
  const empty = {
    schemaVersion: graph.schemaVersion,
    source: "editor-node-graph",
    assets: [],
    entities: [],
    lights: [],
    interactables: [],
    keybinds: [],
    ui: [],
    terrain: emptyTerrainReadModel(),
    collision: emptyCollisionReadModel()
  };
  if (!outputNode) return empty;
  const nodeMap = nodeMapForGraph(graph);
  const worldNode = firstIncomingNode(graph, outputNode, "world", nodeMap);
  const groundNode = firstIncomingNode(graph, outputNode, "ground", nodeMap);
  const cameraNode = firstIncomingNode(graph, outputNode, "camera", nodeMap);
  const playerNode = firstIncomingNode(graph, outputNode, "player", nodeMap);
  const spawnNode = firstIncomingNode(graph, outputNode, "spawn", nodeMap);
  const lightNodes = incomingNodes(graph, outputNode, "lights", nodeMap);
  const entityNodes = incomingNodes(graph, outputNode, "entities", nodeMap);
  const interactableNodes = incomingNodes(graph, outputNode, "interactables", nodeMap);
  const keybindNodes = incomingNodes(graph, outputNode, "keybinds", nodeMap);
  const uiNodes = incomingNodes(graph, outputNode, "ui", nodeMap);
  const terrainNodes = incomingNodes(graph, outputNode, "terrain", nodeMap);
  const collisionNodes = incomingNodes(graph, outputNode, "collision", nodeMap);

  const assetIds = new Set();
  if (groundNode?.values.textureAssetId) assetIds.add(groundNode.values.textureAssetId);
  for (const node of terrainNodes) {
    if (node.values.textureAssetId) assetIds.add(node.values.textureAssetId);
    if (node.type === "surface_layer") {
      if (node.values.secondaryTextureAssetId) assetIds.add(node.values.secondaryTextureAssetId);
      if (node.values.edgeFadeNoiseAssetId) assetIds.add(node.values.edgeFadeNoiseAssetId);
    }
  }
  if (playerNode?.values.modelAssetId) assetIds.add(playerNode.values.modelAssetId);
  for (const node of entityNodes) if (node.values.modelAssetId) assetIds.add(node.values.modelAssetId);
  for (const node of interactableNodes) if (node.values.modelAssetId) assetIds.add(node.values.modelAssetId);
  const assets = services.assetService ? services.assetService.manifestForIds(Array.from(assetIds)) : [];

  return {
    schemaVersion: graph.schemaVersion,
    source: "editor-node-graph",
    outputNodeId: outputNode.id,
    world: worldNode ? {
      id: worldNode.values.worldId,
      displayName: worldNode.values.displayName,
      backgroundColor: worldNode.values.backgroundColor,
      fogColor: worldNode.values.fogColor,
      fogDensity: numberOrNull(worldNode.values.fogDensity)
    } : null,
    ground: groundNode ? {
      id: groundNode.values.groundId,
      width: numberOrNull(groundNode.values.width),
      depth: numberOrNull(groundNode.values.depth),
      y: numberOrNull(groundNode.values.y),
      materialColor: groundNode.values.materialColor,
      textureAssetId: groundNode.values.textureAssetId,
      textureRepeat: numberOrNull(groundNode.values.textureRepeat)
    } : null,
    camera: cameraNode ? {
      id: cameraNode.values.cameraId,
      mode: "top-down",
      pitch: numberOrNull(cameraNode.values.pitch),
      yaw: numberOrNull(cameraNode.values.yaw),
      distance: numberOrNull(cameraNode.values.distance),
      minDistance: numberOrNull(cameraNode.values.minDistance),
      maxDistance: numberOrNull(cameraNode.values.maxDistance),
      fov: numberOrNull(cameraNode.values.fov),
      follow: cameraNode.values.follow !== false,
      rotateSpeed: numberOrNull(cameraNode.values.rotateSpeed)
    } : null,
    player: playerNode ? {
      id: playerNode.values.playerId,
      modelAssetId: playerNode.values.modelAssetId,
      animationClip: playerNode.values.animationClip || null,
      idleAnimation: playerNode.values.idleAnimation || null,
      walkAnimation: playerNode.values.walkAnimation || null,
      runAnimation: playerNode.values.runAnimation || null,
      moveSpeed: numberOrNull(playerNode.values.moveSpeed),
      sprintMultiplier: numberOrNull(playerNode.values.sprintMultiplier),
      turnSpeed: numberOrNull(playerNode.values.turnSpeed),
      collisionRadius: numberOrNull(playerNode.values.collisionRadius),
      scale: numberOrNull(playerNode.values.scale)
    } : null,
    spawn: spawnNode ? {
      id: spawnNode.values.spawnId,
      x: numberOrNull(spawnNode.values.x),
      z: numberOrNull(spawnNode.values.z),
      facing: numberOrNull(spawnNode.values.facing)
    } : null,
    lights: lightNodes.map(function (node) {
      if (node.type === "ambient_light") return { id: node.values.lightId, type: "ambient", color: node.values.color, intensity: numberOrNull(node.values.intensity) };
      return { id: node.values.lightId, type: "directional", color: node.values.color, intensity: numberOrNull(node.values.intensity), position: { x: numberOrNull(node.values.x), y: numberOrNull(node.values.y), z: numberOrNull(node.values.z) } };
    }),
    entities: entityNodes.map(function (node) {
      return {
        id: node.values.entityId,
        label: node.values.label,
        type: "model",
        modelAssetId: node.values.modelAssetId,
        animationClip: node.values.animationClip || null,
        idleAnimation: node.values.idleAnimation || null,
        walkAnimation: node.values.walkAnimation || null,
        runAnimation: node.values.runAnimation || null,
        solid: node.values.solid === true,
        collisionRadius: numberOrNull(node.values.collisionRadius),
        transform: {
          position: { x: numberOrNull(node.values.x), y: numberOrNull(node.values.y), z: numberOrNull(node.values.z) },
          rotation: {
            x: numberOrNull(node.values.rotationX) ?? 0,
            y: numberOrNull(node.values.rotationY) ?? 0,
            z: numberOrNull(node.values.rotationZ) ?? 0
          },
          scale: { x: numberOrNull(node.values.scaleX), y: numberOrNull(node.values.scaleY), z: numberOrNull(node.values.scaleZ) }
        }
      };
    }),
    interactables: interactableNodes.map(function (node) {
      return {
        id: node.values.interactableId,
        prompt: node.values.prompt,
        position: { x: numberOrNull(node.values.x), z: numberOrNull(node.values.z) },
        radius: numberOrNull(node.values.radius),
        modelAssetId: node.values.modelAssetId || null,
        action: {
          type: node.values.actionType,
          message: node.values.message || null,
          teleport: { x: numberOrNull(node.values.teleportX), z: numberOrNull(node.values.teleportZ) }
        }
      };
    }),
    keybinds: keybindNodes.filter(function (node) {
      return GAME_ACTIONS.includes(node.values.action) && node.values.keyCode;
    }).map(function (node) {
      return { id: node.values.bindingId, action: node.values.action, keyCode: node.values.keyCode };
    }),
    ui: uiNodes.map(buildUiReadModel),
    terrain: collectTerrainReadModel(terrainNodes),
    collision: collectCollisionReadModel(collisionNodes),
    assets
  };
}

export class PublishService {
  constructor(repository, services = {}) {
    this.repository = repository;
    this.services = services;
  }

  saveDraft() {
    const world = buildWorldFromGraph(this.repository.getGraph(), this.services);
    this.repository.saveDraftWorld(world);
    return world;
  }

  validate() {
    return validateGraphForPublish(this.repository.getGraph(), this.services);
  }

  publish(actorUserId) {
    const graph = this.repository.getGraph();
    const validation = validateGraphForPublish(graph, this.services);
    if (!validation.ok) {
      const error = new Error(validation.errors.join(" "));
      error.status = 400;
      error.details = validation;
      throw error;
    }
    const world = buildWorldFromGraph(graph, this.services);
    this.repository.saveDraftWorld(world);
    this.repository.publishWorld(world, actorUserId);
    return { world, validation };
  }
}
