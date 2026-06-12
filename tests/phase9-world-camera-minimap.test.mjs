import assert from "node:assert/strict";
import test from "node:test";

import {
  NODE_VALUE_SOCKET_TYPES,
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
  EDITOR_WORLD_ROUTE_IDS,
  authorizeEditorWorldAccess,
  createEditorMinimapSettingsResponse,
  createEditorUiDisplayAssetsResponse,
  createEditorWorldSettingsResponse,
  createEditorWorldValidationResponse
} from "../apps/api-server/src/editor-world-routes.ts";

const phase9NodeTypes = new Set(getCoreGraphNodeTypes().map((node) => node.type));

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
