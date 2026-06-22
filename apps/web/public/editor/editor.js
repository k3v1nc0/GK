import { createGkWorldRuntime } from "../shared/world-runtime.js";
import { DATA_TYPE_OPTIONS, dataTypeColor, groupInterfaceDefault, isMultiValueDataType, slugifyGroupPortName } from "../shared/node-types.js";

const RESTORE_GRAPH_ROUTE = "/api/editor/graph/restore";

const HEAD = 34;
const PAD = 8;
const ROW = 20;
const NODE_WIDTH = 210;
const VIEWPORT_AFFECTING_NODE_TYPES = new Set([
  "world_settings",
  "ground_surface",
  "top_down_camera",
  "ambient_light",
  "directional_light",
  "player_character",
  "player_spawn",
  "model_entity",
  "interactable",
  "keybind",
  "ui_hud_text"
]);

const state = {
  graph: { nodes: [], edges: [], nodeTypes: {} },
  assets: [],
  nodeTypes: {},
  currentGroupId: null,
  breadcrumb: [{ id: null, title: "ROOT" }],
  selectedNodeId: null,
  pendingEdge: null,
  unsaved: 0,
  view: { panX: 40, panY: 40, scale: 1 },
  assetSearch: "",
  assetSort: "date",
  assetFilter: "all",
  captureField: null,
  viewportMode: "translate",
  viewportAxis: null,
  snapMode: "off",
  snapGridSize: 1,
  previewAnimations: false,
  viewportHelpOpen: false,
  statusMessage: "",
  statusKind: "",
  viewportDebugKey: "",
  history: { undo: [], redo: [] },
  viewportDirty: false,
  dragPreviewPositions: {},
  dragSession: null,
  latestDragCommitId: 0,
  dragSessionCounter: 0,
  selectedNodeIds: [],
  selectedEdgeIds: [],
  clipboard: null,
  marquee: null
};

const el = {
  breadcrumb: document.querySelector("#breadcrumb"),
  unsavedBadge: document.querySelector("#unsavedBadge"),
  nodeLibrary: document.querySelector("#nodeLibrary"),
  inspectorForm: document.querySelector("#inspectorForm"),
  validationPanel: document.querySelector("#validationPanel"),
  edgeList: document.querySelector("#edgeList"),
  graphViewport: document.querySelector("#graphViewport"),
  graphContent: document.querySelector("#graphContent"),
  edgeLayer: document.querySelector("#edgeLayer"),
  nodeLayer: document.querySelector("#nodeLayer"),
  viewportCanvas: document.querySelector("#viewportCanvas"),
  viewportStatus: document.querySelector("#viewportStatus"),
  viewportInfoButton: document.querySelector("#viewportInfoButton"),
  viewportHelpPanel: document.querySelector("#viewportHelpPanel"),
  viewportTransformPanel: document.querySelector("#viewportTransformPanel"),
  viewportErrors: document.querySelector("#viewportErrors"),
  statusText: document.querySelector("#statusText"),
  assetSearch: document.querySelector("#assetSearch"),
  assetSort: document.querySelector("#assetSort"),
  assetFilter: document.querySelector("#assetFilter"),
  assetGrid: document.querySelector("#assetGrid"),
  assetForm: document.querySelector("#assetForm"),
  snapModeSelect: document.querySelector("#snapModeSelect"),
  snapGridInput: document.querySelector("#snapGridInput"),
  saveDraftButton: document.querySelector("#saveDraftButton"),
  publishButton: document.querySelector("#publishButton"),
  logoutButton: document.querySelector("#logoutButton"),
  zoomResetButton: document.querySelector("#zoomResetButton")
};

let runtime = null;
let viewportRefreshTimer = null;
let validationRefreshTimer = null;
let graphMutationQueue = Promise.resolve();
const selectionBox = document.createElement("div");
selectionBox.className = "selectionBox";
selectionBox.hidden = true;
el.graphViewport.appendChild(selectionBox);
const edgePanel = el.edgeList && typeof el.edgeList.closest === "function" ? el.edgeList.closest(".panel") : null;
if (edgePanel) edgePanel.style.display = "none";
const editorDebug = window.__GK_DEBUG_EDITOR && typeof window.__GK_DEBUG_EDITOR === "object"
  ? window.__GK_DEBUG_EDITOR
  : { enabled: false, activeDragSession: null, lastInvalidDrag: null, dragSessions: 0, lastClientPoint: null, lastGraphPoint: null, lastCommit: null };
window.__GK_DEBUG_EDITOR = editorDebug;

async function api(path, options) {
  const method = (options && options.method) || "GET";
  const response = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, options || {}));
  if (response.status === 401) {
    window.location.href = "/login/?next=" + encodeURIComponent("/editor/");
    throw new Error("Niet ingelogd.");
  }
  const data = await response.json().catch(function () { return {}; });
  if (!response.ok) {
    const error = new Error(data.message || "Verzoek mislukt.");
    error.status = response.status;
    error.path = path;
    error.method = method;
    error.details = data;
    throw error;
  }
  return data;
}

function setStatus(message, kind) {
  state.statusMessage = message || "";
  state.statusKind = kind || "";
  renderStatusLine();
}

function bumpUnsaved() {
  state.unsaved += 1;
  renderUnsaved();
}

function renderUnsaved() {
  el.unsavedBadge.textContent = state.unsaved + (state.unsaved === 1 ? " action unsaved" : " actions unsaved");
  el.unsavedBadge.className = state.unsaved === 0 ? "unsaved clean" : "unsaved";
}

function isBlankValue(value) {
  return value === null || value === undefined || value === "";
}

function effectiveFieldValue(field, value) {
  return isBlankValue(value) ? field.default : value;
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function assetById(assetId) {
  return state.assets.find(function (asset) { return asset.id === assetId; }) || null;
}

function runtimeNodeId(node) {
  if (!node) return null;
  if (node.type === "player_character") return node.values?.playerId || null;
  if (node.type === "model_entity") return node.values?.entityId || null;
  return null;
}

function runtimeSelectedEntityId() {
  if (!runtime || typeof runtime.getSelectedEntityId !== "function") return null;
  return runtime.getSelectedEntityId() || null;
}

function runtimeTransformActive() {
  if (!runtime || typeof runtime.isTransformActive !== "function") return false;
  return runtime.isTransformActive();
}

function nodeByRuntimeId(runtimeId) {
  if (!runtimeId) return null;
  return state.graph.nodes.find(function (node) {
    return node.values && (node.values.entityId === runtimeId || node.values.playerId === runtimeId);
  }) || null;
}

function viewportAxisToNodeAxis(axis) {
  if (axis === "x") return "x";
  if (axis === "y") return "z";
  if (axis === "z") return "y";
  return null;
}

function nodeAxisToViewportAxis(axis) {
  if (axis === "x") return "x";
  if (axis === "y") return "z";
  if (axis === "z") return "y";
  return null;
}

function viewportVectorFromWorld(vector) {
  return {
    x: Number(vector?.x) || 0,
    y: Number(vector?.z) || 0,
    z: Number(vector?.y) || 0
  };
}

function animationClipsForAsset(asset) {
  const animations = asset?.metadata?.animations;
  if (!Array.isArray(animations)) return [];
  return animations.map(function (entry) {
    return {
      name: String(entry?.name || "").trim(),
      index: Number.isFinite(Number(entry?.index)) ? Number(entry.index) : 0
    };
  }).filter(function (entry) { return Boolean(entry.name); });
}

function defaultAnimationForAsset(asset) {
  const defaultAnimation = String(asset?.metadata?.defaultAnimation || "").trim();
  return defaultAnimation || null;
}

function animationBadgeText(asset) {
  const count = Number(asset?.metadata?.animationCount || 0);
  return count + " anim" + (count === 1 ? "" : "s");
}

function animationBlankLabel(key) {
  if (key === "animationClip") return "Auto / standaard";
  if (key === "idleAnimation") return "Idle / standaard";
  return "(geen)";
}

function resolveAnimationChoiceForAsset(asset, currentValue, options = {}) {
  const clips = animationClipsForAsset(asset);
  if (!clips.length) return null;
  const current = String(currentValue || "").trim();
  if (current) {
    const exact = clips.find(function (clip) { return clip.name === current; });
    if (exact) return exact.name;
    const lower = current.toLowerCase();
    const caseMatch = clips.find(function (clip) { return clip.name.toLowerCase() === lower; });
    if (caseMatch) return caseMatch.name;
    const contains = clips.find(function (clip) { return clip.name.toLowerCase().includes(lower); });
    if (contains) return contains.name;
  }
  if (options.allowEmpty) return null;
  if (options.preferDefault !== false) {
    const defaultAnimation = defaultAnimationForAsset(asset);
    if (defaultAnimation && clips.some(function (clip) { return clip.name === defaultAnimation; })) return defaultAnimation;
  }
  if (options.fallbackToFirst === false) return null;
  return clips[0].name || null;
}

function resolveAnimationClipForAsset(asset, currentValue) {
  return resolveAnimationChoiceForAsset(asset, currentValue, { allowEmpty: false, preferDefault: true, fallbackToFirst: true });
}

function resolveIdleAnimationForAsset(asset, currentValue) {
  return resolveAnimationChoiceForAsset(asset, currentValue, { allowEmpty: false, preferDefault: true, fallbackToFirst: true });
}

function resolveOptionalAnimationForAsset(asset, currentValue) {
  return resolveAnimationChoiceForAsset(asset, currentValue, { allowEmpty: true, preferDefault: false, fallbackToFirst: false });
}

function viewportModeLabelText() {
  const mode = state.viewportMode === "translate"
    ? "Move"
    : state.viewportMode === "rotate"
      ? "Rotate"
      : state.viewportMode === "scale"
        ? "Scale"
        : "Select";
  const localView = runtime && typeof runtime.isLocalViewActive === "function" && runtime.isLocalViewActive() ? " Local" : "";
  const axisSuffix = state.viewportAxis
    ? " " + state.viewportAxis.toUpperCase()
    : state.viewportMode === "rotate"
      ? " Z"
      : "";
  return mode + axisSuffix + localView;
}

function formatViewportNumber(value, digits = 3) {
  const number = Math.round(Number(value) * Math.pow(10, digits)) / Math.pow(10, digits);
  if (!Number.isFinite(number)) return "0";
  return String(number);
}

function selectedModelNode() {
  const runtimeId = runtimeSelectedEntityId();
  if (runtimeId) {
    const runtimeNode = nodeByRuntimeId(runtimeId);
    if (runtimeNode && runtimeNode.type === "model_entity") return runtimeNode;
    return null;
  }
  const node = nodeById(state.selectedNodeId);
  return node && node.type === "model_entity" ? node : null;
}

function selectedTransformSnapshot() {
  if (!runtime || typeof runtime.getSelectedEntitySnapshot !== "function") return null;
  const snapshot = runtime.getSelectedEntitySnapshot();
  const node = selectedModelNode();
  if (!snapshot || !node) return null;
  const runtimeId = runtimeNodeId(node);
  if (runtimeId && snapshot.entityId && snapshot.entityId !== runtimeId) return null;
  return snapshot;
}

function renderStatusLine() {
  if (!el.statusText) return;
  const parts = [];
  const modeLabel = viewportModeLabelText();
  const snapshot = selectedTransformSnapshot();
  const node = selectedModelNode();
  const selectedId = runtimeSelectedEntityId() || runtimeNodeId(node);
  if (state.viewportDebugKey) parts.push("key received: " + state.viewportDebugKey);
  parts.push(modeLabel);
  if (state.viewportAxis) parts.push("as vergrendeld: " + state.viewportAxis.toUpperCase());
  parts.push(selectedId ? "selected entity id: " + selectedId : "No mesh selected");
  parts.push("transform active: " + (runtimeTransformActive() ? "yes" : "no"));
  if (node) {
    const source = snapshot
      ? viewportVectorFromWorld(snapshot.position)
      : viewportVectorFromWorld({ x: node.values.x, y: node.values.y, z: node.values.z });
    parts.push("Loc X " + formatViewportNumber(source.x) + " Y " + formatViewportNumber(source.y) + " Z " + formatViewportNumber(source.z));
  }
  if (state.statusMessage) parts.push(state.statusMessage);
  el.statusText.textContent = parts.join(" | ");
  el.statusText.className = "statusLine" + (state.statusKind ? " " + state.statusKind : "");
}

function renderViewportControls() {
  if (el.viewportInfoButton) {
    el.viewportInfoButton.classList.toggle("active", state.viewportHelpOpen);
    el.viewportInfoButton.setAttribute("aria-expanded", state.viewportHelpOpen ? "true" : "false");
  }
  if (el.viewportHelpPanel) el.viewportHelpPanel.hidden = !state.viewportHelpOpen;
  if (el.snapModeSelect && el.snapModeSelect.value !== state.snapMode) el.snapModeSelect.value = state.snapMode;
  if (el.snapGridInput) {
    const nextValue = String(state.snapGridSize || 1);
    if (el.snapGridInput.value !== nextValue) el.snapGridInput.value = nextValue;
  }
  renderStatusLine();
  renderTransformPanel();
}

function setViewportMode(mode) {
  if (!["translate", "rotate", "scale"].includes(mode)) return;
  state.viewportMode = mode;
  if (runtime && typeof runtime.setGizmoMode === "function") runtime.setGizmoMode(mode);
  renderViewportControls();
}

function setViewportAxis(axis) {
  state.viewportAxis = ["x", "y", "z"].includes(axis) ? axis : null;
  if (runtime && typeof runtime.setTransformAxis === "function") runtime.setTransformAxis(state.viewportAxis);
  else if (runtime && typeof runtime.setTransformAxisConstraint === "function") runtime.setTransformAxisConstraint(state.viewportAxis);
  renderViewportControls();
}

function setViewportSnap(mode, gridSize) {
  state.snapMode = ["off", "grid", "ground"].includes(mode) ? mode : "off";
  state.snapGridSize = Math.max(0.1, Number.isFinite(Number(gridSize)) ? Number(gridSize) : 1);
  renderViewportControls();
  if (runtime && typeof runtime.setSnapState === "function") runtime.setSnapState(state.snapMode, state.snapGridSize);
}

function setAnimationPreviewEnabled(enabled) {
  state.previewAnimations = Boolean(enabled);
  renderViewportControls();
  if (runtime && typeof runtime.setAnimationPreviewEnabled === "function") runtime.setAnimationPreviewEnabled(state.previewAnimations);
}

function toggleViewportHelp() {
  state.viewportHelpOpen = !state.viewportHelpOpen;
  renderViewportControls();
}

function resetSelectedModelTransform(kind) {
  const node = selectedModelNode();
  if (!node) return false;
  const patch = {};
  if (kind === "location") {
    patch.x = 0;
    patch.y = 0;
    patch.z = 0;
  } else if (kind === "rotation") {
    patch.rotationX = 0;
    patch.rotationY = 0;
    patch.rotationZ = 0;
  } else if (kind === "scale") {
    patch.scaleX = 1;
    patch.scaleY = 1;
    patch.scaleZ = 1;
  }
  if (!Object.keys(patch).length) return false;
  cancelRuntimeTransform();
  setViewportAxis(null);
  patchValues(node.id, patch, {
    historyLabel: kind === "location" ? "Reset location" : kind === "rotation" ? "Reset rotation" : "Reset scale",
    refreshViewport: true,
    refreshValidation: true,
    refreshEdgeList: false
  });
  return true;
}

function renderTransformPanel() {
  if (!el.viewportTransformPanel) return;
  const node = selectedModelNode();
  if (!node) {
    el.viewportTransformPanel.hidden = true;
    el.viewportTransformPanel.innerHTML = "";
    return;
  }
  const snapshot = selectedTransformSnapshot();
  const position = snapshot ? viewportVectorFromWorld(snapshot.position) : viewportVectorFromWorld({ x: node.values.x, y: node.values.y, z: node.values.z });
  const rotation = snapshot
    ? viewportVectorFromWorld(snapshot.rotation)
    : viewportVectorFromWorld({
      x: node.values.rotationX,
      y: node.values.rotationY,
      z: node.values.rotationZ
    });
  const scale = snapshot?.scale || { x: node.values.scaleX, y: node.values.scaleY, z: node.values.scaleZ };
  el.viewportTransformPanel.hidden = false;
  el.viewportTransformPanel.innerHTML = "";

  const header = document.createElement("div");
  header.className = "transformPanelHeader";
  const title = document.createElement("div");
  title.className = "transformPanelTitle";
  title.textContent = "TRS";
  header.appendChild(title);
  el.viewportTransformPanel.appendChild(header);

  const matrix = document.createElement("div");
  matrix.className = "transformMatrix";
  const labels = ["as", "G", "R", "S"];
  for (const label of labels) {
    const cell = document.createElement("div");
    cell.className = "transformMatrixHead";
    cell.textContent = label;
    matrix.appendChild(cell);
  }

  function commitTransformInput(kind, axis, value) {
    const patch = {};
    if (kind === "G") {
      const nodeAxis = viewportAxisToNodeAxis(axis);
      if (!nodeAxis) return;
      patch[nodeAxis] = value;
    } else if (kind === "R") {
      const nodeAxis = viewportAxisToNodeAxis(axis);
      if (!nodeAxis) return;
      patch["rotation" + nodeAxis.toUpperCase()] = value;
    } else if (kind === "S") {
      patch["scale" + axis.toUpperCase()] = value;
    }
    cancelRuntimeTransform();
    setViewportAxis(null);
    patchValues(node.id, patch, {
      historyLabel: "Transform " + kind,
      refreshViewport: true,
      refreshValidation: true,
      refreshEdgeList: false
    });
  }

  function addMatrixInput(kind, axis, value, step, digits) {
    const input = document.createElement("input");
    input.className = "transformMatrixInput";
    input.type = "number";
    input.step = step;
    input.value = formatViewportNumber(value, digits);
    input.title = kind + " " + axis.toUpperCase();
    input.addEventListener("change", function () {
      const next = Number(input.value);
      if (!Number.isFinite(next)) {
        input.value = formatViewportNumber(value, digits);
        return;
      }
      commitTransformInput(kind, axis, next);
    });
    input.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      input.blur();
    });
    matrix.appendChild(input);
  }

  for (const axis of ["x", "y", "z"]) {
    const axisLabel = document.createElement("div");
    axisLabel.className = "transformMatrixAxis";
    axisLabel.textContent = axis.toUpperCase();
    matrix.appendChild(axisLabel);
    addMatrixInput("G", axis, position[axis] ?? 0, "0.01", 3);
    addMatrixInput("R", axis, rotation[axis] ?? 0, "0.1", 1);
    addMatrixInput("S", axis, scale[axis] ?? 1, "0.01", 3);
  }
  el.viewportTransformPanel.appendChild(matrix);
}

function cancelRuntimeTransform() {
  if (!runtime) return false;
  const wasActive = typeof runtime.isTransformActive === "function" && runtime.isTransformActive();
  const cancelFn = typeof runtime.cancelTransform === "function"
    ? runtime.cancelTransform
    : runtime.cancelTransformSession;
  const result = typeof cancelFn === "function" ? cancelFn.call(runtime) : false;
  if (wasActive) {
    setViewportAxis(null);
    clearSelection({ clearPendingEdge: true });
    renderGraph();
    setStatus("Transform cancelled.", "");
  }
  return result;
}

function confirmRuntimeTransform() {
  if (!runtime) return false;
  const wasActive = typeof runtime.isTransformActive === "function" && runtime.isTransformActive();
  const confirmFn = typeof runtime.confirmTransform === "function"
    ? runtime.confirmTransform
    : runtime.confirmTransformSession;
  const result = typeof confirmFn === "function" ? confirmFn.call(runtime) : false;
  if (wasActive) {
    setViewportAxis(null);
    clearSelection({ clearPendingEdge: true });
    renderGraph();
    setStatus("Transform confirmed.", "success");
  }
  return result;
}

function openGroupForNode(node) {
  if (!node) return false;
  const parentId = node.parentId || null;
  if (state.currentGroupId === parentId) return false;
  state.currentGroupId = parentId;
  syncBreadcrumb();
  renderGraph();
  renderInspector();
  applyTransform();
  return true;
}

function focusGraphNode(nodeId) {
  const node = nodeById(nodeId);
  if (!node) return false;
  openGroupForNode(node);
  const card = el.nodeLayer.querySelector('.gnode[data-node-id="' + nodeId + '"]');
  if (!card) return false;
  const viewportRect = el.graphViewport.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const cardCenterX = cardRect.left + cardRect.width / 2;
  const cardCenterY = cardRect.top + cardRect.height / 2;
  const viewportCenterX = viewportRect.left + viewportRect.width / 2;
  const viewportCenterY = viewportRect.top + viewportRect.height / 2;
  state.view.panX += viewportCenterX - cardCenterX;
  state.view.panY += viewportCenterY - cardCenterY;
  applyTransform();
  return true;
}

function snapshotNode(node) {
  return {
    id: node.id,
    type: node.type,
    title: node.title,
    x: node.x,
    y: node.y,
    parentId: node.parentId || null,
    values: clonePlain(node.values || {})
  };
}

function snapshotGraph(graph) {
  return {
    schemaVersion: graph.schemaVersion,
    nodes: (graph.nodes || []).map(snapshotNode),
    edges: (graph.edges || []).map(function (edge) {
      return {
        id: edge.id,
        fromNodeId: edge.fromNodeId,
        fromPort: edge.fromPort,
        toNodeId: edge.toNodeId,
        toPort: edge.toPort
      };
    })
  };
}

function captureHistorySnapshot(label) {
  return {
    label: label || "",
    currentGroupId: state.currentGroupId,
    selectedNodeId: state.selectedNodeId,
    graph: snapshotGraph(state.graph)
  };
}

function pushHistorySnapshot(snapshot) {
  if (!snapshot) return;
  state.history.undo.push(snapshot);
  if (state.history.undo.length > 50) state.history.undo.shift();
  state.history.redo.length = 0;
}

function canUndo() {
  return state.history.undo.length > 0;
}

function canRedo() {
  return state.history.redo.length > 0;
}

function normalizeSelectionState() {
  const nodeIds = [];
  const seenNodeIds = new Set();
  for (const nodeId of state.selectedNodeIds || []) {
    if (!nodeId || seenNodeIds.has(nodeId)) continue;
    if (!state.graph.nodes.some(function (node) { return node.id === nodeId; })) continue;
    seenNodeIds.add(nodeId);
    nodeIds.push(nodeId);
  }
  const edgeIds = [];
  const seenEdgeIds = new Set();
  for (const edgeId of state.selectedEdgeIds || []) {
    if (!edgeId || seenEdgeIds.has(edgeId)) continue;
    if (!state.graph.edges.some(function (edge) { return edge.id === edgeId; })) continue;
    seenEdgeIds.add(edgeId);
    edgeIds.push(edgeId);
  }
  state.selectedNodeIds = nodeIds;
  state.selectedEdgeIds = edgeIds;
  state.selectedNodeId = nodeIds.length ? (nodeIds.includes(state.selectedNodeId) ? state.selectedNodeId : nodeIds[0]) : null;
}

function setSelection(nodeIds, edgeIds, options = {}) {
  const previousPrimary = state.selectedNodeId;
  const nextNodeIds = Array.from(new Set((nodeIds || []).filter(Boolean)));
  const nextEdgeIds = Array.from(new Set((edgeIds || []).filter(Boolean)));
  state.selectedNodeIds = nextNodeIds;
  state.selectedEdgeIds = nextEdgeIds;
  state.selectedNodeId = options.primaryNodeId !== undefined
    ? options.primaryNodeId
    : (nextNodeIds.length ? nextNodeIds[0] : null);
  if (options.clearPendingEdge) state.pendingEdge = null;
  syncSelectedNodeCard();
  syncSelectedEdgeCard();
  renderInspector();
  syncRuntimeSelection();
  if (previousPrimary !== state.selectedNodeId && runtime && typeof runtime.isTransformActive === "function" && !runtime.isTransformActive()) {
    setViewportAxis(null);
  }
  renderViewportControls();
  scheduleEdgeRender();
}

function selectNodes(nodeIds, options = {}) {
  setSelection(nodeIds, options.edgeIds || [], { primaryNodeId: options.primaryNodeId, clearPendingEdge: options.clearPendingEdge });
}

function selectNode(nodeId, scroll, options = {}) {
  if (nodeId === null || nodeId === undefined) {
    setSelection([], [], { clearPendingEdge: options.clearPendingEdge });
    return;
  }
  if (options.toggle) {
    const next = new Set(state.selectedNodeIds);
    if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
    const nextIds = Array.from(next);
    setSelection(nextIds, state.selectedEdgeIds, { primaryNodeId: nextIds.length ? nextIds[0] : null, clearPendingEdge: options.clearPendingEdge });
  } else if (options.extend) {
    const next = new Set(state.selectedNodeIds);
    next.add(nodeId);
    setSelection(Array.from(next), state.selectedEdgeIds, { primaryNodeId: nodeId, clearPendingEdge: options.clearPendingEdge });
  } else {
    setSelection([nodeId], [], { primaryNodeId: nodeId, clearPendingEdge: options.clearPendingEdge });
  }
  if (scroll) {
    const card = el.nodeLayer.querySelector('.gnode[data-node-id="' + nodeId + '"]');
    if (card && typeof card.scrollIntoView === "function") card.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

function selectEdge(edgeId, options = {}) {
  if (!edgeId) {
    setSelection(options.nodeIds || [], [], { primaryNodeId: options.primaryNodeId, clearPendingEdge: options.clearPendingEdge });
    return;
  }
  if (options.toggle) {
    const next = new Set(state.selectedEdgeIds);
    if (next.has(edgeId)) next.delete(edgeId); else next.add(edgeId);
    setSelection(options.nodeIds || state.selectedNodeIds, Array.from(next), { primaryNodeId: options.primaryNodeId, clearPendingEdge: options.clearPendingEdge });
  } else if (options.extend) {
    const next = new Set(state.selectedEdgeIds);
    next.add(edgeId);
    setSelection(options.nodeIds || state.selectedNodeIds, Array.from(next), { primaryNodeId: options.primaryNodeId, clearPendingEdge: options.clearPendingEdge });
  } else {
    setSelection(options.nodeIds || [], [edgeId], { primaryNodeId: options.primaryNodeId, clearPendingEdge: options.clearPendingEdge });
  }
}

function clearSelection(options = {}) {
  setSelection([], [], { clearPendingEdge: options.clearPendingEdge });
}

function syncSelectedNodeCard() {
  for (const card of el.nodeLayer.querySelectorAll(".gnode")) {
    card.classList.toggle("selected", state.selectedNodeIds.includes(card.dataset.nodeId));
  }
}

function syncSelectedEdgeCard() {
  for (const path of el.edgeLayer.querySelectorAll("[data-edge-id]")) {
    path.classList.toggle("selected", state.selectedEdgeIds.includes(path.dataset.edgeId));
  }
}

function syncRuntimeSelection() {
  if (!runtime) return;
  const node = nodeById(state.selectedNodeId);
  const runtimeId = runtimeNodeId(node);
  if (runtimeId) runtime.selectEntity(runtimeId);
  else runtime.deselect();
}

function breadcrumbForGroup(groupId) {
  const trail = [{ id: null, title: "ROOT" }];
  if (!groupId) return trail;
  const lineage = [];
  const seen = new Set();
  let current = nodeById(groupId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    lineage.push({ id: current.id, title: current.values?.title || current.title || current.id });
    current = current.parentId ? nodeById(current.parentId) : null;
  }
  return trail.concat(lineage.reverse());
}

function syncBreadcrumb() {
  if (state.currentGroupId && !state.graph.nodes.some(function (node) { return node.id === state.currentGroupId; })) {
    state.currentGroupId = null;
  }
  state.breadcrumb = breadcrumbForGroup(state.currentGroupId);
  renderBreadcrumb();
}

function invalidateDraftWorld() {
  state.viewportDirty = true;
}

function clearViewportRefreshTimer() {
  if (viewportRefreshTimer) clearTimeout(viewportRefreshTimer);
  viewportRefreshTimer = null;
}

function scheduleViewportRefresh(force) {
  if (!force && !state.viewportDirty) return;
  clearViewportRefreshTimer();
  viewportRefreshTimer = setTimeout(function () {
    viewportRefreshTimer = null;
    refreshViewport({ force: true });
  }, force ? 0 : 80);
}

function scheduleValidationRefresh() {
  if (validationRefreshTimer) clearTimeout(validationRefreshTimer);
  validationRefreshTimer = setTimeout(function () {
    validationRefreshTimer = null;
    refreshValidation();
  }, 300);
}

function shouldRefreshViewportForNode(nodeId) {
  const node = nodeById(nodeId);
  if (!node || !VIEWPORT_AFFECTING_NODE_TYPES.has(node.type)) return false;
  const outputNode = state.graph.nodes.find(function (candidate) { return candidate.type === "game_output"; });
  if (!outputNode) return false;
  const visited = new Set([node.id]);
  const stack = [node.id];
  while (stack.length) {
    const currentId = stack.pop();
    if (currentId === outputNode.id) return true;
    for (const edge of state.graph.edges) {
      if (edge.fromNodeId !== currentId || visited.has(edge.toNodeId)) continue;
      visited.add(edge.toNodeId);
      stack.push(edge.toNodeId);
    }
  }
  return false;
}

function applyGraphMutationResult(result, options = {}) {
  const nextGraph = result && result.graph ? result.graph : result;
  if (!nextGraph) return null;
  state.graph = nextGraph;
  if (nextGraph.nodeTypes) state.nodeTypes = nextGraph.nodeTypes;
  normalizeSelectionState();
  if (options.currentGroupId !== undefined) state.currentGroupId = options.currentGroupId;
  if (options.selectedNodeIds !== undefined) state.selectedNodeIds = options.selectedNodeIds.slice();
  if (options.selectedNodeIds !== undefined && options.selectedNodeId === undefined) {
    state.selectedNodeId = state.selectedNodeIds.length ? state.selectedNodeIds[0] : null;
  }
  if (options.selectedEdgeIds !== undefined) state.selectedEdgeIds = options.selectedEdgeIds.slice();
  if (options.selectedNodeId !== undefined) state.selectedNodeId = options.selectedNodeId;
  if (options.clearPendingEdge) state.pendingEdge = null;
  syncBreadcrumb();
  if (options.countUnsaved !== false) bumpUnsaved();
  if (options.refreshGraph !== false) {
    renderGraph();
  } else {
    syncSelectedNodeCard();
    syncSelectedEdgeCard();
  }
  if (options.refreshEdgeList !== false) renderEdgeList();
  if (options.refreshInspector !== false) renderInspector();
  if (!options.refreshViewport) syncRuntimeSelection();
  renderViewportControls();
  if (options.refreshViewport) {
    invalidateDraftWorld();
    scheduleViewportRefresh(false);
  }
  if (options.refreshValidation !== false) scheduleValidationRefresh();
  if (typeof options.afterApply === "function") options.afterApply(nextGraph, result);
  return nextGraph;
}

async function applyGraphMutation(apiCall, options = {}) {
  return await enqueueGraphMutation(async function () {
    const historySnapshot = options.historySnapshot || (options.historyLabel ? captureHistorySnapshot(options.historyLabel) : null);
    try {
      const result = await apiCall();
      const normalizedResult = typeof options.normalizeResult === "function" ? options.normalizeResult(result) : result;
      if (typeof options.guard === "function" && !options.guard(normalizedResult)) return null;
      const nextGraph = applyGraphMutationResult(normalizedResult, options);
      if (historySnapshot) pushHistorySnapshot(historySnapshot);
      return nextGraph;
    } catch (error) {
      setStatus(error.message, "error");
      return null;
    }
  });
}

function enqueueGraphMutation(task) {
  const next = graphMutationQueue.then(task, task);
  graphMutationQueue = next.catch(function () {});
  return next;
}

async function restoreGraphSnapshot(snapshot) {
  if (!snapshot) return null;
  return await enqueueGraphMutation(async function () {
    try {
      const result = await api(RESTORE_GRAPH_ROUTE, {
        method: "POST",
        body: JSON.stringify({ graph: snapshot.graph })
      });
      applyGraphMutationResult(result, {
        selectedNodeId: snapshot.selectedNodeId,
        currentGroupId: snapshot.currentGroupId,
        clearPendingEdge: true,
        refreshViewport: false,
        refreshValidation: false,
        refreshGraph: true,
        refreshEdgeList: true,
        refreshInspector: true
      });
      return result;
    } catch (error) {
      if (error.status === 404) {
        setStatus(error.method + " " + error.path + " gaf 404: " + error.message, "error");
      } else {
        setStatus(error.message, "error");
      }
      return null;
    }
  });
}

async function undoGraphMutation() {
  if (!canUndo()) {
    setStatus("Niets om ongedaan te maken.", "");
    return;
  }
  const snapshot = state.history.undo.pop();
  state.history.redo.push(captureHistorySnapshot("Redo"));
  if (state.history.redo.length > 50) state.history.redo.shift();
  const result = await restoreGraphSnapshot(snapshot);
  if (!result) {
    state.history.undo.push(snapshot);
    state.history.redo.pop();
    return;
  }
  await refreshViewport({ force: true });
  await refreshValidation();
  setStatus("Ongedaan gemaakt: " + (snapshot.label || "laatste wijziging") + ".", "success");
}

async function redoGraphMutation() {
  if (!canRedo()) {
    setStatus("Niets om opnieuw te doen.", "");
    return;
  }
  const snapshot = state.history.redo.pop();
  state.history.undo.push(captureHistorySnapshot("Undo"));
  if (state.history.undo.length > 50) state.history.undo.shift();
  const result = await restoreGraphSnapshot(snapshot);
  if (!result) {
    state.history.redo.push(snapshot);
    state.history.undo.pop();
    return;
  }
  await refreshViewport({ force: true });
  await refreshValidation();
  setStatus("Opnieuw gedaan: " + (snapshot.label || "laatste wijziging") + ".", "success");
}

// ---------- Boot ----------
async function boot() {
  try {
    await api("/api/auth/me");
  } catch {
    return;
  }
  runtime = createGkWorldRuntime(el.viewportCanvas, {
    mode: "editor",
    onSelectEntity: function (entityId) {
      const node = nodeByRuntimeId(entityId);
      if (!node) return;
      focusGraphNode(node.id);
      selectNode(node.id, false);
    },
    onTransformChange: function () {
      renderViewportControls();
    },
    onTransformEnd: function (info) {
      if (!info) return;
      setViewportAxis(null);
      clearSelection({ clearPendingEdge: true });
      renderGraph();
      if (info.action === "confirm") {
        setStatus("Transform confirmed.", "success");
      } else if (info.action === "cancel") {
        setStatus("Transform cancelled.", "");
      }
    },
    onTransformCommit: function (entityId, transform) {
      const node = nodeByRuntimeId(entityId);
      if (!node || node.type !== "model_entity") return;
      patchValues(node.id, transform, {
        historyLabel: "Transform",
        refreshViewport: true,
        refreshEdgeList: false,
        refreshValidation: false
      });
      setViewportAxis(null);
    },
    onLoadErrors: renderViewportErrors
  });
  state.viewportHelpOpen = false;
  if (el.viewportHelpPanel) el.viewportHelpPanel.hidden = true;
  await reloadGraph();
  await reloadAssets();
  renderViewportControls();
  setViewportSnap(state.snapMode, state.snapGridSize);
  setViewportMode(state.viewportMode);
  await refreshViewport({ force: true });
  await refreshValidation();
  applyTransform();
  setStatus("Klaar.", "success");
  renderUnsaved();
}

async function reloadGraph() {
  const graph = await api("/api/editor/graph");
  state.graph = graph;
  state.nodeTypes = graph.nodeTypes;
  ensureCurrentGroupExists();
  renderNodeLibrary();
  renderGraph();
  renderEdgeList();
  renderInspector();
}

function ensureCurrentGroupExists() {
  syncBreadcrumb();
}

// ---------- Node Library ----------
function renderNodeLibrary() {
  el.nodeLibrary.innerHTML = "";
  const groups = {};
  for (const [type, def] of Object.entries(state.nodeTypes)) {
    if (type === "game_output" || def.hidden || def.system) continue;
    const groupName = def.group || "Other";
    (groups[groupName] = groups[groupName] || []).push([type, def]);
  }
  for (const [groupName, items] of Object.entries(groups)) {
    const wrap = document.createElement("div");
    wrap.className = "libGroup";
    const title = document.createElement("div");
    title.className = "libGroupTitle";
    title.textContent = groupName;
    wrap.appendChild(title);
    for (const [type, def] of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "libButton";
      const dot = document.createElement("span");
      dot.className = "libDot";
      dot.style.background = def.accent || "#7bd4ff";
      const label = document.createElement("span");
      label.textContent = def.label;
      const plus = document.createElement("span");
      plus.className = "plus";
      plus.textContent = "+";
      button.append(dot, label, plus);
      button.addEventListener("click", function () { addNode(type); });
      wrap.appendChild(button);
    }
    el.nodeLibrary.appendChild(wrap);
  }
}

async function addNode(type) {
  const center = viewportCenterInGraph();
  await applyGraphMutation(function () {
    return api("/api/editor/nodes", {
      method: "POST",
      body: JSON.stringify({ type: type, position: center, parentId: state.currentGroupId })
    });
  }, {
    historyLabel: "Node toegevoegd",
    refreshViewport: false,
    refreshValidation: true,
    afterApply: function (_, result) {
      if (result?.nodeId) selectNode(result.nodeId, true);
      setStatus("Node toegevoegd.", "success");
    }
  });
}

function viewportCenterInGraph() {
  const rect = el.graphViewport.getBoundingClientRect();
  return {
    x: (rect.width / 2 - state.view.panX) / state.view.scale,
    y: (rect.height / 2 - state.view.panY) / state.view.scale
  };
}

function clientToGraphPoint(clientX, clientY) {
  const rect = el.graphViewport.getBoundingClientRect();
  const scale = state.view.scale || 1;
  return {
    x: (clientX - rect.left - state.view.panX) / scale,
    y: (clientY - rect.top - state.view.panY) / scale
  };
}

function clientToViewportPoint(clientX, clientY) {
  const rect = el.graphViewport.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

function graphPointToClientPoint(point) {
  const rect = el.graphViewport.getBoundingClientRect();
  const scale = state.view.scale || 1;
  return {
    x: rect.left + (point.x * scale) + state.view.panX,
    y: rect.top + (point.y * scale) + state.view.panY
  };
}

function rectContainsPoint(rect, point, padding = 0) {
  return point.x >= rect.left - padding &&
    point.x <= rect.right + padding &&
    point.y >= rect.top - padding &&
    point.y <= rect.bottom + padding;
}

function isFiniteGraphPoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) && Math.abs(point.x) < 100000 && Math.abs(point.y) < 100000;
}

// ---------- Graph render ----------
function visibleNodes() {
  return state.graph.nodes.filter(function (n) { return (n.parentId || null) === state.currentGroupId; });
}

function nodeById(id) {
  return state.graph.nodes.find(function (n) { return n.id === id; });
}

function resolvedPorts(node) {
  if (node && node.ports) return node.ports;
  const def = state.nodeTypes[node?.type] || {};
  return {
    inputs: def.inputs || {},
    outputs: def.outputs || {}
  };
}

function nodeWidth(node) {
  const def = state.nodeTypes[node.type] || {};
  return def.container ? 200 : NODE_WIDTH;
}

function nodePositionForRender(node) {
  return state.dragPreviewPositions[node.id] || node;
}

function syncNodeCardPosition(nodeId, position) {
  const card = el.nodeLayer.querySelector('.gnode[data-node-id="' + nodeId + '"]');
  if (!card || !position) return;
  card.style.left = position.x + "px";
  card.style.top = position.y + "px";
}

function readNodeCardPosition(node, card) {
  const inlineLeft = card ? Number.parseFloat(card.style.left) : NaN;
  const inlineTop = card ? Number.parseFloat(card.style.top) : NaN;
  if (Number.isFinite(inlineLeft) && Number.isFinite(inlineTop)) {
    return { x: inlineLeft, y: inlineTop };
  }
  const currentNode = nodeById(node.id);
  if (currentNode && Number.isFinite(Number(currentNode.x)) && Number.isFinite(Number(currentNode.y))) {
    return { x: Number(currentNode.x), y: Number(currentNode.y) };
  }
  return {
    x: Number.isFinite(Number(node.x)) ? Number(node.x) : 0,
    y: Number.isFinite(Number(node.y)) ? Number(node.y) : 0
  };
}

function portEntriesForNode(node, direction) {
  const ports = resolvedPorts(node);
  return Object.entries(direction === "input" ? ports.inputs || {} : ports.outputs || {});
}

function portIndexForNode(node, portName, direction) {
  return portEntriesForNode(node, direction).findIndex(function (entry) { return entry[0] === portName; });
}

function primaryOutputType(node) {
  const outputs = portEntriesForNode(node, "output");
  return outputs.length === 1 ? outputs[0][1].dataType : "";
}

function groupAccentForNode(node) {
  const outputs = portEntriesForNode(node, "output");
  if (outputs.length === 1 && outputs[0][1] && outputs[0][1].dataType) {
    return dataTypeColor(outputs[0][1].dataType);
  }
  return (state.nodeTypes.group && state.nodeTypes.group.accent) || "#8a97a3";
}

function inputAnchor(node, portName) {
  const pos = nodePositionForRender(node);
  const idx = Math.max(0, portIndexForNode(node, portName, "input"));
  return { x: pos.x + 10, y: pos.y + HEAD + PAD + idx * ROW + ROW / 2 };
}
function outputAnchor(node, portName) {
  const pos = nodePositionForRender(node);
  const idx = Math.max(0, portIndexForNode(node, portName, "output"));
  const width = nodeWidth(node);
  return { x: pos.x + width - 10, y: pos.y + HEAD + PAD + idx * ROW + ROW / 2 };
}

function renderGraph() {
  el.nodeLayer.innerHTML = "";
  const nodes = visibleNodes();
  for (const node of nodes) el.nodeLayer.appendChild(buildNodeElement(node));
  renderEdges(nodes);
  syncSelectedNodeCard();
}

function buildNodeElement(node) {
  const def = state.nodeTypes[node.type];
  const pos = nodePositionForRender(node);
  const card = document.createElement("div");
  card.className = "gnode" + (def.container ? " isGroup" : "") + (def.system ? " isSystem" : "") + (def.locked ? " isLocked" : "") + (state.selectedNodeIds.includes(node.id) ? " selected" : "");
  card.style.width = nodeWidth(node) + "px";
  card.style.left = pos.x + "px";
  card.style.top = pos.y + "px";
  card.dataset.nodeId = node.id;

  const head = document.createElement("div");
  head.className = "gnodeHead";
  const accent = document.createElement("span");
  accent.className = "gnodeAccent";
  const accentColor = def.container
    ? groupAccentForNode(node)
    : def.accent || dataTypeColor(primaryOutputType(node)) || "#7bd4ff";
  accent.style.background = accentColor;
  const title = document.createElement("span");
  title.className = "gnodeTitle";
  title.textContent = node.title;
  const typeTag = document.createElement("span");
  typeTag.className = "gnodeType";
  typeTag.textContent = def.label;
  head.append(accent, title, typeTag);
  if (def.system) {
    const badge = document.createElement("span");
    badge.className = "nodeBadge system";
    badge.textContent = "SYSTEM";
    head.appendChild(badge);
  }
  card.appendChild(head);

  const body = document.createElement("div");
  body.className = "gnodeBody";
  const inputs = document.createElement("div");
  inputs.className = "portCol inputs";
  for (const [portName, port] of Object.entries(resolvedPorts(node).inputs || {})) {
    inputs.appendChild(buildPort(node, portName, port, "input"));
  }
  const outputs = document.createElement("div");
  outputs.className = "portCol outputs";
  for (const [portName, port] of Object.entries(resolvedPorts(node).outputs || {})) {
    outputs.appendChild(buildPort(node, portName, port, "output"));
  }
  body.append(inputs, outputs);
  card.appendChild(body);

  if (def.container) {
    const enter = document.createElement("button");
    enter.type = "button";
    enter.className = "mini enterGroup";
    enter.textContent = "Open group";
    enter.addEventListener("click", function (event) { event.stopPropagation(); enterGroup(node); });
    card.appendChild(enter);
    if (node.type === "group") {
      const note = document.createElement("div");
      note.className = "groupHint";
      note.textContent = "Edit the group interface in the inspector.";
      card.appendChild(note);
    }
  } else if (def.system) {
    const foot = document.createElement("div");
    foot.className = "gnodeFoot";
    foot.textContent = "Locked system node";
    card.appendChild(foot);
  } else {
    const foot = document.createElement("div");
    foot.className = "gnodeFoot";
    foot.textContent = identityValue(node);
    card.appendChild(foot);
  }

  if (!def.locked) {
    head.addEventListener("pointerdown", function (event) { startNodeDrag(event, node, card); });
  }
  head.addEventListener("dblclick", function () { if (def.container) enterGroup(node); });
  card.addEventListener("pointerdown", function (event) {
    if (event.button !== 0) return;
    if (event.target.closest(".port, .enterGroup")) return;
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      selectNode(node.id, false, { toggle: true, clearPendingEdge: true });
      return;
    }
    if (event.shiftKey) {
      event.preventDefault();
      selectNode(node.id, false, { extend: true, clearPendingEdge: true });
      return;
    }
    selectNode(node.id, false, { clearPendingEdge: true });
  });
  return card;
}

function identityValue(node) {
  const def = state.nodeTypes[node.type];
  const idKey = Object.keys(def.fields).find(function (key) { return def.fields[key].pattern === "^[a-z0-9_:-]+$"; });
  return idKey && node.values[idKey] ? node.values[idKey] : "(geen id)";
}

function buildPort(node, portName, port, direction) {
  const wrap = document.createElement("div");
  wrap.className = "port";
  const dot = document.createElement("span");
  dot.className = "portDot";
  dot.style.borderColor = dataTypeColor(port.dataType);
  dot.style.background = dataTypeColor(port.dataType);
  if (state.pendingEdge && state.pendingEdge.fromNodeId === node.id && state.pendingEdge.fromPort === portName) wrap.classList.add("armed");
  const label = document.createElement("span");
  label.textContent = port.label;
  wrap.append(dot, label);
  wrap.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
  wrap.addEventListener("click", function (event) {
    event.stopPropagation();
    onPortClick(node, portName, port, direction);
  });
  return wrap;
}

function onPortClick(node, portName, port, direction) {
  if (direction === "output") {
    state.pendingEdge = { fromNodeId: node.id, fromPort: portName, dataType: port.dataType };
    setStatus("Output gekozen: " + port.label + ". Kies nu een input-poort.", "");
    renderGraph();
    return;
  }
  if (!state.pendingEdge) {
    setStatus("Kies eerst een output-poort.", "");
    return;
  }
  connectEdge(state.pendingEdge, { toNodeId: node.id, toPort: portName });
}

async function connectEdge(from, to) {
  await applyGraphMutation(function () {
    return api("/api/editor/edges", {
      method: "POST",
      body: JSON.stringify({ edge: { fromNodeId: from.fromNodeId, fromPort: from.fromPort, toNodeId: to.toNodeId, toPort: to.toPort } })
    });
  }, {
    historyLabel: "Verbinding gemaakt",
    clearPendingEdge: true,
    refreshViewport: true,
    refreshValidation: true,
    afterApply: function () {
      setStatus("Verbinding gemaakt.", "success");
    }
  });
}

function renderEdges(nodes) {
  const visibleIds = new Set(nodes.map(function (n) { return n.id; }));
  let markup = "";
  for (const edge of state.graph.edges) {
    if (!visibleIds.has(edge.fromNodeId) || !visibleIds.has(edge.toNodeId)) continue;
    const fromNode = nodeById(edge.fromNodeId);
    const toNode = nodeById(edge.toNodeId);
    if (!fromNode || !toNode) continue;
    const a = outputAnchor(fromNode, edge.fromPort);
    const b = inputAnchor(toNode, edge.toPort);
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
    const path = "M " + a.x + " " + a.y + " C " + (a.x + dx) + " " + a.y + " " + (b.x - dx) + " " + b.y + " " + b.x + " " + b.y;
    const isSelected = state.selectedEdgeIds.includes(edge.id);
    const selected = isSelected ? " selected" : "";
    const edgeColor = isSelected ? "#7bd4ff" : dataTypeColor(edgeDataType(fromNode, edge.fromPort));
    if (isSelected) {
      const midX = Math.round((a.x + b.x) / 2);
      const midY = Math.round((a.y + b.y) / 2);
      markup += "<path class=\"edgeGlow\" d=\"" + path + "\"></path>";
      markup += "<circle class=\"edgeMarker\" cx=\"" + midX + "\" cy=\"" + midY + "\" r=\"4\"></circle>";
    }
    markup += "<path class=\"typed" + selected + "\" data-edge-id=\"" + edge.id + "\" d=\"" + path + "\" stroke=\"" + edgeColor + "\"></path>";
  }
  el.edgeLayer.innerHTML = markup;
  syncSelectedEdgeCard();
}

let edgeRenderFrame = null;
function scheduleEdgeRender() {
  if (edgeRenderFrame) return;
  edgeRenderFrame = requestAnimationFrame(function () {
    edgeRenderFrame = null;
    renderEdges(visibleNodes());
  });
}

function edgeDataType(node, portName) {
  const ports = resolvedPorts(node);
  return ports.outputs && ports.outputs[portName] ? ports.outputs[portName].dataType : "";
}

el.edgeLayer.addEventListener("pointerdown", function (event) {
  const path = event.target.closest ? event.target.closest("[data-edge-id]") : null;
  if (!path) return;
  event.stopPropagation();
  event.preventDefault();
  const edgeId = path.dataset.edgeId;
  const additive = event.shiftKey || event.ctrlKey || event.metaKey;
  if (additive) {
    selectEdge(edgeId, { toggle: event.ctrlKey || event.metaKey, extend: event.shiftKey, clearPendingEdge: true });
  } else {
    selectEdge(edgeId, { clearPendingEdge: true });
  }
});

function cloneGraphForRestore(graph) {
  return clonePlain(snapshotGraph(graph || state.graph));
}

async function restoreGraphObject(nextGraph, options = {}) {
  return await applyGraphMutation(function () {
    return api(RESTORE_GRAPH_ROUTE, {
      method: "POST",
      body: JSON.stringify({ graph: nextGraph })
    });
  }, Object.assign({
    refreshGraph: true,
    refreshEdgeList: false,
    refreshInspector: true,
    refreshViewport: false,
    refreshValidation: true,
    clearPendingEdge: true
  }, options));
}

// ---------- Node drag + pan + zoom ----------
function startNodeDrag(event, node, card) {
  if (event.button !== 0 || event.isPrimary === false) return;
  if (event.target.closest(".port, .enterGroup")) return;
  event.preventDefault();
  event.stopPropagation();
  const movingNodeIds = state.selectedNodeIds.includes(node.id) && state.selectedNodeIds.length ? state.selectedNodeIds.slice() : [node.id];
  if (!state.selectedNodeIds.includes(node.id) || state.selectedNodeIds.length !== movingNodeIds.length) {
    setSelection([node.id], [], { primaryNodeId: node.id, clearPendingEdge: true });
  }
  const dragTarget = event.currentTarget;
  const pointerId = event.pointerId;
  const origins = new Map();
  for (const nodeId of movingNodeIds) {
    const movingNode = nodeById(nodeId);
    if (!movingNode) continue;
    const movingCard = el.nodeLayer.querySelector('.gnode[data-node-id="' + nodeId + '"]');
    const position = readNodeCardPosition(movingNode, movingCard);
    origins.set(nodeId, position);
  }
  const originPosition = origins.get(node.id) || readNodeCardPosition(node, card);
  const originX = originPosition.x;
  const originY = originPosition.y;
  const startPoint = clientToGraphPoint(event.clientX, event.clientY);
  if (!isFiniteGraphPoint(startPoint)) {
    setStatus("Drag start had invalid coordinates.", "error");
    editorDebug.lastInvalidDrag = { reason: "invalid-start", clientX: event.clientX, clientY: event.clientY };
    return;
  }
  const sessionId = ++state.dragSessionCounter;
  state.dragSession = {
    sessionId: sessionId,
    nodeId: node.id,
    nodeIds: movingNodeIds.slice(),
    pointerId: pointerId,
    origin: { x: originX, y: originY },
    origins: origins,
    startPoint: startPoint,
    lastPoint: startPoint,
    nextPositions: new Map(Array.from(origins.entries())),
    didMove: false
  };
  editorDebug.dragSessions += 1;
  editorDebug.activeDragSession = {
    sessionId: sessionId,
    nodeId: node.id,
    nodeIds: movingNodeIds.slice(),
    pointerId: pointerId,
    origin: { x: originX, y: originY },
    startPoint: { x: startPoint.x, y: startPoint.y }
  };
  editorDebug.lastClientPoint = { x: event.clientX, y: event.clientY };
  editorDebug.lastGraphPoint = { x: startPoint.x, y: startPoint.y };
  if (dragTarget && typeof dragTarget.setPointerCapture === "function") {
    try { dragTarget.setPointerCapture(pointerId); } catch {}
  }
  const historySnapshot = captureHistorySnapshot(movingNodeIds.length > 1 ? "Nodes verplaatst" : "Node verplaatst");
  const dragBounds = 100000;
  card.classList.add("dragging");
  for (const [nodeId, position] of origins.entries()) {
    state.dragPreviewPositions[nodeId] = { x: position.x, y: position.y };
  }

  function cleanup(resetPosition) {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    if (dragTarget) dragTarget.removeEventListener("lostpointercapture", onLostPointerCapture);
    card.classList.remove("dragging");
    if (dragTarget && typeof dragTarget.releasePointerCapture === "function") {
      try { dragTarget.releasePointerCapture(pointerId); } catch {}
    }
    if (resetPosition) {
      for (const [nodeId, position] of origins.entries()) {
        delete state.dragPreviewPositions[nodeId];
        syncNodeCardPosition(nodeId, { x: position.x, y: position.y });
        const movingCard = el.nodeLayer.querySelector('.gnode[data-node-id="' + nodeId + '"]');
        if (movingCard) {
          movingCard.style.left = position.x + "px";
          movingCard.style.top = position.y + "px";
        }
      }
      scheduleEdgeRender();
    }
    if (state.dragSession && state.dragSession.sessionId === sessionId) state.dragSession = null;
    if (editorDebug.activeDragSession && editorDebug.activeDragSession.sessionId === sessionId) editorDebug.activeDragSession = null;
  }

  function onMove(moveEvent) {
    if (moveEvent.pointerId !== pointerId) return;
    const graphPoint = clientToGraphPoint(moveEvent.clientX, moveEvent.clientY);
    editorDebug.lastClientPoint = { x: moveEvent.clientX, y: moveEvent.clientY };
    if (!isFiniteGraphPoint(graphPoint)) {
      editorDebug.lastInvalidDrag = { reason: "invalid-point", sessionId: sessionId, client: editorDebug.lastClientPoint };
      return;
    }
    const dx = graphPoint.x - startPoint.x;
    const dy = graphPoint.y - startPoint.y;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) state.dragSession.didMove = true;
    const nextPositions = new Map();
    for (const [nodeId, position] of origins.entries()) {
      const nextX = Math.round(position.x + dx);
      const nextY = Math.round(position.y + dy);
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY) || Math.abs(nextX) > dragBounds || Math.abs(nextY) > dragBounds) {
        editorDebug.lastInvalidDrag = {
          reason: "invalid-preview",
          sessionId: sessionId,
          client: editorDebug.lastClientPoint,
          graphPoint: graphPoint,
          next: { x: nextX, y: nextY },
          nodeId: nodeId
        };
        setStatus("Ongeldige sleep-coördinaten voor " + node.title + ".", "error");
        return;
      }
      nextPositions.set(nodeId, { x: nextX, y: nextY });
    }
    state.dragSession.lastPoint = graphPoint;
    state.dragSession.nextPositions = nextPositions;
    editorDebug.lastGraphPoint = { x: graphPoint.x, y: graphPoint.y };
    for (const [nodeId, position] of nextPositions.entries()) {
      state.dragPreviewPositions[nodeId] = { x: position.x, y: position.y };
      syncNodeCardPosition(nodeId, position);
      const movingCard = el.nodeLayer.querySelector('.gnode[data-node-id="' + nodeId + '"]');
      if (movingCard) {
        movingCard.style.left = position.x + "px";
        movingCard.style.top = position.y + "px";
      }
    }
    scheduleEdgeRender();
  }

  async function finishDrag(commit) {
    const sessionState = state.dragSession;
    const committedPositions = sessionState && sessionState.nextPositions && sessionState.nextPositions.size
      ? Array.from(sessionState.nextPositions.entries())
      : Array.from(origins.entries());
    cleanup(!commit);
    if (!commit) return;
    const nextGraph = cloneGraphForRestore(state.graph);
    for (const [nodeId, position] of committedPositions) {
      const graphNode = nextGraph.nodes.find(function (candidate) { return candidate.id === nodeId; });
      if (!graphNode) continue;
      graphNode.x = position.x;
      graphNode.y = position.y;
    }
    const result = await restoreGraphObject(nextGraph, {
      historySnapshot: historySnapshot,
      historyLabel: movingNodeIds.length > 1 ? "Nodes verplaatst" : "Node verplaatst",
      selectedNodeIds: movingNodeIds.slice(),
      refreshGraph: true,
      refreshEdgeList: false,
      refreshInspector: true,
      refreshViewport: false,
      refreshValidation: false,
      afterApply: function () {
        for (const [nodeId, position] of committedPositions) delete state.dragPreviewPositions[nodeId];
        scheduleEdgeRender();
        setStatus(movingNodeIds.length > 1 ? "Nodes verplaatst." : "Node verplaatst.", "success");
      }
    });
    if (!result) {
      for (const [nodeId, position] of origins.entries()) {
        delete state.dragPreviewPositions[nodeId];
        syncNodeCardPosition(nodeId, position);
      }
      setStatus("Ongeldige sleep-coördinaten voor " + node.title + ".", "error");
    }
  }

  function onUp(upEvent) {
    if (upEvent.pointerId !== pointerId) return;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    if (dragTarget) dragTarget.removeEventListener("lostpointercapture", onLostPointerCapture);
    const shouldCommit = Boolean(state.dragSession && state.dragSession.sessionId === sessionId && state.dragSession.didMove && state.dragSession.nextPositions);
    finishDrag(shouldCommit);
  }

  function onCancel(cancelEvent) {
    if (cancelEvent.pointerId !== pointerId) return;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    if (dragTarget) dragTarget.removeEventListener("lostpointercapture", onLostPointerCapture);
    cleanup(true);
  }

  function onLostPointerCapture(lostEvent) {
    if (lostEvent.pointerId !== pointerId) return;
    onCancel(lostEvent);
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  if (dragTarget) dragTarget.addEventListener("lostpointercapture", onLostPointerCapture);
}

function applyTransform() {
  el.graphContent.style.transform = "translate(" + state.view.panX + "px," + state.view.panY + "px) scale(" + state.view.scale + ")";
}

function showSelectionBox(startX, startY, endX, endY) {
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.max(0, Math.abs(endX - startX));
  const height = Math.max(0, Math.abs(endY - startY));
  selectionBox.hidden = false;
  selectionBox.style.left = left + "px";
  selectionBox.style.top = top + "px";
  selectionBox.style.width = width + "px";
  selectionBox.style.height = height + "px";
}

function hideSelectionBox() {
  selectionBox.hidden = true;
  selectionBox.style.left = "0px";
  selectionBox.style.top = "0px";
  selectionBox.style.width = "0px";
  selectionBox.style.height = "0px";
}

function marqueeIntersectingNodeIds(rect) {
  const ids = [];
  for (const card of el.nodeLayer.querySelectorAll(".gnode")) {
    const nodeRect = card.getBoundingClientRect();
    const intersects = !(nodeRect.right < rect.left || nodeRect.left > rect.right || nodeRect.bottom < rect.top || nodeRect.top > rect.bottom);
    if (intersects) ids.push(card.dataset.nodeId);
  }
  return ids;
}

function marqueeIntersectingEdgeIds(rect) {
  const ids = [];
  for (const path of el.edgeLayer.querySelectorAll("[data-edge-id]")) {
    const edgeRect = path.getBoundingClientRect();
    const intersects = !(edgeRect.right < rect.left || edgeRect.left > rect.right || edgeRect.bottom < rect.top || edgeRect.top > rect.bottom);
    if (!intersects) continue;
    if (typeof path.getTotalLength !== "function" || typeof path.getPointAtLength !== "function") {
      ids.push(path.dataset.edgeId);
      continue;
    }
    const totalLength = path.getTotalLength();
    if (!Number.isFinite(totalLength) || totalLength <= 0) continue;
    const samples = Math.min(160, Math.max(24, Math.ceil(totalLength / 8)));
    let hit = false;
    for (let index = 0; index <= samples; index += 1) {
      const point = path.getPointAtLength(totalLength * index / samples);
      const clientPoint = graphPointToClientPoint(point);
      if (rectContainsPoint(rect, clientPoint, 4)) {
        hit = true;
        break;
      }
    }
    if (hit) ids.push(path.dataset.edgeId);
  }
  return ids;
}

el.graphViewport.addEventListener("contextmenu", function (event) {
  event.preventDefault();
});

el.graphViewport.addEventListener("pointerdown", function (event) {
  if (event.button === 2) {
    event.preventDefault();
    el.graphViewport.classList.add("panning");
    const startX = event.clientX;
    const startY = event.clientY;
    const originPanX = state.view.panX;
    const originPanY = state.view.panY;
    function onMove(moveEvent) {
      if (moveEvent.buttons === 0) return;
      state.view.panX = originPanX + (moveEvent.clientX - startX);
      state.view.panY = originPanY + (moveEvent.clientY - startY);
      applyTransform();
    }
    function onUp() {
      el.graphViewport.classList.remove("panning");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return;
  }
  if (event.button !== 0) return;
  if (event.target.closest(".gnode, .port, .enterGroup")) return;
  event.preventDefault();
  const startPoint = clientToViewportPoint(event.clientX, event.clientY);
  const startX = startPoint.x;
  const startY = startPoint.y;
  let moved = false;
  const additive = event.shiftKey || event.ctrlKey || event.metaKey;
  showSelectionBox(startX, startY, startX, startY);
  function onMove(moveEvent) {
    if (moveEvent.pointerId !== event.pointerId) return;
    const currentPoint = clientToViewportPoint(moveEvent.clientX, moveEvent.clientY);
    const dx = currentPoint.x - startX;
    const dy = currentPoint.y - startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
    showSelectionBox(startX, startY, currentPoint.x, currentPoint.y);
  }
  function onUp(upEvent) {
    if (upEvent.pointerId !== event.pointerId) return;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    if (!moved) {
      clearSelection({ clearPendingEdge: true });
      hideSelectionBox();
      return;
    }
    const rect = selectionBox.getBoundingClientRect();
    const ids = marqueeIntersectingNodeIds(rect);
    const edgeIds = marqueeIntersectingEdgeIds(rect);
    if (additive) {
      const combined = new Set(state.selectedNodeIds);
      for (const id of ids) combined.add(id);
      const combinedEdges = new Set(state.selectedEdgeIds);
      for (const id of edgeIds) combinedEdges.add(id);
      setSelection(Array.from(combined), Array.from(combinedEdges), { primaryNodeId: ids[0] || state.selectedNodeId, clearPendingEdge: true });
    } else {
      setSelection(ids, edgeIds, { primaryNodeId: ids[0] || null, clearPendingEdge: true });
    }
    hideSelectionBox();
  }
  function onCancel() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    hideSelectionBox();
  }
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
});

el.graphViewport.addEventListener("wheel", function (event) {
  event.preventDefault();
  const rect = el.graphViewport.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;
  const oldScale = state.view.scale;
  const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
  const newScale = Math.min(2.2, Math.max(0.25, oldScale * factor));
  state.view.panX = mouseX - (mouseX - state.view.panX) * (newScale / oldScale);
  state.view.panY = mouseY - (mouseY - state.view.panY) * (newScale / oldScale);
  state.view.scale = newScale;
  applyTransform();
}, { passive: false });

el.zoomResetButton.addEventListener("click", function () {
  state.view = { panX: 40, panY: 40, scale: 1 };
  applyTransform();
});

if (el.viewportInfoButton) el.viewportInfoButton.addEventListener("click", toggleViewportHelp);
if (el.snapModeSelect) el.snapModeSelect.addEventListener("change", function () {
  setViewportSnap(el.snapModeSelect.value, el.snapGridInput ? el.snapGridInput.value : state.snapGridSize);
});
if (el.snapGridInput) el.snapGridInput.addEventListener("change", function () {
  setViewportSnap(el.snapModeSelect ? el.snapModeSelect.value : state.snapMode, el.snapGridInput.value);
});

// ---------- Groups + breadcrumb ----------
function enterGroup(node) {
  state.currentGroupId = node.id;
  clearSelection({ clearPendingEdge: true });
  state.view = { panX: 40, panY: 40, scale: 1 };
  syncBreadcrumb();
  renderGraph();
  renderInspector();
  applyTransform();
}

function renderBreadcrumb() {
  el.breadcrumb.innerHTML = "";
  state.breadcrumb.forEach(function (crumb, index) {
    if (index > 0) {
      const sep = document.createElement("span");
      sep.className = "sep";
      sep.textContent = ">";
      el.breadcrumb.appendChild(sep);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = crumb.title;
    if (index === state.breadcrumb.length - 1) button.classList.add("crumbActive");
    button.addEventListener("click", function () { navigateToCrumb(index); });
    el.breadcrumb.appendChild(button);
  });
}

function navigateToCrumb(index) {
  state.currentGroupId = state.breadcrumb[index].id;
  clearSelection({ clearPendingEdge: true });
  syncBreadcrumb();
  renderGraph();
  renderInspector();
}

// ---------- Selection + inspector ----------
function renderInspector() {
  el.inspectorForm.innerHTML = "";
  const selectedNodes = state.selectedNodeIds.map(function (id) { return nodeById(id); }).filter(Boolean);
  const selectedEdges = state.selectedEdgeIds.map(function (id) {
    return state.graph.edges.find(function (edge) { return edge.id === id; }) || null;
  }).filter(Boolean);
  const node = nodeById(state.selectedNodeId);
  if (selectedNodes.length > 1) {
    const heading = document.createElement("div");
    heading.className = "libGroupTitle";
    heading.textContent = selectedNodes.length + " nodes geselecteerd";
    el.inspectorForm.appendChild(heading);
    const hint = document.createElement("div");
    hint.className = "inspectorHint";
    hint.textContent = "Gebruik Delete om ze te verwijderen, Ctrl+C/Ctrl+X voor kopiëren of knippen, en sleep een geselecteerde node om de hele selectie te verplaatsen.";
    el.inspectorForm.appendChild(hint);
    const actions = document.createElement("div");
    actions.className = "inspectorActions";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "mini";
    copy.textContent = "Kopieer";
    copy.addEventListener("click", copySelectionToClipboard);
    const cut = document.createElement("button");
    cut.type = "button";
    cut.className = "mini";
    cut.textContent = "Knip";
    cut.addEventListener("click", cutSelection);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "deleteNode";
    del.textContent = "Verwijder";
    del.addEventListener("click", deleteSelectedNodes);
    actions.append(copy, cut, del);
    el.inspectorForm.appendChild(actions);
    renderViewportControls();
    return;
  }
  if (!node && selectedEdges.length) {
    const heading = document.createElement("div");
    heading.className = "libGroupTitle";
    heading.textContent = selectedEdges.length + " verbinding" + (selectedEdges.length === 1 ? "" : "en") + " geselecteerd";
    el.inspectorForm.appendChild(heading);
    const hint = document.createElement("div");
    hint.className = "inspectorHint";
    hint.textContent = "Selecteer een verbinding om hem te verwijderen. Klik op de lijn en druk Delete, of gebruik de knop hieronder.";
    el.inspectorForm.appendChild(hint);
    if (selectedEdges.length === 1) {
      const edge = selectedEdges[0];
      const fromNode = nodeById(edge.fromNodeId);
      const toNode = nodeById(edge.toNodeId);
      const detail = document.createElement("div");
      detail.className = "inspectorEdgeSummary";
      detail.textContent = (fromNode ? fromNode.title : edge.fromNodeId) + "." + edge.fromPort + " → " + (toNode ? toNode.title : edge.toNodeId) + "." + edge.toPort;
      el.inspectorForm.appendChild(detail);
    }
    const actions = document.createElement("div");
    actions.className = "inspectorActions";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "deleteNode";
    del.textContent = "Verwijder verbinding";
    del.addEventListener("click", deleteSelectedNodes);
    actions.appendChild(del);
    el.inspectorForm.appendChild(actions);
    renderViewportControls();
    return;
  }
  if (!node) {
    const empty = document.createElement("div");
    empty.className = "inspectorEmpty";
    empty.textContent = "Selecteer een node om eigenschappen te bewerken.";
    el.inspectorForm.appendChild(empty);
    renderViewportControls();
    return;
  }
  const def = state.nodeTypes[node.type];
  const heading = document.createElement("div");
  heading.className = "libGroupTitle";
  heading.textContent = def.label + " - " + node.title;
  el.inspectorForm.appendChild(heading);
  if (node.type === "group") {
    const hint = document.createElement("div");
    hint.className = "inspectorHint";
    hint.textContent = "Stel hier de Group Interface in. De typed ports bepalen wat de Group Node buiten de group aanbiedt en wat Group Input/Output binnen de group tonen.";
    el.inspectorForm.appendChild(hint);
  }

  if (node.type === "model_entity" || node.type === "player_character") {
    const previewWrap = document.createElement("div");
    previewWrap.className = "field";
    const previewLabel = document.createElement("label");
    previewLabel.textContent = "Preview animations";
    const previewRow = document.createElement("div");
    previewRow.className = "colorRow";
    const preview = document.createElement("input");
    preview.type = "checkbox";
    preview.checked = state.previewAnimations;
    preview.addEventListener("change", function () {
      setAnimationPreviewEnabled(preview.checked);
    });
    const previewHint = document.createElement("div");
    previewHint.className = "inspectorHint";
    previewHint.textContent = "Editor-only. Wanneer uit staat, blijven GLB-mixers gepauzeerd voor performance.";
    previewRow.appendChild(preview);
    previewWrap.append(previewLabel, previewRow, previewHint);
    el.inspectorForm.appendChild(previewWrap);
  }

  for (const [key, field] of Object.entries(def.fields)) {
    el.inspectorForm.appendChild(buildField(node, key, field));
  }

  const actions = document.createElement("div");
  actions.className = "inspectorActions";
  if (node.type !== "game_output" && !def.system) {
    const dup = document.createElement("button");
    dup.type = "button";
    dup.className = "mini";
    dup.textContent = "Dupliceer";
    dup.addEventListener("click", function () { duplicateNode(node.id); });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "deleteNode";
    del.textContent = "Verwijder";
    del.addEventListener("click", function () { deleteNode(node.id); });
    actions.append(dup, del);
  }
  el.inspectorForm.appendChild(actions);
  renderViewportControls();
}

function buildField(node, key, field) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const label = document.createElement("label");
  label.textContent = field.label;
  wrap.appendChild(label);
  const value = effectiveFieldValue(field, node.values[key]);

  if (field.type === "boolean") {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = value === true;
    input.addEventListener("change", function () { patchValues(node.id, makePatch(key, input.checked), { historyLabel: field.label, refreshViewport: shouldRefreshViewportForNode(node.id), refreshValidation: true }); });
    wrap.appendChild(input);
  } else if (field.type === "select") {
    const select = document.createElement("select");
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = field.dynamicOptions === "assetAnimations" ? animationBlankLabel(key) : "(kies)";
    select.appendChild(blank);
    const options = field.dynamicOptions === "assetAnimations"
      ? animationClipsForAsset(assetById(node.values.modelAssetId))
      : (field.options || []).map(function (option, index) {
        return { name: option, index: index };
      });
    for (const option of options) {
      const opt = document.createElement("option");
      opt.value = option.name;
      opt.textContent = option.name;
      if (option.name === value) opt.selected = true;
      select.appendChild(opt);
    }
    select.value = value || "";
    select.addEventListener("change", function () {
      patchValues(node.id, makePatch(key, select.value), { historyLabel: field.label, refreshViewport: shouldRefreshViewportForNode(node.id), refreshValidation: true });
    });
    wrap.appendChild(select);
    if (field.dynamicOptions === "assetAnimations") {
      const selectedAsset = assetById(node.values.modelAssetId);
      const clipNames = options.map(function (option) { return option.name; });
      const hasClip = value && clipNames.includes(value);
      if (!selectedAsset) {
        const hint = document.createElement("div");
        hint.className = "inspectorHint";
        hint.textContent = "Kies eerst een model asset om animaties te tonen.";
        wrap.appendChild(hint);
      } else if (!clipNames.length) {
        const hint = document.createElement("div");
        hint.className = "inspectorHint";
        hint.textContent = "Deze asset heeft geen animaties.";
        wrap.appendChild(hint);
      } else if (value && !hasClip) {
        const hint = document.createElement("div");
        hint.className = "inspectorHint";
        hint.textContent = "Gekozen clip ontbreekt in deze asset. De runtime valt terug op de default clip.";
        wrap.appendChild(hint);
      }
    }
  } else if (field.type === "asset") {
    const select = document.createElement("select");
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "(kies asset)";
    select.appendChild(blank);
    for (const asset of state.assets.filter(function (a) { return field.assetTypes.includes(a.assetType); })) {
      const opt = document.createElement("option");
      opt.value = asset.id;
      opt.textContent = asset.name + " (" + asset.assetType + ")";
      if (asset.id === value) opt.selected = true;
      select.appendChild(opt);
    }
    select.value = value || "";
    select.addEventListener("change", function () {
      const patch = makePatch(key, select.value);
      if (key === "modelAssetId" && (node.type === "model_entity" || node.type === "player_character")) {
        const selectedAsset = assetById(select.value);
        const resolvedAnimationClip = resolveAnimationClipForAsset(selectedAsset, node.values.animationClip);
        const resolvedIdleAnimation = resolveIdleAnimationForAsset(selectedAsset, node.values.idleAnimation);
        const resolvedWalkAnimation = resolveOptionalAnimationForAsset(selectedAsset, node.values.walkAnimation);
        const resolvedRunAnimation = resolveOptionalAnimationForAsset(selectedAsset, node.values.runAnimation);
        if (resolvedAnimationClip !== node.values.animationClip) patch.animationClip = resolvedAnimationClip;
        if (resolvedIdleAnimation !== node.values.idleAnimation) patch.idleAnimation = resolvedIdleAnimation;
        if (resolvedWalkAnimation !== node.values.walkAnimation) patch.walkAnimation = resolvedWalkAnimation;
        if (resolvedRunAnimation !== node.values.runAnimation) patch.runAnimation = resolvedRunAnimation;
      }
      patchValues(node.id, patch, { historyLabel: field.label, refreshViewport: shouldRefreshViewportForNode(node.id), refreshValidation: true });
    });
    wrap.appendChild(select);
  } else if (field.type === "color") {
    const row = document.createElement("div");
    row.className = "colorRow";
    const color = document.createElement("input");
    color.type = "color";
    color.value = /^#[0-9a-fA-F]{6}$/.test(value || "") ? value : "#ffffff";
    const text = document.createElement("input");
    text.type = "text";
    text.value = value || "";
    text.placeholder = "#ffffff";
    let committedColorValue = text.value;
    let pendingColorValue = null;
    function commitColor(nextValue) {
      if (nextValue === committedColorValue || nextValue === pendingColorValue) return;
      pendingColorValue = nextValue;
      patchValues(node.id, makePatch(key, nextValue), {
        historyLabel: field.label,
        refreshViewport: shouldRefreshViewportForNode(node.id),
        refreshValidation: true
      }).then(function (result) {
        if (result) committedColorValue = nextValue;
      }).finally(function () {
        if (pendingColorValue === nextValue) pendingColorValue = null;
      });
    }
    color.addEventListener("input", function () { text.value = color.value; });
    color.addEventListener("change", function () { commitColor(color.value); });
    color.addEventListener("blur", function () { commitColor(color.value); });
    text.addEventListener("change", function () { commitColor(text.value); });
    text.addEventListener("blur", function () { commitColor(text.value); });
    text.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commitColor(text.value);
      text.blur();
    });
    row.append(color, text);
    wrap.appendChild(row);
  } else if (field.type === "json") {
    if (node.type === "group" && key === "groupInterface") {
      wrap.appendChild(buildGroupInterfaceEditor(node, key, value));
      return wrap;
    }
    const textarea = document.createElement("textarea");
    textarea.rows = 6;
    textarea.placeholder = JSON.stringify(groupInterfaceDefault(), null, 2);
    try {
      textarea.value = JSON.stringify(value === undefined ? {} : value, null, 2);
    } catch {
      textarea.value = "{}";
    }
    textarea.addEventListener("change", function () {
      try {
        const parsed = JSON.parse(textarea.value || "{}");
        patchValues(node.id, makePatch(key, parsed), {
          historyLabel: field.label,
          refreshViewport: shouldRefreshViewportForNode(node.id),
          refreshValidation: true
        });
      } catch (error) {
        setStatus(field.label + " moet geldige JSON zijn.", "error");
      }
    });
    textarea.addEventListener("blur", function () {
      try {
        const parsed = JSON.parse(textarea.value || "{}");
        patchValues(node.id, makePatch(key, parsed), {
          historyLabel: field.label,
          refreshViewport: shouldRefreshViewportForNode(node.id),
          refreshValidation: true
        });
      } catch {}
    });
    wrap.appendChild(textarea);
  } else if (field.type === "keycode") {
    const row = document.createElement("div");
    row.className = "colorRow";
    const text = document.createElement("input");
    text.type = "text";
    text.value = value || "";
    text.placeholder = "KeyW";
    text.addEventListener("change", function () { patchValues(node.id, makePatch(key, text.value), { historyLabel: field.label, refreshViewport: shouldRefreshViewportForNode(node.id), refreshValidation: true }); });
    const capture = document.createElement("button");
    capture.type = "button";
    capture.className = "mini";
    capture.textContent = "Capture";
    capture.addEventListener("click", function () {
      capture.textContent = "Druk toets...";
      const handler = function (keyEvent) {
        keyEvent.preventDefault();
        keyEvent.stopImmediatePropagation();
        text.value = keyEvent.code;
        capture.textContent = "Capture";
        window.removeEventListener("keydown", handler, true);
        patchValues(node.id, makePatch(key, keyEvent.code), { historyLabel: field.label, refreshViewport: shouldRefreshViewportForNode(node.id), refreshValidation: true });
      };
      window.addEventListener("keydown", handler, true);
    });
    row.append(text, capture);
    wrap.appendChild(row);
  } else {
    const input = document.createElement("input");
    input.type = field.type === "number" ? "number" : "text";
    if (field.type === "number") {
      if (field.step !== undefined) input.step = String(field.step);
      if (field.min !== undefined) input.min = String(field.min);
      if (field.max !== undefined) input.max = String(field.max);
    }
    input.value = value === null || value === undefined ? "" : value;
    input.addEventListener("change", function () {
      patchValues(node.id, makePatch(key, field.type === "number" ? Number(input.value) : input.value), {
        historyLabel: field.label,
        refreshViewport: shouldRefreshViewportForNode(node.id),
        refreshValidation: true
      });
    });
    wrap.appendChild(input);
  }
  return wrap;
}

function cloneGroupPort(port) {
  if (!port || typeof port !== "object") return null;
  const name = typeof port.name === "string" && port.name.trim()
    ? port.name.trim()
    : typeof port.id === "string" && port.id.trim()
      ? port.id.trim()
      : "";
  const dataType = typeof port.dataType === "string" && port.dataType.trim()
    ? port.dataType.trim()
    : typeof port.type === "string" && port.type.trim()
      ? port.type.trim()
      : "";
  if (!name || !dataType) return null;
  return {
    id: typeof port.id === "string" && port.id.trim() ? port.id.trim() : name,
    name: name,
    label: typeof port.label === "string" && port.label.trim() ? port.label.trim() : name,
    dataType: dataType,
    multiple: port.multiple === undefined ? isMultiValueDataType(dataType) : Boolean(port.multiple)
  };
}

function cloneGroupInterface(value) {
  const source = value && typeof value === "object" ? value : groupInterfaceDefault();
  return {
    inputs: Array.isArray(source.inputs) ? source.inputs.map(cloneGroupPort).filter(Boolean) : [],
    outputs: Array.isArray(source.outputs) ? source.outputs.map(cloneGroupPort).filter(Boolean) : []
  };
}

function uniqueGroupPortName(baseName, ports) {
  const existing = new Set((ports || []).map(function (port) { return port.name; }));
  if (!existing.has(baseName)) return baseName;
  let index = 2;
  while (existing.has(baseName + "_" + index)) index += 1;
  return baseName + "_" + index;
}

function createGroupPort(direction, ports) {
  const baseName = direction === "input" ? "input_1" : "output_1";
  const label = direction === "input" ? "Input" : "Output";
  const name = uniqueGroupPortName(baseName, ports);
  return {
    id: direction + "_" + name,
    name: name,
    label: label,
    dataType: "keybind",
    multiple: true
  };
}

function buildGroupInterfaceEditor(node, key, value) {
  const editor = document.createElement("div");
  editor.className = "groupInterfaceEditor";
  const interfaceState = cloneGroupInterface(value);

  function commit() {
    patchValues(node.id, makePatch(key, cloneGroupInterface(interfaceState)), {
      historyLabel: "Group interface",
      refreshViewport: false,
      refreshValidation: true
    });
  }

  function buildSection(direction, titleText) {
    const section = document.createElement("div");
    section.className = "groupInterfaceSection";
    const header = document.createElement("div");
    header.className = "groupInterfaceSectionHead";
    const title = document.createElement("div");
    title.className = "groupInterfaceSectionTitle";
    title.textContent = titleText;
    const add = document.createElement("button");
    add.type = "button";
    add.className = "mini";
    add.textContent = "Add " + direction;
    add.addEventListener("click", function () {
      const nextPort = createGroupPort(direction, interfaceState[direction + "s"]);
      interfaceState[direction + "s"].push(nextPort);
      commit();
    });
    header.append(title, add);
    section.appendChild(header);

    const ports = interfaceState[direction + "s"];
    if (!ports.length) {
      const empty = document.createElement("div");
      empty.className = "groupInterfaceEmpty";
      empty.textContent = direction === "input"
        ? "Geen inputs. Voeg een input toe om Group Input bruikbaar te maken."
        : "Geen outputs. Voeg een output toe om Group Output bruikbaar te maken.";
      section.appendChild(empty);
      return section;
    }

    for (const port of ports) {
      const row = document.createElement("div");
      row.className = "groupInterfacePort";
      const topRow = document.createElement("div");
      topRow.className = "groupInterfacePortRow groupInterfacePortTop";
      const bottomRow = document.createElement("div");
      bottomRow.className = "groupInterfacePortRow groupInterfacePortBottom";
      const label = document.createElement("input");
      label.type = "text";
      label.value = port.label || "";
      label.placeholder = "Entities";
      const techName = document.createElement("div");
      techName.className = "groupInterfacePortTech";
      techName.textContent = "Naam: " + (port.name || "(auto)");
      label.addEventListener("change", function () {
        const previousName = port.name || "";
        const previousLabel = port.label || "";
        port.label = label.value.trim();
        const wasGenerated = !previousName || /^input_\d+$/.test(previousName) || /^output_\d+$/.test(previousName) || previousName === slugifyGroupPortName(previousLabel, previousName);
        if (wasGenerated) {
          const baseName = slugifyGroupPortName(port.label, previousName || port.label);
          port.name = uniqueGroupPortName(baseName || previousName || (direction === "input" ? "input" : "output"), ports.filter(function (candidate) { return candidate !== port; }));
          port.id = port.name;
          techName.textContent = "Naam: " + port.name;
        }
        commit();
      });
      const type = document.createElement("select");
      for (const dataType of DATA_TYPE_OPTIONS) {
        const option = document.createElement("option");
        option.value = dataType;
        option.textContent = dataType;
        if (dataType === port.dataType) option.selected = true;
        type.appendChild(option);
      }
      type.addEventListener("change", function () {
        port.dataType = type.value;
        if (!port.label) port.label = port.name;
        if (!port.multiple && isMultiValueDataType(port.dataType)) port.multiple = true;
        commit();
      });
      const multipleWrap = document.createElement("label");
      multipleWrap.className = "groupInterfaceMultiple";
      const multiple = document.createElement("input");
      multiple.type = "checkbox";
      multiple.checked = port.multiple === undefined ? isMultiValueDataType(port.dataType) : Boolean(port.multiple);
      multiple.addEventListener("change", function () {
        port.multiple = multiple.checked;
        commit();
      });
      const multipleText = document.createElement("span");
      multipleText.textContent = "multiple";
      multipleWrap.append(multiple, multipleText);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "deleteNode";
      remove.textContent = "x";
      remove.title = "Remove port";
      remove.addEventListener("click", function () {
        const index = ports.indexOf(port);
        if (index !== -1) ports.splice(index, 1);
        commit();
      });
      topRow.append(label, techName);
      bottomRow.append(type, multipleWrap, remove);
      row.append(topRow, bottomRow);
      section.appendChild(row);
    }
    return section;
  }

  const intro = document.createElement("div");
  intro.className = "groupInterfaceHint";
  intro.textContent = "Dit is de echte groep-interface. Vul alleen het label in; de technische naam wordt automatisch gesluggifyt en blijft stabiel zodra je een port gebruikt.";
  editor.appendChild(intro);
  editor.appendChild(buildSection("input", "Inputs"));
  editor.appendChild(buildSection("output", "Outputs"));
  return editor;
}

function makePatch(key, value) {
  const patch = {};
  patch[key] = value;
  return patch;
}

async function patchValues(nodeId, patch, options = {}) {
  const node = nodeById(nodeId);
  if (node && Object.entries(patch || {}).every(function ([key, value]) { return node.values[key] === value; })) return state.graph;
  return await applyGraphMutation(function () {
    return api("/api/editor/nodes/" + nodeId + "/values", { method: "PATCH", body: JSON.stringify({ values: patch }) });
  }, Object.assign({
    historyLabel: options.historyLabel || "Waarde gewijzigd",
    refreshViewport: options.refreshViewport === true,
    refreshValidation: options.refreshValidation !== false,
    refreshGraph: options.refreshGraph !== false,
    refreshEdgeList: options.refreshEdgeList !== false,
    refreshInspector: options.refreshInspector !== false
  }, options));
}

async function duplicateNode(nodeId) {
  await applyGraphMutation(function () {
    return api("/api/editor/nodes/" + nodeId + "/duplicate", { method: "POST" });
  }, {
    historyLabel: "Node gedupliceerd",
    refreshViewport: false,
    refreshValidation: true,
    afterApply: function (_, result) {
      if (result?.nodeId) selectNode(result.nodeId, true);
      setStatus("Node gedupliceerd.", "success");
    }
  });
}

async function deleteNode(nodeId) {
  await applyGraphMutation(function () {
    return api("/api/editor/nodes/" + nodeId, { method: "DELETE" });
  }, {
    historyLabel: "Node verwijderd",
    refreshViewport: true,
    refreshValidation: true,
    selectedNodeId: null,
    afterApply: function () {
      setStatus("Node verwijderd.", "success");
    }
  });
}

// ---------- Edge list ----------
function renderEdgeList() {
  el.edgeList.innerHTML = "";
  if (!state.graph.edges.length) {
    const empty = document.createElement("div");
    empty.className = "inspectorEmpty";
    empty.textContent = "Nog geen verbindingen.";
    el.edgeList.appendChild(empty);
    return;
  }
  for (const edge of state.graph.edges) {
    const fromNode = nodeById(edge.fromNodeId);
    const toNode = nodeById(edge.toNodeId);
    if (!fromNode || !toNode) continue;
    const cross = (fromNode.parentId || null) !== (toNode.parentId || null);
    const row = document.createElement("div");
    row.className = "edgeRow";
    const text = document.createElement("span");
    text.className = cross ? "crossGroup" : "";
    text.textContent = fromNode.title + " > " + toNode.title + (cross ? " (cross-group)" : "");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "x";
    remove.title = "Verwijder verbinding";
    remove.addEventListener("click", function () { deleteEdge(edge.id); });
    row.append(text, remove);
    el.edgeList.appendChild(row);
  }
}

async function deleteEdge(edgeId) {
  await applyGraphMutation(function () {
    return api("/api/editor/edges/" + edgeId, { method: "DELETE" });
  }, {
    historyLabel: "Verbinding verwijderd",
    clearPendingEdge: true,
    refreshViewport: true,
    refreshValidation: true,
    afterApply: function () {
      setStatus("Verbinding verwijderd.", "success");
    }
  });
}

function collectDescendantNodeIds(nodeIds, graph = state.graph) {
  const selected = new Set((nodeIds || []).filter(Boolean));
  const queue = Array.from(selected);
  while (queue.length) {
    const parentId = queue.shift();
    for (const node of graph.nodes || []) {
      if (node.parentId !== parentId || selected.has(node.id)) continue;
      selected.add(node.id);
      queue.push(node.id);
    }
  }
  return Array.from(selected);
}

function graphNodesByIds(nodeIds, graph = state.graph) {
  const wanted = new Set(nodeIds || []);
  return (graph.nodes || []).filter(function (node) { return wanted.has(node.id); });
}

function createCloneId(type) {
  return "copy_" + type + "_" + crypto.randomUUID().slice(0, 8);
}

function copySelectionToClipboard() {
  const nodeIds = Array.from(new Set(state.selectedNodeIds.filter(Boolean)));
  const edgeIds = Array.from(new Set(state.selectedEdgeIds.filter(Boolean)));
  if (!nodeIds.length) {
    if (!edgeIds.length) {
      setStatus("Geen selectie om te kopiëren.", "");
      return null;
    }
    const selectedEdges = state.graph.edges.filter(function (edge) { return edgeIds.includes(edge.id); }).map(function (edge) {
      return {
        id: edge.id,
        fromNodeId: edge.fromNodeId,
        fromPort: edge.fromPort,
        toNodeId: edge.toNodeId,
        toPort: edge.toPort
      };
    });
    state.clipboard = {
      nodes: [],
      edges: selectedEdges,
      anchor: null,
      pasteCount: 0,
      edgeOnly: true
    };
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(JSON.stringify(state.clipboard)).catch(function () {});
      }
    } catch {}
    setStatus(selectedEdges.length + " verbinding" + (selectedEdges.length === 1 ? "" : "en") + " gekopieerd.", "success");
    return state.clipboard;
  }
  const selectedNodes = graphNodesByIds(nodeIds);
  const selectedSet = new Set(nodeIds);
  const edges = state.graph.edges.filter(function (edge) {
    return selectedSet.has(edge.fromNodeId) && selectedSet.has(edge.toNodeId);
  }).map(function (edge) {
    return {
      id: edge.id,
      fromNodeId: edge.fromNodeId,
      fromPort: edge.fromPort,
      toNodeId: edge.toNodeId,
      toPort: edge.toPort
    };
  });
  const minX = Math.min.apply(null, selectedNodes.map(function (node) { return Number(node.x) || 0; }));
  const minY = Math.min.apply(null, selectedNodes.map(function (node) { return Number(node.y) || 0; }));
  state.clipboard = {
    nodes: selectedNodes.map(snapshotNode),
    edges: edges,
    anchor: { x: Number.isFinite(minX) ? minX : 0, y: Number.isFinite(minY) ? minY : 0 },
    pasteCount: 0
  };
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(JSON.stringify(state.clipboard)).catch(function () {});
    }
  } catch {}
  setStatus(selectedNodes.length + " node" + (selectedNodes.length === 1 ? "" : "s") + " gekopieerd.", "success");
  return state.clipboard;
}

function buildDeletionGraph(nodeIds, edgeIds) {
  const nextGraph = cloneGraphForRestore(state.graph);
  const removeNodes = new Set(collectDescendantNodeIds(nodeIds, nextGraph));
  const removeEdges = new Set(edgeIds || []);
  nextGraph.nodes = (nextGraph.nodes || []).filter(function (node) {
    return !removeNodes.has(node.id);
  });
  nextGraph.edges = (nextGraph.edges || []).filter(function (edge) {
    return !removeNodes.has(edge.fromNodeId) && !removeNodes.has(edge.toNodeId) && !removeEdges.has(edge.id);
  });
  return nextGraph;
}

async function deleteSelectedNodes() {
  const nodeIds = Array.from(new Set(state.selectedNodeIds.filter(Boolean)));
  const edgeIds = Array.from(new Set(state.selectedEdgeIds.filter(Boolean)));
  if (!nodeIds.length && !edgeIds.length) {
    setStatus("Geen selectie om te verwijderen.", "");
    return;
  }
  const nextGraph = buildDeletionGraph(nodeIds, edgeIds);
  await restoreGraphObject(nextGraph, {
    historyLabel: nodeIds.length ? "Nodes verwijderd" : "Verbindingen verwijderd",
    selectedNodeIds: [],
    selectedEdgeIds: [],
    refreshGraph: true,
    refreshEdgeList: false,
    refreshInspector: true,
    refreshValidation: false,
    refreshViewport: false,
    afterApply: function () {
      clearSelection({ clearPendingEdge: true });
      setStatus("Selectie verwijderd.", "success");
    }
  });
}

async function cutSelection() {
  const clipboard = copySelectionToClipboard();
  if (!clipboard) return;
  await deleteSelectedNodes();
}

async function pasteSelection() {
  if (!state.clipboard || !Array.isArray(state.clipboard.nodes) || !state.clipboard.nodes.length) {
    if (state.clipboard && Array.isArray(state.clipboard.edges) && state.clipboard.edges.length) {
      setStatus("Verbindingen zonder nodes kunnen hier niet worden geplakt.", "");
      return;
    }
    setStatus("Geen gekopieerde selectie om te plakken.", "");
    return;
  }
  const nextGraph = cloneGraphForRestore(state.graph);
  const idMap = new Map();
  const offsetCount = (state.clipboard.pasteCount || 0) + 1;
  const offset = 40 * offsetCount;
  const anchor = state.clipboard.anchor || { x: 0, y: 0 };
  const newNodeIds = [];
  for (const sourceNode of state.clipboard.nodes) {
    const clone = clonePlain(sourceNode);
    const nextId = createCloneId(sourceNode.type);
    idMap.set(sourceNode.id, nextId);
    clone.id = nextId;
    clone.parentId = state.currentGroupId || null;
    clone.x = Math.round((Number(sourceNode.x) || 0) - (Number(anchor.x) || 0) + offset);
    clone.y = Math.round((Number(sourceNode.y) || 0) - (Number(anchor.y) || 0) + offset);
    nextGraph.nodes.push(clone);
    newNodeIds.push(nextId);
  }
  for (const edge of state.clipboard.edges) {
    if (!idMap.has(edge.fromNodeId) || !idMap.has(edge.toNodeId)) continue;
    nextGraph.edges.push({
      id: createCloneId("edge"),
      fromNodeId: idMap.get(edge.fromNodeId),
      fromPort: edge.fromPort,
      toNodeId: idMap.get(edge.toNodeId),
      toPort: edge.toPort
    });
  }
  state.clipboard.pasteCount = offsetCount;
  await restoreGraphObject(nextGraph, {
    historyLabel: "Plakken",
    selectedNodeIds: newNodeIds,
    selectedEdgeIds: [],
    refreshGraph: true,
    refreshEdgeList: false,
    refreshInspector: true,
    refreshValidation: false,
    refreshViewport: false,
    afterApply: function () {
      setSelection(newNodeIds, [], { primaryNodeId: newNodeIds[0] || null, clearPendingEdge: true });
      setStatus("Gepast.", "success");
    }
  });
}

async function duplicateSelection() {
  const clipboard = copySelectionToClipboard();
  if (!clipboard) return;
  await pasteSelection();
}

// ---------- Assets ----------
async function reloadAssets() {
  const data = await api("/api/assets");
  state.assets = data.assets || [];
  renderAssets();
  renderInspector();
}

function renderAssets() {
  el.assetGrid.innerHTML = "";
  let list = state.assets.slice();
  if (state.assetFilter !== "all") list = list.filter(function (a) { return a.assetType === state.assetFilter; });
  if (state.assetSearch) {
    const term = state.assetSearch.toLowerCase();
    list = list.filter(function (a) { return (a.name + " " + a.category).toLowerCase().includes(term); });
  }
  list.sort(function (a, b) {
    if (state.assetSort === "name") return a.name.localeCompare(b.name);
    if (state.assetSort === "type") return a.assetType.localeCompare(b.assetType);
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "inspectorEmpty";
    empty.textContent = "Geen assets. Importeer hieronder.";
    el.assetGrid.appendChild(empty);
    return;
  }
  for (const asset of list) el.assetGrid.appendChild(buildAssetCard(asset));
}

function buildAssetCard(asset) {
  const card = document.createElement("div");
  card.className = "assetCard";
  card.draggable = asset.assetType === "model";
  const animationNames = animationClipsForAsset(asset).map(function (entry) { return entry.name; });
  card.title = asset.assetType === "model" && animationNames.length
    ? "Animations: " + animationNames.join(", ")
    : asset.name;
  card.addEventListener("dragstart", function (event) {
    event.dataTransfer.setData("text/gk-asset", asset.id);
  });
  const thumb = document.createElement("div");
  thumb.className = "assetThumb";
  if (asset.thumbnailPath) {
    const img = document.createElement("img");
    img.src = asset.thumbnailPath;
    img.alt = asset.name;
    thumb.appendChild(img);
  } else {
    const icon = document.createElement("span");
    icon.className = "assetTypeIcon";
    icon.textContent = asset.assetType.toUpperCase();
    thumb.appendChild(icon);
  }
  const meta = document.createElement("div");
  meta.className = "assetMeta";
  const name = document.createElement("div");
  name.className = "assetName";
  name.textContent = asset.name;
  const sub = document.createElement("div");
  sub.className = "assetSub";
  const cat = document.createElement("span");
  cat.textContent = asset.category;
  const size = document.createElement("span");
  size.textContent = Math.max(1, Math.round(asset.sizeBytes / 1024)) + " KB";
  sub.append(cat, size);
  if (asset.assetType === "model") {
    const badge = document.createElement("span");
    badge.className = "assetAnimBadge";
    badge.textContent = animationBadgeText(asset);
    sub.appendChild(badge);
  }
  meta.append(name, sub);
  card.append(thumb, meta);
  if (asset.assetType === "model") {
    const place = document.createElement("button");
    place.type = "button";
    place.className = "assetPlace";
    place.textContent = "+ Plaats in wereld";
    place.addEventListener("click", function () { placeModel(asset.id, { x: 0, y: 0, z: 0 }); });
    card.appendChild(place);
  }
  return card;
}

async function placeModel(assetId, position) {
  await applyGraphMutation(function () {
    return api("/api/editor/place-model-asset", {
      method: "POST",
      body: JSON.stringify({ assetId: assetId, position: position, parentId: state.currentGroupId })
    });
  }, {
    historyLabel: "Model geplaatst",
    refreshViewport: true,
    refreshValidation: true,
    afterApply: function (_, result) {
      if (result?.nodeId) selectNode(result.nodeId, true);
      setStatus("Model geplaatst.", "success");
    }
  });
}

el.assetSearch.addEventListener("input", function () { state.assetSearch = el.assetSearch.value; renderAssets(); });
el.assetSort.addEventListener("change", function () { state.assetSort = el.assetSort.value; renderAssets(); });
el.assetFilter.addEventListener("change", function () { state.assetFilter = el.assetFilter.value; renderAssets(); });

el.assetForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  const formData = new FormData(el.assetForm);
  try {
    const response = await fetch("/api/assets/import", { method: "POST", body: formData });
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.message || "Upload mislukt.");
    state.assets = data.assets || state.assets;
    el.assetForm.reset();
    renderAssets();
    renderInspector();
    setStatus("Asset geimporteerd.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

// Drag asset to viewport to place at clicked ground position.
el.viewportCanvas.addEventListener("dragover", function (event) {
  if (Array.from(event.dataTransfer.types).includes("text/gk-asset")) {
    event.preventDefault();
    el.viewportCanvas.classList.add("dropHint");
  }
});
el.viewportCanvas.addEventListener("dragleave", function () { el.viewportCanvas.classList.remove("dropHint"); });
el.viewportCanvas.addEventListener("drop", function (event) {
  event.preventDefault();
  el.viewportCanvas.classList.remove("dropHint");
  const assetId = event.dataTransfer.getData("text/gk-asset");
  if (!assetId || !runtime) return;
  const ground = runtime.screenToGround(event.clientX, event.clientY) || { x: 0, y: 0, z: 0 };
  placeModel(assetId, ground);
});

// ---------- Viewport + validation ----------
function applyViewportWorld(world) {
  if (runtime) runtime.setWorld(world);
  el.viewportStatus.textContent = world.world && world.world.displayName ? world.world.displayName : "Draft viewport";
  state.viewportDirty = false;
  clearViewportRefreshTimer();
  syncRuntimeSelection();
  renderViewportControls();
}

async function refreshViewport(options = {}) {
  await graphMutationQueue;
  if (!options.force && !state.viewportDirty) return null;
  try {
    const world = await api("/api/editor/draft-world");
    applyViewportWorld(world);
    return world;
  } catch (error) {
    setStatus(error.message, "error");
    return null;
  }
}

function renderViewportErrors(errors) {
  el.viewportErrors.innerHTML = "";
  for (const message of errors) {
    const div = document.createElement("div");
    div.className = "err";
    div.textContent = "Laadfout: " + message;
    el.viewportErrors.appendChild(div);
  }
}

async function refreshValidation() {
  await graphMutationQueue;
  try {
    const result = await api("/api/editor/validate");
    el.validationPanel.innerHTML = "";
    if (result.ok) {
      const ok = document.createElement("div");
      ok.className = "vOk";
      ok.textContent = "Klaar om te publiceren.";
      el.validationPanel.appendChild(ok);
    }
    for (const message of result.errors || []) {
      const div = document.createElement("div");
      div.className = "vErr";
      div.textContent = "- " + message;
      el.validationPanel.appendChild(div);
    }
    for (const message of result.warnings || []) {
      const div = document.createElement("div");
      div.className = "vWarn";
      div.textContent = "! " + message;
      el.validationPanel.appendChild(div);
    }
    el.publishButton.disabled = !result.ok;
    el.publishButton.style.opacity = result.ok ? "1" : "0.5";
  } catch (error) {
    setStatus(error.message, "error");
  }
}

// ---------- Save / publish / logout ----------
el.saveDraftButton.addEventListener("click", saveDraft);
el.publishButton.addEventListener("click", publish);
el.logoutButton.addEventListener("click", async function () {
  await api("/api/auth/logout", { method: "POST" }).catch(function () {});
  window.location.href = "/login/";
});

async function saveDraft() {
  try {
    await graphMutationQueue;
    const result = await api("/api/editor/save-draft", { method: "POST" });
    state.unsaved = 0;
    renderUnsaved();
    if (result.world) applyViewportWorld(result.world);
    setStatus("Draft opgeslagen.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function publish() {
  try {
    await graphMutationQueue;
    const result = await api("/api/editor/publish", { method: "POST" });
    state.unsaved = 0;
    renderUnsaved();
    if (result.world) applyViewportWorld(result.world);
    setStatus("Gepubliceerd naar de game.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

// ---------- Keyboard shortcuts ----------
function isEditableTarget(target) {
  if (!target || typeof target.tagName !== "string") return false;
  const tag = target.tagName.toUpperCase();
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
}

function keyMatches(event, letter) {
  const code = String(event.code || "");
  const key = String(event.key || "").toLowerCase();
  return code === "Key" + letter.toUpperCase() || key === letter.toLowerCase();
}

function viewportShortcutDebugLabel(event) {
  const code = String(event.code || "");
  let letter = "";
  if (code.startsWith("Key") && code.length === 4) {
    letter = code.slice(3).toUpperCase();
  } else if (String(event.key || "").length === 1) {
    letter = String(event.key || "").toUpperCase();
  }
  if (!["G", "R", "S", "X", "Y", "Z"].includes(letter)) return "";
  return event.altKey ? "Alt+" + letter : letter;
}

function setViewportShortcutDebug(label) {
  state.viewportDebugKey = label || "";
  renderStatusLine();
}

function consumeShortcutEvent(event) {
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
}

function handleEditorKeyDown(event) {
  const meta = event.ctrlKey || event.metaKey;
  if (isEditableTarget(event.target)) return;
  const shortcutLabel = viewportShortcutDebugLabel(event);
  if (shortcutLabel) setViewportShortcutDebug(shortcutLabel);
  if (event.key === "Enter" && runtime && typeof runtime.isTransformActive === "function" && runtime.isTransformActive()) {
    consumeShortcutEvent(event);
    confirmRuntimeTransform();
    return;
  }
  if (meta && keyMatches(event, "s")) { event.preventDefault(); saveDraft(); return; }
  if (meta && event.key === "Enter") { event.preventDefault(); publish(); return; }
  if (meta && keyMatches(event, "c")) { event.preventDefault(); copySelectionToClipboard(); return; }
  if (meta && keyMatches(event, "x")) { event.preventDefault(); cutSelection(); return; }
  if (meta && keyMatches(event, "v")) { event.preventDefault(); pasteSelection(); return; }
  if (meta && keyMatches(event, "d")) { event.preventDefault(); duplicateSelection(); return; }
  if (meta && keyMatches(event, "z")) {
    event.preventDefault();
    if (event.shiftKey) redoGraphMutation(); else undoGraphMutation();
    return;
  }
  if (meta && keyMatches(event, "y")) {
    event.preventDefault();
    redoGraphMutation();
    return;
  }
  if (event.altKey && !meta && keyMatches(event, "g")) {
    consumeShortcutEvent(event);
    resetSelectedModelTransform("location");
    return;
  }
  if (event.altKey && !meta && keyMatches(event, "r")) {
    consumeShortcutEvent(event);
    resetSelectedModelTransform("rotation");
    return;
  }
  if (event.altKey && !meta && keyMatches(event, "s")) {
    consumeShortcutEvent(event);
    resetSelectedModelTransform("scale");
    return;
  }
  if (event.key === "Escape") {
    if (runtime && typeof runtime.isTransformActive === "function" && runtime.isTransformActive()) {
      consumeShortcutEvent(event);
      cancelRuntimeTransform();
      return;
    }
    clearSelection({ clearPendingEdge: true });
    renderGraph();
    setStatus("Deselected.", "");
    return;
  }
  if ((event.key === "Delete" || event.key === "Backspace") && (state.selectedNodeIds.length || state.selectedEdgeIds.length)) {
    event.preventDefault();
    deleteSelectedNodes();
    return;
  }
  if (!event.altKey && !meta && (keyMatches(event, "g") || keyMatches(event, "w")) && runtime) {
    consumeShortcutEvent(event);
    setViewportMode("translate");
    setViewportAxis(null);
    const started = typeof runtime.beginTransform === "function"
      ? runtime.beginTransform("move")
      : typeof runtime.beginKeyboardTransform === "function" && runtime.beginKeyboardTransform();
    setStatus(started ? "Move." : "No mesh selected.", started ? "" : "error");
    return;
  }
  if (!event.altKey && !meta && (keyMatches(event, "r") || keyMatches(event, "e")) && runtime) {
    consumeShortcutEvent(event);
    setViewportMode("rotate");
    setViewportAxis(null);
    const started = typeof runtime.beginTransform === "function"
      ? runtime.beginTransform("rotate")
      : typeof runtime.beginKeyboardTransform === "function" && runtime.beginKeyboardTransform();
    setStatus(started ? "Rotate Z." : "No mesh selected.", started ? "" : "error");
    return;
  }
  if (!event.altKey && !meta && (keyMatches(event, "s") || keyMatches(event, "t")) && runtime) {
    consumeShortcutEvent(event);
    setViewportMode("scale");
    setViewportAxis(null);
    const started = typeof runtime.beginTransform === "function"
      ? runtime.beginTransform("scale")
      : typeof runtime.beginKeyboardTransform === "function" && runtime.beginKeyboardTransform();
    setStatus(started ? "Scale." : "No mesh selected.", started ? "" : "error");
    return;
  }
  if (!event.altKey && !meta && (keyMatches(event, "x") || keyMatches(event, "y") || keyMatches(event, "z")) && runtime && ["translate", "rotate", "scale"].includes(state.viewportMode)) {
    consumeShortcutEvent(event);
    const axis = keyMatches(event, "x") ? "x" : keyMatches(event, "y") ? "y" : "z";
    setViewportAxis(axis);
    return;
  }
  if (!event.altKey && !meta && keyMatches(event, "f") && runtime) {
    consumeShortcutEvent(event);
    runtime.focusSelected();
    return;
  }
  if (event.key === "Home" && runtime && typeof runtime.frameAll === "function") {
    consumeShortcutEvent(event);
    runtime.frameAll();
    return;
  }
  if ((event.code === "Numpad1") && runtime && typeof runtime.setView === "function") {
    consumeShortcutEvent(event);
    runtime.setView("front");
    return;
  }
  if ((event.code === "Numpad3") && runtime && typeof runtime.setView === "function") {
    consumeShortcutEvent(event);
    runtime.setView("right");
    return;
  }
  if ((event.code === "Numpad7") && runtime && typeof runtime.setView === "function") {
    consumeShortcutEvent(event);
    runtime.setView("top");
    return;
  }
  if (event.key === "/" && runtime && typeof runtime.toggleLocalView === "function") {
    consumeShortcutEvent(event);
    runtime.toggleLocalView();
    renderViewportControls();
    return;
  }
  if ((event.code === "NumpadDecimal" || event.key === ".") && runtime && typeof runtime.focusSelected === "function") {
    consumeShortcutEvent(event);
    runtime.focusSelected();
  }
}

window.addEventListener("keydown", handleEditorKeyDown, true);

boot();
