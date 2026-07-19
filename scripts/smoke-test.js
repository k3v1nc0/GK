import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import net from "node:net";
import zlib from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import WebSocket from "ws";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { applyGroundChunkPlan, auditSceneObjectsForGhostPlanes, auditSceneObjectsForShadowCasters, buildChunkWindow, buildCoverageCenterSignatureKey, buildGroundChunkPlan, buildWalkabilityIndex, buildSurfaceStripGeometry, chunkCoordForPosition, chunkKey, chunkKeyForPosition, chunkKeyForSegment, chunkWorldSize, clearWalkabilityIndex, collectChunkCullingStats, collectTerrainStreamingSnapshot, computeStreamingCoverage, createGroundChunkState, createWalkabilityIndex, effectiveGroundBounds, groundBlueprintSignature, groundChunkTilesForBounds, isChunkActive, isChunkLoaded, isChunkPreload, isPointBlockedByBlocker, isPointBlockedBySurface, isPointBlockedByTerrain, isPointOnWalkableSurface, midpointForSegment, prioritizeResidentChunkBuildQueue, removeGhostChunkPlanes, resolveChunkPolicy, resolveEditorShadowFocus, resolveGroundRenderMode, resolveMovement, resolveShadowPolicy, resolveStableShadowChunkWindows, resolveStableShadowFocus, resolveWorldContentCenter, resolveWorldPerformanceForRenderer, sanitizeNonWorldShadowCasters, segmentLineByMaxLength, segmentPolylineForChunks, setShadowProxyState, shadowResidentRadiusChunksForPolicy, shadowSnapWorldUnitsForPolicy, shouldUseChunkedGround, worldSpaceGroundUv } from "../apps/web/public/shared/world-runtime.js";
import { worldSettingsPresetNodePatch } from "../src/shared/node-types.js";
import { buildWorldFromGraph } from "../src/server/publish-service.js";
import { shouldApplyServerPosition } from "../apps/web/public/shared/revision-guard.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const ADMIN_PASSWORD = "k1k2k3k4k5";
const EXPECT_GLB_THUMBNAILS = String(process.env.EXPECT_GLB_THUMBNAILS || "").trim() === "1";

let cookie = "";
const defaultCookieJar = {
  get value() {
    return cookie;
  },
  set value(nextValue) {
    cookie = nextValue;
  }
};
let BASE = "";
const cleanupAssetPaths = new Set();

function setCookieFrom(response, jar = defaultCookieJar) {
  const raw = response.headers.get("set-cookie");
  if (!raw) return;
  const cookiePart = raw.split(";")[0];
  const value = cookiePart.includes("=") ? cookiePart.slice(cookiePart.indexOf("=") + 1) : "";
  jar.value = value ? cookiePart : "";
}

async function call(method, pathname, body, isForm, jar = defaultCookieJar) {
  const headers = {};
  if (jar.value) headers.Cookie = jar.value;
  let payload = body;
  if (body && !isForm) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  let response;
  try {
    response = await fetch(BASE + pathname, { method: method, headers: headers, body: payload });
  } catch (error) {
    console.error("FETCH FAIL", method, pathname, body || null, error?.message || error);
    throw error;
  }
  setCookieFrom(response, jar);
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: response.status, json: json, text: text };
}

function assert(condition, message) {
  if (!condition) throw new Error("ASSERT: " + message);
  console.log("  ok - " + message);
}

function assertNear(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error("ASSERT: " + message + " (expected " + expected + ", got " + actual + ")");
  }
  console.log("  ok - " + message);
}

function rememberAssetPaths(asset) {
  if (!asset) return;
  if (asset.sourcePath) cleanupAssetPaths.add(asset.sourcePath);
  if (asset.thumbnailPath) cleanupAssetPaths.add(asset.thumbnailPath);
}

function cleanupGeneratedAssets() {
  for (const assetPath of cleanupAssetPaths) {
    if (!assetPath || !assetPath.startsWith("/assets/")) continue;
    const filePath = path.join(rootDir, assetPath.slice(1));
    try { fs.rmSync(filePath, { force: true }); } catch {}
  }
}

function cleanupStaleGeneratedAssets() {
  const result = spawnSync("git", ["ls-files", "--others", "--exclude-standard", "assets/uploads", "assets/thumbnails"], {
    cwd: rootDir,
    encoding: "utf8"
  });
  if (result.status !== 0 || !result.stdout) return;
  for (const relative of result.stdout.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean)) {
    const filePath = path.join(rootDir, relative);
    try { fs.rmSync(filePath, { force: true }); } catch {}
  }
}

function removeSmokeFixtureAssets() {
  for (const relative of ["assets/uploads/wizard.glb", "assets/thumbnails/wizard.png"]) {
    try { fs.rmSync(path.join(rootDir, relative), { force: true }); } catch {}
  }
}

function restoreSmokeFixtureAssets() {
  spawnSync("git", ["restore", "--source=HEAD", "--", "assets/uploads/wizard.glb", "assets/thumbnails/wizard.png", "assets/thumbnails/wizard.tmp.png", "assets/thumbnails/tree-large.tmp.png"], {
    cwd: rootDir,
    stdio: "ignore"
  });
}

class SimpleFileReader {
  constructor() {
    this.result = null;
    this.onload = null;
    this.onloadend = null;
    this.onerror = null;
  }

  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      const event = { target: this };
      if (typeof this.onload === "function") this.onload(event);
      if (typeof this.onloadend === "function") this.onloadend(event);
    }).catch((error) => {
      if (typeof this.onerror === "function") this.onerror(error);
    });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = "data:application/octet-stream;base64," + Buffer.from(buffer).toString("base64");
      const event = { target: this };
      if (typeof this.onload === "function") this.onload(event);
      if (typeof this.onloadend === "function") this.onloadend(event);
    }).catch((error) => {
      if (typeof this.onerror === "function") this.onerror(error);
    });
  }
}

function ensureFileReader() {
  if (typeof globalThis.FileReader !== "undefined") return;
  globalThis.FileReader = SimpleFileReader;
}

async function buildThumbnailGlb() {
  ensureFileReader();
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 1.1, 1.0),
    new THREE.MeshStandardMaterial({
      color: 0x4d7cff,
      metalness: 0.35,
      roughness: 0.25
    })
  );
  mesh.name = "AnimatedBox";
  mesh.rotation.set(0.35, 0.6, 0.1);
  mesh.position.set(0, 0.05, 0);
  scene.add(mesh);
  scene.updateMatrixWorld(true);
  const exporter = new GLTFExporter();
  const idleClip = new THREE.AnimationClip("Idle", 1, [
    new THREE.VectorKeyframeTrack("AnimatedBox.position", [0, 0.5, 1], [
      0, 0.05, 0,
      0, 0.09, 0,
      0, 0.05, 0
    ])
  ]);
  const walkClip = new THREE.AnimationClip("Walk", 1, [
    new THREE.VectorKeyframeTrack("AnimatedBox.position", [0, 0.5, 1], [
      0, 0.05, 0,
      0.12, 0.12, 0,
      0, 0.05, 0
    ])
  ]);
  const runClip = new THREE.AnimationClip("Run", 0.75, [
    new THREE.VectorKeyframeTrack("AnimatedBox.position", [0, 0.375, 0.75], [
      0, 0.05, 0,
      0.22, 0.16, 0,
      0, 0.05, 0
    ])
  ]);
  const glb = await exporter.parseAsync(scene, { binary: true, onlyVisible: true, animations: [idleClip, walkClip, runClip] });
  return Buffer.from(glb);
}

function buildJsonBlob(value) {
  return new Blob([JSON.stringify(value)], { type: "application/json" });
}

const pngCrcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = pngCrcTable[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function buildTinyPngBlob(red, green, blue, alpha) {
  const r = Math.max(0, Math.min(255, red));
  const g = Math.max(0, Math.min(255, green));
  const b = Math.max(0, Math.min(255, blue));
  const a = Math.max(0, Math.min(255, alpha === undefined ? 255 : alpha));
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const scanline = Buffer.from([0, r, g, b, a]);
  const idat = zlib.deflateSync(scanline);
  const png = Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
  return new Blob([png], { type: "image/png" });
}

async function uploadAsset({ name, category, assetType, blob, filename }) {
  const form = new FormData();
  form.append("name", name);
  form.append("category", category);
  form.append("assetType", assetType);
  const file = blob instanceof Blob ? blob : new Blob([blob], { type: assetType === "model" ? "model/gltf-binary" : assetType === "data" ? "application/json" : "application/octet-stream" });
  form.append("file", file, filename);
  return await call("POST", "/api/assets/import", form, true);
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function createCookieJar(initialValue = "") {
  return { value: initialValue };
}

function createGameSocketClient(jar, label, options = {}) {
  const url = BASE.replace(/^http/, "ws") + "/api/game/live";
  const headers = {};
  if (jar && jar.value) headers.Cookie = jar.value;
  const autoPong = options.autoPong !== false;
  const ws = new WebSocket(url, Object.keys(headers).length ? { headers: headers } : undefined);
  const messages = [];
  const waiters = [];
  let openResolve = null;
  let openReject = null;
  let closeResolve = null;
  let openSettled = false;
  const opened = new Promise(function (resolve, reject) {
    openResolve = resolve;
    openReject = reject;
  });
  const closed = new Promise(function (resolve) {
    closeResolve = resolve;
  });
  const client = {
    label: label || "ws",
    ws: ws,
    messages: messages,
    waiters: waiters,
    opened: opened,
    closed: closed,
    waitForMessage: function (predicate, timeoutMs) {
      return waitForSocketMessage(client, predicate, timeoutMs);
    },
    send: function (payload) {
      ws.send(JSON.stringify(payload));
    },
    close: function () {
      try { ws.close(); } catch {}
    }
  };

  ws.on("open", function () {
    openSettled = true;
    if (openResolve) openResolve(client);
  });
  ws.on("unexpected-response", function (request, response) {
    openSettled = true;
    if (openReject) openReject(new Error((label || "ws") + " onverwachte HTTP response " + response.statusCode));
  });
  ws.on("message", function (data) {
    const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
    let message = null;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    messages.push(message);
    if (autoPong && message.type === "ping") {
      try {
        ws.send(JSON.stringify({
          type: "pong",
          clientPingSeq: message.clientPingSeq || null,
          clientSentAt: message.clientSentAt || null
        }));
      } catch {}
    }
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      if (!waiter.predicate(message)) continue;
      waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  });
  ws.on("close", function (code, reason) {
    if (closeResolve) closeResolve({ code: code, reason: String(reason || "") });
    if (!openSettled && openReject) openReject(new Error((label || "ws") + " sloot vóór open"));
  });
  ws.on("error", function (error) {
    if (!openSettled && openReject) openReject(error);
  });

  return client;
}

function buildInputStatePayload(options = {}) {
  const input = options.input || {};
  return {
    type: "player:input_state",
    payload: {
      clientSessionId: options.clientSessionId || null,
      inputSeq: Number(options.inputSeq || 0) || 0,
      controllerEpoch: Number(options.controllerEpoch || 0) || 0,
      clientSentAt: Number(options.clientSentAt || Date.now()) || Date.now(),
      input: {
        moveX: Number(input.moveX || 0) || 0,
        moveZ: Number(input.moveZ || 0) || 0,
        sprint: input.sprint === true,
        pointerTarget: input.pointerTarget || null,
        stop: input.stop === true
      }
    }
  };
}

function sendInputState(socket, options = {}) {
  socket.send(buildInputStatePayload(options));
}

function findSnapshotPlayer(snapshot, playerId) {
  return snapshot && Array.isArray(snapshot.players)
    ? snapshot.players.find(function (player) { return player && player.playerId === playerId; }) || null
    : null;
}

function findLatestMessage(messages, predicate) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (predicate(message)) return message;
  }
  return null;
}

function waitForSocketMessage(client, predicate, timeoutMs = 8000) {
  for (const message of client.messages) {
    if (predicate(message)) return Promise.resolve(message);
  }
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      const index = client.messages.findIndex(predicate);
      if (index !== -1) {
        resolve(client.messages[index]);
        return;
      }
      const recentTypes = client.messages.slice(-8).map(function (message) {
        return String(message && message.type ? message.type : "unknown");
      }).join(", ");
      const snapshotSummaries = client.messages
        .filter(function (message) { return message && message.type === "mmo:snapshot"; })
        .slice(-3)
        .map(function (message) {
          const player = Array.isArray(message.players) && message.players.length ? message.players[0] : null;
          return "#" + Number(message.snapshotSeq || 0) +
            " active=" + (player && player.activeControllerSessionId ? player.activeControllerSessionId : "missing") +
            " epoch=" + Number(player && player.controllerEpoch || 0) +
            " moving=" + (player && player.moving === true ? "true" : "false") +
            " lastSeq=" + Number(player && player.lastProcessedInputSeq || 0);
        })
        .join(" | ");
      const interestingMessages = client.messages
        .filter(function (message) { return message && (message.type === "error" || message.type === "player:input_ignored"); })
        .slice(-3)
        .map(function (message) {
          if (message.type === "error") {
            return "error:" + String(message.code || message.message || "unknown");
          }
          return "ignored:" + String(message.reason || "unknown") + "/seq=" + Number(message.clientInputSeq || 0) + "/epoch=" + Number(message.controllerEpoch || 0);
        })
        .join(" | ");
      reject(new Error((client.label || "ws") + " wachtte te lang op WebSocket bericht. Recent: [" + recentTypes + "]" + (snapshotSummaries ? " snapshots: [" + snapshotSummaries + "]" : "") + (interestingMessages ? " details: [" + interestingMessages + "]" : "")));
    }, timeoutMs);
    const waiter = {
      predicate: predicate,
      resolve: resolve,
      timer: timer
    };
    client.waiters.push(waiter);
  });
}

function waitForSocketClose(client, timeoutMs = 8000) {
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      reject(new Error((client.label || "ws") + " sloot niet binnen de timeout."));
    }, timeoutMs);
    client.closed.then(function (value) {
      clearTimeout(timer);
      resolve(value);
    }).catch(function (error) {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function findForbiddenKeys(value, forbiddenKeys, path = "", hits = [], seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return hits;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      findForbiddenKeys(value[index], forbiddenKeys, path + "[" + index + "]", hits, seen);
    }
    return hits;
  }
  for (const [key, child] of Object.entries(value)) {
    const nextPath = path ? path + "." + key : key;
    if (forbiddenKeys.has(key)) {
      hits.push(nextPath);
      continue;
    }
    findForbiddenKeys(child, forbiddenKeys, nextPath, hits, seen);
  }
  return hits;
}

function assertNoForbiddenKeys(value, label, extraForbiddenKeys = []) {
  const forbiddenKeys = new Set(["password", "passwordHash", "password_hash", "token", "secret", "cookie", "csrf", "sessionToken", "authToken", "accessToken", "refreshToken"].concat(extraForbiddenKeys || []));
  const hits = findForbiddenKeys(value, forbiddenKeys);
  assert(hits.length === 0, label + " bevat geen verboden secret-velden" + (hits.length ? " (" + hits.join(", ") + ")" : ""));
}

function probeUnauthenticatedGameSocket() {
  return new Promise(function (resolve) {
    const url = BASE.replace(/^http/, "ws") + "/api/game/live";
    const ws = new WebSocket(url);
    const timer = setTimeout(function () {
      try { ws.terminate(); } catch {}
      resolve({ kind: "timeout" });
    }, 5000);
    ws.on("unexpected-response", function (request, response) {
      clearTimeout(timer);
      resolve({ kind: "unexpected-response", statusCode: response.statusCode });
    });
    ws.on("open", function () {
      clearTimeout(timer);
      resolve({ kind: "open" });
      try { ws.close(); } catch {}
    });
    ws.on("error", function (error) {
      clearTimeout(timer);
      resolve({ kind: "error", message: error.message || String(error) });
    });
  });
}

function readPlayerPosition(dbPath, playerId, worldId) {
  const db = new DatabaseSync(dbPath);
  try {
    return db.prepare("SELECT * FROM player_positions WHERE player_id = ? AND world_id = ?").get(playerId, worldId) || null;
  } finally {
    try { db.close(); } catch {}
  }
}

async function waitForThumbnailReady(assetId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await call("GET", "/api/assets");
    assert(response.status === 200 && response.json && Array.isArray(response.json.assets), "GET /api/assets werkt tijdens thumbnail polling");
    const asset = response.json.assets.find(function (entry) { return entry.id === assetId; }) || null;
    assert(asset, "asset " + assetId + " blijft bestaan tijdens thumbnail polling");
    const status = String(asset.metadata?.thumbnailStatus || "").trim().toLowerCase();
    if (status === "ready") return asset;
    if (status === "failed") {
      throw new Error("Thumbnail generatie faalde voor " + assetId + ": " + String(asset.metadata?.thumbnailError || "onbekende fout"));
    }
    if (status === "skipped") {
      throw new Error("Thumbnail generatie werd overgeslagen voor " + assetId + ".");
    }
    await sleep(2000);
  }
  throw new Error("Thumbnail voor " + assetId + " werd niet klaar binnen de timeout.");
}

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE + "/api/health");
      if (response.ok) return;
    } catch {
      // server nog niet klaar
    }
    await new Promise(function (resolve) { setTimeout(resolve, 200); });
  }
  throw new Error("Server startte niet binnen de timeout.");
}

async function reservePort() {
  return await new Promise(function (resolve, reject) {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", function () {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(function () { resolve(String(port)); });
    });
  });
}

async function connect(graph, fromNodeId, fromPort, toNodeId, toPort) {
  const result = await call("POST", "/api/editor/edges", { edge: { fromNodeId: fromNodeId, fromPort: fromPort, toNodeId: toNodeId, toPort: toPort } });
  if (result.status !== 201) {
    console.error("EDGE FAIL", { fromNodeId: fromNodeId, fromPort: fromPort, toNodeId: toNodeId, toPort: toPort, status: result.status, body: result.text });
  }
  assert(result.status === 201, "edge " + fromPort + " -> " + toPort);
  return result.json;
}

async function createNode(type, values, parentId) {
  const body = { type: type, values: values };
  if (parentId) body.parentId = parentId;
  const result = await call("POST", "/api/editor/nodes", body);
  assert(result.status === 201, "node " + type + " aangemaakt");
  return result.json;
}

async function patchNodeValues(nodeId, values) {
  const result = await call("PATCH", "/api/editor/nodes/" + nodeId + "/values", { values: values });
  assert(result.status === 200, "node values geupdate voor " + nodeId);
  return result.json;
}

function findNode(graph, predicate, label) {
  const node = graph.nodes.find(predicate);
  assert(node, label);
  return node;
}

function roundSignature(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return String(Math.round(number * 1000) / 1000);
}

function round(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 1000) / 1000;
}

function entitySignature(entity) {
  const transform = entity?.transform || {};
  const position = transform.position || {};
  const rotation = transform.rotation || {};
  const scale = transform.scale || {};
  return [
    entity?.id || "",
    entity?.nodeId || "",
    entity?.sourceNodeId || "",
    entity?.sourceAssetId || "",
    roundSignature(position.x),
    roundSignature(position.y),
    roundSignature(position.z),
    roundSignature(rotation.x),
    roundSignature(rotation.y),
    roundSignature(rotation.z),
    roundSignature(scale.x),
    roundSignature(scale.y),
    roundSignature(scale.z),
    entity?.walkable === true ? "walkable" : "solid"
  ].join("|");
}

function scatterSignature(world, scatterNodeId) {
  return (Array.isArray(world?.entities) ? world.entities : [])
    .filter(function (entity) { return entity && entity.nodeId === scatterNodeId; })
    .slice()
    .sort(function (left, right) {
      return String(left.id || "").localeCompare(String(right.id || ""));
    })
    .map(entitySignature)
    .join(";;");
}

function scatterEntitiesFor(world, scatterNodeId) {
  return (Array.isArray(world?.entities) ? world.entities : []).filter(function (entity) {
    return entity && entity.nodeId === scatterNodeId;
  });
}

function scatterPositionsFor(world, scatterNodeId) {
  return scatterEntitiesFor(world, scatterNodeId).map(function (entity) {
    const position = entity?.transform?.position || {};
    return {
      x: Number(position.x) || 0,
      y: Number(position.y) || 0,
      z: Number(position.z) || 0
    };
  });
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

function polygonSegments(points) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const segments = [];
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const start = points[previous];
    const end = points[index];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    segments.push({
      index: index,
      start: start,
      end: end,
      dx: dx,
      dz: dz
    });
  }
  return segments;
}

function boundarySegmentIndexForPoint(point, points) {
  const segments = polygonSegments(points);
  let bestIndex = -1;
  let bestDistanceSq = Infinity;
  for (const segment of segments) {
    const candidate = closestPointOnSegment2D(point.x, point.z, segment.start.x, segment.start.z, segment.end.x, segment.end.z);
    if (candidate.distanceSq < bestDistanceSq) {
      bestDistanceSq = candidate.distanceSq;
      bestIndex = segment.index;
    }
  }
  return bestIndex;
}

function scatterPairwiseMinDistance(world, scatterNodeId) {
  const positions = scatterPositionsFor(world, scatterNodeId);
  let minDistance = Infinity;
  for (let left = 0; left < positions.length; left += 1) {
    for (let right = left + 1; right < positions.length; right += 1) {
      const dx = positions[left].x - positions[right].x;
      const dz = positions[left].z - positions[right].z;
      minDistance = Math.min(minDistance, Math.hypot(dx, dz));
    }
  }
  return minDistance;
}

function scatterCoverageScore(world, scatterNodeId, points, samples = 10) {
  const positions = scatterPositionsFor(world, scatterNodeId);
  if (!positions.length || !Array.isArray(points) || points.length < 3) return Infinity;
  let minX = points[0].x;
  let maxX = points[0].x;
  let minZ = points[0].z;
  let maxZ = points[0].z;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.z < minZ) minZ = point.z;
    if (point.z > maxZ) maxZ = point.z;
  }
  let worst = 0;
  const width = Math.max(0.000001, maxX - minX);
  const depth = Math.max(0.000001, maxZ - minZ);
  for (let xIndex = 0; xIndex < samples; xIndex += 1) {
    for (let zIndex = 0; zIndex < samples; zIndex += 1) {
      const x = minX + (((xIndex + 0.5) / samples) * width);
      const z = minZ + (((zIndex + 0.5) / samples) * depth);
      if (!pointInPolygon2D(x, z, points)) continue;
      let nearest = Infinity;
      for (const position of positions) {
        nearest = Math.min(nearest, Math.hypot(position.x - x, position.z - z));
      }
      if (nearest > worst) worst = nearest;
    }
  }
  return worst;
}

function mockScatterAssetService() {
  return {
    get: function (id) {
      return { id: id, assetType: "model", metadata: {} };
    },
    manifestForIds: function (ids) {
      return Array.isArray(ids) ? ids.map(function (id) {
        return { id: id, assetType: "model", metadata: {} };
      }) : [];
    }
  };
}

function buildScatterWorld(baseGraph, scatterNodeId, scatterValues) {
  const graph = JSON.parse(JSON.stringify(baseGraph));
  const scatterNode = graph.nodes.find(function (node) {
    return node.id === scatterNodeId;
  });
  if (!scatterNode) throw new Error("Scatter node niet gevonden in test graph.");
  scatterNode.values = Object.assign({}, scatterNode.values, scatterValues || {});
  return buildWorldFromGraph(graph, { assetService: mockScatterAssetService() }, { includeEditorCamera: true });
}

function closestPointOnSegment2D(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz;
  if (lengthSq <= 0.000001) {
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
      best = candidate;
    }
  }
  return best;
}

function scatterBoundaryDistance(entity, points) {
  if (!entity || !entity.transform || !entity.transform.position) return Infinity;
  const boundary = closestPointOnPolygonBoundary(entity.transform.position.x, entity.transform.position.z, points);
  return boundary ? Math.sqrt(boundary.distanceSq) : Infinity;
}

function runSurfaceGeometryChecks() {
  const geo2 = buildSurfaceStripGeometry(
    [{ x: 0, z: 0 }, { x: 10, z: 0 }],
    { width: 2, y: 0, uvScale: 1 }
  );
  assert(geo2 !== null, "buildSurfaceStripGeometry: 2 punten geeft geometry");
  assert(geo2.attributes.position && geo2.attributes.position.count === 4, "2-punt geometry heeft 4 vertices");
  assert(geo2.attributes.uv && geo2.attributes.uv.count === 4, "2-punt geometry heeft uv attribute");
  assert(geo2.index && geo2.index.count === 6, "2-punt geometry heeft 6 indices (2 triangles)");

  const geo4 = buildSurfaceStripGeometry(
    [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 5 }, { x: 10, z: 5 }],
    { width: 2, y: 0, uvScale: 1 }
  );
  assert(geo4 !== null, "buildSurfaceStripGeometry: 4 punten met bocht geeft geometry");
  assert(geo4.attributes.position && geo4.attributes.position.count === 8, "4-punt geometry heeft 8 vertices");
  assert(geo4.index && geo4.index.count === 18, "4-punt geometry heeft 18 indices (6 triangles)");

  // UV V runs continuously along path
  const uvArray = geo4.attributes.uv.array;
  const lastLeftV = uvArray[(8 - 2) * 2 + 1];
  assert(lastLeftV > 0, "UV V loopt door langs het pad (laatste vertex V > 0)");
  const firstLeftV = uvArray[0 * 2 + 1];
  assert(firstLeftV === 0, "UV V begint bij 0 voor het eerste punt");

  // U values: left=0, right=1
  assert(uvArray[0] === 0, "linker vertex heeft U=0");
  assert(uvArray[2] === 1, "rechter vertex heeft U=1");

  // Invalid inputs don't crash
  const geoEmpty = buildSurfaceStripGeometry([], { width: 2, y: 0, uvScale: 1 });
  assert(geoEmpty === null, "lege puntenlijst geeft null");

  const geoOne = buildSurfaceStripGeometry([{ x: 0, z: 0 }], { width: 2, y: 0, uvScale: 1 });
  assert(geoOne === null, "één punt geeft null");

  const geoZeroWidth = buildSurfaceStripGeometry(
    [{ x: 0, z: 0 }, { x: 10, z: 0 }],
    { width: 0, y: 0, uvScale: 1 }
  );
  assert(geoZeroWidth === null, "width=0 geeft null");

  const geoNoOptions = buildSurfaceStripGeometry([{ x: 0, z: 0 }, { x: 10, z: 0 }], null);
  assert(geoNoOptions === null, "null options geeft null (geen crash)");
}

function runShadowPolicyChecks() {
  const defaultEditorPolicy = resolveShadowPolicy({ world: {} }, "editor");
  assert(defaultEditorPolicy.enabled === true, "shadow policy defaults aan in de editor");
  assert(defaultEditorPolicy.preset === "middel_schaduw", "shadow policy default preset is middel_schaduw");
  assert(defaultEditorPolicy.mapSize === 1024, "middel schaduw gebruikt 1024 mapSize");
  assert(defaultEditorPolicy.cameraSize === 100, "middel schaduw gebruikt editor camera size 100");
  assert(defaultEditorPolicy.cameraFar === 450, "middel schaduw gebruikt editor camera far 450");
  assert(defaultEditorPolicy.snapWorldUnits === 10, "middel schaduw gebruikt snapWorldUnits 10");
  assert(defaultEditorPolicy.shadowResidentMarginChunks === 1, "middel schaduw gebruikt resident margin 1");

  const lightGamePolicy = resolveShadowPolicy({
    world: {
      performance: {
        game: { shadow: { preset: "lichte_schaduw" } },
        editor: { shadow: { preset: "hoog_schaduw" } }
      }
    }
  }, "game");
  assert(lightGamePolicy.preset === "lichte_schaduw", "game preset wordt uit shadow block gelezen");
  assert(lightGamePolicy.enabled === true, "lichte schaduw zet shadows aan");
  assert(lightGamePolicy.mapSize === 512, "lichte schaduw gebruikt 512 mapSize");
  assert(lightGamePolicy.cameraSize === 75, "lichte schaduw gebruikt game camera size 75");
  assert(lightGamePolicy.cameraFar === 350, "lichte schaduw gebruikt far 350");
  assert(lightGamePolicy.scatterCast === false, "lichte schaduw zet scatter shadows uit");
  assert(lightGamePolicy.staticPropsCast === true, "lichte schaduw laat static props casten");

  const sameWorldEditorPolicy = resolveShadowPolicy({
    world: {
      performance: {
        game: { shadow: { preset: "lichte_schaduw" } },
        editor: { shadow: { preset: "hoog_schaduw" } }
      }
    }
  }, "editor");
  assert(sameWorldEditorPolicy.preset === "hoog_schaduw", "editor preset blijft los van game preset");
  assert(sameWorldEditorPolicy.mapSize === 2048, "hoog schaduw gebruikt 2048 mapSize");
  assert(sameWorldEditorPolicy.cameraSize === 120, "hoog schaduw gebruikt editor camera size 120");

  const highEditorPolicy = resolveShadowPolicy({
    world: {
      performance: {
        editor: {
          shadow: {
            preset: "hoog_schaduw",
            bias: -0.0006,
            normalBias: 0.2,
            cameraSize: 130,
            cameraFar: 700
          }
        },
        game: { shadow: { preset: "middel_schaduw" } }
      }
    }
  }, "editor");
  assert(highEditorPolicy.enabled === true, "editor shadows blijven aan met hoog_schaduw");
  assert(highEditorPolicy.preset === "hoog_schaduw", "shadow preset blijft hoog in de editor policy");
  assert(highEditorPolicy.mapSize === 2048, "hoog schaduw gebruikt 2048 mapSize");
  assertNear(highEditorPolicy.bias, -0.0006, 0.000001, "shadow bias wordt gelezen");
  assertNear(highEditorPolicy.normalBias, 0.2, 0.000001, "shadow normal bias wordt gelezen");
  assert(highEditorPolicy.cameraSize === 130, "shadow camera size wordt gelezen (expliciete override wint)");
  assert(highEditorPolicy.cameraFar === 700, "shadow distance wordt gelezen (expliciete override wint)");

  const disabledEditorPolicy = resolveShadowPolicy({
    world: { performance: { editor: { shadow: { preset: "geen_schaduw" } }, game: { shadow: { preset: "middel_schaduw" } } } }
  }, "editor");
  assert(disabledEditorPolicy.enabled === false, "geen_schaduw schakelt editor shadows uit");
  assert(disabledEditorPolicy.mapSize === 0, "geen_schaduw rapporteert mapSize 0");

  const extremePolicy = resolveShadowPolicy({
    world: { performance: { editor: { shadow: { preset: "extreem_schaduw" } }, game: { shadow: { preset: "middel_schaduw" } } } }
  }, "editor");
  assert(extremePolicy.mapSize === 4096, "extreem schaduw gebruikt 4096 mapSize in de policy");
  assert(extremePolicy.cameraSize === 140, "extreem schaduw gebruikt editor camera size 140");
}

function runStableShadowControllerChecks() {
  const editorPolicy = resolveShadowPolicy({
    world: {
      performance: {
        editor: { shadow: { preset: "hoog_schaduw" } },
        game: { shadow: { preset: "middel_schaduw" } }
      }
    }
  }, "editor");
  const gamePolicy = resolveShadowPolicy({
    world: {
      performance: {
        editor: { shadow: { preset: "hoog_schaduw" } },
        game: { shadow: { preset: "middel_schaduw" } }
      }
    }
  }, "game");
  assert(shadowSnapWorldUnitsForPolicy(editorPolicy, "editor") === 10, "editor shadow snap gebruikt 10 world units");
  assert(shadowSnapWorldUnitsForPolicy(gamePolicy, "game") === 10, "game shadow snap gebruikt 10 world units");
  assert(shadowResidentRadiusChunksForPolicy(editorPolicy, "editor") >= shadowResidentRadiusChunksForPolicy(gamePolicy, "game"), "editor shadow radius is minstens game radius");

  const snappedStart = resolveStableShadowFocus({
    mode: "editor",
    policy: editorPolicy,
    contentCenter: { x: 11, y: 0, z: 11 },
    groundY: 0
  });
  assert(snappedStart.stableSnapCell.x === 1 && snappedStart.stableSnapCell.z === 1, "shadow focus snapt op de verwachte cel");

  const smallMove = resolveStableShadowFocus({
    mode: "editor",
    policy: editorPolicy,
    contentCenter: { x: 12, y: 0, z: 12 },
    previous: snappedStart,
    groundY: 0
  });
  assert(smallMove.snappedFocus.x === snappedStart.snappedFocus.x && smallMove.snappedFocus.z === snappedStart.snappedFocus.z, "kleine camerabeweging verandert de shadow snap niet");

  const largerMove = resolveStableShadowFocus({
    mode: "editor",
    policy: editorPolicy,
    camTarget: { x: 39, y: 0, z: 39 },
    previous: snappedStart,
    groundY: 0
  });
  assert(largerMove.snappedFocus.x !== snappedStart.snappedFocus.x || largerMove.snappedFocus.z !== snappedStart.snappedFocus.z, "shadow focus verandert pas na de snap threshold");

  const orbitA = resolveStableShadowFocus({
    mode: "editor",
    policy: editorPolicy,
    camTarget: { x: 100, y: 0, z: 100 },
    camera: { position: { x: 0, y: 50, z: 0 } },
    groundY: 0
  });
  const orbitB = resolveStableShadowFocus({
    mode: "editor",
    policy: editorPolicy,
    camTarget: { x: 100, y: 0, z: 100 },
    camera: { position: { x: 250, y: 80, z: 50 } },
    previous: orbitA,
    groundY: 0
  });
  assert(orbitA.snappedFocus.x === orbitB.snappedFocus.x && orbitA.snappedFocus.z === orbitB.snappedFocus.z, "camera orbit rond dezelfde target verandert de shadow focus niet");

  const gameSmallMove = resolveStableShadowFocus({
    mode: "game",
    policy: gamePolicy,
    player: { x: 11, y: 0, z: 11 },
    groundY: 0
  });
  const gameNextMove = resolveStableShadowFocus({
    mode: "game",
    policy: gamePolicy,
    player: { x: 12, y: 0, z: 12 },
    previous: gameSmallMove,
    groundY: 0
  });
  assert(gameSmallMove.snappedFocus.x === gameNextMove.snappedFocus.x && gameSmallMove.snappedFocus.z === gameNextMove.snappedFocus.z, "game shadow snap blijft stabiel bij kleine spelerbeweging");

  const windows = resolveStableShadowChunkWindows({
    mode: "editor",
    policy: editorPolicy,
    focus: largerMove,
    renderResidentChunkKeys: ["0,0", "1,0"],
    visibleChunkKeys: ["0,0"],
    preloadChunkKeys: ["1,0"],
    forwardChunkKeys: ["2,0"]
  });
  assert(windows.shadowResidentChunkKeys.includes("0,0"), "shadow resident bevat visible chunks");
  assert(windows.shadowResidentChunkKeys.includes("1,0"), "shadow resident bevat preload chunks");
  assert(windows.shadowResidentChunkKeys.includes("2,0"), "shadow resident bevat forward chunks");
  assert(windows.shadowResidentChunkKeys.length >= windows.renderResidentChunkKeys.length, "shadow resident is een superset van render resident");
}

function runGhostPlaneAndShadowProxyChecks() {
  // Test 1 - een camera-child PlaneGeometry zonder markers moet als ghost plane gevonden en verwijderd worden.
  const ghostScene = new THREE.Scene();
  const ghostCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  ghostCamera.name = "Ghost Camera";
  ghostScene.add(ghostCamera);
  const ghostPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshBasicMaterial({
      color: 0x8f8a4b,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide
    })
  );
  ghostPlane.name = "ghost terrain plane";
  ghostCamera.add(ghostPlane);
  ghostScene.updateMatrixWorld(true);
  ghostCamera.updateMatrixWorld(true);
  const ghostAuditBefore = auditSceneObjectsForGhostPlanes({
    scene: ghostScene,
    camera: ghostCamera,
    world: { ground: { width: 100, depth: 100, y: 0 } },
    debugOverlayVisible: false
  });
  assert(ghostAuditBefore.cameraChildPlanes === 1, "camera-child plane wordt gedetecteerd");
  assert(ghostAuditBefore.suspiciousPlanes.length >= 1, "ghost plane verschijnt in suspiciousPlanes");
  const ghostCleanup = removeGhostChunkPlanes("smoke-ghost-plane", {
    scene: ghostScene,
    camera: ghostCamera,
    world: { ground: { width: 100, depth: 100, y: 0 } },
    debugOverlayVisible: false
  });
  ghostScene.updateMatrixWorld(true);
  ghostCamera.updateMatrixWorld(true);
  const ghostAuditAfter = auditSceneObjectsForGhostPlanes({
    scene: ghostScene,
    camera: ghostCamera,
    world: { ground: { width: 100, depth: 100, y: 0 } },
    debugOverlayVisible: false
  });
  assert(ghostCleanup.removedSuspiciousPlanes >= 1, "ghost plane wordt verwijderd");
  assert(ghostAuditAfter.suspiciousPlanes.length === 0, "ghost plane is na cleanup niet meer suspicious");
  assert(ghostAuditAfter.cameraChildPlanes === 0, "cameraChildPlanes is na cleanup 0");
  assert(ghostPlane.parent === null, "ghost plane is uit de camera subtree verwijderd");

  // Test 2 - overlay planes zijn toegestaan als debug aan staat, maar verdwijnen als debug uit staat.
  const overlayScene = new THREE.Scene();
  const overlayCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  overlayScene.add(overlayCamera);
  const overlayGroup = new THREE.Group();
  overlayGroup.name = "GK chunk debug overlay";
  overlayGroup.userData.debugOverlay = true;
  overlayGroup.userData.debugOverlayRoot = true;
  overlayGroup.userData.chunkOverlayGroup = true;
  const overlayPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshBasicMaterial({
      color: 0x8eeaff,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide
    })
  );
  overlayPlane.name = "chunk overlay plane";
  overlayPlane.castShadow = true;
  overlayPlane.receiveShadow = true;
  overlayGroup.add(overlayPlane);
  overlayScene.add(overlayGroup);
  overlayScene.updateMatrixWorld(true);
  overlayCamera.updateMatrixWorld(true);
  const overlayAuditBefore = auditSceneObjectsForGhostPlanes({
    scene: overlayScene,
    camera: overlayCamera,
    world: { ground: { width: 100, depth: 100, y: 0 } },
    debugOverlayVisible: false
  });
  assert(overlayAuditBefore.suspiciousPlanes.some(function (entry) { return entry.name === "chunk overlay plane"; }), "debug overlay plane wordt als suspicious gezien als debug uit staat");
  const overlayCleanup = removeGhostChunkPlanes("smoke-overlay-plane", {
    scene: overlayScene,
    camera: overlayCamera,
    world: { ground: { width: 100, depth: 100, y: 0 } },
    debugOverlayVisible: false
  });
  assert(overlayCleanup.removedSuspiciousPlanes >= 1, "debug overlay plane wordt verwijderd als debug uit staat");
  assert(overlayPlane.parent === null, "overlay plane is verwijderd");
  assert(overlayPlane.castShadow === false && overlayPlane.receiveShadow === false, "overlay plane cast/receive shadow is uit");

  // Test 3 - helpers die per ongeluk schaduw casten moeten gesaneerd worden.
  const helperScene = new THREE.Scene();
  const helperMesh = new THREE.Mesh(
    new THREE.CircleGeometry(2, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      side: THREE.DoubleSide
    })
  );
  helperMesh.name = "mystery helper";
  helperMesh.castShadow = true;
  helperMesh.receiveShadow = true;
  helperScene.add(helperMesh);
  helperScene.updateMatrixWorld(true);
  const helperAuditBefore = auditSceneObjectsForShadowCasters({ scene: helperScene });
  assert(helperAuditBefore.helperCasterCount === 1, "helper caster wordt vóór saneren geteld");
  assert(helperAuditBefore.circleOrPlaneCasterCount === 1, "CircleGeometry helper caster wordt geteld");
  const helperSanitized = sanitizeNonWorldShadowCasters(helperScene);
  assert(helperSanitized === 1, "helper shadow caster is gesaneerd");
  const helperAuditAfter = auditSceneObjectsForShadowCasters({ scene: helperScene });
  assert(helperAuditAfter.helperCasterCount === 0, "helperCasterCount is na saneren 0");
  assert(helperAuditAfter.circleOrPlaneCasterCount === 0, "circleOrPlaneCasterCount is na saneren 0");
  assert(helperMesh.castShadow === false && helperMesh.receiveShadow === false, "helper mesh cast/receive shadow is uit");

  // Test 4 - scatter shadow proxies gebruiken echte geometry en geen circle/plane fallback.
  const scatterScene = new THREE.Scene();
  const scatterRoot = new THREE.Group();
  scatterRoot.name = "scatter-batch";
  scatterRoot.userData.batchKind = "scatter";
  scatterRoot.userData.scatterInstance = true;
  scatterRoot.userData.runtimeAlive = true;
  scatterScene.add(scatterRoot);
  const scatterMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 3, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x4f8f4f, roughness: 1 })
  );
  scatterMesh.name = "tree-caster";
  scatterMesh.castShadow = true;
  scatterMesh.receiveShadow = true;
  scatterRoot.add(scatterMesh);
  scatterScene.updateMatrixWorld(true);
  const scatterProxyChanges = setShadowProxyState(scatterRoot, true, { kind: "scatter" });
  assert(scatterProxyChanges >= 1, "scatter shadow proxy wordt geactiveerd");
  const scatterMaterial = Array.isArray(scatterMesh.material) ? scatterMesh.material[0] : scatterMesh.material;
  assert(scatterRoot.userData.shadowProxy === true, "scatter root is shadowProxy");
  assert(scatterMaterial.colorWrite === false, "scatter shadow proxy schrijft geen kleur");
  assert(scatterMesh.castShadow === true, "scatter shadow proxy cast nog steeds schaduw");
  assert(scatterMesh.receiveShadow === false, "scatter shadow proxy ontvangt geen schaduw");
  assert(scatterMesh.geometry.type !== "CircleGeometry" && scatterMesh.geometry.type !== "PlaneGeometry", "scatter shadow proxy gebruikt geen circle/plane geometry");
  const scatterAudit = auditSceneObjectsForShadowCasters({ scene: scatterScene, roots: [scatterScene] });
  assert(scatterAudit.castersByKind.scatterShadowProxy >= 1, "scatter shadow proxy wordt geteld als scatterShadowProxy");
  assert(scatterAudit.circleOrPlaneCasterCount === 0, "scatter shadow proxy veroorzaakt geen circleOrPlaneCaster");

  // Test 5 - static props blijven shadow casters als ze buiten de render resident vallen.
  const houseScene = new THREE.Scene();
  const houseRoot = new THREE.Group();
  houseRoot.name = "house-root";
  houseRoot.userData.entityId = "house_1";
  houseRoot.userData.chunkRuntimeType = "entity";
  houseRoot.userData.runtimeAlive = true;
  houseRoot.userData.renderResident = false;
  houseRoot.userData.shadowResident = true;
  houseScene.add(houseRoot);
  const houseMesh = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 4),
    new THREE.MeshStandardMaterial({ color: 0x8b6a46, roughness: 1 })
  );
  houseMesh.name = "house mesh";
  houseMesh.castShadow = true;
  houseMesh.receiveShadow = true;
  houseRoot.add(houseMesh);
  houseScene.updateMatrixWorld(true);
  const houseProxyChanges = setShadowProxyState(houseRoot, true, { kind: "staticProp" });
  assert(houseProxyChanges >= 1, "static prop shadow proxy wordt geactiveerd");
  const houseMaterial = Array.isArray(houseMesh.material) ? houseMesh.material[0] : houseMesh.material;
  assert(houseMaterial.colorWrite === false, "static prop shadow proxy schrijft geen kleur");
  const houseAudit = auditSceneObjectsForShadowCasters({ scene: houseScene, roots: [houseScene] });
  assert(houseAudit.castersByKind.staticProp >= 1, "static prop shadow caster blijft beschikbaar");
  assert(houseAudit.helperCasterCount === 0, "static prop audit telt geen helper caster");
  assert(houseAudit.circleOrPlaneCasterCount === 0, "static prop audit telt geen circle/plane caster");

  // Test 6 - editor shadow focus volgt content/selection en niet de camera orbit target.
  const focusPolicy = resolveShadowPolicy({
    world: {
      performance: {
        editor: { shadow: { preset: "hoog_schaduw" } }
      }
    }
  }, "editor");
  const worldCenter = resolveWorldContentCenter({
    ground: { width: 200, depth: 200, y: 0 }
  });
  assert(worldCenter && worldCenter.source === "groundCenter", "resolveWorldContentCenter gebruikt de ground center");
  const selectedObject = new THREE.Object3D();
  selectedObject.position.set(120, 3, 80);
  const editorFocusA = resolveEditorShadowFocus({
    selectedObject: selectedObject,
    worldCenter: worldCenter,
    groundY: 0,
    cameraTarget: { x: 500, y: 0, z: 500 },
    orbitTarget: { x: 500, y: 0, z: 500 }
  });
  const editorFocusB = resolveEditorShadowFocus({
    selectedObject: selectedObject,
    worldCenter: worldCenter,
    groundY: 0,
    cameraTarget: { x: -500, y: 0, z: -500 },
    orbitTarget: { x: -500, y: 0, z: -500 }
  });
  assert(editorFocusA.source === "selected", "geselecteerd object bepaalt de editor shadow focus");
  assert(editorFocusA.x === 120 && editorFocusA.z === 80, "editor shadow focus volgt de geselecteerde world position");
  assert(editorFocusA.x === editorFocusB.x && editorFocusA.z === editorFocusB.z, "editor shadow focus blijft stabiel als de camera orbit target verandert");
  const stableFocusA = resolveStableShadowFocus({
    mode: "editor",
    policy: focusPolicy,
    focus: editorFocusA,
    groundY: 0
  });
  const stableFocusB = resolveStableShadowFocus({
    mode: "editor",
    policy: focusPolicy,
    focus: editorFocusB,
    previous: stableFocusA,
    groundY: 0
  });
  assert(stableFocusB.jumpDetected === false, "editor shadow jumpDetected blijft false");
  assert(stableFocusA.snappedFocus.x === stableFocusB.snappedFocus.x && stableFocusA.snappedFocus.z === stableFocusB.snappedFocus.z, "editor shadow snap blijft stabiel");

  // Test 7 - resident streaming en bootstrap blijven het huidige zichtbare cluster tijdig laden.
  const residentPolicy = resolveChunkPolicy({
    chunkLoading: {
      game: {
        id: "game_chunks_regression",
        type: "game",
        enabled: true,
        chunkWidth: 100,
        chunkDepth: 100,
        gameViewRadiusChunks: 1,
        preloadMarginChunks: 1,
        unloadMarginChunks: 1,
        maxLoadedChunks: 25,
        cameraOnly: true
      }
    }
  }, "game");
  const regressionCoverage = computeStreamingCoverage({
    mode: "game",
    policy: residentPolicy,
    player: { x: 85, z: 0 },
    camTarget: { x: 85, z: 0 },
    lastPlayerPosition: { x: 60, z: 0 }
  });
  assert(regressionCoverage.desiredResidentChunkKeys.includes("1,0"), "resident streaming houdt de volgende chunk tijdig desired");
  const regressionWindow = resolveStableShadowChunkWindows({
    mode: "editor",
    policy: focusPolicy,
    focus: stableFocusA,
    renderResidentChunkKeys: ["0,0"],
    visibleChunkKeys: ["0,0"],
    preloadChunkKeys: ["1,0"]
  });
  assert(regressionWindow.shadowResidentChunkKeys.length >= regressionWindow.renderResidentChunkKeys.length, "shadow resident blijft een superset van render resident");
  assert(regressionWindow.shadowResidentChunkKeys.includes("1,0"), "save/reload bootstrap houdt preload chunk in shadow resident");
}

// Fase 8.7: editor/game world settings are split, presets patch visible fields, and legacy
// world_settings only acts as a fallback for old authored values.
function runWorldSettingsSplitChecks() {
  function worldSettingsGraph(options = {}) {
    const worldValues = Object.assign({ worldId: "world" }, options.worldValues || {});
    const nodes = [
      { id: "out1", type: "game_output", values: { publishTarget: "runtime_world" } },
      { id: "world1", type: "world_settings", values: worldValues }
    ];
    if (options.editorValues !== null) {
      nodes.push({ id: "editor1", type: "editor_world_settings", values: Object.assign({}, options.editorValues || {}) });
    }
    if (options.gameValues !== null) {
      nodes.push({ id: "game1", type: "game_world_settings", values: Object.assign({}, options.gameValues || {}) });
    }
    const edges = [
      { fromNodeId: "world1", fromPort: "world", toNodeId: "out1", toPort: "world" }
    ];
    if (options.editorValues !== null) {
      edges.push({ fromNodeId: "editor1", fromPort: "editorWorldSettings", toNodeId: "out1", toPort: "editorWorldSettings" });
    }
    if (options.gameValues !== null) {
      edges.push({ fromNodeId: "game1", fromPort: "gameWorldSettings", toNodeId: "out1", toPort: "gameWorldSettings" });
    }
    return { schemaVersion: 1, nodes: nodes, edges: edges };
  }

  const editorPresetPatch = worldSettingsPresetNodePatch("editor", "hoog_schaduw");
  const gamePresetPatch = worldSettingsPresetNodePatch("game", "geen_schaduw");
  assert(editorPresetPatch.editorPreset === "hoog_schaduw", "editor preset patch zet preset zichtbaar");
  assert(gamePresetPatch.gamePreset === "geen_schaduw", "game preset patch zet preset zichtbaar");

  const freshWorld = buildWorldFromGraph(worldSettingsGraph({
    worldValues: { worldId: "fresh", displayName: "Fresh", backgroundColor: "#101010", fogColor: "#202020", fogDensity: 0.02, smoothShading: true },
    editorValues: {},
    gameValues: {}
  }), {}, { includeEditorCamera: false });
  assert(freshWorld.world.performance.shared.worldId === "fresh", "shared worldId publiceert");
  assert(freshWorld.world.performance.compatibility.usedLegacyWorldSettingsPerformanceFields === false, "lege world_settings gebruikt geen legacy fallback");
  assert(freshWorld.world.performance.editor.preset === "middel_schaduw", "editor default preset blijft middel_schaduw");
  assert(freshWorld.world.performance.editor.debugChunkOverlayVisible === false, "editor default debugChunkOverlayVisible blijft uit");
  assert(freshWorld.world.performance.editor.debugWarningsVisible === true, "editor default debugWarningsVisible blijft aan");
  assert(freshWorld.world.performance.editor.shadow.preset === "middel_schaduw", "editor shadow block gebruikt middel_schaduw");
  assert(freshWorld.world.performance.editor.shadow.mapSize === 1024, "editor default shadow mapSize blijft 1024");
  assert(freshWorld.world.performance.editor.shadow.cameraSize === 100, "editor default shadow cameraSize blijft 100");
  assert(freshWorld.world.performance.editor.shadow.staticPropsCast === true, "editor default staticPropsCast blijft aan");
  assert(freshWorld.world.performance.game.preset === "middel_schaduw", "game default preset blijft middel_schaduw");
  assert(freshWorld.world.performance.game.debugChunkOverlayVisible === false, "game default debugChunkOverlayVisible blijft uit");
  assert(freshWorld.world.performance.game.debugWarningsVisible === false, "game default debugWarningsVisible blijft uit");
  assert(freshWorld.world.performance.game.shadow.preset === "middel_schaduw", "game shadow block gebruikt middel_schaduw");
  assert(freshWorld.world.performance.game.shadow.mapSize === 1024, "game default shadow mapSize blijft 1024");
  assert(freshWorld.world.performance.game.shadow.cameraSize === 85, "game default shadow cameraSize blijft 85");
  assert(freshWorld.world.performance.game.shadow.staticPropsCast === true, "game default staticPropsCast blijft aan");

  const legacyWorld = buildWorldFromGraph(worldSettingsGraph({
    worldValues: {
      worldId: "legacy",
      shadowQuality: "low",
      shadowBias: -0.0006,
      shadowNormalBias: 0.12,
      shadowCameraSize: 90,
      shadowCameraFar: 700
    },
    editorValues: null,
    gameValues: null
  }), {}, { includeEditorCamera: false });
  assert(legacyWorld.world.performance.compatibility.usedLegacyWorldSettingsPerformanceFields === true, "legacy-only world meldt gebruik van de oude fallback");
  assert(legacyWorld.world.performance.compatibility.legacyShadowFieldsMigrated === true, "legacy-only world meldt migratie van legacy shadow velden");
  assert(legacyWorld.world.performance.editor.shadow.preset === "lichte_schaduw", "legacy shadowQuality wordt gemigreerd naar lichte_schaduw voor editor");
  assert(legacyWorld.world.performance.game.shadow.preset === "lichte_schaduw", "legacy shadowQuality wordt gemigreerd naar lichte_schaduw voor game");
  assert(legacyWorld.world.performance.editor.shadow.mapSize === 512, "legacy low quality valt terug naar 512 mapSize");
  assert(legacyWorld.world.performance.editor.shadow.cameraSize === 90, "legacy editor shadowCameraSize volgt de lichte preset");
  assert(legacyWorld.world.performance.editor.shadow.cameraFar === 350, "legacy editor shadowCameraFar volgt de lichte preset");
  assert(legacyWorld.world.performance.game.shadow.cameraSize === 75, "legacy game shadowCameraSize volgt de lichte preset");
  assert(legacyWorld.world.performance.game.shadow.cameraFar === 350, "legacy game shadowCameraFar volgt de lichte preset");
  assert(legacyWorld.world.performance.game.shadow.staticPropsCast === true, "legacy game staticPropsCast volgt de lichte preset");

  const splitWorld = buildWorldFromGraph(worldSettingsGraph({
    worldValues: { worldId: "split" },
    editorValues: worldSettingsPresetNodePatch("editor", "hoog_schaduw"),
    gameValues: worldSettingsPresetNodePatch("game", "lichte_schaduw")
  }), {}, { includeEditorCamera: false });
  assert(splitWorld.world.performance.compatibility.usedLegacyWorldSettingsPerformanceFields === false, "nieuwe editor/game nodes winnen van legacy world_settings");
  assert(splitWorld.world.performance.editor.preset === "hoog_schaduw", "editor preset is zichtbaar");
  assert(splitWorld.world.performance.game.preset === "lichte_schaduw", "game preset is zichtbaar");
  assert(splitWorld.world.performance.editor.shadow.mapSize === 2048, "editor shadow mapSize komt uit hoog preset");
  assert(splitWorld.world.performance.game.shadow.mapSize === 512, "game shadow mapSize komt uit lichte preset");
  assert(splitWorld.world.performance.editor.shadow.cameraSize === 120, "editor shadow cameraSize komt uit hoog preset");
  assert(splitWorld.world.performance.game.shadow.cameraSize === 75, "game shadow cameraSize komt uit lichte preset");
}

function runWalkabilityChecks() {
  const sampleWorld = {
    ground: { width: 80, depth: 80, y: 0 },
    terrain: {
      surfaces: [
        {
          id: "river_main",
          surfaceKind: "river",
          width: 8,
          blocksPlayer: true,
          points: [
            { x: -20, z: 0 },
            { x: 20, z: 0 }
          ]
        },
        {
          id: "river_visual_only",
          surfaceKind: "river",
          width: 8,
          blocksPlayer: false,
          points: [
            { x: -20, z: 10 },
            { x: 20, z: 10 }
          ]
        },
        {
          id: "blocked_surface",
          surfaceKind: "mud",
          width: 6,
          blocksPlayer: true,
          points: [
            { x: -20, z: -10 },
            { x: 20, z: -10 }
          ]
        },
        {
          id: "visual_surface",
          surfaceKind: "path",
          width: 6,
          blocksPlayer: false,
          points: [
            { x: -20, z: -20 },
            { x: 20, z: -20 }
          ]
        }
      ]
    },
    collision: {
      blockers: [
        {
          id: "mountain_blocker_01",
          shapeType: "polygon",
          x: 30,
          z: 0,
          width: 4,
          depth: 4,
          radius: 2,
          points: [
            { x: 28, z: -2 },
            { x: 32, z: -2 },
            { x: 30, z: 2 }
          ],
          reason: "mountain"
        }
      ],
      walkableSurfaces: [
        {
          id: "bridge_walk_01",
          x: 0,
          y: 0.6,
          z: 0,
          width: 6,
          depth: 2.5,
          rotationY: 0,
          priority: 10,
          points: [
            { x: -3, y: 0.425, z: -1.25 },
            { x: 3, y: 0.725, z: -1.25 },
            { x: 2.4, y: 0.745, z: 1.25 },
            { x: -2.4, y: 0.505, z: 1.25 }
          ]
        },
        {
          id: "rotated_platform",
          x: -12,
          y: 0.35,
          z: -12,
          width: 4,
          depth: 2,
          rotationY: 45,
          priority: 5
        },
        {
          id: "polygon_bridge",
          x: 18,
          y: 1.1,
          z: -6,
          width: 6,
          depth: 3,
          rotationY: 0,
          priority: 8,
          points: [
            { x: 15, y: 0.8, z: -7.5 },
            { x: 21, y: 1.4, z: -7.5 },
            { x: 19, y: 1.35, z: -4.5 },
            { x: 16.5, y: 0.95, z: -4.8 }
          ]
        }
      ]
    }
  };

  const sampleIndex = createWalkabilityIndex(sampleWorld);
  assert(isPointBlockedBySurface(sampleIndex, 0, 0), "surface (river) met blocksPlayer=true blokkeert");
  assert(!isPointBlockedBySurface(sampleIndex, 0, 10), "surface (river) met blocksPlayer=false blokkeert niet");
  assert(isPointBlockedBySurface(sampleIndex, 0, -10), "surface met blocksPlayer=true blokkeert");
  assert(!isPointBlockedBySurface(sampleIndex, 0, -20), "surface met blocksPlayer=false blokkeert niet");
  assert(isPointBlockedByTerrain(sampleIndex, 0, -10, 0.5), "surface blocksPlayer telt mee als terrain collision");
  assert(isPointBlockedByBlocker(sampleIndex, 30, 0), "blocker polygon blokkeert");
  assert(isPointOnWalkableSurface(sampleIndex, 0, 0), "walkable surface override werkt");
  assert(isPointOnWalkableSurface(sampleIndex, -11, -10.9), "geroteerde walkable surface wordt herkend");
  assert(isPointOnWalkableSurface(sampleIndex, 18.5, -5.7), "polygon walkable surface wordt herkend");
  assert(!isPointOnWalkableSurface(sampleIndex, 20.8, -4.7), "polygon walkable surface volgt eigen vorm");
  assert(isPointOnWalkableSurface(sampleIndex, 3, 0, 0.5), "walkable surface houdt rekening met collision radius langs rand");
  assert(!isPointBlockedByTerrain(sampleIndex, 0, 0, 0.5), "walkable surface wint boven blokkerende surface");
  assert(!isPointBlockedByTerrain(sampleIndex, 3, 0, 0.5), "walkable surface voorkomt jitter op polygon-rand");

  const bridgeMove = resolveMovement(
    { x: -2.8, y: 0.5, z: 0.2 },
    { x: 0, y: 0, z: 0.2 },
    { radius: 0.5, ground: sampleWorld.ground, solids: [], index: sampleIndex }
  );
  assert(bridgeMove.x === 0 && bridgeMove.z === 0.2, "walkable surface laat brugpassage toe");
  assertNear(bridgeMove.y, 0.604, 0.0001, "walkable surface interpoleert punt-hoogte");

  const edgeBridgeMove = resolveMovement(
    { x: 2.1, y: 0.68, z: 0 },
    { x: 3.1, y: 0.68, z: 0.65 },
    { radius: 0.5, ground: sampleWorld.ground, solids: [], index: sampleIndex }
  );
  assert(edgeBridgeMove.x > 2.7 && edgeBridgeMove.z > 0.45, "walkable surface beweegt soepel langs schuine rand");
  assertNear(edgeBridgeMove.y, 0.7395, 0.005, "walkable surface houdt randhoogte stabiel tijdens randbeweging");

  const slideMove = resolveMovement(
    { x: -10, y: 0, z: 6 },
    { x: 10, y: 0, z: 1 },
    { radius: 0.5, ground: sampleWorld.ground, solids: [], index: sampleIndex }
  );
  assert(slideMove.x === 10 && slideMove.z < 6 && slideMove.z > 2.5, "bewegingsfallback schuift soepel langs blokkerende surface-rand");
  assert(!isPointBlockedByTerrain(sampleIndex, slideMove.x, slideMove.z, 0.5), "bewegingsfallback eindigt buiten terrain collision");

  clearWalkabilityIndex();
  buildWalkabilityIndex(sampleWorld);
  const activeBlockedMove = resolveMovement(
    { x: -10, y: 0, z: 4 },
    { x: 0, y: 0, z: 4 },
    { radius: 0.5, ground: sampleWorld.ground, solids: [] }
  );
  assert(activeBlockedMove.x === -10 && activeBlockedMove.z === 4, "buildWalkabilityIndex activeert runtime collision");
  clearWalkabilityIndex();
  const clearedMove = resolveMovement(
    { x: -10, y: 0, z: 4 },
    { x: 0, y: 0, z: 4 },
    { radius: 0.5, ground: sampleWorld.ground, solids: [] }
  );
  assert(clearedMove.x === 0 && clearedMove.z === 4, "clearWalkabilityIndex wist de actieve collision index");
}

function runChunkLoadingProofChecks() {
  const proofWorld = {
    chunkLoading: {
      editor: {
        id: "editor_chunks_node",
        type: "editor",
        enabled: true,
        chunkProfileId: "editor_chunks",
        chunkWidth: 100,
        chunkDepth: 100,
        tileSize: 1,
        editorViewRadiusChunks: 2,
        preloadMarginChunks: 1,
        unloadMarginChunks: 2,
        maxLoadedChunks: 49,
        keepSelectedChunkLoaded: true,
        showChunkGrid: true,
        showChunkLabels: true,
        debugOverlay: true
      },
      game: {
        id: "game_chunks_node",
        type: "game",
        enabled: true,
        chunkProfileId: "game_chunks",
        chunkWidth: 100,
        chunkDepth: 100,
        tileSize: 1,
        cameraOnly: true,
        gameViewRadiusChunks: 1,
        fixedCameraPaddingTiles: 10,
        preloadMarginChunks: 1,
        unloadMarginChunks: 1,
        maxLoadedChunks: 9,
        strictUnloadOutsideCamera: true,
        loadBudgetPerFrame: 2,
        debugOverlay: true
      }
    }
  };

  const editorPolicy = resolveChunkPolicy(proofWorld, "editor");
  const gamePolicy = resolveChunkPolicy(proofWorld, "game");
  assert(editorPolicy.source === "editor" && editorPolicy.enabled === true, "resolveChunkPolicy leest editor chunk policy");
  assert(gamePolicy.source === "game" && gamePolicy.enabled === true, "resolveChunkPolicy leest game chunk policy");
  assert(editorPolicy.showChunkGrid === true && editorPolicy.showChunkLabels === true && editorPolicy.debugOverlay === true, "editor overlay-flags worden gelezen");
  assert(gamePolicy.debugOverlay === true && gamePolicy.showChunkGrid === true && gamePolicy.showChunkLabels === false, "game overlay gebruikt game policy en grid default");

  const negativeCoord = chunkCoordForPosition(-1, -1, editorPolicy);
  assert(negativeCoord.x === -1 && negativeCoord.z === -1, "chunkCoordForPosition gebruikt floor voor negatieve coordinaten");
  const originCoord = chunkCoordForPosition(0, 0, editorPolicy);
  assert(originCoord.x === 0 && originCoord.z === 0, "chunkCoordForPosition houdt 0,0 in center chunk");
  assert(chunkKey(chunkCoordForPosition(150, -1, editorPolicy)) === "1,-1", "chunkKey volgt de berekende chunkcoord");

  const unclippedGamePolicy = resolveChunkPolicy({
    chunkLoading: {
      game: Object.assign({}, proofWorld.chunkLoading.game, { maxLoadedChunks: 25 })
    }
  }, "game");
  const gameWindow = buildChunkWindow({ x: 0, z: 0 }, unclippedGamePolicy, "game");
  assert(gameWindow.activeChunks.length === 9, "active radius 1 levert 9 active chunks");
  assert(gameWindow.preloadChunks.length === 16, "preload margin vergroot het chunk window");
  assert(gameWindow.loadedChunks.length === 25, "loaded window bevat active plus preload chunks zonder clipping");

  const clippedGameWindow = buildChunkWindow({ x: 0, z: 0 }, gamePolicy, "game");
  assert(clippedGameWindow.loadedChunks.length === 9, "maxLoadedChunks clipt het game window");
  assert(clippedGameWindow.clippedByMaxLoadedChunks === true, "buildChunkWindow markeert clipping door maxLoadedChunks");

  const clippedWindowAgain = buildChunkWindow({ x: 0, z: 0 }, gamePolicy, "game");
  assert(clippedGameWindow.loadedChunkKeys.join("|") === clippedWindowAgain.loadedChunkKeys.join("|"), "maxLoadedChunks clipping blijft deterministisch");

  const editorWindow = buildChunkWindow({ x: 0, z: 0 }, editorPolicy, "editor");
  assert(editorWindow.loadedChunks.length > clippedGameWindow.loadedChunks.length, "editor policy laadt meer chunks dan game policy");

  const disabledGamePolicy = resolveChunkPolicy({
    chunkLoading: {
      game: Object.assign({}, proofWorld.chunkLoading.game, { enabled: false })
    }
  }, "game");
  assert(disabledGamePolicy.enabled === false, "enabled=false schakelt runtime chunk proof uit");
}

function runChunkCullingStateChecks() {
  const cullingWorld = {
    chunkLoading: {
      game: {
        id: "game_chunks_node",
        type: "game",
        enabled: true,
        chunkProfileId: "game_chunks",
        chunkWidth: 100,
        chunkDepth: 100,
        tileSize: 1,
        cameraOnly: true,
        gameViewRadiusChunks: 1,
        fixedCameraPaddingTiles: 10,
        preloadMarginChunks: 1,
        unloadMarginChunks: 1,
        maxLoadedChunks: 25,
        strictUnloadOutsideCamera: true,
        loadBudgetPerFrame: 2,
        debugOverlay: true
      }
    }
  };
  const policy = resolveChunkPolicy(cullingWorld, "game");
  const windowAtOrigin = buildChunkWindow({ x: 0, z: 0 }, policy, "game");
  assert(isChunkActive("0,0", windowAtOrigin) === true, "isChunkActive herkent center chunk");
  assert(isChunkPreload("2,0", windowAtOrigin) === true, "isChunkPreload herkent preload ring");
  assert(isChunkLoaded("3,0", windowAtOrigin) === false, "isChunkLoaded weigert chunk buiten loaded window");

  const cullingState = collectChunkCullingStats([
    { id: "entity_inside", type: "entity", x: 0, z: 0, hasVisual: true },
    { id: "entity_outside", type: "entity", x: 350, z: 350, hasVisual: true },
    { id: "interactable_outside", type: "interactable", x: 350, z: 350, hasVisual: false },
    { id: "solid_outside", type: "solid", x: 350, z: 350, hasVisual: false },
    { id: "entity_uncullable", type: "entity", hasVisual: true }
  ], windowAtOrigin, {
    policy: policy,
    cullingEnabled: true
  });
  const insideEntity = cullingState.items.find(function (item) { return item.id === "entity_inside"; });
  const outsideEntity = cullingState.items.find(function (item) { return item.id === "entity_outside"; });
  const outsideInteractable = cullingState.items.find(function (item) { return item.id === "interactable_outside"; });
  const outsideSolid = cullingState.items.find(function (item) { return item.id === "solid_outside"; });
  assert(insideEntity && insideEntity.visible === true && insideEntity.active === true, "entity binnen loaded chunks blijft zichtbaar en actief");
  assert(outsideEntity && outsideEntity.visible === false && outsideEntity.active === false, "entity buiten loaded chunks wordt geculled");
  assert(outsideInteractable && outsideInteractable.active === false, "interactable buiten loaded chunks wordt inactief");
  assert(outsideSolid && outsideSolid.active === false, "solid buiten loaded chunks wordt inactief");
  assert(cullingState.hiddenObjects === 1, "hiddenObjects telt verborgen visuals");
  assert(cullingState.culledEntities === 1, "culledEntities telt verborgen entities");
  assert(cullingState.inactiveInteractables === 1, "inactiveInteractables telt uitgeschakelde interactables");
  assert(cullingState.inactiveSolids === 1, "inactiveSolids telt uitgeschakelde solids");
  assert(cullingState.uncullableObjects === 1, "uncullableObjects telt objecten zonder position");

  const movedWindow = buildChunkWindow({ x: 3, z: 3 }, policy, "game");
  assert(windowAtOrigin.loadedChunkKeys.join("|") !== movedWindow.loadedChunkKeys.join("|"), "moving center chunk verandert de loaded set");
  const movedState = collectChunkCullingStats([
    { id: "entity_outside", type: "entity", x: 350, z: 350, hasVisual: true }
  ], movedWindow, {
    policy: policy,
    cullingEnabled: true
  });
  assert(movedState.items[0] && movedState.items[0].visible === true && movedState.items[0].active === true, "terug in loaded set maakt entity weer zichtbaar en actief");
}

function runTerrainChunkingChecks() {
  const scaledPolicy = resolveChunkPolicy({
    chunkLoading: {
      game: {
        id: "game_chunks_scaled",
        type: "game",
        enabled: true,
        chunkProfileId: "game_chunks",
        chunkWidth: 80,
        chunkDepth: 120,
        tileSize: 2,
        gameViewRadiusChunks: 1,
        preloadMarginChunks: 1,
        unloadMarginChunks: 1,
        maxLoadedChunks: 25
      }
    }
  }, "game");
  const worldSize = chunkWorldSize(scaledPolicy);
  assert(worldSize.width === 160 && worldSize.depth === 240 && worldSize.tileSize === 2, "chunkWorldSize berekent chunk world size incl. tileSize");

  const policy = resolveChunkPolicy({
    chunkLoading: {
      game: {
        id: "game_chunks_terrain",
        type: "game",
        enabled: true,
        chunkProfileId: "game_chunks",
        chunkWidth: 100,
        chunkDepth: 100,
        tileSize: 1,
        gameViewRadiusChunks: 1,
        preloadMarginChunks: 1,
        unloadMarginChunks: 1,
        maxLoadedChunks: 25
      }
    }
  }, "game");
  const policyEnabled = resolveChunkPolicy({
    chunkLoading: {
      game: {
        id: "game_chunks_terrain_enabled",
        type: "game",
        enabled: true,
        chunkProfileId: "game_chunks",
        chunkWidth: 100,
        chunkDepth: 100,
        tileSize: 1,
        gameViewRadiusChunks: 1,
        preloadMarginChunks: 1,
        unloadMarginChunks: 1,
        maxLoadedChunks: 25,
        terrainVisualChunkingEnabled: true
      }
    }
  }, "game");

  assert(chunkKeyForPosition(-1, -1, policy) === "-1,-1", "chunkKeyForPosition floort negatieve coordinaten");
  assert(chunkCoordForPosition(-1, -1, policy).x === -1 && chunkCoordForPosition(-1, -1, policy).z === -1, "chunkCoordForPosition blijft consistent met chunkKeyForPosition");
  assert(policy.terrainVisualChunkingEnabled === false, "terrainVisualChunkingEnabled staat standaard uit");
  assert(policyEnabled.terrainVisualChunkingEnabled === true, "terrainVisualChunkingEnabled kan expliciet aan");

  const segment = {
    points: [
      { x: -150, z: 0 },
      { x: -50, z: 0 }
    ]
  };
  const midpoint = midpointForSegment(segment);
  assert(midpoint && midpoint.x === -100 && midpoint.z === 0, "midpointForSegment pakt het midden van een segment");
  assert(chunkKeyForSegment(segment, policy) === chunkKeyForPosition(midpoint.x, midpoint.z, policy), "chunkKeyForSegment volgt het midpoint");

  const splitLine = segmentLineByMaxLength({ x: 0, z: 0 }, { x: 0, z: 100 }, 25);
  assert(splitLine.length === 5, "segmentLineByMaxLength splitst een lijn in vaste stappen");
  assert(splitLine[0].x === 0 && splitLine[0].z === 0, "segmentLineByMaxLength bewaart startpunt");
  assert(splitLine[splitLine.length - 1].x === 0 && splitLine[splitLine.length - 1].z === 100, "segmentLineByMaxLength bewaart eindpunt");

  const polylinePieces = segmentPolylineForChunks([
    { x: -150, z: 0 },
    { x: 150, z: 0 }
  ], policy, {
    width: 12,
    maxSegmentLength: 75,
    segmentBaseId: "terrain-road"
  });
  assert(polylinePieces.length === 4, "segmentPolylineForChunks splitst een lange lijn over meerdere stukken");
  assert(polylinePieces[0].chunkKey === "-2,0" && polylinePieces[1].chunkKey === "-1,0" && polylinePieces[2].chunkKey === "0,0" && polylinePieces[3].chunkKey === "1,0", "segmentPolylineForChunks houdt chunkKeys per stuk bij");
  assert(polylinePieces.some(function (piece) { return Array.isArray(piece.chunkKeys) && piece.chunkKeys.length > 1; }), "segmentPolylineForChunks bewaart chunkKeys over chunkgrenzen");

  const tiles = groundChunkTilesForBounds({ width: 300, depth: 200 }, policy);
  assert(tiles.length === 8, "groundChunkTilesForBounds splitst grote ground in chunk tiles");
  assert(tiles[0].chunkKey === "-2,-1" && tiles[0].minX === -150 && tiles[0].maxX === -100 && tiles[0].minZ === -100 && tiles[0].maxZ === 0, "eerste ground tile wordt goed gesneden");
  assert(tiles[tiles.length - 1].chunkKey === "1,0" && tiles[tiles.length - 1].minX === 100 && tiles[tiles.length - 1].maxX === 150 && tiles[tiles.length - 1].minZ === 0 && tiles[tiles.length - 1].maxZ === 100, "laatste ground tile wordt goed gesneden");

  const terrainWindow = {
    loadedChunkKeys: ["0,0"],
    activeChunkKeys: ["0,0"],
    preloadChunkKeys: ["1,0"]
  };
  const terrainCullingState = collectChunkCullingStats([
    { id: "terrain_ground", type: "terrainGround", chunkKey: "0,0", hasVisual: true },
    { id: "terrain_layer_seamless", type: "terrainLayer", hasVisual: true },
    { id: "terrain_surface_uncullable", type: "terrainSurface", hasVisual: true }
  ], terrainWindow, {
    policy: policy,
    cullingEnabled: true
  });
  const terrainGround = terrainCullingState.items.find(function (item) { return item.id === "terrain_ground"; });
  const terrainLayerSeamless = terrainCullingState.items.find(function (item) { return item.id === "terrain_layer_seamless"; });
  const terrainSurfaceUncullable = terrainCullingState.items.find(function (item) { return item.id === "terrain_surface_uncullable"; });
  assert(terrainGround && terrainGround.visible === true, "terrain ground blijft zichtbaar in loaded chunk");
  assert(terrainLayerSeamless && terrainLayerSeamless.visible === true && terrainLayerSeamless.uncullable === true, "terrain layer zonder chunking blijft zichtbaar");
  assert(terrainSurfaceUncullable && terrainSurfaceUncullable.visible === true && terrainSurfaceUncullable.uncullable === true, "terrain surface zonder chunk info blijft uncullable zichtbaar");
  assert(terrainCullingState.terrainVisuals.registered === 3, "terrain visuals worden meegeteld");
  assert(terrainCullingState.terrainVisuals.visible === 3, "terrain visuals zichtbaar tellen mee");
  assert(terrainCullingState.terrainVisuals.hidden === 0, "terrain visuals verborgen tellen mee");
  assert(terrainCullingState.terrainVisuals.groundTilesVisible === 1, "ground tile visibility wordt geteld");
  assert(terrainCullingState.terrainVisuals.terrainLayerTilesVisible === 1, "terrain layer zichtbaarheid wordt geteld");
  assert(terrainCullingState.terrainVisuals.surfaceSegmentsVisible === 1, "terrain surface visibility wordt geteld");
  assert(terrainCullingState.terrainVisuals.uncullableTerrainVisuals === 2, "uncullable terrain visuals worden geteld");

  const terrainChunkedState = collectChunkCullingStats([
    { id: "terrain_layer_hidden", type: "terrainLayer", chunkKey: "2,0", chunkKeys: ["2,0"], hasVisual: true },
    { id: "terrain_layer_visible", type: "terrainLayer", chunkKey: "0,0", chunkKeys: ["0,0"], hasVisual: true }
  ], terrainWindow, {
    policy: policyEnabled,
    cullingEnabled: true
  });
  const terrainLayerHidden = terrainChunkedState.items.find(function (item) { return item.id === "terrain_layer_hidden"; });
  const terrainLayerVisible = terrainChunkedState.items.find(function (item) { return item.id === "terrain_layer_visible"; });
  assert(terrainLayerHidden && terrainLayerHidden.visible === false, "terrain layer chunking kan verborgen tile cullen");
  assert(terrainLayerVisible && terrainLayerVisible.visible === true, "terrain layer chunking houdt loaded tile zichtbaar");
}

function runGroundRootCauseChecks() {
  const centeredBounds = effectiveGroundBounds({
    width: 80,
    depth: 60,
    y: 0
  });
  assert(centeredBounds && centeredBounds.minX === -40 && centeredBounds.maxX === 40 && centeredBounds.minZ === -30 && centeredBounds.maxZ === 30, "effectiveGroundBounds houdt centerSize symmetrisch");

  const explicitGround = {
    boundsMode: "explicitBounds",
    minX: -45,
    maxX: 75,
    minZ: -30,
    maxZ: 50,
    width: 999,
    depth: 999,
    y: 0,
    textureWorldSizeX: 8,
    textureWorldSizeZ: 4
  };
  const explicitBounds = effectiveGroundBounds(explicitGround);
  assert(explicitBounds && explicitBounds.minX === -45 && explicitBounds.maxX === 75 && explicitBounds.minZ === -30 && explicitBounds.maxZ === 50, "effectiveGroundBounds respecteert explicitBounds");
  assert(explicitBounds.width === 120 && explicitBounds.depth === 80, "effectiveGroundBounds berekent explicitBounds width/depth");

  const worldUv = worldSpaceGroundUv(24, 16, explicitGround, { x: 8, z: 4 });
  assertNear(worldUv.u, 3, 0.000001, "worldSpaceGroundUv blijft world-space op X");
  assertNear(worldUv.v, 4, 0.000001, "worldSpaceGroundUv blijft world-space op Z");

  const gameChunkWorld = {
    ground: explicitGround,
    chunkLoading: {
      game: {
        id: "game_chunks_ground",
        type: "game",
        enabled: true,
        chunkProfileId: "game_chunks",
        chunkWidth: 100,
        chunkDepth: 100,
        tileSize: 1,
        gameViewRadiusChunks: 1,
        preloadMarginChunks: 1,
        unloadMarginChunks: 1,
        maxLoadedChunks: 25
      },
      editor: {
        id: "editor_chunks_ground",
        type: "editor",
        enabled: false,
        chunkProfileId: "editor_chunks",
        chunkWidth: 100,
        chunkDepth: 100,
        tileSize: 1,
        editorViewRadiusChunks: 2,
        preloadMarginChunks: 1,
        unloadMarginChunks: 2,
        maxLoadedChunks: 49,
        keepSelectedChunkLoaded: true
      }
    }
  };
  const editorChunkWorld = {
    ground: explicitGround,
    chunkLoading: {
      game: Object.assign({}, gameChunkWorld.chunkLoading.game, { enabled: false }),
      editor: Object.assign({}, gameChunkWorld.chunkLoading.editor, { enabled: true })
    }
  };
  assert(resolveGroundRenderMode(gameChunkWorld, "game") === "chunked", "game chunk loading schakelt ground naar chunked mode");
  assert(shouldUseChunkedGround(gameChunkWorld, "game") === true, "shouldUseChunkedGround volgt game chunk loading");
  assert(resolveGroundRenderMode(editorChunkWorld, "editor") === "chunked", "editor chunk loading kan ook chunked ground gebruiken");
  assert(resolveGroundRenderMode({ ground: explicitGround, chunkLoading: { game: Object.assign({}, gameChunkWorld.chunkLoading.game, { enabled: false }) } }, "game") === "full", "uitgeschakelde game chunk loading houdt full mode");
  assert(shouldUseChunkedGround({ ground: explicitGround, chunkLoading: { game: Object.assign({}, gameChunkWorld.chunkLoading.game, { enabled: false }) } }, "game") === false, "shouldUseChunkedGround geeft false als chunk loading uit staat");
  assert(typeof groundBlueprintSignature(gameChunkWorld, "game") === "string" && groundBlueprintSignature(gameChunkWorld, "game").length > 0, "groundBlueprintSignature berekent een geldige signature");

  const gamePolicy = resolveChunkPolicy(gameChunkWorld, "game");
  const tiles = groundChunkTilesForBounds(explicitGround, gamePolicy);
  assert(tiles.length === 4, "groundChunkTilesForBounds splitst explicitBounds in 4 tiles");
  assert(tiles[0].chunkKey === "-1,-1" && tiles[0].minX === -45 && tiles[0].maxX === 0 && tiles[0].minZ === -30 && tiles[0].maxZ === 0, "eerste ground tile respecteert explicit bounds");
  assert(tiles[tiles.length - 1].chunkKey === "0,0" && tiles[tiles.length - 1].minX === 0 && tiles[tiles.length - 1].maxX === 75 && tiles[tiles.length - 1].minZ === 0 && tiles[tiles.length - 1].maxZ === 50, "laatste ground tile respecteert explicit bounds");

  const groundState = createGroundChunkState();
  const chunkPlan = buildGroundChunkPlan(gameChunkWorld, "game", { loadedChunkKeys: ["-1,-1", "0,-1", "0,0"] }, groundState);
  assert(chunkPlan.mode === "chunked", "buildGroundChunkPlan kiest chunked mode voor game chunk loading");
  assert(chunkPlan.fullGroundPlaneActive === false, "chunked ground plan schakelt de full plane uit");
  assert(chunkPlan.fullGroundPlaneName === null, "chunked ground plan heeft geen full-plane naam");
  assert(chunkPlan.residentChunkKeys.join("|") === "-1,-1|0,-1|0,0", "chunked plan houdt alleen resident ground chunk keys over");

  const createdChunkKeys = [];
  const disposedChunkKeys = [];
  const firstDelta = applyGroundChunkPlan(groundState, chunkPlan, {
    createTile: function (blueprint, chunkKeyValue) {
      createdChunkKeys.push(chunkKeyValue);
      return { chunkKey: chunkKeyValue };
    },
    disposeTile: function (tile, chunkKeyValue) {
      disposedChunkKeys.push(chunkKeyValue);
    }
  });
  assert(firstDelta.previousResidentKeys.length === 0, "eerste ground plan start zonder vorige resident tiles");
  assert(createdChunkKeys.join("|") === "-1,-1|0,-1|0,0", "applyGroundChunkPlan bouwt de verwachte resident ground tiles");
  assert(groundState.residentTiles.size === 3, "groundChunkState bewaart resident tiles");

  const nextPlan = buildGroundChunkPlan(gameChunkWorld, "game", { loadedChunkKeys: ["0,0"] }, groundState);
  assert(nextPlan.leavingChunkKeys.join("|") === "-1,-1|0,-1", "verlatende ground tiles worden bepaald bij window-shift");
  applyGroundChunkPlan(groundState, nextPlan, {
    createTile: function (blueprint, chunkKeyValue) {
      createdChunkKeys.push("2:" + chunkKeyValue);
      return { chunkKey: chunkKeyValue };
    },
    disposeTile: function (tile, chunkKeyValue) {
      disposedChunkKeys.push(chunkKeyValue);
    }
  });
  assert(disposedChunkKeys.join("|") === "-1,-1|0,-1", "verlatende ground tiles worden gedeactiveerd");
  assert(groundState.residentTiles.size === 1, "groundChunkState laat alleen de loaded tile resident");

  const fullPlan = buildGroundChunkPlan({
    ground: explicitGround,
    chunkLoading: {
      game: Object.assign({}, gameChunkWorld.chunkLoading.game, { enabled: false })
    }
  }, "game", { loadedChunkKeys: ["0,0"] }, groundState);
  assert(fullPlan.mode === "full", "uitgeschakelde chunk loading levert full ground mode op");
  assert(fullPlan.fullGroundPlaneActive === true, "full plan verwacht een actieve full ground plane");
  assert(fullPlan.fullGroundPlaneName === "published-ground", "full plan bewaart de legacy plane naam");
  assert(fullPlan.residentChunkKeys.length === 0, "full plan heeft geen resident chunk tiles");
  const fullDisposedKeys = [];
  applyGroundChunkPlan(groundState, fullPlan, {
    createTile: function () {
      return null;
    },
    disposeTile: function (tile, chunkKeyValue) {
      fullDisposedKeys.push(chunkKeyValue);
    }
  });
  assert(fullDisposedKeys.join("|") === "0,0", "full plan ruimt de laatste resident chunk tile op");
  assert(groundState.residentTiles.size === 0, "full plan laat geen resident ground tiles achter");
}

function runTerrainStreamingSnapshotChecks() {
  const residentEntries = new Set(["ground_a", "path_b", "surface_c"]);
  const terrainEntries = new Map([
    ["ground_a", { chunkKeys: ["1,0"], assetIds: ["tex_ground"] }],
    ["path_b", { chunkKey: "0,0", chunkKeys: ["0,0", "1,0"], assetIds: ["tex_path", "tex_shared"] }],
    ["surface_c", { chunkKeys: ["1,0"], assetIds: ["tex_shared", "tex_surface"] }]
  ]);
  const terrainTextureRecords = new Map([
    ["tex_ground", { refCount: 2 }],
    ["tex_path", { refCount: 1 }],
    ["tex_shared", { refCount: 3 }],
    ["tex_surface", { refCount: 0 }]
  ]);
  const surfaceMaterialRecords = new Map([
    ["surface_a", new Set([{ material: {} }, { material: {} }])],
    ["surface_b", new Set([{ material: {} }])]
  ]);

  const snapshot = collectTerrainStreamingSnapshot(residentEntries, terrainEntries, terrainTextureRecords, surfaceMaterialRecords, {
    loadedChunks: 11,
    activeChunks: 5,
    preloadChunks: 6,
    lastUpdateReason: "chunk-update"
  });

  assert(snapshot.loadedChunks === 11, "terrain streaming snapshot bewaart loadedChunks");
  assert(snapshot.activeChunks === 5, "terrain streaming snapshot bewaart activeChunks");
  assert(snapshot.preloadChunks === 6, "terrain streaming snapshot bewaart preloadChunks");
  assert(snapshot.residentPieces === 3, "terrain streaming snapshot telt resident pieces");
  assert(snapshot.residentChunks === 2, "terrain streaming snapshot telt unieke resident chunks");
  assert(snapshot.residentChunkKeys.join("|") === "0,0|1,0", "terrain streaming snapshot sorteert resident chunk keys");
  assert(snapshot.textureRefs === 6, "terrain streaming snapshot telt texture refcounts");
  assert(snapshot.textureAssets === 4, "terrain streaming snapshot telt unieke resident asset ids");
  assert(snapshot.surfaceMaterials === 3, "terrain streaming snapshot telt surface material records");
  assert(snapshot.lastUpdateReason === "chunk-update", "terrain streaming snapshot bewaart update reason");
}

function runStreamingCorrectnessChecks() {
  // Fase 8.5 - Streaming Correctness Recovery: reproduceert Kevin's video-bug (pop-in na het
  // midden, lege wereld na save/reload) op het niveau van de pure coverage/queue helpers.
  const forwardPolicy = resolveChunkPolicy({
    chunkLoading: {
      game: {
        id: "game_chunks_forward",
        type: "game",
        enabled: true,
        chunkWidth: 100,
        chunkDepth: 100,
        gameViewRadiusChunks: 0,
        preloadMarginChunks: 0,
        unloadMarginChunks: 0,
        maxLoadedChunks: 25,
        cameraOnly: false,
        cameraOffsetZChunks: 0
      }
    }
  }, "game");

  // Test 1 - boom vóór zichtbare rand: met activeRadius=0 en preloadMargin=0 zou het oude
  // center-only window (buildChunkWindow) alléén chunk 0,0 laden. Zodra de speler richting de
  // grens beweegt (x=20 -> x=40) moet de forward-bias chunk 1,0 al in desiredResidentChunkKeys
  // zetten, ruim vóórdat x=50 (de effectieve grens bij tileSize 0.5) bereikt is.
  const approachingCoverage = computeStreamingCoverage({
    mode: "game",
    policy: forwardPolicy,
    player: { x: 40, z: 0 },
    camTarget: { x: 40, z: 0 },
    lastPlayerPosition: { x: 20, z: 0 }
  });
  assert(approachingCoverage.forwardChunkKeys.includes("1,0"), "forward lookahead bevat de volgende chunk vóórdat de speler de grens oversteekt");
  assert(approachingCoverage.desiredResidentChunkKeys.includes("1,0"), "desired resident set bevat forward chunk vóór grensoversteek (geen center-only bug)");
  assert(!approachingCoverage.activeChunkKeys.includes("1,0"), "chunk 1,0 is nog geen active chunk (test bewijst dat forward-bias het gat dicht, niet activeRadius)");

  // Test 2 - pop-in-na-midden bug: loop x=10 -> 25 -> 45 -> 55 en controleer dat de volgende
  // chunk al vóór x=50 desired is, niet pas nadat de speler al in chunk 1 staat.
  const walkSequence = [10, 25, 45, 55];
  let previousPoint = { x: 0, z: 0 };
  let sawForwardBeforeCrossing = false;
  for (const x of walkSequence) {
    const coverage = computeStreamingCoverage({
      mode: "game",
      policy: forwardPolicy,
      player: { x: x, z: 0 },
      camTarget: { x: x, z: 0 },
      lastPlayerPosition: previousPoint
    });
    if (x < 50 && coverage.desiredResidentChunkKeys.includes("1,0")) sawForwardBeforeCrossing = true;
    previousPoint = { x: x, z: 0 };
  }
  assert(sawForwardBeforeCrossing, "volgende chunk wordt desired vóór de grens, niet pas nadat speler al voorbij het midden is");

  // Camera-lag robuustheid: game_camera (cameraOnly) met camTarget die achterblijft op de
  // speler mag de speler-chunk niet uit beeld laten vallen (dubbele anchor voor visibleChunkKeys).
  const lagPolicy = resolveChunkPolicy({
    chunkLoading: {
      game: {
        id: "game_chunks_lag",
        type: "game",
        enabled: true,
        chunkWidth: 100,
        chunkDepth: 100,
        gameViewRadiusChunks: 0,
        preloadMarginChunks: 0,
        unloadMarginChunks: 0,
        maxLoadedChunks: 25,
        cameraOnly: true,
        cameraOffsetZChunks: 0
      }
    }
  }, "game");
  const laggedCoverage = computeStreamingCoverage({
    mode: "game",
    policy: lagPolicy,
    player: { x: 65, z: 0 },
    camTarget: { x: 35, z: 0 },
    lastPlayerPosition: { x: 55, z: 0 }
  });
  assert(laggedCoverage.visibleChunkKeys.includes("1,0"), "speler-chunk blijft visible ook als de (gelerpte) camTarget nog in de vorige chunk hangt");
  assert(laggedCoverage.desiredResidentChunkKeys.includes("1,0"), "resident content voor de speler-chunk blijft desired ondanks camera-lag");

  const staleTargetPolicy = resolveChunkPolicy({
    chunkLoading: {
      game: {
        id: "game_chunks_stale_target",
        type: "game",
        enabled: true,
        chunkWidth: 100,
        chunkDepth: 100,
        gameViewRadiusChunks: 0,
        preloadMarginChunks: 0,
        unloadMarginChunks: 0,
        maxLoadedChunks: 25,
        cameraOnly: false,
        cameraOffsetZChunks: 0
      }
    }
  }, "game");
  const staleTargetCoverage = computeStreamingCoverage({
    mode: "game",
    policy: staleTargetPolicy,
    player: { x: 1400, z: 0 },
    camTarget: { x: 40, z: 0 },
    lastPlayerPosition: { x: 1390, z: 0 }
  });
  assert(!staleTargetCoverage.visibleChunkKeys.includes("0,0"), "verafliggende camTarget trekt geen tweede visible chunk mee");
  assert(!staleTargetCoverage.desiredResidentChunkKeys.includes("0,0"), "verafliggende camTarget trekt geen tweede resident chunk mee");
  const coverageSignatureNear = buildCoverageCenterSignatureKey({ x: 0, z: 0 }, "1,0");
  const coverageSignatureFar = buildCoverageCenterSignatureKey({ x: 0, z: 0 }, "2,0");
  assert(coverageSignatureNear === "0,0~1,0", "coverage signature gebruikt primary~secondary vorm");
  assert(coverageSignatureNear !== coverageSignatureFar, "coverage signature verandert ook als alleen de secundaire chunk wijzigt");

  // Test 4 - build queue prioriteit: active/visible moeten altijd vóór verre preload chunks
  // gebouwd worden, en mogen nooit als "leftover" achteraan de rij belanden.
  const orderedQueue = prioritizeResidentChunkBuildQueue({
    centerChunk: { x: 0, z: 0 },
    residentChunkKeys: [],
    desiredResidentChunkKeys: ["3,3", "0,0", "-1,0", "1,0", "2,2"],
    activeChunkKeys: ["0,0"],
    visibleChunkKeys: ["1,0"],
    forwardChunkKeys: ["-1,0"],
    preloadChunkKeys: ["2,2", "3,3"]
  });
  assert(orderedQueue[0] === "0,0", "active chunk staat vooraan de build queue");
  assert(orderedQueue.indexOf("1,0") < orderedQueue.indexOf("2,2"), "visible chunk bouwt vóór verre preload chunks");
  assert(orderedQueue.indexOf("-1,0") < orderedQueue.indexOf("2,2"), "forward chunk bouwt vóór overige preload chunks");
  assert(orderedQueue.indexOf("2,2") < orderedQueue.indexOf("3,3"), "preload chunks blijven onderling op afstand gesorteerd");
  assert(!orderedQueue.slice(0, 3).includes("3,3"), "verste preload chunk dringt niet voor active/visible/forward chunks");

  const alreadyResidentQueue = prioritizeResidentChunkBuildQueue({
    centerChunk: { x: 0, z: 0 },
    residentChunkKeys: ["0,0"],
    desiredResidentChunkKeys: ["0,0", "1,0"],
    activeChunkKeys: ["0,0"],
    visibleChunkKeys: [],
    forwardChunkKeys: [],
    preloadChunkKeys: ["1,0"]
  });
  assert(!alreadyResidentQueue.includes("0,0"), "reeds resident chunks worden niet opnieuw in de build queue gezet");

  // Test 5 - unload hysteresis basis: de unload-marge (unloadMarginChunks) moet chunks buiten de
  // active/preload ring toch in unloadSafeChunkKeys houden, zodat een korte grensoversteek geen
  // meteen-unload triggert.
  const hysteresisPolicy = resolveChunkPolicy({
    chunkLoading: {
      game: {
        id: "game_chunks_hysteresis",
        type: "game",
        enabled: true,
        chunkWidth: 100,
        chunkDepth: 100,
        gameViewRadiusChunks: 0,
        preloadMarginChunks: 0,
        unloadMarginChunks: 2,
        maxLoadedChunks: 25,
        cameraOnly: false
      }
    }
  }, "game");
  const hysteresisCoverage = computeStreamingCoverage({
    mode: "game",
    policy: hysteresisPolicy,
    player: { x: 0, z: 0 },
    camTarget: { x: 0, z: 0 }
  });
  assert(hysteresisCoverage.unloadSafeChunkKeys.includes("2,0"), "unload-marge houdt chunks buiten active/preload toch resident-safe");
  assert(hysteresisCoverage.unloadSafeChunkKeys.includes("0,0"), "center chunk blijft altijd unload-safe");
}

// MMO-01-FIX-4: de client-side revision guard (apps/web/public/shared/revision-guard.js) is een
// pure functie zodat we hem hier los van een browser kunnen bewijzen, in plaats van alleen te
// vertrouwen op een self-fulfilling assertie binnen dezelfde runtime.
function runRevisionGuardChecks() {
  assert(shouldApplyServerPosition(5, 6) === true, "nieuwere revision wordt toegepast");
  assert(shouldApplyServerPosition(5, 5) === true, "gelijke revision wordt toegepast");
  assert(shouldApplyServerPosition(5, 4) === false, "oudere (stale) revision wordt genegeerd");
  assert(shouldApplyServerPosition(0, 1) === true, "eerste server revision na cold state wordt toegepast");
  assert(shouldApplyServerPosition(undefined, 1) === true, "ontbrekende huidige revision blokkeert de eerste update niet");
}

async function main() {
  let child = null;
  let tmpDir = "";
  let dbPath = "";
  let failed = false;
  try {
    const PORT = process.env.SMOKE_PORT || await reservePort();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gk-smoke-"));
    dbPath = path.join(tmpDir, "smoke.sqlite");
    cleanupStaleGeneratedAssets();
    removeSmokeFixtureAssets();
    runSurfaceGeometryChecks();
    runShadowPolicyChecks();
    runStableShadowControllerChecks();
    runGhostPlaneAndShadowProxyChecks();
    runWorldSettingsSplitChecks();
    runWalkabilityChecks();
    runChunkLoadingProofChecks();
    runChunkCullingStateChecks();
    runTerrainChunkingChecks();
    runGroundRootCauseChecks();
    runTerrainStreamingSnapshotChecks();
    runStreamingCorrectnessChecks();
    runRevisionGuardChecks();
    child = spawn(process.execPath, ["src/server/server.js"], {
      cwd: rootDir,
      env: Object.assign({}, process.env, {
        PORT: PORT,
        DATABASE_PATH: dbPath,
        ADMIN_PASSWORD: ADMIN_PASSWORD,
        ADMIN_USERNAME: "kevin",
        GAME_WS_HEARTBEAT_INTERVAL_MS: "1000",
        GAME_WS_HEARTBEAT_TIMEOUT_MS: "2500",
        GAME_POSITION_PERSIST_DEBOUNCE_MS: "150",
        GAME_WS_RATE_LIMIT_PER_SECOND: "20"
      }),
      stdio: ["pipe", "pipe", "pipe"]
    });
    child.stderr.on("data", function (data) { process.stderr.write("[server] " + data); });
    BASE = "http://127.0.0.1:" + PORT;
    await waitForHealth(30000);

    console.log("Server draait.");

    const before = await call("GET", "/api/game/world");
    assert(before.status === 404, "game wereld is 404 voor publish (geen sample data)");

    const login = await call("POST", "/api/auth/login", { username: "kevin", password: ADMIN_PASSWORD });
    assert(login.status === 200 && login.json.ok, "login werkt");

    const emptyAssets = await call("GET", "/api/assets");
    assert(emptyAssets.status === 200 && emptyAssets.json && Array.isArray(emptyAssets.json.assets) && emptyAssets.json.assets.length === 0, "lege asset database start leeg");

    const glb = await buildThumbnailGlb();
    const wizardUploadStartedAt = Date.now();
    const wizardUpload = await uploadAsset({
      name: "Wizard",
      category: "characters",
      assetType: "model",
      blob: glb,
      filename: "wizard.glb"
    });
    const wizardUploadDurationMs = Date.now() - wizardUploadStartedAt;
    assert(wizardUpload.status === 201 && wizardUpload.json.asset, "GLB upload werkt");
    assert(wizardUpload.json.timings && typeof wizardUpload.json.timings.totalServerMs === "number", "GLB upload response bevat timings");
    assert(wizardUpload.json.timings.thumbnailMs === null, "GLB upload response wacht niet op thumbnail timing");
    assert(wizardUploadDurationMs < 10000, "GLB upload response komt snel terug");
    rememberAssetPaths(wizardUpload.json.asset);
    const modelId = wizardUpload.json.asset.id;
    assert(wizardUpload.json.asset.metadata.animationCount === 3, "GLB metadata telt 3 animaties");
    assert(wizardUpload.json.asset.metadata.defaultAnimation === "Idle", "GLB metadata kiest Idle als default");
    assert(Array.isArray(wizardUpload.json.asset.metadata.animations) && wizardUpload.json.asset.metadata.animations.length === 3, "GLB metadata bevat animatielijst");
    const wizardAnimationNames = new Set((wizardUpload.json.asset.metadata.animations || []).map(function (entry) { return entry.name; }));
    assert(wizardAnimationNames.has("Idle") && wizardAnimationNames.has("Walk") && wizardAnimationNames.has("Run"), "GLB metadata bevat Idle, Walk en Run");
    assert(wizardUpload.json.asset.metadata.thumbnailStatus === "pending" || wizardUpload.json.asset.metadata.thumbnailStatus === "processing", "GLB thumbnail start async als pending/processing");
    assert(wizardUpload.json.asset.thumbnailPath === null, "GLB upload response wacht niet op thumbnailPath");
    const assetsAfterWizardUpload = await call("GET", "/api/assets");
    assert(assetsAfterWizardUpload.status === 200 && assetsAfterWizardUpload.json && Array.isArray(assetsAfterWizardUpload.json.assets), "GET /api/assets werkt direct na upload");
    const wizardFromList = assetsAfterWizardUpload.json.assets.find(function (asset) { return asset.id === modelId; });
    assert(wizardFromList && (wizardFromList.metadata.thumbnailStatus === "pending" || wizardFromList.metadata.thumbnailStatus === "processing"), "GET /api/assets toont pending thumbnail status");
    const wizardSourcePathBeforeRename = wizardUpload.json.asset.sourcePath;
    let wizardThumbnailPathBeforeRename = wizardUpload.json.asset.thumbnailPath;
    assert(wizardUpload.json.asset.sourcePath.includes("wizard.glb"), "GLB sourcePath gebruikt asset slug");
    if (EXPECT_GLB_THUMBNAILS) {
      const wizardReadyAsset = await waitForThumbnailReady(modelId, 120000);
      rememberAssetPaths(wizardReadyAsset);
      wizardThumbnailPathBeforeRename = wizardReadyAsset.thumbnailPath;
      assert(wizardReadyAsset.thumbnailPath && wizardReadyAsset.thumbnailPath.includes("wizard.png"), "GLB thumbnailPath gebruikt asset slug");
      const thumbnailResponse = await fetch(BASE + wizardReadyAsset.thumbnailPath);
      assert(thumbnailResponse.status === 200, "GLB thumbnail wordt publiek geserveerd");
      assert((thumbnailResponse.headers.get("content-type") || "").includes("image/png"), "GLB thumbnail is PNG");
      const thumbnailBytes = new Uint8Array(await thumbnailResponse.arrayBuffer());
      assert(thumbnailBytes.length > 8 && thumbnailBytes[0] === 0x89 && thumbnailBytes[1] === 0x50 && thumbnailBytes[2] === 0x4e && thumbnailBytes[3] === 0x47, "GLB thumbnail heeft PNG signature");
    }

    const duplicateWizardUpload = await uploadAsset({
      name: "Wizard",
      category: "characters",
      assetType: "model",
      blob: glb,
      filename: "wizard-duplicate.glb"
    });
    assert(duplicateWizardUpload.status === 409 && duplicateWizardUpload.json.message === "Assetnaam bestaat al.", "duplicate assetnaam wordt geweigerd");

    const treeUpload = await uploadAsset({
      name: "Tree",
      category: "environment",
      assetType: "model",
      blob: await buildThumbnailGlb(),
      filename: "tree.glb"
    });
    assert(treeUpload.status === 201 && treeUpload.json.asset, "Tree upload werkt");
    rememberAssetPaths(treeUpload.json.asset);
    const treeAssetId = treeUpload.json.asset.id;
    const treeSourcePathBeforeRename = treeUpload.json.asset.sourcePath;
    const treeThumbnailPathBeforeRename = treeUpload.json.asset.thumbnailPath;
    assert(treeUpload.json.asset.sourcePath.includes("tree.glb"), "Tree sourcePath gebruikt asset slug");
    assert(treeUpload.json.asset.metadata.thumbnailStatus === "pending" || treeUpload.json.asset.metadata.thumbnailStatus === "processing", "Tree thumbnail start async");
    assert(treeUpload.json.asset.thumbnailPath === null, "Tree upload response wacht niet op thumbnailPath");
    const treeAssetsAfterUpload = await call("GET", "/api/assets");
    const treeFromList = treeAssetsAfterUpload.json.assets.find(function (asset) { return asset.id === treeAssetId; });
    assert(treeFromList && (treeFromList.metadata.thumbnailStatus === "pending" || treeFromList.metadata.thumbnailStatus === "processing"), "Tree status blijft pending/processing in /api/assets");
    const treeRenameConflict = await call("PATCH", "/api/assets/" + treeAssetId, { name: "Wizard", category: treeUpload.json.asset.category });
    assert(treeRenameConflict.status === 409 && treeRenameConflict.json.message === "Assetnaam bestaat al.", "rename naar bestaande naam wordt geweigerd");
    const treeRename = await call("PATCH", "/api/assets/" + treeAssetId, { name: "Tree Large", category: treeUpload.json.asset.category });
    assert(treeRename.status === 200 && treeRename.json.ok, "rename naar unieke naam werkt");
    rememberAssetPaths(treeRename.json.asset);
    assert(treeRename.json.asset.sourcePath.includes("tree-large"), "rename past sourcePath aan naar slug");
    if (treeRename.json.asset.thumbnailPath) {
      assert(treeRename.json.asset.thumbnailPath.includes("tree-large"), "rename past thumbnailPath aan naar slug");
    }
    assert(treeRename.json.asset.sourcePath !== treeSourcePathBeforeRename, "oude sourcePath is niet meer de primaire DB path");
    if (treeThumbnailPathBeforeRename && treeRename.json.asset.thumbnailPath) {
      assert(treeRename.json.asset.thumbnailPath !== treeThumbnailPathBeforeRename, "oude thumbnailPath is niet meer de primaire DB path");
    }

    const surfaceMainTextureUpload = await uploadAsset({
      name: "Surface Main Texture",
      category: "environment",
      assetType: "texture",
      blob: buildTinyPngBlob(110, 180, 110, 255),
      filename: "surface-main-texture.png"
    });
    assert(surfaceMainTextureUpload.status === 201 && surfaceMainTextureUpload.json.asset, "surface main texture upload werkt");
    rememberAssetPaths(surfaceMainTextureUpload.json.asset);
    const surfaceMainTextureId = surfaceMainTextureUpload.json.asset.id;

    const surfaceSecondaryTextureUpload = await uploadAsset({
      name: "Surface Secondary Texture",
      category: "environment",
      assetType: "texture",
      blob: buildTinyPngBlob(120, 150, 210, 255),
      filename: "surface-secondary-texture.png"
    });
    assert(surfaceSecondaryTextureUpload.status === 201 && surfaceSecondaryTextureUpload.json.asset, "surface secondary texture upload werkt");
    rememberAssetPaths(surfaceSecondaryTextureUpload.json.asset);
    const surfaceSecondaryTextureId = surfaceSecondaryTextureUpload.json.asset.id;

    const surfaceEdgeNoiseUpload = await uploadAsset({
      name: "Surface Edge Noise",
      category: "environment",
      assetType: "texture",
      blob: buildTinyPngBlob(130, 130, 130, 255),
      filename: "surface-edge-noise.png"
    });
    assert(surfaceEdgeNoiseUpload.status === 201 && surfaceEdgeNoiseUpload.json.asset, "surface edge noise upload werkt");
    rememberAssetPaths(surfaceEdgeNoiseUpload.json.asset);
    const surfaceEdgeNoiseId = surfaceEdgeNoiseUpload.json.asset.id;

    const baselineGraph = (await call("GET", "/api/editor/graph")).json;
    const tempNode = await createNode("ambient_light", { lightId: "temp_restore", color: "#ffffff", intensity: 0.1 });
    const restore = await call("POST", "/api/editor/graph/restore", { graph: baselineGraph });
    assert(restore.status === 200 && restore.json.ok, "graph restore werkt");
    const restoredGraph = await call("GET", "/api/editor/graph");
    assert(!restoredGraph.json.nodes.some(function (node) { return node.id === tempNode.nodeId; }), "restore verwijdert tijdelijke node");
    const draftAfterRestore = await call("GET", "/api/editor/draft-world");
    assert(draftAfterRestore.status === 200, "draft world rebuildt na restore");

    let graph = (await createNode("world_settings", {
      worldId: "demo_world",
      displayName: "Demo",
      backgroundColor: "#0b1622",
      fogColor: "#1a2b3c",
      fogDensity: 0.18,
      smoothShading: true
    })).graph;
    const worldNode = graph.nodes.find(function (n) { return n.type === "world_settings"; });
    graph = (await createNode("editor_world_settings", worldSettingsPresetNodePatch("editor", "hoog_schaduw"))).graph;
    const editorWorldSettingsNode = graph.nodes.find(function (n) { return n.type === "editor_world_settings"; });
    graph = (await createNode("game_world_settings", worldSettingsPresetNodePatch("game", "lichte_schaduw"))).graph;
    const gameWorldSettingsNode = graph.nodes.find(function (n) { return n.type === "game_world_settings"; });
    graph = (await createNode("ground_surface", { groundId: "demo_ground", width: 40, depth: 40, y: 0, materialColor: "#3f6b3f" })).graph;
    const groundNode = graph.nodes.find(function (n) { return n.type === "ground_surface"; });
    graph = (await createNode("game_camera", { cameraId: "main_cam", pitch: 60, yaw: 0, startDistance: 26, distance: 20, minDistance: 8, maxDistance: 40, fov: 55, follow: true, rotateSpeed: 90 })).graph;
    const cameraNode = graph.nodes.find(function (n) { return n.type === "game_camera"; });
    graph = (await createNode("editor_camera", { cameraId: "editor_cam", targetX: 12, targetY: 3, targetZ: -5, pitch: 48, yaw: 22, distance: 18, minDistance: 4, maxDistance: 64, fov: 60, rotateSpeed: 75 })).graph;
    const editorCameraNode = graph.nodes.find(function (n) { return n.type === "editor_camera"; });
    graph = (await createNode("ambient_light", { lightId: "amb", color: "#ffffff", intensity: 0.8 })).graph;
    const ambientNode = graph.nodes.find(function (n) { return n.type === "ambient_light"; });
    graph = (await createNode("directional_light", { lightId: "sun", color: "#ffffff", intensity: 1.2, x: 10, y: 20, z: 10 })).graph;
    const dirNode = graph.nodes.find(function (n) { return n.type === "directional_light"; });
    graph = (await createNode("player_character", { playerId: "hero", modelAssetId: modelId, animationClip: "Idle", idleAnimation: "Idle", walkAnimation: "Walk", runAnimation: "Run", moveSpeed: 6, sprintMultiplier: 1.6, turnSpeed: 600, collisionRadius: 0.5, scale: 1 })).graph;
    const playerNode = graph.nodes.find(function (n) { return n.type === "player_character"; });
    assert(playerNode.values.animationClip === "Idle", "player_character bewaart animationClip");
    assert(playerNode.values.idleAnimation === "Idle", "player_character bewaart idleAnimation");
    assert(playerNode.values.walkAnimation === "Walk", "player_character bewaart walkAnimation");
    assert(playerNode.values.runAnimation === "Run", "player_character bewaart runAnimation");
    assert(playerNode.values.showNameplate === true, "player_character toont naam boven character standaard aan");
    graph = (await createNode("player_spawn", { spawnId: "spawn", x: 0, z: 0, facing: 0 })).graph;
    const spawnNode = graph.nodes.find(function (n) { return n.type === "player_spawn"; });
    graph = (await createNode("model_entity", { entityId: "entity_walk", label: "Walker", modelAssetId: modelId, animationClip: "Walk", idleAnimation: "Idle", walkAnimation: "Walk", runAnimation: "Run", x: 5, y: 0, z: 0, rotationX: 10, rotationY: 20, rotationZ: 30, scaleX: 1, scaleY: 1, scaleZ: 1, solid: false, collisionRadius: 1 })).graph;
    const modelEntityNode = findNode(graph, function (n) { return n.type === "model_entity" && n.values.entityId === "entity_walk"; }, "model entity aangemaakt");
    assert(modelEntityNode.values.animationClip === "Walk", "model_entity bewaart animationClip");
    assert(modelEntityNode.values.idleAnimation === "Idle", "model_entity bewaart idleAnimation");
    assert(modelEntityNode.values.walkAnimation === "Walk", "model_entity bewaart walkAnimation");
    assert(modelEntityNode.values.runAnimation === "Run", "model_entity bewaart runAnimation");
    assert(modelEntityNode.values.rotationX === 10 && modelEntityNode.values.rotationY === 20 && modelEntityNode.values.rotationZ === 30, "model_entity bewaart rotationX/Y/Z");
    graph = (await createNode("model_entity", {
      entityId: "entity_walk",
      label: "Walker Drop 2",
      modelAssetId: modelId,
      animationClip: "Idle",
      idleAnimation: "Idle",
      walkAnimation: "Walk",
      runAnimation: "Run",
      x: 12,
      y: 0,
      z: 3,
      rotationX: -5,
      rotationY: 45,
      rotationZ: 12,
      scaleX: 1.25,
      scaleY: 1.25,
      scaleZ: 1.25,
      solid: false,
      collisionRadius: 1
    })).graph;
    const secondModelEntityNode = findNode(graph, function (n) {
      return n.type === "model_entity" && n.id !== modelEntityNode.id && n.values.label === "Walker Drop 2";
    }, "tweede model_entity aangemaakt");
    assert(secondModelEntityNode.values.entityId !== modelEntityNode.values.entityId, "tweede drop krijgt unieke entityId");

    const duplicateModelEntityResponse = await call("POST", "/api/editor/nodes/" + modelEntityNode.id + "/duplicate");
    assert(duplicateModelEntityResponse.status === 201 && duplicateModelEntityResponse.json && duplicateModelEntityResponse.json.nodeId, "model_entity dupliceren werkt");
    graph = duplicateModelEntityResponse.json.graph;
    const duplicatedModelEntityNode = findNode(graph, function (n) {
      return n.id === duplicateModelEntityResponse.json.nodeId;
    }, "gedupliceerde model_entity aangemaakt");
    assert(duplicatedModelEntityNode.type === "model_entity", "duplicaat is model_entity");
    assert(duplicatedModelEntityNode.values.entityId !== modelEntityNode.values.entityId && duplicatedModelEntityNode.values.entityId !== secondModelEntityNode.values.entityId, "duplicaat krijgt unieke entityId");
    assert(duplicatedModelEntityNode.values.walkable === false, "walkable checkbox defaultt false");
    assert(!(graph.edges || []).some(function (edge) {
      return edge.fromNodeId === duplicatedModelEntityNode.id && edge.fromPort === "entity" && edge.toPort === "entities";
    }), "duplicaat maakt geen legacy Game Output entities verbinding");

    graph = await patchNodeValues(modelEntityNode.id, { x: 5, y: 0, z: 0, rotationX: 10, rotationY: 20, rotationZ: 30, scaleX: 1, scaleY: 1, scaleZ: 1 });
    graph = await patchNodeValues(secondModelEntityNode.id, { x: 12, y: 0, z: 3, rotationX: -5, rotationY: 45, rotationZ: 12, scaleX: 1.25, scaleY: 1.25, scaleZ: 1.25 });
    graph = await patchNodeValues(duplicatedModelEntityNode.id, { x: -7, y: 0, z: 2, rotationX: 15, rotationY: 90, rotationZ: -10, scaleX: 0.75, scaleY: 0.75, scaleZ: 0.75, walkable: true });
    const patchedOriginalModelEntityNode = findNode(graph, function (n) { return n.id === modelEntityNode.id; }, "eerste model_entity blijft bestaan");
    const patchedSecondModelEntityNode = findNode(graph, function (n) { return n.id === secondModelEntityNode.id; }, "tweede model_entity blijft bestaan");
    const patchedDuplicatedModelEntityNode = findNode(graph, function (n) { return n.id === duplicatedModelEntityNode.id; }, "gedupliceerde model_entity blijft bestaan");
    assert(patchedOriginalModelEntityNode.values.x === 5 && patchedOriginalModelEntityNode.values.rotationY === 20, "eerste instance bewaart eigen transform");
    assert(patchedSecondModelEntityNode.values.x === 12 && patchedSecondModelEntityNode.values.rotationY === 45, "tweede drop bewaart eigen transform");
    assert(patchedDuplicatedModelEntityNode.values.x === -7 && patchedDuplicatedModelEntityNode.values.rotationY === 90, "duplicate bewaart eigen transform");
    assert(patchedDuplicatedModelEntityNode.values.walkable === true, "walkable checkbox bewaart true");

    graph = (await createNode("bounded_area_scatter", {
      scatterId: "scatter_forest_patch",
      enabled: true,
      areaCenterX: 8,
      areaCenterZ: -4,
      areaWidth: 18,
      areaDepth: 12,
      areaRotationY: 25,
      count: 6,
      sourceAssetIds: [modelId, treeAssetId],
      randomObjectSelection: true,
      boundaryBlocksPlayer: true,
      seed: "scatter_seed_01",
      scaleMin: 0.8,
      scaleMax: 1.2,
      rotationYMin: -45,
      rotationYMax: 45,
      points: [
        { x: -1, z: -8 },
        { x: 6, z: -11 },
        { x: 15, z: -8 },
        { x: 18, z: -1 },
        { x: 11, z: 6 },
        { x: 0, z: 3 }
      ]
    })).graph;
    const scatterNode = findNode(graph, function (n) {
      return n.type === "bounded_area_scatter" && n.values.scatterId === "scatter_forest_patch";
    }, "bounded area scatter aangemaakt");
    assert(Array.isArray(scatterNode.values.sourceAssetIds) && scatterNode.values.sourceAssetIds.length === 2, "scatter bewaart source assets");
    assert(scatterNode.values.sourceAssetIds.includes(modelId) && scatterNode.values.sourceAssetIds.includes(treeAssetId), "scatter bewaart gekozen assets");
    graph = (await createNode("keybind", { bindingId: "kb_direct", action: "move_forward", keyCode: "KeyW" })).graph;
    const keybindDirect = findNode(graph, function (n) { return n.type === "keybind" && n.values.bindingId === "kb_direct"; }, "directe keybind aangemaakt");

    graph = (await createNode("keybind", { bindingId: "kb_group1", action: "interact", keyCode: "KeyE" })).graph;
    const keybindGroup1 = findNode(graph, function (n) { return n.type === "keybind" && n.values.bindingId === "kb_group1"; }, "group keybind aangemaakt");

    graph = (await createNode("group", { groupId: "group_one", title: "Group One" })).graph;
    const groupNode = findNode(graph, function (n) { return n.type === "group" && n.values.groupId === "group_one"; }, "group node aangemaakt");
    const groupPorts = groupNode.ports || { inputs: {}, outputs: {} };
    assert(groupPorts.inputs && groupPorts.inputs.keybinds_in && groupPorts.inputs.keybinds_in.dataType === "keybind" && groupPorts.outputs && groupPorts.outputs.keybinds_out && groupPorts.outputs.keybinds_out.dataType === "keybind", "group heeft typed input/output ports");
    const groupInputNode = findNode(graph, function (n) { return n.parentId === groupNode.id && n.type === "group_input"; }, "group input bestaat");
    const groupOutputNode = findNode(graph, function (n) { return n.parentId === groupNode.id && n.type === "group_output"; }, "group output bestaat");
    const gameOutputNode = findNode(graph, function (n) { return n.type === "game_output"; }, "game output bestaat");
    assert(!(graph.edges || []).some(function (edge) {
      return edge.fromNodeId === modelEntityNode.id && edge.fromPort === "entity" && edge.toNodeId === gameOutputNode.id && edge.toPort === "entities";
    }), "eerste model_entity heeft geen legacy Game Output entities verbinding");
    assert(!(graph.edges || []).some(function (edge) {
      return edge.fromNodeId === secondModelEntityNode.id && edge.fromPort === "entity" && edge.toNodeId === gameOutputNode.id && edge.toPort === "entities";
    }), "tweede model_entity heeft geen legacy Game Output entities verbinding");
    assert(!(graph.edges || []).some(function (edge) {
      return edge.fromNodeId === duplicatedModelEntityNode.id && edge.fromPort === "entity" && edge.toNodeId === gameOutputNode.id && edge.toPort === "entities";
    }), "gedupliceerde model_entity heeft geen legacy Game Output entities verbinding");

    graph = (await createNode("ui_hud_text", {
      moduleId: "hud_status",
      anchor: "top-left",
      text: "HUD status",
      fontSize: 16,
      color: "#ffffff"
    })).graph;
    const hudTextNode = findNode(graph, function (n) { return n.type === "ui_hud_text" && n.values.moduleId === "hud_status"; }, "hud text aangemaakt");

    graph = (await createNode("debug_performance_hud", {
      hudId: "perf_hud_main",
      label: "Performance HUD",
      enabled: true,
      anchor: "top-right",
      compact: true,
      updateIntervalMs: 500,
      showScatterInstances: true,
      showWorldSize: true
    })).graph;
    const perfHudNode = findNode(graph, function (n) { return n.type === "debug_performance_hud" && n.values.hudId === "perf_hud_main"; }, "performance hud aangemaakt");

    graph = (await createNode("debug_performance_hud", {
      hudId: "perf_hud_disabled",
      label: "Disabled Performance HUD",
      enabled: false,
      anchor: "bottom-right",
      compact: true,
      updateIntervalMs: 750
    })).graph;
    const disabledPerfHudNode = findNode(graph, function (n) { return n.type === "debug_performance_hud" && n.values.hudId === "perf_hud_disabled"; }, "disabled performance hud aangemaakt");

    graph = (await createNode("debug_performance_hud", {
      hudId: "perf_hud_ghost",
      label: "Ghost Performance HUD",
      enabled: true,
      anchor: "bottom-left",
      compact: true,
      updateIntervalMs: 500
    })).graph;
    const ghostPerfHudNode = findNode(graph, function (n) { return n.type === "debug_performance_hud" && n.values.hudId === "perf_hud_ghost"; }, "ongekoppelde performance hud aangemaakt");

    graph = (await createNode("debug_mmo_hud", {
      hudId: "mmo_debug_main",
      enabled: true,
      anchor: "bottom-left",
      compact: false,
      startCollapsed: false,
      showWsStatus: true,
      showUser: true,
      showPlayer: true,
      showSession: false,
      showPosition: true,
      showRevision: true,
      showSessions: false,
      showLastSent: true,
      showLastSentSeq: true,
      showLastAckedSeq: true,
      showPendingInputs: false,
      showController: false,
      showLastTransport: false,
      showLastIgnored: false,
      showServerSeq: true,
      showLastReceived: true,
      showLastSource: false,
      showLastError: true
    })).graph;
    const mmoDebugHudNode = findNode(graph, function (n) { return n.type === "debug_mmo_hud" && n.values.hudId === "mmo_debug_main"; }, "debug mmo hud node aangemaakt");

    graph = (await createNode("debug_mmo_hud", {
      hudId: "mmo_debug_ghost",
      enabled: true,
      anchor: "top-left",
      compact: true,
      startCollapsed: true
    })).graph;
    const ghostMmoDebugHudNode = findNode(graph, function (n) { return n.type === "debug_mmo_hud" && n.values.hudId === "mmo_debug_ghost"; }, "ongekoppelde debug mmo hud aangemaakt");

    // MMO-03: minimap bake + game/editor minimap HUD nodes.
    graph = (await createNode("minimap_bake", {
      minimapId: "main_minimap",
      label: "Main Minimap",
      enabled: true,
      boundsMode: "ground_bounds",
      paddingWorldUnits: 2,
      resolution: "1024",
      imageFormat: "webp",
      imageQuality: 0.78,
      backgroundColor: "#101a26"
    })).graph;
    const minimapBakeNode = findNode(graph, function (n) { return n.type === "minimap_bake" && n.values.minimapId === "main_minimap"; }, "minimap bake node aangemaakt");

    graph = (await createNode("game_minimap_hud", {
      hudId: "game_minimap_main",
      sourceMinimapId: "main_minimap",
      enabled: true,
      anchor: "top-right"
    })).graph;
    const gameMinimapHudNode = findNode(graph, function (n) { return n.type === "game_minimap_hud" && n.values.hudId === "game_minimap_main"; }, "game minimap hud node aangemaakt");
    assert(gameMinimapHudNode.values.debugMode === false && gameMinimapHudNode.values.liteMode === true, "game minimap default debugMode is uit en legacy liteMode aan");

    graph = (await createNode("editor_minimap_hud", {
      hudId: "editor_minimap_main",
      sourceMinimapId: "main_minimap",
      enabled: true,
      anchor: "bottom-right"
    })).graph;
    const editorMinimapHudNode = findNode(graph, function (n) { return n.type === "editor_minimap_hud" && n.values.hudId === "editor_minimap_main"; }, "editor minimap node aangemaakt");

    graph = (await createNode("minimap_bake", {
      minimapId: "ghost_minimap",
      label: "Ghost Minimap",
      enabled: true
    })).graph;
    const ghostMinimapBakeNode = findNode(graph, function (n) { return n.type === "minimap_bake" && n.values.minimapId === "ghost_minimap"; }, "ongekoppelde minimap bake aangemaakt");

    const minimapNodeSchema = await call("GET", "/api/editor/graph");
    assert(minimapNodeSchema.status === 200 && minimapNodeSchema.json.nodeTypes.minimap_bake && minimapNodeSchema.json.nodeTypes.minimap_bake.outputs.minimap.dataType === "minimap", "node schema kent minimap_bake met dataType minimap");
    assert(minimapNodeSchema.json.nodeTypes.game_minimap_hud && minimapNodeSchema.json.nodeTypes.game_minimap_hud.outputs.minimap.dataType === "minimap", "node schema kent game_minimap_hud met dataType minimap");
    assert(minimapNodeSchema.json.nodeTypes.game_minimap_hud.fields.debugMode && minimapNodeSchema.json.nodeTypes.game_minimap_hud.fields.debugMode.default === false, "node schema kent game_minimap_hud debugMode checkbox");
    assert(minimapNodeSchema.json.nodeTypes.game_minimap_hud.fields.liteMode && minimapNodeSchema.json.nodeTypes.game_minimap_hud.fields.liteMode.hidden === true, "legacy game_minimap_hud liteMode blijft verborgen");
    assert(minimapNodeSchema.json.nodeTypes.editor_minimap_hud && minimapNodeSchema.json.nodeTypes.editor_minimap_hud.outputs.minimap.dataType === "minimap", "node schema kent editor_minimap_hud met dataType minimap");
    assert(minimapNodeSchema.json.nodeTypes.game_output.inputs.minimap && minimapNodeSchema.json.nodeTypes.game_output.inputs.minimap.dataType === "minimap" && minimapNodeSchema.json.nodeTypes.game_output.inputs.minimap.required === false && minimapNodeSchema.json.nodeTypes.game_output.inputs.minimap.multiple === true, "Game Output heeft optionele, multiple minimap input");
    const scatterNodeSchema = minimapNodeSchema.json.nodeTypes.bounded_area_scatter;
    assert(scatterNodeSchema && scatterNodeSchema.fields.edgeDensity && scatterNodeSchema.fields.edgeDensity.type === "number" && scatterNodeSchema.fields.edgeDensity.editorControl === "range", "bounded_area_scatter heeft edgeDensity slider metadata");
    assert(scatterNodeSchema.fields.edgeDensity.default === 0 && scatterNodeSchema.fields.edgeDensity.min === 0 && scatterNodeSchema.fields.edgeDensity.max === 100 && scatterNodeSchema.fields.edgeDensity.step === 1, "edgeDensity gebruikt 0-100 defaults");
    assert(scatterNodeSchema.fields.sizeInwardInfluence && scatterNodeSchema.fields.sizeInwardInfluence.type === "number" && scatterNodeSchema.fields.sizeInwardInfluence.editorControl === "range", "bounded_area_scatter heeft sizeInwardInfluence slider metadata");
    assert(scatterNodeSchema.fields.sizeInwardInfluence.default === 0 && scatterNodeSchema.fields.sizeInwardInfluence.min === 0 && scatterNodeSchema.fields.sizeInwardInfluence.max === 100 && scatterNodeSchema.fields.sizeInwardInfluence.step === 1, "sizeInwardInfluence gebruikt 0-100 defaults");
    assert(scatterNodeSchema.fields.sizeCurve && scatterNodeSchema.fields.sizeCurve.type === "select" && scatterNodeSchema.fields.sizeCurve.default === "linear", "bounded_area_scatter heeft sizeCurve default");
    assert(Array.isArray(scatterNodeSchema.fields.sizeCurve.options) && scatterNodeSchema.fields.sizeCurve.options.some(function (option) { return option && option.value === "linear"; }) && scatterNodeSchema.fields.sizeCurve.options.some(function (option) { return option && option.value === "smooth"; }) && scatterNodeSchema.fields.sizeCurve.options.some(function (option) { return option && option.value === "steep"; }) && scatterNodeSchema.fields.sizeCurve.options.some(function (option) { return option && option.value === "instant"; }), "sizeCurve biedt linear, smooth, steep en instant");
    assert(scatterNodeSchema.fields.sourceScaleMultipliers && scatterNodeSchema.fields.sourceScaleMultipliers.hidden === true && scatterNodeSchema.fields.sourceScaleMultipliers.type === "json", "bounded_area_scatter heeft per-object scale multipliers");
    assert(scatterNodeSchema.fields.sourceScaleMultipliers.default && Object.keys(scatterNodeSchema.fields.sourceScaleMultipliers.default).length === 0, "sourceScaleMultipliers default is leeg");

    graph = (await createNode("editor_chunk_loading", {})).graph;
    const editorChunkLoadingNode = findNode(graph, function (n) { return n.type === "editor_chunk_loading"; }, "editor chunk loading aangemaakt");

    graph = (await createNode("game_chunk_loading", {
      chunkProfileId: "game_chunks",
      enabled: true,
      chunkWidth: 15,
      chunkDepth: 15,
      tileSize: 1,
      preloadMarginChunks: 1,
      unloadMarginChunks: 1,
      maxLoadedChunks: 9,
      debugOverlay: false,
      groundChunkingEnabled: true,
      pathWaterSurfaceChunkingEnabled: false,
      terrainVisualChunkingEnabled: false,
      cameraOnly: true,
      gameViewRadiusChunks: 1,
      fixedCameraPaddingTiles: 0,
      strictUnloadOutsideCamera: true,
      loadBudgetPerFrame: 2,
      residentChunkBuildBudgetPerFrame: 2,
      residentEntityBudget: 200,
      residentObjectBudget: 300,
      residentScatterInstanceBudget: 500
    })).graph;
    const gameChunkLoadingNode = findNode(graph, function (n) { return n.type === "game_chunk_loading"; }, "game chunk loading aangemaakt");

    graph = await connect(graph, keybindDirect.id, "keybind", gameOutputNode.id, "keybinds");
    graph = await connect(graph, keybindGroup1.id, "keybind", groupNode.id, "keybinds_in");

    graph = await connect(graph, groupInputNode.id, "keybinds_in", groupOutputNode.id, "keybinds_out");

    const legacySnapshot = JSON.parse(JSON.stringify(graph));
    const legacyGroup = findNode(legacySnapshot, function (n) { return n.id === groupNode.id; }, "legacy group snapshot");
    legacyGroup.values.groupInterface.inputs = [];
    const legacyRestore = await call("POST", "/api/editor/graph/restore", { graph: legacySnapshot });
    assert(legacyRestore.status === 200 && legacyRestore.json.ok, "legacy group snapshot met ontbrekende input wordt hersteld");
    graph = legacyRestore.json.graph;
    const repairedGroup = findNode(graph, function (n) { return n.id === groupNode.id; }, "gerepareerde group aanwezig");
    assert((repairedGroup.values.groupInterface.inputs || []).some(function (port) { return port.name === "keybinds_in"; }), "legacy input keybinds_in is hersteld");

    graph = (await createNode("group", { groupId: "group_two", title: "Group Two" }, groupNode.id)).graph;
    const group2Node = findNode(graph, function (n) { return n.type === "group" && n.values.groupId === "group_two"; }, "nested group aangemaakt");
    const group2InputNode = findNode(graph, function (n) { return n.parentId === group2Node.id && n.type === "group_input"; }, "nested group input bestaat");
    const group2OutputNode = findNode(graph, function (n) { return n.parentId === group2Node.id && n.type === "group_output"; }, "nested group output bestaat");
    assert(group2InputNode.parentId === group2Node.id, "nested group input hoort bij Group 2");

    graph = (await createNode("keybind", { bindingId: "kb_group2", action: "move_left", keyCode: "KeyA" }, group2Node.id)).graph;
    const keybindGroup2 = findNode(graph, function (n) { return n.type === "keybind" && n.values.bindingId === "kb_group2"; }, "nested keybind aangemaakt");

    assert(group2OutputNode.parentId === group2Node.id, "nested group output hoort bij Group 2");
    const illegalCrossBoundaryEdge = await call("POST", "/api/editor/edges", {
      edge: { fromNodeId: group2OutputNode.id, fromPort: "keybinds_out", toNodeId: gameOutputNode.id, toPort: "keybinds" }
    });
    assert(illegalCrossBoundaryEdge.status === 400, "cross-boundary edge wordt geweigerd");
    const graphAfterIllegalEdge = await call("GET", "/api/editor/graph");
    assert(!graphAfterIllegalEdge.json.edges.some(function (edge) {
      return edge.fromNodeId === group2OutputNode.id && edge.toNodeId === gameOutputNode.id;
    }), "illegal edge wordt niet opgeslagen");

    graph = await connect(graph, keybindGroup2.id, "keybind", group2OutputNode.id, "keybinds_out");
    graph = await connect(graph, group2Node.id, "keybinds_out", groupOutputNode.id, "keybinds_out");
    graph = await connect(graph, groupNode.id, "keybinds_out", gameOutputNode.id, "keybinds");

    graph = (await createNode("terrain_layer", {
      layerId: "village_grass",
      label: "Village Grass",
      material: "grass",
      priority: 0,
      opacity: 1,
      color: "#6faa4f",
      textureAssetId: null,
      shapeType: "full",
      points: []
    })).graph;
    const terrainLayerNode = findNode(graph, function (n) { return n.type === "terrain_layer" && n.values.layerId === "village_grass"; }, "terrain layer aangemaakt");

    graph = (await createNode("surface_layer", {
      surfaceId: "river_surface_test",
      label: "River Surface Test",
      surfaceKind: "river",
      fallbackColor: "#4a7a3f",
      width: 5,
      yOffset: 0.02,
      textureAssetId: surfaceMainTextureId,
      textureScale: 4,
      textureScaleX: 2.5,
      textureScaleY: -1.5,
      secondaryTextureAssetId: surfaceSecondaryTextureId,
      secondaryTextureScale: 9,
      secondaryTextureScaleX: 3,
      secondaryTextureScaleY: 0.5,
      secondaryTextureStrength: 0.25,
      edgeFadeWidth: 0.8,
      edgeFadeNoiseAssetId: surfaceEdgeNoiseId,
      edgeFadeNoiseScale: 5,
      edgeFadeNoiseScaleX: 10,
      edgeFadeNoiseScaleY: 8,
      edgeFadeNoiseStrength: 0.35,
      opacity: 1,
      animated: true,
      flowSpeed: 0.2,
      flowDirection: 0,
      flowTextureLayer: "main",
      blocksPlayer: false,
      points: [
        { x: 0, z: 20 },
        { x: 15, z: 25 },
        { x: 30, z: 22 }
      ]
    })).graph;
    const surfaceLayerNode = findNode(graph, function (n) { return n.type === "surface_layer" && n.values.surfaceId === "river_surface_test"; }, "surface layer aangemaakt");

    graph = (await createNode("blocker_area", {
      blockerId: "mountain_blocker_01",
      label: "Mountain Blocker",
      shapeType: "polygon",
      x: 0,
      z: 0,
      width: 4,
      depth: 4,
      radius: 2,
      points: [
        { x: -2, z: -1 },
        { x: 2, z: -1 },
        { x: 0, z: 2 }
      ],
      reason: "mountain"
    })).graph;
    const blockerAreaNode = findNode(graph, function (n) { return n.type === "blocker_area" && n.values.blockerId === "mountain_blocker_01"; }, "blocker area aangemaakt");

    const walkableSurfacePoints = [
      { x: -3, y: 0.425, z: -1.25 },
      { x: 3, y: 0.725, z: -1.25 },
      { x: 2.4, y: 0.745, z: 1.25 },
      { x: -2.4, y: 0.505, z: 1.25 }
    ];

    graph = (await createNode("walkable_surface", {
      surfaceId: "bridge_walk_01",
      label: "Bridge Walk Surface",
      x: 0,
      y: 0.6,
      z: 0,
      width: 6,
      depth: 2.5,
      rotationY: 0,
      priority: 10,
      points: walkableSurfacePoints
    })).graph;
    const walkableSurfaceNode = findNode(graph, function (n) { return n.type === "walkable_surface" && n.values.surfaceId === "bridge_walk_01"; }, "walkable surface aangemaakt");

    graph = await connect(graph, worldNode.id, "world", gameOutputNode.id, "world");
    graph = await connect(graph, editorWorldSettingsNode.id, "editorWorldSettings", gameOutputNode.id, "editorWorldSettings");
    graph = await connect(graph, gameWorldSettingsNode.id, "gameWorldSettings", gameOutputNode.id, "gameWorldSettings");
    graph = await connect(graph, groundNode.id, "ground", gameOutputNode.id, "ground");
    graph = await connect(graph, cameraNode.id, "camera", gameOutputNode.id, "camera");
    graph = await connect(graph, ambientNode.id, "light", gameOutputNode.id, "lights");
    graph = await connect(graph, dirNode.id, "light", gameOutputNode.id, "lights");
    graph = await connect(graph, playerNode.id, "player", gameOutputNode.id, "player");
    graph = await connect(graph, spawnNode.id, "spawn", gameOutputNode.id, "spawn");
    graph = await connect(graph, scatterNode.id, "entity", gameOutputNode.id, "entities");
    graph = await connect(graph, terrainLayerNode.id, "terrain", gameOutputNode.id, "terrain");
    graph = await connect(graph, surfaceLayerNode.id, "terrain", gameOutputNode.id, "terrain");
    graph = await connect(graph, blockerAreaNode.id, "collision", gameOutputNode.id, "collision");
    graph = await connect(graph, walkableSurfaceNode.id, "collision", gameOutputNode.id, "collision");
    graph = await connect(graph, hudTextNode.id, "ui", gameOutputNode.id, "ui");
    graph = await connect(graph, perfHudNode.id, "ui", gameOutputNode.id, "ui");
    graph = await connect(graph, disabledPerfHudNode.id, "ui", gameOutputNode.id, "ui");
    graph = await connect(graph, mmoDebugHudNode.id, "ui", gameOutputNode.id, "ui");
    graph = await connect(graph, editorChunkLoadingNode.id, "chunkLoading", gameOutputNode.id, "chunkLoading");
    graph = await connect(graph, gameChunkLoadingNode.id, "chunkLoading", gameOutputNode.id, "chunkLoading");
    graph = await connect(graph, minimapBakeNode.id, "minimap", gameOutputNode.id, "minimap");
    graph = await connect(graph, gameMinimapHudNode.id, "minimap", gameOutputNode.id, "minimap");
    graph = await connect(graph, editorMinimapHudNode.id, "minimap", gameOutputNode.id, "minimap");

    const validate = await call("GET", "/api/editor/validate");
    if (!validate.json.ok) console.error("VALIDATE ERRORS", validate.json.errors);
    assert(validate.status === 200 && validate.json.ok, "validatie is groen");
    assert(Array.isArray(validate.json.warnings) && validate.json.warnings.some(function (message) {
      return String(message || "").includes("chunk size is very small");
    }), "kleine chunk size geeft een waarschuwing");
    assert(Array.isArray(validate.json.warnings) && validate.json.warnings.some(function (message) {
      return String(message || "").includes("nog geen minimap image gebakken");
    }), "validatie waarschuwt dat Game Minimap HUD nog geen gebakken image heeft");
    assert(Array.isArray(validate.json.warnings) && validate.json.warnings.some(function (message) {
      return String(message || "").includes("blocks player but has no dense fill or min spacing");
    }), "scatter boundaryBlocksPlayer zonder dense fill/min spacing geeft minimap-gap waarschuwing");

    const scatterNodeBaseline = JSON.parse(JSON.stringify(scatterNode.values));
    const scatterBasePoints = Array.isArray(scatterNodeBaseline.points) ? scatterNodeBaseline.points : [];

    const antiOverlapWorld = buildScatterWorld(graph, scatterNode.id, {
      count: 30,
      minSpacing: 1.5,
      spacingStrength: 100,
      distributionMode: "blue_noise",
      edgeDensity: 0,
      edgeSpacing: 0,
      edgeJitter: 20
    });
    const antiOverlapPositions = scatterPositionsFor(antiOverlapWorld, scatterNode.id);
    const antiOverlapWarnings = Array.isArray(antiOverlapWorld.scatterAreas) && antiOverlapWorld.scatterAreas[0] ? antiOverlapWorld.scatterAreas[0].placementWarnings || [] : [];
    const antiOverlapMinDistance = scatterPairwiseMinDistance(antiOverlapWorld, scatterNode.id);
    assert(antiOverlapPositions.length > 0, "anti-overlap scatter publiceert instances");
    assert(antiOverlapMinDistance >= 1.5 - 0.01 || antiOverlapWarnings.length > 0, "anti-overlap houdt minSpacing aan of meldt fallback");

    const edgeArclengthWorld = buildScatterWorld(graph, scatterNode.id, {
      count: 24,
      edgeDensity: 100,
      edgeSpacing: 1,
      spacingStrength: 100,
      distributionMode: "random",
      minSpacing: 0,
      edgeJitter: 20
    });
    const edgePositions = scatterPositionsFor(edgeArclengthWorld, scatterNode.id);
    const edgeBoundaryDistances = edgePositions.map(function (position) {
      const boundary = closestPointOnPolygonBoundary(position.x, position.z, scatterBasePoints);
      return boundary ? Math.sqrt(boundary.distanceSq) : Infinity;
    });
    const usedBoundarySegments = new Set(edgePositions.map(function (position) {
      return boundarySegmentIndexForPoint(position, scatterBasePoints);
    }).filter(function (index) {
      return index >= 0;
    }));
    assert(edgePositions.length > 0, "edgeDensity 100 scatter publiceert instances");
    assert(edgeBoundaryDistances.every(function (distance) {
      return distance <= 0.4;
    }), "edgeDensity 100 houdt bomen op de boundary");
    assert(usedBoundarySegments.size >= 3, "edgeDensity 100 gebruikt meerdere boundary segmenten");

    const randomCoverageWorld = buildScatterWorld(graph, scatterNode.id, {
      count: 36,
      minSpacing: 0,
      spacingStrength: 0,
      distributionMode: "random",
      edgeDensity: 0,
      edgeSpacing: 0
    });
    const denseFillWorld = buildScatterWorld(graph, scatterNode.id, {
      count: 36,
      minSpacing: 1.5,
      spacingStrength: 100,
      distributionMode: "dense_fill",
      edgeDensity: 0,
      edgeSpacing: 0,
      edgeJitter: 20
    });
    const randomCoverage = scatterCoverageScore(randomCoverageWorld, scatterNode.id, scatterBasePoints, 10);
    const denseFillCoverage = scatterCoverageScore(denseFillWorld, scatterNode.id, scatterBasePoints, 10);
    assert(denseFillCoverage < randomCoverage, "dense_fill heeft betere coverage dan random");

    const impossibleWorld = buildScatterWorld(graph, scatterNode.id, {
      count: 40,
      minSpacing: 12,
      spacingStrength: 100,
      distributionMode: "blue_noise",
      edgeDensity: 0,
      edgeSpacing: 0,
      edgeJitter: 20
    });
    const impossibleScatterArea = Array.isArray(impossibleWorld.scatterAreas) ? impossibleWorld.scatterAreas[0] || null : null;
    assert(impossibleScatterArea && Array.isArray(impossibleScatterArea.placementWarnings) && impossibleScatterArea.placementWarnings.length > 0, "onmogelijke spacing geeft een duidelijke warning");
    assert(impossibleScatterArea && Number(impossibleScatterArea.placedCount) < 40, "onmogelijke spacing plaatst alleen wat past");

    const draft = await call("POST", "/api/editor/save-draft");
    assert(draft.status === 200 && draft.json.ok, "draft opslaan werkt");
    const draftWorld = await call("GET", "/api/editor/draft-world");
    assert(draftWorld.status === 200, "draft world is beschikbaar");
    assert(draftWorld.json.camera && draftWorld.json.camera.id === "main_cam", "draft world bewaart camera node");
    assert(draftWorld.json.camera && draftWorld.json.camera.pitch === 60 && draftWorld.json.camera.yaw === 0 && draftWorld.json.camera.startDistance === 26 && draftWorld.json.camera.distance === 20 && draftWorld.json.camera.fov === 55, "game camera blijft node-driven na save-draft");
    assert(draftWorld.json.editorCamera && draftWorld.json.editorCamera.id === "editor_cam", "draft world bewaart editor camera node");
    assert(draftWorld.json.editorCamera && draftWorld.json.editorCamera.target && draftWorld.json.editorCamera.target.x === 12 && draftWorld.json.editorCamera.target.y === 3 && draftWorld.json.editorCamera.target.z === -5, "editor camera publiceert target");
    assert(draftWorld.json.world && draftWorld.json.world.fogColor === "#1a2b3c", "draft world publiceert fogColor");
    assert(draftWorld.json.world && draftWorld.json.world.fogDensity === 0.18, "draft world publiceert fogDensity");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.shared.worldId === "demo_world", "draft world publiceert shared worldId");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.shared.displayName === "Demo", "draft world publiceert shared displayName");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.shared.backgroundColor === "#0b1622", "draft world publiceert shared backgroundColor");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.shared.fogColor === "#1a2b3c", "draft world publiceert shared fogColor");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.shared.fogDensity === 0.18, "draft world publiceert shared fogDensity");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.shared.smoothShading === true, "draft world publiceert shared smoothShading");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.compatibility.usedLegacyWorldSettingsPerformanceFields === false, "draft world gebruikt de nieuwe editor/game nodes, geen legacy fallback");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.editor.preset === "hoog_schaduw", "draft world publiceert editor preset");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.editor.debugWarningsVisible === true, "draft world publiceert editor debugWarningsVisible");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.editor.shadow && draftWorld.json.world.performance.editor.shadow.preset === "hoog_schaduw", "draft world publiceert editor shadow block");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.editor.shadow.enabled === true, "draft world zet editor shadows aan");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.editor.shadow.mapSize === 2048, "draft world publiceert editor shadow mapSize");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.editor.shadow.cameraSize === 120, "draft world publiceert editor shadow cameraSize");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.editor.shadow.cameraFar === 600, "draft world publiceert editor shadowCameraFar");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.editor.shadow.staticPropsCast === true, "draft world publiceert editor static prop cast");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.editor.shadow.scatterCast === true, "draft world publiceert editor scatter cast");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.editor.shadow.shadowResidentMarginChunks === 1, "draft world publiceert editor shadow resident margin");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.game.preset === "lichte_schaduw", "draft world publiceert game preset");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.game.debugWarningsVisible === false, "draft world publiceert game debugWarningsVisible");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.game.pixelRatioCap === 1, "draft world publiceert game preset pixelRatioCap");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.game.antialias === true, "draft world publiceert game preset antialias");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.game.shadow && draftWorld.json.world.performance.game.shadow.preset === "lichte_schaduw", "draft world publiceert game shadow block");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.game.shadow.enabled === true, "draft world zet game shadows aan");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.game.shadow.mapSize === 512, "draft world publiceert game shadow mapSize");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.game.shadow.cameraSize === 75, "draft world publiceert game shadow cameraSize");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.game.shadow.cameraFar === 350, "draft world publiceert game shadowCameraFar");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.game.shadow.staticPropsCast === true, "draft world publiceert game static prop cast");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.game.shadow.scatterCast === false, "draft world publiceert game scatter cast uit");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.game.shadow.shadowResidentMarginChunks === 0, "draft world publiceert game shadow resident margin");
    assert(draftWorld.json.chunkLoading && draftWorld.json.chunkLoading.editor && draftWorld.json.chunkLoading.game, "draft world publiceert chunkLoading read-model");
    assert(draftWorld.json.chunkLoading.editor.type === "editor" && draftWorld.json.chunkLoading.game.type === "game", "draft world scheidt editor en game chunk loading");
    assert(draftWorld.json.chunkLoading.editor.chunkWidth === 100, "editor chunk width is 100");
    assert(draftWorld.json.chunkLoading.game.chunkWidth === 15, "game chunk width is 15");
    assert(draftWorld.json.chunkLoading.editor.editorViewRadiusChunks > draftWorld.json.chunkLoading.game.gameViewRadiusChunks, "editor radius is groter dan game radius");
    assert(draftWorld.json.chunkLoading.game.cameraOnly === true, "game chunkLoading cameraOnly staat aan");
    assert(draftWorld.json.chunkLoading.game.strictUnloadOutsideCamera === true, "game chunkLoading strict unload staat aan");
    assert(draftWorld.json.chunkLoading.game.residentEntityBudget === 200, "game chunkLoading publiceert residentEntityBudget");
    assert(draftWorld.json.chunkLoading.game.residentObjectBudget === 300, "game chunkLoading publiceert residentObjectBudget");
    assert(draftWorld.json.chunkLoading.game.residentScatterInstanceBudget === 500, "game chunkLoading publiceert residentScatterInstanceBudget");
    assert(draftWorld.json.chunkLoading.game.residentChunkBuildBudgetPerFrame === 2, "game chunkLoading publiceert residentChunkBuildBudgetPerFrame");
    assert(draftWorld.json.collision && Array.isArray(draftWorld.json.collision.walkableSurfaces) && Array.isArray(draftWorld.json.collision.walkableSurfaces[0].points) && draftWorld.json.collision.walkableSurfaces[0].points.length === walkableSurfacePoints.length, "draft world publiceert walkable polygon points");
    assertNear(draftWorld.json.collision.walkableSurfaces[0].points[0].y, 0.425, 0.0001, "draft world bewaart walkable point hoogte");
    assert(Array.isArray(draftWorld.json.scatterAreas) && draftWorld.json.scatterAreas.length === 1, "draft world publiceert één scatter area");
    assert(Array.isArray(draftWorld.json.scatterAreas[0].points) && draftWorld.json.scatterAreas[0].points.length >= 6, "scatter area publiceert polygon points");
    assert(draftWorld.json.scatterAreas[0].boundaryBlocksPlayer === true, "scatter area publiceert boundary flag");
    const initialScatterSignature = scatterSignature(draftWorld.json, scatterNode.id);
    assert(initialScatterSignature.length > 0, "scatter publiceert preview instances in draft world");
    assert((draftWorld.json.entities || []).filter(function (entity) { return entity && entity.nodeId === scatterNode.id; }).length === 6, "draft world publiceert 6 scatter instances");
    const draftOriginalModelEntity = (draftWorld.json.entities || []).find(function (entity) { return entity && entity.nodeId === modelEntityNode.id; }) || null;
    const draftSecondModelEntity = (draftWorld.json.entities || []).find(function (entity) { return entity && entity.nodeId === secondModelEntityNode.id; }) || null;
    const draftDuplicatedModelEntity = (draftWorld.json.entities || []).find(function (entity) { return entity && entity.nodeId === duplicatedModelEntityNode.id; }) || null;
    assert(draftOriginalModelEntity && draftSecondModelEntity && draftDuplicatedModelEntity, "draft world publiceert alle model instances");
    assert(draftDuplicatedModelEntity.walkable === true, "walkable publiceert naar draft world");
    assert(Array.isArray(draftWorld.json.scatterAreas[0].sourceAssetIds) && draftWorld.json.scatterAreas[0].sourceAssetIds.includes(modelId) && draftWorld.json.scatterAreas[0].sourceAssetIds.includes(treeAssetId), "scatter area bewaart bron assets");
    assert(draftWorld.json.scatterAreas[0].seed === "scatter_seed_01" && draftWorld.json.scatterAreas[0].count === 6 && draftWorld.json.scatterAreas[0].enabled === true, "scatter area bewaart instellingen");
    assert(draftWorld.json.minimap && Array.isArray(draftWorld.json.minimap.bakes) && draftWorld.json.minimap.bakes.length === 1, "draft world publiceert 1 minimap bake");
    assert(draftWorld.json.minimap.bakes[0].minimapId === "main_minimap" && draftWorld.json.minimap.bakes[0].bounds && draftWorld.json.minimap.bakes[0].bounds.maxX > draftWorld.json.minimap.bakes[0].bounds.minX, "draft world minimap bake heeft geldige bounds");
    assert(draftWorld.json.minimap.bakes[0].bakedImageUrl === "", "draft world minimap bake heeft nog geen bakedImageUrl");
    assert(draftWorld.json.minimap.game && draftWorld.json.minimap.game.hudId === "game_minimap_main" && draftWorld.json.minimap.game.sourceMinimapId === "main_minimap" && draftWorld.json.minimap.game.debugMode === false && draftWorld.json.minimap.game.liteMode === true, "draft world publiceert minimap.game met debugMode uit");
    assert(draftWorld.json.minimap.editor && draftWorld.json.minimap.editor.hudId === "editor_minimap_main", "draft world publiceert minimap.editor (editor-only preview)");

    graph = await patchNodeValues(scatterNode.id, { seed: "scatter_seed_02" });
    const draftAfterScatterSeedChange = await call("POST", "/api/editor/save-draft");
    assert(draftAfterScatterSeedChange.status === 200 && draftAfterScatterSeedChange.json.ok, "save-draft werkt na seed wijziging");
    const changedDraftWorld = await call("GET", "/api/editor/draft-world");
    assert(changedDraftWorld.status === 200, "draft world blijft beschikbaar na seed wijziging");
    const changedScatterSignature = scatterSignature(changedDraftWorld.json, scatterNode.id);
    assert(changedScatterSignature !== initialScatterSignature, "scatter verandert bij andere seed");

    graph = await patchNodeValues(scatterNode.id, { seed: "scatter_seed_01" });
    const draftAfterScatterSeedReset = await call("POST", "/api/editor/save-draft");
    assert(draftAfterScatterSeedReset.status === 200 && draftAfterScatterSeedReset.json.ok, "save-draft werkt na seed herstel");
    const restoredDraftWorld = await call("GET", "/api/editor/draft-world");
    assert(restoredDraftWorld.status === 200, "draft world blijft beschikbaar na seed herstel");
    const restoredScatterSignature = scatterSignature(restoredDraftWorld.json, scatterNode.id);
    assert(restoredScatterSignature === initialScatterSignature, "scatter is deterministisch per seed");

    const publish = await call("POST", "/api/editor/publish");
    assert(publish.status === 200 && publish.json.ok, "publiceren werkt");
    const draftAfterPublish = await call("GET", "/api/editor/draft-world");
    assert(draftAfterPublish.status === 200 && draftAfterPublish.json.editorCamera && draftAfterPublish.json.editorCamera.id === "editor_cam", "draft world behoudt editor camera na publish");

    const after = await call("GET", "/api/game/world");
    assert(after.status === 200, "game wereld is 200 na publish");
    assert(after.json.camera && after.json.camera.mode === "top-down", "camera is top-down");
    assert(after.json.camera && after.json.camera.id === "main_cam" && after.json.camera.pitch === 60 && after.json.camera.yaw === 0 && after.json.camera.startDistance === 26 && after.json.camera.distance === 20 && after.json.camera.fov === 55, "game camera publiceert nodewaarden");
    assert(!after.json.editorCamera, "editor camera publiceert niet naar /game/");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.shared.worldId === "demo_world", "game world publiceert shared worldId");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.shared.displayName === "Demo", "game world publiceert shared displayName");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.shared.backgroundColor === "#0b1622", "game world publiceert shared backgroundColor");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.shared.fogColor === "#1a2b3c", "game world publiceert shared fogColor");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.shared.fogDensity === 0.18, "game world publiceert shared fogDensity");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.shared.smoothShading === true, "game world publiceert shared smoothShading");
    assert(after.json.world && after.json.world.fogColor === "#1a2b3c", "game world publiceert fogColor");
    assert(after.json.world && after.json.world.fogDensity === 0.18, "game world publiceert fogDensity");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.compatibility.usedLegacyWorldSettingsPerformanceFields === false, "game world gebruikt de nieuwe editor/game nodes, geen legacy fallback");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.editor.preset === "hoog_schaduw", "game world publiceert editor preset");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.editor.debugWarningsVisible === true, "game world publiceert editor debugWarningsVisible");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.editor.pixelRatioCap === 2, "game world publiceert editor preset pixelRatioCap");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.editor.shadow && after.json.world.performance.editor.shadow.preset === "hoog_schaduw", "game world publiceert editor shadow block");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.editor.shadow.enabled === true, "game world zet editor shadows aan");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.editor.shadow.mapSize === 2048, "game world publiceert editor shadow mapSize");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.editor.shadow.cameraSize === 120, "game world publiceert editor shadowCameraSize");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.editor.shadow.cameraFar === 600, "game world publiceert editor shadow distance");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.editor.shadow.staticPropsCast === true, "game world publiceert editor static prop cast");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.editor.shadow.scatterCast === true, "game world publiceert editor scatter cast");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.editor.shadow.shadowResidentMarginChunks === 1, "game world publiceert editor shadow resident margin");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.game.preset === "lichte_schaduw", "game world publiceert game preset");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.game.debugWarningsVisible === false, "game world publiceert game debugWarningsVisible");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.game.pixelRatioCap === 1, "game world publiceert game preset pixelRatioCap");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.game.shadow && after.json.world.performance.game.shadow.preset === "lichte_schaduw", "game world publiceert game shadow block");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.game.shadow.enabled === true, "game world zet game shadows aan");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.game.shadow.mapSize === 512, "game world publiceert game shadow mapSize");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.game.shadow.cameraSize === 75, "game world publiceert game shadow cameraSize");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.game.shadow.cameraFar === 350, "game world publiceert game shadow distance");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.game.shadow.staticPropsCast === true, "game world publiceert game static prop cast");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.game.shadow.scatterCast === false, "game world publiceert game scatter cast uit");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.game.shadow.shadowResidentMarginChunks === 0, "game world publiceert game shadow resident margin");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.editor && after.json.world.performance.editor.fogEnabled === false, "game world behoudt editor fog toggle in draft data");
    assert(after.json.chunkLoading && after.json.chunkLoading.editor && after.json.chunkLoading.game, "game world publiceert chunkLoading");
    assert(after.json.chunkLoading.editor.type === "editor" && after.json.chunkLoading.game.type === "game", "game world scheidt editor en game chunk loading");
    assert(after.json.chunkLoading.editor.chunkProfileId === "editor_chunks", "editor chunk profile is gepubliceerd");
    assert(after.json.chunkLoading.game.chunkProfileId === "game_chunks", "game chunk profile is gepubliceerd");
    assert(after.json.chunkLoading.game.chunkWidth === 15, "game chunk width is 15 na publish");
    assert(after.json.chunkLoading.game.residentEntityBudget === 200, "game chunkLoading publiceert residentEntityBudget na publish");
    assert(after.json.chunkLoading.game.residentObjectBudget === 300, "game chunkLoading publiceert residentObjectBudget na publish");
    assert(after.json.chunkLoading.game.residentScatterInstanceBudget === 500, "game chunkLoading publiceert residentScatterInstanceBudget na publish");
    assert(after.json.chunkLoading.game.residentChunkBuildBudgetPerFrame === 2, "game chunkLoading publiceert residentChunkBuildBudgetPerFrame na publish");
    const publishedEditorChunkPolicy = resolveChunkPolicy(after.json, "editor");
    const publishedGameChunkPolicy = resolveChunkPolicy(after.json, "game");
    assert(publishedEditorChunkPolicy.source === "editor", "runtime helper kiest de editor chunk policy uit published world");
    assert(publishedGameChunkPolicy.source === "game", "runtime helper kiest de game chunk policy uit published world");
    const publishedEditorWindow = buildChunkWindow({ x: 0, z: 0 }, publishedEditorChunkPolicy, "editor");
    const publishedGameWindow = buildChunkWindow({ x: 0, z: 0 }, publishedGameChunkPolicy, "game");
    assert(publishedEditorWindow.loadedChunks.length > publishedGameWindow.loadedChunks.length, "published editor policy blijft ruimer dan game policy");
    const editorShadowPolicy = resolveShadowPolicy(after.json, "editor");
    const gameShadowPolicy = resolveShadowPolicy(after.json, "game");
    assert(editorShadowPolicy.enabled === true, "editor shadow policy volgt editor toggle");
    assert(editorShadowPolicy.preset === "hoog_schaduw", "editor shadow policy gebruikt hoog_schaduw");
    assert(editorShadowPolicy.mapSize === 2048, "editor shadow policy gebruikt hoog mapSize");
    assert(gameShadowPolicy.enabled === true, "game shadow policy volgt game toggle");
    assert(gameShadowPolicy.preset === "lichte_schaduw", "game shadow policy gebruikt lichte_schaduw");
    assert(gameShadowPolicy.mapSize === 512, "game shadow policy gebruikt lichte mapSize");
    assert(after.json.player && after.json.player.modelAssetId === modelId, "speler verwijst naar geuploade model");
    assert(after.json.player && after.json.player.animationClip === "Idle", "speler publiceert gekozen animationClip");
    assert(after.json.player && after.json.player.idleAnimation === "Idle", "speler publiceert idleAnimation");
    assert(after.json.player && after.json.player.walkAnimation === "Walk", "speler publiceert walkAnimation");
    assert(after.json.player && after.json.player.runAnimation === "Run", "speler publiceert runAnimation");
    assert(after.json.spawn && after.json.spawn.x === 0, "spawn aanwezig");
    assert(Array.isArray(after.json.entities) && after.json.entities.some(function (entity) { return entity.animationClip === "Walk"; }), "entities publiceren gekozen animationClip");
    const publishedOriginalModelEntity = Array.isArray(after.json.entities)
      ? after.json.entities.find(function (entity) { return entity.nodeId === modelEntityNode.id; })
      : null;
    const publishedSecondModelEntity = Array.isArray(after.json.entities)
      ? after.json.entities.find(function (entity) { return entity.nodeId === secondModelEntityNode.id; })
      : null;
    const publishedDuplicatedModelEntity = Array.isArray(after.json.entities)
      ? after.json.entities.find(function (entity) { return entity.nodeId === duplicatedModelEntityNode.id; })
      : null;
    assert(publishedOriginalModelEntity && publishedSecondModelEntity && publishedDuplicatedModelEntity, "alle model instances zijn gepubliceerd");
    assert(publishedOriginalModelEntity.id !== publishedSecondModelEntity.id && publishedOriginalModelEntity.id !== publishedDuplicatedModelEntity.id && publishedSecondModelEntity.id !== publishedDuplicatedModelEntity.id, "elk gepubliceerde model krijgt een unieke runtime id");
    assert(publishedOriginalModelEntity.idleAnimation === "Idle", "eerste entity publiceert idleAnimation");
    assert(publishedOriginalModelEntity.walkAnimation === "Walk", "eerste entity publiceert walkAnimation");
    assert(publishedOriginalModelEntity.runAnimation === "Run", "eerste entity publiceert runAnimation");
    assert(publishedOriginalModelEntity.transform && publishedOriginalModelEntity.transform.rotation.x === 10 && publishedOriginalModelEntity.transform.rotation.y === 20 && publishedOriginalModelEntity.transform.rotation.z === 30, "eerste entity publiceert rotationX/Y/Z");
    assert(publishedSecondModelEntity.transform && publishedSecondModelEntity.transform.rotation.x === -5 && publishedSecondModelEntity.transform.rotation.y === 45 && publishedSecondModelEntity.transform.rotation.z === 12, "tweede drop publiceert eigen rotation");
    assert(publishedDuplicatedModelEntity.transform && publishedDuplicatedModelEntity.transform.rotation.x === 15 && publishedDuplicatedModelEntity.transform.rotation.y === 90 && publishedDuplicatedModelEntity.transform.rotation.z === -10, "duplicate publiceert eigen rotation");
    assert(publishedDuplicatedModelEntity.walkable === true, "walkable publiceert naar game runtime");
    assert((after.json.entities || []).filter(function (entity) { return entity && entity.nodeId === scatterNode.id; }).length === 6, "scatter publiceert count instances");
    assert(scatterSignature(after.json, scatterNode.id) === initialScatterSignature, "scatter blijft deterministisch in game runtime");
    assert(Array.isArray(after.json.scatterAreas) && after.json.scatterAreas.length === 1, "scatter area publiceert metadata");
    assert(after.json.scatterAreas[0].seed === "scatter_seed_01" && after.json.scatterAreas[0].count === 6 && after.json.scatterAreas[0].enabled === true, "scatter area publiceert instellingen");
    assert(after.json.scatterAreas[0].boundaryBlocksPlayer === true, "scatter area publiceert boundary flag");
    assert(Array.isArray(after.json.scatterAreas[0].sourceAssetIds) && after.json.scatterAreas[0].sourceAssetIds.includes(modelId) && after.json.scatterAreas[0].sourceAssetIds.includes(treeAssetId), "scatter area publiceert bron assets");
    assert(Array.isArray(after.json.scatterAreas[0].points) && after.json.scatterAreas[0].points.length >= 6, "scatter area publiceert polygon punten");
    const publishedWalkability = createWalkabilityIndex(after.json);
    assert(isPointBlockedByTerrain(publishedWalkability, 8, -4, 0.5), "scatter boundary blokkeert speler binnen polygon");
    assert(!isPointBlockedByTerrain(publishedWalkability, 40, 40, 0.5), "scatter boundary blokkeert speler buiten polygon niet");
    assert(Array.isArray(after.json.keybinds) && after.json.keybinds.length === 3, "keybinds uit root en beide groups zijn mee gepubliceerd");
    const publishedKeybindIds = new Set(after.json.keybinds.map(function (entry) { return entry.id; }));
    assert(publishedKeybindIds.has("kb_direct"), "directe keybind is gepubliceerd");
    assert(publishedKeybindIds.has("kb_group1"), "Group 1 keybind is gepubliceerd");
    assert(publishedKeybindIds.has("kb_group2"), "Group 2 keybind is gepubliceerd");
    assert(after.json.assets.some(function (a) { return a.id === modelId; }), "asset manifest bevat model");
    const publishedAssetIds = new Set((after.json.assets || []).map(function (asset) { return asset.id; }));
    assert(publishedAssetIds.has(surfaceMainTextureId), "asset manifest bevat surface main texture");
    assert(publishedAssetIds.has(surfaceSecondaryTextureId), "asset manifest bevat surface secondary texture");
    assert(publishedAssetIds.has(surfaceEdgeNoiseId), "asset manifest bevat surface edge noise texture");
    assert(after.json.terrain && Array.isArray(after.json.terrain.layers) && after.json.terrain.layers.length === 1, "terrain layers zijn gepubliceerd");
    assert(after.json.terrain.layers[0].id === "village_grass" && after.json.terrain.layers[0].material === "grass", "terrain layer publiceert metadata");
    assert(Array.isArray(after.json.terrain.layers[0].points) && after.json.terrain.layers[0].points.length === 0, "terrain layer publiceert lege points array");
    assert(Array.isArray(after.json.terrain.surfaces) && after.json.terrain.surfaces.length === 1, "surface layers zijn gepubliceerd");
    assert(after.json.terrain.surfaces[0].id === "river_surface_test", "surface layer publiceert id");
    assert(after.json.terrain.surfaces[0].surfaceKind === "river", "surface layer publiceert surfaceKind");
    assert(after.json.terrain.surfaces[0].fallbackColor === "#4a7a3f", "surface layer publiceert fallbackColor");
    assert(after.json.terrain.surfaces[0].width === 5, "surface layer publiceert width");
    assert(after.json.terrain.surfaces[0].yOffset === 0.02, "surface layer publiceert yOffset");
    assert(after.json.terrain.surfaces[0].textureAssetId === surfaceMainTextureId, "surface layer publiceert textureAssetId");
    assert(after.json.terrain.surfaces[0].textureScale === 4, "surface layer publiceert textureScale");
    assert(after.json.terrain.surfaces[0].textureScaleX === 2.5, "surface layer publiceert textureScaleX");
    assert(after.json.terrain.surfaces[0].textureScaleY === -1.5, "surface layer publiceert textureScaleY (negatief = flip)");
    assert(after.json.terrain.surfaces[0].secondaryTextureAssetId === surfaceSecondaryTextureId, "surface layer publiceert secondaryTextureAssetId");
    assert(after.json.terrain.surfaces[0].secondaryTextureScale === 9, "surface layer publiceert secondaryTextureScale (backwards compat)");
    assert(after.json.terrain.surfaces[0].secondaryTextureScaleX === 3, "surface layer publiceert secondaryTextureScaleX");
    assert(after.json.terrain.surfaces[0].secondaryTextureScaleY === 0.5, "surface layer publiceert secondaryTextureScaleY");
    assert(after.json.terrain.surfaces[0].secondaryTextureStrength === 0.25, "surface layer publiceert secondaryTextureStrength");
    assert(after.json.terrain.surfaces[0].edgeFadeWidth === 0.8, "surface layer publiceert edgeFadeWidth");
    assert(after.json.terrain.surfaces[0].edgeFadeNoiseAssetId === surfaceEdgeNoiseId, "surface layer publiceert edgeFadeNoiseAssetId");
    assert(after.json.terrain.surfaces[0].edgeFadeNoiseScale === 5, "surface layer publiceert edgeFadeNoiseScale (backwards compat)");
    assert(after.json.terrain.surfaces[0].edgeFadeNoiseScaleX === 10, "surface layer publiceert edgeFadeNoiseScaleX");
    assert(after.json.terrain.surfaces[0].edgeFadeNoiseScaleY === 8, "surface layer publiceert edgeFadeNoiseScaleY");
    assert(after.json.terrain.surfaces[0].edgeFadeNoiseStrength === 0.35, "surface layer publiceert edgeFadeNoiseStrength");
    assert(after.json.terrain.surfaces[0].animated === true, "surface layer publiceert animated");
    assert(after.json.terrain.surfaces[0].flowSpeed === 0.2, "surface layer publiceert flowSpeed");
    assert(after.json.terrain.surfaces[0].flowDirection === 0, "surface layer publiceert flowDirection");
    assert(after.json.terrain.surfaces[0].flowTextureLayer === "main", "surface layer publiceert flowTextureLayer");
    assert(after.json.terrain.surfaces[0].blocksPlayer === false, "surface layer publiceert blocksPlayer");
    assert(Array.isArray(after.json.terrain.surfaces[0].points) && after.json.terrain.surfaces[0].points.length === 3, "surface layer publiceert points");
    assert(after.json.terrain.surfaces[0].textureAssetId === surfaceMainTextureId, "surface layer publiceert textureAssetId");
    const publishedCollisionBlockers = after.json.collision && Array.isArray(after.json.collision.blockers) ? after.json.collision.blockers : [];
    assert(publishedCollisionBlockers.length === 2, "collision blockers zijn gepubliceerd");
    const publishedMountainBlocker = publishedCollisionBlockers.find(function (entry) { return entry && entry.reason === "mountain"; }) || null;
    const publishedScatterBlocker = publishedCollisionBlockers.find(function (entry) { return entry && entry.reason === "scatter_forest_patch"; }) || null;
    assert(publishedMountainBlocker && Array.isArray(publishedMountainBlocker.points) && publishedMountainBlocker.points.length === 3, "blocker area publiceert polygon points");
    assert(publishedMountainBlocker && publishedMountainBlocker.reason === "mountain", "blocker area publiceert reason");
    assert(publishedScatterBlocker && Array.isArray(publishedScatterBlocker.points) && publishedScatterBlocker.points.length >= 6, "scatter boundary publiceert polygon points");
    assert(publishedScatterBlocker && publishedScatterBlocker.reason === "scatter_forest_patch", "scatter boundary publiceert reason");

    // MMO-01-FIX-2: boundaryBlocksPlayer op een Bounded Area Scatter moet beweging er echt doorheen tegenhouden.
    const scatterBoundaryOutside = { x: -20, y: 0, z: -3 };
    const scatterBoundaryInsideTarget = { x: 8, y: 0, z: -3 };
    assert(!isPointBlockedByBlocker(publishedWalkability, scatterBoundaryOutside.x, scatterBoundaryOutside.z, 0.5), "startpunt buiten de scatter boundary is niet geblokkeerd");
    assert(isPointBlockedByBlocker(publishedWalkability, scatterBoundaryInsideTarget.x, scatterBoundaryInsideTarget.z, 0.5), "doelpunt binnen de scatter boundary is geblokkeerd");
    const scatterBoundaryMove = resolveMovement(
      scatterBoundaryOutside,
      scatterBoundaryInsideTarget,
      { radius: 0.5, ground: after.json.ground, solids: [], index: publishedWalkability }
    );
    assert(!isPointBlockedByBlocker(publishedWalkability, scatterBoundaryMove.x, scatterBoundaryMove.z, 0.5), "resolveMovement laat de speler niet door de scatter boundary heen lopen");
    const scatterBoundaryTraveled = Math.hypot(scatterBoundaryMove.x - scatterBoundaryOutside.x, scatterBoundaryMove.z - scatterBoundaryOutside.z);
    const scatterBoundaryDesired = Math.hypot(scatterBoundaryInsideTarget.x - scatterBoundaryOutside.x, scatterBoundaryInsideTarget.z - scatterBoundaryOutside.z);
    assert(scatterBoundaryTraveled < scatterBoundaryDesired - 1, "beweging naar de scatter boundary stopt ruim voor het volledige doel");

    assert(Array.isArray(after.json.collision.walkableSurfaces) && after.json.collision.walkableSurfaces.length === 1, "walkable surfaces zijn gepubliceerd");
    assert(after.json.collision.walkableSurfaces[0].width === 6 && after.json.collision.walkableSurfaces[0].depth === 2.5, "walkable surface publiceert afmetingen");
    assert(Array.isArray(after.json.collision.walkableSurfaces[0].points) && after.json.collision.walkableSurfaces[0].points.length === walkableSurfacePoints.length, "walkable surface publiceert polygon points");
    assertNear(after.json.collision.walkableSurfaces[0].points[1].y, 0.725, 0.0001, "walkable surface publiceert point hoogte");
    assert(!isPointOnWalkableSurface(publishedWalkability, 2.8, 1.2), "gepubliceerde walkable surface gebruikt polygon vorm");
    const walkableSurfaceMove = resolveMovement(
      { x: -4, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { radius: 0.5, ground: after.json.ground, solids: [], index: publishedWalkability }
    );
    assertNear(walkableSurfaceMove.y, 0.6, 0.0001, "gepubliceerde walkable surface zet speler op geinterpoleerde hoogte");
    assert(Array.isArray(after.json.ui) && after.json.ui.some(function (entry) { return entry.type === "hud_text" && entry.id === "hud_status"; }), "ui_hud_text blijft gepubliceerd");
    const publishedPerformanceHud = Array.isArray(after.json.ui) ? after.json.ui.find(function (entry) { return entry.id === "perf_hud_main"; }) : null;
    assert(publishedPerformanceHud && publishedPerformanceHud.type === "debug_performance_hud" && publishedPerformanceHud.enabled === true && publishedPerformanceHud.anchor === "top-right" && publishedPerformanceHud.compact === true && publishedPerformanceHud.updateIntervalMs === 500, "debug_performance_hud publiceert read-model");
    assert(publishedPerformanceHud && publishedPerformanceHud.metrics && publishedPerformanceHud.metrics.showFps === true && publishedPerformanceHud.metrics.showCollisionShapes === true && publishedPerformanceHud.metrics.showWorldSize === true, "debug_performance_hud publiceert metrics");
    assert(publishedPerformanceHud && publishedPerformanceHud.metrics && publishedPerformanceHud.metrics.showScatterInstances === true, "debug_performance_hud publiceert showScatterInstances");
    assert(publishedPerformanceHud && publishedPerformanceHud.thresholds && publishedPerformanceHud.thresholds.fpsWarn === 45 && publishedPerformanceHud.thresholds.drawCallsDanger === 140 && publishedPerformanceHud.thresholds.collisionShapesDanger === 150, "debug_performance_hud publiceert thresholds");
    const publishedDisabledPerformanceHud = Array.isArray(after.json.ui) ? after.json.ui.find(function (entry) { return entry.id === "perf_hud_disabled"; }) : null;
    assert(publishedDisabledPerformanceHud && publishedDisabledPerformanceHud.type === "debug_performance_hud" && publishedDisabledPerformanceHud.enabled === false, "disabled performance HUD publiceert disabled config");
    assert(!Array.isArray(after.json.ui) || !after.json.ui.some(function (entry) { return entry.id === "perf_hud_ghost"; }), "ongekoppelde performance HUD wordt niet gepubliceerd");

    // MMO-01-FIX-4: Debug MMO HUD is een echte node, geen hardcoded panel.
    const publishedMmoDebugHud = Array.isArray(after.json.ui) ? after.json.ui.find(function (entry) { return entry.id === "mmo_debug_main"; }) : null;
    assert(publishedMmoDebugHud && publishedMmoDebugHud.type === "debug_mmo_hud" && publishedMmoDebugHud.enabled === true, "debug_mmo_hud publiceert read-model");
    assert(publishedMmoDebugHud && publishedMmoDebugHud.anchor === "bottom-left" && publishedMmoDebugHud.compact === false && publishedMmoDebugHud.startCollapsed === false, "debug_mmo_hud publiceert anchor/compact/startCollapsed");
    assert(publishedMmoDebugHud && publishedMmoDebugHud.show && publishedMmoDebugHud.show.wsStatus === true && publishedMmoDebugHud.show.session === false && publishedMmoDebugHud.show.sessions === false && publishedMmoDebugHud.show.lastSource === false, "debug_mmo_hud publiceert per-veld show-flags");
    assert(publishedMmoDebugHud && publishedMmoDebugHud.show && publishedMmoDebugHud.show.lastSentSeq === true && publishedMmoDebugHud.show.lastAckedSeq === true && publishedMmoDebugHud.show.serverSeq === true, "debug_mmo_hud publiceert seq-velden");
    assert(publishedMmoDebugHud && publishedMmoDebugHud.show && publishedMmoDebugHud.show.pendingInputs === false && publishedMmoDebugHud.show.controller === false && publishedMmoDebugHud.show.lastTransport === false && publishedMmoDebugHud.show.lastIgnored === false, "debug_mmo_hud publiceert verborgen extra velden");
    assert(!Array.isArray(after.json.ui) || !after.json.ui.some(function (entry) { return entry.id === "mmo_debug_ghost"; }), "ongekoppelde debug_mmo_hud wordt niet gepubliceerd");

    // MMO-03: minimap read-model op published /api/game/world.
    assert(after.json.minimap && Array.isArray(after.json.minimap.bakes) && after.json.minimap.bakes.length === 1, "published world publiceert minimap bakes");
    assert(after.json.minimap.bakes[0].minimapId === "main_minimap", "published minimap bake heeft juiste minimapId");
    assert(after.json.minimap.game && after.json.minimap.game.hudId === "game_minimap_main" && after.json.minimap.game.anchor === "top-right" && after.json.minimap.game.debugMode === false && after.json.minimap.game.liteMode === true, "published world publiceert minimap.game met debugMode uit");
    assert(!("editor" in after.json.minimap), "published world bevat geen minimap.editor (editor-only config)");
    assert(!after.json.minimap.bakes.some(function (b) { return b.minimapId === "ghost_minimap"; }), "ongekoppelde minimap bake wordt niet gepubliceerd");

    graph = await patchNodeValues(minimapBakeNode.id, {
      bakedImageUrl: "/assets/minimap-bakes/fake-main-minimap.webp",
      bakedImageWidth: 1024,
      bakedImageHeight: 1024,
      bakedAt: new Date().toISOString(),
      bakedWorldHash: "fake-hash",
      bakedBounds: { minX: -32, maxX: 32, minZ: -32, maxZ: 32, width: 64, depth: 64 }
    });
    const publishAfterFakeBake = await call("POST", "/api/editor/publish");
    assert(publishAfterFakeBake.status === 200 && publishAfterFakeBake.json.ok, "publiceren werkt na fake bake patch");
    assert(!publishAfterFakeBake.json.validation.warnings.some(function (message) {
      return String(message || "").includes("nog geen minimap image gebakken");
    }), "warning voor ongebakken minimap verdwijnt zodra bakedImageUrl gezet is");
    const afterFakeBake = await call("GET", "/api/game/world");
    assert(afterFakeBake.status === 200 && afterFakeBake.json.minimap.bakes[0].bakedImageUrl === "/assets/minimap-bakes/fake-main-minimap.webp", "fake bakedImageUrl blijft intact door draft/publish");
    assert(afterFakeBake.json.minimap.bakes[0].bakedImageWidth === 1024 && afterFakeBake.json.minimap.bakes[0].bakedImageHeight === 1024, "baked afmetingen blijven intact door draft/publish");

    graph = (await createNode("minimap_bake", {
      minimapId: "main_minimap",
      label: "Duplicate Minimap",
      enabled: true
    })).graph;
    const duplicateMinimapBakeNode = findNode(graph, function (n) { return n.type === "minimap_bake" && n.values.label === "Duplicate Minimap"; }, "duplicate minimap bake aangemaakt");
    assert(duplicateMinimapBakeNode.values.minimapId !== "main_minimap", "node aanmaken uniquificeert minimapId automatisch (main_minimap_2)");
    graph = await connect(graph, duplicateMinimapBakeNode.id, "minimap", gameOutputNode.id, "minimap");
    // PATCH omzeilt de create-time auto-uniquify, zodat we de echte duplicate-id-bij-publish situatie
    // kunnen testen (bv. iemand typt het minimapId veld in de inspector handmatig terug naar "main_minimap").
    graph = await patchNodeValues(duplicateMinimapBakeNode.id, { minimapId: "main_minimap" });
    const validateDuplicateMinimap = await call("GET", "/api/editor/validate");
    assert(!validateDuplicateMinimap.json.ok && Array.isArray(validateDuplicateMinimap.json.errors) && validateDuplicateMinimap.json.errors.some(function (message) {
      return String(message || "").includes("meerdere enabled Minimap Bake nodes");
    }), "duplicate enabled minimapId geeft een harde validatiefout");
    graph = await patchNodeValues(duplicateMinimapBakeNode.id, { enabled: false });
    const validateAfterDisableDuplicate = await call("GET", "/api/editor/validate");
    assert(validateAfterDisableDuplicate.status === 200 && validateAfterDisableDuplicate.json.ok, "validatie is weer groen nadat de duplicate minimap bake is uitgeschakeld");

    const minimapBakeNoAuthForm = new FormData();
    minimapBakeNoAuthForm.append("nodeId", minimapBakeNode.id);
    minimapBakeNoAuthForm.append("minimapId", "main_minimap");
    minimapBakeNoAuthForm.append("resolution", "64");
    minimapBakeNoAuthForm.append("file", buildTinyPngBlob(10, 20, 30, 255), "minimap.png");
    const minimapBakeNoAuth = await call("POST", "/api/editor/minimap-bakes", minimapBakeNoAuthForm, true, createCookieJar());
    assert(minimapBakeNoAuth.status === 401, "POST /api/editor/minimap-bakes zonder auth faalt");

    const minimapBakeForm = new FormData();
    minimapBakeForm.append("nodeId", minimapBakeNode.id);
    minimapBakeForm.append("minimapId", "main_minimap");
    minimapBakeForm.append("worldHash", "smoke-test-hash");
    minimapBakeForm.append("resolution", "64");
    minimapBakeForm.append("width", "64");
    minimapBakeForm.append("height", "64");
    minimapBakeForm.append("format", "png");
    minimapBakeForm.append("bounds", JSON.stringify({ minX: -32, maxX: 32, minZ: -32, maxZ: 32 }));
    minimapBakeForm.append("file", buildTinyPngBlob(40, 90, 140, 255), "minimap.png");
    const minimapBakeUpload = await call("POST", "/api/editor/minimap-bakes", minimapBakeForm, true);
    assert(minimapBakeUpload.status === 201 && minimapBakeUpload.json.ok, "POST /api/editor/minimap-bakes met geldige auth en PNG slaat het bestand op");
    assert(typeof minimapBakeUpload.json.bakedImageUrl === "string" && minimapBakeUpload.json.bakedImageUrl.startsWith("/assets/minimap-bakes/"), "response bevat bakedImageUrl onder /assets/minimap-bakes/");
    cleanupAssetPaths.add(minimapBakeUpload.json.bakedImageUrl.split("?")[0]);
    const bakedNodeAfterUpload = findNode(minimapBakeUpload.json.graph, function (n) { return n.id === minimapBakeNode.id; }, "minimap bake node na echte upload");
    assert(bakedNodeAfterUpload.values.bakedImageUrl === minimapBakeUpload.json.bakedImageUrl, "node values worden gepatcht met de echte bakedImageUrl");
    assert(bakedNodeAfterUpload.values.bakedImageWidth === 64 && bakedNodeAfterUpload.values.bakedImageHeight === 64, "node values bevatten de echte baked afmetingen");
    const bakedFileResponse = await fetch(BASE + minimapBakeUpload.json.bakedImageUrl.split("?")[0]);
    assert(bakedFileResponse.status === 200, "de gebakken minimap image wordt publiek geserveerd via /assets/");

    const minimapBakeTooLargeForm = new FormData();
    minimapBakeTooLargeForm.append("nodeId", minimapBakeNode.id);
    minimapBakeTooLargeForm.append("minimapId", "main_minimap");
    minimapBakeTooLargeForm.append("resolution", "64");
    minimapBakeTooLargeForm.append("file", new Blob([new Uint8Array(48 * 1024 * 1024 + 10)], { type: "image/png" }), "too-large.png");
    const minimapBakeTooLarge = await call("POST", "/api/editor/minimap-bakes", minimapBakeTooLargeForm, true);
    assert(minimapBakeTooLarge.status === 400, "minimap bake upload groter dan 48MB wordt geweigerd");

    const minimapBakeWrongMimeForm = new FormData();
    minimapBakeWrongMimeForm.append("nodeId", minimapBakeNode.id);
    minimapBakeWrongMimeForm.append("minimapId", "main_minimap");
    minimapBakeWrongMimeForm.append("resolution", "64");
    minimapBakeWrongMimeForm.append("file", buildJsonBlob({ not: "an image" }), "fake.png");
    const minimapBakeWrongMime = await call("POST", "/api/editor/minimap-bakes", minimapBakeWrongMimeForm, true);
    assert(minimapBakeWrongMime.status === 400, "minimap bake upload met verkeerd bestandstype wordt geweigerd");

    graph = (await createNode("editor_chunk_loading", {
      chunkProfileId: "editor_chunks_ghost",
      enabled: false,
      chunkWidth: 250,
      chunkDepth: 250,
      tileSize: 2,
      editorViewRadiusChunks: 5,
      preloadMarginChunks: 1,
      unloadMarginChunks: 3,
      maxLoadedChunks: 25,
      keepSelectedChunkLoaded: false,
      showChunkGrid: false,
      showChunkLabels: true,
      debugOverlay: false
    })).graph;
    const ghostEditorChunkLoadingNode = findNode(graph, function (n) {
      return n.type === "editor_chunk_loading" && n.values.chunkProfileId === "editor_chunks_ghost";
    }, "ongekoppelde editor chunk loading aangemaakt");

    const publishAfterGhostChunkLoading = await call("POST", "/api/editor/publish");
    assert(publishAfterGhostChunkLoading.status === 200 && publishAfterGhostChunkLoading.json.ok, "publiceren werkt met losse editor chunk loading node");
    const afterGhostChunkLoading = await call("GET", "/api/game/world");
    assert(afterGhostChunkLoading.status === 200, "game world blijft beschikbaar met losse chunk loading node");
    assert(afterGhostChunkLoading.json.chunkLoading && afterGhostChunkLoading.json.chunkLoading.editor && afterGhostChunkLoading.json.chunkLoading.editor.id === editorChunkLoadingNode.id, "losse editor chunk loading node wordt niet gepubliceerd");
    assert(!afterGhostChunkLoading.json.chunkLoading || !afterGhostChunkLoading.json.chunkLoading.editor || afterGhostChunkLoading.json.chunkLoading.editor.chunkProfileId === "editor_chunks", "originele editor chunk loading blijft leidend");

    graph = (await createNode("game_chunk_loading", {
      chunkProfileId: "game_chunks_alt",
      enabled: true,
      chunkWidth: 100,
      chunkDepth: 100,
      tileSize: 1,
      cameraOnly: true,
      gameViewRadiusChunks: 1,
      fixedCameraPaddingTiles: 10,
      preloadMarginChunks: 1,
      unloadMarginChunks: 1,
      maxLoadedChunks: 9,
      strictUnloadOutsideCamera: true,
      loadBudgetPerFrame: 2,
      debugOverlay: false
    })).graph;
    const secondGameChunkLoadingNode = findNode(graph, function (n) {
      return n.type === "game_chunk_loading" && n.values.chunkProfileId === "game_chunks_alt";
    }, "tweede game chunk loading aangemaakt");
    graph = await connect(graph, secondGameChunkLoadingNode.id, "chunkLoading", gameOutputNode.id, "chunkLoading");
    const publishWithTwoChunkLoadingNodes = await call("POST", "/api/editor/publish");
    assert(publishWithTwoChunkLoadingNodes.status === 200 && publishWithTwoChunkLoadingNodes.json.ok, "publiceren werkt met meerdere game chunk loading nodes");
    assert(Array.isArray(publishWithTwoChunkLoadingNodes.json.validation.warnings) && publishWithTwoChunkLoadingNodes.json.validation.warnings.some(function (message) {
      return message.includes("meerdere Game Chunk Loading nodes");
    }), "validatie waarschuwt voor meerdere game chunk loading nodes");
    const afterTwoChunkLoadingNodes = await call("GET", "/api/game/world");
    assert(afterTwoChunkLoadingNodes.status === 200, "game world blijft beschikbaar met meerdere chunk loading nodes");
    assert(afterTwoChunkLoadingNodes.json.chunkLoading && afterTwoChunkLoadingNodes.json.chunkLoading.game && afterTwoChunkLoadingNodes.json.chunkLoading.game.id === gameChunkLoadingNode.id, "eerste game chunk loading node wordt gebruikt");
    assert(afterTwoChunkLoadingNodes.json.chunkLoading.game.chunkProfileId === "game_chunks", "eerste game chunk loading waarden blijven leidend");
    assert(afterTwoChunkLoadingNodes.json.chunkLoading.game.chunkWidth === 15, "eerste game chunk loading chunk width blijft 15");

    const renamedAssetName = "Wizard Prime";
    const renamedAssetCategory = "characters";
    const patchAsset = await call("PATCH", "/api/assets/" + modelId, { name: renamedAssetName, category: renamedAssetCategory });
    assert(patchAsset.status === 200 && patchAsset.json.ok, "asset metadata patch werkt");
    assert(patchAsset.json.asset.name === renamedAssetName && patchAsset.json.asset.category === renamedAssetCategory, "PATCH /api/assets/:id geeft bijgewerkte naam en categorie");
    assert(patchAsset.json.asset.sourcePath.includes("wizard-prime"), "renamed sourcePath gebruikt nieuwe slug");
    if (patchAsset.json.asset.thumbnailPath) {
      assert(patchAsset.json.asset.thumbnailPath.includes("wizard-prime"), "renamed thumbnailPath gebruikt nieuwe slug");
    }
    assert(patchAsset.json.asset.sourcePath !== wizardSourcePathBeforeRename, "oude Wizard sourcePath is niet meer primair");
    if (wizardThumbnailPathBeforeRename && patchAsset.json.asset.thumbnailPath) {
      assert(patchAsset.json.asset.thumbnailPath !== wizardThumbnailPathBeforeRename, "oude Wizard thumbnailPath is niet meer primair");
    }
    const assetsAfterPatch = await call("GET", "/api/assets");
    const patchedAsset = assetsAfterPatch.json.assets.find(function (asset) { return asset.id === modelId; });
    assert(patchedAsset && patchedAsset.name === renamedAssetName && patchedAsset.category === renamedAssetCategory, "GET /api/assets toont gewijzigde naam en categorie");
    assert(patchedAsset && patchedAsset.sourcePath.includes("wizard-prime"), "GET /api/assets toont nieuwe sourcePath");
    if (patchedAsset && patchedAsset.thumbnailPath) {
      assert(patchedAsset.thumbnailPath.includes("wizard-prime"), "GET /api/assets toont nieuwe thumbnailPath");
    }

    const unusedUpload = await uploadAsset({
      name: "Unused Config",
      category: "misc",
      assetType: "data",
      blob: buildJsonBlob({ hello: "world" }),
      filename: "unused-config.json"
    });
    assert(unusedUpload.status === 201 && unusedUpload.json.asset, "ongebruikte data asset upload werkt");
    rememberAssetPaths(unusedUpload.json.asset);
    const unusedAssetId = unusedUpload.json.asset.id;
    const deleteUnused = await call("DELETE", "/api/assets/" + unusedAssetId);
    assert(deleteUnused.status === 200 && deleteUnused.json.ok, "ongebruikte asset kan veilig verwijderd worden");
    assert(Array.isArray(deleteUnused.json.assets) && !deleteUnused.json.assets.some(function (asset) { return asset.id === unusedAssetId; }), "verwijderde ongebruikte asset verdwijnt uit lijst");

    const usageResponse = await call("GET", "/api/assets/" + modelId + "/usage");
    assert(usageResponse.status === 200 && usageResponse.json.ok, "usage endpoint werkt voor gebruikte asset");
    assert(Array.isArray(usageResponse.json.usage) && usageResponse.json.usage.some(function (entry) {
      return entry.nodeId === playerNode.id && entry.fieldKey === "modelAssetId";
    }) && usageResponse.json.usage.some(function (entry) {
      return entry.nodeId === modelEntityNode.id && entry.fieldKey === "modelAssetId";
    }), "usage lijst bevat player_character en model_entity");

    const deleteUsed = await call("DELETE", "/api/assets/" + modelId);
    assert(deleteUsed.status === 409 && Array.isArray(deleteUsed.json.usage) && deleteUsed.json.usage.length >= 2, "gebruikte asset wordt geblokkeerd bij delete");

    const replacementUpload = await uploadAsset({
      name: "Wizard New",
      category: "characters",
      assetType: "model",
      blob: await buildThumbnailGlb(),
      filename: "wizard-new.glb"
    });
    assert(replacementUpload.status === 201 && replacementUpload.json.asset, "replacement model upload werkt");
    rememberAssetPaths(replacementUpload.json.asset);
    const replacementAssetId = replacementUpload.json.asset.id;
    assert(replacementUpload.json.asset.sourcePath.includes("wizard-new.glb"), "replacement sourcePath gebruikt asset slug");
    assert(replacementUpload.json.asset.metadata.thumbnailStatus === "pending" || replacementUpload.json.asset.metadata.thumbnailStatus === "processing", "replacement thumbnail start async");
    assert(replacementUpload.json.asset.thumbnailPath === null, "replacement upload response wacht niet op thumbnailPath");
    const replacementAssetsAfterUpload = await call("GET", "/api/assets");
    const replacementFromList = replacementAssetsAfterUpload.json.assets.find(function (asset) { return asset.id === replacementAssetId; });
    assert(replacementFromList && (replacementFromList.metadata.thumbnailStatus === "pending" || replacementFromList.metadata.thumbnailStatus === "processing"), "replacement status blijft pending/processing in /api/assets");
    if (replacementUpload.json.asset.thumbnailPath) {
      assert(replacementUpload.json.asset.thumbnailPath.includes("wizard-new.png"), "replacement thumbnailPath gebruikt asset slug");
      const thumbnailResponse = await fetch(BASE + replacementUpload.json.asset.thumbnailPath);
      assert(thumbnailResponse.status === 200, "GLB thumbnail wordt publiek geserveerd");
      assert((thumbnailResponse.headers.get("content-type") || "").includes("image/png"), "GLB thumbnail is PNG");
      const thumbnailBytes = new Uint8Array(await thumbnailResponse.arrayBuffer());
      assert(thumbnailBytes.length > 8 && thumbnailBytes[0] === 0x89 && thumbnailBytes[1] === 0x50 && thumbnailBytes[2] === 0x4e && thumbnailBytes[3] === 0x47, "GLB thumbnail heeft PNG signature");
    }

    const replaceUsed = await call("POST", "/api/assets/" + modelId + "/replace", { replacementAssetId: replacementAssetId });
    assert(replaceUsed.status === 200 && replaceUsed.json.ok, "asset replace werkt");
    assert(Array.isArray(replaceUsed.json.replaced) && replaceUsed.json.replaced.length >= 2, "replace response bevat vervangingen");
    const replacedGraph = replaceUsed.json.graph || {};
    const replacedPlayerNode = findNode(replacedGraph, function (n) { return n.id === playerNode.id; }, "player node na replace");
    const replacedModelEntityNode = findNode(replacedGraph, function (n) { return n.id === modelEntityNode.id; }, "model entity na replace");
    assert(replacedPlayerNode.values.modelAssetId === replacementAssetId, "player_character verwijst na replace naar nieuwe asset");
    assert(replacedModelEntityNode.values.modelAssetId === replacementAssetId, "model_entity verwijst na replace naar nieuwe asset");

    const usageAfterReplace = await call("GET", "/api/assets/" + modelId + "/usage");
    assert(usageAfterReplace.status === 200 && Array.isArray(usageAfterReplace.json.usage) && usageAfterReplace.json.usage.length === 0, "oude asset heeft na replace geen usage meer");

    const deleteOld = await call("DELETE", "/api/assets/" + modelId);
    assert(deleteOld.status === 200 && deleteOld.json.ok, "oude asset kan na replace verwijderd worden");
    assert(Array.isArray(deleteOld.json.assets) && !deleteOld.json.assets.some(function (asset) { return asset.id === modelId; }), "oude asset verdwijnt uit lijst na delete");

    const mismatchGroup = (await createNode("group", { groupId: "group_mismatch", title: "Mismatch Group" })).graph;
    const mismatchGroupNode = findNode(mismatchGroup, function (n) { return n.type === "group" && n.values.groupId === "group_mismatch"; }, "mismatch group aangemaakt");
    const mismatchPatched = await patchNodeValues(mismatchGroupNode.id, {
      groupInterface: {
        inputs: [],
        outputs: [
          { id: "output_ui", name: "ui_out", label: "UI", dataType: "ui" }
        ]
      }
    });
    const mismatchGraph = mismatchPatched.graph || mismatchPatched;
    const mismatchGroupNodeAfterPatch = findNode(mismatchGraph, function (n) { return n.id === mismatchGroupNode.id; }, "mismatch group gepatcht");
    const mismatchEdge = await call("POST", "/api/editor/edges", {
      edge: { fromNodeId: mismatchGroupNodeAfterPatch.id, fromPort: "ui_out", toNodeId: groupNode.id, toPort: "keybinds_in" }
    });
    assert(mismatchEdge.status === 400 && mismatchEdge.text.includes("Poorttypes passen niet"), "type mismatch group->group wordt geweigerd");

    const cycleGroupA = (await createNode("group", { groupId: "cycle_a", title: "Cycle A" })).graph;
    const cycleAGroupNode = findNode(cycleGroupA, function (n) { return n.type === "group" && n.values.groupId === "cycle_a"; }, "cycle group A aangemaakt");
    const cycleAOutputNode = findNode(cycleGroupA, function (n) { return n.parentId === cycleAGroupNode.id && n.type === "group_output"; }, "cycle A output bestaat");
    graph = (await createNode("keybind", { bindingId: "kb_cycle_a", action: "move_back", keyCode: "KeyS" }, cycleAGroupNode.id)).graph;
    const cycleAKeybind = findNode(graph, function (n) { return n.type === "keybind" && n.values.bindingId === "kb_cycle_a"; }, "cycle A keybind aangemaakt");
    graph = await connect(graph, cycleAKeybind.id, "keybind", cycleAOutputNode.id, "keybinds_out");

    graph = (await createNode("group", { groupId: "cycle_b", title: "Cycle B" })).graph;
    const cycleBGroupNode = findNode(graph, function (n) { return n.type === "group" && n.values.groupId === "cycle_b"; }, "cycle group B aangemaakt");
    const cycleBOutputNode = findNode(graph, function (n) { return n.parentId === cycleBGroupNode.id && n.type === "group_output"; }, "cycle B output bestaat");
    graph = (await createNode("keybind", { bindingId: "kb_cycle_b", action: "move_right", keyCode: "KeyD" }, cycleBGroupNode.id)).graph;
    const cycleBKeybind = findNode(graph, function (n) { return n.type === "keybind" && n.values.bindingId === "kb_cycle_b"; }, "cycle B keybind aangemaakt");
    graph = await connect(graph, cycleBKeybind.id, "keybind", cycleBOutputNode.id, "keybinds_out");
    graph = await connect(graph, cycleAGroupNode.id, "keybinds_out", cycleBGroupNode.id, "keybinds_in");
    graph = await connect(graph, cycleBGroupNode.id, "keybinds_out", cycleAGroupNode.id, "keybinds_in");
    graph = await connect(graph, cycleAGroupNode.id, "keybinds_out", gameOutputNode.id, "keybinds");

    const cycleValidation = await call("GET", "/api/editor/validate");
    assert(cycleValidation.status === 200 && !cycleValidation.json.ok && cycleValidation.json.errors.some(function (message) {
      return message.includes("Group connection cycle detected");
    }), "group cycle faalt validatie");

    // MMO-01 regressieproof: account, multi-sessie, auth, WebSocket sync en persistence.
    const mmoUsername = "test_mmo_01";
    const mmoPassword = "mmo_01_password";
    const pcJar = createCookieJar();
    const mobileJar = createCookieJar();
    const badJar = createCookieJar();
    const anonymousJar = createCookieJar();

    const registerPc = await call("POST", "/api/auth/register", {
      identifier: mmoUsername,
      password: mmoPassword,
      deviceLabel: "pc"
    }, false, pcJar);
    assert(registerPc.status === 201 && registerPc.json.ok === true && registerPc.json.user && registerPc.json.user.username === mmoUsername, "MMO register maakt nieuw account aan en logt direct in");
    assert(registerPc.json.user.password_hash === undefined, "register response lekt geen password_hash");

    const duplicateRegister = await call("POST", "/api/auth/register", {
      identifier: mmoUsername,
      password: mmoPassword,
      deviceLabel: "mobile"
    }, false, mobileJar);
    assert(duplicateRegister.status === 409, "duplicate register wordt netjes geweigerd");

    const loginMobile = await call("POST", "/api/auth/login", {
      identifier: mmoUsername,
      password: mmoPassword,
      deviceLabel: "mobile"
    }, false, mobileJar);
    assert(loginMobile.status === 200 && loginMobile.json.ok === true && loginMobile.json.user && loginMobile.json.user.username === mmoUsername, "login op tweede device werkt");

    const badLogin = await call("POST", "/api/auth/login", {
      identifier: mmoUsername,
      password: "wrong_password",
      deviceLabel: "bad"
    }, false, badJar);
    assert(badLogin.status === 401, "verkeerde credentials falen netjes");

    const mePc = await call("GET", "/api/auth/me", null, false, pcJar);
    assert(mePc.status === 200 && mePc.json.user && mePc.json.user.username === mmoUsername && !("password_hash" in mePc.json.user), "/api/auth/me geeft huidige user zonder password_hash");

    const gameRequiresAuth = await call("GET", "/api/game/player", null, false, anonymousJar);
    assert(gameRequiresAuth.status === 401, "game/player vereist login");

    const unauthenticatedSocketProbe = await probeUnauthenticatedGameSocket();
    assert(unauthenticatedSocketProbe.kind !== "open" && (unauthenticatedSocketProbe.statusCode === 401 || unauthenticatedSocketProbe.kind === "unexpected-response" || unauthenticatedSocketProbe.kind === "error"), "WebSocket weigert anonieme verbinding");

    const playerLoadPc = await call("GET", "/api/game/player", null, false, pcJar);
    assert(playerLoadPc.status === 200 && playerLoadPc.json.player && playerLoadPc.json.position && playerLoadPc.json.spawn, "eerste game start maakt/laadt player profile en positie");
    assert(playerLoadPc.json.position.playerId === playerLoadPc.json.player.id, "player position hoort bij het player profile");
    assert(playerLoadPc.json.position.revision === 1, "eerste player positie krijgt revision 1");
    assert(playerLoadPc.json.position.sourceSessionId === playerLoadPc.json.session.id, "eerste player positie bewaart sourceSessionId van de sessie");
    assert(playerLoadPc.json.activeSessionCount === 2, "twee actieve sessies zijn toegestaan voor hetzelfde account");

    const playerLoadMobile = await call("GET", "/api/game/player", null, false, mobileJar);
    assert(playerLoadMobile.status === 200 && playerLoadMobile.json.player && playerLoadMobile.json.position, "tweede sessie leest dezelfde player state");
    assert(playerLoadMobile.json.player.id === playerLoadPc.json.player.id, "beide sessies delen hetzelfde player profile");
    assert(playerLoadMobile.json.position.playerId === playerLoadPc.json.player.id, "beide sessies delen dezelfde player entity");
    assert(playerLoadMobile.json.position.x === playerLoadPc.json.position.x && playerLoadMobile.json.position.z === playerLoadPc.json.position.z, "beide sessies starten op dezelfde serverpositie");
    assert(playerLoadMobile.json.activeSessionCount === 2, "tweede login verwijdert eerste sessie niet");

    const wsPc = createGameSocketClient(pcJar, "mmo-pc");
    await wsPc.opened;
    const wsPcReady = await wsPc.waitForMessage(function (message) { return message.type === "connection:ready"; });
    const wsPcState = await wsPc.waitForMessage(function (message) { return message.type === "player:state"; });
    assert(wsPcReady.sessionId === playerLoadPc.json.session.id, "WebSocket auth gebruikt de huidige sessiecookie");
    assert(wsPcReady.playerId === playerLoadPc.json.player.id, "WebSocket krijgt server-side playerId");
    assert(wsPcReady.position.playerId === playerLoadPc.json.player.id, "connection:ready publiceert dezelfde player position");
    assert(wsPcState.position.sourceSessionId === playerLoadPc.json.session.id, "player:state gebruikt server-side sourceSessionId");
    assert(wsPcReady.connectedSessionCount === 1, "eerste WebSocket telt als één connected session");

    const wsMobile = createGameSocketClient(mobileJar, "mmo-mobile");
    await wsMobile.opened;
    const wsMobileReady = await wsMobile.waitForMessage(function (message) { return message.type === "connection:ready"; });
    const wsMobileState = await wsMobile.waitForMessage(function (message) { return message.type === "player:state"; });
    assert(wsMobileReady.sessionId === playerLoadMobile.json.session.id, "tweede WebSocket gebruikt eigen sessie");
    assert(wsMobileReady.playerId === playerLoadPc.json.player.id, "tweede WebSocket deelt dezelfde player");
    assert(wsMobileReady.connectedSessionCount === 2, "beide sessions zijn tegelijk connected");
    assert(wsMobileState.position.playerId === playerLoadPc.json.player.id, "tweede WebSocket ziet dezelfde player entity");

    const presenceOnPc = await wsPc.waitForMessage(function (message) {
      return message.type === "player:presence" && message.connected === true && message.connectedSessionCount === 2;
    });
    assert(presenceOnPc.sessionId === playerLoadMobile.json.session.id, "presence meldt de tweede sessie");
    const pcClientSessionId = "mmo-smoke-pc-client";
    const mobileClientSessionId = "mmo-smoke-mobile-client";
    const sharedPlayerId = playerLoadPc.json.player.id;
    const sharedWorldId = playerLoadPc.json.worldId;

    const remoteUsername = "test_mmo_02_remote";
    const remotePassword = "mmo_02_password";
    const remoteJar = createCookieJar();
    const remoteRegister = await call("POST", "/api/auth/register", {
      identifier: remoteUsername,
      password: remotePassword,
      deviceLabel: "remote"
    }, false, remoteJar);
    assert(remoteRegister.status === 201 && remoteRegister.json && remoteRegister.json.ok === true, "remote account kan registreren en inloggen");
    const remotePlayerLoad = await call("GET", "/api/game/player", null, false, remoteJar);
    assert(remotePlayerLoad.status === 200 && remotePlayerLoad.json && remotePlayerLoad.json.player, "remote account kan /api/game/player laden");
    assert(remotePlayerLoad.json.worldId === sharedWorldId, "remote account landt in dezelfde world");
    assert(remotePlayerLoad.json.player.id !== sharedPlayerId, "remote account krijgt een ander player id");
    const remoteWorldId = sharedWorldId;

    const remoteJoinOnPcPromise = wsPc.waitForMessage(function (message) {
      return message.type === "remote_player:joined" && message.playerId === remotePlayerLoad.json.player.id && message.worldId === remoteWorldId;
    });
    const remoteJoinOnMobilePromise = wsMobile.waitForMessage(function (message) {
      return message.type === "remote_player:joined" && message.playerId === remotePlayerLoad.json.player.id && message.worldId === remoteWorldId;
    });
    const wsRemote = createGameSocketClient(remoteJar, "mmo-remote");
    await wsRemote.opened;
    const remoteReady = await wsRemote.waitForMessage(function (message) { return message.type === "connection:ready"; });
    const remoteState = await wsRemote.waitForMessage(function (message) { return message.type === "player:state"; });
    const remoteSnapshot = await wsRemote.waitForMessage(function (message) { return message.type === "world:presence_snapshot"; });
    const [remoteJoinOnPc, remoteJoinOnMobile] = await Promise.all([remoteJoinOnPcPromise, remoteJoinOnMobilePromise]);
    assert(remoteReady.worldId === sharedWorldId, "remote connection:ready is world-scoped");
    assert(remoteReady.playerId === remotePlayerLoad.json.player.id, "remote connection:ready gebruikt het remote player id");
    assert(remoteState.position.worldId === sharedWorldId, "remote player:state is world-scoped");
    assert(remoteSnapshot.worldId === sharedWorldId, "presence snapshot is world-scoped");
    assert(Array.isArray(remoteSnapshot.players) && remoteSnapshot.players.length === 1, "remote presence snapshot toont precies één andere avatar");
    const remoteSnapshotA = findSnapshotPlayer(remoteSnapshot, sharedPlayerId);
    assert(remoteSnapshotA !== null, "remote presence snapshot bevat account A");
    assert(remoteSnapshotA.connectedSessionCount === 2, "remote presence snapshot dedupliceert A tot één avatar met twee sessies");
    assert(remoteSnapshotA.isSelfAccount === false, "remote presence snapshot markeert A als niet-self");
    assert(remoteSnapshot.players.every(function (player) { return player.worldId === sharedWorldId; }), "presence snapshot is worldId-scoped");
    assert(remoteSnapshot.players.every(function (player) { return player.playerId !== remotePlayerLoad.json.player.id; }), "presence snapshot bevat geen eigen player als remote avatar");
    assert(new Set(remoteSnapshot.players.map(function (player) { return player.playerId; })).size === remoteSnapshot.players.length, "presence snapshot bevat geen dubbele player ids");
    assert(remoteJoinOnPc.playerId === remotePlayerLoad.json.player.id, "A ziet B via remote_player:joined");
    assert(remoteJoinOnMobile.playerId === remotePlayerLoad.json.player.id, "tweede A-sessie ziet B ook via remote_player:joined");
    assert(remoteJoinOnPc.worldId === remoteWorldId && remoteJoinOnMobile.worldId === remoteWorldId, "remote_player:joined is world-scoped");
    assert(remoteJoinOnPc.connectedSessionCount === 1, "remote_player:joined meldt één connected session");
    assert(remoteJoinOnPc.isSelfAccount === false, "remote_player:joined markeert isSelfAccount=false");
    assertNoForbiddenKeys(remoteJoinOnPc, "remote_player:joined");
    assertNoForbiddenKeys(remoteJoinOnMobile, "remote_player:joined (tweede sessie)");
    assertNoForbiddenKeys(remoteSnapshot, "world:presence_snapshot");

    const pcMovementSnapshotPromise = wsPc.waitForMessage(function (message) {
      const player = findSnapshotPlayer(message, sharedPlayerId);
      return message.type === "mmo:snapshot" && message.worldId === sharedWorldId && player && Number(player.lastProcessedInputSeq || 0) >= 1;
    });
    const mobileMovementSnapshotPromise = wsMobile.waitForMessage(function (message) {
      const player = findSnapshotPlayer(message, sharedPlayerId);
      return message.type === "mmo:snapshot" && message.worldId === sharedWorldId && player && Number(player.lastProcessedInputSeq || 0) >= 1;
    });
    const remoteMovementSnapshotPromise = wsRemote.waitForMessage(function (message) {
      const player = findSnapshotPlayer(message, sharedPlayerId);
      return message.type === "mmo:snapshot" && message.worldId === sharedWorldId && player && Number(player.lastProcessedInputSeq || 0) >= 1;
    });
    sendInputState(wsPc, {
      clientSessionId: pcClientSessionId,
      inputSeq: 1,
      controllerEpoch: 1,
      input: {
        moveX: 1,
        moveZ: 0,
        sprint: false,
        pointerTarget: null,
        stop: false
      }
    });
    const [pcMovementSnapshot, mobileMovementSnapshot, remoteMovementSnapshot] = await Promise.all([
      pcMovementSnapshotPromise,
      mobileMovementSnapshotPromise,
      remoteMovementSnapshotPromise
    ]);
    const pcMovementPlayer = findSnapshotPlayer(pcMovementSnapshot, sharedPlayerId);
    const mobileMovementPlayer = findSnapshotPlayer(mobileMovementSnapshot, sharedPlayerId);
    const remoteMovementPlayer = findSnapshotPlayer(remoteMovementSnapshot, sharedPlayerId);
    assert(pcMovementSnapshot.protocolVersion === 3, "normale movement gebruikt protocolVersion 3 snapshots");
    assert(pcMovementSnapshot.worldId === sharedWorldId, "mmo:snapshot is world-scoped");
    assert(pcMovementSnapshot.players.length === 1, "normale movement verstuurt alleen changed players");
    assert(pcMovementPlayer !== null, "mmo:snapshot bevat het gedeelde player id");
    assert(pcMovementPlayer.activeControllerSessionId === wsPcReady.sessionId, "pc is de actieve controller na input_state");
    assert(pcMovementPlayer.controllerEpoch === 1, "controllerEpoch reist mee in de snapshot");
    assert(pcMovementPlayer.lastProcessedInputSeq === 1, "lastProcessedInputSeq ack't de eerste input");
    assert(pcMovementPlayer.moving === true, "normale movement zet moving=true in de snapshot");
    assert(pcMovementPlayer.animationState === "walk" || pcMovementPlayer.animationState === "run", "normale movement zet walk/run in de snapshot");
    assert(pcMovementPlayer.teleport === false, "normale movement is geen teleport");
    assert(mobileMovementPlayer !== null && mobileMovementPlayer.activeControllerSessionId === wsPcReady.sessionId, "mobile ontvangt dezelfde authoritative snapshot");
    assert(remoteMovementPlayer !== null && remoteMovementPlayer.activeControllerSessionId === wsPcReady.sessionId, "remote observer ontvangt dezelfde authoritative snapshot");
    assert(wsPc.messages.some(function (message) {
      const player = findSnapshotPlayer(message, sharedPlayerId);
      return message.type === "mmo:snapshot" && message.worldId === sharedWorldId && player && Number(player.lastProcessedInputSeq || 0) >= 1;
    }), "normale movement loopt via mmo:snapshot");
    assert(wsMobile.messages.some(function (message) {
      const player = findSnapshotPlayer(message, sharedPlayerId);
      return message.type === "mmo:snapshot" && message.worldId === sharedWorldId && player && Number(player.lastProcessedInputSeq || 0) >= 1;
    }), "tweede session ontvangt dezelfde mmo:snapshot");
    assert(wsRemote.messages.some(function (message) {
      const player = findSnapshotPlayer(message, sharedPlayerId);
      return message.type === "mmo:snapshot" && message.worldId === sharedWorldId && player && Number(player.lastProcessedInputSeq || 0) >= 1;
    }), "remote observer ontvangt dezelfde mmo:snapshot");

    const stalePcIgnoredPromise = wsPc.waitForMessage(function (message) {
      return message.type === "player:input_ignored" && message.reason === "stale_input_seq" && message.clientSessionId === pcClientSessionId;
    });
    sendInputState(wsPc, {
      clientSessionId: pcClientSessionId,
      inputSeq: 1,
      controllerEpoch: 1,
      input: {
        moveX: 0,
        moveZ: 0,
        sprint: false,
        pointerTarget: null,
        stop: false
      }
    });
    const stalePcIgnored = await stalePcIgnoredPromise;
    assert(stalePcIgnored.clientSessionId === pcClientSessionId, "stale input echo't clientSessionId");
    assert(stalePcIgnored.clientInputSeq === 1, "stale input echo't clientInputSeq");
    assert(stalePcIgnored.controllerEpoch === 1, "stale input echo't controllerEpoch");
    assert(stalePcIgnored.transport === "ws", "stale input meldt transport=ws");

    const mobileTakeoverSnapshotPromise = wsPc.waitForMessage(function (message) {
      const player = findSnapshotPlayer(message, sharedPlayerId);
      return message.type === "mmo:snapshot" && message.worldId === sharedWorldId && Number(message.snapshotSeq || 0) > Number(pcMovementSnapshot.snapshotSeq || 0) && player && player.activeControllerSessionId === wsMobileReady.sessionId;
    });
    const mobileTakeoverRemotePromise = wsRemote.waitForMessage(function (message) {
      const player = findSnapshotPlayer(message, sharedPlayerId);
      return message.type === "mmo:snapshot" && message.worldId === sharedWorldId && Number(message.snapshotSeq || 0) > Number(pcMovementSnapshot.snapshotSeq || 0) && player && player.activeControllerSessionId === wsMobileReady.sessionId;
    });
    const mobileTakeoverMobilePromise = wsMobile.waitForMessage(function (message) {
      const player = findSnapshotPlayer(message, sharedPlayerId);
      return message.type === "mmo:snapshot" && message.worldId === sharedWorldId && Number(message.snapshotSeq || 0) > Number(pcMovementSnapshot.snapshotSeq || 0) && player && player.activeControllerSessionId === wsMobileReady.sessionId;
    });
    sendInputState(wsMobile, {
      clientSessionId: mobileClientSessionId,
      inputSeq: 1,
      controllerEpoch: 2,
      input: {
        moveX: 0,
        moveZ: 1,
        sprint: true,
        pointerTarget: null,
        stop: false
      }
    });
    const [mobileTakeoverSnapshot, mobileTakeoverRemote, mobileTakeoverMobile] = await Promise.all([
      mobileTakeoverSnapshotPromise,
      mobileTakeoverRemotePromise,
      mobileTakeoverMobilePromise
    ]);
    const mobileTakeoverPlayer = findSnapshotPlayer(mobileTakeoverSnapshot, sharedPlayerId);
    const mobileTakeoverRemotePlayer = findSnapshotPlayer(mobileTakeoverRemote, sharedPlayerId);
    const mobileTakeoverMobilePlayer = findSnapshotPlayer(mobileTakeoverMobile, sharedPlayerId);
    assert(mobileTakeoverPlayer !== null, "takeover snapshot bevat de gedeelde player");
    assert(mobileTakeoverPlayer.activeControllerSessionId === wsMobileReady.sessionId, "laatste actieve controller wint op mobile");
    assert(mobileTakeoverPlayer.controllerEpoch >= 1, "controllerEpoch neemt over op mobile");
    assert(mobileTakeoverPlayer.moving === true, "mobile takeover houdt beweging actief");
    assert(mobileTakeoverPlayer.animationState === "walk" || mobileTakeoverPlayer.animationState === "run", "mobile takeover zet walk/run in de snapshot");
    assert(mobileTakeoverRemotePlayer !== null && mobileTakeoverRemotePlayer.activeControllerSessionId === wsMobileReady.sessionId, "remote observer ziet mobile als actieve controller");
    assert(mobileTakeoverMobilePlayer !== null && mobileTakeoverMobilePlayer.activeControllerSessionId === wsMobileReady.sessionId, "mobile ziet zijn eigen takeover snapshot");

    sendInputState(wsPc, {
      clientSessionId: pcClientSessionId,
      inputSeq: 2,
      controllerEpoch: 1,
      input: {
        moveX: 0,
        moveZ: 0,
        sprint: false,
        pointerTarget: null,
        stop: true
      }
    });
    await sleep(500);
    const latestSnapshotAfterOldStop = findLatestMessage(wsRemote.messages, function (message) {
      return message.type === "mmo:snapshot" && message.worldId === sharedWorldId && findSnapshotPlayer(message, sharedPlayerId);
    });
    const latestPlayerAfterOldStop = findSnapshotPlayer(latestSnapshotAfterOldStop, sharedPlayerId);
    assert(latestPlayerAfterOldStop !== null, "oude stop laat minstens één snapshot achter");
    assert(latestPlayerAfterOldStop.activeControllerSessionId === wsMobileReady.sessionId, "oude idle input van een vorig device zet de actieve controller niet terug");
    assert(latestPlayerAfterOldStop.moving === true, "oude idle input stopt de actieve controller niet");

    const mobileStopSnapshotPromise = wsRemote.waitForMessage(function (message) {
      const player = findSnapshotPlayer(message, sharedPlayerId);
      return message.type === "mmo:snapshot" && message.worldId === sharedWorldId && Number(message.snapshotSeq || 0) > Number(mobileTakeoverSnapshot.snapshotSeq || 0) && player && player.moving === false;
    });
    sendInputState(wsMobile, {
      clientSessionId: mobileClientSessionId,
      inputSeq: 2,
      controllerEpoch: 2,
      input: {
        moveX: 0,
        moveZ: 0,
        sprint: false,
        pointerTarget: null,
        stop: true
      }
    });
    const mobileStopSnapshot = await mobileStopSnapshotPromise;
    const mobileStopPlayer = findSnapshotPlayer(mobileStopSnapshot, sharedPlayerId);
    assert(mobileStopPlayer !== null, "stop snapshot bevat de gedeelde player");
    assert(mobileStopPlayer.activeControllerSessionId === wsMobileReady.sessionId, "stop snapshot blijft op de nieuwe actieve controller");
    assert(mobileStopPlayer.moving === false, "stop snapshot zet moving=false");
    assert(mobileStopPlayer.animationState === "idle", "stop snapshot zet animationState idle");

    const persistedDeadline = Date.now() + 5000;
    let persistedRow = null;
    while (Date.now() < persistedDeadline) {
      persistedRow = readPlayerPosition(dbPath, playerLoadPc.json.player.id, playerLoadPc.json.worldId);
      if (persistedRow && persistedRow.player_id === sharedPlayerId && persistedRow.world_id === sharedWorldId && Math.abs(Number(persistedRow.x || 0) - Number(mobileStopPlayer.x || 0)) <= 0.001) {
        break;
      }
      await sleep(200);
    }
    assert(persistedRow && persistedRow.player_id === sharedPlayerId && persistedRow.world_id === sharedWorldId, "player position wordt server-side in de database bewaard");
    assertNear(persistedRow.x, mobileStopPlayer.x, 0.001, "database bevat de laatste officiële x-positie");

    const refreshPc = await call("GET", "/api/game/player", null, false, pcJar);
    const refreshMobile = await call("GET", "/api/game/player", null, false, mobileJar);
    assertNear(refreshPc.json.position.x, persistedRow.x, 0.001, "refresh op pc houdt de laatste serverpositie vast");
    assertNear(refreshMobile.json.position.x, persistedRow.x, 0.001, "refresh op mobile houdt de laatste serverpositie vast");
    assert(refreshPc.json.player.id === sharedPlayerId && refreshMobile.json.player.id === sharedPlayerId, "refresh levert dezelfde player entity terug");

    const remoteLeftToPcPromise = wsPc.waitForMessage(function (message) {
      return message.type === "remote_player:left" && message.playerId === remotePlayerLoad.json.player.id && message.worldId === remoteWorldId;
    });
    const remoteLeftToMobilePromise = wsMobile.waitForMessage(function (message) {
      return message.type === "remote_player:left" && message.playerId === remotePlayerLoad.json.player.id && message.worldId === remoteWorldId;
    });
    const remoteClosePromise = wsRemote.closed;
    const remoteLogout = await call("POST", "/api/auth/logout", null, false, remoteJar);
    assert(remoteLogout.status === 200 && remoteLogout.json && remoteLogout.json.ok === true, "logout van remote account werkt");
    assert(remoteJar.value === "", "logout van remote account wist alleen die cookie");
    const remoteClose = await remoteClosePromise;
    assert([4000, 4001, 1000, 1005, 1006].includes(Number(remoteClose.code)), "logout van remote account sluit de websocket (actual=" + remoteClose.code + ")");
    const remoteLeftToPc = await remoteLeftToPcPromise;
    const remoteLeftToMobile = await remoteLeftToMobilePromise;
    assert(remoteLeftToPc.connectedSessionCount === 0, "remote left meldt connectedSessionCount=0");
    assert(remoteLeftToPc.worldId === remoteWorldId, "remote left is world-scoped");
    assert(remoteLeftToMobile.playerId === remotePlayerLoad.json.player.id, "tweede sessie ziet remote left ook");
    assertNoForbiddenKeys(remoteLeftToPc, "remote_player:left");
    const remoteMeAfterLogout = await call("GET", "/api/auth/me", null, false, remoteJar);
    assert(remoteMeAfterLogout.status === 401, "remote logout invalideert alleen de remote sessie");

    const mobileClosePromise = wsMobile.closed;
    const logoutMobile = await call("POST", "/api/auth/logout", null, false, mobileJar);
    assert(logoutMobile.status === 200 && logoutMobile.json.ok === true, "logout invalideert alleen de huidige sessie");
    assert(mobileJar.value === "", "logout verwijdert de cookie voor alleen de huidige sessie");
    const mobileClose = await mobileClosePromise;
    assert([4000, 4001, 1000, 1005, 1006].includes(Number(mobileClose.code)), "logout sluit de websocket van de uitgelogde sessie (actual=" + mobileClose.code + ")");
    const meAfterLogoutPc = await call("GET", "/api/auth/me", null, false, pcJar);
    const meAfterLogoutMobile = await call("GET", "/api/auth/me", null, false, mobileJar);
    assert(meAfterLogoutPc.status === 200 && meAfterLogoutPc.json.user && meAfterLogoutPc.json.user.username === mmoUsername, "logout op mobile laat pc ingelogd");
    assert(meAfterLogoutMobile.status === 401, "logout verwijdert alleen de huidige sessie");
    const pcPresenceAfterLogout = await wsPc.waitForMessage(function (message) {
      return message.type === "player:presence" && message.sessionId === playerLoadMobile.json.session.id && message.connected === false;
    });
    assert(pcPresenceAfterLogout.connectedSessionCount === 1, "presence event meldt dat de mobile sessie offline ging");

    wsPc.close();
    await wsPc.closed;

    const rateUsername = "test_mmo_rate_limit";
    const ratePassword = "mmo_rate_limit_password";
    const rateJar = createCookieJar();
    const rateRegister = await call("POST", "/api/auth/register", {
      identifier: rateUsername,
      password: ratePassword,
      deviceLabel: "rate"
    }, false, rateJar);
    assert(rateRegister.status === 201, "rate-limit test account kan registreren");
    const ratePlayer = await call("GET", "/api/game/player", null, false, rateJar);
    assert(ratePlayer.status === 200 && ratePlayer.json.position, "rate-limit test krijgt player state");
    const rateSocket = createGameSocketClient(rateJar, "mmo-rate-limit");
    await rateSocket.opened;
    await rateSocket.waitForMessage(function (message) { return message.type === "connection:ready"; });
    await rateSocket.waitForMessage(function (message) { return message.type === "player:state"; });
    const rateBefore = readPlayerPosition(dbPath, ratePlayer.json.player.id, ratePlayer.json.worldId);
    await sleep(200);
    for (let index = 0; index < 50; index += 1) {
      try {
        sendInputState(rateSocket, {
          clientSessionId: "mmo-rate-limit-client",
          inputSeq: index + 1,
          controllerEpoch: 1,
          clientSentAt: Date.now(),
          input: {
            moveX: round(index * 0.05),
            moveZ: 0,
            sprint: false,
            pointerTarget: null,
            stop: false
          }
        });
      } catch {
        break;
      }
    }
    await sleep(1200);
    const rateClose = await waitForSocketClose(rateSocket, 1000).catch(function () { return null; });
    const rateAfter = readPlayerPosition(dbPath, ratePlayer.json.player.id, ratePlayer.json.worldId);
    assert(
      (rateClose && rateClose.code === 4408) ||
      rateSocket.messages.some(function (message) {
        return message.type === "error" && message.code === "rate_limited";
      }) ||
      (rateBefore && rateAfter && rateAfter.revision <= rateBefore.revision + 30),
      "WebSocket rate limiting wordt afgedwongen per connection"
    );
    await sleep(200);

    const heartbeatUsername = "test_mmo_heartbeat";
    const heartbeatPassword = "mmo_heartbeat_password";
    const heartbeatJar = createCookieJar();
    const heartbeatRegister = await call("POST", "/api/auth/register", {
      identifier: heartbeatUsername,
      password: heartbeatPassword,
      deviceLabel: "heartbeat"
    }, false, heartbeatJar);
    assert(heartbeatRegister.status === 201, "heartbeat test account kan registreren");
    const heartbeatPlayer = await call("GET", "/api/game/player", null, false, heartbeatJar);
    assert(heartbeatPlayer.status === 200 && heartbeatPlayer.json.position, "heartbeat test krijgt player state");
    const heartbeatSocket = createGameSocketClient(heartbeatJar, "mmo-heartbeat", { autoPong: false });
    await heartbeatSocket.opened;
    await heartbeatSocket.waitForMessage(function (message) { return message.type === "connection:ready"; });
    await heartbeatSocket.waitForMessage(function (message) { return message.type === "player:state"; });
    await heartbeatSocket.waitForMessage(function (message) { return message.type === "ping"; }, 15000);
    const heartbeatClose = await waitForSocketClose(heartbeatSocket, 40000);
    assert(heartbeatSocket.messages.some(function (message) { return message.type === "ping"; }), "server stuurt ping heartbeats");
    assert(heartbeatClose.code === 4000, "zombie connection cleanup sluit inactieve websocket na heartbeat timeout");

    graph = await patchNodeValues(scatterNode.id, {
      count: 24,
      seed: "scatter_seed_01",
      scaleMin: 0.5,
      scaleMax: 2,
      edgeDensity: 0,
      sizeInwardInfluence: 0,
      sizeCurve: "linear"
    });
    const scatterDefaultsDraft = await call("POST", "/api/editor/save-draft");
    assert(scatterDefaultsDraft.status === 200 && scatterDefaultsDraft.json.ok, "save-draft werkt voor scatter edge-density test");
    const scatterDefaultsWorld = await call("GET", "/api/editor/draft-world");
    assert(scatterDefaultsWorld.status === 200, "draft world laadt voor scatter edge-density test");
    const scatterDefaultsArea = (scatterDefaultsWorld.json.scatterAreas || []).find(function (area) { return area.id === scatterNode.id; }) || null;
    assert(scatterDefaultsArea && scatterDefaultsArea.edgeDensity === 0 && scatterDefaultsArea.sizeInwardInfluence === 0 && scatterDefaultsArea.sizeCurve === "linear", "scatter area publiceert edge en size defaults");
    const scatterDefaultsPoints = scatterDefaultsArea.points || [];
    const scatterDefaultsEntities = (Array.isArray(scatterDefaultsWorld.json.entities) ? scatterDefaultsWorld.json.entities : [])
      .filter(function (entity) { return entity && entity.nodeId === scatterNode.id; })
      .slice()
      .sort(function (left, right) { return String(left.id || "").localeCompare(String(right.id || "")); });
    const scatterDefaultsDistances = scatterDefaultsEntities.map(function (entity) {
      return scatterBoundaryDistance(entity, scatterDefaultsPoints);
    });
    assert(scatterDefaultsEntities.length === 24, "edgeDensity 0 publiceert alle scatter instances in de area");
    assert(scatterDefaultsDistances.some(function (distance) { return distance > 0.0001; }), "edgeDensity 0 houdt bomen binnen de area");

    graph = await patchNodeValues(scatterNode.id, {
      edgeDensity: 100
    });
    const scatterEdgeDraft = await call("POST", "/api/editor/save-draft");
    assert(scatterEdgeDraft.status === 200 && scatterEdgeDraft.json.ok, "save-draft werkt voor edgeDensity 100");
    const scatterEdgeWorld = await call("GET", "/api/editor/draft-world");
    assert(scatterEdgeWorld.status === 200, "draft world blijft beschikbaar voor edgeDensity 100");
    const scatterEdgeArea = (scatterEdgeWorld.json.scatterAreas || []).find(function (area) { return area.id === scatterNode.id; }) || null;
    assert(scatterEdgeArea && scatterEdgeArea.edgeDensity === 100, "scatter area publiceert edgeDensity 100");
    const scatterEdgePoints = scatterEdgeArea.points || [];
    const scatterEdgeEntities = (Array.isArray(scatterEdgeWorld.json.entities) ? scatterEdgeWorld.json.entities : [])
      .filter(function (entity) { return entity && entity.nodeId === scatterNode.id; })
      .slice()
      .sort(function (left, right) { return String(left.id || "").localeCompare(String(right.id || "")); });
    const scatterEdgeDistances = scatterEdgeEntities.map(function (entity) {
      return scatterBoundaryDistance(entity, scatterEdgePoints);
    });
    assert(scatterEdgeDistances.every(function (distance) { return distance <= 0.001; }), "edgeDensity 100 zet alle bomen op de rand");

    graph = await patchNodeValues(scatterNode.id, {
      edgeDensity: 0,
      sizeInwardInfluence: 100,
      sizeCurve: "linear",
      scaleMin: 0.5,
      scaleMax: 2
    });
    const scatterSizeDraft = await call("POST", "/api/editor/save-draft");
    assert(scatterSizeDraft.status === 200 && scatterSizeDraft.json.ok, "save-draft werkt voor size influence");
    const scatterSizeWorld = await call("GET", "/api/editor/draft-world");
    assert(scatterSizeWorld.status === 200, "draft world blijft beschikbaar voor size influence");
    const scatterSizeArea = (scatterSizeWorld.json.scatterAreas || []).find(function (area) { return area.id === scatterNode.id; }) || null;
    assert(scatterSizeArea && scatterSizeArea.sizeInwardInfluence === 100 && scatterSizeArea.sizeCurve === "linear", "scatter area publiceert size influence linear");
    const scatterSizePoints = scatterSizeArea.points || [];
    const scatterSizeEntities = (Array.isArray(scatterSizeWorld.json.entities) ? scatterSizeWorld.json.entities : [])
      .filter(function (entity) { return entity && entity.nodeId === scatterNode.id; })
      .slice()
      .sort(function (left, right) { return String(left.id || "").localeCompare(String(right.id || "")); });
    const scatterSizeDetails = scatterSizeEntities.map(function (entity) {
      return {
        distance: scatterBoundaryDistance(entity, scatterSizePoints),
        scale: Number(entity.transform && entity.transform.scale ? entity.transform.scale.x : 0)
      };
    }).sort(function (left, right) {
      return left.distance - right.distance;
    });
    assert(scatterSizeDetails.length === 24, "sizeInfluence test publiceert alle scatter instances");
    assert(scatterSizeDetails[scatterSizeDetails.length - 1].scale > scatterSizeDetails[0].scale + 0.1, "sizeInwardInfluence 100 maakt binnenpunten groter dan randpunten");

    graph = await patchNodeValues(scatterNode.id, {
      sizeCurve: "instant"
    });
    const scatterInstantDraft = await call("POST", "/api/editor/save-draft");
    assert(scatterInstantDraft.status === 200 && scatterInstantDraft.json.ok, "save-draft werkt voor instant curve");
    const scatterInstantWorld = await call("GET", "/api/editor/draft-world");
    assert(scatterInstantWorld.status === 200, "draft world blijft beschikbaar voor instant curve");
    const scatterInstantArea = (scatterInstantWorld.json.scatterAreas || []).find(function (area) { return area.id === scatterNode.id; }) || null;
    assert(scatterInstantArea && scatterInstantArea.sizeCurve === "instant", "scatter area publiceert instant curve");
    const scatterInstantPoints = scatterInstantArea.points || [];
    const scatterInstantEntities = (Array.isArray(scatterInstantWorld.json.entities) ? scatterInstantWorld.json.entities : [])
      .filter(function (entity) { return entity && entity.nodeId === scatterNode.id; })
      .slice()
      .sort(function (left, right) { return String(left.id || "").localeCompare(String(right.id || "")); });
    const scatterInstantDetails = scatterInstantEntities.map(function (entity) {
      return {
        distance: scatterBoundaryDistance(entity, scatterInstantPoints),
        scale: Number(entity.transform && entity.transform.scale ? entity.transform.scale.x : 0)
      };
    }).sort(function (left, right) {
      return left.distance - right.distance;
    });
    assert(scatterInstantDetails.length === 24, "instant curve behoudt de instance count");
    assert(scatterInstantDetails[0].scale <= 0.55, "instant curve houdt randbomen klein");
    assert(scatterInstantDetails[scatterInstantDetails.length - 1].scale >= 1.9, "instant curve maakt binnenpunten direct hoog");

    graph = await patchNodeValues(scatterNode.id, {
      count: 4,
      randomObjectSelection: false,
      distributionMode: "random",
      minSpacing: 0,
      spacingStrength: 0,
      edgeDensity: 0,
      sizeInwardInfluence: 0,
      sizeCurve: "linear",
      scaleMin: 1,
      scaleMax: 1,
      sourceScaleMultipliers: {
        [modelId]: 0.5,
        [treeAssetId]: 1.75
      }
    });
    const scatterScaleDraft = await call("POST", "/api/editor/save-draft");
    assert(scatterScaleDraft.status === 200 && scatterScaleDraft.json.ok, "save-draft werkt voor per-object scale");
    const scatterScaleWorld = await call("GET", "/api/editor/draft-world");
    assert(scatterScaleWorld.status === 200, "draft world blijft beschikbaar voor per-object scale");
    const scatterScaleArea = (scatterScaleWorld.json.scatterAreas || []).find(function (area) { return area.id === scatterNode.id; }) || null;
    assert(scatterScaleArea && scatterScaleArea.sourceScaleMultipliers && scatterScaleArea.sourceScaleMultipliers[modelId] === 0.5 && scatterScaleArea.sourceScaleMultipliers[treeAssetId] === 1.75, "scatter area publiceert per-object scale multipliers");
    const scatterScaleEntities = (Array.isArray(scatterScaleWorld.json.entities) ? scatterScaleWorld.json.entities : [])
      .filter(function (entity) { return entity && entity.nodeId === scatterNode.id; })
      .slice()
      .sort(function (left, right) { return String(left.id || "").localeCompare(String(right.id || "")); });
    const modelScaleVectors = scatterScaleEntities.filter(function (entity) {
      return entity && entity.sourceAssetId === modelId;
    }).map(function (entity) {
      const scale = entity.transform && entity.transform.scale ? entity.transform.scale : {};
      return [Number(scale.x || 0), Number(scale.y || 0), Number(scale.z || 0)];
    });
    const treeScaleVectors = scatterScaleEntities.filter(function (entity) {
      return entity && entity.sourceAssetId === treeAssetId;
    }).map(function (entity) {
      const scale = entity.transform && entity.transform.scale ? entity.transform.scale : {};
      return [Number(scale.x || 0), Number(scale.y || 0), Number(scale.z || 0)];
    });
    assert(modelScaleVectors.length > 0 && treeScaleVectors.length > 0, "per-object scale test publiceert beide sources");
    assert(modelScaleVectors.every(function (scale) { return Math.abs(scale[0] - 0.5) < 0.0001 && Math.abs(scale[1] - 0.5) < 0.0001 && Math.abs(scale[2] - 0.5) < 0.0001; }), "eerste bron krijgt eigen scale");
    assert(treeScaleVectors.every(function (scale) { return Math.abs(scale[0] - 1.75) < 0.0001 && Math.abs(scale[1] - 1.75) < 0.0001 && Math.abs(scale[2] - 1.75) < 0.0001; }), "tweede bron krijgt eigen scale");

    console.log("\nSMOKE TEST GESLAAGD");
  } catch (error) {
    failed = true;
    console.error("\nSMOKE TEST MISLUKT:", error.message);
  } finally {
    if (child) {
      child.kill("SIGTERM");
      try { await new Promise(function (resolve) { child.once("exit", resolve); }); } catch {}
    }
    cleanupGeneratedAssets();
    restoreSmokeFixtureAssets();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
  process.exit(failed ? 1 : 0);
}

main();
