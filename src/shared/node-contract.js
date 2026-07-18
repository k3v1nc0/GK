export const NODE_CONTRACT_VERSION = "gk-node-content-v1";
export const GAME_PROJECT_SCHEMA_VERSION = "gk-game-project-v3";

export const CANONICAL_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/;
export const CANONICAL_TAG_PATTERN = CANONICAL_ID_PATTERN;
export const IDENTITY_VALUE_PATTERN = CANONICAL_ID_PATTERN;

export const REFERENCE_KINDS = Object.freeze([
  "project",
  "item",
  "ability",
  "currency",
  "zone",
  "quest",
  "target",
  "enemy",
  "npc",
  "audio",
  "vfx",
  "policy",
  "spawn",
  "catalog",
  "campaign",
  "player_rules",
  "ui",
  "global",
  "tag",
  "text_template",
  "localization",
  "value",
  "chunk_grid",
  "legacy_world",
  "game_project"
]);

export const STATIC_TOKEN_ROOTS = Object.freeze(["global"]);
export const FUTURE_TOKEN_ROOTS = Object.freeze([
  "item",
  "ability",
  "currency",
  "enemy",
  "npc",
  "zone",
  "quest",
  "target",
  "reward",
  "player",
  "objective",
  "step",
  "dialogue",
  "market",
  "party"
]);
export const TOKEN_CONTEXT_ROOTS = Object.freeze([...STATIC_TOKEN_ROOTS, ...FUTURE_TOKEN_ROOTS]);

export const ALLOWED_FORMULA_OPERATORS = Object.freeze([
  "add",
  "subtract",
  "multiply",
  "divide",
  "min",
  "max",
  "clamp",
  "lt",
  "lte",
  "eq",
  "gte",
  "gt",
  "and",
  "or",
  "not",
  "if"
]);

export const FIELD_TYPES = Object.freeze({
  identity: "identity",
  reference: "reference",
  referenceList: "referenceList",
  tagList: "tagList",
  tagQuery: "tagQuery",
  tokenText: "tokenText",
  formula: "formula",
  localizedText: "localizedText"
});

export const VALIDATION_CODES = Object.freeze({
  FOUNDATION_PROJECT_SETTINGS_MISSING: "FOUNDATION_PROJECT_SETTINGS_MISSING",
  FOUNDATION_CHUNK_GRID_MISSING: "FOUNDATION_CHUNK_GRID_MISSING",
  FOUNDATION_CHUNK_GRID_INVALID: "FOUNDATION_CHUNK_GRID_INVALID",
  FOUNDATION_WORLD_ASSEMBLY_MISSING: "FOUNDATION_WORLD_ASSEMBLY_MISSING",
  FOUNDATION_GAME_PROJECT_NOT_CONNECTED: "FOUNDATION_GAME_PROJECT_NOT_CONNECTED",
  SYMBOL_DUPLICATE_ID: "SYMBOL_DUPLICATE_ID",
  SYMBOL_INVALID_ID: "SYMBOL_INVALID_ID",
  REFERENCE_MISSING: "REFERENCE_MISSING",
  REFERENCE_WRONG_KIND: "REFERENCE_WRONG_KIND",
  TOKEN_PARSE_ERROR: "TOKEN_PARSE_ERROR",
  TOKEN_STATIC_PATH_MISSING: "TOKEN_STATIC_PATH_MISSING",
  TOKEN_CONTEXT_NOT_ALLOWED: "TOKEN_CONTEXT_NOT_ALLOWED",
  GROUP_INTERFACE_INVALID: "GROUP_INTERFACE_INVALID",
  PACKAGE_DUPLICATE_NAMESPACE: "PACKAGE_DUPLICATE_NAMESPACE",
  FORMULA_UNSAFE_OPERATOR: "FORMULA_UNSAFE_OPERATOR",
  FORMULA_TYPE_MISMATCH: "FORMULA_TYPE_MISMATCH",
  GAME_OUTPUT_LEGACY_ONLY: "GAME_OUTPUT_LEGACY_ONLY",
  GAME_OUTPUT_LEGACY_IGNORED: "GAME_OUTPUT_LEGACY_IGNORED",
  GAME_OUTPUT_LEGACY_REROUTED: "GAME_OUTPUT_LEGACY_REROUTED",
  TOKEN_RUNTIME_UNRESOLVED_PREVIEW: "TOKEN_RUNTIME_UNRESOLVED_PREVIEW",
  GLOBAL_VALUE_UNUSED: "GLOBAL_VALUE_UNUSED",
  TAG_UNUSED: "TAG_UNUSED",
  GROUP_PRESET_CUSTOMIZED: "GROUP_PRESET_CUSTOMIZED",
  LEGACY_SCHEMA_FIELD_USED: "LEGACY_SCHEMA_FIELD_USED"
});

function safeLower(value) {
  return String(value === null || value === undefined ? "" : value)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function trimSeparators(value) {
  return String(value || "").replace(/^[._:-]+|[._:-]+$/g, "");
}

function collapseSeparatorRuns(value) {
  return String(value || "").replace(/([._:-])[._:-]+/g, "$1");
}

export function isCanonicalId(value) {
  return typeof value === "string" && CANONICAL_ID_PATTERN.test(value);
}

export function normalizeCanonicalId(value, fallback = "") {
  const raw = safeLower(value).replace(/[^a-z0-9._:-]+/g, ".");
  let normalized = collapseSeparatorRuns(raw);
  normalized = trimSeparators(normalized);
  if (!normalized || !/^[a-z]/.test(normalized)) {
    normalized = trimSeparators(collapseSeparatorRuns(safeLower(fallback).replace(/[^a-z0-9._:-]+/g, ".")));
  }
  if (!normalized || !/^[a-z]/.test(normalized)) return "";
  if (!CANONICAL_ID_PATTERN.test(normalized)) {
    const pieces = normalized.split(/[._:-]+/g).filter(Boolean);
    if (!pieces.length) return "";
    normalized = pieces.join(".");
  }
  return CANONICAL_ID_PATTERN.test(normalized) ? normalized : "";
}

export function isCanonicalTag(value) {
  return typeof value === "string" && CANONICAL_TAG_PATTERN.test(value);
}

export function normalizeCanonicalTag(value, fallback = "") {
  return normalizeCanonicalId(value, fallback);
}

export function normalizeIdList(values) {
  const result = [];
  const seen = new Set();
  for (const entry of Array.isArray(values) ? values : []) {
    const id = normalizeCanonicalId(entry);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function normalizeReferenceList(values) {
  return normalizeIdList(values);
}

export function normalizeTagList(values) {
  return normalizeIdList(values);
}

export function normalizeTagQuery(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    all: normalizeTagList(source.all),
    any: normalizeTagList(source.any),
    none: normalizeTagList(source.none)
  };
}

export function normalizeReferenceKind(value) {
  const kind = safeLower(value);
  return REFERENCE_KINDS.includes(kind) ? kind : "";
}

export function isKnownReferenceKind(value) {
  return Boolean(normalizeReferenceKind(value));
}

export function tokenRootScope(root) {
  const normalized = safeLower(root);
  if (STATIC_TOKEN_ROOTS.includes(normalized)) return "static";
  if (FUTURE_TOKEN_ROOTS.includes(normalized)) return "runtime";
  return "unknown";
}

export function isStaticTokenRoot(root) {
  return tokenRootScope(root) === "static";
}

export function isRuntimeTokenRoot(root) {
  return tokenRootScope(root) === "runtime";
}

export function isSafeTokenPathSegment(segment) {
  return typeof segment === "string" && /^[a-z0-9_:-]+$/i.test(segment) && !/^\d+$/.test(segment) && !/^[._:-]+$/.test(segment);
}

export function normalizeTokenPathSegments(value) {
  const segments = Array.isArray(value)
    ? value
    : String(value === null || value === undefined ? "" : value).split(".");
  return segments.map(function (segment) {
    return safeLower(segment);
  }).filter(Boolean);
}

export function isAllowedFormulaOperator(operator) {
  return ALLOWED_FORMULA_OPERATORS.includes(safeLower(operator));
}

export function canonicalJsonValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (typeof value !== "object") return value;
  const keys = Object.keys(value).sort();
  const output = {};
  for (const key of keys) {
    const next = canonicalJsonValue(value[key]);
    if (next === undefined) continue;
    output[key] = next;
  }
  return output;
}

export function canonicalJsonStringify(value) {
  return JSON.stringify(canonicalJsonValue(value));
}

export function deepCloneJson(value) {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === "function") {
    try { return structuredClone(value); } catch {}
  }
  return JSON.parse(JSON.stringify(value));
}

export function stringifyCanonicalList(values) {
  return normalizeIdList(values).join(",");
}
