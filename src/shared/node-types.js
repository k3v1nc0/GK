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
      ui: { label: "UI", dataType: "ui", required: false, multiple: true }
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
      x: { label: "X", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      y: { label: "Y", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      z: { label: "Z", type: "number", default: 0, min: -10000, max: 10000, step: 0.01, required: true },
      rotationY: { label: "Rotation Y", type: "number", default: 0, min: -360, max: 360, step: 0.1, required: true },
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
