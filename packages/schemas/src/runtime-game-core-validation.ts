import {
  RUNTIME_CLIENT_PROJECTION_READ_ROUTES
} from "./runtime-client-shell.js";
import {
  createRuntimeGameCoreValidationResult,
  isRuntimeGameCoreLifecycleState,
  type RuntimeGameCoreState,
  type RuntimeGameCoreValidationGate,
  type RuntimeGameCoreValidationIssue,
  type RuntimeGameCoreValidationResult,
  type RuntimeGameCoreSafetyFlags
} from "./runtime-game-core.js";

export function validateRuntimeGameCoreState(
  state: RuntimeGameCoreState
): RuntimeGameCoreValidationResult {
  const issues = dedupeIssues([
    ...validateRuntimeGameCoreSafetyFlags(state.safetyFlags),
    ...validateRuntimeGameCoreSource(state),
    ...validateRuntimeGameCoreAdapters(state),
    ...validateRuntimeGameCoreIndicators(state),
    ...validateRuntimeGameCoreDiagnostics(state)
  ]);

  return createRuntimeGameCoreValidationResult({
    issues,
    safetyFlags: state.safetyFlags
  });
}

export function validateRuntimeGameCoreSafetyFlags(
  flags: RuntimeGameCoreSafetyFlags,
  prefix = "safetyFlags"
): readonly RuntimeGameCoreValidationIssue[] {
  const issues: RuntimeGameCoreValidationIssue[] = [];

  if (!flags.consumesPublishedReadModel || !flags.consumesRuntimeProjectionReadModel || !flags.consumesRuntimeAssetReferencePlan) {
    issues.push(issue("published-read-model-only", `${prefix}.consumesPublishedReadModel`, "Runtime Game Core must boot from published runtime read-model and asset-reference contracts.", "error", true));
  }

  if (!flags.bootsRuntimeGame) {
    issues.push(issue("safety-flags", `${prefix}.bootsRuntimeGame`, "Fase 17 must expose the Runtime Game Core boot boundary.", "error", true));
  }

  if (flags.usesEditorAdminRoutes) {
    issues.push(issue("no-editor-admin-routes", `${prefix}.usesEditorAdminRoutes`, "Runtime Game Core must not use editor/admin routes.", "error", true));
  }

  if (flags.usesEditorDraftData || flags.readsDraftData) {
    issues.push(issue("no-editor-draft-data", `${prefix}.usesEditorDraftData`, "Runtime Game Core must not use draft, candidate or editor-only data.", "error", true));
  }

  if (flags.loadsAssets || flags.fetchesAssetBytes) {
    issues.push(issue("no-hidden-asset-loads", `${prefix}.loadsAssets`, "Fase 17 must not hide asset byte loads inside Runtime Game Core.", "error", true));
  }

  if (flags.resolvesFinalAssetRoles) {
    issues.push(issue("runtime-asset-reference-plan-only", `${prefix}.resolvesFinalAssetRoles`, "Runtime Game Core cannot finalize asset roles outside published data.", "error", true));
  }

  if (flags.rendersConcreteWorld || flags.rendererDrawCalls) {
    issues.push(issue("safety-flags", `${prefix}.rendersConcreteWorld`, "Runtime Game Core boot cannot perform renderer draw calls.", "error", true));
  }

  if (
    flags.implementsQuestRuntime
    || flags.implementsDialogueRuntime
    || flags.implementsEconomyRuntime
    || flags.implementsCombat
    || flags.implementsMovement
    || flags.implementsMultiplayer
    || flags.implementsAudioPlayback
  ) {
    issues.push(issue("no-quest-combat-economy-multiplayer", `${prefix}.runtimeFeatures`, "Fase 17 must not implement later content, movement, combat, multiplayer or audio playback systems.", "error", true));
  }

  if (
    flags.hardcodesWorld
    || flags.hardcodesCamera
    || flags.hardcodesLighting
    || flags.hardcodesHud
    || flags.hardcodesMinimap
    || flags.hardcodesAudio
    || flags.hardcodesContent
  ) {
    issues.push(issue("no-hardcoded-content", `${prefix}.hardcodedValues`, "Runtime Game Core must not hardcode world, camera, lighting, HUD, minimap, audio or content values.", "error", true));
  }

  if (flags.mutatesAssets || flags.mutatesPublishedData) {
    issues.push(issue("safety-flags", `${prefix}.mutations`, "Runtime Game Core must not mutate assets or published read-model data.", "error", true));
  }

  if (!flags.hasPlayerSessionBootstrap) {
    issues.push(issue("player-session-bootstrap", `${prefix}.hasPlayerSessionBootstrap`, "Runtime Game Core needs a player session bootstrap contract.", "error", true));
  }

  if (!flags.hasInputAdapter) {
    issues.push(issue("input-adapter-boundary", `${prefix}.hasInputAdapter`, "Runtime Game Core needs an input intent adapter boundary.", "error", true));
  }

  if (!flags.hasSaveLoadBasis || flags.persistsConcreteContent) {
    issues.push(issue("save-load-basis", `${prefix}.hasSaveLoadBasis`, "Runtime Game Core needs a save/load basis that persists runtime state only.", "error", true));
  }

  return issues;
}

function validateRuntimeGameCoreSource(state: RuntimeGameCoreState): readonly RuntimeGameCoreValidationIssue[] {
  const issues: RuntimeGameCoreValidationIssue[] = [];

  if (state.phase !== "phase-17" || state.marker !== "phase-17") {
    issues.push(issue("safety-flags", "phase", "Runtime Game Core must identify Fase 17 explicitly.", "error", true));
  }

  if (!isRuntimeGameCoreLifecycleState(state.status.lifecycle) || state.status.status !== state.status.lifecycle) {
    issues.push(issue("safety-flags", "status.lifecycle", "Runtime Game Core lifecycle/status must be valid and mirrored.", "error", true));
  }

  if (state.source.sourceKind !== "published-read-model" || state.source.runtimeReadable !== true) {
    issues.push(issue("published-read-model-only", "source", "Runtime Game Core source must be published runtime read-model data.", "error", true));
  }

  if (state.source.usesEditorAdminRoutes || state.source.usesEditorDraftData || state.source.leaksEditorDraftData) {
    issues.push(issue("no-editor-draft-data", "source.runtimeBoundary", "Runtime Game Core source must not use editor/admin or draft sources.", "error", true));
  }

  if (state.source.containsConcreteGameContent) {
    issues.push(issue("no-hardcoded-content", "source.containsConcreteGameContent", "Runtime Game Core source cannot carry concrete gamecontent payloads.", "error", true));
  }

  for (const [index, route] of state.projectionRoutes.entries()) {
    if (!RUNTIME_CLIENT_PROJECTION_READ_ROUTES.includes(route)) {
      issues.push(issue("published-read-model-only", `projectionRoutes.${index}`, "Runtime Game Core may only read runtime projection read-only routes.", "error", true));
    }
  }

  if (state.assetReferencePlanning.phase !== "phase-15" || state.assetReferencePlanning.safetyFlags.usesEditorDraftData || state.assetReferencePlanning.safetyFlags.usesEditorAdminRoutes) {
    issues.push(issue("runtime-asset-reference-plan-only", "assetReferencePlanning", "Runtime Game Core must consume the Fase 15 runtime asset-reference planning contract.", "error", true));
  }

  return issues;
}

function validateRuntimeGameCoreAdapters(state: RuntimeGameCoreState): readonly RuntimeGameCoreValidationIssue[] {
  const issues: RuntimeGameCoreValidationIssue[] = [];

  if (state.assetReferenceResolver.loadsAssets || state.assetReferenceResolver.fetchesAssetBytes || state.assetReferenceResolver.resolvesFinalAssetRoles) {
    issues.push(issue("no-hidden-asset-loads", "assetReferenceResolver", "Runtime Game Core asset resolver must stay contract-only in Fase 17.", "error", true));
  }

  if (!state.assetReferenceResolver.metadataOnly || state.assetReferenceResolver.usesEditorDraftData || state.assetReferenceResolver.rendererInstruction !== null) {
    issues.push(issue("runtime-asset-reference-plan-only", "assetReferenceResolver.metadataOnly", "Runtime Game Core asset resolver must consume metadata-only reference plans.", "error", true));
  }

  if (state.worldBootstrap.source !== "published-read-model" || state.worldBootstrap.containsConcreteGameContent) {
    issues.push(issue("published-read-model-only", "worldBootstrap", "World bootstrap must use published read-model data and no concrete runtime payloads.", "error", true));
  }

  if (
    state.worldBootstrap.hardcodesWorld
    || state.worldBootstrap.hardcodesCamera
    || state.worldBootstrap.hardcodesLighting
    || state.worldBootstrap.hardcodesHud
    || state.worldBootstrap.hardcodesMinimap
  ) {
    issues.push(issue("no-hardcoded-content", "worldBootstrap.hardcodedValues", "World bootstrap must not hardcode runtime values.", "error", true));
  }

  if (state.playerSession.containsPlayerContent) {
    issues.push(issue("player-session-bootstrap", "playerSession.containsPlayerContent", "Player session bootstrap must not invent player content.", "error", true));
  }

  if (state.inputAdapter.bindsMovement || state.inputAdapter.bindsCombat || state.inputAdapter.mutatesWorldDirectly) {
    issues.push(issue("input-adapter-boundary", "inputAdapter", "Fase 17 input adapter must not implement movement, combat or direct world mutation.", "error", true));
  }

  if (state.capabilityAdapters.hardcodesCamera || state.capabilityAdapters.hardcodesHud || state.capabilityAdapters.hardcodesAudio || state.capabilityAdapters.implementsAudioPlayback) {
    issues.push(issue("no-hardcoded-content", "capabilityAdapters", "Camera, HUD and audio adapters must remain published-data-required capability points.", "error", true));
  }

  if (state.saveLoad.status === "unavailable" || state.saveLoad.persistsConcreteContent || state.saveLoad.mutatesPublishedData) {
    issues.push(issue("save-load-basis", "saveLoad", "Save/load must provide a runtime-state envelope without concrete content or published-data mutation.", "error", true));
  }

  return issues;
}

function validateRuntimeGameCoreIndicators(state: RuntimeGameCoreState): readonly RuntimeGameCoreValidationIssue[] {
  const issues: RuntimeGameCoreValidationIssue[] = [];

  for (const [index, value] of state.editorRouteIndicators.entries()) {
    issues.push(issue("no-editor-admin-routes", `editorRouteIndicators.${index}`, `Runtime Game Core must not reference editor/admin routes: ${value}.`, "error", true));
  }

  for (const [index, value] of state.draftDataIndicators.entries()) {
    issues.push(issue("no-editor-draft-data", `draftDataIndicators.${index}`, `Runtime Game Core must not reference draft data: ${value}.`, "error", true));
  }

  for (const [index, value] of state.assetLoadUrls.entries()) {
    issues.push(issue("no-hidden-asset-loads", `assetLoadUrls.${index}`, `Runtime Game Core must not load asset URLs during Fase 17: ${value}.`, "error", true));
  }

  for (const [index, value] of state.assetByteFetchUrls.entries()) {
    issues.push(issue("no-hidden-asset-loads", `assetByteFetchUrls.${index}`, `Runtime Game Core must not fetch asset bytes during Fase 17: ${value}.`, "error", true));
  }

  if (state.hardcodedRuntimeValueIndicators.length > 0 || state.concreteContentIndicators.length > 0) {
    issues.push(issue("no-hardcoded-content", "hardcodedRuntimeValueIndicators", "Runtime Game Core must not hardcode runtime values or concrete content.", "error", true));
  }

  if (state.runtimeFeatureIndicators.length > 0) {
    issues.push(issue("no-quest-combat-economy-multiplayer", "runtimeFeatureIndicators", "Runtime Game Core cannot include later content, movement, combat, multiplayer or audio systems in Fase 17.", "error", true));
  }

  return issues;
}

function validateRuntimeGameCoreDiagnostics(state: RuntimeGameCoreState): readonly RuntimeGameCoreValidationIssue[] {
  const issues: RuntimeGameCoreValidationIssue[] = [];
  const blocksRuntime = state.diagnostics.some((diagnostic) => diagnostic.blocksRuntimeGame);

  if (state.status.blockedByMissingPublishedData !== blocksRuntime) {
    issues.push(issue("diagnostics", "status.blockedByMissingPublishedData", "Runtime Game Core status must mirror blocking diagnostics.", "error", true));
  }

  if (state.status.diagnosticCount !== state.diagnostics.length) {
    issues.push(issue("diagnostics", "status.diagnosticCount", "Runtime Game Core status must report the diagnostic count.", "error", true));
  }

  for (const [index, diagnostic] of state.diagnostics.entries()) {
    const prefix = `diagnostics.${index}`;

    if (!diagnostic.safeForDisplay || diagnostic.containsSecret) {
      issues.push(issue("diagnostics", prefix, "Runtime Game Core diagnostics must be safe for display and contain no secrets.", "error", true));
    }

    if (isEditorOrDraftReference(diagnostic.path) || isEditorOrDraftReference(diagnostic.message)) {
      issues.push(issue("no-editor-draft-data", prefix, "Runtime Game Core diagnostics must not expose editor/admin or draft references.", "error", true));
    }

    if (isAssetBinaryReference(diagnostic.path) || isAssetBinaryReference(diagnostic.message)) {
      issues.push(issue("no-hidden-asset-loads", prefix, "Runtime Game Core diagnostics must not expose asset byte URLs.", "error", true));
    }
  }

  return issues;
}

function isEditorOrDraftReference(value: string): boolean {
  return value.startsWith("/editor") || value.startsWith("/auth/editor") || value.includes("/editor/") || /draft|candidate/i.test(value);
}

function isAssetBinaryReference(value: string): boolean {
  return /\/assets\//i.test(value) || /\.(glb|gltf|png|jpe?g|webp|gif|mp3|wav|ogg)(\?|$)/i.test(value);
}

function issue(
  gate: RuntimeGameCoreValidationGate,
  path: string,
  message: string,
  severity: RuntimeGameCoreValidationIssue["severity"],
  blocksRuntimeGameCore: boolean
): RuntimeGameCoreValidationIssue {
  return { gate, path, message, severity, blocksRuntimeGameCore };
}

function dedupeIssues(
  issues: readonly RuntimeGameCoreValidationIssue[]
): readonly RuntimeGameCoreValidationIssue[] {
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