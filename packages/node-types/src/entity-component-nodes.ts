import type {
  NodeFieldDefinition,
  NodeSocketDefinition,
  Validator
} from "@gk/schemas";

interface EntityGraphNodeTypeDefinition {
  readonly type: string;
  readonly title: string;
  readonly version: number;
  readonly scope: "engine-capability";
  readonly sockets: readonly NodeSocketDefinition[];
  readonly fields: readonly NodeFieldDefinition[];
  readonly validate: Validator<Record<string, unknown>>;
  readonly createsConcreteGameContent: false;
}

const validator: Validator<Record<string, unknown>> = {
  validate: () => []
};

const flowIn: NodeSocketDefinition = { id: "flowIn", label: "Flow In", direction: "input", kind: "flow", maxConnections: 1 };
const flowOut: NodeSocketDefinition = { id: "flowOut", label: "Flow Out", direction: "output", kind: "flow" };
const assetIn: NodeSocketDefinition = { id: "asset", label: "Asset", direction: "input", kind: "value", valueType: "asset.reference", maxConnections: 1 };
const audioIn: NodeSocketDefinition = { id: "audio", label: "Audio", direction: "input", kind: "value", valueType: "audio.reference", maxConnections: 1 };
const entityIn: NodeSocketDefinition = { id: "entity", label: "Entity", direction: "input", kind: "value", valueType: "entity.reference", maxConnections: 1 };
const entityOut: NodeSocketDefinition = { id: "entity", label: "Entity", direction: "output", kind: "value", valueType: "entity.reference" };
const componentIn: NodeSocketDefinition = { id: "component", label: "Component", direction: "input", kind: "value", valueType: "component.reference", maxConnections: 1 };
const componentOut: NodeSocketDefinition = { id: "component", label: "Component", direction: "output", kind: "value", valueType: "component.reference" };
const groupIn: NodeSocketDefinition = { id: "group", label: "Group", direction: "input", kind: "value", valueType: "entity.group.reference", maxConnections: 1 };
const groupOut: NodeSocketDefinition = { id: "group", label: "Group", direction: "output", kind: "value", valueType: "entity.group.reference" };

const emptyFields: readonly NodeFieldDefinition[] = [];
const transformFields: readonly NodeFieldDefinition[] = [
  numberField("positionX", "Position X"),
  numberField("positionY", "Position Y"),
  numberField("positionZ", "Position Z"),
  numberField("rotationX", "Rotation X"),
  numberField("rotationY", "Rotation Y"),
  numberField("rotationZ", "Rotation Z"),
  numberField("scaleX", "Scale X"),
  numberField("scaleY", "Scale Y"),
  numberField("scaleZ", "Scale Z")
];

export const ENTITY_COMPONENT_GRAPH_NODE_TYPES: readonly EntityGraphNodeTypeDefinition[] = [
  node("gk.entity.spawnFromAsset", "Entity Spawn From Asset", [flowIn, assetIn, flowOut, entityOut], emptyFields),
  node("gk.entity.addComponent", "Entity Add Component", [flowIn, entityIn, componentIn, flowOut, entityOut], emptyFields),
  node("gk.entity.group", "Entity Group", [entityIn, groupOut], emptyFields),
  node("gk.entity.groupTransform", "Entity Group Transform", [flowIn, groupIn, flowOut, groupOut], transformFields),
  node("gk.component.renderable", "Renderable Component", [assetIn, componentOut], [assetField("assetReference", "Renderable Asset")]),
  node("gk.component.transform", "Transform Component", [componentOut], transformFields),
  node("gk.component.collider", "Collider Component", [componentOut], [
    dropdownField("shape", "Shape", ["box", "sphere", "capsule", "mesh"]),
    numberField("width", "Width"),
    numberField("height", "Height"),
    numberField("depth", "Depth")
  ]),
  node("gk.component.interactable", "Interactable Component", [componentOut], [
    dropdownField("interactionMode", "Interaction Mode", ["candidate", "requires-editor-data"])
  ]),
  node("gk.component.audioEmitter", "Audio Emitter Component", [audioIn, componentOut], [audioField("audioReference", "Audio")]),
  node("gk.component.npcBrain", "NPC Brain Component", [componentOut], behaviorFields()),
  node("gk.component.combatant", "Combatant Component", [componentOut], behaviorFields()),
  node("gk.component.boss", "Boss Component", [componentOut], behaviorFields()),
  node("gk.component.loot", "Loot Component", [componentOut], candidateFields()),
  node("gk.component.questTarget", "Quest Target Component", [componentOut], candidateFields()),
  node("gk.component.merchant", "Merchant Component", [componentOut], behaviorFields()),
  node("gk.component.playerAppearance", "Player Appearance Component", [componentOut], behaviorFields()),
  node("gk.npc.makeFromAsset", "NPC Candidate From Asset", [flowIn, assetIn, flowOut, entityOut], [
    dropdownField("roleMappingStatus", "Role Mapping Status", ["candidate"])
  ])
] as const;

function node(
  type: string,
  title: string,
  sockets: readonly NodeSocketDefinition[],
  fields: readonly NodeFieldDefinition[]
): EntityGraphNodeTypeDefinition {
  return {
    type,
    title,
    version: 1,
    scope: "engine-capability",
    sockets,
    fields,
    validate: validator,
    createsConcreteGameContent: false
  };
}

function candidateFields(): readonly NodeFieldDefinition[] {
  return [dropdownField("componentStatus", "Component Status", ["candidate", "assigned", "invalid"])];
}

function behaviorFields(): readonly NodeFieldDefinition[] {
  return [
    dropdownField("componentStatus", "Component Status", ["candidate", "assigned", "invalid"]),
    dropdownField("runtimeActivation", "Runtime Activation", ["candidate", "runtime-active-requires-editor-data"]),
    dropdownField("animationMapping", "Animation Mapping", ["missing-warning", "editor-data-required-for-runtime"])
  ];
}

function numberField(id: string, label: string): NodeFieldDefinition {
  return { id, label, kind: "number", required: false };
}

function assetField(id: string, label: string): NodeFieldDefinition {
  return { id, label, kind: "asset-picker", required: true };
}

function audioField(id: string, label: string): NodeFieldDefinition {
  return { id, label, kind: "audio-picker", required: false };
}

function dropdownField(id: string, label: string, values: readonly string[]): NodeFieldDefinition {
  return {
    id,
    label,
    kind: "dropdown",
    required: false,
    options: values.map((value) => ({ value, label: value }))
  };
}
