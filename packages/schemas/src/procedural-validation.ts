import type { EntityValidationOptions } from "./entity-components.js";
import { validateEntityTemplateDraft } from "./entity-validation.js";
import {
  PROCEDURAL_GENERATOR_NODE_TYPES,
  normalizeProceduralSeed,
  type GenerationBakeDraftResult,
  type GenerationPreviewResult,
  type GenerationValidationIssue,
  type ProceduralAssetRecordGate,
  type ProceduralGenerationOutput,
  type ProceduralGraphDraft
} from "./procedural-generation.js";

export interface ProceduralValidationOptions extends EntityValidationOptions {
  readonly assetRecords?: readonly ProceduralAssetRecordGate[];
}

export function validateProceduralGraphDraft(
  graph: ProceduralGraphDraft
): readonly GenerationValidationIssue[] {
  const issues: GenerationValidationIssue[] = [];

  if (graph.publishesRuntimeOutput !== false) {
    issues.push(issue("publishesRuntimeOutput", "Procedural graph drafts must not publish runtime output.", "error", true, true));
  }

  if (!graph.seed || normalizeProceduralSeed(graph.seed.seed).length === 0) {
    issues.push(issue("seed", "Procedural graph requires an explicit world, zone or local seed.", "error", true, false));
  }

  graph.nodes.forEach((node, index) => {
    if (!PROCEDURAL_GENERATOR_NODE_TYPES.includes(node.nodeType)) {
      issues.push(issue(`nodes.${index}.nodeType`, "Unknown procedural generator node type.", "error", true, false));
    }

    if (node.publishesRuntimeOutput !== false) {
      issues.push(issue(`nodes.${index}.publishesRuntimeOutput`, "Generator nodes are draft-only and must not publish runtime output.", "error", true, true));
    }
  });

  return issues;
}

export function validateProceduralGenerationOutput(
  output: ProceduralGenerationOutput,
  options: ProceduralValidationOptions = {}
): readonly GenerationValidationIssue[] {
  const issues: GenerationValidationIssue[] = [...output.validationIssues];

  if (output.publishesRuntimeOutput !== false) {
    issues.push(issue("output.publishesRuntimeOutput", "Procedural generation output must remain draft-only.", "error", true, true));
  }

  if (output.assetsCopiedToGit !== false) {
    issues.push(issue("output.assetsCopiedToGit", "Procedural generation must not copy assets to Git.", "error", true, true));
  }

  output.generatedEntities.forEach((generated, index) => {
    if (generated.publishesRuntimeOutput !== false) {
      issues.push(issue(`generatedEntities.${index}.publishesRuntimeOutput`, "Generated entity drafts must not publish runtime output.", "error", true, true));
    }

    const entityIssues = validateEntityTemplateDraft(generated.entityDraft, options).map((entityIssue) => issue(
      `generatedEntities.${index}.${entityIssue.path}`,
      entityIssue.message,
      entityIssue.severity,
      entityIssue.severity === "error",
      entityIssue.blocksRuntimeActivation
    ));
    issues.push(...entityIssues);
  });

  output.generatedGroups.forEach((generated, index) => {
    if (generated.publishesRuntimeOutput !== false || generated.groupDraft.publishesRuntimeOutput !== false) {
      issues.push(issue(`generatedGroups.${index}.publishesRuntimeOutput`, "Generated group drafts must not publish runtime output.", "error", true, true));
    }
  });

  output.placementCandidates.forEach((candidate, index) => {
    if (candidate.publishesRuntimeOutput !== false) {
      issues.push(issue(`placementCandidates.${index}.publishesRuntimeOutput`, "Generated placement candidates must not publish runtime output.", "error", true, true));
    }

    if (candidate.assetReference) {
      issues.push(...validateAssetReference(candidate.assetReference.assetId, `placementCandidates.${index}.assetReference`, options.assetRecords));
    }
  });

  output.spawnAreaCandidates.forEach((candidate, index) => {
    if (candidate.publishesRuntimeOutput !== false) {
      issues.push(issue(`spawnAreaCandidates.${index}.publishesRuntimeOutput`, "Generated spawn area candidates must not publish runtime output.", "error", true, true));
    }
  });

  output.pathNetworkCandidates.forEach((candidate, index) => {
    if (candidate.publishesRuntimeOutput !== false) {
      issues.push(issue(`pathNetworkCandidates.${index}.publishesRuntimeOutput`, "Generated path network candidates must not publish runtime output.", "error", true, true));
    }
  });

  output.resourceDistributionCandidates.forEach((candidate, index) => {
    if (candidate.publishesRuntimeOutput !== false) {
      issues.push(issue(`resourceDistributionCandidates.${index}.publishesRuntimeOutput`, "Generated resource distribution candidates must not publish runtime output.", "error", true, true));
    }
  });

  output.audioCandidates.forEach((candidate, index) => {
    if (candidate.publishesRuntimeOutput !== false) {
      issues.push(issue(`audioCandidates.${index}.publishesRuntimeOutput`, "Generated audio candidates must not publish runtime output.", "error", true, true));
    }

    if (!candidate.audioReference && (options.audioCount ?? 0) === 0) {
      issues.push(issue(`audioCandidates.${index}.audioReference`, "Generated audio is gated because audio asset count is 0.", "warning", false, false));
    }
  });

  return issues;
}

export function validateGenerationPreviewResult(
  preview: GenerationPreviewResult,
  options: ProceduralValidationOptions = {}
): readonly GenerationValidationIssue[] {
  const issues = [...preview.issues, ...validateProceduralGenerationOutput(preview.output, options)];

  if (preview.publishesRuntimeOutput !== false) {
    issues.push(issue("preview.publishesRuntimeOutput", "Procedural preview must not publish runtime output.", "error", true, true));
  }

  return dedupeIssues(issues);
}

export function validateGenerationBakeDraftResult(
  bake: GenerationBakeDraftResult,
  options: ProceduralValidationOptions = {}
): readonly GenerationValidationIssue[] {
  const issues = [...bake.issues, ...validateProceduralGenerationOutput(bake.output, options)];

  if (bake.publishesRuntimeOutput !== false) {
    issues.push(issue("bake.publishesRuntimeOutput", "Procedural bake-draft must not publish runtime output.", "error", true, true));
  }

  if (bake.writesEditorDraftData !== true) {
    issues.push(issue("bake.writesEditorDraftData", "Procedural bake must write editor draft data only.", "error", true, false));
  }

  return dedupeIssues(issues);
}

function validateAssetReference(
  assetId: string,
  path: string,
  records?: readonly ProceduralAssetRecordGate[]
): readonly GenerationValidationIssue[] {
  if (!records) {
    return [];
  }

  const record = records.find((candidate) => candidate.assetId === assetId);
  if (!record) {
    return [issue(path, "Generated asset.reference must exist in the asset library.", "error", true, false)];
  }

  if (record.status !== "active") {
    return [issue(path, "Generated asset.reference must point to an active asset before runtime activation.", "error", true, false)];
  }

  return [];
}

function dedupeIssues(issues: readonly GenerationValidationIssue[]): readonly GenerationValidationIssue[] {
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

function issue(
  path: string,
  message: string,
  severity: "warning" | "error",
  blocksBake: boolean,
  blocksRuntimePublish: boolean
): GenerationValidationIssue {
  return { path, message, severity, blocksBake, blocksRuntimePublish };
}
