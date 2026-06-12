import type {
  EntityAssetReference,
  EntityAudioReference,
  EntityGroupDraft,
  EntityTemplateDraft
} from "./entity-components.js";

export const PROCEDURAL_SEED_SCOPES = ["world", "zone", "local"] as const;

export const PROCEDURAL_GENERATOR_NODE_TYPES = [
  "proc.seed",
  "proc.random",
  "proc.pickWeighted",
  "proc.noise2D",
  "proc.noise3D",
  "proc.scatterAssets",
  "proc.scatterEntities",
  "proc.zoneLayout",
  "proc.pathNetwork",
  "proc.spawnArea",
  "proc.resourceDistribution",
  "proc.validateGeneratedGraph",
  "proc.previewGeneration",
  "proc.bakeGenerationDraft"
] as const;

export type ProceduralSeedScope = (typeof PROCEDURAL_SEED_SCOPES)[number];
export type ProceduralSeedInput = string | number;
export type ProceduralGeneratorNodeType = (typeof PROCEDURAL_GENERATOR_NODE_TYPES)[number];
export type ProceduralGenerationMode = "preview" | "bake_draft";
export type ProceduralCandidateStatus = "candidate" | "invalid";

export interface ProceduralSeedReference {
  readonly scope: ProceduralSeedScope;
  readonly seed: ProceduralSeedInput;
}

export interface WorldSeed extends ProceduralSeedReference {
  readonly scope: "world";
}

export interface ZoneSeed extends ProceduralSeedReference {
  readonly scope: "zone";
  readonly worldSeed: WorldSeed | null;
}

export interface LocalSeed extends ProceduralSeedReference {
  readonly scope: "local";
  readonly zoneSeed: ZoneSeed | null;
}

export interface DeterministicRandomStreamContract {
  readonly algorithm: "gk-xfnv1a-mulberry32-v1";
  readonly seed: string;
  readonly streamKey: string;
  readonly usesMathRandom: false;
  readonly usesImplicitTimeSource: false;
}

export interface ProceduralGraphEdgeDraft {
  readonly edgeId: string;
  readonly sourceNodeId: string;
  readonly sourceSocketId: string;
  readonly targetNodeId: string;
  readonly targetSocketId: string;
}

export interface ProceduralGeneratorNodeDraft {
  readonly nodeId: string;
  readonly nodeType: ProceduralGeneratorNodeType;
  readonly config: Readonly<Record<string, unknown>>;
  readonly inputRefs: Readonly<Record<string, unknown>>;
  readonly outputRefs: Readonly<Record<string, unknown>>;
  readonly status: ProceduralCandidateStatus;
  readonly publishesRuntimeOutput: false;
}

export interface ProceduralGraphDraft {
  readonly graphId: string;
  readonly source: "editor-draft";
  readonly seed: ProceduralSeedReference | null;
  readonly nodes: readonly ProceduralGeneratorNodeDraft[];
  readonly edges: readonly ProceduralGraphEdgeDraft[];
  readonly publishesRuntimeOutput: false;
}

export interface ProceduralGenerationInput {
  readonly graph: ProceduralGraphDraft;
  readonly mode: ProceduralGenerationMode;
  readonly assetRecords?: readonly ProceduralAssetRecordGate[];
  readonly audioCount?: number;
  readonly entityDrafts?: readonly EntityTemplateDraft[];
}

export interface ProceduralAssetRecordGate {
  readonly assetId: string;
  readonly assetType: "glb" | "ui_image" | "audio";
  readonly status: "active" | "missing" | "invalid";
  readonly roleMapping: {
    readonly status: "unassigned" | "candidate" | "assigned";
  };
}

export interface GeneratedDraftEntity {
  readonly generatedId: string;
  readonly sourceNodeId: string | null;
  readonly entityDraft: EntityTemplateDraft;
  readonly status: ProceduralCandidateStatus;
  readonly publishesRuntimeOutput: false;
}

export interface GeneratedDraftGroup {
  readonly generatedId: string;
  readonly sourceNodeId: string | null;
  readonly groupDraft: EntityGroupDraft;
  readonly status: ProceduralCandidateStatus;
  readonly publishesRuntimeOutput: false;
}

export interface GeneratedPlacementCandidate {
  readonly candidateId: string;
  readonly sourceNodeId: string | null;
  readonly assetReference: EntityAssetReference | null;
  readonly entityReference: { readonly source: "editor-draft"; readonly entityId: string } | null;
  readonly transform: Readonly<Record<string, unknown>>;
  readonly status: ProceduralCandidateStatus;
  readonly publishesRuntimeOutput: false;
}

export interface GeneratedSpawnAreaCandidate {
  readonly candidateId: string;
  readonly sourceNodeId: string | null;
  readonly bounds: Readonly<Record<string, unknown>>;
  readonly status: ProceduralCandidateStatus;
  readonly publishesRuntimeOutput: false;
}

export interface GeneratedPathNetworkCandidate {
  readonly candidateId: string;
  readonly sourceNodeId: string | null;
  readonly pathGraph: Readonly<Record<string, unknown>>;
  readonly status: ProceduralCandidateStatus;
  readonly publishesRuntimeOutput: false;
}

export interface GeneratedResourceDistributionCandidate {
  readonly candidateId: string;
  readonly sourceNodeId: string | null;
  readonly resourceReference: string | null;
  readonly distribution: Readonly<Record<string, unknown>>;
  readonly status: ProceduralCandidateStatus;
  readonly publishesRuntimeOutput: false;
}

export interface GeneratedAudioCandidate {
  readonly candidateId: string;
  readonly sourceNodeId: string | null;
  readonly audioReference: EntityAudioReference | null;
  readonly status: ProceduralCandidateStatus;
  readonly publishesRuntimeOutput: false;
}

export interface GenerationValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly severity: "warning" | "error";
  readonly blocksBake: boolean;
  readonly blocksRuntimePublish: boolean;
}

export interface ProceduralGenerationOutput {
  readonly graphId: string;
  readonly seed: ProceduralSeedReference | null;
  readonly deterministicSignature: string;
  readonly generatedEntities: readonly GeneratedDraftEntity[];
  readonly generatedGroups: readonly GeneratedDraftGroup[];
  readonly placementCandidates: readonly GeneratedPlacementCandidate[];
  readonly spawnAreaCandidates: readonly GeneratedSpawnAreaCandidate[];
  readonly pathNetworkCandidates: readonly GeneratedPathNetworkCandidate[];
  readonly resourceDistributionCandidates: readonly GeneratedResourceDistributionCandidate[];
  readonly audioCandidates: readonly GeneratedAudioCandidate[];
  readonly validationIssues: readonly GenerationValidationIssue[];
  readonly assetsCopiedToGit: false;
  readonly publishesRuntimeOutput: false;
}

export interface GenerationPreviewResult {
  readonly mode: "procedural-preview";
  readonly output: ProceduralGenerationOutput;
  readonly issues: readonly GenerationValidationIssue[];
  readonly valid: boolean;
  readonly publishesRuntimeOutput: false;
}

export interface GenerationBakeDraftResult {
  readonly mode: "procedural-bake-draft";
  readonly output: ProceduralGenerationOutput;
  readonly issues: readonly GenerationValidationIssue[];
  readonly valid: boolean;
  readonly writesEditorDraftData: true;
  readonly publishesRuntimeOutput: false;
}

export function normalizeProceduralSeed(seed: ProceduralSeedInput): string {
  return String(seed).trim();
}

export function createProceduralGraphDraft(options: {
  readonly graphId: string;
  readonly seed?: ProceduralSeedReference | null;
  readonly nodes?: readonly ProceduralGeneratorNodeDraft[];
  readonly edges?: readonly ProceduralGraphEdgeDraft[];
}): ProceduralGraphDraft {
  return {
    graphId: options.graphId,
    source: "editor-draft",
    seed: options.seed ?? null,
    nodes: options.nodes ?? [],
    edges: options.edges ?? [],
    publishesRuntimeOutput: false
  };
}

export function createProceduralGeneratorNodeDraft(options: {
  readonly nodeId: string;
  readonly nodeType: ProceduralGeneratorNodeType;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly inputRefs?: Readonly<Record<string, unknown>>;
  readonly outputRefs?: Readonly<Record<string, unknown>>;
  readonly status?: ProceduralCandidateStatus;
}): ProceduralGeneratorNodeDraft {
  return {
    nodeId: options.nodeId,
    nodeType: options.nodeType,
    config: options.config ?? {},
    inputRefs: options.inputRefs ?? {},
    outputRefs: options.outputRefs ?? {},
    status: options.status ?? "candidate",
    publishesRuntimeOutput: false
  };
}

export function createEmptyGenerationOutput(options: {
  readonly graph: ProceduralGraphDraft;
  readonly deterministicSignature: string;
  readonly issues?: readonly GenerationValidationIssue[];
}): ProceduralGenerationOutput {
  return {
    graphId: options.graph.graphId,
    seed: options.graph.seed,
    deterministicSignature: options.deterministicSignature,
    generatedEntities: [],
    generatedGroups: [],
    placementCandidates: [],
    spawnAreaCandidates: [],
    pathNetworkCandidates: [],
    resourceDistributionCandidates: [],
    audioCandidates: [],
    validationIssues: options.issues ?? [],
    assetsCopiedToGit: false,
    publishesRuntimeOutput: false
  };
}

export function createGenerationPreviewResult(
  output: ProceduralGenerationOutput,
  issues: readonly GenerationValidationIssue[] = output.validationIssues
): GenerationPreviewResult {
  return {
    mode: "procedural-preview",
    output,
    issues,
    valid: !issues.some((issue) => issue.severity === "error"),
    publishesRuntimeOutput: false
  };
}

export function createGenerationBakeDraftResult(
  output: ProceduralGenerationOutput,
  issues: readonly GenerationValidationIssue[] = output.validationIssues
): GenerationBakeDraftResult {
  return {
    mode: "procedural-bake-draft",
    output,
    issues,
    valid: !issues.some((issue) => issue.blocksBake),
    writesEditorDraftData: true,
    publishesRuntimeOutput: false
  };
}
