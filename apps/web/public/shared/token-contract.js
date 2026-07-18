import {
  ALLOWED_FORMULA_OPERATORS,
  FUTURE_TOKEN_ROOTS,
  STATIC_TOKEN_ROOTS,
  canonicalJsonStringify,
  isAllowedFormulaOperator,
  isSafeTokenPathSegment,
  normalizeTokenPathSegments,
  tokenRootScope
} from "./node-contract.js";

function safeString(value) {
  return String(value === null || value === undefined ? "" : value);
}

function safeLower(value) {
  return safeString(value).trim().toLowerCase();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringifyResolvedValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return value.map(stringifyResolvedValue).join(", ");
  if (isPlainObject(value)) {
    if (typeof value.text === "string") return value.text;
    if (typeof value.label === "string") return value.label;
    if (typeof value.value === "string" || typeof value.value === "number" || typeof value.value === "boolean") return String(value.value);
    try { return canonicalJsonStringify(value); } catch { return "[object]"; }
  }
  return String(value);
}

function placeholderText(path, prefix = "missing") {
  const text = Array.isArray(path) && path.length ? path.join(".") : "token";
  return "‹" + prefix + ":" + text + "›";
}

function safeReadPath(source, pathSegments) {
  let current = source;
  for (const segment of Array.isArray(pathSegments) ? pathSegments : []) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
      continue;
    }
    if (typeof current !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = current[segment];
  }
  return current;
}

function stringifyTokenValue(value) {
  return stringifyResolvedValue(value);
}

export function parseTokenText(text, options = {}) {
  const input = safeString(text);
  const tokens = [];
  const errors = [];
  let cursor = 0;
  while (cursor < input.length) {
    const start = input.indexOf("@{", cursor);
    if (start === -1) {
      if (cursor < input.length) tokens.push({ type: "text", value: input.slice(cursor) });
      break;
    }
    if (start > cursor) {
      tokens.push({ type: "text", value: input.slice(cursor, start) });
    }
    const end = input.indexOf("}", start + 2);
    if (end === -1) {
      const raw = input.slice(start);
      tokens.push({ type: "token", raw: raw, scope: "unknown", path: [], expectedType: "text" });
      errors.push({
        code: "TOKEN_PARSE_ERROR",
        message: "Token mist een sluitende }.",
        raw: raw
      });
      break;
    }
    const body = input.slice(start + 2, end).trim();
    const raw = input.slice(start, end + 1);
    const path = normalizeTokenPathSegments(body);
    const root = path[0] || "";
    const scope = tokenRootScope(root);
    if (!body) {
      errors.push({
        code: "TOKEN_PARSE_ERROR",
        message: "Token mag niet leeg zijn.",
        raw: raw
      });
    }
    if (!path.length) {
      errors.push({
        code: "TOKEN_PARSE_ERROR",
        message: "Token bevat geen geldig pad.",
        raw: raw
      });
    }
    for (const segment of path) {
      if (!isSafeTokenPathSegment(segment)) {
        errors.push({
          code: "TOKEN_PARSE_ERROR",
          message: "Token segment is onveilig: " + segment + ".",
          raw: raw
        });
        break;
      }
    }
    if (scope === "unknown") {
      errors.push({
        code: "TOKEN_CONTEXT_NOT_ALLOWED",
        message: "Onbekende tokenroot: " + root + ".",
        raw: raw
      });
    } else if (scope === "runtime" && options.staticContextOnly === true) {
      errors.push({
        code: "TOKEN_CONTEXT_NOT_ALLOWED",
        message: "Runtime tokenroot is niet toegestaan in een statische preview: " + root + ".",
        raw: raw
      });
    }
    tokens.push({
      type: "token",
      raw: raw,
      scope: scope,
      path: path,
      root: root,
      expectedType: options.expectedType || "text"
    });
    cursor = end + 1;
  }
  return { segments: tokens, errors: errors };
}

function defaultLookupSymbol(symbolId, context = {}) {
  if (!symbolId) return null;
  const symbols = context.symbols;
  if (symbols && typeof symbols === "object") {
    if (symbols.byId && Object.prototype.hasOwnProperty.call(symbols.byId, symbolId)) return symbols.byId[symbolId];
    if (Object.prototype.hasOwnProperty.call(symbols, symbolId)) return symbols[symbolId];
  }
  if (context.symbolIndex && context.symbolIndex.byId && Object.prototype.hasOwnProperty.call(context.symbolIndex.byId, symbolId)) {
    return context.symbolIndex.byId[symbolId];
  }
  return null;
}

function resolveSymbolRecord(pathSegments, context = {}, options = {}) {
  const lookupSymbol = typeof options.lookupSymbol === "function" ? options.lookupSymbol : defaultLookupSymbol;
  const segments = Array.isArray(pathSegments) ? pathSegments : [];
  for (let size = segments.length; size >= 1; size -= 1) {
    const symbolId = segments.slice(0, size).join(".");
    const symbol = lookupSymbol(symbolId, context);
    if (symbol) {
      return {
        symbol: symbol,
        symbolId: symbolId,
        propertyPath: segments.slice(size)
      };
    }
  }
  return { symbol: null, symbolId: null, propertyPath: segments.slice() };
}

function resolveContextPath(pathSegments, context = {}, options = {}) {
  const root = pathSegments[0] || "";
  const scope = tokenRootScope(root);
  if (scope === "unknown") {
    return {
      ok: false,
      code: "TOKEN_CONTEXT_NOT_ALLOWED",
      message: "Onbekende tokenroot: " + root + ".",
      value: undefined,
      scope: scope
    };
  }
  if (scope === "runtime" && options.staticContextOnly === true) {
    return {
      ok: false,
      code: "TOKEN_CONTEXT_NOT_ALLOWED",
      message: "Runtime tokenroot is niet toegestaan in een statische preview: " + root + ".",
      value: undefined,
      scope: scope
    };
  }
  const resolution = resolveSymbolRecord(pathSegments, context, options);
  if (resolution.symbol) {
    const base = isPlainObject(resolution.symbol) && Object.prototype.hasOwnProperty.call(resolution.symbol, "value")
      ? resolution.symbol.value
      : resolution.symbol;
    const value = resolution.propertyPath.length
      ? safeReadPath(base, resolution.propertyPath)
      : base;
    if (value !== undefined) {
      return {
        ok: true,
        scope: scope,
        symbolId: resolution.symbolId,
        value: value,
        propertyPath: resolution.propertyPath,
        symbol: resolution.symbol
      };
    }
  }
  const fallbackRoot = scope === "static" ? context.static : context.runtime;
  const fallback = fallbackRoot && typeof fallbackRoot === "object"
    ? safeReadPath(fallbackRoot, pathSegments)
    : undefined;
  if (fallback !== undefined) {
    return {
      ok: true,
      scope: scope,
      value: fallback,
      symbol: resolution.symbol || null,
      symbolId: resolution.symbolId || null,
      propertyPath: resolution.propertyPath
    };
  }
  return {
    ok: false,
    scope: scope,
    code: scope === "static" ? "TOKEN_STATIC_PATH_MISSING" : "TOKEN_RUNTIME_UNRESOLVED_PREVIEW",
    message: scope === "static"
      ? "Onbekende statische token: " + pathSegments.join(".") + "."
      : "Runtime token kon niet worden geresolved: " + pathSegments.join(".") + ".",
    value: undefined,
    symbolId: resolution.symbolId || null,
    propertyPath: resolution.propertyPath
  };
}

export function resolveTokenText(text, context = {}, options = {}) {
  const parsed = parseTokenText(text, options);
  const warnings = [];
  const errors = parsed.errors.slice();
  const pieces = [];
  for (const segment of parsed.segments) {
    if (segment.type === "text") {
      pieces.push(segment.value);
      continue;
    }
    const resolution = resolveContextPath(segment.path, context, options);
    if (resolution.ok) {
      pieces.push(stringifyTokenValue(resolution.value));
      continue;
    }
    const prefix = resolution.scope === "runtime" ? "missing-runtime" : "missing";
    pieces.push(placeholderText(segment.path, prefix));
    const item = {
      code: resolution.code || "TOKEN_RUNTIME_UNRESOLVED_PREVIEW",
      message: resolution.message || "Token kon niet worden geresolved.",
      raw: segment.raw,
      path: segment.path.slice()
    };
    if (resolution.scope === "static") errors.push(item);
    else warnings.push(item);
  }
  return {
    text: pieces.join(""),
    segments: parsed.segments,
    errors: errors,
    warnings: warnings,
    tokens: parsed.segments.filter(function (segment) { return segment.type === "token"; })
  };
}

export function previewTokenText(text, options = {}) {
  return resolveTokenText(text, options.context || {}, options);
}

function normalizeLiteralValue(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const numeric = Number(trimmed);
    if (trimmed !== "" && Number.isFinite(numeric) && String(numeric) === trimmed.replace(/^\+/, "")) return numeric;
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    return trimmed;
  }
  return value;
}

function formulaError(code, message, path = []) {
  return { code: code, message: message, path: Array.isArray(path) ? path.slice() : [] };
}

function normalizeFormulaNode(expression) {
  if (expression === null || expression === undefined) return null;
  if (typeof expression !== "object") {
    return { type: "literal", value: normalizeLiteralValue(expression) };
  }
  if (Array.isArray(expression)) {
    return { type: "list", items: expression.map(normalizeFormulaNode) };
  }
  const operator = safeLower(expression.operator || expression.op || "");
  if (operator) {
    return {
      type: "operator",
      operator: operator,
      operands: Array.isArray(expression.operands)
        ? expression.operands.map(normalizeFormulaNode)
        : Array.isArray(expression.args)
          ? expression.args.map(normalizeFormulaNode)
          : [],
      whenTrue: normalizeFormulaNode(expression.whenTrue),
      whenFalse: normalizeFormulaNode(expression.whenFalse),
      value: normalizeFormulaNode(expression.value),
      min: normalizeFormulaNode(expression.min),
      max: normalizeFormulaNode(expression.max)
    };
  }
  if (Object.prototype.hasOwnProperty.call(expression, "value")) {
    return { type: "literal", value: normalizeLiteralValue(expression.value) };
  }
  if (Object.prototype.hasOwnProperty.call(expression, "reference")) {
    return { type: "reference", reference: safeString(expression.reference) };
  }
  if (Object.prototype.hasOwnProperty.call(expression, "path")) {
    return { type: "path", path: normalizeTokenPathSegments(expression.path) };
  }
  return { type: "object", value: canonicalJsonStringify(expression) };
}

export function validateFormulaExpression(expression, options = {}) {
  const errors = [];
  const normalized = normalizeFormulaNode(expression);
  function walk(node, path = []) {
    if (!node) return;
    if (node.type === "operator") {
      if (!isAllowedFormulaOperator(node.operator)) {
        errors.push(formulaError("FORMULA_UNSAFE_OPERATOR", "Operator is niet toegestaan: " + node.operator + ".", path));
      }
      for (const operand of node.operands || []) walk(operand, path.concat("operands"));
      if (node.whenTrue) walk(node.whenTrue, path.concat("whenTrue"));
      if (node.whenFalse) walk(node.whenFalse, path.concat("whenFalse"));
      if (node.value) walk(node.value, path.concat("value"));
      if (node.min) walk(node.min, path.concat("min"));
      if (node.max) walk(node.max, path.concat("max"));
      return;
    }
    if (node.type === "list") {
      for (const item of node.items || []) walk(item, path.concat("items"));
      return;
    }
    if (node.type === "path") {
      if (!node.path.length) errors.push(formulaError("FORMULA_TYPE_MISMATCH", "Pad mag niet leeg zijn.", path));
      for (const segment of node.path) {
        if (!isSafeTokenPathSegment(segment)) {
          errors.push(formulaError("FORMULA_UNSAFE_OPERATOR", "Onveilig padsegment: " + segment + ".", path));
        }
      }
    }
  }
  walk(normalized, []);
  return { ok: errors.length === 0, errors: errors, normalized: normalized };
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function truthy(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.trim() !== "" && value !== "false" && value !== "0";
  return Boolean(value);
}

function resolveFormulaNode(node, context = {}, options = {}) {
  if (!node) return null;
  if (node.type === "literal") return node.value;
  if (node.type === "reference") {
    const source = options.lookupReference ? options.lookupReference(node.reference, context, options) : safeReadPath(context, node.reference.split("."));
    return source;
  }
  if (node.type === "path") {
    return safeReadPath(context, node.path);
  }
  if (node.type === "list") {
    return (node.items || []).map(function (item) { return resolveFormulaNode(item, context, options); });
  }
  if (node.type !== "operator") return node.value;
  const operator = node.operator;
  const values = (node.operands || []).map(function (operand) {
    return resolveFormulaNode(operand, context, options);
  });
  switch (operator) {
    case "add":
      return values.reduce(function (sum, value) { return sum + toNumber(value, 0); }, 0);
    case "subtract":
      return values.length ? values.slice(1).reduce(function (sum, value) { return sum - toNumber(value, 0); }, toNumber(values[0], 0)) : 0;
    case "multiply":
      return values.reduce(function (product, value) { return product * toNumber(value, 1); }, 1);
    case "divide":
      return values.length ? values.slice(1).reduce(function (result, value) {
        const divisor = toNumber(value, 1);
        return divisor === 0 ? result : result / divisor;
      }, toNumber(values[0], 0)) : 0;
    case "min":
      return values.length ? Math.min(...values.map(function (value) { return toNumber(value, 0); })) : 0;
    case "max":
      return values.length ? Math.max(...values.map(function (value) { return toNumber(value, 0); })) : 0;
    case "clamp": {
      const value = toNumber(values[0], 0);
      const min = node.min ? toNumber(resolveFormulaNode(node.min, context, options), value) : value;
      const max = node.max ? toNumber(resolveFormulaNode(node.max, context, options), value) : value;
      return Math.min(max, Math.max(min, value));
    }
    case "lt":
      return toNumber(values[0], 0) < toNumber(values[1], 0);
    case "lte":
      return toNumber(values[0], 0) <= toNumber(values[1], 0);
    case "eq":
      return values[0] === values[1];
    case "gte":
      return toNumber(values[0], 0) >= toNumber(values[1], 0);
    case "gt":
      return toNumber(values[0], 0) > toNumber(values[1], 0);
    case "and":
      return values.every(truthy);
    case "or":
      return values.some(truthy);
    case "not":
      return !truthy(values[0]);
    case "if":
      return truthy(values[0]) ? resolveFormulaNode(node.whenTrue, context, options) : resolveFormulaNode(node.whenFalse, context, options);
    default:
      return undefined;
  }
}

export function evaluateFormulaExpression(expression, context = {}, options = {}) {
  const validation = validateFormulaExpression(expression, options);
  if (!validation.ok) {
    return { ok: false, value: null, errors: validation.errors, normalized: validation.normalized };
  }
  const value = resolveFormulaNode(validation.normalized, context, options);
  return {
    ok: true,
    value: value,
    errors: [],
    normalized: validation.normalized
  };
}

export { STATIC_TOKEN_ROOTS, FUTURE_TOKEN_ROOTS, ALLOWED_FORMULA_OPERATORS };

