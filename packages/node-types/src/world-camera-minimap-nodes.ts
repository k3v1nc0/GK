import type {
  NodeFieldDefinition,
  NodeSocketDefinition,
  Validator
} from "@gk/schemas";
import {
  UI_DISPLAY_ANCHORS,
  UI_DISPLAY_PIVOTS,
  UI_DISPLAY_SCALE_MODES
} from "@gk/schemas";

interface Phase9GraphNodeTypeDefinition {
  readonly type: string;
  readonly title: string;
  readonly version: number;
  readonly scope: "engine-capability";
  readonly sockets: readonly NodeSocketDefinition[];
  readonly fields: readonly NodeFieldDefinition[];
  readonly validate: Validator<Record<string, unknown>>;
  readonly createsConcreteGameContent: false;
  readonly publishesRuntimeOutput: false;
}

const validator: Validator<Record<string, unknown>> = {
  validate: (config) => config.publishesRuntimeOutput === true
    ? [{ path: "publishesRuntimeOutput", message: "Fase 9 nodes cannot publish runtime output.", severity: "error" }]
    : []
};

const flowIn: NodeSocketDefinition = { id: "flowIn", label: "Flow In", direction: "input", kind: "flow", maxConnections: 1 };
const flowOut: NodeSocketDefinition = { id: "flowOut", label: "Flow Out", direction: "output", kind: "flow" };
const worldIn: NodeSocketDefinition = { id: "world", label: "World Settings", direction: "input", kind: "value", valueType: "world.settings.reference", maxConnections: 1 };
const worldOut: NodeSocketDefinition = { id: "world", label: "World Settings", direction: "output", kind: "value", valueType: "world.settings.reference" };
const levelIn: NodeSocketDefinition = { id: "level", label: "Level", direction: "input", kind: "value", valueType: "world.level.reference", maxConnections: 1 };
const levelOut: NodeSocketDefinition = { id: "level", label: "Level", direction: "output", kind: "value", valueType: "world.level.reference" };
const zoneIn: NodeSocketDefinition = { id: "zone", label: "Zone", direction: "input", kind: "value", valueType: "world.zone.reference", maxConnections: 1 };
const zoneOut: NodeSocketDefinition = { id: "zone", label: "Zone", direction: "output", kind: "value", valueType: "world.zone.reference" };
const spawnpointOut: NodeSocketDefinition = { id: "spawnpoint", label: "Spawnpoint", direction: "output", kind: "value", valueType: "world.spawnpoint.reference" };
const generatedZoneOut: NodeSocketDefinition = { id: "generatedZone", label: "Generated Zone Candidate", direction: "output", kind: "value", valueType: "generated.zone.candidate.reference" };
const placementIn: NodeSocketDefinition = { id: "placement", label: "Generated Placement", direction: "input", kind: "value", valueType: "generated.placement.candidate.reference", maxConnections: 1 };
const placementOut: NodeSocketDefinition = { id: "placement", label: "Generated Placement", direction: "output", kind: "value", valueType: "generated.placement.candidate.reference" };
const pathNetworkIn: NodeSocketDefinition = { id: "pathNetwork", label: "Generated Path Network", direction: "input", kind: "value", valueType: "generated.path-network.candidate.reference", maxConnections: 1 };
const resourceDistributionIn: NodeSocketDefinition = { id: "resourceDistribution", label: "Generated Resource Distribution", direction: "input", kind: "value", valueType: "generated.resource-distribution.candidate.reference", maxConnections: 1 };
const spawnAreaIn: NodeSocketDefinition = { id: "spawnArea", label: "Generated Spawn Area", direction: "input", kind: "value", valueType: "generated.spawn-area.candidate.reference", maxConnections: 1 };
const cameraOut: NodeSocketDefinition = { id: "camera", label: "Camera", direction: "output", kind: "value", valueType: "camera.reference" };
const cameraIn: NodeSocketDefinition = { id: "camera", label: "Camera", direction: "input", kind: "value", valueType: "camera.reference", maxConnections: 1 };
const lightingOut: NodeSocketDefinition = { id: "lighting", label: "Lighting", direction: "output", kind: "value", valueType: "lighting.reference" };
const minimapViewOut: NodeSocketDefinition = { id: "minimapView", label: "Minimap View", direction: "output", kind: "value", valueType: "minimap.view.reference" };
const minimapLayerIn: NodeSocketDefinition = { id: "layer", label: "Minimap Layer", direction: "input", kind: "value", valueType: "minimap.layer.reference" };
const minimapLayerOut: NodeSocketDefinition = { id: "layer", label: "Minimap Layer", direction: "output", kind: "value", valueType: "minimap.layer.reference" };
const minimapMarkerOut: NodeSocketDefinition = { id: "marker", label: "Minimap Marker", direction: "output", kind: "value", valueType: "minimap.marker.reference" };
const assetIn: NodeSocketDefinition = { id: "asset", label: "Asset", direction: "input", kind: "value", valueType: "asset.reference", maxConnections: 1 };
const uiDisplayOut: NodeSocketDefinition = { id: "display", label: "UI Display", direction: "output", kind: "value", valueType: "ui.asset-display.reference" };
const uiDisplayIn: NodeSocketDefinition = { id: "display", label: "UI Display", direction: "input", kind: "value", valueType: "ui.asset-display.reference", maxConnections: 1 };

export const WORLD_CAMERA_MINIMAP_GRAPH_NODE_TYPES: readonly Phase9GraphNodeTypeDefinition[] = [
  node("gk.world.settings", "World Settings", [flowIn, flowOut, worldOut], [
    textField("worldId", "World Id", true),
    textField("levelIds", "Level Ids", false)
  ]),
  node("gk.world.level", "World Level", [worldIn, levelOut], [
    textField("levelId", "Level Id", true),
    textField("zoneIds", "Zone Ids", false)
  ]),
  node("gk.world.zone", "World Zone", [levelIn, zoneOut], [
    textField("zoneId", "Zone Id", true),
    dropdownField("source", "Source", ["editor-data", "procedural-draft"], true)
  ]),
  node("gk.world.spawnpoint", "World Spawnpoint", [zoneIn, placementIn, spawnpointOut], [
    textField("spawnpointId", "Spawnpoint Id", true)
  ]),
  node("gk.world.generatedZoneReference", "Generated Zone Reference", [generatedZoneOut], [
    textField("generationOutputId", "Generation Output Id", true),
    textField("candidateId", "Candidate Id", true)
  ]),
  node("gk.world.generatedPlacementReference", "Generated Placement Reference", [placementOut], [
    textField("generationOutputId", "Generation Output Id", true),
    textField("candidateId", "Candidate Id", true)
  ]),
  node("gk.camera.mode", "Camera Mode", [worldIn, cameraOut], [
    textField("modeKey", "Mode Key", true)
  ]),
  node("gk.camera.followTarget", "Camera Follow Target", [cameraIn, zoneIn, cameraOut], [
    textField("targetRuleKey", "Target Rule Key", true)
  ]),
  node("gk.camera.orbit", "Camera Orbit", [cameraIn, cameraOut], [
    textField("orbitProfileKey", "Orbit Profile Key", true)
  ]),
  node("gk.camera.zoom", "Camera Zoom", [cameraIn, cameraOut], [
    textField("zoomProfileKey", "Zoom Profile Key", true)
  ]),
  node("gk.camera.bounds", "Camera Bounds", [cameraIn, zoneIn, cameraOut], [
    textField("boundsRuleKey", "Bounds Rule Key", true)
  ]),
  node("gk.camera.collision", "Camera Collision", [cameraIn, cameraOut], [
    textField("collisionProfileKey", "Collision Profile Key", true)
  ]),
  node("gk.camera.transition", "Camera Transition", [cameraIn, cameraOut], [
    textField("transitionProfileKey", "Transition Profile Key", true)
  ]),
  node("gk.lighting.directional", "Directional Lighting", [zoneIn, lightingOut], [
    textField("lightingProfileKey", "Lighting Profile Key", true)
  ]),
  node("gk.lighting.ambient", "Ambient Lighting", [zoneIn, lightingOut], [
    textField("ambientProfileKey", "Ambient Profile Key", true)
  ]),
  node("gk.lighting.fog", "Fog", [zoneIn, lightingOut], [
    textField("fogProfileKey", "Fog Profile Key", true)
  ]),
  node("gk.lighting.sky", "Sky", [zoneIn, lightingOut], [
    textField("skyProfileKey", "Sky Profile Key", true)
  ]),
  node("gk.lighting.dayNightCycle", "Day / Night Cycle", [worldIn, lightingOut], [
    textField("cycleProfileKey", "Cycle Profile Key", true)
  ]),
  node("gk.minimap.view", "Minimap View", [worldIn, minimapLayerIn, minimapViewOut], [
    dropdownField("audience", "Audience", ["editor", "game"], true),
    textField("viewId", "View Id", true)
  ]),
  node("gk.minimap.layer", "Minimap Layer", [zoneIn, minimapMarkerOut, minimapLayerOut], [
    textField("layerId", "Layer Id", true),
    dropdownField("layerKind", "Layer Kind", ["zoneBounds", "pathNetwork", "resourceDistribution", "spawnArea", "marker", "custom"], true)
  ]),
  node("gk.minimap.marker", "Minimap Marker", [assetIn, placementIn, uiDisplayIn, minimapMarkerOut], [
    textField("markerId", "Marker Id", true)
  ]),
  node("gk.minimap.icon", "Minimap Icon", [assetIn, uiDisplayIn, minimapMarkerOut], [
    textField("iconId", "Icon Id", true)
  ]),
  node("gk.minimap.zoneBounds", "Minimap Zone Bounds", [zoneIn, minimapLayerOut], [
    textField("boundsLayerId", "Bounds Layer Id", true)
  ]),
  node("gk.minimap.generatedPathLayer", "Generated Path Layer", [pathNetworkIn, minimapLayerOut], [
    textField("layerId", "Layer Id", true)
  ]),
  node("gk.minimap.generatedResourceLayer", "Generated Resource Layer", [resourceDistributionIn, minimapLayerOut], [
    textField("layerId", "Layer Id", true)
  ]),
  node("gk.minimap.generatedSpawnLayer", "Generated Spawn Layer", [spawnAreaIn, minimapLayerOut], [
    textField("layerId", "Layer Id", true)
  ]),
  node("gk.ui.assetDisplay", "UI Asset Display", [assetIn, uiDisplayOut], uiDisplayFields(false)),
  node("gk.ui.iconDisplay", "UI Icon Display", [assetIn, uiDisplayOut], uiDisplayFields(true)),
  node("gk.ui.hudFrame", "HUD Frame Display", [assetIn, uiDisplayOut], uiDisplayFields(false)),
  node("gk.ui.hudBar", "HUD Bar Display", [assetIn, uiDisplayOut], uiDisplayFields(false)),
  node("gk.ui.nineSlice", "UI Nine Slice Display", [assetIn, uiDisplayOut], [
    ...uiDisplayFields(false),
    numberField("sliceTop", "Slice Top", true),
    numberField("sliceRight", "Slice Right", true),
    numberField("sliceBottom", "Slice Bottom", true),
    numberField("sliceLeft", "Slice Left", true)
  ])
] as const;

function node(
  type: string,
  title: string,
  sockets: readonly NodeSocketDefinition[],
  fields: readonly NodeFieldDefinition[]
): Phase9GraphNodeTypeDefinition {
  return {
    type,
    title,
    version: 1,
    scope: "engine-capability",
    sockets,
    fields,
    validate: validator,
    createsConcreteGameContent: false,
    publishesRuntimeOutput: false
  };
}

function uiDisplayFields(iconDefaults: boolean): readonly NodeFieldDefinition[] {
  return [
    textField("displayId", "Display Id", true),
    numberField("displayWidth", iconDefaults ? "Display Width Hint 32" : "Display Width", !iconDefaults),
    numberField("displayHeight", iconDefaults ? "Display Height Hint 32" : "Display Height", !iconDefaults),
    dropdownField("scaleMode", "Scale Mode", UI_DISPLAY_SCALE_MODES, true),
    dropdownField("anchor", "Anchor", UI_DISPLAY_ANCHORS, true),
    dropdownField("pivot", "Pivot", UI_DISPLAY_PIVOTS, true),
    numberField("opacity", "Opacity", false),
    numberField("zIndex", "Z Index", false)
  ];
}

function textField(id: string, label: string, required: boolean): NodeFieldDefinition {
  return { id, label, kind: "text", required };
}

function numberField(id: string, label: string, required: boolean): NodeFieldDefinition {
  return { id, label, kind: "number", required };
}

function dropdownField(id: string, label: string, values: readonly string[], required = false): NodeFieldDefinition {
  return {
    id,
    label,
    kind: "dropdown",
    required,
    options: values.map((value) => ({ value, label: value }))
  };
}
