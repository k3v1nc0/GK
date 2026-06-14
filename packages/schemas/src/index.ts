export * from "./node-graph.js";
export * from "./entity-components.js";
export * from "./entity-validation.js";
export * from "./procedural-generation.js";
export * from "./procedural-validation.js";
export * from "./world-camera-minimap.js";
export * from "./world-camera-minimap-validation.js";
export * from "./publish-flow.js";
export * from "./publish-flow-validation.js";
export * from "./runtime-projection.js";
export * from "./runtime-projection-validation.js";
export * from "./runtime-client-shell.js";
export * from "./runtime-client-shell-validation.js";
export * from "./runtime-render-surface.js";
export * from "./runtime-render-surface-validation.js";
export * from "./runtime-scene-assembly.js";
export * from "./runtime-scene-assembly-validation.js";
export * from "./runtime-asset-reference-planning.js";
export * from "./runtime-asset-reference-planning-validation.js";
export * from "./runtime-game-core.js";
export * from "./runtime-game-core-validation.js";
export * from "./node-publish.js";

export const SCHEMA_PACKAGE_SCOPE = [
  "node-graph",
  "entity-components",
  "entity-validation",
  "procedural-generation",
  "procedural-validation",
  "world-camera-minimap",
  "world-camera-minimap-validation",
  "publish-flow",
  "publish-flow-validation",
  "runtime-projection",
  "runtime-projection-validation",
  "runtime-client-shell",
  "runtime-client-shell-validation",
  "runtime-render-surface",
  "runtime-render-surface-validation",
  "runtime-scene-assembly",
  "runtime-scene-assembly-validation",
  "runtime-asset-reference-planning",
  "runtime-asset-reference-planning-validation",
  "runtime-game-core",
  "runtime-game-core-validation",
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
