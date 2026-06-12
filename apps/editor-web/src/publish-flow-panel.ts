import type {
  PublishCandidateReference,
  PublishSnapshotMetadata,
  PublishValidationIssue,
  PublishValidationResult,
  PublishSnapshotCandidateSummary
} from "@gk/schemas";
import type { EditorPanelDescriptor } from "@gk/shared-ui";

export type PublishFlowPanelId = "publish-flow-panel";

export interface PublishFlowPanelState {
  readonly panelId: PublishFlowPanelId;
  readonly status: "git-basis" | "needs-server-validation" | "validated";
  readonly serverSideValidated: false;
  readonly candidateSummary: PublishSnapshotCandidateSummary;
  readonly candidateReferences: readonly PublishCandidateReference[];
  readonly validation: PublishValidationResult | null;
  readonly validationIssues: readonly PublishValidationIssue[];
  readonly snapshots: readonly PublishSnapshotMetadata[];
  readonly selectedSnapshot: PublishSnapshotMetadata | null;
  readonly snapshotMetadataOnly: true;
  readonly runtimePublishEnabled: false;
  readonly automaticPublishEnabled: false;
  readonly modifiesAssets: false;
  readonly acceptsConcreteGameContent: false;
  readonly inventedContent: readonly never[];
}

export const PUBLISH_FLOW_PANEL_DEFINITION: EditorPanelDescriptor = {
  id: "publish-flow-panel",
  title: "Publish Flow",
  region: "dock",
  capability: "publish-flow-validation-snapshot-metadata",
  requiresEditorSession: true,
  requiresEditorAdmin: true,
  acceptsConcreteGameContent: false
};

export function createPublishFlowPanelState(options: {
  readonly status?: PublishFlowPanelState["status"];
  readonly candidateSummary?: PublishSnapshotCandidateSummary;
  readonly candidateReferences?: readonly PublishCandidateReference[];
  readonly validation?: PublishValidationResult | null;
  readonly snapshots?: readonly PublishSnapshotMetadata[];
  readonly selectedSnapshot?: PublishSnapshotMetadata | null;
} = {}): PublishFlowPanelState {
  return {
    panelId: "publish-flow-panel",
    status: options.status ?? "git-basis",
    serverSideValidated: false,
    candidateSummary: options.candidateSummary ?? emptyCandidateSummary(),
    candidateReferences: options.candidateReferences ?? [],
    validation: options.validation ?? null,
    validationIssues: options.validation?.issues ?? [],
    snapshots: options.snapshots ?? [],
    selectedSnapshot: options.selectedSnapshot ?? null,
    snapshotMetadataOnly: true,
    runtimePublishEnabled: false,
    automaticPublishEnabled: false,
    modifiesAssets: false,
    acceptsConcreteGameContent: false,
    inventedContent: []
  };
}

function emptyCandidateSummary(): PublishSnapshotCandidateSummary {
  return {
    total: 0,
    nodeGraph: 0,
    assetCandidates: 0,
    audioCandidates: 0,
    entityDrafts: 0,
    proceduralGeneratedDrafts: 0,
    worldDrafts: 0,
    uiDisplayDrafts: 0
  };
}
