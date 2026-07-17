import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { resolveDatabasePath } from "../src/server/db.js";
import {
  buildChunkWindow,
  computeStreamingCoverage,
  chunkCoordForPosition,
  chunkKeyForPosition,
  chunkSizeForPolicy,
  effectiveGroundBounds,
  groundChunkTilesForBounds,
  resolveChunkPolicy,
  segmentPolylineForChunks
} from "../apps/web/public/shared/world-runtime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const KIND_ORDER = new Map([
  ["ground", 0],
  ["terrain-layer", 1],
  ["surface", 2],
  ["model-entity", 3],
  ["scatter-instance", 4],
  ["interactable", 5]
]);

function parseArgs(argv) {
  const options = {
    state: "published",
    mode: "game",
    top: 20,
    items: 8,
    json: false,
    chunk: null,
    center: null,
    centerChunk: null,
    player: null,
    camTarget: null,
    lastPlayer: null,
    lastCameraTarget: null,
    allChunks: false
  };

  function parseChunkValue(value) {
    const text = String(value || "").trim();
    return /^\-?\d+,\-?\d+$/.test(text) ? text : null;
  }

  function parsePointValue(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
    if (!match) return null;
    const x = Number(match[1]);
    const z = Number(match[2]);
    return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || "").trim();
    if (!arg) continue;
    if (arg === "--draft") {
      options.state = "draft";
      continue;
    }
    if (arg === "--published") {
      options.state = "published";
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--game") {
      options.mode = "game";
      continue;
    }
    if (arg === "--editor") {
      options.mode = "editor";
      continue;
    }
    if (arg === "--chunk" && argv[index + 1]) {
      options.chunk = parseChunkValue(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--chunk=")) {
      options.chunk = parseChunkValue(arg.slice("--chunk=".length));
      continue;
    }
    if (arg === "--center" && argv[index + 1]) {
      options.center = parsePointValue(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--center=")) {
      options.center = parsePointValue(arg.slice("--center=".length));
      continue;
    }
    if (arg === "--center-chunk" && argv[index + 1]) {
      options.centerChunk = parseChunkValue(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--center-chunk=")) {
      options.centerChunk = parseChunkValue(arg.slice("--center-chunk=".length));
      continue;
    }
    if (arg === "--player" && argv[index + 1]) {
      options.player = parsePointValue(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--player=")) {
      options.player = parsePointValue(arg.slice("--player=".length));
      continue;
    }
    if (arg === "--cam-target" && argv[index + 1]) {
      options.camTarget = parsePointValue(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--cam-target=")) {
      options.camTarget = parsePointValue(arg.slice("--cam-target=".length));
      continue;
    }
    if (arg === "--camera-target" && argv[index + 1]) {
      options.camTarget = parsePointValue(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--camera-target=")) {
      options.camTarget = parsePointValue(arg.slice("--camera-target=".length));
      continue;
    }
    if (arg === "--last-player" && argv[index + 1]) {
      options.lastPlayer = parsePointValue(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--last-player=")) {
      options.lastPlayer = parsePointValue(arg.slice("--last-player=".length));
      continue;
    }
    if (arg === "--last-camera-target" && argv[index + 1]) {
      options.lastCameraTarget = parsePointValue(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--last-camera-target=")) {
      options.lastCameraTarget = parsePointValue(arg.slice("--last-camera-target=".length));
      continue;
    }
    if (arg === "--top" && argv[index + 1]) {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value >= 0) options.top = Math.floor(value);
      index += 1;
      continue;
    }
    if (arg.startsWith("--top=")) {
      const value = Number(arg.slice("--top=".length));
      if (Number.isFinite(value) && value >= 0) options.top = Math.floor(value);
      continue;
    }
    if (arg === "--items" && argv[index + 1]) {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value >= 0) options.items = Math.floor(value);
      index += 1;
      continue;
    }
    if (arg.startsWith("--items=")) {
      const value = Number(arg.slice("--items=".length));
      if (Number.isFinite(value) && value >= 0) options.items = Math.floor(value);
      continue;
    }
    if (arg === "--state" && argv[index + 1]) {
      const value = String(argv[index + 1] || "").trim().toLowerCase();
      if (value === "draft" || value === "published") options.state = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--state=")) {
      const value = String(arg.slice("--state=".length)).trim().toLowerCase();
      if (value === "draft" || value === "published") options.state = value;
      continue;
    }
    if (arg === "--mode" && argv[index + 1]) {
      const value = String(argv[index + 1] || "").trim().toLowerCase();
      if (value === "game" || value === "editor") options.mode = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--mode=")) {
      const value = String(arg.slice("--mode=".length)).trim().toLowerCase();
      if (value === "game" || value === "editor") options.mode = value;
      continue;
    }
    if (arg === "--all-chunks") {
      options.allChunks = true;
      continue;
    }
  }

  return options;
}

function loadWorldState(db, preferredState) {
  const order = preferredState === "draft"
    ? ["draft", "published"]
    : ["published", "draft"];

  for (const state of order) {
    const table = state === "draft" ? "draft_world_state" : "published_world_state";
    const timestampColumn = state === "draft" ? "updated_at" : "published_at";
    const row = db.prepare(`SELECT world_json, ${timestampColumn} AS timestamp FROM ${table} WHERE id = 1`).get();
    if (!row) continue;
    let world = null;
    try {
      world = JSON.parse(row.world_json);
    } catch (error) {
      throw new Error(`Kan ${state} world_json niet parsen: ${error.message}`);
    }
    return {
      state,
      timestamp: row.timestamp || null,
      world
    };
  }

  return null;
}

function loadEditorNodes(db) {
  return db.prepare("SELECT id, type, title, values_json FROM editor_nodes").all().map(function (row) {
    let values = {};
    try {
      values = JSON.parse(row.values_json);
    } catch {
      values = {};
    }
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      values: values
    };
  });
}

function loadLatestPlayerPosition(db, worldId = null) {
  const query = worldId
    ? `SELECT pp.player_id, pp.world_id, pp.x, pp.y, pp.z, pp.rotation_y, pp.revision, pp.updated_at, prof.display_name
       FROM player_positions pp
       LEFT JOIN player_profiles prof ON prof.id = pp.player_id
       WHERE pp.world_id = ?
       ORDER BY pp.updated_at DESC
       LIMIT 1`
    : `SELECT pp.player_id, pp.world_id, pp.x, pp.y, pp.z, pp.rotation_y, pp.revision, pp.updated_at, prof.display_name
       FROM player_positions pp
       LEFT JOIN player_profiles prof ON prof.id = pp.player_id
       ORDER BY pp.updated_at DESC
       LIMIT 1`;
  const row = worldId ? db.prepare(query).get(worldId) : db.prepare(query).get();
  if (!row) return null;
  return {
    playerId: row.player_id || null,
    displayName: row.display_name || null,
    worldId: row.world_id || null,
    x: Number(row.x),
    y: Number(row.y),
    z: Number(row.z),
    rotationY: Number(row.rotation_y),
    revision: Number(row.revision),
    updatedAt: row.updated_at || null
  };
}

function buildNodeIndexes(nodes) {
  const byId = new Map();
  const byValueKey = new Map();
  const duplicateWarnings = [];
  const indexedKeys = [
    "groundId",
    "layerId",
    "surfaceId",
    "entityId",
    "interactableId",
    "scatterId",
    "spawnId",
    "playerId",
    "cameraId",
    "lightId",
    "bindingId",
    "hudId",
    "minimapId",
    "blockerId",
    "worldId"
  ];

  function bucketFor(key) {
    let bucket = byValueKey.get(key);
    if (!bucket) {
      bucket = new Map();
      byValueKey.set(key, bucket);
    }
    return bucket;
  }

  for (const node of nodes) {
    byId.set(node.id, node);
    for (const key of indexedKeys) {
      const rawValue = node?.values?.[key];
      const value = String(rawValue || "").trim();
      if (!value) continue;
      const bucket = bucketFor(key);
      const list = bucket.get(value) || [];
      list.push(node);
      bucket.set(value, list);
    }
  }

  for (const [key, bucket] of byValueKey.entries()) {
    for (const [value, list] of bucket.entries()) {
      if (list.length > 1) {
        duplicateWarnings.push(`${key}=${value} komt ${list.length} keer voor.`);
      }
    }
  }

  return {
    byId,
    byValueKey,
    duplicateWarnings
  };
}

function firstNodeForValue(indexes, key, value) {
  const bucket = indexes.byValueKey.get(key);
  if (!bucket) return null;
  const list = bucket.get(String(value || "").trim()) || [];
  return list[0] || null;
}

function nodeValueId(node, fallbackKey) {
  const values = node?.values || {};
  const candidates = [
    values.label,
    values.entityId,
    values.scatterId,
    values.surfaceId,
    values.layerId,
    values.groundId,
    values.interactableId,
    values.spawnId,
    values.playerId,
    values.cameraId,
    values.lightId,
    values.bindingId,
    values.hudId,
    values.minimapId,
    values.blockerId,
    values.worldId
  ];
  if (fallbackKey && values[fallbackKey] !== undefined && values[fallbackKey] !== null) {
    candidates.unshift(values[fallbackKey]);
  }
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value) return value;
  }
  return null;
}

function formatNodeRef(node, fallbackKey = null) {
  if (!node) return "(unknown node)";
  const identity = nodeValueId(node, fallbackKey);
  const title = String(node.title || node.type || node.id || "node").trim();
  if (identity && identity !== title) {
    return `${title} / ${identity} (${node.id})`;
  }
  return `${title} (${node.id})`;
}

function itemSourceKey(item) {
  return `${item.sourceNodeId || "unknown"}|${item.sourceRef || "unknown"}|${item.kind || "unknown"}`;
}

function kindLabel(kind) {
  return String(kind || "unknown");
}

function compareItems(left, right) {
  const leftOrder = KIND_ORDER.get(left.kind) ?? 99;
  const rightOrder = KIND_ORDER.get(right.kind) ?? 99;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  const leftSource = String(left.sourceRef || left.sourceNodeId || "").toLowerCase();
  const rightSource = String(right.sourceRef || right.sourceNodeId || "").toLowerCase();
  if (leftSource !== rightSource) return leftSource.localeCompare(rightSource);
  const leftChunk = String(left.chunkKey || "");
  const rightChunk = String(right.chunkKey || "");
  if (leftChunk !== rightChunk) return leftChunk.localeCompare(rightChunk);
  return String(left.id || "").localeCompare(String(right.id || ""));
}

function pointInPolygon(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  const x = Number(point?.x);
  const z = Number(point?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prior = polygon[previous];
    const currentX = Number(current?.x);
    const currentZ = Number(current?.z);
    const priorX = Number(prior?.x);
    const priorZ = Number(prior?.z);
    if (![currentX, currentZ, priorX, priorZ].every(Number.isFinite)) continue;
    const intersects = ((currentZ > z) !== (priorZ > z))
      && (x < ((priorX - currentX) * (z - currentZ)) / ((priorZ - currentZ) || 0.000001) + currentX);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInRect(point, bounds) {
  const x = Number(point?.x);
  const z = Number(point?.z);
  return Number.isFinite(x)
    && Number.isFinite(z)
    && Number.isFinite(Number(bounds?.minX))
    && Number.isFinite(Number(bounds?.maxX))
    && Number.isFinite(Number(bounds?.minZ))
    && Number.isFinite(Number(bounds?.maxZ))
    && x >= Number(bounds.minX)
    && x <= Number(bounds.maxX)
    && z >= Number(bounds.minZ)
    && z <= Number(bounds.maxZ);
}

function segmentOrientation(ax, az, bx, bz, cx, cz) {
  const value = (bz - az) * (cx - bx) - (bx - ax) * (cz - bz);
  if (Math.abs(value) < 0.000001) return 0;
  return value > 0 ? 1 : 2;
}

function pointOnSegment(ax, az, bx, bz, cx, cz) {
  return Math.min(ax, bx) - 0.000001 <= cx && cx <= Math.max(ax, bx) + 0.000001
    && Math.min(az, bz) - 0.000001 <= cz && cz <= Math.max(az, bz) + 0.000001
    && Math.abs(((bx - ax) * (cz - az)) - ((bz - az) * (cx - ax))) < 0.000001;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = segmentOrientation(a.x, a.z, b.x, b.z, c.x, c.z);
  const o2 = segmentOrientation(a.x, a.z, b.x, b.z, d.x, d.z);
  const o3 = segmentOrientation(c.x, c.z, d.x, d.z, a.x, a.z);
  const o4 = segmentOrientation(c.x, c.z, d.x, d.z, b.x, b.z);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && pointOnSegment(a.x, a.z, b.x, b.z, c.x, c.z)) return true;
  if (o2 === 0 && pointOnSegment(a.x, a.z, b.x, b.z, d.x, d.z)) return true;
  if (o3 === 0 && pointOnSegment(c.x, c.z, d.x, d.z, a.x, a.z)) return true;
  if (o4 === 0 && pointOnSegment(c.x, c.z, d.x, d.z, b.x, b.z)) return true;
  return false;
}

function rectIntersectsPolygon(bounds, points) {
  const polygon = Array.isArray(points) ? points.filter(function (point) {
    return Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.z));
  }) : [];
  if (polygon.length < 3) return false;
  const corners = [
    { x: Number(bounds.minX), z: Number(bounds.minZ) },
    { x: Number(bounds.maxX), z: Number(bounds.minZ) },
    { x: Number(bounds.maxX), z: Number(bounds.maxZ) },
    { x: Number(bounds.minX), z: Number(bounds.maxZ) }
  ];
  if (polygon.some(function (point) { return pointInRect(point, bounds); })) return true;
  if (corners.some(function (corner) { return pointInPolygon(corner, polygon); })) return true;
  const rectEdges = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]]
  ];
  for (let index = 0; index < polygon.length; index += 1) {
    const next = polygon[(index + 1) % polygon.length];
    const current = polygon[index];
    for (const [start, end] of rectEdges) {
      if (segmentsIntersect(current, next, start, end)) return true;
    }
  }
  return false;
}

function chunkBucket(buckets, chunkKey) {
  const key = String(chunkKey || "").trim();
  if (!key) return null;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = {
      chunkKey: key,
      items: [],
      sourceCounts: new Map(),
      kindCounts: new Map()
    };
    buckets.set(key, bucket);
  }
  return bucket;
}

function addToChunkBuckets(buckets, item, chunkKeys) {
  const keys = Array.from(new Set((Array.isArray(chunkKeys) ? chunkKeys : [chunkKeys]).map(function (value) {
    return String(value || "").trim();
  }).filter(Boolean)));
  for (const key of keys) {
    const bucket = chunkBucket(buckets, key);
    if (!bucket) continue;
    bucket.items.push(item);
    bucket.kindCounts.set(item.kind, (bucket.kindCounts.get(item.kind) || 0) + 1);
    bucket.sourceCounts.set(item.sourceKey, (bucket.sourceCounts.get(item.sourceKey) || 0) + 1);
  }
}

function nodeRefForEntity(indexes, entity, fallbackKey = "entityId") {
  const node = entity?.nodeId ? indexes.byId.get(entity.nodeId) || null : null;
  if (node) return node;
  const valueKey = entity?.type === "scatter" ? "scatterId" : fallbackKey;
  const identifier = entity?.[valueKey] || entity?.id || null;
  if (!identifier) return null;
  const first = firstNodeForValue(indexes, valueKey, identifier);
  return first || null;
}

function nodeRefForTerrainLayer(indexes, layer, valueKey) {
  const identifier = layer?.id || null;
  if (!identifier) return null;
  return firstNodeForValue(indexes, valueKey, identifier);
}

function parseChunkCoordKey(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(-?\d+),(-?\d+)$/);
  if (!match) return null;
  const x = Number(match[1]);
  const z = Number(match[2]);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

function chunkKeyDistance(key, centerChunk) {
  const coord = parseChunkCoordKey(key);
  if (!coord || !centerChunk) return Number.POSITIVE_INFINITY;
  return Math.hypot(coord.x - centerChunk.x, coord.z - centerChunk.z);
}

function windowStateForChunkKey(chunkKey, window) {
  if (!window || !chunkKey) return "outside";
  const key = String(chunkKey || "").trim();
  if (!key) return "outside";
  if (Array.isArray(window.activeChunkKeys) && window.activeChunkKeys.includes(key)) return "active";
  if (Array.isArray(window.preloadChunkKeys) && window.preloadChunkKeys.includes(key)) return "preload";
  if (Array.isArray(window.loadedChunkKeys) && window.loadedChunkKeys.includes(key)) return "loaded";
  return "outside";
}

function runtimeStateForChunkKey(chunkKey, coverage) {
  if (!coverage || !chunkKey) return "outside";
  const key = String(chunkKey || "").trim();
  if (!key) return "outside";
  if (Array.isArray(coverage.activeChunkKeys) && coverage.activeChunkKeys.includes(key)) return "active";
  if (Array.isArray(coverage.visibleChunkKeys) && coverage.visibleChunkKeys.includes(key)) return "visible";
  if (Array.isArray(coverage.preloadChunkKeys) && coverage.preloadChunkKeys.includes(key)) return "preload";
  if (Array.isArray(coverage.desiredResidentChunkKeys) && coverage.desiredResidentChunkKeys.includes(key)) return "desired";
  if (Array.isArray(coverage.unloadSafeChunkKeys) && coverage.unloadSafeChunkKeys.includes(key)) return "unload-safe";
  return "outside";
}

function resolveInspectAnchor(world, policy, options, latestPlayerPosition) {
  if (options.center && Number.isFinite(options.center.x) && Number.isFinite(options.center.z)) {
    return {
      source: "cli-center",
      position: {
        x: Number(options.center.x),
        z: Number(options.center.z)
      },
      chunkCoord: chunkCoordForPosition(Number(options.center.x), Number(options.center.z), policy)
    };
  }
  if (options.centerChunk) {
    const chunkCoord = parseChunkCoordKey(options.centerChunk);
    if (chunkCoord) {
      return {
        source: "cli-center-chunk",
        position: null,
        chunkCoord: chunkCoord
      };
    }
  }
  if (latestPlayerPosition && Number.isFinite(latestPlayerPosition.x) && Number.isFinite(latestPlayerPosition.z)) {
    return {
      source: latestPlayerPosition.displayName
        ? `player-position:${latestPlayerPosition.displayName}`
        : "player-position",
      position: {
        x: latestPlayerPosition.x,
        z: latestPlayerPosition.z
      },
      chunkCoord: chunkCoordForPosition(latestPlayerPosition.x, latestPlayerPosition.z, policy),
      playerPosition: latestPlayerPosition
    };
  }
  if (world?.spawn && Number.isFinite(Number(world.spawn.x)) && Number.isFinite(Number(world.spawn.z))) {
    return {
      source: "spawn",
      position: {
        x: Number(world.spawn.x),
        z: Number(world.spawn.z)
      },
      chunkCoord: chunkCoordForPosition(Number(world.spawn.x), Number(world.spawn.z), policy)
    };
  }
  const bounds = effectiveGroundBounds(world?.ground || null);
  if (bounds) {
    const x = (bounds.minX + bounds.maxX) / 2;
    const z = (bounds.minZ + bounds.maxZ) / 2;
    return {
      source: "ground-center",
      position: { x, z },
      chunkCoord: chunkCoordForPosition(x, z, policy)
    };
  }
  return {
    source: "origin",
    position: { x: 0, z: 0 },
    chunkCoord: chunkCoordForPosition(0, 0, policy)
  };
}

function formatPointText(point) {
  if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.z))) return "n/a";
  return `x=${Number(point.x)} z=${Number(point.z)}`;
}

function buildRuntimeCoverageProbe(policy, options, viewAnchor) {
  const player = options.player || viewAnchor?.playerPosition || null;
  if (!player || !Number.isFinite(Number(player.x)) || !Number.isFinite(Number(player.z))) {
    return null;
  }
  const camTarget = options.camTarget || player;
  const lastPlayerPosition = options.lastPlayer || player;
  const lastCameraTarget = options.lastCameraTarget || camTarget;
  const coverage = computeStreamingCoverage({
    mode: options.mode,
    policy,
    player: {
      x: Number(player.x),
      z: Number(player.z)
    },
    camTarget: {
      x: Number(camTarget.x),
      z: Number(camTarget.z)
    },
    lastPlayerPosition: {
      x: Number(lastPlayerPosition.x),
      z: Number(lastPlayerPosition.z)
    },
    lastCameraTarget: {
      x: Number(lastCameraTarget.x),
      z: Number(lastCameraTarget.z)
    }
  });
  return {
    coverage,
    player: { x: Number(player.x), z: Number(player.z) },
    camTarget: { x: Number(camTarget.x), z: Number(camTarget.z) },
    lastPlayerPosition: { x: Number(lastPlayerPosition.x), z: Number(lastPlayerPosition.z) },
    lastCameraTarget: { x: Number(lastCameraTarget.x), z: Number(lastCameraTarget.z) },
    camTargetAssumed: options.camTarget ? false : true
  };
}

function formatChunkKeyList(keys, limit = 12) {
  const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
  const preview = list.slice(0, limit).join(", ");
  return `${preview}${list.length > limit ? " ..." : ""}`;
}

function buildInspectData(world, indexes, policy, options) {
  const chunkBuckets = new Map();
  const items = [];
  const groundBounds = effectiveGroundBounds(world.ground);
  const groundTiles = groundChunkTilesForBounds(world.ground, policy);
  const terrainLayers = Array.isArray(world?.terrain?.layers) ? world.terrain.layers : [];
  const terrainSurfaces = Array.isArray(world?.terrain?.surfaces) ? world.terrain.surfaces : [];
  const entities = Array.isArray(world?.entities) ? world.entities : [];
  const interactables = Array.isArray(world?.interactables) ? world.interactables : [];
  const scatterAreas = Array.isArray(world?.scatterAreas) ? world.scatterAreas : [];
  const viewAnchor = options.viewAnchor || null;
  const viewWindow = viewAnchor?.chunkCoord ? buildChunkWindow(viewAnchor.chunkCoord, policy, options.mode) : null;
  const loadedChunkSet = new Set(Array.isArray(viewWindow?.loadedChunkKeys) ? viewWindow.loadedChunkKeys : []);
  const runtimeCoverageProbe = buildRuntimeCoverageProbe(policy, options, viewAnchor);

  const sourceStats = new Map();

  function recordSource(sourceKey, item) {
    const bucket = sourceStats.get(sourceKey) || {
      sourceKey: sourceKey,
      sourceRef: item.sourceRef,
      sourceNodeId: item.sourceNodeId,
      kindCounts: new Map(),
      chunkKeys: new Set(),
      total: 0
    };
    bucket.total += 1;
    bucket.kindCounts.set(item.kind, (bucket.kindCounts.get(item.kind) || 0) + 1);
    for (const key of item.chunkKeys) bucket.chunkKeys.add(key);
    sourceStats.set(sourceKey, bucket);
  }

  function pushItem(item) {
    const normalized = Object.assign({
      id: null,
      kind: "unknown",
      sourceNodeId: null,
      sourceRef: null,
      chunkKey: null,
      chunkKeys: [],
      detail: {}
    }, item);
    normalized.sourceKey = itemSourceKey(normalized);
    items.push(normalized);
    addToChunkBuckets(chunkBuckets, normalized, normalized.chunkKeys.length ? normalized.chunkKeys : normalized.chunkKey);
    recordSource(normalized.sourceKey, normalized);
  }

  for (const tile of groundTiles) {
    const sourceNode = firstNodeForValue(indexes, "groundId", world?.ground?.id || null)
      || indexes.byId.get(world?.ground?.id || "") || null;
    pushItem({
      id: `ground::${tile.chunkKey}`,
      kind: "ground",
      sourceNodeId: sourceNode?.id || null,
      sourceRef: formatNodeRef(sourceNode || { id: world?.ground?.id || "ground", title: "Ground Surface", type: "ground_surface", values: { groundId: world?.ground?.id || "ground" } }, "groundId"),
      chunkKey: tile.chunkKey,
      chunkKeys: [tile.chunkKey],
      detail: {
        bounds: {
          minX: tile.minX,
          maxX: tile.maxX,
          minZ: tile.minZ,
          maxZ: tile.maxZ
        }
      }
    });
  }

  for (const layer of terrainLayers) {
    const sourceNode = nodeRefForTerrainLayer(indexes, layer, "layerId");
    const sourceRef = formatNodeRef(sourceNode || { id: layer.id || "terrain-layer", title: layer.label || "Terrain Layer", type: "terrain_layer", values: { layerId: layer.id || "terrain-layer", label: layer.label || "Terrain Layer" } }, "layerId");
    if (String(layer?.shapeType || "full").trim().toLowerCase() === "full") {
      for (const tile of groundTiles) {
        pushItem({
          id: `${layer.id || "terrain-layer"}::${tile.chunkKey}`,
          kind: "terrain-layer",
          sourceNodeId: sourceNode?.id || null,
          sourceRef,
          chunkKey: tile.chunkKey,
          chunkKeys: [tile.chunkKey],
          detail: {
            layerId: layer.id || null,
            shapeType: "full",
            bounds: {
              minX: tile.minX,
              maxX: tile.maxX,
              minZ: tile.minZ,
              maxZ: tile.maxZ
            }
          }
        });
      }
      continue;
    }
    if (!groundBounds || !Array.isArray(layer?.points) || layer.points.length < 3) continue;
    for (const tile of groundTiles) {
      const bounds = {
        minX: tile.minX,
        maxX: tile.maxX,
        minZ: tile.minZ,
        maxZ: tile.maxZ
      };
      if (!rectIntersectsPolygon(bounds, layer.points)) continue;
      pushItem({
        id: `${layer.id || "terrain-layer"}::${tile.chunkKey}`,
        kind: "terrain-layer",
        sourceNodeId: sourceNode?.id || null,
        sourceRef,
        chunkKey: tile.chunkKey,
        chunkKeys: [tile.chunkKey],
        detail: {
          layerId: layer.id || null,
          shapeType: "polygon",
          bounds: bounds
        }
      });
    }
  }

  for (const surface of terrainSurfaces) {
    const sourceNode = nodeRefForTerrainLayer(indexes, surface, "surfaceId");
    const sourceRef = formatNodeRef(sourceNode || { id: surface.id || "surface", title: surface.label || "Surface Layer", type: "surface_layer", values: { surfaceId: surface.id || "surface", label: surface.label || "Surface Layer" } }, "surfaceId");
    const pieces = segmentPolylineForChunks(surface.points || [], policy, {
      width: surface.width,
      segmentBaseId: surface.id || "surface"
    });
    for (const piece of pieces) {
      pushItem({
        id: piece.id,
        kind: "surface",
        sourceNodeId: sourceNode?.id || null,
        sourceRef,
        chunkKey: piece.chunkKey || null,
        chunkKeys: Array.isArray(piece.chunkKeys) && piece.chunkKeys.length ? piece.chunkKeys : (piece.chunkKey ? [piece.chunkKey] : []),
        detail: {
          surfaceId: surface.id || null,
          segmentId: piece.segmentId,
          startLength: piece.startLength,
          endLength: piece.endLength,
          length: piece.length,
          bounds: piece.bounds || null
        }
      });
    }
  }

  for (const entity of entities) {
    if (!entity?.transform?.position) continue;
    const x = Number(entity.transform.position.x);
    const z = Number(entity.transform.position.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const chunkKey = chunkKeyForPosition(x, z, policy);
    const sourceNode = nodeRefForEntity(indexes, entity, "entityId");
    const isScatter = entity.type === "scatter" || entity.kind === "scatter";
    const sourceRef = formatNodeRef(sourceNode || {
      id: entity.nodeId || entity.id || "entity",
      title: isScatter ? "Bounded Area Scatter" : "Model Entity",
      type: isScatter ? "bounded_area_scatter" : "model_entity",
      values: isScatter
        ? { scatterId: entity.nodeId || entity.id || "scatter" }
        : { entityId: entity.id || entity.nodeId || "entity", label: entity.label || entity.id || "Entity" }
    }, isScatter ? "scatterId" : "entityId");
    pushItem({
      id: entity.id || entity.nodeId || `${sourceRef}::entity`,
      kind: isScatter ? "scatter-instance" : "model-entity",
      sourceNodeId: sourceNode?.id || null,
      sourceRef,
      chunkKey,
      chunkKeys: chunkKey ? [chunkKey] : [],
      detail: {
        entityId: entity.id || null,
        nodeId: entity.nodeId || null,
        label: entity.label || null,
        position: {
          x,
          z
        }
      }
    });
  }

  for (const inter of interactables) {
    const x = Number(inter.position?.x);
    const z = Number(inter.position?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const chunkKey = chunkKeyForPosition(x, z, policy);
    const sourceNode = indexes.byId.get(inter.id) || firstNodeForValue(indexes, "interactableId", inter.id);
    const sourceRef = formatNodeRef(sourceNode || {
      id: inter.id || "interactable",
      title: "Interactable",
      type: "interactable",
      values: { interactableId: inter.id || "interactable", label: inter.prompt || "Interactable" }
    }, "interactableId");
    pushItem({
      id: inter.id || null,
      kind: "interactable",
      sourceNodeId: sourceNode?.id || null,
      sourceRef,
      chunkKey,
      chunkKeys: chunkKey ? [chunkKey] : [],
      detail: {
        label: inter.prompt || null,
        position: { x, z }
      }
    });
  }

  const scatterAreaSummaries = scatterAreas.map(function (area) {
    const sourceNode = indexes.byId.get(area.id) || firstNodeForValue(indexes, "scatterId", area.scatterId);
    const sourceRef = formatNodeRef(sourceNode || {
      id: area.id || "scatter",
      title: "Bounded Area Scatter",
      type: "bounded_area_scatter",
      values: { scatterId: area.scatterId || area.id || "scatter" }
    }, "scatterId");
    const instances = items.filter(function (item) {
      return item.kind === "scatter-instance" && item.sourceNodeId === (sourceNode?.id || area.id || null);
    });
    const chunkKeys = Array.from(new Set(instances.flatMap(function (item) {
      return item.chunkKeys;
    }))).sort();
    return {
      sourceNodeId: sourceNode?.id || area.id || null,
      sourceRef,
      scatterId: area.scatterId || null,
      enabled: area.enabled !== false,
      count: Number(area.count) || 0,
      boundaryBlocksPlayer: area.boundaryBlocksPlayer === true,
      areaCenterX: Number(area.areaCenterX),
      areaCenterZ: Number(area.areaCenterZ),
      areaWidth: Number(area.areaWidth),
      areaDepth: Number(area.areaDepth),
      chunkCount: chunkKeys.length,
      chunkKeys: chunkKeys.slice(0, 24),
      instanceCount: instances.length
    };
  });

  const chunks = Array.from(chunkBuckets.values()).map(function (bucket) {
    const itemsForChunk = bucket.items.slice().sort(compareItems);
    const windowState = windowStateForChunkKey(bucket.chunkKey, viewWindow);
    const runtimeState = runtimeStateForChunkKey(bucket.chunkKey, runtimeCoverageProbe?.coverage || null);
    const sourceSummary = Array.from(bucket.sourceCounts.entries()).map(function ([sourceKey, count]) {
      const sample = itemsForChunk.find(function (item) {
        return item.sourceKey === sourceKey;
      });
      return {
        sourceKey,
        sourceNodeId: sample?.sourceNodeId || null,
        sourceRef: sample?.sourceRef || sourceKey,
        count
      };
    }).sort(function (left, right) {
      if (right.count !== left.count) return right.count - left.count;
      return String(left.sourceRef || "").localeCompare(String(right.sourceRef || ""));
    });
    return {
      chunkKey: bucket.chunkKey,
      total: itemsForChunk.length,
      windowState: windowState,
      runtimeState: runtimeState,
      distanceToViewCenter: viewAnchor?.chunkCoord ? chunkKeyDistance(bucket.chunkKey, viewAnchor.chunkCoord) : null,
      kindCounts: Object.fromEntries(Array.from(bucket.kindCounts.entries()).sort(function ([left], [right]) {
        return String(left).localeCompare(String(right));
      })),
      sourceCounts: sourceSummary,
      items: itemsForChunk
    };
  });

  chunks.sort(function (left, right) {
    if (right.total !== left.total) return right.total - left.total;
    return String(left.chunkKey).localeCompare(String(right.chunkKey));
  });

  return {
    world,
    policy,
    groundBounds,
    groundTiles,
    viewAnchor,
    viewWindow,
    runtimeCoverageProbe,
    loadedChunkSet,
    items,
    chunks,
    scatterAreaSummaries
  };
}

function printChunkChunk(bucket, limit) {
  const windowLabel = bucket.windowState && bucket.windowState !== "outside" ? ` (${bucket.windowState})` : "";
  const runtimeLabel = bucket.runtimeState && bucket.runtimeState !== "outside" && bucket.runtimeState !== bucket.windowState
    ? ` [runtime ${bucket.runtimeState}]`
    : "";
  console.log(`Chunk ${bucket.chunkKey}${windowLabel}${runtimeLabel} [${bucket.total} items]`);
  const kindParts = Object.entries(bucket.kindCounts).map(function ([kind, count]) {
    return `${kind} ${count}`;
  });
  if (kindParts.length) console.log(`  kinds: ${kindParts.join(", ")}`);
  if (bucket.sourceCounts.length) {
    console.log("  sources:");
    for (const source of bucket.sourceCounts.slice(0, 8)) {
      console.log(`    - ${source.sourceRef} x${source.count}`);
    }
    if (bucket.sourceCounts.length > 8) {
      console.log(`    - ... ${bucket.sourceCounts.length - 8} more`);
    }
  }
  if (!limit) return;
  console.log("  items:");
  for (const item of bucket.items.slice(0, limit)) {
    const detailParts = [];
    if (item.detail?.position) {
      detailParts.push(`x=${Number(item.detail.position.x).toFixed(3)}`);
      detailParts.push(`z=${Number(item.detail.position.z).toFixed(3)}`);
    }
    if (item.detail?.bounds) {
      detailParts.push(`bounds=${JSON.stringify(item.detail.bounds)}`);
    }
    if (Array.isArray(item.chunkKeys) && item.chunkKeys.length > 1) {
      detailParts.push(`chunkKeys=${item.chunkKeys.join("|")}`);
    }
    if (item.detail?.segmentId !== undefined) {
      detailParts.push(`segment=${item.detail.segmentId}`);
    }
    if (item.detail?.label) {
      detailParts.push(`label=${JSON.stringify(item.detail.label)}`);
    }
    console.log(`    - ${kindLabel(item.kind)} ${item.sourceRef}${detailParts.length ? " " + detailParts.join(" ") : ""}`);
  }
  if (bucket.items.length > limit) {
    console.log(`    - ... ${bucket.items.length - limit} more`);
  }
}

function printTextReport(result, options) {
  const { world, policy, groundBounds, chunks, scatterAreaSummaries, viewAnchor, viewWindow, runtimeCoverageProbe } = result;
  const chunkSize = chunkSizeForPolicy(policy);
  const spawn = world?.spawn || null;
  const spawnChunk = spawn ? chunkKeyForPosition(spawn.x, spawn.z, policy) : null;
  const anchorPosition = viewAnchor?.position || null;
  const anchorChunk = viewAnchor?.chunkCoord ? `${viewAnchor.chunkCoord.x},${viewAnchor.chunkCoord.z}` : null;
  const filteredChunks = options.chunk
    ? chunks.filter(function (chunk) { return chunk.chunkKey === options.chunk; })
    : (options.allChunks || !viewWindow || !Array.isArray(viewWindow.loadedChunkKeys)
      ? chunks.slice(0, options.top)
      : chunks.filter(function (chunk) {
        return viewWindow.loadedChunkKeys.includes(chunk.chunkKey);
      }).sort(function (left, right) {
        const leftState = left.windowState === "active" ? 0 : left.windowState === "preload" ? 1 : 2;
        const rightState = right.windowState === "active" ? 0 : right.windowState === "preload" ? 1 : 2;
        if (leftState !== rightState) return leftState - rightState;
        const leftDistance = Number.isFinite(left.distanceToViewCenter) ? left.distanceToViewCenter : Number.POSITIVE_INFINITY;
        const rightDistance = Number.isFinite(right.distanceToViewCenter) ? right.distanceToViewCenter : Number.POSITIVE_INFINITY;
        if (leftDistance !== rightDistance) return leftDistance - rightDistance;
        return right.total - left.total;
      }).slice(0, options.top));

  console.log(`Database: ${resolveDatabasePath(rootDir)}`);
  console.log(`World state: ${options.state}${result.sourceState && result.sourceState !== options.state ? ` (fallback: ${result.sourceState})` : ""}`);
  console.log(`Runtime mode: ${options.mode}`);
  console.log(`Chunk size: ${chunkSize.width} x ${chunkSize.depth}`);
  console.log(`Chunk policy: enabled=${policy.enabled === true}, activeRadius=${policy.activeRadiusChunks}, preloadMargin=${policy.preloadMarginChunks}, unloadMargin=${policy.unloadMarginChunks}, cameraOnly=${policy.cameraOnly === true}, offsetZ=${policy.cameraOffsetZChunks}`);
    if (viewAnchor) {
      const posText = anchorPosition ? `x=${anchorPosition.x} z=${anchorPosition.z}` : "chunk-only";
      console.log(`Inspect center: ${viewAnchor.source}${anchorChunk ? ` -> ${anchorChunk}` : ""}${anchorPosition ? ` (${posText})` : ""}`);
      if (viewWindow) {
        console.log(`View window: active=${viewWindow.activeChunkKeys.length}, preload=${viewWindow.preloadChunkKeys.length}, loaded=${viewWindow.loadedChunkKeys.length}`);
      }
    }
  if (runtimeCoverageProbe?.coverage) {
    const coverage = runtimeCoverageProbe.coverage;
    const runtimePlayer = runtimeCoverageProbe.player || null;
    const runtimeCamTarget = runtimeCoverageProbe.camTarget || null;
    const runtimeExtraKeys = Array.isArray(coverage.desiredResidentChunkKeys)
      ? coverage.desiredResidentChunkKeys.filter(function (key) {
        return !Array.isArray(viewWindow?.loadedChunkKeys) || !viewWindow.loadedChunkKeys.includes(key);
      })
      : [];
    console.log(`Runtime coverage: source=${coverage.source}${runtimeCoverageProbe.camTargetAssumed ? " (camTarget assumed=player)" : ""}`);
    console.log(`  player=${formatPointText(runtimePlayer)} camTarget=${formatPointText(runtimeCamTarget)} presence=${coverage.presenceChunkKey || "n/a"} accepted=${coverage.presenceChunkAccepted === true}${Number.isFinite(Number(coverage.presenceChunkDistance)) ? ` distance=${coverage.presenceChunkDistance}` : ""}`);
    console.log(`  centerChunk=${coverage.centerChunk ? `${coverage.centerChunk.x},${coverage.centerChunk.z}` : "n/a"} active=${coverage.activeChunkKeys.length} visible=${coverage.visibleChunkKeys.length} preload=${coverage.preloadChunkKeys.length} desired=${coverage.desiredResidentChunkKeys.length}`);
    console.log(`  extra vs base window: ${runtimeExtraKeys.length ? formatChunkKeyList(runtimeExtraKeys, 16) : "none"}`);
  }
  if (groundBounds) {
    console.log(`Ground bounds: ${groundBounds.boundsMode} minX=${groundBounds.minX} maxX=${groundBounds.maxX} minZ=${groundBounds.minZ} maxZ=${groundBounds.maxZ}`);
  } else {
    console.log("Ground bounds: none");
  }
  console.log(`Spawn chunk: ${spawn ? `${spawn.x},${spawn.z}` : "n/a"}${spawnChunk ? ` -> ${spawnChunk}` : ""}`);
  console.log(`Chunks with content: ${chunks.length}`);
  console.log(`Scatter areas: ${scatterAreaSummaries.length}`);

  if (scatterAreaSummaries.length) {
    console.log("");
    console.log("Scatter area summary:");
    for (const area of scatterAreaSummaries) {
      const chunkPreview = area.chunkKeys.length ? area.chunkKeys.join(", ") : "n/a";
      console.log(`- ${area.sourceRef}`);
      console.log(`  instances=${area.instanceCount}/${area.count} chunks=${area.chunkCount}`);
      console.log(`  bounds center=(${Number(area.areaCenterX).toFixed(3)}, ${Number(area.areaCenterZ).toFixed(3)}) size=${Number(area.areaWidth).toFixed(3)} x ${Number(area.areaDepth).toFixed(3)}`);
      console.log(`  chunk sample: ${chunkPreview}${area.chunkCount > area.chunkKeys.length ? " ..." : ""}`);
    }
  }

  console.log("");
  console.log(options.chunk ? `Chunk report for ${options.chunk}:` : (viewWindow && !options.allChunks ? `Top ${filteredChunks.length} chunks in view window:` : `Top ${filteredChunks.length} chunks by content count:`));
  if (!filteredChunks.length) {
    console.log(options.chunk ? "  geen content gevonden in deze chunk." : "  geen chunks gevonden.");
    return;
  }

  for (const bucket of filteredChunks) {
    printChunkChunk(bucket, options.items);
    console.log("");
  }
}

function makeJsonOutput(result, options) {
  return {
    databasePath: resolveDatabasePath(rootDir),
    state: options.state,
    mode: options.mode,
    chunk: options.chunk,
    center: options.center || null,
    centerChunk: options.centerChunk || null,
    policy: result.policy,
    groundBounds: result.groundBounds,
    viewAnchor: result.viewAnchor,
    viewWindow: result.viewWindow,
    runtimeCoverageProbe: result.runtimeCoverageProbe,
    chunkCount: result.chunks.length,
    scatterAreaSummaries: result.scatterAreaSummaries,
    chunks: options.chunk
      ? result.chunks.filter(function (chunk) { return chunk.chunkKey === options.chunk; })
      : (options.allChunks || !result.viewWindow
        ? result.chunks.slice(0, options.top)
        : result.chunks.filter(function (chunk) {
          return result.viewWindow.loadedChunkKeys.includes(chunk.chunkKey);
        }).slice(0, options.top))
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const db = new DatabaseSync(resolveDatabasePath(rootDir));
  const state = loadWorldState(db, options.state);
  if (!state) {
    console.error("Geen draft of published world_state gevonden in de database.");
    process.exit(1);
  }

  const nodes = loadEditorNodes(db);
  const indexes = buildNodeIndexes(nodes);
  const latestPlayerPosition = loadLatestPlayerPosition(db, state.world?.world?.id || null);
  const policy = resolveChunkPolicy(state.world, options.mode);
  const viewAnchor = resolveInspectAnchor(state.world, policy, options, latestPlayerPosition);
  const result = buildInspectData(state.world, indexes, policy, Object.assign({}, options, { viewAnchor }));
  result.sourceState = state.state;
  result.sourceTimestamp = state.timestamp;
  result.latestPlayerPosition = latestPlayerPosition;
  result.duplicateWarnings = indexes.duplicateWarnings;

  if (options.json) {
    console.log(JSON.stringify(makeJsonOutput(result, options), null, 2));
    return;
  }

  if (indexes.duplicateWarnings.length) {
    console.log("Waarschuwingen:");
    for (const warning of indexes.duplicateWarnings.slice(0, 12)) {
      console.log(`- ${warning}`);
    }
    if (indexes.duplicateWarnings.length > 12) {
      console.log(`- ... ${indexes.duplicateWarnings.length - 12} meer`);
    }
    console.log("");
  }

  printTextReport(result, options);
}

main();
