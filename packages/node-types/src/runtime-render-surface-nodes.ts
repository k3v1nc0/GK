import type {
  NodeFieldDefinition,
  NodeSocketDefinition,
  Validator
} from "@gk/schemas";

interface RuntimeRenderSurfaceGraphNodeTypeDefinition {
  readonly type: string;
  readonly title: string;
  readonly version: number;
  readonly scope: "runtime-consumer";
  readonly sockets: readonly NodeSocketDefinition[];
  readonly fields: readonly NodeFieldDefinition[];
  readonly validate: Validator<Record<string, unknown>>;
  readonly createsConcreteGameContent: false;
  readonly createsRenderSurface: true;
  readonly consumesRuntimeProjectionMetadata: true;
  readonly loadsAssets: false;
  readonly rendersConcreteWorld: false;
  readonly implementsGameplay: false;
  readonly mutatesAssets: false;
}

const validator: Validator<Record<string, unknown>> = {
  validate: (config) => {
    const issues = [];

    if (config.usesEditorDraftData === true || config.usesEditorAdminRoutes === true) {
      issues.push({ path: "usesEditorDraftData", message: "Fase 13 render surface nodes can only consume runtime projection metadata/read-only state.", severity: "error" as const });
    }

    if (config.loadsAssets === true || config.requestsAssetUrls === true || config.assetLoader === true) {
      issues.push({ path: "loadsAssets", message: "Fase 13 render surface nodes cannot load GLB, texture, image or audio assets.", severity: "error" as const });
    }

    if (config.rendersConcreteWorld === true || config.assemblesScene === true || config.sceneAssembly === true) {
      issues.push({ path: "rendersConcreteWorld", message: "Fase 13 render surface nodes cannot render concrete world payloads or assemble scenes.", severity: "error" as const });
    }

    if (
      config.implementsGameplay === true
      || config.implementsCombat === true
      || config.implementsMovement === true
      || config.implementsAudioPlayback === true
    ) {
      issues.push({ path: "implementsRuntime", message: "Fase 13 render surface nodes cannot implement gameplay, combat, movement or audio playback.", severity: "error" as const });
    }

    if (config.mutatesAssets === true || config.copiesAssetsToGit === true) {
      issues.push({ path: "mutatesAssets", message: "Runtime render surface nodes cannot mutate, copy, upload or remove assets.", severity: "error" as const });
    }

    if (
      config.containsConcreteGameContent === true
      || config.hardcodesContent === true
      || config.hardcodesCamera === true
      || config.hardcodesLighting === true
      || config.hardcodesHud === true
      || config.hardcodesMinimap === true
    ) {
      issues.push({ path: "hardcodedRuntimeValues", message: "Runtime render surface nodes cannot hardcode world, camera, lighting, minimap, HUD, audio or content values.", severity: "error" as const });
    }

    return issues;
  }
};

const flowIn: NodeSocketDefinition = { id: "flowIn", label: "Flow In", direction: "input", kind: "flow", maxConnections: 1 };
const flowOut: NodeSocketDefinition = { id: "flowOut", label: "Flow Out", direction: "output", kind: "flow" };
const clientShellIn: NodeSocketDefinition = { id: "clientShell", label: "Runtime Client Shell", direction: "input", kind: "value", valueType: "runtime.client.shell.reference", maxConnections: 1 };
const projectionStateIn: NodeSocketDefinition = { id: "projectionState", label: "Projection State", direction: "input", kind: "value", valueType: "runtime.client.projection-state.reference", maxConnections: 1 };
const renderSurfaceIn: NodeSocketDefinition = { id: "renderSurface", label: "Render Surface", direction: "input", kind: "value", valueType: "runtime.render.surface.reference", maxConnections: 1 };
const renderSurfaceOut: NodeSocketDefinition = { id: "renderSurface", label: "Render Surface", direction: "output", kind: "value", valueType: "runtime.render.surface.reference" };
const renderStatusOut: NodeSocketDefinition = { id: "renderStatus", label: "Render Status", direction: "output", kind: "value", valueType: "runtime.render.status.reference" };
const renderCapabilityOut: NodeSocketDefinition = { id: "renderCapability", label: "Render Capability", direction: "output", kind: "value", valueType: "runtime.render.capability.reference" };
const renderLifecycleOut: NodeSocketDefinition = { id: "renderLifecycle", label: "Render Lifecycle", direction: "output", kind: "value", valueType: "runtime.render.lifecycle.reference" };
const renderSafetyOut: NodeSocketDefinition = { id: "renderSafety", label: "Render Safety", direction: "output", kind: "value", valueType: "runtime.render.safety.reference" };

export const RUNTIME_RENDER_SURFACE_GRAPH_NODE_TYPES: readonly RuntimeRenderSurfaceGraphNodeTypeDefinition[] = [
  node("gk.runtimeRender.surface", "Runtime Render Surface", [flowIn, clientShellIn, projectionStateIn, flowOut, renderSurfaceOut, renderStatusOut, renderSafetyOut], [
    textField("surfaceId", "Surface Id", false)
  ]),
  node("gk.runtimeRender.status", "Runtime Render Surface Status", [renderSurfaceIn, renderStatusOut], [
    textField("statusId", "Status Id", false)
  ]),
  node("gk.runtimeRender.capability", "Runtime Render Surface Capability", [renderSurfaceIn, renderCapabilityOut], [
    textField("capabilityId", "Capability Id", false)
  ]),
  node("gk.runtimeRender.lifecycle", "Runtime Render Surface Lifecycle", [renderSurfaceIn, renderLifecycleOut], [
    textField("lifecycleId", "Lifecycle Id", false)
  ]),
  node("gk.runtimeRender.safetyFlags", "Runtime Render Surface Safety Flags", [renderSurfaceIn, renderSafetyOut], [
    textField("safetyId", "Safety Id", false)
  ])
] as const;

function node(
  type: string,
  title: string,
  sockets: readonly NodeSocketDefinition[],
  fields: readonly NodeFieldDefinition[]
): RuntimeRenderSurfaceGraphNodeTypeDefinition {
  return {
    type,
    title,
    version: 1,
    scope: "runtime-consumer",
    sockets,
    fields,
    validate: validator,
    createsConcreteGameContent: false,
    createsRenderSurface: true,
    consumesRuntimeProjectionMetadata: true,
    loadsAssets: false,
    rendersConcreteWorld: false,
    implementsGameplay: false,
    mutatesAssets: false
  };
}

function textField(id: string, label: string, required: boolean): NodeFieldDefinition {
  return { id, label, kind: "text", required };
}
