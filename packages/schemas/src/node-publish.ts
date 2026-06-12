import type { EditorGraphDocument, GraphValidationIssue } from "./node-graph.js";

export interface PublishedNodeEnvelope {
  readonly id: string;
  readonly nodeType: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly source: "editor-node-data";
  readonly graph?: EditorGraphDocument;
  readonly validationIssues: readonly GraphValidationIssue[];
  readonly publishesRuntimeOutput: false;
}
