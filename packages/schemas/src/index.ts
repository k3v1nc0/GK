export * from "./node-graph.js";
export * from "./entity-components.js";
export * from "./entity-validation.js";
export * from "./procedural-generation.js";
export * from "./procedural-validation.js";
export * from "./world-camera-minimap.js";
export * from "./world-camera-minimap-validation.js";
export * from "./node-publish.js";

export const SCHEMA_PACKAGE_SCOPE = [
  "node-graph",
  "entity-components",
  "entity-validation",
  "procedural-generation",
  "procedural-validation",
  "world-camera-minimap",
  "world-camera-minimap-validation",
  "node-publish"
] as const;

export type SchemaPackageScope = (typeof SCHEMA_PACKAGE_SCOPE)[number];

export interface SchemaPackageBoundary {
  readonly scope: SchemaPackageScope;
  readonly publishesRuntimeOutput: false;
  readonly acceptsConcreteRuntimeContent: false;
}

export function schemaPackageBoundary(scope: SchemaPackageScope): SchemaPackageBoundary {
  return {
    scope,
    publishesRuntimeOutput: false,
    acceptsConcreteRuntimeContent: false
  };
}
