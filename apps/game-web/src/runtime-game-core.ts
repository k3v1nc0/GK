import {
  RUNTIME_GAME_CORE_MARKER,
  createRuntimeGameCoreState,
  validateRuntimeGameCoreState,
  type RuntimeGameCoreState
} from "@gk/schemas";

import { createRuntimeAssetReferencePlanningShellState } from "./runtime-asset-reference-planning.js";

export const RUNTIME_GAME_CORE_DATA_MARKER = RUNTIME_GAME_CORE_MARKER;

export interface RuntimeGameCoreClientContract {
  readonly phase: typeof RUNTIME_GAME_CORE_MARKER;
  readonly method: "published-read-model";
  readonly credentials: "omit";
  readonly consumesPublishedReadModel: true;
  readonly consumesRuntimeAssetReferencePlan: true;
  readonly bootsRuntimeGame: true;
  readonly usesEditorAdminRoutes: false;
  readonly usesEditorDraftData: false;
  readonly loadsAssets: false;
  readonly fetchesAssetBytes: false;
  readonly resolvesFinalAssetRoles: false;
  readonly rendersConcreteWorld: false;
  readonly rendererDrawCalls: false;
  readonly implementsMovement: false;
  readonly implementsCombat: false;
  readonly implementsAudioPlayback: false;
  readonly hardcodesWorld: false;
  readonly hardcodesCamera: false;
  readonly hardcodesLighting: false;
  readonly hardcodesHud: false;
  readonly hardcodesMinimap: false;
  readonly hardcodesAudio: false;
  readonly hardcodesContent: false;
  readonly mutatesAssets: false;
  readonly mutatesPublishedData: false;
  readonly hasPlayerSessionBootstrap: true;
  readonly hasInputAdapter: true;
  readonly hasSaveLoadBasis: true;
}

export const runtimeGameCoreClientContract: RuntimeGameCoreClientContract = {
  phase: RUNTIME_GAME_CORE_MARKER,
  method: "published-read-model",
  credentials: "omit",
  consumesPublishedReadModel: true,
  consumesRuntimeAssetReferencePlan: true,
  bootsRuntimeGame: true,
  usesEditorAdminRoutes: false,
  usesEditorDraftData: false,
  loadsAssets: false,
  fetchesAssetBytes: false,
  resolvesFinalAssetRoles: false,
  rendersConcreteWorld: false,
  rendererDrawCalls: false,
  implementsMovement: false,
  implementsCombat: false,
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
  hasSaveLoadBasis: true
};

export function createRuntimeGameCoreShellState(): RuntimeGameCoreState {
  return createRuntimeGameCoreState({
    assetReferencePlanning: createRuntimeAssetReferencePlanningShellState()
  });
}

export function renderRuntimeGameCoreSection(
  state: RuntimeGameCoreState = createRuntimeGameCoreShellState()
): string {
  const validation = validateRuntimeGameCoreState(state);
  const model = escapeHtml(JSON.stringify({
    state: {
      phase: state.phase,
      marker: state.marker,
      status: state.status,
      source: state.source,
      worldBootstrap: state.worldBootstrap,
      playerSession: state.playerSession,
      inputAdapter: state.inputAdapter,
      saveLoad: state.saveLoad,
      diagnostics: state.diagnostics
    },
    validation: {
      valid: validation.valid,
      issueCount: validation.issues.length
    }
  }));
  const diagnostics = state.diagnostics.length === 0
    ? "Runtime Game Core is ready for published read-model boot."
    : state.diagnostics.map((diagnostic) => escapeHtml(diagnostic.message)).join(" ");
  const safetyFlags = [
    ["published", state.safetyFlags.consumesPublishedReadModel],
    ["asset plan", state.safetyFlags.consumesRuntimeAssetReferencePlan],
    ["boot", state.safetyFlags.bootsRuntimeGame],
    ["editor", !state.safetyFlags.usesEditorAdminRoutes],
    ["draft", !state.safetyFlags.usesEditorDraftData],
    ["loads", !state.safetyFlags.loadsAssets],
    ["bytes", !state.safetyFlags.fetchesAssetBytes],
    ["roles", !state.safetyFlags.resolvesFinalAssetRoles],
    ["movement", !state.safetyFlags.implementsMovement],
    ["combat", !state.safetyFlags.implementsCombat],
    ["audio", !state.safetyFlags.implementsAudioPlayback],
    ["content", !state.safetyFlags.hardcodesContent]
  ].map(([label, value]) => `<span>${escapeHtml(String(label))}: ${value === true ? "ok" : "blocked"}</span>`).join("");

  return `<section class="runtime-game-core" data-runtime-game-core="${RUNTIME_GAME_CORE_DATA_MARKER}" data-runtime-game-lifecycle="${escapeHtml(state.status.lifecycle)}" data-runtime-game-bootable="${String(state.status.bootableFromPublishedData)}" data-runtime-game-blocked="${String(state.status.blockedByMissingPublishedData)}" data-runtime-game-uses-editor-routes="${String(state.safetyFlags.usesEditorAdminRoutes)}" data-runtime-game-uses-draft-data="${String(state.safetyFlags.usesEditorDraftData)}" data-runtime-game-loads-assets="${String(state.safetyFlags.loadsAssets)}" data-runtime-game-fetches-bytes="${String(state.safetyFlags.fetchesAssetBytes)}" data-runtime-game-hardcodes-content="${String(state.safetyFlags.hardcodesContent)}" data-runtime-game-save-load="contract-ready" aria-label="Runtime Game Core">
  <div class="runtime-game-header">
    <div>
      <h2>Runtime Game Core</h2>
      <p class="muted">Published read-model boot boundary with player session, input and save-state adapter points.</p>
    </div>
    <div class="status-pill" data-runtime-game-status>${escapeHtml(state.status.status)}</div>
  </div>
  <div class="runtime-game-panel" data-runtime-game-diagnostics="${String(state.diagnostics.length)}">
    <p>${diagnostics}</p>
  </div>
  <div class="runtime-game-grid" aria-label="Runtime game core metadata">
    <span data-runtime-game-record-count>records: ${String(state.source.projectionRecordCount)}</span>
    <span data-runtime-game-world-record-count>world records: ${String(state.worldBootstrap.worldRecordCount)}</span>
    <span data-runtime-game-asset-reference-count>asset references: ${String(state.assetReferenceResolver.descriptorCount)}</span>
    <span data-runtime-game-save-key>save state: ${escapeHtml(state.saveLoad.status)}</span>
    ${safetyFlags}
  </div>
  <script id="runtime-game-core-model" type="application/json">${model}</script>
  <script>
    (() => {
      const root = document.querySelector("[data-runtime-game-core='phase-17']");
      if (!root || !("localStorage" in window)) {
        return;
      }

      try {
        const key = "gk.runtime-game-core.probe";
        localStorage.setItem(key, JSON.stringify({ phase: "phase-17", status: "ok" }));
        localStorage.removeItem(key);
        root.setAttribute("data-runtime-game-save-load", "available");
      } catch {
        root.setAttribute("data-runtime-game-save-load", "blocked");
      }
    })();
  </script>
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