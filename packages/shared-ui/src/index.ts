export type UiContentPolicy = "node-data-only";

export interface UiSurfaceDescriptor {
  readonly appId: string;
  readonly reads: readonly string[];
  readonly contentPolicy: UiContentPolicy;
}

export interface EditorGraphInteractionContract {
  readonly undoShortcut: "Ctrl+Z";
  readonly redoShortcuts: readonly ["Ctrl+Y", "Ctrl+Shift+Z"];
  readonly historyDepth: 100;
  readonly draftPreviewPublishesRuntimeOutput: false;
}

export const EDITOR_GRAPH_INTERACTION_CONTRACT: EditorGraphInteractionContract = {
  undoShortcut: "Ctrl+Z",
  redoShortcuts: ["Ctrl+Y", "Ctrl+Shift+Z"],
  historyDepth: 100,
  draftPreviewPublishesRuntimeOutput: false
};

export const SHARED_UI_CONTENT_POLICY: UiContentPolicy = "node-data-only";

export * from "./editor-layout.js";
