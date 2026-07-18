import {
  isCanonicalId,
  isCanonicalTag,
  normalizeCanonicalId,
  normalizeCanonicalTag,
  normalizeReferenceKind,
  normalizeReferenceList,
  normalizeTagList,
  normalizeTagQuery
} from "./node-contract.js";

function safeString(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

export function referenceKindFromId(referenceId) {
  const canonical = normalizeCanonicalId(referenceId);
  if (!canonical) return "";
  return canonical.split(".")[0] || "";
}

export function referenceMatchesKinds(referenceId, expectedKinds) {
  const kind = normalizeReferenceKind(referenceKindFromId(referenceId));
  const list = Array.isArray(expectedKinds) ? expectedKinds.map(normalizeReferenceKind).filter(Boolean) : [];
  if (!list.length) return Boolean(kind);
  return Boolean(kind && list.includes(kind));
}

export function normalizeReferenceValue(value) {
  return normalizeCanonicalId(value);
}

export function normalizeReferenceValues(values) {
  return normalizeReferenceList(values);
}

export function normalizeTagValues(values) {
  return normalizeTagList(values);
}

export function normalizeTagQueryValue(value) {
  return normalizeTagQuery(value);
}

export function referenceDisplayLabel(symbol) {
  if (!symbol) return "";
  const id = safeString(symbol.id || symbol.referenceId || symbol.value || "");
  const label = safeString(symbol.label || symbol.displayName || symbol.name || "");
  if (!id && !label) return "";
  if (!label) return "@" + id;
  if (!id) return label;
  return label + " @" + id;
}

export function referenceChipLabel(referenceId) {
  const canonical = normalizeCanonicalId(referenceId);
  return canonical ? "@" + canonical : "";
}

export function tagChipLabel(tag) {
  const canonical = normalizeCanonicalTag(tag);
  return canonical ? "#" + canonical : "";
}

export function buildReferenceSearchTerms(symbol) {
  if (!symbol || typeof symbol !== "object") return [];
  const terms = new Set();
  for (const value of [
    symbol.id,
    symbol.label,
    symbol.displayName,
    symbol.kind,
    symbol.nodeType,
    ...(Array.isArray(symbol.tags) ? symbol.tags : []),
    ...(Array.isArray(symbol.aliases) ? symbol.aliases : [])
  ]) {
    const text = safeString(value);
    if (!text) continue;
    terms.add(text.toLowerCase());
  }
  return Array.from(terms);
}

export function referenceMatchesQuery(symbol, query = "") {
  const needle = safeString(query).toLowerCase();
  if (!needle) return true;
  return buildReferenceSearchTerms(symbol).some(function (term) {
    return term.includes(needle);
  });
}

export function referenceMatchesKindAndParent(symbol, options = {}) {
  if (!symbol) return false;
  const expectedKinds = Array.isArray(options.expectedKinds)
    ? options.expectedKinds.map(normalizeReferenceKind).filter(Boolean)
    : [];
  if (expectedKinds.length && !expectedKinds.includes(normalizeReferenceKind(symbol.kind))) return false;
  if (options.parentId && symbol.parentId !== options.parentId) return false;
  return true;
}

export function referencePickerSort(left, right) {
  const leftLabel = String(left?.label || left?.displayName || left?.id || "").toLowerCase();
  const rightLabel = String(right?.label || right?.displayName || right?.id || "").toLowerCase();
  if (leftLabel !== rightLabel) return leftLabel < rightLabel ? -1 : 1;
  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

export { isCanonicalId, isCanonicalTag };

