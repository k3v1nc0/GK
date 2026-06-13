import type {
  RuntimeProjectionReadModel,
  RuntimeProjectionRecord,
  RuntimeProjectionRecordType,
  RuntimeProjectionStatus
} from "./runtime-projection.js";
import {
  RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
  type RuntimeClientProjectionReadRoute
} from "./runtime-client-shell.js";

export const RUNTIME_SCENE_ASSEMBLY_PHASE = "phase-14" as const;
export const RUNTIME_SCENE_ASSEMBLY_MARKER = "phase-14" as const;

export const RUNTIME_SCENE_ASSEMBLY_LIFECYCLE_STATES = ["booting", "empty", "planned", "ready", "error"] as const;
export const RUNTIME_SCENE_ASSEMBLY_STATUSES = RUNTIME_SCENE_ASSEMBLY_LIFECYCLE_STATES;

export const RUNTIME_SCENE_ASSEMBLY_VALIDATION_GATES = [
  "runtime-projection-records-only",
  "no-editor-admin-routes",
  "no-editor-draft-data",
  "no-asset-loads",
  "no-final-asset-role-mapping",
  "no-concrete-content",
  "no-hardcoded-runtime-values",
  "no-renderer-draw-calls",
  "no-gameplay-audio",
  "empty-scene-plan",
  "safety-flags"
] as const;

export type RuntimeSceneAssemblyLifecycleState = (typeof RUNTIME_SCENE_ASSEMBLY_LIFECYCLE_STATES)[number];
export type RuntimeSceneAssemblyStatusValue = (typeof RUNTIME_SCENE_ASSEMBLY_STATUSES)[number];
export type RuntimeSceneAssemblyValidationGate = (typeof RUNTIME_SCENE_ASSEMBLY_VALIDATION_GATES)[number];
export type RuntimeSceneAssemblyValidationSeverity = "warning" | "error";

export interface RuntimeSceneAssemblySafetyFlags {
  readonly consumesRuntimeProjectionRecords: boolean;
  readonly producesScenePlan: boolean;
  readonly loadsAssets: boolean;
  readonly assetLoadUrls: boolean;
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

export interface RuntimeSceneAssemblySource {
  readonly sourceKind: "runtime-projection-read-model";
  readonly sourceId: string;
  readonly projectionRoutes: readonly RuntimeClientProjectionReadRoute[];
  readonly readModelStatus: RuntimeProjectionStatus;
  readonly recordCount: number;
  readonly emptyState: boolean;
  readonly runtimeReadable: true;
  readonly leaksEditorDraftData: false;
  readonly containsConcreteGameContent: false;
}

export interface RuntimeSceneAssemblyDescriptor {
  readonly descriptorId: string;
  readonly descriptorKind: "projection-record-metadata";
  readonly sourceRecordId: string;
  readonly sourceRecordType: RuntimeProjectionRecordType;
  readonly sourceId: string;
  readonly snapshotId: string | null;
  readonly dataReferenceId: string;
  readonly uiDisplayMetadataOnly: boolean;
  readonly assetRoleFinalized: false;
  readonly assetLoadUrl: null;
  readonly rendererInstruction: null;
  readonly containsConcreteGameContent: false;
  readonly loadsAssets: false;
  readonly rendersScene: false;
}

export interface RuntimeSceneAssemblyNode {
  readonly nodeId: string;
  readonly descriptorId: string;
  readonly nodeKind: "scene-plan-metadata-node";
  readonly sourceRecordId: string;
  readonly childNodeIds: readonly string[];
  readonly finalAssetRole: null;
  readonly rendererInstruction: null;
  readonly concretePayload: null;
  readonly loadsAssets: false;
  readonly rendersScene: false;
}

export interface RuntimeSceneAssemblyErrorState {
  readonly code:
    | "runtime_projection_unavailable"
    | "scene_plan_contract_violation"
    | "scene_descriptor_rejected";
  readonly message: string;
  readonly route: RuntimeClientProjectionReadRoute | null;
  readonly safeForDisplay: true;
  readonly containsSecret: false;
}

export interface RuntimeSceneAssemblyStatus {
  readonly phase: typeof RUNTIME_SCENE_ASSEMBLY_PHASE;
  readonly marker: typeof RUNTIME_SCENE_ASSEMBLY_MARKER;
  readonly lifecycle: RuntimeSceneAssemblyLifecycleState;
  readonly status: RuntimeSceneAssemblyStatusValue;
  readonly emptyScenePlan: boolean;
  readonly recordCount: number;
  readonly descriptorCount: number;
  readonly serverSideValidated: false;
}

export interface RuntimeSceneAssemblyPlan {
  readonly phase: typeof RUNTIME_SCENE_ASSEMBLY_PHASE;
  readonly planId: string;
  readonly source: RuntimeSceneAssemblySource;
  readonly lifecycle: RuntimeSceneAssemblyLifecycleState;
  readonly emptyScenePlan: boolean;
  readonly recordCount: number;
  readonly descriptorCount: number;
  readonly descriptors: readonly RuntimeSceneAssemblyDescriptor[];
  readonly nodes: readonly RuntimeSceneAssemblyNode[];
  readonly safetyFlags: RuntimeSceneAssemblySafetyFlags;
  readonly producesScenePlan: true;
  readonly loadsAssets: false;
  readonly resolvesFinalAssetRoles: false;
  readonly rendersScene: false;
  readonly implementsGameplay: false;
  readonly implementsAudioPlayback: false;
}

export interface RuntimeSceneAssemblyState {
  readonly phase: typeof RUNTIME_SCENE_ASSEMBLY_PHASE;
  readonly marker: typeof RUNTIME_SCENE_ASSEMBLY_MARKER;
  readonly projectionRoutes: readonly RuntimeClientProjectionReadRoute[];
  readonly projectionReadModel: RuntimeProjectionReadModel | null;
  readonly source: RuntimeSceneAssemblySource;
  readonly plan: RuntimeSceneAssemblyPlan;
  readonly status: RuntimeSceneAssemblyStatus;
  readonly safetyFlags: RuntimeSceneAssemblySafetyFlags;
  readonly errors: readonly RuntimeSceneAssemblyErrorState[];
  readonly assetLoadUrls: readonly string[];
  readonly concreteContentIndicators: readonly string[];
  readonly hardcodedRuntimeValueIndicators: readonly string[];
  readonly rendererDrawCallIndicators: readonly string[];
  readonly finalAssetRoleIndicators: readonly string[];
  readonly serverSideValidated: false;
}

export interface RuntimeSceneAssemblyValidationIssue {
  readonly gate: RuntimeSceneAssemblyValidationGate;
  readonly path: string;
  readonly message: string;
  readonly severity: RuntimeSceneAssemblyValidationSeverity;
  readonly blocksSceneAssembly: boolean;
}

export interface RuntimeSceneAssemblyGateResult {
  readonly gate: RuntimeSceneAssemblyValidationGate;
  readonly status: "pass" | "warning" | "fail";
  readonly issues: readonly RuntimeSceneAssemblyValidationIssue[];
}

export interface RuntimeSceneAssemblyValidationResult {
  readonly validationId: string;
  readonly valid: boolean;
  readonly gateResults: readonly RuntimeSceneAssemblyGateResult[];
  readonly issues: readonly RuntimeSceneAssemblyValidationIssue[];
  readonly safetyFlags: RuntimeSceneAssemblySafetyFlags;
  readonly consumesRuntimeProjectionRecords: true;
  readonly producesScenePlan: true;
  readonly loadsAssets: false;
  readonly resolvesFinalAssetRoles: false;
  readonly rendersScene: false;
  readonly implementsGameplay: false;
  readonly implementsMovement: false;
  readonly implementsCombat: false;
  readonly implementsAudioPlayback: false;
  readonly hardcodesContent: false;
  readonly mutatesAssets: false;
}

export function createRuntimeSceneAssemblySafetyFlags(
  overrides: Partial<RuntimeSceneAssemblySafetyFlags> = {}
): RuntimeSceneAssemblySafetyFlags {
  return {
    consumesRuntimeProjectionRecords: true,
    producesScenePlan: true,
    loadsAssets: false,
    assetLoadUrls: false,
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

export function createRuntimeSceneAssemblySource(
  readModel: RuntimeProjectionReadModel | null = null,
  projectionRoutes: readonly RuntimeClientProjectionReadRoute[] = RUNTIME_CLIENT_PROJECTION_READ_ROUTES
): RuntimeSceneAssemblySource {
  const records = readModel?.records ?? [];
  return {
    sourceKind: "runtime-projection-read-model",
    sourceId: readModel?.manifest?.manifestId ?? "runtime-projection-empty",
    projectionRoutes,
    readModelStatus: readModel?.status ?? "empty",
    recordCount: records.length,
    emptyState: readModel?.emptyState ?? records.length === 0,
    runtimeReadable: true,
    leaksEditorDraftData: false,
    containsConcreteGameContent: false
  };
}

export function createRuntimeSceneAssemblyDescriptor(
  record: RuntimeProjectionRecord,
  index: number
): RuntimeSceneAssemblyDescriptor {
  return {
    descriptorId: `scene-descriptor:${record.recordId}:${index}`,
    descriptorKind: "projection-record-metadata",
    sourceRecordId: record.recordId,
    sourceRecordType: record.recordType,
    sourceId: record.sourceId,
    snapshotId: record.snapshotId,
    dataReferenceId: record.dataReference.id,
    uiDisplayMetadataOnly: record.uiDisplay !== null,
    assetRoleFinalized: false,
    assetLoadUrl: null,
    rendererInstruction: null,
    containsConcreteGameContent: false,
    loadsAssets: false,
    rendersScene: false
  };
}

export function createRuntimeSceneAssemblyNode(
  descriptor: RuntimeSceneAssemblyDescriptor,
  index: number
): RuntimeSceneAssemblyNode {
  return {
    nodeId: `scene-plan-node:${descriptor.sourceRecordId}:${index}`,
    descriptorId: descriptor.descriptorId,
    nodeKind: "scene-plan-metadata-node",
    sourceRecordId: descriptor.sourceRecordId,
    childNodeIds: [],
    finalAssetRole: null,
    rendererInstruction: null,
    concretePayload: null,
    loadsAssets: false,
    rendersScene: false
  };
}

export function createRuntimeSceneAssemblyErrorState(options: {
  readonly code: RuntimeSceneAssemblyErrorState["code"];
  readonly message: string;
  readonly route?: RuntimeClientProjectionReadRoute | null;
}): RuntimeSceneAssemblyErrorState {
  return {
    code: options.code,
    message: options.message,
    route: options.route ?? null,
    safeForDisplay: true,
    containsSecret: false
  };
}

export function createRuntimeSceneAssemblyPlan(options: {
  readonly source?: RuntimeSceneAssemblySource;
  readonly records?: readonly RuntimeProjectionRecord[];
  readonly safetyFlags?: Partial<RuntimeSceneAssemblySafetyFlags>;
  readonly lifecycle?: RuntimeSceneAssemblyLifecycleState;
} = {}): RuntimeSceneAssemblyPlan {
  const records = options.records ?? [];
  const source = options.source ?? createRuntimeSceneAssemblySource();
  const descriptors = records.map((record, index) => createRuntimeSceneAssemblyDescriptor(record, index));
  const nodes = descriptors.map((descriptor, index) => createRuntimeSceneAssemblyNode(descriptor, index));
  const emptyScenePlan = records.length === 0;
  const lifecycle = options.lifecycle ?? (emptyScenePlan ? "empty" : "planned");

  return {
    phase: RUNTIME_SCENE_ASSEMBLY_PHASE,
    planId: emptyScenePlan ? "runtime-scene-plan:empty" : `runtime-scene-plan:${source.sourceId}`,
    source,
    lifecycle,
    emptyScenePlan,
    recordCount: records.length,
    descriptorCount: descriptors.length,
    descriptors,
    nodes,
    safetyFlags: createRuntimeSceneAssemblySafetyFlags(options.safetyFlags),
    producesScenePlan: true,
    loadsAssets: false,
    resolvesFinalAssetRoles: false,
    rendersScene: false,
    implementsGameplay: false,
    implementsAudioPlayback: false
  };
}

export function createRuntimeSceneAssemblyStatus(options: {
  readonly lifecycle?: RuntimeSceneAssemblyLifecycleState;
  readonly emptyScenePlan?: boolean;
  readonly recordCount?: number;
  readonly descriptorCount?: number;
} = {}): RuntimeSceneAssemblyStatus {
  const lifecycle = options.lifecycle ?? "empty";
  return {
    phase: RUNTIME_SCENE_ASSEMBLY_PHASE,
    marker: RUNTIME_SCENE_ASSEMBLY_MARKER,
    lifecycle,
    status: lifecycle,
    emptyScenePlan: options.emptyScenePlan ?? lifecycle === "empty",
    recordCount: options.recordCount ?? 0,
    descriptorCount: options.descriptorCount ?? 0,
    serverSideValidated: false
  };
}

export function createRuntimeSceneAssemblyState(options: {
  readonly projectionRoutes?: readonly RuntimeClientProjectionReadRoute[];
  readonly projectionReadModel?: RuntimeProjectionReadModel | null;
  readonly safetyFlags?: Partial<RuntimeSceneAssemblySafetyFlags>;
  readonly errors?: readonly RuntimeSceneAssemblyErrorState[];
  readonly assetLoadUrls?: readonly string[];
  readonly concreteContentIndicators?: readonly string[];
  readonly hardcodedRuntimeValueIndicators?: readonly string[];
  readonly rendererDrawCallIndicators?: readonly string[];
  readonly finalAssetRoleIndicators?: readonly string[];
} = {}): RuntimeSceneAssemblyState {
  const projectionRoutes = options.projectionRoutes ?? RUNTIME_CLIENT_PROJECTION_READ_ROUTES;
  const projectionReadModel = options.projectionReadModel ?? null;
  const records = projectionReadModel?.records ?? [];
  const source = createRuntimeSceneAssemblySource(projectionReadModel, projectionRoutes);
  const safetyFlags = createRuntimeSceneAssemblySafetyFlags(options.safetyFlags);
  const plan = createRuntimeSceneAssemblyPlan({ source, records, safetyFlags });

  return {
    phase: RUNTIME_SCENE_ASSEMBLY_PHASE,
    marker: RUNTIME_SCENE_ASSEMBLY_MARKER,
    projectionRoutes,
    projectionReadModel,
    source,
    plan,
    status: createRuntimeSceneAssemblyStatus({
      lifecycle: plan.lifecycle,
      emptyScenePlan: plan.emptyScenePlan,
      recordCount: plan.recordCount,
      descriptorCount: plan.descriptorCount
    }),
    safetyFlags,
    errors: options.errors ?? [],
    assetLoadUrls: options.assetLoadUrls ?? [],
    concreteContentIndicators: options.concreteContentIndicators ?? [],
    hardcodedRuntimeValueIndicators: options.hardcodedRuntimeValueIndicators ?? [],
    rendererDrawCallIndicators: options.rendererDrawCallIndicators ?? [],
    finalAssetRoleIndicators: options.finalAssetRoleIndicators ?? [],
    serverSideValidated: false
  };
}

export function createRuntimeSceneAssemblyValidationResult(options: {
  readonly issues?: readonly RuntimeSceneAssemblyValidationIssue[];
  readonly safetyFlags?: Partial<RuntimeSceneAssemblySafetyFlags>;
} = {}): RuntimeSceneAssemblyValidationResult {
  const issues = options.issues ?? [];
  const hasErrors = issues.some((candidate) => candidate.severity === "error");
  const safetyFlags = createRuntimeSceneAssemblySafetyFlags(options.safetyFlags);

  return {
    validationId: "runtime-scene-assembly-validation:phase-14",
    valid: !hasErrors,
    gateResults: createRuntimeSceneAssemblyGateResults(issues),
    issues,
    safetyFlags,
    consumesRuntimeProjectionRecords: true,
    producesScenePlan: true,
    loadsAssets: false,
    resolvesFinalAssetRoles: false,
    rendersScene: false,
    implementsGameplay: false,
    implementsMovement: false,
    implementsCombat: false,
    implementsAudioPlayback: false,
    hardcodesContent: false,
    mutatesAssets: false
  };
}

export function isRuntimeSceneAssemblyLifecycleState(value: string): value is RuntimeSceneAssemblyLifecycleState {
  return (RUNTIME_SCENE_ASSEMBLY_LIFECYCLE_STATES as readonly string[]).includes(value);
}

function createRuntimeSceneAssemblyGateResults(
  issues: readonly RuntimeSceneAssemblyValidationIssue[]
): readonly RuntimeSceneAssemblyGateResult[] {
  return RUNTIME_SCENE_ASSEMBLY_VALIDATION_GATES.map((gate) => {
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
