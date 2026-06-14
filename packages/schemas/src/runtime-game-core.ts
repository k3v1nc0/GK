import type {
  RuntimeProjectionReadModel,
  RuntimeProjectionRecord
} from "./runtime-projection.js";
import {
  RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
  type RuntimeClientProjectionReadRoute
} from "./runtime-client-shell.js";
import {
  createRuntimeAssetReferencePlanningState,
  type RuntimeAssetReferencePlanningState
} from "./runtime-asset-reference-planning.js";

export const RUNTIME_GAME_CORE_PHASE = "phase-17" as const;
export const RUNTIME_GAME_CORE_MARKER = "phase-17" as const;

export const RUNTIME_GAME_CORE_LIFECYCLE_STATES = ["booting", "blocked", "ready", "error"] as const;
export const RUNTIME_GAME_CORE_STATUSES = RUNTIME_GAME_CORE_LIFECYCLE_STATES;

export const RUNTIME_GAME_CORE_VALIDATION_GATES = [
  "published-read-model-only",
  "runtime-asset-reference-plan-only",
  "no-editor-admin-routes",
  "no-editor-draft-data",
  "no-hidden-asset-loads",
  "no-hardcoded-content",
  "no-quest-combat-economy-multiplayer",
  "player-session-bootstrap",
  "input-adapter-boundary",
  "save-load-basis",
  "diagnostics",
  "safety-flags"
] as const;

export type RuntimeGameCoreLifecycleState = (typeof RUNTIME_GAME_CORE_LIFECYCLE_STATES)[number];
export type RuntimeGameCoreStatusValue = (typeof RUNTIME_GAME_CORE_STATUSES)[number];
export type RuntimeGameCoreValidationGate = (typeof RUNTIME_GAME_CORE_VALIDATION_GATES)[number];
export type RuntimeGameCoreValidationSeverity = "warning" | "error";

export interface RuntimeGameCoreSafetyFlags {
  readonly consumesPublishedReadModel: boolean;
  readonly consumesRuntimeProjectionReadModel: boolean;
  readonly consumesRuntimeAssetReferencePlan: boolean;
  readonly bootsRuntimeGame: boolean;
  readonly usesEditorAdminRoutes: boolean;
  readonly usesEditorDraftData: boolean;
  readonly readsDraftData: boolean;
  readonly loadsAssets: boolean;
  readonly fetchesAssetBytes: boolean;
  readonly resolvesFinalAssetRoles: boolean;
  readonly rendersConcreteWorld: boolean;
  readonly rendererDrawCalls: boolean;
  readonly implementsQuestRuntime: boolean;
  readonly implementsDialogueRuntime: boolean;
  readonly implementsEconomyRuntime: boolean;
  readonly implementsCombat: boolean;
  readonly implementsMovement: boolean;
  readonly implementsMultiplayer: boolean;
  readonly implementsAudioPlayback: boolean;
  readonly hardcodesWorld: boolean;
  readonly hardcodesCamera: boolean;
  readonly hardcodesLighting: boolean;
  readonly hardcodesHud: boolean;
  readonly hardcodesMinimap: boolean;
  readonly hardcodesAudio: boolean;
  readonly hardcodesContent: boolean;
  readonly mutatesAssets: boolean;
  readonly mutatesPublishedData: boolean;
  readonly hasPlayerSessionBootstrap: boolean;
  readonly hasInputAdapter: boolean;
  readonly hasSaveLoadBasis: boolean;
  readonly persistsConcreteContent: boolean;
}

export interface RuntimeGamePublishedBuildSource {
  readonly sourceKind: "published-read-model";
  readonly sourceId: string;
  readonly projectionManifestId: string | null;
  readonly projectionRecordCount: number;
  readonly assetReferencePlanId: string;
  readonly assetReferenceDescriptorCount: number;
  readonly assetReferenceCandidateCount: number;
  readonly projectionRoutes: readonly RuntimeClientProjectionReadRoute[];
  readonly emptyPublishedReadModel: boolean;
  readonly runtimeReadable: true;
  readonly usesEditorAdminRoutes: false;
  readonly usesEditorDraftData: false;
  readonly leaksEditorDraftData: false;
  readonly containsConcreteGameContent: false;
}

export interface RuntimeGameManifestReader {
  readonly readerKind: "runtime-projection-manifest-reader";
  readonly routes: readonly RuntimeClientProjectionReadRoute[];
  readonly method: "GET";
  readonly credentials: "omit";
  readonly readsPublishedManifest: true;
  readonly readsEditorDraftData: false;
  readonly mutatesData: false;
}

export interface RuntimeGameAssetReferenceResolver {
  readonly resolverKind: "asset-reference-contract";
  readonly assetReferencePlanId: string;
  readonly descriptorCount: number;
  readonly candidateCount: number;
  readonly metadataOnly: true;
  readonly loadsAssets: false;
  readonly fetchesAssetBytes: false;
  readonly resolvesFinalAssetRoles: false;
  readonly usesEditorDraftData: false;
  readonly rendererInstruction: null;
}

export interface RuntimeGameWorldBootstrap {
  readonly bootstrapKind: "published-read-model-world-bootstrap";
  readonly status: "blocked" | "ready";
  readonly recordCount: number;
  readonly worldRecordCount: number;
  readonly requiredPublishedDataPresent: boolean;
  readonly source: "published-read-model";
  readonly hardcodesWorld: false;
  readonly hardcodesCamera: false;
  readonly hardcodesLighting: false;
  readonly hardcodesHud: false;
  readonly hardcodesMinimap: false;
  readonly containsConcreteGameContent: false;
}

export interface RuntimeGamePlayerSessionBootstrap {
  readonly sessionKind: "runtime-player-session";
  readonly sessionId: string;
  readonly sourceManifestId: string | null;
  readonly persisted: boolean;
  readonly authenticatedGameUserRequired: false;
  readonly containsPlayerContent: false;
}

export interface RuntimeGameInputAdapter {
  readonly adapterKind: "runtime-input-intent-adapter";
  readonly status: "ready";
  readonly consumesInputIntents: true;
  readonly bindsMovement: false;
  readonly bindsCombat: false;
  readonly mutatesWorldDirectly: false;
}

export interface RuntimeGameCapabilityAdapters {
  readonly cameraAdapter: "published-data-required";
  readonly hudAdapter: "published-data-required";
  readonly audioAdapter: "published-data-required";
  readonly hardcodesCamera: false;
  readonly hardcodesHud: false;
  readonly hardcodesAudio: false;
  readonly implementsAudioPlayback: false;
}

export interface RuntimeGameSaveLoadState {
  readonly saveKind: "runtime-state-envelope";
  readonly status: "contract-ready" | "unavailable";
  readonly storage: "browser-local-storage" | "server-state-store-required";
  readonly key: string;
  readonly loadBeforeStart: true;
  readonly savesRuntimeStateOnly: true;
  readonly persistsConcreteContent: false;
  readonly mutatesPublishedData: false;
}

export interface RuntimeGameDiagnostic {
  readonly code:
    | "published_manifest_missing"
    | "published_world_read_model_missing"
    | "runtime_asset_reference_plan_empty"
    | "runtime_game_contract_violation";
  readonly message: string;
  readonly path: string;
  readonly severity: "info" | "warning" | "error";
  readonly blocksRuntimeGame: boolean;
  readonly safeForDisplay: true;
  readonly containsSecret: false;
}

export interface RuntimeGameCoreStatus {
  readonly phase: typeof RUNTIME_GAME_CORE_PHASE;
  readonly marker: typeof RUNTIME_GAME_CORE_MARKER;
  readonly lifecycle: RuntimeGameCoreLifecycleState;
  readonly status: RuntimeGameCoreStatusValue;
  readonly bootableFromPublishedData: boolean;
  readonly blockedByMissingPublishedData: boolean;
  readonly diagnosticCount: number;
  readonly serverSideValidated: false;
}

export interface RuntimeGameCoreState {
  readonly phase: typeof RUNTIME_GAME_CORE_PHASE;
  readonly marker: typeof RUNTIME_GAME_CORE_MARKER;
  readonly status: RuntimeGameCoreStatus;
  readonly source: RuntimeGamePublishedBuildSource;
  readonly manifestReader: RuntimeGameManifestReader;
  readonly assetReferencePlanning: RuntimeAssetReferencePlanningState;
  readonly assetReferenceResolver: RuntimeGameAssetReferenceResolver;
  readonly worldBootstrap: RuntimeGameWorldBootstrap;
  readonly playerSession: RuntimeGamePlayerSessionBootstrap;
  readonly inputAdapter: RuntimeGameInputAdapter;
  readonly capabilityAdapters: RuntimeGameCapabilityAdapters;
  readonly saveLoad: RuntimeGameSaveLoadState;
  readonly diagnostics: readonly RuntimeGameDiagnostic[];
  readonly safetyFlags: RuntimeGameCoreSafetyFlags;
  readonly projectionRoutes: readonly RuntimeClientProjectionReadRoute[];
  readonly editorRouteIndicators: readonly string[];
  readonly draftDataIndicators: readonly string[];
  readonly assetLoadUrls: readonly string[];
  readonly assetByteFetchUrls: readonly string[];
  readonly hardcodedRuntimeValueIndicators: readonly string[];
  readonly concreteContentIndicators: readonly string[];
  readonly runtimeFeatureIndicators: readonly string[];
  readonly serverSideValidated: false;
}

export interface RuntimeGameCoreValidationIssue {
  readonly gate: RuntimeGameCoreValidationGate;
  readonly path: string;
  readonly message: string;
  readonly severity: RuntimeGameCoreValidationSeverity;
  readonly blocksRuntimeGameCore: boolean;
}

export interface RuntimeGameCoreGateResult {
  readonly gate: RuntimeGameCoreValidationGate;
  readonly status: "pass" | "warning" | "fail";
  readonly issues: readonly RuntimeGameCoreValidationIssue[];
}

export interface RuntimeGameCoreValidationResult {
  readonly validationId: string;
  readonly valid: boolean;
  readonly gateResults: readonly RuntimeGameCoreGateResult[];
  readonly issues: readonly RuntimeGameCoreValidationIssue[];
  readonly safetyFlags: RuntimeGameCoreSafetyFlags;
  readonly bootsRuntimeGame: true;
  readonly consumesPublishedReadModel: true;
  readonly usesEditorDraftData: false;
  readonly usesEditorAdminRoutes: false;
  readonly loadsAssets: false;
  readonly fetchesAssetBytes: false;
  readonly resolvesFinalAssetRoles: false;
  readonly rendersConcreteWorld: false;
  readonly implementsMovement: false;
  readonly implementsCombat: false;
  readonly implementsAudioPlayback: false;
  readonly hardcodesContent: false;
  readonly mutatesAssets: false;
}

export function createRuntimeGameCoreSafetyFlags(
  overrides: Partial<RuntimeGameCoreSafetyFlags> = {}
): RuntimeGameCoreSafetyFlags {
  return {
    consumesPublishedReadModel: true,
    consumesRuntimeProjectionReadModel: true,
    consumesRuntimeAssetReferencePlan: true,
    bootsRuntimeGame: true,
    usesEditorAdminRoutes: false,
    usesEditorDraftData: false,
    readsDraftData: false,
    loadsAssets: false,
    fetchesAssetBytes: false,
    resolvesFinalAssetRoles: false,
    rendersConcreteWorld: false,
    rendererDrawCalls: false,
    implementsQuestRuntime: false,
    implementsDialogueRuntime: false,
    implementsEconomyRuntime: false,
    implementsCombat: false,
    implementsMovement: false,
    implementsMultiplayer: false,
    implementsAudioPlayback: false,
    hardcodesWorld: false,
    hardcodesCamera: false,
    hardcodesLighting: false,
    hardcodesHud: false,
    hardcodesMinimap: false,
    hardcodesAudio: false,
    hardcodesContent: false,
    mutatesAssets: false,
    mutatesPublishedData: false,
    hasPlayerSessionBootstrap: true,
    hasInputAdapter: true,
    hasSaveLoadBasis: true,
    persistsConcreteContent: false,
    ...overrides
  };
}

export function createRuntimeGamePublishedBuildSource(options: {
  readonly readModel?: RuntimeProjectionReadModel | null;
  readonly assetReferencePlanning?: RuntimeAssetReferencePlanningState;
  readonly projectionRoutes?: readonly RuntimeClientProjectionReadRoute[];
} = {}): RuntimeGamePublishedBuildSource {
  const readModel = options.readModel ?? null;
  const assetReferencePlanning = options.assetReferencePlanning ?? createRuntimeAssetReferencePlanningState();
  const projectionRecordCount = readModel?.records.length ?? 0;
  const projectionManifestId = readModel?.manifest?.manifestId ?? null;

  return {
    sourceKind: "published-read-model",
    sourceId: projectionManifestId ?? "published-read-model:empty",
    projectionManifestId,
    projectionRecordCount,
    assetReferencePlanId: assetReferencePlanning.plan.planId,
    assetReferenceDescriptorCount: assetReferencePlanning.plan.descriptorCount,
    assetReferenceCandidateCount: assetReferencePlanning.plan.candidateCount,
    projectionRoutes: options.projectionRoutes ?? RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
    emptyPublishedReadModel: !projectionManifestId && projectionRecordCount === 0,
    runtimeReadable: true,
    usesEditorAdminRoutes: false,
    usesEditorDraftData: false,
    leaksEditorDraftData: false,
    containsConcreteGameContent: false
  };
}

export function createRuntimeGameManifestReader(
  routes: readonly RuntimeClientProjectionReadRoute[] = RUNTIME_CLIENT_PROJECTION_READ_ROUTES
): RuntimeGameManifestReader {
  return {
    readerKind: "runtime-projection-manifest-reader",
    routes,
    method: "GET",
    credentials: "omit",
    readsPublishedManifest: true,
    readsEditorDraftData: false,
    mutatesData: false
  };
}

export function createRuntimeGameAssetReferenceResolver(
  assetReferencePlanning: RuntimeAssetReferencePlanningState = createRuntimeAssetReferencePlanningState()
): RuntimeGameAssetReferenceResolver {
  return {
    resolverKind: "asset-reference-contract",
    assetReferencePlanId: assetReferencePlanning.plan.planId,
    descriptorCount: assetReferencePlanning.plan.descriptorCount,
    candidateCount: assetReferencePlanning.plan.candidateCount,
    metadataOnly: true,
    loadsAssets: false,
    fetchesAssetBytes: false,
    resolvesFinalAssetRoles: false,
    usesEditorDraftData: false,
    rendererInstruction: null
  };
}

export function createRuntimeGameWorldBootstrap(
  readModel: RuntimeProjectionReadModel | null = null
): RuntimeGameWorldBootstrap {
  const records = readModel?.records ?? [];
  const worldRecordCount = records.filter(isWorldBootstrapRecord).length;
  const requiredPublishedDataPresent = Boolean(readModel?.manifest) && worldRecordCount > 0;

  return {
    bootstrapKind: "published-read-model-world-bootstrap",
    status: requiredPublishedDataPresent ? "ready" : "blocked",
    recordCount: records.length,
    worldRecordCount,
    requiredPublishedDataPresent,
    source: "published-read-model",
    hardcodesWorld: false,
    hardcodesCamera: false,
    hardcodesLighting: false,
    hardcodesHud: false,
    hardcodesMinimap: false,
    containsConcreteGameContent: false
  };
}

export function createRuntimeGamePlayerSessionBootstrap(
  source: RuntimeGamePublishedBuildSource = createRuntimeGamePublishedBuildSource()
): RuntimeGamePlayerSessionBootstrap {
  return {
    sessionKind: "runtime-player-session",
    sessionId: `runtime-player-session:${source.projectionManifestId ?? "empty"}`,
    sourceManifestId: source.projectionManifestId,
    persisted: false,
    authenticatedGameUserRequired: false,
    containsPlayerContent: false
  };
}

export function createRuntimeGameInputAdapter(): RuntimeGameInputAdapter {
  return {
    adapterKind: "runtime-input-intent-adapter",
    status: "ready",
    consumesInputIntents: true,
    bindsMovement: false,
    bindsCombat: false,
    mutatesWorldDirectly: false
  };
}

export function createRuntimeGameCapabilityAdapters(): RuntimeGameCapabilityAdapters {
  return {
    cameraAdapter: "published-data-required",
    hudAdapter: "published-data-required",
    audioAdapter: "published-data-required",
    hardcodesCamera: false,
    hardcodesHud: false,
    hardcodesAudio: false,
    implementsAudioPlayback: false
  };
}

export function createRuntimeGameSaveLoadState(
  source: RuntimeGamePublishedBuildSource = createRuntimeGamePublishedBuildSource()
): RuntimeGameSaveLoadState {
  return {
    saveKind: "runtime-state-envelope",
    status: "contract-ready",
    storage: "browser-local-storage",
    key: `gk.runtime-game:${source.projectionManifestId ?? "empty"}`,
    loadBeforeStart: true,
    savesRuntimeStateOnly: true,
    persistsConcreteContent: false,
    mutatesPublishedData: false
  };
}

export function createRuntimeGameDiagnostic(options: {
  readonly code: RuntimeGameDiagnostic["code"];
  readonly message: string;
  readonly path: string;
  readonly severity?: RuntimeGameDiagnostic["severity"];
  readonly blocksRuntimeGame?: boolean;
}): RuntimeGameDiagnostic {
  return {
    code: options.code,
    message: options.message,
    path: options.path,
    severity: options.severity ?? "error",
    blocksRuntimeGame: options.blocksRuntimeGame ?? true,
    safeForDisplay: true,
    containsSecret: false
  };
}

export function createRuntimeGameCoreStatus(options: {
  readonly lifecycle?: RuntimeGameCoreLifecycleState;
  readonly diagnosticCount?: number;
  readonly bootableFromPublishedData?: boolean;
  readonly blockedByMissingPublishedData?: boolean;
} = {}): RuntimeGameCoreStatus {
  const lifecycle = options.lifecycle ?? "blocked";

  return {
    phase: RUNTIME_GAME_CORE_PHASE,
    marker: RUNTIME_GAME_CORE_MARKER,
    lifecycle,
    status: lifecycle,
    bootableFromPublishedData: options.bootableFromPublishedData ?? lifecycle === "ready",
    blockedByMissingPublishedData: options.blockedByMissingPublishedData ?? lifecycle === "blocked",
    diagnosticCount: options.diagnosticCount ?? 0,
    serverSideValidated: false
  };
}

export function createRuntimeGameCoreState(options: {
  readonly runtimeProjectionReadModel?: RuntimeProjectionReadModel | null;
  readonly assetReferencePlanning?: RuntimeAssetReferencePlanningState;
  readonly safetyFlags?: Partial<RuntimeGameCoreSafetyFlags>;
  readonly diagnostics?: readonly RuntimeGameDiagnostic[];
  readonly editorRouteIndicators?: readonly string[];
  readonly draftDataIndicators?: readonly string[];
  readonly assetLoadUrls?: readonly string[];
  readonly assetByteFetchUrls?: readonly string[];
  readonly hardcodedRuntimeValueIndicators?: readonly string[];
  readonly concreteContentIndicators?: readonly string[];
  readonly runtimeFeatureIndicators?: readonly string[];
} = {}): RuntimeGameCoreState {
  const readModel = options.runtimeProjectionReadModel ?? null;
  const assetReferencePlanning = options.assetReferencePlanning ?? createRuntimeAssetReferencePlanningState();
  const projectionRoutes = RUNTIME_CLIENT_PROJECTION_READ_ROUTES;
  const source = createRuntimeGamePublishedBuildSource({ readModel, assetReferencePlanning, projectionRoutes });
  const assetReferenceResolver = createRuntimeGameAssetReferenceResolver(assetReferencePlanning);
  const worldBootstrap = createRuntimeGameWorldBootstrap(readModel);
  const defaultDiagnostics = createDefaultRuntimeGameDiagnostics(source, worldBootstrap, assetReferenceResolver);
  const diagnostics = [...defaultDiagnostics, ...(options.diagnostics ?? [])];
  const blocked = diagnostics.some((diagnostic) => diagnostic.blocksRuntimeGame);
  const lifecycle: RuntimeGameCoreLifecycleState = blocked ? "blocked" : "ready";

  return {
    phase: RUNTIME_GAME_CORE_PHASE,
    marker: RUNTIME_GAME_CORE_MARKER,
    status: createRuntimeGameCoreStatus({
      lifecycle,
      diagnosticCount: diagnostics.length,
      bootableFromPublishedData: lifecycle === "ready",
      blockedByMissingPublishedData: blocked
    }),
    source,
    manifestReader: createRuntimeGameManifestReader(projectionRoutes),
    assetReferencePlanning,
    assetReferenceResolver,
    worldBootstrap,
    playerSession: createRuntimeGamePlayerSessionBootstrap(source),
    inputAdapter: createRuntimeGameInputAdapter(),
    capabilityAdapters: createRuntimeGameCapabilityAdapters(),
    saveLoad: createRuntimeGameSaveLoadState(source),
    diagnostics,
    safetyFlags: createRuntimeGameCoreSafetyFlags(options.safetyFlags),
    projectionRoutes,
    editorRouteIndicators: options.editorRouteIndicators ?? [],
    draftDataIndicators: options.draftDataIndicators ?? [],
    assetLoadUrls: options.assetLoadUrls ?? [],
    assetByteFetchUrls: options.assetByteFetchUrls ?? [],
    hardcodedRuntimeValueIndicators: options.hardcodedRuntimeValueIndicators ?? [],
    concreteContentIndicators: options.concreteContentIndicators ?? [],
    runtimeFeatureIndicators: options.runtimeFeatureIndicators ?? [],
    serverSideValidated: false
  };
}

export function createRuntimeGameCoreValidationResult(options: {
  readonly issues?: readonly RuntimeGameCoreValidationIssue[];
  readonly safetyFlags?: Partial<RuntimeGameCoreSafetyFlags>;
} = {}): RuntimeGameCoreValidationResult {
  const issues = options.issues ?? [];
  const hasErrors = issues.some((candidate) => candidate.severity === "error");
  const safetyFlags = createRuntimeGameCoreSafetyFlags(options.safetyFlags);

  return {
    validationId: "runtime-game-core-validation:phase-17",
    valid: !hasErrors,
    gateResults: createRuntimeGameCoreGateResults(issues),
    issues,
    safetyFlags,
    bootsRuntimeGame: true,
    consumesPublishedReadModel: true,
    usesEditorDraftData: false,
    usesEditorAdminRoutes: false,
    loadsAssets: false,
    fetchesAssetBytes: false,
    resolvesFinalAssetRoles: false,
    rendersConcreteWorld: false,
    implementsMovement: false,
    implementsCombat: false,
    implementsAudioPlayback: false,
    hardcodesContent: false,
    mutatesAssets: false
  };
}

export function isRuntimeGameCoreLifecycleState(value: string): value is RuntimeGameCoreLifecycleState {
  return (RUNTIME_GAME_CORE_LIFECYCLE_STATES as readonly string[]).includes(value);
}

function createDefaultRuntimeGameDiagnostics(
  source: RuntimeGamePublishedBuildSource,
  worldBootstrap: RuntimeGameWorldBootstrap,
  assetReferenceResolver: RuntimeGameAssetReferenceResolver
): readonly RuntimeGameDiagnostic[] {
  const diagnostics: RuntimeGameDiagnostic[] = [];

  if (source.emptyPublishedReadModel || !source.projectionManifestId) {
    diagnostics.push(createRuntimeGameDiagnostic({
      code: "published_manifest_missing",
      message: "No published runtime manifest is available for Runtime Game Core boot.",
      path: "source.projectionManifestId"
    }));
  }

  if (!worldBootstrap.requiredPublishedDataPresent) {
    diagnostics.push(createRuntimeGameDiagnostic({
      code: "published_world_read_model_missing",
      message: "Published read-model data required for world bootstrap is missing.",
      path: "worldBootstrap.requiredPublishedDataPresent"
    }));
  }

  if (assetReferenceResolver.descriptorCount === 0) {
    diagnostics.push(createRuntimeGameDiagnostic({
      code: "runtime_asset_reference_plan_empty",
      message: "Runtime Game Core has no asset-reference metadata plan to consume yet.",
      path: "assetReferenceResolver.descriptorCount",
      severity: "warning",
      blocksRuntimeGame: true
    }));
  }

  return diagnostics;
}

function createRuntimeGameCoreGateResults(
  issues: readonly RuntimeGameCoreValidationIssue[]
): readonly RuntimeGameCoreGateResult[] {
  return RUNTIME_GAME_CORE_VALIDATION_GATES.map((gate) => {
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

function isWorldBootstrapRecord(record: RuntimeProjectionRecord): boolean {
  return record.recordType === "world.reference" || record.recordType === "generated.reference";
}