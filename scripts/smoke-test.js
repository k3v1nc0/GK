import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import net from "node:net";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { buildChunkWindow, buildWalkabilityIndex, buildSurfaceStripGeometry, chunkCoordForPosition, chunkKey, clearWalkabilityIndex, createWalkabilityIndex, isPointBlockedByBlocker, isPointBlockedBySurface, isPointBlockedByTerrain, isPointBlockedByWater, isPointOnWalkableSurface, resolveChunkPolicy, resolveMovement, resolveShadowPolicy } from "../apps/web/public/shared/world-runtime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const ADMIN_PASSWORD = "k1k2k3k4k5";
const EXPECT_GLB_THUMBNAILS = String(process.env.EXPECT_GLB_THUMBNAILS || "").trim() === "1";

let cookie = "";
let BASE = "";
const cleanupAssetPaths = new Set();

function setCookieFrom(response) {
  const raw = response.headers.get("set-cookie");
  if (raw) cookie = raw.split(";")[0];
}

async function call(method, pathname, body, isForm) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  let payload = body;
  if (body && !isForm) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  let response;
  try {
    response = await fetch(BASE + pathname, { method: method, headers: headers, body: payload });
  } catch (error) {
    console.error("FETCH FAIL", method, pathname, body || null, error?.message || error);
    throw error;
  }
  setCookieFrom(response);
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
  assert(defaultEditorPolicy.quality === "medium", "shadow policy default quality is medium");
  assert(defaultEditorPolicy.mapSize === 2048, "medium shadow quality gebruikt 2048 mapSize");

  const lowPolicy = resolveShadowPolicy({
    world: {
      performance: {
        shared: { shadowQuality: "low" },
        game: { shadowsEnabled: true },
        editor: { shadowsEnabled: true }
      }
    }
  }, "game");
  assert(lowPolicy.mapSize === 1024, "low shadow quality gebruikt 1024 mapSize");

  const highPolicy = resolveShadowPolicy({
    world: {
      performance: {
        shared: {
          shadowQuality: "high",
          shadowBias: -0.0006,
          shadowNormalBias: 0.2,
          shadowCameraSize: 90,
          shadowCameraFar: 700
        },
        game: { shadowsEnabled: true },
        editor: { shadowsEnabled: false }
      }
    }
  }, "editor");
  assert(highPolicy.enabled === false, "editor shadows kunnen apart uit");
  assert(highPolicy.quality === "high", "shadow quality blijft hoog in de editor policy");
  assert(highPolicy.mapSize === 4096, "high shadow quality gebruikt 4096 mapSize");
  assertNear(highPolicy.bias, -0.0006, 0.000001, "shadow bias wordt gelezen");
  assertNear(highPolicy.normalBias, 0.2, 0.000001, "shadow normal bias wordt gelezen");
  assert(highPolicy.cameraSize === 90, "shadow camera size wordt gelezen");
  assert(highPolicy.cameraFar === 700, "shadow distance wordt gelezen");

  const offPolicy = resolveShadowPolicy({
    world: {
      performance: {
        shared: { shadowQuality: "off" },
        game: { shadowsEnabled: true },
        editor: { shadowsEnabled: true }
      }
    }
  }, "game");
  assert(offPolicy.enabled === false, "shadowQuality=off schakelt shadows uit");
}

function runWalkabilityChecks() {
  const sampleWorld = {
    ground: { width: 80, depth: 80, y: 0 },
    terrain: {
      waters: [
        {
          id: "river_main",
          waterType: "river",
          width: 8,
          y: -0.15,
          color: "#2f9ecf",
          flowSpeed: 0.2,
          blocksPlayer: true,
          points: [
            { x: -20, z: 0 },
            { x: 20, z: 0 }
          ]
        },
        {
          id: "river_visual_only",
          waterType: "river",
          width: 8,
          y: -0.15,
          color: "#2f9ecf",
          flowSpeed: 0.2,
          blocksPlayer: false,
          points: [
            { x: -20, z: 10 },
            { x: 20, z: 10 }
          ]
        }
      ],
      surfaces: [
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
  assert(isPointBlockedByWater(sampleIndex, 0, 0), "water met blocksPlayer=true blokkeert");
  assert(!isPointBlockedByWater(sampleIndex, 0, 10), "water met blocksPlayer=false blokkeert niet");
  assert(isPointBlockedBySurface(sampleIndex, 0, -10), "surface met blocksPlayer=true blokkeert");
  assert(!isPointBlockedBySurface(sampleIndex, 0, -20), "surface met blocksPlayer=false blokkeert niet");
  assert(isPointBlockedByTerrain(sampleIndex, 0, -10, 0.5), "surface blocksPlayer telt mee als terrain collision");
  assert(isPointBlockedByBlocker(sampleIndex, 30, 0), "blocker polygon blokkeert");
  assert(isPointOnWalkableSurface(sampleIndex, 0, 0), "walkable surface override werkt");
  assert(isPointOnWalkableSurface(sampleIndex, -11, -10.9), "geroteerde walkable surface wordt herkend");
  assert(isPointOnWalkableSurface(sampleIndex, 18.5, -5.7), "polygon walkable surface wordt herkend");
  assert(!isPointOnWalkableSurface(sampleIndex, 20.8, -4.7), "polygon walkable surface volgt eigen vorm");
  assert(isPointOnWalkableSurface(sampleIndex, 3, 0, 0.5), "walkable surface houdt rekening met collision radius langs rand");
  assert(!isPointBlockedByTerrain(sampleIndex, 0, 0, 0.5), "walkable surface wint boven water");
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
  assert(slideMove.x === 10 && slideMove.z < 6 && slideMove.z > 2.5, "bewegingsfallback schuift soepel langs water-rand");
  assert(!isPointBlockedByTerrain(sampleIndex, slideMove.x, slideMove.z, 0.5), "bewegingsfallback eindigt buiten terrain collision");

  clearWalkabilityIndex();
  buildWalkabilityIndex(sampleWorld);
  const activeWaterMove = resolveMovement(
    { x: -10, y: 0, z: 4 },
    { x: 0, y: 0, z: 4 },
    { radius: 0.5, ground: sampleWorld.ground, solids: [] }
  );
  assert(activeWaterMove.x === -10 && activeWaterMove.z === 4, "buildWalkabilityIndex activeert runtime collision");
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
    runWalkabilityChecks();
    runChunkLoadingProofChecks();
    child = spawn(process.execPath, ["src/server/server.js"], {
      cwd: rootDir,
      env: Object.assign({}, process.env, { PORT: PORT, DATABASE_PATH: dbPath, ADMIN_PASSWORD: ADMIN_PASSWORD, ADMIN_USERNAME: "kevin" }),
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
      shadowQuality: "high",
      shadowBias: -0.0006,
      shadowNormalBias: 0.2,
      shadowCameraSize: 90,
      shadowCameraFar: 700,
      gameShadowsEnabled: true,
      editorFogEnabled: false,
      editorShadowsEnabled: false
    })).graph;
    const worldNode = graph.nodes.find(function (n) { return n.type === "world_settings"; });
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
    assert((graph.edges || []).some(function (edge) {
      return edge.fromNodeId === duplicatedModelEntityNode.id && edge.fromPort === "entity" && edge.toPort === "entities";
    }), "duplicaat blijft automatisch verbonden");

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
    assert((graph.edges || []).some(function (edge) {
      return edge.fromNodeId === modelEntityNode.id && edge.fromPort === "entity" && edge.toNodeId === gameOutputNode.id && edge.toPort === "entities";
    }), "eerste model_entity blijft automatisch verbonden");
    assert((graph.edges || []).some(function (edge) {
      return edge.fromNodeId === secondModelEntityNode.id && edge.fromPort === "entity" && edge.toNodeId === gameOutputNode.id && edge.toPort === "entities";
    }), "tweede model_entity blijft automatisch verbonden");
    assert((graph.edges || []).some(function (edge) {
      return edge.fromNodeId === duplicatedModelEntityNode.id && edge.fromPort === "entity" && edge.toNodeId === gameOutputNode.id && edge.toPort === "entities";
    }), "gedupliceerde model_entity blijft automatisch verbonden");

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
      updateIntervalMs: 500
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

    graph = (await createNode("editor_chunk_loading", {})).graph;
    const editorChunkLoadingNode = findNode(graph, function (n) { return n.type === "editor_chunk_loading"; }, "editor chunk loading aangemaakt");

    graph = (await createNode("game_chunk_loading", {})).graph;
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

    graph = (await createNode("path_layer", {
      pathId: "path_main",
      label: "Main Path",
      pathType: "sand",
      width: 3,
      edgeBlend: 0.8,
      yOffset: 0.01,
      slightlySunken: true,
      speedMultiplier: 1,
      materialMode: "preset",
      textureAssetId: null,
      textureScale: 5,
      opacity: 1,
      points: [
        { x: 0, z: 0 },
        { x: 8, z: 3 }
      ]
    })).graph;
    const pathLayerNode = findNode(graph, function (n) { return n.type === "path_layer" && n.values.pathId === "path_main"; }, "path layer aangemaakt");

    graph = (await createNode("water_layer", {
      waterId: "river_main",
      label: "Main River",
      waterType: "river",
      width: 5,
      y: -0.15,
      color: "#2f9ecf",
      flowSpeed: 0.2,
      blocksPlayer: true,
      materialMode: "preset",
      textureAssetId: null,
      textureScale: 6,
      opacity: 1,
      points: [
        { x: 0, z: 10 },
        { x: 40, z: 18 }
      ]
    })).graph;
    const waterLayerNode = findNode(graph, function (n) { return n.type === "water_layer" && n.values.waterId === "river_main"; }, "water layer aangemaakt");

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
    graph = await connect(graph, groundNode.id, "ground", gameOutputNode.id, "ground");
    graph = await connect(graph, cameraNode.id, "camera", gameOutputNode.id, "camera");
    graph = await connect(graph, ambientNode.id, "light", gameOutputNode.id, "lights");
    graph = await connect(graph, dirNode.id, "light", gameOutputNode.id, "lights");
    graph = await connect(graph, playerNode.id, "player", gameOutputNode.id, "player");
    graph = await connect(graph, spawnNode.id, "spawn", gameOutputNode.id, "spawn");
    graph = await connect(graph, scatterNode.id, "entity", gameOutputNode.id, "entities");
    graph = await connect(graph, terrainLayerNode.id, "terrain", gameOutputNode.id, "terrain");
    graph = await connect(graph, pathLayerNode.id, "terrain", gameOutputNode.id, "terrain");
    graph = await connect(graph, waterLayerNode.id, "terrain", gameOutputNode.id, "terrain");
    graph = await connect(graph, surfaceLayerNode.id, "terrain", gameOutputNode.id, "terrain");
    graph = await connect(graph, blockerAreaNode.id, "collision", gameOutputNode.id, "collision");
    graph = await connect(graph, walkableSurfaceNode.id, "collision", gameOutputNode.id, "collision");
    graph = await connect(graph, hudTextNode.id, "ui", gameOutputNode.id, "ui");
    graph = await connect(graph, perfHudNode.id, "ui", gameOutputNode.id, "ui");
    graph = await connect(graph, disabledPerfHudNode.id, "ui", gameOutputNode.id, "ui");
    graph = await connect(graph, editorChunkLoadingNode.id, "chunkLoading", gameOutputNode.id, "chunkLoading");
    graph = await connect(graph, gameChunkLoadingNode.id, "chunkLoading", gameOutputNode.id, "chunkLoading");

    const validate = await call("GET", "/api/editor/validate");
    if (!validate.json.ok) console.error("VALIDATE ERRORS", validate.json.errors);
    assert(validate.status === 200 && validate.json.ok, "validatie is groen");

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
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.shared.shadowQuality === "high", "draft world publiceert shadowQuality");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.shared.shadowBias === -0.0006, "draft world publiceert shadowBias");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.shared.shadowNormalBias === 0.2, "draft world publiceert shadowNormalBias");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.shared.shadowCameraSize === 90, "draft world publiceert shadowCameraSize");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.shared.shadowCameraFar === 700, "draft world publiceert shadow distance");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.game && draftWorld.json.world.performance.game.shadowsEnabled === true, "draft world publiceert game shadows");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.editor && draftWorld.json.world.performance.editor.fogEnabled === false, "draft world kan fog in editor uitschakelen");
    assert(draftWorld.json.world && draftWorld.json.world.performance && draftWorld.json.world.performance.editor && draftWorld.json.world.performance.editor.shadowsEnabled === false, "draft world publiceert editor shadows");
    assert(draftWorld.json.chunkLoading && draftWorld.json.chunkLoading.editor && draftWorld.json.chunkLoading.game, "draft world publiceert chunkLoading read-model");
    assert(draftWorld.json.chunkLoading.editor.type === "editor" && draftWorld.json.chunkLoading.game.type === "game", "draft world scheidt editor en game chunk loading");
    assert(draftWorld.json.chunkLoading.editor.chunkWidth === 100, "editor chunk width is 100");
    assert(draftWorld.json.chunkLoading.game.chunkWidth === 100, "game chunk width is 100");
    assert(draftWorld.json.chunkLoading.editor.editorViewRadiusChunks > draftWorld.json.chunkLoading.game.gameViewRadiusChunks, "editor radius is groter dan game radius");
    assert(draftWorld.json.chunkLoading.game.cameraOnly === true, "game chunkLoading cameraOnly staat aan");
    assert(draftWorld.json.chunkLoading.game.strictUnloadOutsideCamera === true, "game chunkLoading strict unload staat aan");
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
    assert(after.json.world && after.json.world.fogColor === "#1a2b3c", "game world publiceert fogColor");
    assert(after.json.world && after.json.world.fogDensity === 0.18, "game world publiceert fogDensity");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.shared.shadowQuality === "high", "game world publiceert shadowQuality");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.shared.shadowBias === -0.0006, "game world publiceert shadowBias");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.shared.shadowNormalBias === 0.2, "game world publiceert shadowNormalBias");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.shared.shadowCameraSize === 90, "game world publiceert shadowCameraSize");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.shared.shadowCameraFar === 700, "game world publiceert shadow distance");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.game && after.json.world.performance.game.shadowsEnabled === true, "game world publiceert game shadows");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.editor && after.json.world.performance.editor.fogEnabled === false, "game world behoudt editor fog toggle in draft data");
    assert(after.json.world && after.json.world.performance && after.json.world.performance.editor && after.json.world.performance.editor.shadowsEnabled === false, "game world behoudt editor shadows in draft data");
    assert(after.json.chunkLoading && after.json.chunkLoading.editor && after.json.chunkLoading.game, "game world publiceert chunkLoading");
    assert(after.json.chunkLoading.editor.type === "editor" && after.json.chunkLoading.game.type === "game", "game world scheidt editor en game chunk loading");
    assert(after.json.chunkLoading.editor.chunkProfileId === "editor_chunks", "editor chunk profile is gepubliceerd");
    assert(after.json.chunkLoading.game.chunkProfileId === "game_chunks", "game chunk profile is gepubliceerd");
    const publishedEditorChunkPolicy = resolveChunkPolicy(after.json, "editor");
    const publishedGameChunkPolicy = resolveChunkPolicy(after.json, "game");
    assert(publishedEditorChunkPolicy.source === "editor", "runtime helper kiest de editor chunk policy uit published world");
    assert(publishedGameChunkPolicy.source === "game", "runtime helper kiest de game chunk policy uit published world");
    const publishedEditorWindow = buildChunkWindow({ x: 0, z: 0 }, publishedEditorChunkPolicy, "editor");
    const publishedGameWindow = buildChunkWindow({ x: 0, z: 0 }, publishedGameChunkPolicy, "game");
    assert(publishedEditorWindow.loadedChunks.length > publishedGameWindow.loadedChunks.length, "published editor policy blijft ruimer dan game policy");
    const editorShadowPolicy = resolveShadowPolicy(after.json, "editor");
    const gameShadowPolicy = resolveShadowPolicy(after.json, "game");
    assert(editorShadowPolicy.enabled === false, "editor shadow policy volgt editor toggle");
    assert(gameShadowPolicy.enabled === true, "game shadow policy volgt game toggle");
    assert(gameShadowPolicy.mapSize === 4096, "game shadow policy gebruikt high mapSize");
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
    assert(Array.isArray(after.json.terrain.paths) && after.json.terrain.paths.length === 1, "path layers zijn gepubliceerd");
    assert(Array.isArray(after.json.terrain.paths[0].points) && after.json.terrain.paths[0].points.length === 2, "path layer publiceert points");
    assert(after.json.terrain.paths[0].materialMode === "preset", "path layer publiceert materialMode");
    assert(after.json.terrain.paths[0].textureAssetId === null, "path layer publiceert textureAssetId (null)");
    assert(after.json.terrain.paths[0].textureScale === 5, "path layer publiceert textureScale");
    assert(after.json.terrain.paths[0].opacity === 1, "path layer publiceert opacity");
    assert(Array.isArray(after.json.terrain.waters) && after.json.terrain.waters.length === 1, "water layers zijn gepubliceerd");
    assert(Array.isArray(after.json.terrain.waters[0].points) && after.json.terrain.waters[0].points.length === 2, "water layer publiceert points");
    assert(after.json.terrain.waters[0].materialMode === "preset", "water layer publiceert materialMode");
    assert(after.json.terrain.waters[0].textureAssetId === null, "water layer publiceert textureAssetId (null)");
    assert(after.json.terrain.waters[0].textureScale === 6, "water layer publiceert textureScale");
    assert(after.json.terrain.waters[0].opacity === 1, "water layer publiceert opacity");
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
    assert(Array.isArray(after.json.terrain.paths) && after.json.terrain.paths.length === 1, "oude path layer blijft bestaan na toevoeging surface layer");
    assert(Array.isArray(after.json.terrain.waters) && after.json.terrain.waters.length === 1, "oude water layer blijft bestaan na toevoeging surface layer");
    const publishedCollisionBlockers = after.json.collision && Array.isArray(after.json.collision.blockers) ? after.json.collision.blockers : [];
    assert(publishedCollisionBlockers.length === 2, "collision blockers zijn gepubliceerd");
    const publishedMountainBlocker = publishedCollisionBlockers.find(function (entry) { return entry && entry.reason === "mountain"; }) || null;
    const publishedScatterBlocker = publishedCollisionBlockers.find(function (entry) { return entry && entry.reason === "scatter_forest_patch"; }) || null;
    assert(publishedMountainBlocker && Array.isArray(publishedMountainBlocker.points) && publishedMountainBlocker.points.length === 3, "blocker area publiceert polygon points");
    assert(publishedMountainBlocker && publishedMountainBlocker.reason === "mountain", "blocker area publiceert reason");
    assert(publishedScatterBlocker && Array.isArray(publishedScatterBlocker.points) && publishedScatterBlocker.points.length >= 6, "scatter boundary publiceert polygon points");
    assert(publishedScatterBlocker && publishedScatterBlocker.reason === "scatter_forest_patch", "scatter boundary publiceert reason");
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
    assert(publishedPerformanceHud && publishedPerformanceHud.metrics && publishedPerformanceHud.metrics.showFps === true && publishedPerformanceHud.metrics.showCollisionShapes === true && publishedPerformanceHud.metrics.showWorldSize === false, "debug_performance_hud publiceert metrics");
    assert(publishedPerformanceHud && publishedPerformanceHud.thresholds && publishedPerformanceHud.thresholds.fpsWarn === 45 && publishedPerformanceHud.thresholds.drawCallsDanger === 140 && publishedPerformanceHud.thresholds.collisionShapesDanger === 150, "debug_performance_hud publiceert thresholds");
    const publishedDisabledPerformanceHud = Array.isArray(after.json.ui) ? after.json.ui.find(function (entry) { return entry.id === "perf_hud_disabled"; }) : null;
    assert(publishedDisabledPerformanceHud && publishedDisabledPerformanceHud.type === "debug_performance_hud" && publishedDisabledPerformanceHud.enabled === false, "disabled performance HUD publiceert disabled config");
    assert(!Array.isArray(after.json.ui) || !after.json.ui.some(function (entry) { return entry.id === "perf_hud_ghost"; }), "ongekoppelde performance HUD wordt niet gepubliceerd");

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
