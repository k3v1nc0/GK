import type {
  AssetLibrarySnapshot,
  AssetRecord
} from "@gk/asset-library";
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
  readonly totalCount: number;
  readonly glbCount: number;
  readonly uiImageCount: number;
  readonly audioCount: number;
  readonly missingCount: number;
  readonly invalidCount: number;
  readonly unassignedCount: number;
  readonly candidateCount: number;
  readonly assignedCount: number;
  readonly source: "asset-library" | "asset-register" | "server-scan";
}

export interface AssetRoleMappingPanelContract {
  readonly displaysStatus: true;
  readonly editsAsEditorData: true;
  readonly assignsDefinitiveRuntimeRoles: false;
}

export interface AssetPanelState {
  readonly panelId: "asset-panel";
  readonly sourceEnv: "GK_ASSET_SOURCE_DIR";
  readonly library: AssetLibrarySnapshot | null;
  readonly inventory: AssetInventorySummary | null;
  readonly unknownOrUnassignedCount: number;
  readonly roleMapping: AssetRoleMappingPanelContract;
  readonly assignsRuntimeRoles: false;
  readonly inventedAssets: readonly never[];
}

export interface AudioPanelState {
  readonly panelId: "audio-panel";
  readonly library: AssetLibrarySnapshot | null;
  readonly inventory: AssetInventorySummary | null;
  readonly audioAssetCount: number;
  readonly audioAssets: readonly AssetRecord[];
  readonly audioPickerEnabled: boolean;
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
    capability: "graph-operation-log-undo-redo",
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

export function createAssetPanelState(library: AssetLibrarySnapshot | null = null): AssetPanelState {
  const inventory = summarizeAssetLibrary(library);

  return {
    panelId: "asset-panel",
    sourceEnv: "GK_ASSET_SOURCE_DIR",
    library,
    inventory,
    unknownOrUnassignedCount: inventory
      ? inventory.unassignedCount + inventory.missingCount + inventory.invalidCount
      : 0,
    roleMapping: {
      displaysStatus: true,
      editsAsEditorData: true,
      assignsDefinitiveRuntimeRoles: false
    },
    assignsRuntimeRoles: false,
    inventedAssets: []
  };
}

export function createAudioPanelState(library: AssetLibrarySnapshot | null = null): AudioPanelState {
  const inventory = summarizeAssetLibrary(library);
  const audioAssets = library?.records.filter((asset) => asset.assetType === "audio" && asset.status === "active") ?? [];

  return {
    panelId: "audio-panel",
    library,
    inventory,
    audioAssetCount: audioAssets.length,
    audioAssets,
    audioPickerEnabled: audioAssets.length > 0,
    gateOpenWhenAudioCountIsZero: true,
    inventedAudio: []
  };
}

export function summarizeAssetLibrary(library: AssetLibrarySnapshot | null): AssetInventorySummary | null {
  if (!library) {
    return null;
  }

  return {
    totalCount: library.counts.total,
    glbCount: library.counts.glb,
    uiImageCount: library.counts.uiImage,
    audioCount: library.counts.audio,
    missingCount: library.counts.missing,
    invalidCount: library.counts.invalid,
    unassignedCount: library.counts.unassigned,
    candidateCount: library.counts.candidate,
    assignedCount: library.counts.assigned,
    source: "asset-library"
  };
}

export function getEditorPanelDefinition(panelId: EditorPanelId): EditorPanelDescriptor {
  const panel = EDITOR_PANEL_DEFINITIONS.find((definition) => definition.id === panelId);

  if (!panel) {
    throw new Error(`Unknown editor panel: ${panelId}`);
  }

  return panel;
}
