import {
  UI_DISPLAY_ANCHORS,
  UI_DISPLAY_PIVOTS,
  UI_DISPLAY_SCALE_MODES,
  type GeneratedCandidateReference,
  type MinimapMarkerDraft,
  type Phase9DataDrivenNodeDraft,
  type Phase9ValidationIssue,
  type UiAssetDisplayContract,
  type UiDisplayResponsiveRule,
  type WorldSettingsDraft,
  type WorldZoneDraft,
  type ZoneBoundsDraft
} from "./world-camera-minimap.js";

export interface Phase9WorldValidationInput {
  readonly worldSettings?: WorldSettingsDraft | null;
  readonly zones?: readonly WorldZoneDraft[];
  readonly cameraNodes?: readonly Phase9DataDrivenNodeDraft[];
  readonly lightingNodes?: readonly Phase9DataDrivenNodeDraft[];
  readonly minimapMarkers?: readonly MinimapMarkerDraft[];
  readonly uiDisplays?: readonly UiAssetDisplayContract[];
  readonly generatedReferences?: readonly GeneratedCandidateReference<string>[];
}

export function validateWorldSettingsDraft(world: WorldSettingsDraft): readonly Phase9ValidationIssue[] {
  const issues: Phase9ValidationIssue[] = [
    ...requireDataDrivenId("worldId", world.worldId, "World settings require a data-driven world id.")
  ];

  if (world.source !== "editor-data") {
    issues.push(error("source", "World settings must come from editor-data."));
  }

  if (world.publishesRuntimeOutput !== false) {
    issues.push(runtimeError("publishesRuntimeOutput", "World settings drafts must not publish runtime output."));
  }

  return issues;
}

export function validateWorldZoneDraft(zone: WorldZoneDraft): readonly Phase9ValidationIssue[] {
  const issues: Phase9ValidationIssue[] = [
    ...requireDataDrivenId("zoneId", zone.zoneId, "Zone nodes require a data-driven zone id."),
    ...requireDataDrivenId("levelId", zone.levelId, "Zone nodes require a data-driven level id.")
  ];

  if (zone.publishesRuntimeOutput !== false) {
    issues.push(runtimeError("publishesRuntimeOutput", "Zone drafts must not publish runtime output."));
  }

  if (zone.bounds) {
    issues.push(...validateZoneBoundsDraft(zone.bounds));
  }

  for (const [index, reference] of zone.generatedPlacementReferences.entries()) {
    issues.push(...validateGeneratedCandidateReference(reference, `generatedPlacementReferences.${index}`));
  }

  for (const [index, reference] of zone.generatedPathNetworkReferences.entries()) {
    issues.push(...validateGeneratedCandidateReference(reference, `generatedPathNetworkReferences.${index}`));
  }

  for (const [index, reference] of zone.generatedResourceDistributionReferences.entries()) {
    issues.push(...validateGeneratedCandidateReference(reference, `generatedResourceDistributionReferences.${index}`));
  }

  return issues;
}

export function validateZoneBoundsDraft(bounds: ZoneBoundsDraft): readonly Phase9ValidationIssue[] {
  const issues: Phase9ValidationIssue[] = [
    ...requireDataDrivenId("boundsId", bounds.boundsId, "Zone bounds require a data-driven bounds id.")
  ];

  if (bounds.publishesRuntimeOutput !== false) {
    issues.push(runtimeError("publishesRuntimeOutput", "Zone bounds drafts must not publish runtime output."));
  }

  if (bounds.kind === "generated-candidate" && !bounds.generatedSpawnAreaReference) {
    issues.push(error("generatedSpawnAreaReference", "Generated zone bounds require a generated spawn-area candidate reference."));
  }

  return issues;
}

export function validatePhase9NodeData(node: Phase9DataDrivenNodeDraft): readonly Phase9ValidationIssue[] {
  const issues: Phase9ValidationIssue[] = [
    ...requireDataDrivenId("nodeId", node.nodeId, "Fase 9 nodes require data-driven ids.")
  ];

  if (node.source !== "node-data") {
    issues.push(error("source", "Fase 9 camera, lighting and minimap values must come from node-data."));
  }

  if (!node.config || Object.keys(node.config).length === 0) {
    issues.push(error("config", "Fase 9 nodes require explicit node-data config before runtime activation."));
  }

  if (node.publishesRuntimeOutput !== false) {
    issues.push(runtimeError("publishesRuntimeOutput", "Fase 9 node data must not publish runtime output."));
  }

  return issues;
}

export function validateLightingNodeData(node: Phase9DataDrivenNodeDraft): readonly Phase9ValidationIssue[] {
  const issues = [...validatePhase9NodeData(node)];

  if (!node.nodeType.startsWith("lighting.")) {
    issues.push(error("nodeType", "Lighting validators only accept lighting node types."));
  }

  return issues;
}

export function validateMinimapMarkerDraft(marker: MinimapMarkerDraft): readonly Phase9ValidationIssue[] {
  const issues: Phase9ValidationIssue[] = [
    ...requireDataDrivenId("markerId", marker.markerId, "Minimap markers require a data-driven marker id.")
  ];

  if (!marker.uiAssetReference && !marker.proceduralMarkerSource) {
    issues.push(error("source", "Minimap marker requires a UI asset.reference or procedural marker source."));
  }

  if (marker.display) {
    issues.push(...validateUiAssetDisplayContract(marker.display).map(prefixIssue("display")));
  } else if (marker.uiAssetReference) {
    issues.push(error("display", "Minimap marker UI assets require display node-data before runtime display."));
  }

  if (marker.publishesRuntimeOutput !== false) {
    issues.push(runtimeError("publishesRuntimeOutput", "Minimap marker drafts must not publish runtime output."));
  }

  return issues;
}

export function validateUiAssetDisplayContract(display: UiAssetDisplayContract): readonly Phase9ValidationIssue[] {
  const issues: Phase9ValidationIssue[] = [
    ...requireDataDrivenId("displayId", display.displayId, "UI display nodes require a data-driven display id.")
  ];

  if (display.source !== "node-data") {
    issues.push(error("source", "UI display settings must come from node-data."));
  }

  if (display.assetReference.source !== "asset-library" || display.assetReference.assetId.trim().length === 0) {
    issues.push(error("assetReference", "UI display requires an asset-library asset.reference."));
  }

  if (!hasExplicitDisplaySize(display)) {
    issues.push(error("displaySize", "UI display requires displayWidth/displayHeight or an explicit responsive rule."));
  }

  if (
    !hasExplicitDisplaySize(display)
    && ((display.naturalWidth ?? 0) > 0 || (display.naturalHeight ?? 0) > 0)
  ) {
    issues.push(warning("naturalSize", "Source natural size is metadata only and must not be used blindly as display size."));
  }

  for (const [path, value] of [
    ["displayWidth", display.displayWidth],
    ["displayHeight", display.displayHeight],
    ["minWidth", display.minWidth],
    ["minHeight", display.minHeight],
    ["maxWidth", display.maxWidth],
    ["maxHeight", display.maxHeight],
    ["naturalWidth", display.naturalWidth],
    ["naturalHeight", display.naturalHeight]
  ] as const) {
    if (value !== null && (!Number.isFinite(value) || value <= 0)) {
      issues.push(error(path, "UI display dimensions must be positive finite numbers when provided."));
    }
  }

  if (!UI_DISPLAY_SCALE_MODES.includes(display.scaleMode)) {
    issues.push(error("scaleMode", "UI display scaleMode must match the schema enum."));
  }

  if (!UI_DISPLAY_ANCHORS.includes(display.anchor)) {
    issues.push(error("anchor", "UI display anchor must match the schema enum."));
  }

  if (!UI_DISPLAY_PIVOTS.includes(display.pivot)) {
    issues.push(error("pivot", "UI display pivot must match the schema enum."));
  }

  if (display.opacity < 0 || display.opacity > 1) {
    issues.push(error("opacity", "UI display opacity must be between 0 and 1."));
  }

  if (!Number.isInteger(display.zIndex)) {
    issues.push(error("zIndex", "UI display zIndex must be an integer."));
  }

  if (display.scaleMode === "nineSlice" && !display.nineSliceMargins) {
    issues.push(error("nineSliceMargins", "nineSlice scale mode requires slice margins from node-data."));
  }

  if (display.nineSliceMargins) {
    for (const [path, value] of Object.entries(display.nineSliceMargins)) {
      if (!Number.isFinite(value) || value < 0) {
        issues.push(error(`nineSliceMargins.${path}`, "nineSlice margins must be finite non-negative numbers."));
      }
    }
  }

  if (display.publishesRuntimeOutput !== false) {
    issues.push(runtimeError("publishesRuntimeOutput", "UI display nodes must not publish runtime output."));
  }

  return issues;
}

export function validateGeneratedCandidateReference(
  reference: GeneratedCandidateReference<string>,
  path = "generatedReference"
): readonly Phase9ValidationIssue[] {
  const issues: Phase9ValidationIssue[] = [];

  if (reference.source !== "procedural-draft") {
    issues.push(error(`${path}.source`, "Generated world data must remain procedural draft/candidate input."));
  }

  if (reference.status !== "candidate") {
    issues.push(error(`${path}.status`, "Generated world references remain candidates until publish-flow accepts them."));
  }

  if (reference.publishesRuntimeOutput !== false) {
    issues.push(runtimeError(`${path}.publishesRuntimeOutput`, "Generated world references must not publish runtime output."));
  }

  if (reference.generationOutputId.trim().length === 0 || reference.candidateId.trim().length === 0) {
    issues.push(error(path, "Generated world references require generation output and candidate ids."));
  }

  return issues;
}

export function validatePhase9WorldInput(input: Phase9WorldValidationInput): readonly Phase9ValidationIssue[] {
  const issues: Phase9ValidationIssue[] = [];

  if (input.worldSettings) {
    issues.push(...validateWorldSettingsDraft(input.worldSettings).map(prefixIssue("worldSettings")));
  }

  for (const [index, zone] of (input.zones ?? []).entries()) {
    issues.push(...validateWorldZoneDraft(zone).map(prefixIssue(`zones.${index}`)));
  }

  for (const [index, node] of (input.cameraNodes ?? []).entries()) {
    issues.push(...validatePhase9NodeData(node).map(prefixIssue(`cameraNodes.${index}`)));
  }

  for (const [index, node] of (input.lightingNodes ?? []).entries()) {
    issues.push(...validateLightingNodeData(node).map(prefixIssue(`lightingNodes.${index}`)));
  }

  for (const [index, marker] of (input.minimapMarkers ?? []).entries()) {
    issues.push(...validateMinimapMarkerDraft(marker).map(prefixIssue(`minimapMarkers.${index}`)));
  }

  for (const [index, display] of (input.uiDisplays ?? []).entries()) {
    issues.push(...validateUiAssetDisplayContract(display).map(prefixIssue(`uiDisplays.${index}`)));
  }

  for (const [index, reference] of (input.generatedReferences ?? []).entries()) {
    issues.push(...validateGeneratedCandidateReference(reference, `generatedReferences.${index}`));
  }

  return dedupeIssues(issues);
}

function requireDataDrivenId(path: string, value: string, message: string): readonly Phase9ValidationIssue[] {
  return value.trim().length > 0 ? [] : [error(path, message)];
}

function hasExplicitDisplaySize(display: UiAssetDisplayContract): boolean {
  return hasDimensions(display.displayWidth, display.displayHeight)
    || display.responsiveRules.some((rule) => hasResponsiveDimensions(rule));
}

function hasResponsiveDimensions(rule: UiDisplayResponsiveRule): boolean {
  return hasDimensions(rule.displayWidth, rule.displayHeight);
}

function hasDimensions(width: number | null, height: number | null): boolean {
  return width !== null && height !== null && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
}

function prefixIssue(prefix: string): (issue: Phase9ValidationIssue) => Phase9ValidationIssue {
  return (issue) => ({
    ...issue,
    path: `${prefix}.${issue.path}`
  });
}

function dedupeIssues(issues: readonly Phase9ValidationIssue[]): readonly Phase9ValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((candidate) => {
    const key = `${candidate.path}:${candidate.message}:${candidate.severity}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function warning(path: string, message: string): Phase9ValidationIssue {
  return { path, message, severity: "warning", blocksRuntimePublish: false };
}

function error(path: string, message: string): Phase9ValidationIssue {
  return { path, message, severity: "error", blocksRuntimePublish: false };
}

function runtimeError(path: string, message: string): Phase9ValidationIssue {
  return { path, message, severity: "error", blocksRuntimePublish: true };
}
