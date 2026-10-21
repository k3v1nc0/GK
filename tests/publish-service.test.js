import assert from "node:assert/strict";
import test from "node:test";
import { buildWorldFromGraph } from "../src/server/publish-service.js";
import { mmoNetworkPresetNodePatch } from "../src/shared/node-types.js";

test("bounded scatter keeps boundary and per-item collision as separate compatible choices", function () {
  const asset = { id: "tree", name: "Tree", assetType: "model", metadata: {} };
  const assetService = {
    get(id) {
      return id === asset.id ? asset : null;
    },
    manifestForIds(ids) {
      return ids.includes(asset.id) ? [asset] : [];
    }
  };
  const graph = {
    nodes: [
      { id: "output", type: "game_output", values: {} },
      {
        id: "forest",
        type: "bounded_area_scatter",
        values: {
          scatterId: "forest",
          enabled: true,
          count: 1,
          sourceAssetIds: ["tree"],
          sourceScaleMultipliers: { tree: 1.5 },
          randomObjectSelection: false,
          boundaryBlocksPlayer: true,
          itemsBlockPlayer: true,
          collisionRadius: 0.75,
          groundCoverEnabled: true,
          groundColor: "#294d28",
          groundEdgeFade: 2.5,
          seed: "forest-test",
          scaleMin: 2,
          scaleMax: 2,
          rotationYMin: 0,
          rotationYMax: 0,
          points: [
            { x: -5, z: -5 },
            { x: 5, z: -5 },
            { x: 5, z: 5 },
            { x: -5, z: 5 }
          ]
        }
      }
    ],
    edges: [
      { id: "scatter_output", fromNodeId: "forest", fromPort: "entity", toNodeId: "output", toPort: "entities" }
    ]
  };

  const world = buildWorldFromGraph(graph, { assetService });

  assert.equal(world.entities.length, 1);
  assert.equal(world.entities[0].solid, true);
  assert.equal(world.entities[0].walkable, false);
  assert.equal(world.entities[0].collisionRadius, 2.25);
  assert.equal(world.collision.blockers.length, 1, "boundary collision remains available separately");
  assert.equal(world.collision.blockers[0].reason, "forest");
  assert.equal(world.scatterAreas[0].groundCoverEnabled, true);
  assert.equal(world.scatterAreas[0].groundColor, "#294d28");
  assert.equal(world.scatterAreas[0].groundEdgeFade, 2.5);
});

test("bounded scatter mixes a straight or brick pattern into the existing random placement", function () {
  const asset = { id: "tree", name: "Tree", assetType: "model", metadata: {} };
  const assetService = {
    get() { return asset; },
    manifestForIds() { return [asset]; }
  };
  function build(patternType, patternRandomness) {
    return buildWorldFromGraph({
      nodes: [
        { id: "output", type: "game_output", values: {} },
        {
          id: "pattern",
          type: "bounded_area_scatter",
          values: {
            scatterId: "pattern",
            enabled: true,
            count: 6,
            sourceAssetIds: ["tree"],
            sourceScaleMultipliers: {},
            randomObjectSelection: false,
            patternType: patternType,
            patternRandomness: patternRandomness,
            seed: "pattern-test",
            scaleMin: 1,
            scaleMax: 1,
            rotationYMin: 0,
            rotationYMax: 0,
            points: [
              { x: 0, z: 0 },
              { x: 6, z: 0 },
              { x: 6, z: 4 },
              { x: 0, z: 4 }
            ]
          }
        }
      ],
      edges: [
        { id: "pattern_output", fromNodeId: "pattern", fromPort: "entity", toNodeId: "output", toPort: "entities" }
      ]
    }, { assetService });
  }

  const straight = build("straight", 0).entities.map(function (entity) { return entity.transform.position; });
  const brick = build("brick", 0).entities.map(function (entity) { return entity.transform.position; });
  const random = build("straight", 100).entities.map(function (entity) { return entity.transform.position; });
  const straightRows = new Map();
  const brickRows = new Map();
  for (const point of straight) {
    const row = point.z.toFixed(4);
    if (!straightRows.has(row)) straightRows.set(row, []);
    straightRows.get(row).push(point.x);
  }
  for (const point of brick) {
    const row = point.z.toFixed(4);
    if (!brickRows.has(row)) brickRows.set(row, []);
    brickRows.get(row).push(point.x);
  }
  assert.ok(straightRows.size >= 2);
  const straightOffsets = Array.from(straightRows.values()).map(function (row) { return Math.min.apply(Math, row); });
  assert.equal(new Set(straightOffsets.map(function (value) { return value.toFixed(4); })).size, 1, "straight rows line up");
  const brickOffsets = Array.from(brickRows.values()).map(function (row) { return Math.min.apply(Math, row); });
  assert.ok(new Set(brickOffsets.map(function (value) { return value.toFixed(4); })).size > 1, "brick rows alternate their offset");
  assert.notDeepEqual(random, straight, "100% preserves random placement instead of the grid");
});

test("chunk loading node size fields override connected chunk grid defaults", function () {
  const graph = {
    nodes: [
      { id: "output", type: "game_output", values: {} },
      { id: "grid", type: "chunk_grid_definition", values: { gridId: "chunk_grid.main", chunkWidth: 14, chunkDepth: 14, tileSize: 1, maxLoadedChunks: 81 } },
      { id: "editor_chunks", type: "editor_chunk_loading", values: { chunkWidth: 40, chunkDepth: 50, tileSize: 2, maxLoadedChunks: 11, enabled: true } },
      { id: "game_chunks", type: "game_chunk_loading", values: { chunkWidth: 30, chunkDepth: 35, tileSize: 3, maxLoadedChunks: 13, loadBudgetPerFrame: 7, enabled: true } }
    ],
    edges: [
      { id: "grid_editor", fromNodeId: "grid", fromPort: "chunkGrid", toNodeId: "editor_chunks", toPort: "chunkGrid" },
      { id: "grid_game", fromNodeId: "grid", fromPort: "chunkGrid", toNodeId: "game_chunks", toPort: "chunkGrid" },
      { id: "editor_output", fromNodeId: "editor_chunks", fromPort: "chunkLoading", toNodeId: "output", toPort: "chunkLoading" },
      { id: "game_output", fromNodeId: "game_chunks", fromPort: "chunkLoading", toNodeId: "output", toPort: "chunkLoading" }
    ]
  };

  const world = buildWorldFromGraph(graph);

  assert.equal(world.chunkLoading.editor.chunkWidth, 40);
  assert.equal(world.chunkLoading.editor.chunkDepth, 50);
  assert.equal(world.chunkLoading.editor.tileSize, 2);
  assert.equal(world.chunkLoading.editor.maxLoadedChunks, 11);
  assert.equal(world.chunkLoading.game.chunkWidth, 30);
  assert.equal(world.chunkLoading.game.chunkDepth, 35);
  assert.equal(world.chunkLoading.game.tileSize, 3);
  assert.equal(world.chunkLoading.game.maxLoadedChunks, 13);
  assert.equal(world.chunkLoading.game.residentChunkBuildBudgetPerFrame, 7);
});

test("mmo network settings publish game-dev netcode fields", function () {
  const graph = {
    nodes: [
      { id: "output", type: "game_output", values: {} },
      {
        id: "mmo_net",
        type: "mmo_network_settings",
        values: {
          settingsId: "mmo_network",
          networkPreset: "balanced",
          serverTickRateHz: 30,
          snapshotRateHz: 20,
          inputSendRateHz: 30,
          remoteInterpolationBaseDelayMs: 200,
          remoteInterpolationMinDelayMs: 160,
          remoteInterpolationMaxDelayMs: 280,
          ownHardCorrectionThreshold: 3,
          ownCorrectionBlendMs: 300,
          ownKeepPredictionDuringInput: true,
          ownActiveCorrectionMaxUnits: 0.08,
          ownCorrectionMergeFactor: 0.35,
          ownPostInputHoldMs: 650,
          ownStopResyncMaxUnits: 40,
          predictionEnabled: true,
          reconciliationEnabled: true
        }
      }
    ],
    edges: [
      { id: "mmo_output", fromNodeId: "mmo_net", fromPort: "mmoNetwork", toNodeId: "output", toPort: "mmoNetwork" }
    ]
  };

  const world = buildWorldFromGraph(graph);

  assert.equal(world.mmo.network.networkPreset, "balanced");
  assert.equal(world.mmo.network.serverTickRateHz, 30);
  assert.equal(world.mmo.network.snapshotRateHz, 20);
  assert.equal(world.mmo.network.inputSendRateHz, 30);
  assert.equal(world.mmo.network.moveSendIntervalMs, 33);
  assert.equal(world.mmo.network.remoteInterpolationBaseDelayMs, 200);
  assert.equal(world.mmo.network.ownHardCorrectionThreshold, 3);
  assert.equal(world.mmo.network.ownCorrectionBlendMs, 300);
  assert.equal(world.mmo.network.ownKeepPredictionDuringInput, true);
  assert.equal(world.mmo.network.ownActiveCorrectionMaxUnits, 0.08);
  assert.equal(world.mmo.network.ownCorrectionMergeFactor, 0.35);
  assert.equal(world.mmo.network.ownPostInputHoldMs, 650);
  assert.equal(world.mmo.network.ownStopResyncMaxUnits, 40);
  assert.equal(world.mmo.network.predictionEnabled, true);
  assert.equal(world.mmo.network.reconciliationEnabled, true);
});

test("mmo network extreme low bandwidth preset favors smoothing over latency", function () {
  const patch = mmoNetworkPresetNodePatch("0");

  assert.equal(patch.networkPreset, "extreme_low_bandwidth");
  assert.equal(patch.serverTickRateHz, 15);
  assert.equal(patch.snapshotRateHz, 5);
  assert.equal(patch.inputSendRateHz, 15);
  assert.equal(patch.remoteInterpolationBaseDelayMs, 300);
  assert.equal(patch.remoteInterpolationMinDelayMs, 240);
  assert.equal(patch.remoteInterpolationMaxDelayMs, 420);
  assert.equal(patch.ownHardCorrectionThreshold, 5);
  assert.equal(patch.ownCorrectionBlendMs, 700);
  assert.equal(patch.ownKeepPredictionDuringInput, true);
  assert.equal(patch.ownActiveCorrectionMaxUnits, 0.02);
  assert.equal(patch.ownPostInputHoldMs, 1200);
  assert.equal(patch.ownStopResyncMaxUnits, 100);
});

test("mmo network smooth MMO preset holds local prediction during input", function () {
  const patch = mmoNetworkPresetNodePatch("7");

  assert.equal(patch.networkPreset, "smooth_mmo");
  assert.equal(patch.serverTickRateHz, 30);
  assert.equal(patch.snapshotRateHz, 20);
  assert.equal(patch.inputSendRateHz, 30);
  assert.equal(patch.remoteInterpolationBaseDelayMs, 220);
  assert.equal(patch.ownPredictionDeadzone, 0.7);
  assert.equal(patch.ownCorrectionBlendMs, 650);
  assert.equal(patch.ownKeepPredictionDuringInput, true);
  assert.equal(patch.ownActiveCorrectionMaxUnits, 0.02);
  assert.equal(patch.ownCorrectionMergeFactor, 0.2);
  assert.equal(patch.ownPostInputHoldMs, 1200);
  assert.equal(patch.ownStopResyncMaxUnits, 100);
});
