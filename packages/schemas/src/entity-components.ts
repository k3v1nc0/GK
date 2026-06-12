export const ENTITY_COMPONENT_TYPES = [
  "transform",
  "renderable",
  "collider",
  "interactable",
  "npc_brain",
  "audio_emitter",
  "combatant",
  "boss",
  "loot",
  "quest_target",
  "merchant",
  "player_appearance",
  "group_transform"
] as const;

export type EntityComponentType = (typeof ENTITY_COMPONENT_TYPES)[number];
export type EntityComponentStatus = "candidate" | "assigned" | "invalid";
export type EntityRoleMappingDraftStatus = "candidate" | "assigned" | "invalid";

export interface EntityVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface EntityAssetReference {
  readonly source: "asset-library";
  readonly assetId: string;
}

export interface EntityAudioReference {
  readonly source: "audio-library";
  readonly audioId: string;
}

export interface EntityAnimationMapping {
  readonly source: "editor-data";
  readonly clips: Readonly<Record<string, string>>;
}

export interface EntityRuntimeActivationGate {
  readonly active: boolean;
  readonly editorDataConfirmed: boolean;
  readonly animationMapping: EntityAnimationMapping | null;
}

export interface EntityComponentDraft {
  readonly componentId: string;
  readonly componentType: EntityComponentType;
  readonly status: EntityComponentStatus;
  readonly config: Readonly<Record<string, unknown>>;
  readonly runtime: EntityRuntimeActivationGate;
}

export interface EntityTemplateDraft {
  readonly entityId: string;
  readonly source: "editor-draft";
  readonly assetReference: EntityAssetReference | null;
  readonly roleMappingStatus: EntityRoleMappingDraftStatus;
  readonly components: readonly EntityComponentDraft[];
  readonly publishesRuntimeOutput: false;
}

export interface EntityGroupDraft {
  readonly groupId: string;
  readonly entityIds: readonly string[];
  readonly transform: Readonly<Record<string, unknown>> | null;
  readonly publishesRuntimeOutput: false;
}

export interface EntityComponentValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly severity: "warning" | "error";
  readonly blocksRuntimeActivation: boolean;
}

export interface EntityAssetLibraryRecordGate {
  readonly assetId: string;
  readonly assetType: "glb" | "ui_image" | "audio";
  readonly status: "active" | "missing" | "invalid";
  readonly roleMapping: {
    readonly status: "unassigned" | "candidate" | "assigned";
  };
}

export interface EntityValidationOptions {
  readonly assetRecords?: readonly EntityAssetLibraryRecordGate[];
  readonly audioCount?: number;
}

export interface AssetToEntityRoleMappingDraft {
  readonly assetReference: EntityAssetReference;
  readonly mappingStatus: EntityRoleMappingDraftStatus;
  readonly candidateComponents: readonly EntityComponentType[];
  readonly assignedComponents: readonly EntityComponentType[];
  readonly source: "editor-data";
  readonly assignsDefinitiveRuntimeRole: false;
  readonly publishesRuntimeOutput: false;
}

export const ENTITY_BEHAVIOR_COMPONENTS_REQUIRING_EDITOR_DATA = [
  "npc_brain",
  "combatant",
  "boss",
  "merchant",
  "quest_target",
  "player_appearance"
] as const satisfies readonly EntityComponentType[];

export const ENTITY_RUNTIME_ACTIVE_ANIMATION_COMPONENTS = [
  "npc_brain",
  "combatant",
  "boss",
  "player_appearance"
] as const satisfies readonly EntityComponentType[];

export const DEFAULT_ENTITY_ASSET_CANDIDATE_COMPONENTS = [
  "transform",
  "renderable",
  "collider",
  "interactable",
  "npc_brain",
  "audio_emitter",
  "combatant",
  "boss",
  "loot",
  "quest_target",
  "merchant",
  "player_appearance"
] as const satisfies readonly EntityComponentType[];

export function createEntityComponentDraft(
  componentType: EntityComponentType,
  config: Readonly<Record<string, unknown>> = {},
  options: {
    readonly componentId?: string;
    readonly status?: EntityComponentStatus;
    readonly runtimeActive?: boolean;
    readonly editorDataConfirmed?: boolean;
    readonly animationMapping?: EntityAnimationMapping | null;
  } = {}
): EntityComponentDraft {
  return {
    componentId: options.componentId ?? `${componentType}-candidate`,
    componentType,
    status: options.status ?? "candidate",
    config,
    runtime: {
      active: options.runtimeActive ?? false,
      editorDataConfirmed: options.editorDataConfirmed ?? false,
      animationMapping: options.animationMapping ?? null
    }
  };
}

export function createEntityTemplateDraft(options: {
  readonly entityId: string;
  readonly assetReference?: EntityAssetReference | null;
  readonly roleMappingStatus?: EntityRoleMappingDraftStatus;
  readonly components?: readonly EntityComponentDraft[];
}): EntityTemplateDraft {
  return {
    entityId: options.entityId,
    source: "editor-draft",
    assetReference: options.assetReference ?? null,
    roleMappingStatus: options.roleMappingStatus ?? "candidate",
    components: options.components ?? [],
    publishesRuntimeOutput: false
  };
}

export function createAssetToEntityRoleMappingDraft(
  assetReference: EntityAssetReference,
  candidateComponents: readonly EntityComponentType[] = DEFAULT_ENTITY_ASSET_CANDIDATE_COMPONENTS
): AssetToEntityRoleMappingDraft {
  return {
    assetReference,
    mappingStatus: "candidate",
    candidateComponents,
    assignedComponents: [],
    source: "editor-data",
    assignsDefinitiveRuntimeRole: false,
    publishesRuntimeOutput: false
  };
}
