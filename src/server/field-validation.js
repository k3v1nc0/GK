import { NODE_TYPES, defaultValuesForType, normalizeGroupInterface } from "../shared/node-types.js";

function isEmpty(value) {
  return value === null || value === undefined || value === "";
}

function fieldName(label, key) {
  return label + "." + key;
}

const KEYCODE_PATTERN = /^[A-Za-z0-9]+$/;

function fieldDefault(field) {
  return field.default === undefined ? null : field.default;
}

function isKnownDataType(dataType) {
  return Object.values(NODE_TYPES).some(function (definition) {
    const inputs = Object.values(definition.inputs || {});
    const outputs = Object.values(definition.outputs || {});
    return inputs.some(function (candidate) { return candidate.dataType === dataType; }) ||
      outputs.some(function (candidate) { return candidate.dataType === dataType; });
  });
}

export function coerceAndValidateField(field, value, label) {
  const errors = [];
  let clean = value;
  if (field.type === "number") {
    if (isEmpty(value)) {
      clean = fieldDefault(field);
    } else {
      clean = Number(value);
      if (!Number.isFinite(clean)) errors.push(label + " moet een geldig nummer zijn.");
      if (Number.isFinite(clean) && field.min !== undefined && clean < field.min) errors.push(label + " is lager dan " + field.min + ".");
      if (Number.isFinite(clean) && field.max !== undefined && clean > field.max) errors.push(label + " is hoger dan " + field.max + ".");
    }
  } else if (field.type === "boolean") {
    if (isEmpty(value)) {
      clean = Boolean(fieldDefault(field));
    } else {
      clean = value === true || value === "true" || value === 1 || value === "1";
    }
  } else if (field.type === "json") {
    if (isEmpty(value)) {
      clean = fieldDefault(field);
    } else if (typeof value === "object") {
      clean = JSON.parse(JSON.stringify(value));
    } else {
      try { clean = JSON.parse(String(value)); } catch { errors.push(label + " moet geldige JSON zijn."); }
    }
  } else {
    clean = isEmpty(value) ? fieldDefault(field) : String(value).trim();
    if (clean && field.maxLength && clean.length > field.maxLength) errors.push(label + " is langer dan " + field.maxLength + " tekens.");
    if (clean && field.pattern && !(new RegExp(field.pattern).test(clean))) errors.push(label + " heeft een ongeldig formaat.");
    if (clean && field.type === "color" && !/^#[0-9a-fA-F]{6}$/.test(clean)) errors.push(label + " moet een hex kleur zijn, bijvoorbeeld #ffffff.");
    if (clean && field.type === "asset" && !/^asset_[a-f0-9-]+$/.test(clean)) errors.push(label + " moet een asset id zijn.");
    if (clean && field.type === "keycode" && !KEYCODE_PATTERN.test(clean)) errors.push(label + " moet een toetscode zijn zoals KeyW, ArrowUp of Space.");
    if (clean && field.type === "select" && !field.options.includes(clean)) errors.push(label + " heeft een onbekende optie.");
  }
  if (field.required && isEmpty(clean)) errors.push(label + " is verplicht.");
  return { value: clean, errors };
}

export function validateNodeValues(type, values, nodeTypes = NODE_TYPES) {
  const definition = nodeTypes[type];
  if (!definition) return { values: {}, errors: ["Onbekend node-type: " + type + "."] };
  const cleaned = {};
  const errors = [];
  for (const [key, field] of Object.entries(definition.fields)) {
    const result = coerceAndValidateField(field, values?.[key], fieldName(definition.label, key));
    cleaned[key] = result.value;
    errors.push.apply(errors, result.errors);
  }
  if (type === "group") {
    cleaned.groupInterface = normalizeGroupInterface(cleaned.groupInterface);
    const seen = new Set();
    const allPorts = [
      ...cleaned.groupInterface.inputs.map(function (port) { return Object.assign({ direction: "input" }, port); }),
      ...cleaned.groupInterface.outputs.map(function (port) { return Object.assign({ direction: "output" }, port); })
    ];
    for (const port of allPorts) {
      if (typeof port.name !== "string" || !/^[a-z0-9_:-]+$/.test(port.name)) {
        errors.push("Group interface poortnaam " + port.name + " heeft een ongeldig formaat.");
        continue;
      }
      if (!isKnownDataType(port.dataType)) {
        errors.push("Group interface poort " + port.name + " gebruikt een onbekend datatype: " + port.dataType + ".");
      }
      if (seen.has(port.name)) {
        errors.push("Group interface heeft dubbele poortnaam: " + port.name + ".");
      }
      seen.add(port.name);
    }
  }
  return { values: cleaned, errors };
}

export function cleanValuesForType(type, nextValues, previousValues = {}, nodeTypes = NODE_TYPES) {
  const baseValues = Object.assign({}, defaultValuesForType(type), previousValues || {}, nextValues || {});
  return validateNodeValues(type, baseValues, nodeTypes).values;
}
