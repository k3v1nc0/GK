import type {
  NodeFieldDefinition,
  NodeSocketDefinition,
  Validator
} from "@gk/schemas";

interface ProceduralGraphNodeTypeDefinition {
  readonly type: string;
  readonly title: string;
  readonly version: number;
  readonly scope: "engine-capability";
  readonly sockets: readonly NodeSocketDefinition[];
  readonly fields: readonly NodeFieldDefinition[];
  readonly validate: Validator<Record<string, unknown>>;
  readonly createsConcreteGameContent: false;
  readonly publishesRuntimeOutput: false;
}

const validator: Validator<Record<string, unknown>> = {
  validate: (config) => config.publishesRuntimeOutput === true
    ? [{ path: "publishesRuntimeOutput", message: "Procedural nodes cannot publish runtime output in Fase 8.1.", severity: "error" }]
    : []
};

const flowIn: NodeSocketDefinition = { id: "flowIn", label: "Flow In", direction: "input", kind: "flow", maxConnections: 1 };
const flowOut: NodeSocketDefinition = { id: "flowOut", label: "Flow Out", direction: "output", kind: "flow" };
const seedIn: NodeSocketDefinition = { id: "seed", label: "Seed", direction: "input", kind: "value", valueType: "procedural.seed.reference", maxConnections: 1 };
const seedOut: NodeSocketDefinition = { id: "seed", label: "Seed", direction: "output", kind: "value", valueType: "procedural.seed.reference" };
const graphIn: NodeSocketDefinition = { id: "graph", label: "Procedural Graph", direction: "input", kind: "value", valueType: "procedural.graph.reference", maxConnections: 1 };
const graphOut: NodeSocketDefinition = { id: "graph", label: "Procedural Graph", direction: "output", kind: "value", valueType: "procedural.graph.reference" };
const outputIn: NodeSocketDefinition = { id: "generationOutput", label: "Generation Output", direction: "input", kind: "value", valueType: "generation.output.reference", maxConnections: 1 };
const outputOut: NodeSocketDefinition = { id: "generationOutput", label: "Generation Output", direction: "output", kind: "value", valueType: "generation.output.reference" };
const assetIn: NodeSocketDefinition = { id: "asset", label: "Asset", direction: "input", kind: "value", valueType: "asset.reference", maxConnections: 1 };
const entityIn: NodeSocketDefinition = { id: "entity", label: "Entity", direction: "input", kind: "value", valueType: "entity.reference", maxConnections: 1 };
const entityDraftOut: NodeSocketDefinition = { id: "generatedEntity", label: "Generated Entity Draft", direction: "output", kind: "value", valueType: "generated.entity.draft.reference" };
const groupDraftOut: NodeSocketDefinition = { id: "generatedGroup", label: "Generated Group Draft", direction: "output", kind: "value", valueType: "generated.group.draft.reference" };
const placementOut: NodeSocketDefinition = { id: "placement", label: "Placement Candidate", direction: "output", kind: "value", valueType: "generated.placement.candidate.reference" };
const spawnAreaOut: NodeSocketDefinition = { id: "spawnArea", label: "Spawn Area Candidate", direction: "output", kind: "value", valueType: "generated.spawn-area.candidate.reference" };
const pathNetworkOut: NodeSocketDefinition = { id: "pathNetwork", label: "Path Network Candidate", direction: "output", kind: "value", valueType: "generated.path-network.candidate.reference" };
const resourceDistributionOut: NodeSocketDefinition = { id: "resourceDistribution", label: "Resource Distribution Candidate", direction: "output", kind: "value", valueType: "generated.resource-distribution.candidate.reference" };

export const PROCEDURAL_GENERATION_GRAPH_NODE_TYPES: readonly ProceduralGraphNodeTypeDefinition[] = [
  node("gk.proc.seed", "Procedural Seed", [seedOut, graphOut], [
    dropdownField("scope", "Scope", ["world", "zone", "local"], true),
    textField("seed", "Seed", true)
  ]),
  node("gk.proc.random", "Deterministic Random Stream", [seedIn, outputOut], [
    textField("streamKey", "Stream Key", false)
  ]),
  node("gk.proc.pickWeighted", "Pick Weighted", [seedIn, outputOut], [
    textField("weightedTableKey", "Weighted Table Key", true)
  ]),
  node("gk.proc.noise2D", "Noise 2D", [seedIn, outputOut], [
    textField("noiseProfileKey", "Noise Profile Key", false)
  ]),
  node("gk.proc.noise3D", "Noise 3D", [seedIn, outputOut], [
    textField("noiseProfileKey", "Noise Profile Key", false)
  ]),
  node("gk.proc.scatterAssets", "Scatter Assets", [flowIn, seedIn, assetIn, flowOut, placementOut], [
    numberField("count", "Count"),
    textField("placementRuleKey", "Placement Rule Key", false)
  ]),
  node("gk.proc.scatterEntities", "Scatter Entities", [flowIn, seedIn, entityIn, flowOut, entityDraftOut, placementOut], [
    numberField("count", "Count"),
    textField("placementRuleKey", "Placement Rule Key", false)
  ]),
  node("gk.proc.zoneLayout", "Zone Layout Candidate", [seedIn, graphOut, groupDraftOut], [
    textField("layoutRuleKey", "Layout Rule Key", false)
  ]),
  node("gk.proc.pathNetwork", "Path Network Candidate", [seedIn, graphIn, pathNetworkOut], [
    textField("pathRuleKey", "Path Rule Key", false)
  ]),
  node("gk.proc.spawnArea", "Spawn Area Candidate", [seedIn, graphIn, spawnAreaOut], [
    textField("spawnRuleKey", "Spawn Rule Key", false)
  ]),
  node("gk.proc.resourceDistribution", "Resource Distribution Candidate", [seedIn, graphIn, resourceDistributionOut], [
    textField("resourceRuleKey", "Resource Rule Key", false)
  ]),
  node("gk.proc.validateGeneratedGraph", "Validate Generated Graph", [graphIn, outputIn, outputOut], []),
  node("gk.proc.previewGeneration", "Preview Generation", [flowIn, graphIn, flowOut, outputOut], []),
  node("gk.proc.bakeGenerationDraft", "Bake Generation Draft", [flowIn, outputIn, flowOut, entityDraftOut, groupDraftOut, placementOut], [
    dropdownField("target", "Target", ["editor-draft-only"], true)
  ])
] as const;

function node(
  type: string,
  title: string,
  sockets: readonly NodeSocketDefinition[],
  fields: readonly NodeFieldDefinition[]
): ProceduralGraphNodeTypeDefinition {
  return {
    type,
    title,
    version: 1,
    scope: "engine-capability",
    sockets,
    fields,
    validate: validator,
    createsConcreteGameContent: false,
    publishesRuntimeOutput: false
  };
}

function textField(id: string, label: string, required: boolean): NodeFieldDefinition {
  return { id, label, kind: "text", required };
}

function numberField(id: string, label: string): NodeFieldDefinition {
  return { id, label, kind: "number", required: false };
}

function dropdownField(id: string, label: string, values: readonly string[], required = false): NodeFieldDefinition {
  return {
    id,
    label,
    kind: "dropdown",
    required,
    options: values.map((value) => ({ value, label: value }))
  };
}
