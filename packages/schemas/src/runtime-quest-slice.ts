import type {
  RuntimeProjectionReadModel,
  RuntimeProjectionRecord
} from "./runtime-projection.js";

export const RUNTIME_QUEST_SLICE_PHASE = "phase-18" as const;
export const RUNTIME_QUEST_SLICE_MARKER = "phase-18" as const;

export const RUNTIME_QUEST_SLICE_LIFECYCLE_STATES = ["blocked", "ready", "error"] as const;

export const RUNTIME_QUEST_SLICE_RECORD_TYPES = [
  "quest.reference",
  "dialogue.reference",
  "objective.reference",
  "interactable.reference",
  "reward.reference",
  "unlock.reference",
  "checkpoint.reference",
  "asset-role.reference"
] as const;

export const RUNTIME_QUEST_SLICE_REQUIRED_RECORD_TYPES = RUNTIME_QUEST_SLICE_RECORD_TYPES;

export const RUNTIME_QUEST_SLICE_VALIDATION_GATES = [
  "published-quest-read-model-only",
  "no-editor-admin-routes",
  "no-editor-draft-data",
  "no-hardcoded-quest-content",
  "quest-state-machine",
  "dialogue-executor",
  "objective-executor",
  "interactable-contract",
  "reward-executor",
  "checkpoint-state",
  "asset-role-blockers",
  "save-load-state",
  "safety-flags"
] as const;

export type RuntimeQuestSliceLifecycleState = (typeof RUNTIME_QUEST_SLICE_LIFECYCLE_STATES)[number];
export type RuntimeQuestSliceStatusValue = RuntimeQuestSliceLifecycleState;
export type RuntimeQuestSliceRecordType = (typeof RUNTIME_QUEST_SLICE_RECORD_TYPES)[number];
export type RuntimeQuestSliceValidationGate = (typeof RUNTIME_QUEST_SLICE_VALIDATION_GATES)[number];
export type RuntimeQuestSliceValidationSeverity = "warning" | "error";

export interface RuntimeQuestSliceSafetyFlags {
  readonly consumesPublishedReadModel: boolean;
  readonly consumesRuntimeProjectionReadModel: boolean;
  readonly usesEditorAdminRoutes: boolean;
  readonly usesEditorDraftData: boolean;
  readonly readsDraftData: boolean;
  readonly hardcodesQuestContent: boolean;
  readonly containsConcreteQuestContent: boolean;
  readonly mutatesPublishedData: boolean;
  readonly loadsAssets: boolean;
  readonly fetchesAssetBytes: boolean;
  readonly resolvesFinalAssetRoles: boolean;
  readonly supportsNonVisualBlockedSlice: boolean;
  readonly exposesUnresolvedAssetRoleBlockers: boolean;
  readonly implementsQuestRuntime: boolean;
  readonly implementsDialogueRuntime: boolean;
  readonly implementsObjectiveRuntime: boolean;
  readonly implementsInteractableRuntime: boolean;
  readonly implementsRewardRuntime: boolean;
  readonly implementsCheckpointRuntime: boolean;
  readonly implementsSaveLoadState: boolean;
  readonly implementsCombat: boolean;
  readonly implementsEconomyRuntime: boolean;
  readonly implementsMovement: boolean;
  readonly implementsMultiplayer: boolean;
  readonly implementsAudioPlayback: boolean;
}

export interface RuntimeQuestSliceSource {
  readonly sourceKind: "published-quest-slice-read-model";
  readonly sourceId: string;
  readonly projectionManifestId: string | null;
  readonly projectionRecordCount: number;
  readonly questRecordCount: number;
  readonly dialogueRecordCount: number;
  readonly objectiveRecordCount: number;
  readonly interactableRecordCount: number;
  readonly rewardRecordCount: number;
  readonly unlockRecordCount: number;
  readonly checkpointRecordCount: number;
  readonly assetRoleRecordCount: number;
  readonly missingRequiredRecordTypes: readonly RuntimeQuestSliceRecordType[];
  readonly emptyPublishedReadModel: boolean;
  readonly runtimeReadable: true;
  readonly usesEditorAdminRoutes: false;
  readonly usesEditorDraftData: false;
  readonly leaksEditorDraftData: false;
  readonly hardcodesQuestContent: false;
  readonly containsConcreteQuestContent: false;
}

export interface RuntimeQuestSliceReadModelSummary {
  readonly recordCounts: Readonly<Record<RuntimeQuestSliceRecordType, number>>;
  readonly questRecordCount: number;
  readonly dialogueRecordCount: number;
  readonly objectiveRecordCount: number;
  readonly interactableRecordCount: number;
  readonly rewardRecordCount: number;
  readonly unlockRecordCount: number;
  readonly checkpointRecordCount: number;
  readonly assetRoleRecordCount: number;
  readonly missingRequiredRecordTypes: readonly RuntimeQuestSliceRecordType[];
  readonly hasAllRequiredRecordTypes: boolean;
}

export interface RuntimeQuestSliceAssetRoleBlocker {
  readonly blockerKind: "unresolved-asset-role";
  readonly assetRoleId: string;
  readonly recordId: string;
  readonly role: string;
  readonly requiredForPlayableSlice: boolean;
  readonly status: "unresolved";
  readonly reason: string;
  readonly blocksVisualSlice: true;
  readonly blocksRuntimeCompletion: true;
  readonly safeForDisplay: true;
  readonly containsSecret: false;
}

export interface RuntimeQuestStateMachine {
  readonly machineKind: "published-quest-state-machine";
  readonly status: "blocked" | "ready";
  readonly questRecordCount: number;
  readonly objectiveRecordCount: number;
  readonly mutatesViaExecutors: true;
  readonly allowsUiDirectMutation: false;
  readonly hardcodesQuestContent: false;
}

export interface RuntimeDialogueExecutor {
  readonly executorKind: "published-dialogue-tree-executor";
  readonly status: "blocked" | "ready";
  readonly dialogueRecordCount: number;
  readonly advancesByDialogueState: true;
  readonly usesSpeakerTiming: false;
  readonly hardcodesDialogueLines: false;
}

export interface RuntimeObjectiveEvaluator {
  readonly evaluatorKind: "published-objective-evaluator";
  readonly status: "blocked" | "ready";
  readonly objectiveRecordCount: number;
  readonly interactableRecordCount: number;
  readonly mutatesQuestState: true;
  readonly mutatesWorldDirectly: false;
  readonly allowsUiClickCompletion: false;
}

export interface RuntimeRewardApplicator {
  readonly applicatorKind: "published-reward-applicator";
  readonly status: "blocked" | "ready";
  readonly rewardRecordCount: number;
  readonly unlockRecordCount: number;
  readonly grantsFromPublishedDataOnly: true;
  readonly grantsUnconfirmedUnlocks: false;
  readonly mutatesPublishedData: false;
}

export interface RuntimeCheckpointFlow {
  readonly checkpointKind: "published-checkpoint-flow";
  readonly status: "blocked" | "ready";
  readonly checkpointRecordCount: number;
  readonly restoresRuntimeStateOnly: true;
  readonly hardcodesSpawnpoints: false;
}

export interface RuntimeQuestSliceSaveLoadState {
  readonly saveKind: "runtime-quest-slice-state-envelope";
  readonly status: "contract-ready" | "unavailable";
  readonly storage: "browser-local-storage" | "server-state-store-required";
  readonly key: string;
  readonly savesRuntimeStateOnly: true;
  readonly persistsSourceContent: false;
  readonly mutatesPublishedData: false;
}

export interface RuntimeQuestSliceDiagnostic {
  readonly code:
    | "published_quest_slice_missing"
    | "quest_slice_record_types_missing"
    | "unresolved_asset_roles"
    | "runtime_quest_slice_contract_violation";
  readonly message: string;
  readonly path: string;
  readonly severity: "info" | "warning" | "error";
  readonly blocksRuntimeQuestSlice: boolean;
  readonly safeForDisplay: true;
  readonly containsSecret: false;
}

export interface RuntimeQuestSliceStatus {
  readonly phase: typeof RUNTIME_QUEST_SLICE_PHASE;
  readonly marker: typeof RUNTIME_QUEST_SLICE_MARKER;
  readonly lifecycle: RuntimeQuestSliceLifecycleState;
  readonly status: RuntimeQuestSliceStatusValue;
  readonly blockedByMissingPublishedData: boolean;
  readonly blockedByUnresolvedAssetRoles: boolean;
  readonly nonVisualBlockedSlice: boolean;
  readonly diagnosticCount: number;
  readonly serverSideValidated: false;
}

export interface RuntimeQuestSliceState {
  readonly phase: typeof RUNTIME_QUEST_SLICE_PHASE;
  readonly marker: typeof RUNTIME_QUEST_SLICE_MARKER;
  readonly status: RuntimeQuestSliceStatus;
  readonly source: RuntimeQuestSliceSource;
  readonly readModelSummary: RuntimeQuestSliceReadModelSummary;
  readonly questStateMachine: RuntimeQuestStateMachine;
  readonly dialogueExecutor: RuntimeDialogueExecutor;
  readonly objectiveEvaluator: RuntimeObjectiveEvaluator;
  readonly rewardApplicator: RuntimeRewardApplicator;
  readonly checkpointFlow: RuntimeCheckpointFlow;
  readonly saveLoad: RuntimeQuestSliceSaveLoadState;
  readonly assetRoleBlockers: readonly RuntimeQuestSliceAssetRoleBlocker[];
  readonly diagnostics: readonly RuntimeQuestSliceDiagnostic[];
  readonly safetyFlags: RuntimeQuestSliceSafetyFlags;
  readonly editorRouteIndicators: readonly string[];
  readonly draftDataIndicators: readonly string[];
  readonly hardcodedQuestContentIndicators: readonly string[];
  readonly directUiMutationIndicators: readonly string[];
  readonly assetLoadUrls: readonly string[];
  readonly assetByteFetchUrls: readonly string[];
  readonly combatEconomyMovementIndicators: readonly string[];
  readonly serverSideValidated: false;
}

export interface RuntimeQuestSliceValidationIssue {
  readonly gate: RuntimeQuestSliceValidationGate;
  readonly path: string;
  readonly message: string;
  readonly severity: RuntimeQuestSliceValidationSeverity;
  readonly blocksRuntimeQuestSlice: boolean;
}

export interface RuntimeQuestSliceGateResult {
  readonly gate: RuntimeQuestSliceValidationGate;
  readonly status: "pass" | "warning" | "fail";
  readonly issues: readonly RuntimeQuestSliceValidationIssue[];
}

export interface RuntimeQuestSliceValidationResult {
  readonly validationId: string;
  readonly valid: boolean;
  readonly gateResults: readonly RuntimeQuestSliceGateResult[];
  readonly issues: readonly RuntimeQuestSliceValidationIssue[];
  readonly safetyFlags: RuntimeQuestSliceSafetyFlags;
  readonly consumesPublishedReadModel: true;
  readonly usesEditorAdminRoutes: false;
  readonly usesEditorDraftData: false;
  readonly hardcodesQuestContent: false;
  readonly mutatesPublishedData: false;
  readonly loadsAssets: false;
  readonly fetchesAssetBytes: false;
  readonly resolvesFinalAssetRoles: false;
  readonly supportsNonVisualBlockedSlice: true;
}

export function createRuntimeQuestSliceSafetyFlags(
  overrides: Partial<RuntimeQuestSliceSafetyFlags> = {}
): RuntimeQuestSliceSafetyFlags {
  return {
    consumesPublishedReadModel: true,
    consumesRuntimeProjectionReadModel: true,
    usesEditorAdminRoutes: false,
    usesEditorDraftData: false,
    readsDraftData: false,
    hardcodesQuestContent: false,
    containsConcreteQuestContent: false,
    mutatesPublishedData: false,
    loadsAssets: false,
    fetchesAssetBytes: false,
    resolvesFinalAssetRoles: false,
    supportsNonVisualBlockedSlice: true,
    exposesUnresolvedAssetRoleBlockers: true,
    implementsQuestRuntime: true,
    implementsDialogueRuntime: true,
    implementsObjectiveRuntime: true,
    implementsInteractableRuntime: true,
    implementsRewardRuntime: true,
    implementsCheckpointRuntime: true,
    implementsSaveLoadState: true,
    implementsCombat: false,
    implementsEconomyRuntime: false,
    implementsMovement: false,
    implementsMultiplayer: false,
    implementsAudioPlayback: false,
    ...overrides
  };
}

export function createRuntimeQuestSliceReadModelSummary(
  readModel: RuntimeProjectionReadModel | null = null
): RuntimeQuestSliceReadModelSummary {
  const counts = createEmptyRecordCounts();
  const records = readModel?.records ?? [];

  for (const record of records) {
    if (isRuntimeQuestSliceRecordType(record.recordType)) {
      counts[record.recordType] += 1;
    }
  }

  const missingRequiredRecordTypes = RUNTIME_QUEST_SLICE_REQUIRED_RECORD_TYPES.filter(
    (recordType) => counts[recordType] === 0
  );

  return {
    recordCounts: counts,
    questRecordCount: counts["quest.reference"],
    dialogueRecordCount: counts["dialogue.reference"],
    objectiveRecordCount: counts["objective.reference"],
    interactableRecordCount: counts["interactable.reference"],
    rewardRecordCount: counts["reward.reference"],
    unlockRecordCount: counts["unlock.reference"],
    checkpointRecordCount: counts["checkpoint.reference"],
    assetRoleRecordCount: counts["asset-role.reference"],
    missingRequiredRecordTypes,
    hasAllRequiredRecordTypes: missingRequiredRecordTypes.length === 0
  };
}

export function createRuntimeQuestSliceSource(options: {
  readonly readModel?: RuntimeProjectionReadModel | null;
  readonly summary?: RuntimeQuestSliceReadModelSummary;
} = {}): RuntimeQuestSliceSource {
  const readModel = options.readModel ?? null;
  const summary = options.summary ?? createRuntimeQuestSliceReadModelSummary(readModel);
  const projectionManifestId = readModel?.manifest?.manifestId ?? null;

  return {
    sourceKind: "published-quest-slice-read-model",
    sourceId: projectionManifestId ?? "published-quest-slice:empty",
    projectionManifestId,
    projectionRecordCount: readModel?.records.length ?? 0,
    questRecordCount: summary.questRecordCount,
    dialogueRecordCount: summary.dialogueRecordCount,
    objectiveRecordCount: summary.objectiveRecordCount,
    interactableRecordCount: summary.interactableRecordCount,
    rewardRecordCount: summary.rewardRecordCount,
    unlockRecordCount: summary.unlockRecordCount,
    checkpointRecordCount: summary.checkpointRecordCount,
    assetRoleRecordCount: summary.assetRoleRecordCount,
    missingRequiredRecordTypes: summary.missingRequiredRecordTypes,
    emptyPublishedReadModel: !projectionManifestId && (readModel?.records.length ?? 0) === 0,
    runtimeReadable: true,
    usesEditorAdminRoutes: false,
    usesEditorDraftData: false,
    leaksEditorDraftData: false,
    hardcodesQuestContent: false,
    containsConcreteQuestContent: false
  };
}

export function createRuntimeQuestSliceAssetRoleBlocker(options: {
  readonly assetRoleId: string;
  readonly recordId?: string;
  readonly role?: string;
  readonly requiredForPlayableSlice?: boolean;
  readonly reason?: string;
}): RuntimeQuestSliceAssetRoleBlocker {
  return {
    blockerKind: "unresolved-asset-role",
    assetRoleId: options.assetRoleId,
    recordId: options.recordId ?? options.assetRoleId,
    role: options.role ?? "asset role",
    requiredForPlayableSlice: options.requiredForPlayableSlice ?? true,
    status: "unresolved",
    reason: options.reason ?? "Published asset-role data exists but is not mapped to a definitive runtime asset.",
    blocksVisualSlice: true,
    blocksRuntimeCompletion: true,
    safeForDisplay: true,
    containsSecret: false
  };
}

export function createRuntimeQuestSliceState(options: {
  readonly runtimeProjectionReadModel?: RuntimeProjectionReadModel | null;
  readonly assetRoleBlockers?: readonly RuntimeQuestSliceAssetRoleBlocker[];
  readonly safetyFlags?: Partial<RuntimeQuestSliceSafetyFlags>;
  readonly diagnostics?: readonly RuntimeQuestSliceDiagnostic[];
  readonly editorRouteIndicators?: readonly string[];
  readonly draftDataIndicators?: readonly string[];
  readonly hardcodedQuestContentIndicators?: readonly string[];
  readonly directUiMutationIndicators?: readonly string[];
  readonly assetLoadUrls?: readonly string[];
  readonly assetByteFetchUrls?: readonly string[];
  readonly combatEconomyMovementIndicators?: readonly string[];
} = {}): RuntimeQuestSliceState {
  const readModel = options.runtimeProjectionReadModel ?? null;
  const summary = createRuntimeQuestSliceReadModelSummary(readModel);
  const source = createRuntimeQuestSliceSource({ readModel, summary });
  const assetRoleBlockers = options.assetRoleBlockers ?? createDefaultAssetRoleBlockers(readModel, summary);
  const diagnostics = [
    ...createDefaultRuntimeQuestSliceDiagnostics(source, assetRoleBlockers),
    ...(options.diagnostics ?? [])
  ];
  const blocked = diagnostics.some((diagnostic) => diagnostic.blocksRuntimeQuestSlice);
  const lifecycle: RuntimeQuestSliceLifecycleState = blocked ? "blocked" : "ready";

  return {
    phase: RUNTIME_QUEST_SLICE_PHASE,
    marker: RUNTIME_QUEST_SLICE_MARKER,
    status: createRuntimeQuestSliceStatus({
      lifecycle,
      diagnosticCount: diagnostics.length,
      blockedByMissingPublishedData: source.emptyPublishedReadModel || source.missingRequiredRecordTypes.length > 0,
      blockedByUnresolvedAssetRoles: assetRoleBlockers.length > 0
    }),
    source,
    readModelSummary: summary,
    questStateMachine: createRuntimeQuestStateMachine(summary),
    dialogueExecutor: createRuntimeDialogueExecutor(summary),
    objectiveEvaluator: createRuntimeObjectiveEvaluator(summary),
    rewardApplicator: createRuntimeRewardApplicator(summary),
    checkpointFlow: createRuntimeCheckpointFlow(summary),
    saveLoad: createRuntimeQuestSliceSaveLoadState(source),
    assetRoleBlockers,
    diagnostics,
    safetyFlags: createRuntimeQuestSliceSafetyFlags(options.safetyFlags),
    editorRouteIndicators: options.editorRouteIndicators ?? [],
    draftDataIndicators: options.draftDataIndicators ?? [],
    hardcodedQuestContentIndicators: options.hardcodedQuestContentIndicators ?? [],
    directUiMutationIndicators: options.directUiMutationIndicators ?? [],
    assetLoadUrls: options.assetLoadUrls ?? [],
    assetByteFetchUrls: options.assetByteFetchUrls ?? [],
    combatEconomyMovementIndicators: options.combatEconomyMovementIndicators ?? [],
    serverSideValidated: false
  };
}

export function createRuntimeQuestSliceValidationResult(options: {
  readonly issues?: readonly RuntimeQuestSliceValidationIssue[];
  readonly safetyFlags?: Partial<RuntimeQuestSliceSafetyFlags>;
} = {}): RuntimeQuestSliceValidationResult {
  const issues = options.issues ?? [];
  const hasErrors = issues.some((candidate) => candidate.severity === "error");

  return {
    validationId: "runtime-quest-slice-validation:phase-18",
    valid: !hasErrors,
    gateResults: createRuntimeQuestSliceGateResults(issues),
    issues,
    safetyFlags: createRuntimeQuestSliceSafetyFlags(options.safetyFlags),
    consumesPublishedReadModel: true,
    usesEditorAdminRoutes: false,
    usesEditorDraftData: false,
    hardcodesQuestContent: false,
    mutatesPublishedData: false,
    loadsAssets: false,
    fetchesAssetBytes: false,
    resolvesFinalAssetRoles: false,
    supportsNonVisualBlockedSlice: true
  };
}

export function isRuntimeQuestSliceLifecycleState(value: string): value is RuntimeQuestSliceLifecycleState {
  return (RUNTIME_QUEST_SLICE_LIFECYCLE_STATES as readonly string[]).includes(value);
}

export function isRuntimeQuestSliceRecordType(value: string): value is RuntimeQuestSliceRecordType {
  return (RUNTIME_QUEST_SLICE_RECORD_TYPES as readonly string[]).includes(value);
}

export function getRuntimeQuestSliceRecords(
  readModel: RuntimeProjectionReadModel | null = null
): readonly RuntimeProjectionRecord[] {
  return (readModel?.records ?? []).filter((record) => isRuntimeQuestSliceRecordType(record.recordType));
}

function createRuntimeQuestSliceStatus(options: {
  readonly lifecycle: RuntimeQuestSliceLifecycleState;
  readonly diagnosticCount: number;
  readonly blockedByMissingPublishedData: boolean;
  readonly blockedByUnresolvedAssetRoles: boolean;
}): RuntimeQuestSliceStatus {
  return {
    phase: RUNTIME_QUEST_SLICE_PHASE,
    marker: RUNTIME_QUEST_SLICE_MARKER,
    lifecycle: options.lifecycle,
    status: options.lifecycle,
    blockedByMissingPublishedData: options.blockedByMissingPublishedData,
    blockedByUnresolvedAssetRoles: options.blockedByUnresolvedAssetRoles,
    nonVisualBlockedSlice: options.blockedByUnresolvedAssetRoles,
    diagnosticCount: options.diagnosticCount,
    serverSideValidated: false
  };
}

function createRuntimeQuestStateMachine(summary: RuntimeQuestSliceReadModelSummary): RuntimeQuestStateMachine {
  const status = summary.questRecordCount > 0 && summary.objectiveRecordCount > 0 ? "ready" : "blocked";

  return {
    machineKind: "published-quest-state-machine",
    status,
    questRecordCount: summary.questRecordCount,
    objectiveRecordCount: summary.objectiveRecordCount,
    mutatesViaExecutors: true,
    allowsUiDirectMutation: false,
    hardcodesQuestContent: false
  };
}

function createRuntimeDialogueExecutor(summary: RuntimeQuestSliceReadModelSummary): RuntimeDialogueExecutor {
  return {
    executorKind: "published-dialogue-tree-executor",
    status: summary.dialogueRecordCount > 0 ? "ready" : "blocked",
    dialogueRecordCount: summary.dialogueRecordCount,
    advancesByDialogueState: true,
    usesSpeakerTiming: false,
    hardcodesDialogueLines: false
  };
}

function createRuntimeObjectiveEvaluator(summary: RuntimeQuestSliceReadModelSummary): RuntimeObjectiveEvaluator {
  return {
    evaluatorKind: "published-objective-evaluator",
    status: summary.objectiveRecordCount > 0 && summary.interactableRecordCount > 0 ? "ready" : "blocked",
    objectiveRecordCount: summary.objectiveRecordCount,
    interactableRecordCount: summary.interactableRecordCount,
    mutatesQuestState: true,
    mutatesWorldDirectly: false,
    allowsUiClickCompletion: false
  };
}

function createRuntimeRewardApplicator(summary: RuntimeQuestSliceReadModelSummary): RuntimeRewardApplicator {
  return {
    applicatorKind: "published-reward-applicator",
    status: summary.rewardRecordCount > 0 && summary.unlockRecordCount > 0 ? "ready" : "blocked",
    rewardRecordCount: summary.rewardRecordCount,
    unlockRecordCount: summary.unlockRecordCount,
    grantsFromPublishedDataOnly: true,
    grantsUnconfirmedUnlocks: false,
    mutatesPublishedData: false
  };
}

function createRuntimeCheckpointFlow(summary: RuntimeQuestSliceReadModelSummary): RuntimeCheckpointFlow {
  return {
    checkpointKind: "published-checkpoint-flow",
    status: summary.checkpointRecordCount > 0 ? "ready" : "blocked",
    checkpointRecordCount: summary.checkpointRecordCount,
    restoresRuntimeStateOnly: true,
    hardcodesSpawnpoints: false
  };
}

function createRuntimeQuestSliceSaveLoadState(source: RuntimeQuestSliceSource): RuntimeQuestSliceSaveLoadState {
  return {
    saveKind: "runtime-quest-slice-state-envelope",
    status: "contract-ready",
    storage: "browser-local-storage",
    key: `gk.runtime-quest-slice:${source.projectionManifestId ?? "empty"}`,
    savesRuntimeStateOnly: true,
    persistsSourceContent: false,
    mutatesPublishedData: false
  };
}

function createDefaultAssetRoleBlockers(
  readModel: RuntimeProjectionReadModel | null,
  summary: RuntimeQuestSliceReadModelSummary
): readonly RuntimeQuestSliceAssetRoleBlocker[] {
  if (summary.assetRoleRecordCount > 0) {
    return (readModel?.records ?? [])
      .filter((record) => record.recordType === "asset-role.reference")
      .map((record, index) => createRuntimeQuestSliceAssetRoleBlocker({
        assetRoleId: record.dataReference.id,
        recordId: record.recordId,
        role: `published asset role ${index + 1}`,
        reason: "Published asset-role data exists but remains unresolved for the non-visual Fase 18 slice."
      }));
  }

  return [
    createRuntimeQuestSliceAssetRoleBlocker({
      assetRoleId: "asset-role.records",
      recordId: "asset-role.reference:missing",
      role: "published asset-role records",
      reason: "Published asset-role records are required before Fase 18 can claim a visual playable slice."
    })
  ];
}

function createDefaultRuntimeQuestSliceDiagnostics(
  source: RuntimeQuestSliceSource,
  assetRoleBlockers: readonly RuntimeQuestSliceAssetRoleBlocker[]
): readonly RuntimeQuestSliceDiagnostic[] {
  const diagnostics: RuntimeQuestSliceDiagnostic[] = [];

  if (source.emptyPublishedReadModel || !source.projectionManifestId) {
    diagnostics.push(createRuntimeQuestSliceDiagnostic({
      code: "published_quest_slice_missing",
      message: "No published quest-slice runtime manifest is available for Fase 18.",
      path: "source.projectionManifestId"
    }));
  }

  if (source.missingRequiredRecordTypes.length > 0) {
    diagnostics.push(createRuntimeQuestSliceDiagnostic({
      code: "quest_slice_record_types_missing",
      message: `Published quest-slice records are incomplete: ${source.missingRequiredRecordTypes.join(", ")}.`,
      path: "source.missingRequiredRecordTypes"
    }));
  }

  if (assetRoleBlockers.length > 0) {
    diagnostics.push(createRuntimeQuestSliceDiagnostic({
      code: "unresolved_asset_roles",
      message: "Fase 18 is allowed to run as a non-visual blocked slice because asset roles are unresolved.",
      path: "assetRoleBlockers",
      severity: "warning"
    }));
  }

  return diagnostics;
}

function createRuntimeQuestSliceDiagnostic(options: {
  readonly code: RuntimeQuestSliceDiagnostic["code"];
  readonly message: string;
  readonly path: string;
  readonly severity?: RuntimeQuestSliceDiagnostic["severity"];
  readonly blocksRuntimeQuestSlice?: boolean;
}): RuntimeQuestSliceDiagnostic {
  return {
    code: options.code,
    message: options.message,
    path: options.path,
    severity: options.severity ?? "error",
    blocksRuntimeQuestSlice: options.blocksRuntimeQuestSlice ?? true,
    safeForDisplay: true,
    containsSecret: false
  };
}

function createRuntimeQuestSliceGateResults(
  issues: readonly RuntimeQuestSliceValidationIssue[]
): readonly RuntimeQuestSliceGateResult[] {
  return RUNTIME_QUEST_SLICE_VALIDATION_GATES.map((gate) => {
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

function createEmptyRecordCounts(): Record<RuntimeQuestSliceRecordType, number> {
  return Object.fromEntries(
    RUNTIME_QUEST_SLICE_RECORD_TYPES.map((recordType) => [recordType, 0])
  ) as Record<RuntimeQuestSliceRecordType, number>;
}
