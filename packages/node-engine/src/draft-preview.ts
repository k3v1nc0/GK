import type {
  DraftPreviewResult,
  EditorGraphDocument,
  GraphAssetInventoryGate
} from "@gk/schemas";
import type { GraphNodeTypeDefinition } from "@gk/node-types";

import { validateGraphDocument } from "./graph-validation.js";

export interface DraftPreviewOptions {
  readonly inventory?: GraphAssetInventoryGate;
}

export function createDraftPreview(
  graph: EditorGraphDocument,
  definitions: readonly GraphNodeTypeDefinition[],
  options: DraftPreviewOptions = {}
): DraftPreviewResult {
  const issues = validateGraphDocument(graph, definitions, options);

  return {
    mode: "draft-preview",
    publishesRuntimeOutput: false,
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
    graphRevision: graph.revision
  };
}
