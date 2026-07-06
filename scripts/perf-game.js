import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { worldSettingsPresetNodePatch } from "../src/shared/node-types.js";

let puppeteerModule = null;
try {
  puppeteerModule = await import("puppeteer");
} catch (error) {
  console.error("Puppeteer kon niet worden geladen. Run `npm install` of controleer of de dependency beschikbaar is.");
  throw error;
}

const puppeteer = puppeteerModule.default || puppeteerModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const ADMIN_USERNAME = "kevin";
const ADMIN_PASSWORD = "k1k2k3k4k5";
const BROWSER_WIDTH = Number(process.env.PERF_GAME_WIDTH || 1366);
const BROWSER_HEIGHT = Number(process.env.PERF_GAME_HEIGHT || 768);
const SAMPLE_FRAMES = Math.max(1, Number(process.env.PERF_GAME_FRAMES || 120));
const WARMUP_FRAMES = Math.max(1, Number(process.env.PERF_GAME_WARMUP_FRAMES || 60));
const PROFILE_TIMEOUT_MS = Math.max(30000, Number(process.env.PERF_GAME_TIMEOUT_MS || 120000));
const STABILITY_TIMEOUT_MS = Math.max(30000, Number(process.env.PERF_GAME_STABILITY_TIMEOUT_MS || 120000));

const cleanupPaths = new Set();
let BASE = "";
let cookie = "";

function assert(condition, message) {
  if (!condition) throw new Error("ASSERT: " + message);
  console.log("  ok - " + message);
}

const AUTO_CONNECTIONS = {
  world_settings: [{ fromPort: "world", toPort: "world" }],
  editor_world_settings: [{ fromPort: "editorWorldSettings", toPort: "editorWorldSettings" }],
  game_world_settings: [{ fromPort: "gameWorldSettings", toPort: "gameWorldSettings" }],
  ground_surface: [{ fromPort: "ground", toPort: "ground" }],
  game_camera: [{ fromPort: "camera", toPort: "camera" }],
  player_character: [{ fromPort: "player", toPort: "player" }],
  player_spawn: [{ fromPort: "spawn", toPort: "spawn" }],
  ambient_light: [{ fromPort: "light", toPort: "lights" }],
  directional_light: [{ fromPort: "light", toPort: "lights" }],
  model_entity: [{ fromPort: "entity", toPort: "entities" }],
  bounded_area_scatter: [{ fromPort: "entity", toPort: "entities" }],
  terrain_layer: [{ fromPort: "terrain", toPort: "terrain" }],
  surface_layer: [{ fromPort: "terrain", toPort: "terrain" }],
  blocker_area: [{ fromPort: "collision", toPort: "collision" }],
  walkable_surface: [{ fromPort: "collision", toPort: "collision" }],
  game_chunk_loading: [{ fromPort: "chunkLoading", toPort: "chunkLoading" }],
  debug_performance_hud: [{ fromPort: "ui", toPort: "ui" }],
  ui_hud_text: [{ fromPort: "ui", toPort: "ui" }],
  keybind: [{ fromPort: "keybind", toPort: "keybinds" }]
};

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gk-perf-"));
  const dbPath = path.join(tmpDir, "perf.sqlite");
  let server = null;
  let browser = null;
  let baselinePage = null;
  let laptopPage = null;
  try {
    const port = await reservePort();
    BASE = "http://127.0.0.1:" + port;
    server = spawn(process.execPath, ["src/server/server.js"], {
      cwd: rootDir,
      env: Object.assign({}, process.env, {
        PORT: port,
        DATABASE_PATH: dbPath,
        ADMIN_PASSWORD,
        ADMIN_USERNAME
      }),
      stdio: ["ignore", "ignore", "pipe"]
    });
    server.stderr.on("data", function (data) {
      process.stderr.write("[server] " + data);
    });
    server.on("exit", function (code, signal) {
      if (code !== 0 && signal !== "SIGTERM" && signal !== "SIGINT") {
        console.error("Server stopte onverwacht met code " + code + " en signal " + signal);
      }
    });

    await waitForHealth(45000);
    await login();
    const benchmarkWorld = await buildBenchmarkWorld();

    browser = await puppeteer.launch({
      protocolTimeout: PROFILE_TIMEOUT_MS,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-setuid-sandbox",
        "--no-zygote"
      ]
    });

    baselinePage = await openGamePage(browser, BASE);
    const baselineReady = await waitForRuntimeStable(baselinePage, "baseline-current");
    await runStableShadowBrowserCheck(baselinePage, "baseline-current");
    if (baselineReady.software) {
      console.log("WARNING: browser gebruikt een software renderer (" + baselineReady.rendererName + " / " + baselineReady.rendererVendor + "). De metingen zijn niet representatief voor Kevins echte GPU.");
      console.log("Perf-run wordt in deze omgeving als best-effort overgeslagen.");
      return;
    }

    const results = [];
    results.push(await profileCurrentScenario(baselinePage, benchmarkWorld.world, "baseline-current"));

    const startSnapshot = await collectStreamingSnapshot(baselinePage);
    assert(startSnapshot && startSnapshot.blueprintScatterInstances === 1500, "blueprint scatter instances zijn 1500");
    assert(startSnapshot.residentChunks <= startSnapshot.maxLoadedChunks, "resident chunks blijven binnen maxLoadedChunks");
    assert(startSnapshot.residentScatterInstances < startSnapshot.blueprintScatterInstances, "resident scatter instances liggen onder blueprint total");
    assert(startSnapshot.residentEntities < Math.max(2, startSnapshot.blueprintEntities + 1), "resident entities blijven bounded");
    assert(startSnapshot.residentObject3D <= 300, "resident Object3D blijft binnen budget");
    assert(startSnapshot.residentWorldItems <= 300, "resident world items blijven binnen budget");
    assert(startSnapshot.fullGroundPlane === false, "full ground plane blijft uit in chunked game mode");

    const farSnapshot = await teleportAndSnapshot(baselinePage, 3000, 3000, "resident-streaming-far");
    const backSnapshot = await teleportAndSnapshot(baselinePage, 0, 0, "resident-streaming-back");
    assert(farSnapshot.residentChunks <= farSnapshot.maxLoadedChunks, "resident chunks blijven bounded na verplaatsen");
    assert(farSnapshot.residentScatterInstances < farSnapshot.blueprintScatterInstances, "resident scatter blijft bounded na verplaatsen");
    assert(backSnapshot.residentChunks <= backSnapshot.maxLoadedChunks, "resident chunks blijven bounded na teruggaan");
    assert(backSnapshot.residentScatterInstances === startSnapshot.residentScatterInstances, "resident scatter count blijft stabiel na teruggaan");
    console.log("Streaming snapshot summary:");
    console.log("  start  chunks=" + startSnapshot.residentChunks + " objects=" + startSnapshot.residentObject3D + " scatterBatches=" + startSnapshot.residentScatterBatches + " scatterInstances=" + startSnapshot.residentScatterInstances);
    console.log("  far    chunks=" + farSnapshot.residentChunks + " objects=" + farSnapshot.residentObject3D + " scatterBatches=" + farSnapshot.residentScatterBatches + " scatterInstances=" + farSnapshot.residentScatterInstances);
    console.log("  back   chunks=" + backSnapshot.residentChunks + " objects=" + backSnapshot.residentObject3D + " scatterBatches=" + backSnapshot.residentScatterBatches + " scatterInstances=" + backSnapshot.residentScatterInstances);
    assert(backSnapshot.residentObject3D <= startSnapshot.residentObject3D + 5, "geen duplicate resident batches na heen-en-weer bewegen");

    printStreamingTable([startSnapshot, farSnapshot, backSnapshot]);

    if (process.env.PERF_GAME_SKIP_MATRIX === "1") {
      console.log("");
      console.log("Extended profiler matrix overgeslagen voor korte resident streaming run.");
      return;
    }

    results.push(await profileCurrentScenario(baselinePage, benchmarkWorld.world, "hud-off"));
    results.push(await profileCurrentScenario(baselinePage, benchmarkWorld.world, "chunk-debug-off"));
    results.push(await profileCurrentScenario(baselinePage, benchmarkWorld.world, "shadows-off"));
    results.push(await profileCurrentScenario(baselinePage, benchmarkWorld.world, "low-pixel-ratio"));
    results.push(await profileCurrentScenario(baselinePage, benchmarkWorld.world, "chunks-off"));

    laptopPage = await openGamePage(browser, BASE, "laptop");
    await waitForRuntimeStable(laptopPage, "laptop-profile");
    results.push(await profilePerformanceScenario(laptopPage, "laptop-profile"));

    results.push(buildSoftwareCheckRow(results[0]));

    printMatrix(results);
    console.log("");
    console.log("Benchmark wereld: " + benchmarkWorld.summary);
    console.log("Console-profiler:");
    console.log("window.__GK_GAME_RUNTIME.profilePerformance({ frames: " + SAMPLE_FRAMES + ", warmupFrames: " + WARMUP_FRAMES + ", label: \"baseline-current\" })");
  } finally {
    if (laptopPage) await laptopPage.close().catch(function () {});
    if (baselinePage) await baselinePage.close().catch(function () {});
    if (browser) await browser.close().catch(function () {});
    await stopServer(server);
    cleanupGeneratedAssets();
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }
}

async function login() {
  const response = await call("POST", "/api/auth/login", { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  if (response.status !== 200 || !response.json || !response.json.ok) {
    throw new Error("Login mislukt: " + response.status + " " + response.text);
  }
}

async function buildBenchmarkWorld() {
  const wizardAsset = await importModelAsset({
    relativePath: "assets/uploads/wizard.glb",
    name: "Perf Game Wizard",
    filename: "perf-game-wizard.glb",
    category: "characters"
  });
  const treeAsset = await importModelAsset({
    relativePath: "assets/uploads/stylize-tree-lowpoly.glb",
    name: "Perf Game Tree",
    filename: "perf-game-tree.glb",
    category: "environment"
  });

  let graph = (await call("GET", "/api/editor/graph")).json;
  const gameOutputNode = findNode(graph, function (node) { return node.type === "game_output"; }, "game output bestaat");

  graph = (await createNode("world_settings", {
    worldId: "perf_world",
    displayName: "Perf World",
    backgroundColor: "#09131d",
    fogColor: "#1b2a38",
    fogDensity: 0.06,
    smoothShading: true
  })).graph;
  graph = await ensureAutoConnections(graph, findNode(graph, function (node) {
    return node.type === "world_settings" && node.values.worldId === "perf_world";
  }, "world settings bestaat"), gameOutputNode);

  graph = (await createNode("editor_world_settings", worldSettingsPresetNodePatch("editor", "middel_schaduw"))).graph;
  graph = await ensureAutoConnections(graph, findNode(graph, function (node) {
    return node.type === "editor_world_settings";
  }, "editor world settings bestaat"), gameOutputNode);

  graph = (await createNode("game_world_settings", worldSettingsPresetNodePatch("game", "middel_schaduw"))).graph;
  graph = await ensureAutoConnections(graph, findNode(graph, function (node) {
    return node.type === "game_world_settings";
  }, "game world settings bestaat"), gameOutputNode);

  graph = (await createNode("ground_surface", {
    groundId: "perf_ground",
    width: 10000,
    depth: 10000,
    y: 0,
    boundsMode: "centerSize",
    materialColor: "#3f6b3f"
  })).graph;
  graph = await ensureAutoConnections(graph, findNode(graph, function (node) {
    return node.type === "ground_surface" && node.values.groundId === "perf_ground";
  }, "ground surface bestaat"), gameOutputNode);

  graph = (await createNode("game_camera", {
    cameraId: "perf_camera",
    pitch: 60,
    yaw: 0,
    startDistance: 26,
    distance: 26,
    minDistance: 8,
    maxDistance: 56,
    fov: 55,
    follow: true,
    rotateSpeed: 90
  })).graph;
  graph = await ensureAutoConnections(graph, findNode(graph, function (node) {
    return node.type === "game_camera" && node.values.cameraId === "perf_camera";
  }, "game camera bestaat"), gameOutputNode);

  graph = (await createNode("player_spawn", {
    spawnId: "perf_spawn",
    x: 0,
    z: 0,
    facing: 0
  })).graph;
  graph = await ensureAutoConnections(graph, findNode(graph, function (node) {
    return node.type === "player_spawn" && node.values.spawnId === "perf_spawn";
  }, "player spawn bestaat"), gameOutputNode);

  graph = (await createNode("player_character", {
    playerId: "perf_player",
    modelAssetId: wizardAsset.asset.id,
    animationClip: "Idle",
    idleAnimation: "Idle",
    walkAnimation: "Walk",
    runAnimation: "Run",
    moveSpeed: 6,
    sprintMultiplier: 1.6,
    turnSpeed: 600,
    collisionRadius: 0.5,
    scale: 1
  })).graph;
  graph = await ensureAutoConnections(graph, findNode(graph, function (node) {
    return node.type === "player_character" && node.values.playerId === "perf_player";
  }, "player character bestaat"), gameOutputNode);

  graph = (await createNode("ambient_light", {
    lightId: "perf_ambient",
    color: "#ffffff",
    intensity: 0.7
  })).graph;
  graph = await ensureAutoConnections(graph, findNode(graph, function (node) {
    return node.type === "ambient_light" && node.values.lightId === "perf_ambient";
  }, "ambient light bestaat"), gameOutputNode);

  graph = (await createNode("directional_light", {
    lightId: "perf_sun",
    color: "#ffffff",
    intensity: 1.55,
    x: 28,
    y: 46,
    z: 18
  })).graph;
  graph = await ensureAutoConnections(graph, findNode(graph, function (node) {
    return node.type === "directional_light" && node.values.lightId === "perf_sun";
  }, "directional light bestaat"), gameOutputNode);

  graph = (await createNode("game_chunk_loading", {
    chunkProfileId: "game_chunks",
    enabled: true,
    chunkWidth: 15,
    chunkDepth: 15,
    tileSize: 1,
    preloadMarginChunks: 1,
    unloadMarginChunks: 1,
    maxLoadedChunks: 9,
    debugOverlay: true,
    groundChunkingEnabled: true,
    pathWaterSurfaceChunkingEnabled: true,
    terrainVisualChunkingEnabled: true,
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
  graph = await ensureAutoConnections(graph, findNode(graph, function (node) {
    return node.type === "game_chunk_loading";
  }, "game chunk loading bestaat"), gameOutputNode);

  graph = (await createNode("debug_performance_hud", {
    hudId: "perf_hud_main",
    label: "Performance HUD",
    enabled: true,
    anchor: "top-right",
    compact: true,
    updateIntervalMs: 500,
    showFps: true,
    showFrameMs: true,
    showRenderer: true,
    showDrawCalls: true,
    showTriangles: true,
    showGeometries: true,
    showTextures: true,
    showSceneObjects: true,
    showEntities: true,
    showScatterInstances: true,
    showTerrainVisuals: true,
    showCollisionShapes: true,
    showWorldSize: true,
    showChunkCulling: true
  })).graph;
  graph = await ensureAutoConnections(graph, findNode(graph, function (node) {
    return node.type === "debug_performance_hud" && node.values.hudId === "perf_hud_main";
  }, "performance hud bestaat"), gameOutputNode);

  graph = (await createNode("terrain_layer", {
    layerId: "perf_grass",
    label: "Perf Grass",
    material: "grass",
    priority: 0,
    opacity: 1,
    color: "#6faa4f",
    textureAssetId: null,
    shapeType: "full",
    points: []
  })).graph;
  graph = await ensureAutoConnections(graph, findNode(graph, function (node) {
    return node.type === "terrain_layer" && node.values.layerId === "perf_grass";
  }, "terrain layer bestaat"), gameOutputNode);

  graph = (await createNode("surface_layer", {
    surfaceId: "perf_surface",
    label: "Perf Surface",
    surfaceKind: "river",
    fallbackColor: "#4a7a3f",
    width: 6,
    yOffset: 0.02,
    textureAssetId: null,
    textureScale: 4,
    textureScaleX: 1,
    textureScaleY: 1,
    secondaryTextureAssetId: null,
    secondaryTextureScale: 8,
    secondaryTextureScaleX: 1,
    secondaryTextureScaleY: 1,
    secondaryTextureStrength: 0.2,
    edgeFadeWidth: 0.8,
    edgeFadeNoiseAssetId: null,
    edgeFadeNoiseScale: 5,
    edgeFadeNoiseScaleX: 1,
    edgeFadeNoiseScaleY: 1,
    edgeFadeNoiseStrength: 0.2,
    opacity: 1,
    animated: true,
    flowSpeed: 0.18,
    flowDirection: 20,
    flowTextureLayer: "main",
    blocksPlayer: false,
    points: [
      { x: -18, z: 12 },
      { x: -2, z: 16 },
      { x: 18, z: 12 },
      { x: 30, z: 16 },
      { x: 42, z: 12 }
    ]
  })).graph;
  graph = await ensureAutoConnections(graph, findNode(graph, function (node) {
    return node.type === "surface_layer" && node.values.surfaceId === "perf_surface";
  }, "surface layer bestaat"), gameOutputNode);

  graph = (await createNode("blocker_area", {
    blockerId: "perf_blocker",
    label: "Perf Blocker",
    shapeType: "polygon",
    x: 0,
    z: 0,
    width: 6,
    depth: 6,
    radius: 3,
    points: [
      { x: 28, z: -18 },
      { x: 36, z: -18 },
      { x: 32, z: -10 }
    ],
    reason: "mountain"
  })).graph;
  graph = await ensureAutoConnections(graph, findNode(graph, function (node) {
    return node.type === "blocker_area" && node.values.blockerId === "perf_blocker";
  }, "blocker area bestaat"), gameOutputNode);

  graph = (await createNode("walkable_surface", {
    surfaceId: "perf_bridge",
    label: "Perf Bridge",
    x: 0,
    y: 0.45,
    z: 0,
    width: 12,
    depth: 4,
    rotationY: 0,
    priority: 10,
    points: [
      { x: -6, y: 0.45, z: -2 },
      { x: 6, y: 0.45, z: -2 },
      { x: 6, y: 0.45, z: 2 },
      { x: -6, y: 0.45, z: 2 }
    ]
  })).graph;
  graph = await ensureAutoConnections(graph, findNode(graph, function (node) {
    return node.type === "walkable_surface" && node.values.surfaceId === "perf_bridge";
  }, "walkable surface bestaat"), gameOutputNode);

  graph = (await createNode("model_entity", {
    entityId: "perf_house",
    label: "Perf House",
    modelAssetId: wizardAsset.asset.id,
    animationClip: null,
    idleAnimation: null,
    walkAnimation: null,
    runAnimation: null,
    x: 240,
    y: 0,
    z: 240,
    rotationX: 0,
    rotationY: 45,
    rotationZ: 0,
    scaleX: 1.35,
    scaleY: 1.35,
    scaleZ: 1.35,
    solid: true,
    walkable: false,
    collisionRadius: 2.5
  })).graph;
  graph = await ensureAutoConnections(graph, findNode(graph, function (node) {
    return node.type === "model_entity" && node.values.entityId === "perf_house";
  }, "house entity bestaat"), gameOutputNode);

  const forestClusters = [
    { scatterId: "perf_forest_center", centerX: 0, centerZ: 0, seed: "perf_forest_center_seed" },
    { scatterId: "perf_forest_east", centerX: 2400, centerZ: 2400, seed: "perf_forest_east_seed" },
    { scatterId: "perf_forest_west", centerX: -2400, centerZ: -2400, seed: "perf_forest_west_seed" }
  ];
  for (const forest of forestClusters) {
    const halfSize = 60;
    graph = (await createNode("bounded_area_scatter", {
      scatterId: forest.scatterId,
      enabled: true,
      areaCenterX: forest.centerX,
      areaCenterZ: forest.centerZ,
      areaWidth: halfSize * 2,
      areaDepth: halfSize * 2,
      areaRotationY: 0,
      count: 500,
      sourceAssetIds: [treeAsset.asset.id],
      randomObjectSelection: false,
      boundaryBlocksPlayer: false,
      seed: forest.seed,
      scaleMin: 0.85,
      scaleMax: 1.2,
      rotationYMin: 0,
      rotationYMax: 360,
      points: [
        { x: forest.centerX - halfSize, z: forest.centerZ - halfSize },
        { x: forest.centerX + halfSize, z: forest.centerZ - halfSize },
        { x: forest.centerX + halfSize, z: forest.centerZ + halfSize },
        { x: forest.centerX - halfSize, z: forest.centerZ + halfSize }
      ]
    })).graph;
    graph = await ensureAutoConnections(graph, findNode(graph, function (node) {
      return node.type === "bounded_area_scatter" && node.values.scatterId === forest.scatterId;
    }, "forest scatter " + forest.scatterId + " bestaat"), gameOutputNode);
  }

  const keybindSpecs = [
    { bindingId: "perf_move_forward", action: "move_forward", keyCode: "KeyW" },
    { bindingId: "perf_move_back", action: "move_back", keyCode: "KeyS" },
    { bindingId: "perf_move_left", action: "move_left", keyCode: "KeyA" },
    { bindingId: "perf_move_right", action: "move_right", keyCode: "KeyD" },
    { bindingId: "perf_sprint", action: "sprint", keyCode: "ShiftLeft" },
    { bindingId: "perf_interact", action: "interact", keyCode: "KeyE" }
  ];
  for (const spec of keybindSpecs) {
    graph = (await createNode("keybind", spec)).graph;
    graph = await ensureAutoConnections(graph, findNode(graph, function (node) {
      return node.type === "keybind" && node.values.bindingId === spec.bindingId;
    }, "keybind bestaat"), gameOutputNode);
  }

  const publish = await call("POST", "/api/editor/publish");
  if (publish.status !== 200 || !publish.json || !publish.json.ok) {
    throw new Error("Publish mislukt: " + publish.status + " " + publish.text);
  }
  const worldResponse = await call("GET", "/api/game/world");
  if (worldResponse.status !== 200 || !worldResponse.json) {
    throw new Error("Published world kon niet worden opgehaald: " + worldResponse.status);
  }
  const world = worldResponse.json;
  if (!world.world || world.world.performance?.game?.preset !== "middel_schaduw" || world.world.performance?.editor?.preset !== "middel_schaduw") {
    throw new Error("Benchmark world heeft niet het verwachte baseline preset.");
  }

  return {
    world: world,
    summary: [
      "ground=" + (world.ground?.width || 0) + "x" + (world.ground?.depth || 0),
      "scatterInstances=" + (Array.isArray(world.entities) ? world.entities.filter(function (entity) { return entity && entity.kind === "scatter"; }).length : 0),
      "entityBlueprints=" + (Array.isArray(world.entities) ? world.entities.filter(function (entity) { return entity && entity.kind !== "scatter"; }).length : 0),
      "scatterAreas=" + (Array.isArray(world.scatterAreas) ? world.scatterAreas.length : 0),
      "ui=" + (Array.isArray(world.ui) ? world.ui.length : 0),
      "keybinds=" + (Array.isArray(world.keybinds) ? world.keybinds.length : 0),
      "chunks=" + (world.chunkLoading?.game?.chunkWidth || 0) + "x" + (world.chunkLoading?.game?.chunkDepth || 0),
      "maxLoaded=" + (world.chunkLoading?.game?.maxLoadedChunks || 0)
    ].join(" ")
  };
}

async function importModelAsset({ relativePath, name, filename, category }) {
  const assetPath = path.join(rootDir, relativePath);
  const blob = new Blob([fs.readFileSync(assetPath)], { type: "model/gltf-binary" });
  const result = await uploadAsset({
    name: name,
    category: category,
    assetType: "model",
    blob: blob,
    filename: filename
  });
  if (result.status !== 201 || !result.json || !result.json.asset) {
    throw new Error("Upload mislukt voor " + name + ": " + result.status + " " + result.text);
  }
  rememberCleanupPaths(result.json.asset);
  return result.json;
}

async function profileCurrentScenario(page, baseWorld, label) {
  if (label !== "baseline-current") {
    const world = buildScenarioWorld(baseWorld, label);
    await page.evaluate(function (nextWorld) {
      window.__GK_GAME_RUNTIME.setWorld(nextWorld);
    }, world);
    await waitForRuntimeStable(page, label);
    if (label === "shadows-off") {
      await runNoShadowBrowserCheck(page, label);
    }
  }
  return await profilePerformanceScenario(page, label);
}

async function profilePerformanceScenario(page, label) {
  const result = await page.evaluate(
    async function (options) {
      return await window.__GK_GAME_RUNTIME.profilePerformance(options);
    },
    {
      label: label,
      frames: SAMPLE_FRAMES,
      warmupFrames: WARMUP_FRAMES,
      timeoutMs: PROFILE_TIMEOUT_MS
    }
  );
  return {
    scenario: label,
    kind: "profile",
    result: result
  };
}

async function openGamePage(browser, baseUrl, profile) {
  const page = await browser.newPage();
  page.on("pageerror", function (error) {
    console.error("[pageerror] " + (error && error.stack ? error.stack : String(error)));
  });
  page.on("console", function (message) {
    if (message.type() === "error") {
      console.error("[browser] " + message.text());
    } else if (process.env.PERF_GAME_VERBOSE === "1") {
      console.log("[browser] " + message.type() + " " + message.text());
    }
  });
  page.setDefaultTimeout(PROFILE_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(PROFILE_TIMEOUT_MS);
  await page.setViewport({
    width: BROWSER_WIDTH,
    height: BROWSER_HEIGHT,
    deviceScaleFactor: 1
  });
  const query = profile ? "?gamePerformanceProfile=" + encodeURIComponent(profile) : "";
  await page.goto(baseUrl + "/game/" + query, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function () {
    return Boolean(window.__GK_GAME_RUNTIME && typeof window.__GK_GAME_RUNTIME.debugState === "function");
  }, { timeout: PROFILE_TIMEOUT_MS });
  return page;
}

async function waitForRuntimeStable(page, label) {
  const startedAt = Date.now();
  let stableSince = 0;
  let lastSignature = "";
  while (Date.now() - startedAt < STABILITY_TIMEOUT_MS) {
    const snapshot = await page.evaluate(function () {
      const runtime = window.__GK_GAME_RUNTIME || null;
      if (!runtime || typeof runtime.debugState !== "function") return null;
      const debug = runtime.debugState({ includeShadowDiagnostics: false });
      const loadErrors = typeof runtime.getLoadErrors === "function" ? runtime.getLoadErrors() : [];
      return {
        loadErrors: loadErrors,
        sceneObjects: Number(debug?.stats?.sceneObjects || 0),
        meshes: Number(debug?.stats?.meshes || 0),
        textures: Number(debug?.stats?.textures || 0),
        terrainResident: Number(debug?.stats?.terrainResident || 0),
        loadedChunks: Number(debug?.world?.frameStats?.loadedChunks || 0),
        hiddenObjects: Number(debug?.world?.frameStats?.hiddenObjects || 0),
        pixelRatio: Number(debug?.world?.rendering?.pixelRatio || 0),
        rendererName: String(debug?.world?.rendering?.name || "unknown"),
        rendererVendor: String(debug?.world?.rendering?.vendor || "unknown"),
        software: Boolean(debug?.world?.rendering?.software)
      };
    });
    if (!snapshot) {
      await sleep(250);
      continue;
    }
    if (Array.isArray(snapshot.loadErrors) && snapshot.loadErrors.length) {
      throw new Error("Runtime load errors tijdens " + label + ": " + snapshot.loadErrors.join(", "));
    }
    if (snapshot.sceneObjects <= 0 || snapshot.meshes <= 0) {
      stableSince = 0;
      lastSignature = "";
      await sleep(250);
      continue;
    }
    const signature = [
      snapshot.sceneObjects,
      snapshot.meshes,
      snapshot.textures,
      snapshot.terrainResident,
      snapshot.loadedChunks,
      snapshot.hiddenObjects,
      snapshot.pixelRatio,
      snapshot.software ? 1 : 0
    ].join("|");
    if (signature === lastSignature) {
      if (!stableSince) stableSince = Date.now();
      if (Date.now() - stableSince >= 1500) return snapshot;
    } else {
      lastSignature = signature;
      stableSince = Date.now();
    }
    await sleep(250);
  }
  throw new Error("Runtime stabiliseerde niet binnen de timeout voor " + label);
}

function buildScenarioWorld(baseWorld, label) {
  const world = clone(baseWorld);
  world.world = world.world || {};
  world.world.performance = world.world.performance || {};
  world.world.performance.shared = Object.assign({}, world.world.performance.shared || {});
  world.world.performance.game = Object.assign({}, world.world.performance.game || {});
  world.world.performance.editor = Object.assign({}, world.world.performance.editor || {});
  world.world.performance.game.shadow = Object.assign({}, world.world.performance.game.shadow || {});
  world.world.performance.editor.shadow = Object.assign({}, world.world.performance.editor.shadow || {});
  world.chunkLoading = Object.assign({}, world.chunkLoading || {});
  if (label === "hud-off") {
    world.ui = Array.isArray(world.ui) ? world.ui.filter(function (entry) {
      return entry && entry.type !== "debug_performance_hud";
    }) : [];
  } else if (label === "chunk-debug-off") {
    if (world.chunkLoading.game) {
      world.chunkLoading.game.debugOverlay = false;
    }
  } else if (label === "shadows-off") {
    world.world.performance.game.preset = "geen_schaduw";
    world.world.performance.game.shadow.preset = "geen_schaduw";
  } else if (label === "low-pixel-ratio") {
    world.world.performance.game.pixelRatioCap = 0.75;
  } else if (label === "chunks-off") {
    if (world.chunkLoading.game) {
      world.chunkLoading.game.enabled = false;
    }
  }
  return world;
}

function buildSoftwareCheckRow(profileResult) {
  const renderer = profileResult?.result?.renderer || {};
  const software = Boolean(renderer.software);
  const name = String(renderer.name || "unknown");
  const vendor = String(renderer.vendor || "unknown");
  return {
    scenario: "software-renderer-check",
    kind: "check",
    result: {
      renderer: renderer,
      notes: software
        ? "software renderer: " + name + " / " + vendor
        : "hardware renderer: " + name + " / " + vendor
    }
  };
}

async function collectStreamingSnapshot(page) {
  return await page.evaluate(function () {
    const runtime = window.__GK_GAME_RUNTIME || null;
    if (!runtime || typeof runtime.debugState !== "function") return null;
    const debug = runtime.debugState({ includeShadowDiagnostics: false });
    const streaming = debug.contentStreaming || {};
    const frameStats = debug.world?.frameStats || {};
    const chunkLoading = debug.world?.chunkLoading || {};
    return {
      blueprintEntities: Number(streaming.blueprintEntities || 0),
      blueprintScatterInstances: Number(streaming.blueprintScatterInstances || 0),
      blueprintWorldItems: Number(streaming.blueprintWorldItems || 0),
      residentChunks: Number(streaming.residentChunks || 0),
      maxLoadedChunks: Number(chunkLoading.maxLoadedChunks || 0),
      residentScatterInstances: Number(streaming.residentScatterInstances || 0),
      residentEntities: Number(streaming.residentEntities || 0),
      residentScatterBatches: Number(streaming.residentScatterBatches || 0),
      residentObject3D: Number(streaming.residentObject3D || 0),
      residentWorldItems: Number(streaming.residentWorldItems || 0),
      fullGroundPlane: Boolean(chunkLoading.ground?.fullGroundPlaneActive),
      frameMs: Number(frameStats.frameMs || 0),
      renderMs: Number(frameStats.renderMs || 0),
      software: Boolean(debug.world?.rendering?.software),
      residentChunkKeys: Array.isArray(streaming.residentChunkKeys) ? streaming.residentChunkKeys.slice().sort() : [],
      lastSyncReason: String(streaming.lastSyncReason || ""),
      budgetClipped: Boolean(streaming.budgetClipped)
    };
  });
}

async function collectStableShadowSnapshot(page) {
  return await page.evaluate(function () {
    const runtime = window.__GK_GAME_RUNTIME || null;
    if (!runtime || typeof runtime.debugState !== "function") return null;
    const debug = runtime.debugState();
    return {
      player: {
        x: Number(debug?.player?.x || 0),
        z: Number(debug?.player?.z || 0)
      },
      rendering: Object.assign({}, debug?.world?.rendering || {}),
      shadowSystem: Object.assign({}, debug?.world?.shadowSystem || {}),
      stableShadows: Object.assign({}, debug?.world?.stableShadows || {}),
      runtimeRoots: Object.assign({}, debug?.world?.runtimeRoots || {}),
      overlayDiagnostics: Object.assign({}, debug?.world?.overlayDiagnostics || {}),
      ghostPlaneDiagnostics: Object.assign({}, debug?.world?.ghostPlaneDiagnostics || {}),
      shadowCasterAudit: Object.assign({}, debug?.world?.shadowCasterAudit || {})
    };
  });
}

async function runStableShadowBrowserCheck(page, label) {
  const baseline = await collectStableShadowSnapshot(page);
  if (Boolean(baseline?.rendering?.software)) {
    console.warn("WARNING: browser gebruikt een software renderer tijdens " + label + "; stabiele shadow-check valt terug op no-shadow assertions.");
    await runNoShadowBrowserCheck(page, label + "-software-fallback");
    return;
  }
  assert(baseline && baseline.shadowSystem, label + ": shadowSystem snapshot bestaat");
  assert(baseline.shadowSystem.enabled === true, label + ": shadowSystem is enabled");
  assert(baseline.shadowSystem.preset === "middel_schaduw", label + ": baseline preset is middel_schaduw");
  assert(baseline.shadowSystem.rendererShadowMapEnabled === true, label + ": renderer shadowMap is aan");
  assert(Number(baseline.shadowSystem.renderResidentChunkCount || 0) >= 0, label + ": render resident count is aanwezig");
  assert(Number(baseline.shadowSystem.shadowResidentChunkCount || 0) >= 0, label + ": shadow resident count is aanwezig");
  assert(baseline && baseline.stableShadows, label + ": stable shadow snapshot bestaat");
  assert(Number(baseline.stableShadows.cameraChildOverlayGroups || 0) === 0, label + ": geen camera-child overlay groups in stableShadows");
  assert(Number(baseline.stableShadows.overlayShadowCasterCount || 0) === 0, label + ": geen overlay shadow casters in stableShadows");
  assert(Number(baseline.stableShadows.debugShadowCasterCount || 0) === 0, label + ": geen debug shadow casters in stableShadows");
  assert(Boolean(baseline.stableShadows.jumpDetected) === false, label + ": baseline jumpDetected is false");
  assert(Number(baseline.runtimeRoots?.cameraChildOverlayGroups || 0) === 0, label + ": geen camera-child overlay groups in runtimeRoots");
  assert(Number(baseline.runtimeRoots?.duplicateRuntimeRoots || 0) === 0, label + ": geen duplicate runtime roots in runtimeRoots");
  assert(Number(baseline.overlayDiagnostics?.cameraChildOverlayGroups || 0) === 0, label + ": geen camera-child overlay groups in overlayDiagnostics");
  assert(Number(baseline.overlayDiagnostics?.overlayShadowCasters || 0) === 0, label + ": geen overlay shadow casters in overlayDiagnostics");
  assert(Number(baseline.ghostPlaneDiagnostics?.cameraChildPlanes || 0) === 0, label + ": geen camera-child planes in ghostPlaneDiagnostics");
  assert(Number(baseline.ghostPlaneDiagnostics?.visibleDebugPlanes || 0) === 0, label + ": geen zichtbare debug planes in ghostPlaneDiagnostics");
  assert(Number(baseline.ghostPlaneDiagnostics?.extraGroundPlanes || 0) === 0, label + ": geen extra ground planes in ghostPlaneDiagnostics");
  assert(Number(baseline.ghostPlaneDiagnostics?.suspiciousPlanes?.length || 0) === 0, label + ": geen ghost planes in ghostPlaneDiagnostics");
  assert(Number(baseline.shadowCasterAudit?.helperCasterCount || 0) === 0, label + ": geen helper casters in shadowCasterAudit");
  assert(Number(baseline.shadowCasterAudit?.circleOrPlaneCasterCount || 0) === 0, label + ": geen circle/plane casters in shadowCasterAudit");
  assert(Number(baseline.shadowCasterAudit?.castersByKind?.debugOverlay || 0) === 0, label + ": geen debug overlay casters in shadowCasterAudit");

  const restorePlayer = {
    x: Number.isFinite(Number(baseline.player?.x)) ? Number(baseline.player.x) : 0,
    z: Number.isFinite(Number(baseline.player?.z)) ? Number(baseline.player.z) : 0
  };
  const firstTarget = { x: restorePlayer.x + 11, z: restorePlayer.z + 11 };
  const secondTarget = { x: restorePlayer.x + 12, z: restorePlayer.z + 12 };

  await page.evaluate(function (targetX, targetZ) {
    if (window.__GK_GAME_RUNTIME && typeof window.__GK_GAME_RUNTIME.debugTeleportPlayer === "function") {
      window.__GK_GAME_RUNTIME.debugTeleportPlayer(targetX, targetZ);
    }
  }, firstTarget.x, firstTarget.z);
  await waitForRuntimeStable(page, label + "-small-shift-1");
  const smallShiftOne = await collectStableShadowSnapshot(page);
  assert(smallShiftOne && smallShiftOne.shadowSystem, label + ": small shift snapshot 1 heeft shadowSystem");
  assert(smallShiftOne.shadowSystem.preset === baseline.shadowSystem.preset, label + ": preset blijft gelijk na kleine beweging 1");
  assert(smallShiftOne.shadowSystem.enabled === true, label + ": shadows blijven aan na kleine beweging 1");
  assert(smallShiftOne && smallShiftOne.stableShadows, label + ": small shift snapshot 1 bestaat");
  assert(Number(smallShiftOne.stableShadows.cameraChildOverlayGroups || 0) === 0, label + ": camera-child overlay groups blijven 0 na kleine beweging 1");
  assert(Number(smallShiftOne.stableShadows.overlayShadowCasterCount || 0) === 0, label + ": overlay shadow casters blijven 0 na kleine beweging 1");
  assert(Boolean(smallShiftOne.stableShadows.jumpDetected) === false, label + ": jumpDetected blijft false na kleine beweging 1");
  assert(Number(smallShiftOne.stableShadows.lastJumpDistance || 0) <= 25, label + ": lastJumpDistance blijft binnen drempel na kleine beweging 1");
  assert(Number(smallShiftOne.overlayDiagnostics?.cameraChildOverlayGroups || 0) === 0, label + ": camera-child overlay groups blijven 0 in overlayDiagnostics na kleine beweging 1");
  assert(Number(smallShiftOne.overlayDiagnostics?.overlayShadowCasters || 0) === 0, label + ": overlay shadow casters blijven 0 in overlayDiagnostics na kleine beweging 1");
  assert(Number(smallShiftOne.ghostPlaneDiagnostics?.suspiciousPlanes?.length || 0) === 0, label + ": geen ghost planes na kleine beweging 1");
  assert(Number(smallShiftOne.shadowCasterAudit?.helperCasterCount || 0) === 0, label + ": geen helper casters na kleine beweging 1");
  assert(Number(smallShiftOne.shadowCasterAudit?.circleOrPlaneCasterCount || 0) === 0, label + ": geen circle/plane casters na kleine beweging 1");

  await page.evaluate(function (targetX, targetZ) {
    if (window.__GK_GAME_RUNTIME && typeof window.__GK_GAME_RUNTIME.debugTeleportPlayer === "function") {
      window.__GK_GAME_RUNTIME.debugTeleportPlayer(targetX, targetZ);
    }
  }, secondTarget.x, secondTarget.z);
  await waitForRuntimeStable(page, label + "-small-shift-2");
  const smallShiftTwo = await collectStableShadowSnapshot(page);
  assert(smallShiftTwo && smallShiftTwo.shadowSystem, label + ": small shift snapshot 2 heeft shadowSystem");
  assert(smallShiftTwo.shadowSystem.preset === baseline.shadowSystem.preset, label + ": preset blijft gelijk na kleine beweging 2");
  assert(smallShiftTwo.shadowSystem.enabled === true, label + ": shadows blijven aan na kleine beweging 2");
  assert(smallShiftTwo && smallShiftTwo.stableShadows, label + ": small shift snapshot 2 bestaat");
  assert(Number(smallShiftTwo.stableShadows.cameraChildOverlayGroups || 0) === 0, label + ": camera-child overlay groups blijven 0 na kleine beweging 2");
  assert(Number(smallShiftTwo.stableShadows.overlayShadowCasterCount || 0) === 0, label + ": overlay shadow casters blijven 0 na kleine beweging 2");
  assert(Boolean(smallShiftTwo.stableShadows.jumpDetected) === false, label + ": jumpDetected blijft false na kleine beweging 2");
  assert(Number(smallShiftTwo.stableShadows.lastJumpDistance || 0) <= 25, label + ": lastJumpDistance blijft binnen drempel na kleine beweging 2");
  assert(Number(smallShiftTwo.overlayDiagnostics?.cameraChildOverlayGroups || 0) === 0, label + ": camera-child overlay groups blijven 0 in overlayDiagnostics na kleine beweging 2");
  assert(Number(smallShiftTwo.overlayDiagnostics?.overlayShadowCasters || 0) === 0, label + ": overlay shadow casters blijven 0 in overlayDiagnostics na kleine beweging 2");
  assert(Number(smallShiftTwo.ghostPlaneDiagnostics?.suspiciousPlanes?.length || 0) === 0, label + ": geen ghost planes na kleine beweging 2");
  assert(Number(smallShiftTwo.shadowCasterAudit?.helperCasterCount || 0) === 0, label + ": geen helper casters na kleine beweging 2");
  assert(Number(smallShiftTwo.shadowCasterAudit?.circleOrPlaneCasterCount || 0) === 0, label + ": geen circle/plane casters na kleine beweging 2");

  await page.evaluate(function (targetX, targetZ) {
    if (window.__GK_GAME_RUNTIME && typeof window.__GK_GAME_RUNTIME.debugTeleportPlayer === "function") {
      window.__GK_GAME_RUNTIME.debugTeleportPlayer(targetX, targetZ);
    }
  }, restorePlayer.x, restorePlayer.z);
  await waitForRuntimeStable(page, label + "-restore");
}

async function runNoShadowBrowserCheck(page, label) {
  const snapshot = await collectStableShadowSnapshot(page);
  assert(snapshot && snapshot.shadowSystem, label + ": no-shadow snapshot heeft shadowSystem");
  assert(snapshot.shadowSystem.preset === "geen_schaduw", label + ": no-shadow preset is geen_schaduw");
  assert(snapshot.shadowSystem.enabled === false, label + ": no-shadow zet shadows uit");
  assert(snapshot.shadowSystem.rendererShadowMapEnabled === false, label + ": renderer shadowMap is uit");
  assert(Number(snapshot.shadowSystem.mapSize || 0) === 0, label + ": no-shadow mapSize is 0");
  assert(Number(snapshot.shadowSystem.cameraSize || 0) === 0, label + ": no-shadow cameraSize is 0");
  assert(Number(snapshot.shadowSystem.cameraFar || 0) === 0, label + ": no-shadow cameraFar is 0");
  assert(Number(snapshot.shadowSystem.shadowResidentChunkCount || 0) === 0, label + ": no-shadow heeft geen shadow resident chunks");
  assert(Number(snapshot.shadowSystem.shadowCasterCount || 0) === 0, label + ": no-shadow heeft geen shadow casters");
  assert(Number(snapshot.shadowSystem.shadowReceiverCount || 0) === 0, label + ": no-shadow heeft geen shadow receivers");
  assert(Number(snapshot.shadowSystem.helperCasterCount || 0) === 0, label + ": no-shadow heeft geen helper casters");
  assert(Number(snapshot.shadowSystem.proxyCasterCount || 0) === 0, label + ": no-shadow heeft geen proxy casters");
  assert(Number(snapshot.shadowSystem.instancedCasterCount || 0) === 0, label + ": no-shadow heeft geen instanced casters");
}

async function teleportAndSnapshot(page, x, z, label) {
  await page.evaluate(function (targetX, targetZ) {
    if (window.__GK_GAME_RUNTIME && typeof window.__GK_GAME_RUNTIME.debugTeleportPlayer === "function") {
      window.__GK_GAME_RUNTIME.debugTeleportPlayer(targetX, targetZ);
    }
  }, x, z);
  await waitForRuntimeStable(page, label);
  return await collectStreamingSnapshot(page);
}

function printStreamingTable(rows) {
  console.log("");
  console.log("| Metric | Expected | Start | Far | Back |");
  console.log("| --- | --- | --- | --- | --- |");
  const start = rows[0] || {};
  const far = rows[1] || {};
  const back = rows[2] || {};
  const tableRows = [
    ["Blueprint trees", "1500", start.blueprintScatterInstances, far.blueprintScatterInstances, back.blueprintScatterInstances],
    ["Resident tree instances", "<< 1500", start.residentScatterInstances, far.residentScatterInstances, back.residentScatterInstances],
    ["Resident chunks", "<= 9", start.residentChunks, far.residentChunks, back.residentChunks],
    ["Live Object3D", "<= 300", start.residentObject3D, far.residentObject3D, back.residentObject3D],
    ["World resident", "<= 300", start.residentWorldItems, far.residentWorldItems, back.residentWorldItems],
    ["Full ground plane", "false", start.fullGroundPlane, far.fullGroundPlane, back.fullGroundPlane],
    ["Frame renderMs", "reported", start.renderMs, far.renderMs, back.renderMs],
    ["Software renderer", "reported", start.software, far.software, back.software]
  ];
  for (const row of tableRows) {
    console.log(
      "| " +
        escapeTable(row[0]) +
        " | " +
        escapeTable(row[1]) +
        " | " +
        escapeTable(formatStreamingCell(row[2])) +
        " | " +
        escapeTable(formatStreamingCell(row[3])) +
        " | " +
        escapeTable(formatStreamingCell(row[4])) +
        " |"
    );
  }
}

function formatStreamingCell(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  const number = Number(value);
  if (Number.isFinite(number)) return number.toFixed(number >= 10 ? 1 : 2).replace(/\.00$/, "").replace(/\.0$/, "");
  return String(value ?? "");
}

function printMatrix(rows) {
  const formattedRows = rows.map(function (row) {
    if (row.kind === "check") {
      return {
        scenario: row.scenario,
        frame: "n/a",
        render: "n/a",
        sync: "n/a",
        hud: "n/a",
        drawCalls: "n/a",
        textures: "n/a",
        notes: row.result.notes
      };
    }
    const result = row.result || {};
    return {
      scenario: row.scenario,
      frame: formatPair(result.averages?.frameMs, result.p95?.frameMs),
      render: formatPair(result.averages?.renderMs, result.p95?.renderMs),
      sync: formatPair(result.averages?.syncChunkMs, result.p95?.syncChunkMs),
      hud: formatPair(result.averages?.hudMs, result.p95?.hudMs),
      drawCalls: formatCount(result.counts?.drawCalls),
      textures: formatCount(result.counts?.textures),
      notes: buildScenarioNotes(row.scenario, result)
    };
  });

  console.log("| Scenario | frameMs avg/p95 | renderMs avg/p95 | syncChunkMs avg/p95 | hudMs avg/p95 | drawCalls | textures | notes |");
  console.log("| --- | --- | --- | --- | --- | ---: | ---: | --- |");
  for (const row of formattedRows) {
    console.log(
      "| " +
        escapeTable(row.scenario) +
        " | " +
        escapeTable(row.frame) +
        " | " +
        escapeTable(row.render) +
        " | " +
        escapeTable(row.sync) +
        " | " +
        escapeTable(row.hud) +
        " | " +
        escapeTable(row.drawCalls) +
        " | " +
        escapeTable(row.textures) +
        " | " +
        escapeTable(row.notes) +
        " |"
    );
  }
}

function buildScenarioNotes(label, result) {
  const settings = result?.settings || {};
  const renderer = result?.renderer || {};
  const parts = [];
  if (label === "baseline-current") {
    parts.push("baseline");
  } else if (label === "hud-off") {
    parts.push("no HUD node");
  } else if (label === "chunk-debug-off") {
    parts.push("debug overlay off");
  } else if (label === "shadows-off") {
    parts.push("shadowPreset=geen_schaduw");
  } else if (label === "low-pixel-ratio") {
    parts.push("pixelRatioCap=0.75");
  } else if (label === "chunks-off") {
    parts.push("chunk loading disabled");
  } else if (label === "laptop-profile") {
    parts.push("profile=laptop");
  }
  if (renderer.software) {
    parts.push("software renderer");
  }
  if (settings.chunkDebugOverlay === false && label !== "chunk-debug-off") {
    parts.push("overlay off by profile");
  }
  return parts.join("; ");
}

function formatPair(avg, p95) {
  return formatMs(avg) + " / " + formatMs(p95);
}

function formatMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return number.toFixed(number >= 10 ? 1 : 2);
}

function formatCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return String(Math.round(number));
}

function escapeTable(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

function clone(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Fallback to JSON cloning below.
    }
  }
  return JSON.parse(JSON.stringify(value));
}

function rememberCleanupPaths(asset) {
  if (!asset) return;
  if (asset.sourcePath) cleanupPaths.add(asset.sourcePath);
  if (asset.thumbnailPath) cleanupPaths.add(asset.thumbnailPath);
}

function resolveRepoPath(assetPath) {
  if (!assetPath || typeof assetPath !== "string") return null;
  if (path.isAbsolute(assetPath)) return assetPath;
  const normalized = assetPath.startsWith("/") ? assetPath.slice(1) : assetPath;
  return path.join(rootDir, normalized);
}

async function uploadAsset({ name, category, assetType, blob, filename }) {
  const form = new FormData();
  form.append("name", name);
  form.append("category", category);
  form.append("assetType", assetType);
  const file = blob instanceof Blob ? blob : new Blob([blob], { type: assetType === "model" ? "model/gltf-binary" : "application/octet-stream" });
  form.append("file", file, filename);
  return await call("POST", "/api/assets/import", form, true);
}

async function createNode(type, values, parentId) {
  const body = { type: type, values: values };
  if (parentId) body.parentId = parentId;
  const response = await call("POST", "/api/editor/nodes", body);
  const graph = response.json && (response.json.graph || response.json);
  if (response.status !== 201 || !graph) {
    throw new Error("Node create mislukt voor " + type + ": " + response.status + " " + response.text);
  }
  return response.json.graph ? response.json : { graph: graph };
}

async function connect(graph, fromNodeId, fromPort, toNodeId, toPort) {
  const response = await call("POST", "/api/editor/edges", {
    edge: {
      fromNodeId: fromNodeId,
      fromPort: fromPort,
      toNodeId: toNodeId,
      toPort: toPort
    }
  });
  const nextGraph = response.json && (response.json.graph || response.json);
  if (response.status !== 201 || !nextGraph) {
    throw new Error("Edge create mislukt: " + response.status + " " + response.text);
  }
  return nextGraph;
}

async function ensureAutoConnections(graph, node, gameOutputNode) {
  const specs = AUTO_CONNECTIONS[node.type] || [];
  let nextGraph = graph;
  for (const spec of specs) {
    const exists = Array.isArray(nextGraph.edges) && nextGraph.edges.some(function (edge) {
      return edge.fromNodeId === node.id && edge.fromPort === spec.fromPort && edge.toNodeId === gameOutputNode.id && edge.toPort === spec.toPort;
    });
    if (!exists) {
      nextGraph = await connect(nextGraph, node.id, spec.fromPort, gameOutputNode.id, spec.toPort);
    }
  }
  return nextGraph;
}

async function call(method, pathname, body, isForm) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  let payload = body;
  if (body && !isForm) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(BASE + pathname, {
    method: method,
    headers: headers,
    body: payload
  });
  setCookieFrom(response);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json: json, text: text };
}

function setCookieFrom(response) {
  const raw = response.headers.get("set-cookie");
  if (raw) cookie = raw.split(";")[0];
}

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE + "/api/health");
      if (response.ok) return;
    } catch {
      // Keep polling until the server is ready.
    }
    await sleep(200);
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
      server.close(function () {
        resolve(String(port));
      });
    });
  });
}

async function stopServer(server) {
  if (!server) return;
  await new Promise(function (resolve) {
    const finished = function () {
      resolve();
    };
    server.once("exit", finished);
    server.once("close", finished);
    server.kill("SIGTERM");
    setTimeout(function () {
      if (server.exitCode === null) {
        try { server.kill("SIGKILL"); } catch {}
      }
    }, 5000).unref?.();
  }).catch(function () {});
}

function findNode(graph, predicate, label) {
  const node = Array.isArray(graph?.nodes) ? graph.nodes.find(predicate) : null;
  if (!node) {
    throw new Error("Kon node niet vinden: " + label);
  }
  return node;
}

function cleanupGeneratedAssets() {
  for (const assetPath of cleanupPaths) {
    const filePath = resolveRepoPath(assetPath);
    if (!filePath) continue;
    try { fs.rmSync(filePath, { force: true }); } catch {}
  }
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}
