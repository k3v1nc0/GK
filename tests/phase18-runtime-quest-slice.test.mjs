import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  NODE_VALUE_SOCKET_TYPES,
  RUNTIME_PROJECTION_RECORD_TYPES,
  RUNTIME_QUEST_SLICE_LIFECYCLE_STATES,
  RUNTIME_QUEST_SLICE_MARKER,
  RUNTIME_QUEST_SLICE_RECORD_TYPES,
  SCHEMA_PACKAGE_SCOPE,
  createRuntimeQuestSliceSafetyFlags,
  createRuntimeQuestSliceState,
  validateRuntimeQuestSliceState
} from "../packages/schemas/src/index.ts";
import { getCoreGraphNodeTypes } from "../packages/node-types/src/index.ts";
import {
  createRuntimeQuestSliceShellState,
  renderRuntimeQuestSliceSection,
  runtimeQuestSliceClientContract
} from "../apps/game-web/src/runtime-quest-slice.ts";
import { renderRuntimeClientShellHtml } from "../apps/game-web/src/runtime-client-shell.ts";
import { handleGameRequest } from "../apps/game-web/src/http-server.ts";

const FORBIDDEN_FIXTURE_CONTENT_PATTERN = /Fixture Quest Title|Fixture Reward Name|Fixture Unlock Name|Fixture Dialogue Line/i;
const questSliceNodeTypes = new Set(getCoreGraphNodeTypes().map((node) => node.type));

test("Fase 18 schema package exports generic runtime quest slice contracts", () => {
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("runtime-quest-slice"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("runtime-quest-slice-validation"), true);
  assert.deepEqual([...RUNTIME_QUEST_SLICE_LIFECYCLE_STATES], ["blocked", "ready", "error"]);
  assert.equal(RUNTIME_QUEST_SLICE_MARKER, "phase-18");

  for (const recordType of RUNTIME_QUEST_SLICE_RECORD_TYPES) {
    assert.equal(RUNTIME_PROJECTION_RECORD_TYPES.includes(recordType), true, `${recordType} should be publishable as a runtime read-model record`);
  }
});

test("Fase 18 runtime quest sockets and node contracts are registered", () => {
  for (const socketType of [
    "runtime.quest.slice.reference",
    "runtime.quest.dialogue.reference",
    "runtime.quest.objective.reference",
    "runtime.quest.interactable.reference",
    "runtime.quest.reward.reference",
    "runtime.quest.unlock.reference",
    "runtime.quest.checkpoint.reference",
    "runtime.quest.asset-role.reference",
    "runtime.quest.state.reference",
    "runtime.quest.diagnostics.reference",
    "runtime.quest.safety.reference"
  ]) {
    assert.equal(NODE_VALUE_SOCKET_TYPES.includes(socketType), true, `${socketType} should exist`);
  }

  for (const nodeType of [
    "gk.runtimeQuestSlice.source",
    "gk.runtimeQuestSlice.questState",
    "gk.runtimeQuestSlice.dialogueExecutor",
    "gk.runtimeQuestSlice.objectiveEvaluator",
    "gk.runtimeQuestSlice.rewardApplicator",
    "gk.runtimeQuestSlice.checkpointFlow",
    "gk.runtimeQuestSlice.assetRoleBlockers"
  ]) {
    assert.equal(questSliceNodeTypes.has(nodeType), true, `${nodeType} should be registered`);
  }

  const runtimeQuestNodes = getCoreGraphNodeTypes().filter((node) => node.type.startsWith("gk.runtimeQuestSlice."));
  assert.equal(runtimeQuestNodes.length, 7);
  assert.equal(runtimeQuestNodes.every((node) => node.scope === "runtime-consumer"), true);
  assert.equal(runtimeQuestNodes.every((node) => node.createsConcreteGameContent === false), true);
  assert.equal(runtimeQuestNodes.every((node) => node.validate.validate({ usesEditorDraftData: true }).length > 0), true);
  assert.equal(runtimeQuestNodes.every((node) => node.validate.validate({ hardcodesQuestContent: true }).length > 0), true);
  assert.equal(runtimeQuestNodes.every((node) => node.validate.validate({ loadsAssets: true }).length > 0), true);
  assert.equal(runtimeQuestNodes.every((node) => node.validate.validate({ resolvesFinalAssetRoles: true }).length > 0), true);
  assert.equal(runtimeQuestNodes.every((node) => node.validate.validate({ directUiMutation: true }).length > 0), true);
});

test("runtime quest slice blocks safely when published quest records are missing", () => {
  const state = createRuntimeQuestSliceState();
  const validation = validateRuntimeQuestSliceState(state);

  assert.equal(validation.valid, true);
  assert.equal(state.phase, RUNTIME_QUEST_SLICE_MARKER);
  assert.equal(state.status.lifecycle, "blocked");
  assert.equal(state.status.blockedByMissingPublishedData, true);
  assert.equal(state.status.blockedByUnresolvedAssetRoles, true);
  assert.equal(state.status.nonVisualBlockedSlice, true);
  assert.equal(state.source.emptyPublishedReadModel, true);
  assert.equal(state.source.missingRequiredRecordTypes.length, RUNTIME_QUEST_SLICE_RECORD_TYPES.length);
  assert.equal(state.assetRoleBlockers.length, 1);
  assert.equal(state.assetRoleBlockers[0].status, "unresolved");
  assert.equal(state.assetRoleBlockers[0].blocksRuntimeCompletion, true);
  assert.equal(state.questStateMachine.status, "blocked");
  assert.equal(state.dialogueExecutor.status, "blocked");
  assert.equal(state.objectiveEvaluator.status, "blocked");
  assert.equal(state.rewardApplicator.status, "blocked");
  assert.equal(state.checkpointFlow.status, "blocked");
  assert.equal(state.saveLoad.status, "contract-ready");
  assert.equal(state.saveLoad.savesRuntimeStateOnly, true);
  assert.equal(state.safetyFlags.usesEditorAdminRoutes, false);
  assert.equal(state.safetyFlags.usesEditorDraftData, false);
  assert.equal(state.safetyFlags.hardcodesQuestContent, false);
  assert.equal(state.safetyFlags.loadsAssets, false);
  assert.equal(state.safetyFlags.fetchesAssetBytes, false);
  assert.equal(state.safetyFlags.resolvesFinalAssetRoles, false);
  assert.equal(state.safetyFlags.implementsCombat, false);
  assert.equal(state.safetyFlags.implementsEconomyRuntime, false);
});

test("runtime quest slice keeps explicit asset-role records visibly blocked until resolved", () => {
  const state = createRuntimeQuestSliceState({ runtimeProjectionReadModel: createReadModelWithQuestSliceRecords() });
  const validation = validateRuntimeQuestSliceState(state);

  assert.equal(validation.valid, true);
  assert.equal(state.status.lifecycle, "blocked");
  assert.equal(state.status.blockedByMissingPublishedData, false);
  assert.equal(state.status.blockedByUnresolvedAssetRoles, true);
  assert.equal(state.status.nonVisualBlockedSlice, true);
  assert.equal(state.source.projectionManifestId, "runtime-manifest:18");
  assert.equal(state.source.questRecordCount, 1);
  assert.equal(state.source.dialogueRecordCount, 1);
  assert.equal(state.source.objectiveRecordCount, 1);
  assert.equal(state.source.interactableRecordCount, 1);
  assert.equal(state.source.rewardRecordCount, 1);
  assert.equal(state.source.unlockRecordCount, 1);
  assert.equal(state.source.checkpointRecordCount, 1);
  assert.equal(state.source.assetRoleRecordCount, 1);
  assert.equal(state.source.missingRequiredRecordTypes.length, 0);
  assert.equal(state.assetRoleBlockers.length, 1);
  assert.equal(state.assetRoleBlockers[0].assetRoleId, "asset-role-reference:18");
  assert.equal(state.assetRoleBlockers[0].recordId, "runtime-record:asset-role:18");
  assert.equal(state.assetRoleBlockers[0].blocksVisualSlice, true);
  assert.equal(state.assetRoleBlockers[0].blocksRuntimeCompletion, true);
  assert.equal(state.diagnostics.some((diagnostic) => diagnostic.code === "unresolved_asset_roles"), true);
  assert.equal(state.questStateMachine.status, "ready");
  assert.equal(state.dialogueExecutor.status, "ready");
  assert.equal(state.objectiveEvaluator.status, "ready");
  assert.equal(state.rewardApplicator.status, "ready");
  assert.equal(state.checkpointFlow.status, "ready");
});

test("runtime quest slice can become ready only when asset-role blockers are explicitly resolved", () => {
  const state = createRuntimeQuestSliceState({
    runtimeProjectionReadModel: createReadModelWithQuestSliceRecords(),
    assetRoleBlockers: []
  });
  const validation = validateRuntimeQuestSliceState(state);

  assert.equal(validation.valid, true);
  assert.equal(state.status.lifecycle, "ready");
  assert.equal(state.status.blockedByMissingPublishedData, false);
  assert.equal(state.status.blockedByUnresolvedAssetRoles, false);
  assert.equal(state.status.nonVisualBlockedSlice, false);
  assert.equal(state.diagnostics.length, 0);
});

test("runtime quest slice validation rejects unsafe flags and indicators", () => {
  const unsafeState = createRuntimeQuestSliceState({
    runtimeProjectionReadModel: createReadModelWithQuestSliceRecords(),
    assetRoleBlockers: [],
    safetyFlags: createRuntimeQuestSliceSafetyFlags({
      consumesPublishedReadModel: false,
      consumesRuntimeProjectionReadModel: false,
      usesEditorAdminRoutes: true,
      usesEditorDraftData: true,
      readsDraftData: true,
      hardcodesQuestContent: true,
      containsConcreteQuestContent: true,
      mutatesPublishedData: true,
      loadsAssets: true,
      fetchesAssetBytes: true,
      resolvesFinalAssetRoles: true,
      supportsNonVisualBlockedSlice: false,
      exposesUnresolvedAssetRoleBlockers: false,
      implementsQuestRuntime: false,
      implementsDialogueRuntime: false,
      implementsObjectiveRuntime: false,
      implementsInteractableRuntime: false,
      implementsRewardRuntime: false,
      implementsCheckpointRuntime: false,
      implementsSaveLoadState: false,
      implementsCombat: true,
      implementsEconomyRuntime: true,
      implementsMovement: true,
      implementsMultiplayer: true,
      implementsAudioPlayback: true
    }),
    editorRouteIndicators: ["/editor/quest"],
    draftDataIndicators: ["draft-quest"],
    hardcodedQuestContentIndicators: ["fixture-quest-title"],
    directUiMutationIndicators: ["ui-complete"],
    assetLoadUrls: ["/assets/quest.glb"],
    assetByteFetchUrls: ["/assets/dialogue.mp3"],
    combatEconomyMovementIndicators: ["combat-system"]
  });
  const validation = validateRuntimeQuestSliceState(unsafeState);

  assert.equal(validation.valid, false);
  assert.equal(validation.issues.some((issue) => issue.gate === "published-quest-read-model-only"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-editor-admin-routes"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-editor-draft-data"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-hardcoded-quest-content"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "quest-state-machine"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "dialogue-executor"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "objective-executor"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "reward-executor"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "checkpoint-state"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "asset-role-blockers"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "save-load-state"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "safety-flags"), true);
});

test("game shell renders runtime quest slice marker without editor, assets or fixture content", () => {
  const outputs = [
    renderRuntimeQuestSliceSection(createRuntimeQuestSliceShellState()),
    renderRuntimeClientShellHtml()
  ];

  for (const output of outputs) {
    assert.match(output, /data-runtime-quest-slice="phase-18"/);
    assert.match(output, /data-runtime-quest-lifecycle="blocked"/);
    assert.match(output, /data-runtime-quest-blocked-missing-data="true"/);
    assert.match(output, /data-runtime-quest-blocked-asset-roles="true"/);
    assert.match(output, /data-runtime-quest-non-visual-blocked="true"/);
    assert.match(output, /data-runtime-quest-uses-editor-routes="false"/);
    assert.match(output, /data-runtime-quest-uses-draft-data="false"/);
    assert.match(output, /data-runtime-quest-loads-assets="false"/);
    assert.match(output, /data-runtime-quest-fetches-bytes="false"/);
    assert.match(output, /data-runtime-quest-hardcodes-content="false"/);
    assert.doesNotMatch(output, /\/editor\//);
    assert.doesNotMatch(output, /\/auth\/editor/);
    assert.doesNotMatch(output, /\/assets\//);
    assert.doesNotMatch(output, /\.glb|\.gltf|\.mp3|\.wav|\.ogg/i);
    assert.doesNotMatch(output, FORBIDDEN_FIXTURE_CONTENT_PATTERN);
  }
});

test("runtime quest slice client contract is published read-model only", () => {
  assert.equal(runtimeQuestSliceClientContract.phase, "phase-18");
  assert.equal(runtimeQuestSliceClientContract.method, "published-read-model");
  assert.equal(runtimeQuestSliceClientContract.credentials, "omit");
  assert.equal(runtimeQuestSliceClientContract.consumesPublishedReadModel, true);
  assert.equal(runtimeQuestSliceClientContract.usesEditorAdminRoutes, false);
  assert.equal(runtimeQuestSliceClientContract.usesEditorDraftData, false);
  assert.equal(runtimeQuestSliceClientContract.hardcodesQuestContent, false);
  assert.equal(runtimeQuestSliceClientContract.mutatesPublishedData, false);
  assert.equal(runtimeQuestSliceClientContract.loadsAssets, false);
  assert.equal(runtimeQuestSliceClientContract.fetchesAssetBytes, false);
  assert.equal(runtimeQuestSliceClientContract.resolvesFinalAssetRoles, false);
  assert.equal(runtimeQuestSliceClientContract.supportsNonVisualBlockedSlice, true);
  assert.equal(runtimeQuestSliceClientContract.exposesUnresolvedAssetRoleBlockers, true);
  assert.equal(runtimeQuestSliceClientContract.implementsQuestRuntime, true);
  assert.equal(runtimeQuestSliceClientContract.implementsDialogueRuntime, true);
  assert.equal(runtimeQuestSliceClientContract.implementsObjectiveRuntime, true);
  assert.equal(runtimeQuestSliceClientContract.implementsRewardRuntime, true);
  assert.equal(runtimeQuestSliceClientContract.implementsCheckpointRuntime, true);
  assert.equal(runtimeQuestSliceClientContract.implementsCombat, false);
  assert.equal(runtimeQuestSliceClientContract.implementsEconomyRuntime, false);
});

test("game web routes expose phase 18 runtime quest slice without editor or asset routes", () => {
  return (async () => {
    for (const path of ["/", "/game", "/game/"]) {
      const response = await requestGame("GET", path);

      assert.equal(response.statusCode, 200);
      assert.match(response.body, /data-runtime-client-shell="phase-12"/);
      assert.match(response.body, /data-runtime-quest-slice="phase-18"/);
      assert.match(response.body, /data-runtime-quest-uses-editor-routes="false"/);
      assert.match(response.body, /data-runtime-quest-uses-draft-data="false"/);
      assert.match(response.body, /data-runtime-quest-loads-assets="false"/);
      assert.match(response.body, /data-runtime-quest-fetches-bytes="false"/);
      assert.match(response.body, /data-runtime-quest-hardcodes-content="false"/);
      assert.doesNotMatch(response.body, /\/editor\//);
      assert.doesNotMatch(response.body, /\/assets\//);
      assert.doesNotMatch(response.body, /\.glb|\.gltf|\.mp3|\.wav|\.ogg/i);
      assert.doesNotMatch(response.body, FORBIDDEN_FIXTURE_CONTENT_PATTERN);
    }

    const shellJson = await requestGame("GET", "/game/shell.json");
    assert.equal(shellJson.statusCode, 200);
    assert.match(shellJson.body, /"runtimeQuestSlice"/);
    assert.match(shellJson.body, /"phase":"phase-18"/);
    assert.match(shellJson.body, /"implementsQuestRuntime":true/);
    assert.match(shellJson.body, /"implementsDialogueRuntime":true/);
    assert.match(shellJson.body, /"implementsObjectiveRuntime":true/);
    assert.match(shellJson.body, /"implementsRewardRuntime":true/);
    assert.match(shellJson.body, /"implementsCheckpointRuntime":true/);
    assert.match(shellJson.body, /"usesEditorAdminRoutes":false/);
    assert.match(shellJson.body, /"usesEditorDraftData":false/);
    assert.match(shellJson.body, /"loadsAssets":false/);
    assert.match(shellJson.body, /"fetchesAssetBytes":false/);
    assert.doesNotMatch(shellJson.body, /\/editor\//);
    assert.doesNotMatch(shellJson.body, /\/assets\//);
    assert.doesNotMatch(shellJson.body, FORBIDDEN_FIXTURE_CONTENT_PATTERN);

    const health = await requestGame("GET", "/health/game");
    assert.equal(health.statusCode, 200);
    assert.match(health.body, /"runtimeQuestSlice":"phase-18"/);
    assert.match(health.body, /"implementsQuestRuntime":true/);
    assert.match(health.body, /"implementsDialogueRuntime":true/);
    assert.match(health.body, /"implementsObjectiveRuntime":true/);
    assert.match(health.body, /"implementsRewardRuntime":true/);
    assert.match(health.body, /"implementsCheckpointRuntime":true/);
    assert.match(health.body, /"supportsNonVisualBlockedSlice":true/);
    assert.match(health.body, /"blockedByUnresolvedAssetRoles":true/);
    assert.match(health.body, /"loadsAssets":false/);
    assert.match(health.body, /"fetchesAssetBytes":false/);
    assert.match(health.body, /"hardcodesQuestContent":false/);
  })();
});

test("runtime quest slice source does not hardcode fixture content or open later systems", () => {
  const runtimeQuestSources = [
    "apps/game-web/src/runtime-quest-slice.ts",
    "apps/game-web/src/runtime-client-shell.ts",
    "apps/game-web/src/http-server.ts",
    "packages/schemas/src/runtime-quest-slice.ts",
    "packages/schemas/src/runtime-quest-slice-validation.ts",
    "packages/node-types/src/runtime-quest-slice-nodes.ts"
  ].map((file) => readFileSync(file, "utf8")).join("\n");

  assert.doesNotMatch(runtimeQuestSources, FORBIDDEN_FIXTURE_CONTENT_PATTERN);
  assert.doesNotMatch(runtimeQuestSources, /GLTFLoader|loadGLB|new Audio\(|\.play\(/);
  assert.doesNotMatch(runtimeQuestSources, /requestAnimationFrame|THREE\.|new Scene|new Mesh|drawImage|fillRect|stroke\(/);
  assert.doesNotMatch(runtimeQuestSources, /fetch\(["']\/assets|src\s*=\s*["']\/assets/);
  assert.doesNotMatch(runtimeQuestSources, /combatSystem|economyRuntime|movementController|multiplayerSession/);
});

function createReadModelWithQuestSliceRecords() {
  const records = RUNTIME_QUEST_SLICE_RECORD_TYPES.map((recordType) => createRecord(recordType));
  const safetyFlags = createProjectionSafetyFlags();

  return {
    status: "runtime-readable",
    manifest: {
      manifestId: "runtime-manifest:18",
      status: "runtime-readable",
      source: {
        sourceId: "publish-snapshot:18",
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
      sourceSnapshotId: "snapshot:18",
      createdAt: "2026-06-14T00:00:00.000Z",
      recordCount: records.length,
      records,
      safetyFlags,
      runtimeReadable: true,
      rendererInstruction: null
    },
    records,
    emptyState: false,
    runtimeReadable: true,
    leaksEditorDraftData: false,
    containsConcreteGameContent: false,
    implementsRuntimeRenderer: false
  };
}

function createRecord(recordType) {
  const slug = recordType.replace(".reference", "").replace(/[^a-z0-9]+/g, "-");
  return {
    recordId: `runtime-record:${slug}:18`,
    recordType,
    sourceId: "publish-snapshot:18",
    snapshotId: "snapshot:18",
    dataReference: { source: "publish-snapshot-metadata", id: `${slug}-reference:18` },
    uiDisplay: null,
    safetyFlags: createProjectionSafetyFlags(),
    runtimeReadable: true,
    rendererInstruction: null
  };
}

function createProjectionSafetyFlags() {
  return {
    publishesRuntimeProjection: true,
    implementsRuntimeRenderer: false,
    mutatesAssets: false,
    containsConcreteGameContent: false,
    usesHardcodedContent: false,
    copiesAssetsToGit: false,
    assignsDefinitiveRuntimeRoles: false,
    leaksEditorDraftData: false
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
