import type { EntityComponentValidationIssue } from "./entity-components.js";
import { validateEntityTemplateDraft } from "./entity-validation.js";
import type { GenerationValidationIssue } from "./procedural-generation.js";
import {
  validateGenerationBakeDraftResult,
  validateGenerationPreviewResult,
  validateProceduralGraphDraft
} from "./procedural-validation.js";
import {
  PUBLISH_INPUT_STATES,
  PUBLISH_VALIDATION_GATES,
  countPublishCandidateSummary,
  type PublishCandidateReference,
  type PublishGateResult,
  type PublishInputBundle,
  type PublishRollbackSnapshotReference,
  type PublishSnapshotMetadata,
  type PublishValidationGate,
  type PublishValidationIssue,
  type PublishValidationResult
} from "./publish-flow.js";
import type { EditorGraphDocument } from "./node-graph.js";
import type {
  GeneratedCandidateReference,
  Phase9ValidationIssue,
  UiAssetDisplayContract
} from "./world-camera-minimap.js";
import {
  validateGeneratedCandidateReference,
  validatePhase9WorldInput,
  validateUiAssetDisplayContract
} from "./world-camera-minimap-validation.js";

export function validatePublishInputBundle(bundle: PublishInputBundle): PublishValidationResult {
  const issues: PublishValidationIssue[] = [];

  issues.push(...validateBundleIdentity(bundle));
  issues.push(...validateNodeGraphCompleteness(bundle.nodeGraph));
  issues.push(...validateCandidateReferences(bundle.candidateReferences));
  issues.push(...bundle.entities.flatMap((entity, index) =>
    validateEntityTemplateDraft(entity).map((candidate) => fromEntityIssue(candidate, `entities.${index}`))
  ));

  if (bundle.proceduralGraph) {
    issues.push(...validateProceduralGraphDraft(bundle.proceduralGraph).map(fromProceduralIssue("proceduralGraph")));
  }

  if (bundle.proceduralPreview) {
    issues.push(...validateGenerationPreviewResult(bundle.proceduralPreview).map(fromProceduralIssue("proceduralPreview")));
  }

  if (bundle.proceduralBake) {
    issues.push(...validateGenerationBakeDraftResult(bundle.proceduralBake).map(fromProceduralIssue("proceduralBake")));
  }

  issues.push(...validateGeneratedReferences(bundle.generatedReferences));

  if (bundle.world) {
    issues.push(...validatePhase9WorldInput(bundle.world).map(fromPhase9Issue));
  }

  issues.push(...bundle.uiDisplays.flatMap((display, index) =>
    validateUiAssetDisplayContract(display).map((candidate) => fromUiDisplayIssue(candidate, `uiDisplays.${index}`))
  ));
  issues.push(...validatePublishSafetyFlags(bundle));

  const gateResults = createGateResults(issues);
  const hasBlockingErrors = issues.some((candidate) => candidate.blocksPublishReady);

  return {
    validationId: `publish-validation:${bundle.bundleId}`,
    bundleId: bundle.bundleId,
    state: hasBlockingErrors ? bundle.state : "publish-ready",
    publishReady: !hasBlockingErrors,
    snapshotAllowed: !hasBlockingErrors,
    gateResults,
    issues: dedupeIssues(issues),
    candidateSummary: countPublishCandidateSummary(bundle),
    runtimePublishRequested: false,
    automaticPublish: false,
    assetsCopiedToGit: false,
    containsConcreteRuntimeContent: false,
    publishesRuntimeOutput: false
  };
}

export function validatePublishSnapshotMetadata(snapshot: PublishSnapshotMetadata): readonly PublishValidationIssue[] {
  const issues: PublishValidationIssue[] = [];

  if (snapshot.snapshotId.trim().length === 0) {
    issues.push(issue("no-hardcoded-content", "snapshotId", "Snapshot metadata requires a data-driven snapshot id.", "error", true, false));
  }

  if (snapshot.sourceBundleId.trim().length === 0) {
    issues.push(issue("no-hardcoded-content", "sourceBundleId", "Snapshot metadata requires a source bundle id.", "error", true, false));
  }

  if (snapshot.state !== "published-snapshot") {
    issues.push(issue("no-hardcoded-content", "state", "Snapshot metadata must use published-snapshot state.", "error", true, false));
  }

  if (snapshot.containsRuntimePayload !== false || snapshot.containsConcreteRuntimeContent !== false) {
    issues.push(issue("no-hardcoded-content", "snapshot", "Fase 10 snapshot metadata must not contain runtime payload or concrete gamecontent.", "error", true, true));
  }

  if (snapshot.copiesAssetsToGit !== false) {
    issues.push(issue("no-asset-mutation", "copiesAssetsToGit", "Snapshot metadata creation must not copy assets to Git.", "error", true, true));
  }

  if (snapshot.publishesRuntimeOutput !== false) {
    issues.push(issue("no-runtime-publish", "publishesRuntimeOutput", "Snapshot metadata must not publish runtime output.", "error", true, true));
  }

  for (const [path, value] of Object.entries(snapshot.candidateSummary)) {
    if (!Number.isInteger(value) || value < 0) {
      issues.push(issue("no-hardcoded-content", `candidateSummary.${path}`, "Candidate summary counts must be non-negative integers.", "error", true, false));
    }
  }

  return dedupeIssues(issues);
}

export function validatePublishRollbackReference(reference: PublishRollbackSnapshotReference): readonly PublishValidationIssue[] {
  const issues: PublishValidationIssue[] = [];

  if (reference.rollbackReferenceId.trim().length === 0 || reference.targetSnapshotId.trim().length === 0) {
    issues.push(issue("no-hardcoded-content", "rollbackReference", "Rollback validation requires data-driven rollback and snapshot ids.", "error", true, false));
  }

  if (reference.validatesOnly !== true || reference.restoresRuntimeAutomatically !== false) {
    issues.push(issue("no-runtime-publish", "rollbackReference", "Rollback contracts validate only and must not restore runtime automatically.", "error", true, true));
  }

  if (reference.containsConcreteRuntimeContent !== false) {
    issues.push(issue("no-hardcoded-content", "containsConcreteRuntimeContent", "Rollback reference must not contain concrete runtime content.", "error", true, true));
  }

  if (reference.publishesRuntimeOutput !== false) {
    issues.push(issue("no-runtime-publish", "publishesRuntimeOutput", "Rollback validation must not publish runtime output.", "error", true, true));
  }

  return dedupeIssues(issues);
}

function validateBundleIdentity(bundle: PublishInputBundle): readonly PublishValidationIssue[] {
  const issues: PublishValidationIssue[] = [];

  if (bundle.bundleId.trim().length === 0) {
    issues.push(issue("node-graph-completeness", "bundleId", "Publish input bundle requires a data-driven bundle id.", "error", true, false));
  }

  if (!PUBLISH_INPUT_STATES.includes(bundle.state)) {
    issues.push(issue("node-graph-completeness", "state", "Publish input bundle state must be draft or candidate before validation.", "error", true, false));
  }

  return issues;
}

function validateNodeGraphCompleteness(graph: EditorGraphDocument | null): readonly PublishValidationIssue[] {
  if (!graph) {
    return [issue("node-graph-completeness", "nodeGraph", "Publish validation requires a node graph draft or candidate input.", "error", true, false)];
  }

  const issues: PublishValidationIssue[] = [];

  if (graph.id.trim().length === 0) {
    issues.push(issue("node-graph-completeness", "nodeGraph.id", "Node graph requires a data-driven id.", "error", true, false));
  }

  if (graph.nodes.length === 0) {
    issues.push(issue("node-graph-completeness", "nodeGraph.nodes", "Node graph must contain editor/node-data nodes before publish-ready validation.", "error", true, false));
  }

  graph.nodes.forEach((node, index) => {
    if (node.id.trim().length === 0 || node.type.trim().length === 0) {
      issues.push(issue("node-graph-completeness", `nodeGraph.nodes.${index}`, "Graph nodes require data-driven ids and types.", "error", true, false));
    }
  });

  return issues;
}

function validateCandidateReferences(candidates: readonly PublishCandidateReference[]): readonly PublishValidationIssue[] {
  const issues: PublishValidationIssue[] = [];

  candidates.forEach((candidate, index) => {
    const path = `candidateReferences.${index}`;

    if (candidate.candidateId.trim().length === 0 || candidate.sourceId.trim().length === 0) {
      issues.push(issue("asset-candidates", path, "Publish candidate references require data-driven ids.", "error", true, false));
    }

    if (!PUBLISH_INPUT_STATES.includes(candidate.state)) {
      issues.push(issue("asset-candidates", `${path}.state`, "Candidate references must remain draft or candidate until publish validation accepts them.", "error", true, false));
    }

    if (candidate.assignsDefinitiveRuntimeRole !== false) {
      issues.push(issue("asset-candidates", `${path}.assignsDefinitiveRuntimeRole`, "Asset candidates must not assign definitive runtime roles in Fase 10.", "error", true, true));
    }

    if (candidate.copiesAssetsToGit !== false) {
      issues.push(issue("no-asset-mutation", `${path}.copiesAssetsToGit`, "Publish candidates must not copy assets to Git.", "error", true, true));
    }

    if (candidate.publishesRuntimeOutput !== false) {
      issues.push(issue("no-runtime-publish", `${path}.publishesRuntimeOutput`, "Publish candidates must not publish runtime output.", "error", true, true));
    }
  });

  return issues;
}

function validateGeneratedReferences(references: readonly GeneratedCandidateReference<string>[]): readonly PublishValidationIssue[] {
  return references.flatMap((reference, index) =>
    validateGeneratedCandidateReference(reference, `generatedReferences.${index}`).map((candidate) => ({
      gate: "procedural-generated-candidates",
      path: candidate.path,
      message: candidate.message,
      severity: candidate.severity,
      blocksPublishReady: candidate.severity === "error",
      blocksRuntimePublish: candidate.blocksRuntimePublish
    }))
  );
}

function validatePublishSafetyFlags(bundle: PublishInputBundle): readonly PublishValidationIssue[] {
  const issues: PublishValidationIssue[] = [];

  if (bundle.runtimePublishRequested !== false || bundle.automaticPublish !== false || bundle.publishesRuntimeOutput !== false) {
    issues.push(issue("no-runtime-publish", "publishing", "Fase 10 Git-basis validates publish readiness only and must not run runtime publish.", "error", true, true));
  }

  if (bundle.assetsCopiedToGit !== false) {
    issues.push(issue("no-asset-mutation", "assetsCopiedToGit", "Publish validation must not add, copy, mutate or remove assets.", "error", true, true));
  }

  if (bundle.containsConcreteRuntimeContent !== false || bundle.hardcodedContentIndicators.length > 0) {
    issues.push(issue("no-hardcoded-content", "hardcodedContentIndicators", "Publish input must not contain hardcoded world, camera, lighting, minimap, HUD, audio or gamecontent.", "error", true, true));
  }

  return issues;
}

function fromEntityIssue(candidate: EntityComponentValidationIssue, prefix: string): PublishValidationIssue {
  return {
    gate: "entity-component-validity",
    path: `${prefix}.${candidate.path}`,
    message: candidate.message,
    severity: candidate.severity,
    blocksPublishReady: candidate.severity === "error",
    blocksRuntimePublish: candidate.blocksRuntimeActivation
  };
}

function fromProceduralIssue(prefix: string): (candidate: GenerationValidationIssue) => PublishValidationIssue {
  return (candidate) => ({
    gate: "procedural-generated-candidates",
    path: `${prefix}.${candidate.path}`,
    message: candidate.message,
    severity: candidate.severity,
    blocksPublishReady: candidate.severity === "error" || candidate.blocksBake,
    blocksRuntimePublish: candidate.blocksRuntimePublish
  });
}

function fromPhase9Issue(candidate: Phase9ValidationIssue): PublishValidationIssue {
  const gate = phase9Gate(candidate);
  return {
    gate,
    path: candidate.path,
    message: candidate.message,
    severity: candidate.severity,
    blocksPublishReady: candidate.severity === "error",
    blocksRuntimePublish: candidate.blocksRuntimePublish
  };
}

function fromUiDisplayIssue(candidate: Phase9ValidationIssue, prefix: string): PublishValidationIssue {
  return {
    ...fromPhase9Issue(candidate),
    gate: "ui-display-sizing",
    path: `${prefix}.${candidate.path}`
  };
}

function phase9Gate(candidate: Phase9ValidationIssue): PublishValidationGate {
  return /uiDisplays|displaySize|naturalSize|nineSlice|scaleMode|anchor|pivot/.test(candidate.path)
    ? "ui-display-sizing"
    : "world-zone-camera-minimap-validity";
}

function createGateResults(issues: readonly PublishValidationIssue[]): readonly PublishGateResult[] {
  return PUBLISH_VALIDATION_GATES.map((gate) => {
    const gateIssues = dedupeIssues(issues.filter((candidate) => candidate.gate === gate));
    const status = gateIssues.some((candidate) => candidate.severity === "error")
      ? "fail"
      : gateIssues.length > 0 ? "warning" : "pass";

    return { gate, status, issues: gateIssues };
  });
}

function issue(
  gate: PublishValidationGate,
  path: string,
  message: string,
  severity: "warning" | "error",
  blocksPublishReady: boolean,
  blocksRuntimePublish: boolean
): PublishValidationIssue {
  return { gate, path, message, severity, blocksPublishReady, blocksRuntimePublish };
}

function dedupeIssues(issues: readonly PublishValidationIssue[]): readonly PublishValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((candidate) => {
    const key = `${candidate.gate}:${candidate.path}:${candidate.message}:${candidate.severity}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
