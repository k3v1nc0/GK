import { NODE_TYPES, defaultValuesForType, groupInterfaceDefault, groupInterfacePresetForKind, normalizeGroupInterface, normalizeGroupKind } from "../shared/node-types.js";
import { referenceKindFromId, referenceMatchesKinds } from "../shared/reference-utils.js";
import { parseTokenText, validateFormulaExpression } from "../shared/token-contract.js";
import { isCanonicalId, isCanonicalTag, normalizeCanonicalId, normalizeCanonicalTag, normalizeTagQuery, normalizeReferenceList, normalizeTagList } from "../shared/node-contract.js";

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

function fieldOptionValue(option) {
  if (option && typeof option === "object") {
    return option.value === undefined || option.value === null ? "" : String(option.value);
  }
  return option === undefined || option === null ? "" : String(option);
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
  if (field.locked === true || field.readOnly === true) {
    clean = fieldDefault(field);
    if (!isEmpty(value) && JSON.stringify(clean) !== JSON.stringify(value)) {
      errors.push(label + " is vergrendeld en kan niet worden aangepast.");
    }
  } else if (field.type === "identity") {
    clean = isEmpty(value) ? fieldDefault(field) : normalizeCanonicalId(value, fieldDefault(field));
    if (clean && !isCanonicalId(clean)) errors.push(label + " heeft een ongeldig formaat.");
    if (clean && field.maxLength && clean.length > field.maxLength) errors.push(label + " is langer dan " + field.maxLength + " tekens.");
    if (clean && field.pattern && !(new RegExp(field.pattern).test(clean))) errors.push(label + " heeft een ongeldig formaat.");
  } else if (field.type === "reference") {
    clean = isEmpty(value) ? (field.allowNull === true ? null : fieldDefault(field)) : normalizeCanonicalId(value, fieldDefault(field));
    if (!isEmpty(clean) && !isCanonicalId(clean)) errors.push(label + " heeft een ongeldig formaat.");
    if (!isEmpty(clean) && field.referenceKinds && Array.isArray(field.referenceKinds) && field.referenceKinds.length && !referenceMatchesKinds(clean, field.referenceKinds)) {
      errors.push(label + " verwacht een verwijzing van type " + field.referenceKinds.join(", ") + ".");
    }
    if (isEmpty(clean) && field.required && field.allowNull !== true) errors.push(label + " is verplicht.");
  } else if (field.type === "referenceList") {
    const list = normalizeReferenceList(isEmpty(value) ? fieldDefault(field) : (Array.isArray(value) ? value : String(value).split(/[,\n]/g)));
    clean = list;
    const expectedKinds = Array.isArray(field.referenceKinds) ? field.referenceKinds.map(function (kind) { return String(kind || "").trim().toLowerCase(); }).filter(Boolean) : [];
    for (const entry of list) {
      if (!isCanonicalId(entry)) errors.push(label + " bevat een ongeldige reference: " + entry + ".");
      if (expectedKinds.length && !referenceMatchesKinds(entry, expectedKinds)) {
        errors.push(label + " verwacht references van type " + expectedKinds.join(", ") + ".");
      }
    }
  } else if (field.type === "tagList") {
    const list = normalizeTagList(isEmpty(value) ? fieldDefault(field) : (Array.isArray(value) ? value : String(value).split(/[,\n]/g)));
    clean = list;
    for (const entry of list) {
      if (!isCanonicalTag(entry)) errors.push(label + " bevat een ongeldige tag: " + entry + ".");
    }
  } else if (field.type === "tagQuery") {
    clean = normalizeTagQuery(isEmpty(value) ? fieldDefault(field) : value);
    const all = new Set(clean.all);
    const any = new Set(clean.any);
    const none = new Set(clean.none);
    for (const tag of all) {
      if (none.has(tag)) errors.push(label + " mag tag " + tag + " niet tegelijk in ALL en NONE bevatten.");
    }
    for (const tag of any) {
      if (none.has(tag)) errors.push(label + " mag tag " + tag + " niet tegelijk in ANY en NONE bevatten.");
    }
  } else if (field.type === "tokenText") {
    clean = isEmpty(value) ? fieldDefault(field) : String(value);
    if (clean && field.maxLength && clean.length > field.maxLength) errors.push(label + " is langer dan " + field.maxLength + " tekens.");
    const parsed = parseTokenText(clean, { staticContextOnly: field.allowRuntimeTokens !== true });
    for (const issue of parsed.errors || []) errors.push(label + ": " + issue.message);
  } else if (field.type === "formula") {
    if (isEmpty(value)) {
      clean = fieldDefault(field);
    } else if (typeof value === "object") {
      clean = JSON.parse(JSON.stringify(value));
    } else {
      try { clean = JSON.parse(String(value)); } catch { errors.push(label + " moet geldige JSON zijn."); }
    }
    if (clean !== null && clean !== undefined) {
      const validation = validateFormulaExpression(clean, {});
      for (const issue of validation.errors || []) errors.push(label + ": " + issue.message);
    }
  } else if (field.type === "localizedText") {
    if (isEmpty(value)) {
      clean = fieldDefault(field);
    } else if (typeof value === "string") {
      clean = { key: normalizeCanonicalId(value, ""), fallbackText: "" };
    } else if (value && typeof value === "object") {
      clean = {
        key: normalizeCanonicalId(value.key, ""),
        fallbackText: isEmpty(value.fallbackText) ? "" : String(value.fallbackText)
      };
    } else {
      errors.push(label + " heeft een ongeldig formaat.");
      clean = fieldDefault(field);
    }
    if (clean && clean.key && !isCanonicalId(clean.key)) errors.push(label + " heeft een ongeldige sleutel.");
  } else if (field.type === "number") {
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
    if (clean && field.type === "select" && !field.dynamicOptions && Array.isArray(field.options) && !field.options.map(fieldOptionValue).includes(clean)) {
      errors.push(label + " heeft een onbekende optie.");
    }
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
    cleaned.groupKind = normalizeGroupKind(cleaned.groupKind);
    const preset = groupInterfacePresetForKind(cleaned.groupKind);
    const currentInterface = normalizeGroupInterface(cleaned.groupInterface);
    const defaultInterface = normalizeGroupInterface(preset);
    const genericInterface = normalizeGroupInterface(groupInterfaceDefault());
    const looksGeneric = JSON.stringify(currentInterface) === JSON.stringify(genericInterface);
    cleaned.groupInterface = currentInterface && currentInterface.inputs && currentInterface.outputs
      ? ((cleaned.groupKind === "generic" || !looksGeneric) ? currentInterface : defaultInterface)
      : defaultInterface;
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
