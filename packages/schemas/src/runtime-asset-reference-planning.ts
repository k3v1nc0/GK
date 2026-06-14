import {
  createRuntimeSceneAssemblyPlan,
  type RuntimeSceneAssemblyDescriptor,
  type RuntimeSceneAssemblyPlan
} from "./runtime-scene-assembly.js";

export const RUNTIME_ASSET_REFERENCE_PLANNING_PHASE = "phase-15" as const;
export const RUNTIME_ASSET_REFERENCE_PLANNING_MARKER = "phase-15" as const;

export const RUNTIME_ASSET_REFERENCE_PLANNING_LIFECYCLE_STATES = ["booting", "empty", "planned", "ready", "error"] as const;
export const RUNTIME_ASSET_REFERENCE_PLANNING_STATUSES = RUNTIME_ASSET_REFERENCE_PLANNING_LIFECYCLE_STATES;

export const RUNTIME_ASSET_REFERENCE_PLANNING_VALIDATION_GATES = [
  "runtime-scene-plan-only",
  "no-editor-admin-routes",
  "no-editor-draft-data",
  "no-asset-loads",
  "no-asset-byte-fetch",
  "no-final-asset-role-mapping",
  "no-concrete-content",
  "no-hardcoded-runtime-values",
  "no-renderer-draw-calls",
  "no-gameplay-audio",
  "empty-asset-reference-plan",
  "safety-flags"
] as const;

export type RuntimeAssetReferencePlanningLifecycleState = (typeof RUNTIME_ASSET_REFERENCE_PLANNING_LIFECYCLE_STATES)[number];
export type RuntimeAssetReferencePlanningStatusValue = (typeof RUNTIME_ASSET_REFERENCE_PLANNING_STATUSES)[number];
export type RuntimeAssetReferencePlanningValidationGate = (typeof RUNTIME_ASSET_REFERENCE_PLANNING_VALIDATION_GATES)[number];
export type RuntimeAssetReferencePlanningValidationSeverity = "warning" | "error";

export interface RuntimeAssetReferenceSafetyFlags {
  readonly consumesRuntimeScenePlan: boolean;
  readonly producesAssetReferencePlan: boolean;
  readonly usesAssetMetadataOnly: boolean;
  readonly loadsAssets: boolean;
  readonly fetchesAssetBytes: boolean;
  readonly resolvesFinalAssetRoles: boolean;
  readonly rendersScene: boolean;
  readonly rendererDrawCalls: boolean;
  readonly implementsGameplay: boolean;
  readonly implementsMovement: boolean;
  readonly implementsCombat: boolean;
  readonly implementsAudioPlayback: boolean;
  readonly hardcodesWorld: boolean;
  readonly hardcodesCamera: boolean;
  readonly hardcodesLighting: boolean;
  readonly hardcodesHud: boolean;
  readonly hardcodesMinimap: boolean;
  readonly hardcodesContent: boolean;
  readonly mutatesAssets: boolean;
  readonly usesEditorDraftData: boolean;
  readonly usesEditorAdminRoutes: boolean;
}

export interface RuntimeAssetReferenceSource {
  readonly sourceKind: "runtime-scene-plan";
  readonly sourceId: string;
  readonly scenePlanId: string;
  readonly sceneDescriptorCount: number;
  readonly emptyScenePlan: boolean;
  readonly runtimeReadable: true;
  readonly leaksEditorDraftData: false;
  readonly containsConcreteGameContent: false;
  readonly rendersScene: false;
}

export interface RuntimeAssetReferenceDescriptor {
  readonly descriptorId: string;
  readonly descriptorKind: "scene-descriptor-asset-reference-metadata";
  readonly sourceSceneDescriptorId: string;
  readonly sourceRecordId: string;
  readonly sourceRecordType: RuntimeSceneAssemblyDescriptor["sourceRecordType"];
  readonly dataReferenceId: string;
  readonly candidateCount: number;
  readonly metadataOnly: true;
  readonly finalAssetRole: null;
  readonly assetLoadUrl: null;
  readonly assetByteUrl: null;
  readonly rendererInstruction: null;
  readonly containsConcreteGameContent: false;
  readonly loadsAssets: false;
  readonly fetchesAssetBytes: false;
  readonly resolvesFinalAssetRoles: false;
  readonly rendersScene: false;
}

export interface RuntimeAssetReferenceCandidate {
  readonly candidateId: string;
  readonly descriptorId: string;
  readonly sourceSceneDescriptorId: string;
  readonly candidateKind: "metadata-reference-candidate";
  readonly metadataReferenceId: string;
  readonly assetLibraryId: null;
  readonly assetRoleHint: null;
  readonly finalAssetRole: null;
  readonly assetLoadUrl: null;
  readonly assetByteUrl: null;
  readonly metadataOnly: true;
  readonly loadsAssets: false;
  readonly fetchesAssetBytes: false;
  readonly resolvesFinalAssetRoles: false;
}

export interface RuntimeAssetReferenceErrorState {
  readonly code:
    | "runtime_scene_plan_unavailable"
    | "asset_reference_plan_contract_violation"
    | "asset_reference_descriptor_rejected";
  readonly message: string;
  readonly sourceId: string | null;
  readonly safeForDisplay: true;
  readonly containsSecret: false;
}

export interface RuntimeAssetReferencePlanningStatus {
  readonly phase: typeof RUNTIME_ASSET_REFERENCE_PLANNING_PHASE;
  readonly marker: typeof RUNTIME_ASSET_REFERENCE_PLANNING_MARKER;
  readonly lifecycle: RuntimeAssetReferencePlanningLifecycleState;
  readonly status: RuntimeAssetReferencePlanningStatusValue;
  readonly emptyAssetReferencePlan: boolean;
  readonly sceneDescriptorCount: number;
  readonly descriptorCount: number;
  readonly candidateCount: number;
  readonly serverSideValidated: false;
}

export interface RuntimeAssetReferencePlan {
  readonly phase: typeof RUNTIME_ASSET_REFERENCE_PLANNING_PHASE;
  readonly planId: string;
  readonly source: RuntimeAssetReferenceSource;
  readonly lifecycle: RuntimeAssetReferencePlanningLifecycleState;
  readonly emptyAssetReferencePlan: boolean;
  readonly sceneDescriptorCount: number;
  readonly descriptorCount: number;
  readonly candidateCount: number;
  readonly descriptors: readonly RuntimeAssetReferenceDescriptor[];
  readonly candidates: readonly RuntimeAssetReferenceCandidate[];
  readonly safetyFlags: RuntimeAssetReferenceSafetyFlags;
  readonly consumesRuntimeScenePlan: true;
  readonly producesAssetReferencePlan: true;
  readonly usesAssetMetadataOnly: true;
  readonly loadsAssets: false;
  readonly fetchesAssetBytes: false;
  readonly resolvesFinalAssetRoles: false;
  readonly rendersScene: false;
  readonly rendererDrawCalls: false;
  readonly implementsGameplay: false;
  readonly implementsAudioPlayback: false;
}

export interface RuntimeAssetReferencePlanningState {
  readonly phase: typeof RUNTIME_ASSET_REFERENCE_PLANNING_PHASE;
  readonly marker: typeof RUNTIME_ASSET_REFERENCE_PLANNING_MARKER;
  readonly scenePlan: RuntimeSceneAssemblyPlan;
  readonly source: RuntimeAssetReferenceSource;
  readonly plan: RuntimeAssetReferencePlan;
  readonly status: RuntimeAssetReferencePlanningStatus;
  readonly safetyFlags: RuntimeAssetReferenceSafetyFlags;
  readonly errors: readonly RuntimeAssetReferenceErrorState[];
  readonly assetLoadUrls: readonly string[];
  readonly assetByteFetchUrls: readonly string[];
  readonly concreteContentIndicators: readonly string[];
  readonly hardcodedRuntimeValueIndicators: readonly string[];
  readonly rendererDrawCallIndicators: readonly string[];
  readonly finalAssetRoleIndicators: readonly string[];
  readonly serverSideValidated: false;
}

export interface RuntimeAssetReferencePlanningValidationIssue {
  readonly gate: RuntimeAssetReferencePlanningValidationGate;
  readonly path: string;
  readonly message: string;
  readonly severity: RuntimeAssetReferencePlanningValidationSeverity;
  readonly blocksAssetReferencePlanning: boolean;
}

export interface RuntimeAssetReferencePlanningGateResult {
  readonly gate: RuntimeAssetReferencePlanningValidationGate;
  readonly status: "pass" | "warning" | "fail";
  readonly issues: readonly RuntimeAssetReferencePlanningValidationIssue[];
}

export interface RuntimeAssetReferencePlanningValidationResult {
  readonly validationId: string;
  readonly valid: boolean;
  readonly gateResults: readonly RuntimeAssetReferencePlanningGateResult[];
  readonly issues: readonly RuntimeAssetReferencePlanningValidationIssue[];
  readonly safetyFlags: RuntimeAssetReferenceSafetyFlags;
  readonly consumesRuntimeScenePlan: true;
  readonly producesAssetReferencePlan: true;
  readonly usesAssetMetadataOnly: true;
  readonly loadsAssets: false;
  readonly fetchesAssetBytes: false;
  readonly resolvesFinalAssetRoles: false;
  readonly rendersScene: false;
  readonly rendererDrawCalls: false;
  readonly implementsGameplay: false;
  readonly implementsMovement: false;
  readonly implementsCombat: false;
  readonly implementsAudioPlayback: false;
  readonly hardcodesContent: false;
  readonly mutatesAssets: false;
}

export function createRuntimeAssetReferenceSafetyFlags(
  overrides: Partial<RuntimeAssetReferenceSafetyFlags> = {}
): RuntimeAssetReferenceSafetyFlags {
  return {
    consumesRuntimeScenePlan: true,
    producesAssetReferencePlan: true,
    usesAssetMetadataOnly: true,
    loadsAssets: false,
    fetchesAssetBytes: false,
    resolvesFinalAssetRoles: false,
    rendersScene: false,
    rendererDrawCalls: false,
    implementsGameplay: false,
    implementsMovement: false,
    implementsCombat: false,
    implementsAudioPlayback: false,
    hardcodesWorld: false,
    hardcodesCamera: false,
    hardcodesLighting: false,
    hardcodesHud: false,
    hardcodesMinimap: false,
    hardcodesContent: false,
    mutatesAssets: false,
    usesEditorDraftData: false,
    usesEditorAdminRoutes: false,
    ...overrides
  };
}

export function createRuntimeAssetReferenceSource(
  scenePlan: RuntimeSceneAssemblyPlan = createRuntimeSceneAssemblyPlan()
): RuntimeAssetReferenceSource {
  return {
    sourceKind: "runtime-scene-plan",
    sourceId: scenePlan.planId,
    scenePlanId: scenePlan.planId,
    sceneDescriptorCount: scenePlan.descriptorCount,
    emptyScenePlan: scenePlan.emptyScenePlan,
    runtimeReadable: true,
    leaksEditorDraftData: false,
    containsConcreteGameContent: false,
    rendersScene: false
  };
}

export function createRuntimeAssetReferenceDescriptor(
  sceneDescriptor: RuntimeSceneAssemblyDescriptor,
  index: number
): RuntimeAssetReferenceDescriptor {
  return {
    descriptorId: `asset-reference-descriptor:${sceneDescriptor.descriptorId}:${index}`,
    descriptorKind: "scene-descriptor-asset-reference-metadata",
    sourceSceneDescriptorId: sceneDescriptor.descriptorId,
    sourceRecordId: sceneDescriptor.sourceRecordId,
    sourceRecordType: sceneDescriptor.sourceRecordType,
    dataReferenceId: sceneDescriptor.dataReferenceId,
    candidateCount: 1,
    metadataOnly: true,
    finalAssetRole: null,
    assetLoadUrl: null,
    assetByteUrl: null,
    rendererInstruction: null,
    containsConcreteGameContent: false,
    loadsAssets: false,
    fetchesAssetBytes: false,
    resolvesFinalAssetRoles: false,
    rendersScene: false
  };
}

export function createRuntimeAssetReferenceCandidate(
  descriptor: RuntimeAssetReferenceDescriptor,
  index: number
): RuntimeAssetReferenceCandidate {
  return {
    candidateId: `asset-reference-candidate:${descriptor.sourceSceneDescriptorId}:${index}`,
    descriptorId: descriptor.descriptorId,
    sourceSceneDescriptorId: descriptor.sourceSceneDescriptorId,
    candidateKind: "metadata-reference-candidate",
    metadataReferenceId: descriptor.dataReferenceId,
    assetLibraryId: null,
    assetRoleHint: null,
    finalAssetRole: null,
    assetLoadUrl: null,
    assetByteUrl: null,
    metadataOnly: true,
    loadsAssets: false,
    fetchesAssetBytes: false,
    resolvesFinalAssetRoles: false
  };
}

export function createRuntimeAssetReferenceErrorState(options: {
  readonly code: RuntimeAssetReferenceErrorState["code"];
  readonly message: string;
  readonly sourceId?: string | null;
}): RuntimeAssetReferenceErrorState {
  return {
    code: options.code,
    message: options.message,
    sourceId: options.sourceId ?? null,
    safeForDisplay: true,
    containsSecret: false
  };
}

export function createRuntimeAssetReferencePlan(options: {
  readonly source?: RuntimeAssetReferenceSource;
  readonly sceneDescriptors?: readonly RuntimeSceneAssemblyDescriptor[];
  readonly safetyFlags?: Partial<RuntimeAssetReferenceSafetyFlags>;
  readonly lifecycle?: RuntimeAssetReferencePlanningLifecycleState;
} = {}): RuntimeAssetReferencePlan {
  const sceneDescriptors = options.sceneDescriptors ?? [];
  const source = options.source ?? createRuntimeAssetReferenceSource();
  const descriptors = sceneDescriptors.map((descriptor, index) => createRuntimeAssetReferenceDescriptor(descriptor, index));
  const candidates = descriptors.map((descriptor, index) => createRuntimeAssetReferenceCandidate(descriptor, index));
  const emptyAssetReferencePlan = descriptors.length === 0;
  const lifecycle = options.lifecycle ?? (emptyAssetReferencePlan ? "empty" : "planned");

  return {
    phase: RUNTIME_ASSET_REFERENCE_PLANNING_PHASE,
    planId: emptyAssetReferencePlan ? "runtime-asset-reference-plan:empty" : `runtime-asset-reference-plan:${source.scenePlanId}`,
    source,
    lifecycle,
    emptyAssetReferencePlan,
    sceneDescriptorCount: sceneDescriptors.length,
    descriptorCount: descriptors.length,
    candidateCount: candidates.length,
    descriptors,
    candidates,
    safetyFlags: createRuntimeAssetReferenceSafetyFlags(options.safetyFlags),
    consumesRuntimeScenePlan: true,
    producesAssetReferencePlan: true,
    usesAssetMetadataOnly: true,
    loadsAssets: false,
    fetchesAssetBytes: false,
    resolvesFinalAssetRoles: false,
    rendersScene: false,
    rendererDrawCalls: false,
    implementsGameplay: false,
    implementsAudioPlayback: false
  };
}

export function createRuntimeAssetReferencePlanningStatus(options: {
  readonly lifecycle?: RuntimeAssetReferencePlanningLifecycleState;
  readonly emptyAssetReferencePlan?: boolean;
  readonly sceneDescriptorCount?: number;
  readonly descriptorCount?: number;
  readonly candidateCount?: number;
} = {}): RuntimeAssetReferencePlanningStatus {
  const lifecycle = options.lifecycle ?? "empty";
  return {
    phase: RUNTIME_ASSET_REFERENCE_PLANNING_PHASE,
    marker: RUNTIME_ASSET_REFERENCE_PLANNING_MARKER,
    lifecycle,
    status: lifecycle,
    emptyAssetReferencePlan: options.emptyAssetReferencePlan ?? lifecycle === "empty",
    sceneDescriptorCount: options.sceneDescriptorCount ?? 0,
    descriptorCount: options.descriptorCount ?? 0,
    candidateCount: options.candidateCount ?? 0,
    serverSideValidated: false
  };
}

export function createRuntimeAssetReferencePlanningState(options: {
  readonly scenePlan?: RuntimeSceneAssemblyPlan;
  readonly safetyFlags?: Partial<RuntimeAssetReferenceSafetyFlags>;
  readonly errors?: readonly RuntimeAssetReferenceErrorState[];
  readonly assetLoadUrls?: readonly string[];
  readonly assetByteFetchUrls?: readonly string[];
  readonly concreteContentIndicators?: readonly string[];
  readonly hardcodedRuntimeValueIndicators?: readonly string[];
  readonly rendererDrawCallIndicators?: readonly string[];
  readonly finalAssetRoleIndicators?: readonly string[];
} = {}): RuntimeAssetReferencePlanningState {
  const scenePlan = options.scenePlan ?? createRuntimeSceneAssemblyPlan();
  const source = createRuntimeAssetReferenceSource(scenePlan);
  const safetyFlags = createRuntimeAssetReferenceSafetyFlags(options.safetyFlags);
  const plan = createRuntimeAssetReferencePlan({ source, sceneDescriptors: scenePlan.descriptors, safetyFlags });

  return {
    phase: RUNTIME_ASSET_REFERENCE_PLANNING_PHASE,
    marker: RUNTIME_ASSET_REFERENCE_PLANNING_MARKER,
    scenePlan,
    source,
    plan,
    status: createRuntimeAssetReferencePlanningStatus({
      lifecycle: plan.lifecycle,
      emptyAssetReferencePlan: plan.emptyAssetReferencePlan,
      sceneDescriptorCount: plan.sceneDescriptorCount,
      descriptorCount: plan.descriptorCount,
      candidateCount: plan.candidateCount
    }),
    safetyFlags,
    errors: options.errors ?? [],
    assetLoadUrls: options.assetLoadUrls ?? [],
    assetByteFetchUrls: options.assetByteFetchUrls ?? [],
    concreteContentIndicators: options.concreteContentIndicators ?? [],
    hardcodedRuntimeValueIndicators: options.hardcodedRuntimeValueIndicators ?? [],
    rendererDrawCallIndicators: options.rendererDrawCallIndicators ?? [],
    finalAssetRoleIndicators: options.finalAssetRoleIndicators ?? [],
    serverSideValidated: false
  };
}

export function createRuntimeAssetReferencePlanningValidationResult(options: {
  readonly issues?: readonly RuntimeAssetReferencePlanningValidationIssue[];
  readonly safetyFlags?: Partial<RuntimeAssetReferenceSafetyFlags>;
} = {}): RuntimeAssetReferencePlanningValidationResult {
  const issues = options.issues ?? [];
  const hasErrors = issues.some((candidate) => candidate.severity === "error");
  const safetyFlags = createRuntimeAssetReferenceSafetyFlags(options.safetyFlags);

  return {
    validationId: "runtime-asset-reference-planning-validation:phase-15",
    valid: !hasErrors,
    gateResults: createRuntimeAssetReferencePlanningGateResults(issues),
    issues,
    safetyFlags,
    consumesRuntimeScenePlan: true,
    producesAssetReferencePlan: true,
    usesAssetMetadataOnly: true,
    loadsAssets: false,
    fetchesAssetBytes: false,
    resolvesFinalAssetRoles: false,
    rendersScene: false,
    rendererDrawCalls: false,
    implementsGameplay: false,
    implementsMovement: false,
    implementsCombat: false,
    implementsAudioPlayback: false,
    hardcodesContent: false,
    mutatesAssets: false
  };
}

export function isRuntimeAssetReferencePlanningLifecycleState(value: string): value is RuntimeAssetReferencePlanningLifecycleState {
  return (RUNTIME_ASSET_REFERENCE_PLANNING_LIFECYCLE_STATES as readonly string[]).includes(value);
}

function createRuntimeAssetReferencePlanningGateResults(
  issues: readonly RuntimeAssetReferencePlanningValidationIssue[]
): readonly RuntimeAssetReferencePlanningGateResult[] {
  return RUNTIME_ASSET_REFERENCE_PLANNING_VALIDATION_GATES.map((gate) => {
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
