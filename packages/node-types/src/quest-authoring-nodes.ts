import type {
  NodeFieldDefinition,
  NodeSocketDefinition,
  Validator
} from "@gk/schemas";

interface QuestAuthoringGraphNodeTypeDefinition {
  readonly type: string;
  readonly title: string;
  readonly version: number;
  readonly scope: "editor-data" | "publish-boundary";
  readonly sockets: readonly NodeSocketDefinition[];
  readonly fields: readonly NodeFieldDefinition[];
  readonly validate: Validator<Record<string, unknown>>;
  readonly createsConcreteGameContent: false;
  readonly consumesEditorNodeData: true;
  readonly preparesPublishReadModel: true;
  readonly publishesRuntimeOutput: false;
  readonly runtimeFallbackContent: false;
  readonly hardcodesRuntimeContent: false;
  readonly dummyPublishedData: false;
  readonly loadsAssets: false;
  readonly fetchesAssetBytes: false;
  readonly resolvesFinalAssetRoles: false;
}

const validator: Validator<Record<string, unknown>> = {
  validate: (config) => {
    const issues = [];

    if (config.runtimeConsumesDraftData === true || config.usesRuntimeFallback === true || config.runtimeFallbackContent === true) {
      issues.push({ path: "runtimeBoundary", message: "Fase 19 quest authoring nodes cannot create runtime fallback content or let runtime consume draft data.", severity: "error" as const });
    }

    if (config.hardcodesRuntimeContent === true || config.hardcodesQuestContent === true) {
      issues.push({ path: "runtimeContent", message: "Concrete quest content belongs in editor/node-data and publish records, not runtime hardcoding.", severity: "error" as const });
    }

    if (config.dummyPublishedData === true || config.dummyAssets === true) {
      issues.push({ path: "dummyData", message: "Fase 19 cannot create dummy published data or dummy assets.", severity: "error" as const });
    }

    if (config.publishesRuntimeOutput === true || config.mutatesPublishedData === true) {
      issues.push({ path: "publishBoundary", message: "Fase 19 prepares normalized read-model references only and cannot publish runtime output or mutate published data.", severity: "error" as const });
    }

    if (config.loadsAssets === true || config.fetchesAssetBytes === true || config.copiesAssetsToGit === true) {
      issues.push({ path: "assetBoundary", message: "Quest authoring nodes can reference asset roles, but cannot load, fetch, copy or mutate asset bytes.", severity: "error" as const });
    }

    if (config.resolvesFinalAssetRoles === true || config.finalAssetRole === true || config.definitiveRoleMapping === true) {
      issues.push({ path: "assetRoles", message: "Asset-role authoring remains unresolved until a later explicit mapping phase.", severity: "error" as const });
    }

    return issues;
  }
};

const flowIn: NodeSocketDefinition = { id: "flowIn", label: "Flow In", direction: "input", kind: "flow", maxConnections: 1 };
const flowOut: NodeSocketDefinition = { id: "flowOut", label: "Flow Out", direction: "output", kind: "flow" };

const questIn: NodeSocketDefinition = { id: "quest", label: "Quest", direction: "input", kind: "value", valueType: "quest.authoring.quest.reference", maxConnections: 1 };
const questOut: NodeSocketDefinition = { id: "quest", label: "Quest", direction: "output", kind: "value", valueType: "quest.authoring.quest.reference" };
const dialogueIn: NodeSocketDefinition = { id: "dialogue", label: "Dialogue", direction: "input", kind: "value", valueType: "quest.authoring.dialogue.reference" };
const dialogueOut: NodeSocketDefinition = { id: "dialogue", label: "Dialogue", direction: "output", kind: "value", valueType: "quest.authoring.dialogue.reference" };
const objectiveIn: NodeSocketDefinition = { id: "objective", label: "Objective", direction: "input", kind: "value", valueType: "quest.authoring.objective.reference" };
const objectiveOut: NodeSocketDefinition = { id: "objective", label: "Objective", direction: "output", kind: "value", valueType: "quest.authoring.objective.reference" };
const interactableIn: NodeSocketDefinition = { id: "interactable", label: "Interactable", direction: "input", kind: "value", valueType: "quest.authoring.interactable.reference" };
const interactableOut: NodeSocketDefinition = { id: "interactable", label: "Interactable", direction: "output", kind: "value", valueType: "quest.authoring.interactable.reference" };
const rewardIn: NodeSocketDefinition = { id: "reward", label: "Reward", direction: "input", kind: "value", valueType: "quest.authoring.reward.reference" };
const rewardOut: NodeSocketDefinition = { id: "reward", label: "Reward", direction: "output", kind: "value", valueType: "quest.authoring.reward.reference" };
const unlockIn: NodeSocketDefinition = { id: "unlock", label: "Unlock", direction: "input", kind: "value", valueType: "quest.authoring.unlock.reference" };
const unlockOut: NodeSocketDefinition = { id: "unlock", label: "Unlock", direction: "output", kind: "value", valueType: "quest.authoring.unlock.reference" };
const checkpointIn: NodeSocketDefinition = { id: "checkpoint", label: "Checkpoint", direction: "input", kind: "value", valueType: "quest.authoring.checkpoint.reference" };
const checkpointOut: NodeSocketDefinition = { id: "checkpoint", label: "Checkpoint", direction: "output", kind: "value", valueType: "quest.authoring.checkpoint.reference" };
const assetRoleIn: NodeSocketDefinition = { id: "assetRole", label: "Asset Role", direction: "input", kind: "value", valueType: "quest.authoring.asset-role.reference" };
const assetRoleOut: NodeSocketDefinition = { id: "assetRole", label: "Asset Role", direction: "output", kind: "value", valueType: "quest.authoring.asset-role.reference" };
const publishContractOut: NodeSocketDefinition = { id: "publishContract", label: "Quest Publish Contract", direction: "output", kind: "value", valueType: "quest.authoring.publish-contract.reference" };
const runtimeReadModelOut: NodeSocketDefinition = { id: "runtimeReadModel", label: "Runtime Read Model Shape", direction: "output", kind: "value", valueType: "runtime.projection.read-model.reference" };

export const QUEST_AUTHORING_GRAPH_NODE_TYPES: readonly QuestAuthoringGraphNodeTypeDefinition[] = [
  node("gk.questAuthoring.quest", "Quest Authoring", "editor-data", [flowIn, flowOut, questOut, assetRoleOut], [
    textField("questId", "Quest Id", true),
    textField("sourceNodeId", "Source Node Id", false),
    textField("title", "Title", false)
  ]),
  node("gk.questAuthoring.dialogue", "Dialogue Authoring", "editor-data", [flowIn, questIn, flowOut, dialogueOut], [
    textField("dialogueId", "Dialogue Id", true),
    textField("speakerRole", "Speaker Role", false),
    textField("line", "Line", false)
  ]),
  node("gk.questAuthoring.objective", "Objective Authoring", "editor-data", [flowIn, questIn, interactableIn, flowOut, objectiveOut], [
    textField("objectiveId", "Objective Id", true),
    textField("requiredEvent", "Required Event", false),
    textField("completionCondition", "Completion Condition", false)
  ]),
  node("gk.questAuthoring.interactable", "Interactable Authoring", "editor-data", [flowIn, questIn, assetRoleIn, flowOut, interactableOut], [
    textField("interactableId", "Interactable Id", true),
    textField("inputEvent", "Input Event", false),
    textField("emits", "Emits", false)
  ]),
  node("gk.questAuthoring.reward", "Reward Authoring", "editor-data", [flowIn, questIn, unlockIn, flowOut, rewardOut], [
    textField("rewardId", "Reward Id", true),
    textField("rewardType", "Reward Type", false),
    textField("persistencePath", "Persistence Path", false)
  ]),
  node("gk.questAuthoring.unlock", "Unlock Authoring", "editor-data", [flowIn, questIn, flowOut, unlockOut], [
    textField("unlockId", "Unlock Id", true),
    textField("unlockType", "Unlock Type", false),
    textField("flagName", "Flag Name", false)
  ]),
  node("gk.questAuthoring.checkpoint", "Checkpoint Authoring", "editor-data", [flowIn, questIn, flowOut, checkpointOut], [
    textField("checkpointId", "Checkpoint Id", true),
    textField("stateKey", "State Key", false)
  ]),
  node("gk.questAuthoring.assetRole", "Asset Role Authoring", "editor-data", [flowIn, questIn, flowOut, assetRoleOut], [
    textField("assetRoleId", "Asset Role Id", true),
    textField("roleLabel", "Role Label", false)
  ]),
  node("gk.questAuthoring.publishBridge", "Quest Authoring Publish Bridge", "publish-boundary", [
    flowIn,
    questIn,
    dialogueIn,
    objectiveIn,
    interactableIn,
    rewardIn,
    unlockIn,
    checkpointIn,
    assetRoleIn,
    flowOut,
    publishContractOut,
    runtimeReadModelOut
  ], [
    textField("draftId", "Draft Id", true),
    textField("graphId", "Graph Id", true)
  ])
] as const;

function node(
  type: string,
  title: string,
  scope: QuestAuthoringGraphNodeTypeDefinition["scope"],
  sockets: readonly NodeSocketDefinition[],
  fields: readonly NodeFieldDefinition[]
): QuestAuthoringGraphNodeTypeDefinition {
  return {
    type,
    title,
    version: 1,
    scope,
    sockets,
    fields,
    validate: validator,
    createsConcreteGameContent: false,
    consumesEditorNodeData: true,
    preparesPublishReadModel: true,
    publishesRuntimeOutput: false,
    runtimeFallbackContent: false,
    hardcodesRuntimeContent: false,
    dummyPublishedData: false,
    loadsAssets: false,
    fetchesAssetBytes: false,
    resolvesFinalAssetRoles: false
  };
}

function textField(id: string, label: string, required: boolean): NodeFieldDefinition {
  return { id, label, kind: "text", required };
}