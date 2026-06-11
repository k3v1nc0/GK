import type {
  EditorGraphInteractionContract,
  EditorDockLayoutDescriptor,
  EditorWorkspaceTabDescriptor
} from "@gk/shared-ui";
import { EDITOR_GRAPH_INTERACTION_CONTRACT } from "@gk/shared-ui";

import { editorAuthClientContract } from "./auth-client.js";
import { createEmptyNodeCanvasState, type NodeCanvasState } from "./node-canvas.js";
import { EDITOR_PANEL_DEFINITIONS, type EditorPanelId } from "./panels.js";
import { createEmptyWorldPreviewState, type EmptyWorldPreviewState } from "./world-preview.js";

export interface EditorLoginEntryContract {
  readonly route: "/auth/editor/login";
  readonly sessionRoute: "/auth/editor/me";
  readonly scope: "editor";
  readonly publicRegistration: false;
}

export interface EditorShellModel {
  readonly loginEntry: EditorLoginEntryContract;
  readonly layout: EditorDockLayoutDescriptor;
  readonly mainTabs: readonly EditorWorkspaceTabDescriptor[];
  readonly panels: typeof EDITOR_PANEL_DEFINITIONS;
  readonly nodeCanvas: NodeCanvasState;
  readonly worldPreview: EmptyWorldPreviewState;
  readonly graphInteraction: EditorGraphInteractionContract;
  readonly acceptsConcreteGameContent: false;
}

export const EDITOR_MAIN_TABS: readonly EditorWorkspaceTabDescriptor[] = [
  {
    id: "node-canvas",
    title: "Node Canvas",
    region: "main",
    panelRole: "tab",
    acceptsConcreteGameContent: false
  },
  {
    id: "viewport-world-preview",
    title: "Viewport / World Preview",
    region: "main",
    panelRole: "tab",
    acceptsConcreteGameContent: false
  }
] as const;

export const EDITOR_SHELL_LAYOUT: EditorDockLayoutDescriptor = {
  left: ["node-library"],
  mainTabs: ["node-canvas", "viewport-world-preview"],
  right: ["inspector", "validation"],
  bottom: ["history"],
  dockTabs: ["asset-panel", "audio-panel", "hud-editor", "minimap-panel", "game-users"]
} as const;

export function createEditorLoginEntryContract(): EditorLoginEntryContract {
  return {
    route: editorAuthClientContract.routes.login,
    sessionRoute: editorAuthClientContract.routes.me,
    scope: "editor",
    publicRegistration: false
  };
}

export function createEditorShellModel(): EditorShellModel {
  return {
    loginEntry: createEditorLoginEntryContract(),
    layout: EDITOR_SHELL_LAYOUT,
    mainTabs: EDITOR_MAIN_TABS,
    panels: EDITOR_PANEL_DEFINITIONS,
    nodeCanvas: createEmptyNodeCanvasState(),
    worldPreview: createEmptyWorldPreviewState(),
    graphInteraction: EDITOR_GRAPH_INTERACTION_CONTRACT,
    acceptsConcreteGameContent: false
  };
}

export function isDockPanel(panelId: EditorPanelId): boolean {
  return EDITOR_SHELL_LAYOUT.dockTabs.includes(panelId);
}
