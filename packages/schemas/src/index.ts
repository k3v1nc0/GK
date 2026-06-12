export type SchemaId = string;

export type ValidationSeverity = "warning" | "error";

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly severity: ValidationSeverity;
}

export interface Validator<TInput> {
  validate(input: TInput): readonly ValidationIssue[];
}

export interface PublishedNodeEnvelope {
  readonly schemaId: SchemaId;
  readonly nodeType: string;
  readonly version: number;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface AssetReference {
  readonly source: "asset-library";
  readonly assetId: string;
}

export const SCHEMA_PACKAGE_SCOPE = [
  "published-node-envelope",
  "asset-reference",
  "validation-issue",
  "node-graph",
  "entity-components",
  "procedural-generation"
] as const;

export * from "./auth.js";
export * from "./entity-components.js";
export * from "./entity-validation.js";
export * from "./node-graph.js";
export * from "./procedural-generation.js";
export * from "./procedural-validation.js";
