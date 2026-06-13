import type { RuntimeProjectionReadModel } from "./runtime-projection.js";

export const RUNTIME_CLIENT_SHELL_PHASE = "phase-12" as const;

export const RUNTIME_CLIENT_SHELL_STATUSES = ["loading", "empty", "ready", "error"] as const;
export const RUNTIME_CLIENT_PROJECTION_FETCH_STATUSES = ["not-started", "loading", "loaded", "empty", "error"] as const;
export const RUNTIME_CLIENT_SHELL_ROUTES = ["/", "/game", "/game/", "/game/shell.json"] as const;
export const RUNTIME_CLIENT_PROJECTION_READ_ROUTES = [
  "/runtime/projection/status",
  "/runtime/projection/manifest",
  "/runtime/projection/records"
] as const;

export const RUNTIME_CLIENT_VALIDATION_GATES = [
  "runtime-projection-read-only",
  "no-editor-admin-routes",
  "no-editor-draft-data",
  "no-renderer-gameplay",
  "no-audio-playback",
  "no-asset-mutation",
  "no-hardcoded-content",
  "safe-empty-state",
  "safety-flags"
] as const;

export type RuntimeClientShellStatus = (typeof RUNTIME_CLIENT_SHELL_STATUSES)[number];
export type RuntimeClientProjectionFetchStatus = (typeof RUNTIME_CLIENT_PROJECTION_FETCH_STATUSES)[number];
export type RuntimeClientShellRoute = (typeof RUNTIME_CLIENT_SHELL_ROUTES)[number];
export type RuntimeClientProjectionReadRoute = (typeof RUNTIME_CLIENT_PROJECTION_READ_ROUTES)[number];
export type RuntimeClientValidationGate = (typeof RUNTIME_CLIENT_VALIDATION_GATES)[number];
export type RuntimeClientValidationSeverity = "warning" | "error";

export interface RuntimeClientSafetyFlags {
  readonly consumesRuntimeProjection: boolean;
  readonly usesEditorDraftData: boolean;
  readonly implements3DRenderer: boolean;
  readonly implementsGameplay: boolean;
  readonly implementsCombat: boolean;
  readonly implementsMovement: boolean;
  readonly implementsAudioPlayback: boolean;
  readonly hardcodesContent: boolean;
  readonly mutatesAssets: boolean;
  readonly usesEditorAdminRoutes: boolean;
  readonly leaksEditorDraftData: boolean;
}

export interface RuntimeClientCapabilities {
  readonly consumesRuntimeProjection: true;
  readonly displaysRuntimeStatus: true;
  readonly displaysProjectionMetadata: true;
  readonly displaysSafeEmptyState: true;
  readonly usesEditorDraftData: false;
  readonly implements3DRenderer: false;
  readonly implementsGameplay: false;
  readonly implementsCombat: false;
  readonly implementsMovement: false;
  readonly implementsAudioPlayback: false;
  readonly mutatesAssets: false;
}

export interface RuntimeClientErrorState {
  readonly code: "runtime_projection_unavailable" | "runtime_projection_fetch_failed" | "runtime_client_contract_violation";
  readonly message: string;
  readonly route: RuntimeClientProjectionReadRoute | null;
  readonly safeForDisplay: true;
  readonly containsSecret: false;
}

export interface RuntimeClientProjectionState {
  readonly routes: readonly RuntimeClientProjectionReadRoute[];
  readonly readModel: RuntimeProjectionReadModel | null;
  readonly fetchStatus: RuntimeClientProjectionFetchStatus;
  readonly emptyState: boolean;
  readonly usesEditorAdminRoutes: false;
  readonly leaksEditorDraftData: false;
  readonly mutatesData: false;
}

export interface RuntimeClientBootState {
  readonly phase: typeof RUNTIME_CLIENT_SHELL_PHASE;
  readonly route: RuntimeClientShellRoute;
  readonly status: RuntimeClientShellStatus;
  readonly projectionRoutes: readonly RuntimeClientProjectionReadRoute[];
  readonly loading: boolean;
  readonly emptyState: boolean;
  readonly serverSideValidated: false;
  readonly capabilities: RuntimeClientCapabilities;
  readonly safetyFlags: RuntimeClientSafetyFlags;
}

export interface RuntimeClientShellModel {
  readonly phase: typeof RUNTIME_CLIENT_SHELL_PHASE;
  readonly route: RuntimeClientShellRoute;
  readonly status: RuntimeClientShellStatus;
  readonly boot: RuntimeClientBootState;
  readonly projection: RuntimeClientProjectionState;
  readonly capabilities: RuntimeClientCapabilities;
  readonly safetyFlags: RuntimeClientSafetyFlags;
  readonly errors: readonly RuntimeClientErrorState[];
  readonly hardcodedContentIndicators: readonly string[];
  readonly serverSideValidated: false;
  readonly runtimeRendererAvailable: false;
  readonly acceptsConcreteGameContent: false;
}

export interface RuntimeClientValidationIssue {
  readonly gate: RuntimeClientValidationGate;
  readonly path: string;
  readonly message: string;
  readonly severity: RuntimeClientValidationSeverity;
  readonly blocksRuntimeClientShell: boolean;
}

export interface RuntimeClientGateResult {
  readonly gate: RuntimeClientValidationGate;
  readonly status: "pass" | "warning" | "fail";
  readonly issues: readonly RuntimeClientValidationIssue[];
}

export interface RuntimeClientValidationResult {
  readonly validationId: string;
  readonly valid: boolean;
  readonly gateResults: readonly RuntimeClientGateResult[];
  readonly issues: readonly RuntimeClientValidationIssue[];
  readonly safetyFlags: RuntimeClientSafetyFlags;
  readonly consumesRuntimeProjection: true;
  readonly usesEditorDraftData: false;
  readonly implements3DRenderer: false;
  readonly implementsGameplay: false;
  readonly implementsCombat: false;
  readonly implementsMovement: false;
  readonly implementsAudioPlayback: false;
  readonly hardcodesContent: false;
  readonly mutatesAssets: false;
}

export function createRuntimeClientSafetyFlags(
  overrides: Partial<RuntimeClientSafetyFlags> = {}
): RuntimeClientSafetyFlags {
  return {
    consumesRuntimeProjection: true,
    usesEditorDraftData: false,
    implements3DRenderer: false,
    implementsGameplay: false,
    implementsCombat: false,
    implementsMovement: false,
    implementsAudioPlayback: false,
    hardcodesContent: false,
    mutatesAssets: false,
    usesEditorAdminRoutes: false,
    leaksEditorDraftData: false,
    ...overrides
  };
}

export function createRuntimeClientCapabilities(): RuntimeClientCapabilities {
  return {
    consumesRuntimeProjection: true,
    displaysRuntimeStatus: true,
    displaysProjectionMetadata: true,
    displaysSafeEmptyState: true,
    usesEditorDraftData: false,
    implements3DRenderer: false,
    implementsGameplay: false,
    implementsCombat: false,
    implementsMovement: false,
    implementsAudioPlayback: false,
    mutatesAssets: false
  };
}

export function createRuntimeClientErrorState(options: {
  readonly code: RuntimeClientErrorState["code"];
  readonly message: string;
  readonly route?: RuntimeClientProjectionReadRoute | null;
}): RuntimeClientErrorState {
  return {
    code: options.code,
    message: options.message,
    route: options.route ?? null,
    safeForDisplay: true,
    containsSecret: false
  };
}

export function createRuntimeClientProjectionState(options: {
  readonly routes?: readonly RuntimeClientProjectionReadRoute[];
  readonly readModel?: RuntimeProjectionReadModel | null;
  readonly fetchStatus?: RuntimeClientProjectionFetchStatus;
  readonly emptyState?: boolean;
} = {}): RuntimeClientProjectionState {
  const readModel = options.readModel ?? null;
  const emptyState = options.emptyState ?? readModel?.emptyState ?? true;

  return {
    routes: options.routes ?? RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
    readModel,
    fetchStatus: options.fetchStatus ?? (readModel ? "loaded" : emptyState ? "empty" : "not-started"),
    emptyState,
    usesEditorAdminRoutes: false,
    leaksEditorDraftData: false,
    mutatesData: false
  };
}

export function createRuntimeClientBootState(options: {
  readonly route?: RuntimeClientShellRoute;
  readonly status?: RuntimeClientShellStatus;
  readonly projectionRoutes?: readonly RuntimeClientProjectionReadRoute[];
  readonly safetyFlags?: Partial<RuntimeClientSafetyFlags>;
} = {}): RuntimeClientBootState {
  const status = options.status ?? "empty";

  return {
    phase: RUNTIME_CLIENT_SHELL_PHASE,
    route: options.route ?? "/game/",
    status,
    projectionRoutes: options.projectionRoutes ?? RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
    loading: status === "loading",
    emptyState: status === "empty",
    serverSideValidated: false,
    capabilities: createRuntimeClientCapabilities(),
    safetyFlags: createRuntimeClientSafetyFlags(options.safetyFlags)
  };
}

export function createRuntimeClientShellModel(options: {
  readonly route?: RuntimeClientShellRoute;
  readonly status?: RuntimeClientShellStatus;
  readonly projection?: RuntimeClientProjectionState;
  readonly safetyFlags?: Partial<RuntimeClientSafetyFlags>;
  readonly errors?: readonly RuntimeClientErrorState[];
  readonly hardcodedContentIndicators?: readonly string[];
} = {}): RuntimeClientShellModel {
  const safetyFlags = createRuntimeClientSafetyFlags(options.safetyFlags);
  const projection = options.projection ?? createRuntimeClientProjectionState();
  const status = options.status ?? (projection.emptyState ? "empty" : "ready");

  return {
    phase: RUNTIME_CLIENT_SHELL_PHASE,
    route: options.route ?? "/game/",
    status,
    boot: createRuntimeClientBootState({
      route: options.route ?? "/game/",
      status,
      projectionRoutes: projection.routes,
      safetyFlags
    }),
    projection,
    capabilities: createRuntimeClientCapabilities(),
    safetyFlags,
    errors: options.errors ?? [],
    hardcodedContentIndicators: options.hardcodedContentIndicators ?? [],
    serverSideValidated: false,
    runtimeRendererAvailable: false,
    acceptsConcreteGameContent: false
  };
}

export function createRuntimeClientValidationResult(options: {
  readonly issues?: readonly RuntimeClientValidationIssue[];
  readonly safetyFlags?: Partial<RuntimeClientSafetyFlags>;
} = {}): RuntimeClientValidationResult {
  const issues = options.issues ?? [];
  const hasErrors = issues.some((candidate) => candidate.severity === "error");
  const safetyFlags = createRuntimeClientSafetyFlags(options.safetyFlags);

  return {
    validationId: "runtime-client-shell-validation:phase-12",
    valid: !hasErrors,
    gateResults: createRuntimeClientGateResults(issues),
    issues,
    safetyFlags,
    consumesRuntimeProjection: true,
    usesEditorDraftData: false,
    implements3DRenderer: false,
    implementsGameplay: false,
    implementsCombat: false,
    implementsMovement: false,
    implementsAudioPlayback: false,
    hardcodesContent: false,
    mutatesAssets: false
  };
}

export function isRuntimeClientProjectionReadRoute(value: string): value is RuntimeClientProjectionReadRoute {
  return (RUNTIME_CLIENT_PROJECTION_READ_ROUTES as readonly string[]).includes(value);
}

export function isRuntimeClientShellRoute(value: string): value is RuntimeClientShellRoute {
  return (RUNTIME_CLIENT_SHELL_ROUTES as readonly string[]).includes(value);
}

function createRuntimeClientGateResults(
  issues: readonly RuntimeClientValidationIssue[]
): readonly RuntimeClientGateResult[] {
  return RUNTIME_CLIENT_VALIDATION_GATES.map((gate) => {
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
