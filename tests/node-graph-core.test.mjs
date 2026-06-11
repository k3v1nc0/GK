import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { authorizeRequest } from "../apps/api-server/src/auth-routes.ts";
import { authorizeEditorGraphAccess, EDITOR_GRAPH_ROUTE_IDS } from "../apps/api-server/src/editor-graph-routes.ts";
import { createEmptyNodeCanvasState } from "../apps/editor-web/src/node-canvas.ts";
import {
  applyGraphOperation,
  createDraftPreview,
  createEditorGraphSession,
  redoGraphOperation,
  undoGraphOperation,
  validateGraphDocument
} from "../packages/node-engine/src/index.ts";
import { getCoreGraphNodeTypes } from "../packages/node-types/src/index.ts";
import {
  EDITOR_GRAPH_HISTORY_DEPTH,
  NODE_VALUE_SOCKET_TYPES
} from "../packages/schemas/src/index.ts";
import { EDITOR_GRAPH_INTERACTION_CONTRACT } from "../packages/shared-ui/src/index.ts";

const definitions = getCoreGraphNodeTypes();

const editorSession = {
  scope: "editor",
  editorRoles: []
};

const gameSession = {
  scope: "game",
  gameUserStatus: "active",
  emailVerified: true
};

function node(id, type, x = 0, y = 0, fields = {}) {
  return {
    id,
    type,
    position: { x, y },
    fields
  };
}

function connect(id, sourceNodeId, sourceSocketId, targetNodeId, targetSocketId) {
  return {
    id,
    source: { nodeId: sourceNodeId, socketId: sourceSocketId },
    target: { nodeId: targetNodeId, socketId: targetSocketId }
  };
}

function applyOk(state, operation) {
  const result = applyGraphOperation(state, operation, definitions, new Date("2026-06-11T12:00:00Z"));
  assert.deepEqual(result.issues, []);
  return result.state;
}

describe("Fase 6 node graph core", () => {
  it("supports typed sockets for var.string, color, number, asset references and flow ports", () => {
    let state = createEditorGraphSession();

    state = applyOk(state, { type: "add_node", node: node("flow-start", "gk.flow.entry") });
    state = applyOk(state, { type: "add_node", node: node("sequence", "gk.flow.sequence") });
    state = applyOk(state, { type: "add_node", node: node("string-value", "gk.value.string", 40, 0, { value: "node-data string" }) });
    state = applyOk(state, { type: "add_node", node: node("number-value", "gk.value.number", 40, 80, { value: 7 }) });
    state = applyOk(state, { type: "add_node", node: node("color-value", "gk.value.color", 40, 160, { value: "#336699" }) });
    state = applyOk(state, { type: "add_node", node: node("asset-value", "gk.asset.reference") });
    state = applyOk(state, { type: "add_node", node: node("collector-a", "gk.editor.collect", 240, 0, { mode: "draft" }) });
    state = applyOk(state, { type: "add_node", node: node("collector-b", "gk.editor.collect", 240, 160, { mode: "preview" }) });

    state = applyOk(state, { type: "connect_sockets", edge: connect("flow-a", "flow-start", "flow", "sequence", "in") });
    state = applyOk(state, { type: "connect_sockets", edge: connect("flow-b", "sequence", "first", "collector-a", "flowIn") });
    state = applyOk(state, { type: "connect_sockets", edge: connect("flow-c", "sequence", "second", "collector-b", "flowIn") });
    state = applyOk(state, { type: "connect_sockets", edge: connect("string-edge", "string-value", "value", "collector-a", "label") });
    state = applyOk(state, { type: "connect_sockets", edge: connect("number-edge", "number-value", "value", "collector-a", "amount") });
    state = applyOk(state, { type: "connect_sockets", edge: connect("color-edge", "color-value", "value", "collector-a", "tint") });
    state = applyOk(state, { type: "connect_sockets", edge: connect("asset-edge", "asset-value", "asset", "collector-a", "asset") });

    assert.equal(state.draft.nodes.length, 8);
    assert.equal(state.draft.edges.length, 7);
    assert.deepEqual(validateGraphDocument(state.draft, definitions), []);
  });

  it("rejects wrong socket type connections with editor-readable validation issues", () => {
    let state = createEditorGraphSession();

    state = applyOk(state, { type: "add_node", node: node("string-value", "gk.value.string") });
    state = applyOk(state, { type: "add_node", node: node("collector", "gk.editor.collect", 160, 0, { mode: "draft" }) });

    const result = applyGraphOperation(
      state,
      { type: "connect_sockets", edge: connect("bad-edge", "string-value", "value", "collector", "amount") },
      definitions
    );

    assert.equal(result.issues.length, 1);
    assert.match(result.issues[0].message, /Value socket type mismatch/);
    assert.equal(result.state.draft.edges.length, 0);
  });

  it("validates dropdowns and typed input fields", () => {
    const graph = {
      id: "field-validation",
      revision: 1,
      nodes: [
        node("collector", "gk.editor.collect", 0, 0, { mode: "invalid" }),
        node("color", "gk.value.color", 0, 0, { value: "blue" }),
        node("number", "gk.value.number", 0, 0, { value: Number.NaN })
      ],
      edges: []
    };
    const issues = validateGraphDocument(graph, definitions);

    assert.equal(issues.some((issue) => issue.path.endsWith("mode")), true);
    assert.equal(issues.some((issue) => issue.path.endsWith("value") && /Color/.test(issue.message)), true);
    assert.equal(issues.some((issue) => issue.path.endsWith("value") && /finite number/.test(issue.message)), true);
  });

  it("keeps audio picker gated while audio count is zero", () => {
    const graph = {
      id: "audio-gate",
      revision: 1,
      nodes: [
        node("audio", "gk.audio.reference", 0, 0, {
          audio: { source: "audio-library", audioId: "" }
        })
      ],
      edges: []
    };
    const issues = validateGraphDocument(graph, definitions, {
      inventory: { glbCount: 4, uiImageCount: 0, audioCount: 0 }
    });

    assert.equal(issues.some((issue) => /audio asset count is 0/.test(issue.message)), true);
  });

  it("supports undo and redo with a history depth of 100 actions", () => {
    let state = createEditorGraphSession();

    for (let index = 0; index < 101; index += 1) {
      state = applyOk(state, {
        type: "add_node",
        node: node(`node-${index}`, "gk.value.number", index, 0, { value: index })
      });
    }

    assert.equal(state.history.maxDepth, EDITOR_GRAPH_HISTORY_DEPTH);
    assert.equal(state.history.past.length, 100);
    assert.equal(state.operationLog.length, 100);

    const undone = undoGraphOperation(state);
    assert.equal(undone.draft.nodes.length, 100);
    assert.equal(undone.history.future.length, 1);

    const redone = redoGraphOperation(undone);
    assert.equal(redone.draft.nodes.length, 101);
  });

  it("draft preview validates the draft graph and never publishes runtime output", () => {
    let state = createEditorGraphSession();
    state = applyOk(state, { type: "add_node", node: node("collector", "gk.editor.collect", 0, 0, { mode: "draft" }) });

    const preview = createDraftPreview(state.draft, definitions);

    assert.equal(preview.mode, "draft-preview");
    assert.equal(preview.publishesRuntimeOutput, false);
    assert.equal(preview.valid, true);
  });
});

describe("Fase 6 editor access and UI contracts", () => {
  it("keeps graph draft, operation and preview routes editor-only", () => {
    assert.equal(authorizeRequest("editor.graph.draft", editorSession).allowed, true);
    assert.equal(authorizeRequest("editor.graph.operation", editorSession).allowed, true);
    assert.equal(authorizeRequest("editor.graph.preview", editorSession).allowed, true);
    assert.equal(authorizeRequest("editor.graph.operation", gameSession).reason, "wrong_scope");
    assert.equal(authorizeEditorGraphAccess(EDITOR_GRAPH_ROUTE_IDS.operation, gameSession).allowed, false);
  });

  it("wires the Node Canvas to the graph model and undo/redo contract", () => {
    const canvas = createEmptyNodeCanvasState();

    assert.deepEqual(canvas.graph.nodes, []);
    assert.deepEqual(canvas.graph.edges, []);
    assert.deepEqual(canvas.supportedValueSocketTypes, NODE_VALUE_SOCKET_TYPES);
    assert.equal(canvas.historyDepth, 100);
    assert.equal(canvas.draftPreviewPublishesRuntimeOutput, false);
    assert.equal(EDITOR_GRAPH_INTERACTION_CONTRACT.undoShortcut, "Ctrl+Z");
    assert.deepEqual(EDITOR_GRAPH_INTERACTION_CONTRACT.redoShortcuts, ["Ctrl+Y", "Ctrl+Shift+Z"]);
  });

  it("does not put dummy assets or concrete gamecontent in runtime source", () => {
    const files = [
      "packages/schemas/src/node-graph.ts",
      "packages/node-types/src/index.ts",
      "packages/node-engine/src/graph-validation.ts",
      "packages/node-engine/src/graph-history.ts",
      "packages/node-engine/src/draft-preview.ts",
      "apps/api-server/src/editor-graph-routes.ts"
    ];
    const combined = files.map((file) => readFileSync(file, "utf8")).join("\n");

    assert.doesNotMatch(combined, /Eldoria|Willowmere|Blacksmit|Taverne|Wizard/);
    assert.doesNotMatch(combined, /\.glb|dummy asset|dummy world|dummy audio/i);
    assert.doesNotMatch(combined, /BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_|sk-[A-Za-z0-9]{20,}/);
  });
});
