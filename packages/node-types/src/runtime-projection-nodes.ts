import type {
  NodeFieldDefinition,
  NodeSocketDefinition,
  Validator
} from "@gk/schemas";

interface RuntimeProjectionGraphNodeTypeDefinition {
  readonly type: string;
  readonly title: string;
  readonly version: number;
  readonly scope: "publish-boundary";
  readonly sockets: readonly NodeSocketDefinition[];
  readonly fields: readonly NodeFieldDefinition[];
  readonly validate: Validator<Record<string, unknown>>;
  readonly createsConcreteGameContent: false;
  readonly implementsRuntimeRenderer: false;
  readonly mutatesAssets: false;
}

const validator: Validator<Record<string, unknown>> = {
  validate: (config) => {
    const issues = [];

    if (config.implementsRuntimeRenderer === true || config.buildsRuntimeClient === true) {
      issues.push({ path: "implementsRuntimeRenderer", message: "Fase 11 runtime projection nodes cannot implement a runtime renderer or client.", severity: "error" as const });
    }

    if (config.mutatesAssets === true || config.copiesAssetsToGit === true) {
      issues.push({ path: "mutatesAssets", message: "Runtime projection nodes cannot mutate, copy or remove assets.", severity: "error" as const });
    }

    if (config.containsConcreteGameContent === true || config.usesHardcodedContent === true) {
      issues.push({ path: "containsConcreteGameContent", message: "Runtime projection nodes cannot contain hardcoded world, camera, lighting, minimap, HUD, audio or gamecontent.", severity: "error" as const });
    }

    if (config.automaticProjection === true) {
      issues.push({ path: "automaticProjection", message: "Fase 11 does not allow automatic runtime projection.", severity: "error" as const });
    }

    return issues;
  }
};

const flowIn: NodeSocketDefinition = { id: "flowIn", label: "Flow In", direction: "input", kind: "flow", maxConnections: 1 };
const flowOut: NodeSocketDefinition = { id: "flowOut", label: "Flow Out", direction: "output", kind: "flow" };
const publishSnapshotIn: NodeSocketDefinition = { id: "snapshot", label: "Publish Snapshot", direction: "input", kind: "value", valueType: "publish.snapshot.reference", maxConnections: 1 };
const publishValidationIn: NodeSocketDefinition = { id: "publishValidation", label: "Publish Validation", direction: "input", kind: "value", valueType: "publish.validation.reference", maxConnections: 1 };
const projectionSourceOut: NodeSocketDefinition = { id: "projectionSource", label: "Projection Source", direction: "output", kind: "value", valueType: "runtime.projection.source.reference" };
const projectionSourceIn: NodeSocketDefinition = { id: "projectionSource", label: "Projection Source", direction: "input", kind: "value", valueType: "runtime.projection.source.reference", maxConnections: 1 };
const projectionValidationOut: NodeSocketDefinition = { id: "projectionValidation", label: "Projection Validation", direction: "output", kind: "value", valueType: "runtime.projection.validation.reference" };
const projectionValidationIn: NodeSocketDefinition = { id: "projectionValidation", label: "Projection Validation", direction: "input", kind: "value", valueType: "runtime.projection.validation.reference", maxConnections: 1 };
const projectionManifestOut: NodeSocketDefinition = { id: "manifest", label: "Projection Manifest", direction: "output", kind: "value", valueType: "runtime.projection.manifest.reference" };
const projectionManifestIn: NodeSocketDefinition = { id: "manifest", label: "Projection Manifest", direction: "input", kind: "value", valueType: "runtime.projection.manifest.reference", maxConnections: 1 };
const readModelOut: NodeSocketDefinition = { id: "readModel", label: "Read Model", direction: "output", kind: "value", valueType: "runtime.projection.read-model.reference" };
const auditOut: NodeSocketDefinition = { id: "audit", label: "Projection Audit", direction: "output", kind: "value", valueType: "runtime.projection.audit.reference" };

export const RUNTIME_PROJECTION_GRAPH_NODE_TYPES: readonly RuntimeProjectionGraphNodeTypeDefinition[] = [
  node("gk.runtimeProjection.source", "Runtime Projection Source", [publishSnapshotIn, publishValidationIn, projectionSourceOut], [
    textField("sourceId", "Source Id", true)
  ]),
  node("gk.runtimeProjection.validate", "Runtime Projection Validate", [flowIn, projectionSourceIn, flowOut, projectionValidationOut], [
    textField("validationId", "Validation Id", false)
  ]),
  node("gk.runtimeProjection.manifest", "Runtime Projection Manifest", [flowIn, projectionSourceIn, projectionValidationIn, flowOut, projectionManifestOut, auditOut], [
    textField("manifestId", "Manifest Id", true)
  ]),
  node("gk.runtimeProjection.readModel", "Runtime Projection Read Model", [projectionManifestIn, readModelOut], [
    textField("readModelId", "Read Model Id", false)
  ]),
  node("gk.runtimeProjection.auditEvent", "Runtime Projection Audit Event", [projectionManifestIn, auditOut], [
    textField("eventId", "Event Id", false)
  ])
] as const;

function node(
  type: string,
  title: string,
  sockets: readonly NodeSocketDefinition[],
  fields: readonly NodeFieldDefinition[]
): RuntimeProjectionGraphNodeTypeDefinition {
  return {
    type,
    title,
    version: 1,
    scope: "publish-boundary",
    sockets,
    fields,
    validate: validator,
    createsConcreteGameContent: false,
    implementsRuntimeRenderer: false,
    mutatesAssets: false
  };
}

function textField(id: string, label: string, required: boolean): NodeFieldDefinition {
  return { id, label, kind: "text", required };
}
