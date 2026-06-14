import type {
  NodeFieldDefinition,
  NodeSocketDefinition,
  Validator
} from "@gk/schemas";

interface RuntimeGameCoreGraphNodeTypeDefinition {
  readonly type: string;
  readonly title: string;
  readonly version: number;
  readonly scope: "runtime-consumer";
  readonly sockets: readonly NodeSocketDefinition[];
  readonly fields: readonly NodeFieldDefinition[];
  readonly validate: Validator<Record<string, unknown>>;
  readonly createsConcreteGameContent: false;
  readonly consumesPublishedReadModel: true;
  readonly consumesRuntimeAssetReferencePlan: true;
  readonly bootsRuntimeGame: true;
  readonly usesEditorDraftData: false;
  readonly usesEditorAdminRoutes: false;
  readonly loadsAssets: false;
  readonly fetchesAssetBytes: false;
  readonly resolvesFinalAssetRoles: false;
  readonly rendersConcreteWorld: false;
  readonly implementsMovement: false;
  readonly implementsCombat: false;
  readonly implementsAudioPlayback: false;
  readonly hardcodesContent: false;
  readonly mutatesAssets: false;
}

const validator: Validator<Record<string, unknown>> = {
  validate: (config) => {
    const issues = [];

    if (config.usesEditorDraftData === true || config.usesEditorAdminRoutes === true || config.readsDraftData === true) {
      issues.push({ path: "runtimeSource", message: "Fase 17 runtime game nodes can only consume published runtime read-model data.", severity: "error" as const });
    }

    if (config.loadsAssets === true || config.fetchesAssetBytes === true || config.assetLoadUrls === true || config.assetByteFetchUrls === true) {
      issues.push({ path: "assetLoads", message: "Fase 17 runtime game nodes cannot hide asset byte loads.", severity: "error" as const });
    }

    if (config.resolvesFinalAssetRoles === true || config.finalAssetRole === true || config.definitiveRoleMapping === true) {
      issues.push({ path: "assetRoles", message: "Fase 17 runtime game nodes cannot finalize asset roles outside published data.", severity: "error" as const });
    }

    if (config.rendersConcreteWorld === true || config.rendererDrawCalls === true || config.renderer === true) {
      issues.push({ path: "rendering", message: "Fase 17 runtime game nodes cannot perform renderer draw calls.", severity: "error" as const });
    }

    if (
      config.implementsQuestRuntime === true
      || config.implementsDialogueRuntime === true
      || config.implementsEconomyRuntime === true
      || config.implementsMovement === true
      || config.implementsCombat === true
      || config.implementsMultiplayer === true
      || config.implementsAudioPlayback === true
    ) {
      issues.push({ path: "runtimeFeatures", message: "Fase 17 runtime game nodes cannot implement later content, movement, combat, multiplayer or audio playback systems.", severity: "error" as const });
    }

    if (
      config.containsConcreteGameContent === true
      || config.hardcodesWorld === true
      || config.hardcodesContent === true
      || config.hardcodesCamera === true
      || config.hardcodesLighting === true
      || config.hardcodesHud === true
      || config.hardcodesMinimap === true
      || config.hardcodesAudio === true
    ) {
      issues.push({ path: "hardcodedRuntimeValues", message: "Runtime Game Core nodes cannot hardcode world, camera, lighting, HUD, minimap, audio or content values.", severity: "error" as const });
    }

    if (config.mutatesAssets === true || config.mutatesPublishedData === true || config.copiesAssetsToGit === true) {
      issues.push({ path: "mutations", message: "Runtime Game Core nodes cannot mutate assets or published read-model data.", severity: "error" as const });
    }

    return issues;
  }
};

const flowIn: NodeSocketDefinition = { id: "flowIn", label: "Flow In", direction: "input", kind: "flow", maxConnections: 1 };
const flowOut: NodeSocketDefinition = { id: "flowOut", label: "Flow Out", direction: "output", kind: "flow" };
const projectionReadModelIn: NodeSocketDefinition = { id: "projectionReadModel", label: "Projection Read Model", direction: "input", kind: "value", valueType: "runtime.projection.read-model.reference", maxConnections: 1 };
const assetReferencePlanIn: NodeSocketDefinition = { id: "assetReferencePlan", label: "Asset Reference Plan", direction: "input", kind: "value", valueType: "runtime.asset.reference.plan.reference", maxConnections: 1 };
const sourceOut: NodeSocketDefinition = { id: "runtimeGameSource", label: "Runtime Game Source", direction: "output", kind: "value", valueType: "runtime.game.source.reference" };
const statusOut: NodeSocketDefinition = { id: "runtimeGameStatus", label: "Runtime Game Status", direction: "output", kind: "value", valueType: "runtime.game.status.reference" };
const bootOut: NodeSocketDefinition = { id: "runtimeGameBoot", label: "Runtime Game Boot", direction: "output", kind: "value", valueType: "runtime.game.boot.reference" };
const sessionOut: NodeSocketDefinition = { id: "runtimeGameSession", label: "Runtime Game Session", direction: "output", kind: "value", valueType: "runtime.game.session.reference" };
const inputOut: NodeSocketDefinition = { id: "runtimeGameInput", label: "Runtime Game Input", direction: "output", kind: "value", valueType: "runtime.game.input.reference" };
const saveOut: NodeSocketDefinition = { id: "runtimeGameSave", label: "Runtime Game Save", direction: "output", kind: "value", valueType: "runtime.game.save-state.reference" };
const diagnosticsOut: NodeSocketDefinition = { id: "runtimeGameDiagnostics", label: "Runtime Game Diagnostics", direction: "output", kind: "value", valueType: "runtime.game.diagnostics.reference" };
const safetyOut: NodeSocketDefinition = { id: "runtimeGameSafety", label: "Runtime Game Safety", direction: "output", kind: "value", valueType: "runtime.game.safety.reference" };

export const RUNTIME_GAME_CORE_GRAPH_NODE_TYPES: readonly RuntimeGameCoreGraphNodeTypeDefinition[] = [
  node("gk.runtimeGameCore.source", "Runtime Game Source", [flowIn, projectionReadModelIn, assetReferencePlanIn, flowOut, sourceOut, statusOut, safetyOut], [
    textField("sourceId", "Source Id", false)
  ]),
  node("gk.runtimeGameCore.boot", "Runtime Game Boot", [flowIn, projectionReadModelIn, assetReferencePlanIn, flowOut, bootOut, statusOut, diagnosticsOut, safetyOut], [
    textField("bootId", "Boot Id", false)
  ]),
  node("gk.runtimeGameCore.playerSession", "Runtime Game Player Session", [projectionReadModelIn, sessionOut, statusOut], [
    textField("sessionId", "Session Id", false)
  ]),
  node("gk.runtimeGameCore.inputAdapter", "Runtime Game Input Adapter", [flowIn, flowOut, inputOut, safetyOut], [
    textField("adapterId", "Adapter Id", false)
  ]),
  node("gk.runtimeGameCore.saveState", "Runtime Game Save State", [flowIn, flowOut, saveOut, statusOut], [
    textField("saveStateId", "Save State Id", false)
  ]),
  node("gk.runtimeGameCore.diagnostics", "Runtime Game Diagnostics", [projectionReadModelIn, diagnosticsOut, statusOut], [
    textField("diagnosticId", "Diagnostic Id", false)
  ])
] as const;

function node(
  type: string,
  title: string,
  sockets: readonly NodeSocketDefinition[],
  fields: readonly NodeFieldDefinition[]
): RuntimeGameCoreGraphNodeTypeDefinition {
  return {
    type,
    title,
    version: 1,
    scope: "runtime-consumer",
    sockets,
    fields,
    validate: validator,
    createsConcreteGameContent: false,
    consumesPublishedReadModel: true,
    consumesRuntimeAssetReferencePlan: true,
    bootsRuntimeGame: true,
    usesEditorDraftData: false,
    usesEditorAdminRoutes: false,
    loadsAssets: false,
    fetchesAssetBytes: false,
    resolvesFinalAssetRoles: false,
    rendersConcreteWorld: false,
    implementsMovement: false,
    implementsCombat: false,
    implementsAudioPlayback: false,
    hardcodesContent: false,
    mutatesAssets: false
  };
}

function textField(id: string, label: string, required: boolean): NodeFieldDefinition {
  return { id, label, kind: "text", required };
}