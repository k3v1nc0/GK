import assert from "node:assert/strict";
import test from "node:test";
import { buildWorldFromGraph } from "../src/server/publish-service.js";
import { mmoNetworkPresetNodePatch } from "../src/shared/node-types.js";

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
