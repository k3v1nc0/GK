import type {
  NodeFieldDefinition,
  NodeSocketDefinition,
  Validator
} from "@gk/schemas";

interface RuntimeAssetReferencePlanningGraphNodeTypeDefinition {
  readonly type: string;
  readonly title: string;
  readonly version: number;
  readonly scope: "runtime-consumer";
  readonly sockets: readonly NodeSocketDefinition[];
  readonly fields: readonly NodeFieldDefinition[];
  readonly validate: Validator<Record<string, unknown>>;
  readonly createsConcreteGameContent: false;
  readonly consumesRuntimeScenePlan: true;
  readonly producesAssetReferencePlan: true;
  readonly usesAssetMetadataOnly: true;
  readonly loadsAssets: false;
  readonly fetchesAssetBytes: false;
  readonly resolvesFinalAssetRoles: false;
  readonly rendersScene: false;
  readonly rendererDrawCalls: false;
  readonly implementsGameplay: false;
  readonly mutatesAssets: false;
}

const validator: Validator<Record<string, unknown>> = {
  validate: (config) => {
    const issues = [];

    if (config.usesEditorDraftData === true || config.usesEditorAdminRoutes === true) {
      issues.push({ path: "usesEditorDraftData", message: "Fase 15 asset reference planning nodes can only consume runtime scene-plan metadata.", severity: "error" as const });
    }

    if (config.loadsAssets === true || config.assetLoadUrls === true || config.assetLoader === true) {
      issues.push({ path: "loadsAssets", message: "Fase 15 asset reference planning nodes cannot load GLB, texture, image or audio assets.", severity: "error" as const });
    }

    if (config.fetchesAssetBytes === true || config.assetByteFetchUrls === true || config.downloadsAssets === true) {
      issues.push({ path: "fetchesAssetBytes", message: "Fase 15 asset reference planning nodes cannot fetch asset bytes.", severity: "error" as const });
    }

    if (config.resolvesFinalAssetRoles === true || config.finalAssetRole === true || config.roleMapping === true || config.definitiveRoleMapping === true) {
      issues.push({ path: "resolvesFinalAssetRoles", message: "Fase 15 asset reference planning nodes cannot finalize GLB or asset role mapping.", severity: "error" as const });
    }

    if (config.rendersScene === true || config.rendererDrawCalls === true || config.drawCalls === true || config.renderer === true) {
      issues.push({ path: "rendersScene", message: "Fase 15 asset reference planning nodes cannot render scenes or issue renderer draw calls.", severity: "error" as const });
    }

    if (
      config.implementsGameplay === true
      || config.implementsCombat === true
      || config.implementsMovement === true
      || config.implementsAudioPlayback === true
    ) {
      issues.push({ path: "implementsRuntime", message: "Fase 15 asset reference planning nodes cannot implement gameplay, combat, movement or audio playback.", severity: "error" as const });
    }

    if (config.mutatesAssets === true || config.copiesAssetsToGit === true) {
      issues.push({ path: "mutatesAssets", message: "Runtime asset reference planning nodes cannot mutate, copy, upload or remove assets.", severity: "error" as const });
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
      issues.push({ path: "hardcodedRuntimeValues", message: "Runtime asset reference planning nodes cannot hardcode world, camera, lighting, minimap, HUD, audio or content values.", severity: "error" as const });
    }

    return issues;
  }
};

const flowIn: NodeSocketDefinition = { id: "flowIn", label: "Flow In", direction: "input", kind: "flow", maxConnections: 1 };
const flowOut: NodeSocketDefinition = { id: "flowOut", label: "Flow Out", direction: "output", kind: "flow" };
const scenePlanIn: NodeSocketDefinition = { id: "scenePlan", label: "Scene Plan", direction: "input", kind: "value", valueType: "runtime.scene.assembly.plan.reference", maxConnections: 1 };
const sourceOut: NodeSocketDefinition = { id: "assetReferenceSource", label: "Asset Reference Source", direction: "output", kind: "value", valueType: "runtime.asset.reference.source.reference" };
const statusOut: NodeSocketDefinition = { id: "assetReferenceStatus", label: "Asset Reference Status", direction: "output", kind: "value", valueType: "runtime.asset.reference.planning.status.reference" };
const planIn: NodeSocketDefinition = { id: "assetReferencePlan", label: "Asset Reference Plan", direction: "input", kind: "value", valueType: "runtime.asset.reference.plan.reference", maxConnections: 1 };
const planOut: NodeSocketDefinition = { id: "assetReferencePlan", label: "Asset Reference Plan", direction: "output", kind: "value", valueType: "runtime.asset.reference.plan.reference" };
const descriptorOut: NodeSocketDefinition = { id: "assetReferenceDescriptor", label: "Asset Reference Descriptor", direction: "output", kind: "value", valueType: "runtime.asset.reference.descriptor.reference" };
const candidateOut: NodeSocketDefinition = { id: "assetReferenceCandidate", label: "Asset Reference Candidate", direction: "output", kind: "value", valueType: "runtime.asset.reference.candidate.reference" };
const safetyOut: NodeSocketDefinition = { id: "assetReferenceSafety", label: "Asset Reference Safety", direction: "output", kind: "value", valueType: "runtime.asset.reference.safety.reference" };

export const RUNTIME_ASSET_REFERENCE_PLANNING_GRAPH_NODE_TYPES: readonly RuntimeAssetReferencePlanningGraphNodeTypeDefinition[] = [
  node("gk.runtimeAssetReferencePlanning.source", "Runtime Asset Reference Source", [flowIn, scenePlanIn, flowOut, sourceOut, statusOut, safetyOut], [
    textField("sourceId", "Source Id", false)
  ]),
  node("gk.runtimeAssetReferencePlanning.plan", "Runtime Asset Reference Plan", [flowIn, scenePlanIn, flowOut, planOut, statusOut, safetyOut], [
    textField("planId", "Plan Id", false)
  ]),
  node("gk.runtimeAssetReferencePlanning.descriptor", "Runtime Asset Reference Descriptor", [planIn, descriptorOut], [
    textField("descriptorId", "Descriptor Id", false)
  ]),
  node("gk.runtimeAssetReferencePlanning.candidate", "Runtime Asset Reference Candidate", [planIn, candidateOut], [
    textField("candidateId", "Candidate Id", false)
  ]),
  node("gk.runtimeAssetReferencePlanning.status", "Runtime Asset Reference Status", [planIn, statusOut], [
    textField("statusId", "Status Id", false)
  ]),
  node("gk.runtimeAssetReferencePlanning.safetyFlags", "Runtime Asset Reference Safety Flags", [planIn, safetyOut], [
    textField("safetyId", "Safety Id", false)
  ])
] as const;

function node(
  type: string,
  title: string,
  sockets: readonly NodeSocketDefinition[],
  fields: readonly NodeFieldDefinition[]
): RuntimeAssetReferencePlanningGraphNodeTypeDefinition {
  return {
    type,
    title,
    version: 1,
    scope: "runtime-consumer",
    sockets,
    fields,
    validate: validator,
    createsConcreteGameContent: false,
    consumesRuntimeScenePlan: true,
    producesAssetReferencePlan: true,
    usesAssetMetadataOnly: true,
    loadsAssets: false,
    fetchesAssetBytes: false,
    resolvesFinalAssetRoles: false,
    rendersScene: false,
    rendererDrawCalls: false,
    implementsGameplay: false,
    mutatesAssets: false
  };
}

function textField(id: string, label: string, required: boolean): NodeFieldDefinition {
  return { id, label, kind: "text", required };
}
