import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  NODE_VALUE_SOCKET_TYPES,
  RUNTIME_GAME_CORE_LIFECYCLE_STATES,
  RUNTIME_GAME_CORE_MARKER,
  SCHEMA_PACKAGE_SCOPE,
  createRuntimeAssetReferencePlanningState,
  createRuntimeGameCoreSafetyFlags,
  createRuntimeGameCoreState,
  createRuntimeSceneAssemblyState,
  validateRuntimeGameCoreState
} from "../packages/schemas/src/index.ts";
import { getCoreGraphNodeTypes } from "../packages/node-types/src/index.ts";
import {
  createRuntimeGameCoreShellState,
  renderRuntimeGameCoreSection,
  runtimeGameCoreClientContract
} from "../apps/game-web/src/runtime-game-core.ts";
import { renderRuntimeClientShellHtml } from "../apps/game-web/src/runtime-client-shell.ts";
import { handleGameRequest } from "../apps/game-web/src/http-server.ts";

const nodeTypes = new Set(getCoreGraphNodeTypes().map((node) => node.type));

test("Fase 17 schema package exports runtime game core contracts", () => {
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("runtime-game-core"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("runtime-game-core-validation"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("runtime-game-renderer"), false);
  assert.deepEqual([...RUNTIME_GAME_CORE_LIFECYCLE_STATES], ["booting", "blocked", "ready", "error"]);
});

test("Fase 17 runtime game sockets and node contracts are registered", () => {
  for (const socketType of [
    "runtime.game.source.reference",
    "runtime.game.status.reference",
    "runtime.game.boot.reference",
    "runtime.game.session.reference",
    "runtime.game.input.reference",
    "runtime.game.save-state.reference",
    "runtime.game.diagnostics.reference",
    "runtime.game.safety.reference"
  ]) {
    assert.equal(NODE_VALUE_SOCKET_TYPES.includes(socketType), true, `${socketType} should exist`);
  }

  for (const nodeType of [
    "gk.runtimeGameCore.source",
    "gk.runtimeGameCore.boot",
    "gk.runtimeGameCore.playerSession",
    "gk.runtimeGameCore.inputAdapter",
    "gk.runtimeGameCore.saveState",
    "gk.runtimeGameCore.diagnostics"
  ]) {
    assert.equal(nodeTypes.has(nodeType), true, `${nodeType} should be registered`);
  }

  const runtimeGameNodes = getCoreGraphNodeTypes().filter((node) => node.type.startsWith("gk.runtimeGameCore."));
  assert.equal(runtimeGameNodes.length, 6);
  assert.equal(runtimeGameNodes.every((node) => node.scope === "runtime-consumer"), true);
  assert.equal(runtimeGameNodes.every((node) => node.createsConcreteGameContent === false), true);
  assert.equal(runtimeGameNodes.every((node) => node.validate.validate({ usesEditorDraftData: true }).length > 0), true);
  assert.equal(runtimeGameNodes.every((node) => node.validate.validate({ loadsAssets: true }).length > 0), true);
  assert.equal(runtimeGameNodes.every((node) => node.validate.validate({ resolvesFinalAssetRoles: true }).length > 0), true);
  assert.equal(runtimeGameNodes.every((node) => node.validate.validate({ rendererDrawCalls: true }).length > 0), true);
  assert.equal(runtimeGameNodes.every((node) => node.validate.validate({ implementsMovement: true }).length > 0), true);
});

test("runtime game core blocks safely when published data is missing", () => {
  const state = createRuntimeGameCoreState();
  const validation = validateRuntimeGameCoreState(state);

  assert.equal(validation.valid, true);
  assert.equal(state.phase, RUNTIME_GAME_CORE_MARKER);
  assert.equal(state.status.lifecycle, "blocked");
  assert.equal(state.status.bootableFromPublishedData, false);
  assert.equal(state.status.blockedByMissingPublishedData, true);
  assert.equal(state.source.emptyPublishedReadModel, true);
  assert.equal(state.worldBootstrap.status, "blocked");
  assert.equal(state.diagnostics.length, 3);
  assert.equal(state.safetyFlags.consumesPublishedReadModel, true);
  assert.equal(state.safetyFlags.consumesRuntimeAssetReferencePlan, true);
  assert.equal(state.safetyFlags.bootsRuntimeGame, true);
  assert.equal(state.safetyFlags.usesEditorAdminRoutes, false);
  assert.equal(state.safetyFlags.usesEditorDraftData, false);
  assert.equal(state.safetyFlags.loadsAssets, false);
  assert.equal(state.safetyFlags.fetchesAssetBytes, false);
  assert.equal(state.safetyFlags.resolvesFinalAssetRoles, false);
  assert.equal(state.safetyFlags.rendersConcreteWorld, false);
  assert.equal(state.safetyFlags.implementsMovement, false);
  assert.equal(state.safetyFlags.implementsCombat, false);
  assert.equal(state.safetyFlags.implementsAudioPlayback, false);
  assert.equal(state.safetyFlags.hardcodesContent, false);
  assert.equal(state.safetyFlags.mutatesAssets, false);
});

test("runtime game core becomes ready from published read model and metadata asset plan", () => {
  const readModel = createReadModelWithWorldRecord();
  const sceneState = createRuntimeSceneAssemblyState({ projectionReadModel: readModel });
  const assetReferencePlanning = createRuntimeAssetReferencePlanningState({ scenePlan: sceneState.plan });
  const state = createRuntimeGameCoreState({
    runtimeProjectionReadModel: readModel,
    assetReferencePlanning
  });
  const validation = validateRuntimeGameCoreState(state);

  assert.equal(validation.valid, true);
  assert.equal(state.status.lifecycle, "ready");
  assert.equal(state.status.bootableFromPublishedData, true);
  assert.equal(state.status.blockedByMissingPublishedData, false);
  assert.equal(state.diagnostics.length, 0);
  assert.equal(state.source.projectionManifestId, "runtime-manifest:17");
  assert.equal(state.assetReferenceResolver.loadsAssets, false);
  assert.equal(state.assetReferenceResolver.fetchesAssetBytes, false);
  assert.equal(state.assetReferenceResolver.resolvesFinalAssetRoles, false);
  assert.equal(state.worldBootstrap.status, "ready");
  assert.equal(state.playerSession.sourceManifestId, "runtime-manifest:17");
  assert.equal(state.inputAdapter.consumesInputIntents, true);
  assert.equal(state.inputAdapter.bindsMovement, false);
  assert.equal(state.saveLoad.status, "contract-ready");
  assert.equal(state.saveLoad.savesRuntimeStateOnly, true);
  assert.equal(state.saveLoad.mutatesPublishedData, false);
});

test("runtime game core validation rejects unsafe flags and indicators", () => {
  const unsafeState = createRuntimeGameCoreState({
    safetyFlags: createRuntimeGameCoreSafetyFlags({
      consumesPublishedReadModel: false,
      usesEditorAdminRoutes: true,
      usesEditorDraftData: true,
      readsDraftData: true,
      loadsAssets: true,
      fetchesAssetBytes: true,
      resolvesFinalAssetRoles: true,
      rendersConcreteWorld: true,
      rendererDrawCalls: true,
      implementsMovement: true,
      implementsCombat: true,
      implementsAudioPlayback: true,
      hardcodesWorld: true,
      hardcodesCamera: true,
      hardcodesLighting: true,
      hardcodesHud: true,
      hardcodesMinimap: true,
      hardcodesContent: true,
      mutatesAssets: true,
      mutatesPublishedData: true,
      hasPlayerSessionBootstrap: false,
      hasInputAdapter: false,
      hasSaveLoadBasis: false,
      persistsConcreteContent: true
    }),
    editorRouteIndicators: ["/editor/runtime"],
    draftDataIndicators: ["draft-runtime"],
    assetLoadUrls: ["/assets/world.glb"],
    assetByteFetchUrls: ["/assets/audio.mp3"],
    hardcodedRuntimeValueIndicators: ["camera-position"],
    concreteContentIndicators: ["world-payload"],
    runtimeFeatureIndicators: ["movement-system"]
  });
  const validation = validateRuntimeGameCoreState(unsafeState);

  assert.equal(validation.valid, false);
  for (const gate of [
    "published-read-model-only",
    "no-editor-admin-routes",
    "no-editor-draft-data",
    "no-hidden-asset-loads",
    "runtime-asset-reference-plan-only",
    "no-hardcoded-content",
    "no-quest-combat-economy-multiplayer",
    "player-session-bootstrap",
    "input-adapter-boundary",
    "save-load-basis"
  ]) {
    assert.equal(validation.issues.some((issue) => issue.gate === gate), true, `${gate} should fail`);
  }
});

test("game shell renders runtime game core marker without editor, asset byte or content payload", () => {
  const html = renderRuntimeClientShellHtml();
  const section = renderRuntimeGameCoreSection(createRuntimeGameCoreShellState());

  for (const output of [html, section]) {
    assert.match(output, /data-runtime-game-core="phase-17"/);
    assert.match(output, /data-runtime-game-lifecycle="blocked"/);
    assert.match(output, /data-runtime-game-uses-editor-routes="false"/);
    assert.match(output, /data-runtime-game-uses-draft-data="false"/);
    assert.match(output, /data-runtime-game-loads-assets="false"/);
    assert.match(output, /data-runtime-game-fetches-bytes="false"/);
    assert.match(output, /data-runtime-game-hardcodes-content="false"/);
    assert.match(output, /data-runtime-game-save-load="contract-ready"/);
    assert.doesNotMatch(output, /\/editor\//);
    assert.doesNotMatch(output, /\/auth\/editor/);
    assert.doesNotMatch(output, /\/assets\//);
    assert.doesNotMatch(output, /\.glb|\.gltf|\.mp3|\.wav|\.ogg/i);
  }

  assert.doesNotMatch(section, /NPC|quest|economy|loot/i);
  assert.doesNotMatch(html, /NPC|economy|loot/i);
  assert.doesNotMatch(html, /Quest 00|Humble Ash Staff|Spark|Empathy Casting|Mentor failure|The Candle/i);
});

test("runtime game core client contract is read-model only and contentless", () => {
  assert.equal(runtimeGameCoreClientContract.phase, "phase-17");
  assert.equal(runtimeGameCoreClientContract.method, "published-read-model");
  assert.equal(runtimeGameCoreClientContract.credentials, "omit");
  assert.equal(runtimeGameCoreClientContract.consumesPublishedReadModel, true);
  assert.equal(runtimeGameCoreClientContract.consumesRuntimeAssetReferencePlan, true);
  assert.equal(runtimeGameCoreClientContract.bootsRuntimeGame, true);
  assert.equal(runtimeGameCoreClientContract.usesEditorAdminRoutes, false);
  assert.equal(runtimeGameCoreClientContract.usesEditorDraftData, false);
  assert.equal(runtimeGameCoreClientContract.loadsAssets, false);
  assert.equal(runtimeGameCoreClientContract.fetchesAssetBytes, false);
  assert.equal(runtimeGameCoreClientContract.resolvesFinalAssetRoles, false);
  assert.equal(runtimeGameCoreClientContract.rendersConcreteWorld, false);
  assert.equal(runtimeGameCoreClientContract.rendererDrawCalls, false);
  assert.equal(runtimeGameCoreClientContract.implementsMovement, false);
  assert.equal(runtimeGameCoreClientContract.implementsCombat, false);
  assert.equal(runtimeGameCoreClientContract.implementsAudioPlayback, false);
  assert.equal(runtimeGameCoreClientContract.hardcodesContent, false);
  assert.equal(runtimeGameCoreClientContract.mutatesAssets, false);
  assert.equal(runtimeGameCoreClientContract.mutatesPublishedData, false);
});

test("game web routes expose phase 17 runtime game core without editor or asset routes", () => {
  return (async () => {
    for (const path of ["/", "/game", "/game/"]) {
      const response = await requestGame("GET", path);

      assert.equal(response.statusCode, 200);
      assert.match(response.body, /data-runtime-client-shell="phase-12"/);
      assert.match(response.body, /data-runtime-game-core="phase-17"/);
      assert.match(response.body, /data-runtime-game-uses-editor-routes="false"/);
      assert.match(response.body, /data-runtime-game-uses-draft-data="false"/);
      assert.match(response.body, /data-runtime-game-loads-assets="false"/);
      assert.match(response.body, /data-runtime-game-fetches-bytes="false"/);
      assert.doesNotMatch(response.body, /\/editor\//);
      assert.doesNotMatch(response.body, /\/assets\//);
      assert.doesNotMatch(response.body, /\.glb|\.gltf|\.mp3|\.wav|\.ogg/i);
    }

    const shellJson = await requestGame("GET", "/game/shell.json");
    assert.equal(shellJson.statusCode, 200);
    assert.match(shellJson.body, /"runtimeGameCore"/);
    assert.match(shellJson.body, /"runtimeQuestSlice"/);
    assert.match(shellJson.body, /"phase":"phase-17"/);
    assert.match(shellJson.body, /"bootsRuntimeGame":true/);
    assert.match(shellJson.body, /"consumesPublishedReadModel":true/);
    assert.match(shellJson.body, /"consumesRuntimeAssetReferencePlan":true/);
    assert.match(shellJson.body, /"usesEditorAdminRoutes":false/);
    assert.match(shellJson.body, /"usesEditorDraftData":false/);
    assert.match(shellJson.body, /"loadsAssets":false/);
    assert.match(shellJson.body, /"fetchesAssetBytes":false/);
    assert.doesNotMatch(shellJson.body, /\/editor\//);
    assert.doesNotMatch(shellJson.body, /\/assets\//);

    const health = await requestGame("GET", "/health/game");
    assert.equal(health.statusCode, 200);
    assert.match(health.body, /"runtimeGameCore":"phase-17"/);
    assert.match(health.body, /"runtimeQuestSlice":"phase-18"/);
    assert.match(health.body, /"bootsRuntimeGame":true/);
    assert.match(health.body, /"consumesPublishedReadModel":true/);
    assert.match(health.body, /"consumesRuntimeAssetReferencePlan":true/);
    assert.match(health.body, /"blockedByMissingPublishedData":true/);
    assert.match(health.body, /"loadsAssets":false/);
    assert.match(health.body, /"fetchesAssetBytes":false/);
    assert.match(health.body, /"rendererDrawCalls":false/);
  })();
});

test("runtime game core source does not build renderer, byte loader or later runtime systems", () => {
  const runtimeGameSources = [
    "apps/game-web/src/runtime-game-core.ts",
    "apps/game-web/src/runtime-client-shell.ts",
    "apps/game-web/src/http-server.ts",
    "packages/schemas/src/runtime-game-core.ts",
    "packages/schemas/src/runtime-game-core-validation.ts",
    "packages/node-types/src/runtime-game-core-nodes.ts"
  ].map((file) => readFileSync(file, "utf8")).join("\n");

  assert.doesNotMatch(runtimeGameSources, /GLTFLoader|loadGLB|new Audio\(|\.play\(/);
  assert.doesNotMatch(runtimeGameSources, /requestAnimationFrame|THREE\.|new Scene|new Mesh|drawImage|fillRect|stroke\(/);
  assert.doesNotMatch(runtimeGameSources, /fetch\(["']\/assets|src\s*=\s*["']\/assets/);
  assert.doesNotMatch(runtimeGameSources, /cameraPosition|cameraTarget|fieldOfView|ambientLight|directionalLight|hudLayout|minimapSize|audioVolume/);
  assert.doesNotMatch(runtimeGameSources, /assetLibraryId:\s*["'][^"']+/);
});

function createReadModelWithWorldRecord() {
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
    recordId: "runtime-record:world:17",
    recordType: "world.reference",
    sourceId: "publish-snapshot:17",
    snapshotId: "snapshot:17",
    dataReference: { source: "publish-snapshot-metadata", id: "world-reference:17" },
    uiDisplay: null,
    safetyFlags,
    runtimeReadable: true,
    rendererInstruction: null
  };

  return {
    status: "runtime-readable",
    manifest: {
      manifestId: "runtime-manifest:17",
      status: "runtime-readable",
      source: {
        sourceId: "publish-snapshot:17",
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
      sourceSnapshotId: "snapshot:17",
      createdAt: "2026-06-14T00:00:00.000Z",
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
