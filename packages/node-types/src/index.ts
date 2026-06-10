import type { Validator } from "@gk/schemas";

export type NodeCapabilityScope =
  | "engine-capability"
  | "editor-data"
  | "publish-boundary"
  | "runtime-consumer";

export interface NodeTypeDefinition<TConfig extends Record<string, unknown> = Record<string, unknown>> {
  readonly type: string;
  readonly version: number;
  readonly scope: NodeCapabilityScope;
  readonly validate: Validator<TConfig>;
}

export interface NodeTypeRegistrySnapshot {
  readonly nodeTypes: readonly string[];
}

export const RESERVED_NODE_TYPE_PREFIX = "gk.";

