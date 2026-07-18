import { DatabaseSync } from "node:sqlite";

export function foundationGraph() {
  return {
    graphRevision: 4,
    contentSchemaVersion: "gk-node-content-v1",
    contentAliases: [
      {
        old_id: "global.legacy_game_name",
        new_id: "global.game_name",
        symbol_kind: "globalValue",
        reason: "rename"
      }
    ],
    nodes: [
      {
        id: "node_output",
        type: "game_output",
        title: "Game Output",
        parentId: null,
        x: 0,
        y: 0,
        values: {}
      },
      {
        id: "node_project",
        type: "game_project_settings",
        title: "Project",
        parentId: null,
        x: 120,
        y: 120,
        values: {
          projectId: "gk.project",
          gameName: "GK Game",
          defaultLanguage: "nl",
          contentVersion: "0.1.0",
          startZoneRef: null,
          startSpawnRef: null,
          allowLegacyWorld: true
        }
      },
      {
        id: "node_chunk_grid",
        type: "chunk_grid_definition",
        title: "Chunk Grid",
        parentId: null,
        x: 260,
        y: 120,
        values: {
          gridId: "chunk_grid.main",
          chunkWidth: 14,
          chunkDepth: 14,
          tileSize: 1,
          maxLoadedChunks: 81,
          maxWindowWidth: 9,
          maxWindowDepth: 9,
          originX: 0,
          originZ: 0,
          edgeMode: "clip_to_zone_bounds"
        }
      },
      {
        id: "node_world_assembly",
        type: "world_assembly",
        title: "World Assembly",
        parentId: null,
        x: 420,
        y: 120,
        values: {
          assemblyId: "world_assembly.main",
          schemaVersion: "gk-game-project-v3",
          validationMode: "strict",
          includeEditorDiagnostics: false
        }
      },
      {
        id: "node_global_game_name",
        type: "global_value_definition",
        title: "Game Name",
        parentId: null,
        x: 560,
        y: 120,
        values: {
          valueId: "global.game_name",
          valueType: "text",
          textValue: "GK Game",
          numberValue: 0,
          booleanValue: false,
          colorValue: "#ffffff",
          referenceKind: "",
          referenceValue: null,
          format: "raw",
          label: "Game Name",
          description: "",
          tags: ["global"]
        }
      }
    ],
    edges: [
      {
        id: "edge_project",
        fromNodeId: "node_project",
        fromPort: "projectSettings",
        toNodeId: "node_world_assembly",
        toPort: "projectSettings"
      },
      {
        id: "edge_chunk_grid",
        fromNodeId: "node_chunk_grid",
        fromPort: "chunkGrid",
        toNodeId: "node_world_assembly",
        toPort: "chunkGrid"
      },
      {
        id: "edge_game_project",
        fromNodeId: "node_world_assembly",
        fromPort: "gameProject",
        toNodeId: "node_output",
        toPort: "gameProject"
      }
    ]
  };
}

export function createMigrationDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE editor_graph_meta (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      graph_revision INTEGER NOT NULL DEFAULT 0,
      content_schema_version TEXT NOT NULL DEFAULT 'gk-node-content-v1',
      last_mutation_at TEXT
    );
    INSERT INTO editor_graph_meta (id, graph_revision, content_schema_version, last_mutation_at)
    VALUES (1, 1, 'gk-node-content-v1', '2026-07-17T00:00:00.000Z');
    CREATE TABLE editor_nodes (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      parent_id TEXT,
      values_json TEXT NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE editor_node_edges (
      id TEXT PRIMARY KEY,
      from_node_id TEXT NOT NULL,
      from_port TEXT NOT NULL,
      to_node_id TEXT NOT NULL,
      to_port TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE graph_migration_runs (
      id TEXT PRIMARY KEY,
      migration_key TEXT NOT NULL,
      from_version TEXT NOT NULL,
      to_version TEXT NOT NULL,
      mode TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      result_json TEXT,
      actor_user_id TEXT,
      created_at TEXT NOT NULL,
      applied_at TEXT
    );
    CREATE TABLE content_id_aliases (
      old_id TEXT PRIMARY KEY,
      new_id TEXT NOT NULL,
      symbol_kind TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL,
      created_by_user_id TEXT
    );
    CREATE TABLE draft_world_state (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      world_json TEXT NOT NULL,
      build_id TEXT,
      schema_version TEXT,
      content_hash TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

export function createMigrationRepository(db, graph, tracker = null) {
  return {
    db,
    getGraph() {
      return graph;
    },
    getGraphRevision() {
      return Number(graph.graphRevision || 0);
    },
    touchGraphRevision(handle = db) {
      const nextAt = new Date().toISOString();
      handle.prepare("UPDATE editor_graph_meta SET graph_revision = graph_revision + 1, last_mutation_at = ? WHERE id = 1").run(nextAt);
      graph.graphRevision = Number(graph.graphRevision || 0) + 1;
      return graph.graphRevision;
    },
    clearDraftWorld() {
      db.prepare("DELETE FROM draft_world_state WHERE id = 1").run();
    },
    invalidateSymbolIndex() {
      if (tracker && typeof tracker.invalidate === "function") tracker.invalidate();
    }
  };
}
