export type EditorDockRegion = "left" | "main" | "right" | "bottom" | "dock";

export interface EditorPanelDescriptor {
  readonly id: string;
  readonly title: string;
  readonly region: EditorDockRegion;
  readonly capability: string;
  readonly requiresEditorSession: boolean;
  readonly requiresEditorAdmin: boolean;
  readonly acceptsConcreteGameContent: false;
}

export interface EditorWorkspaceTabDescriptor {
  readonly id: string;
  readonly title: string;
  readonly region: "main";
  readonly panelRole: "tab";
  readonly acceptsConcreteGameContent: false;
}

export interface EditorDockLayoutDescriptor {
  readonly left: readonly string[];
  readonly mainTabs: readonly string[];
  readonly right: readonly string[];
  readonly bottom: readonly string[];
  readonly dockTabs: readonly string[];
}

export const EDITOR_TAB_INTERACTION_CONTRACT = {
  tabListRole: "tablist",
  tabRole: "tab",
  panelRole: "tabpanel",
  keyboardModel: "arrow-keys-switch-tabs"
} as const;
