import { createGkWorldRuntime, effectiveWorldGroundBounds } from "../shared/world-runtime.js?v=20260820-rmb-pan-speed2";
import { DATA_TYPE_OPTIONS, dataTypeColor, groupInterfaceDefault, isMultiValueDataType, mmoNetworkFieldNodePatch, slugifyGroupPortName, worldSettingsPresetNodePatch } from "../shared/node-types.js?v=20260823-tracked-hud";
import {
  normalizeCanonicalId,
  normalizeReferenceList,
  normalizeTagList,
  normalizeTagQuery
} from "../shared/node-contract.js?v=20260717-node01-foundation";
import { referenceKindFromId, referenceMatchesKinds } from "../shared/reference-utils.js?v=20260717-node01-foundation";
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

const HEAD = 34;
const PAD = 8;
const PORT_ROW = 24;
const PORT_GAP = 4;
const NODE_WIDTH = 260;
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
  assetCardSize: loadStoredAssetCardSize(),
  mobilePanel: loadStoredMobilePanel(),
  allLayoutTree: null,
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
  breadcrumb: document.querySelector("#breadcrumb"),
  unsavedBadge: document.querySelector("#unsavedBadge"),
  mobilePanelTabs: document.querySelector("#mobilePanelTabs"),
  validationSection: document.querySelector("#validationSection"),
  nodeLibrarySection: document.querySelector("#nodeLibrarySection"),
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

async function apiOk(path, options) {
  const method = (options && options.method) || "GET";
  const response = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, options || {}));
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

function bumpUnsaved() {
  if (state.pendingUnsavedVisualCount > 0) {
    state.pendingUnsavedVisualCount -= 1;
    renderUnsaved();
    return;
  }
  state.unsaved += 1;
  renderUnsaved();
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
  return true;
}

function discardPendingUnsavedVisual() {
  if (state.pendingUnsavedVisualCount <= 0) return;
  state.pendingUnsavedVisualCount -= 1;
  if (state.unsaved > 0) state.unsaved -= 1;
  renderUnsaved();
}

function clearUnsaved() {
  state.unsaved = 0;
  state.pendingUnsavedVisualCount = 0;
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
  if (!node) return false;
  return VIEWPORT_AFFECTING_NODE_TYPES.has(node.type);
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

async function reloadGraph() {
  const graph = await api("/api/editor/graph");
  state.graph = graph;
  state.nodeTypes = graph.nodeTypes;
  await repairLoadedZoneCanvasGraph();
  ensureCurrentGroupExists();
  renderNodeLibrary();
  renderGraph();
  renderEdgeList();
  renderInspector();
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

function ensureCurrentGroupExists() {
  syncBreadcrumb();
}

// ---------- Node Library ----------
function renderNodeLibrary() {
  el.nodeLibrary.innerHTML = "";
  const query = (el.nodeLibrarySearch?.value || "").trim().toLowerCase();
  const groups = {};
  for (const [type, def] of Object.entries(state.nodeTypes)) {
    if (type === "game_output" || def.hidden || def.system) continue;
    if (query && !def.label.toLowerCase().includes(query)) continue;
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
      dot.style.background = accentColorForNodeDef(def);
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
  renderSpecialGroupLibrary(query);
  if (query && !el.nodeLibrary.children.length) {
    const empty = document.createElement("div");
    empty.className = "libEmpty";
    empty.textContent = "Geen nodes gevonden voor \"" + (el.nodeLibrarySearch?.value || "").trim() + "\".";
    el.nodeLibrary.appendChild(empty);
  }
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
    button.append(dot, label, plus);
    button.addEventListener("click", function () {
      if (preset.kind === "zone_canvas") addZoneCanvasFromLibrary();
      else addSpecialGroup(preset);
    });
    wrap.appendChild(button);
  }
  el.nodeLibrary.prepend(wrap);
}

async function addSpecialGroup(preset) {
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
  const explicitZ = Number(group?.values?.zoneGridZ);
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
    if (edge.fromNodeId === group.id && isZoneCanvasPortName(edge.fromPort)) return false;
    if (edge.fromNodeId === group.id && isZoneCanvasEntityGroupPort(outputPortByName.get(String(edge.fromPort || "")))) return false;
    if (edge.fromNodeId === group.id && ["entity", "entities"].includes(String(edge.fromPort || ""))) return false;
    if (edge.toNodeId === systemOutputId && isZoneCanvasPortName(edge.toPort)) return false;
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
    return !isZoneCanvasPackageGroupPort(port) && !isZoneCanvasEntityGroupPort(port);
  });
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
  if (isRoot) {
    ensureZoneRegistryForParent(graph, group.parentId || null, { x: group.x, y: group.y });
  }
  return true;
}

function normalizeZoneCanvasGroups(graph, parentId = null) {
  const groups = zoneCanvasGroupsForParent(parentId, graph);
  if (!groups.length) return null;
  const root = zoneCanvasRootGroupForParent(parentId, graph) || groups[0];
  removeZoneOutputLightEdges(graph);
  relocateZoneCanvasLightsToRoot(graph, parentId, groups);
  for (const group of groups) {
    const isRoot = group.id === root.id;
    const grid = isRoot ? { x: 0, z: 0 } : zoneCanvasGridForGroup(group, graph);
    group.values = Object.assign({}, group.values || {}, {
      zoneGridX: grid.x,
      zoneGridZ: grid.z
    });
    applyZoneCanvasGroupRole(graph, group, { root, isRoot });
    removeZoneCanvasGroupBoundaryEdges(graph, group);
    syncZoneCanvasBoundsToGrid(graph, group, grid);
    const output = zoneOutputForGroup(group.id, graph);
    if (output) {
      ensureGroupSystemNodesInGraph(graph, group.id);
      wireZoneCanvasChildrenToOutput(graph, group);
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
  const parentId = state.currentGroupId || null;
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
  const nextGraph = cloneGraphForRestore(state.graph);
  normalizeZoneCanvasGroups(nextGraph, parentId);
  const nextSource = nextGraph.nodes.find(function (node) { return node.id === groupId; });
  const sourceRoot = zoneCanvasRootGroupForGroup(nextSource, nextGraph) || nextSource;
  ensureZoneCanvasBasis(nextGraph, nextSource, {
    grid: sourceGrid,
    root: sourceRoot,
    isRoot: sourceRoot?.id === nextSource?.id
  });
  const position = {
    x: Math.round(Number(nextSource?.x || source.x || 0) + direction.graphX * ZONE_CANVAS_NODE_STEP_X),
    y: Math.round(Number(nextSource?.y || source.y || 0) + direction.graphY * ZONE_CANVAS_NODE_STEP_Y)
  };
  const result = appendZoneCanvasGroup(nextGraph, {
    parentId,
    grid: targetGrid,
    position,
    root: sourceRoot,
    isRoot: false,
    parentZoneId: nextSource?.id || groupId,
    parentSide: directionName
  });
  normalizeZoneCanvasGroups(nextGraph, parentId);
  await restoreGraphObject(nextGraph, {
    historyLabel: "Zone Canvas uitgebreid",
    selectedNodeIds: [result.group.id],
    selectedEdgeIds: [],
    refreshViewport: true,
    refreshValidation: true,
    afterApply: function () {
      focusGraphNode(result.group.id);
      setStatus("Zone " + direction.label.toLowerCase() + " toegevoegd.", "success");
    }
  });
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
  const requestedParentId = state.currentGroupId || null;
  const requestedParent = nodeById(requestedParentId);
  const zoneParentAdd = isZoneCanvasGroup(requestedParent);
  const rootOnlyZoneNode = zoneParentAdd && isZoneCanvasRootOnlyNodeType(type);
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
    refreshViewport: !zoneParentAdd || rootOnlyZoneNode,
    refreshValidation: true,
    afterApply: function (_, result) {
      createdNodeId = result?.nodeId || null;
      if (result?.nodeId) selectNode(result.nodeId, true);
      // Als "All" al open is, staat de Nodes-pane daar al zichtbaar - blijf op "All"
      // en laat selectNode() hierboven de nieuwe node daarin focussen, in plaats van
      // hier weg te springen naar de losse "Nodes"-tab (zie showMobileInspectorPanel).
      if (result?.nodeId && isMobileLayout() && state.mobilePanel !== "all") setMobilePanel("graph");
      setStatus(rootOnlyZoneNode ? "Light toegevoegd op root." : "Node toegevoegd.", "success");
    }
  });
  if (createdNodeId && zoneParentAdd && !rootOnlyZoneNode) {
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
  for (const node of nodes) el.nodeLayer.appendChild(buildNodeElement(node));
  renderEdges(nodes);
  syncSelectedNodeCard();
}

function buildNodeElement(node) {
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
    focusTerrainOrSelected();
  });
  return card;
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
  const cardinality = port.multiple ? "multiple" : "single";
  const required = port.required ? "required" : "optional";
  label.textContent = portDisplayName(port.dataType);
  wrap.title = port.label + " - " + port.dataType + " - " + required + " " + cardinality + (port.help ? " - " + port.help : "");
  wrap.append(dot, label);
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
      return { nodeId: node.id, values: entry.transform };
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
  const nextGraph = cloneGraphForRestore(state.graph);
  for (const patch of patches) {
    const target = nextGraph.nodes.find(function (node) { return node.id === patch.nodeId; });
    if (target) target.values = Object.assign({}, target.values, patch.values);
  }
  await restoreGraphObject(nextGraph, {
    historyLabel: "Groep transform",
    refreshViewport: true,
    refreshEdgeList: false,
    refreshValidation: false
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
      historyLabel: movingNodeIds.length > 1 ? "Nodes verplaatst" : "Node verplaatst",
      selectedNodeIds: movingNodeIds.slice(),
      refreshGraph: true,
      refreshEdgeList: false,
      refreshInspector: true,
      refreshViewport: zoneSnap.moved,
      refreshValidation: zoneSnap.moved,
      afterApply: function () {
        for (const [nodeId, position] of committedPositions) delete state.dragPreviewPositions[nodeId];
        scheduleEdgeRender();
        if (zoneSnap.collisions > 0) setStatus("Zone verplaatst en teruggesnapt: die canvaspositie is al bezet.", "");
        else setStatus(movingNodeIds.length > 1 ? "Nodes verplaatst." : "Node verplaatst.", "success");
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
  heading.className = "libGroupTitle";
  heading.textContent = def.label + " - " + nodeDisplayTitle(node);
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

function syncAsideContext() {
  const showInspector = hasInspectorSelection();
  if (isMobileLayout() && !showInspector && state.mobilePanel === "inspector") setMobilePanel("graph", false);
  // In de Blender-achtige "All"-lay-out zijn Tools/Nodes/3D vaak tegelijk zichtbaar,
  // dus daar wisselt het Tools-paneel tussen Node library en Inspector i.p.v. te stapelen.
  // (Let op: niet de module-scope `allLayoutActive` gebruiken hier - syncAsideContext()
  // wordt al bij regel ~341 top-level aangeroepen, vóór die `let` geïnitialiseerd is,
  // wat anders een TDZ ReferenceError geeft die de hele scriptinit blokkeert.)
  const swapInPlace = !isMobileLayout() || state.mobilePanel === "all";
  if (el.nodeLibrarySection) el.nodeLibrarySection.hidden = swapInPlace && showInspector;
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

function fieldHelpText(field) {
  return String(field?.help || field?.description || "").trim();
}

function applyFieldHelp(elements, helpText) {
  const help = String(helpText || "").trim();
  if (!help) return;
  for (const element of Array.isArray(elements) ? elements : [elements]) {
    if (!element) continue;
    element.title = help;
  }
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

function buildField(node, key, field) {
  if (field.hidden) return null;
  const wrap = document.createElement("div");
  wrap.className = "field";
  const label = document.createElement("label");
  label.textContent = field.label;
  const help = fieldHelpText(field);
  applyFieldHelp([wrap, label], help);
  wrap.appendChild(label);
  const value = effectiveFieldValue(field, node.values[key]);

  if (node.type === "bounded_area_scatter" && key === "sourceAssetIds") {
    wrap.appendChild(buildScatterSourcePicker(node, key, value));
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
    blank.textContent = field.dynamicOptions === "assetAnimations" ? animationBlankLabel(key) : "(kies)";
    select.appendChild(blank);
    const options = field.dynamicOptions === "assetAnimations"
      ? animationClipsForAsset(assetById(node.values.modelAssetId))
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
  } else if (field.type === "identity" || field.type === "reference") {
    const input = document.createElement("input");
    input.type = "text";
    input.spellcheck = false;
    input.autocomplete = "off";
    input.autocapitalize = "none";
    input.value = isBlankValue(value) ? "" : String(value);
    input.placeholder = field.type === "reference"
      ? ((Array.isArray(field.referenceKinds) && field.referenceKinds.length) ? field.referenceKinds.join(", ") : "reference.id")
      : (field.pattern || "canonical.id");
    applyFieldHelp(input, help);
    input.addEventListener("change", function () {
      patchInspectorField(node, key, field, normalizeFieldInputValue(field, input.value));
    });
    wrap.appendChild(input);
    if (field.type === "reference") {
      const expectedKinds = Array.isArray(field.referenceKinds)
        ? field.referenceKinds.map(function (kind) { return String(kind || "").trim().toLowerCase(); }).filter(Boolean)
        : [];
      if (expectedKinds.length) {
        const hint = document.createElement("div");
        hint.className = "inspectorHint";
        const currentKind = referenceKindFromId(value);
        hint.textContent = "Verwacht reference kind: " + expectedKinds.join(", ") + "." + (currentKind ? " Huidig: " + currentKind + "." : "");
        if (!isBlankValue(value) && !referenceMatchesKinds(String(value), expectedKinds)) {
          hint.classList.add("err");
        }
        wrap.appendChild(hint);
      }
    }
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
  intro.textContent = directionFilter
    ? "Pas hier de ports aan die aan deze Group Input/Output gekoppeld zijn."
    : "Dit is de echte groep-interface. Vul alleen het label in; de technische naam wordt automatisch gesluggifyt en blijft stabiel zodra je een port gebruikt.";
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
      await apiOk("/api/editor/nodes/" + nodeId + "/values", { method: "PATCH", body: JSON.stringify({ values: cleanPatch }) });
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
    const response = await fetch("/api/editor/minimap-bakes", { method: "POST", body: formData });
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
  const response = await fetch("/api/assets/import", { method: "POST", body: formData });
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

el.assetSearch.addEventListener("input", function () { state.assetSearch = el.assetSearch.value; renderAssets(); });
if (el.nodeLibrarySearch) el.nodeLibrarySearch.addEventListener("input", renderNodeLibrary);
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

// ---------- Save / publish / logout ----------
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

async function saveDraft() {
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
boot();
