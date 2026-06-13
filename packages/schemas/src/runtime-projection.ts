import type {
  PublishCandidateReference,
  PublishSnapshotMetadata,
  PublishValidationResult
} from "./publish-flow.js";
import type {
  GeneratedCandidateReference,
  UiDisplayAnchor,
  UiDisplayPivot,
  UiDisplayScaleMode
} from "./world-camera-minimap.js";

export const RUNTIME_PROJECTION_STATUSES = [
  "empty",
  "projection-candidate",
  "manifest-ready",
  "runtime-readable"
] as const;

export const RUNTIME_PROJECTION_RECORD_TYPES = [
  "world.reference",
  "camera.reference",
  "lighting.reference",
  "minimap.reference",
  "ui.reference",
  "entity.reference",
  "component.reference",
  "asset.reference",
  "audio.reference",
  "generated.reference"
] as const;

export const RUNTIME_PROJECTION_VALIDATION_GATES = [
  "publish-source",
  "no-raw-draft-source",
  "no-procedural-preview-source",
  "no-asset-mutation",
  "no-concrete-gamecontent",
  "ui-display-sizing",
  "glb-role-candidate",
  "read-model-only",
  "safety-flags"
] as const;

export type RuntimeProjectionStatus = (typeof RUNTIME_PROJECTION_STATUSES)[number];
export type RuntimeProjectionRecordType = (typeof RUNTIME_PROJECTION_RECORD_TYPES)[number];
export type RuntimeProjectionValidationGate = (typeof RUNTIME_PROJECTION_VALIDATION_GATES)[number];
export type RuntimeProjectionSeverity = "warning" | "error";

export interface RuntimeProjectionSafetyFlags {
  readonly publishesRuntimeProjection: boolean;
  readonly implementsRuntimeRenderer: boolean;
  readonly mutatesAssets: boolean;
  readonly containsConcreteGameContent: boolean;
  readonly usesHardcodedContent: boolean;
  readonly copiesAssetsToGit: boolean;
  readonly assignsDefinitiveRuntimeRoles: boolean;
  readonly leaksEditorDraftData: boolean;
}

export interface RuntimeProjectionAcceptedGeneratedReference {
  readonly source: "publish-validation";
  readonly reference: GeneratedCandidateReference<string>;
  readonly acceptedByPublishValidation: boolean;
  readonly publishesRuntimeProjection: boolean;
  readonly publishesRuntimeOutput: false;
}

export interface RuntimeProjectionSource {
  readonly sourceId: string;
  readonly sourceKind: "publish-snapshot-metadata";
  readonly snapshot: PublishSnapshotMetadata | null;
  readonly publishValidation: PublishValidationResult | null;
  readonly candidateReferences: readonly PublishCandidateReference[];
  readonly acceptedGeneratedReferences: readonly RuntimeProjectionAcceptedGeneratedReference[];
  readonly usesPublishReadySnapshot: boolean;
  readonly readsRawDraftData: boolean;
  readonly readsProceduralPreviewDirectly: boolean;
  readonly readsProceduralBakeDirectly: boolean;
  readonly leaksEditorDraftData: boolean;
}

export type RuntimeProjectionDataReferenceSource =
  | "publish-snapshot-metadata"
  | "publish-validation"
  | "publish-candidate-reference";

export interface RuntimeProjectionDataReference {
  readonly source: RuntimeProjectionDataReferenceSource;
  readonly id: string;
}

export interface RuntimeProjectionUiDisplayReference {
  readonly source: "publish-data";
  readonly naturalWidth: number | null;
  readonly naturalHeight: number | null;
  readonly displayWidth: number | null;
  readonly displayHeight: number | null;
  readonly scaleMode: UiDisplayScaleMode | null;
  readonly anchor: UiDisplayAnchor | null;
  readonly pivot: UiDisplayPivot | null;
  readonly naturalSizeMetadataOnly: true;
}

export interface RuntimeProjectionRecord {
  readonly recordId: string;
  readonly recordType: RuntimeProjectionRecordType;
  readonly sourceId: string;
  readonly snapshotId: string | null;
  readonly dataReference: RuntimeProjectionDataReference;
  readonly uiDisplay: RuntimeProjectionUiDisplayReference | null;
  readonly safetyFlags: RuntimeProjectionSafetyFlags;
  readonly runtimeReadable: true;
  readonly rendererInstruction: null;
}

export interface RuntimeProjectionManifest {
  readonly manifestId: string;
  readonly status: Extract<RuntimeProjectionStatus, "manifest-ready" | "runtime-readable">;
  readonly source: RuntimeProjectionSource;
  readonly sourceSnapshotId: string | null;
  readonly createdAt: string;
  readonly recordCount: number;
  readonly records: readonly RuntimeProjectionRecord[];
  readonly safetyFlags: RuntimeProjectionSafetyFlags;
  readonly runtimeReadable: true;
  readonly rendererInstruction: null;
}

export interface RuntimeProjectionValidationIssue {
  readonly gate: RuntimeProjectionValidationGate;
  readonly path: string;
  readonly message: string;
  readonly severity: RuntimeProjectionSeverity;
  readonly blocksRuntimeProjection: boolean;
}

export interface RuntimeProjectionGateResult {
  readonly gate: RuntimeProjectionValidationGate;
  readonly status: "pass" | "warning" | "fail";
  readonly issues: readonly RuntimeProjectionValidationIssue[];
}

export interface RuntimeProjectionValidationResult {
  readonly validationId: string;
  readonly sourceId: string;
  readonly manifestId: string | null;
  readonly status: Extract<RuntimeProjectionStatus, "projection-candidate" | "manifest-ready">;
  readonly valid: boolean;
  readonly gateResults: readonly RuntimeProjectionGateResult[];
  readonly issues: readonly RuntimeProjectionValidationIssue[];
  readonly safetyFlags: RuntimeProjectionSafetyFlags;
  readonly implementsRuntimeRenderer: false;
  readonly mutatesAssets: false;
  readonly containsConcreteGameContent: false;
}

export interface RuntimeProjectionAuditEvent {
  readonly eventId: string;
  readonly action: "runtime_projection.validate" | "runtime_projection.project" | "runtime_projection.read";
  readonly actorScope: "editor" | "runtime";
  readonly actorEditorUserId: string | null;
  readonly targetManifestId: string | null;
  readonly createdAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly containsConcreteGameContent: false;
  readonly implementsRuntimeRenderer: false;
  readonly mutatesAssets: false;
}

export interface RuntimeProjectionReadModel {
  readonly status: RuntimeProjectionStatus;
  readonly manifest: RuntimeProjectionManifest | null;
  readonly records: readonly RuntimeProjectionRecord[];
  readonly emptyState: boolean;
  readonly runtimeReadable: true;
  readonly leaksEditorDraftData: false;
  readonly containsConcreteGameContent: false;
  readonly implementsRuntimeRenderer: false;
}

export function createRuntimeProjectionSafetyFlags(
  overrides: Partial<RuntimeProjectionSafetyFlags> = {}
): RuntimeProjectionSafetyFlags {
  return {
    publishesRuntimeProjection: true,
    implementsRuntimeRenderer: false,
    mutatesAssets: false,
    containsConcreteGameContent: false,
    usesHardcodedContent: false,
    copiesAssetsToGit: false,
    assignsDefinitiveRuntimeRoles: false,
    leaksEditorDraftData: false,
    ...overrides
  };
}

export function createRuntimeProjectionAcceptedGeneratedReference(options: {
  readonly reference: GeneratedCandidateReference<string>;
  readonly acceptedByPublishValidation?: boolean;
}): RuntimeProjectionAcceptedGeneratedReference {
  return {
    source: "publish-validation",
    reference: options.reference,
    acceptedByPublishValidation: options.acceptedByPublishValidation ?? true,
    publishesRuntimeProjection: true,
    publishesRuntimeOutput: false
  };
}

export function createRuntimeProjectionSource(options: {
  readonly sourceId: string;
  readonly snapshot?: PublishSnapshotMetadata | null;
  readonly publishValidation?: PublishValidationResult | null;
  readonly candidateReferences?: readonly PublishCandidateReference[];
  readonly acceptedGeneratedReferences?: readonly RuntimeProjectionAcceptedGeneratedReference[];
  readonly usesPublishReadySnapshot?: boolean;
}): RuntimeProjectionSource {
  return {
    sourceId: options.sourceId,
    sourceKind: "publish-snapshot-metadata",
    snapshot: options.snapshot ?? null,
    publishValidation: options.publishValidation ?? null,
    candidateReferences: options.candidateReferences ?? [],
    acceptedGeneratedReferences: options.acceptedGeneratedReferences ?? [],
    usesPublishReadySnapshot: options.usesPublishReadySnapshot ?? Boolean(options.snapshot),
    readsRawDraftData: false,
    readsProceduralPreviewDirectly: false,
    readsProceduralBakeDirectly: false,
    leaksEditorDraftData: false
  };
}

export function createRuntimeProjectionRecord(options: {
  readonly recordId: string;
  readonly recordType: RuntimeProjectionRecordType;
  readonly sourceId: string;
  readonly snapshotId?: string | null;
  readonly dataReference?: RuntimeProjectionDataReference;
  readonly uiDisplay?: RuntimeProjectionUiDisplayReference | null;
  readonly safetyFlags?: Partial<RuntimeProjectionSafetyFlags>;
}): RuntimeProjectionRecord {
  return {
    recordId: options.recordId,
    recordType: options.recordType,
    sourceId: options.sourceId,
    snapshotId: options.snapshotId ?? null,
    dataReference: options.dataReference ?? {
      source: "publish-snapshot-metadata",
      id: options.snapshotId ?? options.sourceId
    },
    uiDisplay: options.uiDisplay ?? null,
    safetyFlags: createRuntimeProjectionSafetyFlags(options.safetyFlags),
    runtimeReadable: true,
    rendererInstruction: null
  };
}

export function createRuntimeProjectionManifest(options: {
  readonly source: RuntimeProjectionSource;
  readonly createdAt: string;
  readonly manifestId?: string;
  readonly records?: readonly RuntimeProjectionRecord[];
  readonly safetyFlags?: Partial<RuntimeProjectionSafetyFlags>;
}): RuntimeProjectionManifest {
  const records = options.records ?? [];
  const sourceSnapshotId = options.source.snapshot?.snapshotId ?? null;

  return {
    manifestId: options.manifestId ?? `runtime-projection:${sourceSnapshotId ?? options.source.sourceId}`,
    status: "manifest-ready",
    source: options.source,
    sourceSnapshotId,
    createdAt: options.createdAt,
    recordCount: records.length,
    records,
    safetyFlags: createRuntimeProjectionSafetyFlags(options.safetyFlags),
    runtimeReadable: true,
    rendererInstruction: null
  };
}

export function createRuntimeProjectionReadModel(options: {
  readonly manifest?: RuntimeProjectionManifest | null;
  readonly records?: readonly RuntimeProjectionRecord[];
} = {}): RuntimeProjectionReadModel {
  const manifest = options.manifest ?? null;
  const records = options.records ?? manifest?.records ?? [];

  return {
    status: manifest ? "runtime-readable" : "empty",
    manifest,
    records,
    emptyState: !manifest && records.length === 0,
    runtimeReadable: true,
    leaksEditorDraftData: false,
    containsConcreteGameContent: false,
    implementsRuntimeRenderer: false
  };
}

export function createRuntimeProjectionValidationResult(options: {
  readonly sourceId: string;
  readonly manifestId?: string | null;
  readonly issues?: readonly RuntimeProjectionValidationIssue[];
  readonly safetyFlags?: Partial<RuntimeProjectionSafetyFlags>;
}): RuntimeProjectionValidationResult {
  const issues = options.issues ?? [];
  const hasErrors = issues.some((candidate) => candidate.severity === "error");

  return {
    validationId: `runtime-projection-validation:${options.sourceId}`,
    sourceId: options.sourceId,
    manifestId: options.manifestId ?? null,
    status: hasErrors ? "projection-candidate" : "manifest-ready",
    valid: !hasErrors,
    gateResults: createRuntimeProjectionGateResults(issues),
    issues,
    safetyFlags: createRuntimeProjectionSafetyFlags(options.safetyFlags),
    implementsRuntimeRenderer: false,
    mutatesAssets: false,
    containsConcreteGameContent: false
  };
}

export function createRuntimeProjectionAuditEvent(options: {
  readonly action: RuntimeProjectionAuditEvent["action"];
  readonly createdAt: string;
  readonly actorScope: RuntimeProjectionAuditEvent["actorScope"];
  readonly actorEditorUserId?: string | null;
  readonly targetManifestId?: string | null;
  readonly eventId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): RuntimeProjectionAuditEvent {
  return {
    eventId: options.eventId ?? `${options.action}:${options.targetManifestId ?? "empty"}`,
    action: options.action,
    actorScope: options.actorScope,
    actorEditorUserId: options.actorEditorUserId ?? null,
    targetManifestId: options.targetManifestId ?? null,
    createdAt: options.createdAt,
    metadata: options.metadata ?? {},
    containsConcreteGameContent: false,
    implementsRuntimeRenderer: false,
    mutatesAssets: false
  };
}

function createRuntimeProjectionGateResults(
  issues: readonly RuntimeProjectionValidationIssue[]
): readonly RuntimeProjectionGateResult[] {
  return RUNTIME_PROJECTION_VALIDATION_GATES.map((gate) => {
    const gateIssues = issues.filter((issue) => issue.gate === gate);
    return {
      gate,
      status: gateIssues.some((issue) => issue.severity === "error")
        ? "fail"
        : gateIssues.length > 0 ? "warning" : "pass",
      issues: gateIssues
    };
  });
}
