import assert from "node:assert/strict";
import test from "node:test";
import { GraphRepository } from "../src/server/graph-repository.js";
import { createMigrationDatabase } from "./fixtures.js";

function seedOutput(db) {
  db.prepare(`
    INSERT INTO editor_nodes (id, type, title, x, y, parent_id, values_json, schema_version, created_at, updated_at)
    VALUES ('node_output', 'game_output', 'Game Output', 0, 0, NULL, '{}', 1, '2026-07-18T00:00:00.000Z', '2026-07-18T00:00:00.000Z')
  `).run();
}

test("root model placement does not create legacy Game Output entity edges", function () {
  const db = createMigrationDatabase();
  seedOutput(db);
  const repository = new GraphRepository(db);

  repository.createModelEntityFromAsset({
    id: "asset_test_model",
    name: "Test Model",
    assetType: "model",
    metadata: {}
  }, { x: 1, y: 0, z: 2 }, null);

  const legacyEdges = db.prepare(`
    SELECT COUNT(*) AS total
    FROM editor_node_edges
    WHERE to_node_id = 'node_output'
      AND to_port = 'entities'
  `).get().total;
  assert.equal(legacyEdges, 0);
});

test("node position updates reject invalid coordinates and persist valid coordinates", function () {
  const db = createMigrationDatabase();
  seedOutput(db);
  const repository = new GraphRepository(db);

  assert.throws(function () {
    repository.updateNodePosition("node_output", { x: "", y: 20 });
  }, /Nodepositie x moet een geldig nummer zijn/);

  assert.throws(function () {
    repository.updateNodePosition("node_output", { x: 20, y: null });
  }, /Nodepositie y moet een geldig nummer zijn/);

  assert.throws(function () {
    repository.updateNodePosition("node_output", { x: 100001, y: 20 });
  }, /Nodepositie x moet een geldig nummer binnen de graph bounds zijn/);

  repository.updateNodePosition("node_output", { x: 123.4, y: 567.6 });
  const reloaded = repository.getGraph().nodes.find(function (node) {
    return node.id === "node_output";
  });
  assert.equal(reloaded.x, 123);
  assert.equal(reloaded.y, 568);
});

test("restore rejects snapshots with broken layout coordinates", function () {
  const db = createMigrationDatabase();
  seedOutput(db);
  const repository = new GraphRepository(db);

  assert.throws(function () {
    repository.restoreGraph({
      nodes: [
        {
          id: "node_output",
          type: "game_output",
          title: "Game Output",
          parentId: null,
          x: undefined,
          y: 0,
          values: {}
        }
      ],
      edges: []
    });
  }, /Graph snapshot node node_output x moet een geldig nummer zijn/);

  assert.throws(function () {
    repository.restoreGraph({
      nodes: [
        {
          id: "node_output",
          type: "game_output",
          title: "Game Output",
          parentId: null,
          x: 0,
          y: "",
          values: {}
        }
      ],
      edges: []
    });
  }, /Graph snapshot node node_output y moet een geldig nummer zijn/);
});

test("restore preserves existing internal migration edges while moving visible nodes", function () {
  const db = createMigrationDatabase();
  const now = "2026-07-18T00:00:00.000Z";
  const insertNode = db.prepare(`
    INSERT INTO editor_nodes (id, type, title, x, y, parent_id, values_json, schema_version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, NULL, ?, 1, ?, ?)
  `);
  insertNode.run("node_output", "game_output", "Game Output", 100, 100, "{}", now, now);
  insertNode.run("foundation.legacy_world_adapter", "legacy_world_adapter", "Legacy World Adapter", 200, 100, "{\"adapterId\":\"legacy_world.main\"}", now, now);
  insertNode.run("foundation.world_assembly", "world_assembly", "World Assembly", 300, 100, "{\"assemblyId\":\"world_assembly.main\",\"schemaVersion\":\"gk-game-project-v3\",\"validationMode\":\"strict\",\"includeEditorDiagnostics\":false}", now, now);
  db.prepare(`
    INSERT INTO editor_node_edges (id, from_node_id, from_port, to_node_id, to_port, created_at)
    VALUES ('foundation.edge.legacy_world_to_assembly', 'foundation.legacy_world_adapter', 'legacyWorldPackage', 'foundation.world_assembly', 'legacyWorld', ?)
  `).run(now);
  const repository = new GraphRepository(db);
  const graph = repository.getGraph();
  const moved = {
    nodes: graph.nodes.map(function (node) {
      if (node.id !== "foundation.world_assembly") return node;
      return Object.assign({}, node, { x: 444, y: 555 });
    }),
    edges: graph.edges
  };

  const restored = repository.restoreGraph(moved);
  const worldAssembly = restored.nodes.find(function (node) {
    return node.id === "foundation.world_assembly";
  });
  assert.equal(worldAssembly.x, 444);
  assert.equal(worldAssembly.y, 555);
  assert.equal(restored.edges.some(function (edge) {
    return edge.id === "foundation.edge.legacy_world_to_assembly";
  }), true);
});
