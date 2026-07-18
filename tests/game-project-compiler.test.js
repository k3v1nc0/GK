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
