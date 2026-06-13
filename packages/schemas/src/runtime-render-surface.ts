import type { RuntimeProjectionReadModel } from "./runtime-projection.js";
import {
  RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
  type RuntimeClientProjectionReadRoute
} from "./runtime-client-shell.js";

export const RUNTIME_RENDER_SURFACE_PHASE = "phase-13" as const;
export const RUNTIME_RENDER_SURFACE_MARKER = "phase-13" as const;

export const RUNTIME_RENDER_LIFECYCLE_STATES = ["booting", "empty", "ready", "error"] as const;
export const RUNTIME_RENDER_SURFACE_STATUSES = RUNTIME_RENDER_LIFECYCLE_STATES;

export const RUNTIME_RENDER_CAPABILITY_VALUES = ["not-probed", "available", "unavailable"] as const;

export const RUNTIME_RENDER_SURFACE_VALIDATION_GATES = [
  "runtime-projection-metadata-only",
  "no-editor-admin-routes",
  "no-editor-draft-data",
  "no-asset-loads",
  "no-concrete-world-payload",
  "no-hardcoded-runtime-values",
  "no-gameplay-audio",
  "safe-empty-render-state",
  "render-lifecycle-states",
  "safety-flags"
] as const;

export type RuntimeRenderLifecycleState = (typeof RUNTIME_RENDER_LIFECYCLE_STATES)[number];
export type RuntimeRenderSurfaceStatusValue = (typeof RUNTIME_RENDER_SURFACE_STATUSES)[number];
export type RuntimeRenderCapabilityValue = (typeof RUNTIME_RENDER_CAPABILITY_VALUES)[number];
export type RuntimeRenderSurfaceValidationGate = (typeof RUNTIME_RENDER_SURFACE_VALIDATION_GATES)[number];
export type RuntimeRenderSurfaceValidationSeverity = "warning" | "error";

export interface RuntimeRenderSurfaceSafetyFlags {
  readonly createsRenderSurface: boolean;
  readonly consumesRuntimeProjectionMetadata: boolean;
  readonly loadsAssets: boolean;
  readonly rendersConcreteWorld: boolean;
  readonly implementsGameplay: boolean;
  readonly implementsMovement: boolean;
  readonly implementsCombat: boolean;
  readonly implementsAudioPlayback: boolean;
  readonly hardcodesCamera: boolean;
  readonly hardcodesLighting: boolean;
  readonly hardcodesHud: boolean;
  readonly hardcodesMinimap: boolean;
  readonly hardcodesContent: boolean;
  readonly mutatesAssets: boolean;
  readonly usesEditorDraftData: boolean;
  readonly usesEditorAdminRoutes: boolean;
  readonly assetLoadUrls: boolean;
  readonly assemblesScene: boolean;
}

export interface RuntimeRenderSurfaceCapabilities {
  readonly createsRenderSurface: true;
  readonly hostsCanvasElement: true;
  readonly probesCanvas2D: true;
  readonly probesWebGL: true;
  readonly probesWebGL2: true;
  readonly consumesRuntimeProjectionMetadata: true;
  readonly displaysSafeEmptyState: true;
  readonly loadsAssets: false;
  readonly rendersConcreteWorld: false;
  readonly implementsGameplay: false;
  readonly implementsMovement: false;
  readonly implementsCombat: false;
  readonly implementsAudioPlayback: false;
  readonly mutatesAssets: false;
  readonly assemblesScene: false;
  readonly assetLoadUrls: false;
}

export interface RuntimeRenderCapabilityProbe {
  readonly canvasElement: RuntimeRenderCapabilityValue;
  readonly canvas2D: RuntimeRenderCapabilityValue;
  readonly webgl: RuntimeRenderCapabilityValue;
  readonly webgl2: RuntimeRenderCapabilityValue;
  readonly probeRunsClientSide: true;
  readonly rendersScene: false;
  readonly loadsAssets: false;
}

export interface RuntimeRenderSurfaceErrorState {
  readonly code:
    | "canvas_unavailable"
    | "webgl_unavailable"
    | "runtime_projection_unavailable"
    | "render_surface_contract_violation";
  readonly message: string;
  readonly route: RuntimeClientProjectionReadRoute | null;
  readonly safeForDisplay: true;
  readonly containsSecret: false;
}

export interface RuntimeRenderSurfaceStatus {
  readonly phase: typeof RUNTIME_RENDER_SURFACE_PHASE;
  readonly marker: typeof RUNTIME_RENDER_SURFACE_MARKER;
  readonly lifecycle: RuntimeRenderLifecycleState;
  readonly status: RuntimeRenderSurfaceStatusValue;
  readonly safeEmptyState: boolean;
  readonly serverSideValidated: false;
}

export interface RuntimeRenderSurfaceState {
  readonly phase: typeof RUNTIME_RENDER_SURFACE_PHASE;
  readonly marker: typeof RUNTIME_RENDER_SURFACE_MARKER;
  readonly status: RuntimeRenderSurfaceStatus;
  readonly lifecycle: RuntimeRenderLifecycleState;
  readonly projectionRoutes: readonly RuntimeClientProjectionReadRoute[];
  readonly projectionReadModel: RuntimeProjectionReadModel | null;
  readonly projectionEmptyState: boolean;
  readonly safeEmptyState: boolean;
  readonly capabilities: RuntimeRenderSurfaceCapabilities;
  readonly safetyFlags: RuntimeRenderSurfaceSafetyFlags;
  readonly capabilityProbe: RuntimeRenderCapabilityProbe;
  readonly errors: readonly RuntimeRenderSurfaceErrorState[];
  readonly hardcodedRuntimeValueIndicators: readonly string[];
  readonly assetLoadUrls: readonly string[];
  readonly concreteContentIndicators: readonly string[];
  readonly serverSideValidated: false;
}

export interface RuntimeRenderSurfaceValidationIssue {
  readonly gate: RuntimeRenderSurfaceValidationGate;
  readonly path: string;
  readonly message: string;
  readonly severity: RuntimeRenderSurfaceValidationSeverity;
  readonly blocksRuntimeRenderSurface: boolean;
}

export interface RuntimeRenderSurfaceGateResult {
  readonly gate: RuntimeRenderSurfaceValidationGate;
  readonly status: "pass" | "warning" | "fail";
  readonly issues: readonly RuntimeRenderSurfaceValidationIssue[];
}

export interface RuntimeRenderSurfaceValidationResult {
  readonly validationId: string;
  readonly valid: boolean;
  readonly gateResults: readonly RuntimeRenderSurfaceGateResult[];
  readonly issues: readonly RuntimeRenderSurfaceValidationIssue[];
  readonly safetyFlags: RuntimeRenderSurfaceSafetyFlags;
  readonly createsRenderSurface: true;
  readonly consumesRuntimeProjectionMetadata: true;
  readonly loadsAssets: false;
  readonly rendersConcreteWorld: false;
  readonly implementsGameplay: false;
  readonly implementsMovement: false;
  readonly implementsCombat: false;
  readonly implementsAudioPlayback: false;
  readonly hardcodesContent: false;
  readonly mutatesAssets: false;
}

export function createRuntimeRenderSurfaceSafetyFlags(
  overrides: Partial<RuntimeRenderSurfaceSafetyFlags> = {}
): RuntimeRenderSurfaceSafetyFlags {
  return {
    createsRenderSurface: true,
    consumesRuntimeProjectionMetadata: true,
    loadsAssets: false,
    rendersConcreteWorld: false,
    implementsGameplay: false,
    implementsMovement: false,
    implementsCombat: false,
    implementsAudioPlayback: false,
    hardcodesCamera: false,
    hardcodesLighting: false,
    hardcodesHud: false,
    hardcodesMinimap: false,
    hardcodesContent: false,
    mutatesAssets: false,
    usesEditorDraftData: false,
    usesEditorAdminRoutes: false,
    assetLoadUrls: false,
    assemblesScene: false,
    ...overrides
  };
}

export function createRuntimeRenderSurfaceCapabilities(): RuntimeRenderSurfaceCapabilities {
  return {
    createsRenderSurface: true,
    hostsCanvasElement: true,
    probesCanvas2D: true,
    probesWebGL: true,
    probesWebGL2: true,
    consumesRuntimeProjectionMetadata: true,
    displaysSafeEmptyState: true,
    loadsAssets: false,
    rendersConcreteWorld: false,
    implementsGameplay: false,
    implementsMovement: false,
    implementsCombat: false,
    implementsAudioPlayback: false,
    mutatesAssets: false,
    assemblesScene: false,
    assetLoadUrls: false
  };
}

export function createRuntimeRenderCapabilityProbe(
  overrides: Partial<RuntimeRenderCapabilityProbe> = {}
): RuntimeRenderCapabilityProbe {
  return {
    canvasElement: "not-probed",
    canvas2D: "not-probed",
    webgl: "not-probed",
    webgl2: "not-probed",
    probeRunsClientSide: true,
    rendersScene: false,
    loadsAssets: false,
    ...overrides
  };
}

export function createRuntimeRenderSurfaceErrorState(options: {
  readonly code: RuntimeRenderSurfaceErrorState["code"];
  readonly message: string;
  readonly route?: RuntimeClientProjectionReadRoute | null;
}): RuntimeRenderSurfaceErrorState {
  return {
    code: options.code,
    message: options.message,
    route: options.route ?? null,
    safeForDisplay: true,
    containsSecret: false
  };
}

export function createRuntimeRenderSurfaceStatus(options: {
  readonly lifecycle?: RuntimeRenderLifecycleState;
  readonly safeEmptyState?: boolean;
} = {}): RuntimeRenderSurfaceStatus {
  const lifecycle = options.lifecycle ?? "empty";

  return {
    phase: RUNTIME_RENDER_SURFACE_PHASE,
    marker: RUNTIME_RENDER_SURFACE_MARKER,
    lifecycle,
    status: lifecycle,
    safeEmptyState: options.safeEmptyState ?? lifecycle === "empty",
    serverSideValidated: false
  };
}

export function createRuntimeRenderSurfaceState(options: {
  readonly lifecycle?: RuntimeRenderLifecycleState;
  readonly projectionRoutes?: readonly RuntimeClientProjectionReadRoute[];
  readonly projectionReadModel?: RuntimeProjectionReadModel | null;
  readonly projectionEmptyState?: boolean;
  readonly safetyFlags?: Partial<RuntimeRenderSurfaceSafetyFlags>;
  readonly capabilityProbe?: Partial<RuntimeRenderCapabilityProbe>;
  readonly errors?: readonly RuntimeRenderSurfaceErrorState[];
  readonly hardcodedRuntimeValueIndicators?: readonly string[];
  readonly assetLoadUrls?: readonly string[];
  readonly concreteContentIndicators?: readonly string[];
} = {}): RuntimeRenderSurfaceState {
  const projectionReadModel = options.projectionReadModel ?? null;
  const projectionEmptyState = options.projectionEmptyState ?? projectionReadModel?.emptyState ?? true;
  const lifecycle = options.lifecycle ?? (projectionEmptyState ? "empty" : "ready");

  return {
    phase: RUNTIME_RENDER_SURFACE_PHASE,
    marker: RUNTIME_RENDER_SURFACE_MARKER,
    status: createRuntimeRenderSurfaceStatus({ lifecycle, safeEmptyState: projectionEmptyState }),
    lifecycle,
    projectionRoutes: options.projectionRoutes ?? RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
    projectionReadModel,
    projectionEmptyState,
    safeEmptyState: projectionEmptyState,
    capabilities: createRuntimeRenderSurfaceCapabilities(),
    safetyFlags: createRuntimeRenderSurfaceSafetyFlags(options.safetyFlags),
    capabilityProbe: createRuntimeRenderCapabilityProbe(options.capabilityProbe),
    errors: options.errors ?? [],
    hardcodedRuntimeValueIndicators: options.hardcodedRuntimeValueIndicators ?? [],
    assetLoadUrls: options.assetLoadUrls ?? [],
    concreteContentIndicators: options.concreteContentIndicators ?? [],
    serverSideValidated: false
  };
}

export function createRuntimeRenderSurfaceValidationResult(options: {
  readonly issues?: readonly RuntimeRenderSurfaceValidationIssue[];
  readonly safetyFlags?: Partial<RuntimeRenderSurfaceSafetyFlags>;
} = {}): RuntimeRenderSurfaceValidationResult {
  const issues = options.issues ?? [];
  const hasErrors = issues.some((candidate) => candidate.severity === "error");
  const safetyFlags = createRuntimeRenderSurfaceSafetyFlags(options.safetyFlags);

  return {
    validationId: "runtime-render-surface-validation:phase-13",
    valid: !hasErrors,
    gateResults: createRuntimeRenderSurfaceGateResults(issues),
    issues,
    safetyFlags,
    createsRenderSurface: true,
    consumesRuntimeProjectionMetadata: true,
    loadsAssets: false,
    rendersConcreteWorld: false,
    implementsGameplay: false,
    implementsMovement: false,
    implementsCombat: false,
    implementsAudioPlayback: false,
    hardcodesContent: false,
    mutatesAssets: false
  };
}

export function isRuntimeRenderLifecycleState(value: string): value is RuntimeRenderLifecycleState {
  return (RUNTIME_RENDER_LIFECYCLE_STATES as readonly string[]).includes(value);
}

function createRuntimeRenderSurfaceGateResults(
  issues: readonly RuntimeRenderSurfaceValidationIssue[]
): readonly RuntimeRenderSurfaceGateResult[] {
  return RUNTIME_RENDER_SURFACE_VALIDATION_GATES.map((gate) => {
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
