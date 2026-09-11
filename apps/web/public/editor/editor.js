import { createGkWorldRuntime, effectiveWorldGroundBounds } from "../shared/world-runtime.js?v=20260910-entity-assembly-mesh1";
import { DATA_TYPE_OPTIONS, dataTypeColor, groupInterfaceDefault, isMultiValueDataType, mmoNetworkFieldNodePatch, slugifyGroupPortName, worldSettingsPresetNodePatch } from "../shared/node-types.js?v=20260911-authoring04-fix02";
import { AUTHORING_ROUTES, authoringLibraryGroupsForRoute, authoringRouteById, authoringWorkspacesForRoute, classifyAuthoringNodeType } from "./authoring-contract.js?v=20260911-authoring04-fix02";
import {
  normalizeCanonicalId,
  normalizeReferenceKind,
  normalizeReferenceList,
  normalizeTagList,
  normalizeTagQuery
} from "../shared/node-contract.js?v=20260717-node01-foundation";
import { referenceKindFromId, referenceMatchesKinds, referencePickerSort } from "../shared/reference-utils.js?v=20260717-node01-foundation";
import {
  worldToMinimapPoint,
  resolveMinimapPoint,
  drawTriangleMarker,
  drawDotMarker,
  drawDiamondMarker,
  drawSquareMarker,
  drawCrossMarker,
  drawMarkerLabel,
  squareGroundBounds,
  createMinimapView,
  clampMinimapView,
  minimapViewBounds,
  attachMinimapInteractions
} from "../shared/minimap-utils.js?v=20260729-mobile-editor-fix3";

const RESTORE_GRAPH_ROUTE = "/api/editor/graph/restore";
const EDITOR_API_TIMEOUT_MS = 20000;
const EDITOR_HEALTHCHECK_STALE_MS = 45000;
const EDITOR_HEALTHCHECK_INTERVAL_MS = 15000;
const EDITOR_AUTOSAVE_DELAY_MS = 45000;
const EDITOR_AUTOSAVE_RETRY_MS = 15000;

const HEAD = 34;
const PAD = 8;
const PORT_ROW = 24;
const PORT_GAP = 4;
const NODE_WIDTH = 260;
const OBJECT_RECIPE_COLUMN_GAP = 120;
const OBJECT_RECIPE_COLUMN_STEP = NODE_WIDTH + OBJECT_RECIPE_COLUMN_GAP;
const OBJECT_RECIPE_COMPONENT_Y_OFFSET = 150;
const OBJECT_RECIPE_COMPONENT_Y_STEP = 150;
const OBJECT_RECIPE_STACK_GAP = 34;
const GRAPH_FRAME_MIN_WIDTH = 320;
const GRAPH_FRAME_MIN_HEIGHT = 180;
const ZONE_CANVAS_SIZE = 500;
const ZONE_CANVAS_HALF_SIZE = ZONE_CANVAS_SIZE / 2;
const ZONE_CANVAS_PORT_ALIASES = new Set(["zonePackage", "zonepackage", "zonePkg", "zonepkg"]);
const ZONE_CANVAS_ROOT_NODE_TYPES = new Set(["ambient_light", "directional_light"]);
const ZONE_CANVAS_NODE_STEP_X = 340;
const ZONE_CANVAS_NODE_STEP_Y = 230;
const ZONE_CANVAS_DIRECTIONS = {
  top: { label: "Boven", dx: 0, dz: -1, graphX: 0, graphY: -1 },
  right: { label: "Rechts", dx: 1, dz: 0, graphX: 1, graphY: 0 },
  bottom: { label: "Onder", dx: 0, dz: 1, graphX: 0, graphY: 1 },
  left: { label: "Links", dx: -1, dz: 0, graphX: -1, graphY: 0 }
};
const ASSET_CARD_SIZE_STORAGE_KEY = "gk.assetCardSize";
const AUTHORING_ROUTE_STORAGE_KEY = "gk.editorAuthoringRoute";
const AUTHORING_INDICATORS_STORAGE_KEY = "gk.editorAuthoringIndicators";
const CURRENT_GROUP_STORAGE_KEY = "gk.editorCurrentGroupId";
const EDITOR_LAYOUT_STORAGE_KEY = "gk.editorLayoutSizes";
const EDITOR_MOBILE_PANEL_STORAGE_KEY = "gk.editorMobilePanel";
const ALL_LAYOUT_STORAGE_KEY = "gk.editorAllLayoutTree";
const ALL_PANE_VIEWS = ["tools", "graph", "viewport", "assets"];
const ALL_PANE_LABELS = { tools: "Tools", graph: "Nodes", viewport: "3D", assets: "Assets" };
const EDITOR_FLOATING_PANELS_STORAGE_KEY = "gk.editorFloatingPanels";
const MOBILE_LAYOUT_QUERY = window.matchMedia ? window.matchMedia("(max-width: 980px)") : null;
const COARSE_POINTER_QUERY = window.matchMedia ? window.matchMedia("(pointer: coarse)") : null;
const GRAPH_ZOOM_FACTOR = 1.21;
const VIEWPORT_AFFECTING_NODE_TYPES = new Set([
  "world_settings",
  "editor_world_settings",
  "game_world_settings",
  "ground_surface",
  "group",
  "game_camera",
  "editor_camera",
  "top_down_camera",
  "ambient_light",
  "directional_light",
  "player_character",
  "player_spawn",
  "model_entity",
  "bounded_area_scatter",
  "interactable",
  "keybind",
  "ui_hud_text",
  "surface_layer"
]);
const MODEL_ENTITY_TRANSFORM_FIELDS = new Set([
  "x",
  "y",
  "z",
  "rotationX",
  "rotationY",
  "rotationZ",
  "scaleX",
  "scaleY",
  "scaleZ"
]);
const EDITOR_CAMERA_FIELDS = new Set([
  "targetX",
  "targetY",
  "targetZ",
  "pitch",
  "yaw",
  "distance"
]);
const TERRAIN_TOOL_NODE_TYPES = new Set([
  "surface_layer",
  "blocker_area",
  "walkable_surface",
  "area_definition",
  "location_anchor"
]);
// surface_layer is an open path the user builds point-by-point; the rest are
// closed shapes that behave like Walkable Surface and start from a 4-corner rectangle.
const TERRAIN_CLOSED_SHAPE_NODE_TYPES = new Set([
  "walkable_surface",
  "blocker_area",
  "area_definition",
  "location_anchor"
]);

const state = {
  graph: { nodes: [], edges: [], nodeTypes: {} },
  graphLoaded: false,
  assets: [],
  nodeTypes: {},
  currentGroupId: null,
  storedCurrentGroupId: loadStoredCurrentGroupId(),
  breadcrumb: [{ id: null, title: "ROOT" }],
  selectedNodeId: null,
  pendingEdge: null,
  unsaved: 0,
  view: { panX: 40, panY: 40, scale: 1 },
  assetSearch: "",
  assetSort: "date",
  assetFilter: "all",
  assetCardSize: loadStoredAssetCardSize(),
  mobilePanel: loadStoredMobilePanel(),
  allLayoutTree: null,
  authoringRouteId: null,
  storedAuthoringRouteId: loadStoredAuthoringRoute(),
  authoringMenuOpen: false,
  nodeLibraryOpen: false,
  nodeLibraryAdvanced: false,
  zoneCanvasDraft: null,
  catalogHubType: "item_definition",
  catalogHubSelectedNodeId: null,
  catalogHubDraft: null,
  catalogHubSearch: "",
  settingsHubKind: "player_rules",
  settingsHubSelectedNodeId: null,
  settingsHubDraft: null,
  settingsHubSearch: "",
  authoringIndicatorsEnabled: loadStoredAuthoringIndicators(),
  objectFunctionDraft: null,
  questTimelineView: "quest",
  questTimelineSelectedQuestId: null,
  questTimelineSelectedStepId: null,
  questTimelineSelectedDialogueId: null,
  questTimelineSelectedEntryId: null,
  questTimelineDraft: null,
  questTimelineDialogueDraft: null,
  questTimelineInsertDraft: null,
  questTimelineDialogueInsertDraft: null,
  questTimelineChildDraft: null,
  questTimelinePendingTargetRef: null,
  mobileSelectedAssetId: null,
  assetImportOpen: false,
  assetUploadBusy: false,
  assetUploadMessage: "",
  assetUploadProgressText: "",
  assetUploadTimings: null,
  assetUploadDetailsOpen: false,
  assetUploadTone: "",
  assetUploadAwaitingThumbnail: false,
  assetUploadLastAssetId: null,
  assetUploadLoadCaptureUntil: 0,
  viewportWorld: null,
  assetManager: {
    assetId: null,
    usage: [],
    loadingUsage: false,
    error: "",
    replacementAssetId: "",
    draftName: null,
    draftCategory: null,
    thumbnailRetryBusy: false,
    requestToken: 0
  },
  captureField: null,
  viewportMode: "translate",
  viewportAxis: null,
  snapMode: "off",
  snapGridSize: 1,
  previewAnimations: false,
  viewportHelpOpen: false,
  terrainTool: {
    mode: "select",
    activeNodeId: null,
    selectedPointIndex: null,
    selectedPointIndices: [],
    selectedHandleRole: null,
    multiSelect: false,
    activeChannel: "main",
    axisConstraint: null,
    draggingPointIndex: null,
    draggingHandleRole: null,
    dragNodeId: null,
    dragStartPoints: null,
    dragStartSurface: null,
    dragStartScale: null,
    dragScaleChannel: null,
    dragStartPointer: null,
    dragCurrentPointer: null,
    dragExtrudeIndex: null,
    dragPreviewPoint: null,
    dragPointerId: null,
    dragStartGround: null,
    dragCurrentGround: null,
    dragStartPivot: null,
    dragStartAngle: null,
    dragStartDistance: null,
    dragTransformIndices: null,
    dragMoved: false
  },
  scatterTool: {
    mode: "select",
    activeNodeId: null,
    selectedPointIndex: null,
    selectedPointIndices: [],
    selectedHandleRole: null,
    multiSelect: false,
    draggingPointIndex: null,
    draggingHandleRole: null,
    dragNodeId: null,
    dragStartPoints: null,
    dragStartGround: null,
    dragCurrentGround: null,
    dragStartPointer: null,
    dragCurrentPointer: null,
    dragPointerId: null,
    dragStartPivot: null,
    dragStartAngle: null,
    dragStartDistance: null,
    dragTransformIndices: null,
    dragStartRotationY: null,
    dragExtrudeIndex: null,
    dragPreviewPoint: null,
    dragMoved: false
  },
  statusMessage: "",
  statusKind: "",
  connection: {
    status: navigator.onLine === false ? "disconnected" : "standby",
    pending: 0,
    lastOkAt: 0,
    lastError: "",
    reconnecting: false
  },
  autoSaveDraftBusy: false,
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
  marquee: null,
  pendingUnsavedVisualCount: 0,
  lastTransformCommitError: "",
  minimapBakeBusy: false,
  minimapBakeMessage: "",
  minimapBakeTone: "",
  editorMinimapView: null,
  editorMinimapUserOverride: false,
  editorMinimapConfigKey: "",
  editorMinimapInteractions: null,
  editorMinimapSuppressed: false
};

const el = {
  layout: document.querySelector(".layout"),
  tools: document.querySelector(".tools"),
  authoringSection: document.querySelector("#authoringSection"),
  authoringButton: document.querySelector("#authoringButton"),
  authoringRouteChip: document.querySelector("#authoringRouteChip"),
  authoringSelectionChip: document.querySelector("#authoringSelectionChip"),
  authoringBackButton: document.querySelector("#authoringBackButton"),
  authoringMenu: document.querySelector("#authoringMenu"),
  authoringPanel: document.querySelector("#authoringPanel"),
  breadcrumb: document.querySelector("#breadcrumb"),
  unsavedBadge: document.querySelector("#unsavedBadge"),
  mobilePanelTabs: document.querySelector("#mobilePanelTabs"),
  validationSection: document.querySelector("#validationSection"),
  nodeLibrarySection: document.querySelector("#nodeLibrarySection"),
  nodeLibraryToggle: document.querySelector("#nodeLibraryToggle"),
  nodeLibraryToggleTitle: document.querySelector("#nodeLibraryToggleTitle"),
  nodeLibraryToggleState: document.querySelector("#nodeLibraryToggleState"),
  nodeLibraryBody: document.querySelector("#nodeLibraryBody"),
  nodeLibraryModeToggle: document.querySelector("#nodeLibraryModeToggle"),
  inspectorSection: document.querySelector("#inspectorSection"),
  nodeLibrary: document.querySelector("#nodeLibrary"),
  nodeLibrarySearch: document.querySelector("#nodeLibrarySearch"),
  inspectorForm: document.querySelector("#inspectorForm"),
  validationPanel: document.querySelector("#validationPanel"),
  edgeList: document.querySelector("#edgeList"),
  graphViewport: document.querySelector("#graphViewport"),
  graphContent: document.querySelector("#graphContent"),
  edgeLayer: document.querySelector("#edgeLayer"),
  nodeLayer: document.querySelector("#nodeLayer"),
  viewportWrap: document.querySelector(".viewportWrap"),
  viewportCanvas: document.querySelector("#viewportCanvas"),
  viewportStatus: document.querySelector("#viewportStatus"),
  viewportZoomOutButton: document.querySelector("#viewportZoomOutButton"),
  viewportZoomInButton: document.querySelector("#viewportZoomInButton"),
  viewportFocusButton: document.querySelector("#viewportFocusButton"),
  viewportInfoButton: document.querySelector("#viewportInfoButton"),
  viewportHelpPanel: document.querySelector("#viewportHelpPanel"),
  viewportTransformPanel: document.querySelector("#viewportTransformPanel"),
  viewportAuthoringIndicatorToggle: document.querySelector("#viewportAuthoringIndicatorToggle"),
  viewportAuthoringIndicators: document.querySelector("#viewportAuthoringIndicators"),
  editorMinimapRoot: document.querySelector("#editorMinimapRoot"),
  editorMinimapCanvas: document.querySelector("#editorMinimapCanvas"),
  viewportErrors: document.querySelector("#viewportErrors"),
  statusText: document.querySelector("#statusText"),
  assetColumn: document.querySelector(".assetColumn"),
  assetDropOverlay: document.querySelector("#assetDropOverlay"),
  assetSearch: document.querySelector("#assetSearch"),
  assetControlsToggle: document.querySelector("#assetControlsToggle"),
  assetControls: document.querySelector("#assetControls"),
  assetSort: document.querySelector("#assetSort"),
  assetFilter: document.querySelector("#assetFilter"),
  assetGrid: document.querySelector("#assetGrid"),
  assetCardSize: document.querySelector("#assetCardSize"),
  assetCardSizeValue: document.querySelector("#assetCardSizeValue"),
  assetImportToggle: document.querySelector("#assetImportToggle"),
  assetUploadStatus: document.querySelector("#assetUploadStatus"),
  assetUploadProgressText: document.querySelector("#assetUploadProgressText"),
  assetUploadMessage: document.querySelector("#assetUploadMessage"),
  assetUploadSummary: document.querySelector("#assetUploadSummary"),
  assetUploadDetails: document.querySelector("#assetUploadDetails"),
  assetUploadDetailsList: document.querySelector("#assetUploadDetailsList"),
  assetForm: document.querySelector("#assetForm"),
  snapModeSelect: document.querySelector("#snapModeSelect"),
  snapGridInput: document.querySelector("#snapGridInput"),
  saveDraftButton: document.querySelector("#saveDraftButton"),
  publishButton: document.querySelector("#publishButton"),
  connectionButton: document.querySelector("#connectionButton"),
  undoButton: document.querySelector("#undoButton"),
  redoButton: document.querySelector("#redoButton"),
  logoutButton: document.querySelector("#logoutButton"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  graphZoomOutButton: document.querySelector("#graphZoomOutButton"),
  graphZoomInButton: document.querySelector("#graphZoomInButton"),
  zoomResetButton: document.querySelector("#zoomResetButton"),
  layoutResizers: Array.from(document.querySelectorAll(".layoutResizer")),
  viewportSelectionBox: document.querySelector("#viewportSelectionBox"),
  allLayoutRoot: document.querySelector("#allLayoutRoot"),
  allLayoutOverflow: document.querySelector("#allLayoutOverflow")
};

let runtime = null;
let viewportRefreshTimer = null;
let validationRefreshTimer = null;
let editorMinimapRedrawTimer = null;
let connectionRecoveryTimer = null;
let connectionHeartbeatTimer = null;
let autoSaveDraftTimer = null;
let viewportFloatingPanelResizeRaf = 0;
let graphMutationQueue = Promise.resolve();
let assetUploadProgressTimer = null;
let assetThumbnailPollTimer = null;
let assetColumnDropDepth = 0;
let terrainLastPointer = null;
let viewportAssetPointer = null;
let pointLongPressSession = null;
let suppressViewportRuntimeClickUntil = 0;
const viewportTouchEditPointers = new Set();
let viewportTouchEditSuppress = false;
// Declared up here (not next to the "All" tab code further down) so that any early,
// top-level call chain (e.g. syncAsideContext() below can indirectly reach
// setMobilePanel() -> updateAllLayoutMode()) can never hit these before their `let`
// initializer has run - that previously threw a TDZ ReferenceError that silently
// aborted the whole script's startup.
let allLayoutActive = false;
let allLayoutLastUsedViews = new Set();
const POINT_LONG_PRESS_MS = 520;
const POINT_LONG_PRESS_MOVE_PX = 9;
const floatingPanelLiveStates = new Map();
const graphTouchGesture = {
  pointers: new Map(),
  listening: false,
  mode: "",
  startPanX: 0,
  startPanY: 0,
  startClientX: 0,
  startClientY: 0,
  startScale: 1,
  startDistance: 1,
  anchorGraphX: 0,
  anchorGraphY: 0
};
let activeNodeDragCancel = null;
const selectionBox = document.createElement("div");
selectionBox.className = "selectionBox";
selectionBox.hidden = true;
el.graphViewport.appendChild(selectionBox);
const assetManageOverlay = document.createElement("div");
assetManageOverlay.className = "assetManageOverlay";
assetManageOverlay.hidden = true;
const assetManagePanel = document.createElement("div");
assetManagePanel.className = "assetManagePanel";
assetManageOverlay.appendChild(assetManagePanel);
if (el.assetColumn) el.assetColumn.appendChild(assetManageOverlay);
el.assetManageOverlay = assetManageOverlay;
el.assetManagePanel = assetManagePanel;
const edgePanel = el.edgeList && typeof el.edgeList.closest === "function" ? el.edgeList.closest(".panel") : null;
if (edgePanel) edgePanel.style.display = "none";
syncAsideContext();
applyAssetCardSize(state.assetCardSize, false);
const editorDebug = window.__GK_DEBUG_EDITOR && typeof window.__GK_DEBUG_EDITOR === "object"
  ? window.__GK_DEBUG_EDITOR
  : { enabled: false, activeDragSession: null, lastInvalidDrag: null, dragSessions: 0, lastClientPoint: null, lastGraphPoint: null, lastCommit: null };
window.__GK_DEBUG_EDITOR = editorDebug;
renderConnectionStatus();

function editorApiTimeoutError(path, method, timeoutMs) {
  const error = new Error("Verzoek naar " + path + " duurde langer dan " + Math.round(timeoutMs / 1000) + "s.");
  error.status = 0;
  error.path = path;
  error.method = method;
  error.code = "EDITOR_API_TIMEOUT";
  return error;
}

function connectionStatusLabel(status) {
  if (status === "connected") return "verbonden";
  if (status === "disconnected") return "niet verbonden";
  return "wacht op server";
}

function renderConnectionStatus() {
  if (!el.connectionButton) return;
  const pending = Math.max(0, Number(state.connection.pending || 0) || 0);
  const status = pending > 0 ? "standby" : (state.connection.status || "standby");
  el.connectionButton.className = "connectionButton connectionButton--" + status;
  el.connectionButton.disabled = state.connection.reconnecting === true;
  const parts = ["Serverstatus: " + connectionStatusLabel(status)];
  if (pending > 0) parts.push(pending + " request" + (pending === 1 ? "" : "s") + " bezig");
  if (state.connection.lastError && status === "disconnected") parts.push(state.connection.lastError);
  if (state.connection.lastOkAt && status === "connected") {
    parts.push("laatste antwoord " + new Date(state.connection.lastOkAt).toLocaleTimeString());
  }
  parts.push(state.connection.reconnecting ? "Reconnect loopt." : "Klik om opnieuw te verbinden.");
  const label = parts.join(". ");
  el.connectionButton.title = label;
  el.connectionButton.setAttribute("aria-label", label);
}

function clearConnectionRecoveryTimer() {
  if (connectionRecoveryTimer) clearTimeout(connectionRecoveryTimer);
  connectionRecoveryTimer = null;
}

function scheduleConnectionRecovery(delayMs = 3500) {
  if (connectionRecoveryTimer || state.connection.reconnecting || navigator.onLine === false) return;
  connectionRecoveryTimer = setTimeout(function () {
    connectionRecoveryTimer = null;
    void checkEditorConnectionHealth();
  }, Math.max(1000, Number(delayMs) || 3500));
}

async function pingEditorServer(timeoutMs = 4000) {
  const response = await fetchEditorApi("/api/editor/ping", { method: "HEAD", timeoutMs }, "HEAD");
  if (response.status === 401) {
    window.location.href = "/login/?next=" + encodeURIComponent("/editor/");
    throw new Error("Niet ingelogd.");
  }
  if (!response.ok) {
    const error = new Error("Ping mislukt: HTTP " + response.status + ".");
    error.status = response.status;
    throw error;
  }
  return true;
}

async function checkEditorConnectionHealth() {
  if (state.connection.reconnecting || navigator.onLine === false) return false;
  try {
    await pingEditorServer(4000);
    return true;
  } catch {
    scheduleConnectionRecovery(6000);
    return false;
  }
}

function startConnectionHeartbeat() {
  if (connectionHeartbeatTimer) return;
  connectionHeartbeatTimer = setInterval(function () {
    if (state.connection.pending > 0 || state.connection.reconnecting || navigator.onLine === false) return;
    if (state.connection.lastError) return;
    const lastOkAt = Number(state.connection.lastOkAt || 0);
    if (!lastOkAt || Date.now() - lastOkAt >= EDITOR_HEALTHCHECK_STALE_MS) {
      void checkEditorConnectionHealth();
    }
  }, EDITOR_HEALTHCHECK_INTERVAL_MS);
}

function updateConnectionStatusFromState() {
  if (state.connection.pending > 0) {
    state.connection.status = "standby";
  } else if (state.connection.lastError) {
    state.connection.status = "disconnected";
  } else if (state.connection.lastOkAt) {
    state.connection.status = "connected";
  } else if (navigator.onLine === false) {
    state.connection.status = "disconnected";
  } else {
    state.connection.status = "standby";
  }
  renderConnectionStatus();
}

function editorConnectionRequestStarted() {
  state.connection.pending += 1;
  state.connection.status = "standby";
  renderConnectionStatus();
}

function editorConnectionRequestSucceeded() {
  clearConnectionRecoveryTimer();
  state.connection.lastOkAt = Date.now();
  state.connection.lastError = "";
}

function editorConnectionRequestFailed(error) {
  state.connection.lastError = error?.code === "EDITOR_API_TIMEOUT"
    ? "timeout"
    : (navigator.onLine === false ? "browser offline" : (error?.message || "request mislukt"));
  scheduleConnectionRecovery();
}

function editorConnectionRequestFinished() {
  state.connection.pending = Math.max(0, state.connection.pending - 1);
  updateConnectionStatusFromState();
}

async function fetchEditorApi(path, options, method) {
  const requestOptions = Object.assign({}, options || {});
  const timeoutMs = Number.isFinite(Number(requestOptions.timeoutMs)) ? Number(requestOptions.timeoutMs) : EDITOR_API_TIMEOUT_MS;
  delete requestOptions.timeoutMs;
  const formBody = typeof FormData !== "undefined" && requestOptions.body instanceof FormData;
  requestOptions.headers = formBody
    ? Object.assign({}, requestOptions.headers || {})
    : Object.assign({ "Content-Type": "application/json" }, requestOptions.headers || {});
  editorConnectionRequestStarted();
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || typeof AbortController !== "function") {
    try {
      const response = await fetch(path, requestOptions);
      editorConnectionRequestSucceeded();
      return response;
    } catch (error) {
      editorConnectionRequestFailed(error);
      throw error;
    } finally {
      editorConnectionRequestFinished();
    }
  }
  const externalSignal = requestOptions.signal || null;
  const controller = new AbortController();
  let timedOut = false;
  let timeout = null;
  let externalAbort = null;
  requestOptions.signal = controller.signal;
  if (externalSignal) {
    externalAbort = function () {
      controller.abort(externalSignal.reason);
    };
    if (externalSignal.aborted) {
      externalAbort();
    } else {
      externalSignal.addEventListener("abort", externalAbort, { once: true });
    }
  }
  timeout = setTimeout(function () {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(path, requestOptions);
    editorConnectionRequestSucceeded();
    return response;
  } catch (error) {
    if (timedOut) {
      const timeoutError = editorApiTimeoutError(path, method, timeoutMs);
      editorConnectionRequestFailed(timeoutError);
      throw timeoutError;
    }
    if (!(error?.name === "AbortError" && externalSignal?.aborted)) {
      editorConnectionRequestFailed(error);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (externalSignal && externalAbort) externalSignal.removeEventListener("abort", externalAbort);
    editorConnectionRequestFinished();
  }
}

async function api(path, options) {
  const method = (options && options.method) || "GET";
  const response = await fetchEditorApi(path, options, method);
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

async function apiOk(path, options) {
  const method = (options && options.method) || "GET";
  const response = await fetchEditorApi(path, options, method);
  if (response.status === 401) {
    window.location.href = "/login/?next=" + encodeURIComponent("/editor/");
    throw new Error("Niet ingelogd.");
  }
  if (!response.ok) {
    const data = await response.json().catch(function () { return {}; });
    const error = new Error(data.message || "Verzoek mislukt.");
    error.status = response.status;
    error.path = path;
    error.method = method;
    error.details = data;
    throw error;
  }
  return { ok: true, status: response.status };
}

function timingMs(startedAt) {
  return (performance.now() - startedAt).toFixed(1);
}

function logTiming(label, startedAt, details) {
  console.info("[timing] " + label + " " + timingMs(startedAt) + "ms" + (details ? " " + details : ""));
}

function formatUploadTiming(ms) {
  if (ms === null || ms === undefined || ms === "") return "n.v.t.";
  const value = Number(ms);
  if (!Number.isFinite(value)) return "n.v.t.";
  return (value / 1000).toFixed(1) + "t";
}

function createUploadTimingRow(label, value, muted) {
  const row = document.createElement("div");
  row.className = "assetUploadDetailRow";
  const name = document.createElement("div");
  name.className = "assetUploadDetailLabel";
  name.textContent = label;
  const amount = document.createElement("div");
  amount.className = "assetUploadDetailValue" + (muted ? " muted" : "");
  amount.textContent = value;
  row.append(name, amount);
  return row;
}

function clampAssetCardSize(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return 88;
  return Math.max(64, Math.min(180, number));
}

function loadStoredAssetCardSize() {
  try {
    return clampAssetCardSize(Number(window.localStorage.getItem(ASSET_CARD_SIZE_STORAGE_KEY) || 88));
  } catch {
    return 88;
  }
}

function storeAssetCardSize(value) {
  try {
    window.localStorage.setItem(ASSET_CARD_SIZE_STORAGE_KEY, String(clampAssetCardSize(value)));
  } catch {}
}

function applyAssetCardSize(value, persist = true) {
  const next = clampAssetCardSize(value);
  state.assetCardSize = next;
  if (el.assetColumn) el.assetColumn.style.setProperty("--asset-card-size", next + "px");
  if (el.assetCardSize) el.assetCardSize.value = String(next);
  if (el.assetCardSizeValue) el.assetCardSizeValue.textContent = next + "px";
  if (persist) storeAssetCardSize(next);
}

function loadStoredMobilePanel() {
  try {
    const panel = String(window.localStorage.getItem(EDITOR_MOBILE_PANEL_STORAGE_KEY) || "all");
    return ["all", "tools", "graph", "inspector", "viewport", "assets"].includes(panel) ? panel : "all";
  } catch {
    return "all";
  }
}

function loadStoredAuthoringRoute() {
  try {
    const routeId = String(window.localStorage.getItem(AUTHORING_ROUTE_STORAGE_KEY) || "");
    const route = authoringRouteById(routeId);
    if (routeId && !route) window.localStorage.removeItem(AUTHORING_ROUTE_STORAGE_KEY);
    return route ? route.id : null;
  } catch {
    return null;
  }
}

function loadStoredAuthoringIndicators() {
  try {
    return window.localStorage.getItem(AUTHORING_INDICATORS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function storeAuthoringIndicators(enabled) {
  try {
    window.localStorage.setItem(AUTHORING_INDICATORS_STORAGE_KEY, enabled ? "1" : "0");
  } catch {}
}

function storeAuthoringRoute(routeId) {
  try {
    if (routeId) window.localStorage.setItem(AUTHORING_ROUTE_STORAGE_KEY, String(routeId));
    else window.localStorage.removeItem(AUTHORING_ROUTE_STORAGE_KEY);
  } catch {}
}

function loadStoredCurrentGroupId() {
  try {
    const groupId = String(window.localStorage.getItem(CURRENT_GROUP_STORAGE_KEY) || "").trim();
    return groupId || null;
  } catch {
    return null;
  }
}

function storeCurrentGroupId(groupId) {
  try {
    if (groupId) window.localStorage.setItem(CURRENT_GROUP_STORAGE_KEY, String(groupId));
    else window.localStorage.removeItem(CURRENT_GROUP_STORAGE_KEY);
  } catch {}
}

function isMobileLayout() {
  return Boolean(MOBILE_LAYOUT_QUERY && MOBILE_LAYOUT_QUERY.matches);
}

function isCoarsePointer() {
  return Boolean(COARSE_POINTER_QUERY && COARSE_POINTER_QUERY.matches);
}

function elementContainsPoint(element, clientX, clientY) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

// Whether the 3D viewport is already visible somewhere on screen right now -
// desktop always shows it, on mobile only the dedicated "3D" tab or an "All"
// layout that currently includes a viewport pane do.
function isViewportPaneVisible() {
  if (!isMobileLayout()) return true;
  if (state.mobilePanel === "viewport") return true;
  if (state.mobilePanel === "all") return collectUsedAllViews(state.allLayoutTree).has("viewport");
  return false;
}

function hasInspectorSelection() {
  return Boolean(state.selectedNodeIds.length || state.selectedEdgeIds.length);
}

function setRootCssVar(name, value, persist = true) {
  if (!name || !value) return;
  document.documentElement.style.setProperty(name, value);
  if (!persist) return;
  try {
    const stored = JSON.parse(window.localStorage.getItem(EDITOR_LAYOUT_STORAGE_KEY) || "{}");
    stored[name] = value;
    window.localStorage.setItem(EDITOR_LAYOUT_STORAGE_KEY, JSON.stringify(stored));
  } catch {}
}

function applyStoredEditorLayoutSizes() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(EDITOR_LAYOUT_STORAGE_KEY) || "{}");
    const allowed = new Set([
      "--tools-width",
      "--graph-width",
      "--viewport-width",
      "--assets-width",
      "--mobile-tools-height",
      "--mobile-graph-height",
      "--mobile-viewport-height"
    ]);
    for (const [name, value] of Object.entries(stored || {})) {
      if (!allowed.has(name)) continue;
      if (typeof value !== "string" || !/^\d+(\.\d+)?px$/.test(value)) continue;
      document.documentElement.style.setProperty(name, value);
    }
  } catch {}
}

function persistEditorLayoutSizes() {
  try {
    const names = [
      "--tools-width",
      "--graph-width",
      "--viewport-width",
      "--assets-width",
      "--mobile-tools-height",
      "--mobile-graph-height",
      "--mobile-viewport-height"
    ];
    const stored = {};
    for (const name of names) {
      const value = document.documentElement.style.getPropertyValue(name).trim();
      if (value) stored[name] = value;
    }
    window.localStorage.setItem(EDITOR_LAYOUT_STORAGE_KEY, JSON.stringify(stored));
  } catch {}
}

function setMobilePanel(panel, persist = true) {
  let next = ["all", "tools", "graph", "inspector", "viewport", "assets"].includes(panel) ? panel : "all";
  if (next === "inspector" && !hasInspectorSelection()) next = "graph";
  const previousPanel = state.mobilePanel;
  state.mobilePanel = next;
  document.body.dataset.mobilePanel = next;
  // Freshly entering "All" (not just re-clicking it) should be treated like just having
  // opened whichever panes it currently shows, so a graph pane in there re-focuses below.
  if (next === "all" && previousPanel !== "all") allLayoutLastUsedViews = new Set();
  if (el.mobilePanelTabs) {
    for (const button of el.mobilePanelTabs.querySelectorAll("[data-mobile-panel]")) {
      const active = button.dataset.mobilePanel === next;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }
  if (persist) {
    try { window.localStorage.setItem(EDITOR_MOBILE_PANEL_STORAGE_KEY, next); } catch {}
  }
  updateAllLayoutMode();
  if (runtime && typeof runtime.render === "function") requestAnimationFrame(function () { runtime.render("mobile-panel"); });
  redrawEditorMinimap();
  if (isMobileLayout() && next === "graph") {
    const nodeId = state.selectedNodeId || state.selectedNodeIds[0] || null;
    if (nodeId) requestAnimationFrame(function () { focusGraphNode(nodeId); });
  }
}

function showMobileInspectorPanel() {
  if (!isMobileLayout() || !hasInspectorSelection()) return;
  // In the "All" layout the Tools pane already swaps Node library -> Inspector in
  // place (see syncAsideContext) - stay on "All" instead of jumping to the dedicated
  // Inspector tab, which would hide whichever other panes (Nodes, 3D, ...) were open.
  if (state.mobilePanel !== "all") setMobilePanel("inspector", false);
  requestAnimationFrame(function () {
    if (el.tools && typeof el.tools.scrollTo === "function") el.tools.scrollTo({ top: 0, behavior: "auto" });
  });
}

function floatingPanelDeviceKey() {
  return isMobileLayout() ? "mobile" : "desktop";
}

function readFloatingPanelStore() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(EDITOR_FLOATING_PANELS_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizeFloatingPanelState(value) {
  if (!value || typeof value !== "object") return null;
  const wrapRect = el.viewportWrap?.getBoundingClientRect();
  const hasPercent = ["xPct", "yPct", "widthPct", "heightPct"].every(function (key) {
    return Number.isFinite(Number(value[key]));
  });
  const usePercent = hasPercent && wrapRect && wrapRect.width > 0 && wrapRect.height > 0;
  const x = usePercent ? Number(value.xPct) * wrapRect.width / 100 : Number(value.x);
  const y = usePercent ? Number(value.yPct) * wrapRect.height / 100 : Number(value.y);
  const width = usePercent ? Number(value.widthPct) * wrapRect.width / 100 : Number(value.width);
  const height = usePercent ? Number(value.heightPct) * wrapRect.height / 100 : Number(value.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x, y, width, height };
}

function storedFloatingPanelState(panelId, deviceKey = floatingPanelDeviceKey()) {
  if (floatingPanelLiveStates.has(panelId)) return floatingPanelLiveStates.get(panelId);
  const store = readFloatingPanelStore();
  return sanitizeFloatingPanelState(store?.[deviceKey]?.[panelId]);
}

function storeFloatingPanelState(panelId, panelState, deviceKey = floatingPanelDeviceKey()) {
  const nextState = sanitizeFloatingPanelState(panelState);
  if (!nextState) return;
  try {
    const store = readFloatingPanelStore();
    const wrapRect = el.viewportWrap?.getBoundingClientRect();
    const percentState = wrapRect && wrapRect.width > 0 && wrapRect.height > 0
      ? {
        xPct: Math.round(nextState.x / wrapRect.width * 10000) / 100,
        yPct: Math.round(nextState.y / wrapRect.height * 10000) / 100,
        widthPct: Math.round(nextState.width / wrapRect.width * 10000) / 100,
        heightPct: Math.round(nextState.height / wrapRect.height * 10000) / 100
      }
      : {};
    if (!store[deviceKey] || typeof store[deviceKey] !== "object") store[deviceKey] = {};
    store[deviceKey][panelId] = {
      x: Math.round(nextState.x),
      y: Math.round(nextState.y),
      width: Math.round(nextState.width),
      height: Math.round(nextState.height),
      unit: "percent",
      ...percentState
    };
    window.localStorage.setItem(EDITOR_FLOATING_PANELS_STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

function clampFloatingPanelState(panelState, options = {}) {
  const minWidth = Math.max(1, Number(options.minWidth) || 72);
  const minHeight = Math.max(1, Number(options.minHeight) || 56);
  const wrapRect = el.viewportWrap?.getBoundingClientRect();
  let width = Math.max(minWidth, Number(panelState.width) || minWidth);
  let height = Math.max(minHeight, Number(panelState.height) || minHeight);
  if (options.square) {
    const maxSize = wrapRect && wrapRect.width > 0 && wrapRect.height > 0
      ? Math.max(minWidth, Math.min(wrapRect.width, wrapRect.height))
      : Infinity;
    const size = Math.min(maxSize, Math.max(minWidth, minHeight, width, height));
    width = size;
    height = size;
  } else if (wrapRect && wrapRect.width > 0 && wrapRect.height > 0) {
    width = Math.min(width, Math.max(minWidth, wrapRect.width));
    height = Math.min(height, Math.max(minHeight, wrapRect.height));
  }
  const maxX = wrapRect && wrapRect.width > 0 ? Math.max(0, wrapRect.width - width) : Number(panelState.x) || 0;
  const maxY = wrapRect && wrapRect.height > 0 ? Math.max(0, wrapRect.height - height) : Number(panelState.y) || 0;
  return {
    x: clampNumber(Number(panelState.x) || 0, 0, maxX),
    y: clampNumber(Number(panelState.y) || 0, 0, maxY),
    width,
    height
  };
}

function applyFloatingPanelInline(panel, panelState) {
  if (!panel || !panelState) return;
  panel.style.left = Math.round(panelState.x) + "px";
  panel.style.top = Math.round(panelState.y) + "px";
  panel.style.right = "";
  panel.style.bottom = "";
  panel.style.width = Math.round(panelState.width) + "px";
  panel.style.height = Math.round(panelState.height) + "px";
}

function currentFloatingPanelState(panel, options = {}) {
  const wrapRect = el.viewportWrap?.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const fallbackWidth = panelRect.width || Number.parseFloat(panel.style.width) || Number(options.defaultWidth) || 100;
  const fallbackHeight = panelRect.height || Number.parseFloat(panel.style.height) || Number(options.defaultHeight) || fallbackWidth;
  return clampFloatingPanelState({
    x: wrapRect ? panelRect.left - wrapRect.left : 0,
    y: wrapRect ? panelRect.top - wrapRect.top : 0,
    width: fallbackWidth,
    height: fallbackHeight
  }, options);
}

function applyStoredFloatingPanelState(panel, panelId, options = {}) {
  if (!panel || panel.dataset.floatingPanelActive === "true") return false;
  const stored = storedFloatingPanelState(options.storagePanelId || panelId);
  if (!stored) return false;
  applyFloatingPanelInline(panel, clampFloatingPanelState(stored, options));
  return true;
}

function resizeFloatingPanelState(start, dx, dy, options = {}) {
  const corner = options.resizeCorner || "bottom-left";
  let next = Object.assign({}, start);
  if (options.square) {
    let desiredWidth = start.width + dx;
    let desiredHeight = start.height + dy;
    if (corner === "top-left") {
      desiredWidth = start.width - dx;
      desiredHeight = start.height - dy;
    } else if (corner === "bottom-left") {
      desiredWidth = start.width - dx;
      desiredHeight = start.height + dy;
    }
    const widthDelta = desiredWidth - start.width;
    const heightDelta = desiredHeight - start.height;
    const sizeDelta = (widthDelta + heightDelta) / 2;
    const wrapRect = el.viewportWrap?.getBoundingClientRect();
    const minSize = Math.max(Number(options.minWidth) || 64, Number(options.minHeight) || 64);
    const maxSize = wrapRect && wrapRect.width > 0 && wrapRect.height > 0
      ? Math.max(minSize, Math.min(wrapRect.width, wrapRect.height))
      : Math.max(minSize, start.width);
    const size = clampNumber(Math.max(start.width, start.height) + sizeDelta, minSize, maxSize);
    next.width = size;
    next.height = size;
    if (corner === "top-left") {
      next.x = start.x + start.width - size;
      next.y = start.y + start.height - size;
    } else if (corner === "bottom-left") {
      next.x = start.x + start.width - size;
    }
    return clampFloatingPanelState(next, options);
  }
  if (corner === "top-left") {
    next.x = start.x + dx;
    next.y = start.y + dy;
    next.width = start.width - dx;
    next.height = start.height - dy;
  } else if (corner === "bottom-left") {
    next.x = start.x + dx;
    next.width = start.width - dx;
    next.height = start.height + dy;
  } else {
    next.width = start.width + dx;
    next.height = start.height + dy;
  }
  return clampFloatingPanelState(next, options);
}

function beginFloatingPanelGesture(event, panel, panelId, options, mode) {
  if (!panel || !el.viewportWrap) return;
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
  const deviceKey = floatingPanelDeviceKey();
  const storagePanelId = options.storagePanelId || panelId;
  const start = currentFloatingPanelState(panel, options);
  const startX = event.clientX;
  const startY = event.clientY;
  const captureTarget = event.currentTarget;
  panel.dataset.floatingPanelActive = "true";
  try { captureTarget?.setPointerCapture?.(event.pointerId); } catch {}
  function onMove(moveEvent) {
    if (moveEvent.pointerId !== event.pointerId) return;
    moveEvent.preventDefault();
    moveEvent.stopPropagation();
    if (typeof moveEvent.stopImmediatePropagation === "function") moveEvent.stopImmediatePropagation();
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    const next = mode === "drag"
      ? clampFloatingPanelState(Object.assign({}, start, { x: start.x + dx, y: start.y + dy }), options)
      : resizeFloatingPanelState(start, dx, dy, options);
    floatingPanelLiveStates.set(storagePanelId, next);
    applyFloatingPanelInline(panel, next);
    if (typeof options.onPreview === "function") options.onPreview(next);
  }
  function onUp(upEvent) {
    if (upEvent.pointerId !== undefined && upEvent.pointerId !== event.pointerId) return;
    upEvent.preventDefault();
    upEvent.stopPropagation();
    if (typeof upEvent.stopImmediatePropagation === "function") upEvent.stopImmediatePropagation();
    delete panel.dataset.floatingPanelActive;
    const next = currentFloatingPanelState(panel, options);
    storeFloatingPanelState(storagePanelId, next, deviceKey);
    floatingPanelLiveStates.delete(storagePanelId);
    try { captureTarget?.releasePointerCapture?.(event.pointerId); } catch {}
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onUp, true);
    if (typeof options.onEnd === "function") options.onEnd(next);
  }
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);
}

function bindFloatingPanelHandle(handle, panel, panelId, options, mode) {
  if (!handle || handle.dataset.floatingPanelBound === panelId + ":" + mode) return;
  handle.dataset.floatingPanelBound = panelId + ":" + mode;
  handle.addEventListener("pointerdown", function (event) {
    beginFloatingPanelGesture(event, panel, panelId, options, mode);
  });
}

function ensureFloatingPanelControls(panel, panelId, options = {}) {
  if (!panel) return;
  applyStoredFloatingPanelState(panel, panelId, options);
  const dragHandle = options.dragSelector ? panel.querySelector(options.dragSelector) : null;
  if (dragHandle) {
    dragHandle.classList.add("floatingPanelDragHandle");
    dragHandle.title = "Verplaats paneel";
    bindFloatingPanelHandle(dragHandle, panel, panelId, options, "drag");
  } else if (options.dragClassName) {
    let createdDragHandle = Array.from(panel.children).find(function (child) {
      return child.classList.contains(options.dragClassName);
    });
    if (!createdDragHandle) {
      createdDragHandle = document.createElement("div");
      createdDragHandle.className = options.dragClassName + " floatingPanelDragHandle";
      createdDragHandle.title = "Verplaats paneel";
      panel.appendChild(createdDragHandle);
    }
    bindFloatingPanelHandle(createdDragHandle, panel, panelId, options, "drag");
  } else if (options.dragSelf && panel.dataset.floatingPanelSelfDragBound !== panelId) {
    panel.dataset.floatingPanelSelfDragBound = panelId;
    panel.addEventListener("pointerdown", function (event) {
      if (event.target !== panel) return;
      beginFloatingPanelGesture(event, panel, panelId, options, "drag");
    });
  }
  let resizeHandle = Array.from(panel.children).find(function (child) {
    return child.classList.contains("floatingPanelResizeHandle");
  });
  if (!resizeHandle) {
    resizeHandle = document.createElement("div");
    resizeHandle.className = "floatingPanelResizeHandle " + (options.resizeCorner === "top-left" ? "topLeft" : "bottomLeft");
    resizeHandle.title = "Resize paneel";
    panel.appendChild(resizeHandle);
  }
  bindFloatingPanelHandle(resizeHandle, panel, panelId, options, "resize");
  if (typeof options.onPreview === "function") options.onPreview(currentFloatingPanelState(panel, options));
}

function setMobileSelectedAsset(assetId) {
  state.mobileSelectedAssetId = assetId || null;
  if (!el.assetGrid) return;
  for (const card of el.assetGrid.querySelectorAll(".assetCard[data-asset-id]")) {
    card.classList.toggle("selected", Boolean(state.mobileSelectedAssetId && card.dataset.assetId === state.mobileSelectedAssetId));
  }
}

function assetThumbnailStatus(asset) {
  const status = String(asset?.metadata?.thumbnailStatus || "").trim().toLowerCase();
  if (status) return status;
  if (asset?.thumbnailPath) return "ready";
  if (asset?.assetType === "model") return "pending";
  return "skipped";
}

function assetThumbnailNeedsPolling(asset) {
  const status = assetThumbnailStatus(asset);
  return asset?.assetType === "model" && (status === "pending" || status === "processing");
}

function hasPendingThumbnails(assets) {
  return (assets || state.assets).some(function (asset) {
    return assetThumbnailNeedsPolling(asset);
  });
}

function syncAssetThumbnailPolling() {
  if (hasPendingThumbnails()) scheduleAssetThumbnailPolling();
  else stopAssetThumbnailPolling();
}

function assetThumbnailBadgeLabel(asset) {
  const status = assetThumbnailStatus(asset);
  if (status === "processing") return "Bezig";
  if (status === "pending") return "Thumbnail...";
  if (status === "failed") return "Geen thumbnail";
  if (status === "skipped") return "Overgeslagen";
  return "";
}

function assetThumbnailStatusTone(asset) {
  const status = assetThumbnailStatus(asset);
  if (status === "failed") return "failed";
  if (status === "pending" || status === "processing") return "pending";
  if (status === "skipped") return "skipped";
  return "ready";
}

function assetThumbnailStatusMessage(asset) {
  const status = assetThumbnailStatus(asset);
  if (status === "failed") return "Geen thumbnail";
  if (status === "pending" || status === "processing") return "Thumbnail wordt gemaakt...";
  if (status === "ready") return "Thumbnail klaar";
  if (status === "skipped") return "Thumbnail overgeslagen";
  return "";
}

function inferAssetTypeFromFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() : "";
  if (ext === "glb") return "model";
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return "image";
  if (["mp3", "ogg", "wav"].includes(ext)) return "audio";
  if (ext === "json") return "data";
  return "";
}

function assetNameFromFile(file) {
  return String(file?.name || "").replace(/\.[^.]+$/, "");
}

function isFileDragEvent(event) {
  const dataTransfer = event?.dataTransfer;
  if (!dataTransfer) return false;
  const types = Array.from(dataTransfer.types || []);
  if (types.includes("Files")) return true;
  const items = Array.from(dataTransfer.items || []);
  return items.some(function (item) { return item && item.kind === "file"; });
}

function showAssetDropOverlay() {
  assetColumnDropDepth = Math.max(0, assetColumnDropDepth) + 1;
  if (el.assetDropOverlay) el.assetDropOverlay.hidden = false;
}

function hideAssetDropOverlay() {
  assetColumnDropDepth = 0;
  if (el.assetDropOverlay) el.assetDropOverlay.hidden = true;
}

function stopAssetThumbnailPolling() {
  if (assetThumbnailPollTimer) clearTimeout(assetThumbnailPollTimer);
  assetThumbnailPollTimer = null;
}

function scheduleAssetThumbnailPolling() {
  if (assetThumbnailPollTimer) return;
  assetThumbnailPollTimer = setTimeout(function () {
    assetThumbnailPollTimer = null;
    pollAssetThumbnails().catch(function (error) {
      console.warn("Thumbnail polling failed", error);
      if (hasPendingThumbnails()) scheduleAssetThumbnailPolling();
    });
  }, 2500);
}

async function pollAssetThumbnails() {
  const data = await api("/api/assets");
  state.assets = data.assets || [];
  renderAssets();
  const pending = hasPendingThumbnails(state.assets);
  if (state.assetUploadAwaitingThumbnail && state.assetUploadLastAssetId) {
    const asset = assetById(state.assetUploadLastAssetId);
    const status = assetThumbnailStatus(asset);
    if (status === "failed") {
      state.assetUploadAwaitingThumbnail = false;
      setAssetUploadState({
        tone: "error",
        progressText: "Upload klaar",
        message: "Geen thumbnail"
      });
      setStatus("Thumbnail generatie mislukt.", "error");
    } else if (!pending) {
      state.assetUploadAwaitingThumbnail = false;
      setAssetUploadState({
        tone: "success",
        progressText: "Upload klaar",
        message: assetThumbnailStatusMessage(asset) || "Thumbnail klaar"
      });
      setStatus("Thumbnail klaar.", "success");
    } else {
      setAssetUploadState({
        tone: "pending",
        progressText: "Upload klaar",
        message: "Thumbnail wordt gemaakt..."
      });
    }
  }
  if (pending) scheduleAssetThumbnailPolling();
  else stopAssetThumbnailPolling();
}

function captureUploadBrowserLoadTiming(info) {
  if (!state.assetUploadTimings) return;
  if (!state.assetUploadLoadCaptureUntil || performance.now() > state.assetUploadLoadCaptureUntil) return;
  if (info?.ok === false) return;
  const durationMs = Number(info?.durationMs);
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  const current = Number(state.assetUploadTimings.glbBrowserLoadMs) || 0;
  state.assetUploadTimings.glbBrowserLoadMs = Math.round((current + durationMs) * 10) / 10;
  renderAssetImportPanel();
}

function captureUploadViewportRefreshTiming(durationMs) {
  if (!state.assetUploadTimings) return;
  if (!state.assetUploadLoadCaptureUntil || performance.now() > state.assetUploadLoadCaptureUntil) return;
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  state.assetUploadTimings.refreshViewportMs = Math.round(durationMs * 10) / 10;
  renderAssetImportPanel();
}

function setStatus(message, kind) {
  state.statusMessage = message || "";
  state.statusKind = kind || "";
  renderStatusLine();
}

function clearAutoSaveDraftTimer() {
  if (autoSaveDraftTimer) clearTimeout(autoSaveDraftTimer);
  autoSaveDraftTimer = null;
}

function scheduleAutoSaveDraft(delayMs = EDITOR_AUTOSAVE_DELAY_MS) {
  if (state.unsaved <= 0) {
    clearAutoSaveDraftTimer();
    return;
  }
  clearAutoSaveDraftTimer();
  autoSaveDraftTimer = setTimeout(function () {
    autoSaveDraftTimer = null;
    void autoSaveDraft();
  }, Math.max(5000, Number(delayMs) || EDITOR_AUTOSAVE_DELAY_MS));
}

async function autoSaveDraft() {
  if (state.autoSaveDraftBusy || state.unsaved <= 0) return;
  if (navigator.onLine === false || state.connection.lastError) {
    scheduleConnectionRecovery(1000);
    scheduleAutoSaveDraft(EDITOR_AUTOSAVE_RETRY_MS);
    return;
  }
  if (state.connection.pending > 0 || state.pendingUnsavedVisualCount > 0) {
    scheduleAutoSaveDraft(EDITOR_AUTOSAVE_RETRY_MS);
    return;
  }
  state.autoSaveDraftBusy = true;
  try {
    await flushPendingEditorWrites();
    if (state.unsaved <= 0) return;
    await apiOk("/api/editor/save-draft", { method: "POST", timeoutMs: 30000 });
    clearUnsaved();
    state.viewportDirty = false;
    clearViewportRefreshTimer();
    setStatus("Auto-save draft opgeslagen.", "success");
  } catch (error) {
    setStatus("Auto-save mislukt: " + (error?.message || String(error)), "error");
    scheduleAutoSaveDraft(EDITOR_AUTOSAVE_RETRY_MS);
  } finally {
    state.autoSaveDraftBusy = false;
  }
}

function bumpUnsaved() {
  if (state.pendingUnsavedVisualCount > 0) {
    state.pendingUnsavedVisualCount -= 1;
    renderUnsaved();
    scheduleAutoSaveDraft();
    return;
  }
  state.unsaved += 1;
  renderUnsaved();
  scheduleAutoSaveDraft();
}

// Counterpart to bumpUnsaved() for undo specifically: going back in time should bring
// the unsaved count back down, not add yet another "change" on top of it.
function unbumpUnsaved() {
  if (state.unsaved > 0) state.unsaved -= 1;
  renderUnsaved();
}

function markUnsavedPending() {
  if (state.pendingUnsavedVisualCount > 0) return false;
  state.unsaved += 1;
  state.pendingUnsavedVisualCount += 1;
  renderUnsaved();
  scheduleAutoSaveDraft();
  return true;
}

function discardPendingUnsavedVisual() {
  if (state.pendingUnsavedVisualCount <= 0) return;
  state.pendingUnsavedVisualCount -= 1;
  if (state.unsaved > 0) state.unsaved -= 1;
  renderUnsaved();
  if (state.unsaved <= 0) clearAutoSaveDraftTimer();
}

function clearUnsaved() {
  state.unsaved = 0;
  state.pendingUnsavedVisualCount = 0;
  clearAutoSaveDraftTimer();
  renderUnsaved();
}

function renderUnsaved() {
  el.unsavedBadge.textContent = isMobileLayout()
    ? state.unsaved + " unsaved"
    : state.unsaved + (state.unsaved === 1 ? " action unsaved" : " actions unsaved");
  el.unsavedBadge.className = state.unsaved === 0 ? "unsaved clean" : "unsaved";
  if (el.undoButton) el.undoButton.disabled = !canUndo();
  if (el.redoButton) el.redoButton.disabled = !canRedo();
}

function updateTopbarLabels() {
  const mobile = isMobileLayout();
  if (el.saveDraftButton) el.saveDraftButton.textContent = mobile ? "DRAFT" : "SAVE DRAFT";
  if (el.publishButton) el.publishButton.textContent = mobile ? "GAME" : "SAVE TO GAME";
  if (el.logoutButton) el.logoutButton.textContent = mobile ? "OUT" : "LOGOUT";
  renderConnectionStatus();
  renderUnsaved();
  updateEditorFullscreenButton();
}

function isBlankValue(value) {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "") || value === "";
}

function normalizeDegrees(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  let normalized = number % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized < -180) normalized += 360;
  return Math.round(normalized * 1000) / 1000;
}

function effectiveFieldValue(field, value) {
  if (!isBlankValue(value)) return value;
  const fallback = field.default;
  return fallback && typeof fallback === "object" ? clonePlain(fallback) : fallback;
}

function normalizeFieldInputValue(field, value) {
  if (field.type === "identity") {
    return isBlankValue(value) ? field.default : normalizeCanonicalId(value, field.default);
  }
  if (field.type === "reference") {
    return isBlankValue(value) ? field.default : normalizeCanonicalId(value, field.default);
  }
  if (field.type === "referenceList") {
    return normalizeReferenceList(isBlankValue(value) ? field.default : splitDelimitedValues(value));
  }
  if (field.type === "tagList") {
    return normalizeTagList(isBlankValue(value) ? field.default : splitDelimitedValues(value));
  }
  if (field.type === "tagQuery") {
    if (isBlankValue(value)) {
      const fallback = field.default;
      return fallback && typeof fallback === "object" ? clonePlain(fallback) : fallback;
    }
    if (typeof value === "object") return normalizeTagQuery(value);
    return normalizeTagQuery(JSON.parse(String(value)));
  }
  if (field.type === "tokenText") {
    return isBlankValue(value) ? field.default : String(value);
  }
  if (field.type === "formula") {
    if (isBlankValue(value)) {
      const fallback = field.default;
      return fallback && typeof fallback === "object" ? clonePlain(fallback) : fallback;
    }
    if (typeof value === "object") return clonePlain(value);
    return JSON.parse(String(value));
  }
  if (field.type === "localizedText") {
    if (isBlankValue(value)) {
      const fallback = field.default;
      return fallback && typeof fallback === "object" ? clonePlain(fallback) : fallback;
    }
    if (typeof value === "string") {
      return { key: normalizeCanonicalId(value, ""), fallbackText: "" };
    }
    if (value && typeof value === "object") {
      return {
        key: normalizeCanonicalId(value.key, ""),
        fallbackText: isBlankValue(value.fallbackText) ? "" : String(value.fallbackText)
      };
    }
    return { key: "", fallbackText: "" };
  }
  if (field.type === "boolean") {
    return value === true || value === "true" || value === 1 || value === "1";
  }
  if (field.type === "number") {
    return isBlankValue(value) ? field.default : Number(value);
  }
  if (field.type === "json") {
    if (isBlankValue(value)) {
      const fallback = field.default;
      return fallback && typeof fallback === "object" ? clonePlain(fallback) : fallback;
    }
    if (typeof value === "object") return clonePlain(value);
    return JSON.parse(String(value));
  }
  if (field.type === "minimapMarkerCategories") {
    return normalizeMinimapMarkerCategories(value, field.default || []);
  }
  if (isBlankValue(value)) {
    const fallback = field.default;
    return fallback && typeof fallback === "object" ? clonePlain(fallback) : fallback;
  }
  return typeof value === "string" ? value.trim() : value;
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function splitDelimitedValues(value) {
  if (Array.isArray(value)) {
    return value.map(function (entry) {
      return String(entry === null || entry === undefined ? "" : entry).trim();
    }).filter(Boolean);
  }
  return String(value === null || value === undefined ? "" : value)
    .split(/[\n,]+/g)
    .map(function (entry) {
      return entry.trim();
    })
    .filter(Boolean);
}

function stringifyListValue(value) {
  if (Array.isArray(value)) {
    return value.map(function (entry) {
      return String(entry === null || entry === undefined ? "" : entry);
    }).join("\n");
  }
  return isBlankValue(value) ? "" : String(value);
}

function stringifyJsonValue(value, fallback = null) {
  try {
    return JSON.stringify(value === undefined ? fallback : value, null, 2);
  } catch {
    return JSON.stringify(fallback, null, 2);
  }
}

function validationIssueText(issue) {
  if (typeof issue === "string") return issue;
  if (issue && typeof issue === "object") return String(issue.message || issue.code || JSON.stringify(issue));
  return String(issue || "");
}

function validationIssueNodeId(issue) {
  if (issue && typeof issue === "object" && issue.nodeId && nodeById(issue.nodeId)) return issue.nodeId;
  const text = validationIssueText(issue);
  const nodeMatch = /^Node\s+([a-zA-Z0-9_.:-]+)/.exec(text);
  if (nodeMatch && nodeById(nodeMatch[1])) return nodeMatch[1];
  const groupOutputMatch = /^Group output '([^']+)' is not connected inside(?: group '([^']+)')?/.exec(text);
  if (groupOutputMatch) {
    const portLabel = groupOutputMatch[1];
    const groupLabel = groupOutputMatch[2] || "";
    for (const group of state.graph.nodes || []) {
      if (group.type !== "group") continue;
      const labelMatches = !groupLabel
        || group.id === groupLabel
        || group.title === groupLabel
        || group.values?.title === groupLabel;
      if (!labelMatches) continue;
      const outputs = Array.isArray(group.values?.groupInterface?.outputs) ? group.values.groupInterface.outputs : [];
      const port = outputs.find(function (candidate) {
        return candidate && (candidate.label === portLabel || candidate.name === portLabel || candidate.id === portLabel);
      });
      if (!port?.name) continue;
      const outputNode = (state.graph.nodes || []).find(function (node) {
        return node.parentId === group.id && node.type === "group_output";
      });
      if (!outputNode) return group.id;
      const connected = (state.graph.edges || []).some(function (edge) {
        return edge.toNodeId === outputNode.id && edge.toPort === port.name;
      });
      if (!connected) return group.id;
    }
  }
  return null;
}

function validationIssueEdgeId(issue) {
  if (issue && typeof issue === "object" && issue.edgeId) return issue.edgeId;
  const text = validationIssueText(issue);
  const edgeMatch = /^Edge\s+([a-zA-Z0-9_.:-]+)/.exec(text);
  return edgeMatch ? edgeMatch[1] : null;
}

function renderValidationIssue(kind, issue) {
  const text = validationIssueText(issue);
  const nodeId = validationIssueNodeId(issue);
  const edgeId = validationIssueEdgeId(issue);
  const targetExists = nodeId || (edgeId && (state.graph.edges || []).some(function (edge) { return edge.id === edgeId; }));
  const item = document.createElement(targetExists ? "button" : "div");
  item.className = kind === "warning" ? "vWarn" : "vErr";
  if (targetExists) {
    item.type = "button";
    item.classList.add("validationJump");
    item.title = "Klik om naar het probleem te gaan";
    item.addEventListener("click", function () {
      if (nodeId) {
        selectNode(nodeId, true, { clearPendingEdge: true, showMobileInspector: true });
      } else if (edgeId) {
        selectEdge(edgeId, { clearPendingEdge: true });
      }
    });
  }
  item.textContent = (kind === "warning" ? "! " : "- ") + text;
  return item;
}

function assetById(assetId) {
  return state.assets.find(function (asset) { return asset.id === assetId; }) || null;
}

function runtimeNodeId(node) {
  if (!node) return null;
  if (node.type === "player_character") return node.values?.playerId || null;
  if (node.type === "model_entity") return node.id || node.values?.entityId || null;
  if (node.type === "bounded_area_scatter") return node.id || null;
  if (node.type === "surface_layer") return node.values?.surfaceId || null;
  return null;
}

function isModelEntityTransformPatch(node, patch) {
  const keys = Object.keys(patch || {});
  return Boolean(node && node.type === "model_entity" && keys.length && keys.every(function (key) {
    return MODEL_ENTITY_TRANSFORM_FIELDS.has(key);
  }));
}

function isEditorCameraPatch(node, patch) {
  const keys = Object.keys(patch || {});
  return Boolean(node && node.type === "editor_camera" && keys.length && keys.every(function (key) {
    return EDITOR_CAMERA_FIELDS.has(key);
  }));
}

function normalizeModelEntityTransformPatch(node, patch) {
  if (!isModelEntityTransformPatch(node, patch)) return patch;
  const values = Object.assign({}, node.values || {}, patch || {});
  const nextPatch = Object.assign({}, patch || {});
  nextPatch.rotationX = normalizeDegrees(values.rotationX);
  nextPatch.rotationY = normalizeDegrees(values.rotationY);
  nextPatch.rotationZ = normalizeDegrees(values.rotationZ);
  return nextPatch;
}

function graphWithPatchedNodeValues(graph, nodeId, patch) {
  return Object.assign({}, graph || state.graph, {
    nodes: ((graph || state.graph).nodes || []).map(function (node) {
      if (node.id !== nodeId) return node;
      return Object.assign({}, node, {
        values: Object.assign({}, node.values || {}, patch || {})
      });
    })
  });
}

function graphWithPatchedNodeValuesBulk(graph, patches) {
  const patchMap = new Map((Array.isArray(patches) ? patches : []).map(function (patch) {
    return [patch.nodeId, patch.values || {}];
  }));
  if (!patchMap.size) return graph || state.graph;
  return Object.assign({}, graph || state.graph, {
    nodes: ((graph || state.graph).nodes || []).map(function (node) {
      const patch = patchMap.get(node.id);
      if (!patch) return node;
      return Object.assign({}, node, {
        values: Object.assign({}, node.values || {}, patch)
      });
    })
  });
}

function syncRuntimeModelEntityTransform(nodeId) {
  if (!runtime || typeof runtime.setEntityTransform !== "function") return false;
  const node = nodeById(nodeId);
  if (!node || node.type !== "model_entity") return false;
  return runtime.setEntityTransform(runtimeNodeId(node), node.values || {});
}

function runtimeSelectedEntityId() {
  if (!runtime || typeof runtime.getSelectedEntityId !== "function") return null;
  return runtime.getSelectedEntityId() || null;
}

function runtimeTransformActive() {
  if (!runtime || typeof runtime.isTransformActive !== "function") return false;
  return runtime.isTransformActive();
}

function runtimeTransformDebugState() {
  if (!runtime || typeof runtime.getTransformDebugState !== "function") return null;
  return runtime.getTransformDebugState();
}

function runtimeEntityIdFromPointer(event) {
  if (!runtime || typeof runtime.pickEntityAt !== "function" || !event) return null;
  return runtime.pickEntityAt(event.clientX, event.clientY) || null;
}

function runtimeEntityIdAtLastPointer() {
  if (!terrainLastPointer || !runtime || typeof runtime.pickEntityAt !== "function") return null;
  return runtime.pickEntityAt(terrainLastPointer.clientX, terrainLastPointer.clientY) || null;
}

function runtimeModelEntityIdAtLastPointer() {
  const runtimeId = runtimeEntityIdAtLastPointer();
  const node = nodeByRuntimeId(runtimeId);
  return node && node.type === "model_entity" ? runtimeId : null;
}

function isPrimaryPointerAction(event) {
  const pointerType = String(event?.pointerType || "");
  return event?.button === 0 || pointerType === "touch" || pointerType === "pen";
}

function nodeByRuntimeId(runtimeId) {
  if (!runtimeId) return null;
  return state.graph.nodes.find(function (node) {
    return node.values && (
      node.id === runtimeId
      || node.values.entityId === runtimeId
      || node.values.playerId === runtimeId
      || node.values.surfaceId === runtimeId
    );
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
    const name = String(entry?.name || entry?.value || "").trim();
    return {
      name: name,
      value: name,
      label: name,
      index: Number.isFinite(Number(entry?.index)) ? Number(entry.index) : 0
    };
  }).filter(function (entry) { return Boolean(entry.name); });
}

function defaultAnimationForAsset(asset) {
  const defaultAnimation = String(asset?.metadata?.defaultAnimation || "").trim();
  return defaultAnimation || null;
}

function animationCountText(asset) {
  const count = Number(asset?.metadata?.animationCount || 0);
  return String(count);
}

function managedAsset() {
  return assetById(state.assetManager.assetId);
}

function managedAssetDraftValue(current, draft) {
  return draft === null || draft === undefined ? current : draft;
}

function managedAssetUsageField(entry) {
  return state.nodeTypes?.[entry.nodeType]?.fields?.[entry.fieldKey] || null;
}

function focusAssetUsage(usage) {
  if (!usage || !usage.nodeId) return;
  const node = nodeById(usage.nodeId);
  if (!node) return;
  selectNode(usage.nodeId, true, { clearPendingEdge: true });
  if (!runtime) return;
  const runtimeId = runtimeNodeId(node);
  if (!runtimeId || typeof runtime.selectEntity !== "function") return;
  runtime.selectEntity(runtimeId);
  const focused = typeof runtime.focusSelected === "function" ? runtime.focusSelected() : false;
  if (!focused && selectedNode) {
    const point = viewportSelectablePoint(selectedNode);
    if (point && typeof runtime.frameWorldPoints === "function") runtime.frameWorldPoints([point]);
  }
}

function compatibleReplacementAssets(assetId, usage) {
  const asset = assetById(assetId);
  if (!asset) return [];
  const usageList = Array.isArray(usage) ? usage : [];
  return state.assets.filter(function (candidate) {
    if (!candidate || candidate.id === assetId) return false;
    return usageList.every(function (entry) {
      const field = managedAssetUsageField(entry);
      return Boolean(field && field.type === "asset" && Array.isArray(field.assetTypes) && field.assetTypes.includes(candidate.assetType));
    });
  });
}

function assetUsageMetaText(entry) {
  return [entry.nodeType, entry.fieldLabel].filter(Boolean).join(" · ");
}

function setManagedAssetDraft(field, value) {
  state.assetManager.error = "";
  if (field === "name") state.assetManager.draftName = value;
  if (field === "category") state.assetManager.draftCategory = value;
}

function openAssetManageOverlay(assetId) {
  const asset = assetById(assetId);
  if (!asset) return;
  state.assetManager.assetId = assetId;
  state.assetManager.usage = [];
  state.assetManager.loadingUsage = true;
  state.assetManager.error = "";
  state.assetManager.replacementAssetId = "";
  state.assetManager.draftName = asset.name;
  state.assetManager.draftCategory = asset.category;
  state.assetManager.thumbnailRetryBusy = false;
  state.assetManager.requestToken += 1;
  const token = state.assetManager.requestToken;
  renderAssetManageOverlay();
  loadManagedAssetUsage(assetId, token);
}

function closeAssetManageOverlay() {
  state.assetManager.assetId = null;
  state.assetManager.usage = [];
  state.assetManager.loadingUsage = false;
  state.assetManager.error = "";
  state.assetManager.replacementAssetId = "";
  state.assetManager.draftName = null;
  state.assetManager.draftCategory = null;
  state.assetManager.thumbnailRetryBusy = false;
  state.assetManager.requestToken += 1;
  renderAssetManageOverlay();
}

function requestManagedAssetUsage(assetId) {
  const targetAssetId = String(assetId || "").trim();
  if (!targetAssetId) return;
  state.assetManager.loadingUsage = true;
  state.assetManager.requestToken += 1;
  const token = state.assetManager.requestToken;
  renderAssetManageOverlay();
  loadManagedAssetUsage(targetAssetId, token);
}

async function loadManagedAssetUsage(assetId, token) {
  try {
    const data = await api("/api/assets/" + assetId + "/usage");
    if (state.assetManager.assetId !== assetId || state.assetManager.requestToken !== token) return;
    state.assetManager.usage = data.usage || [];
    state.assetManager.loadingUsage = false;
    state.assetManager.error = "";
    if (state.assetManager.replacementAssetId) {
      const compatible = compatibleReplacementAssets(assetId, state.assetManager.usage);
      if (!compatible.some(function (asset) { return asset.id === state.assetManager.replacementAssetId; })) {
        state.assetManager.replacementAssetId = "";
      }
    }
    renderAssetManageOverlay();
  } catch (error) {
    if (state.assetManager.assetId !== assetId || state.assetManager.requestToken !== token) return;
    state.assetManager.loadingUsage = false;
    state.assetManager.error = error.message;
    if (error.status === 404) {
      closeAssetManageOverlay();
      setStatus(error.message, "error");
      return;
    }
    renderAssetManageOverlay();
    setStatus(error.message, "error");
  }
}

function renderAssetManageOverlay() {
  const overlay = el.assetManageOverlay;
  const panel = el.assetManagePanel;
  if (!overlay || !panel) return;
  const asset = managedAsset();
  if (!state.assetManager.assetId || !asset) {
    overlay.hidden = true;
    panel.innerHTML = "";
    return;
  }
  overlay.hidden = false;
  panel.innerHTML = "";
  const title = document.createElement("div");
  title.className = "assetManageTitle";
  title.textContent = asset.name;
  const subtitle = document.createElement("div");
  subtitle.className = "assetManageSubtitle";
  subtitle.textContent = asset.assetType + " · " + asset.category;
  const idLine = document.createElement("div");
  idLine.className = "assetManageId";
  idLine.textContent = asset.id;

  const nameField = document.createElement("label");
  nameField.className = "assetManageField";
  const nameLabel = document.createElement("span");
  nameLabel.textContent = "Naam";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.maxLength = 96;
  nameInput.value = managedAssetDraftValue(asset.name, state.assetManager.draftName);
  nameInput.addEventListener("input", function () { setManagedAssetDraft("name", nameInput.value); });
  nameField.append(nameLabel, nameInput);

  const categoryField = document.createElement("label");
  categoryField.className = "assetManageField";
  const categoryLabel = document.createElement("span");
  categoryLabel.textContent = "Categorie";
  const categoryInput = document.createElement("input");
  categoryInput.type = "text";
  categoryInput.maxLength = 64;
  categoryInput.value = managedAssetDraftValue(asset.category, state.assetManager.draftCategory);
  categoryInput.addEventListener("input", function () { setManagedAssetDraft("category", categoryInput.value); });
  categoryField.append(categoryLabel, categoryInput);

  const usageHeading = document.createElement("div");
  usageHeading.className = "assetManageSectionTitle";
  usageHeading.textContent = "Gebruikslijst";
  const usageList = document.createElement("div");
  usageList.className = "assetManageUsage";
  if (state.assetManager.loadingUsage) {
    const loading = document.createElement("div");
    loading.className = "assetManageEmpty";
    loading.textContent = "Gebruikslijst laden...";
    usageList.appendChild(loading);
  } else if (!state.assetManager.usage.length) {
    const empty = document.createElement("div");
    empty.className = "assetManageEmpty";
    empty.textContent = "Niet in gebruik.";
    usageList.appendChild(empty);
  } else {
    for (const entry of state.assetManager.usage) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "assetManageUsageItem";
      item.title = "Selecteer node";
      const itemTitle = document.createElement("div");
      itemTitle.className = "assetManageUsageTitle";
      itemTitle.textContent = entry.nodeTitle || entry.nodeType;
      const itemMeta = document.createElement("div");
      itemMeta.className = "assetManageUsageMeta";
      itemMeta.textContent = assetUsageMetaText(entry);
      item.append(itemTitle, itemMeta);
      item.addEventListener("click", function () {
        focusAssetUsage(entry);
      });
      usageList.appendChild(item);
    }
  }

  const compatibleAssets = compatibleReplacementAssets(asset.id, state.assetManager.usage);
  if (state.assetManager.replacementAssetId && !compatibleAssets.some(function (candidate) { return candidate.id === state.assetManager.replacementAssetId; })) {
    state.assetManager.replacementAssetId = "";
  }

  const assetThumbnailStatus = asset.assetType === "model" ? String(asset?.metadata?.thumbnailStatus || "").trim().toLowerCase() : "";
  let thumbnailSection = null;
  if (asset.assetType === "model") {
    thumbnailSection = document.createElement("div");
    thumbnailSection.className = "assetManageThumbnail";
    const thumbnailTitle = document.createElement("div");
    thumbnailTitle.className = "assetManageSectionTitle";
    thumbnailTitle.textContent = "Thumbnail";
    const thumbnailMessage = document.createElement("div");
    thumbnailMessage.className = "assetManageHint";
    thumbnailMessage.textContent = assetThumbnailStatusMessage(asset) || "Thumbnail opnieuw genereren.";
    thumbnailSection.append(thumbnailTitle, thumbnailMessage);
    const thumbnailError = String(asset?.metadata?.thumbnailError || "").trim();
    if (assetThumbnailStatus === "failed" && thumbnailError) {
      const error = document.createElement("div");
      error.className = "assetManageError";
      error.textContent = thumbnailError;
      thumbnailSection.appendChild(error);
    }
    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "assetManageButton retry";
    retryButton.textContent = state.assetManager.thumbnailRetryBusy
      ? "Thumbnail opnieuw maken..."
      : assetThumbnailStatus === "pending" || assetThumbnailStatus === "processing"
        ? "Thumbnail wordt gemaakt"
        : "Thumbnail opnieuw maken";
    retryButton.disabled = state.assetManager.thumbnailRetryBusy || state.assetManager.loadingUsage || assetThumbnailStatus === "pending" || assetThumbnailStatus === "processing";
    retryButton.title = retryButton.disabled
      ? (state.assetManager.thumbnailRetryBusy
        ? "Thumbnail wordt opnieuw gemaakt."
        : state.assetManager.loadingUsage
          ? "Gebruikslijst wordt nog geladen."
          : "Er wordt al een thumbnail gemaakt.")
      : "Probeer de thumbnail opnieuw te maken.";
    retryButton.addEventListener("click", retryManagedAssetThumbnail);
    thumbnailSection.appendChild(retryButton);
  }

  const actions = document.createElement("div");
  actions.className = "assetManageActions";
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "assetManageButton save";
  saveButton.textContent = "Opslaan";
  saveButton.addEventListener("click", saveManagedAsset);
  actions.appendChild(saveButton);

  if (state.assetManager.usage.length > 0) {
    const replaceWrap = document.createElement("div");
    replaceWrap.className = "assetManageReplace";
    const replaceLabel = document.createElement("label");
    replaceLabel.className = "assetManageField";
    const replaceTitle = document.createElement("span");
    replaceTitle.textContent = "Vervang door";
    const replaceSelect = document.createElement("select");
    replaceSelect.disabled = state.assetManager.loadingUsage || !compatibleAssets.length;
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = compatibleAssets.length ? "(kies asset)" : "Geen compatibele vervangers";
    replaceSelect.appendChild(blank);
    for (const candidate of compatibleAssets) {
      const option = document.createElement("option");
      option.value = candidate.id;
      option.textContent = candidate.name + " (" + candidate.assetType + ")";
      if (candidate.id === state.assetManager.replacementAssetId) option.selected = true;
      replaceSelect.appendChild(option);
    }
    replaceSelect.value = state.assetManager.replacementAssetId || "";
    replaceSelect.addEventListener("change", function () {
      state.assetManager.error = "";
      state.assetManager.replacementAssetId = replaceSelect.value;
      renderAssetManageOverlay();
    });
    replaceLabel.append(replaceTitle, replaceSelect);
    replaceWrap.appendChild(replaceLabel);
    if (!compatibleAssets.length) {
      const note = document.createElement("div");
      note.className = "assetManageHint";
      note.textContent = "Geen compatibele vervangers beschikbaar.";
      replaceWrap.appendChild(note);
    }
    const replaceButton = document.createElement("button");
    replaceButton.type = "button";
    replaceButton.className = "assetManageButton replace";
    replaceButton.textContent = "Vervang asset";
    replaceButton.disabled = state.assetManager.loadingUsage || !state.assetManager.replacementAssetId || !compatibleAssets.some(function (candidate) { return candidate.id === state.assetManager.replacementAssetId; });
    replaceButton.addEventListener("click", replaceManagedAsset);
    replaceWrap.appendChild(replaceButton);
    actions.appendChild(replaceWrap);
  }

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "assetManageButton delete";
  deleteButton.textContent = "Verwijder";
  deleteButton.disabled = state.assetManager.loadingUsage || state.assetManager.usage.length > 0;
  deleteButton.title = state.assetManager.usage.length > 0 ? "Vervang eerst de verwijzingen." : "Verwijder deze asset.";
  deleteButton.addEventListener("click", deleteManagedAsset);
  actions.appendChild(deleteButton);

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "assetManageButton cancel";
  cancelButton.textContent = "Annuleren";
  cancelButton.addEventListener("click", closeAssetManageOverlay);
  actions.appendChild(cancelButton);

  const panelParts = [title, subtitle, idLine, nameField, categoryField];
  if (thumbnailSection) panelParts.push(thumbnailSection);
  panelParts.push(usageHeading, usageList);
  panel.append(...panelParts);
  if (state.assetManager.error) {
    const error = document.createElement("div");
    error.className = "assetManageError";
    error.textContent = state.assetManager.error;
    panel.appendChild(error);
  }
  panel.appendChild(actions);
}

async function saveManagedAsset() {
  const asset = managedAsset();
  if (!asset) return;
  const name = String(managedAssetDraftValue(asset.name, state.assetManager.draftName)).trim();
  const category = String(managedAssetDraftValue(asset.category, state.assetManager.draftCategory)).trim();
  try {
    const data = await api("/api/assets/" + asset.id, {
      method: "PATCH",
      body: JSON.stringify({ name: name, category: category })
    });
    state.assets = data.assets || state.assets;
    state.assetManager.draftName = data.asset?.name || name;
    state.assetManager.draftCategory = data.asset?.category || category;
    state.assetManager.error = "";
    renderAssets();
    renderInspector();
    renderAssetManageOverlay();
    setStatus("Asset opgeslagen.", "success");
  } catch (error) {
    if (error.status === 409 && Array.isArray(error.details?.usage)) {
      state.assetManager.usage = error.details.usage;
      state.assetManager.loadingUsage = false;
    }
    state.assetManager.error = error.message;
    renderAssetManageOverlay();
    setStatus(error.message, "error");
  }
}

async function deleteManagedAsset() {
  const asset = managedAsset();
  if (!asset) return;
  if (state.assetManager.loadingUsage) return;
  if (state.assetManager.usage.length > 0) {
    state.assetManager.error = "Vervang eerst de verwijzingen.";
    renderAssetManageOverlay();
    setStatus("Vervang eerst de verwijzingen.", "error");
    return;
  }
  if (!window.confirm("Asset verwijderen?")) return;
  try {
    const data = await api("/api/assets/" + asset.id, { method: "DELETE" });
    state.assets = data.assets || [];
    renderAssets();
    renderInspector();
    closeAssetManageOverlay();
    setStatus("Asset verwijderd.", "success");
  } catch (error) {
    state.assetManager.error = error.message;
    renderAssetManageOverlay();
    setStatus(error.message, "error");
  }
}

async function retryManagedAssetThumbnail() {
  const asset = managedAsset();
  if (!asset) return;
  if (asset.assetType !== "model") return;
  const thumbnailStatus = assetThumbnailStatus(asset);
  if (thumbnailStatus === "pending" || thumbnailStatus === "processing") return;
  if (state.assetManager.thumbnailRetryBusy || state.assetManager.loadingUsage) return;
  state.assetManager.thumbnailRetryBusy = true;
  state.assetManager.error = "";
  renderAssetManageOverlay();
  try {
    const data = await api("/api/assets/" + asset.id + "/thumbnail/retry", { method: "POST" });
    state.assets = data.assets || state.assets;
    renderAssets();
    syncAssetThumbnailPolling();
    renderInspector();
    renderAssetManageOverlay();
    setStatus("Thumbnail opnieuw gestart.", "success");
  } catch (error) {
    state.assetManager.error = error.message;
    renderAssetManageOverlay();
    setStatus(error.message, "error");
  } finally {
    state.assetManager.thumbnailRetryBusy = false;
    renderAssetManageOverlay();
  }
}

async function replaceManagedAsset() {
  const asset = managedAsset();
  if (!asset) return;
  if (state.assetManager.loadingUsage) return;
  const replacementAssetId = String(state.assetManager.replacementAssetId || "").trim();
  if (!replacementAssetId) {
    state.assetManager.error = "Kies een vervangende asset.";
    renderAssetManageOverlay();
    setStatus("Kies een vervangende asset.", "error");
    return;
  }
  const replacementAsset = assetById(replacementAssetId);
  if (!replacementAsset) {
    state.assetManager.error = "Vervangende asset bestaat niet.";
    renderAssetManageOverlay();
    setStatus("Vervangende asset bestaat niet.", "error");
    return;
  }
  const result = await applyGraphMutation(function () {
    return api("/api/assets/" + asset.id + "/replace", {
      method: "POST",
      body: JSON.stringify({ replacementAssetId: replacementAssetId })
    });
  }, {
    historyLabel: "Asset vervangen",
    refreshViewport: true,
    refreshValidation: true,
    refreshAssetUsage: false,
    afterApply: function (_, response) {
      state.assets = response.assets || state.assets;
      state.assetManager.usage = [];
      state.assetManager.loadingUsage = true;
      state.assetManager.error = "";
      state.assetManager.replacementAssetId = "";
      renderAssets();
      renderInspector();
      renderAssetManageOverlay();
      const requestToken = state.assetManager.requestToken;
      loadManagedAssetUsage(asset.id, requestToken).then(function () {
        if (state.assetManager.assetId !== asset.id || state.assetManager.requestToken !== requestToken) return;
        if (!state.assetManager.usage.length) {
          setStatus("Vervangen gelukt. Deze asset wordt niet meer gebruikt en kan nu verwijderd worden.", "success");
        } else {
          setStatus("Asset vervangen.", "success");
        }
      });
    }
  });
  if (!result) {
    state.assetManager.error = state.statusMessage || "Vervangen mislukt.";
    renderAssetManageOverlay();
  }
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
  if (!runtime || typeof runtime.getSelectedEntityTransform !== "function") return null;
  const snapshot = runtime.getSelectedEntityTransform();
  const node = selectedModelNode();
  if (!snapshot || !node) return null;
  const runtimeId = runtimeNodeId(node);
  if (runtimeId && snapshot.entityId && snapshot.entityId !== runtimeId) return null;
  return snapshot;
}

function terrainTypeLabel(type) {
  return String(type || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, function (char) { return char.toUpperCase(); });
}

function selectedTerrainNode() {
  const node = nodeById(state.selectedNodeId);
  return node && TERRAIN_TOOL_NODE_TYPES.has(node.type) ? node : null;
}

function selectedScatterNode() {
  const node = nodeById(state.selectedNodeId);
  return node && node.type === "bounded_area_scatter" ? node : null;
}

function terrainNodeLabel(node) {
  if (!node) return "";
  return String(node.values?.label || node.title || terrainTypeLabel(node.type) || "").trim();
}

const TERRAIN_HEIGHT_DRAG_STEP = 0.02;

function terrainFallbackRectanglePoints(node) {
  const surface = terrainSurfaceSnapshot(node);
  const x = surface.x;
  const y = surface.y;
  const z = surface.z;
  const width = Math.max(0, surface.width);
  const depth = Math.max(0, surface.depth);
  const rotation = surface.rotationY;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const radians = rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const offsets = [
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: halfWidth, z: halfDepth },
    { x: -halfWidth, z: halfDepth }
  ];
  return offsets.map(function (offset) {
    return {
      x: x + ((offset.x * cos) - (offset.z * sin)),
      y: y,
      z: z + ((offset.x * sin) + (offset.z * cos))
    };
  });
}

function terrainNodePoints(node) {
  const points = Array.isArray(node?.values?.points) ? node.values.points : [];
  const normalized = [];
  const surfaceY = Number(node?.values?.y);
  const defaultY = Number.isFinite(surfaceY) ? surfaceY : 0;
  for (const point of points) {
    const x = Number(point?.x);
    const z = Number(point?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    if (node?.type === "walkable_surface") {
      const y = Number(point?.y);
      normalized.push({ x: x, y: Number.isFinite(y) ? y : defaultY, z: z });
    } else {
      normalized.push({ x: x, z: z });
    }
  }
  if (TERRAIN_CLOSED_SHAPE_NODE_TYPES.has(node?.type) && normalized.length === 0) {
    return terrainFallbackRectanglePoints(node);
  }
  return normalized;
}

function terrainClonePoints(points) {
  const next = [];
  for (const point of points || []) {
    const x = Number(point?.x);
    const z = Number(point?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const y = Number(point?.y);
    if (Number.isFinite(y)) next.push({ x: x, y: y, z: z });
    else next.push({ x: x, z: z });
  }
  return next;
}

function scatterNodeLabel(node) {
  if (!node) return "";
  return String(node.values?.label || node.values?.scatterId || node.title || terrainTypeLabel(node.type) || "").trim();
}

function scatterFallbackRectanglePoints(node) {
  const x = Number(node?.values?.areaCenterX) || 0;
  const z = Number(node?.values?.areaCenterZ) || 0;
  const width = Math.max(0, Number(node?.values?.areaWidth) || 0);
  const depth = Math.max(0, Number(node?.values?.areaDepth) || 0);
  const rotation = Number(node?.values?.areaRotationY) || 0;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const radians = rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const offsets = [
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: halfWidth, z: halfDepth },
    { x: -halfWidth, z: halfDepth }
  ];
  return offsets.map(function (offset) {
    return {
      x: x + ((offset.x * cos) - (offset.z * sin)),
      z: z + ((offset.x * sin) + (offset.z * cos))
    };
  });
}

function scatterNodePoints(node) {
  const explicitPoints = terrainClonePoints(node?.values?.points);
  if (explicitPoints.length >= 3) return explicitPoints;
  return scatterFallbackRectanglePoints(node);
}

function scatterClonePoints(points) {
  return terrainClonePoints(points);
}

function scatterPointBounds(points) {
  const normalized = terrainClonePoints(points);
  if (!normalized.length) return null;
  let minX = normalized[0].x;
  let maxX = normalized[0].x;
  let minZ = normalized[0].z;
  let maxZ = normalized[0].z;
  for (const point of normalized) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.z < minZ) minZ = point.z;
    if (point.z > maxZ) maxZ = point.z;
  }
  return {
    minX: minX,
    maxX: maxX,
    minZ: minZ,
    maxZ: maxZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    width: Math.max(0, maxX - minX),
    depth: Math.max(0, maxZ - minZ)
  };
}

function scatterPointCenter(points) {
  const normalized = terrainClonePoints(points);
  if (!normalized.length) return { x: 0, z: 0 };
  let totalX = 0;
  let totalZ = 0;
  for (const point of normalized) {
    totalX += point.x;
    totalZ += point.z;
  }
  return {
    x: totalX / normalized.length,
    z: totalZ / normalized.length
  };
}

function terrainLastPointerGroundPoint() {
  return terrainLastPointer
    ? terrainGroundPointFromClient(terrainLastPointer.clientX, terrainLastPointer.clientY)
    : null;
}

function pointTransformStartGroundFromPivot(pivot) {
  const x = Number(pivot?.x);
  const z = Number(pivot?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const offset = Math.max(1, Number(state.snapGridSize) || 1);
  return { x: x + offset, z: z };
}

function scatterTranslatePoints(points, dx, dz) {
  return terrainClonePoints(points).map(function (point) {
    const nextPoint = { x: point.x + dx, z: point.z + dz };
    if (Number.isFinite(Number(point?.y))) nextPoint.y = Number(point.y);
    return nextPoint;
  });
}

function scatterRotatePoints(points, pivot, degrees) {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const origin = pivot || { x: 0, z: 0 };
  return terrainClonePoints(points).map(function (point) {
    const dx = point.x - origin.x;
    const dz = point.z - origin.z;
    const nextPoint = {
      x: origin.x + ((dx * cos) - (dz * sin)),
      z: origin.z + ((dx * sin) + (dz * cos))
    };
    if (Number.isFinite(Number(point?.y))) nextPoint.y = Number(point.y);
    return nextPoint;
  });
}

function scatterScalePoints(points, pivot, factor) {
  const origin = pivot || { x: 0, z: 0 };
  const safeFactor = Number.isFinite(factor) ? factor : 1;
  return terrainClonePoints(points).map(function (point) {
    const nextPoint = {
      x: origin.x + ((point.x - origin.x) * safeFactor),
      z: origin.z + ((point.z - origin.z) * safeFactor)
    };
    if (Number.isFinite(Number(point?.y))) nextPoint.y = Number(point.y);
    return nextPoint;
  });
}

function scatterScalePointsByAxis(points, pivot, factorX, factorZ) {
  const origin = pivot || { x: 0, z: 0 };
  const safeFactorX = Number.isFinite(factorX) ? factorX : 1;
  const safeFactorZ = Number.isFinite(factorZ) ? factorZ : 1;
  return terrainClonePoints(points).map(function (point) {
    const nextPoint = {
      x: origin.x + ((point.x - origin.x) * safeFactorX),
      z: origin.z + ((point.z - origin.z) * safeFactorZ)
    };
    if (Number.isFinite(Number(point?.y))) nextPoint.y = Number(point.y);
    return nextPoint;
  });
}

function terrainSurfaceSnapshot(node) {
  return {
    x: Number(node?.values?.x) || 0,
    y: Number(node?.values?.y) || 0,
    z: Number(node?.values?.z) || 0,
    width: Number(node?.values?.width) || 0,
    depth: Number(node?.values?.depth) || 0,
    rotationY: Number(node?.values?.rotationY) || 0,
    priority: Number(node?.values?.priority) || 0
  };
}

function terrainWalkableSurfaceGeometry(node, points) {
  const surface = terrainSurfaceSnapshot(node);
  const bounds = scatterPointBounds(points);
  if (!bounds) return surface;
  let totalY = 0;
  let countY = 0;
  for (const point of points || []) {
    const y = Number(point?.y);
    if (!Number.isFinite(y)) continue;
    totalY += y;
    countY += 1;
  }
  return Object.assign({}, surface, {
    x: bounds.centerX,
    y: countY > 0 ? totalY / countY : surface.y,
    z: bounds.centerZ,
    width: bounds.width,
    depth: bounds.depth
  });
}

function terrainPointHeight(point, fallbackY = 0) {
  const y = Number(point?.y);
  return Number.isFinite(y) ? y : fallbackY;
}

function terrainDraggedPointIndices(pointIndex) {
  return state.terrainTool.selectedPointIndices.length > 1
    ? state.terrainTool.selectedPointIndices
    : (Number.isInteger(pointIndex) ? [pointIndex] : []);
}

function terrainHeightDragDelta() {
  const startPointer = state.terrainTool.dragStartPointer;
  const currentPointer = state.terrainTool.dragCurrentPointer || startPointer;
  if (!startPointer || !currentPointer) return 0;
  return (startPointer.y - currentPointer.y) * TERRAIN_HEIGHT_DRAG_STEP;
}

function terrainVerticalHeightSession(node) {
  return node?.type === "walkable_surface" && state.terrainTool.axisConstraint === "z";
}

function terrainPreviewMovedPoints(node, startPoints, pointIndex, groundPoint, startGround) {
  const nextPoints = terrainClonePoints(startPoints);
  const draggedIndices = terrainDraggedPointIndices(pointIndex);
  if (terrainVerticalHeightSession(node)) {
    const fallbackY = Number(node?.values?.y) || 0;
    const deltaY = terrainHeightDragDelta();
    for (const idx of draggedIndices) {
      if (!nextPoints[idx]) continue;
      nextPoints[idx] = Object.assign({}, nextPoints[idx], {
        y: terrainPointHeight(nextPoints[idx], fallbackY) + deltaY
      });
    }
    return nextPoints;
  }
  if (draggedIndices.length > 1 && startGround && groundPoint) {
    const dx = state.terrainTool.axisConstraint === "y" ? 0 : groundPoint.x - startGround.x;
    const dz = state.terrainTool.axisConstraint === "x" ? 0 : groundPoint.z - startGround.z;
    for (const idx of draggedIndices) {
      if (nextPoints[idx]) {
        nextPoints[idx] = Object.assign({}, nextPoints[idx], {
          x: nextPoints[idx].x + dx,
          z: nextPoints[idx].z + dz
        });
      }
    }
    return nextPoints;
  }
  if (!Number.isInteger(pointIndex) || !nextPoints[pointIndex]) return nextPoints;
  nextPoints[pointIndex] = Object.assign({}, nextPoints[pointIndex], {
    x: state.terrainTool.axisConstraint === "y" && startGround ? nextPoints[pointIndex].x : (groundPoint?.x ?? nextPoints[pointIndex].x),
    z: state.terrainTool.axisConstraint === "x" && startGround ? nextPoints[pointIndex].z : (groundPoint?.z ?? nextPoints[pointIndex].z)
  });
  return nextPoints;
}

function terrainPreviewSurfacePoints(node, startPoints, groundPoint, startGround) {
  if (terrainVerticalHeightSession(node)) {
    const fallbackY = Number(node?.values?.y) || 0;
    const deltaY = terrainHeightDragDelta();
    return terrainClonePoints(startPoints).map(function (point) {
      return Object.assign({}, point, {
        y: terrainPointHeight(point, fallbackY) + deltaY
      });
    });
  }
  if (groundPoint && startGround) {
    const dx = state.terrainTool.axisConstraint === "y" ? 0 : groundPoint.x - startGround.x;
    const dz = state.terrainTool.axisConstraint === "x" ? 0 : groundPoint.z - startGround.z;
    return scatterTranslatePoints(startPoints, dx, dz);
  }
  return terrainClonePoints(startPoints);
}

function terrainPreviewExtrudedPoints(node, startPoints, pointIndex, previewPoint, insertIndex, anchor) {
  const nextPoints = terrainClonePoints(startPoints);
  const sourcePoint = nextPoints[pointIndex] || null;
  const fallbackY = terrainPointHeight(sourcePoint, Number(node?.values?.y) || 0);
  let nextPoint = null;
  if (node?.type === "walkable_surface") {
    const basePoint = terrainVerticalHeightSession(node)
      ? (anchor || sourcePoint || { x: Number(node?.values?.x) || 0, z: Number(node?.values?.z) || 0 })
      : (previewPoint || anchor || sourcePoint || { x: Number(node?.values?.x) || 0, z: Number(node?.values?.z) || 0 });
    nextPoint = {
      x: Number(basePoint?.x) || 0,
      y: fallbackY + (terrainVerticalHeightSession(node) ? terrainHeightDragDelta() : 0),
      z: Number(basePoint?.z) || 0
    };
  } else if (previewPoint) {
    nextPoint = {
      x: previewPoint.x,
      z: previewPoint.z
    };
  }
  if (!nextPoint) return null;
  nextPoints.splice(Math.max(0, Math.min(nextPoints.length, insertIndex)), 0, nextPoint);
  return nextPoints;
}

function terrainRuntimeSurfaceId(node) {
  return String(node?.values?.surfaceId || node?.id || "");
}

function terrainGroundY() {
  const groundY = Number(state.viewportWorld?.ground?.y);
  return Number.isFinite(groundY) ? groundY : 0;
}

function terrainSafeScale(value) {
  if (!Number.isFinite(value)) return 1;
  if (Math.abs(value) < 0.001) return value < 0 ? -0.001 : 0.001;
  return value;
}

function terrainChannelLabel(channel) {
  if (channel === "secondary") return "Secondary";
  if (channel === "edge") return "Edge";
  return "Main";
}

function terrainChannelFieldKeys(channel) {
  if (channel === "secondary") {
    return {
      xKey: "secondaryTextureScaleX",
      yKey: "secondaryTextureScaleY",
      legacyKey: "secondaryTextureScale"
    };
  }
  if (channel === "edge") {
    return {
      xKey: "edgeFadeNoiseScaleX",
      yKey: "edgeFadeNoiseScaleY",
      legacyKey: "edgeFadeNoiseScale"
    };
  }
  return {
    xKey: "textureScaleX",
    yKey: "textureScaleY",
    legacyKey: "textureScale"
  };
}

function terrainChannelScalePair(node, channel) {
  const keys = terrainChannelFieldKeys(channel);
  const legacy = Number(node?.values?.[keys.legacyKey]);
  const fallback = Number.isFinite(legacy) ? legacy : 1;
  const xValue = Number(node?.values?.[keys.xKey]);
  const yValue = Number(node?.values?.[keys.yKey]);
  return {
    keys: keys,
    x: terrainSafeScale(Number.isFinite(xValue) ? xValue : fallback),
    y: terrainSafeScale(Number.isFinite(yValue) ? yValue : fallback)
  };
}

function terrainActiveChannel() {
  return state.terrainTool.activeChannel === "secondary"
    ? "secondary"
    : state.terrainTool.activeChannel === "edge"
      ? "edge"
      : "main";
}

function terrainHasActiveSession() {
  return Boolean(state.terrainTool.dragNodeId && state.terrainTool.draggingHandleRole);
}

function terrainShortcutSummaryText() {
  return "Edit: 1 Main, 2 Secondary, 3 Edge | Point: G move, R rotate, T scale, F extrude, Z height, Del delete | X/Y/Z axis";
}

function terrainNodeCapabilities(node) {
  const nodeType = String(node?.type || "");
  const walkableSurface = nodeType === "walkable_surface";
  // All four terrain-tool node types edit identically to Walkable Surface: a
  // point/line polygon with a center handle, regardless of any legacy shapeType
  // field (box/circle become "polygon" the moment points are edited, see
  // terrainPatchPoints). Only surface_layer stays an open path.
  const polygonEditable = TERRAIN_TOOL_NODE_TYPES.has(nodeType);
  return {
    visible: Boolean(node && TERRAIN_TOOL_NODE_TYPES.has(nodeType)),
    nodeType: nodeType,
    walkableSurface: walkableSurface,
    polygonEditable: polygonEditable,
    pointEditing: polygonEditable,
    closedLoop: TERRAIN_CLOSED_SHAPE_NODE_TYPES.has(nodeType),
    centerEditable: polygonEditable,
    allowSelect: true,
    allowMove: polygonEditable,
    allowExtrude: polygonEditable,
    allowRotate: polygonEditable,
    allowGeoScale: polygonEditable,
    allowScale: nodeType === "surface_layer",
    allowDelete: polygonEditable
  };
}

function terrainModeAllowed(mode, capabilities) {
  if (!capabilities || !capabilities.visible) return false;
  if (mode === "select") return Boolean(capabilities.allowSelect);
  if (mode === "move") return Boolean(capabilities.allowMove);
  if (mode === "extrude") return Boolean(capabilities.allowExtrude);
  if (mode === "rotate") return Boolean(capabilities.allowRotate);
  if (mode === "geoscale") return Boolean(capabilities.allowGeoScale);
  if (mode === "scale") return Boolean(capabilities.allowScale);
  if (mode === "delete") return Boolean(capabilities.allowDelete);
  return false;
}

function terrainSelectionText(node, capabilities) {
  if (!node || !capabilities) return "";
  const title = terrainTypeLabel(node.type);
  const channel = terrainChannelLabel(terrainActiveChannel());
  const channelSummary = "Edit: 1 Main, 2 Secondary, 3 Edge | Active: " + channel;
  const shortcutSummary = terrainShortcutSummaryText();
  const pointCount = terrainNodePoints(node).length;
  const base = title + " - " + channelSummary + " | " + shortcutSummary;
  if (pointCount < terrainMinPointCount(node.type)) {
    return base + " | Click ground to place the first points";
  }
  if (state.terrainTool.mode === "move" && state.terrainTool.selectedHandleRole === "center") return title + " - Moving full shape | " + shortcutSummary;
  if (state.terrainTool.mode === "move") return title + " - Moving points | " + shortcutSummary;
  if (state.terrainTool.mode === "rotate") return title + " - Rotating | " + shortcutSummary;
  if (state.terrainTool.mode === "geoscale") return title + " - Scaling | " + shortcutSummary;
  if (state.terrainTool.mode === "extrude") return title + " - Extruding point | " + shortcutSummary;
  if (state.terrainTool.mode === "scale") return title + " - Scaling " + channel + " texture | " + shortcutSummary;
  if (state.terrainTool.mode === "delete") return title + " - Delete selected points | " + shortcutSummary;
  return base + " | Select center to move/rotate/scale the whole shape" + (node.type === "walkable_surface" ? ", use Z for height" : "");
}

function terrainSelectedPointText() {
  const multi = state.terrainTool.selectedPointIndices;
  if (multi.length > 1) return multi.length + " points selected";
  if (!Number.isInteger(state.terrainTool.selectedPointIndex) || state.terrainTool.selectedPointIndex < 0) return "";
  return "Selected point " + (state.terrainTool.selectedPointIndex + 1);
}

function terrainClearDragState() {
  releaseViewportEditPointer(state.terrainTool.dragPointerId);
  state.terrainTool.draggingPointIndex = null;
  state.terrainTool.draggingHandleRole = null;
  state.terrainTool.dragNodeId = null;
  state.terrainTool.dragStartPoints = null;
  state.terrainTool.dragStartSurface = null;
  state.terrainTool.dragStartScale = null;
  state.terrainTool.dragScaleChannel = null;
  state.terrainTool.dragStartPointer = null;
  state.terrainTool.dragCurrentPointer = null;
  state.terrainTool.dragExtrudeIndex = null;
  state.terrainTool.dragPreviewPoint = null;
  state.terrainTool.dragPointerId = null;
  state.terrainTool.dragStartGround = null;
  state.terrainTool.dragCurrentGround = null;
  state.terrainTool.dragStartPivot = null;
  state.terrainTool.dragStartAngle = null;
  state.terrainTool.dragStartDistance = null;
  state.terrainTool.dragTransformIndices = null;
  state.terrainTool.dragMoved = false;
}

function terrainSetSelection(pointIndex, handleRole) {
  state.terrainTool.selectedPointIndex = Number.isInteger(pointIndex) && pointIndex >= 0 ? pointIndex : null;
  state.terrainTool.selectedHandleRole = handleRole === "center" ? "center" : (state.terrainTool.selectedPointIndex !== null ? "point" : null);
  state.terrainTool.selectedPointIndices = state.terrainTool.selectedPointIndex !== null ? [state.terrainTool.selectedPointIndex] : [];
}

// Shift always adds, Ctrl/Meta always removes - no toggling, so box-select and click-select
// behave the same regardless of what was already selected.
function terrainAddPointToSelection(pointIndex) {
  if (!Number.isInteger(pointIndex) || pointIndex < 0) return;
  const existing = state.terrainTool.selectedPointIndices;
  if (!existing.includes(pointIndex)) state.terrainTool.selectedPointIndices = existing.concat(pointIndex);
  state.terrainTool.selectedPointIndex = pointIndex;
  state.terrainTool.selectedHandleRole = "point";
}

function terrainRemovePointFromSelection(pointIndex) {
  if (!Number.isInteger(pointIndex) || pointIndex < 0) return;
  state.terrainTool.selectedPointIndices = state.terrainTool.selectedPointIndices.filter(function (i) { return i !== pointIndex; });
  const last = state.terrainTool.selectedPointIndices.length
    ? state.terrainTool.selectedPointIndices[state.terrainTool.selectedPointIndices.length - 1]
    : null;
  state.terrainTool.selectedPointIndex = last;
  state.terrainTool.selectedHandleRole = last !== null ? "point" : null;
}

function terrainTogglePointSelection(pointIndex) {
  if (!Number.isInteger(pointIndex) || pointIndex < 0) return;
  if (state.terrainTool.selectedPointIndices.includes(pointIndex)) terrainRemovePointFromSelection(pointIndex);
  else terrainAddPointToSelection(pointIndex);
}

function terrainCancelActiveSession() {
  const shouldResetWorld = Boolean(
    state.terrainTool.draggingHandleRole === "scale"
    || state.terrainTool.draggingHandleRole === "extrude"
    || state.terrainTool.draggingHandleRole === "point"
    || state.terrainTool.draggingHandleRole === "center"
    || state.terrainTool.draggingHandleRole === "rotate"
    || state.terrainTool.draggingHandleRole === "geoscale"
  );
  terrainClearDragState();
  state.terrainTool.mode = "select";
  state.terrainTool.axisConstraint = null;
  if (shouldResetWorld && runtime && state.viewportWorld) {
    applyViewportWorld(state.viewportWorld);
  }
  terrainFinishWithRender();
}

function terrainResetForNode(node, capabilities) {
  const nextNodeId = node ? node.id : null;
  const nodeChanged = state.terrainTool.activeNodeId !== nextNodeId;
  const hadActiveSession = terrainHasActiveSession();
  state.terrainTool.activeNodeId = nextNodeId;
  if (!node) {
    state.terrainTool.mode = "select";
    state.terrainTool.multiSelect = false;
    terrainSetSelection(null, null);
    terrainClearDragState();
    state.terrainTool.axisConstraint = null;
    if (hadActiveSession && runtime && state.viewportWorld) applyViewportWorld(state.viewportWorld);
    return;
  }
  if (nodeChanged) {
    state.terrainTool.mode = "select";
    state.terrainTool.multiSelect = false;
    terrainSetSelection(null, null);
    terrainClearDragState();
    state.terrainTool.axisConstraint = null;
    if (hadActiveSession && runtime && state.viewportWorld) applyViewportWorld(state.viewportWorld);
  }
  if (!terrainModeAllowed(state.terrainTool.mode, capabilities)) state.terrainTool.mode = "select";
  if (!capabilities.pointEditing && !capabilities.centerEditable) {
    terrainSetSelection(null, null);
    return;
  }
  if (!capabilities.centerEditable && state.terrainTool.selectedHandleRole === "center") {
    terrainSetSelection(null, null);
    return;
  }
  if (capabilities.pointEditing && Number.isInteger(state.terrainTool.selectedPointIndex)) {
    const points = terrainNodePoints(node);
    if (!points.length) {
      terrainSetSelection(null, null);
    } else if (state.terrainTool.selectedPointIndex >= points.length) {
      terrainSetSelection(points.length - 1, "point");
    } else {
      state.terrainTool.selectedPointIndices = state.terrainTool.selectedPointIndices.filter(function (i) {
        return i >= 0 && i < points.length;
      });
      if (!state.terrainTool.selectedPointIndices.includes(state.terrainTool.selectedPointIndex)) {
        state.terrainTool.selectedPointIndices = state.terrainTool.selectedPointIndex !== null
          ? [state.terrainTool.selectedPointIndex]
          : [];
      }
    }
  } else if (capabilities.centerEditable && state.terrainTool.selectedHandleRole !== "center" && state.terrainTool.selectedPointIndex === null) {
    state.terrainTool.selectedHandleRole = null;
  } else if (state.terrainTool.selectedHandleRole === "center" && !capabilities.centerEditable) {
    terrainSetSelection(null, null);
  }
}

function scatterHasActiveSession() {
  return Boolean(state.scatterTool.dragNodeId && state.scatterTool.draggingHandleRole);
}

function scatterActiveSessionModeLabel() {
  if (!scatterHasActiveSession()) return "Select";
  if (state.scatterTool.draggingHandleRole === "extrude") return "Extrude";
  if (state.scatterTool.draggingHandleRole === "rotate") return "Rotate";
  if (state.scatterTool.draggingHandleRole === "scale") return "Scale";
  if (state.scatterTool.draggingHandleRole === "center") return "Move area";
  return "Move";
}

function scatterShortcutSummaryText() {
  return "G move, R rotate, T scale, F extrude, Del delete, Shift-click multi-select";
}

function scatterSelectionText(node) {
  if (!node) return "";
  const title = scatterNodeLabel(node) || terrainTypeLabel(node.type);
  const modeText = scatterHasActiveSession()
    ? scatterActiveSessionModeLabel()
    : state.scatterTool.mode === "select"
      ? "Select points"
      : terrainTypeLabel(state.scatterTool.mode);
  const extras = [];
  extras.push(title + " - " + modeText);
  extras.push(scatterShortcutSummaryText());
  if (node.values?.boundaryBlocksPlayer) extras.push("Boundary blocks player");
  return extras.join(" | ");
}

function scatterSelectedPointText() {
  const multi = state.scatterTool.selectedPointIndices;
  if (multi.length > 1) return multi.length + " points selected";
  if (!Number.isInteger(state.scatterTool.selectedPointIndex) || state.scatterTool.selectedPointIndex < 0) return "";
  return "Selected point " + (state.scatterTool.selectedPointIndex + 1);
}

function scatterClearDragState() {
  releaseViewportEditPointer(state.scatterTool.dragPointerId);
  state.scatterTool.draggingPointIndex = null;
  state.scatterTool.draggingHandleRole = null;
  state.scatterTool.dragNodeId = null;
  state.scatterTool.dragStartPoints = null;
  state.scatterTool.dragStartGround = null;
  state.scatterTool.dragCurrentGround = null;
  state.scatterTool.dragStartPointer = null;
  state.scatterTool.dragCurrentPointer = null;
  state.scatterTool.dragPointerId = null;
  state.scatterTool.dragStartPivot = null;
  state.scatterTool.dragStartAngle = null;
  state.scatterTool.dragStartDistance = null;
  state.scatterTool.dragTransformIndices = null;
  state.scatterTool.dragStartRotationY = null;
  state.scatterTool.dragExtrudeIndex = null;
  state.scatterTool.dragPreviewPoint = null;
  state.scatterTool.dragMoved = false;
}

function scatterSetSelection(pointIndex, handleRole) {
  state.scatterTool.selectedPointIndex = Number.isInteger(pointIndex) && pointIndex >= 0 ? pointIndex : null;
  state.scatterTool.selectedHandleRole = handleRole === "center"
    ? "center"
    : (state.scatterTool.selectedPointIndex !== null ? "point" : null);
  state.scatterTool.selectedPointIndices = state.scatterTool.selectedPointIndex !== null ? [state.scatterTool.selectedPointIndex] : [];
}

// Shift always adds, Ctrl/Meta always removes - see terrainAddPointToSelection.
function scatterAddPointToSelection(pointIndex) {
  if (!Number.isInteger(pointIndex) || pointIndex < 0) return;
  const existing = state.scatterTool.selectedPointIndices;
  if (!existing.includes(pointIndex)) state.scatterTool.selectedPointIndices = existing.concat(pointIndex);
  state.scatterTool.selectedPointIndex = pointIndex;
  state.scatterTool.selectedHandleRole = "point";
}

function scatterRemovePointFromSelection(pointIndex) {
  if (!Number.isInteger(pointIndex) || pointIndex < 0) return;
  state.scatterTool.selectedPointIndices = state.scatterTool.selectedPointIndices.filter(function (i) { return i !== pointIndex; });
  const last = state.scatterTool.selectedPointIndices.length
    ? state.scatterTool.selectedPointIndices[state.scatterTool.selectedPointIndices.length - 1]
    : null;
  state.scatterTool.selectedPointIndex = last;
  state.scatterTool.selectedHandleRole = last !== null ? "point" : null;
}

function scatterTogglePointSelection(pointIndex) {
  if (!Number.isInteger(pointIndex) || pointIndex < 0) return;
  if (state.scatterTool.selectedPointIndices.includes(pointIndex)) scatterRemovePointFromSelection(pointIndex);
  else scatterAddPointToSelection(pointIndex);
}

function scatterCancelActiveSession() {
  scatterClearDragState();
  state.scatterTool.mode = "select";
  scatterFinishWithRender();
}

function scatterResetForNode(node) {
  const nextNodeId = node ? node.id : null;
  const nodeChanged = state.scatterTool.activeNodeId !== nextNodeId;
  state.scatterTool.activeNodeId = nextNodeId;
  if (!node) {
    state.scatterTool.mode = "select";
    state.scatterTool.multiSelect = false;
    scatterSetSelection(null, null);
    scatterClearDragState();
    return;
  }
  if (nodeChanged) {
    state.scatterTool.mode = "select";
    state.scatterTool.multiSelect = false;
    scatterSetSelection(null, null);
    scatterClearDragState();
  }
  const points = scatterNodePoints(node);
  if (Number.isInteger(state.scatterTool.selectedPointIndex)) {
    if (!points.length) {
      scatterSetSelection(null, null);
    } else if (state.scatterTool.selectedPointIndex >= points.length) {
      scatterSetSelection(points.length - 1, "point");
    } else {
      state.scatterTool.selectedPointIndices = state.scatterTool.selectedPointIndices.filter(function (i) {
        return i >= 0 && i < points.length;
      });
      if (!state.scatterTool.selectedPointIndices.includes(state.scatterTool.selectedPointIndex)) {
        state.scatterTool.selectedPointIndices = state.scatterTool.selectedPointIndex !== null
          ? [state.scatterTool.selectedPointIndex]
          : [];
      }
    }
  } else if (state.scatterTool.selectedHandleRole === "center") {
    scatterSetSelection(null, "center");
  }
}

function scatterSelectedNodeSummary() {
  const node = selectedScatterNode();
  if (!node) return null;
  const points = scatterNodePoints(node);
  const bounds = scatterPointBounds(points);
  return {
    node: node,
    points: points,
    bounds: bounds,
    center: scatterPointCenter(points)
  };
}

function scatterOverlayState() {
  const summary = scatterSelectedNodeSummary();
  if (!summary) return null;
  const { node, points } = summary;
  let selectedIndices = state.scatterTool.selectedPointIndices.slice();
  let selectedIndex = Number.isInteger(state.scatterTool.selectedPointIndex) ? state.scatterTool.selectedPointIndex : null;
  const groundY = terrainGroundY();
  const dragGround = state.scatterTool.dragCurrentGround || state.scatterTool.dragStartGround || null;
  let previewPoints = scatterClonePoints(points);
  let rotationY = Number(node.values?.areaRotationY) || 0;

  if (state.scatterTool.draggingHandleRole === "point" && state.scatterTool.dragStartPoints) {
    const startPoints = scatterClonePoints(state.scatterTool.dragStartPoints);
    const startGround = state.scatterTool.dragStartGround;
    if (dragGround && startGround) {
      const dx = dragGround.x - startGround.x;
      const dz = dragGround.z - startGround.z;
      const draggedIndices = selectedIndices.length > 1
        ? selectedIndices
        : (Number.isInteger(state.scatterTool.draggingPointIndex) ? [state.scatterTool.draggingPointIndex] : []);
      if (draggedIndices.length > 1) {
        for (const index of draggedIndices) {
          if (startPoints[index]) {
            startPoints[index] = { x: startPoints[index].x + dx, z: startPoints[index].z + dz };
          }
        }
      } else if (Number.isInteger(state.scatterTool.draggingPointIndex) && startPoints[state.scatterTool.draggingPointIndex]) {
        const index = state.scatterTool.draggingPointIndex;
        startPoints[index] = { x: startPoints[index].x + dx, z: startPoints[index].z + dz };
      }
    }
    previewPoints = startPoints;
  } else if (state.scatterTool.draggingHandleRole === "center" && state.scatterTool.dragStartPoints) {
    const startPoints = scatterClonePoints(state.scatterTool.dragStartPoints);
    const startGround = state.scatterTool.dragStartGround;
    if (dragGround && startGround) {
      const dx = dragGround.x - startGround.x;
      const dz = dragGround.z - startGround.z;
      previewPoints = scatterTranslatePoints(startPoints, dx, dz);
    } else {
      previewPoints = startPoints;
    }
  } else if (state.scatterTool.draggingHandleRole === "rotate" && state.scatterTool.dragStartPoints) {
    const startPoints = scatterClonePoints(state.scatterTool.dragStartPoints);
    if (dragGround) {
      const preview = scatterPreviewGroupTransform(startPoints, dragGround, "rotate");
      previewPoints = preview.points;
      if (!preview.partial) rotationY = (Number(state.scatterTool.dragStartRotationY) || 0) + preview.deltaDegrees;
    } else {
      previewPoints = startPoints;
    }
  } else if (state.scatterTool.draggingHandleRole === "scale" && state.scatterTool.dragStartPoints) {
    const startPoints = scatterClonePoints(state.scatterTool.dragStartPoints);
    if (dragGround) {
      previewPoints = scatterPreviewGroupTransform(startPoints, dragGround, "scale").points;
    } else {
      previewPoints = startPoints;
    }
  } else if (state.scatterTool.draggingHandleRole === "extrude" && state.scatterTool.dragStartPoints) {
    const previewPoint = dragGround && Number.isFinite(dragGround.x) && Number.isFinite(dragGround.z)
      ? { x: dragGround.x, z: dragGround.z }
      : null;
    const insertIndex = Number.isInteger(state.scatterTool.dragExtrudeIndex)
      ? Math.max(0, Math.min(state.scatterTool.dragStartPoints.length, state.scatterTool.dragExtrudeIndex))
      : Math.max(0, state.scatterTool.dragStartPoints.length - 1);
    const startPoints = scatterClonePoints(state.scatterTool.dragStartPoints);
    if (previewPoint) startPoints.splice(insertIndex, 0, previewPoint);
    previewPoints = startPoints;
    selectedIndex = previewPoint ? insertIndex : selectedIndex;
    selectedIndices = previewPoint ? [insertIndex] : selectedIndices;
  }

  const bounds = scatterPointBounds(previewPoints);
  const center = scatterPointCenter(previewPoints);
  return {
    nodeId: node.id,
    nodeType: node.type,
    label: scatterNodeLabel(node),
    mode: state.scatterTool.mode,
    x: center.x,
    z: center.z,
    width: bounds ? bounds.width : 0,
    depth: bounds ? bounds.depth : 0,
    rotationY: rotationY,
    groundY: groundY,
    enabled: node.values?.enabled !== false,
    boundaryBlocksPlayer: node.values?.boundaryBlocksPlayer === true,
    color: node.values?.enabled === false ? "#9c9c9c" : accentColorForNodeDef(state.nodeTypes[node.type]),
    points: previewPoints,
    selectedPointIndex: selectedIndex,
    selectedPointIndices: selectedIndices,
    selectedHandleRole: state.scatterTool.selectedHandleRole,
    draggingHandleRole: state.scatterTool.draggingHandleRole
  };
}

function scatterFinishWithRender() {
  renderViewportControls();
}

function scatterPatchGeometry(node, nextPoints, nextRotationY, historyLabel) {
  const bounds = scatterPointBounds(nextPoints);
  const patch = {
    points: nextPoints,
    areaCenterX: bounds ? bounds.centerX : Number(node?.values?.areaCenterX) || 0,
    areaCenterZ: bounds ? bounds.centerZ : Number(node?.values?.areaCenterZ) || 0,
    areaWidth: bounds ? bounds.width : Number(node?.values?.areaWidth) || 0,
    areaDepth: bounds ? bounds.depth : Number(node?.values?.areaDepth) || 0,
    areaRotationY: Number.isFinite(Number(nextRotationY)) ? Number(nextRotationY) : (Number(node?.values?.areaRotationY) || 0)
  };
  return patchValues(node.id, patch, {
    historyLabel: historyLabel,
    refreshViewport: false,
    refreshValidation: false,
    refreshEdgeList: false,
    afterApply: invalidateDraftWorld
  });
}

function scatterBeginPointDrag(node, pointIndex, groundPoint, pointerId) {
  const points = scatterNodePoints(node);
  if (!Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= points.length) return false;
  const startGround = groundPoint || (terrainLastPointer
    ? terrainGroundPointFromClient(terrainLastPointer.clientX, terrainLastPointer.clientY)
    : null);
  scatterClearDragState();
  state.scatterTool.mode = "move";
  state.scatterTool.selectedPointIndex = pointIndex;
  state.scatterTool.selectedHandleRole = "point";
  state.scatterTool.selectedPointIndices = state.scatterTool.selectedPointIndices.length > 1
    ? state.scatterTool.selectedPointIndices.slice()
    : [pointIndex];
  state.scatterTool.dragNodeId = node.id;
  state.scatterTool.draggingPointIndex = pointIndex;
  state.scatterTool.draggingHandleRole = "point";
  state.scatterTool.dragStartPoints = scatterClonePoints(points);
  state.scatterTool.dragStartGround = startGround ? { x: startGround.x, z: startGround.z } : null;
  state.scatterTool.dragCurrentGround = startGround ? { x: startGround.x, z: startGround.z } : null;
  state.scatterTool.dragPointerId = pointerId;
  captureViewportEditPointer(pointerId);
  state.scatterTool.dragMoved = false;
  state.scatterTool.dragStartRotationY = Number(node.values?.areaRotationY) || 0;
  scatterRenderOverlayPreview();
  scatterFinishWithRender();
  return true;
}

function scatterBeginCenterDrag(node, groundPoint, pointerId) {
  const startGround = groundPoint || (terrainLastPointer
    ? terrainGroundPointFromClient(terrainLastPointer.clientX, terrainLastPointer.clientY)
    : null);
  scatterClearDragState();
  state.scatterTool.mode = "move";
  state.scatterTool.selectedPointIndex = null;
  state.scatterTool.selectedHandleRole = "center";
  state.scatterTool.selectedPointIndices = [];
  state.scatterTool.dragNodeId = node.id;
  state.scatterTool.draggingPointIndex = null;
  state.scatterTool.draggingHandleRole = "center";
  state.scatterTool.dragStartPoints = scatterClonePoints(scatterNodePoints(node));
  state.scatterTool.dragStartGround = startGround ? { x: startGround.x, z: startGround.z } : null;
  state.scatterTool.dragCurrentGround = startGround ? { x: startGround.x, z: startGround.z } : null;
  state.scatterTool.dragPointerId = pointerId;
  captureViewportEditPointer(pointerId);
  state.scatterTool.dragMoved = false;
  state.scatterTool.dragStartRotationY = Number(node.values?.areaRotationY) || 0;
  scatterRenderOverlayPreview();
  scatterFinishWithRender();
  return true;
}

function scatterBeginExtrudeSession(node, groundPoint, pointerId, options = {}) {
  const points = scatterNodePoints(node);
  const explicitPointIndex = Number.isInteger(options.pointIndex) ? options.pointIndex : null;
  const explicitInsertIndex = Number.isInteger(options.insertIndex) ? options.insertIndex : null;
  const hasSelection = Number.isInteger(state.scatterTool.selectedPointIndex) || state.scatterTool.selectedPointIndices.length > 0;
  // Add can now start without a point selection; the actual segment click can still
  // override both the anchor point and the insertion index before the drag begins.
  let pointIndex = explicitPointIndex;
  if (!Number.isInteger(pointIndex)) {
    pointIndex = Number.isInteger(state.scatterTool.selectedPointIndex)
      ? state.scatterTool.selectedPointIndex
      : (state.scatterTool.selectedPointIndices.length
        ? state.scatterTool.selectedPointIndices[state.scatterTool.selectedPointIndices.length - 1]
        : (points.length ? points.length - 1 : null));
  }
  if (!Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= points.length) {
    setStatus("Minimaal 1 punt nodig.", "error");
    return false;
  }
  const insertIndex = Number.isInteger(explicitInsertIndex)
    ? Math.max(0, Math.min(points.length, explicitInsertIndex))
    : !hasSelection
    ? points.length
    : pointIndex <= 0
      ? 0
      : pointIndex >= points.length - 1
        ? points.length
        : pointIndex + 1;
  const startGround = groundPoint || (terrainLastPointer
    ? terrainGroundPointFromClient(terrainLastPointer.clientX, terrainLastPointer.clientY)
    : null);
  scatterClearDragState();
  state.scatterTool.mode = "extrude";
  state.scatterTool.selectedPointIndex = pointIndex;
  state.scatterTool.selectedHandleRole = "point";
  state.scatterTool.selectedPointIndices = [pointIndex];
  state.scatterTool.dragNodeId = node.id;
  state.scatterTool.draggingPointIndex = pointIndex;
  state.scatterTool.draggingHandleRole = "extrude";
  state.scatterTool.dragStartPoints = scatterClonePoints(points);
  state.scatterTool.dragExtrudeIndex = insertIndex;
  state.scatterTool.dragPreviewPoint = startGround ? { x: startGround.x, z: startGround.z } : null;
  state.scatterTool.dragStartGround = startGround ? { x: startGround.x, z: startGround.z } : null;
  state.scatterTool.dragCurrentGround = startGround ? { x: startGround.x, z: startGround.z } : null;
  state.scatterTool.dragPointerId = pointerId;
  captureViewportEditPointer(pointerId);
  state.scatterTool.dragMoved = false;
  state.scatterTool.dragStartRotationY = Number(node.values?.areaRotationY) || 0;
  scatterRenderOverlayPreview();
  scatterFinishWithRender();
  return true;
}

function scatterBeginRotateSession(node, groundPoint, pointerId) {
  const points = scatterNodePoints(node);
  const targetIndices = scatterSelectedTransformIndices(points);
  const pivot = scatterPointCenter(targetIndices.map(function (index) { return points[index]; }).filter(Boolean));
  const startGround = groundPoint || terrainLastPointerGroundPoint() || pointTransformStartGroundFromPivot(pivot);
  if (!startGround) {
    setStatus("No ground hit.", "error");
    return false;
  }
  const selectedPointIndex = state.scatterTool.selectedPointIndex;
  const selectedPointIndices = state.scatterTool.selectedPointIndices.slice();
  const selectedHandleRole = state.scatterTool.selectedHandleRole;
  scatterClearDragState();
  state.scatterTool.mode = "rotate";
  state.scatterTool.selectedHandleRole = selectedPointIndices.length > 1 ? selectedHandleRole : "center";
  state.scatterTool.selectedPointIndex = selectedPointIndices.length > 1 ? selectedPointIndex : null;
  state.scatterTool.selectedPointIndices = selectedPointIndices.length > 1 ? selectedPointIndices : [];
  state.scatterTool.dragNodeId = node.id;
  state.scatterTool.draggingPointIndex = null;
  state.scatterTool.draggingHandleRole = "rotate";
  state.scatterTool.dragTransformIndices = targetIndices;
  state.scatterTool.dragStartPoints = scatterClonePoints(points);
  state.scatterTool.dragStartGround = { x: startGround.x, z: startGround.z };
  state.scatterTool.dragCurrentGround = { x: startGround.x, z: startGround.z };
  state.scatterTool.dragPointerId = pointerId;
  captureViewportEditPointer(pointerId);
  state.scatterTool.dragMoved = false;
  state.scatterTool.dragStartPivot = pivot;
  state.scatterTool.dragStartAngle = Math.atan2(startGround.z - pivot.z, startGround.x - pivot.x);
  state.scatterTool.dragStartRotationY = Number(node.values?.areaRotationY) || 0;
  scatterRenderOverlayPreview();
  scatterFinishWithRender();
  return true;
}

function scatterBeginScaleSession(node, groundPoint, pointerId) {
  const points = scatterNodePoints(node);
  const targetIndices = scatterSelectedTransformIndices(points);
  const pivot = scatterPointCenter(targetIndices.map(function (index) { return points[index]; }).filter(Boolean));
  const startGround = groundPoint || terrainLastPointerGroundPoint() || pointTransformStartGroundFromPivot(pivot);
  if (!startGround) {
    setStatus("No ground hit.", "error");
    return false;
  }
  const selectedPointIndex = state.scatterTool.selectedPointIndex;
  const selectedPointIndices = state.scatterTool.selectedPointIndices.slice();
  const selectedHandleRole = state.scatterTool.selectedHandleRole;
  scatterClearDragState();
  state.scatterTool.mode = "scale";
  state.scatterTool.selectedHandleRole = selectedPointIndices.length > 1 ? selectedHandleRole : "center";
  state.scatterTool.selectedPointIndex = selectedPointIndices.length > 1 ? selectedPointIndex : null;
  state.scatterTool.selectedPointIndices = selectedPointIndices.length > 1 ? selectedPointIndices : [];
  state.scatterTool.dragNodeId = node.id;
  state.scatterTool.draggingPointIndex = null;
  state.scatterTool.draggingHandleRole = "scale";
  state.scatterTool.dragTransformIndices = targetIndices;
  state.scatterTool.dragStartPoints = scatterClonePoints(points);
  state.scatterTool.dragStartGround = { x: startGround.x, z: startGround.z };
  state.scatterTool.dragCurrentGround = { x: startGround.x, z: startGround.z };
  state.scatterTool.dragPointerId = pointerId;
  captureViewportEditPointer(pointerId);
  state.scatterTool.dragMoved = false;
  state.scatterTool.dragStartPivot = pivot;
  state.scatterTool.dragStartDistance = Math.max(0.0001, Math.hypot(startGround.x - pivot.x, startGround.z - pivot.z));
  state.scatterTool.dragStartRotationY = Number(node.values?.areaRotationY) || 0;
  scatterRenderOverlayPreview();
  scatterFinishWithRender();
  return true;
}

async function scatterCommitPointDrag(node) {
  if (state.scatterTool.draggingHandleRole === "extrude") {
    const pointIndex = state.scatterTool.draggingPointIndex;
    const startPoints = scatterClonePoints(state.scatterTool.dragStartPoints || scatterNodePoints(node));
    const sourcePoint = startPoints[pointIndex] || null;
    const previewPoint = state.scatterTool.dragPreviewPoint
      || state.scatterTool.dragCurrentGround
      || state.scatterTool.dragStartGround
      || (sourcePoint ? { x: sourcePoint.x, z: sourcePoint.z } : null);
    if (!Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= startPoints.length || !previewPoint) {
      scatterClearDragState();
      state.scatterTool.mode = "select";
      scatterFinishWithRender();
      if (!previewPoint) setStatus("No ground hit.", "error");
      return false;
    }
    const insertIndex = Number.isInteger(state.scatterTool.dragExtrudeIndex)
      ? Math.max(0, Math.min(startPoints.length, state.scatterTool.dragExtrudeIndex))
      : Math.min(startPoints.length, pointIndex + 1);
    const nextPoints = startPoints.slice();
    nextPoints.splice(insertIndex, 0, {
      x: previewPoint.x,
      z: previewPoint.z
    });
    const ok = await scatterPatchGeometry(node, nextPoints, state.scatterTool.dragStartRotationY, "Scatter point extruded");
    scatterClearDragState();
    state.scatterTool.mode = "select";
    if (ok) {
      scatterSetSelection(insertIndex, "point");
      setStatus("Point extruded.", "success");
    }
    scatterFinishWithRender();
    return ok;
  }
  const pointIndex = state.scatterTool.draggingPointIndex;
  const startPoints = scatterClonePoints(state.scatterTool.dragStartPoints || scatterNodePoints(node));
  const startGround = state.scatterTool.dragStartGround;
  const groundPoint = state.scatterTool.dragCurrentGround
    || startGround
    || (startPoints[pointIndex] ? { x: startPoints[pointIndex].x, z: startPoints[pointIndex].z } : null);
  if (!groundPoint || !Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= startPoints.length) {
    scatterClearDragState();
    state.scatterTool.mode = "select";
    scatterFinishWithRender();
    if (!groundPoint) setStatus("No ground hit.", "error");
    return false;
  }
  const draggedIndices = state.scatterTool.selectedPointIndices.length > 1
    ? state.scatterTool.selectedPointIndices
    : [pointIndex];
  const selectedBefore = state.scatterTool.selectedPointIndices.slice();
  if (state.scatterTool.dragPointerId !== null && !state.scatterTool.dragMoved) {
    scatterClearDragState();
    state.scatterTool.mode = "select";
    state.scatterTool.selectedPointIndices = selectedBefore;
    state.scatterTool.selectedPointIndex = pointIndex;
    state.scatterTool.selectedHandleRole = "point";
    scatterFinishWithRender();
    return true;
  }
  if (draggedIndices.length > 1 && startGround) {
    const dx = groundPoint.x - startGround.x;
    const dz = groundPoint.z - startGround.z;
    for (const idx of draggedIndices) {
      if (startPoints[idx]) {
        startPoints[idx] = { x: startPoints[idx].x + dx, z: startPoints[idx].z + dz };
      }
    }
  } else {
    startPoints[pointIndex] = {
      x: groundPoint.x,
      z: groundPoint.z
    };
  }
  const ok = await scatterPatchGeometry(node, startPoints, state.scatterTool.dragStartRotationY, "Scatter point moved");
  scatterClearDragState();
  state.scatterTool.mode = "select";
  if (ok) {
    state.scatterTool.selectedPointIndices = selectedBefore;
    state.scatterTool.selectedPointIndex = pointIndex;
    state.scatterTool.selectedHandleRole = "point";
    setStatus(draggedIndices.length > 1 ? draggedIndices.length + " points moved." : "Point moved.", "success");
  }
  scatterFinishWithRender();
  return ok;
}

async function scatterCommitCenterDrag(node) {
  const groundPoint = state.scatterTool.dragCurrentGround
    || state.scatterTool.dragStartGround
    || (state.scatterTool.dragStartPoints ? scatterPointCenter(state.scatterTool.dragStartPoints) : null);
  if (!groundPoint || !state.scatterTool.dragStartPoints) {
    scatterClearDragState();
    state.scatterTool.mode = "select";
    scatterFinishWithRender();
    setStatus("No ground hit.", "error");
    return false;
  }
  if (state.scatterTool.dragPointerId !== null && !state.scatterTool.dragMoved) {
    scatterClearDragState();
    state.scatterTool.mode = "select";
    scatterSetSelection(null, "center");
    scatterFinishWithRender();
    return true;
  }
  const startGround = state.scatterTool.dragStartGround || groundPoint;
  const dx = groundPoint.x - startGround.x;
  const dz = groundPoint.z - startGround.z;
  const nextPoints = scatterTranslatePoints(state.scatterTool.dragStartPoints, dx, dz);
  const ok = await scatterPatchGeometry(node, nextPoints, state.scatterTool.dragStartRotationY, "Scatter area moved");
  scatterClearDragState();
  state.scatterTool.mode = "select";
  if (ok) {
    scatterSetSelection(null, "center");
    setStatus("Area moved.", "success");
  }
  scatterFinishWithRender();
  return ok;
}

async function scatterCommitRotate(node) {
  const groundPoint = state.scatterTool.dragCurrentGround || state.scatterTool.dragStartGround;
  if (!groundPoint || !state.scatterTool.dragStartPoints || !state.scatterTool.dragStartPivot || !Number.isFinite(state.scatterTool.dragStartAngle)) {
    scatterClearDragState();
    state.scatterTool.mode = "select";
    scatterFinishWithRender();
    setStatus("No ground hit.", "error");
    return false;
  }
  const selectedIndexBefore = state.scatterTool.selectedPointIndex;
  const selectedIndicesBefore = state.scatterTool.selectedPointIndices.slice();
  const selectedRoleBefore = state.scatterTool.selectedHandleRole;
  if (state.scatterTool.dragPointerId !== null && !state.scatterTool.dragMoved) {
    scatterClearDragState();
    state.scatterTool.mode = "select";
    if (selectedIndicesBefore.length > 1) {
      state.scatterTool.selectedPointIndex = selectedIndexBefore;
      state.scatterTool.selectedPointIndices = selectedIndicesBefore;
      state.scatterTool.selectedHandleRole = selectedRoleBefore;
    } else {
      scatterSetSelection(null, "center");
    }
    scatterFinishWithRender();
    return true;
  }
  const preview = scatterPreviewGroupTransform(state.scatterTool.dragStartPoints, groundPoint, "rotate");
  const nextRotationY = preview.partial
    ? state.scatterTool.dragStartRotationY
    : (Number(state.scatterTool.dragStartRotationY) || 0) + preview.deltaDegrees;
  const ok = await scatterPatchGeometry(node, preview.points, nextRotationY, preview.partial ? "Scatter points rotated" : "Scatter area rotated");
  scatterClearDragState();
  state.scatterTool.mode = "select";
  if (ok) {
    if (selectedIndicesBefore.length > 1) {
      state.scatterTool.selectedPointIndex = selectedIndexBefore;
      state.scatterTool.selectedPointIndices = selectedIndicesBefore;
      state.scatterTool.selectedHandleRole = selectedRoleBefore;
    } else {
      scatterSetSelection(null, "center");
    }
    setStatus(preview.partial ? selectedIndicesBefore.length + " points rotated." : "Area rotated.", "success");
  }
  scatterFinishWithRender();
  return ok;
}

async function scatterCommitScale(node) {
  const groundPoint = state.scatterTool.dragCurrentGround || state.scatterTool.dragStartGround;
  if (!groundPoint || !state.scatterTool.dragStartPoints || !state.scatterTool.dragStartPivot || !Number.isFinite(state.scatterTool.dragStartDistance)) {
    scatterClearDragState();
    state.scatterTool.mode = "select";
    scatterFinishWithRender();
    setStatus("No ground hit.", "error");
    return false;
  }
  const selectedIndexBefore = state.scatterTool.selectedPointIndex;
  const selectedIndicesBefore = state.scatterTool.selectedPointIndices.slice();
  const selectedRoleBefore = state.scatterTool.selectedHandleRole;
  if (state.scatterTool.dragPointerId !== null && !state.scatterTool.dragMoved) {
    scatterClearDragState();
    state.scatterTool.mode = "select";
    if (selectedIndicesBefore.length > 1) {
      state.scatterTool.selectedPointIndex = selectedIndexBefore;
      state.scatterTool.selectedPointIndices = selectedIndicesBefore;
      state.scatterTool.selectedHandleRole = selectedRoleBefore;
    } else {
      scatterSetSelection(null, "center");
    }
    scatterFinishWithRender();
    return true;
  }
  const preview = scatterPreviewGroupTransform(state.scatterTool.dragStartPoints, groundPoint, "scale");
  const ok = await scatterPatchGeometry(node, preview.points, state.scatterTool.dragStartRotationY, preview.partial ? "Scatter points scaled" : "Scatter area scaled");
  scatterClearDragState();
  state.scatterTool.mode = "select";
  if (ok) {
    if (selectedIndicesBefore.length > 1) {
      state.scatterTool.selectedPointIndex = selectedIndexBefore;
      state.scatterTool.selectedPointIndices = selectedIndicesBefore;
      state.scatterTool.selectedHandleRole = selectedRoleBefore;
    } else {
      scatterSetSelection(null, "center");
    }
    setStatus(preview.partial ? selectedIndicesBefore.length + " points scaled." : "Area scaled.", "success");
  }
  scatterFinishWithRender();
  return ok;
}

async function scatterDeletePoint(node, pointIndex) {
  const currentPoints = scatterNodePoints(node);
  if (!Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= currentPoints.length) return false;
  const nextPoints = currentPoints.filter(function (_, index) { return index !== pointIndex; });
  if (nextPoints.length < 3) {
    setStatus("Cannot delete: minimum 3 points required.", "error");
    scatterFinishWithRender();
    return false;
  }
  const ok = await scatterPatchGeometry(node, nextPoints, node.values?.areaRotationY, "Scatter point deleted");
  if (ok) {
    const nextIndex = nextPoints.length ? Math.min(pointIndex, nextPoints.length - 1) : null;
    scatterSetSelection(nextIndex, nextIndex === null ? null : "point");
    setStatus("Point deleted.", "success");
  }
  scatterFinishWithRender();
  return ok;
}

async function scatterDeleteMultiPoint(node) {
  const indices = state.scatterTool.selectedPointIndices;
  if (!indices.length) return false;
  const currentPoints = scatterNodePoints(node);
  const toDelete = new Set(indices.filter(function (i) { return i >= 0 && i < currentPoints.length; }));
  const remaining = currentPoints.filter(function (_, index) { return !toDelete.has(index); });
  if (remaining.length < 3) {
    setStatus("Cannot delete: minimum 3 points required.", "error");
    scatterFinishWithRender();
    return false;
  }
  const ok = await scatterPatchGeometry(node, remaining, node.values?.areaRotationY, "Scatter points deleted");
  if (ok) {
    const nextIndex = remaining.length ? 0 : null;
    scatterSetSelection(nextIndex, nextIndex === null ? null : "point");
    setStatus(toDelete.size + " point" + (toDelete.size > 1 ? "s" : "") + " deleted.", "success");
  }
  scatterFinishWithRender();
  return ok;
}

function scatterSelectionPivot(points) {
  const selected = state.scatterTool.selectedPointIndices.filter(function (index) {
    return Number.isInteger(index) && index >= 0 && index < points.length;
  });
  if (selected.length) {
    return scatterPointCenter(selected.map(function (index) { return points[index]; }));
  }
  return scatterPointCenter(points);
}

function scatterSelectedTransformIndices(points) {
  const selected = state.scatterTool.selectedPointIndices.filter(function (index) {
    return Number.isInteger(index) && index >= 0 && index < points.length;
  });
  return selected.length > 1
    ? selected
    : points.map(function (_, index) { return index; });
}

function scatterPreviewGroupTransform(startPoints, groundPoint, kind) {
  const nextPoints = scatterClonePoints(startPoints);
  const indices = (state.scatterTool.dragTransformIndices || []).filter(function (index) {
    return Number.isInteger(index) && index >= 0 && index < nextPoints.length;
  });
  const pivot = state.scatterTool.dragStartPivot;
  if (!pivot || !groundPoint || !indices.length) {
    return { points: nextPoints, deltaDegrees: 0, partial: false };
  }
  const subset = indices.map(function (index) { return nextPoints[index]; }).filter(Boolean);
  let transformed = subset;
  let deltaDegrees = 0;
  if (kind === "rotate") {
    const startAngle = state.scatterTool.dragStartAngle;
    if (!Number.isFinite(startAngle)) return { points: nextPoints, deltaDegrees: 0, partial: indices.length < nextPoints.length };
    const currentAngle = Math.atan2(groundPoint.z - pivot.z, groundPoint.x - pivot.x);
    deltaDegrees = (currentAngle - startAngle) * (180 / Math.PI);
    transformed = scatterRotatePoints(subset, pivot, deltaDegrees);
  } else {
    const currentDistance = Math.hypot(groundPoint.x - pivot.x, groundPoint.z - pivot.z);
    const factor = Math.max(0.05, currentDistance / Math.max(0.0001, state.scatterTool.dragStartDistance || 1));
    transformed = scatterScalePoints(subset, pivot, factor);
  }
  let cursor = 0;
  for (const index of indices) {
    if (!nextPoints[index]) continue;
    nextPoints[index] = Object.assign({}, nextPoints[index], transformed[cursor]);
    cursor += 1;
  }
  return { points: nextPoints, deltaDegrees: deltaDegrees, partial: indices.length < nextPoints.length };
}

function terrainSelectedNodeSummary() {
  const node = selectedTerrainNode();
  if (!node) return null;
  const capabilities = terrainNodeCapabilities(node);
  return {
    node: node,
    capabilities: capabilities,
    points: terrainNodePoints(node),
    surface: terrainSurfaceSnapshot(node)
  };
}

function terrainOverlayState() {
  const summary = terrainSelectedNodeSummary();
  if (!summary) return null;
  const { node, points, surface } = summary;
  const groundY = terrainGroundY();
  const dragGround = state.terrainTool.dragCurrentGround || state.terrainTool.dragStartGround || null;
  let previewPoints = terrainClonePoints(points);
  const overlay = {
    nodeId: node.id,
    nodeType: node.type,
    label: terrainNodeLabel(node),
    mode: state.terrainTool.mode,
    activeChannel: terrainActiveChannel(),
    selectedPointIndex: state.terrainTool.selectedPointIndex,
    selectedPointIndices: state.terrainTool.selectedPointIndices.slice(),
    selectedHandleRole: state.terrainTool.selectedHandleRole,
    draggingHandleRole: state.terrainTool.draggingHandleRole,
    points: points,
    groundY: groundY,
    color: accentColorForNodeDef(state.nodeTypes[node.type])
  };
  if (state.terrainTool.draggingHandleRole === "point" && state.terrainTool.dragStartPoints) {
    previewPoints = terrainPreviewMovedPoints(
      node,
      state.terrainTool.dragStartPoints,
      state.terrainTool.draggingPointIndex,
      dragGround,
      state.terrainTool.dragStartGround
    );
  } else if (state.terrainTool.draggingHandleRole === "center" && state.terrainTool.dragStartPoints) {
    const startGround = state.terrainTool.dragStartGround
      || (state.terrainTool.dragStartSurface ? { x: state.terrainTool.dragStartSurface.x, z: state.terrainTool.dragStartSurface.z } : null);
    previewPoints = terrainPreviewSurfacePoints(node, state.terrainTool.dragStartPoints, dragGround, startGround);
  } else if ((state.terrainTool.draggingHandleRole === "rotate" || state.terrainTool.draggingHandleRole === "geoscale") && state.terrainTool.dragStartPoints) {
    previewPoints = terrainPreviewGroupTransform(state.terrainTool.dragStartPoints, dragGround, state.terrainTool.draggingHandleRole);
  } else if (state.terrainTool.draggingHandleRole === "extrude" && state.terrainTool.dragStartPoints) {
    const anchor = state.terrainTool.dragStartGround || dragGround;
    const previewPoint = dragGround && Number.isFinite(dragGround.x) && Number.isFinite(dragGround.z)
      ? {
        x: state.terrainTool.axisConstraint === "y" && anchor ? anchor.x : dragGround.x,
        z: state.terrainTool.axisConstraint === "x" && anchor ? anchor.z : dragGround.z
      }
      : null;
    overlay.previewInsertIndex = Number.isInteger(state.terrainTool.dragExtrudeIndex)
      ? state.terrainTool.dragExtrudeIndex
      : Math.max(0, state.terrainTool.dragStartPoints.length - 1);
    previewPoints = terrainPreviewExtrudedPoints(
      node,
      state.terrainTool.dragStartPoints,
      state.terrainTool.draggingPointIndex,
      previewPoint,
      overlay.previewInsertIndex,
      anchor
    ) || terrainClonePoints(state.terrainTool.dragStartPoints);
    if (previewPoint) {
      overlay.selectedPointIndex = Math.max(0, Math.min(previewPoints.length - 1, overlay.previewInsertIndex));
      overlay.selectedPointIndices = [overlay.selectedPointIndex];
    }
  } else if (state.terrainTool.draggingHandleRole === "scale" && state.terrainTool.dragStartScale) {
    overlay.previewScale = Object.assign({}, state.terrainTool.dragStartScale);
  }
  overlay.points = previewPoints;
  Object.assign(overlay, terrainWalkableSurfaceGeometry(node, previewPoints));
  return overlay;
}

// Big center-handle markers for every points-based node except the currently
// selected one (which already renders its own, richer, editable center handle).
// Lets you spot and jump straight to any Walkable Surface / Blocker Area / Area
// Definition / Surface Layer / Bounded Area Scatter node from the 3D viewport.
function terrainAllNodeMarkers() {
  const groundY = terrainGroundY();
  const selectedId = state.selectedNodeId;
  const markers = [];
  for (const node of state.graph.nodes || []) {
    if (node.id === selectedId) continue;
    if (TERRAIN_TOOL_NODE_TYPES.has(node.type)) {
      const points = terrainNodePoints(node);
      const geometry = terrainWalkableSurfaceGeometry(node, points);
      markers.push({
        nodeId: node.id,
        x: geometry.x,
        y: node.type === "walkable_surface" ? geometry.y : groundY + 0.03,
        z: geometry.z,
        color: accentColorForNodeDef(state.nodeTypes[node.type])
      });
    } else if (node.type === "bounded_area_scatter") {
      const center = scatterPointCenter(scatterNodePoints(node));
      markers.push({
        nodeId: node.id,
        x: center.x,
        y: groundY + 0.05,
        z: center.z,
        color: node.values?.enabled === false ? "#9c9c9c" : accentColorForNodeDef(state.nodeTypes[node.type])
      });
    }
  }
  return markers;
}

function pushTerrainOverlay(overlay) {
  if (!runtime || typeof runtime.setTerrainEditorOverlay !== "function") return;
  const markers = terrainAllNodeMarkers();
  if (overlay) {
    runtime.setTerrainEditorOverlay(Object.assign({}, overlay, { markers: markers }));
  } else if (markers.length) {
    runtime.setTerrainEditorOverlay({ markers: markers });
  } else if (typeof runtime.clearTerrainEditorOverlay === "function") {
    runtime.clearTerrainEditorOverlay();
  }
}

function syncTerrainToolPanel() {
  const summary = terrainSelectedNodeSummary();
  const node = summary?.node || null;
  const capabilities = summary?.capabilities || null;

  if (!node || !capabilities) {
    const hadActiveSession = terrainHasActiveSession();
    state.terrainTool.activeNodeId = null;
    terrainClearDragState();
    terrainSetSelection(null, null);
    state.terrainTool.mode = "select";
    state.terrainTool.axisConstraint = null;
    if (hadActiveSession && runtime && state.viewportWorld) applyViewportWorld(state.viewportWorld);
    pushTerrainOverlay(null);
    return;
  }

  terrainResetForNode(node, capabilities);
  pushTerrainOverlay(terrainOverlayState());
}

function renderStatusLine() {
  if (!el.statusText) return;
  const parts = [];
  if (state.viewportDebugKey) parts.push("key received: " + state.viewportDebugKey);
  const scatterNode = selectedScatterNode();
  if (scatterNode) {
    const summary = scatterSelectedNodeSummary();
    parts.push(scatterSelectionText(scatterNode));
    if (summary?.points && summary.points.length) parts.push(summary.points.length + " points");
    const selectedPointText = scatterSelectedPointText();
    if (selectedPointText) parts.push(selectedPointText);
  } else {
    const terrainNode = selectedTerrainNode();
    if (terrainNode) {
      const summary = terrainSelectedNodeSummary();
      const capabilities = summary?.capabilities || terrainNodeCapabilities(terrainNode);
      parts.push(terrainSelectionText(terrainNode, capabilities));
      if (summary?.points && summary.points.length) parts.push(summary.points.length + " points");
      const selectedPointText = terrainSelectedPointText();
      if (selectedPointText) parts.push(selectedPointText);
    } else {
      const modeLabel = viewportModeLabelText();
      const snapshot = selectedTransformSnapshot();
      const node = selectedModelNode();
      const selectedId = runtimeSelectedEntityId() || runtimeNodeId(node);
      parts.push(modeLabel);
      if (state.viewportAxis) parts.push("as vergrendeld: " + state.viewportAxis.toUpperCase());
      parts.push(selectedId ? "selected entity id: " + selectedId : "No mesh selected");
      parts.push("transform active: " + (runtimeTransformActive() ? "yes" : "no"));
      if (runtimeTransformActive()) {
        const transformDebug = runtimeTransformDebugState();
        if (transformDebug) {
          parts.push("delta " + formatViewportNumber(transformDebug.dx, 0) + "," + formatViewportNumber(transformDebug.dy, 0));
          parts.push("previews " + (transformDebug.previews || 0));
          parts.push("changed " + (transformDebug.changed ? "yes" : "no"));
        }
      }
      if (node) {
        const source = snapshot
          ? viewportVectorFromWorld(snapshot.position)
          : viewportVectorFromWorld({ x: node.values.x, y: node.values.y, z: node.values.z });
        parts.push("Loc X " + formatViewportNumber(source.x) + " Y " + formatViewportNumber(source.y) + " Z " + formatViewportNumber(source.z));
      }
    }
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
  syncTerrainToolPanel();
  scatterResetForNode(selectedScatterNode());
  scatterRenderOverlayPreview();
  renderStatusLine();
  renderTransformPanel();
  renderAuthoringIndicators();
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

function syncRuntimeModelSelectionForTransform() {
  if (!runtime || runtimeTransformActive()) return selectedModelNode();
  // A multi-selection already active in the runtime must not get collapsed back down to
  // one entity right before G/R/S starts - that was silently breaking group transforms.
  if (typeof runtime.getSelectedEntityIds === "function" && runtime.getSelectedEntityIds().length > 1) {
    return selectedModelNode();
  }
  let node = selectedModelNode();
  let runtimeId = runtimeNodeId(node);
  if (!runtimeId) {
    runtimeId = runtimeModelEntityIdAtLastPointer();
    const pointerNode = nodeByRuntimeId(runtimeId);
    if (pointerNode && pointerNode.type === "model_entity") node = pointerNode;
  }
  if (runtimeId && typeof runtime.selectEntity === "function") runtime.selectEntity(runtimeId);
  return node;
}

function beginRuntimeTransformFromShortcut(mode, statusText, triggerEvent) {
  if (!runtime) return false;
  if (runtimeTransformActive()) {
    setStatus(statusText, "");
    return true;
  }
  syncRuntimeModelSelectionForTransform();
  const selectedId = runtimeSelectedEntityId() || runtimeModelEntityIdAtLastPointer();
  if (!selectedId && state.selectedNodeIds.length <= 1) {
    setStatus("No transformable mesh selected" + (selectedId ? " (" + selectedId + ")" : "") + ".", "error");
    return false;
  }
  // On touch there's no driving gesture yet at button-press time - starting the transform
  // right here means its very first real input is a brand new touchdown a moment later,
  // which is exactly the timing native long-press/context-menu gesture recognition also
  // reacts to (see the matching comment next to pendingTouchTransformMode in
  // world-runtime.js). Arming instead and only calling beginTransform() from that
  // touchdown itself removes the gap between "transform exists" and "a touch is driving
  // it", the same shape the working entity-hold-to-move gesture already has.
  // isCoarsePointer() reflects the device's *primary* pointer, which on a touchscreen
  // Chromebook/tablet-with-trackpad is often still reported as "fine" (mouse) even while
  // this exact click came from the touchscreen - so prefer the actual triggering event's
  // own pointerType (Chrome fires "click" as a PointerEvent) and only fall back to the
  // device-wide guess when that isn't available.
  const isTouch = triggerEvent && triggerEvent.pointerType
    ? triggerEvent.pointerType === "touch"
    : isCoarsePointer();
  if (isTouch && typeof runtime.armPendingTouchTransform === "function") {
    runtime.armPendingTouchTransform(mode);
    setStatus(statusText, "");
    return true;
  }
  // forceGroup: the editor's own selection (state.selectedNodeIds) can include node types
  // the runtime has no live mesh for at all (Location Anchor) or no single draggable root
  // for (Walkable Surface/Surface Layer, rendered as chunked strips) - so it can undercount
  // vs. what the runtime tracks in selectedEntityIds. When the editor knows more than one
  // node is actually selected, force a group session even if the runtime found 0 or 1 live
  // objects to drag; commitGroupTransform() below applies the resulting move delta to
  // whichever selected nodes don't have a live object of their own.
  const started = typeof runtime.beginTransform === "function"
    ? runtime.beginTransform(mode, { forceGroup: state.selectedNodeIds.length > 1 })
    : typeof runtime.beginKeyboardTransform === "function" && runtime.beginKeyboardTransform();
  setStatus(started ? statusText : "No transformable mesh selected" + (selectedId ? " (" + selectedId + ")" : "") + ".", started ? "" : "error");
  return Boolean(started);
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

function transformActionButton(label, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = options.title || label;
  if (options.className) button.className = options.className;
  if (options.active) button.classList.add("active");
  if (options.disabled) button.disabled = true;
  button.addEventListener("pointerdown", function (event) {
    event.stopPropagation();
    if (button.disabled || typeof options.onPointerDown !== "function") return;
    event.preventDefault();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    button.dataset.pointerActionHandled = "1";
    options.onPointerDown(event);
  });
  button.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    if (button.dataset.pointerActionHandled === "1") {
      delete button.dataset.pointerActionHandled;
      return;
    }
    if (typeof options.onClick === "function") options.onClick(event);
  });
  return button;
}

function appendModelTransformActions(parent) {
  const activeTransform = runtimeTransformActive();
  parent.appendChild(transformActionButton("Move (G)", {
    title: "Move selected model",
    active: activeTransform && state.viewportMode === "translate",
    onClick: function (event) {
      setViewportMode("translate");
      setViewportAxis(null);
      beginRuntimeTransformFromShortcut("move", "Move.", event);
    }
  }));
  parent.appendChild(transformActionButton("Rot (R)", {
    title: "Rotate selected model",
    active: activeTransform && state.viewportMode === "rotate",
    onClick: function (event) {
      setViewportMode("rotate");
      setViewportAxis(null);
      beginRuntimeTransformFromShortcut("rotate", "Rotate.", event);
    }
  }));
  parent.appendChild(transformActionButton("Scale (T)", {
    title: "Scale selected model",
    active: activeTransform && state.viewportMode === "scale",
    onClick: function (event) {
      setViewportMode("scale");
      setViewportAxis(null);
      beginRuntimeTransformFromShortcut("scale", "Scale.", event);
    }
  }));
  for (const axis of ["x", "y", "z"]) {
    parent.appendChild(transformActionButton(axis.toUpperCase(), {
      title: "Constrain " + axis.toUpperCase(),
      active: activeTransform && state.viewportAxis === axis,
      onClick: function () {
        setViewportAxis(state.viewportAxis === axis ? null : axis);
      }
    }));
  }
  parent.appendChild(transformActionButton("OK (Enter)", {
    title: "Confirm transform",
    className: "ok",
    disabled: !activeTransform,
    onPointerDown: confirmRuntimeTransform,
    onClick: confirmRuntimeTransform
  }));
  parent.appendChild(transformActionButton("Del (Del)", {
    title: "Delete selected node",
    className: "danger",
    disabled: !state.selectedNodeIds.length && !state.selectedEdgeIds.length,
    onClick: function () {
      if (activeTransform) cancelRuntimeTransform();
      deleteSelectedNodes();
    }
  }));
  parent.appendChild(transformActionButton("Esc (Esc)", {
    title: activeTransform ? "Cancel transform" : "Deselect",
    className: "danger",
    onClick: function () {
      if (activeTransform) cancelRuntimeTransform();
      else deselectViewportClick();
    }
  }));
  parent.appendChild(transformActionButton("Focus (F)", {
    title: "Focus selected",
    onClick: focusTerrainOrSelected
  }));
}

function selectedToolPointIndex(toolState) {
  if (Number.isInteger(toolState.selectedPointIndex)) return toolState.selectedPointIndex;
  return toolState.selectedPointIndices.length
    ? toolState.selectedPointIndices[toolState.selectedPointIndices.length - 1]
    : null;
}

function commitActiveScatterSession(node) {
  if (!node || !scatterHasActiveSession()) return false;
  if (state.scatterTool.draggingHandleRole === "center") return scatterCommitCenterDrag(node);
  if (state.scatterTool.draggingHandleRole === "rotate") return scatterCommitRotate(node);
  if (state.scatterTool.draggingHandleRole === "scale") return scatterCommitScale(node);
  return scatterCommitPointDrag(node);
}

function appendScatterTransformActions(parent, node) {
  const selectedIndex = selectedToolPointIndex(state.scatterTool);
  const activeSession = scatterHasActiveSession();
  const activeRole = state.scatterTool.draggingHandleRole;
  parent.appendChild(transformActionButton("Select", {
    onClick: function () {
      scatterCancelActiveSession();
      state.scatterTool.mode = "select";
      scatterFinishWithRender();
    }
  }));
  parent.appendChild(transformActionButton("Multi", {
    active: state.scatterTool.multiSelect,
    onClick: function () {
      scatterCancelActiveSession();
      state.scatterTool.multiSelect = !state.scatterTool.multiSelect;
      state.scatterTool.mode = "select";
      setStatus(state.scatterTool.multiSelect ? "Multi-select aan." : "Multi-select uit.", "");
      scatterFinishWithRender();
    }
  }));
  parent.appendChild(transformActionButton("Move (G)", {
    active: activeSession && (activeRole === "point" || activeRole === "center"),
    onClick: function () {
      if (Number.isInteger(selectedIndex)) scatterBeginPointDrag(node, selectedIndex, null, null);
      else scatterBeginCenterDrag(node, null, null);
      setStatus("Move ready. Sleep in 3D en druk OK.", "");
    }
  }));
  parent.appendChild(transformActionButton("Rot (R)", {
    active: activeSession && activeRole === "rotate",
    onClick: function () {
      if (scatterBeginRotateSession(node, null, null)) setStatus("Rotate ready. Sleep in 3D en druk OK.", "");
    }
  }));
  parent.appendChild(transformActionButton("Scale (T)", {
    active: activeSession && activeRole === "scale",
    onClick: function () {
      if (scatterBeginScaleSession(node, null, null)) setStatus("Scale ready. Sleep in 3D en druk OK.", "");
    }
  }));
  parent.appendChild(transformActionButton("Add (F)", {
    active: state.scatterTool.mode === "extrude" || (activeSession && activeRole === "extrude"),
    onClick: function () {
      scatterCancelActiveSession();
      state.scatterTool.mode = "extrude";
      setStatus("Add ready. Druk tussen twee punten en sleep; loslaten bevestigt.", "");
      scatterFinishWithRender();
    }
  }));
  parent.appendChild(transformActionButton("Del (Del)", {
    className: "danger",
    onClick: function () {
      if (state.scatterTool.selectedPointIndices.length > 1) void scatterDeleteMultiPoint(node);
      else if (Number.isInteger(state.scatterTool.selectedPointIndex)) void scatterDeletePoint(node, state.scatterTool.selectedPointIndex);
      else setStatus("Select a point first.", "error");
    }
  }));
  parent.appendChild(transformActionButton("OK (Enter)", {
    className: "ok",
    disabled: !activeSession,
    onPointerDown: function () { commitActiveScatterSession(node); },
    onClick: function () { commitActiveScatterSession(node); }
  }));
  parent.appendChild(transformActionButton("Esc (Esc)", {
    className: "danger",
    onClick: function () {
      if (scatterHasActiveSession()) scatterCancelActiveSession();
      else deselectViewportClick();
    }
  }));
  parent.appendChild(transformActionButton("Focus (.)", { onClick: focusTerrainOrSelected }));
}

function commitActiveTerrainSession(node) {
  if (!node || !terrainHasActiveSession()) return false;
  let commitResult;
  if (state.terrainTool.draggingHandleRole === "scale") commitResult = terrainCommitScale(node);
  else if (state.terrainTool.draggingHandleRole === "center") commitResult = terrainCommitSurfaceDrag(node);
  else if (state.terrainTool.draggingHandleRole === "rotate" || state.terrainTool.draggingHandleRole === "geoscale") {
    commitResult = terrainCommitGroupTransform(node, state.terrainTool.draggingHandleRole);
  } else {
    commitResult = terrainCommitPointDrag(node);
  }
  state.terrainTool.axisConstraint = null;
  return commitResult || true;
}

function appendTerrainTransformActions(parent, node) {
  const capabilities = terrainNodeCapabilities(node);
  const selectedIndex = selectedToolPointIndex(state.terrainTool);
  const activeSession = terrainHasActiveSession();
  const activeRole = state.terrainTool.draggingHandleRole;
  parent.appendChild(transformActionButton("Select", {
    onClick: function () {
      terrainCancelActiveSession();
      state.terrainTool.mode = "select";
      state.terrainTool.axisConstraint = null;
      terrainFinishWithRender();
    }
  }));
  parent.appendChild(transformActionButton("Multi", {
    active: state.terrainTool.multiSelect,
    onClick: function () {
      terrainCancelActiveSession();
      state.terrainTool.multiSelect = !state.terrainTool.multiSelect;
      state.terrainTool.mode = "select";
      state.terrainTool.axisConstraint = null;
      setStatus(state.terrainTool.multiSelect ? "Multi-select aan." : "Multi-select uit.", "");
      terrainFinishWithRender();
    }
  }));
  parent.appendChild(transformActionButton("Move (G)", {
    active: activeSession && (activeRole === "point" || activeRole === "center"),
    onClick: function () {
      const started = Number.isInteger(selectedIndex)
        ? terrainBeginPointDrag(node, selectedIndex, null, null)
        : capabilities.centerEditable && terrainBeginSurfaceDrag(node, null, null);
      setStatus(started ? "Move ready. Sleep in 3D en druk OK." : "Select a point first.", started ? "" : "error");
    }
  }));
  parent.appendChild(transformActionButton("Rot (R)", {
    active: activeSession && activeRole === "rotate",
    onClick: function () {
      if (terrainBeginGroupTransformSession(node, null, null, "rotate")) setStatus("Rotate ready. Sleep in 3D en druk OK.", "");
    }
  }));
  parent.appendChild(transformActionButton("Scale (T)", {
    active: activeSession && activeRole === "geoscale",
    onClick: function () {
      if (terrainBeginGroupTransformSession(node, null, null, "geoscale")) setStatus("Scale ready. Sleep in 3D en druk OK.", "");
    }
  }));
  parent.appendChild(transformActionButton("Add (F)", {
    active: state.terrainTool.mode === "extrude" || (activeSession && activeRole === "extrude"),
    onClick: function () {
      terrainCancelActiveSession();
      state.terrainTool.mode = "extrude";
      state.terrainTool.axisConstraint = null;
      setStatus("Add ready. Druk tussen twee punten en sleep; loslaten bevestigt.", "");
      terrainFinishWithRender();
    }
  }));
  parent.appendChild(transformActionButton("Del (Del)", {
    className: "danger",
    onClick: function () {
      if (state.terrainTool.selectedPointIndices.length > 1) void terrainDeleteMultiPoint(node);
      else if (Number.isInteger(state.terrainTool.selectedPointIndex)) void terrainDeletePoint(node, state.terrainTool.selectedPointIndex);
      else setStatus("Select a point first.", "error");
    }
  }));
  for (const axis of ["x", "y", "z"]) {
    parent.appendChild(transformActionButton(axis.toUpperCase(), {
      active: activeSession && state.terrainTool.axisConstraint === axis,
      onClick: function () {
        state.terrainTool.axisConstraint = state.terrainTool.axisConstraint === axis ? null : axis;
        if (terrainHasActiveSession()) {
          const activeNode = nodeById(state.terrainTool.dragNodeId) || node;
          if (state.terrainTool.draggingHandleRole === "scale") {
            terrainUpdateScalePreview(activeNode, state.terrainTool.dragCurrentPointer || state.terrainTool.dragStartPointer);
          } else if (
            state.terrainTool.draggingHandleRole === "rotate"
            || state.terrainTool.draggingHandleRole === "geoscale"
            || state.terrainTool.draggingHandleRole === "point"
            || state.terrainTool.draggingHandleRole === "center"
            || state.terrainTool.draggingHandleRole === "extrude"
          ) {
            terrainRenderOverlayPreview();
          }
        }
        terrainFinishWithRender();
      }
    }));
  }
  parent.appendChild(transformActionButton("OK (Enter)", {
    className: "ok",
    disabled: !activeSession,
    onPointerDown: function () { commitActiveTerrainSession(node); },
    onClick: function () { commitActiveTerrainSession(node); }
  }));
  parent.appendChild(transformActionButton("Esc (Esc)", {
    className: "danger",
    onClick: function () {
      if (terrainHasActiveSession()) terrainCancelActiveSession();
      else {
        state.terrainTool.axisConstraint = null;
        deselectViewportClick();
      }
    }
  }));
  parent.appendChild(transformActionButton("Focus (.)", { onClick: focusTerrainOrSelected }));
}

function setEditorMinimapSuppressed(suppressed) {
  const next = Boolean(suppressed);
  if (state.editorMinimapSuppressed === next) return;
  state.editorMinimapSuppressed = next;
  if (next) {
    if (editorMinimapRedrawTimer) {
      clearTimeout(editorMinimapRedrawTimer);
      editorMinimapRedrawTimer = null;
    }
    if (el.editorMinimapRoot) el.editorMinimapRoot.hidden = true;
  } else {
    scheduleEditorMinimapRedraw(0);
  }
}

function applyViewportFloatingSlotAnchor(panel, panelId, config, options = {}) {
  if (!panel) return;
  if (panel.dataset.floatingPanelActive === "true") return;
  if (applyStoredFloatingPanelState(panel, panelId, options)) return;
  panel.style.top = "";
  panel.style.bottom = "";
  panel.style.left = "";
  panel.style.right = "";
  const size = editorMinimapDisplaySize(config);
  panel.style.width = size + "px";
  panel.style.height = size + "px";
  const anchor = config?.anchor || "bottom-right";
  if (anchor === "top-left") { panel.style.top = "12px"; panel.style.left = "12px"; }
  else if (anchor === "top-right") { panel.style.top = "12px"; panel.style.right = "12px"; }
  else if (anchor === "bottom-left") { panel.style.bottom = "12px"; panel.style.left = "12px"; }
  else { panel.style.bottom = "12px"; panel.style.right = "12px"; }
}

function viewportTransformInputFocused() {
  const active = document.activeElement;
  return Boolean(active && isEditableTarget(active) && el.viewportTransformPanel && el.viewportTransformPanel.contains(active));
}

function scheduleViewportFloatingPanelLayoutRefresh() {
  if (viewportFloatingPanelResizeRaf) return;
  viewportFloatingPanelResizeRaf = requestAnimationFrame(function () {
    viewportFloatingPanelResizeRaf = 0;
    if (!viewportTransformInputFocused()) renderTransformPanel();
    redrawEditorMinimap();
  });
}

function updateTransformPanelScale(panelState) {
  const panel = el.viewportTransformPanel;
  if (!panel) return;
  const rect = panel.getBoundingClientRect();
  const width = Number(panelState?.width) || rect.width || 184;
  const height = Number(panelState?.height) || rect.height || 180;
  const hasMatrix = Boolean(panel.querySelector(".transformMatrix"));
  const actionCount = panel.querySelectorAll(".transformMobileActions button").length || 9;
  const actionRows = Math.max(1, Math.ceil(actionCount / 3));
  const baseActionsHeight = actionRows * 30 + Math.max(0, actionRows - 1) * 4;
  const baseMatrixHeight = hasMatrix ? 86 : 0;
  const baseHeight = 16 + baseActionsHeight + (hasMatrix ? 8 + baseMatrixHeight : 0);
  const scale = clampNumber(Math.min(width / 184, height / baseHeight), 0.28, 1.35);
  panel.style.setProperty("--transform-panel-scale", String(Math.round(scale * 1000) / 1000));
}

function transformPanelFloatingOptions(hasMatrix) {
  const defaultSize = editorMinimapDisplaySize(state.viewportWorld?.minimap?.editor || null);
  return {
    dragSelf: true,
    resizeCorner: "top-left",
    square: true,
    minWidth: hasMatrix ? 130 : 104,
    minHeight: hasMatrix ? 130 : 104,
    defaultWidth: defaultSize,
    defaultHeight: defaultSize,
    storagePanelId: "editorMinimap",
    onPreview: updateTransformPanelScale,
    onEnd: updateTransformPanelScale
  };
}

function renderTransformPanel() {
  if (!el.viewportTransformPanel) return;
  const node = selectedModelNode();
  const terrainNode = node ? null : selectedTerrainNode();
  const scatterNode = node || terrainNode ? null : selectedScatterNode();
  if (!node && !terrainNode && !scatterNode) {
    setEditorMinimapSuppressed(false);
    el.viewportTransformPanel.hidden = true;
    el.viewportTransformPanel.classList.remove("minimapSlotPanel");
    el.viewportTransformPanel.innerHTML = "";
    return;
  }
  setEditorMinimapSuppressed(true);
  el.viewportTransformPanel.hidden = false;
  el.viewportTransformPanel.classList.add("minimapSlotPanel");
  el.viewportTransformPanel.innerHTML = "";

  const actions = document.createElement("div");
  actions.className = "transformMobileActions";
  if (node) appendModelTransformActions(actions);
  else if (terrainNode) appendTerrainTransformActions(actions, terrainNode);
  else appendScatterTransformActions(actions, scatterNode);
  el.viewportTransformPanel.appendChild(actions);

  if (!node) {
    const floatingOptions = transformPanelFloatingOptions(false);
    applyViewportFloatingSlotAnchor(el.viewportTransformPanel, "viewportTransformPanel", state.viewportWorld?.minimap?.editor || null, floatingOptions);
    ensureFloatingPanelControls(el.viewportTransformPanel, "viewportTransformPanel", floatingOptions);
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

  const matrix = document.createElement("div");
  matrix.className = "transformMatrix";
  const labels = ["as", "G", "R", "T"];
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
    } else if (kind === "T") {
      patch["scale" + axis.toUpperCase()] = value;
    }
    cancelRuntimeTransform();
    setViewportAxis(null);
    void patchValues(node.id, patch, {
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
    let commitTimer = 0;
    let lastCommittedValue = Number(value);
    function commitFromInput() {
      if (commitTimer) {
        clearTimeout(commitTimer);
        commitTimer = 0;
      }
      const next = Number(input.value);
      if (!Number.isFinite(next)) {
        input.value = formatViewportNumber(value, digits);
        return;
      }
      if (Math.abs(next - lastCommittedValue) < 0.0000001) return;
      lastCommittedValue = next;
      commitTransformInput(kind, axis, next);
    }
    input.addEventListener("input", function (event) {
      if (event.inputType && event.inputType !== "insertReplacementText") return;
      if (commitTimer) clearTimeout(commitTimer);
      commitTimer = setTimeout(commitFromInput, 180);
    });
    input.addEventListener("change", commitFromInput);
    input.addEventListener("blur", commitFromInput);
    input.addEventListener("pointerdown", function (event) {
      event.stopPropagation();
    });
    input.addEventListener("keydown", function (event) {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        commitFromInput();
        input.blur();
      }
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
    addMatrixInput("T", axis, scale[axis] ?? 1, "0.01", 3);
  }
  el.viewportTransformPanel.appendChild(matrix);
  const floatingOptions = transformPanelFloatingOptions(true);
  applyViewportFloatingSlotAnchor(el.viewportTransformPanel, "viewportTransformPanel", state.viewportWorld?.minimap?.editor || null, floatingOptions);
  ensureFloatingPanelControls(el.viewportTransformPanel, "viewportTransformPanel", floatingOptions);
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
    renderGraph();
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
    renderGraph();
  }
  return result;
}

function runtimeTransformPointerEventTargetsViewport(event) {
  if (!event || !el.viewportCanvas) return false;
  if (event.target === el.viewportCanvas) return true;
  // A real interactive control (the Move/Rot/Scale buttons themselves, transform matrix
  // inputs, ...) sitting on top of the viewport is never what a genuine drag is targeting,
  // even when it geometrically overlaps the canvas - clicking Move a second time while a
  // transform is active was being read as a pointer confirming that transform at the
  // button's own screen position, snapping the mesh toward the toolbar.
  if (event.target && typeof event.target.closest === "function"
    && event.target.closest("button, input, select, textarea, a")) return false;
  // While a transform is active, any pointer still within the viewport's bounds counts
  // as targeting it - even if a floating panel (transform matrix, minimap, ...) happens
  // to be the actual event.target at that pixel. Rejecting those outright broke touch
  // drags that pass under UI chrome that can appear mid-gesture (e.g. right after
  // selecting an entity shows its transform panel), so the one pointerup meant to
  // confirm the drag never counted as "targeting the viewport" and the transform stayed
  // stuck active forever.
  const rect = el.viewportCanvas.getBoundingClientRect();
  const x = Number(event.clientX);
  const y = Number(event.clientY);
  return Number.isFinite(x) && Number.isFinite(y)
    && x >= rect.left && x <= rect.right
    && y >= rect.top && y <= rect.bottom;
}

function consumeRuntimeTransformPointerEvent(event) {
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
}

function previewRuntimeTransformFromEvent(event) {
  if (!runtimeTransformActive()) return false;
  if (!runtimeTransformPointerEventTargetsViewport(event)) return false;
  if (runtime && typeof runtime.previewTransformAt === "function") {
    runtime.previewTransformAt(event.clientX, event.clientY);
  }
  renderViewportControls();
  return true;
}

function handleRuntimeTransformMoveEvent(event) {
  if (!previewRuntimeTransformFromEvent(event)) return;
  consumeRuntimeTransformPointerEvent(event);
}

function handleRuntimeTransformEndEvent(event) {
  if (!previewRuntimeTransformFromEvent(event)) return;
  consumeRuntimeTransformPointerEvent(event);
  // This is registered before handleTerrainPointerUp and just stopped this event's
  // propagation above, so that handler (which normally clears this touch out of
  // viewportTouchEditPointers/the runtime's own 2-finger zoom tracking on release) will
  // never run for it. Do that cleanup here instead - otherwise the touch that confirmed
  // a G/R/S move via tap leaves a permanent ghost pointer behind, which pairs up with
  // the very next single-finger touch and gets misread as a two-finger pinch-zoom.
  updateViewportTouchEditState(event);
  if (event.button === 2 || event.button === 1) {
    cancelRuntimeTransform();
    return;
  }
  // A pointercancel (as opposed to a real pointerup) carries no intentional "I'm done"
  // signal from the user - it's the browser yanking the touch away (native long-press
  // gesture, an interrupting system UI, ...). Discarding all progress in that case is
  // more disruptive than just locking in whatever was already genuinely dragged, so
  // confirm here too rather than reverting to the start position.
  confirmRuntimeTransform();
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

editorDebug.focusGraphNode = focusGraphNode;

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
  renderAuthoringHub();
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
    // Never use the browser's native scrollIntoView here: .graphViewport is a fixed-size
    // canvas panned/zoomed via CSS transform + state.view, not native scrolling. Nudging
    // its real scroll offset desyncs state.view from the DOM, which then throws off every
    // mouse-to-graph coordinate conversion (zoom direction, click position, ...).
    focusGraphNode(nodeId);
  }
  if (options.showMobileInspector) showMobileInspectorPanel();
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
  const runtimeIds = state.selectedNodeIds
    .map(function (nodeId) { return runtimeNodeId(nodeById(nodeId)); })
    .filter(Boolean);
  if (typeof runtime.selectEntities === "function") {
    runtime.selectEntities(runtimeIds);
  } else if (runtimeIds.length) {
    runtime.selectEntity(runtimeIds[0]);
  } else {
    runtime.deselect();
  }
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
  if (state.currentGroupId && !isExistingGroupId(state.currentGroupId, state.graph)) {
    state.currentGroupId = null;
  }
  state.storedCurrentGroupId = state.currentGroupId || null;
  storeCurrentGroupId(state.currentGroupId);
  state.breadcrumb = breadcrumbForGroup(state.currentGroupId);
  renderBreadcrumb();
  renderAuthoringHub();
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
  if (!node) return false;
  return VIEWPORT_AFFECTING_NODE_TYPES.has(node.type);
}

function applyGraphMutationResult(result, options = {}) {
  const nextGraph = result && result.graph ? result.graph : result;
  if (!nextGraph) return null;
  state.graph = nextGraph;
  if (nextGraph.nodeTypes) state.nodeTypes = nextGraph.nodeTypes;
  clearReferenceLookupCaches();
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
  if (options.refreshViewportControls !== false) renderViewportControls();
  if (options.refreshViewport) {
    invalidateDraftWorld();
    scheduleViewportRefresh(false);
  }
  if (options.refreshValidation !== false) scheduleValidationRefresh();
  if (typeof options.afterApply === "function") options.afterApply(nextGraph, result);
  if (options.refreshAssetUsage !== false) requestManagedAssetUsageIfOpen();
  return nextGraph;
}

function requestManagedAssetUsageIfOpen() {
  const assetId = state.assetManager.assetId;
  if (!assetId) return;
  if (!state.assetManager.loadingUsage && !state.assetManager.usage.length) return;
  requestManagedAssetUsage(assetId);
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
      if (options.clearPendingEdge) {
        state.pendingEdge = null;
        renderGraph();
        renderViewportControls();
      }
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
        refreshInspector: true,
        // undoGraphMutation/redoGraphMutation (the only callers) adjust the unsaved
        // count themselves, in the right direction - undo should bring it down.
        countUnsaved: false
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
  unbumpUnsaved();
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
  bumpUnsaved();
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
    onModelLoadTiming: function (info) {
      captureUploadBrowserLoadTiming(info);
    },
    onSelectEntity: function (entityId) {
      if (!entityId) {
        deselectViewportClick();
        return;
      }
      const node = nodeByRuntimeId(entityId);
      if (!node) return;
      selectNode(node.id, false);
      // Always follow into the clicked object's zone (not just on desktop), so the
      // current zone context stays consistent across every tab/pane, incl. the mobile
      // "All" layout - later asset placement / node creation uses this same group.
      focusGraphNode(node.id);
      scheduleEditorMinimapRedraw();
    },
    onSelectEntities: function (entityIds) {
      const nodeIds = Array.from(new Set((entityIds || [])
        .map(function (id) { return nodeByRuntimeId(id)?.id; })
        .filter(Boolean)));
      if (!nodeIds.length) {
        deselectViewportClick();
        return;
      }
      setSelection(nodeIds, [], { primaryNodeId: nodeIds[0], clearPendingEdge: true });
      renderGraph();
      focusGraphNode(nodeIds[0]);
      scheduleEditorMinimapRedraw();
    },
    onMarqueeRect: function (rect) {
      if (!rect) hideViewportSelectionBox();
      else showViewportSelectionBox(rect.left, rect.top, rect.right, rect.bottom);
    },
    onMarqueeSelect: function (rect, additive, subtractive) {
      const hitNodeIds = viewportMarqueeNodeIds(rect);
      let nextIds;
      if (subtractive) {
        const remove = new Set(hitNodeIds);
        nextIds = state.selectedNodeIds.filter(function (id) { return !remove.has(id); });
      } else if (additive) {
        nextIds = Array.from(new Set(state.selectedNodeIds.concat(hitNodeIds)));
      } else {
        nextIds = hitNodeIds;
      }
      if (!nextIds.length) {
        deselectViewportClick();
        return;
      }
      setSelection(nextIds, [], { primaryNodeId: nextIds[0], clearPendingEdge: true });
      renderGraph();
      scheduleEditorMinimapRedraw();
    },
    onTransformChange: function () {
      // Purely visual, live feedback while dragging - the unsaved count and undo entry
      // are only created once on actual commit below (mouse release), not while the
      // object is still being dragged around.
      renderViewportControls();
      scheduleEditorMinimapRedraw();
    },
    onTransformEnd: function (info) {
      if (!info) return;
      setViewportAxis(null);
      if (info.action === "cancel") {
        clearSelection({ clearPendingEdge: true });
      }
      renderGraph();
      scheduleEditorMinimapRedraw();
      if (info.action === "confirm") {
        if (state.lastTransformCommitError) {
          setStatus(state.lastTransformCommitError, "error");
          state.lastTransformCommitError = "";
        } else {
          setStatus(info.changed ? "Transform confirmed." : "Transform unchanged: no mouse movement was received.", info.changed ? "success" : "error");
        }
      } else if (info.action === "cancel") {
        setStatus("Transform cancelled.", "");
      }
    },
    onTransformCommit: function (entityIdOrPayload, transform) {
      state.lastTransformCommitError = "";
      if (entityIdOrPayload && typeof entityIdOrPayload === "object" && Array.isArray(entityIdOrPayload.commits)) {
        void commitGroupTransform(entityIdOrPayload);
        setViewportAxis(null);
        return;
      }
      const node = nodeByRuntimeId(entityIdOrPayload);
      if (!node || node.type !== "model_entity") {
        state.lastTransformCommitError = "Transform niet opgeslagen: runtime entity niet gevonden (" + String(entityIdOrPayload || "unknown") + ").";
        setStatus(state.lastTransformCommitError, "error");
        return;
      }
      // This is the one point where a drop/release actually happened - bumping the
      // unsaved count and pushing the undo entry belongs here, not mid-drag.
      void patchValues(node.id, transform, {
        historyLabel: "Transform",
        refreshViewport: true,
        refreshEdgeList: false,
        refreshValidation: false
      });
      setViewportAxis(null);
    },
    onLoadErrors: renderViewportErrors,
    onEditorCameraChange: function (fields) {
      const node = state.graph.nodes.find(function (n) { return n.type === "editor_camera"; });
      if (!node) return;
      patchValues(node.id, {
        targetX: fields.targetX,
        targetY: fields.targetY,
        targetZ: fields.targetZ,
        pitch: fields.pitch,
        yaw: fields.yaw,
        distance: fields.distance
      }, {
        historyLabel: "",
        refreshViewport: false,
        refreshValidation: false,
        refreshGraph: false,
        refreshEdgeList: false,
        refreshInspector: false,
        refreshAssetUsage: false,
        countUnsaved: false
      });
      scheduleEditorMinimapRedraw();
    }
  });
  window.__GK_EDITOR_RUNTIME = runtime;
  state.viewportHelpOpen = false;
  if (el.viewportHelpPanel) el.viewportHelpPanel.hidden = true;
  await reloadGraph();
  await reloadAssets();
  renderViewportControls();
  setViewportSnap(state.snapMode, state.snapGridSize);
  setViewportMode(state.viewportMode);
  applyTransform();
  setStatus("Klaar.", "success");
  renderUnsaved();
  void refreshViewport({ force: true }).then(function () {
    return refreshValidation();
  });
}

async function reloadGraph(options = {}) {
  const requestOptions = Number.isFinite(Number(options.timeoutMs)) ? { timeoutMs: Number(options.timeoutMs) } : undefined;
  const graph = await api("/api/editor/graph", requestOptions);
  state.graph = graph;
  state.nodeTypes = graph.nodeTypes || state.nodeTypes || {};
  state.graphLoaded = true;
  restoreCurrentGroupAfterGraphLoad();
  restoreAuthoringRouteAfterGraphLoad();
  ensureCurrentGroupExists();
  renderGraph();
  renderEdgeList();
  renderInspector();
  renderAuthoringHub();
}

async function repairLoadedZoneCanvasGraph() {
  try {
    if (!zoneCanvasGraphNeedsLoadRepair(state.graph)) return false;
    const parentIds = Array.from(new Set((state.graph.nodes || []).filter(function (node) {
      return isZoneCanvasGroup(node, state.graph);
    }).map(function (node) {
      return node.parentId || null;
    })));
    const before = JSON.stringify(snapshotGraph(state.graph));
    const nextGraph = cloneGraphForRestore(state.graph);
    const legacyZoneTileIds = new Set((nextGraph.nodes || []).filter(function (node) {
      return node.type === "zone_tile_layer";
    }).map(function (node) {
      return node.id;
    }));
    if (legacyZoneTileIds.size) {
      nextGraph.nodes = (nextGraph.nodes || []).filter(function (node) {
        return !legacyZoneTileIds.has(node.id);
      });
      nextGraph.edges = (nextGraph.edges || []).filter(function (edge) {
        return !legacyZoneTileIds.has(edge.fromNodeId) && !legacyZoneTileIds.has(edge.toNodeId);
      });
    }
    const removedZoneOutputLightEdges = removeZoneOutputLightEdges(nextGraph);
    if (!parentIds.length && !legacyZoneTileIds.size && !removedZoneOutputLightEdges) return false;
    for (const parentId of parentIds) normalizeZoneCanvasGroups(nextGraph, parentId);
    const after = JSON.stringify(snapshotGraph(nextGraph));
    if (before === after) return false;
    const result = await api(RESTORE_GRAPH_ROUTE, {
      method: "POST",
      body: JSON.stringify({ graph: nextGraph })
    });
    state.graph = result.graph || result;
    state.nodeTypes = state.graph.nodeTypes || state.nodeTypes;
    return true;
  } catch (error) {
    setStatus("Zone Canvas auto-repair overgeslagen: " + (error?.message || String(error)), "error");
    return false;
  }
}

function zoneCanvasGraphNeedsLoadRepair(graph) {
  const nodes = graph?.nodes || [];
  const nodeById = new Map(nodes.map(function (node) { return [node.id, node]; }));
  for (const node of nodes) {
    if (node.type === "zone_tile_layer") return true;
    if (!isZoneCanvasGroup(node, graph)) continue;
    const gridX = Number(node.values?.zoneGridX);
    const gridZ = Number(node.values?.zoneGridZ);
    if (node.values?.zoneCanvas !== true || !Number.isFinite(gridX) || !Number.isFinite(gridZ)) return true;
    if (!zoneDefinitionForGroup(node.id, graph) || !zoneOutputForGroup(node.id, graph)) return true;
    if ((node.values?.groupInterface?.outputs || []).some(isZoneCanvasEntityGroupPort)) return true;
  }
  for (const edge of graph?.edges || []) {
    if (edge.toPort === "lights" && nodeById.get(edge.toNodeId)?.type === "zone_output") return true;
    const target = nodeById.get(edge.toNodeId);
    if (target?.type === "group_output") {
      const group = nodeById.get(target.parentId);
      const source = nodeById.get(edge.fromNodeId);
      if (isZoneCanvasGroup(group, graph) && source?.parentId === group.id && (edge.fromPort === "entity" || source?.type === "model_entity")) return true;
    }
    const sourceGroup = nodeById.get(edge.fromNodeId);
    if (isZoneCanvasGroup(sourceGroup, graph) && ["entity", "entities"].includes(String(edge.fromPort || ""))) return true;
  }
  return false;
}

function isExistingGroupId(groupId, graph = state.graph) {
  if (!groupId) return false;
  return (graph?.nodes || []).some(function (node) {
    return node?.id === groupId && node?.type === "group";
  });
}

function restoreCurrentGroupAfterGraphLoad() {
  const candidate = state.currentGroupId || state.storedCurrentGroupId || loadStoredCurrentGroupId();
  if (candidate && isExistingGroupId(candidate, state.graph)) {
    state.currentGroupId = candidate;
    state.storedCurrentGroupId = candidate;
    storeCurrentGroupId(candidate);
    return;
  }
  state.currentGroupId = null;
  state.storedCurrentGroupId = null;
  if (candidate) storeCurrentGroupId(null);
}

function restoreAuthoringRouteAfterGraphLoad() {
  const candidate = state.authoringRouteId || state.storedAuthoringRouteId || loadStoredAuthoringRoute();
  const route = authoringRouteById(candidate);
  if (route) {
    state.authoringRouteId = route.id;
    state.storedAuthoringRouteId = route.id;
    storeAuthoringRoute(route.id);
    return route;
  }
  state.authoringRouteId = null;
  state.storedAuthoringRouteId = null;
  state.nodeLibraryOpen = false;
  if (candidate) storeAuthoringRoute(null);
  return null;
}

function ensureCurrentGroupExists() {
  if (state.currentGroupId && !isExistingGroupId(state.currentGroupId, state.graph)) {
    state.currentGroupId = null;
  }
  syncBreadcrumb();
}

// ---------- Node Library ----------
const AUTHORING_ROUTE_ACCENTS = {
  world_zone: "#38bdf8",
  object_character: "#f97316",
  quest_dialogue: "#22c55e",
  item_ability_stat: "#a855f7",
  game_settings_ui: "#0ea5e9"
};

function normalizeEditorKey(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeAuthoringRouteState() {
  if (!state.graphLoaded) return null;
  const route = authoringRouteById(state.authoringRouteId);
  if (route) {
    state.authoringRouteId = route.id;
    state.storedAuthoringRouteId = route.id;
    return route;
  }
  if (!route && state.authoringRouteId) {
    state.authoringRouteId = null;
    state.storedAuthoringRouteId = null;
    state.nodeLibraryOpen = false;
    storeAuthoringRoute(null);
  }
  return null;
}

function currentAuthoringRoute() {
  return sanitizeAuthoringRouteState();
}

function authoringRouteAccent(routeId) {
  return AUTHORING_ROUTE_ACCENTS[routeId] || "#7bd4ff";
}

function ensureMobileAllLayout() {
  if (isMobileLayout() && state.mobilePanel !== "all") setMobilePanel("all", false);
}

function selectedViewportAuthoringNode() {
  const runtimeId = runtimeSelectedEntityId();
  if (runtimeId) {
    const runtimeNode = nodeByRuntimeId(runtimeId);
    if (runtimeNode) return runtimeNode;
  }
  const selectedNode = nodeById(state.selectedNodeId);
  if (selectedNode && runtimeNodeId(selectedNode)) return selectedNode;
  return null;
}

function selectedSingleModelNode() {
  const node = selectedViewportAuthoringNode();
  if (!node || node.type !== "model_entity") return null;
  if (!Array.isArray(state.selectedNodeIds) || state.selectedNodeIds.length !== 1) return null;
  if (state.selectedNodeIds[0] !== node.id) return null;
  return node;
}

function zoneCanvasAncestorForNode(node, graph = state.graph) {
  let parentId = node?.parentId || null;
  while (parentId) {
    const candidate = (graph.nodes || []).find(function (entry) {
      return entry.id === parentId && entry.type === "group";
    }) || null;
    if (!candidate) break;
    if (isZoneCanvasGroup(candidate, graph)) return candidate;
    parentId = candidate.parentId || null;
  }
  return null;
}

function firstZoneCanvasGroup(graph = state.graph) {
  return (graph.nodes || []).find(function (node) {
    return isZoneCanvasGroup(node, graph);
  }) || null;
}

function objectFunctionModelStem(model) {
  const canonicalEntityId = normalizeCanonicalId(model?.values?.entityId || "", "");
  const stripped = canonicalEntityId.replace(/^entity[._:-]+/, "");
  const fallback = normalizeCanonicalId(model?.values?.label || model?.title || model?.id || "", "");
  return normalizeCanonicalId(stripped || fallback || model?.id || "", "") || "object";
}

function graphUsedCanonicalIds(graph = state.graph) {
  const used = new Set();
  for (const node of Array.isArray(graph?.nodes) ? graph.nodes : []) {
    const fields = state.nodeTypes?.[node.type]?.fields || {};
    for (const [fieldName, field] of Object.entries(fields)) {
      if (!field || field.type !== "identity") continue;
      const value = normalizeCanonicalId(node?.values?.[fieldName], "");
      if (value) used.add(value);
    }
  }
  for (const aliasRow of Array.isArray(graph?.contentAliases) ? graph.contentAliases : []) {
    const oldId = normalizeCanonicalId(aliasRow?.old_id, "");
    const newId = normalizeCanonicalId(aliasRow?.new_id, "");
    if (oldId) used.add(oldId);
    if (newId) used.add(newId);
  }
  return used;
}

function uniqueCanonicalGraphValue(graph, baseValue) {
  const used = graphUsedCanonicalIds(graph);
  const base = normalizeCanonicalId(baseValue, "");
  if (!base) return "";
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(base + "." + index)) index += 1;
  return base + "." + index;
}

function objectFunctionAssemblyEntityId(model, graph = state.graph) {
  const stem = objectFunctionModelStem(model);
  const assembly = objectFunctionAssemblyForModel(model, graph);
  const existing = normalizeCanonicalId(assembly?.values?.entityId || "", "");
  if (existing) return existing;
  return uniqueCanonicalGraphValue(graph, "entity." + stem + ".assembly");
}

function objectFunctionAssemblyForModel(model, graph = state.graph) {
  if (!model) return null;
  const assemblyEdges = (graph.edges || []).filter(function (edge) {
    return edge.fromNodeId === model.id && edge.fromPort === "entity" && edge.toPort === "model";
  });
  const assemblyIds = Array.from(new Set(assemblyEdges.map(function (edge) {
    return edge.toNodeId;
  })));
  return assemblyIds.map(function (assemblyId) {
    return (graph.nodes || []).find(function (node) {
      return node.id === assemblyId && node.type === "entity_assembly";
    }) || null;
  }).filter(function (node) {
    return node && (node.parentId || null) === (model.parentId || null);
  })[0] || null;
}

function objectFunctionConnectedNodesForAssembly(graph, assembly, type) {
  if (!assembly) return [];
  return (graph.nodes || []).filter(function (node) {
    if (node.type !== type) return false;
    return (graph.edges || []).some(function (edge) {
      if (type === "quest_target_binding") {
        return edge.fromNodeId === assembly.id && edge.fromPort === "entity" && edge.toNodeId === node.id && edge.toPort === "entity";
      }
      return edge.fromNodeId === node.id && edge.fromPort === "component" && edge.toNodeId === assembly.id && edge.toPort === "components";
    });
  });
}

function objectFunctionQuestBindingForAssembly(graph, assembly) {
  const questBindings = objectFunctionQuestBindingsForAssembly(graph, assembly);
  return questBindings[0] || null;
}

function objectFunctionDerivedZoneGroup(model, graph = state.graph) {
  const parent = model?.parentId ? (graph.nodes || []).find(function (node) {
    return node.id === model.parentId && node.type === "group";
  }) || null : null;
  return parent && isZoneCanvasGroup(parent, graph) ? parent : null;
}

function objectFunctionNavigationZoneGroup(model, graph = state.graph) {
  return zoneCanvasAncestorForNode(model, graph) || firstZoneCanvasGroup(graph);
}

function objectFunctionContextForModel(model, graph = state.graph) {
  const parentGroup = model?.parentId ? (graph.nodes || []).find(function (node) {
    return node.id === model.parentId && node.type === "group";
  }) || null : null;
  const zoneGroup = objectFunctionDerivedZoneGroup(model, graph);
  const navigationZoneGroup = objectFunctionNavigationZoneGroup(model, graph);
  const zoneDefinition = zoneGroup ? zoneDefinitionForGroup(zoneGroup.id, graph) : null;
  const zoneOutput = zoneGroup ? zoneOutputForGroup(zoneGroup.id, graph) : null;
  const assemblyNodes = objectFunctionAssemblyNodesForModel(model, graph);
  const assembly = assemblyNodes[0] || null;
  const assemblyEdgeCount = (graph.edges || []).filter(function (edge) {
    return edge.fromNodeId === model?.id && edge.fromPort === "entity" && edge.toPort === "model";
  }).length;
  const interactionNodes = objectFunctionConnectedNodesForAssembly(graph, assembly, "interaction_component");
  const npcNodes = objectFunctionConnectedNodesForAssembly(graph, assembly, "npc_component");
  const enemyNodes = objectFunctionConnectedNodesForAssembly(graph, assembly, "enemy_component");
  const questNodes = objectFunctionQuestBindingsForAssembly(graph, assembly);
  const interactionComponent = interactionNodes[0] || null;
  const npcComponent = npcNodes[0] || null;
  const enemyComponent = enemyNodes[0] || null;
  const questBinding = questNodes[0] || null;
  const interactionEdgeCount = objectFunctionConnectedEdgeCountForAssembly(graph, assembly, "interaction_component");
  const npcEdgeCount = objectFunctionConnectedEdgeCountForAssembly(graph, assembly, "npc_component");
  const enemyEdgeCount = objectFunctionConnectedEdgeCountForAssembly(graph, assembly, "enemy_component");
  const questEdgeCount = objectFunctionConnectedEdgeCountForAssembly(graph, assembly, "quest_target_binding");
  const duplicateInteractionCount = Math.max(interactionNodes.length, interactionEdgeCount);
  const duplicateNpcCount = Math.max(npcNodes.length, npcEdgeCount);
  const duplicateEnemyCount = Math.max(enemyNodes.length, enemyEdgeCount);
  const duplicateQuestCount = Math.max(questNodes.length, questEdgeCount);
  const issues = [];
  if (!model) {
    issues.push({ kind: "selection", message: "Selecteer precies één model in de 3D-viewport." });
  } else if (!parentGroup) {
    issues.push({ kind: "parent", message: "Dit model staat niet in een group." });
  } else if (!zoneGroup) {
    issues.push({ kind: "zone", message: "Dit model staat niet direct in een Zone Canvas." });
  }
  if (zoneGroup && !zoneOutput) {
    issues.push({ kind: "output", message: "Deze Zone Canvas mist een Zone Output." });
  }
  if (assemblyNodes.length !== assemblyEdgeCount || assemblyNodes.length > 1 || assemblyEdgeCount > 1) {
    issues.push({ kind: "assembly", message: "De Entity Assembly-koppeling is ongeldig of dubbel." });
  }
  if (duplicateInteractionCount > 1) {
    issues.push({ kind: "interaction", message: "Meerdere Interaction Components zijn aan deze assembly gekoppeld." });
  }
  if (duplicateNpcCount > 1) {
    issues.push({ kind: "npc", message: "Meerdere NPC Components zijn aan deze assembly gekoppeld." });
  }
  if (duplicateEnemyCount > 1) {
    issues.push({ kind: "enemy", message: "Meerdere Enemy Components zijn aan deze assembly gekoppeld." });
  }
  if (duplicateQuestCount > 1) {
    issues.push({ kind: "quest", message: "Meerdere Quest Target bindings zijn aan deze assembly gekoppeld." });
  }
  if (npcComponent && enemyComponent) {
    issues.push({ kind: "conflict", message: "NPC en Enemy kunnen niet tegelijk actief zijn." });
  }
  return {
    model: model || null,
    parentGroup: parentGroup || null,
    zoneGroup: zoneGroup || null,
    navigationZoneGroup: navigationZoneGroup || null,
    zoneDefinition: zoneDefinition || null,
    zoneOutput: zoneOutput || null,
    assembly: assembly || null,
    interactionComponent: interactionComponent || null,
    npcComponent: npcComponent || null,
    enemyComponent: enemyComponent || null,
    questBinding: questBinding || null,
    modelStem: model ? objectFunctionModelStem(model) : "",
    assemblyEntityId: objectFunctionAssemblyEntityId(model, graph),
    issues: issues,
    canCreate: Boolean(model && zoneGroup && zoneOutput && issues.every(function (issue) {
      return !["selection", "parent", "zone", "output", "assembly", "interaction", "npc", "enemy", "quest", "conflict"].includes(issue.kind);
    }))
  };
}

function objectFunctionExistingNodeForKind(context, kind) {
  if (!context) return null;
  if (kind === "interaction") return context.interactionComponent;
  if (kind === "npc") return context.npcComponent;
  if (kind === "enemy") return context.enemyComponent;
  if (kind === "quest") return context.questBinding;
  return null;
}

function objectFunctionCanCreateKind(context, kind) {
  if (!context || !context.model || !context.zoneGroup || !context.zoneOutput || !context.canCreate) return false;
  if (kind === "npc" && context.enemyComponent && !context.npcComponent) return false;
  if (kind === "enemy" && context.npcComponent && !context.enemyComponent) return false;
  return true;
}

function objectFunctionKindLabel(kind) {
  if (kind === "interaction") return "Interactable";
  if (kind === "npc") return "NPC";
  if (kind === "enemy") return "Enemy";
  if (kind === "quest") return "Quest Target";
  return kind;
}

function objectFunctionNodeTypeForKind(kind) {
  if (kind === "interaction") return "interaction_component";
  if (kind === "npc") return "npc_component";
  if (kind === "enemy") return "enemy_component";
  if (kind === "quest") return "quest_target_binding";
  return "";
}

function objectFunctionBadgeAccent(kind) {
  const type = objectFunctionNodeTypeForKind(kind);
  return state.nodeTypes?.[type]?.accent || "#7bd4ff";
}

function objectFunctionDraftDefaults(kind, context) {
  const modelLabel = nodeDisplayTitle(context.model) || "Object";
  const defaults = {
    interaction: {
      interactionType: "inspect",
      prompt: "Gebruik",
      radius: 2,
      enabled: true
    },
    npc: {
      npcRef: "",
      level: 1,
      persistenceScope: "disposable"
    },
    enemy: {
      enemyRef: "",
      variantRef: "",
      difficultyRef: "",
      levelMode: "fixed",
      fixedLevel: 1
    },
    quest: {
      label: modelLabel,
      targetKind: context.npcComponent ? "npc" : (context.enemyComponent ? "custom" : "marker"),
      radius: 2.5,
      visibleInGame: true,
      action: "",
      prompt: ""
    }
  };
  return clonePlain(defaults[kind] || {});
}

function objectFunctionTitleForKind(kind, context) {
  if (kind === "interaction") return objectFunctionExistingNodeForKind(context, kind) ? "Interactable beheren" : "Interactable maken";
  if (kind === "npc") return objectFunctionExistingNodeForKind(context, kind) ? "NPC beheren" : "NPC maken";
  if (kind === "enemy") return objectFunctionExistingNodeForKind(context, kind) ? "Enemy beheren" : "Enemy maken";
  if (kind === "quest") return objectFunctionExistingNodeForKind(context, kind) ? "Quest Target beheren" : "Quest Target maken";
  return objectFunctionKindLabel(kind);
}

function objectFunctionFocusNodeIdForKind(context, kind) {
  if (kind === "interaction") return context.interactionComponent?.id || context.assembly?.id || context.model?.id || null;
  if (kind === "npc") return context.npcComponent?.id || context.assembly?.id || context.model?.id || null;
  if (kind === "enemy") return context.enemyComponent?.id || context.assembly?.id || context.model?.id || null;
  if (kind === "quest") return context.questBinding?.id || context.assembly?.id || context.model?.id || null;
  return context.model?.id || null;
}

function objectFunctionBeginDraft(kind, context) {
  if (!context?.model) return;
  const existing = objectFunctionExistingNodeForKind(context, kind);
  const currentDraft = state.objectFunctionDraft;
  if (currentDraft && currentDraft.kind === kind && currentDraft.modelId === context.model.id) {
    renderAuthoringHub();
    return;
  }
  state.objectFunctionDraft = {
    kind: kind,
    modelId: context.model.id,
    existingNodeId: existing?.id || null,
    values: Object.assign(
      {},
      objectFunctionDraftDefaults(kind, context),
      existing ? clonePlain(existing.values || {}) : {}
    )
  };
  if (kind === "quest") {
    state.objectFunctionDraft.values.zoneRef = context.zoneDefinition?.values?.zoneId || "";
    state.objectFunctionDraft.values.entityRef = context.assembly?.values?.entityId || objectFunctionAssemblyEntityId(context.model, state.graph);
  }
  renderAuthoringHub();
}

function objectFunctionClearDraft() {
  if (!state.objectFunctionDraft) return;
  state.objectFunctionDraft = null;
  renderAuthoringHub();
}

function objectFunctionOpenCatalog() {
  selectAuthoringRoute("item_ability_stat");
  const workspaces = authoringWorkspacesForRoute("item_ability_stat", state.graph);
  const workspace = workspaces.length ? workspaces[0].nodes[0] : null;
  if (workspace) {
    selectNode(workspace.id, true, { clearPendingEdge: true, showMobileInspector: true });
  }
}

function objectFunctionNavigateToZone(context) {
  const target = context?.navigationZoneGroup || context?.zoneGroup || firstZoneCanvasGroup(state.graph);
  if (!target) return false;
  selectNode(target.id, true, { clearPendingEdge: true, showMobileInspector: true });
  return true;
}

function objectFunctionSetDraftValue(key, value) {
  if (!state.objectFunctionDraft) return;
  state.objectFunctionDraft.values = Object.assign({}, state.objectFunctionDraft.values || {}, { [key]: value });
}

function objectFunctionAssemblyNodesForModel(model, graph = state.graph) {
  if (!model) return [];
  const assemblyEdges = (graph.edges || []).filter(function (edge) {
    return edge.fromNodeId === model.id && edge.fromPort === "entity" && edge.toPort === "model";
  });
  const assemblyIds = Array.from(new Set(assemblyEdges.map(function (edge) {
    return edge.toNodeId;
  })));
  return assemblyIds.map(function (assemblyId) {
    return (graph.nodes || []).find(function (node) {
      return node.id === assemblyId && node.type === "entity_assembly";
    }) || null;
  }).filter(function (node) {
    return node && (node.parentId || null) === (model.parentId || null);
  });
}

function objectFunctionQuestBindingsForAssembly(graph, assembly) {
  return objectFunctionConnectedNodesForAssembly(graph, assembly, "quest_target_binding");
}

function objectFunctionConnectedEdgeCountForAssembly(graph, assembly, type) {
  if (!assembly) return 0;
  return (graph.edges || []).filter(function (edge) {
    if (type === "quest_target_binding") {
      return edge.fromNodeId === assembly.id && edge.fromPort === "entity" && edge.toPort === "entity";
    }
    return edge.fromPort === "component" && edge.toNodeId === assembly.id && edge.toPort === "components";
  }).filter(function (edge) {
    const node = (graph.nodes || []).find(function (candidate) {
      return candidate.id === edge.fromNodeId;
    }) || null;
    return node && node.type === type;
  }).length;
}

function objectFunctionDefaultValuesForNodeType(type) {
  const defaults = {};
  const fields = state.nodeTypes?.[type]?.fields || {};
  for (const [key, field] of Object.entries(fields)) {
    if (!field) continue;
    const normalized = normalizeFieldInputValue(field, field.default);
    if (normalized !== undefined) defaults[key] = clonePlain(normalized);
  }
  return defaults;
}

function objectFunctionDraftForContext(context) {
  const draft = state.objectFunctionDraft;
  if (!draft || !context?.model) return null;
  if (draft.modelId !== context.model.id) return null;
  return draft;
}

function objectFunctionModelTitle(context) {
  return nodeDisplayTitle(context?.model) || "Object";
}

function objectFunctionGraphTitleForKind(kind, context) {
  const modelTitle = objectFunctionModelTitle(context);
  if (kind === "interaction") return modelTitle + " Interactable";
  if (kind === "npc") return modelTitle + " NPC";
  if (kind === "enemy") return modelTitle + " Enemy";
  if (kind === "quest") return modelTitle + " Quest Target";
  return modelTitle + " " + objectFunctionKindLabel(kind);
}

function objectFunctionAssemblyTitle(context) {
  return objectFunctionModelTitle(context) + " Assembly";
}

function objectFunctionRecipeColumns(context, graph = state.graph) {
  const zoneOutput = context?.zoneOutput
    ? ((graph.nodes || []).find(function (node) { return node.id === context.zoneOutput.id; }) || context.zoneOutput)
    : null;
  const model = context?.model
    ? ((graph.nodes || []).find(function (node) { return node.id === context.model.id; }) || context.model)
    : null;
  const outputX = Number(zoneOutput?.x);
  const fallbackOutputX = Number.isFinite(Number(model?.x))
    ? Number(model.x) + OBJECT_RECIPE_COLUMN_STEP * 3
    : 760;
  const zoneOutputX = Math.round(Number.isFinite(outputX) ? outputX : fallbackOutputX);
  const questX = zoneOutputX - OBJECT_RECIPE_COLUMN_STEP;
  const assemblyX = questX - OBJECT_RECIPE_COLUMN_STEP;
  const sourceX = assemblyX - OBJECT_RECIPE_COLUMN_STEP;
  return { sourceX: sourceX, assemblyX: assemblyX, questX: questX, zoneOutputX: zoneOutputX };
}

function objectFunctionRecipeBaseY(context, graph = state.graph) {
  const model = context?.model
    ? ((graph.nodes || []).find(function (node) { return node.id === context.model.id; }) || context.model)
    : null;
  const modelY = Number(model?.y);
  if (Number.isFinite(modelY)) return Math.round(modelY);
  const outputY = Number(context?.zoneOutput?.y);
  return Math.round(Number.isFinite(outputY) ? outputY + OBJECT_RECIPE_COMPONENT_Y_OFFSET : 200);
}

function objectFunctionSetNodeGraphPosition(node, position) {
  if (!node || !isFiniteGraphPosition(position)) return false;
  const x = Math.round(Number(position.x));
  const y = Math.round(Number(position.y));
  let changed = false;
  if (Math.round(Number(node.x) || 0) !== x) {
    node.x = x;
    changed = true;
  }
  if (Math.round(Number(node.y) || 0) !== y) {
    node.y = y;
    changed = true;
  }
  return changed;
}

function objectFunctionConnectedComponentNodesForAssembly(graph, assembly) {
  if (!assembly) return [];
  const nodes = [];
  const seen = new Set();
  for (const type of ["interaction_component", "npc_component", "enemy_component"]) {
    for (const node of objectFunctionConnectedNodesForAssembly(graph, assembly, type)) {
      if (!node || seen.has(node.id)) continue;
      seen.add(node.id);
      nodes.push(node);
    }
  }
  return nodes;
}

function objectFunctionApplyRecipeLayout(graph, context) {
  const model = context?.model
    ? ((graph.nodes || []).find(function (node) { return node.id === context.model.id; }) || null)
    : null;
  const zoneOutput = context?.zoneOutput
    ? ((graph.nodes || []).find(function (node) { return node.id === context.zoneOutput.id; }) || null)
    : null;
  const assembly = objectFunctionAssemblyForModel(model, graph);
  if (!model || !zoneOutput || !assembly) return false;
  const columns = objectFunctionRecipeColumns({ model: model, zoneOutput: zoneOutput }, graph);
  const baseY = objectFunctionRecipeBaseY({ model: model, zoneOutput: zoneOutput }, graph);
  const components = objectFunctionConnectedComponentNodesForAssembly(graph, assembly);
  const assemblyY = baseY + (components.length ? Math.round((components.length * OBJECT_RECIPE_COMPONENT_Y_STEP) / 2) : 0);
  let changed = false;
  changed = objectFunctionSetNodeGraphPosition(model, { x: columns.sourceX, y: baseY }) || changed;
  changed = objectFunctionSetNodeGraphPosition(assembly, { x: columns.assemblyX, y: assemblyY }) || changed;
  components.forEach(function (component, index) {
    changed = objectFunctionSetNodeGraphPosition(component, {
      x: columns.sourceX,
      y: baseY + OBJECT_RECIPE_COMPONENT_Y_OFFSET + index * OBJECT_RECIPE_COMPONENT_Y_STEP
    }) || changed;
  });
  objectFunctionQuestBindingsForAssembly(graph, assembly).forEach(function (quest, index) {
    changed = objectFunctionSetNodeGraphPosition(quest, {
      x: columns.questX,
      y: assemblyY + index * OBJECT_RECIPE_COMPONENT_Y_STEP
    }) || changed;
  });
  return changed;
}

function objectFunctionEstimatedNodeHeight(node) {
  if (!node) return 122;
  if (node.id && el.nodeLayer) {
    const card = el.nodeLayer.querySelector('.gnode[data-node-id="' + cssEscapeValue(node.id) + '"]');
    if (card && card.offsetHeight) return Math.max(122, Math.round(card.offsetHeight));
  }
  if (node.type === "zone_output") return 620;
  if (node.type === "graph_frame") return graphFrameSize(node).height;
  return 132;
}

function objectFunctionSuggestedModelPositionInZone(parentId, graph = state.graph, fallback = null, excludeNodeId = null) {
  const wantedParentId = parentId || null;
  const group = wantedParentId ? (graph.nodes || []).find(function (node) {
    return node.id === wantedParentId && node.type === "group";
  }) || null : null;
  if (!group || !isZoneCanvasGroup(group, graph)) return null;
  const zoneOutput = zoneOutputForGroup(wantedParentId, graph);
  if (!zoneOutput) return null;
  const columns = objectFunctionRecipeColumns({ zoneOutput: zoneOutput }, graph);
  const fallbackY = Number.isFinite(Number(fallback?.y))
    ? Number(fallback.y)
    : Number(zoneOutput.y) + OBJECT_RECIPE_COMPONENT_Y_OFFSET;
  const objectTypes = new Set([
    "model_entity",
    "entity_assembly",
    "interaction_component",
    "npc_component",
    "enemy_component",
    "quest_target_binding"
  ]);
  const siblings = (graph.nodes || []).filter(function (node) {
    return node.id !== excludeNodeId
      && (node.parentId || null) === wantedParentId
      && objectTypes.has(node.type);
  });
  if (!siblings.length) {
    return { x: columns.sourceX, y: Math.round(fallbackY) };
  }
  const bottom = siblings.reduce(function (max, node) {
    const y = Number(node.y);
    if (!Number.isFinite(y)) return max;
    return Math.max(max, y + objectFunctionEstimatedNodeHeight(node));
  }, Number.NEGATIVE_INFINITY);
  return {
    x: columns.sourceX,
    y: Math.round(Number.isFinite(bottom) ? bottom + OBJECT_RECIPE_STACK_GAP : fallbackY)
  };
}

function objectFunctionSuggestedAssemblyPosition(context, graph = state.graph) {
  const columns = objectFunctionRecipeColumns(context, graph);
  const baseY = objectFunctionRecipeBaseY(context, graph);
  return {
    x: columns.assemblyX,
    y: baseY
  };
}

function objectFunctionSuggestedNodePosition(kind, context, graph = state.graph) {
  const columns = objectFunctionRecipeColumns(context, graph);
  const baseY = objectFunctionRecipeBaseY(context, graph);
  if (kind === "interaction") {
    return { x: columns.sourceX, y: baseY + OBJECT_RECIPE_COMPONENT_Y_OFFSET };
  }
  if (kind === "npc") {
    return { x: columns.sourceX, y: baseY + OBJECT_RECIPE_COMPONENT_Y_OFFSET + OBJECT_RECIPE_COMPONENT_Y_STEP };
  }
  if (kind === "enemy") {
    return { x: columns.sourceX, y: baseY + OBJECT_RECIPE_COMPONENT_Y_OFFSET + OBJECT_RECIPE_COMPONENT_Y_STEP * 2 };
  }
  if (kind === "quest") {
    return {
      x: columns.questX,
      y: baseY
    };
  }
  return { x: columns.assemblyX, y: baseY };
}

function objectFunctionRemoveEdges(graph, predicate) {
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const before = edges.length;
  graph.edges = edges.filter(function (edge) {
    return !predicate(edge);
  });
  return graph.edges.length !== before;
}

function objectFunctionRemoveNodeAndEdges(graph, nodeId) {
  if (!nodeId) return false;
  let changed = false;
  const beforeNodes = graph.nodes.length;
  graph.nodes = graph.nodes.filter(function (node) {
    return node.id !== nodeId;
  });
  if (graph.nodes.length !== beforeNodes) changed = true;
  const beforeEdges = graph.edges.length;
  graph.edges = graph.edges.filter(function (edge) {
    return edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId;
  });
  if (graph.edges.length !== beforeEdges) changed = true;
  return changed;
}

function objectFunctionEnsureAssemblyNode(graph, context) {
  const model = context?.model;
  if (!model) return null;
  const modelTitle = objectFunctionModelTitle(context);
  const assemblyNodes = objectFunctionAssemblyNodesForModel(model, graph);
  let assembly = assemblyNodes[0] || null;
  if (!assembly) {
    assembly = {
      id: createZoneGraphId("node_entity_assembly"),
      type: "entity_assembly",
      title: objectFunctionAssemblyTitle(context),
      x: objectFunctionSuggestedAssemblyPosition(context, graph).x,
      y: objectFunctionSuggestedAssemblyPosition(context, graph).y,
      parentId: model.parentId || null,
      values: Object.assign({}, objectFunctionDefaultValuesForNodeType("entity_assembly"), {
        entityId: uniqueCanonicalGraphValue(graph, "entity." + objectFunctionModelStem(model) + ".assembly"),
        label: modelTitle,
        entityTags: []
      })
    };
    graph.nodes.push(assembly);
    return assembly;
  }
  assembly.parentId = model.parentId || null;
  assembly.title = objectFunctionAssemblyTitle(context);
  assembly.x = Number.isFinite(Number(assembly.x)) ? assembly.x : objectFunctionSuggestedAssemblyPosition(context, graph).x;
  assembly.y = Number.isFinite(Number(assembly.y)) ? assembly.y : objectFunctionSuggestedAssemblyPosition(context, graph).y;
  assembly.values = Object.assign({}, assembly.values || {}, {
    entityId: normalizeCanonicalId(assembly.values?.entityId || "", "") || uniqueCanonicalGraphValue(graph, "entity." + objectFunctionModelStem(model) + ".assembly"),
    label: modelTitle,
    entityTags: Array.isArray(assembly.values?.entityTags) ? assembly.values.entityTags : []
  });
  return assembly;
}

function objectFunctionEnsureAssemblyRouting(graph, context, assembly, zoneOutput) {
  if (!assembly || !context?.model || !zoneOutput) return false;
  let changed = false;
  const nodeTypeById = new Map((graph.nodes || []).map(function (node) {
    return [node.id, node.type];
  }));
  let keptAssemblyOutputEdgeId = null;
  changed = objectFunctionRemoveEdges(graph, function (edge) {
    return edge.fromNodeId === context.model.id
      && edge.fromPort === "entity"
      && edge.toPort === "model"
      && edge.toNodeId !== assembly.id;
  }) || changed;
  changed = objectFunctionRemoveEdges(graph, function (edge) {
    return edge.fromNodeId === context.model.id
      && edge.fromPort === "entity"
      && edge.toPort === "entities"
      && nodeTypeById.get(edge.toNodeId) === "zone_output";
  }) || changed;
  changed = objectFunctionRemoveEdges(graph, function (edge) {
    if (edge.fromNodeId !== assembly.id || edge.fromPort !== "entity" || edge.toPort !== "entities") return false;
    if (edge.toNodeId === zoneOutput.id && !keptAssemblyOutputEdgeId) {
      keptAssemblyOutputEdgeId = edge.id;
      return false;
    }
    return nodeTypeById.get(edge.toNodeId) === "zone_output";
  }) || changed;
  if (pushEdgeIfMissing(graph, context.model.id, "entity", assembly.id, "model")) changed = true;
  if (pushEdgeIfMissing(graph, assembly.id, "entity", zoneOutput.id, "entities")) changed = true;
  return changed;
}

function objectFunctionBuildNodeValuesForKind(kind, context, draft, existingNode, graph = state.graph) {
  const type = objectFunctionNodeTypeForKind(kind);
  const fields = state.nodeTypes?.[type]?.fields || {};
  const draftValues = draft?.values || {};
  const next = existingNode ? clonePlain(existingNode.values || {}) : objectFunctionDefaultValuesForNodeType(type);
  for (const [key, field] of Object.entries(fields)) {
    if (!Object.prototype.hasOwnProperty.call(draftValues, key)) continue;
    next[key] = normalizeFieldInputValue(field, draftValues[key]);
  }
  if (kind === "interaction") {
    next.componentId = existingNode
      ? (normalizeCanonicalId(next.componentId || "", "") || uniqueCanonicalGraphValue(graph, "component.interaction." + objectFunctionModelStem(context.model)))
      : uniqueCanonicalGraphValue(graph, "component.interaction." + objectFunctionModelStem(context.model));
    next.interactionType = String(next.interactionType || "inspect").trim() || "inspect";
    next.prompt = String(Object.prototype.hasOwnProperty.call(draftValues, "prompt") ? draftValues.prompt : next.prompt || "Gebruik").trim() || "Gebruik";
    next.radius = Number.isFinite(Number(next.radius)) ? Number(next.radius) : 2;
    next.enabled = next.enabled !== false;
  } else if (kind === "npc") {
    next.componentId = normalizeCanonicalId(next.componentId || "", "") || uniqueCanonicalGraphValue(graph, "component.npc." + objectFunctionModelStem(context.model));
    next.level = Number.isFinite(Number(next.level)) ? Number(next.level) : 1;
    next.persistenceScope = String(next.persistenceScope || "disposable").trim() || "disposable";
    next.npcRef = normalizeCanonicalId(next.npcRef || "", "");
    next.variantRef = normalizeCanonicalId(next.variantRef || "", "") || null;
  } else if (kind === "enemy") {
    next.componentId = normalizeCanonicalId(next.componentId || "", "") || uniqueCanonicalGraphValue(graph, "component.enemy." + objectFunctionModelStem(context.model));
    next.levelMode = String(next.levelMode || "fixed").trim() || "fixed";
    next.fixedLevel = Number.isFinite(Number(next.fixedLevel)) ? Number(next.fixedLevel) : 1;
    next.minimumLevelOverride = Number.isFinite(Number(next.minimumLevelOverride)) ? Number(next.minimumLevelOverride) : 0;
    next.maximumLevelOverride = Number.isFinite(Number(next.maximumLevelOverride)) ? Number(next.maximumLevelOverride) : 0;
    next.enemyRef = normalizeCanonicalId(next.enemyRef || "", "");
    next.variantRef = normalizeCanonicalId(next.variantRef || "", "") || null;
    next.difficultyRef = normalizeCanonicalId(next.difficultyRef || "", "") || null;
  } else if (kind === "quest") {
    const modelTitle = objectFunctionModelTitle(context);
    next.targetId = normalizeCanonicalId(next.targetId || "", "") || uniqueCanonicalGraphValue(graph, "target." + objectFunctionModelStem(context.model) + ".quest");
    next.label = String(Object.prototype.hasOwnProperty.call(draftValues, "label") ? draftValues.label : next.label || modelTitle).trim() || modelTitle;
    next.targetKind = String(next.targetKind || (context.npcComponent ? "npc" : (context.enemyComponent ? "custom" : "marker"))).trim() || "marker";
    next.zoneRef = normalizeCanonicalId(context.zoneDefinition?.values?.zoneId || "", "") || null;
    next.entityRef = normalizeCanonicalId(context.assembly?.values?.entityId || objectFunctionAssemblyEntityId(context.model, graph), "");
    next.action = String(Object.prototype.hasOwnProperty.call(draftValues, "action") ? draftValues.action : existingNode?.values?.action || "").trim();
    next.prompt = String(Object.prototype.hasOwnProperty.call(draftValues, "prompt") ? draftValues.prompt : existingNode?.values?.prompt || "").trim();
    next.radius = Number.isFinite(Number(next.radius)) ? Number(next.radius) : 2.5;
    next.visibleInGame = next.visibleInGame !== false;
    next.targetTags = Array.isArray(next.targetTags) ? next.targetTags : [];
    next.x = Number.isFinite(Number(context.model?.values?.x)) ? Number(context.model.values.x) : (Number.isFinite(Number(next.x)) ? Number(next.x) : 0);
    next.y = Number.isFinite(Number(context.model?.values?.y)) ? Number(context.model.values.y) : (Number.isFinite(Number(next.y)) ? Number(next.y) : 0);
    next.z = Number.isFinite(Number(context.model?.values?.z)) ? Number(context.model.values.z) : (Number.isFinite(Number(next.z)) ? next.z : 0);
  }
  return next;
}

function objectFunctionNextGraphMutation(context, draft) {
  const nextGraph = cloneGraphForRestore(state.graph);
  const nextContextModel = nextGraph.nodes.find(function (node) {
    return node.id === context.model.id;
  }) || null;
  const nextZoneOutput = context.zoneOutput ? (nextGraph.nodes.find(function (node) {
    return node.id === context.zoneOutput.id;
  }) || null) : null;
  if (!nextContextModel || !nextZoneOutput) {
    return { nextGraph: null, focusNodeId: null, historyLabel: "" };
  }
  const nextContext = objectFunctionContextForModel(nextContextModel, nextGraph);
  const existingAssembly = objectFunctionAssemblyForModel(nextContextModel, nextGraph);
  const assembly = objectFunctionEnsureAssemblyNode(nextGraph, nextContext);
  objectFunctionEnsureAssemblyRouting(nextGraph, nextContext, assembly, nextZoneOutput);
  const kind = draft.kind;
  const type = objectFunctionNodeTypeForKind(kind);
  const existingNode = objectFunctionExistingNodeForKind(nextContext, kind) && nextGraph.nodes.find(function (node) {
    return node.id === objectFunctionExistingNodeForKind(nextContext, kind).id;
  }) || null;
  let node = existingNode || null;
  const title = objectFunctionGraphTitleForKind(kind, nextContext);

  if (kind === "interaction" || kind === "npc" || kind === "enemy" || kind === "quest") {
    if (!node) {
      node = {
        id: createZoneGraphId("node_" + type),
        type: type,
        title: title,
        x: objectFunctionSuggestedNodePosition(kind, nextContext, nextGraph).x,
        y: objectFunctionSuggestedNodePosition(kind, nextContext, nextGraph).y,
        parentId: nextContextModel.parentId || null,
        values: objectFunctionBuildNodeValuesForKind(kind, nextContext, draft, null, nextGraph)
      };
      nextGraph.nodes.push(node);
    } else {
      node.title = title;
      node.parentId = nextContextModel.parentId || null;
      node.values = objectFunctionBuildNodeValuesForKind(kind, nextContext, draft, node, nextGraph);
    }
  }

  if (kind === "interaction" || kind === "npc" || kind === "enemy") {
    if (node) {
      let keptComponentEdgeId = null;
      objectFunctionRemoveEdges(nextGraph, function (edge) {
        if (edge.fromNodeId !== node.id || edge.fromPort !== "component" || edge.toNodeId !== assembly.id || edge.toPort !== "components") return false;
        if (!keptComponentEdgeId) {
          keptComponentEdgeId = edge.id;
          return false;
        }
        return true;
      });
      pushEdgeIfMissing(nextGraph, node.id, "component", assembly.id, "components");
    }
  } else if (kind === "quest") {
    if (node) {
      nextGraph.edges = nextGraph.edges.filter(function (edge) {
        return !(edge.fromNodeId === assembly.id && edge.fromPort === "entity" && edge.toNodeId === node.id && edge.toPort === "entity");
      });
      nextGraph.edges = nextGraph.edges.filter(function (edge) {
        return !(edge.fromNodeId === node.id && edge.fromPort === "questTarget" && edge.toNodeId === nextZoneOutput.id && edge.toPort === "questTargets");
      });
      pushEdgeIfMissing(nextGraph, assembly.id, "entity", node.id, "entity");
      pushEdgeIfMissing(nextGraph, node.id, "questTarget", nextZoneOutput.id, "questTargets");
    }
  }

  objectFunctionApplyRecipeLayout(nextGraph, { model: nextContextModel, zoneOutput: nextZoneOutput });

  const focusNodeId = node ? node.id : assembly.id;
  return {
    nextGraph: nextGraph,
    focusNodeId: focusNodeId,
    historyLabel: objectFunctionTitleForKind(kind, nextContext)
  };
}

function objectFunctionCanConfirmDraft(context, draft) {
  if (!context?.model || !context.zoneGroup || !context.zoneOutput || !context.canCreate) return false;
  if (context.issues.some(function (issue) {
    return ["selection", "parent", "zone", "output", "assembly", "conflict"].includes(issue.kind);
  })) return false;
  if (!draft) return false;
  if (draft.kind === "npc") {
    const field = state.nodeTypes?.npc_component?.fields?.npcRef || {};
    return referencePickerChoiceState(draft.values?.npcRef, field).state === "ok";
  }
  if (draft.kind === "enemy") {
    const field = state.nodeTypes?.enemy_component?.fields?.enemyRef || {};
    return referencePickerChoiceState(draft.values?.enemyRef, field).state === "ok";
  }
  return true;
}

async function objectFunctionCommitDraft(context) {
  const draft = objectFunctionDraftForContext(context);
  if (!draft) return;
  if (!objectFunctionCanConfirmDraft(context, draft)) {
    if (draft.kind === "npc") {
      setStatus("Kies eerst een NPC Definition in de Catalog.", "error");
    } else if (draft.kind === "enemy") {
      setStatus("Kies eerst een Enemy Definition in de Catalog.", "error");
    } else {
      setStatus("Deze functie kan nu nog niet worden opgeslagen.", "error");
    }
    return;
  }
  const next = objectFunctionNextGraphMutation(context, draft);
  if (!next.nextGraph) {
    setStatus("Deze functie kan niet worden opgeslagen in de huidige Zone Canvas.", "error");
    return;
  }
  if (draft.kind === "interaction" && JSON.stringify(snapshotGraph(state.graph)) === JSON.stringify(snapshotGraph(next.nextGraph))) {
    objectFunctionClearDraft();
    if (next.focusNodeId) focusGraphNode(next.focusNodeId);
    setStatus("Interactable ongewijzigd.", "success");
    return;
  }
  try {
    await restoreGraphObject(next.nextGraph, {
      historyLabel: next.historyLabel || "Objectfunctie opgeslagen",
      selectedNodeIds: [context.model.id],
      selectedEdgeIds: [],
      refreshViewport: true,
      refreshValidation: true,
      afterApply: function () {
        objectFunctionClearDraft();
        if (next.focusNodeId) focusGraphNode(next.focusNodeId);
        setStatus(next.historyLabel + ".", "success");
      }
    });
  } finally {
    renderAuthoringHub();
  }
}

function objectFunctionAssemblyShouldRemain(graph, context, assembly) {
  if (!assembly || !context?.model || !context.zoneOutput) return false;
  return (graph.edges || []).some(function (edge) {
    if (edge.fromNodeId !== assembly.id && edge.toNodeId !== assembly.id) return false;
    if (edge.fromNodeId === context.model.id && edge.fromPort === "entity" && edge.toNodeId === assembly.id && edge.toPort === "model") {
      return false;
    }
    if (edge.fromNodeId === assembly.id && edge.fromPort === "entity" && edge.toNodeId === context.zoneOutput.id && edge.toPort === "entities") {
      return false;
    }
    return true;
  });
}

async function objectFunctionDeleteKind(kind, context) {
  const node = objectFunctionExistingNodeForKind(context, kind);
  if (!node) return;
  const nextGraph = cloneGraphForRestore(state.graph);
  const nextContextModel = nextGraph.nodes.find(function (candidate) {
    return candidate.id === context.model.id;
  }) || null;
  const nextZoneOutput = context.zoneOutput ? (nextGraph.nodes.find(function (candidate) {
    return candidate.id === context.zoneOutput.id;
  }) || null) : null;
  const assembly = objectFunctionAssemblyForModel(nextContextModel || context.model, nextGraph);
  const nextNode = nextGraph.nodes.find(function (candidate) {
    return candidate.id === node.id;
  }) || null;
  if (!nextContextModel || !nextZoneOutput || !assembly || !nextNode) return;
  objectFunctionRemoveNodeAndEdges(nextGraph, nextNode.id);
  if (objectFunctionAssemblyShouldRemain(nextGraph, context, assembly)) {
    objectFunctionEnsureAssemblyRouting(nextGraph, context, assembly, nextZoneOutput);
    objectFunctionApplyRecipeLayout(nextGraph, { model: nextContextModel, zoneOutput: nextZoneOutput });
  } else {
    objectFunctionRemoveNodeAndEdges(nextGraph, assembly.id);
    nextGraph.edges = nextGraph.edges.filter(function (edge) {
      return !(edge.fromNodeId === nextContextModel.id && edge.fromPort === "entity" && edge.toPort === "model");
    });
    nextGraph.edges = nextGraph.edges.filter(function (edge) {
      return !(edge.fromNodeId === nextContextModel.id && edge.fromPort === "entity" && edge.toNodeId === nextZoneOutput.id && edge.toPort === "entities");
    });
    pushEdgeIfMissing(nextGraph, nextContextModel.id, "entity", nextZoneOutput.id, "entities");
    const columns = objectFunctionRecipeColumns({ model: nextContextModel, zoneOutput: nextZoneOutput }, nextGraph);
    objectFunctionSetNodeGraphPosition(nextContextModel, { x: columns.sourceX, y: objectFunctionRecipeBaseY({ model: nextContextModel, zoneOutput: nextZoneOutput }, nextGraph) });
  }
  try {
    await restoreGraphObject(nextGraph, {
      historyLabel: objectFunctionTitleForKind(kind, context) + " verwijderd",
      selectedNodeIds: [context.model.id],
      selectedEdgeIds: [],
      refreshViewport: true,
      refreshValidation: true,
      afterApply: function () {
        objectFunctionClearDraft();
        const focusNodeId = objectFunctionAssemblyForModel(context.model, state.graph)?.id || context.model.id;
        focusGraphNode(focusNodeId);
        setStatus(objectFunctionKindLabel(kind) + " verwijderd.", "success");
      }
    });
  } finally {
    renderAuthoringHub();
  }
}

function objectFunctionDraftFieldRow(labelText, control, hintText = "") {
  const wrap = document.createElement("div");
  wrap.className = "objectFunctionDraftField";
  const label = document.createElement("label");
  label.textContent = labelText;
  label.appendChild(control);
  wrap.appendChild(label);
  if (hintText) {
    const hint = document.createElement("div");
    hint.className = "objectFunctionDraftHint";
    hint.textContent = hintText;
    wrap.appendChild(hint);
  }
  return wrap;
}

function objectFunctionDraftTextInput(draft, key, options = {}) {
  const input = document.createElement("input");
  input.type = "text";
  input.spellcheck = false;
  input.autocomplete = "off";
  input.autocapitalize = "none";
  input.value = String(draft.values?.[key] || "");
  input.placeholder = options.placeholder || "";
  input.addEventListener("change", function () {
    objectFunctionSetDraftValue(key, input.value);
    if (typeof options.onChange === "function") options.onChange(input.value);
    renderAuthoringHub();
  });
  return input;
}

function objectFunctionDraftNumberInput(draft, key, options = {}) {
  const input = document.createElement("input");
  input.type = "number";
  if (options.step !== undefined) input.step = String(options.step);
  if (options.min !== undefined) input.min = String(options.min);
  if (options.max !== undefined) input.max = String(options.max);
  input.value = String(draft.values?.[key] ?? "");
  input.addEventListener("change", function () {
    objectFunctionSetDraftValue(key, input.value === "" ? null : Number(input.value));
    if (typeof options.onChange === "function") options.onChange(input.value);
    renderAuthoringHub();
  });
  return input;
}

function objectFunctionDraftSelectInput(draft, key, options = {}) {
  const select = document.createElement("select");
  for (const option of Array.isArray(options.options) ? options.options : []) {
    const item = document.createElement("option");
    if (option && typeof option === "object") {
      item.value = String(option.value);
      item.textContent = String(option.label || option.value || "");
    } else {
      item.value = String(option);
      item.textContent = String(option);
    }
    select.appendChild(item);
  }
  select.value = String(draft.values?.[key] || options.fallback || "");
  select.addEventListener("change", function () {
    objectFunctionSetDraftValue(key, select.value);
    if (typeof options.onChange === "function") options.onChange(select.value);
    renderAuthoringHub();
  });
  return select;
}

function objectFunctionDraftCheckboxInput(draft, key, options = {}) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = draft.values?.[key] === true;
  input.addEventListener("change", function () {
    objectFunctionSetDraftValue(key, input.checked);
    if (typeof options.onChange === "function") options.onChange(input.checked);
    renderAuthoringHub();
  });
  return input;
}

function objectFunctionDraftReferenceInput(kind, fieldName, draft, onChange, options = {}) {
  const type = objectFunctionNodeTypeForKind(kind);
  const field = state.nodeTypes?.[type]?.fields?.[fieldName] || {};
  const fakeNode = { id: "object-function-" + kind + "-" + fieldName, type: type, values: {} };
  return buildReferencePickerField(fakeNode, fieldName, field, draft.values?.[fieldName] || null, {
    onChange: function (nextValue) {
      objectFunctionSetDraftValue(fieldName, nextValue);
      if (typeof onChange === "function") onChange(nextValue);
    },
    onFocusNode: options.onFocusNode,
    openCatalogAction: options.openCatalogAction,
    hideAdvanced: true
  });
}

function renderObjectFunctionSection(context) {
  const wrap = document.createElement("div");
  wrap.className = "objectFunctionSection";

  const header = document.createElement("div");
  header.className = "objectFunctionHeader";
  const title = document.createElement("div");
  title.className = "objectFunctionTitle";
  title.textContent = "Geef dit object een functie";
  const intro = document.createElement("div");
  intro.className = "objectFunctionIntro";
  intro.textContent = context?.model
    ? "Kies een functie. Bestaande nodes worden hergebruikt; de editor maakt nooit een tweede eigenaar van hetzelfde model."
    : "Selecteer precies één model in de 3D-viewport.";
  header.append(title, intro);
  wrap.appendChild(header);

  if (!context?.model || !context.zoneGroup || !context.zoneOutput) {
    const issueBox = document.createElement("div");
    issueBox.className = "objectFunctionIssues";
    const issueTitle = document.createElement("div");
    issueTitle.className = "objectFunctionIssueTitle";
    issueTitle.textContent = "Waarom dit nu niet kan:";
    issueBox.appendChild(issueTitle);
    for (const issue of context?.issues || [{ message: "Selecteer precies één model." }]) {
      const row = document.createElement("div");
      row.className = "objectFunctionIssue";
      row.textContent = issue.message;
      issueBox.appendChild(row);
    }
    const navRow = document.createElement("div");
    navRow.className = "objectFunctionNavRow";
    const nav = document.createElement("button");
    nav.type = "button";
    nav.className = "mini";
    nav.textContent = "Open Zone Canvas";
    const navTarget = context?.navigationZoneGroup || context?.zoneGroup || firstZoneCanvasGroup(state.graph);
    nav.disabled = !Boolean(navTarget);
    nav.addEventListener("click", function () {
      objectFunctionNavigateToZone(context);
    });
    navRow.appendChild(nav);
    issueBox.appendChild(navRow);
    wrap.appendChild(issueBox);
    return wrap;
  }

  const meta = document.createElement("div");
  meta.className = "objectFunctionMeta";
  meta.textContent = "Zone Canvas: " + nodeDisplayTitle(context.zoneGroup) + " · Zone Output: aanwezig";
  wrap.appendChild(meta);
  wrap.appendChild(renderObjectFunctionReadOnlyInfo(context));

  const flow = document.createElement("div");
  flow.className = "objectFunctionFlow";
  const makeChip = function (text, tone) {
    const chip = document.createElement("span");
    chip.className = "objectFunctionFlowChip" + (tone ? " objectFunctionFlowChip--" + tone : "");
    chip.textContent = text;
    return chip;
  };
  flow.appendChild(makeChip("model_entity", "model"));
  flow.appendChild(makeChip("entity_assembly", context.assembly ? "assembly" : "pending"));
  flow.appendChild(makeChip("Zone Output", "output"));
  if (context.questBinding) {
    flow.appendChild(makeChip("quest_target_binding", "quest"));
  }
  wrap.appendChild(flow);

  if (context.questBinding) {
    const shortcuts = document.createElement("div");
    shortcuts.className = "objectFunctionActions";
    const questShortcut = document.createElement("button");
    questShortcut.type = "button";
    questShortcut.className = "objectFunctionActionButton";
    questShortcut.textContent = "Nieuwe Quest voor " + objectFunctionModelTitle(context);
    questShortcut.title = "Kies eerst een bestaande Campaign; de Quest Target wordt automatisch ingevuld.";
    questShortcut.addEventListener("click", function () {
      questTimelineStartFromObjectFunction("quest", context);
    });
    const dialogueShortcut = document.createElement("button");
    dialogueShortcut.type = "button";
    dialogueShortcut.className = "objectFunctionActionButton";
    dialogueShortcut.textContent = "Nieuwe Dialoog voor " + objectFunctionModelTitle(context);
    dialogueShortcut.title = "Kies eerst een bestaande Campaign; de spreker wordt automatisch ingevuld.";
    dialogueShortcut.addEventListener("click", function () {
      questTimelineStartFromObjectFunction("dialogue", context);
    });
    shortcuts.append(questShortcut, dialogueShortcut);
    wrap.appendChild(shortcuts);
  } else if (context.model && context.zoneGroup && context.zoneOutput) {
    const hint = document.createElement("div");
    hint.className = "objectFunctionDraftHint";
    hint.textContent = "Maak dit object eerst een Quest Target om er direct een quest of dialoog voor te starten.";
    wrap.appendChild(hint);
  }

  const actions = document.createElement("div");
  actions.className = "objectFunctionActions";
  const availableKinds = ["interaction", "npc", "enemy", "quest"].filter(function (kind) {
    if (kind === "npc" && context.enemyComponent && !context.npcComponent) return false;
    if (kind === "enemy" && context.npcComponent && !context.enemyComponent) return false;
    return true;
  });
  for (const kind of availableKinds) {
    const existing = objectFunctionExistingNodeForKind(context, kind);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "objectFunctionActionButton" + (existing ? " objectFunctionActionButton--manage" : "");
    button.disabled = !objectFunctionCanCreateKind(context, kind);
    button.textContent = existing ? objectFunctionTitleForKind(kind, context) : ("Maak " + objectFunctionKindLabel(kind));
    button.title = existing ? "Bewerk en focus de bestaande node." : ("Maak een " + objectFunctionKindLabel(kind).toLowerCase() + " voor dit object.");
    button.addEventListener("click", function () {
      objectFunctionBeginDraft(kind, context);
      const focusNodeId = objectFunctionFocusNodeIdForKind(context, kind);
      if (focusNodeId) focusGraphNode(focusNodeId);
    });
    actions.appendChild(button);
  }
  if (actions.childNodes.length) wrap.appendChild(actions);

  const badges = document.createElement("div");
  badges.className = "objectFunctionBadgeRow";
  const kinds = [
    ["interaction", context.interactionComponent],
    ["npc", context.npcComponent],
    ["enemy", context.enemyComponent],
    ["quest", context.questBinding]
  ];
  for (const [kind, node] of kinds) {
    if (!node) continue;
    const isActive = Boolean(state.objectFunctionDraft && state.objectFunctionDraft.modelId === context.model.id && state.objectFunctionDraft.kind === kind);
    const badge = document.createElement("div");
    badge.className = "objectFunctionBadge" + (isActive ? " objectFunctionBadge--active" : "");
    badge.tabIndex = 0;
    badge.addEventListener("click", function () {
      focusGraphNode(node.id);
    });
    badge.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      focusGraphNode(node.id);
    });
    const accent = document.createElement("span");
    accent.className = "objectFunctionBadgeAccent";
    accent.style.background = objectFunctionBadgeAccent(kind);
    const body = document.createElement("div");
    body.className = "objectFunctionBadgeBody";
    const label = document.createElement("div");
    label.className = "objectFunctionBadgeLabel";
    label.textContent = objectFunctionKindLabel(kind);
    const metaText = document.createElement("div");
    metaText.className = "objectFunctionBadgeMeta";
    metaText.textContent = nodeDisplayTitle(node);
    body.append(label, metaText);
    const buttons = document.createElement("div");
    buttons.className = "objectFunctionBadgeButtons";
    const manage = document.createElement("button");
    manage.type = "button";
    manage.className = "mini";
    manage.textContent = "Beheren";
    manage.disabled = !objectFunctionCanCreateKind(context, kind);
    manage.title = manage.disabled
      ? "Los eerst de ontbrekende context op."
      : "Open de minimale editor voor deze functie.";
    manage.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      objectFunctionBeginDraft(kind, context);
      focusGraphNode(node.id);
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "deleteNode";
    remove.textContent = "Verwijderen";
    remove.title = "Verwijder alleen deze functie.";
    remove.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      void objectFunctionDeleteKind(kind, context);
    });
    buttons.append(manage, remove);
    badge.append(accent, body, buttons);
    badges.appendChild(badge);
  }
  if (badges.childNodes.length) wrap.appendChild(badges);

  const draft = objectFunctionDraftForContext(context);
  if (draft) {
    const draftWrap = document.createElement("div");
    draftWrap.className = "objectFunctionDraftCard";
    const draftTitle = document.createElement("div");
    draftTitle.className = "objectFunctionDraftTitle";
    draftTitle.textContent = objectFunctionTitleForKind(draft.kind, context);
    draftWrap.appendChild(draftTitle);

    const draftHint = document.createElement("div");
    draftHint.className = "objectFunctionDraftHint";
    draftHint.textContent = draft.kind === "quest"
      ? "De zone- en entitykoppeling worden automatisch afgeleid uit de huidige selectie."
      : "Kies alleen de minimale velden. De editor maakt en verbindt de rest atomaire.";
    draftWrap.appendChild(draftHint);

    const fields = document.createElement("div");
    fields.className = "objectFunctionDraftFields";
    if (draft.kind === "interaction") {
      fields.append(
        objectFunctionDraftFieldRow("Type", objectFunctionDraftSelectInput(draft, "interactionType", {
          options: [
            { value: "inspect", label: "inspect" },
            { value: "talk", label: "talk" },
            { value: "loot", label: "loot" },
            { value: "open", label: "open" },
            { value: "craft", label: "craft" },
            { value: "custom", label: "custom" }
          ]
        })),
        objectFunctionDraftFieldRow("Prompt", objectFunctionDraftTextInput(draft, "prompt", { placeholder: "Gebruik" })),
        objectFunctionDraftFieldRow("Radius", objectFunctionDraftNumberInput(draft, "radius", { min: 0.1, max: 100, step: 0.1 })),
        objectFunctionDraftFieldRow("Enabled", objectFunctionDraftCheckboxInput(draft, "enabled"))
      );
    } else if (draft.kind === "npc") {
      const npcField = objectFunctionDraftReferenceInput("npc", "npcRef", draft, null, {
        openCatalogAction: function () {
          objectFunctionOpenCatalog();
        }
      });
      fields.append(
        objectFunctionDraftFieldRow("NPC Definition", npcField, "Kies een bestaande NPC Definition uit de Catalog."),
        objectFunctionDraftFieldRow("Level", objectFunctionDraftNumberInput(draft, "level", { min: 1, max: 1000, step: 1 })),
        objectFunctionDraftFieldRow("Persistence", objectFunctionDraftSelectInput(draft, "persistenceScope", {
          options: [
            { value: "disposable", label: "disposable" },
            { value: "zone", label: "zone" },
            { value: "world", label: "world" }
          ]
        }))
      );
    } else if (draft.kind === "enemy") {
      const enemyField = objectFunctionDraftReferenceInput("enemy", "enemyRef", draft, null, {
        openCatalogAction: function () {
          objectFunctionOpenCatalog();
        }
      });
      fields.append(
        objectFunctionDraftFieldRow("Enemy Definition", enemyField, "Kies een bestaande Enemy Definition uit de Catalog."),
        objectFunctionDraftFieldRow("Level mode", objectFunctionDraftSelectInput(draft, "levelMode", {
          options: [
            { value: "fixed", label: "fixed" },
            { value: "zone_range", label: "zone_range" },
            { value: "area_range", label: "area_range" },
            { value: "player_clamped", label: "player_clamped" },
            { value: "party_clamped", label: "party_clamped" }
          ]
        }))
      );
      if (String(draft.values?.levelMode || "fixed") === "fixed") {
        fields.append(
          objectFunctionDraftFieldRow("Fixed level", objectFunctionDraftNumberInput(draft, "fixedLevel", { min: 1, max: 1000, step: 1 }))
        );
      }
      fields.append(
        objectFunctionDraftFieldRow("Variant", objectFunctionDraftReferenceInput("enemy", "variantRef", draft, null), "Optioneel."),
        objectFunctionDraftFieldRow("Difficulty", objectFunctionDraftReferenceInput("enemy", "difficultyRef", draft, null), "Optioneel.")
      );
    } else if (draft.kind === "quest") {
      const zoneState = referencePickerChoiceState(context.zoneDefinition?.values?.zoneId || "", state.nodeTypes?.quest_target_binding?.fields?.zoneRef || {});
      const entityState = referencePickerChoiceState(context.assembly?.values?.entityId || objectFunctionAssemblyEntityId(context.model, state.graph), state.nodeTypes?.quest_target_binding?.fields?.entityRef || {});
      const summary = document.createElement("div");
      summary.className = "objectFunctionDraftMeta";
      summary.textContent = "Afgeleid: Zone " + (zoneState.displayLabel || "onbekend") + " · Entity " + (entityState.displayLabel || "onbekend");
      fields.appendChild(summary);
      fields.append(
        objectFunctionDraftFieldRow("Naam", objectFunctionDraftTextInput(draft, "label", { placeholder: objectFunctionModelTitle(context) })),
        objectFunctionDraftFieldRow("Target kind", objectFunctionDraftSelectInput(draft, "targetKind", {
          options: [
            { value: "npc", label: "npc" },
            { value: "area", label: "area" },
            { value: "resource", label: "resource" },
            { value: "zone_link", label: "zone_link" },
            { value: "marker", label: "marker" },
            { value: "custom", label: "custom" }
          ]
        })),
        objectFunctionDraftFieldRow("Radius", objectFunctionDraftNumberInput(draft, "radius", { min: 0.1, max: 1000, step: 0.1 })),
        objectFunctionDraftFieldRow("Visible in game", objectFunctionDraftCheckboxInput(draft, "visibleInGame"))
      );
      const hasAction = String(draft.values?.action || draft.values?.prompt || "").trim().length > 0;
      if (hasAction || draft.values?.targetKind === "custom") {
        fields.append(
          objectFunctionDraftFieldRow("Action", objectFunctionDraftTextInput(draft, "action", { placeholder: "" })),
          objectFunctionDraftFieldRow("Prompt", objectFunctionDraftTextInput(draft, "prompt", { placeholder: "Gebruik" }))
        );
      }
    }
    draftWrap.appendChild(fields);

    const draftActions = document.createElement("div");
    draftActions.className = "objectFunctionDraftActions";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "primary";
    save.textContent = draft.existingNodeId ? "Wijzigingen opslaan" : "Maken";
    save.disabled = !objectFunctionCanConfirmDraft(context, draft);
    save.addEventListener("click", function () {
      void objectFunctionCommitDraft(context);
    });
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "ghost";
    cancel.textContent = "Annuleren";
    cancel.addEventListener("click", function () {
      objectFunctionClearDraft();
    });
    draftActions.append(save, cancel);
    draftWrap.appendChild(draftActions);
    if (!save.disabled) {
      const hint = document.createElement("div");
      hint.className = "objectFunctionDraftHint";
      hint.textContent = "De graph wordt in één stap opgeslagen. 3D-selectie blijft behouden.";
      draftWrap.appendChild(hint);
    }
    wrap.appendChild(draftWrap);
  }

  return wrap;
}

// ---------- Quest / Dialogue Timeline (AUTHORING-03) ----------
// Mirrors the objectFunction* recipe pattern (AUTHORING-02): every create/edit/delete
// builds one cloned graph, does at most one restoreGraphObject() call, and never nests
// applyGraphMutation/restoreGraphObject calls.

const QUEST_TIMELINE_STEP_SEQUENCE_SPACING = 10;
const QUEST_TIMELINE_STEP_COLUMN_STEP = NODE_WIDTH + OBJECT_RECIPE_COLUMN_GAP;
const QUEST_TIMELINE_ROW_HEIGHT = 260;
const QUEST_TIMELINE_CHILD_ROW_STEP = 120;
const QUEST_TIMELINE_QUEST_BASE_X = 40;
const QUEST_TIMELINE_QUEST_BASE_Y = 60;
const QUEST_TIMELINE_OUTPUT_Y = -220;
const QUEST_TIMELINE_DIALOGUE_BASE_X = QUEST_TIMELINE_QUEST_BASE_X + 20 * QUEST_TIMELINE_STEP_COLUMN_STEP;
const QUEST_TIMELINE_MAX_DIALOGUE_RENDER_DEPTH = 24;
const QUEST_TIMELINE_CAMPAIGN_PACKAGE_PORT = Object.freeze({
  id: "campaign_package",
  name: "campaignPackage",
  label: "Campaign Package",
  dataType: "campaignPackage",
  multiple: false
});

const QUEST_TIMELINE_CHILD_TYPE_OPTIONS = {
  objectives: [
    { type: "objective_talk", label: "Praat met target" },
    { type: "objective_collect", label: "Verzamel item" },
    { type: "objective_deliver", label: "Lever item in" },
    { type: "objective_reach", label: "Bereik locatie" }
  ],
  conditions: [
    { type: "condition_player_level", label: "Player level" },
    { type: "condition_has_item", label: "Heeft item" }
  ],
  actions: [
    { type: "action_give_currency", label: "Geef currency" },
    { type: "action_give_xp", label: "Geef XP" },
    { type: "action_unlock_ability", label: "Ontgrendel ability" },
    { type: "action_remove_item", label: "Verwijder item" },
    { type: "action_start_quest", label: "Start quest" }
  ],
  rewardBundle: [{ type: "reward_bundle", label: "Reward Bundle" }],
  rewardBundleChild: [
    { type: "action_give_currency", label: "Geef currency" },
    { type: "action_give_xp", label: "Geef XP" },
    { type: "action_unlock_ability", label: "Ontgrendel ability" },
    { type: "action_remove_item", label: "Verwijder item" },
    { type: "action_start_quest", label: "Start quest" }
  ],
  choices: [{ type: "dialogue_choice", label: "Keuze" }]
};

const QUEST_TIMELINE_SUPPORTED_CHILD_TYPES = new Set([
  "objective_talk",
  "objective_collect",
  "objective_deliver",
  "objective_reach",
  "condition_player_level",
  "condition_has_item",
  "action_give_currency",
  "action_give_xp",
  "action_unlock_ability",
  "action_remove_item",
  "action_start_quest",
  "reward_bundle",
  "dialogue_choice"
]);

// ---- Read helpers (graph structure -> UI data). No mutation. ----

function isCampaignGroupNode(node) {
  return Boolean(node) && node.type === "group" && normalizeEditorKey(node.values?.groupKind) === "campaign";
}

function currentCampaignGroupNode(graph = state.graph) {
  if (!state.currentGroupId) return null;
  const node = (graph.nodes || []).find(function (candidate) { return candidate.id === state.currentGroupId; });
  return isCampaignGroupNode(node) ? node : null;
}

function questTimelineQuestsInGroup(group, graph = state.graph) {
  if (!group) return [];
  return (graph.nodes || []).filter(function (node) {
    return node.type === "quest_definition" && (node.parentId || null) === group.id;
  }).sort(function (a, b) {
    return nodeDisplayTitle(a).localeCompare(nodeDisplayTitle(b), "nl", { sensitivity: "base" });
  });
}

function questTimelineDialoguesInGroup(group, graph = state.graph) {
  if (!group) return [];
  return (graph.nodes || []).filter(function (node) {
    return node.type === "dialogue_definition" && (node.parentId || null) === group.id;
  }).sort(function (a, b) {
    return nodeDisplayTitle(a).localeCompare(nodeDisplayTitle(b), "nl", { sensitivity: "base" });
  });
}

function questTimelineDirectSources(graph, targetNode, portName, expectedType) {
  if (!targetNode) return [];
  const edges = (graph.edges || []).filter(function (edge) {
    return edge.toNodeId === targetNode.id && edge.toPort === portName;
  });
  const nodes = edges.map(function (edge) {
    return (graph.nodes || []).find(function (node) { return node.id === edge.fromNodeId; }) || null;
  }).filter(function (node) {
    return node && (!expectedType || node.type === expectedType);
  });
  return Array.from(new Map(nodes.map(function (node) { return [node.id, node]; })).values());
}

function questTimelineEdgeMatches(edge, fromNodeId, fromPort, toNodeId, toPort) {
  return edge.fromNodeId === fromNodeId
    && edge.fromPort === fromPort
    && edge.toNodeId === toNodeId
    && edge.toPort === toPort;
}

function questTimelineEnsureSingleEdge(graph, fromNodeId, fromPort, toNodeId, toPort) {
  let keptEdge = null;
  graph.edges = (graph.edges || []).filter(function (edge) {
    if (!questTimelineEdgeMatches(edge, fromNodeId, fromPort, toNodeId, toPort)) return true;
    if (!keptEdge) {
      keptEdge = edge;
      return true;
    }
    return false;
  });
  if (keptEdge) return keptEdge;
  const edge = { id: createZoneGraphId("edge_quest_timeline"), fromNodeId, fromPort, toNodeId, toPort };
  graph.edges.push(edge);
  return edge;
}

function questTimelineStepsForQuest(quest, graph = state.graph) {
  const steps = questTimelineDirectSources(graph, quest, "steps", "quest_step");
  return steps.sort(function (a, b) {
    const ai = Number.isFinite(Number(a.values?.sequenceIndex)) ? Number(a.values.sequenceIndex) : 0;
    const bi = Number.isFinite(Number(b.values?.sequenceIndex)) ? Number(b.values.sequenceIndex) : 0;
    if (ai !== bi) return ai - bi;
    return String(a.id).localeCompare(String(b.id));
  });
}

function questTimelineObjectivesForStep(step, graph = state.graph) {
  return questTimelineDirectSources(graph, step, "objectives");
}
function questTimelineConditionsForStep(step, graph = state.graph) {
  return questTimelineDirectSources(graph, step, "conditions");
}
function questTimelineRewardsForStep(step, graph = state.graph) {
  return questTimelineDirectSources(graph, step, "rewards");
}
function questTimelineEntriesForDialogue(dialogue, graph = state.graph) {
  return questTimelineDirectSources(graph, dialogue, "entries");
}
function questTimelineChoicesForEntry(entry, graph = state.graph) {
  const choices = questTimelineDirectSources(graph, entry, "choices", "dialogue_choice");
  return choices.sort(function (a, b) {
    const ao = Number.isFinite(Number(a.values?.order)) ? Number(a.values.order) : 0;
    const bo = Number.isFinite(Number(b.values?.order)) ? Number(b.values.order) : 0;
    if (ao !== bo) return ao - bo;
    return String(a.id).localeCompare(String(b.id));
  });
}

function questTimelineEntryNodeByLocalId(dialogue, localId, graph = state.graph) {
  const canonical = normalizeCanonicalId(localId, "");
  if (!canonical) return null;
  const entries = questTimelineEntriesForDialogue(dialogue, graph);
  return entries.find(function (entry) {
    const idField = entry.type === "dialogue_terminal" ? "terminalId" : "entryId";
    return normalizeCanonicalId(entry.values?.[idField], "") === canonical;
  }) || null;
}

// ---- Layout helpers (fixed formulas, applied only at creation time - no continuous auto-layout) ----

function questTimelineSuggestedQuestPosition(graph, group) {
  const existingQuests = questTimelineQuestsInGroup(group, graph);
  if (!existingQuests.length) return { x: QUEST_TIMELINE_QUEST_BASE_X, y: QUEST_TIMELINE_QUEST_BASE_Y };
  const maxY = existingQuests.reduce(function (max, q) {
    const y = Number(q.y);
    return Number.isFinite(y) ? Math.max(max, y) : max;
  }, QUEST_TIMELINE_QUEST_BASE_Y - QUEST_TIMELINE_ROW_HEIGHT);
  return { x: QUEST_TIMELINE_QUEST_BASE_X, y: Math.round(maxY + QUEST_TIMELINE_ROW_HEIGHT) };
}

function questTimelineSuggestedDialoguePosition(graph, group) {
  const existing = questTimelineDialoguesInGroup(group, graph);
  if (!existing.length) return { x: QUEST_TIMELINE_DIALOGUE_BASE_X, y: QUEST_TIMELINE_QUEST_BASE_Y };
  const maxY = existing.reduce(function (max, d) {
    const y = Number(d.y);
    return Number.isFinite(y) ? Math.max(max, y) : max;
  }, QUEST_TIMELINE_QUEST_BASE_Y - QUEST_TIMELINE_ROW_HEIGHT);
  return { x: QUEST_TIMELINE_DIALOGUE_BASE_X, y: Math.round(maxY + QUEST_TIMELINE_ROW_HEIGHT) };
}

function questTimelineChildPortForCategory(category) {
  if (category === "objectives") return "objectives";
  if (category === "conditions") return "conditions";
  if (category === "actions") return "rewards";
  if (category === "rewardBundle") return "rewards";
  if (category === "rewardBundleChild") return "rewards";
  if (category === "choices") return "choices";
  return null;
}

function questTimelineChildOutputPort(type) {
  if (type.indexOf("objective_") === 0) return "objective";
  if (type.indexOf("condition_") === 0) return "condition";
  if (type === "reward_bundle") return "rewardEntry";
  if (type.indexOf("action_") === 0) return "rewardEntry";
  if (type === "dialogue_choice") return "dialogueChoice";
  return "";
}

function questTimelinePortDataType(nodeType, direction, portName) {
  const ports = state.nodeTypes?.[nodeType]?.[direction === "input" ? "inputs" : "outputs"] || {};
  return String(ports?.[portName]?.dataType || "").trim();
}

function questTimelineChildPortsCompatible(anchorNode, category, childType) {
  const toPort = questTimelineChildPortForCategory(category);
  const fromPort = questTimelineChildOutputPort(childType);
  if (!anchorNode || !toPort || !fromPort) return false;
  const inputType = questTimelinePortDataType(anchorNode.type, "input", toPort);
  const outputType = questTimelinePortDataType(childType, "output", fromPort);
  return Boolean(inputType && outputType && inputType === outputType);
}

function questTimelineStepTypeForObjective(objectiveType) {
  if (objectiveType === "objective_talk") return "talk";
  if (objectiveType === "objective_collect") return "collect";
  if (objectiveType === "objective_deliver") return "deliver";
  if (objectiveType === "objective_reach") return "reach";
  return "";
}

function questTimelineStepIdForNode(step) {
  return normalizeCanonicalId(step?.values?.stepId, "");
}

function questTimelineSuggestedChildPosition(graph, anchor, category) {
  const anchorX = Number(anchor.x) || 0;
  const anchorY = Number(anchor.y) || 0;
  const port = questTimelineChildPortForCategory(category);
  const existingCount = (graph.edges || []).filter(function (edge) {
    return edge.toNodeId === anchor.id && edge.toPort === port;
  }).length;
  if (category === "conditions") {
    return { x: anchorX, y: anchorY - QUEST_TIMELINE_CHILD_ROW_STEP * (existingCount + 1) };
  }
  if (category === "rewardBundleChild") {
    return { x: anchorX + QUEST_TIMELINE_STEP_COLUMN_STEP, y: anchorY + QUEST_TIMELINE_CHILD_ROW_STEP * existingCount };
  }
  if (category === "choices") {
    return { x: anchorX, y: anchorY + QUEST_TIMELINE_CHILD_ROW_STEP * (existingCount + 1) };
  }
  if (category === "objectives") {
    return { x: anchorX, y: anchorY + QUEST_TIMELINE_CHILD_ROW_STEP * (existingCount + 1) };
  }
  // actions / rewardBundle share the step's "rewards" port -> continue the same stack below objectives
  const objectivesCount = (graph.edges || []).filter(function (edge) {
    return edge.toNodeId === anchor.id && edge.toPort === "objectives";
  }).length;
  return { x: anchorX, y: anchorY + QUEST_TIMELINE_CHILD_ROW_STEP * (objectivesCount + existingCount + 1) };
}

// ---- Ensure helpers (find-or-create infra, idempotent - same pattern as objectFunctionEnsureAssemblyNode) ----

function questTimelineEnsureCampaignGroupOutput(graph, group) {
  if (!group) return null;
  group.values = Object.assign({}, group.values || {});
  const currentInterface = group.values.groupInterface && typeof group.values.groupInterface === "object"
    ? clonePlain(group.values.groupInterface)
    : { inputs: [], outputs: [] };
  currentInterface.inputs = Array.isArray(currentInterface.inputs) ? currentInterface.inputs : [];
  currentInterface.outputs = Array.isArray(currentInterface.outputs) ? currentInterface.outputs : [];
  let port = currentInterface.outputs.find(function (candidate) {
    return candidate && (candidate.name === "campaignPackage" || candidate.dataType === "campaignPackage");
  }) || null;
  if (!port) {
    port = clonePlain(QUEST_TIMELINE_CAMPAIGN_PACKAGE_PORT);
    currentInterface.outputs.push(port);
  }
  group.values.groupInterface = currentInterface;
  ensureGroupSystemNodesInGraph(graph, group.id);
  const groupOutput = (graph.nodes || []).find(function (node) {
    return node.parentId === group.id && node.type === "group_output";
  }) || null;
  return groupOutput && port?.name ? { node: groupOutput, portName: port.name } : null;
}

function questTimelineEnsureCampaignOutput(graph, group) {
  if (!group) return null;
  const groupOutput = questTimelineEnsureCampaignGroupOutput(graph, group);
  let output = (graph.nodes || []).find(function (node) {
    return node.type === "campaign_output" && (node.parentId || null) === group.id;
  }) || null;
  if (!output) {
    output = {
      id: createZoneGraphId("node_campaign_output"),
      type: "campaign_output",
      title: "Campaign Output",
      x: QUEST_TIMELINE_QUEST_BASE_X,
      y: QUEST_TIMELINE_OUTPUT_Y,
      parentId: group.id,
      values: Object.assign({}, objectFunctionDefaultValuesForNodeType("campaign_output"), {
        packageId: uniqueCanonicalGraphValue(graph, "package.campaign." + (slugifyGroupPortName(group.values?.title || group.title || "main") || "main"))
      })
    };
    graph.nodes.push(output);
  }
  if (groupOutput) {
    questTimelineEnsureSingleEdge(graph, output.id, "campaignPackage", groupOutput.node.id, groupOutput.portName);
  }
  return output;
}

// ---- Quest create / step insert / step delete ----

function questTimelineBeginQuestDraft(group) {
  const pending = state.questTimelinePendingTargetRef;
  const usePending = Boolean(pending && pending.intent === "quest");
  state.questTimelineDraft = {
    groupId: group.id,
    values: {
      displayName: "",
      summary: "",
      turnInTargetRef: usePending ? pending.targetId : "",
      minimumLevel: 1
    }
  };
  if (usePending) state.questTimelinePendingTargetRef = null;
  renderAuthoringHub();
}

function questTimelinePendingTargetLabel(intent) {
  const pending = state.questTimelinePendingTargetRef;
  if (!pending || pending.intent !== intent) return "";
  const field = { type: "reference", referenceKinds: ["target"], required: false };
  const refState = referencePickerChoiceState(pending.targetId, field);
  return refState.displayLabel || pending.targetId || "";
}

async function questTimelineCommitCreateQuest(group, draft) {
  const qFields = state.nodeTypes?.quest_definition?.fields || {};
  const displayName = normalizeFieldInputValue(qFields.displayName || { type: "text" }, draft.values?.displayName);
  if (isBlankValue(displayName)) { setStatus("Vul een questnaam in.", "error"); return; }
  const summary = normalizeFieldInputValue(qFields.summary || { type: "tokenText" }, draft.values?.summary);
  if (isBlankValue(summary)) { setStatus("Vul een korte omschrijving in.", "error"); return; }
  const turnInTargetRef = qFields.turnInTargetRef ? normalizeFieldInputValue(qFields.turnInTargetRef, draft.values?.turnInTargetRef) : null;
  const minimumLevel = qFields.minimumLevel ? normalizeFieldInputValue(qFields.minimumLevel, draft.values?.minimumLevel) : 1;

  const nextGraph = cloneGraphForRestore(state.graph);
  const nextGroup = nextGraph.nodes.find(function (node) { return node.id === group.id; }) || null;
  if (!nextGroup) { setStatus("Deze Campaign Group bestaat niet meer.", "error"); return; }
  const output = questTimelineEnsureCampaignOutput(nextGraph, nextGroup);
  const stem = slugifyGroupPortName(displayName) || "quest";
  const questId = uniqueCanonicalGraphValue(nextGraph, "quest." + stem);
  const questPosition = questTimelineSuggestedQuestPosition(nextGraph, nextGroup);
  const quest = {
    id: createZoneGraphId("node_quest_definition"),
    type: "quest_definition",
    title: displayName,
    x: questPosition.x,
    y: questPosition.y,
    parentId: nextGroup.id,
    values: Object.assign({}, objectFunctionDefaultValuesForNodeType("quest_definition"), {
      questId: questId,
      displayName: displayName,
      summary: summary,
      turnInTargetRef: turnInTargetRef || null,
      minimumLevel: Number.isFinite(Number(minimumLevel)) ? Math.max(1, Math.floor(Number(minimumLevel))) : 1
    })
  };
  nextGraph.nodes.push(quest);
  const stepId = uniqueCanonicalGraphValue(nextGraph, "quest_step." + stem + ".step_1");
  const step = {
    id: createZoneGraphId("node_quest_step"),
    type: "quest_step",
    title: "Stap 1",
    x: questPosition.x + QUEST_TIMELINE_STEP_COLUMN_STEP,
    y: questPosition.y,
    parentId: nextGroup.id,
    values: Object.assign({}, objectFunctionDefaultValuesForNodeType("quest_step"), {
      stepId: stepId,
      displayName: "Stap 1",
      stepType: "custom",
      sequenceIndex: QUEST_TIMELINE_STEP_SEQUENCE_SPACING
    })
  };
  nextGraph.nodes.push(step);
  quest.values.startStepRef = stepId;
  questTimelineEnsureSingleEdge(nextGraph, step.id, "questStep", quest.id, "steps");
  if (output) questTimelineEnsureSingleEdge(nextGraph, quest.id, "questDef", output.id, "quests");

  try {
    await restoreGraphObject(nextGraph, {
      historyLabel: "Nieuwe quest: " + displayName,
      selectedNodeIds: [quest.id],
      selectedEdgeIds: [],
      refreshViewport: false,
      refreshValidation: true,
      afterApply: function () {
        state.questTimelineDraft = null;
        state.questTimelineSelectedQuestId = quest.id;
        state.questTimelineSelectedStepId = step.id;
        focusGraphNode(quest.id);
        setStatus("Quest \"" + displayName + "\" aangemaakt.", "success");
      }
    });
  } finally {
    renderAuthoringHub();
  }
}

function questTimelineNextStepSequenceIndex(steps, insertIndex) {
  if (!steps.length) return QUEST_TIMELINE_STEP_SEQUENCE_SPACING;
  if (insertIndex <= 0) {
    const first = Number(steps[0].values?.sequenceIndex) || QUEST_TIMELINE_STEP_SEQUENCE_SPACING;
    return first > 1 ? Math.floor(first / 2) : null;
  }
  if (insertIndex >= steps.length) {
    const last = Number(steps[steps.length - 1].values?.sequenceIndex) || 0;
    return last + QUEST_TIMELINE_STEP_SEQUENCE_SPACING;
  }
  const before = Number(steps[insertIndex - 1].values?.sequenceIndex) || 0;
  const after = Number(steps[insertIndex].values?.sequenceIndex) || (before + QUEST_TIMELINE_STEP_SEQUENCE_SPACING);
  const mid = Math.floor((before + after) / 2);
  return mid > before ? mid : null;
}

function questTimelineRenumberSteps(steps) {
  steps.forEach(function (step, index) {
    step.values = Object.assign({}, step.values || {}, { sequenceIndex: (index + 1) * QUEST_TIMELINE_STEP_SEQUENCE_SPACING });
  });
}

async function questTimelineInsertStep(quest, insertIndex, displayNameInput) {
  const stepFields = state.nodeTypes?.quest_step?.fields || {};
  const name = normalizeFieldInputValue(stepFields.displayName || { type: "text" }, displayNameInput);
  if (isBlankValue(name)) { setStatus("Vul een stapnaam in.", "error"); return; }

  const nextGraph = cloneGraphForRestore(state.graph);
  const nextQuest = nextGraph.nodes.find(function (n) { return n.id === quest.id; }) || null;
  if (!nextQuest) { setStatus("Deze quest bestaat niet meer.", "error"); return; }
  let steps = questTimelineStepsForQuest(nextQuest, nextGraph);
  let seq = questTimelineNextStepSequenceIndex(steps, insertIndex);
  if (seq === null) {
    questTimelineRenumberSteps(steps);
    steps = questTimelineStepsForQuest(nextQuest, nextGraph);
    seq = questTimelineNextStepSequenceIndex(steps, insertIndex);
  }
  const stem = slugifyGroupPortName(nextQuest.values?.questId || nextQuest.values?.displayName || "quest");
  const stepId = uniqueCanonicalGraphValue(nextGraph, "quest_step." + stem + ".step_" + (steps.length + 1));
  const prev = insertIndex > 0 ? steps[insertIndex - 1] : null;
  const next = insertIndex < steps.length ? steps[insertIndex] : null;
  const baseY = (prev && Number.isFinite(Number(prev.y))) ? Number(prev.y)
    : (next && Number.isFinite(Number(next.y))) ? Number(next.y)
    : Number(nextQuest.y) || 0;
  const x = prev && next ? Math.round((Number(prev.x) + Number(next.x)) / 2)
    : prev ? Number(prev.x) + QUEST_TIMELINE_STEP_COLUMN_STEP
    : next ? Number(next.x) - QUEST_TIMELINE_STEP_COLUMN_STEP
    : Number(nextQuest.x) + QUEST_TIMELINE_STEP_COLUMN_STEP;
  const step = {
    id: createZoneGraphId("node_quest_step"),
    type: "quest_step",
    title: name,
    x: x,
    y: baseY,
    parentId: nextQuest.parentId || null,
    values: Object.assign({}, objectFunctionDefaultValuesForNodeType("quest_step"), {
      stepId: stepId,
      displayName: name,
      stepType: "custom",
      sequenceIndex: seq
    })
  };
  const nextStepId = questTimelineStepIdForNode(next);
  if (nextStepId) step.values.nextStepRef = nextStepId;
  if (!prev) {
    nextQuest.values = Object.assign({}, nextQuest.values || {}, { startStepRef: stepId });
  } else {
    const prevNextStepRef = normalizeCanonicalId(prev.values?.nextStepRef, "");
    if (!prevNextStepRef || prevNextStepRef === nextStepId) {
      prev.values = Object.assign({}, prev.values || {}, { nextStepRef: stepId });
    }
  }
  nextGraph.nodes.push(step);
  questTimelineEnsureSingleEdge(nextGraph, step.id, "questStep", nextQuest.id, "steps");

  try {
    await restoreGraphObject(nextGraph, {
      historyLabel: "Stap toegevoegd: " + name,
      selectedNodeIds: [step.id],
      selectedEdgeIds: [],
      refreshViewport: false,
      refreshValidation: true,
      afterApply: function () {
        state.questTimelineInsertDraft = null;
        state.questTimelineSelectedStepId = step.id;
        focusGraphNode(step.id);
        setStatus("Stap \"" + name + "\" toegevoegd.", "success");
      }
    });
  } finally {
    renderAuthoringHub();
  }
}

async function questTimelineDeleteStep(quest, step) {
  const nextGraph = cloneGraphForRestore(state.graph);
  const nextQuest = nextGraph.nodes.find(function (n) { return n.id === quest.id; }) || null;
  const nextStep = nextGraph.nodes.find(function (n) { return n.id === step.id; }) || null;
  if (!nextQuest || !nextStep) return;
  const removedStepRef = questTimelineStepIdForNode(nextStep);
  objectFunctionRemoveNodeAndEdges(nextGraph, nextStep.id);
  const remainingSteps = questTimelineStepsForQuest(nextQuest, nextGraph);
  if (normalizeCanonicalId(nextQuest.values?.startStepRef, "") === removedStepRef) {
    nextQuest.values = Object.assign({}, nextQuest.values || {}, {
      startStepRef: questTimelineStepIdForNode(remainingSteps[0]) || null
    });
  }
  for (const remainingStep of remainingSteps) {
    if (normalizeCanonicalId(remainingStep.values?.nextStepRef, "") === removedStepRef) {
      remainingStep.values = Object.assign({}, remainingStep.values || {}, { nextStepRef: null });
    }
  }
  try {
    await restoreGraphObject(nextGraph, {
      historyLabel: "Stap verwijderd: " + nodeDisplayTitle(step),
      selectedNodeIds: [quest.id],
      selectedEdgeIds: [],
      refreshViewport: false,
      refreshValidation: true,
      afterApply: function () {
        if (state.questTimelineSelectedStepId === step.id) state.questTimelineSelectedStepId = null;
        focusGraphNode(quest.id);
        setStatus("Stap verwijderd.", "success");
      }
    });
  } finally {
    renderAuthoringHub();
  }
}

// ---- Generic child draft (objectives / conditions / actions / reward bundle / bundle contents / dialogue choices) ----
// One mechanism reused everywhere a small typed node hangs off a "collection" port: create picks a type then
// fills its real fields; edit (Beheren) reopens the same form seeded from the existing node's values.

function questTimelineAvailableChildTypes(category, anchorNode) {
  return (QUEST_TIMELINE_CHILD_TYPE_OPTIONS[category] || []).filter(function (entry) {
    return Boolean(state.nodeTypes?.[entry.type])
      && QUEST_TIMELINE_SUPPORTED_CHILD_TYPES.has(entry.type)
      && (!anchorNode || questTimelineChildPortsCompatible(anchorNode, category, entry.type));
  });
}

function questTimelineOpenChildChooser(anchorId, category) {
  const anchor = (state.graph.nodes || []).find(function (node) { return node.id === anchorId; }) || null;
  const options = questTimelineAvailableChildTypes(category, anchor);
  if (!options.length) {
    setStatus("Geen ondersteunde keuze voor deze plek in de bestaande compiler/runtime.", "error");
    return;
  }
  state.questTimelineChildDraft = { anchorId: anchorId, category: category, type: null, values: {} };
  if (options.length === 1) {
    questTimelineChooseChildType(options[0].type);
    return;
  }
  renderAuthoringHub();
}

function questTimelineChooseChildType(type) {
  const draft = state.questTimelineChildDraft;
  if (!draft) return;
  const fields = state.nodeTypes?.[type]?.fields || {};
  const values = {};
  for (const [key, field] of Object.entries(fields)) {
    if (!field || field.type === "identity") continue;
    values[key] = field.default !== undefined ? clonePlain(field.default) : null;
  }
  draft.type = type;
  draft.values = values;
  renderAuthoringHub();
}

function questTimelineBeginChildEdit(anchorId, category, existingNode) {
  const fields = state.nodeTypes?.[existingNode.type]?.fields || {};
  const values = {};
  for (const [key, field] of Object.entries(fields)) {
    if (!field || field.type === "identity") continue;
    values[key] = existingNode.values?.[key] !== undefined ? clonePlain(existingNode.values[key]) : (field.default !== undefined ? clonePlain(field.default) : null);
  }
  state.questTimelineChildDraft = { anchorId: anchorId, category: category, type: existingNode.type, values: values, existingNodeId: existingNode.id };
  renderAuthoringHub();
}

function questTimelineComparableChildValues(type, values) {
  const fields = state.nodeTypes?.[type]?.fields || {};
  const comparable = {};
  for (const [key, field] of Object.entries(fields)) {
    if (!field || field.type === "identity") continue;
    const rawValue = values?.[key];
    if (field.type === "reference") {
      comparable[key] = normalizeCanonicalId(rawValue, "");
    } else if (field.type === "referenceList") {
      comparable[key] = normalizeReferenceList(Array.isArray(rawValue) ? rawValue : splitDelimitedValues(rawValue));
    } else if (field.type === "tagList") {
      comparable[key] = normalizeTagList(rawValue);
    } else if (field.type === "boolean") {
      comparable[key] = rawValue === true;
    } else if (field.type === "number") {
      const number = Number(rawValue);
      comparable[key] = Number.isFinite(number) ? number : Number(field.default || 0);
    } else {
      comparable[key] = rawValue === null || rawValue === undefined ? "" : String(rawValue);
    }
  }
  return JSON.stringify(comparable);
}

function questTimelineFindEquivalentChild(graph, anchor, category, type, values) {
  const port = questTimelineChildPortForCategory(category);
  if (!anchor || !port) return null;
  const wanted = questTimelineComparableChildValues(type, values);
  return questTimelineDirectSources(graph, anchor, port, type).find(function (candidate) {
    return questTimelineComparableChildValues(type, candidate.values || {}) === wanted;
  }) || null;
}

function questTimelineSyncStepFieldsForObjective(graph, anchor, child, category) {
  if (!graph || !anchor || !child || category !== "objectives" || anchor.type !== "quest_step") return;
  const nextStepType = questTimelineStepTypeForObjective(child.type);
  if (!nextStepType) return;
  const siblings = questTimelineDirectSources(graph, anchor, "objectives").filter(function (candidate) {
    return candidate.id !== child.id;
  });
  const siblingStepTypes = Array.from(new Set(siblings.map(function (candidate) {
    return questTimelineStepTypeForObjective(candidate.type);
  }).filter(Boolean)));
  const currentStepType = String(anchor.values?.stepType || "").trim();
  const knownRuntimeTypes = new Set(["talk", "collect", "deliver", "reach"]);
  const canSyncType = !siblings.length
    || !knownRuntimeTypes.has(currentStepType)
    || (siblingStepTypes.length === 1 && siblingStepTypes[0] === nextStepType);
  if (!canSyncType) return;
  const patch = { stepType: nextStepType };
  const targetRef = normalizeCanonicalId(child.values?.targetRef, "");
  const zoneRef = normalizeCanonicalId(child.values?.zoneRef, "");
  if (targetRef && (!siblings.length || !normalizeCanonicalId(anchor.values?.targetRef, ""))) patch.targetRef = targetRef;
  if (zoneRef && (!siblings.length || !normalizeCanonicalId(anchor.values?.zoneRef, ""))) patch.zoneRef = zoneRef;
  anchor.values = Object.assign({}, anchor.values || {}, patch);
}

function questTimelineChildDraftCanConfirm(draft) {
  if (!draft || !draft.type) return false;
  const anchor = (state.graph.nodes || []).find(function (node) { return node.id === draft.anchorId; }) || null;
  if (!anchor || !questTimelineChildPortsCompatible(anchor, draft.category, draft.type)) return false;
  const fields = state.nodeTypes?.[draft.type]?.fields || {};
  for (const [key, field] of Object.entries(fields)) {
    if (!field || field.type === "identity" || !field.required) continue;
    const value = draft.values?.[key];
    if (field.type === "reference") {
      if (referencePickerChoiceState(value, field).state !== "ok") return false;
    } else if (isBlankValue(value)) {
      return false;
    }
  }
  if (draft.type === "dialogue_choice" && ["accept_quest", "turn_in_quest"].includes(String(draft.values?.action || ""))) {
    const questField = fields.questRef || { type: "reference", referenceKinds: ["quest"], required: true };
    return referencePickerChoiceState(draft.values?.questRef, questField).state === "ok";
  }
  return true;
}

function questTimelineSetChildDraftValue(key, value) {
  if (!state.questTimelineChildDraft) return;
  state.questTimelineChildDraft.values = Object.assign({}, state.questTimelineChildDraft.values || {}, { [key]: value });
}

function questTimelineClearChildDraft() {
  state.questTimelineChildDraft = null;
  renderAuthoringHub();
}

async function questTimelineCommitChildDraft() {
  const draft = state.questTimelineChildDraft;
  if (!draft || !draft.type) return;
  const type = draft.type;
  const fields = state.nodeTypes?.[type]?.fields || {};
  const anchorNode = (state.graph.nodes || []).find(function (node) { return node.id === draft.anchorId; }) || null;
  if (!anchorNode || !questTimelineChildPortsCompatible(anchorNode, draft.category, type)) {
    setStatus("Deze node past niet op deze plek in het bestaande schema.", "error");
    return;
  }
  for (const [key, field] of Object.entries(fields)) {
    if (!field || field.type === "identity" || !field.required) continue;
    const value = draft.values?.[key];
    if (field.type === "reference") {
      if (referencePickerChoiceState(value, field).state !== "ok") {
        setStatus("Kies eerst een geldige " + (field.label || key) + ".", "error");
        return;
      }
    } else if (isBlankValue(value)) {
      setStatus("Vul " + (field.label || key) + " in.", "error");
      return;
    }
  }
  if (type === "dialogue_choice" && ["accept_quest", "turn_in_quest"].includes(String(draft.values?.action || ""))) {
    const questField = fields.questRef || { type: "reference", referenceKinds: ["quest"], required: true };
    if (referencePickerChoiceState(draft.values?.questRef, questField).state !== "ok") {
      setStatus("Kies eerst een bestaande quest voor deze dialoogkeuze.", "error");
      return;
    }
  }
  const nextGraph = cloneGraphForRestore(state.graph);
  const anchor = nextGraph.nodes.find(function (n) { return n.id === draft.anchorId; }) || null;
  if (!anchor) { setStatus("De bijbehorende node bestaat niet meer.", "error"); return; }
  let child = draft.existingNodeId ? (nextGraph.nodes.find(function (n) { return n.id === draft.existingNodeId; }) || null) : null;
  const isNew = !child;
  const label = state.nodeTypes[type]?.label || type;
  const normalizedValues = {};
  for (const [key, field] of Object.entries(fields)) {
    if (!field || field.type === "identity") continue;
    if (!Object.prototype.hasOwnProperty.call(draft.values || {}, key)) continue;
    normalizedValues[key] = normalizeFieldInputValue(field, draft.values[key]);
  }
  if (type === "dialogue_choice" && ["accept_quest", "close"].includes(String(normalizedValues.action || ""))) {
    normalizedValues.closeAfterSelect = true;
  }
  if (isNew) {
    const idFieldEntry = Object.entries(fields).find(function ([, f]) { return f?.type === "identity"; });
    const idField = idFieldEntry ? idFieldEntry[0] : null;
    const values = Object.assign({}, objectFunctionDefaultValuesForNodeType(type), normalizedValues);
    if (type === "dialogue_choice") {
      const existingChoiceCount = questTimelineDirectSources(nextGraph, anchor, "choices", "dialogue_choice").length;
      const defaultOrder = Number(fields.order?.default);
      if (!Number.isFinite(Number(values.order)) || Number(values.order) === defaultOrder) {
        values.order = existingChoiceCount + 1;
      }
    }
    const equivalent = questTimelineFindEquivalentChild(nextGraph, anchor, draft.category, type, values);
    if (equivalent) {
      state.questTimelineChildDraft = null;
      focusGraphNode(equivalent.id);
      setStatus("Dit onderdeel bestaat al bij deze stap/keuze; bestaand onderdeel geopend.", "");
      renderAuthoringHub();
      return;
    }
    if (idField) values[idField] = uniqueCanonicalGraphValue(nextGraph, String(fields[idField]?.default || type));
    const position = questTimelineSuggestedChildPosition(nextGraph, anchor, draft.category);
    child = { id: createZoneGraphId("node_" + type), type: type, title: label, x: position.x, y: position.y, parentId: anchor.parentId || null, values: values };
    nextGraph.nodes.push(child);
    questTimelineEnsureSingleEdge(nextGraph, child.id, questTimelineChildOutputPort(type), anchor.id, questTimelineChildPortForCategory(draft.category));
  } else {
    child.title = label;
    child.values = Object.assign({}, child.values || {}, normalizedValues);
  }
  questTimelineSyncStepFieldsForObjective(nextGraph, anchor, child, draft.category);

  try {
    await restoreGraphObject(nextGraph, {
      historyLabel: label + (isNew ? " toegevoegd" : " gewijzigd"),
      selectedNodeIds: [child.id],
      selectedEdgeIds: [],
      refreshViewport: false,
      refreshValidation: true,
      afterApply: function () {
        state.questTimelineChildDraft = null;
        focusGraphNode(child.id);
        setStatus(label + (isNew ? " toegevoegd." : " gewijzigd."), "success");
      }
    });
  } finally {
    renderAuthoringHub();
  }
}

async function questTimelineDeleteChildNode(anchorId, childNode) {
  const nextGraph = cloneGraphForRestore(state.graph);
  const nextChild = nextGraph.nodes.find(function (n) { return n.id === childNode.id; }) || null;
  if (!nextChild) return;
  const label = state.nodeTypes?.[childNode.type]?.label || childNode.type;
  objectFunctionRemoveNodeAndEdges(nextGraph, nextChild.id);
  try {
    await restoreGraphObject(nextGraph, {
      historyLabel: label + " verwijderd",
      selectedNodeIds: anchorId ? [anchorId] : [],
      selectedEdgeIds: [],
      refreshViewport: false,
      refreshValidation: true,
      afterApply: function () {
        if (state.questTimelineChildDraft?.existingNodeId === childNode.id) state.questTimelineChildDraft = null;
        if (anchorId) focusGraphNode(anchorId);
        setStatus(label + " verwijderd.", "success");
      }
    });
  } finally {
    renderAuthoringHub();
  }
}

// ---- Dialogue create / continue / choice / terminal ----

function questTimelineBeginDialogueDraft(group) {
  const pending = state.questTimelinePendingTargetRef;
  const usePending = Boolean(pending && pending.intent === "dialogue");
  state.questTimelineDialogueDraft = {
    groupId: group.id,
    values: {
      displayName: "",
      targetRef: usePending ? pending.targetId : "",
      firstText: ""
    }
  };
  if (usePending) state.questTimelinePendingTargetRef = null;
  renderAuthoringHub();
}

async function questTimelineCommitCreateDialogue(group, draft) {
  const dFields = state.nodeTypes?.dialogue_definition?.fields || {};
  const displayName = normalizeFieldInputValue(dFields.displayName || { type: "text" }, draft.values?.displayName);
  if (isBlankValue(displayName)) { setStatus("Vul een naam in.", "error"); return; }
  const targetField = dFields.targetRef || { type: "reference", referenceKinds: ["target"], required: true };
  const targetCheck = referencePickerChoiceState(draft.values?.targetRef, targetField);
  if (targetCheck.state !== "ok") { setStatus("Kies eerst een spreker (Quest Target).", "error"); return; }
  const entryFields = state.nodeTypes?.dialogue_entry?.fields || {};
  const firstText = normalizeFieldInputValue(entryFields.text || { type: "tokenText" }, draft.values?.firstText);
  if (isBlankValue(firstText)) { setStatus("Vul de eerste tekstregel in.", "error"); return; }

  const nextGraph = cloneGraphForRestore(state.graph);
  const nextGroup = nextGraph.nodes.find(function (n) { return n.id === group.id; }) || null;
  if (!nextGroup) { setStatus("Deze Campaign Group bestaat niet meer.", "error"); return; }
  const output = questTimelineEnsureCampaignOutput(nextGraph, nextGroup);
  const stem = slugifyGroupPortName(displayName) || "dialogue";
  const dialogueId = uniqueCanonicalGraphValue(nextGraph, "dialogue." + stem);
  const entryId = uniqueCanonicalGraphValue(nextGraph, "dialogue_entry." + stem + ".line_1");
  const position = questTimelineSuggestedDialoguePosition(nextGraph, nextGroup);
  const targetRef = normalizeCanonicalId(draft.values?.targetRef, "");
  const dialogue = {
    id: createZoneGraphId("node_dialogue_definition"),
    type: "dialogue_definition",
    title: displayName,
    x: position.x,
    y: position.y,
    parentId: nextGroup.id,
    values: Object.assign({}, objectFunctionDefaultValuesForNodeType("dialogue_definition"), {
      dialogueId: dialogueId,
      displayName: displayName,
      targetRef: targetRef
    })
  };
  nextGraph.nodes.push(dialogue);
  const entry = {
    id: createZoneGraphId("node_dialogue_entry"),
    type: "dialogue_entry",
    title: "Regel 1",
    x: position.x + QUEST_TIMELINE_STEP_COLUMN_STEP,
    y: position.y,
    parentId: nextGroup.id,
    values: Object.assign({}, objectFunctionDefaultValuesForNodeType("dialogue_entry"), {
      entryId: entryId,
      speakerName: targetCheck.displayLabel || "",
      text: firstText
    })
  };
  nextGraph.nodes.push(entry);
  dialogue.values.startEntryRef = entryId;
  questTimelineEnsureSingleEdge(nextGraph, entry.id, "dialogueEntry", dialogue.id, "entries");
  if (output) questTimelineEnsureSingleEdge(nextGraph, dialogue.id, "dialogueDef", output.id, "dialogues");

  try {
    await restoreGraphObject(nextGraph, {
      historyLabel: "Nieuwe dialoog: " + displayName,
      selectedNodeIds: [dialogue.id],
      selectedEdgeIds: [],
      refreshViewport: false,
      refreshValidation: true,
      afterApply: function () {
        state.questTimelineDialogueDraft = null;
        state.questTimelineSelectedDialogueId = dialogue.id;
        state.questTimelineSelectedEntryId = entry.id;
        focusGraphNode(dialogue.id);
        setStatus("Dialoog \"" + displayName + "\" aangemaakt.", "success");
      }
    });
  } finally {
    renderAuthoringHub();
  }
}

async function questTimelineAddDialogueEntry(dialogue, sourceNode, textInput) {
  const entryFields = state.nodeTypes?.dialogue_entry?.fields || {};
  const text = normalizeFieldInputValue(entryFields.text || { type: "tokenText" }, textInput);
  if (isBlankValue(text)) { setStatus("Vul een tekstregel in.", "error"); return; }

  const nextGraph = cloneGraphForRestore(state.graph);
  const nextDialogue = nextGraph.nodes.find(function (n) { return n.id === dialogue.id; }) || null;
  const nextSource = nextGraph.nodes.find(function (n) { return n.id === sourceNode.id; }) || null;
  if (!nextDialogue || !nextSource) { setStatus("Deze dialoog bestaat niet meer.", "error"); return; }
  const stem = slugifyGroupPortName(nextDialogue.values?.dialogueId || nextDialogue.values?.displayName || "dialogue");
  const existingEntries = questTimelineEntriesForDialogue(nextDialogue, nextGraph);
  const entryId = uniqueCanonicalGraphValue(nextGraph, "dialogue_entry." + stem + ".line_" + (existingEntries.length + 1));
  const entry = {
    id: createZoneGraphId("node_dialogue_entry"),
    type: "dialogue_entry",
    title: "Regel " + (existingEntries.length + 1),
    x: (Number(nextSource.x) || 0) + QUEST_TIMELINE_STEP_COLUMN_STEP,
    y: Number(nextSource.y) || 0,
    parentId: nextDialogue.parentId || null,
    values: Object.assign({}, objectFunctionDefaultValuesForNodeType("dialogue_entry"), { entryId: entryId, text: text })
  };
  nextGraph.nodes.push(entry);
  questTimelineEnsureSingleEdge(nextGraph, entry.id, "dialogueEntry", nextDialogue.id, "entries");
  if (nextSource.type === "dialogue_choice") {
    nextSource.values = Object.assign({}, nextSource.values || {}, { nextEntryRef: entryId });
  } else {
    const choiceFields = state.nodeTypes?.dialogue_choice?.fields || {};
    const choiceId = uniqueCanonicalGraphValue(nextGraph, "dialogue_choice." + stem + ".continue_" + existingEntries.length);
    const existingChoices = questTimelineChoicesForEntry(nextSource, nextGraph);
    const choice = {
      id: createZoneGraphId("node_dialogue_choice"),
      type: "dialogue_choice",
      title: "Verder",
      x: Number(nextSource.x) || 0,
      y: (Number(nextSource.y) || 0) + QUEST_TIMELINE_CHILD_ROW_STEP,
      parentId: nextDialogue.parentId || null,
      values: Object.assign({}, objectFunctionDefaultValuesForNodeType("dialogue_choice"), {
        choiceId: choiceId,
        label: "Verder",
        action: "none",
        nextEntryRef: entryId,
        closeAfterSelect: false,
        order: existingChoices.length + 1
      })
    };
    if (!choiceFields.nextEntryRef) delete choice.values.nextEntryRef;
    nextGraph.nodes.push(choice);
    questTimelineEnsureSingleEdge(nextGraph, choice.id, "dialogueChoice", nextSource.id, "choices");
    nextSource.values = Object.assign({}, nextSource.values || {}, { nextEntryRef: entryId });
  }

  try {
    await restoreGraphObject(nextGraph, {
      historyLabel: "Tekstregel toegevoegd",
      selectedNodeIds: [entry.id],
      selectedEdgeIds: [],
      refreshViewport: false,
      refreshValidation: true,
      afterApply: function () {
        state.questTimelineDialogueInsertDraft = null;
        state.questTimelineSelectedEntryId = entry.id;
        focusGraphNode(entry.id);
        setStatus("Tekstregel toegevoegd.", "success");
      }
    });
  } finally {
    renderAuthoringHub();
  }
}

async function questTimelineEndDialogueFrom(dialogue, sourceNode) {
  const nextGraph = cloneGraphForRestore(state.graph);
  const nextDialogue = nextGraph.nodes.find(function (n) { return n.id === dialogue.id; }) || null;
  const nextSource = nextGraph.nodes.find(function (n) { return n.id === sourceNode.id; }) || null;
  if (!nextDialogue || !nextSource) { setStatus("Deze dialoog bestaat niet meer.", "error"); return; }
  const stem = slugifyGroupPortName(nextDialogue.values?.dialogueId || "dialogue");
  const terminalId = uniqueCanonicalGraphValue(nextGraph, "dialogue_terminal." + stem + ".end");
  const terminal = {
    id: createZoneGraphId("node_dialogue_terminal"),
    type: "dialogue_terminal",
    title: "Einde",
    x: (Number(nextSource.x) || 0) + QUEST_TIMELINE_STEP_COLUMN_STEP,
    y: Number(nextSource.y) || 0,
    parentId: nextDialogue.parentId || null,
    values: Object.assign({}, objectFunctionDefaultValuesForNodeType("dialogue_terminal"), { terminalId: terminalId })
  };
  nextGraph.nodes.push(terminal);
  questTimelineEnsureSingleEdge(nextGraph, terminal.id, "dialogueEntry", nextDialogue.id, "entries");
  if (nextSource.type === "dialogue_choice") {
    nextSource.values = Object.assign({}, nextSource.values || {}, {
      action: "close",
      nextEntryRef: terminalId,
      closeAfterSelect: true
    });
  } else {
    const choiceId = uniqueCanonicalGraphValue(nextGraph, "dialogue_choice." + stem + ".close");
    const existingChoices = questTimelineChoicesForEntry(nextSource, nextGraph);
    const choice = {
      id: createZoneGraphId("node_dialogue_choice"),
      type: "dialogue_choice",
      title: "Sluiten",
      x: Number(nextSource.x) || 0,
      y: (Number(nextSource.y) || 0) + QUEST_TIMELINE_CHILD_ROW_STEP * (existingChoices.length + 1),
      parentId: nextDialogue.parentId || null,
      values: Object.assign({}, objectFunctionDefaultValuesForNodeType("dialogue_choice"), {
        choiceId: choiceId,
        label: "Sluiten",
        action: "close",
        nextEntryRef: terminalId,
        closeAfterSelect: true,
        order: existingChoices.length + 1
      })
    };
    nextGraph.nodes.push(choice);
    questTimelineEnsureSingleEdge(nextGraph, choice.id, "dialogueChoice", nextSource.id, "choices");
    nextSource.values = Object.assign({}, nextSource.values || {}, { nextEntryRef: terminalId });
  }

  try {
    await restoreGraphObject(nextGraph, {
      historyLabel: "Dialoog beëindigd",
      selectedNodeIds: [terminal.id],
      selectedEdgeIds: [],
      refreshViewport: false,
      refreshValidation: true,
      afterApply: function () {
        focusGraphNode(terminal.id);
        setStatus("Dialoogeinde toegevoegd.", "success");
      }
    });
  } finally {
    renderAuthoringHub();
  }
}

// ---- Fase 2 selection integration (object_character -> quest_dialogue handoff) ----

function questTimelineStartFromObjectFunction(intent, context) {
  const targetId = normalizeCanonicalId(context?.questBinding?.values?.targetId, "");
  if (!targetId) return;
  state.questTimelinePendingTargetRef = { intent: intent, targetId: targetId };
  state.questTimelineSelectedQuestId = null;
  state.questTimelineSelectedDialogueId = null;
  state.questTimelineView = intent === "dialogue" ? "dialogue" : "quest";
  selectAuthoringRoute("quest_dialogue");
}

// ---- Small generic field-control builders (draft-agnostic - unlike objectFunctionDraft*Input,
// these take an explicit value + onChange so they can be reused across quest/dialogue/child drafts) ----

function questTimelineReferenceNavigationAction(field) {
  const kinds = referenceKindsForField(field);
  if (kinds.some(function (kind) { return ["item", "currency", "ability", "enemy", "npc"].includes(kind); })) {
    return {
      label: "Open Catalog",
      title: "Navigeer naar de Catalog-route om een bestaande definitie te kiezen.",
      action: function () { selectAuthoringRoute("item_ability_stat"); }
    };
  }
  if (kinds.includes("zone")) {
    return {
      label: "Open Zone",
      title: "Navigeer naar de Zone-route om een bestaande zone te kiezen.",
      action: function () { selectAuthoringRoute("world_zone"); }
    };
  }
  if (kinds.includes("target")) {
    return {
      label: "Open Object",
      title: "Navigeer naar Object of personage om een object als Quest Target in te stellen.",
      action: function () { selectAuthoringRoute("object_character"); }
    };
  }
  if (kinds.some(function (kind) { return ["campaign", "chapter", "quest", "dialogue"].includes(kind); })) {
    return {
      label: "Open Campaign",
      title: "Navigeer naar de Quest / Dialoog-route om bestaande story-definities te kiezen.",
      action: function () { selectAuthoringRoute("quest_dialogue"); }
    };
  }
  return null;
}

function questTimelineTextInput(value, onChange, options = {}) {
  const input = document.createElement("input");
  input.type = "text";
  input.spellcheck = false;
  input.autocomplete = "off";
  input.autocapitalize = "none";
  input.value = value === null || value === undefined ? "" : String(value);
  if (options.placeholder) input.placeholder = options.placeholder;
  input.addEventListener("change", function () { onChange(input.value); });
  return input;
}

function questTimelineNumberInput(value, onChange, options = {}) {
  const input = document.createElement("input");
  input.type = "number";
  if (options.min !== undefined) input.min = String(options.min);
  if (options.max !== undefined) input.max = String(options.max);
  if (options.step !== undefined) input.step = String(options.step);
  input.value = value === null || value === undefined || value === "" ? "" : String(value);
  input.addEventListener("change", function () { onChange(input.value === "" ? null : Number(input.value)); });
  return input;
}

function questTimelineSelectInput(value, options, onChange) {
  const select = document.createElement("select");
  for (const opt of options || []) {
    const item = document.createElement("option");
    if (opt && typeof opt === "object") {
      item.value = opt.value === undefined || opt.value === null ? "" : String(opt.value);
      item.textContent = opt.label === undefined || opt.label === null ? item.value : String(opt.label);
    } else {
      item.value = String(opt);
      item.textContent = String(opt);
    }
    select.appendChild(item);
  }
  select.value = value === null || value === undefined ? "" : String(value);
  select.addEventListener("change", function () { onChange(select.value); });
  return select;
}

function questTimelineCheckboxInput(value, onChange) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = value === true;
  input.addEventListener("change", function () { onChange(input.checked); });
  return input;
}

function questTimelineChildFieldControl(fieldName, field, value, setValue, idScope) {
  if (field.type === "reference") {
    const fakeNode = { id: "qt-child-" + idScope + "-" + fieldName, type: "quest_step", values: {} };
    const navigation = questTimelineReferenceNavigationAction(field);
    return buildReferencePickerField(fakeNode, fieldName, field, value, {
      onChange: function (nextValue) { setValue(fieldName, nextValue); renderAuthoringHub(); },
      openCatalogAction: navigation?.action,
      openReferenceActionLabel: navigation?.label,
      openReferenceActionTitle: navigation?.title,
      hideAdvanced: true
    });
  }
  if (field.type === "select") {
    return questTimelineSelectInput(value ?? field.default, field.options || [], function (v) { setValue(fieldName, v); renderAuthoringHub(); });
  }
  if (field.type === "boolean") {
    return questTimelineCheckboxInput(value === true, function (v) { setValue(fieldName, v); });
  }
  if (field.type === "number") {
    return questTimelineNumberInput(value ?? field.default, function (v) { setValue(fieldName, v); }, { min: field.min, max: field.max, step: field.step });
  }
  return questTimelineTextInput(value ?? field.default ?? "", function (v) { setValue(fieldName, v); }, { placeholder: String(field.default || "") });
}

function questTimelineRenderChildForm(nodeType, draftValues, setValue) {
  const fields = state.nodeTypes?.[nodeType]?.fields || {};
  const wrap = document.createElement("div");
  wrap.className = "objectFunctionDraftFields";
  for (const [fieldName, field] of Object.entries(fields)) {
    if (!field || field.type === "identity") continue;
    const control = questTimelineChildFieldControl(fieldName, field, draftValues[fieldName], setValue, nodeType);
    wrap.appendChild(objectFunctionDraftFieldRow(field.label || fieldName, control));
  }
  return wrap;
}

// ---- Rendering: shared bits ----

function questTimelineChildSummary(node) {
  const def = state.nodeTypes?.[node.type] || {};
  const label = def.label || node.type;
  const fields = def.fields || {};
  const parts = [];
  for (const [key, field] of Object.entries(fields)) {
    if (!field || field.type === "identity" || field.type === "boolean") continue;
    const value = node.values?.[key];
    if (value === undefined || value === null || value === "") continue;
    if (field.type === "reference") {
      const refState = referencePickerChoiceState(value, field);
      parts.push((field.label || key) + ": " + (refState.displayLabel || value));
    } else {
      parts.push((field.label || key) + ": " + value);
    }
    if (parts.length >= 2) break;
  }
  return label + (parts.length ? " — " + parts.join(", ") : "");
}

function renderQuestTimelineChildBadge(node, onManage, onDelete) {
  const badge = document.createElement("div");
  badge.className = "objectFunctionBadge questTimelineChildBadge";
  const accent = document.createElement("span");
  accent.className = "objectFunctionBadgeAccent";
  accent.style.background = state.nodeTypes?.[node.type]?.accent || "#7bd4ff";
  const body = document.createElement("div");
  body.className = "objectFunctionBadgeBody";
  const label = document.createElement("div");
  label.className = "objectFunctionBadgeLabel";
  label.textContent = state.nodeTypes?.[node.type]?.label || node.type;
  const meta = document.createElement("div");
  meta.className = "objectFunctionBadgeMeta";
  meta.textContent = questTimelineChildSummary(node);
  body.append(label, meta);
  const buttons = document.createElement("div");
  buttons.className = "objectFunctionBadgeButtons";
  const manage = document.createElement("button");
  manage.type = "button";
  manage.className = "mini";
  manage.textContent = "Beheren";
  manage.addEventListener("click", function (event) { event.stopPropagation(); onManage(); });
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "deleteNode";
  remove.textContent = "Verwijderen";
  remove.addEventListener("click", function (event) { event.stopPropagation(); onDelete(); });
  buttons.append(manage, remove);
  badge.append(accent, body, buttons);
  badge.addEventListener("click", function () { focusGraphNode(node.id); });
  return badge;
}

function renderQuestTimelineChildDraftCard(draft) {
  const card = document.createElement("div");
  card.className = "objectFunctionDraftCard";
  if (!draft.type) {
    const title = document.createElement("div");
    title.className = "objectFunctionDraftTitle";
    title.textContent = "Kies een type";
    card.appendChild(title);
    const options = document.createElement("div");
    options.className = "objectFunctionActions";
    const anchor = (state.graph.nodes || []).find(function (node) { return node.id === draft.anchorId; }) || null;
    for (const entry of questTimelineAvailableChildTypes(draft.category, anchor)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "objectFunctionActionButton";
      button.textContent = entry.label;
      button.addEventListener("click", function () { questTimelineChooseChildType(entry.type); });
      options.appendChild(button);
    }
    card.appendChild(options);
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "ghost";
    cancel.textContent = "Annuleren";
    cancel.addEventListener("click", function () { questTimelineClearChildDraft(); });
    card.appendChild(cancel);
    return card;
  }
  const title = document.createElement("div");
  title.className = "objectFunctionDraftTitle";
  title.textContent = (draft.existingNodeId ? "Bewerk: " : "Nieuw: ") + (state.nodeTypes?.[draft.type]?.label || draft.type);
  card.appendChild(title);
  card.appendChild(questTimelineRenderChildForm(draft.type, draft.values || {}, questTimelineSetChildDraftValue));
  const actions = document.createElement("div");
  actions.className = "objectFunctionDraftActions";
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "primary";
  confirm.textContent = draft.existingNodeId ? "Wijzigingen opslaan" : "Toevoegen";
  confirm.disabled = !questTimelineChildDraftCanConfirm(draft);
  confirm.addEventListener("click", function () { void questTimelineCommitChildDraft(); });
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "ghost";
  cancel.textContent = "Annuleren";
  cancel.addEventListener("click", function () { questTimelineClearChildDraft(); });
  actions.append(confirm, cancel);
  card.appendChild(actions);
  return card;
}

function renderQuestStepSimpleChildSection(anchorNode, port, titleText, addLabel, category) {
  const wrap = document.createElement("div");
  wrap.className = "questTimelineChildSection";
  const heading = document.createElement("div");
  heading.className = "objectFunctionMeta";
  heading.textContent = titleText;
  wrap.appendChild(heading);
  const children = questTimelineDirectSources(state.graph, anchorNode, port);
  if (children.length) {
    const stack = document.createElement("div");
    stack.className = "objectFunctionBadgeRow";
    for (const child of children) {
      stack.appendChild(renderQuestTimelineChildBadge(child,
        function () { questTimelineBeginChildEdit(anchorNode.id, category, child); },
        function () { void questTimelineDeleteChildNode(anchorNode.id, child); }
      ));
    }
    wrap.appendChild(stack);
  }
  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "objectFunctionActionButton";
  addButton.textContent = addLabel;
  addButton.addEventListener("click", function () { questTimelineOpenChildChooser(anchorNode.id, category); });
  wrap.appendChild(addButton);
  if (state.questTimelineChildDraft && state.questTimelineChildDraft.anchorId === anchorNode.id && state.questTimelineChildDraft.category === category) {
    wrap.appendChild(renderQuestTimelineChildDraftCard(state.questTimelineChildDraft));
  }
  return wrap;
}

function renderRewardBundleContents(bundle) {
  const wrap = document.createElement("div");
  wrap.className = "questTimelineBundleContents";
  const label = document.createElement("div");
  label.className = "objectFunctionDraftHint";
  label.textContent = "In bundel \"" + nodeDisplayTitle(bundle) + "\":";
  wrap.appendChild(label);
  const children = questTimelineDirectSources(state.graph, bundle, "rewards");
  if (children.length) {
    const stack = document.createElement("div");
    stack.className = "objectFunctionBadgeRow";
    for (const child of children) {
      stack.appendChild(renderQuestTimelineChildBadge(child,
        function () { questTimelineBeginChildEdit(bundle.id, "rewardBundleChild", child); },
        function () { void questTimelineDeleteChildNode(bundle.id, child); }
      ));
    }
    wrap.appendChild(stack);
  }
  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "mini";
  addButton.textContent = "Beloning toevoegen in bundel";
  addButton.addEventListener("click", function () { questTimelineOpenChildChooser(bundle.id, "rewardBundleChild"); });
  wrap.appendChild(addButton);
  if (state.questTimelineChildDraft && state.questTimelineChildDraft.anchorId === bundle.id && state.questTimelineChildDraft.category === "rewardBundleChild") {
    wrap.appendChild(renderQuestTimelineChildDraftCard(state.questTimelineChildDraft));
  }
  return wrap;
}

function renderQuestStepRewardsSection(step) {
  const wrap = document.createElement("div");
  wrap.className = "questTimelineChildSection";
  const heading = document.createElement("div");
  heading.className = "objectFunctionMeta";
  heading.textContent = "Beloningen & acties";
  wrap.appendChild(heading);
  const children = questTimelineDirectSources(state.graph, step, "rewards");
  if (children.length) {
    const stack = document.createElement("div");
    stack.className = "objectFunctionBadgeRow";
    for (const child of children) {
      stack.appendChild(renderQuestTimelineChildBadge(child,
        function () { questTimelineBeginChildEdit(step.id, child.type === "reward_bundle" ? "rewardBundle" : "actions", child); },
        function () { void questTimelineDeleteChildNode(step.id, child); }
      ));
    }
    wrap.appendChild(stack);
    for (const child of children) {
      if (child.type === "reward_bundle") wrap.appendChild(renderRewardBundleContents(child));
    }
  }
  const actionsRow = document.createElement("div");
  actionsRow.className = "objectFunctionActions";
  const addAction = document.createElement("button");
  addAction.type = "button";
  addAction.className = "objectFunctionActionButton";
  addAction.textContent = "Actie toevoegen";
  addAction.addEventListener("click", function () { questTimelineOpenChildChooser(step.id, "actions"); });
  const addBundle = document.createElement("button");
  addBundle.type = "button";
  addBundle.className = "objectFunctionActionButton";
  addBundle.textContent = "Beloning toevoegen";
  addBundle.addEventListener("click", function () { questTimelineOpenChildChooser(step.id, "rewardBundle"); });
  actionsRow.append(addAction, addBundle);
  wrap.appendChild(actionsRow);
  if (state.questTimelineChildDraft && state.questTimelineChildDraft.anchorId === step.id && (state.questTimelineChildDraft.category === "actions" || state.questTimelineChildDraft.category === "rewardBundle")) {
    wrap.appendChild(renderQuestTimelineChildDraftCard(state.questTimelineChildDraft));
  }
  return wrap;
}

// ---- Rendering: Quest timeline (Bouwblok 1 + 2) ----

function renderQuestCreateDraft(group, draft) {
  const card = document.createElement("div");
  card.className = "objectFunctionDraftCard";
  const title = document.createElement("div");
  title.className = "objectFunctionDraftTitle";
  title.textContent = "Nieuwe Quest";
  card.appendChild(title);
  const fields = document.createElement("div");
  fields.className = "objectFunctionDraftFields";
  const setValue = function (key, value) { draft.values = Object.assign({}, draft.values || {}, { [key]: value }); };
  fields.appendChild(objectFunctionDraftFieldRow("Questnaam", questTimelineTextInput(draft.values.displayName, function (v) { setValue("displayName", v); }, { placeholder: "Bijv. De Verdwenen Voorraad" })));
  fields.appendChild(objectFunctionDraftFieldRow("Korte omschrijving", questTimelineTextInput(draft.values.summary, function (v) { setValue("summary", v); }, { placeholder: "Wat moet de speler doen?" })));
  const targetField = state.nodeTypes?.quest_definition?.fields?.turnInTargetRef || { type: "reference", referenceKinds: ["target"] };
  const targetNavigation = questTimelineReferenceNavigationAction(targetField);
  const targetControl = buildReferencePickerField({ id: "qt-new-quest-target", type: "quest_definition", values: {} }, "turnInTargetRef", targetField, draft.values.turnInTargetRef || null, {
    onChange: function (v) { setValue("turnInTargetRef", v); renderAuthoringHub(); },
    openCatalogAction: targetNavigation?.action,
    openReferenceActionLabel: targetNavigation?.label,
    openReferenceActionTitle: targetNavigation?.title,
    hideAdvanced: true
  });
  fields.appendChild(objectFunctionDraftFieldRow("Quest Target (optioneel)", targetControl, "De NPC of plek die deze quest geeft/inneemt."));
  fields.appendChild(objectFunctionDraftFieldRow("Aanbevolen level (optioneel)", questTimelineNumberInput(draft.values.minimumLevel, function (v) { setValue("minimumLevel", v); }, { min: 1, max: 1000, step: 1 })));
  card.appendChild(fields);
  const actions = document.createElement("div");
  actions.className = "objectFunctionDraftActions";
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "primary";
  confirm.textContent = "Aanmaken";
  confirm.addEventListener("click", function () { void questTimelineCommitCreateQuest(group, draft); });
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "ghost";
  cancel.textContent = "Annuleren";
  cancel.addEventListener("click", function () { state.questTimelineDraft = null; renderAuthoringHub(); });
  actions.append(confirm, cancel);
  card.appendChild(actions);
  return card;
}

function renderQuestTimelinePlus(quest, insertIndex) {
  const holder = document.createElement("span");
  holder.className = "questTimelinePlusHolder";
  const draft = state.questTimelineInsertDraft;
  const isOpenHere = Boolean(draft && draft.questId === quest.id && draft.insertIndex === insertIndex);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "questTimelinePlusButton" + (isOpenHere ? " questTimelinePlusButton--active" : "");
  button.textContent = "+";
  button.title = "Nieuwe stap hier invoegen";
  button.addEventListener("click", function () {
    state.questTimelineInsertDraft = isOpenHere ? null : { questId: quest.id, insertIndex: insertIndex, name: "" };
    renderAuthoringHub();
  });
  holder.appendChild(button);
  if (isOpenHere) {
    const popover = document.createElement("div");
    popover.className = "questTimelinePlusPopover";
    const input = questTimelineTextInput(draft.name, function (v) { draft.name = v; }, { placeholder: "Naam van de stap" });
    popover.appendChild(objectFunctionDraftFieldRow("Stapnaam", input));
    const rowActions = document.createElement("div");
    rowActions.className = "objectFunctionDraftActions";
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "primary";
    confirm.textContent = "Toevoegen";
    confirm.addEventListener("click", function () { void questTimelineInsertStep(quest, insertIndex, input.value || draft.name); });
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "ghost";
    cancel.textContent = "Annuleren";
    cancel.addEventListener("click", function () { state.questTimelineInsertDraft = null; renderAuthoringHub(); });
    rowActions.append(confirm, cancel);
    popover.appendChild(rowActions);
    holder.appendChild(popover);
  }
  return holder;
}

function questTimelineRuntimeCompleteStep(quest) {
  const steps = questTimelineStepsForQuest(quest, state.graph);
  if (!steps.length) return null;
  const last = steps[steps.length - 1];
  const type = String(last.values?.stepType || "").trim();
  return (type === "deliver" || type === "reach") ? last : null;
}

function renderQuestTimelineTerminalChip(quest) {
  const chip = document.createElement("span");
  const runtimeStep = questTimelineRuntimeCompleteStep(quest);
  chip.className = "questTimelineTerminalChip" + (runtimeStep ? "" : " questTimelineTerminalChip--warning");
  chip.textContent = "Voltooid";
  chip.title = runtimeStep
    ? "De bestaande runtime voltooit via de laatste " + String(runtimeStep.values?.stepType || "") + "-stap."
    : "Geen ondersteund voltooi-eindpunt in compiler/runtime; maak de laatste stap deliver of reach voor runtimevoltooiing.";
  return chip;
}

function renderQuestStepChip(quest, step) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "questTimelineStepChip" + (state.questTimelineSelectedStepId === step.id ? " questTimelineStepChip--active" : "");
  const title = document.createElement("div");
  title.className = "questTimelineStepChipTitle";
  title.textContent = nodeDisplayTitle(step);
  const meta = document.createElement("div");
  meta.className = "questTimelineStepChipMeta";
  const objectives = questTimelineObjectivesForStep(step, state.graph).length;
  const conditions = questTimelineConditionsForStep(step, state.graph).length;
  const rewards = questTimelineRewardsForStep(step, state.graph).length;
  meta.textContent = objectives + " objective(s) · " + conditions + " voorwaarde(n) · " + rewards + " beloning(en)";
  chip.append(title, meta);
  chip.addEventListener("click", function () {
    state.questTimelineSelectedStepId = state.questTimelineSelectedStepId === step.id ? null : step.id;
    focusGraphNode(step.id);
    renderAuthoringHub();
  });
  return chip;
}

function renderQuestStepTimeline(quest) {
  const wrap = document.createElement("div");
  wrap.className = "questTimelineFlow";
  const steps = questTimelineStepsForQuest(quest, state.graph);
  const startChip = document.createElement("span");
  startChip.className = "objectFunctionFlowChip objectFunctionFlowChip--model";
  startChip.textContent = "Start";
  wrap.appendChild(startChip);
  wrap.appendChild(renderQuestTimelinePlus(quest, 0));
  steps.forEach(function (step, index) {
    wrap.appendChild(renderQuestStepChip(quest, step));
    wrap.appendChild(renderQuestTimelinePlus(quest, index + 1));
  });
  if (steps.length) {
    wrap.appendChild(renderQuestTimelineTerminalChip(quest));
  }
  if (!steps.length) {
    const hint = document.createElement("div");
    hint.className = "objectFunctionDraftHint";
    hint.textContent = "Nog geen stappen. Gebruik + om de eerste stap toe te voegen.";
    wrap.appendChild(hint);
  }
  return wrap;
}

function questTimelineNextStepByRuntimeOrder(quest, step, steps) {
  const explicit = questTimelineStepIdForNode(step) && normalizeCanonicalId(step.values?.nextStepRef, "");
  if (explicit) {
    return steps.find(function (candidate) { return questTimelineStepIdForNode(candidate) === explicit; }) || null;
  }
  const index = steps.findIndex(function (candidate) { return candidate.id === step.id; });
  return index >= 0 ? steps[index + 1] || null : null;
}

function questTimelineQuestIssues(quest, graph = state.graph) {
  const issues = [];
  const steps = questTimelineStepsForQuest(quest, graph);
  if (!steps.length) {
    issues.push({ kind: "error", message: "Quest heeft geen stap." });
    return issues;
  }
  const stepIds = new Set();
  const sequenceValues = new Set();
  for (const step of steps) {
    const stepId = questTimelineStepIdForNode(step);
    if (!stepId) issues.push({ kind: "error", message: "Een stap mist een geldig Step id." });
    if (stepId && stepIds.has(stepId)) issues.push({ kind: "error", message: "Dubbele Step id: " + stepId + "." });
    if (stepId) stepIds.add(stepId);
    const sequence = String(Number(step.values?.sequenceIndex));
    if (sequenceValues.has(sequence)) issues.push({ kind: "warning", message: "Meerdere stappen hebben dezelfde volgorde." });
    sequenceValues.add(sequence);
    if ((step.parentId || null) !== (quest.parentId || null)) {
      issues.push({ kind: "error", message: "Stap \"" + nodeDisplayTitle(step) + "\" staat buiten deze Campaign Group." });
    }
  }
  const startRef = normalizeCanonicalId(quest.values?.startStepRef, "") || questTimelineStepIdForNode(steps[0]);
  const start = steps.find(function (step) { return questTimelineStepIdForNode(step) === startRef; }) || null;
  if (!start) {
    issues.push({ kind: "error", message: "Startstap ontbreekt of verwijst naar een ontbrekende stap." });
    return issues;
  }
  const visited = new Set();
  let current = start;
  let guard = 0;
  while (current && guard <= steps.length + 1) {
    if (visited.has(current.id)) {
      issues.push({ kind: "error", message: "Deze quest bevat een directe cycle via nextStepRef." });
      break;
    }
    visited.add(current.id);
    guard += 1;
    const explicit = normalizeCanonicalId(current.values?.nextStepRef, "");
    if (explicit && !stepIds.has(explicit)) {
      issues.push({ kind: "error", message: "Stap \"" + nodeDisplayTitle(current) + "\" verwijst naar een ontbrekende volgende stap." });
      break;
    }
    current = questTimelineNextStepByRuntimeOrder(quest, current, steps);
  }
  if (visited.size < steps.length) {
    issues.push({ kind: "warning", message: "Niet alle stappen zijn bereikbaar vanaf de startstap." });
  }
  if (!questTimelineRuntimeCompleteStep(quest)) {
    issues.push({ kind: "warning", message: "De bestaande runtime voltooit quests alleen via een laatste deliver- of reach-stap." });
  }
  return issues;
}

function renderQuestTimelineIssues(quest) {
  const issues = questTimelineQuestIssues(quest, state.graph);
  if (!issues.length) return document.createDocumentFragment();
  const wrap = document.createElement("div");
  wrap.className = "questTimelineIssueList";
  for (const issue of issues) {
    const row = document.createElement("div");
    row.className = "questTimelineIssue questTimelineIssue--" + issue.kind;
    row.textContent = issue.message;
    wrap.appendChild(row);
  }
  return wrap;
}

function renderQuestStepDetail(quest, step) {
  const wrap = document.createElement("div");
  wrap.className = "objectFunctionDraftCard questTimelineStepDetail";
  const title = document.createElement("div");
  title.className = "objectFunctionDraftTitle";
  title.textContent = nodeDisplayTitle(step);
  wrap.appendChild(title);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "deleteNode";
  remove.textContent = "Verwijder stap";
  remove.addEventListener("click", function () { void questTimelineDeleteStep(quest, step); });
  wrap.appendChild(remove);
  wrap.appendChild(renderQuestStepSimpleChildSection(step, "conditions", "Voorwaarden", "Voorwaarde toevoegen", "conditions"));
  wrap.appendChild(renderQuestStepSimpleChildSection(step, "objectives", "Objectives", "Objective toevoegen", "objectives"));
  wrap.appendChild(renderQuestStepRewardsSection(step));
  return wrap;
}

function renderQuestTimelineView(group) {
  const wrap = document.createElement("div");
  wrap.className = "questTimelinePane";
  const quests = questTimelineQuestsInGroup(group, state.graph);
  const selected = state.questTimelineSelectedQuestId ? quests.find(function (q) { return q.id === state.questTimelineSelectedQuestId; }) : null;

  if (!selected) {
    const listWrap = document.createElement("div");
    listWrap.className = "questTimelineList";
    const newButton = document.createElement("button");
    newButton.type = "button";
    newButton.className = "primary";
    const pendingTargetLabel = questTimelinePendingTargetLabel("quest");
    newButton.textContent = pendingTargetLabel ? ("Nieuwe Quest voor " + pendingTargetLabel) : "Nieuwe Quest";
    newButton.addEventListener("click", function () { questTimelineBeginQuestDraft(group); });
    listWrap.appendChild(newButton);
    if (!quests.length) {
      const empty = document.createElement("div");
      empty.className = "authoringWorkspaceEmpty";
      empty.textContent = "Nog geen quests in deze Campaign Group.";
      listWrap.appendChild(empty);
    } else {
      for (const quest of quests) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "libButton authoringWorkspaceButton";
        const dot = document.createElement("span");
        dot.className = "libDot";
        dot.style.background = state.nodeTypes?.quest_definition?.accent || "#fbbf24";
        const text = document.createElement("span");
        text.className = "authoringRouteText";
        const t = document.createElement("span");
        t.className = "authoringRouteTitle";
        t.textContent = nodeDisplayTitle(quest);
        const s = document.createElement("span");
        s.className = "authoringRouteSummary";
        const stepCount = questTimelineStepsForQuest(quest, state.graph).length;
        s.textContent = stepCount + (stepCount === 1 ? " stap" : " stappen");
        text.append(t, s);
        const plus = document.createElement("span");
        plus.className = "plus";
        plus.textContent = ">";
        button.append(dot, text, plus);
        button.addEventListener("click", function () {
          state.questTimelineSelectedQuestId = quest.id;
          state.questTimelineSelectedStepId = null;
          focusGraphNode(quest.id);
          renderAuthoringHub();
        });
        listWrap.appendChild(button);
      }
    }
    wrap.appendChild(listWrap);
    if (state.questTimelineDraft && state.questTimelineDraft.groupId === group.id) {
      wrap.appendChild(renderQuestCreateDraft(group, state.questTimelineDraft));
    }
    return wrap;
  }

  const back = document.createElement("button");
  back.type = "button";
  back.className = "mini";
  back.textContent = "← Terug naar questlijst";
  back.addEventListener("click", function () {
    state.questTimelineSelectedQuestId = null;
    state.questTimelineSelectedStepId = null;
    renderAuthoringHub();
  });
  wrap.appendChild(back);

  const questHeader = document.createElement("div");
  questHeader.className = "questTimelineQuestHeader";
  const questTitle = document.createElement("div");
  questTitle.className = "objectFunctionDraftTitle";
  questTitle.textContent = nodeDisplayTitle(selected);
  const questSummary = document.createElement("div");
  questSummary.className = "objectFunctionDraftHint";
  questSummary.textContent = String(selected.values?.summary || "");
  questHeader.append(questTitle, questSummary);
  wrap.appendChild(questHeader);
  wrap.appendChild(renderQuestTimelineIssues(selected));

  wrap.appendChild(renderQuestStepTimeline(selected));

  const steps = questTimelineStepsForQuest(selected, state.graph);
  const selectedStep = state.questTimelineSelectedStepId ? steps.find(function (s) { return s.id === state.questTimelineSelectedStepId; }) : null;
  if (selectedStep) {
    wrap.appendChild(renderQuestStepDetail(selected, selectedStep));
  }

  return wrap;
}

// ---- Rendering: Dialogue timeline (Bouwblok 4) ----

function renderQuestTimelineArrow() {
  const arrow = document.createElement("span");
  arrow.className = "questTimelineArrow";
  arrow.textContent = "→";
  return arrow;
}

function renderDialogueEntryChip(dialogue, entry) {
  const isTerminal = entry.type === "dialogue_terminal";
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "questTimelineStepChip" + (state.questTimelineSelectedEntryId === entry.id ? " questTimelineStepChip--active" : "");
  const title = document.createElement("div");
  title.className = "questTimelineStepChipTitle";
  title.textContent = isTerminal ? "Einde" : (String(entry.values?.text || "").slice(0, 40) || "Regel");
  const meta = document.createElement("div");
  meta.className = "questTimelineStepChipMeta";
  meta.textContent = isTerminal ? "Sluit dialoog" : String(entry.values?.speakerName || "");
  chip.append(title, meta);
  chip.addEventListener("click", function () {
    state.questTimelineSelectedEntryId = state.questTimelineSelectedEntryId === entry.id ? null : entry.id;
    focusGraphNode(entry.id);
    renderAuthoringHub();
  });
  return chip;
}

function renderDialogueLineInsertCard(dialogue, sourceNode) {
  const draft = state.questTimelineDialogueInsertDraft;
  const card = document.createElement("div");
  card.className = "objectFunctionDraftCard";
  const title = document.createElement("div");
  title.className = "objectFunctionDraftTitle";
  title.textContent = "Nieuwe tekstregel";
  card.appendChild(title);
  const input = questTimelineTextInput(draft.text, function (v) { draft.text = v; }, { placeholder: "Tekst" });
  card.appendChild(objectFunctionDraftFieldRow("Tekst", input));
  const actions = document.createElement("div");
  actions.className = "objectFunctionDraftActions";
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "primary";
  confirm.textContent = "Toevoegen";
  confirm.addEventListener("click", function () { void questTimelineAddDialogueEntry(dialogue, sourceNode, input.value || draft.text); });
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "ghost";
  cancel.textContent = "Annuleren";
  cancel.addEventListener("click", function () { state.questTimelineDialogueInsertDraft = null; renderAuthoringHub(); });
  actions.append(confirm, cancel);
  card.appendChild(actions);
  return card;
}

function renderDialogueEntryActions(dialogue, entry) {
  const container = document.createElement("div");
  const wrap = document.createElement("div");
  wrap.className = "objectFunctionActions questTimelineDialogueActions";
  const addLine = document.createElement("button");
  addLine.type = "button";
  addLine.className = "objectFunctionActionButton";
  addLine.textContent = "Tekstregel toevoegen";
  addLine.addEventListener("click", function () {
    state.questTimelineDialogueInsertDraft = { anchorId: entry.id, text: "" };
    renderAuthoringHub();
  });
  const addChoice = document.createElement("button");
  addChoice.type = "button";
  addChoice.className = "objectFunctionActionButton";
  addChoice.textContent = "Keuze toevoegen";
  addChoice.addEventListener("click", function () { questTimelineOpenChildChooser(entry.id, "choices"); });
  const endDialogue = document.createElement("button");
  endDialogue.type = "button";
  endDialogue.className = "objectFunctionActionButton";
  endDialogue.textContent = "Dialoog beëindigen";
  endDialogue.addEventListener("click", function () { void questTimelineEndDialogueFrom(dialogue, entry); });
  wrap.append(addLine, addChoice, endDialogue);
  container.appendChild(wrap);
  if (state.questTimelineDialogueInsertDraft && state.questTimelineDialogueInsertDraft.anchorId === entry.id) {
    container.appendChild(renderDialogueLineInsertCard(dialogue, entry));
  }
  if (state.questTimelineChildDraft && state.questTimelineChildDraft.anchorId === entry.id && state.questTimelineChildDraft.category === "choices") {
    container.appendChild(renderQuestTimelineChildDraftCard(state.questTimelineChildDraft));
  }
  return container;
}

function renderDialogueChoiceCard(dialogue, entry, choice, visited, depth) {
  const wrap = document.createElement("div");
  const card = document.createElement("div");
  card.className = "objectFunctionBadge questTimelineChildBadge questTimelineChoiceCard";
  const accent = document.createElement("span");
  accent.className = "objectFunctionBadgeAccent";
  accent.style.background = state.nodeTypes?.dialogue_choice?.accent || "#f0abfc";
  const body = document.createElement("div");
  body.className = "objectFunctionBadgeBody";
  const label = document.createElement("div");
  label.className = "objectFunctionBadgeLabel";
  label.textContent = String(choice.values?.label || "Keuze");
  const meta = document.createElement("div");
  meta.className = "objectFunctionBadgeMeta";
  const actionText = choice.values?.action && choice.values.action !== "none" ? (" · " + choice.values.action) : "";
  meta.textContent = (choice.values?.nextEntryRef ? "→ volgt regel" : "geen vervolg") + actionText;
  body.append(label, meta);
  const buttons = document.createElement("div");
  buttons.className = "objectFunctionBadgeButtons";
  const manage = document.createElement("button");
  manage.type = "button";
  manage.className = "mini";
  manage.textContent = "Beheren";
  manage.addEventListener("click", function (event) { event.stopPropagation(); questTimelineBeginChildEdit(entry.id, "choices", choice); });
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "deleteNode";
  remove.textContent = "Verwijderen";
  remove.addEventListener("click", function (event) { event.stopPropagation(); void questTimelineDeleteChildNode(entry.id, choice); });
  buttons.append(manage, remove);
  card.append(accent, body, buttons);
  card.addEventListener("click", function () { focusGraphNode(choice.id); });
  wrap.appendChild(card);

  wrap.appendChild(renderQuestStepSimpleChildSection(choice, "conditions", "Voorwaarden bij deze keuze", "Voorwaarde toevoegen", "conditions"));

  if (depth >= QUEST_TIMELINE_MAX_DIALOGUE_RENDER_DEPTH) {
    const limitNote = document.createElement("div");
    limitNote.className = "objectFunctionDraftHint";
    limitNote.textContent = "Dialoogketen te diep om hier verder te tonen. Open de node direct in de graph.";
    wrap.appendChild(limitNote);
    return wrap;
  }

  const nextEntry = choice.values?.nextEntryRef ? questTimelineEntryNodeByLocalId(dialogue, choice.values.nextEntryRef, state.graph) : null;
  if (nextEntry && visited.has(nextEntry.id)) {
    const cycleNote = document.createElement("div");
    cycleNote.className = "objectFunctionDraftHint";
    cycleNote.textContent = "Verwijst terug naar \"" + nodeDisplayTitle(nextEntry) + "\" (al eerder in deze dialoog getoond).";
    wrap.appendChild(cycleNote);
  } else if (nextEntry) {
    visited.add(nextEntry.id);
    const continueRow = document.createElement("div");
    continueRow.className = "questTimelineFlow";
    continueRow.appendChild(renderQuestTimelineArrow());
    continueRow.appendChild(renderDialogueEntryChip(dialogue, nextEntry));
    wrap.appendChild(continueRow);
    if (nextEntry.type === "dialogue_terminal") {
      // nothing more to show after a terminal
    } else {
      const nextChoices = questTimelineChoicesForEntry(nextEntry, state.graph);
      if (nextChoices.length) {
        wrap.appendChild(renderDialogueChoiceStack(dialogue, nextEntry, visited, depth + 1));
      } else {
        wrap.appendChild(renderDialogueEntryActions(dialogue, nextEntry));
      }
    }
  } else {
    const continueActions = document.createElement("div");
    continueActions.className = "objectFunctionActions";
    const action = String(choice.values?.action || "none");
    const closesInRuntime = choice.values?.closeAfterSelect === true || action === "close" || action === "accept_quest";
    if (closesInRuntime) {
      const note = document.createElement("div");
      note.className = "objectFunctionDraftHint";
      note.textContent = "Deze keuze sluit de dialoog in de runtime.";
      wrap.appendChild(note);
      return wrap;
    }
    const addLine = document.createElement("button");
    addLine.type = "button";
    addLine.className = "objectFunctionActionButton";
    addLine.textContent = "Vervolgregel toevoegen";
    addLine.addEventListener("click", function () {
      state.questTimelineDialogueInsertDraft = { anchorId: choice.id, text: "" };
      renderAuthoringHub();
    });
    const endHere = document.createElement("button");
    endHere.type = "button";
    endHere.className = "objectFunctionActionButton";
    endHere.textContent = "Dialoog beëindigen";
    endHere.addEventListener("click", function () { void questTimelineEndDialogueFrom(dialogue, choice); });
    continueActions.append(addLine, endHere);
    wrap.appendChild(continueActions);
    if (state.questTimelineDialogueInsertDraft && state.questTimelineDialogueInsertDraft.anchorId === choice.id) {
      wrap.appendChild(renderDialogueLineInsertCard(dialogue, choice));
    }
  }
  return wrap;
}

function renderDialogueChoiceStack(dialogue, entry, visited, depth) {
  const wrap = document.createElement("div");
  wrap.className = "questTimelineChildSection";
  const heading = document.createElement("div");
  heading.className = "objectFunctionMeta";
  heading.textContent = "Keuzes";
  wrap.appendChild(heading);
  const choices = questTimelineChoicesForEntry(entry, state.graph);
  for (const choice of choices) {
    wrap.appendChild(renderDialogueChoiceCard(dialogue, entry, choice, visited, depth));
  }
  const addChoice = document.createElement("button");
  addChoice.type = "button";
  addChoice.className = "objectFunctionActionButton";
  addChoice.textContent = "Keuze toevoegen";
  addChoice.addEventListener("click", function () { questTimelineOpenChildChooser(entry.id, "choices"); });
  wrap.appendChild(addChoice);
  if (state.questTimelineChildDraft && state.questTimelineChildDraft.anchorId === entry.id && state.questTimelineChildDraft.category === "choices") {
    wrap.appendChild(renderQuestTimelineChildDraftCard(state.questTimelineChildDraft));
  }
  return wrap;
}

function renderDialogueEntryChain(dialogue) {
  const wrap = document.createElement("div");
  wrap.className = "questTimelineFlow questTimelineFlow--dialogue";
  const startChip = document.createElement("span");
  startChip.className = "objectFunctionFlowChip objectFunctionFlowChip--model";
  startChip.textContent = "Start";
  wrap.appendChild(startChip);

  const startEntry = questTimelineEntryNodeByLocalId(dialogue, dialogue.values?.startEntryRef, state.graph);
  if (!startEntry) {
    const hint = document.createElement("div");
    hint.className = "objectFunctionDraftHint";
    hint.textContent = "Geen startregel gevonden.";
    wrap.appendChild(hint);
    return wrap;
  }

  const visited = new Set();
  let current = startEntry;
  let previous = null;
  let guard = 0;
  while (current && !visited.has(current.id) && guard < 200) {
    visited.add(current.id);
    guard += 1;
    wrap.appendChild(renderDialogueEntryChip(dialogue, current));
    previous = current;
    if (current.type === "dialogue_terminal") { current = null; break; }
    const choices = questTimelineChoicesForEntry(current, state.graph);
    if (choices.length) { current = null; break; }
    const nextRef = current.values?.nextEntryRef;
    current = nextRef ? questTimelineEntryNodeByLocalId(dialogue, nextRef, state.graph) : null;
    if (current) wrap.appendChild(renderQuestTimelineArrow());
  }

  if (previous && previous.type !== "dialogue_terminal") {
    const previousChoices = questTimelineChoicesForEntry(previous, state.graph);
    if (previousChoices.length) {
      wrap.appendChild(renderDialogueChoiceStack(dialogue, previous, visited, 0));
    } else if (!previous.values?.nextEntryRef) {
      wrap.appendChild(renderDialogueEntryActions(dialogue, previous));
    }
  }
  return wrap;
}

function renderDialogueCreateDraft(group, draft) {
  const card = document.createElement("div");
  card.className = "objectFunctionDraftCard";
  const title = document.createElement("div");
  title.className = "objectFunctionDraftTitle";
  title.textContent = "Nieuwe Dialoog";
  card.appendChild(title);
  const fields = document.createElement("div");
  fields.className = "objectFunctionDraftFields";
  const setValue = function (key, value) { draft.values = Object.assign({}, draft.values || {}, { [key]: value }); };
  fields.appendChild(objectFunctionDraftFieldRow("Naam", questTimelineTextInput(draft.values.displayName, function (v) { setValue("displayName", v); }, { placeholder: "Bijv. Bram - Intro" })));
  const targetField = state.nodeTypes?.dialogue_definition?.fields?.targetRef || { type: "reference", referenceKinds: ["target"], required: true };
  const targetNavigation = questTimelineReferenceNavigationAction(targetField);
  const targetControl = buildReferencePickerField({ id: "qt-new-dialogue-target", type: "dialogue_definition", values: {} }, "targetRef", targetField, draft.values.targetRef || null, {
    onChange: function (v) { setValue("targetRef", v); renderAuthoringHub(); },
    openCatalogAction: targetNavigation?.action,
    openReferenceActionLabel: targetNavigation?.label,
    openReferenceActionTitle: targetNavigation?.title,
    hideAdvanced: true
  });
  fields.appendChild(objectFunctionDraftFieldRow("Spreker / Quest Target", targetControl));
  fields.appendChild(objectFunctionDraftFieldRow("Eerste tekstregel", questTimelineTextInput(draft.values.firstText, function (v) { setValue("firstText", v); }, { placeholder: "Wat zegt de spreker als eerste?" })));
  card.appendChild(fields);
  const actions = document.createElement("div");
  actions.className = "objectFunctionDraftActions";
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "primary";
  confirm.textContent = "Aanmaken";
  confirm.addEventListener("click", function () { void questTimelineCommitCreateDialogue(group, draft); });
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "ghost";
  cancel.textContent = "Annuleren";
  cancel.addEventListener("click", function () { state.questTimelineDialogueDraft = null; renderAuthoringHub(); });
  actions.append(confirm, cancel);
  card.appendChild(actions);
  return card;
}

function renderDialogueTimelineView(group) {
  const wrap = document.createElement("div");
  wrap.className = "questTimelinePane";
  const dialogues = questTimelineDialoguesInGroup(group, state.graph);
  const selected = state.questTimelineSelectedDialogueId ? dialogues.find(function (d) { return d.id === state.questTimelineSelectedDialogueId; }) : null;

  if (!selected) {
    const listWrap = document.createElement("div");
    listWrap.className = "questTimelineList";
    const newButton = document.createElement("button");
    newButton.type = "button";
    newButton.className = "primary";
    const pendingTargetLabel = questTimelinePendingTargetLabel("dialogue");
    newButton.textContent = pendingTargetLabel ? ("Nieuwe Dialoog voor " + pendingTargetLabel) : "Nieuwe Dialoog";
    newButton.addEventListener("click", function () { questTimelineBeginDialogueDraft(group); });
    listWrap.appendChild(newButton);
    if (!dialogues.length) {
      const empty = document.createElement("div");
      empty.className = "authoringWorkspaceEmpty";
      empty.textContent = "Nog geen dialogen in deze Campaign Group.";
      listWrap.appendChild(empty);
    } else {
      for (const dialogue of dialogues) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "libButton authoringWorkspaceButton";
        const dot = document.createElement("span");
        dot.className = "libDot";
        dot.style.background = state.nodeTypes?.dialogue_definition?.accent || "#c084fc";
        const text = document.createElement("span");
        text.className = "authoringRouteText";
        const t = document.createElement("span");
        t.className = "authoringRouteTitle";
        t.textContent = nodeDisplayTitle(dialogue);
        const s = document.createElement("span");
        s.className = "authoringRouteSummary";
        s.textContent = questTimelineEntriesForDialogue(dialogue, state.graph).length + " regel(s)";
        text.append(t, s);
        const plus = document.createElement("span");
        plus.className = "plus";
        plus.textContent = ">";
        button.append(dot, text, plus);
        button.addEventListener("click", function () {
          state.questTimelineSelectedDialogueId = dialogue.id;
          state.questTimelineSelectedEntryId = null;
          focusGraphNode(dialogue.id);
          renderAuthoringHub();
        });
        listWrap.appendChild(button);
      }
    }
    wrap.appendChild(listWrap);
    if (state.questTimelineDialogueDraft && state.questTimelineDialogueDraft.groupId === group.id) {
      wrap.appendChild(renderDialogueCreateDraft(group, state.questTimelineDialogueDraft));
    }
    return wrap;
  }

  const back = document.createElement("button");
  back.type = "button";
  back.className = "mini";
  back.textContent = "← Terug naar dialooglijst";
  back.addEventListener("click", function () {
    state.questTimelineSelectedDialogueId = null;
    state.questTimelineSelectedEntryId = null;
    renderAuthoringHub();
  });
  wrap.appendChild(back);

  const header = document.createElement("div");
  header.className = "questTimelineQuestHeader";
  const title = document.createElement("div");
  title.className = "objectFunctionDraftTitle";
  title.textContent = nodeDisplayTitle(selected);
  header.appendChild(title);
  wrap.appendChild(header);

  wrap.appendChild(renderDialogueEntryChain(selected));

  return wrap;
}

// ---- Top-level entry point: tabs + selected pane ----

function questTimelineTabButton(label, active, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "questTimelineTab" + (active ? " questTimelineTab--active" : "");
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderQuestDialogueWorkspace(group) {
  const wrap = document.createElement("div");
  wrap.className = "objectFunctionSection questTimelineSection";
  const header = document.createElement("div");
  header.className = "objectFunctionHeader";
  const title = document.createElement("div");
  title.className = "objectFunctionTitle";
  title.textContent = nodeDisplayTitle(group) || "Campaigns Group";
  const intro = document.createElement("div");
  intro.className = "objectFunctionIntro";
  intro.textContent = "Bouw quests en dialogen als leesbare tijdlijn. Geen technische IDs nodig.";
  header.append(title, intro);
  wrap.appendChild(header);

  const tabs = document.createElement("div");
  tabs.className = "questTimelineTabs";
  const view = state.questTimelineView === "dialogue" ? "dialogue" : "quest";
  tabs.appendChild(questTimelineTabButton("Questtimeline", view === "quest", function () {
    state.questTimelineView = "quest";
    renderAuthoringHub();
  }));
  tabs.appendChild(questTimelineTabButton("Dialoogtimeline", view === "dialogue", function () {
    state.questTimelineView = "dialogue";
    renderAuthoringHub();
  }));
  wrap.appendChild(tabs);

  wrap.appendChild(view === "quest" ? renderQuestTimelineView(group) : renderDialogueTimelineView(group));
  return wrap;
}

// ---------- AUTHORING-04: human route hubs ----------

const AUTHORING04_GROUP_OUTPUT_PORTS = {
  catalog: { id: "catalog_package", name: "catalogpackage", label: "Catalog Package", dataType: "catalogPackage", multiple: false },
  player_rules: { id: "player_rules", name: "playerrules", label: "Player Rules", dataType: "playerRules", multiple: false },
  ui: { id: "ui_package", name: "uipackage", label: "UI Package", dataType: "uiPackage", multiple: false }
};

const CATALOG_HUB_TYPES = [
  { type: "item_definition", label: "Items" },
  { type: "ability_definition", label: "Abilities" },
  { type: "stat_definition", label: "Stats" },
  { type: "currency_definition", label: "Currencies" },
  { type: "loot_table", label: "Loot Tables" }
];

const LOOT_ENTRY_TYPES = [
  { type: "loot_item_entry", label: "Itemregel" },
  { type: "loot_currency_entry", label: "Currencyregel" },
  { type: "loot_table_entry", label: "Nested table" }
];

const PLAYER_RULES_HUB_TYPES = [
  "player_progression_rules",
  "inventory_rules",
  "equipment_rules",
  "ability_loadout_rules",
  "death_respawn_rules",
  "unstuck_rules",
  "xp_source_rule",
  "crafting_policy",
  "vendor_policy",
  "party_loot_policy",
  "party_rules",
  "trade_policy",
  "market_policy",
  "mail_policy"
];

const UI_HUB_TYPES = [
  "ui_hud_text",
  "debug_performance_hud",
  "game_minimap_hud",
  "hud_layout",
  "menu_layout",
  "party_hud",
  "vendor_hud",
  "crafting_hud",
  "market_hud",
  "trade_hud",
  "inventory_hud",
  "wallet_hud",
  "equipment_hud",
  "ability_bar_hud",
  "quest_tracker_hud"
];

const AUTHORING_ROUTE_COUNT_TYPES = {
  world_zone: ["group", "zone_definition", "zone_output", "spawn_point", "zone_link", "map_marker_definition", "minimap_bake"],
  object_character: ["model_entity", "entity_assembly", "interaction_component", "npc_component", "enemy_component", "quest_target_binding"],
  quest_dialogue: ["quest_definition", "quest_step", "dialogue_definition", "dialogue_entry", "dialogue_choice", "dialogue_terminal"],
  item_ability_stat: CATALOG_HUB_TYPES.map(function (entry) { return entry.type; }).concat(LOOT_ENTRY_TYPES.map(function (entry) { return entry.type; })),
  game_settings_ui: PLAYER_RULES_HUB_TYPES.concat(UI_HUB_TYPES)
};

const AUTHORING_HUMAN_CATALOG_TYPES = new Set(CATALOG_HUB_TYPES.map(function (entry) { return entry.type; }));
const AUTHORING_HUMAN_SETTINGS_TYPES = new Set(PLAYER_RULES_HUB_TYPES.concat(UI_HUB_TYPES));

function graphNodeByIdInGraph(graph, nodeId) {
  return (graph.nodes || []).find(function (node) { return node.id === nodeId; }) || null;
}

function firstRootNodeOfType(graph, type) {
  return (graph.nodes || []).find(function (node) { return node.type === type && (node.parentId || null) === null; }) || null;
}

function identityFieldForType(type) {
  const fields = state.nodeTypes?.[type]?.fields || {};
  const entry = Object.entries(fields).find(function ([, field]) { return field?.type === "identity"; });
  return entry ? entry[0] : "";
}

function managedInternalTextIdFieldForType(type) {
  const fields = state.nodeTypes?.[type]?.fields || {};
  for (const key of ["moduleId", "hudId", "layoutId", "bindingId", "minimapId"]) {
    if (fields[key]?.type === "text" && fields[key]?.required) return key;
  }
  return "";
}

function primaryDisplayFieldForType(type) {
  const fields = state.nodeTypes?.[type]?.fields || {};
  const internalTextId = managedInternalTextIdFieldForType(type);
  for (const key of ["displayName", "label", "title", "gameName", "text", "hudId", "moduleId"]) {
    if (key === internalTextId) continue;
    if (fields[key]) return key;
  }
  return identityFieldForType(type);
}

function outputPortForDataType(type, dataType) {
  const outputs = state.nodeTypes?.[type]?.outputs || {};
  const entry = Object.entries(outputs).find(function ([, port]) {
    return port && String(port.dataType || "") === dataType;
  });
  return entry ? entry[0] : "";
}

function ensureGroupOutputPort(graph, group, portSpec) {
  if (!group || !portSpec?.name) return null;
  group.values = Object.assign({}, group.values || {});
  const current = group.values.groupInterface && typeof group.values.groupInterface === "object"
    ? clonePlain(group.values.groupInterface)
    : { inputs: [], outputs: [] };
  current.inputs = Array.isArray(current.inputs) ? current.inputs : [];
  current.outputs = Array.isArray(current.outputs) ? current.outputs : [];
  const existing = current.outputs.find(function (port) {
    return port && (port.name === portSpec.name || port.id === portSpec.id || port.dataType === portSpec.dataType);
  }) || null;
  if (existing) {
    if (!existing.id) existing.id = portSpec.id;
    if (!existing.name) existing.name = portSpec.name;
    if (!existing.label) existing.label = portSpec.label;
    if (!existing.dataType) existing.dataType = portSpec.dataType;
    if (existing.multiple === undefined) existing.multiple = Boolean(portSpec.multiple);
  } else {
    current.outputs.push(clonePlain(portSpec));
  }
  group.values.groupInterface = current;
  ensureGroupSystemNodesInGraph(graph, group.id);
  return graphNodeByIdInGraph(graph, editorGroupSystemNodeId(group.id, "output"));
}

function groupInterfaceOutputPortForDataType(group, dataType, preferredName) {
  const outputs = Array.isArray(group?.values?.groupInterface?.outputs) ? group.values.groupInterface.outputs : [];
  const preferred = String(preferredName || "").trim();
  if (preferred) {
    const preferredPort = outputs.find(function (port) {
      return port && String(port.dataType || "") === dataType && (port.name === preferred || port.id === preferred);
    });
    if (preferredPort) return preferredPort;
  }
  return outputs.find(function (port) {
    return port && String(port.dataType || "") === dataType;
  }) || null;
}

function groupInterfaceOutputPortNameForDataType(group, dataType, preferredName) {
  const port = groupInterfaceOutputPortForDataType(group, dataType, preferredName);
  return slugifyGroupPortName(port?.name || port?.id || preferredName || "", preferredName || "");
}

function rewriteGroupPackageEdgesToPort(graph, group, dataType, portName) {
  const resolvedPortName = String(portName || "").trim();
  if (!graph || !group || !resolvedPortName) return false;
  const systemOutputId = editorGroupSystemNodeId(group.id, "output");
  const graphNodeById = new Map((graph.nodes || []).map(function (node) { return [node.id, node]; }));
  let changed = false;
  for (const edge of graph.edges || []) {
    if (edge.toNodeId === systemOutputId) {
      const source = graphNodeById.get(edge.fromNodeId);
      const sourceOutput = state.nodeTypes?.[source?.type]?.outputs?.[edge.fromPort] || null;
      if (source && (source.parentId || null) === group.id && String(sourceOutput?.dataType || "") === dataType && edge.toPort !== resolvedPortName) {
        edge.toPort = resolvedPortName;
        changed = true;
      }
    }
    if (edge.fromNodeId === group.id) {
      const target = graphNodeById.get(edge.toNodeId);
      const targetInput = state.nodeTypes?.[target?.type]?.inputs?.[edge.toPort] || null;
      if (target && String(targetInput?.dataType || "") === dataType && edge.fromPort !== resolvedPortName) {
        edge.fromPort = resolvedPortName;
        changed = true;
      }
    }
  }
  return changed;
}

function ensureRootWorldAssemblyLink(graph, fromNodeId, fromPort, toPort) {
  const assembly = firstRootNodeOfType(graph, "world_assembly");
  if (!assembly) return false;
  return Boolean(pushEdgeIfMissing(graph, fromNodeId, fromPort, assembly.id, toPort));
}

function ensureCatalogRootPlumbing(graph, group, position, packagePortName) {
  let registry = firstRootNodeOfType(graph, "catalog_registry");
  if (!registry) {
    registry = {
      id: createZoneGraphId("node_catalog_registry"),
      type: "catalog_registry",
      title: "Catalog Registry",
      x: Math.round(Number(position?.x) || Number(group?.x) || 0) + 620,
      y: Math.round(Number(position?.y) || Number(group?.y) || 0),
      parentId: null,
      values: Object.assign({}, objectFunctionDefaultValuesForNodeType("catalog_registry"), {
        registryId: uniqueCanonicalGraphValue(graph, "catalog_registry.main")
      })
    };
    graph.nodes.push(registry);
  }
  const resolvedPackagePortName = packagePortName || groupInterfaceOutputPortNameForDataType(group, "catalogPackage", AUTHORING04_GROUP_OUTPUT_PORTS.catalog.name);
  if (group && resolvedPackagePortName) pushEdgeIfMissing(graph, group.id, resolvedPackagePortName, registry.id, "catalogPackage");
  ensureRootWorldAssemblyLink(graph, registry.id, "catalogRegistry", "catalogs");
  return registry;
}

function ensureCatalogGroupPackage(graph, group) {
  if (!group) return null;
  const groupOutput = ensureGroupOutputPort(graph, group, AUTHORING04_GROUP_OUTPUT_PORTS.catalog);
  let output = (graph.nodes || []).find(function (node) {
    return node.type === "catalog_output" && (node.parentId || null) === group.id;
  }) || null;
  if (!output) {
    output = {
      id: createZoneGraphId("node_catalog_output"),
      type: "catalog_output",
      title: "Catalog Output",
      x: 820,
      y: 120,
      parentId: group.id,
      values: Object.assign({}, objectFunctionDefaultValuesForNodeType("catalog_output"), {
        catalogId: uniqueCanonicalGraphValue(graph, "catalog." + (slugifyGroupPortName(group.values?.title || group.title || "main") || "main"))
      })
    };
    graph.nodes.push(output);
  }
  const packagePortName = groupInterfaceOutputPortNameForDataType(group, "catalogPackage", AUTHORING04_GROUP_OUTPUT_PORTS.catalog.name);
  rewriteGroupPackageEdgesToPort(graph, group, "catalogPackage", packagePortName);
  if (groupOutput) pushEdgeIfMissing(graph, output.id, "catalogPackage", groupOutput.id, packagePortName);
  ensureCatalogRootPlumbing(graph, group, { x: group.x, y: group.y }, packagePortName);
  for (const node of graph.nodes || []) {
    if ((node.parentId || null) !== group.id || node.id === output.id) continue;
    if (state.nodeTypes?.[node.type]?.outputs?.catalogDefinition) {
      pushEdgeIfMissing(graph, node.id, "catalogDefinition", output.id, "definitions");
    }
  }
  return output;
}

function ensurePlayerRulesGroupPackage(graph, group) {
  if (!group) return null;
  const groupOutput = ensureGroupOutputPort(graph, group, AUTHORING04_GROUP_OUTPUT_PORTS.player_rules);
  let output = (graph.nodes || []).find(function (node) {
    return node.type === "player_rules_output" && (node.parentId || null) === group.id;
  }) || null;
  if (!output) {
    output = {
      id: createZoneGraphId("node_player_rules_output"),
      type: "player_rules_output",
      title: "Player Rules Output",
      x: 820,
      y: 120,
      parentId: group.id,
      values: Object.assign({}, objectFunctionDefaultValuesForNodeType("player_rules_output"), {
        rulesId: uniqueCanonicalGraphValue(graph, "player_rules." + (slugifyGroupPortName(group.values?.title || group.title || "main") || "main"))
      })
    };
    graph.nodes.push(output);
  }
  const packagePortName = groupInterfaceOutputPortNameForDataType(group, "playerRules", AUTHORING04_GROUP_OUTPUT_PORTS.player_rules.name);
  rewriteGroupPackageEdgesToPort(graph, group, "playerRules", packagePortName);
  if (groupOutput) pushEdgeIfMissing(graph, output.id, "playerRules", groupOutput.id, packagePortName);
  ensureRootWorldAssemblyLink(graph, group.id, packagePortName, "playerRules");
  for (const node of graph.nodes || []) {
    if ((node.parentId || null) !== group.id || node.id === output.id) continue;
    const policyPort = outputPortForDataType(node.type, "policy");
    if (policyPort) pushEdgeIfMissing(graph, node.id, policyPort, output.id, "policy");
  }
  return output;
}

function ensureUiGroupPackage(graph, group) {
  if (!group) return null;
  const groupOutput = ensureGroupOutputPort(graph, group, AUTHORING04_GROUP_OUTPUT_PORTS.ui);
  let output = (graph.nodes || []).find(function (node) {
    return node.type === "ui_output" && (node.parentId || null) === group.id;
  }) || null;
  if (!output) {
    output = {
      id: createZoneGraphId("node_ui_output"),
      type: "ui_output",
      title: "UI Output",
      x: 820,
      y: 120,
      parentId: group.id,
      values: Object.assign({}, objectFunctionDefaultValuesForNodeType("ui_output"), {
        uiId: uniqueCanonicalGraphValue(graph, "ui." + (slugifyGroupPortName(group.values?.title || group.title || "main") || "main"))
      })
    };
    graph.nodes.push(output);
  }
  const packagePortName = groupInterfaceOutputPortNameForDataType(group, "uiPackage", AUTHORING04_GROUP_OUTPUT_PORTS.ui.name);
  rewriteGroupPackageEdgesToPort(graph, group, "uiPackage", packagePortName);
  if (groupOutput) pushEdgeIfMissing(graph, output.id, "uiPackage", groupOutput.id, packagePortName);
  ensureRootWorldAssemblyLink(graph, group.id, packagePortName, "ui");
  for (const node of graph.nodes || []) {
    if ((node.parentId || null) !== group.id || node.id === output.id) continue;
    const outputs = state.nodeTypes?.[node.type]?.outputs || {};
    if (outputs.uiModule) pushEdgeIfMissing(graph, node.id, "uiModule", output.id, "uiModules");
    if (outputs.ui) pushEdgeIfMissing(graph, node.id, "ui", output.id, "ui");
    if (outputs.minimap) pushEdgeIfMissing(graph, node.id, "minimap", output.id, "minimap");
    if (outputs.uiLayout) pushEdgeIfMissing(graph, node.id, "uiLayout", output.id, "uiLayout");
    if (outputs.menuLayout) pushEdgeIfMissing(graph, node.id, "menuLayout", output.id, "uiLayout");
  }
  return output;
}

function ensureManagedGroupPackage(graph, group) {
  const kind = normalizeEditorKey(group?.values?.groupKind);
  if (kind === "catalog") return ensureCatalogGroupPackage(graph, group);
  if (kind === "player_rules") return ensurePlayerRulesGroupPackage(graph, group);
  if (kind === "ui") return ensureUiGroupPackage(graph, group);
  return null;
}

async function createRootManagedGroup(kind, titleText) {
  const nextGraph = cloneGraphForRestore(state.graph);
  const center = viewportCenterInGraph();
  const title = String(titleText || "").trim() || (kind === "player_rules" ? "Player Rules" : kind === "ui" ? "UI" : "Catalog");
  const duplicate = (nextGraph.nodes || []).find(function (node) {
    return node.type === "group"
      && (node.parentId || null) === null
      && normalizeEditorKey(node.values?.groupKind) === normalizeEditorKey(kind)
      && normalizeEditorKey(node.values?.title || node.title) === normalizeEditorKey(title);
  }) || null;
  if (duplicate) {
    enterGroup(duplicate);
    setStatus(title + " Group bestond al; bestaande groep geopend.", "");
    return;
  }
  const group = {
    id: createZoneGraphId("node_group"),
    type: "group",
    title,
    x: Math.round(Number(center.x) || 80),
    y: Math.round(Number(center.y) || 80),
    parentId: null,
    values: Object.assign({}, objectFunctionDefaultValuesForNodeType("group"), {
      groupId: uniqueCanonicalGraphValue(nextGraph, slugifyGroupPortName(title, kind) || kind),
      title,
      groupKind: kind
    })
  };
  nextGraph.nodes.push(group);
  ensureManagedGroupPackage(nextGraph, group);
  await restoreGraphObject(nextGraph, {
    historyLabel: title + " Group aangemaakt",
    currentGroupId: group.id,
    selectedNodeIds: [group.id],
    selectedEdgeIds: [],
    refreshViewport: false,
    refreshValidation: true,
    afterApply: function () {
      enterGroup(group);
      setStatus(title + " Group aangemaakt.", "success");
    }
  });
}

function questTargetBindingsForModel(model, graph = state.graph) {
  if (!model) return [];
  const bindings = new Map();
  const assembly = objectFunctionAssemblyForModel(model, graph);
  for (const binding of objectFunctionQuestBindingsForAssembly(graph, assembly)) bindings.set(binding.id, binding);
  for (const edge of graph.edges || []) {
    if (edge.fromNodeId !== model.id || edge.fromPort !== "entity" || edge.toPort !== "entity") continue;
    const node = graphNodeByIdInGraph(graph, edge.toNodeId);
    if (node?.type === "quest_target_binding") bindings.set(node.id, node);
  }
  return Array.from(bindings.values());
}

function modelAuthoringReferenceInfo(model, graph = state.graph) {
  if (!model) return { model: null, assembly: null, target: null, refs: new Set(), nodes: new Set() };
  const context = objectFunctionContextForModel(model, graph);
  const questBindings = questTargetBindingsForModel(model, graph);
  const refs = new Set();
  const nodes = new Set([model.id]);
  if (context.assembly) {
    nodes.add(context.assembly.id);
    const entityId = normalizeCanonicalId(context.assembly.values?.entityId, "");
    if (entityId) refs.add(entityId);
  }
  for (const binding of questBindings) {
    nodes.add(binding.id);
    const targetId = normalizeCanonicalId(binding.values?.targetId, "");
    if (targetId) refs.add(targetId);
  }
  for (const component of [context.interactionComponent, context.npcComponent, context.enemyComponent]) {
    if (component) nodes.add(component.id);
  }
  return { model, assembly: context.assembly, target: questBindings[0] || context.questBinding || null, questBindings, refs, nodes, context };
}

function selectedModelAuthoringReferenceInfo(graph = state.graph) {
  return modelAuthoringReferenceInfo(selectedSingleModelNode(), graph);
}

function questDialogueReferencesForObjectContext(context, graph = state.graph) {
  const refs = new Set();
  const entityRef = normalizeCanonicalId(context?.assembly?.values?.entityId, "");
  const targetRef = normalizeCanonicalId(context?.questBinding?.values?.targetId, "");
  if (entityRef) refs.add(entityRef);
  if (targetRef) refs.add(targetRef);
  if (!refs.size) return { quests: [], dialogues: [], others: [] };
  const quests = [];
  const dialogues = [];
  const others = [];
  for (const node of graph.nodes || []) {
    if (!nodeReferencesAny(node, refs)) continue;
    if (node.type === "quest_definition") quests.push(node);
    else if (node.type === "dialogue_definition") dialogues.push(node);
    else if (node.type !== "quest_target_binding") others.push(node);
  }
  return { quests, dialogues, others };
}

function catalogDefinitionNodeIdsForObjectContext(context, graph = state.graph) {
  const catalogRefs = new Set();
  for (const component of [context?.interactionComponent, context?.npcComponent, context?.enemyComponent]) {
    if (!component) continue;
    const fields = state.nodeTypes?.[component.type]?.fields || {};
    for (const [key, field] of Object.entries(fields)) {
      if (field?.type === "reference") {
        const ref = normalizeCanonicalId(component.values?.[key], "");
        if (ref) catalogRefs.add(ref);
      } else if (field?.type === "referenceList") {
        for (const ref of normalizeReferenceList(component.values?.[key])) catalogRefs.add(ref);
      }
    }
  }
  const ids = new Set();
  if (!catalogRefs.size) return ids;
  const catalogTypes = new Set(AUTHORING_ROUTE_COUNT_TYPES.item_ability_stat || []);
  for (const node of graph.nodes || []) {
    if (!catalogTypes.has(node.type)) continue;
    const idField = identityFieldForType(node.type);
    if (!idField) continue;
    if (catalogRefs.has(normalizeCanonicalId(node.values?.[idField], ""))) ids.add(node.id);
  }
  return ids;
}

function renderObjectFunctionReadOnlyInfo(context) {
  const wrap = document.createElement("div");
  wrap.className = "authoring04ReadOnly";
  const title = document.createElement("div");
  title.className = "objectFunctionMeta";
  title.textContent = "Bestaande onderdelen";
  wrap.appendChild(title);
  const rows = [
    ["Model", context.model ? nodeDisplayTitle(context.model) : "geen selectie"],
    ["Entity Assembly", context.assembly ? (nodeDisplayTitle(context.assembly) + " · " + (context.assembly.values?.entityId || "")) : "nog niet aangemaakt"],
    ["Interactable", context.interactionComponent ? nodeDisplayTitle(context.interactionComponent) : "geen"],
    ["NPC", context.npcComponent ? nodeDisplayTitle(context.npcComponent) : "geen"],
    ["Enemy", context.enemyComponent ? nodeDisplayTitle(context.enemyComponent) : "geen"],
    ["Quest Target", context.questBinding ? (nodeDisplayTitle(context.questBinding) + " · " + (context.questBinding.values?.targetId || "")) : "geen"]
  ];
  for (const [labelText, valueText] of rows) {
    const row = document.createElement("div");
    row.className = "authoring04ReadOnlyRow";
    const label = document.createElement("span");
    label.textContent = labelText;
    const value = document.createElement("span");
    value.textContent = valueText;
    row.append(label, value);
    wrap.appendChild(row);
  }
  const references = questDialogueReferencesForObjectContext(context, state.graph);
  const referenceTitle = document.createElement("div");
  referenceTitle.className = "objectFunctionMeta";
  referenceTitle.textContent = "Quest/Dialoog verwijzingen";
  wrap.appendChild(referenceTitle);
  const refRows = []
    .concat(references.quests.map(function (node) { return ["Quest", nodeDisplayTitle(node)]; }))
    .concat(references.dialogues.map(function (node) { return ["Dialoog", nodeDisplayTitle(node)]; }));
  if (!refRows.length) {
    const empty = document.createElement("div");
    empty.className = "objectFunctionDraftHint";
    empty.textContent = "Geen bestaande quests of dialogen verwijzen naar deze selectie.";
    wrap.appendChild(empty);
  } else {
    for (const [labelText, valueText] of refRows) {
      const row = document.createElement("div");
      row.className = "authoring04ReadOnlyRow";
      const label = document.createElement("span");
      label.textContent = labelText;
      const value = document.createElement("span");
      value.textContent = valueText;
      row.append(label, value);
      wrap.appendChild(row);
    }
  }
  return wrap;
}

function nodeReferencesAny(node, refs) {
  if (!node || !refs || !refs.size) return false;
  const fields = state.nodeTypes?.[node.type]?.fields || {};
  for (const [key, field] of Object.entries(fields)) {
    const value = node.values?.[key];
    if (field?.type === "reference" && refs.has(normalizeCanonicalId(value, ""))) return true;
    if (field?.type === "referenceList") {
      for (const ref of normalizeReferenceList(value)) {
        if (refs.has(ref)) return true;
      }
    }
  }
  return false;
}

function questDialogueDefinitionIdsForRefs(refs, graph = state.graph) {
  const ids = new Set();
  if (!refs || !refs.size) return ids;
  const nodeById = new Map((graph.nodes || []).map(function (node) { return [node.id, node]; }));
  function addOwners(startNode) {
    const queue = [{ node: startNode, depth: 0 }];
    const seen = new Set();
    while (queue.length) {
      const current = queue.shift();
      const node = current.node;
      if (!node || seen.has(node.id) || current.depth > 5) continue;
      seen.add(node.id);
      if (node.type === "quest_definition" || node.type === "dialogue_definition") {
        ids.add(node.id);
        continue;
      }
      for (const edge of graph.edges || []) {
        if (edge.fromNodeId !== node.id) continue;
        const owner = nodeById.get(edge.toNodeId);
        if (owner) queue.push({ node: owner, depth: current.depth + 1 });
      }
    }
  }
  for (const node of graph.nodes || []) {
    if (!nodeReferencesAny(node, refs)) continue;
    addOwners(node);
  }
  return ids;
}

function authoringWorkspaceContentNodeIds(routeId, workspace, graph = state.graph) {
  const ids = new Set();
  if (!workspace) return ids;
  if (routeId === "world_zone") {
    if (isZoneCanvasGroup(workspace, graph) && (workspace.parentId || null) === null) ids.add(workspace.id);
    return ids;
  }
  for (const node of graph.nodes || []) {
    if ((node.parentId || null) !== workspace.id) continue;
    if (routeId === "quest_dialogue" && (node.type === "quest_definition" || node.type === "dialogue_definition")) ids.add(node.id);
    if (routeId === "item_ability_stat" && AUTHORING_HUMAN_CATALOG_TYPES.has(node.type)) ids.add(node.id);
    if (routeId === "game_settings_ui" && AUTHORING_HUMAN_SETTINGS_TYPES.has(node.type)) ids.add(node.id);
  }
  return ids;
}

function authoringRouteNodeIds(routeId, graph = state.graph) {
  const ids = new Set();
  if (routeId === "object_character") {
    for (const node of graph.nodes || []) if (node.type === "model_entity") ids.add(node.id);
    return ids;
  }
  const workspaces = authoringWorkspacesForRoute(routeId, graph);
  for (const workspaceGroup of workspaces) {
    for (const workspace of workspaceGroup.nodes || []) {
      for (const id of authoringWorkspaceContentNodeIds(routeId, workspace, graph)) ids.add(id);
    }
  }
  for (const node of graph.nodes || []) {
    if (routeId === "world_zone" && isZoneCanvasGroup(node, graph) && (node.parentId || null) === null) ids.add(node.id);
  }
  return ids;
}

function selectedAuthoringRouteNodeIds(routeId, graph = state.graph) {
  const selected = selectedModelAuthoringReferenceInfo(graph);
  if (!selected.model) return new Set();
  const ids = new Set();
  if (routeId === "world_zone") {
    if (selected.context?.zoneGroup) ids.add(selected.context.zoneGroup.id);
    return ids;
  }
  if (routeId === "object_character") return new Set(Array.from(selected.nodes));
  if (routeId === "item_ability_stat") return catalogDefinitionNodeIdsForObjectContext(selected.context, graph);
  if (routeId === "quest_dialogue") return questDialogueDefinitionIdsForRefs(selected.refs, graph);
  const routeIds = authoringRouteNodeIds(routeId, graph);
  for (const node of graph.nodes || []) {
    if (!routeIds.has(node.id)) continue;
    if (selected.nodes.has(node.id) || nodeReferencesAny(node, selected.refs)) ids.add(node.id);
  }
  return ids;
}

function authoringRouteCount(routeId, graph = state.graph) {
  const selected = selectedSingleModelNode();
  const ids = selected ? selectedAuthoringRouteNodeIds(routeId, graph) : authoringRouteNodeIds(routeId, graph);
  return {
    count: ids.size,
    selected: Boolean(selected),
    title: selected
      ? "Selectie: " + ids.size + " gekoppelde/verwijzende onderdelen voor deze route."
      : "Totaal: " + ids.size + " relevante onderdelen voor deze route."
  };
}

function appendReadOnlyCountBadge(parent, routeId, graph = state.graph) {
  const badgeInfo = authoringRouteCount(routeId, graph);
  const badge = document.createElement("span");
  badge.className = "authoringCountBadge";
  badge.textContent = String(badgeInfo.count);
  badge.title = badgeInfo.title;
  badge.setAttribute("aria-label", badgeInfo.title);
  parent.appendChild(badge);
  return badge;
}

function authoringWorkspaceCount(routeId, workspace, graph = state.graph) {
  const selected = selectedSingleModelNode();
  const selectedInfo = selectedModelAuthoringReferenceInfo(graph);
  const ids = new Set();
  if (!selected) {
    for (const id of authoringWorkspaceContentNodeIds(routeId, workspace, graph)) ids.add(id);
    return {
      count: ids.size,
      selected: false,
      title: "Totaal: " + ids.size + " menselijke onderdelen in deze werkruimte."
    };
  }
  if (routeId === "world_zone" && selectedInfo.context?.zoneGroup?.id === workspace?.id) ids.add(workspace.id);
  if (selected && routeId === "world_zone") {
    return {
      count: ids.size,
      selected: true,
      title: "Selectie: " + ids.size + " Zone Canvas voor deze selectie."
    };
  }
  if (selected && routeId === "item_ability_stat") {
    const catalogIds = catalogDefinitionNodeIdsForObjectContext(selectedInfo.context, graph);
    for (const node of graph.nodes || []) {
      if ((node.parentId || null) === workspace.id && catalogIds.has(node.id)) ids.add(node.id);
    }
    return {
      count: ids.size,
      selected: true,
      title: "Selectie: " + ids.size + " gekoppelde/verwijzende onderdelen in deze werkruimte."
    };
  }
  if (selected && routeId === "quest_dialogue") {
    const questIds = questDialogueDefinitionIdsForRefs(selectedInfo.refs, graph);
    for (const node of graph.nodes || []) {
      if ((node.parentId || null) === workspace.id && questIds.has(node.id)) ids.add(node.id);
    }
    return {
      count: ids.size,
      selected: true,
      title: "Selectie: " + ids.size + " quests/dialogen in deze werkruimte."
    };
  }
  for (const node of graph.nodes || []) {
    if ((node.parentId || null) !== workspace.id) continue;
    if (selected && !selectedInfo.nodes.has(node.id) && !nodeReferencesAny(node, selectedInfo.refs)) continue;
    ids.add(node.id);
  }
  return {
    count: ids.size,
    selected: Boolean(selected),
    title: selected
      ? "Selectie: " + ids.size + " gekoppelde/verwijzende onderdelen in deze werkruimte."
      : "Totaal: " + ids.size + " relevante onderdelen in deze werkruimte."
  };
}

function appendWorkspaceCountBadge(parent, routeId, workspace, graph = state.graph) {
  const info = authoringWorkspaceCount(routeId, workspace, graph);
  const badge = document.createElement("span");
  badge.className = "authoringCountBadge authoringCountBadge--workspace";
  badge.textContent = String(info.count);
  badge.title = info.title;
  badge.setAttribute("aria-label", info.title);
  parent.appendChild(badge);
}

function zoneCanvasDisplayName(group, graph = state.graph) {
  const zone = zoneDefinitionForGroup(group?.id, graph);
  return String(zone?.values?.displayName || group?.values?.title || group?.title || zoneCanvasTitle(zoneCanvasGridForGroup(group, graph))).trim();
}

function beginZoneCanvasDraft(sourceGroup, directionName) {
  const direction = directionName ? ZONE_CANVAS_DIRECTIONS[directionName] : null;
  if (directionName && (!sourceGroup || !direction)) return;
  if (sourceGroup && !isZoneCanvasGroup(sourceGroup, state.graph)) return;
  const sourceGrid = sourceGroup ? zoneCanvasGridForGroup(sourceGroup, state.graph) : null;
  const grid = direction
    ? { x: sourceGrid.x + direction.dx, z: sourceGrid.z + direction.dz }
    : { x: 0, z: 0 };
  const occupied = findZoneCanvasAtGrid(null, grid, state.graph);
  if (occupied) {
    selectNode(occupied.id, true, { clearPendingEdge: true });
    setStatus("Die zijde is al bezet door " + zoneCanvasDisplayName(occupied) + ".", "error");
    return;
  }
  state.zoneCanvasDraft = {
    sourceGroupId: sourceGroup?.id || null,
    directionName: directionName || "",
    name: zoneCanvasTitle(grid),
    basisMode: "empty",
    grid
  };
  selectAuthoringRoute("world_zone");
}

function cancelZoneCanvasDraft() {
  state.zoneCanvasDraft = null;
  renderAuthoringHub();
}

function copySafeZoneBasisValues(nextGraph, sourceGroup, targetGroup, basis) {
  if (!sourceGroup || !targetGroup || !basis) return;
  const sourceZone = zoneDefinitionForGroup(sourceGroup.id, nextGraph);
  const sourceEnvironment = (nextGraph.nodes || []).find(function (node) { return node.parentId === sourceGroup.id && node.type === "zone_environment_settings"; }) || null;
  const sourceRules = (nextGraph.nodes || []).find(function (node) { return node.parentId === sourceGroup.id && node.type === "zone_gameplay_rules"; }) || null;
  const sourceGround = (nextGraph.nodes || []).find(function (node) { return node.parentId === sourceGroup.id && node.type === "ground_surface"; }) || null;
  const targetZone = basis.nodes?.zone;
  if (sourceZone && targetZone) {
    const keep = {
      zoneId: targetZone.values.zoneId,
      displayName: targetZone.values.displayName,
      originX: targetZone.values.originX,
      originY: targetZone.values.originY,
      originZ: targetZone.values.originZ,
      width: targetZone.values.width,
      depth: targetZone.values.depth
    };
    targetZone.values = Object.assign({}, sourceZone.values || {}, keep);
  }
  if (sourceEnvironment && basis.nodes?.environment) {
    const environmentId = basis.nodes.environment.values.environmentId;
    basis.nodes.environment.values = Object.assign({}, sourceEnvironment.values || {}, { environmentId });
  }
  if (sourceRules && basis.nodes?.rules) {
    const rulesId = basis.nodes.rules.values.rulesId;
    basis.nodes.rules.values = Object.assign({}, sourceRules.values || {}, { rulesId });
  }
  if (sourceGround && basis.nodes?.ground) {
    const keep = {
      groundId: basis.nodes.ground.values.groundId,
      minX: basis.nodes.ground.values.minX,
      maxX: basis.nodes.ground.values.maxX,
      minZ: basis.nodes.ground.values.minZ,
      maxZ: basis.nodes.ground.values.maxZ,
      width: basis.nodes.ground.values.width,
      depth: basis.nodes.ground.values.depth
    };
    basis.nodes.ground.values = Object.assign({}, sourceGround.values || {}, keep);
  }
  syncZoneCanvasBoundsToGrid(nextGraph, targetGroup, zoneCanvasGridForGroup(targetGroup, nextGraph));
}

async function commitZoneCanvasDraft() {
  const draft = state.zoneCanvasDraft;
  if (!draft) return;
  const name = String(draft.name || "").trim();
  if (!name) {
    setStatus("Vul eerst een zonenaam in.", "error");
    return;
  }
  const grid = draft.grid || { x: 0, z: 0 };
  const direction = draft.directionName ? ZONE_CANVAS_DIRECTIONS[draft.directionName] : null;
  const source = draft.sourceGroupId ? nodeById(draft.sourceGroupId) : null;
  if (direction && (!source || !isZoneCanvasGroup(source, state.graph))) {
    setStatus("De bronzone bestaat niet meer.", "error");
    return;
  }
  const occupied = findZoneCanvasAtGrid(null, grid, state.graph);
  if (occupied) {
    selectNode(occupied.id, true, { clearPendingEdge: true });
    setStatus("Die zijde is al bezet door " + zoneCanvasDisplayName(occupied) + ".", "error");
    return;
  }
  const nextGraph = cloneGraphForRestore(state.graph);
  normalizeZoneCanvasGroups(nextGraph, null);
  const nextSource = source ? graphNodeByIdInGraph(nextGraph, source.id) : null;
  const firstZone = !(nextGraph.nodes || []).some(function (node) { return node.type === "zone_definition"; });
  const result = appendZoneCanvasGroup(nextGraph, {
    parentId: null,
    grid,
    position: direction && nextSource
      ? {
          x: Math.round(Number(nextSource.x) + direction.graphX * ZONE_CANVAS_NODE_STEP_X),
          y: Math.round(Number(nextSource.y) + direction.graphY * ZONE_CANVAS_NODE_STEP_Y)
        }
      : zoneCanvasGraphPosition(null, grid, nextGraph),
    root: null,
    isRoot: true
  });
  result.group.title = name;
  result.group.values = Object.assign({}, result.group.values || {}, {
    title: name,
    zoneGridX: grid.x,
    zoneGridZ: grid.z,
    zoneGridY: grid.z,
    zoneCanvasRootId: result.group.id,
    zoneCanvasParentZoneId: "",
    zoneCanvasParentSide: ""
  });
  if (result.basis?.nodes?.zone) {
    result.basis.nodes.zone.title = "Zone Definition";
    result.basis.nodes.zone.values = Object.assign({}, result.basis.nodes.zone.values || {}, { displayName: name });
  }
  if (draft.basisMode === "copy" && nextSource) {
    copySafeZoneBasisValues(nextGraph, nextSource, result.group, result.basis);
  }
  normalizeZoneCanvasGroups(nextGraph, null);
  ensureProjectStartZone(nextGraph, result.basis.zoneId, result.basis.spawnId, firstZone);
  await restoreGraphObject(nextGraph, {
    historyLabel: direction ? "Nieuwe zone " + direction.label.toLowerCase() : "Nieuwe startzone",
    selectedNodeIds: [result.group.id],
    selectedEdgeIds: [],
    refreshViewport: true,
    refreshValidation: true,
    afterApply: function () {
      state.zoneCanvasDraft = null;
      focusGraphNode(result.group.id);
      setStatus("Zone \"" + name + "\" aangemaakt.", "success");
    }
  });
}

async function renameZoneCanvasGroup(group) {
  if (!group || !isZoneCanvasGroup(group, state.graph)) return;
  const current = zoneCanvasDisplayName(group, state.graph);
  const nextName = window.prompt("Nieuwe zonenaam", current);
  if (nextName === null) return;
  const name = String(nextName || "").trim();
  if (!name) {
    setStatus("Zonenaam mag niet leeg zijn.", "error");
    return;
  }
  const nextGraph = cloneGraphForRestore(state.graph);
  const nextGroup = graphNodeByIdInGraph(nextGraph, group.id);
  const zone = zoneDefinitionForGroup(group.id, nextGraph);
  if (!nextGroup) return;
  nextGroup.title = name;
  nextGroup.values = Object.assign({}, nextGroup.values || {}, { title: name });
  if (zone) zone.values = Object.assign({}, zone.values || {}, { displayName: name });
  await restoreGraphObject(nextGraph, {
    historyLabel: "Zone hernoemd",
    selectedNodeIds: [group.id],
    selectedEdgeIds: [],
    refreshViewport: false,
    refreshValidation: true,
    afterApply: function () { setStatus("Zone hernoemd.", "success"); }
  });
}

async function deleteZoneCanvasGroup(group) {
  if (!group || !isZoneCanvasGroup(group, state.graph)) return;
  const zone = zoneDefinitionForGroup(group.id, state.graph);
  const zoneId = normalizeCanonicalId(zone?.values?.zoneId, "");
  const children = (state.graph.nodes || []).filter(function (node) { return node.parentId === group.id; });
  const contentCount = children.filter(function (node) {
    return !["group_input", "group_output", "zone_definition", "zone_environment_settings", "zone_gameplay_rules", "ground_surface", "spawn_point", "zone_output"].includes(node.type);
  }).length;
  const ok = window.confirm("Zone \"" + zoneCanvasDisplayName(group) + "\" verwijderen? Dit verwijdert de zonegroep en " + children.length + " interne node(s)" + (contentCount ? ", inclusief " + contentCount + " content-node(s)" : "") + ".");
  if (!ok) return;
  const removeIds = new Set([group.id].concat(children.map(function (node) { return node.id; })));
  const nextGraph = cloneGraphForRestore(state.graph);
  nextGraph.nodes = (nextGraph.nodes || []).filter(function (node) { return !removeIds.has(node.id); });
  nextGraph.edges = (nextGraph.edges || []).filter(function (edge) {
    return !removeIds.has(edge.fromNodeId) && !removeIds.has(edge.toNodeId);
  });
  for (const node of nextGraph.nodes || []) {
    if (node.type !== "game_project_settings") continue;
    node.values = Object.assign({}, node.values || {});
    if (zoneId && node.values.startZoneRef === zoneId) node.values.startZoneRef = null;
    if (zoneId && String(node.values.startSpawnRef || "").startsWith("spawn." + zoneId.replace(/^zone\./, ""))) node.values.startSpawnRef = null;
  }
  normalizeZoneCanvasGroups(nextGraph, null);
  await restoreGraphObject(nextGraph, {
    historyLabel: "Zone verwijderd",
    selectedNodeIds: [],
    selectedEdgeIds: [],
    refreshViewport: true,
    refreshValidation: true,
    afterApply: function () {
      if (state.currentGroupId === group.id) state.currentGroupId = null;
      setStatus("Zone verwijderd.", "success");
    }
  });
}

function renderZoneCanvasDraftCard() {
  const draft = state.zoneCanvasDraft;
  if (!draft) return null;
  const card = document.createElement("div");
  card.className = "objectFunctionDraftCard authoring04DraftCard";
  const direction = draft.directionName ? ZONE_CANVAS_DIRECTIONS[draft.directionName] : null;
  const title = document.createElement("div");
  title.className = "objectFunctionDraftTitle";
  title.textContent = direction ? "Nieuwe zone " + direction.label.toLowerCase() : "Nieuwe startzone";
  card.appendChild(title);
  const fields = document.createElement("div");
  fields.className = "objectFunctionDraftFields";
  fields.appendChild(objectFunctionDraftFieldRow("Zonenaam", questTimelineTextInput(draft.name, function (value) {
    draft.name = value;
  }, { placeholder: "Bijv. Bosrand" })));
  const basisSelect = questTimelineSelectInput(draft.basisMode || "empty", [
    "empty",
    "copy"
  ], function (value) {
    draft.basisMode = value === "copy" ? "copy" : "empty";
    renderAuthoringHub();
  });
  for (const option of basisSelect.options) {
    if (option.value === "empty") option.textContent = "Lege zone";
    if (option.value === "copy") option.textContent = "Veilige basisinstellingen overnemen";
  }
  basisSelect.disabled = !draft.sourceGroupId;
  fields.appendChild(objectFunctionDraftFieldRow("Basis", basisSelect, draft.sourceGroupId ? "Kopieert alleen veilige basisinstellingen; modellen en content blijven achter." : "De eerste zone gebruikt veilige standaardinstellingen."));
  card.appendChild(fields);
  const actions = document.createElement("div");
  actions.className = "objectFunctionDraftActions";
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "primary";
  confirm.textContent = "Zone maken";
  confirm.addEventListener("click", function () { void commitZoneCanvasDraft(); });
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "ghost";
  cancel.textContent = "Annuleren";
  cancel.addEventListener("click", cancelZoneCanvasDraft);
  actions.append(confirm, cancel);
  card.appendChild(actions);
  return card;
}

function renderWorldZoneHub() {
  const wrap = document.createElement("div");
  wrap.className = "objectFunctionSection authoring04Hub";
  const header = document.createElement("div");
  header.className = "objectFunctionHeader";
  const title = document.createElement("div");
  title.className = "objectFunctionTitle";
  title.textContent = "Wereld / Zone";
  const intro = document.createElement("div");
  intro.className = "objectFunctionIntro";
  intro.textContent = "Zone Canvassen staan root-level en gebruiken gridposities. Bezette zijden blijven geblokkeerd.";
  header.append(title, intro);
  wrap.appendChild(header);
  const draftCard = renderZoneCanvasDraftCard();
  if (draftCard) wrap.appendChild(draftCard);
  const zones = zoneCanvasGroupsForParent(null, state.graph).sort(function (a, b) {
    const ga = zoneCanvasGridForGroup(a, state.graph);
    const gb = zoneCanvasGridForGroup(b, state.graph);
    return ga.z - gb.z || ga.x - gb.x || zoneCanvasDisplayName(a).localeCompare(zoneCanvasDisplayName(b), "nl", { sensitivity: "base" });
  });
  if (!zones.length) {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "primary";
    action.textContent = "Nieuwe startzone";
    action.addEventListener("click", function () { beginZoneCanvasDraft(null, ""); });
    wrap.appendChild(action);
    return wrap;
  }
  const list = document.createElement("div");
  list.className = "authoring04List";
  for (const zoneGroup of zones) {
    const row = document.createElement("div");
    row.className = "authoring04ListItem";
    const body = document.createElement("div");
    body.className = "authoring04ListBody";
    const name = document.createElement("div");
    name.className = "authoring04ListTitle";
    name.textContent = zoneCanvasDisplayName(zoneGroup);
    const grid = zoneCanvasGridForGroup(zoneGroup, state.graph);
    const meta = document.createElement("div");
    meta.className = "authoring04ListMeta";
    meta.textContent = "Grid X " + grid.x + " / Y " + grid.z + " · " + zoneCanvasChildSummary(zoneGroup).join(" · ");
    body.append(name, meta);
    const actions = document.createElement("div");
    actions.className = "authoring04Actions";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "mini";
    open.textContent = "Open";
    open.addEventListener("click", function () { enterGroup(zoneGroup); });
    const rename = document.createElement("button");
    rename.type = "button";
    rename.className = "mini";
    rename.textContent = "Hernoem";
    rename.addEventListener("click", function () { void renameZoneCanvasGroup(zoneGroup); });
    const repair = document.createElement("button");
    repair.type = "button";
    repair.className = "mini";
    repair.textContent = "Basis beheren";
    repair.addEventListener("click", function () { void repairZoneCanvasBasis(zoneGroup.id); });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "deleteNode";
    remove.textContent = "Verwijder";
    remove.addEventListener("click", function () { void deleteZoneCanvasGroup(zoneGroup); });
    actions.append(open, rename, repair, remove);
    const directions = document.createElement("div");
    directions.className = "authoring04DirectionRow";
    for (const [directionName, direction] of Object.entries(ZONE_CANVAS_DIRECTIONS)) {
      const targetGrid = { x: grid.x + direction.dx, z: grid.z + direction.dz };
      const occupied = findZoneCanvasAtGrid(null, targetGrid, state.graph);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mini";
      button.textContent = "+ " + direction.label;
      button.disabled = Boolean(occupied);
      button.title = occupied
        ? "Bezet door " + zoneCanvasDisplayName(occupied)
        : "Nieuwe root-level zone " + direction.label.toLowerCase() + " van deze zone.";
      button.addEventListener("click", function () { beginZoneCanvasDraft(zoneGroup, directionName); });
      directions.appendChild(button);
    }
    row.append(body, actions, directions);
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

function currentGroupOfKind(kind, graph = state.graph) {
  if (!state.currentGroupId) return null;
  const group = graphNodeByIdInGraph(graph, state.currentGroupId);
  return group?.type === "group" && normalizeEditorKey(group.values?.groupKind) === kind ? group : null;
}

function managedDefaultValuesForDraft(type, node = null) {
  const values = Object.assign({}, objectFunctionDefaultValuesForNodeType(type), node ? clonePlain(node.values || {}) : {});
  return values;
}

function managedCanonicalBaseForType(type, values) {
  const idField = identityFieldForType(type);
  const field = state.nodeTypes?.[type]?.fields?.[idField] || {};
  const fallback = String(field.default || type + ".new").trim() || type + ".new";
  const display = String(values?.displayName || values?.label || values?.title || values?.moduleId || values?.hudId || state.nodeTypes?.[type]?.label || type).trim();
  const slug = slugifyGroupPortName(display || type, type) || "new";
  const parts = fallback.split(".");
  if (parts.length > 1) {
    parts[parts.length - 1] = slug;
    return parts.join(".");
  }
  return fallback + "." + slug;
}

function managedSuggestedNodePosition(graph, group, type) {
  const siblings = (graph.nodes || []).filter(function (node) {
    return (node.parentId || null) === group.id && node.type === type;
  });
  if (!siblings.length) return { x: 80, y: 180 };
  const lowest = siblings.slice().sort(function (a, b) {
    return (Number(a.y) || 0) - (Number(b.y) || 0);
  }).pop();
  return { x: Number(lowest.x) || 80, y: Math.round((Number(lowest.y) || 180) + graphNodeHeightForStack(lowest) + 24) };
}

function setManagedDraftValue(scope, key, value) {
  const draft = scope === "catalog" ? state.catalogHubDraft : state.settingsHubDraft;
  if (!draft) return;
  draft.values = Object.assign({}, draft.values || {}, { [key]: value });
}

function buildReferenceListPickerControl(scope, draft, fieldName, field, value) {
  const wrap = document.createElement("div");
  wrap.className = "referenceListPicker";
  const refs = normalizeReferenceList(value);
  const list = document.createElement("div");
  list.className = "referenceListPickerChips";
  if (!refs.length) {
    const empty = document.createElement("div");
    empty.className = "objectFunctionDraftHint";
    empty.textContent = "Geen references gekozen.";
    list.appendChild(empty);
  }
  refs.forEach(function (ref) {
    const chip = document.createElement("span");
    chip.className = "referenceListChip";
    const fakeField = Object.assign({}, field, { type: "reference", allowNull: true });
    const resolved = referencePickerChoiceState(ref, fakeField);
    chip.textContent = resolved.displayLabel || ref;
    chip.title = ref;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "x";
    remove.title = "Reference verwijderen";
    remove.addEventListener("click", function () {
      const nextRefs = refs.filter(function (candidate) { return candidate !== ref; });
      setManagedDraftValue(scope, fieldName, nextRefs);
      renderAuthoringHub();
    });
    chip.appendChild(remove);
    list.appendChild(chip);
  });
  wrap.appendChild(list);
  const pickerField = Object.assign({}, field, { type: "reference", allowNull: true, required: false });
  const fakeNode = { id: scope + "-ref-list-" + draft.type + "-" + fieldName, type: draft.type, values: {} };
  wrap.appendChild(buildReferencePickerField(fakeNode, fieldName, pickerField, null, {
    onChange: function (nextValue) {
      const normalized = normalizeCanonicalId(nextValue, "");
      if (!normalized) return;
      const nextRefs = Array.from(new Set(refs.concat([normalized])));
      setManagedDraftValue(scope, fieldName, nextRefs);
      renderAuthoringHub();
    },
    openCatalogAction: questTimelineReferenceNavigationAction(pickerField)?.action,
    openReferenceActionLabel: questTimelineReferenceNavigationAction(pickerField)?.label,
    openReferenceActionTitle: questTimelineReferenceNavigationAction(pickerField)?.title,
    hideAdvanced: true
  }));
  return wrap;
}

function buildTagQueryControl(scope, draft, fieldName, value) {
  const current = normalizeTagQuery(value);
  const wrap = document.createElement("div");
  wrap.className = "tagQueryEditor";
  function addRow(key, labelText) {
    const row = document.createElement("label");
    row.className = "tagQueryRow";
    const label = document.createElement("span");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "text";
    input.value = (current[key] || []).join(", ");
    input.placeholder = "tag.een, tag.twee";
    input.addEventListener("change", function () {
      const next = Object.assign({}, current, {
        [key]: normalizeTagList(input.value)
      });
      setManagedDraftValue(scope, fieldName, next);
      renderAuthoringHub();
    });
    row.append(label, input);
    wrap.appendChild(row);
  }
  addRow("all", "Alle tags");
  addRow("any", "Een van");
  addRow("none", "Niet");
  return wrap;
}

function buildFormulaControl(scope, draft, fieldName, value) {
  const current = value && typeof value === "object" ? clonePlain(value) : { operator: "add", operands: [] };
  const wrap = document.createElement("div");
  wrap.className = "formulaEditor";
  const operator = document.createElement("select");
  for (const option of ["add", "subtract", "multiply", "divide", "min", "max", "value"]) {
    const opt = document.createElement("option");
    opt.value = option;
    opt.textContent = option;
    operator.appendChild(opt);
  }
  operator.value = String(current.operator || "add");
  operator.addEventListener("change", function () {
    setManagedDraftValue(scope, fieldName, Object.assign({}, current, { operator: operator.value }));
    renderAuthoringHub();
  });
  const operands = document.createElement("input");
  operands.type = "text";
  operands.value = Array.isArray(current.operands) ? current.operands.join(", ") : "";
  operands.placeholder = "0, 1, 2";
  operands.addEventListener("change", function () {
    const nextOperands = operands.value.split(",").map(function (entry) {
      const number = Number(entry.trim());
      return Number.isFinite(number) ? number : entry.trim();
    }).filter(function (entry) { return entry !== ""; });
    setManagedDraftValue(scope, fieldName, Object.assign({}, current, { operator: operator.value, operands: nextOperands }));
    renderAuthoringHub();
  });
  wrap.append(operator, operands);
  return wrap;
}

function selectOptionsForManagedField(field, draft) {
  if (field.dynamicOptions === "minimapCategories") return minimapCategorySelectOptions();
  if (field.dynamicOptions === "assetAnimations") {
    const asset = assetById(draft.values?.modelAssetId);
    return animationClipsForAsset(asset).map(function (option) {
      return { value: option.value || option.name || "", label: option.label || option.name || option.value || "" };
    });
  }
  return (field.options || []).map(function (option) {
    if (option && typeof option === "object") {
      return {
        value: option.value === undefined || option.value === null ? "" : String(option.value),
        label: option.label === undefined || option.label === null ? String(option.value === undefined || option.value === null ? "" : option.value) : String(option.label)
      };
    }
    return { value: String(option), label: String(option) };
  });
}

function buildManagedJsonObjectControl(scope, draft, fieldName, field, value) {
  const fallback = field.default === undefined ? {} : field.default;
  const current = value && typeof value === "object" ? clonePlain(value) : clonePlain(fallback);
  const wrap = document.createElement("div");
  wrap.className = "tagQueryEditor";

  if (Array.isArray(current)) {
    const textarea = document.createElement("textarea");
    textarea.rows = 4;
    textarea.value = current.map(function (entry) {
      return entry && typeof entry === "object" ? "" : String(entry === null || entry === undefined ? "" : entry);
    }).filter(Boolean).join("\n");
    textarea.placeholder = "een waarde per regel";
    textarea.addEventListener("change", function () {
      const next = splitDelimitedValues(textarea.value);
      setManagedDraftValue(scope, fieldName, next);
      renderAuthoringHub();
    });
    wrap.appendChild(textarea);
    if (current.some(function (entry) { return entry && typeof entry === "object"; })) {
      const hint = document.createElement("div");
      hint.className = "objectFunctionDraftHint";
      hint.textContent = "Deze lijst heeft geen apart schema; beheer complexe regels via Meer nodes of de Inspector.";
      wrap.appendChild(hint);
    }
    return wrap;
  }

  const source = current && typeof current === "object" ? current : {};
  const keys = Object.keys(source);
  if (!keys.length) {
    const hint = document.createElement("div");
    hint.className = "objectFunctionDraftHint";
    hint.textContent = "Geen velden in deze structuur.";
    wrap.appendChild(hint);
    return wrap;
  }
  for (const key of keys) {
    const row = document.createElement("label");
    row.className = "tagQueryRow";
    const label = document.createElement("span");
    label.textContent = key;
    const raw = source[key];
    const input = document.createElement("input");
    input.type = typeof raw === "number" ? "number" : "text";
    input.value = raw === null || raw === undefined ? "" : String(raw);
    input.addEventListener("change", function () {
      const next = Object.assign({}, source);
      next[key] = typeof raw === "number" ? Number(input.value) : input.value;
      setManagedDraftValue(scope, fieldName, next);
      renderAuthoringHub();
    });
    row.append(label, input);
    wrap.appendChild(row);
  }
  return wrap;
}

function buildManagedMinimapMarkerCategoriesControl(scope, draft, fieldName, field, value) {
  const categories = normalizeMinimapMarkerCategories(value, field.default || []);
  const root = document.createElement("div");
  root.className = "minimapCategoryEditor";
  const commit = function (nextCategories) {
    setManagedDraftValue(scope, fieldName, normalizeMinimapMarkerCategories(nextCategories, field.default || []));
    renderAuthoringHub();
  };
  const updateAt = function (index, patch) {
    commit(categories.map(function (category, categoryIndex) {
      return categoryIndex === index ? Object.assign({}, category, patch) : category;
    }));
  };
  for (const [index, category] of categories.entries()) {
    const item = document.createElement("details");
    item.className = "minimapCategoryItem";
    const summary = document.createElement("summary");
    summary.className = "minimapCategorySummary";
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = category.enabled !== false;
    enabled.addEventListener("click", function (event) { event.stopPropagation(); });
    enabled.addEventListener("change", function () { updateAt(index, { enabled: enabled.checked }); });
    const swatch = document.createElement("span");
    swatch.className = "minimapCategorySwatch";
    swatch.style.background = category.color || "#ffffff";
    const title = document.createElement("span");
    title.className = "minimapCategoryTitle";
    title.textContent = (category.label || category.id) + " · " + category.source;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "mini danger";
    remove.textContent = "Delete";
    remove.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      commit(categories.filter(function (_, categoryIndex) { return categoryIndex !== index; }));
    });
    summary.append(enabled, swatch, title, remove);
    item.appendChild(summary);
    const grid = document.createElement("div");
    grid.className = "minimapCategoryGrid";
    const addInput = function (labelText, input) {
      const label = document.createElement("label");
      label.textContent = labelText;
      label.appendChild(input);
      grid.appendChild(label);
    };
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = category.label || "";
    labelInput.addEventListener("change", function () { updateAt(index, { label: labelInput.value.trim() || category.id }); });
    addInput("Naam", labelInput);
    const sourceSelect = document.createElement("select");
    for (const option of MINIMAP_MARKER_CATEGORY_SOURCE_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.label;
      if (option.value === category.source) opt.selected = true;
      sourceSelect.appendChild(opt);
    }
    sourceSelect.addEventListener("change", function () { updateAt(index, { source: sourceSelect.value }); });
    addInput("Bron", sourceSelect);
    const shapeSelect = document.createElement("select");
    for (const shape of MINIMAP_MARKER_SHAPE_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = shape;
      opt.textContent = shape;
      if (shape === category.shape) opt.selected = true;
      shapeSelect.appendChild(opt);
    }
    shapeSelect.addEventListener("change", function () { updateAt(index, { shape: shapeSelect.value }); });
    addInput("Vorm", shapeSelect);
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = /^#[0-9a-fA-F]{6}$/.test(category.color) ? category.color : "#ffffff";
    colorInput.addEventListener("change", function () { updateAt(index, { color: colorInput.value }); });
    addInput("Kleur", colorInput);
    const sizeInput = document.createElement("input");
    sizeInput.type = "number";
    sizeInput.min = "3";
    sizeInput.max = "64";
    sizeInput.step = "1";
    sizeInput.value = String(category.iconSizePx);
    sizeInput.addEventListener("change", function () { updateAt(index, { iconSizePx: Number(sizeInput.value) }); });
    addInput("Icon px", sizeInput);
    const toggles = document.createElement("div");
    toggles.className = "minimapCategoryToggles";
    const addToggle = function (labelText, patchKey) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = category[patchKey] === true;
      input.addEventListener("change", function () { updateAt(index, { [patchKey]: input.checked }); });
      label.append(input, document.createTextNode(labelText));
      toggles.appendChild(label);
    };
    addToggle("Label", "showLabel");
    addToggle("Rand", "clampOutside");
    addToggle("Fog", "showThroughFog");
    item.append(grid, toggles);
    root.appendChild(item);
  }
  const actions = document.createElement("div");
  actions.className = "minimapCategoryActions";
  const source = document.createElement("select");
  for (const option of MINIMAP_MARKER_CATEGORY_SOURCE_OPTIONS) {
    const opt = document.createElement("option");
    opt.value = option.value;
    opt.textContent = option.label;
    source.appendChild(opt);
  }
  const add = document.createElement("button");
  add.type = "button";
  add.className = "mini";
  add.textContent = "Categorie toevoegen";
  add.addEventListener("click", function () {
    const sourceValue = source.value || "custom";
    const option = MINIMAP_MARKER_CATEGORY_SOURCE_OPTIONS.find(function (entry) { return entry.value === sourceValue; });
    const id = uniqueMinimapCategoryId(categories, sourceValue);
    commit(categories.concat([normalizeMinimapMarkerCategory({
      id,
      label: option?.label || id,
      source: sourceValue,
      enabled: true,
      color: "#ffffff",
      shape: "dot",
      showLabel: true
    }, categories.length)]));
  });
  actions.append(source, add);
  root.appendChild(actions);
  return root;
}

function managedDraftFieldControl(scope, draft, fieldName, field) {
  const value = draft.values?.[fieldName];
  if (field.type === "minimapMarkerCategories") return buildManagedMinimapMarkerCategoriesControl(scope, draft, fieldName, field, value);
  if (field.type === "reference") {
    const fakeNode = { id: scope + "-draft-" + draft.type + "-" + fieldName, type: draft.type, values: {} };
    const navigation = questTimelineReferenceNavigationAction(field);
    return buildReferencePickerField(fakeNode, fieldName, field, value || null, {
      onChange: function (nextValue) {
        setManagedDraftValue(scope, fieldName, nextValue);
        renderAuthoringHub();
      },
      openCatalogAction: navigation?.action,
      openReferenceActionLabel: navigation?.label,
      openReferenceActionTitle: navigation?.title,
      hideAdvanced: true
    });
  }
  if (field.type === "referenceList") return buildReferenceListPickerControl(scope, draft, fieldName, field, value);
  if (field.type === "tagQuery") return buildTagQueryControl(scope, draft, fieldName, value);
  if (field.type === "formula") return buildFormulaControl(scope, draft, fieldName, value);
  if (field.type === "tagList") {
    const input = document.createElement("input");
    input.type = "text";
    input.value = normalizeTagList(value).join(", ");
    input.placeholder = "tag.een, tag.twee";
    input.addEventListener("change", function () {
      setManagedDraftValue(scope, fieldName, normalizeTagList(input.value));
      renderAuthoringHub();
    });
    return input;
  }
  if (field.type === "tokenText") {
    const textarea = document.createElement("textarea");
    textarea.rows = 4;
    textarea.spellcheck = true;
    textarea.value = value ?? field.default ?? "";
    textarea.placeholder = "Tekst";
    textarea.addEventListener("change", function () {
      setManagedDraftValue(scope, fieldName, normalizeFieldInputValue(field, textarea.value));
      renderAuthoringHub();
    });
    return textarea;
  }
  if (field.type === "color") {
    const row = document.createElement("div");
    row.className = "colorRow";
    const color = document.createElement("input");
    color.type = "color";
    color.value = /^#[0-9a-fA-F]{6}$/.test(String(value || "")) ? String(value) : "#ffffff";
    const text = document.createElement("input");
    text.type = "text";
    text.value = value ?? field.default ?? "";
    text.placeholder = "#ffffff";
    const commit = function (nextValue) {
      setManagedDraftValue(scope, fieldName, normalizeFieldInputValue(field, nextValue));
      renderAuthoringHub();
    };
    color.addEventListener("input", function () { text.value = color.value; });
    color.addEventListener("change", function () { commit(color.value); });
    text.addEventListener("change", function () { commit(text.value); });
    row.append(color, text);
    return row;
  }
  if (field.type === "json") {
    return buildManagedJsonObjectControl(scope, draft, fieldName, field, value);
  }
  if (field.type === "select") {
    const select = questTimelineSelectInput(value ?? field.default ?? "", selectOptionsForManagedField(field, draft), function (nextValue) {
      setManagedDraftValue(scope, fieldName, nextValue);
      renderAuthoringHub();
    });
    if (field.dynamicOptions && !select.options.length) {
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "(geen opties)";
      select.appendChild(blank);
    }
    return select;
  }
  if (field.type === "boolean") {
    return questTimelineCheckboxInput(value === true, function (nextValue) {
      setManagedDraftValue(scope, fieldName, nextValue);
    });
  }
  if (field.type === "number") {
    return questTimelineNumberInput(value ?? field.default, function (nextValue) {
      setManagedDraftValue(scope, fieldName, nextValue);
    }, { min: field.min, max: field.max, step: field.step });
  }
  if (field.type === "asset") {
    const select = document.createElement("select");
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "(geen asset)";
    select.appendChild(blank);
    for (const asset of state.assets.filter(function (item) { return (field.assetTypes || []).includes(item.assetType); })) {
      const opt = document.createElement("option");
      opt.value = asset.id;
      opt.textContent = asset.name;
      select.appendChild(opt);
    }
    select.value = value || "";
    select.addEventListener("change", function () {
      setManagedDraftValue(scope, fieldName, select.value || null);
      renderAuthoringHub();
    });
    return select;
  }
  return questTimelineTextInput(value ?? field.default ?? "", function (nextValue) {
    setManagedDraftValue(scope, fieldName, nextValue);
  }, { placeholder: String(field.default || "") });
}

function managedVisibleFields(type) {
  const fields = state.nodeTypes?.[type]?.fields || {};
  const internalTextId = managedInternalTextIdFieldForType(type);
  return Object.entries(fields).filter(function ([key, field]) {
    if (!field || field.hidden || field.type === "identity" || key === internalTextId) return false;
    if (key === "internalLabel" || key === "definitionVersion") return false;
    return true;
  });
}

function validateManagedDraft(scope, draft) {
  const fields = state.nodeTypes?.[draft?.type]?.fields || {};
  for (const [key, field] of Object.entries(fields)) {
    if (!field || field.hidden || field.type === "identity" || !field.required) continue;
    const value = draft.values?.[key];
    if (field.type === "reference") {
      if (referencePickerChoiceState(value, field).state !== "ok") {
        return "Kies eerst een geldige " + (field.label || key) + ".";
      }
    } else if (field.type === "referenceList") {
      if (!normalizeReferenceList(value).length) return "Kies minstens één waarde voor " + (field.label || key) + ".";
    } else if (isBlankValue(value)) {
      return "Vul " + (field.label || key) + " in.";
    }
  }
  return "";
}

function beginCatalogDraft(group, type, node = null) {
  state.catalogHubType = type;
  state.catalogHubSelectedNodeId = node?.id || null;
  state.catalogHubDraft = {
    groupId: group.id,
    type,
    existingNodeId: node?.id || null,
    values: managedDefaultValuesForDraft(type, node)
  };
  renderAuthoringHub();
}

function beginSettingsDraft(group, type, node = null) {
  state.settingsHubKind = normalizeEditorKey(group.values?.groupKind) === "ui" ? "ui" : "player_rules";
  state.settingsHubSelectedNodeId = node?.id || null;
  state.settingsHubDraft = {
    groupId: group.id,
    type,
    existingNodeId: node?.id || null,
    values: managedDefaultValuesForDraft(type, node)
  };
  renderAuthoringHub();
}

function titleForManagedNode(type, values) {
  const key = primaryDisplayFieldForType(type);
  return String(values?.[key] || values?.displayName || values?.label || state.nodeTypes?.[type]?.label || type).trim();
}

function connectManagedNodeToPackage(graph, group, node) {
  const kind = normalizeEditorKey(group?.values?.groupKind);
  if (kind === "catalog") {
    const output = ensureCatalogGroupPackage(graph, group);
    if (output && state.nodeTypes?.[node.type]?.outputs?.catalogDefinition) {
      pushEdgeIfMissing(graph, node.id, "catalogDefinition", output.id, "definitions");
    }
  } else if (kind === "player_rules") {
    const output = ensurePlayerRulesGroupPackage(graph, group);
    const policyPort = outputPortForDataType(node.type, "policy");
    if (output && policyPort) pushEdgeIfMissing(graph, node.id, policyPort, output.id, "policy");
  } else if (kind === "ui") {
    const output = ensureUiGroupPackage(graph, group);
    const outputs = state.nodeTypes?.[node.type]?.outputs || {};
    if (output && outputs.uiModule) pushEdgeIfMissing(graph, node.id, "uiModule", output.id, "uiModules");
    if (output && outputs.ui) pushEdgeIfMissing(graph, node.id, "ui", output.id, "ui");
    if (output && outputs.minimap) pushEdgeIfMissing(graph, node.id, "minimap", output.id, "minimap");
    if (output && outputs.uiLayout) pushEdgeIfMissing(graph, node.id, "uiLayout", output.id, "uiLayout");
    if (output && outputs.menuLayout) pushEdgeIfMissing(graph, node.id, "menuLayout", output.id, "uiLayout");
  }
}

async function commitManagedDraft(scope, group, draft) {
  if (!group || !draft) return;
  const validation = validateManagedDraft(scope, draft);
  if (validation) {
    setStatus(validation, "error");
    return;
  }
  const nextGraph = cloneGraphForRestore(state.graph);
  const nextGroup = graphNodeByIdInGraph(nextGraph, group.id);
  if (!nextGroup) {
    setStatus("Deze werkruimte bestaat niet meer.", "error");
    return;
  }
  ensureManagedGroupPackage(nextGraph, nextGroup);
  const fields = state.nodeTypes?.[draft.type]?.fields || {};
  const idField = identityFieldForType(draft.type);
  const internalTextIdField = idField ? "" : managedInternalTextIdFieldForType(draft.type);
  let node = draft.existingNodeId ? graphNodeByIdInGraph(nextGraph, draft.existingNodeId) : null;
  const isNew = !node;
  const values = Object.assign({}, objectFunctionDefaultValuesForNodeType(draft.type));
  for (const [key, field] of Object.entries(fields)) {
    if (!field || field.type === "identity") continue;
    if (!Object.prototype.hasOwnProperty.call(draft.values || {}, key)) continue;
    values[key] = normalizeFieldInputValue(field, draft.values[key]);
  }
  if (idField) {
    values[idField] = isNew
      ? uniqueCanonicalGraphValue(nextGraph, managedCanonicalBaseForType(draft.type, values))
      : (normalizeCanonicalId(node.values?.[idField], "") || uniqueCanonicalGraphValue(nextGraph, managedCanonicalBaseForType(draft.type, values)));
  } else if (internalTextIdField) {
    const defaultValue = String(values[internalTextIdField] || fields[internalTextIdField]?.default || slugifyGroupPortName(titleForManagedNode(draft.type, values), draft.type) || draft.type).trim();
    values[internalTextIdField] = isNew
      ? uniqueFieldValue(nextGraph, draft.type, internalTextIdField, defaultValue)
      : (String(node.values?.[internalTextIdField] || "").trim() || uniqueFieldValue(nextGraph, draft.type, internalTextIdField, defaultValue));
  }
  const title = titleForManagedNode(draft.type, values);
  if (isNew) {
    const duplicate = (nextGraph.nodes || []).find(function (candidate) {
      return candidate.type === draft.type
        && (candidate.parentId || null) === nextGroup.id
        && normalizeEditorKey(titleForManagedNode(candidate.type, candidate.values || candidate)) === normalizeEditorKey(title);
    }) || null;
    if (duplicate) {
      if (scope === "catalog") {
        state.catalogHubDraft = null;
        state.catalogHubSelectedNodeId = duplicate.id;
      } else {
        state.settingsHubDraft = null;
        state.settingsHubSelectedNodeId = duplicate.id;
      }
      focusGraphNode(duplicate.id);
      renderAuthoringHub();
      setStatus("Bestond al; bestaande node geopend.", "");
      return;
    }
  }
  if (!node) {
    const position = managedSuggestedNodePosition(nextGraph, nextGroup, draft.type);
    node = {
      id: createZoneGraphId("node_" + draft.type),
      type: draft.type,
      title,
      x: position.x,
      y: position.y,
      parentId: nextGroup.id,
      values
    };
    nextGraph.nodes.push(node);
  } else {
    node.title = title;
    node.parentId = nextGroup.id;
    node.values = Object.assign({}, node.values || {}, values);
  }
  connectManagedNodeToPackage(nextGraph, nextGroup, node);
  await restoreGraphObject(nextGraph, {
    historyLabel: (state.nodeTypes?.[draft.type]?.label || draft.type) + (isNew ? " aangemaakt" : " gewijzigd"),
    currentGroupId: nextGroup.id,
    selectedNodeIds: [node.id],
    selectedEdgeIds: [],
    refreshViewport: VIEWPORT_AFFECTING_NODE_TYPES.has(draft.type),
    refreshValidation: true,
    afterApply: function () {
      if (scope === "catalog") {
        state.catalogHubDraft = null;
        state.catalogHubSelectedNodeId = node.id;
      } else {
        state.settingsHubDraft = null;
        state.settingsHubSelectedNodeId = node.id;
      }
      focusGraphNode(node.id);
      setStatus((state.nodeTypes?.[draft.type]?.label || draft.type) + (isNew ? " aangemaakt." : " gewijzigd."), "success");
    }
  });
}

async function deleteManagedNode(scope, group, node) {
  if (!group || !node) return;
  const label = state.nodeTypes?.[node.type]?.label || node.type;
  const extraEntries = node.type === "loot_table"
    ? questTimelineDirectSources(state.graph, node, "entries").length
    : 0;
  const ok = window.confirm(label + " \"" + nodeDisplayTitle(node) + "\" verwijderen" + (extraEntries ? " inclusief " + extraEntries + " lootregel(s)" : "") + "?");
  if (!ok) return;
  const nextGraph = cloneGraphForRestore(state.graph);
  const removeIds = new Set([node.id]);
  if (node.type === "loot_table") {
    const nextTable = graphNodeByIdInGraph(nextGraph, node.id);
    for (const entry of questTimelineDirectSources(nextGraph, nextTable, "entries")) removeIds.add(entry.id);
  }
  nextGraph.nodes = (nextGraph.nodes || []).filter(function (candidate) { return !removeIds.has(candidate.id); });
  nextGraph.edges = (nextGraph.edges || []).filter(function (edge) {
    return !removeIds.has(edge.fromNodeId) && !removeIds.has(edge.toNodeId);
  });
  const nextGroup = graphNodeByIdInGraph(nextGraph, group.id);
  if (nextGroup) ensureManagedGroupPackage(nextGraph, nextGroup);
  await restoreGraphObject(nextGraph, {
    historyLabel: label + " verwijderd",
    currentGroupId: group.id,
    selectedNodeIds: [],
    selectedEdgeIds: [],
    refreshViewport: VIEWPORT_AFFECTING_NODE_TYPES.has(node.type),
    refreshValidation: true,
    afterApply: function () {
      if (scope === "catalog" && state.catalogHubSelectedNodeId === node.id) state.catalogHubSelectedNodeId = null;
      if (scope === "settings" && state.settingsHubSelectedNodeId === node.id) state.settingsHubSelectedNodeId = null;
      setStatus(label + " verwijderd.", "success");
    }
  });
}

function renderManagedDraftCard(scope, group, draft, options = {}) {
  const card = document.createElement("div");
  card.className = "objectFunctionDraftCard authoring04DraftCard";
  const title = document.createElement("div");
  title.className = "objectFunctionDraftTitle";
  title.textContent = (draft.existingNodeId ? "Bewerk: " : "Nieuw: ") + (state.nodeTypes?.[draft.type]?.label || draft.type);
  card.appendChild(title);
  const fields = document.createElement("div");
  fields.className = "objectFunctionDraftFields";
  for (const [fieldName, field] of managedVisibleFields(draft.type)) {
    fields.appendChild(objectFunctionDraftFieldRow(field.label || fieldName, managedDraftFieldControl(scope, draft, fieldName, field)));
  }
  card.appendChild(fields);
  const actions = document.createElement("div");
  actions.className = "objectFunctionDraftActions";
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "primary";
  confirm.textContent = options.confirmLabel || (draft.existingNodeId ? "Wijzigingen opslaan" : "Aanmaken");
  confirm.addEventListener("click", function () {
    if (typeof options.onConfirm === "function") void options.onConfirm(draft);
    else void commitManagedDraft(scope, group, draft);
  });
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "ghost";
  cancel.textContent = "Annuleren";
  cancel.addEventListener("click", function () {
    if (typeof options.onCancel === "function") {
      options.onCancel(draft);
    } else {
      if (scope === "catalog") state.catalogHubDraft = null;
      else state.settingsHubDraft = null;
      renderAuthoringHub();
    }
  });
  actions.append(confirm, cancel);
  card.appendChild(actions);
  return card;
}

function managedNodesInGroup(group, types, graph = state.graph) {
  const typeSet = new Set(types || []);
  const query = normalizeEditorKey(group.values?.groupKind) === "catalog" ? state.catalogHubSearch : state.settingsHubSearch;
  const normalizedQuery = normalizeEditorKey(query);
  return (graph.nodes || []).filter(function (node) {
    if ((node.parentId || null) !== group.id || !typeSet.has(node.type)) return false;
    if (!normalizedQuery) return true;
    const haystack = normalizeEditorKey([nodeDisplayTitle(node), identityValue(node), state.nodeTypes?.[node.type]?.label].join(" "));
    return haystack.includes(normalizedQuery);
  }).sort(function (a, b) {
    return nodeDisplayTitle(a).localeCompare(nodeDisplayTitle(b), "nl", { sensitivity: "base" });
  });
}

function renderManagedNodeList(scope, group, types) {
  const list = document.createElement("div");
  list.className = "authoring04List";
  const nodes = managedNodesInGroup(group, types, state.graph);
  if (!nodes.length) {
    const empty = document.createElement("div");
    empty.className = "authoringWorkspaceEmpty";
    empty.textContent = "Nog niets gevonden.";
    list.appendChild(empty);
    return list;
  }
  for (const node of nodes) {
    const row = document.createElement("div");
    row.className = "authoring04ListItem";
    const body = document.createElement("div");
    body.className = "authoring04ListBody";
    const title = document.createElement("div");
    title.className = "authoring04ListTitle";
    title.textContent = nodeDisplayTitle(node);
    const meta = document.createElement("div");
    meta.className = "authoring04ListMeta";
    meta.textContent = (state.nodeTypes?.[node.type]?.label || node.type) + " · " + (identityValue(node) || "interne id");
    body.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "authoring04Actions";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "mini";
    open.textContent = "Open";
    open.addEventListener("click", function () {
      if (scope === "catalog") state.catalogHubSelectedNodeId = node.id;
      else state.settingsHubSelectedNodeId = node.id;
      focusGraphNode(node.id);
      renderAuthoringHub();
    });
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "mini";
    edit.textContent = "Bewerk";
    edit.addEventListener("click", function () {
      if (scope === "catalog") beginCatalogDraft(group, node.type, node);
      else beginSettingsDraft(group, node.type, node);
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "deleteNode";
    remove.textContent = "Verwijder";
    remove.addEventListener("click", function () { void deleteManagedNode(scope, group, node); });
    actions.append(open, edit, remove);
    row.append(body, actions);
    if (node.type === "loot_table") row.appendChild(renderLootTableEntryEditor(group, node));
    list.appendChild(row);
  }
  return list;
}

function beginLootEntryDraft(group, table, type, entry = null) {
  state.catalogHubDraft = {
    groupId: group.id,
    type,
    existingNodeId: entry?.id || null,
    lootTableId: table.id,
    values: managedDefaultValuesForDraft(type, entry)
  };
  renderAuthoringHub();
}

async function commitLootEntryDraft(group, table, draft) {
  const validation = validateManagedDraft("catalog", draft);
  if (validation) {
    setStatus(validation, "error");
    return;
  }
  const nextGraph = cloneGraphForRestore(state.graph);
  const nextGroup = graphNodeByIdInGraph(nextGraph, group.id);
  const nextTable = graphNodeByIdInGraph(nextGraph, table.id);
  if (!nextGroup || !nextTable) {
    setStatus("Loot Table bestaat niet meer.", "error");
    return;
  }
  const fields = state.nodeTypes?.[draft.type]?.fields || {};
  const idField = identityFieldForType(draft.type);
  let node = draft.existingNodeId ? graphNodeByIdInGraph(nextGraph, draft.existingNodeId) : null;
  const isNew = !node;
  const values = Object.assign({}, objectFunctionDefaultValuesForNodeType(draft.type));
  for (const [key, field] of Object.entries(fields)) {
    if (!field || field.type === "identity") continue;
    if (!Object.prototype.hasOwnProperty.call(draft.values || {}, key)) continue;
    values[key] = normalizeFieldInputValue(field, draft.values[key]);
  }
  if (idField) values[idField] = isNew
    ? uniqueCanonicalGraphValue(nextGraph, managedCanonicalBaseForType(draft.type, values))
    : (normalizeCanonicalId(node.values?.[idField], "") || uniqueCanonicalGraphValue(nextGraph, managedCanonicalBaseForType(draft.type, values)));
  const label = state.nodeTypes?.[draft.type]?.label || draft.type;
  if (!node) {
    const existingCount = questTimelineDirectSources(nextGraph, nextTable, "entries").length;
    node = {
      id: createZoneGraphId("node_" + draft.type),
      type: draft.type,
      title: label,
      x: Math.round(Number(nextTable.x) || 80),
      y: Math.round((Number(nextTable.y) || 180) + 180 + existingCount * 120),
      parentId: nextGroup.id,
      values
    };
    nextGraph.nodes.push(node);
  } else {
    node.title = label;
    node.parentId = nextGroup.id;
    node.values = Object.assign({}, node.values || {}, values);
  }
  pushEdgeIfMissing(nextGraph, node.id, "lootEntry", nextTable.id, "entries");
  ensureCatalogGroupPackage(nextGraph, nextGroup);
  await restoreGraphObject(nextGraph, {
    historyLabel: label + (isNew ? " toegevoegd" : " gewijzigd"),
    currentGroupId: group.id,
    selectedNodeIds: [node.id],
    selectedEdgeIds: [],
    refreshViewport: false,
    refreshValidation: true,
    afterApply: function () {
      state.catalogHubDraft = null;
      focusGraphNode(node.id);
      setStatus(label + (isNew ? " toegevoegd." : " gewijzigd."), "success");
    }
  });
}

function managedReferenceLabel(ref, kinds) {
  const stateInfo = referencePickerChoiceState(ref, { referenceKinds: kinds || [], allowNull: true });
  return stateInfo.displayLabel || stateInfo.rawId || ref || "geen keuze";
}

function lootEntryReadableSummary(entry) {
  const values = entry.values || {};
  let target = "";
  let minMax = "";
  if (entry.type === "loot_item_entry") {
    target = "Item: " + managedReferenceLabel(values.itemRef, ["item"]);
    minMax = "min " + (values.minQuantity ?? 0) + " / max " + (values.maxQuantity ?? 0);
  } else if (entry.type === "loot_currency_entry") {
    target = "Currency: " + managedReferenceLabel(values.currencyRef, ["currency"]);
    minMax = "min " + (values.minAmountMinor ?? 0) + " / max " + (values.maxAmountMinor ?? 0);
  } else {
    target = "Loot Table: " + managedReferenceLabel(values.lootTableRef, ["loot_table"]);
    minMax = "min " + (values.repeatMin ?? 0) + " / max " + (values.repeatMax ?? 0);
  }
  return [
    target,
    "chance " + (values.chance ?? 1),
    "weight " + (values.weight ?? 1),
    minMax
  ].join(" · ");
}

function renderLootEntryRow(group, table, entry) {
  const row = document.createElement("div");
  row.className = "objectFunctionBadge questTimelineChildBadge";
  const accent = document.createElement("span");
  accent.className = "objectFunctionBadgeAccent";
  accent.style.background = state.nodeTypes?.[entry.type]?.accent || "#fbbf24";
  const body = document.createElement("div");
  body.className = "objectFunctionBadgeBody";
  const label = document.createElement("div");
  label.className = "objectFunctionBadgeLabel";
  label.textContent = state.nodeTypes?.[entry.type]?.label || entry.type;
  const meta = document.createElement("div");
  meta.className = "objectFunctionBadgeMeta";
  meta.textContent = lootEntryReadableSummary(entry);
  meta.title = meta.textContent;
  body.append(label, meta);
  const buttons = document.createElement("div");
  buttons.className = "objectFunctionBadgeButtons";
  const manage = document.createElement("button");
  manage.type = "button";
  manage.className = "mini";
  manage.textContent = "Beheren";
  manage.addEventListener("click", function (event) {
    event.stopPropagation();
    beginLootEntryDraft(group, table, entry.type, entry);
  });
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "deleteNode";
  remove.textContent = "Verwijderen";
  remove.addEventListener("click", function (event) {
    event.stopPropagation();
    void deleteManagedNode("catalog", group, entry);
  });
  buttons.append(manage, remove);
  row.append(accent, body, buttons);
  row.addEventListener("click", function () { focusGraphNode(entry.id); });
  return row;
}

function renderLootTableEntryEditor(group, table) {
  const wrap = document.createElement("div");
  wrap.className = "lootEntryEditor";
  const heading = document.createElement("div");
  heading.className = "objectFunctionMeta";
  heading.textContent = "Lootregels";
  wrap.appendChild(heading);
  const entries = questTimelineDirectSources(state.graph, table, "entries").filter(function (node) {
    return LOOT_ENTRY_TYPES.some(function (entry) { return entry.type === node.type; });
  });
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "objectFunctionDraftHint";
    empty.textContent = "Nog geen lootregels.";
    wrap.appendChild(empty);
  } else {
    const list = document.createElement("div");
    list.className = "objectFunctionBadgeRow";
    for (const entry of entries) {
      list.appendChild(renderLootEntryRow(group, table, entry));
    }
    wrap.appendChild(list);
  }
  const actions = document.createElement("div");
  actions.className = "authoring04Actions";
  for (const entryType of LOOT_ENTRY_TYPES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mini";
    button.textContent = "+ " + entryType.label;
    button.addEventListener("click", function () { beginLootEntryDraft(group, table, entryType.type); });
    actions.appendChild(button);
  }
  wrap.appendChild(actions);
  if (state.catalogHubDraft && state.catalogHubDraft.lootTableId === table.id) {
    wrap.appendChild(renderManagedDraftCard("catalog", group, state.catalogHubDraft, {
      onConfirm: function (draft) { return commitLootEntryDraft(group, table, draft); }
    }));
  }
  return wrap;
}

function renderCatalogHub(group) {
  const wrap = document.createElement("div");
  wrap.className = "objectFunctionSection authoring04Hub";
  const header = document.createElement("div");
  header.className = "objectFunctionHeader";
  const title = document.createElement("div");
  title.className = "objectFunctionTitle";
  title.textContent = nodeDisplayTitle(group) || "Catalog";
  const intro = document.createElement("div");
  intro.className = "objectFunctionIntro";
  intro.textContent = "Maak en beheer definities. IDs, Catalog Output, Group Output en Registry-koppeling worden automatisch afgehandeld.";
  header.append(title, intro);
  wrap.appendChild(header);
  const search = questTimelineTextInput(state.catalogHubSearch, function (value) {
    state.catalogHubSearch = value;
    renderAuthoringHub();
  }, { placeholder: "Zoek in catalog..." });
  search.className = "authoring04Search";
  wrap.appendChild(search);
  const tabs = document.createElement("div");
  tabs.className = "questTimelineTabs";
  for (const entry of CATALOG_HUB_TYPES) {
    tabs.appendChild(questTimelineTabButton(entry.label, state.catalogHubType === entry.type, function () {
      state.catalogHubType = entry.type;
      state.catalogHubDraft = null;
      renderAuthoringHub();
    }));
  }
  wrap.appendChild(tabs);
  const actions = document.createElement("div");
  actions.className = "authoring04Actions";
  const create = document.createElement("button");
  create.type = "button";
  create.className = "primary";
  create.textContent = "Nieuwe " + (state.nodeTypes?.[state.catalogHubType]?.label || state.catalogHubType);
  create.addEventListener("click", function () { beginCatalogDraft(group, state.catalogHubType); });
  const repair = document.createElement("button");
  repair.type = "button";
  repair.className = "mini";
  repair.textContent = "Package bijwerken";
  repair.addEventListener("click", async function () {
    const nextGraph = cloneGraphForRestore(state.graph);
    const nextGroup = graphNodeByIdInGraph(nextGraph, group.id);
    ensureCatalogGroupPackage(nextGraph, nextGroup);
    await restoreGraphObject(nextGraph, { historyLabel: "Catalog package bijgewerkt", currentGroupId: group.id, selectedNodeIds: [group.id], refreshValidation: true });
  });
  actions.append(create, repair);
  wrap.appendChild(actions);
  if (state.catalogHubDraft && state.catalogHubDraft.groupId === group.id && !state.catalogHubDraft.lootTableId) {
    wrap.appendChild(renderManagedDraftCard("catalog", group, state.catalogHubDraft));
  }
  wrap.appendChild(renderManagedNodeList("catalog", group, [state.catalogHubType]));
  return wrap;
}

function renderUiPreview(node) {
  const supported = new Set(["ui_hud_text", "debug_performance_hud", "game_minimap_hud"]);
  const wrap = document.createElement("div");
  wrap.className = "uiRuntimePreview";
  if (!supported.has(node.type)) {
    wrap.textContent = "Geen bestaande runtime-preview voor dit UI-type.";
    return wrap;
  }
  if (node.type === "ui_hud_text") {
    wrap.textContent = String(node.values?.text || "HUD tekst");
  } else if (node.type === "debug_performance_hud") {
    wrap.textContent = String(node.values?.label || "Performance") + " · FPS · Frame";
  } else if (node.type === "game_minimap_hud") {
    wrap.textContent = "Minimap " + String(node.values?.sizePx || 180) + "px";
  }
  return wrap;
}

function countGraphNodesByIds(ids) {
  return ids instanceof Set ? ids.size : 0;
}

function authoringIndicatorCountsForModel(model, graph = state.graph) {
  const info = modelAuthoringReferenceInfo(model, graph);
  const objectIds = new Set();
  for (const node of [info.context?.assembly, info.context?.interactionComponent, info.context?.npcComponent, info.context?.enemyComponent]) {
    if (node) objectIds.add(node.id);
  }
  const questIds = questDialogueDefinitionIdsForRefs(info.refs, graph);
  return {
    object_character: countGraphNodesByIds(objectIds),
    quest_dialogue: questIds.size
  };
}

function authoringIndicatorDefinitions() {
  return [
    { routeId: "object_character", icon: "O", label: "Object", color: "#06b6d4", meaning: "Objectonderdelen aan deze entity" },
    { routeId: "quest_dialogue", icon: "Q", label: "Quest", color: "#f59e0b", meaning: "Quests/dialogen die deze entity targeten" }
  ];
}

function renderAuthoringIndicators() {
  if (el.viewportAuthoringIndicatorToggle) {
    el.viewportAuthoringIndicatorToggle.classList.toggle("active", state.authoringIndicatorsEnabled);
    el.viewportAuthoringIndicatorToggle.setAttribute("aria-pressed", state.authoringIndicatorsEnabled ? "true" : "false");
    el.viewportAuthoringIndicatorToggle.title = state.authoringIndicatorsEnabled ? "Authoring-indicatoren verbergen" : "Authoring-indicatoren tonen";
  }
  const root = el.viewportAuthoringIndicators;
  if (!root) return;
  root.innerHTML = "";
  root.hidden = !state.authoringIndicatorsEnabled;
  if (!state.authoringIndicatorsEnabled || !runtime || typeof runtime.worldToScreen !== "function") return;
  const wrapRect = el.viewportWrap?.getBoundingClientRect();
  if (!wrapRect) return;
  const models = (state.graph.nodes || []).filter(function (node) { return node.type === "model_entity"; });
  for (const model of models) {
    const x = Number(model.values?.x);
    const y = Number(model.values?.y);
    const z = Number(model.values?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const screen = runtime.worldToScreen({ x, y: Number.isFinite(y) ? y + 1.2 : 1.2, z });
    if (!screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) continue;
    const cluster = document.createElement("div");
    cluster.className = "authoringIndicatorCluster";
    cluster.style.left = Math.round(screen.x - wrapRect.left) + "px";
    cluster.style.top = Math.round(screen.y - wrapRect.top - 18) + "px";
    const counts = authoringIndicatorCountsForModel(model, state.graph);
    let visibleCount = 0;
    for (const def of authoringIndicatorDefinitions()) {
      const count = Number(counts[def.routeId] || 0);
      if (!count) continue;
      const dot = document.createElement("span");
      dot.className = "authoringIndicatorDot";
      dot.style.setProperty("--indicator-color", def.color);
      dot.textContent = def.icon + String(count);
      dot.title = def.label + ": " + def.meaning + ". Aantal: " + count + ".";
      cluster.appendChild(dot);
      visibleCount += 1;
    }
    if (visibleCount) root.appendChild(cluster);
  }
}

function renderSettingsUiHub(group) {
  const kind = normalizeEditorKey(group.values?.groupKind) === "ui" ? "ui" : "player_rules";
  state.settingsHubKind = kind;
  const types = kind === "ui" ? UI_HUB_TYPES.filter(function (type) { return state.nodeTypes[type]; }) : PLAYER_RULES_HUB_TYPES.filter(function (type) { return state.nodeTypes[type]; });
  const wrap = document.createElement("div");
  wrap.className = "objectFunctionSection authoring04Hub";
  const header = document.createElement("div");
  header.className = "objectFunctionHeader";
  const title = document.createElement("div");
  title.className = "objectFunctionTitle";
  title.textContent = nodeDisplayTitle(group) || (kind === "ui" ? "UI Group" : "Player Rules Group");
  const intro = document.createElement("div");
  intro.className = "objectFunctionIntro";
  intro.textContent = kind === "ui"
    ? "Beheer ondersteunde UI-node-types. Preview verschijnt alleen voor UI die de bestaande runtime kent."
    : "Beheer ondersteunde player/economy policies. Output en World Assembly-koppeling worden automatisch bijgewerkt.";
  header.append(title, intro);
  wrap.appendChild(header);
  const search = questTimelineTextInput(state.settingsHubSearch, function (value) {
    state.settingsHubSearch = value;
    renderAuthoringHub();
  }, { placeholder: "Zoek in instellingen..." });
  search.className = "authoring04Search";
  wrap.appendChild(search);
  const categories = document.createElement("div");
  categories.className = "authoring04TypeGrid";
  for (const type of types) {
    const existing = managedNodesInGroup(group, [type], state.graph)[0] || null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "objectFunctionActionButton";
    button.textContent = (state.nodeTypes?.[type]?.label || type) + (existing ? " beheren" : " maken");
    button.title = existing ? "Duplicaatbescherming: bestaande node openen." : "Nieuwe node aanmaken en koppelen.";
    button.addEventListener("click", function () {
      beginSettingsDraft(group, type, existing);
      if (existing) focusGraphNode(existing.id);
    });
    categories.appendChild(button);
  }
  wrap.appendChild(categories);
  const actions = document.createElement("div");
  actions.className = "authoring04Actions";
  const repair = document.createElement("button");
  repair.type = "button";
  repair.className = "mini";
  repair.textContent = "Package bijwerken";
  repair.addEventListener("click", async function () {
    const nextGraph = cloneGraphForRestore(state.graph);
    const nextGroup = graphNodeByIdInGraph(nextGraph, group.id);
    ensureManagedGroupPackage(nextGraph, nextGroup);
    await restoreGraphObject(nextGraph, { historyLabel: "Package bijgewerkt", currentGroupId: group.id, selectedNodeIds: [group.id], refreshValidation: true });
  });
  actions.appendChild(repair);
  wrap.appendChild(actions);
  if (state.settingsHubDraft && state.settingsHubDraft.groupId === group.id) {
    wrap.appendChild(renderManagedDraftCard("settings", group, state.settingsHubDraft));
  }
  wrap.appendChild(renderManagedNodeList("settings", group, types));
  if (kind === "ui") {
    const selected = state.settingsHubSelectedNodeId ? graphNodeByIdInGraph(state.graph, state.settingsHubSelectedNodeId) : null;
    if (selected && (selected.parentId || null) === group.id) wrap.appendChild(renderUiPreview(selected));
  }
  return wrap;
}

function focusAssetBrowser() {
  if (isMobileLayout()) {
    if (state.mobilePanel === "all") ensureMobileAllLayout();
    else setMobilePanel("assets", false);
  }
  if (!el.assetSearch) return;
  requestAnimationFrame(function () {
    el.assetSearch.focus();
    if (typeof el.assetSearch.select === "function") el.assetSearch.select();
  });
}

function focusSelectedViewportAuthoringNode() {
  ensureMobileAllLayout();
  requestAnimationFrame(function () {
    focusTerrainOrSelected();
  });
}

function openAuthoringWorkspaceNode(node) {
  if (!node) return;
  ensureMobileAllLayout();
  enterGroup(node);
}

function openRootAuthoringWorkspace() {
  ensureMobileAllLayout();
  if (!state.currentGroupId) return;
  state.currentGroupId = null;
  clearSelection({ clearPendingEdge: true });
  syncBreadcrumb();
  renderGraph();
  renderInspector();
  applyTransform();
}

function clearAuthoringRoute() {
  state.authoringRouteId = null;
  state.storedAuthoringRouteId = null;
  state.authoringMenuOpen = true;
  state.nodeLibraryOpen = false;
  if (el.nodeLibrarySearch) el.nodeLibrarySearch.value = "";
  storeAuthoringRoute(null);
  renderAuthoringHub();
}

function toggleAuthoringMenu() {
  state.authoringMenuOpen = !state.authoringMenuOpen;
  renderAuthoringHub();
}

function selectAuthoringRoute(routeId) {
  const route = authoringRouteById(routeId);
  if (!route) return;
  state.authoringRouteId = route.id;
  state.storedAuthoringRouteId = route.id;
  state.authoringMenuOpen = false;
  state.nodeLibraryOpen = false;
  if (el.nodeLibrarySearch) el.nodeLibrarySearch.value = "";
  storeAuthoringRoute(route.id);
  renderAuthoringHub();
  if (route.id === "object_character") {
    if (selectedSingleModelNode()) focusSelectedViewportAuthoringNode();
    else focusAssetBrowser();
  }
}

function routeWorkspaceButtonLabel(node) {
  if (normalizeEditorKey(node?.values?.groupKind) === "zone") {
    const title = String(node?.values?.title || node?.title || "").trim();
    if (title) return title;
    return zoneCanvasTitle(zoneCanvasGridForGroup(node));
  }
  return String(node?.values?.title || node?.title || node?.id || "").trim();
}

function renderAuthoringRouteWorkspaceGroup(route, workspaceGroup) {
  const wrap = document.createElement("div");
  wrap.className = "authoringWorkspaceGroup";
  const title = document.createElement("div");
  title.className = "authoringWorkspaceGroupTitle";
  title.textContent = workspaceGroup.label;
  wrap.appendChild(title);
  const list = document.createElement("div");
  list.className = "authoringWorkspaceList";
  const entries = workspaceGroup.nodes || [];
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "authoringWorkspaceEmpty";
    empty.textContent = workspaceGroup.emptyText || "Nog geen werkruimte gevonden.";
    list.appendChild(empty);
  } else {
    for (const node of entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "libButton authoringWorkspaceButton";
      if (state.currentGroupId === node.id) button.classList.add("selected");
      const dot = document.createElement("span");
      dot.className = "libDot";
      dot.style.background = authoringRouteAccent(route.id);
      const text = document.createElement("span");
      text.className = "authoringRouteText";
      const titleText = document.createElement("span");
      titleText.className = "authoringRouteTitle";
      titleText.textContent = routeWorkspaceButtonLabel(node);
      const summary = document.createElement("span");
      summary.className = "authoringRouteSummary";
      if (normalizeEditorKey(node?.values?.groupKind) === "zone"
        && Number.isFinite(Number(node?.values?.zoneGridX))
        && Number.isFinite(Number(node?.values?.zoneGridZ))) {
        summary.textContent = "Grid " + Number(node.values.zoneGridX) + ", " + Number(node.values.zoneGridZ);
      } else {
        summary.textContent = workspaceGroup.label;
      }
      text.append(titleText, summary);
      appendWorkspaceCountBadge(text, route.id, node, state.graph);
      const plus = document.createElement("span");
      plus.className = "plus";
      plus.textContent = ">";
      button.append(dot, text, plus);
      button.addEventListener("click", function () {
        openAuthoringWorkspaceNode(node);
      });
      list.appendChild(button);
    }
  }
  wrap.appendChild(list);
  return wrap;
}

function renderAuthoringSection(route) {
  const selectedViewportNode = selectedViewportAuthoringNode();
  const hasAnyCampaignGroup = (state.graph.nodes || []).some(function (node) {
    return isCampaignGroupNode(node);
  });
  if (el.authoringSection) el.authoringSection.hidden = false;
  if (el.authoringButton) {
    el.authoringButton.setAttribute("aria-expanded", state.authoringMenuOpen ? "true" : "false");
  }
  if (el.authoringRouteChip) {
    el.authoringRouteChip.hidden = !route;
    el.authoringRouteChip.textContent = route ? "Werkroute: " + route.label : "";
  }
  if (el.authoringSelectionChip) {
    el.authoringSelectionChip.hidden = !selectedViewportNode;
    el.authoringSelectionChip.textContent = selectedViewportNode ? "Selectie: " + nodeDisplayTitle(selectedViewportNode) : "";
  }
  if (el.authoringBackButton) {
    el.authoringBackButton.hidden = !route;
  }
  if (el.authoringMenu) {
    el.authoringMenu.hidden = !state.authoringMenuOpen;
    el.authoringMenu.innerHTML = "";
    if (state.authoringMenuOpen) {
      for (const candidate of AUTHORING_ROUTES) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "libButton authoringRouteButton";
        if (route && candidate.id === route.id) button.classList.add("selected");
        const dot = document.createElement("span");
        dot.className = "libDot";
        dot.style.background = authoringRouteAccent(candidate.id);
        const text = document.createElement("span");
        text.className = "authoringRouteText";
        const title = document.createElement("span");
        title.className = "authoringRouteTitle";
        title.textContent = candidate.label;
        const summary = document.createElement("span");
        summary.className = "authoringRouteSummary";
        summary.textContent = candidate.summary;
        text.append(title, summary);
        appendReadOnlyCountBadge(text, candidate.id, state.graph);
        const plus = document.createElement("span");
        plus.className = "plus";
        plus.textContent = "+";
        button.append(dot, text, plus);
        button.addEventListener("click", function () {
          selectAuthoringRoute(candidate.id);
        });
        el.authoringMenu.appendChild(button);
      }
    }
  }
  if (el.authoringPanel) {
    el.authoringPanel.hidden = !route;
    el.authoringPanel.innerHTML = "";
    if (route) {
      const objectContext = route.id === "object_character" ? objectFunctionContextForModel(selectedSingleModelNode(), state.graph) : null;
      const note = document.createElement("div");
      note.className = "authoringRouteAction";
      const title = document.createElement("div");
      title.className = "authoringRouteActionTitle";
      title.textContent = route.label;
      const text = document.createElement("div");
      text.className = "authoringRouteActionText";
      text.textContent = route.summary;
      note.append(title, text);
      if (route.id === "object_character") {
        const buttons = document.createElement("div");
        buttons.className = "authoringRouteActionButtons";
        const action = document.createElement("button");
        action.type = "button";
        action.className = "primary";
        action.textContent = selectedSingleModelNode() ? "Focus selectie in 3D" : "Open Assets voor plaatsing";
        action.addEventListener("click", function () {
          if (selectedSingleModelNode()) focusSelectedViewportAuthoringNode();
          else focusAssetBrowser();
        });
        buttons.appendChild(action);
        note.appendChild(buttons);
      }
      el.authoringPanel.appendChild(note);
      if (route.id === "object_character") {
        el.authoringPanel.appendChild(renderObjectFunctionSection(objectContext));
      }
      if (route.id === "world_zone") {
        el.authoringPanel.appendChild(renderWorldZoneHub());
      }
      if (route.id === "quest_dialogue") {
        const campaignGroup = currentCampaignGroupNode();
        if (campaignGroup) {
          el.authoringPanel.appendChild(renderQuestDialogueWorkspace(campaignGroup));
        }
      }
      if (route.id === "item_ability_stat") {
        const catalogGroup = currentGroupOfKind("catalog");
        if (catalogGroup) el.authoringPanel.appendChild(renderCatalogHub(catalogGroup));
      }
      if (route.id === "game_settings_ui") {
        const playerRulesGroup = currentGroupOfKind("player_rules");
        const uiGroup = currentGroupOfKind("ui");
        if (playerRulesGroup || uiGroup) el.authoringPanel.appendChild(renderSettingsUiHub(playerRulesGroup || uiGroup));
      }
      const workspaces = authoringWorkspacesForRoute(route.id, state.graph);
      if (route.id === "item_ability_stat" && !workspaces.some(function (workspace) { return workspace.kind === "catalog" && workspace.nodes.length; })) {
        const action = document.createElement("div");
        action.className = "authoringRouteAction";
        const actionTitle = document.createElement("div");
        actionTitle.className = "authoringRouteActionTitle";
        actionTitle.textContent = "Catalog Group ontbreekt";
        const actionText = document.createElement("div");
        actionText.className = "authoringRouteActionText";
        actionText.textContent = "Maak een root-level Catalog Group om items, abilities, stats, currencies en loot tables te beheren.";
        const buttons = document.createElement("div");
        buttons.className = "authoringRouteActionButtons";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "primary";
        button.textContent = "Nieuwe Catalog Group";
        button.addEventListener("click", function () { void createRootManagedGroup("catalog", "Catalog"); });
        buttons.appendChild(button);
        action.append(actionTitle, actionText, buttons);
        el.authoringPanel.appendChild(action);
      }
      if (route.id === "game_settings_ui") {
        const hasPlayerRules = workspaces.some(function (workspace) { return workspace.kind === "player_rules" && workspace.nodes.length; });
        const hasUi = workspaces.some(function (workspace) { return workspace.kind === "ui" && workspace.nodes.length; });
        if (!hasPlayerRules || !hasUi) {
          const action = document.createElement("div");
          action.className = "authoringRouteAction";
          const actionTitle = document.createElement("div");
          actionTitle.className = "authoringRouteActionTitle";
          actionTitle.textContent = "Root-groep maken";
          const actionText = document.createElement("div");
          actionText.className = "authoringRouteActionText";
          actionText.textContent = "Player Rules en UI Groups worden alleen op rootniveau aangemaakt en direct aan de publishroute gekoppeld.";
          const buttons = document.createElement("div");
          buttons.className = "authoringRouteActionButtons";
          if (!hasPlayerRules) {
            const player = document.createElement("button");
            player.type = "button";
            player.className = "primary";
            player.textContent = "Nieuwe Player Rules Group";
            player.addEventListener("click", function () { void createRootManagedGroup("player_rules", "Player Rules"); });
            buttons.appendChild(player);
          }
          if (!hasUi) {
            const ui = document.createElement("button");
            ui.type = "button";
            ui.className = "primary";
            ui.textContent = "Nieuwe UI Group";
            ui.addEventListener("click", function () { void createRootManagedGroup("ui", "UI"); });
            buttons.appendChild(ui);
          }
          action.append(actionTitle, actionText, buttons);
          el.authoringPanel.appendChild(action);
        }
      }
      if (route.id === "quest_dialogue" && !hasAnyCampaignGroup) {
        const action = document.createElement("div");
        action.className = "authoringRouteAction";
        const actionTitle = document.createElement("div");
        actionTitle.className = "authoringRouteActionTitle";
        actionTitle.textContent = "Campaign Group ontbreekt";
        const actionText = document.createElement("div");
        actionText.className = "authoringRouteActionText";
        actionText.textContent = "Er is nog geen Campaigns Group. Maak er eerst een aan om quests en dialogen te kunnen bouwen.";
        const buttons = document.createElement("div");
        buttons.className = "authoringRouteActionButtons";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "primary";
        button.textContent = "Nieuwe Campaigns Group";
        button.addEventListener("click", function () {
          openRootAuthoringWorkspace();
          void addSpecialGroup({ kind: "campaign", title: "Campaigns" });
        });
        buttons.appendChild(button);
        action.append(actionTitle, actionText, buttons);
        el.authoringPanel.appendChild(action);
      }
      for (const workspaceGroup of workspaces) {
        el.authoringPanel.appendChild(renderAuthoringRouteWorkspaceGroup(route, workspaceGroup));
      }
    }
  }
  if (el.authoringButton) {
    el.authoringButton.textContent = "+ Maken";
  }
}

function nodeLibraryStatusForType(route, type, def) {
  const classification = classifyAuthoringNodeType(type, def);
  if (def?.system || ["group_input", "group_output"].includes(type)) {
    return { label: "system", tone: "system", text: "Wordt automatisch door de editor beheerd." };
  }
  if (def?.internal) return { label: "internal", tone: "system", text: "Interne compatibility-node; alleen handmatig wanneer de graphcontext klopt." };
  if (def?.deprecated) return { label: "deprecated", tone: "warning", text: "Oude of legacy route; gebruik alleen voor reparatie." };
  if (def?.hidden) return { label: "unsupported", tone: "warning", text: "Geregistreerd maar niet als normale visuele route ondersteund." };
  if (classification === "managed_infrastructure") return { label: "infra", tone: "system", text: "Infrastructuur voor package/publish-plumbing." };
  if (classification === "hidden_future") return { label: "future", tone: "warning", text: "Geregistreerd maar niet normaal ondersteund in deze route." };
  if (route && !authoringLibraryGroupsForRoute(route.id, { [type]: def }, "").some(function (group) { return group.items.length; })) {
    return { label: "buiten route", tone: "muted", text: "Bestaat wel, maar hoort niet bij de normale routecontext." };
  }
  return { label: "ok", tone: "ok", text: "Past bij de huidige route wanneer parent en ports geldig zijn." };
}

function nodePlacementIssueForType(type) {
  const def = state.nodeTypes?.[type] || {};
  const parent = state.currentGroupId ? nodeById(state.currentGroupId) : null;
  const parentKind = normalizeEditorKey(parent?.values?.groupKind);
  if (["group_input", "group_output"].includes(type)) return "Group Input/Output wordt automatisch beheerd.";
  if (def.system && type !== "group") return "System nodes worden door bestaande helpers aangemaakt.";
  if (type === "zone_definition" || type === "zone_output" || type === "zone_environment_settings" || type === "zone_gameplay_rules") {
    if (!parent || !isZoneCanvasGroup(parent, state.graph)) return "Open eerst een Zone Canvas.";
  }
  if (type === "area_output" || type === "area_definition") {
    if (!parent) return "Open eerst een Zone of Area Group.";
  }
  if (state.nodeTypes?.[type]?.outputs?.catalogDefinition && parentKind !== "catalog") return "Open eerst een Catalog Group.";
  if (outputPortForDataType(type, "policy") && parentKind !== "player_rules") return "Open eerst een Player Rules Group.";
  const outputs = state.nodeTypes?.[type]?.outputs || {};
  if ((outputs.ui || outputs.uiModule || outputs.minimap || outputs.uiLayout || outputs.menuLayout) && parentKind !== "ui") return "Open eerst een UI Group.";
  return "";
}

function renderNodeLibraryEntry(route, entry, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "libButton";
  const issue = nodePlacementIssueForType(entry.type);
  if (issue) button.classList.add("libButton--blocked");
  const dot = document.createElement("span");
  dot.className = "libDot";
  dot.style.background = accentColorForNodeDef(entry.def);
  const body = document.createElement("span");
  body.className = "authoringRouteText";
  const label = document.createElement("span");
  label.className = "authoringRouteTitle";
  label.textContent = entry.def.label || entry.type;
  body.appendChild(label);
  if (options.advanced) {
    const status = nodeLibraryStatusForType(route, entry.type, entry.def);
    const meta = document.createElement("span");
    meta.className = "authoringRouteSummary";
    meta.textContent = entry.type + " · " + status.text;
    body.appendChild(meta);
    const badge = document.createElement("span");
    badge.className = "nodeLibraryBadge nodeLibraryBadge--" + status.tone;
    badge.textContent = status.label;
    body.appendChild(badge);
  }
  const plus = document.createElement("span");
  plus.className = "plus";
  plus.textContent = issue ? "!" : "+";
  const info = createHelpIcon(buildNodeDefinitionHelpText(entry.type, entry.def) + (issue ? " Plaatsing geblokkeerd: " + issue : ""), { className: "helpInfoIcon helpInfoIcon--library", side: "right" });
  button.append(dot, body, plus);
  if (info) button.appendChild(info);
  button.title = issue ? issue : (entry.def.description || "");
  button.addEventListener("click", function () {
    if (issue) {
      setStatus(issue, "error");
      return;
    }
    addNode(entry.type);
  });
  return button;
}

function advancedNodeLibraryGroups(route, query) {
  const normalizedQuery = normalizeEditorKey(query);
  const buckets = new Map();
  for (const [type, def] of Object.entries(state.nodeTypes || {})) {
    const groupName = String(def?.group || "Other").trim() || "Other";
    const haystack = normalizeEditorKey([type, def?.label, def?.description, groupName, nodeLibraryStatusForType(route, type, def).label].join(" "));
    if (normalizedQuery && !haystack.includes(normalizedQuery)) continue;
    if (!buckets.has(groupName)) buckets.set(groupName, []);
    buckets.get(groupName).push({ type, def, classification: classifyAuthoringNodeType(type, def) });
  }
  return Array.from(buckets.entries()).map(function ([group, items]) {
    items.sort(function (left, right) {
      return String(left.def?.label || left.type).localeCompare(String(right.def?.label || right.type), "nl", { sensitivity: "base" });
    });
    return { group, items };
  }).sort(function (left, right) {
    return left.group.localeCompare(right.group, "nl", { sensitivity: "base" });
  });
}

function renderNodeLibrary(route) {
  const routeLabel = route ? route.label : "";
  const libraryOpen = Boolean(state.nodeLibraryOpen);
  if (el.nodeLibraryToggleTitle) {
    el.nodeLibraryToggleTitle.textContent = route ? "Meer nodes voor " + routeLabel : "Meer nodes";
  }
  if (el.nodeLibraryToggleState) {
    el.nodeLibraryToggleState.textContent = libraryOpen ? "Open" : "Ingeklapt";
  }
  if (el.nodeLibraryToggle) {
    el.nodeLibraryToggle.disabled = false;
    el.nodeLibraryToggle.setAttribute("aria-expanded", libraryOpen ? "true" : "false");
  }
  if (el.nodeLibraryBody) el.nodeLibraryBody.hidden = !libraryOpen;
  if (el.nodeLibrarySearch) {
    el.nodeLibrarySearch.placeholder = route ? "Zoek binnen " + routeLabel + "..." : "Zoek alle nodes...";
  }
  if (el.nodeLibraryModeToggle) {
    el.nodeLibraryModeToggle.hidden = false;
    el.nodeLibraryModeToggle.setAttribute("aria-pressed", state.nodeLibraryAdvanced ? "true" : "false");
    el.nodeLibraryModeToggle.textContent = state.nodeLibraryAdvanced ? (route ? "Contextnodes" : "Alle nodes") : "Alle nodes / Geavanceerd";
    el.nodeLibraryModeToggle.title = state.nodeLibraryAdvanced
      ? "Terug naar de route- en contextgeschikte nodes."
      : "Toon alle geregistreerde node-types met compatibiliteitsstatus.";
  }
  if (!libraryOpen) {
    if (el.nodeLibrary) el.nodeLibrary.innerHTML = "";
    return;
  }
  if (el.nodeLibrary) el.nodeLibrary.innerHTML = "";
  const query = (el.nodeLibrarySearch?.value || "").trim();
  const groups = state.nodeLibraryAdvanced || !route
    ? advancedNodeLibraryGroups(route, query)
    : authoringLibraryGroupsForRoute(route.id, state.nodeTypes, query);
  if (!groups.length) {
    const empty = document.createElement("div");
    empty.className = "libEmpty";
    empty.textContent = query
      ? "Geen nodes gevonden binnen \"" + query + "\"."
      : "Nog geen nodes beschikbaar voor deze route.";
    el.nodeLibrary.appendChild(empty);
    return;
  }
  for (const group of groups) {
    const wrap = document.createElement("div");
    wrap.className = "libGroup";
    const title = document.createElement("div");
    title.className = "libGroupTitle";
    title.textContent = group.group;
    wrap.appendChild(title);
    for (const entry of group.items) {
      wrap.appendChild(renderNodeLibraryEntry(route, entry, { advanced: state.nodeLibraryAdvanced }));
    }
    el.nodeLibrary.appendChild(wrap);
  }
  renderSpecialGroupLibrary(query.toLowerCase());
}

function renderAuthoringHub() {
  const route = sanitizeAuthoringRouteState();
  renderAuthoringSection(route);
  renderNodeLibrary(route);
  syncAsideContext(route);
}

function renderSpecialGroupLibrary(query = "") {
  if (!state.nodeTypes.group) return;
  const presets = [
    { kind: "zone_canvas", title: "Zone Canvas" },
    { kind: "catalog", title: "Catalog" },
    { kind: "campaign", title: "Campaigns" },
    { kind: "player_rules", title: "Player Rules" },
    { kind: "ui", title: "UI" }
  ].filter(function (preset) { return !query || preset.title.toLowerCase().includes(query); });
  if (!presets.length) return;
  const wrap = document.createElement("div");
  wrap.className = "libGroup";
  const title = document.createElement("div");
  title.className = "libGroupTitle";
  title.textContent = "Specialized Groups";
  wrap.appendChild(title);
  for (const preset of presets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "libButton";
    const dot = document.createElement("span");
    dot.className = "libDot";
    dot.style.background = dataTypeColor(preset.kind === "zone_canvas" ? "zonePackage" : (preset.kind === "player_rules" ? "playerRules" : (preset.kind === "ui" ? "uiPackage" : preset.kind + "Package")));
    const label = document.createElement("span");
    label.textContent = preset.title;
    const plus = document.createElement("span");
    plus.className = "plus";
    plus.textContent = "+";
    const info = createHelpIcon(buildSpecialGroupHelpText(preset), { className: "helpInfoIcon helpInfoIcon--library", side: "right" });
    button.append(dot, label, plus);
    if (info) button.appendChild(info);
    button.addEventListener("click", function () {
      if (preset.kind === "zone_canvas") addZoneCanvasFromLibrary();
      else addSpecialGroup(preset);
    });
    wrap.appendChild(button);
  }
  el.nodeLibrary.prepend(wrap);
}

async function addSpecialGroup(preset) {
  if (preset?.kind === "catalog") return createRootManagedGroup("catalog", preset.title || "Catalog");
  if (preset?.kind === "player_rules") return createRootManagedGroup("player_rules", preset.title || "Player Rules");
  if (preset?.kind === "ui") return createRootManagedGroup("ui", preset.title || "UI");
  await addNode("group", {
    groupId: slugifyGroupPortName(preset.title, preset.kind),
    title: preset.title,
    groupKind: preset.kind
  });
}

function createZoneGraphId(prefix) {
  return prefix + "_" + crypto.randomUUID().slice(0, 8);
}

function editorGroupSystemNodeId(groupId, kind) {
  return "group_" + kind + "__" + groupId;
}

function emptyGroupInterface() {
  return { inputs: [], outputs: [] };
}

function zoneCoordPart(value) {
  const number = Math.trunc(Number(value) || 0);
  return number < 0 ? "m" + Math.abs(number) : String(number);
}

function zoneCanvasBaseName(grid) {
  return "x" + zoneCoordPart(grid.x) + "_z" + zoneCoordPart(grid.z);
}

function zoneCanvasCanonicalBase(grid) {
  return "zone.canvas.x" + zoneCoordPart(grid.x) + ".z" + zoneCoordPart(grid.z);
}

function zoneCanvasTitle(grid) {
  return grid.x === 0 && grid.z === 0 ? "Start Zone" : "Zone " + grid.x + ", " + grid.z;
}

function uniqueFieldValue(graph, type, fieldName, baseValue) {
  const existing = new Set((graph.nodes || []).filter(function (node) {
    return node.type === type;
  }).map(function (node) {
    return String(node.values?.[fieldName] || "").trim();
  }).filter(Boolean));
  const base = String(baseValue || "").trim();
  if (!base || !existing.has(base)) return base;
  let index = 2;
  while (existing.has(base + "." + index) || existing.has(base + "_" + index)) index += 1;
  return base.includes(".") ? base + "." + index : base + "_" + index;
}

function zoneDefinitionForGroup(groupId, graph = state.graph) {
  return (graph.nodes || []).find(function (node) {
    return node.parentId === groupId && node.type === "zone_definition";
  }) || null;
}

function zoneOutputForGroup(groupId, graph = state.graph) {
  return (graph.nodes || []).find(function (node) {
    return node.parentId === groupId && node.type === "zone_output";
  }) || null;
}

function ensureZoneCanvasGroupPackageOutput(graph, group) {
  if (!group || !isZoneCanvasGroup(group, graph)) return false;
  let changed = false;
  const rootSibling = (group.parentId || null) === null;
  group.values = Object.assign({}, group.values || {}, {
    groupKind: "zone",
    zoneCanvas: true,
    groupInterface: zoneCanvasGroupInterfaceForRole(rootSibling, group.values?.groupInterface)
  });
  if (rootSibling && group.values.zoneCanvasRootId !== group.id) {
    group.values.zoneCanvasRootId = group.id;
    changed = true;
  }
  if (rootSibling && group.values.zoneCanvasParentZoneId) {
    group.values.zoneCanvasParentZoneId = "";
    changed = true;
  }
  if (rootSibling && group.values.zoneCanvasParentSide) {
    group.values.zoneCanvasParentSide = "";
    changed = true;
  }
  const system = ensureGroupSystemNodesInGraph(graph, group.id);
  const output = zoneOutputForGroup(group.id, graph);
  const packagePortName = groupInterfaceOutputPortNameForDataType(group, "zonePackage", "zonePackage");
  if (rewriteGroupPackageEdgesToPort(graph, group, "zonePackage", packagePortName)) changed = true;
  if (output && pushEdgeIfMissing(graph, output.id, "zonePackage", system.outputId, packagePortName)) changed = true;
  if ((group.parentId || null) === null) {
    const registry = ensureZoneRegistryForParent(graph, null, { x: group.x, y: group.y });
    if (registry && pushEdgeIfMissing(graph, group.id, packagePortName, registry.id, "zonePackage")) changed = true;
  }
  return changed;
}

// Which zone-canvas group's declared world-space bounds contain this ground position -
// used to place a newly dropped/placed model into the zone it visually landed in when
// there's no zone open in the Nodes graph to fall back on otherwise (see placeModel).
function zoneCanvasGroupContainingPoint(worldX, worldZ, graph = state.graph) {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return null;
  for (const node of graph.nodes || []) {
    if (!isZoneCanvasGroup(node, graph)) continue;
    const zone = zoneDefinitionForGroup(node.id, graph);
    const values = zone?.values || {};
    const originX = Number(values.originX);
    const originZ = Number(values.originZ);
    const width = Number(values.width);
    const depth = Number(values.depth);
    if (![originX, originZ, width, depth].every(Number.isFinite) || width <= 0 || depth <= 0) continue;
    if (worldX >= originX && worldX <= originX + width && worldZ >= originZ && worldZ <= originZ + depth) return node;
  }
  return null;
}

function isZoneCanvasGroup(node, graph = state.graph) {
  if (!node || node.type !== "group") return false;
  if (node.values?.zoneCanvas === true) return true;
  return String(node.values?.groupKind || "").trim().toLowerCase() === "zone" && Boolean(zoneDefinitionForGroup(node.id, graph));
}

function zoneCanvasGridForGroup(group, graph = state.graph) {
  const explicitX = Number(group?.values?.zoneGridX);
  const explicitZ = Number.isFinite(Number(group?.values?.zoneGridY))
    ? Number(group.values.zoneGridY)
    : Number(group?.values?.zoneGridZ);
  if (Number.isFinite(explicitX) && Number.isFinite(explicitZ) && group?.values?.zoneCanvas === true) {
    return { x: Math.trunc(explicitX), z: Math.trunc(explicitZ) };
  }
  const zone = zoneDefinitionForGroup(group?.id, graph);
  const originX = Number(zone?.values?.originX);
  const originZ = Number(zone?.values?.originZ);
  if (Number.isFinite(originX) && Number.isFinite(originZ)) {
    return {
      x: Math.round((originX + ZONE_CANVAS_HALF_SIZE) / ZONE_CANVAS_SIZE),
      z: Math.round((originZ + ZONE_CANVAS_HALF_SIZE) / ZONE_CANVAS_SIZE)
    };
  }
  return { x: 0, z: 0 };
}

function zoneCanvasGroupsForParent(parentId, graph = state.graph) {
  const wantedParentId = parentId || null;
  return (graph.nodes || []).filter(function (node) {
    return (node.parentId || null) === wantedParentId && isZoneCanvasGroup(node, graph);
  });
}

function zoneCanvasRootGroupForParent(parentId, graph = state.graph) {
  const groups = zoneCanvasGroupsForParent(parentId, graph);
  if (!groups.length) return null;
  return groups.find(function (group) {
    return group.values?.zoneCanvasRootId && group.values.zoneCanvasRootId === group.id;
  }) || groups.find(function (group) {
    const grid = zoneCanvasGridForGroup(group, graph);
    return grid.x === 0 && grid.z === 0;
  }) || groups[0];
}

function zoneCanvasRootGroupForGroup(group, graph = state.graph) {
  if (!group) return null;
  const explicitRootId = String(group.values?.zoneCanvasRootId || "").trim();
  if (explicitRootId) {
    const explicitRoot = (graph.nodes || []).find(function (node) {
      return node.id === explicitRootId && node.type === "group";
    }) || null;
    if (explicitRoot) return explicitRoot;
  }
  return zoneCanvasRootGroupForParent(group.parentId || null, graph);
}

function isZoneCanvasRootGroup(group, graph = state.graph) {
  if (!isZoneCanvasGroup(group, graph)) return false;
  const root = zoneCanvasRootGroupForGroup(group, graph);
  if (root) return root.id === group.id;
  const grid = zoneCanvasGridForGroup(group, graph);
  return grid.x === 0 && grid.z === 0;
}

function zoneGridKey(grid) {
  return String(grid.x) + ":" + String(grid.z);
}

function findZoneCanvasAtGrid(parentId, grid, graph = state.graph) {
  const key = zoneGridKey(grid);
  return zoneCanvasGroupsForParent(parentId, graph).find(function (group) {
    return zoneGridKey(zoneCanvasGridForGroup(group, graph)) === key;
  }) || null;
}

function firstFreeZoneGrid(parentId, graph = state.graph) {
  const used = new Set(zoneCanvasGroupsForParent(parentId, graph).map(function (group) {
    return zoneGridKey(zoneCanvasGridForGroup(group, graph));
  }));
  if (!used.has("0:0")) return { x: 0, z: 0 };
  for (let radius = 1; radius <= 100; radius += 1) {
    const candidates = [
      { x: radius, z: 0 },
      { x: 0, z: radius },
      { x: -radius, z: 0 },
      { x: 0, z: -radius }
    ];
    for (const candidate of candidates) {
      if (!used.has(zoneGridKey(candidate))) return candidate;
    }
  }
  return { x: used.size + 1, z: 0 };
}

function zoneCanvasGraphPosition(parentId, grid, graph = state.graph) {
  const originGroup = zoneCanvasRootGroupForParent(parentId, graph);
  if (originGroup) {
    return {
      x: Math.round(Number(originGroup.x) + grid.x * ZONE_CANVAS_NODE_STEP_X),
      y: Math.round(Number(originGroup.y) + grid.z * ZONE_CANVAS_NODE_STEP_Y)
    };
  }
  const center = viewportCenterInGraph();
  return {
    x: Math.round(center.x - 120 + grid.x * ZONE_CANVAS_NODE_STEP_X),
    y: Math.round(center.y - 80 + grid.z * ZONE_CANVAS_NODE_STEP_Y)
  };
}

function pushEdgeIfMissing(graph, fromNodeId, fromPort, toNodeId, toPort) {
  if ((graph.edges || []).some(function (edge) {
    return edge.fromNodeId === fromNodeId && edge.fromPort === fromPort && edge.toNodeId === toNodeId && edge.toPort === toPort;
  })) return null;
  const edge = { id: createZoneGraphId("edge_zone_canvas"), fromNodeId, fromPort, toNodeId, toPort };
  graph.edges.push(edge);
  return edge;
}

function ensureZoneRegistryForParent(graph, parentId, position) {
  const wantedParentId = parentId || null;
  let registry = (graph.nodes || []).find(function (node) {
    return node.type === "zone_registry" && (node.parentId || null) === wantedParentId;
  }) || null;
  if (!registry) {
    registry = {
      id: createZoneGraphId("node_zone_registry"),
      type: "zone_registry",
      title: "Zone Registry",
      x: Math.round(Number(position?.x) || 0) + ZONE_CANVAS_SIZE + 120,
      y: Math.round(Number(position?.y) || 0) + 180,
      parentId: wantedParentId,
      values: { registryId: uniqueFieldValue(graph, "zone_registry", "registryId", "zone_registry.main") }
    };
    graph.nodes.push(registry);
  }
  const assembly = (graph.nodes || []).find(function (node) {
    return node.type === "world_assembly" && (node.parentId || null) === wantedParentId;
  }) || null;
  if (assembly && !(graph.edges || []).some(function (edge) { return edge.toNodeId === assembly.id && edge.toPort === "zones"; })) {
    pushEdgeIfMissing(graph, registry.id, "zoneRegistry", assembly.id, "zones");
  }
  return registry;
}

function zoneCanvasChildPosition(x, y) {
  return { x: Math.round(x), y: Math.round(y) };
}

function zoneCanvasOriginForGrid(grid) {
  return {
    originX: grid.x * ZONE_CANVAS_SIZE - ZONE_CANVAS_HALF_SIZE,
    originZ: grid.z * ZONE_CANVAS_SIZE - ZONE_CANVAS_HALF_SIZE
  };
}

function ensureGroupSystemNodesInGraph(graph, groupId) {
  const inputId = editorGroupSystemNodeId(groupId, "input");
  const outputId = editorGroupSystemNodeId(groupId, "output");
  if (!(graph.nodes || []).some(function (node) { return node.id === inputId; })) {
    graph.nodes.push({ id: inputId, type: "group_input", title: "Group Input", x: 40, y: 80, parentId: groupId, values: {} });
  }
  if (!(graph.nodes || []).some(function (node) { return node.id === outputId; })) {
    graph.nodes.push({ id: outputId, type: "group_output", title: "Group Output", x: 1080, y: 210, parentId: groupId, values: {} });
  }
  return { inputId, outputId };
}

function isZoneCanvasPortName(portName) {
  return ZONE_CANVAS_PORT_ALIASES.has(String(portName || ""));
}

function isZoneCanvasChildPortName(portName) {
  return ["childZonePkgs", "child_zonepkgs", "childzonepkgs"].includes(String(portName || ""));
}

function isZoneCanvasRootOnlyNodeType(type) {
  return ZONE_CANVAS_ROOT_NODE_TYPES.has(String(type || ""));
}

function removeZoneCanvasGroupBoundaryEdges(graph, group) {
  if (!group) return;
  const systemOutputId = editorGroupSystemNodeId(group.id, "output");
  const graphNodeById = new Map((graph.nodes || []).map(function (node) { return [node.id, node]; }));
  const outputPorts = (group.values?.groupInterface?.outputs || []);
  const outputPortByName = new Map(outputPorts.flatMap(function (port) {
    const names = [port?.name, port?.id].map(function (name) { return String(name || ""); }).filter(Boolean);
    return names.map(function (name) { return [name, port]; });
  }));
  graph.edges = (graph.edges || []).filter(function (edge) {
    if (edge.fromNodeId === group.id && isZoneCanvasEntityGroupPort(outputPortByName.get(String(edge.fromPort || "")))) return false;
    if (edge.fromNodeId === group.id && ["entity", "entities"].includes(String(edge.fromPort || ""))) return false;
    if (edge.toNodeId === systemOutputId) {
      const source = graphNodeById.get(edge.fromNodeId);
      const sourceOutput = state.nodeTypes?.[source?.type]?.outputs?.[edge.fromPort] || null;
      if (source && source.parentId === group.id && (edge.fromPort === "entity" || sourceOutput?.dataType === "entity")) return false;
    }
    if (edge.toNodeId === group.id && isZoneCanvasChildPortName(edge.toPort)) return false;
    return true;
  });
}

function isZoneCanvasPackageGroupPort(port) {
  return String(port?.dataType || "") === "zonePackage" || isZoneCanvasPortName(port?.name) || isZoneCanvasPortName(port?.id);
}

function isZoneCanvasEntityGroupPort(port) {
  return String(port?.dataType || "") === "entity"
    || ["entity", "entities"].includes(String(port?.name || ""))
    || ["entity", "entities"].includes(String(port?.id || ""));
}

function zoneCanvasGroupInterfaceForRole(isRoot, previousInterface = null) {
  const current = previousInterface ? cloneGroupInterface(previousInterface) : emptyGroupInterface();
  const inputs = (current.inputs || []).filter(function (port) {
    return !isZoneCanvasPackageGroupPort(port) && !isZoneCanvasChildPortName(port?.name) && !isZoneCanvasChildPortName(port?.id);
  });
  const outputs = (current.outputs || []).filter(function (port) {
    return !isZoneCanvasEntityGroupPort(port);
  });
  const packagePort = outputs.find(isZoneCanvasPackageGroupPort) || null;
  if (packagePort) {
    if (!packagePort.id) packagePort.id = packagePort.name || "zone_package";
    if (!packagePort.name) packagePort.name = packagePort.id || "zonePackage";
    if (!packagePort.label) packagePort.label = packagePort.name === "zonepkg" ? "zonePkg" : "Zone Package";
    if (!packagePort.dataType) packagePort.dataType = "zonePackage";
    if (packagePort.multiple === undefined) packagePort.multiple = false;
  } else {
    outputs.push({
      id: "zone_package",
      name: "zonepackage",
      label: "Zone Package",
      dataType: "zonePackage",
      multiple: false
    });
  }
  return { inputs, outputs };
}

function rootLightTargetsForParent(graph, parentId) {
  const wantedParentId = parentId || null;
  const worldAssembly = (graph.nodes || []).find(function (node) {
    return node.type === "world_assembly" && (node.parentId || null) === wantedParentId;
  }) || null;
  if (worldAssembly) return [worldAssembly];
  const targets = [];
  const gameOutput = (graph.nodes || []).find(function (node) {
    return node.type === "game_output" && (node.parentId || null) === wantedParentId;
  }) || null;
  const legacyAdapter = (graph.nodes || []).find(function (node) {
    return node.type === "legacy_world_adapter" && (node.parentId || null) === wantedParentId;
  }) || null;
  if (gameOutput) targets.push(gameOutput);
  if (legacyAdapter) targets.push(legacyAdapter);
  return targets;
}

function cleanupRootLightTargetEdges(graph, parentId, targets) {
  const wantedParentId = parentId || null;
  const targetIds = new Set((targets || []).map(function (node) { return node.id; }));
  const graphNodeById = new Map((graph.nodes || []).map(function (node) { return [node.id, node]; }));
  const rootLightIds = new Set((graph.nodes || []).filter(function (node) {
    return (node.parentId || null) === wantedParentId && isZoneCanvasRootOnlyNodeType(node.type);
  }).map(function (node) {
    return node.id;
  }));
  let changed = false;
  graph.edges = (graph.edges || []).filter(function (edge) {
    if (!rootLightIds.has(edge.fromNodeId) || edge.fromPort !== "light" || edge.toPort !== "lights") return true;
    const target = graphNodeById.get(edge.toNodeId);
    if (!target || (target.parentId || null) !== wantedParentId) return true;
    if (!["world_assembly", "game_output", "legacy_world_adapter"].includes(target.type)) return true;
    if (targetIds.has(target.id)) return true;
    changed = true;
    return false;
  });
  return changed;
}

function removeZoneOutputLightEdges(graph) {
  const graphNodeById = new Map((graph.nodes || []).map(function (node) { return [node.id, node]; }));
  let changed = false;
  graph.edges = (graph.edges || []).filter(function (edge) {
    if (edge.toPort !== "lights") return true;
    const target = graphNodeById.get(edge.toNodeId);
    if (target?.type !== "zone_output") return true;
    changed = true;
    return false;
  });
  return changed;
}

function connectRootLightNodes(graph, parentId) {
  const wantedParentId = parentId || null;
  const targets = rootLightTargetsForParent(graph, wantedParentId);
  const cleaned = cleanupRootLightTargetEdges(graph, wantedParentId, targets);
  if (!targets.length) return false;
  let changed = cleaned;
  for (const node of graph.nodes || []) {
    if ((node.parentId || null) !== wantedParentId || !isZoneCanvasRootOnlyNodeType(node.type)) continue;
    for (const target of targets) {
      if (pushEdgeIfMissing(graph, node.id, "light", target.id, "lights")) changed = true;
    }
  }
  return changed;
}

function relocateZoneCanvasLightsToRoot(graph, parentId, groups) {
  const wantedParentId = parentId || null;
  const keepRootLightByType = new Map();
  for (const node of graph.nodes || []) {
    if ((node.parentId || null) !== wantedParentId || !isZoneCanvasRootOnlyNodeType(node.type)) continue;
    if (!keepRootLightByType.has(node.type)) keepRootLightByType.set(node.type, node);
  }
  const groupById = new Map((groups || []).map(function (group) { return [group.id, group]; }));
  const removeIds = new Set();
  let movedIndex = 0;
  for (const node of graph.nodes || []) {
    if (!isZoneCanvasRootOnlyNodeType(node.type) || !groupById.has(node.parentId)) continue;
    graph.edges = (graph.edges || []).filter(function (edge) {
      return edge.fromNodeId !== node.id && edge.toNodeId !== node.id;
    });
    const existing = keepRootLightByType.get(node.type);
    if (existing) {
      removeIds.add(node.id);
      continue;
    }
    const sourceGroup = groupById.get(node.parentId);
    node.parentId = wantedParentId;
    node.x = Math.round(Number(sourceGroup?.x) || 0) + 40 + movedIndex * 34;
    node.y = Math.round(Number(sourceGroup?.y) || 0) - 105;
    keepRootLightByType.set(node.type, node);
    movedIndex += 1;
  }
  if (removeIds.size) {
    graph.nodes = (graph.nodes || []).filter(function (node) {
      return !removeIds.has(node.id);
    });
    graph.edges = (graph.edges || []).filter(function (edge) {
      return !removeIds.has(edge.fromNodeId) && !removeIds.has(edge.toNodeId);
    });
  }
  connectRootLightNodes(graph, wantedParentId);
}

function applyZoneCanvasGroupRole(graph, group, options = {}) {
  if (!group) return false;
  const root = options.root || zoneCanvasRootGroupForGroup(group, graph) || group;
  const isRoot = options.isRoot !== undefined ? Boolean(options.isRoot) : root.id === group.id;
  group.values = Object.assign({}, group.values || {}, {
    groupKind: "zone",
    zoneCanvas: true,
    zoneCanvasRootId: isRoot ? group.id : root.id,
    groupInterface: zoneCanvasGroupInterfaceForRole(isRoot, group.values?.groupInterface)
  });
  if (isRoot) {
    group.values.zoneCanvasParentZoneId = "";
    group.values.zoneCanvasParentSide = "";
  } else {
    group.values.zoneCanvasParentZoneId = String(group.values.zoneCanvasParentZoneId || root.id || "");
  }
  return isRoot;
}

function syncZoneCanvasBoundsToGrid(graph, group, grid) {
  const origin = zoneCanvasOriginForGrid(grid);
  const zone = zoneDefinitionForGroup(group.id, graph);
  if (zone) {
    zone.values = Object.assign({}, zone.values || {}, {
      originX: origin.originX,
      originY: 0,
      originZ: origin.originZ,
      width: ZONE_CANVAS_SIZE,
      depth: ZONE_CANVAS_SIZE
    });
  }
  const ground = (graph.nodes || []).find(function (node) {
    return node.parentId === group.id && node.type === "ground_surface";
  }) || null;
  if (ground) {
    const groundValues = Object.assign({}, ground.values || {}, {
      width: ZONE_CANVAS_SIZE,
      depth: ZONE_CANVAS_SIZE,
      boundsMode: "explicitBounds",
      minX: origin.originX,
      maxX: origin.originX + ZONE_CANVAS_SIZE,
      minZ: origin.originZ,
      maxZ: origin.originZ + ZONE_CANVAS_SIZE
    });
    if (!Number.isFinite(Number(groundValues.edgeFadeWidth))) groundValues.edgeFadeWidth = 18;
    ground.values = groundValues;
  }
  const zoneId = zone?.values?.zoneId || "";
  const spawn = (graph.nodes || []).find(function (node) {
    return node.parentId === group.id && node.type === "spawn_point";
  }) || null;
  if (spawn) {
    spawn.values = Object.assign({}, spawn.values || {}, {
      zoneRef: spawn.values?.zoneRef || zoneId,
      x: Number.isFinite(Number(spawn.values?.x)) ? Number(spawn.values.x) : origin.originX + ZONE_CANVAS_HALF_SIZE,
      y: Number.isFinite(Number(spawn.values?.y)) ? Number(spawn.values.y) : 0,
      z: Number.isFinite(Number(spawn.values?.z)) ? Number(spawn.values.z) : origin.originZ + ZONE_CANVAS_HALF_SIZE
    });
  }
}

function zoneCanvasCenterForGroup(group, graph = state.graph) {
  const grid = zoneCanvasGridForGroup(group, graph);
  const origin = zoneCanvasOriginForGrid(grid);
  return {
    x: origin.originX + ZONE_CANVAS_HALF_SIZE,
    y: 0,
    z: origin.originZ + ZONE_CANVAS_HALF_SIZE
  };
}

function applyZoneCanvasDefaultsToNode(graph, group, node) {
  if (!group || !node) return;
  const grid = zoneCanvasGridForGroup(group, graph);
  const origin = zoneCanvasOriginForGrid(grid);
  if (node.type === "ground_surface") {
    const values = Object.assign({}, node.values || {}, {
      width: ZONE_CANVAS_SIZE,
      depth: ZONE_CANVAS_SIZE,
      boundsMode: "explicitBounds",
      minX: origin.originX,
      maxX: origin.originX + ZONE_CANVAS_SIZE,
      minZ: origin.originZ,
      maxZ: origin.originZ + ZONE_CANVAS_SIZE
    });
    if (!Number.isFinite(Number(values.edgeFadeWidth))) values.edgeFadeWidth = 18;
    node.values = values;
  } else if (node.type === "model_entity") {
    const center = zoneCanvasCenterForGroup(group, graph);
    node.values = Object.assign({}, node.values || {}, {
      x: Number.isFinite(Number(node.values?.x)) && Number(node.values.x) !== 0 ? node.values.x : center.x,
      y: Number.isFinite(Number(node.values?.y)) ? node.values.y : center.y,
      z: Number.isFinite(Number(node.values?.z)) && Number(node.values.z) !== 0 ? node.values.z : center.z
    });
  }
}

function zoneOutputInputForSourceNode(node) {
  const outputDef = state.nodeTypes.zone_output || {};
  const sourceOutputs = state.nodeTypes[node?.type]?.outputs || {};
  const targetInputs = outputDef.inputs || {};
  for (const [targetPortName, targetPort] of Object.entries(targetInputs)) {
    if (targetPort.hidden || targetPort.internal || targetPort.deprecated) continue;
    for (const [sourcePortName, sourcePort] of Object.entries(sourceOutputs)) {
      if (sourcePort.dataType && sourcePort.dataType === targetPort.dataType) {
        return { sourcePortName, targetPortName, targetPort };
      }
    }
  }
  return null;
}

function wireZoneCanvasNodeToOutput(graph, group, node) {
  if (!group || !node || node.type === "zone_output" || node.parentId !== group.id) return false;
  if (isZoneCanvasRootOnlyNodeType(node.type)) return false;
  const output = zoneOutputForGroup(group.id, graph);
  if (!output) return false;
  const route = zoneOutputInputForSourceNode(node);
  if (!route) return false;
  graph.edges = (graph.edges || []).filter(function (edge) {
    if (edge.toNodeId !== output.id || edge.toPort !== route.targetPortName) return true;
    if (route.targetPort?.multiple === true) return true;
    return edge.fromNodeId === node.id && edge.fromPort === route.sourcePortName;
  });
  pushEdgeIfMissing(graph, node.id, route.sourcePortName, output.id, route.targetPortName);
  return true;
}

function wireZoneCanvasChildrenToOutput(graph, group) {
  let changed = false;
  for (const node of graph.nodes || []) {
    if (node.parentId !== group.id) continue;
    applyZoneCanvasDefaultsToNode(graph, group, node);
    if (wireZoneCanvasNodeToOutput(graph, group, node)) changed = true;
  }
  return changed;
}

function ensureZoneCanvasBasis(graph, group, options = {}) {
  if (!group) return null;
  const grid = options.grid || zoneCanvasGridForGroup(group, graph);
  const root = options.root || zoneCanvasRootGroupForParent(group.parentId || null, graph) || group;
  const isRoot = options.isRoot !== undefined ? Boolean(options.isRoot) : root.id === group.id;
  applyZoneCanvasGroupRole(graph, group, { root, isRoot });
  group.values.zoneGridX = grid.x;
  group.values.zoneGridZ = grid.z;
  group.values.zoneGridY = grid.z;
  if (!isRoot) {
    group.values.zoneCanvasParentZoneId = String(options.parentZoneId || group.values.zoneCanvasParentZoneId || root.id || "");
    group.values.zoneCanvasParentSide = String(options.parentSide || group.values.zoneCanvasParentSide || "");
  }
  const origin = options.origin || zoneCanvasOriginForGrid(grid);
  const baseName = zoneCanvasBaseName(grid);
  const canonicalBase = zoneCanvasCanonicalBase(grid);
  const zoneId = uniqueFieldValue(graph, "zone_definition", "zoneId", canonicalBase);
  const existingZone = zoneDefinitionForGroup(group.id, graph);
  const effectiveZoneId = existingZone?.values?.zoneId || zoneId;
  const spawnId = uniqueFieldValue(graph, "spawn_point", "spawnId", "spawn." + canonicalBase.replace(/^zone\./, ""));
  const nodes = {};

  function firstChild(type) {
    return (graph.nodes || []).find(function (node) {
      return node.parentId === group.id && node.type === type;
    }) || null;
  }

  nodes.zone = firstChild("zone_definition");
  if (!nodes.zone) {
    nodes.zone = {
      id: createZoneGraphId("node_zone_definition"),
      type: "zone_definition",
      title: "Zone Definition",
      parentId: group.id,
      x: 120,
      y: 120,
      values: {
        zoneId: effectiveZoneId,
        displayName: zoneCanvasTitle(grid),
        zoneType: "outdoor_normal",
        originX: origin.originX,
        originY: 0,
        originZ: origin.originZ,
        width: ZONE_CANVAS_SIZE,
        depth: ZONE_CANVAS_SIZE,
        minY: -100,
        maxY: 500,
        recommendedLevelMin: 1,
        recommendedLevelMax: 10,
        biomeTags: [],
        zoneTags: [],
        allowFastTravel: true,
        allowRespawn: true,
        activeByDefault: true
      }
    };
    graph.nodes.push(nodes.zone);
  }

  nodes.environment = firstChild("zone_environment_settings");
  if (!nodes.environment) {
    nodes.environment = {
      id: createZoneGraphId("node_zone_environment"),
      type: "zone_environment_settings",
      title: "Zone Environment Settings",
      parentId: group.id,
      x: 120,
      y: 300,
      values: { environmentId: uniqueFieldValue(graph, "zone_environment_settings", "environmentId", "environment." + canonicalBase) }
    };
    graph.nodes.push(nodes.environment);
  }

  nodes.rules = firstChild("zone_gameplay_rules");
  if (!nodes.rules) {
    nodes.rules = {
      id: createZoneGraphId("node_zone_rules"),
      type: "zone_gameplay_rules",
      title: "Zone Gameplay Rules",
      parentId: group.id,
      x: 120,
      y: 480,
      values: { rulesId: uniqueFieldValue(graph, "zone_gameplay_rules", "rulesId", "zone_rules." + canonicalBase.replace(/^zone\./, "")) }
    };
    graph.nodes.push(nodes.rules);
  }

  nodes.ground = firstChild("ground_surface");
  if (!nodes.ground) {
    nodes.ground = {
      id: createZoneGraphId("node_zone_ground"),
      type: "ground_surface",
      title: "Ground Surface",
      parentId: group.id,
      x: 440,
      y: 120,
      values: {
        groundId: uniqueFieldValue(graph, "ground_surface", "groundId", "ground_" + baseName),
        width: ZONE_CANVAS_SIZE,
        depth: ZONE_CANVAS_SIZE,
        y: 0,
        boundsMode: "explicitBounds",
        minX: origin.originX,
        maxX: origin.originX + ZONE_CANVAS_SIZE,
        minZ: origin.originZ,
        maxZ: origin.originZ + ZONE_CANVAS_SIZE,
        materialColor: "#3f6b3f",
        textureAssetId: null,
        textureWorldSizeX: 10,
        textureWorldSizeZ: 10,
        edgeFadeWidth: 18,
        textureRepeat: 8
      }
    };
    graph.nodes.push(nodes.ground);
  }

  nodes.spawn = firstChild("spawn_point");
  if (!nodes.spawn) {
    nodes.spawn = {
      id: createZoneGraphId("node_zone_spawn"),
      type: "spawn_point",
      title: "Spawn Point",
      parentId: group.id,
      x: 440,
      y: 310,
      values: {
        spawnId,
        role: "zone_default",
        zoneRef: effectiveZoneId,
        label: "Zone Default",
        x: origin.originX + ZONE_CANVAS_HALF_SIZE,
        y: 0,
        z: origin.originZ + ZONE_CANVAS_HALF_SIZE,
        facing: 0,
        safeRadius: 1.25,
        snapToGround: true,
        validateCollision: true,
        activationConditionRef: null,
        priority: 0
      }
    };
    graph.nodes.push(nodes.spawn);
  } else if (!nodes.spawn.values?.zoneRef && effectiveZoneId) {
    nodes.spawn.values = Object.assign({}, nodes.spawn.values, { zoneRef: effectiveZoneId });
  }

  nodes.output = firstChild("zone_output");
  if (!nodes.output) {
    nodes.output = {
      id: createZoneGraphId("node_zone_output"),
      type: "zone_output",
      title: "Zone Output",
      parentId: group.id,
      x: 760,
      y: 220,
      values: {
        packageId: uniqueFieldValue(graph, "zone_output", "packageId", effectiveZoneId + ".package"),
        packageVersion: 1,
        includeEditorOnlyData: false
      }
    };
    graph.nodes.push(nodes.output);
  }

  ensureGroupSystemNodesInGraph(graph, group.id);
  removeZoneCanvasGroupBoundaryEdges(graph, group);
  syncZoneCanvasBoundsToGrid(graph, group, grid);
  pushEdgeIfMissing(graph, nodes.zone.id, "zone", nodes.output.id, "zone");
  pushEdgeIfMissing(graph, nodes.environment.id, "environment", nodes.output.id, "environment");
  pushEdgeIfMissing(graph, nodes.rules.id, "rules", nodes.output.id, "rules");
  pushEdgeIfMissing(graph, nodes.ground.id, "ground", nodes.output.id, "ground");
  pushEdgeIfMissing(graph, nodes.spawn.id, "spawnPoint", nodes.output.id, "spawns");
  ensureZoneCanvasGroupPackageOutput(graph, group);
  return { nodes, zoneId: effectiveZoneId, spawnId: nodes.spawn.values?.spawnId || spawnId };
}

function wireExistingZoneCanvasBasis(graph, group) {
  if (!group) return false;
  const root = zoneCanvasRootGroupForGroup(group, graph) || group;
  const isRoot = applyZoneCanvasGroupRole(graph, group, { root });
  const grid = zoneCanvasGridForGroup(group, graph);
  const children = (graph.nodes || []).filter(function (node) { return node.parentId === group.id; });
  const first = function (type) {
    return children.find(function (node) { return node.type === type; }) || null;
  };
  const zone = first("zone_definition");
  const environment = first("zone_environment_settings");
  const rules = first("zone_gameplay_rules");
  const ground = first("ground_surface");
  const spawn = first("spawn_point");
  const output = first("zone_output");
  if (!output) return false;
  ensureGroupSystemNodesInGraph(graph, group.id);
  removeZoneCanvasGroupBoundaryEdges(graph, group);
  syncZoneCanvasBoundsToGrid(graph, group, grid);
  if (zone) pushEdgeIfMissing(graph, zone.id, "zone", output.id, "zone");
  if (environment) pushEdgeIfMissing(graph, environment.id, "environment", output.id, "environment");
  if (rules) pushEdgeIfMissing(graph, rules.id, "rules", output.id, "rules");
  if (ground) pushEdgeIfMissing(graph, ground.id, "ground", output.id, "ground");
  if (spawn) pushEdgeIfMissing(graph, spawn.id, "spawnPoint", output.id, "spawns");
  wireZoneCanvasChildrenToOutput(graph, group);
  ensureZoneCanvasGroupPackageOutput(graph, group);
  return true;
}

function normalizeZoneCanvasGroups(graph, parentId = null) {
  const groups = zoneCanvasGroupsForParent(parentId, graph);
  if (!groups.length) return null;
  const root = zoneCanvasRootGroupForParent(parentId, graph) || groups[0];
  const rootSiblingMode = (parentId || null) === null;
  removeZoneOutputLightEdges(graph);
  relocateZoneCanvasLightsToRoot(graph, parentId, groups);
  for (const group of groups) {
    const isRoot = rootSiblingMode ? true : group.id === root.id;
    const grid = zoneCanvasGridForGroup(group, graph);
    group.values = Object.assign({}, group.values || {}, {
      zoneGridX: grid.x,
      zoneGridZ: grid.z,
      zoneGridY: grid.z
    });
    applyZoneCanvasGroupRole(graph, group, { root, isRoot });
    removeZoneCanvasGroupBoundaryEdges(graph, group);
    syncZoneCanvasBoundsToGrid(graph, group, grid);
    const output = zoneOutputForGroup(group.id, graph);
    if (output) {
      ensureGroupSystemNodesInGraph(graph, group.id);
      wireZoneCanvasChildrenToOutput(graph, group);
      ensureZoneCanvasGroupPackageOutput(graph, group);
    }
  }
  ensureZoneRegistryForParent(graph, parentId, { x: root.x, y: root.y });
  return root;
}

function zoneCanvasGraphPositionFromRoot(root, grid) {
  return {
    x: Math.round(Number(root?.x) + grid.x * ZONE_CANVAS_NODE_STEP_X),
    y: Math.round(Number(root?.y) + grid.z * ZONE_CANVAS_NODE_STEP_Y)
  };
}

function zoneCanvasGridFromGraphPosition(group, position, graph) {
  const root = zoneCanvasRootGroupForGroup(group, graph) || group;
  if (!root || root.id === group.id) return { x: 0, z: 0 };
  return {
    x: Math.round((Number(position.x) - Number(root.x)) / ZONE_CANVAS_NODE_STEP_X),
    z: Math.round((Number(position.y) - Number(root.y)) / ZONE_CANVAS_NODE_STEP_Y)
  };
}

function zoneCanvasAttachmentForGrid(graph, parentId, grid, selfId) {
  const entries = Object.entries(ZONE_CANVAS_DIRECTIONS);
  for (const [directionName, direction] of entries) {
    const neighborGrid = { x: grid.x - direction.dx, z: grid.z - direction.dz };
    const neighbor = findZoneCanvasAtGrid(parentId, neighborGrid, graph);
    if (neighbor && neighbor.id !== selfId) {
      return { parentZoneId: neighbor.id, parentSide: directionName };
    }
  }
  return null;
}

function translateNumericValue(values, key, delta) {
  if (!Number.isFinite(Number(values?.[key]))) return false;
  values[key] = Number(values[key]) + delta;
  return true;
}

function translateZoneCanvasPoints(points, deltaX, deltaZ) {
  if (!Array.isArray(points)) return points;
  let changed = false;
  const nextPoints = points.map(function (point) {
    if (!point || typeof point !== "object") return point;
    const nextPoint = Object.assign({}, point);
    if (Number.isFinite(Number(nextPoint.x))) {
      nextPoint.x = Number(nextPoint.x) + deltaX;
      changed = true;
    }
    if (Number.isFinite(Number(nextPoint.z))) {
      nextPoint.z = Number(nextPoint.z) + deltaZ;
      changed = true;
    }
    return nextPoint;
  });
  return changed ? nextPoints : points;
}

function translateZoneCanvasChildCoordinates(graph, group, deltaX, deltaZ) {
  if (!group || (!deltaX && !deltaZ)) return;
  for (const node of graph.nodes || []) {
    if (node.parentId !== group.id || node.type === "group_input" || node.type === "group_output" || isZoneCanvasRootOnlyNodeType(node.type)) continue;
    const values = Object.assign({}, node.values || {});
    translateNumericValue(values, "x", deltaX);
    translateNumericValue(values, "z", deltaZ);
    translateNumericValue(values, "originX", deltaX);
    translateNumericValue(values, "originZ", deltaZ);
    translateNumericValue(values, "minX", deltaX);
    translateNumericValue(values, "maxX", deltaX);
    translateNumericValue(values, "minZ", deltaZ);
    translateNumericValue(values, "maxZ", deltaZ);
    translateNumericValue(values, "areaCenterX", deltaX);
    translateNumericValue(values, "areaCenterZ", deltaZ);
    if (Array.isArray(values.points)) values.points = translateZoneCanvasPoints(values.points, deltaX, deltaZ);
    node.values = values;
  }
}

function snapMovedZoneCanvasGroups(graph, movedNodeIds) {
  const movedZoneGroups = (movedNodeIds || []).map(function (nodeId) {
    return (graph.nodes || []).find(function (node) { return node.id === nodeId; }) || null;
  }).filter(function (node) {
    return isZoneCanvasGroup(node, graph);
  });
  if (!movedZoneGroups.length) return { moved: false, collisions: 0 };
  const parentIds = Array.from(new Set(movedZoneGroups.map(function (group) { return group.parentId || null; })));
  let collisions = 0;
  for (const parentId of parentIds) normalizeZoneCanvasGroups(graph, parentId);
  for (const group of movedZoneGroups) {
    const root = zoneCanvasRootGroupForGroup(group, graph) || group;
    const isRoot = root.id === group.id;
    const previousGrid = zoneCanvasGridForGroup(group, graph);
    let nextGrid = isRoot ? { x: 0, z: 0 } : zoneCanvasGridFromGraphPosition(group, { x: group.x, y: group.y }, graph);
    const attachment = isRoot ? null : zoneCanvasAttachmentForGrid(graph, group.parentId || null, nextGrid, group.id);
    const occupied = findZoneCanvasAtGrid(group.parentId || null, nextGrid, graph);
    const detached = !isRoot && !attachment;
    if ((occupied && occupied.id !== group.id) || detached) {
      nextGrid = previousGrid;
      collisions += 1;
    }
    const deltaX = (nextGrid.x - previousGrid.x) * ZONE_CANVAS_SIZE;
    const deltaZ = (nextGrid.z - previousGrid.z) * ZONE_CANVAS_SIZE;
    translateZoneCanvasChildCoordinates(graph, group, deltaX, deltaZ);
    group.values = Object.assign({}, group.values || {}, {
      zoneGridX: nextGrid.x,
      zoneGridZ: nextGrid.z
    });
    if (!isRoot) {
      const nextAttachment = zoneCanvasAttachmentForGrid(graph, group.parentId || null, nextGrid, group.id);
      if (nextAttachment) {
        group.values.zoneCanvasParentZoneId = nextAttachment.parentZoneId;
        group.values.zoneCanvasParentSide = nextAttachment.parentSide;
      }
      const snappedPosition = zoneCanvasGraphPositionFromRoot(root, nextGrid);
      group.x = snappedPosition.x;
      group.y = snappedPosition.y;
    }
    applyZoneCanvasGroupRole(graph, group, { root, isRoot });
    syncZoneCanvasBoundsToGrid(graph, group, nextGrid);
  }
  for (const parentId of parentIds) normalizeZoneCanvasGroups(graph, parentId);
  return { moved: true, collisions };
}

function ensureProjectStartZone(graph, zoneId, spawnId, shouldSet) {
  if (!shouldSet) return;
  const project = (graph.nodes || []).find(function (node) { return node.type === "game_project_settings"; }) || null;
  if (!project) return;
  project.values = Object.assign({}, project.values || {});
  if (!project.values.startZoneRef) project.values.startZoneRef = zoneId;
  if (!project.values.startSpawnRef) project.values.startSpawnRef = spawnId;
}

function appendZoneCanvasGroup(graph, options) {
  const parentId = options.parentId || null;
  const grid = options.grid || { x: 0, z: 0 };
  const position = options.position || zoneCanvasGraphPosition(parentId, grid, graph);
  const baseName = zoneCanvasBaseName(grid);
  const root = options.root || zoneCanvasRootGroupForParent(parentId, graph);
  const isRoot = options.isRoot !== undefined ? Boolean(options.isRoot) : !root;
  const group = {
    id: createZoneGraphId("node_zone_canvas"),
    type: "group",
    title: zoneCanvasTitle(grid),
    x: Math.round(position.x),
    y: Math.round(position.y),
    parentId,
    values: {
      groupId: uniqueFieldValue(graph, "group", "groupId", "zone_canvas_" + baseName),
      title: zoneCanvasTitle(grid),
      groupKind: "zone",
      zoneCanvas: true,
      zoneGridX: grid.x,
      zoneGridZ: grid.z,
      zoneGridY: grid.z,
      zoneCanvasRootId: isRoot ? "" : root.id,
      zoneCanvasParentZoneId: isRoot ? "" : String(options.parentZoneId || root.id),
      zoneCanvasParentSide: isRoot ? "" : String(options.parentSide || ""),
      groupInterface: zoneCanvasGroupInterfaceForRole(isRoot)
    }
  };
  if (isRoot) group.values.zoneCanvasRootId = group.id;
  graph.nodes.push(group);
  const basis = ensureZoneCanvasBasis(graph, group, {
    grid,
    root: isRoot ? group : root,
    isRoot,
    parentZoneId: options.parentZoneId,
    parentSide: options.parentSide
  });
  const registry = isRoot ? ensureZoneRegistryForParent(graph, parentId, position) : null;
  return { group, basis, registry };
}

async function addZoneCanvasFromLibrary() {
  const parentId = null;
  if ((state.graph.nodes || []).some(function (node) { return isZoneCanvasGroup(node, state.graph); })) {
    return;
  }
  const nextGraph = cloneGraphForRestore(state.graph);
  normalizeZoneCanvasGroups(nextGraph, parentId);
  const firstZone = !(nextGraph.nodes || []).some(function (node) { return node.type === "zone_definition"; });
  const grid = firstFreeZoneGrid(parentId, nextGraph);
  const existing = findZoneCanvasAtGrid(parentId, grid, nextGraph);
  if (existing) {
    selectNode(existing.id, true, { clearPendingEdge: true });
    setStatus("Zone bestaat al op deze canvaspositie.", "");
    return;
  }
  const result = appendZoneCanvasGroup(nextGraph, {
    parentId,
    grid,
    position: zoneCanvasGraphPosition(parentId, grid, nextGraph)
  });
  normalizeZoneCanvasGroups(nextGraph, parentId);
  ensureProjectStartZone(nextGraph, result.basis.zoneId, result.basis.spawnId, firstZone);
  await restoreGraphObject(nextGraph, {
    historyLabel: "Zone Canvas toegevoegd",
    selectedNodeIds: [result.group.id],
    selectedEdgeIds: [],
    refreshViewport: true,
    refreshValidation: true,
    afterApply: function () {
      focusGraphNode(result.group.id);
      setStatus("Zone Canvas toegevoegd.", "success");
    }
  });
}

async function expandZoneCanvas(groupId, directionName) {
  const direction = ZONE_CANVAS_DIRECTIONS[directionName];
  const source = nodeById(groupId);
  if (!direction || !isZoneCanvasGroup(source)) return;
  const parentId = source.parentId || null;
  const sourceGrid = zoneCanvasGridForGroup(source);
  const targetGrid = { x: sourceGrid.x + direction.dx, z: sourceGrid.z + direction.dz };
  const existing = findZoneCanvasAtGrid(parentId, targetGrid);
  if (existing) {
    selectNode(existing.id, true, { clearPendingEdge: true });
    setStatus("Zone " + direction.label.toLowerCase() + " bestaat al.", "");
    return;
  }
  beginZoneCanvasDraft(source, directionName);
}

async function repairZoneCanvasBasis(groupId) {
  const nextGraph = cloneGraphForRestore(state.graph);
  const group = nextGraph.nodes.find(function (node) { return node.id === groupId; });
  if (!group || group.type !== "group") return;
  normalizeZoneCanvasGroups(nextGraph, group.parentId || null);
  const root = zoneCanvasRootGroupForGroup(group, nextGraph) || group;
  const basis = ensureZoneCanvasBasis(nextGraph, group, {
    root,
    isRoot: root.id === group.id
  });
  normalizeZoneCanvasGroups(nextGraph, group.parentId || null);
  await restoreGraphObject(nextGraph, {
    historyLabel: "Zone Canvas basis bijgewerkt",
    selectedNodeIds: [groupId],
    selectedEdgeIds: [],
    refreshViewport: true,
    refreshValidation: true,
    afterApply: function () {
      setStatus(basis ? "Zone Canvas basis bijgewerkt." : "Geen zonebasis gevonden.", basis ? "success" : "");
    }
  });
}

async function wireZoneCanvas(groupId) {
  const nextGraph = cloneGraphForRestore(state.graph);
  const group = nextGraph.nodes.find(function (node) { return node.id === groupId; });
  if (!group || group.type !== "group") return;
  normalizeZoneCanvasGroups(nextGraph, group.parentId || null);
  const ok = wireExistingZoneCanvasBasis(nextGraph, group);
  normalizeZoneCanvasGroups(nextGraph, group.parentId || null);
  await restoreGraphObject(nextGraph, {
    historyLabel: "Zone Canvas gekoppeld",
    selectedNodeIds: [groupId],
    selectedEdgeIds: [],
    refreshViewport: true,
    refreshValidation: true,
    afterApply: function () {
      setStatus(ok ? "Zone Canvas gekoppeld." : "Zone Output ontbreekt; vul eerst de basis aan.", ok ? "success" : "error");
    }
  });
}

async function autoWireZoneCanvasNode(groupId, nodeId) {
  const group = nodeById(groupId);
  if (!isZoneCanvasGroup(group)) return false;
  const nextGraph = cloneGraphForRestore(state.graph);
  const nextGroup = nextGraph.nodes.find(function (node) { return node.id === groupId; });
  const node = nextGraph.nodes.find(function (candidate) { return candidate.id === nodeId; });
  if (!nextGroup || !node || node.parentId !== nextGroup.id) return false;
  ensureZoneCanvasBasis(nextGraph, nextGroup);
  const position = stackedEntityNodePosition(node.type, nextGroup.id, nextGraph, { x: node.x, y: node.y }, node.id);
  node.x = Math.round(Number(position.x) || 0);
  node.y = Math.round(Number(position.y) || 0);
  applyZoneCanvasDefaultsToNode(nextGraph, nextGroup, node);
  const wired = wireZoneCanvasNodeToOutput(nextGraph, nextGroup, node);
  normalizeZoneCanvasGroups(nextGraph, nextGroup.parentId || null);
  await restoreGraphObject(nextGraph, {
    historyLabel: "Zone-node gekoppeld",
    selectedNodeIds: [nodeId],
    selectedEdgeIds: [],
    refreshViewport: true,
    refreshValidation: true,
    afterApply: function () {
      focusGraphNode(nodeId);
      setStatus(wired ? "Zone-node toegevoegd en gekoppeld." : "Zone-node toegevoegd.", wired ? "success" : "");
    }
  });
  return wired;
}

async function autoWireRootLightNode(nodeId, parentId) {
  const nextGraph = cloneGraphForRestore(state.graph);
  connectRootLightNodes(nextGraph, parentId || null);
  await restoreGraphObject(nextGraph, {
    historyLabel: "Root light gekoppeld",
    selectedNodeIds: [nodeId],
    selectedEdgeIds: [],
    refreshViewport: true,
    refreshValidation: true,
    afterApply: function () {
      setStatus("Light naar root verplaatst en gekoppeld.", "success");
    }
  });
}


function editorCameraGroundPoint() {
  if (runtime && typeof runtime.getMinimapMarkerSnapshot === "function") {
    const snapshot = runtime.getMinimapMarkerSnapshot({
      includeLocalPlayer: false,
      includeRemotePlayers: false,
      includeEntities: false,
      includeInteractables: false
    });
    const x = Number(snapshot?.cameraTarget?.x);
    const z = Number(snapshot?.cameraTarget?.z);
    if (Number.isFinite(x) && Number.isFinite(z)) return { x: x, y: terrainGroundY(), z: z };
  }
  if (!runtime || typeof runtime.screenToGround !== "function" || !el.viewportCanvas) return null;
  const rect = el.viewportCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const ground = runtime.screenToGround(rect.left + rect.width / 2, rect.top + rect.height / 2);
  if (!ground || !Number.isFinite(ground.x) || !Number.isFinite(ground.z)) return null;
  return { x: ground.x, y: Number.isFinite(Number(ground.y)) ? Number(ground.y) : terrainGroundY(), z: ground.z };
}

function cameraCenteredLinePoints(point, length = 8) {
  const x = Number(point?.x);
  const z = Number(point?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return [];
  const half = Math.max(0.5, Number(length) || 8) / 2;
  return [
    { x: x - half, z: z },
    { x: x + half, z: z }
  ];
}

// Where a new node's world object should land: use the editor camera target first.
// Falling back to the visible canvas center is only for runtimes without camera snapshots.
function viewportCenterWorldValues(type) {
  const fields = state.nodeTypes?.[type]?.fields;
  if (!fields) return {};
  const point = editorCameraGroundPoint();
  if (!point) return {};
  const values = {};
  if (fields.x && fields.z) {
    values.x = point.x;
    values.z = point.z;
  }
  if (fields.areaCenterX && fields.areaCenterZ) {
    values.areaCenterX = point.x;
    values.areaCenterZ = point.z;
  }
  if (type === "surface_layer" && fields.points) {
    values.points = cameraCenteredLinePoints(point);
  }
  return values;
}

async function addNode(type, values = {}) {
  const center = viewportCenterInGraph();
  const spawnValues = Object.assign({}, viewportCenterWorldValues(type), values);
  const editorOnlyGraphFrame = type === "graph_frame";
  const requestedParentId = state.currentGroupId || null;
  const requestedParent = nodeById(requestedParentId);
  const zoneParentAdd = isZoneCanvasGroup(requestedParent);
  const rootOnlyZoneNode = zoneParentAdd && !editorOnlyGraphFrame && isZoneCanvasRootOnlyNodeType(type);
  const parentId = rootOnlyZoneNode ? (requestedParent.parentId || null) : requestedParentId;
  const position = rootOnlyZoneNode
    ? { x: Math.round(Number(requestedParent.x) || 0) + 48, y: Math.round(Number(requestedParent.y) || 0) - 105 }
    : stackedEntityNodePosition(type, parentId, state.graph, center);
  let createdNodeId = null;
  await applyGraphMutation(function () {
    return api("/api/editor/nodes", {
      method: "POST",
      body: JSON.stringify({ type: type, position: position, values: spawnValues, parentId: parentId })
    });
  }, {
    historyLabel: "Node toegevoegd",
    refreshViewport: !editorOnlyGraphFrame && (!zoneParentAdd || rootOnlyZoneNode),
    refreshValidation: !editorOnlyGraphFrame,
    afterApply: function (_, result) {
      createdNodeId = result?.nodeId || null;
      if (result?.nodeId) selectNode(result.nodeId, true);
      // Als "All" al open is, staat de Nodes-pane daar al zichtbaar - blijf op "All"
      // en laat selectNode() hierboven de nieuwe node daarin focussen, in plaats van
      // hier weg te springen naar de losse "Nodes"-tab (zie showMobileInspectorPanel).
      if (result?.nodeId && isMobileLayout() && state.mobilePanel !== "all") setMobilePanel("graph");
      setStatus(editorOnlyGraphFrame ? "Frame toegevoegd." : (rootOnlyZoneNode ? "Light toegevoegd op root." : "Node toegevoegd."), "success");
    }
  });
  if (createdNodeId && zoneParentAdd && !rootOnlyZoneNode && !editorOnlyGraphFrame) {
    await autoWireZoneCanvasNode(requestedParentId, createdNodeId);
  } else if (createdNodeId && rootOnlyZoneNode) {
    await autoWireRootLightNode(createdNodeId, parentId);
  }
  return createdNodeId;
}

function viewportCenterInGraph() {
  const rect = el.graphViewport.getBoundingClientRect();
  return {
    x: (rect.width / 2 - state.view.panX) / state.view.scale,
    y: (rect.height / 2 - state.view.panY) / state.view.scale
  };
}

function graphNodeHeightForStack(node) {
  const card = node?.id ? el.nodeLayer.querySelector('.gnode[data-node-id="' + node.id + '"]') : null;
  return Math.max(122, Math.round(card?.offsetHeight || 0));
}

function stackedEntityNodePosition(type, parentId, graph = state.graph, fallback = null, excludeNodeId = null) {
  const base = fallback || viewportCenterInGraph();
  if (type !== "model_entity") return base;
  const wantedParentId = parentId || null;
  const zoneModelPosition = objectFunctionSuggestedModelPositionInZone(wantedParentId, graph, base, excludeNodeId);
  if (zoneModelPosition) return zoneModelPosition;
  const siblings = (graph.nodes || []).filter(function (node) {
    return node.id !== excludeNodeId && node.type === "model_entity" && (node.parentId || null) === wantedParentId;
  });
  if (!siblings.length) {
    const output = wantedParentId ? zoneOutputForGroup(wantedParentId, graph) : null;
    if (output) {
      return {
        x: Math.round((Number(output.x) || 760) - 320),
        y: Math.round((Number(output.y) || 220) + 150)
      };
    }
    return { x: Math.round(Number(base.x) || 0), y: Math.round(Number(base.y) || 0) };
  }
  const lowest = siblings.slice().sort(function (a, b) {
    return (Number(a.y) || 0) - (Number(b.y) || 0) || (Number(a.x) || 0) - (Number(b.x) || 0);
  }).pop();
  return {
    x: Math.round(Number(lowest.x) || Number(base.x) || 0),
    y: Math.round((Number(lowest.y) || 0) + graphNodeHeightForStack(lowest) + 24)
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

function clientToGraphContentPoint(clientX, clientY) {
  const rect = el.graphContent.getBoundingClientRect();
  const scale = state.view.scale || 1;
  return {
    x: (clientX - rect.left) / scale,
    y: (clientY - rect.top) / scale
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

function isFiniteGraphPosition(position) {
  return position
    && Number.isFinite(Number(position.x))
    && Number.isFinite(Number(position.y))
    && Math.abs(Number(position.x)) <= 100000
    && Math.abs(Number(position.y)) <= 100000;
}

// ---------- Graph render ----------
function visibleNodes() {
  return state.graph.nodes.filter(function (n) {
    const def = state.nodeTypes[n.type] || {};
    const isGroupInterfaceNode = n.type === "group_input" || n.type === "group_output";
    return (n.parentId || null) === state.currentGroupId && !def.internal && (!def.hidden || isGroupInterfaceNode);
  });
}

function nodeById(id) {
  return state.graph.nodes.find(function (n) { return n.id === id; });
}

function nodeDisplayTitle(node) {
  if (!node) return "";
  const customTitle = typeof node.values?.title === "string" ? node.values.title.trim() : "";
  return customTitle || node.title;
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
  if (node.type === "graph_frame") return graphFrameSize(node).width;
  return def.container ? 240 : NODE_WIDTH;
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

function nodeCardBounds(node, card) {
  const position = readNodeCardPosition(node, card);
  const size = node.type === "graph_frame"
    ? graphFrameSize(node)
    : {
        width: card?.offsetWidth || nodeWidth(node),
        height: card?.offsetHeight || 90
      };
  return {
    left: position.x,
    top: position.y,
    right: position.x + size.width,
    bottom: position.y + size.height
  };
}

function graphFrameContainedNodeIds(frameNode, frameCard) {
  if (!frameNode || frameNode.type !== "graph_frame") return [];
  const frameBounds = nodeCardBounds(frameNode, frameCard);
  return visibleNodes().filter(function (candidate) {
    if (candidate.id === frameNode.id || candidate.type === "graph_frame") return false;
    if ((candidate.parentId || null) !== (frameNode.parentId || null)) return false;
    const candidateCard = el.nodeLayer.querySelector('.gnode[data-node-id="' + candidate.id + '"]');
    const bounds = nodeCardBounds(candidate, candidateCard);
    return bounds.left >= frameBounds.left
      && bounds.top >= frameBounds.top
      && bounds.right <= frameBounds.right
      && bounds.bottom <= frameBounds.bottom;
  }).map(function (candidate) {
    return candidate.id;
  });
}

function portEntriesForNode(node, direction) {
  const ports = resolvedPorts(node);
  return Object.entries(direction === "input" ? ports.inputs || {} : ports.outputs || {}).filter(function ([, port]) {
    return !port.hidden && !port.internal;
  });
}

function portIndexForNode(node, portName, direction) {
  return portEntriesForNode(node, direction).findIndex(function (entry) { return entry[0] === portName; });
}

// Single source of truth for "the color that represents this node": when there is
// exactly one output port, use its data type color so this always matches the
// port dot / connection line color for that node. Falls back otherwise (0 or
// multiple outputs) since there is no single data type to key off of.
function accentColorFromOutputs(outputEntries, fallbackColor) {
  if (outputEntries.length === 1 && outputEntries[0][1] && outputEntries[0][1].dataType) {
    return dataTypeColor(outputEntries[0][1].dataType);
  }
  return fallbackColor;
}

function groupAccentForNode(node) {
  const outputs = portEntriesForNode(node, "output");
  return accentColorFromOutputs(outputs, (state.nodeTypes.group && state.nodeTypes.group.accent) || "#8a97a3");
}

function accentColorForNodeDef(def) {
  const outputs = Object.entries(def?.outputs || {}).filter(function ([, port]) {
    return port && !port.hidden && !port.internal;
  });
  return accentColorFromOutputs(outputs, def?.accent || "#7bd4ff");
}

function zoneCanvasChildSummary(group) {
  const children = (state.graph.nodes || []).filter(function (node) {
    return node.parentId === group.id && node.type !== "group_input" && node.type !== "group_output";
  });
  const has = function (type) { return children.some(function (node) { return node.type === type; }); };
  return [
    has("zone_definition") ? "definition" : "mist definition",
    has("zone_environment_settings") ? "settings" : "mist settings",
    has("ground_surface") ? "ground" : "mist ground",
    has("spawn_point") ? "spawn" : "mist spawn",
    has("zone_output") ? "output" : "mist output"
  ];
}

function buildZoneCanvasSummary(group) {
  const zone = zoneDefinitionForGroup(group.id);
  const grid = zoneCanvasGridForGroup(group);
  const values = zone?.values || {};
  const fallbackOrigin = zoneCanvasOriginForGrid(grid);
  const originX = Number.isFinite(Number(values.originX)) ? Number(values.originX) : fallbackOrigin.originX;
  const originZ = Number.isFinite(Number(values.originZ)) ? Number(values.originZ) : fallbackOrigin.originZ;
  const width = Number.isFinite(Number(values.width)) ? Number(values.width) : ZONE_CANVAS_SIZE;
  const depth = Number.isFinite(Number(values.depth)) ? Number(values.depth) : ZONE_CANVAS_SIZE;
  const centerX = originX + width / 2;
  const centerZ = originZ + depth / 2;
  const isRoot = isZoneCanvasRootGroup(group);
  const wrap = document.createElement("div");
  wrap.className = "zoneCanvasSummary";
  const id = document.createElement("div");
  id.className = "zoneCanvasId";
  id.textContent = values.zoneId || group.values?.groupId || "zone.canvas";
  const bounds = document.createElement("div");
  bounds.className = "zoneCanvasBounds";
  bounds.textContent = (isRoot ? "start" : "child") + " center " + centerX + "," + centerZ + " / " + width + "x" + depth;
  const nodes = document.createElement("div");
  nodes.className = "zoneCanvasNodes";
  nodes.textContent = zoneCanvasChildSummary(group).join(" | ");
  wrap.append(id, bounds, nodes);
  return wrap;
}

function appendZoneCanvasPlusControls(card, group) {
  const sourceGrid = zoneCanvasGridForGroup(group);
  for (const [directionName, direction] of Object.entries(ZONE_CANVAS_DIRECTIONS)) {
    const targetGrid = { x: sourceGrid.x + direction.dx, z: sourceGrid.z + direction.dz };
    const linkedZone = findZoneCanvasAtGrid(group.parentId || null, targetGrid);
    if (linkedZone) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "zoneCanvasPlus " + directionName;
    button.textContent = "+";
    button.title = "Nieuwe zone " + direction.label.toLowerCase() + " toevoegen";
    button.addEventListener("pointerdown", function (event) {
      event.stopPropagation();
    });
    button.addEventListener("click", function (event) {
      event.stopPropagation();
      expandZoneCanvas(group.id, directionName);
    });
    card.appendChild(button);
  }
}

function inputAnchor(node, portName) {
  const dotAnchor = portDotAnchor(node, portName, "input");
  if (dotAnchor) return dotAnchor;
  const pos = nodePositionForRender(node);
  const idx = Math.max(0, portIndexForNode(node, portName, "input"));
  return { x: pos.x + 1, y: pos.y + HEAD + PAD + idx * (PORT_ROW + PORT_GAP) + PORT_ROW / 2 + 1 };
}
function outputAnchor(node, portName) {
  const dotAnchor = portDotAnchor(node, portName, "output");
  if (dotAnchor) return dotAnchor;
  const pos = nodePositionForRender(node);
  const idx = Math.max(0, portIndexForNode(node, portName, "output"));
  const width = nodeWidth(node);
  return { x: pos.x + width - 1, y: pos.y + HEAD + PAD + idx * (PORT_ROW + PORT_GAP) + PORT_ROW / 2 + 1 };
}

function cssEscapeValue(value) {
  if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(value));
  return String(value).replace(/["\\]/g, "\\$&");
}

function portDotAnchor(node, portName, direction) {
  const selector = '.gnode[data-node-id="' + cssEscapeValue(node.id) + '"] .port[data-port-name="' + cssEscapeValue(portName) + '"][data-port-direction="' + direction + '"] .portDot';
  const dot = el.nodeLayer.querySelector(selector);
  if (!dot) return null;
  const rect = dot.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return clientToGraphContentPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function oppositeZoneCanvasDirection(directionName) {
  if (directionName === "top") return "bottom";
  if (directionName === "right") return "left";
  if (directionName === "bottom") return "top";
  if (directionName === "left") return "right";
  return "";
}

function escapeSvgAttr(value) {
  return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, function (char) {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === "\"") return "&quot;";
    return "&#39;";
  });
}

function zoneCanvasPlusAnchor(node, directionName) {
  const selector = '.gnode[data-node-id="' + cssEscapeValue(node.id) + '"] .zoneCanvasPlus.' + directionName;
  const plus = el.nodeLayer.querySelector(selector);
  if (plus) {
    const rect = plus.getBoundingClientRect();
    if (rect.width && rect.height) return clientToGraphContentPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
  const pos = nodePositionForRender(node);
  const card = el.nodeLayer.querySelector('.gnode[data-node-id="' + cssEscapeValue(node.id) + '"]');
  const width = nodeWidth(node);
  const height = card ? card.offsetHeight : 150;
  if (directionName === "top") return { x: pos.x + width / 2, y: pos.y };
  if (directionName === "right") return { x: pos.x + width, y: pos.y + height / 2 };
  if (directionName === "bottom") return { x: pos.x + width / 2, y: pos.y + height };
  if (directionName === "left") return { x: pos.x, y: pos.y + height / 2 };
  return { x: pos.x + width / 2, y: pos.y + height / 2 };
}

function zoneCanvasAdjacencyPath(a, b, directionName) {
  if (directionName === "top" || directionName === "bottom") {
    const dy = Math.max(32, Math.abs(b.y - a.y) * 0.5);
    const sign = directionName === "top" ? -1 : 1;
    return "M " + a.x + " " + a.y + " C " + a.x + " " + (a.y + dy * sign) + " " + b.x + " " + (b.y - dy * sign) + " " + b.x + " " + b.y;
  }
  const dx = Math.max(32, Math.abs(b.x - a.x) * 0.5);
  const sign = directionName === "left" ? -1 : 1;
  return "M " + a.x + " " + a.y + " C " + (a.x + dx * sign) + " " + a.y + " " + (b.x - dx * sign) + " " + b.y + " " + b.x + " " + b.y;
}

function renderZoneCanvasAdjacencyLinks(nodes) {
  const zoneNodes = nodes.filter(function (node) {
    return isZoneCanvasGroup(node);
  });
  if (!zoneNodes.length) return "";
  const byGrid = new Map();
  for (const node of zoneNodes) byGrid.set(zoneGridKey(zoneCanvasGridForGroup(node)), node);
  let markup = "";
  for (const node of zoneNodes) {
    const grid = zoneCanvasGridForGroup(node);
    for (const directionName of ["right", "bottom"]) {
      const direction = ZONE_CANVAS_DIRECTIONS[directionName];
      const target = byGrid.get(zoneGridKey({ x: grid.x + direction.dx, z: grid.z + direction.dz }));
      if (!target) continue;
      const targetDirectionName = oppositeZoneCanvasDirection(directionName);
      const a = zoneCanvasPlusAnchor(node, directionName);
      const b = zoneCanvasPlusAnchor(target, targetDirectionName);
      const path = zoneCanvasAdjacencyPath(a, b, directionName);
      const sourceId = escapeSvgAttr(node.id);
      const targetId = escapeSvgAttr(target.id);
      const title = escapeSvgAttr(nodeDisplayTitle(node) + " -> " + nodeDisplayTitle(target));
      markup += "<path class=\"zoneCanvasAdjacencyHit\" data-zone-link-source=\"" + sourceId + "\" data-zone-link-target=\"" + targetId + "\" d=\"" + path + "\"><title>" + title + "</title></path>";
      markup += "<path class=\"zoneCanvasAdjacency\" d=\"" + path + "\"></path>";
      markup += "<circle class=\"zoneCanvasAdjacencyDot\" cx=\"" + a.x + "\" cy=\"" + a.y + "\" r=\"3.5\"></circle>";
      markup += "<circle class=\"zoneCanvasAdjacencyDot\" cx=\"" + b.x + "\" cy=\"" + b.y + "\" r=\"3.5\"></circle>";
    }
  }
  return markup;
}

function buildMinimapBakeNodePreview(node) {
  const wrap = document.createElement("div");
  wrap.className = "minimapNodePreview";
  const imageUrl = normalizeMinimapImageUrl(node.values?.bakedImageUrl);
  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = node.values?.label || "Minimap preview";
    img.addEventListener("error", function () {
      wrap.classList.add("missing");
      wrap.textContent = "Geen preview";
    });
    wrap.appendChild(img);
  } else {
    wrap.classList.add("missing");
    wrap.textContent = "Nog geen bake";
  }
  return wrap;
}

function renderGraph() {
  el.nodeLayer.innerHTML = "";
  const nodes = visibleNodes();
  const frameNodes = nodes.filter(function (node) { return node.type === "graph_frame"; });
  const normalNodes = nodes.filter(function (node) { return node.type !== "graph_frame"; });
  for (const node of frameNodes) el.nodeLayer.appendChild(buildNodeElement(node));
  for (const node of normalNodes) el.nodeLayer.appendChild(buildNodeElement(node));
  renderEdges(nodes);
  syncSelectedNodeCard();
}

function buildNodeElement(node) {
  if (node.type === "graph_frame") return buildGraphFrameElement(node);
  const def = state.nodeTypes[node.type];
  const pos = nodePositionForRender(node);
  const isZoneCanvas = isZoneCanvasGroup(node);
  const card = document.createElement("div");
  card.className = "gnode" + (def.container ? " isGroup" : "") + (isZoneCanvas ? " isZoneCanvas" : "") + (def.system ? " isSystem" : "") + (def.locked ? " isLocked" : "") + (state.selectedNodeIds.includes(node.id) ? " selected" : "");
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
    : accentColorFromOutputs(portEntriesForNode(node, "output"), def.accent || "#7bd4ff");
  accent.style.background = accentColor;
  const title = document.createElement("span");
  title.className = "gnodeTitle";
  title.textContent = nodeDisplayTitle(node);
  const typeTag = document.createElement("span");
  typeTag.className = "gnodeType";
  typeTag.textContent = def.label;
  const info = createHelpIcon(buildNodeHelpText(node, def), { className: "helpInfoIcon helpInfoIcon--node", side: "top" });
  head.append(accent, title, typeTag);
  if (info) head.appendChild(info);
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
  for (const [portName, port] of portEntriesForNode(node, "input")) {
    inputs.appendChild(buildPort(node, portName, port, "input"));
  }
  const outputs = document.createElement("div");
  outputs.className = "portCol outputs";
  for (const [portName, port] of portEntriesForNode(node, "output")) {
    outputs.appendChild(buildPort(node, portName, port, "output"));
  }
  body.append(inputs, outputs);
  card.appendChild(body);

  if (node.type === "minimap_bake") {
    card.appendChild(buildMinimapBakeNodePreview(node));
  }

  if (isZoneCanvas) {
    card.appendChild(buildZoneCanvasSummary(node));
    appendZoneCanvasPlusControls(card, node);
  }

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
    if (event.target.closest(".port, .enterGroup, .zoneCanvasPlus, .zoneCanvasAction")) return;
    commitActiveEditorControl();
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      selectNode(node.id, false, { toggle: true, clearPendingEdge: true, showMobileInspector: true });
      return;
    }
    if (event.shiftKey) {
      event.preventDefault();
      selectNode(node.id, false, { extend: true, clearPendingEdge: true, showMobileInspector: true });
      return;
    }
    selectNode(node.id, false, { clearPendingEdge: true, showMobileInspector: true });
    // Frame whatever this node represents in 3D (model entities included - this used to
    // be skipped for model_entity specifically, which is exactly the most common node
    // type with a 3D representation, so the viewport never followed those clicks).
    if (node.type !== "graph_frame") focusTerrainOrSelected();
  });
  return card;
}

function graphFrameSize(node) {
  const width = Math.max(GRAPH_FRAME_MIN_WIDTH, Math.min(12000, Number(node?.values?.frameWidth) || 760));
  const height = Math.max(GRAPH_FRAME_MIN_HEIGHT, Math.min(12000, Number(node?.values?.frameHeight) || 420));
  return { width: Math.round(width), height: Math.round(height) };
}

function graphFrameColor(node) {
  const color = String(node?.values?.color || "#2f6f8f").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#2f6f8f";
}

function buildGraphFrameElement(node) {
  const pos = nodePositionForRender(node);
  const size = graphFrameSize(node);
  const color = graphFrameColor(node);
  const card = document.createElement("div");
  card.className = "gnode graphFrame" + (state.selectedNodeIds.includes(node.id) ? " selected" : "");
  card.style.left = pos.x + "px";
  card.style.top = pos.y + "px";
  card.style.width = size.width + "px";
  card.style.height = size.height + "px";
  card.style.setProperty("--frame-color", color);
  card.dataset.nodeId = node.id;

  const head = document.createElement("div");
  head.className = "gnodeHead graphFrameHead";
  const accent = document.createElement("span");
  accent.className = "gnodeAccent";
  accent.style.background = color;
  const title = document.createElement("span");
  title.className = "gnodeTitle";
  title.textContent = nodeDisplayTitle(node);
  const typeTag = document.createElement("span");
  typeTag.className = "gnodeType";
  typeTag.textContent = "Frame";
  const infoToggle = document.createElement("button");
  infoToggle.type = "button";
  infoToggle.className = "graphFrameInfoToggle";
  infoToggle.textContent = "i";
  infoToggle.title = "Info openen/sluiten";
  infoToggle.setAttribute("aria-label", "Frame info openen/sluiten");
  infoToggle.setAttribute("aria-pressed", node.values?.infoOpen === true ? "true" : "false");
  infoToggle.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    patchValues(node.id, { infoOpen: node.values?.infoOpen !== true }, {
      historyLabel: "Frame info",
      refreshViewport: false,
      refreshValidation: false
    });
  });
  head.append(accent, title, typeTag, infoToggle);
  card.appendChild(head);

  if (node.values?.infoOpen === true) {
    const panel = document.createElement("aside");
    panel.className = "graphFrameInfoPanel";
    panel.textContent = String(node.values?.note || "").trim() || "Geen info ingevuld.";
    panel.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
    panel.addEventListener("click", function (event) { event.stopPropagation(); });
    card.appendChild(panel);
  }

  const resize = document.createElement("div");
  resize.className = "graphFrameResize";
  resize.title = "Frame vergroten/verkleinen";
  resize.addEventListener("pointerdown", function (event) { startGraphFrameResize(event, node, card); });
  card.appendChild(resize);

  head.addEventListener("pointerdown", function (event) { startNodeDrag(event, node, card); });
  card.addEventListener("pointerdown", function (event) {
    if (event.button !== 0) return;
    if (event.target.closest(".graphFrameInfoToggle, .graphFrameResize")) return;
    commitActiveEditorControl();
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      selectNode(node.id, false, { toggle: true, clearPendingEdge: true, showMobileInspector: true });
      return;
    }
    if (event.shiftKey) {
      event.preventDefault();
      selectNode(node.id, false, { extend: true, clearPendingEdge: true, showMobileInspector: true });
      return;
    }
    selectNode(node.id, false, { clearPendingEdge: true, showMobileInspector: true });
  });
  return card;
}

function startGraphFrameResize(event, node, card) {
  if (event.button !== 0 || event.isPrimary === false) return;
  event.preventDefault();
  event.stopPropagation();
  const pointerId = event.pointerId;
  const startPoint = clientToGraphPoint(event.clientX, event.clientY);
  if (!isFiniteGraphPoint(startPoint)) return;
  const startSize = graphFrameSize(node);
  let nextSize = startSize;
  let didResize = false;
  const resizeTarget = event.currentTarget;
  card.classList.add("resizing");
  if (resizeTarget && typeof resizeTarget.setPointerCapture === "function") {
    try { resizeTarget.setPointerCapture(pointerId); } catch {}
  }

  function cleanup() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    card.classList.remove("resizing");
    if (resizeTarget && typeof resizeTarget.releasePointerCapture === "function") {
      try { resizeTarget.releasePointerCapture(pointerId); } catch {}
    }
  }

  function onMove(moveEvent) {
    if (moveEvent.pointerId !== pointerId) return;
    const graphPoint = clientToGraphPoint(moveEvent.clientX, moveEvent.clientY);
    if (!isFiniteGraphPoint(graphPoint)) return;
    nextSize = {
      width: Math.round(Math.max(GRAPH_FRAME_MIN_WIDTH, Math.min(12000, startSize.width + graphPoint.x - startPoint.x))),
      height: Math.round(Math.max(GRAPH_FRAME_MIN_HEIGHT, Math.min(12000, startSize.height + graphPoint.y - startPoint.y)))
    };
    didResize = didResize || Math.abs(nextSize.width - startSize.width) > 1 || Math.abs(nextSize.height - startSize.height) > 1;
    card.style.width = nextSize.width + "px";
    card.style.height = nextSize.height + "px";
  }

  function onUp(upEvent) {
    if (upEvent.pointerId !== pointerId) return;
    cleanup();
    if (!didResize) return;
    patchValues(node.id, { frameWidth: nextSize.width, frameHeight: nextSize.height }, {
      historyLabel: "Frame formaat",
      refreshViewport: false,
      refreshValidation: false
    });
  }

  function onCancel(cancelEvent) {
    if (cancelEvent.pointerId !== pointerId) return;
    cleanup();
    card.style.width = startSize.width + "px";
    card.style.height = startSize.height + "px";
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
}

function identityValue(node) {
  const def = state.nodeTypes[node.type];
  if (node.type === "editor_world_settings") return node.values.editorPreset || "(kies preset)";
  if (node.type === "game_world_settings") return node.values.gamePreset || "(kies preset)";
  const idKey = Object.keys(def.fields).find(function (key) { return def.fields[key].pattern === "^[a-z0-9_:-]+$"; });
  return idKey && node.values[idKey] ? node.values[idKey] : "(geen id)";
}

function buildPort(node, portName, port, direction) {
  const wrap = document.createElement("div");
  wrap.className = "port";
  wrap.dataset.portName = portName;
  wrap.dataset.portDirection = direction;
  const dot = document.createElement("span");
  dot.className = "portDot";
  dot.style.borderColor = dataTypeColor(port.dataType);
  dot.style.background = dataTypeColor(port.dataType);
  if (state.pendingEdge && state.pendingEdge.fromNodeId === node.id && state.pendingEdge.fromPort === portName) wrap.classList.add("armed");
  const label = document.createElement("span");
  label.className = "portLabel";
  label.textContent = portDisplayName(port.dataType);
  const info = createHelpIcon(buildPortHelpText(node, portName, port, direction), { className: "helpInfoIcon helpInfoIcon--port" });
  wrap.append(dot, label);
  if (info) wrap.appendChild(info);
  wrap.addEventListener("pointerdown", function (event) { if (event.button === 0) event.stopPropagation(); });
  wrap.addEventListener("click", function (event) {
    event.stopPropagation();
    onPortClick(node, portName, port, direction);
  });
  return wrap;
}

const PORT_DISPLAY_NAMES = {
  world: "world",
  editorWorldSettings: "editor",
  gameWorldSettings: "game",
  ground: "ground",
  terrain: "terrain",
  collision: "block",
  camera: "camera",
  light: "light",
  player: "player",
  spawn: "spawn",
  entity: "entity",
  interactable: "interact",
  chunkLoading: "loading",
  keybind: "keys",
  ui: "ui",
  minimap: "map",
  value: "value",
  projectSettings: "project",
  chunkGrid: "grid",
  chunkPolicy: "policy",
  legacyWorldPackage: "legacy",
  globalValueDef: "global",
  tagDef: "tag",
  textTemplate: "text",
  localizedTextDef: "locale",
  catalogDefinition: "catDef",
  catalogPackage: "catPkg",
  catalogRegistry: "catReg",
  zonePackage: "zonePkg",
  zoneRegistry: "zoneReg",
  campaignPackage: "campPkg",
  campaignRegistry: "campReg",
  playerRules: "rules",
  uiPackage: "uiPkg",
  gameProject: "gameProject",
  group: "group"
};

function portDisplayName(dataType) {
  return PORT_DISPLAY_NAMES[dataType] || String(dataType || "port");
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
  const sourceNode = nodeById(state.pendingEdge.fromNodeId);
  const sourcePort = sourceNode ? resolvedPorts(sourceNode).outputs?.[state.pendingEdge.fromPort] : null;
  const reason = connectionInvalidReason(sourceNode, sourcePort, node, port, portName);
  if (reason) {
    setStatus(reason, "error");
    return;
  }
  connectEdge(state.pendingEdge, { toNodeId: node.id, toPort: portName });
}

function readableDataType(dataType) {
  const raw = String(dataType || "unknown");
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_:-]+/g, " ")
    .trim()
    .replace(/\b\w/g, function (char) { return char.toUpperCase(); }) || raw;
}

function tokenMatches(text) {
  return Array.from(String(text || "").matchAll(/@\{([^}]+)\}/g)).map(function (match) {
    return String(match[1] || "").trim();
  }).filter(Boolean);
}

function renderTokenTextPreview(textarea, container) {
  const raw = String(textarea.value || "");
  const tokens = tokenMatches(raw);
  container.textContent = "Tokens: " + (tokens.length ? tokens.join(", ") : "geen") + ". Preview laden...";
  api("/api/editor/tokens/preview", {
    method: "POST",
    body: JSON.stringify({ text: raw, staticContextOnly: true })
  }).then(function (preview) {
    const errors = Array.isArray(preview?.errors) ? preview.errors : [];
    const warnings = Array.isArray(preview?.warnings) ? preview.warnings : [];
    const sourceText = tokens.includes("global.game_name") ? " Source: Game Project Settings.gameName." : "";
    container.textContent = [
      "Raw: " + raw,
      "Tokens: " + (tokens.length ? tokens.join(", ") : "geen"),
      "Static preview: " + String(preview?.text || ""),
      sourceText.trim(),
      errors.length ? "Errors: " + errors.map(function (error) { return error.message || error.code || String(error); }).join("; ") : "",
      warnings.length ? "Warnings: " + warnings.map(function (warning) { return warning.message || warning.code || String(warning); }).join("; ") : ""
    ].filter(Boolean).join("\n");
    container.classList.toggle("err", errors.length > 0);
  }).catch(function (error) {
    container.textContent = "Token preview kon niet worden geladen: " + (error?.message || String(error));
    container.classList.add("err");
  });
}

function connectionInvalidReason(sourceNode, sourcePort, targetNode, targetPort, targetPortName) {
  if (!sourceNode || !sourcePort) return "De gekozen output bestaat niet meer.";
  if (!targetPort) return "De gekozen input bestaat niet meer.";
  if (targetNode?.type === "game_output" && targetPortName !== "gameProject") {
    return "Game Output accepteert alleen Game Project. Verbind World Assembly.gameProject naar Game Output.gameProject.";
  }
  if (sourcePort.dataType !== targetPort.dataType) {
    return "Ongeldige verbinding: " + readableDataType(sourcePort.dataType) + " past niet op " + readableDataType(targetPort.dataType) + ".";
  }
  if ((sourceNode.parentId || null) !== (targetNode.parentId || null)) {
    return "Ongeldige verbinding: gebruik de group interface om group-grenzen te passeren.";
  }
  return "";
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
  markup += renderZoneCanvasAdjacencyLinks(nodes);
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
  if (event.button !== 0) return;
  const path = event.target.closest ? event.target.closest("[data-edge-id]") : null;
  if (!path) {
    const zoneLink = event.target.closest ? event.target.closest("[data-zone-link-target]") : null;
    if (!zoneLink) return;
    event.stopPropagation();
    event.preventDefault();
    const source = nodeById(zoneLink.dataset.zoneLinkSource);
    const target = nodeById(zoneLink.dataset.zoneLinkTarget);
    const root = source ? zoneCanvasRootGroupForGroup(source) : null;
    const selected = target && root && target.id === root.id && source ? source : target;
    if (selected) {
      commitActiveEditorControl();
      selectNode(selected.id, true, { clearPendingEdge: true, showMobileInspector: true });
      setStatus("Zone-koppeling geselecteerd. Sleep de geselecteerde zone naar een andere vrije kant of gebruik Delete om die zone te verwijderen.", "");
    }
    return;
  }
  event.stopPropagation();
  event.preventDefault();
  commitActiveEditorControl();
  const edgeId = path.dataset.edgeId;
  const additive = event.shiftKey || event.ctrlKey || event.metaKey;
  if (additive) {
    selectEdge(edgeId, { toggle: event.ctrlKey || event.metaKey, extend: event.shiftKey, clearPendingEdge: true });
  } else {
    selectEdge(edgeId, { clearPendingEdge: true });
  }
  showMobileInspectorPanel();
});

// Folds a group move/rotate/scale into a single restoreGraphObject call, same batching
// pattern as deleteSelectedNodes/pasteSelection, so undo/redo treats the whole group
// transform as one step. payload.commits is one {entityId, transform} per model_entity
// that was live-dragged; payload.delta (move only) is the ground-plane distance the drag
// covered, applied on top of that to whichever selected nodes have no live mesh of their
// own (Walkable Surface, Surface Layer, Blocker Area, Area Definition, Location Anchor) by
// translating their points wholesale, the same way the single-node "move via center
// handle" already does (terrainPointsPatch/scatterTranslatePoints).
async function commitGroupTransform(payload) {
  const commits = payload?.commits || [];
  const patchedNodeIds = new Set();
  const patches = commits
    .map(function (entry) {
      const node = nodeByRuntimeId(entry.entityId);
      if (!node || node.type !== "model_entity") return null;
      patchedNodeIds.add(node.id);
      return { nodeId: node.id, values: normalizeModelEntityTransformPatch(node, entry.transform || {}) };
    })
    .filter(Boolean);
  const delta = payload?.mode === "move" ? payload.delta : null;
  if (delta && (delta.x || delta.z)) {
    for (const nodeId of state.selectedNodeIds) {
      if (patchedNodeIds.has(nodeId)) continue;
      const node = nodeById(nodeId);
      if (!node) continue;
      if (TERRAIN_TOOL_NODE_TYPES.has(node.type)) {
        const explicitPoints = Array.isArray(node.values?.points) ? node.values.points : [];
        if (explicitPoints.length > 0) {
          // A genuinely edited polygon - shift every point, same as the single-node
          // "move via center handle" (terrainCommitSurfaceDrag).
          const nextPoints = scatterTranslatePoints(terrainNodePoints(node), delta.x, delta.z);
          patches.push({ nodeId: node.id, values: terrainPointsPatch(node, nextPoints) });
          continue;
        }
        // No explicit points yet (still the default rectangle/point derived from x/z) -
        // just shift x/z directly below. Reusing terrainPointsPatch here would write a
        // points array and force shapeType to "polygon", silently changing how the node
        // edits, which a plain move shouldn't do.
      }
      // Generic locator fallback (Player Spawn, and anything else with a plain x/z
      // world position but no points array) - same field check as nodeCoordinatePoint.
      const fields = state.nodeTypes?.[node.type]?.fields;
      if (!fields || !fields.x || !fields.z) continue;
      const values = { x: Number(node.values?.x || 0) + delta.x, z: Number(node.values?.z || 0) + delta.z };
      patches.push({ nodeId: node.id, values: values });
    }
  }
  if (!patches.length) return;
  const pureModelTransform = patches.every(function (patch) {
    const node = nodeById(patch.nodeId);
    return isModelEntityTransformPatch(node, patch.values);
  });
  await applyGraphMutation(async function () {
    await apiOk("/api/editor/nodes/values/bulk", {
      method: "POST",
      body: JSON.stringify({ patches, returnGraph: false })
    });
    return graphWithPatchedNodeValuesBulk(state.graph, patches);
  }, {
    historyLabel: "Groep transform",
    refreshViewport: !pureModelTransform,
    refreshGraph: !pureModelTransform,
    refreshEdgeList: false,
    refreshInspector: !pureModelTransform,
    refreshViewportControls: !pureModelTransform,
    refreshValidation: false,
    afterApply: function () {
      for (const patch of patches) syncRuntimeModelEntityTransform(patch.nodeId);
    }
  });
}

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
  if (event.target.closest(".port, .enterGroup, .graphFrameInfoToggle, .graphFrameResize")) return;
  event.preventDefault();
  event.stopPropagation();
  const dragStartedFromSelection = state.selectedNodeIds.includes(node.id) && state.selectedNodeIds.length;
  let movingNodeIds = dragStartedFromSelection ? state.selectedNodeIds.slice() : [node.id];
  const frameDragWithContents = node.type === "graph_frame" && movingNodeIds.length === 1;
  if (frameDragWithContents) {
    movingNodeIds = Array.from(new Set(movingNodeIds.concat(graphFrameContainedNodeIds(node, card))));
  }
  const selectionAfterDrag = frameDragWithContents ? [node.id] : movingNodeIds.slice();
  const selectionAlreadyMatches = selectionAfterDrag.length === state.selectedNodeIds.length
    && selectionAfterDrag.every(function (nodeId) { return state.selectedNodeIds.includes(nodeId); });
  if (!selectionAlreadyMatches) {
    setSelection(selectionAfterDrag, [], { primaryNodeId: node.id, clearPendingEdge: true });
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
  const historyLabel = frameDragWithContents ? "Frame verplaatst" : (movingNodeIds.length > 1 ? "Nodes verplaatst" : "Node verplaatst");
  const historySnapshot = captureHistorySnapshot(historyLabel);
  const dragBounds = 100000;
  let dragFinished = false;
  let cancelThisDrag = null;
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
    if (activeNodeDragCancel === cancelThisDrag) activeNodeDragCancel = null;
  }

  cancelThisDrag = function () {
    cleanup(true);
  };
  activeNodeDragCancel = cancelThisDrag;

  function onMove(moveEvent) {
    if (moveEvent.pointerId !== pointerId) return;
    if (!state.dragSession || state.dragSession.sessionId !== sessionId) return;
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
    if (dragFinished) return;
    dragFinished = true;
    const sessionState = state.dragSession;
    const committedPositions = sessionState && sessionState.nextPositions && sessionState.nextPositions.size
      ? Array.from(sessionState.nextPositions.entries())
      : Array.from(origins.entries());
    cleanup(!commit);
    if (!commit) return;
    const nextGraph = cloneGraphForRestore(state.graph);
    for (const [nodeId, position] of committedPositions) {
      if (!isFiniteGraphPosition(position)) {
        for (const [originNodeId, originPosition] of origins.entries()) {
          delete state.dragPreviewPositions[originNodeId];
          syncNodeCardPosition(originNodeId, originPosition);
        }
        setStatus("Ongeldige sleep-coördinaten voor " + node.title + ".", "error");
        return;
      }
      const graphNode = nextGraph.nodes.find(function (candidate) { return candidate.id === nodeId; });
      if (!graphNode) continue;
      graphNode.x = Math.round(Number(position.x));
      graphNode.y = Math.round(Number(position.y));
    }
    const zoneSnap = snapMovedZoneCanvasGroups(nextGraph, movingNodeIds);
    const result = await restoreGraphObject(nextGraph, {
      historySnapshot: historySnapshot,
      historyLabel: historyLabel,
      selectedNodeIds: selectionAfterDrag.slice(),
      refreshGraph: true,
      refreshEdgeList: false,
      refreshInspector: true,
      refreshViewport: zoneSnap.moved,
      refreshValidation: zoneSnap.moved,
      afterApply: function () {
        for (const [nodeId, position] of committedPositions) delete state.dragPreviewPositions[nodeId];
        scheduleEdgeRender();
        if (zoneSnap.collisions > 0) setStatus("Zone verplaatst en teruggesnapt: die canvaspositie is al bezet.", "");
        else setStatus(frameDragWithContents ? "Frame verplaatst." : (movingNodeIds.length > 1 ? "Nodes verplaatst." : "Node verplaatst."), "success");
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
    if (!shouldCommit) showMobileInspectorPanel();
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
    const shouldCommit = Boolean(state.dragSession && state.dragSession.sessionId === sessionId && state.dragSession.didMove && state.dragSession.nextPositions);
    finishDrag(shouldCommit);
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

function clampGraphScale(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(2.2, Math.max(0.25, number));
}

function graphPanSpeedMultiplier() {
  const scale = Number(state.view.scale) || 1;
  return Math.max(1, scale / 0.25);
}

function zoomGraphAt(clientX, clientY, factor) {
  const rect = el.graphViewport.getBoundingClientRect();
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const oldScale = state.view.scale || 1;
  const newScale = clampGraphScale(oldScale * factor);
  state.view.panX = localX - (localX - state.view.panX) * (newScale / oldScale);
  state.view.panY = localY - (localY - state.view.panY) * (newScale / oldScale);
  state.view.scale = newScale;
  applyTransform();
}

function zoomGraphBy(factor) {
  const rect = el.graphViewport.getBoundingClientRect();
  zoomGraphAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
}

function fitGraphViewToNodes() {
  const nodes = visibleNodes();
  const rect = el.graphViewport.getBoundingClientRect();
  if (!nodes.length || !rect.width || !rect.height) {
    state.view = { panX: 40, panY: 40, scale: 1 };
    applyTransform();
    return;
  }
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const node of nodes) {
    const card = el.nodeLayer.querySelector('.gnode[data-node-id="' + node.id + '"]');
    const x = Number(node.x) || 0;
    const y = Number(node.y) || 0;
    const width = Math.max(NODE_WIDTH, Math.round(card?.offsetWidth || 0));
    const height = graphNodeHeightForStack(node);
    bounds.left = Math.min(bounds.left, x);
    bounds.top = Math.min(bounds.top, y);
    bounds.right = Math.max(bounds.right, x + width);
    bounds.bottom = Math.max(bounds.bottom, y + height);
  }
  if (!Number.isFinite(bounds.left) || !Number.isFinite(bounds.top)) {
    state.view = { panX: 40, panY: 40, scale: 1 };
    applyTransform();
    return;
  }
  const padding = isMobileLayout() ? 26 : 56;
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const fitScale = Math.min(
    (rect.width - padding * 2) / width,
    (rect.height - padding * 2) / height
  );
  const scale = Math.min(2.2, Math.max(0.06, Number.isFinite(fitScale) ? fitScale : 1));
  const centerX = bounds.left + width / 2;
  const centerY = bounds.top + height / 2;
  state.view = {
    panX: Math.round(rect.width / 2 - centerX * scale),
    panY: Math.round(rect.height / 2 - centerY * scale),
    scale: scale
  };
  applyTransform();
}

function graphTouchPoint(event, interactive = false) {
  return {
    clientX: Number(event.clientX) || 0,
    clientY: Number(event.clientY) || 0,
    interactive: Boolean(interactive)
  };
}

function isGraphInteractiveTouchTarget(event) {
  return Boolean(event.target.closest(".gnode, .port, .enterGroup, .zoneCanvasPlus, .zoneCanvasAction"));
}

function graphTouchMidpoint(points) {
  return {
    clientX: (points[0].clientX + points[1].clientX) / 2,
    clientY: (points[0].clientY + points[1].clientY) / 2
  };
}

function graphTouchDistance(points) {
  return Math.max(1, Math.hypot(points[0].clientX - points[1].clientX, points[0].clientY - points[1].clientY));
}

function resetGraphTouchPanStart(point) {
  graphTouchGesture.mode = "pan";
  graphTouchGesture.startClientX = point.clientX;
  graphTouchGesture.startClientY = point.clientY;
  graphTouchGesture.startPanX = state.view.panX;
  graphTouchGesture.startPanY = state.view.panY;
}

function resetGraphTouchPinchStart() {
  const points = Array.from(graphTouchGesture.pointers.values()).slice(0, 2);
  if (points.length < 2) return;
  const midpoint = graphTouchMidpoint(points);
  const rect = el.graphViewport.getBoundingClientRect();
  const localX = midpoint.clientX - rect.left;
  const localY = midpoint.clientY - rect.top;
  graphTouchGesture.mode = "pinch";
  graphTouchGesture.startScale = state.view.scale || 1;
  graphTouchGesture.startDistance = graphTouchDistance(points);
  graphTouchGesture.anchorGraphX = (localX - state.view.panX) / graphTouchGesture.startScale;
  graphTouchGesture.anchorGraphY = (localY - state.view.panY) / graphTouchGesture.startScale;
}

function cleanupGraphTouchGesture() {
  graphTouchGesture.pointers.clear();
  graphTouchGesture.listening = false;
  graphTouchGesture.mode = "";
  el.graphViewport.classList.remove("panning");
  window.removeEventListener("pointermove", handleGraphTouchPointerMove, true);
  window.removeEventListener("pointerup", handleGraphTouchPointerEnd, true);
  window.removeEventListener("pointercancel", handleGraphTouchPointerEnd, true);
}

function handleGraphTouchPointerDown(event) {
  if (event.pointerType !== "touch") return false;
  const interactive = isGraphInteractiveTouchTarget(event);
  graphTouchGesture.pointers.set(event.pointerId, graphTouchPoint(event, interactive));
  if (!graphTouchGesture.listening) {
    graphTouchGesture.listening = true;
    window.addEventListener("pointermove", handleGraphTouchPointerMove, true);
    window.addEventListener("pointerup", handleGraphTouchPointerEnd, true);
    window.addEventListener("pointercancel", handleGraphTouchPointerEnd, true);
  }
  if (graphTouchGesture.pointers.size >= 2) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    if (activeNodeDragCancel) activeNodeDragCancel();
    try { el.graphViewport.setPointerCapture?.(event.pointerId); } catch {}
    el.graphViewport.classList.add("panning");
    resetGraphTouchPinchStart();
    return true;
  }
  if (interactive) {
    graphTouchGesture.mode = "track";
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
  try { el.graphViewport.setPointerCapture?.(event.pointerId); } catch {}
  el.graphViewport.classList.add("panning");
  resetGraphTouchPanStart(graphTouchPoint(event));
  return true;
}

function handleGraphTouchPointerMove(event) {
  if (!graphTouchGesture.pointers.has(event.pointerId)) return;
  const previous = graphTouchGesture.pointers.get(event.pointerId);
  graphTouchGesture.pointers.set(event.pointerId, graphTouchPoint(event, previous?.interactive));
  const points = Array.from(graphTouchGesture.pointers.values());
  if (points.length >= 2) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    const activePoints = points.slice(0, 2);
    if (graphTouchGesture.mode !== "pinch") resetGraphTouchPinchStart();
    const midpoint = graphTouchMidpoint(activePoints);
    const rect = el.graphViewport.getBoundingClientRect();
    const localX = midpoint.clientX - rect.left;
    const localY = midpoint.clientY - rect.top;
    const distance = graphTouchDistance(activePoints);
    const newScale = clampGraphScale(graphTouchGesture.startScale * (distance / graphTouchGesture.startDistance));
    state.view.scale = newScale;
    state.view.panX = localX - graphTouchGesture.anchorGraphX * newScale;
    state.view.panY = localY - graphTouchGesture.anchorGraphY * newScale;
    applyTransform();
    return;
  }
  if (points.length === 1) {
    if (points[0].interactive) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    const point = points[0];
    if (graphTouchGesture.mode !== "pan") resetGraphTouchPanStart(point);
    state.view.panX = graphTouchGesture.startPanX + (point.clientX - graphTouchGesture.startClientX);
    state.view.panY = graphTouchGesture.startPanY + (point.clientY - graphTouchGesture.startClientY);
    applyTransform();
  }
}

function handleGraphTouchPointerEnd(event) {
  if (!graphTouchGesture.pointers.has(event.pointerId)) return;
  const wasPanning = graphTouchGesture.mode === "pan" || graphTouchGesture.mode === "pinch";
  if (wasPanning) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
  }
  try { el.graphViewport.releasePointerCapture?.(event.pointerId); } catch {}
  graphTouchGesture.pointers.delete(event.pointerId);
  const points = Array.from(graphTouchGesture.pointers.values());
  if (points.length >= 2) {
    resetGraphTouchPinchStart();
  } else if (points.length === 1) {
    if (points[0].interactive) {
      graphTouchGesture.mode = "track";
      el.graphViewport.classList.remove("panning");
    } else {
      resetGraphTouchPanStart(points[0]);
    }
  } else {
    cleanupGraphTouchGesture();
  }
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function resizePair(startA, startB, delta, minA, minB) {
  const total = Math.max(1, startA + startB);
  const maxA = Math.max(minA, total - minB);
  const a = clampNumber(startA + delta, minA, maxA);
  return { a: a, b: Math.max(minB, total - a) };
}

function resizeRuntimeAfterLayout() {
  requestAnimationFrame(function () {
    if (runtime && typeof runtime.render === "function") runtime.render("layout-resize");
    scheduleViewportFloatingPanelLayoutRefresh();
  });
}

function applyEditorLayoutResize(drag, event) {
  if (!drag) return;
  if (drag.mobile) {
    const deltaY = event.clientY - drag.startY;
    if (drag.id === "tools") {
      setRootCssVar("--mobile-tools-height", Math.round(clampNumber(drag.toolsHeight + deltaY, 0, drag.mobileMaxHeight)) + "px", false);
    } else if (drag.id === "graph") {
      setRootCssVar("--mobile-graph-height", Math.round(clampNumber(drag.graphHeight + deltaY, 0, drag.mobileMaxHeight)) + "px", false);
    } else if (drag.id === "viewport") {
      setRootCssVar("--mobile-viewport-height", Math.round(clampNumber(drag.viewportHeight + deltaY, 0, drag.mobileMaxHeight)) + "px", false);
    }
    resizeRuntimeAfterLayout();
    return;
  }

  const deltaX = event.clientX - drag.startX;
  if (drag.id === "tools") {
    const maxTools = Math.max(0, Math.min(460, drag.layoutWidth));
    setRootCssVar("--tools-width", Math.round(clampNumber(drag.toolsWidth + deltaX, 0, maxTools)) + "px", false);
  } else if (drag.id === "graph") {
    const pair = resizePair(drag.graphWidth, drag.viewportWidth, deltaX, 0, 0);
    setRootCssVar("--graph-width", Math.round(pair.a) + "px", false);
    setRootCssVar("--viewport-width", Math.round(pair.b) + "px", false);
  } else if (drag.id === "viewport") {
    const pair = resizePair(drag.viewportWidth, drag.assetsWidth, deltaX, 0, 0);
    setRootCssVar("--viewport-width", Math.round(pair.a) + "px", false);
    setRootCssVar("--assets-width", Math.round(pair.b) + "px", false);
  }
  resizeRuntimeAfterLayout();
}

function beginEditorLayoutResize(event, resizer) {
  if (!resizer || (event.button !== undefined && event.button !== 0)) return;
  if (!el.layout) return;
  event.preventDefault();
  event.stopPropagation();
  const tools = document.querySelector(".tools");
  const graph = document.querySelector(".graphColumn");
  const viewport = document.querySelector(".viewportColumn");
  const assets = document.querySelector(".assetColumn");
  const layoutRect = el.layout.getBoundingClientRect();
  const drag = {
    id: resizer.dataset.resizer,
    mobile: isMobileLayout(),
    startX: event.clientX,
    startY: event.clientY,
    layoutWidth: layoutRect.width,
    mobileMaxHeight: Math.max(180, layoutRect.height - 80),
    toolsWidth: tools?.getBoundingClientRect().width || 250,
    graphWidth: graph?.getBoundingClientRect().width || 320,
    viewportWidth: viewport?.getBoundingClientRect().width || 320,
    assetsWidth: assets?.getBoundingClientRect().width || 310,
    toolsHeight: tools?.getBoundingClientRect().height || 220,
    graphHeight: graph?.getBoundingClientRect().height || 340,
    viewportHeight: viewport?.getBoundingClientRect().height || 360
  };
  resizer.classList.add("active");
  try { resizer.setPointerCapture?.(event.pointerId); } catch {}
  function onMove(moveEvent) {
    if (moveEvent.pointerId !== event.pointerId) return;
    moveEvent.preventDefault();
    applyEditorLayoutResize(drag, moveEvent);
  }
  function onUp(upEvent) {
    if (upEvent.pointerId !== undefined && upEvent.pointerId !== event.pointerId) return;
    resizer.classList.remove("active");
    persistEditorLayoutSizes();
    try { resizer.releasePointerCapture?.(event.pointerId); } catch {}
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onUp, true);
  }
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);
}

function initEditorLayoutResizers() {
  for (const resizer of el.layoutResizers || []) {
    resizer.addEventListener("pointerdown", function (event) {
      beginEditorLayoutResize(event, resizer);
    });
  }
}

// ---------------------------------------------------------------------------
// "All" tab: Blender-achtige vrije venster-indeling (split-boom van panes).
// De 4 bestaande paneel-elementen (.tools/.graphColumn/.viewportColumn/.assetColumn)
// worden hier NIET gekloond maar verplaatst (appendChild) naar hun plek in de boom,
// zodat canvas/WebGL-state en event listeners intact blijven. Elk paneeltype kan
// maar op 1 plek tegelijk zichtbaar zijn.
// ---------------------------------------------------------------------------

function defaultAllLayoutTree() {
  return {
    dir: "col",
    children: [
      { size: 1, node: { view: "tools" } },
      { size: 1, node: { view: "graph" } },
      { size: 1, node: { view: "viewport" } },
      { size: 1, node: { view: "assets" } }
    ]
  };
}

function isValidAllLayoutNode(node) {
  if (!node || typeof node !== "object") return false;
  if (node.view) return ALL_PANE_VIEWS.includes(node.view);
  if (node.dir === "row" || node.dir === "col") {
    return Array.isArray(node.children) && node.children.length >= 1 &&
      node.children.every(function (child) {
        return child && typeof child.size === "number" && isValidAllLayoutNode(child.node);
      });
  }
  return false;
}

function loadStoredAllLayoutTree() {
  try {
    const raw = window.localStorage.getItem(ALL_LAYOUT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidAllLayoutNode(parsed)) return parsed;
    }
  } catch {}
  return defaultAllLayoutTree();
}

function persistAllLayoutTree() {
  if (!state.allLayoutTree) return;
  try { window.localStorage.setItem(ALL_LAYOUT_STORAGE_KEY, JSON.stringify(state.allLayoutTree)); } catch {}
}

function allPaneContentElement(view) {
  if (view === "tools") return document.querySelector(".tools");
  if (view === "graph") return document.querySelector(".graphColumn");
  if (view === "viewport") return document.querySelector(".viewportColumn");
  if (view === "assets") return document.querySelector(".assetColumn");
  return null;
}

function collectUsedAllViews(node, used) {
  used = used || new Set();
  if (!node) return used;
  if (node.view) { used.add(node.view); return used; }
  for (const child of node.children || []) collectUsedAllViews(child.node, used);
  return used;
}

function getAllLayoutParentAndNode(path) {
  let parent = null;
  let node = state.allLayoutTree;
  let indexInParent = -1;
  for (const index of path) {
    parent = node;
    node = node.children[index].node;
    indexInParent = index;
  }
  return { parent, node, indexInParent };
}

function getAllLayoutNodeAt(path) {
  return getAllLayoutParentAndNode(path).node;
}

function setAllLayoutNodeAt(path, newNode) {
  const { parent, indexInParent } = getAllLayoutParentAndNode(path);
  if (!parent) { state.allLayoutTree = newNode; return; }
  parent.children[indexInParent].node = newNode;
}

function renderAllLayout() {
  if (!el.allLayoutRoot) return;
  if (!state.allLayoutTree) state.allLayoutTree = loadStoredAllLayoutTree();
  // Park the real panel elements in the (always-attached) overflow holder
  // *before* wiping the tree below. They are currently nested inside
  // el.allLayoutRoot from the previous render, so clearing its innerHTML
  // first would detach them from the document entirely, and the
  // querySelector calls in buildAllPane/allPaneContentElement would then
  // never find them again (they'd be silently lost, leaving empty panes).
  if (el.allLayoutOverflow) {
    for (const view of ALL_PANE_VIEWS) {
      const contentEl = allPaneContentElement(view);
      if (contentEl) el.allLayoutOverflow.appendChild(contentEl);
    }
  }
  el.allLayoutRoot.innerHTML = "";
  el.allLayoutRoot.appendChild(buildAllLayoutNode(state.allLayoutTree, []));
  // A "graph" pane that just became visible (wasn't in the tree before this render)
  // counts as "opening Nodes" too, same as switching to the dedicated Nodes tab:
  // jump to the last selected/added node instead of showing wherever it was last panned.
  const usedViews = collectUsedAllViews(state.allLayoutTree);
  if (usedViews.has("graph") && !allLayoutLastUsedViews.has("graph")) {
    const nodeId = state.selectedNodeId || state.selectedNodeIds[0] || null;
    if (nodeId) requestAnimationFrame(function () { focusGraphNode(nodeId); });
  }
  allLayoutLastUsedViews = usedViews;
  resizeRuntimeAfterLayout();
}

function buildAllLayoutNode(node, path) {
  return node.view ? buildAllPane(node, path) : buildAllSplit(node, path);
}

function buildAllSplit(node, path) {
  const wrap = document.createElement("div");
  wrap.className = "allSplit";
  wrap.dataset.dir = node.dir;
  node.children.forEach(function (child, index) {
    if (index > 0) {
      const resizer = document.createElement("div");
      resizer.className = "allSplitResizer";
      const indexA = index - 1;
      const indexB = index;
      resizer.addEventListener("pointerdown", function (event) {
        beginAllSplitResize(event, resizer, node, indexA, indexB);
      });
      wrap.appendChild(resizer);
    }
    const childEl = buildAllLayoutNode(child.node, path.concat(index));
    childEl.style.flex = String(Math.max(0.0001, child.size)) + " 1 0px";
    wrap.appendChild(childEl);
  });
  return wrap;
}

function buildAllPane(node, path) {
  const pane = document.createElement("div");
  pane.className = "allPane";

  const header = document.createElement("div");
  header.className = "allPaneHeader";

  const used = collectUsedAllViews(state.allLayoutTree);
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Paneel-inhoud");
  for (const view of ALL_PANE_VIEWS) {
    if (view !== node.view && used.has(view)) continue;
    const option = document.createElement("option");
    option.value = view;
    option.textContent = ALL_PANE_LABELS[view] || view;
    if (view === node.view) option.selected = true;
    select.appendChild(option);
  }
  select.addEventListener("change", function () { setAllPaneView(path, select.value); });
  header.appendChild(select);

  const canSplit = used.size < ALL_PANE_VIEWS.length;
  const splitRowBtn = document.createElement("button");
  splitRowBtn.type = "button";
  splitRowBtn.textContent = "⬌";
  splitRowBtn.title = "Splits naast elkaar";
  splitRowBtn.disabled = !canSplit;
  splitRowBtn.addEventListener("click", function () { splitAllPane(path, "row"); });
  header.appendChild(splitRowBtn);

  const splitColBtn = document.createElement("button");
  splitColBtn.type = "button";
  splitColBtn.textContent = "⬍";
  splitColBtn.title = "Splits onder elkaar";
  splitColBtn.disabled = !canSplit;
  splitColBtn.addEventListener("click", function () { splitAllPane(path, "col"); });
  header.appendChild(splitColBtn);

  if (path.length > 0) {
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "✕";
    closeBtn.title = "Venster sluiten";
    closeBtn.addEventListener("click", function () { closeAllPane(path); });
    header.appendChild(closeBtn);
  }

  pane.appendChild(header);

  const body = document.createElement("div");
  body.className = "allPaneBody";
  const contentEl = allPaneContentElement(node.view);
  if (contentEl) body.appendChild(contentEl);
  pane.appendChild(body);

  return pane;
}

function setAllPaneView(path, view) {
  if (!ALL_PANE_VIEWS.includes(view)) return;
  const node = getAllLayoutNodeAt(path);
  if (!node || node.view === view) return;
  const used = collectUsedAllViews(state.allLayoutTree);
  if (used.has(view)) return;
  node.view = view;
  persistAllLayoutTree();
  renderAllLayout();
}

function splitAllPane(path, dir) {
  const used = collectUsedAllViews(state.allLayoutTree);
  const freeView = ALL_PANE_VIEWS.find(function (view) { return !used.has(view); });
  if (!freeView) return;
  const target = getAllLayoutNodeAt(path);
  if (!target || !target.view) return;
  setAllLayoutNodeAt(path, {
    dir: dir,
    children: [
      { size: 1, node: { view: target.view } },
      { size: 1, node: { view: freeView } }
    ]
  });
  persistAllLayoutTree();
  renderAllLayout();
}

function closeAllPane(path) {
  if (path.length === 0) return;
  const { parent, indexInParent } = getAllLayoutParentAndNode(path);
  if (!parent) return;
  parent.children.splice(indexInParent, 1);
  if (parent.children.length === 1) {
    setAllLayoutNodeAt(path.slice(0, -1), parent.children[0].node);
  }
  persistAllLayoutTree();
  renderAllLayout();
}

function beginAllSplitResize(event, resizerEl, splitNode, indexA, indexB) {
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const dir = splitNode.dir;
  const childElA = resizerEl.previousElementSibling;
  const childElB = resizerEl.nextElementSibling;
  if (!childElA || !childElB) return;
  const rectA = childElA.getBoundingClientRect();
  const rectB = childElB.getBoundingClientRect();
  const startSizeA = dir === "row" ? rectA.width : rectA.height;
  const startSizeB = dir === "row" ? rectB.width : rectB.height;
  const totalPx = Math.max(1, startSizeA + startSizeB);
  const growA = splitNode.children[indexA].size;
  const growB = splitNode.children[indexB].size;
  const growPerPx = (growA + growB) / totalPx;
  const startX = event.clientX;
  const startY = event.clientY;
  const minPx = 20;
  resizerEl.classList.add("active");
  try { resizerEl.setPointerCapture?.(event.pointerId); } catch {}
  function onMove(moveEvent) {
    if (moveEvent.pointerId !== event.pointerId) return;
    moveEvent.preventDefault();
    const delta = dir === "row" ? (moveEvent.clientX - startX) : (moveEvent.clientY - startY);
    const deltaPx = clampNumber(delta, minPx - startSizeA, startSizeB - minPx);
    const deltaGrow = deltaPx * growPerPx;
    splitNode.children[indexA].size = Math.max(0.02, growA + deltaGrow);
    splitNode.children[indexB].size = Math.max(0.02, growB - deltaGrow);
    childElA.style.flex = String(splitNode.children[indexA].size) + " 1 0px";
    childElB.style.flex = String(splitNode.children[indexB].size) + " 1 0px";
    resizeRuntimeAfterLayout();
  }
  function onUp(upEvent) {
    if (upEvent.pointerId !== undefined && upEvent.pointerId !== event.pointerId) return;
    resizerEl.classList.remove("active");
    try { resizerEl.releasePointerCapture?.(event.pointerId); } catch {}
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onUp, true);
    persistAllLayoutTree();
  }
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);
}

function restoreFlatEditorLayoutOrder() {
  if (!el.layout) return;
  const toolsEl = document.querySelector(".tools");
  const graphEl = document.querySelector(".graphColumn");
  const viewportEl = document.querySelector(".viewportColumn");
  const assetsEl = document.querySelector(".assetColumn");
  const resizerTools = el.layout.querySelector('[data-resizer="tools"]');
  const resizerGraph = el.layout.querySelector('[data-resizer="graph"]');
  const resizerViewport = el.layout.querySelector('[data-resizer="viewport"]');
  if (toolsEl && resizerTools) el.layout.insertBefore(toolsEl, resizerTools);
  if (graphEl && resizerGraph) el.layout.insertBefore(graphEl, resizerGraph);
  if (viewportEl && resizerViewport) el.layout.insertBefore(viewportEl, resizerViewport);
  if (assetsEl) el.layout.appendChild(assetsEl);
}

function updateAllLayoutMode() {
  const shouldBeActive = state.mobilePanel === "all" && isMobileLayout();
  if (shouldBeActive && !allLayoutActive) {
    allLayoutActive = true;
    renderAllLayout();
  } else if (!shouldBeActive && allLayoutActive) {
    allLayoutActive = false;
    restoreFlatEditorLayoutOrder();
  }
}

function initAllLayoutControls() {
  if (!state.allLayoutTree) state.allLayoutTree = loadStoredAllLayoutTree();
}

function updateEditorFullscreenButton() {
  const active = document.fullscreenElement === document.documentElement || document.fullscreenElement === document.body;
  document.body.classList.toggle("editorFullscreen", active);
  if (!el.fullscreenButton) return;
  el.fullscreenButton.textContent = isMobileLayout()
    ? (active ? "EXIT" : "FULL")
    : (active ? "FULLSCREEN OFF" : "FULLSCREEN");
  el.fullscreenButton.setAttribute("aria-pressed", active ? "true" : "false");
}

async function toggleEditorFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen?.();
    } else {
      await (document.documentElement.requestFullscreen?.() || document.body.requestFullscreen?.());
    }
  } catch (error) {
    setStatus(error?.message || "Fullscreen niet beschikbaar.", "error");
  }
  updateEditorFullscreenButton();
}

function zoomViewportBy(direction) {
  if (!el.viewportCanvas) return;
  const rect = el.viewportCanvas.getBoundingClientRect();
  const wheel = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    deltaY: direction > 0 ? -220 : 220
  });
  el.viewportCanvas.dispatchEvent(wheel);
}

function focusViewportSelection() {
  if (!runtime) return;
  const focused = typeof runtime.focusSelected === "function" ? runtime.focusSelected() : false;
  if (!focused && typeof runtime.frameAll === "function") runtime.frameAll();
}

function initMobileControls() {
  applyStoredEditorLayoutSizes();
  initAllLayoutControls();
  setMobilePanel(state.mobilePanel, false);
  updateTopbarLabels();
  if (el.mobilePanelTabs) {
    for (const button of el.mobilePanelTabs.querySelectorAll("[data-mobile-panel]")) {
      button.addEventListener("click", function () {
        setMobilePanel(button.dataset.mobilePanel || "all");
      });
    }
  }
  initEditorLayoutResizers();
  if (el.fullscreenButton) el.fullscreenButton.addEventListener("click", toggleEditorFullscreen);
  document.addEventListener("fullscreenchange", updateEditorFullscreenButton);
  MOBILE_LAYOUT_QUERY?.addEventListener?.("change", updateTopbarLabels);
  MOBILE_LAYOUT_QUERY?.addEventListener?.("change", updateAllLayoutMode);
  MOBILE_LAYOUT_QUERY?.addEventListener?.("change", scheduleViewportFloatingPanelLayoutRefresh);
  window.addEventListener("resize", scheduleViewportFloatingPanelLayoutRefresh);
  window.visualViewport?.addEventListener?.("resize", scheduleViewportFloatingPanelLayoutRefresh);
  updateEditorFullscreenButton();
  if (el.viewportZoomOutButton) el.viewportZoomOutButton.addEventListener("click", function () { zoomViewportBy(-1); });
  if (el.viewportZoomInButton) el.viewportZoomInButton.addEventListener("click", function () { zoomViewportBy(1); });
  if (el.viewportFocusButton) el.viewportFocusButton.addEventListener("click", focusViewportSelection);
}

// Marquee box for the 3D viewport (object picking + point-edit mode). Unlike the graph
// canvas, the viewport isn't panned/scaled in CSS space, so plain client coordinates
// (minus the wrap's own offset) are enough - no clientToViewportPoint conversion needed.
function showViewportSelectionBox(startX, startY, endX, endY) {
  if (!el.viewportSelectionBox || !el.viewportWrap) return;
  const wrapRect = el.viewportWrap.getBoundingClientRect();
  const left = Math.min(startX, endX) - wrapRect.left;
  const top = Math.min(startY, endY) - wrapRect.top;
  const width = Math.max(0, Math.abs(endX - startX));
  const height = Math.max(0, Math.abs(endY - startY));
  el.viewportSelectionBox.hidden = false;
  el.viewportSelectionBox.style.left = left + "px";
  el.viewportSelectionBox.style.top = top + "px";
  el.viewportSelectionBox.style.width = width + "px";
  el.viewportSelectionBox.style.height = height + "px";
}

function hideViewportSelectionBox() {
  if (!el.viewportSelectionBox) return;
  el.viewportSelectionBox.hidden = true;
  el.viewportSelectionBox.style.width = "0px";
  el.viewportSelectionBox.style.height = "0px";
}

function rectFromClientPoints(x1, y1, x2, y2) {
  return {
    left: Math.min(x1, x2),
    right: Math.max(x1, x2),
    top: Math.min(y1, y2),
    bottom: Math.max(y1, y2)
  };
}

// A representative world point for whatever kind of node this is, so it can be marquee-
// selected in the 3D viewport even when it has no single live mesh to raycast against
// (Location Anchor has none at all; Walkable Surface/Surface Layer are chunked into many
// mesh pieces, not one pickable root). Mirrors terrainAllNodeMarkers()'s per-type geometry
// lookups (editor.js ~2553) - same node types, same "one point per node" idea.
function viewportSelectablePoint(node) {
  if (!node || !node.values) return null;
  if (node.type === "model_entity") {
    const x = Number(node.values.x);
    const y = Number(node.values.y);
    const z = Number(node.values.z);
    return Number.isFinite(x) && Number.isFinite(z) ? { x: x, y: Number.isFinite(y) ? y : terrainGroundY(), z: z } : null;
  }
  if (TERRAIN_TOOL_NODE_TYPES.has(node.type)) {
    const points = terrainNodePoints(node);
    const geometry = terrainWalkableSurfaceGeometry(node, points);
    if (!Number.isFinite(geometry.x) || !Number.isFinite(geometry.z)) return null;
    return { x: geometry.x, y: node.type === "walkable_surface" ? geometry.y : terrainGroundY(), z: geometry.z };
  }
  if (node.type === "bounded_area_scatter") {
    const center = scatterPointCenter(scatterNodePoints(node));
    return Number.isFinite(center.x) && Number.isFinite(center.z) ? { x: center.x, y: terrainGroundY(), z: center.z } : null;
  }
  return nodeCoordinatePoint(node);
}

function viewportMarqueeNodeIds(rect) {
  if (!runtime || typeof runtime.worldToScreen !== "function") return [];
  const ids = [];
  for (const node of state.graph.nodes || []) {
    const point = viewportSelectablePoint(node);
    if (!point) continue;
    const screen = runtime.worldToScreen(point);
    if (screen && rectContainsPoint(rect, screen)) ids.push(node.id);
  }
  return ids;
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

el.graphViewport.addEventListener("pointerdown", handleGraphTouchPointerDown, true);

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
      const panSpeed = graphPanSpeedMultiplier();
      state.view.panX = originPanX + (moveEvent.clientX - startX) * panSpeed;
      state.view.panY = originPanY + (moveEvent.clientY - startY) * panSpeed;
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
  zoomGraphAt(event.clientX, event.clientY, event.deltaY < 0 ? GRAPH_ZOOM_FACTOR : 1 / GRAPH_ZOOM_FACTOR);
}, { passive: false });

if (el.graphZoomOutButton) el.graphZoomOutButton.addEventListener("click", function () { zoomGraphBy(1 / GRAPH_ZOOM_FACTOR); });
if (el.graphZoomInButton) el.graphZoomInButton.addEventListener("click", function () { zoomGraphBy(GRAPH_ZOOM_FACTOR); });

el.zoomResetButton.addEventListener("click", function () {
  fitGraphViewToNodes();
});

if (el.viewportInfoButton) el.viewportInfoButton.addEventListener("click", toggleViewportHelp);
if (el.snapModeSelect) el.snapModeSelect.addEventListener("change", function () {
  setViewportSnap(el.snapModeSelect.value, el.snapGridInput ? el.snapGridInput.value : state.snapGridSize);
});
if (el.snapGridInput) el.snapGridInput.addEventListener("change", function () {
  setViewportSnap(el.snapModeSelect ? el.snapModeSelect.value : state.snapMode, el.snapGridInput.value);
});

if (el.inspectorForm) {
  el.inspectorForm.addEventListener("input", function (event) {
    if (isEditableTarget(event.target)) markUnsavedPending();
  }, true);
  el.inspectorForm.addEventListener("change", function (event) {
    if (isEditableTarget(event.target)) markUnsavedPending();
  }, true);
  el.inspectorForm.addEventListener("submit", function (event) {
    event.preventDefault();
    commitActiveEditorControl();
  });
}

function activeEditorControl() {
  const active = document.activeElement;
  if (!active || typeof active.tagName !== "string") return null;
  if (!isEditableTarget(active)) return null;
  if (el.inspectorForm && el.inspectorForm.contains(active)) return active;
  if (el.viewportTransformPanel && el.viewportTransformPanel.contains(active)) return active;
  if (el.viewportHelpPanel && el.viewportHelpPanel.contains(active)) return active;
  if (el.assetColumn && el.assetColumn.contains(active)) return active;
  return null;
}

function commitActiveEditorControl() {
  const active = activeEditorControl();
  if (active && typeof active.blur === "function") active.blur();
}

async function flushPendingEditorWrites() {
  if (runtimeTransformActive()) confirmRuntimeTransform();
  commitActiveEditorControl();
  if (scatterHasActiveSession()) {
    const scatterNode = nodeById(state.scatterTool.dragNodeId) || selectedScatterNode();
    await commitActiveScatterSession(scatterNode);
  }
  if (terrainHasActiveSession()) {
    const terrainNode = nodeById(state.terrainTool.dragNodeId) || selectedTerrainNode();
    await commitActiveTerrainSession(terrainNode);
  }
  if (runtime && typeof runtime.flushEditorCameraSave === "function") runtime.flushEditorCameraSave();
  await graphMutationQueue;
}

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
  syncAsideContext();
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
      detail.textContent = (fromNode ? nodeDisplayTitle(fromNode) : edge.fromNodeId) + "." + edge.fromPort + " → " + (toNode ? nodeDisplayTitle(toNode) : edge.toNodeId) + "." + edge.toPort;
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
  heading.className = "libGroupTitle inspectorTitleWithHelp";
  const headingText = document.createElement("span");
  headingText.textContent = def.label + " - " + nodeDisplayTitle(node);
  const headingInfo = createHelpIcon(buildNodeHelpText(node, def), { className: "helpInfoIcon helpInfoIcon--heading", side: "right" });
  heading.appendChild(headingText);
  if (headingInfo) heading.appendChild(headingInfo);
  el.inspectorForm.appendChild(heading);
  if (node.type === "group") {
    const hint = document.createElement("div");
    hint.className = "inspectorHint";
    hint.textContent = "Stel hier de Group Interface in. De typed ports bepalen wat de Group Node buiten de group aanbiedt en wat Group Input/Output binnen de group tonen.";
    el.inspectorForm.appendChild(hint);
  }
  if (node.type === "group_input" || node.type === "group_output") {
    const parent = node.parentId ? nodeById(node.parentId) : null;
    const isInput = node.type === "group_input";
    const hint = document.createElement("div");
    hint.className = "inspectorHint";
    hint.textContent = parent && parent.type === "group"
      ? (isInput
        ? "Pas hier de input-ports van de parent group aan."
        : "Pas hier de output-ports van de parent group aan.")
      : "Deze group-interface node mist zijn parent group.";
    el.inspectorForm.appendChild(hint);
    if (parent && parent.type === "group") {
      el.inspectorForm.appendChild(buildGroupInterfaceEditor(parent, "groupInterface", parent.values.groupInterface, {
        targetNodeId: parent.id,
        direction: isInput ? "input" : "output"
      }));
    }
    renderViewportControls();
    return;
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

  if (node.type === "minimap_bake") {
    el.inspectorForm.appendChild(buildMinimapBakeInspectorBlock(node));
  }

  let currentSection = null;
  for (const [key, field] of Object.entries(def.fields)) {
    const section = String(field.section || "").trim();
    if (section !== currentSection) {
      currentSection = section;
      if (currentSection) {
        const sectionTitle = document.createElement("div");
        sectionTitle.className = "inspectorSectionTitle";
        sectionTitle.textContent = currentSection;
        el.inspectorForm.appendChild(sectionTitle);
      }
    }
    const fieldEl = buildField(node, key, field);
    if (fieldEl) el.inspectorForm.appendChild(fieldEl);
  }

  if (isZoneCanvasGroup(node)) {
    el.inspectorForm.appendChild(buildZoneCanvasInspectorBlock(node));
  }

  const actions = document.createElement("div");
  actions.className = "inspectorActions";
  if (node.type !== "game_output" && !def.system) {
    const dup = document.createElement("button");
    dup.type = "button";
    dup.className = "mini";
    dup.textContent = "Dupliceer";
    dup.addEventListener("click", function () {
      if (isZoneCanvasGroup(node)) expandZoneCanvas(node.id, "right");
      else duplicateNode(node.id);
    });
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

function syncAsideContext(route = sanitizeAuthoringRouteState()) {
  const showInspector = hasInspectorSelection();
  if (isMobileLayout() && !showInspector && state.mobilePanel === "inspector") setMobilePanel("graph", false);
  // Meer nodes blijft altijd zichtbaar als reparatie-/snelweg naast de Inspector.
  if (el.nodeLibrarySection) el.nodeLibrarySection.hidden = false;
  if (el.inspectorSection) el.inspectorSection.hidden = !showInspector;
  if (el.validationSection) el.validationSection.hidden = false;
}

const ZONE_CANVAS_MANAGED_NODE_TYPES = [
  "zone_definition",
  "zone_environment_settings",
  "zone_gameplay_rules",
  "ground_surface",
  "spawn_point",
  "zone_output",
  "area_definition",
  "area_output",
  "surface_layer",
  "terrain_layer",
  "blocker_area",
  "walkable_surface",
  "location_anchor",
  "minimap_bake",
  "model_entity",
  "bounded_area_scatter",
  "zone_link",
  "map_marker_definition"
];

function zoneCanvasManagedChildren(group) {
  return (state.graph.nodes || []).filter(function (node) {
    return node.parentId === group.id && node.type !== "group_input" && node.type !== "group_output";
  }).sort(function (left, right) {
    return (Number(left.y) - Number(right.y)) || (Number(left.x) - Number(right.x)) || String(left.title || "").localeCompare(String(right.title || ""));
  });
}

function buildZoneCanvasInspectorBlock(group) {
  const wrap = document.createElement("div");
  wrap.className = "zoneCanvasInspector";

  const title = document.createElement("div");
  title.className = "inspectorSectionTitle";
  title.textContent = "Zone Nodes";
  wrap.appendChild(title);

  const grid = zoneCanvasGridForGroup(group);
  const root = zoneCanvasRootGroupForGroup(group);
  const meta = document.createElement("div");
  meta.className = "inspectorHint";
  meta.textContent = (root?.id === group.id ? "Hoofd/startzone" : "Child-zone van " + nodeDisplayTitle(root)) + " - grid " + grid.x + "," + grid.z + " - 500x500";
  wrap.appendChild(meta);

  const ground = (state.graph.nodes || []).find(function (node) {
    return node.parentId === group.id && node.type === "ground_surface";
  }) || null;
  const faderField = document.createElement("div");
  faderField.className = "field";
  const faderLabel = document.createElement("label");
  faderLabel.textContent = "Zone edge fader";
  const faderRow = document.createElement("div");
  faderRow.className = "zoneCanvasFaderRow";
  const fader = document.createElement("input");
  fader.type = "range";
  fader.min = "0";
  fader.max = "120";
  fader.step = "1";
  fader.value = String(Math.max(0, Math.min(120, Number(ground?.values?.edgeFadeWidth) || 0)));
  fader.disabled = !ground;
  const faderNumber = document.createElement("input");
  faderNumber.type = "number";
  faderNumber.min = "0";
  faderNumber.max = "120";
  faderNumber.step = "1";
  faderNumber.value = fader.value;
  faderNumber.disabled = !ground;
  const applyFader = function (rawValue) {
    if (!ground) return;
    const value = Math.max(0, Math.min(120, Math.round(Number(rawValue) || 0)));
    fader.value = String(value);
    faderNumber.value = String(value);
    patchValues(ground.id, { edgeFadeWidth: value }, {
      historyLabel: "Zone edge fader",
      refreshViewport: true,
      refreshValidation: true
    });
  };
  fader.addEventListener("change", function () { applyFader(fader.value); });
  faderNumber.addEventListener("change", function () { applyFader(faderNumber.value); });
  faderRow.append(fader, faderNumber);
  const faderHint = document.createElement("div");
  faderHint.className = "inspectorHint";
  faderHint.textContent = ground ? "Fade in world units rond de buitenrand van deze zone." : "Voeg eerst een Ground Surface toe.";
  faderField.append(faderLabel, faderRow, faderHint);
  wrap.appendChild(faderField);

  const actions = document.createElement("div");
  actions.className = "zoneCanvasInspectorActions";
  const fill = document.createElement("button");
  fill.type = "button";
  fill.className = "mini";
  fill.textContent = "Basis aanvullen";
  fill.title = "Maakt ontbrekende Zone Definition, settings, ground, spawn en Zone Output aan.";
  fill.addEventListener("click", function () { repairZoneCanvasBasis(group.id); });
  const wire = document.createElement("button");
  wire.type = "button";
  wire.className = "mini";
  wire.textContent = "Koppel basis";
  wire.title = "Verbindt bestaande zonebasisnodes met de juiste Zone Output route.";
  wire.addEventListener("click", function () { wireZoneCanvas(group.id); });
  const open = document.createElement("button");
  open.type = "button";
  open.className = "mini";
  open.textContent = "Open zone";
  open.addEventListener("click", function () { enterGroup(group); });
  actions.append(fill, wire, open);
  wrap.appendChild(actions);

  const addRow = document.createElement("div");
  addRow.className = "zoneCanvasAddRow";
  const select = document.createElement("select");
  for (const type of ZONE_CANVAS_MANAGED_NODE_TYPES) {
    if (!state.nodeTypes[type] || state.nodeTypes[type].hidden || state.nodeTypes[type].system) continue;
    const option = document.createElement("option");
    option.value = type;
    option.textContent = state.nodeTypes[type].label || type;
    select.appendChild(option);
  }
  const add = document.createElement("button");
  add.type = "button";
  add.className = "mini";
  add.textContent = "Toevoegen";
  add.addEventListener("click", async function () {
    const type = select.value;
    if (!type) return;
    state.currentGroupId = group.id;
    syncBreadcrumb();
    renderGraph();
    await addNode(type);
  });
  addRow.append(select, add);
  wrap.appendChild(addRow);

  const list = document.createElement("div");
  list.className = "zoneCanvasNodeList";
  const children = zoneCanvasManagedChildren(group);
  if (!children.length) {
    const empty = document.createElement("div");
    empty.className = "inspectorHint";
    empty.textContent = "Nog geen zone-nodes. Gebruik Basis aanvullen.";
    list.appendChild(empty);
  }
  for (const child of children) {
    const row = document.createElement("div");
    row.className = "zoneCanvasNodeRow";
    const meta = document.createElement("button");
    meta.type = "button";
    meta.className = "zoneCanvasNodePick";
    meta.textContent = (state.nodeTypes[child.type]?.label || child.type) + " - " + nodeDisplayTitle(child);
    meta.addEventListener("click", function () { selectNode(child.id, true, { clearPendingEdge: true }); });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "deleteNode";
    del.textContent = "x";
    del.title = "Verwijder deze zone-node";
    del.addEventListener("click", function () { deleteNode(child.id); });
    row.append(meta, del);
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

const FIELD_TYPE_LABELS = Object.freeze({
  asset: "asset picker",
  boolean: "checkbox aan/uit",
  color: "kleurwaarde",
  formula: "veilige formule JSON",
  identity: "stabiele canonical ID",
  json: "JSON data",
  keycode: "keyboard code",
  localizedText: "localization key met fallback",
  minimapMarkerCategories: "minimap marker categorieen",
  number: "nummer",
  reference: "zoekbare reference",
  referenceList: "lijst met typed references",
  select: "keuzelijst",
  tagList: "taglijst",
  tagQuery: "tag query",
  text: "tekst",
  tokenText: "tekst met @{...} tokens"
});

const FIELD_TYPE_HELP = Object.freeze({
  asset: "Kiest een asset uit de asset library. De node bewaart alleen het asset id; de runtime laadt het echte bestand via de gepublishte asset manifest.",
  boolean: "Checkbox. Aan betekent dat deze optie actief is in compiler of runtime. Uit betekent dat de node dit gedrag niet meeneemt.",
  color: "Kleur in hexvorm, bijvoorbeeld #ffffff. De editor gebruikt dit voor preview/UI; de runtime gebruikt dezelfde waarde wanneer de node gepubliceerd wordt.",
  formula: "Declaratieve formule als JSON. Dit blijft data en wordt veilig gevalideerd; er wordt geen JavaScript uitgevoerd.",
  identity: "Stabiele technische ID. Andere nodes verwijzen naar deze waarde, dus verander dit bewust zodra content al gebruikt of gepublished is.",
  json: "Vrije gestructureerde data. Gebruik geldige JSON zodat de compiler het exact kan lezen.",
  keycode: "KeyboardEvent.code waarde, bijvoorbeeld KeyW of Space. Dit is layout-stabieler dan losse letters.",
  localizedText: "Verwijst naar een localization entry en heeft een fallbacktekst. Handig wanneer dezelfde node meerdere talen moet ondersteunen.",
  minimapMarkerCategories: "Bepaalt welke markerbronnen op de minimap verschijnen, hoe ze heten, welke vorm/kleur ze gebruiken en of ze door fog of aan de rand zichtbaar blijven.",
  number: "Numerieke instelling. Min, max en step komen uit het node-schema en voorkomen waarden die de editor of runtime onstabiel maken.",
  reference: "Zoek en kies een andere bron in de picker. De editor bewaart intern de canonical ID en controleert of de gekozen soort past bij het schema.",
  referenceList: "Meerdere typed references. Een waarde per regel of komma-gescheiden. De compiler gebruikt de lijst om meerdere dependencies of unlocks te volgen.",
  select: "Keuzelijst. Alleen de opties uit het schema zijn geldig, zodat compiler en runtime dezelfde betekenis blijven gebruiken.",
  tagList: "Tags groeperen content semantisch. Ze zijn bedoeld voor filtering, ownership, queries en latere automation.",
  tagQuery: "Filter met all/any/none tags. Hiermee selecteer je content declaratief zonder code te schrijven.",
  text: "Gewone tekst voor labels, namen of kleine technische waarden.",
  tokenText: "Tekst die @{...} tokens mag bevatten. De preview probeert static tokens te tonen; runtime tokens worden later door de game-server opgelost."
});

const NODE_WORKFLOW_HELP = Object.freeze({
  game_output: "Eindpunt van de publish-flow. In de moderne route verbind je World Assembly.gameProject met Game Output.gameProject. Zodra die verbinding bestaat, worden oudere directe Game Output inputs genegeerd.",
  world_assembly: "Bouwt de definitieve game project manifest. Verbind hier Project Settings, Chunk Grid, Catalog Registry, Zone Registry, Campaign Registry, Player Rules en UI Output. Daarna gaat World Assembly.gameProject naar Game Output.",
  campaign_registry: "Verzamelt een of meer Campaign Output packages. Verbind Campaign Output.campaignPackage of de campaign group output naar Campaign Registry.campaignPackage, daarna Campaign Registry.campaignRegistry naar World Assembly.campaigns.",
  campaign_output: "Bundelt campaign, chapter, quest, dialogue, marker rules en rewards tot een publishbaar campaign package. Alles wat niet via deze inputs binnenkomt, komt niet in gameProject.campaigns.",
  campaign_definition: "Topniveau voor een verhaallijn. Koppel Chapter Definition nodes aan de chapters input en stuur Campaign Definition naar Campaign Output.campaigns.",
  chapter_definition: "Ordent quests binnen een campaign. Koppel Quest Definition nodes aan quests en verbind de chapter met Campaign Definition.chapters.",
  quest_definition: "Server-authoritative quest definition. Koppel steps, start dialogue, conditions, rewards en unlocks. De server bewaart per speler alleen voortgang; deze node beschrijft de regels.",
  quest_step: "Een stap binnen een quest. Koppel objectives, conditions, rewards en eventueel een marker rule. Sequence bepaalt de standaardvolgorde; nextStepRef kan expliciet doorverwijzen.",
  objective_talk: "Objective die klaar is wanneer de speler met het juiste target praat of de dialogue-flow gebruikt.",
  objective_collect: "Objective die kijkt of de speler genoeg van een item in NODE-03 inventory heeft.",
  objective_deliver: "Objective die itembezit controleert en bij turn-in door de server kan laten consumeren.",
  objective_reach: "Objective die de spelerpositie tegenover een quest target/zone controleert.",
  condition_player_level: "Condition die de actuele player level uit NODE-03 progression vergelijkt.",
  condition_has_item: "Condition die itemhoeveelheid uit NODE-03 inventory controleert.",
  condition_group: "Combineert conditions met all of any, zodat je AND/OR logica bouwt zonder code.",
  action_give_currency: "Reward/action die currency via NODE-03 wallet toekent in een servertransactie.",
  action_give_xp: "Reward/action die XP toekent en level opnieuw berekent via player progression rules.",
  action_unlock_ability: "Reward/action die een ability vrijspeelt en eventueel in een loadout-slot zet.",
  action_remove_item: "Action die items uit inventory consumeert. Gebruik dit voor delivery/turn-in kosten.",
  action_start_quest: "Action die een volgende quest activeert, beschikbaar maakt of alleen trackt.",
  action_sequence: "Voert meerdere actions in volgorde uit. Handig voor een rewardpakket met currency, XP en ability.",
  reward_bundle: "Named bundel voor meerdere reward entries. Koppel currency/XP/ability/actions aan rewards en verbind de bundel met een quest of step.",
  dialogue_definition: "Dialogue root voor een NPC/target. Koppel Dialogue Entry nodes aan entries en verwijs targetRef naar een quest target uit een zone.",
  dialogue_entry: "Een NPC-regel met optionele choices. Koppel Dialogue Choice nodes aan choices.",
  dialogue_choice: "Player keuze. Kies accept_quest, turn_in_quest, close of none en vul questRef wanneer de keuze een questactie uitvoert.",
  dialogue_terminal: "Eindpunt van een dialogue branch.",
  quest_tracker_hud: "HUD module die server-state uit NODE-04 toont: beschikbare/actieve/voltooide quest, objective progress, target action en optionele resetknop.",
  dialogue_hud: "HUD module die actieve dialogue vanuit NODE-04 toont.",
  notification_hud: "HUD module die recente queststatus-wijzigingen toont.",
  catalog_registry: "Verzamelt Catalog Output packages. Verbind daarna naar World Assembly.catalogs.",
  catalog_output: "Bundelt NODE-03 definitions zoals items, currencies, abilities, enemies, resources en loot tot het catalog package waar quests naar verwijzen.",
  zone_registry: "Verzamelt Zone Output packages. Verbind daarna naar World Assembly.zones.",
  zone_output: "Bundelt zone definition, spawns, links, quest targets, terrain, collision en runtime content voor een zone.",
  ui_output: "Bundelt HUD/UI modules. Verbind naar World Assembly.ui zodat de game de modules kan renderen.",
  player_rules_output: "Bundelt player rules zoals progression, death, inventory en ability policies. Verbind naar World Assembly.playerRules.",
  graph_frame: "Editor-only frame. Gebruik dit om nodes visueel bij elkaar te zetten en uitleg op te slaan. Het heeft geen poorten en verandert niets aan de game-runtime."
});

function cleanTooltipText(value) {
  return String(value === null || value === undefined ? "" : value).replace(/\s+/g, " ").trim();
}

function tooltipValue(value) {
  if (value === undefined) return "geen vaste schema-default";
  if (value === null) return "null";
  if (value === "") return "leeg";
  if (typeof value === "boolean") return value ? "aan / true" : "uit / false";
  if (Array.isArray(value) || (value && typeof value === "object")) {
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }
  return String(value);
}

function fieldTypeLabel(field) {
  return FIELD_TYPE_LABELS[field?.type] || cleanTooltipText(field?.type || "waarde");
}

function fieldHelpText(field) {
  return cleanTooltipText(field?.help || field?.description || "");
}

function defaultReasonText(field) {
  if (!field || field.default === undefined) {
    return "Dit veld heeft geen vaste schema-default. Leeg betekent meestal: de compiler of runtime gebruikt een contextuele fallback, of de waarde is alleen nodig wanneer je deze feature actief gebruikt.";
  }
  if (field.type === "boolean") {
    return field.default === true
      ? "De standaard is aan omdat nieuwe content dan direct zichtbaar of bruikbaar is zonder extra wiring. Zet hem uit wanneer je dit gedrag bewust wilt uitschakelen."
      : "De standaard is uit omdat dit meestal optioneel, debug, test of extra gedrag is. Zo blijft een nieuwe node rustig totdat jij die functie bewust activeert.";
  }
  if (field.type === "number") {
    return "De standaard is een veilige startwaarde uit het node-schema. Min, max en step begrenzen de waarde zodat publish en runtime voorspelbaar blijven.";
  }
  if (field.type === "select") {
    return "De standaard kiest de meest neutrale of meest gebruikte route uit de toegestane opties. Andere keuzes veranderen expliciet hoe compiler of runtime deze node interpreteert.";
  }
  if (field.type === "identity") {
    return "De standaard is een voorbeeld-ID. Maak hem uniek en stabiel voordat andere nodes ernaar verwijzen.";
  }
  if (field.type === "reference" || field.type === "referenceList") {
    return "De standaard is leeg omdat references pas kloppen zodra de bedoelde target, item, quest, zone of andere definition echt bestaat.";
  }
  return "De standaard komt uit het shared node-schema. Hij is bedoeld als geldige beginwaarde zodat een nieuwe node begrijpelijk start en pas verandert wanneer jij ontwerpkeuzes invult.";
}

function fieldConstraintLines(field) {
  const lines = [];
  if (!field) return lines;
  if (field.required) lines.push("Verplicht: ja. De validator verwacht een bruikbare waarde of een geldige default.");
  else lines.push("Verplicht: nee. Leeg laten betekent dat de compiler/runtime de feature overslaat of een fallback gebruikt.");
  if (field.min !== undefined || field.max !== undefined || field.step !== undefined) {
    lines.push("Bereik: min " + tooltipValue(field.min) + ", max " + tooltipValue(field.max) + ", stap " + tooltipValue(field.step) + ".");
  }
  if (Array.isArray(field.options) && field.options.length) {
    lines.push("Keuzes: " + field.options.map(function (option) {
      if (option && typeof option === "object") return cleanTooltipText(option.label || option.value || "");
      return cleanTooltipText(option);
    }).filter(Boolean).join(", ") + ".");
  }
  if (Array.isArray(field.referenceKinds) && field.referenceKinds.length) {
    lines.push("Verwachte reference kinds: " + field.referenceKinds.join(", ") + ".");
  }
  if (Array.isArray(field.assetTypes) && field.assetTypes.length) {
    lines.push("Toegestane asset types: " + field.assetTypes.join(", ") + ".");
  }
  if (field.dynamicOptions) {
    lines.push("Opties worden dynamisch gevuld uit: " + field.dynamicOptions + ".");
  }
  if (field.pattern) {
    lines.push("Pattern: " + field.pattern + ".");
  }
  return lines;
}

function nodePortsForHelp(node, def) {
  if (node) return resolvedPorts(node);
  return { inputs: def?.inputs || {}, outputs: def?.outputs || {} };
}

function visiblePortHelpEntries(ports) {
  return Object.entries(ports || {}).filter(function ([name, port]) {
    return name !== "__aliases" && port && !port.hidden && !port.internal;
  });
}

function portSummaryLine(portName, port) {
  return "- " + (port.label || portName) + " (" + (port.dataType || "unknown") + ", " + (port.required ? "verplicht" : "optioneel") + ", " + (port.multiple ? "meerdere" : "een") + ")";
}

function nodeWorkflowText(node, type, def) {
  if (type === "group") {
    const kind = String(node?.values?.groupKind || "generic").trim();
    if (kind === "campaign") return "Campaign Group: open de group, bouw Campaign Output binnenin, verbind Campaign Output.campaignPackage naar Group Output.campaignPackage en buiten de group naar Campaign Registry.";
    if (kind === "catalog") return "Catalog Group: plaats NODE-03 definitions binnenin, verbind ze naar Catalog Output, daarna Catalog Output.catalogPackage naar Group Output en buiten de group naar Catalog Registry.";
    if (kind === "zone" || kind === "zone_canvas") return "Zone Group: plaats Zone Definition, Spawn, terrain/collision/targets en Zone Output binnenin. Zone Output.zonePackage gaat naar Group Output en buiten de group naar Zone Registry.";
    if (kind === "ui") return "UI Group: plaats HUD modules binnenin, verbind ze naar UI Output en daarna naar World Assembly.ui.";
    if (kind === "player_rules") return "Player Rules Group: plaats policies binnenin, verbind ze naar Player Rules Output en daarna naar World Assembly.playerRules.";
    return "Generic Group: gebruik de Group Interface om typed inputs/outputs te maken. Binnenin verbinden Group Input en Group Output die interface met de interne nodes.";
  }
  return NODE_WORKFLOW_HELP[type] || "Gebruik deze node door verplichte inputs te verbinden, de settings in de inspector in te vullen en een relevante output naar de volgende node in de publish-keten te verbinden.";
}

function buildNodeDefinitionHelpText(type, def, node = null) {
  const ports = nodePortsForHelp(node, def);
  const inputEntries = visiblePortHelpEntries(ports.inputs);
  const outputEntries = visiblePortHelpEntries(ports.outputs);
  const fieldEntries = Object.entries(def?.fields || {}).filter(function ([, field]) { return !field.hidden; });
  const lines = [
    "Node: " + (def?.label || type),
    "Type: " + type,
    "Groep: " + (def?.group || "Other")
  ];
  if (node) lines.push("Titel in graph: " + nodeDisplayTitle(node));
  if (def?.description) lines.push("", "Wat doet deze node:", cleanTooltipText(def.description));
  lines.push("", "Waarvoor dient hij:", nodeWorkflowText(node, type, def));
  lines.push("", "Inputs:");
  if (inputEntries.length) inputEntries.forEach(function ([name, port]) { lines.push(portSummaryLine(name, port)); });
  else lines.push("- Geen inputs. Deze node start vanuit eigen settings of fungeert als output/eindpunt.");
  lines.push("", "Outputs:");
  if (outputEntries.length) outputEntries.forEach(function ([name, port]) { lines.push(portSummaryLine(name, port)); });
  else lines.push("- Geen outputs. Deze node is meestal een eindpunt of runtime-only configuratie.");
  if (fieldEntries.length) {
    lines.push("", "Settings op deze node:");
    fieldEntries.forEach(function ([key, field]) {
      lines.push("- " + (field.label || key) + " [" + key + "]: default " + tooltipValue(field.default) + ".");
    });
  }
  lines.push("", "Werkwijze:", "1. Vul eerst stabiele IDs en verplichte velden in.", "2. Verbind inputs met outputs van hetzelfde datatype.", "3. Verbind de output door naar de registry/output/assembly die bij deze node hoort.", "4. Publish pas nadat validation geen blokkerende errors meer toont.");
  return lines.filter(function (line) { return line !== null && line !== undefined; }).join("\n");
}

function buildNodeHelpText(node, def) {
  return buildNodeDefinitionHelpText(node?.type || "unknown", def || {}, node || null);
}

function buildPortHelpText(node, portName, port, direction) {
  const def = state.nodeTypes[node?.type] || {};
  const lines = [
    (direction === "input" ? "Input port: " : "Output port: ") + (port.label || portName),
    "Node: " + (def.label || node?.type || "unknown") + " (" + nodeDisplayTitle(node) + ")",
    "Technische portnaam: " + portName,
    "Datatype: " + (port.dataType || "unknown"),
    "Cardinality: " + (port.multiple ? "meerdere verbindingen toegestaan" : "een verbinding"),
    "Verplicht: " + (port.required ? "ja" : "nee")
  ];
  if (port.help) lines.push("", "Schema-uitleg:", cleanTooltipText(port.help));
  lines.push("", "Wat doet deze port:");
  if (direction === "input") {
    lines.push("Deze input ontvangt data uit een upstream node. De compiler volgt deze verbinding om definitions, packages, settings of runtimecontent in deze node te verzamelen.");
    lines.push("Verbind alleen een output met hetzelfde datatype. Als deze input verplicht is en leeg blijft, krijg je meestal een validation error of ontbreekt runtimecontent.");
  } else {
    lines.push("Deze output publiceert de data die deze node maakt. Downstream nodes gebruiken dit datatype om te weten wat ze mogen accepteren.");
    lines.push("Verbind deze output naar de volgende stap in de keten, bijvoorbeeld een Output, Registry, World Assembly of Game Output.");
  }
  lines.push("", "Node-context:", nodeWorkflowText(node, node?.type || "", def));
  return lines.join("\n");
}

function buildFieldHelpText(node, key, field, value) {
  const def = state.nodeTypes[node?.type] || {};
  const lines = [
    "Setting: " + (field.label || key),
    "Node: " + (def.label || node?.type || "unknown") + " (" + nodeDisplayTitle(node) + ")",
    "Technische key: " + key,
    "Type: " + fieldTypeLabel(field),
    "Huidige waarde: " + tooltipValue(value),
    "Standaard: " + tooltipValue(field.default),
    "Waarom deze standaard: " + defaultReasonText(field)
  ];
  const schemaHelp = fieldHelpText(field);
  if (schemaHelp) lines.push("", "Schema-uitleg:", schemaHelp);
  lines.push("", "Wat doet deze setting:", FIELD_TYPE_HELP[field?.type] || "Deze waarde wordt opgeslagen in de node en door validation, compiler of runtime gelezen wanneer de node gepubliceerd wordt.");
  lines.push.apply(lines, fieldConstraintLines(field));
  lines.push("", "Hoe gebruik je hem:", "Pas deze waarde aan wanneer dit gedrag voor deze node anders moet zijn dan de standaard. Laat hem op default staan als je nog aan het bouwen bent en eerst de nodeketen werkend wilt krijgen.");
  lines.push("", "Node-context:", nodeWorkflowText(node, node?.type || "", def));
  return lines.join("\n");
}

function buildSpecialGroupHelpText(preset) {
  const type = "group";
  const def = state.nodeTypes.group || {};
  const node = { type: "group", title: preset.title, values: { groupKind: preset.kind } };
  return buildNodeDefinitionHelpText(type, def, node);
}

function buildGroupInterfaceHelpText(node, directionFilter) {
  const direction = directionFilter === "input" ? "inputs" : directionFilter === "output" ? "outputs" : "inputs en outputs";
  return [
    "Group Interface",
    "Node: " + (nodeDisplayTitle(node) || "Group"),
    "Wat doet dit:",
    "Hier bepaal je welke typed ports de Group Node aan de buitenkant heeft en welke ports Group Input/Group Output binnenin tonen.",
    "Je bewerkt nu: " + direction + ".",
    "",
    "Waarom belangrijk:",
    "Een group is alleen bruikbaar in de publish-keten als de juiste output naar buiten komt. Voor een Campaign Group is dat meestal campaignPackage. Voor Zone is dat zonePackage. Voor Catalog is dat catalogPackage.",
    "",
    "Gebruik:",
    "1. Geef de port een duidelijke label.",
    "2. Kies het juiste datatype.",
    "3. Zet multiple aan wanneer meerdere verbindingen logisch zijn.",
    "4. Verbind binnenin Group Input of Group Output met de echte contentnodes."
  ].join("\n");
}

let helpTooltipElement = null;
let helpTooltipTarget = null;

function ensureHelpTooltipElement() {
  if (helpTooltipElement) return helpTooltipElement;
  helpTooltipElement = document.createElement("div");
  helpTooltipElement.className = "editorHelpTooltip";
  helpTooltipElement.hidden = true;
  helpTooltipElement.addEventListener("wheel", function (event) { event.stopPropagation(); }, { passive: true });
  helpTooltipElement.addEventListener("touchmove", function (event) { event.stopPropagation(); }, { passive: true });
  helpTooltipElement.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
  helpTooltipElement.addEventListener("click", function (event) { event.stopPropagation(); });
  document.body.appendChild(helpTooltipElement);
  return helpTooltipElement;
}

function positionHelpTooltip(target, event = null) {
  const tooltip = ensureHelpTooltipElement();
  const rect = target.getBoundingClientRect();
  const width = tooltip.offsetWidth || 420;
  const height = tooltip.offsetHeight || 140;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 768;
  const side = target.dataset.helpTooltipSide || "";
  let left;
  let top;
  if (side === "top") {
    left = rect.left + rect.width / 2 - width / 2;
    top = rect.top - height - 10;
    if (top < 8) top = rect.bottom + 10;
  } else {
    left = event && Number.isFinite(event.clientX) ? event.clientX + 14 : rect.right + 10;
    top = event && Number.isFinite(event.clientY) ? event.clientY + 14 : rect.top;
  }
  left = Math.max(8, Math.min(left, viewportWidth - width - 8));
  top = Math.max(8, Math.min(top, viewportHeight - height - 8));
  tooltip.style.left = left + "px";
  tooltip.style.top = top + "px";
}

function showHelpTooltip(target, event = null) {
  const text = cleanTooltipText(target?.dataset?.helpTooltip || "");
  if (!text) return;
  const previousTarget = helpTooltipTarget;
  helpTooltipTarget = target;
  const tooltip = ensureHelpTooltipElement();
  tooltip.textContent = target.dataset.helpTooltip;
  tooltip.hidden = false;
  tooltip.classList.add("visible");
  if (previousTarget !== target) tooltip.scrollTop = 0;
  positionHelpTooltip(target, event);
  requestAnimationFrame(function () {
    if (helpTooltipTarget === target && !tooltip.hidden) positionHelpTooltip(target, event);
  });
}

function hideHelpTooltip() {
  helpTooltipTarget = null;
  if (!helpTooltipElement) return;
  helpTooltipElement.classList.remove("visible");
  helpTooltipElement.hidden = true;
}

function eventTooltipTarget(event) {
  const target = event?.target;
  if (!target || typeof target.closest !== "function") return null;
  const tooltip = helpTooltipElement;
  if (tooltip && tooltip.contains(target)) return null;
  return target.closest("[data-help-trigger]");
}

function installHelpTooltipListeners() {
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      hideHelpTooltip();
      return;
    }
    const target = eventTooltipTarget(event);
    if (!target || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    event.stopPropagation();
    toggleHelpTooltip(target, null);
  }, true);
  window.addEventListener("blur", hideHelpTooltip, true);
  window.addEventListener("resize", hideHelpTooltip, true);
  window.addEventListener("pointerdown", function (event) {
    if (helpTooltipElement && event.target && helpTooltipElement.contains(event.target)) return;
    if (eventTooltipTarget(event)) return;
    hideHelpTooltip();
  }, true);
}

function toggleHelpTooltip(target, event = null) {
  if (helpTooltipTarget === target && helpTooltipElement && !helpTooltipElement.hidden) {
    hideHelpTooltip();
    return;
  }
  showHelpTooltip(target, event);
}

function applyHelpTooltip(elements, helpText, options = {}) {
  const help = String(helpText || "").trim();
  if (!help) return;
  for (const element of Array.isArray(elements) ? elements : [elements]) {
    if (!element) continue;
    element.dataset.helpTooltip = help;
    if (options.side) element.dataset.helpTooltipSide = options.side;
    element.setAttribute("aria-label", help.split("\n")[0]);
    element.removeAttribute("title");
  }
}

function applyFieldHelp(elements, helpText, options = {}) {
  applyHelpTooltip(elements, helpText, options);
}

function createHelpIcon(helpText, options = {}) {
  const help = String(helpText || "").trim();
  if (!help) return null;
  const icon = document.createElement("span");
  icon.className = options.className || "helpInfoIcon";
  icon.textContent = "ⓘ";
  icon.tabIndex = 0;
  icon.setAttribute("role", "button");
  applyHelpTooltip(icon, help, options);
  icon.dataset.helpTrigger = "1";
  icon.setAttribute("aria-label", options.ariaLabel || ("Toon uitleg: " + help.split("\n")[0]));
  icon.addEventListener("pointerdown", function (event) {
    event.stopPropagation();
  });
  icon.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    toggleHelpTooltip(icon, event);
  });
  icon.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    toggleHelpTooltip(icon, null);
  });
  return icon;
}

installHelpTooltipListeners();

const MINIMAP_MARKER_CATEGORY_SOURCE_OPTIONS = [
  { value: "character", label: "Character/User" },
  { value: "users", label: "Users" },
  { value: "enemy", label: "Enemy" },
  { value: "boss", label: "Boss" },
  { value: "wildlife", label: "Wild life" },
  { value: "npc", label: "NPC" },
  { value: "quest", label: "Quest" },
  { value: "spawn", label: "Spawn" },
  { value: "teleport", label: "Teleport" },
  { value: "settlement", label: "Dorp namen" },
  { value: "crafting", label: "Crafting" },
  { value: "cooking", label: "Cooking" },
  { value: "vendor", label: "Vendor" },
  { value: "market", label: "Market" },
  { value: "resource", label: "Resource" },
  { value: "item", label: "Items" },
  { value: "object", label: "Objects" },
  { value: "custom", label: "Custom" }
];
const MINIMAP_MARKER_SHAPE_OPTIONS = ["dot", "square", "diamond", "triangle", "cross", "star", "label"];
const MINIMAP_MARKER_ANIMATION_OPTIONS = ["none", "pulse", "blink", "glow"];

function normalizeMinimapCategoryId(value, fallback) {
  return normalizeCanonicalId(value, fallback || "custom").replace(/[.:]+/g, "_") || fallback || "custom";
}

function normalizeMinimapMarkerCategory(raw, index = 0) {
  const sourceValues = new Set(MINIMAP_MARKER_CATEGORY_SOURCE_OPTIONS.map(function (option) { return option.value; }));
  const source = sourceValues.has(String(raw?.source || "")) ? String(raw.source) : "custom";
  const id = normalizeMinimapCategoryId(raw?.id || raw?.categoryId || raw?.source || source, "category_" + (index + 1));
  const shape = MINIMAP_MARKER_SHAPE_OPTIONS.includes(String(raw?.shape || "")) ? String(raw.shape) : "dot";
  const animation = MINIMAP_MARKER_ANIMATION_OPTIONS.includes(String(raw?.animation || "")) ? String(raw.animation) : "none";
  const color = /^#[0-9a-fA-F]{6}$/.test(String(raw?.color || "")) ? String(raw.color) : "#ffffff";
  return {
    id,
    label: String(raw?.label || id).trim() || id,
    source,
    enabled: raw?.enabled !== false,
    color,
    shape,
    iconAssetId: String(raw?.iconAssetId || "").trim() || null,
    showLabel: raw?.showLabel === true,
    clampOutside: raw?.clampOutside === true,
    showThroughFog: raw?.showThroughFog === true,
    fixedSizeOnZoom: raw?.fixedSizeOnZoom === true,
    iconSizePx: Math.max(3, Math.min(64, Number(raw?.iconSizePx) || 9)),
    fontSizePx: Math.max(6, Math.min(32, Number(raw?.fontSizePx) || 10)),
    nameMaxLength: Math.max(3, Math.min(64, Number(raw?.nameMaxLength) || 14)),
    animation
  };
}

function normalizeMinimapMarkerCategories(value, fallback = []) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  const seen = new Set();
  const categories = (Array.isArray(source) ? source : []).map(normalizeMinimapMarkerCategory).filter(function (category) {
    if (!category.id || seen.has(category.id)) return false;
    seen.add(category.id);
    return true;
  });
  const hasCharacter = categories.some(function (category) {
    return category.id === "character" || category.source === "character";
  });
  const defaultCharacter = (Array.isArray(fallback) ? fallback : []).find(function (category) {
    return category?.id === "character" || category?.source === "character";
  });
  if (!hasCharacter && defaultCharacter) {
    const usersCategory = categories.find(function (category) {
      return category.id === "users" || category.source === "users";
    });
    const character = normalizeMinimapMarkerCategory(Object.assign({}, defaultCharacter, usersCategory || {}, {
      id: "character",
      label: defaultCharacter.label || "Character/User",
      source: "character",
      enabled: usersCategory ? usersCategory.enabled !== false : defaultCharacter.enabled !== false
    }));
    return [character].concat(categories);
  }
  return categories;
}

function minimapCategorySelectOptions() {
  const field = state.nodeTypes?.game_minimap_hud?.fields?.markerCategories || {};
  const defaults = normalizeMinimapMarkerCategories(field.default || []);
  const collected = [];
  for (const node of state.graph.nodes || []) {
    if (node?.type !== "game_minimap_hud") continue;
    collected.push.apply(collected, normalizeMinimapMarkerCategories(node.values?.markerCategories, defaults));
  }
  if (!collected.length) collected.push.apply(collected, defaults);
  const seen = new Set();
  return collected.filter(function (category) {
    if (!category.id || seen.has(category.id)) return false;
    seen.add(category.id);
    return true;
  }).map(function (category) {
    return { value: category.id, label: category.label || category.id };
  });
}

function uniqueMinimapCategoryId(categories, seed) {
  const base = normalizeMinimapCategoryId(seed || "custom", "custom");
  const used = new Set(categories.map(function (category) { return String(category.id || ""); }));
  if (!used.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = base + "_" + index;
    if (!used.has(candidate)) return candidate;
  }
  return base + "_" + Date.now().toString(36);
}

function buildImageAssetSelect(value, onChange) {
  const select = document.createElement("select");
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "(kleur/vorm)";
  select.appendChild(blank);
  for (const asset of state.assets.filter(function (a) { return ["image", "texture"].includes(a.assetType); })) {
    const opt = document.createElement("option");
    opt.value = asset.id;
    opt.textContent = asset.name + " (" + asset.assetType + ")";
    if (asset.id === value) opt.selected = true;
    select.appendChild(opt);
  }
  select.value = value || "";
  select.addEventListener("change", function () { onChange(select.value || null); });
  return select;
}

function buildMinimapMarkerCategoriesField(node, key, value, field) {
  const categories = normalizeMinimapMarkerCategories(value, field.default || []);
  const root = document.createElement("div");
  root.className = "minimapCategoryEditor";
  const commit = function (nextCategories) {
    patchInspectorField(node, key, field, normalizeMinimapMarkerCategories(nextCategories, field.default || []));
  };
  const updateAt = function (index, patch) {
    const next = categories.map(function (category, categoryIndex) {
      return categoryIndex === index ? Object.assign({}, category, patch) : category;
    });
    commit(next);
  };

  for (const [index, category] of categories.entries()) {
    const item = document.createElement("details");
    item.className = "minimapCategoryItem";
    item.open = false;
    const summary = document.createElement("summary");
    summary.className = "minimapCategorySummary";
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = category.enabled !== false;
    enabled.addEventListener("click", function (event) { event.stopPropagation(); });
    enabled.addEventListener("change", function () { updateAt(index, { enabled: enabled.checked }); });
    const swatch = document.createElement("span");
    swatch.className = "minimapCategorySwatch";
    swatch.style.background = category.color || "#ffffff";
    const title = document.createElement("span");
    title.className = "minimapCategoryTitle";
    title.textContent = (category.label || category.id) + " · " + category.source;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "mini danger";
    remove.textContent = "Delete";
    remove.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      commit(categories.filter(function (_, categoryIndex) { return categoryIndex !== index; }));
    });
    summary.append(enabled, swatch, title, remove);
    item.appendChild(summary);

    const grid = document.createElement("div");
    grid.className = "minimapCategoryGrid";
    const addInput = function (labelText, input) {
      const label = document.createElement("label");
      label.textContent = labelText;
      label.appendChild(input);
      grid.appendChild(label);
      return input;
    };
    const idInput = document.createElement("input");
    idInput.type = "text";
    idInput.value = category.id;
    idInput.addEventListener("change", function () {
      updateAt(index, { id: uniqueMinimapCategoryId(categories.filter(function (_, categoryIndex) { return categoryIndex !== index; }), idInput.value) });
    });
    addInput("Id", idInput);

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = category.label;
    labelInput.addEventListener("change", function () { updateAt(index, { label: labelInput.value.trim() || category.id }); });
    addInput("Naam", labelInput);

    const sourceSelect = document.createElement("select");
    for (const option of MINIMAP_MARKER_CATEGORY_SOURCE_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.label;
      if (option.value === category.source) opt.selected = true;
      sourceSelect.appendChild(opt);
    }
    sourceSelect.addEventListener("change", function () { updateAt(index, { source: sourceSelect.value }); });
    addInput("Bron", sourceSelect);

    const shapeSelect = document.createElement("select");
    for (const shape of MINIMAP_MARKER_SHAPE_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = shape;
      opt.textContent = shape;
      if (shape === category.shape) opt.selected = true;
      shapeSelect.appendChild(opt);
    }
    shapeSelect.addEventListener("change", function () { updateAt(index, { shape: shapeSelect.value }); });
    addInput("Vorm", shapeSelect);

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = /^#[0-9a-fA-F]{6}$/.test(category.color) ? category.color : "#ffffff";
    colorInput.addEventListener("change", function () { updateAt(index, { color: colorInput.value }); });
    addInput("Kleur", colorInput);

    addInput("Asset", buildImageAssetSelect(category.iconAssetId, function (assetId) { updateAt(index, { iconAssetId: assetId }); }));

    const sizeInput = document.createElement("input");
    sizeInput.type = "number";
    sizeInput.min = "3";
    sizeInput.max = "64";
    sizeInput.step = "1";
    sizeInput.value = String(category.iconSizePx);
    sizeInput.addEventListener("change", function () { updateAt(index, { iconSizePx: Number(sizeInput.value) }); });
    addInput("Icon map px", sizeInput);

    const fontInput = document.createElement("input");
    fontInput.type = "number";
    fontInput.min = "6";
    fontInput.max = "32";
    fontInput.step = "1";
    fontInput.value = String(category.fontSizePx);
    fontInput.addEventListener("change", function () { updateAt(index, { fontSizePx: Number(fontInput.value) }); });
    addInput("Tekst map px", fontInput);

    const maxNameInput = document.createElement("input");
    maxNameInput.type = "number";
    maxNameInput.min = "3";
    maxNameInput.max = "64";
    maxNameInput.step = "1";
    maxNameInput.value = String(category.nameMaxLength);
    maxNameInput.addEventListener("change", function () { updateAt(index, { nameMaxLength: Number(maxNameInput.value) }); });
    addInput("Naam lengte", maxNameInput);

    const animationSelect = document.createElement("select");
    for (const animation of MINIMAP_MARKER_ANIMATION_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = animation;
      opt.textContent = animation;
      if (animation === category.animation) opt.selected = true;
      animationSelect.appendChild(opt);
    }
    animationSelect.addEventListener("change", function () { updateAt(index, { animation: animationSelect.value }); });
    addInput("Animatie", animationSelect);

    const toggles = document.createElement("div");
    toggles.className = "minimapCategoryToggles";
    const addToggle = function (labelText, patchKey) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = category[patchKey] === true;
      input.addEventListener("change", function () { updateAt(index, { [patchKey]: input.checked }); });
      label.append(input, document.createTextNode(labelText));
      toggles.appendChild(label);
    };
    addToggle("Naam tonen", "showLabel");
    addToggle("Aan rand hangen", "clampOutside");
    addToggle("Zichtbaar op fog", "showThroughFog");
    addToggle("Vaste grootte bij zoom", "fixedSizeOnZoom");
    item.append(grid, toggles);
    root.appendChild(item);
  }

  const actions = document.createElement("div");
  actions.className = "minimapCategoryActions";
  const source = document.createElement("select");
  for (const option of MINIMAP_MARKER_CATEGORY_SOURCE_OPTIONS) {
    const opt = document.createElement("option");
    opt.value = option.value;
    opt.textContent = option.label;
    source.appendChild(opt);
  }
  const add = document.createElement("button");
  add.type = "button";
  add.className = "mini";
  add.textContent = "Categorie toevoegen";
  add.addEventListener("click", function () {
    const sourceValue = source.value || "custom";
    const option = MINIMAP_MARKER_CATEGORY_SOURCE_OPTIONS.find(function (entry) { return entry.value === sourceValue; });
    const id = uniqueMinimapCategoryId(categories, sourceValue);
    commit(categories.concat([normalizeMinimapMarkerCategory({
      id,
      label: option?.label || id,
      source: sourceValue,
      enabled: true,
      color: "#ffffff",
      shape: "dot",
      showLabel: true
    }, categories.length)]));
  });
  actions.append(source, add);
  root.appendChild(actions);
  return root;
}

function nodeFieldPatch(node, key, value) {
  if (node?.type === "mmo_network_settings") {
    return mmoNetworkFieldNodePatch(key, value, node.values || {});
  }
  return makePatch(key, value);
}

function patchInspectorField(node, key, field, value) {
  patchValues(node.id, nodeFieldPatch(node, key, value), {
    historyLabel: field.label,
    refreshViewport: shouldRefreshViewportForNode(node.id),
    refreshValidation: true
  });
}

const REFERENCE_PICKER_DEBOUNCE_MS = 180;
const REFERENCE_PICKER_MIN_QUERY_LENGTH = 2;
const referenceIdentityFieldCache = new Map();
let referenceNodeIndexCache = { graphRevision: null, nodeCount: null, map: null };
let referenceAliasIndexCache = { graphRevision: null, aliasCount: null, map: null };

function clearReferenceLookupCaches() {
  referenceIdentityFieldCache.clear();
  referenceNodeIndexCache = { graphRevision: null, nodeCount: null, map: null };
  referenceAliasIndexCache = { graphRevision: null, aliasCount: null, map: null };
}

function humanizeReferenceKind(kind) {
  return String(kind || "")
    .trim()
    .replace(/[_:-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, function (char) { return char.toUpperCase(); })
    .trim();
}

function referenceKindsForField(field) {
  return Array.from(new Set(
    Array.isArray(field?.referenceKinds)
      ? field.referenceKinds.map(function (kind) { return normalizeReferenceKind(kind); }).filter(Boolean)
      : []
  ));
}

function referenceIdentityFieldForNodeType(nodeType) {
  if (referenceIdentityFieldCache.has(nodeType)) return referenceIdentityFieldCache.get(nodeType) || "";
  const fields = state.nodeTypes?.[nodeType]?.fields || {};
  const identityEntry = Object.entries(fields).find(function ([, field]) {
    return field && field.type === "identity";
  });
  const key = identityEntry ? identityEntry[0] : "";
  referenceIdentityFieldCache.set(nodeType, key);
  return key;
}

function referenceNodeIndex() {
  const graphRevision = Number(state.graph?.graphRevision || 0);
  const nodeCount = Array.isArray(state.graph?.nodes) ? state.graph.nodes.length : 0;
  if (referenceNodeIndexCache.map && referenceNodeIndexCache.graphRevision === graphRevision && referenceNodeIndexCache.nodeCount === nodeCount) {
    return referenceNodeIndexCache.map;
  }
  const map = new Map();
  for (const node of Array.isArray(state.graph?.nodes) ? state.graph.nodes : []) {
    const identityField = referenceIdentityFieldForNodeType(node.type);
    if (!identityField) continue;
    const referenceId = normalizeCanonicalId(node?.values?.[identityField], "");
    if (!referenceId || map.has(referenceId)) continue;
    map.set(referenceId, node);
  }
  referenceNodeIndexCache = { graphRevision, nodeCount, map };
  return map;
}

function referenceAliasIndex() {
  const graphRevision = Number(state.graph?.graphRevision || 0);
  const aliasCount = Array.isArray(state.graph?.contentAliases) ? state.graph.contentAliases.length : 0;
  if (referenceAliasIndexCache.map && referenceAliasIndexCache.graphRevision === graphRevision && referenceAliasIndexCache.aliasCount === aliasCount) {
    return referenceAliasIndexCache.map;
  }
  const map = new Map();
  for (const aliasRow of Array.isArray(state.graph?.contentAliases) ? state.graph.contentAliases : []) {
    const oldId = normalizeCanonicalId(aliasRow?.old_id, "");
    const newId = normalizeCanonicalId(aliasRow?.new_id, "");
    if (!oldId || !newId || oldId === newId) continue;
    if (!map.has(oldId)) map.set(oldId, newId);
  }
  referenceAliasIndexCache = { graphRevision, aliasCount, map };
  return map;
}

function referenceNodeForReferenceId(referenceId) {
  const canonicalId = normalizeCanonicalId(referenceId, "");
  if (!canonicalId) return null;
  const nodes = referenceNodeIndex();
  const direct = nodes.get(canonicalId) || null;
  if (direct) return direct;
  const aliasTargetId = referenceAliasIndex().get(canonicalId) || "";
  return aliasTargetId ? (nodes.get(aliasTargetId) || null) : null;
}

function referenceNodeLabel(node) {
  if (!node || typeof node !== "object") return "";
  return String(
    node.values?.label
    || node.values?.displayName
    || node.values?.gameName
    || node.values?.title
    || node.title
    || node.id
    || ""
  ).trim();
}

function referenceSymbolDisplayLabel(symbol) {
  if (!symbol || typeof symbol !== "object") return "";
  return String(symbol.label || symbol.displayName || symbol.name || symbol.nodeLabel || symbol.id || "").trim();
}

function referenceSymbolTypeLabel(symbol) {
  if (!symbol || typeof symbol !== "object") return "";
  return state.nodeTypes?.[symbol.nodeType]?.label || humanizeReferenceKind(symbol.kind || symbol.nodeType || "");
}

function referencePickerChoiceState(value, field) {
  const expectedKinds = referenceKindsForField(field);
  const canonicalId = normalizeCanonicalId(value, "");
  if (!canonicalId) {
    return {
      state: field?.required ? "missing" : "empty",
      rawId: "",
      resolvedId: "",
      node: null,
      displayLabel: "",
      typeLabel: "",
      kind: "",
      alias: false,
      expectedKinds: expectedKinds
    };
  }
  const nodes = referenceNodeIndex();
  const directNode = nodes.get(canonicalId) || null;
  const aliasTargetId = directNode ? "" : (referenceAliasIndex().get(canonicalId) || "");
  const resolvedId = directNode ? canonicalId : aliasTargetId;
  const node = directNode || (resolvedId ? (nodes.get(resolvedId) || null) : null);
  const kind = referenceKindFromId(resolvedId || canonicalId);
  if (!node) {
    return {
      state: "missing",
      rawId: canonicalId,
      resolvedId: "",
      node: null,
      displayLabel: canonicalId,
      typeLabel: kind ? humanizeReferenceKind(kind) : "",
      kind: kind,
      alias: false,
      expectedKinds: expectedKinds
    };
  }
  const matches = !expectedKinds.length || referenceMatchesKinds(resolvedId || canonicalId, expectedKinds);
  return {
    state: matches ? "ok" : "mismatch",
    rawId: canonicalId,
    resolvedId: resolvedId || canonicalId,
    node: node,
    displayLabel: referenceNodeLabel(node) || canonicalId,
    typeLabel: referenceSymbolTypeLabel({ nodeType: node.type, kind: kind || referenceKindFromId(resolvedId || canonicalId) }),
    kind: kind,
    alias: Boolean(aliasTargetId && aliasTargetId !== canonicalId && resolvedId),
    expectedKinds: expectedKinds
  };
}

async function fetchReferencePickerSymbols(query, expectedKinds, options = {}) {
  const normalizedQuery = String(query === null || query === undefined ? "" : query).trim();
  const kinds = Array.isArray(expectedKinds) ? expectedKinds.map(normalizeReferenceKind).filter(Boolean) : [];
  const minLength = Math.max(1, Number(options.minLength) || REFERENCE_PICKER_MIN_QUERY_LENGTH);
  const limit = Math.max(4, Math.min(20, Math.floor(Number(options.limit) || 8)));
  if (!kinds.length || normalizedQuery.length < minLength) return [];
  const perKindLimit = kinds.length > 1 ? Math.max(4, Math.ceil(limit / kinds.length) + 2) : limit;
  const requests = kinds.map(function (kind) {
    const params = new URLSearchParams();
    params.set("q", normalizedQuery);
    params.set("limit", String(perKindLimit));
    if (kind) params.set("kind", kind);
    if (options.parentId) params.set("parentId", String(options.parentId));
    return api("/api/editor/symbols?" + params.toString(), options.signal ? { signal: options.signal } : undefined);
  });
  const settled = await Promise.allSettled(requests);
  const symbols = [];
  const seen = new Set();
  let firstError = null;
  for (const entry of settled) {
    if (entry.status === "rejected") {
      if (!firstError && entry.reason && entry.reason.name !== "AbortError") firstError = entry.reason;
      continue;
    }
    for (const symbol of Array.isArray(entry.value?.symbols) ? entry.value.symbols : []) {
      const id = normalizeCanonicalId(symbol?.id, "");
      if (!id || seen.has(id)) continue;
      if (!referenceMatchesKinds(id, kinds)) continue;
      seen.add(id);
      symbols.push(symbol);
    }
  }
  symbols.sort(referencePickerSort);
  if (!symbols.length && firstError) throw firstError;
  return symbols.slice(0, limit);
}

function buildReferencePickerField(node, key, field, value, options = {}) {
  const allowedKinds = referenceKindsForField(field);
  const current = referencePickerChoiceState(value, field);
  const commitReferenceValue = typeof options.onChange === "function"
    ? function (nextValue) {
      options.onChange(nextValue);
      if (options.rerender !== false) renderAuthoringHub();
    }
    : function (nextValue) {
      patchInspectorField(node, key, field, nextValue);
    };
  const focusReferenceNode = typeof options.onFocusNode === "function"
    ? options.onFocusNode
    : function (currentNode) {
      if (!currentNode) return;
      selectNode(currentNode.id, true, { clearPendingEdge: true });
    };
  const openCatalogAction = typeof options.openCatalogAction === "function" ? options.openCatalogAction : null;
  const openReferenceActionLabel = String(options.openReferenceActionLabel || "Open Catalog").trim() || "Open Catalog";
  const openReferenceActionTitle = String(options.openReferenceActionTitle || "Navigeer naar de juiste route om een geldige reference te kiezen.").trim();
  const root = document.createElement("div");
  root.className = "referencePicker";

  const currentBlock = document.createElement("div");
  currentBlock.className = "referencePickerCurrent";

  const currentChip = document.createElement("div");
  currentChip.className = "referencePickerChip" + (
    current.state === "missing" ? " referencePickerChip--missing" : (
      current.state === "mismatch" ? " referencePickerChip--mismatch" : ""
    )
  );

  const currentTitle = document.createElement("div");
  currentTitle.className = "referencePickerChipTitle";
  currentTitle.textContent = current.state === "empty"
    ? "Geen bron gekozen"
    : current.state === "missing"
      ? "Ontbrekende bron"
      : current.displayLabel || "Bron";
  currentChip.appendChild(currentTitle);

  const currentMeta = document.createElement("div");
  currentMeta.className = "referencePickerChipMeta";
  if (current.state === "empty") {
    currentMeta.textContent = field.required ? "Dit veld verwacht een bron." : "Kies een bron of laat het leeg.";
  } else if (current.state === "missing") {
    currentMeta.textContent = current.rawId
      ? ("Niet gevonden: " + current.rawId + (current.typeLabel ? " (" + current.typeLabel + ")" : ""))
      : "Kies een bron in de picker.";
  } else if (current.state === "mismatch") {
    currentMeta.textContent = current.typeLabel
      ? ("Huidig type: " + current.typeLabel + ". Verwacht: " + current.expectedKinds.map(humanizeReferenceKind).join(", ") + ".")
      : "Deze bron past niet bij de toegestane types.";
  } else {
    currentMeta.textContent = current.typeLabel || "Bron";
  }
  currentChip.appendChild(currentMeta);

  if (current.alias && current.resolvedId && current.resolvedId !== current.rawId) {
    const aliasNote = document.createElement("div");
    aliasNote.className = "referencePickerAdvanced";
    aliasNote.textContent = "Geresolveerd via alias: " + current.resolvedId;
    currentChip.appendChild(aliasNote);
  }

  if (current.rawId && !options.hideAdvanced) {
    const advanced = document.createElement("div");
    advanced.className = "referencePickerAdvanced";
    advanced.textContent = "Advanced: " + current.rawId;
    currentChip.appendChild(advanced);
  }

  currentBlock.appendChild(currentChip);

  const actions = document.createElement("div");
  actions.className = "referencePickerActions";

  const searchButton = document.createElement("button");
  searchButton.type = "button";
  searchButton.className = "mini";
  searchButton.textContent = "Andere waarde zoeken";
  searchButton.title = "Focus de zoekbox om een andere bron te kiezen.";
  actions.appendChild(searchButton);

  const sourceButton = document.createElement("button");
  sourceButton.type = "button";
  sourceButton.className = "mini";
  sourceButton.textContent = "Bron tonen";
  sourceButton.title = "Selecteer en focus de bijbehorende node.";
  sourceButton.disabled = !current.node;
  sourceButton.addEventListener("click", function () {
    if (!current.node) return;
    focusReferenceNode(current.node);
  });
  actions.appendChild(sourceButton);

  if (field.allowNull) {
    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "mini";
    clearButton.textContent = "Wissen";
    clearButton.title = "Verwijder de huidige reference.";
    clearButton.addEventListener("click", function () {
      commitReferenceValue(null);
    });
    actions.appendChild(clearButton);
  }

  if (openCatalogAction && current.state !== "ok") {
    const catalogButton = document.createElement("button");
    catalogButton.type = "button";
    catalogButton.className = "mini";
    catalogButton.textContent = openReferenceActionLabel;
    catalogButton.title = openReferenceActionTitle;
    catalogButton.addEventListener("click", function () {
      openCatalogAction();
    });
    actions.appendChild(catalogButton);
  }

  currentBlock.appendChild(actions);
  root.appendChild(currentBlock);

  const searchBlock = document.createElement("div");
  searchBlock.className = "referencePickerSearch";

  const kindHint = document.createElement("div");
  kindHint.className = "referencePickerHint";
  kindHint.textContent = allowedKinds.length
    ? ("Toegestane types: " + allowedKinds.map(humanizeReferenceKind).join(", "))
    : "Geen toegestane reference types in dit schema.";
  searchBlock.appendChild(kindHint);

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.autocomplete = "off";
  searchInput.autocapitalize = "none";
  searchInput.spellcheck = false;
  searchInput.placeholder = allowedKinds.length
    ? "Zoek bron op naam of type..."
    : "Geen zoekbare reference kinds";
  searchInput.disabled = !allowedKinds.length;
  searchInput.setAttribute("enterkeyhint", "search");
  searchInput.setAttribute("role", "combobox");
  searchInput.setAttribute("aria-autocomplete", "list");
  searchInput.setAttribute("aria-expanded", "false");
  searchBlock.appendChild(searchInput);

  const status = document.createElement("div");
  status.className = "referencePickerStatus";
  status.setAttribute("aria-live", "polite");
  searchBlock.appendChild(status);

  const results = document.createElement("div");
  results.className = "referencePickerResults";
  results.id = "reference-picker-results-" + String(node.id + "-" + key).replace(/[^a-z0-9_-]+/gi, "-");
  results.setAttribute("role", "listbox");
  searchBlock.appendChild(results);

  searchInput.setAttribute("aria-controls", results.id);
  root.appendChild(searchBlock);

  let activeIndex = -1;
  let currentResults = [];
  let requestToken = 0;
  let searchTimer = null;
  let controller = null;
  let loading = false;

  function renderResults() {
    results.textContent = "";
    const query = String(searchInput.value || "").trim();
    const showResults = allowedKinds.length && query.length >= REFERENCE_PICKER_MIN_QUERY_LENGTH && (loading || currentResults.length > 0);
    searchInput.setAttribute("aria-expanded", showResults ? "true" : "false");
    searchInput.setAttribute("aria-activedescendant", activeIndex >= 0 && currentResults[activeIndex] ? (results.id + "-option-" + activeIndex) : "");
    if (!allowedKinds.length) {
      status.textContent = "Deze reference heeft geen toegestane kinds.";
      return;
    }
    if (query.length < REFERENCE_PICKER_MIN_QUERY_LENGTH) {
      status.textContent = "Typ minstens " + REFERENCE_PICKER_MIN_QUERY_LENGTH + " tekens om te zoeken.";
      return;
    }
    if (!showResults || !currentResults.length) {
      status.textContent = loading ? "Zoeken..." : "Geen resultaten.";
      const empty = document.createElement("div");
      empty.className = "referencePickerEmpty";
      empty.textContent = loading ? "Zoeken..." : "Geen resultaten.";
      results.appendChild(empty);
      return;
    }
    status.textContent = "";
    currentResults.forEach(function (symbol, index) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "referencePickerResult" + (index === activeIndex ? " referencePickerResult--active" : "");
      item.id = results.id + "-option-" + index;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", index === activeIndex ? "true" : "false");
      item.tabIndex = -1;

      const title = document.createElement("div");
      title.className = "referencePickerResultTitle";
      title.textContent = referenceSymbolDisplayLabel(symbol) || symbol.id || "Onbekende bron";
      item.appendChild(title);

      const meta = document.createElement("div");
      meta.className = "referencePickerResultMeta";
      meta.textContent = referenceSymbolTypeLabel(symbol) || symbol.kind || "";
      item.appendChild(meta);

      if (!options.hideAdvanced) {
        const advanced = document.createElement("div");
        advanced.className = "referencePickerAdvanced";
        advanced.textContent = "Advanced: " + (symbol.id || "");
        item.appendChild(advanced);
      }

      item.addEventListener("mouseenter", function () {
        activeIndex = index;
        renderResults();
      });
      item.addEventListener("click", function () {
        commitReferenceValue(normalizeCanonicalId(symbol.id, ""));
      });
      results.appendChild(item);
    });
    const active = results.querySelector(".referencePickerResult--active");
    if (active && typeof active.scrollIntoView === "function") {
      active.scrollIntoView({ block: "nearest" });
    }
  }

  async function runSearch() {
    if (!allowedKinds.length) {
      currentResults = [];
      activeIndex = -1;
      loading = false;
      renderResults();
      return;
    }
    const query = String(searchInput.value || "").trim();
    if (query.length < REFERENCE_PICKER_MIN_QUERY_LENGTH) {
      currentResults = [];
      activeIndex = -1;
      loading = false;
      if (controller) controller.abort();
      controller = null;
      renderResults();
      return;
    }
    const token = ++requestToken;
    if (controller) controller.abort();
    const requestController = new AbortController();
    controller = requestController;
    loading = true;
    currentResults = [];
    activeIndex = -1;
    renderResults();
    try {
      const symbols = await fetchReferencePickerSymbols(query, allowedKinds, {
        limit: 8,
        signal: requestController.signal
      });
      if (token !== requestToken || requestController.signal.aborted || !root.isConnected) return;
      currentResults = Array.isArray(symbols) ? symbols : [];
      activeIndex = currentResults.length ? 0 : -1;
      loading = false;
      controller = null;
      renderResults();
    } catch (error) {
      if (requestController.signal.aborted || token !== requestToken) return;
      currentResults = [];
      activeIndex = -1;
      loading = false;
      controller = null;
      status.textContent = error && error.message ? error.message : "Zoeken mislukt.";
      results.textContent = "";
      const errorNode = document.createElement("div");
      errorNode.className = "referencePickerEmpty err";
      errorNode.textContent = status.textContent;
      results.appendChild(errorNode);
    }
  }

  function scheduleSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      searchTimer = null;
      void runSearch();
    }, REFERENCE_PICKER_DEBOUNCE_MS);
  }

  function moveActive(delta) {
    if (!currentResults.length) return;
    if (activeIndex < 0) activeIndex = 0;
    else activeIndex = (activeIndex + delta + currentResults.length) % currentResults.length;
    renderResults();
  }

  function selectActiveResult() {
    const symbol = currentResults[activeIndex] || currentResults[0] || null;
    if (!symbol) return;
    commitReferenceValue(normalizeCanonicalId(symbol.id, ""));
  }

  searchButton.addEventListener("click", function () {
    searchInput.focus();
    if (typeof searchInput.select === "function") searchInput.select();
    if (searchInput.value.trim().length >= REFERENCE_PICKER_MIN_QUERY_LENGTH) {
      scheduleSearch();
    } else {
      renderResults();
    }
  });

  searchInput.addEventListener("focus", function () {
    renderResults();
  });
  searchInput.addEventListener("input", function () {
    const query = String(searchInput.value || "").trim();
    if (searchTimer) clearTimeout(searchTimer);
    if (controller) controller.abort();
    controller = null;
    if (query.length < REFERENCE_PICKER_MIN_QUERY_LENGTH) {
      loading = false;
      currentResults = [];
      activeIndex = -1;
      renderResults();
      return;
    }
    loading = true;
    currentResults = [];
    activeIndex = -1;
    renderResults();
    scheduleSearch();
  });
  searchInput.addEventListener("keydown", function (event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      moveActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      moveActive(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (currentResults.length) {
        selectActiveResult();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = null;
      if (controller) controller.abort();
      controller = null;
      loading = false;
      currentResults = [];
      activeIndex = -1;
      status.textContent = "Zoeken gesloten.";
      results.textContent = "";
      searchInput.setAttribute("aria-expanded", "false");
      searchInput.setAttribute("aria-activedescendant", "");
    }
  });
  searchInput.addEventListener("blur", function () {
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
  });

  renderResults();
  return root;
}

function buildField(node, key, field) {
  if (field.hidden) return null;
  const wrap = document.createElement("div");
  wrap.className = "field";
  const label = document.createElement("label");
  label.className = "fieldLabel";
  const value = effectiveFieldValue(field, node.values[key]);
  const help = buildFieldHelpText(node, key, field, value);
  const labelText = document.createElement("span");
  labelText.textContent = field.label;
  const labelInfo = createHelpIcon(help, { className: "helpInfoIcon helpInfoIcon--field", side: "right" });
  label.appendChild(labelText);
  if (labelInfo) label.appendChild(labelInfo);
  applyFieldHelp([wrap, label], help);
  wrap.appendChild(label);

  if (node.type === "bounded_area_scatter" && key === "sourceAssetIds") {
    wrap.appendChild(buildScatterSourcePicker(node, key, value));
    return wrap;
  }
  if (field.type === "minimapMarkerCategories") {
    wrap.appendChild(buildMinimapMarkerCategoriesField(node, key, value, field));
    return wrap;
  }
  if (field.type === "boolean") {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = value === true;
    applyFieldHelp(input, help);
    input.addEventListener("change", function () { patchInspectorField(node, key, field, input.checked); });
    wrap.appendChild(input);
    if (node.type === "bounded_area_scatter" && key === "boundaryBlocksPlayer") {
      const hint = document.createElement("div");
      hint.className = "inspectorHint";
      hint.textContent = "When enabled, the polygon blocks the player.";
      wrap.appendChild(hint);
    }
  } else if (field.type === "select") {
    const select = document.createElement("select");
    applyFieldHelp(select, help);
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = field.dynamicOptions === "assetAnimations"
      ? animationBlankLabel(key)
      : field.dynamicOptions === "minimapCategories"
        ? "(geen categorie)"
        : "(kies)";
    select.appendChild(blank);
    const options = field.dynamicOptions === "assetAnimations"
      ? animationClipsForAsset(assetById(node.values.modelAssetId))
      : field.dynamicOptions === "minimapCategories"
        ? minimapCategorySelectOptions()
        : (field.options || []).map(function (option, index) {
        if (option && typeof option === "object") {
          return {
            value: option.value === undefined || option.value === null ? "" : String(option.value),
            label: option.label === undefined || option.label === null ? String(option.value === undefined || option.value === null ? "" : option.value) : String(option.label),
            index: index
          };
        }
        return { value: String(option), label: String(option), index: index };
      });
    for (const option of options) {
      const opt = document.createElement("option");
      const optionValue = option.value === undefined || option.value === null
        ? (option.name === undefined || option.name === null ? "" : String(option.name))
        : String(option.value);
      const optionLabel = option.label === undefined || option.label === null
        ? (option.name === undefined || option.name === null ? optionValue : String(option.name))
        : String(option.label);
      opt.value = optionValue;
      opt.textContent = optionLabel;
      if (optionValue === value) opt.selected = true;
      select.appendChild(opt);
    }
    select.value = isBlankValue(value) ? "" : String(value);
    select.addEventListener("change", function () {
      if (node.type === "editor_world_settings" && key === "editorPreset") {
        patchValues(node.id, worldSettingsPresetNodePatch("editor", select.value), {
          historyLabel: field.label,
          refreshViewport: shouldRefreshViewportForNode(node.id),
          refreshValidation: true
        });
        return;
      }
      if (node.type === "game_world_settings" && key === "gamePreset") {
        patchValues(node.id, worldSettingsPresetNodePatch("game", select.value), {
          historyLabel: field.label,
          refreshViewport: shouldRefreshViewportForNode(node.id),
          refreshValidation: true
        });
        return;
      }
      patchInspectorField(node, key, field, normalizeFieldInputValue(field, select.value));
    });
    wrap.appendChild(select);
    if (field.dynamicOptions === "assetAnimations") {
      const selectedAsset = assetById(node.values.modelAssetId);
      const clipNames = options.map(function (option) { return option.value || option.name; });
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
    applyFieldHelp(select, help);
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
    select.value = isBlankValue(value) ? "" : String(value);
    select.addEventListener("change", function () {
      const patch = makePatch(key, normalizeFieldInputValue(field, select.value));
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
  } else if (field.type === "identity") {
    const input = document.createElement("input");
    input.type = "text";
    input.spellcheck = false;
    input.autocomplete = "off";
    input.autocapitalize = "none";
    input.value = isBlankValue(value) ? "" : String(value);
    input.placeholder = field.pattern || "canonical.id";
    applyFieldHelp(input, help);
    input.addEventListener("change", function () {
      patchInspectorField(node, key, field, normalizeFieldInputValue(field, input.value));
    });
    wrap.appendChild(input);
  } else if (field.type === "reference") {
    wrap.appendChild(buildReferencePickerField(node, key, field, value));
  } else if (field.type === "referenceList" || field.type === "tagList" || field.type === "tokenText") {
    const textarea = document.createElement("textarea");
    textarea.rows = field.type === "tokenText" ? 5 : 4;
    textarea.spellcheck = field.type === "tokenText";
    textarea.value = stringifyListValue(value);
    textarea.placeholder = field.type === "referenceList"
      ? "global.game_name\nzone.start\nspawn.default"
      : field.type === "tagList"
        ? "global\nui\ncampaign.main"
        : "Welkom in @{global.game_name}";
    applyFieldHelp(textarea, help);
    textarea.addEventListener("change", function () {
      patchValues(node.id, makePatch(key, normalizeFieldInputValue(field, textarea.value)), {
        historyLabel: field.label,
        refreshViewport: shouldRefreshViewportForNode(node.id),
        refreshValidation: true
      });
    });
    wrap.appendChild(textarea);
    const hint = document.createElement("div");
    hint.className = "inspectorHint";
    if (field.type === "referenceList") {
      hint.textContent = "Een canonical reference per regel of komma-gescheiden.";
    } else if (field.type === "tagList") {
      hint.textContent = "Een canonical tag per regel of komma-gescheiden.";
    } else {
      hint.textContent = "Tokentekst ondersteunt @{...} placeholders.";
    }
    wrap.appendChild(hint);
    if (field.type === "tokenText") {
      const preview = document.createElement("pre");
      preview.className = "tokenPreview inspectorHint";
      let previewTimer = null;
      const queuePreview = function () {
        if (previewTimer) clearTimeout(previewTimer);
        previewTimer = setTimeout(function () {
          previewTimer = null;
          renderTokenTextPreview(textarea, preview);
        }, 250);
      };
      textarea.addEventListener("input", queuePreview);
      wrap.appendChild(preview);
      renderTokenTextPreview(textarea, preview);
    }
  } else if (field.type === "localizedText") {
    const keyRow = document.createElement("div");
    keyRow.className = "colorRow";
    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.spellcheck = false;
    keyInput.autocomplete = "off";
    keyInput.autocapitalize = "none";
    keyInput.placeholder = "localization.nl.game_name";
    keyInput.value = value && typeof value === "object" && !isBlankValue(value.key) ? String(value.key) : "";
    applyFieldHelp(keyInput, help);
    const fallbackInput = document.createElement("textarea");
    fallbackInput.rows = 3;
    fallbackInput.placeholder = "Fallback tekst";
    fallbackInput.value = value && typeof value === "object" && !isBlankValue(value.fallbackText) ? String(value.fallbackText) : "";
    applyFieldHelp(fallbackInput, help);
    const commitLocalizedText = function () {
      patchValues(node.id, makePatch(key, normalizeFieldInputValue(field, {
        key: keyInput.value,
        fallbackText: fallbackInput.value
      })), {
        historyLabel: field.label,
        refreshViewport: shouldRefreshViewportForNode(node.id),
        refreshValidation: true
      });
    };
    keyInput.addEventListener("change", commitLocalizedText);
    fallbackInput.addEventListener("change", commitLocalizedText);
    keyRow.append(keyInput);
    wrap.appendChild(keyRow);
    wrap.appendChild(fallbackInput);
  } else if (field.type === "color") {
    const row = document.createElement("div");
    row.className = "colorRow";
    applyFieldHelp(row, help);
    const color = document.createElement("input");
    color.type = "color";
    const colorValue = isBlankValue(value) ? "" : String(value);
    color.value = /^#[0-9a-fA-F]{6}$/.test(colorValue) ? colorValue : "#ffffff";
    applyFieldHelp(color, help);
    const text = document.createElement("input");
    text.type = "text";
    text.value = isBlankValue(value) ? "" : String(value);
    text.placeholder = "#ffffff";
    applyFieldHelp(text, help);
    let committedColorValue = text.value;
    let pendingColorValue = null;
    function commitColor(nextValue) {
      const normalizedValue = normalizeFieldInputValue(field, nextValue);
      if (normalizedValue === committedColorValue || normalizedValue === pendingColorValue) return;
      pendingColorValue = normalizedValue;
      patchValues(node.id, makePatch(key, normalizedValue), {
        historyLabel: field.label,
        refreshViewport: shouldRefreshViewportForNode(node.id),
        refreshValidation: true
      }).then(function (result) {
        if (result) committedColorValue = normalizedValue;
      }).finally(function () {
        if (pendingColorValue === normalizedValue) pendingColorValue = null;
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
  } else if (field.type === "json" || field.type === "formula" || field.type === "tagQuery") {
    if (node.type === "group" && key === "groupInterface") {
      wrap.appendChild(buildGroupInterfaceEditor(node, key, value));
      return wrap;
    }
    const textarea = document.createElement("textarea");
    textarea.rows = field.type === "formula" ? 7 : 6;
    textarea.placeholder = field.type === "formula"
      ? stringifyJsonValue({ operator: "add", operands: [] })
      : field.type === "tagQuery"
        ? stringifyJsonValue({ all: [], any: [], none: [] })
        : stringifyJsonValue(field.default === undefined ? {} : field.default);
    applyFieldHelp(textarea, help);
    try {
      textarea.value = stringifyJsonValue(value, field.default === undefined ? {} : field.default);
    } catch {
      textarea.value = "{}";
    }
    textarea.addEventListener("change", function () {
      try {
        const parsed = normalizeFieldInputValue(field, textarea.value);
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
        const parsed = normalizeFieldInputValue(field, textarea.value);
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
    applyFieldHelp(row, help);
    const text = document.createElement("input");
    text.type = "text";
    text.value = isBlankValue(value) ? "" : String(value);
    text.placeholder = "KeyW";
    applyFieldHelp(text, help);
    text.addEventListener("change", function () { patchValues(node.id, makePatch(key, normalizeFieldInputValue(field, text.value)), { historyLabel: field.label, refreshViewport: shouldRefreshViewportForNode(node.id), refreshValidation: true }); });
    const capture = document.createElement("button");
    capture.type = "button";
    capture.className = "mini";
    capture.textContent = "Capture";
    applyFieldHelp(capture, help);
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
  } else if (field.type === "number" && field.editorControl === "range") {
    const row = document.createElement("div");
    row.className = "rangeRow";
    applyFieldHelp(row, help);
    const input = document.createElement("input");
    input.type = "range";
    if (field.step !== undefined) input.step = String(field.step);
    if (field.min !== undefined) input.min = String(field.min);
    if (field.max !== undefined) input.max = String(field.max);
    const initialValue = Number.isFinite(Number(value)) ? Number(value) : Number(field.default || 0);
    input.value = String(initialValue);
    applyFieldHelp(input, help);
    const output = document.createElement("span");
    output.className = "rangeValue";
    applyFieldHelp(output, help);
    const updateOutput = function (nextValue) {
      const numericValue = Number(nextValue);
      output.textContent = Number.isFinite(numericValue) ? (Math.round(numericValue) + "%") : "0%";
    };
    updateOutput(input.value);
    input.addEventListener("input", function () {
      updateOutput(input.value);
    });
    input.addEventListener("change", function () {
      patchInspectorField(node, key, field, normalizeFieldInputValue(field, input.value));
    });
    row.append(input, output);
    wrap.appendChild(row);
  } else {
    const input = document.createElement("input");
    input.type = field.type === "number" ? "number" : "text";
    applyFieldHelp(input, help);
    if (field.type === "number") {
      if (field.step !== undefined) input.step = String(field.step);
      if (field.min !== undefined) input.min = String(field.min);
      if (field.max !== undefined) input.max = String(field.max);
    }
    input.value = isBlankValue(value) ? "" : value;
    input.addEventListener("change", function () {
      patchInspectorField(node, key, field, normalizeFieldInputValue(field, input.value));
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

function groupInterfacePortsKey(direction) {
  return direction === "input" ? "inputs" : "outputs";
}

function buildGroupInterfaceEditor(node, key, value, options = {}) {
  const editor = document.createElement("div");
  editor.className = "groupInterfaceEditor";
  const interfaceState = cloneGroupInterface(value);
  const targetNodeId = options.targetNodeId || node.id;
  const directionFilter = options.direction === "input" || options.direction === "output" ? options.direction : null;
  const interfaceHelp = buildGroupInterfaceHelpText(node, directionFilter);

  function commit() {
    patchValues(targetNodeId, makePatch(key, cloneGroupInterface(interfaceState)), {
      historyLabel: "Group interface",
      refreshViewport: shouldRefreshViewportForNode(targetNodeId),
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
      const ports = interfaceState[groupInterfacePortsKey(direction)];
      const nextPort = createGroupPort(direction, ports);
      ports.push(nextPort);
      commit();
    });
    header.append(title, add);
    section.appendChild(header);

    const ports = interfaceState[groupInterfacePortsKey(direction)];
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
  const introText = document.createElement("span");
  introText.textContent = directionFilter
    ? "Pas hier de ports aan die aan deze Group Input/Output gekoppeld zijn."
    : "Dit is de echte groep-interface. Vul alleen het label in; de technische naam wordt automatisch gesluggifyt en blijft stabiel zodra je een port gebruikt.";
  const introInfo = createHelpIcon(interfaceHelp, { className: "helpInfoIcon helpInfoIcon--inline", side: "right" });
  intro.appendChild(introText);
  if (introInfo) intro.appendChild(introInfo);
  editor.appendChild(intro);
  if (!directionFilter || directionFilter === "input") editor.appendChild(buildSection("input", "Inputs"));
  if (!directionFilter || directionFilter === "output") editor.appendChild(buildSection("output", "Outputs"));
  return editor;
}

function normalizedNodeIdList(value) {
  const ids = [];
  const seen = new Set();
  for (const entry of Array.isArray(value) ? value : []) {
    const id = String(entry || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function scatterSourceAssetIdsForNode(node) {
  const explicitAssetIds = normalizedNodeIdList(node?.values?.sourceAssetIds);
  if (explicitAssetIds.length) return explicitAssetIds;
  const legacySourceIds = normalizedNodeIdList(node?.values?.sourceNodeIds);
  const assetIds = [];
  const seen = new Set();
  for (const legacyNodeId of legacySourceIds) {
    const sourceNode = nodeById(legacyNodeId);
    if (!sourceNode || sourceNode.type !== "model_entity") continue;
    const assetId = String(sourceNode.values?.modelAssetId || "").trim();
    if (!assetId || seen.has(assetId)) continue;
    seen.add(assetId);
    assetIds.push(assetId);
  }
  return assetIds;
}

function scatterSourceScaleMultipliersForNode(node) {
  const legacySource = node && node.values && typeof node.values.sourceHeightMultipliers === "object" && !Array.isArray(node.values.sourceHeightMultipliers)
    ? node.values.sourceHeightMultipliers
    : {};
  const source = node && node.values && typeof node.values.sourceScaleMultipliers === "object" && !Array.isArray(node.values.sourceScaleMultipliers)
    ? node.values.sourceScaleMultipliers
    : {};
  const multipliers = {};
  for (const sourceMap of [legacySource, source]) {
    for (const [assetIdRaw, multiplierRaw] of Object.entries(sourceMap)) {
      const assetId = String(assetIdRaw || "").trim();
      if (!assetId) continue;
      const multiplier = Number(multiplierRaw);
      if (!Number.isFinite(multiplier)) continue;
      multipliers[assetId] = Math.min(1000, Math.max(0.001, multiplier));
    }
  }
  return multipliers;
}

function buildScatterSourcePicker(node, key, value) {
  const wrap = document.createElement("div");
  wrap.className = "scatterSourcePicker";
  const header = document.createElement("div");
  header.className = "scatterSourcePickerHeader";
  const hint = document.createElement("div");
  hint.className = "inspectorHint";
  hint.textContent = "Kies model-assets uit de assetkolom en stel per geselecteerd asset de scale in.";
  const actions = document.createElement("div");
  actions.className = "scatterSourceActions";
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "mini";
  clear.textContent = "Wis selectie";
  clear.disabled = scatterSourceAssetIdsForNode(node).length === 0;
  clear.addEventListener("click", function () {
    patchValues(node.id, {
      sourceAssetIds: [],
      sourceScaleMultipliers: {},
      sourceHeightMultipliers: {},
      sourceNodeIds: []
    }, {
      historyLabel: "Source assets",
      refreshViewport: shouldRefreshViewportForNode(node.id),
      refreshValidation: true
    });
  });
  actions.append(clear);
  header.append(hint, actions);
  wrap.appendChild(header);

  const sources = state.assets.filter(function (asset) {
    return asset && asset.assetType === "model";
  }).slice().sort(function (left, right) {
    const titleDelta = String(left.name || "").localeCompare(String(right.name || ""));
    if (titleDelta !== 0) return titleDelta;
    return String(left.id || "").localeCompare(String(right.id || ""));
  });
  const selectedIds = new Set(scatterSourceAssetIdsForNode(node));
  if (!sources.length) {
    const empty = document.createElement("div");
    empty.className = "groupInterfaceEmpty";
    empty.textContent = "Nog geen model-assets aanwezig.";
    wrap.appendChild(empty);
    return wrap;
  }

  const list = document.createElement("div");
  list.className = "scatterSourceList";
  const scaleMultipliers = scatterSourceScaleMultipliersForNode(node);
  const commit = function () {
    const nextIds = Array.from(selectedIds).sort(function (left, right) {
      return String(left).localeCompare(String(right));
    });
    patchValues(node.id, {
      sourceAssetIds: nextIds,
      sourceNodeIds: []
    }, {
      historyLabel: "Source assets",
      refreshViewport: shouldRefreshViewportForNode(node.id),
      refreshValidation: true
    });
  };
  for (const source of sources) {
    const item = document.createElement("div");
    item.className = "scatterSourceItem";
    item.style.display = "grid";
    item.style.gap = "6px";
    const toggle = document.createElement("label");
    toggle.style.display = "flex";
    toggle.style.alignItems = "center";
    toggle.style.gap = "8px";
    toggle.style.minWidth = "0";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedIds.has(source.id);
    checkbox.addEventListener("change", function () {
      if (checkbox.checked) selectedIds.add(source.id);
      else selectedIds.delete(source.id);
      commit();
    });
    const text = document.createElement("span");
    text.textContent = source.name + " · " + source.assetType;
    toggle.append(checkbox, text);
    item.appendChild(toggle);

    if (selectedIds.has(source.id)) {
      const scaleWrap = document.createElement("div");
      scaleWrap.style.display = "grid";
      scaleWrap.style.gap = "4px";
      scaleWrap.style.paddingLeft = "26px";
      const scaleLabel = document.createElement("span");
      scaleLabel.textContent = "Scale";
      scaleLabel.style.fontSize = "10px";
      scaleLabel.style.color = "#7f8d99";
      scaleLabel.style.textTransform = "uppercase";
      scaleLabel.style.letterSpacing = "0.6px";
      const scaleInput = document.createElement("input");
      scaleInput.type = "number";
      scaleInput.step = "0.05";
      scaleInput.min = "0.001";
      scaleInput.max = "1000";
      scaleInput.style.width = "120px";
      scaleInput.style.marginTop = "0";
      const currentScale = Number(scaleMultipliers[source.id]);
      scaleInput.value = Number.isFinite(currentScale) ? String(currentScale) : "1";
      scaleInput.addEventListener("change", function () {
        const rawScale = String(scaleInput.value || "").trim();
        const nextScale = rawScale === "" ? 1 : Number(rawScale);
        const normalizedScale = Number.isFinite(nextScale) ? Math.min(1000, Math.max(0.001, nextScale)) : 1;
        const nextMultipliers = scatterSourceScaleMultipliersForNode(node);
        nextMultipliers[source.id] = normalizedScale;
        const orderedMultipliers = {};
        for (const assetId of Object.keys(nextMultipliers).sort(function (left, right) {
          return String(left).localeCompare(String(right));
        })) {
          orderedMultipliers[assetId] = nextMultipliers[assetId];
        }
        patchValues(node.id, {
          sourceScaleMultipliers: orderedMultipliers,
          sourceHeightMultipliers: {}
        }, {
          historyLabel: source.name + " scale",
          refreshViewport: shouldRefreshViewportForNode(node.id),
          refreshValidation: true
        });
      });
      scaleWrap.append(scaleLabel, scaleInput);
      item.appendChild(scaleWrap);
    }
    list.appendChild(item);
  }
  wrap.appendChild(list);
  return wrap;
}

function makePatch(key, value) {
  const patch = {};
  patch[key] = value;
  return patch;
}

async function patchValues(nodeId, patch, options = {}) {
  const node = nodeById(nodeId);
  const cleanPatch = normalizeModelEntityTransformPatch(node, patch || {});
  if (node && Object.entries(cleanPatch || {}).every(function ([key, value]) { return node.values[key] === value; })) return state.graph;
  const runtimeTransformPatch = isModelEntityTransformPatch(node, cleanPatch);
  const localValuePatch = runtimeTransformPatch || isEditorCameraPatch(node, cleanPatch);
  const mutationOptions = Object.assign({
    historyLabel: options.historyLabel || "Waarde gewijzigd",
    refreshViewport: options.refreshViewport === true,
    refreshValidation: options.refreshValidation !== false,
    refreshGraph: options.refreshGraph !== false,
    refreshEdgeList: options.refreshEdgeList !== false,
    refreshInspector: options.refreshInspector !== false
  }, options);
  if (runtimeTransformPatch) {
    const afterApply = mutationOptions.afterApply;
    // Do NOT null out historyLabel/historySnapshot here - callers (gizmo drag commit,
    // matrix input commit) pass a real label expecting an undo step. Nulling it used to
    // silently drop undo for every single-object move (group moves use a separate path
    // and were unaffected, hence "sometimes yes, sometimes no").
    mutationOptions.refreshViewport = false;
    mutationOptions.refreshGraph = false;
    mutationOptions.refreshInspector = false;
    mutationOptions.refreshEdgeList = false;
    mutationOptions.refreshViewportControls = false;
    mutationOptions.refreshValidation = false;
    mutationOptions.afterApply = function (nextGraph, result) {
      syncRuntimeModelEntityTransform(nodeId);
      if (typeof afterApply === "function") afterApply(nextGraph, result);
    };
  }
  return await applyGraphMutation(async function () {
    if (localValuePatch) {
      await apiOk("/api/editor/nodes/" + nodeId + "/values", { method: "PATCH", body: JSON.stringify({ values: cleanPatch, returnGraph: false }) });
      return graphWithPatchedNodeValues(state.graph, nodeId, cleanPatch);
    }
    return api("/api/editor/nodes/" + nodeId + "/values", { method: "PATCH", body: JSON.stringify({ values: cleanPatch }) });
  }, mutationOptions);
}

function minimapBakeThumbnailPreview(node) {
  const wrap = document.createElement("div");
  wrap.className = "assetThumb minimapBakeThumb";
  const imageUrl = normalizeMinimapImageUrl(node.values.bakedImageUrl);
  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = node.values.label || "Minimap preview";
    img.addEventListener("error", function () {
      wrap.innerHTML = "";
      const icon = document.createElement("div");
      icon.className = "assetThumbIcon";
      icon.textContent = "MAP";
      wrap.appendChild(icon);
    });
    wrap.appendChild(img);
  } else {
    const icon = document.createElement("div");
    icon.className = "assetThumbIcon";
    icon.textContent = "MAP";
    wrap.appendChild(icon);
  }
  return wrap;
}

function buildMinimapBakeInspectorBlock(node) {
  const wrap = document.createElement("div");
  wrap.className = "field minimapBakeField";
  const label = document.createElement("label");
  label.textContent = "Minimap bake";
  wrap.appendChild(label);
  wrap.appendChild(minimapBakeThumbnailPreview(node));
  const meta = document.createElement("div");
  meta.className = "inspectorHint";
  meta.textContent = node.values.bakedImageUrl
    ? ("Laatste bake: " + (node.values.bakedAt || "onbekend") + " - " + (node.values.bakedImageWidth || 0) + "x" + (node.values.bakedImageHeight || 0))
    : "Nog geen minimap gebakken.";
  wrap.appendChild(meta);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mini";
  button.textContent = state.minimapBakeBusy ? "Minimap wordt gebakken..." : "Maak minimap afbeelding";
  button.disabled = state.minimapBakeBusy;
  button.addEventListener("click", function () { bakeMinimapForNode(node.id); });
  wrap.appendChild(button);
  if (state.minimapBakeMessage) {
    const status = document.createElement("div");
    status.className = "inspectorHint" + (state.minimapBakeTone === "error" ? " err" : "");
    status.textContent = state.minimapBakeMessage;
    wrap.appendChild(status);
  }
  return wrap;
}

function squareBoundsFromExplicit(minX, maxX, minZ, maxZ) {
  const left = Number(minX);
  const right = Number(maxX);
  const top = Number(minZ);
  const bottom = Number(maxZ);
  if (![left, right, top, bottom].every(Number.isFinite) || right <= left || bottom <= top) return null;
  const centerX = (left + right) / 2;
  const centerZ = (top + bottom) / 2;
  const side = Math.max(right - left, bottom - top, 0.01);
  return {
    minX: centerX - side / 2,
    maxX: centerX + side / 2,
    minZ: centerZ - side / 2,
    maxZ: centerZ + side / 2,
    width: side,
    depth: side
  };
}

function minimapBakeBoundsFromGroundNode(ground) {
  if (!ground) return null;
  const values = ground.values || {};
  const explicit = squareBoundsFromExplicit(values.minX, values.maxX, values.minZ, values.maxZ);
  if (String(values.boundsMode || "") === "explicitBounds" && explicit) return explicit;
  return squareGroundBounds({
    width: Number(values.width) || 60,
    depth: Number(values.depth) || 60
  });
}

function minimapBakeBoundsFromZoneNode(zone) {
  if (!zone) return null;
  const values = zone.values || {};
  const originX = Number(values.originX);
  const originZ = Number(values.originZ);
  const width = Number(values.width);
  const depth = Number(values.depth);
  if (![originX, originZ, width, depth].every(Number.isFinite) || width <= 0 || depth <= 0) return null;
  return squareBoundsFromExplicit(originX, originX + width, originZ, originZ + depth);
}

function incomingNodeForPort(targetNode, portName) {
  const edge = (state.graph.edges || []).find(function (candidate) {
    return candidate.toNodeId === targetNode.id && candidate.toPort === portName;
  });
  return edge ? nodeById(edge.fromNodeId) : null;
}

function zoneRefFromZoneNode(zone) {
  if (!zone) return "";
  if (zone.type === "zone_definition") return String(zone.values?.zoneId || "").trim();
  if (isZoneCanvasGroup(zone)) return zoneRefFromZoneNode(zoneDefinitionForGroup(zone.id));
  return String(zone.values?.zoneRef || zone.values?.zoneId || "").trim();
}

function resolveMinimapBakeZoneRef(bakeNode = null) {
  if (bakeNode?.type !== "minimap_bake") return "";
  const directZoneRef = zoneRefFromZoneNode(incomingNodeForPort(bakeNode, "zone"));
  if (directZoneRef) return directZoneRef;
  const directGround = incomingNodeForPort(bakeNode, "ground");
  const groundZoneRef = String(directGround?.values?.zoneRef || "").trim();
  if (groundZoneRef) return groundZoneRef;
  const parent = bakeNode.parentId ? nodeById(bakeNode.parentId) : null;
  if (isZoneCanvasGroup(parent)) return zoneRefFromZoneNode(zoneDefinitionForGroup(parent.id));
  return "";
}

function resolveMinimapBakeBounds(bakeNode = null) {
  if (bakeNode?.type === "minimap_bake") {
    const directGround = incomingNodeForPort(bakeNode, "ground");
    const directZone = incomingNodeForPort(bakeNode, "zone");
    const directGroundBounds = minimapBakeBoundsFromGroundNode(directGround);
    if (directGroundBounds) return directGroundBounds;
    const directZoneBounds = minimapBakeBoundsFromZoneNode(directZone);
    if (directZoneBounds) return directZoneBounds;
    const parent = bakeNode.parentId ? nodeById(bakeNode.parentId) : null;
    if (isZoneCanvasGroup(parent)) {
      const zoneGround = (state.graph.nodes || []).find(function (node) {
        return node.parentId === parent.id && node.type === "ground_surface";
      }) || null;
      const zoneGroundBounds = minimapBakeBoundsFromGroundNode(zoneGround);
      if (zoneGroundBounds) return zoneGroundBounds;
      const zoneBounds = minimapBakeBoundsFromZoneNode(zoneDefinitionForGroup(parent.id));
      if (zoneBounds) return zoneBounds;
    }
  }
  const runtimeBounds = runtime && typeof runtime.getMinimapBakeBounds === "function"
    ? runtime.getMinimapBakeBounds()
    : null;
  if (runtimeBounds) return runtimeBounds;
  return squareGroundBounds(effectiveWorldGroundBounds(state.viewportWorld || null) || state.viewportWorld?.ground || null);
}

function resolveMinimapBakeDisplayBounds(bake = null) {
  if (bake?.bounds || bake?.bakedBounds) return bake.bounds || bake.bakedBounds;
  const node = bake?.nodeId ? nodeById(bake.nodeId) : null;
  return resolveMinimapBakeBounds(node);
}

function isValidMinimapBounds(bounds) {
  return bounds
    && Number.isFinite(Number(bounds.minX))
    && Number.isFinite(Number(bounds.maxX))
    && Number.isFinite(Number(bounds.minZ))
    && Number.isFinite(Number(bounds.maxZ))
    && Number(bounds.maxX) > Number(bounds.minX)
    && Number(bounds.maxZ) > Number(bounds.minZ);
}

function unionMinimapBounds(boundsList) {
  const valid = (Array.isArray(boundsList) ? boundsList : []).filter(isValidMinimapBounds);
  if (!valid.length) return null;
  let minX = Number(valid[0].minX);
  let maxX = Number(valid[0].maxX);
  let minZ = Number(valid[0].minZ);
  let maxZ = Number(valid[0].maxZ);
  for (const bounds of valid.slice(1)) {
    minX = Math.min(minX, Number(bounds.minX));
    maxX = Math.max(maxX, Number(bounds.maxX));
    minZ = Math.min(minZ, Number(bounds.minZ));
    maxZ = Math.max(maxZ, Number(bounds.maxZ));
  }
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

function resolveEditorMinimapCandidates(config) {
  if (!config) return [];
  const bakes = Array.isArray(state.viewportWorld?.minimap?.bakes) ? state.viewportWorld.minimap.bakes : [];
  const graphBakes = Array.isArray(state.graph?.nodes)
    ? state.graph.nodes.filter(function (node) {
      return node?.type === "minimap_bake" && node.values;
    }).map(function (node) {
      return Object.assign({ id: node.id, nodeId: node.id }, node.values);
    })
    : [];
  const candidates = graphBakes.concat(bakes.filter(function (candidate) {
    return !graphBakes.some(function (bake) { return bake.nodeId === candidate.nodeId || bake.minimapId === candidate.minimapId; });
  }));
  const sourceId = String(config.sourceMinimapId || "").trim();
  return candidates.filter(function (candidate) {
    return candidate && candidate.enabled !== false && isValidMinimapBounds(resolveMinimapBakeDisplayBounds(candidate));
  }).sort(function (left, right) {
    const leftMatch = sourceId && String(left?.minimapId || "") === sourceId ? 0 : 1;
    const rightMatch = sourceId && String(right?.minimapId || "") === sourceId ? 0 : 1;
    return leftMatch - rightMatch;
  });
}

function resolveEditorMinimapBake(config) {
  return resolveEditorMinimapCandidates(config)[0] || null;
}

function zoneMinimapBoundsFromPackage(pkg) {
  const bounds = pkg?.zone?.bounds || pkg?.bounds || null;
  if (isValidMinimapBounds(bounds)) return bounds;
  const ground = pkg?.ground || null;
  if (ground) {
    const groundBounds = squareGroundBounds(ground);
    if (isValidMinimapBounds(groundBounds)) return groundBounds;
  }
  const zone = pkg?.zone || {};
  const originX = Number(zone.originX);
  const originZ = Number(zone.originZ);
  const width = Number(zone.width);
  const depth = Number(zone.depth);
  if (![originX, originZ, width, depth].every(Number.isFinite) || width <= 0 || depth <= 0) return null;
  return { minX: originX, maxX: originX + width, minZ: originZ, maxZ: originZ + depth, width: width, depth: depth };
}

function resolveEditorMinimapZoneRegions() {
  const world = state.viewportWorld || {};
  const regions = [];
  const seen = new Set();
  function addRegion(bounds, label, color) {
    if (!isValidMinimapBounds(bounds)) return;
    const key = [
      Math.round(Number(bounds.minX) * 100) / 100,
      Math.round(Number(bounds.maxX) * 100) / 100,
      Math.round(Number(bounds.minZ) * 100) / 100,
      Math.round(Number(bounds.maxZ) * 100) / 100
    ].join(":");
    if (seen.has(key)) return;
    seen.add(key);
    regions.push({
      bounds: {
        minX: Number(bounds.minX),
        maxX: Number(bounds.maxX),
        minZ: Number(bounds.minZ),
        maxZ: Number(bounds.maxZ),
        width: Number(bounds.maxX) - Number(bounds.minX),
        depth: Number(bounds.maxZ) - Number(bounds.minZ)
      },
      label: label || "Zone",
      color: color || "#2dd4bf"
    });
  }
  const packages = Array.isArray(world.zones?.packages) ? world.zones.packages : [];
  for (const pkg of packages) {
    addRegion(zoneMinimapBoundsFromPackage(pkg), pkg?.zone?.displayName || pkg?.zoneId || pkg?.id || "Zone", "#2dd4bf");
  }
  if (world.zonePackage) {
    addRegion(zoneMinimapBoundsFromPackage(world.zonePackage), world.zonePackage?.zone?.displayName || world.zonePackage?.zoneId || "Active zone", "#7bd4ff");
  }
  for (const ground of Array.isArray(world.zoneGrounds) ? world.zoneGrounds : []) {
    addRegion(squareGroundBounds(ground), ground.zoneRef || ground.groundId || "Zone", "#2dd4bf");
  }
  const effective = effectiveWorldGroundBounds(world);
  if (!regions.length && effective) addRegion(effective, "World", "#2dd4bf");
  return regions;
}

function resolveEditorMinimapWorldBounds(config, bake = null) {
  const boundsList = [];
  for (const candidate of resolveEditorMinimapCandidates(config)) {
    boundsList.push(resolveMinimapBakeDisplayBounds(candidate));
  }
  for (const region of resolveEditorMinimapZoneRegions()) boundsList.push(region.bounds);
  const runtimeBounds = runtime && typeof runtime.getMinimapBakeBounds === "function"
    ? runtime.getMinimapBakeBounds()
    : null;
  if (runtimeBounds) boundsList.push(runtimeBounds);
  const effective = effectiveWorldGroundBounds(state.viewportWorld || null);
  if (effective) boundsList.push(effective);
  return unionMinimapBounds(boundsList) || resolveMinimapBakeDisplayBounds(bake) || resolveMinimapBakeBounds();
}

function intersectMinimapBounds(a, b) {
  if (!isValidMinimapBounds(a) || !isValidMinimapBounds(b)) return null;
  const minX = Math.max(Number(a.minX), Number(b.minX));
  const maxX = Math.min(Number(a.maxX), Number(b.maxX));
  const minZ = Math.max(Number(a.minZ), Number(b.minZ));
  const maxZ = Math.min(Number(a.maxZ), Number(b.maxZ));
  if (maxX <= minX || maxZ <= minZ) return null;
  return { minX, maxX, minZ, maxZ };
}

function drawEditorMinimapRect(ctx, bounds, viewBounds, size, options = {}) {
  const visible = intersectMinimapBounds(bounds, viewBounds);
  if (!visible) return false;
  const a = worldToMinimapPoint(visible.minX, visible.minZ, viewBounds, size, size);
  const b = worldToMinimapPoint(visible.maxX, visible.maxZ, viewBounds, size, size);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  if (w <= 0 || h <= 0) return false;
  ctx.save();
  if (options.fill) {
    ctx.globalAlpha = options.fillAlpha === undefined ? 1 : options.fillAlpha;
    ctx.fillStyle = options.fill;
    ctx.fillRect(x, y, w, h);
  }
  if (options.stroke) {
    ctx.globalAlpha = options.strokeAlpha === undefined ? 1 : options.strokeAlpha;
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.lineWidth || 1;
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
  }
  ctx.restore();
  return true;
}

function drawEditorMinimapBakeIntoView(ctx, image, bakeBounds, viewBounds, size) {
  if (!ctx || !image || !isValidMinimapBounds(bakeBounds) || !isValidMinimapBounds(viewBounds) || !image.complete || !image.naturalWidth) return false;
  const visible = intersectMinimapBounds(bakeBounds, viewBounds);
  if (!visible) return false;
  const imageWidth = image.naturalWidth || image.width || 1;
  const imageHeight = image.naturalHeight || image.height || 1;
  const sourceA = worldToMinimapPoint(visible.minX, visible.minZ, bakeBounds, imageWidth, imageHeight);
  const sourceB = worldToMinimapPoint(visible.maxX, visible.maxZ, bakeBounds, imageWidth, imageHeight);
  const destA = worldToMinimapPoint(visible.minX, visible.minZ, viewBounds, size, size);
  const destB = worldToMinimapPoint(visible.maxX, visible.maxZ, viewBounds, size, size);
  const sx = Math.min(sourceA.x, sourceB.x);
  const sy = Math.min(sourceA.y, sourceB.y);
  const sw = Math.abs(sourceB.x - sourceA.x);
  const sh = Math.abs(sourceB.y - sourceA.y);
  const dx = Math.min(destA.x, destB.x);
  const dy = Math.min(destA.y, destB.y);
  const dw = Math.abs(destB.x - destA.x);
  const dh = Math.abs(destB.y - destA.y);
  if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return false;
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
  return true;
}

function computeMinimapWorldHash() {
  const nodeCount = state.graph?.nodes?.length || 0;
  const edgeCount = state.graph?.edges?.length || 0;
  return nodeCount + "n-" + edgeCount + "e";
}

async function bakeMinimapForNode(nodeId) {
  const node = nodeById(nodeId);
  if (!node || node.type !== "minimap_bake" || !runtime || state.minimapBakeBusy) return;
  const bounds = resolveMinimapBakeBounds(node);
  if (!bounds) {
    state.minimapBakeMessage = "Kan geen minimap bakken: er is geen Ground Surface verbonden.";
    state.minimapBakeTone = "error";
    renderInspector();
    return;
  }
  state.minimapBakeBusy = true;
  state.minimapBakeMessage = "Minimap wordt gebakken...";
  state.minimapBakeTone = "";
  renderInspector();
  try {
    const result = await runtime.bakeMinimapImage({
      bounds: bounds,
      resolution: Number(node.values.resolution) || 1024,
      quality: Number(node.values.imageQuality) || 0.78,
      zoneRef: resolveMinimapBakeZoneRef(node),
      hideEditorHelpers: node.values.hideEditorHelpers !== false,
      hideChunkDebugOverlay: node.values.hideEditorHelpers !== false,
      hideTransformControls: node.values.hideEditorHelpers !== false,
      includeStaticModels: node.values.includeStaticModels !== false
    });
    const formData = new FormData();
    formData.append("nodeId", node.id);
    formData.append("minimapId", node.values.minimapId || "main_minimap");
    formData.append("worldHash", computeMinimapWorldHash());
    formData.append("resolution", String(result.width));
    formData.append("width", String(result.width));
    formData.append("height", String(result.height));
    formData.append("format", result.format);
    formData.append("quality", String(result.quality));
    formData.append("bounds", JSON.stringify(result.bounds));
    formData.append("file", result.blob, "minimap." + result.format);
    const response = await fetchEditorApi("/api/editor/minimap-bakes", { method: "POST", body: formData, timeoutMs: 120000 }, "POST");
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok || !data.ok) throw new Error(data.message || "Minimap bake upload mislukt.");
    if (data.graph) {
      state.graph = data.graph;
      state.nodeTypes = data.graph.nodeTypes || state.nodeTypes;
    }
    state.minimapBakeMessage = "Minimap image opgeslagen.";
    state.minimapBakeTone = "success";
    renderGraph();
    await refreshViewport({ force: true });
  } catch (error) {
    state.minimapBakeMessage = error.message || "Minimap bake mislukt.";
    state.minimapBakeTone = "error";
  } finally {
    state.minimapBakeBusy = false;
    renderInspector();
    redrawEditorMinimap();
  }
}

const editorMinimapImageCache = { url: "", image: null };

function normalizeMinimapImageUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^(https?:)?\/\//i.test(value) || value.startsWith("/")) return value;
  return "/" + value;
}

function loadedEditorMinimapImage(url) {
  const normalizedUrl = normalizeMinimapImageUrl(url);
  if (!normalizedUrl) return null;
  if (editorMinimapImageCache.url === normalizedUrl && editorMinimapImageCache.image) return editorMinimapImageCache.image;
  const image = new Image();
  image.addEventListener("load", function () { scheduleEditorMinimapRedraw(); });
  image.src = normalizedUrl;
  editorMinimapImageCache.url = normalizedUrl;
  editorMinimapImageCache.image = image;
  return image;
}

function editorMinimapDisplaySize(config) {
  const stored = storedFloatingPanelState("editorMinimap");
  if (stored) return Math.max(64, Math.round(Math.max(stored.width, stored.height)));
  return Math.max(64, Number(config?.sizePx) || 180);
}

function editorMinimapUiScale(size) {
  return clampNumber(Number(size) / 180, 0.24, 1.4);
}

function editorMinimapMarkerSize(size, baseSize) {
  return Math.max(1.2, Number(baseSize) * editorMinimapUiScale(size));
}

function editorMinimapMarkerLineWidth(size) {
  return Math.max(0.45, 1.35 * editorMinimapUiScale(size));
}

function editorMinimapLabelFontSize(size, baseSize) {
  return Math.max(2.5, Number(baseSize) * editorMinimapUiScale(size));
}

function editorMinimapLabelMaxLength(size, baseLength) {
  return Math.max(3, Math.round(Number(baseLength || 14) * clampNumber(Number(size) / 180, 0.25, 1)));
}

function applyEditorMinimapAnchor(config) {
  const root = el.editorMinimapRoot;
  if (!root) return;
  applyViewportFloatingSlotAnchor(root, "editorMinimap", config, {
    resizeCorner: "top-left",
    square: true,
    minWidth: 64,
    minHeight: 64
  });
}

function ensureEditorMinimapView(config, groundBounds, cameraTarget) {
  const configKey = (config.sourceMinimapId || "") + "|" + (config.hudId || "");
  if (!state.editorMinimapView || state.editorMinimapConfigKey !== configKey) {
    state.editorMinimapConfigKey = configKey;
    state.editorMinimapUserOverride = false;
    state.editorMinimapView = createMinimapView(
      cameraTarget ? cameraTarget.x : 0,
      cameraTarget ? cameraTarget.z : 0,
      config.startDistance
    );
  }
  if (config.followEditorCamera !== false && !state.editorMinimapUserOverride && cameraTarget) {
    state.editorMinimapView = { centerX: cameraTarget.x, centerZ: cameraTarget.z, worldDistance: state.editorMinimapView.worldDistance };
  }
  state.editorMinimapView = clampMinimapView(state.editorMinimapView, groundBounds);
  return state.editorMinimapView;
}

function ensureEditorMinimapInteractions() {
  if (state.editorMinimapInteractions || !el.editorMinimapCanvas) return;
  state.editorMinimapInteractions = attachMinimapInteractions(el.editorMinimapCanvas, {
    getView: function () { return state.editorMinimapView; },
    setView: function (view) {
      state.editorMinimapView = view;
      state.editorMinimapUserOverride = true;
      redrawEditorMinimap();
    },
    getGroundBounds: function () {
      const config = state.viewportWorld?.minimap?.editor || null;
      return resolveEditorMinimapWorldBounds(config, resolveEditorMinimapBake(config));
    },
    getCanvasSize: function () { return editorMinimapDisplaySize(state.viewportWorld?.minimap?.editor || null); },
    getMinDistance: function () { return state.viewportWorld?.minimap?.editor?.minDistance || 20; },
    getMaxDistance: function () {
      const config = state.viewportWorld?.minimap?.editor || null;
      const configuredMax = state.viewportWorld?.minimap?.editor?.maxDistance || 1000;
      const bounds = resolveEditorMinimapWorldBounds(config, resolveEditorMinimapBake(config));
      const worldMax = bounds ? Math.max(Number(bounds.maxX) - Number(bounds.minX), Number(bounds.maxZ) - Number(bounds.minZ), 1) : 1;
      return Math.max(configuredMax, worldMax);
    },
    allowZoom: function () { return state.viewportWorld?.minimap?.editor?.allowZoom !== false; },
    allowPan: function () { return state.viewportWorld?.minimap?.editor?.allowPan !== false; },
    allowPinchZoom: function () { return state.viewportWorld?.minimap?.editor?.allowPinchZoom !== false; },
    onClick: function (worldX, worldZ) {
      const config = state.viewportWorld?.minimap?.editor;
      if (!config || config.clickToFocus === false || !runtime) return;
      const bounds = resolveEditorMinimapWorldBounds(config, resolveEditorMinimapBake(config));
      const clampedX = bounds ? Math.max(bounds.minX, Math.min(bounds.maxX, worldX)) : worldX;
      const clampedZ = bounds ? Math.max(bounds.minZ, Math.min(bounds.maxZ, worldZ)) : worldZ;
      runtime.focusGroundPoint(clampedX, clampedZ);
      redrawEditorMinimap();
    }
  });
}

function scheduleEditorMinimapRedraw(delayMs = 80) {
  if (editorMinimapRedrawTimer) return;
  editorMinimapRedrawTimer = setTimeout(function () {
    editorMinimapRedrawTimer = null;
    redrawEditorMinimap();
  }, Math.max(0, Number(delayMs) || 0));
}

function redrawEditorMinimap() {
  if (!el.editorMinimapRoot || !el.editorMinimapCanvas) return;
  if (state.editorMinimapSuppressed) {
    el.editorMinimapRoot.hidden = true;
    return;
  }
  const config = state.viewportWorld?.minimap?.editor || null;
  if (!config || config.enabled === false || !runtime) {
    el.editorMinimapRoot.hidden = true;
    return;
  }
  ensureEditorMinimapInteractions();
  const bake = resolveEditorMinimapBake(config);
  applyEditorMinimapAnchor(config);
  el.editorMinimapRoot.hidden = false;
  ensureFloatingPanelControls(el.editorMinimapRoot, "editorMinimap", {
    dragClassName: "editorMinimapDragHandle",
    resizeCorner: "top-left",
    square: true,
    minWidth: 64,
    minHeight: 64,
    onEnd: function () { redrawEditorMinimap(); }
  });
  const canvas = el.editorMinimapCanvas;
  const size = editorMinimapDisplaySize(config);
  // Backing store at devicePixelRatio, drawing math in logical px, for a sharp HiDPI minimap.
  const dpr = Math.max(1, Math.min(3, Number(window.devicePixelRatio) || 1));
  const backing = Math.round(size * dpr);
  if (canvas.width !== backing || canvas.height !== backing) {
    canvas.width = backing;
    canvas.height = backing;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, size, size);
  const uiScale = editorMinimapUiScale(size);
  const markerLineWidth = editorMinimapMarkerLineWidth(size);
  ctx.fillStyle = "#0b131c";
  ctx.fillRect(0, 0, size, size);
  const bounds = resolveEditorMinimapWorldBounds(config, bake);
  if (!bounds) {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = Math.max(4, 11 * uiScale) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Geen Ground Surface", size / 2, size / 2);
    return;
  }
  const snapshot = runtime.getMinimapMarkerSnapshot({
    includeLocalPlayer: false,
    includeRemotePlayers: false,
    includeEntities: config.showModelEntities !== false || config.showScatterInstances === true,
    includeInteractables: config.showInteractables !== false
  });
  const view = ensureEditorMinimapView(config, bounds, snapshot.cameraTarget);
  const viewBounds = minimapViewBounds(view);
  let drewBakeImage = false;
  const zoneRegions = resolveEditorMinimapZoneRegions();
  for (const region of zoneRegions) {
    drawEditorMinimapRect(ctx, region.bounds, viewBounds, size, {
      fill: region.color,
      fillAlpha: 0.14,
      stroke: region.color,
      strokeAlpha: 0.34,
      lineWidth: Math.max(0.35, uiScale)
    });
  }
  for (const candidate of resolveEditorMinimapCandidates(config)) {
    if (!candidate?.bakedImageUrl) continue;
    const candidateBounds = resolveMinimapBakeDisplayBounds(candidate);
    const image = loadedEditorMinimapImage(candidate.bakedImageUrl);
    if (drawEditorMinimapBakeIntoView(ctx, image, candidateBounds, viewBounds, size)) drewBakeImage = true;
  }
  if (!drewBakeImage) {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = Math.max(4, 11 * uiScale) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Nog geen bake", size / 2, size / 2);
  }
  if (config.showModelEntities !== false || config.showScatterInstances === true) {
    for (const entity of snapshot.entities) {
      const isScatter = entity.kind === "scatter" || entity.type === "scatter" || Boolean(entity.scatterId);
      if (isScatter && config.showScatterInstances === false) continue;
      if (!isScatter && entity.kind !== "scatter" && config.showNpcEntities === false) continue;
      const point = resolveMinimapPoint(entity.x, entity.z, viewBounds, size, size, false);
      if (!point) continue;
      drawDiamondMarker(ctx, point.x, point.y, editorMinimapMarkerSize(size, 5), {
        fill: isScatter ? "#7ccf6b" : "#d59bff",
        stroke: "rgba(0,0,0,0.6)",
        lineWidth: markerLineWidth
      });
      const showName = isScatter ? config.showScatterNames === true : config.showEntityNames !== false;
      if (showName) {
        drawMarkerLabel(
          ctx,
          entity.label,
          point.x,
          point.y,
          editorMinimapLabelFontSize(size, 9),
          editorMinimapLabelMaxLength(size, 16),
          editorMinimapMarkerSize(size, 6),
          2.5
        );
      }
    }
  }
  if (config.showInteractables !== false) {
    for (const item of snapshot.interactables) {
      const point = resolveMinimapPoint(item.x, item.z, viewBounds, size, size, false);
      if (!point) continue;
      drawSquareMarker(ctx, point.x, point.y, editorMinimapMarkerSize(size, 4), {
        fill: "#9be870",
        stroke: "rgba(0,0,0,0.6)",
        lineWidth: markerLineWidth
      });
    }
  }
  if (config.showPlayerSpawn !== false && state.viewportWorld?.spawn) {
    const spawn = state.viewportWorld.spawn;
    const point = resolveMinimapPoint(spawn.x, spawn.z, viewBounds, size, size, false);
    if (point) drawCrossMarker(ctx, point.x, point.y, editorMinimapMarkerSize(size, 6), {
      stroke: "#9be870",
      lineWidth: markerLineWidth
    });
  }
  if (config.showSelectedObject !== false && snapshot.selectedEntity) {
    const point = resolveMinimapPoint(snapshot.selectedEntity.x, snapshot.selectedEntity.z, viewBounds, size, size, false);
    if (point) drawDiamondMarker(ctx, point.x, point.y, editorMinimapMarkerSize(size, 7), {
      fill: "#ffe08a",
      stroke: "rgba(0,0,0,0.7)",
      lineWidth: markerLineWidth
    });
  }
  if (config.showEditorCamera !== false) {
    const point = resolveMinimapPoint(snapshot.cameraTarget.x, snapshot.cameraTarget.z, viewBounds, size, size, false);
    if (point) drawDotMarker(ctx, point.x, point.y, editorMinimapMarkerSize(size, 6), {
      fill: "#7bd4ff",
      stroke: "rgba(0,0,0,0.6)",
      lineWidth: markerLineWidth
    });
  }
}

async function duplicateNode(nodeId) {
  await applyGraphMutation(function () {
    return api("/api/editor/nodes/" + nodeId + "/duplicate", { method: "POST" });
  }, {
    historyLabel: "Node gedupliceerd",
    refreshViewport: true,
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
    clearPendingEdge: true,
    refreshViewport: false,
    refreshValidation: false,
    selectedNodeIds: [],
    selectedEdgeIds: [],
    selectedNodeId: null,
    afterApply: function () {
      invalidateDraftWorld();
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
    text.textContent = nodeDisplayTitle(fromNode) + " > " + nodeDisplayTitle(toNode) + (cross ? " (cross-group)" : "");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "x";
    remove.title = "Verwijder verbinding";
    remove.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      void deleteEdge(edge.id);
    });
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
    refreshViewport: false,
    refreshValidation: false,
    selectedEdgeIds: [],
    afterApply: function () {
      invalidateDraftWorld();
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
      invalidateDraftWorld();
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
    refreshValidation: true,
    refreshViewport: true,
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
  syncAssetThumbnailPolling();
  renderInspector();
  renderAssetManageOverlay();
  renderAssetImportPanel();
}

function focusAssetImportForm() {
  if (!el.assetForm || el.assetForm.hidden) return;
  state.assetImportOpen = true;
  renderAssetImportPanel();
  if (typeof el.assetForm.scrollIntoView === "function") {
    el.assetForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const firstField = el.assetForm.querySelector("input, select, button");
  if (firstField && typeof firstField.focus === "function") firstField.focus();
}

function setAssetImportOpen(open) {
  state.assetImportOpen = Boolean(open) && !state.assetUploadBusy;
  renderAssetImportPanel();
}

function setAssetUploadState(nextState) {
  if (Object.prototype.hasOwnProperty.call(nextState || {}, "busy")) state.assetUploadBusy = Boolean(nextState.busy);
  if (Object.prototype.hasOwnProperty.call(nextState || {}, "message")) state.assetUploadMessage = String(nextState.message || "");
  if (Object.prototype.hasOwnProperty.call(nextState || {}, "progressText")) state.assetUploadProgressText = String(nextState.progressText || "");
  if (Object.prototype.hasOwnProperty.call(nextState || {}, "open")) state.assetImportOpen = Boolean(nextState.open) && !state.assetUploadBusy;
  if (Object.prototype.hasOwnProperty.call(nextState || {}, "timings")) state.assetUploadTimings = nextState.timings ? Object.assign({}, nextState.timings) : null;
  if (Object.prototype.hasOwnProperty.call(nextState || {}, "detailsOpen")) state.assetUploadDetailsOpen = Boolean(nextState.detailsOpen);
  if (Object.prototype.hasOwnProperty.call(nextState || {}, "loadCaptureUntil")) state.assetUploadLoadCaptureUntil = Number(nextState.loadCaptureUntil) || 0;
  if (Object.prototype.hasOwnProperty.call(nextState || {}, "tone")) state.assetUploadTone = String(nextState.tone || "");
  if (Object.prototype.hasOwnProperty.call(nextState || {}, "awaitingThumbnail")) state.assetUploadAwaitingThumbnail = Boolean(nextState.awaitingThumbnail);
  if (Object.prototype.hasOwnProperty.call(nextState || {}, "lastAssetId")) state.assetUploadLastAssetId = nextState.lastAssetId ? String(nextState.lastAssetId) : null;
  renderAssetImportPanel();
}

function renderAssetImportPanel() {
  if (el.assetImportToggle) {
    el.assetImportToggle.textContent = state.assetUploadBusy
      ? "Upload bezig..."
      : state.assetImportOpen
        ? "Sluit import"
        : "Importeer asset";
    el.assetImportToggle.disabled = state.assetUploadBusy;
    el.assetImportToggle.setAttribute("aria-expanded", state.assetImportOpen && !state.assetUploadBusy ? "true" : "false");
  }
  if (el.assetForm) {
    const formHidden = !state.assetImportOpen || state.assetUploadBusy;
    el.assetForm.hidden = formHidden;
    for (const control of el.assetForm.querySelectorAll("input, select, button")) {
      control.disabled = state.assetUploadBusy;
    }
  }
  if (el.assetUploadStatus) {
    const hasMessage = Boolean(state.assetUploadMessage);
    const isBusy = Boolean(state.assetUploadBusy);
    el.assetUploadStatus.hidden = !isBusy && !hasMessage;
    el.assetUploadStatus.classList.toggle("busy", isBusy);
    el.assetUploadStatus.classList.toggle("pending", !isBusy && state.assetUploadTone === "pending");
    el.assetUploadStatus.classList.toggle("success", !isBusy && state.assetUploadTone === "success");
    el.assetUploadStatus.classList.toggle("error", !isBusy && state.assetUploadTone === "error");
  }
  if (el.assetUploadProgressText) {
    el.assetUploadProgressText.textContent = state.assetUploadBusy ? state.assetUploadProgressText : "";
  }
  if (el.assetUploadMessage) {
    el.assetUploadMessage.textContent = !state.assetUploadBusy ? state.assetUploadMessage : "";
  }
  const hasTimings = !state.assetUploadBusy && Boolean(state.assetUploadTimings);
  if (el.assetUploadSummary) {
    el.assetUploadSummary.hidden = !hasTimings || !state.assetUploadDetailsOpen;
    el.assetUploadSummary.innerHTML = "";
    if (hasTimings && state.assetUploadDetailsOpen) {
      const timings = state.assetUploadTimings || {};
      const lines = [
        ["Server: " + formatUploadTiming(timings.totalServerMs), "assetUploadSummaryLine"],
        ["Thumbnail: " + formatUploadTiming(timings.thumbnailMs), "assetUploadSummaryLine"],
        ["Browser render: " + formatUploadTiming(timings.renderAssetsMs), "assetUploadSummaryLine"]
      ];
      for (const [text, className] of lines) {
        const line = document.createElement("div");
        line.className = className;
        line.textContent = text;
        el.assetUploadSummary.appendChild(line);
      }
    }
  }
  if (el.assetUploadDetails) {
    el.assetUploadDetails.hidden = !hasTimings;
    el.assetUploadDetails.open = hasTimings && state.assetUploadDetailsOpen;
  }
  if (el.assetUploadDetailsList) {
    el.assetUploadDetailsList.innerHTML = "";
    if (hasTimings) {
      const timings = state.assetUploadTimings || {};
      const rows = [
        ["Upload naar server", formatUploadTiming(timings.responseReceivedMs)],
        ["Response ontvangen", formatUploadTiming(timings.responseProcessedMs)],
        ["Server import", formatUploadTiming(timings.importUploadMs)],
        ["Thumbnail", formatUploadTiming(timings.thumbnailMs)],
        ["Browser render", formatUploadTiming(timings.renderAssetsMs)],
        ["Viewport refresh", formatUploadTiming(timings.refreshViewportMs)],
        ["GLB browser load", formatUploadTiming(timings.glbBrowserLoadMs)],
        ["Total", formatUploadTiming(timings.totalClientMs)]
      ];
      for (const [label, value] of rows) {
        el.assetUploadDetailsList.appendChild(createUploadTimingRow(label, value, value === "n.v.t."));
      }
    }
  }
}

async function postAssetImport(formData) {
  const requestStartedAt = performance.now();
  const response = await fetchEditorApi("/api/assets/import", { method: "POST", body: formData, timeoutMs: 120000 }, "POST");
  const responseReceivedMs = Math.round((performance.now() - requestStartedAt) * 10) / 10;
  const responseBodyStartedAt = performance.now();
  const data = await response.json().catch(function () { return {}; });
  const responseProcessedMs = Math.round((performance.now() - responseBodyStartedAt) * 10) / 10;
  if (!response.ok) throw new Error(data.message || "Upload mislukt.");
  return {
    data: data,
    responseReceivedMs: responseReceivedMs,
    responseProcessedMs: responseProcessedMs
  };
}

function applyImportedAssetData(data) {
  const renderAssetsStartedAt = performance.now();
  state.assets = data.assets || state.assets;
  renderAssets();
  const renderAssetsMs = Math.round((performance.now() - renderAssetsStartedAt) * 10) / 10;
  const newAsset = data.asset || null;
  const newAssetStatus = assetThumbnailStatus(newAsset);
  const awaitingThumbnail = Boolean(newAsset && newAsset.assetType === "model" && (newAssetStatus === "pending" || newAssetStatus === "processing"));
  state.assetUploadAwaitingThumbnail = awaitingThumbnail;
  state.assetUploadLastAssetId = newAsset && newAsset.id ? String(newAsset.id) : null;
  syncAssetThumbnailPolling();
  renderInspector();
  renderAssetManageOverlay();
  return {
    newAsset: newAsset,
    awaitingThumbnail: awaitingThumbnail,
    renderAssetsMs: renderAssetsMs
  };
}

function renderAssets() {
  const startedAt = performance.now();
  try {
    if (!el.assetGrid) return;
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
    el.assetGrid.classList.toggle("empty", !list.length);
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "assetEmptyState";
      const title = document.createElement("div");
      title.className = "assetEmptyStateTitle";
      title.textContent = state.assets.length ? "Geen assets gevonden" : "Nog geen assets";
      const text = document.createElement("div");
      text.className = "assetEmptyStateText";
      text.textContent = state.assets.length
        ? "Pas zoekterm of filters aan."
        : "Sleep GLB, PNG, JPG, WEBP, MP3, WAV of JSON hierheen.";
      empty.append(title, text);
      el.assetGrid.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const asset of list) fragment.appendChild(buildAssetCard(asset));
    el.assetGrid.appendChild(fragment);
  } finally {
    logTiming("renderAssets", startedAt);
  }
}

function buildAssetCard(asset) {
  const card = document.createElement("div");
  card.className = "assetCard";
  card.dataset.assetId = asset.id;
  if (state.mobileSelectedAssetId === asset.id) card.classList.add("selected");
  card.draggable = asset.assetType === "model";
  const animationNames = animationClipsForAsset(asset).map(function (entry) { return entry.name; });
  const titleParts = [asset.name, asset.assetType, asset.category];
  if (asset.assetType === "model" && animationNames.length) titleParts.push(animationNames.join(", "));
  card.title = titleParts.filter(Boolean).join(" · ");
  function placeAtCameraCenter() {
    // Place immediately at the camera's ground position and stay on whichever tab/pane
    // you're already on (incl. "All") - only jump to the dedicated 3D tab if the
    // viewport isn't visible anywhere yet, so you can actually see the result.
    void placeModel(asset.id, editorCameraCenterModelPosition());
    if (!isViewportPaneVisible()) setMobilePanel("viewport");
  }
  card.addEventListener("dragstart", function (event) {
    event.dataTransfer.setData("text/gk-asset", asset.id);
  });
  let dragHandle = null;
  if (asset.assetType === "model") {
    dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "assetDragHandle";
    dragHandle.draggable = false;
    dragHandle.textContent = "✥";
    dragHandle.title = "Sleep naar de 3D-viewport";
    dragHandle.setAttribute("aria-label", "Sleep naar de 3D-viewport");
    // A touchmove that starts directly on the scrollable card can lose the race to the
    // browser's own native scroll of the asset grid - by the time our pointermove handler
    // below decides "this is a drag, not a scroll", the browser may already have committed
    // to scrolling and stopped listening. touch-action: none on this dedicated handle (not
    // the whole card) means a touch starting *here* is never eligible for native scroll in
    // the first place, so there's no race to lose - the rest of the card stays scrollable.
    dragHandle.addEventListener("dragstart", function (event) {
      event.preventDefault();
      event.stopPropagation();
    });
    // Mouse: a plain click on the handle (no native drag involved) places at the camera,
    // same as touch's "pressed and released without dragging" case below.
    dragHandle.addEventListener("click", function (event) {
      event.stopPropagation();
      placeAtCameraCenter();
    });
    dragHandle.addEventListener("pointerdown", function (event) {
      if (event.pointerType !== "touch") return;
      event.preventDefault();
      event.stopPropagation();
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      const ghost = document.createElement("div");
      ghost.className = "assetDragGhost";
      if (asset.thumbnailPath) {
        const img = document.createElement("img");
        img.src = asset.thumbnailPath;
        ghost.appendChild(img);
      } else {
        ghost.textContent = asset.name;
      }
      document.body.appendChild(ghost);
      function positionGhost(clientX, clientY) {
        ghost.style.left = clientX + "px";
        ghost.style.top = clientY + "px";
      }
      function overViewport(clientX, clientY) {
        if (!el.viewportCanvas || !isViewportPaneVisible()) return false;
        return elementContainsPoint(el.viewportCanvas, clientX, clientY);
      }
      positionGhost(event.clientX, event.clientY);
      function onMove(moveEvent) {
        if (moveEvent.pointerId !== pointerId) return;
        moveEvent.preventDefault();
        positionGhost(moveEvent.clientX, moveEvent.clientY);
        if (el.viewportCanvas) el.viewportCanvas.classList.toggle("dropHint", overViewport(moveEvent.clientX, moveEvent.clientY));
      }
      function finish(finalEvent, cancelled) {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onCancel, true);
        ghost.remove();
        if (el.viewportCanvas) el.viewportCanvas.classList.remove("dropHint");
        if (cancelled) return;
        if (overViewport(finalEvent.clientX, finalEvent.clientY) && runtime && typeof runtime.screenToGround === "function") {
          const ground = runtime.screenToGround(finalEvent.clientX, finalEvent.clientY) || editorCameraCenterModelPosition();
          void placeModel(asset.id, ground);
        } else if (Math.hypot(finalEvent.clientX - startX, finalEvent.clientY - startY) < 10) {
          // Pressed and released the handle in place, without really dragging - same
          // intent as a mouse click on it.
          placeAtCameraCenter();
        }
      }
      function onUp(upEvent) { if (upEvent.pointerId === pointerId) finish(upEvent, false); }
      function onCancel(cancelEvent) { if (cancelEvent.pointerId === pointerId) finish(cancelEvent, true); }
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onCancel, true);
    });
  }
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
  const thumbBadgeLabel = assetThumbnailBadgeLabel(asset);
  if (asset.assetType === "model" && thumbBadgeLabel) {
    const badge = document.createElement("span");
    badge.className = "assetThumbStatus " + assetThumbnailStatusTone(asset);
    badge.textContent = thumbBadgeLabel;
    thumb.appendChild(badge);
  }
  if (asset.assetType === "model" && Number(asset?.metadata?.animationCount || 0) > 0) {
    const animCount = document.createElement("span");
    animCount.className = "assetAnimCount";
    animCount.textContent = animationCountText(asset);
    animCount.title = animationNames.length ? animationNames.join(", ") : "";
    thumb.appendChild(animCount);
  }
  const meta = document.createElement("div");
  meta.className = "assetMeta";
  const name = document.createElement("div");
  name.className = "assetName";
  name.textContent = asset.name;
  const sub = document.createElement("div");
  sub.className = "assetSub";
  const cat = document.createElement("span");
  cat.textContent = asset.category || "uncategorized";
  sub.title = asset.assetType + " · " + Math.max(1, Math.round(Number(asset.sizeBytes || 0) / 1024)) + " KB";
  sub.append(cat);
  meta.append(name, sub);
  card.append(thumb, meta);
  const menu = document.createElement("button");
  menu.type = "button";
  menu.className = "assetMenuButton";
  menu.draggable = false;
  menu.textContent = "...";
  menu.title = "Beheer asset";
  menu.setAttribute("aria-label", "Beheer asset");
  menu.addEventListener("pointerdown", function (event) {
    event.preventDefault();
    event.stopPropagation();
  });
  menu.addEventListener("dragstart", function (event) {
    event.preventDefault();
    event.stopPropagation();
  });
  menu.addEventListener("click", function (event) {
    event.stopPropagation();
    openAssetManageOverlay(asset.id);
  });
  card.appendChild(menu);
  if (dragHandle) card.appendChild(dragHandle);
  return card;
}

function editorCameraCenterModelPosition() {
  const point = editorCameraGroundPoint();
  if (point) return point;
  const fallback = viewportCenterWorldValues("model_entity");
  const x = Number(fallback.x);
  const z = Number(fallback.z);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: terrainGroundY(),
    z: Number.isFinite(z) ? z : 0
  };
}

async function placeModel(assetId, position) {
  const startedAt = performance.now();
  // No zone open in the Nodes graph to place into - falling back straight to root put
  // every drag-dropped asset there regardless of where in the world it visually landed.
  // Prefer whichever zone's own bounds actually contain the drop position instead.
  const fallbackZone = state.currentGroupId ? null : zoneCanvasGroupContainingPoint(position?.x, position?.z);
  const requestedParentId = state.currentGroupId || fallbackZone?.id || null;
  let createdNodeId = null;
  try {
    await applyGraphMutation(function () {
      return api("/api/editor/place-model-asset", {
        method: "POST",
        body: JSON.stringify({ assetId: assetId, position: position, parentId: requestedParentId })
      });
    }, {
      historyLabel: "Model geplaatst",
      refreshViewport: true,
      refreshValidation: true,
      afterApply: function (_, result) {
        createdNodeId = result?.nodeId || null;
        if (createdNodeId) selectNode(createdNodeId, true);
        setStatus("Model geplaatst.", "success");
      }
    });
    if (createdNodeId && isZoneCanvasGroup(nodeById(requestedParentId))) {
      await autoWireZoneCanvasNode(requestedParentId, createdNodeId);
    }
  } finally {
    logTiming("placeModel", startedAt, "asset=" + assetId);
  }
}

if (el.authoringButton) {
  el.authoringButton.addEventListener("click", toggleAuthoringMenu);
}
if (el.authoringBackButton) {
  el.authoringBackButton.addEventListener("click", clearAuthoringRoute);
}
if (el.nodeLibraryToggle) {
  el.nodeLibraryToggle.addEventListener("click", function () {
    state.nodeLibraryOpen = !state.nodeLibraryOpen;
    renderAuthoringHub();
  });
}
if (el.nodeLibraryModeToggle) {
  el.nodeLibraryModeToggle.addEventListener("click", function () {
    state.nodeLibraryAdvanced = !state.nodeLibraryAdvanced;
    renderAuthoringHub();
  });
}
el.assetSearch.addEventListener("input", function () { state.assetSearch = el.assetSearch.value; renderAssets(); });
if (el.nodeLibrarySearch) el.nodeLibrarySearch.addEventListener("input", renderAuthoringHub);
if (el.assetGrid) {
  // Extra defense alongside the -webkit-touch-callout CSS on .assetCard - suppresses the
  // native context menu even if a browser's touch-and-hold-to-right-click conversion
  // (see buildAssetCard's touch pointerdown handling) still fires it.
  el.assetGrid.addEventListener("contextmenu", function (event) { event.preventDefault(); });
}
if (el.assetControlsToggle && el.assetControls) {
  el.assetControlsToggle.addEventListener("click", function (event) {
    event.stopPropagation();
    const nextOpen = el.assetControls.hidden;
    el.assetControls.hidden = !nextOpen;
    el.assetControlsToggle.classList.toggle("active", nextOpen);
    el.assetControlsToggle.setAttribute("aria-expanded", String(nextOpen));
  });
  document.addEventListener("click", function (event) {
    if (el.assetControls.hidden) return;
    if (el.assetControls.contains(event.target) || el.assetControlsToggle.contains(event.target)) return;
    el.assetControls.hidden = true;
    el.assetControlsToggle.classList.remove("active");
    el.assetControlsToggle.setAttribute("aria-expanded", "false");
  });
}
el.assetSort.addEventListener("change", function () { state.assetSort = el.assetSort.value; renderAssets(); });
el.assetFilter.addEventListener("change", function () { state.assetFilter = el.assetFilter.value; renderAssets(); });
if (el.assetCardSize) {
  el.assetCardSize.addEventListener("input", function () {
    applyAssetCardSize(el.assetCardSize.value);
  });
}
if (el.viewportAuthoringIndicatorToggle) {
  el.viewportAuthoringIndicatorToggle.addEventListener("click", function () {
    state.authoringIndicatorsEnabled = !state.authoringIndicatorsEnabled;
    storeAuthoringIndicators(state.authoringIndicatorsEnabled);
    renderViewportControls();
  });
}
if (el.assetImportToggle) {
  el.assetImportToggle.addEventListener("click", function () {
    if (state.assetUploadBusy) return;
    setAssetImportOpen(!state.assetImportOpen);
    if (state.assetImportOpen) focusAssetImportForm();
  });
}
if (el.assetUploadDetails) {
  el.assetUploadDetails.addEventListener("toggle", function () {
    state.assetUploadDetailsOpen = Boolean(el.assetUploadDetails.open);
    renderAssetImportPanel();
  });
}

if (el.assetForm) {
  el.assetForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (state.assetUploadBusy) return;
    const formData = new FormData(el.assetForm);
    if (assetUploadProgressTimer) clearTimeout(assetUploadProgressTimer);
    const startedAt = performance.now();
    console.info("[timing] client upload submit start");
    setAssetUploadState({
      busy: true,
      message: "",
      progressText: "Uploaden...",
      open: false,
      timings: null,
      detailsOpen: false,
      loadCaptureUntil: 0,
      tone: "busy",
      awaitingThumbnail: false,
      lastAssetId: null
    });
    assetUploadProgressTimer = setTimeout(function () {
      if (!state.assetUploadBusy) return;
      setAssetUploadState({ progressText: "Thumbnail maken... dit kan even duren" });
    }, 700);
    try {
      const response = await postAssetImport(formData);
      const data = response.data || {};
      const serverTimings = data.timings || {};
      const imported = applyImportedAssetData(data);
      const newAsset = imported.newAsset;
      const totalClientMs = Math.round((performance.now() - startedAt) * 10) / 10;
      const awaitingThumbnail = imported.awaitingThumbnail;
      el.assetForm.reset();
      setAssetUploadState({
        busy: false,
        message: awaitingThumbnail ? "Thumbnail wordt gemaakt..." : assetThumbnailStatusMessage(newAsset) || "Upload klaar",
        progressText: "Upload klaar",
        open: false,
        tone: awaitingThumbnail ? "pending" : "success",
        timings: {
          uploadSubmitMs: totalClientMs,
          responseReceivedMs: response.responseReceivedMs,
          responseProcessedMs: response.responseProcessedMs,
          importUploadMs: serverTimings.importUploadMs === null || serverTimings.importUploadMs === undefined ? null : Number(serverTimings.importUploadMs),
          thumbnailMs: serverTimings.thumbnailMs === null || serverTimings.thumbnailMs === undefined ? null : Number(serverTimings.thumbnailMs),
          totalServerMs: serverTimings.totalServerMs === null || serverTimings.totalServerMs === undefined ? null : Number(serverTimings.totalServerMs),
          renderAssetsMs: imported.renderAssetsMs,
          refreshViewportMs: null,
          glbBrowserLoadMs: null,
          totalClientMs: totalClientMs
        },
        detailsOpen: false,
        loadCaptureUntil: performance.now() + 8000
      });
      setStatus(awaitingThumbnail ? "Asset opgeslagen. Thumbnail wordt gemaakt..." : "Upload klaar.", "success");
    } catch (error) {
      setAssetUploadState({
        busy: false,
        message: error.message,
        progressText: "",
        open: false,
        timings: null,
        detailsOpen: false,
        loadCaptureUntil: 0,
        tone: "error",
        awaitingThumbnail: false,
        lastAssetId: null
      });
      if (el.assetForm) focusAssetImportForm();
      setStatus(error.message, "error");
    } finally {
      logTiming("client upload submit end", startedAt);
      if (assetUploadProgressTimer) clearTimeout(assetUploadProgressTimer);
      assetUploadProgressTimer = null;
    }
  });
}

async function uploadDroppedAssets(files) {
  if (state.assetUploadBusy) return;
  const fileList = Array.from(files || []).filter(function (file) {
    return file && file.name;
  });
  if (!fileList.length) return;
  if (assetUploadProgressTimer) clearTimeout(assetUploadProgressTimer);
  const startedAt = performance.now();
  let successCount = 0;
  let failedCount = 0;
  let pendingThumbnailCount = 0;
  let lastPendingAssetId = null;
  console.info("[timing] client drop upload start");
  setAssetUploadState({
    busy: true,
    message: "",
    progressText: "Uploaden...",
    open: false,
    timings: null,
    detailsOpen: false,
    loadCaptureUntil: 0,
    tone: "busy",
    awaitingThumbnail: false,
    lastAssetId: null
  });
  assetUploadProgressTimer = setTimeout(function () {
    if (!state.assetUploadBusy) return;
    setAssetUploadState({ progressText: "Thumbnail maken... dit kan even duren" });
  }, 700);
  try {
    for (let index = 0; index < fileList.length; index += 1) {
      const file = fileList[index];
      const progressText = (index + 1) + " / " + fileList.length;
      const assetType = inferAssetTypeFromFile(file);
      if (!assetType) {
        failedCount += 1;
        setAssetUploadState({
          progressText: progressText,
          message: file.name + ": niet ondersteund bestandstype."
        });
        continue;
      }
      setAssetUploadState({
        progressText: progressText,
        message: file.name
      });
      const formData = new FormData();
      formData.append("name", assetNameFromFile(file));
      formData.append("category", "uncategorized");
      formData.append("assetType", assetType);
      formData.append("file", file);
      try {
        const response = await postAssetImport(formData);
        const data = response.data || {};
        const imported = applyImportedAssetData(data);
        successCount += 1;
        if (imported.awaitingThumbnail) {
          pendingThumbnailCount += 1;
          lastPendingAssetId = imported.newAsset && imported.newAsset.id ? String(imported.newAsset.id) : lastPendingAssetId;
        }
        setAssetUploadState({
          progressText: progressText,
          message: imported.awaitingThumbnail ? file.name + ": thumbnail wordt gemaakt..." : file.name + " geüpload"
        });
      } catch (error) {
        failedCount += 1;
        setAssetUploadState({
          progressText: progressText,
          message: file.name + ": " + error.message
        });
      }
    }
  } finally {
    if (assetUploadProgressTimer) clearTimeout(assetUploadProgressTimer);
    assetUploadProgressTimer = null;
    if (pendingThumbnailCount > 0) {
      state.assetUploadAwaitingThumbnail = true;
      state.assetUploadLastAssetId = lastPendingAssetId;
      syncAssetThumbnailPolling();
    }
    const totalClientMs = Math.round((performance.now() - startedAt) * 10) / 10;
    const summaryParts = [];
    if (successCount) summaryParts.push(successCount + " geüpload");
    if (failedCount) summaryParts.push(failedCount + " mislukt");
    if (!summaryParts.length) summaryParts.push("Geen geldige bestanden");
    const summary = summaryParts.join(", ");
    const finalMessage = pendingThumbnailCount ? summary + ". Thumbnails worden gemaakt..." : summary;
    const tone = failedCount ? "error" : pendingThumbnailCount ? "pending" : "success";
    setAssetUploadState({
      busy: false,
      message: finalMessage,
      progressText: "Upload klaar",
      open: false,
      timings: null,
      detailsOpen: false,
      loadCaptureUntil: 0,
      tone: tone,
      awaitingThumbnail: pendingThumbnailCount > 0,
      lastAssetId: lastPendingAssetId
    });
    setStatus(finalMessage, failedCount ? "error" : "success");
    logTiming("client drop upload end", startedAt, "count=" + fileList.length + " total=" + totalClientMs + "ms");
  }
}

function handleViewportAssetPlacementPointerDown(event) {
  if (!state.mobileSelectedAssetId || !runtime || !terrainCanvasTarget(event)) return;
  if (event.button !== undefined && event.button !== 0) return;
  if (event.pointerType === "touch" && viewportTouchEditSuppress) return;
  if (runtimeTransformActive() || terrainHasActiveSession() || scatterHasActiveSession()) return;
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
  viewportAssetPointer = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY
  };
  terrainRememberPointer(event);
}

function handleViewportAssetPlacementPointerEnd(event) {
  if (!viewportAssetPointer || event.pointerId !== viewportAssetPointer.pointerId) return;
  if (updateViewportTouchEditState(event)) {
    cancelViewportTouchEditSessionsForPan();
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
  const start = viewportAssetPointer;
  viewportAssetPointer = null;
  if (event.type === "pointercancel") return;
  const moved = Math.hypot(event.clientX - start.startX, event.clientY - start.startY);
  if (moved > 16) {
    setStatus("Sleep geannuleerd; tik kort in 3D om het model te plaatsen.", "");
    return;
  }
  const assetId = state.mobileSelectedAssetId;
  const ground = runtime && typeof runtime.screenToGround === "function"
    ? runtime.screenToGround(event.clientX, event.clientY)
    : null;
  if (!assetId || !ground || !Number.isFinite(ground.x) || !Number.isFinite(ground.z)) {
    setStatus("Geen ground hit om model te plaatsen.", "error");
    return;
  }
  setMobileSelectedAsset(null);
  void placeModel(assetId, { x: ground.x, y: Number(ground.y) || 0, z: ground.z });
}

// Drag asset to viewport to place at clicked ground position.
if (el.assetColumn) {
  el.assetColumn.addEventListener("dragenter", function (event) {
    if (!isFileDragEvent(event)) return;
    event.preventDefault();
    showAssetDropOverlay();
  });
  el.assetColumn.addEventListener("dragover", function (event) {
    if (!isFileDragEvent(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    if (el.assetDropOverlay) el.assetDropOverlay.hidden = false;
  });
  el.assetColumn.addEventListener("dragleave", function (event) {
    const nextTarget = event.relatedTarget;
    if (nextTarget && el.assetColumn.contains(nextTarget)) return;
    assetColumnDropDepth = Math.max(0, assetColumnDropDepth - 1);
    if (assetColumnDropDepth <= 0) hideAssetDropOverlay();
  });
  el.assetColumn.addEventListener("drop", function (event) {
    event.preventDefault();
    hideAssetDropOverlay();
    // Unlike dragenter/dragover above, this had no isFileDragEvent() guard - dropping
    // anything else onto the asset browser (an asset card's own "text/gk-asset" drag, a
    // stray native image drag, ...) fell through into uploadDroppedAssets regardless.
    // uploadDroppedAssets no-ops on an empty file list, but there's no reason to rely on
    // that alone when this is never meant to run for a non-file drop in the first place.
    if (!isFileDragEvent(event)) return;
    uploadDroppedAssets(event.dataTransfer && event.dataTransfer.files);
  });
}
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
el.viewportCanvas.addEventListener("pointerdown", handleViewportAssetPlacementPointerDown, true);
window.addEventListener("pointerup", handleViewportAssetPlacementPointerEnd, true);
window.addEventListener("pointercancel", handleViewportAssetPlacementPointerEnd, true);

// ---------- Viewport + validation ----------
function applyViewportWorld(world) {
  state.viewportWorld = world || null;
  if (runtime) runtime.setWorld(world);
  el.viewportStatus.textContent = world && world.world && world.world.displayName ? world.world.displayName : "Draft viewport";
  state.viewportDirty = false;
  clearViewportRefreshTimer();
  syncRuntimeSelection();
  renderViewportControls();
  redrawEditorMinimap();
}

async function refreshViewport(options = {}) {
  await graphMutationQueue;
  if (!options.force && !state.viewportDirty) return null;
  const startedAt = performance.now();
  try {
    const world = await api("/api/editor/draft-world");
    applyViewportWorld(world);
    return world;
  } catch (error) {
    setStatus(error.message, "error");
    return null;
  } finally {
    const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
    captureUploadViewportRefreshTiming(durationMs);
    logTiming("refreshViewport", startedAt, "force=" + Boolean(options.force));
  }
}

function renderViewportErrors(errors) {
  el.viewportErrors.innerHTML = "";
  for (const message of errors) {
    const div = document.createElement("div");
    div.className = "err";
    div.textContent = "Laadfout: " + validationIssueText(message);
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
      el.validationPanel.appendChild(renderValidationIssue("error", message));
    }
    for (const message of result.warnings || []) {
      el.validationPanel.appendChild(renderValidationIssue("warning", message));
    }
    el.publishButton.disabled = !result.ok;
    el.publishButton.style.opacity = result.ok ? "1" : "0.5";
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function reconnectEditor() {
  if (state.connection.reconnecting) return;
  clearConnectionRecoveryTimer();
  state.connection.reconnecting = true;
  state.connection.lastError = "";
  state.connection.status = "standby";
  renderConnectionStatus();
  setStatus("Opnieuw verbinden met de server...", "");
  try {
    await pingEditorServer(6000);
    await reloadGraph({ timeoutMs: 10000 });
    state.connection.lastOkAt = Date.now();
    state.connection.lastError = "";
    state.connection.status = "connected";
    setStatus("Editor opnieuw verbonden.", "success");
    void refreshValidation();
  } catch (error) {
    editorConnectionRequestFailed(error);
    setStatus("Reconnect mislukt: " + (error?.message || String(error)), "error");
  } finally {
    state.connection.reconnecting = false;
    updateConnectionStatusFromState();
  }
}

// ---------- Save / publish / logout ----------
if (el.connectionButton) el.connectionButton.addEventListener("click", reconnectEditor);
el.saveDraftButton.addEventListener("click", saveDraft);
el.publishButton.addEventListener("click", publish);
if (el.undoButton) el.undoButton.addEventListener("click", undoGraphMutation);
if (el.redoButton) el.redoButton.addEventListener("click", redoGraphMutation);
el.logoutButton.addEventListener("click", async function () {
  await api("/api/auth/logout", { method: "POST" }).catch(function () {});
  window.location.href = "/login/";
});
window.addEventListener("pagehide", function () {
  commitActiveEditorControl();
  if (runtime && typeof runtime.flushEditorCameraSave === "function") runtime.flushEditorCameraSave();
});
window.addEventListener("offline", function () {
  clearConnectionRecoveryTimer();
  state.connection.pending = 0;
  state.connection.lastError = "browser offline";
  state.connection.status = "disconnected";
  renderConnectionStatus();
});
window.addEventListener("online", function () {
  state.connection.lastError = "";
  state.connection.status = state.connection.lastOkAt ? "connected" : "standby";
  renderConnectionStatus();
  scheduleConnectionRecovery(1000);
});
startConnectionHeartbeat();

async function saveDraft() {
  clearAutoSaveDraftTimer();
  try {
    await flushPendingEditorWrites();
    await apiOk("/api/editor/save-draft", { method: "POST" });
    clearUnsaved();
    state.viewportDirty = false;
    clearViewportRefreshTimer();
    setStatus("Draft opgeslagen.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function publish() {
  clearAutoSaveDraftTimer();
  try {
    await flushPendingEditorWrites();
    await apiOk("/api/editor/publish", { method: "POST" });
    clearUnsaved();
    state.viewportDirty = false;
    clearViewportRefreshTimer();
    setStatus("Gepubliceerd naar de game.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

// ---------- Terrain tool ----------
function terrainCanvasTarget(event) {
  return Boolean(el.viewportCanvas) && event && event.target === el.viewportCanvas;
}

function captureViewportEditPointer(pointerId) {
  if (!el.viewportCanvas || pointerId === null || pointerId === undefined) return;
  try { el.viewportCanvas.setPointerCapture?.(pointerId); } catch {}
}

function releaseViewportEditPointer(pointerId) {
  if (!el.viewportCanvas || pointerId === null || pointerId === undefined) return;
  try {
    if (!el.viewportCanvas.hasPointerCapture || el.viewportCanvas.hasPointerCapture(pointerId)) {
      el.viewportCanvas.releasePointerCapture?.(pointerId);
    }
  } catch {}
}

function suppressNextViewportRuntimeClick() {
  suppressViewportRuntimeClickUntil = Date.now() + 5000;
}

function consumeSuppressedViewportRuntimeClick(event) {
  if (Date.now() > suppressViewportRuntimeClickUntil) return;
  suppressViewportRuntimeClickUntil = 0;
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
}

el.viewportCanvas.addEventListener("click", consumeSuppressedViewportRuntimeClick, true);

function terrainPointerWithinViewport(event) {
  if (!event || !el.viewportCanvas) return false;
  const rect = el.viewportCanvas.getBoundingClientRect();
  const x = Number(event.clientX);
  const y = Number(event.clientY);
  return Number.isFinite(x) && Number.isFinite(y)
    && x >= rect.left && x <= rect.right
    && y >= rect.top && y <= rect.bottom;
}

function syncViewportTouchPointer(event) {
  if (runtime && typeof runtime.trackViewportTouchPointer === "function") {
    runtime.trackViewportTouchPointer(event);
  }
}

function cancelViewportTouchEditSessionsForPan() {
  clearPointLongPress();
  clearTouchGrabConfirm();
  clearTouchEmptyDeselectSession();
  viewportAssetPointer = null;
  // Same reasoning as editorContextMenuHandler/editorPointerDownCaptureHandler in the
  // runtime: this fires whenever a second touch makes updateViewportTouchEditState think
  // a pan/pinch is starting, which used to cancel a runtime transform unconditionally -
  // including a toolbar-button-started Rotate/Scale whose first driving touch hasn't
  // produced any real preview yet, long before a second finger is even involved.
  const transformDebug = runtimeTransformDebugState();
  if (runtimeTransformActive() && (transformDebug?.previews || 0) > 0) cancelRuntimeTransform();
  if (scatterHasActiveSession() && state.scatterTool.dragPointerId !== null) scatterCancelActiveSession();
  if (terrainHasActiveSession() && state.terrainTool.dragPointerId !== null) terrainCancelActiveSession();
}

function clearViewportTouchEditState() {
  viewportTouchEditPointers.clear();
  viewportTouchEditSuppress = false;
  viewportAssetPointer = null;
  clearTouchEmptyDeselectSession();
}

function updateViewportTouchEditState(event) {
  if (!event || event.pointerType !== "touch" || event.pointerId === undefined) return false;
  const pointerId = event.pointerId;
  if (event.type === "pointerdown") {
    if (!terrainCanvasTarget(event)) return viewportTouchEditSuppress;
    viewportTouchEditPointers.add(pointerId);
    syncViewportTouchPointer(event);
    if (viewportTouchEditPointers.size > 1) viewportTouchEditSuppress = true;
    return viewportTouchEditSuppress;
  }
  if (!viewportTouchEditPointers.has(pointerId)) return viewportTouchEditSuppress;
  const wasSuppressed = viewportTouchEditSuppress;
  syncViewportTouchPointer(event);
  if (event.type === "pointerup" || event.type === "pointercancel") {
    viewportTouchEditPointers.delete(pointerId);
    if (viewportTouchEditPointers.size === 0) viewportTouchEditSuppress = false;
  }
  return wasSuppressed || viewportTouchEditSuppress;
}

function terrainRememberPointer(event) {
  if (!event) return;
  if (!terrainPointerWithinViewport(event)) return;
  terrainLastPointer = {
    clientX: Number(event.clientX) || 0,
    clientY: Number(event.clientY) || 0,
    pointerId: Number.isFinite(Number(event.pointerId)) ? Number(event.pointerId) : null
  };
}

function terrainGroundPointFromClient(clientX, clientY) {
  if (!runtime || typeof runtime.screenToGround !== "function") return null;
  const ground = runtime.screenToGround(clientX, clientY);
  if (!ground || !Number.isFinite(ground.x) || !Number.isFinite(ground.z)) return null;
  return { x: ground.x, z: ground.z };
}

function terrainGroundPointFromEvent(event) {
  return terrainGroundPointFromClient(event.clientX, event.clientY);
}

function pointLinePickRadius(event) {
  if (event?.pointerType === "touch") return 42;
  if (event?.pointerType === "pen") return 30;
  return 18;
}

function distanceSqToScreenSegment(px, py, a, b) {
  const ax = Number(a?.x);
  const ay = Number(a?.y);
  const bx = Number(b?.x);
  const by = Number(b?.y);
  if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) return Infinity;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = (dx * dx) + (dy * dy);
  const t = lenSq > 0
    ? Math.max(0, Math.min(1, (((px - ax) * dx) + ((py - ay) * dy)) / lenSq))
    : 0;
  const cx = ax + (dx * t);
  const cy = ay + (dy * t);
  const ox = px - cx;
  const oy = py - cy;
  return (ox * ox) + (oy * oy);
}

function pointLineInsertHitFromEvent(points, yForPoint, closed, event) {
  if (!runtime || typeof runtime.worldToScreen !== "function") return null;
  if (!Array.isArray(points) || points.length < 2 || !event) return null;
  const clientX = Number(event.clientX);
  const clientY = Number(event.clientY);
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const screens = points.map(function (point, index) {
    const x = Number(point?.x);
    const z = Number(point?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const y = Number(yForPoint(point, index));
    return runtime.worldToScreen({ x: x, y: Number.isFinite(y) ? y : 0, z: z });
  });
  const segmentCount = closed && points.length >= 3 ? points.length : points.length - 1;
  const radius = pointLinePickRadius(event);
  let best = null;
  let bestDistanceSq = radius * radius;
  for (let index = 0; index < segmentCount; index += 1) {
    const nextIndex = (index + 1) % points.length;
    const a = screens[index];
    const b = screens[nextIndex];
    if (!a || !b) continue;
    const distanceSq = distanceSqToScreenSegment(clientX, clientY, a, b);
    if (distanceSq <= bestDistanceSq) {
      bestDistanceSq = distanceSq;
      best = {
        pointIndex: index,
        insertIndex: index + 1,
        nextPointIndex: nextIndex,
        distanceSq: distanceSq
      };
    }
  }
  return best;
}

function terrainLineInsertHitFromEvent(node, event) {
  const points = terrainNodePoints(node);
  return pointLineInsertHitFromEvent(
    points,
    function (point) {
      return node?.type === "walkable_surface"
        ? terrainPointHeight(point, terrainGroundY())
        : terrainGroundY();
    },
    terrainNodeCapabilities(node).closedLoop,
    event
  );
}

function scatterLineInsertHitFromEvent(node, event) {
  return pointLineInsertHitFromEvent(
    scatterNodePoints(node),
    function () { return terrainGroundY(); },
    true,
    event
  );
}

function terrainHandlePickRadius(event) {
  if (event?.pointerType === "touch") return 34;
  if (event?.pointerType === "pen") return 24;
  return 0;
}

function terrainHandleFromEvent(event) {
  if (!runtime || typeof runtime.pickTerrainEditorHandle !== "function") return null;
  return runtime.pickTerrainEditorHandle(event.clientX, event.clientY, terrainHandlePickRadius(event));
}

function scatterHandleFromEvent(event) {
  if (!runtime || typeof runtime.pickScatterEditorHandle !== "function") return null;
  return runtime.pickScatterEditorHandle(event.clientX, event.clientY, terrainHandlePickRadius(event));
}

function terrainRenderOverlayPreview() {
  const overlay = terrainOverlayState();
  if (overlay) pushTerrainOverlay(overlay);
}

function scatterRenderOverlayPreview() {
  if (!runtime || typeof runtime.setScatterEditorOverlay !== "function") return;
  const overlay = scatterOverlayState();
  if (overlay) runtime.setScatterEditorOverlay(overlay);
  else if (typeof runtime.clearScatterEditorOverlay === "function") runtime.clearScatterEditorOverlay();
}

function terrainFinishWithRender() {
  renderViewportControls();
}

// Generic fallback for any node type that stores a plain world-space x/z (optionally
// y) position but has no runtime mesh to select/frame - Location Anchor, Player Spawn,
// and anything else with coordinate fields, present or future, without hardcoding types.
function nodeCoordinatePoint(node) {
  const fields = state.nodeTypes?.[node?.type]?.fields;
  if (!fields || !fields.x || !fields.z) return null;
  const x = Number(node.values?.x);
  const z = Number(node.values?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const y = fields.y ? Number(node.values?.y) : NaN;
  return { x: x, y: Number.isFinite(y) ? y : terrainGroundY(), z: z };
}

function focusTerrainOrSelected() {
  if (!runtime) return;
  const scatterNode = selectedScatterNode();
  if (scatterNode) {
    const summary = scatterSelectedNodeSummary();
    const points = summary?.points || [];
    if (!points.length) {
      if (typeof runtime.focusSelected === "function") runtime.focusSelected();
      return;
    }
    const selectedIdx = state.scatterTool.selectedPointIndex;
    const groundY = terrainGroundY();
    if (Number.isInteger(selectedIdx) && selectedIdx >= 0 && selectedIdx < points.length) {
      const p = points[selectedIdx];
      if (typeof runtime.frameWorldPoints === "function") {
        runtime.frameWorldPoints([{ x: p.x, y: groundY, z: p.z }]);
      }
      return;
    }
    const positions = points.map(function (p) { return { x: p.x, y: groundY, z: p.z }; });
    if (typeof runtime.frameWorldPoints === "function") runtime.frameWorldPoints(positions);
    return;
  }
  const node = selectedTerrainNode();
  if (node) {
    const capabilities = terrainNodeCapabilities(node);
    const groundY = terrainGroundY();
    if (capabilities.walkableSurface || capabilities.polygonEditable || capabilities.pointEditing) {
      const points = terrainNodePoints(node);
      if (points.length) {
        const selectedIdx = state.terrainTool.selectedPointIndex;
        if (Number.isInteger(selectedIdx) && selectedIdx >= 0 && selectedIdx < points.length) {
          const p = points[selectedIdx];
          if (typeof runtime.frameWorldPoints === "function") {
            runtime.frameWorldPoints([{
              x: p.x,
              y: node.type === "walkable_surface" ? terrainPointHeight(p, groundY) : groundY,
              z: p.z
            }]);
          }
          return;
        }
        const positions = points.map(function (p) {
          return {
            x: p.x,
            y: node.type === "walkable_surface" ? terrainPointHeight(p, groundY) : groundY,
            z: p.z
          };
        });
        if (typeof runtime.frameWorldPoints === "function") runtime.frameWorldPoints(positions);
        return;
      }
    }
  }
  const selectedNode = node || nodeById(state.selectedNodeId);
  if (selectedNode) {
    const focused = typeof runtime.focusSelected === "function" ? runtime.focusSelected() : false;
    if (focused) return;
    const point = viewportSelectablePoint(selectedNode);
    if (point && typeof runtime.frameWorldPoints === "function") {
      runtime.frameWorldPoints([point]);
      return;
    }
    return;
  }
  if (typeof runtime.focusSelected === "function") runtime.focusSelected();
}

function setTerrainActiveChannel(channel) {
  state.terrainTool.activeChannel = channel === "secondary" || channel === "edge" ? channel : "main";
  terrainFinishWithRender();
}

function terrainBeginExtrudeSession(node, groundPoint, pointerId, options = {}) {
  const points = terrainNodePoints(node);
  const explicitPointIndex = Number.isInteger(options.pointIndex) ? options.pointIndex : null;
  const explicitInsertIndex = Number.isInteger(options.insertIndex) ? options.insertIndex : null;
  let pointIndex = explicitPointIndex;
  if (!Number.isInteger(pointIndex)) {
    pointIndex = Number.isInteger(state.terrainTool.selectedPointIndex)
      ? state.terrainTool.selectedPointIndex
      : (state.terrainTool.selectedPointIndices.length
        ? state.terrainTool.selectedPointIndices[state.terrainTool.selectedPointIndices.length - 1]
        : (points.length ? points.length - 1 : null));
  }
  if (!Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= points.length) {
    setStatus("Minimaal 1 punt nodig.", "error");
    return false;
  }
  const capabilities = terrainNodeCapabilities(node);
  if (!capabilities.allowExtrude) {
    setStatus("Extrude is not available here.", "error");
    return false;
  }
  const insertIndex = Number.isInteger(explicitInsertIndex)
    ? Math.max(0, Math.min(points.length, explicitInsertIndex))
    : pointIndex <= 0
      ? 0
      : pointIndex >= points.length - 1
        ? points.length
        : pointIndex + 1;
  const startGround = groundPoint || (terrainLastPointer
    ? terrainGroundPointFromClient(terrainLastPointer.clientX, terrainLastPointer.clientY)
    : null);
  const axisConstraint = state.terrainTool.axisConstraint;
  terrainClearDragState();
  state.terrainTool.mode = "extrude";
  state.terrainTool.selectedPointIndex = pointIndex;
  state.terrainTool.selectedHandleRole = "point";
  state.terrainTool.selectedPointIndices = [pointIndex];
  state.terrainTool.dragNodeId = node.id;
  state.terrainTool.draggingPointIndex = pointIndex;
  state.terrainTool.draggingHandleRole = "extrude";
  state.terrainTool.dragStartPoints = terrainClonePoints(points);
  state.terrainTool.dragExtrudeIndex = insertIndex;
  state.terrainTool.dragPreviewPoint = startGround ? { x: startGround.x, z: startGround.z } : null;
  state.terrainTool.dragStartGround = startGround ? { x: startGround.x, z: startGround.z } : null;
  state.terrainTool.dragCurrentGround = startGround ? { x: startGround.x, z: startGround.z } : null;
  state.terrainTool.dragStartPointer = terrainLastPointer
    ? { x: Number(terrainLastPointer.clientX) || 0, y: Number(terrainLastPointer.clientY) || 0 }
    : null;
  state.terrainTool.dragCurrentPointer = state.terrainTool.dragStartPointer
    ? { x: state.terrainTool.dragStartPointer.x, y: state.terrainTool.dragStartPointer.y }
    : null;
  state.terrainTool.dragPointerId = pointerId;
  captureViewportEditPointer(pointerId);
  state.terrainTool.dragMoved = false;
  state.terrainTool.axisConstraint = axisConstraint;
  terrainRenderOverlayPreview();
  terrainFinishWithRender();
  return true;
}

// Rotate/scale the current selection as a group: shift-selected points rotate/scale
// around their own centroid, a single selected point is a no-op pivot-of-one, and no
// selection (the center handle) rotates/scales every point in the shape together.
function terrainGroupTransformIndices(node, points) {
  if (state.terrainTool.selectedPointIndices.length > 1) return state.terrainTool.selectedPointIndices.slice();
  if (Number.isInteger(state.terrainTool.selectedPointIndex)) return [state.terrainTool.selectedPointIndex];
  return points.map(function (_, index) { return index; });
}

function terrainBeginGroupTransformSession(node, groundPoint, pointerId, kind) {
  const capabilities = terrainNodeCapabilities(node);
  if (kind === "rotate" && !capabilities.allowRotate) {
    setStatus("Rotate is not available here.", "error");
    return false;
  }
  if (kind === "geoscale" && !capabilities.allowGeoScale) {
    setStatus("Scale is not available here.", "error");
    return false;
  }
  const points = terrainNodePoints(node);
  const targetIndices = terrainGroupTransformIndices(node, points);
  if (!targetIndices.length) {
    setStatus("Nothing to transform.", "error");
    return false;
  }
  const pivot = scatterPointCenter(targetIndices.map(function (index) { return points[index]; }).filter(Boolean));
  const startGround = groundPoint || terrainLastPointerGroundPoint() || pointTransformStartGroundFromPivot(pivot);
  if (!startGround) {
    setStatus("No ground hit.", "error");
    return false;
  }
  const selectedPointIndex = state.terrainTool.selectedPointIndex;
  const selectedPointIndices = state.terrainTool.selectedPointIndices.slice();
  const selectedHandleRole = state.terrainTool.selectedHandleRole;
  const axisConstraint = state.terrainTool.axisConstraint;
  terrainClearDragState();
  state.terrainTool.mode = kind;
  state.terrainTool.selectedPointIndex = selectedPointIndex;
  state.terrainTool.selectedPointIndices = selectedPointIndices;
  state.terrainTool.selectedHandleRole = selectedHandleRole;
  state.terrainTool.dragNodeId = node.id;
  state.terrainTool.draggingPointIndex = selectedPointIndex;
  state.terrainTool.draggingHandleRole = kind;
  state.terrainTool.dragTransformIndices = targetIndices;
  state.terrainTool.dragStartPoints = terrainClonePoints(points);
  state.terrainTool.dragStartGround = { x: startGround.x, z: startGround.z };
  state.terrainTool.dragCurrentGround = { x: startGround.x, z: startGround.z };
  state.terrainTool.dragPointerId = pointerId;
  captureViewportEditPointer(pointerId);
  state.terrainTool.dragMoved = false;
  state.terrainTool.dragStartPivot = pivot;
  state.terrainTool.dragStartAngle = Math.atan2(startGround.z - pivot.z, startGround.x - pivot.x);
  state.terrainTool.dragStartDistance = Math.max(0.0001, Math.hypot(startGround.x - pivot.x, startGround.z - pivot.z));
  state.terrainTool.axisConstraint = axisConstraint;
  terrainRenderOverlayPreview();
  terrainFinishWithRender();
  return true;
}

function terrainPreviewGroupTransform(startPoints, groundPoint, kind) {
  const nextPoints = terrainClonePoints(startPoints);
  const pivot = state.terrainTool.dragStartPivot;
  const indices = state.terrainTool.dragTransformIndices || [];
  if (!pivot || !groundPoint || !indices.length) return nextPoints;
  const subset = indices.map(function (index) { return nextPoints[index]; }).filter(Boolean);
  let transformed;
  if (kind === "rotate") {
    const startAngle = state.terrainTool.dragStartAngle;
    if (!Number.isFinite(startAngle)) return nextPoints;
    const currentAngle = Math.atan2(groundPoint.z - pivot.z, groundPoint.x - pivot.x);
    const deltaDegrees = (currentAngle - startAngle) * (180 / Math.PI);
    transformed = scatterRotatePoints(subset, pivot, deltaDegrees);
  } else {
    const startDistance = Math.max(0.0001, state.terrainTool.dragStartDistance || 1);
    const currentDistance = Math.hypot(groundPoint.x - pivot.x, groundPoint.z - pivot.z);
    let factor = Math.max(0.05, currentDistance / startDistance);
    const axisConstraint = state.terrainTool.axisConstraint;
    if (axisConstraint === "x" || axisConstraint === "y") {
      const coord = axisConstraint === "x" ? "x" : "z";
      const startGround = state.terrainTool.dragStartGround || groundPoint;
      const startOffset = Number(startGround?.[coord]) - Number(pivot?.[coord]);
      const currentOffset = Number(groundPoint?.[coord]) - Number(pivot?.[coord]);
      if (Number.isFinite(startOffset) && Number.isFinite(currentOffset) && Math.abs(startOffset) > 0.0001) {
        factor = Math.max(0.05, Math.abs(currentOffset / startOffset));
      }
      transformed = scatterScalePointsByAxis(
        subset,
        pivot,
        axisConstraint === "x" ? factor : 1,
        axisConstraint === "y" ? factor : 1
      );
    } else {
      transformed = scatterScalePoints(subset, pivot, factor);
    }
  }
  let cursor = 0;
  for (const index of indices) {
    if (!nextPoints[index]) continue;
    nextPoints[index] = Object.assign({}, nextPoints[index], transformed[cursor]);
    cursor += 1;
  }
  return nextPoints;
}

async function terrainCommitGroupTransform(node, kind) {
  const startPoints = terrainClonePoints(state.terrainTool.dragStartPoints || terrainNodePoints(node));
  const groundPoint = state.terrainTool.dragCurrentGround || state.terrainTool.dragStartGround;
  if (!groundPoint || !state.terrainTool.dragStartPivot) {
    terrainClearDragState();
    state.terrainTool.mode = "select";
    terrainFinishWithRender();
    setStatus("No ground hit.", "error");
    return false;
  }
  const selectedIndexBefore = state.terrainTool.selectedPointIndex;
  const selectedIndicesBefore = state.terrainTool.selectedPointIndices.slice();
  const selectedRoleBefore = state.terrainTool.selectedHandleRole;
  if (state.terrainTool.dragPointerId !== null && !state.terrainTool.dragMoved) {
    terrainClearDragState();
    state.terrainTool.axisConstraint = null;
    state.terrainTool.mode = "select";
    state.terrainTool.selectedPointIndex = selectedIndexBefore;
    state.terrainTool.selectedPointIndices = selectedIndicesBefore;
    state.terrainTool.selectedHandleRole = selectedRoleBefore;
    terrainFinishWithRender();
    return true;
  }
  const nextPoints = terrainPreviewGroupTransform(startPoints, groundPoint, kind);
  const ok = await terrainPatchPoints(node, nextPoints, kind === "rotate" ? "Terrain shape rotated" : "Terrain shape scaled");
  terrainClearDragState();
  state.terrainTool.mode = "select";
  if (ok) {
    state.terrainTool.selectedPointIndex = selectedIndexBefore;
    state.terrainTool.selectedPointIndices = selectedIndicesBefore;
    state.terrainTool.selectedHandleRole = selectedRoleBefore;
    setStatus(kind === "rotate" ? "Rotated." : "Scaled.", "success");
  }
  terrainFinishWithRender();
  return ok;
}

function terrainBeginScaleSession(node, pointerEvent, pointerId) {
  const capabilities = terrainNodeCapabilities(node);
  if (!capabilities.allowScale) {
    setStatus("Surface Layer only.", "error");
    return false;
  }
  const channel = terrainActiveChannel();
  const scaleSnapshot = terrainChannelScalePair(node, channel);
  const axisConstraint = state.terrainTool.axisConstraint;
  terrainClearDragState();
  state.terrainTool.mode = "scale";
  state.terrainTool.dragNodeId = node.id;
  state.terrainTool.draggingPointIndex = null;
  state.terrainTool.draggingHandleRole = "scale";
  state.terrainTool.dragStartScale = scaleSnapshot;
  state.terrainTool.dragScaleChannel = channel;
  state.terrainTool.dragStartPointer = pointerEvent
    ? { x: Number(pointerEvent.clientX) || 0, y: Number(pointerEvent.clientY) || 0 }
    : (terrainLastPointer ? { x: terrainLastPointer.clientX, y: terrainLastPointer.clientY } : null);
  state.terrainTool.dragCurrentPointer = state.terrainTool.dragStartPointer
    ? { x: state.terrainTool.dragStartPointer.x, y: state.terrainTool.dragStartPointer.y }
    : null;
  state.terrainTool.dragPointerId = pointerId;
  captureViewportEditPointer(pointerId);
  state.terrainTool.dragMoved = false;
  state.terrainTool.axisConstraint = axisConstraint;
  terrainUpdateScalePreview(node, state.terrainTool.dragStartPointer);
  terrainFinishWithRender();
  return true;
}

function terrainUpdateScalePreview(node, pointerPoint) {
  if (!node || state.terrainTool.draggingHandleRole !== "scale") return null;
  const channel = state.terrainTool.dragScaleChannel || terrainActiveChannel();
  const keys = terrainChannelFieldKeys(channel);
  const start = state.terrainTool.dragStartScale || terrainChannelScalePair(node, channel);
  const startPointer = state.terrainTool.dragStartPointer;
  const hasPointer = Boolean(startPointer && pointerPoint && Number.isFinite(pointerPoint.x) && Number.isFinite(pointerPoint.y));
  const deltaX = hasPointer ? pointerPoint.x - startPointer.x : 0;
  const factor = terrainSafeScale(1 + deltaX * 0.01);
  const nextX = state.terrainTool.axisConstraint === "y" ? start.x : terrainSafeScale(start.x * factor);
  const nextY = state.terrainTool.axisConstraint === "x" ? start.y : terrainSafeScale(start.y * factor);
  const patch = {};
  patch[keys.xKey] = nextX;
  patch[keys.yKey] = nextY;
  state.terrainTool.dragCurrentPointer = pointerPoint ? { x: pointerPoint.x, y: pointerPoint.y } : state.terrainTool.dragCurrentPointer;
  if (runtime && typeof runtime.setTerrainSurfacePreview === "function") {
    runtime.setTerrainSurfacePreview(terrainRuntimeSurfaceId(node), patch);
  }
  if (hasPointer) state.terrainTool.dragMoved = true;
  terrainRenderOverlayPreview();
  return patch;
}

function terrainBeginPointDrag(node, pointIndex, groundPoint, pointerId) {
  const points = terrainNodePoints(node);
  if (!Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= points.length) return false;
  const startGround = groundPoint || (terrainLastPointer
    ? terrainGroundPointFromClient(terrainLastPointer.clientX, terrainLastPointer.clientY)
    : null);
  const axisConstraint = state.terrainTool.axisConstraint;
  terrainClearDragState();
  state.terrainTool.mode = "move";
  state.terrainTool.selectedPointIndex = pointIndex;
  state.terrainTool.selectedHandleRole = "point";
  state.terrainTool.selectedPointIndices = state.terrainTool.selectedPointIndices.length > 1
    ? state.terrainTool.selectedPointIndices.slice()
    : [pointIndex];
  state.terrainTool.dragNodeId = node.id;
  state.terrainTool.draggingPointIndex = pointIndex;
  state.terrainTool.draggingHandleRole = "point";
  state.terrainTool.dragStartPoints = terrainClonePoints(points);
  state.terrainTool.dragStartGround = startGround ? { x: startGround.x, z: startGround.z } : null;
  state.terrainTool.dragCurrentGround = startGround ? { x: startGround.x, z: startGround.z } : null;
  state.terrainTool.dragStartPointer = terrainLastPointer
    ? { x: Number(terrainLastPointer.clientX) || 0, y: Number(terrainLastPointer.clientY) || 0 }
    : null;
  state.terrainTool.dragCurrentPointer = state.terrainTool.dragStartPointer
    ? { x: state.terrainTool.dragStartPointer.x, y: state.terrainTool.dragStartPointer.y }
    : null;
  state.terrainTool.dragPointerId = pointerId;
  captureViewportEditPointer(pointerId);
  state.terrainTool.dragMoved = false;
  state.terrainTool.axisConstraint = axisConstraint;
  terrainRenderOverlayPreview();
  terrainFinishWithRender();
  return true;
}

function terrainBeginSurfaceDrag(node, groundPoint, pointerId) {
  const startGround = groundPoint || (terrainLastPointer
    ? terrainGroundPointFromClient(terrainLastPointer.clientX, terrainLastPointer.clientY)
    : null);
  const axisConstraint = state.terrainTool.axisConstraint;
  terrainClearDragState();
  state.terrainTool.mode = "move";
  state.terrainTool.selectedPointIndex = null;
  state.terrainTool.selectedHandleRole = "center";
  state.terrainTool.dragNodeId = node.id;
  state.terrainTool.draggingPointIndex = null;
  state.terrainTool.draggingHandleRole = "center";
  state.terrainTool.dragStartPoints = terrainClonePoints(terrainNodePoints(node));
  state.terrainTool.dragStartSurface = terrainSurfaceSnapshot(node);
  state.terrainTool.dragStartGround = startGround ? { x: startGround.x, z: startGround.z } : null;
  state.terrainTool.dragCurrentGround = startGround ? { x: startGround.x, z: startGround.z } : null;
  state.terrainTool.dragStartPointer = terrainLastPointer
    ? { x: Number(terrainLastPointer.clientX) || 0, y: Number(terrainLastPointer.clientY) || 0 }
    : null;
  state.terrainTool.dragCurrentPointer = state.terrainTool.dragStartPointer
    ? { x: state.terrainTool.dragStartPointer.x, y: state.terrainTool.dragStartPointer.y }
    : null;
  state.terrainTool.dragPointerId = pointerId;
  captureViewportEditPointer(pointerId);
  state.terrainTool.dragMoved = false;
  state.terrainTool.axisConstraint = axisConstraint;
  terrainRenderOverlayPreview();
  terrainFinishWithRender();
  return true;
}

// Pure: builds the values patch for a points update, without sending it anywhere -
// shared by the single-node terrain tool (which patches immediately) and the cross-type
// group move (which folds several nodes' patches into one batched commit).
function terrainPointsPatch(node, nextPoints) {
  const normalizedPoints = terrainClonePoints(nextPoints);
  const patch = { points: normalizedPoints };
  const fields = state.nodeTypes?.[node.type]?.fields || {};
  // Only the closed shapes (walkable_surface/blocker_area/area_definition) use
  // x/z/width/depth as a bounding box to keep resynced. Surface Layer also has a
  // "width" field, but that's the path's stroke width, not a bounding box - patching
  // it from point bounds would clobber it with an unrelated number.
  if (TERRAIN_CLOSED_SHAPE_NODE_TYPES.has(node.type) && (fields.x || fields.z || fields.width || fields.depth || fields.y)) {
    const geometry = terrainWalkableSurfaceGeometry(node, normalizedPoints);
    if (fields.x) patch.x = geometry.x;
    if (fields.z) patch.z = geometry.z;
    if (fields.width) patch.width = geometry.width;
    if (fields.depth) patch.depth = geometry.depth;
    if (fields.y && node.type === "walkable_surface") patch.y = geometry.y;
  }
  if (fields.shapeType && node.values?.shapeType !== "polygon") patch.shapeType = "polygon";
  return patch;
}

async function terrainPatchPoints(node, nextPoints, historyLabel) {
  const patch = terrainPointsPatch(node, nextPoints);
  const result = await patchValues(node.id, patch, {
    historyLabel: historyLabel,
    refreshViewport: false,
    refreshValidation: false,
    refreshEdgeList: false,
    afterApply: invalidateDraftWorld
  });
  if (!result) {
    terrainFinishWithRender();
    return false;
  }
  return true;
}

async function terrainPatchSurface(node, patch, historyLabel) {
  const result = await patchValues(node.id, patch, {
    historyLabel: historyLabel,
    refreshViewport: false,
    refreshValidation: false,
    refreshEdgeList: false,
    afterApply: invalidateDraftWorld
  });
  if (!result) {
    terrainFinishWithRender();
    return false;
  }
  return true;
}

// Walkable Surface points form a "ladder": point i on one rail always pairs with point
// (n-1-i) on the return rail at the same rung across the surface (see
// triangulateWalkableSurfaceLadder in world-runtime.js, which triangulates rung-to-rung
// instead of guessing diagonals from the flattened outline). Extruding only one point at
// a time leaves its twin behind wherever it happened to be, which desyncs the ladder and
// is exactly what made the collision mesh look twisted around a freshly-extruded point.
// So for Walkable Surface, extrude always adds a full rung: the new point plus a twin
// mirrored across the rung being extruded from, offset by that rung's own left/right
// vector so the new pair opens up the strip by the same width as its neighbors.
function terrainWalkableRungInsert(currentPoints, effectiveSelectedIndex, newPoint) {
  const n = currentPoints.length;
  const anchor = currentPoints[effectiveSelectedIndex];
  const mirrorSource = currentPoints[n - 1 - effectiveSelectedIndex];
  const offset = mirrorSource && anchor
    ? {
      x: mirrorSource.x - anchor.x,
      y: terrainPointHeight(mirrorSource, newPoint.y) - terrainPointHeight(anchor, newPoint.y),
      z: mirrorSource.z - anchor.z
    }
    : { x: 0, y: 0, z: 0 };
  const mirrorPoint = { x: newPoint.x + offset.x, y: newPoint.y + offset.y, z: newPoint.z + offset.z };

  const insertIndex = effectiveSelectedIndex <= 0
    ? 0
    : effectiveSelectedIndex >= n - 1
      ? n
      : effectiveSelectedIndex + 1;
  const mirrorInsertIndex = n - insertIndex;

  const nextPoints = currentPoints.slice();
  if (insertIndex >= mirrorInsertIndex) {
    nextPoints.splice(insertIndex, 0, newPoint);
    nextPoints.splice(mirrorInsertIndex, 0, mirrorPoint);
  } else {
    nextPoints.splice(mirrorInsertIndex, 0, mirrorPoint);
    nextPoints.splice(insertIndex, 0, newPoint);
  }
  return { points: nextPoints, insertIndex: insertIndex };
}

async function terrainAddPoint(node, groundPoint) {
  if (!groundPoint) {
    setStatus("No ground hit.", "error");
    return false;
  }
  const capabilities = terrainNodeCapabilities(node);
  if (!capabilities.allowExtrude) return false;
  const currentPoints = terrainNodePoints(node);
  const surface = terrainSurfaceSnapshot(node);
  const selectedPoint = Number.isInteger(state.terrainTool.selectedPointIndex) ? currentPoints[state.terrainTool.selectedPointIndex] : null;
  const newPoint = node.type === "walkable_surface"
    ? { x: groundPoint.x, y: terrainPointHeight(selectedPoint, surface.y), z: groundPoint.z }
    : { x: groundPoint.x, z: groundPoint.z };
  const hasSelection = Number.isInteger(state.terrainTool.selectedPointIndex) || state.terrainTool.selectedPointIndices.length > 0;
  const selectedIndex = Number.isInteger(state.terrainTool.selectedPointIndex)
    ? state.terrainTool.selectedPointIndex
    : (state.terrainTool.selectedPointIndices.length
      ? state.terrainTool.selectedPointIndices[state.terrainTool.selectedPointIndices.length - 1]
      : null);

  if (node.type === "walkable_surface" && currentPoints.length >= 2 && currentPoints.length % 2 === 0) {
    const effectiveSelectedIndex = hasSelection ? selectedIndex : currentPoints.length - 1;
    const rung = terrainWalkableRungInsert(currentPoints, effectiveSelectedIndex, newPoint);
    const ok = await terrainPatchPoints(node, rung.points, "Terrain rung added");
    if (ok) {
      terrainSetSelection(rung.insertIndex, "point");
      setStatus("Rung extruded.", "success");
      terrainFinishWithRender();
    }
    return ok;
  }

  const insertIndex = !hasSelection
    ? currentPoints.length
    : selectedIndex <= 0
      ? 0
      : selectedIndex >= currentPoints.length - 1
        ? currentPoints.length
        : selectedIndex + 1;
  const nextPoints = currentPoints.slice();
  nextPoints.splice(insertIndex, 0, newPoint);
  const ok = await terrainPatchPoints(node, nextPoints, "Terrain point added");
  if (ok) {
    terrainSetSelection(insertIndex, "point");
    setStatus("Point extruded.", "success");
    terrainFinishWithRender();
  }
  return ok;
}

async function terrainDeletePoint(node, pointIndex) {
  const capabilities = terrainNodeCapabilities(node);
  if (!capabilities.allowDelete) return false;
  const currentPoints = terrainNodePoints(node);
  if (!Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= currentPoints.length) return false;
  const nextPoints = currentPoints.filter(function (_, index) { return index !== pointIndex; });
  const minCount = terrainMinPointCount(node.type);
  if (nextPoints.length < minCount) {
    setStatus("Cannot delete: minimum " + minCount + " points required.", "error");
    terrainFinishWithRender();
    return false;
  }
  const ok = await terrainPatchPoints(node, nextPoints, "Terrain point deleted");
  if (ok) {
    const nextIndex = nextPoints.length ? Math.min(pointIndex, nextPoints.length - 1) : null;
    terrainSetSelection(nextIndex, nextIndex === null ? null : "point");
    setStatus("Point deleted.", "success");
    terrainFinishWithRender();
  }
  return ok;
}

function terrainMinPointCount(nodeType) {
  if (nodeType === "surface_layer") return 2;
  if (TERRAIN_CLOSED_SHAPE_NODE_TYPES.has(nodeType)) return 3;
  return 1;
}

async function terrainDeleteMultiPoint(node) {
  const capabilities = terrainNodeCapabilities(node);
  if (!capabilities.allowDelete) return false;
  const indices = state.terrainTool.selectedPointIndices;
  if (!indices.length) return false;
  const currentPoints = terrainNodePoints(node);
  const minCount = terrainMinPointCount(node.type);
  const toDelete = new Set(indices.filter(function (i) { return i >= 0 && i < currentPoints.length; }));
  const remaining = currentPoints.filter(function (_, i) { return !toDelete.has(i); });
  if (remaining.length < minCount) {
    setStatus("Cannot delete: minimum " + minCount + " points required.", "error");
    terrainFinishWithRender();
    return false;
  }
  const ok = await terrainPatchPoints(node, remaining, "Terrain points deleted");
  if (ok) {
    const nextIndex = remaining.length ? 0 : null;
    terrainSetSelection(nextIndex, nextIndex === null ? null : "point");
    setStatus(toDelete.size + " point" + (toDelete.size > 1 ? "s" : "") + " deleted.", "success");
    terrainFinishWithRender();
  }
  return ok;
}

async function terrainCommitPointDrag(node) {
  if (state.terrainTool.draggingHandleRole === "extrude") {
    const pointIndex = state.terrainTool.draggingPointIndex;
    const startPoints = terrainClonePoints(state.terrainTool.dragStartPoints || terrainNodePoints(node));
    const sourcePoint = startPoints[pointIndex] || null;
    const previewPoint = state.terrainTool.dragPreviewPoint
      || state.terrainTool.dragCurrentGround
      || state.terrainTool.dragStartGround
      || (sourcePoint ? { x: sourcePoint.x, z: sourcePoint.z } : null);
    if (!Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= startPoints.length) {
      terrainClearDragState();
      state.terrainTool.axisConstraint = null;
      state.terrainTool.mode = "select";
      terrainFinishWithRender();
      if (!previewPoint && !terrainVerticalHeightSession(node)) setStatus("No ground hit.", "error");
      return false;
    }
    const insertIndex = Number.isInteger(state.terrainTool.dragExtrudeIndex)
      ? Math.max(0, Math.min(startPoints.length, state.terrainTool.dragExtrudeIndex))
      : Math.min(startPoints.length, pointIndex + 1);
    const anchor = state.terrainTool.dragStartGround || previewPoint;
    const nextPoints = terrainPreviewExtrudedPoints(node, startPoints, pointIndex, previewPoint, insertIndex, anchor);
    if (!nextPoints) {
      terrainClearDragState();
      state.terrainTool.axisConstraint = null;
      state.terrainTool.mode = "select";
      terrainFinishWithRender();
      setStatus("No ground hit.", "error");
      return false;
    }
    const ok = await terrainPatchPoints(node, nextPoints, "Terrain point extruded");
    terrainClearDragState();
    state.terrainTool.axisConstraint = null;
    state.terrainTool.mode = "select";
    if (ok) {
      const selectedIndex = insertIndex;
      terrainSetSelection(selectedIndex, "point");
      setStatus("Point extruded.", "success");
    }
    terrainFinishWithRender();
    return ok;
  }
  const pointIndex = state.terrainTool.draggingPointIndex;
  const startPoints = terrainClonePoints(state.terrainTool.dragStartPoints || terrainNodePoints(node));
  const startGround = state.terrainTool.dragStartGround;
  const groundPoint = state.terrainTool.dragCurrentGround
    || startGround
    || (startPoints[pointIndex] ? { x: startPoints[pointIndex].x, z: startPoints[pointIndex].z } : null);
  if ((!groundPoint && !terrainVerticalHeightSession(node)) || !Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= startPoints.length) {
    terrainClearDragState();
    state.terrainTool.axisConstraint = null;
    state.terrainTool.mode = "select";
    terrainFinishWithRender();
    if (!groundPoint && !terrainVerticalHeightSession(node)) setStatus("No ground hit.", "error");
    return false;
  }
  const draggedIndices = terrainDraggedPointIndices(pointIndex);
  const selectedBefore = state.terrainTool.selectedPointIndices.slice();
  if (state.terrainTool.dragPointerId !== null && !state.terrainTool.dragMoved) {
    terrainClearDragState();
    state.terrainTool.axisConstraint = null;
    state.terrainTool.mode = "select";
    state.terrainTool.selectedPointIndices = selectedBefore;
    state.terrainTool.selectedPointIndex = pointIndex;
    state.terrainTool.selectedHandleRole = "point";
    terrainFinishWithRender();
    return true;
  }
  const nextPoints = terrainPreviewMovedPoints(node, startPoints, pointIndex, groundPoint, startGround);
  const ok = await terrainPatchPoints(node, nextPoints, "Terrain point moved");
  terrainClearDragState();
  state.terrainTool.axisConstraint = null;
  state.terrainTool.mode = "select";
  if (ok) {
    state.terrainTool.selectedPointIndices = selectedBefore;
    state.terrainTool.selectedPointIndex = pointIndex;
    state.terrainTool.selectedHandleRole = "point";
    setStatus(draggedIndices.length > 1 ? draggedIndices.length + " points moved." : "Point moved.", "success");
  }
  terrainFinishWithRender();
  return ok;
}

async function terrainCommitSurfaceDrag(node) {
  const groundPoint = state.terrainTool.dragCurrentGround
    || state.terrainTool.dragStartGround
    || (state.terrainTool.dragStartSurface ? { x: state.terrainTool.dragStartSurface.x, z: state.terrainTool.dragStartSurface.z } : null);
  if ((!groundPoint && !terrainVerticalHeightSession(node)) || !state.terrainTool.dragStartSurface) {
    terrainClearDragState();
    state.terrainTool.axisConstraint = null;
    state.terrainTool.mode = "select";
    terrainFinishWithRender();
    if (!terrainVerticalHeightSession(node)) setStatus("No ground hit.", "error");
    return false;
  }
  if (state.terrainTool.dragPointerId !== null && !state.terrainTool.dragMoved) {
    terrainClearDragState();
    state.terrainTool.axisConstraint = null;
    state.terrainTool.mode = "select";
    terrainSetSelection(null, "center");
    terrainFinishWithRender();
    return true;
  }
  let ok = false;
  const startGround = state.terrainTool.dragStartGround
    || { x: state.terrainTool.dragStartSurface.x, z: state.terrainTool.dragStartSurface.z };
  const dx = groundPoint ? groundPoint.x - startGround.x : 0;
  const dz = groundPoint ? groundPoint.z - startGround.z : 0;
  const hasExplicitPoints = Array.isArray(node.values?.points) && node.values.points.length > 0;
  if (state.terrainTool.dragStartPoints && hasExplicitPoints) {
    const nextPoints = terrainPreviewSurfacePoints(node, state.terrainTool.dragStartPoints, groundPoint, startGround);
    ok = await terrainPatchPoints(node, nextPoints, "Terrain shape moved");
  } else {
    const surfacePatch = {
      x: state.terrainTool.dragStartSurface.x + dx,
      z: state.terrainTool.dragStartSurface.z + dz
    };
    if (terrainVerticalHeightSession(node)) {
      surfacePatch.y = state.terrainTool.dragStartSurface.y + terrainHeightDragDelta();
    }
    ok = await terrainPatchSurface(node, surfacePatch, "Terrain shape moved");
  }
  terrainClearDragState();
  state.terrainTool.axisConstraint = null;
  state.terrainTool.mode = "select";
  if (ok) {
    terrainSetSelection(null, "center");
    setStatus("Shape moved.", "success");
  }
  terrainFinishWithRender();
  return ok;
}

async function terrainCommitScale(node) {
  const channel = state.terrainTool.dragScaleChannel || terrainActiveChannel();
  const keys = terrainChannelFieldKeys(channel);
  const start = state.terrainTool.dragStartScale || terrainChannelScalePair(node, channel);
  const pointerPoint = state.terrainTool.dragCurrentPointer || state.terrainTool.dragStartPointer;
  const hasPointer = Boolean(pointerPoint && state.terrainTool.dragStartPointer);
  const deltaX = hasPointer ? pointerPoint.x - state.terrainTool.dragStartPointer.x : 0;
  const factor = terrainSafeScale(1 + deltaX * 0.01);
  const patch = {};
  patch[keys.xKey] = state.terrainTool.axisConstraint === "y" ? start.x : terrainSafeScale(start.x * factor);
  patch[keys.yKey] = state.terrainTool.axisConstraint === "x" ? start.y : terrainSafeScale(start.y * factor);
  if (runtime && typeof runtime.setTerrainSurfacePreview === "function") {
    runtime.setTerrainSurfacePreview(terrainRuntimeSurfaceId(node), patch);
  }
  const ok = await terrainPatchSurface(node, patch, terrainChannelLabel(channel) + " texture scale");
  terrainClearDragState();
  state.terrainTool.axisConstraint = null;
  state.terrainTool.mode = "select";
  if (ok) {
    setStatus(terrainChannelLabel(channel) + " texture scale updated.", "success");
  } else if (runtime && state.viewportWorld) {
    applyViewportWorld(state.viewportWorld);
  }
  terrainFinishWithRender();
  return ok;
}

// ---------- Point-edit marquee (box) selection ----------
// Shared by the terrain tool (Surface Layer/Walkable Surface/Blocker Area/Area Definition)
// and the scatter tool - both already have working group move/rotate/scale for whatever is
// in selectedPointIndices, so this only needs to fill that array from a screen-space rect.
function pointIndicesInRect(points, yForPoint, rect) {
  if (!runtime || typeof runtime.worldToScreen !== "function") return [];
  const indices = [];
  points.forEach(function (point, index) {
    const screen = runtime.worldToScreen({ x: point.x, y: yForPoint(point, index), z: point.z });
    if (screen && rectContainsPoint(rect, screen)) indices.push(index);
  });
  return indices;
}

function applyMarqueeSelection(toolState, hitIndices, additive, subtractive) {
  if (subtractive) {
    if (!hitIndices.length) return;
    const remove = new Set(hitIndices);
    toolState.selectedPointIndices = toolState.selectedPointIndices.filter(function (i) { return !remove.has(i); });
  } else if (additive) {
    const combined = new Set(toolState.selectedPointIndices);
    for (const i of hitIndices) combined.add(i);
    toolState.selectedPointIndices = Array.from(combined);
  } else {
    toolState.selectedPointIndices = hitIndices.slice();
  }
  const last = toolState.selectedPointIndices.length
    ? toolState.selectedPointIndices[toolState.selectedPointIndices.length - 1]
    : null;
  toolState.selectedPointIndex = last;
  toolState.selectedHandleRole = last !== null ? "point" : null;
}

function pointLongPressAllowed(event) {
  return event?.pointerType === "touch" || event?.pointerType === "pen";
}

function clearPointLongPress() {
  if (pointLongPressSession?.timer) clearTimeout(pointLongPressSession.timer);
  pointLongPressSession = null;
}

// Touch-only grab confirmation: a plain touchdown on a point/center handle used to start
// dragging it immediately, so a finger that happened to land near one while starting a
// two-finger pan gesture would drag it along with the pan. Requiring a brief, deliberate
// hold (cancelled the moment the finger travels beyond the tolerance) before the drag
// actually begins means a quick pan start never lingers long enough to grab anything.
// Mouse/pen clicks stay instant - they're already a deliberate, single action.
const TOUCH_GRAB_CONFIRM_MS = 500;
const TOUCH_GRAB_CONFIRM_MOVE_PX = 10;
let touchGrabConfirmSession = null;
let touchEmptyDeselectSession = null;

function clearTouchGrabConfirm() {
  if (touchGrabConfirmSession?.timer) clearTimeout(touchGrabConfirmSession.timer);
  touchGrabConfirmSession = null;
}

function beginTouchGrabConfirm(event, startDrag) {
  if (event.pointerType !== "touch") {
    startDrag();
    return;
  }
  clearTouchGrabConfirm();
  const session = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    timer: null
  };
  session.timer = setTimeout(function () {
    if (touchGrabConfirmSession !== session) return;
    touchGrabConfirmSession = null;
    startDrag();
  }, TOUCH_GRAB_CONFIRM_MS);
  touchGrabConfirmSession = session;
}

function cancelTouchGrabConfirmForMove(event) {
  const session = touchGrabConfirmSession;
  if (!session || event.pointerId !== session.pointerId) return;
  const dx = Number(event.clientX) - session.startX;
  const dy = Number(event.clientY) - session.startY;
  if (Math.hypot(dx, dy) > TOUCH_GRAB_CONFIRM_MOVE_PX) clearTouchGrabConfirm();
}

function cancelTouchGrabConfirmForEnd(event) {
  const session = touchGrabConfirmSession;
  if (session && event.pointerId === session.pointerId) clearTouchGrabConfirm();
}

function clearTouchEmptyDeselectSession() {
  const session = touchEmptyDeselectSession;
  if (!session) return;
  window.removeEventListener("pointermove", session.onMove, true);
  window.removeEventListener("pointerup", session.onUp, true);
  window.removeEventListener("pointercancel", session.onCancel, true);
  touchEmptyDeselectSession = null;
}

function beginTouchEmptyDeselectSession(event, onDeselect) {
  if (event.pointerType !== "touch" || typeof onDeselect !== "function") return false;
  clearTouchEmptyDeselectSession();
  const session = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    onMove: null,
    onUp: null,
    onCancel: null
  };
  session.onMove = function (moveEvent) {
    if (moveEvent.pointerId !== session.pointerId) return;
    const dx = Number(moveEvent.clientX) - session.startX;
    const dy = Number(moveEvent.clientY) - session.startY;
    if (Math.hypot(dx, dy) > TOUCH_GRAB_CONFIRM_MOVE_PX) session.moved = true;
  };
  session.onUp = function (upEvent) {
    if (upEvent.pointerId !== session.pointerId) return;
    const shouldDeselect = !session.moved && !viewportTouchEditSuppress;
    clearTouchEmptyDeselectSession();
    if (shouldDeselect) onDeselect();
  };
  session.onCancel = function (cancelEvent) {
    if (cancelEvent.pointerId === session.pointerId) clearTouchEmptyDeselectSession();
  };
  touchEmptyDeselectSession = session;
  window.addEventListener("pointermove", session.onMove, true);
  window.addEventListener("pointerup", session.onUp, true);
  window.addEventListener("pointercancel", session.onCancel, true);
  return true;
}

function beginPointLongPress(event, options) {
  if (!pointLongPressAllowed(event) || !Number.isInteger(options?.pointIndex) || !options.toolState) return;
  clearPointLongPress();
  const selectedBefore = Array.isArray(options.toolState.selectedPointIndices)
    ? options.toolState.selectedPointIndices.slice()
    : [];
  const session = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    pointIndex: options.pointIndex,
    selectedBefore,
    toolState: options.toolState,
    cancelActiveSession: options.cancelActiveSession,
    onApplied: options.onApplied,
    timer: null
  };
  session.timer = setTimeout(function () {
    if (pointLongPressSession !== session) return;
    const selected = session.selectedBefore.includes(session.pointIndex);
    if (typeof session.cancelActiveSession === "function") session.cancelActiveSession();
    session.toolState.selectedPointIndices = selected
      ? session.selectedBefore.filter(function (index) { return index !== session.pointIndex; })
      : session.selectedBefore.concat(session.pointIndex);
    const last = session.toolState.selectedPointIndices.length
      ? session.toolState.selectedPointIndices[session.toolState.selectedPointIndices.length - 1]
      : null;
    session.toolState.selectedPointIndex = last;
    session.toolState.selectedHandleRole = last !== null ? "point" : null;
    setStatus(selected ? "Point uit multi-selectie." : "Point toegevoegd aan multi-selectie.", "");
    if (typeof session.onApplied === "function") session.onApplied();
    pointLongPressSession = null;
  }, POINT_LONG_PRESS_MS);
  pointLongPressSession = session;
}

function cancelPointLongPressForMove(event) {
  const session = pointLongPressSession;
  if (!session || event.pointerId !== session.pointerId) return;
  const dx = Number(event.clientX) - session.startX;
  const dy = Number(event.clientY) - session.startY;
  if (Math.hypot(dx, dy) > POINT_LONG_PRESS_MOVE_PX) clearPointLongPress();
}

function finishPointLongPress(event) {
  if (pointLongPressSession && event.pointerId === pointLongPressSession.pointerId) {
    clearPointLongPress();
  }
}

// Starts tracking a potential drag from an empty-space pointerdown. If the pointer never
// moves it's a plain click (falls back to options.onEmptyClick, e.g. the existing "click
// empty space to deselect" behavior); if it does move, it's a marquee box-select.
function beginPointMarqueeSession(event, options) {
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
  const startX = event.clientX;
  const startY = event.clientY;
  const pointerId = event.pointerId;
  const additive = event.shiftKey;
  const subtractive = event.ctrlKey || event.metaKey;
  let moved = false;
  function onMove(moveEvent) {
    if (moveEvent.pointerId !== pointerId) return;
    if (Math.abs(moveEvent.clientX - startX) > 3 || Math.abs(moveEvent.clientY - startY) > 3) moved = true;
    if (moved) showViewportSelectionBox(startX, startY, moveEvent.clientX, moveEvent.clientY);
  }
  function finish(finalEvent) {
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancel, true);
    hideViewportSelectionBox();
    if (!moved) {
      if (!additive && !subtractive) options.onEmptyClick();
      return;
    }
    const rect = rectFromClientPoints(startX, startY, finalEvent.clientX, finalEvent.clientY);
    const hitIndices = pointIndicesInRect(options.getPoints(), options.yForPoint, rect);
    applyMarqueeSelection(options.toolState, hitIndices, additive, subtractive);
    options.onApplied();
  }
  function onUp(upEvent) { if (upEvent.pointerId === pointerId) finish(upEvent); }
  function onCancel(cancelEvent) { if (cancelEvent.pointerId === pointerId) finish(cancelEvent); }
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onCancel, true);
}

function deselectViewportClick() {
  clearPointLongPress();
  clearSelection({ clearPendingEdge: true });
  renderGraph();
  setStatus("Deselected.", "");
  redrawEditorMinimap();
}

function rebaseScatterActiveTouchSession(event, node) {
  if (state.scatterTool.dragPointerId !== null) return false;
  const ground = terrainGroundPointFromEvent(event);
  let insertHit = null;
  if (state.scatterTool.draggingHandleRole === "extrude") {
    if (!ground) {
      setStatus("No ground hit.", "error");
      return true;
    }
    insertHit = scatterLineInsertHitFromEvent(node, event);
    if (!insertHit) {
      setStatus("Druk tussen twee punten.", "error");
      return true;
    }
  }
  state.scatterTool.dragPointerId = event.pointerId;
  captureViewportEditPointer(event.pointerId);
  state.scatterTool.dragMoved = false;
  if (ground) {
    state.scatterTool.dragStartGround = { x: ground.x, z: ground.z };
    state.scatterTool.dragCurrentGround = { x: ground.x, z: ground.z };
    if (state.scatterTool.draggingHandleRole === "extrude") {
      state.scatterTool.draggingPointIndex = insertHit.pointIndex;
      state.scatterTool.dragExtrudeIndex = insertHit.insertIndex;
      state.scatterTool.selectedPointIndex = insertHit.pointIndex;
      state.scatterTool.selectedPointIndices = [insertHit.pointIndex];
      state.scatterTool.selectedHandleRole = "point";
      state.scatterTool.dragPreviewPoint = { x: ground.x, z: ground.z };
    }
    if (state.scatterTool.dragStartPivot && (state.scatterTool.draggingHandleRole === "rotate" || state.scatterTool.draggingHandleRole === "scale")) {
      const pivot = state.scatterTool.dragStartPivot;
      state.scatterTool.dragStartAngle = Math.atan2(ground.z - pivot.z, ground.x - pivot.x);
      state.scatterTool.dragStartDistance = Math.max(0.0001, Math.hypot(ground.x - pivot.x, ground.z - pivot.z));
    }
    scatterRenderOverlayPreview();
  }
  return true;
}

function rebaseTerrainActiveTouchSession(event, node) {
  if (state.terrainTool.dragPointerId !== null) return false;
  if (state.terrainTool.draggingHandleRole === "scale") {
    state.terrainTool.dragPointerId = event.pointerId;
    captureViewportEditPointer(event.pointerId);
    state.terrainTool.dragMoved = false;
    state.terrainTool.dragStartPointer = { x: Number(event.clientX) || 0, y: Number(event.clientY) || 0 };
    state.terrainTool.dragCurrentPointer = { x: state.terrainTool.dragStartPointer.x, y: state.terrainTool.dragStartPointer.y };
    terrainUpdateScalePreview(node, state.terrainTool.dragStartPointer);
    return true;
  }
  const ground = terrainGroundPointFromEvent(event);
  let insertHit = null;
  if (state.terrainTool.draggingHandleRole === "extrude") {
    if (!ground) {
      setStatus("No ground hit.", "error");
      return true;
    }
    insertHit = terrainLineInsertHitFromEvent(node, event);
    if (!insertHit) {
      setStatus("Druk tussen twee punten.", "error");
      return true;
    }
  }
  state.terrainTool.dragPointerId = event.pointerId;
  captureViewportEditPointer(event.pointerId);
  state.terrainTool.dragMoved = false;
  if (ground) {
    state.terrainTool.dragStartGround = { x: ground.x, z: ground.z };
    state.terrainTool.dragCurrentGround = { x: ground.x, z: ground.z };
    if (state.terrainTool.draggingHandleRole === "extrude") {
      state.terrainTool.draggingPointIndex = insertHit.pointIndex;
      state.terrainTool.dragExtrudeIndex = insertHit.insertIndex;
      state.terrainTool.selectedPointIndex = insertHit.pointIndex;
      state.terrainTool.selectedPointIndices = [insertHit.pointIndex];
      state.terrainTool.selectedHandleRole = "point";
      state.terrainTool.dragPreviewPoint = { x: ground.x, z: ground.z };
    }
    if (state.terrainTool.dragStartPivot && (state.terrainTool.draggingHandleRole === "rotate" || state.terrainTool.draggingHandleRole === "geoscale")) {
      const pivot = state.terrainTool.dragStartPivot;
      state.terrainTool.dragStartAngle = Math.atan2(ground.z - pivot.z, ground.x - pivot.x);
      state.terrainTool.dragStartDistance = Math.max(0.0001, Math.hypot(ground.x - pivot.x, ground.z - pivot.z));
    }
    terrainRenderOverlayPreview();
  }
  return true;
}

function handleTerrainPointerDown(event) {
  if (updateViewportTouchEditState(event)) {
    cancelViewportTouchEditSessionsForPan();
    return;
  }
  if (runtimeTransformActive()) return;
  terrainRememberPointer(event);
  if (handleScatterPointerDown(event)) return;
  if (terrainHasActiveSession() && isPrimaryPointerAction(event) && terrainCanvasTarget(event)) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    suppressNextViewportRuntimeClick();
    const node = nodeById(state.terrainTool.dragNodeId) || selectedTerrainNode();
    const shouldStartPointerDrag = state.terrainTool.dragPointerId === null
      && (state.terrainTool.draggingHandleRole === "extrude" || event.pointerType === "touch" || !state.terrainTool.dragMoved);
    if (shouldStartPointerDrag) {
      if (node && rebaseTerrainActiveTouchSession(event, node)) {
        if (event.pointerType === "touch" && runtime && typeof runtime.markEditorTouchHandled === "function") {
          runtime.markEditorTouchHandled(event.pointerId);
        }
      } else {
        terrainCancelActiveSession();
      }
      return;
    }
    if (!node) {
      terrainCancelActiveSession();
      return;
    }
    if (state.terrainTool.draggingHandleRole === "scale") {
      void terrainCommitScale(node);
      return;
    }
    if (state.terrainTool.draggingHandleRole === "center") {
      void terrainCommitSurfaceDrag(node);
      return;
    }
    if (state.terrainTool.draggingHandleRole === "rotate" || state.terrainTool.draggingHandleRole === "geoscale") {
      void terrainCommitGroupTransform(node, state.terrainTool.draggingHandleRole);
      return;
    }
    void terrainCommitPointDrag(node);
    return;
  }
  if (!terrainCanvasTarget(event) || !isPrimaryPointerAction(event)) return;
  const node = selectedTerrainNode();
  const hit = terrainHandleFromEvent(event);
  // A hit for a node other than the currently selected one can only be one of the
  // always-visible "go to this node" markers - jump to it instead of editing.
  if (hit && hit.nodeId && hit.nodeId !== node?.id) {
    const markerNode = nodeById(hit.nodeId);
    if (markerNode) {
      // This is the always-visible "jump to this (not yet active) node" marker - the
      // one big handle per not-yet-selected zone/terrain/scatter object. Same reasoning
      // as the point/center handles below: defer for touch so a pan gesture's first
      // finger can't jump/select just by landing near it. Unlike those, don't stop
      // propagation yet for touch either - these markers are scattered all over the
      // scene (one per other zone/scatter node) with a generous hit radius, so a tap
      // meant as "deselect on empty space" can easily land near one. Leaving propagation
      // alone lets the runtime's own tap handling for this same touch still run; if the
      // hold below does end up confirming, markEditorTouchHandled() tells it to stand
      // down instead of also deselecting right after.
      if (event.pointerType === "touch") {
        event.preventDefault();
      } else {
        suppressNextViewportRuntimeClick();
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
      }
      beginTouchGrabConfirm(event, function () {
        if (runtime && typeof runtime.markEditorTouchHandled === "function") {
          runtime.markEditorTouchHandled(event.pointerId);
        }
        selectNode(markerNode.id, true, { clearPendingEdge: true });
      });
      return;
    }
  }
  if (!node) return;
  const capabilities = terrainNodeCapabilities(node);
  const ground = terrainGroundPointFromEvent(event);
  const mode = state.terrainTool.mode;
  const meshEntityId = runtimeEntityIdFromPointer(event);
  const terrainInsertHit = mode === "extrude" && capabilities.allowExtrude
    ? terrainLineInsertHitFromEvent(node, event)
    : null;
  const shouldPlaceFirstPoints = mode === "select"
    && capabilities.pointEditing
    && ground
    && terrainNodePoints(node).length < terrainMinPointCount(node.type);
  const shouldConsumeTerrainClick = Boolean(hit && hit.nodeId === node.id)
    || Boolean(terrainInsertHit)
    || shouldPlaceFirstPoints
    || mode === "extrude"
    || mode === "scale";
  if (meshEntityId && !(hit && hit.nodeId === node.id) && mode !== "extrude") return;
  if (!shouldConsumeTerrainClick) {
    if (event.pointerType === "touch") {
      if (!meshEntityId && capabilities.pointEditing && (mode === "select" || mode === "move")) {
        beginTouchEmptyDeselectSession(event, deselectViewportClick);
      }
      return;
    }
    if (!meshEntityId && capabilities.pointEditing && (mode === "select" || mode === "move")) {
      beginPointMarqueeSession(event, {
        getPoints: function () { return terrainNodePoints(node); },
        yForPoint: function (point) {
          return node.type === "walkable_surface" ? terrainPointHeight(point, terrainGroundY()) : terrainGroundY();
        },
        toolState: state.terrainTool,
        onApplied: terrainFinishWithRender,
        onEmptyClick: deselectViewportClick
      });
    }
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
  suppressNextViewportRuntimeClick();

  if (hit && hit.nodeId === node.id) {
    if (capabilities.centerEditable && hit.handleRole === "center") {
      if (state.terrainTool.mode === "delete") {
        setStatus("Select a point to delete.", "error");
        terrainFinishWithRender();
        return;
      }
      if (state.terrainTool.mode === "extrude") {
        if (!ground) {
          setStatus("No ground hit.", "error");
        } else if (!terrainInsertHit) {
          setStatus("Druk tussen twee punten.", "error");
        } else {
          terrainBeginExtrudeSession(node, ground, event.pointerId, terrainInsertHit);
        }
      } else if (state.terrainTool.mode === "select" || state.terrainTool.mode === "move") {
        beginTouchGrabConfirm(event, function () {
          terrainSetSelection(null, "center");
          terrainBeginSurfaceDrag(node, ground, event.pointerId);
        });
      } else if (state.terrainTool.mode === "rotate") {
        terrainSetSelection(null, "center");
        if (!ground) {
          setStatus("No ground hit.", "error");
        } else {
          terrainBeginGroupTransformSession(node, ground, event.pointerId, "rotate");
        }
      } else if (state.terrainTool.mode === "geoscale") {
        terrainSetSelection(null, "center");
        if (!ground) {
          setStatus("No ground hit.", "error");
        } else {
          terrainBeginGroupTransformSession(node, ground, event.pointerId, "geoscale");
        }
      } else if (state.terrainTool.mode === "scale" && capabilities.allowScale) {
        terrainSetSelection(null, "center");
        terrainBeginScaleSession(node, event, event.pointerId);
      } else {
        terrainSetSelection(null, "center");
        terrainFinishWithRender();
      }
      return;
    }
    if (capabilities.pointEditing && Number.isInteger(hit.pointIndex)) {
      const alreadyInMultiSelect = state.terrainTool.selectedPointIndices.length > 1
        && state.terrainTool.selectedPointIndices.includes(hit.pointIndex);
      if ((event.shiftKey || event.ctrlKey || event.metaKey || state.terrainTool.multiSelect) && (state.terrainTool.mode === "select" || state.terrainTool.mode === "move")) {
        if (event.ctrlKey || event.metaKey) terrainRemovePointFromSelection(hit.pointIndex);
        else if (state.terrainTool.multiSelect && !event.shiftKey) terrainTogglePointSelection(hit.pointIndex);
        else terrainAddPointToSelection(hit.pointIndex);
        terrainFinishWithRender();
        return;
      }
      function applyTerrainPointSelection() {
        if (!alreadyInMultiSelect) {
          terrainSetSelection(hit.pointIndex, "point");
        } else {
          state.terrainTool.selectedPointIndex = hit.pointIndex;
          state.terrainTool.selectedHandleRole = "point";
        }
      }
      if (state.terrainTool.mode === "select" || state.terrainTool.mode === "move") {
        beginTouchGrabConfirm(event, function () {
          applyTerrainPointSelection();
          terrainBeginPointDrag(node, hit.pointIndex, ground, event.pointerId);
        });
        return;
      }
      applyTerrainPointSelection();
      if (state.terrainTool.mode === "extrude") {
        if (!ground) {
          setStatus("No ground hit.", "error");
        } else if (!terrainInsertHit) {
          setStatus("Druk tussen twee punten.", "error");
        } else {
          terrainBeginExtrudeSession(node, ground, event.pointerId, terrainInsertHit);
        }
      } else if (state.terrainTool.mode === "scale") {
        terrainBeginScaleSession(node, event, event.pointerId);
      } else if (state.terrainTool.mode === "delete") {
        void terrainDeleteMultiPoint(node);
      } else {
        terrainFinishWithRender();
      }
      return;
    }
  }

  if (state.terrainTool.mode === "extrude" && capabilities.allowExtrude) {
    if (!ground) {
      setStatus("No ground hit.", "error");
      return;
    }
    if (!terrainInsertHit) {
      setStatus("Druk tussen twee punten.", "error");
      return;
    }
    terrainBeginExtrudeSession(node, ground, event.pointerId, terrainInsertHit);
    return;
  }

  if (state.terrainTool.mode === "scale" && capabilities.allowScale) {
    terrainBeginScaleSession(node, event, event.pointerId);
    return;
  }

  if (state.terrainTool.mode === "select") {
    if (shouldPlaceFirstPoints) {
      void terrainAddPoint(node, ground);
      return;
    }
    terrainFinishWithRender();
    return;
  }

  if (state.terrainTool.mode === "delete") {
    setStatus("Select a point to delete.", "error");
    terrainFinishWithRender();
  }
}

function handleScatterPointerDown(event) {
  const node = nodeById(state.scatterTool.dragNodeId) || selectedScatterNode();
  if (!node) return false;
  if (scatterHasActiveSession() && isPrimaryPointerAction(event) && terrainCanvasTarget(event)) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    suppressNextViewportRuntimeClick();
    const shouldStartPointerDrag = state.scatterTool.dragPointerId === null
      && (state.scatterTool.draggingHandleRole === "extrude" || event.pointerType === "touch" || !state.scatterTool.dragMoved);
    if (shouldStartPointerDrag) {
      if (rebaseScatterActiveTouchSession(event, node)) {
        if (event.pointerType === "touch" && runtime && typeof runtime.markEditorTouchHandled === "function") {
          runtime.markEditorTouchHandled(event.pointerId);
        }
      } else {
        scatterCancelActiveSession();
      }
      return true;
    }
    if (state.scatterTool.draggingHandleRole === "center") {
      void scatterCommitCenterDrag(node);
    } else if (state.scatterTool.draggingHandleRole === "rotate") {
      void scatterCommitRotate(node);
    } else if (state.scatterTool.draggingHandleRole === "scale") {
      void scatterCommitScale(node);
    } else {
      void scatterCommitPointDrag(node);
    }
    return true;
  }
  if (!terrainCanvasTarget(event) || !isPrimaryPointerAction(event)) return false;
  const hit = scatterHandleFromEvent(event);
  const ground = terrainGroundPointFromEvent(event);
  const mode = state.scatterTool.mode;
  const scatterInsertHit = mode === "extrude"
    ? scatterLineInsertHitFromEvent(node, event)
    : null;
  if (!hit || hit.nodeId !== node.id) {
    const meshEntityId = runtimeEntityIdFromPointer(event);
    // "Add" moet een punt neerzetten op de plek waar je tikt (vinger/muis), niet alleen
    // wanneer je toevallig exact een bestaand punt-handle raakt - anders lijkt de knop
    // niets te doen op touch, waar precies een klein handle raken lastig is.
    if (mode === "extrude") {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
      suppressNextViewportRuntimeClick();
      if (!ground) {
        setStatus("No ground hit.", "error");
      } else if (!scatterInsertHit) {
        setStatus("Druk tussen twee punten.", "error");
      } else {
        scatterBeginExtrudeSession(node, ground, event.pointerId, scatterInsertHit);
      }
      return true;
    }
    if (event.pointerType === "touch") {
      if (!meshEntityId && (mode === "select" || mode === "move")) {
        return beginTouchEmptyDeselectSession(event, deselectViewportClick);
      }
      return false;
    }
    if (!hit && !meshEntityId && (mode === "select" || mode === "move")) {
      beginPointMarqueeSession(event, {
        getPoints: function () { return scatterNodePoints(node); },
        yForPoint: function () { return terrainGroundY(); },
        toolState: state.scatterTool,
        onApplied: scatterFinishWithRender,
        onEmptyClick: deselectViewportClick
      });
      return true;
    }
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
  suppressNextViewportRuntimeClick();

  if (Number.isInteger(hit.pointIndex)) {
    const alreadyInMultiSelect = state.scatterTool.selectedPointIndices.length > 1
      && state.scatterTool.selectedPointIndices.includes(hit.pointIndex);
    if ((event.shiftKey || event.ctrlKey || event.metaKey || state.scatterTool.multiSelect) && (mode === "select" || mode === "move")) {
      if (event.ctrlKey || event.metaKey) scatterRemovePointFromSelection(hit.pointIndex);
      else if (state.scatterTool.multiSelect && !event.shiftKey) scatterTogglePointSelection(hit.pointIndex);
      else scatterAddPointToSelection(hit.pointIndex);
      scatterFinishWithRender();
      return true;
    }
    function applyScatterPointSelection() {
      if (!alreadyInMultiSelect) {
        scatterSetSelection(hit.pointIndex, "point");
      } else {
        state.scatterTool.selectedPointIndex = hit.pointIndex;
        state.scatterTool.selectedHandleRole = "point";
      }
    }
    if (mode === "select" || mode === "move") {
      beginTouchGrabConfirm(event, function () {
        applyScatterPointSelection();
        scatterBeginPointDrag(node, hit.pointIndex, ground, event.pointerId);
      });
      return true;
    }
    applyScatterPointSelection();
    if (mode === "extrude") {
      if (!ground) {
        setStatus("No ground hit.", "error");
      } else if (!scatterInsertHit) {
        setStatus("Druk tussen twee punten.", "error");
      } else {
        scatterBeginExtrudeSession(node, ground, event.pointerId, scatterInsertHit);
      }
    } else if (mode === "rotate") {
      if (!ground) {
        setStatus("No ground hit.", "error");
      } else {
        scatterBeginRotateSession(node, ground, event.pointerId);
      }
    } else if (mode === "scale") {
      if (!ground) {
        setStatus("No ground hit.", "error");
      } else {
        scatterBeginScaleSession(node, ground, event.pointerId);
      }
    } else if (mode === "delete") {
      void scatterDeleteMultiPoint(node);
    } else {
      scatterFinishWithRender();
    }
    return true;
  }

  if (hit.handleRole === "center") {
    if (mode === "extrude") {
      if (!ground) {
        setStatus("No ground hit.", "error");
      } else if (!scatterInsertHit) {
        setStatus("Druk tussen twee punten.", "error");
      } else {
        scatterBeginExtrudeSession(node, ground, event.pointerId, scatterInsertHit);
      }
    } else if (mode === "select" || mode === "move") {
      beginTouchGrabConfirm(event, function () {
        scatterSetSelection(null, "center");
        scatterBeginCenterDrag(node, ground, event.pointerId);
      });
    } else if (mode === "rotate") {
      scatterSetSelection(null, "center");
      if (!ground) {
        setStatus("No ground hit.", "error");
      } else {
        scatterBeginRotateSession(node, ground, event.pointerId);
      }
    } else if (mode === "scale") {
      scatterSetSelection(null, "center");
      if (!ground) {
        setStatus("No ground hit.", "error");
      } else {
        scatterBeginScaleSession(node, ground, event.pointerId);
      }
    } else {
      scatterSetSelection(null, "center");
      scatterFinishWithRender();
    }
    return true;
  }

  return false;
}

function handleScatterPointerMove(event) {
  terrainRememberPointer(event);
  cancelPointLongPressForMove(event);
  if (runtimeTransformActive()) {
    if (runtime && typeof runtime.previewTransformAt === "function") runtime.previewTransformAt(event.clientX, event.clientY);
    return false;
  }
  const isKeyboardSession = scatterHasActiveSession() && state.scatterTool.dragPointerId === null;
  const isPointerSession = state.scatterTool.dragPointerId !== null && event.pointerId === state.scatterTool.dragPointerId;
  if (!isKeyboardSession && !isPointerSession) return false;
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
  const node = nodeById(state.scatterTool.dragNodeId) || selectedScatterNode();
  if (!node) return false;
  const ground = terrainGroundPointFromEvent(event);
  if (!ground) return false;
  state.scatterTool.dragCurrentGround = { x: ground.x, z: ground.z };
  if (!state.scatterTool.dragStartGround) state.scatterTool.dragStartGround = { x: ground.x, z: ground.z };
  state.scatterTool.dragMoved = true;
  if (state.scatterTool.draggingHandleRole === "extrude") {
    state.scatterTool.dragPreviewPoint = { x: ground.x, z: ground.z };
  }
  scatterRenderOverlayPreview();
  return true;
}

function handleScatterPointerUp(event) {
  terrainRememberPointer(event);
  finishPointLongPress(event);
  if (runtimeTransformActive()) {
    if (runtime && typeof runtime.previewTransformAt === "function") runtime.previewTransformAt(event.clientX, event.clientY);
    return false;
  }
  if (state.scatterTool.dragPointerId === null || event.pointerId !== state.scatterTool.dragPointerId) return false;
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
  suppressNextViewportRuntimeClick();
  if (event.type === "pointercancel") {
    scatterCancelActiveSession();
    return true;
  }
  const node = nodeById(state.scatterTool.dragNodeId) || selectedScatterNode();
  if (!node) {
    scatterCancelActiveSession();
    return true;
  }
  if (state.scatterTool.draggingHandleRole === "center") {
    void scatterCommitCenterDrag(node);
    return true;
  }
  if (state.scatterTool.draggingHandleRole === "rotate") {
    void scatterCommitRotate(node);
    return true;
  }
  if (state.scatterTool.draggingHandleRole === "scale") {
    void scatterCommitScale(node);
    return true;
  }
  if (Number.isInteger(state.scatterTool.draggingPointIndex)) {
    void scatterCommitPointDrag(node);
    return true;
  }
  scatterCancelActiveSession();
  return true;
}

function handleTerrainPointerMove(event) {
  terrainRememberPointer(event);
  if (updateViewportTouchEditState(event)) {
    cancelViewportTouchEditSessionsForPan();
    return;
  }
  cancelPointLongPressForMove(event);
  cancelTouchGrabConfirmForMove(event);
  if (runtimeTransformActive()) {
    if (runtime && typeof runtime.previewTransformAt === "function") runtime.previewTransformAt(event.clientX, event.clientY);
    return;
  }
  if (handleScatterPointerMove(event)) return;
  const isKeyboardSession = terrainHasActiveSession() && state.terrainTool.dragPointerId === null;
  const isPointerSession = state.terrainTool.dragPointerId !== null && event.pointerId === state.terrainTool.dragPointerId;
  if (!isKeyboardSession && !isPointerSession) return;
  if (
    !isKeyboardSession
    && state.terrainTool.draggingPointIndex === null
    && state.terrainTool.draggingHandleRole !== "center"
    && state.terrainTool.draggingHandleRole !== "scale"
    && state.terrainTool.draggingHandleRole !== "rotate"
    && state.terrainTool.draggingHandleRole !== "geoscale"
  ) return;
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
  if (state.terrainTool.draggingHandleRole === "scale") {
    const node = nodeById(state.terrainTool.dragNodeId) || selectedTerrainNode();
    if (!node) return;
    const pointer = { x: Number(event.clientX) || 0, y: Number(event.clientY) || 0 };
    if (!state.terrainTool.dragStartPointer) state.terrainTool.dragStartPointer = pointer;
    terrainUpdateScalePreview(node, pointer);
    return;
  }
  const node = nodeById(state.terrainTool.dragNodeId) || selectedTerrainNode();
  if (!node) return;
  const pointer = { x: Number(event.clientX) || 0, y: Number(event.clientY) || 0 };
  if (!state.terrainTool.dragStartPointer) state.terrainTool.dragStartPointer = pointer;
  state.terrainTool.dragCurrentPointer = pointer;
  const ground = terrainGroundPointFromEvent(event);
  if (ground) {
    if (!state.terrainTool.dragStartGround) state.terrainTool.dragStartGround = { x: ground.x, z: ground.z };
    state.terrainTool.dragCurrentGround = { x: ground.x, z: ground.z };
  }
  if (!ground && !terrainVerticalHeightSession(node)) return;
  state.terrainTool.dragMoved = true;
  if (state.terrainTool.draggingHandleRole === "extrude" && ground) {
    state.terrainTool.dragPreviewPoint = { x: ground.x, z: ground.z };
  }
  terrainRenderOverlayPreview();
}

function handleTerrainPointerUp(event) {
  terrainRememberPointer(event);
  if (updateViewportTouchEditState(event)) {
    cancelViewportTouchEditSessionsForPan();
    return;
  }
  finishPointLongPress(event);
  cancelTouchGrabConfirmForEnd(event);
  if (runtimeTransformActive()) {
    if (runtime && typeof runtime.previewTransformAt === "function") runtime.previewTransformAt(event.clientX, event.clientY);
    return;
  }
  if (handleScatterPointerUp(event)) return;
  if (state.terrainTool.dragPointerId === null || event.pointerId !== state.terrainTool.dragPointerId) return;
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
  suppressNextViewportRuntimeClick();
  if (event.type === "pointercancel") {
    terrainCancelActiveSession();
    return;
  }
  const node = nodeById(state.terrainTool.dragNodeId) || selectedTerrainNode();
  if (!node) {
    terrainCancelActiveSession();
    return;
  }
  if (state.terrainTool.draggingHandleRole === "center") {
    void terrainCommitSurfaceDrag(node);
    return;
  }
  if (state.terrainTool.draggingHandleRole === "scale") {
    void terrainCommitScale(node);
    return;
  }
  if (state.terrainTool.draggingHandleRole === "rotate" || state.terrainTool.draggingHandleRole === "geoscale") {
    void terrainCommitGroupTransform(node, state.terrainTool.draggingHandleRole);
    return;
  }
  if (Number.isInteger(state.terrainTool.draggingPointIndex)) {
    void terrainCommitPointDrag(node);
    return;
  }
  terrainCancelActiveSession();
}

function handleTerrainMouseUpFallback(event) {
  if (event.button !== 0 || runtimeTransformActive()) return;
  if (state.scatterTool.dragPointerId !== null) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    const node = nodeById(state.scatterTool.dragNodeId) || selectedScatterNode();
    if (node) void commitActiveScatterSession(node);
    else scatterCancelActiveSession();
    return;
  }
  if (state.terrainTool.dragPointerId !== null) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    const node = nodeById(state.terrainTool.dragNodeId) || selectedTerrainNode();
    if (node) void commitActiveTerrainSession(node);
    else terrainCancelActiveSession();
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
  if (!["G", "R", "T", "X", "Y", "Z"].includes(letter)) return "";
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

function terrainKeyboardOwnsShortcuts(terrainNode, event) {
  if (!terrainNode) return false;
  if (terrainHasActiveSession()) return true;
  if (runtimeTransformActive()) return false;
  if (!event?.altKey && !(event?.ctrlKey || event?.metaKey)
    && (keyMatches(event, "g") || keyMatches(event, "r") || keyMatches(event, "t"))
    && runtimeModelEntityIdAtLastPointer()) {
    return false;
  }
  return !selectedModelNode();
}

function scatterKeyboardOwnsShortcuts(scatterNode, event) {
  if (!scatterNode) return false;
  if (scatterHasActiveSession()) return true;
  if (runtimeTransformActive()) return false;
  if (event?.altKey || event?.ctrlKey || event?.metaKey) return false;
  return keyMatches(event, "g")
    || keyMatches(event, "r")
    || keyMatches(event, "t")
    || keyMatches(event, "f")
    || event.key === "Escape"
    || event.key === "Delete"
    || event.key === "Backspace"
    || event.key === ".";
}

function handleEditorKeyDown(event) {
  const meta = event.ctrlKey || event.metaKey;
  if (isEditableTarget(event.target)) return;
  const shortcutLabel = viewportShortcutDebugLabel(event);
  if (shortcutLabel) setViewportShortcutDebug(shortcutLabel);
  const scatterNode = selectedScatterNode();
  if (scatterKeyboardOwnsShortcuts(scatterNode, event)) {
    const selectedIndex = Number.isInteger(state.scatterTool.selectedPointIndex)
      ? state.scatterTool.selectedPointIndex
      : (state.scatterTool.selectedPointIndices.length
        ? state.scatterTool.selectedPointIndices[state.scatterTool.selectedPointIndices.length - 1]
        : null);
    if (!event.altKey && !meta && keyMatches(event, "g")) {
      consumeShortcutEvent(event);
      if (!Number.isInteger(selectedIndex)) {
        if (!scatterBeginCenterDrag(scatterNode, terrainLastPointer ? terrainGroundPointFromClient(terrainLastPointer.clientX, terrainLastPointer.clientY) : null, null)) {
          setStatus("Select a point first.", "error");
        } else {
          setStatus("Move ready. Click or Enter to confirm.", "");
        }
        return;
      }
      if (!scatterBeginPointDrag(scatterNode, selectedIndex, terrainLastPointer ? terrainGroundPointFromClient(terrainLastPointer.clientX, terrainLastPointer.clientY) : null, null)) {
        setStatus("Select a point first.", "error");
        return;
      }
      setStatus("Move ready. Click or Enter to confirm.", "");
      return;
    }
    if (!event.altKey && !meta && keyMatches(event, "r")) {
      consumeShortcutEvent(event);
      if (!scatterBeginRotateSession(scatterNode, terrainLastPointer ? terrainGroundPointFromClient(terrainLastPointer.clientX, terrainLastPointer.clientY) : null, null)) {
        return;
      }
      setStatus("Rotate ready. Click or Enter to confirm.", "");
      return;
    }
    if (!event.altKey && !meta && keyMatches(event, "t")) {
      consumeShortcutEvent(event);
      if (!scatterBeginScaleSession(scatterNode, terrainLastPointer ? terrainGroundPointFromClient(terrainLastPointer.clientX, terrainLastPointer.clientY) : null, null)) return;
      setStatus("Scale ready. Click or Enter to confirm.", "");
      return;
    }
    if (!event.altKey && !meta && keyMatches(event, "f")) {
      consumeShortcutEvent(event);
      scatterCancelActiveSession();
      state.scatterTool.mode = "extrude";
      setStatus("Add ready. Druk tussen twee punten en sleep; loslaten bevestigt.", "");
      scatterFinishWithRender();
      return;
    }
    if (event.key === "Escape") {
      consumeShortcutEvent(event);
      if (scatterHasActiveSession()) {
        scatterCancelActiveSession();
        return;
      }
      deselectViewportClick();
      return;
    }
    if (event.key === "Enter") {
      consumeShortcutEvent(event);
      if (scatterHasActiveSession()) {
        const activeNode = nodeById(state.scatterTool.dragNodeId) || scatterNode;
        if (state.scatterTool.draggingHandleRole === "center") {
          void scatterCommitCenterDrag(activeNode);
        } else if (state.scatterTool.draggingHandleRole === "rotate") {
          void scatterCommitRotate(activeNode);
        } else if (state.scatterTool.draggingHandleRole === "scale") {
          void scatterCommitScale(activeNode);
        } else {
          void scatterCommitPointDrag(activeNode);
        }
        return;
      }
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (state.scatterTool.selectedPointIndices.length > 1) {
        consumeShortcutEvent(event);
        void scatterDeleteMultiPoint(scatterNode);
        return;
      }
      if (Number.isInteger(state.scatterTool.selectedPointIndex)) {
        consumeShortcutEvent(event);
        void scatterDeletePoint(scatterNode, state.scatterTool.selectedPointIndex);
        return;
      }
      // No point selected - fall through to the generic "delete selected node" handler
      // below instead of swallowing the key with nothing to delete.
    }
    if (event.code === "NumpadDecimal" || event.key === ".") {
      consumeShortcutEvent(event);
      if (runtime) focusTerrainOrSelected();
      return;
    }
  }
  const terrainNode = selectedTerrainNode();
  if (terrainKeyboardOwnsShortcuts(terrainNode, event)) {
    const selectedIndex = Number.isInteger(state.terrainTool.selectedPointIndex)
      ? state.terrainTool.selectedPointIndex
      : (state.terrainTool.selectedPointIndices.length
        ? state.terrainTool.selectedPointIndices[state.terrainTool.selectedPointIndices.length - 1]
        : null);
    if (!event.altKey && !meta && (event.key === "1" || event.key === "2" || event.key === "3")) {
      consumeShortcutEvent(event);
      if (terrainHasActiveSession()) {
        setStatus("Finish or cancel the current action first.", "");
        return;
      }
      setTerrainActiveChannel(event.key === "2" ? "secondary" : event.key === "3" ? "edge" : "main");
      return;
    }
    if (!event.altKey && !meta && keyMatches(event, "g")) {
      consumeShortcutEvent(event);
      if (!Number.isInteger(selectedIndex)) {
        if (!terrainNodeCapabilities(terrainNode).centerEditable) {
          setStatus("Select a point first.", "error");
          return;
        }
        if (!terrainBeginSurfaceDrag(terrainNode, terrainLastPointer ? terrainGroundPointFromClient(terrainLastPointer.clientX, terrainLastPointer.clientY) : null, null)) {
          setStatus("No ground hit.", "error");
        } else {
          setStatus("Move ready. Click or Enter to confirm.", "");
        }
        return;
      }
      if (!terrainBeginPointDrag(terrainNode, selectedIndex, terrainLastPointer ? terrainGroundPointFromClient(terrainLastPointer.clientX, terrainLastPointer.clientY) : null, null)) {
        setStatus("Select a point first.", "error");
        return;
      }
      setStatus("Move ready. Click or Enter to confirm.", "");
      return;
    }
    if (!event.altKey && !meta && keyMatches(event, "f")) {
      consumeShortcutEvent(event);
      if (!terrainNodeCapabilities(terrainNode).allowExtrude) {
        setStatus("Extrude is not available here.", "error");
        return;
      }
      terrainCancelActiveSession();
      state.terrainTool.mode = "extrude";
      state.terrainTool.axisConstraint = null;
      setStatus("Add ready. Druk tussen twee punten en sleep; loslaten bevestigt.", "");
      terrainFinishWithRender();
      return;
    }
    if (!event.altKey && !meta && keyMatches(event, "t")) {
      consumeShortcutEvent(event);
      if (!terrainBeginGroupTransformSession(terrainNode, terrainLastPointerGroundPoint(), null, "geoscale")) {
        return;
      }
      setStatus("Scale ready. Click or Enter to confirm.", "");
      return;
    }
    if (!event.altKey && !meta && keyMatches(event, "r")) {
      consumeShortcutEvent(event);
      if (!terrainBeginGroupTransformSession(terrainNode, terrainLastPointer ? terrainGroundPointFromClient(terrainLastPointer.clientX, terrainLastPointer.clientY) : null, null, "rotate")) {
        return;
      }
      setStatus("Rotate ready. Click or Enter to confirm.", "");
      return;
    }
    if (!event.altKey && !meta && (keyMatches(event, "x") || keyMatches(event, "y") || keyMatches(event, "z"))) {
      consumeShortcutEvent(event);
      if (keyMatches(event, "z")) {
        if (terrainNode.type !== "walkable_surface") return;
        if (!terrainHasActiveSession()) {
          if (Number.isInteger(selectedIndex)) {
            if (!terrainBeginPointDrag(terrainNode, selectedIndex, terrainLastPointer ? terrainGroundPointFromClient(terrainLastPointer.clientX, terrainLastPointer.clientY) : null, null)) {
              setStatus("Select a point first.", "error");
              return;
            }
          } else if (!terrainBeginSurfaceDrag(terrainNode, terrainLastPointer ? terrainGroundPointFromClient(terrainLastPointer.clientX, terrainLastPointer.clientY) : null, null)) {
            setStatus("No point or center available.", "error");
            return;
          }
        }
        state.terrainTool.axisConstraint = "z";
      } else {
        state.terrainTool.axisConstraint = keyMatches(event, "x") ? "x" : "y";
      }
      if (terrainHasActiveSession()) {
        const activeNode = nodeById(state.terrainTool.dragNodeId) || terrainNode;
        if (state.terrainTool.draggingHandleRole === "scale") {
          terrainUpdateScalePreview(activeNode, state.terrainTool.dragCurrentPointer || state.terrainTool.dragStartPointer);
        } else if (state.terrainTool.draggingHandleRole === "extrude" && (state.terrainTool.dragCurrentGround || state.terrainTool.axisConstraint === "z")) {
          terrainRenderOverlayPreview();
        } else if (state.terrainTool.draggingHandleRole === "rotate" || state.terrainTool.draggingHandleRole === "geoscale") {
          terrainRenderOverlayPreview();
        } else if (state.terrainTool.draggingHandleRole === "point" || state.terrainTool.draggingHandleRole === "center") {
          terrainRenderOverlayPreview();
        }
      }
      if (state.terrainTool.axisConstraint === "z") {
        setStatus("Height move ready. Move pointer and confirm.", "");
      }
      terrainFinishWithRender();
      return;
    }
    if (event.key === "Escape") {
      consumeShortcutEvent(event);
      if (terrainHasActiveSession()) {
        terrainCancelActiveSession();
        state.terrainTool.mode = "select";
        state.terrainTool.axisConstraint = null;
        terrainFinishWithRender();
        return;
      }
      state.terrainTool.axisConstraint = null;
      deselectViewportClick();
      return;
    }
    if (event.key === "Enter") {
      consumeShortcutEvent(event);
      if (terrainHasActiveSession()) {
        const activeNode = nodeById(state.terrainTool.dragNodeId) || terrainNode;
        if (state.terrainTool.draggingHandleRole === "scale") {
          void terrainCommitScale(activeNode);
        } else if (state.terrainTool.draggingHandleRole === "center") {
          void terrainCommitSurfaceDrag(activeNode);
        } else if (state.terrainTool.draggingHandleRole === "rotate" || state.terrainTool.draggingHandleRole === "geoscale") {
          void terrainCommitGroupTransform(activeNode, state.terrainTool.draggingHandleRole);
        } else {
          void terrainCommitPointDrag(activeNode);
        }
        state.terrainTool.axisConstraint = null;
        return;
      }
      if (runtime && typeof runtime.isTransformActive === "function" && runtime.isTransformActive()) {
        confirmRuntimeTransform();
        return;
      }
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (state.terrainTool.selectedPointIndices.length > 1) {
        consumeShortcutEvent(event);
        void terrainDeleteMultiPoint(terrainNode);
        return;
      }
      if (Number.isInteger(state.terrainTool.selectedPointIndex)) {
        consumeShortcutEvent(event);
        void terrainDeletePoint(terrainNode, state.terrainTool.selectedPointIndex);
        return;
      }
      // No point selected - fall through to the generic "delete selected node" handler
      // below instead of swallowing the key with nothing to delete.
    }
    if (event.key === ".") {
      consumeShortcutEvent(event);
      focusTerrainOrSelected();
      return;
    }
  }
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
  if (event.altKey && !meta && keyMatches(event, "t")) {
    consumeShortcutEvent(event);
    resetSelectedModelTransform("scale");
    return;
  }
  if (event.key === "Escape") {
    // A touch Move/Rot/Scale button press only arms the mode (see
    // beginRuntimeTransformFromShortcut) - the transform itself doesn't exist yet until
    // the driving touchdown, so isTransformActive() below is still false in that window.
    // Clearing the arm here too means Escape backs out of that "waiting for a touch"
    // state instead of silently falling through to deselecting the node.
    if (runtime && typeof runtime.clearPendingTouchTransform === "function") runtime.clearPendingTouchTransform();
    if (runtime && typeof runtime.isTransformActive === "function" && runtime.isTransformActive()) {
      consumeShortcutEvent(event);
      cancelRuntimeTransform();
      return;
    }
    if (selectedModelNode() || runtimeSelectedEntityId() || state.selectedNodeIds.length || state.selectedEdgeIds.length || state.pendingEdge) {
      consumeShortcutEvent(event);
      deselectViewportClick();
      return;
    }
    return;
  }
  if ((event.key === "Delete" || event.key === "Backspace") && (state.selectedNodeIds.length || state.selectedEdgeIds.length)) {
    event.preventDefault();
    deleteSelectedNodes();
    return;
  }
  if (!event.altKey && !meta && (keyMatches(event, "g")) && runtime) {
    consumeShortcutEvent(event);
    setViewportMode("translate");
    setViewportAxis(null);
    beginRuntimeTransformFromShortcut("move", "Move.");
    return;
  }
  if (!event.altKey && !meta && (keyMatches(event, "r")) && runtime) {
    consumeShortcutEvent(event);
    setViewportMode("rotate");
    setViewportAxis(null);
    beginRuntimeTransformFromShortcut("rotate", "Rotate Z.");
    return;
  }
  if (!event.altKey && !meta && keyMatches(event, "t") && runtime) {
    consumeShortcutEvent(event);
    setViewportMode("scale");
    setViewportAxis(null);
    beginRuntimeTransformFromShortcut("scale", "Scale.");
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
  if (event.code === "NumpadDecimal" || event.key === ".") {
    consumeShortcutEvent(event);
    if (runtime) focusTerrainOrSelected();
  }
}

window.addEventListener("keydown", handleEditorKeyDown, true);
window.addEventListener("pointermove", handleRuntimeTransformMoveEvent, true);
window.addEventListener("pointerup", handleRuntimeTransformEndEvent, true);
window.addEventListener("pointercancel", handleRuntimeTransformEndEvent, true);
window.addEventListener("mousemove", handleRuntimeTransformMoveEvent, true);
window.addEventListener("mouseup", handleRuntimeTransformEndEvent, true);
window.addEventListener("pointerdown", handleTerrainPointerDown, true);
window.addEventListener("pointermove", handleTerrainPointerMove, true);
window.addEventListener("pointerup", handleTerrainPointerUp, true);
window.addEventListener("pointercancel", handleTerrainPointerUp, true);
window.addEventListener("mouseup", handleTerrainMouseUpFallback, true);
window.addEventListener("blur", clearViewportTouchEditState, true);

initMobileControls();
boot().catch(function (error) {
  console.error(error);
  setStatus("Editor start mislukt: " + (error?.message || String(error)), "error");
  renderAuthoringHub();
  renderGraph();
  renderInspector();
});
