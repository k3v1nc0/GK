import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import net from "node:net";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { buildWalkabilityIndex, buildSurfaceStripGeometry, clearWalkabilityIndex, createWalkabilityIndex, isPointBlockedByBlocker, isPointBlockedBySurface, isPointBlockedByTerrain, isPointBlockedByWater, isPointOnWalkableSurface, resolveMovement } from "../apps/web/public/shared/world-runtime.js";

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
  const response = await fetch(BASE + pathname, { method: method, headers: headers, body: payload });
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
  spawnSync("git", ["restore", "--source=HEAD", "--", "assets/uploads/wizard.glb", "assets/thumbnails/wizard.png"], {
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
          y: 0.35,
          z: 0,
          width: 6,
          depth: 2.5,
          rotationY: 0,
          priority: 10
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
  assert(!isPointBlockedByTerrain(sampleIndex, 0, 0, 0.5), "walkable surface wint boven water");

  const bridgeMove = resolveMovement(
    { x: -10, y: 0, z: 0.2 },
    { x: 0, y: 0, z: 0.2 },
    { radius: 0.5, ground: sampleWorld.ground, solids: [], index: sampleIndex }
  );
  assert(bridgeMove.x === 0 && bridgeMove.z === 0.2, "walkable surface laat brugpassage toe");

  const slideMove = resolveMovement(
    { x: -10, y: 0, z: 6 },
    { x: 10, y: 0, z: 1 },
    { radius: 0.5, ground: sampleWorld.ground, solids: [], index: sampleIndex }
  );
  assert(slideMove.x === 10 && slideMove.z === 6, "bewegingsfallback schuift langs water via x-only");

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
    runWalkabilityChecks();
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

    let graph = (await createNode("world_settings", { worldId: "demo_world", displayName: "Demo", backgroundColor: "#0b1622" })).graph;
    const worldNode = graph.nodes.find(function (n) { return n.type === "world_settings"; });
    graph = (await createNode("ground_surface", { groundId: "demo_ground", width: 40, depth: 40, y: 0, materialColor: "#3f6b3f" })).graph;
    const groundNode = graph.nodes.find(function (n) { return n.type === "ground_surface"; });
    graph = (await createNode("top_down_camera", { cameraId: "main_cam", pitch: 60, yaw: 0, distance: 20, minDistance: 8, maxDistance: 40, fov: 55, follow: true, rotateSpeed: 90 })).graph;
    const cameraNode = graph.nodes.find(function (n) { return n.type === "top_down_camera"; });
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

    graph = await connect(graph, keybindDirect.id, "keybind", gameOutputNode.id, "keybinds");
    graph = await connect(graph, keybindGroup1.id, "keybind", groupNode.id, "keybinds_in");
    const validateBeforeInternal = await call("GET", "/api/editor/validate");
    assert(validateBeforeInternal.status === 200 && !validateBeforeInternal.json.ok && validateBeforeInternal.json.errors.some(function (message) {
      return message.includes("Group output") && message.includes("not connected inside the group");
    }), "group output zonder interne bron faalt validatie");

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

    graph = (await createNode("walkable_surface", {
      surfaceId: "bridge_walk_01",
      label: "Bridge Walk Surface",
      x: 0,
      y: 0.35,
      z: 0,
      width: 6,
      depth: 2.5,
      rotationY: 0,
      priority: 10
    })).graph;
    const walkableSurfaceNode = findNode(graph, function (n) { return n.type === "walkable_surface" && n.values.surfaceId === "bridge_walk_01"; }, "walkable surface aangemaakt");

    graph = await connect(graph, worldNode.id, "world", gameOutputNode.id, "world");
    graph = await connect(graph, groundNode.id, "ground", gameOutputNode.id, "ground");
    graph = await connect(graph, cameraNode.id, "camera", gameOutputNode.id, "camera");
    graph = await connect(graph, ambientNode.id, "light", gameOutputNode.id, "lights");
    graph = await connect(graph, dirNode.id, "light", gameOutputNode.id, "lights");
    graph = await connect(graph, playerNode.id, "player", gameOutputNode.id, "player");
    graph = await connect(graph, spawnNode.id, "spawn", gameOutputNode.id, "spawn");
    graph = await connect(graph, modelEntityNode.id, "entity", gameOutputNode.id, "entities");
    graph = await connect(graph, terrainLayerNode.id, "terrain", gameOutputNode.id, "terrain");
    graph = await connect(graph, pathLayerNode.id, "terrain", gameOutputNode.id, "terrain");
    graph = await connect(graph, waterLayerNode.id, "terrain", gameOutputNode.id, "terrain");
    graph = await connect(graph, surfaceLayerNode.id, "terrain", gameOutputNode.id, "terrain");
    graph = await connect(graph, blockerAreaNode.id, "collision", gameOutputNode.id, "collision");
    graph = await connect(graph, walkableSurfaceNode.id, "collision", gameOutputNode.id, "collision");
    graph = await connect(graph, hudTextNode.id, "ui", gameOutputNode.id, "ui");
    graph = await connect(graph, perfHudNode.id, "ui", gameOutputNode.id, "ui");
    graph = await connect(graph, disabledPerfHudNode.id, "ui", gameOutputNode.id, "ui");

    const validate = await call("GET", "/api/editor/validate");
    assert(validate.status === 200 && validate.json.ok, "validatie is groen");

    const draft = await call("POST", "/api/editor/save-draft");
    assert(draft.status === 200 && draft.json.ok, "draft opslaan werkt");

    const publish = await call("POST", "/api/editor/publish");
    assert(publish.status === 200 && publish.json.ok, "publiceren werkt");

    const after = await call("GET", "/api/game/world");
    assert(after.status === 200, "game wereld is 200 na publish");
    assert(after.json.camera && after.json.camera.mode === "top-down", "camera is top-down");
    assert(after.json.player && after.json.player.modelAssetId === modelId, "speler verwijst naar geuploade model");
    assert(after.json.player && after.json.player.animationClip === "Idle", "speler publiceert gekozen animationClip");
    assert(after.json.player && after.json.player.idleAnimation === "Idle", "speler publiceert idleAnimation");
    assert(after.json.player && after.json.player.walkAnimation === "Walk", "speler publiceert walkAnimation");
    assert(after.json.player && after.json.player.runAnimation === "Run", "speler publiceert runAnimation");
    assert(after.json.spawn && after.json.spawn.x === 0, "spawn aanwezig");
    assert(Array.isArray(after.json.entities) && after.json.entities.some(function (entity) { return entity.animationClip === "Walk"; }), "entities publiceren gekozen animationClip");
    const publishedModelEntity = Array.isArray(after.json.entities)
      ? after.json.entities.find(function (entity) { return entity.id === "entity_walk"; })
      : null;
    assert(publishedModelEntity && publishedModelEntity.idleAnimation === "Idle", "entities publiceren idleAnimation");
    assert(publishedModelEntity && publishedModelEntity.walkAnimation === "Walk", "entities publiceren walkAnimation");
    assert(publishedModelEntity && publishedModelEntity.runAnimation === "Run", "entities publiceren runAnimation");
    assert(publishedModelEntity && publishedModelEntity.transform && publishedModelEntity.transform.rotation.x === 10 && publishedModelEntity.transform.rotation.y === 20 && publishedModelEntity.transform.rotation.z === 30, "entities publiceren rotationX/Y/Z");
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
    assert(after.json.collision && Array.isArray(after.json.collision.blockers) && after.json.collision.blockers.length === 1, "collision blockers zijn gepubliceerd");
    assert(Array.isArray(after.json.collision.blockers[0].points) && after.json.collision.blockers[0].points.length === 3, "blocker area publiceert polygon points");
    assert(after.json.collision.blockers[0].reason === "mountain", "blocker area publiceert reason");
    assert(Array.isArray(after.json.collision.walkableSurfaces) && after.json.collision.walkableSurfaces.length === 1, "walkable surfaces zijn gepubliceerd");
    assert(after.json.collision.walkableSurfaces[0].width === 6 && after.json.collision.walkableSurfaces[0].depth === 2.5, "walkable surface publiceert afmetingen");
    assert(Array.isArray(after.json.ui) && after.json.ui.some(function (entry) { return entry.type === "hud_text" && entry.id === "hud_status"; }), "ui_hud_text blijft gepubliceerd");
    const publishedPerformanceHud = Array.isArray(after.json.ui) ? after.json.ui.find(function (entry) { return entry.id === "perf_hud_main"; }) : null;
    assert(publishedPerformanceHud && publishedPerformanceHud.type === "debug_performance_hud" && publishedPerformanceHud.enabled === true && publishedPerformanceHud.anchor === "top-right" && publishedPerformanceHud.compact === true && publishedPerformanceHud.updateIntervalMs === 500, "debug_performance_hud publiceert read-model");
    assert(publishedPerformanceHud && publishedPerformanceHud.metrics && publishedPerformanceHud.metrics.showFps === true && publishedPerformanceHud.metrics.showCollisionShapes === true && publishedPerformanceHud.metrics.showWorldSize === false, "debug_performance_hud publiceert metrics");
    assert(publishedPerformanceHud && publishedPerformanceHud.thresholds && publishedPerformanceHud.thresholds.fpsWarn === 45 && publishedPerformanceHud.thresholds.drawCallsDanger === 140 && publishedPerformanceHud.thresholds.collisionShapesDanger === 150, "debug_performance_hud publiceert thresholds");
    const publishedDisabledPerformanceHud = Array.isArray(after.json.ui) ? after.json.ui.find(function (entry) { return entry.id === "perf_hud_disabled"; }) : null;
    assert(publishedDisabledPerformanceHud && publishedDisabledPerformanceHud.type === "debug_performance_hud" && publishedDisabledPerformanceHud.enabled === false, "disabled performance HUD publiceert disabled config");
    assert(!Array.isArray(after.json.ui) || !after.json.ui.some(function (entry) { return entry.id === "perf_hud_ghost"; }), "ongekoppelde performance HUD wordt niet gepubliceerd");

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
