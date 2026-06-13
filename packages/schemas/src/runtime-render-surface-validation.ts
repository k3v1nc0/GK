import { isRuntimeClientProjectionReadRoute } from "./runtime-client-shell.js";
import {
  createRuntimeRenderSurfaceValidationResult,
  isRuntimeRenderLifecycleState,
  type RuntimeRenderSurfaceSafetyFlags,
  type RuntimeRenderSurfaceState,
  type RuntimeRenderSurfaceValidationGate,
  type RuntimeRenderSurfaceValidationIssue,
  type RuntimeRenderSurfaceValidationResult
} from "./runtime-render-surface.js";

export function validateRuntimeRenderSurfaceState(
  state: RuntimeRenderSurfaceState
): RuntimeRenderSurfaceValidationResult {
  const issues = dedupeIssues([
    ...validateRuntimeRenderSurfaceRoutes(state.projectionRoutes, "projectionRoutes"),
    ...validateRenderProjectionBoundary(state),
    ...validateRuntimeRenderSurfaceSafetyFlags(state.safetyFlags),
    ...validateCapabilities(state),
    ...validateLifecycle(state),
    ...validateErrors(state)
  ]);

  return createRuntimeRenderSurfaceValidationResult({
    issues,
    safetyFlags: state.safetyFlags
  });
}

export function validateRuntimeRenderSurfaceRoutes(
  routes: readonly string[],
  prefix = "routes"
): readonly RuntimeRenderSurfaceValidationIssue[] {
  const issues: RuntimeRenderSurfaceValidationIssue[] = [];

  if (routes.length === 0) {
    issues.push(issue("runtime-projection-metadata-only", prefix, "Runtime render surface must declare runtime projection read-only metadata routes.", "error", true));
  }

  for (const [index, route] of routes.entries()) {
    const path = `${prefix}.${index}`;

    if (!isRuntimeClientProjectionReadRoute(route)) {
      issues.push(issue("runtime-projection-metadata-only", path, "Runtime render surface may only consume runtime projection read-only metadata routes.", "error", true));
    }

    if (isEditorAdminRoute(route)) {
      issues.push(issue("no-editor-admin-routes", path, "Runtime render surface must not call editor/admin routes.", "error", true));
    }

    if (isAssetLoadRequest(route)) {
      issues.push(issue("no-asset-load-requests", path, "Fase 13 render surface must not request assets.", "error", true));
    }
  }

  return issues;
}

export function validateRuntimeRenderSurfaceSafetyFlags(
  flags: RuntimeRenderSurfaceSafetyFlags,
  prefix = "safetyFlags"
): readonly RuntimeRenderSurfaceValidationIssue[] {
  const issues: RuntimeRenderSurfaceValidationIssue[] = [];

  if (flags.createsRenderSurface !== true) {
    issues.push(issue("safety-flags", `${prefix}.createsRenderSurface`, "Fase 13 must create only the generic render surface host.", "error", true));
  }

  if (flags.consumesRuntimeProjectionMetadata !== true) {
    issues.push(issue("runtime-projection-metadata-only", `${prefix}.consumesRuntimeProjectionMetadata`, "Render surface must consume runtime projection metadata/read-only state.", "error", true));
  }

  if (flags.usesEditorAdminRoutes) {
    issues.push(issue("no-editor-admin-routes", `${prefix}.usesEditorAdminRoutes`, "Render surface must not use editor/admin routes.", "error", true));
  }

  if (flags.usesEditorDraftData) {
    issues.push(issue("no-editor-draft-data", `${prefix}.usesEditorDraftData`, "Render surface must not use editor draft/candidate data.", "error", true));
  }

  if (flags.loadsAssets || flags.requestsAssetUrls) {
    issues.push(issue("no-asset-load-requests", `${prefix}.loadsAssets`, "Fase 13 must not load GLB, texture, image or audio assets.", "error", true));
  }

  if (flags.rendersConcreteWorld || flags.assemblesScene) {
    issues.push(issue("no-concrete-world-payload", `${prefix}.rendersConcreteWorld`, "Fase 13 must not render a concrete world or assemble a scene.", "error", true));
  }

  if (flags.implementsGameplay || flags.implementsMovement || flags.implementsCombat || flags.implementsAudioPlayback) {
    issues.push(issue("no-gameplay-audio", `${prefix}.runtime`, "Fase 13 must not implement gameplay, movement, combat or audio playback.", "error", true));
  }

  if (
    flags.hardcodesCamera
    || flags.hardcodesLighting
    || flags.hardcodesHud
    || flags.hardcodesMinimap
    || flags.hardcodesContent
  ) {
    issues.push(issue("no-hardcoded-runtime-values", `${prefix}.hardcodedValues`, "Fase 13 must not hardcode camera, lighting, HUD, minimap, audio or content values.", "error", true));
  }

  if (flags.mutatesAssets) {
    issues.push(issue("no-asset-load-requests", `${prefix}.mutatesAssets`, "Render surface must not mutate, copy, upload or remove assets.", "error", true));
  }

  return issues;
}

function validateRenderProjectionBoundary(
  state: RuntimeRenderSurfaceState
): readonly RuntimeRenderSurfaceValidationIssue[] {
  const issues: RuntimeRenderSurfaceValidationIssue[] = [];

  if (state.phase !== "phase-13" || state.marker !== "phase-13") {
    issues.push(issue("safety-flags", "phase", "Runtime render surface must identify Fase 13 explicitly.", "error", true));
  }

  if (state.projectionReadModel?.leaksEditorDraftData !== false && state.projectionReadModel !== null) {
    issues.push(issue("no-editor-draft-data", "projectionReadModel.leaksEditorDraftData", "Render surface must not consume read models that leak editor draft data.", "error", true));
  }

  if (state.projectionReadModel?.containsConcreteGameContent !== false && state.projectionReadModel !== null) {
    issues.push(issue("no-concrete-world-payload", "projectionReadModel.containsConcreteGameContent", "Render surface must not render concrete gamecontent from unsafe read models.", "error", true));
  }

  for (const [index, request] of state.assetLoadRequests.entries()) {
    const path = `assetLoadRequests.${index}`;
    issues.push(issue("no-asset-load-requests", path, `Render surface must not load assets: ${request}.`, "error", true));
  }

  if (state.concreteContentIndicators.length > 0) {
    issues.push(issue("no-concrete-world-payload", "concreteContentIndicators", "Render surface must not carry concrete world, entity, NPC, quest or economy payloads.", "error", true));
  }

  if (state.hardcodedRuntimeValueIndicators.length > 0) {
    issues.push(issue("no-hardcoded-runtime-values", "hardcodedRuntimeValueIndicators", "Render surface must not carry hardcoded world, camera, lighting, HUD, minimap or audio values.", "error", true));
  }

  if (state.lifecycle === "empty" && (!state.safeEmptyState || !state.projectionEmptyState)) {
    issues.push(issue("safe-empty-render-state", "safeEmptyState", "Empty render surface must be backed by a safe empty projection state.", "error", true));
  }

  return issues;
}

function validateCapabilities(state: RuntimeRenderSurfaceState): readonly RuntimeRenderSurfaceValidationIssue[] {
  const issues: RuntimeRenderSurfaceValidationIssue[] = [];
  const capabilities = state.capabilities;

  if (capabilities.createsRenderSurface !== true || capabilities.hostsCanvasElement !== true) {
    issues.push(issue("safety-flags", "capabilities.createsRenderSurface", "Fase 13 must expose a canvas/render host surface.", "error", true));
  }

  if (capabilities.consumesRuntimeProjectionMetadata !== true) {
    issues.push(issue("runtime-projection-metadata-only", "capabilities.consumesRuntimeProjectionMetadata", "Render surface must consume runtime projection metadata/read-only state.", "error", true));
  }

  if (capabilities.loadsAssets || capabilities.requestsAssetUrls) {
    issues.push(issue("no-asset-load-requests", "capabilities.loadsAssets", "Render surface capability must not load assets.", "error", true));
  }

  if (capabilities.rendersConcreteWorld || capabilities.assemblesScene) {
    issues.push(issue("no-concrete-world-payload", "capabilities.rendersConcreteWorld", "Render surface is not projection-driven scene assembly.", "error", true));
  }

  if (
    capabilities.implementsGameplay
    || capabilities.implementsMovement
    || capabilities.implementsCombat
    || capabilities.implementsAudioPlayback
  ) {
    issues.push(issue("no-gameplay-audio", "capabilities.runtime", "Render surface must not implement gameplay, movement, combat or audio playback.", "error", true));
  }

  if (capabilities.mutatesAssets) {
    issues.push(issue("no-asset-load-requests", "capabilities.mutatesAssets", "Render surface must not mutate assets.", "error", true));
  }

  return issues;
}

function validateLifecycle(state: RuntimeRenderSurfaceState): readonly RuntimeRenderSurfaceValidationIssue[] {
  const issues: RuntimeRenderSurfaceValidationIssue[] = [];

  if (!isRuntimeRenderLifecycleState(state.lifecycle)) {
    issues.push(issue("render-lifecycle-states", "lifecycle", "Render lifecycle must be booting, ready, empty or error.", "error", true));
  }

  if (state.status.lifecycle !== state.lifecycle || state.status.status !== state.lifecycle) {
    issues.push(issue("render-lifecycle-states", "status.lifecycle", "Render surface status must mirror lifecycle state.", "error", true));
  }

  if (state.lifecycle === "ready" && state.projectionEmptyState) {
    issues.push(issue("safe-empty-render-state", "projectionEmptyState", "Render surface cannot be ready when projection state is empty.", "error", true));
  }

  return issues;
}

function validateErrors(state: RuntimeRenderSurfaceState): readonly RuntimeRenderSurfaceValidationIssue[] {
  return state.errors.flatMap((error, index) => {
    const issues: RuntimeRenderSurfaceValidationIssue[] = [];
    const prefix = `errors.${index}`;

    if (error.safeForDisplay !== true || error.containsSecret !== false) {
      issues.push(issue("safety-flags", prefix, "Render surface errors must be safe for display and contain no secrets.", "error", true));
    }

    if (error.route && !isRuntimeClientProjectionReadRoute(error.route)) {
      issues.push(issue("runtime-projection-metadata-only", `${prefix}.route`, "Render surface errors may only reference runtime projection read-only routes.", "error", true));
    }

    return issues;
  });
}

function isEditorAdminRoute(route: string): boolean {
  return route.startsWith("/editor") || route.startsWith("/auth/editor") || route.includes("/editor/");
}

function isAssetLoadRequest(value: string): boolean {
  return /\/assets\//i.test(value) || /\.(glb|gltf|png|jpe?g|webp|gif|mp3|wav|ogg)(\?|$)/i.test(value);
}

function issue(
  gate: RuntimeRenderSurfaceValidationGate,
  path: string,
  message: string,
  severity: RuntimeRenderSurfaceValidationIssue["severity"],
  blocksRuntimeRenderSurface: boolean
): RuntimeRenderSurfaceValidationIssue {
  return { gate, path, message, severity, blocksRuntimeRenderSurface };
}

function dedupeIssues(
  issues: readonly RuntimeRenderSurfaceValidationIssue[]
): readonly RuntimeRenderSurfaceValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((candidate) => {
    const key = `${candidate.gate}:${candidate.path}:${candidate.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
