import type {
  GeneratedPathNetworkCandidate,
  GeneratedPlacementCandidate,
  GeneratedResourceDistributionCandidate,
  GeneratedSpawnAreaCandidate
} from "./procedural-generation.js";

export const PHASE9_WORLD_CAMERA_MINIMAP_NODE_TYPES = [
  "world.settings",
  "world.level",
  "world.zone",
  "world.spawnpoint",
  "world.generatedZoneReference",
  "world.generatedPlacementReference",
  "camera.mode",
  "camera.followTarget",
  "camera.orbit",
  "camera.zoom",
  "camera.bounds",
  "camera.collision",
  "camera.transition",
  "lighting.directional",
  "lighting.ambient",
  "lighting.fog",
  "lighting.sky",
  "lighting.dayNightCycle",
  "minimap.view",
  "minimap.layer",
  "minimap.marker",
  "minimap.icon",
  "minimap.zoneBounds",
  "minimap.generatedPathLayer",
  "minimap.generatedResourceLayer",
  "minimap.generatedSpawnLayer",
  "ui.assetDisplay",
  "ui.iconDisplay",
  "ui.hudFrame",
  "ui.hudBar",
  "ui.nineSlice"
] as const;

export const UI_DISPLAY_SCALE_MODES = [
  "contain",
  "cover",
  "stretch",
  "nineSlice",
  "none"
] as const;

export const UI_DISPLAY_ANCHORS = [
  "topLeft",
  "topRight",
  "bottomLeft",
  "bottomRight",
  "center",
  "topCenter",
  "bottomCenter",
  "leftCenter",
  "rightCenter"
] as const;

export const UI_DISPLAY_PIVOTS = [
  "center",
  "topLeft",
  "topRight",
  "bottomLeft",
  "bottomRight",
  "bottomCenter"
] as const;

export const UI_DISPLAY_SCHEMA_HINTS = {
  schemaHintOnly: true,
  iconDisplay: { displayWidth: 32, displayHeight: 32 },
  minimapMarkerDisplay: { displayWidth: 24, displayHeight: 24 },
  smallStatusIconDisplay: { displayWidth: 24, displayHeight: 24 },
  hudBarFrame: { requiresNodeDataDisplaySize: true },
  nineSlice: { requiresSliceMargins: true }
} as const;

export type Phase9WorldCameraMinimapNodeType = (typeof PHASE9_WORLD_CAMERA_MINIMAP_NODE_TYPES)[number];
export type UiDisplayScaleMode = (typeof UI_DISPLAY_SCALE_MODES)[number];
export type UiDisplayAnchor = (typeof UI_DISPLAY_ANCHORS)[number];
export type UiDisplayPivot = (typeof UI_DISPLAY_PIVOTS)[number];
export type Phase9DraftSource = "editor-data" | "procedural-draft";
export type Phase9CandidateStatus = "candidate" | "accepted" | "invalid";
export type MinimapViewAudience = "editor" | "game";
export type ZoneBoundsKind = "aabb" | "polygon" | "generated-candidate";
export type MinimapLayerKind = "zoneBounds" | "pathNetwork" | "resourceDistribution" | "spawnArea" | "marker" | "custom";

export interface Phase9AssetReference {
  readonly source: "asset-library";
  readonly assetId: string;
}

export interface Phase9ValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly severity: "warning" | "error";
  readonly blocksRuntimePublish: boolean;
}

export interface GeneratedCandidateReference<TCandidateType extends string> {
  readonly source: "procedural-draft";
  readonly candidateType: TCandidateType;
  readonly generationOutputId: string;
  readonly candidateId: string;
  readonly status: "candidate";
  readonly publishesRuntimeOutput: false;
}

export type GeneratedZoneReference = GeneratedCandidateReference<"generated.zone.candidate">;
export type GeneratedPlacementReference = GeneratedCandidateReference<"generated.placement.candidate">;
export type GeneratedSpawnAreaReference = GeneratedCandidateReference<"generated.spawn-area.candidate">;
export type GeneratedPathNetworkReference = GeneratedCandidateReference<"generated.path-network.candidate">;
export type GeneratedResourceDistributionReference = GeneratedCandidateReference<"generated.resource-distribution.candidate">;

export interface ZoneBoundsDraft {
  readonly boundsId: string;
  readonly source: Phase9DraftSource;
  readonly kind: ZoneBoundsKind;
  readonly data: Readonly<Record<string, unknown>>;
  readonly generatedSpawnAreaReference: GeneratedSpawnAreaReference | null;
  readonly publishesRuntimeOutput: false;
}

export interface ZoneTransitionDraft {
  readonly transitionId: string;
  readonly source: "editor-data";
  readonly fromZoneId: string;
  readonly toZoneId: string;
  readonly ruleData: Readonly<Record<string, unknown>>;
  readonly publishesRuntimeOutput: false;
}

export interface SpawnpointDraft {
  readonly spawnpointId: string;
  readonly source: Phase9DraftSource;
  readonly zoneId: string;
  readonly transformData: Readonly<Record<string, unknown>> | null;
  readonly generatedPlacementReference: GeneratedPlacementReference | null;
  readonly publishesRuntimeOutput: false;
}

export interface WorldZoneDraft {
  readonly zoneId: string;
  readonly source: Phase9DraftSource;
  readonly levelId: string;
  readonly bounds: ZoneBoundsDraft | null;
  readonly spawnpointIds: readonly string[];
  readonly transitionIds: readonly string[];
  readonly generatedZoneReference: GeneratedZoneReference | null;
  readonly generatedPlacementReferences: readonly GeneratedPlacementReference[];
  readonly generatedPathNetworkReferences: readonly GeneratedPathNetworkReference[];
  readonly generatedResourceDistributionReferences: readonly GeneratedResourceDistributionReference[];
  readonly publishesRuntimeOutput: false;
}

export interface WorldLevelDraft {
  readonly levelId: string;
  readonly source: Phase9DraftSource;
  readonly zoneIds: readonly string[];
  readonly generatedZoneReferences: readonly GeneratedZoneReference[];
  readonly publishesRuntimeOutput: false;
}

export interface WorldSettingsDraft {
  readonly worldId: string;
  readonly source: "editor-data";
  readonly levelIds: readonly string[];
  readonly activeLevelId: string | null;
  readonly cameraModeNodeId: string | null;
  readonly lightingNodeIds: readonly string[];
  readonly minimapViewIds: readonly string[];
  readonly publishesRuntimeOutput: false;
}

export interface Phase9DataDrivenNodeDraft {
  readonly nodeId: string;
  readonly nodeType: Phase9WorldCameraMinimapNodeType;
  readonly source: "node-data";
  readonly config: Readonly<Record<string, unknown>> | null;
  readonly publishesRuntimeOutput: false;
}

export interface CameraModeDraft extends Phase9DataDrivenNodeDraft {
  readonly nodeType: "camera.mode";
}

export interface CameraFollowTargetDraft extends Phase9DataDrivenNodeDraft {
  readonly nodeType: "camera.followTarget";
}

export interface CameraOrbitDraft extends Phase9DataDrivenNodeDraft {
  readonly nodeType: "camera.orbit";
}

export interface CameraZoomDraft extends Phase9DataDrivenNodeDraft {
  readonly nodeType: "camera.zoom";
}

export interface CameraBoundsDraft extends Phase9DataDrivenNodeDraft {
  readonly nodeType: "camera.bounds";
}

export interface CameraCollisionDraft extends Phase9DataDrivenNodeDraft {
  readonly nodeType: "camera.collision";
}

export interface CameraTransitionDraft extends Phase9DataDrivenNodeDraft {
  readonly nodeType: "camera.transition";
}

export interface LightingDirectionalDraft extends Phase9DataDrivenNodeDraft {
  readonly nodeType: "lighting.directional";
}

export interface LightingAmbientDraft extends Phase9DataDrivenNodeDraft {
  readonly nodeType: "lighting.ambient";
}

export interface LightingFogDraft extends Phase9DataDrivenNodeDraft {
  readonly nodeType: "lighting.fog";
}

export interface LightingSkyDraft extends Phase9DataDrivenNodeDraft {
  readonly nodeType: "lighting.sky";
}

export interface LightingDayNightCycleDraft extends Phase9DataDrivenNodeDraft {
  readonly nodeType: "lighting.dayNightCycle";
}

export interface UiNineSliceMargins {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface UiDisplayResponsiveRule {
  readonly ruleId: string;
  readonly source: "node-data";
  readonly breakpointKey: string;
  readonly displayWidth: number | null;
  readonly displayHeight: number | null;
  readonly minWidth: number | null;
  readonly minHeight: number | null;
  readonly maxWidth: number | null;
  readonly maxHeight: number | null;
}

export interface UiAssetDisplayContract {
  readonly displayId: string;
  readonly source: "node-data";
  readonly assetReference: Phase9AssetReference;
  readonly naturalWidth: number | null;
  readonly naturalHeight: number | null;
  readonly displayWidth: number | null;
  readonly displayHeight: number | null;
  readonly minWidth: number | null;
  readonly minHeight: number | null;
  readonly maxWidth: number | null;
  readonly maxHeight: number | null;
  readonly scaleMode: UiDisplayScaleMode;
  readonly anchor: UiDisplayAnchor;
  readonly pivot: UiDisplayPivot;
  readonly opacity: number;
  readonly zIndex: number;
  readonly responsiveRules: readonly UiDisplayResponsiveRule[];
  readonly nineSliceMargins: UiNineSliceMargins | null;
  readonly defaultsAreSchemaHintsOnly: true;
  readonly publishesRuntimeOutput: false;
}

export interface MinimapIconDraft {
  readonly iconId: string;
  readonly source: "node-data";
  readonly display: UiAssetDisplayContract;
  readonly publishesRuntimeOutput: false;
}

export interface MinimapMarkerDraft {
  readonly markerId: string;
  readonly source: "node-data" | "procedural-draft";
  readonly uiAssetReference: Phase9AssetReference | null;
  readonly proceduralMarkerSource: GeneratedPlacementReference | GeneratedSpawnAreaReference | null;
  readonly display: UiAssetDisplayContract | null;
  readonly publishesRuntimeOutput: false;
}

export interface MinimapLayerDraft {
  readonly layerId: string;
  readonly source: "node-data";
  readonly layerKind: MinimapLayerKind;
  readonly markerIds: readonly string[];
  readonly generatedPathNetworkReferences: readonly GeneratedPathNetworkReference[];
  readonly generatedResourceDistributionReferences: readonly GeneratedResourceDistributionReference[];
  readonly generatedSpawnAreaReferences: readonly GeneratedSpawnAreaReference[];
  readonly publishesRuntimeOutput: false;
}

export interface MinimapViewDraft {
  readonly viewId: string;
  readonly source: "node-data";
  readonly audience: MinimapViewAudience;
  readonly layerIds: readonly string[];
  readonly displayRules: Readonly<Record<string, unknown>>;
  readonly publishesRuntimeOutput: false;
}

export interface MinimapZoneBoundsDraft extends Phase9DataDrivenNodeDraft {
  readonly nodeType: "minimap.zoneBounds";
  readonly zoneBounds: ZoneBoundsDraft | null;
}

export interface GeneratedWorldCandidateInput {
  readonly placements: readonly GeneratedPlacementCandidate[];
  readonly spawnAreas: readonly GeneratedSpawnAreaCandidate[];
  readonly pathNetworks: readonly GeneratedPathNetworkCandidate[];
  readonly resourceDistributions: readonly GeneratedResourceDistributionCandidate[];
  readonly publishesRuntimeOutput: false;
}

export function createGeneratedCandidateReference<TCandidateType extends string>(options: {
  readonly candidateType: TCandidateType;
  readonly generationOutputId: string;
  readonly candidateId: string;
}): GeneratedCandidateReference<TCandidateType> {
  return {
    source: "procedural-draft",
    candidateType: options.candidateType,
    generationOutputId: options.generationOutputId,
    candidateId: options.candidateId,
    status: "candidate",
    publishesRuntimeOutput: false
  };
}

export function createWorldSettingsDraft(options: {
  readonly worldId: string;
  readonly levelIds?: readonly string[];
  readonly activeLevelId?: string | null;
  readonly cameraModeNodeId?: string | null;
  readonly lightingNodeIds?: readonly string[];
  readonly minimapViewIds?: readonly string[];
}): WorldSettingsDraft {
  return {
    worldId: options.worldId,
    source: "editor-data",
    levelIds: options.levelIds ?? [],
    activeLevelId: options.activeLevelId ?? null,
    cameraModeNodeId: options.cameraModeNodeId ?? null,
    lightingNodeIds: options.lightingNodeIds ?? [],
    minimapViewIds: options.minimapViewIds ?? [],
    publishesRuntimeOutput: false
  };
}

export function createWorldLevelDraft(options: {
  readonly levelId: string;
  readonly zoneIds?: readonly string[];
  readonly generatedZoneReferences?: readonly GeneratedZoneReference[];
}): WorldLevelDraft {
  return {
    levelId: options.levelId,
    source: "editor-data",
    zoneIds: options.zoneIds ?? [],
    generatedZoneReferences: options.generatedZoneReferences ?? [],
    publishesRuntimeOutput: false
  };
}

export function createWorldZoneDraft(options: {
  readonly zoneId: string;
  readonly levelId: string;
  readonly source?: Phase9DraftSource;
  readonly bounds?: ZoneBoundsDraft | null;
  readonly spawnpointIds?: readonly string[];
  readonly transitionIds?: readonly string[];
  readonly generatedZoneReference?: GeneratedZoneReference | null;
  readonly generatedPlacementReferences?: readonly GeneratedPlacementReference[];
  readonly generatedPathNetworkReferences?: readonly GeneratedPathNetworkReference[];
  readonly generatedResourceDistributionReferences?: readonly GeneratedResourceDistributionReference[];
}): WorldZoneDraft {
  return {
    zoneId: options.zoneId,
    source: options.source ?? "editor-data",
    levelId: options.levelId,
    bounds: options.bounds ?? null,
    spawnpointIds: options.spawnpointIds ?? [],
    transitionIds: options.transitionIds ?? [],
    generatedZoneReference: options.generatedZoneReference ?? null,
    generatedPlacementReferences: options.generatedPlacementReferences ?? [],
    generatedPathNetworkReferences: options.generatedPathNetworkReferences ?? [],
    generatedResourceDistributionReferences: options.generatedResourceDistributionReferences ?? [],
    publishesRuntimeOutput: false
  };
}

export function createPhase9DataDrivenNodeDraft(options: {
  readonly nodeId: string;
  readonly nodeType: Phase9WorldCameraMinimapNodeType;
  readonly config?: Readonly<Record<string, unknown>> | null;
}): Phase9DataDrivenNodeDraft {
  return {
    nodeId: options.nodeId,
    nodeType: options.nodeType,
    source: "node-data",
    config: options.config ?? null,
    publishesRuntimeOutput: false
  };
}

export function createUiAssetDisplayContract(options: {
  readonly displayId: string;
  readonly assetReference: Phase9AssetReference;
  readonly naturalWidth?: number | null;
  readonly naturalHeight?: number | null;
  readonly displayWidth?: number | null;
  readonly displayHeight?: number | null;
  readonly minWidth?: number | null;
  readonly minHeight?: number | null;
  readonly maxWidth?: number | null;
  readonly maxHeight?: number | null;
  readonly scaleMode?: UiDisplayScaleMode;
  readonly anchor?: UiDisplayAnchor;
  readonly pivot?: UiDisplayPivot;
  readonly opacity?: number;
  readonly zIndex?: number;
  readonly responsiveRules?: readonly UiDisplayResponsiveRule[];
  readonly nineSliceMargins?: UiNineSliceMargins | null;
}): UiAssetDisplayContract {
  return {
    displayId: options.displayId,
    source: "node-data",
    assetReference: options.assetReference,
    naturalWidth: options.naturalWidth ?? null,
    naturalHeight: options.naturalHeight ?? null,
    displayWidth: options.displayWidth ?? null,
    displayHeight: options.displayHeight ?? null,
    minWidth: options.minWidth ?? null,
    minHeight: options.minHeight ?? null,
    maxWidth: options.maxWidth ?? null,
    maxHeight: options.maxHeight ?? null,
    scaleMode: options.scaleMode ?? "contain",
    anchor: options.anchor ?? "center",
    pivot: options.pivot ?? "center",
    opacity: options.opacity ?? 1,
    zIndex: options.zIndex ?? 0,
    responsiveRules: options.responsiveRules ?? [],
    nineSliceMargins: options.nineSliceMargins ?? null,
    defaultsAreSchemaHintsOnly: true,
    publishesRuntimeOutput: false
  };
}

export function createUiIconDisplayContract(
  assetReference: Phase9AssetReference,
  options: Omit<Parameters<typeof createUiAssetDisplayContract>[0], "assetReference" | "displayId"> & {
    readonly displayId?: string;
  } = {}
): UiAssetDisplayContract {
  return createUiAssetDisplayContract({
    ...options,
    displayId: options.displayId ?? `${assetReference.assetId}-icon-display`,
    assetReference,
    displayWidth: options.displayWidth ?? UI_DISPLAY_SCHEMA_HINTS.iconDisplay.displayWidth,
    displayHeight: options.displayHeight ?? UI_DISPLAY_SCHEMA_HINTS.iconDisplay.displayHeight
  });
}

export function createMinimapMarkerDraft(options: {
  readonly markerId: string;
  readonly uiAssetReference?: Phase9AssetReference | null;
  readonly proceduralMarkerSource?: GeneratedPlacementReference | GeneratedSpawnAreaReference | null;
  readonly display?: UiAssetDisplayContract | null;
  readonly source?: "node-data" | "procedural-draft";
}): MinimapMarkerDraft {
  return {
    markerId: options.markerId,
    source: options.source ?? "node-data",
    uiAssetReference: options.uiAssetReference ?? null,
    proceduralMarkerSource: options.proceduralMarkerSource ?? null,
    display: options.display ?? null,
    publishesRuntimeOutput: false
  };
}

export function createMinimapViewDraft(options: {
  readonly viewId: string;
  readonly audience: MinimapViewAudience;
  readonly layerIds?: readonly string[];
  readonly displayRules?: Readonly<Record<string, unknown>>;
}): MinimapViewDraft {
  return {
    viewId: options.viewId,
    source: "node-data",
    audience: options.audience,
    layerIds: options.layerIds ?? [],
    displayRules: options.displayRules ?? {},
    publishesRuntimeOutput: false
  };
}
