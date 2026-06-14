import {
  createRuntimeAssetReferencePlanningValidationResult,
  isRuntimeAssetReferencePlanningLifecycleState,
  type RuntimeAssetReferenceCandidate,
  type RuntimeAssetReferenceDescriptor,
  type RuntimeAssetReferencePlanningState,
  type RuntimeAssetReferencePlanningValidationGate,
  type RuntimeAssetReferencePlanningValidationIssue,
  type RuntimeAssetReferencePlanningValidationResult,
  type RuntimeAssetReferenceSafetyFlags
} from "./runtime-asset-reference-planning.js";

export function validateRuntimeAssetReferencePlanningState(
  state: RuntimeAssetReferencePlanningState
): RuntimeAssetReferencePlanningValidationResult {
  const issues = dedupeIssues([
    ...validateRuntimeAssetReferenceSafetyFlags(state.safetyFlags),
    ...validateAssetReferenceSource(state),
    ...validateAssetReferencePlan(state),
    ...validateAssetReferenceIndicators(state),
    ...validateAssetReferenceErrors(state)
  ]);

  return createRuntimeAssetReferencePlanningValidationResult({
    issues,
    safetyFlags: state.safetyFlags
  });
}

export function validateRuntimeAssetReferenceSafetyFlags(
  flags: RuntimeAssetReferenceSafetyFlags,
  prefix = "safetyFlags"
): readonly RuntimeAssetReferencePlanningValidationIssue[] {
  const issues: RuntimeAssetReferencePlanningValidationIssue[] = [];

  if (flags.consumesRuntimeScenePlan !== true) {
    issues.push(issue("runtime-scene-plan-only", `${prefix}.consumesRuntimeScenePlan`, "Asset reference planning must consume only runtime scene-plan metadata.", "error", true));
  }

  if (flags.usesEditorAdminRoutes || flags.usesEditorDraftData) {
    issues.push(issue("runtime-scene-plan-only", `${prefix}.runtimeSource`, "Asset reference planning must stay on runtime scene-plan metadata and away from editor/admin or draft sources.", "error", true));
  }

  if (flags.producesAssetReferencePlan !== true || flags.usesAssetMetadataOnly !== true) {
    issues.push(issue("safety-flags", `${prefix}.producesAssetReferencePlan`, "Fase 15 must produce only an asset-reference metadata plan.", "error", true));
  }

  if (flags.usesEditorAdminRoutes) {
    issues.push(issue("no-editor-admin-routes", `${prefix}.usesEditorAdminRoutes`, "Runtime asset reference planning must not use editor/admin routes.", "error", true));
  }

  if (flags.usesEditorDraftData) {
    issues.push(issue("no-editor-draft-data", `${prefix}.usesEditorDraftData`, "Runtime asset reference planning must not use editor draft/candidate data.", "error", true));
  }

  if (flags.loadsAssets) {
    issues.push(issue("no-asset-loads", `${prefix}.loadsAssets`, "Fase 15 must not load GLB, texture, UI image or audio assets.", "error", true));
  }

  if (flags.fetchesAssetBytes) {
    issues.push(issue("no-asset-byte-fetch", `${prefix}.fetchesAssetBytes`, "Fase 15 must not fetch asset bytes.", "error", true));
  }

  if (flags.resolvesFinalAssetRoles) {
    issues.push(issue("no-final-asset-role-mapping", `${prefix}.resolvesFinalAssetRoles`, "Fase 15 must not finalize GLB or asset role mapping.", "error", true));
  }

  if (flags.rendersScene || flags.rendererDrawCalls) {
    issues.push(issue("no-renderer-draw-calls", `${prefix}.rendersScene`, "Asset reference planning must not render scenes or issue renderer draw calls.", "error", true));
  }

  if (flags.implementsGameplay || flags.implementsMovement || flags.implementsCombat || flags.implementsAudioPlayback) {
    issues.push(issue("no-gameplay-audio", `${prefix}.runtime`, "Asset reference planning must not implement gameplay, movement, combat or audio playback.", "error", true));
  }

  if (
    flags.hardcodesWorld
    || flags.hardcodesCamera
    || flags.hardcodesLighting
    || flags.hardcodesHud
    || flags.hardcodesMinimap
    || flags.hardcodesContent
  ) {
    issues.push(issue("no-hardcoded-runtime-values", `${prefix}.hardcodedValues`, "Asset reference planning must not hardcode world, camera, lighting, HUD, minimap, audio or content values.", "error", true));
  }

  if (flags.mutatesAssets) {
    issues.push(issue("no-asset-loads", `${prefix}.mutatesAssets`, "Asset reference planning must not mutate, copy, upload or remove assets.", "error", true));
  }

  return issues;
}

function validateAssetReferenceSource(state: RuntimeAssetReferencePlanningState): readonly RuntimeAssetReferencePlanningValidationIssue[] {
  const issues: RuntimeAssetReferencePlanningValidationIssue[] = [];

  if (state.phase !== "phase-15" || state.marker !== "phase-15") {
    issues.push(issue("safety-flags", "phase", "Runtime asset reference planning must identify Fase 15 explicitly.", "error", true));
  }

  if (state.source.sourceKind !== "runtime-scene-plan" || state.source.runtimeReadable !== true) {
    issues.push(issue("runtime-scene-plan-only", "source", "Asset reference planning source must be runtime scene-plan metadata.", "error", true));
  }

  if (state.source.leaksEditorDraftData !== false) {
    issues.push(issue("no-editor-draft-data", "source.leaksEditorDraftData", "Asset reference planning must not consume editor draft data.", "error", true));
  }

  if (state.source.containsConcreteGameContent !== false || state.scenePlan.source.containsConcreteGameContent !== false) {
    issues.push(issue("no-concrete-content", "source.containsConcreteGameContent", "Asset reference planning must not consume concrete gamecontent payloads.", "error", true));
  }

  if (state.scenePlan.phase !== "phase-14" || state.scenePlan.producesScenePlan !== true) {
    issues.push(issue("runtime-scene-plan-only", "scenePlan.phase", "Fase 15 must build from the Fase 14 scene plan only.", "error", true));
  }

  if (state.scenePlan.loadsAssets || state.scenePlan.resolvesFinalAssetRoles || state.scenePlan.rendersScene || state.scenePlan.implementsGameplay || state.scenePlan.implementsAudioPlayback) {
    issues.push(issue("runtime-scene-plan-only", "scenePlan.safety", "Source scene plan must remain metadata-only and contentless.", "error", true));
  }

  return issues;
}

function validateAssetReferencePlan(state: RuntimeAssetReferencePlanningState): readonly RuntimeAssetReferencePlanningValidationIssue[] {
  const issues: RuntimeAssetReferencePlanningValidationIssue[] = [];
  const plan = state.plan;

  if (plan.phase !== "phase-15" || plan.producesAssetReferencePlan !== true || plan.usesAssetMetadataOnly !== true) {
    issues.push(issue("safety-flags", "plan.phase", "Asset reference plan must be a Fase 15 metadata contract.", "error", true));
  }

  if (!isRuntimeAssetReferencePlanningLifecycleState(plan.lifecycle) || state.status.status !== state.status.lifecycle) {
    issues.push(issue("safety-flags", "plan.lifecycle", "Asset reference planning lifecycle/status must be valid and mirrored.", "error", true));
  }

  if (plan.loadsAssets || plan.fetchesAssetBytes || plan.resolvesFinalAssetRoles || plan.rendersScene || plan.rendererDrawCalls || plan.implementsGameplay || plan.implementsAudioPlayback) {
    issues.push(issue("safety-flags", "plan.runtime", "Asset reference plan must not load assets, fetch bytes, finalize roles, render, implement gameplay or play audio.", "error", true));
  }

  if (plan.emptyAssetReferencePlan && (plan.descriptors.length > 0 || plan.candidates.length > 0 || plan.sceneDescriptorCount !== 0)) {
    issues.push(issue("empty-asset-reference-plan", "plan.emptyAssetReferencePlan", "Empty asset reference plan must not contain descriptors, candidates or scene descriptors.", "error", true));
  }

  for (const [index, descriptor] of plan.descriptors.entries()) {
    issues.push(...validateDescriptor(descriptor, `plan.descriptors.${index}`));
  }

  for (const [index, candidate] of plan.candidates.entries()) {
    issues.push(...validateCandidate(candidate, `plan.candidates.${index}`));
  }

  return issues;
}

function validateDescriptor(
  descriptor: RuntimeAssetReferenceDescriptor,
  prefix: string
): readonly RuntimeAssetReferencePlanningValidationIssue[] {
  const issues: RuntimeAssetReferencePlanningValidationIssue[] = [];

  if (descriptor.metadataOnly !== true) {
    issues.push(issue("safety-flags", `${prefix}.metadataOnly`, "Asset reference descriptors must stay metadata-only.", "error", true));
  }

  if (descriptor.assetLoadUrl !== null || descriptor.loadsAssets) {
    issues.push(issue("no-asset-loads", `${prefix}.assetLoadUrl`, "Asset reference descriptors must not load GLB, texture, image or audio assets.", "error", true));
  }

  if (descriptor.assetByteUrl !== null || descriptor.fetchesAssetBytes) {
    issues.push(issue("no-asset-byte-fetch", `${prefix}.assetByteUrl`, "Asset reference descriptors must not fetch asset bytes.", "error", true));
  }

  if (descriptor.finalAssetRole !== null || descriptor.resolvesFinalAssetRoles) {
    issues.push(issue("no-final-asset-role-mapping", `${prefix}.finalAssetRole`, "Asset reference descriptors must not finalize asset roles.", "error", true));
  }

  if (descriptor.rendererInstruction !== null || descriptor.rendersScene) {
    issues.push(issue("no-renderer-draw-calls", `${prefix}.rendererInstruction`, "Asset reference descriptors must not contain renderer instructions or draw calls.", "error", true));
  }

  if (descriptor.containsConcreteGameContent) {
    issues.push(issue("no-concrete-content", `${prefix}.containsConcreteGameContent`, "Asset reference descriptors must not contain concrete gamecontent.", "error", true));
  }

  return issues;
}

function validateCandidate(
  candidate: RuntimeAssetReferenceCandidate,
  prefix: string
): readonly RuntimeAssetReferencePlanningValidationIssue[] {
  const issues: RuntimeAssetReferencePlanningValidationIssue[] = [];

  if (candidate.metadataOnly !== true) {
    issues.push(issue("safety-flags", `${prefix}.metadataOnly`, "Asset reference candidates must stay metadata-only.", "error", true));
  }

  if (candidate.assetLoadUrl !== null || candidate.loadsAssets) {
    issues.push(issue("no-asset-loads", `${prefix}.assetLoadUrl`, "Asset reference candidates must not load assets.", "error", true));
  }

  if (candidate.assetByteUrl !== null || candidate.fetchesAssetBytes) {
    issues.push(issue("no-asset-byte-fetch", `${prefix}.assetByteUrl`, "Asset reference candidates must not fetch asset bytes.", "error", true));
  }

  if (candidate.finalAssetRole !== null || candidate.assetRoleHint !== null || candidate.resolvesFinalAssetRoles) {
    issues.push(issue("no-final-asset-role-mapping", `${prefix}.finalAssetRole`, "Asset reference candidates must not finalize roles or assign role hints.", "error", true));
  }

  if (candidate.assetLibraryId !== null) {
    issues.push(issue("no-final-asset-role-mapping", `${prefix}.assetLibraryId`, "Fase 15 candidates must not bind to a concrete asset-library item.", "error", true));
  }

  return issues;
}

function validateAssetReferenceIndicators(state: RuntimeAssetReferencePlanningState): readonly RuntimeAssetReferencePlanningValidationIssue[] {
  const issues: RuntimeAssetReferencePlanningValidationIssue[] = [];

  for (const [index, value] of state.assetLoadUrls.entries()) {
    issues.push(issue("no-asset-loads", `assetLoadUrls.${index}`, `Asset reference planning must not load assets: ${value}.`, "error", true));
  }

  for (const [index, value] of state.assetByteFetchUrls.entries()) {
    issues.push(issue("no-asset-byte-fetch", `assetByteFetchUrls.${index}`, `Asset reference planning must not fetch asset bytes: ${value}.`, "error", true));
  }

  if (state.finalAssetRoleIndicators.length > 0) {
    issues.push(issue("no-final-asset-role-mapping", "finalAssetRoleIndicators", "Asset reference planning must not finalize asset or GLB roles.", "error", true));
  }

  if (state.concreteContentIndicators.length > 0) {
    issues.push(issue("no-concrete-content", "concreteContentIndicators", "Asset reference planning must not carry concrete world, NPC, quest or economy payloads.", "error", true));
  }

  if (state.hardcodedRuntimeValueIndicators.length > 0) {
    issues.push(issue("no-hardcoded-runtime-values", "hardcodedRuntimeValueIndicators", "Asset reference planning must not hardcode world, camera, lighting, HUD, minimap or audio values.", "error", true));
  }

  if (state.rendererDrawCallIndicators.length > 0) {
    issues.push(issue("no-renderer-draw-calls", "rendererDrawCallIndicators", "Asset reference planning must not call renderer draw APIs.", "error", true));
  }

  return issues;
}

function validateAssetReferenceErrors(state: RuntimeAssetReferencePlanningState): readonly RuntimeAssetReferencePlanningValidationIssue[] {
  return state.errors.flatMap((error, index) => {
    const issues: RuntimeAssetReferencePlanningValidationIssue[] = [];
    const prefix = `errors.${index}`;

    if (error.safeForDisplay !== true || error.containsSecret !== false) {
      issues.push(issue("safety-flags", prefix, "Asset reference planning errors must be safe for display and contain no secrets.", "error", true));
    }

    if (error.sourceId && isEditorAdminReference(error.sourceId)) {
      issues.push(issue("no-editor-admin-routes", `${prefix}.sourceId`, "Asset reference planning errors must not reference editor/admin routes.", "error", true));
    }

    if (error.sourceId && isAssetBinaryReference(error.sourceId)) {
      issues.push(issue("no-asset-loads", `${prefix}.sourceId`, "Asset reference planning errors must not reference asset byte URLs.", "error", true));
    }

    return issues;
  });
}

function isEditorAdminReference(value: string): boolean {
  return value.startsWith("/editor") || value.startsWith("/auth/editor") || value.includes("/editor/");
}

function isAssetBinaryReference(value: string): boolean {
  return /\/assets\//i.test(value) || /\.(glb|gltf|png|jpe?g|webp|gif|mp3|wav|ogg)(\?|$)/i.test(value);
}

function issue(
  gate: RuntimeAssetReferencePlanningValidationGate,
  path: string,
  message: string,
  severity: RuntimeAssetReferencePlanningValidationIssue["severity"],
  blocksAssetReferencePlanning: boolean
): RuntimeAssetReferencePlanningValidationIssue {
  return { gate, path, message, severity, blocksAssetReferencePlanning };
}

function dedupeIssues(
  issues: readonly RuntimeAssetReferencePlanningValidationIssue[]
): readonly RuntimeAssetReferencePlanningValidationIssue[] {
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
