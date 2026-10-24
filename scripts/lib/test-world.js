// Gedeelde bouwstenen voor testwerelden via de normale authoringroute (NODE-01/02).
//
// Gebruik vanuit smoke-, browser- en perf-scripts:
//   const world = createTestWorldApi(call);            // call(method, path, body) -> { status, json, text }
//   const foundation = await applyFoundation(world);    // World Assembly -> Game Output.gameProject
//   const zone = await createStartZone(world, foundation, { zoneId: "zone.demo", spawn: { x: 0, z: 0 } });
//   await world.add("ground_surface", { ... }, ROUTES.ground, foundation, zone);
//
// De route per soort node staat in ROUTES. Game Output accepteert sinds NODE-01 alleen gameProject.

export const ROUTES = Object.freeze({
  editorWorldSettings: { target: "assembly", fromPort: "editorWorldSettings", toPort: "editorWorldSettings" },
  gameWorldSettings: { target: "assembly", fromPort: "gameWorldSettings", toPort: "gameWorldSettings" },
  light: { target: "assembly", fromPort: "light", toPort: "lights" },
  keybind: { target: "assembly", fromPort: "keybind", toPort: "keybinds" },
  chunkLoading: { target: "assembly", fromPort: "chunkLoading", toPort: "chunkLoading" },
  ui: { target: "ui", fromPort: "ui", toPort: "ui" },
  minimapHud: { target: "ui", fromPort: "minimap", toPort: "minimap" },
  ground: { target: "zone", fromPort: "ground", toPort: "ground" },
  player: { target: "zone", fromPort: "player", toPort: "player" },
  entity: { target: "zone", fromPort: "entity", toPort: "entities" },
  terrain: { target: "zone", fromPort: "terrain", toPort: "terrain" },
  collision: { target: "zone", fromPort: "collision", toPort: "collision" },
  minimap: { target: "zone", fromPort: "minimap", toPort: "minimap" },
  spawnPoint: { target: "zone", fromPort: "spawnPoint", toPort: "spawns" }
});

export function createTestWorldApi(call) {
  async function request(method, pathname, body, expectedStatus, label) {
    const response = await call(method, pathname, body);
    if (response.status !== expectedStatus) {
      throw new Error(label + " mislukt: HTTP " + response.status + " " + String(response.text || "").slice(0, 300));
    }
    return response.json;
  }

  const api = {
    request,
    async graph() {
      return request("GET", "/api/editor/graph", null, 200, "graph ophalen");
    },
    async createNode(type, values, parentId = null) {
      const body = { type, values: values || {} };
      if (parentId) body.parentId = parentId;
      const json = await request("POST", "/api/editor/nodes", body, 201, "node " + type + " aanmaken");
      return { graph: json.graph || json, nodeId: json.nodeId || null };
    },
    async patchValues(nodeId, values) {
      return request("PATCH", "/api/editor/nodes/" + nodeId + "/values", { values }, 200, "node " + nodeId + " bijwerken");
    },
    async connect(fromNodeId, fromPort, toNodeId, toPort) {
      const json = await request("POST", "/api/editor/edges", { edge: { fromNodeId, fromPort, toNodeId, toPort } }, 201, "verbinding " + fromPort + " -> " + toPort);
      return json.graph || json;
    },
    // Maak een node en sluit hem aan volgens een ROUTES-regel. Geeft de nieuwe node-id terug.
    async add(type, values, route, foundation, zone) {
      const created = await api.createNode(type, values);
      const nodeId = created.nodeId;
      if (!nodeId) throw new Error("node " + type + " gaf geen nodeId terug");
      if (route) await api.wire(nodeId, route, foundation, zone);
      return nodeId;
    },
    async wire(nodeId, route, foundation, zone) {
      const targets = { assembly: foundation?.worldAssembly, ui: foundation?.uiOutput, zone: zone?.zoneOutput };
      const target = targets[route.target];
      if (!target) throw new Error("onbekend doel " + route.target + " voor route " + route.toPort);
      return api.connect(nodeId, route.fromPort, target.id, route.toPort);
    }
  };
  return api;
}

function requireNode(graph, type) {
  const node = (graph?.nodes || []).find(function (candidate) { return candidate.type === type; });
  if (!node) throw new Error("foundation mist node " + type);
  return node;
}

// Past de foundation-migratie toe op een verse database en geeft de belangrijkste nodes terug.
export async function applyFoundation(api) {
  const preview = await api.request("GET", "/api/editor/migrations/node-system-foundation-v1/preview", null, 200, "foundation preview");
  if (!preview || !preview.previewId) throw new Error("foundation preview gaf geen previewId");
  const before = await api.graph();
  await api.request("POST", "/api/editor/migrations/node-system-foundation-v1/apply", { previewId: preview.previewId, expectedGraphRevision: before.graphRevision }, 200, "foundation apply");
  const graph = await api.graph();
  return {
    graph,
    worldAssembly: requireNode(graph, "world_assembly"),
    zoneRegistry: requireNode(graph, "zone_registry"),
    uiOutput: requireNode(graph, "ui_output"),
    projectSettings: requireNode(graph, "game_project_settings"),
    gameCamera: requireNode(graph, "game_camera"),
    editorCamera: requireNode(graph, "editor_camera"),
    editorChunkLoading: requireNode(graph, "editor_chunk_loading"),
    gameChunkLoading: requireNode(graph, "game_chunk_loading")
  };
}

// Maakt de startzone (outdoor zones zijn verplicht 500 x 500) rond het midden van de wereld,
// met omgeving, Zone Output en een zone-default spawn, en zet de start-refs in de projectinstellingen.
export async function createStartZone(api, foundation, options = {}) {
  const zoneId = options.zoneId || "zone.test";
  const spawn = Object.assign({ spawnId: zoneId.replace(/^zone\./, "spawn.") + ".default", x: 0, y: 0, z: 0, facing: 0 }, options.spawn || {});
  const zoneDefinitionId = (await api.createNode("zone_definition", Object.assign({
    zoneId,
    displayName: options.displayName || "Test Zone",
    zoneType: "outdoor_normal",
    originX: -250,
    originY: 0,
    originZ: -250,
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
  }, options.zone || {}))).nodeId;
  const zoneEnvironmentId = (await api.createNode("zone_environment_settings", Object.assign({
    environmentId: zoneId.replace(/^zone\./, "environment."),
    backgroundColor: "#0b1622",
    fogColor: "#0b1622",
    fogDensity: 0,
    smoothShading: true,
    timeOfDayOffset: 0,
    shadowPresetOverride: "inherit"
  }, options.environment || {}))).nodeId;
  const zoneOutputId = (await api.createNode("zone_output", { packageId: zoneId + ".package", packageVersion: 1, includeEditorOnlyData: false })).nodeId;
  const spawnPointId = (await api.createNode("spawn_point", {
    spawnId: spawn.spawnId,
    role: "zone_default",
    zoneRef: zoneId,
    label: options.displayName ? options.displayName + " spawn" : "Spawn",
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    facing: spawn.facing,
    safeRadius: 1.25,
    snapToGround: true,
    validateCollision: true,
    activationConditionRef: null,
    priority: 0
  })).nodeId;
  await api.connect(zoneDefinitionId, "zone", zoneOutputId, "zone");
  await api.connect(zoneEnvironmentId, "environment", zoneOutputId, "environment");
  await api.connect(spawnPointId, "spawnPoint", zoneOutputId, "spawns");
  await api.connect(zoneOutputId, "zonePackage", foundation.zoneRegistry.id, "zonePackage");
  await api.patchValues(foundation.projectSettings.id, { startZoneRef: zoneId, startSpawnRef: spawn.spawnId });
  return {
    zoneId,
    spawnId: spawn.spawnId,
    zoneDefinition: { id: zoneDefinitionId },
    zoneEnvironment: { id: zoneEnvironmentId },
    zoneOutput: { id: zoneOutputId },
    spawnPoint: { id: spawnPointId }
  };
}

// Tweede zone met aankomst-spawn plus een Zone Link en een (niet-blokkerend) portal in de startzone.
// options: { modelAssetId (verplicht), portal: {x, z}, linkId, targetZoneId, arrival: {x, z} }
export async function addZoneLinkPortal(api, foundation, zone, options = {}) {
  if (!options.modelAssetId) throw new Error("addZoneLinkPortal vereist een modelAssetId voor het portal");
  const targetZoneId = options.targetZoneId || zone.zoneId + "_two";
  const linkId = options.linkId || "zone_link." + zone.zoneId.replace(/^zone\./, "") + "_to_two";
  const arrival = Object.assign({ x: 300, z: 0 }, options.arrival || {});
  const portal = Object.assign({ x: 6, z: -6 }, options.portal || {});
  const arrivalSpawnId = targetZoneId.replace(/^zone\./, "spawn.") + ".arrival";
  const secondZoneDefinitionId = (await api.createNode("zone_definition", {
    zoneId: targetZoneId, displayName: "Second Zone", zoneType: "outdoor_normal",
    originX: 250, originY: 0, originZ: -250, width: 500, depth: 500, minY: -100, maxY: 500,
    recommendedLevelMin: 1, recommendedLevelMax: 10, biomeTags: [], zoneTags: [],
    allowFastTravel: true, allowRespawn: true, activeByDefault: true
  })).nodeId;
  const secondZoneOutputId = (await api.createNode("zone_output", { packageId: targetZoneId + ".package", packageVersion: 1, includeEditorOnlyData: false })).nodeId;
  const arrivalSpawnPointId = (await api.createNode("spawn_point", {
    spawnId: arrivalSpawnId, role: "zone_default", zoneRef: targetZoneId, label: "Arrival",
    x: arrival.x, y: 0, z: arrival.z, facing: 90, safeRadius: 1.25, snapToGround: true,
    validateCollision: true, activationConditionRef: null, priority: 0
  })).nodeId;
  await api.connect(secondZoneDefinitionId, "zone", secondZoneOutputId, "zone");
  await api.connect(arrivalSpawnPointId, "spawnPoint", secondZoneOutputId, "spawns");
  await api.connect(secondZoneOutputId, "zonePackage", foundation.zoneRegistry.id, "zonePackage");
  const zoneLinkId = (await api.createNode("zone_link", {
    linkId, fromZoneRef: zone.zoneId, toZoneRef: targetZoneId, toSpawnRef: arrivalSpawnId,
    mode: "portal", bidirectional: false, transitionVisual: "fade", preloadDistance: 30, interactionRequired: true
  })).nodeId;
  await api.connect(zoneLinkId, "zoneLink", zone.zoneOutput.id, "links");
  const portalModelId = (await api.createNode("model_entity", {
    entityId: "entity.test_portal_model", label: "Test Portal Model", modelAssetId: options.modelAssetId,
    x: portal.x, y: 0, z: portal.z, solid: false, collisionRadius: 1
  })).nodeId;
  const portalComponentId = (await api.createNode("portal_component", { componentId: "portal.test_portal", zoneLinkRef: linkId, range: 4, autoActivate: false })).nodeId;
  const portalAssemblyId = (await api.createNode("entity_assembly", { entityId: "entity.test_portal", label: "Test Portal" })).nodeId;
  await api.connect(portalModelId, "entity", portalAssemblyId, "model");
  await api.connect(portalComponentId, "component", portalAssemblyId, "components");
  await api.connect(portalAssemblyId, "entity", zone.zoneOutput.id, "entities");
  return { linkId, targetZoneId, arrivalSpawnId, portal, arrival };
}
