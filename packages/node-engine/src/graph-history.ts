import {
  EDITOR_GRAPH_HISTORY_DEPTH,
  type EditorGraphDocument,
  type EditorGraphOperation,
  type EditorGraphOperationLogEntry,
  type EditorGraphSessionState,
  type GraphValidationIssue
} from "@gk/schemas";
import type { GraphNodeTypeDefinition } from "@gk/node-types";

import { validateGraphEdge } from "./graph-validation.js";

export interface GraphOperationResult {
  readonly state: EditorGraphSessionState;
  readonly issues: readonly GraphValidationIssue[];
}

export function createEmptyGraphDocument(id = "editor-draft"): EditorGraphDocument {
  return {
    id,
    nodes: [],
    edges: [],
    revision: 0
  };
}

export function createEditorGraphSession(
  draft: EditorGraphDocument = createEmptyGraphDocument()
): EditorGraphSessionState {
  return {
    draft,
    selectedNodeId: null,
    selectedEdgeId: null,
    history: {
      past: [],
      future: [],
      maxDepth: EDITOR_GRAPH_HISTORY_DEPTH
    },
    operationLog: []
  };
}

export function applyGraphOperation(
  state: EditorGraphSessionState,
  operation: EditorGraphOperation,
  definitions: readonly GraphNodeTypeDefinition[],
  now = new Date()
): GraphOperationResult {
  const nextDraft = applyDraftMutation(state.draft, operation);

  if (operation.type === "connect_sockets") {
    const edgeIssues = validateGraphEdge(nextDraft, operation.edge, definitions);
    if (edgeIssues.length > 0) {
      return { state: appendOperationLog(state, operation, false, now), issues: edgeIssues };
    }
  }

  const undoable = isUndoable(operation);
  const nextState = {
    ...state,
    draft: nextDraft,
    selectedNodeId: operation.type === "select_node" ? operation.nodeId : state.selectedNodeId,
    selectedEdgeId: operation.type === "select_edge" ? operation.edgeId : state.selectedEdgeId,
    history: undoable
      ? {
          past: [...state.history.past, cloneGraph(state.draft)].slice(-state.history.maxDepth),
          future: [],
          maxDepth: state.history.maxDepth
        }
      : state.history,
    operationLog: createOperationLog(state.operationLog, operation, undoable, now)
  };

  return { state: nextState, issues: [] };
}

export function undoGraphOperation(state: EditorGraphSessionState): EditorGraphSessionState {
  const previous = state.history.past.at(-1);

  if (!previous) {
    return state;
  }

  return {
    ...state,
    draft: previous,
    selectedNodeId: null,
    selectedEdgeId: null,
    history: {
      past: state.history.past.slice(0, -1),
      future: [cloneGraph(state.draft), ...state.history.future].slice(0, state.history.maxDepth),
      maxDepth: state.history.maxDepth
    }
  };
}

export function redoGraphOperation(state: EditorGraphSessionState): EditorGraphSessionState {
  const next = state.history.future[0];

  if (!next) {
    return state;
  }

  return {
    ...state,
    draft: next,
    selectedNodeId: null,
    selectedEdgeId: null,
    history: {
      past: [...state.history.past, cloneGraph(state.draft)].slice(-state.history.maxDepth),
      future: state.history.future.slice(1),
      maxDepth: state.history.maxDepth
    }
  };
}

function applyDraftMutation(
  draft: EditorGraphDocument,
  operation: EditorGraphOperation
): EditorGraphDocument {
  switch (operation.type) {
    case "add_node":
      return { ...draft, nodes: [...draft.nodes, operation.node], revision: draft.revision + 1 };
    case "remove_node":
      return {
        ...draft,
        nodes: draft.nodes.filter((node) => node.id !== operation.nodeId),
        edges: draft.edges.filter((edge) => edge.source.nodeId !== operation.nodeId && edge.target.nodeId !== operation.nodeId),
        revision: draft.revision + 1
      };
    case "move_node":
      return {
        ...draft,
        nodes: draft.nodes.map((node) => node.id === operation.nodeId ? { ...node, position: operation.position } : node),
        revision: draft.revision + 1
      };
    case "update_field":
      return {
        ...draft,
        nodes: draft.nodes.map((node) => node.id === operation.nodeId
          ? { ...node, fields: { ...node.fields, [operation.fieldId]: operation.value } }
          : node),
        revision: draft.revision + 1
      };
    case "connect_sockets":
      return { ...draft, edges: [...draft.edges, operation.edge], revision: draft.revision + 1 };
    case "disconnect_sockets":
      return { ...draft, edges: draft.edges.filter((edge) => edge.id !== operation.edgeId), revision: draft.revision + 1 };
    case "select_node":
    case "select_edge":
      return draft;
  }
}

function isUndoable(operation: EditorGraphOperation): boolean {
  return operation.type !== "select_node" && operation.type !== "select_edge";
}

function appendOperationLog(
  state: EditorGraphSessionState,
  operation: EditorGraphOperation,
  undoable: boolean,
  now: Date
): EditorGraphSessionState {
  return {
    ...state,
    operationLog: createOperationLog(state.operationLog, operation, undoable, now)
  };
}

function createOperationLog(
  current: readonly EditorGraphOperationLogEntry[],
  operation: EditorGraphOperation,
  undoable: boolean,
  now: Date
): readonly EditorGraphOperationLogEntry[] {
  return [
    ...current,
    {
      index: current.length,
      operationType: operation.type,
      undoable,
      createdAt: now.toISOString()
    }
  ].slice(-EDITOR_GRAPH_HISTORY_DEPTH);
}

function cloneGraph(graph: EditorGraphDocument): EditorGraphDocument {
  return JSON.parse(JSON.stringify(graph)) as EditorGraphDocument;
}
