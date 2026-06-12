import type {
  NodeFieldDefinition,
  NodeSocketDefinition,
  Validator
} from "@gk/schemas";

interface PublishFlowGraphNodeTypeDefinition {
  readonly type: string;
  readonly title: string;
  readonly version: number;
  readonly scope: "publish-boundary";
  readonly sockets: readonly NodeSocketDefinition[];
  readonly fields: readonly NodeFieldDefinition[];
  readonly validate: Validator<Record<string, unknown>>;
  readonly createsConcreteGameContent: false;
  readonly publishesRuntimeOutput: false;
}

const validator: Validator<Record<string, unknown>> = {
  validate: (config) => {
    const issues = [];

    if (config.publishesRuntimeOutput === true) {
      issues.push({ path: "publishesRuntimeOutput", message: "Fase 10 publish flow nodes cannot publish runtime output.", severity: "error" as const });
    }

    if (config.automaticPublish === true) {
      issues.push({ path: "automaticPublish", message: "Fase 10 publish flow nodes cannot run automatic publish.", severity: "error" as const });
    }

    if (config.copiesAssetsToGit === true) {
      issues.push({ path: "copiesAssetsToGit", message: "Fase 10 publish flow nodes cannot copy or mutate assets.", severity: "error" as const });
    }

    return issues;
  }
};

const flowIn: NodeSocketDefinition = { id: "flowIn", label: "Flow In", direction: "input", kind: "flow", maxConnections: 1 };
const flowOut: NodeSocketDefinition = { id: "flowOut", label: "Flow Out", direction: "output", kind: "flow" };
const candidateIn: NodeSocketDefinition = { id: "candidate", label: "Publish Candidate", direction: "input", kind: "value", valueType: "publish.candidate.reference" };
const candidateOut: NodeSocketDefinition = { id: "candidate", label: "Publish Candidate", direction: "output", kind: "value", valueType: "publish.candidate.reference" };
const validationIn: NodeSocketDefinition = { id: "validation", label: "Publish Validation", direction: "input", kind: "value", valueType: "publish.validation.reference", maxConnections: 1 };
const validationOut: NodeSocketDefinition = { id: "validation", label: "Publish Validation", direction: "output", kind: "value", valueType: "publish.validation.reference" };
const snapshotIn: NodeSocketDefinition = { id: "snapshot", label: "Snapshot Metadata", direction: "input", kind: "value", valueType: "publish.snapshot.reference", maxConnections: 1 };
const snapshotOut: NodeSocketDefinition = { id: "snapshot", label: "Snapshot Metadata", direction: "output", kind: "value", valueType: "publish.snapshot.reference" };

export const PUBLISH_FLOW_GRAPH_NODE_TYPES: readonly PublishFlowGraphNodeTypeDefinition[] = [
  node("gk.publish.status", "Publish Status", [flowIn, flowOut, validationOut], [
    textField("bundleId", "Bundle Id", false)
  ]),
  node("gk.publish.candidateReference", "Publish Candidate Reference", [candidateOut], [
    textField("candidateId", "Candidate Id", true),
    textField("sourceId", "Source Id", true)
  ]),
  node("gk.publish.validate", "Publish Validate", [flowIn, candidateIn, flowOut, validationOut], [
    textField("bundleId", "Bundle Id", true)
  ]),
  node("gk.publish.snapshotMetadata", "Publish Snapshot Metadata", [flowIn, validationIn, flowOut, snapshotOut], [
    textField("snapshotId", "Snapshot Id", true),
    textField("sourceBundleId", "Source Bundle Id", true)
  ]),
  node("gk.publish.rollbackReference", "Publish Rollback Reference", [flowIn, snapshotIn, flowOut], [
    textField("rollbackReferenceId", "Rollback Reference Id", true),
    textField("targetSnapshotId", "Target Snapshot Id", true)
  ])
] as const;

function node(
  type: string,
  title: string,
  sockets: readonly NodeSocketDefinition[],
  fields: readonly NodeFieldDefinition[]
): PublishFlowGraphNodeTypeDefinition {
  return {
    type,
    title,
    version: 1,
    scope: "publish-boundary",
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
