import type {
  NodeFieldDefinition,
  NodeSocketDefinition,
  Validator
} from "@gk/schemas";

interface RuntimeSceneAssemblyGraphNodeTypeDefinition {
  readonly type: string;
  readonly title: string;
  readonly version: number;
  readonly scope: "runtime-consumer";
  readonly sockets: readonly NodeSocketDefinition[];
  readonly fields: readonly NodeFieldDefinition[];
  readonly validate: Validator<Record<string, unknown>>;
  readonly createsConcreteGameContent: false;
  readonly consumesRuntimeProjectionRecords: true;
  readonly producesScenePlan: true;
  readonly loadsAssets: false;
  readonly resolvesFinalAssetRoles: false;
  readonly rendersScene: false;
  readonly implementsGameplay: false;
  readonly mutatesAssets: false;
}

const validator: Validator<Record<string, unknown>> = {
  validate: (config) => {
    const issues = [];

    if (config.usesEditorDraftData === true || config.usesEditorAdminRoutes === true) {
      issues.push({ path: "usesEditorDraftData", message: "Fase 14 scene assembly nodes can only consume runtime projection read-only records.", severity: "error" as const });
    }

    if (config.loadsAssets === true || config.assetLoadUrls === true || config.assetLoader === true) {
      issues.push({ path: "loadsAssets", message: "Fase 14 scene assembly nodes cannot load GLB, texture, image or audio assets.", severity: "error" as const });
    }

    if (config.resolvesFinalAssetRoles === true || config.finalAssetRole === true || config.roleMapping === true || config.definitiveRoleMapping === true) {
      issues.push({ path: "resolvesFinalAssetRoles", message: "Fase 14 scene assembly nodes cannot finalize GLB or asset role mapping.", severity: "error" as const });
    }

    if (config.rendersScene === true || config.rendererDrawCalls === true || config.drawCalls === true || config.renderer === true) {
      issues.push({ path: "rendersScene", message: "Fase 14 scene assembly nodes cannot render scenes or issue renderer draw calls.", severity: "error" as const });
    }

    if (
      config.implementsGameplay === true
      || config.implementsCombat === true
      || config.implementsMovement === true
      || config.implementsAudioPlayback === true
    ) {
      issues.push({ path: "implementsRuntime", message: "Fase 14 scene assembly nodes cannot implement gameplay, combat, movement or audio playback.", severity: "error" as const });
    }

    if (config.mutatesAssets === true || config.copiesAssetsToGit === true) {
      issues.push({ path: "mutatesAssets", message: "Runtime scene assembly nodes cannot mutate, copy, upload or remove assets.", severity: "error" as const });
    }

    if (
      config.containsConcreteGameContent === true
      || config.hardcodesWorld === true
      || config.hardcodesContent === true
      || config.hardcodesCamera === true
      || config.hardcodesLighting === true
      || config.hardcodesHud === true
      || config.hardcodesMinimap === true
    ) {
      issues.push({ path: "hardcodedRuntimeValues", message: "Runtime scene assembly nodes cannot hardcode world, camera, lighting, minimap, HUD, audio or content values.", severity: "error" as const });
    }

    return issues;
  }
};

const flowIn: NodeSocketDefinition = { id: "flowIn", label: "Flow In", direction: "input", kind: "flow", maxConnections: 1 };
const flowOut: NodeSocketDefinition = { id: "flowOut", label: "Flow Out", direction: "output", kind: "flow" };
const projectionReadModelIn: NodeSocketDefinition = { id: "projectionReadModel", label: "Runtime Projection Read Model", direction: "input", kind: "value", valueType: "runtime.projection.read-model.reference", maxConnections: 1 };
const renderSurfaceIn: NodeSocketDefinition = { id: "renderSurface", label: "Render Surface", direction: "input", kind: "value", valueType: "runtime.render.surface.reference", maxConnections: 1 };
const sceneSourceOut: NodeSocketDefinition = { id: "sceneSource", label: "Scene Assembly Source", direction: "output", kind: "value", valueType: "runtime.scene.assembly.source.reference" };
const sceneStatusOut: NodeSocketDefinition = { id: "sceneStatus", label: "Scene Assembly Status", direction: "output", kind: "value", valueType: "runtime.scene.assembly.status.reference" };
const scenePlanIn: NodeSocketDefinition = { id: "scenePlan", label: "Scene Plan", direction: "input", kind: "value", valueType: "runtime.scene.assembly.plan.reference", maxConnections: 1 };
const scenePlanOut: NodeSocketDefinition = { id: "scenePlan", label: "Scene Plan", direction: "output", kind: "value", valueType: "runtime.scene.assembly.plan.reference" };
const sceneDescriptorOut: NodeSocketDefinition = { id: "sceneDescriptor", label: "Scene Descriptor", direction: "output", kind: "value", valueType: "runtime.scene.assembly.descriptor.reference" };
const sceneSafetyOut: NodeSocketDefinition = { id: "sceneSafety", label: "Scene Assembly Safety", direction: "output", kind: "value", valueType: "runtime.scene.assembly.safety.reference" };

export const RUNTIME_SCENE_ASSEMBLY_GRAPH_NODE_TYPES: readonly RuntimeSceneAssemblyGraphNodeTypeDefinition[] = [
  node("gk.runtimeSceneAssembly.source", "Runtime Scene Assembly Source", [flowIn, projectionReadModelIn, flowOut, sceneSourceOut, sceneStatusOut, sceneSafetyOut], [
    textField("sourceId", "Source Id", false)
  ]),
  node("gk.runtimeSceneAssembly.plan", "Runtime Scene Assembly Plan", [flowIn, projectionReadModelIn, renderSurfaceIn, flowOut, scenePlanOut, sceneStatusOut, sceneSafetyOut], [
    textField("planId", "Plan Id", false)
  ]),
  node("gk.runtimeSceneAssembly.descriptor", "Runtime Scene Assembly Descriptor", [scenePlanIn, sceneDescriptorOut], [
    textField("descriptorId", "Descriptor Id", false)
  ]),
  node("gk.runtimeSceneAssembly.status", "Runtime Scene Assembly Status", [scenePlanIn, sceneStatusOut], [
    textField("statusId", "Status Id", false)
  ]),
  node("gk.runtimeSceneAssembly.safetyFlags", "Runtime Scene Assembly Safety Flags", [scenePlanIn, sceneSafetyOut], [
    textField("safetyId", "Safety Id", false)
  ])
] as const;

function node(
  type: string,
  title: string,
  sockets: readonly NodeSocketDefinition[],
  fields: readonly NodeFieldDefinition[]
): RuntimeSceneAssemblyGraphNodeTypeDefinition {
  return {
    type,
    title,
    version: 1,
    scope: "runtime-consumer",
    sockets,
    fields,
    validate: validator,
    createsConcreteGameContent: false,
    consumesRuntimeProjectionRecords: true,
    producesScenePlan: true,
    loadsAssets: false,
    resolvesFinalAssetRoles: false,
    rendersScene: false,
    implementsGameplay: false,
    mutatesAssets: false
  };
}

function textField(id: string, label: string, required: boolean): NodeFieldDefinition {
  return { id, label, kind: "text", required };
}
