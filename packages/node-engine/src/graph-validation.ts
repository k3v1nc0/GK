import type {
  EditorGraphDocument,
  EditorGraphEdge,
  EditorGraphNode,
  GraphAssetInventoryGate,
  GraphValidationIssue,
  NodeFieldDefinition,
  NodeFieldValue,
  NodeSocketDefinition
} from "@gk/schemas";
import type { GraphNodeTypeDefinition } from "@gk/node-types";

export interface GraphValidationOptions {
  readonly inventory?: GraphAssetInventoryGate;
}

export function validateGraphDocument(
  graph: EditorGraphDocument,
  definitions: readonly GraphNodeTypeDefinition[],
  options: GraphValidationOptions = {}
): readonly GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const nodeIds = new Set<string>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push(error(`nodes.${node.id}`, "Node id must be unique."));
    }
    nodeIds.add(node.id);
    issues.push(...validateGraphNode(node, definitions, options));
  }

  for (const edge of graph.edges) {
    issues.push(...validateGraphEdge(graph, edge, definitions));
  }

  return issues;
}

export function validateGraphNode(
  node: EditorGraphNode,
  definitions: readonly GraphNodeTypeDefinition[],
  options: GraphValidationOptions = {}
): readonly GraphValidationIssue[] {
  const definition = definitions.find((candidate) => candidate.type === node.type);

  if (!definition) {
    return [error(`nodes.${node.id}.type`, `Unknown graph node type: ${node.type}.`)];
  }

  return definition.fields.flatMap((field) =>
    validateFieldValue(`nodes.${node.id}.fields.${field.id}`, field, node.fields[field.id] ?? null, options)
  );
}

export function validateGraphEdge(
  graph: EditorGraphDocument,
  edge: EditorGraphEdge,
  definitions: readonly GraphNodeTypeDefinition[]
): readonly GraphValidationIssue[] {
  const sourceNode = graph.nodes.find((node) => node.id === edge.source.nodeId);
  const targetNode = graph.nodes.find((node) => node.id === edge.target.nodeId);

  if (!sourceNode || !targetNode) {
    return [error(`edges.${edge.id}`, "Edge endpoints must reference existing nodes.")];
  }

  const sourceSocket = findSocket(sourceNode, edge.source.socketId, definitions);
  const targetSocket = findSocket(targetNode, edge.target.socketId, definitions);

  if (!sourceSocket || !targetSocket) {
    return [error(`edges.${edge.id}`, "Edge endpoints must reference existing sockets.")];
  }

  if (sourceSocket.direction !== "output" || targetSocket.direction !== "input") {
    return [error(`edges.${edge.id}`, "Edges must connect an output socket to an input socket.")];
  }

  if (sourceSocket.kind !== targetSocket.kind) {
    return [error(`edges.${edge.id}`, "Flow sockets can only connect to flow sockets and value sockets to values.")];
  }

  if (sourceSocket.kind === "value" && sourceSocket.valueType !== targetSocket.valueType) {
    return [error(`edges.${edge.id}`, `Value socket type mismatch: ${sourceSocket.valueType ?? "unknown"} -> ${targetSocket.valueType ?? "unknown"}.`)];
  }

  if (exceedsTargetConnectionLimit(graph, edge, targetSocket)) {
    return [error(`edges.${edge.id}`, "Target socket has reached its maximum connection count.")];
  }

  return [];
}

function validateFieldValue(
  path: string,
  field: NodeFieldDefinition,
  value: NodeFieldValue,
  options: GraphValidationOptions
): readonly GraphValidationIssue[] {
  if (field.required && (value === null || value === "")) {
    return [error(path, "Required field is missing.")];
  }

  if (value === null || value === "") {
    return [];
  }

  if (field.kind === "text" && typeof value !== "string") {
    return [error(path, "Text field requires a string value.")];
  }

  if (field.kind === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
    return [error(path, "Number field requires a finite number.")];
  }

  if (field.kind === "color" && (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value))) {
    return [error(path, "Color field requires a #RRGGBB value.")];
  }

  if (field.kind === "dropdown") {
    const allowed = field.options?.some((option) => option.value === value) ?? false;
    return typeof value === "string" && allowed ? [] : [error(path, "Dropdown value must match one of the field options.")];
  }

  if (field.kind === "asset-picker") {
    return isAssetReference(value) ? [] : [error(path, "Asset picker requires an asset-library reference.")];
  }

  if (field.kind === "audio-picker") {
    if ((options.inventory?.audioCount ?? 0) === 0) {
      return [error(path, "Audio picker is gated because the audio asset count is 0.")];
    }

    return isAudioReference(value) ? [] : [error(path, "Audio picker requires an audio-library reference.")];
  }

  return [];
}

function findSocket(
  node: EditorGraphNode,
  socketId: string,
  definitions: readonly GraphNodeTypeDefinition[]
): NodeSocketDefinition | undefined {
  return definitions
    .find((definition) => definition.type === node.type)
    ?.sockets.find((socket) => socket.id === socketId);
}

function exceedsTargetConnectionLimit(
  graph: EditorGraphDocument,
  edge: EditorGraphEdge,
  targetSocket: NodeSocketDefinition
): boolean {
  if (!targetSocket.maxConnections) {
    return false;
  }

  return graph.edges
    .filter((candidate) => candidate.id !== edge.id)
    .filter((candidate) => candidate.target.nodeId === edge.target.nodeId && candidate.target.socketId === edge.target.socketId)
    .length >= targetSocket.maxConnections;
}

function isAssetReference(value: NodeFieldValue): boolean {
  const candidate = value as { readonly source?: unknown; readonly assetId?: unknown } | null;
  return Boolean(candidate && candidate.source === "asset-library" && typeof candidate.assetId === "string");
}

function isAudioReference(value: NodeFieldValue): boolean {
  const candidate = value as { readonly source?: unknown; readonly audioId?: unknown } | null;
  return Boolean(candidate && candidate.source === "audio-library" && typeof candidate.audioId === "string");
}

function error(path: string, message: string): GraphValidationIssue {
  return { path, message, severity: "error" };
}
