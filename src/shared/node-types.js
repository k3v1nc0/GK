// Shared node schema. Engine knows capabilities; concrete game content lives in node values.
// No content is seeded here except one technical Game Output node.
//
// Each field has a "default" used when a node is first created. These are EDITABLE
// starting values, not seeded content: a fresh database still has no world and the
// game stays 404 until you publish. Change any default below to taste.

export const GAME_ACTIONS = [
  "move_forward",
  "move_back",
  "move_left",
  "move_right",
  "sprint",
  "interact",
  "rotate_cam_left",
  "rotate_cam_right",
  "zoom_in",
  "zoom_out",
  "cancel"
];

export const DATA_TYPE_COLORS = {
  world: "#7bd4ff",
  ground: "#7bd4ff",
  terrain: "#7fcf68",
  collision: "#f0b35a",
  camera: "#7bd4ff",
  light: "#7bd4ff",
  player: "#9be870",
  spawn: "#9be870",
  entity: "#d59bff",
  interactable: "#9be870",
  keybind: "#ff8da3",
  ui: "#c9d4dc",
  group: "#8a97a3"
};

export const DATA_TYPE_OPTIONS = Object.keys(DATA_TYPE_COLORS).filter(function (dataType) {
  return dataType !== "group";
});

function cloneDefaultValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === "function") {
    try { return structuredClone(value); } catch {}
  }
  return JSON.parse(JSON.stringify(value));
}

export function dataTypeColor(dataType) {
  return DATA_TYPE_COLORS[dataType] || "#6b7d8d";
}

export function isMultiValueDataType(dataType) {
  const output = NODE_TYPES?.game_output?.inputs?.[dataType];
  return Boolean(output?.multiple);
}

export function slugifyGroupPortName(value, fallback = "") {
  const raw = String(value || fallback || "").trim().toLowerCase();
  const slug = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || String(fallback || "").trim().toLowerCase() || "";
}

export function groupInterfaceDefault() {
  return {
    inputs: [
      {
        id: "input_keybinds",
        name: "keybinds_in",
        label: "Keybinds In",
        dataType: "keybind",
        multiple: true
      }
    ],
    outputs: [
      {
        id: "output_keybinds",
        name: "keybinds_out",
        label: "Keybinds",
        dataType: "keybind",
        multiple: true
      }
    ]
  };
}

function coerceGroupPort(port, fallbackName) {
  if (!port || typeof port !== "object") return null;
  const rawName = typeof port.name === "string" && port.name.trim()
    ? port.name.trim()
    : typeof port.id === "string" && port.id.trim()
      ? port.id.trim()
      : typeof fallbackName === "string" && fallbackName.trim()
        ? fallbackName.trim()
        : "";
  const name = slugifyGroupPortName(rawName, fallbackName);
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

export function normalizeGroupInterface(value) {
  const raw = value && typeof value === "object" ? value : {};
  const shouldUseDefault = Object.keys(raw).length === 0 && !Array.isArray(raw.inputs) && !Array.isArray(raw.outputs);
  if (shouldUseDefault) return groupInterfaceDefault();
  const inputs = Array.isArray(raw.inputs) ? raw.inputs : [];
  const outputs = Array.isArray(raw.outputs) ? raw.outputs : [];
  return {
    inputs: inputs.map(function (port, index) { return coerceGroupPort(port, "input_" + (index + 1)); }).filter(Boolean),
    outputs: outputs.map(function (port, index) { return coerceGroupPort(port, "output_" + (index + 1)); }).filter(Boolean)
  };
}

export function groupInterfaceForNode(node) {
  return normalizeGroupInterface(node?.values?.groupInterface);
}

export function portMapFromInterface(entries) {
  const map = {};
  for (const port of entries || []) {
    if (!port || typeof port !== "object") continue;
    if (typeof port.name !== "string" || !port.name.trim()) continue;
    const name = port.name.trim();
    const dataType = typeof port.dataType === "string" && port.dataType.trim()
      ? port.dataType.trim()
      : typeof port.type === "string" && port.type.trim()
        ? port.type.trim()
        : "";
    if (!dataType) continue;
    map[name] = {
      id: typeof port.id === "string" && port.id.trim() ? port.id.trim() : name,
      label: typeof port.label === "string" && port.label.trim() ? port.label.trim() : name,
      dataType: dataType,
      required: Boolean(port.required),
      multiple: port.multiple === undefined ? isMultiValueDataType(dataType) : Boolean(port.multiple)
    };
  }
  return map;
}

function portMapFromEntries(entries) {
  const map = {};
  for (const [portName, port] of Object.entries(entries || {})) {
    map[portName] = {
      label: port.label || portName,
      dataType: port.dataType,
      required: Boolean(port.required),
      multiple: port.multiple === undefined ? isMultiValueDataType(port.dataType) : Boolean(port.multiple)
    };
  }
  return map;
}

function definePortAliases(map, aliases) {
  Object.defineProperty(map, "__aliases", {
    value: aliases,
    enumerable: false,
    configurable: true
  });
  return map;
}

export function resolveNodePorts(node, nodeMap) {
  const definition = NODE_TYPES[node?.type];
  if (!definition) return { inputs: {}, outputs: {} };
  if (node.type === "group") {
    const groupInterface = groupInterfaceForNode(node);
    const inputs = portMapFromInterface(groupInterface.inputs);
    const outputs = portMapFromInterface(groupInterface.outputs);
    return {
      inputs: definePortAliases(inputs, groupInterface.inputs),
      outputs: definePortAliases(outputs, groupInterface.outputs)
    };
  }
  if (node.type === "group_input") {
    const parent = nodeMap?.get(node.parentId);
    const groupInterface = parent ? groupInterfaceForNode(parent) : groupInterfaceDefault();
    const outputs = portMapFromInterface(groupInterface.inputs);
    return {
      inputs: {},
      outputs: definePortAliases(outputs, groupInterface.inputs)
    };
  }
  if (node.type === "group_output") {
    const parent = nodeMap?.get(node.parentId);
    const groupInterface = parent ? groupInterfaceForNode(parent) : groupInterfaceDefault();
    const inputs = portMapFromInterface(groupInterface.outputs);
    return {
      inputs: definePortAliases(inputs, groupInterface.outputs),
      outputs: {}
    };
  }
  return {
    inputs: portMapFromEntries(definition.inputs),
    outputs: portMapFromEntries(definition.outputs)
  };
}

export function resolveNodePort(node, portName, direction, nodeMap) {
  const ports = resolveNodePorts(node, nodeMap);
  const direct = direction === "input" ? (ports.inputs || {})[portName] || null : (ports.outputs || {})[portName] || null;
  if (direct) return direct;
  const aliases = direction === "input" ? ports.inputs?.__aliases : ports.outputs?.__aliases;
  if (!aliases) return null;
  const aliasMatch = aliases.find(function (port) {
    const aliasName = slugifyGroupPortName(port?.label, port?.name || "");
    return port?.id === portName || aliasName === portName || port?.name === portName;
  });
  if (!aliasMatch) return null;
  return {
    label: aliasMatch.label || aliasMatch.name || portName,
    dataType: aliasMatch.dataType,
    required: Boolean(aliasMatch.required),
    multiple: aliasMatch.multiple === undefined ? isMultiValueDataType(aliasMatch.dataType) : Boolean(aliasMatch.multiple)
  };
}

export const NODE_TYPES = {
  game_output: {
    label: "Game Output",
    group: "Output",
    accent: "#ffb454",
    description: "The only publish target for the runtime game.",
    inputs: {
      world: { label: "World", dataType: "world", required: true, multiple: false },
      ground: { label: "Ground", dataType: "ground", required: true, multiple: false },
      camera: { label: "Camera", dataType: "camera", required: true, multiple: false },
      lights: { label: "Lights", dataType: "light", required: true, multiple: true },
      player: { label: "Player", dataType: "player", required: true, multiple: false },
      spawn: { label: "Spawn", dataType: "spawn", required: true, multiple: false },
      entities: { label: "Entities", dataType: "entity", required: false, multiple: true },
      interactables: { label: "Interactables", dataType: "interactable", required: false, multiple: true },
      keybinds: { label: "Keybinds", dataType: "keybind", required: false, multiple: true },
      ui: { label: "UI", dataType: "ui", required: false, multiple: true },
      terrain: { label: "Terrain Layers", dataType: "terrain", required: false, multiple: true },
      collision: { label: "Collision", dataType: "collision", required: false, multiple: true }
    },
    outputs: {},
    fields: {
      publishTarget: { label: "Publish target", type: "text", default: "runtime_world", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" }
    }
  },

  world_settings: {
    label: "World Settings",
    group: "World",
    accent: "#7bd4ff",
    description: "World identity and scene background.",
    inputs: {},
    outputs: { world: { label: "World", dataType: "world" } },
    fields: {
      worldId: { label: "World id", type: "text", default: "main_world", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      displayName: { label: "Display name", type: "text", default: "My World", required: false, maxLength: 96 },
      backgroundColor: { label: "Background color", type: "color", default: "#101a26", required: false },
      fogColor: { label: "Fog color", type: "color", default: "#101a26", required: false },
      fogDensity: { label: "Fog density", type: "number", default: 0, min: 0, max: 1, step: 0.001, required: false }
    }
  },

  ground_surface: {
    label: "Ground Surface",
    group: "World",
    accent: "#7bd4ff",
    description: "Runtime ground mesh and play-area bounds.",
    inputs: {},
    outputs: { ground: { label: "Ground", dataType: "ground" } },
    fields: {
      groundId: { label: "Ground id", type: "text", default: "main_ground", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      width: { label: "Width", type: "number", default: 60, min: 1, max: 10000, step: 1, required: true },
      depth: { label: "Depth", type: "number", default: 60, min: 1, max: 10000, step: 1, required: true },
      y: { label: "Y height", type: "number", default: 0, min: -1000, max: 1000, step: 0.01, required: true },
      materialColor: { label: "Material color", type: "color", default: "#3f6b3f", required: false },
      textureAssetId: { label: "Texture asset", type: "asset", assetTypes: ["texture", "image"], default: null, required: false },
      textureRepeat: { label: "Texture repeat", type: "number", default: 8, min: 1, max: 512, step: 1, required: false }
    }
  },

  terrain_layer: {
    label: "Terrain Layer",
    group: "Terrain",
    accent: "#7fcf68",
    description: "Basis materiaalgebieden zoals gras, zand, modder, steen, bloemen en dorpspleinen.",
    inputs: {},
    outputs: { terrain: { label: "Terrain", dataType: "terrain" } },
    fields: {
      layerId: { label: "Layer id", type: "text", default: "terrain_layer", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      label: { label: "Label", type: "text", default: "Village Grass", required: true, maxLength: 96 },
      material: { label: "Material", type: "select", options: ["grass", "sand", "stone", "mud", "flowers", "village_square"], default: "grass", required: true },
      priority: { label: "Priority", type: "number", default: 0, step: 1, required: true },
      opacity: { label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, required: true },
      color: { label: "Color", type: "color", default: "#6faa4f", required: true },
      textureAssetId: { label: "Texture asset", type: "asset", assetTypes: ["texture", "image"], default: null, required: false },
      shapeType: { label: "Shape type", type: "select", options: ["full", "polygon"], default: "full", required: true },
      points: { label: "Points", type: "json", default: [], required: false }
    }
  },

  path_layer: {
    label: "Path Layer",
    group: "Terrain",
    accent: "#d6b36a",
    description: "Zandpaden en stenen dorpspaden.",
    inputs: {},
    outputs: { terrain: { label: "Terrain", dataType: "terrain" } },
    fields: {
      pathId: { label: "Path id", type: "text", default: "path_main", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      label: { label: "Label", type: "text", default: "Main Path", required: true, maxLength: 96 },
      pathType: { label: "Path type", type: "select", options: ["sand", "stone", "dirt"], default: "sand", required: true },
      width: { label: "Width", type: "number", default: 3, min: 0.1, max: 10000, step: 0.1, required: true },
      edgeBlend: { label: "Edge blend", type: "number", default: 0.8, min: 0, max: 1, step: 0.01, required: true },
      yOffset: { label: "Y offset", type: "number", default: 0.01, min: -1000, max: 1000, step: 0.01, required: true },
      slightlySunken: { label: "Slightly sunken", type: "boolean", default: true, required: false },
      speedMultiplier: { label: "Speed multiplier", type: "number", default: 1, min: 0, max: 10, step: 0.1, required: true },
      materialMode: { label: "Material mode", type: "select", options: ["preset", "texture"], default: "preset", required: true },
      textureAssetId: { label: "Texture asset", type: "asset", assetTypes: ["texture", "image"], default: null, required: false },
      textureScale: { label: "Texture scale", type: "number", default: 4, min: 0.1, max: 200, step: 0.1, required: true },
      opacity: { label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, required: true },
      points: { label: "Points", type: "json", default: [], required: false }
    }
  },

  water_layer: {
    label: "Water Layer",
    group: "Terrain",
    accent: "#2f9ecf",
    description: "Rivier-, meer- en watergebieden.",
    inputs: {},
    outputs: { terrain: { label: "Terrain", dataType: "terrain" } },
    fields: {
      waterId: { label: "Water id", type: "text", default: "river_main", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      label: { label: "Label", type: "text", default: "Main River", required: true, maxLength: 96 },
      waterType: { label: "Water type", type: "select", options: ["river", "lake", "pond"], default: "river", required: true },
      width: { label: "Width", type: "number", default: 5, min: 0.1, max: 10000, step: 0.1, required: true },
      y: { label: "Y", type: "number", default: -0.15, min: -1000, max: 1000, step: 0.01, required: true },
      color: { label: "Color", type: "color", default: "#2f9ecf", required: true },
      flowSpeed: { label: "Flow speed", type: "number", default: 0.2, min: -100, max: 100, step: 0.01, required: true },
      blocksPlayer: { label: "Blocks player", type: "boolean", default: true, required: false },
      materialMode: { label: "Material mode", type: "select", options: ["preset", "texture"], default: "preset", required: true },
      textureAssetId: { label: "Texture asset", type: "asset", assetTypes: ["texture", "image"], default: null, required: false },
      textureScale: { label: "Texture scale", type: "number", default: 6, min: 0.1, max: 200, step: 0.1, required: true },
      opacity: { label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, required: true },
      points: { label: "Points", type: "json", default: [], required: false }
    }
  },

  surface_layer: {
    label: "Surface Layer",
    group: "Terrain",
    accent: "#8fbf6a",
    description: "Texture-first terrain surface voor paden, wegen, rivieren, modder, lava en sneeuw.",
    inputs: {},
    outputs: { terrain: { label: "Terrain", dataType: "terrain" } },
    fields: {
      surfaceId: { label: "Surface id", type: "text", default: "surface_main", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      label: { label: "Label", type: "text", default: "Surface", required: true, maxLength: 96 },
      surfaceKind: { label: "Surface kind", type: "select", options: ["path", "road", "water", "river", "mud", "lava", "snow", "custom"], default: "path", required: true },
      fallbackColor: { label: "Fallback color", type: "color", default: "#8a6f45", required: true },
      width: { label: "Width", type: "number", default: 3, min: 0.1, max: 10000, step: 0.1, required: true },
      yOffset: { label: "Y offset", type: "number", default: 0.02, min: -1000, max: 1000, step: 0.01, required: true },
      textureAssetId: { label: "Texture asset", type: "asset", assetTypes: ["texture", "image"], default: null, required: false },
      textureScaleX: { label: "Texture scale X", type: "number", default: 1, min: -1000, max: 1000, step: 0.01, required: true },
      textureScaleY: { label: "Texture scale Y", type: "number", default: 1, min: -1000, max: 1000, step: 0.01, required: true },
      textureScale: { label: "Texture scale (legacy)", type: "number", default: 4, min: 0.1, max: 200, step: 0.1, required: true },
      secondaryTextureAssetId: { label: "Secondary texture", type: "asset", assetTypes: ["texture", "image"], default: null, required: false },
      secondaryTextureScaleX: { label: "Secondary scale X", type: "number", default: 1, min: -1000, max: 1000, step: 0.01, required: true },
      secondaryTextureScaleY: { label: "Secondary scale Y", type: "number", default: 1, min: -1000, max: 1000, step: 0.01, required: true },
      secondaryTextureScale: { label: "Secondary scale (legacy)", type: "number", default: 8, min: 0.1, max: 200, step: 0.1, required: true },
      secondaryTextureStrength: { label: "Secondary strength", type: "number", default: 0.25, min: 0, max: 1, step: 0.01, required: true },
      edgeFadeWidth: { label: "Edge fade width", type: "number", default: 0.8, min: 0, max: 20, step: 0.05, required: true },
      edgeFadeNoiseAssetId: { label: "Edge noise asset", type: "asset", assetTypes: ["texture", "image"], default: null, required: false },
      edgeFadeNoiseScaleX: { label: "Edge noise scale X", type: "number", default: 1, min: -1000, max: 1000, step: 0.01, required: true },
      edgeFadeNoiseScaleY: { label: "Edge noise scale Y", type: "number", default: 1, min: -1000, max: 1000, step: 0.01, required: true },
      edgeFadeNoiseScale: { label: "Edge noise scale (legacy)", type: "number", default: 5, min: 0.1, max: 200, step: 0.1, required: true },
      edgeFadeNoiseStrength: { label: "Edge noise strength", type: "number", default: 0.35, min: 0, max: 1, step: 0.01, required: true },
      opacity: { label: "Opacity", type: "number", default: 1, min: 0, max: 1, step: 0.01, required: true },
      animated: { label: "Animated", type: "boolean", default: false, required: false },
      flowSpeed: { label: "Flow speed", type: "number", default: 0, min: -100, max: 100, step: 0.01, required: true },
      flowDirection: { label: "Flow direction", type: "number", default: 0, min: -360, max: 360, step: 1, required: true },
      flowTextureLayer: { label: "Flow texture layer", type: "select", options: ["main", "secondary", "both"], default: "main", required: true },
      blocksPlayer: { label: "Blocks player", type: "boolean", default: false, required: false },
      points: { label: "Points", type: "json", default: [], required: false }
    }
  },

  blocker_area: {
    label: "Blocker Area",
    group: "Collision",
    accent: "#f0b35a",
    description: "Berg, gat, muurgebied, diepe rand of verboden gebied.",
    inputs: {},
    outputs: { collision: { label: "Collision", dataType: "collision" } },
    fields: {
      blockerId: { label: "Blocker id", type: "text", default: "mountain_blocker_01", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      label: { label: "Label", type: "text", default: "Mountain Blocker", required: true, maxLength: 96 },
      shapeType: { label: "Shape type", type: "select", options: ["polygon", "box", "circle"], default: "polygon", required: true },
      x: { label: "X", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      z: { label: "Z", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      width: { label: "Width", type: "number", default: 4, min: 0.01, max: 10000, step: 0.01, required: true },
      depth: { label: "Depth", type: "number", default: 4, min: 0.01, max: 10000, step: 0.01, required: true },
      radius: { label: "Radius", type: "number", default: 2, min: 0.01, max: 10000, step: 0.01, required: true },
      points: { label: "Points", type: "json", default: [], required: false },
      reason: { label: "Reason", type: "select", options: ["mountain", "gap", "wall", "cliff", "forbidden"], default: "mountain", required: true }
    }
  },

  walkable_surface: {
    label: "Walkable Surface",
    group: "Collision",
    accent: "#f0b35a",
    description: "Bruggen, platte rotsen, houten vlonders en platforms.",
    inputs: {},
    outputs: { collision: { label: "Collision", dataType: "collision" } },
    fields: {
      surfaceId: { label: "Surface id", type: "text", default: "bridge_walk_01", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      label: { label: "Label", type: "text", default: "Bridge Walk Surface", required: true, maxLength: 96 },
      x: { label: "X", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      y: { label: "Y", type: "number", default: 0.35, min: -10000, max: 10000, step: 0.01, required: true },
      z: { label: "Z", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      width: { label: "Width", type: "number", default: 6, min: 0.01, max: 10000, step: 0.01, required: true },
      depth: { label: "Depth", type: "number", default: 2.5, min: 0.01, max: 10000, step: 0.01, required: true },
      rotationY: { label: "Rotation Y", type: "number", default: 0, min: -360, max: 360, step: 0.1, required: true },
      priority: { label: "Priority", type: "number", default: 10, step: 1, required: true }
    }
  },

  top_down_camera: {
    label: "Top-Down Camera",
    group: "World",
    accent: "#7bd4ff",
    description: "Follow camera tuned for a top-down game. Controlled at runtime by zoom and rotate.",
    inputs: {},
    outputs: { camera: { label: "Camera", dataType: "camera" } },
    fields: {
      cameraId: { label: "Camera id", type: "text", default: "main_camera", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      pitch: { label: "Pitch (deg)", type: "number", default: 55, min: 20, max: 89, step: 1, required: true },
      yaw: { label: "Yaw (deg)", type: "number", default: 0, min: -360, max: 360, step: 1, required: true },
      distance: { label: "Distance", type: "number", default: 24, min: 2, max: 400, step: 0.5, required: true },
      minDistance: { label: "Min zoom", type: "number", default: 10, min: 1, max: 400, step: 0.5, required: true },
      maxDistance: { label: "Max zoom", type: "number", default: 48, min: 2, max: 400, step: 0.5, required: true },
      fov: { label: "FOV", type: "number", default: 50, min: 20, max: 110, step: 1, required: true },
      follow: { label: "Follow player", type: "boolean", default: true, required: false },
      rotateSpeed: { label: "Rotate speed", type: "number", default: 90, min: 0, max: 360, step: 1, required: true }
    }
  },

  ambient_light: {
    label: "Ambient Light",
    group: "World",
    accent: "#7bd4ff",
    description: "Scene-wide light.",
    inputs: {},
    outputs: { light: { label: "Light", dataType: "light" } },
    fields: {
      lightId: { label: "Light id", type: "text", default: "ambient_light", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      color: { label: "Color", type: "color", default: "#ffffff", required: true },
      intensity: { label: "Intensity", type: "number", default: 0.6, min: 0, max: 20, step: 0.01, required: true }
    }
  },

  directional_light: {
    label: "Directional Light",
    group: "World",
    accent: "#7bd4ff",
    description: "Directional light and shadow source.",
    inputs: {},
    outputs: { light: { label: "Light", dataType: "light" } },
    fields: {
      lightId: { label: "Light id", type: "text", default: "sun_light", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      color: { label: "Color", type: "color", default: "#ffffff", required: true },
      intensity: { label: "Intensity", type: "number", default: 1.4, min: 0, max: 20, step: 0.01, required: true },
      x: { label: "X", type: "number", default: 12, min: -1000, max: 1000, step: 0.01, required: true },
      y: { label: "Y", type: "number", default: 20, min: -1000, max: 1000, step: 0.01, required: true },
      z: { label: "Z", type: "number", default: 8, min: -1000, max: 1000, step: 0.01, required: true }
    }
  },

  player_character: {
    label: "Player Character",
    group: "Gameplay",
    accent: "#9be870",
    description: "The controllable player. Spawned at the connected Player Spawn.",
    inputs: {},
    outputs: { player: { label: "Player", dataType: "player" } },
    fields: {
      playerId: { label: "Player id", type: "text", default: "player", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      modelAssetId: { label: "Model asset", type: "asset", assetTypes: ["model"], default: null, required: true },
      animationClip: { label: "Animation clip", type: "select", options: [], dynamicOptions: "assetAnimations", default: null, required: false },
      idleAnimation: { label: "Idle animation", type: "select", options: [], dynamicOptions: "assetAnimations", default: null, required: false },
      walkAnimation: { label: "Walk animation", type: "select", options: [], dynamicOptions: "assetAnimations", default: null, required: false },
      runAnimation: { label: "Run animation", type: "select", options: [], dynamicOptions: "assetAnimations", default: null, required: false },
      moveSpeed: { label: "Move speed", type: "number", default: 6, min: 0.1, max: 100, step: 0.1, required: true },
      sprintMultiplier: { label: "Sprint x", type: "number", default: 1.6, min: 1, max: 8, step: 0.1, required: true },
      turnSpeed: { label: "Turn speed", type: "number", default: 540, min: 1, max: 4000, step: 1, required: true },
      collisionRadius: { label: "Collision radius", type: "number", default: 0.5, min: 0.05, max: 50, step: 0.05, required: true },
      scale: { label: "Model scale", type: "number", default: 1, min: 0.001, max: 1000, step: 0.01, required: true }
    }
  },

  player_spawn: {
    label: "Player Spawn",
    group: "Gameplay",
    accent: "#9be870",
    description: "Where the player starts.",
    inputs: {},
    outputs: { spawn: { label: "Spawn", dataType: "spawn" } },
    fields: {
      spawnId: { label: "Spawn id", type: "text", default: "main_spawn", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      x: { label: "X", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      z: { label: "Z", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      facing: { label: "Facing (deg)", type: "number", default: 0, min: -360, max: 360, step: 1, required: true }
    }
  },

  model_entity: {
    label: "Model Entity",
    group: "Entities",
    accent: "#d59bff",
    description: "A GLB-backed scene object. Drop a model asset in the viewport to create one.",
    inputs: {},
    outputs: { entity: { label: "Entity", dataType: "entity" } },
    fields: {
      entityId: { label: "Entity id", type: "text", default: "entity", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      label: { label: "Label", type: "text", default: "Entity", required: false, maxLength: 96 },
      modelAssetId: { label: "Model asset", type: "asset", assetTypes: ["model"], default: null, required: true },
      animationClip: { label: "Animation clip", type: "select", options: [], dynamicOptions: "assetAnimations", default: null, required: false },
      idleAnimation: { label: "Idle animation", type: "select", options: [], dynamicOptions: "assetAnimations", default: null, required: false },
      walkAnimation: { label: "Walk animation", type: "select", options: [], dynamicOptions: "assetAnimations", default: null, required: false },
      runAnimation: { label: "Run animation", type: "select", options: [], dynamicOptions: "assetAnimations", default: null, required: false },
      x: { label: "X", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      y: { label: "Y", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      z: { label: "Z", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      rotationX: { label: "Rotation X", type: "number", default: 0, min: -360, max: 360, step: 0.1, required: true },
      rotationY: { label: "Rotation Y", type: "number", default: 0, min: -360, max: 360, step: 0.1, required: true },
      rotationZ: { label: "Rotation Z", type: "number", default: 0, min: -360, max: 360, step: 0.1, required: true },
      scaleX: { label: "Scale X", type: "number", default: 1, min: 0.001, max: 1000, step: 0.01, required: true },
      scaleY: { label: "Scale Y", type: "number", default: 1, min: 0.001, max: 1000, step: 0.01, required: true },
      scaleZ: { label: "Scale Z", type: "number", default: 1, min: 0.001, max: 1000, step: 0.01, required: true },
      solid: { label: "Solid (blocks player)", type: "boolean", default: false, required: false },
      collisionRadius: { label: "Collision radius", type: "number", default: 1, min: 0.05, max: 100, step: 0.05, required: false }
    }
  },

  interactable: {
    label: "Interactable",
    group: "Gameplay",
    accent: "#9be870",
    description: "A point the player can interact with. Optionally backed by a model.",
    inputs: {},
    outputs: { interactable: { label: "Interactable", dataType: "interactable" } },
    fields: {
      interactableId: { label: "Interactable id", type: "text", default: "interactable", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      prompt: { label: "Prompt text", type: "text", default: "Press to interact", required: true, maxLength: 120 },
      x: { label: "X", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      z: { label: "Z", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      radius: { label: "Trigger radius", type: "number", default: 2, min: 0.1, max: 100, step: 0.1, required: true },
      modelAssetId: { label: "Model asset", type: "asset", assetTypes: ["model"], default: null, required: false },
      actionType: { label: "Action", type: "select", options: ["message", "teleport"], default: "message", required: true },
      message: { label: "Message", type: "text", default: "You found something!", required: false, maxLength: 240 },
      teleportX: { label: "Teleport X", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: false },
      teleportZ: { label: "Teleport Z", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: false }
    }
  },

  keybind: {
    label: "Keybind",
    group: "Input",
    accent: "#ff8da3",
    description: "Binds a keyboard key to a game action. The engine has no built-in controls.",
    inputs: {},
    outputs: { keybind: { label: "Keybind", dataType: "keybind" } },
    fields: {
      bindingId: { label: "Binding id", type: "text", default: "key_binding", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      action: { label: "Action", type: "select", options: GAME_ACTIONS, default: "move_forward", required: true },
      keyCode: { label: "Key code", type: "keycode", default: "KeyW", required: true, maxLength: 32 }
    }
  },

  ui_hud_text: {
    label: "HUD Text",
    group: "UI",
    accent: "#c9d4dc",
    description: "A data-driven HUD label rendered by the runtime.",
    inputs: {},
    outputs: { ui: { label: "UI", dataType: "ui" } },
    fields: {
      moduleId: { label: "Module id", type: "text", default: "hud_label", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-right", "bottom-left", "bottom-right", "center"], default: "top-left", required: true },
      text: { label: "Text", type: "text", default: "Label", required: true, maxLength: 200 },
      fontSize: { label: "Font size", type: "number", default: 18, min: 8, max: 96, step: 1, required: true },
      color: { label: "Color", type: "color", default: "#ffffff", required: true }
    }
  },

  debug_performance_hud: {
    label: "Performance HUD",
    group: "UI",
    accent: "#e0b15a",
    description: "A diagnostic HUD that reports runtime cost for the published game world.",
    inputs: {},
    outputs: { ui: { label: "UI", dataType: "ui" } },
    fields: {
      hudId: { label: "HUD id", type: "text", default: "perf_hud", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      label: { label: "Label", type: "text", default: "Performance HUD", required: true, maxLength: 96 },
      enabled: { label: "Enabled", type: "boolean", default: true, required: true },
      anchor: { label: "Anchor", type: "select", options: ["top-left", "top-right", "bottom-left", "bottom-right"], default: "top-right", required: true },
      compact: { label: "Compact layout", type: "boolean", default: true, required: true },
      updateIntervalMs: { label: "Update interval (ms)", type: "number", default: 500, min: 250, max: 5000, step: 50, required: true },
      showFps: { label: "Show FPS", type: "boolean", default: true, required: true },
      showFrameMs: { label: "Show frame ms", type: "boolean", default: true, required: true },
      showRenderer: { label: "Show renderer", type: "boolean", default: true, required: true },
      showDrawCalls: { label: "Show draw calls", type: "boolean", default: true, required: true },
      showTriangles: { label: "Show triangles", type: "boolean", default: true, required: true },
      showGeometries: { label: "Show geometries", type: "boolean", default: true, required: true },
      showTextures: { label: "Show textures", type: "boolean", default: true, required: true },
      showSceneObjects: { label: "Show scene objects", type: "boolean", default: true, required: true },
      showEntities: { label: "Show entities", type: "boolean", default: true, required: true },
      showTerrainVisuals: { label: "Show terrain visuals", type: "boolean", default: true, required: true },
      showCollisionShapes: { label: "Show collision shapes", type: "boolean", default: true, required: true },
      showWorldSize: { label: "Show world size", type: "boolean", default: false, required: true },
      fpsTarget: { label: "FPS target", type: "number", default: 60, min: 1, max: 240, step: 1, required: true },
      fpsWarn: { label: "FPS warning", type: "number", default: 45, min: 1, max: 240, step: 1, required: true },
      fpsDanger: { label: "FPS danger", type: "number", default: 30, min: 1, max: 240, step: 1, required: true },
      frameMsTarget: { label: "Frame ms target", type: "number", default: 16.7, min: 1, max: 100, step: 0.1, required: true },
      frameMsWarn: { label: "Frame ms warning", type: "number", default: 22, min: 1, max: 100, step: 0.1, required: true },
      frameMsDanger: { label: "Frame ms danger", type: "number", default: 33, min: 1, max: 100, step: 0.1, required: true },
      drawCallsWarn: { label: "Draw calls warning", type: "number", default: 80, min: 1, max: 10000, step: 1, required: true },
      drawCallsDanger: { label: "Draw calls danger", type: "number", default: 140, min: 1, max: 10000, step: 1, required: true },
      trianglesWarn: { label: "Triangles warning", type: "number", default: 100000, min: 1, max: 100000000, step: 1000, required: true },
      trianglesDanger: { label: "Triangles danger", type: "number", default: 250000, min: 1, max: 100000000, step: 1000, required: true },
      meshesWarn: { label: "Meshes warning", type: "number", default: 50, min: 1, max: 10000, step: 1, required: true },
      meshesDanger: { label: "Meshes danger", type: "number", default: 100, min: 1, max: 10000, step: 1, required: true },
      texturesWarn: { label: "Textures warning", type: "number", default: 24, min: 1, max: 10000, step: 1, required: true },
      texturesDanger: { label: "Textures danger", type: "number", default: 40, min: 1, max: 10000, step: 1, required: true },
      terrainVisualsWarn: { label: "Terrain visuals warning", type: "number", default: 40, min: 1, max: 10000, step: 1, required: true },
      terrainVisualsDanger: { label: "Terrain visuals danger", type: "number", default: 100, min: 1, max: 10000, step: 1, required: true },
      collisionShapesWarn: { label: "Collision shapes warning", type: "number", default: 50, min: 1, max: 10000, step: 1, required: true },
      collisionShapesDanger: { label: "Collision shapes danger", type: "number", default: 150, min: 1, max: 10000, step: 1, required: true }
    }
  },

  group: {
    label: "Group",
    group: "Organize",
    accent: "#8a97a3",
    description: "A typed container with Group Input and Group Output proxies.",
    inputs: {},
    outputs: {},
    container: true,
    fields: {
      groupId: { label: "Group id", type: "text", default: "group", required: true, maxLength: 64, pattern: "^[a-z0-9_:-]+$" },
      title: { label: "Title", type: "text", default: "New Group", required: true, maxLength: 96 },
      groupInterface: { label: "Group interface", type: "json", default: groupInterfaceDefault(), required: true }
    }
  },

  group_input: {
    label: "Group Input",
    group: "Organize",
    accent: "#8be0a8",
    description: "Locked system node that exposes the parent group inputs to the inside of the group.",
    inputs: {},
    outputs: {},
    system: true,
    locked: true,
    hidden: true,
    fields: {}
  },

  group_output: {
    label: "Group Output",
    group: "Organize",
    accent: "#8be0a8",
    description: "Locked system node that collects the internal outputs of the group.",
    inputs: {},
    outputs: {},
    system: true,
    locked: true,
    hidden: true,
    fields: {}
  }
};

export const STARTER_NODES = [
  { id: "node_output", type: "game_output", title: "Game Output", x: 1180, y: 320, parentId: null, values: { publishTarget: "runtime_world" } }
];

export const STARTER_EDGES = [];

export function defaultValuesForType(type) {
  const nodeType = NODE_TYPES[type];
  if (!nodeType) return {};
  return Object.fromEntries(Object.entries(nodeType.fields).map(function (entry) {
    return [entry[0], cloneDefaultValue(entry[1].default === undefined ? null : entry[1].default)];
  }));
}

export function isContainer(type) {
  return Boolean(NODE_TYPES[type] && NODE_TYPES[type].container);
}
