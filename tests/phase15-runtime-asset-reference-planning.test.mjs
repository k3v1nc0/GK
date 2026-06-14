import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  NODE_VALUE_SOCKET_TYPES,
  RUNTIME_ASSET_REFERENCE_PLANNING_LIFECYCLE_STATES,
  RUNTIME_ASSET_REFERENCE_PLANNING_MARKER,
  SCHEMA_PACKAGE_SCOPE,
  createRuntimeAssetReferencePlanningState,
  createRuntimeAssetReferenceSafetyFlags,
  createRuntimeSceneAssemblyState,
  validateRuntimeAssetReferencePlanningState
} from "../packages/schemas/src/index.ts";
import { getCoreGraphNodeTypes } from "../packages/node-types/src/index.ts";
import {
  createRuntimeAssetReferencePlanningShellState,
  renderRuntimeAssetReferencePlanningSection,
  runtimeAssetReferencePlanningClientContract
} from "../apps/game-web/src/runtime-asset-reference-planning.ts";
import { renderRuntimeClientShellHtml } from "../apps/game-web/src/runtime-client-shell.ts";
import { handleGameRequest } from "../apps/game-web/src/http-server.ts";

const FORBIDDEN_CONCRETE_QUEST_CONTENT_PATTERN = /Quest 00|Humble Ash Staff|Spark|Empathy Casting|Mentor failure|The Candle|Fixture Quest Title|Fixture Reward Name|Fixture Unlock Name|Fixture Dialogue Line/i;
const nodeTypes = new Set(getCoreGraphNodeTypes().map((node) => node.type));

test("Fase 15 schema package exports runtime asset reference planning contracts", () => {
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("runtime-asset-reference-planning"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("runtime-asset-reference-planning-validation"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("runtime-asset-loader"), false);
  assert.deepEqual([...RUNTIME_ASSET_REFERENCE_PLANNING_LIFECYCLE_STATES], ["booting", "empty", "planned", "ready", "error"]);
});

test("Fase 15 runtime asset reference planning sockets and node contracts are registered", () => {
  for (const socketType of [
    "runtime.asset.reference.source.reference",
    "runtime.asset.reference.planning.status.reference",
    "runtime.asset.reference.plan.reference",
    "runtime.asset.reference.descriptor.reference",
    "runtime.asset.reference.candidate.reference",
    "runtime.asset.reference.safety.reference"
  ]) {
    assert.equal(NODE_VALUE_SOCKET_TYPES.includes(socketType), true, `${socketType} should exist`);
  }

  for (const nodeType of [
    "gk.runtimeAssetReferencePlanning.source",
    "gk.runtimeAssetReferencePlanning.plan",
    "gk.runtimeAssetReferencePlanning.descriptor",
    "gk.runtimeAssetReferencePlanning.candidate",
    "gk.runtimeAssetReferencePlanning.status",
    "gk.runtimeAssetReferencePlanning.safetyFlags"
  ]) {
    assert.equal(nodeTypes.has(nodeType), true, `${nodeType} should be registered`);
  }

  const runtimeAssetNodes = getCoreGraphNodeTypes().filter((node) => node.type.startsWith("gk.runtimeAssetReferencePlanning."));
  assert.equal(runtimeAssetNodes.every((node) => node.scope === "runtime-consumer"), true);
  assert.equal(runtimeAssetNodes.every((node) => node.createsConcreteGameContent === false), true);
  assert.equal(runtimeAssetNodes.every((node) => node.validate.validate({ loadsAssets: true }).length > 0), true);
  assert.equal(runtimeAssetNodes.every((node) => node.validate.validate({ fetchesAssetBytes: true }).length > 0), true);
  assert.equal(runtimeAssetNodes.every((node) => node.validate.validate({ resolvesFinalAssetRoles: true }).length > 0), true);
  assert.equal(runtimeAssetNodes.every((node) => node.validate.validate({ rendersScene: true }).length > 0), true);
  assert.equal(runtimeAssetNodes.every((node) => node.validate.validate({ implementsGameplay: true }).length > 0), true);
});

test("runtime asset reference planning validates safe empty asset reference plan", () => {
  const state = createRuntimeAssetReferencePlanningState();
  const validation = validateRuntimeAssetReferencePlanningState(state);

  assert.equal(validation.valid, true);
  assert.equal(state.phase, RUNTIME_ASSET_REFERENCE_PLANNING_MARKER);
  assert.equal(state.status.lifecycle, "empty");
  assert.equal(state.plan.emptyAssetReferencePlan, true);
  assert.equal(state.plan.sceneDescriptorCount, 0);
  assert.equal(state.plan.descriptorCount, 0);
  assert.equal(state.plan.candidateCount, 0);
  assert.equal(state.safetyFlags.consumesRuntimeScenePlan, true);
  assert.equal(state.safetyFlags.producesAssetReferencePlan, true);
  assert.equal(state.safetyFlags.usesAssetMetadataOnly, true);
  assert.equal(state.safetyFlags.loadsAssets, false);
  assert.equal(state.safetyFlags.fetchesAssetBytes, false);
  assert.equal(state.safetyFlags.resolvesFinalAssetRoles, false);
  assert.equal(state.safetyFlags.rendersScene, false);
  assert.equal(state.safetyFlags.rendererDrawCalls, false);
  assert.equal(state.safetyFlags.implementsGameplay, false);
  assert.equal(state.safetyFlags.implementsMovement, false);
  assert.equal(state.safetyFlags.implementsCombat, false);
  assert.equal(state.safetyFlags.implementsAudioPlayback, false);
  assert.equal(state.safetyFlags.hardcodesWorld, false);
  assert.equal(state.safetyFlags.hardcodesCamera, false);
  assert.equal(state.safetyFlags.hardcodesLighting, false);
  assert.equal(state.safetyFlags.hardcodesHud, false);
  assert.equal(state.safetyFlags.hardcodesMinimap, false);
  assert.equal(state.safetyFlags.hardcodesContent, false);
  assert.equal(state.safetyFlags.mutatesAssets, false);
  assert.equal(state.safetyFlags.usesEditorDraftData, false);
});

test("runtime asset reference planning creates generic metadata candidates from scene descriptors", () => {
  const sceneState = createRuntimeSceneAssemblyState({ projectionReadModel: createReadModelWithRecord() });
  const state = createRuntimeAssetReferencePlanningState({ scenePlan: sceneState.plan });
  const validation = validateRuntimeAssetReferencePlanningState(state);
  const descriptor = state.plan.descriptors[0];
  const candidate = state.plan.candidates[0];

  assert.equal(validation.valid, true);
  assert.equal(state.plan.emptyAssetReferencePlan, false);
  assert.equal(state.plan.lifecycle, "planned");
  assert.equal(state.plan.sceneDescriptorCount, 1);
  assert.equal(state.plan.descriptorCount, 1);
  assert.equal(state.plan.candidateCount, 1);
  assert.equal(descriptor.sourceSceneDescriptorId, sceneState.plan.descriptors[0].descriptorId);
  assert.equal(descriptor.sourceRecordId, "runtime-record:entity:1");
  assert.equal(descriptor.metadataOnly, true);
  assert.equal(descriptor.assetLoadUrl, null);
  assert.equal(descriptor.assetByteUrl, null);
  assert.equal(descriptor.finalAssetRole, null);
  assert.equal(descriptor.rendererInstruction, null);
  assert.equal(candidate.metadataReferenceId, descriptor.dataReferenceId);
  assert.equal(candidate.assetLibraryId, null);
  assert.equal(candidate.assetRoleHint, null);
  assert.equal(candidate.finalAssetRole, null);
  assert.equal(candidate.assetLoadUrl, null);
  assert.equal(candidate.assetByteUrl, null);
});

test("runtime asset reference planning validation rejects unsafe flags and indicators", () => {
  const unsafeState = createRuntimeAssetReferencePlanningState({
    safetyFlags: createRuntimeAssetReferenceSafetyFlags({
      usesEditorAdminRoutes: true,
      usesEditorDraftData: true,
      loadsAssets: true,
      fetchesAssetBytes: true,
      resolvesFinalAssetRoles: true,
      rendersScene: true,
      rendererDrawCalls: true,
      implementsGameplay: true,
      implementsMovement: true,
      implementsCombat: true,
      implementsAudioPlayback: true,
      hardcodesWorld: true,
      hardcodesCamera: true,
      hardcodesLighting: true,
      hardcodesHud: true,
      hardcodesMinimap: true,
      hardcodesContent: true,
      mutatesAssets: true
    }),
    assetLoadUrls: ["asset-reference-load-url"],
    assetByteFetchUrls: ["asset-reference-byte-url"],
    finalAssetRoleIndicators: ["final-character-role"],
    concreteContentIndicators: ["npc-payload"],
    hardcodedRuntimeValueIndicators: ["camera-position"],
    rendererDrawCallIndicators: ["draw-call"]
  });
  const validation = validateRuntimeAssetReferencePlanningState(unsafeState);

  assert.equal(validation.valid, false);
  assert.equal(validation.issues.some((issue) => issue.gate === "runtime-scene-plan-only"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-editor-admin-routes"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-editor-draft-data"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-asset-loads"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-asset-byte-fetch"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-final-asset-role-mapping"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-concrete-content"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-hardcoded-runtime-values"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-renderer-draw-calls"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-gameplay-audio"), true);
});

test("game shell renders runtime asset reference planning marker and empty asset reference plan", () => {
  const html = renderRuntimeClientShellHtml();
  const section = renderRuntimeAssetReferencePlanningSection(createRuntimeAssetReferencePlanningShellState());

  for (const output of [html, section]) {
    assert.match(output, /data-runtime-asset-reference-planning="phase-15"/);
    assert.match(output, /data-runtime-empty-asset-reference-plan/);
    assert.match(output, /Empty asset reference plan/);
    assert.doesNotMatch(output, /\/editor\//);
    assert.doesNotMatch(output, /\/auth\/editor/);
    assert.doesNotMatch(output, /\/assets\//);
    assert.doesNotMatch(output, /\.glb|\.gltf|\.mp3|\.wav|\.ogg/i);
  }

  assert.doesNotMatch(section, /NPC|quest|economy|loot/i);
  assert.doesNotMatch(html, /NPC|economy|loot/i);
  assert.doesNotMatch(html, FORBIDDEN_CONCRETE_QUEST_CONTENT_PATTERN);
});

test("runtime asset reference planning client contract stays metadata-only and contentless", () => {
  assert.equal(runtimeAssetReferencePlanningClientContract.method, "metadata-only");
  assert.equal(runtimeAssetReferencePlanningClientContract.credentials, "omit");
  assert.equal(runtimeAssetReferencePlanningClientContract.consumesRuntimeScenePlan, true);
  assert.equal(runtimeAssetReferencePlanningClientContract.producesAssetReferencePlan, true);
  assert.equal(runtimeAssetReferencePlanningClientContract.usesAssetMetadataOnly, true);
  assert.equal(runtimeAssetReferencePlanningClientContract.loadsAssets, false);
  assert.equal(runtimeAssetReferencePlanningClientContract.fetchesAssetBytes, false);
  assert.equal(runtimeAssetReferencePlanningClientContract.resolvesFinalAssetRoles, false);
  assert.equal(runtimeAssetReferencePlanningClientContract.rendersScene, false);
  assert.equal(runtimeAssetReferencePlanningClientContract.rendererDrawCalls, false);
  assert.equal(runtimeAssetReferencePlanningClientContract.implementsGameplay, false);
  assert.equal(runtimeAssetReferencePlanningClientContract.implementsMovement, false);
  assert.equal(runtimeAssetReferencePlanningClientContract.implementsCombat, false);
  assert.equal(runtimeAssetReferencePlanningClientContract.implementsAudioPlayback, false);
  assert.equal(runtimeAssetReferencePlanningClientContract.hardcodesWorld, false);
  assert.equal(runtimeAssetReferencePlanningClientContract.hardcodesCamera, false);
  assert.equal(runtimeAssetReferencePlanningClientContract.hardcodesLighting, false);
  assert.equal(runtimeAssetReferencePlanningClientContract.hardcodesHud, false);
  assert.equal(runtimeAssetReferencePlanningClientContract.hardcodesMinimap, false);
  assert.equal(runtimeAssetReferencePlanningClientContract.hardcodesContent, false);
  assert.equal(runtimeAssetReferencePlanningClientContract.mutatesAssets, false);
  assert.equal(runtimeAssetReferencePlanningClientContract.usesEditorDraftData, false);
  assert.equal(runtimeAssetReferencePlanningClientContract.usesEditorAdminRoutes, false);
});

test("game web routes expose phase 15 asset reference planning without byte, role or render payload", () => {
  return (async () => {
    for (const path of ["/", "/game", "/game/"]) {
      const response = await requestGame("GET", path);

      assert.equal(response.statusCode, 200);
      assert.match(response.body, /data-runtime-client-shell="phase-12"/);
      assert.match(response.body, /data-runtime-render-surface="phase-13"/);
      assert.match(response.body, /data-runtime-scene-assembly="phase-14"/);
      assert.match(response.body, /data-runtime-asset-reference-planning="phase-15"/);
      assert.match(response.body, /data-runtime-empty-asset-reference-plan/);
      assert.doesNotMatch(response.body, /\/assets\//);
      assert.doesNotMatch(response.body, /\.glb|\.gltf|\.mp3|\.wav|\.ogg/i);
    }

    const shellJson = await requestGame("GET", "/game/shell.json");
    assert.equal(shellJson.statusCode, 200);
    assert.match(shellJson.body, /"phase":"phase-15"/);
    assert.match(shellJson.body, /"loadsAssets":false/);
    assert.match(shellJson.body, /"fetchesAssetBytes":false/);
    assert.match(shellJson.body, /"resolvesFinalAssetRoles":false/);
    assert.match(shellJson.body, /"rendersScene":false/);
    assert.match(shellJson.body, /"implementsGameplay":false/);
    assert.doesNotMatch(shellJson.body, /\/editor\//);
    assert.doesNotMatch(shellJson.body, /\/assets\//);

    const health = await requestGame("GET", "/health/game");
    assert.equal(health.statusCode, 200);
    assert.match(health.body, /"runtimeAssetReferencePlanning":"phase-15"/);
    assert.match(health.body, /"consumesRuntimeScenePlan":true/);
    assert.match(health.body, /"producesAssetReferencePlan":true/);
    assert.match(health.body, /"usesAssetMetadataOnly":true/);
    assert.match(health.body, /"loadsAssets":false/);
    assert.match(health.body, /"fetchesAssetBytes":false/);
    assert.match(health.body, /"rendererDrawCalls":false/);
  })();
});

test("runtime asset reference planning source does not build loader, renderer, role mapping or gameplay", () => {
  const assetReferenceSources = [
    "apps/game-web/src/runtime-asset-reference-planning.ts",
    "apps/game-web/src/runtime-client-shell.ts",
    "apps/game-web/src/http-server.ts",
    "packages/schemas/src/runtime-asset-reference-planning.ts",
    "packages/schemas/src/runtime-asset-reference-planning-validation.ts",
    "packages/node-types/src/runtime-asset-reference-planning-nodes.ts"
  ].map((file) => readFileSync(file, "utf8")).join("\n");

  assert.doesNotMatch(assetReferenceSources, /GLTFLoader|loadGLB|new Audio\(|\.play\(/);
  assert.doesNotMatch(assetReferenceSources, /requestAnimationFrame|THREE\.|new Scene|new Mesh|drawImage|fillRect|stroke\(/);
  assert.doesNotMatch(assetReferenceSources, /fetch\(["']\/assets|src\s*=\s*["']\/assets/);
  assert.doesNotMatch(assetReferenceSources, /cameraPosition|cameraTarget|fieldOfView|ambientLight|directionalLight|hudLayout|minimapSize|audioVolume/);
  assert.doesNotMatch(assetReferenceSources, /assetLibraryId:\s*["'][^"']+/);
});

test("browser smoke checks runtime asset reference planning marker, empty plan and asset silence", () => {
  const smoke = readFileSync("tests/smoke/browser-smoke.mjs", "utf8");

  assert.match(smoke, /data-runtime-asset-reference-planning/);
  assert.match(smoke, /tryRuntimeAssetReferencePlanningSmoke/);
  assert.match(smoke, /data-runtime-empty-asset-reference-plan/);
  assert.match(smoke, /asset reference planning:/);
  assert.match(smoke, /asset load requests:/);
  assert.match(smoke, /isForbiddenRenderAssetRequest/);
});

function createReadModelWithRecord() {
  const safetyFlags = {
    publishesRuntimeProjection: true,
    implementsRuntimeRenderer: false,
    mutatesAssets: false,
    containsConcreteGameContent: false,
    usesHardcodedContent: false,
    copiesAssetsToGit: false,
    assignsDefinitiveRuntimeRoles: false,
    leaksEditorDraftData: false
  };
  const record = {
    recordId: "runtime-record:entity:1",
    recordType: "entity.reference",
    sourceId: "publish-snapshot:1",
    snapshotId: "snapshot:1",
    dataReference: { source: "publish-snapshot-metadata", id: "entity-reference:1" },
    uiDisplay: null,
    safetyFlags,
    runtimeReadable: true,
    rendererInstruction: null
  };

  return {
    status: "runtime-readable",
    manifest: {
      manifestId: "runtime-manifest:1",
      status: "runtime-readable",
      source: {
        sourceId: "publish-snapshot:1",
        sourceKind: "publish-snapshot-metadata",
        snapshot: null,
        publishValidation: null,
        candidateReferences: [],
        acceptedGeneratedReferences: [],
        usesPublishReadySnapshot: true,
        readsRawDraftData: false,
        readsProceduralPreviewDirectly: false,
        readsProceduralBakeDirectly: false,
        leaksEditorDraftData: false
      },
      sourceSnapshotId: "snapshot:1",
      createdAt: "2026-06-13T00:00:00.000Z",
      recordCount: 1,
      records: [record],
      safetyFlags,
      runtimeReadable: true,
      rendererInstruction: null
    },
    records: [record],
    emptyState: false,
    runtimeReadable: true,
    leaksEditorDraftData: false,
    containsConcreteGameContent: false,
    implementsRuntimeRenderer: false
  };
}

async function requestGame(method, path) {
  const response = new MockServerResponse();
  await handleGameRequest(mockRequest(method, path), response);
  return response;
}

function mockRequest(method, path) {
  return {
    method,
    url: path,
    headers: {},
    socket: { remoteAddress: "127.0.0.1" }
  };
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

  write(chunk) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    return true;
  }

  end(chunk = "") {
    if (chunk) {
      this.write(chunk);
    }
    this.body = Buffer.concat(this.chunks).toString("utf8");
    return this;
  }
}
