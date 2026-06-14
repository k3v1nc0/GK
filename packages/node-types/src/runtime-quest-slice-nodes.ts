import type {
  NodeFieldDefinition,
  NodeSocketDefinition,
  Validator
} from "@gk/schemas";

interface RuntimeQuestSliceGraphNodeTypeDefinition {
  readonly type: string;
  readonly title: string;
  readonly version: number;
  readonly scope: "runtime-consumer";
  readonly sockets: readonly NodeSocketDefinition[];
  readonly fields: readonly NodeFieldDefinition[];
  readonly validate: Validator<Record<string, unknown>>;
  readonly createsConcreteGameContent: false;
  readonly consumesPublishedReadModel: true;
  readonly usesEditorDraftData: false;
  readonly usesEditorAdminRoutes: false;
  readonly hardcodesQuestContent: false;
  readonly mutatesPublishedData: false;
  readonly loadsAssets: false;
  readonly fetchesAssetBytes: false;
  readonly resolvesFinalAssetRoles: false;
  readonly supportsNonVisualBlockedSlice: true;
}

const validator: Validator<Record<string, unknown>> = {
  validate: (config) => {
    const issues = [];

    if (config.usesEditorDraftData === true || config.usesEditorAdminRoutes === true || config.readsDraftData === true) {
      issues.push({ path: "runtimeSource", message: "Fase 18 quest slice nodes can only consume published runtime read-model data.", severity: "error" as const });
    }

    if (config.hardcodesQuestContent === true || config.containsConcreteQuestContent === true || config.questTitle === true || config.dialogueLine === true) {
      issues.push({ path: "questContent", message: "Fase 18 nodes cannot hardcode quest, dialogue, objective or reward content.", severity: "error" as const });
    }

    if (config.loadsAssets === true || config.fetchesAssetBytes === true || config.assetLoadUrls === true || config.assetByteFetchUrls === true) {
      issues.push({ path: "assetLoads", message: "Fase 18 nodes cannot load assets or fetch bytes while asset roles are unresolved.", severity: "error" as const });
    }

    if (config.resolvesFinalAssetRoles === true || config.finalAssetRole === true || config.definitiveRoleMapping === true) {
      issues.push({ path: "assetRoles", message: "Fase 18 nodes must expose unresolved asset-role blockers until published data maps roles.", severity: "error" as const });
    }

    if (config.directUiMutation === true || config.allowsUiClickCompletion === true || config.mutatesQuestStateOutsideExecutor === true) {
      issues.push({ path: "questState", message: "Fase 18 quest mutations must flow through objective and quest executors.", severity: "error" as const });
    }

    if (
      config.implementsCombat === true
      || config.implementsEconomyRuntime === true
      || config.implementsMovement === true
      || config.implementsMultiplayer === true
      || config.implementsAudioPlayback === true
    ) {
      issues.push({ path: "runtimeFeatures", message: "Fase 18 cannot open combat, economy, movement, multiplayer or audio playback systems.", severity: "error" as const });
    }

    if (config.mutatesPublishedData === true || config.mutatesAssets === true || config.persistsSourceContent === true) {
      issues.push({ path: "mutations", message: "Fase 18 runtime state cannot mutate published data, assets or source content.", severity: "error" as const });
    }

    return issues;
  }
};

const flowIn: NodeSocketDefinition = { id: "flowIn", label: "Flow In", direction: "input", kind: "flow", maxConnections: 1 };
const flowOut: NodeSocketDefinition = { id: "flowOut", label: "Flow Out", direction: "output", kind: "flow" };
const readModelIn: NodeSocketDefinition = { id: "readModel", label: "Quest Slice Read Model", direction: "input", kind: "value", valueType: "runtime.projection.read-model.reference", maxConnections: 1 };
const questSliceOut: NodeSocketDefinition = { id: "questSlice", label: "Quest Slice", direction: "output", kind: "value", valueType: "runtime.quest.slice.reference" };
const dialogueOut: NodeSocketDefinition = { id: "dialogue", label: "Dialogue", direction: "output", kind: "value", valueType: "runtime.quest.dialogue.reference" };
const objectiveOut: NodeSocketDefinition = { id: "objective", label: "Objective", direction: "output", kind: "value", valueType: "runtime.quest.objective.reference" };
const interactableOut: NodeSocketDefinition = { id: "interactable", label: "Interactable", direction: "output", kind: "value", valueType: "runtime.quest.interactable.reference" };
const rewardOut: NodeSocketDefinition = { id: "reward", label: "Reward", direction: "output", kind: "value", valueType: "runtime.quest.reward.reference" };
const unlockOut: NodeSocketDefinition = { id: "unlock", label: "Unlock", direction: "output", kind: "value", valueType: "runtime.quest.unlock.reference" };
const checkpointOut: NodeSocketDefinition = { id: "checkpoint", label: "Checkpoint", direction: "output", kind: "value", valueType: "runtime.quest.checkpoint.reference" };
const assetRoleOut: NodeSocketDefinition = { id: "assetRole", label: "Asset Role", direction: "output", kind: "value", valueType: "runtime.quest.asset-role.reference" };
const stateOut: NodeSocketDefinition = { id: "questState", label: "Quest State", direction: "output", kind: "value", valueType: "runtime.quest.state.reference" };
const diagnosticsOut: NodeSocketDefinition = { id: "diagnostics", label: "Diagnostics", direction: "output", kind: "value", valueType: "runtime.quest.diagnostics.reference" };
const safetyOut: NodeSocketDefinition = { id: "safety", label: "Safety", direction: "output", kind: "value", valueType: "runtime.quest.safety.reference" };

export const RUNTIME_QUEST_SLICE_GRAPH_NODE_TYPES: readonly RuntimeQuestSliceGraphNodeTypeDefinition[] = [
  node("gk.runtimeQuestSlice.source", "Runtime Quest Slice Source", [flowIn, readModelIn, flowOut, questSliceOut, diagnosticsOut, safetyOut], [
    textField("sourceId", "Source Id", false)
  ]),
  node("gk.runtimeQuestSlice.questState", "Runtime Quest State Machine", [flowIn, readModelIn, flowOut, questSliceOut, stateOut, diagnosticsOut], [
    textField("stateId", "State Id", false)
  ]),
  node("gk.runtimeQuestSlice.dialogueExecutor", "Runtime Dialogue Executor", [flowIn, readModelIn, flowOut, dialogueOut, stateOut, diagnosticsOut], [
    textField("executorId", "Executor Id", false)
  ]),
  node("gk.runtimeQuestSlice.objectiveEvaluator", "Runtime Objective Evaluator", [flowIn, readModelIn, flowOut, objectiveOut, interactableOut, stateOut, diagnosticsOut], [
    textField("evaluatorId", "Evaluator Id", false)
  ]),
  node("gk.runtimeQuestSlice.rewardApplicator", "Runtime Reward Applicator", [flowIn, readModelIn, flowOut, rewardOut, unlockOut, stateOut, diagnosticsOut], [
    textField("applicatorId", "Applicator Id", false)
  ]),
  node("gk.runtimeQuestSlice.checkpointFlow", "Runtime Checkpoint Flow", [flowIn, readModelIn, flowOut, checkpointOut, stateOut, diagnosticsOut], [
    textField("checkpointFlowId", "Checkpoint Flow Id", false)
  ]),
  node("gk.runtimeQuestSlice.assetRoleBlockers", "Runtime Asset Role Blockers", [readModelIn, assetRoleOut, diagnosticsOut, safetyOut], [
    textField("blockerId", "Blocker Id", false)
  ])
] as const;

function node(
  type: string,
  title: string,
  sockets: readonly NodeSocketDefinition[],
  fields: readonly NodeFieldDefinition[]
): RuntimeQuestSliceGraphNodeTypeDefinition {
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
    usesEditorDraftData: false,
    usesEditorAdminRoutes: false,
    hardcodesQuestContent: false,
    mutatesPublishedData: false,
    loadsAssets: false,
    fetchesAssetBytes: false,
    resolvesFinalAssetRoles: false,
    supportsNonVisualBlockedSlice: true
  };
}

function textField(id: string, label: string, required: boolean): NodeFieldDefinition {
  return { id, label, kind: "text", required };
}
