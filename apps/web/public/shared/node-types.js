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

const MULTI_VALUE_TYPES = new Set(["light", "entity", "interactable", "keybind", "ui"]);

export function dataTypeColor(dataType) {
  return DATA_TYPE_COLORS[dataType] || "#6b7d8d";
}

export function isMultiValueDataType(dataType) {
  return MULTI_VALUE_TYPES.has(dataType);
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
