import {
  createRuntimeProjectionRecord,
  type RuntimeProjectionRecord,
  type RuntimeProjectionRecordType
} from "./runtime-projection.js";

export const QUEST_AUTHORING_PHASE = "phase-19" as const;
export const QUEST_AUTHORING_MARKER = "phase-19" as const;

export const QUEST_AUTHORING_NODE_KINDS = [
  "quest",
  "dialogue",
  "objective",
  "interactable",
  "reward",
  "unlock",
  "checkpoint",
  "asset-role"
] as const;

export type QuestAuthoringNodeKind = (typeof QUEST_AUTHORING_NODE_KINDS)[number];

export const QUEST_AUTHORING_REQUIRED_NODE_KINDS = QUEST_AUTHORING_NODE_KINDS;

export const QUEST_AUTHORING_NODE_KIND_TO_RECORD_TYPE: Readonly<Record<QuestAuthoringNodeKind, RuntimeProjectionRecordType>> = {
  quest: "quest.reference",
  dialogue: "dialogue.reference",
  objective: "objective.reference",
  interactable: "interactable.reference",
  reward: "reward.reference",
  unlock: "unlock.reference",
  checkpoint: "checkpoint.reference",
  "asset-role": "asset-role.reference"
} as const;

export const QUEST_AUTHORING_VALIDATION_GATES = [
  "node-data-only",
  "quest-authoring-completeness",
  "references-resolve",
  "publish-record-shape",
  "no-runtime-fallback",
  "no-hardcoded-runtime-content",
  "no-dummy-published-data",
  "asset-role-boundary",
  "read-model-shape",
  "safety-flags"
] as const;

export type QuestAuthoringValidationGate = (typeof QUEST_AUTHORING_VALIDATION_GATES)[number];
export type QuestAuthoringValidationSeverity = "warning" | "error";
export type QuestAuthoringInputState = "draft" | "candidate";
export type QuestAuthoringPublishStatus = "blocked" | "publish-ready";

export interface QuestAuthoringSafetyFlags {
  readonly sourceIsEditorNodeData: boolean;
  readonly preparesPublishReadModel: boolean;
  readonly runtimeConsumesDraftData: false;
  readonly publishesRuntimeOutput: false;
  readonly runtimeFallbackContent: false;
  readonly hardcodesRuntimeContent: false;
  readonly dummyPublishedData: false;
  readonly mutatesPublishedData: false;
  readonly loadsAssets: false;
  readonly fetchesAssetBytes: false;
  readonly resolvesFinalAssetRoles: false;
  readonly copiesAssetsToGit: false;
}

export interface QuestAuthoringNodeReference {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly relation: string;
  readonly requiredForPublish: boolean;
}

export interface QuestAuthoringNodeRecord {
  readonly nodeId: string;
  readonly nodeKind: QuestAuthoringNodeKind;
  readonly sourceGraphNodeId: string;
  readonly contentReferenceId: string;
  readonly publishedRecordType: RuntimeProjectionRecordType;
  readonly source: "editor-node-data";
  readonly state: QuestAuthoringInputState;
  readonly references: readonly QuestAuthoringNodeReference[];
  readonly assetRoleIds: readonly string[];
  readonly containsEditorContent: boolean;
  readonly runtimeFallback: false;
  readonly hardcodedRuntimeContent: false;
  readonly dummyPublishedData: false;
  readonly publishesRuntimeOutput: false;
  readonly mutatesPublishedData: false;
  readonly loadsAssets: false;
  readonly fetchesAssetBytes: false;
  readonly resolvesFinalAssetRoles: false;
  readonly copiesAssetsToGit: false;
}

export interface QuestAuthoringDraft {
  readonly phase: typeof QUEST_AUTHORING_PHASE;
  readonly marker: typeof QUEST_AUTHORING_MARKER;
  readonly draftId: string;
  readonly graphId: string;
  readonly state: QuestAuthoringInputState;
  readonly source: "editor-node-data";
  readonly nodes: readonly QuestAuthoringNodeRecord[];
  readonly safetyFlags: QuestAuthoringSafetyFlags;
  readonly runtimeFallbackContent: false;
  readonly hardcodedRuntimeContent: false;
  readonly dummyPublishedData: false;
  readonly publishesRuntimeOutput: false;
}

export interface QuestAuthoringNodeCounts {
  readonly quest: number;
  readonly dialogue: number;
  readonly objective: number;
  readonly interactable: number;
  readonly reward: number;
  readonly unlock: number;
  readonly checkpoint: number;
  readonly "asset-role": number;
}

export interface QuestAuthoringReadModelShape {
  readonly shapeKind: "normalized-runtime-projection-record-references";
  readonly phase: typeof QUEST_AUTHORING_PHASE;
  readonly recordCount: number;
  readonly nodeCounts: QuestAuthoringNodeCounts;
  readonly runtimeProjectionRecordTypes: readonly RuntimeProjectionRecordType[];
  readonly recordsByType: Readonly<Partial<Record<RuntimeProjectionRecordType, number>>>;
  readonly normalizedByRecordId: true;
  readonly referencesByNodeId: true;
  readonly payloadLocation: "editor-node-data";
  readonly runtimePayloadIncluded: false;
  readonly runtimeFallbackContent: false;
  readonly dummyPublishedData: false;
}

export interface QuestAuthoringPublishContract {
  readonly phase: typeof QUEST_AUTHORING_PHASE;
  readonly marker: typeof QUEST_AUTHORING_MARKER;
  readonly contractKind: "quest-authoring-publish-bridge";
  readonly sourceDraftId: string;
  readonly sourceGraphId: string;
  readonly status: QuestAuthoringPublishStatus;
  readonly requiredNodeKinds: readonly QuestAuthoringNodeKind[];
  readonly missingNodeKinds: readonly QuestAuthoringNodeKind[];
  readonly readModelShape: QuestAuthoringReadModelShape;
  readonly safetyFlags: QuestAuthoringSafetyFlags;
  readonly consumesEditorNodeData: true;
  readonly emitsRuntimeProjectionRecords: true;
  readonly emitsRuntimePayload: false;
  readonly runtimeConsumesDraftData: false;
  readonly hardcodesRuntimeContent: false;
  readonly dummyPublishedData: false;
  readonly loadsAssets: false;
  readonly fetchesAssetBytes: false;
  readonly resolvesFinalAssetRoles: false;
}

export interface QuestAuthoringValidationIssue {
  readonly gate: QuestAuthoringValidationGate;
  readonly path: string;
  readonly message: string;
  readonly severity: QuestAuthoringValidationSeverity;
  readonly blocksPublish: boolean;
}

export interface QuestAuthoringGateResult {
  readonly gate: QuestAuthoringValidationGate;
  readonly status: "pass" | "warning" | "fail";
  readonly issues: readonly QuestAuthoringValidationIssue[];
}

export interface QuestAuthoringValidationResult {
  readonly validationId: string;
  readonly valid: boolean;
  readonly gateResults: readonly QuestAuthoringGateResult[];
  readonly issues: readonly QuestAuthoringValidationIssue[];
  readonly phase: typeof QUEST_AUTHORING_PHASE;
  readonly sourceIsEditorNodeData: true;
  readonly publishesRuntimeOutput: false;
  readonly runtimeFallbackContent: false;
  readonly hardcodesRuntimeContent: false;
  readonly dummyPublishedData: false;
}

export function createQuestAuthoringSafetyFlags(
  overrides: Partial<QuestAuthoringSafetyFlags> = {}
): QuestAuthoringSafetyFlags {
  return {
    sourceIsEditorNodeData: true,
    preparesPublishReadModel: true,
    runtimeConsumesDraftData: false,
    publishesRuntimeOutput: false,
    runtimeFallbackContent: false,
    hardcodesRuntimeContent: false,
    dummyPublishedData: false,
    mutatesPublishedData: false,
    loadsAssets: false,
    fetchesAssetBytes: false,
    resolvesFinalAssetRoles: false,
    copiesAssetsToGit: false,
    ...overrides
  };
}

export function createQuestAuthoringNodeRecord(options: {
  readonly nodeId: string;
  readonly nodeKind: QuestAuthoringNodeKind;
  readonly sourceGraphNodeId?: string;
  readonly contentReferenceId?: string;
  readonly state?: QuestAuthoringInputState;
  readonly references?: readonly QuestAuthoringNodeReference[];
  readonly assetRoleIds?: readonly string[];
  readonly containsEditorContent?: boolean;
}): QuestAuthoringNodeRecord {
  return {
    nodeId: options.nodeId,
    nodeKind: options.nodeKind,
    sourceGraphNodeId: options.sourceGraphNodeId ?? options.nodeId,
    contentReferenceId: options.contentReferenceId ?? `quest-authoring:${options.nodeKind}:${options.nodeId}`,
    publishedRecordType: QUEST_AUTHORING_NODE_KIND_TO_RECORD_TYPE[options.nodeKind],
    source: "editor-node-data",
    state: options.state ?? "draft",
    references: options.references ?? [],
    assetRoleIds: options.assetRoleIds ?? [],
    containsEditorContent: options.containsEditorContent ?? false,
    runtimeFallback: false,
    hardcodedRuntimeContent: false,
    dummyPublishedData: false,
    publishesRuntimeOutput: false,
    mutatesPublishedData: false,
    loadsAssets: false,
    fetchesAssetBytes: false,
    resolvesFinalAssetRoles: false,
    copiesAssetsToGit: false
  };
}

export function createQuestAuthoringDraft(options: {
  readonly draftId: string;
  readonly graphId: string;
  readonly state?: QuestAuthoringInputState;
  readonly nodes?: readonly QuestAuthoringNodeRecord[];
  readonly safetyFlags?: Partial<QuestAuthoringSafetyFlags>;
}): QuestAuthoringDraft {
  return {
    phase: QUEST_AUTHORING_PHASE,
    marker: QUEST_AUTHORING_MARKER,
    draftId: options.draftId,
    graphId: options.graphId,
    state: options.state ?? "draft",
    source: "editor-node-data",
    nodes: options.nodes ?? [],
    safetyFlags: createQuestAuthoringSafetyFlags(options.safetyFlags),
    runtimeFallbackContent: false,
    hardcodedRuntimeContent: false,
    dummyPublishedData: false,
    publishesRuntimeOutput: false
  };
}

export function countQuestAuthoringNodes(draft: QuestAuthoringDraft): QuestAuthoringNodeCounts {
  const counts: Record<QuestAuthoringNodeKind, number> = {
    quest: 0,
    dialogue: 0,
    objective: 0,
    interactable: 0,
    reward: 0,
    unlock: 0,
    checkpoint: 0,
    "asset-role": 0
  };

  for (const node of draft.nodes) {
    if (isQuestAuthoringNodeKind(node.nodeKind)) {
      counts[node.nodeKind] += 1;
    }
  }

  return counts;
}

export function createQuestAuthoringReadModelShape(draft: QuestAuthoringDraft): QuestAuthoringReadModelShape {
  const nodeCounts = countQuestAuthoringNodes(draft);
  const recordsByType: Partial<Record<RuntimeProjectionRecordType, number>> = {};

  for (const nodeKind of QUEST_AUTHORING_NODE_KINDS) {
    recordsByType[QUEST_AUTHORING_NODE_KIND_TO_RECORD_TYPE[nodeKind]] = nodeCounts[nodeKind];
  }

  return {
    shapeKind: "normalized-runtime-projection-record-references",
    phase: QUEST_AUTHORING_PHASE,
    recordCount: draft.nodes.length,
    nodeCounts,
    runtimeProjectionRecordTypes: QUEST_AUTHORING_NODE_KINDS.map((nodeKind) => QUEST_AUTHORING_NODE_KIND_TO_RECORD_TYPE[nodeKind]),
    recordsByType,
    normalizedByRecordId: true,
    referencesByNodeId: true,
    payloadLocation: "editor-node-data",
    runtimePayloadIncluded: false,
    runtimeFallbackContent: false,
    dummyPublishedData: false
  };
}

export function createQuestAuthoringPublishContract(draft: QuestAuthoringDraft): QuestAuthoringPublishContract {
  const counts = countQuestAuthoringNodes(draft);
  const missingNodeKinds = QUEST_AUTHORING_REQUIRED_NODE_KINDS.filter((nodeKind) => counts[nodeKind] === 0);

  return {
    phase: QUEST_AUTHORING_PHASE,
    marker: QUEST_AUTHORING_MARKER,
    contractKind: "quest-authoring-publish-bridge",
    sourceDraftId: draft.draftId,
    sourceGraphId: draft.graphId,
    status: missingNodeKinds.length === 0 ? "publish-ready" : "blocked",
    requiredNodeKinds: QUEST_AUTHORING_REQUIRED_NODE_KINDS,
    missingNodeKinds,
    readModelShape: createQuestAuthoringReadModelShape(draft),
    safetyFlags: draft.safetyFlags,
    consumesEditorNodeData: true,
    emitsRuntimeProjectionRecords: true,
    emitsRuntimePayload: false,
    runtimeConsumesDraftData: false,
    hardcodesRuntimeContent: false,
    dummyPublishedData: false,
    loadsAssets: false,
    fetchesAssetBytes: false,
    resolvesFinalAssetRoles: false
  };
}

export function createQuestAuthoringRuntimeProjectionRecords(
  draft: QuestAuthoringDraft,
  options: {
    readonly sourceId: string;
    readonly snapshotId?: string | null;
  }
): readonly RuntimeProjectionRecord[] {
  return draft.nodes.map((node) => createRuntimeProjectionRecord({
    recordId: `runtime-record:${node.nodeKind}:${node.nodeId}`,
    recordType: node.publishedRecordType,
    sourceId: options.sourceId,
    snapshotId: options.snapshotId ?? null,
    dataReference: {
      source: "publish-snapshot-metadata",
      id: node.contentReferenceId
    },
    safetyFlags: {
      publishesRuntimeProjection: true,
      implementsRuntimeRenderer: false,
      mutatesAssets: false,
      containsConcreteGameContent: false,
      usesHardcodedContent: false,
      copiesAssetsToGit: false,
      assignsDefinitiveRuntimeRoles: false,
      leaksEditorDraftData: false
    }
  }));
}

export function createQuestAuthoringValidationResult(options: {
  readonly draftId: string;
  readonly issues?: readonly QuestAuthoringValidationIssue[];
}): QuestAuthoringValidationResult {
  const issues = options.issues ?? [];
  const hasErrors = issues.some((candidate) => candidate.severity === "error");

  return {
    validationId: `quest-authoring-validation:${options.draftId}`,
    valid: !hasErrors,
    gateResults: createQuestAuthoringGateResults(issues),
    issues,
    phase: QUEST_AUTHORING_PHASE,
    sourceIsEditorNodeData: true,
    publishesRuntimeOutput: false,
    runtimeFallbackContent: false,
    hardcodesRuntimeContent: false,
    dummyPublishedData: false
  };
}

export function isQuestAuthoringNodeKind(value: string): value is QuestAuthoringNodeKind {
  return (QUEST_AUTHORING_NODE_KINDS as readonly string[]).includes(value);
}

function createQuestAuthoringGateResults(
  issues: readonly QuestAuthoringValidationIssue[]
): readonly QuestAuthoringGateResult[] {
  return QUEST_AUTHORING_VALIDATION_GATES.map((gate) => {
    const gateIssues = issues.filter((candidate) => candidate.gate === gate);
    const status = gateIssues.some((candidate) => candidate.severity === "error")
      ? "fail"
      : gateIssues.length > 0 ? "warning" : "pass";

    return { gate, status, issues: gateIssues };
  });
}