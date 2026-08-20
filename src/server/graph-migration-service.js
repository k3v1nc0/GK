import crypto from "node:crypto";
import { canonicalJsonStringify } from "../shared/node-contract.js";
import { groupInterfaceDefault, groupInterfacePresetForKind, normalizeGroupInterface, normalizeGroupKind } from "../shared/node-types.js";

const MIGRATION_KEY = "node-system-foundation-v1";

function now() {
  return new Date().toISOString();
}

function clone(value) {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === "function") {
    try { return structuredClone(value); } catch {}
  }
  return JSON.parse(JSON.stringify(value));
}

function safeString(value) {
  return String(value === null || value === undefined ? "" : value);
}

function normalizeNodeDescriptor(descriptor) {
  return {
    id: descriptor.id,
    type: descriptor.type,
    title: descriptor.title,
    x: Math.round(Number(descriptor.x) || 0),
    y: Math.round(Number(descriptor.y) || 0),
    parentId: descriptor.parentId || null,
    values: clone(descriptor.values || {}),
    schemaVersion: Number(descriptor.schemaVersion || 1)
  };
}

function buildGroupValues(groupKind, groupId, title) {
  const kind = normalizeGroupKind(groupKind);
  return {
    groupId,
    title,
    groupKind: kind,
    groupInterface: normalizeGroupInterface(groupInterfacePresetForKind(kind)),
    interfacePresetVersion: 1,
    collapsedSummary: false
  };
}

function buildNodeDescriptors() {
  return [
    normalizeNodeDescriptor({
      id: "foundation.game_project_settings",
      type: "game_project_settings",
      title: "Game Project Settings",
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
    }),
    normalizeNodeDescriptor({
      id: "foundation.chunk_grid_definition",
      type: "chunk_grid_definition",
      title: "Chunk Grid Definition",
      x: 380,
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
    }),
    normalizeNodeDescriptor({
      id: "foundation.group.catalog",
      type: "group",
      title: "Catalog",
      x: 120,
      y: 360,
      values: buildGroupValues("catalog", "catalog", "Catalog")
    }),
    normalizeNodeDescriptor({
      id: "foundation.group.zones",
      type: "group",
      title: "Zones",
      x: 380,
      y: 360,
      values: buildGroupValues("zone", "zones", "Zones")
    }),
    normalizeNodeDescriptor({
      id: "foundation.group.campaigns",
      type: "group",
      title: "Campaigns",
      x: 640,
      y: 360,
      values: buildGroupValues("campaign", "campaigns", "Campaigns")
    }),
    normalizeNodeDescriptor({
      id: "foundation.group.player_rules",
      type: "group",
      title: "Player Rules",
      x: 900,
      y: 360,
      values: buildGroupValues("player_rules", "player_rules", "Player Rules")
    }),
    normalizeNodeDescriptor({
      id: "foundation.group.ui",
      type: "group",
      title: "UI",
      x: 1160,
      y: 360,
      values: buildGroupValues("ui", "ui", "UI")
    }),
    normalizeNodeDescriptor({
      id: "foundation.catalog_registry",
      type: "catalog_registry",
      title: "Catalog Registry",
      x: 120,
      y: 580,
      values: {
        registryId: "catalog_registry.main",
        duplicatePolicy: "error",
        missingOptionalPolicy: "warning"
      }
    }),
    normalizeNodeDescriptor({
      id: "foundation.zone_registry",
      type: "zone_registry",
      title: "Zone Registry",
      x: 380,
      y: 580,
      values: {
        registryId: "zone_registry.main"
      }
    }),
    normalizeNodeDescriptor({
      id: "foundation.campaign_registry",
      type: "campaign_registry",
      title: "Campaign Registry",
      x: 640,
      y: 580,
      values: {
        registryId: "campaign_registry.main"
      }
    }),
    normalizeNodeDescriptor({
      id: "foundation.player_rules_output",
      type: "player_rules_output",
      title: "Player Rules Output",
      x: 900,
      y: 580,
      values: {
        rulesId: "player_rules.main"
      }
    }),
    normalizeNodeDescriptor({
      id: "foundation.ui_output",
      type: "ui_output",
      title: "UI Output",
      x: 1160,
      y: 580,
      values: {
        uiId: "ui.main"
      }
    }),
    normalizeNodeDescriptor({
      id: "foundation.hud_game_name",
      type: "ui_hud_text",
      title: "HUD Text - Game Name",
      x: 1160,
      y: 780,
      values: {
        moduleId: "hud_game_name",
        anchor: "top-left",
        text: "Welkom in @{global.game_name}",
        fontSize: 18,
        color: "#ffffff"
      }
    }),
    normalizeNodeDescriptor({
      id: "foundation.legacy_world_adapter",
      type: "legacy_world_adapter",
      title: "Legacy World Adapter",
      x: 1420,
      y: 580,
      values: {
        adapterId: "legacy_world.main"
      }
    }),
    normalizeNodeDescriptor({
      id: "foundation.editor_chunk_loading",
      type: "editor_chunk_loading",
      title: "Editor Chunk Loading",
      x: 1420,
      y: 780,
      values: {
        chunkProfileId: "editor_chunks",
        enabled: true,
        chunkWidth: 14,
        chunkDepth: 14,
        tileSize: 1,
        preloadMarginChunks: 1,
        unloadMarginChunks: 2,
        maxLoadedChunks: 81,
        debugOverlay: true,
        residentEntityBudget: 200,
        residentObjectBudget: 300,
        residentScatterInstanceBudget: 500,
        residentChunkBuildBudgetPerFrame: 2,
        groundChunkingEnabled: true,
        pathWaterSurfaceChunkingEnabled: false,
        terrainVisualChunkingEnabled: false,
        editorViewRadiusChunks: 2,
        keepSelectedChunkLoaded: true,
        showChunkGrid: true,
        showChunkLabels: false
      }
    }),
    normalizeNodeDescriptor({
      id: "foundation.game_chunk_loading",
      type: "game_chunk_loading",
      title: "Game Chunk Loading",
      x: 1420,
      y: 980,
      values: {
        chunkProfileId: "game_chunks",
        enabled: true,
        chunkWidth: 14,
        chunkDepth: 14,
        tileSize: 1,
        preloadMarginChunks: 1,
        unloadMarginChunks: 1,
        maxLoadedChunks: 81,
        debugOverlay: false,
        residentEntityBudget: 200,
        residentObjectBudget: 300,
        residentScatterInstanceBudget: 500,
        residentChunkBuildBudgetPerFrame: 2,
        groundChunkingEnabled: true,
        pathWaterSurfaceChunkingEnabled: true,
        terrainVisualChunkingEnabled: true,
        cameraOnly: true,
        gameViewRadiusChunks: 3,
        cameraOffsetZChunks: -1,
        fixedCameraPaddingTiles: 0,
        strictUnloadOutsideCamera: true,
        loadBudgetPerFrame: 2
      }
    }),
    normalizeNodeDescriptor({
      id: "foundation.world_assembly",
      type: "world_assembly",
      title: "World Assembly",
      x: 1680,
      y: 120,
      values: {
        assemblyId: "world_assembly.main",
        schemaVersion: "gk-game-project-v3",
        validationMode: "strict",
        includeEditorDiagnostics: false
      }
    })
  ];
}

function buildEdgeDescriptors() {
  return [
    { id: "foundation.edge.project_settings_to_assembly", fromNodeId: "foundation.game_project_settings", fromPort: "projectSettings", toNodeId: "foundation.world_assembly", toPort: "projectSettings" },
    { id: "foundation.edge.chunk_grid_to_assembly", fromNodeId: "foundation.chunk_grid_definition", fromPort: "chunkGrid", toNodeId: "foundation.world_assembly", toPort: "chunkGrid" },
    { id: "foundation.edge.chunk_grid_to_editor_chunks", fromNodeId: "foundation.chunk_grid_definition", fromPort: "chunkGrid", toNodeId: "foundation.editor_chunk_loading", toPort: "chunkGrid" },
    { id: "foundation.edge.chunk_grid_to_game_chunks", fromNodeId: "foundation.chunk_grid_definition", fromPort: "chunkGrid", toNodeId: "foundation.game_chunk_loading", toPort: "chunkGrid" },
    { id: "foundation.edge.editor_chunks_to_assembly", fromNodeId: "foundation.editor_chunk_loading", fromPort: "chunkLoading", toNodeId: "foundation.world_assembly", toPort: "chunkLoading" },
    { id: "foundation.edge.game_chunks_to_assembly", fromNodeId: "foundation.game_chunk_loading", fromPort: "chunkLoading", toNodeId: "foundation.world_assembly", toPort: "chunkLoading" },
    { id: "foundation.edge.catalog_registry_to_assembly", fromNodeId: "foundation.catalog_registry", fromPort: "catalogRegistry", toNodeId: "foundation.world_assembly", toPort: "catalogs" },
    { id: "foundation.edge.zone_registry_to_assembly", fromNodeId: "foundation.zone_registry", fromPort: "zoneRegistry", toNodeId: "foundation.world_assembly", toPort: "zones" },
    { id: "foundation.edge.campaign_registry_to_assembly", fromNodeId: "foundation.campaign_registry", fromPort: "campaignRegistry", toNodeId: "foundation.world_assembly", toPort: "campaigns" },
    { id: "foundation.edge.player_rules_to_assembly", fromNodeId: "foundation.player_rules_output", fromPort: "playerRules", toNodeId: "foundation.world_assembly", toPort: "playerRules" },
    { id: "foundation.edge.hud_game_name_to_ui", fromNodeId: "foundation.hud_game_name", fromPort: "ui", toNodeId: "foundation.ui_output", toPort: "ui" },
    { id: "foundation.edge.ui_to_assembly", fromNodeId: "foundation.ui_output", fromPort: "uiPackage", toNodeId: "foundation.world_assembly", toPort: "ui" },
    { id: "foundation.edge.legacy_world_to_assembly", fromNodeId: "foundation.legacy_world_adapter", fromPort: "legacyWorldPackage", toNodeId: "foundation.world_assembly", toPort: "legacyWorld" },
    { id: "foundation.edge.assembly_to_game_output", fromNodeId: "foundation.world_assembly", fromPort: "gameProject", toNodeId: "node_output", toPort: "gameProject" }
  ];
}

function legacyGameOutputEdges(graph) {
  return (Array.isArray(graph?.edges) ? graph.edges : []).filter(function (edge) {
    return edge.toNodeId === "node_output" && edge.toPort !== "gameProject";
  });
}

function buildLegacyRerouteDescriptors(graph) {
  return legacyGameOutputEdges(graph).map(function (edge) {
    return {
      id: "foundation.reroute." + edge.id,
      fromNodeId: edge.fromNodeId,
      fromPort: edge.fromPort,
      toNodeId: "foundation.legacy_world_adapter",
      toPort: edge.toPort,
      replacesEdgeId: edge.id
    };
  });
}

function mapById(items) {
  return new Map((Array.isArray(items) ? items : []).map(function (item) {
    return [item.id, item];
  }));
}

function buildPreviewSummary(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const nodeMap = mapById(nodes);
  const desiredNodes = buildNodeDescriptors();
  const desiredEdges = buildEdgeDescriptors();
  const legacyRerouteEdges = buildLegacyRerouteDescriptors(graph);
  const nodesToCreate = [];
  const nodesToUpdate = [];
  const edgesToCreate = [];
  const edgesToDelete = legacyGameOutputEdges(graph);
  const valuesToMove = legacyRerouteEdges.map(function (edge) {
    return {
      fromNodeId: edge.fromNodeId,
      fromPort: edge.fromPort,
      toNodeId: edge.toNodeId,
      toPort: edge.toPort,
      migrationMode: "internal-hidden-compatibility"
    };
  });
  const warnings = [];

  for (const descriptor of desiredNodes) {
    const existing = nodeMap.get(descriptor.id);
    if (!existing) {
      nodesToCreate.push(descriptor);
      continue;
    }
    const current = {
      type: existing.type,
      title: existing.title,
      x: Number(existing.x),
      y: Number(existing.y),
      parentId: existing.parentId || null,
      values: existing.values || {}
    };
    const expected = {
      type: descriptor.type,
      title: descriptor.title,
      x: descriptor.x,
      y: descriptor.y,
      parentId: descriptor.parentId || null,
      values: descriptor.values || {}
    };
    if (canonicalJsonStringify(current) !== canonicalJsonStringify(expected)) {
      nodesToUpdate.push(descriptor);
    }
  }

  for (const descriptor of desiredEdges.concat(legacyRerouteEdges)) {
    const exists = edges.some(function (edge) {
      return edge.fromNodeId === descriptor.fromNodeId
        && edge.fromPort === descriptor.fromPort
        && edge.toNodeId === descriptor.toNodeId
        && edge.toPort === descriptor.toPort;
    });
    if (!exists) edgesToCreate.push(descriptor);
  }

  const directGameOutputEdges = legacyGameOutputEdges(graph).map(function (edge) {
    return edge.toPort;
  });
  if (directGameOutputEdges.length) {
    warnings.push({
      code: "GAME_OUTPUT_LEGACY_REROUTED",
      severity: "warning",
      message: "Legacy Game Output input(s) " + directGameOutputEdges.join(", ") + " worden naar de interne migration-adapter verplaatst. De normale publishroute blijft World Assembly.gameProject -> Game Output.gameProject."
    });
  }

  return {
    previewId: crypto.randomUUID(),
    migrationKey: MIGRATION_KEY,
    graphRevision: Number(graph?.graphRevision || 0),
    willConvertLegacyGameOutputEdges: edgesToDelete.length > 0,
    legacyEdgesFound: edgesToDelete,
    alreadyApplied: nodesToCreate.length === 0 && nodesToUpdate.length === 0 && edgesToCreate.length === 0 && edgesToDelete.length === 0,
    nodesToCreate,
    nodesToUpdate,
    edgesToCreate,
    edgesToDelete,
    valuesToMove,
    unmappedValues: [],
    warnings,
    blockingIssues: [],
    summary: {
      desiredNodes: desiredNodes.length,
      desiredEdges: desiredEdges.length,
      currentNodes: nodes.length,
      currentEdges: edges.length,
      legacyEdgesFound: edgesToDelete.length
    }
  };
}

function upsertNodeStatement(db, descriptor) {
  db.prepare(`
    INSERT INTO editor_nodes (id, type, title, x, y, parent_id, values_json, schema_version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      title = excluded.title,
      x = excluded.x,
      y = excluded.y,
      parent_id = excluded.parent_id,
      values_json = excluded.values_json,
      schema_version = excluded.schema_version,
      updated_at = excluded.updated_at
  `).run(
    descriptor.id,
    descriptor.type,
    descriptor.title,
    descriptor.x,
    descriptor.y,
    descriptor.parentId || null,
    JSON.stringify(descriptor.values || {}),
    Number(descriptor.schemaVersion || 1),
    now(),
    now()
  );
}

function upsertEdgeStatement(db, descriptor) {
  db.prepare(`
    INSERT INTO editor_node_edges (id, from_node_id, from_port, to_node_id, to_port, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      from_node_id = excluded.from_node_id,
      from_port = excluded.from_port,
      to_node_id = excluded.to_node_id,
      to_port = excluded.to_port
  `).run(
    descriptor.id,
    descriptor.fromNodeId,
    descriptor.fromPort,
    descriptor.toNodeId,
    descriptor.toPort,
    now()
  );
}

function deleteEdgeStatement(db, edgeId) {
  return db.prepare("DELETE FROM editor_node_edges WHERE id = ?").run(edgeId).changes;
}

function deleteNonCanonicalGameProjectEdges(db) {
  return db.prepare(`
    DELETE FROM editor_node_edges
    WHERE to_node_id = 'node_output'
      AND to_port = 'gameProject'
      AND NOT (from_node_id = 'foundation.world_assembly' AND from_port = 'gameProject')
  `).run().changes;
}

export class GraphMigrationService {
  constructor(repository, services = {}) {
    this.repository = repository;
    this.services = services;
    this.previewCache = new Map();
  }

  preview() {
    const graph = this.repository.getGraph();
    const preview = buildPreviewSummary(graph);
    this.previewCache.set(preview.previewId, preview);
    return preview;
  }

  apply(body = {}, actorUserId = null) {
    const expectedGraphRevision = Number(body.expectedGraphRevision);
    const previewId = safeString(body.previewId || "");
    if (!previewId) {
      const error = new Error("previewId ontbreekt.");
      error.status = 400;
      throw error;
    }
    const preview = this.previewCache.get(previewId);
    if (!preview) {
      const error = new Error("Onbekende migration preview.");
      error.status = 400;
      throw error;
    }
    const currentGraph = this.repository.getGraph();
    if (Number(currentGraph.graphRevision || 0) !== expectedGraphRevision) {
      const error = new Error("Graphrevision is gewijzigd sinds de preview.");
      error.status = 409;
      throw error;
    }
    const plan = buildPreviewSummary(currentGraph);
    if (plan.alreadyApplied) {
      return {
        migrationKey: MIGRATION_KEY,
        previewId,
        alreadyApplied: true,
        graphRevision: Number(currentGraph.graphRevision || 0),
        nodesCreated: 0,
        nodesUpdated: 0,
        edgesCreated: 0,
        warnings: plan.warnings
      };
    }

    const db = this.repository.db;
    let nodesCreated = 0;
    let nodesUpdated = 0;
    let edgesCreated = 0;
    let touched = false;
    db.exec("BEGIN");
    try {
      for (const descriptor of plan.nodesToCreate.concat(plan.nodesToUpdate)) {
        upsertNodeStatement(db, descriptor);
        touched = true;
        if (plan.nodesToCreate.some(function (node) { return node.id === descriptor.id; })) nodesCreated += 1;
        else nodesUpdated += 1;
      }
      if (deleteNonCanonicalGameProjectEdges(db) > 0) touched = true;
      for (const descriptor of plan.edgesToCreate) {
        upsertEdgeStatement(db, descriptor);
        touched = true;
        edgesCreated += 1;
      }
      for (const descriptor of buildLegacyRerouteDescriptors(currentGraph)) {
        if (descriptor.replacesEdgeId) {
          if (deleteEdgeStatement(db, descriptor.replacesEdgeId) > 0) touched = true;
        }
      }
      if (touched && typeof this.repository.touchGraphRevision === "function") {
        this.repository.touchGraphRevision(db);
      }
      if (touched && typeof this.repository.clearDraftWorld === "function") {
        this.repository.clearDraftWorld();
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    if (this.services.symbolIndexService && typeof this.services.symbolIndexService.invalidate === "function") {
      this.services.symbolIndexService.invalidate();
    }

    const result = {
      migrationKey: MIGRATION_KEY,
      previewId,
      alreadyApplied: false,
      graphRevision: Number(this.repository.getGraphRevision ? this.repository.getGraphRevision() : currentGraph.graphRevision || 0),
      nodesCreated,
      nodesUpdated,
      edgesCreated,
      warnings: plan.warnings
    };
    this.repository.db.prepare(`
      INSERT INTO graph_migration_runs (id, migration_key, from_version, to_version, mode, plan_json, result_json, actor_user_id, created_at, applied_at)
      VALUES (?, ?, ?, ?, 'applied', ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      MIGRATION_KEY,
      String(currentGraph?.contentSchemaVersion || ""),
      String(currentGraph?.contentSchemaVersion || ""),
      JSON.stringify(plan),
      JSON.stringify(result),
      actorUserId || null,
      now(),
      now()
    );
    return result;
  }
}

export { MIGRATION_KEY };
