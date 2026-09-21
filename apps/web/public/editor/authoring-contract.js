import { NODE_TYPES } from "../shared/node-types.js?v=20260911-authoring04-fix02";

const GROUP_CLASS_DEFAULTS = Object.freeze({
  world: "viewport_tool",
  terrain: "viewport_tool",
  collision: "viewport_tool",
  gameplay: "viewport_tool",
  entities: "contextual_behavior",
  spawns: "viewport_tool",
  zones: "viewport_tool",
  campaigns: "logic_flow",
  quests: "logic_flow",
  dialogue: "logic_flow",
  conditions: "logic_flow",
  actions: "logic_flow",
  rewards: "logic_flow",
  "player rules": "logic_flow",
  ui: "contextual_behavior",
  catalog: "data_reference",
  combat: "data_reference",
  values: "data_reference",
  crafting: "data_reference",
  vendors: "data_reference",
  presentation: "data_reference",
  input: "contextual_behavior",
  project: "managed_infrastructure",
  output: "managed_infrastructure",
  organize: "managed_infrastructure",
  legacy: "managed_infrastructure"
});

const MANAGED_INFRASTRUCTURE_TYPES = new Set([
  "game_output",
  "group",
  "graph_frame",
  "group_input",
  "group_output",
  "world_settings",
  "editor_world_settings",
  "game_world_settings",
  "editor_chunk_loading",
  "game_chunk_loading",
  "game_project_settings",
  "chunk_grid_definition",
  "mmo_network_settings",
  "world_assembly",
  "legacy_world_adapter"
]);

const HIDDEN_FUTURE_TYPES = new Set([
  "top_down_camera"
]);

const VIEWPORT_TOOL_TYPES = new Set([
  "model_entity",
  "bounded_area_scatter"
]);

const CONTEXTUAL_BEHAVIOR_TYPES = new Set([
  "zone_environment_settings",
  "zone_gameplay_rules",
  "area_environment_override",
  "quest_target_binding",
  "marker_visibility_rule",
  "path_behavior_profile"
]);

const AUTHORING_ROUTES = Object.freeze([
  {
    id: "world_zone",
    label: "Wereld / Zone",
    summary: "Open bestaande root-level Zone Canvas-workspaces of maak de eerste startzone.",
    allowedClasses: ["viewport_tool", "contextual_behavior"],
    libraryGroups: ["Zones", "World", "Terrain", "Collision", "Gameplay", "Entities", "Spawns"],
    workspaceKinds: [
      { kind: "zone", label: "Zone Canvas", emptyText: "Nog geen Zone Canvas gevonden." }
    ],
    primaryActionLabel: "Nieuwe startzone"
  },
  {
    id: "object_character",
    label: "Object of personage",
    summary: "Breng de 3D-viewport en Assets in beeld; behoud een bestaande selectie als die er is.",
    allowedClasses: ["viewport_tool", "contextual_behavior"],
    libraryGroups: ["Entities"],
    libraryTypes: ["model_entity", "bounded_area_scatter"],
    workspaceKinds: []
  },
  {
    id: "quest_dialogue",
    label: "Quest / Dialoog",
    summary: "Open bestaande Campaigns Groups en verfijn quest- of dialogue-logica.",
    allowedClasses: ["logic_flow"],
    libraryGroups: ["Campaigns", "Quests", "Dialogue", "Conditions", "Actions", "Rewards"],
    workspaceKinds: [
      { kind: "campaign", label: "Campaigns Group", emptyText: "Nog geen Campaigns Group gevonden." }
    ]
  },
  {
    id: "item_ability_stat",
    label: "Item / Ability / Stat",
    summary: "Open bestaande Catalog Groups en werk in item-, ability-, stat- en loot-definities.",
    allowedClasses: ["data_reference"],
    libraryGroups: ["Catalog", "Combat", "Values"],
    workspaceKinds: [
      { kind: "catalog", label: "Catalog Group", emptyText: "Nog geen Catalog Group gevonden." }
    ]
  },
  {
    id: "game_settings_ui",
    label: "Game-instellingen / UI",
    summary: "Kies tussen Player Rules en UI zonder project- of systeeminfrastructuur als normaal startpunt.",
    allowedClasses: ["logic_flow", "contextual_behavior"],
    libraryGroups: ["Player Rules", "UI"],
    workspaceKinds: [
      { kind: "player_rules", label: "Player Rules Group", emptyText: "Nog geen Player Rules Group gevonden." },
      { kind: "ui", label: "UI Group", emptyText: "Nog geen UI Group gevonden." }
    ]
  }
]);

const AUTHORING_ROUTE_BY_ID = new Map(AUTHORING_ROUTES.map(function (route) {
  return [route.id, route];
}));

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function routeById(routeId) {
  return AUTHORING_ROUTE_BY_ID.get(normalizeKey(routeId)) || null;
}

function groupClassForGroup(groupName) {
  return GROUP_CLASS_DEFAULTS[normalizeKey(groupName)] || null;
}

function isManagedInfrastructureType(type, def) {
  const normalizedType = normalizeKey(type);
  if (MANAGED_INFRASTRUCTURE_TYPES.has(normalizedType)) return true;
  if (normalizedType.endsWith("_output")) return true;
  if (normalizedType.endsWith("_registry")) return true;
  if (def?.hidden && normalizedType !== "top_down_camera") return true;
  return false;
}

export function classifyAuthoringNodeType(type, def = NODE_TYPES[type]) {
  const normalizedType = normalizeKey(type);
  if (HIDDEN_FUTURE_TYPES.has(normalizedType)) return "hidden_future";
  if (isManagedInfrastructureType(normalizedType, def)) return "managed_infrastructure";
  if (VIEWPORT_TOOL_TYPES.has(normalizedType)) return "viewport_tool";
  if (CONTEXTUAL_BEHAVIOR_TYPES.has(normalizedType)) return "contextual_behavior";
  return groupClassForGroup(def?.group) || "contextual_behavior";
}

export function authoringRouteById(routeId) {
  return routeById(routeId);
}

export function authoringRouteLabel(routeId) {
  return routeById(routeId)?.label || "";
}

export function authoringRouteSummary(routeId) {
  return routeById(routeId)?.summary || "";
}

export function authoringLibraryGroupsForRoute(routeId, nodeTypes = NODE_TYPES, query = "") {
  const route = routeById(routeId);
  if (!route) return [];
  const normalizedQuery = normalizeKey(query);
  const allowedClasses = new Set(route.allowedClasses || []);
  const allowedTypes = new Set((route.libraryTypes || []).map(normalizeKey));
  const allowedGroups = new Map((route.libraryGroups || []).map(function (groupName, index) {
    return [normalizeKey(groupName), index];
  }));
  const buckets = new Map();
  for (const [type, def] of Object.entries(nodeTypes || {})) {
    if (allowedTypes.size && !allowedTypes.has(normalizeKey(type))) continue;
    const classification = classifyAuthoringNodeType(type, def);
    if (!allowedClasses.has(classification)) continue;
    if (classification === "managed_infrastructure" || classification === "hidden_future") continue;
    const groupName = String(def?.group || "Other").trim() || "Other";
    const groupKey = normalizeKey(groupName);
    if (allowedGroups.size && !allowedGroups.has(groupKey)) continue;
    if (normalizedQuery) {
      const haystack = normalizeKey([def?.label, type, groupName, classification].filter(Boolean).join(" "));
      if (!haystack.includes(normalizedQuery)) continue;
    }
    if (!buckets.has(groupName)) buckets.set(groupName, []);
    buckets.get(groupName).push({ type, def, classification });
  }
  return Array.from(buckets.entries()).map(function ([groupName, items]) {
    items.sort(function (left, right) {
      const leftLabel = String(left.def?.label || left.type || "");
      const rightLabel = String(right.def?.label || right.type || "");
      return leftLabel.localeCompare(rightLabel, "nl", { sensitivity: "base" }) || String(left.type).localeCompare(String(right.type), "nl", { sensitivity: "base" });
    });
    return { group: groupName, items: items };
  }).sort(function (left, right) {
    const leftIndex = allowedGroups.has(normalizeKey(left.group)) ? allowedGroups.get(normalizeKey(left.group)) : Number.MAX_SAFE_INTEGER;
    const rightIndex = allowedGroups.has(normalizeKey(right.group)) ? allowedGroups.get(normalizeKey(right.group)) : Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || left.group.localeCompare(right.group, "nl", { sensitivity: "base" });
  });
}

function hasChildNodeOfType(nodes, parentId, type) {
  return nodes.some(function (candidate) {
    return candidate?.parentId === parentId && candidate?.type === type;
  });
}

function matchesWorkspaceKind(node, kind, nodes) {
  const normalizedKind = normalizeKey(kind);
  const groupKind = normalizeKey(node?.values?.groupKind);
  if (normalizedKind === "zone") {
    return node?.parentId == null
      && groupKind === "zone"
      && (node?.values?.zoneCanvas === true || hasChildNodeOfType(nodes, node?.id, "zone_definition"));
  }
  return groupKind === normalizedKind;
}

export function authoringWorkspacesForRoute(routeId, graph = { nodes: [] }) {
  const route = routeById(routeId);
  if (!route) return [];
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return (route.workspaceKinds || []).map(function (workspaceKind) {
    const kind = normalizeKey(workspaceKind.kind);
    const entries = nodes.filter(function (node) {
      return node?.type === "group" && matchesWorkspaceKind(node, kind, nodes);
    }).sort(function (left, right) {
      const leftTitle = String(left.values?.title || left.title || left.id || "");
      const rightTitle = String(right.values?.title || right.title || right.id || "");
      return leftTitle.localeCompare(rightTitle, "nl", { sensitivity: "base" });
    });
    return {
      kind: kind,
      label: workspaceKind.label,
      emptyText: workspaceKind.emptyText || "",
      nodes: entries
    };
  });
}

export function authoringRouteAllowsNodeType(routeId, type, def = NODE_TYPES[type]) {
  const route = routeById(routeId);
  if (!route) return false;
  const classification = classifyAuthoringNodeType(type, def);
  if (classification === "managed_infrastructure" || classification === "hidden_future") return false;
  return route.allowedClasses.includes(classification);
}

export function authoringRouteWorkspaceKinds(routeId) {
  return routeById(routeId)?.workspaceKinds || [];
}

export { AUTHORING_ROUTES };
