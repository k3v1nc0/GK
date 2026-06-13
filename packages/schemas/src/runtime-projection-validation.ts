import type { PublishCandidateReference, PublishValidationIssue } from "./publish-flow.js";
import { validatePublishSnapshotMetadata } from "./publish-flow-validation.js";
import {
  RUNTIME_PROJECTION_VALIDATION_GATES,
  createRuntimeProjectionValidationResult,
  type RuntimeProjectionManifest,
  type RuntimeProjectionReadModel,
  type RuntimeProjectionRecord,
  type RuntimeProjectionSafetyFlags,
  type RuntimeProjectionSource,
  type RuntimeProjectionUiDisplayReference,
  type RuntimeProjectionValidationGate,
  type RuntimeProjectionValidationIssue,
  type RuntimeProjectionValidationResult
} from "./runtime-projection.js";

export function validateRuntimeProjectionSource(
  source: RuntimeProjectionSource
): RuntimeProjectionValidationResult {
  return createRuntimeProjectionValidationResult({
    sourceId: source.sourceId || "runtime-projection-source",
    issues: dedupeIssues([
      ...validateSourceIdentity(source),
      ...validatePublishSource(source),
      ...validateDraftBoundaries(source),
      ...validateAcceptedGeneratedReferences(source),
      ...validateSafetyFlags({
        publishesRuntimeProjection: true,
        implementsRuntimeRenderer: false,
        mutatesAssets: false,
        containsConcreteGameContent: false,
        usesHardcodedContent: false,
        copiesAssetsToGit: false,
        assignsDefinitiveRuntimeRoles: false,
        leaksEditorDraftData: source.leaksEditorDraftData
      })
    ])
  });
}

export function validateRuntimeProjectionManifest(
  manifest: RuntimeProjectionManifest
): RuntimeProjectionValidationResult {
  const sourceValidation = validateRuntimeProjectionSource(manifest.source);
  const issues = dedupeIssues([
    ...sourceValidation.issues,
    ...validateManifestIdentity(manifest),
    ...validateSafetyFlags(manifest.safetyFlags),
    ...manifest.records.flatMap((record, index) => validateRuntimeProjectionRecord(record, `records.${index}`))
  ]);

  return createRuntimeProjectionValidationResult({
    sourceId: manifest.source.sourceId,
    manifestId: manifest.manifestId,
    issues,
    safetyFlags: manifest.safetyFlags
  });
}

export function validateRuntimeProjectionRecord(
  record: RuntimeProjectionRecord,
  prefix = "record"
): readonly RuntimeProjectionValidationIssue[] {
  const issues: RuntimeProjectionValidationIssue[] = [];

  if (record.recordId.trim().length === 0 || record.sourceId.trim().length === 0) {
    issues.push(issue("publish-source", prefix, "Runtime projection records require data-driven ids from publish metadata.", "error", true));
  }

  if (record.dataReference.id.trim().length === 0) {
    issues.push(issue("publish-source", `${prefix}.dataReference`, "Runtime projection data references require publish-derived ids.", "error", true));
  }

  if (record.dataReference.source === "publish-candidate-reference") {
    issues.push(issue("publish-source", `${prefix}.dataReference.source`, "Runtime projection cannot read raw publish candidates directly; use validated snapshot metadata.", "error", true));
  }

  if (record.rendererInstruction !== null) {
    issues.push(issue("read-model-only", `${prefix}.rendererInstruction`, "Runtime projection records are read-model contracts, not renderer instructions.", "error", true));
  }

  issues.push(...validateSafetyFlags(record.safetyFlags, `${prefix}.safetyFlags`));

  if (record.uiDisplay) {
    issues.push(...validateRuntimeProjectionUiDisplay(record.uiDisplay, `${prefix}.uiDisplay`));
  }

  return dedupeIssues(issues);
}

export function validateRuntimeProjectionUiDisplay(
  display: RuntimeProjectionUiDisplayReference,
  prefix = "uiDisplay"
): readonly RuntimeProjectionValidationIssue[] {
  const issues: RuntimeProjectionValidationIssue[] = [];
  const hasNaturalSize = Number.isFinite(display.naturalWidth) || Number.isFinite(display.naturalHeight);

  if (display.source !== "publish-data") {
    issues.push(issue("ui-display-sizing", `${prefix}.source`, "UI display data must come from validated publish data.", "error", true));
  }

  if (!positiveNumber(display.displayWidth) || !positiveNumber(display.displayHeight)) {
    issues.push(issue("ui-display-sizing", `${prefix}.displaySize`, "Runtime projection requires displayWidth/displayHeight from node/editor/publish data.", "error", true));
  }

  if (!display.scaleMode || !display.anchor || !display.pivot) {
    issues.push(issue("ui-display-sizing", `${prefix}.displayRules`, "Runtime projection requires scaleMode, anchor and pivot from node/editor/publish data.", "error", true));
  }

  if (hasNaturalSize && (!positiveNumber(display.displayWidth) || !positiveNumber(display.displayHeight))) {
    issues.push(issue("ui-display-sizing", `${prefix}.naturalSize`, "Natural source size is metadata only and cannot become display size implicitly.", "warning", false));
  }

  if (display.naturalSizeMetadataOnly !== true) {
    issues.push(issue("ui-display-sizing", `${prefix}.naturalSizeMetadataOnly`, "Natural image dimensions must stay metadata-only.", "error", true));
  }

  return dedupeIssues(issues);
}

export function validateRuntimeProjectionReadModel(
  readModel: RuntimeProjectionReadModel
): RuntimeProjectionValidationResult {
  const issues: RuntimeProjectionValidationIssue[] = [];

  if (readModel.emptyState && (readModel.manifest || readModel.records.length > 0)) {
    issues.push(issue("read-model-only", "readModel.emptyState", "Runtime projection empty state must not include records or manifest data.", "error", true));
  }

  if (readModel.leaksEditorDraftData !== false) {
    issues.push(issue("no-raw-draft-source", "readModel.leaksEditorDraftData", "Runtime read-only routes must not leak editor draft data.", "error", true));
  }

  if (readModel.containsConcreteGameContent !== false) {
    issues.push(issue("no-concrete-gamecontent", "readModel.containsConcreteGameContent", "Runtime projection read models must not contain concrete gamecontent.", "error", true));
  }

  if (readModel.implementsRuntimeRenderer !== false) {
    issues.push(issue("read-model-only", "readModel.implementsRuntimeRenderer", "Runtime projection read models must not implement a runtime renderer.", "error", true));
  }

  if (readModel.manifest) {
    issues.push(...validateRuntimeProjectionManifest(readModel.manifest).issues);
  }

  readModel.records.forEach((record, index) => {
    issues.push(...validateRuntimeProjectionRecord(record, `readModel.records.${index}`));
  });

  return createRuntimeProjectionValidationResult({
    sourceId: readModel.manifest?.source.sourceId ?? "runtime-projection-read-model",
    manifestId: readModel.manifest?.manifestId ?? null,
    issues: dedupeIssues(issues)
  });
}

function validateSourceIdentity(source: RuntimeProjectionSource): readonly RuntimeProjectionValidationIssue[] {
  const issues: RuntimeProjectionValidationIssue[] = [];

  if (source.sourceId.trim().length === 0) {
    issues.push(issue("publish-source", "sourceId", "Runtime projection source requires a data-driven source id.", "error", true));
  }

  if (source.sourceKind !== "publish-snapshot-metadata") {
    issues.push(issue("publish-source", "sourceKind", "Runtime projection source must be publish snapshot metadata.", "error", true));
  }

  return issues;
}

function validatePublishSource(source: RuntimeProjectionSource): readonly RuntimeProjectionValidationIssue[] {
  const issues: RuntimeProjectionValidationIssue[] = [];

  if (!source.snapshot) {
    issues.push(issue("publish-source", "snapshot", "Runtime projection requires Fase 10 publish snapshot metadata.", "error", true));
  } else {
    issues.push(...validatePublishSnapshotMetadata(source.snapshot).map(fromPublishIssue("snapshot")));
  }

  if (!source.publishValidation) {
    issues.push(issue("publish-source", "publishValidation", "Runtime projection requires a publish validation result.", "error", true));
  } else if (!source.publishValidation.publishReady || !source.publishValidation.snapshotAllowed) {
    issues.push(issue("publish-source", "publishValidation.publishReady", "Runtime projection requires publish-ready validation before projection.", "error", true));
  }

  if (!source.usesPublishReadySnapshot) {
    issues.push(issue("publish-source", "usesPublishReadySnapshot", "Runtime projection cannot be created without a publish-ready snapshot boundary.", "error", true));
  }

  source.candidateReferences.forEach((candidate, index) => {
    if (!isAcceptedByPublishFlow(candidate)) {
      issues.push(issue("publish-source", `candidateReferences.${index}`, "Raw draft/candidate references cannot be projected until accepted through publish validation.", "error", true));
    }
  });

  return issues;
}

function validateDraftBoundaries(source: RuntimeProjectionSource): readonly RuntimeProjectionValidationIssue[] {
  const issues: RuntimeProjectionValidationIssue[] = [];

  if (source.readsRawDraftData || source.leaksEditorDraftData) {
    issues.push(issue("no-raw-draft-source", "source", "Runtime projection must not read or leak raw editor draft data.", "error", true));
  }

  if (source.readsProceduralPreviewDirectly || source.readsProceduralBakeDirectly) {
    issues.push(issue("no-procedural-preview-source", "source.procedural", "Procedural preview/bake data must be accepted through publish validation before projection.", "error", true));
  }

  return issues;
}

function validateAcceptedGeneratedReferences(source: RuntimeProjectionSource): readonly RuntimeProjectionValidationIssue[] {
  return source.acceptedGeneratedReferences.flatMap((reference, index) => {
    const issues: RuntimeProjectionValidationIssue[] = [];
    const prefix = `acceptedGeneratedReferences.${index}`;

    if (reference.source !== "publish-validation" || reference.acceptedByPublishValidation !== true) {
      issues.push(issue("publish-source", prefix, "Generated references remain draft/candidate until publish validation accepts them.", "error", true));
    }

    if (reference.reference.publishesRuntimeOutput !== false) {
      issues.push(issue("no-concrete-gamecontent", `${prefix}.publishesRuntimeOutput`, "Generated references must not publish runtime output inside projection contracts.", "error", true));
    }

    return issues;
  });
}

function validateManifestIdentity(manifest: RuntimeProjectionManifest): readonly RuntimeProjectionValidationIssue[] {
  const issues: RuntimeProjectionValidationIssue[] = [];

  if (manifest.manifestId.trim().length === 0) {
    issues.push(issue("publish-source", "manifestId", "Runtime projection manifest requires a data-driven id.", "error", true));
  }

  if (manifest.sourceSnapshotId !== manifest.source.snapshot?.snapshotId) {
    issues.push(issue("publish-source", "sourceSnapshotId", "Runtime projection manifest must point at its source publish snapshot metadata.", "error", true));
  }

  if (manifest.recordCount !== manifest.records.length) {
    issues.push(issue("read-model-only", "recordCount", "Runtime projection manifest recordCount must match its records.", "error", true));
  }

  if (manifest.rendererInstruction !== null) {
    issues.push(issue("read-model-only", "rendererInstruction", "Runtime projection manifests are not renderer instructions.", "error", true));
  }

  return issues;
}

function validateSafetyFlags(
  flags: RuntimeProjectionSafetyFlags,
  prefix = "safetyFlags"
): readonly RuntimeProjectionValidationIssue[] {
  const issues: RuntimeProjectionValidationIssue[] = [];

  if (flags.publishesRuntimeProjection !== true) {
    issues.push(issue("safety-flags", `${prefix}.publishesRuntimeProjection`, "Runtime projection manifests must explicitly publish a projection contract.", "error", true));
  }

  if (flags.implementsRuntimeRenderer !== false) {
    issues.push(issue("read-model-only", `${prefix}.implementsRuntimeRenderer`, "Fase 11 must not implement a runtime renderer.", "error", true));
  }

  if (flags.mutatesAssets || flags.copiesAssetsToGit) {
    issues.push(issue("no-asset-mutation", `${prefix}.assets`, "Runtime projection must not mutate, copy or remove assets.", "error", true));
  }

  if (flags.containsConcreteGameContent || flags.usesHardcodedContent) {
    issues.push(issue("no-concrete-gamecontent", `${prefix}.content`, "Runtime projection must not contain hardcoded world, NPC, quest, economy, camera, lighting, HUD, minimap or audio content.", "error", true));
  }

  if (flags.assignsDefinitiveRuntimeRoles) {
    issues.push(issue("glb-role-candidate", `${prefix}.assignsDefinitiveRuntimeRoles`, "GLB roles remain candidate/editor-data until explicit publish data assigns them.", "error", true));
  }

  if (flags.leaksEditorDraftData) {
    issues.push(issue("no-raw-draft-source", `${prefix}.leaksEditorDraftData`, "Runtime projection must not leak editor draft data.", "error", true));
  }

  return issues;
}

function isAcceptedByPublishFlow(candidate: PublishCandidateReference): boolean {
  return (candidate as { readonly acceptedByPublishFlow?: boolean }).acceptedByPublishFlow === true;
}

function fromPublishIssue(prefix: string): (candidate: PublishValidationIssue) => RuntimeProjectionValidationIssue {
  return (candidate) => issue(
    "publish-source",
    `${prefix}.${candidate.path}`,
    candidate.message,
    candidate.severity,
    candidate.severity === "error"
  );
}

function positiveNumber(value: number | null): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function issue(
  gate: RuntimeProjectionValidationGate,
  path: string,
  message: string,
  severity: RuntimeProjectionValidationIssue["severity"],
  blocksRuntimeProjection: boolean
): RuntimeProjectionValidationIssue {
  return { gate, path, message, severity, blocksRuntimeProjection };
}

function dedupeIssues(
  issues: readonly RuntimeProjectionValidationIssue[]
): readonly RuntimeProjectionValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((candidate) => {
    const key = `${candidate.gate}:${candidate.path}:${candidate.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export { RUNTIME_PROJECTION_VALIDATION_GATES };
