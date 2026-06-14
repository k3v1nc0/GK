import {
  RUNTIME_QUEST_SLICE_MARKER,
  createRuntimeQuestSliceState,
  validateRuntimeQuestSliceState,
  type RuntimeQuestSliceState
} from "@gk/schemas";

export const RUNTIME_QUEST_SLICE_DATA_MARKER = RUNTIME_QUEST_SLICE_MARKER;

export interface RuntimeQuestSliceClientContract {
  readonly phase: typeof RUNTIME_QUEST_SLICE_MARKER;
  readonly method: "published-read-model";
  readonly credentials: "omit";
  readonly consumesPublishedReadModel: true;
  readonly usesEditorAdminRoutes: false;
  readonly usesEditorDraftData: false;
  readonly hardcodesQuestContent: false;
  readonly mutatesPublishedData: false;
  readonly loadsAssets: false;
  readonly fetchesAssetBytes: false;
  readonly resolvesFinalAssetRoles: false;
  readonly supportsNonVisualBlockedSlice: true;
  readonly exposesUnresolvedAssetRoleBlockers: true;
  readonly implementsQuestRuntime: true;
  readonly implementsDialogueRuntime: true;
  readonly implementsObjectiveRuntime: true;
  readonly implementsRewardRuntime: true;
  readonly implementsCheckpointRuntime: true;
  readonly implementsCombat: false;
  readonly implementsEconomyRuntime: false;
  readonly implementsMovement: false;
  readonly implementsMultiplayer: false;
  readonly implementsAudioPlayback: false;
}

export const runtimeQuestSliceClientContract: RuntimeQuestSliceClientContract = {
  phase: RUNTIME_QUEST_SLICE_MARKER,
  method: "published-read-model",
  credentials: "omit",
  consumesPublishedReadModel: true,
  usesEditorAdminRoutes: false,
  usesEditorDraftData: false,
  hardcodesQuestContent: false,
  mutatesPublishedData: false,
  loadsAssets: false,
  fetchesAssetBytes: false,
  resolvesFinalAssetRoles: false,
  supportsNonVisualBlockedSlice: true,
  exposesUnresolvedAssetRoleBlockers: true,
  implementsQuestRuntime: true,
  implementsDialogueRuntime: true,
  implementsObjectiveRuntime: true,
  implementsRewardRuntime: true,
  implementsCheckpointRuntime: true,
  implementsCombat: false,
  implementsEconomyRuntime: false,
  implementsMovement: false,
  implementsMultiplayer: false,
  implementsAudioPlayback: false
};

export function createRuntimeQuestSliceShellState(): RuntimeQuestSliceState {
  return createRuntimeQuestSliceState();
}

export function renderRuntimeQuestSliceSection(
  state: RuntimeQuestSliceState = createRuntimeQuestSliceShellState()
): string {
  const validation = validateRuntimeQuestSliceState(state);
  const model = escapeHtml(JSON.stringify({
    state: {
      phase: state.phase,
      marker: state.marker,
      status: state.status,
      source: state.source,
      readModelSummary: state.readModelSummary,
      questStateMachine: state.questStateMachine,
      dialogueExecutor: state.dialogueExecutor,
      objectiveEvaluator: state.objectiveEvaluator,
      rewardApplicator: state.rewardApplicator,
      checkpointFlow: state.checkpointFlow,
      saveLoad: state.saveLoad,
      assetRoleBlockers: state.assetRoleBlockers,
      diagnostics: state.diagnostics
    },
    validation: {
      valid: validation.valid,
      issueCount: validation.issues.length
    }
  }));
  const diagnostics = state.diagnostics.length === 0
    ? "Runtime quest slice is ready to consume published quest records."
    : state.diagnostics.map((diagnostic) => escapeHtml(diagnostic.message)).join(" ");
  const safetyFlags = [
    ["published", state.safetyFlags.consumesPublishedReadModel],
    ["editor", !state.safetyFlags.usesEditorAdminRoutes],
    ["draft", !state.safetyFlags.usesEditorDraftData],
    ["hardcode", !state.safetyFlags.hardcodesQuestContent],
    ["mutate", !state.safetyFlags.mutatesPublishedData],
    ["assets", !state.safetyFlags.loadsAssets],
    ["bytes", !state.safetyFlags.fetchesAssetBytes],
    ["roles", !state.safetyFlags.resolvesFinalAssetRoles],
    ["quest", state.safetyFlags.implementsQuestRuntime],
    ["dialogue", state.safetyFlags.implementsDialogueRuntime],
    ["objective", state.safetyFlags.implementsObjectiveRuntime],
    ["reward", state.safetyFlags.implementsRewardRuntime],
    ["checkpoint", state.safetyFlags.implementsCheckpointRuntime]
  ].map(([label, value]) => `<span>${escapeHtml(String(label))}: ${value === true ? "ok" : "blocked"}</span>`).join("");

  return `<section class="runtime-quest-slice" data-runtime-quest-slice="${RUNTIME_QUEST_SLICE_DATA_MARKER}" data-runtime-quest-lifecycle="${escapeHtml(state.status.lifecycle)}" data-runtime-quest-blocked-missing-data="${String(state.status.blockedByMissingPublishedData)}" data-runtime-quest-blocked-asset-roles="${String(state.status.blockedByUnresolvedAssetRoles)}" data-runtime-quest-non-visual-blocked="${String(state.status.nonVisualBlockedSlice)}" data-runtime-quest-uses-editor-routes="${String(state.safetyFlags.usesEditorAdminRoutes)}" data-runtime-quest-uses-draft-data="${String(state.safetyFlags.usesEditorDraftData)}" data-runtime-quest-loads-assets="${String(state.safetyFlags.loadsAssets)}" data-runtime-quest-fetches-bytes="${String(state.safetyFlags.fetchesAssetBytes)}" data-runtime-quest-finalizes-roles="${String(state.safetyFlags.resolvesFinalAssetRoles)}" data-runtime-quest-hardcodes-content="${String(state.safetyFlags.hardcodesQuestContent)}" aria-label="Runtime Quest Slice">
  <div class="runtime-quest-header">
    <div>
      <h2>Runtime Quest Slice</h2>
      <p class="muted">Published read-model execution boundary for quest, dialogue, objectives, rewards and checkpoints.</p>
    </div>
    <div class="status-pill" data-runtime-quest-status>${escapeHtml(state.status.status)}</div>
  </div>
  <div class="runtime-quest-panel" data-runtime-quest-diagnostics="${String(state.diagnostics.length)}" data-runtime-quest-unresolved-asset-roles="${String(state.assetRoleBlockers.length)}">
    <p>${diagnostics}</p>
  </div>
  <div class="runtime-quest-grid" aria-label="Runtime quest slice metadata">
    <span data-runtime-quest-record-count>quest records: ${String(state.source.questRecordCount)}</span>
    <span data-runtime-dialogue-record-count>dialogue records: ${String(state.source.dialogueRecordCount)}</span>
    <span data-runtime-objective-record-count>objective records: ${String(state.source.objectiveRecordCount)}</span>
    <span data-runtime-interactable-record-count>interactable records: ${String(state.source.interactableRecordCount)}</span>
    <span data-runtime-reward-record-count>reward records: ${String(state.source.rewardRecordCount)}</span>
    <span data-runtime-checkpoint-record-count>checkpoint records: ${String(state.source.checkpointRecordCount)}</span>
    <span data-runtime-asset-role-record-count>asset-role records: ${String(state.source.assetRoleRecordCount)}</span>
    <span data-runtime-asset-role-blocker-count>asset-role blockers: ${String(state.assetRoleBlockers.length)}</span>
    <span data-runtime-quest-save-key>save state: ${escapeHtml(state.saveLoad.status)}</span>
    ${safetyFlags}
  </div>
  <script id="runtime-quest-slice-model" type="application/json">${model}</script>
</section>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const escaped: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    };

    return escaped[char] ?? char;
  });
}
