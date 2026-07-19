import {
  NODE_TYPES,
  GAME_ACTIONS,
  defaultValuesForType,
  normalizeWorldSettingsPreset,
  worldSettingsPresetValues,
  resolveNodePort,
  resolveNodePorts,
  isContainer
} from "../shared/node-types.js";
import { validateNodeValues } from "./field-validation.js";
import { GameProjectCompiler } from "./game-project-compiler.js";

function graphError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function validationIssueMessage(issue) {
  if (typeof issue === "string") return issue;
  if (issue && typeof issue === "object") return String(issue.message || issue.code || JSON.stringify(issue));
  return String(issue || "");
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

function numberOrFallback(value, fallback) {
  const number = numberOrNull(value);
  return number === null ? fallback : number;
}

function stringOrFallback(value, fallback) {
  const text = String(value === null || value === undefined ? "" : value).trim();
  return text || fallback;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function uniqueById(records) {
  const map = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    if (!record) continue;
    const key = record.id || record.assetId || record.nodeId || JSON.stringify(record);
    map.set(key, record);
  }
  return Array.from(map.values());
}

function normalizeAnimationName(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function animationNameMatchesRole(name, role) {
  const text = normalizeAnimationName(name).toLowerCase();
  const state = String(role || "").trim().toLowerCase();
  if (!text || !state) return false;
  if (state === "idle") {
    return text.includes("idle") || text.includes("stand") || text.includes("rest") || text.includes("breath");
  }
  if (state === "walk") {
    return text.includes("walk") || text.includes("move") || text.includes("jog");
  }
  if (state === "run") {
    return text.includes("run") || text.includes("sprint") || text.includes("dash");
  }
  return false;
}

function assetAnimationNames(asset) {
  return Array.isArray(asset?.metadata?.animations)
    ? asset.metadata.animations.map(function (animation) {
      return normalizeAnimationName(animation?.name);
    }).filter(Boolean)
    : [];
}

function findAssetAnimationName(names, preferredName) {
  const list = Array.isArray(names) ? names : [];
  if (!list.length) return null;
  const preferred = normalizeAnimationName(preferredName);
  if (!preferred) return null;
  const exact = list.find(function (name) {
    return name === preferred;
  });
  if (exact) return exact;
  const lower = preferred.toLowerCase();
  const caseMatch = list.find(function (name) {
    return name.toLowerCase() === lower;
  });
  if (caseMatch) return caseMatch;
  const contains = list.find(function (name) {
    return name.toLowerCase().includes(lower);
  });
  return contains || null;
}

function findRoleAnimationName(names, role) {
  return (Array.isArray(names) ? names : []).find(function (name) {
    return animationNameMatchesRole(name, role);
  }) || null;
}

function resolveCanonicalAnimationConfig(asset, values = {}) {
  const names = assetAnimationNames(asset);
  if (!names.length) {
    return {
      animationClip: null,
      idleAnimation: null,
      walkAnimation: null,
      runAnimation: null
    };
  }
  const defaultName = findAssetAnimationName(names, asset?.metadata?.defaultAnimation);
  const rawIdle = findAssetAnimationName(names, values.idleAnimation);
  const rawWalk = findAssetAnimationName(names, values.walkAnimation);
  const rawRun = findAssetAnimationName(names, values.runAnimation);
  const rawClip = findAssetAnimationName(names, values.animationClip);
  const idle = findRoleAnimationName(names, "idle") || defaultName || rawIdle || rawClip || names[0] || null;
  const walk = findRoleAnimationName(names, "walk") || rawWalk || rawClip || names[0] || null;
  const run = findRoleAnimationName(names, "run") || rawRun || rawClip || rawWalk || names[0] || null;
  return {
    animationClip: idle,
    idleAnimation: idle,
    walkAnimation: walk,
    runAnimation: run
  };
}

const SHADOW_LEGACY_FIELD_KEYS = [
  "shadowsEnabled",
  "shadowQuality",
  "shadowMapSize",
  "shadowCameraSize",
  "shadowCameraFar",
  "shadowBias",
  "shadowNormalBias",
  "shadowType",
  "staticPropCastShadows",
  "staticPropReceiveShadows",
  "scatterCastShadows",
  "scatterReceiveShadows",
  "groundReceiveShadows",
  "terrainReceiveShadows"
];

function hasOwnValue(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

function shadowLegacyField(source, prefix, key) {
  const data = source || {};
  const prefixedKey = prefix ? prefix + key.charAt(0).toUpperCase() + key.slice(1) : key;
  if (hasOwnValue(data, prefixedKey)) return data[prefixedKey];
  if (prefix && hasOwnValue(data, key)) return data[key];
  return undefined;
}

function hasLegacyShadowFields(source, prefix) {
  return SHADOW_LEGACY_FIELD_KEYS.some(function (key) {
    return shadowLegacyField(source, prefix, key) !== undefined;
  });
}

function normalizeShadowMapTypeName(value, fallback = "pcf_soft") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!normalized || normalized === "auto") return fallback;
  if (normalized === "pcfsoft" || normalized === "pcfsoftshadowmap") return "pcf_soft";
  if (normalized === "pcf" || normalized === "pcfshadowmap") return "pcf";
  if (normalized === "basic" || normalized === "basicshadowmap") return "basic";
  if (normalized === "vsm" || normalized === "vsmshadowmap") return "vsm";
  if (normalized === "pcfsoftshadowmap") return "pcf_soft";
  return fallback;
}

function inferShadowPresetFromLegacyFields(source, prefix, fallbackPreset = "middel_schaduw") {
  const shadowsEnabled = shadowLegacyField(source, prefix, "shadowsEnabled");
  if (shadowsEnabled === false) return "geen_schaduw";
  const quality = String(shadowLegacyField(source, prefix, "shadowQuality") || "").trim().toLowerCase();
  if (quality === "off") return "geen_schaduw";
  if (quality === "low") return "lichte_schaduw";
  if (quality === "medium") return "middel_schaduw";
  if (quality === "high") return "hoog_schaduw";
  const mapSize = numberOrNull(shadowLegacyField(source, prefix, "shadowMapSize"));
  if (mapSize !== null) {
    if (mapSize <= 0) return "geen_schaduw";
    if (mapSize <= 768) return "lichte_schaduw";
    if (mapSize <= 1536) return "middel_schaduw";
    if (mapSize <= 3072) return "hoog_schaduw";
    return "extreem_schaduw";
  }
  const normalizedFallback = normalizeWorldSettingsPreset(fallbackPreset, "middel_schaduw");
  return normalizedFallback;
}

function normalizeShadowQuality(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "off" || normalized === "low" || normalized === "medium" || normalized === "high") return normalized;
  return "medium";
}

const SHADOW_QUALITY_MAP_SIZES = {
  off: 0,
  low: 512,
  medium: 1024,
  high: 2048
};

const SHADOW_QUALITY_CAMERA_SIZE_FALLBACK = {
  off: 60,
  low: 80,
  medium: 60,
  high: 45
};

function shadowMapSizeForQuality(quality) {
  return SHADOW_QUALITY_MAP_SIZES[normalizeShadowQuality(quality)] || SHADOW_QUALITY_MAP_SIZES.medium;
}

function shadowCameraSizeForQuality(quality) {
  return SHADOW_QUALITY_CAMERA_SIZE_FALLBACK[normalizeShadowQuality(quality)] || SHADOW_QUALITY_CAMERA_SIZE_FALLBACK.medium;
}

function nodeLabel(node) {
  return String(node?.values?.label || node?.title || node?.id || node?.type || "Node");
}

function pointList(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePoint(point) {
  const normalized = {
    x: numberOrNull(point?.x),
    z: numberOrNull(point?.z)
  };
  const y = numberOrNull(point?.y);
  if (y !== null) normalized.y = y;
  return normalized;
}

function normalizeWalkablePoint(point, fallbackY = null) {
  const normalized = normalizePoint(point);
  if (!Object.prototype.hasOwnProperty.call(normalized, "y")) {
    const y = numberOrNull(fallbackY);
    if (y !== null) normalized.y = y;
  }
  return normalized;
}

function normalizePointList(value) {
  return pointList(value).map(function (point) {
    return normalizePoint(point);
  });
}

function normalizeWalkablePointList(value, fallbackY = null) {
  return pointList(value).map(function (point) {
    return normalizeWalkablePoint(point, fallbackY);
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
  return { layers: [], surfaces: [] };
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
    priority: numberOrNull(node.values.priority),
    points: normalizeWalkablePointList(node.values.points, node.values.y)
  };
}

function buildGameCameraReadModel(node) {
  const startDistance = numberOrNull(node.values.startDistance);
  const targetHeightOffset = numberOrNull(node.values.targetHeightOffset);
  return {
    id: node.values.cameraId,
    cameraId: node.values.cameraId,
    pitch: numberOrNull(node.values.pitch),
    yaw: numberOrNull(node.values.yaw),
    startDistance: startDistance !== null ? startDistance : numberOrNull(node.values.distance),
    distance: numberOrNull(node.values.distance),
    minDistance: numberOrNull(node.values.minDistance),
    maxDistance: numberOrNull(node.values.maxDistance),
    fov: numberOrNull(node.values.fov),
    targetHeightOffset: targetHeightOffset !== null ? targetHeightOffset : 1.6,
    follow: node.values.follow !== false,
    rotateSpeed: numberOrNull(node.values.rotateSpeed)
  };
}

function buildEditorCameraReadModel(node) {
  return {
    id: node.values.cameraId,
    cameraId: node.values.cameraId,
    target: {
      x: numberOrNull(node.values.targetX),
      y: numberOrNull(node.values.targetY),
      z: numberOrNull(node.values.targetZ)
    },
    pitch: numberOrNull(node.values.pitch),
    yaw: numberOrNull(node.values.yaw),
    distance: numberOrNull(node.values.distance),
    minDistance: numberOrNull(node.values.minDistance),
    maxDistance: numberOrNull(node.values.maxDistance),
    fov: numberOrNull(node.values.fov),
    rotateSpeed: numberOrNull(node.values.rotateSpeed)
  };
}

function normalizeNodeIdList(value) {
  const ids = [];
  const seen = new Set();
  for (const entry of Array.isArray(value) ? value : []) {
    const id = String(entry || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function normalizeFinitePointList(value) {
  const points = [];
  for (const entry of pointList(value)) {
    const x = numberOrNull(entry?.x);
    const z = numberOrNull(entry?.z);
    if (x === null || z === null) continue;
    points.push({ x, z });
  }
  return points;
}

function pointInPolygon2D(px, pz, points) {
  if (!Array.isArray(points) || points.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const current = points[index];
    const prior = points[previous];
    const intersects = ((current.z > pz) !== (prior.z > pz))
      && (px < ((prior.x - current.x) * (pz - current.z)) / ((prior.z - current.z) || 0.000001) + current.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

function scatterPointBounds(points) {
  const valid = normalizeFinitePointList(points);
  if (!valid.length) return null;
  let minX = valid[0].x;
  let maxX = valid[0].x;
  let minZ = valid[0].z;
  let maxZ = valid[0].z;
  for (const point of valid) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.z < minZ) minZ = point.z;
    if (point.z > maxZ) maxZ = point.z;
  }
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    width: Math.max(0, maxX - minX),
    depth: Math.max(0, maxZ - minZ)
  };
}

function scatterRectanglePoints(settings) {
  const centerX = numberOrNull(settings?.areaCenterX) ?? 0;
  const centerZ = numberOrNull(settings?.areaCenterZ) ?? 0;
  const halfWidth = Math.max(0, numberOrNull(settings?.areaWidth) ?? 0) / 2;
  const halfDepth = Math.max(0, numberOrNull(settings?.areaDepth) ?? 0) / 2;
  const rotation = (numberOrNull(settings?.areaRotationY) ?? 0) * Math.PI / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const offsets = [
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: halfWidth, z: halfDepth },
    { x: -halfWidth, z: halfDepth }
  ];
  return offsets.map(function (offset) {
    return {
      x: centerX + ((offset.x * cos) - (offset.z * sin)),
      z: centerZ + ((offset.x * sin) + (offset.z * cos))
    };
  });
}

function scatterPointsForSettings(settings) {
  const explicitPoints = normalizeFinitePointList(settings?.points);
  if (explicitPoints.length >= 3) return explicitPoints;
  return scatterRectanglePoints(settings);
}

function hashStringToUint32(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createDeterministicRandom(seed) {
  let state = hashStringToUint32(seed) || 1;
  return function () {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SCATTER_SIZE_CURVES = new Set(["linear", "smooth", "steep", "instant"]);
const SCATTER_DISTRIBUTION_MODES = new Set(["random", "blue_noise", "dense_fill"]);
const SCATTER_INSTANT_THRESHOLD = 0.08;
const SCATTER_EDGE_EPSILON = 0.000001;

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function lerpNumber(start, end, t) {
  return start + ((end - start) * t);
}

function normalizeScatterPercent(value, fallback = 0) {
  const fallbackValue = Math.max(0, Math.min(100, Math.round(Number(fallback) || 0)));
  const number = Number(value);
  if (!Number.isFinite(number)) return fallbackValue;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function normalizeScatterCurve(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return SCATTER_SIZE_CURVES.has(normalized) ? normalized : "linear";
}

function normalizeScatterDistributionMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return SCATTER_DISTRIBUTION_MODES.has(normalized) ? normalized : "random";
}

function normalizeScatterScaleMultipliers(value, legacyValue) {
  const normalized = {};
  function ingest(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return;
    for (const [assetIdRaw, multiplierRaw] of Object.entries(source)) {
      const assetId = String(assetIdRaw || "").trim();
      if (!assetId) continue;
      normalized[assetId] = clampNumber(multiplierRaw, 0.001, 1000, 1);
    }
  }
  ingest(legacyValue);
  ingest(value);
  return Object.keys(normalized).sort().reduce(function (result, assetId) {
    result[assetId] = normalized[assetId];
    return result;
  }, {});
}

function closestPointOnSegment2D(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz;
  if (lengthSq <= SCATTER_EDGE_EPSILON) {
    const dx = px - ax;
    const dz = pz - az;
    return {
      x: ax,
      z: az,
      t: 0,
      distanceSq: dx * dx + dz * dz
    };
  }
  const t = Math.min(1, Math.max(0, (((px - ax) * abx) + ((pz - az) * abz)) / lengthSq));
  const x = ax + (abx * t);
  const z = az + (abz * t);
  const dx = px - x;
  const dz = pz - z;
  return {
    x: x,
    z: z,
    t: t,
    distanceSq: dx * dx + dz * dz
  };
}

function closestPointOnPolygonBoundary(px, pz, points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  let best = null;
  for (let index = 0, previousIndex = points.length - 1; index < points.length; previousIndex = index, index += 1) {
    const start = points[previousIndex];
    const end = points[index];
    const candidate = closestPointOnSegment2D(px, pz, start.x, start.z, end.x, end.z);
    if (!best || candidate.distanceSq < best.distanceSq) {
      best = {
        x: candidate.x,
        z: candidate.z,
        t: candidate.t,
        distanceSq: candidate.distanceSq
      };
    }
  }
  return best;
}

function scatterInteriorAnchor(points, bounds) {
  if (!bounds) return { x: 0, z: 0 };
  const candidates = [
    { x: bounds.centerX, z: bounds.centerZ }
  ];
  const seed = JSON.stringify(Array.isArray(points) ? points.map(function (point) {
    return [point.x, point.z];
  }) : []);
  const random = createDeterministicRandom(seed);
  const width = Math.max(SCATTER_EDGE_EPSILON, bounds.maxX - bounds.minX);
  const depth = Math.max(SCATTER_EDGE_EPSILON, bounds.maxZ - bounds.minZ);
  for (let attempt = 0; attempt < 64; attempt += 1) {
    candidates.push({
      x: bounds.minX + (width * random()),
      z: bounds.minZ + (depth * random())
    });
  }
  let best = null;
  for (const candidate of candidates) {
    if (!pointInPolygon2D(candidate.x, candidate.z, points)) continue;
    const boundary = closestPointOnPolygonBoundary(candidate.x, candidate.z, points);
    const distanceSq = boundary ? boundary.distanceSq : 0;
    if (!best || distanceSq > best.distanceSq) {
      best = {
        x: candidate.x,
        z: candidate.z,
        distanceSq: distanceSq
      };
    }
  }
  return best ? { x: best.x, z: best.z } : { x: bounds.centerX, z: bounds.centerZ };
}

function scatterSizeCurveValue(curve, t) {
  const value = clamp01(t);
  switch (normalizeScatterCurve(curve)) {
    case "smooth":
      return value * value * (3 - (2 * value));
    case "steep":
      return Math.sqrt(value);
    case "instant":
      return value >= SCATTER_INSTANT_THRESHOLD ? 1 : 0;
    case "linear":
    default:
      return value;
  }
}

function polygonSegments(points) {
  const valid = normalizeFinitePointList(points);
  if (valid.length < 2) return [];
  const segments = [];
  let perimeter = 0;
  for (let index = 0, previousIndex = valid.length - 1; index < valid.length; previousIndex = index, index += 1) {
    const start = valid[previousIndex];
    const end = valid[index];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSq = (dx * dx) + (dz * dz);
    const length = Math.sqrt(lengthSq);
    segments.push({
      index: index,
      start: start,
      end: end,
      dx: dx,
      dz: dz,
      length: length,
      lengthSq: lengthSq,
      perimeterStart: perimeter,
      perimeterEnd: perimeter + length
    });
    perimeter += length;
  }
  return segments;
}

function polygonPerimeter(points) {
  return polygonSegments(points).reduce(function (total, segment) {
    return total + segment.length;
  }, 0);
}

function pointAtBoundaryDistance(points, distance) {
  const valid = normalizeFinitePointList(points);
  const segments = polygonSegments(valid);
  if (!segments.length) return null;
  const perimeter = segments.reduce(function (total, segment) {
    return total + segment.length;
  }, 0);
  const firstPoint = segments[0].start;
  if (perimeter <= SCATTER_EDGE_EPSILON) {
    return {
      x: firstPoint.x,
      z: firstPoint.z,
      segmentIndex: 0,
      t: 0,
      distance: 0,
      perimeter: 0,
      tangentX: 0,
      tangentZ: 0,
      inwardX: 0,
      inwardZ: 0,
      segment: segments[0]
    };
  }
  let normalizedDistance = Number(distance);
  if (!Number.isFinite(normalizedDistance)) normalizedDistance = 0;
  normalizedDistance = ((normalizedDistance % perimeter) + perimeter) % perimeter;
  let chosen = segments[0];
  for (const segment of segments) {
    if (normalizedDistance <= segment.perimeterEnd || segment === segments[segments.length - 1]) {
      chosen = segment;
      break;
    }
  }
  const segmentLength = Math.max(chosen.length, SCATTER_EDGE_EPSILON);
  const t = Math.min(1, Math.max(0, (normalizedDistance - chosen.perimeterStart) / segmentLength));
  const x = chosen.start.x + (chosen.dx * t);
  const z = chosen.start.z + (chosen.dz * t);
  let signedArea = 0;
  for (let index = 0, previousIndex = valid.length - 1; index < valid.length; previousIndex = index, index += 1) {
    const current = valid[index];
    const previous = valid[previousIndex];
    signedArea += (previous.x * current.z) - (current.x * previous.z);
  }
  const tangentLength = Math.max(chosen.length, SCATTER_EDGE_EPSILON);
  const tangentX = chosen.dx / tangentLength;
  const tangentZ = chosen.dz / tangentLength;
  const leftNormalX = -tangentZ;
  const leftNormalZ = tangentX;
  const inwardIsLeft = signedArea >= 0;
  const inwardX = inwardIsLeft ? leftNormalX : -leftNormalX;
  const inwardZ = inwardIsLeft ? leftNormalZ : -leftNormalZ;
  return {
    x: x,
    z: z,
    segmentIndex: chosen.index,
    t: t,
    distance: normalizedDistance,
    perimeter: perimeter,
    tangentX: tangentX,
    tangentZ: tangentZ,
    inwardX: inwardX,
    inwardZ: inwardZ,
    segment: chosen
  };
}

function deterministicShuffleOrOffset(random) {
  const value = typeof random === "function" ? Number(random()) : 0;
  if (!Number.isFinite(value)) return 0;
  return Math.floor(Math.abs(value) * 2147483647);
}

function isFarEnough(candidate, accepted, minDistance) {
  const candidateX = Number(candidate?.x ?? candidate?.position?.x);
  const candidateZ = Number(candidate?.z ?? candidate?.position?.z);
  if (!Number.isFinite(candidateX) || !Number.isFinite(candidateZ)) return false;
  const threshold = Math.max(0, Number(minDistance) || 0);
  if (threshold <= SCATTER_EDGE_EPSILON) return true;
  const thresholdSq = threshold * threshold;
  for (const entry of Array.isArray(accepted) ? accepted : []) {
    const acceptedX = Number(entry?.x ?? entry?.position?.x);
    const acceptedZ = Number(entry?.z ?? entry?.position?.z);
    if (!Number.isFinite(acceptedX) || !Number.isFinite(acceptedZ)) continue;
    const acceptedThreshold = Math.max(threshold, Number(entry?.spacing) || 0);
    const acceptedThresholdSq = acceptedThreshold * acceptedThreshold;
    const dx = candidateX - acceptedX;
    const dz = candidateZ - acceptedZ;
    if (((dx * dx) + (dz * dz)) + SCATTER_EDGE_EPSILON < acceptedThresholdSq) return false;
  }
  return true;
}

function candidateSpacingFor(settings, candidate, isEdge) {
  const strength = clamp01((Number(settings?.spacingStrength) || 0) / 100);
  if (strength <= SCATTER_EDGE_EPSILON) return 0;
  const edgeCandidate = isEdge || candidate?.isEdge === true;
  const baseSpacing = edgeCandidate
    ? (Number(settings?.edgeSpacing) > 0 ? Number(settings.edgeSpacing) : Number(settings?.minSpacing) || 0)
    : (Number(settings?.minSpacing) || 0);
  return Math.max(0, baseSpacing) * strength;
}

function scatterSourceScaleMultiplier(settings, sourceId) {
  const value = settings?.sourceScaleMultipliers ? settings.sourceScaleMultipliers[sourceId] : null;
  return clampNumber(value, 0.001, 1000, 1);
}

function scatterSettingsSeed(settings, sourceAssetIds) {
  const points = scatterPointsForSettings(settings);
  const seed = {
    seed: String(settings.seed || ""),
    enabled: settings.enabled === true,
    points: points.map(function (point) {
      return { x: point.x, z: point.z };
    }),
    count: settings.count,
    sourceAssetIds: sourceAssetIds,
    randomObjectSelection: settings.randomObjectSelection === true,
    boundaryBlocksPlayer: settings.boundaryBlocksPlayer === true,
    scaleMin: settings.scaleMin,
    scaleMax: settings.scaleMax,
    rotationYMin: settings.rotationYMin,
    rotationYMax: settings.rotationYMax
  };
  if (settings.minSpacing > 0 && (settings.spacingStrength > 0 || settings.distributionMode === "dense_fill")) seed.minSpacing = settings.minSpacing;
  if (settings.edgeSpacing > 0 && settings.spacingStrength > 0 && settings.edgeDensity > 0) seed.edgeSpacing = settings.edgeSpacing;
  if (settings.spacingStrength > 0) seed.spacingStrength = settings.spacingStrength;
  if (settings.distributionMode !== "random") seed.distributionMode = settings.distributionMode;
  if (normalizeScatterPercent(settings.edgeDensity, 0) > 0) {
    seed.edgeDensity = normalizeScatterPercent(settings.edgeDensity, 0);
    seed.edgeJitter = settings.edgeJitter;
  }
  return JSON.stringify(seed);
}

function normalizeScatterSettings(node) {
  const scaleMin = Math.max(0.001, numberOrNull(node.values.scaleMin) ?? 1);
  const scaleMax = Math.max(0.001, numberOrNull(node.values.scaleMax) ?? 1);
  const rotationYMin = numberOrNull(node.values.rotationYMin) ?? 0;
  const rotationYMax = numberOrNull(node.values.rotationYMax) ?? 0;
  const points = normalizeFinitePointList(node.values.points);
  const minSpacing = Math.min(1000, Math.max(0, numberOrNull(node.values.minSpacing) ?? 0));
  const edgeSpacing = Math.min(1000, Math.max(0, numberOrNull(node.values.edgeSpacing) ?? 0));
  const sourceScaleMultipliers = normalizeScatterScaleMultipliers(
    node.values.sourceScaleMultipliers,
    node.values.sourceHeightMultipliers
  );
  return {
    enabled: node.values.enabled !== false,
    areaCenterX: numberOrNull(node.values.areaCenterX) ?? 0,
    areaCenterZ: numberOrNull(node.values.areaCenterZ) ?? 0,
    areaWidth: Math.max(0, numberOrNull(node.values.areaWidth) ?? 0),
    areaDepth: Math.max(0, numberOrNull(node.values.areaDepth) ?? 0),
    areaRotationY: numberOrNull(node.values.areaRotationY) ?? 0,
    count: Math.max(0, Math.floor(numberOrNull(node.values.count) ?? 0)),
    sourceAssetIds: normalizeNodeIdList(node.values.sourceAssetIds),
    sourceNodeIds: normalizeNodeIdList(node.values.sourceNodeIds),
    randomObjectSelection: node.values.randomObjectSelection === true,
    boundaryBlocksPlayer: node.values.boundaryBlocksPlayer === true,
    minSpacing: minSpacing,
    edgeSpacing: edgeSpacing,
    spacingStrength: normalizeScatterPercent(node.values.spacingStrength, 0),
    edgeJitter: normalizeScatterPercent(node.values.edgeJitter, 20),
    distributionMode: normalizeScatterDistributionMode(node.values.distributionMode),
    sourceScaleMultipliers: sourceScaleMultipliers,
    seed: String(node.values.seed || ""),
    edgeDensity: normalizeScatterPercent(node.values.edgeDensity, 0),
    scaleMin: Math.min(scaleMin, scaleMax),
    scaleMax: Math.max(scaleMin, scaleMax),
    sizeInwardInfluence: normalizeScatterPercent(node.values.sizeInwardInfluence, 0),
    sizeCurve: normalizeScatterCurve(node.values.sizeCurve),
    rotationYMin: Math.min(rotationYMin, rotationYMax),
    rotationYMax: Math.max(rotationYMin, rotationYMax),
    points: points
  };
}

function resolveScatterSources(node, nodeMap, services, errors, labelPrefix) {
  const settings = normalizeScatterSettings(node);
  const assetService = services?.assetService || null;
  const resolvedSourceAssets = [];
  const resolvedSourceNodeIds = [];
  const sourceAssetIds = [];
  const explicitAssetIds = settings.sourceAssetIds.slice();
  const legacySourceNodeIds = settings.sourceNodeIds.slice();
  const selectedAssetIds = explicitAssetIds.length ? explicitAssetIds : legacySourceNodeIds.map(function (sourceId) {
    const source = nodeMap.get(sourceId);
    if (!source) {
      errors.push((labelPrefix || "Scatter") + " verwijst naar onbekende bron node " + sourceId + ".");
      return null;
    }
    if (source.type !== "model_entity") {
      errors.push((labelPrefix || "Scatter") + " bron node " + sourceId + " is geen Model Entity.");
      return null;
    }
    if (!source.values.modelAssetId) {
      errors.push((labelPrefix || "Scatter") + " bron node " + sourceId + " mist een Model asset.");
      return null;
    }
    resolvedSourceNodeIds.push(sourceId);
    return source.values.modelAssetId;
  }).filter(Boolean);

  for (const assetId of selectedAssetIds) {
    if (sourceAssetIds.includes(assetId)) continue;
    sourceAssetIds.push(assetId);
    const asset = assetService ? assetService.get(assetId) : null;
    if (!asset) {
      errors.push((labelPrefix || "Scatter") + " verwijst naar onbekende asset " + assetId + ".");
      continue;
    }
    if (asset.assetType !== "model") {
      errors.push((labelPrefix || "Scatter") + " verwacht een model asset maar kreeg " + asset.assetType + ".");
      continue;
    }
    resolvedSourceAssets.push(asset);
  }
  if (!explicitAssetIds.length) {
    for (const sourceId of resolvedSourceNodeIds) {
      const source = nodeMap.get(sourceId);
      if (!source?.values?.modelAssetId) continue;
      if (!sourceAssetIds.includes(source.values.modelAssetId)) sourceAssetIds.push(source.values.modelAssetId);
    }
  } else {
    resolvedSourceNodeIds.push.apply(resolvedSourceNodeIds, legacySourceNodeIds);
  }
  return {
    sourceAssetIds: sourceAssetIds,
    sourceAssets: resolvedSourceAssets,
    sourceNodeIds: resolvedSourceNodeIds.length ? Array.from(new Set(resolvedSourceNodeIds)) : legacySourceNodeIds
  };
}

function buildScatterAreaReadModel(node, resolvedSources, placementInfo = {}) {
  const settings = normalizeScatterSettings(node);
  const sourceAssets = Array.isArray(resolvedSources?.sourceAssets) ? resolvedSources.sourceAssets : [];
  const points = scatterPointsForSettings(settings);
  const placementWarnings = Array.isArray(placementInfo?.placementWarnings) ? placementInfo.placementWarnings.filter(Boolean) : [];
  const sourceScaleMultipliers = Object.keys(settings.sourceScaleMultipliers || {}).sort().reduce(function (result, sourceId) {
    const multiplier = scatterSourceScaleMultiplier(settings, sourceId);
    if (Number.isFinite(multiplier)) result[sourceId] = multiplier;
    return result;
  }, {});
  return {
    id: node.id,
    scatterId: node.values.scatterId,
    enabled: settings.enabled,
    boundaryBlocksPlayer: settings.boundaryBlocksPlayer,
    minSpacing: settings.minSpacing,
    edgeSpacing: settings.edgeSpacing,
    spacingStrength: settings.spacingStrength,
    edgeJitter: settings.edgeJitter,
    distributionMode: settings.distributionMode,
    areaCenterX: settings.areaCenterX,
    areaCenterZ: settings.areaCenterZ,
    areaWidth: settings.areaWidth,
    areaDepth: settings.areaDepth,
    areaRotationY: settings.areaRotationY,
    count: settings.count,
    requestedCount: settings.count,
    placedCount: numberOrNull(placementInfo?.placedCount) ?? null,
    sourceNodeIds: Array.from(new Set((resolvedSources?.sourceNodeIds || settings.sourceNodeIds || []).filter(Boolean))).sort(),
    sourceAssetIds: Array.from(new Set([
      ...settings.sourceAssetIds,
      ...sourceAssets.map(function (source) { return source.id; }).filter(Boolean),
      ...(resolvedSources?.sourceAssetIds || [])
    ].filter(Boolean))).sort(),
    sourceScaleMultipliers: sourceScaleMultipliers,
    randomObjectSelection: settings.randomObjectSelection,
    seed: settings.seed,
    edgeDensity: settings.edgeDensity,
    scaleMin: settings.scaleMin,
    scaleMax: settings.scaleMax,
    sizeInwardInfluence: settings.sizeInwardInfluence,
    sizeCurve: settings.sizeCurve,
    rotationYMin: settings.rotationYMin,
    rotationYMax: settings.rotationYMax,
    placementWarnings: placementWarnings,
    points: points
  };
}

function buildLegacyScatterInstances(node, sourceAssets, groundY) {
  const settings = normalizeScatterSettings(node);
  const sourceList = Array.isArray(sourceAssets) ? sourceAssets.slice().sort(function (left, right) {
    return String(left.id || "").localeCompare(String(right.id || ""));
  }) : [];
  if (!settings.enabled || !settings.count || !sourceList.length) return [];
  const points = scatterPointsForSettings(settings);
  const bounds = scatterPointBounds(points);
  const sourceIds = sourceList.map(function (source) { return source.id; });
  const random = createDeterministicRandom(scatterSettingsSeed(Object.assign({}, settings, { edgeDensity: 0 }), sourceIds));
  const edgeDensity = settings.edgeDensity / 100;
  const edgeRandom = settings.edgeDensity > 0 && settings.edgeDensity < 100
    ? createDeterministicRandom(scatterSettingsSeed(settings, sourceIds))
    : null;
  const sizeInfluence = settings.sizeInwardInfluence / 100;
  const scatterCenter = scatterInteriorAnchor(points, bounds);
  const scatterCenterBoundary = closestPointOnPolygonBoundary(scatterCenter.x, scatterCenter.z, points);
  const scatterCenterDepth = scatterCenterBoundary ? Math.sqrt(scatterCenterBoundary.distanceSq) : 0;
  const instances = [];
  const samplePointInPolygon = function () {
    if (!bounds) return { x: settings.areaCenterX, z: settings.areaCenterZ };
    const width = Math.max(0.000001, bounds.maxX - bounds.minX);
    const depth = Math.max(0.000001, bounds.maxZ - bounds.minZ);
    for (let attempt = 0; attempt < 96; attempt += 1) {
      const x = bounds.minX + (width * random());
      const z = bounds.minZ + (depth * random());
      if (pointInPolygon2D(x, z, points)) return { x, z };
    }
    return { x: bounds.centerX, z: bounds.centerZ };
  };
  for (let index = 0; index < settings.count; index += 1) {
    const sourceIndex = settings.randomObjectSelection && sourceList.length > 1
      ? Math.floor(random() * sourceList.length) % sourceList.length
      : index % sourceList.length;
    const source = sourceList[sourceIndex];
    const innerPosition = samplePointInPolygon();
    let position = innerPosition;
    if (settings.edgeDensity >= 100) {
      const boundaryPosition = closestPointOnPolygonBoundary(innerPosition.x, innerPosition.z, points);
      if (boundaryPosition) position = { x: boundaryPosition.x, z: boundaryPosition.z };
    } else if (settings.edgeDensity > 0 && edgeRandom && edgeRandom() < edgeDensity) {
      const boundaryPosition = closestPointOnPolygonBoundary(innerPosition.x, innerPosition.z, points);
      if (boundaryPosition) position = { x: boundaryPosition.x, z: boundaryPosition.z };
    }
    const randomScale = Math.max(0.001, settings.scaleMin + ((settings.scaleMax - settings.scaleMin) * random()));
    let scale = randomScale;
    if (settings.sizeInwardInfluence > 0 && scatterCenterDepth > SCATTER_EDGE_EPSILON) {
      const positionBoundary = closestPointOnPolygonBoundary(position.x, position.z, points);
      const positionDepth = positionBoundary ? Math.sqrt(positionBoundary.distanceSq) : 0;
      const normalizedDepth = clamp01(positionDepth / scatterCenterDepth);
      const curvedDepth = scatterSizeCurveValue(settings.sizeCurve, normalizedDepth);
      const deterministicScale = lerpNumber(settings.scaleMin, settings.scaleMax, curvedDepth);
      scale = lerpNumber(randomScale, deterministicScale, sizeInfluence);
    }
    const scaleMultiplier = scatterSourceScaleMultiplier(settings, source.id);
    const rotationY = settings.rotationYMin + ((settings.rotationYMax - settings.rotationYMin) * random());
    const defaultAnimation = source.metadata?.defaultAnimation || null;
    instances.push({
      id: node.id + "::" + index,
      nodeId: node.id,
      scatterId: node.values.scatterId || node.id,
      type: "scatter",
      kind: "scatter",
      sourceNodeId: null,
      sourceAssetId: source.id,
      label: source.name || source.id,
      modelAssetId: source.id,
      animationClip: defaultAnimation,
      idleAnimation: defaultAnimation,
      walkAnimation: null,
      runAnimation: null,
      solid: false,
      walkable: true,
      collisionRadius: null,
      transform: {
        position: {
          x: position.x,
          y: groundY,
          z: position.z
        },
        rotation: {
          x: 0,
          y: rotationY,
          z: 0
        },
        scale: {
          x: scale * scaleMultiplier,
          y: scale * scaleMultiplier,
          z: scale * scaleMultiplier
        }
      }
    });
  }
  return instances;
}

function buildScatterInstances(node, sourceAssets, groundY) {
  const settings = normalizeScatterSettings(node);
  const sourceList = Array.isArray(sourceAssets) ? sourceAssets.slice().sort(function (left, right) {
    return String(left.id || "").localeCompare(String(right.id || ""));
  }) : [];
  const emptyInstances = [];
  emptyInstances.placementWarnings = [];
  emptyInstances.placedCount = 0;
  emptyInstances.requestedCount = settings.count;
  if (!settings.enabled || !settings.count || !sourceList.length) return emptyInstances;

  const points = scatterPointsForSettings(settings);
  const bounds = scatterPointBounds(points);
  const sourceIds = sourceList.map(function (source) { return source.id; });
  const legacyMode = settings.spacingStrength === 0
    && settings.distributionMode === "random"
    && settings.edgeDensity === 0;
  if (legacyMode) {
    const legacyInstances = buildLegacyScatterInstances(node, sourceAssets, groundY);
    legacyInstances.placementWarnings = [];
    legacyInstances.placedCount = legacyInstances.length;
    legacyInstances.requestedCount = settings.count;
    return legacyInstances;
  }

  const random = createDeterministicRandom(scatterSettingsSeed(settings, sourceIds));
  const instances = [];
  const accepted = [];
  const placementWarnings = [];
  const scatterCenter = scatterInteriorAnchor(points, bounds);
  const scatterCenterBoundary = closestPointOnPolygonBoundary(scatterCenter.x, scatterCenter.z, points);
  const scatterCenterDepth = scatterCenterBoundary ? Math.sqrt(scatterCenterBoundary.distanceSq) : 0;
  const polygonPerimeterValue = polygonPerimeter(points);
  const spacingStrengthFactor = clamp01(settings.spacingStrength / 100);
  const spacingBase = Math.max(0.5, Math.max(settings.minSpacing, settings.edgeSpacing || settings.minSpacing, 1));
  const spacingCellSize = Math.max(0.5, spacingBase * Math.max(spacingStrengthFactor, 0.5));
  const spacingGrid = new Map();

  function spacingGridKey(x, z) {
    return Math.floor(x / spacingCellSize) + ":" + Math.floor(z / spacingCellSize);
  }

  function nearbyAcceptedFor(candidate, candidateSpacing) {
    if (candidateSpacing <= SCATTER_EDGE_EPSILON || accepted.length < 4) return accepted;
    const range = Math.max(1, Math.ceil(candidateSpacing / spacingCellSize));
    const cellX = Math.floor(candidate.x / spacingCellSize);
    const cellZ = Math.floor(candidate.z / spacingCellSize);
    const nearby = [];
    for (let offsetX = -range; offsetX <= range; offsetX += 1) {
      for (let offsetZ = -range; offsetZ <= range; offsetZ += 1) {
        const bucket = spacingGrid.get((cellX + offsetX) + ":" + (cellZ + offsetZ));
        if (bucket && bucket.length) nearby.push.apply(nearby, bucket);
      }
    }
    return nearby.length ? nearby : accepted;
  }

  function registerAccepted(candidate) {
    const entry = {
      x: candidate.x,
      z: candidate.z,
      spacing: candidate.spacing
    };
    accepted.push(entry);
    const key = spacingGridKey(entry.x, entry.z);
    if (!spacingGrid.has(key)) spacingGrid.set(key, []);
    spacingGrid.get(key).push(entry);
  }

  function sampleInteriorCandidate() {
    if (!bounds) return { x: settings.areaCenterX, z: settings.areaCenterZ };
    const width = Math.max(SCATTER_EDGE_EPSILON, bounds.maxX - bounds.minX);
    const depth = Math.max(SCATTER_EDGE_EPSILON, bounds.maxZ - bounds.minZ);
    for (let attempt = 0; attempt < 96; attempt += 1) {
      const x = bounds.minX + (width * random());
      const z = bounds.minZ + (depth * random());
      if (pointInPolygon2D(x, z, points)) return { x, z };
    }
    return { x: bounds.centerX, z: bounds.centerZ };
  }

  function makeEdgeCandidate(anchor, factor) {
    if (!anchor) return sampleInteriorCandidate();
    const jitterScale = Math.max(0, settings.edgeJitter) / 100;
    const span = Math.max(SCATTER_EDGE_EPSILON, Math.min(anchor?.segment?.length || 0, polygonPerimeterValue / Math.max(1, settings.count)) || 0.0001);
    const tangentRange = span * 0.25 * jitterScale * factor;
    const inwardRange = span * 0.08 * jitterScale * factor;
    const tangentOffset = (random() * 2 - 1) * tangentRange;
    const inwardOffset = inwardRange * (0.5 + (random() * 0.5));
    return {
      x: anchor.x + ((anchor.tangentX || 0) * tangentOffset) + ((anchor.inwardX || 0) * inwardOffset),
      z: anchor.z + ((anchor.tangentZ || 0) * tangentOffset) + ((anchor.inwardZ || 0) * inwardOffset),
      isEdge: true
    };
  }

  const edgeDensity = clamp01(settings.edgeDensity / 100);
  const boundaryCount = settings.edgeDensity > 0
    ? Math.min(settings.count, Math.max(1, Math.round(settings.count * edgeDensity)))
    : 0;
  const slotKinds = new Array(settings.count).fill("interior");
  if (boundaryCount > 0) {
    const slotOffset = deterministicShuffleOrOffset(random) % Math.max(1, settings.count);
    for (let boundarySlot = 0; boundarySlot < boundaryCount; boundarySlot += 1) {
      const slotIndex = (slotOffset + Math.floor((boundarySlot * settings.count) / boundaryCount)) % settings.count;
      slotKinds[slotIndex] = "edge";
    }
  }

  const boundaryAnchors = [];
  if (boundaryCount > 0) {
    if (polygonPerimeterValue > SCATTER_EDGE_EPSILON) {
      const boundaryStartDistance = random() * polygonPerimeterValue;
      const boundaryStep = polygonPerimeterValue / boundaryCount;
      for (let boundaryIndex = 0; boundaryIndex < boundaryCount; boundaryIndex += 1) {
        const anchor = pointAtBoundaryDistance(points, boundaryStartDistance + (boundaryStep * boundaryIndex));
        if (anchor) boundaryAnchors.push(anchor);
      }
    }
  }

  const denseFillCandidates = [];
  let denseFillCursor = 0;
  if (settings.distributionMode === "dense_fill" && bounds) {
    const denseArea = Math.max(SCATTER_EDGE_EPSILON, bounds.width * bounds.depth);
    const denseCellSize = Math.max(0.5, settings.minSpacing > 0 ? settings.minSpacing : Math.sqrt(denseArea / Math.max(1, settings.count)));
    const cols = Math.max(1, Math.ceil(Math.max(bounds.width, SCATTER_EDGE_EPSILON) / denseCellSize));
    const rows = Math.max(1, Math.ceil(Math.max(bounds.depth, SCATTER_EDGE_EPSILON) / denseCellSize));
    const cellWidth = Math.max(SCATTER_EDGE_EPSILON, bounds.width / cols);
    const cellDepth = Math.max(SCATTER_EDGE_EPSILON, bounds.depth / rows);
    const totalCells = cols * rows;
    const cellOffset = deterministicShuffleOrOffset(random) % Math.max(1, totalCells);
    for (let cellAttempt = 0; cellAttempt < totalCells && denseFillCandidates.length < settings.count; cellAttempt += 1) {
      const cellIndex = (cellAttempt + cellOffset) % totalCells;
      const col = cellIndex % cols;
      const row = Math.floor(cellIndex / cols);
      const candidate = {
        x: bounds.minX + (cellWidth * col) + (cellWidth * random()),
        z: bounds.minZ + (cellDepth * row) + (cellDepth * random())
      };
      if (pointInPolygon2D(candidate.x, candidate.z, points)) denseFillCandidates.push(candidate);
    }
  }

  const attemptFactors = settings.distributionMode === "dense_fill"
    ? [1, 0.85, 0.7, 0.5]
    : [1, 0.75, 0.5, 0.25];
  const attemptsPerFactor = 16;
  const sourceCount = sourceList.length;
  let boundaryCursor = 0;
  let placedCount = 0;

  for (let slotIndex = 0; slotIndex < settings.count; slotIndex += 1) {
    const isEdgeSlot = slotKinds[slotIndex] === "edge" && boundaryCursor < boundaryAnchors.length;
    const sourceIndex = settings.randomObjectSelection && sourceCount > 1
      ? Math.floor(random() * sourceCount) % sourceCount
      : slotIndex % sourceCount;
    const source = sourceList[sourceIndex];
    let acceptedCandidate = null;
    let usedDenseFillCandidate = false;

    for (let factorIndex = 0; factorIndex < attemptFactors.length && !acceptedCandidate; factorIndex += 1) {
      const factor = attemptFactors[factorIndex];
      for (let attemptIndex = 0; attemptIndex < attemptsPerFactor && !acceptedCandidate; attemptIndex += 1) {
        let candidate = null;
        if (isEdgeSlot) {
          candidate = makeEdgeCandidate(boundaryAnchors[boundaryCursor], factor);
        } else if (settings.distributionMode === "dense_fill" && !usedDenseFillCandidate && denseFillCursor < denseFillCandidates.length) {
          candidate = denseFillCandidates[denseFillCursor];
          denseFillCursor += 1;
          usedDenseFillCandidate = true;
        } else {
          candidate = sampleInteriorCandidate();
        }
        if (!candidate) continue;
        if (!isEdgeSlot && !pointInPolygon2D(candidate.x, candidate.z, points)) continue;
        const candidateSpacing = candidateSpacingFor(settings, candidate, isEdgeSlot) * factor;
        candidate.spacing = candidateSpacing;
        const nearby = nearbyAcceptedFor(candidate, candidateSpacing);
        if (!isFarEnough(candidate, nearby, candidateSpacing)) continue;
        acceptedCandidate = candidate;
      }
    }

    if (!acceptedCandidate) {
      if (isEdgeSlot) boundaryCursor += 1;
      continue;
    }

    if (isEdgeSlot) boundaryCursor += 1;
    registerAccepted(acceptedCandidate);

    const randomScale = Math.max(0.001, settings.scaleMin + ((settings.scaleMax - settings.scaleMin) * random()));
    let scale = randomScale;
    if (settings.sizeInwardInfluence > 0 && scatterCenterDepth > SCATTER_EDGE_EPSILON) {
      const positionBoundary = closestPointOnPolygonBoundary(acceptedCandidate.x, acceptedCandidate.z, points);
      const positionDepth = positionBoundary ? Math.sqrt(positionBoundary.distanceSq) : 0;
      const normalizedDepth = clamp01(positionDepth / scatterCenterDepth);
      const curvedDepth = scatterSizeCurveValue(settings.sizeCurve, normalizedDepth);
      const deterministicScale = lerpNumber(settings.scaleMin, settings.scaleMax, curvedDepth);
      scale = lerpNumber(randomScale, deterministicScale, settings.sizeInwardInfluence / 100);
    }
    const scaleMultiplier = scatterSourceScaleMultiplier(settings, source.id);
    const rotationY = settings.rotationYMin + ((settings.rotationYMax - settings.rotationYMin) * random());
    const defaultAnimation = source.metadata?.defaultAnimation || null;
    instances.push({
      id: node.id + "::" + slotIndex,
      nodeId: node.id,
      scatterId: node.values.scatterId || node.id,
      type: "scatter",
      kind: "scatter",
      sourceNodeId: null,
      sourceAssetId: source.id,
      label: source.name || source.id,
      modelAssetId: source.id,
      animationClip: defaultAnimation,
      idleAnimation: defaultAnimation,
      walkAnimation: null,
      runAnimation: null,
      solid: false,
      walkable: true,
      collisionRadius: null,
      transform: {
        position: {
          x: acceptedCandidate.x,
          y: groundY,
          z: acceptedCandidate.z
        },
        rotation: {
          x: 0,
          y: rotationY,
          z: 0
        },
        scale: {
          x: scale * scaleMultiplier,
          y: scale * scaleMultiplier,
          z: scale * scaleMultiplier
        }
      }
    });
    placedCount += 1;
  }

  if (placedCount < settings.count) {
    placementWarnings.push("Scatter '" + (node.values.scatterId || node.id) + "' could only place " + placedCount + " of " + settings.count + " instances with distribution mode '" + settings.distributionMode + "'.");
  }

  instances.placementWarnings = placementWarnings;
  instances.placedCount = placedCount;
  instances.requestedCount = settings.count;
  return instances;
}

function buildScatterBoundaryBlockerReadModel(node, settings) {
  const points = scatterPointsForSettings(settings);
  const bounds = scatterPointBounds(points);
  return {
    id: node.id + "::boundary",
    label: node.values.label || node.values.scatterId || node.id,
    shapeType: "polygon",
    x: bounds ? bounds.centerX : settings.areaCenterX,
    z: bounds ? bounds.centerZ : settings.areaCenterZ,
    width: bounds ? bounds.width : settings.areaWidth,
    depth: bounds ? bounds.depth : settings.areaDepth,
    radius: null,
    points: points,
    reason: node.values.scatterId || node.id
  };
}

function modeDefaultsFromNodeType(type, mode) {
  const prefix = mode === "editor" ? "editor" : "game";
  const prefixLength = prefix.length;
  const defaults = defaultValuesForType(type);
  const modeDefaults = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (!key.startsWith(prefix) || key.length <= prefixLength) continue;
    const suffix = key.slice(prefixLength);
    const normalizedKey = suffix.charAt(0).toLowerCase() + suffix.slice(1);
    modeDefaults[normalizedKey] = value;
  }
  return modeDefaults;
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
      showScatterInstances: node.values.showScatterInstances !== false,
      showTerrainVisuals: node.values.showTerrainVisuals !== false,
      showCollisionShapes: node.values.showCollisionShapes !== false,
      showWorldSize: node.values.showWorldSize === true,
      showChunkCulling: node.values.showChunkCulling === true,
      showRemoteSyncMs: node.values.showRemoteSyncMs !== false,
      showMovementStepMs: node.values.showMovementStepMs !== false,
      showMinimapDrawMs: node.values.showMinimapDrawMs !== false
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

function buildMmoDebugHudReadModel(node) {
  return {
    id: node.values.hudId,
    type: "debug_mmo_hud",
    enabled: node.values.enabled !== false,
    anchor: node.values.anchor,
    compact: node.values.compact !== false,
    startCollapsed: node.values.startCollapsed !== false,
    show: {
      wsStatus: node.values.showWsStatus !== false,
      user: node.values.showUser !== false,
      player: node.values.showPlayer !== false,
      session: node.values.showSession !== false,
      position: node.values.showPosition !== false,
      revision: node.values.showRevision !== false,
      sessions: node.values.showSessions !== false,
      lastSent: node.values.showLastSent !== false,
      lastSentSeq: node.values.showLastSentSeq !== false,
      lastAckedSeq: node.values.showLastAckedSeq !== false,
      pendingInputs: node.values.showPendingInputs !== false,
      controller: node.values.showController !== false,
      lastTransport: node.values.showLastTransport !== false,
      lastIgnored: node.values.showLastIgnored !== false,
      serverSeq: node.values.showServerSeq !== false,
      lastReceived: node.values.showLastReceived !== false,
      lastSource: node.values.showLastSource !== false,
      lastError: node.values.showLastError !== false,
      wsRawState: node.values.showWsRawState !== false,
      wsVisibleState: node.values.showWsVisibleState !== false,
      reconnectAttempt: node.values.showReconnectAttempt !== false,
      reconnectSuppressedCount: node.values.showReconnectSuppressedCount !== false,
      lastClose: node.values.showLastClose !== false,
      lastConnected: node.values.showLastConnected !== false,
      lastDisconnected: node.values.showLastDisconnected !== false,
      ping: node.values.showPing !== false,
      avgPing: node.values.showAvgPing !== false,
      jitter: node.values.showJitter !== false,
      lastPongAge: node.values.showLastPongAge !== false,
      packetAge: node.values.showPacketAge !== false,
      remoteBufferSizes: node.values.showRemoteBufferSizes !== false,
      remoteHardSnapCount: node.values.showRemoteHardSnapCount !== false,
      remoteSmoothFrameCount: node.values.showRemoteSmoothFrameCount !== false,
      lastRemoteEventType: node.values.showLastRemoteEventType !== false
    }
  };
}

function buildUiReadModel(node) {
  if (node.type === "debug_performance_hud") return buildPerformanceHudReadModel(node);
  if (node.type === "debug_mmo_hud") return buildMmoDebugHudReadModel(node);
  return buildHudTextReadModel(node);
}

// Fase 9.0: the published read-model splits visible settings from one canonical shadow block.
// New editor/game nodes publish `performance.<mode>.shadow`; legacy flat shadow fields are only
// read when migrating old worlds and are otherwise ignored.
function buildWorldPerformanceReadModel(worldNode, editorWorldSettingsNode = null, gameWorldSettingsNode = null) {
  const sharedDefaults = defaultValuesForType("world_settings");
  const editorDefaults = modeDefaultsFromNodeType("editor_world_settings", "editor");
  const gameDefaults = modeDefaultsFromNodeType("game_world_settings", "game");
  const sharedSource = worldNode?.values || {};
  const legacySource = !editorWorldSettingsNode && !gameWorldSettingsNode ? sharedSource : {};
  const editorSource = editorWorldSettingsNode?.values || legacySource;
  const gameSource = gameWorldSettingsNode?.values || legacySource;

  function buildShadowReadModel(mode, sourceValues, fallbackPreset) {
    const prefix = mode === "editor" ? "editor" : "game";
    const source = sourceValues || {};
    const shadowSource = source.shadow && typeof source.shadow === "object" ? source.shadow : null;
    const hasLegacyFields = hasLegacyShadowFields(source, prefix);
    const explicitPresetValue = shadowSource?.preset ?? shadowLegacyField(source, prefix, "preset") ?? source[prefix + "Preset"];
    const explicitPreset = explicitPresetValue === undefined || explicitPresetValue === null || String(explicitPresetValue).trim() === ""
      ? null
      : normalizeWorldSettingsPreset(explicitPresetValue, fallbackPreset);
    const resolvedPreset = explicitPreset !== null
      ? explicitPreset
      : (shadowSource
        ? normalizeWorldSettingsPreset(fallbackPreset, "middel_schaduw")
        : (hasLegacyFields ? inferShadowPresetFromLegacyFields(source, prefix, fallbackPreset) : normalizeWorldSettingsPreset(fallbackPreset, "middel_schaduw")));
    const presetValues = worldSettingsPresetValues(mode, resolvedPreset) || worldSettingsPresetValues(mode, fallbackPreset) || {};
    const readShadow = function (key, legacyKey, fallback) {
      if (shadowSource && shadowSource[key] !== undefined) return shadowSource[key];
      if (presetValues[key] !== undefined) return presetValues[key];
      return fallback;
    };
    const shadow = {
      preset: resolvedPreset,
      enabled: resolvedPreset !== "geen_schaduw",
      mapSize: Math.max(0, Math.floor(numberOrFallback(readShadow("mapSize", "shadowMapSize", 0), 0))),
      cameraSize: Math.max(0, numberOrFallback(readShadow("cameraSize", "shadowCameraSize", 0), 0)),
      cameraNear: Math.max(0, numberOrFallback(readShadow("cameraNear", "shadowCameraNear", 1), 1) || 1),
      cameraFar: Math.max(0, numberOrFallback(readShadow("cameraFar", "shadowCameraFar", 0), 0)),
      bias: numberOrFallback(readShadow("bias", "shadowBias", -0.0003), -0.0003),
      normalBias: numberOrFallback(readShadow("normalBias", "shadowNormalBias", 0.04), 0.04),
      type: normalizeShadowMapTypeName(readShadow("type", "shadowType", presetValues.type || "pcf_soft"), presetValues.type || "pcf_soft"),
      updateMode: String(readShadow("updateMode", "shadowUpdateMode", presetValues.updateMode || "stable_snapped") || "stable_snapped").trim() || "stable_snapped",
      snapWorldUnits: Math.max(1, Math.floor(numberOrFallback(readShadow("snapWorldUnits", "shadowSnapWorldUnits", presetValues.snapWorldUnits || 10), presetValues.snapWorldUnits || 10))),
      focusMode: String(readShadow("focusMode", "shadowFocusMode", presetValues.focusMode || (mode === "editor" ? "editor_world_center_or_selected" : "player_or_spawn")) || (mode === "editor" ? "editor_world_center_or_selected" : "player_or_spawn")).trim() || (mode === "editor" ? "editor_world_center_or_selected" : "player_or_spawn"),
      staticPropsCast: readShadow("staticPropsCast", "staticPropCastShadows", presetValues.staticPropsCast === true) === true,
      staticPropsReceive: readShadow("staticPropsReceive", "staticPropReceiveShadows", presetValues.staticPropsReceive !== false) !== false,
      scatterCast: readShadow("scatterCast", "scatterCastShadows", presetValues.scatterCast === true) === true,
      scatterReceive: readShadow("scatterReceive", "scatterReceiveShadows", presetValues.scatterReceive !== false) !== false,
      groundReceives: readShadow("groundReceives", "groundReceiveShadows", presetValues.groundReceives !== false) !== false,
      terrainReceives: readShadow("terrainReceives", "terrainReceiveShadows", presetValues.terrainReceives !== false) !== false,
      shadowResidentMarginChunks: Math.max(0, Math.floor(numberOrFallback(readShadow("shadowResidentMarginChunks", "shadowResidentMarginChunks", presetValues.shadowResidentMarginChunks || 0), presetValues.shadowResidentMarginChunks || 0)))
    };
    return {
      shadow: shadow,
      legacyFieldsIgnored: Boolean(hasLegacyFields)
    };
  }

  function buildModeReadModel(mode, sourceValues, defaults) {
    const prefix = mode === "editor" ? "editor" : "game";
    const source = sourceValues || {};
    const explicitPreset = hasOwnValue(source, prefix + "Preset")
      ? normalizeWorldSettingsPreset(source[prefix + "Preset"], defaults.preset || "middel_schaduw")
      : null;
    const seedPreset = explicitPreset || defaults.preset || "middel_schaduw";
    const shadowState = buildShadowReadModel(mode, source, seedPreset);
    const preset = explicitPreset || shadowState.shadow.preset;
    return {
      preset: preset,
      pixelRatioCap: numberOrFallback(source[prefix + "PixelRatioCap"], defaults.pixelRatioCap),
      antialias: source[prefix + "Antialias"] !== undefined ? source[prefix + "Antialias"] === true : defaults.antialias === true,
      fogEnabled: source[prefix + "FogEnabled"] !== undefined ? source[prefix + "FogEnabled"] === true : defaults.fogEnabled === true,
      maxFps: numberOrFallback(source[prefix + "MaxFps"], defaults.maxFps),
      debugHelpersVisible: source[prefix + "DebugHelpersVisible"] !== undefined ? source[prefix + "DebugHelpersVisible"] === true : defaults.debugHelpersVisible === true,
      debugWarningsVisible: source[prefix + "DebugWarningsVisible"] !== undefined ? source[prefix + "DebugWarningsVisible"] === true : defaults.debugWarningsVisible === true,
      debugChunkOverlayVisible: source[prefix + "DebugChunkOverlayVisible"] !== undefined ? source[prefix + "DebugChunkOverlayVisible"] === true : defaults.debugChunkOverlayVisible === true,
      chunkGridVisible: source[prefix + "ChunkGridVisible"] !== undefined ? source[prefix + "ChunkGridVisible"] === true : defaults.chunkGridVisible === true,
      chunkLabelsVisible: source[prefix + "ChunkLabelsVisible"] !== undefined ? source[prefix + "ChunkLabelsVisible"] === true : defaults.chunkLabelsVisible === true,
      streamingDebugVisible: source[prefix + "StreamingDebugVisible"] !== undefined ? source[prefix + "StreamingDebugVisible"] === true : defaults.streamingDebugVisible === true,
      shadow: shadowState.shadow
    };
  }

  const usedLegacyWorldSettingsPerformanceFields = Boolean(
    hasLegacyShadowFields(sharedSource, "") ||
    hasLegacyShadowFields(editorSource, "editor") ||
    hasLegacyShadowFields(gameSource, "game")
  );

  return {
    shared: {
      worldId: sharedSource.worldId ?? sharedDefaults.worldId,
      displayName: sharedSource.displayName ?? sharedDefaults.displayName,
      backgroundColor: sharedSource.backgroundColor ?? sharedDefaults.backgroundColor,
      fogColor: sharedSource.fogColor ?? sharedDefaults.fogColor,
      fogDensity: numberOrFallback(sharedSource.fogDensity, sharedDefaults.fogDensity),
      smoothShading: sharedSource.smoothShading !== false
    },
    editor: buildModeReadModel("editor", editorSource, editorDefaults),
    game: buildModeReadModel("game", gameSource, gameDefaults),
    compatibility: {
      usedLegacyWorldSettingsPerformanceFields: usedLegacyWorldSettingsPerformanceFields,
      legacyShadowFieldsMigrated: usedLegacyWorldSettingsPerformanceFields
    }
  };
}

function buildGroundReadModel(node) {
  const values = Object.assign({}, defaultValuesForType("ground_surface"), node?.values || {});
  const boundsMode = String(values.boundsMode || "centerSize").trim() === "explicitBounds" ? "explicitBounds" : "centerSize";
  const width = numberOrFallback(values.width, defaultValuesForType("ground_surface").width);
  const depth = numberOrFallback(values.depth, defaultValuesForType("ground_surface").depth);
  const explicitMinX = numberOrNull(values.minX);
  const explicitMaxX = numberOrNull(values.maxX);
  const explicitMinZ = numberOrNull(values.minZ);
  const explicitMaxZ = numberOrNull(values.maxZ);
  const centeredMinX = -width / 2;
  const centeredMaxX = width / 2;
  const centeredMinZ = -depth / 2;
  const centeredMaxZ = depth / 2;
  const minX = boundsMode === "explicitBounds" && explicitMinX !== null && explicitMaxX !== null
    ? Math.min(explicitMinX, explicitMaxX)
    : centeredMinX;
  const maxX = boundsMode === "explicitBounds" && explicitMinX !== null && explicitMaxX !== null
    ? Math.max(explicitMinX, explicitMaxX)
    : centeredMaxX;
  const minZ = boundsMode === "explicitBounds" && explicitMinZ !== null && explicitMaxZ !== null
    ? Math.min(explicitMinZ, explicitMaxZ)
    : centeredMinZ;
  const maxZ = boundsMode === "explicitBounds" && explicitMinZ !== null && explicitMaxZ !== null
    ? Math.max(explicitMinZ, explicitMaxZ)
    : centeredMaxZ;
  const textureWorldSizeX = Math.max(0.01, numberOrFallback(values.textureWorldSizeX, 10));
  const textureWorldSizeZ = Math.max(0.01, numberOrFallback(values.textureWorldSizeZ, 10));
  return {
    id: values.groundId,
    width: Math.max(0.01, maxX - minX),
    depth: Math.max(0.01, maxZ - minZ),
    y: numberOrNull(values.y),
    materialColor: values.materialColor,
    textureAssetId: values.textureAssetId,
    textureRepeat: numberOrNull(values.textureRepeat),
    textureWorldSizeX: textureWorldSizeX,
    textureWorldSizeZ: textureWorldSizeZ,
    textureRepeatMode: "world",
    boundsMode: boundsMode,
    minX: minX,
    maxX: maxX,
    minZ: minZ,
    maxZ: maxZ
  };
}

function pushUniqueWarning(warnings, message) {
  if (!Array.isArray(warnings)) return;
  if (!warnings.includes(message)) warnings.push(message);
}

function buildChunkLoadingBaseReadModel(node, nodeType, readModelType) {
  const defaults = defaultValuesForType(nodeType);
  const values = Object.assign({}, defaults, node?.values || {});
  return {
    id: node.id,
    type: readModelType,
    chunkProfileId: stringOrFallback(values.chunkProfileId, defaults.chunkProfileId),
    enabled: values.enabled !== false,
    chunkWidth: numberOrFallback(values.chunkWidth, defaults.chunkWidth),
    chunkDepth: numberOrFallback(values.chunkDepth, defaults.chunkDepth),
    tileSize: numberOrFallback(values.tileSize, defaults.tileSize),
    preloadMarginChunks: numberOrFallback(values.preloadMarginChunks, defaults.preloadMarginChunks),
    unloadMarginChunks: numberOrFallback(values.unloadMarginChunks, defaults.unloadMarginChunks),
    maxLoadedChunks: numberOrFallback(values.maxLoadedChunks, defaults.maxLoadedChunks),
    debugOverlay: values.debugOverlay === true,
    residentEntityBudget: numberOrFallback(values.residentEntityBudget, defaults.residentEntityBudget),
    residentObjectBudget: numberOrFallback(values.residentObjectBudget, defaults.residentObjectBudget),
    residentScatterInstanceBudget: numberOrFallback(values.residentScatterInstanceBudget, defaults.residentScatterInstanceBudget),
    residentChunkBuildBudgetPerFrame: numberOrFallback(values.residentChunkBuildBudgetPerFrame, defaults.residentChunkBuildBudgetPerFrame),
    groundChunkingEnabled: values.groundChunkingEnabled !== false,
    pathWaterSurfaceChunkingEnabled: values.pathWaterSurfaceChunkingEnabled === true,
    terrainVisualChunkingEnabled: values.terrainVisualChunkingEnabled === true
  };
}

function buildEditorChunkLoadingReadModel(node) {
  const base = buildChunkLoadingBaseReadModel(node, "editor_chunk_loading", "editor");
  const values = Object.assign({}, defaultValuesForType("editor_chunk_loading"), node?.values || {});
  return Object.assign(base, {
    editorViewRadiusChunks: numberOrFallback(values.editorViewRadiusChunks, defaultValuesForType("editor_chunk_loading").editorViewRadiusChunks),
    keepSelectedChunkLoaded: values.keepSelectedChunkLoaded !== false,
    showChunkGrid: values.showChunkGrid !== false,
    showChunkLabels: values.showChunkLabels === true
  });
}

function buildGameChunkLoadingReadModel(node) {
  const defaults = defaultValuesForType("game_chunk_loading");
  const base = buildChunkLoadingBaseReadModel(node, "game_chunk_loading", "game");
  const values = Object.assign({}, defaults, node?.values || {});
  return Object.assign(base, {
    cameraOnly: values.cameraOnly !== false,
    gameViewRadiusChunks: numberOrFallback(values.gameViewRadiusChunks, defaults.gameViewRadiusChunks),
    cameraOffsetZChunks: numberOrFallback(values.cameraOffsetZChunks, defaults.cameraOffsetZChunks),
    fixedCameraPaddingTiles: numberOrFallback(values.fixedCameraPaddingTiles, defaults.fixedCameraPaddingTiles),
    strictUnloadOutsideCamera: values.strictUnloadOutsideCamera !== false,
    loadBudgetPerFrame: numberOrFallback(values.loadBudgetPerFrame, defaults.loadBudgetPerFrame)
  });
}

function collectChunkLoadingReadModel(nodes, warnings = []) {
  const editorNodes = [];
  const gameNodes = [];
  for (const node of nodes || []) {
    if (node.type === "editor_chunk_loading") editorNodes.push(node);
    else if (node.type === "game_chunk_loading") gameNodes.push(node);
  }
  if (editorNodes.length > 1) {
    pushUniqueWarning(warnings, "Er zijn meerdere Editor Chunk Loading nodes verbonden. De eerste wordt gebruikt.");
  }
  if (gameNodes.length > 1) {
    pushUniqueWarning(warnings, "Er zijn meerdere Game Chunk Loading nodes verbonden. De eerste wordt gebruikt.");
  }
  return {
    editor: editorNodes[0] ? buildEditorChunkLoadingReadModel(editorNodes[0]) : null,
    game: gameNodes[0] ? buildGameChunkLoadingReadModel(gameNodes[0]) : null
  };
}

function validateChunkLoadingReadModel(chunkLoading, warnings) {
  if (!chunkLoading) return;
  if (chunkLoading.editor && chunkLoading.game) {
    const editorRadius = numberOrNull(chunkLoading.editor.editorViewRadiusChunks);
    const gameRadius = numberOrNull(chunkLoading.game.gameViewRadiusChunks);
    if (editorRadius !== null && gameRadius !== null && editorRadius < gameRadius) {
      pushUniqueWarning(warnings, "Editor Chunk Loading radius is kleiner dan Game Chunk Loading radius; editor toont mogelijk minder dan game.");
    }
  }
  if (chunkLoading.game && chunkLoading.game.cameraOnly === false) {
    pushUniqueWarning(warnings, "Game Chunk Loading cameraOnly staat uit; dit kan meer chunks laden dan de vaste game camera nodig heeft.");
  }
  if (chunkLoading.game) {
    const game = chunkLoading.game;
    const chunkWidth = numberOrNull(game.chunkWidth);
    const chunkDepth = numberOrNull(game.chunkDepth);
    const tileSize = numberOrNull(game.tileSize);
    const chunkWorldWidth = Number.isFinite(chunkWidth) && Number.isFinite(tileSize) ? chunkWidth * tileSize : null;
    const chunkWorldDepth = Number.isFinite(chunkDepth) && Number.isFinite(tileSize) ? chunkDepth * tileSize : null;
    const minChunkTiles = Number.isFinite(chunkWidth) && Number.isFinite(chunkDepth)
      ? Math.max(1, Math.min(chunkWidth, chunkDepth))
      : null;
    const fixedCameraPaddingTiles = numberOrNull(game.fixedCameraPaddingTiles);
    const fixedCameraPaddingChunks = Number.isFinite(fixedCameraPaddingTiles) && Number.isFinite(minChunkTiles)
      ? Math.floor(fixedCameraPaddingTiles / minChunkTiles)
      : null;
    const gameViewRadiusChunks = numberOrNull(game.gameViewRadiusChunks);
    const preloadMarginChunks = numberOrNull(game.preloadMarginChunks);
    const unloadMarginChunks = numberOrNull(game.unloadMarginChunks);
    const activeRadiusChunks = Number.isFinite(gameViewRadiusChunks) && Number.isFinite(fixedCameraPaddingChunks)
      ? gameViewRadiusChunks + fixedCameraPaddingChunks
      : null;
    const loadedRadiusChunks = Number.isFinite(activeRadiusChunks) && Number.isFinite(preloadMarginChunks) && Number.isFinite(unloadMarginChunks)
      ? activeRadiusChunks + Math.max(preloadMarginChunks, unloadMarginChunks)
      : null;
    const requiredLoadedChunks = Number.isFinite(loadedRadiusChunks)
      ? Math.pow((loadedRadiusChunks * 2) + 1, 2)
      : null;
    const maxLoadedChunks = numberOrNull(game.maxLoadedChunks);
    if (game.enabled !== false && Number.isFinite(fixedCameraPaddingTiles) && fixedCameraPaddingTiles > 0 && Number.isFinite(minChunkTiles) && fixedCameraPaddingTiles < minChunkTiles) {
      pushUniqueWarning(warnings, "Game Chunk Loading camera padding is kleiner dan één hele chunk; dit heeft nog geen effect totdat je minstens één volledige chunk padding hebt.");
    }
    if (game.enabled !== false && Number.isFinite(requiredLoadedChunks) && Number.isFinite(maxLoadedChunks) && maxLoadedChunks < requiredLoadedChunks) {
      pushUniqueWarning(warnings, "Game Chunk Loading maxLoadedChunks is kleiner dan de actieve window (" + requiredLoadedChunks + " nodig, " + maxLoadedChunks + " ingesteld); de runtime zal chunks clippen en de cameraring niet volledig resident houden.");
    }
    const residentEntityBudget = numberOrNull(game.residentEntityBudget);
    const residentObjectBudget = numberOrNull(game.residentObjectBudget);
    const residentScatterBudget = numberOrNull(game.residentScatterInstanceBudget);
    if (game.enabled !== false && (residentEntityBudget === 0 || residentObjectBudget === 0 || residentScatterBudget === 0)) {
      pushUniqueWarning(warnings, "Game Chunk Loading resident budgets staan op 0; preload-chunks met content kunnen dan blijven pending tot ze direct zichtbaar worden.");
    }
  }
  for (const model of [chunkLoading.editor, chunkLoading.game]) {
    if (!model) continue;
    const preloadMarginChunks = numberOrNull(model.preloadMarginChunks);
    const unloadMarginChunks = numberOrNull(model.unloadMarginChunks);
    if (preloadMarginChunks !== null && unloadMarginChunks !== null && unloadMarginChunks < preloadMarginChunks) {
      pushUniqueWarning(warnings, "Chunk Loading unload margin is kleiner dan preload margin; chunks kunnen snel laden/lossen.");
    }
  }
}

// The minimap always bakes the entire Ground Surface as a single square (1:1) area, centered on
// the ground's own center. No bounds UI is exposed to Kevin; this is the only bounds computation.
export function squareGroundBounds(ground) {
  if (!ground) return null;
  const hasExplicitBounds = [ground.minX, ground.maxX, ground.minZ, ground.maxZ].every(Number.isFinite);
  let minX, maxX, minZ, maxZ;
  if (hasExplicitBounds) {
    const centerX = (ground.minX + ground.maxX) / 2;
    const centerZ = (ground.minZ + ground.maxZ) / 2;
    const groundWidth = ground.maxX - ground.minX;
    const groundDepth = ground.maxZ - ground.minZ;
    const side = Math.max(groundWidth, groundDepth, 0.01);
    minX = centerX - side / 2;
    maxX = centerX + side / 2;
    minZ = centerZ - side / 2;
    maxZ = centerZ + side / 2;
  } else {
    const width = numberOrFallback(ground.width, 60);
    const depth = numberOrFallback(ground.depth, 60);
    const side = Math.max(width, depth, 0.01);
    minX = -side / 2;
    maxX = side / 2;
    minZ = -side / 2;
    maxZ = side / 2;
  }
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

function buildMinimapBakeReadModel(node, groundNode) {
  const defaults = defaultValuesForType("minimap_bake");
  const values = Object.assign({}, defaults, node?.values || {});
  const bounds = groundNode ? squareGroundBounds(buildGroundReadModel(groundNode)) : null;
  return {
    id: node.id,
    nodeId: node.id,
    minimapId: values.minimapId,
    label: values.label,
    enabled: values.enabled !== false,
    bounds: bounds,
    resolution: Math.max(64, Math.min(8192, Math.round(numberOrFallback(values.resolution, 2048)))),
    imageFormat: "webp",
    imageQuality: numberOrFallback(values.imageQuality, defaults.imageQuality),
    includeStaticModels: values.includeStaticModels !== false,
    includeInteractables: values.includeInteractables === true,
    hideEditorHelpers: values.hideEditorHelpers !== false,
    bakedImageUrl: values.bakedImageUrl || "",
    bakedImageWidth: numberOrNull(values.bakedImageWidth) || 0,
    bakedImageHeight: numberOrNull(values.bakedImageHeight) || 0,
    bakedAt: values.bakedAt || "",
    bakedWorldHash: values.bakedWorldHash || "",
    bakedBounds: values.bakedBounds || null
  };
}

function buildGameMinimapHudReadModel(node) {
  const defaults = defaultValuesForType("game_minimap_hud");
  const rawValues = node?.values || {};
  const values = Object.assign({}, defaults, rawValues);
  const hasDebugMode = Object.prototype.hasOwnProperty.call(rawValues, "debugMode");
  const debugMode = hasDebugMode ? rawValues.debugMode === true : rawValues.liteMode === false;
  const rotationMode = values.rotationMode === "player_facing" || values.rotationMode === "camera_yaw" ? values.rotationMode : "north_up";
  return {
    id: node.id,
    nodeId: node.id,
    hudId: values.hudId,
    sourceMinimapId: values.sourceMinimapId,
    enabled: values.enabled !== false,
    anchor: values.anchor,
    sizePx: numberOrFallback(values.sizePx, defaults.sizePx),
    marginPx: numberOrFallback(values.marginPx, defaults.marginPx),
    borderRadiusPx: numberOrFallback(values.borderRadiusPx, defaults.borderRadiusPx),
    backgroundOpacity: numberOrFallback(values.backgroundOpacity, defaults.backgroundOpacity),
    markerUpdateMs: numberOrFallback(values.markerUpdateMs, defaults.markerUpdateMs),
    debugMode: debugMode,
    liteMode: !debugMode,
    rotationMode: rotationMode,
    startDistance: numberOrFallback(values.startDistance, defaults.startDistance),
    minDistance: numberOrFallback(values.minDistance, defaults.minDistance),
    maxDistance: numberOrFallback(values.maxDistance, defaults.maxDistance),
    followPlayer: values.followPlayer !== false,
    clickToMove: values.clickToMove !== false,
    allowZoom: values.allowZoom !== false,
    allowPan: values.allowPan !== false,
    allowPinchZoom: values.allowPinchZoom !== false,
    showLocalPlayer: values.showLocalPlayer !== false,
    showRemotePlayers: values.showRemotePlayers !== false,
    showRemotePlayerNames: values.showRemotePlayerNames !== false,
    showPlayerName: values.showPlayerName !== false,
    showSpawn: values.showSpawn === true,
    showNpcEntities: values.showNpcEntities !== false,
    showInteractables: values.showInteractables === true,
    showQuestMarkers: values.showQuestMarkers === true,
    showEnemies: values.showEnemies === true,
    showViewportCone: values.showViewportCone !== false,
    clampOutsideMarkers: values.clampOutsideMarkers !== false,
    iconSizePx: numberOrFallback(values.iconSizePx, defaults.iconSizePx),
    fontSizePx: numberOrFallback(values.fontSizePx, defaults.fontSizePx),
    nameMaxLength: numberOrFallback(values.nameMaxLength, defaults.nameMaxLength),
    zIndex: numberOrFallback(values.zIndex, defaults.zIndex)
  };
}

function buildEditorMinimapHudReadModel(node) {
  const defaults = defaultValuesForType("editor_minimap_hud");
  const values = Object.assign({}, defaults, node?.values || {});
  return {
    id: node.id,
    nodeId: node.id,
    hudId: values.hudId,
    sourceMinimapId: values.sourceMinimapId,
    enabled: values.enabled !== false,
    anchor: values.anchor,
    sizePx: numberOrFallback(values.sizePx, defaults.sizePx),
    expandedSizePx: numberOrFallback(values.expandedSizePx, defaults.expandedSizePx),
    startExpanded: values.startExpanded === true,
    startDistance: numberOrFallback(values.startDistance, defaults.startDistance),
    minDistance: numberOrFallback(values.minDistance, defaults.minDistance),
    maxDistance: numberOrFallback(values.maxDistance, defaults.maxDistance),
    followEditorCamera: values.followEditorCamera !== false,
    showEditorCamera: values.showEditorCamera !== false,
    showEditorCameraViewBounds: values.showEditorCameraViewBounds !== false,
    showSelectedObject: values.showSelectedObject !== false,
    showPlayerSpawn: values.showPlayerSpawn !== false,
    showModelEntities: values.showModelEntities !== false,
    showEntityNames: values.showEntityNames !== false,
    showInteractables: values.showInteractables !== false,
    showChunkGrid: values.showChunkGrid === true,
    showBakeBounds: values.showBakeBounds !== false,
    clickToFocus: values.clickToFocus !== false,
    allowZoom: values.allowZoom !== false,
    allowPan: values.allowPan !== false,
    allowPinchZoom: values.allowPinchZoom !== false
  };
}

function collectMinimapReadModel(nodes, groundNode, includeEditor, warnings = []) {
  const bakeNodes = [];
  const gameNodes = [];
  const editorNodes = [];
  for (const node of nodes || []) {
    if (node.type === "minimap_bake") bakeNodes.push(node);
    else if (node.type === "game_minimap_hud") gameNodes.push(node);
    else if (node.type === "editor_minimap_hud") editorNodes.push(node);
  }
  if (gameNodes.length > 1) pushUniqueWarning(warnings, "Er zijn meerdere Game Minimap HUD nodes verbonden. De eerste wordt gebruikt.");
  if (editorNodes.length > 1) pushUniqueWarning(warnings, "Er zijn meerdere Editor Minimap nodes verbonden. De eerste wordt gebruikt.");
  const minimap = {
    bakes: bakeNodes.map(function (node) { return buildMinimapBakeReadModel(node, groundNode); }),
    game: gameNodes[0] ? buildGameMinimapHudReadModel(gameNodes[0]) : null
  };
  if (includeEditor) minimap.editor = editorNodes[0] ? buildEditorMinimapHudReadModel(editorNodes[0]) : null;
  return minimap;
}

function collectTerrainReadModel(nodes) {
  const terrain = emptyTerrainReadModel();
  for (const node of nodes || []) {
    if (node.type === "terrain_layer") terrain.layers.push(buildTerrainLayerReadModel(node));
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
    if (node.type === "editor_camera") continue;
    const result = validateNodeValues(node.type, node.values, NODE_TYPES);
    errors.push.apply(errors, result.errors);
    if (node.type === "group") {
      const inputNodes = graph.nodes.filter(function (candidate) {
        return candidate.parentId === node.id && candidate.type === "group_input";
      });
      const outputNodes = graph.nodes.filter(function (candidate) {
        return candidate.parentId === node.id && candidate.type === "group_output";
      });
      const contentNodes = graph.nodes.filter(function (candidate) {
        return candidate.parentId === node.id && candidate.type !== "group_input" && candidate.type !== "group_output";
      });
      if (inputNodes.length !== 1) errors.push("Group " + node.id + " moet exact één Group Input node hebben.");
      if (outputNodes.length !== 1) errors.push("Group " + node.id + " moet exact één Group Output node hebben.");
      if (outputNodes.length === 1) {
        const groupPorts = resolveNodePorts(node, nodeMap).outputs;
        for (const [portName, port] of Object.entries(groupPorts)) {
          const internalSources = directIncomingEdges(graph, outputNodes[0], portName);
          if (!internalSources.length) {
            if (contentNodes.length === 0) continue;
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
      if (camera.type === "editor_camera") {
        errors.push("Game Output camera mag geen Editor Camera zijn.");
      } else if (minD !== null && maxD !== null && minD > maxD) {
        errors.push("Game Camera min zoom is groter dan max zoom.");
      }
    }

    const player = collectResolutionError(errors, function () {
      return firstIncomingNode(graph, output, "player", nodeMap);
    });
    if (player) requireAsset(services.assetService, player.values.modelAssetId, "model", "Player Character model", errors);

    const entityNodes = collectResolutionError(errors, function () {
      return incomingNodes(graph, output, "entities", nodeMap);
    }) || [];
    for (const entity of entityNodes) {
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
      if (node.type === "surface_layer") {
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

    for (const node of entityNodes) {
      if (node.type !== "bounded_area_scatter") continue;
      const label = "Scatter '" + (node.values.scatterId || node.id) + "'";
      const settings = normalizeScatterSettings(node);
      const resolved = resolveScatterSources(node, nodeMap, services, errors, label);
      if (Array.isArray(node.values.points) && node.values.points.length > 0 && node.values.points.length < 3) {
        errors.push(label + " heeft minstens 3 boundary punten nodig.");
      }
      if (settings.enabled && settings.count > 0 && !resolved.sourceAssets.length) {
        errors.push(label + " heeft minstens één bron mesh nodig.");
      }
      if (settings.boundaryBlocksPlayer && settings.distributionMode !== "dense_fill" && settings.minSpacing === 0) {
        pushUniqueWarning(warnings, label + " blocks player but has no dense fill or min spacing; minimap may show misleading gaps.");
      }
      for (const source of resolved.sourceAssets) {
        requireAsset(services.assetService, source.id, "model", label + " bron " + source.id, errors);
      }
    }

    const collisionNodes = collectResolutionError(errors, function () {
      return incomingNodes(graph, output, "collision", nodeMap);
    }) || [];
    for (const node of collisionNodes) {
      if (node.type === "blocker_area" && node.values.shapeType === "polygon") {
        validatePointList(errors, node, 3);
      } else if (node.type === "walkable_surface" && Array.isArray(node.values.points) && node.values.points.length > 0) {
        validatePointList(errors, node, 3);
      }
    }

    const chunkLoadingNodes = collectResolutionError(errors, function () {
      return incomingNodes(graph, output, "chunkLoading", nodeMap);
    }) || [];
    const chunkLoading = collectChunkLoadingReadModel(chunkLoadingNodes, warnings);
    validateChunkLoadingReadModel(chunkLoading, warnings);

    const minimapNodes = collectResolutionError(errors, function () {
      return incomingNodes(graph, output, "minimap", nodeMap);
    }) || [];
    const minimapBakeNodes = minimapNodes.filter(function (node) { return node.type === "minimap_bake"; });
    const gameMinimapNodes = minimapNodes.filter(function (node) { return node.type === "game_minimap_hud"; });
    const editorMinimapNodes = minimapNodes.filter(function (node) { return node.type === "editor_minimap_hud"; });
    if (gameMinimapNodes.length > 1) pushUniqueWarning(warnings, "Er zijn meerdere Game Minimap HUD nodes verbonden. De eerste wordt gebruikt.");
    if (editorMinimapNodes.length > 1) pushUniqueWarning(warnings, "Er zijn meerdere Editor Minimap nodes verbonden. De eerste wordt gebruikt.");

    const enabledBakeMinimapIds = new Set();
    for (const node of minimapBakeNodes) {
      const label = "Minimap Bake '" + (node.values.label || node.values.minimapId || node.id) + "'";
      const minimapId = String(node.values.minimapId || "").trim();
      const enabled = node.values.enabled !== false;
      const resolution = numberOrNull(node.values.resolution);
      if (resolution !== null && resolution > 8192) {
        errors.push(label + " heeft een resolution groter dan 8192.");
      }
      if (enabled && minimapId) {
        if (enabledBakeMinimapIds.has(minimapId)) {
          errors.push("Er zijn meerdere enabled Minimap Bake nodes met minimapId '" + minimapId + "'.");
        }
        enabledBakeMinimapIds.add(minimapId);
      }
    }

    const gameMinimapHudIds = new Set();
    for (const node of gameMinimapNodes) {
      const label = "Game Minimap HUD '" + (node.values.hudId || node.id) + "'";
      const hudId = String(node.values.hudId || "").trim();
      const sizePx = numberOrNull(node.values.sizePx);
      if (sizePx !== null && sizePx <= 0) errors.push(label + " heeft een ongeldige sizePx.");
      if (hudId) {
        if (gameMinimapHudIds.has(hudId)) errors.push("Er zijn meerdere Game Minimap HUD nodes met hudId '" + hudId + "'.");
        gameMinimapHudIds.add(hudId);
      }
      if (node.values.enabled !== false) {
        const sourceMinimapId = String(node.values.sourceMinimapId || "").trim();
        const matchingBake = minimapBakeNodes.find(function (bakeNode) {
          return String(bakeNode.values.minimapId || "").trim() === sourceMinimapId;
        });
        if (!matchingBake) {
          pushUniqueWarning(warnings, label + " verwijst naar minimap_bake '" + sourceMinimapId + "', maar die node bestaat niet of is niet verbonden.");
        } else if (!matchingBake.values.bakedImageUrl) {
          pushUniqueWarning(warnings, label + " verwijst naar minimap_bake " + sourceMinimapId + ", maar er is nog geen minimap image gebakken.");
        }
      }
    }
    for (const node of editorMinimapNodes) {
      const sizePx = numberOrNull(node.values.sizePx);
      if (sizePx !== null && sizePx <= 0) errors.push("Editor Minimap '" + (node.values.hudId || node.id) + "' heeft een ongeldige sizePx.");
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function buildWorldFromGraph(graph, services = {}, options = {}) {
  const includeEditorCamera = options.includeEditorCamera !== false;
  const outputNode = graph.nodes.find(function (node) { return node.type === "game_output"; });
  const empty = {
    schemaVersion: graph.schemaVersion,
    source: "editor-node-graph",
    assets: [],
    entities: [],
    scatterAreas: [],
    lights: [],
    interactables: [],
    chunkLoading: { editor: null, game: null },
    keybinds: [],
    ui: [],
    minimap: { bakes: [], game: null },
    terrain: emptyTerrainReadModel(),
    collision: emptyCollisionReadModel()
  };
  if (!outputNode) return empty;
  const nodeMap = nodeMapForGraph(graph);
  const worldNode = firstIncomingNode(graph, outputNode, "world", nodeMap);
  const editorWorldSettingsNode = firstIncomingNode(graph, outputNode, "editorWorldSettings", nodeMap);
  const gameWorldSettingsNode = firstIncomingNode(graph, outputNode, "gameWorldSettings", nodeMap);
  const groundNode = firstIncomingNode(graph, outputNode, "ground", nodeMap);
  const cameraNode = firstIncomingNode(graph, outputNode, "camera", nodeMap);
  const playerNode = firstIncomingNode(graph, outputNode, "player", nodeMap);
  const spawnNode = firstIncomingNode(graph, outputNode, "spawn", nodeMap);
  const lightNodes = incomingNodes(graph, outputNode, "lights", nodeMap);
  const entityNodes = incomingNodes(graph, outputNode, "entities", nodeMap);
  const interactableNodes = incomingNodes(graph, outputNode, "interactables", nodeMap);
  const chunkLoadingNodes = incomingNodes(graph, outputNode, "chunkLoading", nodeMap);
  const keybindNodes = incomingNodes(graph, outputNode, "keybinds", nodeMap);
  const uiNodes = incomingNodes(graph, outputNode, "ui", nodeMap);
  const minimapNodes = incomingNodes(graph, outputNode, "minimap", nodeMap);
  const terrainNodes = incomingNodes(graph, outputNode, "terrain", nodeMap);
  const collisionNodes = incomingNodes(graph, outputNode, "collision", nodeMap);
  const modelEntityNodes = entityNodes.filter(function (node) {
    return node.type === "model_entity";
  });
  const scatterNodes = entityNodes.filter(function (node) {
    return node.type === "bounded_area_scatter";
  });
  const editorCameraNode = graph.nodes.find(function (node) {
    return node.type === "editor_camera";
  }) || null;

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
  for (const node of modelEntityNodes) if (node.values.modelAssetId) assetIds.add(node.values.modelAssetId);
  for (const node of interactableNodes) if (node.values.modelAssetId) assetIds.add(node.values.modelAssetId);
  const scatterAreas = [];
  const scatterEntities = [];
  const scatterCollisionBlockers = [];
  const groundY = numberOrNull(groundNode?.values?.y) ?? 0;
  for (const node of scatterNodes) {
    const label = "Scatter '" + (node.values.scatterId || node.id) + "'";
    const resolved = resolveScatterSources(node, nodeMap, services, [], label);
    for (const assetId of resolved.sourceAssetIds) assetIds.add(assetId);
    const settings = normalizeScatterSettings(node);
    const scatterInstances = buildScatterInstances(node, resolved.sourceAssets, groundY);
    scatterAreas.push(buildScatterAreaReadModel(node, resolved, {
      placedCount: scatterInstances.placedCount ?? scatterInstances.length,
      placementWarnings: scatterInstances.placementWarnings || []
    }));
    scatterEntities.push.apply(scatterEntities, scatterInstances);
    if (settings.boundaryBlocksPlayer) {
      scatterCollisionBlockers.push(buildScatterBoundaryBlockerReadModel(node, settings));
    }
  }
  const assets = services.assetService ? services.assetService.manifestForIds(Array.from(assetIds)) : [];
  const assetLookup = new Map(assets.map(function (asset) {
    return [asset.id, asset];
  }));
  const editorCamera = includeEditorCamera && editorCameraNode ? buildEditorCameraReadModel(editorCameraNode) : null;
  const collision = collectCollisionReadModel(collisionNodes);
  collision.blockers.push.apply(collision.blockers, scatterCollisionBlockers);
  const chunkLoading = collectChunkLoadingReadModel(chunkLoadingNodes);

  const world = {
    schemaVersion: graph.schemaVersion,
    source: "editor-node-graph",
    outputNodeId: outputNode.id,
    world: worldNode ? {
      id: worldNode.values.worldId,
      displayName: worldNode.values.displayName,
      backgroundColor: worldNode.values.backgroundColor,
      fogColor: worldNode.values.fogColor,
      fogDensity: numberOrNull(worldNode.values.fogDensity),
      performance: buildWorldPerformanceReadModel(worldNode, editorWorldSettingsNode, gameWorldSettingsNode)
    } : null,
    ground: groundNode ? {
      ...buildGroundReadModel(groundNode)
    } : null,
    camera: cameraNode ? {
      id: cameraNode.values.cameraId,
      mode: "top-down",
      cameraId: cameraNode.values.cameraId,
      pitch: numberOrNull(cameraNode.values.pitch),
      yaw: numberOrNull(cameraNode.values.yaw),
      startDistance: numberOrNull(cameraNode.values.startDistance) ?? numberOrNull(cameraNode.values.distance),
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
      ...resolveCanonicalAnimationConfig(assetLookup.get(playerNode.values.modelAssetId), playerNode.values),
      moveSpeed: clampNumber(numberOrNull(playerNode.values.moveSpeed), 0.1, 100, 6),
      sprintMultiplier: clampNumber(numberOrNull(playerNode.values.sprintMultiplier), 1, 2.5, 1.6),
      turnSpeed: clampNumber(numberOrNull(playerNode.values.turnSpeed), 1, 4000, 540),
      collisionRadius: clampNumber(numberOrNull(playerNode.values.collisionRadius), 0.05, 50, 0.5),
      scale: clampNumber(numberOrNull(playerNode.values.scale), 0.001, 1000, 1),
      showNameplate: playerNode.values.showNameplate !== false
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
    entities: modelEntityNodes.map(function (node) {
      return {
        id: node.id,
        nodeId: node.id,
        entityId: node.values.entityId || node.id,
        label: node.values.label,
        type: "model",
        modelAssetId: node.values.modelAssetId,
        ...resolveCanonicalAnimationConfig(assetLookup.get(node.values.modelAssetId), node.values),
        solid: node.values.solid === true,
        walkable: node.values.walkable === true,
        collisionRadius: clampNumber(numberOrNull(node.values.collisionRadius), 0.05, 100, 1),
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
    }).concat(scatterEntities),
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
    minimap: collectMinimapReadModel(minimapNodes, groundNode, includeEditorCamera),
    terrain: collectTerrainReadModel(terrainNodes),
    collision: collision,
    scatterAreas: scatterAreas,
    chunkLoading: chunkLoading,
    assets
  };
  if (editorCamera) world.editorCamera = editorCamera;
  return world;
}

function buildZoneLightReadModel(light) {
  if (!light) return null;
  if (light.nodeType === "ambient_light") {
    return {
      id: light.lightId || light.nodeId || "zone_ambient_light",
      type: "ambient",
      color: light.color,
      intensity: numberOrNull(light.intensity)
    };
  }
  if (light.nodeType === "directional_light") {
    return {
      id: light.lightId || light.nodeId || "zone_directional_light",
      type: "directional",
      color: light.color,
      intensity: numberOrNull(light.intensity),
      position: {
        x: numberOrNull(light.x),
        y: numberOrNull(light.y),
        z: numberOrNull(light.z)
      }
    };
  }
  return null;
}

function buildZoneCameraReadModel(camera) {
  if (!camera) return null;
  return {
    id: camera.cameraId || camera.id || camera.nodeId || "zone_camera",
    mode: "top-down",
    cameraId: camera.cameraId || camera.id || camera.nodeId || "zone_camera",
    pitch: numberOrNull(camera.pitch),
    yaw: numberOrNull(camera.yaw),
    startDistance: numberOrNull(camera.startDistance) ?? numberOrNull(camera.distance),
    distance: numberOrNull(camera.distance),
    minDistance: numberOrNull(camera.minDistance),
    maxDistance: numberOrNull(camera.maxDistance),
    fov: numberOrNull(camera.fov),
    follow: camera.follow !== false,
    rotateSpeed: numberOrNull(camera.rotateSpeed)
  };
}

function buildZonePlayerReadModel(player, assetLookup) {
  if (!player) return null;
  return {
    id: player.playerId || player.id || player.nodeId || "zone_player",
    modelAssetId: player.modelAssetId || null,
    ...resolveCanonicalAnimationConfig(assetLookup.get(player.modelAssetId), player),
    moveSpeed: clampNumber(numberOrNull(player.moveSpeed), 0.1, 100, 6),
    sprintMultiplier: clampNumber(numberOrNull(player.sprintMultiplier), 1, 2.5, 1.6),
    turnSpeed: clampNumber(numberOrNull(player.turnSpeed), 1, 4000, 540),
    collisionRadius: clampNumber(numberOrNull(player.collisionRadius), 0.05, 50, 0.5),
    scale: clampNumber(numberOrNull(player.scale), 0.001, 1000, 1),
    showNameplate: player.showNameplate !== false
  };
}

function buildZoneEntityReadModel(entity, assetLookup) {
  if (!entity || entity.nodeType !== "model_entity") return null;
  return {
    id: entity.nodeId || entity.entityId,
    nodeId: entity.nodeId || null,
    entityId: entity.entityId || entity.nodeId,
    label: entity.label,
    type: "model",
    modelAssetId: entity.modelAssetId || null,
    ...resolveCanonicalAnimationConfig(assetLookup.get(entity.modelAssetId), entity),
    solid: entity.solid === true,
    walkable: entity.walkable === true,
    collisionRadius: clampNumber(numberOrNull(entity.collisionRadius), 0.05, 100, 1),
    transform: {
      position: {
        x: numberOrNull(entity.x),
        y: numberOrNull(entity.y),
        z: numberOrNull(entity.z)
      },
      rotation: {
        x: numberOrNull(entity.rotationX) ?? 0,
        y: numberOrNull(entity.rotationY) ?? 0,
        z: numberOrNull(entity.rotationZ) ?? 0
      },
      scale: {
        x: numberOrNull(entity.scaleX),
        y: numberOrNull(entity.scaleY),
        z: numberOrNull(entity.scaleZ)
      }
    }
  };
}

function graphWithLegacyAdapterAsOutput(graph) {
  const outputNode = graph?.nodes?.find(function (node) { return node.type === "game_output"; });
  const adapterNode = graph?.nodes?.find(function (node) { return node.type === "legacy_world_adapter"; });
  if (!outputNode) return graph;
  const syntheticEdges = [];
  const nodeMap = nodeMapForGraph(graph);
  const assemblyNode = graph?.nodes?.find(function (node) {
    return node.type === "world_assembly" && directIncomingEdges(graph, outputNode, "gameProject").some(function (edge) {
      return edge.fromNodeId === node.id;
    });
  }) || null;
  if (assemblyNode) {
    for (const uiEdge of directIncomingEdges(graph, assemblyNode, "ui")) {
      const uiOutputNode = nodeMap.get(uiEdge.fromNodeId);
      if (!uiOutputNode || uiOutputNode.type !== "ui_output") continue;
      for (const edge of directIncomingEdges(graph, uiOutputNode, "ui")) {
        syntheticEdges.push(Object.assign({}, edge, {
          id: "synthetic_world_assembly_ui_" + edge.id,
          toNodeId: outputNode.id,
          toPort: "ui"
        }));
      }
      for (const edge of directIncomingEdges(graph, uiOutputNode, "minimap")) {
        syntheticEdges.push(Object.assign({}, edge, {
          id: "synthetic_world_assembly_minimap_" + edge.id,
          toNodeId: outputNode.id,
          toPort: "minimap"
        }));
      }
    }
  }
  if (!adapterNode) {
    return syntheticEdges.length ? Object.assign({}, graph, { edges: (graph.edges || []).concat(syntheticEdges) }) : graph;
  }
  const directLegacyEdges = (graph.edges || []).filter(function (edge) {
    return edge.toNodeId === outputNode.id && edge.toPort !== "gameProject";
  });
  if (directLegacyEdges.length) {
    return syntheticEdges.length ? Object.assign({}, graph, { edges: (graph.edges || []).concat(syntheticEdges) }) : graph;
  }
  const adapterEdges = (graph.edges || []).filter(function (edge) {
    return edge.toNodeId === adapterNode.id;
  });
  if (!adapterEdges.length && !syntheticEdges.length) return graph;
  return Object.assign({}, graph, {
    edges: (graph.edges || []).concat(adapterEdges.map(function (edge) {
      return Object.assign({}, edge, {
        id: "synthetic_legacy_output_" + edge.id,
        toNodeId: outputNode.id
      });
    })).concat(syntheticEdges)
  });
}

export class PublishService {
  constructor(repository, services = {}) {
    this.repository = repository;
    this.services = services;
  }

  getCompiler() {
    if (!this.services.gameProjectCompiler) {
      this.services.gameProjectCompiler = new GameProjectCompiler(this.services);
    }
    return this.services.gameProjectCompiler;
  }

  buildLegacyWorld(graph, includeEditorCamera) {
    return buildWorldFromGraph(graphWithLegacyAdapterAsOutput(graph), this.services, { includeEditorCamera: includeEditorCamera !== false });
  }

  compileGameProject(graph, options = {}) {
    const compiler = this.getCompiler();
    return compiler.compile(graph, Object.assign({}, options, {
      legacyWorldBuilder: (g, services, compileOptions) => buildWorldFromGraph(graphWithLegacyAdapterAsOutput(g), services, Object.assign({}, compileOptions, { includeEditorCamera: false })),
      legacyWorldOptions: Object.assign({}, options.legacyWorldOptions || {}, { includeEditorCamera: false })
    }));
  }

  mergeWorldWithGameProject(world, compilation, publishedAt = null) {
    if (!compilation || !compilation.connected || !compilation.manifest) return world;
    const manifest = compilation.manifest;
    const activeZoneId = manifest.runtime?.activeZoneId || null;
    const activeZone = activeZoneId ? manifest.zones?.byId?.[activeZoneId] || null : null;
    const startSpawnId = manifest.runtime?.startSpawnId || null;
    const startSpawn = activeZone && Array.isArray(activeZone.spawns)
      ? activeZone.spawns.find(function (spawn) { return spawn.spawnId === startSpawnId; }) || activeZone.spawns.find(function (spawn) { return spawn.role === "zone_default"; }) || null
      : null;
    const activeMinimap = activeZone && Array.isArray(activeZone.minimaps)
      ? activeZone.minimaps.find(function (minimap) { return minimap.enabled !== false; }) || null
      : null;
    const zoneAssetIds = new Set();
    if (activeZone?.ground?.textureAssetId) zoneAssetIds.add(activeZone.ground.textureAssetId);
    if (activeZone?.player?.modelAssetId) zoneAssetIds.add(activeZone.player.modelAssetId);
    for (const entity of Array.isArray(activeZone?.entities) ? activeZone.entities : []) {
      if (entity?.modelAssetId) zoneAssetIds.add(entity.modelAssetId);
    }
    const zoneAssets = this.services.assetService && zoneAssetIds.size
      ? this.services.assetService.manifestForIds(Array.from(zoneAssetIds))
      : [];
    const mergedAssets = uniqueById((world.assets || []).concat(zoneAssets));
    const assetLookup = new Map(mergedAssets.map(function (asset) {
      return [asset.id, asset];
    }));
    const zoneGround = activeZone?.ground ? {
      groundId: activeZone.ground.groundId || activeZone.ground.id || "zone_ground",
      width: activeZone.ground.width || activeZone.zone?.width || 500,
      depth: activeZone.ground.depth || activeZone.zone?.depth || 500,
      y: activeZone.ground.y || activeZone.zone?.originY || 0,
      boundsMode: "explicitBounds",
      minX: activeZone.zone?.bounds?.minX ?? activeZone.zone?.originX ?? 0,
      maxX: activeZone.zone?.bounds?.maxX ?? ((activeZone.zone?.originX || 0) + (activeZone.zone?.width || 500)),
      minZ: activeZone.zone?.bounds?.minZ ?? activeZone.zone?.originZ ?? 0,
      maxZ: activeZone.zone?.bounds?.maxZ ?? ((activeZone.zone?.originZ || 0) + (activeZone.zone?.depth || 500))
    } : null;
    const zoneMinimap = activeMinimap ? {
      bakes: [activeMinimap],
      game: Object.assign({}, world.minimap?.game || {}, {
        enabled: world.minimap?.game?.enabled !== false,
        sourceMode: "active_zone_registry",
        sourceMinimapId: activeMinimap.minimapId || activeMinimap.id || "zone_minimap"
      }),
      editor: world.minimap?.editor || null
    } : null;
    const zoneLights = (Array.isArray(activeZone?.lights) ? activeZone.lights : []).map(buildZoneLightReadModel).filter(Boolean);
    const zoneEntities = (Array.isArray(activeZone?.entities) ? activeZone.entities : []).map(function (entity) {
      return buildZoneEntityReadModel(entity, assetLookup);
    }).filter(Boolean);
    const zoneCamera = buildZoneCameraReadModel(activeZone?.camera);
    const zonePlayer = buildZonePlayerReadModel(activeZone?.player, assetLookup);
    return Object.assign({}, world, {
      schemaVersion: manifest.schemaVersion || world.schemaVersion,
      buildId: compilation.buildId || world.buildId || null,
      contentHash: compilation.contentHash || world.contentHash || null,
      gameProject: manifest,
      activeZoneId: activeZoneId || world.activeZoneId || null,
      zonePackage: activeZone || world.zonePackage || null,
      zones: manifest.zones || world.zones || {},
      spawn: startSpawn ? Object.assign({}, world.spawn || {}, {
        spawnId: startSpawn.spawnId,
        role: startSpawn.role,
        zoneRef: startSpawn.zoneRef || activeZoneId,
        x: Number(startSpawn.x) || 0,
        y: Number(startSpawn.y) || Number(world.ground?.y) || 0,
        z: Number(startSpawn.z) || 0,
        facing: Number(startSpawn.facing) || 0
      }) : world.spawn,
      ground: zoneGround || world.ground,
      camera: zoneCamera || world.camera,
      player: zonePlayer || world.player,
      lights: zoneLights.length ? zoneLights : world.lights,
      entities: zoneEntities.length ? zoneEntities : world.entities,
      minimap: zoneMinimap || world.minimap,
      assets: mergedAssets,
      publishedAt: publishedAt || world.publishedAt || undefined
    });
  }

  buildValidation(graph) {
    const legacyValidation = validateGraphForPublish(graph, this.services);
    const compilation = this.compileGameProject(graph, { legacyWorldOptions: { includeEditorCamera: false } });
    if (!compilation.connected) return legacyValidation;
    return {
      ok: legacyValidation.ok && compilation.validation.ok,
      errors: legacyValidation.errors.concat(compilation.validation.errors || []),
      warnings: legacyValidation.warnings.concat(compilation.validation.warnings || [])
    };
  }

  previewManifest() {
    const graph = this.repository.getGraph();
    return this.compileGameProject(graph, { legacyWorldOptions: { includeEditorCamera: false } });
  }

  saveDraft() {
    const graph = this.repository.getGraph();
    const compilation = this.compileGameProject(graph, { legacyWorldOptions: { includeEditorCamera: false } });
    const draftWorld = this.buildLegacyWorld(graph, true);
    const world = this.mergeWorldWithGameProject(draftWorld, compilation);
    this.repository.saveDraftWorld(world, {
      buildId: world.buildId || null,
      schemaVersion: world.schemaVersion || null,
      contentHash: world.contentHash || null
    });
    return world;
  }

  validate() {
    return this.buildValidation(this.repository.getGraph());
  }

  publish(actorUserId) {
    const graph = this.repository.getGraph();
    const compilation = this.compileGameProject(graph, { legacyWorldOptions: { includeEditorCamera: false } });
    const validation = compilation.connected ? this.buildValidation(graph) : validateGraphForPublish(graph, this.services);
    if (!validation.ok) {
      const error = new Error((validation.errors || []).map(validationIssueMessage).join(" "));
      error.status = 400;
      error.details = validation;
      throw error;
    }
    const draftWorld = this.buildLegacyWorld(graph, true);
    const publishedWorld = this.buildLegacyWorld(graph, false);
    const mergedDraftWorld = this.mergeWorldWithGameProject(draftWorld, compilation);
    const mergedPublishedWorld = this.mergeWorldWithGameProject(publishedWorld, compilation, new Date().toISOString());
    this.repository.saveDraftWorld(mergedDraftWorld, {
      buildId: mergedDraftWorld.buildId || null,
      schemaVersion: mergedDraftWorld.schemaVersion || null,
      contentHash: mergedDraftWorld.contentHash || null
    });
    this.repository.publishWorld(mergedPublishedWorld, actorUserId, {
      buildId: mergedPublishedWorld.buildId || null,
      schemaVersion: mergedPublishedWorld.schemaVersion || null,
      contentHash: mergedPublishedWorld.contentHash || null
    });
    return { world: mergedPublishedWorld, validation };
  }
}
