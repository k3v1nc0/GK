import type { EntityTemplateDraft } from "./entity-components.js";
import type { EditorGraphDocument } from "./node-graph.js";
import type {
  GenerationBakeDraftResult,
  GenerationPreviewResult,
  ProceduralGraphDraft
} from "./procedural-generation.js";
import type {
  GeneratedCandidateReference,
  UiAssetDisplayContract
} from "./world-camera-minimap.js";
import type { Phase9WorldValidationInput } from "./world-camera-minimap-validation.js";

export const PUBLISH_FLOW_STATES = [
  "draft",
  "candidate",
  "publish-ready",
  "published-snapshot"
] as const;

export const PUBLISH_INPUT_STATES = ["draft", "candidate"] as const;

export const PUBLISH_VALIDATION_GATES = [
  "node-graph-completeness",
  "asset-candidates",
  "entity-component-validity",
  "procedural-generated-candidates",
  "world-zone-camera-minimap-validity",
  "ui-display-sizing",
  "no-runtime-publish",
  "no-asset-mutation",
  "no-hardcoded-content"
] as const;

export type PublishFlowState = (typeof PUBLISH_FLOW_STATES)[number];
export type PublishInputState = (typeof PUBLISH_INPUT_STATES)[number];
export type PublishValidationGate = (typeof PUBLISH_VALIDATION_GATES)[number];
export type PublishValidationSeverity = "warning" | "error";

export type PublishCandidateSource =
  | "node-graph-draft"
  | "asset-library-candidate"
  | "audio-library-candidate"
  | "entity-component-draft"
  | "procedural-generated-draft"
  | "world-camera-minimap-draft"
  | "ui-display-draft";

export interface PublishCandidateReference {
  readonly candidateId: string;
  readonly source: PublishCandidateSource;
  readonly sourceId: string;
  readonly state: PublishInputState;
  readonly acceptedByPublishFlow: false;
  readonly assignsDefinitiveRuntimeRole: false;
  readonly copiesAssetsToGit: false;
  readonly publishesRuntimeOutput: false;
}

export interface PublishInputBundle {
  readonly bundleId: string;
  readonly state: PublishInputState;
  readonly nodeGraph: EditorGraphDocument | null;
  readonly entities: readonly EntityTemplateDraft[];
  readonly proceduralGraph: ProceduralGraphDraft | null;
  readonly proceduralPreview: GenerationPreviewResult | null;
  readonly proceduralBake: GenerationBakeDraftResult | null;
  readonly world: Phase9WorldValidationInput | null;
  readonly uiDisplays: readonly UiAssetDisplayContract[];
  readonly generatedReferences: readonly GeneratedCandidateReference<string>[];
  readonly candidateReferences: readonly PublishCandidateReference[];
  readonly hardcodedContentIndicators: readonly string[];
  readonly runtimePublishRequested: false;
  readonly automaticPublish: false;
  readonly assetsCopiedToGit: false;
  readonly containsConcreteRuntimeContent: false;
  readonly publishesRuntimeOutput: false;
}

export interface PublishValidationIssue {
  readonly gate: PublishValidationGate;
  readonly path: string;
  readonly message: string;
  readonly severity: PublishValidationSeverity;
  readonly blocksPublishReady: boolean;
  readonly blocksRuntimePublish: boolean;
}

export interface PublishGateResult {
  readonly gate: PublishValidationGate;
  readonly status: "pass" | "warning" | "fail";
  readonly issues: readonly PublishValidationIssue[];
}

export interface PublishSnapshotCandidateSummary {
  readonly total: number;
  readonly nodeGraph: number;
  readonly assetCandidates: number;
  readonly audioCandidates: number;
  readonly entityDrafts: number;
  readonly proceduralGeneratedDrafts: number;
  readonly worldDrafts: number;
  readonly uiDisplayDrafts: number;
}

export interface PublishValidationResult {
  readonly validationId: string;
  readonly bundleId: string;
  readonly state: Extract<PublishFlowState, "draft" | "candidate" | "publish-ready">;
  readonly publishReady: boolean;
  readonly snapshotAllowed: boolean;
  readonly gateResults: readonly PublishGateResult[];
  readonly issues: readonly PublishValidationIssue[];
  readonly candidateSummary: PublishSnapshotCandidateSummary;
  readonly runtimePublishRequested: false;
  readonly automaticPublish: false;
  readonly assetsCopiedToGit: false;
  readonly containsConcreteRuntimeContent: false;
  readonly publishesRuntimeOutput: false;
}

export interface PublishSnapshotMetadata {
  readonly snapshotId: string;
  readonly sourceBundleId: string;
  readonly state: "published-snapshot";
  readonly createdAt: string;
  readonly createdByEditorUserId: string | null;
  readonly validationResultId: string | null;
  readonly candidateSummary: PublishSnapshotCandidateSummary;
  readonly rollbackReferenceId: string | null;
  readonly containsRuntimePayload: false;
  readonly containsConcreteRuntimeContent: false;
  readonly copiesAssetsToGit: false;
  readonly publishesRuntimeOutput: false;
}

export interface PublishAuditEvent {
  readonly eventId: string;
  readonly action: "publish.validate" | "publish.snapshot.metadata.create" | "publish.rollback.validate";
  readonly actorScope: "editor";
  readonly actorEditorUserId: string | null;
  readonly targetSnapshotId: string | null;
  readonly createdAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly containsConcreteRuntimeContent: false;
  readonly publishesRuntimeOutput: false;
}

export interface PublishRollbackSnapshotReference {
  readonly rollbackReferenceId: string;
  readonly targetSnapshotId: string;
  readonly source: "published-snapshot-metadata";
  readonly validatesOnly: true;
  readonly restoresRuntimeAutomatically: false;
  readonly containsConcreteRuntimeContent: false;
  readonly publishesRuntimeOutput: false;
}

export function createPublishCandidateReference(options: {
  readonly candidateId: string;
  readonly source: PublishCandidateSource;
  readonly sourceId: string;
  readonly state?: PublishInputState;
}): PublishCandidateReference {
  return {
    candidateId: options.candidateId,
    source: options.source,
    sourceId: options.sourceId,
    state: options.state ?? "candidate",
    acceptedByPublishFlow: false,
    assignsDefinitiveRuntimeRole: false,
    copiesAssetsToGit: false,
    publishesRuntimeOutput: false
  };
}

export function createPublishInputBundle(options: {
  readonly bundleId: string;
  readonly state?: PublishInputState;
  readonly nodeGraph?: EditorGraphDocument | null;
  readonly entities?: readonly EntityTemplateDraft[];
  readonly proceduralGraph?: ProceduralGraphDraft | null;
  readonly proceduralPreview?: GenerationPreviewResult | null;
  readonly proceduralBake?: GenerationBakeDraftResult | null;
  readonly world?: Phase9WorldValidationInput | null;
  readonly uiDisplays?: readonly UiAssetDisplayContract[];
  readonly generatedReferences?: readonly GeneratedCandidateReference<string>[];
  readonly candidateReferences?: readonly PublishCandidateReference[];
  readonly hardcodedContentIndicators?: readonly string[];
}): PublishInputBundle {
  return {
    bundleId: options.bundleId,
    state: options.state ?? "draft",
    nodeGraph: options.nodeGraph ?? null,
    entities: options.entities ?? [],
    proceduralGraph: options.proceduralGraph ?? null,
    proceduralPreview: options.proceduralPreview ?? null,
    proceduralBake: options.proceduralBake ?? null,
    world: options.world ?? null,
    uiDisplays: options.uiDisplays ?? [],
    generatedReferences: options.generatedReferences ?? [],
    candidateReferences: options.candidateReferences ?? [],
    hardcodedContentIndicators: options.hardcodedContentIndicators ?? [],
    runtimePublishRequested: false,
    automaticPublish: false,
    assetsCopiedToGit: false,
    containsConcreteRuntimeContent: false,
    publishesRuntimeOutput: false
  };
}

export function countPublishCandidateSummary(bundle: PublishInputBundle): PublishSnapshotCandidateSummary {
  return {
    total: bundle.candidateReferences.length,
    nodeGraph: countSource(bundle, "node-graph-draft"),
    assetCandidates: countSource(bundle, "asset-library-candidate"),
    audioCandidates: countSource(bundle, "audio-library-candidate"),
    entityDrafts: bundle.entities.length + countSource(bundle, "entity-component-draft"),
    proceduralGeneratedDrafts: bundle.generatedReferences.length + countSource(bundle, "procedural-generated-draft"),
    worldDrafts: (bundle.world ? 1 : 0) + countSource(bundle, "world-camera-minimap-draft"),
    uiDisplayDrafts: bundle.uiDisplays.length + (bundle.world?.uiDisplays?.length ?? 0) + countSource(bundle, "ui-display-draft")
  };
}

export function createPublishSnapshotMetadata(options: {
  readonly sourceBundleId: string;
  readonly createdAt: string;
  readonly createdByEditorUserId?: string | null;
  readonly snapshotId?: string;
  readonly validationResultId?: string | null;
  readonly candidateSummary?: PublishSnapshotCandidateSummary;
  readonly rollbackReferenceId?: string | null;
}): PublishSnapshotMetadata {
  return {
    snapshotId: options.snapshotId ?? `snapshot:${options.sourceBundleId}`,
    sourceBundleId: options.sourceBundleId,
    state: "published-snapshot",
    createdAt: options.createdAt,
    createdByEditorUserId: options.createdByEditorUserId ?? null,
    validationResultId: options.validationResultId ?? null,
    candidateSummary: options.candidateSummary ?? emptyCandidateSummary(),
    rollbackReferenceId: options.rollbackReferenceId ?? null,
    containsRuntimePayload: false,
    containsConcreteRuntimeContent: false,
    copiesAssetsToGit: false,
    publishesRuntimeOutput: false
  };
}

export function createPublishAuditEvent(options: {
  readonly action: PublishAuditEvent["action"];
  readonly createdAt: string;
  readonly actorEditorUserId?: string | null;
  readonly eventId?: string;
  readonly targetSnapshotId?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): PublishAuditEvent {
  return {
    eventId: options.eventId ?? `${options.action}:${options.targetSnapshotId ?? "draft"}`,
    action: options.action,
    actorScope: "editor",
    actorEditorUserId: options.actorEditorUserId ?? null,
    targetSnapshotId: options.targetSnapshotId ?? null,
    createdAt: options.createdAt,
    metadata: options.metadata ?? {},
    containsConcreteRuntimeContent: false,
    publishesRuntimeOutput: false
  };
}

export function createRollbackSnapshotReference(options: {
  readonly rollbackReferenceId: string;
  readonly targetSnapshotId: string;
}): PublishRollbackSnapshotReference {
  return {
    rollbackReferenceId: options.rollbackReferenceId,
    targetSnapshotId: options.targetSnapshotId,
    source: "published-snapshot-metadata",
    validatesOnly: true,
    restoresRuntimeAutomatically: false,
    containsConcreteRuntimeContent: false,
    publishesRuntimeOutput: false
  };
}

function countSource(bundle: PublishInputBundle, source: PublishCandidateSource): number {
  return bundle.candidateReferences.filter((candidate) => candidate.source === source).length;
}

function emptyCandidateSummary(): PublishSnapshotCandidateSummary {
  return {
    total: 0,
    nodeGraph: 0,
    assetCandidates: 0,
    audioCandidates: 0,
    entityDrafts: 0,
    proceduralGeneratedDrafts: 0,
    worldDrafts: 0,
    uiDisplayDrafts: 0
  };
}
