import assert from "node:assert/strict";
import test from "node:test";
import { GraphMigrationService } from "../src/server/graph-migration-service.js";
import { createMigrationDatabase, createMigrationRepository } from "./fixtures.js";

function migrationGraph() {
  return {
    graphRevision: 1,
    contentSchemaVersion: "gk-node-content-v1",
    nodes: [
      {
        id: "node_output",
        type: "game_output",
        title: "Game Output",
        parentId: null,
        x: 0,
        y: 0,
        values: {}
      }
    ],
    edges: []
  };
}

test("foundation migration preview stays read-only and apply writes the plan", function () {
  const db = createMigrationDatabase();
  const graph = migrationGraph();
  let invalidated = 0;
  const repository = createMigrationRepository(db, graph, {
    invalidate() {
      invalidated += 1;
    }
  });
  const service = new GraphMigrationService(repository, {
    symbolIndexService: {
      invalidate() {
        invalidated += 1;
      }
    }
  });

  const preview = service.preview();
  assert.equal(preview.alreadyApplied, false);
  assert.equal(preview.nodesToCreate.length, 15);
  assert.equal(preview.edgesToCreate.length, 10);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM graph_migration_runs").get().total, 0);

  const result = service.apply({
    previewId: preview.previewId,
    expectedGraphRevision: graph.graphRevision
  }, "user_1");

  assert.equal(result.alreadyApplied, false);
  assert.equal(result.nodesCreated, 15);
  assert.equal(result.edgesCreated, 10);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM graph_migration_runs").get().total, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM editor_nodes WHERE id = ?").get("foundation.world_assembly").total, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM editor_node_edges WHERE id = ?").get("foundation.edge.assembly_to_game_output").total, 1);
  assert.equal(db.prepare("SELECT graph_revision AS revision FROM editor_graph_meta WHERE id = 1").get().revision, 2);
  assert.ok(invalidated > 0);
});

test("foundation migration reroutes legacy Game Output edges to internal adapter", function () {
  const db = createMigrationDatabase();
  const graph = migrationGraph();
  graph.nodes.push({
    id: "legacy_hud",
    type: "ui_hud_text",
    title: "Legacy HUD",
    parentId: null,
    x: 10,
    y: 10,
    values: {}
  });
  graph.edges.push({
    id: "legacy_edge_ui",
    fromNodeId: "legacy_hud",
    fromPort: "ui",
    toNodeId: "node_output",
    toPort: "ui"
  });
  const repository = createMigrationRepository(db, graph);
  const service = new GraphMigrationService(repository);

  const preview = service.preview();
  assert.equal(preview.warnings[0].code, "GAME_OUTPUT_LEGACY_REROUTED");
  assert.equal(preview.willConvertLegacyGameOutputEdges, true);
  assert.equal(preview.legacyEdgesFound.length, 1);
  assert.equal(preview.edgesToDelete.length, 1);
  assert.equal(preview.valuesToMove.length, 1);
  assert.ok(preview.edgesToCreate.some(function (edge) {
    return edge.fromNodeId === "legacy_hud" && edge.toNodeId === "foundation.legacy_world_adapter" && edge.toPort === "ui";
  }));

  service.apply({
    previewId: preview.previewId,
    expectedGraphRevision: graph.graphRevision
  }, "user_1");

  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM editor_node_edges WHERE id = ?").get("legacy_edge_ui").total, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM editor_node_edges WHERE id = ? AND to_node_id = ? AND to_port = ?").get("foundation.reroute.legacy_edge_ui", "foundation.legacy_world_adapter", "ui").total, 1);
});
