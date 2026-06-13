import assert from "node:assert/strict";
import test from "node:test";

import {
  NODE_VALUE_SOCKET_TYPES,
  SCHEMA_PACKAGE_SCOPE,
  createGeneratedCandidateReference,
  createPublishCandidateReference,
  createPublishInputBundle,
  createPublishSnapshotMetadata,
  createRuntimeProjectionAcceptedGeneratedReference,
  createRuntimeProjectionManifest,
  createRuntimeProjectionReadModel,
  createRuntimeProjectionRecord,
  createRuntimeProjectionSafetyFlags,
  createRuntimeProjectionSource,
  validatePublishInputBundle,
  validateRuntimeProjectionManifest,
  validateRuntimeProjectionReadModel,
  validateRuntimeProjectionRecord,
  validateRuntimeProjectionSource
} from "../packages/schemas/src/index.ts";
import { getCoreGraphNodeTypes } from "../packages/node-types/src/index.ts";
import {
  EDITOR_RUNTIME_PROJECTION_ROUTE_DEFINITIONS,
  RUNTIME_PROJECTION_ROUTE_DEFINITIONS,
  authorizeRuntimeProjectionAdmin,
  createRuntimeProjectionProjectResponse,
  createRuntimeProjectionStatusResponse,
  handleRuntimeProjectionHttpRequest
} from "../apps/api-server/src/runtime-projection-routes.ts";
import { handleApiRequest } from "../apps/api-server/src/http-server.ts";
import { createEditorShellModel } from "../apps/editor-web/src/editor-shell.ts";
import { EDITOR_PANEL_DEFINITIONS } from "../apps/editor-web/src/panels.ts";
import { createRuntimeProjectionPanelState } from "../apps/editor-web/src/runtime-projection-panel.ts";

const adminSession = { scope: "editor", editorUserId: "editor-admin-contract", editorRoles: ["editor_admin"] };
const editorSession = { scope: "editor", editorUserId: "editor-contract", editorRoles: [] };
const gameSession = { scope: "game", gameUserStatus: "active", emailVerified: true };
const nodeTypes = new Set(getCoreGraphNodeTypes().map((node) => node.type));

function graph() {
  return {
    id: "projection-graph-contract",
    nodes: [
      { id: "projection-entry", type: "gk.flow.entry", position: { x: 0, y: 0 }, fields: {} }
    ],
    edges: [],
    revision: 1
  };
}

function validSource() {
  const bundle = createPublishInputBundle({
    bundleId: "projection-publish-bundle",
    state: "candidate",
    nodeGraph: graph()
  });
  const publishValidation = validatePublishInputBundle(bundle);
  const snapshot = createPublishSnapshotMetadata({
    sourceBundleId: bundle.bundleId,
    createdAt: "2026-06-12T00:00:00.000Z",
    createdByEditorUserId: "editor-admin-contract",
    validationResultId: publishValidation.validationId,
    candidateSummary: publishValidation.candidateSummary
  });

  return createRuntimeProjectionSource({
    sourceId: "runtime-projection-source-contract",
    snapshot,
    publishValidation,
    usesPublishReadySnapshot: true
  });
}

test("Fase 11 schema package exports runtime projection contracts from real modules", () => {
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("runtime-projection"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("runtime-projection-validation"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("runtime-projection-core"), false);
});

test("Fase 11 runtime projection sockets and node contracts are registered", () => {
  for (const socketType of [
    "runtime.projection.source.reference",
    "runtime.projection.validation.reference",
    "runtime.projection.manifest.reference",
    "runtime.projection.read-model.reference",
    "runtime.projection.audit.reference"
  ]) {
    assert.equal(NODE_VALUE_SOCKET_TYPES.includes(socketType), true, `${socketType} should exist`);
  }

  for (const nodeType of [
    "gk.runtimeProjection.source",
    "gk.runtimeProjection.validate",
    "gk.runtimeProjection.manifest",
    "gk.runtimeProjection.readModel",
    "gk.runtimeProjection.auditEvent"
  ]) {
    assert.equal(nodeTypes.has(nodeType), true, `${nodeType} should be registered`);
  }

  const projectionNodes = getCoreGraphNodeTypes().filter((node) => node.type.startsWith("gk.runtimeProjection."));
  assert.equal(projectionNodes.every((node) => node.scope === "publish-boundary"), true);
  assert.equal(projectionNodes.every((node) => node.createsConcreteGameContent === false), true);
});

test("runtime projection rejects raw drafts and requires publish snapshot metadata", () => {
  const missingSnapshot = validateRuntimeProjectionSource(createRuntimeProjectionSource({ sourceId: "projection-without-snapshot" }));
  assert.equal(missingSnapshot.valid, false);
  assert.equal(missingSnapshot.issues.some((issue) => issue.gate === "publish-source"), true);

  const rawDraftSource = {
    ...validSource(),
    readsRawDraftData: true,
    leaksEditorDraftData: true
  };
  const rawDraftValidation = validateRuntimeProjectionSource(rawDraftSource);
  assert.equal(rawDraftValidation.issues.some((issue) => issue.gate === "no-raw-draft-source"), true);

  const rawCandidate = createRuntimeProjectionSource({
    ...validSource(),
    candidateReferences: [
      createPublishCandidateReference({
        candidateId: "raw-candidate-contract",
        source: "world-camera-minimap-draft",
        sourceId: "world-draft-contract"
      })
    ]
  });
  const rawCandidateValidation = validateRuntimeProjectionSource(rawCandidate);
  assert.equal(rawCandidateValidation.issues.some((issue) => issue.path.includes("candidateReferences")), true);
});

test("procedural refs remain candidates until publish validation accepts them", () => {
  const generated = createGeneratedCandidateReference({
    candidateType: "generated.zone.candidate",
    generationOutputId: "generation-output-contract",
    candidateId: "generated-zone-contract"
  });
  const source = createRuntimeProjectionSource({
    ...validSource(),
    acceptedGeneratedReferences: [
      createRuntimeProjectionAcceptedGeneratedReference({
        reference: generated,
        acceptedByPublishValidation: false
      })
    ]
  });
  const validation = validateRuntimeProjectionSource(source);

  assert.equal(generated.status, "candidate");
  assert.equal(generated.publishesRuntimeOutput, false);
  assert.equal(validation.issues.some((issue) => issue.path.includes("acceptedGeneratedReferences")), true);
});

test("runtime projection manifest stays read-model only and contains no concrete content", () => {
  const source = validSource();
  const record = createRuntimeProjectionRecord({
    recordId: "world-reference-record",
    recordType: "world.reference",
    sourceId: source.sourceId,
    snapshotId: source.snapshot?.snapshotId ?? null
  });
  const manifest = createRuntimeProjectionManifest({
    source,
    createdAt: "2026-06-12T00:00:00.000Z",
    records: [record]
  });
  const validation = validateRuntimeProjectionManifest(manifest);

  assert.equal(validation.valid, true);
  assert.equal(manifest.rendererInstruction, null);
  assert.equal(manifest.safetyFlags.publishesRuntimeProjection, true);
  assert.equal(manifest.safetyFlags.implementsRuntimeRenderer, false);
  assert.equal(manifest.safetyFlags.mutatesAssets, false);
  assert.equal(manifest.safetyFlags.containsConcreteGameContent, false);
  assert.equal(manifest.safetyFlags.usesHardcodedContent, false);
});

test("runtime projection validates UI display size from data instead of natural image size", () => {
  const source = validSource();
  const record = createRuntimeProjectionRecord({
    recordId: "ui-display-record",
    recordType: "ui.reference",
    sourceId: source.sourceId,
    snapshotId: source.snapshot?.snapshotId ?? null,
    uiDisplay: {
      source: "publish-data",
      naturalWidth: 4096,
      naturalHeight: 2048,
      displayWidth: null,
      displayHeight: null,
      scaleMode: "contain",
      anchor: "center",
      pivot: "center",
      naturalSizeMetadataOnly: true
    }
  });
  const issues = validateRuntimeProjectionRecord(record);

  assert.equal(issues.some((issue) => issue.gate === "ui-display-sizing" && issue.path.includes("displaySize")), true);
  assert.equal(issues.some((issue) => issue.path.includes("naturalSize") && issue.severity === "warning"), true);
});

test("runtime projection safety flags block renderer, asset mutation and hardcoded content", () => {
  const source = validSource();
  const unsafeManifest = createRuntimeProjectionManifest({
    source,
    createdAt: "2026-06-12T00:00:00.000Z",
    safetyFlags: createRuntimeProjectionSafetyFlags({
      implementsRuntimeRenderer: true,
      mutatesAssets: true,
      containsConcreteGameContent: true,
      usesHardcodedContent: true,
      assignsDefinitiveRuntimeRoles: true
    })
  });
  const validation = validateRuntimeProjectionManifest(unsafeManifest);

  assert.equal(validation.valid, false);
  assert.equal(validation.issues.some((issue) => issue.gate === "read-model-only"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-asset-mutation"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-concrete-gamecontent"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "glb-role-candidate"), true);
});

test("runtime read model supports safe empty state without draft leakage", () => {
  const empty = createRuntimeProjectionReadModel();
  const validation = validateRuntimeProjectionReadModel(empty);

  assert.equal(empty.emptyState, true);
  assert.deepEqual(empty.records, []);
  assert.equal(empty.manifest, null);
  assert.equal(empty.leaksEditorDraftData, false);
  assert.equal(empty.containsConcreteGameContent, false);
  assert.equal(validation.valid, true);
});

test("runtime projection route contracts separate editor/admin writes from runtime reads", () => {
  const editorRouteKeys = new Set(EDITOR_RUNTIME_PROJECTION_ROUTE_DEFINITIONS.map((route) => `${route.method} ${route.path}`));
  const runtimeRouteKeys = new Set(RUNTIME_PROJECTION_ROUTE_DEFINITIONS.map((route) => `${route.method} ${route.path}`));

  for (const path of [
    "/editor/runtime-projection/status",
    "/editor/runtime-projection/validate",
    "/editor/runtime-projection/project",
    "/editor/runtime-projection/manifests",
    "/editor/runtime-projection/manifests/:id"
  ]) {
    assert.equal([...editorRouteKeys].some((route) => route.endsWith(path)), true, `${path} should have a route contract`);
  }

  for (const path of ["/runtime/projection/status", "/runtime/projection/manifest", "/runtime/projection/records"]) {
    assert.equal(runtimeRouteKeys.has(`GET ${path}`), true, `${path} should have a read route contract`);
  }

  for (const route of EDITOR_RUNTIME_PROJECTION_ROUTE_DEFINITIONS) {
    assert.equal(route.public, false);
    assert.equal(route.requiredScope, "editor");
    assert.equal(route.requiredEditorRole, "editor_admin");
    assert.equal(route.requiresCsrf, route.stateChanging);
    assert.equal(route.implementsRuntimeRenderer, false);
    assert.equal(route.modifiesAssets, false);
    assert.equal(route.containsConcreteGameContent, false);
  }

  for (const route of RUNTIME_PROJECTION_ROUTE_DEFINITIONS) {
    assert.equal(route.public, true);
    assert.equal(route.readOnly, true);
    assert.equal(route.stateChanging, false);
    assert.equal(route.leaksEditorDraftData, false);
  }
});

test("runtime projection editor routes deny anonymous, game and non-admin sessions", async () => {
  assert.equal(authorizeRuntimeProjectionAdmin(null).reason, "missing_session");
  assert.equal(authorizeRuntimeProjectionAdmin(gameSession).reason, "wrong_scope");
  assert.equal(authorizeRuntimeProjectionAdmin(editorSession).reason, "missing_role");
  assert.equal(authorizeRuntimeProjectionAdmin(adminSession).allowed, true);

  for (const [method, path] of [
    ["GET", "/editor/runtime-projection/status"],
    ["POST", "/editor/runtime-projection/validate"],
    ["POST", "/editor/runtime-projection/project"],
    ["GET", "/editor/runtime-projection/manifests"],
    ["GET", "/editor/runtime-projection/manifests/manifest-contract"]
  ]) {
    const response = await requestApi(method, path);

    assert.notEqual(response.statusCode, 404, `${method} ${path} should be handled before the 404 fallback`);
    assert.equal([401, 403].includes(response.statusCode), true, `${method} ${path} should deny anonymous access`);
  }
});

test("state-changing runtime projection routes require CSRF or allowed Origin", async () => {
  for (const path of ["/editor/runtime-projection/validate", "/editor/runtime-projection/project"]) {
    const response = new MockServerResponse();
    const handled = await handleRuntimeProjectionHttpRequest(mockRequest("POST", path), response, adminSession);

    assert.equal(handled, true);
    assert.equal(response.statusCode, 403);
    assert.match(response.body, /origin_not_allowed|csrf_required/);
  }
});

test("runtime read-only routes return safe empty state without draft leakage", async () => {
  for (const path of ["/runtime/projection/status", "/runtime/projection/manifest", "/runtime/projection/records"]) {
    const response = await requestApi("GET", path);

    assert.equal(response.statusCode, 200);
    assert.match(response.body, /"emptyState":true/);
    assert.doesNotMatch(response.body, /draft|candidateReferences|editorUserId/);
  }
});

test("runtime projection response creators do not build renderer or mutate assets", () => {
  const source = validSource();
  const status = createRuntimeProjectionStatusResponse();
  const project = createRuntimeProjectionProjectResponse(source, new Date("2026-06-12T00:00:00.000Z"));

  assert.equal(status.runtimeRendererAvailable, false);
  assert.equal(status.implementsRuntimeRenderer, false);
  assert.equal(project.contractOnly, true);
  assert.equal(project.implementsRuntimeRenderer, false);
  assert.equal(project.modifiesAssets, false);
  assert.equal(project.containsConcreteGameContent, false);
  assert.equal(project.manifest.records.length, 0);
});

test("runtime projection panel is registered in the editor shell model", () => {
  const shell = createEditorShellModel();
  const panelIds = shell.panels.map((panel) => panel.id);
  const panel = EDITOR_PANEL_DEFINITIONS.find((definition) => definition.id === "runtime-projection-panel");
  const panelState = createRuntimeProjectionPanelState();

  assert.equal(panelIds.includes("runtime-projection-panel"), true);
  assert.equal(shell.layout.dockTabs.includes("runtime-projection-panel"), true);
  assert.equal(new Set(panelIds).size, panelIds.length, "editor panel ids should remain unique");
  assert.equal(panel?.requiresEditorAdmin, true);
  assert.equal(panelState.runtimeRendererEnabled, false);
  assert.equal(panelState.runtimeGameClientEnabled, false);
  assert.equal(panelState.automaticProjectionEnabled, false);
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
