import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import net from "node:net";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

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
    child = spawn(process.execPath, ["src/server/server.js"], {
      cwd: rootDir,
      env: Object.assign({}, process.env, { PORT: PORT, DATABASE_PATH: dbPath, ADMIN_PASSWORD: ADMIN_PASSWORD, ADMIN_USERNAME: "kevin" }),
      stdio: ["pipe", "pipe", "pipe"]
    });
    child.stderr.on("data", function (data) { process.stderr.write("[server] " + data); });
    BASE = "http://127.0.0.1:" + PORT;
    await waitForHealth(15000);

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

    graph = await connect(graph, worldNode.id, "world", gameOutputNode.id, "world");
    graph = await connect(graph, groundNode.id, "ground", gameOutputNode.id, "ground");
    graph = await connect(graph, cameraNode.id, "camera", gameOutputNode.id, "camera");
    graph = await connect(graph, ambientNode.id, "light", gameOutputNode.id, "lights");
    graph = await connect(graph, dirNode.id, "light", gameOutputNode.id, "lights");
    graph = await connect(graph, playerNode.id, "player", gameOutputNode.id, "player");
    graph = await connect(graph, spawnNode.id, "spawn", gameOutputNode.id, "spawn");
    graph = await connect(graph, modelEntityNode.id, "entity", gameOutputNode.id, "entities");

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
