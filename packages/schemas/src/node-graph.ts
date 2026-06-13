export const EDITOR_GRAPH_HISTORY_DEPTH = 100 as const;

export const NODE_VALUE_SOCKET_TYPES = [
  "var.string",
  "number",
  "color",
  "asset.reference",
  "audio.reference",
  "entity.reference",
  "component.reference",
  "entity.group.reference",
  "procedural.seed.reference",
  "procedural.graph.reference",
  "generation.output.reference",
  "generated.entity.draft.reference",
  "generated.group.draft.reference",
  "generated.zone.candidate.reference",
  "generated.placement.candidate.reference",
  "generated.spawn-area.candidate.reference",
  "generated.path-network.candidate.reference",
  "generated.resource-distribution.candidate.reference",
  "world.settings.reference",
  "world.level.reference",
  "world.zone.reference",
  "world.spawnpoint.reference",
  "camera.reference",
  "lighting.reference",
  "minimap.view.reference",
  "minimap.layer.reference",
  "minimap.marker.reference",
  "ui.asset-display.reference",
  "publish.candidate.reference",
  "publish.validation.reference",
  "publish.snapshot.reference",
  "runtime.projection.source.reference",
  "runtime.projection.validation.reference",
  "runtime.projection.manifest.reference",
  "runtime.projection.read-model.reference",
  "runtime.projection.audit.reference",
  "runtime.client.shell.reference",
  "runtime.client.boot-state.reference",
  "runtime.client.projection-state.reference",
  "runtime.client.safety.reference",
  "runtime.render.surface.reference",
  "runtime.render.status.reference",
  "runtime.render.capability.reference",
  "runtime.render.lifecycle.reference",
  "runtime.render.safety.reference"
] as const;

export type NodeValueSocketType = (typeof NODE_VALUE_SOCKET_TYPES)[number];
export type NodeSocketKind = "flow" | "value";
export type NodeSocketDirection = "input" | "output";

export interface AudioReference {
  readonly source: "audio-library";
  readonly audioId: string;
}

export interface NodeAssetReference {
  readonly source: "asset-library";
  readonly assetId: string;
}

export interface NodeSocketDefinition {
  readonly id: string;
  readonly label: string;
  readonly direction: NodeSocketDirection;
  readonly kind: NodeSocketKind;
  readonly valueType?: NodeValueSocketType;
  readonly maxConnections?: number;
}

export type NodeFieldKind =
  | "text"
  | "number"
  | "color"
  | "dropdown"
  | "asset-picker"
  | "audio-picker";

export interface NodeDropdownOption {
  readonly value: string;
  readonly label: string;
}

export interface NodeFieldDefinition {
  readonly id: string;
  readonly label: string;
  readonly kind: NodeFieldKind;
  readonly required: boolean;
  readonly options?: readonly NodeDropdownOption[];
}

export type NodeFieldValue =
  | string
  | number
  | NodeAssetReference
  | AudioReference
  | null;

export interface EditorGraphNode {
  readonly id: string;
  readonly type: string;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
  readonly fields: Readonly<Record<string, NodeFieldValue>>;
}

export interface EditorGraphEndpoint {
  readonly nodeId: string;
  readonly socketId: string;
}

export interface EditorGraphEdge {
  readonly id: string;
  readonly source: EditorGraphEndpoint;
  readonly target: EditorGraphEndpoint;
}

export interface EditorGraphDocument {
  readonly id: string;
  readonly nodes: readonly EditorGraphNode[];
  readonly edges: readonly EditorGraphEdge[];
  readonly revision: number;
}

export type EditorGraphOperation =
  | { readonly type: "add_node"; readonly node: EditorGraphNode }
  | { readonly type: "remove_node"; readonly nodeId: string }
  | { readonly type: "move_node"; readonly nodeId: string; readonly position: EditorGraphNode["position"] }
  | { readonly type: "update_field"; readonly nodeId: string; readonly fieldId: string; readonly value: NodeFieldValue }
  | { readonly type: "connect_sockets"; readonly edge: EditorGraphEdge }
  | { readonly type: "disconnect_sockets"; readonly edgeId: string }
  | { readonly type: "select_node"; readonly nodeId: string | null }
  | { readonly type: "select_edge"; readonly edgeId: string | null };

export interface EditorGraphOperationLogEntry {
  readonly index: number;
  readonly operationType: EditorGraphOperation["type"];
  readonly undoable: boolean;
  readonly createdAt: string;
}

export interface EditorGraphHistoryState {
  readonly past: readonly EditorGraphDocument[];
  readonly future: readonly EditorGraphDocument[];
  readonly maxDepth: typeof EDITOR_GRAPH_HISTORY_DEPTH;
}

export interface EditorGraphSessionState {
  readonly draft: EditorGraphDocument;
  readonly selectedNodeId: string | null;
  readonly selectedEdgeId: string | null;
  readonly history: EditorGraphHistoryState;
  readonly operationLog: readonly EditorGraphOperationLogEntry[];
}

export interface GraphAssetInventoryGate {
  readonly glbCount: number;
  readonly uiImageCount: number;
  readonly audioCount: number;
}

export interface GraphValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly severity: "warning" | "error";
}

export type ValidationIssue = GraphValidationIssue;

export interface Validator<TConfig extends Record<string, unknown> = Record<string, unknown>> {
  validate(config: TConfig): readonly ValidationIssue[];
}

export interface DraftPreviewResult {
  readonly mode: "draft-preview";
  readonly publishesRuntimeOutput: false;
  readonly valid: boolean;
  readonly issues: readonly GraphValidationIssue[];
  readonly graphRevision: number;
}
