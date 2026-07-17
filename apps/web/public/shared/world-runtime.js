import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { normalizeWorldSettingsPreset, worldSettingsPresetValues } from "./node-types.js?v=20260714-mmo11-camera-target-height";

const DEG_TO_RAD = Math.PI / 180;
let objectResidencyState = null;
let chunkResidencyState = null;

function colorOrDefault(value, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "")) ? value : fallback;
}

function assetById(world, id) {
  return (world?.assets || []).find(function (asset) { return asset.id === id; }) || null;
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function numOrDefault(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  return num(value, fallback);
}

function numberOrFallback(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function detectRendererProfile(renderer) {
  try {
    const gl = renderer?.getContext?.();
    if (!gl) {
      return { name: "unknown", vendor: "unknown", software: false };
    }
    const debugInfo = typeof gl.getExtension === "function" ? gl.getExtension("WEBGL_debug_renderer_info") : null;
    const name = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const normalized = String(name || "").toLowerCase();
    const software = normalized.includes("swiftshader")
      || normalized.includes("software")
      || normalized.includes("llvmpipe")
      || normalized.includes("softpipe");
    return {
      name: String(name || "unknown"),
      vendor: String(vendor || "unknown"),
      software: software === true
    };
  } catch {
    return { name: "unknown", vendor: "unknown", software: false };
  }
}

function timingMs(startedAt) {
  return (performance.now() - startedAt).toFixed(1);
}

// Fase 8.6 (DEEL G): debug/helper/chunk-overlay/selection meshes must never cast or receive
// shadows - only real world content (ground, static props, scatter) may. Called on every
// debug/helper group so the invariant holds regardless of what a future edit adds to them.
export function sanitizeNonWorldShadowCasters(root) {
  if (!root || typeof root.traverse !== "function") return 0;
  let sanitized = 0;
  root.traverse(function (child) {
    if (!child) return;
    if (child.castShadow === true || child.receiveShadow === true) {
      child.castShadow = false;
      child.receiveShadow = false;
      sanitized += 1;
    }
  });
  return sanitized;
}

function isDebugOverlayObject(object) {
  if (!object) return false;
  if (object.userData?.debugOverlay === true || object.userData?.debugOverlayRoot === true) return true;
  const name = String(object.name || "").trim().toLowerCase();
  return name === "gk chunk debug overlay"
    || name === "gk editor terrain overlay"
    || name === "gk editor scatter overlay"
    || name === "gk editor transform guide"
    || name === "gk editor selection helper"
    || name.includes("debug overlay")
    || name.includes("camera overlay")
    || name.includes("chunk fill")
    || name.includes("chunk plane")
    || name.includes("shadow helper")
    || name.includes("transform guide")
    || name.includes("terrain overlay")
    || name.includes("scatter overlay")
    || name.includes("selection helper");
}

function markDebugOverlayTree(root, kind = "debug") {
  if (!root) return root;
  root.userData = root.userData || {};
  root.userData.debugOverlay = true;
  root.userData.debugOverlayRoot = true;
  root.userData.debugOverlayKind = String(kind || "debug");
  if (typeof root.traverse === "function") {
    root.traverse(function (child) {
      if (!child) return;
      child.userData = child.userData || {};
      child.userData.debugOverlay = true;
      child.userData.debugOverlayKind = String(kind || "debug");
      if (child.isMesh || child.isInstancedMesh || child.isLine || child.isLineSegments || child.isSprite) {
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });
  }
  return root;
}

function disposeObject(object, options = {}) {
  const disposeTextures = options.disposeTextures !== false;
  const disposeGeometry = options.disposeGeometry !== false;
  const disposeMaterials = options.disposeMaterials !== false;
  const disposedTextures = new Set();
  object.traverse(function (child) {
    const sharedRuntimeResources = child?.userData?.runtimeResourcesShared === true;
    if (disposeGeometry && !sharedRuntimeResources && child.geometry) child.geometry.dispose();
    if (disposeMaterials && !sharedRuntimeResources && child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (disposeTextures) {
          for (const value of Object.values(material)) {
            if (value && typeof value.dispose === "function" && value.isTexture && !disposedTextures.has(value)) {
              disposedTextures.add(value);
              value.dispose();
            }
          }
          if (material.uniforms) {
            for (const uniform of Object.values(material.uniforms)) {
              const uval = uniform?.value;
              if (uval && typeof uval.dispose === "function" && uval.isTexture && !disposedTextures.has(uval)) {
                disposedTextures.add(uval);
                uval.dispose();
              }
            }
          }
        }
        material.dispose();
      }
    }
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function colorFromHex(value, fallback) {
  if (value instanceof THREE.Color) return value.clone();
  const fallbackValue = fallback instanceof THREE.Color
    ? "#" + fallback.getHexString()
    : fallback;
  return new THREE.Color(colorOrDefault(value, fallbackValue));
}

function mixColors(primaryHex, secondaryHex, secondaryWeight = 0.25) {
  const color = colorFromHex(primaryHex, secondaryHex);
  color.lerp(colorFromHex(secondaryHex, secondaryHex), clamp(secondaryWeight, 0, 1));
  return color;
}

function ensureChunkBucket(map, chunkKey) {
  const key = String(chunkKey || "").trim();
  if (!key) return null;
  let bucket = map.get(key);
  if (!bucket) {
    bucket = [];
    map.set(key, bucket);
  }
  return bucket;
}

function ensureResidentChunkBucket(map, chunkKey) {
  const key = String(chunkKey || "").trim();
  if (!key) return null;
  let bucket = map.get(key);
  if (!bucket) {
    bucket = new Map();
    map.set(key, bucket);
  }
  return bucket;
}

function chunkKeyFromWorldPosition(x, z, policy) {
  const px = Number(x);
  const pz = Number(z);
  if (!Number.isFinite(px) || !Number.isFinite(pz) || !policy) return null;
  return chunkKey(chunkCoordForPosition(px, pz, policy));
}

function sortChunkKeysByDistance(keys, centerChunk) {
  const center = centerChunk && Number.isFinite(Number(centerChunk.x)) && Number.isFinite(Number(centerChunk.z))
    ? { x: Number(centerChunk.x), z: Number(centerChunk.z) }
    : { x: 0, z: 0 };
  return Array.from(new Set((Array.isArray(keys) ? keys : []).map(function (value) {
    const key = String(value || "").trim();
    return key || null;
  }).filter(Boolean))).map(function (key) {
    const coord = chunkCoordFromKey(key);
    if (!coord) return null;
    return {
      key: chunkKey(coord),
      coord: coord,
      distance: chunkDistanceFromCenter(coord, center)
    };
  }).filter(Boolean).sort(function (left, right) {
    if (left.distance !== right.distance) return left.distance - right.distance;
    return chunkCoordSort(left.coord, right.coord);
  }).map(function (entry) {
    return entry.key;
  });
}

function countEntriesForChunkMap(map) {
  let total = 0;
  for (const entries of map.values()) total += Array.isArray(entries) ? entries.length : 0;
  return total;
}

function countResidentEntriesForChunkMap(map) {
  let total = 0;
  for (const entries of map.values()) total += entries instanceof Map ? entries.size : 0;
  return total;
}

function createEmptyContentBlueprintIndex() {
  return {
    entitiesByChunkKey: new Map(),
    scatterByChunkKey: new Map(),
    interactablesByChunkKey: new Map(),
    solidsByChunkKey: new Map(),
    alwaysLoaded: [],
    blueprintEntityCount: 0,
    blueprintScatterInstanceCount: 0,
    blueprintInteractableCount: 0,
    blueprintSolidCount: 0,
    blueprintWorldItemCount: 0,
    lastBuildReason: "init",
    version: 0
  };
}

function createEmptyResidentContentState() {
  return {
    residentChunkKeys: new Set(),
    desiredChunkKeys: [],
    enteringChunkKeys: [],
    leavingChunkKeys: [],
    pendingChunkKeys: [],
    entityObjectsByKey: new Map(),
    scatterBatchesByKey: new Map(),
    interactableObjectsByKey: new Map(),
    solidEntriesByKey: new Map(),
    loadedEntityCount: 0,
    loadedScatterInstanceCount: 0,
    loadedScatterBatchCount: 0,
    loadedInteractableCount: 0,
    loadedSolidCount: 0,
    residentObject3DCount: 0,
    residentWorldItemCount: 0,
    blueprintEntityCount: 0,
    blueprintScatterInstanceCount: 0,
    blueprintInteractableCount: 0,
    blueprintSolidCount: 0,
    residentEntityBudget: 200,
    residentObjectBudget: 300,
    residentScatterInstanceBudget: 500,
    residentChunkBuildBudgetPerFrame: 2,
    budgetClipped: false,
    eagerBuildDisabled: false,
    lastSyncReason: "init",
    lastSyncMs: 0,
    lastDesiredSignature: "",
    policySource: "none",
    mode: "editor",
    pendingLoadCount: 0
  };
}

function createEmptyObjectResidencyTracker() {
  return {
    recordsById: new Map(),
    holdMs: OBJECT_VISIBILITY_HOLD_MS,
    enterMarginChunks: 0,
    exitMarginChunks: OBJECT_VISIBILITY_EXIT_MARGIN_CHUNKS,
    visibilityToggleCount: 0,
    visibilityToggleThisFrame: 0,
    preventedVisibilityToggleCount: 0,
    repeatedVisibilityToggleWarnings: 0,
    chunkBoundaryObjectWarnings: 0,
    lastVisibilityChangeReason: "init",
    lastVisibilityChangeTime: 0,
    rebuiltChunkGroupCount: 0,
    disposedChunkGroupCount: 0
  };
}

function createEmptyChunkResidencyTracker() {
  return {
    recordsByKey: new Map(),
    holdMs: OBJECT_VISIBILITY_HOLD_MS,
    enterMarginChunks: 0,
    exitMarginChunks: OBJECT_VISIBILITY_EXIT_MARGIN_CHUNKS,
    lastChunkToggleReason: "init",
    lastChunkToggleTime: 0
  };
}

function createEmptyObjectResidencySummary() {
  return {
    visibleObjectCount: 0,
    renderResidentObjectCount: 0,
    heldVisibleObjectCount: 0,
    pendingUnloadObjectCount: 0,
    unloadedObjectCount: 0,
    visibilityToggleCount: 0,
    visibilityToggleThisFrame: 0,
    preventedVisibilityToggleCount: 0,
    lastVisibilityChangeReason: "init",
    lastVisibilityChangeTime: 0,
    repeatedVisibilityToggleWarnings: 0,
    chunkBoundaryObjectWarnings: 0,
    scatterBatchCount: 0,
    visibleScatterBatchCount: 0,
    heldScatterBatchCount: 0,
    rebuiltChunkGroupCount: 0,
    disposedChunkGroupCount: 0,
    entries: []
  };
}

function createEmptyChunkResidencySummary() {
  return {
    activeChunks: 0,
    heldChunks: 0,
    pendingUnloadChunks: 0,
    unloadedChunks: 0,
    enterMargin: 0,
    exitMargin: OBJECT_VISIBILITY_EXIT_MARGIN_CHUNKS,
    holdMs: OBJECT_VISIBILITY_HOLD_MS,
    lastChunkToggleReason: "init",
    lastChunkToggleTime: 0,
    activeChunkKeys: [],
    heldChunkKeys: [],
    pendingUnloadChunkKeys: [],
    unloadedChunkKeys: [],
    entries: []
  };
}

function resetResidencyTrackers() {
  if (!objectResidencyState || !chunkResidencyState) return;
  objectResidencyState.recordsById.clear();
  objectResidencyState.visibilityToggleCount = 0;
  objectResidencyState.visibilityToggleThisFrame = 0;
  objectResidencyState.preventedVisibilityToggleCount = 0;
  objectResidencyState.repeatedVisibilityToggleWarnings = 0;
  objectResidencyState.chunkBoundaryObjectWarnings = 0;
  objectResidencyState.lastVisibilityChangeReason = "init";
  objectResidencyState.lastVisibilityChangeTime = 0;
  objectResidencyState.rebuiltChunkGroupCount = 0;
  objectResidencyState.disposedChunkGroupCount = 0;
  objectResidencyState.enterMarginChunks = 0;
  objectResidencyState.exitMarginChunks = OBJECT_VISIBILITY_EXIT_MARGIN_CHUNKS;
  objectResidencyState.holdMs = OBJECT_VISIBILITY_HOLD_MS;
  chunkResidencyState.recordsByKey.clear();
  chunkResidencyState.lastChunkToggleReason = "init";
  chunkResidencyState.lastChunkToggleTime = 0;
  chunkResidencyState.enterMarginChunks = 0;
  chunkResidencyState.exitMarginChunks = OBJECT_VISIBILITY_EXIT_MARGIN_CHUNKS;
  chunkResidencyState.holdMs = OBJECT_VISIBILITY_HOLD_MS;
}

function hasPendingObjectResidencyWork() {
  if (!objectResidencyState) return false;
  for (const record of objectResidencyState.recordsById.values()) {
    if (record && record.pendingUnload === true) return true;
  }
  return false;
}

function cloneResidencySummary(summary) {
  if (!summary) return null;
  const cloned = Object.assign({}, summary);
  if (Array.isArray(summary.entries)) {
    cloned.entries = summary.entries.map(function (entry) { return Object.assign({}, entry); });
  }
  if (Array.isArray(summary.activeChunkKeys)) cloned.activeChunkKeys = summary.activeChunkKeys.slice();
  if (Array.isArray(summary.heldChunkKeys)) cloned.heldChunkKeys = summary.heldChunkKeys.slice();
  if (Array.isArray(summary.pendingUnloadChunkKeys)) cloned.pendingUnloadChunkKeys = summary.pendingUnloadChunkKeys.slice();
  if (Array.isArray(summary.unloadedChunkKeys)) cloned.unloadedChunkKeys = summary.unloadedChunkKeys.slice();
  if (Array.isArray(summary.renderResidentChunkKeys)) cloned.renderResidentChunkKeys = summary.renderResidentChunkKeys.slice();
  if (Array.isArray(summary.visibleChunkKeys)) cloned.visibleChunkKeys = summary.visibleChunkKeys.slice();
  if (Array.isArray(summary.forwardChunkKeys)) cloned.forwardChunkKeys = summary.forwardChunkKeys.slice();
  if (Array.isArray(summary.preloadChunkKeys)) cloned.preloadChunkKeys = summary.preloadChunkKeys.slice();
  if (Array.isArray(summary.loadedChunkKeys)) cloned.loadedChunkKeys = summary.loadedChunkKeys.slice();
  if (Array.isArray(summary.chunkKeys)) cloned.chunkKeys = summary.chunkKeys.slice();
  return cloned;
}

// Fase 8.6 shadow quality presets (DEEL H). `shadowMapSize`/`shadowCameraSize` of 0 on a mode's
// own field means "auto: use this table"; any explicit value >0 on the node always wins and is
// never reduced again by a performance profile.
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

const SHADOW_QUALITY_TYPE_FALLBACK = {
  off: "basic",
  low: "basic",
  medium: "pcf",
  high: "pcfSoft"
};

function shadowMapTypeFromName(name) {
  const normalized = String(name === undefined || name === null ? "" : name).trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (name === THREE.PCFSoftShadowMap || normalized === "pcfsoft" || normalized === "pcfsoftshadowmap") return THREE.PCFSoftShadowMap;
  if (name === THREE.PCFShadowMap || normalized === "pcf" || normalized === "pcfshadowmap") return THREE.PCFShadowMap;
  if (name === THREE.BasicShadowMap || normalized === "basic" || normalized === "basicshadowmap") return THREE.BasicShadowMap;
  if (name === THREE.VSMShadowMap || normalized === "vsm" || normalized === "vsmshadowmap") return THREE.VSMShadowMap;
  return null;
}

const WORLD_PERFORMANCE_MODE_SHADOW_DEFAULTS = {
  shadowQuality: "medium",
  shadowMapSize: 0,
  shadowCameraSize: 0,
  shadowCameraFar: 0,
  shadowBias: -0.0003,
  shadowNormalBias: 0.04,
  shadowType: "auto",
  staticPropCastShadows: false,
  staticPropReceiveShadows: true,
  scatterCastShadows: true,
  scatterReceiveShadows: true,
  groundReceiveShadows: true,
  terrainReceiveShadows: true,
  debugChunkOverlayVisible: false
};

const WORLD_PERFORMANCE_DEFAULTS = {
  shared: {
    worldId: "main_world",
    displayName: "My World",
    backgroundColor: "#101a26",
    smoothShading: true,
    fogColor: "#101a26",
    fogDensity: 0
  },
  game: {
    preset: "middel_schaduw",
    pixelRatioCap: 1,
    antialias: true,
    fogEnabled: true,
    maxFps: 60,
    debugHelpersVisible: false,
    debugWarningsVisible: false,
    debugChunkOverlayVisible: false,
    chunkGridVisible: false,
    chunkLabelsVisible: false,
    streamingDebugVisible: false,
    shadowsEnabled: true,
    shadowQuality: "medium",
    shadowMapSize: 1024,
    shadowCameraSize: 85,
    shadowCameraFar: 450,
    shadowBias: -0.0003,
    shadowNormalBias: 0.04,
    shadowType: "pcf_soft",
    staticPropCastShadows: true,
    staticPropReceiveShadows: true,
    scatterCastShadows: true,
    scatterReceiveShadows: true,
    groundReceiveShadows: true,
    terrainReceiveShadows: true,
    shadow: {
      preset: "middel_schaduw",
      enabled: true,
      mapSize: 1024,
      cameraSize: 85,
      cameraNear: 1,
      cameraFar: 450,
      bias: -0.0003,
      normalBias: 0.04,
      type: "pcf_soft",
      updateMode: "stable_snapped",
      snapWorldUnits: 10,
      focusMode: "player_or_spawn",
      staticPropsCast: true,
      staticPropsReceive: true,
      scatterCast: true,
      scatterReceive: true,
      groundReceives: true,
      terrainReceives: true,
      shadowResidentMarginChunks: 1
    }
  },
  editor: {
    preset: "middel_schaduw",
    pixelRatioCap: 2,
    antialias: true,
    fogEnabled: false,
    maxFps: 60,
    debugHelpersVisible: true,
    debugWarningsVisible: true,
    debugChunkOverlayVisible: false,
    chunkGridVisible: true,
    chunkLabelsVisible: false,
    streamingDebugVisible: false,
    shadowsEnabled: true,
    shadowQuality: "medium",
    shadowMapSize: 1024,
    shadowCameraSize: 100,
    shadowCameraFar: 450,
    shadowBias: -0.0003,
    shadowNormalBias: 0.04,
    shadowType: "pcf_soft",
    staticPropCastShadows: true,
    staticPropReceiveShadows: true,
    scatterCastShadows: true,
    scatterReceiveShadows: true,
    groundReceiveShadows: true,
    terrainReceiveShadows: true,
    shadow: {
      preset: "middel_schaduw",
      enabled: true,
      mapSize: 1024,
      cameraSize: 100,
      cameraNear: 1,
      cameraFar: 450,
      bias: -0.0003,
      normalBias: 0.04,
      type: "pcf_soft",
      updateMode: "stable_snapped",
      snapWorldUnits: 10,
      focusMode: "editor_world_center_or_selected",
      staticPropsCast: true,
      staticPropsReceive: true,
      scatterCast: true,
      scatterReceive: true,
      groundReceives: true,
      terrainReceives: true,
      shadowResidentMarginChunks: 1
    }
  },
  compatibility: {
    usedLegacyWorldSettingsPerformanceFields: false
  }
};

function normalizeShadowQuality(value, fallback = WORLD_PERFORMANCE_MODE_SHADOW_DEFAULTS.shadowQuality) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "off" || normalized === "low" || normalized === "medium" || normalized === "high") return normalized;
  return fallback;
}

function normalizeGamePerformanceProfile(value, fallback = "") {
  return normalizeWorldSettingsPreset(value, fallback);
}

function shadowQualityRank(value) {
  const normalized = normalizeShadowQuality(value);
  if (normalized === "off") return 0;
  if (normalized === "low") return 1;
  if (normalized === "medium") return 2;
  return 3;
}

function lowestShadowQuality(a, b) {
  const left = normalizeShadowQuality(a);
  const right = normalizeShadowQuality(b);
  return shadowQualityRank(left) <= shadowQualityRank(right) ? left : right;
}

function shadowMapTypeName(type) {
  if (type === THREE.PCFSoftShadowMap || type === "PCFSoftShadowMap") return "pcf_soft";
  if (type === THREE.PCFShadowMap || type === "PCFShadowMap") return "pcf";
  if (type === THREE.BasicShadowMap || type === "BasicShadowMap") return "basic";
  if (type === THREE.VSMShadowMap || type === "VSMShadowMap") return "vsm";
  const normalized = String(type || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (normalized === "pcfsoft") return "pcf_soft";
  if (normalized === "pcf") return "pcf";
  if (normalized === "basic") return "basic";
  if (normalized === "vsm") return "vsm";
  return "unknown";
}

function normalizeShadowMapTypeName(value, fallback = "pcf_soft") {
  const mapped = shadowMapTypeName(value);
  if (mapped !== "unknown") return mapped;
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!normalized || normalized === "auto") return fallback;
  if (normalized === "pcfsoft" || normalized === "pcfsoftshadowmap") return "pcf_soft";
  if (normalized === "pcf" || normalized === "pcfshadowmap") return "pcf";
  if (normalized === "basic" || normalized === "basicshadowmap") return "basic";
  if (normalized === "vsm" || normalized === "vsmshadowmap") return "vsm";
  return fallback;
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

export function resolveGamePerformanceProfileConfig(profile, rendererProfile = { software: false }) {
  const normalized = normalizeGamePerformanceProfile(profile);
  const presets = {
    quality: {
      pixelRatioCap: 1.5,
      shadowsEnabled: true,
      shadowQuality: "high",
      shadowMapType: THREE.PCFSoftShadowMap,
      shadowMapSize: 4096,
      antialias: true,
      batchStaticProps: true,
      batchScatterProps: true,
      staticPropCastShadows: true,
      staticPropReceiveShadows: true,
      scatterCastShadows: true,
      surfaceAnimationEnabled: true
    },
    balanced: {
      pixelRatioCap: 1,
      shadowsEnabled: true,
      shadowQuality: "medium",
      shadowMapType: THREE.PCFShadowMap,
      shadowMapSize: 1024,
      antialias: true,
      batchStaticProps: true,
      batchScatterProps: true,
      staticPropCastShadows: false,
      staticPropReceiveShadows: true,
      scatterCastShadows: true,
      surfaceAnimationEnabled: true
    },
    laptop: {
      pixelRatioCap: 0.75,
      shadowsEnabled: true,
      shadowQuality: "low",
      shadowMapType: THREE.PCFShadowMap,
      shadowMapSize: 512,
      antialias: false,
      batchStaticProps: true,
      batchScatterProps: true,
      staticPropCastShadows: false,
      staticPropReceiveShadows: true,
      scatterCastShadows: false,
      surfaceAnimationEnabled: true
    },
    potato: {
      pixelRatioCap: 0.5,
      shadowsEnabled: false,
      shadowQuality: "off",
      shadowMapType: THREE.PCFShadowMap,
      shadowMapSize: 0,
      antialias: false,
      batchStaticProps: true,
      batchScatterProps: true,
      staticPropCastShadows: false,
      staticPropReceiveShadows: false,
      scatterCastShadows: false,
      surfaceAnimationEnabled: false
    }
  };
  const base = presets[normalized] || presets.balanced;
  const software = rendererProfile?.software === true;
  return {
    profile: normalized,
    pixelRatioCap: software ? Math.min(base.pixelRatioCap, 0.7) : base.pixelRatioCap,
    shadowsEnabled: software ? false : base.shadowsEnabled,
    shadowQuality: software ? "off" : base.shadowQuality,
    shadowMapType: software ? THREE.PCFShadowMap : base.shadowMapType,
    shadowMapSize: software ? 0 : base.shadowMapSize,
    antialias: base.antialias,
    batchStaticProps: base.batchStaticProps,
    batchScatterProps: base.batchScatterProps,
    staticPropCastShadows: base.staticPropCastShadows,
    staticPropReceiveShadows: base.staticPropReceiveShadows,
    scatterCastShadows: base.scatterCastShadows,
    surfaceAnimationEnabled: base.surfaceAnimationEnabled
  };
}

function shadowMapSizeForQuality(quality) {
  return SHADOW_QUALITY_MAP_SIZES[normalizeShadowQuality(quality)] || SHADOW_QUALITY_MAP_SIZES.medium;
}

// Fase 9.0: resolve the canonical shadow block for one mode (editor or game). New published
// worlds use `performance.<mode>.shadow`; legacy flat fields are only read when a world has not
// yet been migrated.
function resolveModeShadowPolicy(modePerformance, mode = "editor") {
  const modeData = modePerformance || {};
  const shadow = modeData.shadow && typeof modeData.shadow === "object" ? modeData.shadow : null;
  const presetFallback = normalizeWorldSettingsPreset(modeData.preset, "middel_schaduw");
  const requestedPreset = shadow?.preset ?? modeData.shadowPreset ?? modeData.preset ?? presetFallback;
  const preset = normalizeWorldSettingsPreset(requestedPreset, presetFallback);
  const presetValues = worldSettingsPresetValues(mode, preset) || worldSettingsPresetValues(mode, "middel_schaduw") || {};
  const hasLegacyFields = hasLegacyShadowFields(modeData, "") || hasLegacyShadowFields(modeData, mode === "editor" ? "editor" : "game");
  const legacyQuality = normalizeShadowQuality(modeData.shadowQuality || presetValues.shadowQuality || (preset === "geen_schaduw" ? "off" : "medium"));
  const legacyType = normalizeShadowMapTypeName(modeData.shadowType || presetValues.type || "pcf_soft", presetValues.type || "pcf_soft");
  const readShadowValue = function (key, legacyKey, fallback) {
    if (shadow && shadow[key] !== undefined) return shadow[key];
    if (!shadow) {
      if (modeData[key] !== undefined) return modeData[key];
      if (legacyKey && modeData[legacyKey] !== undefined) return modeData[legacyKey];
    }
    if (presetValues[key] !== undefined) return presetValues[key];
    return fallback;
  };
  const enabled = preset !== "geen_schaduw";
  const mapSize = enabled ? Math.max(0, Math.floor(num(readShadowValue("mapSize", "shadowMapSize", presetValues.mapSize || 0), presetValues.mapSize || 0))) : 0;
  const cameraSize = enabled ? Math.max(1, Math.floor(num(readShadowValue("cameraSize", "shadowCameraSize", presetValues.cameraSize || 0), presetValues.cameraSize || 0))) : 0;
  const cameraNear = enabled ? Math.max(0.1, num(readShadowValue("cameraNear", "shadowCameraNear", presetValues.cameraNear || 1), presetValues.cameraNear || 1)) : 1;
  const cameraFar = enabled ? Math.max(1, Math.floor(num(readShadowValue("cameraFar", "shadowCameraFar", presetValues.cameraFar || 0), presetValues.cameraFar || 0))) : 0;
  const bias = enabled ? clamp(num(readShadowValue("bias", "shadowBias", presetValues.bias ?? -0.0003), presetValues.bias ?? -0.0003), -0.01, 0.01) : 0;
  const normalBias = enabled ? clamp(num(readShadowValue("normalBias", "shadowNormalBias", presetValues.normalBias ?? 0.04), presetValues.normalBias ?? 0.04), 0, 1) : 0;
  const type = enabled
    ? normalizeShadowMapTypeName(readShadowValue("type", "shadowType", presetValues.type || "pcf_soft"), presetValues.type || "pcf_soft")
    : "basic";
  const mapType = shadowMapTypeFromName(type) || THREE.PCFShadowMap;
  const updateMode = enabled
    ? String(readShadowValue("updateMode", "shadowUpdateMode", presetValues.updateMode || "stable_snapped") || "stable_snapped").trim() || "stable_snapped"
    : "off";
  const snapWorldUnits = enabled
    ? Math.max(1, Math.floor(num(readShadowValue("snapWorldUnits", "shadowSnapWorldUnits", presetValues.snapWorldUnits || 10), presetValues.snapWorldUnits || 10)))
    : 0;
  const focusMode = enabled
    ? String(readShadowValue("focusMode", "shadowFocusMode", presetValues.focusMode || (mode === "editor" ? "editor_world_center_or_selected" : "player_or_spawn")) || (mode === "editor" ? "editor_world_center_or_selected" : "player_or_spawn")).trim() || (mode === "editor" ? "editor_world_center_or_selected" : "player_or_spawn")
    : (mode === "editor" ? "editor_world_center_or_selected" : "player_or_spawn");
  const staticPropsCast = enabled && readShadowValue("staticPropsCast", "staticPropCastShadows", presetValues.staticPropsCast !== false) === true;
  const staticPropsReceive = enabled && readShadowValue("staticPropsReceive", "staticPropReceiveShadows", presetValues.staticPropsReceive !== false) !== false;
  const scatterCast = enabled && readShadowValue("scatterCast", "scatterCastShadows", presetValues.scatterCast === true) === true;
  const scatterReceive = enabled && readShadowValue("scatterReceive", "scatterReceiveShadows", presetValues.scatterReceive !== false) !== false;
  const groundReceives = enabled && readShadowValue("groundReceives", "groundReceiveShadows", presetValues.groundReceives !== false) !== false;
  const terrainReceives = enabled && readShadowValue("terrainReceives", "terrainReceiveShadows", presetValues.terrainReceives !== false) !== false;
  const shadowResidentMarginChunks = enabled
    ? Math.max(0, Math.floor(num(readShadowValue("shadowResidentMarginChunks", "shadowResidentMarginChunks", presetValues.shadowResidentMarginChunks || 0), presetValues.shadowResidentMarginChunks || 0)))
    : 0;
  return {
    source: enabled ? (shadow ? "shadow" : (hasLegacyFields ? "legacy" : "preset")) : "none",
    enabled: enabled,
    mode: stableShadowModeName(mode),
    preset: preset,
    quality: legacyQuality,
    legacyQuality: legacyQuality,
    legacyFieldsIgnored: Boolean(modeData.compatibility?.usedLegacyWorldSettingsPerformanceFields || modeData.compatibility?.legacyShadowFieldsMigrated || hasLegacyFields),
    rendererShadowMapEnabled: enabled,
    mapType: mapType,
    mapTypeName: shadowMapTypeName(mapType),
    mapSize: mapSize,
    cameraSize: cameraSize,
    cameraNear: cameraNear,
    cameraFar: cameraFar,
    bias: bias,
    normalBias: normalBias,
    type: type,
    updateMode: updateMode,
    snapWorldUnits: snapWorldUnits,
    focusMode: focusMode,
    staticPropsCast: staticPropsCast,
    staticPropsReceive: staticPropsReceive,
    scatterCast: scatterCast,
    scatterReceive: scatterReceive,
    groundReceives: groundReceives,
    terrainReceives: terrainReceives,
    shadowResidentMarginChunks: shadowResidentMarginChunks,
    shadowsEnabled: enabled,
    shadowQuality: legacyQuality,
    shadowMapSize: mapSize,
    shadowCameraSize: cameraSize,
    shadowCameraNear: cameraNear,
    shadowCameraFar: cameraFar,
    shadowBias: bias,
    shadowNormalBias: normalBias,
    shadowType: type,
    staticPropCastShadows: staticPropsCast,
    staticPropReceiveShadows: staticPropsReceive,
    scatterCastShadows: scatterCast,
    scatterReceiveShadows: scatterReceive,
    groundReceiveShadows: groundReceives,
    terrainReceiveShadows: terrainReceives
  };
}

export function resolveShadowPolicy(worldData, mode = "editor") {
  const source = worldData?.world?.performance || {};
  const modePerformance = mode === "editor" ? (source.editor || {}) : (source.game || {});
  return resolveModeShadowPolicy(modePerformance, mode);
}

function stableShadowModeName(mode) {
  return mode === "game" ? "game" : "editor";
}

export function shadowSnapWorldUnitsForPolicy(policy, mode = "editor") {
  const normalizedMode = stableShadowModeName(mode);
  const chunkSize = chunkSizeForPolicy(policy || {});
  const minChunkSize = Math.max(1, Math.min(chunkSize.width, chunkSize.depth));
  const defaultSnap = normalizedMode === "game"
    ? num(WORLD_PERFORMANCE_DEFAULTS.game.shadow?.snapWorldUnits, 10)
    : num(WORLD_PERFORMANCE_DEFAULTS.editor.shadow?.snapWorldUnits, 10);
  return Math.max(1, Math.floor(num(policy?.snapWorldUnits, defaultSnap)));
}

export function shadowResidentRadiusChunksForPolicy(policy, mode = "editor") {
  const normalizedMode = stableShadowModeName(mode);
  const chunkSize = chunkSizeForPolicy(policy || {});
  const minChunkSize = Math.max(1, Math.min(chunkSize.width, chunkSize.depth));
  const defaultCameraSize = normalizedMode === "game"
    ? num(WORLD_PERFORMANCE_DEFAULTS.game.shadow?.cameraSize, WORLD_PERFORMANCE_DEFAULTS.game.shadowCameraSize)
    : num(WORLD_PERFORMANCE_DEFAULTS.editor.shadow?.cameraSize, WORLD_PERFORMANCE_DEFAULTS.editor.shadowCameraSize);
  const cameraSize = Math.max(5, num(policy?.cameraSize, defaultCameraSize));
  const viewportRadiusChunks = Math.max(1, Math.ceil(cameraSize / minChunkSize));
  const preloadRadiusChunks = Math.max(1,
    chunkInteger(policy?.activeRadiusChunks, 0) + Math.max(1, chunkInteger(policy?.preloadMarginChunks, 1)));
  const shadowMarginChunks = Math.max(0, chunkInteger(policy?.shadowResidentMarginChunks, 0));
  return Math.max(viewportRadiusChunks, preloadRadiusChunks) + shadowMarginChunks;
}

export function resolveStableShadowFocus(options = {}) {
  const mode = stableShadowModeName(options.mode);
  const policy = options.policy || null;
  const groundY = Number.isFinite(Number(options.groundY))
    ? num(options.groundY, 0)
    : 0;
  const focusSource = options.focus
    || (mode === "editor"
      ? (options.contentCenter || options.worldCenter || options.startPosition || options.player || options.camTarget || options.camera?.target || options.camera?.position || null)
      : (options.player || options.startPosition || options.worldCenter || options.camTarget || options.camera?.target || null));
  const focus = {
    x: num(focusSource?.x, 0),
    y: num(focusSource?.y, groundY),
    z: num(focusSource?.z, 0)
  };
  const snapWorldUnits = Math.max(1, num(options.snapWorldUnits, shadowSnapWorldUnitsForPolicy(policy, mode)));
  const previousSnapCell = options.previous?.stableSnapCell || options.previousStableSnapCell || null;
  const previousCellX = Number.isFinite(Number(previousSnapCell?.x)) ? Math.trunc(Number(previousSnapCell.x)) : null;
  const previousCellZ = Number.isFinite(Number(previousSnapCell?.z)) ? Math.trunc(Number(previousSnapCell.z)) : null;
  const hysteresis = Math.max(0.05, snapWorldUnits * 0.1);
  function snapAxis(value, previousCell) {
    if (Number.isFinite(previousCell)) {
      const previousCenter = previousCell * snapWorldUnits;
      const halfSpan = snapWorldUnits / 2;
      if (Math.abs(value - previousCenter) <= Math.max(0, halfSpan - hysteresis)) {
        return previousCell;
      }
    }
    return Math.round(value / snapWorldUnits);
  }
  const stableCellX = snapAxis(focus.x, previousCellX);
  const stableCellZ = snapAxis(focus.z, previousCellZ);
  const snappedFocus = {
    x: round(stableCellX * snapWorldUnits),
    y: round(focus.y),
    z: round(stableCellZ * snapWorldUnits)
  };
  const previousSnappedFocus = options.previous?.snappedFocus || null;
  const lastJumpDistance = previousSnappedFocus
    ? round(Math.hypot(snappedFocus.x - num(previousSnappedFocus.x, snappedFocus.x), snappedFocus.z - num(previousSnappedFocus.z, snappedFocus.z)))
    : 0;
  const jumpDetected = lastJumpDistance > snapWorldUnits * 1.5;
  return {
    mode: mode,
    source: mode === "editor"
      ? (options.orbitTarget ? "editor_target" : (options.camera?.target ? "editor_camera_target" : "editor_focus"))
      : (options.player ? "player" : "game_focus"),
    focus: focus,
    rawFocus: focus,
    snappedFocus: snappedFocus,
    stableSnapCell: {
      x: stableCellX,
      z: stableCellZ,
      worldUnits: snapWorldUnits
    },
    lastJumpDistance: lastJumpDistance,
    jumpDetected: jumpDetected
  };
}

export function resolveStableShadowChunkWindows(options = {}) {
  const mode = stableShadowModeName(options.mode);
  const policy = options.policy || null;
  const focus = options.focus || resolveStableShadowFocus(options);
  const renderResidentChunkKeys = sortChunkKeys(Array.isArray(options.renderResidentChunkKeys)
    ? options.renderResidentChunkKeys
    : Array.isArray(options.loadedChunkKeys)
      ? options.loadedChunkKeys
      : []);
  const visibleChunkKeys = sortChunkKeys(Array.isArray(options.visibleChunkKeys) ? options.visibleChunkKeys : []);
  const preloadChunkKeys = sortChunkKeys(Array.isArray(options.preloadChunkKeys) ? options.preloadChunkKeys : []);
  const forwardChunkKeys = sortChunkKeys(Array.isArray(options.forwardChunkKeys) ? options.forwardChunkKeys : []);
  const collisionResidentChunkKeys = sortChunkKeys(Array.isArray(options.collisionResidentChunkKeys)
    ? options.collisionResidentChunkKeys
    : visibleChunkKeys.concat(preloadChunkKeys));
  if (!policy || policy.source === "none" || policy.enabled === false) {
    return {
      focus: focus,
      renderResidentChunkKeys: renderResidentChunkKeys,
      collisionResidentChunkKeys: collisionResidentChunkKeys,
      shadowResidentChunkKeys: [],
      shadowWindow: null,
      shadowRadiusChunks: 0
    };
  }
  const shadowRadiusChunks = shadowResidentRadiusChunksForPolicy(policy, mode);
  const focusChunk = chunkCoordForPosition(focus.snappedFocus.x, focus.snappedFocus.z, policy);
  const shadowPolicy = Object.assign({}, policy, {
    activeRadiusChunks: shadowRadiusChunks,
    preloadMarginChunks: Math.max(0, chunkInteger(policy.preloadMarginChunks, 1)),
    unloadMarginChunks: Math.max(0, chunkInteger(policy.unloadMarginChunks, 1)),
    maxLoadedChunks: Number.MAX_SAFE_INTEGER
  });
  const shadowWindow = buildChunkWindow(focusChunk, shadowPolicy, mode);
  const shadowResident = new Set(renderResidentChunkKeys);
  for (const key of visibleChunkKeys) shadowResident.add(key);
  for (const key of preloadChunkKeys) shadowResident.add(key);
  for (const key of forwardChunkKeys) shadowResident.add(key);
  for (const key of shadowWindow.loadedChunkKeys || []) shadowResident.add(key);
  return {
    focus: focus,
    renderResidentChunkKeys: renderResidentChunkKeys,
    collisionResidentChunkKeys: collisionResidentChunkKeys,
    shadowResidentChunkKeys: sortChunkKeys(Array.from(shadowResident)),
    shadowWindow: shadowWindow,
    shadowRadiusChunks: shadowRadiusChunks
  };
}

// Fase 8.7: the renderer reads the concrete published editor/game fields directly. Presets are
// already resolved into visible node values before publish, so runtime only normalizes old worlds
// and applies the software-renderer fallback.
export function resolveWorldPerformanceForRenderer(worldData, rendererProfile = { software: false }) {
  const source = worldData?.world?.performance || {};
  const worldRoot = worldData?.world || {};
  const sharedSource = source.shared || {};
  const shared = {
    worldId: sharedSource.worldId ?? worldRoot.id ?? WORLD_PERFORMANCE_DEFAULTS.shared.worldId,
    displayName: sharedSource.displayName ?? worldRoot.displayName ?? WORLD_PERFORMANCE_DEFAULTS.shared.displayName,
    backgroundColor: sharedSource.backgroundColor ?? worldRoot.backgroundColor ?? WORLD_PERFORMANCE_DEFAULTS.shared.backgroundColor,
    fogColor: sharedSource.fogColor ?? worldRoot.fogColor ?? WORLD_PERFORMANCE_DEFAULTS.shared.fogColor,
    fogDensity: num(sharedSource.fogDensity ?? worldRoot.fogDensity, WORLD_PERFORMANCE_DEFAULTS.shared.fogDensity),
    smoothShading: sharedSource.smoothShading !== false && worldRoot.smoothShading !== false
  };
  const gameSource = Object.assign({}, WORLD_PERFORMANCE_DEFAULTS.game, source.game || {});
  const editorSource = Object.assign({}, WORLD_PERFORMANCE_DEFAULTS.editor, source.editor || {});
  const gamePolicy = resolveModeShadowPolicy(gameSource, "game");
  const editorPolicy = resolveModeShadowPolicy(editorSource, "editor");
  const buildShadowReadModel = function (policy) {
    return {
      preset: policy.preset,
      enabled: policy.enabled,
      mapSize: policy.mapSize,
      cameraSize: policy.cameraSize,
      cameraNear: policy.cameraNear,
      cameraFar: policy.cameraFar,
      bias: policy.bias,
      normalBias: policy.normalBias,
      type: policy.type,
      updateMode: policy.updateMode,
      snapWorldUnits: policy.snapWorldUnits,
      focusMode: policy.focusMode,
      staticPropsCast: policy.staticPropsCast,
      staticPropsReceive: policy.staticPropsReceive,
      scatterCast: policy.scatterCast,
      scatterReceive: policy.scatterReceive,
      groundReceives: policy.groundReceives,
      terrainReceives: policy.terrainReceives,
      shadowResidentMarginChunks: policy.shadowResidentMarginChunks
    };
  };
  const software = rendererProfile?.software === true;
  const gamePerformance = Object.assign({}, gameSource, {
    preset: normalizeWorldSettingsPreset(gameSource.preset ?? "", WORLD_PERFORMANCE_DEFAULTS.game.preset),
    shadow: buildShadowReadModel(gamePolicy),
    shadowsEnabled: gamePolicy.enabled,
    shadowQuality: gamePolicy.quality,
    shadowMapSize: gamePolicy.mapSize,
    shadowCameraSize: gamePolicy.cameraSize,
    shadowCameraNear: gamePolicy.cameraNear,
    shadowCameraFar: gamePolicy.cameraFar,
    shadowBias: gamePolicy.bias,
    shadowNormalBias: gamePolicy.normalBias,
    shadowType: gamePolicy.type,
    staticPropCastShadows: gamePolicy.staticPropsCast,
    staticPropReceiveShadows: gamePolicy.staticPropsReceive,
    scatterCastShadows: gamePolicy.scatterCast,
    scatterReceiveShadows: gamePolicy.scatterReceive,
    groundReceiveShadows: gamePolicy.groundReceives,
    terrainReceiveShadows: gamePolicy.terrainReceives
  });
  const editorPerformance = Object.assign({}, editorSource, {
    preset: normalizeWorldSettingsPreset(editorSource.preset ?? "", WORLD_PERFORMANCE_DEFAULTS.editor.preset),
    shadow: buildShadowReadModel(editorPolicy),
    shadowsEnabled: editorPolicy.enabled,
    shadowQuality: editorPolicy.quality,
    shadowMapSize: editorPolicy.mapSize,
    shadowCameraSize: editorPolicy.cameraSize,
    shadowCameraNear: editorPolicy.cameraNear,
    shadowCameraFar: editorPolicy.cameraFar,
    shadowBias: editorPolicy.bias,
    shadowNormalBias: editorPolicy.normalBias,
    shadowType: editorPolicy.type,
    staticPropCastShadows: editorPolicy.staticPropsCast,
    staticPropReceiveShadows: editorPolicy.staticPropsReceive,
    scatterCastShadows: editorPolicy.scatterCast,
    scatterReceiveShadows: editorPolicy.scatterReceive,
    groundReceiveShadows: editorPolicy.groundReceives,
    terrainReceiveShadows: editorPolicy.terrainReceives
  });
  if (software) {
    editorPerformance.pixelRatioCap = Math.min(num(editorPerformance.pixelRatioCap, WORLD_PERFORMANCE_DEFAULTS.editor.pixelRatioCap), 1);
    gamePerformance.pixelRatioCap = Math.min(num(gamePerformance.pixelRatioCap, WORLD_PERFORMANCE_DEFAULTS.game.pixelRatioCap), 0.7);
    if (gamePerformance.shadow) {
      gamePerformance.shadow.enabled = false;
      gamePerformance.shadow.preset = "geen_schaduw";
      gamePerformance.shadow.mapSize = 0;
      gamePerformance.shadow.cameraSize = 0;
      gamePerformance.shadow.cameraFar = 0;
      gamePerformance.shadow.shadowResidentMarginChunks = 0;
    }
    gamePerformance.shadowsEnabled = false;
    gamePerformance.shadowQuality = "off";
    gamePerformance.shadowMapSize = 0;
    gamePerformance.shadowCameraSize = 0;
    gamePerformance.shadowCameraFar = 0;
    gamePerformance.shadowType = "basic";
  }
  const legacyPerformanceUsed = Boolean(
    (source.compatibility?.usedLegacyWorldSettingsPerformanceFields ?? source.compatibility?.usedLegacySharedShadowFields) ||
    gamePolicy.legacyFieldsIgnored ||
    editorPolicy.legacyFieldsIgnored
  );
  return {
    shared: shared,
    game: gamePerformance,
    editor: editorPerformance,
    compatibility: {
      usedLegacyWorldSettingsPerformanceFields: legacyPerformanceUsed,
      legacyShadowFieldsMigrated: Boolean(
        source.compatibility?.legacyShadowFieldsMigrated ??
        source.compatibility?.usedLegacyWorldSettingsPerformanceFields ??
        source.compatibility?.usedLegacySharedShadowFields ??
        legacyPerformanceUsed
      )
    }
  };
}

const OBJECT_VISIBILITY_HOLD_MS = 350;
const OBJECT_VISIBILITY_EXIT_MARGIN_CHUNKS = 1;

const CHUNK_POLICY_DEFAULTS = {
  editor: {
    enabled: false,
    chunkProfileId: "editor_chunks",
    chunkWidth: 100,
    chunkDepth: 100,
    tileSize: 1,
    activeRadiusChunks: 2,
    preloadMarginChunks: 1,
    unloadMarginChunks: 2,
    maxLoadedChunks: 49,
    debugOverlay: true,
    residentEntityBudget: 200,
    residentObjectBudget: 300,
    residentScatterInstanceBudget: 500,
    residentChunkBuildBudgetPerFrame: 2,
    groundChunkingEnabled: true,
    pathWaterSurfaceChunkingEnabled: false,
    terrainVisualChunkingEnabled: false,
    showChunkGrid: true,
    showChunkLabels: false,
    keepSelectedChunkLoaded: true,
    cameraOnly: false,
    cameraOffsetZChunks: 0,
    fixedCameraPaddingTiles: 0,
    strictUnloadOutsideCamera: false
  },
  game: {
    enabled: false,
    chunkProfileId: "game_chunks",
    chunkWidth: 14,
    chunkDepth: 14,
    tileSize: 0.5,
    activeRadiusChunks: 3,
    preloadMarginChunks: 1,
    unloadMarginChunks: 1,
    maxLoadedChunks: 81,
    debugOverlay: false,
    residentEntityBudget: 200,
    residentObjectBudget: 300,
    residentScatterInstanceBudget: 500,
    residentChunkBuildBudgetPerFrame: 2,
    groundChunkingEnabled: true,
    pathWaterSurfaceChunkingEnabled: true,
    terrainVisualChunkingEnabled: true,
    showChunkGrid: true,
    showChunkLabels: false,
    keepSelectedChunkLoaded: false,
    cameraOnly: true,
    cameraOffsetZChunks: -1,
    fixedCameraPaddingTiles: 0,
    strictUnloadOutsideCamera: true
  }
};

function chunkInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function signedChunkInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function chunkCoordInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.floor(parsed);
}

function maxLoadedChunksForValue(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

function applyChunkLoadingZOffset(point, policy, mode) {
  if (!point || mode !== "game") return point;
  const offsetChunks = signedChunkInteger(policy?.cameraOffsetZChunks, 0);
  if (!offsetChunks) return point;
  const size = chunkSizeForPolicy(policy);
  return Object.assign({}, point, {
    z: num(point.z, 0) + (offsetChunks * size.depth)
  });
}

export function resolveChunkPolicy(worldData, mode = "editor") {
  const modeName = mode === "game" ? "game" : "editor";
  const policy = modeName === "game"
    ? worldData?.chunkLoading?.game || null
    : worldData?.chunkLoading?.editor || null;
  const defaults = CHUNK_POLICY_DEFAULTS[modeName];
  if (!policy) {
    const fallbackSize = chunkSizeForPolicy(defaults);
    return {
      mode: modeName,
      source: "none",
      policyId: null,
      type: modeName,
      enabled: false,
      chunkProfileId: defaults.chunkProfileId,
      chunkWidth: defaults.chunkWidth,
      chunkDepth: defaults.chunkDepth,
      tileSize: defaults.tileSize,
      chunkWorldWidth: fallbackSize.width,
      chunkWorldDepth: fallbackSize.depth,
      activeRadiusChunks: defaults.activeRadiusChunks,
      preloadMarginChunks: defaults.preloadMarginChunks,
      unloadMarginChunks: defaults.unloadMarginChunks,
      preloadRadiusChunks: defaults.activeRadiusChunks + defaults.preloadMarginChunks,
      loadedRadiusChunks: defaults.activeRadiusChunks + Math.max(defaults.preloadMarginChunks, defaults.unloadMarginChunks),
      maxLoadedChunks: defaults.maxLoadedChunks,
      debugOverlay: false,
      residentEntityBudget: defaults.residentEntityBudget,
      residentObjectBudget: defaults.residentObjectBudget,
      residentScatterInstanceBudget: defaults.residentScatterInstanceBudget,
      residentChunkBuildBudgetPerFrame: defaults.residentChunkBuildBudgetPerFrame,
      groundChunkingEnabled: defaults.groundChunkingEnabled,
      pathWaterSurfaceChunkingEnabled: defaults.pathWaterSurfaceChunkingEnabled,
      terrainVisualChunkingEnabled: defaults.terrainVisualChunkingEnabled,
      showChunkGrid: false,
      showChunkLabels: false,
      keepSelectedChunkLoaded: defaults.keepSelectedChunkLoaded,
      cameraOnly: defaults.cameraOnly,
      cameraOffsetZChunks: defaults.cameraOffsetZChunks,
      fixedCameraPaddingTiles: defaults.fixedCameraPaddingTiles,
      fixedCameraPaddingChunks: 0,
      strictUnloadOutsideCamera: defaults.strictUnloadOutsideCamera
    };
  }
  const chunkWidth = Math.max(1, chunkInteger(policy.chunkWidth, defaults.chunkWidth));
  const chunkDepth = Math.max(1, chunkInteger(policy.chunkDepth, defaults.chunkDepth));
  const tileSize = Math.max(0.01, num(policy.tileSize, defaults.tileSize));
  const fixedCameraPaddingTiles = modeName === "game" ? chunkInteger(policy.fixedCameraPaddingTiles, defaults.fixedCameraPaddingTiles) : 0;
  const fixedCameraPaddingChunks = modeName === "game"
    ? Math.max(0, Math.floor(fixedCameraPaddingTiles / Math.max(1, Math.min(chunkWidth, chunkDepth))))
    : 0;
  const cameraOffsetZChunks = signedChunkInteger(policy.cameraOffsetZChunks, defaults.cameraOffsetZChunks);
  const activeRadiusChunks = modeName === "game"
    ? chunkInteger(policy.gameViewRadiusChunks, defaults.activeRadiusChunks) + fixedCameraPaddingChunks
    : chunkInteger(policy.editorViewRadiusChunks, defaults.activeRadiusChunks);
  const preloadMarginChunks = chunkInteger(policy.preloadMarginChunks, defaults.preloadMarginChunks);
  const unloadMarginChunks = chunkInteger(policy.unloadMarginChunks, defaults.unloadMarginChunks);
  const size = chunkSizeForPolicy({ chunkWidth: chunkWidth, chunkDepth: chunkDepth, tileSize: tileSize });
  return {
    mode: modeName,
    source: modeName,
    policyId: policy.id || null,
    type: policy.type || modeName,
    enabled: policy.enabled !== false,
    chunkProfileId: policy.chunkProfileId || defaults.chunkProfileId,
    chunkWidth: chunkWidth,
    chunkDepth: chunkDepth,
    tileSize: tileSize,
    chunkWorldWidth: size.width,
    chunkWorldDepth: size.depth,
    activeRadiusChunks: activeRadiusChunks,
    preloadMarginChunks: preloadMarginChunks,
    unloadMarginChunks: unloadMarginChunks,
    preloadRadiusChunks: activeRadiusChunks + preloadMarginChunks,
    loadedRadiusChunks: activeRadiusChunks + Math.max(preloadMarginChunks, unloadMarginChunks),
    maxLoadedChunks: maxLoadedChunksForValue(policy.maxLoadedChunks, defaults.maxLoadedChunks),
    debugOverlay: policy.debugOverlay === true,
    residentEntityBudget: numberOrFallback(policy.residentEntityBudget, defaults.residentEntityBudget),
    residentObjectBudget: numberOrFallback(policy.residentObjectBudget, defaults.residentObjectBudget),
    residentScatterInstanceBudget: numberOrFallback(policy.residentScatterInstanceBudget, defaults.residentScatterInstanceBudget),
    residentChunkBuildBudgetPerFrame: Math.max(1, chunkInteger(policy.residentChunkBuildBudgetPerFrame, defaults.residentChunkBuildBudgetPerFrame)),
    groundChunkingEnabled: policy.groundChunkingEnabled !== false,
    pathWaterSurfaceChunkingEnabled: policy.pathWaterSurfaceChunkingEnabled === true,
    terrainVisualChunkingEnabled: policy.terrainVisualChunkingEnabled === true,
    showChunkGrid: modeName === "editor" ? policy.showChunkGrid !== false : true,
    showChunkLabels: modeName === "editor" ? policy.showChunkLabels === true : false,
    keepSelectedChunkLoaded: modeName === "editor" ? policy.keepSelectedChunkLoaded !== false : false,
    cameraOnly: modeName === "game" ? policy.cameraOnly !== false : false,
    cameraOffsetZChunks: cameraOffsetZChunks,
    fixedCameraPaddingTiles: fixedCameraPaddingTiles,
    fixedCameraPaddingChunks: fixedCameraPaddingChunks,
    strictUnloadOutsideCamera: modeName === "game" ? policy.strictUnloadOutsideCamera !== false : false
  };
}

export function chunkSizeForPolicy(policy) {
  const chunkWidth = Math.max(1, chunkInteger(policy?.chunkWidth, 100));
  const chunkDepth = Math.max(1, chunkInteger(policy?.chunkDepth, 100));
  const tileSize = Math.max(0.01, num(policy?.tileSize, 1));
  return {
    width: chunkWidth * tileSize,
    depth: chunkDepth * tileSize,
    tileSize: tileSize
  };
}

export function chunkWorldSize(policy) {
  return chunkSizeForPolicy(policy);
}

export function chunkCoordForPosition(x, z, policy) {
  const size = chunkSizeForPolicy(policy);
  const safeX = Number.isFinite(Number(x)) ? Number(x) : 0;
  const safeZ = Number.isFinite(Number(z)) ? Number(z) : 0;
  return {
    x: Math.floor(safeX / size.width),
    z: Math.floor(safeZ / size.depth)
  };
}

export function chunkKey(coord) {
  return String(chunkCoordInteger(coord?.x, 0)) + "," + String(chunkCoordInteger(coord?.z, 0));
}

export function chunkKeyForPosition(x, z, policy) {
  return chunkKey(chunkCoordForPosition(x, z, policy));
}

export function chunkDistanceFromCenter(coord, centerCoord) {
  return Math.hypot(chunkCoordInteger(coord?.x, 0) - chunkCoordInteger(centerCoord?.x, 0), chunkCoordInteger(coord?.z, 0) - chunkCoordInteger(centerCoord?.z, 0));
}

function chebyshevChunkDistance(coord, centerCoord) {
  return Math.max(Math.abs(chunkCoordInteger(coord?.x, 0) - chunkCoordInteger(centerCoord?.x, 0)), Math.abs(chunkCoordInteger(coord?.z, 0) - chunkCoordInteger(centerCoord?.z, 0)));
}

function chunkCoordSort(a, b) {
  if ((a?.x || 0) !== (b?.x || 0)) return (a?.x || 0) - (b?.x || 0);
  return (a?.z || 0) - (b?.z || 0);
}

function chunkDistanceSort(a, b) {
  if ((a?.distance || 0) !== (b?.distance || 0)) return (a?.distance || 0) - (b?.distance || 0);
  return chunkCoordSort(a, b);
}

export function buildChunkWindow(centerCoord, policy, mode = "editor") {
  const normalizedPolicy = policy?.chunkWorldWidth
    ? policy
    : resolveChunkPolicy({ chunkLoading: { [mode === "game" ? "game" : "editor"]: policy || null } }, mode);
  const center = {
    x: chunkCoordInteger(centerCoord?.x, 0),
    z: chunkCoordInteger(centerCoord?.z, 0)
  };
  const activeRadiusChunks = chunkInteger(normalizedPolicy.activeRadiusChunks, 0);
  const preloadMarginChunks = chunkInteger(normalizedPolicy.preloadMarginChunks, 0);
  const unloadMarginChunks = chunkInteger(normalizedPolicy.unloadMarginChunks, 0);
  const preloadRadiusChunks = activeRadiusChunks + preloadMarginChunks;
  const loadedRadiusChunks = activeRadiusChunks + Math.max(preloadMarginChunks, unloadMarginChunks);
  const candidates = [];
  for (let chunkX = center.x - loadedRadiusChunks; chunkX <= center.x + loadedRadiusChunks; chunkX += 1) {
    for (let chunkZ = center.z - loadedRadiusChunks; chunkZ <= center.z + loadedRadiusChunks; chunkZ += 1) {
      const coord = { x: chunkX, z: chunkZ };
      const chebyshev = chebyshevChunkDistance(coord, center);
      const key = chunkKey(coord);
      candidates.push({
        x: chunkX,
        z: chunkZ,
        key: key,
        chebyshev: chebyshev,
        distance: chunkDistanceFromCenter(coord, center)
      });
    }
  }
  let clippedByMaxLoadedChunks = false;
  const maxLoadedChunks = maxLoadedChunksForValue(normalizedPolicy.maxLoadedChunks, candidates.length || 1);
  const activeTier = candidates.filter(function (coord) { return coord.chebyshev <= activeRadiusChunks; }).sort(chunkDistanceSort);
  const preloadTier = candidates.filter(function (coord) { return coord.chebyshev > activeRadiusChunks && coord.chebyshev <= preloadRadiusChunks; }).sort(chunkDistanceSort);
  const marginTier = candidates.filter(function (coord) { return coord.chebyshev > preloadRadiusChunks; }).sort(chunkDistanceSort);
  const requiredActiveChunks = activeTier.length;
  // Priority order active > preload > margin so a tight maxLoadedChunks budget never evicts a
  // closer active/preload chunk in favor of a farther margin chunk (that silently broke the
  // "active radius is always resident" contract and starved the preload ring to zero).
  let loadedCandidates = activeTier.concat(preloadTier, marginTier);
  if (loadedCandidates.length > maxLoadedChunks) {
    clippedByMaxLoadedChunks = true;
    loadedCandidates = loadedCandidates.slice(0, maxLoadedChunks);
  }
  const loadedActiveChunks = loadedCandidates.filter(function (coord) { return coord.chebyshev <= activeRadiusChunks; }).length;
  const clippedActiveChunks = Math.max(0, requiredActiveChunks - loadedActiveChunks);
  loadedCandidates.sort(chunkCoordSort);
  const loadedChunkKeys = loadedCandidates.map(function (coord) { return coord.key; });
  const loadedChunkKeySet = new Set(loadedChunkKeys);
  const activeChunks = [];
  const preloadChunks = [];
  const loadedOnlyChunks = [];
  for (const coord of loadedCandidates) {
    if (coord.chebyshev <= activeRadiusChunks) {
      activeChunks.push({ x: coord.x, z: coord.z, key: coord.key });
    } else if (coord.chebyshev <= preloadRadiusChunks) {
      preloadChunks.push({ x: coord.x, z: coord.z, key: coord.key });
    } else {
      loadedOnlyChunks.push({ x: coord.x, z: coord.z, key: coord.key });
    }
  }
  return {
    centerChunk: { x: center.x, z: center.z, key: chunkKey(center) },
    activeRadiusChunks: activeRadiusChunks,
    preloadRadiusChunks: preloadRadiusChunks,
    loadedRadiusChunks: loadedRadiusChunks,
    maxLoadedChunks: maxLoadedChunks,
    clippedByMaxLoadedChunks: clippedByMaxLoadedChunks,
    requiredActiveChunks: requiredActiveChunks,
    clippedActiveChunks: clippedActiveChunks,
    activeRadiusUnmet: clippedActiveChunks > 0,
    activeChunks: activeChunks,
    preloadChunks: preloadChunks,
    loadedOnlyChunks: loadedOnlyChunks,
    loadedChunks: loadedCandidates.map(function (coord) {
      return { x: coord.x, z: coord.z, key: coord.key };
    }),
    activeChunkKeys: activeChunks.map(function (coord) { return coord.key; }),
    preloadChunkKeys: preloadChunks.map(function (coord) { return coord.key; }),
    loadedChunkKeys: loadedChunkKeys,
    loadedChunkKeySet: loadedChunkKeySet
  };
}

function normalizeMaterialList(material) {
  if (!material) return [];
  return Array.isArray(material) ? material.filter(Boolean) : [material];
}

function materialColorSummary(material) {
  if (!material) return null;
  try {
    if (material.color && material.color.isColor && typeof material.color.getHexString === "function") {
      return "#" + material.color.getHexString();
    }
  } catch {
    // ignore
  }
  return null;
}

function geometryTypeSummary(geometry) {
  if (!geometry) return null;
  return String(geometry.type || geometry.constructor?.name || "unknown");
}

function worldVectorSummary(object, kind = "position") {
  const vector = new THREE.Vector3();
  try {
    if (kind === "position" && typeof object?.getWorldPosition === "function") {
      object.getWorldPosition(vector);
      return { x: round(vector.x), y: round(vector.y), z: round(vector.z) };
    }
    if (kind === "scale" && typeof object?.getWorldScale === "function") {
      object.getWorldScale(vector);
      return { x: round(vector.x), y: round(vector.y), z: round(vector.z) };
    }
    if (kind === "rotation" && typeof object?.getWorldQuaternion === "function") {
      const quaternion = new THREE.Quaternion();
      const euler = new THREE.Euler();
      object.getWorldQuaternion(quaternion);
      euler.setFromQuaternion(quaternion, "XYZ");
      return {
        x: round(euler.x),
        y: round(euler.y),
        z: round(euler.z)
      };
    }
  } catch {
    // ignore
  }
  const source = kind === "scale" ? object?.scale : object?.position;
  return {
    x: round(num(source?.x, 0)),
    y: round(num(source?.y, 0)),
    z: round(num(source?.z, 0))
  };
}

function objectBoundingBoxSummary(object) {
  if (!object) return { x: 0, y: 0, z: 0 };
  try {
    const box = new THREE.Box3().setFromObject(object);
    if (!box || box.isEmpty()) return { x: 0, y: 0, z: 0 };
    const size = new THREE.Vector3();
    box.getSize(size);
    return {
      x: round(size.x),
      y: round(size.y),
      z: round(size.z)
    };
  } catch {
    return { x: 0, y: 0, z: 0 };
  }
}

function objectUserDataKeys(object) {
  try {
    return Object.keys(object?.userData || {}).sort();
  } catch {
    return [];
  }
}

function objectAncestorChain(object, ancestor) {
  let current = object || null;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent || null;
  }
  return false;
}

function objectNameSummary(object) {
  return String(object?.name || "").trim();
}

function objectTypeSummary(object) {
  return String(object?.type || object?.constructor?.name || "Object3D");
}

function hasWorldRuntimeMarkers(object) {
  if (!object) return false;
  const userData = object.userData || {};
  if (userData.runtimeAlive === true) return true;
  if (userData.runtimeResourcesShared === true) return true;
  if (userData.terrainRuntime === true) return true;
  if (userData.terrainChunkEntryId) return true;
  if (userData.groundTile === true || userData.groundPlane === true) return true;
  if (userData.chunkRuntimeType) return true;
  if (userData.batchKind) return true;
  if (userData.entityId || userData.playerId || userData.interactableId) return true;
  if (userData.scatterInstance === true) return true;
  if (userData.surfaceLayerId) return true;
  if (userData.shadowProxy === true) return true;
  return false;
}

function isMeshLikeObject(object) {
  return Boolean(object && (object.isMesh === true || object.isInstancedMesh === true));
}

function isPlaneGeometryObject(object) {
  const geometryType = geometryTypeSummary(object?.geometry);
  return geometryType === "PlaneGeometry";
}

function isCircleOrPlaneGeometryObject(object) {
  const geometryType = geometryTypeSummary(object?.geometry);
  return geometryType === "PlaneGeometry" || geometryType === "CircleGeometry";
}

function isShadowProxyObject(object) {
  return Boolean(object?.userData?.shadowProxy === true);
}

function isOverlayPlaneName(name) {
  const normalized = String(name || "").trim().toLowerCase();
  return normalized.includes("chunk overlay")
    || normalized.includes("terrain overlay")
    || normalized.includes("debug overlay")
    || normalized.includes("editor terrain overlay")
    || normalized.includes("editor scatter overlay")
    || normalized.includes("camera overlay")
    || normalized.includes("chunk fill")
    || normalized.includes("chunk plane")
    || normalized.includes("shadow helper plane")
    || normalized.includes("shadow helper");
}

function collectGhostPlaneCandidateRecord(object, context = {}) {
  if (!isMeshLikeObject(object)) return null;
  const camera = context.camera || null;
  const debugOverlayVisible = context.debugOverlayVisible === true;
  const world = context.world || null;
  const chunkedGround = context.chunkedGround === true;
  const name = objectNameSummary(object);
  const type = objectTypeSummary(object);
  const parent = object.parent || null;
  const parentName = objectNameSummary(parent);
  const parentType = objectTypeSummary(parent);
  const isCameraChild = Boolean(camera && objectAncestorChain(object, camera));
  const geometryType = geometryTypeSummary(object.geometry);
  const material = normalizeMaterialList(object.material)[0] || null;
  const materialType = material ? String(material.type || material.constructor?.name || "Material") : null;
  const materialColor = materialColorSummary(material);
  const opacity = material ? round(num(material.opacity, 1)) : 1;
  const userDataKeys = objectUserDataKeys(object);
  const worldPosition = worldVectorSummary(object, "position");
  const worldRotation = worldVectorSummary(object, "rotation");
  const worldScale = worldVectorSummary(object, "scale");
  const boundingSize = objectBoundingBoxSummary(object);
  const isPlaneGeometry = isPlaneGeometryObject(object);
  const isCircleOrPlaneGeometry = isCircleOrPlaneGeometryObject(object);
  const isDebugOverlay = Boolean(isDebugOverlayObject(object) || object.userData?.debugOverlay === true || object.userData?.debugOverlayRoot === true);
  const isRuntimeTerrain = Boolean(object.userData?.terrainRuntime === true || object.userData?.groundTile === true || object.userData?.groundPlane === true || object.userData?.terrainChunkEntryId);
  const isAllowedWorldObject = Boolean(
    isRuntimeTerrain
    || object.userData?.shadowProxy === true
    || object.userData?.runtimeAlive === true
    || object.userData?.runtimeResourcesShared === true
    || object.userData?.batchKind
    || object.userData?.chunkRuntimeType
    || object.userData?.entityId
    || object.userData?.playerId
    || object.userData?.interactableId
    || object.userData?.scatterInstance === true
    || object.userData?.surfaceLayerId
  );
  const suspiciousFlags = [];
  if (isCameraChild) suspiciousFlags.push("cameraChild");
  if (isDebugOverlay && !debugOverlayVisible) suspiciousFlags.push("debugOverlayOff");
  if (isOverlayPlaneName(name)) suspiciousFlags.push("overlayName");
  if (isPlaneGeometry && !isAllowedWorldObject) suspiciousFlags.push("planeGeometry");
  if (isCircleOrPlaneGeometry && !isAllowedWorldObject) suspiciousFlags.push("flatGeometry");
  if (!userDataKeys.length && (isPlaneGeometry || isCircleOrPlaneGeometry)) suspiciousFlags.push("missingUserData");
  if (object.userData?.groundPlane === true && chunkedGround && object.userData?.terrainChunkDisposed !== true) {
    suspiciousFlags.push("staleFullGroundPlane");
  }
  if (material && material.transparent === true && material.opacity < 1 && !isAllowedWorldObject) suspiciousFlags.push("transparentPlane");
  if (material && material.depthTest === false && !isAllowedWorldObject) suspiciousFlags.push("depthTestOff");
  if (material && material.depthWrite === false && !isAllowedWorldObject) suspiciousFlags.push("depthWriteOff");
  if (material && material.side === THREE.DoubleSide && !isAllowedWorldObject && (isPlaneGeometry || isCircleOrPlaneGeometry)) suspiciousFlags.push("doubleSidedPlane");
  const shouldFlag = suspiciousFlags.length > 0 && !(isDebugOverlay && debugOverlayVisible && !isCameraChild);
  return {
    object: object,
    name: name,
    uuid: String(object.uuid || ""),
    type: type,
    parentName: parentName,
    parentType: parentType,
    isCameraChild: isCameraChild,
    visible: object.visible !== false,
    castShadow: object.castShadow === true,
    receiveShadow: object.receiveShadow === true,
    geometryType: geometryType,
    materialType: materialType,
    materialColor: materialColor,
    opacity: opacity,
    worldPosition: worldPosition,
    worldRotation: worldRotation,
    worldScale: worldScale,
    boundingSize: boundingSize,
    userDataKeys: userDataKeys,
    suspiciousFlags: suspiciousFlags,
    reason: suspiciousFlags.join(", "),
    isPlaneGeometry: isPlaneGeometry,
    isCircleOrPlaneGeometry: isCircleOrPlaneGeometry,
    isDebugOverlay: isDebugOverlay,
    isAllowedWorldObject: isAllowedWorldObject,
    shouldFlag: shouldFlag,
    isShadowProxy: isShadowProxyObject(object)
  };
}

function cloneMaterialForShadowProxy(material) {
  if (!material) return material;
  const clone = typeof material.clone === "function" ? material.clone() : material;
  clone.colorWrite = false;
  clone.depthWrite = true;
  clone.depthTest = true;
  clone.transparent = false;
  clone.opacity = 1;
  clone.needsUpdate = true;
  return clone;
}

function restoreMaterialFromShadowProxy(material, snapshot) {
  if (!material) return material;
  const state = snapshot || material.userData?.shadowProxyOriginalState || null;
  if (state) {
    material.colorWrite = state.colorWrite;
    material.depthWrite = state.depthWrite;
    material.depthTest = state.depthTest;
    material.transparent = state.transparent;
    material.opacity = state.opacity;
  } else {
    material.colorWrite = true;
  }
  material.needsUpdate = true;
  return material;
}

export function setShadowProxyState(object, enabled, options = {}) {
  if (!object || typeof object.traverse !== "function") return 0;
  const nextEnabled = enabled === true;
  let changed = 0;
  object.traverse(function (child) {
    if (!child) return;
    child.userData = child.userData || {};
    if (!isMeshLikeObject(child)) {
      if (nextEnabled) {
        child.userData.shadowProxy = true;
        child.userData.shadowProxyKind = String(options.kind || child.userData.shadowProxyKind || child.userData.batchKind || child.userData.chunkRuntimeType || "shadowProxy");
        child.visible = true;
      } else if (child.userData.shadowProxy === true) {
        child.userData.shadowProxy = false;
        if (child.userData.shadowProxyKind) delete child.userData.shadowProxyKind;
      }
      return;
    }
    const materials = normalizeMaterialList(child.material);
    if (nextEnabled) {
      if (!child.userData.shadowProxyOriginalState) {
        child.userData.shadowProxyOriginalState = {
          castShadow: child.castShadow === true,
          receiveShadow: child.receiveShadow === true,
          visible: child.visible !== false
        };
        child.userData.shadowProxyOriginalMaterials = materials.map(function (material) { return material; });
        if (Array.isArray(child.material)) {
          child.material = child.material.map(function (material) { return cloneMaterialForShadowProxy(material); });
        } else if (child.material) {
          child.material = cloneMaterialForShadowProxy(child.material);
        }
      }
      const nextMaterials = normalizeMaterialList(child.material);
      for (const material of nextMaterials) {
        if (!material) continue;
        material.userData = material.userData || {};
        if (!material.userData.shadowProxyOriginalState) {
          material.userData.shadowProxyOriginalState = {
            colorWrite: material.colorWrite !== false,
            depthWrite: material.depthWrite !== false,
            depthTest: material.depthTest !== false,
            transparent: material.transparent === true,
            opacity: num(material.opacity, 1)
          };
        }
        material.colorWrite = false;
        material.depthWrite = true;
        material.depthTest = true;
        material.transparent = false;
        material.opacity = 1;
        material.needsUpdate = true;
      }
      child.castShadow = child.userData.shadowProxyOriginalState.castShadow && child.castShadow !== false;
      child.receiveShadow = false;
      child.visible = true;
      child.userData.shadowProxy = true;
      child.userData.shadowProxyKind = String(options.kind || child.userData.shadowProxyKind || child.userData.batchKind || child.userData.chunkRuntimeType || "shadowProxy");
      changed += 1;
      return;
    }
    if (!child.userData.shadowProxy && !child.userData.shadowProxyOriginalState) return;
    const originalMaterials = Array.isArray(child.userData.shadowProxyOriginalMaterials)
      ? child.userData.shadowProxyOriginalMaterials.slice()
      : null;
    const currentMaterials = normalizeMaterialList(child.material);
    if (originalMaterials && currentMaterials.length) {
      for (const material of currentMaterials) {
        if (material && originalMaterials.indexOf(material) < 0 && typeof material.dispose === "function") {
          try { material.dispose(); } catch {}
        }
      }
      child.material = originalMaterials.length === 1 ? originalMaterials[0] : originalMaterials.slice();
      for (const material of normalizeMaterialList(child.material)) {
        restoreMaterialFromShadowProxy(material, null);
      }
    } else {
      for (const material of currentMaterials) restoreMaterialFromShadowProxy(material, null);
    }
    if (child.userData.shadowProxyOriginalState) {
      child.castShadow = child.userData.shadowProxyOriginalState.castShadow;
      child.receiveShadow = child.userData.shadowProxyOriginalState.receiveShadow;
      child.visible = child.userData.shadowProxyOriginalState.visible;
      delete child.userData.shadowProxyOriginalState;
    }
    if (child.userData.shadowProxyOriginalMaterials) delete child.userData.shadowProxyOriginalMaterials;
    child.userData.shadowProxy = false;
    if (child.userData.shadowProxyKind) delete child.userData.shadowProxyKind;
    changed += 1;
  });
  return changed;
}

function scanSceneRootsForGhostPlanes(options = {}) {
  const roots = [];
  const seen = new Set();
  const pushRoot = function (root) {
    if (!root || typeof root.traverse !== "function") return;
    if (seen.has(root)) return;
    seen.add(root);
    roots.push(root);
  };
  for (const root of Array.isArray(options.roots) ? options.roots : []) pushRoot(root);
  pushRoot(options.scene || null);
  pushRoot(options.camera || null);
  pushRoot(options.content || null);
  pushRoot(options.terrainRuntimeGroup || null);
  pushRoot(options.chunkDebugOverlay || null);
  pushRoot(options.selectionHelper || null);
  pushRoot(options.transformGuide || null);
  pushRoot(options.terrainEditorOverlay || null);
  pushRoot(options.scatterEditorOverlay || null);
  const visited = new Set();
  const records = [];
  const camera = options.camera || null;
  const debugOverlayVisible = options.debugOverlayVisible === true;
  const mode = String(options.mode || "").trim();
  const chunkedGround = Object.prototype.hasOwnProperty.call(options, "chunkedGround")
    ? options.chunkedGround === true
    : shouldUseChunkedGround(options.world || null, mode || "editor");
  for (const root of roots) {
    root.traverse(function (object) {
      if (!object || visited.has(object)) return;
      visited.add(object);
      const record = collectGhostPlaneCandidateRecord(object, {
        camera: camera,
        world: options.world || null,
        mode: mode,
        debugOverlayVisible: debugOverlayVisible,
        chunkedGround: chunkedGround
      });
      if (!record) return;
      records.push(record);
    });
  }
  return records;
}

export function resolveWorldContentCenter(worldData, options = {}) {
  const groundBounds = effectiveGroundBounds(worldData?.ground);
  if (groundBounds) {
    return {
      x: round((groundBounds.minX + groundBounds.maxX) / 2),
      y: round(num(worldData?.ground?.y, 0)),
      z: round((groundBounds.minZ + groundBounds.maxZ) / 2),
      source: "groundCenter"
    };
  }
  const samples = [];
  const addSample = function (x, z) {
    const px = Number(x);
    const pz = Number(z);
    if (!Number.isFinite(px) || !Number.isFinite(pz)) return;
    samples.push({ x: px, z: pz });
  };
  for (const entity of Array.isArray(worldData?.entities) ? worldData.entities : []) {
    addSample(entity?.transform?.position?.x, entity?.transform?.position?.z);
  }
  for (const inter of Array.isArray(worldData?.interactables) ? worldData.interactables : []) {
    addSample(inter?.position?.x, inter?.position?.z);
  }
  for (const surface of Array.isArray(worldData?.terrain?.surfaces) ? worldData.terrain.surfaces : []) {
    for (const point of Array.isArray(surface?.points) ? surface.points : []) addSample(point?.x, point?.z);
  }
  for (const blocker of Array.isArray(worldData?.collision?.blockers) ? worldData.collision.blockers : []) {
    addSample(blocker?.x, blocker?.z);
    for (const point of Array.isArray(blocker?.points) ? blocker.points : []) addSample(point?.x, point?.z);
  }
  for (const walkable of Array.isArray(worldData?.collision?.walkableSurfaces) ? worldData.collision.walkableSurfaces : []) {
    addSample(walkable?.x, walkable?.z);
    for (const point of Array.isArray(walkable?.points) ? walkable.points : []) addSample(point?.x, point?.z);
  }
  if (!samples.length) return null;
  let minX = samples[0].x;
  let maxX = samples[0].x;
  let minZ = samples[0].z;
  let maxZ = samples[0].z;
  for (const sample of samples) {
    minX = Math.min(minX, sample.x);
    maxX = Math.max(maxX, sample.x);
    minZ = Math.min(minZ, sample.z);
    maxZ = Math.max(maxZ, sample.z);
  }
  return {
    x: round((minX + maxX) / 2),
    y: round(num(worldData?.ground?.y, 0)),
    z: round((minZ + maxZ) / 2),
    source: "contentCenter"
  };
}

export function resolveEditorShadowFocus(options = {}) {
  const groundY = Number.isFinite(Number(options.groundY))
    ? num(options.groundY, 0)
    : 0;
  const snapWorldUnits = Math.max(1, num(options.snapWorldUnits, 10));
  const previousRawFocus = options.previous?.rawFocus || options.previous?.focus || options.previous?.snappedFocus || null;
  const selectionJumpThreshold = Math.max(1, snapWorldUnits * 1.5);
  const selectedObject = options.selectedObject || null;
  if (selectedObject && selectedObject.userData?.shadowProxy !== true) {
    const worldPosition = worldVectorSummary(selectedObject, "position");
    const selectedFocus = {
      x: round(worldPosition.x),
      y: round(Number.isFinite(Number(worldPosition.y)) ? worldPosition.y : groundY),
      z: round(worldPosition.z),
      source: "selected"
    };
    if (!previousRawFocus) return selectedFocus;
    const distance = Math.hypot(selectedFocus.x - num(previousRawFocus.x, selectedFocus.x), selectedFocus.z - num(previousRawFocus.z, selectedFocus.z));
    if (distance <= selectionJumpThreshold) return selectedFocus;
  }
  const selectedPosition = options.selectedPosition || null;
  if (selectedPosition && Number.isFinite(Number(selectedPosition.x)) && Number.isFinite(Number(selectedPosition.z))) {
    return {
      x: round(num(selectedPosition.x, 0)),
      y: round(num(selectedPosition.y, groundY)),
      z: round(num(selectedPosition.z, 0)),
      source: "selected_position"
    };
  }
  const contentCenter = options.contentCenter || (options.worldData ? resolveWorldContentCenter(options.worldData) : null);
  if (contentCenter && Number.isFinite(Number(contentCenter.x)) && Number.isFinite(Number(contentCenter.z))) {
    return {
      x: round(num(contentCenter.x, 0)),
      y: round(num(contentCenter.y, groundY)),
      z: round(num(contentCenter.z, 0)),
      source: contentCenter.source || "contentCenter"
    };
  }
  const worldCenter = options.worldCenter || null;
  if (worldCenter && Number.isFinite(Number(worldCenter.x)) && Number.isFinite(Number(worldCenter.z))) {
    return {
      x: round(num(worldCenter.x, 0)),
      y: round(num(worldCenter.y, groundY)),
      z: round(num(worldCenter.z, 0)),
      source: "worldCenter"
    };
  }
  if (options.startPosition && Number.isFinite(Number(options.startPosition.x)) && Number.isFinite(Number(options.startPosition.z))) {
    return {
      x: round(num(options.startPosition.x, 0)),
      y: round(num(options.startPosition.y, groundY)),
      z: round(num(options.startPosition.z, 0)),
      source: "start"
    };
  }
  if (options.player && Number.isFinite(Number(options.player.x)) && Number.isFinite(Number(options.player.z))) {
    return {
      x: round(num(options.player.x, 0)),
      y: round(num(options.player.y, groundY)),
      z: round(num(options.player.z, 0)),
      source: "player"
    };
  }
  return {
    x: 0,
    y: groundY,
    z: 0,
    source: "worldCenter"
  };
}

export function auditSceneObjectsForGhostPlanes(options = {}) {
  const records = scanSceneRootsForGhostPlanes(options);
  const suspiciousPlanes = records.filter(function (record) { return record.shouldFlag === true; }).map(function (record) {
    return {
      name: record.name,
      uuid: record.uuid,
      parentName: record.parentName,
      parentType: record.parentType,
      isCameraChild: record.isCameraChild,
      visible: record.visible,
      castShadow: record.castShadow,
      receiveShadow: record.receiveShadow,
      geometryType: record.geometryType,
      materialType: record.materialType,
      materialColor: record.materialColor,
      opacity: record.opacity,
      worldPosition: record.worldPosition,
      worldRotation: record.worldRotation,
      worldScale: record.worldScale,
      boundingSize: record.boundingSize,
      userDataKeys: record.userDataKeys,
      suspiciousFlags: record.suspiciousFlags.slice(),
      reason: record.reason
    };
  });
  const scenePlaneCount = records.filter(function (record) {
    return record.geometryType === "PlaneGeometry";
  }).length;
  const cameraChildMeshes = records.filter(function (record) {
    return record.isCameraChild === true && (record.object?.isMesh === true || record.object?.isInstancedMesh === true);
  }).length;
  const cameraChildPlanes = records.filter(function (record) {
    return record.isCameraChild === true && record.geometryType === "PlaneGeometry";
  }).length;
  const visibleDebugPlanes = records.filter(function (record) {
    return record.isDebugOverlay === true && record.visible !== false && record.geometryType === "PlaneGeometry";
  }).length;
  const extraGroundPlanes = records.filter(function (record) {
    return Array.isArray(record.suspiciousFlags) && record.suspiciousFlags.includes("staleFullGroundPlane");
  }).length;
  const sceneChildren = Array.isArray(options.scene?.children) ? options.scene.children : [];
  const terrainRuntimeRootCount = sceneChildren.filter(function (child) {
    return child?.name === "GK runtime terrain visuals";
  }).length;
  const chunkOverlayRootCount = sceneChildren.filter(function (child) {
    return child?.name === "GK chunk debug overlay";
  }).length;
  const duplicateRuntimeRoots = Math.max(0, terrainRuntimeRootCount - 1) + Math.max(0, chunkOverlayRootCount - 1);
  const terrainRuntimeGroups = Array.isArray(options.terrainRuntimeGroups)
    ? options.terrainRuntimeGroups.length
    : (options.terrainRuntimeGroup ? 1 : records.filter(function (record) {
      return record.name === "GK runtime terrain visuals";
    }).length);
  const chunkOverlayGroups = Array.isArray(options.chunkOverlayGroups)
    ? options.chunkOverlayGroups.length
    : (options.chunkDebugOverlay ? 1 : records.filter(function (record) {
      return record.name === "GK chunk debug overlay";
    }).length);
  const cameraChildOverlayGroups = Array.isArray(options.cameraChildOverlayGroups)
    ? options.cameraChildOverlayGroups.length
    : records.filter(function (record) {
      return record.isCameraChild === true && record.isDebugOverlay === true;
    }).length;
  return {
    suspiciousPlanes: suspiciousPlanes,
    removedSuspiciousPlanes: 0,
    cameraChildMeshes: cameraChildMeshes,
    cameraChildPlanes: cameraChildPlanes,
    visibleDebugPlanes: visibleDebugPlanes,
    scenePlaneCount: scenePlaneCount,
    terrainRuntimeGroups: terrainRuntimeGroups,
    chunkOverlayGroups: chunkOverlayGroups,
    duplicateRuntimeRoots: duplicateRuntimeRoots,
    extraGroundPlanes: extraGroundPlanes,
    cameraChildOverlayGroups: cameraChildOverlayGroups
  };
}

export function removeGhostChunkPlanes(reason = "runtime-sync", options = {}) {
  const scan = scanSceneRootsForGhostPlanes(options);
  const debugOverlayVisible = options.debugOverlayVisible === true;
  const removed = [];
  const removedSet = new Set();
  const isAllowedCameraChild = function (record) {
    return Boolean(record?.object?.userData?.allowCameraChild === true || record?.object?.userData?.cameraHelper === true);
  };
  const shouldRemove = function (record) {
    if (!record || !record.shouldFlag) return false;
    if (record.isDebugOverlay && debugOverlayVisible && !record.isCameraChild) return false;
    if (record.isShadowProxy) return false;
    if (isAllowedCameraChild(record)) return false;
    return true;
  };
  const candidates = scan.filter(shouldRemove).sort(function (left, right) {
    const leftDepth = left.parentName ? 1 : 0;
    const rightDepth = right.parentName ? 1 : 0;
    return rightDepth - leftDepth;
  });
  for (const record of candidates) {
    const object = record.object || null;
    if (!object || removedSet.has(object)) continue;
    let skip = false;
    let parent = object.parent || null;
    while (parent) {
      if (removedSet.has(parent)) {
        skip = true;
        break;
      }
      parent = parent.parent || null;
    }
    if (skip) continue;
    const markAndRemove = function (target) {
      if (!target || removedSet.has(target)) return;
      removedSet.add(target);
      if (target.userData) {
        target.userData.shadowProxy = false;
        target.userData.shadowProxyKind = null;
      }
      if (target.castShadow === true) target.castShadow = false;
      if (target.receiveShadow === true) target.receiveShadow = false;
      if (target.parent) target.parent.remove(target);
      disposeObject(target, { disposeTextures: true });
      removed.push(target);
    };
    markAndRemove(object);
  }
  const diagnostics = auditSceneObjectsForGhostPlanes(options);
  diagnostics.removedSuspiciousPlanes = removed.length;
  if (removed.length > 0) {
    console.warn("[ghost-plane] removed " + removed.length + " suspicious object(s) during " + reason + ".");
  }
  return diagnostics;
}

export function auditSceneObjectsForShadowCasters(options = {}) {
  const roots = [];
  const seen = new Set();
  const pushRoot = function (root) {
    if (!root || typeof root.traverse !== "function") return;
    if (seen.has(root)) return;
    seen.add(root);
    roots.push(root);
  };
  for (const root of Array.isArray(options.roots) ? options.roots : []) pushRoot(root);
  pushRoot(options.scene || null);
  pushRoot(options.content || null);
  pushRoot(options.terrainRuntimeGroup || null);
  pushRoot(options.chunkDebugOverlay || null);
  pushRoot(options.selectionHelper || null);
  pushRoot(options.transformGuide || null);
  pushRoot(options.terrainEditorOverlay || null);
  pushRoot(options.scatterEditorOverlay || null);
  const visited = new Set();
  const records = [];
  const pushRecord = function (object) {
    if (!object || visited.has(object)) return;
    visited.add(object);
    if (!(object.isMesh === true || object.isInstancedMesh === true)) return;
    if (object.castShadow !== true) return;
    const geometryType = geometryTypeSummary(object.geometry);
    const material = normalizeMaterialList(object.material)[0] || null;
    const materialType = material ? String(material.type || material.constructor?.name || "Material") : null;
    const materialColor = materialColorSummary(material);
    const opacity = material ? round(num(material.opacity, 1)) : 1;
    const name = objectNameSummary(object);
    const parentName = objectNameSummary(object.parent || null);
    const ancestry = [];
    for (let current = object; current; current = current.parent || null) ancestry.push(current);
    const findAncestor = function (predicate) {
      for (const candidate of ancestry) {
        if (predicate(candidate, candidate?.userData || {})) return candidate;
      }
      return null;
    };
    const kind = (function () {
      const userData = object.userData || {};
      const debugOverlayNode = findAncestor(function (candidate, candidateUserData) {
        return candidateUserData.debugOverlay === true || candidateUserData.debugOverlayRoot === true || isDebugOverlayObject(candidate);
      });
      if (debugOverlayNode) return "debugOverlay";
      if (object === options.selectionHelper || name.includes("selection helper")) return "selection";
      if (object === options.transformGuide || name.includes("transform guide")) return "helper";
      if (name.includes("helper") || name.includes("guide")) return "helper";
      const groundNode = findAncestor(function (candidate, candidateUserData) {
        return candidateUserData.groundTile === true || candidateUserData.groundPlane === true || candidateUserData.terrainChunkEntryId || String(objectNameSummary(candidate)).includes("ground");
      });
      if (groundNode) return "ground";
      const proxyNode = findAncestor(function (candidate, candidateUserData) {
        return candidateUserData.shadowProxy === true;
      });
      if (proxyNode) {
        const proxyUserData = proxyNode.userData || {};
        const proxyKind = String(proxyUserData.shadowProxyKind || proxyUserData.batchKind || proxyUserData.chunkRuntimeType || "").trim();
        if (proxyKind === "scatter" || proxyKind === "scatterShadowProxy" || proxyUserData.scatterInstance === true) return "scatterShadowProxy";
        if (proxyKind === "staticProp" || proxyKind === "entity" || proxyKind === "interactable" || proxyUserData.entityId || proxyUserData.interactableId) return "staticProp";
      }
      const scatterNode = findAncestor(function (candidate, candidateUserData) {
        return candidateUserData.batchKind === "scatter" || candidateUserData.scatterInstance === true || candidateUserData.chunkRuntimeType === "scatter";
      });
      if (scatterNode) return "scatterVisual";
      const staticPropNode = findAncestor(function (candidate, candidateUserData) {
        return candidateUserData.batchKind === "staticProp" || candidateUserData.entityId || candidateUserData.interactableId || candidateUserData.chunkRuntimeType === "entity" || candidateUserData.chunkRuntimeType === "interactable";
      });
      if (staticPropNode) return "staticProp";
      if (userData.shadowProxy === true) {
        const proxyKind = String(userData.shadowProxyKind || userData.batchKind || userData.chunkRuntimeType || "").trim();
        if (proxyKind === "scatter" || proxyKind === "scatterShadowProxy" || userData.scatterInstance === true) return "scatterShadowProxy";
        if (proxyKind === "staticProp" || proxyKind === "entity" || proxyKind === "interactable" || userData.entityId || userData.interactableId) return "staticProp";
      }
      return "unknown";
    })();
    const isCircleOrPlaneCaster = geometryType === "CircleGeometry" || geometryType === "PlaneGeometry";
    const suspiciousFlags = [];
    if (kind === "debugOverlay") suspiciousFlags.push("debugOverlay");
    if (kind === "helper") suspiciousFlags.push("helper");
    if (kind === "selection") suspiciousFlags.push("selection");
    if (kind === "unknown") suspiciousFlags.push("unknown");
    if (isCircleOrPlaneCaster && (kind === "scatterVisual" || kind === "scatterShadowProxy" || kind === "helper" || kind === "unknown")) suspiciousFlags.push("circleOrPlane");
    records.push({
      name: name,
      uuid: String(object.uuid || ""),
      kind: kind,
      geometryType: geometryType,
      parentName: parentName,
      materialType: materialType,
      materialColor: materialColor,
      opacity: opacity,
      isShadowProxy: Boolean(object.userData?.shadowProxy === true),
      suspiciousFlags: suspiciousFlags,
      reason: suspiciousFlags.join(", ")
    });
  };
  for (const root of roots) {
    root.traverse(function (object) {
      if (!object) return;
      pushRecord(object);
    });
  }
  const totalCasters = records.length;
  const castersByKind = {
    staticProp: 0,
    scatterVisual: 0,
    scatterShadowProxy: 0,
    ground: 0,
    helper: 0,
    debugOverlay: 0,
    selection: 0,
    unknown: 0
  };
  let circleOrPlaneCasterCount = 0;
  let helperCasterCount = 0;
  let unknownCasterCount = 0;
  const suspiciousCasterList = [];
  for (const record of records) {
    if (Object.prototype.hasOwnProperty.call(castersByKind, record.kind)) {
      castersByKind[record.kind] += 1;
    } else {
      castersByKind.unknown += 1;
    }
    if (record.kind === "helper") helperCasterCount += 1;
    if (record.kind === "unknown") unknownCasterCount += 1;
    if (record.geometryType === "CircleGeometry" || record.geometryType === "PlaneGeometry") circleOrPlaneCasterCount += 1;
    if (record.suspiciousFlags.length) {
      suspiciousCasterList.push({
        name: record.name,
        uuid: record.uuid,
        kind: record.kind,
        geometryType: record.geometryType,
        parentName: record.parentName,
        materialType: record.materialType,
        materialColor: record.materialColor,
        opacity: record.opacity,
        isShadowProxy: record.isShadowProxy,
        reason: record.reason
      });
    }
  }
  return {
    totalCasters: totalCasters,
    castersByKind: castersByKind,
    suspiciousCasterList: suspiciousCasterList,
    circleOrPlaneCasterCount: circleOrPlaneCasterCount,
    helperCasterCount: helperCasterCount,
    unknownCasterCount: unknownCasterCount
  };
}

export function buildCoverageCenterSignatureKey(centerChunk, presenceChunkKey = null) {
  if (!centerChunk) return "none";
  return chunkKey(centerChunk) + "~" + (presenceChunkKey || "none");
}

function resolveCoveragePrimaryPoint(options, mode, policy) {
  if (mode === "editor") {
    const target = options.camera?.target || options.camTarget || options.player || null;
    return applyChunkLoadingZOffset({
      x: num(target?.x, 0),
      z: num(target?.z, 0),
      source: "editor-camera"
    }, policy, mode);
  }
  if (policy?.cameraOnly !== false) {
    const target = options.camTarget || options.camera?.target || options.player || null;
    return applyChunkLoadingZOffset({
      x: num(target?.x, 0),
      z: num(target?.z, 0),
      source: "game-camera"
    }, policy, mode);
  }
  const player = options.player || options.camTarget || null;
  return applyChunkLoadingZOffset({
    x: num(player?.x, 0),
    z: num(player?.z, 0),
    source: "player"
  }, policy, mode);
}

/**
 * The actual anchor that must stay visible (camera eye position in editor mode, real player
 * position in game mode) can lag a chunk behind the primary point (orbit target / smoothed
 * camTarget). This used to spin up a full second buildChunkWindow around that anchor and union
 * the whole thing in, uncapped by maxLoadedChunks — that is what rendered as a second, independently
 * moving block of resident ground trailing the camera. Only the anchor's own single chunk key is
 * needed to keep it visible, so that is all this returns.
 */
function resolveCoveragePresenceChunkKey(options, mode, policy) {
  let point = null;
  if (mode === "editor") {
    point = options.camera?.position || null;
  } else if (policy?.cameraOnly !== false) {
    point = options.player || null;
  } else {
    point = options.camTarget || options.camera?.target || null;
  }
  if (!point) return null;
  return chunkKey(chunkCoordForPosition(num(point.x, 0), num(point.z, 0), policy));
}

function resolveCoverageHeading(options, mode) {
  const current = mode === "game" ? options.player : (options.camera?.target || options.camTarget);
  const last = mode === "game" ? options.lastPlayerPosition : options.lastCameraTarget;
  if (!current || !last) return null;
  const dx = num(current.x, 0) - num(last.x, 0);
  const dz = num(current.z, 0) - num(last.z, 0);
  const length = Math.hypot(dx, dz);
  if (!Number.isFinite(length) || length < 0.001) return null;
  return { x: dx / length, z: dz / length };
}

function computeForwardChunkKeysFromHeading(heading, primary, policy, mode) {
  if (!heading) return [];
  const size = chunkSizeForPolicy(policy);
  const steps = Math.max(1, chunkInteger(policy?.preloadMarginChunks, 1)) + 1;
  const seen = new Set();
  const keys = [];
  for (let step = 1; step <= steps; step += 1) {
    const worldX = primary.x + heading.x * size.width * step;
    const worldZ = primary.z + heading.z * size.depth * step;
    const coord = chunkCoordForPosition(worldX, worldZ, policy);
    const key = chunkKey(coord);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

/**
 * View-aware streaming coverage for chunk-resident content.
 *
 * This used to also build a second full chunk window around a secondary anchor point (camera eye
 * position in editor mode, player position in game mode) and union it into the resident set on
 * top of the primary window. That union was never re-clipped to maxLoadedChunks, so the real
 * resident chunk count could run well past the configured budget (e.g. 35 resident chunks with
 * maxLoadedChunks: 25) and rendered as a second, independently-moving block of loaded ground/
 * terrain trailing the camera. There is now exactly one budget-clipped window (buildChunkWindow):
 * the secondary anchor only contributes its own single chunk when it is still adjacent to the
 * primary window. A stale lagging camTarget that has drifted many chunks away no longer revives a
 * distant block of world content, and forward lookahead stays bounded along the current movement
 * heading.
 */
export function computeStreamingCoverage(options = {}) {
  const mode = options.mode === "game" ? "game" : "editor";
  const rawPolicy = options.policy || null;
  const policy = rawPolicy && rawPolicy.chunkWorldWidth
    ? rawPolicy
    : resolveChunkPolicy({ chunkLoading: { [mode]: rawPolicy } }, mode);
  const primary = resolveCoveragePrimaryPoint(options, mode, policy);
  const centerChunk = chunkCoordForPosition(primary.x, primary.z, policy);
  const baseWindow = buildChunkWindow(centerChunk, policy, mode);
  const presenceChunkKey = resolveCoveragePresenceChunkKey(options, mode, policy);
  const presenceChunkCoord = presenceChunkKey ? chunkCoordFromKey(presenceChunkKey) : null;
  const presenceChunkDistance = presenceChunkCoord ? chebyshevChunkDistance(presenceChunkCoord, centerChunk) : null;
  const presenceChunkAccepted = Number.isFinite(presenceChunkDistance) ? presenceChunkDistance <= 1 : false;
  const heading = resolveCoverageHeading(options, mode);
  const forwardChunkKeys = computeForwardChunkKeysFromHeading(heading, primary, policy, mode);
  const visibleSet = new Set(baseWindow.activeChunkKeys);
  if (presenceChunkAccepted) visibleSet.add(presenceChunkKey);
  const preloadSet = new Set(baseWindow.preloadChunkKeys);
  for (const key of forwardChunkKeys) preloadSet.add(key);
  const desiredSet = new Set(baseWindow.loadedChunkKeys);
  for (const key of visibleSet) desiredSet.add(key);
  for (const key of forwardChunkKeys) desiredSet.add(key);
  const unloadSafeSet = new Set(desiredSet);
  return {
    centerChunk: baseWindow.centerChunk,
    activeChunkKeys: baseWindow.activeChunkKeys.slice(),
    visibleChunkKeys: sortChunkKeysByDistance(Array.from(visibleSet), centerChunk),
    forwardChunkKeys: forwardChunkKeys.slice(),
    preloadChunkKeys: sortChunkKeysByDistance(Array.from(preloadSet), centerChunk),
    desiredResidentChunkKeys: sortChunkKeysByDistance(Array.from(desiredSet), centerChunk),
    unloadSafeChunkKeys: Array.from(unloadSafeSet),
    presenceChunkKey: presenceChunkKey || null,
    presenceChunkDistance: Number.isFinite(presenceChunkDistance) ? presenceChunkDistance : null,
    presenceChunkAccepted: presenceChunkAccepted,
    clippedByMaxLoadedChunks: baseWindow.clippedByMaxLoadedChunks === true,
    requiredActiveChunks: num(baseWindow.requiredActiveChunks, 0),
    clippedActiveChunks: num(baseWindow.clippedActiveChunks, 0),
    activeRadiusUnmet: baseWindow.activeRadiusUnmet === true,
    source: primary.source
  };
}

/**
 * Orders pending chunk keys so active/visible/forward chunks always build before far preload
 * chunks. Previously the build queue was a flat FIFO gated only by residentChunkBuildBudgetPerFrame,
 * so a visible chunk could sit pending behind chunks the player could not even see yet.
 */
export function prioritizeResidentChunkBuildQueue(options = {}) {
  const centerChunk = options.centerChunk || null;
  const residentSet = options.residentChunkKeys instanceof Set
    ? options.residentChunkKeys
    : new Set(Array.isArray(options.residentChunkKeys) ? options.residentChunkKeys : []);
  const desired = Array.isArray(options.desiredResidentChunkKeys) ? options.desiredResidentChunkKeys : [];
  const desiredSet = new Set(desired);
  const buckets = [
    Array.isArray(options.activeChunkKeys) ? options.activeChunkKeys : [],
    Array.isArray(options.visibleChunkKeys) ? options.visibleChunkKeys : [],
    Array.isArray(options.forwardChunkKeys) ? options.forwardChunkKeys : [],
    sortChunkKeysByDistance(Array.isArray(options.preloadChunkKeys) ? options.preloadChunkKeys : [], centerChunk)
  ];
  const ordered = [];
  const seen = new Set();
  for (const bucket of buckets) {
    for (const key of bucket) {
      if (!key || seen.has(key) || residentSet.has(key) || !desiredSet.has(key)) continue;
      seen.add(key);
      ordered.push(key);
    }
  }
  const leftover = sortChunkKeysByDistance(desired.filter(function (key) {
    return !seen.has(key) && !residentSet.has(key);
  }), centerChunk);
  for (const key of leftover) {
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(key);
  }
  return ordered;
}

function pointDistance2D(a, b) {
  const ax = Number(a?.x);
  const az = Number(a?.z);
  const bx = Number(b?.x);
  const bz = Number(b?.z);
  if (!Number.isFinite(ax) || !Number.isFinite(az) || !Number.isFinite(bx) || !Number.isFinite(bz)) return 0;
  return Math.hypot(bx - ax, bz - az);
}

function interpolatePointBetween(start, end, t) {
  const safeT = clamp(num(t, 0), 0, 1);
  const point = {
    x: num(start?.x, 0) + ((num(end?.x, 0) - num(start?.x, 0)) * safeT),
    z: num(start?.z, 0) + ((num(end?.z, 0) - num(start?.z, 0)) * safeT)
  };
  const startHasY = Number.isFinite(Number(start?.y));
  const endHasY = Number.isFinite(Number(end?.y));
  if (startHasY || endHasY) {
    point.y = num(start?.y, 0) + ((num(end?.y, start?.y ?? 0) - num(start?.y, 0)) * safeT);
  }
  return point;
}

function boundsForPoints(points, expand = 0) {
  const valid = Array.isArray(points) ? points.filter(function (point) {
    return Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.z));
  }) : [];
  if (!valid.length) return null;
  let minX = num(valid[0].x, 0);
  let maxX = minX;
  let minZ = num(valid[0].z, 0);
  let maxZ = minZ;
  for (const point of valid) {
    const x = num(point.x, 0);
    const z = num(point.z, 0);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const margin = Math.max(0, num(expand, 0));
  return {
    minX: minX - margin,
    maxX: maxX + margin,
    minZ: minZ - margin,
    maxZ: maxZ + margin
  };
}

function chunkKeysForBounds(bounds, policy) {
  if (!bounds || !policy) return [];
  const size = chunkSizeForPolicy(policy);
  const minChunkX = Math.floor(num(bounds.minX, 0) / size.width);
  const maxChunkX = Math.floor((num(bounds.maxX, 0) - 0.000001) / size.width);
  const minChunkZ = Math.floor(num(bounds.minZ, 0) / size.depth);
  const maxChunkZ = Math.floor((num(bounds.maxZ, 0) - 0.000001) / size.depth);
  if (maxChunkX < minChunkX || maxChunkZ < minChunkZ) return [];
  const keys = [];
  for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
    for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ += 1) {
      keys.push(chunkKey({ x: chunkX, z: chunkZ }));
    }
  }
  return sortChunkKeys(keys);
}

export function chunkKeyForSegment(segment, policy) {
  const midpoint = midpointForSegment(segment);
  return midpoint ? chunkKeyForPosition(midpoint.x, midpoint.z, policy) : null;
}

export function midpointForSegment(segment) {
  const points = Array.isArray(segment?.points) ? segment.points : Array.isArray(segment) ? segment : [];
  if (!points.length) return null;
  if (points.length === 1) {
    const only = points[0];
    return Number.isFinite(Number(only?.x)) && Number.isFinite(Number(only?.z))
      ? { x: num(only.x, 0), z: num(only.z, 0), y: Number.isFinite(Number(only?.y)) ? num(only.y, 0) : undefined }
      : null;
  }
  const lengths = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const length = pointDistance2D(points[index - 1], points[index]);
    lengths.push(length);
    total += length;
  }
  if (total <= 0) {
    const first = points[0];
    const last = points[points.length - 1];
    return interpolatePointBetween(first, last, 0.5);
  }
  const target = total / 2;
  let walked = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = lengths[index - 1] || 0;
    if (walked + length >= target) {
      const localT = length <= 0 ? 0 : (target - walked) / length;
      return interpolatePointBetween(start, end, localT);
    }
    walked += length;
  }
  return interpolatePointBetween(points[0], points[points.length - 1], 0.5);
}

export function segmentLineByMaxLength(start, end, maxLength) {
  const length = pointDistance2D(start, end);
  const safeMaxLength = Math.max(0.0001, num(maxLength, 1));
  const steps = Math.max(1, Math.ceil(length / safeMaxLength));
  const points = [];
  for (let step = 0; step <= steps; step += 1) {
    points.push(interpolatePointBetween(start, end, step / steps));
  }
  return points;
}

export function segmentPolylineForChunks(points, policy, options = {}) {
  const normalized = normalizeWorldPointList(points);
  if (normalized.length < 2) return [];
  const size = chunkSizeForPolicy(policy);
  const maxSegmentLength = Math.max(0.0001, num(options.maxSegmentLength, Math.min(size.width, size.depth) / 2));
  const widthMargin = Math.max(0, num(options.width, 0)) / 2;
  const segmentBaseId = String(options.segmentBaseId || options.layerId || options.id || "segment");

  const tinySegments = [];
  let cumulativeLength = 0;
  for (let index = 1; index < normalized.length; index += 1) {
    const splitPoints = segmentLineByMaxLength(normalized[index - 1], normalized[index], maxSegmentLength);
    for (let splitIndex = 1; splitIndex < splitPoints.length; splitIndex += 1) {
      const start = splitPoints[splitIndex - 1];
      const end = splitPoints[splitIndex];
      const length = pointDistance2D(start, end);
      if (length <= 0) continue;
      tinySegments.push({
        start: start,
        end: end,
        length: length,
        startLength: cumulativeLength
      });
      cumulativeLength += length;
    }
  }
  if (!tinySegments.length) return [];

  const pieces = [];
  let currentPoints = [tinySegments[0].start, tinySegments[0].end];
  let currentLength = tinySegments[0].length;
  let currentPieceStart = tinySegments[0].startLength;
  let pieceIndex = 0;

  function finalizePiece() {
    if (!currentPoints || currentPoints.length < 2 || currentLength <= 0) return;
    const midpoint = midpointForSegment(currentPoints);
    const bounds = boundsForPoints(currentPoints, widthMargin);
    const chunkKeyValue = midpoint ? chunkKeyForPosition(midpoint.x, midpoint.z, policy) : null;
    const chunkKeys = bounds ? chunkKeysForBounds(bounds, policy) : [];
    pieces.push({
      id: segmentBaseId + "::" + pieceIndex,
      segmentId: pieceIndex,
      points: currentPoints.map(function (point) {
        return { x: num(point.x, 0), z: num(point.z, 0), y: Number.isFinite(Number(point?.y)) ? num(point.y, 0) : undefined };
      }),
      startLength: currentPieceStart,
      endLength: currentPieceStart + currentLength,
      length: currentLength,
      midpoint: midpoint,
      bounds: bounds,
      chunkKey: chunkKeyValue,
      chunkKeys: chunkKeys.length ? chunkKeys : (chunkKeyValue ? [chunkKeyValue] : [])
    });
    pieceIndex += 1;
  }

  for (let index = 1; index < tinySegments.length; index += 1) {
    const segment = tinySegments[index];
    if (currentLength > 0 && currentLength + segment.length > maxSegmentLength + 0.000001 && currentPoints.length >= 2) {
      finalizePiece();
      currentPoints = [segment.start, segment.end];
      currentLength = segment.length;
      currentPieceStart = segment.startLength;
      continue;
    }
    if (!currentPoints.length) {
      currentPoints = [segment.start];
      currentPieceStart = segment.startLength;
    } else if (currentPoints[currentPoints.length - 1].x !== segment.start.x || currentPoints[currentPoints.length - 1].z !== segment.start.z) {
      currentPoints.push(segment.start);
    }
    currentPoints.push(segment.end);
    currentLength += segment.length;
  }
  finalizePiece();
  return pieces;
}

function clipPolygonToHalfPlane(points, axis, limit, keepGreater) {
  const output = [];
  if (!Array.isArray(points) || !points.length) return output;
  const inside = function (point) {
    const value = axis === "x" ? num(point?.x, 0) : num(point?.z, 0);
    return keepGreater ? value >= limit - 0.000001 : value <= limit + 0.000001;
  };
  const intersect = function (start, end) {
    const startValue = axis === "x" ? num(start?.x, 0) : num(start?.z, 0);
    const endValue = axis === "x" ? num(end?.x, 0) : num(end?.z, 0);
    const delta = endValue - startValue;
    if (Math.abs(delta) <= 0.000001) return interpolatePointBetween(start, end, 0);
    const t = (limit - startValue) / delta;
    return interpolatePointBetween(start, end, t);
  };
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const current = points[index];
    const prior = points[previous];
    const currentInside = inside(current);
    const priorInside = inside(prior);
    if (currentInside) {
      if (!priorInside) output.push(intersect(prior, current));
      output.push(current);
    } else if (priorInside) {
      output.push(intersect(prior, current));
    }
  }
  return output;
}

function clipPolygonToRectangle(points, bounds) {
  if (!Array.isArray(points) || points.length < 3 || !bounds) return [];
  let clipped = points.slice();
  clipped = clipPolygonToHalfPlane(clipped, "x", num(bounds.minX, 0), true);
  clipped = clipPolygonToHalfPlane(clipped, "x", num(bounds.maxX, 0), false);
  clipped = clipPolygonToHalfPlane(clipped, "z", num(bounds.minZ, 0), true);
  clipped = clipPolygonToHalfPlane(clipped, "z", num(bounds.maxZ, 0), false);
  return clipped.filter(function (point, index, array) {
    if (!point) return false;
    if (index === 0) return true;
    const previous = array[index - 1];
    return Math.abs(num(previous.x, 0) - num(point.x, 0)) > 0.000001 || Math.abs(num(previous.z, 0) - num(point.z, 0)) > 0.000001;
  });
}

export function effectiveGroundBounds(ground) {
  if (!ground) return null;
  const boundsMode = String(ground?.boundsMode || "centerSize").trim() === "explicitBounds" ? "explicitBounds" : "centerSize";
  if (boundsMode === "explicitBounds") {
    const rawMinX = Number(ground?.minX);
    const rawMaxX = Number(ground?.maxX);
    const rawMinZ = Number(ground?.minZ);
    const rawMaxZ = Number(ground?.maxZ);
    if (Number.isFinite(rawMinX) && Number.isFinite(rawMaxX) && Number.isFinite(rawMinZ) && Number.isFinite(rawMaxZ)) {
      const minX = Math.min(rawMinX, rawMaxX);
      const maxX = Math.max(rawMinX, rawMaxX);
      const minZ = Math.min(rawMinZ, rawMaxZ);
      const maxZ = Math.max(rawMinZ, rawMaxZ);
      if (maxX > minX && maxZ > minZ) {
        return {
          boundsMode: "explicitBounds",
          minX: minX,
          maxX: maxX,
          minZ: minZ,
          maxZ: maxZ,
          width: maxX - minX,
          depth: maxZ - minZ
        };
      }
    }
  }
  const width = Math.max(0, num(ground?.width, 0));
  const depth = Math.max(0, num(ground?.depth, 0));
  if (width <= 0 || depth <= 0) return null;
  return {
    boundsMode: "centerSize",
    minX: -width / 2,
    maxX: width / 2,
    minZ: -depth / 2,
    maxZ: depth / 2,
    width: width,
    depth: depth
  };
}

function worldGroundBounds(ground) {
  return effectiveGroundBounds(ground);
}

function groundTextureWorldSize(ground) {
  return {
    x: Math.max(0.01, num(ground?.textureWorldSizeX, 10)),
    z: Math.max(0.01, num(ground?.textureWorldSizeZ, 10))
  };
}

export function worldSpaceGroundUv(worldX, worldZ, ground, textureWorldSize = null) {
  const size = textureWorldSize && Number.isFinite(Number(textureWorldSize?.x)) && Number.isFinite(Number(textureWorldSize?.z))
    ? {
      x: Math.max(0.01, num(textureWorldSize.x, 10)),
      z: Math.max(0.01, num(textureWorldSize.z, 10))
    }
    : groundTextureWorldSize(ground);
  return {
    u: num(worldX, 0) / size.x,
    v: num(worldZ, 0) / size.z,
    textureWorldSizeX: size.x,
    textureWorldSizeZ: size.z
  };
}

export function resolveGroundRenderMode(worldData, runtimeMode = "editor") {
  const policy = resolveChunkPolicy(worldData, runtimeMode);
  const shouldChunk = policy.enabled === true && policy.groundChunkingEnabled !== false;
  return shouldChunk ? "chunked" : "full";
}

export function shouldUseChunkedGround(worldData, runtimeMode = "editor") {
  return resolveGroundRenderMode(worldData, runtimeMode) === "chunked";
}

export function groundChunkTilesForBounds(ground, policy) {
  const groundBounds = effectiveGroundBounds(ground);
  const size = chunkSizeForPolicy(policy);
  if (!groundBounds) return [];
  const minChunkX = Math.floor(groundBounds.minX / size.width);
  const maxChunkX = Math.floor((groundBounds.maxX - 0.000001) / size.width);
  const minChunkZ = Math.floor(groundBounds.minZ / size.depth);
  const maxChunkZ = Math.floor((groundBounds.maxZ - 0.000001) / size.depth);
  const tiles = [];
  for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
    for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ += 1) {
      const minX = Math.max(groundBounds.minX, chunkX * size.width);
      const maxX = Math.min(groundBounds.maxX, (chunkX + 1) * size.width);
      const minZ = Math.max(groundBounds.minZ, chunkZ * size.depth);
      const maxZ = Math.min(groundBounds.maxZ, (chunkZ + 1) * size.depth);
      if (maxX <= minX || maxZ <= minZ) continue;
      const chunkCoord = { x: chunkX, z: chunkZ };
      tiles.push({
        chunkKey: chunkKey(chunkCoord),
        chunkCoord: chunkCoord,
        minX: minX,
        maxX: maxX,
        minZ: minZ,
        maxZ: maxZ,
        x: (minX + maxX) / 2,
        z: (minZ + maxZ) / 2,
        width: maxX - minX,
        depth: maxZ - minZ
      });
    }
  }
  return tiles;
}

function cloneGroundChunkStats(stats = {}) {
  return {
    mode: String(stats.mode || "full"),
    enabled: stats.enabled === true,
    policySource: String(stats.policySource || "none"),
    fullGroundPlaneActive: stats.fullGroundPlaneActive === true,
    fullGroundPlaneName: stats.fullGroundPlaneName || null,
    fullGroundPlaneVisible: stats.fullGroundPlaneVisible === true,
    groundTilesBlueprint: Math.max(0, num(stats.groundTilesBlueprint, 0)),
    groundTilesResident: Math.max(0, num(stats.groundTilesResident, 0)),
    groundTilesVisible: Math.max(0, num(stats.groundTilesVisible, 0)),
    groundTilesHidden: Math.max(0, num(stats.groundTilesHidden, 0)),
    groundBoundsMode: String(stats.groundBoundsMode || "centerSize"),
    groundWidth: Math.max(0, num(stats.groundWidth, 0)),
    groundDepth: Math.max(0, num(stats.groundDepth, 0)),
    groundMinX: Number.isFinite(Number(stats.groundMinX)) ? Number(stats.groundMinX) : null,
    groundMaxX: Number.isFinite(Number(stats.groundMaxX)) ? Number(stats.groundMaxX) : null,
    groundMinZ: Number.isFinite(Number(stats.groundMinZ)) ? Number(stats.groundMinZ) : null,
    groundMaxZ: Number.isFinite(Number(stats.groundMaxZ)) ? Number(stats.groundMaxZ) : null,
    groundAreaWorldUnits: Math.max(0, num(stats.groundAreaWorldUnits, 0)),
    maxLoadedChunks: Math.max(0, num(stats.maxLoadedChunks, 0)),
    groundBlueprintExceedsLoadBudget: stats.groundBlueprintExceedsLoadBudget === true,
    loadedChunkKeys: Array.isArray(stats.loadedChunkKeys) ? sortChunkKeys(stats.loadedChunkKeys) : [],
    residentChunkKeys: Array.isArray(stats.residentChunkKeys) ? sortChunkKeys(stats.residentChunkKeys) : [],
    enteringChunkKeys: Array.isArray(stats.enteringChunkKeys) ? sortChunkKeys(stats.enteringChunkKeys) : [],
    leavingChunkKeys: Array.isArray(stats.leavingChunkKeys) ? sortChunkKeys(stats.leavingChunkKeys) : [],
    lastSyncReason: String(stats.lastSyncReason || "init")
  };
}

export function createGroundChunkState() {
  return {
    mode: "full",
    tilesByChunkKey: new Map(),
    residentTiles: new Map(),
    materialCache: new Map(),
    textureRefs: new Map(),
    lastLoadedChunkKeySet: new Set(),
    stats: cloneGroundChunkStats()
  };
}

function groundBlueprintForWorld(worldData, runtimeMode) {
  const ground = worldData?.ground || null;
  const policy = resolveChunkPolicy(worldData, runtimeMode);
  const textureSize = groundTextureWorldSize(ground);
  const bounds = effectiveGroundBounds(ground);
  const tiles = bounds ? groundChunkTilesForBounds(ground, policy) : [];
  const tilesByChunkKey = new Map();
  for (const tile of tiles) {
    tilesByChunkKey.set(tile.chunkKey, {
      chunkKey: tile.chunkKey,
      bounds: {
        minX: tile.minX,
        maxX: tile.maxX,
        minZ: tile.minZ,
        maxZ: tile.maxZ
      },
      textureWorldSizeX: textureSize.x,
      textureWorldSizeZ: textureSize.z,
      textureAssetId: ground?.textureAssetId || null,
      materialColor: ground?.materialColor || "#ffffff",
      groundId: ground?.id || null
    });
  }
  return {
    policy: policy,
    ground: ground,
    bounds: bounds,
    textureSize: textureSize,
    tiles: tiles,
    tilesByChunkKey: tilesByChunkKey
  };
}

export function groundBlueprintSignature(worldData, runtimeMode) {
  const ground = worldData?.ground || null;
  const policy = resolveChunkPolicy(worldData, runtimeMode);
  const bounds = effectiveGroundBounds(ground);
  return [
    runtimeMode,
    policy.source || "none",
    policy.policyId || "",
    policy.enabled === true ? 1 : 0,
    policy.groundChunkingEnabled !== false ? 1 : 0,
    ground?.id || "",
    ground?.boundsMode || "centerSize",
    bounds ? round(bounds.minX) : "",
    bounds ? round(bounds.maxX) : "",
    bounds ? round(bounds.minZ) : "",
    bounds ? round(bounds.maxZ) : "",
    round(num(ground?.y, 0)),
    String(ground?.materialColor || ""),
    String(ground?.textureAssetId || ""),
    round(num(ground?.textureWorldSizeX, 10)),
    round(num(ground?.textureWorldSizeZ, 10))
  ].join("|");
}

function buildGroundChunkPlanFromBlueprint(blueprint, runtimeMode = "editor", windowState = null, previousState = null) {
  const policy = blueprint.policy;
  const renderMode = policy.enabled === true && policy.groundChunkingEnabled !== false && Boolean(blueprint.bounds)
    ? "chunked"
    : "full";
  const shouldChunk = renderMode === "chunked";
  const loadedChunkKeys = shouldChunk ? sortChunkKeys(windowState?.loadedChunkKeys || []) : [];
  const loadedChunkKeySet = new Set(loadedChunkKeys);
  const previousLoadedChunkKeySet = previousState?.lastLoadedChunkKeySet instanceof Set
    ? previousState.lastLoadedChunkKeySet
    : new Set();
  const residentChunkKeys = shouldChunk
    ? loadedChunkKeys.filter(function (key) { return blueprint.tilesByChunkKey.has(key); })
    : [];
  const enteringChunkKeys = shouldChunk
    ? residentChunkKeys.filter(function (key) { return !previousLoadedChunkKeySet.has(key); })
    : [];
  const leavingChunkKeys = shouldChunk
    ? Array.from(previousLoadedChunkKeySet).filter(function (key) { return !loadedChunkKeySet.has(key); })
    : Array.from(previousLoadedChunkKeySet);
  const fullGroundPlaneActive = !shouldChunk && Boolean(blueprint.bounds);
  const fullGroundPlaneName = fullGroundPlaneActive ? "published-ground" : null;
  const groundBoundsMode = blueprint.bounds?.boundsMode || blueprint.ground?.boundsMode || "centerSize";
  const groundWidth = num(blueprint.bounds?.width, 0);
  const groundDepth = num(blueprint.bounds?.depth, 0);
  const maxLoadedChunks = num(policy.maxLoadedChunks, 0);
  const stats = {
    mode: renderMode,
    enabled: shouldChunk,
    policySource: policy.source || "none",
    fullGroundPlaneActive: fullGroundPlaneActive,
    fullGroundPlaneName: fullGroundPlaneName,
    fullGroundPlaneVisible: fullGroundPlaneActive,
    groundTilesBlueprint: blueprint.tiles.length,
    groundTilesResident: residentChunkKeys.length,
    groundTilesVisible: residentChunkKeys.length,
    groundTilesHidden: 0,
    groundBoundsMode: groundBoundsMode,
    groundWidth: groundWidth,
    groundDepth: groundDepth,
    groundMinX: blueprint.bounds ? blueprint.bounds.minX : null,
    groundMaxX: blueprint.bounds ? blueprint.bounds.maxX : null,
    groundMinZ: blueprint.bounds ? blueprint.bounds.minZ : null,
    groundMaxZ: blueprint.bounds ? blueprint.bounds.maxZ : null,
    groundAreaWorldUnits: groundWidth * groundDepth,
    maxLoadedChunks: maxLoadedChunks,
    groundBlueprintExceedsLoadBudget: maxLoadedChunks > 0 && blueprint.tiles.length > maxLoadedChunks * 20,
    loadedChunkKeys: loadedChunkKeys,
    residentChunkKeys: residentChunkKeys,
    enteringChunkKeys: enteringChunkKeys,
    leavingChunkKeys: leavingChunkKeys,
    lastSyncReason: previousState?.stats?.lastSyncReason || "plan"
  };
  return {
    mode: renderMode,
    enabled: shouldChunk,
    policySource: policy.source || "none",
    fullGroundPlaneActive: fullGroundPlaneActive,
    fullGroundPlaneName: fullGroundPlaneName,
    fullGroundPlaneVisible: fullGroundPlaneActive,
    groundBounds: blueprint.bounds ? {
      minX: blueprint.bounds.minX,
      maxX: blueprint.bounds.maxX,
      minZ: blueprint.bounds.minZ,
      maxZ: blueprint.bounds.maxZ
    } : null,
    textureWorldSizeX: blueprint.textureSize.x,
    textureWorldSizeZ: blueprint.textureSize.z,
    groundTilesBlueprint: blueprint.tiles.length,
    groundTilesResident: residentChunkKeys.length,
    loadedChunkKeys: loadedChunkKeys,
    residentChunkKeys: residentChunkKeys,
    enteringChunkKeys: enteringChunkKeys,
    leavingChunkKeys: leavingChunkKeys,
    tiles: blueprint.tiles,
    tilesByChunkKey: blueprint.tilesByChunkKey,
    stats: stats,
    lastSyncReason: previousState?.stats?.lastSyncReason || "plan"
  };
}

export function buildGroundChunkPlan(worldData, runtimeMode = "editor", windowState = null, previousState = null) {
  return buildGroundChunkPlanFromBlueprint(groundBlueprintForWorld(worldData, runtimeMode), runtimeMode, windowState, previousState);
}

export function applyGroundChunkPlan(state, plan, hooks = {}) {
  if (!state || !plan) return null;
  state.mode = plan.mode;
  state.tilesByChunkKey = plan.tilesByChunkKey instanceof Map ? plan.tilesByChunkKey : new Map();
  const previousResidentKeys = Array.from(state.residentTiles?.keys() || []);
  const leavingChunkKeys = Array.isArray(plan.leavingChunkKeys) ? plan.leavingChunkKeys.slice() : [];
  const enteringChunkKeys = Array.isArray(plan.enteringChunkKeys) ? plan.enteringChunkKeys.slice() : [];
  const loadedChunkKeys = Array.isArray(plan.loadedChunkKeys) ? plan.loadedChunkKeys.slice() : [];
  const residentChunkKeys = Array.isArray(plan.residentChunkKeys) ? plan.residentChunkKeys.slice() : [];

  for (const key of leavingChunkKeys) {
    const tile = state.residentTiles.get(key);
    if (!tile) continue;
    if (typeof hooks.disposeTile === "function") {
      hooks.disposeTile(tile, key, plan, state);
    }
    state.residentTiles.delete(key);
  }

  for (const key of enteringChunkKeys) {
    if (state.residentTiles.has(key)) {
      const resident = state.residentTiles.get(key);
      if (resident) resident.lastTouchedAt = performance.now();
      continue;
    }
    const blueprint = state.tilesByChunkKey.get(key);
    if (!blueprint) continue;
    const tile = typeof hooks.createTile === "function"
      ? hooks.createTile(blueprint, key, plan, state)
      : blueprint;
    if (!tile) continue;
    state.residentTiles.set(key, tile);
  }

  const now = performance.now();
  for (const key of loadedChunkKeys) {
    const tile = state.residentTiles.get(key);
    if (tile) tile.lastTouchedAt = now;
  }

  state.lastLoadedChunkKeySet = new Set(loadedChunkKeys);
  state.stats = Object.assign(cloneGroundChunkStats(state.stats), {
    mode: plan.mode,
    enabled: plan.enabled === true,
    policySource: plan.policySource || "none",
    fullGroundPlaneActive: plan.fullGroundPlaneActive === true,
    fullGroundPlaneName: plan.fullGroundPlaneName || null,
    fullGroundPlaneVisible: plan.fullGroundPlaneVisible === true,
    groundTilesBlueprint: Math.max(0, num(plan.groundTilesBlueprint, Array.isArray(plan.tiles) ? plan.tiles.length : 0)),
    groundTilesResident: Math.max(0, residentChunkKeys.length),
    groundTilesVisible: Math.max(0, residentChunkKeys.length),
    groundTilesHidden: 0,
    groundBoundsMode: plan.stats?.groundBoundsMode || (plan.groundBounds ? plan.groundBounds.boundsMode : "centerSize"),
    groundWidth: num(plan.stats?.groundWidth, num(plan.groundBounds?.width, 0)),
    groundDepth: num(plan.stats?.groundDepth, num(plan.groundBounds?.depth, 0)),
    groundMinX: plan.stats?.groundMinX ?? (plan.groundBounds ? plan.groundBounds.minX : null),
    groundMaxX: plan.stats?.groundMaxX ?? (plan.groundBounds ? plan.groundBounds.maxX : null),
    groundMinZ: plan.stats?.groundMinZ ?? (plan.groundBounds ? plan.groundBounds.minZ : null),
    groundMaxZ: plan.stats?.groundMaxZ ?? (plan.groundBounds ? plan.groundBounds.maxZ : null),
    groundAreaWorldUnits: num(plan.stats?.groundAreaWorldUnits, 0),
    maxLoadedChunks: num(plan.stats?.maxLoadedChunks, 0),
    groundBlueprintExceedsLoadBudget: plan.stats?.groundBlueprintExceedsLoadBudget === true,
    loadedChunkKeys: loadedChunkKeys,
    residentChunkKeys: residentChunkKeys,
    enteringChunkKeys: enteringChunkKeys,
    leavingChunkKeys: leavingChunkKeys,
    lastSyncReason: plan.lastSyncReason || state.stats.lastSyncReason || "runtime-sync"
  });
  return {
    enteringChunkKeys: enteringChunkKeys,
    leavingChunkKeys: leavingChunkKeys,
    loadedChunkKeys: loadedChunkKeys,
    residentChunkKeys: residentChunkKeys,
    previousResidentKeys: previousResidentKeys
  };
}

export function createTerrainVisualRegistryEntry(entry = {}) {
  const chunkKeys = Array.isArray(entry.chunkKeys) && entry.chunkKeys.length
    ? sortChunkKeys(entry.chunkKeys)
    : (entry.chunkKey ? [entry.chunkKey] : []);
  const chunkKeyValue = entry.chunkKey || chunkKeys[0] || null;
  return {
    id: entry.id || null,
    type: entry.type || "terrainSurface",
    terrainKind: entry.terrainKind || null,
    layerId: entry.layerId || null,
    segmentId: entry.segmentId ?? null,
    chunkKey: chunkKeyValue,
    chunkKeys: chunkKeys,
    object: entry.object || null,
    hasVisual: entry.hasVisual !== false,
    visible: entry.visible !== false
  };
}

function chunkCoordFromKey(key) {
  const raw = String(key || "").split(",");
  if (raw.length !== 2) return null;
  const x = Number(raw[0]);
  const z = Number(raw[1]);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return {
    x: Math.floor(x),
    z: Math.floor(z)
  };
}

function sortChunkKeys(keys) {
  return Array.from(new Set(keys || [])).map(function (value) {
    const coord = chunkCoordFromKey(value);
    return coord ? { key: chunkKey(coord), x: coord.x, z: coord.z } : null;
  }).filter(Boolean).sort(chunkCoordSort).map(function (coord) { return coord.key; });
}

export function collectTerrainStreamingSnapshot(residentEntryIds, terrainEntries, terrainTextureRecordsMap, surfaceMaterialRecordsMap, nextState = {}) {
  const residentChunkKeySet = new Set();
  const residentAssetIds = new Set();
  const ids = Array.isArray(residentEntryIds)
    ? residentEntryIds.slice()
    : (residentEntryIds instanceof Set ? Array.from(residentEntryIds) : []);
  for (const entryId of ids) {
    const entry = terrainEntries?.get(entryId);
    if (!entry) continue;
    const chunkKeys = Array.isArray(entry.chunkKeys) && entry.chunkKeys.length
      ? entry.chunkKeys
      : (entry.chunkKey ? [entry.chunkKey] : []);
    for (const chunkKeyValue of chunkKeys) {
      if (chunkKeyValue) residentChunkKeySet.add(String(chunkKeyValue));
    }
    const assetIds = Array.isArray(entry.assetIds) ? entry.assetIds : [];
    for (const assetId of assetIds) {
      const value = String(assetId || "").trim();
      if (value) residentAssetIds.add(value);
    }
  }
  const textureRefs = Array.from(terrainTextureRecordsMap?.values() || []).reduce(function (total, record) {
    return total + Math.max(0, num(record?.refCount, 0));
  }, 0);
  const surfaceMaterials = Array.from(surfaceMaterialRecordsMap?.values() || []).reduce(function (total, records) {
    return total + (records?.size || 0);
  }, 0);
  return {
    loadedChunks: nextState?.loadedChunks || 0,
    activeChunks: nextState?.activeChunks || 0,
    preloadChunks: nextState?.preloadChunks || 0,
    residentPieces: ids.length,
    residentChunks: residentChunkKeySet.size,
    residentChunkKeys: sortChunkKeys(Array.from(residentChunkKeySet)),
    textureRefs: textureRefs,
    textureAssets: residentAssetIds.size,
    surfaceMaterials: surfaceMaterials,
    lastUpdateReason: nextState?.lastUpdateReason || "runtime-sync"
  };
}

export function isChunkActive(coordOrKey, windowState) {
  const key = typeof coordOrKey === "string" ? coordOrKey : chunkKey(coordOrKey);
  return Array.isArray(windowState?.activeChunkKeys) && windowState.activeChunkKeys.includes(key);
}

export function isChunkPreload(coordOrKey, windowState) {
  const key = typeof coordOrKey === "string" ? coordOrKey : chunkKey(coordOrKey);
  return Array.isArray(windowState?.preloadChunkKeys) && windowState.preloadChunkKeys.includes(key);
}

export function isChunkLoaded(coordOrKey, windowState) {
  const key = typeof coordOrKey === "string" ? coordOrKey : chunkKey(coordOrKey);
  if (windowState?.loadedChunkKeySet instanceof Set) return windowState.loadedChunkKeySet.has(key);
  return Array.isArray(windowState?.loadedChunkKeys) && windowState.loadedChunkKeys.includes(key);
}

function resolveChunkEntryChunkInfo(entry, policy) {
  if (!entry) return null;
  const chunkKeys = Array.isArray(entry.chunkKeys) ? sortChunkKeys(entry.chunkKeys) : [];
  if (chunkKeys.length) {
    const primaryKey = typeof entry.chunkKey === "string" && entry.chunkKey.includes(",")
      ? chunkKey(chunkCoordFromKey(entry.chunkKey) || chunkCoordFromKey(chunkKeys[0]) || { x: 0, z: 0 })
      : chunkKeys[0];
    return {
      key: primaryKey || chunkKeys[0] || null,
      keys: chunkKeys,
      coord: chunkCoordFromKey(primaryKey || chunkKeys[0] || "")
    };
  }
  if (typeof entry.chunkKey === "string" && entry.chunkKey.includes(",")) {
    const coord = chunkCoordFromKey(entry.chunkKey);
    return coord ? { key: chunkKey(coord), keys: [chunkKey(coord)], coord: coord } : null;
  }
  if (entry.chunkCoord && Number.isFinite(Number(entry.chunkCoord.x)) && Number.isFinite(Number(entry.chunkCoord.z))) {
    const coord = {
      x: Math.floor(Number(entry.chunkCoord.x)),
      z: Math.floor(Number(entry.chunkCoord.z))
    };
    const key = chunkKey(coord);
    return { key: key, keys: [key], coord: coord };
  }
  const x = entry.x ?? entry.position?.x;
  const z = entry.z ?? entry.position?.z;
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(z)) || !policy) return null;
  const coord = chunkCoordForPosition(x, z, policy);
  const key = chunkKey(coord);
  return {
    key: key,
    keys: [key],
    coord: coord
  };
}

function cloneChunkWindow(windowState) {
  const activeChunks = Array.isArray(windowState?.activeChunks) ? windowState.activeChunks.map(function (coord) {
    return { x: coord.x, z: coord.z, key: coord.key };
  }) : [];
  const preloadChunks = Array.isArray(windowState?.preloadChunks) ? windowState.preloadChunks.map(function (coord) {
    return { x: coord.x, z: coord.z, key: coord.key };
  }) : [];
  const loadedOnlyChunks = Array.isArray(windowState?.loadedOnlyChunks) ? windowState.loadedOnlyChunks.map(function (coord) {
    return { x: coord.x, z: coord.z, key: coord.key };
  }) : [];
  const loadedChunks = Array.isArray(windowState?.loadedChunks) ? windowState.loadedChunks.map(function (coord) {
    return { x: coord.x, z: coord.z, key: coord.key };
  }) : [];
  return {
    centerChunk: windowState?.centerChunk ? { x: windowState.centerChunk.x, z: windowState.centerChunk.z, key: windowState.centerChunk.key } : null,
    activeRadiusChunks: chunkInteger(windowState?.activeRadiusChunks, 0),
    preloadRadiusChunks: chunkInteger(windowState?.preloadRadiusChunks, 0),
    loadedRadiusChunks: chunkInteger(windowState?.loadedRadiusChunks, 0),
    maxLoadedChunks: maxLoadedChunksForValue(windowState?.maxLoadedChunks, loadedChunks.length || 1),
    clippedByMaxLoadedChunks: windowState?.clippedByMaxLoadedChunks === true,
    requiredActiveChunks: chunkInteger(windowState?.requiredActiveChunks, 0),
    clippedActiveChunks: chunkInteger(windowState?.clippedActiveChunks, 0),
    activeRadiusUnmet: windowState?.activeRadiusUnmet === true,
    activeChunks: activeChunks,
    preloadChunks: preloadChunks,
    loadedOnlyChunks: loadedOnlyChunks,
    loadedChunks: loadedChunks,
    activeChunkKeys: activeChunks.map(function (coord) { return coord.key; }),
    preloadChunkKeys: preloadChunks.map(function (coord) { return coord.key; }),
    loadedChunkKeys: loadedChunks.map(function (coord) { return coord.key; }),
    loadedChunkKeySet: new Set(loadedChunks.map(function (coord) { return coord.key; }))
  };
}

function mergeChunkWindowLoadedKeys(windowState, extraChunkKeys) {
  const nextState = cloneChunkWindow(windowState);
  const additions = [];
  const extraKeys = sortChunkKeys(extraChunkKeys);
  for (const key of extraKeys) {
    if (nextState.loadedChunkKeySet.has(key)) continue;
    const coord = chunkCoordFromKey(key);
    if (!coord) continue;
    const nextCoord = { x: coord.x, z: coord.z, key: key };
    additions.push(nextCoord);
    nextState.loadedChunkKeySet.add(key);
    nextState.loadedChunkKeys.push(key);
    nextState.loadedChunks.push(nextCoord);
    if (!isChunkActive(key, nextState) && !isChunkPreload(key, nextState)) {
      nextState.loadedOnlyChunks.push(nextCoord);
    }
  }
  nextState.loadedChunks.sort(chunkCoordSort);
  nextState.loadedOnlyChunks.sort(chunkCoordSort);
  nextState.loadedChunkKeys = nextState.loadedChunks.map(function (coord) { return coord.key; });
  return {
    windowState: nextState,
    addedChunkKeys: additions.map(function (coord) { return coord.key; }),
    applied: additions.length > 0
  };
}

function createEmptyTerrainVisualStats() {
  return {
    registered: 0,
    visible: 0,
    hidden: 0,
    groundTilesVisible: 0,
    groundTilesHidden: 0,
    terrainLayerTilesVisible: 0,
    terrainLayerTilesHidden: 0,
    surfaceSegmentsVisible: 0,
    surfaceSegmentsHidden: 0,
    uncullableTerrainVisuals: 0
  };
}

export function collectChunkCullingStats(entries, windowState, options = {}) {
  if (options.objectResidencyState || options.chunkResidencyState) {
    return collectChunkCullingStatsWithResidency(entries, windowState, options);
  }
  const cullingEnabled = options.cullingEnabled !== false;
  const policy = options.policy || null;
  const loadedChunkKeys = sortChunkKeys(windowState?.loadedChunkKeys || []);
  const renderResidentChunkKeys = sortChunkKeys(Array.isArray(options.renderResidentChunkKeys)
    ? options.renderResidentChunkKeys
    : loadedChunkKeys);
  const activeChunkKeys = sortChunkKeys(windowState?.activeChunkKeys || []);
  const preloadChunkKeys = sortChunkKeys(windowState?.preloadChunkKeys || []);
  const loadedChunkKeySet = new Set(loadedChunkKeys);
  const renderResidentChunkKeySet = new Set(renderResidentChunkKeys);
  const terrainVisualStats = createEmptyTerrainVisualStats();
  const result = {
    items: [],
    activeChunkKeys: activeChunkKeys,
    preloadChunkKeys: preloadChunkKeys,
    loadedChunkKeys: loadedChunkKeys,
    renderResidentChunkKeys: renderResidentChunkKeys,
    loadedChunkKeySet: loadedChunkKeySet,
    activeChunks: activeChunkKeys.length,
    preloadChunks: preloadChunkKeys.length,
    loadedChunks: loadedChunkKeys.length,
    hiddenObjects: 0,
    visibleObjects: 0,
    inactiveInteractables: 0,
    inactiveSolids: 0,
    culledEntities: 0,
    culledScatter: 0,
    culledInteractables: 0,
    culledSolids: 0,
    uncullableObjects: 0,
    terrainVisuals: terrainVisualStats,
    keepSelectedChunkLoadedApplied: options.keepSelectedChunkLoadedApplied === true
  };
  for (const entry of Array.isArray(entries) ? entries : []) {
    const type = String(entry?.type || "entity");
    const hasVisual = entry?.hasVisual !== false;
    const chunkInfo = resolveChunkEntryChunkInfo(entry, policy);
    const isTerrainVisual = type === "terrainGround" || type === "terrainLayer" || type === "terrainSurface";
    const entryState = {
      id: entry?.id || null,
      type: type,
      chunkKey: chunkInfo?.key || null,
      chunkKeys: Array.isArray(chunkInfo?.keys) ? chunkInfo.keys.slice() : [],
      visible: hasVisual ? true : null,
      renderResident: hasVisual ? true : null,
      active: true,
      loaded: true,
      uncullable: false
    };
    if (cullingEnabled && Array.isArray(chunkInfo?.keys) && chunkInfo.keys.length) {
      entryState.loaded = chunkInfo.keys.some(function (key) { return loadedChunkKeySet.has(key); });
      entryState.renderResident = chunkInfo.keys.some(function (key) { return renderResidentChunkKeySet.has(key); });
      entryState.active = entryState.loaded;
      if (hasVisual) entryState.visible = entryState.loaded;
      if (hasVisual) entryState.renderResident = entryState.renderResident && entryState.loaded;
    } else if (cullingEnabled && !chunkInfo?.key) {
      entryState.uncullable = true;
      result.uncullableObjects += 1;
      if (isTerrainVisual) result.terrainVisuals.uncullableTerrainVisuals += 1;
    }
    if (hasVisual) {
      if (entryState.visible === false) result.hiddenObjects += 1;
      else result.visibleObjects += 1;
    }
    if (isTerrainVisual) {
      result.terrainVisuals.registered += 1;
      if (entryState.visible === false) {
        result.terrainVisuals.hidden += 1;
        if (type === "terrainGround") result.terrainVisuals.groundTilesHidden += 1;
        else if (type === "terrainLayer") result.terrainVisuals.terrainLayerTilesHidden += 1;
        else if (type === "terrainSurface") result.terrainVisuals.surfaceSegmentsHidden += 1;
      } else {
        result.terrainVisuals.visible += 1;
        if (type === "terrainGround") result.terrainVisuals.groundTilesVisible += 1;
        else if (type === "terrainLayer") result.terrainVisuals.terrainLayerTilesVisible += 1;
        else if (type === "terrainSurface") result.terrainVisuals.surfaceSegmentsVisible += 1;
      }
    }
    if (entryState.loaded === false) {
      if (type === "entity") result.culledEntities += 1;
      if (type === "scatter") result.culledScatter += 1;
      if (type === "interactable") {
        result.culledInteractables += 1;
        result.inactiveInteractables += 1;
      }
      if (type === "solid") {
        result.culledSolids += 1;
        result.inactiveSolids += 1;
      }
    }
    result.items.push(entryState);
  }
  return result;
}

function collectChunkCullingStatsWithResidency(entries, windowState, options = {}) {
  const cullingEnabled = options.cullingEnabled !== false;
  const policy = options.policy || null;
  const loadedChunkKeys = sortChunkKeys(windowState?.loadedChunkKeys || []);
  const renderResidentChunkKeys = sortChunkKeys(Array.isArray(options.renderResidentChunkKeys)
    ? options.renderResidentChunkKeys
    : loadedChunkKeys);
  const activeChunkKeys = sortChunkKeys(windowState?.activeChunkKeys || []);
  const preloadChunkKeys = sortChunkKeys(windowState?.preloadChunkKeys || []);
  const unloadSafeChunkKeys = sortChunkKeys(Array.isArray(windowState?.unloadSafeChunkKeys) && windowState.unloadSafeChunkKeys.length
    ? windowState.unloadSafeChunkKeys
    : loadedChunkKeys);
  const loadedChunkKeySet = new Set(loadedChunkKeys);
  const renderResidentChunkKeySet = new Set(renderResidentChunkKeys);
  const unloadSafeChunkKeySet = new Set(unloadSafeChunkKeys);
  const terrainVisualStats = createEmptyTerrainVisualStats();
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : performance.now();
  const objectTracker = options.objectResidencyState || null;
  const chunkTracker = options.chunkResidencyState || null;
  const enterMarginChunks = chunkInteger(policy?.activeRadiusChunks, 0) + Math.max(chunkInteger(policy?.preloadMarginChunks, 0), chunkInteger(policy?.unloadMarginChunks, 0));
  const exitMarginChunks = enterMarginChunks + OBJECT_VISIBILITY_EXIT_MARGIN_CHUNKS;
  if (objectTracker) {
    objectTracker.visibilityToggleThisFrame = 0;
    objectTracker.enterMarginChunks = enterMarginChunks;
    objectTracker.exitMarginChunks = exitMarginChunks;
    objectTracker.holdMs = OBJECT_VISIBILITY_HOLD_MS;
  }
  if (chunkTracker) {
    chunkTracker.enterMarginChunks = enterMarginChunks;
    chunkTracker.exitMarginChunks = exitMarginChunks;
    chunkTracker.holdMs = OBJECT_VISIBILITY_HOLD_MS;
  }
  const result = {
    items: [],
    activeChunkKeys: activeChunkKeys,
    preloadChunkKeys: preloadChunkKeys,
    loadedChunkKeys: loadedChunkKeys,
    renderResidentChunkKeys: renderResidentChunkKeys,
    loadedChunkKeySet: loadedChunkKeySet,
    activeChunks: activeChunkKeys.length,
    preloadChunks: preloadChunkKeys.length,
    loadedChunks: loadedChunkKeys.length,
    hiddenObjects: 0,
    visibleObjects: 0,
    renderResidentObjects: 0,
    heldVisibleObjects: 0,
    pendingUnloadObjects: 0,
    unloadedObjects: 0,
    inactiveInteractables: 0,
    inactiveSolids: 0,
    culledEntities: 0,
    culledScatter: 0,
    culledInteractables: 0,
    culledSolids: 0,
    uncullableObjects: 0,
    terrainVisuals: terrainVisualStats,
    keepSelectedChunkLoadedApplied: options.keepSelectedChunkLoadedApplied === true,
    objectResidency: null,
    chunkResidency: null
  };
  const objectRecords = objectTracker ? objectTracker.recordsById : null;
  const currentHoldMs = objectTracker?.holdMs || OBJECT_VISIBILITY_HOLD_MS;
  const currentEnterMargin = objectTracker?.enterMarginChunks ?? enterMarginChunks;
  const currentExitMargin = objectTracker?.exitMarginChunks ?? exitMarginChunks;

  function updateObjectRecord(record, entry, chunkInfo, type, currentLoaded, currentSafe) {
    const previousVisible = record.visible === true;
    const previousPending = record.pendingUnload === true;
    const previousHoldUntil = Number(record.holdUntilAt || 0) || 0;
    const entryType = String(type || record.type || "entity");
    let nextVisible = previousVisible;
    let nextRenderResident = currentLoaded;
    let nextHeldVisible = false;
    let nextPendingUnload = false;
    let nextUnloaded = false;
    let nextReason = record.lastVisibilityChangeReason || "init";
    if (currentLoaded) {
      nextVisible = true;
      nextRenderResident = true;
      nextHeldVisible = false;
      nextPendingUnload = false;
      nextUnloaded = false;
      if (!previousVisible) nextReason = "enter-loaded";
      record.holdUntilAt = 0;
      record.preventedHold = false;
      record.pendingUnloadStartedAt = 0;
    } else if (previousVisible && currentSafe) {
      nextVisible = true;
      nextRenderResident = false;
      nextHeldVisible = true;
      nextPendingUnload = false;
      nextUnloaded = false;
      record.holdUntilAt = 0;
      record.preventedHold = false;
      record.pendingUnloadStartedAt = 0;
    } else if (previousVisible && !currentSafe) {
      if (!previousHoldUntil) record.holdUntilAt = now + currentHoldMs;
      const holdUntilAt = Number(record.holdUntilAt || 0) || 0;
      if (now < holdUntilAt) {
        nextVisible = true;
        nextRenderResident = false;
        nextHeldVisible = true;
        nextPendingUnload = true;
        nextUnloaded = false;
        if (!record.preventedHold) {
          objectTracker.preventedVisibilityToggleCount += 1;
          record.preventedVisibilityToggleCount = (record.preventedVisibilityToggleCount || 0) + 1;
          record.preventedHold = true;
        }
        if (!previousPending && (entryType === "scatter" || entryType === "staticProp" || entryType === "entity" || entryType === "interactable" || entryType === "terrainGround" || entryType === "terrainLayer" || entryType === "terrainSurface")) {
          objectTracker.chunkBoundaryObjectWarnings += 1;
          record.chunkBoundaryObjectWarnings = (record.chunkBoundaryObjectWarnings || 0) + 1;
        }
        nextReason = record.lastVisibilityChangeReason || "hold-visible";
        record.pendingUnloadStartedAt = record.pendingUnloadStartedAt || now;
      } else {
        nextVisible = false;
        nextRenderResident = false;
        nextHeldVisible = false;
        nextPendingUnload = false;
        nextUnloaded = true;
        nextReason = "exit-expired";
        record.holdUntilAt = 0;
        record.preventedHold = false;
        record.pendingUnloadStartedAt = 0;
      }
    } else {
      nextVisible = false;
      nextRenderResident = false;
      nextHeldVisible = false;
      nextPendingUnload = false;
      nextUnloaded = true;
      record.holdUntilAt = 0;
      record.preventedHold = false;
      record.pendingUnloadStartedAt = 0;
    }
    if (previousVisible !== nextVisible) {
      record.visibilityToggleCount = (record.visibilityToggleCount || 0) + 1;
      objectTracker.visibilityToggleCount += 1;
      objectTracker.visibilityToggleThisFrame += 1;
      const lastToggleAt = Number(record.lastVisibilityToggleTime || 0) || 0;
      if (lastToggleAt > 0 && now - lastToggleAt < Math.max(currentHoldMs, 250)) {
        record.repeatedVisibilityToggleWarnings = (record.repeatedVisibilityToggleWarnings || 0) + 1;
        objectTracker.repeatedVisibilityToggleWarnings += 1;
      }
      record.lastVisibilityToggleTime = now;
      record.lastVisibilityChangeReason = nextReason;
      record.lastVisibilityChangeTime = now;
      objectTracker.lastVisibilityChangeReason = nextReason;
      objectTracker.lastVisibilityChangeTime = now;
      if (entryType === "scatter" || entryType === "staticProp" || entryType === "entity" || entryType === "interactable") {
        record.chunkBoundaryObjectWarnings = (record.chunkBoundaryObjectWarnings || 0) + 1;
      }
    }
    record.id = String(entry?.id || record.id || "").trim();
    record.type = entryType;
    record.hasVisual = entry?.hasVisual !== false;
    record.chunkKey = chunkInfo?.key || record.chunkKey || null;
    record.chunkKeys = Array.isArray(chunkInfo?.keys) && chunkInfo.keys.length ? chunkInfo.keys.slice() : (Array.isArray(record.chunkKeys) ? record.chunkKeys.slice() : []);
    record.currentLoaded = currentLoaded;
    record.currentSafe = currentSafe;
    record.visible = nextVisible;
    record.renderResident = nextRenderResident;
    record.loaded = nextVisible;
    record.active = nextVisible;
    record.heldVisible = nextHeldVisible;
    record.pendingUnload = nextPendingUnload;
    record.unloaded = nextUnloaded;
    if (!record.lastVisibilityChangeReason) record.lastVisibilityChangeReason = nextReason;
    if (!Number.isFinite(Number(record.lastVisibilityChangeTime))) record.lastVisibilityChangeTime = 0;
    return record;
  }

  function ensureObjectRecord(entry, chunkInfo, type) {
    const key = String(entry?.id || "").trim() || String(chunkInfo?.key || "").trim();
    if (!key) return null;
    let record = objectRecords.get(key);
    if (!record) {
      record = {
        id: key,
        type: String(type || "entity"),
        chunkKey: chunkInfo?.key || null,
        chunkKeys: Array.isArray(chunkInfo?.keys) ? chunkInfo.keys.slice() : [],
        hasVisual: entry?.hasVisual !== false,
        visible: false,
        renderResident: false,
        loaded: false,
        active: false,
        heldVisible: false,
        pendingUnload: false,
        unloaded: true,
        currentLoaded: false,
        currentSafe: false,
        holdUntilAt: 0,
        preventedHold: false,
        pendingUnloadStartedAt: 0,
        lastVisibilityChangeReason: "init",
        lastVisibilityChangeTime: 0,
        lastVisibilityToggleTime: 0,
        visibilityToggleCount: 0,
        preventedVisibilityToggleCount: 0,
        repeatedVisibilityToggleWarnings: 0,
        chunkBoundaryObjectWarnings: 0,
        scatterBatch: String(type || "").indexOf("scatter") !== -1 || String(type || "") === "staticProp"
      };
      objectRecords.set(key, record);
    }
    record.scatterBatch = record.scatterBatch === true || String(type || "").indexOf("scatter") !== -1 || String(type || "") === "staticProp";
    return record;
  }

  function buildObjectResidencySummary() {
    const entries = Array.from(objectRecords ? objectRecords.values() : []).sort(function (left, right) {
      const leftKey = String(left?.chunkKey || "");
      const rightKey = String(right?.chunkKey || "");
      if (leftKey !== rightKey) return leftKey.localeCompare(rightKey);
      return String(left?.id || "").localeCompare(String(right?.id || ""));
    }).map(function (record) {
      return {
        id: record.id || null,
        type: record.type || "entity",
        chunkKey: record.chunkKey || null,
        chunkKeys: Array.isArray(record.chunkKeys) ? record.chunkKeys.slice() : [],
        visible: record.visible === true,
        renderResident: record.renderResident === true,
        loaded: record.loaded === true,
        active: record.active === true,
        heldVisible: record.heldVisible === true,
        pendingUnload: record.pendingUnload === true,
        unloaded: record.unloaded === true,
        currentLoaded: record.currentLoaded === true,
        currentSafe: record.currentSafe === true,
        lastVisibilityChangeReason: record.lastVisibilityChangeReason || "init",
        lastVisibilityChangeTime: Number(record.lastVisibilityChangeTime || 0) || 0,
        visibilityToggleCount: Number(record.visibilityToggleCount || 0) || 0,
        preventedVisibilityToggleCount: Number(record.preventedVisibilityToggleCount || 0) || 0,
        repeatedVisibilityToggleWarnings: Number(record.repeatedVisibilityToggleWarnings || 0) || 0,
        chunkBoundaryObjectWarnings: Number(record.chunkBoundaryObjectWarnings || 0) || 0,
        scatterBatch: record.scatterBatch === true
      };
    });
    let visibleObjectCount = 0;
    let renderResidentObjectCount = 0;
    let heldVisibleObjectCount = 0;
    let pendingUnloadObjectCount = 0;
    let unloadedObjectCount = 0;
    let visibilityToggleCount = 0;
    let preventedVisibilityToggleCount = 0;
    let repeatedVisibilityToggleWarnings = 0;
    let chunkBoundaryObjectWarnings = 0;
    let scatterBatchCount = 0;
    let visibleScatterBatchCount = 0;
    let heldScatterBatchCount = 0;
    for (const entry of entries) {
      if (entry.hasVisual === false) continue;
      if (entry.visible === true) visibleObjectCount += 1;
      if (entry.renderResident === true) renderResidentObjectCount += 1;
      if (entry.heldVisible === true) heldVisibleObjectCount += 1;
      if (entry.pendingUnload === true) pendingUnloadObjectCount += 1;
      if (entry.unloaded === true) unloadedObjectCount += 1;
      visibilityToggleCount += Number(entry.visibilityToggleCount || 0) || 0;
      preventedVisibilityToggleCount += Number(entry.preventedVisibilityToggleCount || 0) || 0;
      repeatedVisibilityToggleWarnings += Number(entry.repeatedVisibilityToggleWarnings || 0) || 0;
      chunkBoundaryObjectWarnings += Number(entry.chunkBoundaryObjectWarnings || 0) || 0;
      if (entry.scatterBatch === true) {
        scatterBatchCount += 1;
        if (entry.visible === true) visibleScatterBatchCount += 1;
        if (entry.heldVisible === true) heldScatterBatchCount += 1;
      }
    }
    return {
      visibleObjectCount: visibleObjectCount,
      renderResidentObjectCount: renderResidentObjectCount,
      heldVisibleObjectCount: heldVisibleObjectCount,
      pendingUnloadObjectCount: pendingUnloadObjectCount,
      unloadedObjectCount: unloadedObjectCount,
      visibilityToggleCount: visibilityToggleCount,
      visibilityToggleThisFrame: Number(objectTracker?.visibilityToggleThisFrame || 0) || 0,
      preventedVisibilityToggleCount: preventedVisibilityToggleCount,
      lastVisibilityChangeReason: objectTracker?.lastVisibilityChangeReason || "init",
      lastVisibilityChangeTime: Number(objectTracker?.lastVisibilityChangeTime || 0) || 0,
      repeatedVisibilityToggleWarnings: repeatedVisibilityToggleWarnings,
      chunkBoundaryObjectWarnings: chunkBoundaryObjectWarnings,
      scatterBatchCount: scatterBatchCount,
      visibleScatterBatchCount: visibleScatterBatchCount,
      heldScatterBatchCount: heldScatterBatchCount,
      rebuiltChunkGroupCount: Number(objectTracker?.rebuiltChunkGroupCount || 0) || 0,
      disposedChunkGroupCount: Number(objectTracker?.disposedChunkGroupCount || 0) || 0,
      entries: entries
    };
  }

  function buildChunkResidencySummary() {
    const summariesByKey = new Map();
    for (const record of objectRecords ? objectRecords.values() : []) {
      const chunkKeys = Array.isArray(record.chunkKeys) && record.chunkKeys.length
        ? record.chunkKeys.slice()
        : (record.chunkKey ? [record.chunkKey] : []);
      for (const key of chunkKeys) {
        const chunkKeyValue = String(key || "").trim();
        if (!chunkKeyValue) continue;
        let summary = summariesByKey.get(chunkKeyValue);
        if (!summary) {
          summary = {
            chunkKey: chunkKeyValue,
            totalObjectCount: 0,
            visibleObjectCount: 0,
            renderResidentObjectCount: 0,
            heldVisibleObjectCount: 0,
            pendingUnloadObjectCount: 0,
            unloadedObjectCount: 0,
            scatterBatchCount: 0,
            visibleScatterBatchCount: 0,
            heldScatterBatchCount: 0,
            lastChunkToggleReason: "init",
            lastChunkToggleTime: 0,
            enterMargin: currentEnterMargin,
            exitMargin: currentExitMargin,
            holdMs: currentHoldMs,
            state: "unloaded"
          };
          summariesByKey.set(chunkKeyValue, summary);
        }
        summary.totalObjectCount += 1;
        if (record.visible === true) summary.visibleObjectCount += 1;
        if (record.renderResident === true) summary.renderResidentObjectCount += 1;
        if (record.heldVisible === true) summary.heldVisibleObjectCount += 1;
        if (record.pendingUnload === true) summary.pendingUnloadObjectCount += 1;
        if (record.unloaded === true) summary.unloadedObjectCount += 1;
        if (record.scatterBatch === true) {
          summary.scatterBatchCount += 1;
          if (record.visible === true) summary.visibleScatterBatchCount += 1;
          if (record.heldVisible === true) summary.heldScatterBatchCount += 1;
        }
        if ((Number(record.lastVisibilityChangeTime || 0) || 0) >= (Number(summary.lastChunkToggleTime || 0) || 0)) {
          summary.lastChunkToggleReason = record.lastVisibilityChangeReason || summary.lastChunkToggleReason;
          summary.lastChunkToggleTime = Number(record.lastVisibilityChangeTime || 0) || 0;
        }
      }
    }
    const entries = Array.from(summariesByKey.values()).sort(function (left, right) {
      return chunkCoordSort(chunkCoordFromKey(left.chunkKey), chunkCoordFromKey(right.chunkKey));
    }).map(function (summary) {
      let state = "unloaded";
      if (summary.renderResidentObjectCount > 0) {
        state = "active";
      } else if (summary.pendingUnloadObjectCount > 0) {
        state = "pendingUnload";
      } else if (summary.visibleObjectCount > 0) {
        state = "held";
      }
      return Object.assign({}, summary, { state: state });
    });
    if (chunkTracker) {
      chunkTracker.recordsByKey.clear();
      for (const entry of entries) {
        chunkTracker.recordsByKey.set(entry.chunkKey, Object.assign({}, entry));
      }
      const latest = entries.slice().sort(function (left, right) {
        return (Number(right.lastChunkToggleTime || 0) || 0) - (Number(left.lastChunkToggleTime || 0) || 0);
      })[0] || null;
      chunkTracker.lastChunkToggleReason = latest?.lastChunkToggleReason || "init";
      chunkTracker.lastChunkToggleTime = Number(latest?.lastChunkToggleTime || 0) || 0;
    }
    const activeChunks = entries.filter(function (entry) { return entry.state === "active"; });
    const heldChunks = entries.filter(function (entry) { return entry.state === "held"; });
    const pendingUnloadChunks = entries.filter(function (entry) { return entry.state === "pendingUnload"; });
    const unloadedChunks = entries.filter(function (entry) { return entry.state === "unloaded"; });
    return {
      activeChunks: activeChunks.length,
      heldChunks: heldChunks.length,
      pendingUnloadChunks: pendingUnloadChunks.length,
      unloadedChunks: unloadedChunks.length,
      enterMargin: currentEnterMargin,
      exitMargin: currentExitMargin,
      holdMs: currentHoldMs,
      lastChunkToggleReason: chunkTracker?.lastChunkToggleReason || "init",
      lastChunkToggleTime: Number(chunkTracker?.lastChunkToggleTime || 0) || 0,
      activeChunkKeys: activeChunks.map(function (entry) { return entry.chunkKey; }),
      heldChunkKeys: heldChunks.map(function (entry) { return entry.chunkKey; }),
      pendingUnloadChunkKeys: pendingUnloadChunks.map(function (entry) { return entry.chunkKey; }),
      unloadedChunkKeys: unloadedChunks.map(function (entry) { return entry.chunkKey; }),
      entries: entries
    };
  }

  for (const entry of Array.isArray(entries) ? entries : []) {
    const type = String(entry?.type || "entity");
    const hasVisual = entry?.hasVisual !== false;
    const chunkInfo = resolveChunkEntryChunkInfo(entry, policy);
    const isTerrainVisual = type === "terrainGround" || type === "terrainLayer" || type === "terrainSurface";
    const currentLoaded = cullingEnabled && Array.isArray(chunkInfo?.keys) && chunkInfo.keys.length
      ? chunkInfo.keys.some(function (key) { return loadedChunkKeySet.has(key); })
      : cullingEnabled && !chunkInfo?.key ? false : true;
    const currentSafe = cullingEnabled && Array.isArray(chunkInfo?.keys) && chunkInfo.keys.length
      ? chunkInfo.keys.some(function (key) { return unloadSafeChunkKeySet.has(key); })
      : cullingEnabled && !chunkInfo?.key ? false : true;
    const entryState = {
      id: entry?.id || null,
      type: type,
      chunkKey: chunkInfo?.key || null,
      chunkKeys: Array.isArray(chunkInfo?.keys) ? chunkInfo.keys.slice() : [],
      visible: hasVisual ? true : null,
      renderResident: hasVisual ? true : null,
      loaded: hasVisual ? true : null,
      active: true,
      heldVisible: false,
      pendingUnload: false,
      unloaded: false,
      currentLoaded: currentLoaded,
      currentSafe: currentSafe,
      uncullable: false,
      lastVisibilityChangeReason: "init",
      lastVisibilityChangeTime: 0,
      visibilityToggleCount: 0,
      preventedVisibilityToggleCount: 0,
      repeatedVisibilityToggleWarnings: 0,
      chunkBoundaryObjectWarnings: 0,
      state: "visible"
    };
    if (cullingEnabled && Array.isArray(chunkInfo?.keys) && chunkInfo.keys.length) {
      if (objectTracker) {
        const record = ensureObjectRecord(entry, chunkInfo, type);
        if (record) {
          if (hasVisual) {
            updateObjectRecord(record, entry, chunkInfo, type, currentLoaded, currentSafe);
          } else {
            record.id = String(entry?.id || record.id || "").trim();
            record.type = type;
            record.hasVisual = false;
            record.chunkKey = chunkInfo?.key || record.chunkKey || null;
            record.chunkKeys = Array.isArray(chunkInfo?.keys) && chunkInfo.keys.length ? chunkInfo.keys.slice() : (Array.isArray(record.chunkKeys) ? record.chunkKeys.slice() : []);
            record.currentLoaded = currentLoaded;
            record.currentSafe = currentSafe;
            record.visible = false;
            record.renderResident = currentLoaded;
            record.loaded = currentLoaded;
            record.active = currentLoaded;
            record.heldVisible = false;
            record.pendingUnload = false;
            record.unloaded = !currentLoaded;
            record.pendingUnloadStartedAt = 0;
            record.preventedHold = false;
            if (!record.lastVisibilityChangeReason) record.lastVisibilityChangeReason = "init";
            if (!Number.isFinite(Number(record.lastVisibilityChangeTime))) record.lastVisibilityChangeTime = 0;
          }
          entryState.visible = hasVisual ? record.visible === true : null;
          entryState.renderResident = record.renderResident === true;
          entryState.loaded = record.loaded === true;
          entryState.active = record.active === true;
          entryState.heldVisible = record.heldVisible === true;
          entryState.pendingUnload = record.pendingUnload === true;
          entryState.unloaded = record.unloaded === true;
          entryState.currentLoaded = record.currentLoaded === true;
          entryState.currentSafe = record.currentSafe === true;
          entryState.lastVisibilityChangeReason = record.lastVisibilityChangeReason || "init";
          entryState.lastVisibilityChangeTime = Number(record.lastVisibilityChangeTime || 0) || 0;
          entryState.visibilityToggleCount = Number(record.visibilityToggleCount || 0) || 0;
          entryState.preventedVisibilityToggleCount = Number(record.preventedVisibilityToggleCount || 0) || 0;
          entryState.repeatedVisibilityToggleWarnings = Number(record.repeatedVisibilityToggleWarnings || 0) || 0;
          entryState.chunkBoundaryObjectWarnings = Number(record.chunkBoundaryObjectWarnings || 0) || 0;
          entryState.state = hasVisual
            ? (record.visible === true
              ? (record.renderResident === true ? "active" : record.pendingUnload === true ? "pendingUnload" : "held")
              : "unloaded")
            : (record.loaded === true ? "active" : "unloaded");
        }
      } else {
        entryState.loaded = currentLoaded;
        entryState.active = currentLoaded;
        entryState.renderResident = currentLoaded;
        if (hasVisual) entryState.visible = currentLoaded;
      }
    } else if (cullingEnabled && !chunkInfo?.key) {
      entryState.uncullable = true;
      result.uncullableObjects += 1;
      if (isTerrainVisual) result.terrainVisuals.uncullableTerrainVisuals += 1;
    }
    if (hasVisual) {
      if (entryState.visible === false) result.hiddenObjects += 1;
      else result.visibleObjects += 1;
      if (entryState.renderResident === true) result.renderResidentObjects += 1;
      if (entryState.heldVisible === true) result.heldVisibleObjects += 1;
      if (entryState.pendingUnload === true) result.pendingUnloadObjects += 1;
      if (entryState.unloaded === true) result.unloadedObjects += 1;
    }
    if (isTerrainVisual) {
      result.terrainVisuals.registered += 1;
      if (entryState.visible === false) {
        result.terrainVisuals.hidden += 1;
        if (type === "terrainGround") result.terrainVisuals.groundTilesHidden += 1;
        else if (type === "terrainLayer") result.terrainVisuals.terrainLayerTilesHidden += 1;
        else if (type === "terrainSurface") result.terrainVisuals.surfaceSegmentsHidden += 1;
      } else {
        result.terrainVisuals.visible += 1;
        if (type === "terrainGround") result.terrainVisuals.groundTilesVisible += 1;
        else if (type === "terrainLayer") result.terrainVisuals.terrainLayerTilesVisible += 1;
        else if (type === "terrainSurface") result.terrainVisuals.surfaceSegmentsVisible += 1;
      }
    }
    if (entryState.loaded === false) {
      if (type === "entity") result.culledEntities += 1;
      if (type === "scatter") result.culledScatter += 1;
      if (type === "interactable") {
        result.culledInteractables += 1;
        result.inactiveInteractables += 1;
      }
      if (type === "solid") {
        result.culledSolids += 1;
        result.inactiveSolids += 1;
      }
    }
    result.items.push(entryState);
  }

  if (objectTracker) {
    result.objectResidency = buildObjectResidencySummary();
    result.chunkResidency = buildChunkResidencySummary();
  }
  return result;
}

const TERRAIN_MATERIAL_PRESETS = {
  grass: "#6faa4f",
  sand: "#c8a968",
  stone: "#8f9296",
  mud: "#6b4f3a",
  flowers: "#93b86d",
  village_square: "#b7b0a2"
};

const SURFACE_KIND_FALLBACK_COLORS = {
  path: "#c8a46e",
  road: "#555555",
  water: "#2f9ecf",
  river: "#1e8fbb",
  mud: "#7a5230",
  lava: "#cc3300",
  snow: "#dde8f0",
  custom: "#888888"
};

const COLLISION_EPSILON = 0.000001;

const EDITOR_FLY_CAMERA_SPEED = 30;
const EDITOR_FLY_CAMERA_SPRINT_MULTIPLIER = 2;
const EDITOR_FLY_CAMERA_CODES = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"]);

function isEditableEventTarget(target) {
  if (!target || typeof target.tagName !== "string") return false;
  const tag = target.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return true;
  return Boolean(target.isContentEditable);
}

function safeScale(value) {
  if (!Number.isFinite(value)) return 1;
  if (Math.abs(value) < 0.001) return value < 0 ? -0.001 : 0.001;
  return value;
}

function surfaceScalePair(surface, xKey, yKey, legacyKey) {
  const legacyValue = num(surface?.[legacyKey], 1);
  const fallback = safeScale(legacyValue);
  return {
    x: safeScale(surface?.[xKey] != null ? num(surface[xKey], fallback) : fallback),
    y: safeScale(surface?.[yKey] != null ? num(surface[yKey], fallback) : fallback)
  };
}

function surfaceFloat(value, fallback) {
  const number = num(value, fallback);
  return Number.isFinite(number) ? number : fallback;
}

function terrainPresetColor(materialName) {
  return TERRAIN_MATERIAL_PRESETS[String(materialName || "").trim().toLowerCase()] || TERRAIN_MATERIAL_PRESETS.grass;
}

function surfaceKindFallbackColor(kind) {
  return SURFACE_KIND_FALLBACK_COLORS[String(kind || "").trim().toLowerCase()] || SURFACE_KIND_FALLBACK_COLORS.path;
}

function normalizeWorldPointList(points) {
  const normalized = [];
  for (const point of Array.isArray(points) ? points : []) {
    const x = Number(point?.x);
    const z = Number(point?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    if (normalized.length) {
      const previous = normalized[normalized.length - 1];
      if (Math.abs(previous.x - x) < 0.000001 && Math.abs(previous.z - z) < 0.000001) continue;
    }
    normalized.push({ x: x, z: z });
  }
  return normalized;
}

function smoothPolyline(points, samplesPerSegment) {
  if (!Array.isArray(points) || points.length < 3) return points;
  const samples = Math.max(2, Math.min(12, num(samplesPerSegment, 8)));
  const result = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < samples; s += 1) {
      const t = s / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      result.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
      });
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

function createEmptyWalkabilityIndex() {
  return {
    ground: null,
    surfaceBlockers: [],
    blockers: [],
    walkables: []
  };
}

function normalizeCollisionPointList(points) {
  const normalized = normalizeWorldPointList(points);
  if (normalized.length >= 2) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if (Math.abs(first.x - last.x) < COLLISION_EPSILON && Math.abs(first.z - last.z) < COLLISION_EPSILON) {
      normalized.pop();
    }
  }
  return normalized;
}

function normalizeWalkableCollisionPointList(points, fallbackY = 0) {
  const normalized = [];
  const defaultY = num(fallbackY, 0);
  for (const point of Array.isArray(points) ? points : []) {
    const x = Number(point?.x);
    const z = Number(point?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const y = Number.isFinite(Number(point?.y)) ? Number(point.y) : defaultY;
    if (normalized.length) {
      const previous = normalized[normalized.length - 1];
      if (Math.abs(previous.x - x) < COLLISION_EPSILON && Math.abs(previous.z - z) < COLLISION_EPSILON) continue;
    }
    normalized.push({ x: x, y: y, z: z });
  }
  if (normalized.length >= 2) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if (Math.abs(first.x - last.x) < COLLISION_EPSILON && Math.abs(first.z - last.z) < COLLISION_EPSILON) {
      normalized.pop();
    }
  }
  return normalized;
}

function triangulateWalkableSurface(points) {
  if (!Array.isArray(points) || points.length < 3) return [];
  const contour = points.map(function (point) {
    return new THREE.Vector2(point.x, point.z);
  });
  let rawTriangles = [];
  try {
    rawTriangles = THREE.ShapeUtils.triangulateShape(contour, []);
  } catch {
    rawTriangles = [];
  }
  if (!rawTriangles.length && points.length === 3) rawTriangles = [[0, 1, 2]];
  const triangles = [];
  for (const triangle of rawTriangles) {
    if (!Array.isArray(triangle) || triangle.length < 3) continue;
    const ai = Number(triangle[0]);
    const bi = Number(triangle[1]);
    const ci = Number(triangle[2]);
    if (!Number.isInteger(ai) || !Number.isInteger(bi) || !Number.isInteger(ci)) continue;
    const a = points[ai];
    const b = points[bi];
    const c = points[ci];
    if (!a || !b || !c) continue;
    triangles.push({
      a: a,
      b: b,
      c: c,
      minX: Math.min(a.x, b.x, c.x),
      maxX: Math.max(a.x, b.x, c.x),
      minZ: Math.min(a.z, b.z, c.z),
      maxZ: Math.max(a.z, b.z, c.z)
    });
  }
  return triangles;
}

function barycentricHeightAtXZ(px, pz, triangle) {
  if (!triangle?.a || !triangle?.b || !triangle?.c) return null;
  const { a, b, c } = triangle;
  const denominator = ((b.z - c.z) * (a.x - c.x)) + ((c.x - b.x) * (a.z - c.z));
  if (Math.abs(denominator) <= COLLISION_EPSILON) return null;
  const wa = (((b.z - c.z) * (px - c.x)) + ((c.x - b.x) * (pz - c.z))) / denominator;
  const wb = (((c.z - a.z) * (px - c.x)) + ((a.x - c.x) * (pz - c.z))) / denominator;
  const wc = 1 - wa - wb;
  if (wa < -COLLISION_EPSILON || wb < -COLLISION_EPSILON || wc < -COLLISION_EPSILON) return null;
  return (a.y * wa) + (b.y * wb) + (c.y * wc);
}

function pointOnSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const abLengthSq = abx * abx + abz * abz;
  if (abLengthSq <= COLLISION_EPSILON) return Math.hypot(px - ax, pz - az) <= COLLISION_EPSILON;
  const apx = px - ax;
  const apz = pz - az;
  const t = clamp((apx * abx + apz * abz) / abLengthSq, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  return Math.hypot(px - cx, pz - cz) <= COLLISION_EPSILON;
}

function pointInPolygon2D(px, pz, points) {
  if (!Array.isArray(points) || points.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const current = points[index];
    const prior = points[previous];
    if (pointOnSegment(px, pz, prior.x, prior.z, current.x, current.z)) return true;
    const intersects = ((current.z > pz) !== (prior.z > pz))
      && (px < ((prior.x - current.x) * (pz - current.z)) / ((prior.z - current.z) || COLLISION_EPSILON) + current.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceSquaredToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz;
  if (lengthSq <= COLLISION_EPSILON) {
    const dx = px - ax;
    const dz = pz - az;
    return dx * dx + dz * dz;
  }
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / lengthSq, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return dx * dx + dz * dz;
}

function distanceSquaredToPolyline(px, pz, points) {
  if (!Array.isArray(points) || points.length < 2) return Infinity;
  let best = Infinity;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const distanceSq = distanceSquaredToSegment(px, pz, previous.x, previous.z, current.x, current.z);
    if (distanceSq < best) best = distanceSq;
  }
  return best;
}

function closestPointOnSegment2D(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz;
  if (lengthSq <= COLLISION_EPSILON) {
    const dx = px - ax;
    const dz = pz - az;
    return {
      x: ax,
      z: az,
      t: 0,
      distanceSq: dx * dx + dz * dz
    };
  }
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / lengthSq, 0, 1);
  const x = ax + abx * t;
  const z = az + abz * t;
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
        distanceSq: candidate.distanceSq,
        start: start,
        end: end
      };
    }
  }
  return best;
}

function sampleWalkableBoundaryHeight(boundary, fallbackY = 0) {
  if (!boundary?.start || !boundary?.end) return num(fallbackY, 0);
  const startY = num(boundary.start.y, fallbackY);
  const endY = num(boundary.end.y, fallbackY);
  return startY + ((endY - startY) * clamp(num(boundary.t, 0), 0, 1));
}

function pointInAxisAlignedRectangle(px, pz, rect, inflate = 0) {
  const halfWidth = Math.max(0, num(rect?.width, 0)) / 2 + Math.max(0, num(inflate, 0));
  const halfDepth = Math.max(0, num(rect?.depth, 0)) / 2 + Math.max(0, num(inflate, 0));
  if (halfWidth <= 0 || halfDepth <= 0) return false;
  const centerX = num(rect?.x, 0);
  const centerZ = num(rect?.z, 0);
  return Math.abs(px - centerX) <= halfWidth + COLLISION_EPSILON
    && Math.abs(pz - centerZ) <= halfDepth + COLLISION_EPSILON;
}

function pointInRotatedRectangle(px, pz, rect, inflate = 0) {
  const halfWidth = Math.max(0, num(rect?.width, 0)) / 2 + Math.max(0, num(inflate, 0));
  const halfDepth = Math.max(0, num(rect?.depth, 0)) / 2 + Math.max(0, num(inflate, 0));
  if (halfWidth <= 0 || halfDepth <= 0) return false;
  const rotation = -num(rect?.rotationY, 0) * DEG_TO_RAD;
  const centerX = num(rect?.x, 0);
  const centerZ = num(rect?.z, 0);
  const dx = px - centerX;
  const dz = pz - centerZ;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.abs(localX) <= halfWidth + COLLISION_EPSILON && Math.abs(localZ) <= halfDepth + COLLISION_EPSILON;
}

function normalizeGroundForCollision(ground) {
  const bounds = effectiveGroundBounds(ground);
  const y = num(ground?.y, 0);
  if (!bounds) return null;
  return {
    boundsMode: bounds.boundsMode || "centerSize",
    minX: bounds.minX,
    maxX: bounds.maxX,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
    width: bounds.width,
    depth: bounds.depth,
    y: y
  };
}

export function createWalkabilityIndex(worldData) {
  const index = createEmptyWalkabilityIndex();
  index.ground = normalizeGroundForCollision(worldData?.ground);

  const terrain = worldData?.terrain || {};
  const collision = worldData?.collision || {};
  const surfaces = Array.isArray(terrain.surfaces) ? terrain.surfaces : [];
  const blockers = Array.isArray(collision.blockers) ? collision.blockers : [];
  const walkables = Array.isArray(collision.walkableSurfaces) ? collision.walkableSurfaces : [];

  for (const surface of surfaces) {
    if (surface?.blocksPlayer !== true) continue;
    const width = Math.max(0, num(surface?.width, 0));
    const points = normalizeCollisionPointList(surface?.points);
    if (width <= 0 || points.length < 2) continue;
    index.surfaceBlockers.push({
      id: surface?.id || surface?.surfaceId || null,
      surfaceKind: String(surface?.surfaceKind || "custom").trim().toLowerCase(),
      width: width,
      points: points,
      mode: "ribbon"
    });
  }

  for (const blocker of blockers) {
    const shapeType = String(blocker?.shapeType || "polygon").trim().toLowerCase();
    const points = normalizeCollisionPointList(blocker?.points);
    const width = Math.max(0, num(blocker?.width, 0));
    const depth = Math.max(0, num(blocker?.depth, 0));
    const radius = Math.max(0, num(blocker?.radius, 0));
    if (shapeType === "polygon") {
      if (points.length < 3) continue;
    } else if (shapeType === "box") {
      if (width <= 0 || depth <= 0) continue;
    } else if (shapeType === "circle") {
      if (radius <= 0) continue;
    } else {
      continue;
    }
    index.blockers.push({
      id: blocker?.id || null,
      shapeType: shapeType,
      x: num(blocker?.x, 0),
      z: num(blocker?.z, 0),
      width: width,
      depth: depth,
      radius: radius,
      points: points,
      reason: blocker?.reason || null
    });
  }

  for (const walkable of walkables) {
    const width = Math.max(0, num(walkable?.width, 0));
    const depth = Math.max(0, num(walkable?.depth, 0));
    const y = num(walkable?.y, 0);
    const points = normalizeWalkableCollisionPointList(walkable?.points, y);
    const mode = points.length >= 3 ? "polygon" : "rectangle";
    if (mode === "rectangle" && (width <= 0 || depth <= 0)) continue;
    index.walkables.push({
      id: walkable?.id || null,
      x: num(walkable?.x, 0),
      y: y,
      z: num(walkable?.z, 0),
      width: width,
      depth: depth,
      rotationY: num(walkable?.rotationY, 0),
      priority: num(walkable?.priority, 0),
      points: points,
      mode: mode,
      triangles: mode === "polygon" ? triangulateWalkableSurface(points) : []
    });
  }

  index.walkables.sort(function (left, right) {
    const priorityDelta = num(right?.priority, 0) - num(left?.priority, 0);
    if (priorityDelta !== 0) return priorityDelta;
    return String(left?.id || "").localeCompare(String(right?.id || ""));
  });

  return index;
}

let activeWalkabilityIndex = createEmptyWalkabilityIndex();

function resolveWalkabilitySource(source) {
  if (!source) return activeWalkabilityIndex;
  if (Array.isArray(source.walkables) && Array.isArray(source.blockers) && Array.isArray(source.surfaceBlockers)) return source;
  return activeWalkabilityIndex;
}

function findWalkableSurfaceEntry(index, x, z, inflate = 0) {
  const walkables = Array.isArray(index?.walkables) ? index.walkables : [];
  const extraRadius = Math.max(0, num(inflate, 0));
  for (const walkable of walkables) {
    if (walkable?.mode === "polygon") {
      if (extraRadius > COLLISION_EPSILON ? isPolygonBlockedAtRadius(walkable.points, x, z, extraRadius) : pointInPolygon2D(x, z, walkable.points)) {
        return walkable;
      }
    } else if (pointInRotatedRectangle(x, z, walkable, extraRadius)) {
      return walkable;
    }
  }
  return null;
}

function walkableSurfaceHeightSample(walkable, x, z, fallbackY = 0) {
  if (!walkable) return null;
  if (walkable.mode === "polygon") {
    for (const triangle of Array.isArray(walkable.triangles) ? walkable.triangles : []) {
      if (x < triangle.minX - COLLISION_EPSILON || x > triangle.maxX + COLLISION_EPSILON) continue;
      if (z < triangle.minZ - COLLISION_EPSILON || z > triangle.maxZ + COLLISION_EPSILON) continue;
      const height = barycentricHeightAtXZ(x, z, triangle);
      if (height !== null) return height;
    }
    return null;
  }
  return num(walkable.y, fallbackY);
}

function walkableSurfaceHeightAt(index, x, z, fallbackY = 0, inflate = 0) {
  const walkable = findWalkableSurfaceEntry(index, x, z, inflate);
  if (!walkable) return null;
  const height = walkableSurfaceHeightSample(walkable, x, z, fallbackY);
  if (height !== null) return height;
  const extraRadius = Math.max(0, num(inflate, 0));
  if (walkable.mode === "polygon" && extraRadius > COLLISION_EPSILON) {
    const boundary = closestPointOnPolygonBoundary(x, z, walkable.points);
    if (boundary && boundary.distanceSq <= extraRadius * extraRadius + COLLISION_EPSILON) {
      return sampleWalkableBoundaryHeight(boundary, fallbackY);
    }
  }
  return num(walkable.y, fallbackY);
}

export function buildWalkabilityIndex(worldData) {
  activeWalkabilityIndex = createWalkabilityIndex(worldData);
  return activeWalkabilityIndex;
}

export function clearWalkabilityIndex() {
  activeWalkabilityIndex = createEmptyWalkabilityIndex();
  return activeWalkabilityIndex;
}

function countObjectTree(object) {
  let objects = 0;
  let meshes = 0;
  if (!object) return { objects: 0, meshes: 0 };
  object.traverse(function (child) {
    objects += 1;
    if (child.isMesh) meshes += 1;
  });
  return { objects: objects, meshes: meshes };
}

export function isPointOnWalkableSurface(source, x, z, radius = 0) {
  const index = resolveWalkabilitySource(source);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  return Boolean(findWalkableSurfaceEntry(index, x, z, radius));
}

function isPolygonBlockedAtRadius(points, x, z, radius) {
  if (pointInPolygon2D(x, z, points)) return true;
  const sampleRadius = Math.max(0, num(radius, 0));
  if (sampleRadius <= COLLISION_EPSILON) return false;
  const boundary = closestPointOnPolygonBoundary(x, z, points);
  return Boolean(boundary && boundary.distanceSq <= sampleRadius * sampleRadius + COLLISION_EPSILON);
}

export function isPointBlockedByBlocker(source, x, z, radius = 0) {
  const index = resolveWalkabilitySource(source);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  for (const blocker of index.blockers) {
    if (blocker.shapeType === "polygon") {
      if (isPolygonBlockedAtRadius(blocker.points, x, z, radius)) return true;
    } else if (blocker.shapeType === "box") {
      if (pointInAxisAlignedRectangle(x, z, blocker, radius)) return true;
    } else if (blocker.shapeType === "circle") {
      const dx = x - blocker.x;
      const dz = z - blocker.z;
      const limit = blocker.radius + Math.max(0, num(radius, 0));
      if (dx * dx + dz * dz <= limit * limit + COLLISION_EPSILON) return true;
    }
  }
  return false;
}

function isPointBlockedBySurfaceEntry(surface, x, z, radius) {
  const halfWidth = (surface.width / 2) + Math.max(0, num(radius, 0));
  if (halfWidth <= 0) return false;
  const distanceSq = distanceSquaredToPolyline(x, z, surface.points);
  return distanceSq <= halfWidth * halfWidth + COLLISION_EPSILON;
}

export function isPointBlockedBySurface(source, x, z, radius = 0) {
  const index = resolveWalkabilitySource(source);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const surfaceBlockers = Array.isArray(index.surfaceBlockers) ? index.surfaceBlockers : [];
  for (const surface of surfaceBlockers) {
    if (isPointBlockedBySurfaceEntry(surface, x, z, radius)) return true;
  }
  return false;
}

export function isPointBlockedByTerrain(source, x, z, radius = 0) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const index = resolveWalkabilitySource(source);
  if (isPointOnWalkableSurface(index, x, z, radius)) return false;
  return isPointBlockedByBlocker(index, x, z, radius)
    || isPointBlockedBySurface(index, x, z, radius);
}

function clampPointToGround(point, ground, radius) {
  if (!ground) return point;
  const bounds = effectiveGroundBounds(ground);
  if (bounds) {
    const minX = bounds.minX + radius;
    const maxX = bounds.maxX - radius;
    const minZ = bounds.minZ + radius;
    const maxZ = bounds.maxZ - radius;
    if (Number.isFinite(minX) && Number.isFinite(maxX) && minX <= maxX) point.x = Math.min(maxX, Math.max(minX, point.x));
    if (Number.isFinite(minZ) && Number.isFinite(maxZ) && minZ <= maxZ) point.z = Math.min(maxZ, Math.max(minZ, point.z));
  }
  if (Number.isFinite(ground.y)) point.y = ground.y;
  return point;
}

function pushAwayFromSolids(point, radius, solids) {
  if (!Array.isArray(solids) || !solids.length) return point;
  for (const solid of solids) {
    const solidRadius = Math.max(0, num(solid?.radius, 0));
    if (solidRadius <= 0) continue;
    const dx = point.x - num(solid?.x, 0);
    const dz = point.z - num(solid?.z, 0);
    const minDist = radius + solidRadius;
    const dist = Math.hypot(dx, dz);
    if (dist > 0 && dist < minDist) {
      const push = (minDist - dist) / dist;
      point.x += dx * push;
      point.z += dz * push;
    }
  }
  return point;
}

function hasMovedXZ(startX, startZ, x, z) {
  return Math.hypot(x - startX, z - startZ) > COLLISION_EPSILON;
}

function resolveMovementCandidateInto(output, startX, startY, startZ, candidateX, candidateY, candidateZ, index, ground, solids, radius) {
  output.x = Number.isFinite(candidateX) ? candidateX : startX;
  output.y = Number.isFinite(candidateY) ? candidateY : startY;
  output.z = Number.isFinite(candidateZ) ? candidateZ : startZ;
  clampPointToGround(output, ground, radius);
  if (isPointBlockedByTerrain(index, output.x, output.z, radius)) return false;
  pushAwayFromSolids(output, radius, solids);
  clampPointToGround(output, ground, radius);
  if (isPointBlockedByTerrain(index, output.x, output.z, radius)) return false;
  const walkableY = walkableSurfaceHeightAt(index, output.x, output.z, num(ground?.y, startY), radius);
  if (walkableY !== null) output.y = walkableY;
  return true;
}

function resolveMovementStepInto(output, startX, startY, startZ, desiredX, desiredY, desiredZ, index, ground, solids, radius) {
  if (resolveMovementCandidateInto(output, startX, startY, startZ, desiredX, desiredY, desiredZ, index, ground, solids, radius)) return output;
  if (resolveMovementCandidateInto(output, startX, startY, startZ, desiredX, desiredY, startZ, index, ground, solids, radius) && hasMovedXZ(startX, startZ, output.x, output.z)) return output;
  if (resolveMovementCandidateInto(output, startX, startY, startZ, startX, desiredY, desiredZ, index, ground, solids, radius) && hasMovedXZ(startX, startZ, output.x, output.z)) return output;
  output.x = startX;
  output.y = startY;
  output.z = startZ;
  return output;
}

function movementSubstepCount(startX, startZ, desiredX, desiredZ, radius) {
  const distance = Math.hypot(desiredX - startX, desiredZ - startZ);
  if (distance <= COLLISION_EPSILON) return 1;
  const stepSize = Math.max(Math.max(0, num(radius, 0)) * 0.45, 0.12);
  return clamp(Math.ceil(distance / stepSize), 1, 8);
}

function resolveMovementInto(output, start, desired, options = {}) {
  const index = resolveWalkabilitySource(options.index);
  const radius = Math.max(0, num(options.radius, 0.5));
  const ground = options.ground || index.ground || null;
  const solids = Array.isArray(options.solids) ? options.solids : [];
  const startX = num(start?.x, 0);
  const startY = num(start?.y, 0);
  const startZ = num(start?.z, 0);
  const desiredX = num(desired?.x, startX);
  const desiredY = num(desired?.y, startY);
  const desiredZ = num(desired?.z, startZ);
  const substeps = movementSubstepCount(startX, startZ, desiredX, desiredZ, radius);
  let currentX = startX;
  let currentY = startY;
  let currentZ = startZ;
  output.x = startX;
  output.y = startY;
  output.z = startZ;
  for (let stepIndex = 1; stepIndex <= substeps; stepIndex += 1) {
    const t = stepIndex / substeps;
    const candidateX = startX + ((desiredX - startX) * t);
    const candidateY = startY + ((desiredY - startY) * t);
    const candidateZ = startZ + ((desiredZ - startZ) * t);
    resolveMovementStepInto(output, currentX, currentY, currentZ, candidateX, candidateY, candidateZ, index, ground, solids, radius);
    if (!hasMovedXZ(currentX, currentZ, output.x, output.z) && hasMovedXZ(currentX, currentZ, candidateX, candidateZ)) {
      output.x = currentX;
      output.y = currentY;
      output.z = currentZ;
      return output;
    }
    currentX = output.x;
    currentY = output.y;
    currentZ = output.z;
  }
  return output;
}

export function resolveMovement(start, desired, options = {}) {
  const result = {
    x: num(start?.x, 0),
    y: num(start?.y, 0),
    z: num(start?.z, 0)
  };
  return resolveMovementInto(result, start, desired, options);
}

function createWorldPlaneGeometry(minX, maxX, minZ, maxZ, y, uvBounds) {
  const safeMinX = num(minX, 0);
  const safeMaxX = num(maxX, 0);
  const safeMinZ = num(minZ, 0);
  const safeMaxZ = num(maxZ, 0);
  if (safeMaxX <= safeMinX || safeMaxZ <= safeMinZ) return null;
  const safeY = num(y, 0);
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array([
    safeMinX, safeY, safeMinZ,
    safeMaxX, safeY, safeMinZ,
    safeMaxX, safeY, safeMaxZ,
    safeMinX, safeY, safeMaxZ
  ]);
  const uvMinX = Number.isFinite(Number(uvBounds?.minX)) ? num(uvBounds.minX, safeMinX) : safeMinX;
  const uvMaxX = Number.isFinite(Number(uvBounds?.maxX)) ? num(uvBounds.maxX, safeMaxX) : safeMaxX;
  const uvMinZ = Number.isFinite(Number(uvBounds?.minZ)) ? num(uvBounds.minZ, safeMinZ) : safeMinZ;
  const uvMaxZ = Number.isFinite(Number(uvBounds?.maxZ)) ? num(uvBounds.maxZ, safeMaxZ) : safeMaxZ;
  const repeatX = Math.max(0.000001, num(uvBounds?.repeatX, 1));
  const repeatZ = Math.max(0.000001, num(uvBounds?.repeatZ, 1));
  const width = Math.max(0.000001, uvMaxX - uvMinX);
  const depth = Math.max(0.000001, uvMaxZ - uvMinZ);
  const u0 = ((safeMinX - uvMinX) / width) * repeatX;
  const u1 = ((safeMaxX - uvMinX) / width) * repeatX;
  const v0 = ((safeMinZ - uvMinZ) / depth) * repeatZ;
  const v1 = ((safeMaxZ - uvMinZ) / depth) * repeatZ;
  const uvs = new Float32Array([
    u0, v0,
    u1, v0,
    u1, v1,
    u0, v1
  ]);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

export function buildSurfaceStripGeometry(points, options) {
  const halfWidth = Math.max(0, Number(options?.width || 0)) / 2;
  const y = Number(options?.y || 0);
  const uvScale = Math.max(0.001, Number(options?.uvScale || 1));
  const uvStartLength = Math.max(0, Number(options?.uvStartLength || 0));

  if (!Array.isArray(points) || points.length < 2 || halfWidth <= 0) return null;

  const n = points.length;

  // Cumulative arc length for continuous V UV coordinate
  const arcLengths = [0];
  for (let i = 1; i < n; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dz = points[i].z - points[i - 1].z;
    arcLengths.push(arcLengths[i - 1] + Math.hypot(dx, dz));
  }

  const positions = new Float32Array(n * 2 * 3);
  const uvCoords = new Float32Array(n * 2 * 2);
  const indices = [];

  for (let i = 0; i < n; i++) {
    let nx, nz; // miter offset vector (left perpendicular * scale)

    if (i === 0) {
      const dx = points[1].x - points[0].x;
      const dz = points[1].z - points[0].z;
      const len = Math.hypot(dx, dz) || 1;
      nx = (-dz / len) * halfWidth;
      nz = (dx / len) * halfWidth;
    } else if (i === n - 1) {
      const dx = points[n - 1].x - points[n - 2].x;
      const dz = points[n - 1].z - points[n - 2].z;
      const len = Math.hypot(dx, dz) || 1;
      nx = (-dz / len) * halfWidth;
      nz = (dx / len) * halfWidth;
    } else {
      // Miter join: average incoming and outgoing normals, scale to keep strip width
      const dx1 = points[i].x - points[i - 1].x;
      const dz1 = points[i].z - points[i - 1].z;
      const l1 = Math.hypot(dx1, dz1) || 1;
      const dx2 = points[i + 1].x - points[i].x;
      const dz2 = points[i + 1].z - points[i].z;
      const l2 = Math.hypot(dx2, dz2) || 1;
      const n1x = -dz1 / l1;
      const n1z = dx1 / l1;
      const n2x = -dz2 / l2;
      const n2z = dx2 / l2;
      let mx = n1x + n2x;
      let mz = n1z + n2z;
      const mlen = Math.hypot(mx, mz);
      if (mlen < 0.0001) {
        // Nearly 180-degree bend — use incoming normal
        nx = n1x * halfWidth;
        nz = n1z * halfWidth;
      } else {
        mx /= mlen;
        mz /= mlen;
        const dot = mx * n1x + mz * n1z;
        // Clamp miter scale to 2.5x to prevent spikes at sharp bends (bevel-like)
        const scale = Math.min(halfWidth * 2.5, Math.abs(dot) > 0.0001 ? halfWidth / dot : halfWidth * 2.5);
        nx = mx * scale;
        nz = mz * scale;
      }
    }

    const base = i * 2;

    // Left vertex — U=0
    positions[base * 3] = points[i].x + nx;
    positions[base * 3 + 1] = y;
    positions[base * 3 + 2] = points[i].z + nz;
    uvCoords[base * 2] = 0;
    uvCoords[base * 2 + 1] = (uvStartLength + arcLengths[i]) / uvScale;

    // Right vertex — U=1
    positions[(base + 1) * 3] = points[i].x - nx;
    positions[(base + 1) * 3 + 1] = y;
    positions[(base + 1) * 3 + 2] = points[i].z - nz;
    uvCoords[(base + 1) * 2] = 1;
    uvCoords[(base + 1) * 2 + 1] = (uvStartLength + arcLengths[i]) / uvScale;

    if (i < n - 1) {
      indices.push(base, base + 2, base + 1);
      indices.push(base + 1, base + 2, base + 3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvCoords, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function createPolygonShapeGeometry(points) {
  const normalizedPoints = normalizeWorldPointList(points);
  if (normalizedPoints.length < 3) return null;
  if (Math.abs(normalizedPoints[0].x - normalizedPoints[normalizedPoints.length - 1].x) < 0.000001
    && Math.abs(normalizedPoints[0].z - normalizedPoints[normalizedPoints.length - 1].z) < 0.000001) {
    normalizedPoints.pop();
  }
  if (normalizedPoints.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(normalizedPoints[0].x, normalizedPoints[0].z);
  for (let index = 1; index < normalizedPoints.length; index += 1) {
    shape.lineTo(normalizedPoints[index].x, normalizedPoints[index].z);
  }
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function createClippedPolygonTileGeometry(points, bounds) {
  const clipped = clipPolygonToRectangle(points, bounds);
  if (!Array.isArray(clipped) || clipped.length < 3) return null;
  return createPolygonShapeGeometry(clipped);
}

export function createGkWorldRuntime(canvas, options = {}) {
  const mode = options.mode || "editor";
  const hudElement = options.hud || null;
  const rendererAntialias = options.antialias !== false;
  const externalPlayerAuthority = options.externalPlayerAuthority === true || options.disableGameInput === true;

  const worldPerformanceDefaults = WORLD_PERFORMANCE_DEFAULTS;
  let worldPerformance = {
    shared: { ...worldPerformanceDefaults.shared },
    game: { ...worldPerformanceDefaults.game },
    editor: { ...worldPerformanceDefaults.editor }
  };
  // Warnings are useful while debugging, but repeated warnings can stall the browser.
  // Gate console.warn here so the world setting controls both three.js and runtime spam.
  const originalConsoleWarn = console.warn.bind(console);
  const consoleWarnGate = function (...params) {
    if (!debugWarningsVisibleInCurrentMode()) return;
    originalConsoleWarn(...params);
  };
  let consoleWarnPatched = false;
  function installConsoleWarnGate() {
    if (consoleWarnPatched) return;
    consoleWarnPatched = true;
    console.warn = consoleWarnGate;
  }
  function restoreConsoleWarnGate() {
    if (!consoleWarnPatched) return;
    if (console.warn === consoleWarnGate) {
      console.warn = originalConsoleWarn;
    }
    consoleWarnPatched = false;
  }
  installConsoleWarnGate();
  let shadowPolicy = resolveShadowPolicy(null, mode);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: rendererAntialias });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mode === "editor" ? worldPerformance.editor.pixelRatioCap : worldPerformance.game.pixelRatioCap));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.info.autoReset = true;
  renderer.shadowMap.enabled = shadowPolicy.enabled;
  renderer.shadowMap.type = shadowPolicy.mapType || THREE.PCFSoftShadowMap;
  const rendererProfile = detectRendererProfile(renderer);
  if (rendererProfile.software === true) {
    renderer.shadowMap.enabled = false;
    if (mode === "editor") {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
    }
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000000);
  const content = new THREE.Group();
  scene.add(content);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const loader = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();
  const modelCache = new Map();
  const entityRoots = new Map();
  const solids = [];
  const animationMixers = new Map();
  const modifierState = { ctrlKey: false, shiftKey: false };

  let world = null;
  let worldBuildGeneration = 0;
  let orbitControls = null;
  let selectionHelper = null;
  let transformGuide = null;
  let terrainEditorOverlay = null;
  let terrainEditorOverlayState = null;
  let scatterEditorOverlay = null;
  let scatterEditorOverlayState = null;
  let terrainRuntimeGroup = null;
  let terrainRuntimeGeneration = 0;
  let fullGroundPlane = null;
  let fullGroundPlaneTextureAssetId = null;
  let groundShadowAnchorKey = "";
  let shadowAnchorState = {
    mode: "static",
    x: 0,
    z: 0,
    lastUpdatedReason: "init"
  };
  let stableSunShadowController = null;
  let scatterShadowFallbacks = 0;
  let nonInstancedShadowCasters = 0;
  const directionalLights = [];
  const groundChunkState = {
    mode: "full",
    tilesByChunkKey: new Map(),
    residentTiles: new Map(),
    materialCache: new Map(),
    textureRefs: new Map(),
    lastLoadedChunkKeySet: new Set(),
    blueprintSignature: "",
    blueprint: null,
    stats: {
      mode: "full",
      enabled: false,
      policySource: "none",
      fullGroundPlaneActive: false,
      fullGroundPlaneName: null,
      fullGroundPlaneVisible: false,
      groundTilesBlueprint: 0,
      groundTilesResident: 0,
      groundTilesVisible: 0,
      groundTilesHidden: 0,
      loadedChunkKeys: [],
      residentChunkKeys: [],
      enteringChunkKeys: [],
      leavingChunkKeys: [],
      lastSyncReason: "init"
    }
  };
  const terrainTextureRecords = new Map();
  const surfaceMaterialRecords = new Map();
  const terrainRuntimeEntries = new Map();
  const terrainRuntimeChunkIndex = new Map();
  const terrainRuntimeResidentEntries = new Set();
  const terrainStreamingState = {
    blueprintPieces: 0,
    residentPieces: 0,
    builtPieces: 0,
    disposedPieces: 0,
    residentObjects: 0,
    residentMeshes: 0,
    residentChunks: 0,
    residentChunkKeys: [],
    loadedChunks: 0,
    activeChunks: 0,
    preloadChunks: 0,
    textureRefs: 0,
    textureAssets: 0,
    surfaceMaterials: 0,
    groundTilesResident: 0,
    terrainLayerTilesResident: 0,
    surfaceSegmentsResident: 0,
    lastUpdateReason: "init"
  };
  let surfaceAnimMaterials = [];
  let surfaceDefaultWhiteTex = null;
  let selectedEntityId = null;
  let selectedRoot = null;
  let transformSession = null;
  let onSelectEntity = options.onSelectEntity || function () {};
  let onTransformCommit = options.onTransformCommit || function () {};
  let onTransformEnd = options.onTransformEnd || function () {};
  let onTransformChange = options.onTransformChange || function () {};
  let onModelLoadTiming = options.onModelLoadTiming || function () {};
  const loadErrors = [];
  let editorViewInitialized = false;
  let disposed = false;
  let editorPointerDownHandler = null;
  let editorPointerDownCaptureHandler = null;
  let editorPointerUpCaptureHandler = null;
  let editorContextMenuHandler = null;
  let editorAuxClickHandler = null;
  let editorKeyDownHandler = null;
  let editorKeyUpHandler = null;
  let editorWindowBlurHandler = null;
  let editorDirectPointerMoveHandler = null;
  let editorDirectPointerUpHandler = null;
  let editorDirectMouseMoveHandler = null;
  let editorDirectMouseUpHandler = null;
  let lastEditorPointer = null;
  let viewportPanSession = null;
  let viewportOrbitFallbackActive = false;
  let gamePointerDownHandler = null;
  let gameKeyDownHandler = null;
  let gameKeyUpHandler = null;
  let gameWheelHandler = null;
  let rafId = null;
  let renderRequested = false;
  let running = false;
  let resizeRafId = null;
  let resizeObserver = null;
  let windowResizeHandler = null;
  let resizeTarget = canvas.parentElement || canvas;
  let lastResizeWidth = 0;
  let lastResizeHeight = 0;
  let lastResizePixelRatio = 0;
  let loopGeneration = 0;
  let pendingResizeReason = "init";
  let transformState = {
    active: false,
    cancelled: false,
    object: null,
    rootId: null,
    start: null,
    mode: "move",
    axis: null,
    startPointer: null,
    currentPointer: null,
    startPosition: null,
    startRotation: null,
    startScale: null
  };
  let transformDebugState = {
    active: false,
    rootId: null,
    mode: "move",
    axis: null,
    dx: 0,
    dy: 0,
    changed: false,
    previews: 0,
    lastInputAt: 0
  };
  let transformAxisConstraint = null;
  let snapState = {
    mode: "off",
    gridSize: 1
  };
  let localViewActive = false;
  let previewAnimations = false;
  const DEBUG_RUNTIME = window.__GK_DEBUG_RUNTIME && typeof window.__GK_DEBUG_RUNTIME === "object"
    ? window.__GK_DEBUG_RUNTIME
    : { enabled: false, activeLoopCount: 0, running: false, resizeCount: 0, renderCount: 0, lastRenderReasons: [], lastResizeSnapshot: null, activeResizeHandlers: 0, lastFrameTiming: null };
  window.__GK_DEBUG_RUNTIME = DEBUG_RUNTIME;
  let lastTime = 0;

  // Game state
  const player = {
    root: null,
    pos: new THREE.Vector3(),
    facing: 0,
    radius: 0.5,
    speed: 6,
    sprint: 1.6,
    turnSpeed: 600,
    animationState: "idle",
    displayName: String(options.localPlayerDisplayName || options.playerDisplayName || "").trim(),
    nameplateRoot: null,
    reconcileActive: false,
    reconcileTarget: new THREE.Vector3(),
    reconcileStart: new THREE.Vector3(),
    reconcileTargetFacing: 0,
    reconcileStartFacing: 0,
    reconcileDurationMs: 120,
    reconcileElapsedMs: 0,
    pendingState: null
  };
  const remotePlayers = new Map();
  let camYaw = 0;
  let camPitch = 60;
  let camDistance = 24;
  let camMinDistance = 1;
  let camMaxDistance = 500;
  let camFollow = true;
  let camTargetHeightOffset = 1.6;
  let camRotateSpeed = 90;
  const camTarget = new THREE.Vector3();
  const playerCameraTargetCache = new THREE.Vector3();
  let clickTarget = null;
  const pressedKeys = new Set();
  const keyToAction = new Map();
  const actionToKeyCodes = new Map();
  const moveVector = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const flyCameraKeys = new Set();
  const flyCameraForward = new THREE.Vector3();
  const flyCameraRight = new THREE.Vector3();
  const flyCameraMove = new THREE.Vector3();
  const movementTarget = new THREE.Vector3();
  const interactables = [];
  let activeInteractable = null;
  let hudModules = [];
  const hudNodes = { prompt: null, anchored: new Map(), performance: new Map() };
  const rendererLabel = renderer.capabilities?.isWebGL2 ? "WebGL2" : "WebGL1";
  const runtimeStats = {
    sceneObjects: 0,
    meshes: 0,
    terrainVisuals: 0,
    terrainLayers: 0,
    terrainSurfaces: 0,
    collisionShapes: 0,
    entities: 0,
    scatterInstances: 0,
    interactables: 0,
    remotePlayers: 0
  };
  let publishedWorldItemCount = 0;
  let perfHudNextUpdateAt = 0;
  let perfHudFrameMs = 0;
  let perfHudWarmup = false;
  const chunkSyncStats = {
    syncCalls: 0,
    heavySyncCalls: 0,
    skippedSyncCalls: 0,
    lastHeavyReason: "init",
    lastHeavySyncMs: 0
  };
  const collisionPerfState = {
    activeSolids: 0,
    terrainBlockers: 0,
    surfaceBlockers: 0,
    checksLastFrame: 0,
    lastResolveMs: 0
  };
  let chunkDebugOverlay = null;
  let overlayDiagnosticsState = {
    debugOverlayEnabled: false,
    chunkDebugOverlayVisible: false,
    terrainRuntimeGroups: 0,
    chunkDebugOverlayGroups: 0,
    cameraChildOverlayGroups: 0,
    sceneDebugOverlayGroups: 0,
    sceneChildOverlayGroups: 0,
    duplicateOverlayFound: false,
    removedDuplicateOverlays: 0,
    removedOverlayGroups: 0,
    overlayShadowCasters: 0
  };
  let chunkDebugStateCache = null;
  let chunkDebugSignature = "";
  let contentBlueprintIndex = createEmptyContentBlueprintIndex();
  let residentContentState = createEmptyResidentContentState();
  objectResidencyState = createEmptyObjectResidencyTracker();
  chunkResidencyState = createEmptyChunkResidencyTracker();
  const streamingHeadingState = { lastPlayerPosition: null, lastCameraTarget: null };
  let residentBootstrapState = {
    lastReason: "init",
    worldGeneration: 0,
    activeBuiltImmediately: 0,
    visibleBuiltImmediately: 0,
    preloadBuiltImmediately: 0,
    pendingAfterBootstrap: 0,
    emptyScenePrevented: true
  };
  const chunkRuntimeEntries = [];
  let chunkRuntimeRegistryVersion = 0;
  let chunkRuntimeState = {
    policy: null,
    centerChunk: null,
    loadedChunkKeys: [],
    renderChunkKeys: [],
    shadowResidentChunkKeys: [],
    collisionResidentChunkKeys: [],
    shadowWindowChunkKeys: [],
    activeChunkKeys: [],
    preloadChunkKeys: [],
    visibleChunkKeys: [],
    forwardChunkKeys: [],
    unloadSafeChunkKeys: [],
    desiredResidentChunkKeys: [],
    presenceChunkKey: null,
    presenceChunkDistance: null,
    presenceChunkAccepted: false,
    streamingCoverageSource: "none",
    clippedByMaxLoadedChunks: false,
    hiddenObjects: 0,
    visibleObjects: 0,
    renderResidentObjects: 0,
    heldVisibleObjects: 0,
    pendingUnloadObjects: 0,
    unloadedObjects: 0,
    inactiveInteractables: 0,
    inactiveSolids: 0,
    culledEntities: 0,
    culledScatter: 0,
    culledInteractables: 0,
    culledSolids: 0,
    uncullableObjects: 0,
    objectResidency: null,
    chunkResidency: null,
    terrainVisuals: createEmptyTerrainVisualStats(),
    ground: cloneGroundChunkStats(),
    terrainStreaming: Object.assign({}, terrainStreamingState, {
      residentChunkKeys: terrainStreamingState.residentChunkKeys.slice()
    }),
    keepSelectedChunkLoadedApplied: false,
    cullingEnabled: false,
    lastSignature: "",
    lastUpdateReason: "init"
  };
  const activeSolids = [];
  let runtimeCollisionBaseCount = 0;
  const frameProfileWaiters = [];

  function settleFrameProfileWaiters(frameTiming) {
    if (!frameProfileWaiters.length) return;
    const waiters = frameProfileWaiters.splice(0, frameProfileWaiters.length);
    for (const waiter of waiters) {
      if (waiter.timeoutId) clearTimeout(waiter.timeoutId);
      waiter.resolve(frameTiming);
    }
  }

  function rejectFrameProfileWaiters(error) {
    if (!frameProfileWaiters.length) return;
    const waiters = frameProfileWaiters.splice(0, frameProfileWaiters.length);
    for (const waiter of waiters) {
      if (waiter.timeoutId) clearTimeout(waiter.timeoutId);
      waiter.reject(error);
    }
  }

  function waitForNextFrameTiming(timeoutMs = 30000) {
    return new Promise(function (resolve, reject) {
      const waiter = {
        resolve: resolve,
        reject: reject,
        timeoutId: null
      };
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        waiter.timeoutId = setTimeout(function () {
          const index = frameProfileWaiters.indexOf(waiter);
          if (index >= 0) frameProfileWaiters.splice(index, 1);
          reject(new Error("profilePerformance timed out after " + timeoutMs + "ms"));
        }, timeoutMs);
      }
      frameProfileWaiters.push(waiter);
    });
  }

  // Fase 8.7: editor only ever reads performance.editor and game only ever reads
  // performance.game. The published preset is just a visible field on that mode; there are no
  // hidden profile overrides left in the runtime path.
  function resolveWorldPerformance(worldData) {
    return resolveWorldPerformanceForRenderer(worldData, rendererProfile);
  }

  function resolveShadowPolicyFromPerformance(performance, modeName) {
    const modePerformance = modeName === "editor" ? (performance?.editor || worldPerformanceDefaults.editor) : (performance?.game || worldPerformanceDefaults.game);
    const policy = resolveModeShadowPolicy(modePerformance, modeName);
    if (performance?.compatibility?.usedLegacyWorldSettingsPerformanceFields || performance?.compatibility?.legacyShadowFieldsMigrated) {
      policy.legacyFieldsIgnored = true;
    }
    if (rendererProfile.software === true) {
      return Object.assign({}, policy, {
        enabled: false,
        rendererShadowMapEnabled: false,
        mapSize: 0,
        cameraSize: 0,
        cameraFar: 0,
        snapWorldUnits: 0,
        shadowResidentMarginChunks: 0,
        shadowsEnabled: false
      });
    }
    return policy;
  }

  function applyRendererShadowPolicy(policy) {
    const enabled = Boolean(policy?.enabled);
    renderer.shadowMap.enabled = enabled;
    renderer.shadowMap.type = policy?.mapType || THREE.PCFSoftShadowMap;
    return enabled;
  }

  function syncWorldShadowCasterState(enabled) {
    if (!scene || typeof scene.traverse !== "function") return 0;
    const restore = enabled === true;
    let changed = 0;
    const seen = new Set();
    const visit = function (object) {
      if (!object || seen.has(object)) return;
      seen.add(object);
      if (isDebugOverlayObject(object) || object.userData?.debugOverlay === true || object.userData?.debugOverlayRoot === true) return;
      object.userData = object.userData || {};
      const currentCast = object.castShadow === true;
      const currentReceive = object.receiveShadow === true;
      if (!restore) {
        if (!object.userData.shadowDisabledOriginalState) {
          object.userData.shadowDisabledOriginalState = {
            castShadow: currentCast,
            receiveShadow: currentReceive
          };
        }
        if (currentCast !== false || currentReceive !== false) {
          object.castShadow = false;
          object.receiveShadow = false;
          changed += 1;
        }
        return;
      }
      const original = object.userData.shadowDisabledOriginalState;
      if (!original) return;
      if (currentCast !== original.castShadow) {
        object.castShadow = original.castShadow;
        changed += 1;
      }
      if (currentReceive !== original.receiveShadow) {
        object.receiveShadow = original.receiveShadow;
        changed += 1;
      }
      delete object.userData.shadowDisabledOriginalState;
    };
    scene.traverse(visit);
    if (content && content !== scene && typeof content.traverse === "function") {
      content.traverse(visit);
    }
    return changed;
  }

  function applyDirectionalShadowPolicy(directional, policy) {
    if (!directional) return;
    directional.castShadow = Boolean(policy?.enabled);
    if (!policy?.enabled) return;
    directional.shadow.mapSize.set(policy.mapSize, policy.mapSize);
    directional.shadow.bias = policy.bias;
    directional.shadow.normalBias = policy.normalBias;
    directional.shadow.camera.left = -policy.cameraSize;
    directional.shadow.camera.right = policy.cameraSize;
    directional.shadow.camera.top = policy.cameraSize;
    directional.shadow.camera.bottom = -policy.cameraSize;
    directional.shadow.camera.far = policy.cameraFar;
    if (directional.shadow.camera && typeof directional.shadow.camera.updateProjectionMatrix === "function") {
      directional.shadow.camera.updateProjectionMatrix();
    }
  }

  function applyWorldPerformance(worldData) {
    worldPerformance = resolveWorldPerformance(worldData);
    if (rendererProfile.software === true) {
      worldPerformance.editor.pixelRatioCap = Math.min(worldPerformance.editor.pixelRatioCap, 1);
      worldPerformance.game.pixelRatioCap = Math.min(worldPerformance.game.pixelRatioCap, 0.7);
      if (worldPerformance.game.shadow) {
        worldPerformance.game.shadow.enabled = false;
        worldPerformance.game.shadow.preset = "geen_schaduw";
        worldPerformance.game.shadow.mapSize = 0;
        worldPerformance.game.shadow.cameraSize = 0;
        worldPerformance.game.shadow.cameraFar = 0;
        worldPerformance.game.shadow.snapWorldUnits = 0;
        worldPerformance.game.shadow.shadowResidentMarginChunks = 0;
      }
      worldPerformance.game.shadowsEnabled = false;
      worldPerformance.game.shadowQuality = "off";
      worldPerformance.game.shadowMapSize = 0;
      worldPerformance.game.shadowCameraSize = 0;
      worldPerformance.game.shadowCameraFar = 0;
    }
    shadowPolicy = resolveShadowPolicyFromPerformance(worldPerformance, mode);
    applyRendererShadowPolicy(shadowPolicy);
    syncWorldShadowCasterState(shadowPolicy.enabled === true);
    return worldPerformance;
  }

  function isChunkCullingRuntimeEnabled(policy = resolveChunkPolicy(world, mode)) {
    return Boolean(policy?.enabled === true && policy?.source !== "none");
  }

  function registerChunkRuntimeEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    chunkRuntimeEntries.push(entry);
    chunkRuntimeRegistryVersion += 1;
    return entry;
  }

  function resolveChunkRuntimeEntryPosition(entry) {
    if (!entry) return null;
    if (typeof entry.getPosition === "function") {
      const value = entry.getPosition();
      if (Number.isFinite(Number(value?.x)) && Number.isFinite(Number(value?.z))) {
        return { x: Number(value.x), z: Number(value.z) };
      }
    }
    if (Number.isFinite(Number(entry.x)) && Number.isFinite(Number(entry.z))) {
      return { x: Number(entry.x), z: Number(entry.z) };
    }
    if (entry.position && Number.isFinite(Number(entry.position.x)) && Number.isFinite(Number(entry.position.z))) {
      return { x: Number(entry.position.x), z: Number(entry.position.z) };
    }
    if (entry.object?.position && Number.isFinite(Number(entry.object.position.x)) && Number.isFinite(Number(entry.object.position.z))) {
      return { x: Number(entry.object.position.x), z: Number(entry.object.position.z) };
    }
    if (entry.interactable && Number.isFinite(Number(entry.interactable.x)) && Number.isFinite(Number(entry.interactable.z))) {
      return { x: Number(entry.interactable.x), z: Number(entry.interactable.z) };
    }
    if (entry.solid && Number.isFinite(Number(entry.solid.x)) && Number.isFinite(Number(entry.solid.z))) {
      return { x: Number(entry.solid.x), z: Number(entry.solid.z) };
    }
    return null;
  }

  function resolveChunkRuntimeEntryChunkKey(entry, policy) {
    if (!entry) return null;
    if (typeof entry.chunkKey === "string" && entry.chunkKey.includes(",")) {
      const coord = chunkCoordFromKey(entry.chunkKey);
      return coord ? { key: chunkKey(coord), coord: coord } : null;
    }
    const position = resolveChunkRuntimeEntryPosition(entry);
    if (!position || !policy) return null;
    const coord = chunkCoordForPosition(position.x, position.z, policy);
    return { key: chunkKey(coord), coord: coord };
  }

  function resolveSelectedKeepLoadedChunkKeys(policy) {
    if (mode !== "editor" || policy?.keepSelectedChunkLoaded !== true) return [];
    const root = selectedObjectRoot();
    if (!root) return [];
    const chunkInfo = resolveChunkRuntimeEntryChunkKey({ object: root }, policy);
    return chunkInfo?.key ? [chunkInfo.key] : [];
  }

  function buildContentBlueprintIndex(worldData, runtimeMode = mode) {
    const policy = resolveChunkPolicy(worldData, runtimeMode);
    const index = createEmptyContentBlueprintIndex();
    const addAlwaysLoaded = function (type, value) {
      if (!value) return;
      index.alwaysLoaded.push({
        type: type,
        id: value.id || null,
        value: value
      });
    };
    addAlwaysLoaded("world", worldData?.world || null);
    addAlwaysLoaded("ground", worldData?.ground || null);
    addAlwaysLoaded("camera", worldData?.camera || null);
    addAlwaysLoaded("player", worldData?.player || null);
    addAlwaysLoaded("spawn", worldData?.spawn || null);
    for (const light of worldData?.lights || []) addAlwaysLoaded("light", light);
    for (const entity of worldData?.entities || []) {
      const position = entity?.transform?.position || {};
      const chunkKeyValue = chunkKeyFromWorldPosition(position.x, position.z, policy);
      const clone = Object.assign({}, entity, {
        chunkKey: chunkKeyValue,
        chunkKeys: chunkKeyValue ? [chunkKeyValue] : []
      });
      if (entity?.type === "scatter" || entity?.kind === "scatter") {
        if (chunkKeyValue) {
          ensureChunkBucket(index.scatterByChunkKey, chunkKeyValue).push(clone);
        } else {
          index.alwaysLoaded.push({
            type: "scatter",
            id: clone.id || clone.nodeId || null,
            value: clone
          });
        }
        continue;
      }
      if (chunkKeyValue) {
        ensureChunkBucket(index.entitiesByChunkKey, chunkKeyValue).push(clone);
      } else {
        index.alwaysLoaded.push({
          type: "entity",
          id: clone.id || clone.nodeId || null,
          value: clone
        });
      }
      if (entity?.solid && entity?.walkable !== true) {
        const solidClone = {
          id: String(entity.id || entity.nodeId || "entity") + "::solid",
          entityId: entity.id || entity.nodeId || null,
          x: num(entity?.transform?.position?.x, 0),
          z: num(entity?.transform?.position?.z, 0),
          radius: num(entity?.collisionRadius, 1),
          enabled: true,
          runtimeManaged: true,
          chunkKey: chunkKeyValue,
          chunkKeys: chunkKeyValue ? [chunkKeyValue] : []
        };
        if (chunkKeyValue) ensureChunkBucket(index.solidsByChunkKey, chunkKeyValue).push(solidClone);
        else index.alwaysLoaded.push({
          type: "solid",
          id: solidClone.id,
          value: solidClone
        });
      }
    }
    for (const inter of worldData?.interactables || []) {
      const chunkKeyValue = chunkKeyFromWorldPosition(inter?.position?.x, inter?.position?.z, policy);
      const clone = Object.assign({}, inter, {
        chunkKey: chunkKeyValue,
        chunkKeys: chunkKeyValue ? [chunkKeyValue] : []
      });
      if (chunkKeyValue) {
        ensureChunkBucket(index.interactablesByChunkKey, chunkKeyValue).push(clone);
      } else {
        index.alwaysLoaded.push({
          type: "interactable",
          id: clone.id || null,
          value: clone
        });
      }
    }
    index.blueprintEntityCount = countEntriesForChunkMap(index.entitiesByChunkKey);
    index.blueprintScatterInstanceCount = countEntriesForChunkMap(index.scatterByChunkKey);
    index.blueprintInteractableCount = countEntriesForChunkMap(index.interactablesByChunkKey);
    index.blueprintSolidCount = countEntriesForChunkMap(index.solidsByChunkKey);
    index.blueprintWorldItemCount = countPublishedWorldItems(worldData);
    index.version = worldBuildGeneration;
    index.lastBuildReason = "setWorld";
    return index;
  }

  function registerResidentChunkRecord(kind, chunkKey, entryKey, entry) {
    const key = String(chunkKey || "").trim();
    const id = String(entryKey || "").trim();
    if (!key || !id || !entry) return null;
    const target = kind === "scatter"
      ? residentContentState.scatterBatchesByKey
      : kind === "interactable"
        ? residentContentState.interactableObjectsByKey
        : kind === "solid"
          ? residentContentState.solidEntriesByKey
          : residentContentState.entityObjectsByKey;
    const bucket = ensureResidentChunkBucket(target, key);
    if (!bucket) return null;
    bucket.set(id, entry);
    return entry;
  }

  function unregisterResidentChunkRecord(kind, chunkKey, entryKey) {
    const key = String(chunkKey || "").trim();
    const id = String(entryKey || "").trim();
    if (!key || !id) return false;
    const target = kind === "scatter"
      ? residentContentState.scatterBatchesByKey
      : kind === "interactable"
        ? residentContentState.interactableObjectsByKey
        : kind === "solid"
          ? residentContentState.solidEntriesByKey
          : residentContentState.entityObjectsByKey;
    const bucket = target.get(key);
    if (!bucket) return false;
    const removed = bucket.delete(id);
    if (!bucket.size) target.delete(key);
    return removed;
  }

  function removeRuntimeEntryById(entryId) {
    const id = String(entryId || "").trim();
    if (!id) return false;
    for (let index = chunkRuntimeEntries.length - 1; index >= 0; index -= 1) {
      if (String(chunkRuntimeEntries[index]?.id || "") !== id) continue;
      chunkRuntimeEntries.splice(index, 1);
      chunkRuntimeRegistryVersion += 1;
      return true;
    }
    return false;
  }

  function markRuntimeObjectAlive(object, alive) {
    if (!object) return;
    const nextAlive = alive !== false;
    object.traverse(function (child) {
      child.userData = child.userData || {};
      child.userData.runtimeAlive = nextAlive;
    });
  }

  function teardownResidentRuntimeEntry(entry, options = {}) {
    if (!entry) return { objects: 0, meshes: 0 };
    const object = entry.object || entry.root || null;
    const counts = object ? countObjectTree(object) : { objects: 0, meshes: 0 };
    const entryId = String(entry.id || "").trim();
    const chunkKeyValue = String(entry.chunkKey || "").trim();
    if (entry.type === "entity" && entryId) unregisterResidentChunkRecord("entity", chunkKeyValue, entryId);
    else if (entry.type === "interactable" && entryId) unregisterResidentChunkRecord("interactable", chunkKeyValue, entryId);
    else if (entry.type === "scatter" && entryId) unregisterResidentChunkRecord("scatter", chunkKeyValue, entryId);
    else if (entry.type === "solid" && entryId) unregisterResidentChunkRecord("solid", chunkKeyValue, entryId);
    removeRuntimeEntryById(entryId);
    if (entry.type === "entity" && entryId && entityRoots.get(entryId) === object) entityRoots.delete(entryId);
    if (entry.type === "scatter" && object?.userData?.entityId && entityRoots.get(object.userData.entityId) === object) {
      entityRoots.delete(object.userData.entityId);
    }
    if (entry.type === "interactable" && entryId) {
      const interactableIndex = interactables.findIndex(function (value) { return value && value.id === entryId; });
      if (interactableIndex >= 0) interactables.splice(interactableIndex, 1);
    }
    if (entry.type === "solid" && entry.solid) {
      const solidIndex = solids.indexOf(entry.solid);
      if (solidIndex >= 0) solids.splice(solidIndex, 1);
    }
    if (object) {
      markRuntimeObjectAlive(object, false);
      if (object.parent) object.parent.remove(object);
      const mixerRecord = animationMixers.get(object);
      if (mixerRecord) {
        try { mixerRecord.mixer.stopAllAction(); } catch {}
        try { mixerRecord.mixer.uncacheRoot(mixerRecord.root); } catch {}
        animationMixers.delete(object);
      }
      const disposeResources = options.disposeResources !== false;
      if (disposeResources) {
        disposeObject(object, { disposeTextures: true });
      }
    }
    runtimeStats.sceneObjects = Math.max(0, runtimeStats.sceneObjects - counts.objects);
    runtimeStats.meshes = Math.max(0, runtimeStats.meshes - counts.meshes);
    return counts;
  }

  function summarizeResidentBlueprintCounts(chunkKeys) {
    const summary = {
      entityCount: 0,
      scatterCount: 0,
      interactableCount: 0,
      solidCount: 0
    };
    for (const key of Array.isArray(chunkKeys) ? chunkKeys : []) {
      summary.entityCount += contentBlueprintIndex.entitiesByChunkKey.get(key)?.length || 0;
      summary.scatterCount += contentBlueprintIndex.scatterByChunkKey.get(key)?.length || 0;
      summary.interactableCount += contentBlueprintIndex.interactablesByChunkKey.get(key)?.length || 0;
      summary.solidCount += contentBlueprintIndex.solidsByChunkKey.get(key)?.length || 0;
    }
    return summary;
  }

  function estimateResidentChunkObjectCost(chunkKey, policy) {
    const entityGroups = new Map();
    const interactableGroups = new Map();
    const scatterGroups = new Map();
    const entityBlueprints = contentBlueprintIndex.entitiesByChunkKey.get(chunkKey) || [];
    const interactableBlueprints = contentBlueprintIndex.interactablesByChunkKey.get(chunkKey) || [];
    const scatterBlueprints = contentBlueprintIndex.scatterByChunkKey.get(chunkKey) || [];
    let cost = 0;
    const entityBatchingAllowed = shouldBatchStaticProps();
    const scatterBatchingAllowed = shouldBatchScatterProps();
    for (const entity of entityBlueprints) {
      const assetId = entity?.modelAssetId || "";
      if (entityBatchingAllowed && canBatchStaticProp(world, assetId)) {
        let bucket = entityGroups.get(assetId);
        if (!bucket) {
          bucket = [];
          entityGroups.set(assetId, bucket);
        }
        bucket.push(entity);
      } else {
        cost += 1;
      }
    }
    for (const bucket of entityGroups.values()) {
      cost += bucket.length >= 2 ? 1 : 2;
    }
    for (const inter of interactableBlueprints) {
      const assetId = inter?.modelAssetId || "";
      if (entityBatchingAllowed && canBatchStaticProp(world, assetId)) {
        let bucket = interactableGroups.get(assetId);
        if (!bucket) {
          bucket = [];
          interactableGroups.set(assetId, bucket);
        }
        bucket.push(inter);
      } else {
        cost += 1;
      }
    }
    for (const bucket of interactableGroups.values()) {
      cost += bucket.length >= 2 ? 1 : 1;
    }
    for (const scatter of scatterBlueprints) {
      const assetId = scatter?.modelAssetId || scatter?.sourceAssetId || "";
      if (scatterBatchingAllowed && canBatchStaticProp(world, assetId)) {
        let bucket = scatterGroups.get(assetId);
        if (!bucket) {
          bucket = [];
          scatterGroups.set(assetId, bucket);
        }
        bucket.push(scatter);
      } else {
        cost += 1;
      }
    }
    for (const bucket of scatterGroups.values()) {
      cost += bucket.length ? 1 : 0;
    }
    return cost;
  }

  function buildResidentChunkContentForChunk(chunkKey, policy, reason) {
    const chunkEntities = contentBlueprintIndex.entitiesByChunkKey.get(chunkKey) || [];
    const chunkInteractables = contentBlueprintIndex.interactablesByChunkKey.get(chunkKey) || [];
    const chunkScatter = contentBlueprintIndex.scatterByChunkKey.get(chunkKey) || [];
    const entityBatchGroups = new Map();
    const interactableBatchGroups = new Map();
    const scatterBatchGroups = new Map();
    const shadowOptions = scatterShadowOptions();
    const modelPolicy = { chunkKey: chunkKey, residentStreaming: true };
    for (const entity of chunkEntities) {
      const assetId = entity?.modelAssetId || "";
      const batchable = shouldBatchStaticProps() && canBatchStaticProp(world, assetId);
      if (batchable) {
        addEntity(world, entity, Object.assign({ skipVisual: true }, modelShadowOptions(world, assetId), modelPolicy));
        let bucket = entityBatchGroups.get(assetId);
        if (!bucket) {
          bucket = [];
          entityBatchGroups.set(assetId, bucket);
        }
        bucket.push({
          kind: "entity",
          entity: entity,
          transform: entity.transform
        });
      } else {
        addEntity(world, entity, Object.assign({}, modelShadowOptions(world, assetId), modelPolicy));
      }
    }
    for (const inter of chunkInteractables) {
      const assetId = inter?.modelAssetId || "";
      const batchable = shouldBatchStaticProps() && canBatchStaticProp(world, assetId);
      if (batchable) {
        addInteractable(world, inter, Object.assign({ skipVisual: true }, modelShadowOptions(world, assetId), modelPolicy));
        let bucket = interactableBatchGroups.get(assetId);
        if (!bucket) {
          bucket = [];
          interactableBatchGroups.set(assetId, bucket);
        }
        bucket.push({
          kind: "interactable",
          inter: inter,
          transform: {
            position: {
              x: num(inter.position?.x, 0),
              y: num(world?.ground?.y, 0),
              z: num(inter.position?.z, 0)
            },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 }
          }
        });
      } else {
        addInteractable(world, inter, Object.assign({}, modelShadowOptions(world, assetId), modelPolicy));
      }
    }
    for (const scatter of chunkScatter) {
      const assetId = scatter?.modelAssetId || scatter?.sourceAssetId || "";
      if (!assetId) continue;
      const nodeId = scatter?.nodeId || scatter?.scatterId || scatter?.id || "";
      const groupKey = nodeId + "::" + assetId;
      let bucket = scatterBatchGroups.get(groupKey);
      if (!bucket) {
        bucket = { nodeId: nodeId, assetId: assetId, instances: [] };
        scatterBatchGroups.set(groupKey, bucket);
      }
      bucket.instances.push(scatter);
    }
    for (const [assetId, descriptors] of entityBatchGroups.entries()) {
      if (!addStaticPropBatch(world, assetId, descriptors, {
        residentStreaming: true,
        chunkKey: chunkKey,
        chunkKind: "entity"
      })) {
        for (const descriptor of descriptors) {
          addEntity(world, descriptor.entity, Object.assign({ skipCollision: true }, modelShadowOptions(world, assetId), modelPolicy));
        }
      }
    }
    for (const [assetId, descriptors] of interactableBatchGroups.entries()) {
      if (!addStaticPropBatch(world, assetId, descriptors, {
        residentStreaming: true,
        chunkKey: chunkKey,
        chunkKind: "interactable"
      })) {
        for (const descriptor of descriptors) {
          addInteractable(world, descriptor.inter, Object.assign({ skipRegistration: true }, modelShadowOptions(world, assetId), modelPolicy));
        }
      }
    }
    for (const bucket of scatterBatchGroups.values()) {
      const assetId = bucket.assetId;
      const instances = bucket.instances;
      const root = new THREE.Group();
      const rootKey = String(chunkKey) + "::scatter::" + String(bucket.nodeId || "node") + "::" + String(assetId || "asset");
      root.name = rootKey;
      root.userData.chunkRuntimeType = "scatter";
      root.userData.runtimeAlive = true;
      root.userData.transformable = false;
      root.userData.snapToGround = false;
      root.userData.chunkKey = chunkKey;
      if (bucket.nodeId) root.userData.entityId = bucket.nodeId;
      content.add(root);
      runtimeStats.sceneObjects += 1;
      if (bucket.nodeId) entityRoots.set(bucket.nodeId, root);
      registerChunkRuntimeEntry({
        id: rootKey,
        type: "scatter",
        object: root,
        chunkKey: chunkKey,
        chunkKeys: [chunkKey],
        hasVisual: true
      });
      registerResidentChunkRecord("scatter", chunkKey, rootKey, {
        id: rootKey,
        type: "scatter",
        object: root,
        chunkKey: chunkKey,
        chunkKeys: [chunkKey]
      });
      loadScatterInstancesInto(root, assetId, instances, world, {
        allowBatch: shouldBatchScatterProps(),
        chunkPolicy: policy,
        castShadow: shadowOptions.castShadow,
        receiveShadow: shadowOptions.receiveShadow,
        residentStreaming: true,
        chunkKey: chunkKey,
        fallbackCloneCap: 8
      });
    }
    return {
      chunkKey: chunkKey,
      reason: reason || "resident-build"
    };
  }

  function syncResidentChunkContent(nextChunkState, reason = "runtime-sync") {
    const startedAt = performance.now();
    const policy = resolveChunkPolicy(world, mode);
    const enabled = Boolean(policy?.enabled === true && policy?.source !== "none");
    const nextResidentState = residentContentState;
    nextResidentState.mode = mode;
    nextResidentState.policySource = policy.source || "none";
    nextResidentState.eagerBuildDisabled = enabled;
    nextResidentState.residentEntityBudget = Math.max(0, num(policy.residentEntityBudget, 200));
    nextResidentState.residentObjectBudget = Math.max(0, num(policy.residentObjectBudget, 300));
    nextResidentState.residentScatterInstanceBudget = Math.max(0, num(policy.residentScatterInstanceBudget, 500));
    nextResidentState.residentChunkBuildBudgetPerFrame = Math.max(1, num(policy.residentChunkBuildBudgetPerFrame, 2));
    if (!enabled) {
      nextResidentState.residentChunkKeys = new Set();
      nextResidentState.desiredChunkKeys = [];
      nextResidentState.enteringChunkKeys = [];
      nextResidentState.leavingChunkKeys = [];
      nextResidentState.pendingChunkKeys = [];
      nextResidentState.loadedEntityCount = 0;
      nextResidentState.loadedScatterInstanceCount = 0;
      nextResidentState.loadedScatterBatchCount = 0;
      nextResidentState.loadedInteractableCount = 0;
      nextResidentState.loadedSolidCount = 0;
      nextResidentState.residentObject3DCount = runtimeStats.sceneObjects;
      nextResidentState.residentWorldItemCount = 0;
      nextResidentState.budgetClipped = false;
      nextResidentState.lastSyncReason = reason || "disabled";
      nextResidentState.lastSyncMs = round(performance.now() - startedAt);
      return nextResidentState;
    }
    const desiredChunkKeys = Array.isArray(nextChunkState?.loadedChunkKeys) ? sortChunkKeys(nextChunkState.loadedChunkKeys) : [];
    const desiredSet = new Set(desiredChunkKeys);
    const activeChunkKeys = Array.isArray(nextChunkState?.activeChunkKeys) ? nextChunkState.activeChunkKeys : [];
    const visibleChunkKeys = Array.isArray(nextChunkState?.visibleChunkKeys) ? nextChunkState.visibleChunkKeys : [];
    const forwardChunkKeys = Array.isArray(nextChunkState?.forwardChunkKeys) ? nextChunkState.forwardChunkKeys : [];
    const preloadChunkKeys = Array.isArray(nextChunkState?.preloadChunkKeys) ? nextChunkState.preloadChunkKeys : [];
    const unloadSafeChunkKeys = Array.isArray(nextChunkState?.unloadSafeChunkKeys) && nextChunkState.unloadSafeChunkKeys.length
      ? nextChunkState.unloadSafeChunkKeys
      : desiredChunkKeys;
    const unloadSafeSet = new Set(unloadSafeChunkKeys);
    const centerChunk = nextChunkState?.centerChunk || null;
    const residentSet = nextResidentState.residentChunkKeys;
    const leavingChunkKeys = [];
    for (const key of Array.from(residentSet)) {
      if (unloadSafeSet.has(key)) continue;
      const chunkRecord = chunkResidencyState.recordsByKey.get(key) || null;
      if (chunkRecord && chunkRecord.state !== "unloaded") continue;
      leavingChunkKeys.push(key);
    }
    for (const chunkKey of leavingChunkKeys) {
      const buckets = [
        ["entity", residentContentState.entityObjectsByKey.get(chunkKey)],
        ["scatter", residentContentState.scatterBatchesByKey.get(chunkKey)],
        ["interactable", residentContentState.interactableObjectsByKey.get(chunkKey)],
        ["solid", residentContentState.solidEntriesByKey.get(chunkKey)]
      ];
      for (const [kind, bucket] of buckets) {
        if (!(bucket instanceof Map)) continue;
        for (const entry of Array.from(bucket.values())) teardownResidentRuntimeEntry(entry, { disposeResources: true });
        if (kind === "entity") residentContentState.entityObjectsByKey.delete(chunkKey);
        else if (kind === "scatter") residentContentState.scatterBatchesByKey.delete(chunkKey);
        else if (kind === "interactable") residentContentState.interactableObjectsByKey.delete(chunkKey);
        else if (kind === "solid") residentContentState.solidEntriesByKey.delete(chunkKey);
      }
      residentSet.delete(chunkKey);
      objectResidencyState.disposedChunkGroupCount += 1;
      chunkResidencyState.lastChunkToggleReason = reason || "chunk-unload";
      chunkResidencyState.lastChunkToggleTime = startedAt;
    }
    nextResidentState.leavingChunkKeys = leavingChunkKeys.slice();
    nextResidentState.desiredChunkKeys = desiredChunkKeys.slice();
    const existingPendingKeys = Array.isArray(nextResidentState.pendingChunkKeys)
      ? nextResidentState.pendingChunkKeys.filter(function (key) { return desiredSet.has(key) && !residentSet.has(key); })
      : [];
    const pendingSet = new Set(existingPendingKeys);
    for (const key of desiredChunkKeys) {
      if (!residentSet.has(key)) pendingSet.add(key);
    }
    const orderedPending = prioritizeResidentChunkBuildQueue({
      centerChunk: centerChunk,
      residentChunkKeys: residentSet,
      desiredResidentChunkKeys: Array.from(pendingSet),
      activeChunkKeys: activeChunkKeys,
      visibleChunkKeys: visibleChunkKeys,
      forwardChunkKeys: forwardChunkKeys,
      preloadChunkKeys: preloadChunkKeys
    });
    nextResidentState.enteringChunkKeys = orderedPending.slice();
    const mustBuildSet = new Set(activeChunkKeys.concat(visibleChunkKeys));
    const builtChunkKeys = [];
    const remainingQueue = [];
    let buildBudget = nextResidentState.residentChunkBuildBudgetPerFrame;
    let stopBudgetedBuilds = false;
    const attemptBuild = function (chunkKey) {
      const chunkCounts = summarizeResidentBlueprintCounts([chunkKey]);
      const projectedEntityCount = nextResidentState.loadedEntityCount + chunkCounts.entityCount;
      const projectedScatterCount = nextResidentState.loadedScatterInstanceCount + chunkCounts.scatterCount;
      const projectedInteractableCount = nextResidentState.loadedInteractableCount + chunkCounts.interactableCount;
      const projectedSolidCount = nextResidentState.loadedSolidCount + chunkCounts.solidCount;
      const overBudget = projectedEntityCount > nextResidentState.residentEntityBudget
        || projectedScatterCount > nextResidentState.residentScatterInstanceBudget;
      residentSet.add(chunkKey);
      buildResidentChunkContentForChunk(chunkKey, policy, reason);
      builtChunkKeys.push(chunkKey);
      objectResidencyState.rebuiltChunkGroupCount += 1;
      chunkResidencyState.lastChunkToggleReason = reason || "chunk-build";
      chunkResidencyState.lastChunkToggleTime = startedAt;
      nextResidentState.loadedEntityCount = projectedEntityCount;
      nextResidentState.loadedScatterInstanceCount = projectedScatterCount;
      nextResidentState.loadedInteractableCount = projectedInteractableCount;
      nextResidentState.loadedSolidCount = projectedSolidCount;
      return overBudget;
    };
    for (const chunkKey of orderedPending) {
      if (residentSet.has(chunkKey)) continue;
      if (mustBuildSet.has(chunkKey)) {
        // Active/visible chunks are never left pending: the player or camera is looking at them
        // right now, so they build immediately even if that means briefly exceeding the soft
        // resident budget. Only the exceedance gets flagged; the chunk still gets built.
        if (attemptBuild(chunkKey)) nextResidentState.budgetClipped = true;
        continue;
      }
      if (stopBudgetedBuilds || buildBudget <= 0) {
        remainingQueue.push(chunkKey);
        continue;
      }
      const chunkCounts = summarizeResidentBlueprintCounts([chunkKey]);
      const wouldExceedBudget = nextResidentState.loadedEntityCount + chunkCounts.entityCount > nextResidentState.residentEntityBudget
        || nextResidentState.loadedScatterInstanceCount + chunkCounts.scatterCount > nextResidentState.residentScatterInstanceBudget;
      if (wouldExceedBudget) {
        nextResidentState.budgetClipped = true;
        stopBudgetedBuilds = true;
        remainingQueue.push(chunkKey);
        continue;
      }
      attemptBuild(chunkKey);
      buildBudget -= 1;
    }
    nextResidentState.pendingChunkKeys = remainingQueue;
    nextResidentState.budgetClipped = Boolean(nextResidentState.pendingChunkKeys.length);
    const loadedChunkKeys = Array.from(residentSet);
    const residentCounts = summarizeResidentBlueprintCounts(loadedChunkKeys);
    nextResidentState.loadedEntityCount = residentCounts.entityCount;
    nextResidentState.loadedScatterInstanceCount = residentCounts.scatterCount;
    nextResidentState.loadedInteractableCount = residentCounts.interactableCount;
    nextResidentState.loadedSolidCount = residentCounts.solidCount;
    nextResidentState.loadedScatterBatchCount = countResidentEntriesForChunkMap(nextResidentState.scatterBatchesByKey);
    nextResidentState.residentObject3DCount = runtimeStats.sceneObjects;
    nextResidentState.residentWorldItemCount = residentCounts.entityCount + residentCounts.scatterCount + residentCounts.interactableCount + residentCounts.solidCount + (Array.isArray(contentBlueprintIndex.alwaysLoaded) ? contentBlueprintIndex.alwaysLoaded.length : 0);
    nextResidentState.blueprintEntityCount = contentBlueprintIndex.blueprintEntityCount;
    nextResidentState.blueprintScatterInstanceCount = contentBlueprintIndex.blueprintScatterInstanceCount;
    nextResidentState.blueprintInteractableCount = contentBlueprintIndex.blueprintInteractableCount;
    nextResidentState.blueprintSolidCount = contentBlueprintIndex.blueprintSolidCount;
    runtimeStats.entities = residentCounts.entityCount;
    runtimeStats.scatterInstances = residentCounts.scatterCount;
    runtimeStats.interactables = residentCounts.interactableCount;
    nextResidentState.lastSyncReason = reason || "resident-sync";
    nextResidentState.lastSyncMs = round(performance.now() - startedAt);
    nextResidentState.lastDesiredSignature = loadedChunkKeys.join("|");
    nextResidentState.pendingLoadCount = nextResidentState.pendingChunkKeys.length;
    return nextResidentState;
  }

  /**
   * The debug/culling window is memoized by chunk-center signature (see syncChunkDebugState) so
   * that idle frames stay cheap. That memoization used to also skip syncResidentChunkContent
   * entirely, which meant a resident build that got clipped by residentChunkBuildBudgetPerFrame
   * would stay pending forever until the signature happened to change again (e.g. a full chunk
   * crossing) - the root cause of content popping in only long after it should have been resident,
   * and of resident content staying empty after setWorld when nothing moves right after load.
   * This keeps draining the budgeted queue every frame using the last known coverage, without
   * redoing the expensive culling/overlay recompute.
   */
  function drainPendingResidentChunkBuilds(reason) {
    const policy = resolveChunkPolicy(world, mode);
    if (!isChunkCullingRuntimeEnabled(policy)) return;
    if (!residentContentState.pendingChunkKeys.length) return;
    const pseudoWindowState = {
      centerChunk: chunkRuntimeState.centerChunk,
      loadedChunkKeys: chunkRuntimeState.loadedChunkKeys,
      activeChunkKeys: chunkRuntimeState.activeChunkKeys,
      preloadChunkKeys: chunkRuntimeState.preloadChunkKeys,
      visibleChunkKeys: chunkRuntimeState.visibleChunkKeys,
      forwardChunkKeys: chunkRuntimeState.forwardChunkKeys,
      unloadSafeChunkKeys: chunkRuntimeState.unloadSafeChunkKeys
    };
    syncResidentChunkContent(pseudoWindowState, reason || "resident-pending-drain");
    if (chunkDebugStateCache) {
      chunkDebugStateCache.contentStreaming = buildContentStreamingDebugState();
    }
  }

  /**
   * Forces active/visible resident content to exist for the current view right after setWorld
   * (fresh load, Save Draft/Save To Game reload, /game/ version reload, runtime recreate) so the
   * first rendered frame is never an empty world while the budgeted queue catches up in the
   * background. syncResidentChunkContent already force-builds active/visible chunks unconditionally,
   * so this mostly records what happened for debugState().world.chunkLoading.residentBootstrap;
   * it also runs one more drain pass in case setWorld ran before any window existed yet.
   */
  function bootstrapResidentContentForCurrentView(reason) {
    const policy = resolveChunkPolicy(world, mode);
    const enabled = isChunkCullingRuntimeEnabled(policy);
    if (enabled) drainPendingResidentChunkBuilds(reason || "bootstrap");
    const activeKeys = Array.isArray(chunkRuntimeState.activeChunkKeys) ? chunkRuntimeState.activeChunkKeys : [];
    const visibleKeys = Array.isArray(chunkRuntimeState.visibleChunkKeys) ? chunkRuntimeState.visibleChunkKeys : [];
    const residentKeys = residentContentState.residentChunkKeys;
    const requiredKeys = new Set(activeKeys.concat(visibleKeys));
    let activeBuiltImmediately = 0;
    for (const key of activeKeys) if (residentKeys.has(key)) activeBuiltImmediately += 1;
    let visibleBuiltImmediately = 0;
    for (const key of visibleKeys) if (residentKeys.has(key)) visibleBuiltImmediately += 1;
    let preloadBuiltImmediately = 0;
    for (const key of residentKeys) if (!requiredKeys.has(key)) preloadBuiltImmediately += 1;
    let missingRequired = 0;
    for (const key of requiredKeys) if (!residentKeys.has(key)) missingRequired += 1;
    residentBootstrapState = {
      lastReason: reason || "bootstrap",
      worldGeneration: worldBuildGeneration,
      activeBuiltImmediately: activeBuiltImmediately,
      visibleBuiltImmediately: visibleBuiltImmediately,
      preloadBuiltImmediately: preloadBuiltImmediately,
      pendingAfterBootstrap: residentContentState.pendingChunkKeys.length,
      emptyScenePrevented: !enabled || requiredKeys.size === 0 || missingRequired === 0
    };
    if (chunkDebugStateCache) {
      chunkDebugStateCache.residentBootstrap = Object.assign({}, residentBootstrapState);
      chunkDebugStateCache.contentStreaming = buildContentStreamingDebugState();
    }
    return residentBootstrapState;
  }

  function buildContentStreamingDebugState() {
    const policy = resolveChunkPolicy(world, mode);
    const residentChunkKeys = Array.from(residentContentState.residentChunkKeys || []);
    const chunkSizeWarning = policy.chunkWorldWidth < 25 || policy.chunkWorldDepth < 25
      ? "Game Chunk Loading chunk size is very small; this can cause frequent chunk switching. Use 25-50 for laptop baseline unless intentionally testing micro chunks."
      : null;
    return {
      enabled: isChunkCullingRuntimeEnabled(policy),
      mode: mode,
      policySource: policy.source || "none",
      blueprintEntities: contentBlueprintIndex.blueprintEntityCount || 0,
      blueprintScatterInstances: contentBlueprintIndex.blueprintScatterInstanceCount || 0,
      blueprintInteractables: contentBlueprintIndex.blueprintInteractableCount || 0,
      blueprintWorldItems: contentBlueprintIndex.blueprintWorldItemCount || 0,
      residentChunks: residentChunkKeys.length,
      residentChunkKeys: residentChunkKeys,
      residentEntities: residentContentState.loadedEntityCount || 0,
      residentScatterBatches: residentContentState.loadedScatterBatchCount || 0,
      residentScatterInstances: residentContentState.loadedScatterInstanceCount || 0,
      residentInteractables: residentContentState.loadedInteractableCount || 0,
      residentSolids: residentContentState.loadedSolidCount || 0,
      residentObject3D: residentContentState.residentObject3DCount || runtimeStats.sceneObjects || 0,
      enteringChunkKeys: Array.isArray(residentContentState.enteringChunkKeys) ? residentContentState.enteringChunkKeys.slice() : [],
      leavingChunkKeys: Array.isArray(residentContentState.leavingChunkKeys) ? residentContentState.leavingChunkKeys.slice() : [],
      desiredChunkKeys: Array.isArray(residentContentState.desiredChunkKeys) ? residentContentState.desiredChunkKeys.slice() : [],
      lastSyncReason: residentContentState.lastSyncReason || "init",
      lastSyncMs: residentContentState.lastSyncMs || 0,
      eagerBuildDisabled: Boolean(residentContentState.eagerBuildDisabled),
      budgetClipped: Boolean(residentContentState.budgetClipped),
      residentEntityBudget: residentContentState.residentEntityBudget || 0,
      residentObjectBudget: residentContentState.residentObjectBudget || 0,
      residentScatterInstanceBudget: residentContentState.residentScatterInstanceBudget || 0,
      residentChunkBuildBudgetPerFrame: residentContentState.residentChunkBuildBudgetPerFrame || 0,
      residentWorldItems: residentContentState.residentWorldItemCount || 0,
      renderResidentChunks: Array.isArray(chunkRuntimeState.renderChunkKeys) ? chunkRuntimeState.renderChunkKeys.length : 0,
      renderResidentChunkKeys: Array.isArray(chunkRuntimeState.renderChunkKeys) ? chunkRuntimeState.renderChunkKeys.slice() : [],
      shadowResidentChunks: Array.isArray(chunkRuntimeState.shadowResidentChunkKeys) ? chunkRuntimeState.shadowResidentChunkKeys.length : 0,
      shadowResidentChunkKeys: Array.isArray(chunkRuntimeState.shadowResidentChunkKeys) ? chunkRuntimeState.shadowResidentChunkKeys.slice() : [],
      collisionResidentChunks: Array.isArray(chunkRuntimeState.collisionResidentChunkKeys) ? chunkRuntimeState.collisionResidentChunkKeys.length : 0,
      collisionResidentChunkKeys: Array.isArray(chunkRuntimeState.collisionResidentChunkKeys) ? chunkRuntimeState.collisionResidentChunkKeys.slice() : [],
      shadowWindowChunkKeys: Array.isArray(chunkRuntimeState.shadowWindowChunkKeys) ? chunkRuntimeState.shadowWindowChunkKeys.slice() : [],
      chunkWorldWidth: policy.chunkWorldWidth,
      chunkWorldDepth: policy.chunkWorldDepth,
      chunkSizeWarning: chunkSizeWarning
    };
  }

  function applyChunkCullingResult(cullingResult) {
    activeSolids.length = 0;
    let hudRefreshNeeded = false;
    for (let index = 0; index < chunkRuntimeEntries.length; index += 1) {
      const entry = chunkRuntimeEntries[index];
      const item = cullingResult.items[index];
      if (!entry || !item) continue;
      const isTerrainVisual = entry.type === "terrainGround" || entry.type === "terrainLayer" || entry.type === "terrainSurface";
      if (isTerrainVisual && entry.terrainStreamable === true && typeof entry.buildObject === "function") {
        if (item.loaded === false) {
          if (entry.object) releaseTerrainResidentObject(entry, "chunk-unload");
        } else {
          ensureTerrainResidentEntry(entry);
          if (entry.object && item.visible !== null) {
            entry.object.visible = item.visible !== false;
            entry.object.userData.chunkCulled = item.visible === false;
          }
        }
      } else if (entry.object && entry.hasVisual !== false && item.visible !== null) {
        entry.object.visible = item.visible !== false;
        entry.object.userData.chunkCulled = item.visible === false;
        const shouldShadowProxy = item.loaded !== false
          && item.renderResident === false
          && (entry.type === "entity"
            || entry.type === "scatter"
            || entry.type === "staticProp"
            || entry.object?.userData?.batchKind === "staticProp"
            || entry.object?.userData?.batchKind === "scatter"
            || entry.object?.userData?.scatterInstance === true
            || entry.object?.userData?.chunkRuntimeType === "entity"
            || entry.object?.userData?.chunkRuntimeType === "interactable"
            || entry.object?.userData?.chunkRuntimeType === "scatter");
        if (shouldShadowProxy) {
          setShadowProxyState(entry.object, true, { kind: entry.type || entry.object?.userData?.batchKind || "shadowProxy" });
        } else {
          setShadowProxyState(entry.object, false, { kind: entry.type || entry.object?.userData?.batchKind || "shadowProxy" });
        }
        entry.object.userData.objectResidency = {
          visible: item.visible === true,
          renderResident: item.renderResident === true,
          loaded: item.loaded === true,
          active: item.active !== false,
          heldVisible: item.heldVisible === true,
          pendingUnload: item.pendingUnload === true,
          unloaded: item.unloaded === true,
          lastVisibilityChangeReason: item.lastVisibilityChangeReason || "init",
          lastVisibilityChangeTime: Number(item.lastVisibilityChangeTime || 0) || 0,
          visibilityToggleCount: Number(item.visibilityToggleCount || 0) || 0,
          preventedVisibilityToggleCount: Number(item.preventedVisibilityToggleCount || 0) || 0
        };
        entry.object.userData.renderResident = item.renderResident === true;
        entry.object.userData.shadowResident = item.loaded === true;
        entry.object.userData.shadowProxy = shouldShadowProxy;
      }
      if (entry.interactable) {
        const nextActive = item.active !== false;
        if (entry.interactable.active !== nextActive) {
          entry.interactable.active = nextActive;
          hudRefreshNeeded = true;
        }
      }
      if (entry.solid) {
        entry.solid.enabled = item.active !== false;
        if (entry.solid.enabled !== false) activeSolids.push(entry.solid);
      }
    }
    runtimeStats.collisionShapes = runtimeCollisionBaseCount + activeSolids.length;
    collisionPerfState.activeSolids = activeSolids.length;
    if (activeInteractable && activeInteractable.active === false) {
      activeInteractable = null;
      hudRefreshNeeded = true;
    }
    if (mode === "editor") {
      refreshSelectedRootReference();
      if (selectedRoot?.visible === false) {
        if (selectionHelper) selectionHelper.visible = false;
        if (transformGuide) transformGuide.visible = false;
      } else if (selectedRoot && selectionHelper) {
        updateSelectionHelper();
      }
    }
    syncWorldShadowCasterState(currentShadowPolicy().enabled === true);
    if (hudRefreshNeeded) renderHud();
  }

  function resolveChunkRuntimeUpdateReason(nextState, requestedReason) {
    const previous = chunkRuntimeState || {};
    const previousPolicy = previous.policy || {};
    if (!previous.lastSignature) return requestedReason || "setWorld";
    if (
      previousPolicy.policyId !== nextState.policyId
      || previousPolicy.enabled !== nextState.enabled
      || previousPolicy.source !== nextState.source
      || previousPolicy.type !== nextState.type
      || previousPolicy.chunkWidth !== nextState.chunkWidth
      || previousPolicy.chunkDepth !== nextState.chunkDepth
      || previousPolicy.tileSize !== nextState.tileSize
      || previousPolicy.groundChunkingEnabled !== nextState.groundChunkingEnabled
      || previousPolicy.pathWaterSurfaceChunkingEnabled !== nextState.pathWaterSurfaceChunkingEnabled
      || previousPolicy.terrainVisualChunkingEnabled !== nextState.terrainVisualChunkingEnabled
      || previousPolicy.debugOverlay !== nextState.debugOverlay
      || previousPolicy.showChunkGrid !== nextState.showChunkGrid
      || previousPolicy.showChunkLabels !== nextState.showChunkLabels
      || previousPolicy.keepSelectedChunkLoaded !== nextState.keepSelectedChunkLoaded
      || previousPolicy.activeRadiusChunks !== nextState.activeRadiusChunks
      || previousPolicy.preloadMarginChunks !== nextState.preloadMarginChunks
      || previousPolicy.unloadMarginChunks !== nextState.unloadMarginChunks
      || previousPolicy.maxLoadedChunks !== nextState.maxLoadedChunks
      || previousPolicy.residentEntityBudget !== nextState.residentEntityBudget
      || previousPolicy.residentObjectBudget !== nextState.residentObjectBudget
      || previousPolicy.residentScatterInstanceBudget !== nextState.residentScatterInstanceBudget
      || previousPolicy.residentChunkBuildBudgetPerFrame !== nextState.residentChunkBuildBudgetPerFrame
      || previousPolicy.cameraOffsetZChunks !== nextState.cameraOffsetZChunks
      || previousPolicy.fixedCameraPaddingChunks !== nextState.fixedCameraPaddingChunks
      || previousPolicy.cameraOnly !== nextState.cameraOnly
      || previousPolicy.strictUnloadOutsideCamera !== nextState.strictUnloadOutsideCamera
    ) {
      return "policy-change";
    }
    if (previous.centerChunk?.key !== nextState.centerChunk?.key) return "center-chunk-change";
    if (previous.keepSelectedChunkLoadedApplied !== nextState.keepSelectedChunkLoadedApplied) return "selection-override";
    if (previous.registryVersion !== chunkRuntimeRegistryVersion) return "registry-change";
    return requestedReason || "runtime-sync";
  }

  function chunkWorldCenter(coord, policy) {
    return {
      x: coord.x * policy.chunkWorldWidth + policy.chunkWorldWidth / 2,
      z: coord.z * policy.chunkWorldDepth + policy.chunkWorldDepth / 2
    };
  }

  function clearChunkDebugOverlay() {
    if (!chunkDebugOverlay) return;
    for (const child of Array.from(chunkDebugOverlay.children)) {
      chunkDebugOverlay.remove(child);
      disposeObject(child);
    }
    chunkDebugOverlay.visible = false;
  }

  function ensureChunkDebugOverlay() {
    if (!chunkDebugOverlay) {
      chunkDebugOverlay = new THREE.Group();
      chunkDebugOverlay.name = "GK chunk debug overlay";
      chunkDebugOverlay.userData.chunkOverlayGroup = true;
      chunkDebugOverlay.userData.runtimeAlive = true;
      markDebugOverlayTree(chunkDebugOverlay, "chunk");
      scene.add(chunkDebugOverlay);
    }
    return chunkDebugOverlay;
  }

  const RUNTIME_TERRAIN_GROUP_NAME = "GK runtime terrain visuals";
  const RUNTIME_CHUNK_OVERLAY_GROUP_NAME = "GK chunk debug overlay";

  function countDebugOverlayRoots(parent) {
    let count = 0;
    for (const child of Array.from(parent?.children || [])) {
      if (isDebugOverlayObject(child)) count += 1;
    }
    return count;
  }

  function countCameraDebugOverlayGroups() {
    let count = 0;
    const visit = function (parent) {
      for (const child of Array.from(parent?.children || [])) {
        if (isDebugOverlayObject(child)) count += 1;
        if (child?.children?.length) visit(child);
      }
    };
    visit(camera);
    return count;
  }

  function assertNoCameraChildDebugOverlays(reason = "runtime-sync") {
    let removed = 0;
    const prune = function (parent) {
      for (const child of Array.from(parent?.children || [])) {
        if (isDebugOverlayObject(child)) {
          parent.remove(child);
          disposeObject(child, { disposeTextures: true });
          removed += 1;
          continue;
        }
        if (child?.children?.length) prune(child);
      }
    };
    prune(camera);
    if (removed > 0) {
      console.warn("[overlay] removed " + removed + " camera-child debug overlay object(s) during " + reason + ".");
    }
    return removed;
  }

  function removeAllDebugOverlayObjects(reason = "runtime-sync", options = {}) {
    const removeSceneOverlays = options.removeSceneOverlays === true;
    const removeCameraOverlays = options.removeCameraOverlays !== false;
    let removedOverlayGroups = 0;
    if (removeCameraOverlays) {
      removedOverlayGroups += assertNoCameraChildDebugOverlays(reason);
    }
    if (removeSceneOverlays) {
      for (const child of Array.from(scene.children || [])) {
        if (!isDebugOverlayObject(child)) continue;
        scene.remove(child);
        disposeObject(child, { disposeTextures: true });
        removedOverlayGroups += 1;
      }
    }
    return removedOverlayGroups;
  }

  // Fase 8.6 (DEEL I) + 8.8: guarantees at most one terrain-visuals group and one chunk-debug
  // overlay group live in the scene, and that neither ever ends up parented under the camera
  // (which would make it visually "follow"/rotate with the camera instead of staying in world
  // space). Called from clearContent()/setWorld()/restoreViewState() and before every overlay
  // rebuild so a stray duplicate never survives a viewport refresh.
  function removeDuplicateRuntimeGroups() {
    const stats = {
      debugOverlayEnabled: Boolean(activeModePerformance().debugChunkOverlayVisible === true && resolveChunkPolicy(world, mode)?.debugOverlay === true),
      chunkDebugOverlayVisible: Boolean(chunkDebugOverlay?.visible),
      terrainRuntimeGroups: 0,
      chunkDebugOverlayGroups: 0,
      cameraChildOverlayGroups: 0,
      duplicateRuntimeRoots: 0,
      sceneDebugOverlayGroups: 0,
      sceneChildOverlayGroups: 0,
      duplicateOverlayFound: false,
      removedDuplicateOverlays: 0,
      removedOverlayGroups: 0,
      overlayShadowCasters: 0
    };
    stats.removedOverlayGroups += assertNoCameraChildDebugOverlays("removeDuplicateRuntimeGroups");
    const terrainGroups = [];
    const chunkOverlayGroups = [];
    for (const child of Array.from(scene.children || [])) {
      if (child?.name === RUNTIME_TERRAIN_GROUP_NAME) terrainGroups.push(child);
      if (child?.name === RUNTIME_CHUNK_OVERLAY_GROUP_NAME) chunkOverlayGroups.push(child);
    }
    const pruneDuplicates = function (list, keep) {
      const keeper = list.includes(keep) ? keep : list[0];
      for (const item of list) {
        if (item === keeper) continue;
        scene.remove(item);
        disposeObject(item, { disposeTextures: true });
        stats.removedDuplicateOverlays += 1;
        stats.removedOverlayGroups += 1;
      }
      return keeper;
    };
    if (terrainGroups.length > 1) terrainRuntimeGroup = pruneDuplicates(terrainGroups, terrainRuntimeGroup);
    stats.terrainRuntimeGroups = Math.min(terrainGroups.length, 1);
    stats.chunkDebugOverlayGroups = Math.min(chunkOverlayGroups.length, 1);
    stats.duplicateRuntimeRoots = Math.max(0, terrainGroups.length - 1) + Math.max(0, chunkOverlayGroups.length - 1);
    stats.cameraChildOverlayGroups = countCameraDebugOverlayGroups();
    stats.sceneDebugOverlayGroups = countDebugOverlayRoots(scene);
    stats.sceneChildOverlayGroups = stats.terrainRuntimeGroups + stats.chunkDebugOverlayGroups;
    stats.duplicateOverlayFound = terrainGroups.length > 1 || chunkOverlayGroups.length > 1 || stats.cameraChildOverlayGroups > 0;
    stats.overlayShadowCasters =
      countShadowUsage(selectionHelper).casters +
      countShadowUsage(transformGuide).casters +
      countShadowUsage(terrainEditorOverlay).casters +
      countShadowUsage(scatterEditorOverlay).casters +
      countShadowUsage(chunkDebugOverlay).casters;
    overlayDiagnosticsState = stats;
    return stats;
  }

function resolveChunkDebugCenter(policy) {
    if (mode === "editor") {
      if (orbitControls?.target) {
        return applyChunkLoadingZOffset({
          x: num(orbitControls.target.x, 0),
          z: num(orbitControls.target.z, 0),
          source: "editor_target"
        }, policy, mode);
      }
      return applyChunkLoadingZOffset({
        x: num(camTarget.x, num(player.pos.x, 0)),
        z: num(camTarget.z, num(player.pos.z, 0)),
        source: "editor_camera"
      }, policy, mode);
    }
    if (policy.cameraOnly !== false) {
      return applyChunkLoadingZOffset({
        x: num(camTarget.x, num(player.pos.x, 0)),
        z: num(camTarget.z, num(player.pos.z, 0)),
        source: "game_camera"
      }, policy, mode);
    }
    return applyChunkLoadingZOffset({
      x: num(player.pos.x, num(camTarget.x, 0)),
      z: num(player.pos.z, num(camTarget.z, 0)),
      source: "player"
    }, policy, mode);
  }

  function streamingCoverageForCenter(centerPosition, policy) {
    if (!centerPosition || policy?.source === "none") return null;
    const options = {
      mode: mode,
      policy: policy,
      player: { x: num(player.pos.x, 0), z: num(player.pos.z, 0) },
      camTarget: { x: num(camTarget.x, 0), z: num(camTarget.z, 0) },
      lastPlayerPosition: streamingHeadingState.lastPlayerPosition,
      lastCameraTarget: streamingHeadingState.lastCameraTarget
    };
    if (mode === "editor") {
      options.camera = {
        target: { x: num(centerPosition.x, 0), z: num(centerPosition.z, 0) }
      };
    }
    return computeStreamingCoverage(options);
  }

  function updateStreamingHeadingState() {
    streamingHeadingState.lastPlayerPosition = { x: num(player.pos.x, 0), z: num(player.pos.z, 0) };
    streamingHeadingState.lastCameraTarget = mode === "editor" && orbitControls?.target
      ? { x: num(orbitControls.target.x, 0), z: num(orbitControls.target.z, 0) }
      : { x: num(camTarget.x, 0), z: num(camTarget.z, 0) };
  }

  function effectiveChunkDebugPolicy(policy) {
    if (!policy) return policy;
    const performance = activeModePerformance() || {};
    return Object.assign({}, policy, {
      debugOverlay: policy.debugOverlay === true && performance.debugChunkOverlayVisible === true,
      showChunkGrid: policy.showChunkGrid !== false && performance.chunkGridVisible !== false,
      showChunkLabels: policy.showChunkLabels === true && performance.chunkLabelsVisible === true,
      streamingDebugVisible: performance.streamingDebugVisible === true
    });
  }

  function buildChunkDebugSignature(policy, centerChunkKey, selectedChunkSignatureKey) {
    const performance = activeModePerformance();
    return [
      worldBuildGeneration,
      mode,
      performance?.preset || "",
      performance?.debugHelpersVisible ? 1 : 0,
      performance?.debugChunkOverlayVisible ? 1 : 0,
      performance?.chunkGridVisible ? 1 : 0,
      performance?.chunkLabelsVisible ? 1 : 0,
      performance?.streamingDebugVisible ? 1 : 0,
      policy?.source || "none",
      policy?.policyId || "",
      policy?.enabled ? 1 : 0,
      policy?.type || "",
      policy?.chunkWidth || 0,
      policy?.chunkDepth || 0,
      policy?.tileSize || 0,
      policy?.groundChunkingEnabled ? 1 : 0,
      policy?.pathWaterSurfaceChunkingEnabled ? 1 : 0,
      policy?.cameraOnly ? 1 : 0,
      policy?.strictUnloadOutsideCamera ? 1 : 0,
      policy?.debugOverlay ? 1 : 0,
      policy?.terrainVisualChunkingEnabled ? 1 : 0,
      policy?.showChunkGrid ? 1 : 0,
      policy?.showChunkLabels ? 1 : 0,
      policy?.activeRadiusChunks || 0,
      policy?.preloadMarginChunks || 0,
      policy?.unloadMarginChunks || 0,
      policy?.maxLoadedChunks || 0,
      policy?.residentEntityBudget || 0,
      policy?.residentObjectBudget || 0,
      policy?.residentScatterInstanceBudget || 0,
      policy?.residentChunkBuildBudgetPerFrame || 0,
      policy?.cameraOffsetZChunks || 0,
      policy?.fixedCameraPaddingChunks || 0,
      policy?.keepSelectedChunkLoaded ? 1 : 0,
      selectedChunkSignatureKey || "",
      centerChunkKey || "none",
      chunkRuntimeRegistryVersion
    ].join("|");
  }

  function buildChunkFrameSyncSignature(policy, selectedChunkSignatureKey = "") {
    const effectivePolicy = effectiveChunkDebugPolicy(policy);
    if (!effectivePolicy || effectivePolicy.source === "none") {
      return buildChunkDebugSignature(effectivePolicy, "none", selectedChunkSignatureKey);
    }
    const centerPosition = resolveChunkDebugCenter(effectivePolicy);
    const centerChunk = chunkCoordForPosition(centerPosition.x, centerPosition.z, effectivePolicy);
    const coverage = streamingCoverageForCenter(centerPosition, effectivePolicy);
    return buildChunkDebugSignature(
      effectivePolicy,
      buildCoverageCenterSignatureKey(centerChunk, coverage?.presenceChunkKey || null),
      selectedChunkSignatureKey
    );
  }

  function createChunkDebugState(options = {}) {
    const policy = effectiveChunkDebugPolicy(options.policy || resolveChunkPolicy(world, mode));
    const centerPosition = options.centerPosition || resolveChunkDebugCenter(policy);
    const centerChunk = options.centerChunk || (policy.source === "none"
      ? null
      : chunkCoordForPosition(centerPosition.x, centerPosition.z, policy));
    const selectedChunkSignatureKey = Object.prototype.hasOwnProperty.call(options, "selectedChunkSignatureKey")
      ? String(options.selectedChunkSignatureKey || "")
      : (mode === "editor"
        ? (resolveChunkRuntimeEntryChunkKey({ object: selectedObjectRoot() }, policy)?.key || "")
        : "");
    const includeWindow = options.includeWindow !== false;
    const coverage = Object.prototype.hasOwnProperty.call(options, "coverage")
      ? options.coverage
      : null;
    const state = {
      editor: world?.chunkLoading?.editor?.id || null,
      game: world?.chunkLoading?.game?.id || null,
      enabled: policy.enabled === true,
      source: policy.source,
      policyId: policy.policyId,
      chunkProfileId: policy.chunkProfileId,
      type: policy.type,
      chunkWidth: policy.chunkWidth,
      chunkDepth: policy.chunkDepth,
      tileSize: policy.tileSize,
      chunkWorldWidth: policy.chunkWorldWidth,
      chunkWorldDepth: policy.chunkWorldDepth,
      activeRadiusChunks: policy.activeRadiusChunks,
      preloadMarginChunks: policy.preloadMarginChunks,
      unloadMarginChunks: policy.unloadMarginChunks,
      maxLoadedChunks: policy.maxLoadedChunks,
      debugOverlay: policy.debugOverlay,
      groundChunkingEnabled: policy.groundChunkingEnabled,
      pathWaterSurfaceChunkingEnabled: policy.pathWaterSurfaceChunkingEnabled,
      terrainVisualChunkingEnabled: policy.terrainVisualChunkingEnabled,
      showChunkGrid: policy.showChunkGrid,
      showChunkLabels: policy.showChunkLabels,
      keepSelectedChunkLoaded: policy.keepSelectedChunkLoaded,
      cameraOnly: policy.cameraOnly,
      cameraOffsetZChunks: policy.cameraOffsetZChunks,
      fixedCameraPaddingTiles: policy.fixedCameraPaddingTiles,
      fixedCameraPaddingChunks: policy.fixedCameraPaddingChunks || 0,
      strictUnloadOutsideCamera: policy.strictUnloadOutsideCamera,
      centerSource: policy.source === "none" ? "none" : null,
      centerPosition: null,
      centerChunk: null,
      activeChunks: 0,
      preloadChunks: 0,
      loadedChunks: 0,
      clippedByMaxLoadedChunks: false,
      requiredActiveChunks: 0,
      clippedActiveChunks: 0,
      activeRadiusUnmet: false,
      activeChunkKeys: [],
      preloadChunkKeys: [],
      loadedChunkKeys: [],
      renderLoadedChunkKeys: [],
      renderLoadedChunkCoords: [],
      renderLoadedChunks: 0,
      visibleChunkKeys: [],
      forwardChunkKeys: [],
      unloadSafeChunkKeys: [],
      desiredResidentChunkKeys: [],
      presenceChunkKey: null,
      presenceChunkDistance: null,
      presenceChunkAccepted: false,
      shadowResidentChunkKeys: [],
      collisionResidentChunkKeys: [],
      streamingCoverageSource: "none",
      activeChunkCoords: [],
      preloadChunkCoords: [],
      loadedChunkCoords: [],
      loadedOnlyChunkCoords: [],
      overlayVisible: false,
      hiddenObjects: 0,
      visibleObjects: 0,
      inactiveInteractables: 0,
      inactiveSolids: 0,
      culledEntities: 0,
      culledScatter: 0,
      culledInteractables: 0,
      culledSolids: 0,
      uncullableObjects: 0,
      terrainVisuals: createEmptyTerrainVisualStats(),
      ground: cloneGroundChunkStats(groundChunkState.stats),
      terrainStreaming: Object.assign({}, terrainStreamingState, {
        residentChunkKeys: terrainStreamingState.residentChunkKeys.slice()
      }),
      cullingEnabled: false,
      keepSelectedChunkLoadedApplied: false,
      lastUpdateReason: "init"
    };
    state.centerSource = centerPosition.source;
    state.centerPosition = {
      x: round(centerPosition.x),
      z: round(centerPosition.z)
    };
    state.renderResidentObjects = chunkRuntimeState.renderResidentObjects || 0;
    state.heldVisibleObjects = chunkRuntimeState.heldVisibleObjects || 0;
    state.pendingUnloadObjects = chunkRuntimeState.pendingUnloadObjects || 0;
    state.unloadedObjects = chunkRuntimeState.unloadedObjects || 0;
    state.objectResidency = cloneResidencySummary(chunkRuntimeState.objectResidency) || createEmptyObjectResidencySummary();
    state.chunkResidency = cloneResidencySummary(chunkRuntimeState.chunkResidency) || createEmptyChunkResidencySummary();
    if (centerChunk) {
      state.centerChunk = {
        x: centerChunk.x,
        z: centerChunk.z,
        key: chunkKey(centerChunk)
      };
    }
    if (includeWindow && policy.enabled === true && policy.source !== "none" && centerChunk) {
      let windowState = buildChunkWindow(centerChunk, policy, mode);
      const selectedKeepLoadedChunkKeys = resolveSelectedKeepLoadedChunkKeys(policy);
      if (selectedKeepLoadedChunkKeys.length) {
        const merged = mergeChunkWindowLoadedKeys(windowState, selectedKeepLoadedChunkKeys);
        windowState = merged.windowState;
        state.keepSelectedChunkLoadedApplied = merged.applied;
      }
      const nextCoverage = coverage || streamingCoverageForCenter(centerPosition, policy);
      if (nextCoverage) {
        const extraKeys = nextCoverage.desiredResidentChunkKeys.filter(function (key) {
          return key && !windowState.loadedChunkKeySet.has(key);
        });
        if (extraKeys.length) {
          const extraCoords = extraKeys.map(function (key) {
            const coord = chunkCoordFromKey(key);
            return coord ? { x: coord.x, z: coord.z, key: key } : null;
          }).filter(Boolean);
          windowState = Object.assign({}, windowState, {
            loadedOnlyChunks: windowState.loadedOnlyChunks.concat(extraCoords),
            loadedChunks: windowState.loadedChunks.concat(extraCoords).slice().sort(chunkCoordSort),
            loadedChunkKeys: sortChunkKeys(windowState.loadedChunkKeys.concat(extraKeys)),
            loadedChunkKeySet: new Set(windowState.loadedChunkKeys.concat(extraKeys))
          });
        }
        state.visibleChunkKeys = nextCoverage.visibleChunkKeys.slice();
        state.forwardChunkKeys = nextCoverage.forwardChunkKeys.slice();
        state.unloadSafeChunkKeys = Array.from(new Set(nextCoverage.unloadSafeChunkKeys.concat(windowState.loadedChunkKeys)));
        state.presenceChunkKey = nextCoverage.presenceChunkKey || null;
        state.presenceChunkDistance = Number.isFinite(Number(nextCoverage.presenceChunkDistance)) ? Number(nextCoverage.presenceChunkDistance) : null;
        state.presenceChunkAccepted = nextCoverage.presenceChunkAccepted === true;
        state.streamingCoverageSource = nextCoverage.source;
      } else {
        state.unloadSafeChunkKeys = windowState.loadedChunkKeys.slice();
      }
      state.desiredResidentChunkKeys = windowState.loadedChunkKeys.slice();
      state.activeChunks = windowState.activeChunks.length;
      state.preloadChunks = windowState.preloadChunks.length;
      state.loadedChunks = windowState.loadedChunks.length;
      state.clippedByMaxLoadedChunks = windowState.clippedByMaxLoadedChunks;
      state.requiredActiveChunks = num(windowState.requiredActiveChunks, 0);
      state.clippedActiveChunks = num(windowState.clippedActiveChunks, 0);
      state.activeRadiusUnmet = windowState.activeRadiusUnmet === true;
      state.activeChunkKeys = windowState.activeChunkKeys.slice();
      state.preloadChunkKeys = windowState.preloadChunkKeys.slice();
      state.loadedChunkKeys = windowState.loadedChunkKeys.slice();
      state.renderLoadedChunkKeys = windowState.loadedChunkKeys.slice();
      state.renderLoadedChunks = windowState.loadedChunks.length;
      state.activeChunkCoords = windowState.activeChunks.map(function (coord) { return { x: coord.x, z: coord.z, key: coord.key }; });
      state.preloadChunkCoords = windowState.preloadChunks.map(function (coord) { return { x: coord.x, z: coord.z, key: coord.key }; });
      state.loadedChunkCoords = windowState.loadedChunks.map(function (coord) { return { x: coord.x, z: coord.z, key: coord.key }; });
      state.renderLoadedChunkCoords = windowState.loadedChunks.map(function (coord) { return { x: coord.x, z: coord.z, key: coord.key }; });
      state.loadedOnlyChunkCoords = windowState.loadedOnlyChunks.map(function (coord) { return { x: coord.x, z: coord.z, key: coord.key }; });
    }
    state.shadowResidentChunkKeys = state.loadedChunkKeys.slice();
    state.collisionResidentChunkKeys = Array.from(new Set(state.visibleChunkKeys.concat(state.preloadChunkKeys)));
    state.overlayVisible = state.enabled && state.debugOverlay && state.loadedChunkCoords.length > 0;
    state.cullingEnabled = isChunkCullingRuntimeEnabled(policy);
    state.signature = buildChunkDebugSignature(
      policy,
      buildCoverageCenterSignatureKey(centerChunk, (coverage && coverage.presenceChunkKey) || null),
      selectedChunkSignatureKey
    );
    return state;
  }

  function createChunkFillMesh(coord, policy, color, opacity, y) {
    const geometry = new THREE.PlaneGeometry(policy.chunkWorldWidth, policy.chunkWorldDepth);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: opacity,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    const center = chunkWorldCenter(coord, policy);
    mesh.position.set(center.x, y, center.z);
    mesh.renderOrder = 996;
    mesh.userData.debugOverlay = true;
    mesh.userData.debugOverlayRoot = false;
    mesh.userData.debugOverlayKind = "chunk";
    mesh.userData.chunkOverlayFill = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  function createChunkGridLines(coords, policy, y) {
    if (!Array.isArray(coords) || !coords.length) return null;
    let minX = coords[0].x;
    let maxX = coords[0].x;
    let minZ = coords[0].z;
    let maxZ = coords[0].z;
    for (const coord of coords) {
      minX = Math.min(minX, coord.x);
      maxX = Math.max(maxX, coord.x);
      minZ = Math.min(minZ, coord.z);
      maxZ = Math.max(maxZ, coord.z);
    }
    const points = [];
    const startWorldX = minX * policy.chunkWorldWidth;
    const endWorldX = (maxX + 1) * policy.chunkWorldWidth;
    const startWorldZ = minZ * policy.chunkWorldDepth;
    const endWorldZ = (maxZ + 1) * policy.chunkWorldDepth;
    for (let chunkX = minX; chunkX <= maxX + 1; chunkX += 1) {
      const worldX = chunkX * policy.chunkWorldWidth;
      points.push(new THREE.Vector3(worldX, y, startWorldZ), new THREE.Vector3(worldX, y, endWorldZ));
    }
    for (let chunkZ = minZ; chunkZ <= maxZ + 1; chunkZ += 1) {
      const worldZ = chunkZ * policy.chunkWorldDepth;
      points.push(new THREE.Vector3(startWorldX, y, worldZ), new THREE.Vector3(endWorldX, y, worldZ));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0x8eeaff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      depthTest: false,
      toneMapped: false
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = 997;
    lines.userData.debugOverlay = true;
    lines.userData.debugOverlayKind = "chunk";
    lines.castShadow = false;
    lines.receiveShadow = false;
    return lines;
  }

  function createChunkLabelSprite(text, x, y, z, policy) {
    if (typeof document === "undefined") return null;
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 256;
    labelCanvas.height = 112;
    const context = labelCanvas.getContext("2d");
    if (!context) return null;
    context.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
    context.fillStyle = "rgba(7, 15, 22, 0.82)";
    context.fillRect(10, 12, labelCanvas.width - 20, labelCanvas.height - 24);
    context.strokeStyle = "rgba(142, 234, 255, 0.95)";
    context.lineWidth = 4;
    context.strokeRect(10, 12, labelCanvas.width - 20, labelCanvas.height - 24);
    context.fillStyle = "#f3fbff";
    context.font = "600 32px monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, labelCanvas.width / 2, labelCanvas.height / 2);
    const texture = new THREE.CanvasTexture(labelCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(Math.max(18, policy.chunkWorldWidth * 0.75), Math.max(10, policy.chunkWorldDepth * 0.3), 1);
    sprite.renderOrder = 998;
    sprite.userData.debugOverlay = true;
    sprite.userData.debugOverlayKind = "chunk";
    sprite.castShadow = false;
    sprite.receiveShadow = false;
    return sprite;
  }

  function rebuildChunkDebugOverlay(state) {
    if (!state?.overlayVisible || state.source === "none") {
      if (chunkDebugOverlay && chunkDebugOverlay.children.length > 0) {
        clearChunkDebugOverlay();
      } else if (chunkDebugOverlay) {
        chunkDebugOverlay.visible = false;
      }
      return;
    }
    clearChunkDebugOverlay();
    removeDuplicateRuntimeGroups();
    const group = ensureChunkDebugOverlay();
    const policy = resolveChunkPolicy(world, mode);
    const baseY = num(world?.ground?.y, 0) + 0.05;
    const renderLoadedChunkCoords = Array.isArray(state.renderLoadedChunkCoords) && state.renderLoadedChunkCoords.length
      ? state.renderLoadedChunkCoords
      : state.loadedChunkCoords;
    for (const coord of state.loadedOnlyChunkCoords) {
      group.add(createChunkFillMesh(coord, policy, 0x2f7891, 0.08, baseY));
    }
    for (const coord of state.preloadChunkCoords) {
      group.add(createChunkFillMesh(coord, policy, 0xe3a63d, 0.12, baseY + 0.01));
    }
    for (const coord of state.activeChunkCoords) {
      group.add(createChunkFillMesh(coord, policy, 0x45d483, 0.18, baseY + 0.02));
    }
    if (state.showChunkGrid) {
      const grid = createChunkGridLines(renderLoadedChunkCoords, policy, baseY + 0.04);
      if (grid) group.add(grid);
    }
    if (state.showChunkLabels) {
      for (const coord of renderLoadedChunkCoords) {
        const center = chunkWorldCenter(coord, policy);
        const label = createChunkLabelSprite(coord.key, center.x, baseY + 0.12, center.z, policy);
        if (label) group.add(label);
      }
    }
    sanitizeNonWorldShadowCasters(group);
    group.visible = true;
    removeGhostChunkPlanes("rebuildChunkDebugOverlay", {
      scene: scene,
      camera: camera,
      content: content,
      terrainRuntimeGroup: terrainRuntimeGroup,
      chunkDebugOverlay: group,
      selectionHelper: selectionHelper,
      transformGuide: transformGuide,
      terrainEditorOverlay: terrainEditorOverlay,
      scatterEditorOverlay: scatterEditorOverlay,
      world: world,
      debugOverlayVisible: state.overlayVisible === true
    });
  }

  function updateTerrainStreamingSnapshot(nextState) {
    const snapshot = collectTerrainStreamingSnapshot(
      terrainRuntimeResidentEntries,
      terrainRuntimeEntries,
      terrainTextureRecords,
      surfaceMaterialRecords,
      nextState
    );
    terrainStreamingState.loadedChunks = snapshot.loadedChunks;
    terrainStreamingState.activeChunks = snapshot.activeChunks;
    terrainStreamingState.preloadChunks = snapshot.preloadChunks;
    terrainStreamingState.residentPieces = snapshot.residentPieces;
    terrainStreamingState.residentChunks = snapshot.residentChunks;
    terrainStreamingState.residentChunkKeys = snapshot.residentChunkKeys;
    terrainStreamingState.textureRefs = snapshot.textureRefs;
    terrainStreamingState.textureAssets = snapshot.textureAssets;
    terrainStreamingState.surfaceMaterials = snapshot.surfaceMaterials;
    terrainStreamingState.lastUpdateReason = snapshot.lastUpdateReason;
  }

  function syncChunkDebugState(reason = "runtime-sync", options = {}) {
    const policy = effectiveChunkDebugPolicy(resolveChunkPolicy(world, mode));
    const centerPosition = resolveChunkDebugCenter(policy);
    const centerChunk = policy.source === "none"
      ? null
      : chunkCoordForPosition(centerPosition.x, centerPosition.z, policy);
    const selectedChunkSignatureKey = mode === "editor"
      ? (resolveChunkRuntimeEntryChunkKey({ object: selectedObjectRoot() }, policy)?.key || "")
      : "";
    const shouldAllowHeavySync = options.allowHeavy !== false;
    chunkSyncStats.syncCalls += 1;
    if (mode === "editor" || debugHelpersVisibleInCurrentMode()) {
      removeDuplicateRuntimeGroups();
    }
    const hasPendingResidentWork = isChunkCullingRuntimeEnabled(policy) && residentContentState.pendingChunkKeys.length > 0;
    const hasPendingResidencyWork = isChunkCullingRuntimeEnabled(policy) && hasPendingObjectResidencyWork();
    const coverage = streamingCoverageForCenter(centerPosition, policy);
    const renderSignature = buildChunkDebugSignature(
      policy,
      buildCoverageCenterSignatureKey(centerChunk, coverage?.presenceChunkKey || null),
      selectedChunkSignatureKey
    );
    const nextState = createChunkDebugState({
      policy: policy,
      centerPosition: centerPosition,
      centerChunk: centerChunk,
      selectedChunkSignatureKey: selectedChunkSignatureKey,
      includeWindow: shouldAllowHeavySync !== false,
      coverage: coverage
    });
    updateStreamingHeadingState();
    const stableShadowSnapshot = updateShadowAnchor(nextState, reason) || null;
    const shadowResidentChunkKeys = Array.isArray(stableShadowSnapshot?.shadowResidentChunkKeys) && stableShadowSnapshot.shadowResidentChunkKeys.length
      ? stableShadowSnapshot.shadowResidentChunkKeys.slice()
      : (Array.isArray(nextState.loadedChunkKeys) ? nextState.loadedChunkKeys.slice() : []);
    const renderResidentChunkKeys = Array.isArray(stableShadowSnapshot?.renderResidentChunkKeys) && stableShadowSnapshot.renderResidentChunkKeys.length
      ? stableShadowSnapshot.renderResidentChunkKeys.slice()
      : (Array.isArray(nextState.renderLoadedChunkKeys) ? nextState.renderLoadedChunkKeys.slice() : nextState.loadedChunkKeys.slice());
    const collisionResidentChunkKeys = Array.isArray(stableShadowSnapshot?.collisionResidentChunkKeys) && stableShadowSnapshot.collisionResidentChunkKeys.length
      ? stableShadowSnapshot.collisionResidentChunkKeys.slice()
      : Array.from(new Set(nextState.visibleChunkKeys.concat(nextState.preloadChunkKeys)));
    const shadowWindowChunkKeys = Array.isArray(stableShadowSnapshot?.shadowWindowChunkKeys)
      ? stableShadowSnapshot.shadowWindowChunkKeys.slice()
      : [];
    nextState.stableShadows = stableShadowSnapshot;
    nextState.renderResidentChunkKeys = renderResidentChunkKeys.slice();
    nextState.shadowResidentChunkKeys = shadowResidentChunkKeys.slice();
    nextState.collisionResidentChunkKeys = collisionResidentChunkKeys.slice();
    nextState.shadowWindowChunkKeys = shadowWindowChunkKeys.slice();
    // Keep the resident content window anchored to streaming coverage. Shadow residency stays
    // separate so lighting/debug updates cannot pin chunk loading to the shadow focus.
    const stableSignature = [
      renderSignature,
      stableShadowSnapshot?.signature || [
        stableShadowSnapshot?.mode || "",
        round(num(stableShadowSnapshot?.snappedFocus?.x, 0)),
        round(num(stableShadowSnapshot?.snappedFocus?.z, 0)),
        stableShadowSnapshot?.shadowMapSize || 0,
        stableShadowSnapshot?.shadowRadiusChunks || 0,
        renderResidentChunkKeys.join(","),
        shadowResidentChunkKeys.join(","),
        collisionResidentChunkKeys.join(","),
        shadowWindowChunkKeys.join(",")
      ].join("|")
    ].join("|");
    const updateCacheShadowFields = function (target) {
      if (!target) return target;
      target.stableShadows = stableShadowSnapshot;
      target.renderResidentChunkKeys = renderResidentChunkKeys.slice();
      target.shadowResidentChunkKeys = shadowResidentChunkKeys.slice();
      target.collisionResidentChunkKeys = collisionResidentChunkKeys.slice();
      target.shadowWindowChunkKeys = shadowWindowChunkKeys.slice();
      target.renderLoadedChunkKeys = renderResidentChunkKeys.slice();
      target.renderLoadedChunkCoords = Array.isArray(nextState.renderLoadedChunkCoords) ? nextState.renderLoadedChunkCoords.slice() : [];
      target.lastUpdateReason = stableShadowSnapshot?.lastUpdateReason || target.lastUpdateReason || reason;
      return target;
    };
    if (stableSignature === chunkDebugSignature && chunkDebugStateCache && !hasPendingResidencyWork) {
      chunkSyncStats.skippedSyncCalls += 1;
      updateCacheShadowFields(chunkDebugStateCache);
      if (hasPendingResidentWork) drainPendingResidentChunkBuilds(reason);
      return chunkDebugStateCache;
    }
    if (!shouldAllowHeavySync && chunkDebugStateCache && !hasPendingResidencyWork) {
      chunkSyncStats.skippedSyncCalls += 1;
      updateCacheShadowFields(chunkDebugStateCache);
      if (hasPendingResidentWork) drainPendingResidentChunkBuilds(reason);
      return chunkDebugStateCache;
    }
    const heavyStart = performance.now();
    const cullingSignature = stableSignature + "|" + String(chunkRuntimeRegistryVersion);
    const needsHeavySync = hasPendingResidencyWork || cullingSignature !== chunkRuntimeState.lastSignature;
    if (needsHeavySync) {
      const entryDescriptors = chunkRuntimeEntries.map(function (entry) {
        const position = resolveChunkRuntimeEntryPosition(entry);
        return {
          id: entry.id,
          type: entry.type,
          hasVisual: entry.hasVisual !== false,
          x: position?.x,
          z: position?.z,
          chunkKey: entry.chunkKey || null,
          chunkKeys: Array.isArray(entry.chunkKeys) ? entry.chunkKeys.slice() : []
        };
      });
      const cullingResult = collectChunkCullingStats(entryDescriptors, nextState, {
        policy: policy,
        cullingEnabled: nextState.cullingEnabled,
        keepSelectedChunkLoadedApplied: nextState.keepSelectedChunkLoadedApplied,
        renderResidentChunkKeys: renderResidentChunkKeys,
        objectResidencyState: objectResidencyState,
        chunkResidencyState: chunkResidencyState
      });
      applyChunkCullingResult(cullingResult);
      nextState.hiddenObjects = cullingResult.hiddenObjects;
      nextState.visibleObjects = cullingResult.visibleObjects;
      nextState.renderResidentObjects = cullingResult.renderResidentObjects || 0;
      nextState.heldVisibleObjects = cullingResult.heldVisibleObjects || 0;
      nextState.pendingUnloadObjects = cullingResult.pendingUnloadObjects || 0;
      nextState.unloadedObjects = cullingResult.unloadedObjects || 0;
      nextState.inactiveInteractables = cullingResult.inactiveInteractables;
      nextState.inactiveSolids = cullingResult.inactiveSolids;
      nextState.culledEntities = cullingResult.culledEntities;
      nextState.culledScatter = cullingResult.culledScatter;
      nextState.culledInteractables = cullingResult.culledInteractables;
      nextState.culledSolids = cullingResult.culledSolids;
      nextState.uncullableObjects = cullingResult.uncullableObjects;
      nextState.objectResidency = cullingResult.objectResidency ? Object.assign({}, cullingResult.objectResidency, {
        entries: Array.isArray(cullingResult.objectResidency.entries) ? cullingResult.objectResidency.entries.map(function (entry) { return Object.assign({}, entry); }) : []
      }) : null;
      nextState.chunkResidency = cullingResult.chunkResidency ? Object.assign({}, cullingResult.chunkResidency, {
        entries: Array.isArray(cullingResult.chunkResidency.entries) ? cullingResult.chunkResidency.entries.map(function (entry) { return Object.assign({}, entry); }) : []
      }) : null;
      nextState.terrainVisuals = Object.assign(createEmptyTerrainVisualStats(), cullingResult.terrainVisuals || {});
      nextState.activeChunkKeys = cullingResult.activeChunkKeys.slice();
      nextState.preloadChunkKeys = cullingResult.preloadChunkKeys.slice();
      nextState.loadedChunkKeys = cullingResult.loadedChunkKeys.slice();
      nextState.activeChunks = cullingResult.activeChunks;
      nextState.preloadChunks = cullingResult.preloadChunks;
      nextState.loadedChunks = cullingResult.loadedChunks;
      nextState.renderResidentChunkKeys = renderResidentChunkKeys.slice();
      nextState.shadowResidentChunkKeys = shadowResidentChunkKeys.slice();
      nextState.collisionResidentChunkKeys = collisionResidentChunkKeys.slice();
      nextState.shadowWindowChunkKeys = shadowWindowChunkKeys.slice();
      nextState.lastUpdateReason = resolveChunkRuntimeUpdateReason(nextState, reason);
      updateTerrainStreamingSnapshot(nextState);
      chunkRuntimeState = {
        policy: policy,
        centerChunk: nextState.centerChunk ? { x: nextState.centerChunk.x, z: nextState.centerChunk.z, key: nextState.centerChunk.key } : null,
        loadedChunkKeys: nextState.loadedChunkKeys.slice(),
        renderChunkKeys: nextState.renderResidentChunkKeys.slice(),
        shadowResidentChunkKeys: nextState.shadowResidentChunkKeys.slice(),
        collisionResidentChunkKeys: nextState.collisionResidentChunkKeys.slice(),
        shadowWindowChunkKeys: nextState.shadowWindowChunkKeys.slice(),
        activeChunkKeys: nextState.activeChunkKeys.slice(),
        preloadChunkKeys: nextState.preloadChunkKeys.slice(),
        visibleChunkKeys: Array.isArray(nextState.visibleChunkKeys) ? nextState.visibleChunkKeys.slice() : [],
        forwardChunkKeys: Array.isArray(nextState.forwardChunkKeys) ? nextState.forwardChunkKeys.slice() : [],
        unloadSafeChunkKeys: Array.isArray(nextState.unloadSafeChunkKeys) ? nextState.unloadSafeChunkKeys.slice() : [],
        desiredResidentChunkKeys: Array.isArray(nextState.desiredResidentChunkKeys) ? nextState.desiredResidentChunkKeys.slice() : [],
        presenceChunkKey: nextState.presenceChunkKey || null,
        presenceChunkDistance: Number.isFinite(Number(nextState.presenceChunkDistance)) ? Number(nextState.presenceChunkDistance) : null,
        presenceChunkAccepted: nextState.presenceChunkAccepted === true,
        streamingCoverageSource: nextState.streamingCoverageSource || "none",
        clippedByMaxLoadedChunks: nextState.clippedByMaxLoadedChunks,
        hiddenObjects: nextState.hiddenObjects,
        visibleObjects: nextState.visibleObjects,
        renderResidentObjects: nextState.renderResidentObjects || 0,
        heldVisibleObjects: nextState.heldVisibleObjects || 0,
        pendingUnloadObjects: nextState.pendingUnloadObjects || 0,
        unloadedObjects: nextState.unloadedObjects || 0,
        inactiveInteractables: nextState.inactiveInteractables,
        inactiveSolids: nextState.inactiveSolids,
        culledEntities: nextState.culledEntities,
        culledScatter: nextState.culledScatter,
        culledInteractables: nextState.culledInteractables,
        culledSolids: nextState.culledSolids,
        uncullableObjects: nextState.uncullableObjects,
        objectResidency: nextState.objectResidency ? Object.assign({}, nextState.objectResidency, {
          entries: Array.isArray(nextState.objectResidency.entries) ? nextState.objectResidency.entries.map(function (entry) { return Object.assign({}, entry); }) : []
        }) : null,
        chunkResidency: nextState.chunkResidency ? Object.assign({}, nextState.chunkResidency, {
          entries: Array.isArray(nextState.chunkResidency.entries) ? nextState.chunkResidency.entries.map(function (entry) { return Object.assign({}, entry); }) : []
        }) : null,
        terrainVisuals: Object.assign(createEmptyTerrainVisualStats(), nextState.terrainVisuals || {}),
        terrainStreaming: Object.assign({}, terrainStreamingState, {
          residentChunkKeys: Array.isArray(terrainStreamingState.residentChunkKeys)
            ? terrainStreamingState.residentChunkKeys.slice()
            : []
        }),
        keepSelectedChunkLoadedApplied: nextState.keepSelectedChunkLoadedApplied,
        cullingEnabled: nextState.cullingEnabled,
        registryVersion: chunkRuntimeRegistryVersion,
        lastSignature: cullingSignature,
        lastUpdateReason: nextState.lastUpdateReason
      };
      chunkSyncStats.heavySyncCalls += 1;
      chunkSyncStats.lastHeavyReason = nextState.lastUpdateReason || reason;
    } else {
      nextState.hiddenObjects = chunkRuntimeState.hiddenObjects;
      nextState.visibleObjects = chunkRuntimeState.visibleObjects;
      nextState.inactiveInteractables = chunkRuntimeState.inactiveInteractables;
      nextState.inactiveSolids = chunkRuntimeState.inactiveSolids;
      nextState.culledEntities = chunkRuntimeState.culledEntities;
      nextState.culledScatter = chunkRuntimeState.culledScatter;
      nextState.culledInteractables = chunkRuntimeState.culledInteractables;
      nextState.culledSolids = chunkRuntimeState.culledSolids;
      nextState.uncullableObjects = chunkRuntimeState.uncullableObjects;
      nextState.terrainVisuals = Object.assign(createEmptyTerrainVisualStats(), chunkRuntimeState.terrainVisuals || {});
      nextState.cullingEnabled = chunkRuntimeState.cullingEnabled;
      nextState.lastUpdateReason = chunkRuntimeState.lastUpdateReason;
      nextState.renderResidentChunkKeys = Array.isArray(chunkRuntimeState.renderChunkKeys) ? chunkRuntimeState.renderChunkKeys.slice() : renderResidentChunkKeys.slice();
      nextState.shadowResidentChunkKeys = Array.isArray(chunkRuntimeState.shadowResidentChunkKeys) ? chunkRuntimeState.shadowResidentChunkKeys.slice() : shadowResidentChunkKeys.slice();
      nextState.collisionResidentChunkKeys = Array.isArray(chunkRuntimeState.collisionResidentChunkKeys) ? chunkRuntimeState.collisionResidentChunkKeys.slice() : collisionResidentChunkKeys.slice();
      nextState.shadowWindowChunkKeys = Array.isArray(chunkRuntimeState.shadowWindowChunkKeys) ? chunkRuntimeState.shadowWindowChunkKeys.slice() : shadowWindowChunkKeys.slice();
      nextState.objectResidency = chunkRuntimeState.objectResidency ? Object.assign({}, chunkRuntimeState.objectResidency, {
        entries: Array.isArray(chunkRuntimeState.objectResidency.entries) ? chunkRuntimeState.objectResidency.entries.map(function (entry) { return Object.assign({}, entry); }) : []
      }) : null;
      nextState.chunkResidency = chunkRuntimeState.chunkResidency ? Object.assign({}, chunkRuntimeState.chunkResidency, {
        entries: Array.isArray(chunkRuntimeState.chunkResidency.entries) ? chunkRuntimeState.chunkResidency.entries.map(function (entry) { return Object.assign({}, entry); }) : []
      }) : null;
      nextState.renderResidentObjects = chunkRuntimeState.renderResidentObjects || 0;
      nextState.heldVisibleObjects = chunkRuntimeState.heldVisibleObjects || 0;
      nextState.pendingUnloadObjects = chunkRuntimeState.pendingUnloadObjects || 0;
      nextState.unloadedObjects = chunkRuntimeState.unloadedObjects || 0;
      updateTerrainStreamingSnapshot(nextState);
    }
    if (isChunkCullingRuntimeEnabled(policy)) {
      syncResidentChunkContent(nextState, nextState.lastUpdateReason || reason);
    }
    if (needsHeavySync) {
      syncGroundChunkState(world, nextState, nextState.lastUpdateReason || reason);
      nextState.ground = cloneGroundChunkStats(groundChunkState.stats);
      chunkRuntimeState.ground = cloneGroundChunkStats(groundChunkState.stats);
      chunkRuntimeState.terrainStreaming = Object.assign({}, terrainStreamingState, {
        residentChunkKeys: Array.isArray(terrainStreamingState.residentChunkKeys)
          ? terrainStreamingState.residentChunkKeys.slice()
          : []
      });
      chunkRuntimeState.lastUpdateReason = nextState.lastUpdateReason || reason;
    } else {
      nextState.ground = cloneGroundChunkStats(chunkRuntimeState.ground || groundChunkState.stats);
    }
    nextState.stableShadows = stableSunShadowController?.getSnapshot?.() || stableShadowSnapshot;
    if (needsHeavySync || !chunkDebugStateCache) {
      chunkDebugStateCache = nextState;
      chunkDebugSignature = stableSignature;
      updateCacheShadowFields(chunkDebugStateCache);
    }
    if (needsHeavySync) {
      rebuildChunkDebugOverlay(nextState);
      chunkSyncStats.lastHeavySyncMs = round(performance.now() - heavyStart);
    } else if (chunkDebugOverlay) {
      chunkDebugOverlay.visible = nextState.overlayVisible;
    }
    return nextState;
  }

  function applySmoothShadingToMaterial(material, smoothShading) {
    if (!material || typeof material.flatShading === "undefined") return;
    const nextFlatShading = !Boolean(smoothShading);
    if (material.flatShading === nextFlatShading) return;
    material.flatShading = nextFlatShading;
    material.needsUpdate = true;
  }

  function applySmoothShadingToObject(object, smoothShading) {
    if (!object || typeof object.traverse !== "function") return;
    object.traverse(function (child) {
      if (!child?.isMesh || !child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) applySmoothShadingToMaterial(material, smoothShading);
    });
  }

  function activeModePerformance() {
    return mode === "editor" ? worldPerformance.editor : worldPerformance.game;
  }

  function debugWarningsVisibleInCurrentMode() {
    return activeModePerformance().debugWarningsVisible === true;
  }

  function debugHelpersVisibleInCurrentMode() {
    return mode !== "editor" ? false : activeModePerformance().debugHelpersVisible !== false;
  }

  function sharedWorldPerformance() {
    return worldPerformance.shared;
  }

  function currentShadowPolicy() {
    return shadowPolicy;
  }

  function createStableSunShadowController(options = {}) {
    const controllerMode = stableShadowModeName(options.mode || mode);
    const controllerScene = options.scene || scene;
    const controllerRenderer = options.renderer || renderer;
    const controllerCamera = options.camera || camera;
    const lightEntries = [];
    const updateHistory = [];
    const state = {
      enabled: false,
      mode: controllerMode,
      preset: "middel_schaduw",
      legacyFieldsIgnored: false,
      rendererShadowMapEnabled: false,
      lightCount: 0,
      sunDirection: { x: 0, y: -1, z: 0 },
      focusMode: "editor_world_center_or_selected",
      rawFocus: { x: 0, y: 0, z: 0 },
      targetPosition: { x: 0, y: 0, z: 0 },
      snappedFocus: { x: 0, y: 0, z: 0 },
      snapWorldUnits: 0,
      mapSize: 0,
      cameraSize: 0,
      cameraNear: 1,
      cameraFar: 0,
      bias: 0,
      normalBias: 0,
      shadowMapType: "unknown",
      shadowType: "off",
      shadowMapSize: 0,
      shadowCameraBounds: { left: 0, right: 0, top: 0, bottom: 0, near: 0, far: 0, radius: 0 },
      lastProjectionUpdateReason: "init",
      projectionUpdateCount: 0,
      framesSinceProjectionUpdate: 0,
      lastUpdateReason: "init",
      updatesThisSecond: 0,
      stableSnapCell: { x: 0, z: 0, worldUnits: 0 },
      renderResidentChunkKeys: [],
      collisionResidentChunkKeys: [],
      shadowResidentChunkKeys: [],
      shadowWindowChunkKeys: [],
      renderResidentChunkCount: 0,
      shadowResidentChunkCount: 0,
      shadowResidentMarginChunks: 0,
      shadowCasterCount: 0,
      shadowReceiverCount: 0,
      casterCounts: {},
      receiverCounts: {},
      helperCasterCount: 0,
      debugCasterCount: 0,
      circleOrPlaneCasterCount: 0,
      proxyCasterCount: 0,
      instancedCasterCount: 0,
      debugShadowCasterCount: 0,
      overlayShadowCasterCount: 0,
      cameraChildOverlayGroups: 0,
      jumpDetected: false,
      lastJumpDistance: 0,
      shadowRadiusChunks: 0,
      projectionSignature: "",
      chunkSignature: "",
      auditSignature: "",
      warnings: [],
      signature: ""
    };

    function snapshotValue(value) {
      return {
        x: round(num(value?.x, 0)),
        y: round(num(value?.y, 0)),
        z: round(num(value?.z, 0))
      };
    }

    function pruneUpdateHistory(now) {
      while (updateHistory.length && now - updateHistory[0] > 1000) updateHistory.shift();
      state.updatesThisSecond = updateHistory.length;
    }

    function countCameraChildOverlayGroups() {
      let count = 0;
      const visit = function (root) {
        if (!root || !Array.isArray(root.children)) return;
        for (const child of root.children) {
          if (isDebugOverlayObject(child)) count += 1;
          if (child?.children?.length) visit(child);
        }
      };
      visit(controllerCamera);
      return count;
    }

    function updateLightEntry(entry, focus, enabled, shadowCameraSize, shadowMapSize, shadowBias, shadowNormalBias, nearDistance, farDistance) {
      if (!entry?.light) return;
      const light = entry.light;
      const basePosition = entry.basePosition || light.userData?.shadowBasePosition || new THREE.Vector3(light.position.x, light.position.y, light.position.z);
      const baseTarget = entry.baseTarget || light.userData?.shadowBaseTarget || new THREE.Vector3(0, 0, 0);
      const focusX = num(focus?.snappedFocus?.x, 0);
      const focusZ = num(focus?.snappedFocus?.z, 0);
      if (!light.userData) light.userData = {};
      light.userData.shadowBasePosition = basePosition.clone();
      light.userData.shadowBaseTarget = baseTarget.clone();
      light.castShadow = enabled;
      light.position.set(basePosition.x + focusX, basePosition.y, basePosition.z + focusZ);
      if (light.target) {
        light.target.position.set(baseTarget.x + focusX, baseTarget.y, baseTarget.z + focusZ);
        if (!light.target.parent) controllerScene.add(light.target);
        light.target.updateMatrixWorld(true);
      }
      if (light.shadow?.mapSize) light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
      if (light.shadow) {
        light.shadow.bias = shadowBias;
        light.shadow.normalBias = shadowNormalBias;
        if (light.shadow.camera) {
          light.shadow.camera.left = -shadowCameraSize;
          light.shadow.camera.right = shadowCameraSize;
          light.shadow.camera.top = shadowCameraSize;
          light.shadow.camera.bottom = -shadowCameraSize;
          light.shadow.camera.near = nearDistance;
          light.shadow.camera.far = farDistance;
          if (typeof light.shadow.camera.updateProjectionMatrix === "function") {
            light.shadow.camera.updateProjectionMatrix();
          }
        }
      }
      light.updateMatrixWorld(true);
    }

    function getSnapshot() {
      return Object.assign({}, state, {
        sunDirection: Object.assign({}, state.sunDirection),
        rawFocus: Object.assign({}, state.rawFocus),
        targetPosition: Object.assign({}, state.targetPosition),
        snappedFocus: Object.assign({}, state.snappedFocus),
        shadowCameraBounds: Object.assign({}, state.shadowCameraBounds),
        stableSnapCell: Object.assign({}, state.stableSnapCell),
        casterCounts: Object.assign({}, state.casterCounts),
        receiverCounts: Object.assign({}, state.receiverCounts),
        warnings: Array.isArray(state.warnings) ? state.warnings.slice() : [],
        renderResidentChunkKeys: state.renderResidentChunkKeys.slice(),
        collisionResidentChunkKeys: state.collisionResidentChunkKeys.slice(),
        shadowResidentChunkKeys: state.shadowResidentChunkKeys.slice(),
        shadowWindowChunkKeys: state.shadowWindowChunkKeys.slice()
      });
    }

    return {
      registerDirectionalLight(light) {
        if (!light || lightEntries.some(function (entry) { return entry.light === light; })) return light;
        const basePosition = light.userData?.shadowBasePosition instanceof THREE.Vector3
          ? light.userData.shadowBasePosition.clone()
          : new THREE.Vector3(num(light.position.x, 0), num(light.position.y, 0), num(light.position.z, 0));
        const baseTarget = light.userData?.shadowBaseTarget instanceof THREE.Vector3
          ? light.userData.shadowBaseTarget.clone()
          : new THREE.Vector3(num(light.target?.position.x, 0), num(light.target?.position.y, 0), num(light.target?.position.z, 0));
        const direction = basePosition.clone().sub(baseTarget);
        if (direction.lengthSq() <= 0.000001) direction.set(0.35, -1, 0.2);
        direction.normalize();
        lightEntries.push({
          light: light,
          basePosition: basePosition,
          baseTarget: baseTarget,
          direction: direction
        });
        if (!light.userData) light.userData = {};
        light.userData.shadowBasePosition = basePosition.clone();
        light.userData.shadowBaseTarget = baseTarget.clone();
        state.lightCount = lightEntries.length;
        state.sunDirection = snapshotValue(direction);
        return light;
      },
      clearDirectionalLights() {
        lightEntries.length = 0;
        updateHistory.length = 0;
        state.policy = null;
        state.enabled = false;
        state.preset = "middel_schaduw";
        state.legacyFieldsIgnored = false;
        state.rendererShadowMapEnabled = false;
        state.lightCount = 0;
        state.sunDirection = { x: 0, y: -1, z: 0 };
        state.focusMode = "editor_world_center_or_selected";
        state.rawFocus = { x: 0, y: 0, z: 0 };
        state.targetPosition = { x: 0, y: 0, z: 0 };
        state.snappedFocus = { x: 0, y: 0, z: 0 };
        state.snapWorldUnits = 0;
        state.mapSize = 0;
        state.cameraSize = 0;
        state.cameraNear = 1;
        state.cameraFar = 0;
        state.shadowMapType = "unknown";
        state.shadowCameraBounds = { left: 0, right: 0, top: 0, bottom: 0, near: 0, far: 0, radius: 0 };
        state.shadowMapSize = 0;
        state.shadowType = "off";
        state.bias = 0;
        state.normalBias = 0;
        state.lastProjectionUpdateReason = "clear";
        state.projectionUpdateCount = 0;
        state.framesSinceProjectionUpdate = 0;
        state.stableSnapCell = { x: 0, z: 0, worldUnits: 0 };
        state.renderResidentChunkKeys = [];
        state.collisionResidentChunkKeys = [];
        state.shadowResidentChunkKeys = [];
        state.shadowWindowChunkKeys = [];
        state.renderResidentChunkCount = 0;
        state.shadowResidentChunkCount = 0;
        state.shadowResidentMarginChunks = 0;
        state.shadowCasterCount = 0;
        state.shadowReceiverCount = 0;
        state.casterCounts = {};
        state.receiverCounts = {};
        state.helperCasterCount = 0;
        state.debugCasterCount = 0;
        state.circleOrPlaneCasterCount = 0;
        state.proxyCasterCount = 0;
        state.instancedCasterCount = 0;
        state.debugShadowCasterCount = 0;
        state.overlayShadowCasterCount = 0;
        state.cameraChildOverlayGroups = 0;
        state.jumpDetected = false;
        state.lastJumpDistance = 0;
        state.shadowRadiusChunks = 0;
        state.projectionSignature = "";
        state.chunkSignature = "";
        state.auditSignature = "";
        state.warnings = [];
        state.signature = "";
        state.lastUpdateReason = "clear";
        state.updatesThisSecond = 0;
      },
      setPolicy(policy) {
        state.policy = policy ? Object.assign({}, policy) : null;
        return state.policy;
      },
      update(nextState = {}, reason = "runtime-sync") {
        const policy = state.policy || currentShadowPolicy();
        const enabled = Boolean(policy?.enabled);
        const preset = normalizeWorldSettingsPreset(policy?.preset || policy?.quality || state.preset || "middel_schaduw", "middel_schaduw");
        const shadowType = enabled ? (policy?.mapTypeName || shadowMapTypeName(policy?.mapType) || "unknown") : "basic";
        const shadowMapSize = enabled ? Math.max(0, num(policy?.mapSize, 0)) : 0;
        const shadowCameraSize = enabled ? Math.max(1, num(policy?.cameraSize, 0)) : 0;
        const shadowCameraNear = enabled ? Math.max(0.1, num(policy?.cameraNear, 1)) : 1;
        const shadowCameraFar = enabled ? Math.max(10, num(policy?.cameraFar, 400)) : 0;
        const shadowBias = enabled ? num(policy?.bias, 0) : 0;
        const shadowNormalBias = enabled ? num(policy?.normalBias, 0) : 0;
        const shadowResidentMarginChunks = enabled ? Math.max(0, chunkInteger(policy?.shadowResidentMarginChunks, 0)) : 0;
        let clampedShadowMapSize = shadowMapSize;
        const warnings = [];
        const maxTextureSize = num(controllerRenderer?.capabilities?.maxTextureSize, 0);
        if (enabled && preset === "extreem_schaduw" && clampedShadowMapSize > 2048 && maxTextureSize > 0 && maxTextureSize < 4096) {
          const nextClamp = Math.min(2048, maxTextureSize);
          if (nextClamp < clampedShadowMapSize) {
            pushUniqueWarning(warnings, "Shadow preset extreem_schaduw clamped to " + nextClamp + " because the renderer reports maxTextureSize " + maxTextureSize + ".");
            clampedShadowMapSize = nextClamp;
          }
        }
        if (enabled && maxTextureSize > 0 && clampedShadowMapSize > maxTextureSize) {
          pushUniqueWarning(warnings, "Shadow map size " + clampedShadowMapSize + " clamped to renderer maxTextureSize " + maxTextureSize + ".");
          clampedShadowMapSize = maxTextureSize;
        }
        const focus = controllerMode === "editor"
          ? resolveStableShadowFocus({
            mode: controllerMode,
            policy: policy,
            groundY: num(world?.ground?.y, 0),
            focus: resolveEditorShadowFocus({
              selectedObject: selectedObjectRoot(),
              worldData: world,
              worldCenter: resolveWorldContentCenter(world),
              groundY: num(world?.ground?.y, 0),
              player: {
                x: num(player.pos.x, 0),
                y: num(player.pos.y, 0),
                z: num(player.pos.z, 0)
              },
              startPosition: {
                x: num(world?.spawn?.x, 0),
                y: num(world?.spawn?.y, num(world?.ground?.y, 0)),
                z: num(world?.spawn?.z, 0)
              },
              previous: state.signature ? state : null,
              snapWorldUnits: policy?.snapWorldUnits || shadowSnapWorldUnitsForPolicy(policy, controllerMode)
            }),
            previous: state.signature ? state : null,
            snapWorldUnits: policy?.snapWorldUnits || shadowSnapWorldUnitsForPolicy(policy, controllerMode)
          })
          : resolveStableShadowFocus({
            mode: controllerMode,
            policy: policy,
            groundY: num(world?.ground?.y, 0),
            player: {
              x: num(player.pos.x, 0),
              y: num(player.pos.y, 0),
              z: num(player.pos.z, 0)
            },
            startPosition: {
              x: num(world?.spawn?.x, 0),
              y: num(world?.spawn?.y, num(world?.ground?.y, 0)),
              z: num(world?.spawn?.z, 0)
            },
            worldCenter: resolveWorldContentCenter(world),
            camera: {
              target: camTarget,
              position: controllerCamera?.position || null
            },
            camTarget: {
              x: num(camTarget.x, 0),
              y: num(camTarget.y, 0),
              z: num(camTarget.z, 0)
            },
            previous: state.signature ? state : null,
            snapWorldUnits: policy?.snapWorldUnits || shadowSnapWorldUnitsForPolicy(policy, controllerMode)
          });
        const renderResidentChunkKeys = sortChunkKeys(Array.isArray(nextState.renderResidentChunkKeys)
          ? nextState.renderResidentChunkKeys
          : Array.isArray(nextState.loadedChunkKeys)
            ? nextState.loadedChunkKeys
            : []);
        const visibleChunkKeys = sortChunkKeys(Array.isArray(nextState.visibleChunkKeys) ? nextState.visibleChunkKeys : []);
        const preloadChunkKeys = sortChunkKeys(Array.isArray(nextState.preloadChunkKeys) ? nextState.preloadChunkKeys : []);
        const forwardChunkKeys = sortChunkKeys(Array.isArray(nextState.forwardChunkKeys) ? nextState.forwardChunkKeys : []);
        const collisionResidentChunkKeys = sortChunkKeys(Array.isArray(nextState.collisionResidentChunkKeys)
          ? nextState.collisionResidentChunkKeys
          : visibleChunkKeys.concat(preloadChunkKeys));
        const coverage = resolveStableShadowChunkWindows({
          mode: controllerMode,
          policy: policy,
          focus: focus,
          renderResidentChunkKeys: renderResidentChunkKeys,
          visibleChunkKeys: visibleChunkKeys,
          preloadChunkKeys: preloadChunkKeys,
          forwardChunkKeys: forwardChunkKeys,
          collisionResidentChunkKeys: collisionResidentChunkKeys
        });
        const shadowRadiusChunks = coverage.shadowRadiusChunks || shadowResidentRadiusChunksForPolicy(policy, controllerMode);
        const shadowWindowChunkKeys = Array.isArray(coverage.shadowWindow?.loadedChunkKeys) ? coverage.shadowWindow.loadedChunkKeys.slice() : [];
        const shadowResidentChunkKeys = Array.isArray(coverage.shadowResidentChunkKeys) ? coverage.shadowResidentChunkKeys.slice() : renderResidentChunkKeys.slice();
        const sunDirection = lightEntries.length
          ? snapshotValue(lightEntries[0].direction)
          : { x: 0, y: -1, z: 0 };
        const rendererShadowMapEnabled = Boolean(enabled && controllerRenderer?.shadowMap);
        if (controllerRenderer?.shadowMap) {
          controllerRenderer.shadowMap.enabled = enabled;
          controllerRenderer.shadowMap.type = shadowMapTypeFromName(shadowType) || THREE.BasicShadowMap;
        }
        const projectionSignature = [
          enabled ? 1 : 0,
          controllerMode,
          preset,
          clampedShadowMapSize,
          shadowType,
          round(focus.snappedFocus.x),
          round(focus.snappedFocus.z),
          shadowCameraSize,
          lightEntries.length,
          rendererShadowMapEnabled ? 1 : 0,
          shadowCameraNear,
          shadowCameraFar,
          shadowBias,
          shadowNormalBias
        ].join("|");
        const auditSignature = [
          enabled ? 1 : 0,
          controllerMode,
          preset,
          clampedShadowMapSize,
          shadowType,
          shadowResidentMarginChunks,
          runtimeStats.sceneObjects || 0,
          controllerScene?.children?.length || 0,
          content?.children?.length || 0,
          terrainRuntimeGroup?.children?.length || 0,
          chunkDebugOverlay?.children?.length || 0,
          selectionHelper?.children?.length || 0,
          transformGuide?.children?.length || 0,
          terrainEditorOverlay?.children?.length || 0,
          scatterEditorOverlay?.children?.length || 0,
          chunkRuntimeRegistryVersion,
          debugHelpersVisibleInCurrentMode() ? 1 : 0,
          debugWarningsVisibleInCurrentMode() ? 1 : 0,
          lightEntries.length
        ].join("|");
        const projectionChanged = projectionSignature !== state.projectionSignature;
        const chunkSignature = [
          renderResidentChunkKeys.join(","),
          shadowResidentChunkKeys.join(","),
          collisionResidentChunkKeys.join(","),
          shadowWindowChunkKeys.join(","),
          shadowRadiusChunks,
          shadowResidentMarginChunks
        ].join("|");
        const chunkChanged = chunkSignature !== state.chunkSignature;
        const auditChanged = auditSignature !== state.auditSignature;
        const now = performance.now();
        if (!projectionChanged && !chunkChanged && !auditChanged) {
          state.lastUpdateReason = reason || state.lastUpdateReason || "runtime-sync";
          state.framesSinceProjectionUpdate += 1;
          pruneUpdateHistory(now);
          return getSnapshot();
        }
        if (projectionChanged) {
          for (const entry of lightEntries) {
            updateLightEntry(entry, focus, enabled, shadowCameraSize, clampedShadowMapSize, shadowBias, shadowNormalBias, shadowCameraNear, shadowCameraFar);
          }
        }
        let sceneUsage = {
          casters: state.shadowCasterCount,
          receivers: state.shadowReceiverCount
        };
        let contentUsage = {
          casters: num(state.casterCounts?.content, 0),
          receivers: num(state.receiverCounts?.content, 0)
        };
        let terrainUsage = {
          casters: num(state.casterCounts?.terrainRuntimeGroup, 0),
          receivers: num(state.receiverCounts?.terrainRuntimeGroup, 0)
        };
        let chunkOverlayUsage = {
          casters: num(state.casterCounts?.chunkDebugOverlay, 0),
          receivers: num(state.receiverCounts?.chunkDebugOverlay, 0)
        };
        let selectionUsage = {
          casters: num(state.casterCounts?.selectionHelper, 0),
          receivers: num(state.receiverCounts?.selectionHelper, 0)
        };
        let transformUsage = {
          casters: num(state.casterCounts?.transformGuide, 0),
          receivers: num(state.receiverCounts?.transformGuide, 0)
        };
        let terrainOverlayUsage = {
          casters: num(state.casterCounts?.terrainEditorOverlay, 0),
          receivers: num(state.receiverCounts?.terrainEditorOverlay, 0)
        };
        let scatterOverlayUsage = {
          casters: num(state.casterCounts?.scatterEditorOverlay, 0),
          receivers: num(state.receiverCounts?.scatterEditorOverlay, 0)
        };
        let helperCasterCount = state.helperCasterCount;
        let debugCasterCount = state.debugCasterCount;
        let circleOrPlaneCasterCount = state.circleOrPlaneCasterCount;
        let proxyCasterCount = state.proxyCasterCount;
        let instancedCasterCount = state.instancedCasterCount;
        let cameraChildOverlayGroups = state.cameraChildOverlayGroups;
        let casterCounts = Object.assign({}, state.casterCounts);
        let receiverCounts = Object.assign({}, state.receiverCounts);
        if (auditChanged) {
          sceneUsage = countShadowUsage(controllerScene);
          contentUsage = countShadowUsage(content);
          terrainUsage = countShadowUsage(terrainRuntimeGroup);
          chunkOverlayUsage = countShadowUsage(chunkDebugOverlay);
          selectionUsage = countShadowUsage(selectionHelper);
          transformUsage = countShadowUsage(transformGuide);
          terrainOverlayUsage = countShadowUsage(terrainEditorOverlay);
          scatterOverlayUsage = countShadowUsage(scatterEditorOverlay);
          const shadowCasterAudit = auditSceneObjectsForShadowCasters({
            scene: controllerScene,
            content: content,
            terrainRuntimeGroup: terrainRuntimeGroup,
            chunkDebugOverlay: chunkDebugOverlay,
            selectionHelper: selectionHelper,
            transformGuide: transformGuide,
            terrainEditorOverlay: terrainEditorOverlay,
            scatterEditorOverlay: scatterEditorOverlay
          });
          proxyCasterCount = 0;
          instancedCasterCount = 0;
          controllerScene.traverse(function (child) {
            if (!child) return;
            if (child.isInstancedMesh === true && child.castShadow === true) instancedCasterCount += 1;
            if (child.castShadow === true) {
              let node = child;
              while (node) {
                if (node.userData?.shadowProxy === true) {
                  proxyCasterCount += 1;
                  return;
                }
                node = node.parent || null;
              }
            }
          });
          casterCounts = {
            scene: sceneUsage.casters,
            content: contentUsage.casters,
            terrainRuntimeGroup: terrainUsage.casters,
            chunkDebugOverlay: chunkOverlayUsage.casters,
            selectionHelper: selectionUsage.casters,
            transformGuide: transformUsage.casters,
            terrainEditorOverlay: terrainOverlayUsage.casters,
            scatterEditorOverlay: scatterOverlayUsage.casters
          };
          receiverCounts = {
            scene: sceneUsage.receivers,
            content: contentUsage.receivers,
            terrainRuntimeGroup: terrainUsage.receivers,
            chunkDebugOverlay: chunkOverlayUsage.receivers,
            selectionHelper: selectionUsage.receivers,
            transformGuide: transformUsage.receivers,
            terrainEditorOverlay: terrainOverlayUsage.receivers,
            scatterEditorOverlay: scatterOverlayUsage.receivers
          };
          helperCasterCount = shadowCasterAudit.helperCasterCount;
          debugCasterCount = shadowCasterAudit.castersByKind.debugOverlay + shadowCasterAudit.castersByKind.helper + shadowCasterAudit.castersByKind.selection;
          circleOrPlaneCasterCount = shadowCasterAudit.circleOrPlaneCasterCount;
          cameraChildOverlayGroups = countCameraChildOverlayGroups();
        }
        const rawFocus = snapshotValue(focus.focus || focus.rawFocus || focus.snappedFocus);
        const targetPosition = lightEntries.length
          ? snapshotValue(lightEntries[0].light?.target?.position || lightEntries[0].baseTarget)
          : snapshotValue(focus.snappedFocus);
        const renderResidentChunkCount = renderResidentChunkKeys.length;
        const shadowResidentChunkCount = shadowResidentChunkKeys.length;
        const snapshot = {
          enabled: enabled,
          mode: controllerMode,
          preset: preset,
          legacyFieldsIgnored: Boolean(policy?.legacyFieldsIgnored),
          rendererShadowMapEnabled: rendererShadowMapEnabled,
          lightCount: lightEntries.length,
          sunDirection: sunDirection,
          focusMode: policy?.focusMode || (controllerMode === "editor" ? "editor_world_center_or_selected" : "player_or_spawn"),
          rawFocus: rawFocus,
          targetPosition: targetPosition,
          snappedFocus: snapshotValue(focus.snappedFocus),
          snapWorldUnits: Math.max(1, Math.floor(num(policy?.snapWorldUnits, shadowSnapWorldUnitsForPolicy(policy, controllerMode)))),
          shadowCameraBounds: {
            left: round(-shadowCameraSize),
            right: round(shadowCameraSize),
            top: round(shadowCameraSize),
            bottom: round(-shadowCameraSize),
            near: round(shadowCameraNear),
            far: round(shadowCameraFar),
            radius: round(shadowCameraSize)
          },
          mapSize: clampedShadowMapSize,
          shadowMapSize: clampedShadowMapSize,
          shadowType: shadowType,
          shadowMapType: shadowType,
          cameraSize: shadowCameraSize,
          cameraNear: shadowCameraNear,
          cameraFar: shadowCameraFar,
          bias: shadowBias,
          normalBias: shadowNormalBias,
          lastProjectionUpdateReason: reason || state.lastProjectionUpdateReason || "runtime-sync",
          projectionUpdateCount: state.projectionUpdateCount,
          framesSinceProjectionUpdate: state.framesSinceProjectionUpdate,
          lastUpdateReason: reason || state.lastUpdateReason || "runtime-sync",
          updatesThisSecond: state.updatesThisSecond,
          stableSnapCell: Object.assign({}, focus.stableSnapCell),
          renderResidentChunkKeys: renderResidentChunkKeys.slice(),
          collisionResidentChunkKeys: collisionResidentChunkKeys.slice(),
          shadowResidentChunkKeys: shadowResidentChunkKeys.slice(),
          shadowWindowChunkKeys: shadowWindowChunkKeys.slice(),
          renderResidentChunkCount: renderResidentChunkCount,
          shadowResidentChunkCount: shadowResidentChunkCount,
          shadowResidentMarginChunks: shadowResidentMarginChunks,
          shadowCasterCount: sceneUsage.casters,
          shadowReceiverCount: sceneUsage.receivers,
          casterCounts: casterCounts,
          receiverCounts: receiverCounts,
          helperCasterCount: helperCasterCount,
          debugCasterCount: debugCasterCount,
          circleOrPlaneCasterCount: circleOrPlaneCasterCount,
          proxyCasterCount: proxyCasterCount,
          instancedCasterCount: instancedCasterCount,
          debugShadowCasterCount: debugCasterCount,
          overlayShadowCasterCount: debugCasterCount,
          cameraChildOverlayGroups: cameraChildOverlayGroups,
          jumpDetected: Boolean(focus.jumpDetected),
          lastJumpDistance: focus.lastJumpDistance,
          shadowRadiusChunks: shadowRadiusChunks,
          warnings: warnings,
          signature: [
            projectionSignature,
            chunkSignature,
            auditSignature,
            sceneUsage.casters,
            sceneUsage.receivers,
            debugCasterCount,
            cameraChildOverlayGroups,
            runtimeStats.sceneObjects || 0
          ].join("|")
        };
        state.enabled = enabled;
        state.mode = controllerMode;
        state.preset = preset;
        state.legacyFieldsIgnored = Boolean(policy?.legacyFieldsIgnored);
        state.rendererShadowMapEnabled = rendererShadowMapEnabled;
        state.lightCount = lightEntries.length;
        state.sunDirection = sunDirection;
        state.focusMode = snapshot.focusMode;
        state.rawFocus = Object.assign({}, snapshot.rawFocus);
        state.targetPosition = targetPosition;
        state.snappedFocus = snapshot.snappedFocus;
        state.snapWorldUnits = snapshot.snapWorldUnits;
        state.shadowCameraBounds = Object.assign({}, snapshot.shadowCameraBounds);
        state.mapSize = clampedShadowMapSize;
        state.shadowMapSize = clampedShadowMapSize;
        state.shadowMapType = shadowType;
        state.shadowType = shadowType;
        state.cameraSize = shadowCameraSize;
        state.cameraNear = shadowCameraNear;
        state.cameraFar = shadowCameraFar;
        state.bias = shadowBias;
        state.normalBias = shadowNormalBias;
        state.stableSnapCell = Object.assign({}, focus.stableSnapCell);
        state.renderResidentChunkKeys = renderResidentChunkKeys.slice();
        state.collisionResidentChunkKeys = collisionResidentChunkKeys.slice();
        state.shadowResidentChunkKeys = shadowResidentChunkKeys.slice();
        state.shadowWindowChunkKeys = shadowWindowChunkKeys.slice();
        state.renderResidentChunkCount = renderResidentChunkCount;
        state.shadowResidentChunkCount = shadowResidentChunkCount;
        state.shadowResidentMarginChunks = shadowResidentMarginChunks;
        state.shadowCasterCount = sceneUsage.casters;
        state.shadowReceiverCount = sceneUsage.receivers;
        state.casterCounts = Object.assign({}, casterCounts);
        state.receiverCounts = Object.assign({}, receiverCounts);
        state.helperCasterCount = helperCasterCount;
        state.debugCasterCount = debugCasterCount;
        state.circleOrPlaneCasterCount = circleOrPlaneCasterCount;
        state.proxyCasterCount = proxyCasterCount;
        state.instancedCasterCount = instancedCasterCount;
        state.debugShadowCasterCount = debugCasterCount;
        state.overlayShadowCasterCount = debugCasterCount;
        state.cameraChildOverlayGroups = cameraChildOverlayGroups;
        state.jumpDetected = Boolean(focus.jumpDetected);
        state.lastJumpDistance = focus.lastJumpDistance;
        state.shadowRadiusChunks = shadowRadiusChunks;
        state.projectionSignature = projectionSignature;
        state.chunkSignature = chunkSignature;
        state.auditSignature = auditSignature;
        state.warnings = warnings.slice();
        if (projectionChanged) state.lastProjectionUpdateReason = reason || state.lastProjectionUpdateReason || "runtime-sync";
        state.lastUpdateReason = reason || state.lastUpdateReason || "runtime-sync";
        if (projectionChanged) {
          updateHistory.push(now);
          state.projectionUpdateCount += 1;
          state.framesSinceProjectionUpdate = 0;
        } else {
          state.framesSinceProjectionUpdate += 1;
        }
        state.signature = snapshot.signature;
        pruneUpdateHistory(now);
        return getSnapshot();
      },
      getSnapshot() {
        return getSnapshot();
      }
    };
  }

  stableSunShadowController = createStableSunShadowController({ mode: mode, scene: scene, renderer: renderer, camera: camera });

  function staticPropShadowOptions() {
    const policy = currentShadowPolicy();
    const shadowEnabled = policy.enabled === true;
    return {
      castShadow: shadowEnabled && policy.staticPropsCast === true,
      receiveShadow: shadowEnabled && policy.staticPropsReceive !== false
    };
  }

  function scatterShadowOptions() {
    const policy = currentShadowPolicy();
    const shadowsEnabled = policy.enabled === true;
    return {
      castShadow: shadowsEnabled && policy.scatterCast === true,
      receiveShadow: shadowsEnabled && policy.scatterReceive !== false
    };
  }

  function groundShadowOptions() {
    const policy = currentShadowPolicy();
    return {
      receiveShadow: policy.enabled === true && policy.groundReceives !== false
    };
  }

  function terrainShadowOptions() {
    const policy = currentShadowPolicy();
    return {
      receiveShadow: policy.enabled === true && policy.terrainReceives !== false
    };
  }

  function chunkKeyForTransform(transform, policy) {
    if (!policy) return null;
    const position = transform?.position || {};
    const x = Number(position.x);
    const z = Number(position.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return chunkKeyForPosition(x, z, policy);
  }

  function groupEntriesByChunkKey(entries, policy, getTransform) {
    const grouped = new Map();
    const unchunked = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      const transform = typeof getTransform === "function" ? getTransform(entry) : null;
      const key = chunkKeyForTransform(transform, policy);
      if (!key) {
        unchunked.push(entry);
        continue;
      }
      let bucket = grouped.get(key);
      if (!bucket) {
        bucket = [];
        grouped.set(key, bucket);
      }
      bucket.push(entry);
    }
    return { grouped: grouped, unchunked: unchunked };
  }

  function resolveShadowAnchorTarget(nextState) {
    const snapshot = stableSunShadowController?.getSnapshot?.() || null;
    if (snapshot) {
      return {
        mode: snapshot.enabled ? "stableSun" : "static",
        x: num(snapshot.snappedFocus?.x, 0),
        z: num(snapshot.snappedFocus?.z, 0),
        lastUpdatedReason: snapshot.lastUpdateReason || "runtime-sync"
      };
    }
    const policy = resolveChunkPolicy(world, mode);
    const editorFocus = mode === "editor"
      ? resolveEditorShadowFocus({
        selectedObject: selectedObjectRoot(),
        worldData: world,
        worldCenter: resolveWorldContentCenter(world),
        groundY: num(world?.ground?.y, 0),
        player: {
          x: num(player.pos.x, 0),
          y: num(player.pos.y, 0),
          z: num(player.pos.z, 0)
        },
        startPosition: {
          x: num(world?.spawn?.x, 0),
          y: num(world?.spawn?.y, num(world?.ground?.y, 0)),
          z: num(world?.spawn?.z, 0)
        }
      })
      : null;
    const focus = resolveStableShadowFocus({
      mode: mode,
      policy: policy,
      focus: editorFocus || undefined,
      camera: {
        target: camTarget,
        position: camera?.position || null
      },
      player: {
        x: num(player.pos.x, 0),
        y: num(player.pos.y, 0),
        z: num(player.pos.z, 0)
      },
      camTarget: {
        x: num(camTarget.x, 0),
        y: num(camTarget.y, 0),
        z: num(camTarget.z, 0)
      },
      previous: shadowAnchorState,
      snapWorldUnits: shadowSnapWorldUnitsForPolicy(policy, mode)
    });
    return {
      mode: focus.mode,
      x: focus.snappedFocus.x,
      z: focus.snappedFocus.z,
      lastUpdatedReason: "stable-fallback"
    };
  }

  function updateShadowAnchor(nextState, reason = "runtime-sync") {
    const snapshot = stableSunShadowController?.update?.(nextState || {}, reason || "runtime-sync") || null;
    if (!snapshot) {
      const target = resolveShadowAnchorTarget(nextState);
      const anchorKey = [
        target.mode,
        Math.round(target.x * 100) / 100,
        Math.round(target.z * 100) / 100
      ].join("|");
      if (anchorKey === groundShadowAnchorKey) return shadowAnchorState;
      groundShadowAnchorKey = anchorKey;
      shadowAnchorState = {
        mode: target.mode,
        x: round(target.x),
        z: round(target.z),
        lastUpdatedReason: reason || target.lastUpdatedReason || "runtime-sync"
      };
      return shadowAnchorState;
    }
    const anchorKey = [
      snapshot.mode || mode,
      round(num(snapshot.snappedFocus?.x, 0)),
      round(num(snapshot.snappedFocus?.z, 0)),
      snapshot.shadowMapSize || 0,
      snapshot.shadowRadiusChunks || 0
    ].join("|");
    if (anchorKey !== groundShadowAnchorKey) groundShadowAnchorKey = anchorKey;
    shadowAnchorState = {
      mode: snapshot.enabled ? "stableSun" : "static",
      x: round(num(snapshot.snappedFocus?.x, 0)),
      z: round(num(snapshot.snappedFocus?.z, 0)),
      lastUpdatedReason: snapshot.lastUpdateReason || reason || "runtime-sync"
    };
    return snapshot;
  }

  function shouldBatchStaticProps() {
    return mode === "game" && activeModePerformance().batchStaticProps !== false;
  }

  function shouldBatchScatterProps() {
    return mode === "game" && activeModePerformance().batchScatterProps !== false;
  }

  if (mode === "editor") {
    orbitControls = new OrbitControls(camera, canvas);
    orbitControls.zoomSpeed = 6.0; 
    orbitControls.enableDamping = false;
    orbitControls.dampingFactor = 0.08;
    orbitControls.screenSpacePanning = true;
    orbitControls.minPolarAngle = 0.001;
    orbitControls.maxPolarAngle = Math.PI - 0.001;
    updateOrbitMouseMapping();
    orbitControls.enableKeys = false;
    orbitControls.addEventListener("change", requestRender);
    selectionHelper = new THREE.BoxHelper(new THREE.Object3D(), 0x7bd4ff);
    selectionHelper.visible = false;
    selectionHelper.material.depthTest = false;
    selectionHelper.material.depthWrite = false;
    selectionHelper.material.transparent = true;
    selectionHelper.material.opacity = 0.9;
    selectionHelper.material.toneMapped = false;
    selectionHelper.renderOrder = 999;
    selectionHelper.raycast = function () {};
    markDebugOverlayTree(selectionHelper, "selection");
    sanitizeNonWorldShadowCasters(selectionHelper);
    scene.add(selectionHelper);
    transformGuide = createTransformGuide();
    sanitizeNonWorldShadowCasters(transformGuide);
    scene.add(transformGuide);
    terrainEditorOverlay = createTerrainOverlay();
    sanitizeNonWorldShadowCasters(terrainEditorOverlay);
    scene.add(terrainEditorOverlay);
    scatterEditorOverlay = createScatterOverlay();
    sanitizeNonWorldShadowCasters(scatterEditorOverlay);
    scene.add(scatterEditorOverlay);
    editorPointerDownCaptureHandler = function (event) {
      if (!orbitControls) return;
      rememberEditorPointer(event);
      if (viewportPanSession && event.pointerId === viewportPanSession.pointerId) return;
      if (transformSession) {
        if (event.button === 2) {
          event.preventDefault();
          event.stopImmediatePropagation();
          cancelTransform();
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.button === 0 && event.shiftKey && !transformState.active) {
        if (beginViewportPan(event)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
      }
      if (event.button === 0 && event.altKey && !transformState.active) {
        viewportOrbitFallbackActive = true;
        orbitControls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        orbitControls.mouseButtons.RIGHT = THREE.MOUSE.NONE;
        orbitControls.mouseButtons.MIDDLE = modifierState.ctrlKey ? THREE.MOUSE.DOLLY : THREE.MOUSE.ROTATE;
        event.preventDefault();
        return;
      }
      if (event.button === 1) {
        updateOrbitMouseMapping(event.ctrlKey || event.metaKey);
        event.preventDefault();
        // MMB is mapped to ROTATE, but OrbitControls itself swaps ROTATE for PAN whenever
        // shiftKey is held on the initiating pointerdown (see its onMouseDown). Shift is now
        // also the fly-camera sprint modifier, so neutralize it here to keep MMB orbiting.
        if (event.shiftKey) {
          try {
            Object.defineProperty(event, "shiftKey", { value: false, configurable: true });
          } catch {}
        }
      }
    };
    editorContextMenuHandler = function (event) {
      event.preventDefault();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
      if (transformSession) cancelTransform();
    };
    editorAuxClickHandler = function (event) {
      if (event.button !== 1) return;
      event.preventDefault();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    };
    editorKeyDownHandler = function (event) {
      if (event.key === "Control" || event.key === "Meta") {
        modifierState.ctrlKey = true;
        updateOrbitMouseMapping();
        applyTransformSnapState();
      }
      if (event.key === "Shift") {
        modifierState.shiftKey = true;
      }
      if (EDITOR_FLY_CAMERA_CODES.has(event.code) && !event.ctrlKey && !event.metaKey && !isEditableEventTarget(event.target)) {
        event.preventDefault();
        if (!flyCameraKeys.has(event.code)) {
          flyCameraKeys.add(event.code);
          requestRender("fly-camera-start");
        }
      }
    };
    editorKeyUpHandler = function (event) {
      if (event.key === "Control" || event.key === "Meta") {
        modifierState.ctrlKey = false;
        updateOrbitMouseMapping();
        applyTransformSnapState();
      }
      if (event.key === "Shift") {
        modifierState.shiftKey = false;
      }
      flyCameraKeys.delete(event.code);
    };
    editorWindowBlurHandler = function () {
      flyCameraKeys.clear();
      modifierState.shiftKey = false;
    };
    canvas.addEventListener("pointerdown", editorPointerDownCaptureHandler, true);
    canvas.addEventListener("contextmenu", editorContextMenuHandler);
    canvas.addEventListener("auxclick", editorAuxClickHandler);
    window.addEventListener("keydown", editorKeyDownHandler);
    window.addEventListener("keyup", editorKeyUpHandler);
    window.addEventListener("blur", editorWindowBlurHandler);
    editorDirectPointerMoveHandler = handleTransformPointerMove;
    editorDirectPointerUpHandler = handleTransformPointerUp;
    editorDirectMouseMoveHandler = handleTransformPointerMove;
    editorDirectMouseUpHandler = handleTransformPointerUp;
    canvas.addEventListener("pointermove", editorDirectPointerMoveHandler, true);
    canvas.addEventListener("pointerup", editorDirectPointerUpHandler, true);
    canvas.addEventListener("pointercancel", editorDirectPointerUpHandler, true);
    window.addEventListener("pointermove", editorDirectPointerMoveHandler, true);
    window.addEventListener("pointerup", editorDirectPointerUpHandler, true);
    window.addEventListener("pointercancel", editorDirectPointerUpHandler, true);
    canvas.addEventListener("mousemove", editorDirectMouseMoveHandler, true);
    canvas.addEventListener("mouseup", editorDirectMouseUpHandler, true);
    window.addEventListener("mousemove", editorDirectMouseMoveHandler, true);
    window.addEventListener("mouseup", editorDirectMouseUpHandler, true);
    editorPointerUpCaptureHandler = function (event) {
      rememberEditorPointer(event);
      if (viewportPanSession && event.pointerId === viewportPanSession.pointerId) {
        handleViewportPanUp(event);
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (viewportOrbitFallbackActive && event.button === 0) {
        viewportOrbitFallbackActive = false;
        updateOrbitMouseMapping();
        event.preventDefault();
        return;
      }
      if (event.button !== 1) return;
      updateOrbitMouseMapping();
    };
    canvas.addEventListener("pointerup", editorPointerUpCaptureHandler, true);
    canvas.addEventListener("pointercancel", editorPointerUpCaptureHandler, true);
    editorPointerDownHandler = function (event) {
      rememberEditorPointer(event);
      if (event.button !== 0) return;
      if (event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;
      if (transformSession) return;
      const entityId = pickEntity(event);
      if (entityId) {
        selectEntity(entityId);
      }
      onSelectEntity(entityId || null);
    };
    canvas.addEventListener("pointerdown", editorPointerDownHandler);
} else {
    buildHud();

    // --- 1. MUIS BESTURING (Klikken & Vasthouden) ---
    let isSpelerMuisIngedrukt = false;
    let muisSchermX = 0;
    let muisSchermY = 0;
    let activeGamePointerId = null;

    function beginGamePointerCapture(event) {
      if (activeGamePointerId !== null && event.pointerId !== activeGamePointerId) return false;
      activeGamePointerId = event.pointerId;
      if (typeof canvas.setPointerCapture === "function" && event.pointerId !== undefined) {
        try { canvas.setPointerCapture(event.pointerId); } catch {}
      }
      return true;
    }

    function endGamePointerCapture(event) {
      const pointerId = event?.pointerId !== undefined ? event.pointerId : activeGamePointerId;
      if (pointerId !== undefined && pointerId !== null && activeGamePointerId !== null && pointerId !== activeGamePointerId) return;
      isSpelerMuisIngedrukt = false;
      activeGamePointerId = null;
      if (typeof canvas.releasePointerCapture === "function" && pointerId !== undefined && pointerId !== null) {
        try { canvas.releasePointerCapture(pointerId); } catch {}
      }
    }

    // NIEUW: Een kleine loop die het doelwit constant ververst
    function updateMuisDoelwit() {
      if (!isSpelerMuisIngedrukt) return; // Stop de loop als de knop los is

      // Bereken opnieuw waar de muis NU naar wijst
      const ground = screenToGround(muisSchermX, muisSchermY);
      if (ground) {
        clickTarget = new THREE.Vector3(ground.x, player.pos.y, ground.z);
      }

      // Vraag de browser om dit de volgende frame weer te doen
      requestAnimationFrame(updateMuisDoelwit);
    }

    if (!externalPlayerAuthority) {
      gamePointerDownHandler = function (event) {
        if (event.button !== 0 && event.button !== undefined && event.pointerType !== "touch") return;
        if (!beginGamePointerCapture(event)) return;

        isSpelerMuisIngedrukt = true;
        muisSchermX = event.clientX;
        muisSchermY = event.clientY;

        const inter = pickInteractable(event);
        if (inter) {
          triggerInteractable(inter);
          endGamePointerCapture(event);
          return;
        }

        pressedKeys.clear();
        updateMuisDoelwit();
      };

      let gamePointerMoveHandler = function (event) {
        if (!isSpelerMuisIngedrukt) return;
        if (activeGamePointerId !== null && event.pointerId !== activeGamePointerId) return;
        muisSchermX = event.clientX;
        muisSchermY = event.clientY;
      };

      let gamePointerUpHandler = function (event) {
        if (activeGamePointerId !== null && event.pointerId !== activeGamePointerId) return;
        endGamePointerCapture(event);
      };

      canvas.addEventListener("pointerdown", gamePointerDownHandler);
      canvas.addEventListener("pointermove", gamePointerMoveHandler);
      window.addEventListener("pointerup", gamePointerUpHandler);
      window.addEventListener("pointercancel", gamePointerUpHandler);

      // --- 2. TOETSENBORD BESTURING (WASD & Muiswiel) ---
      gameKeyDownHandler = function (event) {
        pressedKeys.add(event.code);
        const action = keyToAction.get(event.code);
        if (action === "interact" && activeInteractable) { triggerInteractable(activeInteractable); event.preventDefault(); }

        if (action === "cancel") {
          clickTarget = null;
          isSpelerMuisIngedrukt = false;
        }

        if (action === "zoom_in") setZoom(camDistance - 4);
        if (action === "zoom_out") setZoom(camDistance + 4);

        if (movementActionFor(event.code)) {
          clickTarget = null;
          isSpelerMuisIngedrukt = false;
        }
      };

      gameKeyUpHandler = function (event) {
        pressedKeys.delete(event.code);
      };

      window.addEventListener("keydown", gameKeyDownHandler);
      window.addEventListener("keyup", gameKeyUpHandler);
    }

    // Muiswiel-zoom is een camera-only control (geen player movement), dus die moet ook
    // geregistreerd worden wanneer de server autoritatief is over de spelerpositie
    // (externalPlayerAuthority) - anders werken min/max zoom nooit in de gepubliceerde game.
    gameWheelHandler = function (event) {
      event.preventDefault();
      setZoom(camDistance + Math.sign(event.deltaY) * 4);
    };
    canvas.addEventListener("wheel", gameWheelHandler, { passive: false });
  }

  function movementActionFor(code) {
    const action = keyToAction.get(code);
    return action === "move_forward" || action === "move_back" || action === "move_left" || action === "move_right";
  }

  function updateOrbitMouseMapping(forceCtrl) {
    if (!orbitControls) return;
    if (forceCtrl !== undefined) modifierState.ctrlKey = Boolean(forceCtrl);
    orbitControls.mouseButtons.LEFT = THREE.MOUSE.NONE;
    orbitControls.mouseButtons.RIGHT = THREE.MOUSE.NONE;
    orbitControls.mouseButtons.MIDDLE = modifierState.ctrlKey ? THREE.MOUSE.DOLLY : THREE.MOUSE.ROTATE;
  }

  function rememberEditorPointer(event) {
    if (!event || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    lastEditorPointer = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId
    };
  }

  function pointerFromClientPoint(clientX, clientY, buttonOverride) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      y: -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
      button: buttonOverride !== undefined ? buttonOverride : 0
    };
  }

  function configureCallbacks(callbacks) {
    onSelectEntity = callbacks.onSelectEntity || onSelectEntity;
    onTransformCommit = callbacks.onTransformCommit || onTransformCommit;
    onTransformEnd = callbacks.onTransformEnd || onTransformEnd;
    onTransformChange = callbacks.onTransformChange || onTransformChange;
    onModelLoadTiming = callbacks.onModelLoadTiming || onModelLoadTiming;
  }

  function updateDebugLoopState() {
    DEBUG_RUNTIME.activeLoopCount = rafId !== null || running ? 1 : 0;
    DEBUG_RUNTIME.running = running;
    DEBUG_RUNTIME.loopGeneration = loopGeneration;
  }

  function pushRenderReason(reason) {
    const entry = reason || "render";
    DEBUG_RUNTIME.lastRenderReasons.unshift(entry);
    if (DEBUG_RUNTIME.lastRenderReasons.length > 12) DEBUG_RUNTIME.lastRenderReasons.length = 12;
  }

  function requestRender(reason) {
    if (disposed) return;
    renderRequested = true;
    pushRenderReason(reason);
    if (rafId === null) startRenderLoop(reason);
  }

  function startRenderLoop(reason) {
    if (disposed || rafId !== null) return;
    running = true;
    loopGeneration += 1;
    updateDebugLoopState();
    rafId = requestAnimationFrame(renderFrame);
    if (reason) DEBUG_RUNTIME.lastStartReason = reason;
  }

  function stopRenderLoop(reason) {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    running = false;
    renderRequested = false;
    lastTime = 0;
    updateDebugLoopState();
    if (reason) DEBUG_RUNTIME.lastStopReason = reason;
  }

  function handleResize(reason) {
    if (disposed) return false;
    const rect = resizeTarget && typeof resizeTarget.getBoundingClientRect === "function"
      ? resizeTarget.getBoundingClientRect()
      : null;
    const width = Math.max(0, Math.floor(rect ? rect.width : canvas.clientWidth));
    const height = Math.max(0, Math.floor(rect ? rect.height : canvas.clientHeight));
    if (width <= 0 || height <= 0) return false;
    const ratio = Math.min(window.devicePixelRatio || 1, activeModePerformance().pixelRatioCap);
    if (width === lastResizeWidth && height === lastResizeHeight && ratio === lastResizePixelRatio) return false;
    const beforePosition = DEBUG_RUNTIME.enabled ? camera.position.clone() : null;
    const beforeTarget = DEBUG_RUNTIME.enabled && orbitControls ? orbitControls.target.clone() : null;
    lastResizeWidth = width;
    lastResizeHeight = height;
    lastResizePixelRatio = ratio;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    DEBUG_RUNTIME.resizeCount += 1;
    if (DEBUG_RUNTIME.enabled && beforePosition) {
      const afterPosition = camera.position.clone();
      const afterTarget = orbitControls ? orbitControls.target.clone() : null;
      DEBUG_RUNTIME.lastResizeSnapshot = {
        reason: reason || "resize",
        before: {
          position: { x: beforePosition.x, y: beforePosition.y, z: beforePosition.z },
          target: beforeTarget ? { x: beforeTarget.x, y: beforeTarget.y, z: beforeTarget.z } : null
        },
        after: {
          position: { x: afterPosition.x, y: afterPosition.y, z: afterPosition.z },
          target: afterTarget ? { x: afterTarget.x, y: afterTarget.y, z: afterTarget.z } : null
        }
      };
      if (beforePosition.distanceTo(afterPosition) > 0.0001 || (beforeTarget && afterTarget && beforeTarget.distanceTo(afterTarget) > 0.0001)) {
        DEBUG_RUNTIME.lastResizeSnapshot.warning = "camera position/target changed unexpectedly";
      }
    }
    requestRender(reason || "resize");
    return true;
  }

  function scheduleResize(reason) {
    if (disposed) return;
    pendingResizeReason = reason || "resize";
    if (resizeRafId !== null) return;
    resizeRafId = requestAnimationFrame(function () {
      resizeRafId = null;
      handleResize(pendingResizeReason);
    });
  }

  function renderFrame(time) {
    renderRequested = false;
    rafId = null;
    running = true;
    updateDebugLoopState();
    if (disposed) {
      running = false;
      updateDebugLoopState();
      return;
    }
    DEBUG_RUNTIME.renderCount += 1;
    const previousFrameTime = Number(lastTime) || time;
    const frameMs = Math.max(0, Math.min(1000, time - previousFrameTime));
    const rawDelta = frameMs / 1000;
    const delta = Math.min(0.05, rawDelta);
    const animationDelta = rawDelta;
    lastTime = time;
    perfHudFrameMs = perfHudWarmup ? perfHudFrameMs * 0.85 + frameMs * 0.15 : frameMs;
    perfHudWarmup = true;
    collisionPerfState.checksLastFrame = 0;
    collisionPerfState.lastResolveMs = 0;
    const frameTiming = {
      frameMs: round(frameMs),
      deltaMs: round(delta * 1000),
      animationDeltaMs: round(animationDelta * 1000),
      updatePlayerMs: 0,
      animationMs: 0,
      syncChunkMs: 0,
      renderMs: 0,
      hudMs: 0,
      shouldAnimateModels: false,
      shouldAnimateSurfaces: false
    };
    const modePerformance = activeModePerformance();
    const shouldAnimateModels = mode === "game" || (mode === "editor" && previewAnimations && animationMixers.size > 0);
    const shouldAnimateSurfaces = surfaceAnimMaterials.length > 0 && (mode !== "game" || modePerformance.surfaceAnimationEnabled !== false) && (mode === "game" || mode === "editor");
    const shouldFlyCamera = mode === "editor" && flyCameraKeys.size > 0;
    const shouldAnimate = shouldAnimateModels || shouldAnimateSurfaces || shouldFlyCamera;
    frameTiming.shouldAnimateModels = shouldAnimateModels;
    frameTiming.shouldAnimateSurfaces = shouldAnimateSurfaces;
    let sectionStart = performance.now();
    if (shouldAnimateModels) {
      for (const { mixer, root } of animationMixers.values()) {
        if (root?.visible === false || root?.parent?.visible === false) continue;
        mixer.update(animationDelta);
      }
    }
    if (shouldAnimateSurfaces) updateSurfaceAnimation(time);
    frameTiming.animationMs = round(performance.now() - sectionStart);
    sectionStart = performance.now();
    if (selectionHelper?.visible) selectionHelper.update();
    if (transformGuide?.visible) updateTransformGuide();
    if (mode === "game") updatePlayer(delta);
    if (shouldFlyCamera) updateFlyCamera(delta);
    frameTiming.updatePlayerMs = round(performance.now() - sectionStart);
    sectionStart = performance.now();
    const chunkPolicy = resolveChunkPolicy(world, mode);
    let shouldSyncChunkState = true;
    if (mode === "game" && !debugHelpersVisibleInCurrentMode()) {
      shouldSyncChunkState = residentContentState.pendingChunkKeys.length > 0
        || hasPendingObjectResidencyWork()
        || buildChunkFrameSyncSignature(chunkPolicy) !== chunkDebugSignature;
    }
    if (shouldSyncChunkState) syncChunkDebugState("frame");
    if (residentContentState.pendingChunkKeys.length) requestRender("resident-pending-drain");
    frameTiming.syncChunkMs = round(performance.now() - sectionStart);
    sectionStart = performance.now();
    renderer.render(scene, camera);
    frameTiming.renderMs = round(performance.now() - sectionStart);
    sectionStart = performance.now();
    if (mode === "game") updatePerformanceHud(time);
    frameTiming.hudMs = round(performance.now() - sectionStart);
    frameTiming.updateAnimationMs = frameTiming.animationMs;
    frameTiming.syncChunkDebugStateMs = frameTiming.syncChunkMs;
    frameTiming.updatePerformanceHudMs = frameTiming.hudMs;
    DEBUG_RUNTIME.lastFrameTiming = frameTiming;
    settleFrameProfileWaiters(frameTiming);
    running = false;
    updateDebugLoopState();
    if (mode === "game") {
      startRenderLoop("game");
    } else if (shouldAnimate) {
      startRenderLoop("preview");
    } else if (renderRequested) {
      startRenderLoop("follow-up");
    }
  }

  function clearContent() {
    clearTerrainEditorOverlay();
    clearScatterEditorOverlay();
    clearChunkDebugOverlay();
    clearTerrainRuntimeVisuals();
    removeDuplicateRuntimeGroups();
    clearWalkabilityIndex();
    resetRuntimeStats();
    viewportPanSession = null;
    selectedEntityId = null;
    selectedRoot = null;
    transformSession = null;
    transformState.active = false;
    transformState.cancelled = false;
    transformState.object = null;
    transformState.rootId = null;
    transformState.start = null;
    transformState.axis = null;
    transformState.startPointer = null;
    transformState.currentPointer = null;
    if (selectionHelper) selectionHelper.visible = false;
    if (selectionHelper) selectionHelper.object = null;
    if (transformGuide) transformGuide.visible = false;
    if (orbitControls) orbitControls.enabled = true;
    for (const { mixer, root } of animationMixers.values()) {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    }
    animationMixers.clear();
    for (const child of Array.from(content.children)) {
      content.remove(child);
      disposeObject(child, { disposeTextures: false });
    }
    entityRoots.clear();
    contentBlueprintIndex = createEmptyContentBlueprintIndex();
    residentContentState = createEmptyResidentContentState();
    resetResidencyTrackers();
    residentBootstrapState = {
      lastReason: "clearContent",
      worldGeneration: worldBuildGeneration,
      activeBuiltImmediately: 0,
      visibleBuiltImmediately: 0,
      preloadBuiltImmediately: 0,
      pendingAfterBootstrap: 0,
      emptyScenePrevented: true
    };
    chunkRuntimeEntries.length = 0;
    chunkRuntimeRegistryVersion = 0;
    solids.length = 0;
    activeSolids.length = 0;
    interactables.length = 0;
    activeInteractable = null;
    player.root = null;
    player.nameplateRoot = null;
    player.animationState = "idle";
    player.reconcileActive = false;
    player.reconcileElapsedMs = 0;
    player.pendingState = null;
    clearRemotePlayers();
    loadErrors.length = 0;
    perfHudNextUpdateAt = 0;
    perfHudFrameMs = 0;
    perfHudWarmup = false;
    runtimeCollisionBaseCount = 0;
    publishedWorldItemCount = 0;
    collisionPerfState.activeSolids = 0;
    collisionPerfState.terrainBlockers = 0;
    collisionPerfState.surfaceBlockers = 0;
    collisionPerfState.checksLastFrame = 0;
    collisionPerfState.lastResolveMs = 0;
    chunkSyncStats.syncCalls = 0;
    chunkSyncStats.heavySyncCalls = 0;
    chunkSyncStats.skippedSyncCalls = 0;
    chunkSyncStats.lastHeavyReason = "clearContent";
    chunkSyncStats.lastHeavySyncMs = 0;
    chunkDebugStateCache = null;
    chunkDebugSignature = "";
    scatterShadowFallbacks = 0;
    chunkRuntimeState = {
      policy: null,
      centerChunk: null,
      loadedChunkKeys: [],
      renderChunkKeys: [],
      shadowResidentChunkKeys: [],
      collisionResidentChunkKeys: [],
      shadowWindowChunkKeys: [],
      activeChunkKeys: [],
      preloadChunkKeys: [],
      visibleChunkKeys: [],
      forwardChunkKeys: [],
      unloadSafeChunkKeys: [],
      desiredResidentChunkKeys: [],
      presenceChunkKey: null,
      presenceChunkDistance: null,
      presenceChunkAccepted: false,
      streamingCoverageSource: "none",
      clippedByMaxLoadedChunks: false,
      requiredActiveChunks: 0,
      clippedActiveChunks: 0,
      activeRadiusUnmet: false,
      hiddenObjects: 0,
      visibleObjects: 0,
      inactiveInteractables: 0,
      inactiveSolids: 0,
      culledEntities: 0,
      culledScatter: 0,
      culledInteractables: 0,
      culledSolids: 0,
      uncullableObjects: 0,
      terrainVisuals: createEmptyTerrainVisualStats(),
      ground: cloneGroundChunkStats(),
      terrainStreaming: Object.assign({}, terrainStreamingState, {
        residentChunkKeys: terrainStreamingState.residentChunkKeys.slice()
      }),
      keepSelectedChunkLoadedApplied: false,
      cullingEnabled: false,
      lastSignature: "",
      lastUpdateReason: "clearContent"
    };
    if (stableSunShadowController?.clearDirectionalLights) stableSunShadowController.clearDirectionalLights();
    groundShadowAnchorKey = "";
    shadowAnchorState = {
      mode: "static",
      x: 0,
      z: 0,
      lastUpdatedReason: "clearContent"
    };
    overlayDiagnosticsState = {
      debugOverlayEnabled: false,
      chunkDebugOverlayVisible: false,
      terrainRuntimeGroups: 0,
      chunkDebugOverlayGroups: 0,
      cameraChildOverlayGroups: 0,
      sceneDebugOverlayGroups: 0,
      sceneChildOverlayGroups: 0,
      duplicateOverlayFound: false,
      removedDuplicateOverlays: 0,
      removedOverlayGroups: 0,
      overlayShadowCasters: 0
    };
  }

  function captureViewState() {
    if (mode !== "editor") return null;
    return {
      cameraPosition: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      cameraTarget: orbitControls ? { x: orbitControls.target.x, y: orbitControls.target.y, z: orbitControls.target.z } : null,
      cameraFov: camera.fov,
      cameraUp: { x: camera.up.x, y: camera.up.y, z: camera.up.z },
      orbitMinDistance: orbitControls ? orbitControls.minDistance : null,
      orbitMaxDistance: orbitControls ? orbitControls.maxDistance : null,
      selectedEntityId: selectedEntityId,
      gizmoMode: transformState.mode === "move" ? "translate" : (transformState.mode || "translate"),
      localViewActive: localViewActive
    };
  }

  function restoreViewState(viewState) {
    if (mode !== "editor" || !viewState) return false;
    if (orbitControls && viewState.cameraPosition && viewState.cameraTarget) {
      camera.position.set(viewState.cameraPosition.x, viewState.cameraPosition.y, viewState.cameraPosition.z);
      orbitControls.target.set(viewState.cameraTarget.x, viewState.cameraTarget.y, viewState.cameraTarget.z);
      orbitControls.update();
    }
    if (Number.isFinite(Number(viewState.cameraFov))) {
      camera.fov = num(viewState.cameraFov, camera.fov);
      camera.updateProjectionMatrix();
    }
    if (viewState.cameraUp && Number.isFinite(Number(viewState.cameraUp.x)) && Number.isFinite(Number(viewState.cameraUp.y)) && Number.isFinite(Number(viewState.cameraUp.z))) {
      camera.up.set(viewState.cameraUp.x, viewState.cameraUp.y, viewState.cameraUp.z);
    }
    if (orbitControls && Number.isFinite(Number(viewState.orbitMinDistance)) && Number.isFinite(Number(viewState.orbitMaxDistance))) {
      orbitControls.minDistance = num(viewState.orbitMinDistance, orbitControls.minDistance);
      orbitControls.maxDistance = num(viewState.orbitMaxDistance, orbitControls.maxDistance);
    }
    selectedEntityId = viewState.selectedEntityId || null;
    refreshSelectedRootReference();
    if (viewState.gizmoMode) {
      transformState.mode = viewState.gizmoMode === "translate" ? "move" : viewState.gizmoMode;
    }
    transformSession = null;
    transformAxisConstraint = null;
    localViewActive = Boolean(viewState.localViewActive);
    applyLocalView();
    updateSelectionHelper();
    removeGhostChunkPlanes("restoreViewState", {
      scene: scene,
      camera: camera,
      content: content,
      terrainRuntimeGroup: terrainRuntimeGroup,
      chunkDebugOverlay: chunkDebugOverlay,
      selectionHelper: selectionHelper,
      transformGuide: transformGuide,
      terrainEditorOverlay: terrainEditorOverlay,
      scatterEditorOverlay: scatterEditorOverlay,
      world: world,
      debugOverlayVisible: Boolean(activeModePerformance().debugChunkOverlayVisible === true && resolveChunkPolicy(world, mode)?.debugOverlay === true)
    });
    requestRender();
    return true;
  }

  function rootForSelectableId(entityId) {
    if (!entityId) return null;
    if (entityRoots.has(entityId)) return entityRoots.get(entityId) || null;
    if (player.root?.userData?.playerId === entityId) return player.root;
    return null;
  }

  function refreshSelectedRootReference() {
    if (!selectedEntityId) {
      selectedRoot = null;
      return null;
    }
    const freshRoot = rootForSelectableId(selectedEntityId);
    selectedRoot = freshRoot || null;
    if (!freshRoot) selectedEntityId = null;
    return freshRoot;
  }

  function selectableIdForObject(object) {
    if (!object) return null;
    return object.userData?.entityId || object.userData?.playerId || null;
  }

  function selectedObjectRoot() {
    return refreshSelectedRootReference();
  }

  function createTransformGuide() {
    const guide = new THREE.Group();
    guide.name = "GK editor transform guide";
    guide.visible = false;
    guide.renderOrder = 1000;
    const axes = [
      { name: "X", color: 0xff5a5f, points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)] },
      { name: "Y", color: 0x78d87b, points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)] },
      { name: "Z", color: 0x66aaff, points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)] }
    ];
    for (const axis of axes) {
      const geometry = new THREE.BufferGeometry().setFromPoints(axis.points);
      const material = new THREE.LineBasicMaterial({
        color: axis.color,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.95,
        toneMapped: false
      });
      const line = new THREE.Line(geometry, material);
      line.name = "GK editor transform guide " + axis.name;
      line.renderOrder = 1000;
      line.raycast = function () {};
      guide.add(line);
    }
    markDebugOverlayTree(guide, "transform");
    guide.traverse(function (child) {
      child.raycast = function () {};
    });
    return guide;
  }

  function terrainOverlayColorForNode(nodeType) {
    if (nodeType === "walkable_surface") return 0x8fe0a8;
    if (nodeType === "blocker_area") return 0xf0b35a;
    return 0xf0b35a;
  }

  function createTerrainOverlay() {
    const group = new THREE.Group();
    group.name = "GK editor terrain overlay";
    group.visible = false;
    group.renderOrder = 2000;
    group.frustumCulled = false;
    markDebugOverlayTree(group, "terrain");
    return group;
  }

  function createScatterOverlay() {
    const group = new THREE.Group();
    group.name = "GK editor scatter overlay";
    group.visible = false;
    group.renderOrder = 2001;
    group.frustumCulled = false;
    markDebugOverlayTree(group, "scatter");
    return group;
  }

  function terrainOverlayLine(points, closed, color, opacity = 0.95) {
    if (!Array.isArray(points) || points.length < 2) return null;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: opacity,
      toneMapped: false
    });
    const line = closed ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material);
    line.renderOrder = 2000;
    line.frustumCulled = false;
    line.name = "GK terrain overlay line";
    line.raycast = function () {};
    line.userData.debugOverlay = true;
    line.userData.debugOverlayKind = "terrain";
    line.castShadow = false;
    line.receiveShadow = false;
    return line;
  }

  function terrainOverlayHandle(position, color, role, nodeId, pointIndex, selected) {
    const geometry = new THREE.SphereGeometry(selected ? 0.18 : 0.14, 10, 8);
    const material = new THREE.MeshBasicMaterial({
      color: selected ? 0xffffff : color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: selected ? 1 : 0.96,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.renderOrder = 2001;
    mesh.frustumCulled = false;
    mesh.name = "GK terrain overlay handle";
    mesh.userData.terrainHandle = true;
    mesh.userData.nodeId = nodeId;
    mesh.userData.handleRole = role;
    mesh.userData.pointIndex = Number.isInteger(pointIndex) ? pointIndex : null;
    mesh.userData.selected = Boolean(selected);
    mesh.userData.debugOverlay = true;
    mesh.userData.debugOverlayKind = "terrain";
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  function terrainOverlayRectanglePoints(state) {
    const halfWidth = Math.max(0, num(state?.width, 0)) / 2;
    const halfDepth = Math.max(0, num(state?.depth, 0)) / 2;
    const rotation = num(state?.rotationY, 0) * DEG_TO_RAD;
    const center = new THREE.Vector3(num(state?.x, 0), num(state?.y, 0), num(state?.z, 0));
    const offsets = [
      new THREE.Vector3(-halfWidth, 0, -halfDepth),
      new THREE.Vector3(halfWidth, 0, -halfDepth),
      new THREE.Vector3(halfWidth, 0, halfDepth),
      new THREE.Vector3(-halfWidth, 0, halfDepth)
    ];
    for (const offset of offsets) offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation).add(center);
    return offsets;
  }

  function scatterOverlayRectanglePoints(state) {
    return terrainOverlayRectanglePoints(state);
  }

  function terrainOverlayCirclePoints(state, segments = 24) {
    const radius = Math.max(0, num(state?.radius, 0));
    const center = new THREE.Vector3(num(state?.x, 0), num(state?.y, 0), num(state?.z, 0));
    const points = [];
    for (let index = 0; index < Math.max(8, segments); index += 1) {
      const angle = (Math.PI * 2 * index) / Math.max(8, segments);
      points.push(new THREE.Vector3(center.x + Math.cos(angle) * radius, center.y, center.z + Math.sin(angle) * radius));
    }
    return points;
  }

  function clearTerrainEditorOverlay() {
    if (!terrainEditorOverlay) return;
    if (!terrainEditorOverlay.visible && terrainEditorOverlay.children.length === 0) {
      terrainEditorOverlayState = null;
      return;
    }
    terrainEditorOverlayState = null;
    terrainEditorOverlay.visible = false;
    for (const child of Array.from(terrainEditorOverlay.children)) {
      terrainEditorOverlay.remove(child);
      disposeObject(child);
    }
    requestRender("terrain-overlay-clear");
  }

  function clearScatterEditorOverlay() {
    if (!scatterEditorOverlay) return;
    if (!scatterEditorOverlay.visible && scatterEditorOverlay.children.length === 0) {
      scatterEditorOverlayState = null;
      return;
    }
    scatterEditorOverlayState = null;
    scatterEditorOverlay.visible = false;
    for (const child of Array.from(scatterEditorOverlay.children)) {
      scatterEditorOverlay.remove(child);
      disposeObject(child);
    }
    requestRender("scatter-overlay-clear");
  }

  function buildTerrainEditorOverlay(nextOverlay) {
    if (!terrainEditorOverlay || mode !== "editor") return;
    clearTerrainEditorOverlay();
    if (!nextOverlay || !nextOverlay.nodeType) return;
    terrainEditorOverlayState = nextOverlay;
    terrainEditorOverlay.visible = true;
    const nodeId = String(nextOverlay.nodeId || "");
    const nodeType = String(nextOverlay.nodeType || "");
    const color = terrainOverlayColorForNode(nodeType);
    const lineColor = nextOverlay.color ? new THREE.Color(nextOverlay.color) : new THREE.Color(color);
    const y = nodeType === "walkable_surface"
      ? num(nextOverlay.y, 0)
      : num(nextOverlay.groundY, 0) + 0.03;
    const selectedIndex = Number.isInteger(nextOverlay.selectedPointIndex) ? nextOverlay.selectedPointIndex : null;
    const selectedIndices = Array.isArray(nextOverlay.selectedPointIndices) ? new Set(nextOverlay.selectedPointIndices) : null;
    const selectedRole = String(nextOverlay.selectedHandleRole || "");

    if (nodeType === "walkable_surface") {
      const hasPoints = Array.isArray(nextOverlay.points) && nextOverlay.points.length > 0;
      const rawPoints = hasPoints
        ? nextOverlay.points
        : terrainOverlayRectanglePoints({
          x: nextOverlay.x,
          y: y,
          z: nextOverlay.z,
          width: nextOverlay.width,
          depth: nextOverlay.depth,
          rotationY: nextOverlay.rotationY
        });
      const points = rawPoints.map(function (point) {
        return new THREE.Vector3(num(point?.x, 0), num(point?.y, y), num(point?.z, 0));
      });
      const line = terrainOverlayLine(points, hasPoints ? points.length >= 3 : true, lineColor, 0.92);
      if (line) terrainEditorOverlay.add(line);
      const center = terrainOverlayHandle(
        new THREE.Vector3(num(nextOverlay.x, 0), num(nextOverlay.y, 0), num(nextOverlay.z, 0)),
        color,
        "center",
        nodeId,
        null,
        selectedRole === "center" || nextOverlay.draggingHandleRole === "center"
      );
      terrainEditorOverlay.add(center);
      if (hasPoints) {
        for (let index = 0; index < points.length; index += 1) {
          terrainEditorOverlay.add(terrainOverlayHandle(points[index], color, "point", nodeId, index, selectedIndices ? selectedIndices.has(index) : index === selectedIndex));
        }
      }
      requestRender("terrain-overlay-update");
      return;
    }

    const rawPoints = Array.isArray(nextOverlay.points) ? nextOverlay.points : [];
    const points = [];
    for (const point of rawPoints) {
      const x = Number(point?.x);
      const z = Number(point?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      points.push(new THREE.Vector3(x, y, z));
    }
    const extrudePreviewPoint = nextOverlay.draggingHandleRole === "extrude" && nextOverlay.previewPoint
      ? new THREE.Vector3(
        Number(nextOverlay.previewPoint.x) || 0,
        y,
        Number(nextOverlay.previewPoint.z) || 0
      )
      : null;
    const extrudePreviewIndex = Number.isInteger(nextOverlay.previewInsertIndex)
      ? Math.max(0, Math.min(points.length, nextOverlay.previewInsertIndex))
      : Math.max(0, points.length - 1);
    if (extrudePreviewPoint) points.splice(extrudePreviewIndex, 0, extrudePreviewPoint);

    const isPointSelected = function (index) {
      if (extrudePreviewPoint && index === extrudePreviewIndex) return true;
      if (selectedIndices && selectedIndices.size > 0) return selectedIndices.has(index);
      return index === selectedIndex;
    };

    if (nodeType === "blocker_area" && String(nextOverlay.shapeType || "").toLowerCase() === "polygon") {
      const line = terrainOverlayLine(points, points.length >= 3, lineColor, 0.9);
      if (line) terrainEditorOverlay.add(line);
      for (let index = 0; index < points.length; index += 1) {
        terrainEditorOverlay.add(terrainOverlayHandle(points[index], color, "point", nodeId, index, isPointSelected(index)));
      }
      requestRender("terrain-overlay-update");
      return;
    }

    if (nodeType === "surface_layer") {
      const line = terrainOverlayLine(points, false, lineColor, 0.95);
      if (line) terrainEditorOverlay.add(line);
      for (let index = 0; index < points.length; index += 1) {
        terrainEditorOverlay.add(terrainOverlayHandle(points[index], color, "point", nodeId, index, isPointSelected(index)));
      }
      requestRender("terrain-overlay-update");
      return;
    }

    if (nodeType === "blocker_area") {
      const shapeType = String(nextOverlay.shapeType || "").toLowerCase();
      if (shapeType === "box") {
        const boxPoints = terrainOverlayRectanglePoints({
          x: nextOverlay.x,
          y: num(nextOverlay.groundY, 0) + 0.03,
          z: nextOverlay.z,
          width: nextOverlay.width,
          depth: nextOverlay.depth,
          rotationY: 0
        });
        const line = terrainOverlayLine(boxPoints, true, lineColor, 0.85);
        if (line) terrainEditorOverlay.add(line);
      } else if (shapeType === "circle") {
        const circlePoints = terrainOverlayCirclePoints({
          x: nextOverlay.x,
          y: num(nextOverlay.groundY, 0) + 0.03,
          z: nextOverlay.z,
          radius: nextOverlay.radius
        });
        const line = terrainOverlayLine(circlePoints, true, lineColor, 0.85);
        if (line) terrainEditorOverlay.add(line);
      } else {
        const line = terrainOverlayLine(points, points.length >= 3, lineColor, 0.85);
        if (line) terrainEditorOverlay.add(line);
        for (let index = 0; index < points.length; index += 1) {
          terrainEditorOverlay.add(terrainOverlayHandle(points[index], color, "point", nodeId, index, isPointSelected(index)));
        }
      }
      requestRender("terrain-overlay-update");
      return;
    }

    requestRender("terrain-overlay-update");
  }

  function buildScatterEditorOverlay(nextOverlay) {
    if (!scatterEditorOverlay || mode !== "editor") return;
    clearScatterEditorOverlay();
    if (!nextOverlay || !nextOverlay.nodeType) return;
    scatterEditorOverlayState = nextOverlay;
    scatterEditorOverlay.visible = true;
    const color = nextOverlay.color ? new THREE.Color(nextOverlay.color) : new THREE.Color(0xd59bff);
    const lineColor = color.clone();
    const y = num(nextOverlay.groundY, 0) + 0.05;
    const rawPoints = Array.isArray(nextOverlay.points) && nextOverlay.points.length >= 3
      ? nextOverlay.points
      : scatterOverlayRectanglePoints({
        x: nextOverlay.x,
        y: y,
        z: nextOverlay.z,
        width: nextOverlay.width,
        depth: nextOverlay.depth,
        rotationY: nextOverlay.rotationY
      });
    const points = rawPoints.map(function (point) {
      return new THREE.Vector3(num(point?.x, 0), y, num(point?.z, 0));
    });
    const selectedIndices = Array.isArray(nextOverlay.selectedPointIndices) ? new Set(nextOverlay.selectedPointIndices) : null;
    const selectedIndex = Number.isInteger(nextOverlay.selectedPointIndex) ? nextOverlay.selectedPointIndex : null;
    const selectedRole = String(nextOverlay.selectedHandleRole || "");
    const line = terrainOverlayLine(points, true, lineColor, 0.95);
    if (line) scatterEditorOverlay.add(line);
    const center = terrainOverlayHandle(
      new THREE.Vector3(num(nextOverlay.x, 0), y, num(nextOverlay.z, 0)),
      color,
      "center",
      nextOverlay.nodeId || null,
      null,
      selectedRole === "center" || nextOverlay.draggingHandleRole === "center" || nextOverlay.draggingHandleRole === "rotate" || nextOverlay.draggingHandleRole === "scale"
    );
    center.userData.scatterHandle = true;
    scatterEditorOverlay.add(center);
    for (let index = 0; index < points.length; index += 1) {
      const selected = selectedIndices && selectedIndices.size > 0
        ? selectedIndices.has(index)
        : index === selectedIndex;
      const handle = terrainOverlayHandle(points[index], color, "point", nextOverlay.nodeId || null, index, selected);
      handle.userData.scatterHandle = true;
      scatterEditorOverlay.add(handle);
    }
    requestRender("scatter-overlay-update");
  }

  function setTerrainEditorOverlay(nextOverlay) {
    if (mode !== "editor" || !terrainEditorOverlay) return;
    if (!nextOverlay) {
      clearTerrainEditorOverlay();
      return;
    }
    buildTerrainEditorOverlay(nextOverlay);
  }

  function setScatterEditorOverlay(nextOverlay) {
    if (mode !== "editor" || !scatterEditorOverlay) return;
    if (!nextOverlay) {
      clearScatterEditorOverlay();
      return;
    }
    buildScatterEditorOverlay(nextOverlay);
  }

  function ensureTerrainRuntimeGroup() {
    if (terrainRuntimeGroup) return terrainRuntimeGroup;
    terrainRuntimeGroup = new THREE.Group();
    terrainRuntimeGroup.name = "GK runtime terrain visuals";
    terrainRuntimeGroup.frustumCulled = false;
    terrainRuntimeGroup.userData.terrainRuntimeGroup = true;
    terrainRuntimeGroup.userData.runtimeAlive = true;
    scene.add(terrainRuntimeGroup);
    runtimeStats.sceneObjects += 1;
    return terrainRuntimeGroup;
  }

  function groundMaterialCacheKey(ground) {
    return [
      colorOrDefault(ground?.materialColor, "#ffffff"),
      String(ground?.textureAssetId || ""),
      sharedWorldPerformance().smoothShading === false ? "flat" : "smooth"
    ].join("|");
  }

  function acquireGroundMaterialRecord(worldData, blueprint) {
    const ground = worldData?.ground || {};
    const key = groundMaterialCacheKey(ground);
    let record = groundChunkState.materialCache.get(key);
    if (!record) {
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorOrDefault(ground.materialColor, "#ffffff")),
        roughness: 0.9,
        metalness: 0,
        flatShading: sharedWorldPerformance().smoothShading === false,
        side: THREE.DoubleSide,
        transparent: false,
        depthWrite: true
      });
      record = {
        key: key,
        refCount: 0,
        material: material,
        texture: null,
        textureAssetId: ground.textureAssetId || null,
        disposed: false
      };
      groundChunkState.materialCache.set(key, record);
      if (record.textureAssetId) {
        const asset = assetById(worldData, record.textureAssetId);
        if (asset?.sourcePath) {
          retainTerrainTexture(asset, function (texture) {
            if (groundChunkState.materialCache.get(key) !== record || record.disposed) return;
            const clone = texture.clone();
            clone.colorSpace = THREE.SRGBColorSpace;
            clone.wrapS = THREE.RepeatWrapping;
            clone.wrapT = THREE.RepeatWrapping;
            clone.repeat.set(1, 1);
            clone.needsUpdate = true;
            if (record.texture && record.texture !== clone) {
              try { record.texture.dispose(); } catch {}
            }
            record.texture = clone;
            record.material.map = clone;
            record.material.needsUpdate = true;
          });
        }
      }
    }
    record.refCount += 1;
    if (record.textureAssetId) {
      const current = num(groundChunkState.textureRefs.get(record.textureAssetId), 0);
      groundChunkState.textureRefs.set(record.textureAssetId, current + 1);
    }
    if (blueprint?.materialColor) {
      record.material.color.copy(colorFromHex(blueprint.materialColor, "#ffffff"));
    }
    return record;
  }

  function releaseGroundMaterialRecord(record, reason = "chunk-unload") {
    if (!record) return;
    record.refCount = Math.max(0, num(record.refCount, 0) - 1);
    if (record.textureAssetId) {
      const nextCount = Math.max(0, num(groundChunkState.textureRefs.get(record.textureAssetId), 0) - 1);
      if (nextCount > 0) groundChunkState.textureRefs.set(record.textureAssetId, nextCount);
      else groundChunkState.textureRefs.delete(record.textureAssetId);
    }
    if (record.refCount > 0) return;
    record.disposed = true;
    groundChunkState.materialCache.delete(record.key);
    if (record.texture) {
      try { record.texture.dispose(); } catch {}
      record.texture = null;
    }
    if (record.material) {
      try { record.material.dispose(); } catch {}
    }
    if (record.textureAssetId) releaseTerrainTexture(record.textureAssetId);
  }

  function buildGroundTileGeometry(blueprint, ground) {
    if (!blueprint?.bounds) return null;
    const textureSize = groundTextureWorldSize(ground);
    return createWorldPlaneGeometry(
      blueprint.bounds.minX,
      blueprint.bounds.maxX,
      blueprint.bounds.minZ,
      blueprint.bounds.maxZ,
      num(ground?.y, 0),
      {
        minX: 0,
        maxX: textureSize.x,
        minZ: 0,
        maxZ: textureSize.z,
        repeatX: 1,
        repeatZ: 1
      }
    );
  }

  function disposeGroundTile(tile, reason = "chunk-unload") {
    if (!tile) return;
    if (tile.mesh?.parent) tile.mesh.parent.remove(tile.mesh);
    if (tile.geometry) {
      try { tile.geometry.dispose(); } catch {}
    }
    releaseGroundMaterialRecord(tile.materialRecord || null, reason);
    if (tile.mesh?.userData) tile.mesh.userData.terrainChunkDisposed = true;
  }

  function clearGroundChunkState(reason = "clear") {
    for (const tile of Array.from(groundChunkState.residentTiles.values())) {
      disposeGroundTile(tile, reason);
    }
    groundChunkState.mode = "full";
    groundChunkState.tilesByChunkKey.clear();
    groundChunkState.residentTiles.clear();
    groundChunkState.materialCache.clear();
    groundChunkState.textureRefs.clear();
    groundChunkState.lastLoadedChunkKeySet.clear();
    groundChunkState.blueprint = null;
    groundChunkState.blueprintSignature = "";
    groundChunkState.stats = cloneGroundChunkStats({
      mode: "full",
      enabled: false,
      policySource: "none",
      fullGroundPlaneActive: false,
      fullGroundPlaneName: null,
      fullGroundPlaneVisible: false,
      groundTilesBlueprint: 0,
      groundTilesResident: 0,
      groundTilesVisible: 0,
      groundTilesHidden: 0,
      loadedChunkKeys: [],
      residentChunkKeys: [],
      enteringChunkKeys: [],
      leavingChunkKeys: [],
      lastSyncReason: reason
    });
  }

  function syncGroundChunkState(worldData, nextState, reason = "runtime-sync") {
    const blueprintSignature = groundBlueprintSignature(worldData, mode);
    if (!groundChunkState.blueprint || groundChunkState.blueprintSignature !== blueprintSignature) {
      groundChunkState.blueprint = groundBlueprintForWorld(worldData, mode);
      groundChunkState.blueprintSignature = blueprintSignature;
      groundChunkState.tilesByChunkKey = groundChunkState.blueprint.tilesByChunkKey;
    }
    const plan = buildGroundChunkPlanFromBlueprint(groundChunkState.blueprint, mode, nextState, groundChunkState);
    if (plan.mode === "chunked" && fullGroundPlane) {
      if (fullGroundPlane.parent) fullGroundPlane.parent.remove(fullGroundPlane);
      fullGroundPlane.userData.terrainChunkDisposed = true;
      disposeObject(fullGroundPlane, { disposeTextures: true });
      if (fullGroundPlaneTextureAssetId) releaseTerrainTexture(fullGroundPlaneTextureAssetId);
      runtimeStats.sceneObjects = Math.max(0, runtimeStats.sceneObjects - 1);
      runtimeStats.meshes = Math.max(0, runtimeStats.meshes - 1);
      fullGroundPlane = null;
      fullGroundPlaneTextureAssetId = null;
    }
    const previousResidentKeys = new Set(groundChunkState.residentTiles.keys());
    applyGroundChunkPlan(groundChunkState, plan, {
      createTile: function (blueprint, chunkKey, nextPlan) {
        const geometry = buildGroundTileGeometry(blueprint, worldData?.ground || null);
        if (!geometry) return null;
        const materialRecord = acquireGroundMaterialRecord(worldData, blueprint);
        const mesh = new THREE.Mesh(geometry, materialRecord.material);
        mesh.name = "GK ground tile " + chunkKey;
        mesh.receiveShadow = Boolean(groundShadowOptions().receiveShadow);
        mesh.userData.terrainRuntime = true;
        mesh.userData.groundTile = true;
        mesh.userData.groundChunkKey = chunkKey;
        mesh.userData.terrainChunkDisposed = false;
        const group = ensureTerrainRuntimeGroup();
        group.add(mesh);
        runtimeStats.sceneObjects += 1;
        runtimeStats.meshes += 1;
        const createdAt = performance.now();
        const tile = {
          chunkKey: chunkKey,
          bounds: blueprint.bounds,
          mesh: mesh,
          geometry: geometry,
          material: materialRecord.material,
          materialRecord: materialRecord,
          textureAssetId: blueprint.textureAssetId || null,
          createdAt: createdAt,
          lastTouchedAt: createdAt
        };
        groundChunkState.residentTiles.set(chunkKey, tile);
        return tile;
      },
      disposeTile: function (tile) {
        disposeGroundTile(tile, reason);
        runtimeStats.sceneObjects = Math.max(0, runtimeStats.sceneObjects - 1);
        runtimeStats.meshes = Math.max(0, runtimeStats.meshes - 1);
      }
    });
    if (plan.mode === "full" && !fullGroundPlane && worldData?.ground) {
      addGround(worldData);
    }
    groundChunkState.mode = plan.mode;
    groundChunkState.stats = cloneGroundChunkStats(Object.assign({}, plan.stats, {
      fullGroundPlaneActive: Boolean(fullGroundPlane && fullGroundPlane.parent),
      fullGroundPlaneName: fullGroundPlane ? fullGroundPlane.name || null : plan.fullGroundPlaneName || null,
      fullGroundPlaneVisible: fullGroundPlane ? fullGroundPlane.visible !== false : plan.fullGroundPlaneVisible === true,
      lastSyncReason: reason || plan.lastSyncReason || "runtime-sync"
    }));
    groundChunkState.stats.groundTilesResident = groundChunkState.residentTiles.size;
    groundChunkState.stats.groundTilesVisible = groundChunkState.residentTiles.size;
    groundChunkState.stats.groundTilesHidden = 0;
    terrainStreamingState.groundTilesResident = groundChunkState.stats.groundTilesResident;
    terrainStreamingState.lastUpdateReason = reason || terrainStreamingState.lastUpdateReason;
    return {
      previousResidentKeys: Array.from(previousResidentKeys),
      groundChunkState: groundChunkState
    };
  }

  function clearTerrainRuntimeVisuals() {
    terrainRuntimeGeneration += 1;
    for (const record of terrainTextureRecords.values()) {
      if (record?.texture) {
        try { record.texture.dispose(); } catch {}
      }
      if (Array.isArray(record?.waiters)) record.waiters.length = 0;
    }
    terrainTextureRecords.clear();
    surfaceMaterialRecords.clear();
    surfaceAnimMaterials = [];
    surfaceDefaultWhiteTex = null;
    terrainRuntimeEntries.clear();
    terrainRuntimeChunkIndex.clear();
    terrainRuntimeResidentEntries.clear();
    clearGroundChunkState("clearTerrainRuntimeVisuals");
    terrainStreamingState.blueprintPieces = 0;
    terrainStreamingState.residentPieces = 0;
    terrainStreamingState.builtPieces = 0;
    terrainStreamingState.disposedPieces = 0;
    terrainStreamingState.residentObjects = 0;
    terrainStreamingState.residentMeshes = 0;
    terrainStreamingState.residentChunks = 0;
    terrainStreamingState.residentChunkKeys = [];
    terrainStreamingState.loadedChunks = 0;
    terrainStreamingState.activeChunks = 0;
    terrainStreamingState.preloadChunks = 0;
    terrainStreamingState.textureRefs = 0;
    terrainStreamingState.textureAssets = 0;
    terrainStreamingState.surfaceMaterials = 0;
    terrainStreamingState.groundTilesResident = 0;
    terrainStreamingState.terrainLayerTilesResident = 0;
    terrainStreamingState.surfaceSegmentsResident = 0;
    terrainStreamingState.lastUpdateReason = "clear";
    if (fullGroundPlaneTextureAssetId) {
      releaseTerrainTexture(fullGroundPlaneTextureAssetId);
      fullGroundPlaneTextureAssetId = null;
    }
    fullGroundPlane = null;
    if (stableSunShadowController?.clearDirectionalLights) stableSunShadowController.clearDirectionalLights();
    for (const light of directionalLights) {
      if (light?.target?.parent) light.target.parent.remove(light.target);
    }
    directionalLights.length = 0;
    groundShadowAnchorKey = "";
    shadowAnchorState = {
      mode: "static",
      x: 0,
      z: 0,
      lastUpdatedReason: "clear"
    };
    if (!terrainRuntimeGroup) return;
    if (terrainRuntimeGroup.parent) terrainRuntimeGroup.parent.remove(terrainRuntimeGroup);
    disposeObject(terrainRuntimeGroup, { disposeTextures: true });
    terrainRuntimeGroup = null;
  }

  function cloneTerrainTexture(texture, repeatX, repeatZ) {
    if (!texture) return null;
    const clone = texture.clone();
    clone.colorSpace = THREE.SRGBColorSpace;
    clone.wrapS = THREE.RepeatWrapping;
    clone.wrapT = THREE.RepeatWrapping;
    clone.repeat.set(Math.max(0.0001, num(repeatX, 1)), Math.max(0.0001, num(repeatZ, 1)));
    clone.needsUpdate = true;
    return clone;
  }

  function requestTerrainTexture(asset, applyTexture) {
    if (!asset?.sourcePath || !["texture", "image"].includes(asset.assetType)) return false;
    const existing = terrainTextureRecords.get(asset.id);
    if (existing?.status === "ready" && existing.texture) {
      if (typeof applyTexture === "function") applyTexture(existing.texture);
      return true;
    }
    if (existing?.status === "loading") {
      if (typeof applyTexture === "function") existing.waiters.push(applyTexture);
      return true;
    }
    if (existing && existing.refCount > 0) {
      existing.status = "loading";
      if (typeof applyTexture === "function") existing.waiters.push(applyTexture);
      try {
        textureLoader.load(asset.sourcePath, function (texture) {
          if (existing.generation !== terrainRuntimeGeneration || disposed || terrainTextureRecords.get(asset.id) !== existing) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          existing.status = "ready";
          existing.texture = texture;
          if (existing.refCount <= 0) {
            existing.status = "idle";
            existing.texture = null;
            texture.dispose();
            terrainTextureRecords.delete(asset.id);
            return;
          }
          for (const waiter of existing.waiters.splice(0)) waiter(texture);
          requestRender("terrain-texture-loaded");
        }, undefined, function () {
          if (existing.generation !== terrainRuntimeGeneration || disposed || terrainTextureRecords.get(asset.id) !== existing) return;
          existing.status = "error";
          loadErrors.push("Terrain texture: " + (asset.name || asset.id));
          renderHud();
        });
      } catch (error) {
        existing.status = "error";
        loadErrors.push("Terrain texture: " + (asset.name || asset.id));
        renderHud();
        console.warn("Terrain texture load failed for " + (asset.name || asset.id) + ".", error);
        return false;
      }
      return true;
    }
    const record = {
      status: "loading",
      texture: null,
      waiters: typeof applyTexture === "function" ? [applyTexture] : [],
      refCount: 0,
      generation: terrainRuntimeGeneration
    };
    terrainTextureRecords.set(asset.id, record);
    try {
      textureLoader.load(asset.sourcePath, function (texture) {
        if (record.generation !== terrainRuntimeGeneration || disposed || terrainTextureRecords.get(asset.id) !== record) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        record.status = "ready";
        record.texture = texture;
        if (record.refCount <= 0) {
          record.status = "idle";
          record.texture = null;
          texture.dispose();
          terrainTextureRecords.delete(asset.id);
          return;
        }
        for (const waiter of record.waiters.splice(0)) waiter(texture);
        requestRender("terrain-texture-loaded");
      }, undefined, function () {
        if (record.generation !== terrainRuntimeGeneration || disposed || terrainTextureRecords.get(asset.id) !== record) return;
        record.status = "error";
        loadErrors.push("Terrain texture: " + (asset.name || asset.id));
        renderHud();
      });
    } catch (error) {
      record.status = "error";
      loadErrors.push("Terrain texture: " + (asset.name || asset.id));
      renderHud();
      console.warn("Terrain texture load failed for " + (asset.name || asset.id) + ".", error);
      return false;
    }
    return true;
  }

  function retainTerrainTexture(asset, applyTexture) {
    if (!asset?.sourcePath || !["texture", "image"].includes(asset.assetType)) return null;
    const existing = terrainTextureRecords.get(asset.id);
    let record = existing || null;
    if (!record) {
      record = {
        status: "idle",
        texture: null,
        waiters: [],
        refCount: 0,
        generation: terrainRuntimeGeneration
      };
      terrainTextureRecords.set(asset.id, record);
    }
    record.refCount += 1;
    requestTerrainTexture(asset, applyTexture);
    return record;
  }

  function releaseTerrainTexture(assetId) {
    if (!assetId) return;
    const record = terrainTextureRecords.get(assetId);
    if (!record) return;
    record.refCount = Math.max(0, num(record.refCount, 0) - 1);
    if (record.refCount > 0) return;
    if (record.texture) {
      record.texture.dispose();
      record.texture = null;
    }
    record.waiters.length = 0;
    record.status = "idle";
    terrainTextureRecords.delete(assetId);
  }

  function normalizeTerrainAssetIds(assetIds) {
    return Array.from(new Set((Array.isArray(assetIds) ? assetIds : []).map(function (value) {
      return String(value || "").trim();
    }).filter(Boolean)));
  }

  function terrainEntryBucket(type) {
    if (type === "terrainGround") return "groundTiles";
    if (type === "terrainLayer") return "terrainLayerTiles";
    if (type === "terrainSurface") return "surfaceSegments";
    return null;
  }

  function adjustTerrainStreamingBucket(type, delta) {
    const bucket = terrainEntryBucket(type);
    if (!bucket) return;
    if (bucket === "groundTiles") terrainStreamingState.groundTilesResident = Math.max(0, terrainStreamingState.groundTilesResident + delta);
    else if (bucket === "terrainLayerTiles") terrainStreamingState.terrainLayerTilesResident = Math.max(0, terrainStreamingState.terrainLayerTilesResident + delta);
    else if (bucket === "surfaceSegments") terrainStreamingState.surfaceSegmentsResident = Math.max(0, terrainStreamingState.surfaceSegmentsResident + delta);
  }

  function registerTerrainSurfaceMaterialRecord(surfaceId, record) {
    const key = String(surfaceId || "").trim();
    if (!key || !record) return;
    let records = surfaceMaterialRecords.get(key);
    if (!records) {
      records = new Set();
      surfaceMaterialRecords.set(key, records);
    }
    records.add(record);
  }

  function unregisterTerrainSurfaceMaterialRecord(surfaceId, record) {
    const key = String(surfaceId || "").trim();
    if (!key || !record) return;
    const records = surfaceMaterialRecords.get(key);
    if (!records) return;
    records.delete(record);
    if (!records.size) surfaceMaterialRecords.delete(key);
  }

  function removeAnimMaterialEntry(list, material) {
    if (!Array.isArray(list) || !material) return;
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (list[index]?.material === material) list.splice(index, 1);
    }
  }

  function registerTerrainRuntimeEntry(entry) {
    const registered = registerChunkRuntimeEntry(entry);
    if (!registered) return null;
    terrainRuntimeEntries.set(registered.id, registered);
    const chunkKeys = Array.isArray(registered.chunkKeys) && registered.chunkKeys.length
      ? normalizeTerrainAssetIds(registered.chunkKeys)
      : (registered.chunkKey ? [String(registered.chunkKey)] : []);
    if (chunkKeys.length) {
      registered.chunkKeys = chunkKeys;
      registered.chunkKey = registered.chunkKey || chunkKeys[0] || null;
      for (const chunkKey of chunkKeys) {
        let ids = terrainRuntimeChunkIndex.get(chunkKey);
        if (!ids) {
          ids = new Set();
          terrainRuntimeChunkIndex.set(chunkKey, ids);
        }
        ids.add(registered.id);
      }
    }
    terrainStreamingState.blueprintPieces += 1;
    return registered;
  }

  function terrainEntryTypeDelta(type) {
    if (type === "terrainGround") return "groundTiles";
    if (type === "terrainLayer") return "terrainLayerTiles";
    if (type === "terrainSurface") return "surfaceSegments";
    return null;
  }

  function buildTerrainResidentObject(entry) {
    if (!entry || entry.object || typeof entry.buildObject !== "function") return entry?.object || null;
    const result = entry.buildObject(entry);
    const object = result && result.object ? result.object : (result && result.isObject3D ? result : null);
    if (!object) return null;
    const counts = result?.counts || countObjectTree(object);
    const assetIds = normalizeTerrainAssetIds(result?.assetIds || entry.assetIds || []);
    const cleanup = typeof result?.cleanup === "function" ? result.cleanup : null;
    const onDispose = typeof result?.onDispose === "function" ? result.onDispose : null;
    entry.object = object;
    entry.assetIds = assetIds;
    entry.cleanup = cleanup;
    entry.onDispose = onDispose;
    entry.objectCounts = counts;
    entry.resident = true;
    object.userData = object.userData || {};
    object.userData.terrainChunkEntryId = entry.id;
    object.userData.terrainChunkType = entry.type;
    object.userData.terrainChunkDisposed = false;
    const group = ensureTerrainRuntimeGroup();
    group.add(object);
    runtimeStats.sceneObjects += counts.objects;
    runtimeStats.meshes += counts.meshes;
    terrainRuntimeResidentEntries.add(entry.id);
    terrainStreamingState.builtPieces += 1;
    terrainStreamingState.residentPieces += 1;
    terrainStreamingState.residentObjects += counts.objects;
    terrainStreamingState.residentMeshes += counts.meshes;
    adjustTerrainStreamingBucket(entry.type, 1);
    return object;
  }

  function releaseTerrainResidentObject(entry, reason = "unload") {
    if (!entry || !entry.object) return false;
    const object = entry.object;
    const counts = entry.objectCounts || countObjectTree(object);
    entry.object = null;
    entry.objectCounts = null;
    entry.resident = false;
    if (object.userData) object.userData.terrainChunkDisposed = true;
    if (object.parent) object.parent.remove(object);
    if (typeof entry.onDispose === "function") {
      try {
        entry.onDispose(object, entry, reason);
      } catch (error) {
        console.warn("Terrain chunk onDispose failed for " + String(entry.id || "unknown") + ".", error);
      }
    }
    if (typeof entry.cleanup === "function") {
      try {
        entry.cleanup(object, entry, reason);
      } catch (error) {
        console.warn("Terrain chunk cleanup failed for " + String(entry.id || "unknown") + ".", error);
      }
    }
    if (Array.isArray(entry.assetIds)) {
      for (const assetId of entry.assetIds) releaseTerrainTexture(assetId);
    }
    disposeObject(object, { disposeTextures: true });
    runtimeStats.sceneObjects = Math.max(0, runtimeStats.sceneObjects - counts.objects);
    runtimeStats.meshes = Math.max(0, runtimeStats.meshes - counts.meshes);
    terrainRuntimeResidentEntries.delete(entry.id);
    terrainStreamingState.disposedPieces += 1;
    terrainStreamingState.residentPieces = Math.max(0, terrainStreamingState.residentPieces - 1);
    terrainStreamingState.residentObjects = Math.max(0, terrainStreamingState.residentObjects - counts.objects);
    terrainStreamingState.residentMeshes = Math.max(0, terrainStreamingState.residentMeshes - counts.meshes);
    adjustTerrainStreamingBucket(entry.type, -1);
    return true;
  }

  function ensureTerrainResidentEntry(entry) {
    if (!entry) return null;
    if (entry.object) return entry.object;
    return buildTerrainResidentObject(entry);
  }

  function createOverlayMaterial(color, opacity, options = {}) {
    const alpha = clamp(num(opacity, 1), 0, 1);
    const material = new THREE.MeshBasicMaterial({
      color: color instanceof THREE.Color ? color : colorFromHex(color, "#ffffff"),
      transparent: alpha < 0.999,
      opacity: alpha,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      toneMapped: false
    });
    material.fog = true;
    material.polygonOffset = true;
    material.polygonOffsetFactor = num(options.polygonOffsetFactor, -1);
    material.polygonOffsetUnits = num(options.polygonOffsetUnits, -1);
    if (options.map) material.map = options.map;
    return material;
  }

  function addTerrainRuntimeMesh(mesh, entryOptions = {}) {
    if (!mesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = Boolean(terrainShadowOptions().receiveShadow);
    const group = ensureTerrainRuntimeGroup();
    group.add(mesh);
    runtimeStats.sceneObjects += 1;
    runtimeStats.meshes += 1;
    runtimeStats.terrainVisuals += 1;
    registerChunkRuntimeEntry(createTerrainVisualRegistryEntry(Object.assign({}, entryOptions, {
      object: mesh,
      hasVisual: true,
      visible: true
    })));
  }

  function updateSurfaceAnimation(time) {
    const t = time * 0.001;
    for (const entry of surfaceAnimMaterials) {
      const uniforms = entry?.uniforms || null;
      if (!uniforms) continue;
      if (uniforms.time) uniforms.time.value = t;
      const material = entry.material || null;
      const map = material?.map || null;
      const flowMain = num(uniforms.flowMain?.value, 0);
      const flowSpeed = num(uniforms.flowSpeed?.value, 0);
      if (!map || flowMain <= 0 || flowSpeed === 0) continue;
      if (entry.mainMap !== map) {
        entry.mainMap = map;
        entry.baseMainOffset.set(map.offset.x, map.offset.y);
      }
      const flowDir = uniforms.flowDir?.value || null;
      const flowX = num(flowDir?.x, 0);
      const flowY = num(flowDir?.y, 1);
      map.offset.set(
        entry.baseMainOffset.x + flowX * t * flowSpeed,
        entry.baseMainOffset.y + flowY * t * flowSpeed
      );
    }
  }

  function surfaceTextureScaleVector(surface, xKey, yKey, legacyKey) {
    const pair = surfaceScalePair(surface, xKey, yKey, legacyKey);
    return new THREE.Vector2(pair.x, pair.y);
  }

  function getOrCreateSurfaceDefaultWhiteTex() {
    if (surfaceDefaultWhiteTex && !surfaceDefaultWhiteTex.isDisposed) return surfaceDefaultWhiteTex;
    const data = new Uint8Array([255, 255, 255, 255]);
    surfaceDefaultWhiteTex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    surfaceDefaultWhiteTex.needsUpdate = true;
    return surfaceDefaultWhiteTex;
  }

  function cloneSurfaceFallbackTexture() {
    return cloneTerrainTexture(getOrCreateSurfaceDefaultWhiteTex(), 1, 1);
  }

  function replaceMaterialMapTexture(material, texture) {
    if (!material) return;
    const previous = material.map || null;
    if (previous && previous !== texture && previous.isTexture && typeof previous.dispose === "function") {
      previous.dispose();
    }
    material.map = texture || null;
  }

  function replaceUniformTexture(uniform, texture) {
    if (!uniform) return;
    const previous = uniform.value || null;
    if (previous && previous !== texture && previous.isTexture && typeof previous.dispose === "function") {
      previous.dispose();
    }
    uniform.value = texture || null;
  }

  function updateSurfaceMaterialUniforms(material, patch = {}) {
    const uniforms = material?.userData?.surfaceUniforms || null;
    if (!uniforms) return;
    const surface = patch || {};
    if (surface.textureScaleX !== undefined || surface.textureScaleY !== undefined || surface.textureScale !== undefined) {
      const main = surfaceTextureScaleVector(surface, "textureScaleX", "textureScaleY", "textureScale");
      uniforms.mainScale.value.set(main.x, main.y);
      if (material.map) {
        material.map.repeat.set(main.x, main.y);
        material.map.needsUpdate = true;
      }
    }
    if (surface.secondaryTextureScaleX !== undefined || surface.secondaryTextureScaleY !== undefined || surface.secondaryTextureScale !== undefined) {
      const secondary = surfaceTextureScaleVector(surface, "secondaryTextureScaleX", "secondaryTextureScaleY", "secondaryTextureScale");
      uniforms.secondaryScale.value.set(secondary.x, secondary.y);
    }
    if (surface.edgeFadeNoiseScaleX !== undefined || surface.edgeFadeNoiseScaleY !== undefined || surface.edgeFadeNoiseScale !== undefined) {
      const edge = surfaceTextureScaleVector(surface, "edgeFadeNoiseScaleX", "edgeFadeNoiseScaleY", "edgeFadeNoiseScale");
      uniforms.edgeNoiseScale.value.set(edge.x, edge.y);
    }
    if (surface.secondaryTextureStrength !== undefined) uniforms.secondaryStrength.value = clamp(num(surface.secondaryTextureStrength, uniforms.secondaryStrength.value), 0, 1);
    if (surface.edgeFadeWidth !== undefined) {
      const width = Math.max(0.1, num(surface.width !== undefined ? surface.width : material.userData.surfaceState?.width, 3));
      const edgeFade = num(surface.edgeFadeWidth, uniforms.edgeFadeWidth.value * width);
      uniforms.edgeFadeWidth.value = edgeFade > 0 ? clamp(edgeFade / width, 0, 0.45) : 0;
    }
    if (surface.edgeFadeNoiseStrength !== undefined) uniforms.edgeNoiseStrength.value = clamp(num(surface.edgeFadeNoiseStrength, uniforms.edgeNoiseStrength.value), 0, 1);
    if (surface.opacity !== undefined) uniforms.opacity.value = clamp(num(surface.opacity, uniforms.opacity.value), 0, 1);
    if (surface.flowSpeed !== undefined) uniforms.flowSpeed.value = num(surface.flowSpeed, uniforms.flowSpeed.value);
    if (surface.flowDirection !== undefined) {
      const flowRad = num(surface.flowDirection, 0) * Math.PI / 180;
      uniforms.flowDir.value.set(Math.sin(flowRad), Math.cos(flowRad));
    }
    if (surface.flowTextureLayer !== undefined) {
      const ftl = String(surface.flowTextureLayer || "main");
      uniforms.flowMain.value = (ftl === "main" || ftl === "both") ? 1.0 : 0.0;
      uniforms.flowSecondary.value = (ftl === "secondary" || ftl === "both") ? 1.0 : 0.0;
    }
    if (surface.fallbackColor !== undefined) {
      uniforms.fallbackColor.value.copy(colorFromHex(surface.fallbackColor, "#8a6f45"));
      if (!material.map) material.color.copy(colorFromHex(surface.fallbackColor, "#8a6f45"));
    }
    if (surface.textureAssetId !== undefined) {
      if (!surface.textureAssetId) {
        replaceMaterialMapTexture(material, null);
        material.color.copy(uniforms.fallbackColor.value);
        material.needsUpdate = true;
      }
    }
    if (surface.secondaryTextureAssetId !== undefined) {
      uniforms.hasSecondaryTex.value = 0.0;
      replaceUniformTexture(uniforms.secondaryTex, cloneSurfaceFallbackTexture());
    }
    if (surface.edgeFadeNoiseAssetId !== undefined) {
      uniforms.hasEdgeNoiseTex.value = 0.0;
      replaceUniformTexture(uniforms.edgeNoiseTex, cloneSurfaceFallbackTexture());
    }
    if (surface.opacity !== undefined || surface.edgeFadeWidth !== undefined) {
      const transparent = uniforms.opacity.value < 0.999 || uniforms.edgeFadeWidth.value > 0.0;
      material.transparent = transparent;
      material.depthWrite = !transparent;
    }
    requestRender("surface-material-preview");
  }

  function setTerrainSurfacePreview(surfaceId, patch) {
    if (!surfaceId) return false;
    const recordSet = surfaceMaterialRecords.get(surfaceId);
    if (!recordSet) return false;
    const records = recordSet instanceof Set ? Array.from(recordSet) : [recordSet];
    let updated = false;
    for (const record of records) {
      if (!record?.material) continue;
      updateSurfaceMaterialUniforms(record.material, patch || {});
      updated = true;
    }
    return updated;
  }

  function buildTerrainRuntimeStreamingVisuals(worldData) {
    const terrain = worldData?.terrain || {};
    const ground = worldData?.ground || null;
    const policy = resolveChunkPolicy(worldData, mode);
    const terrainVisualChunkingEnabled = policy.terrainVisualChunkingEnabled === true;
    const groundBounds = worldGroundBounds(ground);
    const hasGroundPlane = Boolean(groundBounds);
    const layers = Array.isArray(terrain.layers) ? terrain.layers.slice().sort(function (left, right) {
      return num(left?.priority, 0) - num(right?.priority, 0);
    }) : [];
    const surfaces = Array.isArray(terrain.surfaces) ? terrain.surfaces : [];
    const groundTiles = groundChunkTilesForBounds(ground, policy);
    const terrainLayerUvBounds = groundBounds ? {
      minX: groundBounds.minX,
      maxX: groundBounds.maxX,
      minZ: groundBounds.minZ,
      maxZ: groundBounds.maxZ,
      repeatX: num(ground?.width, 0) > 0 ? Math.max(1, num(ground.width, 0) / 8) : 1,
      repeatZ: num(ground?.depth, 0) > 0 ? Math.max(1, num(ground.depth, 0) / 8) : 1
    } : null;
    const groundTextureRepeat = Math.max(1, num(ground?.textureRepeat, 1));
    const terrainAssetIds = new Set();
    const maxSegmentLength = Math.max(1, Math.min(policy.chunkWorldWidth, policy.chunkWorldDepth) / 2);
    terrainStreamingState.lastUpdateReason = "blueprint";

    function rememberAssetId(assetId) {
      const value = String(assetId || "").trim();
      if (!value) return;
      terrainAssetIds.add(value);
    }

    function trackAssets(assetIds) {
      for (const assetId of normalizeTerrainAssetIds(assetIds)) rememberAssetId(assetId);
    }

    function registerStreamableTerrainEntry(meta, buildObjectFactory) {
      const entry = registerTerrainRuntimeEntry(Object.assign({}, meta, {
        object: null,
        hasVisual: true,
        visible: true
      }));
      entry.buildObject = function () {
        return buildObjectFactory(entry);
      };
      entry.terrainStreamable = true;
      trackAssets(meta.assetIds || []);
      runtimeStats.terrainVisuals += 1;
      const bucket = terrainEntryTypeDelta(entry.type);
      if (bucket === "groundTiles" || bucket === "terrainLayerTiles") runtimeStats.terrainLayers += 1;
      else if (bucket === "surfaceSegments") runtimeStats.terrainSurfaces += 1;
      return entry;
    }

    function buildTextureClone(material, assetId, repeatX, repeatZ, apply) {
      const asset = assetById(worldData, assetId);
      if (!asset) return false;
      retainTerrainTexture(asset, function (texture) {
        if (!material || material.userData?.terrainChunkDisposed === true) return;
        const clone = cloneTerrainTexture(texture, repeatX, repeatZ);
        if (typeof apply === "function") {
          apply(clone, texture);
        }
      });
      return true;
    }

    function createTerrainSurfaceMaterial(surface, options) {
      const opacity = clamp(num(surface?.opacity, 1), 0, 1);
      const width = Math.max(0.1, num(surface?.width, 3));
      const mainScale = surfaceScalePair(surface, "textureScaleX", "textureScaleY", "textureScale");
      const secondaryScale = surfaceScalePair(surface, "secondaryTextureScaleX", "secondaryTextureScaleY", "secondaryTextureScale");
      const edgeScale = surfaceScalePair(surface, "edgeFadeNoiseScaleX", "edgeFadeNoiseScaleY", "edgeFadeNoiseScale");
      const secondaryStrength = clamp(num(surface?.secondaryTextureStrength, 0.25), 0, 1);
      const edgeFadeW = num(surface?.edgeFadeWidth, 0.8);
      const edgeFadeWidthUV = edgeFadeW > 0 ? clamp(edgeFadeW / width, 0, 0.45) : 0;
      const edgeNoiseStrength = clamp(num(surface?.edgeFadeNoiseStrength, 0.35), 0, 1);
      const isAnimated = surface?.animated === true;
      const flowSpeed = isAnimated ? num(surface?.flowSpeed, 0) : 0;
      const flowDir = isAnimated ? num(surface?.flowDirection, 0) : 0;
      const flowRad = flowDir * Math.PI / 180;
      const flowDirX = Math.sin(flowRad);
      const flowDirY = Math.cos(flowRad);
      const ftl = String(surface?.flowTextureLayer || "main");
      const flowMain = (ftl === "main" || ftl === "both") ? 1.0 : 0.0;
      const flowSecondary = (ftl === "secondary" || ftl === "both") ? 1.0 : 0.0;
      const whiteTex = cloneSurfaceFallbackTexture();
      const edgeWhiteTex = cloneSurfaceFallbackTexture();
      const fallbackHex = surface?.fallbackColor || "#8a6f45";
      const uniforms = {
        secondaryTex: { value: whiteTex },
        hasSecondaryTex: { value: 0.0 },
        secondaryStrength: { value: secondaryStrength },
        mainScale: { value: new THREE.Vector2(mainScale.x, mainScale.y) },
        secondaryScale: { value: new THREE.Vector2(secondaryScale.x, secondaryScale.y) },
        edgeNoiseTex: { value: edgeWhiteTex },
        hasEdgeNoiseTex: { value: 0.0 },
        edgeFadeWidth: { value: edgeFadeWidthUV },
        edgeNoiseStrength: { value: edgeNoiseStrength },
        edgeNoiseScale: { value: new THREE.Vector2(edgeScale.x, edgeScale.y) },
        opacity: { value: opacity },
        time: { value: 0.0 },
        flowSpeed: { value: flowSpeed },
        flowDir: { value: new THREE.Vector2(flowDirX, flowDirY) },
        flowMain: { value: flowMain },
        flowSecondary: { value: flowSecondary },
        fallbackColor: { value: colorFromHex(fallbackHex, "#8a6f45") }
      };
      const material = new THREE.MeshStandardMaterial({
        color: colorFromHex(fallbackHex, "#8a6f45"),
        roughness: 1,
        metalness: 0,
        flatShading: sharedWorldPerformance().smoothShading === false,
        transparent: opacity < 0.999 || edgeFadeWidthUV > 0,
        opacity: opacity,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: opacity >= 0.999 && edgeFadeWidthUV <= 0
      });
      material.polygonOffset = true;
      material.polygonOffsetFactor = num(options?.polygonOffsetFactor, -5);
      material.polygonOffsetUnits = num(options?.polygonOffsetUnits, -5);
      material.customProgramCacheKey = function () {
        return "surface-layer-lit-v4";
      };
      material.onBeforeCompile = function (shader) {
        shader.uniforms.secondaryTex = uniforms.secondaryTex;
        shader.uniforms.hasSecondaryTex = uniforms.hasSecondaryTex;
        shader.uniforms.secondaryStrength = uniforms.secondaryStrength;
        shader.uniforms.mainScale = uniforms.mainScale;
        shader.uniforms.secondaryScale = uniforms.secondaryScale;
        shader.uniforms.edgeNoiseTex = uniforms.edgeNoiseTex;
        shader.uniforms.hasEdgeNoiseTex = uniforms.hasEdgeNoiseTex;
        shader.uniforms.edgeFadeWidth = uniforms.edgeFadeWidth;
        shader.uniforms.edgeNoiseStrength = uniforms.edgeNoiseStrength;
        shader.uniforms.edgeNoiseScale = uniforms.edgeNoiseScale;
        shader.uniforms.opacity = uniforms.opacity;
        shader.uniforms.time = uniforms.time;
        shader.uniforms.flowSpeed = uniforms.flowSpeed;
        shader.uniforms.flowDir = uniforms.flowDir;
        shader.uniforms.flowMain = uniforms.flowMain;
        shader.uniforms.flowSecondary = uniforms.flowSecondary;
        shader.uniforms.fallbackColor = uniforms.fallbackColor;
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec2 vSurfaceUv;")
          .replace("#include <uv_vertex>", "#include <uv_vertex>\nvSurfaceUv = uv;");
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying vec2 vSurfaceUv;\nuniform sampler2D secondaryTex;\nuniform float hasSecondaryTex;\nuniform float secondaryStrength;\nuniform vec2 secondaryScale;\nuniform sampler2D edgeNoiseTex;\nuniform float hasEdgeNoiseTex;\nuniform float edgeFadeWidth;\nuniform float edgeNoiseStrength;\nuniform vec2 edgeNoiseScale;\nuniform float time;\nuniform float flowSpeed;\nuniform vec2 flowDir;\nuniform float flowMain;\nuniform float flowSecondary;\nuniform vec3 fallbackColor;")
          .replace("#include <color_fragment>", "#include <color_fragment>\nvec2 surfaceFlow = flowDir * time * flowSpeed;\nvec2 surfaceSecondaryUv = vSurfaceUv * secondaryScale + surfaceFlow * flowSecondary;\nvec2 surfaceEdgeNoiseUv = vSurfaceUv * edgeNoiseScale;\nvec3 surfaceBaseColor = diffuseColor.rgb;\nvec4 surfaceSecondarySample = hasSecondaryTex > 0.5 ? sRGBTransferEOTF(texture2D(secondaryTex, surfaceSecondaryUv)) : vec4(surfaceBaseColor, diffuseColor.a);\nvec3 surfaceFinalColor = mix(surfaceBaseColor, surfaceSecondarySample.rgb, secondaryStrength * hasSecondaryTex);\nfloat surfaceEdgeDistance = min(vSurfaceUv.x, 1.0 - vSurfaceUv.x);\nfloat surfaceEdgeNoise = 0.0;\nif (hasEdgeNoiseTex > 0.5 && edgeNoiseStrength > 0.0 && edgeFadeWidth > 0.0) {\n  surfaceEdgeNoise = (texture2D(edgeNoiseTex, surfaceEdgeNoiseUv).r * 2.0 - 1.0) * edgeNoiseStrength * max(edgeFadeWidth, 0.001);\n}\nfloat surfaceEdgeAlpha = edgeFadeWidth > 0.001 ? smoothstep(0.0, edgeFadeWidth, surfaceEdgeDistance + surfaceEdgeNoise) : 1.0;\ndiffuseColor.rgb = surfaceFinalColor;\ndiffuseColor.a *= surfaceEdgeAlpha;");
      };
      material.userData.surfaceUniforms = uniforms;
      material.userData.surfaceState = Object.assign({}, surface);
      return material;
    }

    function applySurfaceLayerTexture(material, assetId, uniformName, hasUniformName, repeatX, repeatZ) {
      const asset = assetById(worldData, assetId);
      if (!asset) return false;
      retainTerrainTexture(asset, function (texture) {
        if (!material || material.userData?.terrainChunkDisposed === true) return;
        const uniforms = material?.userData?.surfaceUniforms || null;
        if (!uniforms) return;
        const clone = cloneTerrainTexture(texture, repeatX, repeatZ);
        if (uniformName === "mainTex") {
          clone.repeat.set(Math.max(0.0001, num(repeatX, 1)), Math.max(0.0001, num(repeatZ, 1)));
          replaceMaterialMapTexture(material, clone);
          material.color.set(0xffffff);
          material.needsUpdate = true;
          requestRender("surface-main-texture-loaded");
          return;
        }
        if (!uniforms[uniformName] || !uniforms[hasUniformName]) return;
        replaceUniformTexture(uniforms[uniformName], clone);
        uniforms[hasUniformName].value = 1.0;
        requestRender("surface-texture-loaded");
      });
      return true;
    }

    function registerTerrainPiece(meta, buildObjectFactory) {
      const entry = registerStreamableTerrainEntry(meta, buildObjectFactory);
      return entry;
    }

    for (const layer of layers) {
      const shapeType = String(layer?.shapeType || "full").trim().toLowerCase();
      const presetColor = terrainPresetColor(layer?.material);
      const userColor = colorFromHex(layer?.color, presetColor);
      const finalColor = mixColors(userColor, presetColor, 0.28);
      const opacity = clamp(num(layer?.opacity, 1), 0, 1);
      const priority = num(layer?.priority, 0);
      const yOffset = 0.05 + clamp(priority, -1000, 1000) * 0.001;
      const positionY = num(ground?.y, 0) + yOffset;
      const layerKey = layer?.id || "terrain";
      if (shapeType === "full") {
        for (const tile of groundTiles) {
          registerTerrainPiece({
            id: layerKey + "::" + tile.chunkKey,
            type: "terrainLayer",
            terrainKind: "layer",
            layerId: layerKey,
            chunkKey: terrainVisualChunkingEnabled ? tile.chunkKey : null,
            chunkKeys: terrainVisualChunkingEnabled ? [tile.chunkKey] : [],
            segmentId: tile.chunkKey,
            assetIds: layer?.textureAssetId ? [layer.textureAssetId] : []
          }, function () {
            const geometry = createWorldPlaneGeometry(tile.minX, tile.maxX, tile.minZ, tile.maxZ, positionY, terrainLayerUvBounds || {
              minX: tile.minX,
              maxX: tile.maxX,
              minZ: tile.minZ,
              maxZ: tile.maxZ,
              repeatX: 1,
              repeatZ: 1
            });
            if (!geometry) return null;
            const material = createOverlayMaterial(finalColor, opacity, {
              polygonOffsetFactor: -2,
              polygonOffsetUnits: -2
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = "GK terrain layer " + layerKey + " tile " + tile.chunkKey;
            mesh.renderOrder = 1000;
            mesh.userData.terrainRuntime = true;
            if (layer?.textureAssetId) {
              buildTextureClone(material, layer.textureAssetId, terrainLayerUvBounds?.repeatX || 1, terrainLayerUvBounds?.repeatZ || 1, function (clone) {
                if (!mesh || mesh.userData?.terrainChunkDisposed === true) {
                  clone.dispose();
                  return;
                }
                material.map = clone;
                material.needsUpdate = true;
              });
            }
            return { object: mesh, assetIds: layer?.textureAssetId ? [layer.textureAssetId] : [] };
          });
        }
        continue;
      }
      if (!hasGroundPlane || !Array.isArray(layer?.points) || layer.points.length < 3) continue;
      for (const tile of groundTiles) {
        registerTerrainPiece({
          id: layerKey + "::" + tile.chunkKey,
          type: "terrainLayer",
          terrainKind: "layer",
          layerId: layerKey,
          chunkKey: terrainVisualChunkingEnabled ? tile.chunkKey : null,
          chunkKeys: terrainVisualChunkingEnabled ? [tile.chunkKey] : [],
          segmentId: tile.chunkKey,
          assetIds: layer?.textureAssetId ? [layer.textureAssetId] : []
        }, function () {
          const geometry = createClippedPolygonTileGeometry(layer.points, tile);
          if (!geometry) return null;
          const material = createOverlayMaterial(finalColor, opacity, {
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = "GK terrain layer " + layerKey + " tile " + tile.chunkKey;
          mesh.position.y = positionY;
          mesh.renderOrder = 1000;
          mesh.userData.terrainRuntime = true;
          if (layer?.textureAssetId) {
            buildTextureClone(material, layer.textureAssetId, terrainLayerUvBounds?.repeatX || 1, terrainLayerUvBounds?.repeatZ || 1, function (clone) {
              if (!mesh || mesh.userData?.terrainChunkDisposed === true) {
                clone.dispose();
                return;
              }
              material.map = clone;
              material.needsUpdate = true;
            });
          }
          return { object: mesh, assetIds: layer?.textureAssetId ? [layer.textureAssetId] : [] };
        });
      }
    }

    for (const surface of surfaces) {
      const width = Math.max(0, num(surface?.width, 0));
      if (width <= 0) continue;
      const rawPoints = normalizeWorldPointList(surface?.points);
      if (rawPoints.length < 2) continue;
      const centerline = rawPoints.length >= 3 ? smoothPolyline(rawPoints, 8) : rawPoints;
      const surfaceY = num(ground?.y, 0) + num(surface?.yOffset, 0.02);
      const pieces = segmentPolylineForChunks(centerline, policy, {
        width: width,
        maxSegmentLength: maxSegmentLength,
        segmentBaseId: String(surface?.id || surface?.surfaceId || "surface")
      });
      for (const piece of pieces) {
        registerTerrainPiece({
          id: piece.id,
          type: "terrainSurface",
          terrainKind: "surface",
          layerId: surface?.id || surface?.surfaceId || null,
          segmentId: piece.segmentId,
          chunkKey: piece.chunkKey,
          chunkKeys: piece.chunkKeys,
          assetIds: normalizeTerrainAssetIds([
            surface?.textureAssetId,
            surface?.secondaryTextureAssetId,
            surface?.edgeFadeNoiseAssetId
          ])
        }, function () {
          const material = createTerrainSurfaceMaterial(surface, {
            polygonOffsetFactor: -5,
            polygonOffsetUnits: -5
          });
          const geometry = buildSurfaceStripGeometry(piece.points, {
            width: width,
            y: surfaceY,
            uvScale: 1,
            uvStartLength: 0
          });
          if (!geometry) return null;
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = "GK surface layer " + String(surface?.id || "surface") + "::" + piece.segmentId;
          mesh.renderOrder = 3500;
          mesh.castShadow = false;
          mesh.receiveShadow = Boolean(terrainShadowOptions().receiveShadow);
          mesh.userData.terrainRuntime = true;
          mesh.userData.surfaceLayerId = surface?.id || null;
          mesh.userData.entityId = surface?.id || null;

          const surfaceRecord = {
            surfaceId: String(surface?.id || surface?.surfaceId || "surface"),
            material: material,
            uniforms: material.userData.surfaceUniforms,
            mesh: mesh
          };
          registerTerrainSurfaceMaterialRecord(surfaceRecord.surfaceId, surfaceRecord);
          if (surface?.animated && num(surface?.flowSpeed, 0) !== 0) {
            surfaceAnimMaterials.push({
              material: material,
              uniforms: material.userData.surfaceUniforms,
              mainMap: null,
              baseMainOffset: new THREE.Vector2()
            });
          }
          if (surface?.textureAssetId) {
            const repeatX = Math.max(0.01, num(surface?.textureScaleX, num(surface?.textureScale, 1)));
            const repeatY = Math.max(0.01, num(surface?.textureScaleY, num(surface?.textureScale, 1)));
            applySurfaceLayerTexture(material, surface.textureAssetId, "mainTex", "hasMainTex", repeatX, repeatY);
          }
          if (surface?.secondaryTextureAssetId && num(surface?.secondaryTextureStrength, 0) > 0) {
            const repeatX = Math.max(0.01, num(surface?.secondaryTextureScaleX, num(surface?.secondaryTextureScale, 1)));
            const repeatY = Math.max(0.01, num(surface?.secondaryTextureScaleY, num(surface?.secondaryTextureScale, 1)));
            applySurfaceLayerTexture(material, surface.secondaryTextureAssetId, "secondaryTex", "hasSecondaryTex", repeatX, repeatY);
          }
          if (surface?.edgeFadeNoiseAssetId && num(surface?.edgeFadeNoiseStrength, 0) > 0) {
            const repeatX = Math.max(0.01, num(surface?.edgeFadeNoiseScaleX, num(surface?.edgeFadeNoiseScale, 1)));
            const repeatY = Math.max(0.01, num(surface?.edgeFadeNoiseScaleY, num(surface?.edgeFadeNoiseScale, 1)));
            applySurfaceLayerTexture(material, surface.edgeFadeNoiseAssetId, "edgeNoiseTex", "hasEdgeNoiseTex", repeatX, repeatY);
          }
          return {
            object: mesh,
            assetIds: normalizeTerrainAssetIds([
              surface?.textureAssetId,
              surface?.secondaryTextureAssetId,
              surface?.edgeFadeNoiseAssetId
            ]),
            cleanup: function () {
              unregisterTerrainSurfaceMaterialRecord(surfaceRecord.surfaceId, surfaceRecord);
              removeAnimMaterialEntry(surfaceAnimMaterials, material);
            }
          };
        });
      }
    }

    terrainStreamingState.textureAssets = terrainAssetIds.size;
    terrainStreamingState.surfaceMaterials = Array.from(surfaceMaterialRecords.values()).reduce(function (total, records) {
      return total + (records?.size || 0);
    }, 0);
  }

  function pickTerrainEditorHandle(clientX, clientY) {
    if (mode !== "editor" || !terrainEditorOverlay || !terrainEditorOverlay.visible) return null;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointer.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(terrainEditorOverlay.children, true);
    if (!hits.length) return null;
    for (const hit of hits) {
      const object = hit.object;
      if (object?.userData?.terrainHandle) {
        return {
          nodeId: object.userData.nodeId || null,
          handleRole: object.userData.handleRole || null,
          pointIndex: Number.isInteger(object.userData.pointIndex) ? object.userData.pointIndex : null
        };
      }
    }
    return null;
  }

  function pickScatterEditorHandle(clientX, clientY) {
    if (mode !== "editor" || !scatterEditorOverlay || !scatterEditorOverlay.visible) return null;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointer.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scatterEditorOverlay.children, true);
    if (!hits.length) return null;
    for (const hit of hits) {
      const object = hit.object;
      if (object?.userData?.scatterHandle) {
        return {
          nodeId: object.userData.nodeId || null,
          handleRole: object.userData.handleRole || null,
          pointIndex: Number.isInteger(object.userData.pointIndex) ? object.userData.pointIndex : null
        };
      }
    }
    return null;
  }

  function updateTransformGuide() {
    if (!transformGuide) return;
    if (!debugHelpersVisibleInCurrentMode()) {
      transformGuide.visible = false;
      return;
    }
    const object = selectedRoot;
    transformGuide.visible = Boolean(object);
    if (!object) return;
    object.updateWorldMatrix(true, true);
    const position = new THREE.Vector3();
    object.getWorldPosition(position);
    transformGuide.position.copy(position);
    transformGuide.quaternion.identity();
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    if (!box.isEmpty()) box.getSize(size);
    const maxSize = Math.max(size.x, size.y, size.z, 1);
    transformGuide.scale.setScalar(Math.min(6, Math.max(0.75, maxSize * 0.65)));
  }

  function bakeMinimapImage(config = {}) {
    const bounds = config.bounds;
    const minX = num(bounds?.minX, NaN);
    const maxX = num(bounds?.maxX, NaN);
    const minZ = num(bounds?.minZ, NaN);
    const maxZ = num(bounds?.maxZ, NaN);
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ) || maxX <= minX || maxZ <= minZ) {
      return Promise.reject(new Error("Minimap bake heeft geldige bounds nodig (minX < maxX, minZ < maxZ)."));
    }
    // 8192 is the practical ceiling: a 16k readback needs a ~1GB pixel buffer and exceeds many
    // GPUs' max texture size. Also clamp to what this GPU actually supports.
    const maxTextureSize = Math.max(2048, Number(renderer.capabilities?.maxTextureSize) || 8192);
    const resolution = Math.max(64, Math.min(8192, maxTextureSize, Math.round(num(config.resolution, 1024))));
    // MMO-03: format/background are no longer node-configurable - the bake is always an opaque
    // webp using the real scene's own background/fog, matching the live 3D world exactly.
    const format = "webp";
    const quality = Math.max(0.1, Math.min(1, num(config.quality, 0.78)));
    const backgroundColor = colorOrDefault(world?.world?.backgroundColor, "#101a26");
    const transparentBackground = false;
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const groundY = num(world?.ground?.y, 0);
    const highY = groundY + Math.max(20, Math.max(width, depth));

    const hiddenRoots = [];
    function hideRoot(root) {
      if (root && root.visible !== false) {
        hiddenRoots.push(root);
        root.visible = false;
      }
    }
    if (config.hideEditorHelpers !== false) {
      hideRoot(selectionHelper);
      hideRoot(terrainEditorOverlay);
      hideRoot(scatterEditorOverlay);
    }
    if (config.hideTransformControls !== false) hideRoot(transformGuide);
    if (config.hideChunkDebugOverlay !== false) hideRoot(chunkDebugOverlay);
    if (config.includeStaticModels === false) {
      for (const root of entityRoots.values()) hideRoot(root);
    }

    const bakeCamera = new THREE.OrthographicCamera(-width / 2, width / 2, depth / 2, -depth / 2, 0.1, (highY - groundY) + Math.max(width, depth) + 20);
    bakeCamera.position.set(centerX, highY, centerZ);
    bakeCamera.up.set(0, 0, -1);
    bakeCamera.lookAt(centerX, groundY, centerZ);
    bakeCamera.updateProjectionMatrix();

    // renderer.outputColorSpace only applies to the default framebuffer; a plain render target
    // stays linear, which made the bake visibly darker than the live 3D world. An sRGB render
    // target makes the GPU encode on write so readRenderTargetPixels returns the same values the
    // screen shows.
    const renderTarget = new THREE.WebGLRenderTarget(resolution, resolution, {
      type: THREE.UnsignedByteType,
      colorSpace: THREE.SRGBColorSpace
    });
    const previousTarget = renderer.getRenderTarget();
    const previousClearColor = new THREE.Color();
    renderer.getClearColor(previousClearColor);
    const previousClearAlpha = renderer.getClearAlpha();
    const previousAutoClear = renderer.autoClear;
    // Fog is distance-based and the bake camera sits at an artificial altitude far above anything
    // the game camera ever reaches, so leaving fog on washes out the bake in a way the live world
    // never looks. Temporarily disable it; ground/materials/lights/shadows stay identical.
    const previousFog = scene.fog;
    scene.fog = null;

    let outputCanvas = null;
    let bakeError = null;
    try {
      renderer.setRenderTarget(renderTarget);
      renderer.setClearColor(new THREE.Color(backgroundColor), transparentBackground ? 0 : 1);
      renderer.autoClear = true;
      renderer.clear(true, true, true);
      renderer.render(scene, bakeCamera);

      const pixels = new Uint8Array(resolution * resolution * 4);
      renderer.readRenderTargetPixels(renderTarget, 0, 0, resolution, resolution, pixels);

      outputCanvas = document.createElement("canvas");
      outputCanvas.width = resolution;
      outputCanvas.height = resolution;
      const ctx = outputCanvas.getContext("2d");
      const imageData = ctx.createImageData(resolution, resolution);
      const rowSize = resolution * 4;
      for (let y = 0; y < resolution; y += 1) {
        const srcStart = (resolution - y - 1) * rowSize;
        imageData.data.set(pixels.subarray(srcStart, srcStart + rowSize), y * rowSize);
      }
      ctx.putImageData(imageData, 0, 0);
    } catch (error) {
      bakeError = error;
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(previousClearColor, previousClearAlpha);
      renderer.autoClear = previousAutoClear;
      scene.fog = previousFog;
      renderTarget.dispose();
      for (const root of hiddenRoots) root.visible = true;
      requestRender("minimap-bake-restore");
    }
    if (bakeError) return Promise.reject(bakeError);

    const finalBounds = { minX, maxX, minZ, maxZ, width, depth };
    return new Promise(function (resolve, reject) {
      outputCanvas.toBlob(function (resultBlob) {
        if (!resultBlob) {
          reject(new Error("Minimap bake kon geen afbeelding exporteren."));
          return;
        }
        resolve({
          blob: resultBlob,
          width: resolution,
          height: resolution,
          bounds: finalBounds,
          format: format,
          quality: quality
        });
      }, "image/" + format, format === "webp" ? quality : undefined);
    });
  }

  function getMinimapMarkerSnapshot(options = {}) {
    const includeLocalPlayer = options.includeLocalPlayer !== false;
    const includeRemotePlayers = options.includeRemotePlayers !== false;
    const includeEntities = options.includeEntities !== false;
    const includeInteractables = options.includeInteractables === true;
    const snapshot = {
      localPlayer: null,
      remotePlayers: [],
      entities: [],
      interactables: [],
      // Editor free-orbit/pan only mutates orbitControls.target (camTarget is a load-time cache
      // that is not kept in sync), so prefer it here for a live editor-camera minimap marker.
      cameraTarget: orbitControls
        ? { x: orbitControls.target.x, z: orbitControls.target.z }
        : { x: camTarget.x, z: camTarget.z },
      selectedEntityId: selectedEntityId || null,
      selectedEntity: null
    };
    if (includeLocalPlayer && player.root) {
      const state = snapshotPlayerState();
      snapshot.localPlayer = { x: state.x, z: state.z, rotationY: state.rotationY, animationState: state.animationState };
    }
    if (includeRemotePlayers) {
      snapshot.remotePlayers = Array.from(remotePlayers.values()).map(function (record) {
        const position = record.renderState?.position || record.position || null;
        if (!position) return null;
        return {
          playerId: record.playerId,
          displayName: record.displayName || "",
          x: num(position.x, 0),
          z: num(position.z, 0),
          rotationY: num(position.rotationY, 0)
        };
      }).filter(Boolean);
    }
    if (includeEntities && world) {
      snapshot.entities = (Array.isArray(world.entities) ? world.entities : []).map(function (entity) {
        const position = entity?.transform?.position;
        if (!position) return null;
        return { id: entity.id, label: entity.label || entity.entityId || entity.id, x: num(position.x, 0), z: num(position.z, 0) };
      }).filter(Boolean);
    }
    if (includeInteractables && world) {
      snapshot.interactables = (Array.isArray(world.interactables) ? world.interactables : []).map(function (item) {
        const position = item?.position;
        if (!position) return null;
        return { id: item.id, x: num(position.x, 0), z: num(position.z, 0) };
      }).filter(Boolean);
    }
    if (selectedEntityId) {
      const selected = getSelectedEntitySnapshot();
      if (selected && selected.position) {
        snapshot.selectedEntity = { id: selectedEntityId, x: num(selected.position.x, 0), z: num(selected.position.z, 0) };
      }
    }
    return snapshot;
  }

  function getSelectedEntitySnapshot() {
    const root = refreshSelectedRootReference();
    if (!root) return null;
    root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    if (!box.isEmpty()) box.getSize(size);
    return {
      entityId: selectableIdForObject(root),
      type: root.userData?.playerId ? "player_character" : "model_entity",
      position: { x: round(root.position.x), y: round(root.position.y), z: round(root.position.z) },
      rotation: {
        x: round(root.rotation.x / DEG_TO_RAD),
        y: round(root.rotation.y / DEG_TO_RAD),
        z: round(root.rotation.z / DEG_TO_RAD)
      },
      scale: { x: round(root.scale.x), y: round(root.scale.y), z: round(root.scale.z) },
      dimensions: { x: round(size.x), y: round(size.y), z: round(size.z) },
      hasBounds: !box.isEmpty()
    };
  }

  function updateSelectionHelper() {
    if (!selectionHelper) return;
    if (!debugHelpersVisibleInCurrentMode()) {
      selectionHelper.object = null;
      selectionHelper.visible = false;
      updateTransformGuide();
      return;
    }
    const object = refreshSelectedRootReference();
    if (!object) {
      selectionHelper.object = null;
      selectionHelper.visible = false;
      if (selectionHelper.geometry?.computeBoundingBox) selectionHelper.geometry.computeBoundingBox();
      if (selectionHelper.geometry?.computeBoundingSphere) selectionHelper.geometry.computeBoundingSphere();
      updateTransformGuide();
      return;
    }
    object.updateWorldMatrix(true, true);
    object.traverse(function (child) {
      child.updateWorldMatrix(true, false);
    });
    selectionHelper.object = object;
    selectionHelper.visible = true;
    if (typeof selectionHelper.setFromObject === "function") selectionHelper.setFromObject(object);
    else selectionHelper.update();
    if (selectionHelper.geometry?.computeBoundingBox) selectionHelper.geometry.computeBoundingBox();
    if (selectionHelper.geometry?.computeBoundingSphere) selectionHelper.geometry.computeBoundingSphere();
    updateTransformGuide();
  }

  function clearSelectedRuntimeEntity() {
    selectedEntityId = null;
    selectedRoot = null;
    transformSession = null;
    transformState.active = false;
    transformState.cancelled = false;
    transformState.object = null;
    transformState.rootId = null;
    transformState.start = null;
    transformState.axis = null;
    if (selectionHelper) {
      selectionHelper.object = null;
      selectionHelper.visible = false;
    }
    if (transformGuide) transformGuide.visible = false;
    transformAxisConstraint = null;
    if (orbitControls) orbitControls.enabled = true;
    applyLocalView();
  }

  function applyLocalView() {
    const activeRoot = localViewActive ? selectedRoot : null;
    for (const child of content.children) {
      child.visible = !activeRoot || child === activeRoot;
    }
  }

  function captureTransformStart(object) {
    return {
      position: object.position.clone(),
      rotation: object.rotation.clone(),
      scale: object.scale.clone(),
      values: objectToTransform(object)
    };
  }

  function restoreTransformStart(state) {
    if (!state || !transformSession?.object) return;
    transformSession.object.position.copy(state.position);
    transformSession.object.rotation.copy(state.rotation);
    transformSession.object.scale.copy(state.scale);
  }

  function constraintKeyToAxis(axisKey) {
    if (axisKey === "x") return "x";
    if (axisKey === "y") return "z";
    if (axisKey === "z") return "y";
    return null;
  }

  function currentTransformAxes() {
    if (!transformAxisConstraint) {
      return { x: true, y: true, z: true };
    }
    const axis = constraintKeyToAxis(transformAxisConstraint);
    return {
      x: axis === "x",
      y: axis === "y",
      z: axis === "z"
    };
  }

  function activeSnapMode() {
    if (snapState.mode === "off" && modifierState.ctrlKey) return "grid";
    return snapState.mode;
  }

  function pointerFromEvent(event, buttonOverride) {
    return {
      x: Number(event.clientX) || 0,
      y: Number(event.clientY) || 0,
      button: buttonOverride !== undefined ? buttonOverride : event.button
    };
  }

  function getObjectScreenCenter(object) {
    if (!object) return null;
    object.updateWorldMatrix(true, true);
    const worldPosition = new THREE.Vector3();
    object.getWorldPosition(worldPosition);
    const ndc = worldPosition.clone().project(camera);
    if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y) || !Number.isFinite(ndc.z) || ndc.z < -1 || ndc.z > 1) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (ndc.x + 1) * 0.5 * rect.width,
      y: rect.top + (-ndc.y + 1) * 0.5 * rect.height
    };
  }

  function radialAngleForPointer(center, pointer) {
    if (!center || !pointer) return null;
    const dx = pointer.x - center.x;
    const dy = pointer.y - center.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 8) return null;
    return Math.atan2(dy, dx);
  }

  function normalizeAngleDelta(delta) {
    if (!Number.isFinite(delta)) return null;
    let next = delta;
    while (next > Math.PI) next -= Math.PI * 2;
    while (next < -Math.PI) next += Math.PI * 2;
    return next;
  }

  function radialRotationDelta(transform, pointer) {
    const center = transform?.radialCenter || getObjectScreenCenter(transform?.object);
    const startAngle = Number.isFinite(transform?.radialStartAngle)
      ? transform.radialStartAngle
      : radialAngleForPointer(center, transform?.startPointer);
    const currentAngle = radialAngleForPointer(center, pointer);
    if (!Number.isFinite(startAngle) || !Number.isFinite(currentAngle)) {
      const dx = pointer.x - transform.startPointer.x;
      const dy = pointer.y - transform.startPointer.y;
      return -(dx - dy) * 0.01;
    }
    const delta = normalizeAngleDelta(currentAngle - startAngle);
    return Number.isFinite(delta) ? -delta : 0;
  }

  function radialDistanceForPointer(center, pointer) {
    if (!center || !pointer) return null;
    const dx = pointer.x - center.x;
    const dy = pointer.y - center.y;
    const distance = Math.hypot(dx, dy);
    return Number.isFinite(distance) ? distance : null;
  }

  function radialScaleFactor(transform, pointer) {
    const center = transform?.radialCenter || getObjectScreenCenter(transform?.object);
    const startDistance = Number.isFinite(transform?.radialStartDistance)
      ? transform.radialStartDistance
      : radialDistanceForPointer(center, transform?.startPointer);
    const currentDistance = radialDistanceForPointer(center, pointer);
    if (!Number.isFinite(startDistance) || !Number.isFinite(currentDistance)) {
      const dx = pointer.x - transform.startPointer.x;
      const dy = pointer.y - transform.startPointer.y;
      return Math.max(0.001, 1 + (dx - dy) * 0.005);
    }
    return Math.max(0.001, 1 + (currentDistance - startDistance) * 0.005);
  }

  function projectedGroundVector(vector, fallbackX, fallbackZ) {
    const next = vector.clone();
    next.y = 0;
    if (next.lengthSq() < 0.000001) next.set(fallbackX, 0, fallbackZ);
    if (next.lengthSq() < 0.000001) next.set(1, 0, 0);
    return next.normalize();
  }

  function cameraGroundBasis() {
    camera.updateMatrixWorld(true);
    const screenRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const screenUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    return {
      right: projectedGroundVector(screenRight, 1, 0),
      forward: projectedGroundVector(screenUp, 0, -1)
    };
  }

  function worldUnitsPerPixel() {
    if (!orbitControls) return 0.01;
    const element = canvas;
    if (camera.isPerspectiveCamera) {
      const distance = camera.position.distanceTo(orbitControls.target);
      if (!Number.isFinite(distance) || distance <= 0) return 0.01;
      const targetDistance = distance * Math.tan((camera.fov * DEG_TO_RAD) / 2);
      return 2 * targetDistance / Math.max(1, element.clientHeight || 1);
    }
    if (camera.isOrthographicCamera) {
      const height = Math.max(1, element.clientHeight || 1);
      return (camera.top - camera.bottom) / Math.max(1, camera.zoom * height);
    }
    return 0.01;
  }

  function transformLabelForMode(mode) {
    if (mode === "rotate") return "Rotate Z";
    if (mode === "scale") return "Scale";
    return "Move";
  }

  function rootForSelectedTransform() {
    return selectedRoot || rootForSelectableId(selectedEntityId);
  }

  function isPointerOverTransformControls() {
    return false;
  }

  function selectableRootForObject(object) {
    let current = object;
    while (current) {
      if (current.userData?.entityId || current.userData?.playerId) return current;
      current = current.parent || null;
    }
    return null;
  }

  function applyTransformToObject(object, transform, pointer) {
    if (!object || !transform) return false;
    const mode = transform.mode || "move";
    const axis = transform.axis || null;
    const scale = worldUnitsPerPixel();
    const basis = cameraGroundBasis();
    const dx = pointer.x - transform.startPointer.x;
    const dy = pointer.y - transform.startPointer.y;
    let changed = false;
    if (mode === "move") {
      const groundDelta = new THREE.Vector3();
      groundDelta.addScaledVector(basis.right, dx * scale);
      groundDelta.addScaledVector(basis.forward, -dy * scale);
      const next = transform.startPosition.clone();
      if (!axis) {
        next.x += groundDelta.x;
        next.z += groundDelta.z;
        next.y = transform.startPosition.y;
      } else if (axis === "x") {
        next.x += groundDelta.x;
      } else if (axis === "y") {
        next.z += groundDelta.z;
      } else if (axis === "z") {
        next.y += -dy * scale;
      }
      if (snapState.mode === "grid" || (snapState.mode === "off" && modifierState.ctrlKey)) {
        const gridSize = Math.max(0.0001, num(snapState.gridSize, 1));
        if (!axis || axis === "x") next.x = Math.round(next.x / gridSize) * gridSize;
        if (!axis || axis === "y") next.z = Math.round(next.z / gridSize) * gridSize;
        if (!axis || axis === "z") next.y = Math.round(next.y / gridSize) * gridSize;
      }
      if (snapState.mode === "ground" && object.userData.snapToGround !== false) {
        next.y = num(world?.ground?.y, 0);
      }
      if (!object.position.equals(next)) {
        object.position.copy(next);
        changed = true;
      }
    } else if (mode === "rotate") {
      const next = transform.startRotation.clone();
      const rotationAxis = constraintKeyToAxis(axis || "z") || "y";
      next[rotationAxis] = transform.startRotation[rotationAxis] + radialRotationDelta(transform, pointer);
      if (!object.rotation.equals(next)) {
        object.rotation.copy(next);
        changed = true;
      }
    } else if (mode === "scale") {
      const factor = radialScaleFactor(transform, pointer);
      const next = transform.startScale.clone();
      if (!axis) {
        const uniform = Math.max(0.001, transform.startScale.x * factor);
        next.set(uniform, uniform, uniform);
      } else if (axis === "x") {
        next.x = Math.max(0.001, transform.startScale.x * factor);
      } else if (axis === "y") {
        next.z = Math.max(0.001, transform.startScale.z * factor);
      } else if (axis === "z") {
        next.y = Math.max(0.001, transform.startScale.y * factor);
      }
      if (!object.scale.equals(next)) {
        object.scale.copy(next);
        changed = true;
      }
    }
    return changed;
  }

  function applyTransformPreview(pointer, triggerChange = true) {
    if (!transformSession?.object) return false;
    const object = transformSession.object;
    const session = transformSession;
    session.currentPointer = { x: pointer.x, y: pointer.y };
    const dx = pointer.x - session.startPointer.x;
    const dy = pointer.y - session.startPointer.y;
    const changed = applyTransformToObject(object, session, pointer);
    transformDebugState = {
      active: true,
      rootId: session.rootId,
      mode: session.mode,
      axis: session.axis,
      dx: round(dx),
      dy: round(dy),
      changed: changed,
      previews: (transformDebugState.previews || 0) + 1,
      lastInputAt: Date.now()
    };
    if (changed) {
      updateSelectionHelper();
      if (triggerChange) onTransformChange(session.rootId, objectToTransform(object));
      requestRender();
    }
    return changed;
  }

  function previewTransformAt(clientX, clientY, triggerChange = true) {
    if (!transformSession?.object) return false;
    const x = Number(clientX);
    const y = Number(clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    rememberEditorPointer({ clientX: x, clientY: y });
    return applyTransformPreview({ x: x, y: y }, triggerChange);
  }

  function beginTransform(modeName) {
    if (transformSession?.object) return false;
    const root = rootForSelectedTransform();
    if (!root || root.userData.transformable === false) return false;
    viewportPanSession = null;
    const mode = modeName === "translate" ? "move" : modeName === "rotate" || modeName === "scale" ? modeName : "move";
    const rect = canvas.getBoundingClientRect();
    const startPointer = lastEditorPointer
      ? { x: lastEditorPointer.clientX, y: lastEditorPointer.clientY }
      : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const radialCenter = mode === "rotate" || mode === "scale" ? getObjectScreenCenter(root) : null;
    transformState = {
      active: true,
      cancelled: false,
      object: root,
      rootId: selectableIdForObject(root),
      start: captureTransformStart(root),
      mode: mode,
      axis: transformAxisConstraint,
      startPointer: startPointer,
      currentPointer: { x: startPointer.x, y: startPointer.y },
      startPosition: root.position.clone(),
      startRotation: root.rotation.clone(),
      startScale: root.scale.clone(),
      radialCenter: radialCenter,
      radialStartAngle: radialAngleForPointer(radialCenter, startPointer),
      radialStartDistance: radialDistanceForPointer(radialCenter, startPointer)
    };
    transformSession = transformState;
    transformDebugState = {
      active: true,
      rootId: transformState.rootId,
      mode: transformState.mode,
      axis: transformState.axis,
      dx: 0,
      dy: 0,
      changed: false,
      previews: 0,
      lastInputAt: Date.now()
    };
    if (orbitControls) orbitControls.enabled = false;
    canvas.style.cursor = mode === "rotate" ? "ew-resize" : mode === "scale" ? "nwse-resize" : "move";
    applyTransformPreview(startPointer, false);
    updateSelectionHelper();
    onTransformChange(transformState.rootId, objectToTransform(root));
    requestRender();
    return true;
  }

  function beginKeyboardTransform() {
    return beginTransform(transformState.mode || "move");
  }

  function setGizmoMode(modeName) {
    const mode = modeName === "translate" ? "move" : modeName === "rotate" || modeName === "scale" ? modeName : "move";
    transformState.mode = mode;
    if (transformSession) {
      transformSession.mode = mode;
      if (transformSession.currentPointer) applyTransformPreview(transformSession.currentPointer);
    }
    requestRender();
  }

  function setTransformAxis(axis) {
    transformAxisConstraint = axis === "x" || axis === "y" || axis === "z" ? axis : null;
    if (transformSession) {
      transformSession.axis = transformAxisConstraint;
      if (transformSession.currentPointer) applyTransformPreview(transformSession.currentPointer);
    }
    applyTransformSnapState();
    requestRender();
  }

  function finishTransform(commit) {
    if (!transformSession?.object) return false;
    const session = transformSession;
    const object = session.object;
    const start = session.start;
    const rootId = session.rootId;
    const current = objectToTransform(object);
    const changed = Boolean(start && JSON.stringify(current) !== JSON.stringify(start.values));
    const shouldCommit = Boolean(commit && changed && rootId);
    if (!commit && start) {
      restoreTransformStart(start);
    }
    transformSession = null;
    transformState.active = false;
    transformState.cancelled = !commit;
    transformState.object = null;
    transformState.rootId = null;
    transformState.start = null;
    transformState.axis = null;
    transformDebugState = Object.assign({}, transformDebugState, {
      active: false,
      rootId: rootId,
      mode: session.mode,
      axis: session.axis,
      changed: changed,
      lastInputAt: Date.now()
    });
    if (orbitControls) orbitControls.enabled = true;
    canvas.style.cursor = "";
    transformAxisConstraint = null;
    clearSelectedRuntimeEntity();
    if (shouldCommit) onTransformCommit(rootId, current);
    onTransformEnd({
      action: commit ? "confirm" : "cancel",
      entityId: rootId,
      mode: session.mode,
      axis: session.axis,
      transform: current,
      changed: changed
    });
    updateSelectionHelper();
    requestRender();
    return shouldCommit;
  }

  function confirmTransform() {
    if (transformSession?.object && lastEditorPointer) {
      previewTransformAt(lastEditorPointer.clientX, lastEditorPointer.clientY, true);
    }
    return finishTransform(true);
  }

  function cancelTransform() {
    return finishTransform(false);
  }

  function handleTransformPointerMove(event) {
    rememberEditorPointer(event);
    if (transformSession?.object) {
      event.preventDefault();
      event.stopImmediatePropagation();
      previewTransformAt(event.clientX, event.clientY, true);
      return;
    }
    if (viewportPanSession) handleViewportPanMove(event);
  }

  function handleTransformPointerUp(event) {
    rememberEditorPointer(event);
    if (transformSession?.object) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.button === 2 || event.button === 1) {
        cancelTransform();
        return;
      }
      if (event.button === 0 || event.button === undefined) {
        previewTransformAt(event.clientX, event.clientY, true);
        confirmTransform();
        return;
      }
      return;
    }
    if (viewportPanSession) handleViewportPanUp(event);
  }

  function applyTransformSnapState() {
    if (!transformSession?.object) return;
    if (transformSession.currentPointer) {
      applyTransformPreview(transformSession.currentPointer, false);
    }
  }

  function fitDistanceForBox(box, fovDegrees) {
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxSize = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maxSize) || maxSize <= 0.0001) return 8;
    const fov = (fovDegrees || camera.fov || 60) * DEG_TO_RAD;
    return (maxSize * 1.25) / Math.tan(fov / 2);
  }

  function frameObject(object, preserveDirection) {
    if (!orbitControls || !object) return false;
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) {
      const target = new THREE.Vector3();
      object.getWorldPosition(target);
      orbitControls.target.copy(target);
      orbitControls.update();
      requestRender();
      return true;
    }
    const center = new THREE.Vector3();
    box.getCenter(center);
    const currentOffset = camera.position.clone().sub(orbitControls.target);
    const direction = preserveDirection && currentOffset.lengthSq() > 0.0001
      ? currentOffset.normalize()
      : new THREE.Vector3(1, 1, 1).normalize();
    const distance = Math.max(1, fitDistanceForBox(box, camera.fov));
    orbitControls.target.copy(center);
    camera.position.copy(center).add(direction.multiplyScalar(distance));
    orbitControls.update();
    updateSelectionHelper();
    requestRender();
    return true;
  }

  // MMO-03: editor minimap click-to-focus. Pans the editor camera target to a ground x/z while
  // preserving the current distance/pitch/yaw (unlike frameWorldPoints, which re-fits zoom). Does
  // not touch any node value - purely a viewport navigation convenience.
  function focusGroundPoint(x, z) {
    if (!orbitControls) return false;
    const worldX = Number(x);
    const worldZ = Number(z);
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return false;
    const offset = camera.position.clone().sub(orbitControls.target);
    const nextTarget = new THREE.Vector3(worldX, orbitControls.target.y, worldZ);
    orbitControls.target.copy(nextTarget);
    camera.position.copy(nextTarget).add(offset);
    orbitControls.update();
    requestRender();
    return true;
  }

  function frameEntity(entityId) {
    const object = rootForSelectableId(entityId);
    if (!object) return false;
    return frameObject(object, true);
  }

  function frameAll() {
    if (localViewActive && selectedObjectRoot()) {
      return frameObject(selectedObjectRoot(), true);
    }
    return frameObject(content, true);
  }

  function frameWorldPoints(positions) {
    if (!orbitControls || !Array.isArray(positions) || positions.length === 0) return false;
    const box = new THREE.Box3();
    for (const pos of positions) {
      const x = Number(pos?.x);
      const y = Number(pos?.y);
      const z = Number(pos?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      const py = Number.isFinite(y) ? y : 0;
      box.expandByPoint(new THREE.Vector3(x, py, z));
    }
    if (box.isEmpty()) return false;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const currentOffset = camera.position.clone().sub(orbitControls.target);
    const direction = currentOffset.lengthSq() > 0.0001
      ? currentOffset.normalize()
      : new THREE.Vector3(1, 1, 1).normalize();
    const distance = Math.max(2, fitDistanceForBox(box, camera.fov));
    orbitControls.target.copy(center);
    camera.position.copy(center).add(direction.multiplyScalar(distance));
    orbitControls.update();
    updateSelectionHelper();
    requestRender();
    return true;
  }

  function setView(viewName) {
    if (!orbitControls) return false;
    const object = selectedObjectRoot() || content;
    const box = new THREE.Box3().setFromObject(object);
    const center = new THREE.Vector3();
    if (box.isEmpty()) {
      object.getWorldPosition(center);
    } else {
      box.getCenter(center);
    }
    const distance = Math.max(1, camera.position.distanceTo(orbitControls.target) || camDistance || 8);
    let direction = null;
    if (viewName === "front") direction = new THREE.Vector3(0, 0, 1);
    else if (viewName === "right") direction = new THREE.Vector3(1, 0, 0);
    else if (viewName === "top") direction = new THREE.Vector3(0, 1, 0);
    if (!direction) return false;
    orbitControls.target.copy(center);
    camera.position.copy(center).add(direction.multiplyScalar(distance));
    if (viewName === "top") camera.up.set(0, 0, -1); else camera.up.set(0, 1, 0);
    orbitControls.update();
    updateSelectionHelper();
    requestRender();
    return true;
  }

  function setTransformAxisConstraint(axis) {
    return setTransformAxis(axis);
  }

  function beginViewportPan(event) {
    if (!orbitControls || !event) return false;
    viewportPanSession = {
      pointerId: event.pointerId,
      lastClientX: event.clientX,
      lastClientY: event.clientY
    };
    if (typeof canvas.setPointerCapture === "function" && event.pointerId !== undefined) {
      try { canvas.setPointerCapture(event.pointerId); } catch {}
    }
    return true;
  }

  function panOrbitByPixels(deltaX, deltaY) {
    if (!orbitControls) return;
    const element = canvas;
    const pan = new THREE.Vector3();
    camera.updateMatrixWorld(true);
    if (camera.isPerspectiveCamera) {
      const distance = camera.position.distanceTo(orbitControls.target);
      if (!Number.isFinite(distance) || distance <= 0) return;
      const targetDistance = distance * Math.tan((camera.fov * DEG_TO_RAD) / 2);
      const scale = 2 * targetDistance / Math.max(1, element.clientHeight || 1);
      pan.setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-deltaX * scale);
      pan.addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1), deltaY * scale);
    } else if (camera.isOrthographicCamera) {
      const width = Math.max(1, element.clientWidth || 1);
      const height = Math.max(1, element.clientHeight || 1);
      const scaleX = (camera.right - camera.left) / Math.max(1, camera.zoom * width);
      const scaleY = (camera.top - camera.bottom) / Math.max(1, camera.zoom * height);
      pan.setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-deltaX * scaleX);
      pan.addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1), deltaY * scaleY);
    } else {
      return;
    }
    camera.position.add(pan);
    orbitControls.target.add(pan);
    orbitControls.update();
    requestRender();
  }

  function handleViewportPanMove(event) {
    if (!viewportPanSession || event.pointerId !== viewportPanSession.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const deltaX = event.clientX - viewportPanSession.lastClientX;
    const deltaY = event.clientY - viewportPanSession.lastClientY;
    viewportPanSession.lastClientX = event.clientX;
    viewportPanSession.lastClientY = event.clientY;
    if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) panOrbitByPixels(deltaX, deltaY);
  }

  function handleViewportPanUp(event) {
    if (!viewportPanSession || event.pointerId !== viewportPanSession.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    viewportPanSession = null;
    if (typeof canvas.releasePointerCapture === "function" && event.pointerId !== undefined) {
      try { canvas.releasePointerCapture(event.pointerId); } catch {}
    }
    requestRender();
  }

  function setSnapState(modeName, gridSize) {
    snapState.mode = ["off", "grid", "ground"].includes(modeName) ? modeName : "off";
    snapState.gridSize = Math.max(0.001, num(gridSize, 1));
    applyTransformSnapState();
    requestRender();
  }

  function setAnimationPreviewEnabled(enabled) {
    previewAnimations = Boolean(enabled);
    requestRender("preview-toggle");
    return previewAnimations;
  }

  function isAnimationPreviewEnabled() {
    return previewAnimations;
  }

  function applyCameraConfig(worldData) {
    const gameCameraDefaults = {
      pitch: 55,
      yaw: 0,
      startDistance: 24,
      distance: 24,
      minDistance: 10,
      maxDistance: 48,
      fov: 50,
      follow: true,
      rotateSpeed: 90,
      targetHeightOffset: 1.6
    };
    const editorCameraDefaults = {
      target: { x: 0, y: 0, z: 0 },
      pitch: 55,
      yaw: 0,
      distance: 24,
      minDistance: 10,
      maxDistance: 48,
      fov: 50,
      rotateSpeed: 90
    };
    const cam = mode === "editor"
      ? (worldData?.editorCamera || editorCameraDefaults)
      : (worldData?.camera || gameCameraDefaults);
    camPitch = num(cam?.pitch, mode === "editor" ? editorCameraDefaults.pitch : gameCameraDefaults.pitch);
    camYaw = num(cam?.yaw, mode === "editor" ? editorCameraDefaults.yaw : gameCameraDefaults.yaw);
    camDistance = mode === "editor"
      ? num(cam?.distance, editorCameraDefaults.distance)
      : num(Number.isFinite(Number(cam?.startDistance)) ? cam.startDistance : cam?.distance, gameCameraDefaults.startDistance);
    camMinDistance = num(cam?.minDistance, mode === "editor" ? editorCameraDefaults.minDistance : gameCameraDefaults.minDistance);
    camMaxDistance = num(cam?.maxDistance, mode === "editor" ? editorCameraDefaults.maxDistance : gameCameraDefaults.maxDistance);
    camFollow = mode === "editor" ? false : cam?.follow !== false;
    camRotateSpeed = num(cam?.rotateSpeed, mode === "editor" ? editorCameraDefaults.rotateSpeed : gameCameraDefaults.rotateSpeed);
    camTargetHeightOffset = mode === "game" ? numOrDefault(cam?.targetHeightOffset, gameCameraDefaults.targetHeightOffset) : 0;
    if (mode === "editor") {
      camTarget.set(
        num(cam?.target?.x, editorCameraDefaults.target.x),
        num(cam?.target?.y, editorCameraDefaults.target.y),
        num(cam?.target?.z, editorCameraDefaults.target.z)
      );
    } else {
      camTarget.copy(playerCameraTarget());
    }
    const shouldApplyToViewport = mode === "game" || !editorViewInitialized;
    if (shouldApplyToViewport) {
      camera.fov = num(cam?.fov, mode === "editor" ? editorCameraDefaults.fov : gameCameraDefaults.fov);
      camera.updateProjectionMatrix();
      updateCameraPosition();
      if (orbitControls) {
        orbitControls.target.copy(camTarget);
        orbitControls.minDistance = camMinDistance;
        orbitControls.maxDistance = camMaxDistance;
        orbitControls.update();
      }
    }
  }

  function updateCameraPosition() {
    const pitchRad = camPitch * DEG_TO_RAD;
    const yawRad = camYaw * DEG_TO_RAD;
    const horizontal = Math.cos(pitchRad) * camDistance;
    const offsetX = Math.sin(yawRad) * horizontal;
    const offsetZ = Math.cos(yawRad) * horizontal;
    const offsetY = Math.sin(pitchRad) * camDistance;
    camera.position.set(camTarget.x + offsetX, camTarget.y + offsetY, camTarget.z + offsetZ);
    camera.lookAt(camTarget);
  }

  function setZoom(value) {
    camDistance = Math.min(camMaxDistance, Math.max(camMinDistance, value));
  }

  function playerCameraTarget() {
    return playerCameraTargetCache.set(player.pos.x, player.pos.y + camTargetHeightOffset, player.pos.z);
  }

  function addGround(worldData) {
    const ground = worldData?.ground;
    if (!ground?.width || !ground?.depth) return;
    const bounds = effectiveGroundBounds(ground);
    if (!bounds) return;
    const geometry = createWorldPlaneGeometry(bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ, num(ground.y, 0), {
      minX: 0,
      maxX: groundTextureWorldSize(ground).x,
      minZ: 0,
      maxZ: groundTextureWorldSize(ground).z,
      repeatX: 1,
      repeatZ: 1
    });
    if (!geometry) return;
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorOrDefault(ground.materialColor, "#ffffff")),
      roughness: 0.9,
      metalness: 0,
      flatShading: sharedWorldPerformance().smoothShading === false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "published-ground";
    mesh.receiveShadow = Boolean(groundShadowOptions().receiveShadow);
    mesh.userData.terrainRuntime = true;
    mesh.userData.groundPlane = true;
    mesh.userData.terrainChunkDisposed = false;
    const textureAsset = assetById(worldData, ground.textureAssetId);
    fullGroundPlaneTextureAssetId = textureAsset?.id || null;
    if (textureAsset?.sourcePath) {
      retainTerrainTexture(textureAsset, function (texture) {
        if (fullGroundPlane !== mesh || mesh.userData?.terrainChunkDisposed === true) {
          return;
        }
        const clone = texture.clone();
        clone.colorSpace = THREE.SRGBColorSpace;
        clone.wrapS = THREE.RepeatWrapping;
        clone.wrapT = THREE.RepeatWrapping;
        clone.repeat.set(1, 1);
        clone.needsUpdate = true;
        material.map = clone;
        material.needsUpdate = true;
      });
    }
    const group = ensureTerrainRuntimeGroup();
    group.add(mesh);
    fullGroundPlane = mesh;
    runtimeStats.sceneObjects += 1;
    runtimeStats.meshes += 1;
  }

  function addLights(worldData) {
    const policy = currentShadowPolicy();
    if (stableSunShadowController?.setPolicy) stableSunShadowController.setPolicy(policy);
    for (const light of worldData?.lights || []) {
      if (light.type === "ambient") {
        content.add(new THREE.AmbientLight(colorOrDefault(light.color, "#ffffff"), num(light.intensity, 0)));
        runtimeStats.sceneObjects += 1;
      } else if (light.type === "directional") {
        const directional = new THREE.DirectionalLight(colorOrDefault(light.color, "#ffffff"), num(light.intensity, 0));
        directional.position.set(num(light.position?.x, 0), num(light.position?.y, 0), num(light.position?.z, 0));
        directional.userData.shadowBasePosition = directional.position.clone();
        directional.userData.shadowBaseTarget = new THREE.Vector3(0, 0, 0);
        applyDirectionalShadowPolicy(directional, policy);
        content.add(directional);
        if (directional.target && !directional.target.parent) scene.add(directional.target);
        directionalLights.push(directional);
        if (stableSunShadowController?.registerDirectionalLight) stableSunShadowController.registerDirectionalLight(directional);
        runtimeStats.sceneObjects += 1;
      }
    }
  }

  function ensureModelRecord(asset, worldData) {
    if (!asset?.sourcePath) return null;
    let record = modelCache.get(asset.id);
    if (record) return record;
    record = { status: "loading", gltf: null, waiters: [] };
    modelCache.set(asset.id, record);
    const startedAt = performance.now();
    if (debugWarningsVisibleInCurrentMode()) {
      console.info("[timing] GLTFLoader load start asset=" + asset.id + " path=" + asset.sourcePath);
    }
    try {
      loader.load(asset.sourcePath, function (gltf) {
        record.status = "ready";
        record.gltf = gltf;
        record.gltf.animations = normalizeAnimations(gltf.animations);
        if (debugWarningsVisibleInCurrentMode()) {
          console.info("[timing] GLTFLoader load end asset=" + asset.id + " " + timingMs(startedAt) + "ms");
        }
        if (typeof onModelLoadTiming === "function") {
          onModelLoadTiming({
            assetId: asset.id,
            assetName: asset.name,
            sourcePath: asset.sourcePath,
            durationMs: Number(timingMs(startedAt)),
            ok: true
          });
        }
        for (const waiter of record.waiters.splice(0)) waiter(gltf);
      }, undefined, function () {
        record.status = "error";
        loadErrors.push("Model: " + asset.name);
        renderHud();
        if (debugWarningsVisibleInCurrentMode()) {
          console.info("[timing] GLTFLoader load end asset=" + asset.id + " " + timingMs(startedAt) + "ms error");
        }
        if (typeof onModelLoadTiming === "function") {
          onModelLoadTiming({
            assetId: asset.id,
            assetName: asset.name,
            sourcePath: asset.sourcePath,
            durationMs: Number(timingMs(startedAt)),
            ok: false
          });
        }
      });
    } catch (error) {
      record.status = "error";
      loadErrors.push("Model: " + asset.name);
      renderHud();
      if (debugWarningsVisibleInCurrentMode()) {
        console.info("[timing] GLTFLoader load end asset=" + asset.id + " " + timingMs(startedAt) + "ms error");
      }
      if (typeof onModelLoadTiming === "function") {
        onModelLoadTiming({
          assetId: asset.id,
          assetName: asset.name,
          sourcePath: asset.sourcePath,
          durationMs: Number(timingMs(startedAt)),
          ok: false
        });
      }
      throw error;
    }
    return record;
  }

  function loadModelInto(root, assetId, worldData, onReady, options = {}) {
    const asset = assetById(worldData, assetId);
    if (!asset?.sourcePath) return;
    const record = ensureModelRecord(asset, worldData);
    if (!record) return;
    const generation = worldBuildGeneration;
    const attach = function (gltf) {
      if (generation !== worldBuildGeneration) return;
      if (root?.userData?.runtimeAlive === false) return;
      const clone = SkeletonUtils.clone(gltf.scene);
      applySmoothShadingToObject(clone, worldData?.world?.performance?.shared?.smoothShading !== false);
      const castShadow = options.castShadow !== false;
      const receiveShadow = options.receiveShadow !== false;
      clone.traverse(function (child) {
        child.userData = child.userData || {};
        child.userData.runtimeAlive = true;
        child.userData.runtimeResourcesShared = true;
        if (child.isMesh || child.isInstancedMesh) {
          child.castShadow = castShadow;
          child.receiveShadow = receiveShadow;
        }
      });
      clone.userData = clone.userData || {};
      clone.userData.runtimeAlive = true;
      clone.userData.runtimeResourcesShared = true;
      root.add(clone);
      const cloneCounts = countObjectTree(clone);
      runtimeStats.sceneObjects += cloneCounts.objects;
      runtimeStats.meshes += cloneCounts.meshes;
      const clips = Array.isArray(gltf.animations) ? gltf.animations : [];
      if (clips.length) {
        const mixer = new THREE.AnimationMixer(clone);
        animationMixers.set(root, {
          mixer: mixer,
          root: clone,
          actions: new Map(),
          currentAction: null,
          currentClipName: null,
          clips: clips,
          assetMetadata: asset.metadata || {}
        });
        const initialAnimationState = root === player.root ? player.animationState || "idle" : "idle";
        playAnimationState(root, initialAnimationState, 0);
      }
      if (onReady) onReady(clone);
      if (selectedEntityId && selectableIdForObject(root) === selectedEntityId) selectEntity(selectedEntityId);
      requestRender();
    };
    if (record.status === "ready") attach(record.gltf);
    if (record.status === "loading") record.waiters.push(attach);
  }

  function createInstancedScatterBatch(gltf, instances, options = {}) {
    if (!gltf?.scene || !Array.isArray(instances) || !instances.length) return null;
    const templates = [];
    let supported = true;
    const batchKind = String(options.batchKind || "scatter").trim() || "scatter";
    const smoothShading = options.smoothShading !== false;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(function (child) {
      if (!child.isMesh) return;
      if (child.isSkinnedMesh || Array.isArray(child.material) || !child.geometry || !child.material) {
        supported = false;
        return;
      }
      const material = child.material.clone();
      applySmoothShadingToMaterial(material, smoothShading);
      templates.push({
        name: String(child.name || "").trim(),
        geometry: child.geometry.clone(),
        material: material,
        matrix: child.matrixWorld.clone(),
        castShadow: child.castShadow !== false,
        receiveShadow: child.receiveShadow !== false
      });
    });
    if (!supported || !templates.length) return null;
    const group = new THREE.Group();
    group.name = options.groupName || batchKind + "-batch";
    group.userData.batchKind = batchKind;
    group.userData[batchKind + "Batch"] = true;
    group.userData.runtimeAlive = true;
    group.userData.transformable = false;
    group.userData.snapToGround = false;
    group.matrixAutoUpdate = false;
    const chunkKeys = Array.isArray(options.chunkKeys) && options.chunkKeys.length
      ? Array.from(new Set(options.chunkKeys.map(function (key) { return String(key || "").trim(); }).filter(Boolean)))
      : (options.chunkKey ? [String(options.chunkKey).trim()] : []);
    if (chunkKeys.length) {
      group.userData.chunkKeys = chunkKeys.slice();
      group.userData.chunkKey = String(options.chunkKey || chunkKeys[0] || "");
    }
    const instanceTransform = new THREE.Object3D();
    const instanceMatrix = new THREE.Matrix4();
    const instanceTransforms = instances.map(function (entity) { return entity?.transform || null; }).filter(Boolean);
    if (!instanceTransforms.length) return null;
    for (const template of templates) {
      const mesh = new THREE.InstancedMesh(template.geometry, template.material, instanceTransforms.length);
      mesh.name = template.name ? template.name + " [" + batchKind + "]" : batchKind + " [instances]";
      mesh.castShadow = options.castShadow !== false;
      mesh.receiveShadow = options.receiveShadow !== false;
      mesh.frustumCulled = true;
      mesh.matrixAutoUpdate = false;
      for (let index = 0; index < instanceTransforms.length; index += 1) {
        const transform = instanceTransforms[index];
        instanceTransform.position.set(num(transform?.position?.x, 0), num(transform?.position?.y, 0), num(transform?.position?.z, 0));
        instanceTransform.rotation.set(
          num(transform?.rotation?.x, 0) * DEG_TO_RAD,
          num(transform?.rotation?.y, 0) * DEG_TO_RAD,
          num(transform?.rotation?.z, 0) * DEG_TO_RAD
        );
        instanceTransform.scale.set(num(transform?.scale?.x, 1), num(transform?.scale?.y, 1), num(transform?.scale?.z, 1));
        instanceTransform.updateMatrix();
        instanceMatrix.multiplyMatrices(instanceTransform.matrix, template.matrix);
        mesh.setMatrixAt(index, instanceMatrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (typeof mesh.computeBoundingSphere === "function") mesh.computeBoundingSphere();
      group.add(mesh);
    }
    return group;
  }

  function loadScatterInstancesInto(root, assetId, instances, worldData, options = {}) {
    const asset = assetById(worldData, assetId);
    if (!asset?.sourcePath || !Array.isArray(instances) || !instances.length) return;
    const record = ensureModelRecord(asset, worldData);
    if (!record) return;
    const generation = worldBuildGeneration;
    const chunkPolicy = options.chunkPolicy || resolveChunkPolicy(worldData, mode);
    const attach = function (gltf) {
      if (generation !== worldBuildGeneration) return;
      if (root?.userData?.runtimeAlive === false) return;
      const residentChunkKey = String(options.chunkKey || "").trim();
      if (options.residentStreaming === true && residentChunkKey && !residentContentState.residentChunkKeys.has(residentChunkKey)) return;
      const canBatch = options.allowBatch !== false;
      const chunkGroups = canBatch
        ? groupEntriesByChunkKey(instances, chunkPolicy, function (entity) { return entity?.transform || null; })
        : { grouped: new Map(), unchunked: Array.isArray(instances) ? instances.slice() : [] };
      let handledAny = false;
      for (const [chunkKeyValue, chunkInstances] of chunkGroups.grouped.entries()) {
        if (!Array.isArray(chunkInstances) || !chunkInstances.length) continue;
        if (!canBatch || chunkInstances.length < 2) {
          for (const entity of chunkInstances) {
            const instanceRoot = new THREE.Group();
            instanceRoot.userData.scatterInstance = true;
            instanceRoot.userData.chunkRuntimeType = "scatter";
            instanceRoot.userData.transformable = false;
            instanceRoot.userData.snapToGround = false;
            instanceRoot.userData.runtimeAlive = true;
            instanceRoot.userData.chunkKey = chunkKeyValue;
            instanceRoot.name = entity.id || (entity.nodeId + "::instance");
            transformObject(instanceRoot, entity.transform);
            root.add(instanceRoot);
            runtimeStats.sceneObjects += 1;
            registerChunkRuntimeEntry({
              id: entity.id || (entity.nodeId + "::instance"),
              type: "scatter",
              object: instanceRoot,
              chunkKey: chunkKeyValue,
              chunkKeys: [chunkKeyValue],
              hasVisual: true
            });
            loadModelInto(instanceRoot, assetId, worldData, null, {
              castShadow: options.castShadow !== false,
              receiveShadow: options.receiveShadow !== false
            });
            if (options.castShadow !== false) scatterShadowFallbacks += 1;
          }
          handledAny = true;
          continue;
        }
        const batch = createInstancedScatterBatch(gltf, chunkInstances, {
          batchKind: "scatter",
          groupName: asset.name || asset.id,
          castShadow: options.castShadow !== false,
          receiveShadow: options.receiveShadow !== false,
          smoothShading: worldData?.world?.performance?.shared?.smoothShading !== false,
          chunkKey: chunkKeyValue,
          chunkKeys: [chunkKeyValue]
        });
        if (!batch) {
          for (const entity of chunkInstances) {
            const instanceRoot = new THREE.Group();
            instanceRoot.userData.scatterInstance = true;
            instanceRoot.userData.chunkRuntimeType = "scatter";
            instanceRoot.userData.transformable = false;
            instanceRoot.userData.snapToGround = false;
            instanceRoot.userData.runtimeAlive = true;
            instanceRoot.userData.chunkKey = chunkKeyValue;
            instanceRoot.name = entity.id || (entity.nodeId + "::instance");
            transformObject(instanceRoot, entity.transform);
            root.add(instanceRoot);
            runtimeStats.sceneObjects += 1;
            registerChunkRuntimeEntry({
              id: entity.id || (entity.nodeId + "::instance"),
              type: "scatter",
              object: instanceRoot,
              chunkKey: chunkKeyValue,
              chunkKeys: [chunkKeyValue],
              hasVisual: true
            });
            loadModelInto(instanceRoot, assetId, worldData, null, {
              castShadow: options.castShadow !== false,
              receiveShadow: options.receiveShadow !== false
            });
            if (options.castShadow !== false) scatterShadowFallbacks += 1;
          }
          handledAny = true;
          continue;
        }
        batch.userData.chunkKey = chunkKeyValue;
        batch.userData.chunkKeys = [chunkKeyValue];
        root.add(batch);
        const batchCounts = countObjectTree(batch);
        runtimeStats.sceneObjects += batchCounts.objects;
        runtimeStats.meshes += batchCounts.meshes;
        registerChunkRuntimeEntry({
          id: (asset.id || assetId) + "::" + chunkKeyValue + "::scatter-batch",
          type: "scatter",
          object: batch,
          chunkKey: chunkKeyValue,
          chunkKeys: [chunkKeyValue],
          hasVisual: true
        });
        handledAny = true;
      }
      for (const entity of chunkGroups.unchunked) {
        const instanceRoot = new THREE.Group();
        instanceRoot.userData.scatterInstance = true;
        instanceRoot.userData.chunkRuntimeType = "scatter";
        instanceRoot.userData.transformable = false;
        instanceRoot.userData.snapToGround = false;
        instanceRoot.name = entity.id || (entity.nodeId + "::instance");
        transformObject(instanceRoot, entity.transform);
        root.add(instanceRoot);
        runtimeStats.sceneObjects += 1;
        registerChunkRuntimeEntry({
          id: entity.id || (entity.nodeId + "::instance"),
          type: "scatter",
          object: instanceRoot,
          hasVisual: true
        });
        loadModelInto(instanceRoot, assetId, worldData, null, {
          castShadow: options.castShadow !== false,
          receiveShadow: options.receiveShadow !== false
        });
        if (options.castShadow !== false) scatterShadowFallbacks += 1;
        handledAny = true;
      }
      if (!handledAny) return;
      if (selectedEntityId && selectableIdForObject(root) === selectedEntityId) selectEntity(selectedEntityId);
      requestRender();
    };
    if (record.status === "ready") attach(record.gltf);
    if (record.status === "loading") record.waiters.push(attach);
  }

  function transformObject(object, transform) {
    const position = transform?.position || {};
    const rotation = transform?.rotation || {};
    const scale = transform?.scale || {};
    object.position.set(num(position.x, 0), num(position.y, 0), num(position.z, 0));
    object.rotation.set(num(rotation.x, 0) * DEG_TO_RAD, num(rotation.y, 0) * DEG_TO_RAD, num(rotation.z, 0) * DEG_TO_RAD);
    object.scale.set(num(scale.x, 1), num(scale.y, 1), num(scale.z, 1));
  }

  function objectToTransform(object) {
    return {
      x: round(object.position.x),
      y: round(object.position.y),
      z: round(object.position.z),
      rotationX: round(object.rotation.x / DEG_TO_RAD),
      rotationY: round(object.rotation.y / DEG_TO_RAD),
      rotationZ: round(object.rotation.z / DEG_TO_RAD),
      scaleX: round(object.scale.x),
      scaleY: round(object.scale.y),
      scaleZ: round(object.scale.z)
    };
  }

  function normalizeAnimations(animations) {
    return (animations || []).map(function (clip, index) {
      const next = clip.clone();
      const name = String(next.name || "").trim();
      next.name = name || "Animation " + (index + 1);
      return next;
    });
  }

  function findClipName(clips, preferredName) {
    const names = (clips || []).map(function (clip) { return String(clip?.name || "").trim(); }).filter(Boolean);
    if (!names.length) return null;
    const preferred = String(preferredName || "").trim();
    if (!preferred) return null;
    const exact = names.find(function (name) { return name === preferred; });
    if (exact) return exact;
    const lower = preferred.toLowerCase();
    const caseMatch = names.find(function (name) { return name.toLowerCase() === lower; });
    if (caseMatch) return caseMatch;
    const contains = names.find(function (name) { return name.toLowerCase().includes(lower); });
    if (contains) return contains;
    return null;
  }

  function clipNameMatchesState(clipName, stateName) {
    const text = String(clipName || "").trim().toLowerCase();
    const state = String(stateName || "").trim().toLowerCase();
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

  function resolveClipNameForState(root, clips, stateName, assetMetadata) {
    const state = String(stateName || "").trim().toLowerCase();
    const data = root?.userData || {};
    if (!Array.isArray(clips) || !clips.length) return null;
    const defaultName = String(assetMetadata?.defaultAnimation || "").trim();
    const firstName = String(clips[0]?.name || "").trim() || null;
    const pick = function (preferredName, desiredState = state) {
      const resolved = findClipName(clips, preferredName);
      if (!resolved) return null;
      if (!desiredState) return resolved;
      return clipNameMatchesState(resolved, desiredState) ? resolved : null;
    };
    if (state === "walk") {
      return pick(data.walkAnimation, "walk")
        || pick("Walk", "walk")
        || pick(data.animationClip, "walk")
        || pick(defaultName, "walk")
        || pick(data.idleAnimation, "idle")
        || findClipName(clips, data.walkAnimation)
        || findClipName(clips, data.animationClip)
        || findClipName(clips, defaultName)
        || findClipName(clips, "Walk")
        || findClipName(clips, "Idle")
        || findClipName(clips, "Run")
        || firstName
        || null;
    }
    if (state === "run") {
      return pick(data.runAnimation, "run")
        || pick("Run", "run")
        || pick(data.animationClip, "run")
        || pick(defaultName, "run")
        || pick(data.walkAnimation, "walk")
        || findClipName(clips, data.runAnimation)
        || findClipName(clips, data.animationClip)
        || findClipName(clips, defaultName)
        || findClipName(clips, "Run")
        || findClipName(clips, "Walk")
        || findClipName(clips, "Idle")
        || firstName
        || null;
    }
    return pick(data.idleAnimation, "idle")
      || pick(defaultName, "idle")
      || pick("Idle", "idle")
      || pick(data.animationClip, "idle")
      || findClipName(clips, data.idleAnimation)
      || findClipName(clips, defaultName)
      || findClipName(clips, data.animationClip)
      || findClipName(clips, "Idle")
      || findClipName(clips, "Walk")
      || findClipName(clips, "Run")
      || firstName
      || null;
  }

  function resolveAnimationPlaybackScale() {
    return 1;
  }

  function getAnimationAction(record, clipName) {
    if (!record || !clipName) return null;
    const existing = record.actions.get(clipName);
    if (existing) return existing;
    const clip = (record.clips || []).find(function (candidate) {
      return String(candidate?.name || "").trim() === clipName;
    }) || null;
    if (!clip) return null;
    const action = record.mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    record.actions.set(clipName, action);
    return action;
  }

  function playAnimationState(root, stateName, fadeSeconds = 0.15) {
    const record = animationMixers.get(root);
    if (!record || !Array.isArray(record.clips) || !record.clips.length) return null;
    const clipName = resolveClipNameForState(root, record.clips, stateName, record.assetMetadata || {});
    if (!clipName) return null;
    const nextAction = getAnimationAction(record, clipName);
    if (!nextAction) return null;
    const nextClip = (record.clips || []).find(function (candidate) {
      return String(candidate?.name || "").trim() === clipName;
    }) || null;
    const playbackScale = resolveAnimationPlaybackScale(root, nextClip, stateName, record);
    nextAction.setEffectiveTimeScale(playbackScale);
    if (record.currentClipName === clipName) return clipName;
    const previousAction = record.currentAction;
    nextAction.reset();
    nextAction.enabled = true;
    nextAction.setLoop(THREE.LoopRepeat, Infinity);
    nextAction.clampWhenFinished = false;
    if (previousAction && previousAction !== nextAction) {
      if (fadeSeconds > 0) {
        previousAction.fadeOut(fadeSeconds);
        nextAction.fadeIn(fadeSeconds);
      } else {
        previousAction.stop();
      }
    } else {
      nextAction.setEffectiveWeight(1);
    }
    nextAction.play();
    record.currentAction = nextAction;
    record.currentClipName = clipName;
    return clipName;
  }

  function getAnimationDebugForRoot(root) {
    const record = animationMixers.get(root) || animationMixers.get(root?.parent || null) || null;
    if (!record) {
      return {
        animationClipName: null,
        animationClipDuration: null,
        animationPlaybackScale: null,
        animationActionTime: null
      };
    }
    const clipName = String(record.currentClipName || "").trim() || null;
    const clip = clipName
      ? (record.clips || []).find(function (candidate) {
          return String(candidate?.name || "").trim() === clipName;
        }) || null
      : null;
    const action = record.currentAction || null;
    const effectiveTimeScale = action && typeof action.getEffectiveTimeScale === "function"
      ? Number(action.getEffectiveTimeScale())
      : Number(action?._effectiveTimeScale);
    return {
      animationClipName: clipName,
      animationClipDuration: clip ? round(Number(clip.duration) || 0) : null,
      animationPlaybackScale: Number.isFinite(effectiveTimeScale) ? round(effectiveTimeScale) : null,
      animationActionTime: action && Number.isFinite(Number(action.time)) ? round(Number(action.time)) : null
    };
  }

  function addEntity(worldData, entity, options = {}) {
    const isScatter = entity?.type === "scatter" || entity?.kind === "scatter";
    const residentStreaming = options.residentStreaming === true;
    const chunkKeyValue = String(options.chunkKey || entity?.chunkKey || (residentStreaming
      ? chunkKeyForTransform(entity?.transform || null, resolveChunkPolicy(worldData, mode))
      : "") || "").trim();
    if (isScatter) {
      const shadowOptions = scatterShadowOptions();
      let root = entityRoots.get(entity.nodeId) || null;
      if (!root) {
        root = new THREE.Group();
        root.userData.entityId = entity.nodeId;
        root.userData.transformable = false;
        root.userData.snapToGround = false;
        root.userData.runtimeAlive = true;
        root.name = entity.nodeId;
        entityRoots.set(entity.nodeId, root);
        content.add(root);
        runtimeStats.sceneObjects += 1;
      }
      const instanceRoot = new THREE.Group();
      instanceRoot.userData.scatterInstance = true;
      instanceRoot.userData.chunkRuntimeType = "scatter";
      instanceRoot.userData.transformable = false;
      instanceRoot.userData.snapToGround = false;
      instanceRoot.userData.runtimeAlive = true;
      instanceRoot.name = entity.id || (entity.nodeId + "::instance");
      transformObject(instanceRoot, entity.transform);
      root.add(instanceRoot);
      runtimeStats.sceneObjects += 1;
      registerChunkRuntimeEntry({
        id: entity.id || (entity.nodeId + "::instance"),
        type: "scatter",
        object: instanceRoot,
        chunkKey: chunkKeyValue || null,
        chunkKeys: chunkKeyValue ? [chunkKeyValue] : [],
        hasVisual: true
      });
      loadModelInto(instanceRoot, entity.modelAssetId, worldData, null, shadowOptions);
      if (shadowOptions.castShadow === true) scatterShadowFallbacks += 1;
      return;
    }
    if (entity.solid && entity.walkable !== true && options.skipCollision !== true) {
      const solidEntry = {
        x: num(entity.transform?.position?.x, 0),
        z: num(entity.transform?.position?.z, 0),
        radius: num(entity.collisionRadius, 1),
        enabled: true,
        runtimeManaged: true
      };
      solids.push(solidEntry);
      if (residentStreaming && chunkKeyValue) {
        registerResidentChunkRecord("solid", chunkKeyValue, solidEntry.id || ((entity.id || entity.nodeId || "entity") + "::solid"), {
          id: solidEntry.id || ((entity.id || entity.nodeId || "entity") + "::solid"),
          type: "solid",
          solid: solidEntry,
          chunkKey: chunkKeyValue,
          chunkKeys: [chunkKeyValue]
        });
      }
      registerChunkRuntimeEntry({
        id: (entity.id || entity.nodeId || "entity") + "::solid",
        type: "solid",
        solid: solidEntry,
        chunkKey: chunkKeyValue || null,
        chunkKeys: chunkKeyValue ? [chunkKeyValue] : [],
        hasVisual: false
      });
    }
    if (options.skipVisual === true) return;
    const root = new THREE.Group();
    root.userData.entityId = entity.id;
    root.userData.chunkRuntimeType = "entity";
    root.userData.transformable = true;
    root.userData.snapToGround = true;
    root.userData.runtimeAlive = true;
    if (chunkKeyValue) root.userData.chunkKey = chunkKeyValue;
    root.userData.animationClip = entity.animationClip || null;
    root.userData.idleAnimation = entity.idleAnimation || null;
    root.userData.walkAnimation = entity.walkAnimation || null;
    root.userData.runAnimation = entity.runAnimation || null;
    root.name = entity.id;
    transformObject(root, entity.transform);
    entityRoots.set(entity.id, root);
    content.add(root);
    runtimeStats.sceneObjects += 1;
    registerChunkRuntimeEntry({
      id: entity.id,
      type: "entity",
      object: root,
      chunkKey: chunkKeyValue || null,
      chunkKeys: chunkKeyValue ? [chunkKeyValue] : [],
      hasVisual: true
    });
    if (residentStreaming && chunkKeyValue) {
      registerResidentChunkRecord("entity", chunkKeyValue, entity.id, {
        id: entity.id,
        type: "entity",
        object: root,
        chunkKey: chunkKeyValue,
        chunkKeys: [chunkKeyValue]
      });
    }
    loadModelInto(root, entity.modelAssetId, worldData, null, {
      castShadow: options.castShadow !== undefined ? options.castShadow : true,
      receiveShadow: options.receiveShadow !== undefined ? options.receiveShadow : true
    });
  }

  function addInteractable(worldData, inter, options = {}) {
    const x = num(inter.position?.x, 0);
    const z = num(inter.position?.z, 0);
    const groundY = num(worldData?.ground?.y, 0);
    const residentStreaming = options.residentStreaming === true;
    const chunkKeyValue = String(options.chunkKey || inter?.chunkKey || chunkKeyFromWorldPosition(x, z, resolveChunkPolicy(worldData, mode)) || "").trim();
    const residentInteractableRecord = residentStreaming
      ? (interactables.find(function (value) { return value && value.id === inter.id; }) || null)
      : null;
    let interactableRecord = null;
    if (options.skipRegistration !== true) {
      interactableRecord = { id: inter.id, x: x, z: z, radius: num(inter.radius, 2), prompt: inter.prompt, action: inter.action, active: true };
      interactables.push(interactableRecord);
      if (residentStreaming && chunkKeyValue) {
        registerResidentChunkRecord("interactable", chunkKeyValue, inter.id, {
          id: inter.id,
          type: "interactable",
          interactable: interactableRecord,
          chunkKey: chunkKeyValue,
          chunkKeys: [chunkKeyValue]
        });
      }
    }
    if (options.skipVisual === true || !inter.modelAssetId) {
      const recordForRuntime = interactableRecord || residentInteractableRecord;
      if (recordForRuntime) {
        registerChunkRuntimeEntry({
          id: inter.id,
          type: "interactable",
          interactable: recordForRuntime,
          x: x,
          z: z,
          chunkKey: chunkKeyValue || null,
          chunkKeys: chunkKeyValue ? [chunkKeyValue] : [],
          hasVisual: false
        });
        if (residentStreaming && chunkKeyValue) {
          registerResidentChunkRecord("interactable", chunkKeyValue, inter.id, {
            id: inter.id,
            type: "interactable",
            interactable: recordForRuntime,
            chunkKey: chunkKeyValue,
            chunkKeys: [chunkKeyValue]
          });
        }
      }
      return;
    }
    if (inter.modelAssetId) {
      const root = new THREE.Group();
      root.userData.interactableId = inter.id;
      root.userData.chunkRuntimeType = "interactable";
      root.userData.transformable = false;
      root.userData.snapToGround = true;
      root.userData.runtimeAlive = true;
      if (chunkKeyValue) root.userData.chunkKey = chunkKeyValue;
      root.position.set(x, groundY, z);
      content.add(root);
      runtimeStats.sceneObjects += 1;
      registerChunkRuntimeEntry({
        id: inter.id,
        type: "interactable",
        interactable: interactableRecord || residentInteractableRecord,
        object: root,
        chunkKey: chunkKeyValue || null,
        chunkKeys: chunkKeyValue ? [chunkKeyValue] : [],
        hasVisual: true
      });
      if (residentStreaming && chunkKeyValue) {
        registerResidentChunkRecord("interactable", chunkKeyValue, inter.id, {
          id: inter.id,
          type: "interactable",
          interactable: interactableRecord || residentInteractableRecord,
          object: root,
          chunkKey: chunkKeyValue,
          chunkKeys: [chunkKeyValue]
        });
      }
      loadModelInto(root, inter.modelAssetId, worldData, null, {
        castShadow: options.castShadow !== undefined ? options.castShadow : false,
        receiveShadow: options.receiveShadow !== undefined ? options.receiveShadow : true
      });
    }
  }

  function addScatterEntities(worldData, scatterEntities) {
    const grouped = new Map();
    const chunkPolicy = resolveChunkPolicy(worldData, mode);
    for (const entity of scatterEntities || []) {
      const rootKey = entity?.nodeId || entity?.scatterId || entity?.id || entity?.modelAssetId || "scatter";
      let entry = grouped.get(rootKey);
      if (!entry) {
        const root = new THREE.Group();
        root.userData.entityId = rootKey;
        root.userData.transformable = false;
        root.userData.snapToGround = false;
        root.userData.runtimeAlive = true;
        root.name = rootKey;
        entry = { root: root, byAsset: new Map() };
        grouped.set(rootKey, entry);
        entityRoots.set(rootKey, root);
        content.add(root);
        runtimeStats.sceneObjects += 1;
      }
      const assetKey = entity?.sourceAssetId || entity?.modelAssetId || "";
      if (!assetKey) continue;
      let bucket = entry.byAsset.get(assetKey);
      if (!bucket) {
        bucket = [];
        entry.byAsset.set(assetKey, bucket);
      }
      bucket.push(entity);
    }
    for (const entry of grouped.values()) {
      const shadowOptions = scatterShadowOptions();
      for (const [assetId, instances] of entry.byAsset.entries()) {
        loadScatterInstancesInto(entry.root, assetId, instances, worldData, {
          allowBatch: shouldBatchScatterProps(),
          chunkPolicy: chunkPolicy,
          castShadow: shadowOptions.castShadow,
          receiveShadow: shadowOptions.receiveShadow
        });
      }
    }
  }

  function canBatchStaticProp(worldData, assetId) {
    if (!shouldBatchStaticProps() || !assetId) return false;
    const asset = assetById(worldData, assetId);
    if (!asset?.sourcePath || asset.assetType !== "model") return false;
    return Number(asset?.metadata?.animationCount || 0) === 0;
  }

  function modelShadowOptions(worldData, assetId) {
    const asset = assetById(worldData, assetId);
    if (asset?.sourcePath && asset.assetType === "model" && Number(asset?.metadata?.animationCount || 0) === 0) {
      return staticPropShadowOptions();
    }
    return { castShadow: true, receiveShadow: true };
  }

  function addStaticPropBatch(worldData, assetId, descriptors, options = {}) {
    const asset = assetById(worldData, assetId);
    if (!asset?.sourcePath || !Array.isArray(descriptors) || descriptors.length < 2) return false;
    const record = ensureModelRecord(asset, worldData);
    if (!record) return false;
    const chunkPolicy = resolveChunkPolicy(worldData, mode);
    const chunkGroups = groupEntriesByChunkKey(descriptors, chunkPolicy, function (descriptor) {
      return descriptor?.transform || null;
    });
    const fallbackShadowOptions = modelShadowOptions(worldData, assetId);
    const residentStreaming = options.residentStreaming === true;
    const residentChunkKey = String(options.chunkKey || "").trim();
    const residentChunkKind = options.chunkKind === "interactable" ? "interactable" : "entity";
    let handledAny = false;
    const generation = worldBuildGeneration;
    const attach = function (gltf, chunkKeyValue, chunkDescriptors) {
      if (generation !== worldBuildGeneration) return;
      if (residentStreaming && residentChunkKey && !residentContentState.residentChunkKeys.has(residentChunkKey)) return;
      const instances = chunkDescriptors.map(function (descriptor) {
        return { transform: descriptor.transform };
      }).filter(function (instance) { return Boolean(instance.transform); });
      if (instances.length < 2) {
        for (const descriptor of chunkDescriptors) {
          if (descriptor.kind === "entity") {
            addEntity(worldData, descriptor.entity, Object.assign({
              skipCollision: true,
              residentStreaming: residentStreaming,
              chunkKey: residentChunkKey || chunkKeyValue || null
            }, modelShadowOptions(worldData, descriptor.entity?.modelAssetId)));
          } else if (descriptor.kind === "interactable") {
            addInteractable(worldData, descriptor.inter, Object.assign({
              skipRegistration: true,
              residentStreaming: residentStreaming,
              chunkKey: residentChunkKey || chunkKeyValue || null
            }, modelShadowOptions(worldData, descriptor.inter?.modelAssetId)));
          }
        }
        return;
      }
      const batch = createInstancedScatterBatch(gltf, instances, {
        batchKind: "staticProp",
        groupName: asset.name || asset.id,
        castShadow: staticPropShadowOptions().castShadow,
        receiveShadow: staticPropShadowOptions().receiveShadow,
        smoothShading: worldData?.world?.performance?.shared?.smoothShading !== false,
        chunkKey: chunkKeyValue,
        chunkKeys: [chunkKeyValue]
      });
      if (batch) {
        batch.userData.chunkKey = chunkKeyValue;
        batch.userData.chunkKeys = [chunkKeyValue];
        batch.userData.runtimeAlive = true;
        content.add(batch);
        const batchCounts = countObjectTree(batch);
        runtimeStats.sceneObjects += batchCounts.objects;
        runtimeStats.meshes += batchCounts.meshes;
        registerChunkRuntimeEntry({
          id: (asset.id || assetId) + "::" + chunkKeyValue + "::static-batch",
          type: "staticProp",
          object: batch,
          chunkKey: chunkKeyValue,
          chunkKeys: [chunkKeyValue],
          hasVisual: true
        });
        if (residentStreaming && residentChunkKey) {
          registerResidentChunkRecord(residentChunkKind, residentChunkKey, (asset.id || assetId) + "::" + chunkKeyValue + "::static-batch", {
            id: (asset.id || assetId) + "::" + chunkKeyValue + "::static-batch",
            type: residentChunkKind,
            object: batch,
            chunkKey: residentChunkKey,
            chunkKeys: [residentChunkKey]
          });
        }
        if (selectedEntityId && selectableIdForObject(batch) === selectedEntityId) selectEntity(selectedEntityId);
        requestRender();
        return;
      }
      for (const descriptor of chunkDescriptors) {
        if (descriptor.kind === "entity") {
          addEntity(worldData, descriptor.entity, Object.assign({
            skipCollision: true,
            residentStreaming: residentStreaming,
            chunkKey: residentChunkKey || chunkKeyValue || null
          }, modelShadowOptions(worldData, descriptor.entity?.modelAssetId)));
        } else if (descriptor.kind === "interactable") {
          addInteractable(worldData, descriptor.inter, Object.assign({
            skipRegistration: true,
            residentStreaming: residentStreaming,
            chunkKey: residentChunkKey || chunkKeyValue || null
          }, modelShadowOptions(worldData, descriptor.inter?.modelAssetId)));
        }
      }
    };
    const processChunkGroup = function (chunkKeyValue, chunkDescriptors) {
      if (!Array.isArray(chunkDescriptors) || !chunkDescriptors.length) return;
      if (chunkDescriptors.length < 2) {
        for (const descriptor of chunkDescriptors) {
          if (descriptor.kind === "entity") {
            addEntity(worldData, descriptor.entity, Object.assign({
              skipCollision: true,
              residentStreaming: residentStreaming,
              chunkKey: residentChunkKey || chunkKeyValue || null
            }, fallbackShadowOptions));
          } else if (descriptor.kind === "interactable") {
            addInteractable(worldData, descriptor.inter, Object.assign({
              skipRegistration: true,
              residentStreaming: residentStreaming,
              chunkKey: residentChunkKey || chunkKeyValue || null
            }, fallbackShadowOptions));
          }
        }
        handledAny = true;
        return;
      }
      if (record.status === "ready") {
        attach(record.gltf, chunkKeyValue, chunkDescriptors);
      } else if (record.status === "loading") {
        record.waiters.push(function (gltf) {
          attach(gltf, chunkKeyValue, chunkDescriptors);
        });
      }
      handledAny = true;
    };
    for (const [chunkKeyValue, chunkDescriptors] of chunkGroups.grouped.entries()) {
      processChunkGroup(chunkKeyValue, chunkDescriptors);
    }
    for (const descriptor of chunkGroups.unchunked) {
      if (descriptor.kind === "entity") {
        addEntity(worldData, descriptor.entity, Object.assign({
          skipCollision: true,
          residentStreaming: residentStreaming,
          chunkKey: residentChunkKey || null
        }, fallbackShadowOptions));
      } else if (descriptor.kind === "interactable") {
        addInteractable(worldData, descriptor.inter, Object.assign({
          skipRegistration: true,
          residentStreaming: residentStreaming,
          chunkKey: residentChunkKey || null
        }, fallbackShadowOptions));
      }
      handledAny = true;
    }
    if (!handledAny) return false;
    return true;
  }

  function spawnPlayer(worldData) {
    const def = worldData?.player;
    const spawn = worldData?.spawn;
    if (!def || !spawn) return;
    const groundY = num(worldData?.ground?.y, 0);
    player.speed = Math.max(0.1, num(def.moveSpeed, 6));
    player.sprint = Math.min(2.5, Math.max(1, num(def.sprintMultiplier, 1.6)));
    player.turnSpeed = num(def.turnSpeed, 600);
    player.radius = num(def.collisionRadius, 0.5);
    player.facing = num(spawn.facing, 0) * DEG_TO_RAD;
    player.pos.set(num(spawn.x, 0), groundY, num(spawn.z, 0));
    const root = new THREE.Group();
    root.name = "player";
    root.userData.playerId = def.id;
    root.userData.transformable = false;
    root.userData.snapToGround = false;
    root.userData.animationClip = def.animationClip || null;
    root.userData.idleAnimation = def.idleAnimation || null;
    root.userData.walkAnimation = def.walkAnimation || null;
    root.userData.runAnimation = def.runAnimation || null;
    root.position.copy(player.pos);
    root.rotation.y = player.facing;
    const scale = num(def.scale, 1);
    root.scale.set(scale, scale, scale);
    player.root = root;
    player.animationState = "idle";
    content.add(root);
    runtimeStats.sceneObjects += 1;
    const modelAsset = assetById(worldData, def.modelAssetId);
    if (modelAsset?.sourcePath) {
      updateLocalPlayerNameplate(root, player.displayName);
      loadModelInto(root, def.modelAssetId, worldData, function (clone) {
        updateLocalPlayerNameplate(root, player.displayName, clone);
      });
    } else {
      const fallbackVisual = addPlayerFallbackVisual(root, {
        name: "player-fallback",
        color: "#7faeff",
        castShadow: true,
        receiveShadow: true
      });
      updateLocalPlayerNameplate(root, player.displayName, fallbackVisual);
    }
    if (player.pendingState) {
      const pendingState = player.pendingState;
      player.pendingState = null;
      setPlayerState(pendingState.nextState, pendingState.options || { immediate: true });
    }
  }

  function addPlayerFallbackVisual(root, options = {}) {
    if (!root || root.userData?.playerFallbackVisual === true) return null;
    const material = new THREE.MeshStandardMaterial({
      color: colorOrDefault(options.color, "#7faeff"),
      roughness: 0.65,
      metalness: 0.05
    });
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.0, 4, 8), material);
    mesh.name = String(options.name || "player-fallback");
    mesh.position.y = 0.85;
    mesh.castShadow = options.castShadow !== false;
    mesh.receiveShadow = options.receiveShadow !== false;
    mesh.userData.runtimeAlive = true;
    mesh.userData.playerFallbackVisual = true;
    root.add(mesh);
    runtimeStats.sceneObjects += 1;
    runtimeStats.meshes += 1;
    return mesh;
  }

  function createRemotePlayerNameplate(displayName) {
    const label = String(displayName || "Player").trim().slice(0, 32) || "Player";
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "600 24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f4f7fb";
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;
    const maxWidth = 220;
    const textWidth = Math.max(1, ctx.measureText(label).width);
    const scale = textWidth > maxWidth ? maxWidth / textWidth : 1;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2 + 1);
    ctx.scale(scale, scale);
    ctx.fillText(label, 0, 0);
    ctx.restore();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.name = "remote-player-nameplate";
    sprite.position.set(0, 2.15, 0);
    sprite.scale.set(3.2, 0.8, 1);
    sprite.renderOrder = 4001;
    sprite.userData.runtimeAlive = true;
    sprite.userData.remotePlayerNameplate = true;
    sprite.userData.remotePlayerLabelText = label;
    sprite.userData.remotePlayerTexture = texture;
    return sprite;
  }

  function updateRemotePlayerNameplate(root, displayName) {
    if (!root) return null;
    const label = String(displayName || "Player").trim().slice(0, 32) || "Player";
    const existing = root.userData.remotePlayerNameplateRoot || null;
    if (existing && existing.userData?.remotePlayerLabelText === label) return existing;
    if (existing) {
      root.remove(existing);
      disposeObject(existing);
      root.userData.remotePlayerNameplateRoot = null;
    }
    const next = createRemotePlayerNameplate(label);
    if (!next) return null;
    root.add(next);
    root.userData.remotePlayerNameplateRoot = next;
    return next;
  }

  function localPlayerNameplateEnabled(worldData = world) {
    return mode === "game" && worldData?.player?.showNameplate !== false;
  }

  function updateLocalPlayerNameplateAnchor(nameplate, sourceObject = null) {
    if (!nameplate) return null;
    let anchorY = 2.15;
    if (sourceObject) {
      const box = new THREE.Box3().setFromObject(sourceObject);
      if (!box.isEmpty()) {
        const size = new THREE.Vector3();
        box.getSize(size);
        const padding = Math.max(0.25, size.y * 0.12);
        anchorY = Math.max(anchorY, box.max.y + padding);
      }
    }
    nameplate.position.set(0, anchorY, 0);
    return nameplate;
  }

  function playerVisualObject(root) {
    if (!root || !Array.isArray(root.children)) return null;
    return root.children.find(function (child) {
      return child && child.userData?.localPlayerNameplate !== true;
    }) || null;
  }

  function updateLocalPlayerNameplate(root, displayName, sourceObject = null) {
    if (!root) return null;
    const label = String(displayName || "Player").trim().slice(0, 32) || "Player";
    const existing = root.userData.localPlayerNameplateRoot || null;
    if (!localPlayerNameplateEnabled()) {
      if (existing) {
        root.remove(existing);
        disposeObject(existing);
        root.userData.localPlayerNameplateRoot = null;
        player.nameplateRoot = null;
      }
      return null;
    }
    if (existing && existing.userData?.localPlayerLabelText === label) {
      updateLocalPlayerNameplateAnchor(existing, sourceObject || playerVisualObject(root));
      existing.visible = true;
      player.nameplateRoot = existing;
      return existing;
    }
    if (existing) {
      root.remove(existing);
      disposeObject(existing);
      root.userData.localPlayerNameplateRoot = null;
      player.nameplateRoot = null;
    }
    const next = createRemotePlayerNameplate(label);
    if (!next) return null;
    next.name = "local-player-nameplate";
    next.userData.remotePlayerNameplate = false;
    next.userData.localPlayerNameplate = true;
    next.userData.localPlayerLabelText = label;
    updateLocalPlayerNameplateAnchor(next, sourceObject || playerVisualObject(root));
    root.add(next);
    root.userData.localPlayerNameplateRoot = next;
    player.nameplateRoot = next;
    return next;
  }

  function createRemotePlayerRoot(remotePlayer, worldData) {
    const root = new THREE.Group();
    root.name = "remote-player:" + String(remotePlayer?.playerId || crypto.randomUUID());
    root.userData.playerId = remotePlayer?.playerId || null;
    root.userData.remotePlayerId = remotePlayer?.playerId || null;
    root.userData.remotePlayer = true;
    root.userData.transformable = false;
    root.userData.snapToGround = false;
    root.userData.runtimeAlive = true;
    root.userData.animationClip = remotePlayer?.animationClip || worldData?.player?.animationClip || null;
    root.userData.idleAnimation = remotePlayer?.idleAnimation || worldData?.player?.idleAnimation || null;
    root.userData.walkAnimation = remotePlayer?.walkAnimation || worldData?.player?.walkAnimation || null;
    root.userData.runAnimation = remotePlayer?.runAnimation || worldData?.player?.runAnimation || null;
    const scale = num(remotePlayer?.scale, num(worldData?.player?.scale, 1));
    root.scale.set(scale, scale, scale);
    updateRemotePlayerNameplate(root, remotePlayer?.displayName || remotePlayer?.playerId || "Player");
    const modelAssetId = worldData?.player?.modelAssetId || null;
    if (modelAssetId && assetById(worldData, modelAssetId)?.sourcePath) {
      loadModelInto(root, modelAssetId, worldData, null, {
        castShadow: true,
        receiveShadow: true
      });
    } else {
      addPlayerFallbackVisual(root, {
        name: "remote-player-fallback",
        color: "#7faeff",
        castShadow: true,
        receiveShadow: true
      });
    }
    return root;
  }

  function snapshotRemotePlayerRecord(record) {
    if (!record) return null;
    const root = record.root || null;
    const renderState = record.renderState || null;
    return {
      playerId: record.playerId || null,
      userId: record.userId || null,
      displayName: record.displayName || "",
      selectedCharacterId: record.selectedCharacterId || null,
      worldId: record.worldId || null,
      position: renderState?.position ? Object.assign({}, renderState.position) : (record.position ? Object.assign({}, record.position) : null),
      previousPosition: record.previousPosition ? Object.assign({}, record.previousPosition) : null,
      targetPosition: record.targetPosition ? Object.assign({}, record.targetPosition) : null,
      renderState: renderState ? Object.assign({}, renderState) : null,
      revision: Number(record.revision) || 0,
      updatedAt: record.updatedAt || null,
      animationState: record.animationState || "idle",
      moving: record.moving === true,
      lastPacketAt: Number(record.lastPacketAt) || 0,
      lastRenderAt: Number(record.lastRenderAt) || 0,
      lastTeleportAt: Number(record.lastTeleportAt) || 0,
      connectedSessionCount: Number(record.connectedSessionCount) || 0,
      droppedStaleUpdates: Number(record.droppedStaleUpdates) || 0,
      lastSnapshotSeq: Number(record.lastSnapshotSeq) || 0,
      lastSnapshotAt: Number(record.lastSnapshotAt) || 0,
      activeControllerSessionId: record.activeControllerSessionId || null,
      controllerEpoch: Math.max(Number(record.controllerEpoch) || 0, Number(record.renderState?.controllerEpoch) || 0),
      lastProcessedInputSeq: Math.max(Number(record.lastProcessedInputSeq) || 0, Number(record.renderState?.lastProcessedInputSeq) || 0),
      visualFreezeMs: Number(record.visualFreezeMs) || 0,
      observerLagMs: Number(record.observerLagMs) || 0,
      visualVelocity: Number(record.visualVelocity) || 0,
      maxRemoteJump: Number(record.maxRemoteJump || record.maxJumpMs || 0) || 0,
      maxJumpMs: Number(record.maxRemoteJump || record.maxJumpMs || 0) || 0,
      snapshotsLength: Array.isArray(record.snapshots) ? record.snapshots.length : 0,
      interpolationBufferLength: Array.isArray(record.snapshots) ? record.snapshots.length : 0,
      object: root,
      root: root
    };
  }

  function ensureRemotePlayerRecord(remotePlayer, worldData) {
    const playerId = String(remotePlayer?.playerId || "").trim();
    if (!playerId) return null;
    let record = remotePlayers.get(playerId);
    if (!record) {
      record = {
        playerId: playerId,
        userId: remotePlayer?.userId || null,
        displayName: remotePlayer?.displayName || playerId,
        selectedCharacterId: remotePlayer?.selectedCharacterId || null,
        worldId: remotePlayer?.worldId || worldData?.world?.id || worldData?.world?.worldId || null,
        position: null,
        previousPosition: null,
        targetPosition: null,
        renderState: null,
        revision: 0,
        updatedAt: null,
        animationState: "idle",
        moving: false,
        lastPacketAt: 0,
        lastRenderAt: 0,
        lastTeleportAt: 0,
        lastSnapshotSeq: 0,
        lastSnapshotAt: 0,
        activeControllerSessionId: null,
        controllerEpoch: 0,
        lastProcessedInputSeq: 0,
        visualFreezeMs: 0,
        observerLagMs: 0,
        visualVelocity: 0,
        maxRemoteJump: 0,
        maxJumpMs: 0,
        connectedSessionCount: Number(remotePlayer?.connectedSessionCount) || 0,
        droppedStaleUpdates: 0,
        object: null,
        root: null,
        snapshots: [],
        sourceSessionId: remotePlayer?.sourceSessionId || null,
        sourceDevice: remotePlayer?.sourceDevice || null
      };
      remotePlayers.set(playerId, record);
    }
    record.userId = remotePlayer?.userId || record.userId || null;
    record.displayName = String(remotePlayer?.displayName || record.displayName || playerId).trim() || playerId;
    record.selectedCharacterId = remotePlayer?.selectedCharacterId || record.selectedCharacterId || null;
    record.worldId = remotePlayer?.worldId || record.worldId || worldData?.world?.id || worldData?.world?.worldId || null;
    record.connectedSessionCount = Number(remotePlayer?.connectedSessionCount || record.connectedSessionCount || 0) || 0;
    record.sourceSessionId = remotePlayer?.sourceSessionId || record.sourceSessionId || null;
    record.sourceDevice = remotePlayer?.sourceDevice || record.sourceDevice || null;
    if (!record.root || !record.root.parent) {
      const root = createRemotePlayerRoot(record, worldData);
      record.root = root;
      record.object = root;
      const initialPosition = record.renderState?.position || record.position || null;
      root.position.copy(initialPosition ? new THREE.Vector3(initialPosition.x, initialPosition.y, initialPosition.z) : player.pos);
      root.rotation.y = num(initialPosition?.rotationY, 0) * DEG_TO_RAD;
      content.add(root);
      runtimeStats.sceneObjects += 1;
    }
    updateRemotePlayerNameplate(record.root, record.displayName);
    runtimeStats.remotePlayers = remotePlayers.size;
    return record;
  }

  function applyRemotePlayerVisualState(record, nextState, options = {}) {
    if (!record || !record.root || !nextState) return null;
    const position = {
      x: num(nextState.x, record.position?.x ?? 0),
      y: Number.isFinite(Number(nextState.y)) ? num(nextState.y, record.position?.y ?? 0) : num(record.position?.y, 0),
      z: num(nextState.z, record.position?.z ?? 0),
      rotationY: Number.isFinite(Number(nextState.rotationY))
        ? num(nextState.rotationY, record.position?.rotationY ?? 0)
        : num(record.position?.rotationY, 0)
    };
    record.previousPosition = record.position ? Object.assign({}, record.position) : Object.assign({}, position);
    record.targetPosition = Object.assign({}, position);
    record.position = Object.assign({}, position);
    record.revision = Number(nextState.revision || record.revision || 0) || 0;
    record.updatedAt = nextState.updatedAt || record.updatedAt || null;
    record.animationState = String(nextState.animationState || record.animationState || "idle").trim() || "idle";
    record.moving = typeof nextState.moving === "boolean" ? nextState.moving : record.moving === true;
    record.lastPacketAt = Number.isFinite(Number(nextState.lastPacketAt)) ? Number(nextState.lastPacketAt) : performance.now();
    record.lastRenderAt = performance.now();
    record.connectedSessionCount = Number(nextState.connectedSessionCount || record.connectedSessionCount || 0) || 0;
    record.sourceSessionId = nextState.sourceSessionId || record.sourceSessionId || null;
    record.sourceDevice = nextState.sourceDevice || record.sourceDevice || null;
    record.worldId = nextState.worldId || record.worldId || null;
    record.lastSnapshotSeq = Math.max(0, Math.floor(Number(nextState.snapshotSeq || nextState.serverSeq || record.lastSnapshotSeq || 0)) || 0);
    record.lastSnapshotAt = Number.isFinite(Number(nextState.lastSnapshotAt)) ? Number(nextState.lastSnapshotAt) : (Number(nextState.serverTimeMs) || performance.now());
    record.activeControllerSessionId = nextState.activeControllerSessionId || record.activeControllerSessionId || null;
    record.controllerEpoch = Math.max(Number(record.controllerEpoch) || 0, Number(nextState.controllerEpoch) || 0);
    record.lastProcessedInputSeq = Math.max(Number(record.lastProcessedInputSeq) || 0, Number(nextState.lastProcessedInputSeq) || 0);
    record.visualFreezeMs = Number.isFinite(Number(nextState.visualFreezeMs)) ? Number(nextState.visualFreezeMs) : Number(record.visualFreezeMs) || 0;
    record.observerLagMs = Number.isFinite(Number(nextState.observerLagMs)) ? Number(nextState.observerLagMs) : Number(record.observerLagMs) || 0;
    record.visualVelocity = Number.isFinite(Number(nextState.visualVelocity)) ? Number(nextState.visualVelocity) : Number(record.visualVelocity) || 0;
    record.maxRemoteJump = Math.max(Number(record.maxRemoteJump) || 0, Number(nextState.maxRemoteJump) || Number(nextState.maxJumpMs) || 0);
    record.maxJumpMs = record.maxRemoteJump;
    record.snapshots = Array.isArray(nextState.snapshots) ? nextState.snapshots.slice(-32) : record.snapshots || [];
    record.renderState = {
      position: Object.assign({}, position),
      animationState: record.animationState,
      moving: record.moving,
      revision: record.revision,
      updatedAt: record.updatedAt,
      snapshotSeq: record.lastSnapshotSeq,
      lastSnapshotAt: record.lastSnapshotAt,
      activeControllerSessionId: record.activeControllerSessionId,
      controllerEpoch: record.controllerEpoch,
      lastProcessedInputSeq: record.lastProcessedInputSeq,
      visualFreezeMs: record.visualFreezeMs,
      observerLagMs: record.observerLagMs,
      visualVelocity: record.visualVelocity,
      maxRemoteJump: record.maxRemoteJump,
      teleport: Boolean(nextState.teleport === true)
    };
    if (record.root) {
      record.root.position.set(position.x, position.y, position.z);
      record.root.rotation.y = position.rotationY * DEG_TO_RAD;
      if (record.root.userData.remotePlayerLabelText !== record.displayName) {
        updateRemotePlayerNameplate(record.root, record.displayName);
      }
      if (String(nextState.animationState || "").trim()) {
        playAnimationState(record.root, record.animationState, 0.08);
      } else {
        playAnimationState(record.root, record.moving ? "walk" : "idle", 0.08);
      }
    }
    return snapshotRemotePlayerRecord(record);
  }

  function applyRemotePlayerState(record, nextState, options = {}) {
    return applyRemotePlayerVisualState(record, nextState, options);
  }

  function upsertRemotePlayer(remotePlayer, worldData = null) {
    const contextWorld = worldData || world || null;
    const record = ensureRemotePlayerRecord(remotePlayer, contextWorld);
    if (!record) return null;
    if (remotePlayer && remotePlayer.position) {
      return applyRemotePlayerState(record, {
        x: remotePlayer.position.x,
        y: remotePlayer.position.y,
        z: remotePlayer.position.z,
        rotationY: remotePlayer.position.rotationY,
        revision: remotePlayer.revision,
        updatedAt: remotePlayer.updatedAt,
        animationState: remotePlayer.animationState,
        moving: remotePlayer.moving,
        lastPacketAt: remotePlayer.lastPacketAt,
        connectedSessionCount: remotePlayer.connectedSessionCount,
        worldId: remotePlayer.worldId,
        sourceSessionId: remotePlayer.sourceSessionId,
        sourceDevice: remotePlayer.sourceDevice,
        snapshotSeq: remotePlayer.snapshotSeq,
        lastSnapshotAt: remotePlayer.lastSnapshotAt,
        activeControllerSessionId: remotePlayer.activeControllerSessionId || null,
        controllerEpoch: Number(remotePlayer.controllerEpoch) || 0,
        lastProcessedInputSeq: Number(remotePlayer.lastProcessedInputSeq) || 0,
        visualFreezeMs: remotePlayer.visualFreezeMs,
        observerLagMs: remotePlayer.observerLagMs,
        visualVelocity: remotePlayer.visualVelocity,
        maxRemoteJump: remotePlayer.maxRemoteJump || remotePlayer.maxJumpMs || 0,
        maxJumpMs: remotePlayer.maxRemoteJump || remotePlayer.maxJumpMs || 0,
        teleport: remotePlayer.teleport === true
      }, { immediate: true });
    }
    return snapshotRemotePlayerRecord(record);
  }

  function setRemotePlayerVisualState(playerId, nextState, options = {}) {
    const record = ensureRemotePlayerRecord(Object.assign({
      playerId: playerId,
      displayName: options.displayName || playerId,
      worldId: options.worldId || world?.world?.id || world?.world?.worldId || null
    }, options.remotePlayer || {}), world || null);
    if (!record) return null;
    return applyRemotePlayerVisualState(record, nextState, options);
  }

  function setRemotePlayerState(playerId, nextState, options = {}) {
    return setRemotePlayerVisualState(playerId, nextState, options);
  }

  function removeRemotePlayer(playerId) {
    const record = remotePlayers.get(String(playerId || "").trim());
    if (!record) return false;
    if (record.root && record.root.parent) {
      record.root.parent.remove(record.root);
    }
    const counts = countObjectTree(record.root || record.object || null);
    runtimeStats.sceneObjects = Math.max(0, runtimeStats.sceneObjects - (counts.objects || 0));
    runtimeStats.meshes = Math.max(0, runtimeStats.meshes - (counts.meshes || 0));
    if (record.root) {
      disposeObject(record.root);
    }
    remotePlayers.delete(record.playerId);
    runtimeStats.remotePlayers = remotePlayers.size;
    requestRender("remote-player-removed");
    return true;
  }

  function clearRemotePlayers() {
    const ids = Array.from(remotePlayers.keys());
    for (const playerId of ids) {
      removeRemotePlayer(playerId);
    }
    remotePlayers.clear();
    runtimeStats.remotePlayers = 0;
  }

  function getRemotePlayerDebugState() {
    return {
      count: remotePlayers.size,
      playerIds: Array.from(remotePlayers.keys()),
      players: Array.from(remotePlayers.values()).map(snapshotRemotePlayerRecord)
    };
  }

  function selectEntity(entityId) {
    selectedEntityId = entityId || null;
    refreshSelectedRootReference();
    applyLocalView();
    if (selectionHelper) updateSelectionHelper();
    requestRender();
  }

  function pickEntity(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const pickRoots = terrainRuntimeGroup
      ? content.children.concat([terrainRuntimeGroup])
      : content.children;
    const hits = raycaster.intersectObjects(pickRoots, true);
    if (!hits.length) return null;
    for (const hit of hits) {
      let object = hit.object;
      while (object && object !== content) {
        if (object.visible === false) break;
        let shadowProxyAncestor = object;
        let blockedByShadowProxy = false;
        while (shadowProxyAncestor && shadowProxyAncestor !== content) {
          if (shadowProxyAncestor.userData?.shadowProxy === true) {
            blockedByShadowProxy = true;
            break;
          }
          shadowProxyAncestor = shadowProxyAncestor.parent || null;
        }
        if (blockedByShadowProxy) break;
        if (object === selectionHelper || object === transformGuide) break;
        if (object.name === "GK editor transform guide" || String(object.name || "").startsWith("GK editor transform guide")) break;
        if (object.userData?.entityId || object.userData?.playerId || object.userData?.surfaceLayerId) {
          return object.userData.entityId || object.userData.playerId || object.userData.surfaceLayerId || null;
        }
        object = object.parent || null;
      }
    }
    return null;
  }

  function pickEntityAt(clientX, clientY) {
    return pickEntity({ clientX: clientX, clientY: clientY });
  }

  function pickInteractable(event) {
    const ground = screenToGround(event.clientX, event.clientY);
    if (!ground) return null;
    let best = null;
    let bestDist = Infinity;
    for (const inter of interactables) {
      if (inter.active === false) continue;
      const dist = Math.hypot(ground.x - inter.x, ground.z - inter.z);
      if (dist <= inter.radius && dist < bestDist) { best = inter; bestDist = dist; }
    }
    // Only trigger via click if player is also within range, so clicks far away walk instead.
    if (best && Math.hypot(player.pos.x - best.x, player.pos.z - best.z) <= best.radius) return best;
    return null;
  }

  function triggerInteractable(inter) {
    if (!inter || inter.active === false) return;
    const action = inter.action || {};
    if (action.type === "teleport" && Number.isFinite(action.teleport?.x) && Number.isFinite(action.teleport?.z)) {
      player.pos.x = action.teleport.x;
      player.pos.z = action.teleport.z;
      clickTarget = null;
      showPrompt("Geteleporteerd.");
      return;
    }
    if (action.type === "message") {
      showPrompt(action.message || inter.prompt || "");
    }
  }

  function screenToGround(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointer.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const groundY = num(world?.ground?.y, 0);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    return { x: round(hit.x), y: groundY, z: round(hit.z) };
  }

  function resolveCollision(target) {
    const startedAt = performance.now();
    collisionPerfState.checksLastFrame += 1;
    resolveMovementInto(target, player.pos, target, {
      radius: player.radius,
      ground: world?.ground,
      solids: activeSolids
    });
    collisionPerfState.lastResolveMs = round(collisionPerfState.lastResolveMs + (performance.now() - startedAt));
    return target;
  }

  function getPlayerState() {
    return snapshotPlayerState();
  }

  function worldToScreen(position) {
    const vector = new THREE.Vector3(num(position?.x, 0), num(position?.y, 0), num(position?.z, 0));
    vector.project(camera);
    const rect = canvas.getBoundingClientRect();
    return {
      x: (vector.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-vector.y * 0.5 + 0.5) * rect.height + rect.top
    };
  }

  function getCameraGroundBasis() {
    updateCameraGroundBasis();
    return {
      forward: { x: cameraForward.x, z: cameraForward.z },
      right: { x: cameraRight.x, z: cameraRight.z }
    };
  }

  function resolvePlayerMovementIntent(startPosition, desiredPosition, options = {}) {
    const radius = Math.max(0.05, num(options.radius, player.radius));
    const start = {
      x: num(startPosition?.x, player.pos.x),
      y: num(startPosition?.y, player.pos.y),
      z: num(startPosition?.z, player.pos.z)
    };
    const desired = {
      x: num(desiredPosition?.x, start.x),
      y: num(desiredPosition?.y, start.y),
      z: num(desiredPosition?.z, start.z)
    };
    const resolved = resolveMovement(start, desired, {
      radius: radius,
      ground: options.ground || world?.ground || null,
      solids: Array.isArray(options.solids) ? options.solids : activeSolids
    });
    const blocked = Math.hypot(resolved.x - desired.x, resolved.z - desired.z) > 0.0005;
    const collided = blocked && Math.hypot(resolved.x - start.x, resolved.z - start.z) <= 0.0005
      && Math.hypot(desired.x - start.x, desired.z - start.z) > 0.0005;
    return {
      x: resolved.x,
      y: resolved.y,
      z: resolved.z,
      blocked: blocked,
      collided: collided
    };
  }

  function setPlayerAnimationState(animationState) {
    if (!player.root) return snapshotPlayerState();
    const next = typeof animationState === "string" && animationState.trim() ? animationState.trim() : "idle";
    if (player.animationState !== next) {
      playAnimationState(player.root, next);
      player.animationState = next;
      requestRender("player-animation-state");
    }
    return snapshotPlayerState();
  }

  function setLocalPlayerDisplayName(displayName) {
    const next = String(displayName || "").trim();
    if (player.displayName === next && (!player.root || player.root.userData?.localPlayerNameplateRoot)) {
      return player.displayName;
    }
    player.displayName = next;
    if (player.root) {
      updateLocalPlayerNameplate(player.root, player.displayName);
      requestRender("player-display-name");
    }
    return player.displayName;
  }

  function buildKeyMap(worldData) {
    keyToAction.clear();
    actionToKeyCodes.clear();
    for (const bind of worldData?.keybinds || []) {
      if (!bind.keyCode || !bind.action) continue;
      keyToAction.set(bind.keyCode, bind.action);
      const codes = actionToKeyCodes.get(bind.action);
      if (codes) {
        if (!codes.includes(bind.keyCode)) codes.push(bind.keyCode);
      } else {
        actionToKeyCodes.set(bind.action, [bind.keyCode]);
      }
    }
  }

  function updateFlyCamera(delta) {
    if (!orbitControls || flyCameraKeys.size === 0) return;
    camera.getWorldDirection(flyCameraForward);
    flyCameraRight.crossVectors(flyCameraForward, camera.up).normalize();
    flyCameraMove.set(0, 0, 0);
    if (flyCameraKeys.has("KeyW")) flyCameraMove.add(flyCameraForward);
    if (flyCameraKeys.has("KeyS")) flyCameraMove.sub(flyCameraForward);
    if (flyCameraKeys.has("KeyD")) flyCameraMove.add(flyCameraRight);
    if (flyCameraKeys.has("KeyA")) flyCameraMove.sub(flyCameraRight);
    if (flyCameraKeys.has("KeyE")) flyCameraMove.y += 1;
    if (flyCameraKeys.has("KeyQ")) flyCameraMove.y -= 1;
    if (flyCameraMove.lengthSq() < 0.0001) return;
    const flySpeed = EDITOR_FLY_CAMERA_SPEED * (modifierState.shiftKey ? EDITOR_FLY_CAMERA_SPRINT_MULTIPLIER : 1);
    flyCameraMove.normalize().multiplyScalar(flySpeed * delta);
    camera.position.add(flyCameraMove);
    orbitControls.target.add(flyCameraMove);
    orbitControls.update();
  }

  function updateCameraGroundBasis() {
    const target = orbitControls ? orbitControls.target : camTarget;
    cameraForward.set(target.x - camera.position.x, 0, target.z - camera.position.z);
    if (cameraForward.lengthSq() < 0.0001) cameraForward.set(0, 0, -1);
    cameraForward.normalize();
    cameraRight.set(-cameraForward.z, 0, cameraForward.x);
  }

  function updatePlayer(delta) {
    if (mode !== "game" || !player.root) return;
    if (externalPlayerAuthority) {
      if (player.reconcileActive) {
        const smoothing = clamp(1 - Math.exp(-(delta * 1000) / Math.max(1, player.reconcileDurationMs)), 0, 1);
        player.pos.lerp(player.reconcileTarget, smoothing);
        player.facing = lerpAngleTowards(player.facing, player.reconcileTargetFacing, smoothing);
        player.reconcileElapsedMs += delta * 1000;
        const positionSettled = player.pos.distanceToSquared(player.reconcileTarget) < 0.0004;
        const facingGap = Math.abs(((player.reconcileTargetFacing - player.facing + Math.PI) % (Math.PI * 2)) - Math.PI);
        if (positionSettled && facingGap < 0.002 && player.reconcileElapsedMs >= player.reconcileDurationMs) {
          player.pos.copy(player.reconcileTarget);
          player.facing = player.reconcileTargetFacing;
          player.reconcileActive = false;
        }
      }
      player.root.position.copy(player.pos);
      player.root.rotation.y = player.facing;
      if (camFollow) camTarget.lerp(playerCameraTarget(), Math.min(1, delta * 8));
      updateCameraPosition();
      updateInteractionFocus();
      return;
    }
    moveVector.set(0, 0, 0);
    updateCameraGroundBasis();
    let usingKeys = false;
    if (isActionPressed("move_forward")) { moveVector.add(cameraForward); usingKeys = true; }
    if (isActionPressed("move_back")) { moveVector.sub(cameraForward); usingKeys = true; }
    if (isActionPressed("move_left")) { moveVector.sub(cameraRight); usingKeys = true; }
    if (isActionPressed("move_right")) { moveVector.add(cameraRight); usingKeys = true; }
    if (isActionPressed("rotate_cam_left")) camYaw -= camRotateSpeed * delta;
    if (isActionPressed("rotate_cam_right")) camYaw += camRotateSpeed * delta;

    let desiredAnimationState = "idle";

    if (!usingKeys && clickTarget) {
      const toTargetX = clickTarget.x - player.pos.x;
      const toTargetZ = clickTarget.z - player.pos.z;
      const dist = Math.hypot(toTargetX, toTargetZ);
      if (dist < 0.05) {
        clickTarget = null;
      } else {
        moveVector.set(toTargetX / dist, 0, toTargetZ / dist);
      }
    }

    if (moveVector.lengthSq() > 0.0001) {
      moveVector.normalize();
      const wantsSprint = usingKeys && isActionPressed("sprint");
      const speed = player.speed * (wantsSprint ? player.sprint : 1);
      movementTarget.set(player.pos.x + moveVector.x * speed * delta, player.pos.y, player.pos.z + moveVector.z * speed * delta);
      resolveCollision(movementTarget);
      if (movementTarget.distanceToSquared(player.pos) > 0.000001) {
        player.pos.copy(movementTarget);
      }
      desiredAnimationState = wantsSprint ? "run" : "walk";
      const desiredFacing = Math.atan2(moveVector.x, moveVector.z);
      player.facing = stepAngle(player.facing, desiredFacing, player.turnSpeed * DEG_TO_RAD * delta);
    }

    player.root.position.copy(player.pos);
    player.root.rotation.y = player.facing;
    if (desiredAnimationState !== player.animationState) {
      playAnimationState(player.root, desiredAnimationState);
      player.animationState = desiredAnimationState;
    }

    if (camFollow) camTarget.lerp(playerCameraTarget(), Math.min(1, delta * 8));
    updateCameraPosition();
    updateInteractionFocus();
  }

  function isActionPressed(action) {
    const keyCodes = actionToKeyCodes.get(action);
    if (!Array.isArray(keyCodes) || !keyCodes.length) return false;
    for (const code of keyCodes) {
      if (pressedKeys.has(code)) return true;
    }
    return false;
  }

  function stepAngle(current, target, maxStep) {
    let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) <= maxStep) return target;
    return current + Math.sign(diff) * maxStep;
  }

  function lerpAngleTowards(start, target, t) {
    let diff = ((target - start + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return start + diff * clamp(t, 0, 1);
  }

  function updateInteractionFocus() {
    if (!interactables.length) {
      if (activeInteractable !== null) {
        activeInteractable = null;
        renderHud();
      }
      return;
    }
    if (activeInteractable) {
      const dx = player.pos.x - activeInteractable.x;
      const dz = player.pos.z - activeInteractable.z;
      if (dx * dx + dz * dz <= activeInteractable.radius * activeInteractable.radius) return;
    }
    let best = null;
    let bestDist = Infinity;
    for (const inter of interactables) {
      if (inter.active === false) continue;
      const dist = Math.hypot(player.pos.x - inter.x, player.pos.z - inter.z);
      if (dist <= inter.radius && dist < bestDist) { best = inter; bestDist = dist; }
    }
    if (best !== activeInteractable) {
      activeInteractable = best;
      renderHud();
    }
  }

  // ---- HUD ----
  function resetRuntimeStats() {
    runtimeStats.sceneObjects = 0;
    runtimeStats.meshes = 0;
    runtimeStats.terrainVisuals = 0;
    runtimeStats.terrainLayers = 0;
    runtimeStats.terrainSurfaces = 0;
    runtimeStats.collisionShapes = 0;
    runtimeStats.entities = 0;
    runtimeStats.scatterInstances = 0;
    runtimeStats.interactables = 0;
    runtimeStats.remotePlayers = 0;
  }

  function countPublishedWorldItems(worldData) {
    let total = 0;
    if (worldData?.world) total += 1;
    if (worldData?.ground) total += 1;
    if (worldData?.camera) total += 1;
    if (worldData?.player) total += 1;
    if (worldData?.spawn) total += 1;
    total += Array.isArray(worldData?.lights) ? worldData.lights.length : 0;
    total += Array.isArray(worldData?.entities) ? worldData.entities.length : 0;
    total += Array.isArray(worldData?.interactables) ? worldData.interactables.length : 0;
    if (worldData?.chunkLoading?.editor) total += 1;
    if (worldData?.chunkLoading?.game) total += 1;
    total += Array.isArray(worldData?.keybinds) ? worldData.keybinds.length : 0;
    total += Array.isArray(worldData?.ui) ? worldData.ui.length : 0;
    total += Array.isArray(worldData?.terrain?.layers) ? worldData.terrain.layers.length : 0;
    total += Array.isArray(worldData?.terrain?.surfaces) ? worldData.terrain.surfaces.length : 0;
    total += Array.isArray(worldData?.collision?.blockers) ? worldData.collision.blockers.length : 0;
    total += Array.isArray(worldData?.collision?.walkableSurfaces) ? worldData.collision.walkableSurfaces.length : 0;
    return total;
  }

  function formatCompactCount(value) {
    if (!Number.isFinite(value)) return "--";
    const abs = Math.abs(value);
    if (abs >= 1000000) return (value / 1000000).toFixed(abs >= 10000000 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (abs >= 1000) return (value / 1000).toFixed(abs >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k";
    return String(Math.round(value));
  }

  function formatFrameMs(value) {
    if (!Number.isFinite(value)) return "--";
    return (value >= 10 ? value.toFixed(1) : value.toFixed(2)).replace(/\.0+$/, "") + "ms";
  }

  function formatTimingComparison(value, average) {
    const current = formatFrameMs(value);
    if (!Number.isFinite(average) || Number(average) <= 0) return current;
    const avg = formatFrameMs(average);
    if (current === "--" || avg === "--" || current === avg) return current;
    return current + " / " + avg;
  }

  function formatBudgetedCount(value, budget) {
    const current = formatCompactCount(value);
    const target = formatCompactCount(budget);
    if (current === "--" || target === "--") return current;
    return current + " / " + target;
  }

  function formatBudgetedFrameMs(value, target) {
    const current = formatFrameMs(value);
    const limit = formatFrameMs(target);
    if (current === "--" || limit === "--") return current;
    return current + " / " + limit;
  }

  function formatBlueprintLiveCount(blueprint, live) {
    const blueprintText = formatCompactCount(blueprint);
    const liveText = formatCompactCount(live);
    if (blueprintText === "--" && liveText === "--") return "--";
    if (blueprintText === "--") return "Live " + liveText;
    if (liveText === "--") return "B " + blueprintText;
    return "B " + blueprintText + " / Live " + liveText;
  }

  function toneHigherIsBetter(value, warn, danger) {
    if (!Number.isFinite(value)) return "neutral";
    if (Number.isFinite(danger) && value < danger) return "danger";
    if (Number.isFinite(warn) && value < warn) return "warn";
    return "ok";
  }

  function toneLowerIsBetter(value, warn, danger) {
    if (!Number.isFinite(value)) return "neutral";
    if (Number.isFinite(danger) && value > danger) return "danger";
    if (Number.isFinite(warn) && value > warn) return "warn";
    return "ok";
  }

  function setPerformanceRowValue(rowState, text, tone) {
    if (!rowState) return;
    rowState.value.textContent = text;
    rowState.value.className = "perf-hud-value perf-hud-value--" + (tone || "neutral");
  }

  function createPerformanceRow(labelText) {
    const row = document.createElement("div");
    row.className = "perf-hud-row";
    const label = document.createElement("span");
    label.className = "perf-hud-label";
    label.textContent = labelText;
    const value = document.createElement("span");
    value.className = "perf-hud-value perf-hud-value--neutral";
    value.textContent = "--";
    row.append(label, value);
    return { row: row, label: label, value: value };
  }

  function buildHud() {
    if (!hudElement) return;
    hudElement.innerHTML = "";
    const prompt = document.createElement("div");
    prompt.className = "hud-prompt";
    prompt.style.display = "none";
    hudElement.appendChild(prompt);
    hudNodes.prompt = prompt;
  }

  function clearHudModules() {
    for (const node of hudNodes.anchored.values()) node.remove();
    hudNodes.anchored.clear();
    for (const entry of hudNodes.performance.values()) entry.root.remove();
    hudNodes.performance.clear();
    perfHudNextUpdateAt = 0;
  }

  function buildHudTextModule(mod) {
    const el = document.createElement("div");
    el.className = "hud-text anchor-" + (mod.anchor || "top-left");
    el.textContent = mod.text || "";
    el.style.fontSize = num(mod.fontSize, 16) + "px";
    el.style.color = colorOrDefault(mod.color, "#ffffff");
    hudElement.appendChild(el);
    hudNodes.anchored.set(mod.id, el);
  }

  function buildPerformanceHudModule(mod) {
    const metrics = mod.metrics || {};
    const thresholds = mod.thresholds || {};
    const updateIntervalMs = Math.max(250, num(mod.updateIntervalMs, 500));
    const root = document.createElement("div");
    root.className = "perf-hud anchor-" + (mod.anchor || "top-right") + (mod.compact === false ? "" : " perf-hud--compact");
    root.dataset.hudId = mod.id || "perf_hud";
    const title = document.createElement("div");
    title.className = "perf-hud-title";
    title.textContent = mod.label || "Performance HUD";
    root.appendChild(title);
    const rows = document.createElement("div");
    rows.className = "perf-hud-rows";
    root.appendChild(rows);
    const rowStates = {};
    function addRow(key, labelText) {
      const rowState = createPerformanceRow(labelText);
      rows.appendChild(rowState.row);
      rowStates[key] = rowState;
    }
    if (metrics.showFps !== false) addRow("fps", "FPS");
    if (metrics.showFrameMs !== false) addRow("frameMs", "Frame");
    if (metrics.showRemoteSyncMs !== false) addRow("remoteSyncMs", "Remote sync");
    if (metrics.showMovementStepMs !== false) addRow("movementStepMs", "Movement");
    if (metrics.showMinimapDrawMs !== false) addRow("minimapDrawMs", "Minimap");
    if (metrics.showRenderer !== false) addRow("renderer", "Renderer");
    if (metrics.showDrawCalls !== false) addRow("drawCalls", "Draw");
    if (metrics.showTriangles !== false) addRow("triangles", "Tris");
    if (metrics.showGeometries !== false) addRow("geometries", "Geo");
    if (metrics.showTextures !== false) addRow("textures", "Tex");
    if (metrics.showSceneObjects !== false) addRow("sceneObjects", "Objects");
    if (metrics.showEntities !== false) addRow("entities", "Entities");
    if (metrics.showScatterInstances !== false) addRow("scatterInstances", "Scatter");
    if (metrics.showEntities !== false) addRow("interactables", "Interact");
    if (metrics.showTerrainVisuals !== false) addRow("terrainVisuals", "Terrain");
    if (metrics.showCollisionShapes !== false) addRow("collisionShapes", "Coll");
    if (metrics.showWorldSize === true) addRow("worldSize", "World");
    if (metrics.showChunkCulling === true) addRow("loadedChunks", "Chunks");
    if (metrics.showChunkCulling === true) addRow("hiddenObjects", "Hidden");
    if (metrics.showChunkCulling === true) addRow("culledEntities", "Culled");
    if (metrics.showChunkCulling === true) addRow("terrainVisible", "Terrain V");
    if (metrics.showChunkCulling === true) addRow("terrainHidden", "Terrain H");
    if (metrics.showChunkCulling === true) addRow("terrainResident", "Terrain R");
    if (metrics.showChunkCulling === true) addRow("terrainChunks", "T Chunks");
    hudElement.appendChild(root);
    hudNodes.performance.set(mod.id || "perf_hud", {
      root: root,
      rows: rowStates,
      metrics: metrics,
      thresholds: thresholds,
      updateIntervalMs: updateIntervalMs,
      nextUpdateAt: 0
    });
  }

  function setHudModules(modules) {
    hudModules = Array.isArray(modules) ? modules : [];
    if (!hudElement) return;
    clearHudModules();
    for (const mod of hudModules) {
      if (mod.type === "hud_text") {
        buildHudTextModule(mod);
      } else if (mod.type === "debug_performance_hud" && mod.enabled !== false) {
        buildPerformanceHudModule(mod);
      }
    }
  }

  function renderHud() {
    if (!hudElement || !hudNodes.prompt) return;
    if (activeInteractable) {
      hudNodes.prompt.textContent = activeInteractable.prompt || "Interact";
      hudNodes.prompt.style.display = "block";
    } else {
      hudNodes.prompt.style.display = "none";
    }
    if (loadErrors.length && options.onLoadErrors) options.onLoadErrors(loadErrors.slice());
  }

  function getGameLoopTimingsSnapshot() {
    const empty = {
      remoteSyncMs: 0,
      remoteSyncAvgMs: 0,
      remoteSyncCalls: 0,
      remoteSyncLastAt: 0,
      movementStepMs: 0,
      movementStepAvgMs: 0,
      movementStepCalls: 0,
      movementStepLastAt: 0,
      minimapDrawMs: 0,
      minimapDrawAvgMs: 0,
      minimapDrawCalls: 0,
      minimapDrawLastAt: 0
    };
    const debug = window.__GK_GAME_CLIENT_DEBUG;
    if (!debug) return empty;
    try {
      const source = typeof debug.getGameLoopTimings === "function"
        ? debug.getGameLoopTimings()
        : (typeof debug.getState === "function" ? debug.getState()?.gameLoopTimings : null);
      if (!source || typeof source !== "object") return empty;
      return {
        remoteSyncMs: round(num(source.remoteSyncMs, 0)),
        remoteSyncAvgMs: round(num(source.remoteSyncAvgMs, 0)),
        remoteSyncCalls: Math.max(0, Math.floor(num(source.remoteSyncCalls, 0))),
        remoteSyncLastAt: Math.max(0, round(num(source.remoteSyncLastAt, 0))),
        movementStepMs: round(num(source.movementStepMs, 0)),
        movementStepAvgMs: round(num(source.movementStepAvgMs, 0)),
        movementStepCalls: Math.max(0, Math.floor(num(source.movementStepCalls, 0))),
        movementStepLastAt: Math.max(0, round(num(source.movementStepLastAt, 0))),
        minimapDrawMs: round(num(source.minimapDrawMs, 0)),
        minimapDrawAvgMs: round(num(source.minimapDrawAvgMs, 0)),
        minimapDrawCalls: Math.max(0, Math.floor(num(source.minimapDrawCalls, 0))),
        minimapDrawLastAt: Math.max(0, round(num(source.minimapDrawLastAt, 0)))
      };
    } catch {
      return empty;
    }
  }

  function buildPerformanceSnapshot() {
    const info = renderer.info || {};
    const renderInfo = info.render || {};
    const memoryInfo = info.memory || {};
    const groundResidentVisuals = groundChunkState.stats.fullGroundPlaneActive === true
      ? 1
      : Math.max(0, groundChunkState.stats.groundTilesResident || 0);
    return {
      fps: perfHudFrameMs > 0 ? 1000 / perfHudFrameMs : 0,
      frameMs: perfHudFrameMs,
      renderer: rendererLabel,
      drawCalls: Number(renderInfo.calls) || 0,
      triangles: Number(renderInfo.triangles) || 0,
      geometries: Number(memoryInfo.geometries) || 0,
      textures: Number(memoryInfo.textures) || 0,
      sceneChildren: scene.children.length,
      runtimeObjects: runtimeStats.sceneObjects,
      hiddenObjects: chunkRuntimeState.hiddenObjects,
      sceneObjects: runtimeStats.sceneObjects,
      meshes: runtimeStats.meshes,
      entities: runtimeStats.entities,
      scatterInstances: runtimeStats.scatterInstances,
      interactables: runtimeStats.interactables,
      remotePlayers: runtimeStats.remotePlayers || 0,
      terrainVisuals: runtimeStats.terrainVisuals,
      collisionShapes: runtimeStats.collisionShapes,
      worldSize: publishedWorldItemCount,
      worldBlueprintItems: contentBlueprintIndex.blueprintWorldItemCount || publishedWorldItemCount,
      worldResidentItems: residentContentState.residentWorldItemCount || 0,
      blueprintEntities: contentBlueprintIndex.blueprintEntityCount || 0,
      blueprintScatterInstances: contentBlueprintIndex.blueprintScatterInstanceCount || 0,
      blueprintInteractables: contentBlueprintIndex.blueprintInteractableCount || 0,
      residentChunks: residentContentState.residentChunkKeys.size || 0,
      residentEntities: residentContentState.loadedEntityCount || 0,
      residentScatterBatches: residentContentState.loadedScatterBatchCount || 0,
      residentScatterInstances: residentContentState.loadedScatterInstanceCount || 0,
      residentInteractables: residentContentState.loadedInteractableCount || 0,
      residentSolids: residentContentState.loadedSolidCount || 0,
      residentObject3D: residentContentState.residentObject3DCount || runtimeStats.sceneObjects,
      loadedChunks: chunkRuntimeState.loadedChunkKeys.length,
      culledEntities: chunkRuntimeState.culledEntities,
      terrainVisible: chunkRuntimeState.terrainVisuals?.visible || 0,
      terrainHidden: chunkRuntimeState.terrainVisuals?.hidden || 0,
      terrainResident: terrainStreamingState.residentPieces + groundResidentVisuals,
      terrainChunks: terrainStreamingState.residentChunks + groundResidentVisuals,
      gameLoopTimings: getGameLoopTimingsSnapshot()
    };
  }

  function countShadowUsage(object) {
    const stats = { casters: 0, receivers: 0 };
    if (!object || typeof object.traverse !== "function") return stats;
    object.traverse(function (child) {
      if (!child) return;
      if (child.isMesh || child.isInstancedMesh) {
        if (child.castShadow) stats.casters += 1;
        if (child.receiveShadow) stats.receivers += 1;
      }
    });
    return stats;
  }

  function countTaggedShadowCasters(root, predicate) {
    let casters = 0;
    if (!root || typeof root.traverse !== "function") return casters;
    root.traverse(function (child) {
      if (!child || !(child.isMesh || child.isInstancedMesh) || child.castShadow !== true) return;
      let node = child;
      while (node && node !== root) {
        if (predicate(node)) {
          casters += 1;
          return;
        }
        node = node.parent;
      }
    });
    return casters;
  }

  // Fase 8.6 (DEEL G): proves debug/helper/chunk-overlay/selection meshes never cast/receive
  // shadows, and gives Kevin a per-category breakdown of who is actually casting a shadow so a
  // "round blob" report can be traced to a real cause (quality/camera-size/bias) instead of a
  // stray helper mesh.
  function buildShadowDiagnostics() {
    sanitizeNonWorldShadowCasters(selectionHelper);
    sanitizeNonWorldShadowCasters(transformGuide);
    sanitizeNonWorldShadowCasters(terrainEditorOverlay);
    sanitizeNonWorldShadowCasters(scatterEditorOverlay);
    sanitizeNonWorldShadowCasters(chunkDebugOverlay);
    const stableShadows = stableSunShadowController?.getSnapshot?.() || null;
    const policy = currentShadowPolicy();
    const snapshot = stableShadows || {
      enabled: Boolean(policy?.enabled),
      mode: stableShadowModeName(mode),
      preset: policy?.preset || "middel_schaduw",
      legacyFieldsIgnored: Boolean(policy?.legacyFieldsIgnored),
      rendererShadowMapEnabled: Boolean(policy?.enabled),
      shadowMapType: policy?.mapTypeName || "unknown",
      mapSize: policy?.mapSize || 0,
      cameraSize: policy?.cameraSize || 0,
      cameraNear: policy?.cameraNear || 1,
      cameraFar: policy?.cameraFar || 0,
      bias: policy?.bias || 0,
      normalBias: policy?.normalBias || 0,
      sunDirection: { x: 0, y: -1, z: 0 },
      focusMode: policy?.focusMode || (mode === "editor" ? "editor_world_center_or_selected" : "player_or_spawn"),
      rawFocus: { x: 0, y: 0, z: 0 },
      snappedFocus: { x: 0, y: 0, z: 0 },
      snapWorldUnits: policy?.snapWorldUnits || 0,
      lastProjectionUpdateReason: "init",
      projectionUpdateCount: 0,
      framesSinceProjectionUpdate: 0,
      renderResidentChunkCount: 0,
      shadowResidentChunkCount: 0,
      shadowResidentMarginChunks: policy?.shadowResidentMarginChunks || 0,
      casterCounts: {},
      receiverCounts: {},
      helperCasterCount: 0,
      debugCasterCount: 0,
      circleOrPlaneCasterCount: 0,
      proxyCasterCount: 0,
      instancedCasterCount: 0,
      jumpDetected: false,
      lastJumpDistance: 0,
      warnings: [],
      shadowCasterCount: 0,
      shadowReceiverCount: 0,
      renderResidentChunkKeys: [],
      shadowResidentChunkKeys: [],
      shadowWindowChunkKeys: []
    };
    snapshot.mode = snapshot.mode || stableShadowModeName(mode);
    snapshot.preset = snapshot.preset || policy?.preset || "middel_schaduw";
    snapshot.legacyFieldsIgnored = Boolean(snapshot.legacyFieldsIgnored || policy?.legacyFieldsIgnored);
    snapshot.rendererShadowMapEnabled = snapshot.rendererShadowMapEnabled === true;
    snapshot.shadowMapType = snapshot.shadowMapType || snapshot.shadowType || policy?.mapTypeName || "unknown";
    snapshot.mapSize = snapshot.mapSize || snapshot.shadowMapSize || 0;
    snapshot.cameraSize = snapshot.cameraSize || snapshot.shadowCameraSize || 0;
    snapshot.cameraNear = snapshot.cameraNear || 1;
    snapshot.cameraFar = snapshot.cameraFar || snapshot.shadowCameraBounds?.far || 0;
    snapshot.rawFocus = Object.assign({}, snapshot.rawFocus || {});
    snapshot.snappedFocus = Object.assign({}, snapshot.snappedFocus || {});
    snapshot.sunDirection = Object.assign({}, snapshot.sunDirection || { x: 0, y: -1, z: 0 });
    snapshot.casterCounts = Object.assign({}, snapshot.casterCounts || {});
    snapshot.receiverCounts = Object.assign({}, snapshot.receiverCounts || {});
    snapshot.warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings.slice() : [];
    return snapshot;
  }

  // Fase 8.7: approximates "manual override" as a field whose resolved value differs from the
  // visible preset table. The flat node-value schema can't distinguish "Kevin typed this value"
  // from "this happens to equal the preset/default", so this diff is the honest signal once a
  // preset has been selected.
  function buildPerformanceProfileDiagnostics() {
    const game = worldPerformance.game || {};
    const editor = worldPerformance.editor || {};
    const compareKeys = [
      "pixelRatioCap",
      "antialias",
      "fogEnabled",
      "maxFps",
      "debugHelpersVisible",
      "debugWarningsVisible",
      "debugChunkOverlayVisible",
      "chunkGridVisible",
      "chunkLabelsVisible",
      "streamingDebugVisible"
    ];
    const shadowCompareKeys = [
      "enabled",
      "mapSize",
      "cameraSize",
      "cameraNear",
      "cameraFar",
      "bias",
      "normalBias",
      "type",
      "updateMode",
      "snapWorldUnits",
      "focusMode",
      "staticPropsCast",
      "staticPropsReceive",
      "scatterCast",
      "scatterReceive",
      "groundReceives",
      "terrainReceives",
      "shadowResidentMarginChunks"
    ];
    const editorPresetValues = editor.preset ? worldSettingsPresetValues("editor", editor.preset) : null;
    const gamePresetValues = game.preset ? worldSettingsPresetValues("game", game.preset) : null;
    const editorManualOverrides = editorPresetValues ? compareKeys.filter(function (key) {
      return editorPresetValues[key] !== undefined && editor[key] !== editorPresetValues[key];
    }) : [];
    const gameManualOverrides = gamePresetValues ? compareKeys.filter(function (key) {
      return gamePresetValues[key] !== undefined && game[key] !== gamePresetValues[key];
    }) : [];
    const editorShadow = editor.shadow || {};
    const gameShadow = game.shadow || {};
    const editorShadowManualOverrides = editorPresetValues ? shadowCompareKeys.filter(function (key) {
      return editorPresetValues[key] !== undefined && editorShadow[key] !== editorPresetValues[key];
    }) : [];
    const gameShadowManualOverrides = gamePresetValues ? shadowCompareKeys.filter(function (key) {
      return gamePresetValues[key] !== undefined && gameShadow[key] !== gamePresetValues[key];
    }) : [];
    return {
      editorPreset: editor.preset || "",
      gamePreset: game.preset || "",
      editorResolvedFromPreset: editorPresetValues,
      gameResolvedFromPreset: gamePresetValues,
      editorManualOverrides: editorManualOverrides,
      gameManualOverrides: gameManualOverrides,
      editorShadowManualOverrides: editorShadowManualOverrides,
      gameShadowManualOverrides: gameShadowManualOverrides
    };
  }

  function debugCollisionAt(x, z, radius = 0) {
    return {
      blockedByBlocker: isPointBlockedByBlocker(undefined, x, z, radius),
      blockedByTerrain: isPointBlockedByTerrain(undefined, x, z, radius),
      onWalkableSurface: isPointOnWalkableSurface(undefined, x, z)
    };
  }

  function normalizePlayerState(nextState) {
    const state = nextState && typeof nextState === "object" ? nextState : {};
    const fallbackRotation = player.facing / DEG_TO_RAD;
    return {
      x: num(state.x, player.pos.x),
      y: Number.isFinite(Number(state.y)) ? num(state.y, player.pos.y) : player.pos.y,
      z: num(state.z, player.pos.z),
      rotationY: Number.isFinite(Number(state.rotationY))
        ? num(state.rotationY, fallbackRotation)
        : fallbackRotation
    };
  }

  function snapshotPlayerState() {
    const animationDebug = getAnimationDebugForRoot(player.root);
    return {
      x: round(player.pos.x),
      y: round(player.pos.y),
      z: round(player.pos.z),
      radius: round(player.radius),
      rotationY: round(player.facing / DEG_TO_RAD),
      animationState: player.animationState,
      animationClipName: animationDebug.animationClipName,
      animationClipDuration: animationDebug.animationClipDuration,
      animationPlaybackScale: animationDebug.animationPlaybackScale,
      animationActionTime: animationDebug.animationActionTime,
      reconcileActive: player.reconcileActive
    };
  }

  function setPlayerState(nextState, options = {}) {
    if (!player.root) {
      player.pendingState = {
        nextState: nextState && typeof nextState === "object" ? Object.assign({}, nextState) : {},
        options: Object.assign({}, options)
      };
      return snapshotPlayerState();
    }
    const normalized = normalizePlayerState(nextState);
    const target = new THREE.Vector3(normalized.x, normalized.y, normalized.z);
    const targetFacing = normalized.rotationY * DEG_TO_RAD;
    const requestedAnimation = typeof options.animationState === "string" && options.animationState.trim()
      ? options.animationState.trim()
      : (player.pos.distanceTo(target) > 0.01 ? "walk" : "idle");
    const shouldReconcile = options.immediate === false || options.reconcile === true;
    const shouldSmooth = shouldReconcile && player.pos.distanceToSquared(target) > 0.0004;

    player.pendingState = null;
    if (shouldSmooth) {
      player.reconcileActive = true;
      player.reconcileTarget.copy(target);
      player.reconcileTargetFacing = targetFacing;
      player.reconcileDurationMs = Math.max(60, num(options.reconcileDurationMs, 120));
      player.reconcileElapsedMs = 0;
    } else {
      player.reconcileActive = false;
      player.pos.copy(target);
      player.facing = targetFacing;
      player.reconcileElapsedMs = 0;
    }

    if (player.root) {
      if (player.animationState !== requestedAnimation) {
        playAnimationState(player.root, requestedAnimation);
        player.animationState = requestedAnimation;
      }
      if (!shouldSmooth) {
        player.root.position.copy(player.pos);
        player.root.rotation.y = player.facing;
      }
    }

    if (camFollow) camTarget.lerp(playerCameraTarget(), 1);
    updateCameraPosition();
    updateInteractionFocus();
    requestRender("player-state");
    return snapshotPlayerState();
  }

  function debugState(options = {}) {
    const includeShadowDiagnostics = options?.includeShadowDiagnostics !== false;
    const chunkLoadingState = chunkDebugStateCache || createChunkDebugState({ includeWindow: false });
    const performanceSnapshot = buildPerformanceSnapshot();
    const lastFrameTiming = DEBUG_RUNTIME.lastFrameTiming || {};
    const shadowStats = countShadowUsage(scene);
    const currentShadowPolicyState = currentShadowPolicy();
    const debugOverlayVisible = Boolean(activeModePerformance().debugChunkOverlayVisible === true && resolveChunkPolicy(world, mode)?.debugOverlay === true);
    const playerAnimationDebug = getAnimationDebugForRoot(player.root);
    const ghostPlaneDiagnostics = removeGhostChunkPlanes("debugState", {
      scene: scene,
      camera: camera,
      content: content,
      terrainRuntimeGroup: terrainRuntimeGroup,
      chunkDebugOverlay: chunkDebugOverlay,
      selectionHelper: selectionHelper,
      transformGuide: transformGuide,
      terrainEditorOverlay: terrainEditorOverlay,
      scatterEditorOverlay: scatterEditorOverlay,
      world: world,
      debugOverlayVisible: debugOverlayVisible
    });
    const runtimeRoots = {
      scene: {
        name: scene?.name || "scene",
        uuid: scene?.uuid || "",
        visible: scene?.visible !== false,
        childCount: Array.isArray(scene?.children) ? scene.children.length : 0
      },
      content: {
        name: content?.name || "content",
        uuid: content?.uuid || "",
        visible: content?.visible !== false,
        childCount: Array.isArray(content?.children) ? content.children.length : 0
      },
      terrainRuntimeGroup: terrainRuntimeGroup ? {
        name: terrainRuntimeGroup.name || "",
        uuid: terrainRuntimeGroup.uuid || "",
        visible: terrainRuntimeGroup.visible !== false,
        childCount: Array.isArray(terrainRuntimeGroup.children) ? terrainRuntimeGroup.children.length : 0
      } : null,
      chunkDebugOverlay: chunkDebugOverlay ? {
        name: chunkDebugOverlay.name || "",
        uuid: chunkDebugOverlay.uuid || "",
        visible: chunkDebugOverlay.visible !== false,
        childCount: Array.isArray(chunkDebugOverlay.children) ? chunkDebugOverlay.children.length : 0
      } : null,
      selectionHelper: selectionHelper ? {
        name: selectionHelper.name || "",
        uuid: selectionHelper.uuid || "",
        visible: selectionHelper.visible !== false,
        childCount: Array.isArray(selectionHelper.children) ? selectionHelper.children.length : 0
      } : null,
      transformGuide: transformGuide ? {
        name: transformGuide.name || "",
        uuid: transformGuide.uuid || "",
        visible: transformGuide.visible !== false,
        childCount: Array.isArray(transformGuide.children) ? transformGuide.children.length : 0
      } : null,
      terrainEditorOverlay: terrainEditorOverlay ? {
        name: terrainEditorOverlay.name || "",
        uuid: terrainEditorOverlay.uuid || "",
        visible: terrainEditorOverlay.visible !== false,
        childCount: Array.isArray(terrainEditorOverlay.children) ? terrainEditorOverlay.children.length : 0
      } : null,
      scatterEditorOverlay: scatterEditorOverlay ? {
        name: scatterEditorOverlay.name || "",
        uuid: scatterEditorOverlay.uuid || "",
        visible: scatterEditorOverlay.visible !== false,
        childCount: Array.isArray(scatterEditorOverlay.children) ? scatterEditorOverlay.children.length : 0
      } : null,
      sceneChildren: Array.isArray(scene?.children) ? scene.children.map(function (child) {
        return {
          name: child?.name || "",
          uuid: child?.uuid || "",
          type: child?.type || child?.constructor?.name || "Object3D",
          visible: child?.visible !== false,
          childCount: Array.isArray(child?.children) ? child.children.length : 0
        };
      }) : [],
      contentChildren: Array.isArray(content?.children) ? content.children.map(function (child) {
        return {
          name: child?.name || "",
          uuid: child?.uuid || "",
          type: child?.type || child?.constructor?.name || "Object3D",
          visible: child?.visible !== false,
          childCount: Array.isArray(child?.children) ? child.children.length : 0
        };
      }) : [],
      duplicateRuntimeRoots: Math.max(0, Array.isArray(scene?.children) ? scene.children.filter(function (child) {
        return child?.name === RUNTIME_TERRAIN_GROUP_NAME;
      }).length - 1 : 0) + Math.max(0, Array.isArray(scene?.children) ? scene.children.filter(function (child) {
        return child?.name === RUNTIME_CHUNK_OVERLAY_GROUP_NAME;
      }).length - 1 : 0),
      cameraChildOverlayGroups: Number(overlayDiagnosticsState?.cameraChildOverlayGroups || 0)
    };
    const shadowCasterAudit = auditSceneObjectsForShadowCasters({
      scene: scene,
      content: content,
      terrainRuntimeGroup: terrainRuntimeGroup,
      chunkDebugOverlay: chunkDebugOverlay,
      selectionHelper: selectionHelper,
      transformGuide: transformGuide,
      terrainEditorOverlay: terrainEditorOverlay,
      scatterEditorOverlay: scatterEditorOverlay
    });
    const shadowSystem = includeShadowDiagnostics ? buildShadowDiagnostics() : null;
    const groundResidentVisuals = chunkLoadingState.ground?.fullGroundPlaneActive === true
      ? 1
      : Math.max(0, chunkLoadingState.ground?.groundTilesResident || 0);
    const contentStreaming = buildContentStreamingDebugState();
    return {
      mode: mode,
      contentStreaming: contentStreaming,
      world: {
        terrain: {
          layers: Array.isArray(world?.terrain?.layers) ? world.terrain.layers.length : 0,
          surfaces: Array.isArray(world?.terrain?.surfaces) ? world.terrain.surfaces.length : 0
        },
        collision: {
          blockers: Array.isArray(world?.collision?.blockers) ? world.collision.blockers.length : 0,
          walkableSurfaces: Array.isArray(world?.collision?.walkableSurfaces) ? world.collision.walkableSurfaces.length : 0
        },
        chunkLoading: Object.assign({}, chunkLoadingState, {
          terrainVisuals: Object.assign({}, chunkLoadingState.terrainVisuals || {}),
          terrainStreaming: Object.assign({}, chunkLoadingState.terrainStreaming || {}, {
            residentChunkKeys: Array.isArray(chunkLoadingState.terrainStreaming?.residentChunkKeys)
              ? chunkLoadingState.terrainStreaming.residentChunkKeys.slice()
              : []
          }),
          streamingCoverage: {
            source: chunkLoadingState.streamingCoverageSource || "none",
            centerChunk: chunkLoadingState.centerChunk || null,
            activeChunkKeys: Array.isArray(chunkLoadingState.activeChunkKeys) ? chunkLoadingState.activeChunkKeys.slice() : [],
            visibleChunkKeys: Array.isArray(chunkLoadingState.visibleChunkKeys) ? chunkLoadingState.visibleChunkKeys.slice() : [],
            forwardChunkKeys: Array.isArray(chunkLoadingState.forwardChunkKeys) ? chunkLoadingState.forwardChunkKeys.slice() : [],
            preloadChunkKeys: Array.isArray(chunkLoadingState.preloadChunkKeys) ? chunkLoadingState.preloadChunkKeys.slice() : [],
            desiredResidentChunkKeys: Array.isArray(chunkLoadingState.desiredResidentChunkKeys) ? chunkLoadingState.desiredResidentChunkKeys.slice() : [],
            unloadSafeChunkKeys: Array.isArray(chunkLoadingState.unloadSafeChunkKeys) ? chunkLoadingState.unloadSafeChunkKeys.slice() : [],
            presenceChunkKey: chunkLoadingState.presenceChunkKey || null,
            presenceChunkDistance: Number.isFinite(Number(chunkLoadingState.presenceChunkDistance)) ? Number(chunkLoadingState.presenceChunkDistance) : null,
            presenceChunkAccepted: chunkLoadingState.presenceChunkAccepted === true,
            renderResidentChunkKeys: Array.isArray(chunkLoadingState.renderResidentChunkKeys) ? chunkLoadingState.renderResidentChunkKeys.slice() : [],
            shadowResidentChunkKeys: Array.isArray(chunkLoadingState.shadowResidentChunkKeys) ? chunkLoadingState.shadowResidentChunkKeys.slice() : [],
            collisionResidentChunkKeys: Array.isArray(chunkLoadingState.collisionResidentChunkKeys) ? chunkLoadingState.collisionResidentChunkKeys.slice() : [],
            shadowWindowChunkKeys: Array.isArray(chunkLoadingState.shadowWindowChunkKeys) ? chunkLoadingState.shadowWindowChunkKeys.slice() : []
          },
          contentStreaming: contentStreaming,
          residentBootstrap: Object.assign({}, residentBootstrapState)
        }),
        objectResidency: cloneResidencySummary(chunkLoadingState.objectResidency) || createEmptyObjectResidencySummary(),
        chunkResidency: cloneResidencySummary(chunkLoadingState.chunkResidency) || createEmptyChunkResidencySummary(),
        lighting: {
          shadowAnchor: Object.assign({}, shadowAnchorState),
          shadowsEnabled: currentShadowPolicyState.enabled === true,
          shadowQuality: currentShadowPolicyState.quality || "off",
          shadowMapType: currentShadowPolicyState.mapTypeName || shadowMapTypeName(currentShadowPolicyState.mapType),
          shadowMapSize: currentShadowPolicyState.mapSize || 0,
          shadowCasters: shadowStats.casters,
          shadowReceivers: shadowStats.receivers
        },
        stableShadows: Object.assign({}, chunkLoadingState?.stableShadows || stableSunShadowController?.getSnapshot?.() || {}),
        runtimeRoots: runtimeRoots,
        frameStats: {
          frameMs: performanceSnapshot.frameMs,
          renderMs: round(lastFrameTiming.renderMs || 0),
          syncChunkMs: round(lastFrameTiming.syncChunkMs || lastFrameTiming.syncChunkDebugStateMs || 0),
          updatePlayerMs: round(lastFrameTiming.updatePlayerMs || 0),
          hudMs: round(lastFrameTiming.hudMs || lastFrameTiming.updatePerformanceHudMs || 0),
          animationMs: round(lastFrameTiming.animationMs || lastFrameTiming.updateAnimationMs || 0),
          drawCalls: performanceSnapshot.drawCalls,
          triangles: performanceSnapshot.triangles,
          geometries: performanceSnapshot.geometries,
          textures: performanceSnapshot.textures,
          sceneChildren: performanceSnapshot.sceneChildren,
          runtimeObjects: performanceSnapshot.runtimeObjects,
          hiddenObjects: performanceSnapshot.hiddenObjects,
          sceneObjects: performanceSnapshot.sceneObjects,
          scatterInstances: performanceSnapshot.scatterInstances,
          loadedChunks: performanceSnapshot.loadedChunks,
          residentChunks: performanceSnapshot.residentChunks,
          residentEntities: performanceSnapshot.residentEntities,
          residentScatterInstances: performanceSnapshot.residentScatterInstances,
          residentInteractables: performanceSnapshot.residentInteractables,
          residentSolids: performanceSnapshot.residentSolids,
          residentObject3D: performanceSnapshot.residentObject3D,
          worldBlueprintItems: performanceSnapshot.worldBlueprintItems,
          worldResidentItems: performanceSnapshot.worldResidentItems,
          terrainResident: performanceSnapshot.terrainResident,
          groundTilesResident: groundResidentVisuals,
          sync: {
            syncCalls: chunkSyncStats.syncCalls,
            heavySyncCalls: chunkSyncStats.heavySyncCalls,
            skippedSyncCalls: chunkSyncStats.skippedSyncCalls,
            lastHeavyReason: chunkSyncStats.lastHeavyReason,
            lastHeavySyncMs: chunkSyncStats.lastHeavySyncMs
          },
          gameLoopTimings: Object.assign({}, performanceSnapshot.gameLoopTimings || {})
        },
        rendering: {
          api: rendererLabel,
          name: rendererProfile.name,
          vendor: rendererProfile.vendor,
          software: rendererProfile.software,
          antialias: renderer.getContext?.().getContextAttributes?.()?.antialias === true,
          pixelRatio: renderer.getPixelRatio ? renderer.getPixelRatio() : activeModePerformance().pixelRatioCap,
          canvasWidth: renderer.domElement?.width || canvas.width || 0,
          canvasHeight: renderer.domElement?.height || canvas.height || 0
        },
        collisionPerformance: {
          activeSolids: collisionPerfState.activeSolids,
          terrainBlockers: collisionPerfState.terrainBlockers,
          surfaceBlockers: collisionPerfState.surfaceBlockers,
          checksLastFrame: collisionPerfState.checksLastFrame,
          lastResolveMs: collisionPerfState.lastResolveMs
        },
        performance: {
          shared: Object.assign({}, worldPerformance.shared),
          editor: Object.assign({}, worldPerformance.editor),
          game: Object.assign({}, worldPerformance.game),
          compatibility: Object.assign({}, worldPerformance.compatibility)
        },
        performanceProfile: buildPerformanceProfileDiagnostics(),
        ghostPlaneDiagnostics: ghostPlaneDiagnostics,
        shadowCasterAudit: shadowCasterAudit,
        shadowSystem: shadowSystem,
        shadowDiagnostics: shadowSystem,
        overlayDiagnostics: Object.assign({}, overlayDiagnosticsState),
        ui: Array.isArray(world?.ui) ? world.ui.length : 0
      },
      player: {
        x: round(player.pos.x),
        y: round(player.pos.y),
        z: round(player.pos.z),
        radius: round(player.radius),
        animationState: player.animationState,
        animationClipName: playerAnimationDebug.animationClipName,
        animationClipDuration: playerAnimationDebug.animationClipDuration,
        animationPlaybackScale: playerAnimationDebug.animationPlaybackScale,
        animationActionTime: playerAnimationDebug.animationActionTime
      },
      stats: {
        sceneObjects: runtimeStats.sceneObjects,
        meshes: runtimeStats.meshes,
        terrainVisuals: runtimeStats.terrainVisuals,
        terrainLayers: runtimeStats.terrainLayers,
        terrainSurfaces: runtimeStats.terrainSurfaces,
        drawCalls: performanceSnapshot.drawCalls,
        textures: performanceSnapshot.textures,
        frameMs: performanceSnapshot.frameMs,
        scatterInstances: runtimeStats.scatterInstances,
        terrainVisible: chunkLoadingState.terrainVisuals?.visible || 0,
        terrainHidden: chunkLoadingState.terrainVisuals?.hidden || 0,
        terrainResident: (chunkLoadingState.terrainStreaming?.residentPieces || 0) + groundResidentVisuals,
        terrainChunks: (chunkLoadingState.terrainStreaming?.residentChunks || 0) + groundResidentVisuals,
        collisionShapes: runtimeStats.collisionShapes,
        entities: runtimeStats.entities,
        interactables: runtimeStats.interactables
      }
    };
  }

  function debugTeleportPlayer(x, z) {
    setPlayerState({
      x: x,
      y: player.pos.y,
      z: z,
      rotationY: player.facing / DEG_TO_RAD
    }, { immediate: true, animationState: "idle" });
    return debugState();
  }

  function debugStepPlayerTo(x, z) {
    movementTarget.set(num(x, player.pos.x), player.pos.y, num(z, player.pos.z));
    resolveCollision(movementTarget);
    setPlayerState({
      x: movementTarget.x,
      y: movementTarget.y,
      z: movementTarget.z,
      rotationY: player.facing / DEG_TO_RAD
    }, { immediate: true, animationState: "walk" });
    return debugState();
  }

  function updatePerformanceHud(now) {
    if (!hudNodes.performance.size) return;
    if (perfHudNextUpdateAt && now < perfHudNextUpdateAt) return;
    const snapshot = buildPerformanceSnapshot();
    let nextUpdateAt = Infinity;
    for (const entry of hudNodes.performance.values()) {
      if (now < entry.nextUpdateAt) {
        nextUpdateAt = Math.min(nextUpdateAt, entry.nextUpdateAt);
        continue;
      }
      const thresholds = entry.thresholds || {};
      const metrics = entry.metrics || {};
      if (metrics.showFps !== false && entry.rows.fps) {
        setPerformanceRowValue(entry.rows.fps, formatBudgetedCount(snapshot.fps, thresholds.fpsTarget), toneHigherIsBetter(snapshot.fps, thresholds.fpsWarn, thresholds.fpsDanger));
      }
    if (metrics.showFrameMs !== false && entry.rows.frameMs) {
      setPerformanceRowValue(entry.rows.frameMs, formatBudgetedFrameMs(snapshot.frameMs, thresholds.frameMsTarget), toneLowerIsBetter(snapshot.frameMs, thresholds.frameMsWarn, thresholds.frameMsDanger));
    }
    const gameLoopTimings = snapshot.gameLoopTimings || {};
    if (metrics.showRemoteSyncMs !== false && entry.rows.remoteSyncMs) {
      setPerformanceRowValue(entry.rows.remoteSyncMs, formatTimingComparison(gameLoopTimings.remoteSyncMs, gameLoopTimings.remoteSyncAvgMs), toneLowerIsBetter(gameLoopTimings.remoteSyncMs, 4, 10));
    }
    if (metrics.showMovementStepMs !== false && entry.rows.movementStepMs) {
      setPerformanceRowValue(entry.rows.movementStepMs, formatTimingComparison(gameLoopTimings.movementStepMs, gameLoopTimings.movementStepAvgMs), toneLowerIsBetter(gameLoopTimings.movementStepMs, 4, 10));
    }
    if (metrics.showMinimapDrawMs !== false && entry.rows.minimapDrawMs) {
      setPerformanceRowValue(entry.rows.minimapDrawMs, formatTimingComparison(gameLoopTimings.minimapDrawMs, gameLoopTimings.minimapDrawAvgMs), toneLowerIsBetter(gameLoopTimings.minimapDrawMs, 4, 10));
    }
    if (metrics.showRenderer !== false && entry.rows.renderer) {
      setPerformanceRowValue(entry.rows.renderer, snapshot.renderer, "neutral");
    }
      if (metrics.showDrawCalls !== false && entry.rows.drawCalls) {
        setPerformanceRowValue(entry.rows.drawCalls, formatBudgetedCount(snapshot.drawCalls, thresholds.drawCallsWarn), toneLowerIsBetter(snapshot.drawCalls, thresholds.drawCallsWarn, thresholds.drawCallsDanger));
      }
      if (metrics.showTriangles !== false && entry.rows.triangles) {
        setPerformanceRowValue(entry.rows.triangles, formatBudgetedCount(snapshot.triangles, thresholds.trianglesWarn), toneLowerIsBetter(snapshot.triangles, thresholds.trianglesWarn, thresholds.trianglesDanger));
      }
      if (metrics.showGeometries !== false && entry.rows.geometries) {
        setPerformanceRowValue(entry.rows.geometries, formatBudgetedCount(snapshot.geometries, thresholds.meshesWarn), toneLowerIsBetter(snapshot.geometries, thresholds.meshesWarn, thresholds.meshesDanger));
      }
      if (metrics.showTextures !== false && entry.rows.textures) {
        setPerformanceRowValue(entry.rows.textures, formatBudgetedCount(snapshot.textures, thresholds.texturesWarn), toneLowerIsBetter(snapshot.textures, thresholds.texturesWarn, thresholds.texturesDanger));
      }
    if (metrics.showSceneObjects !== false && entry.rows.sceneObjects) {
      setPerformanceRowValue(entry.rows.sceneObjects, formatBudgetedCount(snapshot.sceneObjects, thresholds.meshesWarn), toneLowerIsBetter(snapshot.sceneObjects, thresholds.meshesWarn, thresholds.meshesDanger));
    }
    if (metrics.showEntities !== false && entry.rows.entities) {
      setPerformanceRowValue(entry.rows.entities, formatBlueprintLiveCount(snapshot.blueprintEntities, snapshot.entities), toneLowerIsBetter(snapshot.entities, thresholds.meshesWarn, thresholds.meshesDanger));
    }
    if (metrics.showScatterInstances !== false && entry.rows.scatterInstances) {
      setPerformanceRowValue(entry.rows.scatterInstances, formatBlueprintLiveCount(snapshot.blueprintScatterInstances, snapshot.scatterInstances), toneLowerIsBetter(snapshot.scatterInstances, thresholds.meshesWarn, thresholds.meshesDanger));
    }
    if (metrics.showEntities !== false && entry.rows.interactables) {
      setPerformanceRowValue(entry.rows.interactables, formatBudgetedCount(snapshot.interactables, thresholds.meshesWarn), toneLowerIsBetter(snapshot.interactables, thresholds.meshesWarn, thresholds.meshesDanger));
    }
      if (metrics.showTerrainVisuals !== false && entry.rows.terrainVisuals) {
        setPerformanceRowValue(entry.rows.terrainVisuals, formatBudgetedCount(snapshot.terrainVisuals, thresholds.terrainVisualsWarn), toneLowerIsBetter(snapshot.terrainVisuals, thresholds.terrainVisualsWarn, thresholds.terrainVisualsDanger));
      }
      if (metrics.showCollisionShapes !== false && entry.rows.collisionShapes) {
        setPerformanceRowValue(entry.rows.collisionShapes, formatBudgetedCount(snapshot.collisionShapes, thresholds.collisionShapesWarn), toneLowerIsBetter(snapshot.collisionShapes, thresholds.collisionShapesWarn, thresholds.collisionShapesDanger));
      }
      if (metrics.showWorldSize === true && entry.rows.worldSize) {
        setPerformanceRowValue(entry.rows.worldSize, formatBlueprintLiveCount(snapshot.worldBlueprintItems, snapshot.worldResidentItems), toneLowerIsBetter(snapshot.worldResidentItems, thresholds.meshesWarn, thresholds.meshesDanger));
      }
      if (metrics.showChunkCulling === true && entry.rows.loadedChunks) {
        setPerformanceRowValue(entry.rows.loadedChunks, formatCompactCount(snapshot.loadedChunks), "neutral");
      }
      if (metrics.showChunkCulling === true && entry.rows.hiddenObjects) {
        setPerformanceRowValue(entry.rows.hiddenObjects, formatCompactCount(snapshot.hiddenObjects), "neutral");
      }
    if (metrics.showChunkCulling === true && entry.rows.culledEntities) {
      setPerformanceRowValue(entry.rows.culledEntities, formatCompactCount(snapshot.culledEntities), "neutral");
    }
    if (metrics.showChunkCulling === true && entry.rows.terrainVisible) {
      setPerformanceRowValue(entry.rows.terrainVisible, formatCompactCount(snapshot.terrainVisible), "neutral");
    }
    if (metrics.showChunkCulling === true && entry.rows.terrainHidden) {
      setPerformanceRowValue(entry.rows.terrainHidden, formatCompactCount(snapshot.terrainHidden), "neutral");
    }
    if (metrics.showChunkCulling === true && entry.rows.terrainResident) {
      setPerformanceRowValue(entry.rows.terrainResident, formatCompactCount(snapshot.terrainResident), "neutral");
    }
    if (metrics.showChunkCulling === true && entry.rows.terrainChunks) {
      setPerformanceRowValue(entry.rows.terrainChunks, formatCompactCount(snapshot.terrainChunks), "neutral");
    }
      entry.nextUpdateAt = now + entry.updateIntervalMs;
      nextUpdateAt = Math.min(nextUpdateAt, entry.nextUpdateAt);
    }
    perfHudNextUpdateAt = Number.isFinite(nextUpdateAt) ? nextUpdateAt : 0;
  }

  let promptTimer = null;
  function showPrompt(text) {
    if (!hudNodes.prompt) return;
    hudNodes.prompt.textContent = text;
    hudNodes.prompt.style.display = "block";
    if (promptTimer) clearTimeout(promptTimer);
    promptTimer = setTimeout(function () { renderHud(); }, 1800);
  }

  function setWorld(nextWorld) {
    worldBuildGeneration += 1;
    // In game mode is de server (via game.js) eigenaar van de spelerpositie.
    // spawnPlayer() zet de speler straks terug op world.spawn; zonder herstel
    // bouwt de streaming na een live republish de wereld rond de origin op
    // (het "dubbele chunk"-blok) terwijl de speler ergens anders staat, omdat
    // de stale-revision guard in game.js dezelfde serverpositie niet opnieuw
    // toepast.
    const previousGamePlayerState = mode === "game" && player.root
      ? {
        x: player.pos.x,
        y: player.pos.y,
        z: player.pos.z,
        rotationY: player.facing / DEG_TO_RAD,
        animationState: player.animationState
      }
      : null;
    world = nextWorld || null;
    applyWorldPerformance(world);
    if (!handleResize("world-performance")) scheduleResize("world-performance");
    const editorViewState = mode === "editor" && editorViewInitialized ? captureViewState() : null;
    clearContent();
    contentBlueprintIndex = buildContentBlueprintIndex(world, mode);
    scene.background = new THREE.Color(colorOrDefault(world?.world?.backgroundColor, "#0b1622"));
    const fogEnabled = activeModePerformance().fogEnabled !== false;
    if (fogEnabled && world?.world?.fogColor && num(world.world.fogDensity, 0) > 0) {
      scene.fog = new THREE.FogExp2(colorOrDefault(world.world.fogColor, "#0b1622"), num(world.world.fogDensity, 0));
    } else {
      scene.fog = null;
    }
    const useChunkedGround = shouldUseChunkedGround(world, mode);
    const residentStreamingEnabled = isChunkCullingRuntimeEnabled(resolveChunkPolicy(world, mode));
    if (!useChunkedGround) addGround(world);
    const nextWalkabilityIndex = buildWalkabilityIndex(world);
    runtimeCollisionBaseCount = (nextWalkabilityIndex.surfaceBlockers?.length || 0)
      + (nextWalkabilityIndex.blockers?.length || 0)
      + (nextWalkabilityIndex.walkables?.length || 0);
    collisionPerfState.terrainBlockers = nextWalkabilityIndex.blockers?.length || 0;
    collisionPerfState.surfaceBlockers = nextWalkabilityIndex.surfaceBlockers?.length || 0;
    collisionPerfState.activeSolids = 0;
    collisionPerfState.checksLastFrame = 0;
    collisionPerfState.lastResolveMs = 0;
    runtimeStats.collisionShapes = runtimeCollisionBaseCount;
    buildTerrainRuntimeStreamingVisuals(world);
    addLights(world);
    spawnPlayer(world);
    if (previousGamePlayerState && player.root) {
      setPlayerState(previousGamePlayerState, {
        immediate: true,
        animationState: previousGamePlayerState.animationState
      });
    }
    if (residentStreamingEnabled) {
      runtimeStats.entities = 0;
      runtimeStats.scatterInstances = 0;
      runtimeStats.interactables = 0;
    } else {
      const scatterEntities = [];
      const staticPropGroups = new Map();
      const queueStaticPropGroup = function (assetId, descriptor) {
        if (!assetId || !descriptor) return;
        let group = staticPropGroups.get(assetId);
        if (!group) {
          group = { assetId: assetId, descriptors: [] };
          staticPropGroups.set(assetId, group);
        }
        group.descriptors.push(descriptor);
      };
      for (const entity of world?.entities || []) {
        if (entity?.type === "scatter" || entity?.kind === "scatter") {
          scatterEntities.push(entity);
          continue;
        }
        if (canBatchStaticProp(world, entity?.modelAssetId)) {
          addEntity(world, entity, { skipVisual: true });
          queueStaticPropGroup(entity.modelAssetId, {
            kind: "entity",
            entity: entity,
            transform: entity.transform
          });
          continue;
        }
        addEntity(world, entity, modelShadowOptions(world, entity?.modelAssetId));
      }
      if (scatterEntities.length) addScatterEntities(world, scatterEntities);
      for (const inter of world?.interactables || []) {
        if (canBatchStaticProp(world, inter?.modelAssetId)) {
          addInteractable(world, inter, { skipVisual: true });
          queueStaticPropGroup(inter.modelAssetId, {
            kind: "interactable",
            inter: inter,
            transform: {
              position: {
                x: num(inter.position?.x, 0),
                y: num(world?.ground?.y, 0),
                z: num(inter.position?.z, 0)
              },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 }
            }
          });
          continue;
        }
        addInteractable(world, inter, modelShadowOptions(world, inter?.modelAssetId));
      }
      for (const group of staticPropGroups.values()) {
        if (!group.descriptors.length) continue;
        if (!addStaticPropBatch(world, group.assetId, group.descriptors)) {
          for (const descriptor of group.descriptors) {
            if (descriptor.kind === "entity") {
              addEntity(world, descriptor.entity, Object.assign({ skipCollision: true }, modelShadowOptions(world, descriptor.entity?.modelAssetId)));
            } else if (descriptor.kind === "interactable") {
              addInteractable(world, descriptor.inter, Object.assign({ skipRegistration: true }, modelShadowOptions(world, descriptor.inter?.modelAssetId)));
            }
          }
        }
      }
      runtimeStats.entities = contentBlueprintIndex.blueprintEntityCount;
      runtimeStats.scatterInstances = contentBlueprintIndex.blueprintScatterInstanceCount;
      runtimeStats.interactables = contentBlueprintIndex.blueprintInteractableCount;
    }
    buildKeyMap(world);
    publishedWorldItemCount = contentBlueprintIndex.blueprintWorldItemCount;
    if (mode === "game") {
      setHudModules(world?.ui || []);
      camTarget.copy(playerCameraTarget());
    }
    applyCameraConfig(world);
    const restoredEditorView = editorViewState ? restoreViewState(editorViewState) : false;
    removeDuplicateRuntimeGroups();
    syncChunkDebugState("setWorld");
    bootstrapResidentContentForCurrentView("setWorld");
    removeGhostChunkPlanes("setWorld", {
      scene: scene,
      camera: camera,
      content: content,
      terrainRuntimeGroup: terrainRuntimeGroup,
      chunkDebugOverlay: chunkDebugOverlay,
      selectionHelper: selectionHelper,
      transformGuide: transformGuide,
      terrainEditorOverlay: terrainEditorOverlay,
      scatterEditorOverlay: scatterEditorOverlay,
      world: world,
      debugOverlayVisible: Boolean(activeModePerformance().debugChunkOverlayVisible === true && resolveChunkPolicy(world, mode)?.debugOverlay === true)
    });
    renderHud();
    if (!restoredEditorView) requestRender();
    if (mode === "editor") editorViewInitialized = true;
  }

  function destroy() {
    disposed = true;
    rejectFrameProfileWaiters(new Error("runtime destroyed"));
    stopRenderLoop("destroy");
    viewportPanSession = null;
    if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
    resizeRafId = null;
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;
    if (windowResizeHandler) window.removeEventListener("resize", windowResizeHandler);
    windowResizeHandler = null;
    if (orbitControls) {
      orbitControls.removeEventListener("change", requestRender);
      if (typeof orbitControls.dispose === "function") orbitControls.dispose();
    }
    if (selectionHelper) {
      scene.remove(selectionHelper);
      if (selectionHelper.geometry) selectionHelper.geometry.dispose();
      if (selectionHelper.material) selectionHelper.material.dispose();
      selectionHelper = null;
    }
    clearTerrainRuntimeVisuals();
    clearWalkabilityIndex();
    if (transformGuide) {
      scene.remove(transformGuide);
      disposeObject(transformGuide);
      transformGuide = null;
    }
    if (terrainEditorOverlay) {
      scene.remove(terrainEditorOverlay);
      clearTerrainEditorOverlay();
      terrainEditorOverlay = null;
    }
    if (scatterEditorOverlay) {
      scene.remove(scatterEditorOverlay);
      clearScatterEditorOverlay();
      scatterEditorOverlay = null;
    }
    if (chunkDebugOverlay) {
      scene.remove(chunkDebugOverlay);
      clearChunkDebugOverlay();
      chunkDebugOverlay = null;
    }
    if (editorPointerDownCaptureHandler) canvas.removeEventListener("pointerdown", editorPointerDownCaptureHandler, true);
    if (editorPointerUpCaptureHandler) {
      canvas.removeEventListener("pointerup", editorPointerUpCaptureHandler, true);
      canvas.removeEventListener("pointercancel", editorPointerUpCaptureHandler, true);
    }
    if (editorDirectPointerMoveHandler) {
      canvas.removeEventListener("pointermove", editorDirectPointerMoveHandler, true);
      window.removeEventListener("pointermove", editorDirectPointerMoveHandler, true);
    }
    if (editorDirectPointerUpHandler) {
      canvas.removeEventListener("pointerup", editorDirectPointerUpHandler, true);
      canvas.removeEventListener("pointercancel", editorDirectPointerUpHandler, true);
      window.removeEventListener("pointerup", editorDirectPointerUpHandler, true);
      window.removeEventListener("pointercancel", editorDirectPointerUpHandler, true);
    }
    if (editorDirectMouseMoveHandler) {
      canvas.removeEventListener("mousemove", editorDirectMouseMoveHandler, true);
      window.removeEventListener("mousemove", editorDirectMouseMoveHandler, true);
    }
    if (editorDirectMouseUpHandler) {
      canvas.removeEventListener("mouseup", editorDirectMouseUpHandler, true);
      window.removeEventListener("mouseup", editorDirectMouseUpHandler, true);
    }
    if (editorContextMenuHandler) canvas.removeEventListener("contextmenu", editorContextMenuHandler);
    if (editorAuxClickHandler) canvas.removeEventListener("auxclick", editorAuxClickHandler);
    if (editorKeyDownHandler) window.removeEventListener("keydown", editorKeyDownHandler);
    if (editorKeyUpHandler) window.removeEventListener("keyup", editorKeyUpHandler);
    if (editorWindowBlurHandler) window.removeEventListener("blur", editorWindowBlurHandler);
    flyCameraKeys.clear();
    if (editorPointerDownHandler) canvas.removeEventListener("pointerdown", editorPointerDownHandler);
    if (gamePointerDownHandler) canvas.removeEventListener("pointerdown", gamePointerDownHandler);
    if (gameKeyDownHandler) window.removeEventListener("keydown", gameKeyDownHandler);
    if (gameKeyUpHandler) window.removeEventListener("keyup", gameKeyUpHandler);
    if (gameWheelHandler) canvas.removeEventListener("wheel", gameWheelHandler);
    clearRemotePlayers();
    clearHudModules();
    restoreConsoleWarnGate();
    DEBUG_RUNTIME.activeResizeHandlers = 0;
  }

  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(function () {
      scheduleResize("observer");
    });
    resizeObserver.observe(resizeTarget);
    DEBUG_RUNTIME.activeResizeHandlers = 1;
  } else {
    windowResizeHandler = function () {
      scheduleResize("window");
    };
    window.addEventListener("resize", windowResizeHandler);
    DEBUG_RUNTIME.activeResizeHandlers = 1;
  }
  scheduleResize("init");
  requestRender("init");
  removeGhostChunkPlanes("runtime-init", {
    scene: scene,
    camera: camera,
    content: content,
    terrainRuntimeGroup: terrainRuntimeGroup,
    chunkDebugOverlay: chunkDebugOverlay,
    selectionHelper: selectionHelper,
    transformGuide: transformGuide,
    terrainEditorOverlay: terrainEditorOverlay,
    scatterEditorOverlay: scatterEditorOverlay,
    world: world,
    debugOverlayVisible: Boolean(activeModePerformance().debugChunkOverlayVisible === true && resolveChunkPolicy(world, mode)?.debugOverlay === true)
  });

  function focusSelected() {
    return frameEntity(selectedEntityId);
  }

  function deselect() {
    clearSelectedRuntimeEntity();
    requestRender();
  }

  function setLocalView(enabled) {
    localViewActive = Boolean(enabled);
    applyLocalView();
    updateSelectionHelper();
    requestRender();
    return localViewActive;
  }

  function toggleLocalView() {
    return setLocalView(!localViewActive);
  }

  function isLocalViewActive() {
    return localViewActive;
  }

  function isTransformActive() {
    return Boolean(transformSession?.object);
  }

  function isTransformControlsAttached() {
    return Boolean(selectedRoot);
  }

  function getTransformDebugState() {
    return Object.assign({}, transformDebugState);
  }

  function summarizeSamples(samples) {
    const values = Array.isArray(samples)
      ? samples.filter(function (value) { return Number.isFinite(value); }).slice()
      : [];
    if (!values.length) {
      return { avg: 0, p95: 0 };
    }
    values.sort(function (left, right) { return left - right; });
    const total = values.reduce(function (sum, value) { return sum + value; }, 0);
    const p95Index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * 0.95) - 1));
    return {
      avg: round(total / values.length),
      p95: round(values[p95Index])
    };
  }

  async function profilePerformance(options = {}) {
    if (mode !== "game") {
      throw new Error("profilePerformance is only available in game mode");
    }
    const frames = Math.max(1, Math.floor(num(options.frames, 300)));
    const warmupFrames = Math.max(0, Math.floor(num(options.warmupFrames, 60)));
    const label = String(options.label || "performance").trim() || "performance";
    const timeoutMs = Math.max(1000, Math.floor(num(options.timeoutMs, Math.max(30000, (frames + warmupFrames) * 100))));
    requestRender("profile-performance");
    const samples = {
      frameMs: [],
      renderMs: [],
      syncChunkMs: [],
      updatePlayerMs: [],
      animationMs: [],
      hudMs: []
    };
    const totalFrames = warmupFrames + frames;
    for (let index = 0; index < totalFrames; index += 1) {
      const frameTiming = await waitForNextFrameTiming(timeoutMs);
      if (index < warmupFrames) continue;
      samples.frameMs.push(Number(frameTiming?.frameMs) || 0);
      samples.renderMs.push(Number(frameTiming?.renderMs) || 0);
      samples.syncChunkMs.push(Number(frameTiming?.syncChunkMs ?? frameTiming?.syncChunkDebugStateMs) || 0);
      samples.updatePlayerMs.push(Number(frameTiming?.updatePlayerMs) || 0);
      samples.animationMs.push(Number(frameTiming?.animationMs ?? frameTiming?.updateAnimationMs) || 0);
      samples.hudMs.push(Number(frameTiming?.hudMs ?? frameTiming?.updatePerformanceHudMs) || 0);
    }
    const snapshot = buildPerformanceSnapshot();
    const currentShadowPolicyState = currentShadowPolicy();
    const contextAttributes = renderer.getContext?.()?.getContextAttributes?.() || null;
    const chunkPolicy = resolveChunkPolicy(world, mode);
    const frameStats = summarizeSamples(samples.frameMs);
    const renderStats = summarizeSamples(samples.renderMs);
    const syncStats = summarizeSamples(samples.syncChunkMs);
    const playerStats = summarizeSamples(samples.updatePlayerMs);
    const animationStats = summarizeSamples(samples.animationMs);
    const hudStats = summarizeSamples(samples.hudMs);
    return {
      label: label,
      mode: "game",
      renderer: {
        api: rendererLabel,
        name: rendererProfile.name,
        vendor: rendererProfile.vendor,
        software: rendererProfile.software
      },
      averages: {
        frameMs: frameStats.avg,
        renderMs: renderStats.avg,
        syncChunkMs: syncStats.avg,
        updatePlayerMs: playerStats.avg,
        animationMs: animationStats.avg,
        hudMs: hudStats.avg
      },
      p95: {
        frameMs: frameStats.p95,
        renderMs: renderStats.p95,
        syncChunkMs: syncStats.p95,
        updatePlayerMs: playerStats.p95,
        animationMs: animationStats.p95,
        hudMs: hudStats.p95
      },
      counts: {
        drawCalls: snapshot.drawCalls,
        triangles: snapshot.triangles,
        geometries: snapshot.geometries,
        textures: snapshot.textures,
        sceneObjects: snapshot.sceneObjects,
        runtimeObjects: snapshot.runtimeObjects,
        meshes: snapshot.meshes,
        remotePlayers: snapshot.remotePlayers || 0,
        terrainResident: snapshot.terrainResident,
        groundTilesResident: groundChunkState.stats.groundTilesResident || 0,
        hiddenObjects: snapshot.hiddenObjects,
        loadedChunks: snapshot.loadedChunks
      },
      gameLoopTimings: Object.assign({}, snapshot.gameLoopTimings || {}),
      settings: {
        pixelRatio: renderer.getPixelRatio ? renderer.getPixelRatio() : activeModePerformance().pixelRatioCap,
        shadowsEnabled: currentShadowPolicyState.enabled === true,
        shadowQuality: currentShadowPolicyState.quality || "off",
        antialias: contextAttributes?.antialias === true,
        performanceHudEnabled: hudNodes.performance.size > 0,
        chunkDebugOverlay: Boolean(chunkDebugStateCache?.debugOverlay),
        chunkLoadingEnabled: Boolean(chunkPolicy?.enabled === true),
        groundChunkingEnabled: Boolean(chunkPolicy?.groundChunkingEnabled !== false)
      }
    };
  }

  return {
    setWorld: setWorld,
    render: requestRender,
    destroy: destroy,
    dispose: destroy,
    screenToGround: screenToGround,
    worldToScreen: worldToScreen,
    getPlayerState: getPlayerState,
    getCameraGroundBasis: getCameraGroundBasis,
    resolvePlayerMovementIntent: resolvePlayerMovementIntent,
    setPlayerAnimationState: setPlayerAnimationState,
    setLocalPlayerDisplayName: setLocalPlayerDisplayName,
    upsertRemotePlayer: upsertRemotePlayer,
    removeRemotePlayer: removeRemotePlayer,
    setRemotePlayerVisualState: setRemotePlayerVisualState,
    setRemotePlayerState: setRemotePlayerState,
    clearRemotePlayers: clearRemotePlayers,
    getRemotePlayerDebugState: getRemotePlayerDebugState,
    debugState: debugState,
    debugCollisionAt: debugCollisionAt,
    debugTeleportPlayer: debugTeleportPlayer,
    debugStepPlayerTo: debugStepPlayerTo,
    setPlayerState: setPlayerState,
    setTerrainEditorOverlay: setTerrainEditorOverlay,
    clearTerrainEditorOverlay: clearTerrainEditorOverlay,
    setScatterEditorOverlay: setScatterEditorOverlay,
    clearScatterEditorOverlay: clearScatterEditorOverlay,
    setTerrainSurfacePreview: setTerrainSurfacePreview,
    pickTerrainEditorHandle: pickTerrainEditorHandle,
    pickScatterEditorHandle: pickScatterEditorHandle,
    pickEntityAt: pickEntityAt,
    selectEntity: selectEntity,
    frameEntity: frameEntity,
    frameAll: frameAll,
    captureViewState: captureViewState,
    restoreViewState: restoreViewState,
    configureCallbacks: configureCallbacks,
    beginTransform: beginTransform,
    previewTransformAt: previewTransformAt,
    setGizmoMode: setGizmoMode,
    setTransformAxis: setTransformAxis,
    setTransformAxisConstraint: setTransformAxisConstraint,
    setSnapState: setSnapState,
    setAnimationPreviewEnabled: setAnimationPreviewEnabled,
    isAnimationPreviewEnabled: isAnimationPreviewEnabled,
    isPointerOverTransformControls: isPointerOverTransformControls,
    beginKeyboardTransform: beginKeyboardTransform,
    setView: setView,
    setLocalView: setLocalView,
    toggleLocalView: toggleLocalView,
    isLocalViewActive: isLocalViewActive,
    focusSelected: focusSelected,
    focusGroundPoint: focusGroundPoint,
    frameWorldPoints: frameWorldPoints,
    cancelTransform: cancelTransform,
    confirmTransform: confirmTransform,
    cancelTransformSession: cancelTransform,
    confirmTransformSession: confirmTransform,
    isTransformActive: isTransformActive,
    isTransformControlsAttached: isTransformControlsAttached,
    getTransformDebugState: getTransformDebugState,
    profilePerformance: profilePerformance,
    debugFindGhostPlanes: function () {
      return auditSceneObjectsForGhostPlanes({
        scene: scene,
        camera: camera,
        content: content,
        terrainRuntimeGroup: terrainRuntimeGroup,
        chunkDebugOverlay: chunkDebugOverlay,
        selectionHelper: selectionHelper,
        transformGuide: transformGuide,
        terrainEditorOverlay: terrainEditorOverlay,
        scatterEditorOverlay: scatterEditorOverlay,
        world: world,
        debugOverlayVisible: Boolean(activeModePerformance().debugChunkOverlayVisible === true && resolveChunkPolicy(world, mode)?.debugOverlay === true)
      });
    },
    debugRemoveGhostPlanes: function (reason = "debug-command") {
      return removeGhostChunkPlanes(reason, {
        scene: scene,
        camera: camera,
        content: content,
        terrainRuntimeGroup: terrainRuntimeGroup,
        chunkDebugOverlay: chunkDebugOverlay,
        selectionHelper: selectionHelper,
        transformGuide: transformGuide,
        terrainEditorOverlay: terrainEditorOverlay,
        scatterEditorOverlay: scatterEditorOverlay,
        world: world,
        debugOverlayVisible: Boolean(activeModePerformance().debugChunkOverlayVisible === true && resolveChunkPolicy(world, mode)?.debugOverlay === true)
      });
    },
    debugAuditSceneAroundPoint: function (x = 0, z = 0, radius = 60) {
      const centerX = num(x, 0);
      const centerZ = num(z, 0);
      const maxDistance = Math.max(1, num(radius, 60));
      const worldPosition = new THREE.Vector3();
      const boundingBox = new THREE.Box3();
      const hits = [];
      scene.updateMatrixWorld(true);
      scene.traverse(function (object) {
        if (!object || (!object.isMesh && !object.isInstancedMesh && !object.isSprite)) return;
        object.getWorldPosition(worldPosition);
        let boxSummary = null;
        let insideByBox = false;
        try {
          boundingBox.setFromObject(object);
          if (!boundingBox.isEmpty()) {
            insideByBox = boundingBox.max.x >= centerX - maxDistance
              && boundingBox.min.x <= centerX + maxDistance
              && boundingBox.max.z >= centerZ - maxDistance
              && boundingBox.min.z <= centerZ + maxDistance;
            boxSummary = {
              minX: round(boundingBox.min.x),
              maxX: round(boundingBox.max.x),
              minZ: round(boundingBox.min.z),
              maxZ: round(boundingBox.max.z)
            };
          }
        } catch {}
        if (!insideByBox) return;
        let visibleInScene = object.visible === true;
        const parentChain = [];
        let walker = object.parent;
        while (walker) {
          if (walker.visible === false) visibleInScene = false;
          parentChain.push(walker.name || walker.type);
          walker = walker.parent;
        }
        hits.push({
          name: object.name || null,
          type: object.type,
          visible: object.visible === true,
          visibleInScene: visibleInScene,
          x: round(worldPosition.x),
          y: round(worldPosition.y),
          z: round(worldPosition.z),
          box: boxSummary,
          parentChain: parentChain.slice(0, 6).join(" < "),
          geometryType: object.geometry?.type || null,
          instanceCount: object.isInstancedMesh ? object.count : null,
          userDataKeys: Object.keys(object.userData || {}).slice(0, 10)
        });
      });
      return {
        center: { x: centerX, z: centerZ },
        radius: maxDistance,
        count: hits.length,
        hits: hits.slice(0, 250)
      };
    },
    getSelectedEntitySnapshot: getSelectedEntitySnapshot,
    getSelectedEntityId: function () { return selectedEntityId; },
    deselect: deselect,
    getLoadErrors: function () { return loadErrors.slice(); },
    bakeMinimapImage: bakeMinimapImage,
    getMinimapMarkerSnapshot: getMinimapMarkerSnapshot
  };
}
