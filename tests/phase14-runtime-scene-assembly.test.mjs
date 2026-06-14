import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  NODE_VALUE_SOCKET_TYPES,
  RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
  RUNTIME_SCENE_ASSEMBLY_LIFECYCLE_STATES,
  RUNTIME_SCENE_ASSEMBLY_MARKER,
  SCHEMA_PACKAGE_SCOPE,
  createRuntimeSceneAssemblySafetyFlags,
  createRuntimeSceneAssemblyState,
  validateRuntimeSceneAssemblyRoutes,
  validateRuntimeSceneAssemblyState
} from "../packages/schemas/src/index.ts";
import { getCoreGraphNodeTypes } from "../packages/node-types/src/index.ts";
import {
  createRuntimeSceneAssemblyShellState,
  renderRuntimeSceneAssemblySection,
  runtimeSceneAssemblyClientContract
} from "../apps/game-web/src/runtime-scene-assembly.ts";
import { renderRuntimeClientShellHtml } from "../apps/game-web/src/runtime-client-shell.ts";
import { handleGameRequest } from "../apps/game-web/src/http-server.ts";

const FORBIDDEN_CONCRETE_QUEST_CONTENT_PATTERN = /Quest 00|Humble Ash Staff|Spark|Empathy Casting|Mentor failure|The Candle|Fixture Quest Title|Fixture Reward Name|Fixture Unlock Name|Fixture Dialogue Line/i;
const nodeTypes = new Set(getCoreGraphNodeTypes().map((node) => node.type));

test("Fase 14 schema package exports runtime scene assembly contracts from real modules", () => {
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("runtime-scene-assembly"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("runtime-scene-assembly-validation"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("runtime-scene-assembly-core"), false);
  assert.deepEqual([...RUNTIME_SCENE_ASSEMBLY_LIFECYCLE_STATES], ["booting", "empty", "planned", "ready", "error"]);
});

test("Fase 14 runtime scene assembly sockets and node contracts are registered", () => {
  for (const socketType of [
    "runtime.scene.assembly.source.reference",
    "runtime.scene.assembly.status.reference",
    "runtime.scene.assembly.plan.reference",
    "runtime.scene.assembly.descriptor.reference",
    "runtime.scene.assembly.safety.reference"
  ]) {
    assert.equal(NODE_VALUE_SOCKET_TYPES.includes(socketType), true, `${socketType} should exist`);
  }

  for (const nodeType of [
    "gk.runtimeSceneAssembly.source",
    "gk.runtimeSceneAssembly.plan",
    "gk.runtimeSceneAssembly.descriptor",
    "gk.runtimeSceneAssembly.status",
    "gk.runtimeSceneAssembly.safetyFlags"
  ]) {
    assert.equal(nodeTypes.has(nodeType), true, `${nodeType} should be registered`);
  }

  const runtimeSceneNodes = getCoreGraphNodeTypes().filter((node) => node.type.startsWith("gk.runtimeSceneAssembly."));
  assert.equal(runtimeSceneNodes.every((node) => node.scope === "runtime-consumer"), true);
  assert.equal(runtimeSceneNodes.every((node) => node.createsConcreteGameContent === false), true);
  assert.equal(runtimeSceneNodes.every((node) => node.validate.validate({ loadsAssets: true }).length > 0), true);
  assert.equal(runtimeSceneNodes.every((node) => node.validate.validate({ resolvesFinalAssetRoles: true }).length > 0), true);
  assert.equal(runtimeSceneNodes.every((node) => node.validate.validate({ rendersScene: true }).length > 0), true);
  assert.equal(runtimeSceneNodes.every((node) => node.validate.validate({ implementsGameplay: true }).length > 0), true);
});

test("runtime scene assembly contracts validate safe empty scene plan", () => {
  const state = createRuntimeSceneAssemblyState();
  const validation = validateRuntimeSceneAssemblyState(state);

  assert.equal(validation.valid, true);
  assert.equal(state.phase, RUNTIME_SCENE_ASSEMBLY_MARKER);
  assert.equal(state.status.lifecycle, "empty");
  assert.equal(state.plan.emptyScenePlan, true);
  assert.equal(state.plan.recordCount, 0);
  assert.equal(state.plan.descriptorCount, 0);
  assert.deepEqual(state.projectionRoutes, RUNTIME_CLIENT_PROJECTION_READ_ROUTES);
  assert.equal(state.safetyFlags.consumesRuntimeProjectionRecords, true);
  assert.equal(state.safetyFlags.producesScenePlan, true);
  assert.equal(state.safetyFlags.loadsAssets, false);
  assert.equal(state.safetyFlags.resolvesFinalAssetRoles, false);
  assert.equal(state.safetyFlags.rendersScene, false);
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

test("runtime scene assembly creates generic descriptors from runtime projection read-model records", () => {
  const state = createRuntimeSceneAssemblyState({ projectionReadModel: createReadModelWithRecord() });
  const validation = validateRuntimeSceneAssemblyState(state);
  const descriptor = state.plan.descriptors[0];
  const planNode = state.plan.nodes[0];

  assert.equal(validation.valid, true);
  assert.equal(state.plan.emptyScenePlan, false);
  assert.equal(state.plan.lifecycle, "planned");
  assert.equal(state.plan.recordCount, 1);
  assert.equal(state.plan.descriptorCount, 1);
  assert.equal(descriptor.sourceRecordId, "runtime-record:entity:1");
  assert.equal(descriptor.sourceRecordType, "entity.reference");
  assert.equal(descriptor.assetRoleFinalized, false);
  assert.equal(descriptor.assetLoadUrl, null);
  assert.equal(descriptor.rendererInstruction, null);
  assert.equal(descriptor.containsConcreteGameContent, false);
  assert.equal(planNode.finalAssetRole, null);
  assert.equal(planNode.rendererInstruction, null);
  assert.equal(planNode.concretePayload, null);
});

test("runtime scene assembly validation rejects unsafe routes, draft data, asset loads and rendering", () => {
  const unsafeState = createRuntimeSceneAssemblyState({
    projectionRoutes: ["/editor/runtime-projection/records"],
    safetyFlags: createRuntimeSceneAssemblySafetyFlags({
      usesEditorAdminRoutes: true,
      usesEditorDraftData: true,
      loadsAssets: true,
      assetLoadUrls: true,
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
    assetLoadUrls: ["/assets/characters/forbidden.glb"],
    finalAssetRoleIndicators: ["final-character-role"],
    concreteContentIndicators: ["npc-payload"],
    hardcodedRuntimeValueIndicators: ["camera-position"],
    rendererDrawCallIndicators: ["draw-call"]
  });
  const validation = validateRuntimeSceneAssemblyState(unsafeState);

  assert.equal(validation.valid, false);
  assert.equal(validation.issues.some((issue) => issue.gate === "runtime-projection-records-only"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-editor-admin-routes"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-editor-draft-data"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-asset-loads"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-final-asset-role-mapping"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-concrete-content"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-hardcoded-runtime-values"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-renderer-draw-calls"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-gameplay-audio"), true);
  assert.equal(validateRuntimeSceneAssemblyRoutes(["/runtime/projection/status"]).length, 0);
  assert.equal(validateRuntimeSceneAssemblyRoutes(["/assets/world.glb"]).some((issue) => issue.gate === "no-asset-loads"), true);
});

test("game shell renders runtime scene assembly marker and empty scene plan", () => {
  const html = renderRuntimeClientShellHtml();
  const section = renderRuntimeSceneAssemblySection(createRuntimeSceneAssemblyShellState());

  for (const output of [html, section]) {
    assert.match(output, /data-runtime-scene-assembly="phase-14"/);
    assert.match(output, /data-runtime-empty-scene-plan/);
    assert.match(output, /Empty scene plan/);
    assert.doesNotMatch(output, /\/editor\//);
    assert.doesNotMatch(output, /\/auth\/editor/);
    assert.doesNotMatch(output, /\/assets\//);
    assert.doesNotMatch(output, /\.glb|\.gltf|\.mp3|\.wav|\.ogg/i);
  }

  assert.doesNotMatch(section, /NPC|quest|economy|loot/i);
  assert.doesNotMatch(html, /NPC|economy|loot/i);
  assert.doesNotMatch(html, FORBIDDEN_CONCRETE_QUEST_CONTENT_PATTERN);
});

test("runtime scene assembly client contract stays read-only, metadata-only and contentless", () => {
  assert.deepEqual(runtimeSceneAssemblyClientContract.projectionRoutes, RUNTIME_CLIENT_PROJECTION_READ_ROUTES);
  assert.equal(runtimeSceneAssemblyClientContract.method, "GET");
  assert.equal(runtimeSceneAssemblyClientContract.credentials, "omit");
  assert.equal(runtimeSceneAssemblyClientContract.consumesRuntimeProjectionRecords, true);
  assert.equal(runtimeSceneAssemblyClientContract.producesScenePlan, true);
  assert.equal(runtimeSceneAssemblyClientContract.loadsAssets, false);
  assert.equal(runtimeSceneAssemblyClientContract.resolvesFinalAssetRoles, false);
  assert.equal(runtimeSceneAssemblyClientContract.rendersScene, false);
  assert.equal(runtimeSceneAssemblyClientContract.rendererDrawCalls, false);
  assert.equal(runtimeSceneAssemblyClientContract.implementsGameplay, false);
  assert.equal(runtimeSceneAssemblyClientContract.implementsMovement, false);
  assert.equal(runtimeSceneAssemblyClientContract.implementsCombat, false);
  assert.equal(runtimeSceneAssemblyClientContract.implementsAudioPlayback, false);
  assert.equal(runtimeSceneAssemblyClientContract.hardcodesWorld, false);
  assert.equal(runtimeSceneAssemblyClientContract.hardcodesCamera, false);
  assert.equal(runtimeSceneAssemblyClientContract.hardcodesLighting, false);
  assert.equal(runtimeSceneAssemblyClientContract.hardcodesHud, false);
  assert.equal(runtimeSceneAssemblyClientContract.hardcodesMinimap, false);
  assert.equal(runtimeSceneAssemblyClientContract.hardcodesContent, false);
  assert.equal(runtimeSceneAssemblyClientContract.mutatesAssets, false);
  assert.equal(runtimeSceneAssemblyClientContract.usesEditorDraftData, false);
  assert.equal(runtimeSceneAssemblyClientContract.usesEditorAdminRoutes, false);
});

test("game web routes expose phase 14 scene assembly without asset, role or content payload", () => {
  return (async () => {
    for (const path of ["/", "/game", "/game/"]) {
      const response = await requestGame("GET", path);

      assert.equal(response.statusCode, 200);
      assert.match(response.body, /data-runtime-client-shell="phase-12"/);
      assert.match(response.body, /data-runtime-render-surface="phase-13"/);
      assert.match(response.body, /data-runtime-scene-assembly="phase-14"/);
      assert.match(response.body, /data-runtime-empty-scene-plan/);
      assert.doesNotMatch(response.body, /\/assets\//);
      assert.doesNotMatch(response.body, /\.glb|\.gltf|\.mp3|\.wav|\.ogg/i);
    }

    const shellJson = await requestGame("GET", "/game/shell.json");
    assert.equal(shellJson.statusCode, 200);
    assert.match(shellJson.body, /"phase":"phase-14"/);
    assert.match(shellJson.body, /"loadsAssets":false/);
    assert.match(shellJson.body, /"resolvesFinalAssetRoles":false/);
    assert.match(shellJson.body, /"rendersScene":false/);
    assert.match(shellJson.body, /"implementsGameplay":false/);
    assert.doesNotMatch(shellJson.body, /\/editor\//);
    assert.doesNotMatch(shellJson.body, /\/assets\//);

    const health = await requestGame("GET", "/health/game");
    assert.equal(health.statusCode, 200);
    assert.match(health.body, /"runtimeSceneAssembly":"phase-14"/);
    assert.match(health.body, /"consumesRuntimeProjectionRecords":true/);
    assert.match(health.body, /"producesScenePlan":true/);
    assert.match(health.body, /"loadsAssets":false/);
    assert.match(health.body, /"rendersScene":false/);
    assert.match(health.body, /"implementsAudioPlayback":false/);
  })();
});

test("runtime scene assembly source does not build renderer, asset loading, role mapping or gameplay", () => {
  const sceneSources = [
    "apps/game-web/src/runtime-scene-assembly.ts",
    "apps/game-web/src/runtime-client-shell.ts",
    "apps/game-web/src/http-server.ts",
    "packages/schemas/src/runtime-scene-assembly.ts",
    "packages/schemas/src/runtime-scene-assembly-validation.ts",
    "packages/node-types/src/runtime-scene-assembly-nodes.ts"
  ].map((file) => readFileSync(file, "utf8")).join("\n");

  assert.doesNotMatch(sceneSources, /createRendererRuntime|GLTFLoader|loadGLB|new Audio\(|\.play\(/);
  assert.doesNotMatch(sceneSources, /requestAnimationFrame|THREE\.|new Scene|new Mesh|drawImage|fillRect|stroke\(/);
  assert.doesNotMatch(sceneSources, /fetch\(["']\/assets|src\s*=\s*["']\/assets/);
  assert.doesNotMatch(sceneSources, /cameraPosition|cameraTarget|fieldOfView|ambientLight|directionalLight|hudLayout|minimapSize|audioVolume/);
});

test("browser smoke checks runtime scene assembly marker, empty scene plan and asset silence", () => {
  const smoke = readFileSync("tests/smoke/browser-smoke.mjs", "utf8");

  assert.match(smoke, /data-runtime-scene-assembly/);
  assert.match(smoke, /tryRuntimeSceneAssemblySmoke/);
  assert.match(smoke, /data-runtime-empty-scene-plan/);
  assert.match(smoke, /scene assembly:/);
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
