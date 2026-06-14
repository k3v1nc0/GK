import {
  QUEST_AUTHORING_NODE_KIND_TO_RECORD_TYPE,
  QUEST_AUTHORING_REQUIRED_NODE_KINDS,
  createQuestAuthoringPublishContract,
  createQuestAuthoringValidationResult,
  isQuestAuthoringNodeKind,
  type QuestAuthoringDraft,
  type QuestAuthoringNodeRecord,
  type QuestAuthoringPublishContract,
  type QuestAuthoringValidationGate,
  type QuestAuthoringValidationIssue,
  type QuestAuthoringValidationResult
} from "./quest-authoring.js";

export function validateQuestAuthoringDraft(draft: QuestAuthoringDraft): QuestAuthoringValidationResult {
  const issues = dedupeIssues([
    ...validateDraftIdentity(draft),
    ...validateQuestAuthoringCompleteness(draft),
    ...draft.nodes.flatMap((node, index) => validateQuestAuthoringNodeRecord(node, draft, `nodes.${index}`)),
    ...validateQuestAuthoringReferences(draft),
    ...validateQuestAuthoringSafetyFlags(draft)
  ]);

  return createQuestAuthoringValidationResult({
    draftId: draft.draftId || "quest-authoring-draft",
    issues
  });
}

export function validateQuestAuthoringPublishContract(
  contract: QuestAuthoringPublishContract
): QuestAuthoringValidationResult {
  const issues: QuestAuthoringValidationIssue[] = [];

  if (contract.phase !== "phase-19" || contract.marker !== "phase-19") {
    issues.push(issue("safety-flags", "phase", "Quest authoring publish bridge must identify Fase 19.", "error", true));
  }

  if (contract.contractKind !== "quest-authoring-publish-bridge") {
    issues.push(issue("publish-record-shape", "contractKind", "Fase 19 publish contract must be a quest-authoring publish bridge.", "error", true));
  }

  if (contract.sourceDraftId.trim().length === 0 || contract.sourceGraphId.trim().length === 0) {
    issues.push(issue("node-data-only", "source", "Quest authoring publish contract requires data-driven draft and graph ids.", "error", true));
  }

  if (contract.missingNodeKinds.length > 0 || contract.status !== "publish-ready") {
    issues.push(issue("quest-authoring-completeness", "missingNodeKinds", "Quest authoring publish bridge requires quest, dialogue, objective, interactable, reward, unlock, checkpoint and asset-role node-data before publish-ready.", "error", true));
  }

  if (!contract.consumesEditorNodeData || !contract.emitsRuntimeProjectionRecords || contract.emitsRuntimePayload) {
    issues.push(issue("read-model-shape", "emitsRuntimeProjectionRecords", "Fase 19 must emit normalized runtime projection record references, not runtime payload.", "error", true));
  }

  if (contract.runtimeConsumesDraftData || contract.hardcodesRuntimeContent || contract.dummyPublishedData) {
    issues.push(issue("no-runtime-fallback", "runtimeBoundary", "Runtime must not consume draft data, hardcoded content or dummy published data.", "error", true));
  }

  if (contract.loadsAssets || contract.fetchesAssetBytes || contract.resolvesFinalAssetRoles) {
    issues.push(issue("asset-role-boundary", "assetBoundary", "Fase 19 authoring may describe asset-role records, but cannot load assets, fetch bytes or resolve final roles.", "error", true));
  }

  if (contract.readModelShape.runtimePayloadIncluded || contract.readModelShape.runtimeFallbackContent || contract.readModelShape.dummyPublishedData) {
    issues.push(issue("read-model-shape", "readModelShape", "Quest read-model shape must stay normalized references without runtime payload or fallback data.", "error", true));
  }

  return createQuestAuthoringValidationResult({
    draftId: contract.sourceDraftId || "quest-authoring-contract",
    issues: dedupeIssues(issues)
  });
}

export function validateQuestAuthoringNodeRecord(
  node: QuestAuthoringNodeRecord,
  draft: QuestAuthoringDraft,
  prefix = "node"
): readonly QuestAuthoringValidationIssue[] {
  const issues: QuestAuthoringValidationIssue[] = [];

  if (node.nodeId.trim().length === 0 || node.sourceGraphNodeId.trim().length === 0 || node.contentReferenceId.trim().length === 0) {
    issues.push(issue("node-data-only", prefix, "Quest authoring nodes require data-driven node, graph and content reference ids.", "error", true));
  }

  if (node.source !== "editor-node-data") {
    issues.push(issue("node-data-only", `${prefix}.source`, "Quest authoring nodes must come from editor/node-data.", "error", true));
  }

  if (!isQuestAuthoringNodeKind(node.nodeKind)) {
    issues.push(issue("publish-record-shape", `${prefix}.nodeKind`, "Quest authoring node kind must be one of the generic Fase 19 quest authoring kinds.", "error", true));
  } else if (node.publishedRecordType !== QUEST_AUTHORING_NODE_KIND_TO_RECORD_TYPE[node.nodeKind]) {
    issues.push(issue("publish-record-shape", `${prefix}.publishedRecordType`, "Quest authoring node kind must map to its matching runtime projection record type.", "error", true));
  }

  if (node.runtimeFallback) {
    issues.push(issue("no-runtime-fallback", `${prefix}.runtimeFallback`, "Quest authoring nodes must not create runtime fallback content.", "error", true));
  }

  if (node.hardcodedRuntimeContent) {
    issues.push(issue("no-hardcoded-runtime-content", `${prefix}.hardcodedRuntimeContent`, "Concrete quest content may live in editor node-data, not runtime hardcoding.", "error", true));
  }

  if (node.dummyPublishedData) {
    issues.push(issue("no-dummy-published-data", `${prefix}.dummyPublishedData`, "Quest authoring must not invent dummy published data.", "error", true));
  }

  if (node.publishesRuntimeOutput || node.mutatesPublishedData) {
    issues.push(issue("read-model-shape", `${prefix}.runtimeOutput`, "Fase 19 prepares read-model records only and must not publish runtime output or mutate published data.", "error", true));
  }

  if (node.loadsAssets || node.fetchesAssetBytes || node.copiesAssetsToGit) {
    issues.push(issue("asset-role-boundary", `${prefix}.assets`, "Quest authoring nodes can reference asset roles, but cannot load, fetch, copy or mutate assets.", "error", true));
  }

  if (node.resolvesFinalAssetRoles) {
    issues.push(issue("asset-role-boundary", `${prefix}.resolvesFinalAssetRoles`, "Asset-role authoring records remain unresolved until an explicit later mapping phase.", "error", true));
  }

  if (isRuntimeOrEditorRoute(node.contentReferenceId)) {
    issues.push(issue("node-data-only", `${prefix}.contentReferenceId`, "Content references must be node-data ids, not editor/admin/runtime routes.", "error", true));
  }

  if (draft.runtimeFallbackContent || draft.hardcodedRuntimeContent || draft.dummyPublishedData || draft.publishesRuntimeOutput) {
    issues.push(issue("safety-flags", "draft.runtimeBoundary", "Quest authoring draft cannot enable runtime fallback, hardcoded runtime content, dummy data or runtime output.", "error", true));
  }

  return issues;
}

function validateDraftIdentity(draft: QuestAuthoringDraft): readonly QuestAuthoringValidationIssue[] {
  const issues: QuestAuthoringValidationIssue[] = [];

  if (draft.phase !== "phase-19" || draft.marker !== "phase-19") {
    issues.push(issue("safety-flags", "phase", "Quest authoring draft must identify Fase 19.", "error", true));
  }

  if (draft.draftId.trim().length === 0 || draft.graphId.trim().length === 0) {
    issues.push(issue("node-data-only", "draft", "Quest authoring draft requires data-driven draft and graph ids.", "error", true));
  }

  if (draft.source !== "editor-node-data") {
    issues.push(issue("node-data-only", "source", "Quest authoring draft must originate from editor/node-data.", "error", true));
  }

  return issues;
}

function validateQuestAuthoringCompleteness(draft: QuestAuthoringDraft): readonly QuestAuthoringValidationIssue[] {
  const contract = createQuestAuthoringPublishContract(draft);

  if (contract.missingNodeKinds.length === 0) {
    return [];
  }

  return [issue(
    "quest-authoring-completeness",
    "missingNodeKinds",
    `Quest authoring draft is missing required node kinds: ${contract.missingNodeKinds.join(", ")}.`,
    "error",
    true
  )];
}

function validateQuestAuthoringReferences(draft: QuestAuthoringDraft): readonly QuestAuthoringValidationIssue[] {
  const ids = new Set(draft.nodes.map((node) => node.nodeId));
  const issues: QuestAuthoringValidationIssue[] = [];

  draft.nodes.forEach((node, nodeIndex) => {
    node.references.forEach((reference, referenceIndex) => {
      const prefix = `nodes.${nodeIndex}.references.${referenceIndex}`;

      if (reference.sourceNodeId !== node.nodeId) {
        issues.push(issue("references-resolve", `${prefix}.sourceNodeId`, "Quest authoring references must start at the owning node.", "error", true));
      }

      if (!ids.has(reference.targetNodeId)) {
        issues.push(issue("references-resolve", `${prefix}.targetNodeId`, "Quest authoring references must point to another node in the same editor graph.", "error", true));
      }

      if (reference.relation.trim().length === 0) {
        issues.push(issue("references-resolve", `${prefix}.relation`, "Quest authoring references require a relation label.", "error", true));
      }
    });
  });

  return issues;
}

function validateQuestAuthoringSafetyFlags(draft: QuestAuthoringDraft): readonly QuestAuthoringValidationIssue[] {
  const flags = draft.safetyFlags;
  const issues: QuestAuthoringValidationIssue[] = [];

  if (!flags.sourceIsEditorNodeData || !flags.preparesPublishReadModel) {
    issues.push(issue("node-data-only", "safetyFlags.source", "Fase 19 must prepare publish read-models from editor/node-data.", "error", true));
  }

  if (flags.runtimeConsumesDraftData || flags.publishesRuntimeOutput || flags.runtimeFallbackContent || flags.hardcodesRuntimeContent || flags.dummyPublishedData) {
    issues.push(issue("no-runtime-fallback", "safetyFlags.runtimeBoundary", "Fase 19 cannot let runtime consume drafts, fallback content, dummy data or hardcoded content.", "error", true));
  }

  if (flags.mutatesPublishedData) {
    issues.push(issue("read-model-shape", "safetyFlags.mutatesPublishedData", "Quest authoring validation must not mutate published data.", "error", true));
  }

  if (flags.loadsAssets || flags.fetchesAssetBytes || flags.resolvesFinalAssetRoles || flags.copiesAssetsToGit) {
    issues.push(issue("asset-role-boundary", "safetyFlags.assets", "Fase 19 may define asset-role records but cannot load, fetch, copy or resolve assets.", "error", true));
  }

  return issues;
}

function isRuntimeOrEditorRoute(value: string): boolean {
  return /^\/(editor|auth\/editor|game|runtime|assets)\b/i.test(value) || /\.(glb|gltf|png|jpe?g|webp|gif|mp3|wav|ogg)(\?|$)/i.test(value);
}

function issue(
  gate: QuestAuthoringValidationGate,
  path: string,
  message: string,
  severity: QuestAuthoringValidationIssue["severity"],
  blocksPublish: boolean
): QuestAuthoringValidationIssue {
  return { gate, path, message, severity, blocksPublish };
}

function dedupeIssues(issues: readonly QuestAuthoringValidationIssue[]): readonly QuestAuthoringValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((candidate) => {
    const key = `${candidate.gate}:${candidate.path}:${candidate.message}:${candidate.severity}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}