import type {
  NodeFieldDefinition,
  NodeSocketDefinition,
  Validator
} from "@gk/schemas";

import { ENTITY_COMPONENT_GRAPH_NODE_TYPES } from "./entity-component-nodes.js";
import { PROCEDURAL_GENERATION_GRAPH_NODE_TYPES } from "./procedural-generation-nodes.js";
import { PUBLISH_FLOW_GRAPH_NODE_TYPES } from "./publish-flow-nodes.js";
import { RUNTIME_ASSET_REFERENCE_PLANNING_GRAPH_NODE_TYPES } from "./runtime-asset-reference-planning-nodes.js";
import { RUNTIME_CLIENT_SHELL_GRAPH_NODE_TYPES } from "./runtime-client-shell-nodes.js";
import { RUNTIME_GAME_CORE_GRAPH_NODE_TYPES } from "./runtime-game-core-nodes.js";
import { RUNTIME_PROJECTION_GRAPH_NODE_TYPES } from "./runtime-projection-nodes.js";
import { RUNTIME_QUEST_SLICE_GRAPH_NODE_TYPES } from "./runtime-quest-slice-nodes.js";
import { RUNTIME_RENDER_SURFACE_GRAPH_NODE_TYPES } from "./runtime-render-surface-nodes.js";
import { RUNTIME_SCENE_ASSEMBLY_GRAPH_NODE_TYPES } from "./runtime-scene-assembly-nodes.js";
import { WORLD_CAMERA_MINIMAP_GRAPH_NODE_TYPES } from "./world-camera-minimap-nodes.js";

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

export interface GraphNodeTypeDefinition<TConfig extends Record<string, unknown> = Record<string, unknown>>
  extends NodeTypeDefinition<TConfig> {
  readonly title: string;
  readonly sockets: readonly NodeSocketDefinition[];
  readonly fields: readonly NodeFieldDefinition[];
  readonly createsConcreteGameContent: false;
}

export interface NodeTypeRegistrySnapshot {
  readonly nodeTypes: readonly string[];
}

export const RESERVED_NODE_TYPE_PREFIX = "gk.";

const permissiveValidator: Validator<Record<string, unknown>> = {
  validate: () => []
};

export const CORE_GRAPH_NODE_TYPES: readonly GraphNodeTypeDefinition[] = [
  {
    type: "gk.flow.entry",
    title: "Flow Entry",
    version: 1,
    scope: "engine-capability",
    sockets: [
      { id: "flow", label: "Flow", direction: "output", kind: "flow" }
    ],
    fields: [],
    validate: permissiveValidator,
    createsConcreteGameContent: false
  },
  {
    type: "gk.flow.sequence",
    title: "Flow Sequence",
    version: 1,
    scope: "engine-capability",
    sockets: [
      { id: "in", label: "In", direction: "input", kind: "flow", maxConnections: 1 },
      { id: "first", label: "First", direction: "output", kind: "flow" },
      { id: "second", label: "Second", direction: "output", kind: "flow" }
    ],
    fields: [],
    validate: permissiveValidator,
    createsConcreteGameContent: false
  },
  {
    type: "gk.value.string",
    title: "String Value",
    version: 1,
    scope: "engine-capability",
    sockets: [
      { id: "value", label: "Value", direction: "output", kind: "value", valueType: "var.string" }
    ],
    fields: [
      { id: "value", label: "Value", kind: "text", required: false }
    ],
    validate: permissiveValidator,
    createsConcreteGameContent: false
  },
  {
    type: "gk.value.number",
    title: "Number Value",
    version: 1,
    scope: "engine-capability",
    sockets: [
      { id: "value", label: "Value", direction: "output", kind: "value", valueType: "number" }
    ],
    fields: [
      { id: "value", label: "Value", kind: "number", required: false }
    ],
    validate: permissiveValidator,
    createsConcreteGameContent: false
  },
  {
    type: "gk.value.color",
    title: "Color Value",
    version: 1,
    scope: "engine-capability",
    sockets: [
      { id: "value", label: "Value", direction: "output", kind: "value", valueType: "color" }
    ],
    fields: [
      { id: "value", label: "Value", kind: "color", required: false }
    ],
    validate: permissiveValidator,
    createsConcreteGameContent: false
  },
  {
    type: "gk.asset.reference",
    title: "Asset Reference",
    version: 1,
    scope: "engine-capability",
    sockets: [
      { id: "asset", label: "Asset", direction: "output", kind: "value", valueType: "asset.reference" }
    ],
    fields: [
      { id: "asset", label: "Asset", kind: "asset-picker", required: false }
    ],
    validate: permissiveValidator,
    createsConcreteGameContent: false
  },
  {
    type: "gk.audio.reference",
    title: "Audio Reference",
    version: 1,
    scope: "engine-capability",
    sockets: [
      { id: "audio", label: "Audio", direction: "output", kind: "value", valueType: "audio.reference" }
    ],
    fields: [
      { id: "audio", label: "Audio", kind: "audio-picker", required: false }
    ],
    validate: permissiveValidator,
    createsConcreteGameContent: false
  },
  {
    type: "gk.editor.collect",
    title: "Editor Collector",
    version: 1,
    scope: "editor-data",
    sockets: [
      { id: "flowIn", label: "Flow In", direction: "input", kind: "flow", maxConnections: 1 },
      { id: "label", label: "Label", direction: "input", kind: "value", valueType: "var.string", maxConnections: 1 },
      { id: "amount", label: "Amount", direction: "input", kind: "value", valueType: "number", maxConnections: 1 },
      { id: "tint", label: "Tint", direction: "input", kind: "value", valueType: "color", maxConnections: 1 },
      { id: "asset", label: "Asset", direction: "input", kind: "value", valueType: "asset.reference", maxConnections: 1 },
      { id: "flowOut", label: "Flow Out", direction: "output", kind: "flow" }
    ],
    fields: [
      {
        id: "mode",
        label: "Mode",
        kind: "dropdown",
        required: true,
        options: [
          { value: "draft", label: "Draft" },
          { value: "preview", label: "Preview" }
        ]
      },
      { id: "note", label: "Note", kind: "text", required: false }
    ],
    validate: permissiveValidator,
    createsConcreteGameContent: false
  },
  ...ENTITY_COMPONENT_GRAPH_NODE_TYPES,
  ...PROCEDURAL_GENERATION_GRAPH_NODE_TYPES,
  ...WORLD_CAMERA_MINIMAP_GRAPH_NODE_TYPES,
  ...PUBLISH_FLOW_GRAPH_NODE_TYPES,
  ...RUNTIME_PROJECTION_GRAPH_NODE_TYPES,
  ...RUNTIME_CLIENT_SHELL_GRAPH_NODE_TYPES,
  ...RUNTIME_RENDER_SURFACE_GRAPH_NODE_TYPES,
  ...RUNTIME_SCENE_ASSEMBLY_GRAPH_NODE_TYPES,
  ...RUNTIME_ASSET_REFERENCE_PLANNING_GRAPH_NODE_TYPES,
  ...RUNTIME_GAME_CORE_GRAPH_NODE_TYPES,
  ...RUNTIME_QUEST_SLICE_GRAPH_NODE_TYPES
] as const;

export function getCoreGraphNodeTypes(): readonly GraphNodeTypeDefinition[] {
  return CORE_GRAPH_NODE_TYPES;
}

export { ENTITY_COMPONENT_GRAPH_NODE_TYPES } from "./entity-component-nodes.js";
export { PROCEDURAL_GENERATION_GRAPH_NODE_TYPES } from "./procedural-generation-nodes.js";
export { WORLD_CAMERA_MINIMAP_GRAPH_NODE_TYPES } from "./world-camera-minimap-nodes.js";
export { PUBLISH_FLOW_GRAPH_NODE_TYPES } from "./publish-flow-nodes.js";
export { RUNTIME_PROJECTION_GRAPH_NODE_TYPES } from "./runtime-projection-nodes.js";
export { RUNTIME_CLIENT_SHELL_GRAPH_NODE_TYPES } from "./runtime-client-shell-nodes.js";
export { RUNTIME_RENDER_SURFACE_GRAPH_NODE_TYPES } from "./runtime-render-surface-nodes.js";
export { RUNTIME_SCENE_ASSEMBLY_GRAPH_NODE_TYPES } from "./runtime-scene-assembly-nodes.js";
export { RUNTIME_ASSET_REFERENCE_PLANNING_GRAPH_NODE_TYPES } from "./runtime-asset-reference-planning-nodes.js";
export { RUNTIME_GAME_CORE_GRAPH_NODE_TYPES } from "./runtime-game-core-nodes.js";
export { RUNTIME_QUEST_SLICE_GRAPH_NODE_TYPES } from "./runtime-quest-slice-nodes.js";
