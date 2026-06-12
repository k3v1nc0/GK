import assert from "node:assert/strict";
import test from "node:test";

import {
  NODE_VALUE_SOCKET_TYPES,
  SCHEMA_PACKAGE_SCOPE,
  UI_DISPLAY_SCHEMA_HINTS,
  createGeneratedCandidateReference,
  createMinimapMarkerDraft,
  createMinimapViewDraft,
  createPhase9DataDrivenNodeDraft,
  createUiAssetDisplayContract,
  createUiIconDisplayContract,
  createWorldZoneDraft,
  validateGeneratedCandidateReference,
  validateMinimapMarkerDraft,
  validatePhase9NodeData,
  validateUiAssetDisplayContract,
  validateWorldZoneDraft
} from "../packages/schemas/src/index.ts";
import { getCoreGraphNodeTypes } from "../packages/node-types/src/index.ts";
import {
  EDITOR_WORLD_ROUTE_DEFINITIONS,
  EDITOR_WORLD_ROUTE_IDS,
  authorizeEditorWorldAccess,
  createEditorMinimapSettingsResponse,
  createEditorUiDisplayAssetsResponse,
  createEditorWorldSettingsResponse,
  createEditorWorldValidationResponse
} from "../apps/api-server/src/editor-world-routes.ts";
import { handleApiRequest } from "../apps/api-server/src/http-server.ts";
import { createEditorShellModel } from "../apps/editor-web/src/editor-shell.ts";
import { EDITOR_PANEL_DEFINITIONS } from "../apps/editor-web/src/panels.ts";

const phase9NodeTypes = new Set(getCoreGraphNodeTypes().map((node) => node.type));
const phase9HttpRoutes = [
  ["GET", "/editor/world/settings"],
  ["POST", "/editor/world/validate"],
  ["GET", "/editor/minimap/settings"],
  ["POST", "/editor/minimap/validate"],
  ["GET", "/editor/ui-display/assets"],
  ["POST", "/editor/ui-display/validate"]
];
const phase9PanelIds = [
  "world-panel",
  "zone-panel",
  "camera-panel",
  "lighting-panel",
  "minimap-panel",
  "ui-display-inspector"
];

test("Fase 9 schema package exports only existing world, minimap, UI and publish contracts", () => {
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("entity-components"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("entity-validation"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("procedural-validation"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("world-camera-minimap"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("world-camera-minimap-validation"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("node-publish"), true);

  for (const removedScope of [
    "asset-library-validation",
    "entity-component-system",
    "entity-component-system-validation",
    "procedural-generation-validation",
    "editor-shell"
  ]) {
    assert.equal(SCHEMA_PACKAGE_SCOPE.includes(removedScope), false);
  }
});

test("Fase 9 route contracts are editor-only, CSRF-aware and non-publishing", () => {
  const routeKeys = new Set(EDITOR_WORLD_ROUTE_DEFINITIONS.map((route) => `${route.method} ${route.path}`));

  for (const [method, path] of phase9HttpRoutes) {
    assert.equal(routeKeys.has(`${method} ${path}`), true, `${method} ${path} should have a route contract`);
  }

  for (const route of EDITOR_WORLD_ROUTE_DEFINITIONS) {
    assert.equal(route.public, false);
    assert.equal(route.requiredScope, "editor");
    assert.equal(route.publishesRuntimeOutput, false);
    assert.equal(route.modifiesAssets, false);
    assert.equal(route.requiresCsrf, route.stateChanging);
  }
});

test("Fase 9 routes are wired into the API server and deny anonymous sessions", async () => {
  for (const [method, path] of phase9HttpRoutes) {
    const response = await requestApi(method, path);

    assert.notEqual(response.statusCode, 404, `${method} ${path} should be handled before the 404 fallback`);
    assert.equal([401, 403].includes(response.statusCode), true, `${method} ${path} should deny anonymous access`);
  }
});

test("Fase 9 panels are registered in the editor shell model", () => {
  const shell = createEditorShellModel();
  const registeredPanelIds = shell.panels.map((panel) => panel.id);

  assert.equal(shell.panels, EDITOR_PANEL_DEFINITIONS);
  assert.equal(new Set(registeredPanelIds).size, registeredPanelIds.length, "editor panel ids should remain unique");

  for (const panelId of phase9PanelIds) {
    assert.equal(registeredPanelIds.includes(panelId), true, `${panelId} should be in the live editor panel model`);
  }

  for (const panelId of ["world-panel", "zone-panel", "camera-panel", "lighting-panel", "minimap-panel"]) {
    assert.equal(shell.layout.dockTabs.includes(panelId), true, `${panelId} should be visible in dock tabs`);
  }

  assert.equal(shell.layout.right.includes("ui-display-inspector"), true);
});

test("Fase 9 world, camera, lighting, minimap and UI node types are registered", () => {
  for (const nodeType of [
    "gk.world.settings",
    "gk.world.level",
    "gk.world.zone",
    "gk.world.spawnpoint",
    "gk.world.generatedZoneReference",
    "gk.world.generatedPlacementReference",
    "gk.camera.mode",
    "gk.camera.followTarget",
    "gk.camera.zoom",
    "gk.lighting.directional",
    "gk.lighting.ambient",
    "gk.lighting.fog",
    "gk.lighting.sky",
    "gk.lighting.dayNightCycle",
    "gk.minimap.view",
    "gk.minimap.layer",
    "gk.minimap.marker",
    "gk.minimap.icon",
    "gk.minimap.generatedPathLayer",
    "gk.minimap.generatedResourceLayer",
    "gk.minimap.generatedSpawnLayer",
    "gk.ui.assetDisplay",
    "gk.ui.iconDisplay",
    "gk.ui.hudFrame",
    "gk.ui.hudBar",
    "gk.ui.nineSlice"
  ]) {
    assert.equal(phase9NodeTypes.has(nodeType), true, `${nodeType} should be registered`);
  }
});

test("Fase 9 socket contracts keep generated candidates distinct from runtime world content", () => {
  for (const socketType of [
    "world.settings.reference",
    "world.level.reference",
    "world.zone.reference",
    "world.spawnpoint.reference",
    "generated.zone.candidate.reference",
    "generated.placement.candidate.reference",
    "generated.path-network.candidate.reference",
    "generated.resource-distribution.candidate.reference",
    "camera.reference",
    "lighting.reference",
    "minimap.view.reference",
    "minimap.layer.reference",
    "minimap.marker.reference",
    "ui.asset-display.reference"
  ]) {
    assert.equal(NODE_VALUE_SOCKET_TYPES.includes(socketType), true, `${socketType} should exist`);
  }
});

test("camera, lighting and minimap values require explicit node-data", () => {
  const cameraNode = createPhase9DataDrivenNodeDraft({
    nodeId: "camera-node-contract",
    nodeType: "camera.zoom",
    config: { profileKey: "editor-data-profile" }
  });
  assert.equal(cameraNode.publishesRuntimeOutput, false);
  assert.deepEqual(validatePhase9NodeData(cameraNode), []);

  const missingConfig = createPhase9DataDrivenNodeDraft({
    nodeId: "camera-node-missing-config",
    nodeType: "camera.zoom",
    config: null
  });
  assert.equal(validatePhase9NodeData(missingConfig).some((issue) => issue.path === "config"), true);
});

test("Fase 8.1 generated world references remain draft candidates for Fase 9", () => {
  const generatedZone = createGeneratedCandidateReference({
    candidateType: "generated.zone.candidate",
    generationOutputId: "generation-output-contract",
    candidateId: "zone-candidate-contract"
  });

  const zone = createWorldZoneDraft({
    zoneId: "zone-contract",
    levelId: "level-contract",
    source: "procedural-draft",
    generatedZoneReference: generatedZone
  });

  assert.equal(generatedZone.status, "candidate");
  assert.equal(generatedZone.publishesRuntimeOutput, false);
  assert.deepEqual(validateGeneratedCandidateReference(generatedZone), []);
  assert.equal(validateWorldZoneDraft(zone).some((issue) => issue.blocksRuntimePublish), false);
});

test("UI display nodes never use source image natural size as display size", () => {
  const missingDisplaySize = createUiAssetDisplayContract({
    displayId: "ui-display-missing-size",
    assetReference: { source: "asset-library", assetId: "asset-library-ui-candidate" },
    naturalWidth: 2048,
    naturalHeight: 1024,
    displayWidth: null,
    displayHeight: null
  });

  const missingIssues = validateUiAssetDisplayContract(missingDisplaySize);
  assert.equal(missingIssues.some((issue) => issue.path === "displaySize"), true);
  assert.equal(missingIssues.some((issue) => issue.path === "naturalSize" && issue.severity === "warning"), true);

  const explicitDisplaySize = createUiAssetDisplayContract({
    displayId: "ui-display-contract",
    assetReference: { source: "asset-library", assetId: "asset-library-ui-candidate" },
    naturalWidth: 2048,
    naturalHeight: 1024,
    displayWidth: 64,
    displayHeight: 32
  });

  assert.deepEqual(validateUiAssetDisplayContract(explicitDisplaySize), []);
});

test("icon and minimap marker display defaults are schema hints and remain overrideable", () => {
  assert.equal(UI_DISPLAY_SCHEMA_HINTS.schemaHintOnly, true);
  assert.deepEqual(UI_DISPLAY_SCHEMA_HINTS.iconDisplay, { displayWidth: 32, displayHeight: 32 });
  assert.deepEqual(UI_DISPLAY_SCHEMA_HINTS.minimapMarkerDisplay, { displayWidth: 24, displayHeight: 24 });

  const iconDisplay = createUiIconDisplayContract(
    { source: "asset-library", assetId: "asset-library-ui-icon-candidate" },
    { displayId: "ui-icon-display-contract" }
  );

  assert.equal(iconDisplay.displayWidth, 32);
  assert.equal(iconDisplay.displayHeight, 32);
  assert.equal(iconDisplay.defaultsAreSchemaHintsOnly, true);

  const overriddenMarkerDisplay = createUiAssetDisplayContract({
    displayId: "minimap-marker-display-contract",
    assetReference: { source: "asset-library", assetId: "asset-library-minimap-marker-candidate" },
    displayWidth: 48,
    displayHeight: 48
  });
  const marker = createMinimapMarkerDraft({
    markerId: "minimap-marker-contract",
    uiAssetReference: { source: "asset-library", assetId: "asset-library-minimap-marker-candidate" },
    display: overriddenMarkerDisplay
  });

  assert.deepEqual(validateMinimapMarkerDraft(marker), []);
  assert.equal(marker.display?.displayWidth, 48);
});

test("minimap markers and nine-slice UI display validate required display data", () => {
  const markerWithoutSource = createMinimapMarkerDraft({
    markerId: "minimap-marker-no-source",
    uiAssetReference: null,
    proceduralMarkerSource: null,
    display: null
  });
  assert.equal(validateMinimapMarkerDraft(markerWithoutSource).some((issue) => issue.path === "source"), true);

  const nineSliceWithoutMargins = createUiAssetDisplayContract({
    displayId: "nine-slice-contract",
    assetReference: { source: "asset-library", assetId: "asset-library-hud-frame-candidate" },
    displayWidth: 128,
    displayHeight: 32,
    scaleMode: "nineSlice",
    nineSliceMargins: null
  });
  assert.equal(
    validateUiAssetDisplayContract(nineSliceWithoutMargins).some((issue) => issue.path === "nineSliceMargins"),
    true
  );
});

test("editor and game minimap views may differ through node-data", () => {
  const editorView = createMinimapViewDraft({
    viewId: "editor-minimap-contract-view",
    audience: "editor",
    layerIds: ["editor-layer-contract"],
    displayRules: { detailMode: "editor-only" }
  });
  const gameView = createMinimapViewDraft({
    viewId: "game-minimap-contract-view",
    audience: "game",
    layerIds: ["game-layer-contract"],
    displayRules: { detailMode: "game-only" }
  });

  assert.notDeepEqual(editorView, gameView);
  assert.equal(editorView.audience, "editor");
  assert.equal(gameView.audience, "game");
  assert.equal(editorView.publishesRuntimeOutput, false);
  assert.equal(gameView.publishesRuntimeOutput, false);
});

test("editor world and minimap management denies anonymous and game sessions", () => {
  assert.equal(authorizeEditorWorldAccess(EDITOR_WORLD_ROUTE_IDS.worldSettings, null).allowed, false);
  assert.equal(authorizeEditorWorldAccess(EDITOR_WORLD_ROUTE_IDS.minimapSettings, { scope: "game" }).allowed, false);
  assert.equal(authorizeEditorWorldAccess(EDITOR_WORLD_ROUTE_IDS.uiDisplayAssets, { scope: "editor" }).allowed, true);
});

test("editor-only route contracts do not publish runtime output or mutate assets", () => {
  const worldSettings = createEditorWorldSettingsResponse();
  const minimapSettings = createEditorMinimapSettingsResponse();
  const uiAssets = createEditorUiDisplayAssetsResponse();
  const validation = createEditorWorldValidationResponse({});

  assert.equal(worldSettings.publishesRuntimeOutput, false);
  assert.equal(worldSettings.worldSettings, null);
  assert.equal(minimapSettings.publishesRuntimeOutput, false);
  assert.equal(minimapSettings.editorView, null);
  assert.equal(minimapSettings.gameView, null);
  assert.equal(uiAssets.modifiesAssets, false);
  assert.equal(uiAssets.displaySizeMustComeFromNodeData, true);
  assert.equal(validation.publishesRuntimeOutput, false);
});

async function requestApi(method, path) {
  const response = new MockServerResponse();
  const request = {
    method,
    url: path,
    headers: {},
    socket: { remoteAddress: "127.0.0.1" }
  };

  await handleApiRequest(request, response, {
    editorAuthStore: null,
    now: () => new Date("2026-06-12T00:00:00.000Z")
  });

  return response;
}

class MockServerResponse {
  statusCode = 0;
  headers = {};
  chunks = [];
  body = "";

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    this.headers = { ...this.headers, ...headers };
    return this;
  }

  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = value;
  }

  getHeader(name) {
    return this.headers[String(name).toLowerCase()];
  }

  end(chunk = "") {
    if (chunk) {
      this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }

    this.body = Buffer.concat(this.chunks).toString("utf8");
  }
}
