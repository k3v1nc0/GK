import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  NODE_VALUE_SOCKET_TYPES,
  QUEST_AUTHORING_MARKER,
  QUEST_AUTHORING_NODE_KINDS,
  QUEST_AUTHORING_NODE_KIND_TO_RECORD_TYPE,
  RUNTIME_QUEST_SLICE_RECORD_TYPES,
  SCHEMA_PACKAGE_SCOPE,
  createQuestAuthoringDraft,
  createQuestAuthoringNodeRecord,
  createQuestAuthoringPublishContract,
  createQuestAuthoringRuntimeProjectionRecords,
  validateQuestAuthoringDraft,
  validateQuestAuthoringPublishContract,
  validateRuntimeProjectionRecord
} from "../packages/schemas/src/index.ts";
import { getCoreGraphNodeTypes } from "../packages/node-types/src/index.ts";

const FORBIDDEN_CONCRETE_QUEST_CONTENT_PATTERN = /Quest 00|Humble Ash Staff|Spark|Empathy Casting|Mentor failure|The Candle/i;
const nodeTypes = new Set(getCoreGraphNodeTypes().map((node) => node.type));

test("Fase 19 schema package exports quest authoring publish bridge contracts", () => {
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("quest-authoring"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("quest-authoring-validation"), true);
  assert.equal(QUEST_AUTHORING_MARKER, "phase-19");
  assert.deepEqual([...QUEST_AUTHORING_NODE_KINDS], [
    "quest",
    "dialogue",
    "objective",
    "interactable",
    "reward",
    "unlock",
    "checkpoint",
    "asset-role"
  ]);

  for (const nodeKind of QUEST_AUTHORING_NODE_KINDS) {
    assert.equal(
      RUNTIME_QUEST_SLICE_RECORD_TYPES.includes(QUEST_AUTHORING_NODE_KIND_TO_RECORD_TYPE[nodeKind]),
      true,
      `${nodeKind} should map to a runtime quest slice record type`
    );
  }
});

test("Fase 19 quest authoring sockets and node contracts are registered", () => {
  for (const socketType of [
    "quest.authoring.quest.reference",
    "quest.authoring.dialogue.reference",
    "quest.authoring.objective.reference",
    "quest.authoring.interactable.reference",
    "quest.authoring.reward.reference",
    "quest.authoring.unlock.reference",
    "quest.authoring.checkpoint.reference",
    "quest.authoring.asset-role.reference",
    "quest.authoring.publish-contract.reference"
  ]) {
    assert.equal(NODE_VALUE_SOCKET_TYPES.includes(socketType), true, `${socketType} should exist`);
  }

  for (const nodeType of [
    "gk.questAuthoring.quest",
    "gk.questAuthoring.dialogue",
    "gk.questAuthoring.objective",
    "gk.questAuthoring.interactable",
    "gk.questAuthoring.reward",
    "gk.questAuthoring.unlock",
    "gk.questAuthoring.checkpoint",
    "gk.questAuthoring.assetRole",
    "gk.questAuthoring.publishBridge"
  ]) {
    assert.equal(nodeTypes.has(nodeType), true, `${nodeType} should be registered`);
  }

  const questAuthoringNodes = getCoreGraphNodeTypes().filter((node) => node.type.startsWith("gk.questAuthoring."));
  assert.equal(questAuthoringNodes.length, 9);
  assert.equal(questAuthoringNodes.filter((node) => node.scope === "editor-data").length, 8);
  assert.equal(questAuthoringNodes.filter((node) => node.scope === "publish-boundary").length, 1);
  assert.equal(questAuthoringNodes.every((node) => node.createsConcreteGameContent === false), true);
  assert.equal(questAuthoringNodes.every((node) => node.validate.validate({ runtimeFallbackContent: true }).length > 0), true);
  assert.equal(questAuthoringNodes.every((node) => node.validate.validate({ hardcodesRuntimeContent: true }).length > 0), true);
  assert.equal(questAuthoringNodes.every((node) => node.validate.validate({ dummyPublishedData: true }).length > 0), true);
  assert.equal(questAuthoringNodes.every((node) => node.validate.validate({ loadsAssets: true }).length > 0), true);
  assert.equal(questAuthoringNodes.every((node) => node.validate.validate({ resolvesFinalAssetRoles: true }).length > 0), true);
});

test("quest authoring draft validates complete generic node-data without runtime payload", () => {
  const draft = createCompleteDraft();
  const validation = validateQuestAuthoringDraft(draft);
  const contract = createQuestAuthoringPublishContract(draft);
  const contractValidation = validateQuestAuthoringPublishContract(contract);

  assert.equal(validation.valid, true);
  assert.equal(contractValidation.valid, true);
  assert.equal(contract.status, "publish-ready");
  assert.equal(contract.missingNodeKinds.length, 0);
  assert.equal(contract.consumesEditorNodeData, true);
  assert.equal(contract.emitsRuntimeProjectionRecords, true);
  assert.equal(contract.emitsRuntimePayload, false);
  assert.equal(contract.runtimeConsumesDraftData, false);
  assert.equal(contract.hardcodesRuntimeContent, false);
  assert.equal(contract.dummyPublishedData, false);
  assert.equal(contract.loadsAssets, false);
  assert.equal(contract.fetchesAssetBytes, false);
  assert.equal(contract.resolvesFinalAssetRoles, false);
  assert.equal(contract.readModelShape.shapeKind, "normalized-runtime-projection-record-references");
  assert.equal(contract.readModelShape.recordCount, QUEST_AUTHORING_NODE_KINDS.length);
  assert.equal(contract.readModelShape.normalizedByRecordId, true);
  assert.equal(contract.readModelShape.referencesByNodeId, true);
  assert.equal(contract.readModelShape.payloadLocation, "editor-node-data");
  assert.equal(contract.readModelShape.runtimePayloadIncluded, false);
  assert.equal(contract.readModelShape.runtimeFallbackContent, false);
  assert.equal(contract.readModelShape.dummyPublishedData, false);
  assert.equal(draft.nodes.some((node) => node.containsEditorContent), true);
});

test("quest authoring publish bridge emits only runtime projection record references", () => {
  const records = createQuestAuthoringRuntimeProjectionRecords(createCompleteDraft(), {
    sourceId: "publish-snapshot:phase19-test",
    snapshotId: "snapshot:phase19-test"
  });

  assert.equal(records.length, QUEST_AUTHORING_NODE_KINDS.length);

  for (const nodeKind of QUEST_AUTHORING_NODE_KINDS) {
    assert.equal(records.some((record) => record.recordType === QUEST_AUTHORING_NODE_KIND_TO_RECORD_TYPE[nodeKind]), true);
  }

  for (const [index, record] of records.entries()) {
    assert.equal(validateRuntimeProjectionRecord(record, `records.${index}`).length, 0);
    assert.equal(record.dataReference.source, "publish-snapshot-metadata");
    assert.equal(record.runtimeReadable, true);
    assert.equal(record.rendererInstruction, null);
    assert.equal(record.safetyFlags.publishesRuntimeProjection, true);
    assert.equal(record.safetyFlags.containsConcreteGameContent, false);
    assert.equal(record.safetyFlags.usesHardcodedContent, false);
    assert.equal(record.safetyFlags.copiesAssetsToGit, false);
    assert.equal(record.safetyFlags.assignsDefinitiveRuntimeRoles, false);
    assert.equal(Object.hasOwn(record, "payload"), false);
    assert.equal(Object.hasOwn(record, "runtimeFallback"), false);
  }
});

test("quest authoring validation rejects runtime fallback, dummy data and asset shortcuts", () => {
  const draft = createCompleteDraft();
  const unsafeNode = {
    ...draft.nodes[0],
    runtimeFallback: true,
    hardcodedRuntimeContent: true,
    dummyPublishedData: true,
    publishesRuntimeOutput: true,
    loadsAssets: true,
    fetchesAssetBytes: true,
    resolvesFinalAssetRoles: true
  };
  const unsafeDraft = createQuestAuthoringDraft({
    draftId: "phase19-unsafe-draft",
    graphId: "phase19-unsafe-graph",
    nodes: [unsafeNode, ...draft.nodes.slice(1)]
  });
  const validation = validateQuestAuthoringDraft(unsafeDraft);

  assert.equal(validation.valid, false);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-runtime-fallback"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-hardcoded-runtime-content"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-dummy-published-data"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "asset-role-boundary"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "read-model-shape"), true);
});

test("quest authoring source files do not embed concrete Quest 00 runtime content", () => {
  const source = [
    "packages/schemas/src/quest-authoring.ts",
    "packages/schemas/src/quest-authoring-validation.ts",
    "packages/node-types/src/quest-authoring-nodes.ts"
  ].map((file) => readFileSync(file, "utf8")).join("\n");

  assert.doesNotMatch(source, FORBIDDEN_CONCRETE_QUEST_CONTENT_PATTERN);
  assert.doesNotMatch(source, /GLTFLoader|loadGLB|new Audio\(|\.play\(/);
  assert.doesNotMatch(source, /fetch\(["']\/assets|src\s*=\s*["']\/assets/);
  assert.doesNotMatch(source, /dummyAsset|dummyPublishedQuest|runtimeFallbackQuest/i);
});

function createCompleteDraft() {
  const nodes = QUEST_AUTHORING_NODE_KINDS.map((nodeKind) => createQuestAuthoringNodeRecord({
    nodeId: `phase19-${nodeKind}`,
    nodeKind,
    sourceGraphNodeId: `graph-node:${nodeKind}`,
    contentReferenceId: `editor-node-data:${nodeKind}:phase19`,
    state: "candidate",
    containsEditorContent: nodeKind === "dialogue" || nodeKind === "reward"
  }));

  return createQuestAuthoringDraft({
    draftId: "phase19-authoring-draft",
    graphId: "phase19-authoring-graph",
    state: "candidate",
    nodes
  });
}