import assert from "node:assert/strict";
import test from "node:test";

import {
  NODE_VALUE_SOCKET_TYPES,
  SCHEMA_PACKAGE_SCOPE,
  createGeneratedCandidateReference,
  createPublishCandidateReference,
  createPublishInputBundle,
  createPublishSnapshotMetadata,
  createRollbackSnapshotReference,
  createUiAssetDisplayContract,
  validatePublishInputBundle,
  validatePublishRollbackReference,
  validatePublishSnapshotMetadata
} from "../packages/schemas/src/index.ts";
import { getCoreGraphNodeTypes } from "../packages/node-types/src/index.ts";
import {
  EDITOR_PUBLISH_ROUTE_DEFINITIONS,
  EDITOR_PUBLISH_ROUTE_IDS,
  authorizeEditorPublishAccess,
  createEditorPublishSnapshotCreateResponse,
  createEditorPublishStatusResponse,
  handleEditorPublishHttpRequest
} from "../apps/api-server/src/editor-publish-routes.ts";
import { handleApiRequest } from "../apps/api-server/src/http-server.ts";
import { createEditorShellModel } from "../apps/editor-web/src/editor-shell.ts";
import { EDITOR_PANEL_DEFINITIONS } from "../apps/editor-web/src/panels.ts";
import { createPublishFlowPanelState } from "../apps/editor-web/src/publish-flow-panel.ts";

const adminSession = { scope: "editor", editorUserId: "editor-admin-contract", editorRoles: ["editor_admin"] };
const editorSession = { scope: "editor", editorUserId: "editor-contract", editorRoles: [] };
const gameSession = { scope: "game", gameUserStatus: "active", emailVerified: true };
const publishNodeTypes = new Set(getCoreGraphNodeTypes().map((node) => node.type));
const publishHttpRoutes = [
  ["GET", "/editor/publish/status"],
  ["POST", "/editor/publish/validate"],
  ["POST", "/editor/publish/snapshots"],
  ["GET", "/editor/publish/snapshots"],
  ["GET", "/editor/publish/snapshots/snapshot-contract"],
  ["POST", "/editor/publish/rollback/validate"]
];

function graph() {
  return {
    id: "publish-graph-contract",
    nodes: [
      { id: "publish-entry", type: "gk.flow.entry", position: { x: 0, y: 0 }, fields: {} }
    ],
    edges: [],
    revision: 1
  };
}

test("Fase 10 schema package exports publish flow contracts from real modules", () => {
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("publish-flow"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("publish-flow-validation"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("publish-flow-core"), false);
});

test("Fase 10 publish socket and node contracts are registered", () => {
  for (const socketType of ["publish.candidate.reference", "publish.validation.reference", "publish.snapshot.reference"]) {
    assert.equal(NODE_VALUE_SOCKET_TYPES.includes(socketType), true, `${socketType} should exist`);
  }

  for (const nodeType of [
    "gk.publish.status",
    "gk.publish.candidateReference",
    "gk.publish.validate",
    "gk.publish.snapshotMetadata",
    "gk.publish.rollbackReference"
  ]) {
    assert.equal(publishNodeTypes.has(nodeType), true, `${nodeType} should be registered`);
  }

  const publishNodes = getCoreGraphNodeTypes().filter((node) => node.type.startsWith("gk.publish."));
  assert.equal(publishNodes.every((node) => node.scope === "publish-boundary"), true);
  assert.equal(publishNodes.every((node) => node.createsConcreteGameContent === false), true);
});

test("publish validation rejects invalid drafts and keeps generated refs as candidates", () => {
  const missingGraph = validatePublishInputBundle(createPublishInputBundle({ bundleId: "publish-missing-graph" }));
  assert.equal(missingGraph.publishReady, false);
  assert.equal(missingGraph.issues.some((issue) => issue.gate === "node-graph-completeness"), true);

  const generatedZone = createGeneratedCandidateReference({
    candidateType: "generated.zone.candidate",
    generationOutputId: "generation-output-contract",
    candidateId: "zone-candidate-contract"
  });
  const bundle = createPublishInputBundle({
    bundleId: "publish-generated-candidate",
    state: "candidate",
    nodeGraph: graph(),
    world: { generatedReferences: [generatedZone] },
    generatedReferences: [generatedZone]
  });
  const validation = validatePublishInputBundle(bundle);

  assert.equal(generatedZone.status, "candidate");
  assert.equal(generatedZone.publishesRuntimeOutput, false);
  assert.equal(validation.issues.some((issue) => issue.path.includes("generatedReferences") && issue.severity === "error"), false);
});

test("publish validation gates UI display size, natural size metadata and nineSlice margins", () => {
  const largeWithoutDisplaySize = createUiAssetDisplayContract({
    displayId: "large-ui-candidate",
    assetReference: { source: "asset-library", assetId: "large-ui-asset-candidate" },
    naturalWidth: 4096,
    naturalHeight: 2048,
    displayWidth: null,
    displayHeight: null
  });
  const missingDisplayValidation = validatePublishInputBundle(createPublishInputBundle({
    bundleId: "publish-ui-missing-display-size",
    nodeGraph: graph(),
    uiDisplays: [largeWithoutDisplaySize]
  }));

  assert.equal(missingDisplayValidation.issues.some((issue) => issue.gate === "ui-display-sizing" && issue.path.includes("displaySize")), true);
  assert.equal(missingDisplayValidation.issues.some((issue) => issue.path.includes("naturalSize") && issue.severity === "warning"), true);

  const nineSliceWithoutMargins = createUiAssetDisplayContract({
    displayId: "nine-slice-publish-candidate",
    assetReference: { source: "asset-library", assetId: "hud-frame-candidate" },
    displayWidth: 128,
    displayHeight: 32,
    scaleMode: "nineSlice",
    nineSliceMargins: null
  });
  const nineSliceValidation = validatePublishInputBundle(createPublishInputBundle({
    bundleId: "publish-nine-slice-missing-margins",
    nodeGraph: graph(),
    uiDisplays: [nineSliceWithoutMargins]
  }));

  assert.equal(nineSliceValidation.issues.some((issue) => issue.path.includes("nineSliceMargins")), true);
});

test("publish validation blocks runtime publish, asset mutation and hardcoded content", () => {
  const baseBundle = createPublishInputBundle({
    bundleId: "publish-safety-flags",
    nodeGraph: graph(),
    hardcodedContentIndicators: ["hardcoded-world-map"]
  });
  const unsafeBundle = {
    ...baseBundle,
    runtimePublishRequested: true,
    automaticPublish: true,
    assetsCopiedToGit: true,
    containsConcreteRuntimeContent: true,
    publishesRuntimeOutput: true
  };
  const validation = validatePublishInputBundle(unsafeBundle);

  assert.equal(validation.publishReady, false);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-runtime-publish"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-asset-mutation"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-hardcoded-content"), true);
  assert.equal(validation.publishesRuntimeOutput, false);
  assert.equal(validation.assetsCopiedToGit, false);
});

test("snapshot metadata and rollback references contain no runtime payload", () => {
  const bundle = createPublishInputBundle({
    bundleId: "publish-ready-contract",
    state: "candidate",
    nodeGraph: graph(),
    candidateReferences: [
      createPublishCandidateReference({
        candidateId: "node-graph-candidate",
        source: "node-graph-draft",
        sourceId: "publish-graph-contract"
      })
    ]
  });
  const snapshot = createPublishSnapshotMetadata({
    sourceBundleId: bundle.bundleId,
    createdAt: "2026-06-12T00:00:00.000Z",
    createdByEditorUserId: "editor-admin-contract",
    candidateSummary: validatePublishInputBundle(bundle).candidateSummary
  });
  const rollback = createRollbackSnapshotReference({
    rollbackReferenceId: "rollback-contract",
    targetSnapshotId: snapshot.snapshotId
  });

  assert.deepEqual(validatePublishSnapshotMetadata(snapshot), []);
  assert.deepEqual(validatePublishRollbackReference(rollback), []);
  assert.equal(snapshot.containsRuntimePayload, false);
  assert.equal(snapshot.containsConcreteRuntimeContent, false);
  assert.equal(rollback.restoresRuntimeAutomatically, false);
});

test("publish route contracts are editor-admin only, CSRF-aware and non-publishing", () => {
  const routeKeys = new Set(EDITOR_PUBLISH_ROUTE_DEFINITIONS.map((route) => `${route.method} ${route.path}`));

  for (const [method, path] of [
    ["GET", "/editor/publish/status"],
    ["POST", "/editor/publish/validate"],
    ["POST", "/editor/publish/snapshots"],
    ["GET", "/editor/publish/snapshots"],
    ["GET", "/editor/publish/snapshots/:id"],
    ["POST", "/editor/publish/rollback/validate"]
  ]) {
    assert.equal(routeKeys.has(`${method} ${path}`), true, `${method} ${path} should have a route contract`);
  }

  for (const route of EDITOR_PUBLISH_ROUTE_DEFINITIONS) {
    assert.equal(route.public, false);
    assert.equal(route.requiredScope, "editor");
    assert.equal(route.requiredEditorRole, "editor_admin");
    assert.equal(route.requiresCsrf, route.stateChanging);
    assert.equal(route.publishesRuntimeOutput, false);
    assert.equal(route.modifiesAssets, false);
    assert.equal(route.containsConcreteGameContent, false);
  }
});

test("publish routes deny anonymous, game and non-admin editor sessions", async () => {
  assert.equal(authorizeEditorPublishAccess(EDITOR_PUBLISH_ROUTE_IDS.status, null).result.reason, "missing_session");
  assert.equal(authorizeEditorPublishAccess(EDITOR_PUBLISH_ROUTE_IDS.status, gameSession).result.reason, "wrong_scope");
  assert.equal(authorizeEditorPublishAccess(EDITOR_PUBLISH_ROUTE_IDS.status, editorSession).result.reason, "missing_role");
  assert.equal(authorizeEditorPublishAccess(EDITOR_PUBLISH_ROUTE_IDS.status, adminSession).allowed, true);

  for (const [method, path] of publishHttpRoutes) {
    const response = await requestApi(method, path);

    assert.notEqual(response.statusCode, 404, `${method} ${path} should be handled before the 404 fallback`);
    assert.equal([401, 403].includes(response.statusCode), true, `${method} ${path} should deny anonymous access`);
  }
});

test("state-changing publish routes require CSRF or allowed Origin before body parsing", async () => {
  for (const path of ["/editor/publish/validate", "/editor/publish/snapshots", "/editor/publish/rollback/validate"]) {
    const response = new MockServerResponse();
    const handled = await handleEditorPublishHttpRequest(mockRequest("POST", path), response, adminSession);

    assert.equal(handled, true);
    assert.equal(response.statusCode, 403);
    assert.match(response.body, /origin_not_allowed|csrf_required/);
  }
});

test("publish status and metadata responses do not publish runtime output", () => {
  const status = createEditorPublishStatusResponse();
  const bundle = createPublishInputBundle({ bundleId: "publish-response-contract", state: "candidate", nodeGraph: graph() });
  const snapshot = createEditorPublishSnapshotCreateResponse(bundle, adminSession, new Date("2026-06-12T00:00:00.000Z"));

  assert.equal(status.runtimePublishAvailable, false);
  assert.equal(status.publishesRuntimeOutput, false);
  assert.equal(status.modifiesAssets, false);
  assert.equal(snapshot.snapshotMetadataOnly, true);
  assert.equal(snapshot.snapshot.containsRuntimePayload, false);
  assert.equal(snapshot.publishesRuntimeOutput, false);
});

test("publish flow panel is registered in the editor shell model", () => {
  const shell = createEditorShellModel();
  const panelIds = shell.panels.map((panel) => panel.id);
  const panel = EDITOR_PANEL_DEFINITIONS.find((definition) => definition.id === "publish-flow-panel");
  const panelState = createPublishFlowPanelState();

  assert.equal(panelIds.includes("publish-flow-panel"), true);
  assert.equal(shell.layout.dockTabs.includes("publish-flow-panel"), true);
  assert.equal(new Set(panelIds).size, panelIds.length, "editor panel ids should remain unique");
  assert.equal(panel?.requiresEditorAdmin, true);
  assert.equal(panelState.runtimePublishEnabled, false);
  assert.equal(panelState.automaticPublishEnabled, false);
  assert.equal(panelState.modifiesAssets, false);
  assert.deepEqual(panelState.inventedContent, []);
});

function mockRequest(method, path) {
  return {
    method,
    url: path,
    headers: {},
    socket: { remoteAddress: "127.0.0.1" }
  };
}

async function requestApi(method, path) {
  const response = new MockServerResponse();

  await handleApiRequest(mockRequest(method, path), response, {
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
