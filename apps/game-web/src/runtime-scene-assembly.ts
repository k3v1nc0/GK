import {
  RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
  RUNTIME_SCENE_ASSEMBLY_MARKER,
  createRuntimeSceneAssemblyState,
  validateRuntimeSceneAssemblyState,
  type RuntimeSceneAssemblyState
} from "@gk/schemas";

export const RUNTIME_SCENE_ASSEMBLY_DATA_MARKER = RUNTIME_SCENE_ASSEMBLY_MARKER;

export interface RuntimeSceneAssemblyClientContract {
  readonly phase: typeof RUNTIME_SCENE_ASSEMBLY_MARKER;
  readonly projectionRoutes: typeof RUNTIME_CLIENT_PROJECTION_READ_ROUTES;
  readonly method: "GET";
  readonly credentials: "omit";
  readonly consumesRuntimeProjectionRecords: true;
  readonly producesScenePlan: true;
  readonly loadsAssets: false;
  readonly resolvesFinalAssetRoles: false;
  readonly rendersScene: false;
  readonly rendererDrawCalls: false;
  readonly implementsGameplay: false;
  readonly implementsMovement: false;
  readonly implementsCombat: false;
  readonly implementsAudioPlayback: false;
  readonly hardcodesWorld: false;
  readonly hardcodesCamera: false;
  readonly hardcodesLighting: false;
  readonly hardcodesHud: false;
  readonly hardcodesMinimap: false;
  readonly hardcodesContent: false;
  readonly mutatesAssets: false;
  readonly usesEditorDraftData: false;
  readonly usesEditorAdminRoutes: false;
}

export const runtimeSceneAssemblyClientContract: RuntimeSceneAssemblyClientContract = {
  phase: RUNTIME_SCENE_ASSEMBLY_MARKER,
  projectionRoutes: RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
  method: "GET",
  credentials: "omit",
  consumesRuntimeProjectionRecords: true,
  producesScenePlan: true,
  loadsAssets: false,
  resolvesFinalAssetRoles: false,
  rendersScene: false,
  rendererDrawCalls: false,
  implementsGameplay: false,
  implementsMovement: false,
  implementsCombat: false,
  implementsAudioPlayback: false,
  hardcodesWorld: false,
  hardcodesCamera: false,
  hardcodesLighting: false,
  hardcodesHud: false,
  hardcodesMinimap: false,
  hardcodesContent: false,
  mutatesAssets: false,
  usesEditorDraftData: false,
  usesEditorAdminRoutes: false
};

export function createRuntimeSceneAssemblyShellState(): RuntimeSceneAssemblyState {
  return createRuntimeSceneAssemblyState({
    projectionRoutes: RUNTIME_CLIENT_PROJECTION_READ_ROUTES
  });
}

export function renderRuntimeSceneAssemblySection(
  state: RuntimeSceneAssemblyState = createRuntimeSceneAssemblyShellState()
): string {
  const validation = validateRuntimeSceneAssemblyState(state);
  const model = escapeHtml(JSON.stringify({ state, validation }));
  const safetyFlags = [
    ["records", state.safetyFlags.consumesRuntimeProjectionRecords],
    ["plan", state.safetyFlags.producesScenePlan],
    ["assets", !state.safetyFlags.loadsAssets],
    ["roles", !state.safetyFlags.resolvesFinalAssetRoles],
    ["render", !state.safetyFlags.rendersScene],
    ["gameplay", !state.safetyFlags.implementsGameplay],
    ["audio", !state.safetyFlags.implementsAudioPlayback],
    ["content", !state.safetyFlags.hardcodesContent]
  ].map(([label, value]) => `<span>${escapeHtml(String(label))}: ${value === true ? "ok" : "blocked"}</span>`).join("");

  return `<section class="scene-assembly" data-runtime-scene-assembly="${RUNTIME_SCENE_ASSEMBLY_DATA_MARKER}" data-runtime-scene-assembly-lifecycle="${escapeHtml(state.status.lifecycle)}" data-runtime-scene-loads-assets="${String(state.safetyFlags.loadsAssets)}" data-runtime-scene-renders-scene="${String(state.safetyFlags.rendersScene)}" data-runtime-scene-finalizes-roles="${String(state.safetyFlags.resolvesFinalAssetRoles)}" aria-label="Runtime scene assembly">
  <div class="scene-assembly-header">
    <div>
      <h2>Scene Assembly</h2>
      <p class="muted">Runtime projection records to neutral scene-plan metadata only. No scene is rendered.</p>
    </div>
    <div class="status-pill" data-runtime-scene-assembly-status>${escapeHtml(state.status.status)}</div>
  </div>
  <div class="scene-plan-panel" data-runtime-empty-scene-plan="${String(state.plan.emptyScenePlan)}">
    <p>${state.plan.emptyScenePlan ? "Empty scene plan. No runtime projection records available." : "Scene plan metadata is available from runtime projection records."}</p>
  </div>
  <div class="scene-assembly-grid" aria-label="Scene assembly metadata">
    <span data-runtime-scene-record-count>records: ${String(state.plan.recordCount)}</span>
    <span data-runtime-scene-descriptor-count>descriptors: ${String(state.plan.descriptorCount)}</span>
    <span data-runtime-scene-node-count>nodes: ${String(state.plan.nodes.length)}</span>
    ${safetyFlags}
  </div>
  <script id="runtime-scene-assembly-model" type="application/json">${model}</script>
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
