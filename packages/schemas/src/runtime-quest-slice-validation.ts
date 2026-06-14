import {
  createRuntimeQuestSliceValidationResult,
  isRuntimeQuestSliceLifecycleState,
  type RuntimeQuestSliceSafetyFlags,
  type RuntimeQuestSliceState,
  type RuntimeQuestSliceValidationGate,
  type RuntimeQuestSliceValidationIssue,
  type RuntimeQuestSliceValidationResult
} from "./runtime-quest-slice.js";

export function validateRuntimeQuestSliceState(
  state: RuntimeQuestSliceState
): RuntimeQuestSliceValidationResult {
  const issues = dedupeIssues([
    ...validateRuntimeQuestSliceSafetyFlags(state.safetyFlags),
    ...validateRuntimeQuestSliceSource(state),
    ...validateRuntimeQuestSliceExecutors(state),
    ...validateRuntimeQuestSliceIndicators(state),
    ...validateRuntimeQuestSliceDiagnostics(state)
  ]);

  return createRuntimeQuestSliceValidationResult({
    issues,
    safetyFlags: state.safetyFlags
  });
}

export function validateRuntimeQuestSliceSafetyFlags(
  flags: RuntimeQuestSliceSafetyFlags,
  prefix = "safetyFlags"
): readonly RuntimeQuestSliceValidationIssue[] {
  const issues: RuntimeQuestSliceValidationIssue[] = [];

  if (!flags.consumesPublishedReadModel || !flags.consumesRuntimeProjectionReadModel) {
    issues.push(issue("published-quest-read-model-only", `${prefix}.consumesPublishedReadModel`, "Fase 18 quest slice must consume only published runtime projection read-model data.", "error", true));
  }

  if (flags.usesEditorAdminRoutes) {
    issues.push(issue("no-editor-admin-routes", `${prefix}.usesEditorAdminRoutes`, "Fase 18 runtime must not use editor/admin routes.", "error", true));
  }

  if (flags.usesEditorDraftData || flags.readsDraftData) {
    issues.push(issue("no-editor-draft-data", `${prefix}.usesEditorDraftData`, "Fase 18 runtime must not consume editor draft or candidate data.", "error", true));
  }

  if (flags.hardcodesQuestContent || flags.containsConcreteQuestContent) {
    issues.push(issue("no-hardcoded-quest-content", `${prefix}.hardcodesQuestContent`, "Quest content must come from published node-data, not runtime constants.", "error", true));
  }

  if (flags.mutatesPublishedData) {
    issues.push(issue("published-quest-read-model-only", `${prefix}.mutatesPublishedData`, "Fase 18 runtime state must not mutate published data.", "error", true));
  }

  if (flags.loadsAssets || flags.fetchesAssetBytes || flags.resolvesFinalAssetRoles) {
    issues.push(issue("asset-role-blockers", `${prefix}.assetRoles`, "Fase 18 may expose unresolved asset-role blockers, but it may not load assets, fetch bytes or assign final roles.", "error", true));
  }

  if (!flags.supportsNonVisualBlockedSlice || !flags.exposesUnresolvedAssetRoleBlockers) {
    issues.push(issue("asset-role-blockers", `${prefix}.supportsNonVisualBlockedSlice`, "Fase 18 must expose non-visual blocked asset-role state while roles are unresolved.", "error", true));
  }

  if (!flags.implementsQuestRuntime) {
    issues.push(issue("quest-state-machine", `${prefix}.implementsQuestRuntime`, "Fase 18 must expose a generic quest state machine.", "error", true));
  }

  if (!flags.implementsDialogueRuntime) {
    issues.push(issue("dialogue-executor", `${prefix}.implementsDialogueRuntime`, "Fase 18 must expose a generic dialogue executor.", "error", true));
  }

  if (!flags.implementsObjectiveRuntime || !flags.implementsInteractableRuntime) {
    issues.push(issue("objective-executor", `${prefix}.implementsObjectiveRuntime`, "Fase 18 must expose generic objective and interactable execution.", "error", true));
  }

  if (!flags.implementsRewardRuntime) {
    issues.push(issue("reward-executor", `${prefix}.implementsRewardRuntime`, "Fase 18 must expose generic reward application.", "error", true));
  }

  if (!flags.implementsCheckpointRuntime) {
    issues.push(issue("checkpoint-state", `${prefix}.implementsCheckpointRuntime`, "Fase 18 must expose generic checkpoint state.", "error", true));
  }

  if (!flags.implementsSaveLoadState) {
    issues.push(issue("save-load-state", `${prefix}.implementsSaveLoadState`, "Fase 18 must save runtime quest/dialogue/checkpoint state only.", "error", true));
  }

  if (flags.implementsCombat || flags.implementsEconomyRuntime || flags.implementsMovement || flags.implementsMultiplayer || flags.implementsAudioPlayback) {
    issues.push(issue("safety-flags", `${prefix}.laterRuntimeSystems`, "Fase 18 must not open combat, economy, movement, multiplayer or audio playback.", "error", true));
  }

  return issues;
}

function validateRuntimeQuestSliceSource(state: RuntimeQuestSliceState): readonly RuntimeQuestSliceValidationIssue[] {
  const issues: RuntimeQuestSliceValidationIssue[] = [];

  if (state.phase !== "phase-18" || state.marker !== "phase-18") {
    issues.push(issue("safety-flags", "phase", "Runtime quest slice must identify Fase 18 explicitly.", "error", true));
  }

  if (!isRuntimeQuestSliceLifecycleState(state.status.lifecycle) || state.status.status !== state.status.lifecycle) {
    issues.push(issue("safety-flags", "status.lifecycle", "Runtime quest slice lifecycle/status must be valid and mirrored.", "error", true));
  }

  if (state.source.sourceKind !== "published-quest-slice-read-model" || state.source.runtimeReadable !== true) {
    issues.push(issue("published-quest-read-model-only", "source", "Runtime quest slice source must be a published runtime read-model.", "error", true));
  }

  if (state.source.usesEditorAdminRoutes || state.source.usesEditorDraftData || state.source.leaksEditorDraftData) {
    issues.push(issue("no-editor-draft-data", "source.runtimeBoundary", "Runtime quest slice source must not use editor/admin or draft sources.", "error", true));
  }

  if (state.source.hardcodesQuestContent || state.source.containsConcreteQuestContent) {
    issues.push(issue("no-hardcoded-quest-content", "source.hardcodesQuestContent", "Runtime quest slice source cannot hardcode quest content.", "error", true));
  }

  return issues;
}

function validateRuntimeQuestSliceExecutors(state: RuntimeQuestSliceState): readonly RuntimeQuestSliceValidationIssue[] {
  const issues: RuntimeQuestSliceValidationIssue[] = [];

  if (!state.questStateMachine.mutatesViaExecutors || state.questStateMachine.allowsUiDirectMutation || state.questStateMachine.hardcodesQuestContent) {
    issues.push(issue("quest-state-machine", "questStateMachine", "Quest mutations must flow through executors and must not hardcode quest content.", "error", true));
  }

  if (!state.dialogueExecutor.advancesByDialogueState || state.dialogueExecutor.hardcodesDialogueLines) {
    issues.push(issue("dialogue-executor", "dialogueExecutor", "Dialogue must advance by runtime dialogue state and published lines only.", "error", true));
  }

  if (!state.objectiveEvaluator.mutatesQuestState || state.objectiveEvaluator.mutatesWorldDirectly || state.objectiveEvaluator.allowsUiClickCompletion) {
    issues.push(issue("objective-executor", "objectiveEvaluator", "Objectives must mutate quest state through the evaluator, not direct UI or world mutation.", "error", true));
  }

  if (!state.rewardApplicator.grantsFromPublishedDataOnly || state.rewardApplicator.grantsUnconfirmedUnlocks || state.rewardApplicator.mutatesPublishedData) {
    issues.push(issue("reward-executor", "rewardApplicator", "Rewards and unlocks must be granted from published data only.", "error", true));
  }

  if (!state.checkpointFlow.restoresRuntimeStateOnly || state.checkpointFlow.hardcodesSpawnpoints) {
    issues.push(issue("checkpoint-state", "checkpointFlow", "Checkpoints must restore runtime state only and cannot hardcode spawnpoints.", "error", true));
  }

  if (state.saveLoad.status === "unavailable" || !state.saveLoad.savesRuntimeStateOnly || state.saveLoad.persistsSourceContent || state.saveLoad.mutatesPublishedData) {
    issues.push(issue("save-load-state", "saveLoad", "Quest slice save/load must persist runtime state only.", "error", true));
  }

  for (const [index, blocker] of state.assetRoleBlockers.entries()) {
    if (!blocker.safeForDisplay || blocker.containsSecret || !blocker.blocksVisualSlice || !blocker.blocksRuntimeCompletion) {
      issues.push(issue("asset-role-blockers", `assetRoleBlockers.${index}`, "Asset-role blockers must be visible, safe and blocking while roles are unresolved.", "error", true));
    }
  }

  return issues;
}

function validateRuntimeQuestSliceIndicators(state: RuntimeQuestSliceState): readonly RuntimeQuestSliceValidationIssue[] {
  const issues: RuntimeQuestSliceValidationIssue[] = [];

  for (const [index, value] of state.editorRouteIndicators.entries()) {
    issues.push(issue("no-editor-admin-routes", `editorRouteIndicators.${index}`, `Runtime quest slice must not reference editor/admin routes: ${value}.`, "error", true));
  }

  for (const [index, value] of state.draftDataIndicators.entries()) {
    issues.push(issue("no-editor-draft-data", `draftDataIndicators.${index}`, `Runtime quest slice must not reference draft data: ${value}.`, "error", true));
  }

  if (state.hardcodedQuestContentIndicators.length > 0) {
    issues.push(issue("no-hardcoded-quest-content", "hardcodedQuestContentIndicators", "Runtime quest slice must not hardcode quest content.", "error", true));
  }

  if (state.directUiMutationIndicators.length > 0) {
    issues.push(issue("quest-state-machine", "directUiMutationIndicators", "Runtime quest slice must not complete objectives through direct UI mutation.", "error", true));
  }

  for (const [index, value] of state.assetLoadUrls.entries()) {
    issues.push(issue("asset-role-blockers", `assetLoadUrls.${index}`, `Runtime quest slice must not load assets while asset roles are unresolved: ${value}.`, "error", true));
  }

  for (const [index, value] of state.assetByteFetchUrls.entries()) {
    issues.push(issue("asset-role-blockers", `assetByteFetchUrls.${index}`, `Runtime quest slice must not fetch asset bytes while asset roles are unresolved: ${value}.`, "error", true));
  }

  if (state.combatEconomyMovementIndicators.length > 0) {
    issues.push(issue("safety-flags", "combatEconomyMovementIndicators", "Fase 18 must not open combat, economy, movement, multiplayer or audio playback.", "error", true));
  }

  return issues;
}

function validateRuntimeQuestSliceDiagnostics(state: RuntimeQuestSliceState): readonly RuntimeQuestSliceValidationIssue[] {
  const issues: RuntimeQuestSliceValidationIssue[] = [];
  const blocksRuntime = state.diagnostics.some((diagnostic) => diagnostic.blocksRuntimeQuestSlice);
  const blockedByAssetRoles = state.assetRoleBlockers.length > 0;
  const blockedByMissingData = state.source.emptyPublishedReadModel || state.source.missingRequiredRecordTypes.length > 0;

  if (state.status.blockedByMissingPublishedData !== blockedByMissingData) {
    issues.push(issue("published-quest-read-model-only", "status.blockedByMissingPublishedData", "Runtime quest slice status must mirror missing published data.", "error", true));
  }

  if (state.status.blockedByUnresolvedAssetRoles !== blockedByAssetRoles) {
    issues.push(issue("asset-role-blockers", "status.blockedByUnresolvedAssetRoles", "Runtime quest slice status must mirror unresolved asset roles.", "error", true));
  }

  if (state.status.lifecycle === "ready" && blocksRuntime) {
    issues.push(issue("safety-flags", "status.lifecycle", "Runtime quest slice cannot be ready while blocking diagnostics exist.", "error", true));
  }

  if (state.status.diagnosticCount !== state.diagnostics.length) {
    issues.push(issue("safety-flags", "status.diagnosticCount", "Runtime quest slice status must report the diagnostic count.", "error", true));
  }

  for (const [index, diagnostic] of state.diagnostics.entries()) {
    const prefix = `diagnostics.${index}`;

    if (!diagnostic.safeForDisplay || diagnostic.containsSecret) {
      issues.push(issue("safety-flags", prefix, "Runtime quest slice diagnostics must be safe for display and contain no secrets.", "error", true));
    }

    if (isEditorOrDraftReference(diagnostic.path) || isEditorOrDraftReference(diagnostic.message)) {
      issues.push(issue("no-editor-draft-data", prefix, "Runtime quest slice diagnostics must not expose editor/admin or draft references.", "error", true));
    }

    if (isAssetBinaryReference(diagnostic.path) || isAssetBinaryReference(diagnostic.message)) {
      issues.push(issue("asset-role-blockers", prefix, "Runtime quest slice diagnostics must not expose asset byte URLs.", "error", true));
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
  gate: RuntimeQuestSliceValidationGate,
  path: string,
  message: string,
  severity: RuntimeQuestSliceValidationIssue["severity"],
  blocksRuntimeQuestSlice: boolean
): RuntimeQuestSliceValidationIssue {
  return { gate, path, message, severity, blocksRuntimeQuestSlice };
}

function dedupeIssues(
  issues: readonly RuntimeQuestSliceValidationIssue[]
): readonly RuntimeQuestSliceValidationIssue[] {
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
