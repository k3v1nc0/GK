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
  "validation-issue"
] as const;

