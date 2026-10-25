import path from "node:path";
import { fileURLToPath } from "node:url";
import { addGoldenPathSlice, createTestWorldApi } from "./lib/test-world.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "http://127.0.0.1:3001";
const PREFIX = "f2_handtest";
const CANONICAL_PREFIX = "f2.handtest";
const PLAYER_POSITION = Object.freeze({ x: 525.68, y: 0, z: 81.56 });
const POSITIONS = Object.freeze({
  enemyPosition: Object.freeze({ x: 529.5, y: 0, z: 81.6 }),
  pickupPosition: Object.freeze({ x: 525.7, y: 0, z: 85.4 }),
  turnInPosition: Object.freeze({ x: 522.0, y: 0, z: 81.6 })
});
const SHARED_CATALOG_IDENTITIES = Object.freeze({
  stat_definition: "statId",
  ability_definition: "abilityId"
});
const ZONE_LOCAL_TYPES = new Set([
  "enemy_spawn_area",
  "pickup_spawn",
  "spawn_set",
  "spawn_controller",
  "quest_target_binding"
]);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const unknownArgs = args.filter(function (arg) { return arg !== "--dry-run"; });
if (unknownArgs.length) throw new Error("Onbekende optie(s): " + unknownArgs.join(", "));

if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
  process.loadEnvFile(path.join(rootDir, ".env"));
}
if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
  throw new Error("ADMIN_USERNAME en ADMIN_PASSWORD ontbreken in .env.");
}

let cookie = "";
let csrfToken = "";

function setCookieFrom(response) {
  const raw = response.headers.get("set-cookie");
  if (raw) cookie = raw.split(";")[0];
}

async function call(method, pathname, body) {
  const headers = { Origin: BASE, Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && csrfToken) {
    headers["X-GK-CSRF"] = csrfToken;
  }
  let payload;
  if (body !== undefined && body !== null) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(BASE + pathname, { method, headers, body: payload });
  setCookieFrom(response);
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (json?.csrfToken) csrfToken = json.csrfToken;
  return { status: response.status, json, text };
}

function requireSingleNode(graph, type) {
  const matches = (graph.nodes || []).filter(function (node) { return node.type === type; });
  if (matches.length !== 1) {
    throw new Error("Verwacht precies 1 node van type " + type + ", gevonden: " + matches.length + ".");
  }
  return matches[0];
}

function containsPosition(zoneNode, position) {
  const values = zoneNode.values || {};
  const originX = Number(values.originX);
  const originZ = Number(values.originZ);
  const width = Number(values.width);
  const depth = Number(values.depth);
  const minY = Number(values.minY);
  const maxY = Number(values.maxY);
  return [originX, originZ, width, depth].every(Number.isFinite)
    && position.x >= originX && position.x <= originX + width
    && position.z >= originZ && position.z <= originZ + depth
    && (!Number.isFinite(minY) || position.y >= minY)
    && (!Number.isFinite(maxY) || position.y <= maxY);
}

function resolveZone(graph, position) {
  const zoneDefinitions = (graph.nodes || []).filter(function (node) {
    return node.type === "zone_definition" && containsPosition(node, position);
  });
  if (zoneDefinitions.length !== 1) {
    throw new Error("De handtestpositie moet in precies 1 bestaande zone liggen; gevonden: " + zoneDefinitions.length + ".");
  }
  const zoneDefinition = zoneDefinitions[0];
  const outputEdge = (graph.edges || []).find(function (edge) {
    if (edge.fromNodeId !== zoneDefinition.id || edge.fromPort !== "zone" || edge.toPort !== "zone") return false;
    return (graph.nodes || []).some(function (node) { return node.id === edge.toNodeId && node.type === "zone_output"; });
  });
  if (!outputEdge) throw new Error("Zone " + zoneDefinition.values.zoneId + " heeft geen verbonden Zone Output.");
  const zoneOutput = (graph.nodes || []).find(function (node) { return node.id === outputEdge.toNodeId; });
  return { zoneId: zoneDefinition.values.zoneId, zoneDefinition, zoneOutput };
}

function belongsToSlice(node) {
  const serialized = JSON.stringify(node.values || {}).toLowerCase();
  return serialized.includes(PREFIX) || serialized.includes(CANONICAL_PREFIX);
}

function identityFor(type, values) {
  const field = SHARED_CATALOG_IDENTITIES[type];
  return field ? String(values?.[field] || "").trim() : "";
}

function sharedCatalogNodes(graph) {
  const result = new Map();
  for (const node of graph.nodes || []) {
    const identity = identityFor(node.type, node.values);
    if (!identity) continue;
    const isCatalogDefinition = (graph.edges || []).some(function (edge) {
      return edge.fromNodeId === node.id && edge.fromPort === "catalogDefinition";
    });
    if (isCatalogDefinition) result.set(node.type + ":" + identity, node);
  }
  return result;
}

function foundationFromGraph(graph) {
  return {
    worldAssembly: requireSingleNode(graph, "world_assembly"),
    catalogRegistry: requireSingleNode(graph, "catalog_registry"),
    campaignRegistry: requireSingleNode(graph, "campaign_registry"),
    playerRulesOutput: requireSingleNode(graph, "player_rules_output"),
    uiOutput: requireSingleNode(graph, "ui_output"),
    projectSettings: requireSingleNode(graph, "game_project_settings")
  };
}

function modelAssetFromGraph(graph) {
  const candidates = (graph.nodes || []).filter(function (node) {
    return node.type === "enemy_archetype" || node.type === "playable_character_definition";
  });
  return candidates.map(function (node) { return node.values?.modelAssetId; }).find(Boolean) || null;
}

function sliceOptions(modelAssetId) {
  return {
    prefix: PREFIX,
    modelAssetId,
    enemyPosition: POSITIONS.enemyPosition,
    pickupPosition: POSITIONS.pickupPosition,
    turnInPosition: POSITIONS.turnInPosition
  };
}

function createSliceApi(baseApi, graph, planOnly, zoneParentId) {
  const existingShared = sharedCatalogNodes(graph);
  const reusedNodeIds = new Set();
  const reusedNodes = [];
  const createdNodes = [];
  const connections = [];
  let sequence = 0;

  async function createNode(type, values) {
    const identity = identityFor(type, values);
    const existing = identity ? existingShared.get(type + ":" + identity) : null;
    if (existing) {
      reusedNodeIds.add(existing.id);
      if (!reusedNodes.some(function (entry) { return entry.nodeId === existing.id; })) {
        reusedNodes.push({ nodeId: existing.id, type, identity });
      }
      return { graph, nodeId: existing.id };
    }
    const parentId = ZONE_LOCAL_TYPES.has(type) ? zoneParentId : null;
    if (planOnly) {
      sequence += 1;
      const nodeId = "dry_" + String(sequence).padStart(2, "0") + "_" + type;
      createdNodes.push({ nodeId, type, identity: identity || null, parentId, values });
      return { graph, nodeId };
    }
    const created = await baseApi.createNode(type, values, parentId);
    createdNodes.push({ nodeId: created.nodeId, type, identity: identity || null, parentId });
    return created;
  }

  async function connect(fromNodeId, fromPort, toNodeId, toPort) {
    if (reusedNodeIds.has(fromNodeId) && fromPort === "catalogDefinition" && toPort === "definitions") {
      return graph;
    }
    connections.push({ fromNodeId, fromPort, toNodeId, toPort });
    if (planOnly) return graph;
    return baseApi.connect(fromNodeId, fromPort, toNodeId, toPort);
  }

  const api = {
    createNode,
    connect,
    async wire(nodeId, route, foundation, zone) {
      const targets = { assembly: foundation?.worldAssembly, ui: foundation?.uiOutput, zone: zone?.zoneOutput };
      const target = targets[route.target];
      if (!target) throw new Error("Onbekend routedoel " + route.target + ".");
      return connect(nodeId, route.fromPort, target.id, route.toPort);
    }
  };
  return { api, createdNodes, reusedNodes, connections };
}

const login = await call("POST", "/api/auth/login", {
  username: process.env.ADMIN_USERNAME,
  password: process.env.ADMIN_PASSWORD
});
if (login.status !== 200) throw new Error("Admin-login mislukt: HTTP " + login.status + ".");

const baseApi = createTestWorldApi(call);
const graph = await baseApi.graph();
const existingSliceNodes = (graph.nodes || []).filter(belongsToSlice);
if (existingSliceNodes.length) {
  console.log(JSON.stringify({
    ok: true,
    dryRun,
    skipped: true,
    reason: PREFIX + " bestaat al; niets aangemaakt of gepubliceerd.",
    existingNodeIds: existingSliceNodes.map(function (node) { return node.id; })
  }, null, 2));
  process.exit(0);
}

const foundation = foundationFromGraph(graph);
const zone = resolveZone(graph, PLAYER_POSITION);
const modelAssetId = modelAssetFromGraph(graph);
if (!modelAssetId) throw new Error("Geen bestaand modelAssetId gevonden voor de zichtbare handtestvijand.");
const startRefsBefore = {
  startZoneRef: foundation.projectSettings.values?.startZoneRef || null,
  startSpawnRef: foundation.projectSettings.values?.startSpawnRef || null
};
const sliceApi = createSliceApi(baseApi, graph, dryRun, zone.zoneDefinition.parentId);
const fixture = await addGoldenPathSlice(sliceApi.api, foundation, zone, sliceOptions(modelAssetId));

if (dryRun) {
  console.log(JSON.stringify({
    ok: true,
    dryRun: true,
    prefix: PREFIX,
    zone: { nodeId: zone.zoneDefinition.id, zoneId: zone.zoneId, outputNodeId: zone.zoneOutput.id },
    startRefsUnchanged: startRefsBefore,
    modelAssetId,
    positions: POSITIONS,
    wouldCreateCount: sliceApi.createdNodes.length,
    wouldCreate: sliceApi.createdNodes,
    wouldReuse: sliceApi.reusedNodes,
    wouldConnectCount: sliceApi.connections.length,
    fixture
  }, null, 2));
  process.exit(0);
}

const graphAfterCreate = await baseApi.graph();
const projectSettingsAfter = requireSingleNode(graphAfterCreate, "game_project_settings");
const startRefsAfter = {
  startZoneRef: projectSettingsAfter.values?.startZoneRef || null,
  startSpawnRef: projectSettingsAfter.values?.startSpawnRef || null
};
if (JSON.stringify(startRefsAfter) !== JSON.stringify(startRefsBefore)) {
  throw new Error("Startzone/startspawn is onverwacht gewijzigd; publicatie afgebroken.");
}

const publish = await call("POST", "/api/editor/publish");
if (publish.status !== 200 || !publish.json?.ok) {
  throw new Error("Publiceren mislukt: HTTP " + publish.status + " " + String(publish.text || "").slice(0, 1000));
}

console.log(JSON.stringify({
  ok: true,
  dryRun: false,
  published: true,
  buildId: publish.json.buildId || publish.json.world?.buildId || null,
  prefix: PREFIX,
  zone: { nodeId: zone.zoneDefinition.id, zoneId: zone.zoneId, outputNodeId: zone.zoneOutput.id },
  startRefsUnchanged: startRefsAfter,
  modelAssetId,
  positions: POSITIONS,
  createdNodeIds: sliceApi.createdNodes.map(function (entry) { return entry.nodeId; }),
  createdNodes: sliceApi.createdNodes,
  reusedNodes: sliceApi.reusedNodes,
  fixture
}, null, 2));
