import type { EditorPanelDescriptor } from "@gk/shared-ui";

export type EditorPanelId =
  | "node-library"
  | "inspector"
  | "validation"
  | "history"
  | "asset-panel"
  | "audio-panel"
  | "hud-editor"
  | "minimap-panel"
  | "game-users";

export interface AssetInventorySummary {
  readonly glbCount: number;
  readonly uiImageCount: number;
  readonly audioCount: number;
  readonly source: "asset-register" | "server-scan";
}

export interface AssetPanelState {
  readonly panelId: "asset-panel";
  readonly sourceEnv: "GK_ASSET_SOURCE_DIR";
  readonly inventory: AssetInventorySummary | null;
  readonly assignsRuntimeRoles: false;
  readonly inventedAssets: readonly never[];
}

export interface AudioPanelState {
  readonly panelId: "audio-panel";
  readonly inventory: AssetInventorySummary | null;
  readonly gateOpenWhenAudioCountIsZero: true;
  readonly inventedAudio: readonly never[];
}

export const EDITOR_PANEL_DEFINITIONS: readonly EditorPanelDescriptor[] = [
  {
    id: "node-library",
    title: "Node Library",
    region: "left",
    capability: "node-type-selection",
    requiresEditorSession: true,
    requiresEditorAdmin: false,
    acceptsConcreteGameContent: false
  },
  {
    id: "inspector",
    title: "Inspector",
    region: "right",
    capability: "selected-node-fields",
    requiresEditorSession: true,
    requiresEditorAdmin: false,
    acceptsConcreteGameContent: false
  },
  {
    id: "validation",
    title: "Validation",
    region: "right",
    capability: "node-validation-feedback",
    requiresEditorSession: true,
    requiresEditorAdmin: false,
    acceptsConcreteGameContent: false
  },
  {
    id: "history",
    title: "History",
    region: "bottom",
    capability: "editor-event-log",
    requiresEditorSession: true,
    requiresEditorAdmin: false,
    acceptsConcreteGameContent: false
  },
  {
    id: "asset-panel",
    title: "Asset Panel",
    region: "dock",
    capability: "asset-library-inventory",
    requiresEditorSession: true,
    requiresEditorAdmin: false,
    acceptsConcreteGameContent: false
  },
  {
    id: "audio-panel",
    title: "Audio Panel",
    region: "dock",
    capability: "audio-library-inventory",
    requiresEditorSession: true,
    requiresEditorAdmin: false,
    acceptsConcreteGameContent: false
  },
  {
    id: "hud-editor",
    title: "HUD Editor",
    region: "dock",
    capability: "hud-node-configuration",
    requiresEditorSession: true,
    requiresEditorAdmin: false,
    acceptsConcreteGameContent: false
  },
  {
    id: "minimap-panel",
    title: "Minimap Panel",
    region: "dock",
    capability: "minimap-node-configuration",
    requiresEditorSession: true,
    requiresEditorAdmin: false,
    acceptsConcreteGameContent: false
  },
  {
    id: "game-users",
    title: "Game Users",
    region: "dock",
    capability: "game-user-management",
    requiresEditorSession: true,
    requiresEditorAdmin: true,
    acceptsConcreteGameContent: false
  }
] as const;

export function createAssetPanelState(inventory: AssetInventorySummary | null = null): AssetPanelState {
  return {
    panelId: "asset-panel",
    sourceEnv: "GK_ASSET_SOURCE_DIR",
    inventory,
    assignsRuntimeRoles: false,
    inventedAssets: []
  };
}

export function createAudioPanelState(inventory: AssetInventorySummary | null = null): AudioPanelState {
  return {
    panelId: "audio-panel",
    inventory,
    gateOpenWhenAudioCountIsZero: true,
    inventedAudio: []
  };
}

export function getEditorPanelDefinition(panelId: EditorPanelId): EditorPanelDescriptor {
  const panel = EDITOR_PANEL_DEFINITIONS.find((definition) => definition.id === panelId);

  if (!panel) {
    throw new Error(`Unknown editor panel: ${panelId}`);
  }

  return panel;
}
