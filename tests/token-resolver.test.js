import assert from "node:assert/strict";
import test from "node:test";
import { TokenResolver } from "../src/server/token-resolver.js";
import { foundationGraph } from "./fixtures.js";

test("token resolver previews static tokens from the graph", function () {
  const graph = foundationGraph();
  const resolver = new TokenResolver();
  const preview = resolver.preview(graph, "Welkom in @{global.game_name}", { staticContextOnly: true });

  assert.equal(preview.text, "Welkom in GK Game");
  assert.equal(preview.runtimePreview, "Welkom in GK Game");
  assert.equal(preview.contextSummary.projectId, "gk.project");
  assert.deepEqual(preview.errors, []);
});

test("token resolver maps project gameName to global.game_name without a global value node", function () {
  const graph = foundationGraph();
  graph.nodes = graph.nodes.filter(function (node) { return node.id !== "node_global_game_name"; });
  const resolver = new TokenResolver();
  const preview = resolver.preview(graph, "Welkom in @{global.game_name}", { staticContextOnly: true });

  assert.equal(preview.text, "Welkom in GK Game");
  assert.deepEqual(preview.errors, []);
});
