import type {
  NodeFieldDefinition,
  NodeSocketDefinition,
  Validator
} from "@gk/schemas";

interface RuntimeClientShellGraphNodeTypeDefinition {
  readonly type: string;
  readonly title: string;
  readonly version: number;
  readonly scope: "runtime-consumer";
  readonly sockets: readonly NodeSocketDefinition[];
  readonly fields: readonly NodeFieldDefinition[];
  readonly validate: Validator<Record<string, unknown>>;
  readonly createsConcreteGameContent: false;
  readonly consumesRuntimeProjection: true;
  readonly implementsRenderer: false;
  readonly implementsGameplay: false;
  readonly mutatesAssets: false;
}

const validator: Validator<Record<string, unknown>> = {
  validate: (config) => {
    const issues = [];

    if (config.usesEditorDraftData === true || config.usesEditorAdminRoutes === true) {
      issues.push({ path: "usesEditorDraftData", message: "Fase 12 runtime client nodes can only consume runtime projection read-only data.", severity: "error" as const });
    }

    if (
      config.implements3DRenderer === true
      || config.implementsRenderer === true
      || config.implementsGameplay === true
      || config.implementsCombat === true
      || config.implementsMovement === true
    ) {
      issues.push({ path: "implementsRuntime", message: "Fase 12 runtime client nodes cannot implement renderer, gameplay, combat or movement.", severity: "error" as const });
    }

    if (config.implementsAudioPlayback === true) {
      issues.push({ path: "implementsAudioPlayback", message: "Fase 12 runtime client nodes cannot implement audio playback.", severity: "error" as const });
    }

    if (config.mutatesAssets === true || config.copiesAssetsToGit === true) {
      issues.push({ path: "mutatesAssets", message: "Runtime client shell nodes cannot mutate, copy, upload or remove assets.", severity: "error" as const });
    }

    if (config.containsConcreteGameContent === true || config.hardcodesContent === true) {
      issues.push({ path: "hardcodesContent", message: "Runtime client shell nodes cannot hardcode world, camera, lighting, minimap, HUD, audio, NPC, quest or economy content.", severity: "error" as const });
    }

    return issues;
  }
};

const flowIn: NodeSocketDefinition = { id: "flowIn", label: "Flow In", direction: "input", kind: "flow", maxConnections: 1 };
const flowOut: NodeSocketDefinition = { id: "flowOut", label: "Flow Out", direction: "output", kind: "flow" };
const projectionManifestIn: NodeSocketDefinition = { id: "manifest", label: "Projection Manifest", direction: "input", kind: "value", valueType: "runtime.projection.manifest.reference", maxConnections: 1 };
const projectionReadModelIn: NodeSocketDefinition = { id: "readModel", label: "Projection Read Model", direction: "input", kind: "value", valueType: "runtime.projection.read-model.reference", maxConnections: 1 };
const clientShellIn: NodeSocketDefinition = { id: "clientShell", label: "Runtime Client Shell", direction: "input", kind: "value", valueType: "runtime.client.shell.reference", maxConnections: 1 };
const clientShellOut: NodeSocketDefinition = { id: "clientShell", label: "Runtime Client Shell", direction: "output", kind: "value", valueType: "runtime.client.shell.reference" };
const bootStateOut: NodeSocketDefinition = { id: "bootState", label: "Boot State", direction: "output", kind: "value", valueType: "runtime.client.boot-state.reference" };
const projectionStateOut: NodeSocketDefinition = { id: "projectionState", label: "Projection State", direction: "output", kind: "value", valueType: "runtime.client.projection-state.reference" };
const safetyOut: NodeSocketDefinition = { id: "safety", label: "Client Safety", direction: "output", kind: "value", valueType: "runtime.client.safety.reference" };

export const RUNTIME_CLIENT_SHELL_GRAPH_NODE_TYPES: readonly RuntimeClientShellGraphNodeTypeDefinition[] = [
  node("gk.runtimeClient.shell", "Runtime Client Shell", [flowIn, projectionManifestIn, projectionReadModelIn, flowOut, clientShellOut, safetyOut], [
    textField("shellRoute", "Shell Route", true)
  ]),
  node("gk.runtimeClient.bootState", "Runtime Client Boot State", [clientShellIn, bootStateOut], [
    textField("bootStateId", "Boot State Id", false)
  ]),
  node("gk.runtimeClient.projectionState", "Runtime Client Projection State", [projectionReadModelIn, projectionStateOut], [
    textField("projectionStateId", "Projection State Id", false)
  ]),
  node("gk.runtimeClient.safetyFlags", "Runtime Client Safety Flags", [clientShellIn, safetyOut], [
    textField("safetyId", "Safety Id", false)
  ])
] as const;

function node(
  type: string,
  title: string,
  sockets: readonly NodeSocketDefinition[],
  fields: readonly NodeFieldDefinition[]
): RuntimeClientShellGraphNodeTypeDefinition {
  return {
    type,
    title,
    version: 1,
    scope: "runtime-consumer",
    sockets,
    fields,
    validate: validator,
    createsConcreteGameContent: false,
    consumesRuntimeProjection: true,
    implementsRenderer: false,
    implementsGameplay: false,
    mutatesAssets: false
  };
}

function textField(id: string, label: string, required: boolean): NodeFieldDefinition {
  return { id, label, kind: "text", required };
}
