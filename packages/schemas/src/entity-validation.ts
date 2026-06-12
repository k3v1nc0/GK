import {
  ENTITY_BEHAVIOR_COMPONENTS_REQUIRING_EDITOR_DATA,
  ENTITY_COMPONENT_TYPES,
  ENTITY_RUNTIME_ACTIVE_ANIMATION_COMPONENTS,
  type EntityAnimationMapping,
  type EntityAssetReference,
  type EntityAudioReference,
  type EntityComponentDraft,
  type EntityComponentValidationIssue,
  type EntityValidationOptions,
  type EntityVector3,
  type EntityTemplateDraft
} from "./entity-components.js";

export function validateEntityTemplateDraft(
  draft: EntityTemplateDraft,
  options: EntityValidationOptions = {}
): readonly EntityComponentValidationIssue[] {
  const issues: EntityComponentValidationIssue[] = [];

  if (draft.publishesRuntimeOutput !== false) {
    issues.push(issue("publishesRuntimeOutput", "Entity draft must not publish runtime output in Fase 8.", "error", true));
  }

  if (draft.assetReference && !isAssetReference(draft.assetReference)) {
    issues.push(issue("assetReference", "Entity asset reference must use asset-library source.", "error", true));
  }

  draft.components.forEach((component, index) => {
    issues.push(...validateEntityComponentDraft(component, options, `components.${index}`));
  });

  return issues;
}

export function validateEntityComponentDraft(
  component: EntityComponentDraft,
  options: EntityValidationOptions = {},
  path = "component"
): readonly EntityComponentValidationIssue[] {
  const issues: EntityComponentValidationIssue[] = [];

  if (!ENTITY_COMPONENT_TYPES.includes(component.componentType)) {
    return [issue(`${path}.componentType`, "Unknown entity component type.", "error", true)];
  }

  if (component.componentType === "renderable") {
    issues.push(...validateRenderable(component, options, path));
  }

  if (component.componentType === "transform" || component.componentType === "group_transform") {
    issues.push(...validateTransformLike(component, path));
  }

  if (component.componentType === "audio_emitter") {
    issues.push(...validateAudioEmitter(component, options, path));
  }

  if ((ENTITY_BEHAVIOR_COMPONENTS_REQUIRING_EDITOR_DATA as readonly string[]).includes(component.componentType)) {
    issues.push(...validateRuntimeActivationGate(component, path));
  }

  if ((ENTITY_RUNTIME_ACTIVE_ANIMATION_COMPONENTS as readonly string[]).includes(component.componentType)) {
    issues.push(...validateAnimationMappingGate(component, path));
  }

  return issues;
}

function validateRenderable(
  component: EntityComponentDraft,
  options: EntityValidationOptions,
  path: string
): readonly EntityComponentValidationIssue[] {
  const asset = readAssetReference(component.config.assetReference ?? component.config.asset);

  if (!asset) {
    return [issue(`${path}.config.assetReference`, "Renderable component requires an asset.reference.", "error", true)];
  }

  const record = options.assetRecords?.find((candidate) => candidate.assetId === asset.assetId);
  if (!record && options.assetRecords) {
    return [issue(`${path}.config.assetReference`, "Renderable asset.reference must exist in the asset library.", "error", true)];
  }

  if (!record) {
    return [];
  }

  if (record.assetType !== "glb") {
    return [issue(`${path}.config.assetReference`, "Renderable asset.reference must point to a GLB asset.", "error", true)];
  }

  if (record.status !== "active") {
    return [issue(`${path}.config.assetReference`, "Renderable GLB asset must be active before runtime activation.", "error", true)];
  }

  if (record.roleMapping.status !== "candidate" && record.roleMapping.status !== "assigned") {
    return [issue(`${path}.config.assetReference`, "Renderable GLB asset must be candidate or assigned editor-data.", "error", true)];
  }

  return [];
}

function validateTransformLike(component: EntityComponentDraft, path: string): readonly EntityComponentValidationIssue[] {
  const issues: EntityComponentValidationIssue[] = [];

  for (const key of ["position", "rotation", "scale"] as const) {
    if (!isVector3(component.config[key])) {
      issues.push(issue(`${path}.config.${key}`, "Transform data must include finite x/y/z values from editor data.", "error", false));
    }
  }

  return issues;
}

function validateAudioEmitter(
  component: EntityComponentDraft,
  options: EntityValidationOptions,
  path: string
): readonly EntityComponentValidationIssue[] {
  const audio = readAudioReference(component.config.audioReference ?? component.config.audio);

  if (!audio) {
    return (options.audioCount ?? 0) === 0
      ? [issue(`${path}.config.audioReference`, "Audio emitter is gated because audio asset count is 0.", "warning", false)]
      : [issue(`${path}.config.audioReference`, "Audio emitter requires an audio.reference when audio assets exist.", "error", true)];
  }

  return [];
}

function validateRuntimeActivationGate(component: EntityComponentDraft, path: string): readonly EntityComponentValidationIssue[] {
  if (!component.runtime.active) {
    return [];
  }

  if (!component.runtime.editorDataConfirmed) {
    return [issue(`${path}.runtime.editorDataConfirmed`, "Runtime-active behavior requires explicit editor-data confirmation.", "error", true)];
  }

  return [];
}

function validateAnimationMappingGate(component: EntityComponentDraft, path: string): readonly EntityComponentValidationIssue[] {
  if (hasAnimationMapping(component.runtime.animationMapping)) {
    return [];
  }

  return component.runtime.active
    ? [issue(`${path}.runtime.animationMapping`, "Runtime-active NPC/combat/player behavior requires editor-data animation mapping.", "error", true)]
    : [issue(`${path}.runtime.animationMapping`, "Missing animation mapping is a warning for candidate entities.", "warning", false)];
}

function readAssetReference(value: unknown): EntityAssetReference | null {
  return isAssetReference(value) ? value : null;
}

function readAudioReference(value: unknown): EntityAudioReference | null {
  return isAudioReference(value) ? value : null;
}

function isAssetReference(value: unknown): value is EntityAssetReference {
  const candidate = value as { readonly source?: unknown; readonly assetId?: unknown } | null;
  return Boolean(candidate && candidate.source === "asset-library" && typeof candidate.assetId === "string");
}

function isAudioReference(value: unknown): value is EntityAudioReference {
  const candidate = value as { readonly source?: unknown; readonly audioId?: unknown } | null;
  return Boolean(candidate && candidate.source === "audio-library" && typeof candidate.audioId === "string");
}

function isVector3(value: unknown): value is EntityVector3 {
  const candidate = value as { readonly x?: unknown; readonly y?: unknown; readonly z?: unknown } | null;
  return Boolean(candidate && isFiniteNumber(candidate.x) && isFiniteNumber(candidate.y) && isFiniteNumber(candidate.z));
}

function hasAnimationMapping(mapping: EntityAnimationMapping | null): boolean {
  return Boolean(mapping && mapping.source === "editor-data" && Object.keys(mapping.clips).length > 0);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function issue(
  path: string,
  message: string,
  severity: "warning" | "error",
  blocksRuntimeActivation: boolean
): EntityComponentValidationIssue {
  return { path, message, severity, blocksRuntimeActivation };
}
