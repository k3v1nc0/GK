import type {
  RuntimeProjectionAuditEvent,
  RuntimeProjectionManifest,
  RuntimeProjectionReadModel,
  RuntimeProjectionSafetyFlags,
  RuntimeProjectionSource,
  RuntimeProjectionValidationIssue,
  RuntimeProjectionValidationResult
} from "@gk/schemas";
import { createRuntimeProjectionReadModel, createRuntimeProjectionSafetyFlags } from "@gk/schemas";
import type { EditorPanelDescriptor } from "@gk/shared-ui";

export type RuntimeProjectionPanelId = "runtime-projection-panel";

export interface RuntimeProjectionPanelState {
  readonly panelId: RuntimeProjectionPanelId;
  readonly status: "git-basis" | "needs-server-validation" | "validated";
  readonly serverSideValidated: false;
  readonly source: RuntimeProjectionSource | null;
  readonly validation: RuntimeProjectionValidationResult | null;
  readonly validationIssues: readonly RuntimeProjectionValidationIssue[];
  readonly manifests: readonly RuntimeProjectionManifest[];
  readonly selectedManifest: RuntimeProjectionManifest | null;
  readonly readModel: RuntimeProjectionReadModel;
  readonly safetyFlags: RuntimeProjectionSafetyFlags;
  readonly auditEvents: readonly RuntimeProjectionAuditEvent[];
  readonly runtimeReadOnlyRoutes: readonly string[];
  readonly runtimeRendererEnabled: false;
  readonly runtimeGameClientEnabled: false;
  readonly automaticProjectionEnabled: false;
  readonly modifiesAssets: false;
  readonly acceptsConcreteGameContent: false;
  readonly inventedContent: readonly never[];
}

export const RUNTIME_PROJECTION_PANEL_DEFINITION: EditorPanelDescriptor = {
  id: "runtime-projection-panel",
  title: "Runtime Projection",
  region: "dock",
  capability: "runtime-projection-validation-read-model",
  requiresEditorSession: true,
  requiresEditorAdmin: true,
  acceptsConcreteGameContent: false
};

export function createRuntimeProjectionPanelState(options: {
  readonly status?: RuntimeProjectionPanelState["status"];
  readonly source?: RuntimeProjectionSource | null;
  readonly validation?: RuntimeProjectionValidationResult | null;
  readonly manifests?: readonly RuntimeProjectionManifest[];
  readonly selectedManifest?: RuntimeProjectionManifest | null;
  readonly readModel?: RuntimeProjectionReadModel;
  readonly auditEvents?: readonly RuntimeProjectionAuditEvent[];
} = {}): RuntimeProjectionPanelState {
  return {
    panelId: "runtime-projection-panel",
    status: options.status ?? "git-basis",
    serverSideValidated: false,
    source: options.source ?? null,
    validation: options.validation ?? null,
    validationIssues: options.validation?.issues ?? [],
    manifests: options.manifests ?? [],
    selectedManifest: options.selectedManifest ?? null,
    readModel: options.readModel ?? createRuntimeProjectionReadModel(),
    safetyFlags: createRuntimeProjectionSafetyFlags(),
    auditEvents: options.auditEvents ?? [],
    runtimeReadOnlyRoutes: [
      "/runtime/projection/status",
      "/runtime/projection/manifest",
      "/runtime/projection/records"
    ],
    runtimeRendererEnabled: false,
    runtimeGameClientEnabled: false,
    automaticProjectionEnabled: false,
    modifiesAssets: false,
    acceptsConcreteGameContent: false,
    inventedContent: []
  };
}
