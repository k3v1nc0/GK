import assert from "node:assert/strict";
import test from "node:test";
import { GraphRepository } from "../src/server/graph-repository.js";
import { createMigrationDatabase } from "./fixtures.js";

function createPublishHistoryDatabase() {
  const db = createMigrationDatabase();
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE published_world_state (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      world_json TEXT NOT NULL,
      build_id TEXT,
      schema_version TEXT,
      content_hash TEXT,
      published_at TEXT NOT NULL
    );
    CREATE TABLE publish_history (
      id TEXT PRIMARY KEY,
      world_json TEXT NOT NULL,
      build_id TEXT,
      schema_version TEXT,
      content_hash TEXT,
      actor_user_id TEXT,
      published_at TEXT NOT NULL
    );
    CREATE TABLE publish_history_zones (
      publish_history_id TEXT NOT NULL,
      zone_id TEXT NOT NULL,
      FOREIGN KEY (publish_history_id) REFERENCES publish_history(id) ON DELETE CASCADE
    );
  `);
  return db;
}

function seedPublishHistory(db, count) {
  const insertHistory = db.prepare(`
    INSERT INTO publish_history (id, world_json, build_id, schema_version, content_hash, actor_user_id, published_at)
    VALUES (?, ?, ?, 'schema-test', ?, 'actor-test', '2026-01-01T00:00:00.000Z')
  `);
  const insertZone = db.prepare("INSERT INTO publish_history_zones (publish_history_id, zone_id) VALUES (?, ?)");
  for (let index = 0; index < count; index += 1) {
    const id = "hist-" + String(index).padStart(3, "0");
    insertHistory.run(id, JSON.stringify({ index }), "build-" + index, "hash-" + index);
    insertZone.run(id, "zone-" + index);
  }
}

function publishHistoryIds(db) {
  return db.prepare("SELECT id FROM publish_history ORDER BY published_at DESC, id DESC").all().map(function (row) {
    return row.id;
  });
}

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

test("publish history retention keeps existing rows when the limit is reached exactly", function () {
  const db = createPublishHistoryDatabase();
  seedPublishHistory(db, 49);
  const repository = new GraphRepository(db);

  repository.publishWorld({ buildId: "current-build", zones: [] }, "actor-test", {
    buildId: "current-build",
    schemaVersion: "schema-test",
    contentHash: "current-hash"
  });

  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM publish_history").get().total, 50);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM publish_history_zones").get().total, 49);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("publish history retention keeps the newest 50 rows and cascades dependent rows", function () {
  const db = createPublishHistoryDatabase();
  seedPublishHistory(db, 55);
  const repository = new GraphRepository(db);

  repository.publishWorld({ buildId: "current-build", zones: [{ id: "zone-current" }] }, "actor-test", {
    buildId: "current-build",
    schemaVersion: "schema-test",
    contentHash: "current-hash"
  });

  const ids = publishHistoryIds(db);
  assert.equal(ids.length, 50);
  assert.equal(ids.some(function (id) { return id.startsWith("hist-00") && Number(id.slice(5)) < 6; }), false);
  assert.equal(ids.includes("hist-006"), true);
  assert.equal(ids.includes("hist-054"), true);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM publish_history_zones").get().total, 49);
  assert.equal(db.prepare(`
    SELECT COUNT(*) AS total
    FROM publish_history_zones AS zones
    LEFT JOIN publish_history AS history ON history.id = zones.publish_history_id
    WHERE history.id IS NULL
  `).get().total, 0);

  const published = repository.getPublishedWorld();
  assert.equal(published.buildId, "current-build");
  assert.equal(published.contentHash, "current-hash");
});

test("failed publish rolls back published world and leaves valid history intact", function () {
  const db = createPublishHistoryDatabase();
  seedPublishHistory(db, 50);
  const repository = new GraphRepository(db);
  repository.publishWorld({ buildId: "previous-build" }, "actor-test", {
    buildId: "previous-build",
    schemaVersion: "schema-test",
    contentHash: "previous-hash"
  });
  const beforeIds = publishHistoryIds(db);
  const beforePublished = repository.getPublishedWorld();

  db.exec(`
    CREATE TRIGGER fail_bad_publish_history_insert
    BEFORE INSERT ON publish_history
    WHEN NEW.build_id = 'bad-build'
    BEGIN
      SELECT RAISE(ABORT, 'test publish history failure');
    END;
  `);

  assert.throws(function () {
    repository.publishWorld({ buildId: "bad-build" }, "actor-test", {
      buildId: "bad-build",
      schemaVersion: "schema-test",
      contentHash: "bad-hash"
    });
  }, /test publish history failure/);

  assert.deepEqual(publishHistoryIds(db), beforeIds);
  assert.equal(repository.getPublishedWorld().contentHash, beforePublished.contentHash);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
});
