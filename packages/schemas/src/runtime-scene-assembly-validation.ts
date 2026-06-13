import { isRuntimeClientProjectionReadRoute } from "./runtime-client-shell.js";
import {
  createRuntimeSceneAssemblyValidationResult,
  isRuntimeSceneAssemblyLifecycleState,
  type RuntimeSceneAssemblyDescriptor,
  type RuntimeSceneAssemblyNode,
  type RuntimeSceneAssemblySafetyFlags,
  type RuntimeSceneAssemblyState,
  type RuntimeSceneAssemblyValidationGate,
  type RuntimeSceneAssemblyValidationIssue,
  type RuntimeSceneAssemblyValidationResult
} from "./runtime-scene-assembly.js";

export function validateRuntimeSceneAssemblyState(
  state: RuntimeSceneAssemblyState
): RuntimeSceneAssemblyValidationResult {
  const issues = dedupeIssues([
    ...validateRuntimeSceneAssemblyRoutes(state.projectionRoutes, "projectionRoutes"),
    ...validateRuntimeSceneAssemblySafetyFlags(state.safetyFlags),
    ...validateSceneAssemblySource(state),
    ...validateSceneAssemblyPlan(state),
    ...validateIndicators(state),
    ...validateErrors(state)
  ]);

  return createRuntimeSceneAssemblyValidationResult({
    issues,
    safetyFlags: state.safetyFlags
  });
}

export function validateRuntimeSceneAssemblyRoutes(
  routes: readonly string[],
  prefix = "routes"
): readonly RuntimeSceneAssemblyValidationIssue[] {
  const issues: RuntimeSceneAssemblyValidationIssue[] = [];

  if (routes.length === 0) {
    issues.push(issue("runtime-projection-records-only", prefix, "Scene assembly must declare runtime projection read-only record routes.", "error", true));
  }

  for (const [index, route] of routes.entries()) {
    const path = `${prefix}.${index}`;

    if (!isRuntimeClientProjectionReadRoute(route)) {
      issues.push(issue("runtime-projection-records-only", path, "Scene assembly may only consume runtime projection read-only routes.", "error", true));
    }

    if (isEditorAdminRoute(route)) {
      issues.push(issue("no-editor-admin-routes", path, "Scene assembly must not call editor/admin routes.", "error", true));
    }

    if (isAssetLoadRequest(route)) {
      issues.push(issue("no-asset-loads", path, "Fase 14 scene assembly must not load GLB, texture, image or audio assets.", "error", true));
    }
  }

  return issues;
}

export function validateRuntimeSceneAssemblySafetyFlags(
  flags: RuntimeSceneAssemblySafetyFlags,
  prefix = "safetyFlags"
): readonly RuntimeSceneAssemblyValidationIssue[] {
  const issues: RuntimeSceneAssemblyValidationIssue[] = [];

  if (flags.consumesRuntimeProjectionRecords !== true) {
    issues.push(issue("runtime-projection-records-only", `${prefix}.consumesRuntimeProjectionRecords`, "Scene assembly must consume runtime projection records.", "error", true));
  }

  if (flags.producesScenePlan !== true) {
    issues.push(issue("safety-flags", `${prefix}.producesScenePlan`, "Fase 14 must produce only a neutral scene plan.", "error", true));
  }

  if (flags.usesEditorAdminRoutes) {
    issues.push(issue("no-editor-admin-routes", `${prefix}.usesEditorAdminRoutes`, "Scene assembly must not use editor/admin routes.", "error", true));
  }

  if (flags.usesEditorDraftData) {
    issues.push(issue("no-editor-draft-data", `${prefix}.usesEditorDraftData`, "Scene assembly must not use editor draft/candidate data.", "error", true));
  }

  if (flags.loadsAssets || flags.assetLoadUrls) {
    issues.push(issue("no-asset-loads", `${prefix}.loadsAssets`, "Fase 14 must not load GLB, texture, UI image or audio assets.", "error", true));
  }

  if (flags.resolvesFinalAssetRoles) {
    issues.push(issue("no-final-asset-role-mapping", `${prefix}.resolvesFinalAssetRoles`, "Fase 14 must not finalize GLB or asset role mapping.", "error", true));
  }

  if (flags.rendersScene || flags.rendererDrawCalls) {
    issues.push(issue("no-renderer-draw-calls", `${prefix}.rendersScene`, "Scene assembly must not render or issue renderer draw calls.", "error", true));
  }

  if (flags.implementsGameplay || flags.implementsMovement || flags.implementsCombat || flags.implementsAudioPlayback) {
    issues.push(issue("no-gameplay-audio", `${prefix}.runtime`, "Scene assembly must not implement gameplay, movement, combat or audio playback.", "error", true));
  }

  if (
    flags.hardcodesWorld
    || flags.hardcodesCamera
    || flags.hardcodesLighting
    || flags.hardcodesHud
    || flags.hardcodesMinimap
    || flags.hardcodesContent
  ) {
    issues.push(issue("no-hardcoded-runtime-values", `${prefix}.hardcodedValues`, "Scene assembly must not hardcode world, camera, lighting, HUD, minimap, audio or content values.", "error", true));
  }

  if (flags.mutatesAssets) {
    issues.push(issue("no-asset-loads", `${prefix}.mutatesAssets`, "Scene assembly must not mutate, copy, upload or remove assets.", "error", true));
  }

  return issues;
}

function validateSceneAssemblySource(state: RuntimeSceneAssemblyState): readonly RuntimeSceneAssemblyValidationIssue[] {
  const issues: RuntimeSceneAssemblyValidationIssue[] = [];

  if (state.phase !== "phase-14" || state.marker !== "phase-14") {
    issues.push(issue("safety-flags", "phase", "Runtime scene assembly must identify Fase 14 explicitly.", "error", true));
  }

  if (state.source.sourceKind !== "runtime-projection-read-model" || state.source.runtimeReadable !== true) {
    issues.push(issue("runtime-projection-records-only", "source", "Scene assembly source must be a runtime-readable projection read model.", "error", true));
  }

  if (state.source.leaksEditorDraftData !== false || state.projectionReadModel?.leaksEditorDraftData !== false && state.projectionReadModel !== null) {
    issues.push(issue("no-editor-draft-data", "source.leaksEditorDraftData", "Scene assembly must not consume read models that leak editor draft data.", "error", true));
  }

  if (state.source.containsConcreteGameContent !== false || state.projectionReadModel?.containsConcreteGameContent !== false && state.projectionReadModel !== null) {
    issues.push(issue("no-concrete-content", "source.containsConcreteGameContent", "Scene assembly must not consume concrete gamecontent payloads.", "error", true));
  }

  if (state.projectionReadModel?.runtimeReadable !== true && state.projectionReadModel !== null) {
    issues.push(issue("runtime-projection-records-only", "projectionReadModel.runtimeReadable", "Projection read model must be runtime-readable.", "error", true));
  }

  return issues;
}

function validateSceneAssemblyPlan(state: RuntimeSceneAssemblyState): readonly RuntimeSceneAssemblyValidationIssue[] {
  const issues: RuntimeSceneAssemblyValidationIssue[] = [];
  const plan = state.plan;

  if (plan.phase !== "phase-14" || plan.producesScenePlan !== true) {
    issues.push(issue("safety-flags", "plan.phase", "Scene plan must be a Fase 14 scene-plan contract.", "error", true));
  }

  if (!isRuntimeSceneAssemblyLifecycleState(plan.lifecycle) || state.status.status !== state.status.lifecycle) {
    issues.push(issue("safety-flags", "plan.lifecycle", "Scene assembly lifecycle/status must be valid and mirrored.", "error", true));
  }

  if (plan.loadsAssets || plan.resolvesFinalAssetRoles || plan.rendersScene || plan.implementsGameplay || plan.implementsAudioPlayback) {
    issues.push(issue("safety-flags", "plan.runtime", "Scene plan must not load assets, finalize roles, render, implement gameplay or play audio.", "error", true));
  }

  if (plan.emptyScenePlan && (plan.descriptors.length > 0 || plan.nodes.length > 0 || plan.recordCount !== 0)) {
    issues.push(issue("empty-scene-plan", "plan.emptyScenePlan", "Empty scene plan must not contain descriptors, nodes or records.", "error", true));
  }

  for (const [index, descriptor] of plan.descriptors.entries()) {
    issues.push(...validateDescriptor(descriptor, `plan.descriptors.${index}`));
  }

  for (const [index, node] of plan.nodes.entries()) {
    issues.push(...validateNode(node, `plan.nodes.${index}`));
  }

  return issues;
}

function validateDescriptor(
  descriptor: RuntimeSceneAssemblyDescriptor,
  prefix: string
): readonly RuntimeSceneAssemblyValidationIssue[] {
  const issues: RuntimeSceneAssemblyValidationIssue[] = [];

  if (descriptor.assetLoadUrl !== null || descriptor.loadsAssets) {
    issues.push(issue("no-asset-loads", `${prefix}.assetLoadUrl`, "Scene descriptors must not load GLB, texture, image or audio assets.", "error", true));
  }

  if (descriptor.assetRoleFinalized) {
    issues.push(issue("no-final-asset-role-mapping", `${prefix}.assetRoleFinalized`, "Scene descriptors must not finalize asset roles.", "error", true));
  }

  if (descriptor.rendererInstruction !== null || descriptor.rendersScene) {
    issues.push(issue("no-renderer-draw-calls", `${prefix}.rendererInstruction`, "Scene descriptors must not contain renderer instructions or draw calls.", "error", true));
  }

  if (descriptor.containsConcreteGameContent) {
    issues.push(issue("no-concrete-content", `${prefix}.containsConcreteGameContent`, "Scene descriptors must not contain concrete gamecontent.", "error", true));
  }

  return issues;
}

function validateNode(
  node: RuntimeSceneAssemblyNode,
  prefix: string
): readonly RuntimeSceneAssemblyValidationIssue[] {
  const issues: RuntimeSceneAssemblyValidationIssue[] = [];

  if (node.finalAssetRole !== null) {
    issues.push(issue("no-final-asset-role-mapping", `${prefix}.finalAssetRole`, "Scene plan nodes must not finalize asset roles.", "error", true));
  }

  if (node.rendererInstruction !== null || node.rendersScene) {
    issues.push(issue("no-renderer-draw-calls", `${prefix}.rendererInstruction`, "Scene plan nodes must not draw or render scenes.", "error", true));
  }

  if (node.concretePayload !== null) {
    issues.push(issue("no-concrete-content", `${prefix}.concretePayload`, "Scene plan nodes must not contain concrete payloads.", "error", true));
  }

  if (node.loadsAssets) {
    issues.push(issue("no-asset-loads", `${prefix}.loadsAssets`, "Scene plan nodes must not load assets.", "error", true));
  }

  return issues;
}

function validateIndicators(state: RuntimeSceneAssemblyState): readonly RuntimeSceneAssemblyValidationIssue[] {
  const issues: RuntimeSceneAssemblyValidationIssue[] = [];

  for (const [index, assetUrl] of state.assetLoadUrls.entries()) {
    issues.push(issue("no-asset-loads", `assetLoadUrls.${index}`, `Scene assembly must not load assets: ${assetUrl}.`, "error", true));
  }

  if (state.finalAssetRoleIndicators.length > 0) {
    issues.push(issue("no-final-asset-role-mapping", "finalAssetRoleIndicators", "Scene assembly must not finalize asset or GLB roles.", "error", true));
  }

  if (state.concreteContentIndicators.length > 0) {
    issues.push(issue("no-concrete-content", "concreteContentIndicators", "Scene assembly must not carry concrete world, NPC, quest or economy payloads.", "error", true));
  }

  if (state.hardcodedRuntimeValueIndicators.length > 0) {
    issues.push(issue("no-hardcoded-runtime-values", "hardcodedRuntimeValueIndicators", "Scene assembly must not hardcode world, camera, lighting, HUD, minimap or audio values.", "error", true));
  }

  if (state.rendererDrawCallIndicators.length > 0) {
    issues.push(issue("no-renderer-draw-calls", "rendererDrawCallIndicators", "Scene assembly must not call renderer draw APIs.", "error", true));
  }

  return issues;
}

function validateErrors(state: RuntimeSceneAssemblyState): readonly RuntimeSceneAssemblyValidationIssue[] {
  return state.errors.flatMap((error, index) => {
    const issues: RuntimeSceneAssemblyValidationIssue[] = [];
    const prefix = `errors.${index}`;

    if (error.safeForDisplay !== true || error.containsSecret !== false) {
      issues.push(issue("safety-flags", prefix, "Scene assembly errors must be safe for display and contain no secrets.", "error", true));
    }

    if (error.route && !isRuntimeClientProjectionReadRoute(error.route)) {
      issues.push(issue("runtime-projection-records-only", `${prefix}.route`, "Scene assembly errors may only reference runtime projection read-only routes.", "error", true));
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
  gate: RuntimeSceneAssemblyValidationGate,
  path: string,
  message: string,
  severity: RuntimeSceneAssemblyValidationIssue["severity"],
  blocksSceneAssembly: boolean
): RuntimeSceneAssemblyValidationIssue {
  return { gate, path, message, severity, blocksSceneAssembly };
}

function dedupeIssues(
  issues: readonly RuntimeSceneAssemblyValidationIssue[]
): readonly RuntimeSceneAssemblyValidationIssue[] {
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
