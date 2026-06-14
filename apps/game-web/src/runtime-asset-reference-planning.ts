import {
  RUNTIME_ASSET_REFERENCE_PLANNING_MARKER,
  createRuntimeAssetReferencePlanningState,
  validateRuntimeAssetReferencePlanningState,
  type RuntimeAssetReferencePlanningState
} from "@gk/schemas";

import { createRuntimeSceneAssemblyShellState } from "./runtime-scene-assembly.js";

export const RUNTIME_ASSET_REFERENCE_PLANNING_DATA_MARKER = RUNTIME_ASSET_REFERENCE_PLANNING_MARKER;

export interface RuntimeAssetReferencePlanningClientContract {
  readonly phase: typeof RUNTIME_ASSET_REFERENCE_PLANNING_MARKER;
  readonly method: "metadata-only";
  readonly credentials: "omit";
  readonly consumesRuntimeScenePlan: true;
  readonly producesAssetReferencePlan: true;
  readonly usesAssetMetadataOnly: true;
  readonly loadsAssets: false;
  readonly fetchesAssetBytes: false;
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

export const runtimeAssetReferencePlanningClientContract: RuntimeAssetReferencePlanningClientContract = {
  phase: RUNTIME_ASSET_REFERENCE_PLANNING_MARKER,
  method: "metadata-only",
  credentials: "omit",
  consumesRuntimeScenePlan: true,
  producesAssetReferencePlan: true,
  usesAssetMetadataOnly: true,
  loadsAssets: false,
  fetchesAssetBytes: false,
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

export function createRuntimeAssetReferencePlanningShellState(): RuntimeAssetReferencePlanningState {
  const sceneAssembly = createRuntimeSceneAssemblyShellState();
  return createRuntimeAssetReferencePlanningState({ scenePlan: sceneAssembly.plan });
}

export function renderRuntimeAssetReferencePlanningSection(
  state: RuntimeAssetReferencePlanningState = createRuntimeAssetReferencePlanningShellState()
): string {
  const validation = validateRuntimeAssetReferencePlanningState(state);
  const model = escapeHtml(JSON.stringify({ state, validation }));
  const safetyFlags = [
    ["scene plan", state.safetyFlags.consumesRuntimeScenePlan],
    ["reference plan", state.safetyFlags.producesAssetReferencePlan],
    ["metadata only", state.safetyFlags.usesAssetMetadataOnly],
    ["loads", !state.safetyFlags.loadsAssets],
    ["bytes", !state.safetyFlags.fetchesAssetBytes],
    ["roles", !state.safetyFlags.resolvesFinalAssetRoles],
    ["render", !state.safetyFlags.rendersScene],
    ["gameplay", !state.safetyFlags.implementsGameplay],
    ["audio", !state.safetyFlags.implementsAudioPlayback],
    ["content", !state.safetyFlags.hardcodesContent]
  ].map(([label, value]) => `<span>${escapeHtml(String(label))}: ${value === true ? "ok" : "blocked"}</span>`).join("");

  return `<section class="asset-reference-planning" data-runtime-asset-reference-planning="${RUNTIME_ASSET_REFERENCE_PLANNING_DATA_MARKER}" data-runtime-asset-reference-lifecycle="${escapeHtml(state.status.lifecycle)}" data-runtime-asset-loads-assets="${String(state.safetyFlags.loadsAssets)}" data-runtime-asset-fetches-bytes="${String(state.safetyFlags.fetchesAssetBytes)}" data-runtime-asset-finalizes-roles="${String(state.safetyFlags.resolvesFinalAssetRoles)}" data-runtime-asset-renders-scene="${String(state.safetyFlags.rendersScene)}" aria-label="Runtime asset reference planning">
  <div class="asset-reference-header">
    <div>
      <h2>Asset Reference Planning</h2>
      <p class="muted">Scene-plan descriptors to metadata-only asset-reference candidates. No asset bytes are loaded.</p>
    </div>
    <div class="status-pill" data-runtime-asset-reference-status>${escapeHtml(state.status.status)}</div>
  </div>
  <div class="asset-reference-plan-panel" data-runtime-empty-asset-reference-plan="${String(state.plan.emptyAssetReferencePlan)}">
    <p>${state.plan.emptyAssetReferencePlan ? "Empty asset reference plan. No scene descriptors available." : "Asset reference metadata is available from scene descriptors."}</p>
  </div>
  <div class="asset-reference-grid" aria-label="Asset reference planning metadata">
    <span data-runtime-asset-reference-scene-descriptor-count>scene descriptors: ${String(state.plan.sceneDescriptorCount)}</span>
    <span data-runtime-asset-reference-descriptor-count>reference descriptors: ${String(state.plan.descriptorCount)}</span>
    <span data-runtime-asset-reference-candidate-count>candidates: ${String(state.plan.candidateCount)}</span>
    ${safetyFlags}
  </div>
  <script id="runtime-asset-reference-planning-model" type="application/json">${model}</script>
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
