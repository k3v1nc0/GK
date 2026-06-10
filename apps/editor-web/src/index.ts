import type { PublishedNodeEnvelope } from "@gk/schemas";
import type { UiSurfaceDescriptor } from "@gk/shared-ui";

export * from "./auth-client.js";
export * from "./editor-shell.js";
export * from "./game-user-management.js";
export * from "./node-canvas.js";
export * from "./panels.js";
export * from "./world-preview.js";

export interface EditorWorkspaceBoot {
  readonly loadedNodeCount: number;
  readonly acceptsConcreteContent: false;
}

export const editorWebSurface: UiSurfaceDescriptor = {
  appId: "editor-web",
  reads: ["schemas", "node-types"],
  contentPolicy: "node-data-only"
};

export function describeEditorBoot(nodes: readonly PublishedNodeEnvelope[]): EditorWorkspaceBoot {
  return {
    loadedNodeCount: nodes.length,
    acceptsConcreteContent: false
  };
}
