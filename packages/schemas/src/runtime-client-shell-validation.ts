import {
  RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
  createRuntimeClientValidationResult,
  isRuntimeClientProjectionReadRoute,
  type RuntimeClientProjectionReadRoute,
  type RuntimeClientSafetyFlags,
  type RuntimeClientShellModel,
  type RuntimeClientValidationGate,
  type RuntimeClientValidationIssue,
  type RuntimeClientValidationResult
} from "./runtime-client-shell.js";

export function validateRuntimeClientShellModel(model: RuntimeClientShellModel): RuntimeClientValidationResult {
  const issues = dedupeIssues([
    ...validateProjectionRoutes(model.projection.routes, "projection.routes"),
    ...validateProjectionBoundary(model),
    ...validateSafetyFlags(model.safetyFlags),
    ...validateCapabilities(model),
    ...validateErrors(model)
  ]);

  return createRuntimeClientValidationResult({
    issues,
    safetyFlags: model.safetyFlags
  });
}

export function validateRuntimeClientProjectionRoutes(
  routes: readonly string[],
  prefix = "routes"
): readonly RuntimeClientValidationIssue[] {
  return validateProjectionRoutes(routes, prefix);
}

export function validateRuntimeClientSafetyFlags(
  flags: RuntimeClientSafetyFlags,
  prefix = "safetyFlags"
): readonly RuntimeClientValidationIssue[] {
  return validateSafetyFlags(flags, prefix);
}

function validateProjectionRoutes(
  routes: readonly string[],
  prefix: string
): readonly RuntimeClientValidationIssue[] {
  const issues: RuntimeClientValidationIssue[] = [];

  if (routes.length === 0) {
    issues.push(issue("runtime-projection-read-only", prefix, "Runtime client shell must declare read-only runtime projection routes.", "error", true));
  }

  for (const [index, route] of routes.entries()) {
    const path = `${prefix}.${index}`;

    if (!isRuntimeClientProjectionReadRoute(route)) {
      issues.push(issue("runtime-projection-read-only", path, "Runtime client shell may only consume runtime projection read-only routes.", "error", true));
    }

    if (isEditorAdminRoute(route)) {
      issues.push(issue("no-editor-admin-routes", path, "Runtime client shell must not call editor/admin routes.", "error", true));
    }
  }

  for (const required of RUNTIME_CLIENT_PROJECTION_READ_ROUTES) {
    if (!routes.includes(required)) {
      issues.push(issue("runtime-projection-read-only", prefix, `Runtime client shell is missing ${required}.`, "error", true));
    }
  }

  return issues;
}

function validateProjectionBoundary(model: RuntimeClientShellModel): readonly RuntimeClientValidationIssue[] {
  const issues: RuntimeClientValidationIssue[] = [];

  if (model.phase !== "phase-12") {
    issues.push(issue("safety-flags", "phase", "Runtime client shell must identify Fase 12 explicitly.", "error", true));
  }

  if (model.projection.usesEditorAdminRoutes !== false) {
    issues.push(issue("no-editor-admin-routes", "projection.usesEditorAdminRoutes", "Runtime client projection state must not use editor/admin routes.", "error", true));
  }

  if (model.projection.leaksEditorDraftData !== false) {
    issues.push(issue("no-editor-draft-data", "projection.leaksEditorDraftData", "Runtime client shell must not leak editor draft data.", "error", true));
  }

  if (model.projection.mutatesData !== false) {
    issues.push(issue("runtime-projection-read-only", "projection.mutatesData", "Runtime client shell is read-only and must not mutate projection data.", "error", true));
  }

  if (model.projection.readModel?.leaksEditorDraftData !== false && model.projection.readModel !== null) {
    issues.push(issue("no-editor-draft-data", "projection.readModel.leaksEditorDraftData", "Runtime projection read model must not leak editor draft data.", "error", true));
  }

  if (model.projection.readModel?.containsConcreteGameContent !== false && model.projection.readModel !== null) {
    issues.push(issue("no-hardcoded-content", "projection.readModel.containsConcreteGameContent", "Runtime client shell must not display concrete gamecontent from unsafe read models.", "error", true));
  }

  if (model.hardcodedContentIndicators.length > 0) {
    issues.push(issue("no-hardcoded-content", "hardcodedContentIndicators", "Runtime client shell must not carry hardcoded world, camera, minimap, HUD, audio, NPC, quest or economy content.", "error", true));
  }

  if (model.status === "empty" && !model.projection.emptyState) {
    issues.push(issue("safe-empty-state", "status", "Runtime client shell empty status must be backed by a safe projection empty state.", "error", true));
  }

  if (model.runtimeRendererAvailable !== false || model.acceptsConcreteGameContent !== false) {
    issues.push(issue("no-renderer-gameplay", "runtimeRendererAvailable", "Runtime client shell is not a renderer and does not accept concrete gamecontent.", "error", true));
  }

  return issues;
}

function validateCapabilities(model: RuntimeClientShellModel): readonly RuntimeClientValidationIssue[] {
  const issues: RuntimeClientValidationIssue[] = [];

  if (model.capabilities.consumesRuntimeProjection !== true) {
    issues.push(issue("runtime-projection-read-only", "capabilities.consumesRuntimeProjection", "Runtime client shell must consume runtime projection metadata.", "error", true));
  }

  if (model.capabilities.usesEditorDraftData !== false) {
    issues.push(issue("no-editor-draft-data", "capabilities.usesEditorDraftData", "Runtime client shell must not use editor draft data.", "error", true));
  }

  if (
    model.capabilities.implements3DRenderer !== false
    || model.capabilities.implementsGameplay !== false
    || model.capabilities.implementsCombat !== false
    || model.capabilities.implementsMovement !== false
  ) {
    issues.push(issue("no-renderer-gameplay", "capabilities", "Fase 12 client shell must not implement renderer, gameplay, combat or movement.", "error", true));
  }

  if (model.capabilities.implementsAudioPlayback !== false) {
    issues.push(issue("no-audio-playback", "capabilities.implementsAudioPlayback", "Fase 12 client shell must not implement audio playback.", "error", true));
  }

  if (model.capabilities.mutatesAssets !== false) {
    issues.push(issue("no-asset-mutation", "capabilities.mutatesAssets", "Runtime client shell must not mutate assets.", "error", true));
  }

  return issues;
}

function validateSafetyFlags(
  flags: RuntimeClientSafetyFlags,
  prefix = "safetyFlags"
): readonly RuntimeClientValidationIssue[] {
  const issues: RuntimeClientValidationIssue[] = [];

  if (flags.consumesRuntimeProjection !== true) {
    issues.push(issue("runtime-projection-read-only", `${prefix}.consumesRuntimeProjection`, "Runtime client shell must consume runtime projection read-only data.", "error", true));
  }

  if (flags.usesEditorDraftData || flags.leaksEditorDraftData) {
    issues.push(issue("no-editor-draft-data", `${prefix}.draftData`, "Runtime client shell must not use or leak editor draft data.", "error", true));
  }

  if (flags.usesEditorAdminRoutes) {
    issues.push(issue("no-editor-admin-routes", `${prefix}.usesEditorAdminRoutes`, "Runtime client shell must not consume editor/admin routes.", "error", true));
  }

  if (flags.implements3DRenderer || flags.implementsGameplay || flags.implementsCombat || flags.implementsMovement) {
    issues.push(issue("no-renderer-gameplay", `${prefix}.runtime`, "Fase 12 must not implement 3D renderer, gameplay, combat or movement.", "error", true));
  }

  if (flags.implementsAudioPlayback) {
    issues.push(issue("no-audio-playback", `${prefix}.implementsAudioPlayback`, "Fase 12 must not implement audio playback.", "error", true));
  }

  if (flags.hardcodesContent) {
    issues.push(issue("no-hardcoded-content", `${prefix}.hardcodesContent`, "Runtime client shell must not hardcode world, camera, lighting, minimap, HUD, audio, NPC, quest or economy values.", "error", true));
  }

  if (flags.mutatesAssets) {
    issues.push(issue("no-asset-mutation", `${prefix}.mutatesAssets`, "Runtime client shell must not mutate, copy, upload or remove assets.", "error", true));
  }

  return issues;
}

function validateErrors(model: RuntimeClientShellModel): readonly RuntimeClientValidationIssue[] {
  return model.errors.flatMap((error, index) => {
    const issues: RuntimeClientValidationIssue[] = [];
    const prefix = `errors.${index}`;

    if (error.safeForDisplay !== true || error.containsSecret !== false) {
      issues.push(issue("safety-flags", prefix, "Runtime client shell errors must be safe for display and contain no secrets.", "error", true));
    }

    if (error.route && !isRuntimeClientProjectionReadRoute(error.route)) {
      issues.push(issue("runtime-projection-read-only", `${prefix}.route`, "Runtime client shell errors may only reference runtime projection read-only routes.", "error", true));
    }

    return issues;
  });
}

function isEditorAdminRoute(route: string): boolean {
  return route.startsWith("/editor") || route.startsWith("/auth/editor") || route.includes("/editor/");
}

function issue(
  gate: RuntimeClientValidationGate,
  path: string,
  message: string,
  severity: RuntimeClientValidationIssue["severity"],
  blocksRuntimeClientShell: boolean
): RuntimeClientValidationIssue {
  return { gate, path, message, severity, blocksRuntimeClientShell };
}

function dedupeIssues(
  issues: readonly RuntimeClientValidationIssue[]
): readonly RuntimeClientValidationIssue[] {
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

export type { RuntimeClientProjectionReadRoute };
