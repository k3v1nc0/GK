import {
  UI_DISPLAY_SCHEMA_HINTS,
  type MinimapLayerDraft,
  type MinimapMarkerDraft,
  type MinimapViewDraft,
  type Phase9DataDrivenNodeDraft,
  type Phase9ValidationIssue,
  type UiAssetDisplayContract,
  type WorldSettingsDraft,
  type WorldZoneDraft
} from "@gk/schemas";
import type { EditorPanelDescriptor } from "@gk/shared-ui";

export type WorldCameraMinimapPanelId =
  | "world-panel"
  | "zone-panel"
  | "camera-panel"
  | "lighting-panel"
  | "minimap-panel"
  | "ui-display-inspector";

export interface WorldPanelState {
  readonly panelId: "world-panel";
  readonly worldSettings: WorldSettingsDraft | null;
  readonly generatedZoneCandidates: readonly never[];
  readonly generatedPlacementCandidates: readonly never[];
  readonly generatedPathNetworkCandidates: readonly never[];
  readonly generatedResourceDistributionCandidates: readonly never[];
  readonly publishesRuntimeOutput: false;
  readonly acceptsConcreteGameContent: false;
  readonly inventedContent: readonly never[];
}

export interface ZonePanelState {
  readonly panelId: "zone-panel";
  readonly zones: readonly WorldZoneDraft[];
  readonly selectedZoneId: string | null;
  readonly generatedCandidateInputOnly: true;
  readonly publishesRuntimeOutput: false;
  readonly acceptsConcreteGameContent: false;
}

export interface CameraPanelState {
  readonly panelId: "camera-panel";
  readonly cameraNodes: readonly Phase9DataDrivenNodeDraft[];
  readonly requiresNodeDataValues: true;
  readonly runtimeDefaultsAllowed: false;
  readonly publishesRuntimeOutput: false;
  readonly validationIssues: readonly Phase9ValidationIssue[];
}

export interface LightingPanelState {
  readonly panelId: "lighting-panel";
  readonly lightingNodes: readonly Phase9DataDrivenNodeDraft[];
  readonly includesFogSkyDayNight: true;
  readonly requiresNodeDataValues: true;
  readonly runtimePresetsAllowed: false;
  readonly publishesRuntimeOutput: false;
  readonly validationIssues: readonly Phase9ValidationIssue[];
}

export interface MinimapPanelState {
  readonly panelId: "minimap-panel";
  readonly editorView: MinimapViewDraft | null;
  readonly gameView: MinimapViewDraft | null;
  readonly layers: readonly MinimapLayerDraft[];
  readonly markers: readonly MinimapMarkerDraft[];
  readonly editorAndGameViewsMayDiffer: true;
  readonly markerDisplayUsesNodeData: true;
  readonly publishesRuntimeOutput: false;
  readonly validationIssues: readonly Phase9ValidationIssue[];
}

export interface UiDisplayInspectorState {
  readonly panelId: "ui-display-inspector";
  readonly selectedDisplay: UiAssetDisplayContract | null;
  readonly showsAssetReference: true;
  readonly showsNaturalSizeWhenKnown: true;
  readonly showsDisplaySize: true;
  readonly showsScaleMode: true;
  readonly showsAnchor: true;
  readonly showsPivot: true;
  readonly validationIssues: readonly Phase9ValidationIssue[];
  readonly schemaHints: typeof UI_DISPLAY_SCHEMA_HINTS;
  readonly usesNaturalSizeAsDisplaySize: false;
  readonly publishesRuntimeOutput: false;
}

export const WORLD_CAMERA_MINIMAP_PANEL_DEFINITIONS: readonly EditorPanelDescriptor[] = [
  panel("world-panel", "World Panel", "world-settings-node-configuration"),
  panel("zone-panel", "Zone Panel", "zone-node-configuration"),
  panel("camera-panel", "Camera Panel", "camera-node-configuration"),
  panel("lighting-panel", "Lighting Panel", "lighting-fog-sky-node-configuration"),
  panel("minimap-panel", "Minimap Panel", "minimap-node-configuration"),
  {
    id: "ui-display-inspector",
    title: "UI Display Inspector",
    region: "right",
    capability: "ui-asset-display-validation",
    requiresEditorSession: true,
    requiresEditorAdmin: false,
    acceptsConcreteGameContent: false
  }
] as const;

export function createWorldPanelState(worldSettings: WorldSettingsDraft | null = null): WorldPanelState {
  return {
    panelId: "world-panel",
    worldSettings,
    generatedZoneCandidates: [],
    generatedPlacementCandidates: [],
    generatedPathNetworkCandidates: [],
    generatedResourceDistributionCandidates: [],
    publishesRuntimeOutput: false,
    acceptsConcreteGameContent: false,
    inventedContent: []
  };
}

export function createZonePanelState(
  zones: readonly WorldZoneDraft[] = [],
  selectedZoneId: string | null = null
): ZonePanelState {
  return {
    panelId: "zone-panel",
    zones,
    selectedZoneId,
    generatedCandidateInputOnly: true,
    publishesRuntimeOutput: false,
    acceptsConcreteGameContent: false
  };
}

export function createCameraPanelState(
  cameraNodes: readonly Phase9DataDrivenNodeDraft[] = [],
  validationIssues: readonly Phase9ValidationIssue[] = []
): CameraPanelState {
  return {
    panelId: "camera-panel",
    cameraNodes,
    requiresNodeDataValues: true,
    runtimeDefaultsAllowed: false,
    publishesRuntimeOutput: false,
    validationIssues
  };
}

export function createLightingPanelState(
  lightingNodes: readonly Phase9DataDrivenNodeDraft[] = [],
  validationIssues: readonly Phase9ValidationIssue[] = []
): LightingPanelState {
  return {
    panelId: "lighting-panel",
    lightingNodes,
    includesFogSkyDayNight: true,
    requiresNodeDataValues: true,
    runtimePresetsAllowed: false,
    publishesRuntimeOutput: false,
    validationIssues
  };
}

export function createMinimapPanelState(options: {
  readonly editorView?: MinimapViewDraft | null;
  readonly gameView?: MinimapViewDraft | null;
  readonly layers?: readonly MinimapLayerDraft[];
  readonly markers?: readonly MinimapMarkerDraft[];
  readonly validationIssues?: readonly Phase9ValidationIssue[];
} = {}): MinimapPanelState {
  return {
    panelId: "minimap-panel",
    editorView: options.editorView ?? null,
    gameView: options.gameView ?? null,
    layers: options.layers ?? [],
    markers: options.markers ?? [],
    editorAndGameViewsMayDiffer: true,
    markerDisplayUsesNodeData: true,
    publishesRuntimeOutput: false,
    validationIssues: options.validationIssues ?? []
  };
}

export function createUiDisplayInspectorState(
  selectedDisplay: UiAssetDisplayContract | null = null,
  validationIssues: readonly Phase9ValidationIssue[] = []
): UiDisplayInspectorState {
  return {
    panelId: "ui-display-inspector",
    selectedDisplay,
    showsAssetReference: true,
    showsNaturalSizeWhenKnown: true,
    showsDisplaySize: true,
    showsScaleMode: true,
    showsAnchor: true,
    showsPivot: true,
    validationIssues,
    schemaHints: UI_DISPLAY_SCHEMA_HINTS,
    usesNaturalSizeAsDisplaySize: false,
    publishesRuntimeOutput: false
  };
}

function panel(id: WorldCameraMinimapPanelId, title: string, capability: string): EditorPanelDescriptor {
  return {
    id,
    title,
    region: "dock",
    capability,
    requiresEditorSession: true,
    requiresEditorAdmin: false,
    acceptsConcreteGameContent: false
  };
}
