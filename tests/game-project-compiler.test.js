import assert from "node:assert/strict";
import test from "node:test";
import { GameProjectCompiler } from "../src/server/game-project-compiler.js";
import { GAME_PROJECT_SCHEMA_VERSION } from "../src/shared/node-contract.js";
import { foundationGraph } from "./fixtures.js";

test("game project compiler produces a connected manifest", function () {
  const graph = foundationGraph();
  const compiler = new GameProjectCompiler();
  const result = compiler.compile(graph, {
    legacyWorldBuilder() {
      return {
        world: { displayName: "Legacy World" },
        ui: []
      };
    }
  });

  assert.equal(result.connected, true);
  assert.equal(result.validation.ok, true);
  assert.equal(result.manifest.schemaVersion, GAME_PROJECT_SCHEMA_VERSION);
  assert.equal(result.manifest.project.id, "gk.project");
  assert.equal(result.manifest.chunkGrid.id, "chunk_grid.main");
  assert.equal(result.manifest.legacyWorld.world.displayName, "Legacy World");
  assert.equal(result.manifest.symbols.byId["global.game_name"].kind, "globalValue");
  assert.match(result.buildId, /^gk-[0-9a-f]{12}$/);
  assert.match(result.contentHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(result.dependencySummary.references, 0);
});

test("game project compiler carries the UI proof chain package", function () {
  const graph = foundationGraph();
  graph.nodes.push({
    id: "node_ui_output",
    type: "ui_output",
    title: "UI Output",
    parentId: null,
    x: 600,
    y: 300,
    values: { uiId: "ui.main" }
  }, {
    id: "node_hud_game_name",
    type: "ui_hud_text",
    title: "HUD Text",
    parentId: null,
    x: 600,
    y: 460,
    values: {
      moduleId: "hud_game_name",
      anchor: "top-left",
      text: "Welkom in @{global.game_name}",
      fontSize: 18,
      color: "#ffffff"
    }
  });
  graph.edges.push({
    id: "edge_hud_to_ui",
    fromNodeId: "node_hud_game_name",
    fromPort: "ui",
    toNodeId: "node_ui_output",
    toPort: "ui"
  }, {
    id: "edge_ui_to_assembly",
    fromNodeId: "node_ui_output",
    fromPort: "uiPackage",
    toNodeId: "node_world_assembly",
    toPort: "ui"
  });

  const compiler = new GameProjectCompiler();
  const result = compiler.compile(graph, { legacyWorldBuilder() { return { ui: [] }; } });

  assert.equal(result.connected, true);
  assert.equal(result.validation.ok, true);
  assert.equal(result.manifest.ui["ui.main"].kind, "uiPackage");
});

test("game project compiler publishes node02 zone package with default spawn and minimap", function () {
  const graph = foundationGraph();
  graph.nodes.find((node) => node.id === "node_project").values.startZoneRef = "zone.home";
  graph.nodes.find((node) => node.id === "node_project").values.startSpawnRef = "spawn.home.default";
  graph.nodes.push(
    {
      id: "node_zone_registry",
      type: "zone_registry",
      title: "Zone Registry",
      parentId: null,
      x: 300,
      y: 320,
      values: { registryId: "zone_registry.main" }
    },
    {
      id: "node_zone_def",
      type: "zone_definition",
      title: "Home Zone",
      parentId: null,
      x: 100,
      y: 520,
      values: {
        zoneId: "zone.home",
        displayName: "Home",
        zoneType: "outdoor_normal",
        originX: 0,
        originY: 0,
        originZ: 0,
        width: 500,
        depth: 500,
        minY: -100,
        maxY: 500,
        recommendedLevelMin: 1,
        recommendedLevelMax: 10,
        biomeTags: [],
        zoneTags: [],
        allowFastTravel: true,
        allowRespawn: true,
        activeByDefault: true
      }
    },
    {
      id: "node_zone_env",
      type: "zone_environment_settings",
      title: "Home Environment",
      parentId: null,
      x: 300,
      y: 520,
      values: {
        environmentId: "environment.home",
        backgroundColor: "#101a26",
        fogColor: "#101a26",
        fogDensity: 0,
        smoothShading: true,
        timeOfDayOffset: 0,
        shadowPresetOverride: "inherit"
      }
    },
    {
      id: "node_zone_ground",
      type: "ground_surface",
      title: "Home Ground",
      parentId: null,
      x: 500,
      y: 520,
      values: { groundId: "ground.home", width: 500, depth: 500, y: 0, boundsMode: "explicitBounds", minX: 0, maxX: 500, minZ: 0, maxZ: 500 }
    },
    {
      id: "node_zone_spawn",
      type: "spawn_point",
      title: "Home Default Spawn",
      parentId: null,
      x: 700,
      y: 520,
      values: {
        spawnId: "spawn.home.default",
        role: "zone_default",
        zoneRef: "zone.home",
        label: "Home Default",
        x: 20,
        y: 0,
        z: 20,
        facing: 45,
        safeRadius: 1.25,
        snapToGround: true,
        validateCollision: true,
        activationConditionRef: null,
        priority: 0
      }
    },
    {
      id: "node_zone_minimap",
      type: "minimap_bake",
      title: "Home Minimap",
      parentId: null,
      x: 900,
      y: 520,
      values: {
        minimapId: "minimap.home",
        zoneRef: "zone.home",
        sourceMode: "zone_bounds",
        label: "Home Minimap",
        enabled: true,
        resolution: "2048",
        imageQuality: 0.78,
        includeStaticModels: true,
        includeInteractables: false,
        hideEditorHelpers: true,
        bakedImageUrl: "/assets/uploads/minimap-home.webp",
        bakedImageWidth: 2048,
        bakedImageHeight: 2048,
        bakedAt: "2026-07-19T00:00:00.000Z",
        bakedWorldHash: "test",
        bakedBounds: null
      }
    },
    {
      id: "node_zone_output",
      type: "zone_output",
      title: "Home Zone Output",
      parentId: null,
      x: 1100,
      y: 520,
      values: { packageId: "zone.home.package", packageVersion: 1, includeEditorOnlyData: false }
    }
  );
  graph.edges.push(
    { id: "edge_zone_registry_to_assembly", fromNodeId: "node_zone_registry", fromPort: "zoneRegistry", toNodeId: "node_world_assembly", toPort: "zones" },
    { id: "edge_zone_output_to_registry", fromNodeId: "node_zone_output", fromPort: "zonePackage", toNodeId: "node_zone_registry", toPort: "zonePackage" },
    { id: "edge_zone_def_to_output", fromNodeId: "node_zone_def", fromPort: "zone", toNodeId: "node_zone_output", toPort: "zone" },
    { id: "edge_zone_env_to_output", fromNodeId: "node_zone_env", fromPort: "environment", toNodeId: "node_zone_output", toPort: "environment" },
    { id: "edge_zone_ground_to_output", fromNodeId: "node_zone_ground", fromPort: "ground", toNodeId: "node_zone_output", toPort: "ground" },
    { id: "edge_zone_spawn_to_output", fromNodeId: "node_zone_spawn", fromPort: "spawnPoint", toNodeId: "node_zone_output", toPort: "spawns" },
    { id: "edge_zone_minimap_to_output", fromNodeId: "node_zone_minimap", fromPort: "minimap", toNodeId: "node_zone_output", toPort: "minimap" }
  );

  const compiler = new GameProjectCompiler();
  const result = compiler.compile(graph, { legacyWorldBuilder() { return { ui: [] }; } });

  assert.equal(result.connected, true);
  assert.equal(result.validation.ok, true);
  assert.equal(result.manifest.runtime.activeZoneId, "zone.home");
  assert.equal(result.manifest.runtime.startSpawnId, "spawn.home.default");
  assert.equal(result.manifest.zones.zoneCount, 1);
  assert.equal(result.manifest.zones.byId["zone.home"].zone.bounds.maxX, 500);
  assert.equal(result.manifest.zones.byId["zone.home"].spawns[0].role, "zone_default");
  assert.equal(result.manifest.zones.byId["zone.home"].minimaps[0].resolution, 2048);
});
