export * from "./asset-library.js";
export * from "./auth.js";
export * from "./database.js";
export * from "./entity-components.js";
export * from "./editor-shell.js";
export * from "./gamebible-node.js";
export * from "./node-graph.js";
export * from "./node-publish.js";
export * from "./procedural-generation.js";
export * from "./procedural-random.js";
export * from "./procedural-validation.js";
export * from "./world-camera-minimap.js";
export * from "./world-camera-minimap-validation.js";

export const SCHEMA_PACKAGE_SCOPE = [
  "asset-library",
  "auth",
  "database",
  "entity-components",
  "editor-shell",
  "gamebible-node",
  "node-graph",
  "node-publish",
  "procedural-generation",
  "world-camera-minimap"
] as const;

export type SchemaPackageScope = (typeof SCHEMA_PACKAGE_SCOPE)[number];

export interface PackageBoundaryContract {
  readonly name: "@gk/schemas";
  readonly allowedImports: readonly [
    "typescript-runtime",
    "standard-library"
  ];
  readonly exportsOnlyContracts: true;
}

export const schemaPackageBoundary: PackageBoundaryContract = {
  name: "@gk/schemas",
  allowedImports: [
    "typescript-runtime",
    "standard-library"
  ],
  exportsOnlyContracts: true
};
