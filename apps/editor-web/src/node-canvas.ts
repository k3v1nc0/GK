import {
  EDITOR_GRAPH_HISTORY_DEPTH,
  NODE_VALUE_SOCKET_TYPES,
  type EditorGraphDocument
} from "@gk/schemas";

export type NodeCanvasTool = "select" | "pan" | "connect";

export interface NodeCanvasGrid {
  readonly enabled: true;
  readonly unit: 24;
}

export interface NodeCanvasViewportState {
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
}

export interface NodeCapabilityDefinition {
  readonly id: string;
  readonly title: string;
  readonly capability: "schema" | "asset-reference" | "validation" | "publish";
  readonly createsConcreteGameContent: false;
}

export interface NodeCanvasState {
  readonly id: "node-canvas";
  readonly title: "Node Canvas";
  readonly grid: NodeCanvasGrid;
  readonly viewport: NodeCanvasViewportState;
  readonly activeTool: NodeCanvasTool;
  readonly graph: EditorGraphDocument;
  readonly selectedNodeId: null;
  readonly supportedValueSocketTypes: typeof NODE_VALUE_SOCKET_TYPES;
  readonly historyDepth: typeof EDITOR_GRAPH_HISTORY_DEPTH;
  readonly draftPreviewPublishesRuntimeOutput: false;
  readonly acceptsConcreteGameContent: false;
  readonly capabilityDefinitions: readonly NodeCapabilityDefinition[];
}

export const NODE_CANVAS_CAPABILITIES: readonly NodeCapabilityDefinition[] = [
  {
    id: "schema-contract",
    title: "Schema Contract",
    capability: "schema",
    createsConcreteGameContent: false
  },
  {
    id: "asset-reference",
    title: "Asset Reference",
    capability: "asset-reference",
    createsConcreteGameContent: false
  },
  {
    id: "validation-rule",
    title: "Validation Rule",
    capability: "validation",
    createsConcreteGameContent: false
  },
  {
    id: "publish-gate",
    title: "Publish Gate",
    capability: "publish",
    createsConcreteGameContent: false
  }
] as const;

export function createEmptyNodeCanvasState(): NodeCanvasState {
  return {
    id: "node-canvas",
    title: "Node Canvas",
    grid: {
      enabled: true,
      unit: 24
    },
    viewport: {
      panX: 0,
      panY: 0,
      zoom: 1
    },
    activeTool: "select",
    graph: {
      id: "editor-draft",
      nodes: [],
      edges: [],
      revision: 0
    },
    selectedNodeId: null,
    supportedValueSocketTypes: NODE_VALUE_SOCKET_TYPES,
    historyDepth: EDITOR_GRAPH_HISTORY_DEPTH,
    draftPreviewPublishesRuntimeOutput: false,
    acceptsConcreteGameContent: false,
    capabilityDefinitions: NODE_CANVAS_CAPABILITIES
  };
}
